// 検索: 正規化（NFKC → 小文字 → カタカナ→ひらがな）と、正規化位置の原文への対応付け。DOM に依存しない。
import { dayOf, daysInMonth, dkey, parseKey } from './util.js';
import { expand, occurrenceAt } from './recur.js';

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
// 検索用の正規化（normalizeMap と同じ結果。対応表を作らず、単位ごとの結果を使い回す）。
const unitCache = new Map();
const ASCII = /^[\x00-\x7f]*$/;
export function normalize(v) {
  const s = String(v ?? '');
  if (ASCII.test(s)) return s.toLowerCase();
  let norm = '';
  const chars = [...s];
  for (let i = 0; i < chars.length;) {
    let unit = chars[i++];
    while (i < chars.length && MARK.test(chars[i])) unit += chars[i++];
    let n = unitCache.get(unit);
    if (n === undefined) { n = normUnit(unit); if (unitCache.size > 20000) unitCache.clear(); unitCache.set(unit, n); }
    norm += n;
  }
  return norm;
}
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

// 親予定の正規化結果は、元の文字列が同じ間だけ使い回す（編集で親が置き換わると別オブジェクトになる）。
const normCache = new WeakMap();
const fieldsOf = (e) => {
  const c = normCache.get(e);
  if (c && c.t === e.title && c.n === e.notes && c.p === e.place) return c.f;
  const f = [normalize(e.title), normalize(e.notes), normalize(e.place)];
  normCache.set(e, { t: e.title, n: e.notes, p: e.place, f });
  return f;
};
const matches = (f, ts) => ts.every((t) => f.some((x) => x.includes(t)));
const collator = new Intl.Collator();
const byStartId = (a, b) => (a.start === b.start ? collator.compare(String(a.id), String(b.id)) : (a.start < b.start ? -1 : 1));

// 戻り値: { items（開始日時昇順・同時刻はID順・最大LIMIT件）, total, capped, range }
// 親予定ごとに1回だけ一致判定し、一致した親だけ展開する。個別変更（overrides）の回は、変更後の項目で別に判定する。
export function searchEvents(events, query, today, extra = []) {
  const ts = terms(query);
  const range = searchRange(today);
  if (!ts.length) return { items: [], total: 0, capped: false, range, ts };
  const { from, to } = range, hits = [];
  const inRange = (e) => dayOf(e.start) <= to && dayOf(e.end) >= from;
  for (const p of events) {
    if (!p.recurrence) { if (inRange(p) && matches(fieldsOf(p), ts)) hits.push(p); continue; }
    if (matches(fieldsOf(p), ts)) {
      for (const o of expand([p], from, to)) if (!o.moved || matches([normalize(o.title), normalize(o.notes), normalize(o.place)], ts)) hits.push(o);
    } else {
      // 親が一致しなくても、個別変更で一致する回があれば拾う（除外日は出さない）。
      const ex = new Set(p.exdates || []);
      for (const key of Object.keys(p.overrides || {})) {
        if (ex.has(key)) continue;
        const o = occurrenceAt(p, key);
        if (inRange(o) && matches([normalize(o.title), normalize(o.notes), normalize(o.place)], ts)) hits.push(o);
      }
    }
  }
  hits.push(...extra); // 外部（iPhone）予定: 呼び出し側で同じ正規化・AND・範囲で絞り済み
  hits.sort(byStartId);
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
