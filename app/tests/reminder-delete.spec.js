// 第14版 PR20: タスクの削除と4秒の取消（偽装 native。Swift の実証ではない）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page, items) {
  await page.addInitScript((its) => {
    const M = window.__m = { calls: [], cbs: {}, items: its, fail: null, conflictOnce: false };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, JSON.parse(JSON.stringify(o))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'A', color: '#336699', allowsModify: true, isDefault: true }] };
        if (m === 'listReminders') return { reminders: M.items.map((x) => ({ ...x })) };
        if (m === 'deleteReminder') {
          if (M.fail) { const c = M.fail; M.fail = null; throw { code: c }; }
          const i = M.items.findIndex((x) => x.itemId === o.itemId);
          if (i < 0) return { deleted: true, missing: true };
          M.items.splice(i, 1);
          return { deleted: true };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, items);
}
const mk = (id, o = {}) => ({ itemId: id, externalId: 'e' + id, listId: 'L1', title: 'T' + id, notes: '', due: { date: '2026-11-12' }, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 50, readOnly: false, ...o });
const calls = (page) => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'deleteReminder').map((c) => c[1]));
const lp = (page) => page.locator('.page.lp');
async function ready(page) {
  await openApp(page, SIZES.openLandscape);
  await page.locator('.pgl [data-pick="task"]').first().click();
  await expect(page.locator('.page.lp .rmaddbtn')).toBeVisible();
}
async function swipe(page, id) {
  const b = await lp(page).locator(`[data-key="rm:${id}"] .rmbody`).boundingBox();
  const y = b.y + b.height / 2, x = b.x + b.width - 10;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 40, y, { steps: 3 }); await page.mouse.move(x - 140, y, { steps: 5 });
  await page.mouse.up();
}
const row = (page, id) => lp(page).locator(`[data-key="rm:${id}"]`);

test.describe('タスクの削除', () => {
  test('左スワイプで即非表示、4秒内は native 0、4秒後に1回（expectModifiedAt つき）', async ({ page }) => {
    await mock(page, [mk('a'), mk('b')]); await ready(page);
    await swipe(page, 'a');
    await expect(row(page, 'a')).toHaveCount(0);
    await expect(row(page, 'b')).toHaveCount(1);
    await expect(page.locator('#native-toast')).toContainText('リマインダーから削除しました');
    await page.waitForTimeout(3000);
    expect((await calls(page)).length).toBe(0);
    await expect.poll(async () => (await calls(page)).length, { timeout: 3000 }).toBe(1);
    expect((await calls(page))[0]).toEqual({ itemId: 'a', externalId: 'ea', expectModifiedAt: 50 });
    await page.waitForTimeout(600);
    await expect(row(page, 'a')).toHaveCount(0);
  });

  test('取り消すと native を呼ばず元へ戻り、再読込後も残る', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    await swipe(page, 'a');
    await expect(row(page, 'a')).toHaveCount(0);
    await page.locator('#native-toast button').click();
    await expect(row(page, 'a')).toHaveCount(1);
    await page.waitForTimeout(4500);
    expect((await calls(page)).length).toBe(0);
    await expect(row(page, 'a')).toHaveCount(1);
  });

  test('短いスワイプでは消さない（縦はスクロール扱い）', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    const b = await lp(page).locator('[data-key="rm:a"] .rmbody').boundingBox();
    const y = b.y + b.height / 2, x = b.x + b.width - 10;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 30, y, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(row(page, 'a')).toHaveCount(1);
    await expect(page.locator('#native-toast')).toHaveCount(0);
  });

  test('画面が裏に回ったら待っている削除を即送る', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    await swipe(page, 'a');
    expect((await calls(page)).length).toBe(0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await calls(page)).length).toBe(1);
  });

  test('失敗は表示へ戻してお知らせ。外部変更（CONFLICT）も残す', async ({ page }) => {
    await mock(page, [mk('a'), mk('b')]); await ready(page);
    await page.evaluate(() => { window.__m.fail = 'UNAVAILABLE'; });
    await swipe(page, 'a');
    await expect(page.locator('#native-toast')).toContainText('もとに戻しました', { timeout: 6000 });
    await expect(row(page, 'a')).toHaveCount(1);
    await page.evaluate(() => { window.__m.fail = 'CONFLICT'; });
    await swipe(page, 'b');
    await expect(page.locator('#native-toast')).toContainText('変更されていたため、削除せずに残しました', { timeout: 6000 });
    await expect(row(page, 'b')).toHaveCount(1);
  });

  test('連続削除は各自のタイマーで1回ずつ送る', async ({ page }) => {
    await mock(page, [mk('a'), mk('b')]); await ready(page);
    await swipe(page, 'a'); await page.waitForTimeout(1500); await swipe(page, 'b');
    await expect(row(page, 'a')).toHaveCount(0); await expect(row(page, 'b')).toHaveCount(0);
    await expect.poll(async () => (await calls(page)).map((c) => c.itemId), { timeout: 4000 }).toEqual(['a']);
    await expect.poll(async () => (await calls(page)).map((c) => c.itemId), { timeout: 4500 }).toEqual(['a', 'b']);
  });

  test('編集シートの削除ボタンで同じく4秒猶予。繰返し・読み取り専用は出ない', async ({ page }) => {
    await mock(page, [mk('a'), mk('c', { recurring: true }), mk('r', { readOnly: true })]); await ready(page);
    await row(page, 'a').locator('[data-act="remedit"]').click();
    await page.locator('#tk-del').click();
    await expect(row(page, 'a')).toHaveCount(0);
    expect((await calls(page)).length).toBe(0);
    await expect.poll(async () => (await calls(page)).length, { timeout: 6000 }).toBe(1);
    await page.waitForTimeout(500);
    await row(page, 'c').locator('[data-act="remedit"]').click();
    await expect(page.locator('#tk-del')).toBeHidden();
    await page.locator('#tk-close').click();
    await swipe(page, 'c'); await swipe(page, 'r');
    await expect(row(page, 'c')).toHaveCount(1); await expect(row(page, 'r')).toHaveCount(1);
    await page.waitForTimeout(4500);
    expect((await calls(page)).length).toBe(1);
  });
});
