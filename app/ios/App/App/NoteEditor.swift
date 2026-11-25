import UIKit

// 第19.6版: 閉じた画面のノートの本文を iOS 標準の入力欄（UITextView）で書く。保存は JS の今までの仕組み（noteStore）を通す。ここは文字を JS へ知らせるだけで、DB には触れない。
// 本文の正本は今までと同じ文字列（行頭の「- [ ] 」「- [x] 」「- 」「# 」「## 」、字下げは空白 2 つで 1 段。app/js/note-lines.js と同じ決まり）。
// 入力欄の中身（textStorage の文字）は、その文字列そのもの。行頭の記号は消さずに「見えなくする」だけで、チェックの四角・箇条書きの点は絵で描く。
// だから 入力欄の文字 ＝ 保存の文字 で、変換の往復で形式が変わることがない。

enum NoteLineKind: String { case plain, check, checked, bullet, h1, h2 }

struct NoteLine {
    let kind: NoteLineKind
    let prefixLen: Int   // 行頭の記号の長さ（字下げ込み。UTF-16）
    let level: Int       // 字下げの段（0〜4）
}

enum NoteFormat {
    static let check = try! NSRegularExpression(pattern: "^(\\s*)- \\[([ xX])\\] ?")
    static let head = try! NSRegularExpression(pattern: "^(#{1,6}) ")
    static let bullet = try! NSRegularExpression(pattern: "^(\\s*)- ")

    static func parse(_ line: String) -> NoteLine {
        let ns = line as NSString, all = NSRange(location: 0, length: ns.length)
        if let m = check.firstMatch(in: line, range: all) {
            let indent = ns.substring(with: m.range(at: 1)), mark = ns.substring(with: m.range(at: 2))
            return NoteLine(kind: mark == " " ? .check : .checked, prefixLen: m.range.length, level: levelOf(indent))
        }
        if let m = head.firstMatch(in: line, range: all) {
            return NoteLine(kind: m.range(at: 1).length > 1 ? .h2 : .h1, prefixLen: m.range.length, level: 0)
        }
        if let m = bullet.firstMatch(in: line, range: all) {
            return NoteLine(kind: .bullet, prefixLen: m.range.length, level: levelOf(ns.substring(with: m.range(at: 1))))
        }
        return NoteLine(kind: .plain, prefixLen: 0, level: 0)
    }
    static func levelOf(_ indent: String) -> Int { min(4, indent.replacingOccurrences(of: "\t", with: "  ").utf16.count / 2) }
}

extension NSAttributedString.Key {
    static let duoKind = NSAttributedString.Key("duoKind")
    static let duoLevel = NSAttributedString.Key("duoLevel")
}

/// 行頭の印（四角・チェック・点）を描く。印は文字ではないので、保存の文字には入らない。
final class NoteLayoutManager: NSLayoutManager {
    var tint = UIColor(red: 0x29 / 255, green: 0x4E / 255, blue: 0x42 / 255, alpha: 1)
    var muted = UIColor(red: 0x68 / 255, green: 0x71 / 255, blue: 0x6A / 255, alpha: 1)

    override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
        super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
        guard let storage = textStorage, let ctx = UIGraphicsGetCurrentContext() else { return }
        let chars = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
        storage.enumerateAttribute(.duoKind, in: chars) { value, range, _ in
            guard let raw = value as? String, let kind = NoteLineKind(rawValue: raw) else { return }
            let level = (storage.attribute(.duoLevel, at: range.location, effectiveRange: nil) as? Int) ?? 0
            let g = self.glyphIndexForCharacter(at: range.location)
            let frag = self.lineFragmentRect(forGlyphAt: g, effectiveRange: nil)
            let x = origin.x + NoteMetrics.gutterX(level: level), cy = origin.y + frag.midY
            ctx.saveGState()
            switch kind {
            case .check, .checked:
                let r = CGRect(x: x, y: cy - 10, width: 20, height: 20)
                let path = UIBezierPath(roundedRect: r.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 5)
                if kind == .checked {
                    self.tint.setFill(); path.fill()
                    let c = UIBezierPath(); c.move(to: CGPoint(x: r.minX + 5, y: r.midY + 0.5)); c.addLine(to: CGPoint(x: r.minX + 8.6, y: r.midY + 4)); c.addLine(to: CGPoint(x: r.minX + 15, y: r.midY - 4))
                    UIColor.white.setStroke(); c.lineWidth = 2; c.lineCapStyle = .round; c.lineJoinStyle = .round; c.stroke()
                } else {
                    self.muted.setStroke(); path.lineWidth = 1.5; path.stroke()
                }
            case .bullet:
                self.tint.setFill()
                UIBezierPath(ovalIn: CGRect(x: x + 7, y: cy - 3, width: 6, height: 6)).fill()
            default: break
            }
            ctx.restoreGState()
        }
    }
}

