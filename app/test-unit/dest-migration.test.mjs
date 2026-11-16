import test from 'node:test';
import assert from 'node:assert/strict';
import { normSettings, planLinkMigration, resolveDest } from '../js/iphone.js';
import { CAT_IDS } from '../js/categories.js';

const cat = (id, hidden = false) => ({ id, hidden });
const cats = [cat('w'), cat('p'), cat(CAT_IDS.other)];
const cal = (id, o = {}) => ({ id, sourceId: 's1', source: 'iCloud', sourceType: 'CalDAV', allowsModify: true, title: id, ...o });
const old = (o = {}) => normSettings({ version: 1, enabled: true, calendarIds: ['a'], selectionInitialized: true, ...o });

test('normSettings: defaultDest は不正なら null、旧キーは保持', () => {
  assert.equal(normSettings({ defaultDest: { type: 'x', id: 'a' } }).defaultDest, null);
  assert.deepEqual(normSettings({ defaultDest: { type: 'iphone', id: 'a' } }).defaultDest, { type: 'iphone', id: 'a' });
  assert.equal(normSettings({ addByDefault: false, defaultCalendarId: 'z' }).defaultCalendarId, 'z');
  assert.equal(normSettings({ enabled: false }).enabledMig, false); // 旧設定は未移行
  assert.equal(normSettings(null).enabledMig, true); // 新規は移行不要
});
test('移行: addByDefault+書込可 → iPhone、旧 defaultCalendarId を優先', () => {
  const p = planLinkMigration(old({ defaultCalendarId: 'b' }), { perm: 'granted', cals: [cal('a'), cal('b')], cats });
  assert.deepEqual(p.defaultDest, { type: 'iphone', id: 'b' });
});
test('移行: addByDefault=false／書込可なし／権限なし → Duo', () => {
  assert.deepEqual(planLinkMigration(old({ addByDefault: false }), { perm: 'granted', cals: [cal('a')], cats }).defaultDest, { type: 'duo', id: 'w' });
  assert.deepEqual(planLinkMigration(old(), { perm: 'granted', cals: [cal('a', { allowsModify: false })], cats }).defaultDest, { type: 'duo', id: 'w' });
  assert.deepEqual(planLinkMigration(old(), { perm: 'denied', cals: null, cats }).defaultDest, { type: 'duo', id: 'w' });
});
test('移行: 取得遅延・権限未確認・カテゴリ未読込では決めない', () => {
  assert.equal(planLinkMigration(old(), { perm: 'granted', cals: null, cats }), null);
  assert.equal(planLinkMigration(old(), { perm: null, cals: null, cats }), null);
  assert.equal(planLinkMigration(old(), { perm: 'denied', cals: null, cats: [] }), null);
});
test('移行: 保存済みの defaultDest は上書きしない', () => {
  const l = old({ defaultDest: { type: 'duo', id: 'p' }, enabledMig: true });
  assert.equal(planLinkMigration(l, { perm: 'granted', cals: [cal('a')], cats }), null);
});
test('移行: 旧オフ＋許可あり → enabled/ids=[]/初期化済み、一度だけ', () => {
  const l = old({ enabled: false, calendarIds: ['a'] });
  const p = planLinkMigration(l, { perm: 'granted', cals: [cal('a')], cats });
  assert.deepEqual({ e: p.enabled, ids: p.calendarIds, s: p.selectionInitialized, m: p.enabledMig, d: p.defaultDest.type }, { e: true, ids: [], s: true, m: true, d: 'iphone' });
  assert.equal(planLinkMigration({ ...l, ...p }, { perm: 'granted', cals: [cal('a')], cats }), null);
  assert.equal(planLinkMigration(l, { perm: 'denied', cals: null, cats }), null); // 未連携で許可なしは何も決めない
});
test('解決: 表示中ならそのまま／非表示は同じ source の表示中へ', () => {
  const ctx = { cats, cals: [cal('a'), cal('b'), cal('c', { sourceId: 's2' })], ids: ['b', 'c'], usable: true };
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'c' }, ctx), { type: 'iphone', id: 'c' });
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'a' }, ctx), { type: 'iphone', id: 'b' });
});
test('解決: 同じ source に無ければ表示中の「その他」→ Duo 先頭、全部非表示だけ「その他」', () => {
  const ctx = { cats, cals: [cal('a')], ids: [], usable: true };
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'a' }, ctx), { type: 'duo', id: CAT_IDS.other });
  const c2 = [cat('w'), cat('p'), cat(CAT_IDS.other, true)];
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'a' }, { ...ctx, cats: c2 }), { type: 'duo', id: 'w' });
  const c3 = [cat('w', true), cat('p', true), cat(CAT_IDS.other, true)];
  assert.deepEqual(resolveDest({ type: 'duo', id: 'w' }, { ...ctx, cats: c3 }), { type: 'duo', id: CAT_IDS.other });
});
test('解決: Duo 非表示は表示中の先頭、消失・読取専用・連携不可は代替へ', () => {
  const c = [cat('w', true), cat('p'), cat(CAT_IDS.other)];
  assert.deepEqual(resolveDest({ type: 'duo', id: 'w' }, { cats: c, cals: [], ids: [], usable: false }), { type: 'duo', id: 'p' });
  const ctx = { cats, cals: [cal('a', { allowsModify: false }), cal('b')], ids: ['a', 'b'], usable: true };
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'a' }, ctx), { type: 'iphone', id: 'b' }); // 読取専用化
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'gone' }, ctx), { type: 'duo', id: CAT_IDS.other }); // 消失
  assert.deepEqual(resolveDest({ type: 'iphone', id: 'b' }, { ...ctx, usable: false }), { type: 'duo', id: CAT_IDS.other });
});
