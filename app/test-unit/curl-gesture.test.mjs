// 第18.1版・第18.2版：めくりの始め方・向きの判定・速い払い・代わりのスクロールの慣性（js/curl/gesture.js の純粋な関数）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeDir, liftEdge, inLiftEdge, dirOf, decideAxis, quickFlick, velocity, judgeDone, momentumStep, MOMENTUM } from '../js/curl/gesture.js';
import { JUDGE } from '../js/curl/params.js';
import { makeSet } from '../js/curl/geom.js';

const M = { lx0: 8, lx1: 485.5, spine: 485.5, edge: 851, py0: 66, py1: 669 }; // 951×669・右の帯 84

test('値：決める 10pt、横 ≥ 縦×0.7、払い 350pt/秒、倍率の上限 3。帯（band）はやめた', () => {
  assert.deepEqual({ decide: JUDGE.decide, ratio: JUDGE.ratio, flick: JUDGE.flick, edge: JUDGE.edge, kMax: JUDGE.kMax }, { decide: 10, ratio: 0.7, flick: 350, edge: 24, kMax: 3 });
  assert.equal(JUDGE.band, undefined);
});
test('どこからでも：左右のページの中なら受け付ける（x20〜851）。画面の左 20・ページの外は null', () => {
  for (const x of [20, 28, 118, 300, 465, 485.5, 600, 668, 741, 851]) assert.ok(edgeDir(x, M), `x${x}`);
  for (const x of [0, 19, 852, 900]) assert.equal(edgeDir(x, M), null, `x${x}`);
});
test('向きは動かした向き：左へ＝前へ、右へ＝戻り', () => { assert.equal(dirOf(-10), 'forward'); assert.equal(dirOf(10), 'backward'); });
test('角を持ち上げるのは辺 24 だけ（前へ x827〜、戻り x28〜52）', () => {
  assert.equal(inLiftEdge(827, 'forward', M), true); assert.equal(inLiftEdge(826, 'forward', M), false);
  assert.equal(liftEdge(840, M), 'forward'); assert.equal(liftEdge(40, M), 'backward'); assert.equal(liftEdge(600, M), null);
  assert.equal(inLiftEdge(28, 'backward', M), true); assert.equal(inLiftEdge(52, 'backward', M), true); assert.equal(inLiftEdge(53, 'backward', M), false); assert.equal(inLiftEdge(20, 'backward', M), false);
});
test('向き：10pt まで決めない。横 ≥ 縦×0.7 で横', () => {
  assert.equal(decideAxis(9, 0), null); assert.equal(decideAxis(-6, 7), null);
  assert.equal(decideAxis(-10, 0), 'h'); assert.equal(decideAxis(-9, 12), 'h'); assert.equal(decideAxis(7, -10), 'h');
  assert.equal(decideAxis(-6, 12), 'v'); assert.equal(decideAxis(0, 10), 'v');
});
test('速い払い：280ms 以内に めくる向きへ 36pt 以上', () => {
  assert.equal(quickFlick('forward', -40, 120, -300), true);
  assert.equal(quickFlick('forward', -40, 400, -300), false);
  assert.equal(quickFlick('forward', -30, 120, -300), false);
  assert.equal(quickFlick('forward', 40, 120, 300), false);
  assert.equal(quickFlick('backward', 40, 200, 100), true);
  assert.equal(quickFlick('forward', -40, 120, 600), false, '最後に逆へ速く戻した');
});
test('速さ：直近 100ms。止めてから離すと 0', () => {
  assert.equal(velocity([[800, 0], [780, 20], [760, 40]], 40), -1000);
  assert.equal(velocity([[800, 0], [780, 20]], 300), 0);
  assert.equal(velocity([[800, 0], [700, 10], [690, 200], [680, 210]], 210), -1000);
});
test('離したときの判定（curl-v1 と同じ式・払い 350）', () => {
  const S = makeSet(M);
  assert.equal(judgeDone(S.forward, 700, -400), true);
  assert.equal(judgeDone(S.forward, 700, -300), false);
  assert.equal(judgeDone(S.forward, 600, 0), true);
  assert.equal(judgeDone(S.forward, 600, 400), false);
  assert.equal(judgeDone(S.backward, 200, 400), true);
});
test('代わりのスクロールの慣性：iOS の標準と同じ 0.998/ms で減速', () => {
  assert.equal(MOMENTUM.decel, 0.998);
  assert.ok(Math.abs(momentumStep(1000, 100) - 1000 * Math.pow(0.998, 100)) < 1e-9);
  let v = 2000, t = 0; while (Math.abs(v) >= MOMENTUM.minV) { v = momentumStep(v, 16); t += 16; } assert.ok(t > 1500 && t < 3500, `止まるまで ${t}ms`);
});
