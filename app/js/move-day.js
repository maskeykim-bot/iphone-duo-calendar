// 第19版 D3: 予定を別の日へ移すデータの関数（DOM・ネイティブ呼び出し・DB 書込なしの純粋関数。入力は変更しない）。
// 日数の差は日付の部分だけに足し、時刻の文字列は変えない（ミリ秒では足さない）。繰り返しは「その回だけ」。
import { addDays, dayOf, parseKey } from './util.js';
import { planEdit } from './recur.js';
import { buildExtArgs, extEditable } from './iphone.js';

const dayDelta = (from, to) => Math.round((parseKey(to) - parseKey(from)) / 864e5);
const hm = (iso) => `${Number(iso.slice(11, 13))}:${iso.slice(14, 16)}`;

// つかんだ日→落とした日の日数の差を、開始と終了の日付の部分に足す。複数日は長さを保ち、終日は T00:00〜最終日 T23:59 のまま。
export function shiftTimes(x, fromDay, toDay) {
  const n = dayDelta(fromDay, toDay);
  const sh = (iso) => `${addDays(dayOf(iso), n)}${iso.slice(10)}`;
  return { start: sh(x.start), end: sh(x.end) };
}

// 夏時間の切り替えで無い時刻は、端末のローカル時刻に直る。直ったあとの壁時計。
const settle = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number), h = +iso.slice(11, 13), mi = +iso.slice(14, 16);
  const t = new Date(y, m - 1, d, h, mi);
  const p = (v) => String(v).padStart(2, '0');
  return `${iso.slice(0, 10)}T${p(t.getHours())}:${p(t.getMinutes())}`;
};

// 移したあとの時刻と、変わったときの文（design/30 §2）。終日は変わらない。
export function moveTimes(x, toDay, fromDay = dayOf(x.start)) {
  const raw = shiftTimes(x, fromDay, toDay);
  if (x.all) return { ...raw, note: null };
  const start = settle(raw.start), end = settle(raw.end);
  const ds = start !== raw.start, de = end !== raw.end;
  const note = ds && de ? `夏時間の切り替えのため、時刻を ${hm(start)}〜${hm(end)} にしました。`
    : ds ? `夏時間の切り替えのため、開始を ${hm(start)} にしました。`
    : de ? `夏時間の切り替えのため、終了を ${hm(end)} にしました。` : null;
  return { start, end, note };
}

export const UNDO_CONFLICT_TEXT = 'iPhone のカレンダーで変更されたため、元に戻せませんでした。';

// ---- Duo の予定（繰り返しは planEdit の 'only'）。occ: 移す回（単発は予定そのもの）、occKey: 繰り返しの回の目印（単発は null）。
// 戻り値 { puts, dels, note, after:{start,end}, undo:{occKey, form} }。undo は planMoveDuoUndo へ渡す（戻す回の目印は移す前の回の日時）。
// 同じ日へは移さない（null。design/34 §16-4: 元の日へ落としたら取り消し。繰り返しの回に overrides を作らない）。shifted＝同じ日の中で時刻を動かした（occ はもう動かしたあとの時刻）ときだけ通す。
export function planMoveDuo(p, occ, occKey, toDay, newId, shifted = false) {
  if (!shifted && toDay === dayOf(occ.start)) return null;
  const t = moveTimes(occ, toDay);
  const form = { title: occ.title, categoryId: occ.categoryId, all: !!occ.all, place: occ.place || '', notes: occ.notes || '', ...(occ.alarms !== undefined ? { alarms: occ.alarms } : {}), recurrence: p.recurrence || null, start: t.start, end: t.end };
  const plan = occKey ? planEdit(p, occKey, 'only', form, newId) : planEdit(p, p.start, 'all', form, newId);
  return { ...plan, note: t.note, after: { start: t.start, end: t.end }, undo: { occKey, start: occ.start, end: occ.end } };
}
// 元に戻す。移したあとの予定 p2（puts の結果）と、移した後の回の目印（単発は null）から元の日時へもう一度 planEdit。
// 繰り返しの回は移動後も overrides[occKey]（元の回の目印）に載っているので occKey は同じ。
export function planMoveDuoUndo(p2, occ2, undo, newId) {
  const form = { title: occ2.title, categoryId: occ2.categoryId, all: !!occ2.all, place: occ2.place || '', notes: occ2.notes || '', ...(occ2.alarms !== undefined ? { alarms: occ2.alarms } : {}), recurrence: p2.recurrence || null, start: undo.start, end: undo.end };
  return undo.occKey ? planEdit(p2, undo.occKey, 'only', form, newId) : planEdit(p2, p2.start, 'all', form, newId);
}

// ---- iPhone の予定
// つかめるか。書けない予定・詳細が取れない予定はつかめない（保存直前にネイティブがもう一度確かめる）。
export const canGrabExt = (x, cal, detail) => extEditable(x, cal, detail).editable;

// 移す引数。start/end/all だけを送る（題名・メモは送らない）。変わらなければ null。繰り返しは span:'this'（その回だけ）。
// 戻り値 { args, note, after:{start,end} }。
export function buildMoveExtArgs(before, toDay, detail) {
  const t = moveTimes(before, toDay);
  const args = buildExtArgs(before, { start: t.start, end: t.end, all: !!before.all }, 'only', detail);
  if (!args) return null;
  return { args, note: t.note, after: { start: t.start, end: t.end } };
}
// 元に戻す引数。moved: buildMoveExtArgs の結果、reply: updateExternalEvent の返事（modifiedAt）。
// 回の目印は移す前の回の日時（occurrenceStart）、いまの回は移したあとの開始（currentStart）、expectModified は返事の modifiedAt。
export function buildUndoExtArgs(before, moved, reply, detail) {
  const mod = Number.isFinite(reply?.modifiedAt) ? reply.modifiedAt : null;
  const now = { ...before, start: moved.after.start, end: moved.after.end, rawEnd: before.all ? `${dayOf(moved.after.end)}T00:00` : moved.after.end, modifiedAt: mod, occurrenceDate: before.occurrenceDate || before.start };
  const args = buildExtArgs(now, { start: before.start, end: before.end, all: !!before.all }, 'only', detail);
  if (!args) return null;
  return { ...args, occurrenceStart: before.occurrenceDate || before.start, currentStart: moved.after.start, expectModified: mod, ...(before.all ? { end: before.rawEnd } : {}) };
}
// 戻す直前に読み直した modifiedAt が、移したときの返事と同じか。違えば戻さず UNDO_CONFLICT_TEXT を出す。
export const extUndoAllowed = (expected, current) => Number.isFinite(expected) && Number.isFinite(current) && expected === current;
