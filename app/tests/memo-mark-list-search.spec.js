import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick, seed, ev } from './helpers.js';

// 第16版 PR28: メモ→ノート。月のメモ線・帯の印は廃止。一覧・検索・元の日付への導線をノートで検査する。
// 旧メモは旧形式の端末データとして入れ、起動後の複製（migrateNotesOnce）を通す。
const putMemo = (page, d, t) => page.evaluate(async ([d, t]) => (await import('/js/db.js')).putMemo(d, t), [d, t]);
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const migrate = (page) => page.evaluate(async () => (await import('/js/db.js')).migrateNotesOnce());
const reload = async (page) => { await page.reload(); await page.waitForSelector('html[data-ready]'); };
const title = (page) => page.locator('.ned-title').first();
const body = (page) => page.locator('.ned-body').first();

test('移したメモには date が付くので月のマスに線が出る。帯の旧メモ印は出ない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await putMemo(page, '2026-11-20', '会議');
  await migrate(page);
  await reload(page);
  await expect(page.locator('.week .day[data-date="2026-11-20"]')).toBeVisible();
  await expect(page.locator('.week .day[data-date="2026-11-20"] .mline')).toHaveCount(1);
  await expect(page.locator('.week .day[data-date="2026-11-19"] .mline')).toHaveCount(0);
  await expect(page.locator('.cmemo.has')).toHaveCount(0);
});

test('一覧: 新しい順・1行56・検索欄。タップで開く。旧メモ由来には元の日付の導線が残る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await putMemo(page, '2026-11-01', 'A古い\n2行目');
  await migrate(page);
  await putNote(page, { id: 'free', body: '<b>C</b>自由ノート', createdAt: 5, updatedAt: Date.UTC(2026, 10, 30), folderId: null });
  await reload(page);
  await pagePick(page, 'right', 'ノート').click();
  const rows = page.locator('.page.rp .mrow');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('<b>C</b>自由ノート'); // 更新の新しい順
  expect(await page.locator('.page.rp .mrow b').count()).toBe(2); // HTML として解釈しない
  expect(await rows.first().evaluate((e) => e.getBoundingClientRect().height)).toBe(56);
  await expect(page.locator('.page.rp .nsrc')).toHaveCount(1); // 旧メモ由来だけ
  await page.locator('.page.rp .mlq').fill('古い');
  await expect(rows).toHaveCount(1);
  await page.locator('.page.rp .mlq').fill('2026-11-01'); // 元の日付でも探せる
  await expect(rows).toHaveCount(1);
  await page.locator('.page.rp .nsrc').click(); // 元の日付へ
  await expect(page.locator('.week .day.selected')).toHaveAttribute('data-date', '2026-11-01');
  await rows.first().click();
  await expect(title(page)).toHaveValue('2026年11月1日（日）'); // 年付き見出しが付く
  await expect(body(page)).toHaveValue('A古い\n2行目');
});

test("一覧は多数でも仮想表示で作れ、末尾まで届く（DOMは一括で作らない）", async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.evaluate(async () => { const db = await import('/js/db.js'); for (let i = 1; i <= 230; i++) await db.putNote({ id: `n${i}`, body: `ノート${i}`, createdAt: i, updatedAt: i, folderId: null }); });
  await reload(page);
  await pagePick(page, 'left', 'ノート').click();
  await expect(page.locator('.page.lp .mrow').first()).toBeVisible();
  await page.locator('.page.lp [data-mlist]').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(page.locator('.page.lp [data-nrow="n1"]')).toBeVisible();
  await expect(page.locator('.page.lp [data-nrow="n230"]')).toHaveCount(0);
});

test('全体検索: 別「ノート」段・正規化AND・XSS安全・ノートを開く・予定件数と別', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seed(page, [ev('e1', 'ランチ', '2026-11-13T12:00', '2026-11-13T13:00')]);
  await putNote(page, { id: 'x1', body: 'ﾗﾝﾁ の <b>メモ</b> 本文', createdAt: 1, updatedAt: 2, folderId: null });
  await putNote(page, { id: 'x2', body: '別の話', createdAt: 1, updatedAt: 3, folderId: null });
  await page.getByRole('button', { name: '予定を検索' }).first().click();
  await page.locator('#sr-q').fill('らんち メモ');
  const mem = page.locator('#sr-body [data-sec="memo"]');
  await expect(mem).toContainText('1件のノート（全期間・最大200件）');
  await expect(page.locator('#sr-body [data-sec="events"]')).toContainText('該当する予定はありません');
  expect(await page.locator('#sr-body b').count()).toBe(0);
  await expect(mem.locator('mark').first()).toBeVisible();
  await page.locator('#sr-q').fill('ランチ');
  await expect(page.locator('#sr-body [data-sec="events"]')).toContainText('1件の予定');
  await expect(mem).toContainText('1件のノート');
  await mem.locator('.mhit').click();
  await expect(page.locator('#search')).toBeHidden();
  await expect(title(page)).toHaveValue('ﾗﾝﾁ の <b>メモ</b> 本文');
});

test('下パネルで一覧が使える。開いたノートは最後のノートとして覚える', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await putNote(page, { id: 'p1', body: '下ノート\n本文', createdAt: 1, updatedAt: 2, folderId: null });
  await reload(page);
  await page.getByRole('button', { name: '下の段を表示' }).click();
  await page.waitForTimeout(320);
  await page.locator('.pswitch').getByRole('button', { name: 'ノート', exact: true }).click();
  await expect(page.locator('.pnl .mrow')).toHaveCount(1);
  await expect(page.locator('.pnl .mrow')).toContainText('下ノート');
  await page.locator('.pnl .mrow').click();
  await expect(page.locator('.pnl .ned-title')).toHaveValue('下ノート');
  expect(await page.evaluate(async () => (await import('/js/db.js')).getLastNote())).toBe('p1');
  // 最後のノートが消えていたら一覧へ
  await page.evaluate(async () => (await import('/js/db.js')).trashNote('p1'));
  await reload(page);
  await expect(page.locator('.pnl .mrow, .pnl .smsg').first()).toBeVisible();
  await expect(page.locator('.pnl .ned-title')).toHaveCount(0);
});

test('保存に失敗している間は一覧へ戻らず、下書きが残る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, 'right', 'ノート').click();
  await page.locator('[data-act="notenew"]').first().click();
  await page.evaluate(() => { const o = IDBObjectStore.prototype.put; window.__failPut = true; IDBObjectStore.prototype.put = function (...a) { if (window.__failPut && this.name === 'notes') throw new Error('boom'); return o.apply(this, a); }; });
  await title(page).fill('書きかけ');
  await page.locator('[data-act="noteback"]').click();
  await expect(page.locator('.page.rp .ned-status')).toContainText('ノートを保存できませんでした。');
  await expect(title(page)).toHaveValue('書きかけ'); // 離れない
  const draft = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('duo.note.draft.v1:')).map((k) => JSON.parse(localStorage.getItem(k)).text));
  expect(draft).toContain('書きかけ');
  await page.evaluate(() => { window.__failPut = false; });
  await page.locator('.ned-retry').click();
  await page.locator('[data-act="noteback"]').click();
  await expect(page.locator('.page.rp .mrow')).toHaveCount(1);
});
