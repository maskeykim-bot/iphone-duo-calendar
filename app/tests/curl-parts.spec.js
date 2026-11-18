import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DARK, K, TUNE, TIME, JUDGE } from '../js/curl/params.js';

// 第18版 PR2：めくりの部品 js/curl/ の検査（Chromium と WebKit）。アプリからはまだ使わない。
// 正本：design/IMPL_PLAN_V18.md PR2、qa/verify-curl-integration.md 2章、qa/proto-curl-shadow-2026-11-18.md（CS-15〜18）。
test.use({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
test.setTimeout(120000);

const V1 = { W: 868, H: 669, spine: 484, edge: 860, py0: 8, py1: 661, lx0: 8, lx1: 458 }; // curl-v1 の寸法
const APP = { W: 951, H: 669, spine: 485.5, edge: 851, py0: 0, py1: 603, lx0: 8, lx1: 465.5 }; // アプリ座標（右の帯 84）
const APP_N = { W: 890, H: 626, spine: 455, edge: 790, py0: 0, py1: 560, lx0: 8, lx1: 435 }; // 幅 890・高さ 626（同じ決まりで計算）
const HARNESS = readFileSync('tests/fixtures/curl-harness.html', 'utf8');
const V1HTML = readFileSync('tests/fixtures/curl-v1.html');
const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const lum = (px, i) => (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;

async function openHarness(page) {
  await page.route('**/__curl-harness.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: HARNESS }));
  await page.goto('/__curl-harness.html'); await page.waitForFunction(() => window.__ready);
}
async function openV1(page, q = '?plain=1') {
  await page.route(/__curl-v1\.html/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: V1HTML }));
  await page.goto('/__curl-v1.html' + q); await page.waitForFunction(() => window.__curl); await page.evaluate(() => window.__curl.ready());
  await page.addStyleTag({ content: '#hud{display:none}' });
}
const init = (page, o) => page.evaluate((o) => window.__h.init(o), o);
const pose = (page, dir, gy, f, o) => page.evaluate(([dir, gy, f, o]) => window.__h.pose(dir, gy, f, o), [dir, gy, f, o || {}]);
// 5 姿勢（curl-v1 の cs16-poses：つかみ始め・1/4・半分・3/4・離す直前）。curl-v1 の座標。アプリ座標へは右下の角からの位置をそろえて写す（SHIFT）
const POSES = [['1-start', [846, 602]], ['2-quarter', [690, 575]], ['3-half', [520, 540]], ['4-3q', [350, 520]], ['5-before', [230, 570]]];
const toApp = (f, d) => [f[0] + (d.edge - 860), f[1] + (d.py1 - 661)];

// 面の色分け（赤＝表、緑＝裏）の内側だけで、1pt おきの輝度の2階差を読む（cs16_scan.py と同じ）
function erode(a, w, h, k = 4) {
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 1; for (let i = Math.max(0, x - k); i <= Math.min(w - 1, x + k); i++) if (!a[y * w + i]) { v = 0; break; } t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 1; for (let j = Math.max(0, y - k); j <= Math.min(h - 1, y + k); j++) if (!t[j * w + x]) { v = 0; break; } o[y * w + x] = v; }
  return o;
}
function scan2nd(img, mask, w, h, P, n) {
  const red = new Uint8Array(w * h), grn = new Uint8Array(w * h), L = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) { const r = mask[i * 4], g = mask[i * 4 + 1], b = mask[i * 4 + 2]; red[i] = r > 200 && g < 60 && b < 60 ? 1 : 0; grn[i] = g > 200 && r < 60 && b < 60 ? 1 : 0; L[i] = Math.round(lum(img, i * 4)); }
  const er = erode(red, w, h), eg = erode(grn, w, h); let paperPx = 0, bad = 0, badOutside = 0, max2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 4; x++) {
    const i = y * w + x; if (!(((er[i + 2] | eg[i + 2]) && (er[i] | eg[i]) && (er[i + 4] | eg[i + 4])))) continue;
    paperPx++;
    const d1a = L[i + 2] - L[i], d1b = L[i + 4] - L[i + 2], d2 = Math.abs(d1b - d1a); max2 = Math.max(max2, d2);
    if (d2 > 4) { bad++; const dist = Math.abs((x + 2) / 2 * n[0] + y / 2 * n[1] - (P[0] * n[0] + P[1] * n[1])); if (!(dist <= 11 && er[i + 2])) badOutside++; }
  }
  return { paperPx, max2, bad, badOutside };
}

