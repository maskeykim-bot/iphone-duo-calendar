// 第7版: iPhone カレンダー連携。window.Capacitor を偽装して、DuoNative の契約どおりに呼ばれ表示されることを確認する。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, tab, seed, ev, dbEvents, setStyle, openMenu } from './helpers.js';

const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false },
];
const EVENTS = [
  { id: 'e1@2026-11-12T15:00', eventId: 'e1', calendarId: 'cal-1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00', all: false, place: '渋谷', notes: '保険証\n持参', recurring: false, requestId: null },
  { id: 'e2@2026-11-23T00:00', eventId: 'e2', calendarId: 'cal-2', title: '勤労感謝の日', start: '2026-11-23T00:00', end: '2026-11-23T00:00', all: true, place: '', notes: '', recurring: false, requestId: null },
  { id: 'e3@2026-11-14T00:00', eventId: 'e3', calendarId: 'cal-1', title: '<b>旅行</b>', start: '2026-11-14T00:00', end: '2026-11-15T00:00', all: true, place: '', notes: '', recurring: false, requestId: null },
  { id: 'ev-linked@2026-11-12T18:00', eventId: 'ev-linked', calendarId: 'cal-1', title: 'Duoで作成済み', start: '2026-11-12T18:00', end: '2026-11-12T19:00', all: false, place: '', notes: '', recurring: false, requestId: null },
];

async function mock(page, cfg = {}) {
  await page.addInitScript((c) => {
    const M = window.__mock = { perm: c.perm ?? 'granted', afterRequest: c.afterRequest ?? 'granted', calls: [], cals: c.cals, events: c.events, createFail: 0, opened: true, share: { completed: true }, created: {}, listeners: {}, notif: c.notif ?? 'notDetermined', notifAfter: c.notifAfter ?? 'granted', pending: [] };
    const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ plugin, method, opts: clone(opts) });
        switch (method) {
          case 'checkPermission': if (c.checkReject) throw { code: 'UNIMPLEMENTED', message: 'x' }; return { status: M.perm };
          case 'requestPermission': M.perm = M.afterRequest; return { status: M.perm };
          case 'openSettings': return { opened: true };
          case 'listCalendars': return { calendars: M.cals };
          case 'listEvents': return { events: M.events.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from) };
          case 'createEvent':
            if (M.createFail > 0) { M.createFail--; throw { code: 'UNAVAILABLE', message: 'boom' }; }
            M.created[opts.requestId] = M.created[opts.requestId] || `new-${Object.keys(M.created).length + 1}`;
            if (M.createErr) throw { code: M.createErr, message: 'x' };
            if (c.v2) { const n = M.created[opts.requestId]; return { itemId: `item-${n}`, externalId: `ext-${n}`, eventId: n, modifiedAt: 1763100000000, calendarId: opts.calendarId, occurrenceDate: null }; }
            return { eventId: M.created[opts.requestId] };
          case 'updateEvent': case 'deleteEvent': {
            if (M.opErr) throw { code: M.opErr, message: 'x' };
            if (M.needForce && method === 'updateEvent' && !opts.force) throw { code: 'CONFLICT', message: 'x' };
            if (!opts.requestId || !['this', 'future', 'all'].includes(opts.span)) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (method === 'deleteEvent') return opts.missing ? { deleted: true, missing: true } : { deleted: true };
            return { itemId: opts.itemId, externalId: opts.externalId ?? '', eventId: opts.eventId ?? 'x', modifiedAt: 1763100001000, calendarId: opts.calendarId, occurrenceDate: opts.occurrenceStart ?? null };
          }
          case 'openInCalendar': return { opened: M.opened };
          case 'shareFile': return M.share;
          case 'notifyStatus': return { status: M.notif };
          case 'requestNotifyPermission': if (M.notif === 'notDetermined') M.notif = M.notifAfter; return { status: M.notif };
          case 'notifySync': {
            const ok = ['granted', 'provisional', 'ephemeral'].includes(M.notif);
            const items = opts.items;
            if (!Array.isArray(items) || items.length > 60 || items.some((i) => !i || !String(i.id).startsWith('duo.') || typeof i.fireDate !== 'string')) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (!ok) throw { code: 'PERMISSION_DENIED', message: 'x' };
            const removed = M.pending.length; let skipped = 0;
            M.pending = items.filter((i) => { const keep = i.fireDate > '2026-11-14T00:00'; if (!keep) skipped++; return keep; });
            return { scheduled: M.pending.length, removed, skipped };
          }
          case 'notifyClear': { const n = M.pending.length; M.pending = []; return { removed: n }; }
          case 'notifyTest': if (!['granted', 'provisional', 'ephemeral'].includes(M.notif)) throw { code: 'PERMISSION_DENIED', message: 'x' }; return { scheduled: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, events: EVENTS, ...cfg });
}
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => !m || c.method === m), m);
const openLinkPanel = async (page) => {
  await page.locator('[data-act="menu"]:visible').first().click();
  await page.locator('[data-m="link"]').click();
  await expect(page.locator('#link')).toBeVisible();
};
async function enable(page) {
  await openLinkPanel(page);
  await page.locator('#lk-sw').click();
  await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#lk-close').click();
}

