// 第15版 PR3: 画面・検索・通知で同じ表示条件（makeVisible）を使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVisible } from '../js/iphone.js';
import { searchEvents } from '../js/search.js';
import { normNotify, planNotifications } from '../js/notify.js';
import { R, ev } from './fixtures.mjs';

const NOW = new Date(2026, 10, 14, 9, 0);
const S = normNotify(null);
const hid = new Set(['c-hid']);
const cals = [{ id: 'A' }, { id: 'B' }];
const link = (o = {}) => ({ enabled: true, calendarIds: ['A'], ...o });
const nl = (state, calendarId) => ({ v: 2, state, calendarId });
const vis = (events, o = {}) => makeVisible({ events, hiddenCats: hid, link: link(), perm: 'granted', calendars: cals, ...o });

test('Duo のみ: hidden カテゴリは除く', () => {
  const a = ev('a', '2026-11-15T10:00', '2026-11-15T11:00', null, { categoryId: 'c-hid' }), b = ev('b', '2026-11-15T10:00', '2026-11-15T11:00', null);
  const v = vis([a, b]);
  assert.equal(v(a), false); assert.equal(v(b), true);
});

test('linked/pending: 追加先カレンダーの ✓ が正（カテゴリ hidden は無関係）', () => {
  const on = ev('on', '2026-11-15T10:00', '2026-11-15T11:00', null, { categoryId: 'c-hid', nativeLink: nl('linked', 'A') });
  const off = ev('off', '2026-11-15T10:00', '2026-11-15T11:00', null, { nativeLink: nl('linked', 'B') });
  const pend = ev('pend', '2026-11-15T10:00', '2026-11-15T11:00', null, { nativeLink: nl('pending', 'B') });
  const gone = ev('gone', '2026-11-15T10:00', '2026-11-15T11:00', null, { nativeLink: nl('linked', 'Z') });
  const v = vis([on, off, pend, gone], { link: link({ calendarIds: ['A', 'Z'] }) });
  assert.deepEqual([on, off, pend, gone].map(v), [true, false, false, false]); // Z は端末に無い → 非表示のまま
});

test('unlinked に戻った失敗予定・連携オフ・許可なしはカテゴリ判定', () => {
  const u = ev('u', '2026-11-15T10:00', '2026-11-15T11:00', null, { nativeLink: nl('unlinked', 'B') });
  const h = ev('h', '2026-11-15T10:00', '2026-11-15T11:00', null, { categoryId: 'c-hid', nativeLink: nl('unlinked', 'A') });
  const l = ev('l', '2026-11-15T10:00', '2026-11-15T11:00', null, { nativeLink: nl('linked', 'B') });
  assert.deepEqual([u, h].map(vis([u, h])), [true, false]);
  assert.equal(vis([l], { link: link({ enabled: false }) })(l), true);
  assert.equal(vis([l], { perm: 'denied' })(l), true);
});

test('繰り返しの回: 実効 categoryId で判定し、親だけを落とさない／linked は親の nativeLink を見る', () => {
  const p = ev('p', '2026-11-16T10:00', '2026-11-16T11:00', R('daily'), { overrides: { '2026-11-17T10:00': { title: 'tx', start: '2026-11-17T10:00', end: '2026-11-17T11:00', categoryId: 'c-hid' } } });
  const q = ev('q', '2026-11-16T10:00', '2026-11-16T11:00', R('daily'), { categoryId: 'c-hid', overrides: { '2026-11-17T10:00': { title: 'ty', start: '2026-11-17T10:00', end: '2026-11-17T11:00', categoryId: 'c-work' } } });
  const r = ev('r', '2026-11-16T10:00', '2026-11-16T11:00', R('daily'), { nativeLink: nl('linked', 'B') });
  const v = vis([p, q, r]);
  const res = searchEvents([p, q, r], 't', '2026-11-14', [], v);
  const ids = res.items.map((e) => e.id);
  assert.ok(ids.some((i) => i === 'q@2026-11-17T10:00'), '個別変更で表示カテゴリになった回は残る');
  assert.ok(!ids.some((i) => i.startsWith('p@2026-11-17')), '個別変更で hidden になった回は除く');
  assert.ok(ids.some((i) => i.startsWith('p@2026-11-18')));
  assert.ok(!ids.some((i) => i.startsWith('q@2026-11-18')));
  assert.ok(!ids.some((i) => i.startsWith('r@')), 'linked の回は追加先オフで除く');
});

test('searchEvents: visible で件数・total も絞る。外部（extra）は触らない', () => {
  const a = ev('a', '2026-11-15T10:00', '2026-11-15T11:00', null, { categoryId: 'c-hid', title: '歯医者' });
  const b = ev('b', '2026-11-15T12:00', '2026-11-15T13:00', null, { title: '歯医者2' });
  const x = { id: 'ip:1', start: '2026-11-15T09:00', end: '2026-11-15T10:00', title: '歯医者x' };
  assert.equal(searchEvents([a, b], '歯医者', '2026-11-14', []).total, 2);
  const r = searchEvents([a, b], '歯医者', '2026-11-14', [x], vis([a, b]));
  assert.deepEqual(r.items.map((e) => e.id), ['ip:1', 'b']); assert.equal(r.total, 2);
});

test('planNotifications: hidden の予定は予約しない／親は残して個別変更の可視回は出す', () => {
  const al = { alarms: [{ before: 30 }] };
  const a = ev('a', '2026-11-15T10:00', '2026-11-15T11:00', null, { categoryId: 'c-hid', ...al });
  const b = ev('b', '2026-11-15T10:00', '2026-11-15T11:00', null, al);
  const q = ev('q', '2026-11-16T10:00', '2026-11-16T11:00', R('daily'), { categoryId: 'c-hid', ...al, overrides: { '2026-11-17T10:00': { title: 'y', start: '2026-11-17T10:00', end: '2026-11-17T11:00', categoryId: 'c-work' } } });
  const evs = [a, b, q];
  assert.ok(planNotifications(evs, NOW, S).items.some((i) => i.eventId === 'a'));
  const items = planNotifications(evs, NOW, S, { visible: vis(evs) }).items;
  assert.ok(!items.some((i) => i.eventId === 'a'));
  assert.ok(items.some((i) => i.eventId === 'b'));
  assert.deepEqual(items.filter((i) => i.eventId === 'q').map((i) => i.day), ['2026-11-17']);
  assert.equal(evs.length, 3); assert.equal(a.categoryId, 'c-hid'); // 入力は変えない
});
