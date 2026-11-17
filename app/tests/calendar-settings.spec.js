// 第15版 PR8: 設定 › カレンダー。Duo／iPhone のアカウント別／リマインダーの段、✓で表示を切り替える。偽装は契約の写しで実機の証明ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, openMenu } from './helpers.js';

const CALS = [
  { id: 'cal-a', title: '仕事', color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-b', title: '趣味', color: '#8e24aa', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-g', title: '個人', color: '#d93025', sourceId: 's-g', source: 'Gmail', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-r', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
  { id: 'cal-x', title: '予備', color: '#555555', sourceId: 's-l', source: 'iCloud', sourceType: 'local', allowsModify: true, isDefault: false },
];
const WRITE_METHODS = ['createEvent', 'createEvents', 'updateEvent', 'deleteEvent', 'deleteExternalEvent', 'notifySchedule'];

async function setup(page, { perm = 'granted', cals = CALS, link = null, listFail = false, remLists = null } = {}) {
  await page.addInitScript(({ perm, cals, link, listFail, remLists }) => {
    if (link && !localStorage.getItem('duo-native-cal')) localStorage.setItem('duo-native-cal', JSON.stringify(link));
    const M = window.__mock = { calls: [], perm, cals, listFail, listeners: {}, remLists };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': return { status: M.perm };
          case 'requestPermission': M.perm = M.afterRequest || 'granted'; return { status: M.perm };
          case 'openSettings': return { opened: M.openedResult !== false };
          case 'listCalendars': if (M.listFail) throw { code: 'UNAVAILABLE', message: 'x' }; return { calendars: M.cals };
          case 'listEvents': return { events: [] };
          case 'reminderPermission': return { status: M.remLists ? 'granted' : 'notDetermined' };
          case 'listReminderLists': return { lists: M.remLists || [] };
          case 'listReminders': return { reminders: [], more: false };
          default: return {};
        }
      },
    };
  }, { perm, cals, link, listFail, remLists });
  await openApp(page, SIZES.openPortrait669);
}
const mockCalls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => !m || c.method === m), m);
const ls = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal') || 'null'));
const rows = (page) => page.locator('#m-cal-ip [data-cal]');

