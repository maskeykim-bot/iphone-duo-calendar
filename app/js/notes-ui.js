// ノートの常設エディタ（保存ボタンなし）。1行目＝題名（20pt）、残り＝本文。保存される本文は1つ（題名＋改行＋本文）。
// 通常の画面入口にはまだ接続しない（PR28）。DOM は textContent で作り、利用者の文字を HTML として扱わない。
import { noteStore, SAVE_FAILED, DRAFT_FAILED } from './notes.js';
import { titleOf, EMPTY_TITLE } from './notes-model.js';
import { applyFormat, onEnter, toggleCheck, checkLines, lineAt, splitLines } from './note-lines.js';
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
  const body = el('textarea', 'ned-body'); body.setAttribute('aria-label', '本文'); body.placeholder = '本文';
  // 本文の補助列: チェック行の左に 22pt の四角（当たりは 44pt）。本文の `- [ ] ` が正本で、列は表示と操作だけ。
  const bodyWrap = el('div', 'ned-bodywrap'); const gutter = el('div', 'ned-gutter'); gutter.setAttribute('aria-label', 'チェック欄'); gutter.hidden = true;
  const mirror = el('div', 'ned-mirror'); mirror.setAttribute('aria-hidden', 'true');
  bodyWrap.append(gutter, body, mirror);
  // 上の帯（design/27 §3）: 戻す群｜道具群（字・チェック・箇条書き）｜完了。位置はキーボードがあっても動かない。
  const top = el('div', 'ned-top'); top.setAttribute('role', 'toolbar'); top.setAttribute('aria-label', 'ノートの操作');
  const ibtn = (cls, label, act, svg) => { const b = el('button', `ned-ib ${cls}`); b.type = 'button'; b.dataset.act = act; b.setAttribute('aria-label', label); b.innerHTML = svg; return b; };
  const S = (d) => `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const undoBtn = ibtn('ned-undo', '元に戻す', 'undo', S('<path d="M8 6 4 10l4 4"/><path d="M4 10h9a5 5 0 0 1 0 10h-3"/>')); undoBtn.disabled = true;
  const redoBtn = ibtn('ned-redo', 'やり直す', 'redo', S('<path d="m14 6 4 4-4 4"/><path d="M18 10H9a5 5 0 0 0 0 10h3"/>')); redoBtn.disabled = true;
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
  let shape = { nl: false, eol: '\n', crlf: false };
  let lastSynced = '';
  let composing = false;
  let destroyed = false;
  let compEndAt = 0;
  // 戻す・やり直す（design/27 §3）: 題名と本文の全体を写しで持つ。新しい方から 50 回。保存しない。完了で捨てる。
  let undoSt = [], redoSt = [], last = null, groupOpen = false, groupTimer = 0, root_active = false;
  const snap = () => { const w = document.activeElement === title ? 'title' : 'body'; const t = w === 'title' ? title : body; return { t: title.value, b: body.value, s: t.selectionStart ?? 0, e: t.selectionEnd ?? 0, w }; };
  const closeGroup = () => { groupOpen = false; clearTimeout(groupTimer); groupTimer = 0; };
  const paintUndo = () => { undoBtn.disabled = !undoSt.length; redoBtn.disabled = !redoSt.length; };
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

  const value = () => joinBody({ title: title.value.replace(/\r?\n/g, ' '), rest: body.value, ...shape });
  function show(text) {
    const s = splitBody(text); const crlf = isCrlf(text); shape = { nl: s.nl, eol: s.eol, crlf };
    title.value = s.title; body.value = crlf ? s.rest.replace(/\r\n/g, '\n') : s.rest; fit(); resetHistory();
    lastSynced = value(); // 触っていないノートは、開いただけで書き換えない
  }
  function fit() { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; fitBody(); }
  function fitBody() { body.classList.toggle('has-checks', checkLines(body.value).length > 0); body.style.height = 'auto'; body.style.height = `${Math.max(body.scrollHeight, 0)}px`; paintGutter(); }
  // 折り返しを含む各行の位置を、同じ書体の見えない複製で測る
  function paintGutter() {
    const list = checkLines(body.value);
    body.classList.toggle('has-checks', list.length > 0);
    gutter.hidden = !list.length;
    gutter.replaceChildren();
    if (!list.length) return;
    const cs = getComputedStyle(body);
    mirror.style.cssText = `width:${body.clientWidth}px;font:${cs.font};letter-spacing:${cs.letterSpacing};padding:${cs.padding};line-height:${cs.lineHeight}`;
    mirror.replaceChildren(...body.value.split('\n').map((l) => el('div', 'ned-mline', l === '' ? '\u200b' : l)));
    const rows = mirror.children;
    const lh = parseFloat(cs.lineHeight) || 24;
    for (const c of list) {
      const r = rows[c.index]; if (!r) continue;
      const b = el('button', 'ned-chk'); b.type = 'button'; b.dataset.line = String(c.index); b.dataset.checked = c.checked ? '1' : '0';
      b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', c.checked ? 'true' : 'false'); b.setAttribute('aria-label', c.text || '項目');
      b.style.top = `${r.offsetTop + lh / 2 - 22}px`;
      b.append(el('i', 'ned-box', c.checked ? '✓' : ''));
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
  gUndo.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b || b.disabled) return; if (b.dataset.act === 'undo') doUndo(); else if (b.dataset.act === 'redo') doRedo(); body.focus({ preventScroll: true }); });
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
  const endComp = () => { composing = false; compEndAt = Date.now(); sync(); fit(); paintStatus(); noteChange(true); };
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
  body.addEventListener('input', (ev) => { fitBody(); noteChange(/insertLineBreak|insertParagraph/.test(ev.inputType || '')); markFormats(); if (!ev.isComposing && !composing) { sync(); paintStatus(); } });
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
