// 第16版 PR33: 集中タスクの四つの見方と詳細（TF-1/2）
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';
import { T, seedTasks, dbTasks } from './task-helpers.js';

const P = SIZES.openPortrait669;
const withMode = (page, mode) => page.addInitScript(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, focusMode: m })); }, ['duo.ui.v1', mode]);
const view = (page, v) => page.locator(`[data-act="tview"][data-v="${v}"]`);
const rows = (page) => page.locator('.ftlist .rmrow');
const titles = (page) => page.locator('.ftlist .rmt').allTextContents();
// 2026-11-12 09:41 JST 固定
const SEED = [
  T('a1', { title: '過去の件', due: { date: '2026-11-10' } }),
  T('a2', { title: '直前', due: { date: '2026-11-12', time: '09:40' } }),
  T('a3', { title: '今日の終日', due: { date: '2026-11-12' } }),
  T('a4', { title: '今日の直後', due: { date: '2026-11-12', time: '09:42' } }),
  T('a5', { title: '明日0時', due: { date: '2026-11-13', time: '00:00' } }),
  T('a6', { title: '来月', due: { date: '2026-12-05' } }),
  T('a7', { title: '期限なしX', due: null, createdAt: 5 }),
  T('d1', { title: '最近の完了', done: true, doneAt: '2026-11-11T10:00' }),
  T('d2', { title: '昔の完了', done: true, doneAt: '2026-09-01T10:00' }),
];

test.describe('集中タスク', () => {
  test.beforeEach(async ({ page }) => { await withMode(page, 'task'); await openApp(page, P); await seedTasks(page, SEED); });

  test('四つの見方: 今日／予定／すべて／完了。重複も漏れもない', async ({ page }) => {
    await expect(page.locator('.tvseg button')).toHaveText(['今日 4', '予定', 'すべて', '完了']);
    await expect(view(page, 'today')).toHaveAttribute('aria-pressed', 'true');
    expect(await titles(page)).toEqual(['過去の件', '直前', '今日の終日', '今日の直後']);
    await view(page, 'plan').click();
    expect(await titles(page)).toEqual(['明日0時', '来月']);
    await expect(page.locator('.ftlist .rmh')).toHaveText(['11月13日（金）', '12月5日（土）']); // S7 V-24: 全角のかっこ
    await view(page, 'all').click();
    expect(await titles(page)).toEqual(['過去の件', '直前', '今日の終日', '今日の直後', '明日0時', '来月', '期限なしX']);
    await view(page, 'done').click();
    expect(await titles(page)).toEqual(['最近の完了']);
    await page.locator('[data-act="ftolder"]').click();
    expect(await titles(page)).toEqual(['最近の完了', '昔の完了']);
  });

  test('見方は保存され、選んだ日では今日がずれない', async ({ page }) => {
    await view(page, 'plan').click();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(view(page, 'plan')).toHaveAttribute('aria-pressed', 'true');
    await view(page, 'today').click();
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.selected = '2026-12-01'; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await titles(page)).toEqual(['過去の件', '直前', '今日の終日', '今日の直後']);
    await expect(page.locator('.ftdn .rmchipl')).toContainText('12/1'); // チップの初期値だけ選択日
  });

  test('未選択は期限なし一覧。選ぶと詳細が出て、編集は即反映・保存される', async ({ page }) => {
    await expect(page.locator('.ftnone')).toContainText('期限なしX');
    await page.locator('.ftlist .rmrow', { hasText: '今日の終日' }).locator('.rmbody').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const t = page.locator('.ftcard [data-ft="title"]');
    await expect(t).toHaveValue('今日の終日');
    await t.fill('書き換え');
    await expect(page.locator('.ftlist .rmrow.sel .rmt')).toHaveText('書き換え');
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a3').title).toBe('書き換え');
    await page.locator('.ftcard [data-ft="time"]').fill('18:30');
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a3').due).toEqual({ date: '2026-11-12', time: '18:30' });
    await page.locator('.ftcard [data-ft="notify"]').check();
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a3').notify).toBe(true);
    await page.locator('.ftcard [data-ft="notes"]').fill('メモです');
    await page.locator('.ftcard [data-ft="title"]').focus();
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a3').note).toBe('メモです');
    await page.locator('.ftcard [data-ft="date"]').fill('');
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a3').due).toBe(null);
    await expect(page.locator('.ftcard [data-ft="notify"]')).toBeDisabled();
  });

  test('空の題名は保存せず理由を出す', async ({ page }) => {
    await page.locator('.ftlist .rmrow', { hasText: '過去の件' }).locator('.rmbody').click();
    await page.locator('.ftcard [data-ft="title"]').fill('');
    await page.locator('.ftcard [data-ft="title"]').blur();
    await expect(page.locator('[data-ft-err]')).toContainText('題名');
    expect((await dbTasks(page)).find((x) => x.id === 'a1').title).toBe('過去の件');
  });

  test('追加欄は作り直されず、続けて追加できる。期限チップは今日／明日／日付なし', async ({ page }) => {
    const input = page.locator('input.remin');
    await input.focus();
    await input.evaluate((n) => { window.__node = n; });
    await page.locator('[data-act="ftdue"][data-d="tomorrow"]').click();
    await expect(page.locator('[data-act="ftdue"][data-d="tomorrow"]')).toHaveAttribute('aria-pressed', 'true');
    await input.fill('一件目'); await input.press('Enter');
    await expect.poll(async () => (await dbTasks(page)).some((x) => x.title === '一件目' && x.due?.date === '2026-11-13')).toBe(true);
    await input.fill('二件目');
    await page.locator('[data-act="ftdue"][data-d="none"]').click();
    await input.press('Enter');
    await expect.poll(async () => (await dbTasks(page)).some((x) => x.title === '二件目' && x.due === null)).toBe(true);
    expect(await input.evaluate((n) => n === window.__node)).toBe(true);
    await expect(input).toBeFocused();
  });

  test('完了の押下と削除。削除は選択を解く', async ({ page }) => {
    await page.locator('.ftlist .rmrow', { hasText: '過去の件' }).locator('.rmbody').click();
    await page.locator('[data-act="ftdel"]').click();
    await expect(page.locator('.ftlist')).not.toContainText('過去の件');
    await expect(page.locator('.ftcard[data-id]')).toHaveCount(0);
    await expect.poll(async () => (await dbTasks(page)).some((x) => x.id === 'a1')).toBe(false);
    await page.locator('.ftlist .rmrow', { hasText: '直前' }).locator('.rmckb').click();
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a2').done, { timeout: 5000 }).toBe(true);
    await view(page, 'done').click();
    await expect(page.locator('.ftlist')).toContainText('直前');
  });
});
