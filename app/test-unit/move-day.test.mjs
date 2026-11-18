import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftTimes, moveTimes, planMoveDuo, planMoveDuoUndo, buildMoveExtArgs, buildUndoExtArgs, extUndoAllowed, canGrabExt } from '../js/move-day.js';
import { toDisplay } from '../js/iphone.js';
import { occurrenceAt, expand } from '../js/recur.js';

const NY = Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York';
const CAL = { id: 'c1', title: '仕事', source: 'iCloud', sourceType: 'caldav', color: '#112233', allowsModify: true };
const DET = (o = {}) => ({ allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, editable: true, reason: null, seriesStart: '2026-11-04T09:00', alarms: [], ...o });
const raw = (o = {}) => ({ id: 'e1', eventId: 'e1', itemId: 'it', externalId: 'ex', calendarId: 'c1', title: '定例', notes: 'メモ', start: '2026-11-18T09:00', end: '2026-11-18T10:00', all: false, recurring: false, modifiedAt: 111, occurrenceDate: null, ...o });

test('日数の差は日付の部分だけ。時刻は同じ・複数日は長さを保つ', () => {
  assert.deepEqual(shiftTimes({ start: '2026-10-31T10:00', end: '2026-10-31T11:00' }, '2026-10-31', '2026-11-01'), { start: '2026-11-01T10:00', end: '2026-11-01T11:00' });
  assert.deepEqual(shiftTimes({ start: '2026-11-18T22:00', end: '2026-11-20T01:00' }, '2026-11-19', '2026-11-25'), { start: '2026-11-24T22:00', end: '2026-11-26T01:00' });
  assert.deepEqual(shiftTimes({ start: '2026-11-18T00:00', end: '2026-11-19T23:59', all: true }, '2026-11-18', '2026-11-17'), { start: '2026-11-17T00:00', end: '2026-11-18T23:59' });
});
test('夏時間: 無い時刻は文を返す（NY のみ）／存在する時刻は null', () => {
  const x = { start: '2027-03-13T02:30', end: '2027-03-13T03:30' };
  const r = moveTimes(x, '2027-03-14');
  if (NY) { assert.equal(r.start, '2027-03-14T03:30'); assert.equal(r.note, '夏時間の切り替えのため、開始を 3:30 にしました。'); } else { assert.equal(r.note, null); assert.equal(r.start, '2027-03-14T02:30'); }
  assert.equal(moveTimes({ start: '2027-03-13T10:00', end: '2027-03-13T11:00' }, '2027-03-14').note, null);
  assert.equal(moveTimes({ start: '2027-03-13T00:00', end: '2027-03-13T23:59', all: true }, '2027-03-14').note, null);
  if (NY) assert.equal(moveTimes({ start: '2027-03-13T02:30', end: '2027-03-13T02:45' }, '2027-03-14').note, '夏時間の切り替えのため、時刻を 3:30〜3:45 にしました。');
});
test('Duo 単発: 日だけ変わり、元に戻すで元の日時', () => {
  const p = { id: 'a', title: 't', categoryId: 'c', all: false, start: '2026-11-18T09:00', end: '2026-11-18T10:00', recurrence: null, exdates: [], overrides: {} };
  const m = planMoveDuo(p, p, null, '2026-11-20', () => 'n');
  assert.equal(m.puts[0].start, '2026-11-20T09:00'); assert.equal(m.puts[0].end, '2026-11-20T10:00');
  const u = planMoveDuoUndo(m.puts[0], m.puts[0], m.undo, () => 'n');
  assert.equal(u.puts[0].start, p.start); assert.equal(u.puts[0].end, p.end);
});
test('Duo 繰り返し: その回だけ例外が1件増え、他の回は変わらない。元に戻せる', () => {
  const p = { id: 'r', title: 't', categoryId: 'c', all: false, start: '2026-11-04T09:00', end: '2026-11-04T10:00', recurrence: { freq: 'weekly', interval: 1, byDay: [3], count: null, until: null }, exdates: [], overrides: {} };
  const key = '2026-11-18T09:00', occ = occurrenceAt(p, key);
  const before = expand([p], '2026-11-01', '2026-11-30').map((o) => o.start);
  const m = planMoveDuo(p, occ, key, '2026-11-20', () => 'n');
  const p2 = m.puts[0];
  assert.equal(Object.keys(p2.overrides).length, 1); assert.equal(p2.start, p.start);
  const after = expand([p2], '2026-11-01', '2026-11-30').map((o) => o.start);
  assert.deepEqual(after.filter((s) => !s.startsWith('2026-11-20')), before.filter((s) => !s.startsWith('2026-11-18')));
  assert.ok(after.includes('2026-11-20T09:00'));
  const occ2 = occurrenceAt(p2, key);
  const u = planMoveDuoUndo(p2, occ2, m.undo, () => 'n');
  assert.deepEqual(expand([u.puts[0]], '2026-11-01', '2026-11-30').map((o) => o.start), before);
});
test('iPhone: start/end/all だけを送る。繰り返しは this。書けない予定はつかめない', () => {
  const b = toDisplay(raw(), CAL);
  const m = buildMoveExtArgs(b, '2026-11-20', DET());
  assert.equal(m.args.start, '2026-11-20T09:00'); assert.equal(m.args.end, '2026-11-20T10:00'); assert.equal(m.args.all, false);
  assert.equal(m.args.span, 'this');
  for (const k of ['title', 'notes', 'place', 'alarms', 'calendarId']) assert.ok(!(k in m.args), k);
  const r = toDisplay(raw({ recurring: true, occurrenceDate: '2026-11-18T09:00' }), CAL);
  const mr = buildMoveExtArgs(r, '2026-11-20', DET({ seriesStart: '2026-11-04T09:00' }));
  assert.equal(mr.args.span, 'this'); assert.equal(mr.args.occurrenceStart, '2026-11-18T09:00');
  assert.equal(canGrabExt(b, CAL, DET({ hasAttendees: true })), false);
  assert.equal(canGrabExt(b, { ...CAL, allowsModify: false }, DET()), false);
  assert.equal(canGrabExt(b, CAL, null), false);
});
test('iPhone 終日: end は含む最終日の 00:00。元に戻す引数は元の回・返事の modifiedAt', () => {
  const b = toDisplay(raw({ all: true, start: '2026-11-18T00:00', end: '2026-11-19T00:00' }), CAL);
  const m = buildMoveExtArgs(b, '2026-11-25', DET());
  assert.equal(m.args.start, '2026-11-25T00:00'); assert.equal(m.args.end, '2026-11-26T00:00'); assert.equal(m.args.all, true);
  const u = buildUndoExtArgs(b, m, { modifiedAt: 222 }, DET());
  assert.equal(u.start, '2026-11-18T00:00'); assert.equal(u.end, '2026-11-19T00:00');
  assert.equal(u.currentStart, '2026-11-25T00:00'); assert.equal(u.expectModified, 222);
  assert.equal(u.occurrenceStart, '2026-11-18T00:00');
});
test('iPhone 戻す: modifiedAt が違えば許さない', () => {
  assert.equal(extUndoAllowed(222, 222), true);
  assert.equal(extUndoAllowed(222, 333), false);
  assert.equal(extUndoAllowed(null, 333), false);
});
