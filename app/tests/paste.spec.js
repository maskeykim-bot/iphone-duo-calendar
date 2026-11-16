// 第14版 PR33: コピー開始と貼る日の選択画面。確定（実行）は PR34 なので、ここでは選択・キャンセル・DB/native0 を確かめる。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, dbEvents, tab, OPEN_SIZES } from './helpers.js';

const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const BASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null, alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, hasUrl: false, editable: true, reason: null, seriesStart: null };
const mk = (o) => ({ ...BASE, id: `${o.eventId}@${o.start}`, itemId: `it-${o.eventId}`, externalId: `ex-${o.eventId}`, ...o });
const DETAILS = [
  mk({ eventId: 'e1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00', alarms: [{ before: 30 }] }),
  mk({ eventId: 'h1', title: '祝日の予定', calendarId: 'cal-2', all: true, start: '2026-11-13T00:00', end: '2026-11-13T00:00', allowsModify: false, sourceType: 'subscribed', editable: false, reason: 'readOnlyCalendar' }),
  mk({ eventId: 'i1', title: '招待会議', start: '2026-11-14T12:00', end: '2026-11-14T13:00', hasAttendees: true, editable: false, reason: 'invitee' }),
];
const EVENTS = DETAILS.map(({ id, eventId, calendarId, title, start, end, all, place, notes, recurring, occurrenceDate, modifiedAt }) => ({ id, eventId, itemId: `it-${eventId}`, externalId: `ex-${eventId}`, calendarId, title, start, end, all, place, notes, recurring, occurrenceDate, modifiedAt, requestId: null }));

async function mock(page) {
  await page.addInitScript((c) => {
    const M = window.__mock = { calls: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: c.cals };
          case 'listEvents': return { events: c.events.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from) };
          case 'getEvent': { const d = c.details.find((x) => x.eventId === opts.eventId); if (!d) throw { code: 'NOT_FOUND' }; return JSON.parse(JSON.stringify(d)); }
          case 'notifyStatus': return { status: 'denied' };
          case 'notifySync': case 'notifyClear': return { scheduled: 0, removed: 0, skipped: 0 };
          case 'selectionHaptic': return { performed: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, events: EVENTS, details: DETAILS });
}
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => c.method === m), m);
const writes = (page) => page.evaluate(() => window.__mock.calls.filter((c) => !['checkPermission', 'requestPermission', 'listCalendars', 'listEvents', 'getEvent', 'notifyStatus', 'notifySync', 'notifyClear', 'selectionHaptic', 'reminderPermission'].includes(c.method)).map((c) => c.method));
const SEED = [
  ev('d1', '撮影', '2026-11-12T10:00', '2026-11-12T11:00', { alarms: [{ before: 10 }] }),
  ev('d2', '出張', '2026-11-16T00:00', '2026-11-18T23:59', { all: true }),
];
async function longPress(page, loc, ms = 420) {
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}
const chip = (page, text) => page.locator('.week [data-event]', { hasText: text }).first();
const dayBtn = (page, k) => page.locator(`.week .day[data-date="${k}"]`).first();
const band = (page) => page.locator('.pband');
const count = (page) => page.locator('.day.psel').count();

async function boot(page, size = SIZES.openPortrait669, { ext = false, query = '?paste=1' } = {}) {
  if (ext) await mock(page);
  await openApp(page, size, query);
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...o, style: 'named' })); });
  await seed(page, SEED);
  if (ext) {
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('#menu [data-go="calendar"]').click();
    await page.locator('[data-m="link"]').click();
    await page.locator('#lk-sw').click();
    await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#lk-close').click();
  }
}

test.describe('入口', () => {
  test('?paste なしでも長押しメニューとコピー行が出る（PR34で公開）', async ({ page }) => {
    await boot(page, SIZES.openPortrait669, { query: '' });
    await longPress(page, chip(page, '撮影'));
    await expect(page.locator('.cmenu')).toBeVisible();
    await page.mouse.click(5, 5);
    await chip(page, '撮影').click();
    await expect(page.locator('#copyrow')).toBeVisible();
  });
});

