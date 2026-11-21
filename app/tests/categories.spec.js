import { test, expect } from '@playwright/test';
import { CAT_IDS, LEGACY, DEFAULTS_NEW } from '../js/categories.js';
import { SCHEMA_VERSION } from '../js/db.js';
import { openApp, seed, dbEvents, ev, tab, catId, SIZES, openMenu, addEvent, pickDest, clickSettings } from './helpers.js';
// カテゴリの凡例は設定メニューの中（月には常設しない）
const legendCheck = async (page, fn) => { await openMenu(page, 'calendar'); await fn(page.locator('#menu .legend')); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); };

const dbCats = (page) => page.evaluate(async () => (await import('/js/db.js')).listCategories());
const openCats = async (page) => {
  await clickSettings(page);
  await page.locator('#menu [data-go="calendar"]').click();
  await page.locator('#m-cedit').click();
  await expect(page.locator('#m-cedit')).toHaveText('完了');
};
const rowOf = (page, name) => page.locator('#m-cal-duo .crow.edit', { hasText: name });
const names = (page) => expect(page.locator('#m-cal-duo .crow.edit .cname'));
const delRow = async (page, name) => { await rowOf(page, name).locator('[data-cdel]').click(); };

test.describe('新規インストールの既定カテゴリ', () => {
  test('仕事・プライベート・家族・外出・その他の5つ（確定パレット）', async ({ page }) => {
    await openApp(page);
    const cats = await dbCats(page);
    expect(cats.map((c) => [c.name, c.color, c.order, c.hidden])).toEqual([
      ['仕事', '#2f5f8a', 0, false], ['プライベート', '#8a4b6b', 1, false], ['家族', '#2e6b5a', 2, false], ['外出', '#87500f', 3, false], ['その他', '#5a5e62', 4, false],
    ]);
    expect(cats.map((c) => c.id)).toEqual(DEFAULTS_NEW.map((c) => c.id));
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#f-cat')).toHaveCount(0); // 新規はカレンダー1行
    await expect(page.locator('#dest-name')).toHaveText('仕事');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt .dn')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他']);
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
    // v3 の更新で作った固定4つ＋未分類に、第15版の一度きり移行（起動時）が走る: ゴルフ・経済指標は消え、家族・外出・その他が足される。
    expect(cats.map((c) => [c.name, c.color])).toEqual([
      [LEGACY.work.name, LEGACY.work.color], [LEGACY.private.name, LEGACY.private.color], ['未分類', '#68716a'], ['家族', '#2e6b5a'], ['外出', '#87500f'], ['その他', '#5a5e62'],
    ]);
    expect(cats.slice(0, 2).map((c) => c.id)).toEqual([CAT_IDS.work, CAT_IDS.private]);
    const r = await raw(page, 'duo-calendar-mig3');
    expect(r.version).toBe(SCHEMA_VERSION);
    expect(r.rows).toHaveLength(v2.length);
    for (const row of r.rows) { expect(typeof row.categoryId).toBe('string'); expect(row).not.toHaveProperty('cat'); }
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by.m1.categoryId).toBe(CAT_IDS.work);
    expect(by.m3.categoryId).toBe(CAT_IDS.other); // 旧ゴルフ・経済指標の予定は「その他」へ（件数は不変）
    expect(by.m4.categoryId).toBe(CAT_IDS.other);
    expect(by.m6.categoryId).toBe(CAT_IDS.none);
    expect(by.m5.overrides['2026-11-23T09:00'].categoryId).toBe(CAT_IDS.other);
    expect(by.m5.overrides['2026-11-23T09:00']).not.toHaveProperty('cat');
    expect(by.m5.exdates).toEqual(['2026-11-16T09:00']);
    // 画面の色: 仕事は従来どおり。旧経済指標の予定は「その他」の色
    await tab(page, '日').click();
    await expect(page.locator('.tlev', { hasText: '仕事の予定' })).toBeVisible();
    expect(await page.locator('.tlev', { hasText: '仕事の予定' }).evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#375a7f');
    expect(await page.locator('.tlev', { hasText: '指標' }).evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#5a5e62');
    await expect(page.locator('.tlev', { hasText: '指標' })).toHaveAttribute('aria-label', /、その他/);
    // 再読み込みしても重複しない
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await page.evaluate(async () => (await (await import('/js/db.js')).listCategories()).length)).toBe(6);
    expect((await raw(page, 'duo-calendar-mig3')).rows).toHaveLength(v2.length);
  });

  test('冪等: すでにあるカテゴリは上書きせず、重複も作らない', async ({ page }) => {
    await page.goto('/manifest.json');
    await makeV2(page, 'duo-calendar-mig3b', { preCats: [{ id: CAT_IDS.work, name: '私の仕事', color: '#123456', order: 7, hidden: true, createdAt: 1, updatedAt: 1 }] });
    await openApp(page, undefined, '?ns=mig3b&nosw');
    const cats = await page.evaluate(async () => (await (await import('/js/db.js')).listCategories()));
    expect(cats.filter((c) => c.id === CAT_IDS.work)).toHaveLength(1);
    // 名前・色は保持。hidden は第15版の一度きり移行で表示に戻る。旧ゴルフ・経済指標は残らない。
    expect(cats.find((c) => c.id === CAT_IDS.work)).toMatchObject({ name: '私の仕事', color: '#123456', hidden: false });
    expect(cats.filter((c) => [CAT_IDS.private, CAT_IDS.other].includes(c.id))).toHaveLength(2);
    expect(cats.some((c) => [CAT_IDS.golf, CAT_IDS.economy].includes(c.id))).toBe(false);
    expect((await raw(page, 'duo-calendar-mig3b')).rows).toHaveLength(v2.length);
  });
});

