// 第19版 PR8: 予定を長押しでつかんで別の日へ落とす（design/21 §1.3。データは js/move-day.js・D3）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, dbEvents, enableCalendars, monthFormInit } from './helpers.js';

const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const BASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null, alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, hasUrl: false, editable: true, reason: null, seriesStart: null };
const mk = (o) => ({ ...BASE, id: `${o.eventId}@${o.start}`, itemId: `it-${o.eventId}`, externalId: `ex-${o.eventId}`, ...o });
const DETAILS = [
  mk({ eventId: 'h1', title: '祝日の予定', calendarId: 'cal-2', start: '2026-11-12T13:00', end: '2026-11-12T14:00', allowsModify: false, sourceType: 'subscribed', editable: false, reason: 'readOnlyCalendar' }),
  mk({ eventId: 'e1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00' }),
];
const EVENTS = DETAILS.map(({ id, eventId, calendarId, title, start, end, all, place, notes, recurring, occurrenceDate, modifiedAt }) => ({ id, eventId, itemId: `it-${eventId}`, externalId: `ex-${eventId}`, calendarId, title, start, end, all, place, notes, recurring, occurrenceDate, modifiedAt, requestId: null }));
async function mock(page) {
  await page.addInitScript((c) => {
    const M = window.__mock = { calls: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: c.cals };
          case 'listEvents': return { events: c.events.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from) };
          case 'getEvent': { const d = c.details.find((x) => x.eventId === opts.eventId); if (!d) throw { code: 'NOT_FOUND' }; return JSON.parse(JSON.stringify(d)); }
          case 'notifyStatus': return { status: 'denied' };
          case 'notifySync': case 'notifyClear': return { scheduled: 0, removed: 0, skipped: 0 };
          case 'selectionHaptic': case 'impactHaptic': case 'notificationHaptic': return { performed: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, events: EVENTS, details: DETAILS });
}
const writes = (page) => page.evaluate(() => window.__mock.calls.filter((c) => !['checkPermission', 'requestPermission', 'listCalendars', 'listEvents', 'getEvent', 'notifyStatus', 'notifySync', 'notifyClear', 'selectionHaptic', 'impactHaptic', 'notificationHaptic', 'reminderPermission', 'getPosture', 'setAccessoryBarVisible'].includes(c.method)).map((c) => c.method));

const SEED = [
  ev('d1', '撮影', '2026-11-12T10:00', '2026-11-12T11:00'),
  ev('d2', '出張', '2026-11-11T00:00', '2026-11-13T23:59', { all: true }),
  ev('d3', '定例', '2026-11-12T09:00', '2026-11-12T09:30', { recurrence: { freq: 'weekly', interval: 1, byDay: [4] } }),
];
const dayBtn = (page, k) => page.locator(`.week .day[data-date="${k}"]`).first();
const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function grab(page, from, to, { hold = 420, release = true } = {}) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.waitForTimeout(hold);
  if (to) await page.mouse.move(to.x, to.y, { steps: 8 });
  if (release) await page.mouse.up();
}
async function boot(page, size, { ext = false } = {}) {
  if (ext) await mock(page);
  await openApp(page, size);
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...o, style: 'named' })); });
  await seed(page, SEED);
  if (ext) await enableCalendars(page);
}
const byId = async (page, id) => (await dbEvents(page)).find((e) => e.id === id);
const tlev = (page, text) => page.locator('.tlev:not(.fev)', { hasText: text }).first();

