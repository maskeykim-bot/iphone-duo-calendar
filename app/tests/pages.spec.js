import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

// 第14版 PR4: 左右ページの状態と描画の分離
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
const seedPages = async (page, pages) => {
  await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, pages: p })); }, pages);
  await page.reload(); await page.waitForSelector('html[data-ready]');
};

test('既定は 左=月 右=時間。pages が保存され、旧 home/view も残る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await expect(page.locator('.page.lp[data-page="month"] .week').first()).toBeVisible();
  await expect(page.locator('.page.rp[data-page="time"] .tl[data-pane="right"]')).toBeVisible();
  await expect(page.locator('.tl')).toHaveCount(1);
  await page.getByRole('button', { name: '次の月' }).click(); // set() で保存
  const s = await ui(page);
  expect(s.pages).toEqual({ left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false });
  expect(s.view).toBe('month');
});

test('壊れた pages は既定へ。重複は別種類にする', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'junk', right: 3 });
  await expect(page.locator('.page.lp')).toHaveAttribute('data-page', 'month');
  await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
  await seedPages(page, { left: 'time', right: 'time' });
  const kinds = await page.locator('.page').evaluateAll((l) => l.map((e) => e.dataset.page));
  expect(kinds[0]).toBe('time'); expect(kinds[1]).not.toBe('time');
});

test('左を時間・右を月にしても描ける。時間軸は左ペイン単位', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'time', right: 'month' });
  await expect(page.locator('.page.lp .tl[data-pane="left"]')).toBeVisible();
  await expect(page.locator('.page.rp[data-page="month"] .week').first()).toBeVisible();
  await expect(page.locator('.page.rp .tl')).toHaveCount(0);
  const b = await page.locator('.page.lp .tl').boundingBox(), W = SIZES.openLandscape951.width;
  expect(b.x + b.width).toBeLessThanOrEqual(W / 2 - 10 + 0.5);
  await expect(page.locator('.page.lp .nowl')).not.toHaveAttribute('hidden', /.*/);
  await expect.poll(() => page.locator('.page.lp .tl').evaluate((e) => e.scrollTop)).toBeGreaterThan(300);
});

test('タスク／メモは説明のみで、保存先を作らない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'task', right: 'memo' });
  await expect(page.locator('.page.lp .pagewait')).toContainText('タスク');
  await expect(page.locator('.page.rp .pagewait')).toContainText('メモ');
  await expect(page.locator('.tl')).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /task|memo/i.test(k)));
  expect(keys).toEqual([]);
});
