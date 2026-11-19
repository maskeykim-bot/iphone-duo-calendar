// 第16版 PR17: タスクの編集と完了の操作（Duo 内保存。native 呼出0）。操作仕様の仕上げは PR18/19。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, legacyPanelInit, clearTaskDue, pickTaskDue, setTaskTime } from './helpers.js';
import { spy, reminderCalls, openTasks, dbTasks, failPuts, T } from './task-helpers.js';

const lp = (page) => page.locator('.page.lp');
async function ready(page, seed, sz = SIZES.openLandscape) { await spy(page); await openTasks(page, sz, { seed }); }
const one = async (page, id = 'a') => (await dbTasks(page)).find((t) => t.id === id);

test.describe('タスクの編集と完了', () => {
  test('完了は表示だけ即、1.5秒は同じ段で完了表示（保存はその後1回）、その後完了段へ。native 呼出0', async ({ page }) => {
    await ready(page, [T('a')]);
    const row = lp(page).locator('[data-key="rm:a"]');
    await row.locator('[data-act="remck"]').click();
    await expect(row).toHaveClass(/done/);
    await expect(lp(page).locator('[data-sec="selected"] [data-key="rm:a"]')).toHaveCount(1); // まだ同じ段
    expect((await one(page)).done).toBe(false); // 1.5秒の間は保存しない
    await expect(lp(page).locator('[data-sec="selected"]')).toHaveCount(0, { timeout: 3500 }); // 移った
    await expect(lp(page).locator('[data-act="remdone"]')).toContainText('完了（1）');
    expect((await one(page)).done).toBe(true);
    expect((await one(page)).doneAt).toMatch(/^2026-11-12T\d\d:\d\d$/);
    expect(await reminderCalls(page)).toEqual([]);
  });

  test('素早い完了戻しは最後の状態（未完了）で保存され、移動しない', async ({ page }) => {
    await ready(page, [T('a')]);
    const ck = lp(page).locator('[data-key="rm:a"] [data-act="remck"]');
    await ck.click(); await ck.click();
    await expect(lp(page).locator('[data-key="rm:a"]')).not.toHaveClass(/done/);
    await page.waitForTimeout(2000);
    const t = await one(page);
    expect([t.done, t.doneAt]).toEqual([false, null]);
    await expect(lp(page).locator('[data-sec="selected"] [data-key="rm:a"]')).toHaveCount(1);
  });

  test('保存失敗は表示を戻してお知らせ', async ({ page }) => {
    await ready(page, [T('a')]);
    await failPuts(page, true);
    await lp(page).locator('[data-key="rm:a"] [data-act="remck"]').click();
    await expect(page.locator('#native-toast')).toBeVisible();
    await expect(lp(page).locator('[data-key="rm:a"]')).not.toHaveClass(/done/);
    expect((await one(page)).done).toBe(false);
  });

  test('編集は題名だけ変える。期限・メモ・通知など他の項目は保つ', async ({ page }) => {
    await ready(page, [T('a', { due: { date: '2026-11-12', time: '10:07' }, note: 'メモ', notify: true })]);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await expect(page.locator('#taskdlg')).toBeVisible();
    await expect(page.locator('#tk-title')).toBeFocused();
    await expect(page.locator('#tk-note')).toContainText('Duo 内に保存されます。');
    await expect(page.locator('#tk-list')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('.page').closest('[inert]') !== null)).toBe(true);
    await page.locator('#tk-title').fill('新題名');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    const t = await one(page);
    expect([t.title, t.due, t.note, t.notify]).toEqual(['新題名', { date: '2026-11-12', time: '10:07' }, 'メモ', true]);
    await expect(lp(page).locator('[data-key="rm:a"] .rmt')).toHaveText('新題名');
  });

  test('期限をなしにする。変更なしは保存しない（updatedAt 不変）', async ({ page }) => {
    await ready(page, [T('a', { notify: true })]);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await one(page)).updatedAt).toBe(1);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await clearTaskDue(page);
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    const t = await one(page);
    expect([t.due, t.notify]).toEqual([null, false]);
  });

  test('保存失敗は理由を出して閉じない。削除済みは作り直さず案内', async ({ page }) => {
    await ready(page, [T('a'), T('b', { order: 2 })]);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await page.locator('#tk-notes').fill('メモ');
    await failPuts(page, true);
    await page.locator('#tk-save').click();
    await expect(page.locator('#tk-err')).toContainText('保存できませんでした');
    await expect(page.locator('#taskdlg')).toBeVisible();
    await failPuts(page, false);
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await one(page)).note).toBe('メモ');
    await lp(page).locator('[data-key="rm:b"] [data-act="remedit"]').click();
    await page.evaluate(async () => { await (await import('/js/db.js')).deleteTask('b'); });
    await page.locator('#tk-title').fill('x');
    await page.locator('#tk-save').click();
    await expect(page.locator('#tk-err')).toContainText('削除されています');
    expect((await dbTasks(page)).map((t) => t.id)).toEqual(['a']); // 作り直さない
  });

  test('未保存の変更は破棄の確認、閉じると行へフォーカスが戻る', async ({ page }) => {
    await ready(page, [T('a')]);
    const edit = lp(page).locator('[data-key="rm:a"] [data-act="remedit"]');
    await edit.click();
    await page.locator('#tk-title').fill('変更');
    await page.keyboard.press('Escape');
    await expect(page.locator('#discard')).toBeVisible();
    await page.locator('#dc-keep').click();
    await expect(page.locator('#discard')).toBeHidden(); // 確認シートが閉じ終わってから（0.25秒の動き）
    await expect(page.locator('#tk-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('#dc-drop').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    await expect(edit).toBeFocused();
    expect((await one(page)).title).toBe('Ta');
  });

  for (const k of ['openPortrait', 'openLandscape951']) test(`${k} でも完了できる`, async ({ page }) => {
    await legacyPanelInit(page);
    await spy(page);
    await openApp(page, SIZES[k]);
    const { seedTasks } = await import('./task-helpers.js');
    await seedTasks(page, [T('a')]);
    if (k === 'openPortrait') { await page.locator('[data-act="pnltoggle"]').first().click().catch(() => {}); await page.locator('[data-pnl="task"]').first().click().catch(() => {}); }
    else { await page.locator('.pgl [data-pick="task"]').first().click(); }
    const row = page.locator('[data-key="rm:a"]').first();
    await expect(row).toBeVisible();
    await row.locator('[data-act="remck"]').click();
    await expect.poll(async () => (await one(page)).done).toBe(true);
  });
});