test.describe('設定 › カレンダーのカテゴリ編集（Duo 段の編集モード）', () => {
  test('編集/完了で Duo 段だけ編集表示になる。旧「カテゴリ」独立画面への導線は無い', async ({ page }) => {
    await openApp(page);
    await clickSettings(page);
    await page.locator('#menu [data-go="calendar"]').click();
    await expect(page.locator('[data-m="cats"]')).toHaveCount(0);
    await expect(page.locator('#m-cal-duo [data-cvis]')).toHaveCount(5);
    await expect(page.locator('#m-cedit')).toHaveText('編集');
    await page.locator('#m-cedit').click();
    await (await names(page)).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他']);
    await expect(page.locator('#m-cal-duo [data-cvis]')).toHaveCount(0);
    await expect(page.locator('#m-cal-duo [data-cadd]')).toBeVisible();
    await page.locator('#m-cedit').click();
    await expect(page.locator('#m-cal-duo [data-cvis]')).toHaveCount(5);
    await expect(page.locator('#m-cal-duo [data-cdel]')).toHaveCount(0);
  });

  test('追加・改名・色の変更（再読み込み後も保たれ、予定の表示に反映される）。保存後は編集モードのまま設定へ戻る', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '予定A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.family })]);
    await openCats(page);
    await page.locator('[data-cadd]').click();
    await expect(page.locator('#cats')).toBeVisible();
    await page.locator('#cat-name').fill('ヨガ');
    await page.locator('.swatch[aria-label="紫"]').click();
    await expect(page.locator('.swatch[aria-label="紫"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cat-close').click(); // 完了
    await expect(page.locator('#cats')).toBeHidden();
    await expect(page.locator('#m-cedit')).toHaveText('完了');
    await (await names(page)).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他', 'ヨガ']);
    await rowOf(page, '家族').locator('[data-cedit]').click();
    await page.locator('#cat-name').fill('ファミリー');
    await page.locator('.swatch[aria-label="赤"]').click();
    await page.locator('#cat-close').click();
    await (await names(page)).toHaveText(['仕事', 'プライベート', 'ファミリー', '外出', 'その他', 'ヨガ']);
    const cats = await dbCats(page);
    expect(cats.find((c) => c.name === 'ヨガ')).toMatchObject({ color: '#5e4c8e', order: 5, hidden: false });
    expect(cats.find((c) => c.id === CAT_IDS.family)).toMatchObject({ name: 'ファミリー', color: '#a13a3a' });
    await page.locator('#m-cedit').click();
    await page.locator('#m-back').click(); await page.locator('#m-back').click();
    await tab(page, '日').click();
    const card = page.locator('.tlev', { hasText: '予定A' });
    await expect(card).toHaveAttribute('aria-label', /、ファミリー/);
    expect(await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#a13a3a');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '日').click();
    await expect(page.locator('.tlev', { hasText: '予定A' })).toHaveAttribute('aria-label', /、ファミリー/);
    await tab(page, '月').click();
    await legendCheck(page, (l) => expect(l).toContainText('ヨガ'));
  });

  test('名前の検証: 空・重複・21文字以上は保存できない／キャンセルで設定へ戻る', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await page.locator('[data-cadd]').click();
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toContainText('カテゴリ名を入力');
    await page.locator('#cat-name').fill('仕事');
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toContainText('同じ名前');
    expect(await page.locator('#cat-name').getAttribute('maxlength')).toBe('20');
    expect((await dbCats(page)).length).toBe(5);
    await page.locator('[data-cat-cancel]').click();
    await expect(page.locator('#cats')).toBeHidden();
    await expect(page.locator('#m-cedit')).toHaveText('完了');
  });

  test('並べ替え: 上へ・下へ。新規予定の既定・凡例にも反映され、再読み込み後も保たれる', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await rowOf(page, '家族').locator('[data-cup]').click();
    await (await names(page)).toHaveText(['仕事', '家族', 'プライベート', '外出', 'その他']);
    await rowOf(page, '仕事').locator('[data-cdown]').click();
    await (await names(page)).toHaveText(['家族', '仕事', 'プライベート', '外出', 'その他']);
    await expect(page.locator('[data-cup]').first()).toBeDisabled();
    await expect(page.locator('[data-cdown]').last()).toBeDisabled();
    expect((await dbCats(page)).map((c) => [c.name, c.order])).toEqual([['家族', 0], ['仕事', 1], ['プライベート', 2], ['外出', 3], ['その他', 4]]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    await legendCheck(page, (l) => expect(l.locator('span')).toHaveText(['家族', '仕事', 'プライベート', '外出', 'その他']));
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#dest-name')).toHaveText('家族'); // 新規の既定は先頭
  });

  test('非表示（✓）は編集モード外で。予定は消えず、戻すと再び出る', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '仕事A', '2026-11-12T10:00', '2026-11-12T11:00'), ev('b', '家族B', '2026-11-12T12:00', '2026-11-12T13:00', { categoryId: CAT_IDS.family })]);
    await tab(page, '日').click();
    await expect(page.locator('.tlev')).toHaveCount(2);
    await openMenu(page, 'calendar');
    await page.locator('#m-cal-duo [data-cvis]', { hasText: '家族' }).click();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await expect(page.locator('.tlev')).toHaveCount(1);
    expect(await dbEvents(page)).toHaveLength(2);
    await openMenu(page, 'calendar');
    await page.locator('#m-cal-duo [data-cvis]', { hasText: '家族' }).click();
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await expect(page.locator('.tlev')).toHaveCount(2);
  });

  test('削除: 既定の移し先は「その他」。予定（繰り返しの個別変更を含む）を移し、5秒の「元に戻す」で全部戻る', async ({ page }) => {
    await openApp(page);
    await seed(page, [
      ev('a', '外出A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.out }),
      ev('b', '外出B', '2026-11-12T12:00', '2026-11-12T13:00', { categoryId: CAT_IDS.out }),
      ev('r', '毎週', '2026-11-09T09:00', '2026-11-09T10:00', { recurrence: { freq: 'weekly', interval: 1, byDay: [1], count: null, until: null },
        overrides: { '2026-11-16T09:00': { title: '変更回', categoryId: CAT_IDS.out, all: false, start: '2026-11-16T09:00', end: '2026-11-16T10:00', place: '', notes: '' } } }),
    ]);
    await openCats(page);
    await delRow(page, '外出');
    await expect(page.locator('.calbox')).toContainText('3件の予定を移すカテゴリ');
    await expect(page.locator('#cat-target')).toHaveValue(CAT_IDS.other);
    await page.locator('[data-cdelcancel]').click();
    expect((await dbCats(page)).length).toBe(5);
    await delRow(page, '外出');
    await page.locator('#cat-target').selectOption(CAT_IDS.family);
    await page.locator('[data-cdelgo]').click();
    await (await names(page)).toHaveText(['仕事', 'プライベート', '家族', 'その他']);
    await expect(page.locator('#m-cal-duo .undobar')).toContainText('「外出」を削除しました');
    let evs = await dbEvents(page);
    expect(evs).toHaveLength(3);
    expect(evs.filter((e) => e.categoryId === CAT_IDS.family).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(evs.find((e) => e.id === 'r').overrides['2026-11-16T09:00'].categoryId).toBe(CAT_IDS.family);
    await page.locator('[data-cundo]').click();
    await (await names(page)).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他']);
    evs = await dbEvents(page);
    expect(evs.filter((e) => e.categoryId === CAT_IDS.out).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(evs.find((e) => e.id === 'r').overrides['2026-11-16T09:00'].categoryId).toBe(CAT_IDS.out);
  });

  test('「元に戻す」は5秒で消え、その後も予定は移し先のまま・再読み込み後も維持', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '外出A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.out })]);
    await openCats(page);
    await delRow(page, '外出');
    await page.locator('[data-cdelgo]').click();
    await expect(page.locator('[data-cundo]')).toBeVisible();
    await expect(page.locator('[data-cundo]')).toHaveCount(0, { timeout: 7000 });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect((await dbCats(page)).map((c) => c.name)).toEqual(['仕事', 'プライベート', '家族', 'その他']);
    expect((await dbEvents(page))[0].categoryId).toBe(CAT_IDS.other);
  });

  test('「その他」自体も他に移し先があれば削除できる（移し先は最初の別カテゴリ）／最後の1件は削除できない', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', 'その他A', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: CAT_IDS.other })]);
    await openCats(page);
    await delRow(page, 'その他');
    await expect(page.locator('#cat-target')).toHaveValue(CAT_IDS.work);
    await page.locator('[data-cdelgo]').click();
    expect((await dbEvents(page))[0].categoryId).toBe(CAT_IDS.work);
    for (const n of ['外出', '家族', 'プライベート']) {
      await delRow(page, n);
      await page.locator('[data-cdelgo]').click();
    }
    await (await names(page)).toHaveText(['仕事']);
    await expect(page.locator('[data-cdel]')).toBeDisabled();
    await expect(page.locator('#m-cal-duo')).toContainText('カテゴリは1つ以上必要です');
    expect((await dbCats(page)).length).toBe(1);
  });

  test('表示中のカテゴリを削除して残りがすべて非表示になるときは、移し先を表示に戻す（元に戻すで再び非表示）', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => { const db = await import('/js/db.js'); const cs = await db.listCategories(); await db.applyCategoryChanges({ catPuts: cs.map((c) => ({ ...c, hidden: c.id !== cs[0].id })) }); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await openCats(page);
    await delRow(page, '仕事');
    await page.locator('[data-cdelgo]').click();
    let cats = await dbCats(page);
    expect(cats.filter((c) => !c.hidden).map((c) => c.id)).toEqual([CAT_IDS.other]);
    await page.locator('[data-cundo]').click();
    cats = await dbCats(page);
    expect(cats.filter((c) => !c.hidden).map((c) => c.id)).toEqual([CAT_IDS.work]);
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
    await expect(page.locator('#m-cal-duo .crow.edit')).toHaveCount(20);
    await expect(page.locator('[data-cadd]')).toBeDisabled();
  });

  test('既存予定の編集もカレンダー1行。旧カテゴリ選択と「カテゴリを編集…」は無い', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await addEvent(page, { title: 'ヨガ教室' });
    await page.locator('[data-event]').first().click();
    await page.locator('#editor').waitFor();
    await expect(page.locator('#f-cat, #cat-l')).toHaveCount(0);
    await expect(page.locator('#dest-name')).toHaveText('仕事');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt .dn')).toHaveText(['仕事', 'プライベート', '家族', '外出', 'その他']);
    await expect(page.locator('#dest-pop')).not.toContainText('カテゴリを編集');
  });

  test('編集シートで選んだカテゴリが保存され、別のカテゴリへ変更できる', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await page.locator('#f-title').fill('散歩');
    await pickDest(page, 'duo', catId('private'));
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    expect((await dbEvents(page))[0].categoryId).toBe(CAT_IDS.private);
  });
});

