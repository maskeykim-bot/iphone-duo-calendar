// 性能計測（改善前後の比較用）。使い方: npm run perf   （TZ 指定可: TZ=America/New_York npm run perf）
// 目標: 検索・繰り返し展開とも 100ms 未満。結果は標準出力に表で出す。--json で JSON のみ。
import { expand } from '../js/recur.js';
import { searchEvents } from '../js/search.js';
import { manyRecurring, oldCountSeries, dailyCount999, searchSet, TODAY, GOAL_MS } from '../test-unit/fixtures.mjs';

const RUNS = 3;
const measure = (name, fn) => {
  const ms = [];
  let n;
  for (let i = 0; i < RUNS; i++) { const t = performance.now(); n = fn(); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return { name, median: +ms[1].toFixed(1), min: +ms[0].toFixed(1), max: +ms[2].toFixed(1), result: n };
};
const many = manyRecurring(), old = oldCountSeries(), c999 = dailyCount999(), ss = searchSet();
const rows = [
  measure('月展開: 日次/平日週次 200件', () => expand(many, '2026-11-01', '2026-11-30').length),
  measure('月展開: 回数9999(2000年起点) 200件', () => expand(old, '2026-11-01', '2026-11-30').length),
  measure('6週展開: daily count=999(2024起点) 20件', () => expand(c999, '2026-11-01', '2026-12-12').length),
  measure('検索: 毎日30+単発500 "会議"', () => searchEvents(ss, '会議', TODAY).total),
  measure('検索: 繰り返し200件 "tp1"', () => searchEvents(many, 'tp1', TODAY).total),
];
for (const r of rows) r.goal = r.median < GOAL_MS ? 'OK' : 'NG';
if (process.argv.includes('--json')) console.log(JSON.stringify({ tz: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone, node: process.version, goalMs: GOAL_MS, rows }, null, 1));
else {
  console.log(`TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone} node=${process.version} 目標<${GOAL_MS}ms 中央値(${RUNS}回)`);
  for (const r of rows) console.log(`${r.goal}  ${String(r.median).padStart(8)} ms  (min ${r.min} / max ${r.max})  件数=${r.result}  ${r.name}`);
}
