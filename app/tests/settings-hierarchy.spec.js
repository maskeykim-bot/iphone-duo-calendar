import { test, expect } from '@playwright/test';
import { openApp, SIZES, openMenu } from './helpers.js';

// 第15版 PR7: 設定は見本の一覧と階層（一般・表示形式・通知・カレンダー・リマインダー／Google・バックアップ・詳細）。
const rows = (page) => page.locator('#menu [data-screen="root"] .srow:visible .sname').allTextContents();

for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ['開いた縦', SIZES.openPortrait669], ['開いた横', SIZES.openLandscape]]) {
  test(`${name}: 一覧の項目・下層への出入り・Escape・安全矩形内`, async ({ page }) => {
    await openApp(page, size);
    await openMenu(page);
    expect(await rows(page)).toEqual(['一般', '表示形式', 'カレンダー', 'タスク', 'Google カレンダー', 'バックアップ', '詳細']); // 通知はネイティブのみ。タスクは Web でも出す
    const b = await page.locator('#menu').boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(8 - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(size.width - 8 + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(size.height);
    if (size.width > size.height) expect(b.x + b.width).toBeLessThanOrEqual(size.width / 2); // 右ページを残す
    expect(await page.locator('#menu .srow:visible').first().evaluate((e) => e.getBoundingClientRect().height)).toBe(48);
    expect(await page.locator('#menu').evaluate((e) => getComputedStyle(e).borderRadius)).toContain('24px');
    // 下層: ‹ で戻る、Escape で戻る、一番上の Escape で閉じる
    await page.locator('#menu [data-go="general"]').click();
    await expect(page.locator('#m-title')).toHaveText('一般');
    await expect(page.locator('#m-back')).toHaveAttribute('aria-label', '設定に戻る');
    await page.locator('#m-back').click();
    await expect(page.locator('#m-title')).toHaveText('設定');
    await expect(page.locator('#menu [data-go="general"]')).toBeFocused();
    await page.locator('#menu [data-go="details"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#m-title')).toHaveText('設定');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    // 一番上の × でも閉じる
    await openMenu(page);
    await page.locator('#m-back').click();
    await expect(page.locator('#menu')).toBeHidden();
  });
}

test('既存の設定項目がそれぞれ1か所にあり、行き止まりがない', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  const where = { general: ['#m-week', '#m-rokuyo', '#m-desk'], display: ['#m-msize', '#m-mtime'], details: ['#touch-check-open', '#layout-diagnostics', '#kb-metrics'], calendar: ['#m-cedit'] };
  for (const [sc, sels] of Object.entries(where)) {
    await openMenu(page, sc);
    for (const s of sels) await expect(page.locator(`#menu [data-screen="${sc}"] ${s}`)).toHaveCount(1);
    await expect(page.locator('#m-back')).toBeVisible();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }
  await openMenu(page, 'google');
  await expect(page.locator('#menu [data-screen="google"]')).toContainText('Google アカウントを追加すると');
});
