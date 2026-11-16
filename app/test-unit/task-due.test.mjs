// 第15版 PR19: タスク期限の patch（未操作は送らない。日付のみ／時刻あり／なしを区別）と共通部品の純粋部分
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskPatch, openTaskEditor, createAddController, addRowHtml } from '../js/reminders.js';
import { splitHm, withHm, monthPopParts } from '../js/datetime-ui.js';

const mk = (due, alarms = [], extra = {}) => ({ itemId: 'a', externalId: 'ea', listId: 'L1', title: 'T', notes: '', due, alarms, alarmsExtra: 0, ...extra });
const form = (r, o = {}) => ({ ...openTaskEditor(r, []).form, ...o });

test('未操作は patch を空にする（日付のみ・10:07・期限なし・特殊通知付き）', () => {
  for (const r of [mk({ date: '2026-11-20' }), mk({ date: '2026-11-20', time: '10:07' }), mk(null), mk({ date: '2026-11-20' }, [{ x: 1 }], { alarmsExtra: 2 })]) {
    assert.deepEqual(buildTaskPatch(r, form(r)), { patch: {} });
  }
});
test('期限だけ変えても notify は送らない（通知をオンにしない）', () => {
  const r = mk({ date: '2026-11-20' });
  assert.deepEqual(buildTaskPatch(r, form(r, { date: '2026-11-21' })).patch, { due: { date: '2026-11-21' } });
  assert.deepEqual(buildTaskPatch(r, form(r, { date: '2026-11-21', time: '09:30' })).patch, { due: { date: '2026-11-21', time: '09:30' } });
  assert.deepEqual(buildTaskPatch(r, form(r, { date: '', time: '' })).patch, { due: null });
  const x = mk({ date: '2026-11-20' }, [{ b: 1 }], { alarmsExtra: 1 });
  assert.equal('notify' in buildTaskPatch(x, form(x, { date: '2026-11-22' })).patch, false);
});
test('時刻だけ外す／足す。07分は丸めない', () => {
  const r = mk({ date: '2026-11-20', time: '10:07' });
  assert.deepEqual(buildTaskPatch(r, form(r, { time: '' })).patch, { due: { date: '2026-11-20' } });
  assert.equal(withHm('10:07', 11, null), '11:07');
  assert.equal(withHm('10:07', null, 30), '10:30');
  assert.equal(withHm('', 8, null), '08:00');
  assert.deepEqual(splitHm('09:05'), { h: 9, mi: 5 });
  assert.equal(splitHm(''), null);
});
test('追加: 期限の日付のみ／時刻あり／なしを別々に送り、notify は省略', async () => {
  const calls = [];
  const call = async (m, o) => { calls.push(o); return { reminder: { itemId: 'n', ...o } }; };
  const c = createAddController(call);
  await c.submit({ title: 'a', listId: 'L', due: '2026-11-20' });
  await c.submit({ title: 'b', listId: 'L', due: '2026-11-20', time: '10:07' });
  await c.submit({ title: 'c', listId: 'L', due: null });
  assert.deepEqual(calls.map((o) => o.due), [{ date: '2026-11-20' }, { date: '2026-11-20', time: '10:07' }, null]);
  assert.ok(calls.every((o) => !('notify' in o) || o.notify === undefined));
});
test('追加行: 期限チップに時刻を出し、部品は開いたときだけ', () => {
  const closed = addRowHtml({ open: true, title: '', due: '2026-11-20', time: '10:07' }, { selected: '2026-11-12' });
  assert.match(closed, /期限 11\/20 10:07/); assert.doesNotMatch(closed, /rmdp/);
  const opened = addRowHtml({ open: true, title: '', due: '2026-11-20', time: '10:07', pop: { vm: '2026-11-01' } }, { selected: '2026-11-12' });
  assert.match(opened, /rmdp/); assert.match(opened, /いま 07分/);
  assert.equal((opened.match(/class="dcell/g) || []).length, 42);
});
test('小さな月は6行42マス、minより前は押せない', () => {
  const m = monthPopParts('2026-11-01', { cur: '2026-11-20', min: '2026-11-15' });
  assert.equal((m.grid.match(/class="dcell/g) || []).length, 42);
  assert.match(m.grid, /data-day="2026-11-14"[^>]*disabled/);
});
