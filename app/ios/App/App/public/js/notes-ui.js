// ノートの常設エディタ（保存ボタンなし）。1行目＝題名（20pt）、残り＝本文。保存される本文は1つ（題名＋改行＋本文）。
// 通常の画面入口にはまだ接続しない（PR28）。DOM は textContent で作り、利用者の文字を HTML として扱わない。
import { noteStore, SAVE_FAILED, DRAFT_FAILED } from './notes.js';
import { titleOf, markOf, EMPTY_TITLE } from './notes-model.js';
import { applyFormat, onEnter, toggleCheck, lineAt, splitLines, viewOf, indentLines, levelOfPre, INDENT_MAX } from './note-lines.js';
import { inkElement } from './note-ink.js';

export const UNDO_MAX = 50; // 戻す・やり直すは新しい方から 50 回（保存しない。完了で捨てる）
export const GROUP_MS = 1000; // 文字の1まとまり: 約1秒入力がなければ区切る

const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };

// 本文 → 題名・残り。CRLF の形式と「改行の有無」を覚えて、結合で元と同じ文字列に戻す。
export function splitBody(text) {
  const i = text.indexOf('\n');
  if (i < 0) return { title: text, rest: '', nl: false, eol: '\n' };
  const crlf = i > 0 && text[i - 1] === '\r';
  return { title: text.slice(0, crlf ? i - 1 : i), rest: text.slice(i + 1), nl: true, eol: crlf ? '\r\n' : '\n' };
}
// crlf: 本文のすべての改行が CRLF のとき true（textarea は CR を落とすので、戻すときに CRLF へ揃える）。
export const isCrlf = (text) => /\r\n/.test(text) && !/(^|[^\r])\n/.test(text);
export const joinBody = ({ title, rest, nl, eol, crlf }) => (nl || rest !== '' ? title + eol + (crlf ? rest.replace(/\n/g, '\r\n') : rest) : title);