test.describe('チップ長押しのメニュー', () => {
  test('幅160・行44・コピー／編集／削除。コピーで貼付状態、DBは増えない', async ({ page }) => {
    await boot(page);
    await longPress(page, chip(page, '撮影'));
    const m = page.locator('.cmenu');
    await expect(m).toBeVisible();
    const bb = await m.boundingBox();
    expect(Math.round(bb.width)).toBe(160);
    for (const t of ['コピー', '編集', '削除']) { const r = await m.getByRole('menuitem', { name: t }).boundingBox(); expect(Math.round(r.height)).toBe(44); }
    await m.getByRole('menuitem', { name: 'コピー' }).click();
    await expect(band(page)).toBeVisible();
    await expect(band(page)).toContainText('「撮影」を貼る日を選択');
    await expect(band(page).locator('[data-pa="ok"]')).toBeDisabled();
    expect((await dbEvents(page)).length).toBe(2);
  });
  test('メニューの編集・削除は既存の編集・削除確認へ。外側タップで閉じる', async ({ page }) => {
    await boot(page);
    await longPress(page, chip(page, '撮影'));
    await page.locator('.cmenu').getByRole('menuitem', { name: '削除' }).click();
    await expect(page.locator('#confirm')).toBeVisible();
    await page.locator('#canceldelete').click();
    await page.locator('#close').click();
    await expect(page.locator('#editor')).toBeHidden();
    await longPress(page, chip(page, '撮影'));
    await page.locator('.cmenu').getByRole('menuitem', { name: '編集' }).click();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-title')).toHaveValue('撮影');
    await page.locator('#close').click();
    await expect(page.locator('#editor')).toBeHidden();
    await longPress(page, chip(page, '撮影'));
    await page.mouse.click(5, 5);
    await expect(page.locator('.cmenu')).toHaveCount(0);
  });
  test('チップのない所（日の数字）の長押しは従来どおり期間選択', async ({ page }) => {
    await boot(page);
    await longPress(page, dayBtn(page, '2026-11-25'));
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('.cmenu')).toHaveCount(0);
  });
  test('ポップアップの下の行にコピー（高さ44）。未保存の変更があれば止める', async ({ page }) => {
    await boot(page);
    await chip(page, '撮影').click();
    const c = page.locator('#copy');
    await expect(c).toBeVisible();
    expect(Math.round((await c.boundingBox()).height)).toBe(44);
    await page.locator('#f-title').fill('撮影2');
    await c.click();
    await expect(page.locator('#error')).toContainText('コピー');
    await expect(band(page)).toHaveCount(0);
    await page.locator('#f-title').fill('撮影');
    await c.click();
    await expect(band(page)).toContainText('「撮影」を貼る日を選択');
    await expect(page.locator('#editor')).toBeHidden();
  });
  test('複数日の予定は日数と補足、帯の高さ60', async ({ page }) => {
    await boot(page);
    await longPress(page, chip(page, '出張'));
    await page.locator('.cmenu').getByRole('menuitem', { name: 'コピー' }).click();
    await expect(band(page)).toContainText('「出張」（3日間）を貼る日を選択');
    await expect(band(page)).toContainText('選んだ日から始まります');
    expect(Math.round((await band(page).boundingBox()).height)).toBe(60);
  });
});

