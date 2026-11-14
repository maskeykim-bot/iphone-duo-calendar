// 第1弾レビュー対応（小さな修正版）: 非表示カテゴリの既定・通知、同名カテゴリ、読み込みの上限と件数、開いた画面の「今日に戻る」、手帳→予定名の往復。
import { test, expect } from '@playwright/test';
import { CAT_IDS } from '../js/categories.js';
import { openApp, seed, dbEvents, ev, tab, SIZES, addEvent } from './helpers.js';

const dbCats = (page) => page.evaluate(async () => (await import('/js/db.js')).listCategories());
const hideCat = async (page, id) => {
  await page.evaluate(async (id) => {
    const db = await import('/js/db.js');
    const c = (await db.listCategories()).find((x) => x.id === id);
    await db.applyCategoryChanges({ catPuts: [{ ...c, hidden: true }], catDels: [], eventPuts: [] });
  }, id);
  await page.reload();
  await page.waitForSelector('html[data-ready]');
};
const openBackup = async (page) => {
  await page.locator('[data-act="menu"]:visible').first().click();
  await page.getByRole('button', { name: 'バックアップ' }).click();
  await expect(page.locator('#backup')).toBeVisible();
};
const pick = (page, content) => page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(content)) });

test.describe('非表示カテゴリと新しい予定', () => {
  test('既定は表示中の先頭。編集フォームでは非表示も選べる', async ({ page }) => {
    await openApp(page);
    await hideCat(page, CAT_IDS.work);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#f-cat')).toHaveValue(CAT_IDS.private);
    await expect(page.locator('#f-cat option')).toHaveCount(6);
    await expect(page.locator(`#f-cat option[value="${CAT_IDS.work}"]`)).toHaveText('仕事（非表示）');
  });
  test('非表示のカテゴリに保存 → 4秒の知らせ →「表示する」で戻る', async ({ page }) => {
    await openApp(page);
    await hideCat(page, CAT_IDS.work);
    await addEvent(page, { title: '隠れる予定', cat: 'work' });
    const note = page.locator('#hidden-notice');
    await expect(note).toContainText('非表示のカテゴリに保存しました');
    await tab(page, '日').click();
    await expect(page.locator('.daylist .event')).toHaveCount(0);
    await note.getByRole('button', { name: '表示する' }).click();
    await expect(note).toBeHidden();
    expect((await dbCats(page)).find((c) => c.id === CAT_IDS.work).hidden).toBe(false);
    expect(await dbEvents(page)).toHaveLength(1);
    await expect(page.locator('.daylist .event')).toContainText('隠れる予定');
  });
  test('知らせは4秒で消え、表示中のカテゴリへの保存では出ない', async ({ page }) => {
    await openApp(page);
    await hideCat(page, CAT_IDS.work);
    await addEvent(page, { title: 'A', cat: 'work' });
    await expect(page.locator('#hidden-notice')).toBeVisible();
    await page.waitForTimeout(4300);
    await expect(page.locator('#hidden-notice')).toHaveCount(0);
    await addEvent(page, { title: 'B', cat: 'family' });
    await expect(page.locator('#hidden-notice')).toHaveCount(0);
  });
});

test.describe('同名カテゴリ', () => {
  const openCats = async (page) => {
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('[data-m="cats"]').click();
    await expect(page.locator('#cats')).toBeVisible();
  };
  test('追加も改名も、前後の空白を除いて同名なら保存できない', async ({ page }) => {
    await openApp(page);
    await openCats(page);
    await page.locator('[data-cat-add]').click();
    await page.locator('#cat-name').fill('  家族 ');
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toContainText('同じ名前');
    expect(await dbCats(page)).toHaveLength(5);
    await page.locator('[data-cat-cancel]').click();
    await page.locator(`[data-cat-edit="${CAT_IDS.out}"]`).click();
    await page.locator('#cat-name').fill('その他');
    await page.locator('#cat-close').click();
    await expect(page.locator('#cat-err')).toContainText('同じ名前');
    expect((await dbCats(page)).find((c) => c.id === CAT_IDS.out).name).toBe('外出');
  });
});

