// 第14版 PR13: タスクページのリマインダー許可の案内。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page, perm, after = 'granted') {
  await page.addInitScript(([p, a]) => {
    const M = window.__m = { calls: [], perm: p, after: a, cbs: {} };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m) => {
        M.calls.push(m);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: M.perm };
        if (m === 'requestReminderPermission') { if (M.perm === 'notDetermined') M.perm = M.after; return { status: M.perm }; }
        if (m === 'openSettings') return { opened: true };
        if (m === 'listReminderLists') return { lists: [] };
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, [perm, after]);
}
const OPEN = SIZES.openLandscape;
const n = (page, m) => page.evaluate((x) => window.__m.calls.filter((c) => c === x).length, m);
async function toTask(page) { await page.locator('.pgl [data-pick="task"]').first().click(); }

test.describe('リマインダー許可の案内', () => {
  test('未決定: 説明とボタン。表示だけでは request しない。ボタンで1回 request→granted', async ({ page }) => {
    await mock(page, 'notDetermined');
    await openApp(page, OPEN);
    await toTask(page);
    const g = page.locator('.page.lp .remgate');
    await expect(g).toContainText('iPhone のリマインダーと同じタスクを、ここで見たり追加したりできます。');
    expect(await n(page, 'requestReminderPermission')).toBe(0);
    await g.getByRole('button', { name: 'リマインダーへのアクセスを許可' }).click();
    expect(await n(page, 'requestReminderPermission')).toBe(1);
    await expect(page.locator('.page.lp .remgate')).toHaveCount(0);
    await expect(page.locator('.page.lp [data-wait="task"]')).toBeVisible();
  });
  test('拒否: 設定案内、設定を開く。入力は出ない。他ページは使える', async ({ page }) => {
    await mock(page, 'denied');
    await openApp(page, OPEN);
    await toTask(page);
    const g = page.locator('.page.lp .remgate');
    await expect(g).toContainText('設定アプリでリマインダーへのアクセスを許可すると使えます。');
    await g.getByRole('button', { name: '設定を開く' }).click();
    expect(await n(page, 'openSettings')).toBe(1);
    expect(await n(page, 'requestReminderPermission')).toBe(0);
    await page.locator('.pgl [data-pick="month"]').first().click();
    await expect(page.locator('.page.lp[data-page="month"]')).toBeVisible();
  });
  test('許可ダイアログで拒否→設定案内に切替、ボタンにfocus', async ({ page }) => {
    await mock(page, 'notDetermined', 'denied');
    await openApp(page, OPEN);
    await toTask(page);
    await page.locator('.page.lp .remgate button').click();
    await expect(page.locator('.page.lp .remgate')).toContainText('設定アプリで');
    await expect(page.locator('.page.lp .remgate button')).toBeFocused();
  });
  test('restricted: 制限の文言のみ、ボタンなし', async ({ page }) => {
    await mock(page, 'restricted');
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp .remgate')).toContainText('制限されています');
    await expect(page.locator('.page.lp .remgate button')).toHaveCount(0);
  });
  test('前面復帰で状態を再確認: 取消→案内、再許可→通常', async ({ page }) => {
    await mock(page, 'granted');
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp .remgate')).toHaveCount(0);
    await page.evaluate(() => { window.__m.perm = 'denied'; document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('.page.lp .remgate')).toContainText('設定アプリで');
    await page.evaluate(() => { window.__m.perm = 'granted'; document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('.page.lp .remgate')).toHaveCount(0);
    expect(await n(page, 'requestReminderPermission')).toBe(0);
  });
  test('カレンダー権限が拒否でも独立して案内が出る', async ({ page }) => {
    await mock(page, 'notDetermined');
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp .remgate button')).toBeVisible();
  });
  test('native なし: iPhone で使う旨', async ({ page }) => {
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp .remgate')).toContainText('iPhone のアプリで使えます');
    await expect(page.locator('.page.lp .remgate button')).toHaveCount(0);
  });
});
test.describe('縦の下パネル', () => {
  test('下パネルのタスクにも同じ案内', async ({ page }) => {
    await mock(page, 'notDetermined');
    await openApp(page, SIZES.openPortrait);
    await page.getByRole('button', { name: '下の段を表示' }).click();
    await expect(page.locator('.pnl')).toBeVisible();
    await page.locator('.pswitch').getByRole('button', { name: 'タスク', exact: true }).click();
    await expect(page.locator('.pnl .remgate button')).toBeVisible();
    await page.locator('.pnl .remgate button').click();
    await expect(page.locator('.pnl .remgate')).toHaveCount(0);
  });
});
