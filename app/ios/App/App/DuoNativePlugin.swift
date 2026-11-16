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
        CAPPluginMethod(name: "reminderPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReminderPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listReminderLists", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listReminders", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateReminder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setReminderDone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteReminder", returnType: CAPPluginReturnPromise),
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
        CAPPluginMethod(name: "selectionHaptic", returnType: CAPPluginReturnPromise)
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
    // リマインダーの作成記録（本文は保存しない。requestId → [itemId, fp(SHA256), at]）。
    private static let remCreatedKey = "duo.native.reminders.created.v1"
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
                // リマインダーに「書き込みのみ」はない。あっても denied 扱い。
                if s == .writeOnly { return type == .event ? "writeOnly" : "denied" }
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

    // MARK: - リマインダーの権限

    /// リマインダーの読み書きに必要なフルアクセスがなければ reject して false を返す（全リマインダー API の頭で呼ぶ）。
    private func ensureReminderAccess(_ call: CAPPluginCall) -> Bool {
        switch statusString(for: .reminder) {
        case "granted":
            return true
        case "restricted":
            call.reject("restricted", "RESTRICTED")
            return false
        default:
            call.reject("reminder access is not granted", "PERMISSION_DENIED")
            return false
        }
    }

    @objc func reminderPermission(_ call: CAPPluginCall) {
        call.resolve(["status": statusString(for: .reminder)])
    }

    @objc func requestReminderPermission(_ call: CAPPluginCall) {
        let current = statusString(for: .reminder)
        // notDetermined のときだけ OS に要求する。denied / restricted は再要求しない。
        guard current == "notDetermined" else {
            call.resolve(["status": current])
            return
        }
        let finish: () -> Void = { [weak self] in
            guard let self = self else { return }
            let status = self.statusString(for: .reminder)
            guard status == "granted" else {
                call.resolve(["status": status])
                return
            }
            // 許可の直後は古い状態のキャッシュが残るので、EventKit の直列 queue で reset してから返す。
            self.queue.async {
                self.store.reset()
                call.resolve(["status": self.statusString(for: .reminder)])
            }
        }
        if #available(iOS 17.0, *) {
            store.requestFullAccessToReminders { _, _ in finish() }
        } else {
            store.requestAccess(to: .reminder) { _, _ in finish() }
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

    @objc func listReminderLists(_ call: CAPPluginCall) {
        guard ensureReminderAccess(call) else { return }
        queue.async { [weak self] in
            guard let self = self else { return }
            var items: [(sourceId: String, title: String, id: String, dict: [String: Any])] = []
            let defaultId = self.store.defaultCalendarForNewReminders()?.calendarIdentifier
            for c in self.store.calendars(for: .reminder) {
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
            call.resolve(["lists": items.map { $0.dict }])
        }
    }

    // MARK: - リマインダーの一覧（第14版 PR14）

    // 取得の世代管理。queue 上でだけ読み書きする。新しい要求は前の取得を取り消し、前の call を CANCELLED で解放する。
    private var remGen = 0
    private var remTokens: [Any] = []
    private var remPending: CAPPluginCall?

    /// 前の取得を止めて call を解放する。queue 上で呼ぶ。
    private func cancelReminderFetch() {
        for t in remTokens { store.cancelFetchRequest(t) }
        remTokens = []
        if let old = remPending {
            remPending = nil
            old.reject("cancelled", "CANCELLED")
        }
        remGen += 1
    }

    @objc func listReminders(_ call: CAPPluginCall) {
        guard ensureReminderAccess(call) else { return }
        let f = makeFormatter()
        guard let ids = call.getArray("listIds", String.self),
              let since = parse(call.getString("completedSince"), f) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        queue.async { [weak self] in
            guard let self = self else { return }
            self.cancelReminderFetch()
            if ids.isEmpty {
                call.resolve(["reminders": [[String: Any]]()])
                return
            }
            var lists: [EKCalendar] = []
            for id in ids {
                guard let c = self.store.calendar(withIdentifier: id), c.allowedEntityTypes.contains(.reminder) else {
                    call.reject("list not found", "LIST_NOT_FOUND")
                    return
                }
                lists.append(c)
            }
            let gen = self.remGen
            self.remPending = call
            var results: [EKReminder] = []
            var left = 2
            let finish: ([EKReminder]?) -> Void = { [weak self] part in
                self?.queue.async {
                    guard let self = self, self.remGen == gen, self.remPending === call else { return } // 古い応答は捨てる（call は取消時に解放済み）
                    if let part = part { results.append(contentsOf: part) }
                    left -= 1
                    if left > 0 { return }
                    self.remPending = nil
                    self.remTokens = []
                    let cal = self.makeCalendar()
                    var seen = Set<String>()
                    var out: [[String: Any]] = []
                    for r in results {
                        guard seen.insert(r.calendarItemIdentifier).inserted else { continue }
                        out.append(self.serializeReminder(r, f, cal))
                    }
                    call.resolve(["reminders": out])
                }
            }
            let t1 = self.store.fetchReminders(matching: self.store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: lists)) { finish($0) }
            let t2 = self.store.fetchReminders(matching: self.store.predicateForCompletedReminders(withCompletionDateStarting: since, ending: nil, calendars: lists)) { finish($0) }
            self.remTokens = [t1, t2]
        }
    }

    // MARK: - リマインダーの追加（第14版 PR16）

    private func loadRemCreated() -> [String: [String: Any]] {
        return (UserDefaults.standard.dictionary(forKey: DuoNativePlugin.remCreatedKey) as? [String: [String: Any]]) ?? [:]
    }

    /// 作成記録を保存する。上限を超えたら at の古い順に除く。本文は入れない。EventKit の直列 queue 上で呼ぶ。
    private func saveRemCreated(_ requestId: String, itemId: String, fp: String) {
        var all = loadRemCreated()
        all[requestId] = ["itemId": itemId, "fp": fp, "at": Int(Date().timeIntervalSince1970)]
        trimCreated(&all, keep: requestId)
        UserDefaults.standard.set(all, forKey: DuoNativePlugin.remCreatedKey)
    }

    /// 識別子でリマインダーを探す（新設）。見つからなければ nil。後続 PR の更新・完了でも共用する。queue 上で呼ぶ。
    private func findReminder(itemId: String) -> EKReminder? {
        guard !itemId.isEmpty else { return nil }
        return store.calendarItem(withIdentifier: itemId) as? EKReminder
    }

    /// due 引数 {date, time?} または null → DateComponents。不正は invalid。
    private func parseReminderDue(_ raw: Any?) -> (dc: DateComponents?, key: String, invalid: Bool) {
        guard let raw = raw, !(raw is NSNull) else { return (nil, "", false) }
        guard let d = raw as? [String: Any], let date = d["date"] as? String else { return (nil, "", true) }
        let parts = date.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let y = Int(parts[0]), let m = Int(parts[1]), let day = Int(parts[2]) else { return (nil, "", true) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = makeCalendar().timeZone
        var dc = DateComponents(calendar: cal, year: y, month: m, day: day)
        guard let probe = cal.date(from: dc), cal.dateComponents([.year, .month, .day], from: probe) == DateComponents(year: y, month: m, day: day) else { return (nil, "", true) }
        var key = date
        if let t = d["time"], !(t is NSNull) {
            guard let time = t as? String, time.count == 5, time[time.index(time.startIndex, offsetBy: 2)] == ":",
                  let h = Int(time.prefix(2)), let mi = Int(time.suffix(2)), h >= 0, h < 24, mi >= 0, mi < 60 else { return (nil, "", true) }
            dc.hour = h; dc.minute = mi
            key += "T" + time
        }
        return (dc, key, false)
    }

    // MARK: - リマインダーの通知（第14版 PR21）

    /// 既定通知の時刻。時刻つき期限はその時刻ちょうど、日付のみは当日 8:00（端末ローカル）。期限なしは nil。
    private func reminderDefaultFire(_ dc: DateComponents?) -> Date? {
        guard let dc = dc, dc.year != nil, dc.month != nil, dc.day != nil else { return nil }
        let cal = makeCalendar()
        let s = serializeDue(dc, cal)
        guard let due = s.due, let date = s.date else { return nil }
        if due["time"] != nil { return date }
        var p = cal.dateComponents([.year, .month, .day], from: date)
        p.hour = 8; p.minute = 0
        return cal.date(from: p)
    }

    /// 指定時刻の既定通知（絶対時刻・場所なし）か。
    private func isDefaultAlarm(_ a: EKAlarm, at fire: Date?) -> Bool {
        guard let fire = fire, a.structuredLocation == nil, let d = a.absoluteDate else { return false }
        return abs(d.timeIntervalSince(fire)) < 1
    }

    /// 通知を整える。oldFire に一致する既定通知だけ外し、newFire があれば足す（既にあれば重複させない）。未知の通知は残す。
    /// 変更があれば true。
    @discardableResult
    private func reconcileReminderAlarm(_ r: EKReminder, oldFire: Date?, remove: Bool, newFire: Date?) -> Bool {
        var changed = false
        var list = r.alarms ?? []
        if remove {
            let kept = list.filter { !isDefaultAlarm($0, at: oldFire) }
            if kept.count != list.count { list = kept; changed = true }
        }
        if let nf = newFire, !list.contains(where: { isDefaultAlarm($0, at: nf) }) {
            list.append(EKAlarm(absoluteDate: nf))
            changed = true
        }
        if changed { r.alarms = list.isEmpty ? nil : list }
        return changed
    }

    @objc func createReminder(_ call: CAPPluginCall) {
        guard ensureReminderAccess(call) else { return }
        let f = makeFormatter()
        // 優先度・繰返し・URL などは受け付けない。notify は PR21（省略 true）。
        let allowed: Set<String> = ["requestId", "listId", "title", "notes", "due", "notify"]
        guard Set(call.options.keys.compactMap { $0 as? String }).isSubset(of: allowed),
              let requestId = call.getString("requestId"), !requestId.isEmpty, requestId.count <= 100,
              let listId = call.getString("listId"),
              let rawTitle = call.getString("title"), !rawTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              rawTitle.count <= 1000 else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let notesGiven = call.options["notes"]
        if let g = notesGiven, !(g is NSNull), !(g is String) {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let notes = call.getString("notes") ?? ""
        let due = parseReminderDue(call.options["due"])
        if due.invalid {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        var notifyArg: Bool? = nil
        if let n = call.options["notify"], !(n is NSNull) {
            guard let b = n as? Bool else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            notifyArg = b
        }
        // 期限なしに通知は付けられない。省略時は期限があれば true。
        if notifyArg == true && due.dc == nil {
            call.reject("notify requires a due date", "INVALID_ARGUMENT")
            return
        }
        let notify = due.dc != nil && (notifyArg ?? true)
        let title = rawTitle
        var fpParts = [listId, title, notes, due.key]
        if due.dc != nil && !notify { fpParts.append("notify:false") }  // 旧記録（既定 true）と同じ指紋を保つ
        let fp = sha256Hex(fpParts.joined(separator: "\u{1F}"))
        queue.async { [weak self] in
            guard let self = self else { return }
            // 1) 記録済みの requestId は作り直さない（内容が違えばエラー）。
            if let done = self.loadRemCreated()[requestId] {
                guard done["fp"] as? String == fp else {
                    call.reject("requestId was used with different content", "INVALID_ARGUMENT")
                    return
                }
                guard let r = self.findReminder(itemId: done["itemId"] as? String ?? "") else {
                    // 作成済みだが今は無い（利用者が消した等）。作り直さない。
                    call.reject("created reminder was not found", "UNAVAILABLE")
                    return
                }
                call.resolve(["reminder": self.serializeReminder(r, f, self.makeCalendar())])
                return
            }
            // 2) 追加先: 空なら OS 既定 → 書ける先頭。指定は毎回再検査する。
            var target: EKCalendar? = nil
            if listId.isEmpty {
                if let d = self.store.defaultCalendarForNewReminders(), d.allowsContentModifications { target = d }
                else { target = self.store.calendars(for: .reminder).first { $0.allowsContentModifications } }
                guard target != nil else {
                    call.reject("no writable reminder list", "LIST_NOT_FOUND")
                    return
                }
            } else {
                guard let c = self.store.calendar(withIdentifier: listId), c.allowedEntityTypes.contains(.reminder) else {
                    call.reject("list not found", "LIST_NOT_FOUND")
                    return
                }
                guard c.allowsContentModifications else {
                    call.reject("list is read only", "READ_ONLY")
                    return
                }
                target = c
            }
            let r = EKReminder(eventStore: self.store)
            r.calendar = target
            r.title = title
            if !notes.isEmpty { r.notes = notes }
            r.dueDateComponents = due.dc
            if notify { self.reconcileReminderAlarm(r, oldFire: nil, remove: false, newFire: self.reminderDefaultFire(due.dc)) }
            do {
                try self.store.save(r, commit: true)
            } catch {
                call.reject("could not save the reminder", "UNAVAILABLE", error)
                return
            }
            let itemId = r.calendarItemIdentifier
            guard !itemId.isEmpty else {
                call.reject("saved reminder has no identifier", "UNAVAILABLE")
                return
            }
            self.saveRemCreated(requestId, itemId: itemId, fp: fp)
            call.resolve(["reminder": self.serializeReminder(r, f, self.makeCalendar())])
        }
    }

    // MARK: - リマインダーの更新・完了（第14版 PR18）

    private enum RemLookup { case found(EKReminder), notFound, ambiguous }

    /// itemId 優先、見つからなければ externalId（複数一致は曖昧）。findReminder を共用する。queue 上で呼ぶ。
    private func resolveReminder(itemId: String, externalId: String) -> RemLookup {
        if let r = findReminder(itemId: itemId) { return .found(r) }
        guard !externalId.isEmpty else { return .notFound }
        let hits = store.calendarItems(withExternalIdentifier: externalId).compactMap { $0 as? EKReminder }
        if hits.count == 1 { return .found(hits[0]) }
        return hits.isEmpty ? .notFound : .ambiguous
    }

    /// 更新の衝突（1 秒超の変更）。予定の expectModified とは別。
    private func isRemConflict(_ r: EKReminder, expect: Double?) -> Bool {
        guard let e = expect, let m = r.lastModifiedDate else { return false }
        return m.timeIntervalSince1970 * 1000 >= e + 1000
    }

    @objc func updateReminder(_ call: CAPPluginCall) {
        guard ensureReminderAccess(call) else { return }
        let f = makeFormatter()
        let allowedTop: Set<String> = ["itemId", "externalId", "expectModifiedAt", "patch"]
        guard Set(call.options.keys.compactMap { $0 as? String }).isSubset(of: allowedTop),
              let itemId = call.getString("itemId"), !itemId.isEmpty,
              let patch = call.options["patch"] as? [String: Any],
              Set(patch.keys).isSubset(of: ["title", "notes", "listId", "due", "notify"]) else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let externalId = call.getString("externalId") ?? ""
        // expectModifiedAt: 数値（MS）または null（衝突を確かめない）。キーなしは不正。
        guard let rawExpect = call.options["expectModifiedAt"], rawExpect is NSNull || rawExpect is NSNumber else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let expect = (rawExpect as? NSNumber)?.doubleValue
        var newTitle: String? = nil
        if let t = patch["title"] {
            guard let ts = t as? String, !ts.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, ts.count <= 1000 else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            newTitle = ts
        }
        var notesGiven = false
        var newNotes = ""
        if let n = patch["notes"] {
            if let ns = n as? String { newNotes = ns }
            else if !(n is NSNull) {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            notesGiven = true
        }
        var newListId: String? = nil
        if let l = patch["listId"] {
            guard let ls = l as? String, !ls.isEmpty else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            newListId = ls
        }
        let dueGiven = patch["due"] != nil
        let due = parseReminderDue(patch["due"])
        if due.invalid {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        var notifyPatch: Bool? = nil
        if let n = patch["notify"], !(n is NSNull) {
            guard let b = n as? Bool else {
                call.reject("invalid arguments", "INVALID_ARGUMENT")
                return
            }
            notifyPatch = b
        }
        if notifyPatch == true && dueGiven && due.dc == nil {
            call.reject("notify requires a due date", "INVALID_ARGUMENT")
            return
        }
        queue.async { [weak self] in
            guard let self = self else { return }
            let r: EKReminder
            switch self.resolveReminder(itemId: itemId, externalId: externalId) {
            case .ambiguous:
                call.reject("target is ambiguous", "UNAVAILABLE")
                return
            case .notFound:
                call.reject("reminder not found", "NOT_FOUND")
                return
            case .found(let x):
                r = x
            }
            if !(r.calendar?.allowsContentModifications ?? false) {
                call.reject("reminder is read only", "READ_ONLY")
                return
            }
            // 繰返しは完了以外を編集できない。
            if r.hasRecurrenceRules {
                call.reject("recurring reminder is not editable", "NOT_EDITABLE")
                return
            }
            // 期限なしのまま notify=true は不可（既存の期限を使うので queue 上で判定）。
            if notifyPatch == true && !dueGiven && self.reminderDefaultFire(r.dueDateComponents) == nil {
                call.reject("notify requires a due date", "INVALID_ARGUMENT")
                return
            }
            var target: EKCalendar? = nil
            if let lid = newListId {
                guard let c = self.store.calendar(withIdentifier: lid), c.allowedEntityTypes.contains(.reminder) else {
                    call.reject("list not found", "LIST_NOT_FOUND")
                    return
                }
                guard c.allowsContentModifications else {
                    call.reject("list is read only", "READ_ONLY")
                    return
                }
                target = c
            }
            let conflicted = self.isRemConflict(r, expect: expect)
            // 最新オブジェクトの、指定された欄だけを差分で書く（未知の欄は触らない）。
            var changed = false
            if let t = newTitle, t != r.title { r.title = t; changed = true }
            if notesGiven {
                let cur = r.notes ?? ""
                if newNotes != cur { r.notes = newNotes.isEmpty ? nil : newNotes; changed = true }
            }
            if let c = target, c.calendarIdentifier != r.calendar?.calendarIdentifier { r.calendar = c; changed = true }
            if dueGiven {
                let cal = self.makeCalendar()
                let cur = self.serializeDue(r.dueDateComponents, cal).due
                let curKey = (cur?["date"] as? String).map { $0 + (cur?["time"] != nil ? "T" + (cur?["time"] as! String) : "") } ?? ""
                if curKey != due.key || (r.dueDateComponents == nil) != (due.dc == nil) {
                    let oldFire = self.reminderDefaultFire(r.dueDateComponents)
                    let newFire = self.reminderDefaultFire(due.dc)
                    // 旧期限に一致する既定通知だけを新期限へ移す（なければ補わない）。未知の通知は残す。
                    let hadDefault = (r.alarms ?? []).contains { self.isDefaultAlarm($0, at: oldFire) }
                    r.dueDateComponents = due.dc
                    changed = true
                    if hadDefault || notifyPatch == true {
                        self.reconcileReminderAlarm(r, oldFire: oldFire, remove: true, newFire: notifyPatch == false ? nil : newFire)
                    }
                }
            }
            if let n = notifyPatch {
                // 明示操作。期限（変更後）に対する既定通知を足す／その通知だけ外す。
                let fire = self.reminderDefaultFire(r.dueDateComponents)
                if self.reconcileReminderAlarm(r, oldFire: fire, remove: !n, newFire: n ? fire : nil) { changed = true }
            }
            if changed {
                do { try self.store.save(r, commit: true) } catch {
                    call.reject("could not save the reminder", "UNAVAILABLE", error)
                    return
                }
            }
            call.resolve(["reminder": self.serializeReminder(r, f, self.makeCalendar()), "conflicted": conflicted])
        }
    }

    @objc func setReminderDone(_ call: CAPPluginCall) {
        guard ensureReminderAccess(call) else { return }
        let f = makeFormatter()
        let allowedTop: Set<String> = ["itemId", "externalId", "done"]
        guard Set(call.options.keys.compactMap { $0 as? String }).isSubset(of: allowedTop),
              let itemId = call.getString("itemId"), !itemId.isEmpty,
              let done = call.options["done"] as? Bool else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let externalId = call.getString("externalId") ?? ""
        queue.async { [weak self] in
            guard let self = self else { return }
            let r: EKReminder
            switch self.resolveReminder(itemId: itemId, externalId: externalId) {
            case .ambiguous:
                call.reject("target is ambiguous", "UNAVAILABLE")
                return
            case .notFound:
                call.reject("reminder not found", "NOT_FOUND")
                return
            case .found(let x):
                r = x
            }
            if !(r.calendar?.allowsContentModifications ?? false) {
                call.reject("reminder is read only", "READ_ONLY")
                return
            }
            // 衝突確認なし。繰返しも完了は可（OS が次回へ進める）。戻しも同じ API。
            if r.isCompleted != done {
                r.isCompleted = done
                do { try self.store.save(r, commit: true) } catch {
                    call.reject("could not save the reminder", "UNAVAILABLE", error)
                    return
                }
            }
            call.resolve(["reminder": self.serializeReminder(r, f, self.makeCalendar())])
        }
    }

    /// リマインダーの削除（第14版 PR20）。force はない。最新が expectModifiedAt より 1 秒超新しければ CONFLICT で消さない。
    /// すでに無ければ成功（missing）。繰返しは NOT_EDITABLE、読み取り専用は READ_ONLY。
    @objc func deleteReminder(_ call: CAPPluginCall) {
        guard ensureReminderAccess(call) else { return }
        let allowedTop: Set<String> = ["itemId", "externalId", "expectModifiedAt"]
        guard Set(call.options.keys.compactMap { $0 as? String }).isSubset(of: allowedTop),
              let itemId = call.getString("itemId"), !itemId.isEmpty,
              let rawExpect = call.options["expectModifiedAt"], rawExpect is NSNull || rawExpect is NSNumber else {
            call.reject("invalid arguments", "INVALID_ARGUMENT")
            return
        }
        let externalId = call.getString("externalId") ?? ""
        let expect = (rawExpect as? NSNumber)?.doubleValue
        queue.async { [weak self] in
            guard let self = self else { return }
            let r: EKReminder
            switch self.resolveReminder(itemId: itemId, externalId: externalId) {
            case .ambiguous:
                call.reject("target is ambiguous", "UNAVAILABLE")
                return
            case .notFound:
                call.resolve(["deleted": true, "missing": true])
                return
            case .found(let x):
                r = x
            }
            if !(r.calendar?.allowsContentModifications ?? false) {
                call.reject("reminder is read only", "READ_ONLY")
                return
            }
            if r.hasRecurrenceRules {
                call.reject("recurring reminder is not editable", "NOT_EDITABLE")
                return
            }
            if self.isRemConflict(r, expect: expect) {
                call.reject("reminder was modified on the device", "CONFLICT")
                return
            }
            do { try self.store.remove(r, commit: true) } catch {
                call.reject("could not delete the reminder", "UNAVAILABLE", error)
                return
            }
            call.resolve(["deleted": true])
        }
    }

    /// 期限を Day と任意の time に直す。時刻なしは日付だけ。TZ 付きは端末の日付へ変換する。
    private func serializeDue(_ dc: DateComponents?, _ cal: Calendar) -> (due: [String: Any]?, date: Date?) {
        guard let dc = dc, dc.year != nil, dc.month != nil, dc.day != nil else { return (nil, nil) }
        var local = dc
        if dc.hour != nil, dc.timeZone != nil {
            var c = dc.calendar ?? Calendar(identifier: .gregorian)
            c.timeZone = dc.timeZone!
            if let d = c.date(from: dc) { local = cal.dateComponents([.year, .month, .day, .hour, .minute], from: d) }
        }
        guard let y = local.year, let m = local.month, let d = local.day else { return (nil, nil) }
        var dict: [String: Any] = ["date": String(format: "%04d-%02d-%02d", y, m, d)]
        var probe = DateComponents(year: y, month: m, day: d)
        if let h = local.hour {
            let mi = local.minute ?? 0
            dict["time"] = String(format: "%02d:%02d", h, mi)
            probe.hour = h; probe.minute = mi
        }
        return (dict, cal.date(from: probe))
    }

    private func serializeReminder(_ r: EKReminder, _ f: DateFormatter, _ cal: Calendar) -> [String: Any] {
        let due = serializeDue(r.dueDateComponents, cal)
        var alarms: [[String: Any]] = []
        var extra = 0
        for a in r.alarms ?? [] {
            if a.structuredLocation != nil { extra += 1; continue }
            if let d = a.absoluteDate { alarms.append(["at": f.string(from: d)]); continue }
            if let base = due.date, due.due?["time"] != nil {
                alarms.append(["at": f.string(from: base.addingTimeInterval(a.relativeOffset))]); continue
            }
            extra += 1
        }
        return [
            "itemId": r.calendarItemIdentifier,
            "externalId": r.calendarItemExternalIdentifier ?? "",
            "listId": r.calendar?.calendarIdentifier ?? "",
            "title": r.title ?? "",
            "notes": r.notes ?? "",
            "due": due.due ?? NSNull(),
            "done": r.isCompleted,
            "doneAt": r.isCompleted ? stampOrNull(r.completionDate, f) : NSNull(),
            "alarms": alarms,
            "alarmsExtra": extra,
            "priority": min(9, max(0, r.priority)),
            "recurring": r.hasRecurrenceRules,
            "createdAt": msOrNull(r.creationDate),
            "modifiedAt": msOrNull(r.lastModifiedDate),
            "readOnly": !(r.calendar?.allowsContentModifications ?? false)
        ]
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
