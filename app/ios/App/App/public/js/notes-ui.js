// ノートの常設エディタ（保存ボタンなし）。1行目＝題名（20pt）、残り＝本文。保存される本文は1つ（題名＋改行＋本文）。
// 通常の画面入口にはまだ接続しない（PR28）。DOM は textContent で作り、利用者の文字を HTML として扱わない。
import { noteStore, SAVE_FAILED, DRAFT_FAILED } from './notes.js';
import { titleOf, markOf, EMPTY_TITLE } from './notes-model.js';
import { applyFormat, onEnter, toggleCheck, lineAt, splitLines, viewOf } from './note-lines.js';
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

export function mountNoteEditor(host, { store = noteStore, onOpen = () => {}, onTrashChange = () => {}, onDone = () => {}, onFormatSheet = () => {}, loadInk = null } = {}) {
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
  let shape = { nl: false, eol: '\n', crlf: false, mark: '' }; // mark = 1行目の先頭の記号（「# 」など）。題名欄には出さず、保存のときに元のまま付け直す（S7 R-27・V-21）
  let lastSynced = '';
  let composing = false;
  let destroyed = false;
  let compEndAt = 0;
  // ---- 本文の行モデル。DOM = 行の div（.nl）。data-k=種類、data-pre=行頭の記号の文字、中身=画面に出す文字だけ ----
  const mkLine = (raw) => {
    const v = viewOf(raw); const d = el('div', 'nl'); d.dataset.k = v.kind; d.dataset.pre = v.pre;
    if (v.kind === 'check') d.dataset.c = v.checked ? '1' : '0';
    if (v.text) d.textContent = v.text; else d.append(document.createElement('br'));
    return d;
  };
  const sane = () => [...body.childNodes].every((n) => n.nodeType === 1 && n.tagName === 'DIV' && n.classList.contains('nl') && [...n.childNodes].every((c) => c.nodeType === 3 || (c.nodeType === 1 && c.tagName === 'BR')));
  const rows = () => { const out = []; let pos = 0; for (const c of body.children) { const pre = c.dataset.pre || '', text = c.textContent; out.push({ el: c, start: pos, pre, text }); pos += pre.length + text.length + 1; } return out; };
  const flat = () => { // 想定外の DOM（ブラウザが作った入れ子など）を、文字だけ拾って行に直す
    const out = [];
    for (const c of body.childNodes) {
      if (c.nodeType === 3) out.push(c.data);
      else if (c.tagName === 'BR') out.push('');
      else if (c.tagName === 'DIV') out.push((c.classList.contains('nl') ? c.dataset.pre || '' : '') + c.textContent);
    }
    return out.join('\n');
  };
  const paintEmpty = () => { const one = body.children.length <= 1 && !body.textContent; if (one) body.dataset.empty = '1'; else delete body.dataset.empty; };
  function renderValue(text) { body.replaceChildren(...splitLines(text).texts.map(mkLine)); paintEmpty(); }
  function readValue() { if (!body.firstChild) renderValue(''); else if (!sane()) renderValue(flat()); return rows().map((r) => r.pre + r.text).join('\n'); }
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
  const selNow = () => {
    const g = window.getSelection();
    if (!g || !g.rangeCount || !body.contains(g.anchorNode) || !body.contains(g.focusNode)) return selCache;
    if (!sane()) readValue();
    const R = rows(); const a = rawAt(R, g.anchorNode, g.anchorOffset), f = rawAt(R, g.focusNode, g.focusOffset);
    selCache = { s: Math.min(a, f), e: Math.max(a, f), d: a === f ? 'none' : a < f ? 'forward' : 'backward' };
    return selCache;
  };
  function setRange(s, e, dir) {
    if (!body.firstChild) renderValue('');
    const R = rows(); const g = window.getSelection(); if (!g) return;
    const [an, ao] = domAt(R, s), [fn, fo] = domAt(R, e);
    try { if (dir === 'backward') g.setBaseAndExtent(fn, fo, an, ao); else g.setBaseAndExtent(an, ao, fn, fo); } catch { /* 無視 */ }
    selCache = { s, e, d: dir || 'none' };
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
  body.addEventListener('beforeinput', (ev) => {
    const t = ev.inputType || '';
    if (composing || ev.isComposing || /Composition/.test(t)) return;
    if (t === 'historyUndo') { ev.preventDefault(); doUndo(); return; }
    if (t === 'historyRedo') { ev.preventDefault(); doRedo(); return; }
    readValue(); const R = rows(); const { s, e } = selNow();
    const ia = rowIndexOf(R, s), ib = rowIndexOf(R, e), A = R[ia];
    const col = s - A.start - A.pre.length;
    const s2 = ia !== ib && col === 0 ? A.start : s; // 行の頭から複数行を選んで消す・打つとき、頭の行の記号も一緒に消える（全選択して消すと空のノート）
    const data = ev.data ?? ev.dataTransfer?.getData('text/plain') ?? '';
    const norm = (x) => String(x).replace(/\r\n?/g, '\n');
    if (t === 'insertParagraph' || t === 'insertLineBreak') {
      ev.preventDefault();
      if (s === e && col === 0 && A.pre) { editRaw(A.start, A.start, '\n', A.start + 1 + A.pre.length, t); return; } // 行頭で改行: 記号の行は下へ押し下げる
      editRaw(s, e, '\n', null, t); return;
    }
    if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertFromYank' || (t === 'insertReplacementText' && ia !== ib)) {
      ev.preventDefault(); editRaw(s2, e, norm(data), null, t); return;
    }
    if (t === 'insertText' && (ia !== ib || /\n/.test(data))) { ev.preventDefault(); editRaw(s2, e, norm(data), null, t); return; }
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
  const paintUndo = () => { undoBtn.setAttribute('aria-disabled', String(!undoSt.length)); redoBtn.setAttribute('aria-disabled', String(!redoSt.length)); };
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

  const value = () => { const { mark, ...sh } = shape; return joinBody({ title: mark + title.value.replace(/\r?\n/g, ' '), rest: body.value, ...sh }); };
  function show(text) {
    const s = splitBody(text); const crlf = isCrlf(text); const mark = markOf(s.title); shape = { nl: s.nl, eol: s.eol, crlf, mark };
    title.value = s.title.slice(mark.length); body.value = crlf ? s.rest.replace(/\r\n/g, '\n') : s.rest; fit(); resetHistory();
    lastSynced = value(); // 触っていないノートは、開いただけで書き換えない
  }
  function fit() { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; fitBody(); }
  function fitBody() { paintEmpty(); paintGutter(); }
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
      b.append(el('i', 'ned-box', c.dataset.c === '1' ? '✓' : ''));
      gutter.append(b);
    }
  }
  // 書式操作の共通: 本文を差し替え、選択を保ち、保存へ流す
  function applyEdit(r, undoable = true) {
    if (!r || r.text === body.value) return false;
    closeGroup(); if (!last) last = snap();
    if (undoable) { undoSt.push(last); if (undoSt.length > UNDO_MAX) undoSt.shift(); redoSt = []; }
    body.value = r.text; body.setSelectionRange(r.selStart, r.selEnd);
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
  function kbHeight() { const vv = window.visualViewport; return vv ? Math.max(0, Math.round(window.innerHeight - (vv.offsetTop + vv.height))) : 0; }
  function openFs() {
    if (fsOpen) return;
    const kb = kbHeight();
    fsheet.style.setProperty('--ned-fs-h', `${kb > 120 ? kb : 216 + 34}px`);
    fsOpen = true; fsheet.hidden = false; root.dataset.fs = '1'; markFormats();
    onFormatSheet(true, kb > 120);
    if (kb > 120) document.activeElement?.blur?.();
  }
  function closeFs(refocus = true) {
    if (!fsOpen) return;
    fsOpen = false; fsheet.hidden = true; delete root.dataset.fs;
    onFormatSheet(false, false);
    if (refocus) body.focus({ preventScroll: true });
  }
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
    if (b.dataset.fset) { if (b.dataset.fset !== 'bullet' && b.dataset.fset !== 'check' && b.getAttribute('aria-pressed') === 'true') return; applyEdit(applyFormat(body.value, body.selectionStart, body.selectionEnd, b.dataset.fset)); }
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
    status.hidden = !t; msg.textContent = t; retry.hidden = !t;
    root.dataset.state = !e ? 'idle' : t ? 'error' : store.dirty(cur) ? 'dirty' : 'saved';
  }
  const repaintLater = () => { if (!destroyed) paintStatus(); };

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
  body.addEventListener('compositionstart', () => { composing = true; });
  const endComp = () => { composing = false; compEndAt = Date.now(); if (document.activeElement === body) reconcile(); sync(); fit(); paintStatus(); noteChange(true); };
  title.addEventListener('compositionend', endComp);
  body.addEventListener('compositionend', endComp);
  title.addEventListener('input', (ev) => {
    if (title.value.includes('\n')) { // 複数行の貼り付け: 最初の行を題名、残りを本文の先頭へ
      const p = splitBody(title.value.replace(/\r\n/g, '\n'));
      title.value = p.title; body.value = p.rest + (body.value ? '\n' + body.value : ''); shape.nl = true;
    }
    fit(); noteChange(/insertLineBreak|insertParagraph/.test(ev.inputType || ''));
    if (!ev.isComposing && !composing) { sync(); paintStatus(); }
  });
  title.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); shape.nl = true; body.focus(); body.setSelectionRange(0, 0); sync(); }
  });
  body.addEventListener('input', (ev) => { if (!ev.isComposing && !composing) reconcile(); fitBody(); noteChange(/insertLineBreak|insertParagraph/.test(ev.inputType || '')); markFormats(); if (!ev.isComposing && !composing) { sync(); paintStatus(); } });
  // Return: チェック／箇条書きの行で次の項目を続ける。変換確定の Return と Shift+Return は触らない。keydown だけで処理し二重に入れない。
  body.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.isComposing || composing || ev.keyCode === 229 || ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    if (Date.now() - compEndAt < 50) return;
    const r = onEnter(body.value, body.selectionStart, body.selectionEnd);
    if (!r) return;
    ev.preventDefault(); applyEdit(r);
  });
  // カーソルだけ動いたら、文字の1まとまりを区切る
  const onSel = () => {
    if (destroyed || !last) return;
    const a = document.activeElement; if (a !== body && a !== title) return;
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
    destroyed = true; unsub?.(); ro?.disconnect(); document.removeEventListener('selectionchange', onSel); clearTimeout(groupTimer);
    window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis);
    root.remove();
  }
  return { el: root, titleEl: title, bodyEl: body, fmtEl: fmt, topEl: top, doneEl: doneBtn, fsheetEl: fsheet, undo: doUndo, redo: doRedo, finish, closeFs, get fsOpen() { return fsOpen; }, history: () => ({ undo: undoSt.length, redo: redoSt.length }), gutterEl: gutter, open, create, leave, flushNow, sync, destroy, repaint: repaintLater, renderTrash, get id() { return cur; } };
}