test.describe('js/curl/ の部品（第18版 PR2）', () => {
  test('曲がり方・時間・判定の値は curl-v1 のまま凍結され、DARK.enabled は false・ライトの紙は #FFFDFA', async () => {
    expect(createHash('sha256').update(V1HTML).digest('hex')).toBe('dfb1e232881e1ec5ffbfa707cc988cd6d84fff1a516ad1cf69a27f2b56962c88'); // 写した curl-v1
    expect(DARK.enabled).toBe(false);
    expect(DARK.paper).toBe('#262A27'); expect(DARK.line).toBe('#343A36');
    expect(Object.isFrozen(K)).toBe(true); expect(Object.isFrozen(TUNE)).toBe(true); expect(Object.isFrozen(DARK)).toBe(true);
    expect(K).toMatchObject({ show: 0.16, nextOnBack: 1, hiF: 0.38, dkF0: 0.06, dkF1: 0.36, dkFa: 43, dkFb: 89, dkFm: 0.0045, dkB: 0.30, hiB: 0.45, hiMinW: 3, hiMask: 1, hiDark: 0.25, ampR0: 8, ampR1: 28, rootA0: 0.12, rootIn: 10, rootOut0: 9, rootOutK: 1, shBl0: 7, shBlK: 34, shOp0: 0.42, shOpK: 0.22, darkShadow: 0.5, grid: 2 });
    expect(TUNE).toEqual({ maxTilt: 35, r0: 14, rk: 0.18, rMax: 58, flatten: 90 });
    expect(TIME).toMatchObject({ page: 300, back: 220, fade: 150, showFrom: 0.6 }); expect(JUDGE.flick).toBe(350);
    const light = await import('../js/curl/params.js'); expect(light.LIGHT.paper).toBe('#FFFDFA'); expect(light.LIGHT.back).toBe('#FFFDFA'); expect(light.LIGHT.line).toBe('#EEEAE1');
    const idx = readFileSync('js/curl/index.js', 'utf8'); expect(idx).not.toMatch(/import\s*\(/);
    for (const f of ['js/swipe.js', 'js/direct-input.js']) expect(readFileSync(f, 'utf8')).not.toMatch(/curl\//); // アプリの操作からは import しない
    expect([...readFileSync('js/app.js', 'utf8').matchAll(/from '\.\/curl\/([^']+)'/g)].map((m) => m[1])).toEqual(['painter.js', 'index.js', 'native-curl.js']); // PR4: app.js が読むのは painter と index（めくり）。B1：iOS のめくりの切り替え（native-curl）
  });

  for (const [dn, dir, poses] of [
    ['前へ（forward）', 'forward', POSES.map(([n, f]) => [n, f, 600])],
    ['戻る（backward）', 'backward', [['b1', [250, 300], 300], ['b2', [380, 500], 600], ['b3', [450, 334], 334]]],
  ]) {
    test(`curl-v1 との一致 ${dn}：同じ寸法・姿勢・紙（plain #F7F4ED）で画素の差 2 段まで`, async ({ page, browser, browserName }) => {
      const p2 = await page.context().newPage(); // curl-v1
      await openV1(p2); await openHarness(page);
      await init(page, { dims: V1, dpr: 2, paper: '#F7F4ED', text: false, k: { nextOnBack: 0, fitLeft: 0 } }); // 18.3 の紙の広げは切る。曲がり方・陰影の一致を見る（18.2 の裏の絵は別の試験）
      let worst = 0;
      for (const [name, f, gy] of poses) {
        const a = await p2.evaluate(async ([dir, gy, f]) => {
          window.__curl.pose(dir, gy, f); const g = window.__curl.gl, gl = g.gl, w = 868 * g.dpr, h = 669 * g.dpr, px = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(new Blob([px])); });
        }, [dir, gy, f]);
        const b = (await pose(page, dir, gy, f, { read: { x: 0, y: 0, w: 868, h: 669 }, rawRead: true })).b64;
        const A = b64(a), B = b64(b); expect(B.length).toBe(A.length);
        let mx = 0, nz = 0; for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d > mx) mx = d; if (d > 2) nz++; }
        test.info().annotations.push({ type: `${browserName} ${name}`, description: `最大差 ${mx} 段、2 段超 ${nz} 画素` });
        expect(mx, `${name} の最大差`).toBeLessThanOrEqual(2); worst = Math.max(worst, mx);
      }
      await p2.close();
    });
  }

  for (const [dn, dims] of [['951×669', APP], ['890×626', APP_N]]) {
    test(`CS-15 紙の形（アプリ座標 ${dn}）：進む・戻る各 700 点＋格子 420 点で外れ 0、傾き ≤ 35°`, async ({ page }) => {
      await openHarness(page); await init(page, { dims, dpr: 1 });
      for (const dir of ['forward', 'backward']) {
        const r = await page.evaluate((dir) => window.__h.checkGeometry(dir, true), dir);
        expect(r.points).toBe(700 + 420); expect(r.fails.length).toBe(0);
        expect(r.maxSpineMove).toBeLessThan(0.01); expect(r.maxEdgeErr).toBeLessThan(0.002);
        expect(r.foldLeftOfSpine).toBe(0); expect(r.cornerFar).toBe(0); expect(r.maxTilt).toBeLessThanOrEqual(35.01); expect(r.pass).toBe(true);
      }
    });
  }

  test('CS-16 plain の5姿勢（dpr 2）：1pt おきの輝度の2階差がしきい値（4 段）を超える所 0', async ({ page, browserName }) => {
    await openHarness(page); await init(page, { dims: APP, dpr: 2, text: false, k: { backLine: 0 } });
    for (const [name, f0] of POSES) {
      const f = toApp(f0, APP), gy = 600 + (APP.py1 - 661);
      const rect = { x: 0, y: 0, w: APP.W, h: APP.H };
      const a = await pose(page, 'forward', gy, f, { read: rect }), m = await pose(page, 'forward', gy, f, { read: rect, debug: true });
      const r = scan2nd(b64(a.b64), b64(m.b64), a.size[0], a.size[1], a.shape.P, a.shape.n);
      test.info().annotations.push({ type: `${browserName} CS-16 ${name}`, description: JSON.stringify(r) });
      expect(r.paperPx).toBeGreaterThan(100000); expect(r.badOutside, `${name}`).toBe(0);
    }
  });

  // 根元の影：on（rootA0=0.12）と off（0）を同じ姿勢で撮り、折れ線に沿った 9 本・3×3 平均の暗さ (1 − on/off) を読む
  async function rootProfile(page, dark, name, gy, f, paper) {
    const rect = { x: 740, y: 100, w: 211, h: 440 }, out = {};
    const shots = {};
    for (const [tag, k] of [['on', {}], ['off', { rootA0: 0 }]]) {
      await init(page, { dims: APP, dpr: 2, dark, text: false, k: { backLine: 0, ...k } });
      const r = await pose(page, 'forward', gy, f, { read: rect }); shots[tag] = { px: b64(r.b64), w: r.size[0], P: r.shape.P, n: r.shape.n, lift: r.shape.lift };
    }
    const { P, n, lift, w } = shots.on, mean = (px, x, y) => { let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += lum(px, ((Math.round(2 * (y - rect.y)) + j) * w + Math.round(2 * (x - rect.x)) + i) * 4); return s / 9; };
    const at = (s) => { let t = 0; for (let k = -4; k <= 4; k++) { const cx = P[0] - n[1] * 4 * k + n[0] * s, cy = P[1] + n[0] * 4 * k + n[1] * s; t += (1 - mean(shots.on.px, cx, cy) / Math.max(1, mean(shots.off.px, cx, cy))) * 100; } return t / 9; };
    return { m10: at(-10), m5: at(-5), z: at(0), p2: at(2), out: at(9 + lift + 0.5), lift, r: 0 };
  }
  for (const pc of [['縦の始め', 334, [826, 334]], ['縦のもう少し', 334, [806, 334]]]) {
    test(`根元の影（${pc[0]}）：−10pt で 0%、0pt で 12%（11.9% 前後）、巻き側 9＋1×lift で 0（ライト）`, async ({ page, browserName }) => {
      await openHarness(page); const r = await rootProfile(page, false, pc[0], pc[1], pc[2]);
      test.info().annotations.push({ type: `${browserName} 根元 ${pc[0]}`, description: JSON.stringify(r) });
      expect(Math.abs(r.m10)).toBeLessThan(0.5); expect(r.z).toBeGreaterThan(11.9 - 0.5); expect(r.z).toBeLessThan(11.9 + 0.5); expect(Math.abs(r.out)).toBeLessThan(0.5);
      expect(r.m5).toBeGreaterThan(1); expect(r.m5).toBeLessThan(8);
    });
  }
  test('根元の影（ダーク強制・紙 #262A27）：0pt で 12%（±1段）', async ({ page, browserName }) => {
    await openHarness(page); const r = await rootProfile(page, true, '縦の始め', 334, [826, 334]);
    test.info().annotations.push({ type: `${browserName} 根元 ダーク`, description: JSON.stringify(r) });
    const step = 100 / 41; // 紙 #262A27 の輝度は約 41。1段 ≒ 2.4%
    expect(r.z).toBeGreaterThan(12 - step); expect(r.z).toBeLessThan(12 + step); expect(Math.abs(r.m10)).toBeLessThan(step); expect(Math.abs(r.out)).toBeLessThan(step);
  });

  test('CS-18 背の近く：ライトは紙の明るさが平らな所と同じ（差 0）、ダーク強制は最も明るい所が背景より +24 まで', async ({ page, browserName }) => {
    await openHarness(page);
    const pct = (arr, p) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p / 100 * a.length))]; };
    for (const dark of [false, true]) {
      await init(page, { dims: APP, dpr: 2, dark, text: false });
      for (const fx of [700, 640, 600, 560, 522]) {
        const r = await pose(page, 'forward', 334, [fx - 9, 334], { read: { x: 0, y: 0, w: APP.W, h: APP.H } });
        const px = b64(r.b64), W = r.size[0], F = r.f[0], x0 = Math.floor(2 * F) + 4, x1 = Math.floor(2 * (r.shape.P[0] + r.shape.r)) - 4, paper = [], flat = [];
        for (let y = 120; y < 1200; y++) { for (let x = x0; x < x1; x++) paper.push(Math.round(lum(px, (y * W + x) * 4))); for (let x = 600; x < 880; x++) flat.push(Math.round(lum(px, (y * W + x) * 4))); }
        const v = pct(paper, 75), fl = pct(flat, 75), top = pct(paper, 99.5);
        test.info().annotations.push({ type: `${browserName} CS-18 ${dark ? 'ダーク' : 'ライト'} F=${fx}`, description: `差 ${v - fl}、最明-平ら ${top - fl}` });
        if (!dark) expect(Math.abs(v - fl)).toBeLessThanOrEqual(0.5); else expect(top - fl).toBeLessThanOrEqual(24);
      }
    }
  });

  test('テクスチャの作成と deleteTexture、dispose で個数が合う。コンテキストを失うと draw は null、復帰後に作り直せば描ける', async ({ page }) => {
    await openHarness(page); await init(page, { dims: APP, dpr: 1, text: true });
    await pose(page, 'forward', 300, [600, 300]);
    expect(await page.evaluate(() => window.__h.stats().textures)).toBe(6);
    await page.evaluate(() => window.__h.scene('backward')); // 向きを替える（前の絵は呼び手が捨てる前提。ここでは数だけ）
    expect(await page.evaluate(() => window.__h.stats().textures)).toBe(12);
    await page.evaluate(() => window.__h.loseContext());
    await page.waitForFunction(() => window.__h.lost());
    expect(await page.evaluate(() => window.__h.stats().textures)).toBe(0);
    await page.evaluate(() => window.__h.restoreContext());
    await page.waitForFunction(() => !window.__h.lost());
    const r = await pose(page, 'forward', 300, [600, 300], { read: { x: 400, y: 200, w: 200, h: 200 } });
    expect(r.shape.r).toBeGreaterThan(0); expect(r.b64.length).toBeGreaterThan(100);
    expect(await page.evaluate(() => window.__h.dispose())).toEqual({ before: 6, after: 0, lost: true }); // 復帰後に作った 6 枚が dispose で全部捨てられる
  });
});
