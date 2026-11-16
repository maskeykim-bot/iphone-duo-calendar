// 第15版 PR15: 日時編集の状態と計算（丸めない・長さ維持・暦日差・終日往復・外部予定の rawEnd）
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, stateFromInput, setStartTime, setStartDate, setEndTime, setEndDate, pickEndDate, setDuration, setAll, unchanged, resultPair, isoFromInput, inputFromIso, endDayOffset } from '../js/datetime.js';
import { toDisplay, buildExtArgs } from '../js/iphone.js';

const mk = (start, end, all = false) => makeState({ start, end, all });

test('入力の読み書きは丸めない（10:07 のまま）', () => {
  assert.equal(isoFromInput('2026/11/12 10:07', false), '2026-11-12T10:07');
  assert.equal(inputFromIso('2026-11-12T10:07', false), '2026/11/12 10:07');
  assert.equal(isoFromInput('2026/02/30 10:00', false), null);
  assert.equal(isoFromInput('2026/11/12 24:00', false), null);
  const st = stateFromInput('2026/11/12 10:07', '2026/11/12 11:43', false);
  assert.ok(unchanged(st));
  assert.equal(resultPair(st), null);
});

test('開始の時刻変更は長さを保ち、時だけの変更は分を保つ', () => {
  let st = mk('2026-11-12T10:07', '2026-11-12T11:43');
  st = setStartTime(st, 14, null);
  assert.equal(st.start, '2026-11-12T14:07');
  assert.equal(st.end, '2026-11-12T15:43');
  assert.deepEqual(resultPair(st), { start: '2026-11-12T14:07', end: '2026-11-12T15:43', all: false });
  assert.ok(st.touched.startHour && !st.touched.startMin);
  assert.equal(setStartTime(mk('2026-11-12T23:00', '2026-11-13T01:00'), 22, 30).end, '2026-11-13T00:30');
});

test('開始時刻の変更で日跨ぎ・年末・閏日', () => {
  assert.equal(setStartTime(mk('2026-12-31T22:00', '2026-12-31T23:00'), 23, 30).end, '2027-01-01T00:30');
  assert.equal(setStartTime(mk('2028-02-28T22:00', '2028-02-28T23:00'), 23, 30).end, '2028-02-29T00:30');
  assert.equal(setStartTime(mk('2026-11-12T23:00', '2026-11-13T01:00'), 23, 0).touched.startMin, false);
});

test('開始の日付変更は暦日差の複数日を保つ（月末・年末・閏日）', () => {
  let st = setStartDate(mk('2026-11-12T10:00', '2026-11-14T09:30'), '2026-12-30');
  assert.equal(st.start, '2026-12-30T10:00');
  assert.equal(st.end, '2027-01-01T09:30');
  st = setStartDate(mk('2027-02-27T10:00', '2027-03-01T11:00'), '2028-02-27');
  assert.equal(st.end, '2028-02-29T11:00');
  assert.equal(setStartDate(mk('2026-11-12T10:00', '2026-11-12T11:00'), '2026-11-30').end, '2026-11-30T11:00');
  assert.equal(setStartDate(mk('2026-11-12T10:00', '2026-11-12T11:00'), 'bad').start, '2026-11-12T10:00');
});

test('夏時間の日でも壁時計の長さと暦日差を保つ', () => {
  // 米国 2026-03-08 は 2:00→3:00。壁時計で扱うので日数・時刻は崩れない。
  const st = setStartDate(mk('2026-03-07T22:00', '2026-03-08T04:00'), '2026-03-08');
  assert.equal(st.start, '2026-03-08T22:00');
  assert.equal(st.end, '2026-03-09T04:00');
  assert.equal(endDayOffset(st), 1);
  assert.equal(setStartTime(mk('2026-11-01T00:30', '2026-11-01T03:30'), 1, 30).end, '2026-11-01T04:30');
});

test('終了時刻が開始より前なら日付を進め、明示的な終了日で開始前は拒否', () => {
  let st = setEndTime(mk('2026-11-12T22:00', '2026-11-12T23:00'), 1, 0);
  assert.equal(st.end, '2026-11-13T01:00');
  assert.ok(st.touched.endDate);
  const r = setEndDate(mk('2026-11-12T10:00', '2026-11-12T11:00'), '2026-11-11');
  assert.ok(r.error);
  assert.equal(setEndDate(mk('2026-11-12T10:00', '2026-11-12T11:00'), '2026-11-14').end, '2026-11-14T11:00');
  assert.ok(setEndDate(mk('2026-11-12T12:00', '2026-11-12T13:00'), '2026-11-12').end === '2026-11-12T13:00');
  assert.equal(setDuration(mk('2026-11-12T23:00', '2026-11-12T23:30'), 120).end, '2026-11-13T01:00');
});

