import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick, legacyPanelInit, bodyIs } from './helpers.js';

// 第16版 PR28: 旧「日ごとのメモ」はノートへ切り替え済み。編集・自動保存・下書き回復・旧下書きの取り込みを通常の画面から検査する。
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const allNotes = (page) => page.evaluate(async () => (await import('/js/db.js')).listNotes({ includeDeleted: true }));
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const drafts = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('duo.note.draft.v1:')));
const title = (page) => page.locator('.ned-title').first();
const body = (page) => page.locator('.ned-body').first();
async function openNotes(page, side = 'right') {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, side, 'ノート').click();
}
async function newNote(page) {
  await page.locator('[data-act="notenew"]').first().click();
  await expect(title(page)).toBeVisible();
}

test('見開き: 空の一覧→＋新規→題名と本文を書くと保存ボタンなしで保存され、再読込で同じノートが開く', async ({ page }) => {
  await openNotes(page);
  await expect(page.locator('.mlist').first()).toContainText('ノートはまだありません');
  await newNote(page);
  await expect(title(page)).toHaveAttribute('placeholder', '新規ノート');
  await title(page).fill('買い物');
  await body(page).fill('<b>牛乳</b>\n卵');
  expect((await allNotes(page)).length).toBe(0); // まだ（1秒待ち）
  expect((await drafts(page)).length).toBe(1);
  await expect.poll(async () => (await allNotes(page))[0]?.body, { timeout: 3000 }).toBe('買い物\n<b>牛乳</b>\n卵');
  expect(await drafts(page)).toEqual([]);
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'right', 'ノート').click();
  await expect(title(page)).toHaveValue('買い物'); // 最後に開いたノートが戻る
  await bodyIs(body(page), '<b>牛乳</b>\n卵');
  expect(await page.locator('.notepage b').count()).toBe(0); // HTML として解釈しない
  expect(await page.evaluate(async () => (await (await import('/js/db.js')).listMemos()).length)).toBe(0); // 旧 memos へは書かない
});

test('一覧へ戻る前に即保存され、別のノートを開いても各ノートの本文が残る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await putNote(page, { id: 'a', body: 'A\n一', createdAt: 1, updatedAt: 10, folderId: null });
  await putNote(page, { id: 'b', body: 'B\n二', createdAt: 1, updatedAt: 5, folderId: null });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'right', 'ノート').click();
  await expect(page.locator('.mrow')).toHaveCount(2);
  expect(await page.locator('.mrow').first().getAttribute('data-nrow')).toBe('a'); // 新しい順
  await page.locator('.mrow[data-nrow="a"]').click();
  await expect(title(page)).toHaveValue('A'); // 読み込み後に打つ
  await body(page).fill('一を直した');
  await page.locator('[data-act="noteback"]').click();
  await expect(page.locator('.mrow')).toHaveCount(2);
  expect((await getNote(page, 'a')).body).toBe('A\n一を直した');
  await page.locator('.mrow[data-nrow="b"]').click();
  await bodyIs(body(page), '二');
});

test('hidden で待たず即保存。空にしても本文はノートに残る（勝手に消さない）', async ({ page }) => {
  await openNotes(page);
  await newNote(page);
  await title(page).fill('x');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await allNotes(page))[0]?.body, { timeout: 800 }).toBe('x');
});

test('再起動: 残ったノートの下書きを復元して保存する。旧メモの下書きはDBより新しい分だけノートへ取り込み、旧キーは commit 後に消える', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.evaluate(async () => {
    const d = await import('/js/db.js');
    await d.putMemo('2026-11-10', '新しいDB', 5000);
    await d.putMemo('2026-11-09', '未編集', 6000);
    await d.migrateNotesOnce(); // 起動済みの端末では、旧メモはもうノートに複製されている
    await d.putNote({ id: 'n1', body: '元', createdAt: 1, updatedAt: 2, folderId: null });
    localStorage.setItem('duo.note.draft.v1:n1', JSON.stringify({ id: 'n1', text: '落ちる前', at: Date.now(), createdAt: 1 }));
    localStorage.setItem('duo.memo.draft.v1:2026-11-10', JSON.stringify({ date: '2026-11-10', text: '古い', at: 1 }));
    localStorage.setItem('duo.memo.draft.v1:2026-11-09', JSON.stringify({ date: '2026-11-09', text: '未編集の続き', at: Date.now() }));
    localStorage.setItem('duo.memo.draft.v1:2026-11-12', JSON.stringify({ date: '2026-11-12', text: '旧メモの下書き', at: Date.now() }));
  });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect.poll(async () => (await getNote(page, 'n1'))?.body).toBe('落ちる前');
  const n = await getNote(page, 'memo-2026-11-12');
  expect(n.body).toContain('旧メモの下書き'); expect(n.sourceDate).toBe('2026-11-12');
  expect((await getNote(page, 'memo-2026-11-09')).body).toContain('未編集の続き'); // 未編集の移行ノートは更新
  expect((await getNote(page, 'memo-2026-11-10')).body).toContain('新しいDB'); // 古い下書きでは上書きしない
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('duo.memo.draft.v1:')))).toEqual([]);
  expect(await page.evaluate(async () => (await (await import('/js/db.js')).getMemo('2026-11-10')).text)).toBe('新しいDB'); // 旧 memos は不変
  expect(await drafts(page)).toEqual([]);
});

