import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick } from './helpers.js';

// 第14版 PR9: メモ編集と自動保存
const DAY = '2026-11-12', NEXT = '2026-11-13';
const dbMemo = (page, d) => page.evaluate(async (d) => (await (await import('/js/db.js')).getMemo(d)), d);
const draft = (page, d) => page.evaluate((d) => localStorage.getItem(`duo.memo.draft.v1:${d}`), d);
const ta = (page) => page.locator('textarea.memota').first();
async function openMemoSpread(page, side = 'right') {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, side, 'メモ').click();
  await expect(ta(page)).toBeVisible();
}

test('見開き: 説明「自動で保存」・空欄「この日のメモ」・罫線28/文字16/余白6、1秒後に保存、再読込で同じ本文', async ({ page }) => {
  await openMemoSpread(page);
  await expect(ta(page)).toHaveAttribute('placeholder', 'この日のメモ');
  await expect(page.locator('.memost').first()).toHaveText('自動で保存');
  const st = await ta(page).evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.lineHeight, c.paddingTop, c.paddingLeft]; });
  expect(st).toEqual(['16px', '28px', '6px', '6px']);
  await ta(page).fill('買い物\n<b>牛乳</b>');
  expect(await dbMemo(page, DAY)).toBeNull(); // まだ（1秒待ち）
  expect(JSON.parse(await draft(page, DAY)).text).toBe('買い物\n<b>牛乳</b>'); // 下書きは入力ごと
  await expect.poll(async () => (await dbMemo(page, DAY))?.text, { timeout: 3000 }).toBe('買い物\n<b>牛乳</b>');
  expect(await draft(page, DAY)).toBeNull();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(ta(page)).toHaveValue('買い物\n<b>牛乳</b>');
  expect(await page.locator('.memopage b').count()).toBe(0); // HTML として解釈しない
});

test('日付を送ると前の日を即保存し、高速に切り替えても各日の本文が残る', async ({ page }) => {
  await openMemoSpread(page);
  await ta(page).fill('A');
  await page.locator('.page.rp').getByRole('button', { name: '次の日' }).click();
  await expect(page.locator('.page.rp .rdate')).toContainText('13日');
  await expect(ta(page)).toHaveValue('');
  await ta(page).fill('B');
  await page.locator('.page.rp').getByRole('button', { name: '前の日' }).click();
  await expect(ta(page)).toHaveValue('A');
  await expect.poll(async () => [(await dbMemo(page, DAY))?.text, (await dbMemo(page, NEXT))?.text]).toEqual(['A', 'B']);
});

test('空への変更は削除、hidden で待たず即保存', async ({ page }) => {
  await openMemoSpread(page);
  await ta(page).fill('x');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await dbMemo(page, DAY))?.text, { timeout: 500 }).toBe('x');
  await ta(page).fill('  ');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(async () => await dbMemo(page, DAY), { timeout: 500 }).toBeNull();
});

test('再起動で下書きを復元して保存する（古い下書きは捨てる）', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.evaluate(() => {
    localStorage.setItem('duo.memo.draft.v1:2026-11-12', JSON.stringify({ date: '2026-11-12', text: '落ちる前', at: Date.now() }));
    localStorage.setItem('duo.memo.draft.v1:2026-11-10', JSON.stringify({ date: '2026-11-10', text: '古い', at: 1 }));
  });
  await page.evaluate(async () => { const d = await import('/js/db.js'); await d.putMemo('2026-11-10', '新しいDB', 5000); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'right', 'メモ').click();
  await expect(ta(page)).toHaveValue('落ちる前');
  await expect.poll(async () => (await dbMemo(page, DAY))?.text).toBe('落ちる前');
  expect((await dbMemo(page, '2026-11-10')).text).toBe('新しいDB');
  expect(await draft(page, '2026-11-10')).toBeNull();
});

test('DB 失敗は下書きを残して表示し、再試行で保存できる', async ({ page }) => {
  await openMemoSpread(page);
  await page.evaluate(() => { const o = IDBObjectStore.prototype.put; window.__failPut = true; IDBObjectStore.prototype.put = function (...a) { if (window.__failPut && this.name === 'memos') throw new Error('boom'); return o.apply(this, a); }; });
  await ta(page).fill('守る');
  await expect(page.locator('.memost').first()).toContainText('メモを保存できませんでした。', { timeout: 3000 });
  expect(JSON.parse(await draft(page, DAY)).text).toBe('守る');
  await page.evaluate(() => { window.__failPut = false; });
  await page.getByRole('button', { name: '再試行' }).click();
  await expect.poll(async () => (await dbMemo(page, DAY))?.text).toBe('守る');
  await expect(page.locator('.memost').first()).toHaveText('自動で保存');
  expect(await draft(page, DAY)).toBeNull();
});

test('IME 変換中は再描画で入力欄が壊れず、確定後に保存される', async ({ page }) => {
  await openMemoSpread(page);
  await ta(page).focus();
  await ta(page).evaluate((e) => { e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); e.value = 'にほ'; e.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })); });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); // 再描画の契機
  await page.setViewportSize({ width: 951, height: 668 });
  await page.waitForTimeout(150);
  await expect(ta(page)).toHaveValue('にほ');
  await expect(ta(page)).toBeFocused();
  await ta(page).evaluate((e) => { e.value = '日本'; e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
  await expect.poll(async () => (await dbMemo(page, DAY))?.text, { timeout: 3000 }).toBe('日本');
});

test('再描画でもフォーカスとカーソルを保つ', async ({ page }) => {
  await openMemoSpread(page);
  await ta(page).fill('abcdef');
  await ta(page).evaluate((e) => e.setSelectionRange(2, 4));
  await page.setViewportSize({ width: 951, height: 650 }); await page.waitForTimeout(200);
  await expect(ta(page)).toBeFocused();
  expect(await ta(page).evaluate((e) => [e.selectionStart, e.selectionEnd])).toEqual([2, 4]);
});

test('＋でメモにフォーカス。左右・縦の同じ日に同じメモを表示', async ({ page }) => {
  await openMemoSpread(page, 'left');
  await ta(page).fill('共通');
  await page.evaluate(() => document.activeElement.blur());
  await pagePick(page, 'left', '月').click();
  await pagePick(page, 'right', 'メモ').click();
  await expect(ta(page)).toHaveValue('共通');
  await page.getByRole('button', { name: '予定を追加' }).first().click();
  await expect(page.locator('#editor')).not.toHaveAttribute('open', /.*/);
  await expect(ta(page)).toBeFocused();
  await page.setViewportSize({ width: 669, height: 951 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '下の段を表示' }).click();
  await page.waitForTimeout(320);
  await page.locator('.pswitch').getByRole('button', { name: 'メモ', exact: true }).click();
  await expect(page.locator('.pnl textarea.memota')).toHaveValue('共通');
});

test('縦: メモにフォーカスするとパネルがy106まで拡大、キーボード終了（blur）で戻る', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await page.getByRole('button', { name: '下の段を表示' }).click(); await page.waitForTimeout(320);
  await page.locator('.pswitch').getByRole('button', { name: 'メモ', exact: true }).click();
  const top0 = (await page.locator('.pnl').boundingBox()).y;
  await page.locator('.pnl textarea.memota').click();
  await expect.poll(async () => Math.round((await page.locator('.pnl').boundingBox()).y)).toBe(106);
  await page.locator('.pnl textarea.memota').fill('縦メモ');
  await page.evaluate(() => document.activeElement.blur());
  await expect.poll(async () => Math.round((await page.locator('.pnl').boundingBox()).y)).toBe(Math.round(top0));
});
