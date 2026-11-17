import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore as FDBObjectStore } from 'fake-indexeddb';

let n = 0;
async function fresh() { globalThis.indexedDB = new IDBFactory(); const m = await import(`../js/db.js?t${n++}`); m.configure(`t${n}`); return m; }
const raw = (name, ver, upgrade) => new Promise((res, rej) => { const r = indexedDB.open(name, ver); r.onupgradeneeded = (e) => upgrade(r.result, r.transaction, e.oldVersion); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = () => rej(r.error); });
const dump = (name, store) => new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => { const g = r.result.transaction(store).objectStore(store).getAll(); g.onsuccess = () => { r.result.close(); res(g.result); }; }; });
const info = (name) => new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => { const db = r.result; const o = { version: db.version, stores: [...db.objectStoreNames].sort(), idx: {} }; for (const s of o.stores) o.idx[s] = [...db.transaction(s).objectStore(s).indexNames].sort(); db.close(); res(o); }; });

test('新規は v5。tasks/notes/folders が索引つきで空', async () => {
  const m = await fresh(); await m.listEvents();
  const i = await info(`duo-calendar-t${n}`);
  assert.equal(i.version, 5);
  assert.deepEqual(i.stores, ['categories', 'events', 'folders', 'memos', 'meta', 'notes', 'tasks']);
  assert.deepEqual(i.idx.tasks, ['dueDate', 'order', 'updatedAt']);
  assert.deepEqual(i.idx.notes, ['folderId', 'pinnedAt', 'sourceDate', 'updatedAt']);
  assert.deepEqual(i.idx.folders, ['order']);
  assert.deepEqual(await m.listTasks(), []);
});

test('v4 から v5: 既存データは一致のまま', async () => {
  globalThis.indexedDB = new IDBFactory();
  const name = 'duo-calendar-mg';
  const ev = { id: 'e1', title: '旧', categoryId: 'c', all: false, start: '2026-11-17T10:00', end: '2026-11-17T11:00', notes: '', recurrence: null, exdates: [], overrides: {} };
  await raw(name, 4, (db) => {
    const e = db.createObjectStore('events', { keyPath: 'id' }); e.createIndex('start', 'start'); e.put(ev);
    db.createObjectStore('meta', { keyPath: 'key' }).put({ key: 'nativeOutbox', items: [{ k: 1 }] });
    const c = db.createObjectStore('categories', { keyPath: 'id' }); c.createIndex('order', 'order'); c.put({ id: 'x', name: 'x', color: '#000', order: 0 });
    const mm = db.createObjectStore('memos', { keyPath: 'id' }); mm.createIndex('date', 'date'); mm.put({ id: '2026-11-01', date: '2026-11-01', text: 'm' });
  });
  const m = await import('../js/db.js?mg'); m.configure('mg');
  assert.deepEqual((await m.listEvents()).map((e) => e.id), ['e1']);
  assert.deepEqual(await m.getOutbox(), [{ k: 1 }]);
  assert.equal((await m.getMemo('2026-11-01')).text, 'm');
  assert.deepEqual((await dump(name, 'categories')).map((c) => c.id), ['x']);
  assert.equal((await info(name)).version, 5);
});

test('v1 から v5 まで順に上がる（予定は消えない）', async () => {
  globalThis.indexedDB = new IDBFactory();
  await raw('duo-calendar-v1', 1, (db) => { const e = db.createObjectStore('events', { keyPath: 'id' }); e.createIndex('start', 'start'); e.put({ id: 'o', title: '旧予定', cat: 'work', start: '2026-11-01T10:00', end: '2026-11-01T11:00', all: false }); db.createObjectStore('meta', { keyPath: 'key' }); });
  const m = await import('../js/db.js?v1'); m.configure('v1');
  assert.deepEqual((await m.listEvents()).map((e) => e.title), ['旧予定']);
  assert.equal((await info('duo-calendar-v1')).version, 5);
});

test('CRUD と再読込、order は単調増加', async () => {
  const m = await fresh();
  const a = await m.addTask({ id: 'a', title: '一' }, 10);
  const b = await m.addTask({ id: 'b', title: '二', due: { date: '2026-11-18', time: '10:07' }, notify: true }, 11);
  assert.deepEqual([a.order, b.order], [1, 2]);
  assert.equal(a.done, false); assert.equal(a.notify, false);
  await m.deleteTask('b');
  const c = await m.addTask({ id: 'c', title: '三' }, 12);
  assert.equal(c.order, 2); // 最大+1（削除しても単調に進む保証は「現存の最大+1」）
  await m.putTask({ ...a, done: true, doneAt: '2026-11-17T09:00', updatedAt: 20 });
  const list = await m.listTasks();
  assert.deepEqual(list.map((t) => [t.id, t.done]), [['a', true], ['c', false]]);
  assert.equal((await m.getTask('a')).doneAt, '2026-11-17T09:00');
  assert.equal(await m.getTask('zz'), null);
});

