// 第15版 PR1: 旧カテゴリの一度きり移行（実 IndexedDB）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, ev, seed } from './helpers.js';
import { CAT_IDS } from '../js/categories.js';

const KEY = 'categoryRetargetV1';
const TOAST = 'ゴルフ・経済指標の予定を「その他」に移しました';
const EVS = [
  ev('g', 'ゴルフ', '2026-11-13T10:00', '2026-11-13T11:00', { categoryId: CAT_IDS.golf }),
  ev('x', '指標', '2026-11-14T10:00', '2026-11-14T11:00', { categoryId: CAT_IDS.economy }),
  ev('w', '仕事', '2026-11-15T10:00', '2026-11-15T11:00', { categoryId: CAT_IDS.work, memo: 'keep', nativeLink: { state: 'unlinked', v: 2 } }),
  ev('o', '毎週', '2026-11-16T10:00', '2026-11-16T11:00', { categoryId: CAT_IDS.work, overrides: { '2026-11-16T10:00': { categoryId: CAT_IDS.golf, title: '変更' } } }),
];
const OLD = [
  ['work', '会議', '#375a7f', 0], ['private', 'プライベート', '#885265', 1], ['golf', 'ゴルフ', '#396b49', 2], ['economy', '経済指標', '#825a23', 3],
].map(([k, name, color, order]) => ({ id: CAT_IDS[k], name, color, order, hidden: true, createdAt: 1, updatedAt: 1 }));

const dump = (page) => page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('duo-calendar'); r.onsuccess = () => res(r.result); });
  const all = (s) => new Promise((res) => { const g = db.transaction(s).objectStore(s).getAll(); g.onsuccess = () => res(g.result); });
  const out = { cats: await all('categories'), events: await all('events'), meta: await all('meta') };
  db.close();
  return out;
});
const marker = async (page) => (await dump(page)).meta.find((m) => m.key === KEY)?.value ?? null;

// 起動済みの DB を「旧端末」の状態に戻す（印を消し、旧4カテゴリ全非表示、予定を入れる）
async function rearm(page) {
  await openApp(page, SIZES.closedPortrait, '?nosw');
  await page.evaluate(async ({ old, evs, key }) => {
    const db = await import('/js/db.js');
    await db.applyChangesWithOutbox({ puts: [], dels: [], outbox: (c) => c });
    const cur = await db.listCategories();
    await db.applyCategoryChanges({ catDels: cur.map((c) => c.id).filter((id) => !old.some((o) => o.id === id)), catPuts: old });
    await db.putMany(evs);
    await new Promise((res, rej) => {
      const r = indexedDB.open('duo-calendar'); r.onsuccess = () => { const t = r.result.transaction('meta', 'readwrite'); t.objectStore('meta').delete(key); t.oncomplete = () => { r.result.close(); res(); }; };
      r.onerror = rej;
    });
  }, { old: OLD, evs: EVS, key: KEY });
}
const reload = async (page) => { await page.reload(); await page.waitForSelector('html[data-ready]'); };