test.describe('開いた横（月＋その日）', () => {
  test.beforeEach(async ({ page }) => { await boot(page, SIZES.openLandscape951); });

  test('短い押下（350ms 未満）ではつかまず、動かすと日は変わらない', async ({ page }) => {
    const src = await center(tlev(page, '撮影')), dst = await center(dayBtn(page, '2026-11-20'));
    await page.mouse.move(src.x, src.y); await page.mouse.down(); await page.waitForTimeout(250);
    await expect(page.locator('.gchip')).toHaveCount(0);
    await page.mouse.move(dst.x, dst.y, { steps: 4 }); await expect(page.locator('.gchip')).toHaveCount(0);
    await page.mouse.up();
    expect((await byId(page, 'd1')).start).toBe('2026-11-12T10:00');
  });

  test('長押し 0.35 秒でつかむ。落とすと日だけ変わり時刻は同じ', async ({ page }) => {
    const src = await center(tlev(page, '撮影')), dst = await center(dayBtn(page, '2026-11-20'));
    await grab(page, src, dst, { release: false });
    await expect(page.locator('.gchip')).toHaveCount(1);
    await expect(page.locator('.tlev.grabbed')).toHaveCount(1);
    await expect(dayBtn(page, '2026-11-20')).toHaveClass(/mdrop/);
    await page.mouse.up();
    await expect.poll(async () => (await byId(page, 'd1')).start).toBe('2026-11-20T10:00');
    expect((await byId(page, 'd1')).end).toBe('2026-11-20T11:00');
    await expect(page.locator('.gchip')).toHaveCount(0);
  });

  test('複数日（終日）は長さを保つ。元に戻すで元の日へ。6 秒を過ぎると戻せない', async ({ page }) => {
    const src = await center(page.locator('.adpill', { hasText: '出張' }).first()), dst = await center(dayBtn(page, '2026-11-23'));
    await grab(page, src, dst);
    await expect.poll(async () => (await byId(page, 'd2')).start).toBe('2026-11-22T00:00');
    expect((await byId(page, 'd2')).end).toBe('2026-11-24T23:59');
    const undo = page.locator('#native-toast button', { hasText: '元に戻す' });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect.poll(async () => (await byId(page, 'd2')).start).toBe('2026-11-11T00:00');
    expect((await byId(page, 'd2')).end).toBe('2026-11-13T23:59');
    // 6 秒
    const s2 = await center(page.locator('.adpill', { hasText: '出張' }).first());
    await grab(page, s2, await center(dayBtn(page, '2026-11-23')));
    await expect.poll(async () => (await byId(page, 'd2')).start).toBe('2026-11-22T00:00');
    await page.waitForTimeout(6300);
    await expect(page.locator('#native-toast')).toHaveCount(0);
    expect((await byId(page, 'd2')).start).toBe('2026-11-22T00:00');
  });

  test('繰り返しはその回だけ（親の日は変わらず、その回の上書きができる）', async ({ page }) => {
    const src = await center(tlev(page, '定例')), dst = await center(dayBtn(page, '2026-11-20'));
    await grab(page, src, dst);
    await expect.poll(async () => Object.keys((await byId(page, 'd3')).overrides).length).toBe(1);
    const p = await byId(page, 'd3');
    expect(p.start).toBe('2026-11-12T09:00');
    expect(Object.values(p.overrides)[0].start).toBe('2026-11-20T09:00');
    await page.locator('#native-toast button', { hasText: '元に戻す' }).click();
    await expect.poll(async () => Object.values((await byId(page, 'd3')).overrides)[0]?.start).toBe('2026-11-12T09:00');
  });

  test('時間軸の中で上下に引くと 15 分刻みで時刻が動き、月の日へ落とすとその時刻で移る', async ({ page }) => {
    const b = await tlev(page, '撮影').boundingBox(), hh = await page.locator('.tl[data-pane="right"]').first().evaluate((t) => parseFloat(getComputedStyle(t).getPropertyValue('--hh')));
    const dst = await center(dayBtn(page, '2026-11-20'));
    await page.mouse.move(b.x + b.width / 2, b.y + 6); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(b.x + b.width / 2, b.y + 6 + hh / 2, { steps: 6 }); // 30 分下
    await expect(page.locator('.gchip')).toContainText('10:30〜11:30');
    await page.mouse.move(dst.x, b.y + 6 + hh / 2, { steps: 8 });
    await page.mouse.move(dst.x, dst.y, { steps: 4 }); await page.mouse.up();
    await expect.poll(async () => (await byId(page, 'd1')).start).toBe('2026-11-20T10:30');
    expect((await byId(page, 'd1')).end).toBe('2026-11-20T11:30');
  });

  test('月でない所で離したら取りやめ（変わらない）', async ({ page }) => {
    const src = await center(tlev(page, '撮影'));
    await grab(page, src, { x: src.x, y: src.y + 20 });
    await page.waitForTimeout(300);
    expect((await byId(page, 'd1')).start).toBe('2026-11-12T10:00');
    await expect(page.locator('.tlev.grabbed')).toHaveCount(0);
    await expect(page.locator('#native-toast')).toHaveCount(0);
  });

  test('月のチップの長押しは今のメニューのまま', async ({ page }) => {
    const chip = page.locator('.week [data-event]', { hasText: '撮影' }).first();
    await grab(page, await center(chip), null, { hold: 420 });
    await expect(page.locator('.cmenu')).toBeVisible();
    await expect(page.locator('.gchip')).toHaveCount(0);
  });
});

