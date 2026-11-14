// 月ごとの回キャッシュ。月の表示範囲（月グリッドの最初の週〜最後の週）を1回だけ展開して保持する。DOM に依存しない。
// 無効化: データが変わる操作（追加・編集・削除・個別変更・バックアップ読み込み・カテゴリ削除・iPhone 連携による書き込み）で bumpRevision() を呼ぶ。
// 保険として、キャッシュは展開に使った events 配列の同一性も確認する（state.events は変更のたびに新しい配列に置き換わる）。
import { expand } from './recur.js';
import { monthWeeks } from './util.js';

const MAX_MONTHS = 6;
let rev = 0;
const cache = new Map(); // key: `${YYYY-MM}|${rev}|${tz}` → { events, from, to, occ }
const tzKey = () => `${new Date().getTimezoneOffset()}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;

export const revision = () => rev;
export const bumpRevision = () => { rev++; cache.clear(); };

export function monthRange(ym) {
  const weeks = monthWeeks(`${ym}-01`);
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] };
}

// 月の表示範囲に重なる全予定・各回（expand と同じ順序）。
export function monthOcc(events, ym) {
  const key = `${ym}|${rev}|${tzKey()}`;
  const hit = cache.get(key);
  if (hit && hit.events === events) { cache.delete(key); cache.set(key, hit); return hit.occ; } // LRU: 最近使った順に並べ直す
  const { from, to } = monthRange(ym);
  const ent = { events, from, to, occ: expand(events, from, to) };
  cache.set(key, ent);
  while (cache.size > MAX_MONTHS) cache.delete(cache.keys().next().value);
  return ent.occ;
}

// 日付キー範囲 [a, b] に重なる予定・各回。範囲が a の月の表示範囲に収まるときは月キャッシュから、収まらないときは直接展開する。
export function occBetween(events, a, b) {
  const ym = a.slice(0, 7), { from, to } = monthRange(ym);
  if (b > to) return expand(events, a, b);
  const occ = monthOcc(events, ym);
  return occ.filter((e) => e.start.slice(0, 10) <= b && e.end.slice(0, 10) >= a);
}

// 日ごとの索引（日付キー → その日に重なる予定。月内の全日）。
export function monthByDay(events, ym) {
  const occ = monthOcc(events, ym), { from, to } = monthRange(ym), out = new Map();
  const ent = cache.get(`${ym}|${rev}|${tzKey()}`);
  if (ent?.byDay) return ent.byDay;
  for (const e of occ) {
    const s = e.start.slice(0, 10) > from ? e.start.slice(0, 10) : from, f = e.end.slice(0, 10) < to ? e.end.slice(0, 10) : to;
    for (let k = s; k <= f; k = nextKey(k)) { let l = out.get(k); if (!l) out.set(k, l = []); l.push(e); }
  }
  if (ent) ent.byDay = out;
  return out;
}
function nextKey(k) {
  const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8)) + 1, 12);
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
