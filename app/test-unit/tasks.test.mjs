import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTask, makeTask, classifyTasks, TASK_NOTE_MAX } from '../js/tasks.js';
import { LIMITS } from '../js/util.js';

const base = { id: 'a', title: '牛乳', due: null, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false };
test('正常なタスクは通り、日付文字列はそのまま', () => {
  const r = validateTask({ ...base, due: { date: '2026-11-17', time: '09:05' }, notify: true });
  assert.ok(r.ok); assert.deepEqual(r.task.due, { date: '2026-11-17', time: '09:05' }); assert.equal(r.task.notify, true);
});
test('期限なしは notify false に、未完了は doneAt null に正規化', () => {
  assert.equal(validateTask({ ...base, notify: true }).task.notify, false);
  assert.equal(validateTask({ ...base, doneAt: '2026-11-17T10:00' }).task.doneAt, null);
  assert.equal(validateTask({ ...base, done: true, doneAt: '2026-11-17T10:00' }).task.doneAt, '2026-11-17T10:00');
});
test('title / note の上限と空', () => {
  assert.equal(validateTask({ ...base, title: '  ' }).ok, false);
  assert.equal(validateTask({ ...base, title: 'あ'.repeat(LIMITS.title) }).ok, true);
  assert.equal(validateTask({ ...base, title: 'あ'.repeat(LIMITS.title + 1) }).ok, false);
  assert.equal(validateTask({ ...base, note: 'x'.repeat(TASK_NOTE_MAX) }).ok, true);
  assert.equal(validateTask({ ...base, note: 'x'.repeat(TASK_NOTE_MAX + 1) }).ok, false);
});
test('不正な形はすべて拒否', () => {
  for (const bad of [null, 5, { ...base, id: '' }, { ...base, due: { date: '2026-02-30' } }, { ...base, due: { date: '2026-11-17', time: '24:00' } },
    { ...base, done: 'yes' }, { ...base, doneAt: 'x' }, { ...base, createdAt: 'a' }, { ...base, order: NaN }, { ...base, notify: 1 }]) assert.equal(validateTask(bad).ok, false);
});
test('makeTask は未完了・通知なし', () => {
  const r = makeTask({ title: ' 買う ', order: 3 }, 1000);
  assert.ok(r.ok); assert.equal(r.task.done, false); assert.equal(r.task.notify, false); assert.equal(r.task.title, '買う'); assert.equal(r.task.order, 3);
});
test('classifyTasks は配列で分け order 順', () => {
  const l = [{ ...base, id: 'c', order: 3 }, { ...base, id: 'b', order: 2, done: true }, { ...base, id: 'a', order: 1 }];
  const c = classifyTasks(l);
  assert.deepEqual(c.open.map((t) => t.id), ['a', 'c']); assert.deepEqual(c.done.map((t) => t.id), ['b']);
});
