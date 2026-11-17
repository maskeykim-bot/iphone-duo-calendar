// ノートの常設エディタ（保存ボタンなし）。1行目＝題名（20pt）、残り＝本文。保存される本文は1つ（題名＋改行＋本文）。
// 通常の画面入口にはまだ接続しない（PR28）。DOM は textContent で作り、利用者の文字を HTML として扱わない。
import { noteStore, SAVE_FAILED, DRAFT_FAILED } from './notes.js';
import { titleOf, EMPTY_TITLE } from './notes-model.js';

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

export function mountNoteEditor(host, { store = noteStore, onOpen = () => {}, onTrashChange = () => {} } = {}) {
  const root = el('section', 'ned'); root.dataset.noteEditor = '';
  const title = el('textarea', 'ned-title'); title.rows = 1; title.setAttribute('aria-label', '題名'); title.placeholder = EMPTY_TITLE; title.enterKeyHint = 'next';
  const body = el('textarea', 'ned-body'); body.setAttribute('aria-label', '本文'); body.placeholder = '本文';
  const status = el('div', 'ned-status'); status.setAttribute('role', 'status'); status.hidden = true;
  const msg = el('span'); const retry = el('button', 'ned-retry', '再試行'); retry.type = 'button'; retry.hidden = true;
  status.append(msg, retry);
  const bar = el('div', 'ned-bar');
  const delBtn = el('button', 'ned-del', '削除'); delBtn.type = 'button'; delBtn.dataset.act = 'trash';
  const trashBtn = el('button', 'ned-trashbtn', '最近削除した項目'); trashBtn.type = 'button'; trashBtn.dataset.act = 'trashlist';
  bar.append(delBtn, trashBtn);
  const trashBox = el('div', 'ned-trash'); trashBox.hidden = true; trashBox.setAttribute('aria-label', '最近削除した項目');
  root.append(title, body, status, bar, trashBox);
  host.append(root);

  let cur = null;               // 開いているノートID
  let shape = { nl: false, eol: '\n', crlf: false };
  let lastSynced = '';
  let composing = false;
  let destroyed = false;

  const value = () => joinBody({ title: title.value.replace(/\r?\n/g, ' '), rest: body.value, ...shape });
  function show(text) {
    const s = splitBody(text); const crlf = isCrlf(text); shape = { nl: s.nl, eol: s.eol, crlf };
    title.value = s.title; body.value = crlf ? s.rest.replace(/\r\n/g, '\n') : s.rest; fit();
    lastSynced = value(); // 触っていないノートは、開いただけで書き換えない
  }
  function fit() { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; }
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
    cur = id; show(''); onOpen(id);
    const e = await store.loadNote(id);
    if (cur !== id || destroyed) return;
    if (!store.dirty(id) || !title.value) show(e.text); // 読み込み中に打ち始めていたら上書きしない
    paintStatus();
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
  const endComp = () => { composing = false; sync(); fit(); paintStatus(); };
  title.addEventListener('compositionend', endComp);
  body.addEventListener('compositionend', endComp);
  title.addEventListener('input', (ev) => {
    if (title.value.includes('\n')) { // 複数行の貼り付け: 最初の行を題名、残りを本文の先頭へ
      const p = splitBody(title.value.replace(/\r\n/g, '\n'));
      title.value = p.title; body.value = p.rest + (body.value ? '\n' + body.value : ''); shape.nl = true;
    }
    fit();
    if (!ev.isComposing && !composing) { sync(); paintStatus(); }
  });
  title.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); shape.nl = true; body.focus(); body.setSelectionRange(0, 0); sync(); }
  });
  body.addEventListener('input', (ev) => { if (!ev.isComposing && !composing) { sync(); paintStatus(); } });
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
    destroyed = true; unsub?.();
    window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis);
    root.remove();
  }
  return { el: root, titleEl: title, bodyEl: body, open, create, leave, flushNow, sync, destroy, repaint: repaintLater, renderTrash, get id() { return cur; } };
}
