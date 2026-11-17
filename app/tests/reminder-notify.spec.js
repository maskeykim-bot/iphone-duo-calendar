// 第16版 PR21: タスクの通知は Duo の local 通知（notifySync）。旧リマインダーの EKAlarm 更新は行わない。DuoNative は偽装で、Swift の実動作の証明ではない。
import { test, expect } from '@playwright/test';
import { notifyOn, openApp, SIZES, seed, ev } from './helpers.js';
import { T, seedTasks, dbTasks } from './task-helpers.js';

const OPEN = SIZES.openLandscape;
async function mock(page) {
  await notifyOn(page);
  await page.addInitScript(() => {
    const M = window.__mock = { calls: [], pending: [], listeners: {} };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.listeners[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, JSON.parse(JSON.stringify(o ?? {}))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'notifyStatus' || m === 'requestNotifyPermission') return { status: 'granted' };
        if (m === 'notifySync') { M.pending = o.items; return { scheduled: o.items.length, removed: 0, skipped: 0 }; }
        if (m === 'notifyClear') { M.pending = []; return { removed: 0 }; }
        throw { code: 'UNAVAILABLE' };
      },
    };
  });
}
const ids = (page) => page.evaluate(() => window.__mock.pending.map((i) => i.id));
const names = (page) => page.evaluate(() => window.__mock.calls.map((c) => c[0]));
const SEED = [
  T('a', { due: { date: '2026-11-13', time: '10:30' }, notify: true }),
  T('b', { due: { date: '2026-11-14' }, notify: true }),
  T('off', { due: { date: '2026-11-13' }, notify: false }),
  T('dn', { due: { date: '2026-11-13' }, notify: true, done: true, doneAt: '2026-11-12T09:00' }),
  T('nd', { due: null, notify: false }),
];
const T2 = (id, due, o) => T(id, { due, ...o });

test.describe('タスクの local 通知', () => {
  test('notify・未完了・期限ありだけ予約。時刻は期限ちょうど、日付だけは8時。旧リマインダー API は0', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN, '?nosw');
    await seedTasks(page, SEED);
    await expect.poll(() => ids(page)).toEqual(['duo.task.a', 'duo.task.b']);
    const p = await page.evaluate(() => window.__mock.pending);
    expect(p.map((i) => [i.fireDate, i.eventId, i.day])).toEqual([['2026-11-13T10:30', 'task:a', '2026-11-13'], ['2026-11-14T08:00', 'task:b', '2026-11-14']]);
    expect((await names(page)).filter((m) => /Reminder/.test(m))).toEqual([]);
  });

  test('予定とタスクの混在 61 件以上: 近い順の59件＋refresh で60件以内。予定の通知は残る', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN, '?nosw');
    await seed(page, Array.from({ length: 35 }, (_, i) => ev(`e${i}`, `予定${i}`, `2026-11-15T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, '2026-11-15T23:00', { alarms: [{ before: 0 }] })));
    await seedTasks(page, Array.from({ length: 30 }, (_, i) => T2(`t${i}`, { date: '2026-11-16', time: `${String(i % 24).padStart(2, '0')}:${String(i).padStart(2, '0')}` }, { notify: true })));
    await expect.poll(async () => (await ids(page)).length).toBe(60);
    const l = await ids(page);
    expect(l.at(-1)).toBe('duo.refresh');
    expect(l.filter((x) => x.startsWith('duo.task.')).length).toBeGreaterThan(0);
    expect(l.filter((x) => /^duo\.e\d/.test(x)).length).toBeGreaterThan(0);
    expect(new Set(l).size).toBe(60);
  });

  test('完了で消え、元に戻すと再予約。重複なし', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN, '?nosw');
    await seedTasks(page, SEED);
    await expect.poll(() => ids(page)).toEqual(['duo.task.a', 'duo.task.b']);
    await page.locator('.pgl [data-pick="task"]').first().click();
    await page.locator('.page.lp [data-act="remck"][data-id="a"]').click();
    await expect.poll(() => ids(page), { timeout: 10000 }).toEqual(['duo.task.b']);
    await page.locator('#native-toast [data-act], #native-toast button').first().click();
    await expect.poll(() => ids(page), { timeout: 10000 }).toEqual(['duo.task.a', 'duo.task.b']);
    expect((await dbTasks(page)).find((t) => t.id === 'a').done).toBe(false);
  });

  test('全体 OFF は notifyClear。タスクの予約は残らない', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN, '?nosw');
    await seedTasks(page, SEED);
    await expect.poll(() => ids(page)).toHaveLength(2);
    await page.evaluate(() => { localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: false, showTitle: true, defaultTimed: null, defaultAllDay: null })); window.syncNotifications('test'); });
    await expect.poll(() => ids(page)).toEqual([]);
    expect(await names(page)).toContain('notifyClear');
  });

  test('通知タップ: 存在するタスクは詳細へ。消えたタスクは一覧へ（詳細は開かない）', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seedTasks(page, SEED);
    await page.evaluate(() => window.__mock.listeners.notificationTapped({ day: '2026-11-13', eventId: 'task:a' }));
    await expect(page.locator('#taskdlg')).toBeVisible();
    await expect(page.locator('#tk-title')).toHaveValue('Ta');
    await page.locator('#tk-cancel, #tk-close').first().click().catch(() => page.keyboard.press('Escape'));
    await page.evaluate(() => window.__mock.listeners.notificationTapped({ day: '2026-11-20', eventId: 'task:gone' }));
    await expect(page.locator('#taskdlg')).toBeHidden();
    await expect(page.locator('.remin, [data-sec], .rmempty').first()).toBeVisible();
  });
});