test.describe('日の選択', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await longPress(page, chip(page, '撮影'));
    await page.locator('.cmenu').getByRole('menuitem', { name: 'コピー' }).click();
    await expect(band(page)).toBeVisible();
  });
  test('たたくと選び、もう一度で外す。元の日にも選べ、元の日に印', async ({ page }) => {
    await dayBtn(page, '2026-11-20').click();
    await dayBtn(page, '2026-11-12').click();
    expect(await count(page)).toBe(2);
    await expect(band(page).locator('[data-pa="ok"]')).toContainText('2日に貼り付け');
    await expect(band(page).locator('[data-pa="ok"]')).toBeEnabled();
    await expect(dayBtn(page, '2026-11-12')).toHaveClass(/psrc/);
    await expect(dayBtn(page, '2026-11-12').locator('.pcsrc')).toHaveText('コピー元');
    await expect(dayBtn(page, '2026-11-20').locator('.pck')).toHaveText('✓');
    await dayBtn(page, '2026-11-20').click();
    expect(await count(page)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.dataset.ready)).toBeTruthy();
  });
  test('31日は選べて32日目は選ばず、文言・触覚、31の数字は黄', async ({ page }) => {
    const days = ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];
    for (const k of days) await dayBtn(page, k).click();
    expect(await count(page)).toBe(23);
    // 残りは月を送って選ぶ（選択は保たれる）
    await page.locator('[data-act="next"]').first().evaluate((b) => b.click());
    for (let i = 1; i <= 8; i++) await dayBtn(page, `2026-12-${String(i).padStart(2, '0')}`).click();
    await expect(band(page).locator('.pn')).toHaveText('31');
    expect(await band(page).locator('.pbo').evaluate((e) => e.classList.contains('full'))).toBe(true);
    expect(await band(page).locator('.pn').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(244, 194, 122)');
    await dayBtn(page, '2026-12-09').click();
    await expect(band(page).locator('.pn')).toHaveText('31');
    await expect(dayBtn(page, '2026-12-09')).not.toHaveClass(/psel/);
    await expect(page.locator('#native-toast')).toContainText('一度に貼り付けられるのは31日までです');
    expect((await page.evaluate(() => window.__mock?.calls ?? [])).length).toBe(0);
    await page.waitForTimeout(3200);
    await expect(page.locator('#native-toast')).toHaveCount(0);
  });
  test('チップのない所の長押しをなぞると、なぞった日をまとめて選ぶ（期間の予定は作らない）', async ({ page }) => {
    const a = await dayBtn(page, '2026-11-24').boundingBox(), b = await dayBtn(page, '2026-11-26').boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + 6); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(b.x + b.width / 2, b.y + 6, { steps: 6 }); await page.mouse.up();
    await expect(page.locator('#editor')).toBeHidden();
    expect(await count(page)).toBe(3);
    expect((await dbEvents(page)).length).toBe(2);
  });
  test('貼付中はチップ・＋が無反応、タブも押せない。キャンセルで元に戻る', async ({ page }) => {
    await chip(page, '出張').click({ force: true }).catch(() => {});
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('[data-act="add"]').first()).toHaveJSProperty('inert', true);
    await expect(page.locator('.week .strip, .week .bar').first()).toHaveJSProperty('inert', true);
    await dayBtn(page, '2026-11-20').click();
    await band(page).locator('[data-pa="cancel"]').click();
    await expect(band(page)).toHaveCount(0);
    expect(await count(page)).toBe(0);
    expect((await dbEvents(page)).length).toBe(2);
    await expect(page.locator('[data-act="add"]').first()).toHaveJSProperty('inert', false);
  });
  test('月を送っても選んだ日が残り、数が維持される', async ({ page }) => {
    await dayBtn(page, '2026-11-20').click();
    await page.locator('[data-act="next"]').first().evaluate((b) => b.click());
    await dayBtn(page, '2026-12-03').click();
    await expect(band(page).locator('.pn')).toHaveText('2');
    await page.locator('[data-act="prev"]').first().evaluate((b) => b.click());
    await expect(dayBtn(page, '2026-11-20')).toHaveClass(/psel/);
    await expect(band(page).locator('.pn')).toHaveText('2');
  });
  test('見本: 選んだ日から始まる帯を空きレーンへ描く。DBには入らない', async ({ page }) => {
    await dayBtn(page, '2026-11-20').click();
    await dayBtn(page, '2026-11-24').click();
    const g = page.locator('.week [data-pghost]');
    await expect(g).toHaveCount(2);
    await expect(g.first()).toContainText('10:00 撮影');
    await expect(g.first()).toHaveAttribute('aria-hidden', 'true');
    expect((await dbEvents(page)).length).toBe(2);
  });
  test('確定: 1回の保存で選んだ日に貼り、6秒の取消を出す。取消で消える', async ({ page }) => {
    await dayBtn(page, '2026-11-20').click();
    await dayBtn(page, '2026-11-27').click();
    await band(page).locator('[data-pa="ok"]').click();
    await expect(band(page)).toHaveCount(0);
    await expect(page.locator('.pghost')).toHaveCount(0);
    const evs = await dbEvents(page);
    expect(evs.length).toBe(4);
    expect(evs.filter((e) => e.title === '撮影').map((e) => e.start.slice(0, 10)).sort()).toEqual(['2026-11-12', '2026-11-20', '2026-11-27']);
    expect(evs.find((e) => e.start.startsWith('2026-11-27')).end).toBe('2026-11-27T11:00');
    for (const e of evs) expect(Object.keys(e).filter((k) => /paste|ghost|preview/i.test(k))).toEqual([]); // 貼付専用の欄は持たない（通常の単発）
    const t = page.locator('#native-toast');
    await expect(t).toContainText('2件を貼り付けました');
    await t.getByRole('button', { name: '元に戻す' }).click();
    await expect(page.locator('#native-toast')).toContainText('取り消しました');
    expect((await dbEvents(page)).length).toBe(2);
  });
});

