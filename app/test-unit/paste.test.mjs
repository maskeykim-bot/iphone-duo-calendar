import test from 'node:test';
import assert from 'node:assert/strict';
import { PASTE_MAX, planPaste, shiftTo, clipTitle, bandLabel, toggleDay, addDaysCapped, daysBetween, spanOf, pasteLabel } from '../js/paste.js';
import { occurrenceAt } from '../js/recur.js';
import { toDisplay } from '../js/iphone.js';

let n = 0;
const ctxOf = (o = {}) => ({ cals: [], enabled: true, destCalendarId: '', defaultCatId: () => 'cat-def', newId: () => `id${++n}`, pastedAt: 1000, ...o });
const cal = (id, w = true, extra = {}) => ({ id, allowsModify: w, ...extra });
const duo = (o = {}) => ({ id: 'd1', title: 'T', categoryId: 'c9', all: false, start: '2026-11-02T09:00', end: '2026-11-02T10:00', place: 'P', notes: 'N', recurrence: null, exdates: [], overrides: {}, alarms: [{ before: 10 }], ...o });
const ext = (raw, c) => toDisplay({ id: 'x1', itemId: 'i', externalId: 'e', eventId: 'v', calendarId: 'k1', ...raw }, c);

test('31 は可、32 は不可、重複日は1つ、入力は不変', () => {
  const days = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
  const src = duo(), snap = JSON.stringify(src), dsnap = JSON.stringify(days);
  const r = planPaste(src, [...days, days[0]], ctxOf());
  assert.equal(PASTE_MAX, 31);
  assert.ok(r.ok); assert.equal(r.items.length, 31);
  assert.equal(planPaste(src, [...days, '2027-01-01'], ctxOf()).error, 'too-many');
  assert.equal(planPaste(src, [], ctxOf()).ok, false);
  assert.equal(planPaste(src, ['2026-02-30'], ctxOf()).ok, false);
  assert.equal(JSON.stringify(src), snap); assert.equal(JSON.stringify(days), dsnap);
});

test('Duoだけ→Duoだけ・単発・新id・updatedAt共通・通知は複製', () => {
  const src = duo({ nativeLink: { state: 'unlinked' } });
  const r = planPaste(src, ['2026-11-10', '2026-11-12'], ctxOf({ cals: [cal('c1', true, { isDefault: true })] }));
  assert.equal(r.kind, 'duo');
  const [a, b] = r.items.map((i) => i.event);
  assert.notEqual(a.id, b.id); assert.notEqual(a.id, src.id);
  assert.equal(a.start, '2026-11-10T09:00'); assert.equal(a.end, '2026-11-10T10:00');
  assert.deepEqual([a.recurrence, a.exdates, a.overrides, a.nativeLink], [null, [], {}, undefined]);
  assert.equal(a.updatedAt, 1000); assert.equal(b.updatedAt, 1000);
  assert.deepEqual(a.alarms, [{ before: 10 }]); assert.notEqual(a.alarms, src.alarms);
  assert.equal(a.categoryId, 'c9'); assert.equal(r.items[0].native, undefined);
});

test('alarms 欠落は []（既定通知を足さない）', () => {
  const s = duo(); delete s.alarms;
  assert.deepEqual(planPaste(s, ['2026-11-10'], ctxOf()).items[0].event.alarms, []);
});

test('linked：元のカレンダー→設定既定→OS既定→先頭、不可・連携offはDuoだけ', () => {
  const src = duo({ nativeLink: { state: 'linked', calendarId: 'c2', requestId: 'r' } });
  const cals = [cal('c1'), cal('c2'), cal('c3', true, { isDefault: true })];
  const pick = (o) => planPaste(src, ['2026-11-10'], ctxOf(o));
  assert.equal(pick({ cals }).calendarId, 'c2');
  assert.equal(pick({ cals: [cal('c1'), cal('c2', false), cal('c3', true, { isDefault: true })], destCalendarId: 'c1' }).calendarId, 'c1');
  assert.equal(pick({ cals: [cal('c1'), cal('c2', false), cal('c3', true, { isDefault: true })], destCalendarId: 'gone' }).kind, 'duo');
  assert.equal(pick({ cals: [cal('c1'), cal('c2', false), cal('c3')] }).kind, 'duo'); // 元が書けず設定の追加先も無ければ Duo のまま
  for (const o of [{ cals: [cal('c2', false)] }, { cals, enabled: false }, { cals: [] }]) assert.equal(pick(o).kind, 'duo');
  const r = pick({ cals }), it = r.items[0];
  assert.equal(r.kind, 'linked');
  assert.deepEqual(it.event.nativeLink, { state: 'pending', requestId: it.native.requestId, calendarId: 'c2' });
  assert.equal(it.native.calendarId, 'c2'); assert.equal(it.native.recurrence, undefined);
});

