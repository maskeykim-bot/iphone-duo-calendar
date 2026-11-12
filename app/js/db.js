// IndexedDB データ層。schema を変えるときは SCHEMA_VERSION を上げ、MIGRATIONS に追記する。
import { withDefaults } from './util.js';

export const SCHEMA_VERSION = 2;
const BASE_NAME = 'duo-calendar';

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
      cur.update(withDefaults(cur.value));
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
      for (let v = ev.oldVersion + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v](db, req.transaction);
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

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('events', mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
    try {
      result = fn(tx.objectStore('events'), (v) => { result = v; });
    } catch (e) {
      try { tx.abort(); } catch { /* 既に終了 */ }
      reject(e);
    }
  });
}

const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export async function listEvents() {
  const db = await open();
  return (await wrap(db.transaction('events').objectStore('events').getAll())).map(withDefaults);
}
export const putEvent = (e) => run('readwrite', (s) => { s.put(e); });
export const putMany = (list) => run('readwrite', (s) => { list.forEach((e) => s.put(e)); });
export const deleteEvent = (id) => run('readwrite', (s) => { s.delete(id); });
export const clearEvents = () => run('readwrite', (s) => { s.clear(); });
// 単一トランザクションで put と delete をまとめて適用（途中失敗で全体ロールバック）。
export const applyChanges = ({ puts = [], dels = [] }) => run('readwrite', (s) => { puts.forEach((e) => s.put(e)); dels.forEach((id) => s.delete(id)); });
// 全置換: clear と put を1トランザクションで。失敗時は abort され元データが残る。
export const replaceAll = (list) => run('readwrite', (s) => { s.clear(); list.forEach((e) => s.put(e)); });
