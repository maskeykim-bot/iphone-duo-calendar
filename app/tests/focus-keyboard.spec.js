// 第16版 PR34: 入力欄と本文をキーボード上端（kbTop）と折り目の溝に合わせる（KB-1〜5 のカレンダー側）。
// visualViewport と Posture を偽装して、kbTop 690/590/484 とさらに上・offsetTop/scale・実際の溝の矩形を注入する。固定 y は検査しない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';
import { T, seedTasks } from './task-helpers.js';

const P = SIZES.openPortrait669; // 669×951（溝の既定 467〜484）
const withMode = (page, mode) => page.addInitScript(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, focusMode: m })); }, ['duo.ui.v1', mode]);

async function fakeEnv(page) {
  await page.addInitScript(() => {
    const vv = new EventTarget(); vv.height = window.innerHeight; vv.offsetTop = 0; vv.scale = 1; vv.width = window.innerWidth;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const M = window.__mock = { listeners: {}, posture: { available: true, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen', source: 'reservedRegions', at: 1 } };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.listeners[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m) => {
        if (m === 'getPosture') return JSON.parse(JSON.stringify(M.posture));
        if (m === 'checkPermission' || m === 'reminderPermission' || m === 'notifyStatus') return { status: 'denied' };
        throw { code: 'UNAVAILABLE', message: m };
      },
    };
  });
}
const setKb = (page, { kbTop, offsetTop = 0, scale = 1 }) => page.evaluate(async ([k, o, s, f]) => { const vv = window.visualViewport; vv.offsetTop = o; vv.height = k - o; vv.scale = s; vv.dispatchEvent(new Event('resize')); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); }, [kbTop, offsetTop, scale]);
const noKb = (page) => page.evaluate(async () => { const vv = window.visualViewport; vv.offsetTop = 0; vv.height = window.innerHeight; vv.scale = 1; vv.dispatchEvent(new Event('resize')); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); });
let at = 10;
const fold = (page, rect = { x: 0, y: 467, width: 669, height: 17 }, folded = true) => page.evaluate(([r, f, a]) => window.__mock.listeners.postureChange({ available: true, folded: f, regionRect: r, axis: r ? 'horizontal' : null, angle: 40, status: f ? 'partiallyOpen' : 'fullyOpen', source: 'reservedRegions', at: a }), [rect, folded, ++at]);
const box = async (loc) => { const b = await loc.boundingBox(); return { top: b.y, bottom: b.y + b.height, h: b.height, left: b.x, right: b.x + b.width }; };
const crosses = (t, b, g) => t < g.bottom && b > g.top;
const DEF = { top: 467, bottom: 484 };

const SEED = [T('a1', { title: 'いち' }), T('a2', { title: 'に' })];

