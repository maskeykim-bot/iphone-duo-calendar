import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick } from './helpers.js';

// 第16版 PR29: ノートのフォルダ（作成・改名・並べ替え・削除・移動）とピン留め。
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const putFolder = (page, f) => page.evaluate(async (f) => (await import('/js/db.js')).putFolder(f), f);
const folders = (page) => page.evaluate(async () => (await import('/js/db.js')).listFolders());
async function openNotes(page) {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, 'right', 'ノート').click();
}
const list = (page) => page.locator('[data-mlist]').first();
const rowIds = (page) => page.locator('[data-mlist]').first().locator('[data-nrow]').evaluateAll((els) => els.map((e) => e.dataset.nrow));
const chip = (page, name) => page.locator('[data-nchips]').first().locator('.nchip', { hasText: name }).first();
async function newFolder(page, name) {
  await page.locator('[data-nchips]').first().locator('[data-nf="newf"]').click();
  await page.locator('[data-nfin]').first().fill(name);
  await page.locator('[data-nf="newfgo"]').click();
}
async function seed(page) {
  await putNote(page, { id: 'a', body: 'A\n一', createdAt: 1, updatedAt: 30, folderId: null });
  await putNote(page, { id: 'b', body: 'B\n二', createdAt: 1, updatedAt: 20, folderId: null });
  await putNote(page, { id: 'c', body: 'C\n三', createdAt: 1, updatedAt: 10, folderId: null });
}

test('初期フォルダはなし。作成→チップ選択→ノートを移動→フォルダ内だけ表示→再読込でも残る', async ({ page }) => {
  await openNotes(page);
  expect(await folders(page)).toEqual([]);
  await seed(page);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  await expect(page.locator('[data-nchips]').first().locator('.nchip')).toHaveText(['すべて', 'フォルダなし', '＋']);
  await newFolder(page, '家');
  await expect(chip(page, '家')).toHaveClass(/on/);
  await expect(list(page)).toContainText('このフォルダにノートはありません');
  await chip(page, 'すべて').click();
  await page.locator('[data-nrw="b"] [data-nf="rowmenu"]').click();
  await page.locator('[data-nf="rowmv"]').click();
  await page.locator('[data-nf="rowmvto"]', { hasText: '家' }).click();
  await expect.poll(async () => (await getNote(page, 'b')).folderId).toBe((await folders(page))[0].id);
  expect((await getNote(page, 'b')).updatedAt).toBe(20); // 更新日時は変わらない
  await chip(page, '家').click();
  expect(await rowIds(page)).toEqual(['b']);
  await chip(page, 'フォルダなし').click();
  expect(await rowIds(page)).toEqual(['a', 'c']);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  await expect(chip(page, '家')).toBeVisible();
  await chip(page, '家').click();
  expect(await rowIds(page)).toEqual(['b']);
});

test('フォルダの改名・並べ替え・削除（確認文。ノートはフォルダなしへ、本文と更新日時は保つ）。長い名前・同名', async ({ page }) => {
  await openNotes(page);
  await putFolder(page, { id: 'f1', name: '一', order: 0 }); await putFolder(page, { id: 'f2', name: '二', order: 1 });
  await putNote(page, { id: 'a', body: 'A\n一', createdAt: 1, updatedAt: 30, folderId: 'f1' });
  await putNote(page, { id: 'b', body: 'B\n二', createdAt: 1, updatedAt: 20, folderId: 'f1' });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  await chip(page, '一').click();
  expect(await rowIds(page)).toEqual(['a', 'b']);
  // 長押しで管理
  const box = await chip(page, '一').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await expect(page.locator('.nmenu')).toBeVisible();
  const long = 'あ'.repeat(30);
  await page.locator('[data-nfin]').first().fill('あ'.repeat(31));
  await page.locator('[data-nf="renamego"]').click();
  await expect(page.locator('.nerr')).toContainText('30字');
  await page.locator('[data-nfin]').first().fill(long);
  await page.locator('[data-nf="renamego"]').click();
  await expect(page.locator('.nmenu')).toHaveCount(0);
  expect((await folders(page)).find((f) => f.id === 'f1').name).toBe(long);
  // 並べ替え（後ろへ）
  await page.locator('[data-nchips] [data-nf="chipmenu"]').first().click();
  await page.locator('[data-nf="fmove"][data-dir="1"]').click();
  expect((await folders(page)).map((f) => f.id)).toEqual(['f2', 'f1']);
  await page.locator('[data-nf="menuclose"]').first().click();
  // 同名フォルダ
  await newFolder(page, '二');
  expect((await folders(page)).filter((f) => f.name === '二').length).toBe(2);
  // 削除
  await chip(page, long).click();
  await page.locator('[data-nchips] [data-nf="chipmenu"]').first().click();
  await page.locator('[data-nf="delask"]').click();
  await expect(page.locator('.nmbox')).toContainText('中のノート 2 件は『フォルダなし』に移ります。');
  await page.locator('[data-nf="menuclose"]', { hasText: 'やめる' }).click();
  expect((await folders(page)).length).toBe(3);
  await page.locator('[data-nchips] [data-nf="chipmenu"]').first().click();
  await page.locator('[data-nf="delask"]').click();
  await page.locator('[data-nf="delgo"]').click();
  await expect.poll(async () => (await folders(page)).length).toBe(2);
  for (const id of ['a', 'b']) { const n = await getNote(page, id); expect(n.folderId).toBeNull(); expect(n.deletedAt).toBeNull(); }
  expect((await getNote(page, 'a')).updatedAt).toBe(30); expect((await getNote(page, 'a')).body).toBe('A\n一');
  await chip(page, 'フォルダなし').click();
  expect(await rowIds(page)).toEqual(['a', 'b']);
});