test.describe('Web 版（Capacitor なし）', () => {
  test('連携の入口もブリッジ呼び出しも出ない', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-act="menu"]:visible').first().click();
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('[data-m="link"]')).toBeHidden();
    await expect(page.locator('#link')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#xadd')).toBeHidden();
  });
});

test.describe('通知ブリッジ契約（偽装。Swift 実動作の証明ではない）', () => {
  const item = (n, fireDate = '2026-12-01T09:00') => ({ id: `duo.e${n}@2026-12-01T09:30#0`, title: 't', body: 'b', fireDate, thread: 'duo.2026-12-01', day: '2026-12-01', eventId: `e${n}` });

  test('状態・許可要求は notDetermined のときだけ要求し、5メソッドが応答する', async ({ page }) => {
    await mock(page, { notif: 'notDetermined', notifAfter: 'denied' });
    await openApp(page);
    const r = await page.evaluate(async () => {
      const { call } = await import('/js/native.js');
      const a = await call('notifyStatus'); const b = await call('requestNotifyPermission'); const c = await call('requestNotifyPermission');
      return [a.status, b.status, c.status];
    });
    expect(r).toEqual(['notDetermined', 'denied', 'denied']);
  });

  test('notifySync: 件数・skipped・removed、61件と構造不正は INVALID_ARGUMENT、未許可は PERMISSION_DENIED', async ({ page }) => {
    await mock(page, { notif: 'granted' });
    await openApp(page);
    const out = await page.evaluate(async ([it]) => {
      const { call, errCode } = await import('/js/native.js');
      const mk = (n, f = '2026-12-01T09:00') => ({ ...it, id: `duo.e${n}@x#0`, eventId: `e${n}`, fireDate: f });
      const o = {};
      o.a = await call('notifySync', { items: [mk(1), mk(2, '2020-01-01T09:00')] });
      o.b = await call('notifySync', { items: [mk(3)] });
      o.c = await call('notifySync', { items: Array.from({ length: 61 }, (_, i) => mk(i)) }).catch(errCode);
      o.d = await call('notifySync', { items: [{ id: 'x' }] }).catch(errCode);
      o.e = await call('notifyClear');
      o.t = await call('notifyTest');
      window.__mock.notif = 'denied';
      o.f = await call('notifySync', { items: [mk(1)] }).catch(errCode);
      o.g = await call('notifyTest').catch(errCode);
      return o;
    }, [item(0)]);
    expect(out).toEqual({ a: { scheduled: 1, removed: 0, skipped: 1 }, b: { scheduled: 1, removed: 1, skipped: 0 }, c: 'INVALID_ARGUMENT', d: 'INVALID_ARGUMENT', e: { removed: 1 }, t: { scheduled: true }, f: 'PERMISSION_DENIED', g: 'PERMISSION_DENIED' });
  });

  test('notificationTapped / timeChanged を listen で受けられる', async ({ page }) => {
    await mock(page);
    await openApp(page);
    const got = await page.evaluate(async () => {
      const { listen } = await import('/js/native.js');
      const seen = [];
      listen('notificationTapped', (e) => seen.push(e));
      window.__mock.listeners.notificationTapped?.({ day: '2026-12-01', eventId: 'e1' });
      return seen;
    });
    expect(got).toEqual([{ day: '2026-12-01', eventId: 'e1' }]);
  });
});

