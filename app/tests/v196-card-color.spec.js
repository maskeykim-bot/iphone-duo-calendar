// 第19.6版（征希さん「タスクとノートも色を選べるようにする」・2026-11-25。任意の項目 colorId を足すことは「足してよい」で承認）: タスク・ノートのカードの色（実装担当）。
// 保存の形（検証・バックアップの往復・版は 6 のまま）は test-unit/card-color.test.mjs。ここは画面の動き。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { boot, DAY } from './v193-p2-lib.js';
import { flickSet, FLICK } from '../js/colors.js';

const seed = async (page) => {
  await page.evaluate(async (day) => {
    const db = await import('/js/db.js');
    await db.addTask({ title: '色のタスク', due: { date: day, time: '17:00' } });
    await db.putNote({ id: 'n-cc', body: '色のノート\n本文', folderId: null, pinned: false, pinnedAt: null, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null, date: day });
  }, DAY);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
};
const TASK = '.mdcard.mdk-task', NOTE = '.mdcard.mdk-note[data-note="n-cc"]';
const tint = (page, sel) => page.locator(sel).first().evaluate((e) => ({ cc: e.classList.contains('cc'), tint: e.style.getPropertyValue('--cat-tint').toUpperCase(), bg: getComputedStyle(e).backgroundColor }));
const dbTask = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listTasks()).find((t) => t.title === '色のタスク'));
const dbNote = (page) => page.evaluate(async () => (await import('/js/db.js')).getNote('n-cc'));
const pick = (page, id) => page.locator(`.ccstrip [data-cc="${id}"]`).click();
const C1 = FLICK[2].id, C2 = FLICK[5].id;

test('CC-1 タスク: 編集シートの「色」で選ぶと すぐ保存され、カードがその色の薄い地になる。読み込み直しても残る。「色なし」で元の白いカードに戻り、項目ごと消える', async ({ page }) => {
  await boot(page); await seed(page);
  const white = (await tint(page, TASK)).bg;
  expect((await tint(page, TASK)).cc).toBe(false); expect('colorId' in (await dbTask(page))).toBe(false);
  await page.locator(TASK).first().click();
  await expect(page.locator('#tk-color .ccname')).toHaveText('色なし');
  await page.locator('#tk-color').click();
  await expect(page.locator('.ccstrip [data-cc]')).toHaveCount(FLICK.length + 1); // 「色なし」＋フリックの 7 色
  // 色の帯はシートの中に収まる（シートが出ている間も押せる）
  expect(await page.evaluate(() => { const m = document.querySelector('.ccstrip').getBoundingClientRect(), d = document.querySelector('dialog[open]').getBoundingClientRect(); return !!document.querySelector('dialog[open] .ccstrip') && m.left >= d.left && m.right <= d.right; })).toBe(true);
  await pick(page, C1);
  await expect(page.locator('.ccstrip')).toHaveCount(0);
  await expect(page.locator('#tk-color .ccname')).toHaveText(FLICK[2].name);
  expect((await dbTask(page)).colorId).toBe(C1);
  await expect(page.locator('#tk-title')).toHaveValue('色のタスク'); // シートは開いたまま（ほかの欄はそのまま）
  await page.keyboard.press('Escape');
  const t1 = await tint(page, TASK);
  expect(t1.cc).toBe(true); expect(t1.tint).toBe(flickSet(C1, 'light').tint.toUpperCase()); expect(t1.bg).not.toBe(white);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  expect((await tint(page, TASK)).tint).toBe(flickSet(C1, 'light').tint.toUpperCase());
  await page.locator(TASK).first().click(); await expect(page.locator('#tk-color .ccname')).toHaveText(FLICK[2].name);
  await page.locator('#tk-color').click(); await pick(page, '');
  await expect(page.locator('#tk-color .ccname')).toHaveText('色なし');
  expect('colorId' in (await dbTask(page))).toBe(false);
  await page.keyboard.press('Escape');
  const t2 = await tint(page, TASK); expect(t2.cc).toBe(false); expect(t2.bg).toBe(white);
});

test('CC-2 ノート: シートの日付の右の「色」で選ぶと、カードがその色の薄い地になる。本文・更新の時刻は変わらない。読み込み直しても残る。「色なし」で戻る', async ({ page }) => {
  await boot(page); await seed(page);
  const n0 = await dbNote(page), white = (await tint(page, NOTE)).bg;
  await page.locator(NOTE).click();
  const btn = page.locator('.nsheet .nscc');
  await expect(btn.locator('.ccname')).toHaveText('色なし');
  await btn.click(); await pick(page, C2);
  await expect(btn.locator('.ccname')).toHaveText(FLICK[5].name);
  const n1 = await dbNote(page);
  expect(n1.colorId).toBe(C2); expect(n1.body).toBe(n0.body); expect(n1.updatedAt).toBe(n0.updatedAt);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  const t1 = await tint(page, NOTE); expect(t1.cc).toBe(true); expect(t1.tint).toBe(flickSet(C2, 'light').tint.toUpperCase()); expect(t1.bg).not.toBe(white);
  await page.locator(NOTE).click(); await expect(btn.locator('.ccname')).toHaveText(FLICK[5].name);
  await btn.click(); await pick(page, '');
  await expect(btn.locator('.ccname')).toHaveText('色なし');
  expect('colorId' in (await dbNote(page))).toBe(false);
});
