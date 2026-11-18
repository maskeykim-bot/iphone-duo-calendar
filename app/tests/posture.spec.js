// 第16版 PR10: DuoNative.getPosture / postureChange の契約（Swift の写しを偽装して JS 側の受け方を確かめる）。
import { test, expect } from '@playwright/test';
import { openApp, openMenu, SIZES } from './helpers.js';

const UNSUP = { available: false, folded: false, regionRect: null, axis: null, angle: null, status: null, source: 'unsupported', at: 1 };
const H = { available: true, folded: true, regionRect: { x: 0, y: 420, width: 393, height: 12 }, axis: 'horizontal', angle: 42.5, status: 'partiallyOpen', source: 'reservedRegions', at: 2 };

async function mockPosture(page, posture, { reject = false } = {}) {
  await page.addInitScript(([po, rej]) => {
    const M = window.__mock = { calls: [], listeners: {}, posture: po };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts });
        if (method === 'getPosture') { if (rej) throw { code: 'UNIMPLEMENTED', message: 'x' }; return JSON.parse(JSON.stringify(M.posture)); }
        if (method === 'checkPermission' || method === 'reminderPermission') return { status: 'denied' };
        if (method === 'notifyStatus') return { status: 'denied' };
        throw { code: 'UNAVAILABLE', message: method };
      },
    };
  }, [posture, reject]);
}

// 契約の検証関数（Posture の型）
const valid = (p) => {
  const rectOk = p.regionRect === null || ['x', 'y', 'width', 'height'].every((k) => typeof p.regionRect[k] === 'number' && Number.isFinite(p.regionRect[k]));
  return typeof p.available === 'boolean' && typeof p.folded === 'boolean' && rectOk
    && [null, 'horizontal', 'vertical'].includes(p.axis) && (p.angle === null || typeof p.angle === 'number')
    && [null, 'closed', 'fullyOpen', 'partiallyOpen', 'unknown'].includes(p.status)
    && ['reservedRegions', 'unsupported'].includes(p.source) && Number.isFinite(p.at);
};

test.describe('折り状態の契約 (PR10)', () => {
  test('折った状態: getPosture は Posture の形で、角度は度・矩形は CSS px', async ({ page }) => {
    await mockPosture(page, H); await openApp(page);
    const r = await page.evaluate(async () => (await import('./js/native.js')).call('getPosture', {}));
    expect(r).toEqual(H);
    expect(valid(r)).toBe(true);
  });

  test('未対応（旧OS／viewなし）は available:false を resolve（reject しない）', async ({ page }) => {
    await mockPosture(page, UNSUP); await openApp(page);
    const r = await page.evaluate(async () => (await import('./js/native.js')).call('getPosture', {}));
    expect(r).toEqual(UNSUP); expect(r.folded).toBe(false); expect(r.source).toBe('unsupported');
  });

  test('開ききり・縦軸・正方形(axis=null)・角度なしも同じ形で受けられる', async ({ page }) => {
    const open = { ...H, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen' };
    const vert = { ...H, regionRect: { x: 196, y: 0, width: 8, height: 852 }, axis: 'vertical', angle: null, status: null };
    const sq = { ...H, regionRect: { x: 10, y: 10, width: 20, height: 20 }, axis: null };
    await mockPosture(page, open); await openApp(page);
    const rs = await page.evaluate(async ([a, b]) => {
      const { call } = await import('./js/native.js'); const out = [await call('getPosture', {})];
      window.__mock.posture = a; out.push(await call('getPosture', {}));
      window.__mock.posture = b; out.push(await call('getPosture', {}));
      return out;
    }, [vert, sq]);
    expect(rs).toEqual([open, vert, sq]);
    rs.forEach((p) => expect(valid(p)).toBe(true));
  });

  test('未実装のネイティブは UNIMPLEMENTED で reject。呼び出し側が握りつぶしてもアプリは起動する', async ({ page }) => {
    await mockPosture(page, UNSUP, { reject: true }); await openApp(page);
    const code = await page.evaluate(async () => { const { call, errCode } = await import('./js/native.js'); return call('getPosture', {}).catch(errCode); });
    expect(code).toBe('UNIMPLEMENTED');
    await expect(page.locator('html[data-ready]')).toHaveCount(1);
  });

  test('postureChange はリスナーへ同じ形で届く。同値連発は Swift 側で抑制（0.5px 未満）する契約を写しで確認', async ({ page }) => {
    await mockPosture(page, H); await openApp(page);
    const out = await page.evaluate(async (h) => {
      const { listen } = await import('./js/native.js');
      const got = []; listen('postureChange', (p) => got.push(p));
      // Swift の samePosture の写し: folded/available/axis が同じで矩形差 0.5px 未満なら送らない。
      const same = (a, b) => a.available === b.available && a.folded === b.folded && a.axis === b.axis
        && ((a.regionRect === null) === (b.regionRect === null))
        && (!a.regionRect || ['x', 'y', 'width', 'height'].every((k) => Math.abs(a.regionRect[k] - b.regionRect[k]) < 0.5));
      let last = null; const emit = (p) => { if (last && same(last, p)) return; last = p; window.__mock.listeners.postureChange(p); };
      emit(h);
      emit({ ...h, regionRect: { ...h.regionRect, y: 420.3 }, at: 3 }); // 0.3px: 抑制
      emit({ ...h, angle: 50, at: 4 });                                  // 角度だけ: 抑制
      emit({ ...h, regionRect: { ...h.regionRect, y: 421 }, at: 5 });    // 1px: 通す
      emit({ ...h, folded: false, regionRect: null, axis: null, at: 6 });// 開ききり: 通す
      return got;
    }, H);
    expect(out.map((p) => p.at)).toEqual([2, 5, 6]);
  });

  test('非ネイティブでは nativeAvailable が false（getPosture を呼ばない前提）', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(async () => (await import('./js/native.js')).nativeAvailable())).toBe(false);
  });
});

