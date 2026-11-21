import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick, clickSearch } from './helpers.js';

// 第16版 PR31: ノート一覧の仮想表示と検索（フォルダ内でも全ノート）。
const bulk = (page, n, folder = null) => page.evaluate(async ({ n, folder }) => {
  const db = await import('/js/db.js');
  await db.putFolder({ id: 'fa', name: 'A', order: 1 }); await db.putFolder({ id: 'fb', name: 'B', order: 2 });
  for (let i = 1; i <= n; i++) await db.putNote({ id: `n${i}`, body: `ノート${i}\n本文${i % 50 === 0 ? ' 特別' : ''}`, createdAt: i, updatedAt: i, folderId: i % 2 ? 'fa' : 'fb', pinned: i > n - 3, pinnedAt: i });
}, { n, folder });
const reload = async (page) => { await page.reload(); await page.waitForSelector('html[data-ready]'); };
const rowCount = (page) => page.locator('[data-mlist]').first().locator('.mrow').count();

test('1500件: DOMは一括で作らず、末尾まで届き、末尾を開ける', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await bulk(page, 1500);
  await reload(page);
  await pagePick(page, 'right', 'ノート').click();
  const list = page.locator('[data-mlist]').first();
  await expect(list.locator('.mrow').first()).toBeVisible();
  expect(await rowCount(page)).toBeLessThan(150);
  await list.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(list.locator('[data-nrow="n1"]')).toBeVisible();
  expect(await rowCount(page)).toBeLessThan(150);
  await list.locator('[data-nrow="n1"]').click();
  await expect(page.locator('.ned-title')).toHaveValue('ノート1');
  const perf = await page.evaluate(() => ({ ...globalThis.__duoNotePerf }));
  console.log('# 記録', JSON.stringify(perf));
  expect(perf.search).toBeGreaterThanOrEqual(0);
});

test('フォルダ内にいても検索は全ノート。ピン留め→更新順。語を消すとフォルダ表示に戻る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await bulk(page, 120);
  await reload(page);
  await pagePick(page, 'right', 'ノート').click();
  await page.locator('[data-nchips]').first().locator('.nchip', { hasText: /^A$/ }).click();
  const list = page.locator('[data-mlist]').first();
  await expect(list.locator('[data-nrow="n2"]')).toHaveCount(0); // B のノート
  await page.locator('input.mlq').first().fill('本文 特別');
  await expect(list.locator('[data-nrow="n50"]')).toBeVisible(); // 別フォルダでも出る
  await expect(list.locator('[data-nrow="n100"]')).toBeVisible();
  await page.locator('input.mlq').first().fill('');
  await expect(list.locator('[data-nrow="n50"]')).toHaveCount(0);
  const ids = await list.locator('[data-nrow]').evaluateAll((e) => e.slice(0, 3).map((x) => x.dataset.nrow));
  expect(ids[0]).toBe('n119'); // ピン留め（A内）で pinnedAt が新しい順
});

test('削除済みは通常の一覧・全体検索に出ない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.evaluate(async () => { const db = await import('/js/db.js'); await db.putNote({ id: 'd1', body: '消したやつ', createdAt: 1, updatedAt: 5, folderId: null, deletedAt: Date.now() }); await db.putNote({ id: 'd2', body: '残るやつ', createdAt: 1, updatedAt: 4, folderId: null }); });
  await reload(page);
  await clickSearch(page);
  await page.locator('#sr-q').fill('やつ');
  await expect(page.locator('#sr-body [data-sec="memo"]')).toContainText('1件のノート');
  await expect(page.locator('#sr-body [data-mhit="d1"]')).toHaveCount(0);
});
