// js/categories.js の純粋関数と、旧 cat → categoryId の変換（バックアップ v1/v2 読み込み）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAT_IDS, DEFAULTS_NEW, LEGACY, PALETTE, UNCATEGORIZED, fixEventCategories, legacyToId, mergeCategories, moveCategory, nameTaken, newCategory,
  planDeleteCategory, resolveCategory, sortCategories, tint, validateCategory,
} from '../js/categories.js';
import { buildBackup, validateBackup } from '../js/backup.js';
import { withDefaults } from '../js/util.js';
import { ev } from './fixtures.mjs';

const cat = (id, name, order, x = {}) => ({ id, name, color: '#2f5f8a', order, hidden: false, createdAt: 1, updatedAt: 1, ...x });
const CATS = [cat('a', 'A', 0), cat('b', 'B', 1), cat('c', 'C', 2)];
const E = (id, categoryId, x = {}) => ev(id, '2026-01-05T10:00', '2026-01-05T11:00', null, { categoryId, ...x });

test('既定は仕事・プライベート・家族・外出・その他の5つ。色は確定パレット（外出は濃くした #87500f）', () => {
  assert.deepEqual(DEFAULTS_NEW.map((c) => c.name), ['仕事', 'プライベート', '家族', '外出', 'その他']);
  assert.deepEqual(DEFAULTS_NEW.map((c) => c.color), ['#2f5f8a', '#8a4b6b', '#2e6b5a', '#87500f', '#5a5e62']);
  assert.equal(PALETTE.length, 12);
  assert.equal(new Set(PALETTE.map((p) => p.light)).size, 12);
  assert.equal(new Set(Object.values(CAT_IDS)).size, Object.keys(CAT_IDS).length); // id は重複しない
  assert.match(CAT_IDS.out, /0006$/); assert.match(CAT_IDS.other, /0007$/);
});

test('tint: 本色を紙色 #f7f4ed に 15% 混ぜる（design/04 の表と一致）', () => {
  assert.equal(tint('#2f5f8a'), '#d9dede');
  assert.equal(tint('#87500f'), '#e6dbcc');
  assert.equal(tint('#5a5e62'), '#dfded8');
  assert.equal(tint('#a13a3a'), '#ead8d2');
  assert.equal(tint('bad'), tint(UNCATEGORIZED.color)); // 不正な色は未分類の色で計算
});

test('validateCategory: 名前 1〜20 文字・#rrggbb・order 整数。未知の項目は保持', () => {
  assert.equal(validateCategory({ id: 'x', name: '  家 ', color: '#ABCDEF' }).value.name, '家');
  assert.equal(validateCategory({ id: 'x', name: 'n', color: '#ABCDEF' }).value.color, '#abcdef');
  assert.equal(validateCategory({ id: 'x', name: 'n', color: '#abcdef', extra: 1 }).value.extra, 1);
  assert.equal(validateCategory({ id: 'x', name: 'n', color: '#abcdef' }).value.hidden, false);
  for (const bad of [{ id: 'x', name: '', color: '#abcdef' }, { id: 'x', name: '   ', color: '#abcdef' }, { id: 'x', name: 'a'.repeat(21), color: '#abcdef' },
    { id: 'x', name: 'n', color: 'red' }, { id: 'x', name: 'n', color: '#abc' }, { id: '', name: 'n', color: '#abcdef' }, { id: 'x', name: 'n', color: '#abcdef', order: 1.5 },
    { id: 'x', name: 'n', color: '#abcdef', hidden: 'yes' }, null, []]) assert.equal(validateCategory(bad).ok, false, JSON.stringify(bad));
  assert.equal(validateCategory({ id: 'x', name: 'a'.repeat(20), color: '#abcdef' }).ok, true);
});

test('sortCategories は order → 名前 → id。元の配列は変えない', () => {
  const l = [cat('z', 'Z', 1), cat('y', 'Y', 0), cat('x', 'X', 1)];
  assert.deepEqual(sortCategories(l).map((c) => c.id), ['y', 'x', 'z']);
  assert.deepEqual(l.map((c) => c.id), ['z', 'y', 'x']);
});

test('resolveCategory: 無い id は未分類', () => {
  assert.equal(resolveCategory('b', CATS).name, 'B');
  assert.equal(resolveCategory('nope', CATS), UNCATEGORIZED);
  assert.equal(resolveCategory(undefined, CATS), UNCATEGORIZED);
});