enum NoteMetrics {
    static let step: CGFloat = 20      // 字下げ 1 段
    static let mark: CGFloat = 30      // 印の幅（四角 20 ＋ 間 10）
    static func gutterX(level: Int) -> CGFloat { CGFloat(level) * step }
    static func textX(level: Int) -> CGFloat { CGFloat(level) * step + mark }
}

final class NoteEditorViewController: UIViewController, UITextViewDelegate, UITextFieldDelegate, UIGestureRecognizerDelegate {
    var initialTitle = ""
    var initialBody = ""
    var focusTitle = false
    var maxLength = 100_000
    var onClose: ((_ title: String, _ body: String, _ saved: Bool) -> Void)?
    /// 文字が変わった（題名・本文）。少し待ってまとめて知らせる。閉じる・アプリが裏へ回るときはすぐ
    var onChange: ((_ title: String, _ body: String) -> Void)?
    /// チェックの四角をたたいた。並べ替え（済みは下へ）は JS の今までの決まりで計算して setBody で返す
    var onCheck: ((_ body: String, _ line: Int, _ selStart: Int, _ selEnd: Int) -> Void)?
    private var changeTimer: Timer?
    private var lastSent = ""

    private let paper = UIColor(red: 0xF7 / 255, green: 0xF4 / 255, blue: 0xED / 255, alpha: 1)
    private let ink = UIColor(red: 0x1C / 255, green: 0x1F / 255, blue: 0x1D / 255, alpha: 1)
    private let muted = UIColor(red: 0x68 / 255, green: 0x71 / 255, blue: 0x6A / 255, alpha: 1)
    private let tint = UIColor(red: 0x29 / 255, green: 0x4E / 255, blue: 0x42 / 255, alpha: 1)

