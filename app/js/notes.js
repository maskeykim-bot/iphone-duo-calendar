// ノートの編集と自動保存（保存ボタンなし）。ノートごとに最新本文・世代・保存の直列化を持つ。
// 下書きは localStorage（namespace 付き、noteId ごと）。DB に commit できた世代だけ下書きを消す。
// memos.js/createMemoStore と同じ世代保護。通常の画面入口はまだ切り替えない（PR28）。
import * as realDb from './db.js';

export const DRAFT_PREFIX = 'duo.note.draft.v1:';
export const DEBOUNCE_MS = 1000;
export const SAVE_FAILED = 'ノートを保存できませんでした。';
export const DRAFT_FAILED = '下書きを端末に控えられません（容量不足の可能性）。';

const blank = (t) => /^\s*$/.test(t);
export function newNoteId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}

export function createNoteStore({ db = realDb, storage = globalThis.localStorage, now = () => Date.now(), onChange = () => {}, delay = DEBOUNCE_MS, uuid = newNoteId } = {}) {
  // id -> { text, gen, saved, loaded, loadFailed, timer, chain, failed, fresh, createdAt, draftFailed, loading }
  const E = new Map();
  const subs = new Set();
  const emit = (id) => { onChange(id); subs.forEach((f) => { try { f(id); } catch { /* 無視 */ } }); };
  const ent = (id) => {
    let e = E.get(id);
    if (!e) { e = { text: '', gen: 0, saved: 0, loaded: false, loadFailed: false, timer: 0, chain: Promise.resolve(), failed: false, fresh: false, createdAt: null, draftFailed: false, loading: null }; E.set(id, e); }
    return e;
  };
  const dkey = (id) => DRAFT_PREFIX + id;
  const dirty = (e) => e.gen !== e.saved;
  function writeDraft(id, e) {
    try { storage.setItem(dkey(id), JSON.stringify({ id, text: e.text, at: now(), createdAt: e.createdAt })); e.draftFailed = false; }
    catch { e.draftFailed = true; /* 容量不足: 保存は続け、欄の近くに知らせる */ }
  }
  const dropDraft = (id) => { try { storage.removeItem(dkey(id)); } catch { /* 無視 */ } };

  // 新規ノート。DB にはまだ書かない（文字が入って初めて保存される）。
  function newNote() {
    const id = uuid(), e = ent(id);
    e.loaded = true; e.fresh = true; e.createdAt = now();
    emit(id);
    return id;
  }

  function flushNote(id) {
    const e = E.get(id);
    if (!e) return Promise.resolve(true);
    clearTimeout(e.timer); e.timer = 0;
    if (!dirty(e)) return e.chain.then(() => !e.failed);
    // ノート別に直列化。保存時点の本文・世代を取り、古い ack が新しい下書きを消さないよう世代を比べる。
    e.chain = e.chain.then(async () => {
      if (!dirty(e)) return;
      const g = e.gen, t = e.text;
      try {
        if (e.fresh && blank(t)) { e.saved = Math.max(e.saved, g); e.failed = false; if (e.gen === g) dropDraft(id); }
        else {
          const base = await db.getNote(id); // 他の変更（フォルダ・固定・削除印）を失わないよう毎回読む
          const stamp = now();
          const rec = base ? { ...base, body: t, updatedAt: stamp } : { id, body: t, createdAt: e.createdAt ?? stamp, updatedAt: stamp, folderId: null, pinned: false, pinnedAt: null, deletedAt: null };
          await db.putNote(rec);
          e.saved = Math.max(e.saved, g); e.failed = false; e.fresh = false;
          if (e.gen === g) dropDraft(id);
        }
      } catch { e.failed = true; }
      emit(id);
    });
    return e.chain.then(() => !e.failed);
  }
  const flushAll = () => Promise.all([...E.keys()].filter((i) => dirty(E.get(i))).map(flushNote));

  function setText(id, text) {
    const e = ent(id);
    e.text = text; e.gen++; e.loaded = true;
    writeDraft(id, e);
    clearTimeout(e.timer);
    // 下書きを控えられないときは待たずに DB へ書く
    e.timer = setTimeout(() => { flushNote(id); }, e.draftFailed ? 0 : delay);
    emit(id);
  }

  // 表示用に DB から読む（未編集のときだけ反映）。失敗は loadFailed。
  function loadNote(id) {
    const e = ent(id);
    if (e.loaded) return Promise.resolve(e);
    if (e.loading) return e.loading;
    e.loading = db.getNote(id).then((n) => {
      if (!e.loaded) { e.text = n?.body ?? ''; e.createdAt = n?.createdAt ?? null; e.fresh = !n; e.loaded = true; }
      e.loadFailed = false;
    }, () => { e.loadFailed = true; }).then(() => { e.loading = null; emit(id); return e; });
    return e.loading;
  }

  // 空の作成途中だけ破棄する。既存ノートや文字のあるものには何もしない。
  function discardIfEmpty(id) {
    const e = E.get(id);
    if (!e || !e.fresh || !blank(e.text)) return false;
    clearTimeout(e.timer); E.delete(id); dropDraft(id);
    return true;
  }

  const draftKeys = () => {
    const keys = [];
    try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k); } } catch { /* 無視 */ }
    return keys;
  };
  // 起動時: 残った下書きが DB より新しければ入れて保存し直す。失敗した下書きは残して表示にも使う。
  async function recoverNoteDrafts() {
    const done = [];
    for (const k of draftKeys()) {
      let d = null;
      try { d = JSON.parse(storage.getItem(k)); } catch { d = null; }
      const id = k.slice(DRAFT_PREFIX.length);
      if (!d || typeof d.text !== 'string' || d.id !== id) continue; // 読めない下書きは触らない
      const e = ent(id);
      if (dirty(e)) continue; // 起動後に既に打っている
      let n = null, readOk = true;
      try { n = await db.getNote(id); } catch { readOk = false; }
      if (readOk && n && n.updatedAt >= (d.at || 0)) { dropDraft(id); E.delete(id); continue; }
      if (readOk && !n && blank(d.text)) { dropDraft(id); E.delete(id); continue; } // 空の作成途中
      e.text = d.text; e.gen++; e.loaded = true; e.loadFailed = false; e.fresh = readOk && !n;
      e.createdAt = n?.createdAt ?? d.createdAt ?? null;
      done.push(id);
      await flushNote(id);
    }
    return done;
  }

  // 最近削除（30日以内は回復できる）。削除前に未保存分を書く。
  async function trash(id) {
    if (discardIfEmpty(id)) return null;
    if (!(await flushNote(id))) return false;
    const r = await db.trashNote(id, now());
    E.delete(id); emit(id);
    return r;
  }
  async function restore(id) {
    const r = await db.restoreNote(id, now());
    E.delete(id); emit(id);
    return r;
  }
  const listTrash = () => db.listTrashedNotes(now());

  const failedIds = () => [...E.entries()].filter(([, e]) => e.failed && dirty(e)).map(([i]) => i);
  return { subscribe: (f) => { subs.add(f); return () => subs.delete(f); }, newNote, flushNote, flushAll, setText, loadNote, discardIfEmpty, recoverNoteDrafts, trash, restore, listTrash, failedIds,
    get: (i) => E.get(i) || null, dirty: (i) => !!E.get(i) && dirty(E.get(i)), anyDirty: () => [...E.values()].some(dirty),
    reset: () => { E.forEach((e) => clearTimeout(e.timer)); E.clear(); } };
}

// 本番用の単一ストア。
let hook = () => {};
export const setNoteHook = (f) => { hook = f; };
export const noteStore = createNoteStore({ onChange: (i) => hook(i) });
export const flushNote = (i) => noteStore.flushNote(i);
export const recoverNoteDrafts = () => noteStore.recoverNoteDrafts();