test('legacyToId: 旧キー → 固定 id。未知・prototype のキーは null', () => {
  assert.equal(legacyToId('work'), CAT_IDS.work);
  assert.equal(legacyToId('golf'), CAT_IDS.golf);
  assert.equal(legacyToId('economy'), CAT_IDS.economy);
  assert.equal(legacyToId('xyz'), null);
  assert.equal(legacyToId('constructor'), null);
  assert.equal(legacyToId(undefined), null);
  assert.equal(withDefaults({ id: 'e', cat: 'private' }).categoryId, CAT_IDS.private);
  assert.equal(withDefaults({ id: 'e', cat: 'zzz' }).categoryId, CAT_IDS.none);
  assert.equal(withDefaults({ id: 'e', categoryId: 'k', cat: 'work' }).categoryId, 'k');
});

test('planDeleteCategory: 予定（overrides 内も）を移し先へ付け替え、予定は削除しない', () => {
  const events = [E('1', 'a'), E('2', 'b'), E('3', 'b', { overrides: { k: { title: 't', categoryId: 'a' }, j: { title: 'u', categoryId: 'c' } } }), E('4', 'c', { overrides: { k: { title: 't', categoryId: 'a' } } })];
  const r = planDeleteCategory(CATS, events, 'a', 'c', 123);
  assert.equal(r.ok, true);
  assert.deepEqual(r.catDels, ['a']);
  assert.deepEqual(r.eventPuts.map((e) => e.id).sort(), ['1', '3', '4']);
  const by = Object.fromEntries(r.eventPuts.map((e) => [e.id, e]));
  assert.equal(by['1'].categoryId, 'c');
  assert.equal(by['3'].categoryId, 'b');            // 親は a ではないので変えない
  assert.equal(by['3'].overrides.k.categoryId, 'c'); // 個別変更だけ付け替え
  assert.equal(by['3'].overrides.j.categoryId, 'c');
  assert.equal(by['4'].overrides.k.categoryId, 'c');
  assert.equal(by['1'].updatedAt, 123);
  assert.equal(events[2].overrides.k.categoryId, 'a'); // 入力は変更しない
});

test('planDeleteCategory: 最後の1件は削除できない／移し先が必要／予定が無ければ移し先は不要', () => {
  assert.equal(planDeleteCategory([cat('a', 'A', 0)], [], 'a', null).ok, false);
  assert.match(planDeleteCategory([cat('a', 'A', 0)], [], 'a', null).error, /1つ以上/);
  assert.equal(planDeleteCategory(CATS, [E('1', 'a')], 'a', null).ok, false);
  assert.equal(planDeleteCategory(CATS, [E('1', 'a')], 'a', 'a').ok, false);
  assert.equal(planDeleteCategory(CATS, [E('1', 'a')], 'a', 'zzz').ok, false);
  const none = planDeleteCategory(CATS, [E('1', 'b')], 'a', null);
  assert.equal(none.ok, true); assert.deepEqual(none.eventPuts, []);
  assert.equal(planDeleteCategory(CATS, [], 'nope', 'a').ok, false);
});

test('mergeCategories add: 同じ id は取り込む側の名前・色で上書き（order は今のまま）、新しい id は末尾へ', () => {
  const inc = [cat('a', '別名', 5, { color: '#a13a3a' }), cat('n1', 'N1', 0), cat('n2', 'N2', 1)];
  const r = mergeCategories(CATS, inc, 'add');
  assert.equal(r.conflicts, 1);
  assert.equal(r.added, 2);
  assert.deepEqual(r.categories.map((c) => c.id), ['a', 'b', 'c', 'n1', 'n2']);
  assert.equal(r.categories[0].name, '別名');
  assert.equal(r.categories[0].color, '#a13a3a');
  assert.deepEqual(r.overwritten.map((c) => c.id), ['a']);
  assert.deepEqual(r.categories.map((c) => c.order), [0, 1, 2, 3, 4]);
  assert.equal(mergeCategories(CATS, CATS, 'add').added, 0);
});
test('mergeCategories replace: ファイルのカテゴリで全置換', () => {
  const r = mergeCategories(CATS, [cat('z', 'Z', 0)], 'replace');
  assert.deepEqual(r.categories.map((c) => c.id), ['z']);
});

