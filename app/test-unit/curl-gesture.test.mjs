// 第18.1版：めくりの始め方・向きの判定・速い払い（js/curl/gesture.js の純粋な関数）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandWidth, edgeDir, inLiftEdge, decideAxis, quickFlick, velocity, judgeDone } from '../js/curl/gesture.js';
import { JUDGE } from '../js/curl/params.js';
import { makeSet } from '../js/curl/geom.js';

const M = { lx0: 8, lx1: 485.5, spine: 485.5, edge: 851, py0: 66, py1: 669 }; // 951×669・右の帯 84

test('値：帯 110 / 35%、決める 10pt、横 ≥ 縦×0.7、払い 350pt/秒', () => {
  assert.deepEqual({ band: JUDGE.band, bandFrac: JUDGE.bandFrac, decide: JUDGE.decide, ratio: JUDGE.ratio, flick: JUDGE.flick, edge: JUDGE.edge }, { band: 110, bandFrac: 0.35, decide: 10, ratio: 0.7, flick: 350, edge: 24 });
});
test('帯の幅＝min(110, ページ幅×0.35)。狭いページでも辺 24 より狭くしない', () => {
  assert.equal(bandWidth(M), 110);
  assert.equal(bandWidth({ ...M, spine: 551, edge: 851 }), 105); // ページ幅 300
  assert.equal(bandWidth({ ...M, spine: 800, edge: 851 }), 24);
});
test('帯：前へ x741〜851、戻り x20〜118（左 20 は除く）。中ほどは null', () => {
  for (const x of [741, 800, 827, 851]) assert.equal(edgeDir(x, M), 'forward', `x${x}`);
  for (const x of [20, 28, 52, 118]) assert.equal(edgeDir(x, M), 'backward', `x${x}`);
  for (const x of [19, 119, 300, 485, 600, 740, 852]) assert.equal(edgeDir(x, M), null, `x${x}`);
});
test('角を持ち上げるのは辺 24 だけ（前へ x827〜、戻り x28〜52）', () => {
  assert.equal(inLiftEdge(827, 'forward', M), true); assert.equal(inLiftEdge(826, 'forward', M), false);
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
