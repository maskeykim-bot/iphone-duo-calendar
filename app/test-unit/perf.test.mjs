// probe_perf.mjs / probe_recur.mjs の性能部分。結果の正しさと、§E.1 の時間目標（上限は CI の揺れを見込んで緩め）をアサートする。
// 実測 ms は `npm run perf` (scripts/perf-report.mjs) で出す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { expand } from '../js/recur.js';
import { searchEvents } from '../js/search.js';
import { bumpRevision, monthOcc } from '../js/occcache.js';
import { manyRecurring, oldCountSeries, dailyCount999, searchSet, TODAY, GOAL_MS } from './fixtures.mjs';

const time = (fn) => { const t = performance.now(); const r = fn(); return [performance.now() - t, r]; };

test('月表示: 日次/平日週次 200 件の展開件数（正しさ）', () => {
  const [, r] = time(() => expand(manyRecurring(), '2026-11-01', '2026-11-30'));
  assert.equal(r.length, 5100); // 100 daily×30 + 100 weekly(平日)×21
});

test('回数指定 9999 の古い系列でも当月の展開は正しい（2000-01-01 起点・daily、9999 回目は 2027-05-19）', () => {
  const r = expand(oldCountSeries().slice(0, 1), '2026-11-01', '2026-11-30');
  assert.equal(r.length, 30);
});

test('検索: 30 毎日 + 500 単発の件数・上限', () => {
  const [, r] = time(() => searchEvents(searchSet(), '会議', TODAY));
  assert.equal(r.capped, true);
  assert.equal(r.items.length, 200);
  assert.ok(r.total > 200);
});

test('6 週表示: 20 件の daily count=999（2024-01-01 起点）は 2026-09-26 で終わるので 0 件', () => {
  const [, r] = time(() => expand(dailyCount999(), '2026-11-01', '2026-12-12'));
  assert.equal(r.length, 0);
});

// 時間の上限。目標（検索・回数系列 100ms、月展開 30ms、2 回目 1ms）に対し、CI の揺れ・並列実行を見込んで約 2〜5 倍に緩めてある（実測は npm run perf。目標内かはそちらで確認）。
const LOOSE = GOAL_MS * 2;
let uid = 0;
const fresh = () => `f${++uid}_`; // 毎回別の id にして、メモ化・キャッシュの効かない「初回」を測る

test('性能: 検索 200ms 未満（目標 100ms。毎日 30 系列 + 単発 500、初回）', () => {
  const set = searchSet().map((e) => ({ ...e })); // 別オブジェクト: 正規化の使い回しが効かない初回
  const [ms, r] = time(() => searchEvents(set, '会議', TODAY));
  assert.equal(r.total > 200, true);
  assert.ok(ms < LOOSE, `${ms.toFixed(1)}ms`);
});

test('性能: 検索の 2 回目（入力を続けた場合）も 200ms 未満', () => {
  const set = searchSet();
  searchEvents(set, '会議', TODAY);
  const [ms] = time(() => searchEvents(set, '会議 メモ', TODAY));
  assert.ok(ms < LOOSE, `${ms.toFixed(1)}ms`);
});

test('性能: 回数指定 9999（2000 年起点）200 系列の月展開 200ms 未満（目標 100ms、初回。改善前は約 7000ms）', () => {
  const set = oldCountSeries(fresh());
  const [ms, r] = time(() => expand(set, '2026-11-01', '2026-11-30'));
  assert.equal(r.length, 30 * 200);
  assert.ok(ms < LOOSE, `${ms.toFixed(1)}ms`);
});

test('性能: 回数指定 9999 の月表示（6 週分）も 200ms 未満、終了日の翌月は 0 件', () => {
  const set = oldCountSeries(fresh());
  const [ms, r] = time(() => monthOcc(set, '2026-11'));
  assert.equal(r.length > 0, true);
  assert.ok(ms < LOOSE, `${ms.toFixed(1)}ms`);
  assert.equal(expand(set, '2027-06-01', '2027-06-30').length, 0); // 9999 回目は 2027-05-19
});

test('性能: 月の展開 200 系列（日次/平日週次）の初回は 100ms 未満（目標 30ms）、2 回目（キャッシュ）は 5ms 未満（目標 1ms）', () => {
  bumpRevision();
  const set = manyRecurring(fresh());
  const [ms1, r1] = time(() => monthOcc(set, '2026-11'));
  const [ms2, r2] = time(() => monthOcc(set, '2026-11'));
  assert.equal(r2, r1);
  assert.ok(ms1 < 100, `初回 ${ms1.toFixed(1)}ms`);
  assert.ok(ms2 < 5, `2回目 ${ms2.toFixed(3)}ms`);
});

test('性能: 20 件の daily count=999（2024 起点）の 6 週展開 200ms 未満', () => {
  const set = dailyCount999();
  const [ms] = time(() => expand(set, '2026-11-01', '2026-12-12'));
  assert.ok(ms < LOOSE, `${ms.toFixed(1)}ms`);
});
