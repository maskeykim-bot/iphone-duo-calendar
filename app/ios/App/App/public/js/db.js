// IndexedDB データ層。schema を変えるときは SCHEMA_VERSION を上げ、MIGRATIONS に追記する。
import { withDefaults, isKey } from './util.js';
import { validateTask, newTaskId } from './tasks.js';
import { noteFromMemo, ensureDailyFolder, titleOf, noteCharLimit, noteDateOf } from './notes-model.js';
import { CAT_IDS, DEFAULTS_NEW, LEGACY, UNCATEGORIZED, legacyToId, planCategoryRetarget, sortCategories } from './categories.js';

export const SCHEMA_VERSION = 6;
const BASE_NAME = 'duo-calendar';

// v2 の既定値（v1→v3 を1回で上がるとき、v2 と v3 のカーソルが並行して走るので、どちらでも補う）。
const v2Defaults = (e) => ({ ...e, notes: e.notes ?? '', recurrence: e.recurrence ?? null, exdates: e.exdates ?? [], overrides: e.overrides ?? {} });

const MIGRATIONS = {
  1(db) {
    const events = db.createObjectStore('events', { keyPath: 'id' });
    events.createIndex('start', 'start');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
  // v2: 繰り返し・メモ。既存の予定は一切消さず、versionchange トランザクション内で既定値を補う（ストアは再作成しない）。
  2(db, tx) {
    const store = tx.objectStore('events');
    store.openCursor().onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) return;
      cur.update(v2Defaults(cur.value));
      cur.continue();
    };
  },
  // v3: カテゴリを利用者が編集できるようにする。予定は一件も消さず、cat（旧キー）を categoryId に変換する。
  // 新規（oldVersion 0）は既定の5カテゴリ、既存利用者は今の固定4カテゴリを名前・色のまま作る。冪等（同じ id は上書きしない）。
  3(db, tx, oldVersion) {
    const cats = db.objectStoreNames.contains('categories') ? tx.objectStore('categories') : (() => {
      const s = db.createObjectStore('categories', { keyPath: 'id' });
      s.createIndex('order', 'order');
      return s;
    })();
    const now = Date.now();
    const seed = oldVersion === 0 ? DEFAULTS_NEW : Object.values(LEGACY);
    const putIfAbsent = (c, order) => {
      cats.get(c.id).onsuccess = (ev) => {
        if (!ev.target.result) cats.put({ id: c.id, name: c.name, color: c.color, order, hidden: false, createdAt: now, updatedAt: now });
      };
    };
    seed.forEach((c, i) => putIfAbsent(c, i));
    const events = tx.objectStore('events');
    let unknown = false;
    const conv = (o) => {
      const { cat, ...rest } = o;
      let id = rest.categoryId ?? legacyToId(cat);
      if (id == null) id = CAT_IDS.none;
      if (id === CAT_IDS.none) unknown = true;
      return { ...rest, categoryId: id };
    };
    events.openCursor().onsuccess = (ev) => {
      const cur = ev.target.result;
      if (!cur) {
        if (unknown) putIfAbsent(UNCATEGORIZED, seed.length);
        return;
      }
      const v = v2Defaults(conv(cur.value));
      if (v.overrides) v.overrides = Object.fromEntries(Object.entries(v.overrides).map(([k, o]) => [k, o && typeof o === 'object' ? conv(o) : o]));
      cur.update(v);
      cur.continue();
    };
  },
  // v4: 日付メモ。ストアを作るだけで、既存の events / categories / meta には触れない（冪等）。
  4(db) {
    if (!db.objectStoreNames.contains('memos')) {
      const s = db.createObjectStore('memos', { keyPath: 'id' });
      s.createIndex('date', 'date');
    }
  },
  // v5: タスク・ノート・フォルダ。ストアと索引を作り、同じ versionchange トランザクションで旧メモをノートへ複製する。
  // 失敗したら全体が巻き戻って v4 のまま（元データ・印なし）。memos へは書かない。
  5(db, tx) {
    createV5Stores(db, tx);
    MIGRATIONS[4](db); // memos / meta が無い異常な旧DBでも変換できるよう、足りないストアだけ作る（あれば何もしない）
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    migrateNotesInTx({ memos: tx.objectStore('memos'), notes: tx.objectStore('notes'), folders: tx.objectStore('folders'), meta: tx.objectStore('meta') }, Date.now());
  },
  // v6: リマインダー同期。tasks に remExternalId の索引を足すだけ。レコードは書き換えない・消さない。
  // 失敗したら versionchange が巻き戻って 5 のまま。
  6(db, tx) {
    if (!db.objectStoreNames.contains('tasks')) createV5Stores(db, tx);
    const s = tx.objectStore('tasks');
    if (!s.indexNames.contains('remExternalId')) s.createIndex('remExternalId', 'remExternalId');
  },
};

