// 第13版 PR3: iPhone 由来の予定の編集・削除の純粋ロジック。Swift の実動作の証明ではない（同じ fixture を実機で確認する）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { toDisplay, extEditable, extSpan, extCanMove, buildExtArgs, buildExtDeleteArgs, offsetToAlarm, alarmToOffset, headDates } from '../js/iphone.js';
import { ev } from './fixtures.mjs';

const CAL = { id: 'c1', title: '仕事', source: 'iCloud', sourceType: 'caldav', color: '#112233', allowsModify: true };
const raw = (o = {}) => ({ id: 'e1@2026-11-18T09:00', eventId: 'e1', itemId: 'it', externalId: 'ex', calendarId: 'c1', title: '定例', start: '2026-11-18T09:00', end: '2026-11-18T10:00', all: false, recurring: false, modifiedAt: 111, occurrenceDate: null, ...o });
const rec = (o = {}) => toDisplay(raw({ recurring: true, occurrenceDate: '2026-11-18T09:00', ...o }), CAL);
const DET = (o = {}) => ({ allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, editable: true, reason: null, seriesStart: '2026-11-04T09:00', alarms: [], alarmsExtra: 0, ...o });
const same = (b, o = {}) => ({ title: b.title, place: b.place, notes: b.notes, start: b.start, end: b.end, all: b.all, ...o });
const freeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };

test('extEditable: 4 理由・書ける・どちらかの拒否・詳細未取得・カレンダー不明', () => {
  const x = toDisplay(raw(), CAL);
  assert.deepEqual(extEditable(x, CAL, DET()), { editable: true, reason: null });
  assert.equal(extEditable(x, { ...CAL, allowsModify: false }, DET()).reason, 'readOnlyCalendar');
  assert.equal(extEditable(x, CAL, DET({ allowsModify: false })).reason, 'readOnlyCalendar'); // JS と native の矛盾 → 読み取り専用
  assert.equal(extEditable(x, CAL, DET({ hasAttendees: true })).reason, 'invitee');
  assert.equal(extEditable(x, CAL, DET({ hasAttendees: true, isOrganizer: true })).reason, 'organizerWithAttendees'); // 主催者でも拒否
  assert.equal(extEditable(x, CAL, DET({ sourceType: 'birthdays', allowsModify: false, hasAttendees: true })).reason, 'birthdays'); // 固有理由を優先
  assert.equal(extEditable(x, { ...CAL, sourceType: 'birthdays' }, DET()).reason, 'birthdays');
  assert.equal(extEditable(x, CAL, DET({ editable: false, reason: 'invitee' })).reason, 'invitee'); // native だけが拒否
  assert.equal(extEditable(x, CAL, DET({ editable: false })).editable, false);
  assert.equal(extEditable(x, CAL, null).editable, false);
  assert.equal(extEditable(x, undefined, DET()).editable, false);
});

test('extSpan / extCanMove: 単発・この回・これ以降・最初の回のこれ以降→all・移動回', () => {
  const s = toDisplay(raw(), CAL), r = rec(), d = DET();
  assert.equal(extSpan(s, 'all', d), 'this');
  assert.equal(extSpan(r, 'only', d), 'this');
  assert.equal(extSpan(r, 'following', d), 'future');
  assert.equal(extSpan(r, 'all', d), 'all');
  assert.equal(extSpan(rec({ occurrenceDate: '2026-11-04T09:00', start: '2026-11-04T09:00' }), 'following', d), 'all');
  // 回が別の日へ移動していても、元の回日付（occurrenceDate）で判定する
  assert.equal(extSpan(rec({ start: '2026-11-20T09:00', occurrenceDate: '2026-11-04T09:00' }), 'following', d), 'all');
  assert.equal(extSpan(r, 'following', DET({ seriesStart: null })), 'future');
  assert.equal(extCanMove(s, 'this'), true);
  assert.equal(extCanMove(r, 'this'), false);
  assert.equal(extCanMove(r, 'future'), false);
  assert.equal(extCanMove(r, 'all'), true);
});

