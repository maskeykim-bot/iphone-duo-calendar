// 第16版 PR32: 開いた縦の三つの集中モード（カレンダー｜タスク｜ノート）。DP-8/9。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, layout } from './helpers.js';

const P = SIZES.openPortrait669;
const sw = (page, m) => page.locator(`.fmodes [data-fmode="${m}"]`);
const uiKey = 'duo.ui.v1';
const withMode = (page, mode) => page.addInitScript(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, focusMode: m })); }, [uiKey, mode]);
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').focusMode, uiKey);

test.describe('開いた縦の集中モード', () => {
  test('未設定はカレンダー。切替は3つで、カレンダー本文・操作は従来のまま', async ({ page }) => {
    await openApp(page, P);
    expect(await layout(page)).toBe('open');
    await expect(page.locator('.fmodes button')).toHaveText(['カレンダー', 'タスク', 'ノート']);
    await expect(sw(page, 'calendar')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.calendar')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '予定を検索' })).toBeVisible();
    await expect(page.getByRole('button', { name: '予定を追加' })).toBeVisible();
    const sc = await page.locator('.calendar .scroll').boundingBox();
    expect(Math.abs(sc.y - 106)).toBeLessThan(1.5);
    const h = await page.locator('.chead h2').boundingBox(), f = await page.locator('.fmodes').boundingBox();
    expect(h.x + h.width <= f.x || f.x + f.width <= h.x).toBe(true); // 月の見出しと重ならない
  });

  test('タスク／ノートは専用面だけ。カレンダー・タブ・今日は出さず、モードを保存して再起動でも開く', async ({ page }) => {
    await openApp(page, P);
    await sw(page, 'task').click();
    await expect(page.locator('.shell.focus[data-focus="task"]')).toHaveCount(1);
    await expect(page.locator('.calendar, .tabs, .weekdays, .pnl')).toHaveCount(0);
    await expect(page.locator('.ctl .ctoday, .ctl .cpnl')).toHaveCount(0);
    await expect(page.locator('.ctl').getByRole('button', { name: 'タスクを検索' })).toBeVisible();
    await expect(page.locator('.ctl').getByRole('button', { name: 'タスクを追加' })).toBeVisible();
    expect(await saved(page)).toBe('task');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.shell.focus[data-focus="task"]')).toHaveCount(1);
    await sw(page, 'note').click();
    await expect(page.locator('.shell.focus[data-focus="note"]')).toHaveCount(1);
    await expect(page.locator('.ctl').getByRole('button', { name: 'ノートを追加' })).toBeVisible();
    await expect(page.locator('.mlist, .notepage')).toHaveCount(1);
    expect(await saved(page)).toBe('note');
    await sw(page, 'calendar').click();
    await expect(page.locator('.calendar')).toHaveCount(1);
    const sc = await page.locator('.calendar .scroll').boundingBox();
    expect(Math.abs(sc.y - 106)).toBeLessThan(1.5);
  });

  test('保存済みのモードで開く。不正値はカレンダー', async ({ page }) => {
    await withMode(page, 'note');
    await openApp(page, P);
    await expect(page.locator('.shell.focus[data-focus="note"]')).toHaveCount(1);
    await expect(sw(page, 'note')).toHaveAttribute('aria-pressed', 'true');
  });
  test('不正な保存値はカレンダー', async ({ page }) => {
    await withMode(page, 'bogus');
    await openApp(page, P);
    await expect(page.locator('.calendar')).toHaveCount(1);
  });

  test('＋はモードごとに 予定／タスク／ノート を作る', async ({ page }) => {
    await openApp(page, P);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#editor, dialog[open]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await sw(page, 'task').click();
    await page.locator('.ctl').getByRole('button', { name: 'タスクを追加' }).click();
    await expect(page.locator('input.remin')).toBeVisible();
    await sw(page, 'note').click();
    await page.locator('.ctl').getByRole('button', { name: 'ノートを追加' }).click();
    await expect(page.locator('.nhost')).toHaveCount(1);
  });

  test('検索はモードの対象だけ', async ({ page }) => {
    await openApp(page, P);
    await sw(page, 'task').click();
    await page.locator('.ctl').getByRole('button', { name: 'タスクを検索' }).click();
    await page.locator('#sr-q').fill('zzzz');
    await expect(page.locator('#sr-body')).toContainText('該当するタスクはありません');
    await expect(page.locator('#sr-range')).toBeHidden();
  });

  test('縦→横→縦でモードを保つ。横は従来のページ方式', async ({ page }) => {
    await openApp(page, P);
    await sw(page, 'task').click();
    await page.setViewportSize(SIZES.openLandscape951);
    await expect.poll(() => layout(page)).toBe('spread');
    await expect(page.locator('.fmodes, .shell.focus')).toHaveCount(0);
    expect(await saved(page)).toBe('task');
    await page.setViewportSize(P);
    await expect(page.locator('.shell.focus[data-focus="task"]')).toHaveCount(1);
  });

  test('閉じた画面は帯・従来のまま（切替なし）', async ({ page }) => {
    await withMode(page, 'note');
    await openApp(page, SIZES.closedPortrait);
    await expect(page.locator('.fmodes')).toHaveCount(0);
  });
});