test('fixEventCategories: 参照先が無い予定は未分類へ（親・overrides）。必要なときだけ未分類を足す', () => {
  const r = fixEventCategories([E('1', 'a'), E('2', 'ghost', { overrides: { k: { title: 't', categoryId: 'ghost2' } } })], CATS);
  assert.deepEqual(r.events.map((e) => e.categoryId), ['a', CAT_IDS.none]);
  assert.equal(r.events[1].overrides.k.categoryId, CAT_IDS.none);
  assert.equal(r.fallbackCount, 2);
  assert.equal(r.categories.at(-1).id, CAT_IDS.none);
  assert.equal(fixEventCategories([E('1', 'a')], CATS).categories, CATS);
});

test('newCategory / moveCategory / nameTaken', () => {
  const n = newCategory(CATS, { id: 'n', name: 'N' }, 9);
  assert.equal(n.order, 3); assert.equal(n.hidden, false);
  assert.ok(PALETTE.some((p) => p.light === n.color));
  assert.notEqual(n.color, '#2f5f8a'); // 使用中の色は避ける
  const m = moveCategory(CATS, 'c', -1, 7);
  assert.deepEqual(m.list.map((c) => c.id), ['a', 'c', 'b']);
  assert.deepEqual(m.changed.map((c) => [c.id, c.order]), [['c', 1], ['b', 2]]);
  assert.deepEqual(moveCategory(CATS, 'a', -1).changed, []);
  assert.deepEqual(moveCategory(CATS, 'c', 1).changed, []);
  assert.equal(nameTaken(CATS, ' B ', 'a'), true);
  assert.equal(nameTaken(CATS, 'B', 'b'), false);
});

test('バックアップ v2（旧 cat）→ 固定 id に変換、ファイルに無い固定カテゴリは LEGACY で補う', () => {
  const file = { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [
    ev('1', '2026-11-12T10:00', '2026-11-12T11:00', null, { cat: 'economy', categoryId: undefined }),
    ev('2', '2026-11-12T10:00', '2026-11-12T11:00', null, { cat: 'golf', categoryId: undefined, recurrence: { freq: 'weekly', interval: 1, byDay: [1], count: null, until: null },
      overrides: { '2026-11-16T10:00': { title: 'o', cat: 'private', all: false, start: '2026-11-16T10:00', end: '2026-11-16T11:00' } } }),
  ] };
  for (const e of file.events) delete e.categoryId;
  const r = validateBackup(JSON.stringify(file));
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.data.events.map((e) => e.categoryId), [CAT_IDS.economy, CAT_IDS.golf]);
  assert.equal(r.data.events[1].overrides['2026-11-16T10:00'].categoryId, CAT_IDS.private);
  for (const e of r.data.events) assert.ok(!('cat' in e));
  assert.deepEqual(r.data.categories.map((c) => c.name).sort(), ['ゴルフ', 'プライベート', '経済指標'].sort());
  assert.equal(r.data.categories.find((c) => c.id === CAT_IDS.economy).color, LEGACY.economy.color);
  assert.equal(r.data.hasCategories, false);
  assert.equal(validateBackup(JSON.stringify({ ...file, version: 4 })).ok, false);
});

test('バックアップ: categoryId とカテゴリ一覧が往復する。不正なカテゴリは拒否', () => {
  const events = [E('1', CAT_IDS.family), E('2', 'custom-1')];
  const cats = [{ ...DEFAULTS_NEW[2], order: 0, hidden: true, createdAt: 1, updatedAt: 2 }, cat('custom-1', 'ヨガ', 1, { color: '#5e4c8e' })];
  const text = JSON.stringify(buildBackup(events, { view: 'month', style: 'named', desk: false }, new Date(), cats));
  const r = validateBackup(text);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.data.events.map((e) => e.categoryId), [CAT_IDS.family, 'custom-1']);
  assert.equal(r.data.hasCategories, true);
  assert.deepEqual(r.data.categories.map((c) => [c.id, c.name, c.color, c.hidden]), [[CAT_IDS.family, '家族', '#2e6b5a', true], ['custom-1', 'ヨガ', '#5e4c8e', false]]);
  const o = JSON.parse(text);
  assert.equal(validateBackup(JSON.stringify({ ...o, categories: [...o.categories, o.categories[0]] })).ok, false); // id 重複
  assert.equal(validateBackup(JSON.stringify({ ...o, categories: [{ id: 'x', name: '', color: '#000000' }] })).ok, false);
  assert.equal(validateBackup(JSON.stringify({ ...o, events: [{ ...o.events[0], categoryId: undefined }] })).ok, false);
});