test('linked の終日は native の end が最終日T00:00', () => {
  const src = duo({ all: true, start: '2026-11-02T00:00', end: '2026-11-04T23:59', nativeLink: { state: 'linked', calendarId: 'c1' } });
  const it = planPaste(src, ['2026-11-30'], ctxOf({ cals: [cal('c1')] })).items[0];
  assert.deepEqual([it.event.start, it.event.end], ['2026-11-30T00:00', '2026-12-02T23:59']);
  assert.equal(it.native.end, '2026-12-02T00:00');
});

test('書けるext→同じiPhone先だけ（Duoに持たない・URL等を渡さない）', () => {
  const x = ext({ title: 'E', start: '2026-11-02T09:00', end: '2026-11-02T10:00', url: 'https://x', occurrenceDate: '2026-11-02T09:00', recurring: true }, { title: 'k' });
  const r = planPaste(x, ['2026-11-10'], ctxOf({ cals: [cal('k1')] }));
  assert.equal(r.kind, 'ext'); assert.equal(r.calendarId, 'k1');
  const it = r.items[0];
  assert.equal(it.event, undefined);
  assert.deepEqual(it.native.copyFrom, { occurrenceStart: '2026-11-02T09:00', currentStart: '2026-11-02T09:00', itemId: 'i', externalId: 'e', eventId: 'v' });
  assert.equal(JSON.stringify(it).includes('https://x'), false);
  assert.deepEqual([it.native.start, it.native.end, it.native.all], ['2026-11-10T09:00', '2026-11-10T10:00', false]);
});

test('読取専用ext→Duo（題名・終日・日時だけ、既定カテゴリ、通知[]、iPhone追加なし）', () => {
  const x = ext({ title: 'H', start: '2026-11-03', end: '2026-11-03', all: true, place: 'z', notes: 'n' }, { title: 'k' });
  for (const cals of [[cal('k1', false), cal('other')], [], [cal('other')]]) {
    const r = planPaste(x, ['2026-11-10'], ctxOf({ cals }));
    assert.equal(r.kind, 'ext-ro');
    const e = r.items[0].event;
    assert.deepEqual([e.title, e.all, e.start, e.end, e.categoryId, e.place, e.notes, e.alarms, e.nativeLink], ['H', true, '2026-11-10T00:00', '2026-11-10T23:59', 'cat-def', '', '', [], undefined]);
    assert.equal(r.items[0].native, undefined);
  }
  assert.equal(planPaste(x, ['2026-11-10'], ctxOf({ cals: [cal('k1')], enabled: false })).kind, 'ext-ro');
});

test('shiftTo：月末・閏日・年またぎ・日またぎ・複数日終日', () => {
  assert.deepEqual(shiftTo({ start: '2026-11-02T22:00', end: '2026-11-03T02:00' }, '2028-02-29'), { start: '2028-02-29T22:00', end: '2028-03-01T02:00', all: false });
  assert.deepEqual(shiftTo({ start: '2026-11-02T00:00', end: '2026-11-04T23:59', all: true }, '2026-12-30'), { start: '2026-12-30T00:00', end: '2027-01-01T23:59', all: true });
  assert.equal(shiftTo({ start: '2026-11-02T09:00', end: '2026-11-02T10:00' }, '2026-12-31').end, '2026-12-31T10:00');
  assert.equal(shiftTo({ start: '2026-11-02', end: '2026-11-04', all: true }, '2026-02-27', 'native').end, '2026-03-01T00:00');
});

test('NY DST：日数差は暦日で保つ（3月8日・11月1日をまたぐ）', () => {
  const t = { start: '2026-03-06T23:00', end: '2026-03-09T01:00' };
  assert.deepEqual(shiftTo(t, '2026-03-07'), { start: '2026-03-07T23:00', end: '2026-03-10T01:00', all: false });
  assert.equal(shiftTo({ start: '2026-10-30T10:00', end: '2026-11-02T11:00' }, '2026-03-05').end, '2026-03-08T11:00');
  assert.equal(shiftTo({ start: '2026-03-01T10:00', end: '2026-03-02T11:00' }, '2026-11-01').end, '2026-11-02T11:00');
});

test('翌0時終わりの長さ保持（extはrawEnd）と3日帯は開始基準', () => {
  const x = ext({ start: '2026-11-02T22:00', end: '2026-11-03T00:00' }, { title: 'k' });
  assert.equal(x.end, '2026-11-02T23:59'); // 表示用の end は使わない
  const ro = planPaste(x, ['2026-11-10'], ctxOf({ cals: [] })).items[0].event;
  assert.deepEqual([ro.start, ro.end], ['2026-11-10T22:00', '2026-11-11T00:00']);
  const ex = planPaste(x, ['2026-11-10'], ctxOf({ cals: [cal('k1')] })).items[0].native;
  assert.deepEqual([ex.start, ex.end], ['2026-11-10T22:00', '2026-11-11T00:00']);
  const band = duo({ all: true, start: '2026-11-02T00:00', end: '2026-11-04T23:59' });
  const e = planPaste(band, ['2026-11-20'], ctxOf()).items[0].event; // どの日を押しても開始日基準
  assert.deepEqual([e.start, e.end], ['2026-11-20T00:00', '2026-11-22T23:59']);
});

