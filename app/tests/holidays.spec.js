import { test, expect } from '@playwright/test';
import { openApp, SIZES, openMenu } from './helpers.js';
const setUi = (page, patch) => page.evaluate((p) => { const k = 'duo.ui.v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), ...p })); }, patch);

// 第16版 PR9: 祝日の色・名前・設定。内蔵表だけで動く（連携なし）。
const red = 'rgb(180, 60, 60)';
const sizes = [['閉', SIZES.closedPortrait], ['縦', SIZES.openPortrait669], ['横', SIZES.openLandscape951]];
for (const [nm, sz] of sizes) {
  test(`祝日は内蔵表で赤・名前つき（${nm}）。設定OFFで祝日の赤だけ消え、日曜は赤のまま`, async ({ page }) => {
    await openApp(page, sz);
    await setUi(page, { view: 'month', home: false, selected: '2026-11-23' });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const num = (d) => page.locator(`.week .day[data-date="${d}"]:visible .num`).first().evaluate((e) => getComputedStyle(e).color);
    expect(await num('2026-11-23')).toBe(red);
    expect(await num('2026-11-22')).toBe(red);
    expect(await num('2026-11-24')).not.toBe(red);
    await expect(page.locator('.week .day[data-date="2026-11-23"]').first()).toHaveAttribute('aria-label', /祝日、勤労感謝の日/);
    await setUi(page, { view: 'month', home: false, selected: '2026-11-23', holidayRed: false });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await num('2026-11-23')).not.toBe(red);
    expect(await num('2026-11-22')).toBe(red);
  });
}

test('日の見出しに祝日名。ダークは --holiday が明るい色', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page, SIZES.openLandscape951);
  await setUi(page, { view: 'month', selected: '2026-11-23' });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.rdate .hnm').first()).toHaveText('勤労感謝の日');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--holiday').trim())).toBe('#E58A82');
});

test('設定 › 一般に「祝日を赤で表示」（既定オン）、詳細に出典', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await openMenu(page, 'general');
  const sw = page.locator('#m-holiday');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await page.locator('#m-back').click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).holidayRed))).toBe(false);
  await page.locator('#menu [data-go="details"]').click();
  await expect(page.locator('#about-app')).toContainText('内閣府');
});
