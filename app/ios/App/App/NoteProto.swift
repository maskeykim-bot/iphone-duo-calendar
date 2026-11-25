import UIKit

// 試作（proto/note-uitextview）: ノート本文を iOS 標準の入力欄（UITextView）で書く。ダミーデータだけを扱い、アプリの保存には触れない。
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
            let x = origin.x + NoteProtoMetrics.gutterX(level: level), cy = origin.y + frag.midY
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

enum NoteProtoMetrics {
    static let step: CGFloat = 20      // 字下げ 1 段
    static let mark: CGFloat = 30      // 印の幅（四角 20 ＋ 間 10）
    static func gutterX(level: Int) -> CGFloat { CGFloat(level) * step }
    static func textX(level: Int) -> CGFloat { CGFloat(level) * step + mark }
}

final class NoteProtoViewController: UIViewController, UITextViewDelegate, UITextFieldDelegate, UIGestureRecognizerDelegate {
    var initialTitle = ""
    var initialBody = ""
    var onClose: ((_ title: String, _ body: String, _ saved: Bool) -> Void)?

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

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = paper
        view.tintColor = tint
        title = "試作ノート"
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "閉じる", style: .plain, target: self, action: #selector(closeTapped))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "完了", style: .done, target: self, action: #selector(doneTapped))

        titleField.font = .systemFont(ofSize: 22, weight: .semibold)
        titleField.textColor = ink
        titleField.placeholder = "新規ノート"
        titleField.text = initialTitle
        titleField.returnKeyType = .next
        titleField.delegate = self
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
        textView.inputAccessoryView = makeBar()   // 書式は本文を書いている間だけ、キーボードのすぐ上（題名の入力中は出ない）
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.delegate = self
        textView.addGestureRecognizer(tap)

        status.font = .systemFont(ofSize: 11)
        status.textColor = muted
        status.numberOfLines = 1; status.adjustsFontSizeToFitWidth = true; status.minimumScaleFactor = 0.7
        status.translatesAutoresizingMaskIntoConstraints = false

