import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

// 第14版 PR2: 六曜の表示設定（保存のみ。表示は PR3）
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
const row = (page) => page.locator('#menu #m-rokuyo');
const openMenu = (page) => page.getByRole('button', { name: '設定' }).click();

test('既定はオン。切ると false を保存し、再起動・回転後も保つ。月時刻・大文字設定は落とさない', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await openMenu(page);
  await expect(row(page)).toHaveAttribute('aria-checked', 'true');
  expect(await row(page).evaluate((e) => e.getBoundingClientRect().height)).toBe(44);
  const sw = await row(page).locator('.rkswitch').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  expect(sw).toEqual([51, 31]);
  await expect(page.locator('#m-rokuyo-d')).toHaveText('月のマスと日の見出しに、大安・仏滅などを出します。');
  await page.locator('#menu').getByRole('button', { name: /^月の文字/ }).click();
  await row(page).click();
  await expect(row(page)).toHaveAttribute('aria-checked', 'false');
  let s = await ui(page);
  expect(s.rokuyo).toBe(false); expect(s.monthTextSize).toBe('large');
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await page.setViewportSize(SIZES.openLandscape);
  await openMenu(page);
  await expect(row(page)).toHaveAttribute('aria-checked', 'false');
  await row(page).click();
  expect((await ui(page)).rokuyo).toBe(true);
  expect((await ui(page)).monthTextSize).toBe('large');
});

test('未保存・破損・欠落・boolean 以外は true', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  for (const raw of [null, '{bad', '{}', '{"rokuyo":"no"}', '{"rokuyo":0}', '{"rokuyo":null}']) {
    await page.evaluate((r) => { if (r === null) localStorage.removeItem('duo.ui.v1'); else localStorage.setItem('duo.ui.v1', r); }, raw);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await openMenu(page);
    await expect(row(page)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
  }
});
