// 第16版 PR17: タスクを続けて追加する（Duo 内保存。native 呼出0）。DP-5・TK-2・TM-1/4/6/7。
import { test, expect } from '@playwright/test';
import { SIZES } from './helpers.js';
import { spy, reminderCalls, openTasks, dbTasks, failPuts, holdTasks, releaseTasks, T } from './task-helpers.js';

const OPEN = SIZES.openLandscape;
const lp = (page) => page.locator('.page.lp');
const titles = async (page) => (await dbTasks(page)).map((t) => t.title);
async function ready(page, o) { await spy(page); await openTasks(page, OPEN, o); }
async function openAdd(page) { const i = lp(page).locator('input.remin'); await i.click(); await expect(i).toBeFocused(); return i; }

test.describe('タスクの続けて追加', () => {
  test('許可なし・Web でなくても日英3件が未完了で入り、再起動後も残る。native 呼出0', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    expect(await i.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限 11/12');
    for (const t of ['牛乳', 'Buy milk', 'パン and bread']) { await i.fill(t); await i.press('Enter'); await expect(i).toHaveValue(''); await expect(i).toBeFocused(); }
    expect(await titles(page)).toEqual(['牛乳', 'Buy milk', 'パン and bread']);
    const d = await dbTasks(page);
    expect(d.every((t) => t.done === false && t.notify === false && t.due.date === '2026-11-12')).toBe(true);
    expect(d.map((t) => t.order)).toEqual([1, 2, 3]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('.pgl [data-pick="task"]').first().click();
    for (const t of d) await expect(lp(page).locator(`[data-key="rm:${t.id}"]`)).toHaveCount(1);
    expect(await reminderCalls(page)).toEqual([]);
    await expect(page.locator('body')).not.toContainText('旧リマインダー');
  });

  test('× で期限なし。もう一度たたくと日付の部品が開き、日をたたくと期限が付く', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await lp(page).locator('[data-act="remdue0"]').click();
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限なし');
    await expect(i).toBeFocused();
    await i.fill('いつか'); await i.press('Enter');
    await expect(i).toHaveValue('');
    expect((await dbTasks(page))[0].due).toBeNull();
    await lp(page).locator('[data-act="remdue2"]').click();
    await lp(page).locator('.rmdp .dcell[data-day="2026-11-12"]').click();
    await expect(lp(page).locator('.rmdp')).toHaveCount(0);
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限 11/12');
  });

  test('期限の部品で日付と時刻を選んで追加できる。通知は既定でなし', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await lp(page).locator('[data-act="remdue2"]').click();
    await lp(page).locator('.rmdp .dcell[data-day="2026-11-20"]').click();
    await lp(page).locator('[data-act="remdue2"]').click();
    await lp(page).locator('[data-act="remtimeon"]').click();
    await lp(page).locator('[data-act="remth"][data-h="10"]').click();
    await lp(page).locator('[data-act="remtm"][data-m="30"]').click();
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限 11/20 10:30');
    await i.fill('時刻つき'); await i.press('Enter');
    await expect(i).toHaveValue('');
    const t = (await dbTasks(page))[0];
    expect(t.due).toEqual({ date: '2026-11-20', time: '10:30' });
    expect(t.notify).toBe(false);
  });

  test('連打は1件だけ（保存中は排他）／保存中は入力欄が readonly', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await i.fill('連打');
    await holdTasks(page);
    await i.press('Enter'); await i.press('Enter'); await i.press('Enter');
    await expect(i).toHaveAttribute('readonly', '');
    await expect(i).toHaveValue('連打'); // DB 成功まで消さない
    await releaseTasks(page);
    await expect(i).toHaveValue('');
    expect(await titles(page)).toEqual(['連打']);
  });

  test('IME 変換中の Enter は保存しない（確定後の Enter で保存）', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await i.fill('かいもの');
    await i.evaluate((e) => e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await i.evaluate((e) => e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true })));
    await page.waitForTimeout(150);
    expect(await titles(page)).toEqual([]);
    await i.evaluate((e) => e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await i.press('Enter');
    await expect(i).toHaveValue('');
    expect(await titles(page)).toEqual(['かいもの']);
  });

  test('変換中に再描画が来ても入力欄は作り直されない', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await i.fill('abc');
    await i.evaluate((e) => { e.dataset.mark = '1'; e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(lp(page).locator('input.remin')).toHaveAttribute('data-mark', '1');
    await i.evaluate((e) => e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  });

  test('保存失敗では本文を残し理由を出す。再試行で1件だけ入る（同じ id）', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await failPuts(page, true);
    await i.fill('失う'); await i.press('Enter');
    await expect(lp(page).locator('.rmadd .rmwhy.err')).toContainText('保存できませんでした');
    await expect(i).toHaveValue('失う'); await expect(i).toBeFocused();
    expect(await titles(page)).toEqual([]);
    await failPuts(page, false);
    await i.press('Enter');
    await expect(lp(page).locator('.rmwhy.err')).toHaveCount(0);
    await expect(i).toHaveValue('');
    await i.fill('次'); await i.press('Enter'); await expect(i).toHaveValue('');
    expect(await titles(page)).toEqual(['失う', '次']);
    await page.waitForTimeout(600);
    expect(await lp(page).locator('[data-key^="rm:"] .rmt').allTextContents()).toEqual(['失う', '次']);
  });

  test('追加ボタンでも失敗の再試行ができる。ボタンは入力欄からフォーカスを奪わない', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await failPuts(page, true);
    await i.fill('残る'); await lp(page).locator('[data-act="remsubmit"]').click();
    await expect(lp(page).locator('.rmadd .rmwhy.err')).toBeVisible();
    await expect(i).toHaveValue('残る');
    await failPuts(page, false);
    await lp(page).locator('[data-act="remsubmit"]').click();
    await expect(i).toHaveValue(''); await expect(lp(page).locator('.rmwhy.err')).toHaveCount(0);
    expect(await titles(page)).toEqual(['残る']);
  });

  test('追加直後の再読込（300ms 後）でも追加済みの行は消えず二重にもならない', async ({ page }) => {
    await ready(page, { seed: [T('a', { title: '既存' })] });
    const i = await openAdd(page);
    await i.fill('新規'); await i.press('Enter'); await expect(i).toHaveValue('');
    await page.waitForTimeout(700); // 追加後の再読込が走る
    expect((await lp(page).locator('[data-key^="rm:"] .rmt').allTextContents()).sort()).toEqual(['新規', '既存'].sort());
  });

  test('PR5: 日英3連続・同じ入力ノード・229 でも実変換中でなければ保存・連打は1件', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await i.evaluate((e) => { e.dataset.same = '1'; });
    for (const t of ['りんご', 'banana', 'みかん']) { await i.pressSequentially(t); await i.press('Enter'); await expect(i).toHaveValue(''); await expect(i).toBeFocused(); }
    await expect(lp(page).locator('input.remin')).toHaveAttribute('data-same', '1');
    expect(await titles(page)).toEqual(['りんご', 'banana', 'みかん']);
    await i.fill('二重');
    await i.evaluate((e) => { for (let n = 0; n < 3; n++) e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true })); });
    await expect(i).toHaveValue('');
    expect((await titles(page)).filter((x) => x === '二重').length).toBe(1);
  });

  test('PR5: 変換確定前に追加ボタン→確定後に1回だけ保存。blur 後の再入力もできる', async ({ page }) => {
    await ready(page);
    const i = await openAdd(page);
    await i.fill('ぱん');
    await i.evaluate((e) => e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    const go = lp(page).locator('[data-act="remsubmit"]');
    const pd = await go.evaluate((b) => { const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true }); b.dispatchEvent(ev); return ev.defaultPrevented; });
    expect(pd).toBe(true);
    await go.click();
    expect(await titles(page)).toEqual([]);
    await i.evaluate((e) => { e.value = 'パン'; e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
    await expect(i).toHaveValue('');
    expect(await titles(page)).toEqual(['パン']);
    await i.evaluate((e) => e.blur()); await i.click(); await i.pressSequentially('next'); await i.press('Enter');
    await expect(i).toHaveValue(''); expect(await titles(page)).toEqual(['パン', 'next']);
  });

  test('ページの＋で入力欄にフォーカス。予定・outbox・書き出しへタスク名が混ざらない', async ({ page }) => {
    await ready(page);
    await page.locator('[data-act="add"]').first().click();
    const i = lp(page).locator('input.remin');
    await expect(i).toBeFocused();
    await i.fill('秘密のタスク名'); await i.press('Enter');
    await expect(i).toHaveValue('');
    const dump = await page.evaluate(async () => {
      const db = await import('/js/db.js'); const b = await import('/js/backup.js');
      const bk = JSON.stringify(b.buildBackup(await db.listEvents(), {}, new Date(), [], [], await db.listTasks()));
      return { ev: JSON.stringify(await db.listEvents()), ob: JSON.stringify(await db.getOutbox()), bk, ls: JSON.stringify(Object.entries(localStorage)) };
    });
    expect(dump.ev + dump.ob + dump.ls).not.toContain('秘密のタスク名');
    expect(dump.bk).toContain('秘密のタスク名'); // タスクは書き出しで守られる（PR16）
  });
});