test.describe('集中タスク: 追加欄・補助列がキーボードの上端と溝に合う', () => {
  test.beforeEach(async ({ page }) => { await withMode(page, 'task'); await fakeEnv(page); await openApp(page, P); await seedTasks(page, SEED); await page.locator('input.remin').focus(); });

  for (const kb of [690, 590]) test(`kbTop ${kb}: 追加欄の下端は kbTop の 0〜8pt 上、補助は 44 を保ち、溝に入らない`, async ({ page }) => {
    await setKb(page, { kbTop: kb });
    await expect(page.locator('html.kbl[data-kbl=task]')).toHaveCount(1);
    const add = await box(page.locator('.rmadd')), as = await box(page.locator('.ftchips'));
    expect(add.h).toBeCloseTo(48, 0);
    expect(kb - add.bottom).toBeGreaterThanOrEqual(0); expect(kb - add.bottom).toBeLessThanOrEqual(8);
    expect(as.h).toBeCloseTo(44, 0); expect(as.bottom).toBeLessThanOrEqual(add.top + 0.5);
    expect(crosses(add.top, add.bottom, DEF)).toBe(false); expect(crosses(as.top, as.bottom, DEF)).toBe(false);
    const chip = await box(page.locator('.ftchips .rmchip').first()); // 当たり（::before ±8）= 見た目 28 + 16 ≥ 44
    expect(chip.h + 16).toBeGreaterThanOrEqual(44);
    expect((await box(page.locator('.ftup'))).bottom).toBeLessThanOrEqual(DEF.top - 8 + 0.5);
    if (kb === 690) expect((await box(page.locator('.ftdn'))).top).toBeGreaterThanOrEqual(DEF.bottom + 8 - 0.5);
    else await expect(page.locator('.ftdn')).toBeHidden(); // 590: 下面の残りは 44 未満なので出さない
    await expect(page.locator('input.remin')).toBeFocused();
  });

  for (const kb of [484, 440, 400]) test(`kbTop ${kb}: 追加欄は上面の下端へ避け、補助はその上、上面の一覧は別にスクロール`, async ({ page }) => {
    await setKb(page, { kbTop: kb });
    const add = await box(page.locator('.rmadd')), as = await box(page.locator('.ftchips')), up = await box(page.locator('.ftup'));
    expect(crosses(add.top, add.bottom, DEF)).toBe(false); expect(crosses(as.top, as.bottom, DEF)).toBe(false);
    expect(add.bottom).toBeLessThanOrEqual(DEF.top - 8 + 0.5);
    expect(as.bottom).toBeLessThanOrEqual(add.top + 0.5); expect(up.bottom).toBeLessThanOrEqual(as.top + 0.5);
    await expect(page.locator('.ftlist')).toHaveCSS('overflow-y', 'auto');
  });

  test('offsetTop を含めて kbTop を測る。ピンチ拡大中は配置しない', async ({ page }) => {
    await setKb(page, { kbTop: 690, offsetTop: 100 });
    const add = await box(page.locator('.rmadd'));
    expect(690 - add.bottom).toBeGreaterThanOrEqual(0); expect(690 - add.bottom).toBeLessThanOrEqual(8);
    await setKb(page, { kbTop: 590, scale: 2 });
    await expect(page.locator('html.kbl')).toHaveCount(0);
  });

  test('実際の溝の矩形（y420・高さ12）でも、固定値を当てずその矩形を避ける', async ({ page }) => {
    const g = { top: 420, bottom: 432 };
    await fold(page, { x: 0, y: 420, width: 669, height: 12 });
    for (const kb of [690, 520, 440]) {
      await setKb(page, { kbTop: kb });
      const add = await box(page.locator('.rmadd')), as = await box(page.locator('.ftchips'));
      expect(crosses(add.top, add.bottom, g)).toBe(false); expect(crosses(as.top, as.bottom, g)).toBe(false);
      expect((await box(page.locator('.ftup'))).bottom).toBeLessThanOrEqual(g.top + 0.5);
    }
  });

  test('キーボードを閉じると通常の配置へ戻り、入力は消えない。外面・カレンダーでは何もしない', async ({ page }) => {
    await page.locator('input.remin').fill('書きかけ');
    await setKb(page, { kbTop: 590 });
    await expect(page.locator('html.kbl')).toHaveCount(1);
    await noKb(page);
    await expect(page.locator('html.kbl')).toHaveCount(0);
    await expect(page.locator('input.remin')).toHaveValue('書きかけ');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.rmadd')).position)).not.toBe('fixed');
  });

  test('折り状態の変化（折る・開く）でも追加欄は kbTop に追随し、角度は使わない', async ({ page }) => {
    await setKb(page, { kbTop: 690 });
    const a = await box(page.locator('.rmadd'));
    await fold(page); await setKb(page, { kbTop: 590 });
    const b = await box(page.locator('.rmadd'));
    expect(a.bottom - b.bottom).toBeCloseTo(100, 0);
    await fold(page, null, false);
    await expect(page.locator('html.folded')).toHaveCount(0);
    expect((await box(page.locator('.rmadd'))).bottom).toBeCloseTo(b.bottom, 0);
  });
});

