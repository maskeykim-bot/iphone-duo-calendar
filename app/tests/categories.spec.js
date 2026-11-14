import { test, expect } from '@playwright/test';
import { CAT_IDS, LEGACY, DEFAULTS_NEW } from '../js/categories.js';
import { openApp, seed, dbEvents, ev, tab, catId, SIZES } from './helpers.js';

const dbCats = (page) => page.evaluate(async () => (await import('/js/db.js')).listCategories());
const openCats = async (page) => {
  await page.locator('[data-act="menu"]:visible').first().click();
  await page.locator('[data-m="cats"]').click();
  await expect(page.locator('#cats')).toBeVisible();
};
const rowOf = (page, name) => page.locator('#cat-body .catrow', { hasText: name });

test.describe('新規インストールの既定カテゴリ', () => {
  test('仕事・プライベート・家族・外出・その他の5つ（確定パレット）', async ({ page }) => {
    await openApp(page);
    const cats = await dbCats(page);
    expect(cats.map((c) => [c.name, c.color, c.order, c.hidden])).toEqual([
      ['仕事', '#2f5f8a', 0, false], ['プライベート', '#8a4b6b', 1, false], ['家族', '#2e6b5a', 2, false], ['外出', '#87500f', 3, false], ['その他', '#5a5e62', 4, false],
    ]);
    expect(cats.map((c) => c.id)).toEqual(DEFAULTS_NEW.map((c) => c.id));
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#f-cat option')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他', 'カテゴリを編集…']);
    await expect(page.locator('#f-cat')).toHaveValue(CAT_IDS.work);
  });
});

