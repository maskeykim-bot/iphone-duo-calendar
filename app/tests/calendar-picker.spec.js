// 第15版 PR5: 新規予定の「カレンダー」1行（Duo のカテゴリと iPhone の書込可カレンダーを同じ一覧から選ぶ）
import { test, expect } from '@playwright/test';
import { CAT_IDS } from '../js/categories.js';
import { openApp, dbEvents, SIZES } from './helpers.js';

const CALS = [
  { id: 'cal-a', title: '仕事', color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-h', title: '趣味', color: '#8e24aa', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-g', title: '個人', color: '#d93025', sourceId: 's-g', source: 'Gmail', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-r', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const LINK = (o = {}) => ({ version: 1, enabled: true, enabledMig: true, calendarIds: ['cal-a', 'cal-g', 'cal-r'], selectionInitialized: true, defaultDest: { type: 'duo', id: CAT_IDS.work }, ...o });

async function setup(page, { link = LINK(), cals = CALS, createFail = 0, cats, size } = {}) {
  await page.addInitScript(({ link, cals, createFail }) => {
    if (!localStorage.getItem('duo-native-cal')) localStorage.setItem('duo-native-cal', JSON.stringify(link));
    const M = window.__mock = { calls: [], created: {}, createFail, listeners: {} };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (p, m, o, cb) => { M.listeners[o.eventName] = cb; return 'cb-1'; },
      nativePromise: async (p, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: cals };
          case 'listEvents': return { events: [] };
          case 'createEvent':
            if (M.createFail > 0) { M.createFail--; throw { code: 'UNAVAILABLE', message: 'boom' }; }
            M.created[opts.requestId] = M.created[opts.requestId] || `new-${Object.keys(M.created).length + 1}`;
            return { eventId: M.created[opts.requestId] };
          default: throw { code: 'UNIMPLEMENTED', message: method };
        }
      },
    };
  }, { link, cals, createFail });
  await openApp(page, size);
  await page.waitForFunction(() => window.__mock.calls.some((c) => c.method === 'listCalendars'));
}
const openNew = async (page) => { await page.locator('[data-act="add"]:visible').first().click(); await expect(page.locator('#editor')).toBeVisible(); };
const create = (page) => page.evaluate(() => window.__mock.calls.filter((c) => c.method === 'createEvent'));
const lk = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal')));
const pick = async (page, id) => { await page.locator('#f-dest').click(); await page.locator(`#dest-pop .dopt[data-did="${id}"]`).click(); };
const save = (page) => page.locator('#editor [type=submit]').click();

