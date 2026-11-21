// 第16版 PR17: タスクは Duo 内保存（IndexedDB tasks）。偽装 native は「旧リマインダー集合を残したまま、呼出が0」を見るための見張り。
import { expect } from '@playwright/test';
import { openApp, reloadKeep } from './helpers.js';

export const T = (id, o = {}) => ({ id, title: `T${id}`, due: { date: '2026-11-12' }, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false, ...o });
const LEGACY = /Reminder/;
// native を偽装（iOS）。旧リマインダー系 API は集合を持たせたまま、呼ばれたら calls に残す（0 を検査）。権限は与えない。
export async function spy(page, { reminders = true } = {}) {
  await page.addInitScript((withRem) => {
    const M = window.__m = { calls: [], cbs: {} };
    const legacy = { itemId: 'legacy1', externalId: 'e', listId: 'L1', title: '旧リマインダー', notes: '', due: { date: '2026-11-12' }, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 5, readOnly: false };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, JSON.parse(JSON.stringify(o ?? {}))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'A', color: '#336699', allowsModify: true, isDefault: true }] };
        if (m === 'listReminders') return { reminders: withRem ? [legacy] : [] };
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, reminders);
}
export const reminderCalls = (page) => page.evaluate((s) => window.__m.calls.filter((c) => new RegExp(s).test(c[0])).map((c) => c[0]), LEGACY.source);

const withDb = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const dbs = await indexedDB.databases();
  const name = dbs.map((d) => d.name).find((n) => n.startsWith('duo-calendar'));
  const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  try { return await (new Function('db', 'a', `return (async()=>{${src}})()`))(db, a); } finally { db.close(); }
}, [fn, arg]);
// 保存済みのタスク（order 順）。
export const dbTasks = (page) => withDb(page, `return await new Promise((res) => { const q = db.transaction('tasks').objectStore('tasks').index('order').getAll(); q.onsuccess = () => res(q.result); });`);
// 保存してから再読込（時刻の固定は openApp と同じ）。
export async function seedTasks(page, list) {
  await withDb(page, `await new Promise((res, rej) => { const tx = db.transaction('tasks', 'readwrite'); a.forEach((t) => tx.objectStore('tasks').put(t)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });`, list);
  await reloadKeep(page);
}
// タスクへの書込みを失敗させる／戻す。
export const failPuts = (page, on) => page.evaluate((f) => {
  const P = IDBObjectStore.prototype;
  if (!P.__put) { P.__put = P.put; P.put = function (...a) { if (window.__failTask && this.name === 'tasks') throw new DOMException('fail', 'AbortError'); return P.__put.apply(this, a); }; }
  window.__failTask = f;
}, on);
// tasks への書込みを release まで待たせる（別接続で書込み transaction を握る）。
export const holdTasks = (page) => page.evaluate(async () => {
  const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n.startsWith('duo-calendar'));
  const db = await new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); });
  window.__hold = true;
  const tx = db.transaction('tasks', 'readwrite'), s = tx.objectStore('tasks');
  const ping = () => { if (window.__hold) s.get('__none').onsuccess = ping; };
  ping();
  window.__release = () => { window.__hold = false; setTimeout(() => db.close(), 50); };
});
export const releaseTasks = (page) => page.evaluate(() => window.__release());

// 起動してタスクページ（左）を開く。
export async function openTasks(page, size, { seed = null, query = '' } = {}) {
  await openApp(page, size, query);
  if (seed) await seedTasks(page, seed);
  await page.locator('.pgl [data-pick="task"]').first().click();
  await expect(page.locator('.page.lp input.remin')).toBeVisible();
}
