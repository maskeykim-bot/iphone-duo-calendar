import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTasks, LIMIT } from '../js/search.js';
import { dueCounts, todayTasks } from '../js/tasks.js';
import { homeTasks } from '../js/home.js';

const T = (id, title, o = {}) => ({ id, title, note: '', due: null, done: false, doneAt: null, order: 0, ...o });
test('検索の並び: 未完了（期限順）→期限なし→完了。古い完了も見つかる', () => {
  const l = [
    T('d', '買う 古い', { done: true, doneAt: '2025-01-01T10:00', due: { date: '2025-01-01' } }),
    T('n', '買う なし'), T('b', '買う B', { due: { date: '2026-11-20' } }), T('a', '買う A', { due: { date: '2026-11-18', time: '09:00' } }),
    T('x', '無関係'),
  ];
  const r = searchTasks(l, '買う');
  assert.deepEqual(r.items.map((t) => t.id), ['a', 'b', 'n', 'd']); assert.equal(r.total, 4);
});
test('題名・メモの正規化AND（全角・カタカナ）', () => {
  const l = [T('1', 'ミルク', { note: 'ＳＴＯＲＥ' }), T('2', 'ミルク')];
  assert.deepEqual(searchTasks(l, 'みるく store').items.map((t) => t.id), ['1']);
  assert.equal(searchTasks(l, '  ').total, 0);
});
test('10000件でも別枠LIMIT200で total は全体', () => {
  const l = Array.from({ length: 10000 }, (_, i) => T(`t${i}`, `タスク${i}`, { due: { date: '2026-11-17' }, order: i }));
  const t0 = performance.now(), r = searchTasks(l, 'タスク');
  assert.equal(r.items.length, LIMIT); assert.equal(r.total, 10000); assert.ok(r.capped);
  console.log(`searchTasks 10000件: ${(performance.now() - t0).toFixed(1)}ms`);
});
test('件数: 帯・ホーム・月が同じ集合から。日付・時刻境界と完了中overlay', () => {
  const l = [T('a', 'a', { due: { date: '2026-11-17', time: '00:00' } }), T('b', 'b', { due: { date: '2026-11-17', time: '23:59' } }), T('c', 'c', { due: { date: '2026-11-18' } }), T('o', 'o', { due: { date: '2026-10-01' } }), T('z', 'z', { done: true, due: { date: '2026-10-17' } })];
  const day = '2026-11-17';
  assert.equal(todayTasks(l, day).total, 3);
  assert.equal(homeTasks(l, day).total, 3);
  assert.equal(todayTasks(l, '2026-11-16').total, 1);
  const p = new Map([['a', true], ['c', true]]);
  assert.equal(todayTasks(l, day, p).total, 2);
  assert.equal(dueCounts(l).get('2026-11-17'), 2); assert.equal(dueCounts(l, p).get('2026-11-17'), 1); assert.equal(dueCounts(l, p).has('2026-11-18'), false);
  assert.equal(dueCounts(l).has('2026-10-17'), false);
});
test('10000件の件数計算の所要時間', () => {
  const l = Array.from({ length: 10000 }, (_, i) => T(`t${i}`, `t${i}`, { due: { date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}` }, done: i % 3 === 0 }));
  const t0 = performance.now(); const a = todayTasks(l, '2026-11-17').total, b = dueCounts(l).size;
  console.log(`件数 10000件: ${(performance.now() - t0).toFixed(1)}ms`); assert.ok(a > 0 && b === 28);
});
