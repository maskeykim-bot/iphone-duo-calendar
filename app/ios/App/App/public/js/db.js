// IndexedDB データ層。schema を変えるときは SCHEMA_VERSION を上げ、MIGRATIONS に追記する。
import { withDefaults } from './util.js';
import { CAT_IDS, DEFAULTS_NEW, LEGACY, UNCATEGORIZED, legacyToId, sortCategories } from './categories.js';

export const SCHEMA_VERSION = 3;
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
};

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
      result = fn(Object.fromEntries(stores.map((n) => [n, tx.objectStore(n)])), (v) => { result = v; });
    } catch (e) {
      try { tx.abort(); } catch { /* 既に終了 */ }
      reject(e);
    }
  });
}
const EV = ['events'];
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
export const applyImport = ({ catPuts = [], eventPuts = [], replace = false }) => run(BOTH, 'readwrite', ({ events, categories }) => {
  if (replace) { events.clear(); categories.clear(); }
  catPuts.forEach((c) => categories.put(c));
  eventPuts.forEach((e) => events.put(e));
});
