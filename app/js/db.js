// IndexedDB データ層。schema を変えるときは SCHEMA_VERSION を上げ、MIGRATIONS に追記する。
import { withDefaults, isKey } from './util.js';
import { planNotifyBackfill } from './notify.js';
import { CAT_IDS, DEFAULTS_NEW, LEGACY, UNCATEGORIZED, legacyToId, sortCategories } from './categories.js';

export const SCHEMA_VERSION = 4;
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
export const applyImport = ({ catPuts = [], eventPuts = [], replace = false, outbox = null }) => run(['events', 'categories', 'meta'], 'readwrite', ({ events, categories, meta }, set) => {
  if (replace) { events.clear(); categories.clear(); }
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
  return { id: date, date, text, createdAt: prev?.createdAt ?? now, updatedAt: now, ink: null };
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

// ---------- 一度だけの既定通知の付与（meta の notifyBackfillV1。バックアップには出さず、読み込みからは呼ばない） ----------
// events と meta の1トランザクションで、マーカー確認 → 対象の更新 → マーカー書込み。途中で失敗すれば全体ロールバック（次の起動で再実行）。
// 戻り値 { ran: このときに実行した, count: 付けた件数 }
const BACKFILL = 'notifyBackfillV1';
export const backfillNotifyOnce = (now = new Date()) => run(['events', 'meta'], 'readwrite', ({ events, meta }, set) => {
  set({ ran: false, count: 0 });
  meta.get(BACKFILL).onsuccess = (ev) => {
    if (ev.target.result) return;
    events.getAll().onsuccess = (e2) => {
      const puts = planNotifyBackfill(e2.target.result.map(withDefaults), now).map((x) => ({ ...x }));
      puts.forEach((x) => events.put(x));
      meta.put({ key: BACKFILL, value: new Date(now).toISOString() });
      set({ ran: true, count: puts.length });
    };
  };
});