test.describe('集中ノート: 本文が溝をまたがず、入力行が隠れない', () => {
  test.beforeEach(async ({ page }) => {
    await withMode(page, 'note'); await fakeEnv(page); await openApp(page, P);
    await page.locator('.ctl').getByRole('button', { name: 'ノートを追加' }).click();
    await expect(page.locator('.ned-body')).toBeVisible();
  });
  const longText = Array.from({ length: 60 }, (_, i) => `行${i + 1}`).join('\n');

  test('開ききり: 上が一覧（ほかのノート）、下が本文。補助はキーボードの真上', async ({ page }) => {
    await page.locator('.ned-body').focus();
    await setKb(page, { kbTop: 690 });
    await expect(page.locator('html[data-kbe=dn]')).toHaveCount(1);
    const ed = await box(page.locator('.nhost')), nu = await box(page.locator('.nup')), fm = await box(page.locator('.ned-top'));
    expect(ed.top).toBeGreaterThanOrEqual(DEF.bottom + 8 - 0.5);
    expect(nu.bottom).toBeLessThanOrEqual(DEF.top - 8 + 0.5);
    expect(crosses(fm.top, fm.bottom, DEF)).toBe(false); expect(ed.bottom).toBeLessThanOrEqual(690); // 第19版 PR9: 書式の帯は上へ移った（キーボードの真上にはない）
    expect(fm.top).toBeLessThan(ed.top + 60);
  });

  test('折って編集: 同じ本文 DOM が上面へ移り、下面に他ノート題名と補助列。溝をまたがない', async ({ page }) => {
    await page.locator('.ned-body').focus();
    await page.evaluate(() => { window.__bodyNode = document.querySelector('.ned-body'); });
    await fold(page); await setKb(page, { kbTop: 590 });
    await expect(page.locator('html[data-kbe=up]')).toHaveCount(1);
    expect(await page.evaluate(() => window.__bodyNode === document.querySelector('.ned-body'))).toBe(true);
    const ed = await box(page.locator('.nhost')), fm = await box(page.locator('.ned-top'));
    expect(ed.bottom).toBeLessThanOrEqual(DEF.top - 8 + 0.5);
    expect(crosses(fm.top, fm.bottom, DEF)).toBe(false); expect(fm.h).toBeCloseTo(44, 0);
    await setKb(page, { kbTop: 690 });
    const nu = await box(page.locator('.nup'));
    expect(nu.top).toBeGreaterThanOrEqual(DEF.bottom + 8 - 0.5); expect(nu.bottom).toBeLessThanOrEqual(690);
    await expect(page.locator('.nup')).toHaveCSS('background-color', 'rgb(207, 211, 216)'); // 下面の空きだけ灰色
    await expect(page.locator('.ned-body')).toBeFocused();
  });

  for (const [name, folded, kb] of [['開ききり690', false, 690], ['折り590', true, 590], ['折り484', true, 484]]) test(`長い本文の末尾で書いても入力行が窓の中に見える（${name}）`, async ({ page }) => {
    await page.locator('.ned-body').focus();
    if (folded) await fold(page);
    await setKb(page, { kbTop: kb });
    await page.locator('.ned-body').fill(longText);
    await page.keyboard.press('Control+End'); await page.keyboard.type('\n新しい最後の行');
    await page.waitForTimeout(100);
    const caret = await page.evaluate(async () => { const { caretBox } = await import('./js/keyboard-layout.js'); const ta = document.querySelector('.ned-body'), c = caretBox(ta), t = ta.getBoundingClientRect(), v = ta.closest('.ned-bodywrap').getBoundingClientRect(); return { top: t.top + c.top, bottom: t.top + c.bottom, vTop: v.top, vBottom: v.bottom }; });
    expect(caret.top).toBeGreaterThanOrEqual(caret.vTop - 1); expect(caret.bottom).toBeLessThanOrEqual(caret.vBottom + 1);
    const fm = await box(page.locator('.ned-top'));
    expect(caret.bottom).toBeLessThanOrEqual(kb + 1); // キーボードに隠れない
    // 本文の窓だけが動く（文書は動かない）
    expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  });

  test('ほかのノートの題名から開ける。補助列の書式ボタンはキーボードを閉じない', async ({ page }) => {
    await page.locator('.ned-title').fill('一つ目の題名'); await page.waitForTimeout(600);
    await page.locator('.ctl').getByRole('button', { name: 'ノートを追加' }).click();
    await page.locator('.ned-body').focus(); await fold(page); await setKb(page, { kbTop: 590 });
    await expect(page.locator('.nup .nupb')).toHaveCount(1);
    await page.locator('.ned-top [data-fmt=check]').click();
    await expect(page.locator('.ned-body')).toBeFocused();
    await page.locator('.nup .nupb').first().click();
    await expect(page.locator('.ned-title')).toHaveValue('一つ目の題名');
  });
});