test.describe('新規予定のカレンダー選択', () => {
  test('1行だけ。旧カテゴリ・スイッチはなく、一覧は Duo → iPhone（アカウント別・書込可のみ）', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await expect(page.locator('#dest-l')).toBeVisible();
    await expect(page.locator('#f-cat')).toHaveCount(0);
    await expect(page.locator('#f-xadd, #f-xcal, #xadd')).toHaveCount(0);
    await expect(page.locator('#dest-name')).toHaveText('仕事');
    expect((await page.locator('#f-dest').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('#f-dest').click();
    await expect(page.locator('#f-dest')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#dest-pop h4')).toHaveText(['Duo（この端末だけ）', 'iPhone ・ Gmail', 'iPhone ・ iCloud']);
    await expect(page.locator('#dest-pop .dopt .dn')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他', '個人', '仕事']); // 趣味（非表示）は出ない
    await expect(page.locator('#dest-pop .dopt[data-did="cal-r"]')).toHaveCount(0); // 読み取り専用は出ない
    await expect(page.locator('#dest-pop .dopt[aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator('#dest-pop .dopt[aria-selected="true"] .dck')).toHaveText('✓');
  });

  test('非表示（設定でオフ）のカレンダーは候補に出ない。表示中だけ選べて✓とフォーカスが戻る', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await page.locator('#f-dest').click();
    const icloud = page.locator('#dest-pop .dopt[data-dtype="iphone"]');
    await expect(icloud.locator('.dn')).toHaveText(['個人', '仕事']); // 趣味（cal-h）は非表示なので出ない
    await expect(page.locator('#dest-pop .dopt[data-did="cal-h"]')).toHaveCount(0);
    await expect(page.locator('#dest-pop .dhid')).toHaveCount(0);
    await page.locator('#dest-pop .dopt[data-did="cal-g"]').click();
    await expect(page.locator('#dest-pop')).toBeHidden();
    await expect(page.locator('#f-dest')).toBeFocused();
    await expect(page.locator('#dest-name')).toHaveText('個人（Gmail）');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-did="cal-g"] .dck')).toHaveText('✓');
  });

  test('Duo のカテゴリを選ぶと createEvent を呼ばず、categoryId で1件だけ保存。設定の追加先は変わらない', async ({ page }) => {
    await setup(page, { link: LINK({ defaultDest: { type: 'iphone', id: 'cal-a' } }) });
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('仕事（iCloud）');
    await pick(page, CAT_IDS.family);
    await page.locator('#f-title').fill('家族の食事');
    await save(page);
    await expect(page.locator('#editor')).toBeHidden();
    expect(await create(page)).toHaveLength(0);
    const evs = await dbEvents(page);
    expect(evs).toHaveLength(1);
    expect(evs[0].categoryId).toBe(CAT_IDS.family);
    expect(evs[0].nativeLink ?? null).toBeNull();
    expect((await lk(page)).defaultDest).toEqual({ type: 'iphone', id: 'cal-a' });
  });

  test('iPhone のカレンダーを選ぶと createEvent 1回・categoryId は none・nativeLink あり', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await pick(page, 'cal-g');
    await page.locator('#f-title').fill('歯医者');
    await save(page);
    await expect(page.getByRole('status').first()).toBeVisible();
    await expect.poll(async () => (await create(page)).length).toBe(1);
    const [c] = await create(page);
    expect(c.opts).toMatchObject({ calendarId: 'cal-g', title: '歯医者' });
    const evs = await dbEvents(page);
    expect(evs).toHaveLength(1);
    expect(evs[0].categoryId).toBe(CAT_IDS.none);
    await expect.poll(async () => (await dbEvents(page))[0].nativeLink?.state).toBe('linked');
    expect((await lk(page)).defaultDest).toEqual({ type: 'duo', id: CAT_IDS.work });
  });

  test('作成に失敗しても予定は残り、再試行は同じ requestId で二重作成しない', async ({ page }) => {
    await setup(page, { createFail: 1 });
    await openNew(page);
    await pick(page, 'cal-a');
    await page.locator('#f-title').fill('出張');
    await save(page);
    await expect(page.locator('#xretry')).toBeVisible();
    expect((await dbEvents(page))[0].nativeLink.state).toBe('pending');
    await page.locator('#xr-retry').click();
    await expect.poll(async () => (await dbEvents(page))[0].nativeLink.state).toBe('linked');
    const cs = await create(page);
    expect(cs).toHaveLength(2);
    expect(cs[1].opts.requestId).toBe(cs[0].opts.requestId);
    expect(await page.evaluate(() => Object.keys(window.__mock.created).length)).toBe(1);
    expect(await dbEvents(page)).toHaveLength(1);
  });

  test('非表示のカテゴリは候補に出ず、非表示の既定先でも新規は表示中の先へ。保存後の知らせも出ない', async ({ page }) => {
    await setup(page, { link: LINK({ defaultDest: { type: 'duo', id: CAT_IDS.family } }) });
    await page.evaluate(async () => { const db = await import('/js/db.js'); const c = (await db.listCategories()).find((x) => x.name === '家族'); await db.putCategory?.({ ...c, hidden: true }); });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await openNew(page);
    await expect(page.locator('#dest-name')).not.toHaveText('家族'); // resolveDest が表示中へ代替
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-did="' + CAT_IDS.family + '"]')).toHaveCount(0);
    await page.locator('#dest-pop .dopt').first().click();
    await page.locator('#f-title').fill('見える');
    await save(page);
    await expect(page.locator('#hidden-notice')).toHaveCount(0);
    expect((await dbEvents(page))[0].categoryId).not.toBe(CAT_IDS.family);
    expect((await lk(page)).defaultDest).toEqual({ type: 'duo', id: CAT_IDS.family }); // 設定値は書き換えない
  });

  test('旧下書き（categoryId / xadd / xcal）を追加先へ読み替え、本文を保つ', async ({ page }) => {
    await setup(page);
    await page.evaluate(() => sessionStorage.setItem('duo.draft.v1', JSON.stringify({ editing: null, title: '下書き', categoryId: 'cat-family', all: false, start: '2026/11/20 10:00', end: '2026/11/20 11:00', place: '駅', notes: 'メモ', rfreq: 'none', rbyday: [], rend: 'none', rcount: '10', runtil: '', ropen: false, xadd: true, xcal: 'cal-g' })));
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-title')).toHaveValue('下書き');
    await expect(page.locator('#f-place')).toHaveValue('駅');
    await expect(page.locator('#dest-name')).toHaveText('個人（Gmail）');
  });

  test('すべて非表示のときは案内だけを出し、候補は空になる', async ({ page }) => {
    await setup(page, { link: LINK({ calendarIds: [] }) });
    await page.evaluate(async () => { const db = await import('/js/db.js'); for (const c of await db.listCategories()) await db.putCategory?.({ ...c, hidden: true }); });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await openNew(page);
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dnote')).toContainText('すべて非表示になっています');
    await expect(page.locator('#dest-pop .dopt')).toHaveCount(0);
  });

  test('Escape と「‹ 戻る」は候補ページだけ閉じ、シートと値は残る（取消時は値不変）', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await page.locator('#f-title').fill('そのまま');
    const before = await page.locator('#dest-name').textContent();
    await page.locator('#f-dest').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dest-pop')).toBeHidden();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#f-dest').click();
    const back = page.locator('#dest-pop .dback');
    expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await back.boundingBox()).width).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page.locator('#dest-pop')).toBeHidden();
    await expect(page.locator('#f-dest')).toBeFocused();
    await expect(page.locator('#f-title')).toHaveValue('そのまま');
    await expect(page.locator('#dest-name')).toHaveText(before);
  });
});

