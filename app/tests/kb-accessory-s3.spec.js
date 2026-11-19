// 第19.1版 S3: キーボードの入力補助バー（∧∨✓）を消す（design/20 §2）。
// ・ネイティブのときだけ Keyboard.setAccessoryBarVisible({ isVisible: false }) を1回呼ぶ（Web では呼ばない・失敗しても例外を出さない）。
// ・帯が消えると kbTop が下がるが、入力欄・シート・ノートの本文の窓・タスクの追加欄は固定の y ではなく kbTop の真上 8 に付く。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';
import { T, seedTasks } from './task-helpers.js';

const withMode = (page, mode) => page.addInitScript(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, focusMode: m })); }, ['duo.ui.v1', mode]);
async function fakeEnv(page, { keyboard = 'plugin' } = {}) {
  await page.addInitScript((kbMode) => {
    const vv = new EventTarget(); vv.height = window.innerHeight; vv.offsetTop = 0; vv.scale = 1; vv.width = window.innerWidth;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const M = window.__mock = { listeners: {}, kb: [], posture: { available: true, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen', source: 'reservedRegions', at: 1 } };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.listeners[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        if (pl === 'Keyboard') { M.kb.push(['native', m, o]); if (kbMode === 'reject') throw { code: 'UNIMPLEMENTED' }; return {}; }
        if (m === 'getPosture') return JSON.parse(JSON.stringify(M.posture));
        if (m === 'checkPermission' || m === 'reminderPermission' || m === 'notifyStatus') return { status: 'denied' };
        throw { code: 'UNAVAILABLE', message: m };
      },
    };
    if (kbMode === 'plugin') window.Capacitor.Plugins = { Keyboard: { setAccessoryBarVisible: async (o) => { M.kb.push(['plugin', 'setAccessoryBarVisible', o]); } } };
    if (kbMode === 'throw') window.Capacitor.Plugins = { Keyboard: { setAccessoryBarVisible: () => { throw new Error('boom'); } } };
  }, keyboard);
}
const setKb = (page, kbTop) => page.evaluate(async (k) => { const vv = window.visualViewport; vv.offsetTop = 0; vv.height = k; vv.dispatchEvent(new Event('resize')); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); }, kbTop);
const bottomOf = (loc) => loc.evaluate((e) => e.getBoundingClientRect().bottom);

test.describe('入力補助バー（∧∨✓）を消す', () => {
  test('ネイティブ: Capacitor.Plugins.Keyboard.setAccessoryBarVisible({ isVisible:false }) を起動時に1回', async ({ page }) => {
    await fakeEnv(page, { keyboard: 'plugin' }); await openApp(page, SIZES.openPortrait669);
    expect(await page.evaluate(() => window.__mock.kb)).toEqual([['plugin', 'setAccessoryBarVisible', { isVisible: false }]]);
  });
  test('Plugins が無くても nativePromise("Keyboard") で消す。失敗（reject）しても例外を出さず起動する', async ({ page }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await fakeEnv(page, { keyboard: 'reject' }); await openApp(page, SIZES.closedPortrait);
    expect(await page.evaluate(() => window.__mock.kb)).toEqual([['native', 'setAccessoryBarVisible', { isVisible: false }]]);
    expect(errs).toEqual([]);
  });
  test('プラグインが同期で例外を投げても外へ出さない', async ({ page }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await fakeEnv(page, { keyboard: 'throw' }); await openApp(page, SIZES.closedPortrait);
    await expect(page.locator('html[data-ready]')).toHaveCount(1);
    expect(errs).toEqual([]);
  });
  test('Web（Capacitor なし）では何も呼ばない', async ({ page }) => {
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(() => { window.__kbcalls = 0; });
    await openApp(page, SIZES.closedPortrait);
    expect(await page.evaluate(() => typeof window.Capacitor)).toBe('undefined');
    expect(errs).toEqual([]);
  });
  test('Web の isNativePlatform が false なら呼ばない', async ({ page }) => {
    await page.addInitScript(() => { window.__n = 0; window.Capacitor = { isNativePlatform: () => false, Plugins: { Keyboard: { setAccessoryBarVisible: () => { window.__n++; } } } }; });
    await openApp(page, SIZES.closedPortrait);
    expect(await page.evaluate(() => window.__n)).toBe(0);
  });
});

test.describe('kbTop が下がっても入力欄・シートは kbTop の真上 8 に付く', () => {
  for (const kb of [590, 690]) test(`開いた縦 kbTop ${kb}: 予定の編集シートの下端 = kbTop−8`, async ({ page }) => {
    await fakeEnv(page); await openApp(page, SIZES.openPortrait669);
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#f-title').focus();
    await setKb(page, kb);
    expect(await bottomOf(page.locator('#editor'))).toBeGreaterThanOrEqual(kb - 8 - 1);
    expect(await bottomOf(page.locator('#editor'))).toBeLessThanOrEqual(kb - 8 + 1);
  });
  for (const kb of [372, 420]) test(`開いた横 kbTop ${kb}: 予定の編集シートの下端 = kbTop−8`, async ({ page }) => {
    await fakeEnv(page); await openApp(page, SIZES.openLandscape951);
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#f-title').focus();
    await setKb(page, kb);
    const b = await bottomOf(page.locator('#editor'));
    expect(Math.abs(b - (kb - 8))).toBeLessThanOrEqual(1);
  });
  for (const kb of [590, 690]) test(`開いた縦 kbTop ${kb}: タスクの追加欄の下端 = kbTop−8`, async ({ page }) => {
    await withMode(page, 'task'); await fakeEnv(page); await openApp(page, SIZES.openPortrait669);
    await seedTasks(page, [T('a1', { title: 'いち' })]); await page.locator('input.remin').focus();
    await setKb(page, kb);
    const b = await bottomOf(page.locator('input.remin'));
    expect(Math.abs(b - (kb - 8))).toBeLessThanOrEqual(1);
  });
  test('開いた横 kbTop 372: ノートのシートの本文の窓の下端 = kbTop−8（シートの下端は kbTop）', async ({ page }) => {
    await fakeEnv(page); await openApp(page, SIZES.openLandscape951);
    await page.locator('.dpage.rp .dnote').click();
    await expect(page.locator('.nsheet .ned-body')).toBeVisible(); await page.waitForTimeout(400);
    await page.locator('.nsheet .ned-body').focus();
    for (const kb of [372, 330]) {
      await setKb(page, kb);
      expect(Math.abs(await bottomOf(page.locator('.nsheet .ned-bodywrap')) - (kb - 8))).toBeLessThanOrEqual(1);
      expect(Math.abs(await bottomOf(page.locator('.nsheet')) - kb)).toBeLessThanOrEqual(1);
    }
  });
  for (const kb of [590, 690]) test(`開いた縦 kbTop ${kb}: 集中ノートの本文の窓の下端は kbTop−8 以内`, async ({ page }) => {
    await withMode(page, 'note'); await fakeEnv(page); await openApp(page, SIZES.openPortrait669);
    await page.locator('.ctl').getByRole('button', { name: 'ノートを追加' }).click();
    await expect(page.locator('.ned-body')).toBeVisible();
    await page.locator('.ned-body').focus();
    await setKb(page, kb);
    const b = await bottomOf(page.locator('.ned-bodywrap'));
    expect(b).toBeLessThanOrEqual(kb - 8 + 1);
    expect(b).toBeGreaterThan(kb - 8 - 120);
  });
});
