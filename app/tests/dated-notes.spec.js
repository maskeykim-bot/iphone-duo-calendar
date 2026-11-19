import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick } from './helpers.js';

// 第17版 PR3: 月の印・日で絞る・長押し「この日のノート」。日付は note.date（noteDateOf）。
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const notes = (page) => page.evaluate(async () => (await import('/js/db.js')).listNotes());
const reload = async (page) => { await page.reload(); await page.waitForSelector('html[data-ready]'); };
const base = (id, body, date, extra = {}) => ({ id, body, createdAt: 5, updatedAt: Date.UTC(2026, 10, 1) + body.length, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null, ...extra });
const dayCenter = (page, key) => page.locator(`.week .day[data-date="${key}"]`).first().evaluate((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 6 }; });
const longRelease = async (page, key) => { const a = await dayCenter(page, key); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(420); await page.mouse.up(); };

test.describe('月の印・日で絞る・長押し', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await putNote(page, base('a', '会議メモ', '2026-11-18'));
    await putNote(page, base('b1', '重なりその1', '2026-11-20'));
    await putNote(page, base('b2', '重なりその2', '2026-11-20'));
    await putNote(page, base('gone', '削除済み', '2026-11-22', { deletedAt: 1 }));
    await putNote(page, base('nodate', '日付なし', null));
    await reload(page);
    await pagePick(page, 'right', 'ノート').click();
  });

  test('日付のある日だけ線が出る（複数でも1本、削除済み・日付なしは出ない）', async ({ page }) => {
    const mark = (k) => page.locator(`.week .day[data-date="${k}"] .mline`);
    await expect(mark('2026-11-18')).toHaveCount(1);
    await expect(mark('2026-11-20')).toHaveCount(1);
    await expect(mark('2026-11-22')).toHaveCount(0);
    await expect(mark('2026-11-19')).toHaveCount(0);
    await expect(page.locator('.mline')).toHaveCount(2);
  });

  test('月の日をたたくと右の一覧がその日に絞られ、✕で戻る', async ({ page }) => {
    await expect(page.locator('.page.rp .mrow')).toHaveCount(4);
    await page.locator('.week .day[data-date="2026-11-18"]').first().click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.page.rp .nday')).toContainText('11月18日');
    await expect(page.locator('.page.rp .nday')).toContainText('のノート');
    await expect(page.locator('.page.rp .mrow')).toHaveCount(1);
    await page.locator('.page.rp [data-act="ndayclear"]').click();
    await expect(page.locator('.page.rp .nday')).toHaveCount(0);
    await expect(page.locator('.page.rp .mrow')).toHaveCount(4);
  });

  test('＋: 1件ならそのノートを開く／複数なら一覧のまま／0件なら日ごとのメモに新規', async ({ page }) => {
    const day = (k) => page.locator(`.week .day[data-date="${k}"]`).first().click({ position: { x: 12, y: 10 } });
    await day('2026-11-20');
    await expect(page.locator('.page.rp .mrow')).toHaveCount(2);
    await page.locator('.page.rp [data-act="ndayplus"]').click();
    await expect(page.locator('.page.rp .mrow')).toHaveCount(2); // 新規は作らない
    expect((await notes(page)).length).toBe(4);
    await day('2026-11-18');
    await page.locator('.page.rp [data-act="ndayplus"]').click();
    await expect(page.locator('.ned-title').first()).toHaveValue(/会議メモ/);
    await page.locator('.page.rp [data-act="noteback"]').click();
    await day('2026-11-25');
    await page.locator('.page.rp [data-act="ndayplus"]').click();
    await expect(page.locator('.ned-title').first()).toHaveValue(/2026年11月25日（水）/);
    await expect.poll(async () => (await notes(page)).filter((n) => n.date === '2026-11-25').length).toBe(1);
    const made = (await notes(page)).find((n) => n.date === '2026-11-25');
    expect(made.folderId).toBe('folder-daily-memos');
    expect((await notes(page)).length).toBe(5);
  });

  test('長押しして同じ日で離すとメニュー。「この日のノート」は＋と同じ規則', async ({ page }) => {
    await longRelease(page, '2026-11-18');
    const menu = page.locator('.cmenu[data-daymenu]');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((e) => e.getBoundingClientRect().width)).toBe(160);
    await expect(page.locator('#editor')).toBeHidden();
    await menu.locator('[data-dm="note"]').click();
    await expect(page.locator('.ned-title').first()).toHaveValue(/会議メモ/);
    await page.locator('.page.rp [data-act="noteback"]').click();
    await longRelease(page, '2026-11-20');
    await page.locator('.cmenu [data-dm="note"]').click();
    await expect(page.locator('.page.rp .nday')).toContainText('11月20日');
    await expect(page.locator('.page.rp .mrow')).toHaveCount(2);
    expect((await notes(page)).filter((n) => n.date === '2026-11-20').length).toBe(2); // 重なりは残る
  });

  test('長押しメニューの「終日の予定」は従来のシート。複数日なぞりはメニューを出さない', async ({ page }) => {
    await longRelease(page, '2026-11-19');
    await page.locator('.cmenu [data-dm="ev"]').click();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-all')).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeHidden(); // S4: シートは閉じる動き（0.25秒）が終わってから閉じる
    const a = await dayCenter(page, '2026-11-24'), b = await dayCenter(page, '2026-11-25');
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('.cmenu[data-daymenu]')).toHaveCount(0);
  });

  test('時間ページの日見出しの「ノート n」チップで右ページがノートになり、その日に絞られる', async ({ page }) => {
    await pagePick(page, 'right', '時間').click();
    await page.locator('.week .day[data-date="2026-11-20"]').first().click({ position: { x: 12, y: 10 } });
    const chip = page.locator('.page.rp .ndchip');
    await expect(chip).toContainText('ノート 2');
    expect(await chip.evaluate((e) => e.getBoundingClientRect().height)).toBe(22);
    await chip.click();
    await expect(page.locator('.page.rp .nday')).toContainText('11月20日');
    await expect(page.locator('.page.rp .mrow')).toHaveCount(2);
  });
});
