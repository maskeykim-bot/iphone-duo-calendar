import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';
test.use({ hasTouch: true, isMobile: true });
test('タッチで終われる', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await page.getByRole('button', { name: 'その他', exact: true }).tap(); // 閉じた画面の設定は「…」→「設定」（design/34 §9.1-5）
  await page.getByRole('menuitem', { name: '設定' }).tap();
  await page.locator('#menu [data-go="details"]').tap();
  await page.locator('#touch-check-open').tap();
  await expect(page.locator('#touch-check')).toBeVisible();
  await page.getByRole('button', { name: 'タッチ確認を終わる' }).tap();
  await expect(page.locator('#touch-check')).toHaveCount(0, { timeout: 3000 });
});