// 既にあるストアは触らず、無い索引だけ足す。tx は versionchange トランザクション。
export function createV5Stores(db, tx) {
  const ensure = (name, indexes) => {
    const s = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath: 'id' });
    for (const [n, kp] of indexes) if (!s.indexNames.contains(n)) s.createIndex(n, kp);
  };
  ensure('tasks', [['dueDate', 'due.date'], ['order', 'order'], ['updatedAt', 'updatedAt']]);
  ensure('notes', [['updatedAt', 'updatedAt'], ['folderId', 'folderId'], ['sourceDate', 'sourceDate'], ['pinnedAt', 'pinnedAt']]);
  ensure('folders', [['order', 'order']]);
}

let handle = null;
let dbName = BASE_NAME;

export function configure(ns) {
  dbName = ns ? `${BASE_NAME}-${ns}` : BASE_NAME;
  handle = null;
}

function open() {
  if (handle) return handle;
  handle = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, SCHEMA_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      for (let v = ev.oldVersion + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v](db, req.transaction, ev.oldVersion);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); handle = null; };
      resolve(req.result);
    };
    req.onerror = () => { handle = null; reject(req.error); };
    req.onblocked = () => { handle = null; reject(new Error('blocked')); };
  });
  return handle;
}

// stores: ストア名の配列。fn には { events, categories, ... }（名前→ObjectStore）と結果設定関数を渡す。
async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
    try {
      const r = fn(Object.fromEntries(stores.map((n) => [n, tx.objectStore(n)])), (v) => { result = v; });
      if (r !== undefined) result = r;
    } catch (e) {
      try { tx.abort(); } catch { /* 既に終了 */ }
      reject(e);
    }
  });
}
const EV = ['events'];
const OUTBOX = 'nativeOutbox';
const readOutbox = (meta, cb) => { meta.get(OUTBOX).onsuccess = (e) => cb(Array.isArray(e.target.result?.items) ? e.target.result.items : []); };
const BOTH = ['events', 'categories'];

const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export async function listEvents() {
  const db = await open();
  return (await wrap(db.transaction('events').objectStore('events').getAll())).map(withDefaults);
}
export const putEvent = (e) => run(EV, 'readwrite', ({ events }) => { events.put(e); });
export const putMany = (list) => run(EV, 'readwrite', ({ events }) => { list.forEach((e) => events.put(e)); });
export const deleteEvent = (id) => run(EV, 'readwrite', ({ events }) => { events.delete(id); });
export const clearEvents = () => run(EV, 'readwrite', ({ events }) => { events.clear(); });
// 単一トランザクションで put と delete をまとめて適用（途中失敗で全体ロールバック）。
export const applyChanges = ({ puts = [], dels = [] }) => run(EV, 'readwrite', ({ events }) => { puts.forEach((e) => events.put(e)); dels.forEach((id) => events.delete(id)); });
// 全置換: clear と put を1トランザクションで。失敗時は abort され元データが残る。
export const replaceAll = (list) => run(EV, 'readwrite', ({ events }) => { events.clear(); list.forEach((e) => events.put(e)); });