test.describe('DB v2 → v3 移行', () => {
  const v2 = [
    { id: 'm1', title: '仕事の予定', cat: 'work', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
    { id: 'm2', title: '私用', cat: 'private', all: false, start: '2026-11-12T12:00', end: '2026-11-12T13:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
    { id: 'm3', title: 'ゴルフ', cat: 'golf', all: true, start: '2026-11-13T00:00', end: '2026-11-15T23:59', place: '軽井沢', notes: '', recurrence: null, exdates: [], overrides: {} },
    { id: 'm4', title: '指標', cat: 'economy', all: false, start: '2026-11-12T22:30', end: '2026-11-12T23:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
    { id: 'm5', title: '毎週', cat: 'work', all: false, start: '2026-11-09T09:00', end: '2026-11-09T10:00', place: '', notes: '',
      recurrence: { freq: 'weekly', interval: 1, byDay: [1], count: null, until: null }, exdates: ['2026-11-16T09:00'],
      overrides: { '2026-11-23T09:00': { title: '毎週・変更', cat: 'golf', all: false, start: '2026-11-23T10:00', end: '2026-11-23T11:00', place: '', notes: '' } } },
    { id: 'm6', title: '不明な種類', cat: 'xyz', all: false, start: '2026-11-12T15:00', end: '2026-11-12T16:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
  ];
  const makeV2 = (page, name, { preCats = null } = {}) => page.evaluate(({ list, name, preCats }) => new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 2);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('events', { keyPath: 'id' });
      s.createIndex('start', 'start');
      r.result.createObjectStore('meta', { keyPath: 'key' });
      if (preCats) { const c = r.result.createObjectStore('categories', { keyPath: 'id' }); c.createIndex('order', 'order'); }
    };
    r.onsuccess = () => {
      const stores = preCats ? ['events', 'categories'] : ['events'];
      const tx = r.result.transaction(stores, 'readwrite');
      list.forEach((e) => tx.objectStore('events').put(e));
      (preCats || []).forEach((c) => tx.objectStore('categories').put(c));
      tx.oncomplete = () => { r.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  }), { list: v2, name, preCats });
  const raw = (page, name) => page.evaluate((name) => new Promise((res) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => {
      const g = r.result.transaction('events').objectStore('events').getAll();
      g.onsuccess = () => res({ version: r.result.version, rows: g.result });
    };
  }), name);

  test('固定の4カテゴリが名前・色のまま作られ、予定は1件も失われず categoryId に変換される', async ({ page }) => {
    await page.goto('/manifest.json');
    await makeV2(page, 'duo-calendar-mig3');
    await openApp(page, undefined, '?ns=mig3&nosw');
    const cats = await page.evaluate(async () => (await (await import('/js/db.js')).listCategories()));
    // 固定の4つ＋「不明な種類」用の未分類。家族・外出・その他は足さない。
    expect(cats.map((c) => [c.name, c.color])).toEqual([
      [LEGACY.work.name, LEGACY.work.color], [LEGACY.private.name, LEGACY.private.color], [LEGACY.golf.name, LEGACY.golf.color], [LEGACY.economy.name, LEGACY.economy.color], ['未分類', '#68716a'],
    ]);
    expect(cats.slice(0, 4).map((c) => c.id)).toEqual([CAT_IDS.work, CAT_IDS.private, CAT_IDS.golf, CAT_IDS.economy]);
    const r = await raw(page, 'duo-calendar-mig3');
    expect(r.version).toBe(3);
    expect(r.rows).toHaveLength(v2.length);
    for (const row of r.rows) { expect(typeof row.categoryId).toBe('string'); expect(row).not.toHaveProperty('cat'); }
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by.m1.categoryId).toBe(CAT_IDS.work);
    expect(by.m3.categoryId).toBe(CAT_IDS.golf);
    expect(by.m4.categoryId).toBe(CAT_IDS.economy);
    expect(by.m6.categoryId).toBe(CAT_IDS.none);
    expect(by.m5.overrides['2026-11-23T09:00'].categoryId).toBe(CAT_IDS.golf);
    expect(by.m5.overrides['2026-11-23T09:00']).not.toHaveProperty('cat');
    expect(by.m5.exdates).toEqual(['2026-11-16T09:00']);
    // 画面の色は従来と同じ（経済指標も編集できる普通のカテゴリとして残る）
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event', { hasText: '仕事の予定' })).toBeVisible();
    expect(await page.locator('.daylist .event', { hasText: '仕事の予定' }).evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#375a7f');
    expect(await page.locator('.daylist .event', { hasText: '指標' }).evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#825a23');
    await expect(page.locator('.daylist .event', { hasText: '指標' }).locator('.tag')).toHaveText('経済指標');
    // 再読み込みしても重複しない
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await page.evaluate(async () => (await (await import('/js/db.js')).listCategories()).length)).toBe(5);
    expect((await raw(page, 'duo-calendar-mig3')).rows).toHaveLength(v2.length);
  });

  test('冪等: すでにあるカテゴリは上書きせず、重複も作らない', async ({ page }) => {
    await page.goto('/manifest.json');
    await makeV2(page, 'duo-calendar-mig3b', { preCats: [{ id: CAT_IDS.work, name: '私の仕事', color: '#123456', order: 7, hidden: true, createdAt: 1, updatedAt: 1 }] });
    await openApp(page, undefined, '?ns=mig3b&nosw');
    const cats = await page.evaluate(async () => (await (await import('/js/db.js')).listCategories()));
    expect(cats.filter((c) => c.id === CAT_IDS.work)).toHaveLength(1);
    expect(cats.find((c) => c.id === CAT_IDS.work)).toMatchObject({ name: '私の仕事', color: '#123456', hidden: true });
    expect(cats.filter((c) => [CAT_IDS.private, CAT_IDS.golf, CAT_IDS.economy].includes(c.id))).toHaveLength(3);
    expect((await raw(page, 'duo-calendar-mig3b')).rows).toHaveLength(v2.length);
  });
});

test.describe('カテゴリ編集パネル', () => {
  test('メニューから開く。一覧は名前・色・件数・表示スイッチ', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', 'A', '2026-11-12T10:00', '2026-11-12T11:00'), ev('b', 'B', '2026-11-12T12:00', '2026-11-12T13:00')]);
    await openCats(page);
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他']);
    await expect(rowOf(page, '仕事').locator('.ccount')).toHaveText('2件');
    await expect(rowOf(page, '家族').locator('.ccount')).toHaveText('0件');
    await expect(rowOf(page, '仕事').locator('[role=switch]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#cat-close').click();
    await expect(page.locator('#cats')).toBeHidden();
  });

  test('追加・改名・色の変更（再読み込み後も保たれ、予定の表示に反映される）', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '予定A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.family })]);
    await openCats(page);
    await page.locator('[data-cat-add]').click();
    await page.locator('#cat-name').fill('ヨガ');
    await page.locator('.swatch[aria-label="紫"]').click();
    await expect(page.locator('.swatch[aria-label="紫"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cat-close').click(); // 完了
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他', 'ヨガ']);
    // 改名と色変更
    await rowOf(page, '家族').locator('.catmain').click();
    await page.locator('#cat-name').fill('ファミリー');
    await page.locator('.swatch[aria-label="赤"]').click();
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-body .catrow .cname')).toContainText(['仕事', 'プライベート', 'ファミリー', '外出', 'その他', 'ヨガ']);
    await page.locator('#cat-close').click();
    const cats = await dbCats(page);
    expect(cats.find((c) => c.name === 'ヨガ')).toMatchObject({ color: '#5e4c8e', order: 5, hidden: false });
    expect(cats.find((c) => c.id === CAT_IDS.family)).toMatchObject({ name: 'ファミリー', color: '#a13a3a' });
    // 予定は id で結ばれているので、改名しても外れず、新しい名前・色で表示される
    await tab(page, '日').click();
    const card = page.locator('.daylist .event', { hasText: '予定A' });
    await expect(card.locator('.tag')).toHaveText('ファミリー');
    expect(await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#a13a3a');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event', { hasText: '予定A' }).locator('.tag')).toHaveText('ファミリー');
    await tab(page, '月').click();
    await expect(page.locator('.legend')).toContainText('ヨガ');
  });

  test('名前の検証: 空・重複・21文字以上は保存できない', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await page.locator('[data-cat-add]').click();
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toContainText('カテゴリ名を入力');
    await page.locator('#cat-name').fill('仕事');
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toContainText('同じ名前');
    expect(await page.locator('#cat-name').getAttribute('maxlength')).toBe('20');
    expect((await dbCats(page)).length).toBe(5);
  });

  test('並べ替え: 上へ・下へ。編集シートの選択肢と凡例にも反映され、再読み込み後も保たれる', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await rowOf(page, '家族').locator('[data-cat-up]').click();
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['仕事', '家族', 'プライベート', '外出', 'その他']);
    await rowOf(page, '仕事').locator('[data-cat-down]').click();
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['家族', '仕事', 'プライベート', '外出', 'その他']);
    await expect(page.locator('[data-cat-up]').first()).toBeDisabled();
    await expect(page.locator('[data-cat-down]').last()).toBeDisabled();
    expect((await dbCats(page)).map((c) => [c.name, c.order])).toEqual([['家族', 0], ['仕事', 1], ['プライベート', 2], ['外出', 3], ['その他', 4]]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    await expect(page.locator('.legend span')).toHaveText(['家族', '仕事', 'プライベート', '外出', 'その他']);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#f-cat')).toHaveValue(CAT_IDS.family); // 新規の既定は先頭
  });

  test('非表示: 月・日の表示から隠す（予定は消さない）。凡例からも外れ、戻すと再び出る', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '仕事A', '2026-11-12T10:00', '2026-11-12T11:00'), ev('b', '家族B', '2026-11-12T12:00', '2026-11-12T13:00', { categoryId: CAT_IDS.family })]);
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event')).toHaveCount(2);
    await openCats(page);
    await rowOf(page, '家族').locator('[role=switch]').click();
    await expect(rowOf(page, '家族').locator('[role=switch]')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#cat-hidden')).toHaveText('1件のカテゴリを非表示中');
    await page.locator('#cat-close').click();
    await expect(page.locator('.daylist .event')).toHaveCount(1);
    await expect(page.locator('.daylist .event')).toContainText('仕事A');
    await tab(page, '月').click();
    await expect(page.locator('.legend')).not.toContainText('家族');
    expect(await dbEvents(page)).toHaveLength(2);
    await openCats(page);
    await rowOf(page, '家族').locator('[role=switch]').click();
    await page.locator('#cat-close').click();
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event')).toHaveCount(2);
  });

  test('削除: 予定の移し先を選ばせ、予定（繰り返しの個別変更を含む）を移す。再読み込み後も維持', async ({ page }) => {
    await openApp(page);
    await seed(page, [
      ev('a', '外出A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.out }),
      ev('b', '外出B', '2026-11-12T12:00', '2026-11-12T13:00', { categoryId: CAT_IDS.out }),
      ev('r', '毎週', '2026-11-09T09:00', '2026-11-09T10:00', { recurrence: { freq: 'weekly', interval: 1, byDay: [1], count: null, until: null },
        overrides: { '2026-11-16T09:00': { title: '変更回', categoryId: CAT_IDS.out, all: false, start: '2026-11-16T09:00', end: '2026-11-16T10:00', place: '', notes: '' } } }),
    ]);
    await openCats(page);
    await rowOf(page, '外出').locator('.catmain').click();
    await page.locator('[data-cat-del]').click();
    await expect(page.locator('.delbox')).toContainText('3件の予定を移すカテゴリ');
    await expect(page.locator('#cat-target')).toHaveValue(CAT_IDS.work); // 既定は一覧の先頭
    await page.locator('#cat-target').selectOption(CAT_IDS.family);
    await page.locator('[data-cat-delgo]').click();
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['仕事', 'プライベート', '家族', 'その他']);
    await expect(rowOf(page, '家族').locator('.ccount')).toHaveText('2件');
    await expect(page.locator('.undobar')).toContainText('「外出」を削除しました');
    await page.locator('#cat-close').click();
    const evs = await dbEvents(page);
    expect(evs).toHaveLength(3);
    expect(evs.filter((e) => e.categoryId === CAT_IDS.family).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(evs.find((e) => e.id === 'r').overrides['2026-11-16T09:00'].categoryId).toBe(CAT_IDS.family);
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event', { hasText: '外出A' }).locator('.tag')).toHaveText('家族');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect((await dbCats(page)).map((c) => c.name)).toEqual(['仕事', 'プライベート', '家族', 'その他']);
    expect((await dbEvents(page)).filter((e) => e.categoryId === CAT_IDS.family)).toHaveLength(2);
  });

  test('削除の「元に戻す」で、カテゴリと予定の所属が元に戻る', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '外出A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.out })]);
    await openCats(page);
    await rowOf(page, '外出').locator('.catmain').click();
    await page.locator('[data-cat-del]').click();
    await page.locator('[data-cat-delgo]').click();
    await page.locator('[data-cat-undo]').click();
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他']);
    expect((await dbEvents(page))[0].categoryId).toBe(CAT_IDS.out);
  });

  test('最後の1件は削除できない／予定のないカテゴリは移し先なしで削除できる', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await rowOf(page, 'その他').locator('.catmain').click();
    await page.locator('[data-cat-del]').click();
    await expect(page.locator('.delbox')).toContainText('予定はありません');
    await expect(page.locator('#cat-target')).toHaveCount(0);
    await page.locator('[data-cat-delgo]').click();
    for (const n of ['外出', '家族', 'プライベート']) {
      await rowOf(page, n).locator('.catmain').click();
      await page.locator('[data-cat-del]').click();
      await page.locator('[data-cat-delgo]').click();
    }
    await expect(page.locator('#cat-body .catrow .cname')).toHaveText(['仕事']);
    await rowOf(page, '仕事').locator('.catmain').click();
    await expect(page.locator('[data-cat-del]')).toBeDisabled();
    await expect(page.locator('#cat-body')).toContainText('カテゴリは1つ以上必要です');
    expect((await dbCats(page)).length).toBe(1);
  });

  test('上限20個: 21個目は追加できない', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      const db = await import('/js/db.js');
      const now = Date.now();
      await db.applyCategoryChanges({ catPuts: Array.from({ length: 15 }, (_, i) => ({ id: `x${i}`, name: `c${i}`, color: '#2f5f8a', order: 10 + i, hidden: false, createdAt: now, updatedAt: now })) });
    });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await openCats(page);
    await expect(page.locator('#cat-body .catrow')).toHaveCount(20);
    await expect(page.locator('[data-cat-add]')).toBeDisabled();
  });

  test('編集シートの「カテゴリを編集…」から作ったカテゴリは、編集中の予定にそのまま入る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await page.locator('#f-title').fill('ヨガ教室');
    await page.locator('#f-cat').selectOption({ label: 'カテゴリを編集…' });
    await expect(page.locator('#cats')).toBeVisible();
    await expect(page.locator('#f-cat')).toHaveValue(CAT_IDS.work); // 選択は「編集…」に残らない
    await page.locator('[data-cat-add]').click();
    await page.locator('#cat-name').fill('ヨガ');
    await page.locator('#cat-close').click();
    await page.locator('#cat-close').click(); // 閉じる
    await expect(page.locator('#cats')).toBeHidden();
    await expect(page.locator('#f-title')).toHaveValue('ヨガ教室');
    await expect(page.locator('#f-cat option:checked')).toHaveText('ヨガ');
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    const [saved] = await dbEvents(page);
    const yoga = (await dbCats(page)).find((c) => c.name === 'ヨガ');
    expect(saved.categoryId).toBe(yoga.id);
  });

  test('編集シートで選んだカテゴリが保存され、別のカテゴリへ変更できる', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await page.locator('#f-title').fill('散歩');
    await page.locator('#f-cat').selectOption(catId('private'));
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    expect((await dbEvents(page))[0].categoryId).toBe(CAT_IDS.private);
  });
});

