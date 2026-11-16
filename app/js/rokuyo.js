// 六曜（案。app/js/rokuyo.js として入れる想定）。アプリの中では天文計算をせず、表（rokuyo-table.js）を引くだけ。
// 日付は 'YYYY-MM-DD' の文字列で受け、Date.UTC で日数に直すので、端末のタイムゾーンに左右されない。
import { ROKUYO_TABLE as T } from './rokuyo-table.js';

export const ROKUYO_NAMES = ['大安', '赤口', '先勝', '友引', '先負', '仏滅']; // (月+日) % 6 の順
export const ROKUYO_RANGE = { from: T.from, to: T.to };

const dayNo = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const RE = /^\d{4}-\d{2}-\d{2}$/;
// 読み込み時に1回だけ、各月の1日（日数）と月番号・閏を並べる（632 か月、1ms 未満）。
const STARTS = new Int32Array(T.lens.length + 1);
const MONTH = new Uint8Array(T.lens.length);
const LEAP = new Uint8Array(T.lens.length);
{
  const leaps = new Set(T.leaps);
  let d = dayNo(T.start), m = T.month;
  for (let i = 0; i < T.lens.length; i++) {
    if (i > 0 && !leaps.has(i)) m = m === 12 ? 1 : m + 1;
    STARTS[i] = d; MONTH[i] = m; LEAP[i] = leaps.has(i) ? 1 : 0;
    d += T.lens[i] === '1' ? 30 : 29;
  }
  STARTS[T.lens.length] = d;
}
const FROM = dayNo(T.from), TO = dayNo(T.to);

// 'YYYY-MM-DD' → { name, index, month, day, leap } 。範囲外・不正な値は null（例外は投げない）。
export function rokuyoOf(key) {
  if (typeof key !== 'string' || !RE.test(key)) return null;
  const n = dayNo(key);
  if (!Number.isFinite(n) || n < FROM || n > TO) return null;
  if (new Date(n * 864e5).toISOString().slice(0, 10) !== key) return null; // 2026-02-30 などは null
  let lo = 0, hi = STARTS.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (STARTS[mid] <= n) lo = mid; else hi = mid - 1; }
  const month = MONTH[lo], day = n - STARTS[lo] + 1, index = (month + day) % 6;
  return { name: ROKUYO_NAMES[index], index, month, day, leap: LEAP[lo] === 1 };
}
