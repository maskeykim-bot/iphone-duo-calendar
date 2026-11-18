// 第16版 PR17: タスクの分類と完了履歴の表示（Duo 内保存から読む）。
import { test, expect } from '@playwright/test';
import { SIZES, openApp } from './helpers.js';
import { spy, legacyCalls, openTasks, seedTasks, T } from './task-helpers.js';

const OPEN = SIZES.openLandscape;
const day = (off) => { const d = new Date(2026, 10, 12 + off); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const SEED = [
  T('late', { title: '期限切れ', due: { date: day(-2) }, order: 1 }),
  T('today', { title: '今日の', due: { date: day(0) }, order: 2 }),
  T('soon', { title: 'この先の', due: { date: day(3), time: '10:00' }, order: 3 }),
  T('nd', { title: 'なし', due: null, createdAt: 5, order: 4 }),
  T('d1', { title: '済1', done: true, doneAt: `${day(-3)}T08:00`, order: 5 }),
  T('d2', { title: '済2', done: true, doneAt: `${day(-45)}T08:00`, order: 6 }),
];
const lp = (page) => page.locator('.page.lp');
const SECS = ['overdue', 'selected', 'upcoming', 'nodue', 'done'];

test.describe('タスクの分類と完了履歴', () => {
  test('分類の順・行の高さ・完了は閉じている。native の一覧取得は0', async ({ page }) => {
    await spy(page);
    await openTasks(page, OPEN, { seed: SEED });
    await expect(lp(page).locator('[data-key="rm:late"]')).toBeVisible();
    expect(await lp(page).locator('[data-sec]').evaluateAll((e) => e.map((x) => x.dataset.sec))).toEqual(SECS);
    expect(await lp(page).locator('[data-key="rm:nd"]').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await lp(page).locator('[data-key="rm:today"]').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
    await expect(lp(page).locator('[data-key="rm:d1"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('旧リマインダー');
    expect(await legacyCalls(page)).toEqual([]);
  });
  test('完了を開く: 30日以内だけ。古い完了は表示窓の外', async ({ page }) => {
    await openTasks(page, OPEN, { seed: SEED });
    await lp(page).locator('[data-act="remdone"]').click();
    await expect(lp(page).locator('[data-key="rm:d1"]')).toBeVisible();
    await expect(lp(page).locator('[data-key="rm:d2"]')).toHaveCount(0);
    await lp(page).locator('[data-act="remmore"]').click();
    await expect(lp(page).locator('[data-key="rm:d2"]')).toBeVisible();
  });
  test('選択日を変えると分類だけ変わる。右ページでも同じ分類', async ({ page }) => {
    await openApp(page, OPEN);
    await seedTasks(page, SEED);
    await page.locator('.pgr [data-pick="task"]').first().click();
    const rp = page.locator('.page.rp');
    await expect(rp.locator('[data-key="rm:today"]')).toBeVisible();
    expect(await rp.locator('[data-sec]').evaluateAll((e) => e.map((x) => x.dataset.sec))).toEqual(SECS);
    await page.locator(`.page.lp [data-date="${day(3)}"]`).first().click({ position: { x: 12, y: 10 } });
    await expect(rp.locator('[data-sec="selected"] [data-key="rm:soon"]')).toBeVisible();
    await expect(rp.locator('[data-sec="overdue"] [data-key="rm:today"]')).toBeVisible();
  });
  test('外部変更の通知（calendarChanged）では取り直さない。旧リマインダー集合は混ざらない', async ({ page }) => {
    await spy(page);
    await openTasks(page, OPEN, { seed: SEED });
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__m.cbs.calendarChanged?.({}); });
    await page.waitForTimeout(600);
    expect(await legacyCalls(page)).toEqual([]);
    await expect(lp(page).locator('[data-key="rm:legacy1"]')).toHaveCount(0);
  });
  test('0件は案内。保存したタスクは再起動後も同じ', async ({ page }) => {
    await openTasks(page, OPEN);
    await expect(lp(page).locator('.rmempty')).toContainText('未完了のタスクはありません。');
    await seedTasks(page, SEED);
    await page.locator('.pgl [data-pick="task"]').first().click();
    await expect(lp(page).locator('[data-key="rm:late"]')).toBeVisible();
  });
  test('開いた縦の下パネルでも同じ分類', async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('duo.ui.v1')) localStorage.setItem('duo.ui.v1', JSON.stringify({ monthExpand: true })); }); // 第19版 PR6: 下パネルは「全部」の月だけ
    await openApp(page, SIZES.openPortrait);
    await seedTasks(page, SEED);
    const sw = page.locator('.pswitch');
    if (!(await sw.isVisible())) await page.locator('[data-act="pnltoggle"]').first().click();
    await sw.getByRole('button', { name: 'タスク', exact: true }).click();
    const pn = page.locator('.pnl');
    await expect(pn.locator('[data-key="rm:late"]')).toBeVisible();
    expect(await pn.locator('[data-sec]').evaluateAll((e) => e.map((x) => x.dataset.sec))).toEqual(SECS);
  });
});
