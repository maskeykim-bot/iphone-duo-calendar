import { test, expect } from '@playwright/test';
import { openApp, SIZES, openMenu } from './helpers.js';

// 第11版 PR12: 実機確認用タッチ確認モード（通常時は何も変わらない・保存しない）。
for (const [name, size] of [['closed', SIZES.closedPortrait], ['spread', SIZES.openLandscape]]) {
  test(`タッチ確認 ${name}`, async ({ page }) => {
    await openApp(page, size);
    await expect(page.locator('#touch-check')).toHaveCount(0);
    await openMenu(page, 'details');
    await page.locator('#touch-check-open').click();
    const L = page.locator('#touch-check');
    await expect(L).toBeVisible();
    const box = await L.boundingBox();
    expect(box).toMatchObject({ x: 0, y: 0, width: size.width, height: size.height });
    // 下の要素に通さない: 層の下にあるタブへ届かない
    const before = await page.evaluate(() => document.body.dataset.layout + '|' + document.body.innerHTML.length);
    await page.mouse.click(30, 40);
    await page.mouse.click(size.width - 5, size.height - 5);
    await expect(L.locator('.tc-dot')).toHaveCount(2);
    await expect(L.locator('.tc-info')).toContainText(`client ${size.width - 5}, ${size.height - 5}`);
    await expect(L.locator('.tc-info')).toContainText(`${size.width}×${size.height} px · DPR 1`);
    await expect(L.locator('.tc-info')).toContainText('safe内');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    for (let i = 0; i < 25; i++) await page.mouse.click(50 + i, 100);
    await expect(L.locator('.tc-dot')).toHaveCount(20);
    await L.getByRole('button', { name: 'タッチ確認を終わる' }).click();
    await expect(page.locator('#touch-check')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.dataset.layout)).toBe(before.split('|')[0]);
    // 通常操作に戻る
    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.locator('#menu')).toBeVisible();
  });
}
test('再読込でオフ', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await openMenu(page, 'details');
  await page.locator('#touch-check-open').click();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('#touch-check')).toHaveCount(0);
});