test.describe('設定 › カレンダー（PR8）', () => {
  test('アカウント別の段: 同名 source は種別を併記、Gmail、表示のみ札、行40・見出し32・色丸14', async ({ page }) => {
    await setup(page);
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    const heads = await page.locator('#m-cal-ip .calsec').allTextContents();
    expect(heads).toEqual(expect.arrayContaining(['iCloud（caldav）', 'iCloud（local）', 'Gmail', 'Subscribed Calendars']));
    await expect(page.locator('#m-cal-duo .calsec span')).toHaveText('Duo（この端末だけ）');
    await expect(page.locator('[data-cal="cal-r"] .cro')).toHaveText('表示のみ');
    await expect(page.locator('[data-cal="cal-a"] .cro')).toHaveCount(0);
    const m = await page.evaluate(() => ({ h: document.querySelector('#m-cal-ip .calsec').getBoundingClientRect().height, r: document.querySelector('[data-cal="cal-a"]').getBoundingClientRect().height, d: document.querySelector('[data-cal="cal-a"] .cdot').getBoundingClientRect().width }));
    expect(m).toEqual({ h: 32, r: 40, d: 14 });
    // 初回は全選択
    await expect(page.locator('#m-cal-ip [aria-checked="true"]')).toHaveCount(5);
    expect(await ls(page)).toMatchObject({ enabled: true, selectionInitialized: true });
  });

  test('✓の切り替えは選択 id だけで読み、EventKit の変更 API は呼ばない。全オフ・再起動で保持', async ({ page }) => {
    await setup(page);
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    for (const id of ['cal-b', 'cal-g', 'cal-r', 'cal-x']) await page.locator(`[data-cal="${id}"]`).click();
    await expect.poll(async () => (await ls(page)).calendarIds).toEqual(['cal-a']);
    await expect.poll(async () => { const l = await mockCalls(page, 'listEvents'); return l.at(-1)?.opts.calendarIds; }).toEqual(['cal-a']);
    await page.locator('[data-cal="cal-a"]').click(); // 全オフ
    await expect.poll(async () => (await ls(page)).calendarIds).toEqual([]);
    await expect(page.locator('[data-cal="cal-a"]')).toHaveAttribute('aria-checked', 'false');
        await page.reload();
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator('#m-cal-ip [aria-checked="true"]')).toHaveCount(0);
    expect((await ls(page)).enabled).toBe(true);
    expect(await mockCalls(page, 'listEvents')).toHaveLength(0); // 全オフでは読まない
    for (const m of WRITE_METHODS) expect(await mockCalls(page, m)).toHaveLength(0);
  });

  test('カレンダーの増減・改名: 増えた分は未選択、消えた id は掃除、名前は新しいものを出す', async ({ page }) => {
    await setup(page, { link: { version: 1, enabled: true, enabledMig: true, calendarIds: ['cal-a', 'cal-gone'], selectionInitialized: true } });
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator('#m-cal-ip [aria-checked="true"]')).toHaveCount(1);
    expect((await ls(page)).calendarIds).toEqual(['cal-a']);
    await page.evaluate(() => { window.__mock.cals = [...window.__mock.cals.filter((c) => c.id !== 'cal-b'), { id: 'cal-n', title: '新規', color: '#111111', sourceId: 's-g', source: 'Gmail', sourceType: 'caldav', allowsModify: true }].map((c) => (c.id === 'cal-a' ? { ...c, title: '仕事（改）' } : c)); });
    await page.locator('#m-back').click(); await page.locator('#m-back').click();
    await openMenu(page, 'calendar');
    await expect(page.locator('[data-cal="cal-b"]')).toHaveCount(0);
    await expect(page.locator('[data-cal="cal-n"]')).toHaveAttribute('aria-checked', 'false'); // 以降の増加分は未選択
    await expect(page.locator('[data-cal="cal-a"] .cname')).toHaveText('仕事（改）');
  });

  test('許可の拒否→設定アプリで許可して復帰: 案内が消えて一覧が出る', async ({ page }) => {
    await setup(page, { perm: 'denied' });
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-cal-ip')).toContainText('設定アプリで許可すると使えます。');
    await expect(rows(page)).toHaveCount(0);
    await page.locator('#lk-settings').click();
    expect(await mockCalls(page, 'openSettings')).toHaveLength(1);
    await page.evaluate(() => { window.__mock.perm = 'granted'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('#m-back').click(); await page.locator('#m-back').click();
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    await expect(page.locator('#m-cal-ip')).not.toContainText('設定アプリで許可');
  });

  test('Google の案内: 手順を表示し、設定を開く。開けない時は手動の案内。Gmail 追加後は source 別一覧と追加先に出る', async ({ page }) => {
    await setup(page, { perm: 'granted' });
    await openMenu(page, 'google');
    await expect(page.locator('#m-gsteps li')).toHaveCount(4);
    await page.locator('#m-gset').click();
    expect(await mockCalls(page, 'openSettings')).toHaveLength(1);
    await expect(page.locator('#m-gmsg')).toBeHidden();
    await page.evaluate(() => { window.__mock.openedResult = false; });
    await page.locator('#m-gset').click();
    expect(await mockCalls(page, 'openSettings')).toHaveLength(2);
    await expect(page.locator('#m-gmsg')).toContainText('「設定」アプリから');
    // Gmail を追加して復帰
    await page.evaluate(() => { window.__mock.cals = [...window.__mock.cals, { id: 'cal-gm', title: 'Gmail予定', color: '#0b8043', sourceId: 's-gm', source: 'work@example.com', sourceType: 'caldav', allowsModify: true }]; window.__mock.listeners.calendarChanged?.({}); document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('#m-back').click();
    await page.locator('[data-go="calendar"]').click();
    await expect(page.locator('#m-cal-ip .calsec', { hasText: 'work@example.com' })).toBeVisible();
    await expect(page.locator('[data-cal="cal-gm"]')).toHaveCount(1);
    await page.locator('#m-dest').click();
    await expect(page.locator('#m-destpop')).not.toContainText('Gmail予定'); // 表示（✓）にするまで候補に出ない
    await page.locator('#m-destpop .dback').click();
    await page.locator('[data-cal="cal-gm"]').click();
    await page.locator('#m-dest').click();
    await expect(page.locator('#m-destpop')).toContainText('Gmail予定');
  });

  test('空の一覧・取得失敗: 案内を出し、落ちない', async ({ page }) => {
    await setup(page, { cals: [] });
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-cal-ip')).toContainText('表示できる iPhone のカレンダーがありません。');
    await expect(page.locator('#m-dest')).toBeVisible();
  });
  test('取得失敗でも Duo の段と追加先は使える', async ({ page }) => {
    await setup(page, { listFail: true });
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-cal-duo [data-cvis]').first()).toBeVisible();
    await expect(page.locator('#m-dest')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });

  test('Duo の段: 最後の1つの✓は外せない（揺れてトースト）。他は外せて保持される', async ({ page }) => {
    await setup(page, { perm: 'denied' });
    await openMenu(page, 'calendar');
    const duo = page.locator('#m-cal-duo [data-cvis]');
    const n = await duo.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n - 1; i++) await duo.nth(i).click();
    await expect(page.locator('#m-cal-duo [aria-checked="true"]')).toHaveCount(1);
    await duo.nth(n - 1).click();
    await expect(page.locator('#native-toast')).toContainText('カテゴリを1つは表示してください');
    await expect(page.locator('#m-cal-duo [aria-checked="true"]')).toHaveCount(1);
    const cats = await page.evaluate(async () => (await import('/js/db.js')).listCategories());
    expect(cats.filter((c) => !c.hidden)).toHaveLength(1);
  });

  test('追加先の行: 同じ一覧から選び、再起動後も保持。非表示の先は出ない', async ({ page }) => {
    await setup(page);
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    await page.locator('[data-cal="cal-g"]').click(); // 非表示にする
    await page.locator('#m-dest').click();
    await expect(page.locator('#m-destpop .dopt[data-sdid="cal-r"]')).toHaveCount(0); // 表示のみは出ない
    await expect(page.locator('#m-destpop .dopt[data-sdid="cal-g"]')).toHaveCount(0); // 非表示は出ない
    await expect(page.locator('#m-destpop .dhid')).toHaveCount(0);
    await page.locator('#m-destpop .dopt[data-sdid="cal-a"]').click();
    expect((await ls(page)).defaultDest).toMatchObject({ type: 'iphone', id: 'cal-a' });
    await page.locator('[data-cal="cal-g"]').click(); // 表示に戻す
    await expect(page.locator('#m-dest')).toContainText('仕事');
    await page.reload();
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-dest')).toContainText('仕事');
    expect((await ls(page)).defaultDest).toMatchObject({ type: 'iphone', id: 'cal-a' });
  });

  test('リマインダーの段は無い（タスクは Duo 内保存。リスト・許可の設定を持たない）', async ({ page }) => {
    await setup(page, { remLists: [{ id: 'l1', title: '買い物', color: '#ff9500', source: 'iCloud', allowsModify: true, isDefault: true }] });
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-cal-rem')).toHaveCount(0); // リスト段そのものが無い
    await expect(page.locator('[data-tkshow]')).toHaveCount(0);
    for (const m of WRITE_METHODS) expect(await mockCalls(page, m)).toHaveLength(0);
  });

  test('開いた横・閉じた画面でも一覧が帯や折り目に隠れない', async ({ page }) => {
    await setup(page);
    await page.setViewportSize(SIZES.openLandscape);
    await openMenu(page, 'calendar');
    await expect(rows(page)).toHaveCount(5);
    const box = await page.locator('#menu').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(SIZES.openLandscape.width / 2);
    await expect(page.locator('#m-dest')).toBeVisible();
  });

  test('Duo 段の編集（追加・改名・並替・削除・取消）では iPhone 側の変更 API を呼ばず、外部の✓も変わらない', async ({ page }) => {
    await setup(page, { link: { enabled: true, enabledMig: true, calendarIds: ['cal-a'], selectionInitialized: true } });
    await openMenu(page, 'calendar');
    const before = await ls(page);
    await page.locator('#m-cedit').click();
    await page.locator('#m-cal-duo .crow.edit', { hasText: '家族' }).locator('[data-cup]').click();
    await page.locator('#m-cal-duo .crow.edit', { hasText: '外出' }).locator('[data-cedit]').click();
    await page.locator('#cat-name').fill('おでかけ');
    await page.locator('#cat-close').click();
    await page.locator('#m-cal-duo .crow.edit', { hasText: 'おでかけ' }).locator('[data-cdel]').click();
    await page.locator('[data-cdelgo]').click();
    await page.locator('[data-cundo]').click();
    await expect(page.locator('#m-cal-duo .crow.edit .cname')).toHaveText(['仕事', '家族', 'プライベート', 'おでかけ', 'その他']);
    // 外部のカレンダーの行はそのまま（編集の対象ではない）
    await page.locator('#m-cedit').click();
    await expect(page.locator('#m-cal-ip [data-cal="cal-a"]')).toHaveAttribute('aria-checked', 'true');
    expect(await ls(page)).toEqual(before);
    for (const m of ['createEvent', 'createEvents', 'updateEvent', 'deleteEvent', 'deleteExternalEvent', 'createReminder', 'updateReminder', 'deleteReminder', 'setReminderDone', 'listReminders', 'listReminderLists', 'reminderPermission', 'requestReminderPermission']) expect(await mockCalls(page, m)).toHaveLength(0);
  });
});

// 第16版 PR1: 設定側の追加先一覧も、長いときは箱の中でスクロールして最後の候補まで選べる（DP-1）。
test('DP-1 設定 › 新しい予定の追加先: 20候補でも下まで届き、最後を選べる', async ({ page }) => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `cal-m${i}`, title: `予備${String(i).padStart(2, '0')}`, color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: i === 0 }));
  await setup(page, { cals: many });
  await openMenu(page, 'calendar');
  await page.locator('#m-dest').click();
  const pop = page.locator('#m-destpop');
  await expect(pop).toBeVisible();
  const m = await pop.evaluate((e) => ({ ov: getComputedStyle(e).overflowY, sh: e.scrollHeight, ch: e.clientHeight }));
  expect(m.ov).toBe('auto');
  expect(m.sh).toBeGreaterThan(m.ch); // ページ全体が1本のスクロール
  const last = pop.locator('[data-sdid="cal-m19"]');
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(pop).toBeHidden(); // 0.15秒後に設定 › カレンダーへ戻る
  await expect(page.locator('#m-dest')).toContainText('予備19');
  expect((await ls(page)).defaultDest).toEqual({ type: 'iphone', id: 'cal-m19' });
});

test('PR4 追加先ページ: 戻る・Escape では保存せず、下層から戻っても設定画面に戻る', async ({ page }) => {
  await setup(page);
  await openMenu(page, 'calendar');
  const before = (await ls(page)).defaultDest;
  const pop = page.locator('#m-destpop');
  await page.locator('#m-dest').click();
  await expect(pop).toBeVisible();
  await expect(pop.locator('.dback')).toBeVisible();
  await pop.locator('.dback').click();
  await expect(pop).toBeHidden();
  expect((await ls(page)).defaultDest).toEqual(before);
  await page.locator('#m-dest').click();
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(page.locator('#menu')).toHaveJSProperty('open', true); // 設定は閉じない
  await expect(page.locator('#m-title')).toHaveText('カレンダー');
  expect((await ls(page)).defaultDest).toEqual(before);
  await page.locator('#m-dest').click();
  await pop.locator('.dopt[data-sdid="cal-a"]').click();
  await expect(pop).toBeHidden();
  expect((await ls(page)).defaultDest).toMatchObject({ type: 'iphone', id: 'cal-a' });
  await expect(page.locator('#m-back')).toBeEnabled(); // 戻ったあとは通常操作
});
