// 未来の回の判定（hasFutureOccurrence）。第15版 PR12 で一括付与は廃止（付与の計画関数は削除）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFutureOccurrence } from '../js/recur.js';
import { R, ev } from './fixtures.mjs';

const NOW = new Date(2026, 10, 14, 9, 0); // 2026-11-14 09:00 ローカル
const fut = (p, now = NOW) => hasFutureOccurrence(p, now);
test('系列: 無期限は常に残る。開始が過去でも終了が未来の回（日またぎ）', () => {
  assert.equal(fut(ev('d', '2020-01-01T09:00', '2020-01-01T10:00', R('daily'))), true);
  assert.equal(fut(ev('n', '2026-11-13T23:00', '2026-11-14T10:00', R('daily', { count: 1 }))), true); // 開始は過去・終了 10:00 > 9:00
  assert.equal(fut(ev('n2', '2026-11-13T23:00', '2026-11-14T09:00', R('daily', { count: 1 }))), false);
});
test('系列: count / until の打切り', () => {
  assert.equal(fut(ev('c', '2026-11-01T10:00', '2026-11-01T11:00', R('daily', { count: 13 }))), false); // 11/13 が最後
  assert.equal(fut(ev('c2', '2026-11-01T10:00', '2026-11-01T11:00', R('daily', { count: 14 }))), true); // 11/14 10:00
  assert.equal(fut(ev('u', '2026-11-01T10:00', '2026-11-01T11:00', R('daily', { until: '2026-11-13' }))), false);
  assert.equal(fut(ev('u2', '2026-11-01T10:00', '2026-11-01T11:00', R('daily', { until: '2026-11-14' }))), true);
  assert.equal(fut(ev('big', '2000-01-01T10:00', '2000-01-01T11:00', R('daily', { count: 9999 }))), true); // 最終回は 2027-05
  assert.equal(fut(ev('big2', '1990-01-01T10:00', '1990-01-01T11:00', R('daily', { count: 9999 }))), false); // 最終回は 2017 年
});
test('系列: 全回 exdates → 対象外。窓（30日）で判定しない（翌年・閏年）', () => {
  const ex = ev('x', '2026-11-13T10:00', '2026-11-13T11:00', R('daily', { count: 3 }), { exdates: ['2026-11-13T10:00', '2026-11-14T10:00', '2026-11-15T10:00'] });
  assert.equal(fut(ex), false);
  assert.equal(fut(ev('y', '2026-03-05T10:00', '2026-03-05T11:00', R('yearly'))), true);
  const leap = ev('l', '2024-02-29T10:00', '2024-02-29T11:00', R('yearly'));
  assert.equal(fut(leap), true); // 次は 2028-02-29
  assert.equal(fut(leap, new Date(2027, 5, 1)), true);
  assert.equal(fut(ev('l2', '2024-02-29T10:00', '2024-02-29T11:00', R('yearly', { count: 1 })), new Date(2025, 0, 1)), false);
});
test('系列: 移動 override は移動先で判定。ゴースト override は証拠にしない', () => {
  const base = { count: 2 };
  const moved = ev('m', '2026-11-01T10:00', '2026-11-01T11:00', R('weekly', base), { overrides: { '2026-11-08T10:00': { title: 'm', start: '2026-12-01T10:00', end: '2026-12-01T11:00' } } });
  assert.equal(fut(moved), true);
  const ghost = ev('g', '2026-11-01T10:00', '2026-11-01T11:00', R('weekly', base), { overrides: { '2026-11-22T10:00': { title: 'g', start: '2026-12-01T10:00', end: '2026-12-01T11:00' } } });
  assert.equal(fut(ghost), false); // 11/22 は count 2 の外
  const earlier = ev('e', '2026-11-01T10:00', '2026-11-01T11:00', R('weekly', base), { overrides: { '2026-11-08T10:00': { title: 'e', start: '2026-11-02T10:00', end: '2026-11-02T11:00' } } });
  assert.equal(fut(earlier), false); // 移動先が過去
});
test('系列: DST で存在しない時刻の回は数えない', () => {
  // 2027-03-14 は米東部で 02:30 が存在しない。until で 2027 年内に限る（count は実在する回だけ数えるので翌年の回が残る）。東京では存在するので TZ 依存を分けて検査。
  const p = ev('dst', '2027-03-14T02:30', '2027-03-14T03:30', R('yearly', { until: '2027-12-31' }));
  const exists = new Date(2027, 2, 14, 2, 30).getHours() === 2;
  assert.equal(fut(p), exists);
});