test('mergeCategories add: id が違うのに同名なら「仕事 (2)」。同じ id は上書きしない', () => {
  const cur = [cat('a', '仕事', 0), cat('b', '仕事 (2)', 1)];
  const r = mergeCategories(cur, [cat('x', ' 仕事 ', 0), cat('a', '仕事', 1), cat('y', '仕事', 2)], 'add');
  assert.deepEqual(r.categories.map((c) => [c.id, c.name]), [['a', '仕事'], ['b', '仕事 (2)'], ['x', '仕事 (3)'], ['y', '仕事 (4)']]);
  assert.equal(r.renamed, 2);
  assert.equal(mergeCategories(cur, cur, 'add').added, 0);
});
test('mergeCategories add: 読み込み後も上限20。溢れは入れず、未分類の受け皿を1つ空ける', () => {
  const cur = Array.from({ length: 15 }, (_, i) => cat(`c${i}`, `C${i}`, i));
  const inc = Array.from({ length: 10 }, (_, i) => cat(`n${i}`, `N${i}`, i));
  const r = mergeCategories(cur, inc, 'add');
  assert.equal(r.categories.length, 19);
  assert.equal(r.dropped, 6);
  // 溢れた id を参照する予定は未分類へ。未分類を足しても20を超えない
  const fx = fixEventCategories([E('1', 'n9'), E('2', 'n0')], r.categories);
  assert.equal(fx.categories.length, 20);
  assert.equal(fx.events[0].categoryId, CAT_IDS.none);
  assert.equal(fx.events[1].categoryId, 'n0');
  assert.equal(fx.fallbackEvents, 1);
  // 溢れなければ受け皿は空けない
  assert.equal(mergeCategories(cur, inc.slice(0, 5), 'add').categories.length, 20);
});
test('mergeCategories replace: 20個を超えるファイルは20個まで', () => {
  const inc = Array.from({ length: 30 }, (_, i) => cat(`n${i}`, `N${i}`, i));
  const r = mergeCategories(CATS, inc, 'replace');
  assert.equal(r.categories.length, 19);
  assert.equal(r.dropped, 11);
});
test('fixEventCategories: fallbackEvents は予定の件数（親と個別変更が両方外れても1件）', () => {
  const r = fixEventCategories([E('2', 'g', { overrides: { k: { title: 't', categoryId: 'g2' } } }), E('3', 'a')], CATS);
  assert.equal(r.fallbackCount, 2);
  assert.equal(r.fallbackEvents, 1);
});

test('mergeCategories add: 同じ id の上書きが別 id と同名になるときは、上書きする側に番号（取り込まれない既存は動かさない）', () => {
  const r = mergeCategories(CATS, [cat('a', 'B', 0)], 'add');
  assert.deepEqual(r.categories.map((c) => c.name), ['B (2)', 'B', 'C']);
  assert.equal(r.renamed, 1);
});
test('mergeCategories add: 名前の入れ替え（a↔b）は両方取り込まれるなら衝突しない', () => {
  const r = mergeCategories(CATS, [cat('a', 'B', 0), cat('b', 'A', 1)], 'add');
  assert.deepEqual(r.categories.map((c) => c.name), ['B', 'A', 'C']);
  assert.equal(r.renamed, 0);
});
test('mergeCategories add: 同じ内容を2回続けて取り込んでも数・名前・色は変わらない（番号付きも安定）', () => {
  const inc = [cat('x', 'A', 0, { color: '#a13a3a' }), cat('a', 'A', 1), cat('b', 'Z', 2, { color: '#5e4c8e' })];
  const once = mergeCategories(CATS, inc, 'add');
  const twice = mergeCategories(once.categories, inc, 'add');
  assert.equal(twice.added, 0);
  assert.deepEqual(twice.categories.map((c) => [c.id, c.name, c.color]), once.categories.map((c) => [c.id, c.name, c.color]));
  assert.deepEqual(once.categories.map((c) => c.name).sort(), ['A', 'A (2)', 'C', 'Z']);
  assert.equal(mergeCategories(twice.categories, inc, 'add').categories.length, 4);
});
