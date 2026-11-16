import { test, expect } from '@playwright/test';
import { openApp, loadSample, SIZES } from './helpers.js';

// PR24: 共通制御（DOM 接続）。画面への本接続は次PR。ここでは initDirectInput を単体の場にぶら下げて確認する。
const setup = (page) => page.evaluate(async () => {
  const { initDirectInput } = await import('./js/direct-input.js');
  const { initSwipe } = await import('./js/swipe.js');
  const host = document.createElement('div');
  host.id = 'di'; host.style.cssText = 'position:fixed;left:40px;top:100px;width:300px;height:300px;background:#eee;z-index:99999';
  document.body.append(host);
  const w = window; w.__di = { log: [], clicks: 0, swipes: 0 };
  host.addEventListener('click', () => w.__di.clicks++);
  const sw = initSwipe({ root: host, canStart: () => true, onSwipe: () => w.__di.swipes++ });
  w.__dc = initDirectInput({ root: host, swipe: sw, classify: () => ({ kind: 'time' }),
    onStart: () => w.__di.log.push('start'), onMove: () => w.__di.log.push('move'),
    onEnd: () => w.__di.log.push('end'), onCancel: (c) => w.__di.log.push('cancel:' + c.reason) });
});
const log = (page) => page.evaluate(() => window.__di);

test.describe('direct-input DOM', () => {
  test.beforeEach(async ({ page }) => { await openApp(page, SIZES.openPortrait); await loadSample(page); await setup(page); });

  test('短い押下は確定せず click が通る', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
    const d = await log(page); expect(d.log).toEqual([]); expect(d.clicks).toBe(1);
  });
  test('長押し確定→drag→up で end、後続 click と swipe を抑止', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(250, 152, { steps: 5 }); await page.mouse.up();
    const d = await log(page);
    expect(d.log[0]).toBe('start'); expect(d.log.at(-1)).toBe('end');
    expect(d.swipes).toBe(0); expect(d.clicks).toBe(0);
  });
  test('長押し前に大きく動けば通常の swipe（確定しない）', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.mouse.move(250, 152, { steps: 5 }); await page.mouse.up();
    const d = await log(page); expect(d.log).toEqual([]); expect(d.swipes).toBe(1);
  });
  test('hidden で清掃され、続く up は無反応', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.waitForTimeout(420);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.mouse.up();
    const d = await log(page); expect(d.log).toEqual(['start', 'cancel:hidden']);
    expect(await page.evaluate(() => window.__dc.state)).toBe('idle');
  });
});
