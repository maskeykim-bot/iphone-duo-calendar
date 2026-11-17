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

// ---- 第16版 PR34: kbTop と折り目の溝に合わせた配置 ----
import { kbTopOf, hingeBand, computeKbLayout, scrollDelta, MARGIN } from '../js/keyboard-layout.js';
const H = 951, hinge = hingeBand({ height: H });
const lay = (kbTop, extra = {}) => computeKbLayout({ H, kbTop, hinge, top: 82, ...extra });
const inGroove = (t, b) => t < hinge.bottom && b > hinge.top;

test('kbTopOf: offsetTop+height。拡大中・不正値は null、innerHeight を超えない', () => {
  assert.equal(kbTopOf({ height: 590, offsetTop: 0, scale: 1 }, 951), 590);
  assert.equal(kbTopOf({ height: 500, offsetTop: 90, scale: 1 }, 951), 590);
  assert.equal(kbTopOf({ height: 590, offsetTop: 0, scale: 2 }, 951), null);
  assert.equal(kbTopOf({ height: NaN }, 951), null); assert.equal(kbTopOf(null, 951), null);
  assert.equal(kbTopOf({ height: 1200, offsetTop: 0, scale: 1 }, 951), 951);
});
test('溝: 実矩形があればそれ、縦軸や形が合わなければ中央±8.5', () => {
  assert.deepEqual(hingeBand({ rect: { x: 0, y: 420, width: 393, height: 12 }, axis: 'horizontal', height: 852 }), { top: 420, bottom: 432, real: true });
  assert.equal(hingeBand({ rect: { x: 196, y: 0, width: 8, height: 852 }, axis: 'vertical', height: 852 }).real, false);
  assert.deepEqual(hingeBand({ height: 951 }), { top: 467, bottom: 484, real: false });
});
test('kbTop 690: 追加欄 kbTop−56〜−8、補助 44 はその上、下面に一覧の続き', () => {
  const l = lay(690);
  assert.deepEqual([l.add.top, l.add.bottom, l.add.avoided], [634, 682, false]);
  assert.deepEqual([l.assist.hitTop, l.assist.hitBottom, l.assist.visHeight], [586, 630, 44]);
  assert.equal(l.dn.top, 492); assert.ok(l.dn.bottom <= 582); assert.equal(l.up.bottom, 459);
});
test('kbTop 590: 補助は見た目 40・当たり 44、溝に入らず、一覧は上面だけ', () => {
  const l = lay(590);
  assert.deepEqual([l.add.top, l.add.bottom], [534, 582]);
  assert.deepEqual([l.assist.hitTop, l.assist.hitHeight, l.assist.visTop, l.assist.visHeight], [488, 44, 492, 40]);
  assert.equal(inGroove(l.assist.hitTop, l.assist.hitBottom), false); assert.equal(l.dn, null);
});
test('kbTop 484 以上（さらに上）: 追加欄は上面の下端へ避け、補助はその上。溝に入らない', () => {
  for (const kb of [484, 470, 400, 300]) {
    const l = lay(kb);
    for (const r of [[l.add.top, l.add.bottom], [l.assist.hitTop, l.assist.hitBottom]]) assert.equal(inGroove(...r), false, `kb${kb}`);
    assert.ok(l.add.bottom <= hinge.top - MARGIN + 0.01 || l.add.bottom === kb - 8, `kb${kb}`);
    assert.ok(l.up.bottom <= hinge.top - MARGIN);
    assert.ok(l.assist.hitBottom <= l.add.top, `kb${kb} 補助は追加欄の上`);
  }
  const l = lay(484); assert.deepEqual([l.add.top, l.add.bottom, l.add.avoided], [411, 459, true]);
});
test('kbTop を 400〜951 で動かしても、追加欄・補助は溝に入らず、重ならず、追加欄は下端 0〜8pt（避けた時を除く）', () => {
  for (let kb = 400; kb <= 940; kb += 3) {
    const l = lay(kb);
    assert.equal(inGroove(l.add.top, l.add.bottom), false, `add kb${kb}`);
    assert.equal(inGroove(l.assist.hitTop, l.assist.hitBottom), false, `assist kb${kb}`);
    assert.ok(l.assist.hitBottom <= l.add.top || l.assist.hitTop >= l.add.bottom, `重なり kb${kb}`);
    assert.equal(l.assist.hitHeight, 44);
    if (!l.add.avoided) { const gap = l.kbTop - l.add.bottom; assert.ok(gap >= 0 && gap <= 8, `gap kb${kb}: ${gap}`); }
    assert.ok(l.assist.visHeight >= 36);
  }
});
test('実際の溝の矩形（別の位置・太さ）でも同じ規則', () => {
  const h = hingeBand({ rect: { x: 0, y: 420, width: 393, height: 12 }, axis: 'horizontal', height: 852 });
  for (let kb = 300; kb <= 840; kb += 7) {
    const l = computeKbLayout({ H: 852, kbTop: kb, hinge: h, top: 80 });
    assert.equal(l.add.top < h.bottom && l.add.bottom > h.top, false, `kb${kb}`);
    assert.equal(l.assist.hitTop < h.bottom && l.assist.hitBottom > h.top, false, `as kb${kb}`);
  }
});
test('キーボードなし／ノート（追加欄なし）: 補助がキーボードの真上、下面に本文の窓', () => {
  const none = lay(null); assert.equal(none.active, false); assert.equal(none.kbTop, null);
  const n = computeKbLayout({ H, kbTop: 590, hinge, top: 126, hasAdd: false, restMin: 36 });
  assert.equal(n.add, null); assert.equal(n.assist.hitBottom, 582); assert.equal(n.assist.hitTop, 538); assert.equal(n.up.top, 126);
  const w = computeKbLayout({ H, kbTop: 690, hinge, top: 126, hasAdd: false });
  assert.deepEqual([w.dn.top, w.dn.bottom], [492, 634]);
});
test('scrollDelta: 見えていれば 0、下に隠れたら下端へ、上に隠れたら上端へ', () => {
  const v = { viewTop: 100, viewBottom: 300 };
  assert.equal(scrollDelta({ itemTop: 150, itemBottom: 174, ...v }), 0);
  assert.equal(scrollDelta({ itemTop: 290, itemBottom: 314, ...v }), 22);
  assert.equal(scrollDelta({ itemTop: 90, itemBottom: 114, ...v }), -18);
});
test('ノート折り 590: 下面に「ほかのノート」1 行ぶん（36 以上）が残る', () => {
  const n = computeKbLayout({ H, kbTop: 590, hinge, top: 126, hasAdd: false, restMin: 36 });
  assert.ok(n.dn && n.dn.height >= 36 && n.dn.top === 492);
});