test('同じ id の再試行は重複せず既存を返す', async () => {
  const m = await fresh();
  await m.addTask({ id: 'r', title: '一' }, 1);
  const again = await m.addTask({ id: 'r', title: '別' }, 2);
  assert.equal(again.title, '一');
  assert.equal((await m.listTasks()).length, 1);
});

test('不正は書かず例外、予定等は不変', async () => {
  const m = await fresh();
  await m.putEvent({ id: 'e', title: 'x', categoryId: 'c', all: true, start: '2026-11-17', end: '2026-11-17' });
  await assert.rejects(m.addTask({ title: '' }));
  await assert.rejects(m.addTask({ title: 'a', due: { date: 'bad' } }));
  await assert.rejects(m.putTask({ id: 'q', title: 'x' }));
  assert.deepEqual(await m.listTasks(), []);
  assert.equal((await m.listEvents()).length, 1);
});

test('v5 移行が abort されたら v4 のまま旧データが残る', async () => {
  globalThis.indexedDB = new IDBFactory();
  const name = 'duo-calendar-ab';
  await raw(name, 4, (db) => { db.createObjectStore('events', { keyPath: 'id' }).put({ id: 'e1' }); });
  await new Promise((res) => { const r = indexedDB.open(name, 5); r.onupgradeneeded = () => { r.transaction.abort(); }; r.onerror = () => res(); r.onsuccess = () => res(); });
  assert.equal((await info(name)).version, 4);
  assert.deepEqual((await dump(name, 'events')).map((e) => e.id), ['e1']);
});

test('blocked は reject し、次の open で再試行できる', async () => {
  globalThis.indexedDB = new IDBFactory();
  const name = 'duo-calendar-bl';
  const old = await new Promise((res) => { const r = indexedDB.open(name, 4); r.onupgradeneeded = () => { r.result.createObjectStore('events', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); });
  old.onversionchange = null; // 閉じない古い接続
  const m = await import('../js/db.js?bl'); m.configure('bl');
  await assert.rejects(m.listTasks(), /blocked/);
  old.close();
  assert.deepEqual(await m.listTasks(), []);
});

test('容量失敗（QuotaExceededError）で put が失敗しても既存は残る', async () => {
  const m = await fresh();
  await m.addTask({ id: 'k', title: '残る' }, 1);
  const orig = FDBObjectStore.prototype.put;
  FDBObjectStore.prototype.put = function () { throw new DOMException('full', 'QuotaExceededError'); };
  try { await assert.rejects(m.addTask({ id: 'n', title: '入らない' }, 2)); } finally { FDBObjectStore.prototype.put = orig; }
  assert.deepEqual((await m.listTasks()).map((t) => t.id), ['k']);
});

const TK = (id, o = {}) => ({ id, title: id, due: null, done: false, doneAt: null, createdAt: 1, updatedAt: 2, order: 1, note: '', notify: false, ...o });
const EV = (id) => ({ id, title: id, categoryId: 'c', all: false, start: '2026-11-17T10:00', end: '2026-11-17T11:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} });

test('applyImport: 追加・置換（空配列で空）・未指定は保持', async () => {
  const m = await fresh();
  await m.addTask({ id: 'old', title: '既存' }, 1);
  await m.applyImport({ eventPuts: [EV('e1')], taskPuts: [TK('n1')] });
  assert.deepEqual((await m.listTasks()).map((t) => t.id).sort(), ['n1', 'old']);
  await m.applyImport({ eventPuts: [EV('e2')], replace: true }); // tasks 未指定は現在を保持
  assert.equal((await m.listTasks()).length, 2);
  await m.applyImport({ eventPuts: [EV('e3')], replace: true, taskReplace: true, taskPuts: [TK('r1')] });
  assert.deepEqual((await m.listTasks()).map((t) => t.id), ['r1']);
  await m.applyImport({ replace: true, taskReplace: true, taskPuts: [] });
  assert.deepEqual(await m.listTasks(), []);
});

test('applyImport: 容量失敗で予定・タスクとも全体 rollback', async () => {
  const m = await fresh();
  await m.addTask({ id: 'keep', title: '残る' }, 1);
  await m.applyImport({ eventPuts: [EV('ev0')] });
  const orig = FDBObjectStore.prototype.put;
  FDBObjectStore.prototype.put = function (v) { if (v?.id === 'bad') throw new DOMException('full', 'QuotaExceededError'); return orig.apply(this, arguments); };
  try { await assert.rejects(m.applyImport({ replace: true, eventPuts: [EV('ev1')], taskReplace: true, taskPuts: [TK('x'), TK('bad')] })); } finally { FDBObjectStore.prototype.put = orig; }
  assert.deepEqual((await m.listTasks()).map((t) => t.id), ['keep']);
  assert.deepEqual((await m.listEvents()).map((e) => e.id), ['ev0']);
});
