import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, tab, layout, SIZES } from './helpers.js';

test.describe('永続化', () => {
  test('再読込後も予定が残る（IndexedDB）', async ({ page }) => {
    await openApp(page);
    await addEvent(page, { title: '再読込テスト', cat: 'golf' });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.next')).toContainText('再読込テスト');
    const meta = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('duo-calendar');
      r.onsuccess = () => res({ version: r.result.version, stores: [...r.result.objectStoreNames] });
    }));
    expect(meta.version).toBe(1);
    expect(meta.stores).toContain('events');
  });

  test('削除も再読込後に反映される', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await page.locator('.next').click();
    await page.getByRole('button', { name: '予定を削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('予定を削除しました。');
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.next')).toContainText('ランチと散歩');
  });

  test('選択日・view・月表現・卓上がリサイズと再読込をまたいで残る', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await tab(page, '月').click();
    // 開いた縦では「手帳／予定名」が隠れるため、卓上へ移ってから選ぶ（選択状態は姿勢をまたいで保持される）
    await expect(page.getByRole('button', { name: '予定名' })).toBeHidden();
    await page.getByRole('button', { name: '次の月' }).click();
    await page.locator('[data-date="2026-12-10"]').click({ position: { x: 12, y: 10 } });
    await page.getByRole('button', { name: '卓上' }).click();
    expect(await layout(page)).toBe('desk');
    await page.getByRole('button', { name: '予定名' }).click();

    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('desk');
    await expect(page.locator('[data-date="2026-12-10"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '予定名' })).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await page.waitForSelector('html[data-ready]');
    expect(await layout(page)).toBe('desk');
    await expect(page.locator('[data-date="2026-12-10"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '卓上' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: '卓上' }).click();
    await tab(page, '週').click();
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('spread');
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
  });

  test('編集中ドラフトはリサイズと再読込でも残る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await page.locator('#f-title').fill('下書きの予定');
    await page.locator('#f-cat').selectOption('economy');
    await page.locator('#f-place').fill('オンライン');
    await page.locator('#f-end').fill('2026/11/12 15:30');

    const check = async () => {
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-title')).toHaveValue('下書きの予定');
      await expect(page.locator('#f-cat')).toHaveValue('economy');
      await expect(page.locator('#f-place')).toHaveValue('オンライン');
      await expect(page.locator('#f-end')).toHaveValue('2026/11/12 15:30');
    };
    for (const size of [SIZES.openLandscape, SIZES.openPortrait, SIZES.closedLandscape, SIZES.closedPortrait]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      await check();
    }
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await check();
    // 閉じると下書きは破棄される
    await page.getByRole('button', { name: '閉じる' }).click();
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#editor')).toBeHidden();
  });
});
