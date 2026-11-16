// 第13版 PR4: iPhone の予定（ext）の編集・削除の画面。window.Capacitor を偽装して JS 側の動きを検査する。
// 偽装は Swift の実動作の証明ではない（契約は design/IMPL_PLAN_V13.md PR1〜PR3）。
import { test, expect } from '@playwright/test';
import { openApp, tab, dbEvents, pickDest } from './helpers.js';

const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-3', title: '仕事', color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const BASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null,
  alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, hasUrl: false, editable: true, reason: null, seriesStart: null };
const mk = (o) => ({ ...BASE, id: `${o.eventId}@${o.start}`, itemId: `it-${o.eventId}`, externalId: `ex-${o.eventId}`, ...o });
const DETAILS = [
  mk({ eventId: 'e1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00', place: '渋谷', notes: '保険証', alarms: [{ before: 30 }], seriesStart: '2026-11-12T15:00' }),
  mk({ eventId: 'w1', title: '定例', start: '2026-11-12T09:00', end: '2026-11-12T10:00', recurring: true, occurrenceDate: '2026-11-12T09:00', rule: { freq: 'weekly', byDay: [4], count: 10 }, ruleText: '毎週', alarms: [{ before: 10 }, { before: 20 }], alarmsExtra: 1, seriesStart: '2026-11-05T09:00' }),
  mk({ eventId: 'd1', title: '個別の回', start: '2026-11-12T17:00', end: '2026-11-12T18:00', recurring: true, detached: true, occurrenceDate: '2026-11-12T16:00', rule: { freq: 'weekly', byDay: [4], count: 10 }, ruleText: '毎週', seriesStart: '2026-11-05T16:00' }),
  mk({ eventId: 'x1', title: '特別な通知', start: '2026-11-12T18:30', end: '2026-11-12T19:00', alarms: [{ before: 10 }], alarmsExtra: 2, seriesStart: '2026-11-12T18:30' }),
  mk({ eventId: 'm1', title: '会議', start: '2026-11-12T11:00', end: '2026-11-12T12:00', hasAttendees: true, isOrganizer: true, editable: false, reason: 'organizerWithAttendees' }),
  mk({ eventId: 'i1', title: '招待', start: '2026-11-12T12:00', end: '2026-11-12T13:00', hasAttendees: true, isOrganizer: false, editable: false, reason: 'invitee' }),
  mk({ eventId: 'b1', title: '誕生日', calendarId: 'cal-2', all: true, start: '2026-11-12T00:00', end: '2026-11-12T00:00', allowsModify: false, sourceType: 'birthdays', editable: false, reason: 'birthdays' }),
  mk({ eventId: 'h1', title: '祝日の予定', calendarId: 'cal-2', all: true, start: '2026-11-12T00:00', end: '2026-11-12T00:00', allowsModify: false, sourceType: 'subscribed', editable: false, reason: 'readOnlyCalendar' }),
];
const EVENTS = DETAILS.map(({ id, eventId, calendarId, title, start, end, all, place, notes, recurring, occurrenceDate, modifiedAt }) => ({ id, eventId, itemId: `it-${eventId}`, externalId: `ex-${eventId}`, calendarId, title, start, end, all, place, notes, recurring, occurrenceDate, modifiedAt, requestId: null }));