test('ピン留め: メニュー・左スワイプ・本文見出しのボタン。2群に分かれ、pin時刻→更新順。再読込でも残る。外すと戻る', async ({ page }) => {
  await openNotes(page);
  await seed(page);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  expect(await rowIds(page)).toEqual(['a', 'b', 'c']);
  await expect(page.locator('.nsec')).toHaveCount(0);
  // メニューで c
  await page.locator('[data-nrw="c"] [data-nf="rowmenu"]').click();
  await page.locator('[data-nf="rowpin"]').click();
  await expect(page.locator('.nsec')).toHaveText(['ピン留め', 'ノート']);
  expect(await rowIds(page)).toEqual(['c', 'a', 'b']);
  // 左スワイプで b（c より後にピン → 先頭）
  const r = await page.locator('[data-nrw="b"] .mrow').boundingBox();
  await page.mouse.move(r.x + r.width - 20, r.y + r.height / 2); await page.mouse.down();
  await page.mouse.move(r.x + r.width - 60, r.y + r.height / 2, { steps: 4 }); await page.mouse.move(r.x + r.width - 120, r.y + r.height / 2, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await getNote(page, 'b')).pinned).toBe(true);
  await expect.poll(() => rowIds(page)).toEqual(['b', 'c', 'a']);
  expect((await getNote(page, 'b')).updatedAt).toBe(20);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  await expect.poll(() => rowIds(page)).toEqual(['b', 'c', 'a']);
  // 見出しのピンとフォルダ選択
  await putFolder(page, { id: 'f1', name: '家', order: 0 });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  await page.locator('[data-nrow="a"]').click();
  await expect(page.locator('.ned-title').first()).toHaveValue('A');
  await page.locator('[data-nmeta] [data-nf="pin"]').first().click();
  await expect(page.locator('[data-nmeta] .nmpin.on').first()).toBeVisible();
  // S7a V-20: フォルダは札（押すと小さなメニュー）。iOS の選ぶ欄はやめた
  await page.locator('[data-nmeta] .nfpill').first().click(); await page.locator('.nmenu [data-nf="curmvto"][data-to="f1"]').click();
  await expect.poll(async () => (await getNote(page, 'a')).folderId).toBe('f1');
  expect((await getNote(page, 'a')).pinned).toBe(true); expect((await getNote(page, 'a')).body).toBe('A\n一');
  await page.locator('[data-act="noteback"]').click();
  await expect.poll(() => rowIds(page)).toEqual(['a', 'b', 'c']); // a が最新のピン
  // 外す
  await page.locator('[data-nrw="a"] [data-nf="rowmenu"]').click();
  await page.locator('[data-nf="rowpin"]').click();
  await expect.poll(async () => (await getNote(page, 'a')).pinnedAt).toBeNull();
  await expect.poll(() => rowIds(page)).toEqual(['b', 'c', 'a']);
});

test('44pt当たり・チップは横スクロール・フォルダを開いて新規作成するとその中に入る', async ({ page }) => {
  await openNotes(page);
  for (let i = 0; i < 12; i++) await putFolder(page, { id: `f${i}`, name: `フォルダ${i}`, order: i });
  await seed(page);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  const bar = page.locator('[data-nchips]').first();
  expect(await bar.evaluate((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX)).toBe('auto');
  for (const loc of [bar.locator('.nchip').first(), bar.locator('[data-nf="newf"]'), page.locator('[data-nrw="a"] [data-nf="rowmenu"]')]) {
    const b = await loc.boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44);
  }
  await chip(page, 'フォルダ3').click();
  await page.locator('[data-act="notenew"]').first().click();
  await page.locator('.ned-title').first().fill('新しい');
  await expect.poll(async () => (await page.evaluate(async () => (await import('/js/db.js')).listNotes()))
    .find((n) => n.body === '新しい')?.folderId).toBe('f3');
});

test('削除したノートは30日は戻せる。期限後の整理は削除済みだけ', async ({ page }) => {
  await openNotes(page);
  await seed(page);
  await page.evaluate(async () => { const d = await import('/js/db.js'); await d.trashNote('c', Date.now() - 40 * 86400000); await d.trashNote('b', Date.now() - 2 * 86400000); });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
  await expect.poll(() => rowIds(page)).toEqual(['a']);
  await expect.poll(async () => await getNote(page, 'c')).toBeNull();
  expect((await getNote(page, 'b')).deletedAt).not.toBeNull();
  expect((await getNote(page, 'a')).body).toBe('A\n一');
});