test('buildExtArgs: 変更した項目だけ・Target・禁止キーなし・入力不変', () => {
  const b = freeze(toDisplay(raw(), CAL)), d = freeze(DET());
  const a = freeze(same(b, { title: '新' }));
  const out = buildExtArgs(b, a, 'only', d);
  assert.deepEqual(out, { itemId: 'it', externalId: 'ex', eventId: 'e1', occurrenceStart: '2026-11-18T09:00', currentStart: '2026-11-18T09:00', span: 'this', expectModified: 111, title: '新' });
  for (const k of ['requestId', 'recurrence', 'categoryId', 'nativeLink', 'base', 'alarms', 'start']) assert.ok(!(k in out), k);
  assert.equal(buildExtArgs(b, same(b), 'only', d), null); // 空差分
  assert.equal(buildExtArgs(b, same(b, { place: undefined }), 'only', d), null);
  assert.deepEqual(buildExtArgs(b, same(b, { notes: '' , place: '会議室' }), 'only', d).place, '会議室');
  assert.equal(buildExtArgs(toDisplay(raw({ modifiedAt: null }), CAL), same(b, { title: 'x' }), 'only', d).expectModified, null);
});

test('buildExtArgs: 日時は start/end/all を一組。rawEnd と終日の最終日規約を保つ', () => {
  const b = toDisplay(raw({ end: '2026-11-19T00:00' }), CAL); // 時刻ありで翌日 00:00 終わり → 表示は 23:59
  assert.equal(b.end, '2026-11-18T23:59');
  const o = buildExtArgs(b, same(b, { start: '2026-11-18T10:00' }), 'only', DET());
  assert.deepEqual([o.start, o.end, o.all], ['2026-11-18T10:00', '2026-11-19T00:00', false]); // end 不変は rawEnd のまま
  const o2 = buildExtArgs(b, same(b, { end: '2026-11-18T22:00' }), 'only', DET());
  assert.deepEqual([o2.start, o2.end, o2.all], ['2026-11-18T09:00', '2026-11-18T22:00', false]);
  const ad = toDisplay(raw({ all: true, start: '2026-11-18T00:00', end: '2026-11-20T00:00' }), CAL); // 18〜20 日（含む）
  assert.equal(ad.end, '2026-11-20T23:59');
  const o3 = buildExtArgs(ad, same(ad, { end: '2026-11-21T23:59' }), 'only', DET());
  assert.deepEqual([o3.start, o3.end, o3.all], ['2026-11-18T00:00', '2026-11-21T00:00', true]);
  const o4 = buildExtArgs(ad, same(ad, { all: false, start: '2026-11-18T09:00', end: '2026-11-18T10:00' }), 'only', DET());
  assert.deepEqual([o4.start, o4.end, o4.all], ['2026-11-18T09:00', '2026-11-18T10:00', false]);
});

test('buildExtArgs: 繰り返し 3 範囲・最初の回・移動回。base は all の日時変更のときだけ', () => {
  const r = rec(), d = DET();
  const t = (scope, o) => buildExtArgs(r, same(r, o), scope, d);
  assert.deepEqual([t('only', { title: 'x' }).span, t('only', { title: 'x' }).occurrenceStart], ['this', '2026-11-18T09:00']);
  assert.equal(t('following', { title: 'x' }).span, 'future');
  assert.equal(t('all', { title: 'x' }).span, 'all');
  assert.ok(!('base' in t('all', { title: 'x' })));
  assert.deepEqual(t('all', { start: '2026-11-18T10:00' }).base, { start: '2026-11-18T09:00', end: '2026-11-18T10:00', all: false });
  assert.ok(!('base' in t('only', { start: '2026-11-18T10:00' })));
  const first = rec({ start: '2026-11-04T09:00', occurrenceDate: '2026-11-04T09:00' });
  assert.equal(buildExtArgs(first, same(first, { title: 'x' }), 'following', d).span, 'all');
  const moved = rec({ start: '2026-11-20T09:00', end: '2026-11-20T10:00', occurrenceDate: '2026-11-18T09:00' });
  const m = buildExtArgs(moved, same(moved, { title: 'x' }), 'only', d);
  assert.deepEqual([m.occurrenceStart, m.currentStart], ['2026-11-18T09:00', '2026-11-20T09:00']);
  const det = buildExtArgs(toDisplay(raw({ recurring: false, occurrenceDate: '2026-11-18T09:00' }), CAL), same(r, { title: 'x' }), 'all', d);
  assert.equal(det.span, 'this'); // 個別に変えた回（recurring:false）
});

test('buildExtArgs: calendarId の移動は単発か all だけ。規則は出さない', () => {
  const s = toDisplay(raw(), CAL), r = rec(), d = DET();
  assert.equal(buildExtArgs(s, same(s, { calendarId: 'c2' }), 'only', d).calendarId, 'c2');
  assert.equal(buildExtArgs(s, same(s, { calendarId: 'c1' }), 'only', d), null);
  assert.equal(buildExtArgs(r, same(r, { calendarId: 'c2' }), 'all', d).calendarId, 'c2');
  assert.equal(buildExtArgs(r, same(r, { calendarId: 'c2' }), 'only', d), null);
  assert.equal(buildExtArgs(r, same(r, { calendarId: 'c2' }), 'following', d), null);
  assert.ok(!('recurrence' in buildExtArgs(r, same(r, { title: 'x', recurrence: { freq: 'daily' } }), 'all', d)));
});

