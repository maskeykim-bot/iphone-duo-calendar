// 第16版 PR33: 集中タスクの四つの見方（重複・漏れなし、時刻の境界、30日窓）
import test from 'node:test';
import assert from 'node:assert/strict';
import { taskViews, normTaskView, TASK_VIEWS } from '../js/tasks.js';

const T = (id, o = {}) => ({ id, title: id, due: null, done: false, doneAt: null, createdAt: 1, ...o });
const now = new Date(2026, 10, 12, 9, 41); // 2026-11-12 09:41（端末ローカル）
const ids = (a) => a.map((x) => x.id);

test('normTaskView は不正値を今日にする', () => {
  assert.deepEqual(TASK_VIEWS, ['today', 'plan', 'all', 'done']);
  assert.equal(normTaskView('plan'), 'plan');
  assert.equal(normTaskView('x'), 'today');
  assert.equal(normTaskView(undefined), 'today');
});

test('今日＝期限切れ＋今日。時刻の直前後で切れる。予定＝明日以降', () => {
  const v = taskViews([
    T('past', { due: { date: '2026-11-11' } }),
    T('before', { due: { date: '2026-11-12', time: '09:40' } }),
    T('same', { due: { date: '2026-11-12', time: '09:41' } }),
    T('after', { due: { date: '2026-11-12', time: '09:42' } }),
    T('allday', { due: { date: '2026-11-12' } }),
    T('midnight', { due: { date: '2026-11-13', time: '00:00' } }),
    T('later', { due: { date: '2026-12-01' } }),
    T('none'),
  ], { now });
  assert.deepEqual(ids(v.overdue), ['past', 'before']);
  assert.deepEqual(ids(v.todayItems), ['allday', 'same', 'after']);
  assert.equal(v.count, 5);
  assert.deepEqual(v.plan.map((g) => [g.date, ids(g.items)]), [['2026-11-13', ['midnight']], ['2026-12-01', ['later']]]);
  assert.deepEqual(ids(v.nodue), ['none']);
});

test('すべて＝未完了の全部。四つの集合に重複も漏れもない', () => {
  const list = [
    T('a', { due: { date: '2026-11-01' } }), T('b', { due: { date: '2026-11-12' } }), T('c', { due: { date: '2026-11-20' } }), T('d'),
    T('e', { done: true, doneAt: '2026-11-12T08:00' }), T('f', { done: true, doneAt: '2026-01-01T08:00' }), T('g', { done: true, doneAt: null }),
  ];
  const v = taskViews(list, { now });
  assert.deepEqual(ids(v.all).sort(), ['a', 'b', 'c', 'd']);
  const open = [...v.overdue, ...v.todayItems, ...v.plan.flatMap((g) => g.items), ...v.nodue];
  assert.equal(new Set(ids(open)).size, open.length);
  const every = [...open, ...v.recent, ...v.older];
  assert.deepEqual(ids(every).sort(), ids(list).sort());
});

test('完了＝30日窓。境界ちょうどは窓内、1分前は「もっと前」', () => {
  const since = '2026-10-13T09:41';
  const v = taskViews([
    T('edge', { done: true, doneAt: since }),
    T('out', { done: true, doneAt: '2026-10-13T09:40' }),
    T('new', { done: true, doneAt: '2026-11-12T09:00' }),
  ], { now });
  assert.deepEqual(ids(v.recent), ['new', 'edge']);
  assert.deepEqual(ids(v.older), ['out']);
});

test('同じ id は1回だけ。期限なしは作成順', () => {
  const v = taskViews([T('x', { createdAt: 5 }), T('x', { createdAt: 1 }), T('y', { createdAt: 2 })], { now });
  assert.deepEqual(ids(v.nodue), ['y', 'x']);
});
