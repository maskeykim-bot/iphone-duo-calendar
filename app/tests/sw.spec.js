import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES } from './helpers.js';
import { readFileSync } from 'node:fs';

// SW 専用: 普段は serviceWorkers:'block'。ここだけ許可してオンライン登録→オフライン再読込→新スタイル・予定が残る。
test.describe('Service Worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('キャッシュ名 v12 と新しい css/js が ASSETS に入り、オフライン再読込でも表示・予定が残る', async ({ page, context }) => {
    const src = readFileSync('sw.js', 'utf8');
    expect(src).toContain("duo-static-v12");
    for (const f of ['./css/app.css', './js/app.js', './js/categories.js', './js/occcache.js']) expect(src).toContain(`'${f}'`);
    await openApp(page, SIZES.openPortrait669);
    await seed(page, [ev('sw1', 'オフライン確認', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => (await caches.keys()).includes('duo-static-v12') && !!(await (await caches.open('duo-static-v12')).match('./css/app.css')));
    await page.reload(); // SW 制御下で一度読み直してから切る
    await page.waitForSelector('html[data-ready]');
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.strip[data-sday="2026-11-12"]')).toContainText('オフライン確認');
    const fs = await page.locator('.strip').first().evaluate((e) => getComputedStyle(e).fontSize);
    expect(parseFloat(fs)).toBe(10); // 新スタイル
    await context.setOffline(false);
  });
});
