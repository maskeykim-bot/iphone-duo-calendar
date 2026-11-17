// 第16版 PR10: DuoNative.getPosture / postureChange の契約（Swift の写しを偽装して JS 側の受け方を確かめる）。
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

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
