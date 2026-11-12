// IndexedDB データ層。schema を変えるときは SCHEMA_VERSION を上げ、MIGRATIONS に追記する。
export const SCHEMA_VERSION = 1;
const BASE_NAME = 'duo-calendar';

const MIGRATIONS = {
  1(db) {
    const events = db.createObjectStore('events', { keyPath: 'id' });
    events.createIndex('start', 'start');
    db.createObjectStore('meta', { keyPath: 'key' });
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
    result = fn(tx.objectStore('events'), (v) => { result = v; });
  });
}

const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export async function listEvents() {
  const db = await open();
  return wrap(db.transaction('events').objectStore('events').getAll());
}
export const putEvent = (e) => run('readwrite', (s) => { s.put(e); });
export const putMany = (list) => run('readwrite', (s) => { list.forEach((e) => s.put(e)); });
export const deleteEvent = (id) => run('readwrite', (s) => { s.delete(id); });
export const clearEvents = () => run('readwrite', (s) => { s.clear(); });
