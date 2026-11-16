import Foundation
import Capacitor
import CryptoKit
import EventKit
import UIKit
import UserNotifications

/// iPhone のカレンダー（EventKit）と共有シートを JS へ橋渡しするプラグイン。
/// 契約は design/DESIGN.md 第7版 §7。予定のタイトル・メモなどはログへ出さない。
@objc(DuoNativePlugin)
public class DuoNativePlugin: CAPPlugin, CAPBridgedPlugin, NotificationHandlerProtocol {
    public let identifier = "DuoNativePlugin"
    public let jsName = "DuoNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openInCalendar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifyPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifySync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyTest", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    // EventKit の処理は直列化する（UIKit の処理は main）。
    private let queue = DispatchQueue(label: "app.duo.calendar.eventkit")
    private var storeObserver: NSObjectProtocol?
    // 通知の予約は専用の直列キューで、完了まで次の処理を進めない。
    private let notifyQueue = DispatchQueue(label: "app.duo.calendar.notify")
    private var timeObservers: [NSObjectProtocol] = []
    private static let notifyPrefix = "duo."
    private static let notifyTestId = "duo.test"
    private static let notifyMax = 60

    private static let createdKeyV1 = "duo.native.created.v1"
    private static let createdKey = "duo.native.created.v2"
    private static let createdMax = 500
    private static let urlPrefix = "duo-calendar://created/"
    private static let fallbackColor = "#68716a"
    private static let maxShareBytes = 10 * 1024 * 1024

