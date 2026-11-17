import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEvents, eveningFirst, homeTasks, dueText, tomorrowSummary, axisBars, firstLines } from '../js/home.js';

const ev = (id, s, e, x = {}) => ({ id, title: id, start: `2026-11-17T${s}`, end: `2026-11-17T${e}`, ...x });
test('次の予定は残りに二重掲載せず、残りは最大3件＋ほか件数', () => {
  const l = [ev('a', '10:00', '11:00'), ev('b', '11:00', '12:00'), ev('c', '12:00', '13:00'), ev('d', '13:00', '14:00'), ev('e', '14:00', '15:00')];
  const r = splitEvents(l);
  assert.equal(r.next.id, 'a'); assert.deepEqual(r.shown.map((e) => e.id), ['b', 'c', 'd']); assert.equal(r.more, 1); assert.equal(r.count, 5);
});
test('終日だけなら終日が次。今日が空なら future を次に', () => {
  const al = { id: 'z', all: true, start: '2026-11-17', end: '2026-11-17' };
  assert.equal(splitEvents([al, ev('a', '10:00', '11:00')]).next.id, 'a');
  assert.equal(splitEvents([al]).next.id, 'z');
  const f = ev('f', '09:00', '10:00');
  assert.equal(splitEvents([], f).next, f); assert.equal(splitEvents([]).next, null);
});
test('20時以降は明日が上', () => {
  assert.equal(eveningFirst('2026-11-17T19:59'), false); assert.equal(eveningFirst('2026-11-17T20:00'), true); assert.equal(eveningFirst('2026-11-17T23:59'), true);
});
test('タスク: 期限が今日以前の未完了を期限順に最大3件。件数は全体', () => {
  const t = (id, date, time, done = false) => ({ itemId: id, title: id, due: { date, time }, done });
  const r = homeTasks([t('x', '2026-11-17', '09:00'), t('o', '2026-11-14'), t('y', '2026-11-18'), t('d', '2026-11-16', null, true), t('p', '2026-11-17', '08:00'), t('q', '2026-11-16'), { itemId: 'n', title: 'n', due: null }], '2026-11-17');
  assert.deepEqual(r.items.map((i) => i.itemId), ['o', 'q', 'p']); assert.equal(r.total, 4);
});
test('完了操作中の行は残り、件数からは外れる', () => {
  const rs = [{ itemId: 'a', title: 'a', due: { date: '2026-11-17' }, done: false }];
  const r = homeTasks(rs, '2026-11-17', new Map([['a', true]]));
  assert.equal(r.items.length, 1); assert.equal(r.total, 0);
  assert.equal(homeTasks(rs, '2026-11-17', new Map([['a', false]])).total, 1);
});
test('期限の表記', () => {
  assert.equal(dueText({ date: '2026-11-16' }, '2026-11-17'), '昨日'); assert.equal(dueText({ date: '2026-11-14' }, '2026-11-17'), '11/14');
  assert.equal(dueText({ date: '2026-11-17', time: '15:00' }, '2026-11-17'), '15:00'); assert.equal(dueText({ date: '2026-11-17' }, '2026-11-17'), '');
  assert.equal(dueText({ date: '2026-01-01' }, '2026-01-02'), '昨日');
});
test('明日の要約', () => {
  assert.deepEqual(tomorrowSummary([]), { count: 0, first: null, more: 0 });
  const s = tomorrowSummary([{ id: 'a', all: true }, { id: 'b' }]); assert.equal(s.first.id, 'b'); assert.equal(s.more, 1); assert.equal(s.count, 2);
});
test('時間軸: 9〜19時で切り、14pt/時、現在線、終日は除く', () => {
  const A = axisBars([ev('a', '08:00', '10:00'), ev('b', '18:30', '21:00'), ev('c', '20:00', '21:00'), { id: 'z', all: true, start: '2026-11-17', end: '2026-11-17' }, ev('p', '09:00', '09:30')], '2026-11-17T09:41', '2026-11-17');
  assert.deepEqual(A.bars.map((b) => b.id), ['a', 'b', 'p']);
  assert.equal(A.bars[0].top, 0); assert.equal(A.bars[0].height, 14);
  assert.equal(A.bars[1].top, 9.5 * 14); assert.equal(A.bars[1].height, 7);
  assert.equal(A.bars[2].past, true); assert.equal(A.bars[0].past, false);
  assert.equal(A.nowTop, (41 * 14) / 60); assert.equal(A.height, 140);
  assert.equal(axisBars([], '2026-11-17T20:10', '2026-11-17').nowTop, null);
  assert.equal(axisBars([], '2026-11-18T10:00', '2026-11-17').nowTop, null);
});
test('深夜をまたぐ予定は今日の分だけ', () => {
  const A = axisBars([{ id: 'n', start: '2026-11-16T22:00', end: '2026-11-17T10:00' }], '2026-11-17T00:10', '2026-11-17');
  assert.equal(A.bars[0].top, 0); assert.equal(A.bars[0].height, 14);
});
test('メモの先頭行', () => {
  assert.deepEqual(firstLines('\n a \n\n b\nc'), ['a', 'b']); assert.deepEqual(firstLines(''), []); assert.deepEqual(firstLines(null), []);
});
