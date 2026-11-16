import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normRemSettings, shownListIds, pruneRemSettings, resolveAddList, filterByLists, dueCounts, createReminderLoader, pickAddList } from '../js/reminders.js';

const L = (id, o = {}) => ({ id, title: id, color: '#336699', allowsModify: true, isDefault: false, ...o });
const R = (o) => ({ itemId: 'i', listId: 'A', due: null, done: false, ...o });

test('設定の正規化: 初期はすべて・追加先自動・月は off。不正値は初期へ', () => {
  assert.deepEqual(normRemSettings(null), { lists: null, addTo: '', monthTasks: false });
  assert.deepEqual(normRemSettings('x'), { lists: null, addTo: '', monthTasks: false });
  assert.deepEqual(normRemSettings({ lists: ['A', 'A', 3, ''], addTo: 5, monthTasks: 'yes' }), { lists: ['A'], addTo: '', monthTasks: false });
  assert.equal(normRemSettings({ monthTasks: true }).monthTasks, true);
});
test('表示リスト: すべて／選択／消えた id は除く／全部消えたら すべて', () => {
  const ls = [L('A'), L('B'), L('C')];
  assert.deepEqual(shownListIds({ lists: null }, ls), ['A', 'B', 'C']);
  assert.deepEqual(shownListIds({ lists: ['B', 'Z'] }, ls), ['B']);
  assert.deepEqual(shownListIds({ lists: ['Z'] }, ls), ['A', 'B', 'C']);
  assert.deepEqual(shownListIds({ lists: null }, [...ls, L('D')]), ['A', 'B', 'C', 'D']); // 新しいリストは「すべて」に自動で入る
  assert.deepEqual(shownListIds({ lists: ['A'] }, [...ls, L('D')]), ['A']);
});
test('prune: 消えた id を除去。一覧が空なら触らない。変化なしは同じ object', () => {
  const s = { lists: ['A', 'Z'], addTo: 'Z', monthTasks: true };
  assert.deepEqual(pruneRemSettings(s, [L('A'), L('B')]), { lists: ['A'], addTo: '', monthTasks: true });
  assert.equal(pruneRemSettings(s, []), s);
  const t = { lists: ['A'], addTo: 'B', monthTasks: false };
  assert.equal(pruneRemSettings(t, [L('A'), L('B')]), t);
  assert.equal(pruneRemSettings({ lists: ['Z'], addTo: '', monthTasks: false }, [L('A')]).lists, null);
});
test('追加先: 設定が実在し書けるならそれ。読み取り専用・消失は自動。表示リストとは独立。既定なしは書ける先頭', () => {
  const ls = [L('A', { allowsModify: false }), L('B'), L('C', { isDefault: true })];
  assert.equal(resolveAddList(ls, ''), 'C');
  assert.equal(resolveAddList(ls, 'B'), 'B');
  assert.equal(resolveAddList(ls, 'A'), 'C'); // 読み取り専用は追加先にならない
  assert.equal(resolveAddList(ls, 'Z'), 'C');
  const noDef = [L('A', { allowsModify: false }), L('B'), L('C')];
  assert.equal(resolveAddList(noDef, ''), 'B');
  assert.equal(pickAddList(noDef), 'B');
  assert.equal(resolveAddList([L('A', { allowsModify: false })], ''), null);
  assert.equal(resolveAddList(undefined, 'B'), null);
});
test('フィルタ: 表示リストのタスクだけ', () => {
  const rs = [R({ itemId: '1', listId: 'A' }), R({ itemId: '2', listId: 'B' })];
  assert.deepEqual(filterByLists(rs, new Set(['B'])).map((r) => r.itemId), ['2']);
  assert.deepEqual(filterByLists(rs, ['A', 'B']).length, 2);
  assert.deepEqual(filterByLists(null, ['A']), []);
});
test('件数: 未完了・表示リスト・期限の日だけ。完了・期限なし・非表示は数えない。名前は持たない', () => {
  const rs = [
    R({ itemId: '1', due: { date: '2026-11-16' } }), R({ itemId: '2', due: { date: '2026-11-16', time: '09:00' } }),
    R({ itemId: '3', due: { date: '2026-11-16' }, done: true }), R({ itemId: '4' }),
    R({ itemId: '5', listId: 'B', due: { date: '2026-11-16' } }), R({ itemId: '6', due: { date: '2026-11-17' } }),
  ];
  const m = dueCounts(rs, new Set(['A']));
  assert.equal(m.get('2026-11-16'), 2); assert.equal(m.get('2026-11-17'), 1); assert.equal(m.size, 2);
  assert.equal(dueCounts(rs, new Set(['A', 'B'])).get('2026-11-16'), 3);
  // 完了操作中の上書き: 1 を完了扱い／3 を未完了扱い
  const o = dueCounts(rs, new Set(['A']), new Map([['1', true], ['3', false]]));
  assert.equal(o.get('2026-11-16'), 2);
});
test('ローダー: pick で絞った id だけ native へ渡す。lists は全件返す（追加先用）', async () => {
  const calls = [];
  const call = async (m, o) => { calls.push([m, o]); return m === 'listReminderLists' ? { lists: [L('A'), L('B')] } : { reminders: [] }; };
  const r = await createReminderLoader(call, { pick: () => ['B'] }).load(30, new Date(2026, 10, 16));
  assert.deepEqual(r.lists.map((l) => l.id), ['A', 'B']);
  assert.deepEqual(calls[1][1].listIds, ['B']);
  const r2 = await createReminderLoader(call).load(30, new Date(2026, 10, 16));
  assert.deepEqual(calls[3][1].listIds, ['A', 'B']); assert.ok(r2);
});
