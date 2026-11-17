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