test.describe('ネイティブ（偽装）', () => {
  test('checkPermission が失敗したら入口を隠す', async ({ page }) => {
    await mock(page, { checkReject: true });
    await openApp(page);
    await page.locator('[data-act="menu"]:visible').first().click();
    await expect(page.locator('[data-m="link"]')).toBeHidden();
  });

  test('メニューは「バックアップ」の直前に入口。初期はオフで取得しない', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await page.locator('[data-act="menu"]:visible').first().click();
    const labels = await page.locator('#menu button:visible').allTextContents();
    expect(labels.indexOf('iPhone カレンダー連携')).toBe(labels.indexOf('バックアップ') - 1);
    await page.locator('[data-m="link"]').click();
    await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'false');
    expect(await calls(page, 'listEvents')).toHaveLength(0);
    expect(await calls(page, 'requestPermission')).toHaveLength(0);
  });

  test('許可フロー: notDetermined → 説明 → ユーザー操作でのみ要求 → granted で全選択', async ({ page }) => {
    await mock(page, { perm: 'notDetermined', afterRequest: 'granted' });
    await openApp(page);
    await openLinkPanel(page);
    await page.locator('#lk-sw').click();
    await expect(page.getByText('iPhone のカレンダーへのアクセスを許可してください')).toBeVisible();
    await expect(page.getByText('Duoから追加した予定の変更・削除は、iPhoneのカレンダーにも反映されます。')).toBeVisible();
    expect(await calls(page, 'requestPermission')).toHaveLength(0);
    await page.locator('#lk-req').click();
    await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'true');
    expect(await calls(page, 'requestPermission')).toHaveLength(1);
    await expect(page.locator('[data-cal]')).toHaveCount(2);
    await expect(page.locator('[data-cal]:checked')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible();
    await expect(page.getByText('読み取り専用')).toBeVisible();
    await expect(page.getByText(/Googleを追加してください/)).toBeVisible();
    await expect(page.locator('#lk-status')).toContainText('最終読み込み：');
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal')));
    expect(ls).toMatchObject({ version: 1, enabled: true, selectionInitialized: true });
    expect(ls.calendarIds.sort()).toEqual(['cal-1', 'cal-2']);
    const le = (await calls(page, 'listEvents'))[0].opts;
    expect(le).toMatchObject({ from: '2026-10-01T00:00', to: '2027-01-01T00:00' });
  });

  for (const [st, text] of [['denied', '設定 ＞ プライバシーとセキュリティ ＞ カレンダー ＞ Duo で『フルアクセス』'], ['restricted', 'この端末ではカレンダーへのアクセスが制限されています。'], ['writeOnly', '予定を表示するにはフルアクセスが必要です。']]) {
    test(`許可フロー: ${st} の案内。連携オンは確定しない`, async ({ page }) => {
      await mock(page, { perm: st, afterRequest: st });
      await openApp(page);
      await openLinkPanel(page);
      await page.locator('#lk-sw').click();
      await expect(page.locator('#lk-body')).toContainText(text);
      await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'false');
      expect(await calls(page, 'requestPermission')).toHaveLength(0); // 自動で再要求しない
      if (st !== 'restricted') {
        await page.locator('#lk-settings').click();
        expect(await calls(page, 'openSettings')).toHaveLength(1);
      }
      if (st === 'writeOnly') {
        await page.locator('#lk-req').click();
        expect(await calls(page, 'requestPermission')).toHaveLength(1);
        await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'false');
      }
    });
  }

  test('混在表示: ホーム・日・月（帯・短冊・凡例）・アクセシブル名', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    // ホーム: 次の予定
    await expect(page.locator('.next')).toContainText('歯医者');
    await expect(page.locator('.next')).toContainText('iPhone · 家族');
    // 日表示
    await tab(page, '日').click();
    const card = page.locator('.daylist .event.ext', { hasText: '歯医者' });
    await expect(card).toBeVisible();
    await expect(card.locator('.tag')).toHaveText('iPhone · 家族');
    await expect(card).toHaveAttribute('aria-label', /iPhone、家族、/);
    expect(await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#d93025');
    // 並び: 終日→時間付き（アプリ予定がなくても iPhone 内で開始昇順）
    // 月（予定名）
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    // 月のチップ・帯は出所アイコンを出さず（aria-label に「iPhone、カレンダー名」を残す）、塗りはカレンダーの元色
    const dent = page.locator('.calendar .strip[data-sday="2026-11-12"]', { hasText: '歯医者' });
    await expect(dent).not.toContainText('▦');
    await expect(dent).toHaveAttribute('aria-label', /^iPhone、/);
    expect(await dent.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(217, 48, 37)'); // カレンダーの色 #d93025
    await expect(page.locator('.bar', { hasText: '<b>旅行</b>' })).toHaveCount(1); // 11/14(土)〜15(日)は月曜始まりでは同じ週なので1本（週境界の分割は month-all.spec.js で確認）。HTML は文字として表示
    // 凡例は設定メニューの中
    await openMenu(page);
    await expect(page.locator('#menu .xlegend')).toHaveText('▦ iPhoneの予定（カレンダーの色）');
    await expect(page.locator('#menu .legend span')).toHaveCount(5); // 新規の既定カテゴリ5つ（仕事・プライベート・家族・外出・その他）
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-label', /うちiPhone 2件/);
  });

  test('詳細シート: 読み取り専用・カレンダーで開く・失敗表示', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await tab(page, '日').click();
    await page.locator('.daylist .event.ext', { hasText: '歯医者' }).click();
    const d = page.locator('#xdetail');
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { name: 'iPhoneの予定' })).toBeVisible();
    await expect(d).toContainText('歯医者');
    await expect(d).toContainText('iPhone · 家族');
    await expect(d).toContainText('2026/11/12 15:00');
    await expect(d).toContainText('渋谷');
    await expect(d).toContainText('保険証');
    await expect(d.getByRole('button', { name: /削除|保存|編集/ })).toHaveCount(0);
    await expect(page.locator('#editor')).toBeHidden();
    await d.locator('#xd-open').click();
    expect((await calls(page, 'openInCalendar'))[0].opts).toEqual({ start: '2026-11-12T15:00' });
    await page.evaluate(() => { window.__mock.opened = false; });
    await d.locator('#xd-open').click();
    await expect(d.locator('#xd-err')).toHaveText('カレンダーを開けませんでした。');
    await expect(d).toBeVisible();
    await d.locator('#xd-close').click();
    await expect(d).toBeHidden();
    // 終日: 含む最終日
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-23"]').click({ position: { x: 12, y: 10 } });
    await page.locator('.daylist .event.ext', { hasText: '勤労感謝' }).click();
    await expect(d).toContainText('終日');
    await expect(d).toContainText('場所なし');
    await expect(d).toContainText('メモなし');
  });

  test('iPhone にも追加: createEvent の引数・リンク保存・二重表示なし', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    const x = page.locator('#f-xadd');
    await expect(x).toBeVisible();
    await expect(x).not.toBeChecked();
    await expect(page.locator('#f-xcal')).toBeHidden();
    // 書込可のみ（家族）。読み取り専用の祝日は出ない
    await x.check();
    await expect(page.locator('#f-xcal option')).toHaveText(['家族（Google）']);
    // 第11版 PR9: 繰り返しありでも選べる（無効化しない）
    await page.locator('#rtoggle').click();
    await page.locator('#f-rfreq').selectOption('daily');
    await expect(x).toBeEnabled();
    await expect(x).toBeChecked();
    await expect(page.locator('#xnote')).toHaveText('');
    await page.locator('#f-rfreq').selectOption('none');
    await x.uncheck();
    await page.locator('#f-title').fill('会食');
    await page.locator('#f-start').fill('2026/11/20 19:00');
    await page.locator('#f-end').fill('2026/11/20 21:00');
    await page.locator('#f-place').fill('銀座');
    await x.check();
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('予定を保存し、iPhoneのカレンダーにも追加しました。');
    const c = await calls(page, 'createEvent');
    expect(c).toHaveLength(1);
    expect(c[0].opts).toMatchObject({ calendarId: 'cal-1', title: '会食', start: '2026-11-20T19:00', end: '2026-11-20T21:00', all: false, place: '銀座', notes: '' });
    expect(c[0].opts.requestId).toMatch(/.{8,}/);
    const saved = (await dbEvents(page)).find((e) => e.title === '会食');
    expect(saved.nativeLink).toMatchObject({ v: 2, state: 'linked', requestId: c[0].opts.requestId, eventId: 'new-1', calendarId: 'cal-1', seriesStart: '2026-11-20T19:00', warn: null });
    // 外部側にも同じ eventId の予定が現れても、アプリ予定1つだけ表示（除外）
    await page.evaluate(() => { window.__mock.events.push({ id: 'new-1@2026-11-20T19:00', eventId: 'new-1', calendarId: 'cal-1', title: '会食', start: '2026-11-20T19:00', end: '2026-11-20T21:00', all: false, place: '銀座', notes: '', recurring: false, requestId: null }); window.__mock.listeners.calendarChanged?.(); });
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-20"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.daylist .event', { hasText: '会食' })).toHaveCount(1);
    await expect(page.locator('.daylist .event', { hasText: '会食' })).toContainText('iPhoneにも追加済み');
    // 編集には案内
    await page.locator('.daylist .event', { hasText: '会食' }).click();
    await expect(page.locator('#xlinked')).toContainText('iPhoneにも追加済み。Duo で変えた内容は iPhone のカレンダーにも反映されます。');
    await expect(page.locator('#xadd')).toBeHidden();
  });

  test('終日の追加: end は最終日 00:00。失敗してもアプリ予定は残り、再試行は同じ requestId', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createFail = 1; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('出張');
    await page.locator('#f-all').check();
    await page.locator('#f-start').fill('2026/11/25');
    await page.locator('#f-end').fill('2026/11/26');
    await page.locator('#f-xadd').check();
    await page.locator('#editor [type=submit]').click();
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await expect(r).toContainText('Duoに保存しました。iPhoneのカレンダーには追加できませんでした。');
    expect((await dbEvents(page)).find((e) => e.title === '出張').nativeLink.state).toBe('pending');
    await r.locator('#xr-retry').click();
    await expect(r).toBeHidden();
    const c = await calls(page, 'createEvent');
    expect(c).toHaveLength(2);
    expect(c[1].opts.requestId).toBe(c[0].opts.requestId);
    expect(c[1].opts).toMatchObject({ all: true, start: '2026-11-25T00:00', end: '2026-11-26T00:00' });
    expect((await dbEvents(page)).find((e) => e.title === '出張').nativeLink.state).toBe('linked');
  });

  test('第11版 PR9: 新規の繰り返し予定も iPhone に追加（recurrence 引数・再試行は同じ requestId・二重通知なし）', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createFail = 1; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('毎週の会');
    await page.locator('#f-start').fill('2026/11/20 19:00');
    await page.locator('#f-end').fill('2026/11/20 20:00');
    await page.locator('#rtoggle').click();
    await page.locator('#f-rfreq').selectOption('weekly');
    await page.locator('#f-xadd').check();
    await page.locator('#editor [type=submit]').click();
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await r.locator('#xr-retry').click();
    await expect(r).toBeHidden();
    const c = await calls(page, 'createEvent');
    expect(c).toHaveLength(2);
    expect(c[1].opts.requestId).toBe(c[0].opts.requestId);
    for (const k of c) expect(k.opts.recurrence).toMatchObject({ freq: 'weekly', interval: 1, count: null, until: null });
    expect(c[1].opts.recurrence.byDay).toEqual([5]);
    const ev = (await dbEvents(page)).find((e) => e.title === '毎週の会');
    expect(ev.nativeLink.state).toBe('linked');
  });

  test('第11版 PR5: createEvent の戻りが v2（itemId/externalId/modifiedAt/calendarId）でも壊れず、alarms 引数を渡さない現状でも作成できる', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('v2戻り');
    await page.locator('#f-xadd').check();
    await page.locator('#editor [type=submit]').click();
    await expect(page.getByRole('status')).toHaveText('予定を保存し、iPhoneのカレンダーにも追加しました。');
    const saved = (await dbEvents(page)).find((e) => e.title === 'v2戻り');
    expect(saved.nativeLink).toMatchObject({ state: 'linked', eventId: 'new-1', calendarId: 'cal-1' });
  });

  test('第11版 PR5: createEvent の WRITE_ONLY は再試行なしの案内（許可の確認）になる', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createErr = 'WRITE_ONLY'; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('許可不足');
    await page.locator('#f-xadd').check();
    await page.locator('#editor [type=submit]').click();
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await expect(r).toContainText('カレンダーのフルアクセスの許可が必要です。');
    await expect(page.locator('#xr-retry')).toBeHidden();
    expect((await dbEvents(page)).find((e) => e.title === '許可不足').nativeLink.state).toBe('pending');
  });

  test('二重表示の除外: linked.eventId と一致する外部予定は表示・検索から除く', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await seed(page, [ev('a1', 'Duoで作成済み', '2026-11-12T18:00', '2026-11-12T19:00', { nativeLink: { state: 'linked', requestId: 'r1', eventId: 'ev-linked', calendarId: 'cal-1' } })]);
    await enable(page);
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event', { hasText: 'Duoで作成済み' })).toHaveCount(1);
    await expect(page.locator('.daylist .event.ext', { hasText: 'Duoで作成済み' })).toHaveCount(0);
    await expect(page.locator('.daylist .event.ext')).toHaveCount(1); // 歯医者のみ
    // 検索
    await page.locator('[data-act="search"]:visible').first().click();
    await page.locator('#sr-q').fill('Duoで作成');
    await expect(page.locator('#sr-body .hit')).toHaveCount(1);
  });

  test('検索: iPhone の予定を含め、範囲を別行で表示。選択で日表示→再タップで詳細', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="search"]:visible').first().click();
    await expect(page.locator('#sr-xrange')).toHaveText('iPhoneの検索範囲：2026/10/01–2026/12/31（読み込み済み）');
    await page.locator('#sr-q').fill('はいしゃ'.replace('はいしゃ', '歯医者'));
    const hit = page.locator('#sr-body .hit.ext');
    await expect(hit).toHaveCount(1);
    await expect(hit).toContainText('iPhone · 家族');
    await hit.click();
    await expect(page.locator('#search')).toBeHidden();
    await page.locator('.daylist .event.ext', { hasText: '歯医者' }).click();
    await expect(page.locator('#xdetail')).toBeVisible();
  });

  test('バックアップ: shareFile を優先し、外部予定は含めず nativeLink は保持する。キャンセルは無通知', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await seed(page, [ev('a1', 'Duo予定', '2026-11-12T18:00', '2026-11-12T19:00', { nativeLink: { state: 'linked', requestId: 'r1', eventId: 'zzz', calendarId: 'cal-1' } })]);
    await enable(page);
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('[data-m="backup"]').click();
    await page.locator('#bk-export').click();
    await expect(page.locator('.bmsg')).toHaveText('書き出しファイルを共有しました。');
    const s = await calls(page, 'shareFile');
    expect(s).toHaveLength(1);
    expect(s[0].opts.mime).toBe('application/json');
    expect(s[0].opts.name).toMatch(/^duo-calendar-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(s[0].opts.text);
    expect(json).toMatchObject({ app: 'duo-calendar', version: 3 });
    expect(JSON.stringify(json)).not.toMatch(/歯医者/);
    expect(json.events[0].nativeLink).toEqual({ state: 'linked', requestId: 'r1', eventId: 'zzz', calendarId: 'cal-1' });
    // キャンセル（completed:false）は通知しない
    await page.evaluate(() => { window.__mock.share = { completed: false }; });
    await page.locator('#bk-export').click();
    await expect(page.locator('.bmsg')).toHaveCount(0);
    await expect(page.locator('#backup')).toBeVisible();
    // 置き換え確認の追記
    await page.evaluate(() => { const f = new File([JSON.stringify({ app: 'duo-calendar', version: 2, exportedAt: '2026-11-12T10:00:00+09:00', events: [] })], 'b.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f); const i = document.querySelector('#bk-file'); i.files = dt.files; i.dispatchEvent(new Event('change')); });
    await page.locator('#bk-replace').click();
    await expect(page.locator('#bk-body')).toContainText('iPhoneの予定と連携設定は変更しません。');
  });

  test('連携オフでキャッシュを破棄し、アプリ予定は残す。選択はlocalStorageに保存', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await seed(page, [ev('a1', 'Duo予定', '2026-11-12T08:00', '2026-11-12T09:00')]);
    await enable(page);
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event.ext')).toHaveCount(2); // 歯医者・Duoで作成済み（この試験ではリンクなし）
    await openLinkPanel(page);
    await page.locator('[data-cal="cal-1"]').uncheck();
    await expect(page.locator('.daylist .event.ext')).toHaveCount(0);
    await page.locator('#lk-sw').click();
    await expect(page.locator('#lk-sw')).toHaveAttribute('aria-checked', 'false');
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal')));
    expect(ls.enabled).toBe(false);
    expect(ls.calendarIds).toEqual(['cal-2']); // 選択IDは次回用に保持
    await page.locator('#lk-close').click();
    await expect(page.locator('.daylist .event')).toHaveCount(1);
  });
});

