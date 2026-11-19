// 第16版 PR17: タスクの追加・編集の通知の選択（Duo 内保存。notify は task.notify の boolean）。
import { test, expect } from '@playwright/test';
import { SIZES, clearTaskDue, pickTaskDue, setTaskTime } from './helpers.js';
import { spy, reminderCalls, openTasks, dbTasks, failPuts, T } from './task-helpers.js';

const lp = (page) => page.locator('.page.lp');
async function ready(page, seed) { await spy(page); await openTasks(page, SIZES.openLandscape, { seed }); }
async function edit(page, id) { await lp(page).locator(`[data-key="rm:${id}"] [data-act="remedit"]`).click(); await expect(page.locator('#taskdlg')).toBeVisible(); }
const one = async (page, id = 'a') => (await dbTasks(page)).find((t) => t.id === id);

test.describe('タスクの通知の選択', () => {
  test('開いて保存しても通知は変わらない（通知なしに既定を足さない）', async ({ page }) => {
    await ready(page, [T('a')]); await edit(page, 'a');
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    await page.locator('#tk-title').fill('改');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    const t = await one(page);
    expect([t.title, t.notify]).toEqual(['改', false]);
  });

  test('時刻変更だけでは通知を変えない。日付のみは 8:00 の説明', async ({ page }) => {
    await ready(page, [T('a', { notify: true })]); await edit(page, 'a');
    await expect(page.locator('#tk-notify')).toBeChecked();
    await expect(page.locator('#tk-notewhy')).toContainText('8:00');
    await setTaskTime(page, 9, 30);
    await expect(page.locator('#tk-notewhy')).toContainText('時刻');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    const t = await one(page);
    expect([t.due, t.notify]).toEqual([{ date: '2026-11-12', time: '09:30' }, true]);
  });

  test('通知を外すと notify:false で保存される', async ({ page }) => {
    await ready(page, [T('a', { notify: true })]); await edit(page, 'a');
    await page.locator('#tk-notify').uncheck();
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    const t = await one(page);
    expect([t.notify, t.due]).toEqual([false, { date: '2026-11-12' }]);
  });

  test('期限なしでは通知不可。期限を戻すと操作した状態を反映し、期限なしで保存すると notify:false', async ({ page }) => {
    await ready(page, [T('a')]); await edit(page, 'a');
    await page.locator('#tk-notify').check();
    await clearTaskDue(page);
    await expect(page.locator('#tk-notify')).toBeDisabled();
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    await pickTaskDue(page, '2026-11-13');
    await expect(page.locator('#tk-notify')).toBeEnabled();
    await expect(page.locator('#tk-notify')).toBeChecked();
    await clearTaskDue(page);
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    const t = await one(page);
    expect([t.due, t.notify]).toEqual([null, false]);
  });

  test('保存失敗では保存シートに残りお知らせを出す（通知の選択も保持）。native 呼出0', async ({ page }) => {
    await ready(page, [T('a', { notify: true })]); await edit(page, 'a');
    await page.locator('#tk-notify').uncheck();
    await failPuts(page, true);
    await page.locator('#tk-save').click();
    await expect(page.locator('#tk-err')).not.toHaveText('');
    await expect(page.locator('#taskdlg')).toBeVisible();
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    expect((await one(page)).notify).toBe(true);
    expect(await reminderCalls(page)).toEqual([]);
  });

  test('追加: 既定は通知なし、オンにしたときだけ true、期限なしでは false', async ({ page }) => {
    await ready(page, []);
    await lp(page).locator('input.remin').click();
    const i = lp(page).locator('input.remin');
    await expect(lp(page).locator('[data-act="remnote"]')).toHaveAttribute('aria-checked', 'false');
    await i.fill('一'); await i.press('Enter'); await expect(i).toHaveValue('');
    await lp(page).locator('[data-act="remnote"]').click();
    await expect(lp(page).locator('[data-act="remnote"]')).toHaveAttribute('aria-checked', 'true');
    await i.fill('二'); await i.press('Enter'); await expect(i).toHaveValue('');
    await lp(page).locator('[data-act="remdue0"]').click();
    await expect(lp(page).locator('[data-act="remnote"]')).toHaveCount(0);
    await i.fill('三'); await i.press('Enter'); await expect(i).toHaveValue('');
    const d = await dbTasks(page);
    expect(d.map((t) => [t.title, t.notify])).toEqual([['一', false], ['二', true], ['三', false]]);
    expect(d[2].due).toBeNull();
  });
});