        let line = UIView(); line.backgroundColor = UIColor(white: 0, alpha: 0.10); line.translatesAutoresizingMaskIntoConstraints = false
        [titleField, line, textView, status].forEach(view.addSubview)
        let g = view.safeAreaLayoutGuide
        bottom = status.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -6)
        NSLayoutConstraint.activate([
            titleField.topAnchor.constraint(equalTo: g.topAnchor, constant: 8),
            titleField.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            titleField.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            titleField.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            line.topAnchor.constraint(equalTo: titleField.bottomAnchor, constant: 2),
            line.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            line.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            line.heightAnchor.constraint(equalToConstant: 0.5),
            textView.topAnchor.constraint(equalTo: line.bottomAnchor),
            textView.leadingAnchor.constraint(equalTo: g.leadingAnchor),
            textView.trailingAnchor.constraint(equalTo: g.trailingAnchor),
            textView.bottomAnchor.constraint(equalTo: status.topAnchor, constant: -4),
            status.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            status.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            bottom,
        ])
        restyle()
    }

    // MARK: 書式の帯（Aa・チェックリスト・箇条書き・字下げ・戻す）

    private func makeBar() -> UIView {
        let bar = UIToolbar(frame: CGRect(x: 0, y: 0, width: 320, height: 44))
        bar.tintColor = tint
        let aa = UIBarButtonItem(title: "Aa", menu: UIMenu(title: "段落", children: [
            UIAction(title: "本文") { [weak self] _ in self?.format(.plain) },
            UIAction(title: "見出し") { [weak self] _ in self?.format(.h1) },
            UIAction(title: "小見出し") { [weak self] _ in self?.format(.h2) },
            UIMenu(title: "", options: .displayInline, children: [
                UIAction(title: "字下げ", image: UIImage(systemName: "increase.indent")) { [weak self] _ in self?.indent(+1) },
                UIAction(title: "字下げを戻す", image: UIImage(systemName: "decrease.indent")) { [weak self] _ in self?.indent(-1) },
            ]),
        ]))
        aa.accessibilityLabel = "段落の種類"
        let chk = UIBarButtonItem(image: UIImage(systemName: "checklist"), style: .plain, target: self, action: #selector(checkTapped))
        chk.accessibilityLabel = "チェックリスト"
        let bul = UIBarButtonItem(image: UIImage(systemName: "list.bullet"), style: .plain, target: self, action: #selector(bulletTapped))
        bul.accessibilityLabel = "箇条書き"
        let undo = UIBarButtonItem(title: "戻す", image: nil, primaryAction: UIAction { [weak self] _ in self?.undoTapped() }, menu: UIMenu(children: [
            UIAction(title: "元に戻す", image: UIImage(systemName: "arrow.uturn.backward")) { [weak self] _ in self?.undoTapped() },
            UIAction(title: "やり直す", image: UIImage(systemName: "arrow.uturn.forward")) { [weak self] _ in self?.redoTapped() },
        ]))
        undo.accessibilityLabel = "元に戻す。長押しでやり直す"
        let flex = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        bar.items = [aa, flex, chk, flex, bul, flex, undo]   // 狭い画面でも 4 つが全部見える数にする（字下げは Aa の中）
        return bar
    }

    @objc private func checkTapped() { format(.check) }
    @objc private func bulletTapped() { format(.bullet) }
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
                let x = NoteProtoMetrics.textX(level: p.level)
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
        if p.kind == .check || p.kind == .checked || p.kind == .bullet { let x = NoteProtoMetrics.textX(level: p.level); para.firstLineHeadIndent = x; para.headIndent = x }
        para.minimumLineHeight = ((typing[.font] as? UIFont) ?? UIFont.systemFont(ofSize: 17)).lineHeight
        typing[.paragraphStyle] = para
        textView.typingAttributes = typing
        restyling = false
        updateStatus()
    }

    private func updateStatus() {
        let n = (textView.text as NSString).length
        status.text = "保存の文字 \(n) 字（入力欄の文字＝保存の文字。記号は見えなくしているだけ）" + (textView.markedTextRange != nil ? "　変換中" : "")
    }

    // MARK: UITextViewDelegate

    func textView(_ tv: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
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

    func textViewDidChange(_ tv: UITextView) { restyle() }

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
        let x0 = NoteProtoMetrics.gutterX(level: p.level)
        guard pt.x >= x0 - 12, pt.x <= x0 + NoteProtoMetrics.mark + 2 else { return nil }   // 押せる範囲は四角の左右に広げる
        let frag = layout.lineFragmentRect(forGlyphAt: layout.glyphIndexForCharacter(at: lr.location), effectiveRange: nil)
        guard pt.y >= frag.minY - 8, pt.y <= frag.maxY + 8 else { return nil }
        return (lr, line, p)
    }

    @objc private func tapped(_ g: UITapGestureRecognizer) {
        guard textView.markedTextRange == nil, let (lr, line, p) = checkLine(at: g.location(in: textView)) else { return }
        let open = (line as NSString).range(of: "[")
        guard open.location != NSNotFound else { return }
        let sel = textView.selectedRange
        replace(NSRange(location: lr.location + open.location + 1, length: 1), with: p.kind == .check ? "x" : " ")
        textView.selectedRange = sel
        UISelectionFeedbackGenerator().selectionChanged()
    }

    // MARK: 題名

    func textFieldShouldReturn(_ tf: UITextField) -> Bool { textView.becomeFirstResponder(); textView.selectedRange = NSRange(location: 0, length: 0); return false }

    // MARK: 完了・閉じる

    @objc private func doneTapped() {
        // 「完了」＝編集を終える（かな変換は確定してから）。閉じるのは「閉じる」
        if let r = textView.markedTextRange { _ = r; textView.unmarkText() }
        view.endEditing(true)
        restyle()
    }

    @objc private func closeTapped() {
        if textView.markedTextRange != nil { textView.unmarkText() }
        view.endEditing(true)
        let t = titleField.text ?? "", b = textView.text ?? ""
        dismiss(animated: true) { [onClose] in onClose?(t, b, true) }
    }
}
