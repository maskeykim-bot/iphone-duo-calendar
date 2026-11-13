// 第7版: 4つの Duo ビューポートでのパネル配置・safe area・キーボード相当（高さ縮小）の検証。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, textInGutter } from './helpers.js';

const CASES = [
  ['閉じた縦 466×678', SIZES.closedPortrait, 380],
  ['閉じた横 678×466', SIZES.closedLandscape, 300],
  ['開いた縦 626×890', SIZES.openPortrait, 540],
  ['開いた横 890×626', SIZES.openLandscape, 400],
];
const PANELS = {
  edit: { open: async (page) => { await page.locator('[data-act="add"]:visible').first().click(); }, dlg: '#editor', close: '#close', primary: '#editor [type=submit]', input: '#f-title' },
  search: { open: async (page) => { await page.locator('[data-act="search"]:visible').first().click(); }, dlg: '#search', close: '#sr-close', primary: '#sr-close', input: '#sr-q' },
  backup: { open: async (page) => { await page.locator('[data-act="menu"]:visible').first().click(); await page.locator('[data-m="backup"]').click(); }, dlg: '#backup', close: '#bk-close', primary: '#bk-close', input: null },
};

const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
const vp = (page) => page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }));
const within = (r, v, tol = 0.5) => r.x >= -tol && r.y >= -tol && r.x + r.w <= v.w + tol && r.y + r.h <= v.h + tol;
const noOverflow = (page) => page.evaluate(() => { const e = document.scrollingElement; return { sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, x: window.scrollX, y: window.scrollY }; });

for (const [name, size, small] of CASES) {
  for (const [pn, P] of Object.entries(PANELS)) {
    test(`${name}: ${pn} パネルが画面内・44px・文書がはみ出さない`, async ({ page }) => {
      await openApp(page, size);
      await P.open(page);
      await expect(page.locator(P.dlg)).toBeVisible();
      const v = await vp(page);
      const o = await noOverflow(page);
      expect(o.sw).toBeLessThanOrEqual(o.cw);
      expect(o.x).toBe(0);
      expect(within(await rect(page, P.dlg), v)).toBe(true);
      const c = await rect(page, P.close), s = await rect(page, P.primary);
      for (const r of [c, s]) { expect(within(r, v)).toBe(true); expect(r.w).toBeGreaterThanOrEqual(44); expect(r.h).toBeGreaterThanOrEqual(44); }
      // 入力欄の文字サイズは 16px 以上（iOS の自動ズーム対策）
      const fonts = await page.evaluate((d) => [...document.querySelectorAll(`${d} input:not([type=checkbox]):not([type=file]), ${d} select, ${d} textarea`)].map((e) => parseFloat(getComputedStyle(e).fontSize)), P.dlg);
      for (const f of fonts) expect(f).toBeGreaterThanOrEqual(16);
      if (size.width === 890) expect(await textInGutter(page)).toEqual([]);
    });

    test(`${name}: ${pn} キーボード相当（高さ ${small}）で姿勢が変わらず、× と保存・入力が可視`, async ({ page }) => {
      await openApp(page, size);
      const before = await page.evaluate(() => document.body.dataset.layout + '/' + document.body.dataset.posture);
      await P.open(page);
      await expect(page.locator(P.dlg)).toBeVisible();
      if (P.input) await page.locator(P.input).focus();
      else await page.evaluate(() => { const b = document.createElement('input'); b.id = 'tmp'; document.querySelector('#backup').append(b); b.focus(); });
      await page.setViewportSize({ width: size.width, height: small });
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.body.dataset.layout + '/' + document.body.dataset.posture)).toBe(before);
      const v = await vp(page);
      expect(within(await rect(page, P.dlg), v)).toBe(true);
      for (const sel of [P.close, P.primary]) { const r = await rect(page, sel); expect(within(r, v)).toBe(true); expect(r.h).toBeGreaterThanOrEqual(44); }
      const f = await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(); return { x: a.x, y: a.y, w: a.width, h: a.height }; });
      expect(within(f, v)).toBe(true);
      const o = await noOverflow(page);
      expect(o.sw).toBeLessThanOrEqual(o.cw);
      // 高さを戻しても姿勢は同じ
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      expect(await page.evaluate(() => document.body.dataset.layout + '/' + document.body.dataset.posture)).toBe(before);
    });

    test(`${name}: ${pn} 上47px・横向き左右47px の safe area の内側に × と保存が入る`, async ({ page }) => {
      await openApp(page, size);
      const land = size.width > size.height;
      await page.evaluate((land) => { const s = document.documentElement.style; s.setProperty('--sat', '47px'); s.setProperty('--sab', '21px'); if (land) { s.setProperty('--sal', '47px'); s.setProperty('--sar', '47px'); } }, land);
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await P.open(page);
      await expect(page.locator(P.dlg)).toBeVisible();
      const v = await vp(page);
      const c = await rect(page, P.close), s = await rect(page, P.primary), d = await rect(page, P.dlg);
      const closedFull = pn !== 'edit' && (size.width < 600 || size.height < 600); // 閉じた画面の全画面パネルは背景が V 全体（操作だけ R 内）
      for (const r of closedFull ? [c, s] : [c, s, d]) {
        expect(r.y).toBeGreaterThanOrEqual(47);
        expect(r.y + r.h).toBeLessThanOrEqual(v.h - 21 + 0.5);
        if (land) { expect(r.x).toBeGreaterThanOrEqual(47); expect(r.x + r.w).toBeLessThanOrEqual(v.w - 47 + 0.5); }
      }
    });
  }
}

test('実際の回転（幅の変化）では従来どおり再配置し、下書きを保持する', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await page.locator('[data-act="add"]:visible').first().click();
  await page.locator('#f-title').fill('下書き');
  await page.setViewportSize(SIZES.closedLandscape);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.body.dataset.layout)).toBe('home');
  await expect(page.locator('#f-title')).toHaveValue('下書き');
});

test('キーボード相当の高さ変化ではカレンダー DOM を再生成しない', async ({ page }) => {
  await openApp(page, SIZES.openPortrait);
  await page.locator('[data-act="add"]:visible').first().click();
  await page.evaluate(() => { document.querySelector('#app .shell').dataset.mark = 'keep'; });
  await page.locator('#f-title').focus();
  await page.setViewportSize({ width: 626, height: 540 });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.querySelector('#app .shell')?.dataset.mark)).toBe('keep');
});