test.describe('第11版 PR6: updateEvent / deleteEvent の JS↔Swift 契約（呼び出し側は PR7）', () => {
  const call = (page, method, opts) => page.evaluate(async ([m, o]) => {
    try { return { ok: await window.Capacitor.nativePromise('DuoNative', m, o) }; } catch (e) { return { err: e.code }; }
  }, [method, opts]);
  const base = { itemId: 'i1', externalId: 'x1', eventId: 'e1', requestId: 'r1', calendarId: 'cal-1' };

  test('差分・空配列・null・各 span・新 requestId がそのまま渡り、戻りは識別子つき', async ({ page }) => {
    await mock(page);
    await openApp(page);
    for (const o of [
      { ...base, span: 'this', title: 'a' },
      { ...base, span: 'this', occurrenceStart: '2026-11-20T10:00', alarms: [] },
      { ...base, span: 'future', occurrenceStart: '2026-11-20T10:00', recurrence: null, newRequestId: 'r2', expectModified: 1763100000000 },
      { ...base, span: 'all', occurrenceStart: '2026-11-01T10:00', recurrence: { freq: 'weekly', interval: 1, byDay: [0, 3], count: 5, until: null }, force: true },
    ]) {
      const r = await call(page, 'updateEvent', o);
      expect(r.ok).toMatchObject({ itemId: 'i1', calendarId: 'cal-1' });
    }
    const c = await calls(page, 'updateEvent');
    expect(c).toHaveLength(4);
    expect(c[1].opts.alarms).toEqual([]);
    expect(c[2].opts).toMatchObject({ span: 'future', recurrence: null, newRequestId: 'r2' });
    expect(c[3].opts.recurrence.byDay).toEqual([0, 3]);
    expect(c[0].opts).not.toHaveProperty('alarms');
  });

  test('deleteEvent: 成功・missing・全失敗コード', async ({ page }) => {
    await mock(page);
    await openApp(page);
    expect((await call(page, 'deleteEvent', { ...base, span: 'this' })).ok).toEqual({ deleted: true });
    expect((await call(page, 'deleteEvent', { ...base, span: 'all', missing: true })).ok).toEqual({ deleted: true, missing: true });
    expect((await call(page, 'deleteEvent', { ...base, span: 'bad' })).err).toBe('INVALID_ARGUMENT');
    for (const code of ['NOT_FOUND', 'CONFLICT', 'WRITE_ONLY', 'PERMISSION_DENIED', 'RESTRICTED', 'READ_ONLY', 'CALENDAR_NOT_FOUND', 'INVALID_ARGUMENT', 'UNAVAILABLE']) {
      await page.evaluate((c) => { window.__mock.opErr = c; }, code);
      expect((await call(page, 'updateEvent', { ...base, span: 'this' })).err).toBe(code);
      expect((await call(page, 'deleteEvent', { ...base, span: 'this' })).err).toBe(code);
    }
  });
});