// 第16版 PR11: Web 側の受け取り（html.folded・矩形変数・古い取得の無視・失敗でも起動・詳細の計測）
const cls = (page) => page.evaluate(() => ({ folded: document.documentElement.classList.contains('folded'), h: document.documentElement.classList.contains('fold-h'), v: document.documentElement.classList.contains('fold-v'), y: document.documentElement.style.getPropertyValue('--hinge-y'), ht: document.documentElement.style.getPropertyValue('--hinge-h') }));
const emit = (page, p) => page.evaluate((x) => window.__mock.listeners.postureChange(x), p);

test.describe('Webで折り状態を受け取る (PR11)', () => {
  test('起動時の取得で folded/軸 class と矩形変数。開いた画面の本文配置は変えない', async ({ page }) => {
    await mockPosture(page, H); await openApp(page, SIZES.openPortrait);
    await expect.poll(() => cls(page)).toMatchObject({ folded: true, h: true, v: false, y: '420px', ht: '12px' });
    const calls = await page.evaluate(() => window.__mock.calls.map((c) => c.method));
    expect(calls.indexOf('getPosture')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('getPosture')).toBeLessThan(calls.indexOf('checkPermission'));
  });

  test('外面（閉じた画面）は folded を付けない。開いた画面へ変わると付く', async ({ page }) => {
    await mockPosture(page, H); await openApp(page, SIZES.closedPortrait);
    await expect(page.locator('html[data-ready]')).toHaveCount(1);
    expect((await cls(page)).folded).toBe(false);
    await page.setViewportSize(SIZES.openPortrait);
    await expect.poll(async () => (await cls(page)).folded).toBe(true);
  });

  test('イベントで更新・縦軸・開ききりで解除。未対応は class なし', async ({ page }) => {
    await mockPosture(page, UNSUP); await openApp(page, SIZES.openPortrait);
    expect((await cls(page)).folded).toBe(false);
    await emit(page, { ...H, axis: 'vertical', regionRect: { x: 300, y: 0, width: 10, height: 890 }, at: 5 });
    await expect.poll(() => cls(page)).toMatchObject({ folded: true, v: true, h: false });
    await emit(page, { ...H, folded: false, regionRect: null, axis: null, at: 6 });
    await expect.poll(() => cls(page)).toMatchObject({ folded: false, y: '' });
  });

  test('不正値・古い at のイベントは無視する', async ({ page }) => {
    await mockPosture(page, H); await openApp(page, SIZES.openPortrait);
    await emit(page, { available: 'yes' }); await emit(page, { ...H, regionRect: { x: 'a' }, at: 99 });
    await emit(page, { ...H, folded: false, regionRect: null, at: 1 }); // H(at:2) より古い
    expect((await cls(page)).folded).toBe(true);
  });

  test('取得失敗でも起動し、詳細に取得失敗を出す。角度は配置に使わず表示のみ', async ({ page }) => {
    await mockPosture(page, UNSUP, { reject: true }); await openApp(page, SIZES.openPortrait);
    await expect(page.locator('html[data-ready]')).toHaveCount(1);
    await openMenu(page, 'details');
    await expect(page.locator('#kb-metrics')).toContainText('取得失敗');
  });

  test('詳細に division・ヒンジ・キーボード上端との差を出す', async ({ page }) => {
    await mockPosture(page, H); await openApp(page, SIZES.openPortrait);
    await openMenu(page, 'details');
    const k = page.locator('#kb-metrics');
    await expect(k).toContainText('軸 horizontal'); await expect(k).toContainText('ヒンジ x0 y420 w393 h12');
    await expect(k).toContainText('angle 42.5°（配置には不使用）'); await expect(k).toContainText('キーボード上端との差');
  });

  test('前面復帰で再取得し、古い応答は新しいイベントを上書きしない', async ({ page }) => {
    await mockPosture(page, H); await openApp(page, SIZES.openPortrait);
    await emit(page, { ...H, folded: false, regionRect: null, axis: null, at: 50 });
    await page.evaluate(() => { window.__mock.posture = { ...window.__mock.posture, at: 3 }; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(100);
    expect((await cls(page)).folded).toBe(false); // at:3 の応答は at:50 を上書きしない
    await page.evaluate(() => { window.__mock.posture = { ...window.__mock.posture, folded: true, at: 60 }; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await cls(page)).folded).toBe(true);
  });

  test('手動「折り」代替で class が付き、解除で戻る', async ({ page }) => {
    await mockPosture(page, UNSUP); await openApp(page, SIZES.openPortrait);
    await page.evaluate(() => window.__posture.setManual(true));
    expect((await cls(page)).folded).toBe(true);
    await page.evaluate(() => window.__posture.setManual(null));
    expect((await cls(page)).folded).toBe(false);
  });
});

// 第19版 D2: 溝 [g0, g1]（開いた縦のときだけ --groove-*）
const GV = (page) => page.evaluate(() => { const s = document.documentElement.style; return ['--groove-y0', '--groove-y1', '--groove-avoid-y0', '--groove-avoid-y1', '--groove-cut-y0', '--groove-cut-y1', '--groove-source'].map((k) => s.getPropertyValue(k)); });
const OPEN = { ...H, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen' };
test.describe('溝 groove (D2)', () => {
  test('getPosture の groove は偽装した値のまま届き、開いた縦で変数になる（467〜484 → 459〜492・458〜500）', async ({ page }) => {
    await mockPosture(page, { ...OPEN, groove: { g0: 467, g1: 484, source: 'native' } }); await openApp(page, SIZES.openPortrait);
    await expect.poll(() => GV(page)).toEqual(['467px', '484px', '459px', '492px', '458px', '500px', 'native']);
  });
  test('値が native の別の位置なら式どおり。高さ0は c±8.5', async ({ page }) => {
    await mockPosture(page, { ...OPEN, groove: { g0: 480, g1: 480, source: 'native' } }); await openApp(page, SIZES.openPortrait);
    await expect.poll(() => GV(page)).toEqual(['471.5px', '488.5px', '463.5px', '496.5px', '462.5px', '504.5px', 'native']);
  });
  test('groove なし（旧ネイティブ・未対応・null）の開いた縦はフォールバック 467〜484', async ({ page }) => {
    for (const po of [UNSUP, { ...OPEN, groove: null }, OPEN]) {
      await mockPosture(page, po); await openApp(page, SIZES.openPortrait);
      await expect.poll(() => GV(page)).toEqual(['467px', '484px', '459px', '492px', '458px', '500px', 'fallback']);
    }
  });
  test('閉じた画面・開いた横では --groove-* を付けない', async ({ page }) => {
    await mockPosture(page, { ...OPEN, groove: { g0: 467, g1: 484, source: 'native' } });
    for (const sz of [SIZES.closedPortrait, SIZES.openLandscape]) {
      await openApp(page, sz);
      await expect(page.locator('html[data-ready]')).toHaveCount(1);
      expect(await GV(page)).toEqual(['', '', '', '', '', '', '']);
    }
  });
  test('開いた縦から横へ変えると変数が外れる。既存の folded・regionRect は変わらない', async ({ page }) => {
    await mockPosture(page, { ...H, groove: { g0: 467, g1: 484, source: 'native' } }); await openApp(page, SIZES.openPortrait);
    await expect.poll(() => GV(page)).toEqual(['467px', '484px', '459px', '492px', '458px', '500px', 'native']);
    await expect.poll(() => cls(page)).toMatchObject({ folded: true, y: '420px', ht: '12px' });
    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => GV(page)).toEqual(['', '', '', '', '', '', '']);
  });
  test('開閉の途中の値では動かない。落ち着くと動く（TP-25-1g）', async ({ page }) => {
    await mockPosture(page, { ...OPEN, groove: { g0: 467, g1: 484, source: 'native' } }); await openApp(page, SIZES.openPortrait);
    await expect.poll(async () => (await GV(page))[0]).toBe('467px');
    await emit(page, { ...H, at: 10, groove: { g0: 300, g1: 317, source: 'native' } });
    expect((await GV(page))[0]).toBe('467px');
    await emit(page, { ...OPEN, at: 11, groove: { g0: 470, g1: 487, source: 'native' } });
    await expect.poll(async () => (await GV(page))[0]).toBe('470px');
  });
  test('?foldprobe=1 で一時表示が出る。無ければ出ない', async ({ page }) => {
    await mockPosture(page, { ...OPEN, groove: { g0: 467, g1: 484, source: 'native' } }); await openApp(page, SIZES.openPortrait);
    await expect(page.locator('#foldprobe')).toHaveCount(0);
    await page.goto('/?foldprobe=1'); await expect(page.locator('html[data-ready]')).toHaveCount(1);
    await expect(page.locator('#foldprobe')).toContainText('g0 467 g1 484 native');
  });
});