test('変更済みの回は変更後の単発・親の通知は継承', () => {
  const p = duo({ id: 'p', recurrence: { freq: 'daily', interval: 1 }, alarms: [{ before: 5 }], overrides: { '2026-11-03T09:00': { title: 'M', start: '2026-11-03T13:00', end: '2026-11-03T14:30', place: 'q', notes: '' } } });
  const occ = occurrenceAt(p, '2026-11-03T09:00');
  const e = planPaste(occ, ['2026-11-20'], ctxOf()).items[0].event;
  assert.deepEqual([e.title, e.start, e.end, e.place, e.recurrence, e.overrides, e.alarms], ['M', '2026-11-20T13:00', '2026-11-20T14:30', 'q', null, {}, [{ before: 5 }]]);
  assert.equal(e.parentId, undefined); assert.equal(e.occKey, undefined); assert.equal(e.recurring, undefined);
  // 繰り返しの回が linked の親の結びつきを持つとき（ctx.srcLink）
  const lk = planPaste(occurrenceAt({ ...p, overrides: {} }, '2026-11-04T09:00'), ['2026-11-20'], ctxOf({ cals: [cal('c1')], srcLink: { state: 'linked', calendarId: 'c1' } }));
  assert.equal(lk.kind, 'linked');
});

test('通常予定の追加既定にコピー先が左右されない（planPaste は入力・既定を変えない）', () => {
  const cals = [cal('c1', true, { isDefault: true }), cal('c2')];
  const ctx = ctxOf({ cals, destCalendarId: 'c1' });
  planPaste(duo({ nativeLink: { state: 'linked', calendarId: 'c2' } }), ['2026-11-10'], ctx);
  assert.equal(ctx.destCalendarId, 'c1'); assert.deepEqual(cals.map((c) => c.id), ['c1', 'c2']);
});

// ---- PR33: コピー開始と貼る日の選択 ----
test('題名は8字を超えたら…で省く／帯の文言は単日と複数日で分ける', () => {
  assert.equal(clipTitle('12345678'), '12345678');
  assert.equal(clipTitle('123456789'), '12345678…');
  assert.equal(clipTitle('撮影'), '撮影');
  assert.deepEqual(bandLabel({ title: '撮影', start: '2026-11-02T09:00', end: '2026-11-02T10:00' }), { text: '「撮影」を貼る日を選択', sub: '', multi: false });
  const m = bandLabel({ title: '出張', all: true, start: '2026-11-02T00:00', end: '2026-11-04T23:59' });
  assert.equal(m.text, '「出張」（3日間）を貼る日を選択'); assert.equal(m.sub, '選んだ日から始まります'); assert.ok(m.multi);
  assert.equal(spanOf({ start: '2026-11-02T22:00', end: '2026-11-03T01:00' }), 2);
  assert.equal(pasteLabel(0), '貼り付け'); assert.equal(pasteLabel(3), '3日に貼り付け');
});

test('日の切替: 追加・解除・31で満杯（32日目は変えない）・昇順', () => {
  let d = [];
  for (const k of ['2026-11-12', '2026-11-03']) d = toggleDay(d, k).days;
  assert.deepEqual(d, ['2026-11-03', '2026-11-12']);
  assert.deepEqual(toggleDay(d, '2026-11-03').days, ['2026-11-12']);
  const all = daysBetween('2026-12-01', '2026-12-31');
  assert.equal(all.length, 31);
  const r = toggleDay(all, '2027-01-01');
  assert.ok(r.full); assert.equal(r.changed, false); assert.equal(r.days.length, 31);
  assert.equal(toggleDay(all, '2026-12-05').days.length, 30);
});

test('なぞり選択の追加は上限まで、逆順の範囲も昇順、月・閏日をまたぐ', () => {
  assert.deepEqual(daysBetween('2028-03-01', '2028-02-28'), ['2028-02-28', '2028-02-29', '2028-03-01']);
  const base = daysBetween('2026-11-01', '2026-11-30');
  const r = addDaysCapped(base, ['2026-12-01', '2026-12-02', '2026-12-03']);
  assert.equal(r.days.length, 31); assert.equal(r.added, 1); assert.ok(r.full);
  assert.equal(addDaysCapped(base, ['2026-11-05']).added, 0);
});