async function mock(page, cfg = {}) {
  await page.addInitScript((c) => {
    const M = window.__mock = { calls: [], delays: {}, ...c.m };
    const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { (M.listeners ||= {})[o.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: clone(opts) });
        switch (method) {
          case 'checkPermission': return { status: 'granted' };
          case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: c.cals };
          case 'listEvents': return { events: (M.events || c.events).filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from) };
          case 'getEvent': {
            const d = c.details.find((x) => x.eventId === opts.eventId && (x.occurrenceDate ?? x.start) === opts.occurrenceStart);
            if (M.delays[opts.eventId]) await wait(M.delays[opts.eventId]);
            if (M.getErr) throw { code: M.getErr, message: 'x' };
            if (!d) throw { code: 'NOT_FOUND', message: 'x' };
            return clone(d);
          }
          case 'updateExternalEvent': {
            if (M.updDelay) await wait(M.updDelay);
            if (M.updErrOnce) { const e = M.updErrOnce; M.updErrOnce = null; throw { code: e, reason: M.updReason, message: 'x' }; }
            if (M.updErr) throw { code: M.updErr, reason: M.updReason, message: 'x' };
            return { itemId: M.newItem ?? opts.itemId, externalId: opts.externalId, eventId: opts.eventId, modifiedAt: 1763100002000, calendarId: opts.calendarId ?? 'cal-1', occurrenceDate: opts.occurrenceStart, conflicted: !!M.conflicted, alarmsApplied: Math.min((opts.alarms ?? []).length, M.alarmCap ?? 2) };
          }
          case 'deleteExternalEvent': {
            if (M.delDelay) await wait(M.delDelay);
            if (M.delErr) throw { code: M.delErr, message: 'x' };
            if (M.delConflict && !opts.force) throw { code: 'CONFLICT', message: 'x' };
            if (M.removeOnDelete) M.events = (M.events || c.events).filter((e) => e.eventId !== opts.eventId);
            return M.missing ? { deleted: true, missing: true } : { deleted: true };
          }
          case 'openInCalendar': return { opened: true };
          case 'notifyStatus': return { status: 'denied' };
          case 'notifySync': case 'notifyClear': return { scheduled: 0, removed: 0, skipped: 0 };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, events: EVENTS, details: DETAILS, m: cfg });
}
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => c.method === m), m);
async function setup(page, cfg) {
  await mock(page, cfg);
  await openApp(page);
  await page.locator('[data-act="menu"]:visible').first().click();
  await page.locator('[data-m="link"]').click();
  await page.locator('#lk-sw').click();
  await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#lk-close').click();
  await tab(page, '日').click();
}
const pop = (page, name) => page.locator('.tlev.ext, .adpill.ext', { hasText: name }).first().click(); // 終日は終日段のピル
const XD = (page) => page.locator('#xdetail');
async function edit(page, name) {
  await pop(page, name);
  await expect(XD(page).locator('#xd-edit')).toBeVisible();
  await XD(page).locator('#xd-edit').click();
  await expect(page.locator('#editor')).toBeVisible();
}
const toastText = (page) => page.locator('#native-toast');

