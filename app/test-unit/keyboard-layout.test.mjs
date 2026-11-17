import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kbMetrics, kbText } from '../js/kbmetrics.js';

test('kbTop = offsetTop + height、推定キーボード = innerHeight − kbTop', () => {
  const m = kbMetrics({ innerHeight: 800, vv: { height: 500, offsetTop: 0, scale: 1 } });
  assert.equal(m.kbTop, 500); assert.equal(m.kbEstimate, 300);
  const n = kbMetrics({ innerHeight: 800, vv: { height: 450, offsetTop: 50, scale: 1 } });
  assert.equal(n.kbTop, 500); assert.equal(n.kbEstimate, 300);
});
test('キーボードなしは 0、負にならない', () => {
  assert.equal(kbMetrics({ innerHeight: 800, vv: { height: 800, offsetTop: 0, scale: 1 } }).kbEstimate, 0);
  assert.equal(kbMetrics({ innerHeight: 700, vv: { height: 800, offsetTop: 0, scale: 1 } }).kbEstimate, 0);
});
test('visualViewport なしは null で落ちない', () => {
  const m = kbMetrics({ innerHeight: 800, vv: null });
  assert.equal(m.kbTop, null); assert.equal(m.kbEstimate, null);
  assert.match(kbText(m), /visualViewport なし/);
  assert.doesNotThrow(() => kbMetrics()); assert.equal(kbText(null), '');
});
test('不正値・posture/segments の有無・未取得表示', () => {
  const m = kbMetrics({ innerHeight: 800, vv: { height: NaN, offsetTop: 0 } });
  assert.equal(m.kbTop, null);
  const t = kbText(kbMetrics({ innerHeight: 800, vv: { height: 500, offsetTop: 0, scale: 1 }, posture: true, segments: false }));
  assert.match(t, /devicePosture あり · segments なし/); assert.match(t, /未取得/); assert.match(t, /kbTop 500/);
});

import { screenText } from '../js/kbmetrics.js';
test('画面寸法の診断テキスト整形', () => {
  assert.equal(screenText({ innerWidth: 412, innerHeight: 915, dpr: 2.625, screenW: 412, screenH: 915, safe: { top: 24, right: 0, bottom: 16, left: 0 } }),
    '画面 412×915 CSS px ・ DPR 2.625 ・ screen 412×915\nsafe-area 上24 右0 下16 左0');
  assert.match(screenText({}), /画面 —×— CSS px/);
});
