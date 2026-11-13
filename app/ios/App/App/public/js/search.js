// 検索: 正規化（NFKC → 小文字 → カタカナ→ひらがな）と、正規化位置の原文への対応付け。DOM に依存しない。
import { dayOf, daysInMonth, dkey, parseKey } from './util.js';
import { expand } from './recur.js';

export const LIMIT = 200;
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const normUnit = (s) => kata2hira(s.normalize('NFKC').toLowerCase());
const MARK = /^[̀-゙゚ͯﾞﾟ]$/;

// 原文を「基底文字＋結合・濁点類」の単位に分けて正規化し、正規化文字列の各位置が指す原文範囲を返す。
export function normalizeMap(src) {
  let norm = '';
  const map = []; // 正規化の1文字ごとに [原文開始, 原文終了)
  const chars = [...src];
  let pos = 0;
  for (let i = 0; i < chars.length;) {
    let unit = chars[i++];
    while (i < chars.length && MARK.test(chars[i])) unit += chars[i++];
    const n = normUnit(unit);
    for (let j = 0; j < n.length; j++) map.push([pos, pos + unit.length]);
    norm += n;
    pos += unit.length;
  }
  return { norm, map };
}
export const normalize = (s) => normalizeMap(String(s ?? '')).norm;
export const terms = (q) => normalize(q).split(/\s+/).filter(Boolean);

// 原文中の一致範囲（重なりは結合済み）。
export function findRanges(src, ts) {
  const { norm, map } = normalizeMap(String(src ?? ''));
  const rs = [];
  for (const t of ts) {
    for (let i = norm.indexOf(t); i >= 0; i = norm.indexOf(t, i + t.length)) rs.push([map[i][0], map[i + t.length - 1][1]]);
  }
  rs.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else out.push([...r]);
  }
  return out;
}

// 必ず esc してから <mark> を挿入する。
export function highlight(src, ts, esc) {
  const s = String(src ?? '');
  let html = '', at = 0;
  for (const [a, b] of findRanges(s, ts)) { html += esc(s.slice(at, a)) + `<mark>${esc(s.slice(a, b))}</mark>`; at = b; }
  return html + esc(s.slice(at));
}

// 一致前後40文字の抜粋（改行は空白に）。
export function excerpt(src, ts, radius = 40) {
  const s = String(src ?? '').replace(/\s*\n\s*/g, ' ');
  const r = findRanges(s, ts);
  if (!r.length) return '';
  const a = Math.max(0, r[0][0] - radius), b = Math.min(s.length, r[0][1] + radius);
  return `${a > 0 ? '…' : ''}${s.slice(a, b)}${b < s.length ? '…' : ''}`;
}

// 検索範囲: 今日の前1年〜後2年（両端含む）。2/29 の年差だけ 2/28 に丸める。
export function searchRange(today) {
  const d = parseKey(today), y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  const at = (yy) => dkey(new Date(yy, m, Math.min(day, daysInMonth(yy, m)), 12));
  return { from: at(y - 1), to: at(y + 2) };
}

// 戻り値: { items（開始日時昇順・同時刻はID順・最大LIMIT件）, total, capped, range }
export function searchEvents(events, query, today) {
  const ts = terms(query);
  const range = searchRange(today);
  if (!ts.length) return { items: [], total: 0, capped: false, range, ts };
  const hits = expand(events, range.from, range.to).filter((e) => {
    const fields = [normalize(e.title), normalize(e.notes), normalize(e.place)];
    return ts.every((t) => fields.some((f) => f.includes(t)));
  });
  hits.sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)));
  return { items: hits.slice(0, LIMIT), total: hits.length, capped: hits.length > LIMIT, range, ts };
}
export const groupByDay = (items) => {
  const g = [];
  for (const e of items) {
    const k = dayOf(e.start);
    if (!g.length || g[g.length - 1].key !== k) g.push({ key: k, items: [] });
    g[g.length - 1].items.push(e);
  }
  return g;
};