    private let titleField = UITextField()
    private var textView: UITextView!
    private let layout = NoteLayoutManager()
    private let status = UILabel()
    private var lastCaret = 0
    private var restyling = false
    private var bottom: NSLayoutConstraint!
    private var contentTrailing: NSLayoutConstraint!
    private var railCenter: NSLayoutConstraint!
    private var fmtButtons: [UIButton] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = paper
        view.tintColor = tint
        // 征希さん「本家のボタン配置。これいいね」: 上に書式のまとまり（1 つの丸い帯）、右の列に「元に戻す・やり直す」のまとまりと、丸い「完了」。上のバーは出さない
        navigationController?.setNavigationBarHidden(true, animated: false)
        NotificationCenter.default.addObserver(self, selector: #selector(flushNow), name: UIApplication.willResignActiveNotification, object: nil)

        titleField.font = .systemFont(ofSize: 22, weight: .semibold)
        titleField.textColor = ink
        titleField.placeholder = "新規ノート"
        titleField.text = initialTitle
        titleField.returnKeyType = .next
        titleField.delegate = self
        titleField.addTarget(self, action: #selector(titleChanged), for: .editingChanged)
        titleField.accessibilityLabel = "題名"
        titleField.translatesAutoresizingMaskIntoConstraints = false

        let storage = NSTextStorage()
        let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = true
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        textView = UITextView(frame: .zero, textContainer: container)
        textView.backgroundColor = .clear
        textView.delegate = self
        textView.alwaysBounceVertical = true
        textView.keyboardDismissMode = .interactive
        textView.textContainerInset = UIEdgeInsets(top: 8, left: 12, bottom: 24, right: 12)
        textView.accessibilityLabel = "本文"
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.text = initialBody
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.delegate = self
        textView.addGestureRecognizer(tap)

        status.isHidden = true
        status.font = .systemFont(ofSize: 11)
        status.textColor = muted
        status.numberOfLines = 1; status.adjustsFontSizeToFitWidth = true; status.minimumScaleFactor = 0.7
        status.translatesAutoresizingMaskIntoConstraints = false

        let line = UIView(); line.backgroundColor = UIColor(white: 0, alpha: 0.10); line.translatesAutoresizingMaskIntoConstraints = false
        let fmt = makeFormatBar(), hist = makeHistoryPill(), done = makeDoneButton()
        [fmt, titleField, line, textView, status, hist, done].forEach(view.addSubview)
        let g = view.safeAreaLayoutGuide
        let fmtWide = fmt.widthAnchor.constraint(equalToConstant: 360); fmtWide.priority = .defaultHigh
        bottom = status.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -6)
        // 右の列: 画面の右の帯（カメラと時刻の列。閉じた画面は 84）の中央。帯がない画面では、右に 64 の列を作る
        contentTrailing = textView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -84)
        railCenter = hist.centerXAnchor.constraint(equalTo: view.trailingAnchor, constant: -42)
        NSLayoutConstraint.activate([
            fmt.topAnchor.constraint(equalTo: g.topAnchor, constant: 8),
            // 征希さん「広げた時は中央にまとめようかな（横に広がりすぎるから）」: 幅は最大 360。狭い画面では左右 12 まで、広い画面では中央に寄せる
            fmt.centerXAnchor.constraint(equalTo: textView.centerXAnchor),
            fmt.leadingAnchor.constraint(greaterThanOrEqualTo: g.leadingAnchor, constant: 12),
            fmt.widthAnchor.constraint(lessThanOrEqualToConstant: 360),
            fmtWide,
            fmt.heightAnchor.constraint(equalToConstant: 44),
            titleField.topAnchor.constraint(equalTo: fmt.bottomAnchor, constant: 10),
            titleField.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            titleField.trailingAnchor.constraint(equalTo: textView.trailingAnchor, constant: -16),
            titleField.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            line.topAnchor.constraint(equalTo: titleField.bottomAnchor, constant: 2),
            line.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            line.trailingAnchor.constraint(equalTo: textView.trailingAnchor, constant: -16),
            line.heightAnchor.constraint(equalToConstant: 0.5),
            textView.topAnchor.constraint(equalTo: line.bottomAnchor),
            textView.leadingAnchor.constraint(equalTo: g.leadingAnchor),
            contentTrailing,
            textView.bottomAnchor.constraint(equalTo: status.topAnchor, constant: -4),
            status.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            status.trailingAnchor.constraint(equalTo: textView.trailingAnchor, constant: -16),
            bottom,
            railCenter,
            hist.topAnchor.constraint(equalTo: g.topAnchor, constant: 160),   // カレンダーの右の列の上のまとまりと同じ高さから
            hist.widthAnchor.constraint(equalToConstant: 52), hist.heightAnchor.constraint(equalToConstant: 104),
            done.centerXAnchor.constraint(equalTo: hist.centerXAnchor),
            done.topAnchor.constraint(equalTo: hist.bottomAnchor, constant: 12),
            done.widthAnchor.constraint(equalToConstant: 52), done.heightAnchor.constraint(equalToConstant: 52),
        ])
        restyle()
        lastSent = joined()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        let r = max(view.safeAreaInsets.right, 64)
        contentTrailing?.constant = -r; railCenter?.constant = -r / 2
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if focusTitle { titleField.becomeFirstResponder() } else { textView.becomeFirstResponder(); let n = (textView.text as NSString).length; textView.selectedRange = NSRange(location: n, length: 0) }
    }

    // MARK: JS との受け渡し

    private func joined() -> String { (titleField.text ?? "") + "\u{1}" + (textView.text ?? "") }
    private func scheduleChange() {
        changeTimer?.invalidate()
        changeTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { [weak self] _ in self?.flushNow() }
    }
    @objc func flushNow() {
        changeTimer?.invalidate(); changeTimer = nil
        guard textView.markedTextRange == nil, titleField.markedTextRange == nil else { scheduleChange(); return }   // かな変換の途中の文字は知らせない（確定してから）
        let j = joined(); if j == lastSent { return }
        lastSent = j
        onChange?(titleField.text ?? "", textView.text ?? "")
    }
    /// JS が計算した本文（チェックの並べ替えのあと）に差し替える。取り消しに載る
    func setBody(_ text: String, selStart: Int) {
        guard textView.markedTextRange == nil else { return }
        let n = (textView.text as NSString).length
        replace(NSRange(location: 0, length: n), with: text, caret: min(selStart, (text as NSString).length))
        flushNow()
    }
    @objc private func titleChanged() { scheduleChange() }

    // MARK: 書式の帯（Aa・チェックリスト・箇条書き・字下げ・戻す）

    private func glass(_ v: UIView, radius: CGFloat) {
        v.backgroundColor = UIColor.white.withAlphaComponent(0.78)
        v.layer.cornerRadius = radius; v.layer.cornerCurve = .continuous
        v.layer.borderWidth = 0.5; v.layer.borderColor = UIColor(white: 0, alpha: 0.10).cgColor
        v.layer.shadowColor = UIColor(red: 0x1C / 255, green: 0x1F / 255, blue: 0x1D / 255, alpha: 1).cgColor
        v.layer.shadowOpacity = 0.10; v.layer.shadowRadius = 9; v.layer.shadowOffset = CGSize(width: 0, height: 6)
        v.translatesAutoresizingMaskIntoConstraints = false
    }
    private func iconButton(_ symbol: String, _ label: String, _ action: UIAction?, menu: UIMenu? = nil, size: CGFloat = 19, color: UIColor? = nil) -> UIButton {
        var cfg = UIButton.Configuration.plain()
        cfg.image = UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: size, weight: .medium))
        cfg.baseForegroundColor = color ?? ink
        cfg.contentInsets = .zero
        let b = UIButton(configuration: cfg, primaryAction: action)
        b.accessibilityLabel = label
        if let m = menu { b.menu = m; b.showsMenuAsPrimaryAction = true }
        return b
    }
    /// 書式のまとまり（上）: 同じ幅のボタンを 1 つの丸い帯に等間隔で並べる。本文を書いているときだけ押せる（題名の間は薄くする）
    private func makeFormatBar() -> UIView {
        let aa = iconButton("textformat.size", "段落の種類", nil, menu: UIMenu(title: "段落", children: [
            UIAction(title: "本文") { [weak self] _ in self?.format(.plain) },
            UIAction(title: "見出し") { [weak self] _ in self?.format(.h1) },
            UIAction(title: "小見出し") { [weak self] _ in self?.format(.h2) },
        ]))
        let chk = iconButton("checklist", "チェックリスト", UIAction { [weak self] _ in self?.format(.check) })
        let bul = iconButton("list.bullet", "箇条書き", UIAction { [weak self] _ in self?.format(.bullet) })
        let outd = iconButton("decrease.indent", "字下げを戻す", UIAction { [weak self] _ in self?.indent(-1) })
        let ind = iconButton("increase.indent", "字下げ", UIAction { [weak self] _ in self?.indent(+1) })
        fmtButtons = [aa, chk, bul, outd, ind]
        let stack = UIStackView(arrangedSubviews: fmtButtons)
        stack.axis = .horizontal; stack.distribution = .fillEqually; stack.alignment = .fill
        glass(stack, radius: 22)
        return stack
    }
    /// 右の列: 「元に戻す」「やり直す」を縦に並べた丸いまとまり
    private func makeHistoryPill() -> UIView {
        let u = iconButton("arrow.uturn.backward", "元に戻す", UIAction { [weak self] _ in self?.undoTapped() })
        let r = iconButton("arrow.uturn.forward", "やり直す", UIAction { [weak self] _ in self?.redoTapped() })
        let stack = UIStackView(arrangedSubviews: [u, r])
        stack.axis = .vertical; stack.distribution = .fillEqually
        glass(stack, radius: 26)
        return stack
    }
    /// 右の列: 丸い「完了」（編集を終えて、ノートのページへ戻る）
    private func makeDoneButton() -> UIView {
        let b = iconButton("checkmark", "完了", UIAction { [weak self] _ in self?.closeTapped() }, size: 20, color: .white)
        var cfg = b.configuration ?? .plain()
        cfg.background.backgroundColor = tint; cfg.background.cornerRadius = 26; cfg.cornerStyle = .fixed
        b.configuration = cfg
        b.layer.shadowColor = tint.cgColor; b.layer.shadowOpacity = 0.30; b.layer.shadowRadius = 8; b.layer.shadowOffset = CGSize(width: 0, height: 6)
        b.translatesAutoresizingMaskIntoConstraints = false
        return b
    }
    private func paintFormatEnabled() { let on = !titleField.isFirstResponder; fmtButtons.forEach { $0.isEnabled = on; $0.alpha = on ? 1 : 0.35 } }
    func textFieldDidBeginEditing(_ tf: UITextField) { paintFormatEnabled() }
    func textFieldDidEndEditing(_ tf: UITextField) { paintFormatEnabled() }

    private func undoTapped() { guard textView.markedTextRange == nil else { return }; textView.undoManager?.undo(); restyle() }
    private func redoTapped() { guard textView.markedTextRange == nil else { return }; textView.undoManager?.redo(); restyle() }

    // MARK: 文字の置き換え（取り消しに載せる）

    private func replace(_ range: NSRange, with text: String, caret: Int? = nil) {
        guard let s = textView.position(from: textView.beginningOfDocument, offset: range.location),
              let e = textView.position(from: s, offset: range.length), let r = textView.textRange(from: s, to: e) else { return }
        textView.replace(r, withText: text)   // UITextInput の置き換え＝入力欄の取り消しの履歴に載る
        if let c = caret { textView.selectedRange = NSRange(location: c, length: 0) }
        restyle()
    }

    private func lineRange(at loc: Int) -> NSRange { (textView.text as NSString).lineRange(for: NSRange(location: min(loc, (textView.text as NSString).length), length: 0)) }
    private func lineText(_ r: NSRange) -> String {
        var s = (textView.text as NSString).substring(with: r)
        while s.hasSuffix("\n") || s.hasSuffix("\r") { s.removeLast() }
        return s
    }

    private func prefix(for kind: NoteLineKind, level: Int) -> String {
        let indent = String(repeating: "  ", count: level)
        switch kind {
        case .check: return indent + "- [ ] "
        case .checked: return indent + "- [x] "
        case .bullet: return indent + "- "
        case .h1: return "# "
        case .h2: return "## "
        case .plain: return ""
        }
    }

    /// 今の行の書式を切り替える（同じ書式なら本文に戻す）。変えるのは行頭の記号だけ。
    private func format(_ kind: NoteLineKind) {
        guard textView.markedTextRange == nil else { return }   // かな変換中は確定してから
        let sel = textView.selectedRange, lr = lineRange(at: sel.location), line = lineText(lr), p = NoteFormat.parse(line)
        let same = p.kind == kind || (kind == .check && p.kind == .checked)
        let to: NoteLineKind = same || kind == .plain ? .plain : kind
        let np = prefix(for: to, level: (to == .check || to == .bullet) ? p.level : 0)
        let col = max(0, sel.location - lr.location - p.prefixLen)
        replace(NSRange(location: lr.location, length: p.prefixLen), with: np, caret: lr.location + (np as NSString).length + col)
    }

    private func indent(_ dir: Int) {
        guard textView.markedTextRange == nil else { return }
        let sel = textView.selectedRange, lr = lineRange(at: sel.location), line = lineText(lr), p = NoteFormat.parse(line)
        guard p.kind == .check || p.kind == .checked || p.kind == .bullet else { return }
        let nv = max(0, min(4, p.level + dir)); if nv == p.level { return }
        let old = (line as NSString).range(of: "^\\s*", options: .regularExpression).length
        let ni = String(repeating: "  ", count: nv)
        replace(NSRange(location: lr.location, length: old), with: ni, caret: max(lr.location, sel.location + (ni as NSString).length - old))
    }

    // MARK: 見た目（記号は見えなくするだけ。文字は変えない）

    private func restyle() {
        guard !restyling, textView.markedTextRange == nil else { updateStatus(); return }   // 変換中は入力欄の属性に触らない
        restyling = true
        let storage = textView.textStorage, ns = storage.string as NSString, sel = textView.selectedRange
        storage.beginEditing()
        let all = NSRange(location: 0, length: ns.length)
        storage.setAttributes([.font: UIFont.systemFont(ofSize: 17), .foregroundColor: ink], range: all)
        var loc = 0
        while loc < ns.length {
            let lr = ns.lineRange(for: NSRange(location: loc, length: 0))
            var body = ns.substring(with: lr); while body.hasSuffix("\n") || body.hasSuffix("\r") { body.removeLast() }
            let p = NoteFormat.parse(body), para = NSMutableParagraphStyle()
            para.lineSpacing = 3; para.paragraphSpacing = 4
            var font = UIFont.systemFont(ofSize: 17), color = ink
            switch p.kind {
            case .check, .checked, .bullet:
                let x = NoteMetrics.textX(level: p.level)
                para.firstLineHeadIndent = x; para.headIndent = x
                if p.kind == .checked { color = muted }
            case .h1: font = .systemFont(ofSize: 22, weight: .bold); para.paragraphSpacingBefore = 6
            case .h2: font = .systemFont(ofSize: 18, weight: .semibold); para.paragraphSpacingBefore = 4
            case .plain: break
            }
            para.minimumLineHeight = font.lineHeight   // 記号だけの空の項目でも、行の高さとカーソルの高さを保つ
            if lr.length > 0 { storage.addAttributes([.paragraphStyle: para, .font: font, .foregroundColor: color], range: lr) }
            if p.prefixLen > 0 {
                let pr = NSRange(location: lr.location, length: p.prefixLen)
                storage.addAttributes([.font: UIFont.systemFont(ofSize: 0.01), .foregroundColor: UIColor.clear, .kern: 0], range: pr)
                if p.kind != .h1 && p.kind != .h2 { storage.addAttributes([.duoKind: p.kind.rawValue, .duoLevel: p.level], range: NSRange(location: lr.location, length: 1)) }
            }
            if lr.length == 0 { break }
            loc = lr.location + lr.length
        }
        storage.endEditing()
        textView.selectedRange = sel
        // これから打つ文字の見た目（行の途中・空の行）
        let lr = ns.lineRange(for: NSRange(location: min(sel.location, ns.length), length: 0))
        var body = ns.substring(with: lr); while body.hasSuffix("\n") || body.hasSuffix("\r") { body.removeLast() }
        let p = NoteFormat.parse(body)
        var typing: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 17), .foregroundColor: ink]
        if p.kind == .h1 { typing[.font] = UIFont.systemFont(ofSize: 22, weight: .bold) }
        if p.kind == .h2 { typing[.font] = UIFont.systemFont(ofSize: 18, weight: .semibold) }
        if p.kind == .checked { typing[.foregroundColor] = muted }
        let para = NSMutableParagraphStyle(); para.lineSpacing = 3; para.paragraphSpacing = 4
        if p.kind == .check || p.kind == .checked || p.kind == .bullet { let x = NoteMetrics.textX(level: p.level); para.firstLineHeadIndent = x; para.headIndent = x }
        para.minimumLineHeight = ((typing[.font] as? UIFont) ?? UIFont.systemFont(ofSize: 17)).lineHeight
        typing[.paragraphStyle] = para
        textView.typingAttributes = typing
        restyling = false
        updateStatus()
    }

    private func updateStatus() {
        let n = (textView.text as NSString).length
        status.text = "\(n)"
    }

    // MARK: UITextViewDelegate

    func textView(_ tv: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
        if (tv.text as NSString).length - range.length + (text as NSString).length + ((titleField.text ?? "") as NSString).length + 1 > maxLength { return false }   // 字数の上限（今までと同じ 10 万字。UTF-16 で数えるので少し手前で止まる）
        if tv.markedTextRange != nil { return true }   // かな変換中は標準の動きに任せる
        let lr = lineRange(at: range.location), line = lineText(lr), p = NoteFormat.parse(line)
        if text == "\n", range.length == 0, p.kind == .check || p.kind == .checked || p.kind == .bullet {
            let bodyLen = (line as NSString).length - p.prefixLen
            if bodyLen == 0 {   // 空の項目で改行: 記号を外して、ふつうの空の行にする（続けない）
                replace(NSRange(location: lr.location, length: p.prefixLen), with: "", caret: lr.location)
                return false
            }
            if range.location - lr.location < p.prefixLen { return false }
            let np = prefix(for: p.kind == .checked ? .check : p.kind, level: p.level)   // 次の行へ同じ形を続ける（チェックは外した形）
            replace(range, with: "\n" + np, caret: range.location + 1 + (np as NSString).length)
            return false
        }
        if text.isEmpty, range.length == 1, p.prefixLen > 0, range.location + 1 == lr.location + p.prefixLen {
            // 項目の先頭で削除: 記号をまるごと外す（記号を 1 文字ずつ壊さない）
            replace(NSRange(location: lr.location, length: p.prefixLen), with: "", caret: lr.location)
            return false
        }
        return true
    }

    func textViewDidChange(_ tv: UITextView) { restyle(); scheduleChange() }

    func textViewDidChangeSelection(_ tv: UITextView) {
        guard !restyling, tv.markedTextRange == nil else { return }
        let sel = tv.selectedRange
        defer { lastCaret = tv.selectedRange.location }
        guard sel.length == 0 else { return }
        let lr = lineRange(at: sel.location), p = NoteFormat.parse(lineText(lr))
        guard p.prefixLen > 0 else { return }
        let col = sel.location - lr.location
        if col < p.prefixLen {   // 見えない記号の中にカーソルを止めない
            let goingLeft = lastCaret > sel.location
            let to = goingLeft && lr.location > 0 ? lr.location - 1 : lr.location + p.prefixLen
            if to != sel.location { tv.selectedRange = NSRange(location: to, length: 0) }
        }
        restyle()
    }

    // MARK: チェックの四角をたたく

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    /// 四角をたたいただけではキーボードを出さない（読んでいる途中でチェックだけ付けられる）
    private var suppressEdit = false
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        suppressEdit = !textView.isFirstResponder && checkLine(at: touch.location(in: textView)) != nil
        return true
    }
    func textViewShouldBeginEditing(_ tv: UITextView) -> Bool { if suppressEdit { suppressEdit = false; return false }; return true }

    /// その位置がチェックの四角の上なら、その行の範囲と中身を返す
    private func checkLine(at point: CGPoint) -> (NSRange, String, NoteLine)? {
        var pt = point
        pt.x -= textView.textContainerInset.left; pt.y -= textView.textContainerInset.top
        guard textView.textStorage.length > 0 else { return nil }
        let glyph = layout.glyphIndex(for: pt, in: textView.textContainer)
        let ch = layout.characterIndexForGlyph(at: glyph)
        let lr = lineRange(at: ch), line = lineText(lr), p = NoteFormat.parse(line)
        guard p.kind == .check || p.kind == .checked else { return nil }
        let x0 = NoteMetrics.gutterX(level: p.level)
        guard pt.x >= x0 - 12, pt.x <= x0 + NoteMetrics.mark + 2 else { return nil }   // 押せる範囲は四角の左右に広げる
        let frag = layout.lineFragmentRect(forGlyphAt: layout.glyphIndexForCharacter(at: lr.location), effectiveRange: nil)
        guard pt.y >= frag.minY - 8, pt.y <= frag.maxY + 8 else { return nil }
        return (lr, line, p)
    }

    @objc private func tapped(_ g: UITapGestureRecognizer) {
        guard textView.markedTextRange == nil, let (lr, line, p) = checkLine(at: g.location(in: textView)) else { return }
        UISelectionFeedbackGenerator().selectionChanged()
        let ns = textView.text as NSString, sel = textView.selectedRange
        if let ask = onCheck {   // 並べ替え（済みは同じまとまりの下へ）は JS の今までの決まりで
            let idx = ns.substring(to: lr.location).components(separatedBy: "\n").count - 1
            ask(textView.text, idx, sel.location, sel.location + sel.length)
            return
        }
        let open = (line as NSString).range(of: "[")
        guard open.location != NSNotFound else { return }
        replace(NSRange(location: lr.location + open.location + 1, length: 1), with: p.kind == .check ? "x" : " ")
        textView.selectedRange = sel
    }

    // MARK: 題名

    func textFieldShouldReturn(_ tf: UITextField) -> Bool { textView.becomeFirstResponder(); textView.selectedRange = NSRange(location: 0, length: 0); return false }

    // MARK: 完了・閉じる

    @objc func closeTapped() {
        if textView.markedTextRange != nil { textView.unmarkText() }
        if titleField.markedTextRange != nil { titleField.unmarkText() }
        view.endEditing(true)
        flushNow()
        NotificationCenter.default.removeObserver(self)
        let t = titleField.text ?? "", b = textView.text ?? ""
        dismiss(animated: true) { [onClose] in onClose?(t, b, true) }
    }
}