const LINK = { v: 2, state: 'linked', requestId: 'rq-1', calendarId: 'cal-1', itemId: 'it-1', externalId: 'ex-1', eventId: 'ev-1', ekModified: 1763100000000, seriesStart: '2026-11-12T10:00' };
const linkedEv = (x = {}) => ev('L1', '会食', '2026-11-12T10:00', '2026-11-12T11:00', { nativeLink: LINK, ...x });
async function openLinked(page, title = '会食') {
  await tab(page, '月').click();
  await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
  await page.locator('.daylist .event', { hasText: title }).click();
  await expect(page.locator('#editor')).toBeVisible();
}
const saveEdit = async (page, title) => { await page.locator('#f-title').fill(title); await page.locator('#editor [type=submit]').click(); await expect(page.locator('#editor')).toBeHidden(); };
const sent = (page, m) => calls(page, m);

test.describe('ネイティブ（偽装）第11版 PR7: iPhone へ反映', () => {
  test('linked の単発を編集 → updateEvent の引数（itemId・span:this・差分だけ・expectModified）', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await saveEdit(page, '会食（変更）');
    await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBe(1);
    const [c] = await sent(page, 'updateEvent');
    expect(c.opts).toMatchObject({ itemId: 'it-1', externalId: 'ex-1', eventId: 'ev-1', requestId: 'rq-1', calendarId: 'cal-1', span: 'this', title: '会食（変更）', expectModified: 1763100000000 });
    expect(c.opts).not.toHaveProperty('start');
    expect(c.opts).not.toHaveProperty('place');
    await expect.poll(async () => (await dbEvents(page))[0].nativeLink.ekModified).toBe(1763100001000);
    expect((await page.evaluate(async () => (await import('/js/db.js')).getOutbox()))).toEqual([]);
  });

  test('カテゴリだけの変更では送らない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await page.locator('#f-place').fill('');
    await page.locator('#editor [type=submit]').click();
    await page.waitForTimeout(900);
    expect(await sent(page, 'updateEvent')).toHaveLength(0);
  });

  test('3 回続けて編集（WRITE_ONLY で待ち）→ 許可後に updateEvent は 1 回、再起動後も再送', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'WRITE_ONLY'; });
    for (const t of ['A', 'B', 'C']) { await openLinked(page, t === 'A' ? '会食' : t === 'B' ? 'A' : 'B'); await saveEdit(page, t); await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBeGreaterThan(0); }
    const ob = await page.evaluate(async () => (await import('/js/db.js')).getOutbox());
    expect(ob).toHaveLength(1);
    expect(ob[0].payload).toEqual({ title: 'C' });
    expect((await dbEvents(page))[0].nativeLink.warn).toBe('writeOnly');
    await expect(page.locator('#native-toast')).toContainText('フルアクセスの許可が必要です');
    const before = (await sent(page, 'updateEvent')).length;
    // 再起動相当 → フルアクセスに変わっていれば送られる
    await page.addInitScript(() => {});
    await page.evaluate(() => { window.__mock.opErr = null; window.__mock.perm = 'granted'; });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBe(1);
    void before;
  });

  test('NOT_FOUND → 結びつきが外れ、Duo の予定は残り、お知らせが出る', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'NOT_FOUND'; });
    await openLinked(page);
    await saveEdit(page, 'x');
    await expect(page.locator('#native-toast')).toContainText('iPhone のカレンダーに元の予定が見つからないため、結びつきを外しました。Duo の予定はそのまま残っています。');
    const e = (await dbEvents(page))[0];
    expect(e.title).toBe('x');
    expect(e.nativeLink).toMatchObject({ state: 'unlinked', warn: 'missing' });
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
  });

  test('CONFLICT の update → force:true で再送し上書きを知らせる', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.needForce = true; });
    await openLinked(page);
    await saveEdit(page, 'y');
    await expect(page.locator('#native-toast')).toContainText('iPhone のカレンダー側でも変更されていたため、Duo の内容で上書きしました。');
    const c = await sent(page, 'updateEvent');
    expect(c.map((x) => !!x.opts.force)).toEqual([false, true]);
    expect((await dbEvents(page))[0].nativeLink.state).toBe('linked');
  });

  test('linked の削除 → 確認文・deleteEvent・外部の同じ予定は出ない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('会食\niPhone のカレンダーからも削除されます。');
    await expect(page.locator('#deletetitle')).toHaveCSS('font-size', '13px');
    await expect(page.locator('#deletetitle')).toHaveCSS('color', 'rgb(104, 113, 106)');
    await expect(page.locator('#canceldelete')).toBeFocused();
    await expect(page.locator('#dodelete')).toHaveText('削除する');
    await page.locator('#dodelete').click();
    await expect.poll(async () => (await sent(page, 'deleteEvent')).length).toBe(1);
    expect((await sent(page, 'deleteEvent'))[0].opts).toMatchObject({ itemId: 'it-1', span: 'this', requestId: 'rq-1' });
    expect(await dbEvents(page)).toHaveLength(0);
  });

  test('Duo のみの予定の削除文は予定名だけで、deleteEvent は呼ばれない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [ev('D1', '歯医者2', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await enable(page);
    await openLinked(page, '歯医者2');
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('歯医者2');
    await page.locator('#dodelete').click();
    await page.waitForTimeout(700);
    expect(await sent(page, 'deleteEvent')).toHaveLength(0);
  });

  test('権限なし: 「Duo からだけ削除」・Duo から削除ボタン・native 呼出し 0・未送信の更新も止まる', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'UNAVAILABLE'; });
    await openLinked(page);
    await saveEdit(page, 'q'); // 失敗して待ちに残る
    await expect.poll(async () => (await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).length).toBe(1);
    await page.evaluate(() => { window.__mock.perm = 'denied'; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    await openLinked(page, 'q');
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('Duo からだけ削除されます。iPhone のカレンダーには残ります。');
    await expect(page.locator('#dodelete')).toHaveText('Duo から削除');
    const n0 = (await sent(page, 'deleteEvent')).length;
    await page.locator('#dodelete').click();
    await expect.poll(async () => (await dbEvents(page)).length).toBe(0);
    expect((await sent(page, 'deleteEvent')).length).toBe(n0);
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
  });

  test('繰り返しの削除範囲にも iPhone の注意が出る', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv({ recurrence: { freq: 'daily', interval: 1, byDay: null, count: null, until: null } })]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#sc-warn')).toHaveText('会食\niPhone のカレンダーからも削除されます。');
    await page.locator('[data-scope="following"]').click();
    await expect(page.locator('#deletetitle')).toContainText('iPhone のカレンダーからも削除されます。');
  });

  test('保存と送信待ちは同じトランザクション: meta の書き込み失敗で本文も送信待ちも元のまま', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await page.evaluate(() => { const p = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v) { if (this.name === 'meta') throw new Error('boom'); return p.call(this, v); }; });
    await page.locator('#f-title').fill('壊れる');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#error')).toHaveText('保存できませんでした。もう一度お試しください。');
    await page.waitForTimeout(700);
    expect((await dbEvents(page))[0].title).toBe('会食');
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
    expect(await sent(page, 'updateEvent')).toHaveLength(0);
  });

  test('作成の戻りが v2 のとき alarms を渡し、itemId・externalId・ekIdentifier を保存', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('通知付き');
    await page.locator('#f-xadd').check();
    await page.locator('#editor [type=submit]').click();
    await expect(page.getByRole('status')).toHaveText('予定を保存し、iPhoneのカレンダーにも追加しました。');
    const [c] = await sent(page, 'createEvent');
    expect(Array.isArray(c.opts.alarms)).toBe(true);
    const e = (await dbEvents(page)).find((x) => x.title === '通知付き');
    expect(e.nativeLink).toMatchObject({ itemId: 'item-new-1', externalId: 'ext-new-1', ekModified: 1763100000000 });
    expect(e.nativeLink.ekIdentifier).toBe(`ext-new-1@${e.start}`);
  });
});

