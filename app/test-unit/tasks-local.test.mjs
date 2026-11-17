// 第16版 PR17: タスクの Duo 内保存アダプタ（native 呼出 0・同一要求の再試行・失敗の理由）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createTaskStore, createLocalCall, createLocalAddController, rowOf } from '../js/tasks.js';

let n = 0;
async function fresh() { globalThis.indexedDB = new IDBFactory(); const m = await import(`../js/db.js?l${n++}`); m.configure(`l${n}`); return m; }

test('追加: 日英3件が未完了・通知なしで入り、order が増える', async () => {
  const db = await fresh(), add = createLocalAddController(createTaskStore(db));
  for (const t of ['牛乳', 'Buy milk', '日本語 and English']) assert.equal((await add.submit({ title: t, due: '2026-11-12' })).ok, true);
  const l = await db.listTasks();
  assert.deepEqual(l.map((x) => x.title), ['牛乳', 'Buy milk', '日本語 and English']);
  assert.ok(l.every((x) => !x.done && !x.notify && x.due.date === '2026-11-12'));
  assert.deepEqual(l.map((x) => x.order), [1, 2, 3]);
});

test('失敗の再試行は同じ id で重複しない。内容が変われば別 id', async () => {
  const real = await fresh(); let fails = 1; const ids = [];
  const store = createTaskStore({ ...real, addTask: async (i) => { ids.push(i.id); if (fails-- > 0) { const e = new Error('x'); e.name = 'AbortError'; throw e; } return real.addTask(i); } });
  const add = createLocalAddController(store);
  const r1 = await add.submit({ title: 'A' }); assert.deepEqual([r1.ok, r1.code], [false, 'STORE_FAILED']);
  assert.equal((await add.submit({ title: 'A' })).ok, true);
  assert.equal(ids[0], ids[1]);
  assert.equal((await real.listTasks()).length, 1);
  await add.submit({ title: 'B' }); assert.notEqual(ids[2], ids[0]);
});

test('容量不足は STORAGE_FULL、空は保存しない、連打は排他', async () => {
  const real = await fresh();
  const full = createLocalAddController(createTaskStore({ ...real, addTask: async () => { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; } }));
  assert.equal((await full.submit({ title: 'A' })).code, 'STORAGE_FULL');
  const add = createLocalAddController(createTaskStore(real));
  assert.equal((await add.submit({ title: '  ' })).empty, true);
  const [a, b] = await Promise.all([add.submit({ title: 'X' }), add.submit({ title: 'X' })]);
  assert.deepEqual([a.ok, b.busy], [true, true]);
  assert.equal((await real.listTasks()).length, 1);
});

test('localCall: 完了・戻し・編集・削除（未指定の項目は保持）', async () => {
  const db = await fresh(), store = createTaskStore(db), call = createLocalCall(store), add = createLocalAddController(store);
  const { task } = await add.submit({ title: 'T', due: '2026-11-12', time: '10:07', notify: true });
  assert.equal(task.notify, true);
  const d = await call('setReminderDone', { itemId: task.id, done: true });
  assert.equal(d.reminder.done, true); assert.match(d.reminder.doneAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.equal((await call('setReminderDone', { itemId: task.id, done: false })).reminder.doneAt, null);
  const u = await call('updateReminder', { itemId: task.id, patch: { title: 'T2' } });
  assert.deepEqual([u.reminder.title, u.reminder.due, u.reminder.alarms.length], ['T2', { date: '2026-11-12', time: '10:07' }, 1]);
  const u2 = await call('updateReminder', { itemId: task.id, patch: { due: null } });
  assert.equal(u2.reminder.alarms.length, 0); // 期限なしは通知なし
  await assert.rejects(() => call('updateReminder', { itemId: 'none', patch: {} }), { code: 'NOT_FOUND' });
  assert.deepEqual(await call('deleteReminder', { itemId: task.id }), { deleted: true, missing: false });
  assert.equal((await call('deleteReminder', { itemId: task.id })).missing, true);
  await assert.rejects(() => call('createReminder', {}), { code: 'UNAVAILABLE' });
  assert.equal(rowOf(task).itemId, task.id);
});
