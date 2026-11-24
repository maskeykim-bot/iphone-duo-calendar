// コピーした予定の「型紙」と貼付計画（純粋関数。DOM・DB・ネイティブに触れない）。
// 計画は入力を変更しない。実際の書込み（DB・createEvents）は後続の PR が行う。
import { addDays, dayOf, isKey, parseKey } from './util.js';

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
    if (c?.allowsModify) return { kind: 'ext', calendarId: c.id };
    // 書けない元は「新しい予定の追加先」の設定に従う（iPhone の書込可能なカレンダーなら Duo＋iPhone、それ以外は Duo だけ）。
    const d = ctx.destCalendarId;
    return on && d && cals.some((x) => x.id === d && x.allowsModify) ? { kind: 'linked', calendarId: d } : { kind: 'ext-ro', calendarId: '' };
  }
  const l = src.nativeLink || ctx.srcLink;
  if (l?.state === 'linked' && on) {
    // 書込可能な元のカレンダー優先。代替のみ設定の追加先（iPhone）→ 表示中の Duo。
    const ok = (id) => id && cals.some((c) => c.id === id && c.allowsModify);
    const id = ok(l.calendarId) ? l.calendarId : ok(ctx.destCalendarId) ? ctx.destCalendarId : '';
    if (id) return { kind: 'linked', calendarId: id };
  }
  return { kind: 'duo', calendarId: '' };
}

// src: Duoの予定（繰り返しは occurrenceAt 後の回。nativeLink は src か ctx.srcLink）または toDisplay の ext。
// days: 貼る日（YYYY-MM-DD）。ctx={cals,enabled,destCalendarId（設定の追加先が iPhone のときだけ id）,destCatId?,catVisible?,defaultCatId:()=>id,newId:()=>id,pastedAt:number}。
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
    const ro = isExt(src) && t.kind !== 'ext'; // 書けない iPhone 予定（題名・日時・場所・メモ・通知を写し、カテゴリは既定）
    const demoted = t.kind === 'duo' && !isExt(src) && (src.nativeLink || ctx.srcLink)?.state === 'linked'; // 元の iPhone カレンダーにも設定の追加先にも書けず Duo のみ
    const r = shiftTo({ start: src.start, end: ro ? src.rawEnd || src.end : src.end, all: src.all }, day, 'duo');
    const ev = {
      id: ctx.newId(), title: src.title, categoryId: ro ? ctx.destCatId || ctx.defaultCatId() : demoted && ctx.catVisible && !ctx.catVisible(src.categoryId) ? ctx.destCatId || ctx.defaultCatId() : src.categoryId, all: r.all, start: r.start, end: r.end,
      place: src.place || '', notes: src.notes || '', recurrence: null, exdates: [], overrides: {},
      alarms: Array.isArray(src.alarms) ? src.alarms.map((a) => ({ ...a })) : [], updatedAt: ctx.pastedAt,
    };
    { const cid = isExt(src) ? ctx.srcColorId : src.colorId; if (typeof cid === 'string' && cid && cid.length <= 40) ev.colorId = cid; } // コピーで作った予定も色を引き継ぐ（design/37 §4.1）
    if (t.kind !== 'linked') return { day, event: ev };
    ev.nativeLink = { state: 'pending', requestId: ctx.newId(), calendarId: t.calendarId };
    const native = { requestId: ev.nativeLink.requestId, calendarId: t.calendarId, title: ev.title, start: ev.start, end: ev.all ? `${dayOf(ev.end)}T00:00` : ev.end, all: ev.all, place: ev.place, notes: ev.notes, alarms: ev.alarms.map((a) => ({ ...a })) };
    return { day, event: ev, native };
  });
  return { ok: true, kind: t.kind, calendarId: t.calendarId, items };
}

// ---------- コピー開始と貼る日の選択（PR33）。DOM・DB・ネイティブに触れない純関数 ----------
// 題名は8字を超えたら「…」で省く。
export const clipTitle = (t, n = 8) => { const a = [...String(t ?? '')]; return a.length > n ? `${a.slice(0, n).join('')}…` : a.join(''); };
// 予定の日数（終わりの日−始まりの日＋1。複数日の帯は2以上）。
export const spanOf = (tpl) => Math.max(1, dayDiff(dayOf(String(tpl.end ?? tpl.start)), dayOf(String(tpl.start))) + 1);
// 帯の文言。複数日は「「出張」（3日間）を貼る日を選択」＋補足、単日は「「撮影」を貼る日を選択」。
export function bandLabel(tpl) {
  const n = spanOf(tpl), t = clipTitle(tpl.title);
  return n > 1 ? { text: `「${t}」（${n}日間）を貼る日を選択`, sub: '選んだ日から始まります', multi: true }
    : { text: `「${t}」を貼る日を選択`, sub: '', multi: false };
}
export const pasteLabel = (n) => (n > 0 ? `${n}日に貼り付け` : '貼り付け');
// 日の集合を1日ぶん切り替える。上限（PASTE_MAX）を超える追加は {full:true} で変えない。戻り値の days は昇順。
export function toggleDay(days, day) {
  const set = new Set(days);
  if (set.has(day)) { set.delete(day); return { days: [...set].sort(), changed: true, full: false }; }
  if (set.size >= PASTE_MAX) return { days: [...set].sort(), changed: false, full: true };
  set.add(day);
  return { days: [...set].sort(), changed: true, full: false };
}
// 複数の日をまとめて足す（なぞり選択）。上限までを足し、あふれたら full:true。足した日数を added に返す。
export function addDaysCapped(days, more) {
  const set = new Set(days);
  let added = 0, full = false;
  for (const d of more) {
    if (set.has(d)) continue;
    if (set.size >= PASTE_MAX) { full = true; break; }
    set.add(d); added++;
  }
  return { days: [...set].sort(), added, full };
}
// from〜to（含む）の日付キー。逆順でも昇順に正規化する。
export function daysBetween(from, to) {
  const [a, b] = from <= to ? [from, to] : [to, from], out = [];
  for (let d = a, i = 0; d <= b && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
}