test('複数日の見本: 選んだ日始まり・題名と日数・週またぎは続きを出す', async ({ page }) => {
  await boot(page);
  await longPress(page, chip(page, '出張'));
  await page.locator('.cmenu').getByRole('menuitem', { name: 'コピー' }).click();
  await dayBtn(page, '2026-11-28').click();
  const g = page.locator('.week [data-pghost="2026-11-28"]');
  await expect(g).toHaveCount(2);
  await expect(g.first()).toContainText('出張 3日');
  await expect(g.last()).toContainText('出張（つづき）');
  expect((await dbEvents(page)).length).toBe(2);
});

test.describe('貼付の失敗画面', () => {
  test('iPhoneだけの複製が全部失敗: 日付は3件まで＋ほかN、「Duoにも入っていない」、再試行→再失敗は閉じるだけ', async ({ page }) => {
    await boot(page, SIZES.openPortrait669, { ext: true });
    await page.waitForSelector('.week [data-event]');
    await longPress(page, chip(page, '歯医者'));
    await page.locator('.cmenu').getByRole('menuitem', { name: 'コピー' }).click();
    await expect(band(page)).toContainText('「歯医者」を貼る日を選択');
    for (const d of ['2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25']) await dayBtn(page, d).click();
    await band(page).locator('[data-pa="ok"]').click();
    const dlg = page.locator('#xr-dlg, dialog:has(#xr-msg)').first();
    await expect(page.locator('#xr-msg')).toContainText('Duo にも入っていません');
    await expect(page.locator('#xr-msg')).toContainText('11月20日、11月21日、11月23日ほか2日');
    await expect(page.locator('#xr-msg')).not.toContainText('保存してあります');
    expect((await dbEvents(page)).length).toBe(2);
    await page.locator('#xr-retry').click();
    await expect(page.locator('#xr-retry')).toBeHidden();
    await expect(page.locator('#xr-close')).toBeVisible();
    await page.locator('#xr-close').click();
    await expect(page.locator('#xr-msg')).toBeHidden();
    expect(await writes(page)).not.toContain('createEvent');
    void dlg;
  });
});