test.describe('旧カテゴリの一度きり移行', () => {
  test('予定は1件も消えず、その他へ移り、旧2種は消え、全て表示に戻る。トーストは一度だけ', async ({ page }) => {
    await rearm(page);
    const before = (await dump(page)).events;
    await reload(page);
    await expect(page.locator('#native-toast')).toHaveText(TOAST);
    const d = await dump(page);
    expect(d.events).toHaveLength(before.length);
    const by = Object.fromEntries(d.events.map((e) => [e.id, e]));
    expect(by.g.categoryId).toBe(CAT_IDS.other);
    expect(by.x.categoryId).toBe(CAT_IDS.other);
    expect(by.w.categoryId).toBe(CAT_IDS.work);
    expect(by.o.categoryId).toBe(CAT_IDS.work);
    expect(by.o.overrides['2026-11-16T10:00']).toMatchObject({ categoryId: CAT_IDS.other, title: '変更' });
    // 移した以外の項目は不変
    for (const e of before) { const { categoryId, overrides, updatedAt, ...rest } = e; const { categoryId: c2, overrides: o2, updatedAt: u2, ...rest2 } = by[e.id]; expect(rest2).toEqual(rest); }
    expect(d.cats.map((c) => c.id).sort()).toEqual([CAT_IDS.work, CAT_IDS.private, CAT_IDS.family, CAT_IDS.out, CAT_IDS.other].sort());
    expect(d.cats.every((c) => c.hidden === false)).toBe(true);
    expect(d.cats.find((c) => c.id === CAT_IDS.work)).toMatchObject({ name: '会議', color: '#375a7f' }); // 改名・色を保持
    expect(await marker(page)).toMatchObject({ moved: 3, toast: 'done' });
    // 再起動: 再移行なし・トーストなし。その後の非表示操作は尊重される
    await page.evaluate(async (id) => { const db = await import('/js/db.js'); const c = (await db.listCategories()).find((x) => x.id === id); await db.putCategory({ ...c, hidden: true }); }, CAT_IDS.out);
    await reload(page);
    await expect(page.locator('#native-toast')).toHaveCount(0);
    const d2 = await dump(page);
    expect(d2.cats.find((c) => c.id === CAT_IDS.out).hidden).toBe(true);
    expect(d2.cats).toHaveLength(5);
    expect(d2.events).toHaveLength(before.length);
  });

  test('予定0件ならトーストなし（skip）で旧カテゴリは消える', async ({ page }) => {
    await rearm(page);
    await page.evaluate(async () => { await (await import('/js/db.js')).clearEvents(); });
    await reload(page);
    await expect(page.locator('#native-toast')).toHaveCount(0);
    expect(await marker(page)).toMatchObject({ moved: 0, toast: 'skip' });
    expect((await dump(page)).cats.map((c) => c.id)).not.toContain(CAT_IDS.golf);
  });

  test('transaction が abort されたら印も変更も残らず、次の起動でやり直せる', async ({ page }) => {
    await rearm(page);
    const before = await dump(page);
    await page.addInitScript((key) => {
      if (sessionStorage.getItem('rtFail')) return;
      sessionStorage.setItem('rtFail', '1');
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (v, k) { if (this.name === 'meta' && v?.key === key) throw new Error('boom'); return put.call(this, v, k); };
    }, KEY);
    await reload(page);
    const mid = await dump(page);
    expect(await marker(page)).toBeNull();
    expect(mid.events).toEqual(before.events);
    expect(mid.cats).toEqual(before.cats);
    await expect(page.locator('#native-toast')).toHaveCount(0);
    await reload(page);
    await expect(page.locator('#native-toast')).toHaveText(TOAST);
    expect(await marker(page)).toMatchObject({ moved: 3 });
    expect((await dump(page)).events).toHaveLength(before.events.length);
  });

  test('2つ同時に走っても一度だけ', async ({ page }) => {
    await rearm(page);
    const r = await page.evaluate(async () => { const db = await import('/js/db.js'); return Promise.all([db.migrateCategoriesOnce(new Date()), db.migrateCategoriesOnce(new Date())]); });
    expect(r.map((x) => x.ran).sort()).toEqual([false, true]);
    expect(r.find((x) => x.ran).before).toMatchObject({ categories: 4, legacy: 2 }); // PR12 用の移行前の証拠
    expect(await marker(page)).toMatchObject({ moved: 3, toast: 'pending' });
  });
});

// ---- 第15版 PR2: 古い復元と表示の下限 ----
const cats = (page) => page.evaluate(async () => (await import('/js/db.js')).listCategories());
const openBk = async (page) => {
  await page.locator('[data-act="menu"]:visible').first().click();
  await page.locator('[data-m="backup"]').click();
  await expect(page.locator('#backup')).toBeVisible();
};
const pickJson = (page, obj) => page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
const old = (v, events, categories) => ({ app: 'duo-calendar', version: v, exportedAt: '2026-11-13T00:00:00Z', events, ...(categories ? { categories } : {}), memos: v >= 4 ? [{ id: '2026-11-20', date: '2026-11-20', text: 'メモ', createdAt: 1, updatedAt: 2 }] : undefined });
const body = (id, categoryId, x = {}) => ({ ...ev(id, id, '2026-11-18T10:00', '2026-11-18T11:00', { categoryId }), ...x });