    public override func load() {
        storeObserver = NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged,
            object: store,
            queue: nil
        ) { [weak self] _ in
            // 通知に予定の内容は載せない。
            self?.notifyListeners("calendarChanged", data: [:])
        }
        // ローカル通知のタップ・前面表示は Capacitor の router 経由で受ける（delegate は増やさない）。
        bridge?.notificationRouter.localNotificationHandler = self
        // 作成記録 v1 の移行は起動時にも EventKit の直列 queue へ投入する（権限は要らない）。
        migrateCreatedAsync()
        let nc = NotificationCenter.default
        timeObservers = [
            nc.addObserver(forName: .NSSystemTimeZoneDidChange, object: nil, queue: nil) { [weak self] _ in
                self?.notifyListeners("timeChanged", data: ["reason": "timeZone"])
            },
            nc.addObserver(forName: UIApplication.significantTimeChangeNotification, object: nil, queue: nil) { [weak self] _ in
                self?.notifyListeners("timeChanged", data: ["reason": "significant"])
            }
        ]
    }

    deinit {
        if let observer = storeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        for o in timeObservers { NotificationCenter.default.removeObserver(o) }
        if bridge?.notificationRouter.localNotificationHandler === self {
            bridge?.notificationRouter.localNotificationHandler = nil
        }
    }

    // MARK: - 権限

    private func statusString() -> String {
        let s = EKEventStore.authorizationStatus(for: .event)
        switch s {
        case .notDetermined:
            return "notDetermined"
        case .restricted:
            return "restricted"
        case .denied:
            return "denied"
        case .authorized:
            return "granted"
        default:
            // iOS 17 で追加された .fullAccess / .writeOnly は #available の内側で比較する。
            if #available(iOS 17.0, *) {
                if s == .fullAccess { return "granted" }
                if s == .writeOnly { return "writeOnly" }
            }
            return "denied"
        }
    }

    /// 読み取りに必要なフルアクセスがなければ reject して false を返す。
    private func ensureAccess(_ call: CAPPluginCall) -> Bool {
        switch statusString() {
        case "granted":
            return true
        case "restricted":
            call.reject("restricted", "RESTRICTED")
            return false
        case "writeOnly":
            // 既存の予定の読み取り・更新にはフルアクセスが要る。
            call.reject("full access is required", "WRITE_ONLY")
            return false
        default:
            call.reject("calendar access is not granted", "PERMISSION_DENIED")
            return false
        }
    }

    @objc func checkPermission(_ call: CAPPluginCall) {
        call.resolve(["status": statusString()])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        let current = statusString()
        // 未確定とフルアクセスへの昇格（writeOnly）だけ OS に要求する。denied / restricted は再要求しない。
        guard current == "notDetermined" || current == "writeOnly" else {
            call.resolve(["status": current])
            return
        }
        let finish: () -> Void = { [weak self] in
            guard let self = self else { return }
            let status = self.statusString()
            guard status == "granted" else {
                call.resolve(["status": status])
                return
            }
            // 許可の直後は古い状態のキャッシュが残るので、EventKit の直列 queue で reset してから返す。
            self.queue.async {
                self.store.reset()
                call.resolve(["status": self.statusString()])
            }
        }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents { _, _ in finish() }
        } else {
            store.requestAccess(to: .event) { _, _ in finish() }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["opened": ok])
            }
        }
    }

    // MARK: - 日時（端末ローカル "yyyy-MM-dd'T'HH:mm"）

    private func makeFormatter() -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        f.isLenient = false
        return f
    }

    private func makeCalendar() -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone.current
        return c
    }

    /// 厳密に parse。存在しない時刻（DST の隙間）は nil。
    private func parse(_ s: String?, _ f: DateFormatter) -> Date? {
        guard let s = s, s.count == 16, let d = f.date(from: s) else { return nil }
        return f.string(from: d) == s ? d : nil
    }

    // MARK: - カレンダー・予定

    private func hexColor(_ cg: CGColor?) -> String {
        guard let cg = cg else { return DuoNativePlugin.fallbackColor }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if UIColor(cgColor: cg).getRed(&r, green: &g, blue: &b, alpha: &a) {
            return String(format: "#%02x%02x%02x", Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
        }
        if let space = CGColorSpace(name: CGColorSpace.sRGB),
           let conv = cg.converted(to: space, intent: .defaultIntent, options: nil),
           let comps = conv.components, comps.count >= 3 {
            return String(format: "#%02x%02x%02x", Int((comps[0] * 255).rounded()), Int((comps[1] * 255).rounded()), Int((comps[2] * 255).rounded()))
        }
        return DuoNativePlugin.fallbackColor
    }

    private func sourceTypeString(_ t: EKSourceType) -> String {
        switch t {
        case .local: return "local"
        case .exchange: return "exchange"
        case .calDAV: return "caldav"
        case .mobileMe: return "mobileme"
        case .subscribed: return "subscribed"
        case .birthdays: return "birthdays"
        @unknown default: return "unknown"
        }
    }

    @objc func listCalendars(_ call: CAPPluginCall) {
        guard ensureAccess(call) else { return }
        queue.async { [weak self] in
            guard let self = self else { return }
            var items: [(sourceId: String, title: String, id: String, dict: [String: Any])] = []
            for c in self.store.calendars(for: .event) {
                let src = c.source
                let sourceId = src?.sourceIdentifier ?? ""
                let dict: [String: Any] = [
                    "id": c.calendarIdentifier,
                    "title": c.title,
                    "color": self.hexColor(c.cgColor),
                    "sourceId": sourceId,
                    "source": src?.title ?? "",
                    "sourceType": src != nil ? self.sourceTypeString(src!.sourceType) : "unknown",
                    "allowsModify": c.allowsContentModifications
                ]
                items.append((sourceId, c.title, c.calendarIdentifier, dict))
            }
            items.sort { a, b in
                if a.sourceId != b.sourceId { return a.sourceId < b.sourceId }
                if a.title != b.title { return a.title < b.title }
                return a.id < b.id
            }
            call.resolve(["calendars": items.map { $0.dict }])
        }
    }

    @objc func listEvents(_ call: CAPPluginCall) {
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        guard let from = parse(call.getString("from"), f), let to = parse(call.getString("to"), f), from < to,
              let ids = call.getArray("calendarIds", String.self) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        if ids.isEmpty {
            call.resolve(["events": [[String: Any]]()])
            return
        }
        queue.async { [weak self] in
            guard let self = self else { return }
            var calendars: [EKCalendar] = []
            for id in ids {
                guard let c = self.store.calendar(withIdentifier: id) else {
                    call.reject("calendar not found", "CALENDAR_NOT_FOUND")
                    return
                }
                calendars.append(c)
            }
            let predicate = self.store.predicateForEvents(withStart: from, end: to, calendars: calendars)
            let cal = self.makeCalendar()
            var seen = Set<String>()
            var out: [[String: Any]] = []
            for ev in self.store.events(matching: predicate) {
                guard let start = ev.startDate, let rawEnd = ev.endDate else { continue }
                var end = rawEnd
                var startOut = start
                if ev.isAllDay {
                    // JS 契約: 終日の end は「含む最終日」の 00:00。EventKit の排他的 end（翌日 00:00）なら前日へ戻す。
                    startOut = cal.startOfDay(for: start)
                    let sod = cal.startOfDay(for: rawEnd)
                    if rawEnd == sod && rawEnd > start {
                        end = cal.date(byAdding: .day, value: -1, to: sod) ?? sod
                    } else {
                        end = sod
                    }
                    if end < startOut { end = startOut }
                    // 取得範囲との重なりを再確認（[from, to)）。
                    if startOut >= to || end < cal.startOfDay(for: from) { continue }
                }
                let eventId = ev.eventIdentifier ?? ""
                let startStr = f.string(from: startOut)
                let id = "\(eventId)@\(startStr)"
                if !seen.insert(id).inserted { continue }
                var requestId: Any = NSNull()
                if let u = ev.url?.absoluteString, u.hasPrefix(DuoNativePlugin.urlPrefix) {
                    requestId = String(u.dropFirst(DuoNativePlugin.urlPrefix.count))
                }
                out.append([
                    "id": id,
                    "eventId": eventId,
                    "calendarId": ev.calendar?.calendarIdentifier ?? "",
                    "title": ev.title ?? "",
                    "start": startStr,
                    "end": f.string(from: end),
                    "all": ev.isAllDay,
                    "place": ev.location ?? "",
                    "notes": ev.notes ?? "",
                    "recurring": ev.hasRecurrenceRules,
                    "requestId": requestId,
                    "itemId": ev.calendarItemIdentifier,
                    "externalId": ev.calendarItemExternalIdentifier ?? "",
                    "occurrenceDate": self.stampOrNull(ev.occurrenceDate, f),
                    "modifiedAt": self.msOrNull(ev.lastModifiedDate)
                ])
            }
            call.resolve(["events": out])
        }
    }

    // MARK: - 作成（requestId で重複を防ぐ）

    private func stampOrNull(_ d: Date?, _ f: DateFormatter) -> Any {
        guard let d = d else { return NSNull() }
        return f.string(from: d)
    }

    private func msOrNull(_ d: Date?) -> Any {
        guard let d = d else { return NSNull() }
        return Int64((d.timeIntervalSince1970 * 1000).rounded())
    }

    /// 通常の SHA256 の小文字 hex（暗号化・HMAC ではない）。作成記録に本文を残さないために使う。
    private func sha256Hex(_ s: String) -> String {
        return SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// 作成記録 v1 → v2 の移行を EventKit の直列 queue に投入する。UserDefaults だけを使い、EventKit 権限は要らない。
    /// 権限拒否・引数不正の早期 return より前に呼ぶ。他の処理と同じ queue なので順序が揃う。
    private func migrateCreatedAsync() {
        queue.async { [weak self] in
            _ = self?.loadCreated()
        }
    }

    /// 作成記録 v2: [requestId: [itemId, eventId, fp, at]]。v1（平文 fingerprint）が残っていればハッシュにして移し、v1 を消す。
    /// 呼ぶのは EventKit の直列 queue 上のみ（load() からも migrateCreatedAsync 経由）。
    private func loadCreated() -> [String: [String: Any]] {
        let ud = UserDefaults.standard
        var all = (ud.dictionary(forKey: DuoNativePlugin.createdKey) as? [String: [String: Any]]) ?? [:]
        if let old = ud.dictionary(forKey: DuoNativePlugin.createdKeyV1) as? [String: [String: String]] {
            let now = Int(Date().timeIntervalSince1970)
            for (rid, rec) in old where all[rid] == nil {
                guard let eid = rec["eventId"], let fp = rec["fingerprint"] else { continue }
                // itemId は v1 に無い。空のままにして、次に使うとき EventKit から補う。
                all[rid] = ["itemId": "", "eventId": eid, "fp": sha256Hex(fp), "at": now]
            }
            trimCreated(&all, keep: nil)
            ud.set(all, forKey: DuoNativePlugin.createdKey)
            ud.removeObject(forKey: DuoNativePlugin.createdKeyV1)
        }
        return all
    }

    /// 上限を超えたら at の古い順に除く（keep の requestId は残す）。
    private func trimCreated(_ all: inout [String: [String: Any]], keep: String?) {
        while all.count > DuoNativePlugin.createdMax {
            let victim = all
                .filter { $0.key != keep }
                .min { a, b in
                    let x = (a.value["at"] as? NSNumber)?.intValue ?? 0, y = (b.value["at"] as? NSNumber)?.intValue ?? 0
                    return x != y ? x < y : a.key < b.key
                }
            guard let k = victim?.key else { break }
            all.removeValue(forKey: k)
        }
    }

    private func saveCreated(_ requestId: String, itemId: String, eventId: String, fp: String) {
        var all = loadCreated()
        all[requestId] = ["itemId": itemId, "eventId": eventId, "fp": fp, "at": Int(Date().timeIntervalSince1970)]
        trimCreated(&all, keep: requestId)
        UserDefaults.standard.set(all, forKey: DuoNativePlugin.createdKey)
    }

    /// alarms 引数 → relativeOffset（秒）の配列。nil は「変更なし」、[] は「明示的になし」。不正なら nil を返し invalid を立てる。
    private func parseAlarms(_ raw: [Any]?, allDay: Bool) -> (offsets: [TimeInterval]?, invalid: Bool) {
        guard let raw = raw else { return (nil, false) }
        guard raw.count <= 2 else { return (nil, true) }
        var out: [TimeInterval] = []
        for o in raw {
            guard let d = o as? [String: Any] else { return (nil, true) }
            if allDay {
                guard let day = (d["day"] as? NSNumber)?.intValue, day >= 0, day <= 30,
                      let at = d["at"] as? String, at.count == 5,
                      let h = Int(at.prefix(2)), let m = Int(at.suffix(2)), at[at.index(at.startIndex, offsetBy: 2)] == ":",
                      h >= 0, h < 24, m >= 0, m < 60 else { return (nil, true) }
                out.append(TimeInterval(-day * 86400 + h * 3600 + m * 60))
            } else {
                guard let before = (d["before"] as? NSNumber)?.intValue, before >= 0, before <= 40320 else { return (nil, true) }
                out.append(TimeInterval(-before * 60))
            }
        }
        return (out, false)
    }

    /// 作成・URL 回収・再呼出しのどれでも同じ形で返す。EventKit から取れれば最新の値、無ければ記録の値。
    private func createdReply(_ ev: EKEvent?, itemId: String, eventId: String, calendarId: String, _ f: DateFormatter) -> [String: Any] {
        return [
            "itemId": ev?.calendarItemIdentifier ?? itemId,
            "externalId": ev?.calendarItemExternalIdentifier ?? "",
            "eventId": ev?.eventIdentifier ?? eventId,
            "modifiedAt": msOrNull(ev?.lastModifiedDate),
            "calendarId": ev?.calendar?.calendarIdentifier ?? calendarId,
            "occurrenceDate": stampOrNull(ev?.occurrenceDate, f)
        ]
    }

    @objc func createEvent(_ call: CAPPluginCall) {
        migrateCreatedAsync()
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        guard let requestId = call.getString("requestId"), !requestId.isEmpty, requestId.count <= 100,
              let calendarId = call.getString("calendarId"), !calendarId.isEmpty,
              let title = call.getString("title"),
              let start = parse(call.getString("start"), f), let end = parse(call.getString("end"), f),
              end >= start else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let allDay = call.getBool("all") ?? false
        let place = call.getString("place") ?? ""
        let notes = call.getString("notes") ?? ""
        let parsedAlarms = parseAlarms(call.getArray("alarms"), allDay: allDay)
        // alarms が配列でも null/未指定でもない値（文字列など）は不正。
        let alarmsGiven = call.options["alarms"]
        if parsedAlarms.invalid || (alarmsGiven != nil && !(alarmsGiven is NSNull) && call.getArray("alarms") == nil) {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let offsets = parsedAlarms.offsets
        // recurrence: 未指定/null は単発。オブジェクトは新規の規則（makeRule で変換）。それ以外は不正。
        let recGiven = call.options["recurrence"]
        let recObj = call.getObject("recurrence")
        if let g = recGiven, !(g is NSNull), recObj == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        var recCanon: String? = nil
        if let r = recObj {
            guard let c = self.canonicalRule(r) else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            recCanon = c
        }
        // alarms 未指定なら旧版と同じ原文（旧版の記録と同じハッシュになる）。指定ありは offsets を足す（[] も区別する）。
        let baseFingerprint = [calendarId, title, call.getString("start") ?? "", call.getString("end") ?? "", allDay ? "1" : "0", place, notes].joined(separator: "\u{1F}")
        var fingerprint = baseFingerprint
        if let offs = offsets {
            fingerprint += "\u{1E}alarms:" + offs.map { String(Int($0)) }.sorted().joined(separator: ",")
        }
        // 単発（recurrence なし）は従来と同じ原文のまま。規則ありだけ正規化した規則を足す。
        if let c = recCanon { fingerprint += "\u{1E}rec:" + c }
        let fp = sha256Hex(fingerprint)
        let legacyFp = sha256Hex(baseFingerprint)

        queue.async { [weak self] in
            guard let self = self else { return }
            // 1) 記録済みの requestId は作り直さない（内容が違えばエラー）。
            //    v1 から移した記録（itemId が空）は alarms 未指定の旧内容と照合する。
            if let done = self.loadCreated()[requestId] {
                let doneFp = done["fp"] as? String
                let doneItem = done["itemId"] as? String ?? ""
                let migrated = doneItem.isEmpty
                guard doneFp == fp || (migrated && offsets != nil && doneFp == legacyFp) else {
                    call.reject("requestId was used with different content", "INVALID_ARGUMENT")
                    return
                }
                let eid = done["eventId"] as? String ?? ""
                let ev = eid.isEmpty ? nil : self.store.event(withIdentifier: eid)
                let reply = self.createdReply(ev, itemId: doneItem, eventId: eid, calendarId: calendarId, f)
                if migrated, let newItem = reply["itemId"] as? String, !newItem.isEmpty {
                    self.saveCreated(requestId, itemId: newItem, eventId: eid, fp: doneFp ?? fp)
                }
                call.resolve(reply)
                return
            }
            guard let calendar = self.store.calendar(withIdentifier: calendarId) else {
                call.reject("calendar not found", "CALENDAR_NOT_FOUND")
                return
            }
            guard calendar.allowsContentModifications else {
                call.reject("calendar is read only", "READ_ONLY")
                return
            }
            let cal = self.makeCalendar()
            var startDate = start
            var endDate = end
            if allDay {
                // 終日: 開始日 00:00〜最終日の終わり（最終日 23:59:59）。JS の end は最終日 00:00。
                startDate = cal.startOfDay(for: start)
                let lastDay = cal.startOfDay(for: end)
                let nextDay = cal.date(byAdding: .day, value: 1, to: lastDay) ?? lastDay.addingTimeInterval(86400)
                endDate = nextDay.addingTimeInterval(-1)
                if endDate < startDate { endDate = startDate }
            }
            let marker = DuoNativePlugin.urlPrefix + requestId
            // 2) 保存直後にクラッシュして記録だけ無い場合: URL 識別で既存の作成物を回収する。
            let probe = self.store.predicateForEvents(withStart: startDate.addingTimeInterval(-86400), end: endDate.addingTimeInterval(86400 * 2), calendars: [calendar])
            for ev in self.store.events(matching: probe) where ev.url?.absoluteString == marker {
                let existing = ev.eventIdentifier ?? ""
                if !existing.isEmpty {
                    self.saveCreated(requestId, itemId: ev.calendarItemIdentifier, eventId: existing, fp: fp)
                    call.resolve(self.createdReply(ev, itemId: ev.calendarItemIdentifier, eventId: existing, calendarId: calendarId, f))
                    return
                }
            }
            // 3) 作成（単発、または新規の繰り返し規則1つ）。ユーザーのメモは変更しない。識別は URL に持つ。
            let event = EKEvent(eventStore: self.store)
            event.calendar = calendar
            event.title = title
            event.isAllDay = allDay
            event.startDate = startDate
            event.endDate = endDate
            if !place.isEmpty { event.location = place }
            if !notes.isEmpty { event.notes = notes }
            event.url = URL(string: marker)
            // alarms: 未指定は触らない、[] は明示的になし、値ありはその通りに。
            if let offs = offsets {
                event.alarms = offs.map { EKAlarm(relativeOffset: $0) }
            }
            // 規則は開始日（系列の先頭）を基準に updateEvent と同じ変換。
            if let r = recObj {
                guard let rule = self.makeRule(r, anchor: startDate, cal: cal) else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                event.addRecurrenceRule(rule)
            }
            do {
                try self.store.save(event, span: .thisEvent, commit: true)
            } catch {
                call.reject("could not save the event", "UNAVAILABLE", error)
                return
            }
            let newId = event.eventIdentifier ?? ""
            guard !newId.isEmpty else {
                call.reject("saved event has no identifier", "UNAVAILABLE")
                return
            }
            self.saveCreated(requestId, itemId: event.calendarItemIdentifier, eventId: newId, fp: fp)
            call.resolve(self.createdReply(event, itemId: event.calendarItemIdentifier, eventId: newId, calendarId: calendarId, f))
        }
    }

    // MARK: - 更新・削除（手順書 §3.1〜3.4）

    private enum Found {
        case found(EKEvent)
        case notFound
        case ambiguous
    }

    /// 予定の特定。itemId → externalId（複数は URL、次に開始）→ eventId → 開始±1日の URL 検索。
    /// occurrenceStart があれば同じ系列の回を occurrenceDate で選ぶ。曖昧なら選ばない。
    /// anchor は URL 検索と externalId 複数時の開始照合に使う日時（occurrenceStart、無ければ新しい start）。
    /// 呼ぶのは EventKit の直列 queue 上。
    private func findTarget(itemId: String, externalId: String, eventId: String, requestId: String,
                            occurrenceStart: String?, anchor: Date?, allowHeadFallback: Bool,
                            _ f: DateFormatter) -> Found {
        let marker = DuoNativePlugin.urlPrefix + requestId
        func window(_ d: Date) -> [EKEvent] {
            let p = store.predicateForEvents(withStart: d.addingTimeInterval(-86400), end: d.addingTimeInterval(86400 * 2), calendars: nil)
            return store.events(matching: p)
        }
        var base: EKEvent? = nil
        if !itemId.isEmpty, let it = store.calendarItem(withIdentifier: itemId) as? EKEvent {
            base = it
        } else if !externalId.isEmpty {
            let items = store.calendarItems(withExternalIdentifier: externalId).compactMap { $0 as? EKEvent }
            if items.count == 1 {
                base = items[0]
            } else if items.count > 1 {
                let byUrl = items.filter { $0.url?.absoluteString == marker }
                if byUrl.count == 1 {
                    base = byUrl[0]
                } else if let a = anchor {
                    let pool = byUrl.isEmpty ? items : byUrl
                    let byStart = pool.filter { $0.startDate == a }
                    if byStart.count == 1 { base = byStart[0] } else { return .ambiguous }
                } else {
                    return .ambiguous
                }
            }
        }
        if base == nil, !eventId.isEmpty, let e = store.event(withIdentifier: eventId) {
            base = e
        }
        if base == nil, let a = anchor {
            var seen = Set<String>()
            var hits: [EKEvent] = []
            for e in window(a) where e.url?.absoluteString == marker {
                if seen.insert(e.calendarItemIdentifier).inserted { hits.append(e) }
            }
            if hits.count > 1 { return .ambiguous }
            base = hits.first
        }
        guard let b = base else { return .notFound }
        guard let occ = occurrenceStart, let occDate = parse(occ, f) else { return .found(b) }
        // 同じ系列（itemId・externalId・URL の印のどれかが一致）で、回の開始が一致するもの。
        let ext = b.calendarItemExternalIdentifier ?? ""
        var matches: [EKEvent] = []
        for e in window(occDate) {
            let same = e.calendarItemIdentifier == b.calendarItemIdentifier
                || (!ext.isEmpty && e.calendarItemExternalIdentifier == ext)
                || e.url?.absoluteString == marker
            guard same, let od = e.occurrenceDate ?? e.startDate else { continue }
            let stamp = f.string(from: od)
            if stamp == occ || (e.isAllDay && stamp.prefix(10) == occ.prefix(10)) { matches.append(e) }
        }
        if matches.count == 1 { return .found(matches[0]) }
        if matches.count > 1 { return .ambiguous }
        // 回が見つからない: 繰り返しのない予定、または全体（先頭）の操作なら元の予定自体を使う。
        if !b.hasRecurrenceRules || allowHeadFallback { return .found(b) }
        return .notFound
    }

    private func isConflict(_ ev: EKEvent, expect: Double?) -> Bool {
        guard let e = expect, let m = ev.lastModifiedDate else { return false }
        return m.timeIntervalSince1970 * 1000 >= e + 1000
    }

    private func has(_ call: CAPPluginCall, _ key: String) -> Bool {
        if let v = call.options[key] { return !(v is NSNull) }
        return false
    }

    /// Duo の規則 {freq, byDay(0=日), count, until(YYYY-MM-DD)} → EKRecurrenceRule。anchor は規則の基準日（予定の開始）。
    private func makeRule(_ d: [String: Any], anchor: Date, cal: Calendar) -> EKRecurrenceRule? {
        guard let freqStr = d["freq"] as? String else { return nil }
        var end: EKRecurrenceEnd? = nil
        if let c = (d["count"] as? NSNumber)?.intValue, c > 0 {
            end = EKRecurrenceEnd(occurrenceCount: c)
        } else if let u = d["until"] as? String, u.count == 10 {
            let df = DateFormatter()
            df.calendar = Calendar(identifier: .gregorian)
            df.locale = Locale(identifier: "en_US_POSIX")
            df.timeZone = TimeZone.current
            df.dateFormat = "yyyy-MM-dd"
            guard let day = df.date(from: u) else { return nil }
            // until は含む最終日。その日の終わりまでを範囲にする。
            end = EKRecurrenceEnd(end: (cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: day)) ?? day).addingTimeInterval(-1))
        }
        let comps = cal.dateComponents([.month, .day], from: anchor)
        switch freqStr {
        case "daily":
            return EKRecurrenceRule(recurrenceWith: .daily, interval: 1, end: end)
        case "weekly":
            var days: [EKRecurrenceDayOfWeek]? = nil
            if let by = d["byDay"] as? [Any], !by.isEmpty {
                var out: [EKRecurrenceDayOfWeek] = []
                for v in by {
                    guard let n = (v as? NSNumber)?.intValue, n >= 0, n <= 6, let wd = EKWeekday(rawValue: n + 1) else { return nil }
                    out.append(EKRecurrenceDayOfWeek(wd))
                }
                days = out
            }
            return EKRecurrenceRule(recurrenceWith: .weekly, interval: 1, daysOfTheWeek: days, daysOfTheMonth: nil,
                                    monthsOfTheYear: nil, weeksOfTheYear: nil, daysOfTheYear: nil, setPositions: nil, end: end)
        case "monthly":
            // 31 日などは月末に寄せず、その日がない月は飛ばす（Duo と同じ）。日付を明示する。
            guard let dom = comps.day else { return nil }
            return EKRecurrenceRule(recurrenceWith: .monthly, interval: 1, daysOfTheWeek: nil, daysOfTheMonth: [NSNumber(value: dom)],
                                    monthsOfTheYear: nil, weeksOfTheYear: nil, daysOfTheYear: nil, setPositions: nil, end: end)
        case "yearly":
            guard let dom = comps.day, let mon = comps.month else { return nil }
            return EKRecurrenceRule(recurrenceWith: .yearly, interval: 1, daysOfTheWeek: nil, daysOfTheMonth: [NSNumber(value: dom)],
                                    monthsOfTheYear: [NSNumber(value: mon)], weeksOfTheYear: nil, daysOfTheYear: nil, setPositions: nil, end: end)
        default:
            return nil
        }
    }

    /// 作成ハッシュ用の規則の正規形。freq|interval=1|byDay（weekly のみ・昇順・重複なし）|count|until。不正は nil。
    private func canonicalRule(_ d: [String: Any]) -> String? {
        guard let freq = d["freq"] as? String, ["daily", "weekly", "monthly", "yearly"].contains(freq) else { return nil }
        var days: [Int] = []
        if freq == "weekly", let by = d["byDay"] as? [Any] {
            for v in by {
                guard let n = (v as? NSNumber)?.intValue, n >= 0, n <= 6 else { return nil }
                days.append(n)
            }
            days = Array(Set(days)).sorted()
        }
        var count = ""
        if let c = (d["count"] as? NSNumber)?.intValue, c > 0 { count = String(c) }
        var until = ""
        if count.isEmpty, let u = d["until"] as? String, !u.isEmpty { until = u }
        return [freq, "1", days.map { String($0) }.joined(separator: ","), count, until].joined(separator: "|")
    }

    @objc func updateEvent(_ call: CAPPluginCall) {
        migrateCreatedAsync()
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        guard let requestId = call.getString("requestId"), !requestId.isEmpty, requestId.count <= 100,
              let span = call.getString("span"), ["this", "future", "all"].contains(span) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let itemId = call.getString("itemId") ?? ""
        let externalId = call.getString("externalId") ?? ""
        let eventId = call.getString("eventId") ?? ""
        let calendarId = call.getString("calendarId") ?? ""
        let occStr: String? = has(call, "occurrenceStart") ? call.getString("occurrenceStart") : nil
        if let o = occStr, parse(o, f) == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let newStart: Date? = has(call, "start") ? parse(call.getString("start"), f) : nil
        let newEnd: Date? = has(call, "end") ? parse(call.getString("end"), f) : nil
        if (has(call, "start") && newStart == nil) || (has(call, "end") && newEnd == nil) {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let givenAll: Bool? = has(call, "all") ? call.getBool("all") : nil
        let newTitle: String? = has(call, "title") ? call.getString("title") : nil
        let newPlace: String? = has(call, "place") ? call.getString("place") : nil
        let newNotes: String? = has(call, "notes") ? call.getString("notes") : nil
        let alarmsGiven = has(call, "alarms")
        if alarmsGiven && call.getArray("alarms") == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let rawAlarms = call.getArray("alarms")
        // recurrence: キーなし/undefined は変更なし、null は規則解除、オブジェクトは置換。
        let recurrenceKeyed = call.options["recurrence"] != nil && call.options["recurrence"] is NSNull == false
        let recurrenceClear = call.options["recurrence"] is NSNull
        let recurrenceObj = call.options["recurrence"] as? [String: Any]
        if recurrenceKeyed && recurrenceObj == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let newRequestId = call.getString("newRequestId")
        let expect = (call.options["expectModified"] as? NSNumber)?.doubleValue
        let force = call.getBool("force") ?? false

        queue.async { [weak self] in
            guard let self = self else { return }
            let cal = self.makeCalendar()
            let anchor = occStr.flatMap { self.parse($0, f) } ?? newStart
            let found = self.findTarget(itemId: itemId, externalId: externalId, eventId: eventId, requestId: requestId,
                                        occurrenceStart: occStr, anchor: anchor, allowHeadFallback: span == "all", f)
            let ev: EKEvent
            switch found {
            case .ambiguous:
                call.reject("target is ambiguous", "UNAVAILABLE")
                return
            case .notFound:
                if !calendarId.isEmpty && self.store.calendar(withIdentifier: calendarId) == nil {
                    call.reject("calendar not found", "CALENDAR_NOT_FOUND")
                } else {
                    call.reject("event not found", "NOT_FOUND")
                }
                return
            case .found(let e):
                ev = e
            }
            guard ev.calendar?.allowsContentModifications ?? false else {
                call.reject("calendar is read only", "READ_ONLY")
                return
            }
            if !force && self.isConflict(ev, expect: expect) {
                call.reject("event was modified on the device", "CONFLICT")
                return
            }
            let wasRecurring = ev.hasRecurrenceRules
            if span == "this" && wasRecurring && (recurrenceKeyed || recurrenceClear) {
                call.reject("cannot change the rule of one occurrence", "INVALID_ARGUMENT")
                return
            }

            // 本文
            if let t = newTitle { ev.title = t }
            if let p = newPlace { ev.location = p.isEmpty ? nil : p }
            if let n = newNotes { ev.notes = n.isEmpty ? nil : n }

            // 日時（終日は createEvent と同じ変換。end の入力は含む最終日 00:00）
            let targetAll = givenAll ?? ev.isAllDay
            if newStart != nil || newEnd != nil || givenAll != nil {
                let curStart = ev.startDate ?? Date()
                let curRawEnd = ev.endDate ?? curStart
                var curLast = curRawEnd
                if ev.isAllDay {
                    let sod = cal.startOfDay(for: curRawEnd)
                    curLast = (curRawEnd == sod && curRawEnd > curStart) ? (cal.date(byAdding: .day, value: -1, to: sod) ?? sod) : sod
                }
                let s = newStart ?? curStart
                var e: Date
                if let ne = newEnd {
                    e = ne
                } else if targetAll {
                    if ev.isAllDay {
                        let days = cal.dateComponents([.day], from: cal.startOfDay(for: curStart), to: cal.startOfDay(for: curLast)).day ?? 0
                        e = cal.date(byAdding: .day, value: days, to: cal.startOfDay(for: s)) ?? s
                    } else {
                        e = max(cal.startOfDay(for: curRawEnd), cal.startOfDay(for: s))
                    }
                } else if ev.isAllDay {
                    e = s.addingTimeInterval(3600)
                } else {
                    e = newStart != nil ? s.addingTimeInterval(curRawEnd.timeIntervalSince(curStart)) : curRawEnd
                }
                if targetAll {
                    let startDate = cal.startOfDay(for: s)
                    let lastDay = cal.startOfDay(for: e)
                    let next = cal.date(byAdding: .day, value: 1, to: lastDay) ?? lastDay.addingTimeInterval(86400)
                    ev.isAllDay = true
                    ev.startDate = startDate
                    ev.endDate = max(next.addingTimeInterval(-1), startDate)
                } else {
                    guard e >= s else {
                        call.reject("invalid arguments", "INVALID_ARGUMENT")
                        return
                    }
                    ev.isAllDay = false
                    ev.startDate = s
                    ev.endDate = e
                }
            }

            // alarms: 渡されたときだけ差し替え（[] は全解除）。
            if alarmsGiven {
                let parsed = self.parseAlarms(rawAlarms, allDay: targetAll)
                guard !parsed.invalid, let offs = parsed.offsets else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                ev.alarms = offs.isEmpty ? nil : offs.map { EKAlarm(relativeOffset: $0) }
            }

            // 繰り返し規則
            if recurrenceClear {
                for r in ev.recurrenceRules ?? [] { ev.removeRecurrenceRule(r) }
            } else if let obj = recurrenceObj {
                guard let rule = self.makeRule(obj, anchor: ev.startDate ?? Date(), cal: cal) else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                for r in ev.recurrenceRules ?? [] { ev.removeRecurrenceRule(r) }
                ev.addRecurrenceRule(rule)
            }

            // これ以降で系列が分かれるとき、新しい系列に新しい URL の印を付ける（保存の前）。
            let splitting = span == "future" && wasRecurring && newRequestId != nil && !(newRequestId ?? "").isEmpty
            if splitting, let nr = newRequestId {
                ev.url = URL(string: DuoNativePlugin.urlPrefix + nr)
            }

            let ekSpan: EKSpan = (span == "this" || !wasRecurring) ? .thisEvent : .futureEvents
            do {
                try self.store.save(ev, span: ekSpan, commit: true)
            } catch {
                call.reject("could not save the event", "UNAVAILABLE", error)
                return
            }
            var result: EKEvent = ev
            if splitting, let nr = newRequestId {
                // 新しい系列の id が保存後の event で取れない場合に備え、URL の印で取り直す。
                let marker = DuoNativePlugin.urlPrefix + nr
                let around = ev.startDate ?? Date()
                let p = self.store.predicateForEvents(withStart: around.addingTimeInterval(-86400), end: around.addingTimeInterval(86400 * 2), calendars: nil)
                if let hit = self.store.events(matching: p).first(where: { $0.url?.absoluteString == marker }) { result = hit }
            }
            _ = result.refresh()
            call.resolve(self.createdReply(result, itemId: result.calendarItemIdentifier, eventId: result.eventIdentifier ?? eventId,
                                           calendarId: calendarId, f))
        }
    }

    @objc func deleteEvent(_ call: CAPPluginCall) {
        migrateCreatedAsync()
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        guard let requestId = call.getString("requestId"), !requestId.isEmpty, requestId.count <= 100,
              let span = call.getString("span"), ["this", "future", "all"].contains(span) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let itemId = call.getString("itemId") ?? ""
        let externalId = call.getString("externalId") ?? ""
        let eventId = call.getString("eventId") ?? ""
        let occStr: String? = has(call, "occurrenceStart") ? call.getString("occurrenceStart") : nil
        if let o = occStr, parse(o, f) == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let expect = (call.options["expectModified"] as? NSNumber)?.doubleValue
        queue.async { [weak self] in
            guard let self = self else { return }
            let found = self.findTarget(itemId: itemId, externalId: externalId, eventId: eventId, requestId: requestId,
                                        occurrenceStart: occStr, anchor: occStr.flatMap { self.parse($0, f) },
                                        allowHeadFallback: span == "all", f)
            let ev: EKEvent
            switch found {
            case .ambiguous:
                call.reject("target is ambiguous", "UNAVAILABLE")
                return
            case .notFound:
                // すでに消えている。削除は成功扱い。
                call.resolve(["deleted": true, "missing": true])
                return
            case .found(let e):
                ev = e
            }
            guard ev.calendar?.allowsContentModifications ?? false else {
                call.reject("calendar is read only", "READ_ONLY")
                return
            }
            // 削除には force を設けない。iPhone 側で変更されていたら消さない。
            if self.isConflict(ev, expect: expect) {
                call.reject("event was modified on the device", "CONFLICT")
                return
            }
            let ekSpan: EKSpan = (span == "this" || !ev.hasRecurrenceRules) ? .thisEvent : .futureEvents
            do {
                try self.store.remove(ev, span: ekSpan, commit: true)
            } catch {
                call.reject("could not delete the event", "UNAVAILABLE", error)
                return
            }
            call.resolve(["deleted": true])
        }
    }

    // MARK: - カレンダーアプリを開く

    @objc func openInCalendar(_ call: CAPPluginCall) {
        let f = makeFormatter()
        guard let date = parse(call.getString("start"), f) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        // 特定の予定の詳細へ飛べる保証はない。指定日時の日付を開く。
        let seconds = Int(date.timeIntervalSinceReferenceDate)
        DispatchQueue.main.async {
            guard let url = URL(string: "calshow:\(seconds)") else {
                call.resolve(["opened": false])
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                call.resolve(["opened": ok])
            }
        }
    }

    // MARK: - ローカル通知（本文はログ・保存へ出さない）

    private func notifyStatusString(_ s: UNAuthorizationStatus) -> String {
        switch s {
        case .notDetermined: return "notDetermined"
        case .authorized: return "granted"
        case .provisional: return "provisional"
        case .ephemeral: return "ephemeral"
        default: return "denied"
        }
    }

    private func notifyAllowed(_ s: UNAuthorizationStatus) -> Bool {
        return s == .authorized || s == .provisional || s == .ephemeral
    }

    @objc func notifyStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            guard let self = self else { return }
            call.resolve(["status": self.notifyStatusString(settings.authorizationStatus)])
        }
    }

    @objc func requestNotifyPermission(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { [weak self] settings in
            guard let self = self else { return }
            guard settings.authorizationStatus == .notDetermined else {
                call.resolve(["status": self.notifyStatusString(settings.authorizationStatus)])
                return
            }
            center.requestAuthorization(options: [.alert, .sound]) { _, _ in
                center.getNotificationSettings { after in
                    call.resolve(["status": self.notifyStatusString(after.authorizationStatus)])
                }
            }
        }
    }

    /// duo. で始まる id（keepTest が false なら duo.test も）の pending を集める。
    private func duoPendingIds(_ center: UNUserNotificationCenter, includeTest: Bool, _ done: @escaping ([String]) -> Void) {
        center.getPendingNotificationRequests { reqs in
            done(reqs.map { $0.identifier }.filter {
                $0.hasPrefix(DuoNativePlugin.notifyPrefix) && (includeTest || $0 != DuoNativePlugin.notifyTestId)
            })
        }
    }

    @objc func notifySync(_ call: CAPPluginCall) {
        // 全件を先に検証する。1件でも不正なら何も変えない。
        guard let raw = call.getArray("items") as? [[String: Any]], raw.count <= DuoNativePlugin.notifyMax else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        struct Item { let id: String; let title: String; let body: String; let fire: String; let thread: String; let day: String; let eventId: String }
        var items: [Item] = []
        var seen = Set<String>()
        for o in raw {
            guard let id = o["id"] as? String, id.hasPrefix(DuoNativePlugin.notifyPrefix), id != DuoNativePlugin.notifyTestId, !seen.contains(id),
                  let title = o["title"] as? String, let body = o["body"] as? String,
                  let fire = o["fireDate"] as? String,
                  let thread = o["thread"] as? String, let day = o["day"] as? String,
                  let eventId = o["eventId"] as? String else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            seen.insert(id)
            items.append(Item(id: id, title: title, body: body, fire: fire, thread: thread, day: day, eventId: eventId))
        }
        notifyQueue.async { [weak self] in
            guard let self = self else { return }
            // add / remove は非同期なので、セマフォで完了を待ってからキューを進める。
            let finished = DispatchSemaphore(value: 0)
            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { settings in
                guard self.notifyAllowed(settings.authorizationStatus) else {
                    call.reject("notification permission is not granted", "PERMISSION_DENIED")
                    finished.signal()
                    return
                }
                self.duoPendingIds(center, includeTest: false) { old in
                    center.removePendingNotificationRequests(withIdentifiers: old)
                    let f = self.makeFormatter()
                    let cal = self.makeCalendar()
                    let now = Date()
                    var skipped = 0
                    var scheduled = 0
                    let group = DispatchGroup()
                    let lock = NSLock()
                    for it in items {
                        guard let date = self.parse(it.fire, f), date > now else { skipped += 1; continue }
                        let content = UNMutableNotificationContent()
                        content.title = it.title
                        content.body = it.body
                        content.sound = .default
                        content.threadIdentifier = it.thread
                        content.userInfo = ["day": it.day, "eventId": it.eventId]
                        let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: date)
                        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                        let req = UNNotificationRequest(identifier: it.id, content: content, trigger: trigger)
                        group.enter()
                        center.add(req) { error in
                            lock.lock()
                            if error == nil { scheduled += 1 } else { skipped += 1 }
                            lock.unlock()
                            group.leave()
                        }
                    }
                    group.notify(queue: DispatchQueue.global()) {
                        call.resolve(["scheduled": scheduled, "removed": old.count, "skipped": skipped])
                        finished.signal()
                    }
                }
            }
            finished.wait()
        }
    }

    @objc func notifyClear(_ call: CAPPluginCall) {
        notifyQueue.async {
            let finished = DispatchSemaphore(value: 0)
            let center = UNUserNotificationCenter.current()
            self.duoPendingIds(center, includeTest: true) { pending in
                center.removePendingNotificationRequests(withIdentifiers: pending)
                center.getDeliveredNotifications { delivered in
                    let ids = delivered.map { $0.request.identifier }.filter { $0.hasPrefix(DuoNativePlugin.notifyPrefix) }
                    center.removeDeliveredNotifications(withIdentifiers: ids)
                    call.resolve(["removed": pending.count + ids.count])
                    finished.signal()
                }
            }
            finished.wait()
        }
    }

    @objc func notifyTest(_ call: CAPPluginCall) {
        notifyQueue.async { [weak self] in
            guard let self = self else { return }
            let finished = DispatchSemaphore(value: 0)
            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { settings in
                guard self.notifyAllowed(settings.authorizationStatus) else {
                    call.reject("notification permission is not granted", "PERMISSION_DENIED")
                    finished.signal()
                    return
                }
                let content = UNMutableNotificationContent()
                content.title = "Duo のテスト通知"
                content.body = "通知は正しく届きます。"
                content.sound = .default
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 60, repeats: false)
                let req = UNNotificationRequest(identifier: DuoNativePlugin.notifyTestId, content: content, trigger: trigger)
                center.add(req) { error in
                    if error == nil {
                        call.resolve(["scheduled": true])
                    } else {
                        call.reject("could not schedule", "UNAVAILABLE", error)
                    }
                    finished.signal()
                }
            }
            finished.wait()
        }
    }

    // MARK: NotificationHandlerProtocol

    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        return [.banner, .list, .sound]
    }

    public func didReceive(response: UNNotificationResponse) {
        let info = response.notification.request.content.userInfo
        guard let day = info["day"] as? String, let eventId = info["eventId"] as? String else { return }
        notifyListeners("notificationTapped", data: ["day": day, "eventId": eventId], retainUntilConsumed: true)
    }

    // MARK: - 共有シート

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let text = call.getString("text"),
              !name.isEmpty, !name.contains("/"), !name.contains("\\"), name != ".", name != "..",
              (name as NSString).lastPathComponent == name,
              text.utf8.count <= DuoNativePlugin.maxShareBytes else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try text.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            call.reject("could not write the file", "IO_ERROR", error)
            return
        }
        // 共有ボタンの位置（任意。iPad のポップオーバーの起点）。
        let anchor = call.getObject("anchor")
        let number: (String) -> CGFloat? = { key in
            guard let v = anchor?[key] as? NSNumber else { return nil }
            return CGFloat(v.doubleValue)
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let vc = self.bridge?.viewController else {
                try? FileManager.default.removeItem(at: url)
                call.reject("no view controller", "UNAVAILABLE")
                return
            }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let pop = sheet.popoverPresentationController {
                pop.sourceView = vc.view
                if let x = number("x"), let y = number("y"), let w = number("width"), let h = number("height") {
                    pop.sourceRect = CGRect(x: x, y: y, width: w, height: h)
                } else {
                    pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.midY, width: 1, height: 1)
                    pop.permittedArrowDirections = []
                }
            }
            sheet.completionWithItemsHandler = { _, completed, _, error in
                try? FileManager.default.removeItem(at: url)
                if let error = error {
                    call.reject("share failed", "IO_ERROR", error)
                } else {
                    call.resolve(["completed": completed])
                }
            }
            vc.present(sheet, animated: true, completion: nil)
        }
    }
}
