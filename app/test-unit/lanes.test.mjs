import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSharedLanes, isMonthBand, isMulti, addDays, setFirstDay } from '../js/util.js';

setFirstDay(1);
const days = Array.from({ length: 7 }, (_, i) => addDays('2026-11-09', i));
const ev = (id, title, start, end, all = false) => ({ id, title, start, end, all, categoryId: 'c' });

test('isMonthBand: 終日と複数日は帯、時刻付き単日はチップ。isMulti の意味は変えない', () => {
  assert.equal(isMonthBand(ev('a', 'a', '2026-11-12T00:00', '2026-11-12T23:59', true)), true);
  assert.equal(isMonthBand(ev('b', 'b', '2026-11-12T10:00', '2026-11-13T10:00')), true);
  assert.equal(isMonthBand(ev('c', 'c', '2026-11-12T10:00', '2026-11-12T11:00')), false);
  assert.equal(isMulti(ev('a', 'a', '2026-11-12T00:00', '2026-11-12T23:59', true)), false);
});

test('帯を先に（長い順）、チップは残った段。hidden = 全件 − 置いた件数、二重計数なし', () => {
  const list = [
    ev('lone', '単日終日', '2026-11-12T00:00', '2026-11-12T23:59', true),
    ev('x', 'X', '2026-11-12T00:00', '2026-11-14T23:59', true),
    ev('y', 'Y', '2026-11-10T00:00', '2026-11-12T23:59', true),
    ...Array.from({ length: 6 }, (_, i) => ev(`t${i}`, `t${i}`, `2026-11-12T0${i + 1}:00`, `2026-11-12T0${i + 1}:30`)),
  ];
  const { items, hidden, used } = assignSharedLanes(list, days, 5);
  assert.equal(used, 5);
  const on = (k) => items.filter((b) => days[b.sc] <= k && days[b.ec] >= k);
  assert.equal(on('2026-11-12').length, 5);
  assert.equal(hidden[3], 4); // 9件 − 5
  assert.equal(new Set(on('2026-11-12').map((b) => b.e.id)).size, 5);
  assert.deepEqual(on('2026-11-12').filter((b) => b.band).map((b) => b.e.id).sort(), ['lone', 'x', 'y']);
  const lanes = on('2026-11-12').map((b) => b.lane);
  assert.equal(new Set(lanes).size, lanes.length);
});

test('maxLanes 未満では hidden は 0、週をまたぐ帯は fromPrev / toNext', () => {
  const { items, hidden } = assignSharedLanes([ev('w', 'W', '2026-11-05T00:00', '2026-11-11T23:59', true)], days, 4);
  assert.deepEqual(hidden, Array(7).fill(0));
  assert.equal(items[0].fromPrev, true);
  assert.equal(items[0].toNext, false);
  assert.deepEqual([items[0].sc, items[0].ec], [0, 2]);
});
