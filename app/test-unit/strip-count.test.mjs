// 右の帯のタスク件数（期限切れ＋今日の未完了）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { overdueTodayCount } from '../js/reminders.js';

const R = (id, date, o = {}) => ({ itemId: id, listId: 'L1', done: false, due: date ? { date } : null, ...o });
const T = '2026-11-12', ALL = new Set(['L1']);

test('期限切れと今日だけ数える。先・期限なし・完了は数えない', () => {
  const l = [R('a', '2026-11-10'), R('b', T), R('c', '2026-11-13'), R('d', null), R('e', T, { done: true })];
  assert.equal(overdueTodayCount(l, ALL, null, T), 2);
});
test('完了操作の途中の見え方（override）を反映', () => {
  const l = [R('a', T), R('b', T)];
  assert.equal(overdueTodayCount(l, ALL, new Map([['a', true]]), T), 1);
  assert.equal(overdueTodayCount([R('x', T, { done: true })], ALL, new Map([['x', false]]), T), 1);
});
test('表示しないリストは数えない／0件', () => {
  assert.equal(overdueTodayCount([R('a', T, { listId: 'L2' })], ALL, null, T), 0);
  assert.equal(overdueTodayCount([], ALL, null, T), 0);
});
