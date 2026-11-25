// 第19.6版（征希さん「予定の新規登録時、タスクの登録もできるように」）: 新しい予定・新しいタスクのシートの「予定｜タスク」（実装担当）。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { boot, DAY } from './v193-p2-lib.js';
import { dbEvents } from './helpers.js';

const tasks = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listTasks()).map((t) => ({ title: t.title, due: t.due })));
const seg = (page, dlg, name) => page.locator(`${dlg} .edkind`).getByRole('button', { name, exact: true });

test('NK-1 ＋ → 予定のシートの上に「予定｜タスク」。「タスク」を押すと、書きかけの題名・日付・時刻を持ってタスクのシートへ移る。保存するとタスクだけができる（予定は作らない）', async ({ page }) => {
  await boot(page);
  const n0 = (await dbEvents(page)).length;
  await page.locator('.ctl').getByRole('button', { name: '予定を追加' }).click();
  await expect(page.locator('#editor[open]')).toBeVisible();
  await expect(seg(page, '#editor', '予定')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#f-title').fill('資料を出す');
  await seg(page, '#editor', 'タスク').click();
  await expect(page.locator('#taskdlg[open]')).toBeVisible(); await expect(page.locator('#editor[open]')).toHaveCount(0);
  await expect(seg(page, '#taskdlg', 'タスク')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tk-title')).toHaveValue('資料を出す');
  await expect(page.locator('#tk-date')).toHaveJSProperty('value', DAY); await expect(page.locator('#tk-time')).toHaveJSProperty('value', '10:00');
  expect(await tasks(page)).toEqual([]); // 保存するまで何も作らない
  await page.locator('#tk-save').click();
  await expect.poll(() => tasks(page)).toEqual([{ title: '資料を出す', due: { date: DAY, time: '10:00' } }]);
  expect((await dbEvents(page)).length).toBe(n0);
});

test('NK-2 タスクのシートから「予定」へ戻れる（題名・日付・時刻を持って）。いまある予定・タスクを開いたときは切り替えを出さない', async ({ page }) => {
  await boot(page);
  await page.locator('.mday [data-act="addtask"]').click();
  await expect(page.locator('#taskdlg[open]')).toBeVisible();
  await page.locator('#tk-title').fill('歯医者');
  await seg(page, '#taskdlg', '予定').click();
  await expect(page.locator('#editor[open]')).toBeVisible(); await expect(page.locator('#taskdlg[open]')).toHaveCount(0);
  await expect(page.locator('#f-title')).toHaveValue('歯医者'); await expect(page.locator('#f-start')).toHaveJSProperty('value', DAY.replaceAll('-', '/'));
  await page.locator('#save').click();
  await expect.poll(async () => (await dbEvents(page)).filter((e) => e.title === '歯医者').length).toBe(1);
  expect(await tasks(page)).toEqual([]);
  // いまある予定を開く: 切り替えは出ない
  await page.locator('.mday .mdcard[data-event="t0"]').click();
  await expect(page.locator('#editor[open]')).toBeVisible(); await expect(page.locator('#editor .edkind')).toHaveCount(0);
});
