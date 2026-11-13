// iPhone カレンダー連携の純粋ロジック（DOM・ネイティブ呼び出しなし）。
import { addDays, addMonths, dayOf, weekStart } from './util.js';
import { normalize, searchRange, terms } from './search.js';

export const DEFAULTS = { version: 1, enabled: false, calendarIds: [], selectionInitialized: false, defaultCalendarId: null };

export function normSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULTS };
  const ids = Array.isArray(v.calendarIds) ? [...new Set(v.calendarIds.filter((x) => typeof x === 'string' && x))] : [];
  return {
    version: 1,
    enabled: v.enabled === true,
    calendarIds: ids,
    selectionInitialized: v.selectionInitialized === true,
    defaultCalendarId: typeof v.defaultCalendarId === 'string' && v.defaultCalendarId ? v.defaultCalendarId : null,
  };
}

const first = (k) => `${k.slice(0, 8)}01`;
// 表示日を含む月の前月1日〜翌々月1日（下端含まない）。週の表示がはみ出す場合も含める。
export function extRange(key) {
  const m1 = first(key);
  let from = addMonths(m1, -1), to = addMonths(m1, 2);
  const ws = weekStart(key);
  if (ws < from) from = ws;
  if (addDays(ws, 7) > to) to = addDays(ws, 7);
  return { from, to };
}
export const rangeKey = (r, ids) => `${r.from}|${r.to}|${[...ids].sort().join(',')}`;
export const covers = (outer, inner) => !!outer && outer.from <= inner.from && outer.to >= inner.to;
export const stampOf = (k) => `${k}T00:00`;

// ネイティブの予定 → 表示用モデル。終日の end は最終日を含む 00:00 → アプリ内形式の 23:59 に揃える。
export function toDisplay(raw, cal) {
  const all = !!raw.all;
  let start = String(raw.start), end = String(raw.end);
  if (all) { start = `${dayOf(start)}T00:00`; end = `${dayOf(end) < dayOf(start) ? dayOf(start) : dayOf(end)}T23:59`; } else if (end > start && end.endsWith('T00:00') && dayOf(end) !== dayOf(start)) end = `${addDays(dayOf(end), -1)}T23:59`;
  else if (end < start) end = start;
  return {
    id: `ip:${raw.id}`, origin: 'iphone', cat: 'ext', xid: String(raw.id), eventId: raw.eventId == null ? '' : String(raw.eventId), requestId: raw.requestId || null,
    calId: raw.calendarId, calName: cal?.title || '', calSource: cal?.source || '', color: /^#[0-9a-fA-F]{6}$/.test(cal?.color || '') ? cal.color : '#68716a',
    title: String(raw.title || '').trim() ? String(raw.title) : '（無題）', start, end, rawEnd: String(raw.end), all, place: raw.place || '', notes: raw.notes || '', recurring: !!raw.recurring,
  };
}

// アプリ予定に linked で結びついた外部予定を除外する（タイトル・時刻の一致による推測はしない）。
export function dedupe(ext, appEvents) {
  const ids = new Set(), reqs = new Set();
  for (const e of appEvents) {
    const l = e.nativeLink;
    if (l?.state === 'linked' && l.eventId) ids.add(String(l.eventId));
    if (l?.requestId) reqs.add(l.requestId);
  }
  return ext.filter((x) => !(x.eventId && ids.has(x.eventId)) && !(x.requestId && reqs.has(x.requestId)));
}

// 範囲 [a, b]（日キー・両端含む）に重なる外部予定。
export const extIn = (ext, a, b) => ext.filter((e) => dayOf(e.start) <= b && dayOf(e.end) >= a);

export const subLabel = (e) => `iPhone · ${e.calName}`;

// 検索: スナップショットの外部予定を既存と同じ正規化・AND で絞る。
export function searchExt(snapshot, query, today) {
  const ts = terms(query), range = searchRange(today);
  if (!ts.length) return [];
  return snapshot.filter((e) => dayOf(e.start) <= range.to && dayOf(e.end) >= range.from).filter((e) => {
    const fields = [normalize(e.title), normalize(e.notes), normalize(e.place)];
    return ts.every((t) => fields.some((f) => f.includes(t)));
  });
}

// 追加先に選べるカレンダー（書込可）。
export const writable = (cals) => cals.filter((c) => c.allowsModify);

// カレンダー一覧をソース別にグループ化（sourceId → title → id の順、同名 source は sourceType を併記）。
export function groupBySource(cals) {
  const sorted = [...cals].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId)) || String(a.title).localeCompare(String(b.title), 'ja') || String(a.id).localeCompare(String(b.id)));
  const groups = [];
  for (const c of sorted) {
    let g = groups[groups.length - 1];
    if (!g || g.sourceId !== c.sourceId) { g = { sourceId: c.sourceId, source: c.source, sourceType: c.sourceType, items: [] }; groups.push(g); }
    g.items.push(c);
  }
  const names = new Map();
  for (const g of groups) names.set(g.source, (names.get(g.source) || 0) + 1);
  for (const g of groups) g.heading = names.get(g.source) > 1 ? `${g.source}（${g.sourceType}）` : g.source;
  return groups;
}

export const fmtLoaded = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const ymdSlash = (k) => k.replaceAll('-', '/');
// 排他的な to を表示用の最終日にする。
export const lastDay = (to) => addDays(to, -1);
