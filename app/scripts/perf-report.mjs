// 性能計測（改善前後の比較用）。使い方: npm run perf   （TZ 指定可: TZ=America/New_York npm run perf）
// 目標: 検索・繰り返し展開とも 100ms 未満。結果は標準出力に表で出す。--json で JSON のみ。
import { expand } from '../js/recur.js';
import { searchEvents } from '../js/search.js';
import { bumpRevision, monthOcc } from '../js/occcache.js';
import { manyRecurring, oldCountSeries, dailyCount999, searchSet, TODAY, GOAL_MS } from '../test-unit/fixtures.mjs';

const RUNS = 3;
let uid = 0;
const measure = (name, fn, prep = () => undefined) => {
  const ms = [];
  let n;
  for (let i = 0; i < RUNS; i++) { const a = prep(); const t = performance.now(); n = fn(a); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return { name, median: +ms[1].toFixed(1), min: +ms[0].toFixed(1), max: +ms[2].toFixed(1), result: n };
};
const fresh = () => `r${++uid}_`; // 毎回別 id: メモ化・キャッシュの効かない初回を測る
const clone = (l) => l.map((e) => ({ ...e }));
const ss = searchSet(), many = manyRecurring();
const monthWarm = manyRecurring('w'); monthOcc(monthWarm, '2026-11');
const rows = [
  measure('月展開 expand: 日次/平日週次 200件（初回）', (a) => expand(a, '2026-11-01', '2026-11-30').length, () => manyRecurring(fresh())),
  measure('月展開 monthOcc: 200系列（初回・6週分）', (a) => { bumpRevision(); return monthOcc(a, '2026-11').length; }, () => manyRecurring(fresh())),
  measure('月展開 monthOcc: 200系列（2回目・キャッシュ）', () => monthOcc(monthWarm, '2026-11').length),
  measure('月展開: 回数9999(2000年起点) 200件（初回）', (a) => expand(a, '2026-11-01', '2026-11-30').length, () => oldCountSeries(fresh())),
  measure('月表示 monthOcc: 回数9999 200系列（初回・6週分）', (a) => { bumpRevision(); return monthOcc(a, '2026-11').length; }, () => oldCountSeries(fresh())),
  measure('6週展開: daily count=999(2024起点) 20件', (a) => expand(a, '2026-11-01', '2026-12-12').length, () => dailyCount999()),
  measure('検索: 毎日30+単発500 "会議"（初回）', (a) => searchEvents(a, '会議', TODAY).total, () => clone(ss)),
  measure('検索: 毎日30+単発500 "会議 メモ"（2回目）', () => searchEvents(ss, '会議 メモ', TODAY).total),
  // 題名は `t${接頭辞}${番号}`。毎回別の接頭辞なので、その回の2件目の題名（前方一致で数十件に当たる）で検索する。
  measure('検索: 繰り返し200件（その回の接頭辞に合う語）', (a) => searchEvents(a, a[1].title, TODAY).total, () => manyRecurring(fresh())),
];
for (const r of rows) r.goal = r.median < GOAL_MS ? 'OK' : 'NG';
if (process.argv.includes('--json')) console.log(JSON.stringify({ tz: process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone, node: process.version, goalMs: GOAL_MS, rows }, null, 1));
else {
  console.log(`TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone} node=${process.version} 目標<${GOAL_MS}ms 中央値(${RUNS}回)`);
  for (const r of rows) console.log(`${r.goal}  ${String(r.median).padStart(8)} ms  (min ${r.min} / max ${r.max})  件数=${r.result}  ${r.name}`);
}
