import Foundation
import Capacitor
import CryptoKit
import EventKit
import UIKit
import UserNotifications
import WebKit
import os

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
        CAPPluginMethod(name: "getEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateExternalEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteExternalEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openInCalendar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestNotifyPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifySync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notifyTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectionHaptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPosture", returnType: CAPPluginReturnPromise),
        // iOS 本来のめくり（B、1段目の試作。連携 第18弾）
        CAPPluginMethod(name: "curlCaps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareCurl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseCurl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "turnPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "backReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "webReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelCurl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "curlPerf", returnType: CAPPluginReturnPromise)
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

    // 折り状態（第16版 PR10）。probe は iOS 27.1 以降だけ作る（型は UIView で持ち、可用性の注釈を広げない）。
    private var postureProbe: UIView?
    private var lastEmittedPosture: [String: Any]?
    // UIHinge の記録（配置には使わない）。度と status 文字列。取れたときだけ入る。
    private var hingeAngleDegrees: Double?
    private var hingeStatus: String?
    // iOS 本来のめくり（B）。UI は main で触る
    fileprivate lazy var curlCtl = DuoCurlController(owner: self)

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
        // 折り状態の probe。view がまだ無ければ設置せず、getPosture で再設置する。
        DispatchQueue.main.async { [weak self] in self?.installPostureProbe() }
        #if DEBUG
        // 確認用（Debug のみ）：起動引数 -DuoEvalJS "<js>" [-DuoEvalDelay 秒] で、起動後に JS を1回実行する。-DuoSlowAnim 0.1 でアニメーションを遅くする。
        let args = ProcessInfo.processInfo.arguments
        func arg(_ k: String) -> String? { if let i = args.firstIndex(of: k), i + 1 < args.count { return args[i + 1] }; return nil }
        if let js = arg("-DuoEvalJS") {
            let delay = Double(arg("-DuoEvalDelay") ?? "") ?? 6
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        }
        if let sp = arg("-DuoSlowAnim"), let v = Float(sp) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.bridge?.viewController?.view.window?.layer.speed = v }
        }
        #endif
    }

    deinit {
        if let observer = storeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
        for o in timeObservers { NotificationCenter.default.removeObserver(o) }
        // deinit は任意スレッドで呼ばれうるので、probe の解除は main へ渡す（UIView は main で触る）。
        if let probe = postureProbe {
            DispatchQueue.main.async { probe.removeFromSuperview() }
        }
        if bridge?.notificationRouter.localNotificationHandler === self {
            bridge?.notificationRouter.localNotificationHandler = nil
        }
    }

    // MARK: - 権限

    private func statusString(for type: EKEntityType) -> String {
        let s = EKEventStore.authorizationStatus(for: type)
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
        switch statusString(for: .event) {
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
        call.resolve(["status": statusString(for: .event)])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        let current = statusString(for: .event)
        // 未確定とフルアクセスへの昇格（writeOnly）だけ OS に要求する。denied / restricted は再要求しない。
        guard current == "notDetermined" || current == "writeOnly" else {
            call.resolve(["status": current])
            return
        }
        let finish: () -> Void = { [weak self] in
            guard let self = self else { return }
            let status = self.statusString(for: .event)
            guard status == "granted" else {
                call.resolve(["status": status])
                return
            }
            // 許可の直後は古い状態のキャッシュが残るので、EventKit の直列 queue で reset してから返す。
            self.queue.async {
                self.store.reset()
                call.resolve(["status": self.statusString(for: .event)])
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

    // 第19.4版（design/36 §8.2）: Display P3 などの色は成分が 0〜1 の外に出ることがある。そのまま %02x にすると 3 けた以上になって
    // "#rrggbb" の形が崩れ、JS 側（iphone.js）で代わりの色 #68716a に化ける。r・g・b を 0〜1 に収めてから変換する。
    private func hexByte(_ v: CGFloat) -> Int {
        let c = v.isNaN ? 0 : min(max(v, 0), 1)
        return Int((c * 255).rounded())
    }

    private func hexColor(_ cg: CGColor?) -> String {
        guard let cg = cg else { return DuoNativePlugin.fallbackColor }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if UIColor(cgColor: cg).getRed(&r, green: &g, blue: &b, alpha: &a) {
            return String(format: "#%02x%02x%02x", hexByte(r), hexByte(g), hexByte(b))
        }
        if let space = CGColorSpace(name: CGColorSpace.sRGB),
           let conv = cg.converted(to: space, intent: .defaultIntent, options: nil),
           let comps = conv.components, comps.count >= 3 {
            return String(format: "#%02x%02x%02x", hexByte(comps[0]), hexByte(comps[1]), hexByte(comps[2]))
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
            let defaultId = self.store.defaultCalendarForNewEvents?.calendarIdentifier
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
                    "allowsModify": c.allowsContentModifications,
                    "isDefault": defaultId != nil && c.calendarIdentifier == defaultId
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
                guard let r = self.serializeEvent(ev, f, cal) else { continue }
                if ev.isAllDay {
                    // 取得範囲との重なりを再確認（[from, to)）。
                    if r.start >= to || r.end < cal.startOfDay(for: from) { continue }
                }
                guard let id = r.dict["id"] as? String else { continue }
                if !seen.insert(id).inserted { continue }
                out.append(r.dict)
            }
            call.resolve(["events": out])
        }
    }

    /// list / get 共通の直列化（RawEvent）。終日の end は「含む最終日」の 00:00（EventKit 内部は排他的 end）。
    /// 返す start / end は直列化後の Date（範囲の再確認用）。
    private func serializeEvent(_ ev: EKEvent, _ f: DateFormatter, _ cal: Calendar) -> (dict: [String: Any], start: Date, end: Date)? {
        guard let start = ev.startDate, let rawEnd = ev.endDate else { return nil }
        var end = rawEnd
        var startOut = start
        if ev.isAllDay {
            startOut = cal.startOfDay(for: start)
            let sod = cal.startOfDay(for: rawEnd)
            if rawEnd == sod && rawEnd > start {
                end = cal.date(byAdding: .day, value: -1, to: sod) ?? sod
            } else {
                end = sod
            }
            if end < startOut { end = startOut }
        }
        let eventId = ev.eventIdentifier ?? ""
        let startStr = f.string(from: startOut)
        var requestId: Any = NSNull()
        if let u = ev.url?.absoluteString, u.hasPrefix(DuoNativePlugin.urlPrefix) {
            requestId = String(u.dropFirst(DuoNativePlugin.urlPrefix.count))
        }
        let dict: [String: Any] = [
            "id": "\(eventId)@\(startStr)",
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
            "occurrenceDate": stampOrNull(ev.occurrenceDate, f),
            "modifiedAt": msOrNull(ev.lastModifiedDate)
        ]
        return (dict, startOut, end)
    }

    /// 通知の逆変換。変換できるものを最大2件。絶対日時・場所・範囲外・分単位でない・3件目以降は extra に数える。
    private func reverseAlarms(_ ev: EKEvent) -> (alarms: [[String: Any]], extra: Int) {
        var out: [[String: Any]] = []
        var extra = 0
        for a in ev.alarms ?? [] {
            if a.absoluteDate != nil || a.structuredLocation != nil || a.proximity != .none { extra += 1; continue }
            let off = a.relativeOffset
            guard off == off.rounded(), Int(off) % 60 == 0 else { extra += 1; continue }
            let o = Int(off)
            var item: [String: Any]? = nil
            if ev.isAllDay {
                // day = ceil(-offset/86400)、at = offset + day*86400（day 0〜30）。
                let day = Int((Double(-o) / 86400).rounded(.up))
                let sec = o + day * 86400
                if day >= 0, day <= 30, sec >= 0, sec < 86400 {
                    item = ["day": day, "at": String(format: "%02d:%02d", sec / 3600, (sec % 3600) / 60)]
                }
            } else if o <= 0, -o / 60 <= 40320 {
                item = ["before": -o / 60]
            }
            if let it = item, out.count < 2 { out.append(it) } else { extra += 1 }
        }
        return (out, extra)
    }

    /// 規則の逆変換。完全に Duo の規則で表せるときだけ rule、そうでなければ nil（ruleText は常に付ける）。
    private func reverseRule(_ ev: EKEvent, _ cal: Calendar) -> (rule: Any, text: String) {
        let rules = ev.recurrenceRules ?? []
        guard let r = rules.first else { return (NSNull(), "") }
        let unit: String
        let each: String
        switch r.frequency {
        case .daily: unit = "daily"; each = "日"
        case .weekly: unit = "weekly"; each = "週間"
        case .monthly: unit = "monthly"; each = "か月"
        case .yearly: unit = "yearly"; each = "年"
        @unknown default: unit = ""; each = ""
        }
        let plainEach: String = { switch r.frequency {
            case .daily: return "毎日"
            case .weekly: return "毎週"
            case .monthly: return "毎月"
            case .yearly: return "毎年"
            @unknown default: return "繰り返し" } }()
        var text = r.interval > 1 ? "\(r.interval)\(each)ごと" : plainEach
        if rules.count > 1 { text += "（ほか\(rules.count - 1)件の規則）" }

        func empty(_ a: [NSNumber]?) -> Bool { return a == nil || a!.isEmpty }
        let anchor = ev.startDate ?? Date()
        let comps = cal.dateComponents([.month, .day], from: anchor)
        var ok = rules.count == 1 && !unit.isEmpty && r.interval == 1
            && empty(r.weeksOfTheYear) && empty(r.daysOfTheYear) && empty(r.setPositions)
        var byDay: [Int]? = nil
        if ok {
            switch r.frequency {
            case .daily:
                ok = (r.daysOfTheWeek ?? []).isEmpty && empty(r.daysOfTheMonth) && empty(r.monthsOfTheYear)
            case .weekly:
                ok = empty(r.daysOfTheMonth) && empty(r.monthsOfTheYear)
                let days = r.daysOfTheWeek ?? []
                if ok, days.contains(where: { $0.weekNumber != 0 }) { ok = false }
                if ok, !days.isEmpty { byDay = Array(Set(days.map { $0.dayOfTheWeek.rawValue - 1 })).sorted() }
            case .monthly:
                ok = (r.daysOfTheWeek ?? []).isEmpty && empty(r.monthsOfTheYear)
                if ok, let dm = r.daysOfTheMonth, !dm.isEmpty { ok = dm.count == 1 && dm[0].intValue == comps.day }
            case .yearly:
                ok = (r.daysOfTheWeek ?? []).isEmpty
                if ok, let dm = r.daysOfTheMonth, !dm.isEmpty { ok = dm.count == 1 && dm[0].intValue == comps.day }
                if ok, let mo = r.monthsOfTheYear, !mo.isEmpty { ok = mo.count == 1 && mo[0].intValue == comps.month }
            @unknown default:
                ok = false
            }
        }
        guard ok else { return (NSNull(), text) }
        var d: [String: Any] = ["freq": unit]
        if let b = byDay { d["byDay"] = b }
        if let e = r.recurrenceEnd {
            if e.occurrenceCount > 0 {
                d["count"] = e.occurrenceCount
            } else if let ed = e.endDate {
                let df = DateFormatter()
                df.calendar = Calendar(identifier: .gregorian)
                df.locale = Locale(identifier: "en_US_POSIX")
                df.timeZone = TimeZone.current
                df.dateFormat = "yyyy-MM-dd"
                d["until"] = df.string(from: ed)
            }
        }
        return (d, text)
    }

    /// iPhone 由来（ext）の予定の特定。URL は使わない。itemId → externalId → eventId の順で系列を取り、
    /// occurrenceStart と currentStart それぞれの前後 [-1日, +2日] の窓の和集合から occurrenceDate で回を選ぶ。
    /// externalId が複数なら選ばず曖昧。動かした回を start では同定しない。呼ぶのは EventKit の直列 queue 上。
    private func findExtTarget(itemId: String, externalId: String, eventId: String,
                               occ: String, occDate: Date, curDate: Date, _ f: DateFormatter) -> Found {
        var base: EKEvent? = nil
        if !itemId.isEmpty, let it = store.calendarItem(withIdentifier: itemId) as? EKEvent {
            base = it
        } else if !externalId.isEmpty {
            let items = store.calendarItems(withExternalIdentifier: externalId).compactMap { $0 as? EKEvent }
            if items.count == 1 { base = items[0] } else if items.count > 1 { return .ambiguous }
        }
        if base == nil, !eventId.isEmpty, let e = store.event(withIdentifier: eventId) { base = e }
        guard let b = base else { return .notFound }
        let ext = b.calendarItemExternalIdentifier ?? ""
        var seen = Set<String>()
        var matches: [EKEvent] = []
        for d in [occDate, curDate] {
            let p = store.predicateForEvents(withStart: d.addingTimeInterval(-86400), end: d.addingTimeInterval(86400 * 2), calendars: nil)
            for e in store.events(matching: p) {
                let same = e.calendarItemIdentifier == b.calendarItemIdentifier
                    || (!ext.isEmpty && e.calendarItemExternalIdentifier == ext)
                guard same, let od = e.occurrenceDate ?? e.startDate else { continue }
                let stamp = f.string(from: od)
                guard stamp == occ || (e.isAllDay && stamp.prefix(10) == occ.prefix(10)) else { continue }
                let key = e.calendarItemIdentifier + "@" + stamp
                if seen.insert(key).inserted { matches.append(e) }
            }
        }
        if matches.count == 1 { return .found(matches[0]) }
        if matches.count > 1 { return .ambiguous }
        if !b.hasRecurrenceRules { return .found(b) }
        return .notFound
    }

    @objc func getEvent(_ call: CAPPluginCall) {
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        let itemId = call.getString("itemId") ?? ""
        let externalId = call.getString("externalId") ?? ""
        let eventId = call.getString("eventId") ?? ""
        guard !(itemId.isEmpty && externalId.isEmpty && eventId.isEmpty),
              let occ = call.getString("occurrenceStart"), let occDate = parse(occ, f),
              let cur = call.getString("currentStart"), let curDate = parse(cur, f) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        queue.async { [weak self] in
            guard let self = self else { return }
            switch self.findExtTarget(itemId: itemId, externalId: externalId, eventId: eventId,
                                      occ: occ, occDate: occDate, curDate: curDate, f) {
            case .notFound:
                call.reject("event not found", "NOT_FOUND")
            case .ambiguous:
                call.reject("event is ambiguous", "UNAVAILABLE")
            case .found(let ev):
                let cal = self.makeCalendar()
                guard let r = self.serializeEvent(ev, f, cal) else {
                    call.reject("event not found", "NOT_FOUND")
                    return
                }
                var d = r.dict
                let al = self.reverseAlarms(ev)
                let rr = self.reverseRule(ev, cal)
                let calendar = ev.calendar
                let sourceType = calendar?.source != nil ? self.sourceTypeString(calendar!.source.sourceType) : "unknown"
                let allowsModify = calendar?.allowsContentModifications ?? false
                let hasAttendees = !(ev.attendees ?? []).isEmpty
                let isOrganizer = ev.organizer?.isCurrentUser ?? false
                let reason: Any = self.editReason(ev) ?? NSNull()
                // 系列の先頭は EventKit から一意に取れたときだけ（規則からは推測しない）。
                var seriesStart: Any = NSNull()
                if !ev.hasRecurrenceRules {
                    seriesStart = d["start"] as Any
                } else if !ev.isDetached,
                          let head = self.store.calendarItem(withIdentifier: ev.calendarItemIdentifier) as? EKEvent,
                          head.hasRecurrenceRules, let hs = head.startDate {
                    seriesStart = f.string(from: head.isAllDay ? cal.startOfDay(for: hs) : hs)
                }
                d["alarms"] = al.alarms
                d["alarmsExtra"] = al.extra
                d["rule"] = rr.rule
                d["ruleText"] = rr.text
                d["detached"] = ev.isDetached
                d["allowsModify"] = allowsModify
                d["sourceType"] = sourceType
                d["hasAttendees"] = hasAttendees
                d["isOrganizer"] = isOrganizer
                d["hasUrl"] = ev.url != nil
                d["editable"] = reason is NSNull
                d["reason"] = reason
                d["seriesStart"] = seriesStart
                call.resolve(d)
            }
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

    /// 作成内容の指紋（createEvent / createEvents で共有）。alarms 未指定なら旧版と同じ原文（legacy と同じ）。
    private func createFingerprints(calendarId: String, title: String, startRaw: String, endRaw: String, allDay: Bool,
                                    place: String, notes: String, offsets: [TimeInterval]?, recCanon: String?) -> (fp: String, legacy: String) {
        let baseFingerprint = [calendarId, title, startRaw, endRaw, allDay ? "1" : "0", place, notes].joined(separator: "\u{1F}")
        var fingerprint = baseFingerprint
        if let offs = offsets {
            fingerprint += "\u{1E}alarms:" + offs.map { String(Int($0)) }.sorted().joined(separator: ",")
        }
        // 単発（recurrence なし）は従来と同じ原文のまま。規則ありだけ正規化した規則を足す。
        if let c = recCanon { fingerprint += "\u{1E}rec:" + c }
        return (sha256Hex(fingerprint), sha256Hex(baseFingerprint))
    }

    /// 保存する開始・終了。終日は開始日 00:00〜最終日 23:59:59（JS の end は最終日 00:00）。
    private func createDates(start: Date, end: Date, allDay: Bool, cal: Calendar) -> (Date, Date) {
        guard allDay else { return (start, end) }
        let startDate = cal.startOfDay(for: start)
        let lastDay = cal.startOfDay(for: end)
        let nextDay = cal.date(byAdding: .day, value: 1, to: lastDay) ?? lastDay.addingTimeInterval(86400)
        var endDate = nextDay.addingTimeInterval(-1)
        if endDate < startDate { endDate = startDate }
        return (startDate, endDate)
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
        let fps = createFingerprints(calendarId: calendarId, title: title, startRaw: call.getString("start") ?? "", endRaw: call.getString("end") ?? "",
                                     allDay: allDay, place: place, notes: notes, offsets: offsets, recCanon: recCanon)
        let fp = fps.fp
        let legacyFp = fps.legacy

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
            let (startDate, endDate) = self.createDates(start: start, end: end, allDay: allDay, cal: cal)
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

    /// 型A（Duo の予定の iPhone 側）をまとめて作る。全件の入力検査 → queue 上で各件 save(commit:false) → commit 1回 → 記録。
    /// 型B（copyFrom: iPhone 予定を出席者なしで複製）は型Aの一括 commit の後に1件ずつ commit:true → 直ちに rid 記録（URL は利用者の値を残すため印なし）。
    /// commit 成功〜記録直前に強制終了すると型Bは重複しうる（実機確認事項）。recurrence キーは拒否。
    @objc func createEvents(_ call: CAPPluginCall) {
        migrateCreatedAsync()
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        struct Item {
            let requestId: String, calendarId: String, title: String, startRaw: String, endRaw: String
            let start: Date, end: Date, allDay: Bool, place: String, notes: String, offsets: [TimeInterval]?
            var copy: (itemId: String, externalId: String, eventId: String, occ: String, occDate: Date, cur: String, curDate: Date)? = nil
        }
        guard let rawItems = call.getArray("items"), rawItems.count >= 1, rawItems.count <= 31 else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        var items: [Item] = []
        var seen = Set<String>()
        for raw in rawItems {
            guard let d = raw as? [String: Any],
                  d["recurrence"] == nil,
                  let requestId = d["requestId"] as? String, !requestId.isEmpty, requestId.count <= 100,
                  seen.insert(requestId).inserted,
                  let startRaw = d["start"] as? String, let endRaw = d["end"] as? String,
                  let start = parse(startRaw, f), let end = parse(endRaw, f), end >= start else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            if let a = d["all"], !(a is NSNull), !(a is Bool || a is NSNumber) {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            let allDay = (d["all"] as? Bool) ?? false
            if let cf = d["copyFrom"] {
                // 型B: 題名・場所・メモ・通知などの内容キーは持てない（元から複製する）。
                guard let c = cf as? [String: Any],
                      d["alarms"] == nil, d["title"] == nil, d["place"] == nil, d["notes"] == nil, d["calendarId"] == nil,
                      let occ = c["occurrenceStart"] as? String, let occDate = parse(occ, f),
                      let cur = c["currentStart"] as? String, let curDate = parse(cur, f) else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                let iid = (c["itemId"] as? String) ?? "", eid = (c["externalId"] as? String) ?? "", evid = (c["eventId"] as? String) ?? ""
                guard !(iid.isEmpty && eid.isEmpty && evid.isEmpty) else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                var it = Item(requestId: requestId, calendarId: "", title: "", startRaw: startRaw, endRaw: endRaw,
                              start: start, end: end, allDay: allDay, place: "", notes: "", offsets: nil)
                it.copy = (iid, eid, evid, occ, occDate, cur, curDate)
                items.append(it)
                continue
            }
            guard let calendarId = d["calendarId"] as? String, !calendarId.isEmpty,
                  let title = d["title"] as? String else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            var offsets: [TimeInterval]? = nil
            if let a = d["alarms"], !(a is NSNull) {
                guard let arr = a as? [Any] else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                let parsed = parseAlarms(arr, allDay: allDay)
                if parsed.invalid {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                offsets = parsed.offsets
            }
            items.append(Item(requestId: requestId, calendarId: calendarId, title: title, startRaw: startRaw, endRaw: endRaw,
                              start: start, end: end, allDay: allDay, place: (d["place"] as? String) ?? "",
                              notes: (d["notes"] as? String) ?? "", offsets: offsets))
        }

        queue.async { [weak self] in
            guard let self = self else { return }
            let cal = self.makeCalendar()
            var results = [[String: Any]?](repeating: nil, count: items.count)
            var pending: [(index: Int, event: EKEvent, fp: String)] = []
            func fail(_ i: Int, _ code: String) { results[i] = ["requestId": items[i].requestId, "ok": false, "code": code] }
            func succeed(_ i: Int, _ reply: [String: Any]) {
                var r = reply
                r.removeValue(forKey: "occurrenceDate")
                r["requestId"] = items[i].requestId
                r["ok"] = true
                results[i] = r
            }
            let records = self.loadCreated()
            for (i, it) in items.enumerated() {
                if it.copy != nil { continue }
                let fps = self.createFingerprints(calendarId: it.calendarId, title: it.title, startRaw: it.startRaw, endRaw: it.endRaw,
                                                  allDay: it.allDay, place: it.place, notes: it.notes, offsets: it.offsets, recCanon: nil)
                // 1) 記録済み: 作り直さない（内容違いは失敗）
                if let done = records[it.requestId] {
                    let doneFp = done["fp"] as? String
                    let doneItem = done["itemId"] as? String ?? ""
                    let migrated = doneItem.isEmpty
                    guard doneFp == fps.fp || (migrated && it.offsets != nil && doneFp == fps.legacy) else {
                        fail(i, "INVALID_ARGUMENT")
                        continue
                    }
                    let eid = done["eventId"] as? String ?? ""
                    let ev = eid.isEmpty ? nil : self.store.event(withIdentifier: eid)
                    let reply = self.createdReply(ev, itemId: doneItem, eventId: eid, calendarId: it.calendarId, f)
                    if migrated, let newItem = reply["itemId"] as? String, !newItem.isEmpty {
                        self.saveCreated(it.requestId, itemId: newItem, eventId: eid, fp: doneFp ?? fps.fp)
                    }
                    succeed(i, reply)
                    continue
                }
                guard let calendar = self.store.calendar(withIdentifier: it.calendarId) else { fail(i, "CALENDAR_NOT_FOUND"); continue }
                guard calendar.allowsContentModifications else { fail(i, "READ_ONLY"); continue }
                let (startDate, endDate) = self.createDates(start: it.start, end: it.end, allDay: it.allDay, cal: cal)
                let marker = DuoNativePlugin.urlPrefix + it.requestId
                // 2) URL の印で既存の作成物を回収
                let probe = self.store.predicateForEvents(withStart: startDate.addingTimeInterval(-86400), end: endDate.addingTimeInterval(86400 * 2), calendars: [calendar])
                var recovered = false
                for ev in self.store.events(matching: probe) where ev.url?.absoluteString == marker {
                    let existing = ev.eventIdentifier ?? ""
                    if !existing.isEmpty {
                        self.saveCreated(it.requestId, itemId: ev.calendarItemIdentifier, eventId: existing, fp: fps.fp)
                        succeed(i, self.createdReply(ev, itemId: ev.calendarItemIdentifier, eventId: existing, calendarId: it.calendarId, f))
                        recovered = true
                        break
                    }
                }
                if recovered { continue }
                // 3) 作成（保存は commit:false）
                let event = EKEvent(eventStore: self.store)
                event.calendar = calendar
                event.title = it.title
                event.isAllDay = it.allDay
                event.startDate = startDate
                event.endDate = endDate
                if !it.place.isEmpty { event.location = it.place }
                if !it.notes.isEmpty { event.notes = it.notes }
                event.url = URL(string: marker)
                if let offs = it.offsets { event.alarms = offs.map { EKAlarm(relativeOffset: $0) } }
                do {
                    try self.store.save(event, span: .thisEvent, commit: false)
                    pending.append((i, event, fps.fp))
                } catch {
                    fail(i, "UNAVAILABLE")
                }
            }
            // 4) commit は1回。失敗なら reset して保存待ち全件を UNAVAILABLE
            if !pending.isEmpty {
                do {
                    try self.store.commit()
                    for p in pending {
                        let newId = p.event.eventIdentifier ?? ""
                        if newId.isEmpty { fail(p.index, "UNAVAILABLE"); continue }
                        // 5) 記録は commit 成功後
                        self.saveCreated(items[p.index].requestId, itemId: p.event.calendarItemIdentifier, eventId: newId, fp: p.fp)
                        succeed(p.index, self.createdReply(p.event, itemId: p.event.calendarItemIdentifier, eventId: newId, calendarId: items[p.index].calendarId, f))
                    }
                } catch {
                    self.store.reset()
                    for p in pending { fail(p.index, "UNAVAILABLE") }
                }
            }
            // 型B: 型Aの commit の後に1件ずつ。書込可否は元のカレンダーで判定し、出席者ありでも複製できる。
            for (i, it) in items.enumerated() {
                guard let c = it.copy else { continue }
                let fp = self.sha256Hex(["copy", c.itemId, c.externalId, c.eventId, c.occ, c.cur, it.startRaw, it.endRaw, it.allDay ? "1" : "0"].joined(separator: "\u{1F}"))
                if let done = self.loadCreated()[it.requestId] {
                    guard done["fp"] as? String == fp else { fail(i, "INVALID_ARGUMENT"); continue }
                    let eid = done["eventId"] as? String ?? ""
                    let ev = eid.isEmpty ? nil : self.store.event(withIdentifier: eid)
                    succeed(i, self.createdReply(ev, itemId: done["itemId"] as? String ?? "", eventId: eid, calendarId: "", f))
                    continue
                }
                let src: EKEvent
                switch self.findExtTarget(itemId: c.itemId, externalId: c.externalId, eventId: c.eventId,
                                          occ: c.occ, occDate: c.occDate, curDate: c.curDate, f) {
                case .notFound: fail(i, "NOT_FOUND"); continue
                case .ambiguous: fail(i, "UNAVAILABLE"); continue
                case .found(let e): src = e
                }
                guard let calendar = src.calendar else { fail(i, "NOT_FOUND"); continue }
                guard calendar.allowsContentModifications else { fail(i, "READ_ONLY"); continue }
                let (startDate, endDate) = self.createDates(start: it.start, end: it.end, allDay: it.allDay, cal: cal)
                let event = EKEvent(eventStore: self.store)
                event.calendar = calendar
                event.title = src.title
                event.isAllDay = it.allDay
                event.startDate = startDate
                event.endDate = endDate
                if let l = src.location, !l.isEmpty { event.location = l }
                if let n = src.notes, !n.isEmpty { event.notes = n }
                event.url = src.url
                // 相対通知だけ写す（絶対・場所通知は省く）。終日の切替で意味が変わるときは写さない。出席者・繰返しは写さない。
                if src.isAllDay == it.allDay {
                    for a in src.alarms ?? [] where a.absoluteDate == nil && a.structuredLocation == nil && a.proximity == .none {
                        event.addAlarm(EKAlarm(relativeOffset: a.relativeOffset))
                    }
                }
                do {
                    try self.store.save(event, span: .thisEvent, commit: true)
                } catch {
                    self.store.reset()
                    fail(i, "UNAVAILABLE")
                    continue
                }
                let newId = event.eventIdentifier ?? ""
                if newId.isEmpty { fail(i, "UNAVAILABLE"); continue }
                self.saveCreated(it.requestId, itemId: event.calendarItemIdentifier, eventId: newId, fp: fp)
                succeed(i, self.createdReply(event, itemId: event.calendarItemIdentifier, eventId: newId, calendarId: calendar.calendarIdentifier, f))
            }
            call.resolve(["results": results.map { $0 ?? [:] }])
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
        // calendarId は結びつき先（照合・エラー判定用）。別のカレンダーへ移すときだけ moveCalendarId を渡す。
        if has(call, "moveCalendarId") && (call.getString("moveCalendarId") ?? "").isEmpty {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let moveCalendarId: String? = has(call, "moveCalendarId") ? call.getString("moveCalendarId") : nil

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

            // 移動は書込可能な存在する先だけ。繰り返しは all のみ（この回・これ以降では系列を分けない）。すでにその先なら何もしない。
            var moveTo: EKCalendar? = nil
            if let cid = moveCalendarId, cid != ev.calendar?.calendarIdentifier {
                if wasRecurring && span != "all" {
                    call.reject("cannot move one part of a series", "INVALID_ARGUMENT")
                    return
                }
                guard let d = self.store.calendar(withIdentifier: cid) else {
                    call.reject("calendar not found", "CALENDAR_NOT_FOUND")
                    return
                }
                guard d.allowsContentModifications else {
                    call.reject("calendar is read only", "READ_ONLY")
                    return
                }
                moveTo = d
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

            if let d = moveTo { ev.calendar = d }
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

    // MARK: - iPhone 由来（ext）の更新・削除（第13版 PR2）

    /// 編集できない理由（getEvent の reason と同じ判定）。nil なら編集できる。保存・削除の直前にも呼ぶ。
    private func editReason(_ ev: EKEvent) -> String? {
        let calendar = ev.calendar
        let sourceType = calendar?.source != nil ? sourceTypeString(calendar!.source.sourceType) : "unknown"
        if sourceType == "birthdays" || calendar?.type == .birthday { return "birthdays" }
        if !(calendar?.allowsContentModifications ?? false) { return "readOnlyCalendar" }
        if !(ev.attendees ?? []).isEmpty {
            return (ev.organizer?.isCurrentUser ?? false) ? "organizerWithAttendees" : "invitee"
        }
        return nil
    }

    /// 編集不可なら reject して true。読み取り専用のカレンダーは READ_ONLY、出席者ありは NOT_EDITABLE。reason は data に載せる。
    private func rejectIfNotEditable(_ call: CAPPluginCall, _ ev: EKEvent) -> Bool {
        guard let r = editReason(ev) else { return false }
        let code = (r == "invitee" || r == "organizerWithAttendees") ? "NOT_EDITABLE" : "READ_ONLY"
        call.reject(code == "READ_ONLY" ? "calendar is read only" : "event is not editable", code, nil, ["reason": r])
        return true
    }

    /// 繰り返しの系列の先頭（all の操作対象）。EventKit から一意に取れたときだけ。取れなければ nil。
    private func seriesHead(_ ev: EKEvent) -> EKEvent? {
        if ev.isDetached {
            // 個別に変えた回: 同じ externalId で、個別変更でない繰り返しの親が1件だけのときその親を使う。複数なら選ばない。
            let ext = ev.calendarItemExternalIdentifier ?? ""
            guard !ext.isEmpty else { return nil }
            let heads = store.calendarItems(withExternalIdentifier: ext).compactMap { $0 as? EKEvent }
                .filter { !$0.isDetached && $0.hasRecurrenceRules && $0.startDate != nil && $0.endDate != nil }
            return heads.count == 1 ? heads[0] : nil
        }
        guard ev.hasRecurrenceRules,
              let head = store.calendarItem(withIdentifier: ev.calendarItemIdentifier) as? EKEvent,
              head.hasRecurrenceRules, head.startDate != nil, head.endDate != nil,
              head.calendarItemIdentifier == ev.calendarItemIdentifier else { return nil }
        return head
    }

    /// 日時の反映（終日は createEvent と同じ変換：end の入力は含む最終日 00:00、保存は最終日 23:59:59）。
    private func applyDates(_ ev: EKEvent, start s: Date, end e: Date, all: Bool, cal: Calendar) -> Bool {
        if all {
            let startDate = cal.startOfDay(for: s)
            let lastDay = cal.startOfDay(for: e)
            let next = cal.date(byAdding: .day, value: 1, to: lastDay) ?? lastDay.addingTimeInterval(86400)
            ev.isAllDay = true
            ev.startDate = startDate
            ev.endDate = max(next.addingTimeInterval(-1), startDate)
            return true
        }
        guard e >= s else { return false }
        ev.isAllDay = false
        ev.startDate = s
        ev.endDate = e
        return true
    }

    /// 対象の回（この回・これ以降・単発）の日時。送られた項目だけ変え、無い項目は現在値から導く。不正は nil。
    private func resolveDates(_ ev: EKEvent, newStart: Date?, newEnd: Date?, givenAll: Bool?, cal: Calendar) -> (start: Date, end: Date, all: Bool)? {
        let targetAll = givenAll ?? ev.isAllDay
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
        if !targetAll && e < s { return nil }
        return (s, e, targetAll)
    }

    /// all の日時変更。開いた回の絶対日付を先頭へ入れず、開いた回の未変更値（base）からの差分を先頭へ足す。
    /// 日の差は暦、長さの差は秒。終日切替は新しい開始日の差だけ先頭へ足し、長さは新しい値を使う。不正は nil。
    private func resolveHeadDates(_ head: EKEvent, base: (start: Date, end: Date, all: Bool),
                                  newStart: Date?, newEnd: Date?, givenAll: Bool?, cal: Calendar) -> (start: Date, end: Date, all: Bool)? {
        let targetAll = givenAll ?? base.all
        // 開いた回の「新しい」開始・終了（end は終日なら含む最終日 00:00）。
        let nStart = newStart ?? base.start
        let nEnd: Date
        if let ne = newEnd {
            nEnd = ne
        } else if newStart != nil, !targetAll, !base.all {
            nEnd = nStart.addingTimeInterval(base.end.timeIntervalSince(base.start))
        } else if newStart != nil, targetAll, base.all {
            let days = cal.dateComponents([.day], from: cal.startOfDay(for: base.start), to: cal.startOfDay(for: base.end)).day ?? 0
            nEnd = cal.date(byAdding: .day, value: days, to: cal.startOfDay(for: nStart)) ?? nStart
        } else if targetAll != base.all {
            nEnd = targetAll ? cal.startOfDay(for: nStart) : nStart.addingTimeInterval(3600)
        } else {
            nEnd = base.end
        }
        if !targetAll && nEnd < nStart { return nil }
        guard let hs = head.startDate, let he = head.endDate else { return nil }
        let dayShift = cal.dateComponents([.day], from: cal.startOfDay(for: base.start), to: cal.startOfDay(for: nStart)).day ?? 0
        let headDay = cal.date(byAdding: .day, value: dayShift, to: cal.startOfDay(for: hs)) ?? hs
        if targetAll {
            // 先頭の長さ（日数）に、開いた回の長さの差を足す。切替時は新しい長さをそのまま使う。
            let newLen = max(0, cal.dateComponents([.day], from: cal.startOfDay(for: nStart), to: cal.startOfDay(for: nEnd)).day ?? 0)
            var len = newLen
            if base.all && head.isAllDay {
                let baseLen = cal.dateComponents([.day], from: cal.startOfDay(for: base.start), to: cal.startOfDay(for: base.end)).day ?? 0
                let rawEnd = he
                let sod = cal.startOfDay(for: rawEnd)
                let last = (rawEnd == sod && rawEnd > hs) ? (cal.date(byAdding: .day, value: -1, to: sod) ?? sod) : sod
                let headLen = cal.dateComponents([.day], from: cal.startOfDay(for: hs), to: cal.startOfDay(for: last)).day ?? 0
                len = max(0, headLen + (newLen - baseLen))
            }
            return (headDay, cal.date(byAdding: .day, value: len, to: headDay) ?? headDay, true)
        }
        // 時刻あり: 開始は日の差＋開いた回の時刻の差、長さは秒の差。
        var newHeadStart: Date
        if base.all {
            let tod = cal.dateComponents([.hour, .minute], from: nStart)
            newHeadStart = cal.date(bySettingHour: tod.hour ?? 0, minute: tod.minute ?? 0, second: 0, of: headDay) ?? headDay
        } else {
            let dc = cal.dateComponents([.minute], from: cal.date(byAdding: .day, value: dayShift, to: base.start) ?? base.start, to: nStart)
            let shifted = cal.date(byAdding: .day, value: dayShift, to: hs) ?? hs
            newHeadStart = cal.date(byAdding: .minute, value: dc.minute ?? 0, to: shifted) ?? shifted
        }
        let baseDur = base.all ? 0 : base.end.timeIntervalSince(base.start)
        let newDur = nEnd.timeIntervalSince(nStart)
        let headDur = head.isAllDay ? 0 : he.timeIntervalSince(hs)
        let dur = base.all ? newDur : max(0, headDur + (newDur - baseDur))
        return (newHeadStart, newHeadStart.addingTimeInterval(dur), false)
    }

    private func parseBase(_ call: CAPPluginCall, _ f: DateFormatter) -> (value: (start: Date, end: Date, all: Bool)?, invalid: Bool) {
        guard has(call, "base") else { return (nil, false) }
        guard let o = call.getObject("base"), let s = parse(o["start"] as? String, f), let e = parse(o["end"] as? String, f),
              let a = o["all"] as? Bool else { return (nil, true) }
        return ((s, e, a), false)
    }

    @objc func updateExternalEvent(_ call: CAPPluginCall) {
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        let itemId = call.getString("itemId") ?? ""
        let externalId = call.getString("externalId") ?? ""
        let eventId = call.getString("eventId") ?? ""
        guard !(itemId.isEmpty && externalId.isEmpty && eventId.isEmpty),
              let span = call.getString("span"), ["this", "future", "all"].contains(span),
              let occ = call.getString("occurrenceStart"), let occDate = parse(occ, f),
              let cur = call.getString("currentStart"), let curDate = parse(cur, f),
              call.options["recurrence"] == nil else {
            // recurrence は null でもキーがあれば不正（規則の変更はしない）。
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let newStart: Date? = has(call, "start") ? parse(call.getString("start"), f) : nil
        let newEnd: Date? = has(call, "end") ? parse(call.getString("end"), f) : nil
        if (has(call, "start") && newStart == nil) || (has(call, "end") && newEnd == nil) {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        if has(call, "all") && call.options["all"] as? Bool == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        for k in ["title", "place", "notes", "calendarId"] where has(call, k) && call.options[k] as? String == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let givenAll: Bool? = has(call, "all") ? call.getBool("all") : nil
        let newTitle: String? = has(call, "title") ? call.getString("title") : nil
        let newPlace: String? = has(call, "place") ? call.getString("place") : nil
        let newNotes: String? = has(call, "notes") ? call.getString("notes") : nil
        let newCalendarId: String? = has(call, "calendarId") ? call.getString("calendarId") : nil
        if let c = newCalendarId, c.isEmpty {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let alarmsGiven = has(call, "alarms")
        if alarmsGiven && call.getArray("alarms") == nil {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let rawAlarms = call.getArray("alarms")
        let baseParsed = parseBase(call, f)
        if baseParsed.invalid {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let expect = (call.options["expectModified"] as? NSNumber)?.doubleValue
        let dateChange = newStart != nil || newEnd != nil || givenAll != nil

        queue.async { [weak self] in
            guard let self = self else { return }
            let cal = self.makeCalendar()
            let found = self.findExtTarget(itemId: itemId, externalId: externalId, eventId: eventId,
                                           occ: occ, occDate: occDate, curDate: curDate, f)
            var ev: EKEvent
            switch found {
            case .ambiguous:
                call.reject("target is ambiguous", "UNAVAILABLE")
                return
            case .notFound:
                call.reject("event not found", "NOT_FOUND")
                return
            case .found(let e):
                ev = e
            }
            let recurring = ev.hasRecurrenceRules || (span == "all" && ev.isDetached)
            // all の繰り返しは一意な系列の先頭を対象にする。取れなければ憶測しない。
            var useHead = false
            if span == "all" && (recurring || ev.isDetached) {
                guard let head = self.seriesHead(ev) else {
                    call.reject("series head is unavailable", "UNAVAILABLE")
                    return
                }
                ev = head
                useHead = true
            }
            // 保存直前に最新の状態で編集可否を再検査する。
            if self.rejectIfNotEditable(call, ev) { return }
            // 移動は書込可能な存在する先だけ。繰り返しは all のみ。
            var destination: EKCalendar? = nil
            if let cid = newCalendarId, cid != ev.calendar?.calendarIdentifier {
                if recurring && span != "all" {
                    call.reject("cannot move one part of a series", "INVALID_ARGUMENT")
                    return
                }
                guard let d = self.store.calendar(withIdentifier: cid) else {
                    call.reject("calendar not found", "CALENDAR_NOT_FOUND")
                    return
                }
                guard d.allowsContentModifications else {
                    call.reject("calendar is read only", "READ_ONLY", nil, ["reason": "readOnlyCalendar"])
                    return
                }
                destination = d
            }
            let conflicted = self.isConflict(ev, expect: expect)

            // 日時（先に計算して、不正なら何も変えずに返す）
            var dates: (start: Date, end: Date, all: Bool)? = nil
            if dateChange {
                if useHead {
                    guard let b = baseParsed.value,
                          let d = self.resolveHeadDates(ev, base: b, newStart: newStart, newEnd: newEnd, givenAll: givenAll, cal: cal) else {
                        call.reject("invalid arguments", "INVALID_ARGUMENT")
                        return
                    }
                    dates = d
                } else {
                    guard let d = self.resolveDates(ev, newStart: newStart, newEnd: newEnd, givenAll: givenAll, cal: cal) else {
                        call.reject("invalid arguments", "INVALID_ARGUMENT")
                        return
                    }
                    dates = d
                }
            }
            let targetAll = dates?.all ?? ev.isAllDay
            var offsets: [TimeInterval]? = nil
            if alarmsGiven {
                let parsed = self.parseAlarms(rawAlarms, allDay: targetAll)
                guard !parsed.invalid, let offs = parsed.offsets else {
                    call.reject("invalid arguments", "INVALID_ARGUMENT")
                    return
                }
                offsets = offs
            }

            // 共通の適用：送られた項目だけ。規則・URL・送られていない通知は触らない。
            if let t = newTitle { ev.title = t }
            if let p = newPlace { ev.location = p.isEmpty ? nil : p }
            if let n = newNotes { ev.notes = n.isEmpty ? nil : n }
            if let d = dates, !self.applyDates(ev, start: d.start, end: d.end, all: d.all, cal: cal) {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            if let offs = offsets { ev.alarms = offs.isEmpty ? nil : offs.map { EKAlarm(relativeOffset: $0) } }
            if let d = destination { ev.calendar = d }

            let ekSpan: EKSpan = (span == "this" || !recurring) ? .thisEvent : .futureEvents
            do {
                try self.store.save(ev, span: ekSpan, commit: true)
            } catch {
                call.reject("could not save the event", "UNAVAILABLE", error)
                return
            }
            _ = ev.refresh()
            var reply = self.createdReply(ev, itemId: ev.calendarItemIdentifier, eventId: ev.eventIdentifier ?? eventId,
                                          calendarId: newCalendarId ?? "", f)
            reply["conflicted"] = conflicted
            reply["alarmsApplied"] = ev.alarms?.count ?? 0
            call.resolve(reply)
        }
    }

    @objc func deleteExternalEvent(_ call: CAPPluginCall) {
        guard ensureAccess(call) else { return }
        let f = makeFormatter()
        let itemId = call.getString("itemId") ?? ""
        let externalId = call.getString("externalId") ?? ""
        let eventId = call.getString("eventId") ?? ""
        guard !(itemId.isEmpty && externalId.isEmpty && eventId.isEmpty),
              let span = call.getString("span"), ["this", "future", "all"].contains(span),
              let occ = call.getString("occurrenceStart"), let occDate = parse(occ, f),
              let cur = call.getString("currentStart"), let curDate = parse(cur, f) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let expect = (call.options["expectModified"] as? NSNumber)?.doubleValue
        let force = call.getBool("force") ?? false
        queue.async { [weak self] in
            guard let self = self else { return }
            var ev: EKEvent
            switch self.findExtTarget(itemId: itemId, externalId: externalId, eventId: eventId,
                                      occ: occ, occDate: occDate, curDate: curDate, f) {
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
            let recurring = ev.hasRecurrenceRules || (span == "all" && ev.isDetached)
            if span == "all" && (recurring || ev.isDetached) {
                guard let head = self.seriesHead(ev) else {
                    call.reject("series head is unavailable", "UNAVAILABLE")
                    return
                }
                ev = head
            }
            // force でも、再取得した最新の状態で編集可否を再検査する。
            if self.rejectIfNotEditable(call, ev) { return }
            if !force && self.isConflict(ev, expect: expect) {
                call.reject("event was modified on the device", "CONFLICT")
                return
            }
            let ekSpan: EKSpan = (span == "this" || !recurring) ? .thisEvent : .futureEvents
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

    // MARK: - 折り状態（第16版 PR10）

    /// 現在の折り状態を返す。Posture の形は design/IMPL_PLAN_V16.md PR10。未対応・view なしは available:false を resolve する。
    @objc func getPosture(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(DuoNativePlugin.unsupportedPosture()); return }
            // 起動時の設置に失敗していたら、ここで再設置する。
            if self.postureProbe == nil { self.installPostureProbe() }
            let p = self.currentPosture()
            self.lastEmittedPosture = p // 取得で得た値を基準にし、直後の同内容イベントを重複させない
            call.resolve(p)
        }
    }

    private static func nowMs() -> Int { Int((Date().timeIntervalSince1970 * 1000).rounded()) }

    private static func unsupportedPosture() -> [String: Any] {
        return [
            "available": false, "folded": false, "regionRect": NSNull(), "axis": NSNull(),
            "angle": NSNull(), "status": NSNull(), "source": "unsupported", "at": nowMs(),
            "groove": NSNull() // 未対応は null。開いた縦なら Web が 467〜484（fallback）を使う
        ]
    }

    /// main で呼ぶ。probe があればアクティブな division を読み、WebView 原点の CSS px へ変換する。
    private func currentPosture() -> [String: Any] {
        guard #available(iOS 27.1, *), let probe = postureProbe, probe.window != nil || probe.superview != nil else {
            return DuoNativePlugin.unsupportedPosture()
        }
        // 既定の問い合わせ（アクティブのみ）。UIKit はここで読んだ領域を追跡する。
        let region = probe.reservedRegions(kind: .division).first
        var rect: Any = NSNull()
        var axis: Any = NSNull()
        var folded = false
        if let region = region {
            folded = true
            // contentInset は never なので、WebView 左上原点の pt がそのまま CSS px。
            let target: UIView = bridge?.webView ?? probe
            let f = target === probe ? region.frame : target.convert(region.frame, from: probe)
            if f.width.isFinite && f.height.isFinite && f.origin.x.isFinite && f.origin.y.isFinite {
                rect = ["x": Double(f.origin.x), "y": Double(f.origin.y), "width": Double(f.width), "height": Double(f.height)]
                // 正方形（差 0.5 未満）は向きを決めない。
                if abs(f.width - f.height) >= 0.5 { axis = f.width > f.height ? "horizontal" : "vertical" }
            }
        }
        // 溝 [g0, g1]（D2）。開ききって inactive でも frame を取るため .includeInactive で読む。
        let webSize = (bridge?.webView ?? probe).bounds.size
        var groove: Any = NSNull()
        if let inactive = probe.reservedRegions(kind: .division, options: .includeInactive).first {
            let target: UIView = bridge?.webView ?? probe
            let gf = target === probe ? inactive.frame : target.convert(inactive.frame, from: probe)
            groove = DuoNativePlugin.groovePayload(webSize: webSize, frame: gf)
        }
        return [
            "available": true, "folded": folded, "regionRect": rect, "axis": axis,
            "angle": hingeAngleDegrees.map { (v: Double) -> Any in (v * 10).rounded() / 10 } ?? NSNull(),
            "status": hingeStatus ?? NSNull(),
            "source": "reservedRegions", "at": DuoNativePlugin.nowMs(),
            "groove": groove
        ]
    }

    /// 溝 [g0, g1]（CSS px）。開いた縦（短辺 600 以上で縦長。Web の layoutKind と同じ境）のときだけ値、ほかは null。
    /// 水平の溝として使えない矩形は fallback（467〜484）。高さ 17 未満（0 を含む）は中心 c から c±8.5。
    private static func groovePayload(webSize: CGSize, frame f: CGRect) -> Any {
        guard min(webSize.width, webSize.height) >= 600, webSize.height >= webSize.width else { return NSNull() }
        guard f.origin.y.isFinite, f.height.isFinite, f.width.isFinite, f.height >= 0, f.width > f.height + 0.5 else {
            return ["g0": 467.0, "g1": 484.0, "source": "fallback"]
        }
        var g0 = Double(f.origin.y), g1 = Double(f.origin.y + f.height)
        if g1 - g0 < 17 { let c = (g0 + g1) / 2; g0 = c - 8.5; g1 = c + 8.5 }
        return ["g0": g0, "g1": g1, "source": "native"]
    }

    /// 角度（ラジアン）を度へ。記録専用。レイアウトには使わない。
    static func degrees(fromRadians r: Double) -> Double { r * 180 / .pi }

    /// UIHinge の記録。folded や矩形の再計算はしない（変化通知も出さない）。
    func recordHinge(angleRadians: Double?, status: String?) {
        hingeAngleDegrees = angleRadians.map { DuoNativePlugin.degrees(fromRadians: $0) }
        hingeStatus = status
    }

    /// 同じ内容か（folded・available・axis が同じで、矩形差が 0.5px 未満）。angle/status/at は比べない。
    private func samePosture(_ a: [String: Any], _ b: [String: Any]) -> Bool {
        if (a["available"] as? Bool) != (b["available"] as? Bool) { return false }
        if (a["folded"] as? Bool) != (b["folded"] as? Bool) { return false }
        if (a["axis"] as? String) != (b["axis"] as? String) { return false }
        let ra = a["regionRect"] as? [String: Double], rb = b["regionRect"] as? [String: Double]
        if (ra == nil) != (rb == nil) { return false }
        if let ra = ra, let rb = rb {
            for k in ["x", "y", "width", "height"] where abs((ra[k] ?? 0) - (rb[k] ?? 0)) >= 0.5 { return false }
        }
        let ga = a["groove"] as? [String: Any], gb = b["groove"] as? [String: Any]
        if (ga == nil) != (gb == nil) { return false }
        if let ga = ga, let gb = gb {
            if (ga["source"] as? String) != (gb["source"] as? String) { return false }
            for k in ["g0", "g1"] where abs((ga[k] as? Double ?? 0) - (gb[k] as? Double ?? 0)) >= 0.5 { return false }
        }
        return true
    }

    /// probe の updateConstraints から呼ばれる（main）。初めての変化は遅らせず、同内容は送らない。
    fileprivate func postureProbeRegionsChanged() {
        let p = currentPosture()
        if let last = lastEmittedPosture, samePosture(last, p) { return }
        lastEmittedPosture = p
        notifyListeners("postureChange", data: p)
    }

    /// main で呼ぶ。iOS 27.1 以降で、全画面・非操作・非アクセシビリティの probe を VC の view へ載せる。
    private func installPostureProbe() {
        guard #available(iOS 27.1, *) else { return }
        if postureProbe?.superview != nil { return }
        guard let host = bridge?.viewController?.view else { return } // 無ければ getPosture で再試行
        let probe = DuoPostureProbeView()
        probe.owner = self
        probe.translatesAutoresizingMaskIntoConstraints = false
        probe.isUserInteractionEnabled = false
        probe.backgroundColor = .clear
        probe.isAccessibilityElement = false
        probe.accessibilityElementsHidden = true
        host.addSubview(probe)
        NSLayoutConstraint.activate([
            probe.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            probe.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            probe.topAnchor.constraint(equalTo: host.topAnchor),
            probe.bottomAnchor.constraint(equalTo: host.bottomAnchor)
        ])
        postureProbe = probe
    }

    // 触覚（第14版 PR27）。kind は 'light'（UISelectionFeedbackGenerator）/ 'warning'（UINotificationFeedbackGenerator）。main で実行する。
    @objc func selectionHaptic(_ call: CAPPluginCall) {
        guard let kind = call.getString("kind"), kind == "light" || kind == "warning" else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        DispatchQueue.main.async {
            if kind == "light" {
                let g = UISelectionFeedbackGenerator()
                g.prepare()
                g.selectionChanged()
            } else {
                let g = UINotificationFeedbackGenerator()
                g.prepare()
                g.notificationOccurred(.warning)
            }
            call.resolve(["performed": true])
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
        // 前面で鳴った Duo の通知だけ JS へ知らせ、予約を補充させる（本文・予定識別子は渡さない）。
        if notification.request.identifier.hasPrefix(Self.notifyPrefix) {
            notifyListeners("notificationPresented", data: [:])
        }
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

/// 折り状態の probe（第16版 PR10）。画面いっぱいで、タッチを透過し、VoiceOver に出さない。
/// 公式どおり updateConstraints() で division を読むと、UIKit が領域の変化でこれを再び呼ぶ。
@available(iOS 27.1, *)
final class DuoPostureProbeView: UIView {
    weak var owner: DuoNativePlugin?

    override func updateConstraints() {
        _ = reservedRegions(kind: .division) // 追跡の対象にする
        _ = reservedRegions(kind: .division, options: .includeInactive) // 溝用（開ききっても frame を追う）
        owner?.postureProbeRegionsChanged()
        super.updateConstraints()
    }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { false }
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }
}


// MARK: - iOS 本来のめくり（B、1段目の試作）
// 連携 第18弾（data/連携_第18弾_ネイティブめくりの呼び出し.md）の「1段目」の列だけ。指は Web が持ち、離したら turnPage → webReady で
// UIPageViewController（.pageCurl）の setViewControllers(animated: true) が自動でめくる。紙は指に付かない。時間・緩急・影は iOS のまま。
// 座標は web view 左上原点の pt（= CSS px。contentInset は never）。重ねるビューは撮った範囲だけに置き、clipsToBounds で紙と影を切る。
extension DuoNativePlugin {
    @objc func curlCaps(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let key = (Bundle.main.object(forInfoDictionaryKey: "CADisableMinimumFrameDurationOnPhone") as? Bool) ?? false
            call.resolve(["version": DuoCurlController.version, "stage": 1, "maxFps": UIScreen.main.maximumFramesPerSecond, "proMotionKey": key])
        }
    }
    @objc func prepareCurl(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.prepare(call) } }
    @objc func releaseCurl(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.release(); call.resolve(["ok": true]) } }
    @objc func turnPage(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.turnPage(call) } }
    @objc func backReady(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.backReady(call) } }
    @objc func webReady(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.webReady(call) } }
    @objc func cancelCurl(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.cancel(reason: call.getString("reason") ?? "cancel"); call.resolve(["ok": true]) } }
    @objc func curlPerf(_ call: CAPPluginCall) { DispatchQueue.main.async { self.curlCtl.perfEvents = call.getBool("on") ?? false; call.resolve(["ok": true]) } }
    fileprivate func emitCurl(_ name: String, _ data: [String: Any]) { notifyListeners(name, data: data) }
}

/// めくる紙1枚（撮った絵）、または次のページ（透明／撮った絵）。
final class DuoCurlPage: UIViewController {
    private let image: UIImage?
    init(image: UIImage?) { self.image = image; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { nil }
    override func loadView() {
        let v = UIImageView(image: image)
        v.contentMode = .scaleToFill
        // 紙は #FFFDFA（ダークでもライト。決定③）。次のページを透明にするときは背景も透明
        v.backgroundColor = image == nil ? .clear : UIColor(red: 1, green: 253 / 255, blue: 250 / 255, alpha: 1)
        v.isOpaque = image != nil
        v.isUserInteractionEnabled = false
        view = v
    }
}

/// コマの間隔を測る（めくっている間だけ）。1段目は iOS が描くので目安。Instruments の数字が正。
final class DuoFrameMeter: NSObject {
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    private(set) var gaps: [Double] = []
    private var once: (() -> Void)?
    func start() {
        stop(); gaps = []; last = 0
        let l = CADisplayLink(target: self, selector: #selector(tick(_:)))
        if #available(iOS 15.0, *) { l.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120) }
        l.add(to: .main, forMode: .common); link = l
    }
    /// 次の1コマで1回だけ呼ぶ
    func nextFrame(_ f: @escaping () -> Void) {
        stop(); once = f
        let l = CADisplayLink(target: self, selector: #selector(tick(_:)))
        l.add(to: .main, forMode: .common); link = l
    }
    @objc private func tick(_ l: CADisplayLink) {
        if let f = once { once = nil; stop(); f(); return }
        if last > 0 { gaps.append((l.timestamp - last) * 1000) }
        last = l.timestamp
    }
    func stop() { link?.invalidate(); link = nil }
}

final class DuoCurlController: NSObject {
    static let version = 2 // 2：18.3 に合わせた版（表はページ全体・動かない側の覆い・backReady で裏を撮る）
    weak var owner: DuoNativePlugin?
    var perfEvents = false
    private var key = ""
    private var gen = 0
    private var rects: [String: CGRect] = [:]
    private var snaps: [String: UIImage] = [:]
    private var waiters: [String: [(UIImage?) -> Void]] = [:]
    private var snapStart: CFTimeInterval = 0
    private var snapMs: Double = 0
    private var box: UIView?
    private var cover: UIView?   // 動かない側のページ（触れた瞬間に撮った絵）。着地まで止めておき、終わりに 0.15 秒で薄くする
    private var backImg: UIImage? // 紙の裏＝着地先のページ全体（backReady で撮る。1段目は isDoubleSided=false なので記録だけ）
    private var backMs: Double = 0
    private var pvc: UIPageViewController?
    private var turnRect: CGRect = .zero
    private var turnDir = "forward"
    private var nextMode = "clear"
    private var animDir: UIPageViewController.NavigationDirection = .forward
    private var turnId = 0
    private let meter = DuoFrameMeter()
    private let waiter = DuoFrameMeter()
    private let signposter = OSSignposter(subsystem: "com.maskeykim.duocalendar", category: "curl")

    init(owner: DuoNativePlugin) { self.owner = owner }
    private var webView: WKWebView? { owner?.bridge?.webView }
    private var host: UIView? { owner?.bridge?.viewController?.view }

    private static func rect(_ o: JSObject?) -> CGRect? {
        guard let o = o, let x = (o["x"] as? NSNumber)?.doubleValue, let y = (o["y"] as? NSNumber)?.doubleValue,
              let w = (o["w"] as? NSNumber)?.doubleValue, let h = (o["h"] as? NSNumber)?.doubleValue,
              x.isFinite, y.isFinite, w.isFinite, h.isFinite, w >= 1, h >= 1 else { return nil }
        return CGRect(x: x, y: y, width: w, height: h)
    }
    private static func now() -> CFTimeInterval { CACurrentMediaTime() }

    /// 触れた瞬間：進む用と戻る用を撮る。rev（Web の描き直し番号ほか）と範囲が同じなら撮らない。
    func prepare(_ call: CAPPluginCall) {
        guard let k = call.getString("rev"), let f = Self.rect(call.getObject("fwd")), let b = Self.rect(call.getObject("back")) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT"); return
        }
        if k == key, rects["fwd"] == f, rects["back"] == b, snaps["fwd"] != nil || waiters["fwd"] != nil, snaps["back"] != nil || waiters["back"] != nil {
            call.resolve(["ok": true, "reused": true]); return
        }
        key = k; rects = ["fwd": f, "back": b]
        shoot()
        call.resolve(["ok": true, "reused": false])
    }
    private func shoot() {
        gen += 1; snaps = [:]
        let g = gen
        snapStart = Self.now()
        let state = signposter.beginInterval("snapshot")
        var left = 2
        for name in ["fwd", "back"] {
            guard let r = rects[name] else { continue }
            if waiters[name] == nil { waiters[name] = [] }
            take(r) { [weak self] img in
                guard let self = self, g == self.gen else { return }
                self.snaps[name] = img
                let ws = self.waiters[name] ?? []; self.waiters[name] = nil
                for w in ws { w(img) }
                left -= 1
                if left == 0 {
                    self.signposter.endInterval("snapshot", state)
                    self.snapMs = (Self.now() - self.snapStart) * 1000
                    self.owner?.emitCurl("curlReady", ["rev": self.key, "ms": (self.snapMs * 10).rounded() / 10])
                }
            }
        }
    }
    private func take(_ r: CGRect, _ done: @escaping (UIImage?) -> Void) {
        guard let wv = webView else { done(nil); return }
        let cfg = WKSnapshotConfiguration()
        cfg.rect = r
        cfg.afterScreenUpdates = true
        wv.takeSnapshot(with: cfg) { img, _ in DispatchQueue.main.async { done(img) } }
    }
    private func image(_ name: String, _ cb: @escaping (UIImage?) -> Void) {
        if let i = snaps[name] { cb(i); return }
        if waiters[name] != nil { waiters[name]!.append(cb); return }
        guard let r = rects[name] else { cb(nil); return }
        take(r) { [weak self] img in self?.snaps[name] = img; cb(img) }
    }
    func release() { gen += 1; key = ""; rects = [:]; snaps = [:]; let ws = waiters; waiters = [:]; for (_, l) in ws { for w in l { w(nil) } } }

    /// 離して、めくると決めた：撮った紙を同じ位置に重ねる（まだ動かさない）。重なったら解決する（curlShown）。
    func turnPage(_ call: CAPPluginCall) {
        guard let dir = call.getString("dir"), dir == "forward" || dir == "backward", let r = Self.rect(call.getObject("rect")) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT"); return
        }
        cancel(reason: "replaced")
        let name = dir == "forward" ? "fwd" : "back", coverName = dir == "forward" ? "back" : "fwd"
        let coverRect = Self.rect(call.getObject("cover"))
        let rev = call.getString("rev") ?? ""
        // 押してから描き直した・範囲が違う：撮り直す
        if rev != key || rects[name] != r { let keep = rects; release(); rects = keep; key = rev; rects[name] = r }
        turnDir = dir; turnRect = r
        nextMode = call.getString("next") == "snap" ? "snap" : "clear"
        let spineMax = (call.getString("spine") ?? (dir == "forward" ? "min" : "max")) == "max"
        // 背が右端（.max）のときは .reverse で、今の紙が左の端から背へ巻き上がる（.forward では動かなかった。シミュレータで確認）
        animDir = (call.getString("animDir") ?? (spineMax ? "reverse" : "forward")) == "reverse" ? .reverse : .forward
        turnId += 1
        let id = turnId
        let t0 = Self.now()
        backImg = nil; backMs = 0
        image(name) { [weak self] img in
          guard let self = self, id == self.turnId else { call.reject("cancelled", "CANCELLED"); return }
          // 動かない側（進む＝左ページ、戻る＝右ページ）も撮ってある絵で覆う。その下で Web が着地先のページを出して裏を撮る（連携 第18弾 1.2）
          let wantCover = coverRect != nil && self.rects[coverName] == coverRect
          let withCover: (@escaping (UIImage?) -> Void) -> Void = { cb in if wantCover { self.image(coverName, cb) } else { cb(nil) } }
          withCover { [weak self] coverImg in
            guard let self = self, id == self.turnId else { call.reject("cancelled", "CANCELLED"); return }
            guard let img = img, let host = self.host, let wv = self.webView else {
                self.owner?.emitCurl("curlError", ["code": "NO_SNAPSHOT"]); call.reject("no snapshot", "UNAVAILABLE"); return
            }
            if coverRect != nil && coverImg == nil {
                self.owner?.emitCurl("curlError", ["code": "NO_COVER"]); call.reject("no cover", "UNAVAILABLE"); return
            }
            if let cr = coverRect, let ci = coverImg {
                let cv = UIImageView(image: ci)
                cv.frame = wv.convert(cr, to: host)
                cv.contentMode = .scaleToFill
                cv.backgroundColor = UIColor(red: 1, green: 253 / 255, blue: 250 / 255, alpha: 1)
                cv.isUserInteractionEnabled = false
                cv.accessibilityElementsHidden = true
                host.addSubview(cv)
                self.cover = cv
            }
            let frame = wv.convert(r, to: host)
            let box = UIView(frame: frame)
            box.clipsToBounds = true
            box.isUserInteractionEnabled = false
            box.backgroundColor = .clear
            box.isAccessibilityElement = false
            box.accessibilityElementsHidden = true
            let spine: UIPageViewController.SpineLocation = spineMax ? .max : .min
            let pvc = UIPageViewController(transitionStyle: .pageCurl, navigationOrientation: .horizontal,
                                           options: [.spineLocation: NSNumber(value: spine.rawValue)])
            pvc.isDoubleSided = false
            pvc.setViewControllers([DuoCurlPage(image: img)], direction: .forward, animated: false, completion: nil)
            for g in pvc.gestureRecognizers { g.isEnabled = false } // 1段目は指を使わない
            pvc.view.backgroundColor = .clear
            pvc.view.isUserInteractionEnabled = false
            pvc.view.frame = box.bounds
            pvc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            if let vc = self.owner?.bridge?.viewController { vc.addChild(pvc) }
            box.addSubview(pvc.view)
            host.addSubview(box)
            pvc.didMove(toParent: self.owner?.bridge?.viewController)
            self.box = box; self.pvc = pvc
            host.layoutIfNeeded()
            CATransaction.flush()
            // 紙が画面に出てから返す（その後で Web が本物のページを隠す。順を逆にしない）
            self.waiter.nextFrame { [weak self] in
                guard let self = self, id == self.turnId else { return }
                let ms = (Self.now() - t0) * 1000
                self.owner?.emitCurl("curlShown", ["dir": dir, "ms": (ms * 10).rounded() / 10])
                call.resolve(["ok": true, "shownMs": (ms * 10).rounded() / 10, "snapMs": (self.snapMs * 10).rounded() / 10, "next": self.nextMode, "cover": self.cover != nil])
            }
          }
        }
    }

    /// Web が覆いの下で着地先のページ（保存しない仮の表示）を出して rAF を2回待った：その矩形を撮って紙の裏の絵にする（backShot）。
    /// 覆いは web view の外のビューなので写らない。1段目は isDoubleSided=false（iOS 標準の透け）なので、撮った絵は時間と大きさの記録に使う。
    func backReady(_ call: CAPPluginCall) {
        guard box != nil, let r = Self.rect(call.getObject("rect")) else { call.reject("no curl", "UNAVAILABLE"); return }
        let id = turnId, t0 = Self.now()
        let state = signposter.beginInterval("back")
        take(r) { [weak self] img in
            guard let self = self else { return }
            self.signposter.endInterval("back", state)
            guard id == self.turnId else { call.reject("cancelled", "CANCELLED"); return }
            self.backImg = img
            self.backMs = (Self.now() - t0) * 1000
            let ms = (self.backMs * 10).rounded() / 10
            if img == nil { self.owner?.emitCurl("curlError", ["code": "NO_BACK"]) }
            self.owner?.emitCurl("backShot", ["ms": ms, "ok": img != nil])
            var out: [String: Any] = ["ok": img != nil, "ms": ms]
            if let i = img { out["w"] = Double(i.size.width); out["h"] = Double(i.size.height); out["scale"] = Double(i.scale) }
            call.resolve(out)
        }
    }

    /// Web が紙の下を着地後の DOM にして rAF を2回待った：1コマ重ねたまま待ってからめくる。めくり終わりで解決し、0.15 秒で薄くして外す。
    func webReady(_ call: CAPPluginCall) {
        guard let pvc = pvc, box != nil else { call.reject("no curl", "UNAVAILABLE"); return }
        let id = turnId
        waiter.nextFrame { [weak self] in
            guard let self = self, id == self.turnId else { call.reject("cancelled", "CANCELLED"); return }
            let go: (UIImage?) -> Void = { [weak self] nextImg in
                guard let self = self, id == self.turnId else { call.reject("cancelled", "CANCELLED"); return }
                let t0 = Self.now()
                let state = self.signposter.beginInterval("curl")
                self.meter.start()
                pvc.setViewControllers([DuoCurlPage(image: nextImg)], direction: self.animDir, animated: true) { [weak self] finished in
                    guard let self = self else { return }
                    self.meter.stop()
                    self.signposter.endInterval("curl", state)
                    let dur = (Self.now() - t0) * 1000
                    let perf = self.perfSummary(durMs: dur)
                    self.owner?.emitCurl("curlDone", ["done": true, "dir": self.turnDir])
                    if self.perfEvents { self.owner?.emitCurl("curlPerf", perf) }
                    call.resolve(["done": true, "finished": finished, "next": self.nextMode, "perf": perf])
                    guard id == self.turnId, let b = self.box else { return }
                    let c = self.cover
                    UIView.animate(withDuration: 0.15, delay: 0, options: [.curveEaseOut, .beginFromCurrentState], animations: { b.alpha = 0; c?.alpha = 0 }) { [weak self] _ in
                        guard let self = self, id == self.turnId else { return }
                        self.teardown()
                        self.owner?.emitCurl("curlEnded", ["dir": self.turnDir])
                    }
                }
            }
            if self.nextMode == "snap" { self.take(self.turnRect) { img in go(img) } } else { go(nil) }
        }
    }

    private func perfSummary(durMs: Double) -> [String: Any] {
        let g = meter.gaps.sorted()
        func pct(_ q: Double) -> Double { g.isEmpty ? 0 : g[min(g.count - 1, max(0, Int((q * Double(g.count)).rounded(.up)) - 1))] }
        let hz = UIScreen.main.maximumFramesPerSecond
        let slot = 1000.0 / Double(max(1, hz))
        let drops = meter.gaps.filter { $0 > 1.5 * slot }.count
        let r1 = { (v: Double) in (v * 100).rounded() / 100 }
        return ["engine": "native", "stage": 1, "hz": hz, "n": g.count, "p50": r1(pct(0.5)), "p95": r1(pct(0.95)), "p99": r1(pct(0.99)),
                "max": r1(g.last ?? 0), "drops": drops, "durMs": r1(durMs), "snapMs": r1(snapMs), "backMs": r1(backMs), "next": nextMode, "dir": turnDir]
    }

    /// 途中で閉じた・回転した・置き換え：重ねた紙をすぐ外す。
    func cancel(reason: String) {
        guard box != nil || pvc != nil || cover != nil else { return }
        turnId += 1
        meter.stop(); waiter.stop()
        teardown()
        owner?.emitCurl("curlDone", ["done": false, "dir": turnDir, "reason": reason])
    }
    private func teardown() {
        if let p = pvc { p.willMove(toParent: nil); p.view.removeFromSuperview(); p.removeFromParent() }
        box?.removeFromSuperview()
        cover?.removeFromSuperview()
        pvc = nil; box = nil; cover = nil; backImg = nil
    }
}
