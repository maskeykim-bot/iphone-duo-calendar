import Foundation
import Capacitor
import EventKit
import UIKit

/// iPhone のカレンダー（EventKit）と共有シートを JS へ橋渡しするプラグイン。
/// 契約は design/DESIGN.md 第7版 §7。予定のタイトル・メモなどはログへ出さない。
@objc(DuoNativePlugin)
public class DuoNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DuoNativePlugin"
    public let jsName = "DuoNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openInCalendar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise)
    ]

    private let store = EKEventStore()
    // EventKit の処理は直列化する（UIKit の処理は main）。
    private let queue = DispatchQueue(label: "app.duo.calendar.eventkit")
    private var storeObserver: NSObjectProtocol?

    private static let createdKey = "duo.native.created.v1"
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
    }

    deinit {
        if let observer = storeObserver {
            NotificationCenter.default.removeObserver(observer)
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
            call.resolve(["status": self.statusString()])
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
                    "requestId": requestId
                ])
            }
            call.resolve(["events": out])
        }
    }

    // MARK: - 作成（requestId で重複を防ぐ）

    private func loadCreated() -> [String: [String: String]] {
        return (UserDefaults.standard.dictionary(forKey: DuoNativePlugin.createdKey) as? [String: [String: String]]) ?? [:]
    }

    private func saveCreated(_ requestId: String, eventId: String, fingerprint: String) {
        var all = loadCreated()
        all[requestId] = ["eventId": eventId, "fingerprint": fingerprint]
        // 肥大化を避けるため古いものから間引く（上限 500 件）。
        if all.count > 500, let drop = all.keys.sorted().first, drop != requestId {
            all.removeValue(forKey: drop)
        }
        UserDefaults.standard.set(all, forKey: DuoNativePlugin.createdKey)
    }

    @objc func createEvent(_ call: CAPPluginCall) {
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
        let fingerprint = [calendarId, title, call.getString("start") ?? "", call.getString("end") ?? "", allDay ? "1" : "0", place, notes].joined(separator: "\u{1F}")

        queue.async { [weak self] in
            guard let self = self else { return }
            // 1) 記録済みの requestId は作り直さない（内容が違えばエラー）。
            if let done = self.loadCreated()[requestId] {
                if done["fingerprint"] != fingerprint {
                    call.reject("requestId was used with different content", "INVALID_ARGUMENT")
                } else {
                    call.resolve(["eventId": done["eventId"] ?? ""])
                }
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
                    self.saveCreated(requestId, eventId: existing, fingerprint: fingerprint)
                    call.resolve(["eventId": existing])
                    return
                }
            }
            // 3) 作成（繰り返しなしの通常予定1件）。ユーザーのメモは変更しない。識別は URL に持つ。
            let event = EKEvent(eventStore: self.store)
            event.calendar = calendar
            event.title = title
            event.isAllDay = allDay
            event.startDate = startDate
            event.endDate = endDate
            if !place.isEmpty { event.location = place }
            if !notes.isEmpty { event.notes = notes }
            event.url = URL(string: marker)
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
            self.saveCreated(requestId, eventId: newId, fingerprint: fingerprint)
            call.resolve(["eventId": newId])
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