test('buildExtArgs: 通知は触ったときだけ。[] は明示・値は保持', () => {
  const b = toDisplay(raw(), CAL), d = DET({ alarms: [{ before: 20 }], alarmsExtra: 1 });
  assert.equal(buildExtArgs(b, same(b), 'only', d), null);
  assert.ok(!('alarms' in buildExtArgs(b, same(b, { title: 'x' }), 'only', d)));
  assert.deepEqual(buildExtArgs(b, same(b, { alarms: [] }), 'only', d).alarms, []);
  assert.deepEqual(buildExtArgs(b, same(b, { alarms: [{ before: 20 }, { before: 60 }] }), 'only', d).alarms, [{ before: 20 }, { before: 60 }]);
  assert.deepEqual(buildExtArgs(b, same(b, { alarms: null }), 'only', d).alarms, []);
});

test('buildExtDeleteArgs: Target・span・force は再確認後だけ', () => {
  const r = rec(), d = DET();
  assert.deepEqual(buildExtDeleteArgs(r, 'following', d), { itemId: 'it', externalId: 'ex', eventId: 'e1', occurrenceStart: '2026-11-18T09:00', currentStart: '2026-11-18T09:00', span: 'future', expectModified: 111 });
  assert.equal(buildExtDeleteArgs(r, 'all', d, true).force, true);
  assert.ok(!('force' in buildExtDeleteArgs(r, 'all', d)));
});

test('通知 offset ⇔ Duo 形式: 時刻あり 0 / -1800 / -86400', () => {
  assert.deepEqual(offsetToAlarm(0, false), { before: 0 });
  assert.deepEqual(offsetToAlarm(-1800, false), { before: 30 });
  assert.deepEqual(offsetToAlarm(-86400, false), { before: 1440 });
  assert.deepEqual(offsetToAlarm(-1200, false), { before: 20 }); // 表にない値も保持
  assert.equal(offsetToAlarm(-40320 * 60, false).before, 40320);
  assert.equal(offsetToAlarm(-40321 * 60, false), null);
  assert.equal(offsetToAlarm(60, false), null); // 正の時刻あり
  assert.equal(offsetToAlarm(-90, false), null); // 非分単位
  assert.equal(offsetToAlarm(-1800.5, false), null);
});
test('通知 offset ⇔ Duo 形式: 終日 +28800 / -57600 / +86399', () => {
  assert.deepEqual(offsetToAlarm(28800, true), { day: 0, at: '08:00' }); // 当日 08:00
  assert.deepEqual(offsetToAlarm(-57600, true), { day: 1, at: '08:00' }); // 前日 08:00
  assert.deepEqual(offsetToAlarm(0, true), { day: 0, at: '00:00' });
  assert.deepEqual(offsetToAlarm(-86400, true), { day: 1, at: '00:00' });
  assert.deepEqual(offsetToAlarm(86340, true), { day: 0, at: '23:59' });
  assert.equal(offsetToAlarm(86399, true), null); // 非分単位
  assert.equal(offsetToAlarm(86400, true), null);
  assert.equal(offsetToAlarm(-30 * 86400 + 28800, true).day, 30);
  assert.equal(offsetToAlarm(-31 * 86400, true), null);
  assert.ok(Object.is(offsetToAlarm(28800, true).day, 0));
  for (const o of [28800, -57600, 0, -86400, 86340, -2 * 86400 + 3600]) assert.equal(alarmToOffset(offsetToAlarm(o, true), true), o);
  for (const o of [0, -1800, -1200, -86400]) assert.equal(alarmToOffset(offsetToAlarm(o, false), false), o);
  assert.equal(alarmToOffset({ before: 40321 }, false), null);
  assert.equal(alarmToOffset({ day: 1, at: '25:00' }, true), null);
  assert.equal(alarmToOffset({ day: 31, at: '08:00' }, true), null);
});

test('通知: 3 件目以降は Swift 側で extra。JS の変換は 1 件ずつで上限を持たない', () => {
  assert.deepEqual([0, -300, -600].map((o) => offsetToAlarm(o, false)?.before), [0, 5, 10]);
});

