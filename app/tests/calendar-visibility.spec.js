// 第15版 PR3: 画面・検索・通知が同じ表示条件（hidden カテゴリ／linked の追加先 ✓）を使う。偽装は契約の写しで実機の証明ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, dbEvents, clickSearch, tab } from './helpers.js';
import { CAT_IDS } from '../js/categories.js';

const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-2', title: '仕事用', color: '#0b8043', sourceId: 's', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false },
];
const AL = [{ before: 30 }];
const EVS = [
  ev('hid', 'ひみつ会議', '2026-11-13T10:00', '2026-11-13T11:00', { categoryId: CAT_IDS.family, alarms: AL }),
  ev('shown', 'ふつう会議', '2026-11-13T12:00', '2026-11-13T13:00', { alarms: AL }),
  ev('lon', 'リンクオン会議', '2026-11-13T14:00', '2026-11-13T15:00', { categoryId: CAT_IDS.family, nativeLink: { v: 2, state: 'linked', calendarId: 'cal-1', requestId: 'r1', eventId: 'x1' } }),
  ev('loff', 'リンクオフ会議', '2026-11-13T16:00', '2026-11-13T17:00', { nativeLink: { v: 2, state: 'linked', calendarId: 'cal-2', requestId: 'r2', eventId: 'x2' } }),
  ev('rec', '毎日会議', '2026-11-13T18:00', '2026-11-13T19:00', { alarms: AL, recurrence: { freq: 'daily', interval: 1, byDay: null, count: 3, until: null },
    overrides: { '2026-11-14T18:00': { title: '毎日会議2', start: '2026-11-14T18:00', end: '2026-11-14T19:00', categoryId: CAT_IDS.family } } }),
];

async function mock(page) {
  await page.addInitScript(({ cals }) => {
    localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: true, calendarIds: ['cal-1'], selectionInitialized: true, defaultCalendarId: null, addByDefault: true }));
    const M = window.__mock = { calls: [], pending: [], listeners: {}, listArgs: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (p, m, o, cb) => { M.listeners[o.eventName] = cb; return 'cb'; },
      nativePromise: async (p, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: cals };
          case 'listEvents': return { events: [] };
          case 'reminderPermission': return { status: 'denied' };
          case 'notifyStatus': return { status: 'granted' };
          case 'notifySync': M.pending = opts.items; return { scheduled: opts.items.length, removed: 0, skipped: 0 };
          case 'notifyClear': M.pending = []; return { removed: 0 };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS });
}
const pending = (page) => page.evaluate(() => window.__mock.pending.map((i) => i.eventId));
const setHidden = (page, id, hidden) => page.evaluate(async ({ id, hidden }) => { const db = await import('/js/db.js'); const c = (await db.listCategories()).find((x) => x.id === id); await db.putCategory({ ...c, hidden }); }, { id, hidden });

test.describe('表示条件の統一', () => {
  test('hidden カテゴリと、オフのカレンダーへ追加した写しは、画面・検索・通知から外れ、データは残る', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await setHidden(page, CAT_IDS.family, true);
    await seed(page, EVS);
    await expect.poll(() => pending(page), { timeout: 10000 }).toContain('shown');
    const ids = await pending(page);
    expect(ids).not.toContain('hid'); // hidden は予約しない
    expect(ids).not.toContain('lon'); expect(ids).not.toContain('loff'); // linked は Duo では元々鳴らさない
    expect(ids.filter((i) => i === 'rec').length).toBeGreaterThan(0);
    // 11/14 の回は個別変更で hidden カテゴリになったので予約されない
    expect(await page.evaluate(() => window.__mock.pending.filter((i) => i.eventId === 'rec').map((i) => i.day))).not.toContain('2026-11-14');

    // 画面（日）: 11/13
    const body = async (q) => { await clickSearch(page); await page.locator('#sr-q').fill(q); await page.waitForTimeout(400); const t = await page.locator('#sr-body').innerText(); await page.keyboard.press('Escape'); return t; };
    expect(await body('会議')).toContain('ふつう会議');
    expect(await body('会議')).toContain('リンクオン会議'); // 追加先 ✓ ありは hidden カテゴリでも出る
    expect(await body('会議')).not.toContain('ひみつ会議');
    expect(await body('会議')).not.toContain('リンクオフ会議');
    expect(await body('毎日会議2')).not.toContain('毎日会議2'); // 個別変更で hidden になった回

    // データは不変
    expect((await dbEvents(page)).length).toBe(EVS.length);
    expect((await dbEvents(page)).find((e) => e.id === 'hid').categoryId).toBe(CAT_IDS.family);

    // 表示に戻すと同じ予定が戻る（通知も再計画）
    await setHidden(page, CAT_IDS.family, false);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect.poll(() => pending(page), { timeout: 10000 }).toContain('hid');
    expect(await body('ひみつ')).toContain('ひみつ会議');
  });

  test('月・日の画面でも同じ条件', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await setHidden(page, CAT_IDS.family, true);
    await seed(page, EVS);
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-13"]').first().click({ position: { x: 12, y: 10 } });
    await expect(page.getByText('ふつう会議').first()).toBeVisible();
    const txt = await page.locator('body').innerText();
    expect(txt).toContain('リンクオン会議');
    for (const t of ['ひみつ会議', 'リンクオフ会議']) expect(txt).not.toContain(t);
  });
});
