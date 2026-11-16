import { test, expect } from '@playwright/test';
import { openApp, loadSample, SIZES, tab, seed, ev } from './helpers.js';

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

// ---- PR25: 時間軸への接続 ----
const hhOfCol = (page, sel) => page.locator(sel).first().evaluate((c) => parseFloat(getComputedStyle(c.closest('.tl')).getPropertyValue('--hh')));
// 指定時刻が時間軸の中央に来るようスクロールしてから、その列の座標を返す。
const pointAt = (page, min, nth = 0, sel = '.tlcol') => page.locator(sel).nth(nth).evaluate((c, min) => {
  const tl = c.closest('.tl'), h = parseFloat(getComputedStyle(tl).getPropertyValue('--hh'));
  tl.scrollTop = Math.max(0, 12 + min * h / 60 - tl.clientHeight / 2);
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + 12 + min * h / 60 + 1 };
}, min);
async function scrollTo(page, sel, top) { await page.locator(sel).first().evaluate((e, t) => { e.scrollTop = t; }, top); }
async function press(page, p, ms = 420) { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(ms); }
const dbCount = (page) => page.evaluate(async () => (await (await import('./js/db.js')).listEvents()).length);

for (const [name, size, setup2] of [
  ['開いた横（右ページ）', SIZES.openLandscape951, async () => {}],
  ['閉じた縦の日', SIZES.closedPortrait, async (page) => { await tab(page, '日').click(); }],
]) {
  test.describe(`時間軸の直接入力 ${name}`, () => {
    test.beforeEach(async ({ page }) => { await openApp(page, size); await setup2(page); await expect(page.locator('.tlcol').first()).toBeVisible(); });

    test('長押しで30分の枠→下へ伸ばす→離すとシート。保存は1回だけ', async ({ page }) => {
      const p = await pointAt(page, 10 * 60 + 5); // 10:05 → 10:00
      await press(page, p);
      await expect(page.locator('.dbox')).toHaveCount(1);
      await expect(page.locator('.dbox .ds')).toHaveText('10:00〜10:30（30分）');
      expect(await dbCount(page)).toBe(0);
      const hh = await hhOfCol(page, '.tlcol');
      await page.mouse.move(p.x, p.y + hh * 1.5, { steps: 5 }); // +90分 → 11:30
      await expect(page.locator('.dbox .ds')).toHaveText('10:00〜11:30（1時間30分）');
      await expect(page.locator('.dtag')).toHaveText(['10:00', '11:30']);
      await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-start')).toHaveValue('2026/11/12 10:00');
      await expect(page.locator('#f-end')).toHaveValue('2026/11/12 11:30');
      await expect(page.locator('#f-title')).toBeFocused();
      await expect(page.locator('.dbox .hdl')).toHaveCount(0); // シート中は取っ手なし
      expect(await dbCount(page)).toBe(0);
      await page.locator('#f-title').fill('直接入力');
      await page.locator('#form [type=submit]').click();
      await expect(page.locator('.tlev', { hasText: '直接入力' })).toHaveCount(1);
      await expect(page.locator('.dbox')).toHaveCount(0);
      expect(await dbCount(page)).toBe(1);
    });

    test('上へ動かすと触れた時刻が終わり。日の端で clamp。キャンセルで枠が消えDB0', async ({ page }) => {
      const p = await pointAt(page, 12 * 60);
      await press(page, p);
      const hh = await hhOfCol(page, '.tlcol');
      await page.mouse.move(p.x, p.y - hh * 0.5, { steps: 4 });
      await expect(page.locator('.dbox .ds')).toHaveText('11:30〜12:00（30分）');
      await page.mouse.up();
      await expect(page.locator('#f-start')).toHaveValue('2026/11/12 11:30');
      await expect(page.locator('#f-end')).toHaveValue('2026/11/12 12:00');
      await page.keyboard.press('Escape');
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('.dbox')).toHaveCount(0);
      expect(await dbCount(page)).toBe(0);
    });

    test('短tap→1時間の仮枠、枠の外で消える、枠の再tapでシート、取っ手で長さを直せる', async ({ page }) => {
      const p = await pointAt(page, 14 * 60 + 20); // 14:20 → 14:15
      await page.mouse.click(p.x, p.y);
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:15（1時間）');
      await expect(page.locator('.dbox .hdl')).toHaveCount(2);
      const far = await pointAt(page, 17 * 60 + 20); // 仮枠から離れた同じ列の空き
      await page.waitForTimeout(450);
      await page.mouse.click(far.x, far.y);
      await expect(page.locator('.dbox')).toHaveCount(0);
      const p2 = await pointAt(page, 14 * 60 + 20);
      await page.mouse.click(p2.x, p2.y);
      // 終わりの取っ手を下へ（+30分）
      const hh = await hhOfCol(page, '.tlcol');
      const h = await page.locator('.hdl-e').boundingBox();
      await page.mouse.move(h.x + 6, h.y + 6); await page.mouse.down(); await page.mouse.move(h.x + 6, h.y + 6 + hh / 2, { steps: 4 }); await page.mouse.up();
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:45（1時間30分）');
      await expect(page.locator('#editor')).toBeHidden();
      await page.waitForTimeout(450);
      await page.locator('.dbox').click({ position: { x: 20, y: 20 } });
      await expect(page.locator('#f-start')).toHaveValue('2026/11/12 14:15');
      await expect(page.locator('#f-end')).toHaveValue('2026/11/12 15:45');
    });

    test('既存予定の上の長押しは何もしない。終日段の長押しは終日シート', async ({ page }) => {
      await seed(page, [ev('x1', '既存', '2026-11-12T10:00', '2026-11-12T11:00')]);
      const b = await page.locator('.tlev').first().boundingBox();
      await press(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
      await expect(page.locator('.dbox')).toHaveCount(0);
      await page.mouse.up(); // 離すと従来どおり既存予定の編集シートが開く（新規入力ではない）
      await expect(page.locator('#f-title')).toHaveValue('既存');
      await page.keyboard.press('Escape');
      await expect(page.locator('#editor')).toBeHidden();
      await page.waitForTimeout(450);
      const a = await page.locator('.adcol').first().boundingBox();
      await press(page, { x: a.x + a.width / 2, y: a.y + a.height / 2 });
      await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-all')).toBeChecked();
      await expect(page.locator('#f-start')).toHaveValue('2026/11/12');
    });

    test('23時台の長押しは日末で clamp（30分が収まる）', async ({ page }) => {
      await scrollTo(page, '.tl', 99999);
      const p = await pointAt(page, 23 * 60 + 50);
      await press(page, p); await page.mouse.up();
      await expect(page.locator('#f-start')).toHaveValue('2026/11/12 23:30');
      await expect(page.locator('#f-end')).toHaveValue('2026/11/12 23:59');
    });
  });
}

test.describe('閉じた週の時間軸', () => {
  test('7列・狭幅は横スクロール。列の長押しでその日に入る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait); await tab(page, '週').click();
    await expect(page.locator('.tlcol')).toHaveCount(7);
    const x = await page.locator('.tlx').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(x.sw).toBeGreaterThanOrEqual(x.cw);
    await scrollTo(page, '.tl', 500);
    const day = await page.locator('.tlcol').nth(2).getAttribute('data-day');
    const p = await pointAt(page, 9 * 60, 2);
    await press(page, p); await page.mouse.up();
    await expect(page.locator('#f-start')).toHaveValue(`${day.replaceAll('-', '/')} 09:00`);
  });
});