// 第16版 PR3: 候補は編集シートの中の専用ページ。ページ全体が1本のスクロールで、最後の候補まで選べる（DP-1）。
const MANY = Array.from({ length: 20 }, (_, i) => ({ id: `cal-m${i}`, title: `予備${String(i).padStart(2, '0')}`, color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: i === 0 }));
for (const [name, size] of [['閉じた', SIZES.closedPortrait], ['開いた縦', SIZES.openPortrait669], ['見開き', SIZES.openLandscape951]]) {
  test(`DP-1 ${name}: 20候補のページが末尾まで届き、最後の候補を選べる。背景・フォームは動かない`, async ({ page }) => {
    await setup(page, { cals: MANY, link: LINK({ calendarIds: MANY.map((c) => c.id), defaultDest: { type: 'iphone', id: 'cal-m0' } }), size });
    await openNew(page);
    await page.locator('#f-title').fill('入力済み');
    await page.locator('#f-dest').click();
    const pop = page.locator('#dest-pop');
    await expect(pop).toBeVisible();
    const m = await pop.evaluate((e) => ({ ov: getComputedStyle(e).overflowY, sh: e.scrollHeight, ch: e.clientHeight, oc: getComputedStyle(e).overscrollBehaviorY, dh: document.querySelector('#editor').clientHeight }));
    expect(m.ov).toBe('auto');
    expect(m.oc).toBe('contain');
    expect(m.sh).toBeGreaterThan(m.ch);
    expect(m.ch).toBeGreaterThanOrEqual(m.dh - 2); // シートの下端まで使う
    const rows = await pop.locator('.dopt').evaluateAll((l) => l.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(44);
    const before = await page.locator('#editor').evaluate((e) => e.scrollTop);
    const fb = await page.locator('.fbody').evaluate((e) => e.scrollTop);
    await pop.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    expect(await pop.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator('#editor').evaluate((e) => e.scrollTop)).toBe(before);
    expect(await page.locator('.fbody').evaluate((e) => e.scrollTop)).toBe(fb);
    const last = page.locator('#dest-pop .dopt[data-did="cal-m19"]');
    await expect(last).toBeInViewport();
    await last.click();
    await expect(page.locator('#dest-pop .dopt[data-did="cal-m19"] .dck')).toHaveText('✓');
    await expect(pop).toBeHidden();
    await expect(page.locator('#dest-name')).toContainText('予備19');
    await expect(page.locator('#f-title')).toHaveValue('入力済み');
  });
}

test('PR3: 開いたとき選択行が見える位置にあり、選ぶと約0.15秒で戻って保存の引数は従来どおり', async ({ page }) => {
  await setup(page, { cals: MANY, link: LINK({ calendarIds: MANY.map((c) => c.id), defaultDest: { type: 'iphone', id: 'cal-m15' } }) });
  await openNew(page);
  await page.locator('#f-dest').click();
  await expect(page.locator('#dest-pop .dopt[data-did="cal-m15"]')).toBeInViewport();
  await page.locator('#dest-pop .dopt[data-did="cal-m17"]').click();
  await expect(page.locator('#dest-pop')).toBeHidden();
  await page.locator('#f-title').fill('引数');
  await save(page);
  await expect.poll(async () => (await create(page)).length).toBeGreaterThan(0);
  expect((await create(page))[0].opts.calendarId).toBe('cal-m17');
});

test('PR3: 下端の「表示するカレンダーを選ぶ ›」から設定へ、戻ると未保存フォームへ戻る', async ({ page }) => {
  await setup(page);
  await openNew(page);
  await page.locator('#f-title').fill('途中');
  await page.locator('#f-dest').click();
  await page.locator('#dest-pop .dset').click();
  await expect(page.locator('#dest-pop')).toBeHidden();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#m-title')).toHaveText('カレンダー');
  await page.locator('#m-back').click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#f-title')).toHaveValue('途中');
  await expect(page.locator('#f-dest')).toBeFocused();
});
