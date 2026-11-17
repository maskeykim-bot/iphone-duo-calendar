import { test, expect } from '@playwright/test';
import { openApp, SIZES, swipe } from './helpers.js';

// 第14版 PR6: 共通の日付移動と小さな月
const seedPages = async (page, pages, extra = {}) => {
  await page.evaluate(([p, x]) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, pages: p, ...x })); }, [pages, extra]);
  await page.reload(); await page.waitForSelector('html[data-ready]');
};
const sel = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}').selected);
const dateText = (page, side) => page.locator(`.page.${side === 'left' ? 'lp' : 'rp'} .datebtn`).innerText();

test('月なしの 時間｜タスク：左右の ‹ › が同じ選択日を動かす。週は7日', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'time', right: 'task' });
  const d0 = '2026-11-12';
  await page.locator('.page.rp [data-act="next"]').click();
  const d1 = await sel(page);
  expect(d1).not.toBe(d0);
  expect(await dateText(page, 'left')).toBe(await dateText(page, 'right'));
  await page.locator('.page.lp [data-act="prev"]').click();
  expect(await sel(page)).toBe(d0);
  await seedPages(page, { left: 'time', right: 'task' }, { timeMode: { left: 'week', right: '1' } });
  await page.locator('.page.lp [data-act="next"]').click();
  const w = await sel(page);
  expect((Date.parse(w) - Date.parse(d0)) / 864e5).toBe(7);
  await page.locator('.page.rp [data-act="next"]').click(); // タスクは1日
  expect((Date.parse(await sel(page)) - Date.parse(w)) / 864e5).toBe(1);
});

test('日付タップで小さな月 280×260、40×36のマス、六曜なし、外側tapは貫通しない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'month', right: 'time' });
  const d0 = '2026-11-12';
  await page.locator('.page.rp .datebtn').click();
  const m = page.locator('.page.rp .mmenu');
  const b = await m.boundingBox();
  expect(Math.round(b.width)).toBe(280); expect(Math.round(b.height)).toBe(260);
  const c = await page.locator('.mmc').first().boundingBox();
  expect(Math.round(c.width)).toBe(40); expect(Math.round(c.height)).toBe(36);
  await expect(m.locator('.hrk')).toHaveCount(0);
  // 外側（左の月の「次」ボタン）をたたく → 閉じるだけで月は動かない
  await page.locator('.page.lp [data-act="next"]').click();
  await expect(m).toHaveCount(0);
  expect(await sel(page)).not.toBe('2026-12-12');
  // 日を選ぶ → 左右とも同じ日
  await page.locator('.page.rp .datebtn').click();
  await page.locator('.mmc:not(.out)', { hasText: /^20$/ }).click();
  expect(await sel(page)).toMatch(/-20$/);
  await expect(page.locator('.mmenu')).toHaveCount(0);
  await expect(page.locator('.page.lp .shead')).toContainText('11月');
});

test('小さな月：前後の月へ動いて選べる。Escで閉じる', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'time', right: 'task' });
  await page.locator('.page.lp .datebtn').click();
  await page.locator('.mmenu [data-mmnav="1"]').click();
  await expect(page.locator('.mmt')).toHaveText('2026年12月');
  await page.locator('.mmc:not(.out)', { hasText: /^5$/ }).click();
  expect(await sel(page)).toBe('2026-12-05');
  await page.locator('.page.rp .datebtn').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mmenu')).toHaveCount(0);
});

test('横スワイプ：時間ペインは起点で日送り、タスクは動かない、メモ編集中は除外', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'time', right: 'task' });
  const d0 = '2026-11-12';
  const lb = await page.locator('.page.lp .tl').boundingBox();
  await swipe(page, { x0: lb.x + lb.width - 20, y0: lb.y + 200, dx: -120 });
  const d1 = await sel(page);
  expect((Date.parse(d1) - Date.parse(d0)) / 864e5).toBe(1);
  const rb = await page.locator('.page.rp').boundingBox();
  await swipe(page, { x0: rb.x + rb.width - 30, y0: rb.y + 300, dx: -120 });
  expect(await sel(page)).toBe(d1);
});

test('左右の選択日が月・時間でも分裂しない（左 月 右 時間）', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.locator('.page.rp [data-act="next"]').click();
  const d = await sel(page);
  await page.locator('.page.lp .datebtn, .page.lp .shead').first().waitFor();
  expect(d).toBe('2026-11-13');
});
