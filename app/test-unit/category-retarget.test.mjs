// 旧カテゴリの一度きり移行（純粋計画 planCategoryRetarget）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAT_IDS, DEFAULTS_NEW, LEGACY, planCategoryRetarget } from '../js/categories.js';
import { ev } from './fixtures.mjs';

const C = (id, name, order, x = {}) => ({ id, name, color: '#2f5f8a', order, hidden: false, createdAt: 1, updatedAt: 1, ...x });
const OLD = [
  C(CAT_IDS.work, '仕事', 0, { hidden: true }), C(CAT_IDS.private, 'プライベート', 1, { hidden: true }),
  C(CAT_IDS.golf, 'ゴルフ', 2, { hidden: true }), C(CAT_IDS.economy, '経済指標', 3, { hidden: true }),
];
const E = (id, categoryId, x = {}) => ev(id, '2026-01-05T10:00', '2026-01-05T11:00', null, { categoryId, ...x });
const NOW = 1000;

test('旧4カテゴリ・全て非表示: 5つ補完、旧2種削除、残り全表示、予定は親とoverridesだけ付替', () => {
  const evs = [E('g', CAT_IDS.golf), E('x', CAT_IDS.economy), E('w', CAT_IDS.work),
    E('o', CAT_IDS.work, { overrides: { a: { categoryId: CAT_IDS.golf, title: 't' }, b: { categoryId: CAT_IDS.work } } }),
    E('both', CAT_IDS.golf, { overrides: { a: { categoryId: CAT_IDS.economy } } })];
  const before = JSON.stringify(evs);
  const p = planCategoryRetarget(OLD, evs, NOW);
  assert.equal(JSON.stringify(evs), before); // 入力は不変
  assert.deepEqual(p.catDels.sort(), [CAT_IDS.golf, CAT_IDS.economy].sort());
  assert.equal(p.moved, 4); // g, x, o, both（親の数）
  const by = Object.fromEntries(p.eventPuts.map((e) => [e.id, e]));
  assert.equal(by.g.categoryId, CAT_IDS.other);
  assert.equal(by.o.categoryId, CAT_IDS.work);
  assert.equal(by.o.overrides.a.categoryId, CAT_IDS.other);
  assert.equal(by.o.overrides.a.title, 't');
  assert.equal(by.o.overrides.b.categoryId, CAT_IDS.work);
  assert.equal(by.both.overrides.a.categoryId, CAT_IDS.other);
  assert.ok(!by.w);
  const puts = Object.fromEntries(p.catPuts.map((c) => [c.id, c]));
  for (const id of [CAT_IDS.family, CAT_IDS.out, CAT_IDS.other]) assert.equal(puts[id].hidden, false);
  assert.equal(puts[CAT_IDS.work].hidden, false); assert.equal(puts[CAT_IDS.work].name, '仕事');
  assert.ok(!puts[CAT_IDS.golf] && !puts[CAT_IDS.economy]);
  assert.deepEqual([CAT_IDS.family, CAT_IDS.out, CAT_IDS.other].map((id) => puts[id].order), [4, 5, 6]);
});

test('0件: 予定が無くても旧2種は消え、moved=0', () => {
  const p = planCategoryRetarget(OLD, [], NOW);
  assert.equal(p.moved, 0); assert.equal(p.catDels.length, 2); assert.equal(p.eventPuts.length, 0);
});

test('overrides だけが旧カテゴリでも移し、moved は親1件', () => {
  const p = planCategoryRetarget(OLD, [E('o', CAT_IDS.work, { overrides: { a: { categoryId: CAT_IDS.golf }, b: { categoryId: CAT_IDS.economy } } })], NOW);
  assert.equal(p.moved, 1);
});

test('既存の同id・改名・色・順序は保持。同名別idは触らない。自作カテゴリは残る', () => {
  const cats = [C(CAT_IDS.work, '会議', 7, { color: '#a13a3a' }), C(CAT_IDS.other, '雑多', 3), C('mine', 'ゴルフ', 9), C(CAT_IDS.golf, '競技', 1)];
  const p = planCategoryRetarget(cats, [E('g', CAT_IDS.golf)], NOW);
  assert.deepEqual(p.catPuts.map((c) => c.id).sort(), [CAT_IDS.family, CAT_IDS.out, CAT_IDS.private].sort()); // work/other/mine は変更なし
  assert.deepEqual(p.catDels, [CAT_IDS.golf]);
  assert.equal(p.eventPuts[0].categoryId, CAT_IDS.other); // 改名後の「雑多」へ
});

test('空のカテゴリ（新規）: 既定5つを足すだけ。再計画は何もしない（冪等）', () => {
  const p = planCategoryRetarget([], [], NOW);
  assert.deepEqual(p.catPuts.map((c) => [c.id, c.name, c.color]), DEFAULTS_NEW.map((c) => [c.id, c.name, c.color]));
  const applied = p.catPuts;
  const again = planCategoryRetarget(applied, [], NOW);
  assert.deepEqual([again.catPuts, again.catDels, again.eventPuts, again.moved], [[], [], [], 0]);
});

test('LEGACY の旧id定数が移行対象と一致', () => {
  assert.equal(LEGACY.golf.id, CAT_IDS.golf); assert.equal(LEGACY.economy.id, CAT_IDS.economy);
});