test('すべて: 日時差分（+1時間・+1日・長さ変更）', () => {
  const base = { start: '2026-11-18T09:00', end: '2026-11-18T10:00', all: false };
  const head = { start: '2026-11-04T09:00', end: '2026-11-04T10:00', all: false };
  assert.deepEqual(headDates(head, base, { start: '2026-11-18T10:00', end: '2026-11-18T11:00', all: false }), { start: '2026-11-04T10:00', end: '2026-11-04T11:00', all: false });
  assert.deepEqual(headDates(head, base, { start: '2026-11-19T09:00', end: '2026-11-19T10:00', all: false }), { start: '2026-11-05T09:00', end: '2026-11-05T10:00', all: false });
  assert.deepEqual(headDates(head, base, { start: '2026-11-18T09:00', end: '2026-11-18T10:30', all: false }), { start: '2026-11-04T09:00', end: '2026-11-04T10:30', all: false });
  // 先頭の長さが開いた回と違っても差だけ足す
  const head2 = { start: '2026-11-04T09:00', end: '2026-11-04T12:00', all: false };
  assert.deepEqual(headDates(head2, base, { start: '2026-11-18T09:00', end: '2026-11-18T10:30', all: false }).end, '2026-11-04T12:30');
  // end を送らない（開始だけ）→ 長さ保持
  assert.deepEqual(headDates(head, base, { start: '2026-11-18T08:00' }), { start: '2026-11-04T08:00', end: '2026-11-04T09:00', all: false });
  assert.equal(headDates(head, base, { start: '2026-11-18T11:00', end: '2026-11-18T10:00', all: false }), null);
  // 日付をまたぐ移動（1 時間+日またぎ）
  assert.deepEqual(headDates(head, base, { start: '2026-11-18T23:30', end: '2026-11-19T00:30', all: false }), { start: '2026-11-04T23:30', end: '2026-11-05T00:30', all: false });
});
test('すべて: 終日 ⇔ 時刻あり・終日の差', () => {
  const tBase = { start: '2026-11-18T09:00', end: '2026-11-18T10:00', all: false }, tHead = { start: '2026-11-04T09:00', end: '2026-11-04T10:00', all: false };
  assert.deepEqual(headDates(tHead, tBase, { start: '2026-11-18T00:00', end: '2026-11-18T00:00', all: true }), { start: '2026-11-04T00:00', end: '2026-11-04T00:00', all: true });
  const aBase = { start: '2026-11-18T00:00', end: '2026-11-19T00:00', all: true }, aHead = { start: '2026-11-04T00:00', end: '2026-11-05T00:00', all: true };
  assert.deepEqual(headDates(aHead, aBase, { start: '2026-11-18T09:30', end: '2026-11-18T10:30', all: false }), { start: '2026-11-04T09:30', end: '2026-11-04T10:30', all: false });
  assert.deepEqual(headDates(aHead, aBase, { start: '2026-11-19T00:00', end: '2026-11-21T00:00', all: true }), { start: '2026-11-05T00:00', end: '2026-11-07T00:00', all: true }); // +1日・長さ 1→2 日（先頭は 5〜7）
  assert.deepEqual(headDates(aHead, aBase, { all: false, start: '2026-11-18T09:00' }), { start: '2026-11-04T09:00', end: '2026-11-04T10:00', all: false }); // 切替の既定は 1 時間
});
test('すべて: NY の夏時間をまたぐ（壁時計を保つ）', { skip: process.env.TZ !== 'America/New_York' }, () => {
  // 2026-03-08 02:00 に夏時間開始
  const base = { start: '2026-03-09T09:00', end: '2026-03-09T10:00', all: false };
  const head = { start: '2026-03-02T09:00', end: '2026-03-02T10:00', all: false }; // 夏時間の前
  assert.deepEqual(headDates(head, base, { start: '2026-03-09T09:00', end: '2026-03-09T11:00', all: false }), { start: '2026-03-02T09:00', end: '2026-03-02T11:00', all: false });
  assert.deepEqual(headDates(head, base, { start: '2026-03-10T09:00', end: '2026-03-10T10:00', all: false }).start, '2026-03-03T09:00');
  // 先頭が夏時間の前日、長さの差が夏時間の夜をまたぐ: 1 時間の予定を 2 時間へ
  const head2 = { start: '2026-03-07T23:30', end: '2026-03-08T00:30', all: false };
  assert.equal(headDates(head2, { start: '2026-03-14T23:30', end: '2026-03-15T00:30', all: false }, { start: '2026-03-14T23:30', end: '2026-03-15T01:30', all: false }).end, '2026-03-08T01:30');
});