// ---------- カテゴリ ----------
// 空なら既定の5カテゴリを入れてから返す（全削除などの異常時の保険。通常は移行で作られている）。
export async function listCategories() {
  const db = await open();
  const list = await wrap(db.transaction('categories').objectStore('categories').getAll());
  if (list.length) return sortCategories(list);
  const now = Date.now();
  const seeded = DEFAULTS_NEW.map((c, i) => ({ ...c, order: i, hidden: false, createdAt: now, updatedAt: now }));
  await run(['categories'], 'readwrite', ({ categories }) => { seeded.forEach((c) => categories.put(c)); });
  return seeded;
}
export const putCategory = (c) => run(['categories'], 'readwrite', ({ categories }) => { categories.put(c); });
// カテゴリの追加・変更・削除と、予定の付け替えを1トランザクションで。失敗時は全体ロールバック。
export const applyCategoryChanges = ({ catPuts = [], catDels = [], eventPuts = [] }) => run(BOTH, 'readwrite', ({ events, categories }) => {
  catPuts.forEach((c) => categories.put(c));
  catDels.forEach((id) => categories.delete(id));
  eventPuts.forEach((e) => events.put(e));
});
// バックアップの読み込み: カテゴリと予定を1トランザクションで。replace のときは両方を clear してから put。
// outbox（任意）: 送信待ちの更新関数。同じトランザクションで meta に書き、新しい送信待ちを返す。
// taskPuts / taskReplace: タスクも同じトランザクション（検証済みの値だけ渡す）。
// notePuts/folderPuts（任意）: ノート・フォルダ。noteReplace/folderReplace のときは先に全部消す（未指定は現在を保持）。
// memoPuts（任意）: 書くメモ。memoReplace のときは先にメモを全部消す。予定・カテゴリ・メモ・送信待ちは同じトランザクション。
export const applyImport = ({ catPuts = [], eventPuts = [], replace = false, outbox = null, memoPuts = [], memoReplace = false, taskPuts = [], taskReplace = false, notePuts = [], noteReplace = false, folderPuts = [], folderReplace = false }) => run(['events', 'categories', 'meta', 'memos', 'tasks', 'notes', 'folders'], 'readwrite', ({ events, categories, meta, memos, tasks, notes, folders }, set) => {
  if (replace) { events.clear(); categories.clear(); }
  if (memoReplace) memos.clear();
  if (taskReplace) tasks.clear();
  if (noteReplace) notes.clear();
  if (folderReplace) folders.clear();
  folderPuts.forEach((f) => folders.put(validateFolder(f))); // 不正は例外 → tx 全体 rollback
  notePuts.forEach((n) => notes.put(validateNote(n))); // title は本文から作り直す
  taskPuts.forEach((t) => tasks.put(t));
  memoPuts.forEach((m) => memos.put(m));
  catPuts.forEach((c) => categories.put(c));
  eventPuts.forEach((e) => events.put(e));
  if (outbox) readOutbox(meta, (cur) => { const next = outbox(cur); meta.put({ key: OUTBOX, items: next }); set(next); });
});

// ---------- 日付メモ（memos ストア。1日1件、id = date。日付文字列はそのまま使い UTC 変換しない） ----------
// Memo = { id: 'YYYY-MM-DD', date: 'YYYY-MM-DD', text: string, createdAt: ms, updatedAt: ms, ink: null }
// 空白（全角含む）だけの本文はメモなし扱い（保存せず削除）。
export const isBlankMemo = (text) => typeof text !== 'string' || /^\s*$/.test(text);
export function makeMemo(date, text, now = Date.now(), prev = null) {
  if (!isKey(date)) throw new Error('invalid memo date');
  if (typeof text !== 'string') throw new Error('invalid memo text');
  return { id: date, date, text, createdAt: prev?.createdAt ?? now, updatedAt: now, ink: prev?.ink ?? null };
}
const MEMO = ['memos'];
export async function getMemo(date) {
  if (!isKey(date)) return null;
  const db = await open();
  return (await wrap(db.transaction('memos').objectStore('memos').get(date))) ?? null;
}
// 本文が空白だけなら削除。戻り値は保存したメモ（削除したときは null）。作成時刻は既存を引き継ぐ。
export const putMemo = (date, text, now = Date.now()) => run(MEMO, 'readwrite', ({ memos }, set) => {
  if (!isKey(date)) throw new Error('invalid memo date');
  if (isBlankMemo(text)) { memos.delete(date); set(null); return; }
  memos.get(date).onsuccess = (ev) => {
    const m = makeMemo(date, text, now, ev.target.result);
    memos.put(m);
    set(m);
  };
});
export const deleteMemo = (date) => run(MEMO, 'readwrite', ({ memos }) => {
  if (!isKey(date)) throw new Error('invalid memo date');
  memos.delete(date);
});
// from〜to（両端を含む）の範囲でメモがある日付を昇順で。date 索引の範囲キーを使う。
export async function memoDates(from, to) {
  if (!isKey(from) || !isKey(to) || from > to) return [];
  const db = await open();
  return wrap(db.transaction('memos').objectStore('memos').index('date').getAllKeys(IDBKeyRange.bound(from, to)));
}
// 全メモを日付の昇順で（バックアップ用）。
export async function listMemos() {
  const db = await open();
  return wrap(db.transaction('memos').objectStore('memos').index('date').getAll());
}
// 全メモを新しい日付順（prev カーソル）で。
export async function listMemoDays() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction('memos').objectStore('memos').index('date').openCursor(null, 'prev');
    req.onsuccess = () => { const c = req.result; if (!c) return resolve(out); out.push(c.value); c.continue(); };
    req.onerror = () => reject(req.error);
  });
}

