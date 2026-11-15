// 第11版 PR3: 通知の再予約（全起点・debounce・世代・直列化）。DuoNative は偽装で、Swift の実動作の証明ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, addEvent, loadSample, openMenu } from './helpers.js';

const A = ev('a1', '会議', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }] });

async function mock(page, cfg = {}) {
  await page.addInitScript((c) => {
    const M = window.__mock = { notif: c.notif ?? 'granted', calls: [], pending: [], active: 0, maxActive: 0, statusDelay: c.statusDelay ?? 0, syncDelay: c.syncDelay ?? 0, syncFail: c.syncFail ?? 0, listeners: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        const rec = { method, opts: JSON.parse(JSON.stringify(opts ?? {})), t: Date.now() };
        M.calls.push(rec);
        const notif = method.startsWith('notify') || method === 'requestNotifyPermission';
        if (notif) { M.active++; M.maxActive = Math.max(M.maxActive, M.active); }
        try {
          switch (method) {
            case 'checkPermission': return { status: 'denied' };
            case 'notifyStatus': await wait(M.statusDelay); return { status: M.notif };
            case 'requestNotifyPermission': return { status: M.notif };
            case 'notifySync': {
              await wait(M.syncDelay);
              if (M.syncFail > 0) { M.syncFail--; throw { code: 'UNAVAILABLE', message: 'x' }; }
              M.pending = opts.items;
              return { scheduled: opts.items.length, removed: 0, skipped: 0 };
            }
            case 'notifyClear': { const n = M.pending.length; M.pending = []; return { removed: n }; }
            default: throw { code: 'UNAVAILABLE', message: method };
          }
        } finally { if (notif) M.active--; }
      },
    };
  }, cfg);
}
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => c.method === m), m);
const count = (page, m) => calls(page, m).then((l) => l.length);
const syncs = (page) => page.evaluate(() => window.syncNotifications('test'));
const settle = (page, ms = 900) => page.waitForTimeout(ms);

test.describe('通知の再予約', () => {
  test('起動: 連携オフ・カレンダー権限なしでも1回送る。許可は要求しない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.map((i) => i.id))).toEqual(['duo.a1@2026-11-13T10:00#0']);
    expect(await count(page, 'notifySync')).toBe(1); // 偽装は再読込で作り直されるので、seed 後の起動の1回だけ
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
  });

  test('3連続の要求は1回の送信にまとまる（500ms trailing debounce）', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await expect.poll(() => count(page, 'notifySync'), { timeout: 10000 }).toBe(1);
    await page.evaluate(() => { window.syncNotifications('a'); window.syncNotifications('b'); window.syncNotifications('c'); });
    // 固定の待ちではなく条件待ち: 負荷で遅れても、2回目が届くまで待つ。その後に余裕を持って静かな時間を置き、3回に増えないことを確かめる。
    await expect.poll(() => count(page, 'notifySync'), { timeout: 10000 }).toBe(2);
    await settle(page, 1500);
    expect(await count(page, 'notifySync')).toBe(2);
  });

  test('status 取得中に新しい要求が来たら古い要求は送らない。同時実行は1', async ({ page }) => {
    await mock(page, { statusDelay: 700 });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await expect.poll(() => count(page, 'notifyStatus')).toBe(1); // 起動の1回目が status 待ち
    await page.evaluate(() => window.syncNotifications('x'));
    await expect.poll(() => count(page, 'notifySync'), { timeout: 5000 }).toBe(1);
    await settle(page, 1800);
    expect(await count(page, 'notifySync')).toBe(1);
    expect(await page.evaluate(() => window.__mock.maxActive)).toBe(1);
  });

  test('送信中に来た要求は完了を待って最新を送る（同時実行1）', async ({ page }) => {
    await mock(page, { syncDelay: 800 });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await expect.poll(() => count(page, 'notifySync')).toBe(1);
    await page.evaluate(() => window.syncNotifications('again'));
    await expect.poll(() => count(page, 'notifySync'), { timeout: 5000 }).toBe(2);
    await settle(page, 1000);
    expect(await page.evaluate(() => window.__mock.maxActive)).toBe(1);
  });

  test('オフなら clear だけ送る（status も sync も呼ばない）。直前の送信より後に来る', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.length)).toBe(1);
    await page.evaluate(() => { localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: false })); window.__mock.calls.length = 0; });
    await syncs(page);
    await expect.poll(() => count(page, 'notifyClear')).toBe(1);
    expect(await count(page, 'notifySync')).toBe(0);
    expect(await count(page, 'notifyStatus')).toBe(0);
    expect(await page.evaluate(() => window.__mock.pending.length)).toBe(0);
  });

  test('未許可なら送らない。許可後の要求で送る', async ({ page }) => {
    await mock(page, { notif: 'denied' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await settle(page);
    expect(await count(page, 'notifySync')).toBe(0);
    expect(await count(page, 'notifyStatus')).toBeGreaterThan(0);
    await page.evaluate(() => { window.__mock.notif = 'provisional'; window.syncNotifications('permission'); });
    await expect.poll(() => count(page, 'notifySync')).toBe(1);
  });

  test('例外のあとも次の要求は成功する', async ({ page }) => {
    await mock(page, { syncFail: 1 });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await expect.poll(() => count(page, 'notifySync')).toBe(1); // 失敗
    await syncs(page);
    await expect.poll(() => count(page, 'notifySync')).toBe(2);
  });

  test('起点: 保存・カテゴリ・サンプル・前面復帰・時刻変更・結びつき', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await expect.poll(() => count(page, 'notifySync')).toBe(1);
    const next = async (n) => { await expect.poll(() => count(page, 'notifySync'), { timeout: 5000 }).toBe(n); };
    await loadSample(page);
    await next(2);
    await addEvent(page, { title: '新規', start: '2026/11/12 10:00', end: '2026/11/12 11:00' });
    await next(3);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await next(4);
    await page.evaluate(() => window.__mock.listeners.timeChanged({ reason: 'timeZone' }));
    await next(5);
  });

  test('カテゴリの保存・削除・undo の後に再予約する', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await expect.poll(() => count(page, 'notifySync')).toBe(1);
    await page.evaluate(async () => { await import('/js/db.js').then((db) => db.putCategory({ id: 'n-cat', name: '通知用', color: '#5e4c8e', order: 9, hidden: false, createdAt: 1, updatedAt: 2 })); });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    const base = await count(page, 'notifySync');
    await openMenu(page);
    await page.locator('#menu').getByRole('button', { name: 'カテゴリ' }).click();
    await page.locator('[data-cat-vis="n-cat"]').click();
    await expect.poll(() => count(page, 'notifySync'), { timeout: 5000 }).toBe(base + 1);
  });

  test('同じバックアップを2回追加しても予約件数は変わらない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.length)).toBe(1);
    const json = await page.evaluate(async () => {
      const [{ buildBackup }, db] = await Promise.all([import('/js/backup.js'), import('/js/db.js')]);
      return JSON.stringify(buildBackup(await db.listEvents(), {}, new Date(), await db.listCategories()));
    });
    for (let i = 0; i < 2; i++) {
      await openMenu(page);
      await page.getByRole('button', { name: 'バックアップ' }).click();
      await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await page.locator('#bk-add').click();
      await expect(page.locator('#backup')).toBeHidden();
    }
    await settle(page);
    expect(await page.evaluate(() => window.__mock.pending.length)).toBe(1);
  });
});