for (const size of OPEN_SIZES) {
  test(`姿勢 ${size.width}x${size.height}: 帯の位置と、開閉・回転で選択が保たれる`, async ({ page }) => {
    await boot(page, size);
    await longPress(page, chip(page, '撮影'));
    await page.locator('.cmenu').getByRole('menuitem', { name: 'コピー' }).click();
    await expect(band(page)).toBeVisible();
    const bb = await band(page).boundingBox();
    expect(bb.height).toBeGreaterThanOrEqual(44);
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(size.width + 1);
    await dayBtn(page, '2026-11-20').click();
    await dayBtn(page, '2026-11-21').click();
    // 回転（縦横を入れ替え）・閉じた画面へ
    for (const next of [{ width: size.height, height: size.width }, SIZES.closedPortrait, size]) {
      await page.setViewportSize(next);
      await page.waitForTimeout(250);
      await expect(band(page)).toBeVisible();
      await expect(band(page).locator('.pn')).toHaveText('2');
      await expect(dayBtn(page, '2026-11-20')).toHaveClass(/psel/);
    }
    const spread = await page.evaluate(() => document.body.dataset.layout === 'spread');
    if (spread) { // 他のページは触れず10%暗い
      const other = page.locator('.page:not([data-page="month"])').first();
      await expect(other).toHaveJSProperty('inert', true);
      expect(await other.evaluate((e) => getComputedStyle(e).filter)).toContain('0.9');
    }
  });
}

test.describe('iPhone の予定（ext）', () => {
  test('書けない予定は編集・削除が無効でコピーは可。getEvent で型紙を取り、書込0', async ({ page }) => {
    await boot(page, SIZES.openPortrait669, { ext: true });
    await expect(chip(page, '祝日の予定')).toBeVisible();
    await longPress(page, chip(page, '祝日の予定'));
    const m = page.locator('.cmenu');
    await expect(m.getByRole('menuitem', { name: '編集' })).toBeDisabled();
    await expect(m.getByRole('menuitem', { name: '削除' })).toBeDisabled();
    await expect(m.getByRole('menuitem', { name: 'コピー' })).toBeEnabled();
    await m.getByRole('menuitem', { name: 'コピー' }).click();
    await expect(band(page)).toContainText('「祝日の予定」を貼る日を選択');
    expect((await calls(page, 'getEvent')).at(-1).opts).toMatchObject({ eventId: 'h1' });
    await dayBtn(page, '2026-11-20').click();
    await band(page).locator('[data-pa="cancel"]').click();
    expect(await writes(page)).toEqual([]);
    expect((await dbEvents(page)).length).toBe(2);
  });
  test('招待の予定もコピーでき、iPhone 予定のポップアップにもコピー行がある', async ({ page }) => {
    await boot(page, SIZES.openPortrait669, { ext: true });
    await chip(page, '招待会議').click();
    await expect(page.locator('#xd-copy')).toBeVisible();
    await expect(page.locator('#xd-copy')).toBeEnabled();
    expect(Math.round((await page.locator('#xd-copy').boundingBox()).height)).toBe(44);
    await page.locator('#xd-copy').click();
    await expect(page.locator('#xdetail')).toBeHidden();
    await expect(band(page)).toContainText('「招待会議」を貼る日を選択');
    expect(await writes(page)).toEqual([]);
  });
});

test('閉じた画面: 日表示のポップアップからコピーすると月に戻って帯が出る', async ({ page }) => {
  await boot(page, SIZES.closedPortrait);
  await tab(page, '日').click();
  await page.locator('.tlev', { hasText: '撮影' }).first().click();
  await page.locator('#copy').click();
  await expect(band(page)).toBeVisible();
  const bb = await band(page).boundingBox();
  expect(bb.x + bb.width).toBeLessThanOrEqual(SIZES.closedPortrait.width);
  await dayBtn(page, '2026-11-20').click();
  await expect(band(page).locator('.pn')).toHaveText('1');
});