// ---------- タスク（tasks ストア。Duo 内保存。型・検証は tasks.js） ----------
const TASK = ['tasks'];
const bad = (r) => { throw new Error(r.error); };
export async function listTasks() {
  const db = await open();
  return wrap(db.transaction('tasks').objectStore('tasks').index('order').getAll());
}
export async function getTask(id) {
  const db = await open();
  return (await wrap(db.transaction('tasks').objectStore('tasks').get(id))) ?? null;
}
// 検証してから put（不正なら何も書かず例外）。戻り値は保存したタスク。
export const putTask = (t) => run(TASK, 'readwrite', ({ tasks }, set) => {
  const r = validateTask(t);
  if (!r.ok) bad(r);
  tasks.put(r.task);
  set(r.task);
});
// 新規追加。order は同じトランザクションで現在の最大 + 1（単調増加）。同じ id が既にあれば上書きせずそれを返す（再試行で重複しない）。
export const addTask = (input, now = Date.now()) => run(TASK, 'readwrite', ({ tasks }, set) => {
  const base = { ...input, done: false, doneAt: null, createdAt: now, updatedAt: now, notify: input.notify ?? false, note: input.note ?? '', id: input.id ?? newTaskId(now) };
  const v = validateTask({ ...base, order: 0 });
  if (!v.ok) bad(v); // 不正は書く前に例外（何も書かない）
  const put = () => tasks.index('order').openCursor(null, 'prev').onsuccess = (ev) => {
    const t = validateTask({ ...base, order: ev.target.result ? ev.target.result.value.order + 1 : 1 }).task;
    tasks.put(t);
    set(t);
  };
  tasks.get(base.id).onsuccess = (ev) => { if (ev.target.result) set(ev.target.result); else put(); };
});
export const deleteTask = (id) => run(TASK, 'readwrite', ({ tasks }) => { tasks.delete(id); });

// ---------- iPhone への反映の送信待ち（meta ストア。バックアップには出さない） ----------
export async function getOutbox() {
  const db = await open();
  const r = await wrap(db.transaction('meta').objectStore('meta').get(OUTBOX));
  return Array.isArray(r?.items) ? r.items : [];
}
export const putOutbox = (items) => run(['meta'], 'readwrite', ({ meta }) => { meta.put({ key: OUTBOX, items }); });
// 予定の put/del と送信待ちの更新を同じトランザクションで。outbox は (現在の一覧) → 新しい一覧。新しい一覧を返す。
export const applyChangesWithOutbox = ({ puts = [], dels = [], outbox }) => run(['events', 'meta'], 'readwrite', ({ events, meta }, set) => {
  puts.forEach((e) => events.put(e));
  dels.forEach((id) => events.delete(id));
  readOutbox(meta, (cur) => { const next = outbox(cur); meta.put({ key: OUTBOX, items: next }); set(next); });
});
// 結果の反映（ack）: keys の予定をトランザクション内で読み直し、update(生の予定, key) が返した予定だけ書く（null なら触らない）。
// 本文は読み直した最新のものなので、古いスナップショットで新しい編集を上書きしない。送信待ちも同じトランザクションで更新。
// 戻り値 { events: 書いた予定（既定値付き）, list: 新しい送信待ち }
export const applyAck = ({ keys = [], update = () => null, outbox = (l) => l }) => run(['events', 'meta'], 'readwrite', ({ events, meta }, set) => {
  const out = { events: [], list: null };
  set(out);
  keys.forEach((k) => {
    events.get(k).onsuccess = (ev) => {
      const raw = ev.target.result;
      const nv = raw ? update(raw, k) : null;
      if (nv) { events.put(nv); out.events.push(withDefaults(nv)); }
    };
  });
  readOutbox(meta, (cur) => { out.list = outbox(cur); meta.put({ key: OUTBOX, items: out.list }); });
});

