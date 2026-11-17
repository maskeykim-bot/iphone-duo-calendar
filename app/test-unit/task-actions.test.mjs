// 第16版 PR18: タスクの完了と取り消し（fake clock・連打・保存失敗・離脱 flush・undo）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createTaskStore, createTaskDoneController } from '../js/tasks.js';

let n = 0;
async function fresh() { globalThis.indexedDB = new IDBFactory(); const m = await import(`../js/db.js?a${n++}`); m.configure(`a${n}`); return m; }
function clock() {
  let t = 0, id = 0; const q = new Map();
  return { set: (fn, ms) => { q.set(++id, { at: t + ms, fn }); return id; }, clear: (i) => q.delete(i),
    async tick(ms) { t += ms; for (const [i, x] of [...q]) if (x.at <= t) { q.delete(i); x.fn(); } for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 2)); } };
}
async function setup(over = {}) {
  const db = await fresh(), saves = [];
  const store = createTaskStore({ ...db, putTask: async (t) => { saves.push(t.done); if (over.fail) { const e = new Error('x'); e.name = 'AbortError'; throw e; } return db.putTask(t); } });
  const t = await db.addTask({ id: 'a', title: '牛乳', due: null, notify: false, note: '' });
  const ck = clock(), settled = [];
  const ctl = createTaskDoneController(store, { setTimer: ck.set, clearTimer: ck.clear, onSettle: (id, o) => settled.push(o) });
  return { db, ctl, ck, saves, settled, row: { itemId: 'a', done: false } };
}

test('完了: 1.5秒まで保存せず表示だけ、その後に1回保存し doneAt が入る', async () => {
  const s = await setup();
  s.ctl.toggle(s.row);
  assert.equal(s.ctl.pending().get('a'), true);
  await s.ck.tick(1400); assert.deepEqual(s.saves, []);
  await s.ck.tick(200);
  assert.deepEqual(s.saves, [true]);
  assert.equal(s.settled.length, 1); assert.equal(s.settled[0].done, true);
  const t = await s.db.getTask('a'); assert.equal(t.done, true); assert.match(t.doneAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.equal(s.ctl.has('a'), false);
});

test('1.5秒内の押し直し: 完了→戻すは保存0回、完了→戻す→完了は最後の1回だけ', async () => {
  const s = await setup();
  s.ctl.toggle(s.row); await s.ck.tick(500); s.ctl.toggle(s.row);
  await s.ck.tick(2000);
  assert.deepEqual(s.saves, []); assert.equal(s.settled[0].unchanged, true);
  s.ctl.toggle(s.row); await s.ck.tick(300); s.ctl.toggle(s.row); await s.ck.tick(300); s.ctl.toggle(s.row);
  await s.ck.tick(1600);
  assert.deepEqual(s.saves, [true]);
});

test('離脱の flush は待たずに最後の状態を保存する', async () => {
  const s = await setup();
  s.ctl.toggle(s.row);
  await s.ctl.flush();
  assert.deepEqual(s.saves, [true]); assert.equal((await s.db.getTask('a')).done, true);
  await s.ck.tick(5000); assert.deepEqual(s.saves, [true]); // 二重保存なし
});

test('undo: 未完了へ戻り doneAt は null', async () => {
  const s = await setup();
  s.ctl.toggle(s.row); await s.ck.tick(1600);
  const r = await s.ctl.undo('a');
  assert.equal(r.ok, true);
  const t = await s.db.getTask('a'); assert.deepEqual([t.done, t.doneAt], [false, null]);
});

test('保存失敗: failed で通知され、DB は未完了のまま、表示の上書きは残らない', async () => {
  const s = await setup({ fail: true });
  s.ctl.toggle(s.row); await s.ck.tick(1600);
  assert.equal(s.settled[0].failed, true); assert.equal(s.settled[0].err.code, 'STORE_FAILED');
  assert.equal(s.ctl.pending().size, 0);
  assert.equal((await s.db.getTask('a')).done, false);
});

test('読み取り専用や null は無視', async () => {
  const s = await setup();
  assert.equal(s.ctl.toggle(null), false); assert.equal(s.ctl.toggle({ itemId: 'a', readOnly: true }), false);
});