// 第15版 PR19: タスクの期限は予定と同じ日付・時刻の部品。未操作は何も保存しない（Duo 内保存へ）。
test.describe('タスクの期限の共通部品', () => {
  const editT = async (page, id) => { await lp(page).locator(`[data-key="rm:${id}"] [data-act="remedit"]`).click(); await expect(page.locator('#taskdlg')).toBeVisible(); };
  const save = async (page) => { await page.locator('#tk-save').click(); await expect(page.locator('#taskdlg')).toBeHidden(); };

  test('日付のみ・10:07・期限なし・通知付きは、開いて保存しても何も書き換えない', async ({ page }) => {
    await ready(page, [T('a', { order: 1 }), T('b', { order: 2, due: { date: '2026-11-12', time: '10:07' } }), T('c', { order: 3, due: null }), T('d', { order: 4, notify: true })]);
    const before = await dbTasks(page);
    for (const id of ['a', 'b', 'c', 'd']) {
      await editT(page, id);
      await expect(page.locator('#tk-date')).toBeVisible();
      await save(page);
    }
    expect(await dbTasks(page)).toEqual(before);
  });

  test('10:07 は表示のまま、時だけ押しても 07 分を保ち、分は押さなければ変えない', async ({ page }) => {
    await ready(page, [T('b', { due: { date: '2026-11-12', time: '10:07' } })]);
    await editT(page, 'b');
    await expect(page.locator('#tk-time')).toHaveText('10:07');
    await expect(page.locator('#tk-timeon')).toBeChecked();
    await setTaskTime(page, 11);
    await expect(page.locator('#tk-time')).toHaveText('11:07');
    await save(page);
    expect((await one(page, 'b')).due).toEqual({ date: '2026-11-12', time: '11:07' });
  });

  test('期限だけ変えても通知はオンにならない。時刻を外すと日付のみ', async ({ page }) => {
    await ready(page, [T('a'), T('b', { order: 2, due: { date: '2026-11-12', time: '10:07' } })]);
    await editT(page, 'a');
    await pickTaskDue(page, '2026-11-20');
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    await save(page);
    await editT(page, 'b');
    await page.locator('#tk-timeon').uncheck();
    await expect(page.locator('#tk-time')).toBeHidden();
    await save(page);
    const a = await one(page, 'a'), b = await one(page, 'b');
    expect([a.due, a.notify]).toEqual([{ date: '2026-11-20' }, false]);
    expect(b.due).toEqual({ date: '2026-11-12' });
  });

  test('期限なしでは「時刻を入れる」は使えない。日付を選ぶと使える', async ({ page }) => {
    await ready(page, [T('c', { due: null })]);
    await editT(page, 'c');
    await expect(page.locator('#tk-date')).toHaveText('期限なし');
    await expect(page.locator('#tk-timeon')).toBeDisabled();
    await pickTaskDue(page, '2026-11-25');
    await expect(page.locator('#tk-timeon')).toBeEnabled();
    await setTaskTime(page, 8, 45);
    await save(page);
    expect((await one(page, 'c')).due).toEqual({ date: '2026-11-25', time: '08:45' });
  });
});