test.describe('端末をまたぐ照合（ekIdentifier）', () => {
  const rawEv = (x) => ({ id: 'x@2026-11-12T10:00', eventId: 'other-dev', calendarId: 'cal-1', title: '会食', start: '2026-11-12T10:00', end: '2026-11-12T11:00', all: false, place: '', notes: '', recurring: false, requestId: null, ...x });

  test('別の端末（eventId・itemId が違い、URL なしで externalId が同じ）でも月表示で二重にならない', async ({ page }) => {
    await mock(page, { events: [rawEv({ itemId: 'zz', externalId: 'ex-1' })] });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.daylist .event', { hasText: '会食' })).toHaveCount(1); // Duo の1件だけ
    await expect(page.locator('.daylist .event.ext', { hasText: '会食' })).toHaveCount(0);
  });

  test('externalId が空だった結びつきは、同期後の読込で埋まり ekIdentifier も付く（同値では書き換えない）', async ({ page }) => {
    await mock(page, { events: [rawEv({ itemId: 'it-1', externalId: 'ex-9', requestId: 'rq-1', eventId: 'ev-1' })] });
    await openApp(page);
    const { externalId, ekIdentifier, ...bare } = LINK;
    void externalId; void ekIdentifier;
    await seed(page, [linkedEv({ nativeLink: bare })]);
    await enable(page);
    await expect.poll(async () => (await dbEvents(page))[0].nativeLink.ekIdentifier).toBe('ex-9@2026-11-12T10:00');
    expect((await dbEvents(page))[0].nativeLink.externalId).toBe('ex-9');
    expect(await sent(page, 'updateEvent')).toHaveLength(0); // 照合では iPhone へ反映しない
  });

  test('代わりの照合で結びついた予定の削除は、予定名つきの確認文。キャンセルでは消費しない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    const nl = { ...LINK, itemId: 'gone', eventId: 'gone', matchedBy: 'fallback', fallbackDeleteConfirmed: false, calName: '家族', calSource: 'Google' };
    await seed(page, [linkedEv({ nativeLink: nl })]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('会食\niPhone のカレンダーからも削除されます。\niPhone のカレンダーの『会食』も削除されます');
    await page.locator('#canceldelete').click();
    expect((await dbEvents(page))[0].nativeLink.fallbackDeleteConfirmed).toBe(false);
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toContainText('『会食』も削除されます');
    await page.locator('#dodelete').click();
    await expect.poll(async () => (await sent(page, 'deleteEvent')).length).toBe(1);
  });
});
