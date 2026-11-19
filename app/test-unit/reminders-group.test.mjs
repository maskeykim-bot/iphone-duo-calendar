import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupReminders, completedSinceStamp, tasksHtml } from '../js/reminders.js';

const R = (o) => ({ itemId: 'i', externalId: 'e', listId: 'L', title: 't', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: null, modifiedAt: null, readOnly: false, ...o });
const NOW = new Date(2026, 10, 16, 12, 0); // 11/16 12:00
const ids = (a) => a.map((r) => r.itemId);
const G = (items, selected = '2026-11-16', histDays) => groupReminders(items, { now: NOW, selected, histDays });

test('今日が選択日: 時刻つきで過去は期限切れ、未来は選択日、日付のみ今日は選択日', () => {
  const g = G([R({ itemId: 'a', due: { date: '2026-11-16', time: '09:00' } }), R({ itemId: 'b', due: { date: '2026-11-16', time: '15:00' } }), R({ itemId: 'c', due: { date: '2026-11-16' } }), R({ itemId: 'd', due: { date: '2026-11-15' } }), R({ itemId: 'e', due: { date: '2026-11-17' } })]);
  assert.deepEqual(ids(g.overdue), ['d', 'a']);
  assert.deepEqual(ids(g.selected), ['c', 'b']);
  assert.deepEqual(ids(g.upcoming), ['e']);
});
test('過去の選択日: 重複せず期限切れだけ。今日以降はこの先', () => {
  const g = G([R({ itemId: 'a', due: { date: '2026-11-10' } }), R({ itemId: 'b', due: { date: '2026-11-16' } }), R({ itemId: 'c', due: { date: '2026-11-12', time: '10:00' } })], '2026-11-12');
  assert.deepEqual(ids(g.overdue), ['a', 'c']);
  assert.deepEqual(g.selected, []);
  assert.deepEqual(ids(g.upcoming), ['b']);
  assert.equal(g.overdue.length + g.selected.length + g.upcoming.length, 3);
});
test('未来の選択日: 選択日前で今日以降は期限切れにせず before（赤にしない。M-17）', () => {
  const g = G([R({ itemId: 'a', due: { date: '2026-11-18' } }), R({ itemId: 'b', due: { date: '2026-11-20' } }), R({ itemId: 'c', due: { date: '2026-11-22' } }), R({ itemId: 'd', due: { date: '2026-11-15' } }), R({ itemId: 'e', due: { date: '2026-11-16' } })], '2026-11-20');
  assert.deepEqual(ids(g.overdue), ['d']);
  assert.deepEqual(ids(g.before), ['e', 'a']);
  assert.deepEqual(ids(g.selected), ['b']);
  assert.deepEqual(ids(g.upcoming), ['c']);
});
test('選んだ日が先: 今日の期限は「今日 · 11月16日（月）」の見出し（S7 V-24）（黒）、赤の期限切れは今日より前だけ', () => {
  const html = tasksHtml({ lists: [], reminders: [R({ itemId: 'e', title: 'きょう', due: { date: '2026-11-16' } }), R({ itemId: 'd', title: 'きのう', due: { date: '2026-11-15' } })] }, { selected: '2026-11-20', now: NOW });
  assert.match(html, /data-sec="before:2026-11-16"><h3 class="rmh">今日 · 11月16日（月）<\/h3>/);
  assert.match(html, /<h3 class="rmh late">期限切れ<\/h3>/);
  assert.doesNotMatch(html, /rmh late">(今日 · )?11月16日/);
});
test('期限なし: 作成の古い順、欠落は後ろで題名・id 順', () => {
  const g = G([R({ itemId: 'z', title: 'b', createdAt: null }), R({ itemId: 'y', title: 'a', createdAt: null }), R({ itemId: 'x', title: 'c', createdAt: 300 }), R({ itemId: 'w', title: 'd', createdAt: 100 }), R({ itemId: 'v', title: 'a', createdAt: null })]);
  assert.deepEqual(ids(g.nodue), ['w', 'x', 'v', 'y', 'z']);
});
test('完了: 30日の境界と、もっと前（60日）', () => {
  assert.equal(completedSinceStamp(NOW, 30), '2026-10-17T12:00');
  const items = [R({ itemId: 'a', done: true, doneAt: '2026-10-17T12:00' }), R({ itemId: 'b', done: true, doneAt: '2026-10-17T11:59' }), R({ itemId: 'c', done: true, doneAt: '2026-09-20T00:00' }), R({ itemId: 'd', done: true, doneAt: null })];
  assert.deepEqual(ids(G(items).done).sort(), ['a', 'd']);
  assert.deepEqual(ids(G(items, '2026-11-16', 60).done).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(G(items).overdue.length, 0);
});
test('重複 id は1つ、壊れた要素は無視', () => {
  assert.equal(G([R({ itemId: 'a' }), R({ itemId: 'a' }), null, {}]).nodue.length, 1);
});
test('表示: 見出し・行の高さ種別・!・繰り返し・読み取り専用・エスケープ', () => {
  const data = { lists: [{ id: 'L', color: '#112233' }], reminders: [R({ itemId: 'a<b', title: '<x>', priority: 5, recurring: true, readOnly: true, due: { date: '2026-11-16', time: '09:00' } }), R({ itemId: 'n' })] };
  const h = tasksHtml(data, { selected: '2026-11-16', now: NOW });
  assert.match(h, /期限切れ/); assert.match(h, /期限なし/); assert.match(h, /data-key="rm:a&lt;b"/);
  assert.match(h, /rmpri/); assert.match(h, /11\/16 09:00・繰り返し/); assert.match(h, /読み取り専用/); assert.match(h, /--rc:#112233/); assert.match(h, /&lt;x&gt;/);
  assert.match(h, /完了（0）/); assert.doesNotMatch(h, /もっと前を表示/);
  assert.match(tasksHtml(data, { selected: '2026-11-16', now: NOW, doneOpen: true }), /もっと前を表示/);
});
