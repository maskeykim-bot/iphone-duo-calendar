// 第16版 PR17: タスクは許可なしで使える（リマインダー許可・list gate は無い）。TM-7「許可要求0」。
import { test, expect } from '@playwright/test';
import { openApp, openMenu, SIZES, legacyPanelInit } from './helpers.js';
import { spy, reminderCalls, openTasks, T } from './task-helpers.js';

const OPEN = SIZES.openLandscape;
const lp = (page) => page.locator('.page.lp');

test.describe('許可なしでタスクを使える', () => {
  test('iPhone アプリ: 許可の案内・ボタンは出ず、追加欄と一覧が出る。許可要求・一覧取得は0', async ({ page }) => {
    await spy(page);
    await openTasks(page, OPEN);
    await expect(lp(page).locator('.remgate')).toHaveCount(0);
    await expect(lp(page).locator('[data-wait="task"] input.remin')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('アクセスを許可');
    await expect(page.locator('body')).not.toContainText('旧リマインダー'); // 旧集合は読まない
    expect(await reminderCalls(page)).toEqual([]);
  });
  test('Web（native なし）でも同じ。「iPhone のアプリで使えます」は出ない', async ({ page }) => {
    await openTasks(page, OPEN);
    await expect(lp(page).locator('.remgate')).toHaveCount(0);
    await expect(lp(page).locator('input.remin')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('iPhone のアプリで使えます');
  });
  test('前面復帰・calendarChanged でも許可確認や取得をしない', async ({ page }) => {
    await spy(page);
    await openTasks(page, OPEN);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.__m.cbs.calendarChanged?.({}); window.__m.cbs.timeChanged?.({}); });
    await page.waitForTimeout(700);
    expect(await reminderCalls(page)).toEqual([]);
    await expect(lp(page).locator('.remgate')).toHaveCount(0);
  });
  test('設定›カレンダーにリマインダーの許可・同期・リスト段は出ない', async ({ page }) => {
    await spy(page);
    await openTasks(page, OPEN);
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-dest')).toHaveCount(1); // 設定›カレンダーが開いている
    await expect(page.locator('#m-cal-rem')).toHaveCount(0);
    await expect(page.locator('#m-remreq, #m-remsync')).toHaveCount(0);
    expect(await reminderCalls(page)).toEqual([]);
  });
});
test.describe('縦の下パネル', () => {
  test('下パネルのタスクにも追加欄（許可なし）', async ({ page }) => {
    await legacyPanelInit(page);
    await spy(page);
    await openApp(page, SIZES.openPortrait);
    await page.getByRole('button', { name: '下の段を表示' }).click();
    await page.locator('.pswitch').getByRole('button', { name: 'タスク', exact: true }).click();
    await expect(page.locator('.pnl input.remin')).toBeVisible();
    await expect(page.locator('.pnl .remgate')).toHaveCount(0);
  });
});
