// 旧 v4 の最小固定fixture。IndexedDB v4（events/meta/categories/memos）を作る関数と、v4時点のバックアップ検証（version 4 までだけ読む）。
export function createV4Db(name, memos) {
  return new Promise((res, rej) => {
    const q = indexedDB.open(name, 4);
    q.onupgradeneeded = () => {
      const d = q.result;
      d.createObjectStore('events', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'key' }); d.createObjectStore('categories', { keyPath: 'id' });
      const s = d.createObjectStore('memos', { keyPath: 'id' }); s.createIndex('date', 'date');
      for (const m of memos) s.put(m);
    };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export const readAll = (db, store) => new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
// v4 時代の validateBackup の入口（版の確認だけ）。v5 のファイルは丸ごと断る。
export function validateBackupV4(text) {
  let o; try { o = JSON.parse(text); } catch { return { ok: false }; }
  if (!o || o.app !== 'duo-calendar') return { ok: false };
  if (![1, 2, 3, 4].includes(o.version)) return { ok: false, reason: `未対応のバージョンです（version: ${o.version}）` };
  return { ok: true, memos: Array.isArray(o.memos) ? o.memos : [] };
}