// 貼付の取消（第14版 PR32）: items=[{id, updatedAt}] をトランザクション内で読み直し、updatedAt が貼付時のままのものだけ消す。
// mk(raw) は linked の予定に積む送信待ち（なければ null）。outbox(現在, 新しい操作) → 新しい一覧。戻り値 { deleted:[id], kept:[id], list }
export const applyUndo = ({ items = [], mk = () => null, outbox = (c, ops) => [...c, ...ops] }) => run(['events', 'meta'], 'readwrite', ({ events, meta }, set) => {
  const out = { deleted: [], kept: [], list: null, ops: [] };
  set(out);
  let left = items.length;
  const fin = () => readOutbox(meta, (cur) => {
    out.list = out.ops.length ? outbox(cur, out.ops) : cur;
    if (out.ops.length) meta.put({ key: OUTBOX, items: out.list });
  });
  if (!left) { fin(); return; }
  items.forEach((it) => {
    events.get(it.id).onsuccess = (ev) => {
      const raw = ev.target.result;
      if (raw && raw.updatedAt === it.updatedAt) {
        events.delete(it.id); out.deleted.push(it.id);
        const op = mk(raw);
        if (op) out.ops.push(op);
      } else if (raw) out.kept.push(it.id);
      if (--left === 0) fin();
    };
  });
});
// 取消を取りやめて Duo の予定を戻す（iPhone 側が貼付後に変わっていたとき）。同じ id の予定が既にあれば何も書かない。送信待ちから opId を除く。
export const restoreUndone = ({ record, opId }) => run(['events', 'meta'], 'readwrite', ({ events, meta }, set) => {
  set({ restored: false, list: null });
  events.get(record.id).onsuccess = (ev) => {
    const had = !!ev.target.result;
    if (!had) events.put(record);
    readOutbox(meta, (cur) => { const next = cur.filter((o) => o.opId !== opId); meta.put({ key: OUTBOX, items: next }); set({ restored: !had, list: next, event: withDefaults(record) }); });
  };
});

// ---------- 一度だけのカテゴリ移行（meta の categoryRetargetV1。schema は上げない。バックアップには出さない） ----------
// categories / events / meta の1トランザクション。印があれば何もしない。途中失敗なら全体ロールバック（印も残らず次の起動で再実行）。
// 戻り値 { ran, marker:{at,moved,toast}, before:{categories,events,legacy} }（before は移行前の証拠。ran=false のときは null）。
const RETARGET = 'categoryRetargetV1';
export const migrateCategoriesOnce = (now = new Date()) => run(['categories', 'events', 'meta'], 'readwrite', ({ categories, events, meta }, set) => {
  meta.get(RETARGET).onsuccess = (ev) => {
    const done = ev.target.result;
    if (done) { set({ ran: false, marker: done.value, before: null }); return; }
    categories.getAll().onsuccess = (e1) => {
      const cats = e1.target.result;
      events.getAll().onsuccess = (e2) => {
        const evs = e2.target.result;
        const plan = planCategoryRetarget(cats, evs, now.getTime());
        plan.catPuts.forEach((c) => categories.put(c));
        plan.catDels.forEach((id) => categories.delete(id));
        plan.eventPuts.forEach((e) => events.put(e));
        const marker = { at: now.toISOString(), moved: plan.moved, toast: plan.moved > 0 ? 'pending' : 'skip' };
        meta.put({ key: RETARGET, value: marker });
        set({ ran: true, marker, before: { categories: cats.length, events: evs.length, legacy: plan.catDels.length } });
      };
    };
  };
});
// トーストを出し終えたら pending → done。別トランザクション。
export const markRetargetToastDone = () => run(['meta'], 'readwrite', ({ meta }, set) => {
  meta.get(RETARGET).onsuccess = (ev) => {
    const r = ev.target.result;
    if (r?.value?.toast !== 'pending') { set(false); return; }
    meta.put({ ...r, value: { ...r.value, toast: 'done' } });
    set(true);
  };
});

// ---------- 旧・既定通知の付与（meta の notifyBackfillV1）。第15版 PR12 から予定へは何も付与せず、印だけ残す ----------
// 既存の親・overrides の alarms は一切変えない。戻り値 { ran: このとき印を書いた, count: 0 }
const BACKFILL = 'notifyBackfillV1';
export const backfillNotifyOnce = (now = new Date()) => run(['meta'], 'readwrite', ({ meta }, set) => {
  set({ ran: false, count: 0 });
  meta.get(BACKFILL).onsuccess = (ev) => {
    if (ev.target.result) return;
    meta.put({ key: BACKFILL, value: new Date(now).toISOString() });
    set({ ran: true, count: 0 });
  };
});

// 既存端末の証拠（読み取りだけ・起動の最初に採る。この起動で作る印や種カテゴリは含めない）。
// events・memos が1件でもある、旧い meta の印（旧backfill・送信待ち等）がある、旧固定カテゴリ（ゴルフ・経済指標）が残る。
const NEW_META = new Set(['categoryRetargetV1', 'notesMigrationV1', 'lastNoteId']); // 新しい版が自分で書く印は「既存端末の証拠」に数えない
export const readLegacyEvidence = () => run(['events', 'memos', 'meta', 'categories'], 'readonly', ({ events, memos, meta, categories }, set) => {
  const out = { events: 0, memos: 0, meta: 0, legacyCats: 0 };
  set(out);
  events.count().onsuccess = (e) => { out.events = e.target.result; };
  memos.count().onsuccess = (e) => { out.memos = e.target.result; };
  meta.getAllKeys().onsuccess = (e) => { out.meta = e.target.result.filter((k) => !NEW_META.has(k)).length; };
  categories.getAllKeys().onsuccess = (e) => { const L = new Set([LEGACY.golf.id, LEGACY.economy.id]); out.legacyCats = e.target.result.filter((k) => L.has(k)).length; };
});