test.describe('バックアップ読み込みのカテゴリ', () => {
  const cat = (id, name, order) => ({ id, name, color: '#2f5f8a', order, hidden: false, createdAt: 1, updatedAt: 1 });
  const file = (cats, events) => ({ app: 'duo-calendar', version: 3, exportedAt: '2026-11-13T09:41:00+09:00', categories: cats, events, settings: { view: 'month', style: 'simple', desk: false, monthExpand: false, weekStart: 1 } });
  test('同名で id が違うカテゴリは「仕事 (2)」になり、予定はそのカテゴリに付く', async ({ page }) => {
    await openApp(page);
    await openBackup(page);
    await pick(page, file([cat('zz', '仕事', 0)], [ev('e1', '予定', '2026-12-01T10:00', '2026-12-01T11:00', { categoryId: 'zz' })]));
    await expect(page.locator('#bk-body')).toContainText('同じ名前に番号を付ける1件');
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toContainText('1件を追加しました');
    const cats = await dbCats(page);
    expect(cats.map((c) => c.name)).toContain('仕事 (2)');
    expect(cats.find((c) => c.id === 'zz').name).toBe('仕事 (2)');
    expect((await dbEvents(page)).find((e) => e.id === 'e1').categoryId).toBe('zz');
  });
  test('同じ id は読み込む側の名前・色で上書き。同じ v3 を2回続けて読み込んでもカテゴリ・予定は変わらない', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('keep', '残る', '2026-11-20T10:00', '2026-11-20T11:00')]);
    const f = file([{ ...cat(CAT_IDS.family, '家族（新）', 2), color: '#a13a3a' }, cat('zz', '仕事', 5)], [ev('e1', '予定', '2026-12-01T10:00', '2026-12-01T11:00', { categoryId: 'zz' })]);
    const snap = async () => ({ c: (await dbCats(page)).map((c) => [c.id, c.name, c.color, c.order, c.hidden]), e: (await dbEvents(page)).map((e) => e.id) });
    await openBackup(page);
    await pick(page, f);
    await expect(page.locator('#bk-body')).toContainText('ファイルの名前・色に上書きします');
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toContainText('1件を追加しました');
    const first = await snap();
    const fam = first.c.find((c) => c[0] === CAT_IDS.family);
    expect(fam.slice(1, 3)).toEqual(['家族（新）', '#a13a3a']);
    expect(first.c.find((c) => c[0] === 'zz')[1]).toBe('仕事 (2)');
    expect(first.e).toEqual(['e1', 'keep']);
    await openBackup(page);
    await pick(page, f);
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toContainText('0件を追加しました（重複1件を除外）');
    expect(await snap()).toEqual(first);
  });
  test('カテゴリは読み込んでも20個まで。溢れた分の予定は消さず未分類へ。確認画面の件数と一致する', async ({ page }) => {
    await openApp(page);
    const many = Array.from({ length: 30 }, (_, i) => cat(`n${i}`, `N${i}`, i));
    const events = [ev('e1', '溢れる', '2026-12-01T10:00', '2026-12-01T11:00', { categoryId: 'n29' }), ev('e2', '収まる', '2026-12-02T10:00', '2026-12-02T11:00', { categoryId: 'n0' }),
      ev('e3', '家族', '2026-12-03T10:00', '2026-12-03T11:00', { categoryId: CAT_IDS.family })];
    await openBackup(page);
    await pick(page, file(many, events));
    await expect(page.locator('#bk-body')).toContainText('未分類へ1件');
    await expect(page.locator('#bk-body')).toContainText('上限20個を超える');
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toContainText('3件を追加しました');
    const cats = await dbCats(page);
    expect(cats.length).toBeLessThanOrEqual(20);
    const list = await dbEvents(page);
    expect(list).toHaveLength(3);
    expect(list.find((e) => e.id === 'e1').categoryId).toBe(CAT_IDS.none);
    expect(list.find((e) => e.id === 'e2').categoryId).toBe('n0');
  });
  test('確認画面の「未分類へ n 件」: 固定 id の家族がファイルにも端末にも無ければ数える', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async (id) => { const db = await import('/js/db.js'); await db.applyCategoryChanges({ catPuts: [], catDels: [id], eventPuts: [] }); }, CAT_IDS.family);
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await openBackup(page);
    await pick(page, { app: 'duo-calendar', version: 3, exportedAt: '2026-11-13T09:41:00+09:00', events: [ev('e1', '家族', '2026-12-03T10:00', '2026-12-03T11:00', { categoryId: CAT_IDS.family })] });
    await expect(page.locator('#bk-body')).toContainText('未分類へ1件');
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toContainText('1件を追加しました');
    expect((await dbEvents(page))[0].categoryId).toBe(CAT_IDS.none);
  });
});

test.describe('開いた画面の「今日に戻る」', () => {
  for (const [label, size] of [['開いた縦', SIZES.openPortrait], ['開いた横', SIZES.openLandscape]]) {
    for (const view of ['日', '週']) {
      test(`${label}: ${view}表示のまま今日へ（月に変わらず、閉じてもホームに飛ばない状態を作らない）`, async ({ page }) => {
        await openApp(page, size);
        await tab(page, view).click();
        await page.getByRole('button', { name: view === '日' ? '次の日' : '次の週' }).click();
        await page.getByRole('button', { name: '今日に戻る' }).first().click();
        await expect(tab(page, view)).toHaveAttribute('aria-pressed', 'true');
        await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'false');
        if (view === '日') await expect(page.locator('#ctitle, .stitle').first()).toContainText('11月12日');
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('duo.ui.v1'))) || '{}').home)).not.toBe(true);
      });
    }
  }
});

test('閉じた画面の「手帳」→ 開いた縦は「予定名」→ 閉じ直すと「手帳」', async ({ page }) => {
  await openApp(page);
  await tab(page, '月').click();
  await page.getByRole('button', { name: '手帳', exact: true }).click();
  await expect(page.getByRole('button', { name: '手帳', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize(SIZES.openPortrait);
  await expect(page.getByRole('button', { name: '手帳', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '予定名', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize(SIZES.closedPortrait);
  await expect(page.getByRole('button', { name: '手帳', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('duo.ui.v1')))).style)).toBe('simple');
});