test.describe('ポップアップ（09 §1）', () => {
  test('書けるとき: 削除・編集と小さい「カレンダーで開く」。理由の行は出ない', async ({ page }) => {
    await setup(page);
    await pop(page, '歯医者');
    const d = XD(page);
    await expect(d.locator('#xd-edit')).toBeVisible();
    await expect(d.locator('#xd-del')).toBeVisible();
    await expect(d.locator('#xd-open')).toHaveClass(/small/);
    await expect(d.locator('#xd-note')).toBeHidden();
    const [bd, be] = await Promise.all([d.locator('#xd-del').boundingBox(), d.locator('#xd-edit').boundingBox()]);
    expect(bd.height).toBeGreaterThanOrEqual(44);
    expect(be.height).toBeGreaterThanOrEqual(44);
    expect(Math.round(be.x - (bd.x + bd.width))).toBe(8);
    const g = await calls(page, 'getEvent');
    expect(g.at(-1).opts).toMatchObject({ eventId: 'e1', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00' });
  });

  for (const [name, text] of [
    ['会議', '出席者のいる予定は、iPhone のカレンダーで変更してください。'],
    ['招待', '招待された予定のため、Duo では変更できません。'],
    ['誕生日', '誕生日は「連絡先」から変更してください。'],
    ['祝日の予定', 'このカレンダーは読み取り専用のため、Duo では変更できません。'],
  ]) {
    test(`書けない（${name}）: 理由と大きい「カレンダーで開く」だけ`, async ({ page }) => {
      await setup(page);
      await pop(page, name);
      const d = XD(page);
      await expect(d.locator('#xd-note')).toHaveText(text);
      await expect(d.locator('#xd-edit')).toBeHidden();
      await expect(d.locator('#xd-del')).toBeHidden();
      await expect(d.locator('#xd-open')).toBeVisible();
      await expect(d.locator('#xd-open')).not.toHaveClass(/small/);
    });
  }

  test('取得中・失敗は編集・削除を出さない。遅い応答は別の予定・閉じたシートに適用しない', async ({ page }) => {
    await setup(page, { delays: { e1: 700 } });
    await pop(page, '歯医者');
    await expect(XD(page).locator('#xd-edit')).toBeHidden();
    await expect(XD(page).locator('#xd-del')).toBeHidden();
    await XD(page).locator('#xd-close').click();
    await expect(XD(page)).toBeHidden();
    await pop(page, '祝日の予定');
    await expect(XD(page).locator('#xd-note')).toHaveText(/読み取り専用/);
    await page.waitForTimeout(1000);
    await expect(XD(page).locator('#xd-edit')).toBeHidden();
    await expect(XD(page)).toContainText('祝日の予定');
    await XD(page).locator('#xd-close').click();
    // 失敗
    await page.evaluate(() => { window.__mock.delays = {}; window.__mock.getErr = 'UNAVAILABLE'; });
    await pop(page, '歯医者');
    await expect(XD(page).locator('#xd-open')).toBeVisible();
    await page.waitForTimeout(200);
    await expect(XD(page).locator('#xd-edit')).toBeHidden();
    await expect(XD(page).locator('#xd-del')).toBeHidden();
  });
});

test.describe('編集（09 §2）', () => {
  test('単発: カレンダー選択・札・案内。変えた項目だけ送り、静かに閉じて再読込。Duo の保存領域は不変', async ({ page }) => {
    await setup(page);
    await edit(page, '歯医者');
    await expect(page.locator('#edtitle')).toHaveText('予定を編集');
    await expect(page.locator('#ed-tag')).toContainText('iPhone · 家族');
    await expect(page.locator('#cat-l')).toHaveCount(0); // 旧カテゴリ行・旧カレンダー選択は残さない
    await expect(page.locator('#f-ecal')).toHaveCount(0);
    await expect(page.locator('#f-dest')).toBeVisible();
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop h4')).toHaveText(['iPhone ・ Google', 'iPhone ・ iCloud']); // Duo のカテゴリへは移せない
    await expect(page.locator('#dest-pop .dopt[data-dtype="duo"]')).toHaveCount(0);
    await page.locator('#dest-pop .dopt[aria-selected="true"]').click();
    await expect(page.locator('#rfix')).toBeHidden();
    await expect(page.locator('#rtoggle')).toBeHidden();
    await expect(page.locator('#xext')).toContainText('変更は iPhone のカレンダーに保存されます。');
    await expect(page.locator('#al-ilink')).toBeVisible();
    await expect(page.locator('#delete')).toBeHidden();
    await expect(page.locator('#f-title')).toHaveValue('歯医者');
    expect(await page.evaluate(() => sessionStorage.getItem('duo.draft.v1'))).toBeNull(); // 本文を下書きにしない
    await page.locator('#f-title').fill('歯医者（定期）');
    expect(await page.evaluate(() => sessionStorage.getItem('duo.draft.v1'))).toBeNull();
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    const u = await calls(page, 'updateExternalEvent');
    expect(u).toHaveLength(1);
    expect(u[0].opts).toEqual({ itemId: 'it-e1', externalId: 'ex-e1', eventId: 'e1', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00', span: 'this', expectModified: 1763100000000, title: '歯医者（定期）', calendarId: 'cal-3' });
    await expect(toastText(page)).toHaveCount(0);
    expect((await calls(page, 'listEvents')).length).toBeGreaterThan(1); // 保存後に再読込
    expect(await dbEvents(page)).toEqual([]);
    expect(await page.evaluate(async () => (await (await import('/js/db.js')).loadOutbox?.()) ?? [])).toEqual([]);
  });

  test('日時の変更は start/end/all を送る。変更なしなら呼ばずに閉じる', async ({ page }) => {
    await setup(page);
    await edit(page, '歯医者');
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    expect(await calls(page, 'updateExternalEvent')).toHaveLength(0);
    await pop(page, '歯医者');
    await XD(page).locator('#xd-edit').click();
    await page.locator('#f-start').fill('2026/11/12 16:00');
    await page.locator('#f-end').fill('2026/11/12 17:30');
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    const o = (await calls(page, 'updateExternalEvent'))[0].opts;
    expect(o).toMatchObject({ span: 'this', start: '2026-11-12T16:00', end: '2026-11-12T17:30', all: false });
    expect(o).not.toHaveProperty('title');
    expect(o).not.toHaveProperty('recurrence');
  });

  test('繰り返し: 規則は表示だけ。範囲シート、カレンダー変更なら「すべて」のみ。他の範囲は calendarId を送らない', async ({ page }) => {
    await setup(page);
    await edit(page, '定例');
    await expect(page.locator('#rfix')).toBeVisible();
    await expect(page.locator('#rfix')).toContainText('繰り返し · 毎週 木／10回');
    await expect(page.locator('#rfix')).toContainText('繰り返しの変更は iPhone のカレンダーで行ってください。');
    await expect(page.locator('#rtoggle')).toBeHidden();
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#form [type=submit]').click();
    const sc = page.locator('#scope');
    await expect(sc).toBeVisible();
    await expect(sc.locator('[data-scope=only]')).toBeDisabled();
    await expect(sc.locator('[data-scope=following]')).toBeDisabled();
    await expect(sc.locator('[data-scope=all]')).toBeEnabled();
    await expect(page.locator('#sc-note')).toContainText('カレンダーの変更は『すべて』でのみできます。');
    await expect(page.locator('#sc-note')).toContainText('iPhone のカレンダーに保存されます。');
    await sc.locator('[data-scope=all]').click();
    await expect(page.locator('#editor')).toBeHidden();
    const o = (await calls(page, 'updateExternalEvent'))[0].opts;
    expect(o).toMatchObject({ span: 'all', calendarId: 'cal-3' });
    // この予定のみ（カレンダーは変えない）
    await pop(page, '定例');
    await XD(page).locator('#xd-edit').click();
    await page.locator('#f-place').fill('会議室');
    await page.locator('#form [type=submit]').click();
    await page.locator('#scope [data-scope=only]').click();
    await expect(page.locator('#editor')).toBeHidden();
    const o2 = (await calls(page, 'updateExternalEvent'))[1].opts;
    expect(o2).toMatchObject({ span: 'this', place: '会議室' });
    expect(o2).not.toHaveProperty('calendarId');
  });

  test('通知: iPhone の値のまま出し（20分も）、触らなければ送らない。他の件数の注意。触ると置き換えて送る', async ({ page }) => {
    await setup(page);
    await edit(page, '定例');
    await expect(page.locator('#f-al0')).toHaveValue('b10');
    await expect(page.locator('#f-al1')).toHaveValue('b20');
    await expect(page.locator('#al-extra')).toHaveText('iPhone で設定した通知が他に1件あります。ここで通知を変えると置き換わります。');
    await page.locator('#f-place').fill('x');
    await page.locator('#form [type=submit]').click();
    await page.locator('#scope [data-scope=only]').click();
    await expect(page.locator('#editor')).toBeHidden();
    expect((await calls(page, 'updateExternalEvent'))[0].opts).not.toHaveProperty('alarms');
    await pop(page, '定例');
    await XD(page).locator('#xd-edit').click();
    await page.locator('#f-al0').selectOption('b60');
    await page.locator('#form [type=submit]').click();
    await page.locator('#scope [data-scope=all]').click();
    await expect(page.locator('#editor')).toBeHidden();
    expect((await calls(page, 'updateExternalEvent'))[1].opts.alarms).toEqual([{ before: 60 }, { before: 20 }]);
  });

  test('結果の通知: 競合は上書きのお知らせ、通知2件→1件は専用文言（両方あれば順に）', async ({ page }) => {
    await setup(page, { conflicted: true });
    await edit(page, '歯医者');
    await page.locator('#f-title').fill('A');
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(toastText(page)).toHaveText('iPhone のカレンダー側でも変更されていたため、Duo の内容で上書きしました。');
    await page.evaluate(() => { window.__mock.conflicted = false; window.__mock.alarmCap = 1; });
    await page.waitForTimeout(4200);
    await pop(page, '歯医者');
    await XD(page).locator('#xd-edit').click();
    await page.locator('#f-al0').selectOption('b10');
    await page.locator('#f-al0').dispatchEvent('change');
    // 2件目を足す
    await expect(page.locator('#al1-row')).toBeVisible();
    await page.locator('#f-al1').selectOption('b60');
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(toastText(page)).toHaveText('このカレンダーでは通知は1つだけ保存されました。');
  });

  test('保存失敗: 入力を保持して再操作できる。UNAVAILABLE は案内、一般は4秒のお知らせ、NOT_EDITABLE は理由', async ({ page }) => {
    await setup(page, { updErr: 'UNAVAILABLE' });
    await edit(page, '歯医者');
    await page.locator('#f-title').fill('B');
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#error')).toHaveText('iPhone のカレンダーに保存できませんでした。カレンダーで開いて変更してください。');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-title')).toHaveValue('B');
    await expect(page.locator('#xext-open')).toBeVisible();
    await page.evaluate(() => { window.__mock.updErr = 'BOOM'; });
    await page.locator('#form [type=submit]').click();
    await expect(toastText(page)).toHaveText('iPhone のカレンダーに保存できませんでした。もう一度お試しください。');
    await expect(page.locator('#editor')).toBeVisible();
    await page.evaluate(() => { window.__mock.updErr = 'NOT_EDITABLE'; window.__mock.updReason = 'invitee'; });
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#error')).toHaveText('招待された予定のため、Duo では変更できません。');
    await page.evaluate(() => { window.__mock.updErr = null; });
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    expect(await calls(page, 'updateExternalEvent')).toHaveLength(4);
    expect(await dbEvents(page)).toEqual([]);
    // 通知の予約・バックアップには iPhone の予定を入れない
    const sync = await calls(page, 'notifySync');
    expect(JSON.stringify(sync)).not.toContain('ip:');
    expect(await page.evaluate(async () => JSON.stringify(await (await import('/js/db.js')).listEvents()))).toBe('[]');
  });

  test('保存時に iPhone 側で削除されていた: 確認は「閉じる」だけ。押すまで編集シートは残り、押すと両方閉じる', async ({ page }) => {
    await setup(page, { updErr: 'NOT_FOUND' });
    await edit(page, '歯医者');
    await page.locator('#f-title').fill('C');
    await page.locator('#form [type=submit]').click();
    const c = page.locator('#confirm');
    await expect(c).toBeVisible();
    await expect(page.locator('#confirmtitle')).toHaveText('この予定は iPhone のカレンダーで削除されています');
    await expect(page.locator('#deletetitle')).toHaveText('');
    await expect(page.locator('#canceldelete')).toBeHidden();
    await expect(page.locator('#dodelete')).toHaveText('閉じる');
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#dodelete').click();
    await expect(c).toBeHidden();
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('二重送信しない（保存中のボタン連打・外タップ）', async ({ page }) => {
    await setup(page, { updDelay: 500 });
    await edit(page, '歯医者');
    await page.locator('#f-title').fill('D');
    const b = page.locator('#form [type=submit]');
    await b.click();
    await b.click({ force: true }).catch(() => {});
    await page.keyboard.press('Enter');
    await expect(page.locator('#editor')).toBeHidden();
    expect(await calls(page, 'updateExternalEvent')).toHaveLength(1);
  });

  test('未保存の判定にカレンダーの変更を含む。外タップは破棄確認、取り消せば入力は残る', async ({ page }) => {
    await setup(page);
    await edit(page, '歯医者');
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#discard')).toBeVisible();
    await page.locator('#dc-keep').click();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#dest-name')).toHaveText(/仕事/);
    await pickDest(page, 'iphone', 'cal-1');
    await page.waitForTimeout(500); // 幕のタップ直後の click 抑止（400ms）が切れてから
    await page.locator('#scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#editor')).toBeHidden(); // 元に戻せば確認なし
    expect(await calls(page, 'updateExternalEvent')).toHaveLength(0);
  });

  test('編集中に iPhone 側で開始だけ変わっても注意帯は出ない（itemId で判定）。削除されたときだけ出る', async ({ page }) => {
    await setup(page);
    await edit(page, '歯医者');
    await page.locator('#f-title').fill('E');
    const n0 = (await calls(page, 'listEvents')).length;
    await page.evaluate((evs) => {
      window.__mock.events = evs.map((e) => (e.eventId === 'e1' ? { ...e, id: `${e.eventId}@2026-11-12T16:00`, start: '2026-11-12T16:00', end: '2026-11-12T17:00', occurrenceDate: null } : e));
      window.__mock.listeners.calendarChanged({});
    }, EVENTS);
    await expect.poll(async () => (await calls(page, 'listEvents')).length).toBeGreaterThan(n0);
    await page.waitForTimeout(600);
    await expect(page.locator('#ext-gone')).toBeHidden();
    await page.evaluate((evs) => { window.__mock.events = evs.filter((e) => e.eventId !== 'e1'); window.__mock.listeners.calendarChanged({}); }, EVENTS);
    await expect(page.locator('#ext-gone')).toBeVisible();
  });

  test('通知の行を触らず終日に切り替えて保存しても alarms は送らない。行を変えたときは送る', async ({ page }) => {
    await setup(page);
    await edit(page, '特別な通知');
    await page.locator('#f-all').check();
    await page.locator('#form [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    let u = await calls(page, 'updateExternalEvent');
    expect(u).toHaveLength(1);
    expect(u[0].opts.all).toBe(true);
    expect(u[0].opts).not.toHaveProperty('alarms');
  });

  test('個別に変えた回から「すべて」を選ぶと span=all で送る（契約）', async ({ page }) => {
    await setup(page);
    await edit(page, '個別の回');
    await page.locator('#f-title').fill('全部');
    await page.locator('#form [type=submit]').click();
    await page.locator('#scope [data-scope=all]').click();
    await expect(page.locator('#editor')).toBeHidden();
    const u = await calls(page, 'updateExternalEvent');
    expect(u[0].opts).toMatchObject({ span: 'all', eventId: 'd1', itemId: 'it-d1', occurrenceStart: '2026-11-12T16:00', currentStart: '2026-11-12T17:00' });
  });

  test('開いている間に対象が消えたら注意帯。入力・基準値は変わらず、保存は押せて元の値で送る', async ({ page }) => {
    await setup(page);
    await edit(page, '歯医者');
    await page.locator('#f-title').fill('E');
    await expect(page.locator('#ext-gone')).toBeHidden();
    // 外部で削除された（calendarChanged → 再読込）
    await page.evaluate(() => { window.__mock.events = []; window.__mock.listeners.calendarChanged({}); });
    await expect(page.locator('#ext-gone')).toBeVisible();
    await expect(page.locator('#ext-gone')).toHaveText('この予定は見つかりません。カレンダーで確認してください。');
    await expect(page.locator('#f-title')).toHaveValue('E');
    await expect(page.locator('#form [type=submit]')).toBeEnabled();
    await page.locator('#form [type=submit]').click();
    const u = await calls(page, 'updateExternalEvent');
    expect(u).toHaveLength(1);
    expect(u[0].opts).toMatchObject({ expectModified: 1763100000000, title: 'E' });
  });
});

test.describe('削除（09 §3）', () => {
  test('単発: 確認文「から」・キャンセルは呼ばない・削除で閉じて再読込、成功トーストなし', async ({ page }) => {
    await setup(page, { removeOnDelete: true });
    await pop(page, '歯医者');
    await XD(page).locator('#xd-del').click();
    await expect(page.locator('#confirmtitle')).toHaveText('この予定を削除しますか？');
    await expect(page.locator('#deletetitle')).toHaveText('歯医者\niPhone のカレンダーから削除されます。');
    await expect(page.locator('#canceldelete')).toBeFocused();
    await expect(page.locator('#dodelete')).toHaveText('削除する');
    await page.locator('#canceldelete').click();
    expect(await calls(page, 'deleteExternalEvent')).toHaveLength(0);
    await expect(XD(page)).toBeVisible();
    await XD(page).locator('#xd-del').click();
    await page.locator('#dodelete').click();
    await expect(XD(page)).toBeHidden();
    const d = await calls(page, 'deleteExternalEvent');
    expect(d).toHaveLength(1);
    expect(d[0].opts).toEqual({ itemId: 'it-e1', externalId: 'ex-e1', eventId: 'e1', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00', span: 'this', expectModified: 1763100000000 });
    await expect(toastText(page)).toHaveCount(0);
    await expect(page.locator('.tlev.ext, .adpill.ext', { hasText: '歯医者' })).toHaveCount(0);
    expect(await dbEvents(page)).toEqual([]);
  });

  test('繰り返し: 範囲シート。この予定のみ・これ以降すべては直実行、すべては2段目（キャンセルが初期フォーカス）', async ({ page }) => {
    await setup(page);
    await pop(page, '定例');
    await XD(page).locator('#xd-del').click();
    const sc = page.locator('#scope');
    await expect(page.locator('#sc-title')).toHaveText('削除する範囲');
    await expect(page.locator('#sc-warn')).toHaveText('定例\niPhone のカレンダーから削除されます。');
    await sc.locator('[data-scope=following]').click();
    await expect(XD(page)).toBeHidden();
    // 先頭の回は all 扱いにならない: seriesStart は 11-05、開いた回は 11-12 なので future
    expect((await calls(page, 'deleteExternalEvent'))[0].opts).toMatchObject({ span: 'future', occurrenceStart: '2026-11-12T09:00' });
    await pop(page, '定例');
    await XD(page).locator('#xd-del').click();
    await sc.locator('[data-scope=only]').click();
    expect((await calls(page, 'deleteExternalEvent'))[1].opts.span).toBe('this');
    await pop(page, '定例');
    await XD(page).locator('#xd-del').click();
    await sc.locator('[data-scope=all]').click();
    await expect(page.locator('#confirmtitle')).toHaveText('すべての繰り返しを削除しますか？');
    await expect(page.locator('#deletetitle')).toHaveText('iPhone のカレンダーから削除されます。');
    await expect(page.locator('#dodelete')).toHaveText('すべて削除');
    await expect(page.locator('#canceldelete')).toBeFocused();
    expect(await calls(page, 'deleteExternalEvent')).toHaveLength(2);
    await page.locator('#canceldelete').click();
    await expect(sc).toBeVisible(); // 範囲へ戻る
    await sc.locator('[data-scope=all]').click();
    await page.locator('#dodelete').click();
    await expect(XD(page)).toBeHidden();
    expect((await calls(page, 'deleteExternalEvent'))[2].opts.span).toBe('all');
  });

  test('iPhone 側で変わっていたら再確認。キャンセルは force なし、承認のみ同じ対象で force:true', async ({ page }) => {
    await setup(page, { delConflict: true });
    await pop(page, '歯医者');
    await XD(page).locator('#xd-del').click();
    await page.locator('#dodelete').click();
    await expect(page.locator('#confirmtitle')).toHaveText('iPhone のカレンダーで内容が変わっています');
    await expect(page.locator('#deletetitle')).toHaveText('それでも削除しますか？');
    await expect(page.locator('#canceldelete')).toBeFocused();
    await page.locator('#canceldelete').click();
    await expect(XD(page)).toBeVisible();
    let d = await calls(page, 'deleteExternalEvent');
    expect(d).toHaveLength(1);
    expect(d[0].opts).not.toHaveProperty('force');
    await XD(page).locator('#xd-del').click();
    await page.locator('#dodelete').click();
    await expect(page.locator('#confirmtitle')).toHaveText('iPhone のカレンダーで内容が変わっています');
    await page.locator('#dodelete').click();
    await expect(XD(page)).toBeHidden();
    d = await calls(page, 'deleteExternalEvent');
    expect(d.at(-1).opts).toMatchObject({ force: true, span: 'this', eventId: 'e1', expectModified: 1763100000000 });
  });

  test('すでに消えていた: 閉じて4秒のお知らせ。失敗は削除の失敗文言で入力は残る', async ({ page }) => {
    await setup(page, { missing: true });
    await pop(page, '歯医者');
    await XD(page).locator('#xd-del').click();
    await page.locator('#dodelete').click();
    await expect(XD(page)).toBeHidden();
    await expect(toastText(page)).toHaveText('この予定はすでに iPhone のカレンダーから削除されていました。');
    await page.evaluate(() => { window.__mock.missing = false; window.__mock.delErr = 'UNAVAILABLE'; });
    await page.waitForTimeout(4200);
    await pop(page, '歯医者');
    await XD(page).locator('#xd-del').click();
    await page.locator('#dodelete').click();
    await expect(toastText(page)).toHaveText('iPhone のカレンダーから削除できませんでした。');
    await expect(XD(page)).toBeVisible();
    await expect(XD(page).locator('#xd-del')).toBeEnabled();
  });
});