// ---------- ノート・フォルダ（notes / folders ストア。件数に上限は設けない） ----------
// Note = { id, body, title, folderId|null, pinned, pinnedAt|null, createdAt, updatedAt, deletedAt|null, date(YYYY-MM-DD|null), sourceDate?, sourceHeading?, sourceOriginalFirstLine?, ink? }
// Folder = { id, name(30字まで), order, createdAt, updatedAt }
export const FOLDER_MAX = 100;
export const FOLDER_NAME_MAX = 30;
export const TRASH_DAYS = 30;
const DAY_MS = 86400000;
const NOTE = ['notes'], FOLDER = ['folders'];

// 検証して正規化（title は本文から作り直す）。不正は例外。
export function validateNote(n) {
  if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id) throw new Error('invalid note id');
  if (typeof n.body !== 'string') throw new Error('invalid note body');
  if (Array.from(n.body).length > noteCharLimit(n)) throw new Error('note too long');
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const now = Date.now();
  return { ...n, date: noteDateOf(n), title: titleOf(n.body), folderId: typeof n.folderId === 'string' ? n.folderId : null, pinned: !!n.pinned,
    pinnedAt: n.pinned ? num(n.pinnedAt, now) : null, createdAt: num(n.createdAt, now), updatedAt: num(n.updatedAt, now), deletedAt: Number.isFinite(n.deletedAt) ? n.deletedAt : null };
}
export function validateFolder(f) {
  if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id) throw new Error('invalid folder id');
  const name = typeof f.name === 'string' ? f.name.trim() : '';
  if (!name || Array.from(name).length > FOLDER_NAME_MAX) throw new Error('invalid folder name');
  const now = Date.now();
  return { ...f, name, order: Number.isFinite(f.order) ? f.order : 0, createdAt: Number.isFinite(f.createdAt) ? f.createdAt : now, updatedAt: Number.isFinite(f.updatedAt) ? f.updatedAt : now };
}

export async function getNote(id) {
  const db = await open();
  return (await wrap(db.transaction('notes').objectStore('notes').get(id))) ?? null;
}
// 通常一覧：削除済みを除く。更新の新しい順。
export async function listNotes({ includeDeleted = false } = {}) {
  const db = await open();
  const all = await wrap(db.transaction('notes').objectStore('notes').index('updatedAt').getAll());
  return all.filter((n) => includeDeleted || n.deletedAt == null).reverse();
}
export async function listTrashedNotes(now = Date.now()) {
  const all = await listNotes({ includeDeleted: true });
  return all.filter((n) => n.deletedAt != null && now - n.deletedAt <= TRASH_DAYS * DAY_MS).sort((a, b) => b.deletedAt - a.deletedAt);
}
export const putNote = (n) => run(NOTE, 'readwrite', ({ notes }, set) => { const v = validateNote(n); notes.put(v); set(v); });
// 削除は deletedAt を付けるだけ（本文・updatedAt はそのまま）。
export const trashNote = (id, now = Date.now()) => run(NOTE, 'readwrite', ({ notes }, set) => {
  notes.get(id).onsuccess = (ev) => { const n = ev.target.result; if (!n) { set(null); return; } const t = { ...n, deletedAt: now }; notes.put(t); set(t); };
});
// 30日以内なら戻す。過ぎていれば null。
export const restoreNote = (id, now = Date.now()) => run(NOTE, 'readwrite', ({ notes }, set) => {
  notes.get(id).onsuccess = (ev) => {
    const n = ev.target.result;
    if (!n || n.deletedAt == null || now - n.deletedAt > TRASH_DAYS * DAY_MS) { set(null); return; }
    const t = { ...n, deletedAt: null }; notes.put(t); set(t);
  };
});
// 期限（30日）を過ぎた削除済みだけ完全に消す。戻り値は消した件数。
export const purgeTrashedNotes = (now = Date.now()) => run(NOTE, 'readwrite', ({ notes }, set) => {
  let n = 0;
  notes.openCursor().onsuccess = (ev) => {
    const c = ev.target.result;
    if (!c) { set(n); return; }
    if (c.value.deletedAt != null && now - c.value.deletedAt > TRASH_DAYS * DAY_MS) { c.delete(); n++; }
    c.continue();
  };
});