export function mountNoteEditor(host, { store = noteStore, onOpen = () => {}, onTrashChange = () => {}, onDone = () => {}, onFormatSheet = () => {}, onHistory = () => {}, kbHeight: kbHeightOpt = null, loadInk = null } = {}) {
  const root = el('section', 'ned'); root.dataset.noteEditor = '';
  const title = el('textarea', 'ned-title'); title.rows = 1; title.setAttribute('aria-label', '題名'); title.placeholder = EMPTY_TITLE; title.enterKeyHint = 'next';
  // 本文は行ごとの div（contenteditable）。記号（「# 」「- 」「- [ ] 」）は画面に出さず、行の種類で描く。
  // 保存の文字（記号つき）は body.value（textarea と同じ形の入れ物）で読み書きする。正本は note-lines.js の文字。
  const body = el('div', 'ned-body'); body.setAttribute('role', 'textbox'); body.setAttribute('aria-multiline', 'true'); body.setAttribute('aria-label', '本文');
  body.dataset.ph = '本文'; body.dataset.empty = '1';
  try { body.contentEditable = 'plaintext-only'; } catch { /* 下で true にする */ }
  if (body.contentEditable !== 'plaintext-only') body.contentEditable = 'true';
  // チェックの四角の押せる範囲（44×44）。四角の絵は押せる範囲の中に描く。
  const bodyWrap = el('div', 'ned-bodywrap'); const gutter = el('div', 'ned-gutter'); gutter.setAttribute('aria-label', 'チェック欄'); gutter.hidden = true;
  bodyWrap.append(gutter, body);
  // 上の帯（design/27 §3）: 戻す群｜道具群（字・チェック・箇条書き）｜完了。位置はキーボードがあっても動かない。
  const top = el('div', 'ned-top'); top.setAttribute('role', 'toolbar'); top.setAttribute('aria-label', 'ノートの操作');
  const ibtn = (cls, label, act, svg) => { const b = el('button', `ned-ib ${cls}`); b.type = 'button'; b.dataset.act = act; b.setAttribute('aria-label', label); b.innerHTML = svg; return b; };
  const S = (d) => `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const undoBtn = ibtn('ned-undo', '元に戻す', 'undo', S('<path d="M8 6 4 10l4 4"/><path d="M4 10h9a5 5 0 0 1 0 10h-3"/>')); undoBtn.setAttribute('aria-disabled', 'true');
  const redoBtn = ibtn('ned-redo', 'やり直す', 'redo', S('<path d="m14 6 4 4-4 4"/><path d="M18 10H9a5 5 0 0 0 0 10h3"/>')); redoBtn.setAttribute('aria-disabled', 'true');
  const gUndo = el('div', 'ned-grp ned-gundo'); gUndo.append(undoBtn, redoBtn);
  const fmt = el('div', 'ned-fmt ned-grp ned-gtools'); fmt.setAttribute('aria-label', '書式');
  const FMT = [['type', '文字の書式', S('<path d="M4 6V4h14v2"/><path d="M11 4v14"/><path d="M8 18h6"/>')], ['check', 'チェックリストにする', S('<rect x="3.5" y="3.5" width="15" height="15" rx="3.5"/><path d="m7.5 11 2.5 2.5 4.5-5"/>')], ['bullet', '箇条書きにする', S('<circle cx="5" cy="6" r="1.2"/><circle cx="5" cy="11" r="1.2"/><circle cx="5" cy="16" r="1.2"/><path d="M9 6h9M9 11h9M9 16h9"/>')]];
  for (const [k, label, svg] of FMT) { const b = el('button', 'ned-ib ned-fbtn'); b.type = 'button'; b.dataset.fmt = k; b.setAttribute('aria-label', label); b.innerHTML = svg; fmt.append(b); }
  const doneBtn = el('button', 'ned-done'); doneBtn.type = 'button'; doneBtn.dataset.act = 'done'; doneBtn.setAttribute('aria-label', '完了'); doneBtn.innerHTML = S('<path d="m5 11.5 4 4 8-9"/>');
  top.append(gUndo, fmt, doneBtn);
  top.addEventListener('pointerdown', (ev) => ev.preventDefault()); // 押してもキーボードと選択を失わない
  // 書式のシート（字）: 第1段は 見出し・小見出し・本文 と 箇条書き・チェック だけ。キーボードと同じ高さで入れ替える。
  const fsheet = el('div', 'ned-fsheet'); fsheet.hidden = true; fsheet.setAttribute('role', 'dialog'); fsheet.setAttribute('aria-label', '書式');
  const fsHead = el('div', 'ned-fshead'); const fsTitle = el('span', 'ned-fstitle', '書式');
  const fsClose = el('button', 'ned-fsclose'); fsClose.type = 'button'; fsClose.dataset.act = 'fsclose'; fsClose.setAttribute('aria-label', '書式を閉じる'); fsClose.append(el('i', null, '✕'));
  fsHead.append(fsTitle, fsClose);
  const row1 = el('div', 'ned-fsrow ned-fsseg');
  for (const [k, t] of [['heading', '見出し'], ['heading2', '小見出し'], ['plain', '本文']]) { const b = el('button', `ned-fsb ned-fs-${k}`, t); b.type = 'button'; b.dataset.fset = k; row1.append(b); }
  const row3 = el('div', 'ned-fsrow ned-fsseg ned-fs3');
  for (const [k, t] of [['bullet', '箇条書き'], ['check', 'チェック']]) { const b = el('button', `ned-fsb ned-fs-${k}`, t); b.type = 'button'; b.dataset.fset = k; row3.append(b); }
  fsheet.append(fsHead, row1, row3);
  fsheet.addEventListener('pointerdown', (ev) => ev.preventDefault());
  const status = el('div', 'ned-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const msg = el('span'); const retry = el('button', 'ned-retry', '再試行'); retry.type = 'button'; retry.hidden = true;
  status.append(msg, retry);
  const bar = el('div', 'ned-bar');
  const delBtn = el('button', 'ned-del', '削除'); delBtn.type = 'button'; delBtn.dataset.act = 'trash';
  const trashBtn = el('button', 'ned-trashbtn', '最近削除した項目'); trashBtn.type = 'button'; trashBtn.dataset.act = 'trashlist';
  bar.append(delBtn, trashBtn);
  const trashBox = el('div', 'ned-trash'); trashBox.hidden = true; trashBox.setAttribute('aria-label', '最近削除した項目');
  const inkBox = el('div', 'ned-inkslot'); const tail = el('div', 'ned-tail'); tail.setAttribute('aria-hidden', 'true');
  bodyWrap.append(inkBox, tail);
  root.append(top, title, bodyWrap, status, bar, trashBox, fsheet);
  host.append(root);

  let cur = null;               // 開いているノートID
  let shape = { nl: false, eol: '\n', crlf: false, mark: '', shown: '' }; // mark = 1行目の先頭の記号（「# 」など）。題名欄には出さず、保存のときに元のまま付け直す（S7 R-27・V-21）
  let lastSynced = '';
  let composing = false;
  let destroyed = false;
  let compEndAt = 0;
  // ---- 本文の行モデル。DOM = 行の div（.nl）。data-k=種類、data-pre=行頭の記号の文字、中身=画面に出す文字だけ ----
  const mkLine = (raw) => {
    const v = viewOf(raw); const d = el('div', 'nl'); d.dataset.k = v.kind; d.dataset.pre = v.pre;
    if (v.kind === 'check') d.dataset.c = v.checked ? '1' : '0';
    if (v.kind === 'check' || v.kind === 'bullet') { const lv = levelOfPre(v.pre); if (lv) { d.dataset.lv = String(lv); d.style.setProperty('--lv', String(lv)); } } // 第19.3版 C: 字下げの段（1段 20）。保存の文字（行頭の空白）は data-pre にそのまま
    if (v.text) d.textContent = v.text; else d.append(document.createElement('br'));
    return d;
  };
  const sane = () => [...body.childNodes].every((n) => n.nodeType === 1 && n.tagName === 'DIV' && n.classList.contains('nl') && [...n.childNodes].every((c) => c.nodeType === 3 || (c.nodeType === 1 && c.tagName === 'BR')));
  const rows = () => { const out = []; let pos = 0; for (const c of body.children) { const pre = c.dataset.pre || '', text = c.textContent; out.push({ el: c, start: pos, pre, text }); pos += pre.length + text.length + 1; } return out; };
  // 第19.3版 B（征希さん「ノートに言葉を入れると行頭記号が無くなる」）: 記号の行（箇条書き・チェック）で入力が始まる直前に、その行を覚える（guard）。
  // 空の記号の行に打った文字を、ブラウザが行の div の外に置いたり（キャレットが本文の直下へ外れていた）、行の div ごと作り替えたり（変換の確定で空になった行を消して入れ直す）しても、
  // 読み取りで記号（data-pre）をその文字へ引き継ぐ。覚えるのは入力の間だけ（作り直し・入力の終わりで捨てる）。保存済みの行には使わない（開いただけの行は触らない）。
  let guard = null;
  const isLine = (c) => c.nodeType === 1 && c.tagName === 'DIV' && c.classList.contains('nl');
  const lineOfNode = (n) => { while (n && n.parentNode !== body) n = n.parentNode; return n && isLine(n) ? n : null; };
  // 想定外の DOM（ブラウザが作った入れ子・行の外の文字など）を、文字だけ拾って行に直す。caret = 今のキャレットの通し位置（記号つきの文字の上。作り直しのあとに戻すため。R-70）
  const scan = () => {
    const kids = [...body.childNodes];
    const gd = guard, gone = !!gd && gd.el.parentNode !== body, hollow = !!gd && !gone && gd.el.textContent === '';
    let heir = null; // 記号を引き継ぐ相手: 行でない子で文字のあるもの。行が消えたときは元の前後の行の間、行が空のまま残っているときは最初の1つ
    if (gone || hollow) {
      let on = !gone || !(gd.prev && gd.prev.parentNode === body);
      for (const c of kids) { if (gone && c === gd.next) break; if (on && !isLine(c) && c.textContent) { heir = c; break; } if (gone && c === gd.prev) on = true; }
    }
    const items = []; // { node, pre, text }
    const textOf = (c) => (c.nodeType === 3 ? c.data : c.tagName === 'BR' ? '' : c.textContent);
    for (const c of kids) {
      if (c === heir && hollow) continue; // 空の記号の行の所へ移す（下で入れる）
      if (c === heir) items.push({ node: c, pre: gd.pre, text: textOf(c) });
      else if (hollow && heir && c === gd.el) items.push({ node: heir, pre: gd.pre, text: textOf(heir), also: c });
      else if (isLine(c)) items.push({ node: c, pre: c.dataset.pre || '', text: c.textContent });
      else items.push({ node: c, pre: '', text: textOf(c) }); // R-70: span など想定外の要素の文字を捨てない
    }
    if (gone && !heir) { // 行だけ消えて文字がまだ無い（変換の途中・取り消し）: 記号の行は空のまま残す
      let at = gd.prev && gd.prev.parentNode === body ? items.findIndex((x) => x.node === gd.prev) + 1 : gd.next && gd.next.parentNode === body ? items.findIndex((x) => x.node === gd.next) : 0;
      if (at < 0) at = 0;
      items.splice(at, 0, { node: null, pre: gd.pre, text: '' });
    }
    const text = items.map((x) => x.pre + x.text).join('\n');
    let caret = null; const g = getSelection();
    if (g && g.rangeCount && body.contains(g.anchorNode)) {
      let pos = 0; caret = -1;
      for (const x of items) {
        const hit = x.node && (x.node === g.anchorNode || x.node.contains(g.anchorNode)) ? x.node : x.also && (x.also === g.anchorNode || x.also.contains(g.anchorNode)) ? x.also : null;
        if (hit) { let n = 0; if (hit === x.node) { const rg = document.createRange(); rg.selectNodeContents(hit); try { rg.setEnd(g.anchorNode, g.anchorOffset); } catch { /* */ } n = rg.toString().length; } caret = pos + x.pre.length + Math.min(n, x.text.length); break; }
        if (g.anchorNode === body && x.node && kids[g.anchorOffset] === x.node) { caret = pos; break; }
        pos += x.pre.length + x.text.length + 1;
      }
      if (caret < 0) caret = Math.max(0, pos - 1);
    }
    return { text, caret };
  };
  const flat = () => scan().text;
  const paintEmpty = () => { const one = body.children.length <= 1 && !body.textContent; if (one) body.dataset.empty = '1'; else delete body.dataset.empty; };
  function renderValue(text) { guard = null; want = null; body.replaceChildren(...splitLines(text).texts.map(mkLine)); paintEmpty(); }
  // R-70: 変換中（IME composing）は作り直さず読むだけ。確定後に作り直すときはキャレットを文字の位置へ戻す（頭に飛ばさない）。
  function readValue() { if (composing && (!body.firstChild || !sane())) return flat(); if (!body.firstChild && !guard) renderValue(''); else if (!body.firstChild || !sane()) { const f = scan(); renderValue(f.text); if (f.caret != null && document.activeElement === body) setRange(f.caret, f.caret); } return rows().map((r) => r.pre + r.text).join('\n'); }
  const rawAt = (R, node, off) => {
    if (!R.length) return 0;
    if (node === body) { const r = R[Math.min(off, R.length - 1)]; return off >= R.length ? r.start + r.pre.length + r.text.length : r.start + r.pre.length; }
    let n = node; while (n && n.parentNode !== body) n = n.parentNode;
    const row = R.find((r) => r.el === n); if (!row) return 0;
    const rg = document.createRange(); rg.selectNodeContents(row.el); try { rg.setEnd(node, off); } catch { /* 末尾 */ }
    return row.start + row.pre.length + rg.toString().length;
  };
  const domAt = (R, raw) => {
    let row = R[0]; for (const r of R) { if (r.start <= raw) row = r; else break; }
    let rem = Math.max(0, Math.min(raw - row.start - row.pre.length, row.text.length));
    const w = document.createTreeWalker(row.el, NodeFilter.SHOW_TEXT); let t;
    while ((t = w.nextNode())) { if (rem <= t.length) return [t, rem]; rem -= t.length; }
    return [row.el, 0];
  };
  let selCache = { s: 0, e: 0, d: 'none' };
  // 第19.3版 B: アプリが置いたキャレット（setRange）を覚える。ブラウザがそれを本文の頭（行の外）へ戻してしまっても、次の入力は置いた行へ入れる。指・キーで動かしたら忘れる。
  let want = null;
  const selNow = () => {
    const g = window.getSelection();
    if (!g || !g.rangeCount || !body.contains(g.anchorNode) || !body.contains(g.focusNode)) return selCache;
    if (!sane()) { if (composing) return selCache; readValue(); } // R-70: 変換中は作り直さない
    if (want && g.isCollapsed && g.anchorNode === body && g.anchorOffset === 0) { selCache = { s: want.s, e: want.e, d: 'none' }; return selCache; }
    const R = rows(); const a = rawAt(R, g.anchorNode, g.anchorOffset), f = rawAt(R, g.focusNode, g.focusOffset);
    if (want && (a !== want.s || f !== want.e)) want = null;
    selCache = { s: Math.min(a, f), e: Math.max(a, f), d: a === f ? 'none' : a < f ? 'forward' : 'backward' };
    return selCache;
  };
  function setRange(s, e, dir) {
    if (!body.firstChild) renderValue('');
    const R = rows(); const g = window.getSelection(); if (!g) return;
    const [an, ao] = domAt(R, s), [fn, fo] = domAt(R, e);
    try { if (dir === 'backward') g.setBaseAndExtent(fn, fo, an, ao); else g.setBaseAndExtent(an, ao, fn, fo); } catch { /* 無視 */ }
    selCache = { s, e, d: dir || 'none' }; want = s === e ? { s, e } : null;
  }
  Object.defineProperties(body, {
    value: { get: readValue, set(v) { renderValue(String(v ?? '')); const n = readValue().length; selCache = { s: n, e: n, d: 'none' }; }, configurable: true },
    selectionStart: { get: () => selNow().s, configurable: true },
    selectionEnd: { get: () => selNow().e, configurable: true },
    selectionDirection: { get: () => selNow().d, configurable: true },
  });
  body.setSelectionRange = (s, e, dir) => setRange(s, e ?? s, dir);
  renderValue('');
  // 文字が書式と合わなくなった行（「- 」と打った・貼り付けた）を、行の種類に合わせて描き直す。キャレットは文字の位置のまま。
  function reconcile() {
    const v = readValue(); const R = rows();
    const bad = R.some((r) => { const w = viewOf(r.pre + r.text); return w.kind !== r.el.dataset.k || w.pre !== r.pre || (w.kind === 'check' && (w.checked ? '1' : '0') !== r.el.dataset.c); });
    paintEmpty();
    if (!bad) return false;
    const sel = selNow(), focused = document.activeElement === body;
    renderValue(v); if (focused) setRange(sel.s, sel.e, sel.d);
    return true;
  }
  // 行をまたぐ・行の端の操作と貼り付けは、文字（記号つき）の上で行う。1行の中の入力・変換・削除はブラウザに任せる。
  const rowIndexOf = (R, raw) => { let k = 0; for (let i = 0; i < R.length; i++) if (R[i].start <= raw) k = i; return k; };
  function editRaw(s0, e0, str, caret, type) { // 文字 [s0,e0) を str に。caret = 差し替え後のキャレット（省略なら str の後ろ）
    const v = readValue(); const nv = v.slice(0, s0) + str + v.slice(e0);
    renderValue(nv); const c = caret ?? s0 + str.length; setRange(c, c);
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: type }));
  }
  let softBreak = false; // 直前の keydown が Shift+Return（行の中の改行。次の項目を続けない）
  const setGuard = (rowEl) => { guard = rowEl && rowEl.dataset.pre ? { el: rowEl, pre: rowEl.dataset.pre, prev: rowEl.previousElementSibling, next: rowEl.nextElementSibling } : null; };
  body.addEventListener('beforeinput', (ev) => {
    const t = ev.inputType || '';
    if (composing || ev.isComposing || /Composition/.test(t)) return;
    if (t === 'historyUndo') { ev.preventDefault(); doUndo(); return; }
    if (t === 'historyRedo') { ev.preventDefault(); doRedo(); return; }
    readValue(); let R = rows(); const { s, e } = selNow();
    let off = false; { const g = getSelection(); if (s === e && g && g.rangeCount && g.isCollapsed && g.anchorNode === body) { off = true; setRange(s, e); R = rows(); } } // B: キャレットが行の外（本文の直下）なら、打つ前に行の中へ入れる
    const ia = rowIndexOf(R, s), ib = rowIndexOf(R, e), A = R[ia];
    setGuard(A.el);
    const col = s - A.start - A.pre.length;
    const s2 = ia !== ib && col === 0 ? A.start : s; // 行の頭から複数行を選んで消す・打つとき、頭の行の記号も一緒に消える（全選択して消すと空のノート）
    const data = ev.data ?? ev.dataTransfer?.getData('text/plain') ?? '';
    const norm = (x) => String(x).replace(/\r\n?/g, '\n');
    if (t === 'insertParagraph' || t === 'insertLineBreak') {
      ev.preventDefault();
      // B: 箇条書き・チェックの行の改行は、ここでも次の項目を続ける（keydown が来ない・変換の確定の直後で keydown を見送ったときも、次の行の記号を落とさない）
      // （plaintext-only の本文では Return も insertLineBreak で来る。Shift+Return だけは続けない）
      if (!softBreak) { const r = onEnter(readValue(), s, e); if (r) { applyEdit(r); return; } }
      if (s === e && col === 0 && A.pre) { editRaw(A.start, A.start, '\n', A.start + 1 + A.pre.length, t); return; } // 行頭で改行: 記号の行は下へ押し下げる
      editRaw(s, e, '\n', null, t); return;
    }
    if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertFromYank' || (t === 'insertReplacementText' && ia !== ib)) {
      ev.preventDefault(); editRaw(s2, e, norm(data), null, t); return;
    }
    if (t === 'insertText' && (ia !== ib || /\n/.test(data) || off)) { // off: 行の外にいたキャレットの分は、ブラウザに任せず自分で行へ入れる（WebKit は beforeinput で動かした選択を使わない）
       ev.preventDefault(); editRaw(s2, e, norm(data), null, t); return; }
    if (/^delete/.test(t)) {
      if (ia !== ib) { ev.preventDefault(); editRaw(s2, e, '', s2, t); return; }
      if (s !== e) { if (t === 'deleteByCut') { ev.preventDefault(); editRaw(s, e, '', s, t); } return; } // 1行の中の選択の削除は任せる
      const back = /Backward/.test(t), fwd = /Forward/.test(t);
      if (back && col === 0) {
        ev.preventDefault();
        if (A.pre) editRaw(A.start, A.start + A.pre.length, '', A.start, t); // 記号の行の頭で戻す: ふつうの行にする（純正のメモと同じ）
        else if (ia > 0) { const p = R[ia - 1]; editRaw(A.start - 1, A.start, '', p.start + p.pre.length + p.text.length, t); }
        return;
      }
      if (fwd && col === A.text.length) { ev.preventDefault(); const n = R[ia + 1]; if (n) editRaw(s, n.start + n.pre.length, '', s, t); }
    }
  });

  // 戻す・やり直す（design/27 §3）: 題名と本文の全体を写しで持つ。新しい方から 50 回。保存しない。完了で捨てる。
  let undoSt = [], redoSt = [], last = null, groupOpen = false, groupTimer = 0, root_active = false;
  const snap = () => { const w = document.activeElement === title ? 'title' : 'body'; const t = w === 'title' ? title : body; return { t: title.value, b: body.value, s: t.selectionStart ?? 0, e: t.selectionEnd ?? 0, w }; };
  const closeGroup = () => { groupOpen = false; clearTimeout(groupTimer); groupTimer = 0; };
  // 押せないときも `disabled` にしない（押した瞬間の地の変化 #EFECE4 を見せるため）。薄く見せ、aria-disabled で読み上げ・キーボードにも伝える
  const paintUndo = () => { undoBtn.setAttribute('aria-disabled', String(!undoSt.length)); redoBtn.setAttribute('aria-disabled', String(!redoSt.length)); try { onHistory({ undo: undoSt.length, redo: redoSt.length }); } catch { /* 外の表示だけ */ } };
  function resetHistory() { undoSt = []; redoSt = []; closeGroup(); last = snap(); paintUndo(); }
  // 文字が変わったとき（input）。まとまりの最初の1回だけ、直前の写しを積む。
  function noteChange(breakAfter = false) {
    if (!last) last = snap();
    if (!groupOpen) { undoSt.push(last); if (undoSt.length > UNDO_MAX) undoSt.shift(); redoSt = []; groupOpen = true; }
    clearTimeout(groupTimer); groupTimer = setTimeout(closeGroup, GROUP_MS);
    last = snap(); if (breakAfter) closeGroup();
    paintUndo();
  }
  function restore(st) {
    title.value = st.t; body.value = st.b;
    const t = st.w === 'title' ? title : body;
    fit(); sync(); paintStatus();
    t.focus({ preventScroll: true }); try { t.setSelectionRange(Math.min(st.s, t.value.length), Math.min(st.e, t.value.length)); } catch { /* 無視 */ }
    last = snap();
  }
  function doUndo() { closeGroup(); const st = undoSt.pop(); if (!st) { paintUndo(); return; } redoSt.push(snap()); restore(st); paintUndo(); }
  function doRedo() { closeGroup(); const st = redoSt.pop(); if (!st) { paintUndo(); return; } undoSt.push(snap()); if (undoSt.length > UNDO_MAX) undoSt.shift(); restore(st); paintUndo(); }

  // 題名欄に触っていないノートは、元の記号をそのまま付け直す（1文字も変えない）。触ったときだけ（S8 連携の低 L-1・L-2）:
  // 題名が空なら記号も残さない（「# 」だけの行にしない）／打った文字が自分で記号から始まるなら取り分けた記号を足さず打ったまま（「# # x」にしない）。
  const value = () => {
    const { mark, shown, ...sh } = shape; const t = title.value.replace(/\r?\n/g, ' ');
    const head = t === shown ? mark + t : !t.trim() ? '' : markOf(t) ? t : mark + t; // 打った文字が自分で記号から始まるなら、そのまま（二重にしない。連携 04:06）
    return joinBody({ title: head, rest: body.value, ...sh });
  };
  function show(text) {
    const s = splitBody(text); const crlf = isCrlf(text); const mark = markOf(s.title); shape = { nl: s.nl, eol: s.eol, crlf, mark, shown: s.title.slice(mark.length) };
    title.value = shape.shown; body.value = crlf ? s.rest.replace(/\r\n/g, '\n') : s.rest; fit(); resetHistory();
    lastSynced = value(); // 触っていないノートは、開いただけで書き換えない
  }
  function fit() { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; fitBody(); }
  function fitBody() { paintEmpty(); paintGutter(); }
  const LV_STEP = 20; // 字下げ1段の見た目（css の --lv × 20px と同じ）
  // チェック行の四角の押せる範囲（44×44）。行の div の位置から直接置く（折り返しがあっても1行目の真ん中）
  function paintGutter() {
    const kids = [...body.children]; const list = kids.filter((c) => c.dataset.k === 'check');
    gutter.hidden = !list.length;
    gutter.replaceChildren();
    if (!list.length) return;
    for (const c of list) {
      const b = el('button', 'ned-chk'); b.type = 'button'; b.dataset.line = String(kids.indexOf(c)); b.dataset.checked = c.dataset.c === '1' ? '1' : '0';
      b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', c.dataset.c === '1' ? 'true' : 'false'); b.setAttribute('aria-label', c.textContent || '項目');
      b.style.top = `${c.offsetTop + 15 - 22}px`;
      if (c.dataset.lv) b.style.left = `${Number(c.dataset.lv) * LV_STEP}px`; // 第19.3版 C: 四角も段のぶん右へ
      b.append(el('i', 'ned-box', c.dataset.c === '1' ? '✓' : ''));
      gutter.append(b);
    }
  }
  // 書式操作の共通: 本文を差し替え、選択を保ち、保存へ流す
  function applyEdit(r, undoable = true, quiet = false) { // quiet: 本文にフォーカスが無ければ、選択を DOM に置かない（払いの字下げでキーボードを出さない）
    if (!r || r.text === body.value) return false;
    closeGroup(); if (!last) last = snap();
    if (undoable) { undoSt.push(last); if (undoSt.length > UNDO_MAX) undoSt.shift(); redoSt = []; }
    body.value = r.text; if (quiet && document.activeElement !== body) { const g = getSelection(); if (g && g.rangeCount && body.contains(g.anchorNode)) g.removeAllRanges(); selCache = { s: r.selStart, e: r.selEnd, d: 'none' }; } else body.setSelectionRange(r.selStart, r.selEnd); // quiet: 本文に残った古い選択（作り直す前の位置）は外し、覚えた位置だけを正にする
    last = snap();
    sync(); fitBody(); paintStatus(); paintUndo(); markFormats();
    return true;
  }
  function doFormat(kind) {
    applyEdit(applyFormat(body.value, body.selectionStart, body.selectionEnd, kind));
    body.focus();
  }
  function doToggle(line) {
    const r = toggleCheck(body.value, line, body.selectionStart, body.selectionEnd);
    applyEdit(r);
  }
  // 書式のシート。開いている間はキーボードと同じ高さで入れ替える（シートの下端 kbTop は app 側で止める）。
  let fsOpen = false;
  // v19.3 その2 D（征希さん「テキストの詳細がキーボードに隠れるから使えない」）: 実機は visualViewport がキーボードで縮まないことがある（app.js の NKB の説明）。そのときキーボードの高さが 0 と読め、
  // キーボードを下げずに書式のシートを画面の下端へ出して、キーボードの裏に隠れていた。直し: ① 高さは app 側の測り（visualViewport と、プラグインが知らせた keyboardHeight の大きい方）で読む。
  // ② 本文にキャレットがあれば、測れた高さにかかわらず必ずキーボードを下げる（blur）。③ シートから書式を変えても本文へフォーカスを戻さない（キーボードを出し直さない）。
  // ④ それでもキーボードが出ている・出直したときは、シートをキーボードの上端の上へ持ち上げる（裏に残さない）
  function kbHeight() {
    if (kbHeightOpt) { const v = Number(kbHeightOpt()); if (Number.isFinite(v)) return Math.max(0, Math.round(v)); }
    const vv = window.visualViewport; return vv ? Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height))) : 0;
  }
  let fsLiftT = 0;
  const fsLift = () => { if (!fsOpen) return; const kb = kbHeight(); fsheet.style.bottom = kb > 120 ? `${kb}px` : ''; if (kb > 120) fsheet.dataset.lift = '1'; else delete fsheet.dataset.lift; };
  const fsLiftSoon = () => { clearTimeout(fsLiftT); if (fsOpen) fsLiftT = setTimeout(fsLift, 60); };
  function openFs() {
    if (fsOpen) return;
    const kb = kbHeight(), hadFocus = document.activeElement === body || body.contains(document.activeElement);
    fsheet.style.setProperty('--ned-fs-h', `${kb > 120 ? kb : 216 + 34}px`);
    fsheet.style.bottom = ''; delete fsheet.dataset.lift;
    fsOpen = true; fsheet.hidden = false; root.dataset.fs = '1'; markFormats();
    onFormatSheet(true, kb > 120);
    if (kb > 120 || hadFocus) { selCache = { s: body.selectionStart, e: body.selectionEnd, d: 'none' }; document.activeElement?.blur?.(); }
    clearTimeout(fsLiftT); fsLiftT = setTimeout(fsLift, 500); // キーボードが下がりきる（約 0.3 秒）のを待ってから、まだ出ていれば上へ
  }
  function closeFs(refocus = true) {
    if (!fsOpen) return;
    fsOpen = false; fsheet.hidden = true; delete root.dataset.fs; clearTimeout(fsLiftT); fsheet.style.bottom = ''; delete fsheet.dataset.lift;
    onFormatSheet(false, false);
    if (refocus) { const c = { ...selCache }, had = document.activeElement === body; body.focus({ preventScroll: true }); if (!had) body.setSelectionRange(c.s, c.e); } // シートを開く前（シートで書式を変えたあと）のキャレットの位置へ戻す
  }
  for (const n of ['keyboardDidShow', 'keyboardDidHide']) window.addEventListener(n, fsLiftSoon);
  window.visualViewport?.addEventListener?.('resize', fsLiftSoon);
  // 今の行の書式を押された形で見せる
  function markFormats() {
    if (!fsOpen) return;
    const ln = splitLines(body.value).texts[lineAt(body.value, body.selectionStart)] ?? '';
    const k = /^\s*- \[[ xX]\] ?/.test(ln) ? 'check' : /^#{2,6} /.test(ln) ? 'heading2' : /^# /.test(ln) ? 'heading' : /^\s*- /.test(ln) ? 'bullet' : 'plain';
    for (const b of fsheet.querySelectorAll('[data-fset]')) b.setAttribute('aria-pressed', b.dataset.fset === k ? 'true' : 'false');
  }
  fmt.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.fmt === 'type') { fsOpen ? closeFs() : openFs(); } else if (b.dataset.fmt) doFormat(b.dataset.fmt);
  });
  gUndo.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return; if (b.dataset.act === 'undo') doUndo(); else if (b.dataset.act === 'redo') doRedo(); body.focus({ preventScroll: true }); });
  fsheet.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'fsclose') { closeFs(); return; }
    if (b.dataset.fset) { if (b.dataset.fset !== 'bullet' && b.dataset.fset !== 'check' && b.getAttribute('aria-pressed') === 'true') return; applyEdit(applyFormat(body.value, body.selectionStart, body.selectionEnd, b.dataset.fset), true, true); } // quiet: シートから変えたときは本文へフォーカスを戻さない（キーボードを出し直してシートを隠さない。v19.3 その2 D）
  });
  doneBtn.addEventListener('click', () => { finish(); });
  function finish() { closeFs(false); document.activeElement?.blur?.(); sync(); resetHistory(); onDone(cur); }
  gutter.addEventListener('pointerdown', (ev) => ev.preventDefault());
  gutter.addEventListener('click', (ev) => { const b = ev.target.closest('.ned-chk'); if (b) doToggle(Number(b.dataset.line)); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!destroyed && body.clientWidth) paintGutter(); }) : null;
  ro?.observe(body);
  // DOM の現在値をストアへ（変換中でも終了直前の分を落とさないため、強制 flush の前に呼ぶ）
  function sync() {
    if (!cur) return;
    const e = store.get(cur);
    if (!e?.loaded) return;
    const v = value();
    if (v !== lastSynced) { lastSynced = v; store.setText(cur, v); }
  }
  function paintStatus() {
    const e = cur ? store.get(cur) : null;
    const others = store.failedIds().filter((i) => i !== cur).length;
    let t = '';
    if (e?.loadFailed) t = 'ノートを読み込めませんでした。';
    else if (e?.failed && store.dirty(cur)) t = `${SAVE_FAILED}下書きは端末に残っています。`;
    else if (e?.draftFailed) t = DRAFT_FAILED;
    else if (others) t = `保存できていないノートが ${others} 件あります。下書きは端末に残っています。`;
    const info = !t && flashText ? flashText : ''; // 知らせ（「タスクに足しました」など）は、失敗の知らせが無いときだけ
    status.hidden = !t && !info; msg.textContent = t || info; retry.hidden = !t; status.classList.toggle('info', !!info);
    root.dataset.state = !e ? 'idle' : t ? 'error' : store.dirty(cur) ? 'dirty' : 'saved';
  }
  const repaintLater = () => { if (!destroyed) paintStatus(); };
  // v19.3 その2 F（design/35 §8）: 状態の行に短い知らせを ms の間だけ出す（12/400 #68716A。0.15 秒で出し入れ）
  let flashText = '', flashT = 0;
  function flash(text, ms = 2000) {
    clearTimeout(flashT); flashText = String(text || ''); if (destroyed) return;
    paintStatus();
    flashT = setTimeout(() => { status.classList.add('out'); flashT = setTimeout(() => { flashText = ''; status.classList.remove('out'); if (!destroyed) paintStatus(); }, 150); }, ms);
  }
  // 開いているノートの本文を外から差し替える（タスクの完了に合わせてチェックを入れ替える）。キャレットは近い位置のまま、戻すに乗り、保存へ流す
  function replaceBody(text) { // text は保存の文字（1 行目＝題名の行を含む全文）。本文の欄（2 行目から）だけを差し替える。題名の行まで違うときは全部を出し直す
    const t = String(text ?? ''), cur = value(); if (t === cur) return false;
    const i = t.indexOf('\n'), ci = cur.indexOf('\n');
    if (i < 0 || ci < 0 || t.slice(0, i) !== cur.slice(0, ci) || /\r/.test(t)) { show(t); lastSynced = null; sync(); paintStatus(); paintUndo(); return true; } // show() は「開いただけ」の印（lastSynced）を今の文字にするので、外から差し替えたときは消してから保存へ流す（v19.6: ネイティブの入力欄で新しいノートに書いた文字が保存されなかった）
    const rest = t.slice(i + 1), n = rest.length;
    return applyEdit({ text: rest, selStart: Math.min(body.selectionStart, n), selEnd: Math.min(body.selectionEnd, n) }, true, document.activeElement !== body);
  }

  async function open(id) {
    if (cur && cur !== id) await leave();
    cur = id; show(''); inkBox.replaceChildren(); onOpen(id);
    const e = await store.loadNote(id);
    if (cur !== id || destroyed) return;
    if (!store.dirty(id) || !title.value) show(e.text); // 読み込み中に打ち始めていたら上書きしない
    paintStatus(); paintInk(id);
  }
  // 古い手書き（ink）: 本文のいちばん下に表示だけする。読むだけで書き換えない。たたいても何も起きない。
  async function paintInk(id) {
    inkBox.replaceChildren();
    if (!loadInk) return;
    let ink = null; try { ink = await loadInk(id); } catch { ink = null; }
    if (cur !== id || destroyed) return;
    const w = body.clientWidth - 16 || 342;
    const n = inkElement(ink, w); if (n) inkBox.append(n);
  }
  function create() { const id = store.newNote(); return open(id).then(() => { title.focus(); return id; }); }
  // ノート移動・閉じる前: 最後の文字を書く。空の作成途中は破棄（既存ノートは触らない）。
  async function leave() {
    if (!cur) return true;
    const id = cur;
    sync();
    if (store.discardIfEmpty(id)) { cur = null; show(''); paintStatus(); return true; }
    const ok = await store.flushNote(id);
    paintStatus();
    return ok;
  }
  async function flushNow() { sync(); const r = await store.flushAll(); paintStatus(); return r.every((x) => x !== false); }

  title.addEventListener('compositionstart', () => { composing = true; });
  body.addEventListener('compositionstart', () => { // B: 変換が始まる行を覚える（変換中は DOM もキャレットも触らない。R-70）
    if (!composing && body.firstChild && sane()) { const g = getSelection(); let ln = g && g.rangeCount && body.contains(g.anchorNode) ? lineOfNode(g.anchorNode) : null; if (!ln) { const R = rows(); ln = R[rowIndexOf(R, (want ?? selCache).s)]?.el; } setGuard(ln); }
    composing = true;
  });
  const endComp = () => { composing = false; compEndAt = Date.now(); if (document.activeElement === body) reconcile(); sync(); guard = null; fit(); paintStatus(); noteChange(true); };
  title.addEventListener('compositionend', endComp);
  body.addEventListener('compositionend', endComp);
  title.addEventListener('input', (ev) => {
    if (title.value.includes('\n')) { // 複数行の貼り付け: 最初の行を題名、残りを本文の先頭へ
      const p = splitBody(title.value.replace(/\r\n/g, '\n'));
      // S8 企画の低: 貼った題名の記号は題名欄に出さない（保存では元の記号を保つ）。元の行に記号がなければ貼った記号を取り分ける
      const pm = markOf(p.title); if (pm) shape.mark = pm; title.value = p.title.slice(pm.length);
      body.value = p.rest + (body.value ? '\n' + body.value : ''); shape.nl = true;
    }
    fit(); noteChange(/insertLineBreak|insertParagraph/.test(ev.inputType || ''));
    if (!ev.isComposing && !composing) { sync(); paintStatus(); }
  });
  title.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); shape.nl = true; body.focus(); body.setSelectionRange(0, 0); sync(); }
  });
  body.addEventListener('input', (ev) => { if (!ev.isComposing && !composing) { reconcile(); guard = null; } fitBody(); noteChange(/insertLineBreak|insertParagraph/.test(ev.inputType || '')); markFormats(); if (!ev.isComposing && !composing) { sync(); paintStatus(); } });
  // Return: チェック／箇条書きの行で次の項目を続ける。変換確定の Return と Shift+Return は触らない。keydown だけで処理し二重に入れない。
  body.addEventListener('keydown', (ev) => {
    // 第19.3版 C: 箇条書き・チェックの行で Tab＝1段下げ、Shift+Tab＝1段上げ。記号の行が選択に無ければ Tab の元の動きのまま。
    if (ev.key === 'Enter') softBreak = ev.shiftKey;
    if (ev.key === 'Tab' && !ev.altKey && !ev.metaKey && !ev.ctrlKey && !ev.isComposing && !composing && ev.keyCode !== 229) {
      const r = indentLines(body.value, body.selectionStart, body.selectionEnd, ev.shiftKey ? -1 : 1);
      if (r) { ev.preventDefault(); applyEdit(r); }
      return;
    }
    if (ev.key !== 'Enter' || ev.isComposing || composing || ev.keyCode === 229 || ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    if (Date.now() - compEndAt < 50) return;
    const r = onEnter(body.value, body.selectionStart, body.selectionEnd);
    if (!r) return;
    ev.preventDefault(); applyEdit(r);
  });
  // 第19.3版 C: iPhone は箇条書き・チェックの行を右へ払うと1段下げ、左へ払うと1段上げ。
  // 決まり: 指（touch）だけ。動き出し 8 で向きを決め、横が縦の 1.5 倍を超えるときだけ始める（縦はスクロールに任せる）。0.35 秒より長く押してからの動きは文字の選択・拡大鏡に任せる。
  // 離したとき横 24 以上・横が縦の 1.5 倍を超えていれば1段動かす。指には 1/3 だけ追い（最大 20＝1段）、端（0 段・最大段）では 1/10 だけ。離したら 0.18 秒で段へ寄せる。
  // 本文を編集中（フォーカス中）か、ノートのシートの中だけ（ページの上の読むだけの本文では、今までどおりページのめくり・横すべりが先）。変換中は始めない。
  const SWIPE = { slop: 8, min: 24, ratio: 1.5, hold: 350, follow: 1 / 3, edge: 0.1, cap: 60 };
  let sw = null;
  const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const swNodes = (ln) => { const i = [...body.children].indexOf(ln); return [ln, i < 0 ? null : gutter.querySelector(`.ned-chk[data-line="${i}"]`)].filter(Boolean); };
  const swPaint = (nodes, x, anim) => { for (const n of nodes) { n.style.transition = anim && !reduced() ? 'transform .18s ease-out' : 'none'; n.style.transform = x ? `translateX(${x}px)` : ''; } };
  const swOffset = (dx, lv) => { const dir = dx > 0 ? 1 : -1, can = dir > 0 ? lv < INDENT_MAX : lv > 0; return dir * Math.min(Math.abs(dx), SWIPE.cap) * (can ? SWIPE.follow : SWIPE.edge); };
  body.addEventListener('pointerdown', (ev) => {
    want = null; sw = null;
    if (ev.pointerType !== 'touch' || ev.isPrimary === false || composing) return;
    if (document.activeElement !== body && !root.closest('.nsheet')) return;
    const ln = lineOfNode(ev.target); if (!ln || (ln.dataset.k !== 'bullet' && ln.dataset.k !== 'check')) return;
    sw = { id: ev.pointerId, el: ln, x: ev.clientX, y: ev.clientY, t: ev.timeStamp, on: false, dx: 0, dy: 0, lv: Number(ln.dataset.lv || 0), nodes: [] };
  });
  const swMove = (ev) => {
    if (!sw || ev.pointerId !== sw.id) return;
    const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
    if (!sw.on) {
      if (Math.hypot(dx, dy) < SWIPE.slop) return;
      if (ev.timeStamp - sw.t > SWIPE.hold || Math.abs(dx) <= Math.abs(dy) * SWIPE.ratio || composing || !sw.el.isConnected) { sw = null; return; }
      sw.on = true; sw.nodes = swNodes(sw.el); root.dataset.indenting = '1';
    }
    sw.dx = dx; sw.dy = dy;
    swPaint(sw.nodes, swOffset(dx, sw.lv), false);
    if (ev.cancelable) ev.preventDefault();
  };
  const swEnd = (ev) => {
    if (!sw || ev.pointerId !== sw.id) return;
    const g = sw; sw = null; if (!g.on) return;
    delete root.dataset.indenting;
    const ok = ev.type === 'pointerup' && Math.abs(g.dx) >= SWIPE.min && Math.abs(g.dx) > Math.abs(g.dy) * SWIPE.ratio && g.el.isConnected && !composing;
    const idx = [...body.children].indexOf(g.el), dir = g.dx > 0 ? 1 : -1, off = swOffset(g.dx, g.lv);
    let nodes = g.nodes, from = off;
    if (ok && idx >= 0 && applyEdit(indentLines(body.value, body.selectionStart, body.selectionEnd, dir, idx), true, true)) {
      const ln = body.children[idx]; nodes = ln ? swNodes(ln) : []; from = off - dir * LV_STEP; // 段が動いたぶんを引いて、指の位置から段へ寄せる
    }
    swPaint(nodes, from, false); if (nodes[0]) void nodes[0].offsetWidth; swPaint(nodes, 0, true);
  };
  document.addEventListener('pointermove', swMove, { passive: false });
  document.addEventListener('pointerup', swEnd);
  document.addEventListener('pointercancel', swEnd);
  body.addEventListener('keyup', (ev) => { if (ev.key === 'Enter' || ev.key === 'Shift') softBreak = false; });
  // カーソルだけ動いたら、文字の1まとまりを区切る
  const onSel = () => {
    if (destroyed || !last) return;
    const a = document.activeElement; if (a !== body && a !== title) return;
    if (composing || !sane()) return; // R-70: 選択の変化は読むだけ。本文が想定外の形（WebKit の span など）でも作り直さない（次の入力・reconcile で整える）
    if (title.value === last.t && body.value === last.b && (a.selectionStart !== last.s || a.selectionEnd !== last.e || (a === title ? 'title' : 'body') !== last.w)) { closeGroup(); last = snap(); }
    markFormats();
  };
  document.addEventListener('selectionchange', onSel);
  // 紙の末尾の空き（3行・90）をたたくと、末尾の次の行にカーソル。末尾が空の行ならそこ。無ければ空の行を1つ足す。
  tail.addEventListener('pointerdown', (ev) => ev.preventDefault());
  tail.addEventListener('click', () => {
    if (!cur) return;
    const v = body.value;
    if (v !== '' && !v.endsWith('\n')) { closeGroup(); if (!last) last = snap(); undoSt.push(last); if (undoSt.length > UNDO_MAX) undoSt.shift(); redoSt = []; body.value = `${v}\n`; last = snap(); sync(); fitBody(); paintStatus(); paintUndo(); }
    body.focus({ preventScroll: true }); body.setSelectionRange(body.value.length, body.value.length);
    caretIntoView();
  });
  const caretIntoView = () => { const r = bodyWrap.getBoundingClientRect(); bodyWrap.scrollTop = Math.max(0, bodyWrap.scrollHeight - r.height); };
  retry.addEventListener('click', () => { sync(); store.flushAll().then(paintStatus); });

  delBtn.addEventListener('click', async () => {
    if (!cur) return;
    const id = cur; sync();
    const r = await store.trash(id);
    if (r === false) { paintStatus(); return; } // 保存できないものは消さない
    cur = null; show(''); paintStatus(); onTrashChange(id);
    if (!trashBox.hidden) await renderTrash();
  });
  async function renderTrash() {
    let list = [];
    try { list = await store.listTrash(); } catch { list = null; }
    trashBox.replaceChildren();
    if (!list) { trashBox.append(el('div', 'ned-empty', '最近削除した項目を読み込めませんでした。')); return; }
    if (!list.length) { trashBox.append(el('div', 'ned-empty', '最近削除した項目はありません。')); return; }
    trashBox.append(el('div', 'ned-note', '削除から30日以内は元に戻せます。'));
    for (const n of list) {
      const row = el('div', 'ned-trashrow'); row.dataset.id = n.id;
      const left = Math.max(0, 30 - Math.floor((Date.now() - n.deletedAt) / 86400000));
      const b = el('button', 'ned-restore', '元に戻す'); b.type = 'button'; b.dataset.act = 'restore';
      b.addEventListener('click', async () => { const r = await store.restore(n.id); if (r) { onTrashChange(n.id); await renderTrash(); } else b.textContent = '期限が過ぎています'; });
      row.append(el('span', 'ned-trashtitle', titleOf(n.body)), el('span', 'ned-left', `あと${left}日`), b);
      trashBox.append(row);
    }
  }
  trashBtn.addEventListener('click', async () => { trashBox.hidden = !trashBox.hidden; if (!trashBox.hidden) await renderTrash(); });

  const unsub = store.subscribe?.(() => { if (!destroyed) paintStatus(); });
  const onHide = () => { flushNow(); };
  const onVis = () => { if (document.hidden) flushNow(); };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onVis);

  function destroy() {
    destroyed = true; unsub?.(); ro?.disconnect(); document.removeEventListener('selectionchange', onSel); document.removeEventListener('pointermove', swMove); document.removeEventListener('pointerup', swEnd); document.removeEventListener('pointercancel', swEnd); clearTimeout(groupTimer);
    window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis);
    root.remove();
  }
  return { el: root, titleEl: title, bodyEl: body, fmtEl: fmt, topEl: top, doneEl: doneBtn, fsheetEl: fsheet, undo: doUndo, redo: doRedo, finish, closeFs, flash, replaceBody, get fsOpen() { return fsOpen; }, history: () => ({ undo: undoSt.length, redo: redoSt.length }), gutterEl: gutter, open, create, leave, flushNow, sync, destroy, repaint: repaintLater, renderTrash, get id() { return cur; } };
}