test('終日 ON/OFF で元の時刻（10:07）に戻る。元が終日なら 10:00〜11:00', () => {
  let st = mk('2026-11-12T10:07', '2026-11-13T11:43');
  const on = setAll(st, true);
  assert.deepEqual([on.start, on.end, on.all], ['2026-11-12T00:00', '2026-11-13T23:59', true]);
  const off = setAll(on, false);
  assert.equal(off.start, '2026-11-12T10:07');
  assert.equal(off.end, '2026-11-13T11:43');
  assert.ok(unchanged(off) && resultPair(off) === null);
  const a = setAll(mk('2026-11-12T00:00', '2026-11-12T23:59', true), false);
  assert.deepEqual([a.start, a.end], ['2026-11-12T10:00', '2026-11-12T11:00']);
});

const CAL = { id: 'c1', title: '仕事', source: 'iCloud', sourceType: 'caldav', color: '#112233', allowsModify: true };
const raw = (o = {}) => ({ id: 'e1', eventId: 'e1', itemId: 'it', externalId: 'ex', calendarId: 'c1', title: '定例', start: '2026-11-18T10:07', end: '2026-11-18T11:00', all: false, recurring: false, modifiedAt: 1, occurrenceDate: null, ...o });
const DET = { allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, editable: true, reason: null, seriesStart: '2026-11-18T10:07', alarms: [{ relativeOffset: -600 }], alarmsExtra: 0 };

test('外部予定: 無操作は送らず、rawEnd（翌日 00:00）は上書きされない', () => {
  const b = toDisplay(raw({ start: '2026-11-18T22:07', end: '2026-11-19T00:00' }), CAL);
  assert.equal(b.end, '2026-11-18T23:59');
  const st = makeState({ start: b.start, end: b.end, all: b.all, rawEnd: b.rawEnd });
  assert.equal(st.orig.rawEnd, '2026-11-19T00:00');
  assert.equal(resultPair(st), null);
  const after = { title: b.title, place: b.place, notes: b.notes, start: st.start, end: st.end, all: st.all, calendarId: b.calId };
  assert.equal(buildExtArgs(b, after, 'only', DET), null);
  // 開始の日付だけ変更でも、通知（alarms）は未操作なら送られない
  const moved = setStartDate(st, '2026-11-20');
  const a2 = buildExtArgs(b, { ...after, start: moved.start, end: moved.end }, 'only', DET);
  assert.equal(a2.start, '2026-11-20T22:07');
  assert.equal('alarms' in a2, false);
});

test('外部予定: 時だけの変更は元の分を保った start/end を一組で送り、通知は送らない', () => {
  const b = toDisplay(raw(), CAL);
  const st = setStartTime(makeState({ start: b.start, end: b.end, all: false, rawEnd: b.rawEnd }), 13, null);
  const args = buildExtArgs(b, { title: b.title, place: b.place, notes: b.notes, start: st.start, end: st.end, all: st.all, calendarId: b.calId }, 'only', DET);
  assert.equal(args.start, '2026-11-18T13:07');
  assert.equal(args.end, '2026-11-18T13:60'.replace('13:60', '14:00'));
  assert.equal(args.all, false);
  assert.equal('alarms' in args, false);
});

test('PR17: 終了日を選ぶ。開始より前は無視、同じ日で終了が開始より前なら開始にそろえる', () => {
  const st = mk('2026-11-12T14:00', '2026-11-13T09:00');
  assert.equal(pickEndDate(st, '2026-11-11'), st);
  const same = pickEndDate(st, '2026-11-12');
  assert.equal(same.end, '2026-11-12T14:00');
  assert.equal(pickEndDate(st, '2026-11-15').end, '2026-11-15T09:00');
  assert.equal(pickEndDate(mk('2026-11-12T00:00', '2026-11-12T23:59', true), '2026-11-14').end, '2026-11-14T23:59');
});
