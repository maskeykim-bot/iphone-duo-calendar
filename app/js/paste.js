// コピーした予定の「型紙」と貼付計画（純粋関数。DOM・DB・ネイティブに触れない）。
// 計画は入力を変更しない。実際の書込み（DB・createEvents）は後続の PR が行う。
import { addDays, dayOf, isKey, parseKey } from './util.js';
import { pickAddCal } from './iphone.js';

export const PASTE_MAX = 31; // 一度に貼れる日数

const dayDiff = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);

// 型紙 tpl={start,end,all} の開始日を day へ動かす。日数差は暦日で数え（ミリ秒で足さない）、時刻は保つ。
// form: 'duo'＝アプリ内形式（終日の終わりは最終日 T23:59）／'native'＝ネイティブ規約（終日の終わりは最終日 T00:00）。
export function shiftTo(tpl, day, form = 'duo') {
  const s0 = String(tpl.start), e0 = String(tpl.end ?? tpl.start);
  const dd = Math.max(0, dayDiff(dayOf(e0), dayOf(s0)));
  const endDay = dd === 0 ? day : addDays(day, dd);
  if (tpl.all) return { start: `${day}T00:00`, end: `${endDay}T${form === 'native' ? '00:00' : '23:59'}`, all: true };
  const start = `${day}T${s0.slice(11)}`;
  let end = `${endDay}T${e0.slice(11)}`;
  if (end < start) end = start;
  return { start, end, all: false };
}

const isExt = (src) => src?.origin === 'iphone';
const calOf = (cals, id) => (cals || []).find((c) => c.id === id);

// 貼付先の決定。kind: 'duo'（Duoだけ）／'linked'（Duo＋iPhone）／'ext'（iPhoneだけ。Duoには持たない）／'ext-ro'（読取専用extをDuoへ）
export function pasteTarget(src, ctx) {
  const cals = ctx.cals || [], on = !!ctx.enabled;
  if (isExt(src)) {
    const c = on ? calOf(cals, src.calId) : null;
    return c?.allowsModify ? { kind: 'ext', calendarId: c.id } : { kind: 'ext-ro', calendarId: '' };
  }
  const l = src.nativeLink || ctx.srcLink;
  if (l?.state === 'linked' && on) {
    const id = pickAddCal(cals, l.calendarId, ctx.defaultCalendarId);
    if (id) return { kind: 'linked', calendarId: id };
  }
  return { kind: 'duo', calendarId: '' };
}

// src: Duoの予定（繰り返しは occurrenceAt 後の回。nativeLink は src か ctx.srcLink）または toDisplay の ext。
// days: 貼る日（YYYY-MM-DD）。ctx={cals,enabled,defaultCalendarId,defaultCatId:()=>id,newId:()=>id,pastedAt:number}。
// 戻り値 { ok, error?, kind, calendarId, items:[{day, event?, native?}] }。event は Duo に書く予定、native は createEvents の要素。
export function planPaste(src, days, ctx) {
  const list = [...new Set(Array.isArray(days) ? days : [])];
  if (!list.length || !list.every(isKey)) return { ok: false, error: 'invalid-days', items: [] };
  if (list.length > PASTE_MAX) return { ok: false, error: 'too-many', items: [] };
  list.sort();
  const t = pasteTarget(src, ctx);
  const items = list.map((day) => {
    if (t.kind === 'ext') {
      const r = shiftTo({ start: src.start, end: src.rawEnd || src.end, all: src.all }, day, 'native');
      const from = { occurrenceStart: src.occurrenceDate || src.start, currentStart: src.start };
      for (const k of ['itemId', 'externalId', 'eventId']) if (src[k]) from[k] = String(src[k]);
      return { day, native: { requestId: ctx.newId(), copyFrom: from, start: r.start, end: r.end, all: r.all } };
    }
    const ro = t.kind === 'ext-ro';
    const r = shiftTo({ start: src.start, end: ro ? src.rawEnd || src.end : src.end, all: src.all }, day, 'duo');
    const ev = {
      id: ctx.newId(), title: src.title, categoryId: ro ? ctx.defaultCatId() : src.categoryId, all: r.all, start: r.start, end: r.end,
      place: ro ? '' : src.place || '', notes: ro ? '' : src.notes || '', recurrence: null, exdates: [], overrides: {},
      alarms: !ro && Array.isArray(src.alarms) ? src.alarms.map((a) => ({ ...a })) : [], updatedAt: ctx.pastedAt,
    };
    if (t.kind !== 'linked') return { day, event: ev };
    ev.nativeLink = { state: 'pending', requestId: ctx.newId(), calendarId: t.calendarId };
    const native = { requestId: ev.nativeLink.requestId, calendarId: t.calendarId, title: ev.title, start: ev.start, end: ev.all ? `${dayOf(ev.end)}T00:00` : ev.end, all: ev.all, place: ev.place, notes: ev.notes, alarms: ev.alarms.map((a) => ({ ...a })) };
    return { day, event: ev, native };
  });
  return { ok: true, kind: t.kind, calendarId: t.calendarId, items };
}