test('DB 失敗は下書きを残して表示し、再試行で保存できる', async ({ page }) => {
  await openNotes(page);
  await newNote(page);
  await page.evaluate(() => { const o = IDBObjectStore.prototype.put; window.__failPut = true; IDBObjectStore.prototype.put = function (...a) { if (window.__failPut && this.name === 'notes') throw new Error('boom'); return o.apply(this, a); }; });
  await title(page).fill('守る');
  await expect(page.locator('.ned-status').first()).toContainText('ノートを保存できませんでした。', { timeout: 3000 });
  expect((await drafts(page)).length).toBe(1);
  await page.evaluate(() => { window.__failPut = false; });
  await page.locator('.ned-retry').click();
  await expect.poll(async () => (await allNotes(page))[0]?.body).toBe('守る');
  expect(await drafts(page)).toEqual([]);
});

test('IME 変換中は再描画で入力欄が壊れず、確定後に保存される', async ({ page }) => {
  await openNotes(page);
  await newNote(page);
  await body(page).focus();
  await body(page).evaluate((e) => { e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); e.value = 'にほ'; e.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })); });
  await page.setViewportSize({ width: 951, height: 668 });
  await page.waitForTimeout(150);
  await bodyIs(body(page), 'にほ');
  await expect(body(page)).toBeFocused();
  await body(page).evaluate((e) => { e.value = '日本'; e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); });
  await expect.poll(async () => (await allNotes(page))[0]?.body, { timeout: 3000 }).toBe('\n日本');
});

test('再描画でもフォーカスとカーソルを保つ', async ({ page }) => {
  await openNotes(page);
  await newNote(page);
  await body(page).fill('abcdef');
  await body(page).evaluate((e) => e.setSelectionRange(2, 4));
  await page.setViewportSize({ width: 951, height: 650 }); await page.waitForTimeout(250);
  await expect(body(page)).toBeFocused();
  expect(await body(page).evaluate((e) => [e.selectionStart, e.selectionEnd, e.value])).toEqual([2, 4, 'abcdef']);
});

test('＋で新しいノートに入り、縦の下パネルでも同じ最後のノートが開く', async ({ page }) => {
  await legacyPanelInit(page);
  await openApp(page, SIZES.openLandscape951);
  await putNote(page, { id: 'k', body: '共通\n本文', createdAt: 1, updatedAt: 2, folderId: null });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'left', 'ノート').click();
  await page.locator('.mrow[data-nrow="k"]').click();
  await bodyIs(body(page), '本文');
  await pagePick(page, 'left', '月').click();
  await pagePick(page, 'right', 'ノート').click();
  await expect(title(page)).toHaveValue('共通');
  await page.getByRole('button', { name: '予定を追加' }).first().click();
  await expect(page.locator('#editor')).not.toHaveAttribute('open', /.*/);
  await expect(title(page)).toBeFocused(); // ＋は新しいノート
  await expect(title(page)).toHaveValue('');
  await page.setViewportSize({ width: 669, height: 951 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '下の段を表示' }).click();
  await page.waitForTimeout(320);
  await page.locator('.pswitch').getByRole('button', { name: 'ノート', exact: true }).click();
  await expect(page.locator('.pnl .ned-title')).toBeVisible();
});

// 第19.1版 S3: FIX1（全部の月の下パネルで書式バーが本文を覆う件）を直したので通常のテストに戻した。
test('縦: ノートにフォーカスするとパネルがy146（grid-top）まで拡大、キーボード終了（blur）で戻る', async ({ page }) => {
  await legacyPanelInit(page);
  await openApp(page, SIZES.openPortrait669);
  await putNote(page, { id: 'k', body: '縦\n本文', createdAt: 1, updatedAt: 2, folderId: null });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await page.getByRole('button', { name: '下の段を表示' }).click(); await page.waitForTimeout(320);
  await page.locator('.pswitch').getByRole('button', { name: 'ノート', exact: true }).click();
  await page.locator('.pnl .mrow[data-nrow="k"]').click();
  const top0 = (await page.locator('.pnl').boundingBox()).y;
  // FIX1: 書式バー（.ned-fmt）が本文を覆わない。本文の中心をたたくと本文に当たる。
  const hit = await page.evaluate(() => { const b = document.querySelector('.pnl .ned-body').getBoundingClientRect(), f = document.querySelector('.pnl .ned-fmt').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + Math.min(b.height / 2, 20)); return { onBody: !!e?.closest('.ned-body'), overlap: f.bottom > b.top && f.top < b.bottom && f.right > b.left && f.left < b.right }; });
  expect(hit.onBody).toBe(true); expect(hit.overlap).toBe(false);
  await page.locator('.pnl .ned-body').click();
  await expect.poll(async () => Math.round((await page.locator('.pnl').boundingBox()).y)).toBe(146);
  await page.locator('.pnl .ned-body').fill('縦ノート');
  await page.evaluate(() => document.activeElement.blur());
  await expect.poll(async () => Math.round((await page.locator('.pnl').boundingBox()).y)).toBe(Math.round(top0));
});
