// 第16版 PR17: タスクの削除と4秒の取消（Duo 内保存。native 呼出0）。
import { test, expect } from '@playwright/test';
import { SIZES } from './helpers.js';
import { spy, legacyCalls, openTasks, dbTasks, failPuts, T } from './task-helpers.js';

const lp = (page) => page.locator('.page.lp');
const row = (page, id) => lp(page).locator(`[data-key="rm:${id}"]`);
const ids = async (page) => (await dbTasks(page)).map((t) => t.id);
async function ready(page, seed) { await spy(page); await openTasks(page, SIZES.openLandscape, { seed }); }
async function swipe(page, id) {
  const b = await lp(page).locator(`[data-key="rm:${id}"] .rmbody`).boundingBox();
  const y = b.y + b.height / 2, x = b.x + b.width - 10;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 3 }); await page.mouse.move(x - 140, y, { steps: 5 });
  await page.mouse.up();
}

test.describe('タスクの削除', () => {
  test('左スワイプで即非表示、4秒内は保存したまま、4秒後に Duo 内から消える', async ({ page }) => {
    await ready(page, [T('a', { order: 1 }), T('b', { order: 2 })]);
    await swipe(page, 'a');
    await expect(row(page, 'a')).toHaveCount(0);
    await expect(row(page, 'b')).toHaveCount(1);
    await expect(page.locator('#native-toast')).toContainText('削除しました');
    await expect(page.locator('#native-toast')).not.toContainText('リマインダー');
    await page.waitForTimeout(3000);
    expect(await ids(page)).toEqual(['a', 'b']);
    await expect.poll(() => ids(page), { timeout: 3000 }).toEqual(['b']);
    await page.waitForTimeout(600);
    await expect(row(page, 'a')).toHaveCount(0);
    expect(await legacyCalls(page)).toEqual([]);
  });

  test('取り消すと保存を変えず元へ戻り、再読込後も残る', async ({ page }) => {
    await ready(page, [T('a')]);
    await swipe(page, 'a');
    await expect(row(page, 'a')).toHaveCount(0);
    await page.locator('#native-toast button').click();
    await expect(row(page, 'a')).toHaveCount(1);
    await page.waitForTimeout(4500);
    expect(await ids(page)).toEqual(['a']);
    await expect(row(page, 'a')).toHaveCount(1);
  });

  test('短いスワイプでは消さない（縦はスクロール扱い）', async ({ page }) => {
    await ready(page, [T('a')]);
    const b = await lp(page).locator('[data-key="rm:a"] .rmbody').boundingBox();
    const y = b.y + b.height / 2, x = b.x + b.width - 10;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 30, y, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(row(page, 'a')).toHaveCount(1);
    await expect(page.locator('#native-toast')).toHaveCount(0);
  });

  test('画面が裏に回ったら待っている削除を即保存へ反映する', async ({ page }) => {
    await ready(page, [T('a')]);
    await swipe(page, 'a');
    expect(await ids(page)).toEqual(['a']);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => ids(page)).toEqual([]);
  });

  test('保存失敗は表示へ戻してお知らせ（行は消えず、データも残る）', async ({ page }) => {
    await ready(page, [T('a'), T('b', { order: 2 })]);
    await page.evaluate(() => { const P = IDBObjectStore.prototype; const d = P.delete; P.delete = function (...a) { if (this.name === 'tasks') throw new DOMException('x', 'AbortError'); return d.apply(this, a); }; });
    await swipe(page, 'a');
    await expect(page.locator('#native-toast')).toContainText('もとに戻しました', { timeout: 6000 });
    await expect(row(page, 'a')).toHaveCount(1);
    expect(await ids(page)).toEqual(['a', 'b']);
  });

  test('連続削除は各自のタイマーで1件ずつ確定する', async ({ page }) => {
    await ready(page, [T('a'), T('b', { order: 2 })]);
    await swipe(page, 'a'); await page.waitForTimeout(1500); await swipe(page, 'b');
    await expect(row(page, 'a')).toHaveCount(0); await expect(row(page, 'b')).toHaveCount(0);
    await expect.poll(() => ids(page), { timeout: 4000 }).toEqual(['b']);
    await expect.poll(() => ids(page), { timeout: 4500 }).toEqual([]);
  });

  test('編集シートの削除ボタンで同じく4秒猶予', async ({ page }) => {
    await ready(page, [T('a')]);
    await row(page, 'a').locator('[data-act="remedit"]').click();
    await page.locator('#tk-del').click();
    await expect(row(page, 'a')).toHaveCount(0);
    expect(await ids(page)).toEqual(['a']);
    await expect.poll(() => ids(page), { timeout: 6000 }).toEqual([]);
  });
});
