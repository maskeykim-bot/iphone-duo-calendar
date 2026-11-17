import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGES, PAGE_IDS, BOTTOM_IDS, TIME_LABELS, normalizePages, selectPage } from '../js/pages.js';

test('既定と欠落・破損', () => {
  assert.deepEqual(normalizePages(undefined), DEFAULT_PAGES);
  assert.deepEqual(normalizePages(null), DEFAULT_PAGES);
  assert.deepEqual(normalizePages('x'), DEFAULT_PAGES);
  assert.deepEqual(normalizePages({ left: 'nope', right: 5, portraitBottom: 'month', portraitShown: 'yes' }), DEFAULT_PAGES);
});
test('有効な値は保つ', () => {
  assert.deepEqual(normalizePages({ left: 'memo', right: 'task', portraitBottom: 'task', portraitShown: true }), { left: 'memo', right: 'task', portraitBottom: 'task', portraitShown: true });
});
test('左右の重複は解消され、必ず別種類', () => {
  for (const a of ['home', 'month', 'time', 'task', 'memo']) {
    const p = normalizePages({ left: a, right: a });
    assert.equal(p.left, a);
    assert.notEqual(p.right, a);
  }
  assert.deepEqual(normalizePages({ left: 'month', right: 'month' }).right, 'home');
  assert.equal(normalizePages({ right: 'month' }).left !== 'month', true);
  assert.equal(normalizePages({ left: 'time' }).right !== 'time', true);
});
test('selectPage: 設定・同じ種類は交換・同じ選択は変化なし', () => {
  const d = DEFAULT_PAGES;
  assert.deepEqual(selectPage(d, 'left', 'time'), { ...d, left: 'time' });
  assert.deepEqual(selectPage(d, 'right', 'home'), { ...d, left: 'month', right: 'home' });
  assert.deepEqual(selectPage(d, 'left', 'task'), { ...d, left: 'task' });
  assert.deepEqual(selectPage(d, 'left', 'home'), d);
  const p = selectPage(selectPage(d, 'right', 'memo'), 'left', 'memo');
  assert.deepEqual([p.left, p.right], ['memo', 'home']);
});
test('selectPage: 不正値・不正な側・入力不変・縦の下', () => {
  const d = Object.freeze({ ...DEFAULT_PAGES });
  assert.deepEqual(selectPage(d, 'left', 'x'), d);
  assert.deepEqual(selectPage(d, 'middle', 'task'), d);
  assert.equal(selectPage(d, 'portraitBottom', 'memo').portraitBottom, 'memo');
  assert.equal(selectPage(d, 'portraitBottom', 'month').portraitBottom, 'time');
  assert.deepEqual([selectPage(d, 'portraitBottom', 'memo').left, selectPage(d, 'portraitBottom', 'memo').right], ['home', 'month']);
  assert.deepEqual(d, DEFAULT_PAGES);
});

import { normTimeMode, TIME_MODES } from '../js/pages.js';
test('normTimeMode: 不正・欠落は 1日、正しい値は保つ', () => {
  assert.deepEqual(normTimeMode(null), { left: '1', right: '1' });
  assert.deepEqual(normTimeMode({ left: 'week', right: 'x' }), { left: 'week', right: '1' });
  assert.deepEqual(normTimeMode({ left: '3', right: 'list' }), { left: '3', right: 'list' });
  assert.deepEqual(normTimeMode('week'), { left: '1', right: '1' });
  assert.deepEqual(TIME_MODES, ['1', '3', 'week', 'list']);
});

test('PR13: ホームは独立ページ。新規は左ホーム・右月、保存済みの有効な左右は尊重', () => {
  assert.deepEqual(PAGE_IDS, ['home', 'month', 'time', 'task', 'memo']);
  assert.deepEqual(BOTTOM_IDS, ['home', 'time', 'task', 'memo']);
  assert.deepEqual([DEFAULT_PAGES.left, DEFAULT_PAGES.right], ['home', 'month']);
  assert.deepEqual(normalizePages({ left: 'month', right: 'time' }), { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false });
  assert.deepEqual(normalizePages({ left: 'time', right: 'home' }).right, 'home');
  assert.equal(selectPage(DEFAULT_PAGES, 'portraitBottom', 'home').portraitBottom, 'home');
});
test('PR13: 時間のlistは値を保ち表示名はリスト', () => {
  assert.equal(TIME_LABELS.list, 'リスト');
  assert.deepEqual(normTimeMode({ left: 'list', right: undefined }), { left: 'list', right: '1' });
});

import { FOCUS_MODES, normFocusMode } from '../js/pages.js';
test('集中モードの正規化（未設定・不正は calendar、有効値は保つ）', () => {
  assert.deepEqual(FOCUS_MODES, ['calendar', 'task', 'note']);
  for (const v of [undefined, null, '', 'x', 3, {}, 'memo']) assert.equal(normFocusMode(v), 'calendar');
  for (const v of FOCUS_MODES) assert.equal(normFocusMode(v), v);
});