export async function listFolders() {
  const db = await open();
  return wrap(db.transaction('folders').objectStore('folders').index('order').getAll());
}
export const putFolder = (f) => run(FOLDER, 'readwrite', ({ folders }, set) => {
  const v = validateFolder(f);
  folders.count().onsuccess = (ev) => {
    folders.get(v.id).onsuccess = (e2) => {
      if (!e2.target.result && ev.target.result >= FOLDER_MAX) { folders.transaction.abort(); return; }
      folders.put(v); set(v);
    };
  };
});
// ノートの分類だけを1トランザクションで直す（folderId / pinned）。本文・updatedAt は変えない。無いノートは null。
export const patchNote = (id, patch) => run(NOTE, 'readwrite', ({ notes }, set) => {
  notes.get(id).onsuccess = (ev) => {
    const n = ev.target.result;
    if (!n) { set(null); return; }
    const t = { ...n };
    if ('folderId' in patch) t.folderId = typeof patch.folderId === 'string' ? patch.folderId : null;
    if ('date' in patch) t.date = noteDateOf({ date: patch.date });
    if ('pinned' in patch) { t.pinned = !!patch.pinned; t.pinnedAt = t.pinned ? (Number.isFinite(patch.pinnedAt) ? patch.pinnedAt : Date.now()) : null; }
    notes.put(t); set(t);
  };
});
// フォルダの並びを ids の順に振り直す（1トランザクション）。ids に無いフォルダは後ろへ。
export const reorderFolders = (ids, now = Date.now()) => run(FOLDER, 'readwrite', ({ folders }, set) => {
  folders.getAll().onsuccess = (ev) => {
    const all = ev.target.result, by = new Map(all.map((f) => [f.id, f]));
    const seq = [...ids.filter((i) => by.has(i)), ...all.filter((f) => !ids.includes(f.id)).sort((a, b) => a.order - b.order).map((f) => f.id)];
    seq.forEach((id, i) => { const f = by.get(id); if (f.order !== i) folders.put({ ...f, order: i, updatedAt: now }); });
    set(seq);
  };
});
// 同じトランザクションで、中のノートを folderId=null にしてからフォルダを消す（本文・updatedAt は変えない）。戻り値は移したノート数。
export const deleteFolder = (id) => run(['folders', 'notes'], 'readwrite', ({ folders, notes }, set) => {
  let moved = 0;
  notes.index('folderId').openCursor(IDBKeyRange.only(id)).onsuccess = (ev) => {
    const c = ev.target.result;
    if (c) { c.update({ ...c.value, folderId: null }); moved++; c.continue(); return; }
    folders.delete(id);
    set(moved);
  };
});

// ---------- 旧メモ → ノートの移行（v4→v5 は MIGRATIONS[5]、途中版で既に v5 の端末は起動時に migrateNotesOnce） ----------
export const NOTES_MIGRATION = 'notesMigrationV1';
// 1つの readwrite（または versionchange）トランザクション内で実行。外部の非同期は待たず、memos へは書かない。
// stores = { memos, notes, folders, meta }。完了で done(marker)。途中の例外は tx を abort（印も残らない）。
// opts.beforeCopy(n) は試験用の差込み（n 件目のコピー直前。例外を投げると全体が巻き戻る）。
export function migrateNotesInTx({ memos, notes, folders, meta }, now = Date.now(), done = () => {}, opts = {}) {
  const c = { seen: 0, copied: 0, existed: 0, blank: 0, folderCreated: false };
  const tx = notes.transaction;
  const fail = (e) => { try { tx.abort(); } catch { /* 既に終了 */ } };
  let folderReady = false;
  const finish = () => {
    const marker = { seen: c.seen, copied: c.copied, existed: c.existed, blank: c.blank, folderCreated: c.folderCreated, at: new Date(now).toISOString() };
    meta.put({ key: NOTES_MIGRATION, value: marker });
    done(marker);
  };
  const copy = (m, next) => {
    const put = () => {
      try { opts.beforeCopy?.(c.copied + 1); notes.put(noteFromMemo(m)); } catch (e) { fail(e); return; }
      c.copied++; next();
    };
    if (folderReady) { put(); return; }
    folders.getAll().onsuccess = (ev) => {
      try {
        const r = ensureDailyFolder(ev.target.result, now);
        if (r.created) { folders.put(r.folder); c.folderCreated = true; }
      } catch (e) { fail(e); return; }
      folderReady = true; put();
    };
  };
  const req = memos.openCursor();
  req.onerror = () => fail(req.error);
  req.onsuccess = (ev) => {
    const cur = ev.target.result;
    if (!cur) { finish(); return; }
    const m = cur.value;
    c.seen++;
    const next = () => cur.continue();
    if (isBlankMemo(m.text)) { c.blank++; next(); return; }
    const g = notes.get(`memo-${m.date}`);
    g.onsuccess = () => { if (g.result) { c.existed++; next(); } else copy(m, next); };
    g.onerror = () => fail(g.error);
  };
}
export const migrateNotesOnce = (now = Date.now(), opts = {}) => run(['memos', 'notes', 'folders', 'meta'], 'readwrite', (st, set) => {
  migrateNotesInTx(st, now, set, opts);
});
export const readNotesMigration = () => run(['meta'], 'readonly', ({ meta }, set) => { meta.get(NOTES_MIGRATION).onsuccess = (e) => set(e.target.result?.value ?? null); });
// 起動時の共通移行: 印が無ければ1 readwrite トランザクションで変換する。あれば何もしない。失敗は例外（元データ・印なしのまま）。
export async function ensureNotesMigrated(now = Date.now()) {
  if (await readNotesMigration()) return null;
  return migrateNotesOnce(now);
}

