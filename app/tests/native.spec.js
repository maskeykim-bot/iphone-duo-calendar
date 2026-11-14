// 第7版: iPhone カレンダー連携。window.Capacitor を偽装して、DuoNative の契約どおりに呼ばれ表示されることを確認する。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, tab, seed, ev, dbEvents } from './helpers.js';

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
    const M = window.__mock = { perm: c.perm ?? 'granted', afterRequest: c.afterRequest ?? 'granted', calls: [], cals: c.cals, events: c.events, createFail: 0, opened: true, share: { completed: true }, created: {}, listeners: {} };
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
            return { eventId: M.created[opts.requestId] };
          case 'openInCalendar': return { opened: M.opened };
          case 'shareFile': return M.share;
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
    await expect(page.getByText('iPhone側の予定をDuoから編集・削除することはありません。')).toBeVisible();
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
    await page.getByRole('button', { name: '予定名' }).click();
    await expect(page.locator('[data-date="2026-11-12"] .chip', { hasText: '歯医者' })).toContainText('▦');
    await expect(page.locator('.bar', { hasText: '<b>旅行</b>' })).toHaveCount(2); // 週境界で2本に分割。HTML は文字として表示
    await expect(page.locator('.xlegend')).toHaveText('▦ iPhoneの予定（カレンダーの色）');
    await expect(page.locator('.legend span')).toHaveCount(5); // 新規の既定カテゴリ5つ（仕事・プライベート・家族・外出・その他）
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
    // 繰り返しありは無効化
    await page.locator('#rtoggle').click();
    await page.locator('#f-rfreq').selectOption('daily');
    await expect(x).toBeDisabled();
    await expect(x).not.toBeChecked();
    await expect(page.locator('#xnote')).toHaveText('繰り返し予定はiPhoneのカレンダーに追加できません。');
    await page.locator('#f-rfreq').selectOption('none');
    await expect(x).toBeEnabled();
    await expect(x).not.toBeChecked(); // 自動でオンに戻さない
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
    expect(saved.nativeLink).toEqual({ state: 'linked', requestId: c[0].opts.requestId, eventId: 'new-1', calendarId: 'cal-1' });
    // 外部側にも同じ eventId の予定が現れても、アプリ予定1つだけ表示（除外）
    await page.evaluate(() => { window.__mock.events.push({ id: 'new-1@2026-11-20T19:00', eventId: 'new-1', calendarId: 'cal-1', title: '会食', start: '2026-11-20T19:00', end: '2026-11-20T21:00', all: false, place: '銀座', notes: '', recurring: false, requestId: null }); window.__mock.listeners.calendarChanged?.(); });
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-20"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.daylist .event', { hasText: '会食' })).toHaveCount(1);
    await expect(page.locator('.daylist .event', { hasText: '会食' })).toContainText('iPhoneにも追加済み');
    // 編集には案内
    await page.locator('.daylist .event', { hasText: '会食' }).click();
    await expect(page.locator('#xlinked')).toContainText('iPhoneにも追加済み。以後の変更・削除はDuoだけに反映されます。');
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

  test('バックアップ: shareFile を優先し、外部予定・nativeLink は含めない。キャンセルは無通知', async ({ page }) => {
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
    expect(json).toMatchObject({ app: 'duo-calendar', version: 2 });
    expect(JSON.stringify(json)).not.toMatch(/nativeLink|requestId|歯医者/);
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
