// ノートの編集と自動保存（保存ボタンなし）。ノートごとに最新本文・世代・保存の直列化を持つ。
// 下書きは localStorage（namespace 付き、noteId ごと）。DB に commit できた世代だけ下書きを消す。
// memos.js/createMemoStore と同じ世代保護。通常の画面入口はまだ切り替えない（PR28）。
import * as realDb from './db.js';
import { noteDateOf, normDay } from './notes-model.js';

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
    if (!e) { e = { text: '', gen: 0, saved: 0, loaded: false, loadFailed: false, timer: 0, chain: Promise.resolve(), failed: false, fresh: false, createdAt: null, draftFailed: false, loading: null, meta: null }; E.set(id, e); }
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
          const m = e.meta || {};
          const rec = base ? { ...base, body: t, updatedAt: stamp } : { id, body: t, createdAt: e.createdAt ?? stamp, updatedAt: stamp, folderId: m.folderId ?? null, pinned: !!m.pinned, pinnedAt: m.pinned ? (m.pinnedAt ?? stamp) : null, date: normDay(m.date), ...(m.colorId ? { colorId: m.colorId } : {}), deletedAt: null };
          await db.putNote(rec);
          if (!base) e.meta = null;
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

  // 分類（フォルダ・ピン）。本文・updatedAt は変えない。まだ保存されていない新規ノートは、最初の保存に載せる。
  async function setMeta(id, patch) {
    const e = E.get(id);
    if (e && e.fresh) { e.meta = { ...(e.meta || {}), ...patch }; if ('pinned' in patch) e.meta.pinnedAt = patch.pinned ? now() : null; emit(id); return true; }
    const r = await db.patchNote(id, 'pinned' in patch ? { ...patch, pinnedAt: patch.pinned ? now() : null } : patch);
    emit(id);
    return !!r;
  }
  async function getMeta(id) {
    const e = E.get(id);
    if (e && e.fresh) return { folderId: e.meta?.folderId ?? null, pinned: !!e.meta?.pinned, date: e.meta && 'date' in e.meta ? (e.meta.date ?? null) : null, colorId: e.meta?.colorId ?? null };
    const n = await db.getNote(id);
    return n ? { folderId: n.folderId ?? null, pinned: !!n.pinned, date: noteDateOf(n), colorId: n.colorId ?? null } : null;
  }

  const failedIds = () => [...E.entries()].filter(([, e]) => e.failed && dirty(e)).map(([i]) => i);
  return { subscribe: (f) => { subs.add(f); return () => subs.delete(f); }, newNote, flushNote, flushAll, setText, loadNote, discardIfEmpty, recoverNoteDrafts, trash, restore, listTrash, failedIds, setMeta, getMeta,
    get: (i) => E.get(i) || null, dirty: (i) => !!E.get(i) && dirty(E.get(i)), anyDirty: () => [...E.values()].some(dirty),
    reset: () => { E.forEach((e) => clearTimeout(e.timer)); E.clear(); } };
}

// 旧メモの下書き（duo.memo.draft.v1:<Day>）を、DB より新しいものだけノートへ取り込む。commit 後にだけ旧キーを消す。
// 読めない下書きは触らない。DB が失敗したら旧キーを全部残す（例外は呼び側へ）。
export const LEGACY_DRAFT_PREFIX = 'duo.memo.draft.v1:';
export async function importLegacyMemoDrafts({ db = realDb, storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  const keys = [];
  try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(LEGACY_DRAFT_PREFIX)) keys.push(k); } } catch { return []; }
  const drafts = [], ok = [];
  for (const k of keys) {
    let d = null;
    try { d = JSON.parse(storage.getItem(k)); } catch { d = null; }
    const date = k.slice(LEGACY_DRAFT_PREFIX.length);
    if (!d || typeof d.text !== 'string' || d.date !== date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    drafts.push({ date, text: d.text, at: Number.isFinite(d.at) ? d.at : 0 });
    ok.push(k);
  }
  if (!drafts.length) return [];
  const res = await db.importMemoDrafts(drafts, now());
  for (const k of ok) { try { storage.removeItem(k); } catch { /* 無視 */ } }
  return res;
}