// ---------- 旧メモの下書き（duo.memo.draft.v1:<Day>）をノートへ取り込む ----------
// drafts: [{ date, text, at }]。DB の旧メモより新しいものだけ取り込む（同じトランザクション。memos へは書かない）。
// 未編集で移行しただけのノートなら本文を更新、編集済み（または削除済み）なら `memo-<Day>-draft` へ別保存（内容違いは決定的な接尾辞）。
// 戻り値: [{ date, result: 'stale'|'blank'|'created'|'updated'|'separate'|'same' }]。呼ぶ側は commit 後にだけ旧キーを消す。
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export const importMemoDrafts = (drafts, now = Date.now()) => run(['memos', 'notes', 'folders'], 'readwrite', ({ memos, notes, folders }, set) => {
  const out = []; let folder = null;
  const withFolder = (cb) => {
    if (folder) { cb(folder); return; }
    folders.getAll().onsuccess = (ev) => { const r = ensureDailyFolder(ev.target.result, now); if (r.created) folders.put(r.folder); folder = r.folder; cb(folder); };
  };
  const step = (i) => {
    if (i >= drafts.length) { set(out); return; }
    const d = drafts[i], done = (result) => { out.push({ date: d.date, result }); step(i + 1); };
    memos.get(d.date).onsuccess = (e1) => {
      const m = e1.target.result;
      if (m && m.updatedAt >= d.at) { done('stale'); return; }
      if (isBlankMemo(d.text)) { done('blank'); return; }
      const conv = (suffix) => noteFromMemo({ date: d.date, text: d.text, createdAt: m?.createdAt ?? d.at, updatedAt: d.at, ink: m?.ink ?? null }, suffix);
      notes.get(`memo-${d.date}`).onsuccess = (e2) => {
        const n = e2.target.result;
        if (!n) { withFolder((f) => { notes.put(validateNote({ ...conv(''), folderId: f.id })); done('created'); }); return; }
        const untouched = m && !n.deletedAt && n.updatedAt <= m.updatedAt && n.body === noteFromMemo(m).body;
        if (untouched) {
          const c = conv(''), { sourceOriginalFirstLine: _o, sourceHeading: _h, ...keep } = n; void _o; void _h;
          notes.put(validateNote({ ...keep, body: c.body, sourceHeading: c.sourceHeading, ...(c.sourceOriginalFirstLine !== undefined ? { sourceOriginalFirstLine: c.sourceOriginalFirstLine } : {}), updatedAt: d.at }));
          done('updated'); return;
        }
        const tryId = (suffix, k) => {
          const c = conv(suffix);
          notes.get(c.id).onsuccess = (e3) => {
            const hit = e3.target.result;
            if (!hit) { withFolder((f) => { notes.put(validateNote({ ...c, folderId: f.id })); done('separate'); }); return; }
            if (hit.body === c.body) { done('same'); return; }
            tryId(`-draft-${fnv(d.text)}${k ? `-${k}` : ''}`, k + 1);
          };
        };
        tryId('-draft', 0);
      };
    };
  };
  step(0);
});
// 最後に開いたノート（meta）。
export const getLastNote = () => run(['meta'], 'readonly', ({ meta }, set) => { meta.get('lastNoteId').onsuccess = (e) => set(e.target.result?.value ?? null); });
export const setLastNote = (id) => run(['meta'], 'readwrite', ({ meta }) => { if (id) meta.put({ key: 'lastNoteId', value: id }); else meta.delete('lastNoteId'); });