test.describe('バックアップ読み込みとカテゴリ（旧 cat → id 変換）', () => {
  test('v2 ファイル（経済指標付き）を新規インストールの端末に読み込むと、経済指標カテゴリが追加される', async ({ page }) => {
    await openApp(page);
    const file = { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [
      { id: 'i1', title: '米・物価', cat: 'economy', all: false, start: '2026-11-12T22:30', end: '2026-11-12T23:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
      { id: 'i2', title: '会議', cat: 'work', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
    ] };
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('[data-m="backup"]').click();
    await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.locator('#bk-add').click();
    await expect(page.locator('#backup')).toBeHidden();
    const evs = await dbEvents(page);
    expect(evs.map((e) => [e.id, e.categoryId])).toEqual([['i1', CAT_IDS.economy], ['i2', CAT_IDS.work]]);
    const cats = await dbCats(page);
    expect(cats.map((c) => c.name)).toEqual(['仕事', 'プライベート', '家族', '外出', 'その他', '経済指標']);
    expect(cats.at(-1)).toMatchObject({ id: CAT_IDS.economy, color: '#825a23', order: 5 });
  });

  test('書き出し → 置き換え読み込みで、カスタムカテゴリと予定の所属が往復する', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
      const db = await import('/js/db.js');
      const now = Date.now();
      await db.applyCategoryChanges({ catPuts: [{ id: 'yoga', name: 'ヨガ', color: '#5e4c8e', order: 9, hidden: true, createdAt: now, updatedAt: now }] });
    });
    await seed(page, [ev('y', 'ヨガ教室', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: 'yoga' })]);
    const text = await page.evaluate(async () => {
      const db = await import('/js/db.js'), bk = await import('/js/backup.js');
      return JSON.stringify(bk.buildBackup(await db.listEvents(), { view: 'month', style: 'simple', desk: false }, new Date(), await db.listCategories()));
    });
    await page.evaluate(async () => { const db = await import('/js/db.js'); await db.applyImport({ replace: true, catPuts: [{ id: 'tmp', name: 'tmp', color: '#000000', order: 0, hidden: false, createdAt: 1, updatedAt: 1 }] }); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('[data-m="backup"]').click();
    await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    const cats = await dbCats(page);
    expect(cats.map((c) => c.id)).toEqual([...DEFAULTS_NEW.map((c) => c.id), 'yoga']);
    expect(cats.find((c) => c.id === 'yoga')).toMatchObject({ name: 'ヨガ', color: '#5e4c8e', hidden: true });
    expect((await dbEvents(page))[0].categoryId).toBe('yoga');
  });
});