test.describe('バックアップ読み込みとカテゴリ（旧 cat → id 変換）', () => {
  test('v2 ファイル（経済指標付き）を新規インストールの端末に読み込むと、予定は「その他」に入り、経済指標カテゴリは復活しない', async ({ page }) => {
    await openApp(page);
    const file = { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [
      { id: 'i1', title: '米・物価', cat: 'economy', all: false, start: '2026-11-12T22:30', end: '2026-11-12T23:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
      { id: 'i2', title: '会議', cat: 'work', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', recurrence: null, exdates: [], overrides: {} },
    ] };
    await clickSettings(page);
    await page.locator('[data-m="backup"]').click();
    await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await page.locator('#bk-add').click();
    await expect(page.locator('#backup')).toBeHidden();
    const evs = await dbEvents(page);
    expect(evs.map((e) => [e.id, e.categoryId])).toEqual([['i1', CAT_IDS.other], ['i2', CAT_IDS.work]]);
    const cats = await dbCats(page);
    expect(cats.map((c) => c.name)).toEqual(['仕事', 'プライベート', '家族', '外出', 'その他']);
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
    await clickSettings(page);
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

// 第19版 PR1（design/30 §1）: カテゴリの保存に失敗したら「カテゴリを保存できませんでした。」を先に出し、データは元のまま
test.describe('カテゴリの保存失敗の文', () => {
  const MSG = 'カテゴリを保存できませんでした。もう一度お試しください。';
  const breakWrites = (page) => page.evaluate(() => { window.__op = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new Error('boom'); }; });
  const heal = (page) => page.evaluate(() => { IDBObjectStore.prototype.put = window.__op; });
  test('① 編集シートの保存 ② 表示の切り替え ③ 編集モードの削除・並べ替え。どれも元のまま残り、押し直せる', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    // ① 追加シート
    await page.locator('[data-cadd]').click();
    await page.locator('#cat-name').fill('ヨガ');
    await breakWrites(page);
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toHaveText(MSG);
    expect((await dbCats(page)).map((c) => c.name)).not.toContain('ヨガ');
    await heal(page);
    await page.locator('#cat-close').click();
    await expect(page.locator('#cats')).toBeHidden();
    expect((await dbCats(page)).map((c) => c.name)).toContain('ヨガ');
    await page.locator('#m-cedit').click(); // 編集モードを抜ける
    // ② 表示の切り替え
    await breakWrites(page);
    await page.locator('#m-cal-duo [data-cvis]', { hasText: '家族' }).click();
    await expect(page.locator('#status')).toHaveText(MSG);
    expect((await dbCats(page)).find((c) => c.name === '家族').hidden).toBe(false);
    await heal(page);
  });
  test('③ 編集モードの並べ替え（calEditCommit）', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await breakWrites(page);
    const before = (await dbCats(page)).map((c) => c.id);
    await rowOf(page, '外出').locator('[data-cup]').click();
    await expect(page.locator('#status')).toHaveText(MSG);
    expect((await dbCats(page)).map((c) => c.id)).toEqual(before);
    await heal(page);
  });
});
