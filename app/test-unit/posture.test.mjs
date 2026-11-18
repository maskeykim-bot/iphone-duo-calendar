import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normPosture, applyPosture, createPosture, postureText } from '../js/posture.js';

const P = (o = {}) => ({ available: true, folded: true, regionRect: { x: 0, y: 420, width: 393, height: 12 }, axis: 'horizontal', angle: 40, status: 'partiallyOpen', source: 'reservedRegions', at: 10, ...o });
const fakeEl = () => { const c = new Set(), st = {}; return { classList: { toggle: (k, on) => (on ? c.add(k) : c.delete(k)), contains: (k) => c.has(k) }, style: { setProperty: (k, v) => { st[k] = v; }, removeProperty: (k) => { delete st[k]; } }, st }; };

test('不正値は null、正しい値は正規化', () => {
  for (const bad of [null, 1, {}, P({ available: 'x' }), P({ regionRect: { x: 1 } }), P({ regionRect: { x: NaN, y: 0, width: 1, height: 1 } })]) assert.equal(normPosture(bad), null);
  assert.equal(normPosture(P({ axis: 'diag', status: 'zzz', angle: 'a' })).axis, null);
  assert.equal(normPosture(P({ available: false })).folded, false);
});
test('applyPosture: class と矩形変数。外面・未対応は解除', () => {
  const el = fakeEl(); applyPosture(el, normPosture(P()), true);
  assert.ok(el.classList.contains('folded') && el.classList.contains('fold-h')); assert.equal(el.st['--hinge-h'], '12px');
  applyPosture(el, normPosture(P()), false); assert.ok(!el.classList.contains('folded')); assert.deepEqual(el.st, {});
  applyPosture(el, normPosture(P({ axis: 'vertical' })), true); assert.ok(el.classList.contains('fold-v'));
  applyPosture(el, normPosture(P({ available: false })), true); assert.ok(!el.classList.contains('folded'));
});
test('逆順応答と古い取得はイベントを上書きしない', async () => {
  const el = fakeEl(); let resolve1; let n = 0; let emit;
  const call = () => (++n === 1 ? new Promise((r) => { resolve1 = r; }) : Promise.resolve(P({ at: 30, folded: false })));
  const c = createPosture({ call, listen: (_, cb) => { emit = cb; }, el });
  const first = c.start(); // 1回目は保留
  emit(P({ at: 20 })); // イベントが先に届く
  resolve1(P({ at: 5, folded: false })); await first; // 古い応答
  assert.equal(c.posture.at, 20); assert.ok(el.classList.contains('folded'));
  await c.refresh(); assert.equal(c.posture.at, 30); assert.ok(!el.classList.contains('folded'));
});
test('連続 refresh は後の要求が勝つ', async () => {
  const rs = []; const c = createPosture({ call: () => new Promise((r) => rs.push(r)), listen: () => {}, el: fakeEl() });
  const a = c.refresh(), b = c.refresh(); rs[1](P({ at: 8 })); rs[0](P({ at: 7, folded: false })); await Promise.all([a, b]);
  assert.equal(c.posture.at, 8);
});
test('失敗・不正応答でも落ちず、手動「折り」で代替できる', async () => {
  const el = fakeEl(); const c = createPosture({ call: async () => { throw { code: 'UNIMPLEMENTED' }; }, listen: () => { throw new Error('x'); }, el });
  await c.start(); assert.ok(c.failed); assert.ok(!el.classList.contains('folded'));
  c.setManual(true); assert.ok(el.classList.contains('folded')); c.setManual(null); assert.ok(!el.classList.contains('folded'));
  const d = createPosture({ call: async () => ({ bad: 1 }), listen: () => {}, el }); assert.equal(await d.refresh(), false); assert.equal(d.posture, null);
});
test('postureText: 未取得・失敗・未対応・差', () => {
  assert.match(postureText(null), /未取得/); assert.match(postureText(null, { failed: true }), /失敗/);
  assert.match(postureText(normPosture(P({ available: false }))), /未対応/);
  assert.match(postureText(normPosture(P()), { kbTop: 400 }), /差 20/);
  assert.match(postureText(null, { native: false }), /非ネイティブ/);
});