// 本番用の単一ストア。
let hook = () => {};
export const setNoteHook = (f) => { hook = f; };
export const noteStore = createNoteStore({ onChange: (i) => hook(i) });
export const flushNote = (i) => noteStore.flushNote(i);
export const recoverNoteDrafts = () => noteStore.recoverNoteDrafts();

// ---------- フォルダの操作（作成・改名・並べ替え・削除）。名前は30字まで・100件まで・同名可。 ----------
export const FOLDER_NAME_MAX = realDb.FOLDER_NAME_MAX;
export const FOLDER_MAX = realDb.FOLDER_MAX;
export const folderErr = { empty: 'フォルダ名を入力してください。', long: `フォルダ名は${FOLDER_NAME_MAX}字までです。`, many: `フォルダは${FOLDER_MAX}個までです。`, fail: 'フォルダを保存できませんでした。' };
export function cleanFolderName(raw) {
  const name = String(raw ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!name) return { error: folderErr.empty };
  if (Array.from(name).length > FOLDER_NAME_MAX) return { error: folderErr.long };
  return { name };
}
export function createFolderOps({ db = realDb, now = () => Date.now(), uuid = newNoteId } = {}) {
  return {
    async create(raw) {
      const c = cleanFolderName(raw); if (c.error) return { error: c.error };
      try {
        const all = await db.listFolders();
        if (all.length >= FOLDER_MAX) return { error: folderErr.many };
        const order = all.reduce((m, f) => Math.max(m, (Number.isFinite(f.order) ? f.order : 0) + 1), 0), t = now();
        return { folder: await db.putFolder({ id: uuid(), name: c.name, order, createdAt: t, updatedAt: t }) };
      } catch { return { error: folderErr.fail }; }
    },
    async rename(id, raw) {
      const c = cleanFolderName(raw); if (c.error) return { error: c.error };
      try {
        const f = (await db.listFolders()).find((x) => x.id === id);
        if (!f) return { error: folderErr.fail };
        return { folder: await db.putFolder({ ...f, name: c.name, updatedAt: now() }) };
      } catch { return { error: folderErr.fail }; }
    },
    // dir: -1（前へ）/ 1（後ろへ）
    async move(id, dir) {
      try {
        const ids = (await db.listFolders()).map((f) => f.id), i = ids.indexOf(id), j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return { moved: false };
        [ids[i], ids[j]] = [ids[j], ids[i]];
        await db.reorderFolders(ids, now());
        return { moved: true };
      } catch { return { error: folderErr.fail }; }
    },
    // 中のノートは「フォルダなし」へ（同じトランザクション。本文・updatedAt は変えない）。戻り値は移した件数。
    async remove(id) { try { return { moved: await db.deleteFolder(id) }; } catch { return { error: folderErr.fail }; } },
  };
}
export const folderOps = createFolderOps();

// 一覧用の並べ: ピン留め（pinnedAt の新しい順 → updatedAt の新しい順）と、それ以外（updatedAt の新しい順）。
const byUpdated = (a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1);
export function groupNotes(rows) {
  const pinned = rows.filter((n) => n.pinned).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || byUpdated(a, b));
  const others = rows.filter((n) => !n.pinned).sort(byUpdated);
  return { pinned, others };
}
// sel: 'all' | 'none' | フォルダID。存在しないフォルダIDは「フォルダなし」と同じ扱い（本文は失わない）。
export function filterByFolder(rows, sel, folders) {
  if (sel === 'all') return rows;
  const ids = new Set(folders.map((f) => f.id));
  if (sel === 'none') return rows.filter((n) => !n.folderId || !ids.has(n.folderId));
  return rows.filter((n) => n.folderId === sel);
}
