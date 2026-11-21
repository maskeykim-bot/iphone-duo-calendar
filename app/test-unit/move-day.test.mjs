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

// 第19.1版 S2（R-49）: 開いた縦の月タブの「時間軸」からの落とし。時間軸の枠は時刻を動かさず日だけ移す（時刻の文字列はそのまま）。
// NY の夏時間が終わる 2026-11-01（1:00〜1:59 が2回ある日）をまたいでも、時刻がずれない。
test('時間軸からの落とし: 2026-11-01（NY 夏時間の終わり）の前後でも時刻の文字列はそのまま', () => {
  for (const [a, b] of [['2026-10-31', '2026-11-01'], ['2026-11-01', '2026-10-31'], ['2026-11-01', '2026-11-02'], ['2026-10-30', '2026-11-03']]) {
    for (const t of ['00:30', '01:30', '02:00', '09:00', '23:30']) {
      const r = moveTimes({ start: `${a}T${t}`, end: `${a}T23:45` > `${a}T${t}` ? `${a}T23:45` : `${a}T23:59` }, b, a);
      assert.equal(r.start, `${b}T${t}`, `${a}→${b} ${t}`);
      assert.equal(r.note, null);
    }
  }
  // 2時間にまたがる枠（1:00〜3:00）も長さ・時刻はそのまま
  const r = moveTimes({ start: '2026-10-31T01:00', end: '2026-10-31T03:00' }, '2026-11-01', '2026-10-31');
  assert.deepEqual([r.start, r.end, r.note], ['2026-11-01T01:00', '2026-11-01T03:00', null]);
});
// 品質レビュー 低-2: NY の夏時間の始まり 2026-03-08（2:00〜2:59 が無い日）をまたいでも、時刻の文字は保ち日付だけ変わる（時刻がずれない）。
test('時間軸からの落とし: 2026-03-08（NY 夏時間の始まり）の前後でも時刻の文字列はそのまま（2:30 のような存在しない時刻も保つ）', () => {
  for (const [a, b] of [['2026-03-07', '2026-03-08'], ['2026-03-08', '2026-03-07'], ['2026-03-08', '2026-03-09'], ['2026-03-06', '2026-03-10']]) {
    for (const t of ['00:30', '01:59', '03:00', '09:00', '23:30']) {
      const r = moveTimes({ start: `${a}T${t}`, end: `${a}T23:59` }, b, a);
      assert.equal(r.start, `${b}T${t}`, `${a}→${b} ${t}`);
      assert.equal(r.end, `${b}T23:59`, `${a}→${b} end`);
      assert.equal(r.note, null);
    }
  }
  const r = moveTimes({ start: '2026-03-07T01:00', end: '2026-03-07T04:00' }, '2026-03-08', '2026-03-07');
  assert.deepEqual([r.start, r.end, r.note], ['2026-03-08T01:00', '2026-03-08T04:00', null]);
  // 存在しない 2:30 に落とすときだけは、NY では 3:30 に直して知らせる（決まりの動き）。Tokyo は夏時間が無いのでそのまま。
  const g = moveTimes({ start: '2026-03-07T02:30', end: '2026-03-07T03:30' }, '2026-03-08', '2026-03-07');
  if (new Date(2026, 2, 8, 2, 30).getHours() === 2) assert.deepEqual([g.start, g.note], ['2026-03-08T02:30', null]);
  else assert.deepEqual([g.start, g.note === null], ['2026-03-08T03:30', false]);
});
test('時間軸からの落とし: 繰り返しの1回を 2026-11-01 の前後へ移すと、その回だけの例外（時刻は同じ）', () => {
  const p = { id: 'r1', title: '定例', categoryId: 'c', all: false, start: '2026-10-29T09:00', end: '2026-10-29T10:00', place: '', notes: '', recurrence: { freq: 'daily', interval: 1 }, exdates: [], overrides: {} };
  const occKey = '2026-10-31T09:00';
  const occ = { ...p, start: '2026-10-31T09:00', end: '2026-10-31T10:00' };
  const m = planMoveDuo(p, occ, occKey, '2026-11-01', () => 'new1');
  assert.equal(m.after.start, '2026-11-01T09:00');
  assert.equal(m.after.end, '2026-11-01T10:00');
  const parent = m.puts.find((e) => e.id === 'r1');
  assert.equal(parent.start, '2026-10-29T09:00'); // 親は動かない
  assert.equal(Object.keys(parent.overrides).length, 1);
  assert.equal(Object.values(parent.overrides)[0].start, '2026-11-01T09:00');
});

// 第19.2版 S11f（design/34 §16-4・連携）: 元の日へ落としたら取り消し。保存する案そのものを作らない。
test('繰り返しの回を同じ日に移すと puts が空で overrides ができない（planMoveDuo は null）', () => {
  const p = { id: 'r1', title: '定例', categoryId: 'c', all: false, start: '2026-11-05T09:00', end: '2026-11-05T09:30', place: '', notes: '', recurrence: { freq: 'weekly', interval: 1, byDay: [4] }, exdates: [], overrides: {} };
  const occKey = '2026-11-12T09:00';
  const occ = { ...p, start: '2026-11-12T09:00', end: '2026-11-12T09:30' };
  const m = planMoveDuo(p, occ, occKey, '2026-11-12', () => 'n');
  assert.equal(m, null);
  assert.deepEqual(m?.puts ?? [], []);
  assert.deepEqual(p.overrides, {}); // 入力も変えない
  assert.equal(Object.keys(p.overrides).length, 0);
});
test('単発を同じ日に移しても null（updatedAt を変える保存をしない）。終日・複数日も同じ', () => {
  const one = { id: 'a', title: '撮影', categoryId: 'c', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} };
  assert.equal(planMoveDuo(one, one, null, '2026-11-12', () => 'n'), null);
  const band = { ...one, id: 'b', all: true, start: '2026-11-11T00:00', end: '2026-11-13T23:59' };
  assert.equal(planMoveDuo(band, band, null, '2026-11-11', () => 'n'), null);
});
test('同じ日の中で時刻を動かしたとき（shifted）は今までどおり保存する案を返す。別の日へは今までどおり', () => {
  const one = { id: 'a', title: '撮影', categoryId: 'c', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} };
  const m = planMoveDuo(one, { ...one, start: '2026-11-12T13:00', end: '2026-11-12T14:00' }, null, '2026-11-12', () => 'n', true);
  assert.equal(m.after.start, '2026-11-12T13:00'); assert.equal(m.puts.length, 1);
  assert.equal(planMoveDuo(one, one, null, '2026-11-13', () => 'n').after.start, '2026-11-13T10:00');
});
