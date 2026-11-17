// 日本の国民の祝日・休日（案。app/js/holidays.js として入れる想定）。
// アプリの中では計算せず、表（holidays-table.js）を引くだけ。
// 日付は 'YYYY-MM-DD' の文字列で受け、Date.UTC で日数に直すので、端末のタイムゾーンに左右されない。
import { HOLIDAYS_TABLE as T } from './holidays-table.js';

export const HOLIDAYS_RANGE = { from: T.from, officialTo: T.officialTo, to: T.to };
export const HOLIDAY_NAMES = T.names;

const dayNo = (k) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 864e5;
const RE = /^\d{4}-\d{2}-\d{2}$/;
const FROM = dayNo(T.from), TO = dayNo(T.to);
const OFFICIAL_TO = dayNo(T.officialTo);

// 読み込み時に1回だけ、日付 → { name, official } を作る（千件台、1ms 未満）。
const MAP = new Map();
{
  const names = T.names;
  for (const yearBlock of T.data.split('/')) {
    const colon = yearBlock.indexOf(':');
    const year = yearBlock.slice(0, colon);
    for (const item of yearBlock.slice(colon + 1).split(',')) {
      if (!item) continue;
      const mm = item.slice(0, 2), dd = item.slice(2, 4), idx = parseInt(item.slice(4), 36);
      const key = `${year}-${mm}-${dd}`;
      MAP.set(key, { name: names[idx], official: dayNo(key) <= OFFICIAL_TO });
    }
  }
}

function metaOf(key) {
  if (typeof key !== 'string' || !RE.test(key)) return null;
  const n = dayNo(key);
  if (!Number.isFinite(n) || n < FROM || n > TO) return null;
  if (new Date(n * 864e5).toISOString().slice(0, 10) !== key) return null; // 2026-02-30 などは null
  return MAP.get(key) || null;
}

// 'YYYY-MM-DD' → 祝日・休日の名前（「元日」「休日」など）。範囲外・不正な値・祝日でない日は null（例外は投げない）。
export function holidayOf(key) {
  const m = metaOf(key);
  return m ? m.name : null;
}

// 'YYYY-MM-DD' → { name, official } 。official は公式 CSV の年（〜officialTo）なら true、予定の年なら false。
// 祝日でない日・範囲外・不正な値は null。
export function holidayMeta(key) {
  const m = metaOf(key);
  return m ? { name: m.name, official: m.official } : null;
}