test.describe('iPhone の予定', () => {
  test('読み取り専用の予定はつかめず書き込み 0。書ける予定は start/end だけを送る', async ({ page }) => {
    await boot(page, SIZES.openLandscape951, { ext: true });
    const ro = tlev(page, '祝日の予定'), dst = await center(dayBtn(page, '2026-11-20'));
    await expect(ro).toBeVisible();
    await grab(page, await center(ro), dst, { release: false });
    await expect(page.locator('.gchip')).toHaveCount(0);
    await page.mouse.up();
    expect(await writes(page)).toEqual([]);
    const ok = tlev(page, '歯医者');
    // 書ける予定は updateExternalEvent（偽装は UNAVAILABLE を返すので失敗の通知が出る）。送った引数を見る
    await grab(page, await center(ok), dst);
    await expect.poll(async () => (await writes(page)).length).toBe(1);
    const a = await page.evaluate(() => window.__mock.calls.find((c) => c.method === 'updateExternalEvent').opts);
    expect(a.start).toBe('2026-11-20T15:00'); expect(a.end).toBe('2026-11-20T16:00');
    expect(a.title).toBeUndefined(); expect(a.notes).toBeUndefined();
  });
});

test.describe('開いた縦（月タブ）', () => {
  test('下の面の予定を上の月の日へ落とせる', async ({ page }) => {
    // 月を引く画面の日の部分は「予定」（.mdlist）で見る（helpers の openApp は既定で時間軸にするため）
    await monthFormInit(page);
    await boot(page, SIZES.openPortrait669);
    const row = page.locator('.mdev, .tlev:not(.fev)', { hasText: '撮影' }).first();
    await expect(row).toBeVisible();
    await grab(page, await center(row), await center(dayBtn(page, '2026-11-20')));
    await expect.poll(async () => (await byId(page, 'd1')).start).toBe('2026-11-20T10:00');
  });
});

test.describe('開いた縦（月タブ・日の部分が時間軸）', () => {
  // 第19.1版 S2（R-49）: 日の部分が「時間軸」でも、下の面の .tlev を長押しで上の月の日へ落とせる。
  test('時間軸の枠を長押しで引き、上の月の日へ落とすと日だけ変わり時刻は同じ', async ({ page }) => {
    await boot(page, SIZES.openPortrait669);
    await expect(page.locator('.mday .tlev:not(.fev)', { hasText: '撮影' })).toHaveCount(1);
    const row = tlev(page, '撮影');
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' })); // 時間軸は 0:00 から。下の面を送って枠を見える所へ
    await expect(row).toBeVisible();
    const src = await center(row);
    expect(src.y).toBeGreaterThan(492); // 下の面
    await grab(page, src, await center(dayBtn(page, '2026-11-20')), { release: false });
    await expect(page.locator('.gchip')).toHaveCount(1);
    await expect(dayBtn(page, '2026-11-20')).toHaveClass(/mdrop/);
    await page.mouse.up();
    await expect.poll(async () => (await byId(page, 'd1')).start).toBe('2026-11-20T10:00');
    expect((await byId(page, 'd1')).end).toBe('2026-11-20T11:00');
  });

  test('時間軸からの落とし：繰り返しはその回だけ（例外）', async ({ page }) => {
    await boot(page, SIZES.openPortrait669);
    const row = tlev(page, '定例');
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(row).toBeVisible();
    await grab(page, await center(row), await center(dayBtn(page, '2026-11-20')));
    await expect.poll(async () => (await byId(page, 'd3')).overrides ? Object.keys((await byId(page, 'd3')).overrides).length : 0).toBeGreaterThan(0);
    const d3 = await byId(page, 'd3');
    expect(d3.start).toBe('2026-11-12T09:00'); // 親の予定は動かない
    expect(d3.recurrence).toBeTruthy();
  });
});

test.describe('つかめない画面', () => {
  test('閉じた画面では予定を長押ししてもつかまない', async ({ page }) => {
    await boot(page, SIZES.closedPortrait);
    const el = page.locator('.mdev, .tlev, .agrow, .hrow', { hasText: '撮影' }).first();
    if (await el.count()) await grab(page, await center(el), { x: 200, y: 100 });
    await expect(page.locator('.gchip')).toHaveCount(0);
    expect((await byId(page, 'd1')).start).toBe('2026-11-12T10:00');
  });
});