test.describe('第15版 PR2: 古いバックアップ', () => {
  for (const mode of ['add', 'replace']) {
    test(`v4（旧ゴルフ・経済指標・全 hidden）を${mode === 'add' ? '追加' : '置換'}: 予定は消えず other へ、旧カテゴリは復活せず、表示が1つ残る`, async ({ page }) => {
      await openApp(page, SIZES.closedPortrait, '?nosw');
      await seed(page, [ev('keep', '残る', '2026-11-12T10:00', '2026-11-12T11:00')]);
      const fc = [CAT_IDS.golf, CAT_IDS.economy, CAT_IDS.work].map((id, i) => ({ id, name: `c${i}`, color: '#2f5f8a', order: i, hidden: true, createdAt: 1, updatedAt: 1 }));
      await openBk(page);
      await pickJson(page, old(4, [body('g', CAT_IDS.golf), body('x', CAT_IDS.economy), body('w', CAT_IDS.work)], fc));
      await page.locator(`#bk-${mode}`).click();
      if (mode === 'replace') await page.locator('#bk-rdo').click();
      await expect(page.locator('#backup')).toBeHidden();
      const d = await dump(page);
      const by = Object.fromEntries(d.events.map((e) => [e.id, e]));
      expect(by.g.categoryId).toBe(CAT_IDS.other); expect(by.x.categoryId).toBe(CAT_IDS.other); expect(by.w.categoryId).toBe(CAT_IDS.work);
      expect(by.keep ? 1 : 0).toBe(mode === 'add' ? 1 : 0);
      expect(d.cats.some((c) => c.id === CAT_IDS.golf || c.id === CAT_IDS.economy)).toBe(false);
      expect(d.cats.some((c) => !c.hidden)).toBe(true);
      expect(d.cats.some((c) => c.id === CAT_IDS.other)).toBe(true);
      if (mode === 'replace') for (const id of [CAT_IDS.family, CAT_IDS.out, CAT_IDS.other]) expect(d.cats.some((c) => c.id === id)).toBe(true);
    });
  }

  test('v2（旧 cat）の置換でも旧カテゴリは復活しない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await openBk(page);
    await pickJson(page, old(2, [{ ...body('g', undefined), cat: 'golf', categoryId: undefined }, { ...body('p', undefined), cat: 'private', categoryId: undefined }]));
    await page.locator('#bk-replace').click(); await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    const d = await dump(page);
    expect(d.events.find((e) => e.id === 'g').categoryId).toBe(CAT_IDS.other);
    expect(d.cats.some((c) => c.id === CAT_IDS.golf || c.id === CAT_IDS.economy)).toBe(false);
  });
});

test.describe('第15版 PR2: 最後の表示カテゴリ', () => {
  test('最後の✓は書き込まず、揺れて案内が出る。他を戻せば隠せる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.evaluate(async () => { const db = await import('/js/db.js'); const cs = await db.listCategories(); await db.applyCategoryChanges({ catPuts: cs.map((c, i) => ({ ...c, hidden: i > 0 })) }); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const before = await cats(page);
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('#menu [data-go="calendar"]').click();
    const sw = page.locator('#m-cal-duo [data-cvis][aria-checked=true]');
    await expect(sw).toHaveCount(1);
    await sw.click();
    await expect(sw).toHaveClass(/shake/);
    await expect(page.locator('#native-toast')).toHaveText('カテゴリを1つは表示してください');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(await cats(page)).toEqual(before);
    await page.waitForTimeout(350);
    await expect(sw).not.toHaveClass(/shake/);
    await page.locator('#m-cal-duo [data-cvis][aria-checked=false]').first().click();
    await expect(page.locator('#m-cal-duo [data-cvis][aria-checked=true]')).toHaveCount(2);
    await page.locator('#m-cal-duo [data-cvis][aria-checked=true]').nth(1).click();
    await expect(page.locator('#m-cal-duo [data-cvis][aria-checked=true]')).toHaveCount(1);
  });
});