import { normGroove, grooveBands, applyGroove, FALLBACK_GROOVE } from '../js/posture.js';
test('normGroove: null・非数・g1<g0 は null。高さ 0 と 17 未満は中心 c±8.5', () => {
  for (const bad of [null, undefined, 1, {}, { g0: 'a', g1: 2 }, { g0: NaN, g1: 2 }, { g0: 500, g1: 400 }]) assert.equal(normGroove(bad), null);
  assert.deepEqual(normGroove({ g0: 475.5, g1: 475.5, source: 'native' }), { g0: 467, g1: 484, source: 'native' });
  assert.deepEqual(normGroove({ g0: 467, g1: 484, source: 'native' }), { g0: 467, g1: 484, source: 'native' });
  assert.equal(normGroove({ g0: 467, g1: 484, source: 'zzz' }).source, 'fallback');
});
test('式: 467〜484 → avoid 459〜492・cut 458〜500', () => {
  assert.deepEqual(grooveBands(FALLBACK_GROOVE), { avoid: [459, 492], cut: [458, 500] });
});
test('applyGroove: 開いた縦だけ変数。ほかは外す。値なしはフォールバック', () => {
  const el = fakeEl();
  applyGroove(el, null, true);
  assert.equal(el.st['--groove-y0'], '467px'); assert.equal(el.st['--groove-avoid-y1'], '492px'); assert.equal(el.st['--groove-cut-y0'], '458px'); assert.equal(el.st['--groove-cut-y1'], '500px'); assert.equal(el.st['--groove-source'], 'fallback');
  applyGroove(el, { g0: 500, g1: 520, source: 'native' }, true);
  assert.equal(el.st['--groove-cut-y0'], '491px'); assert.equal(el.st['--groove-source'], 'native');
  applyGroove(el, { g0: 500, g1: 520, source: 'native' }, false);
  assert.deepEqual(el.st, {});
});
test('createPosture: groove は開閉の途中で跳ねない（同値が続く／fullyOpen・closed で採用）', async () => {
  const el = fakeEl(); let emit;
  const c = createPosture({ call: async () => P({ at: 1, groove: { g0: 467, g1: 484, source: 'native' }, status: 'fullyOpen' }), listen: (_, cb) => { emit = cb; }, el, portrait: () => true });
  await c.start(); assert.equal(c.groove.g0, 467); assert.equal(el.st['--groove-y0'], '467px');
  emit(P({ at: 2, status: 'partiallyOpen', groove: { g0: 440, g1: 457, source: 'native' } })); assert.equal(c.groove.g0, 467); // 動いている途中
  emit(P({ at: 3, status: 'partiallyOpen', groove: { g0: 430, g1: 447, source: 'native' } })); assert.equal(c.groove.g0, 467); // 値が違う
  emit(P({ at: 4, status: 'partiallyOpen', groove: { g0: 430.2, g1: 447.3, source: 'native' } })); assert.equal(c.groove.g0, 430.2); // 同値が続いた
  emit(P({ at: 5, status: 'fullyOpen', groove: { g0: 467, g1: 484, source: 'native' } })); assert.equal(c.groove.g0, 467);
  emit(P({ at: 6, groove: null })); assert.equal(c.groove, null); assert.equal(el.st['--groove-y0'], '467px'); // 開いた縦で値なし→フォールバック
});
test('createPosture: 開いた縦でない（portrait=false）と変数なし', async () => {
  const el = fakeEl();
  const c = createPosture({ call: async () => P({ groove: { g0: 467, g1: 484, source: 'native' } }), listen: () => {}, el, portrait: () => false });
  await c.start(); assert.equal(el.st['--groove-y0'], undefined);
});
