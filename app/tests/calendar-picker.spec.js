// 第15版 PR5: 新規予定の「カレンダー」1行（Duo のカテゴリと iPhone の書込可カレンダーを同じ一覧から選ぶ）
import { test, expect } from '@playwright/test';
import { CAT_IDS } from '../js/categories.js';
import { openApp, dbEvents } from './helpers.js';

const CALS = [
  { id: 'cal-a', title: '仕事', color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-h', title: '趣味', color: '#8e24aa', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-g', title: '個人', color: '#d93025', sourceId: 's-g', source: 'Gmail', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-r', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const LINK = (o = {}) => ({ version: 1, enabled: true, enabledMig: true, calendarIds: ['cal-a', 'cal-g', 'cal-r'], selectionInitialized: true, defaultDest: { type: 'duo', id: CAT_IDS.work }, ...o });

async function setup(page, { link = LINK(), cals = CALS, createFail = 0, cats } = {}) {
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
  await openApp(page);
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
    await expect(page.locator('#dest-pop .dopt .dn')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他', '個人', '仕事', '趣味']);
    await expect(page.locator('#dest-pop .dopt[data-did="cal-r"]')).toHaveCount(0); // 読み取り専用は出ない
    await expect(page.locator('#dest-pop .dopt[aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator('#dest-pop .dopt[aria-selected="true"] .dck')).toHaveText('✓');
  });

  test('非表示（設定でオフ）は各段の後ろに「非表示」札つきで並び、選べる。✓とフォーカスが戻る', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await page.locator('#f-dest').click();
    const icloud = page.locator('#dest-pop .dopt[data-dtype="iphone"]');
    await expect(icloud.locator('.dn')).toHaveText(['個人', '仕事', '趣味']); // 趣味（cal-h）は非表示なので iCloud 段の仕事の後ろ
    await expect(page.locator('#dest-pop .dopt[data-did="cal-h"] .dhid')).toHaveText('非表示');
    await page.locator('#dest-pop .dopt[data-did="cal-h"]').click();
    await expect(page.locator('#dest-pop')).toBeHidden();
    await expect(page.locator('#f-dest')).toBeFocused();
    await expect(page.locator('#dest-name')).toHaveText('趣味（iCloud）');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-did="cal-h"] .dck')).toHaveText('✓');
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

  test('非表示のカテゴリにも保存でき、6秒の名前入りの知らせ →「表示する」で✓が戻る', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => { const db = await import('/js/db.js'); const c = (await db.listCategories()).find((x) => x.id === 'cat-family' || x.name === '家族'); await db.putCategory?.({ ...c, hidden: true }); });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await openNew(page);
    await pick(page, CAT_IDS.family);
    await page.locator('#f-title').fill('隠れる');
    await save(page);
    const note = page.locator('#hidden-notice');
    await expect(note).toContainText('「家族」は非表示なので、カレンダーには出ません');
    expect(await dbEvents(page)).toHaveLength(1);
    await note.getByRole('button', { name: '表示する' }).click();
    await openNew(page);
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-did="' + CAT_IDS.family + '"] .dhid')).toHaveCount(0);
  });

  test('非表示の iPhone カレンダーに保存 →「表示する」で calendarIds に戻る', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await pick(page, 'cal-h');
    await page.locator('#f-title').fill('趣味の会');
    await save(page);
    const note = page.locator('#hidden-notice');
    await expect(note).toContainText('「趣味」は非表示なので、カレンダーには出ません');
    await note.getByRole('button', { name: '表示する' }).click();
    expect((await lk(page)).calendarIds).toContain('cal-h');
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

  test('すべて非表示のときは一覧の上に案内を出し、それでも選べる', async ({ page }) => {
    await setup(page, { link: LINK({ calendarIds: [] }) });
    await page.evaluate(async () => { const db = await import('/js/db.js'); for (const c of await db.listCategories()) await db.putCategory?.({ ...c, hidden: true }); });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await openNew(page);
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dnote')).toContainText('すべて非表示になっています');
    await page.locator('#dest-pop .dopt').first().click();
    await expect(page.locator('#dest-pop')).toBeHidden();
  });

  test('Escape は一覧だけ閉じ、シートは残る。外側のタップでも閉じる', async ({ page }) => {
    await setup(page);
    await openNew(page);
    await page.locator('#f-dest').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dest-pop')).toBeHidden();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#f-dest').click();
    await page.locator('#f-title').click();
    await expect(page.locator('#dest-pop')).toBeHidden();
  });
});
