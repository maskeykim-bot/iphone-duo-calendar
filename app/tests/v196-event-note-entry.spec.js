// 第19.6版（征希さん 2026-11-26「左の小さい予定を触って初めて予定ノートが開くから改善が必要」→「3つとも作る」）: 予定ノートの入口。
// A: 閉じた画面の予定のカードの右に「予定ノート」（「別日に移動」の左。書いたものがある予定は印）
// B: 見開きのノートのページの一覧の上に、選んでいる日の予定の札（押すとそのページに予定ノート）
// C: 予定のシートの「予定ノート」は予定名のすぐ下（スクロールしなくても見える）
import { test, expect } from '@playwright/test';
import { boot, DAY, dbNotes, note } from './v193-p3-lib.js';
import { SIZES, pagePick } from './helpers.js';

test('EN-A 閉じた画面: 予定のカードの「予定ノート」で 1 回で開く。書いたものがある予定は印つき。タスク・ノートのカードには出さない', async ({ page }) => {
  await boot(page, { notes: [note('nx', '会議の段取り', null, { eventRef: { k: 'd:e1', title: '会議', day: DAY } })] });
  const b1 = page.locator('.mday .mdnb[data-id="e1"]'), b2 = page.locator('.mday .mdnb[data-id="e2"]');
  await expect(b1).toBeVisible(); await expect(b2).toBeVisible();
  await expect(b1).toHaveClass(/has/); await expect(b2).not.toHaveClass(/has/);
  await expect(page.locator('.mday .mdnb')).toHaveCount(2); // 予定だけ
  const r = await b1.boundingBox(), m = await page.locator('.mday .mdmv[data-kind="event"][data-id="e1"]').boundingBox(), c = await page.locator('.mday .mdcard[data-event="e1"]').boundingBox();
  expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(44);
  expect(r.x + r.width).toBeLessThanOrEqual(m.x + 0.5); // 「別日に移動」の左
  expect(r.y).toBeGreaterThanOrEqual(c.y - 0.5); expect(r.y + r.height).toBeLessThanOrEqual(c.y + c.height + 0.5); // カードの中
  const t = await page.locator('.mday .mdcard[data-event="e1"] strong').boundingBox(); expect(t.x + t.width).toBeLessThanOrEqual(r.x + 0.5); // 題名はボタンの手前で切る
  await b1.click(); await page.waitForTimeout(500);
  await expect(page.locator('#editor[open]')).toHaveCount(0);
  await expect(page.locator('.nsheet:not([hidden])')).toBeVisible(); await expect(page.locator('.nsheet .ned-title')).toHaveValue('会議の段取り');
});

test('EN-B 見開き: ノートのページの一覧の上に、選んでいる日の予定の札。押すとそのページに予定ノート（印つきは書いたもの）', async ({ page }) => {
  await boot(page, { notes: [note('nx', '会議の段取り', null, { eventRef: { k: 'd:e1', title: '会議', day: DAY } })], size: SIZES.openLandscape951 });
  await pagePick(page, 'right', 'ノート').click(); await page.waitForTimeout(400);
  const chips = page.locator('.page.rp .nevs .nevc');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText('会議'); await expect(chips.nth(0)).toHaveClass(/has/);
  await expect(chips.nth(1)).toContainText('ランチ'); await expect(chips.nth(1)).not.toHaveClass(/has/);
  expect((await chips.nth(1).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await chips.nth(1).click(); await page.waitForTimeout(500);
  await expect(page.locator('.page.rp .nevent')).toContainText('予定: ランチ'); // 右のページに予定ノート（まだ空）
  await expect(page.locator('#editor[open]')).toHaveCount(0);
  await page.locator('.page.rp [data-act="noteback"]').click(); await page.waitForTimeout(300);
  await chips.nth(0).click(); await page.waitForTimeout(500);
  await expect(page.locator('.page.rp .ned-title')).toHaveValue('会議の段取り');
});

test('EN-C 予定のシートの「予定ノート」は予定名のすぐ下（開いたままの位置で見える）', async ({ page }) => {
  await boot(page, { notes: [] });
  await page.locator('.mday .mdcard[data-event="e1"]').click(); await expect(page.locator('#editor[open]')).toBeVisible(); await page.waitForTimeout(400);
  const t = await page.locator('#f-title').boundingBox(), b = await page.locator('#evnote').boundingBox(), d = await page.locator('#editor').boundingBox();
  expect(b.y).toBeGreaterThan(t.y); expect(b.y - (t.y + t.height)).toBeLessThan(20);
  expect(b.y + b.height).toBeLessThanOrEqual(d.y + d.height); expect(b.height).toBeGreaterThanOrEqual(44);
});

test('EN-A2 閉じた横はカードが狭い（幅 188）ので「予定ノート」のボタンは出さない（真ん中の長押しで持ち上がる。題名は右 52 の手前で切る）', async ({ page }) => {
  await boot(page, { notes: [], size: SIZES.closedLandscape });
  await expect(page.locator('.mday .mdnb[data-id="e1"]')).toBeHidden();
  const c = await page.locator('.mday .mdcard[data-event="e1"]').boundingBox(), t = await page.locator('.mday .mdcard[data-event="e1"] strong').boundingBox();
  expect(Math.abs((c.x + c.width) - (t.x + t.width) - 52)).toBeLessThanOrEqual(1);
});
