import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick, seed, ev } from './helpers.js';

// 第14版 PR11: メモの印・一覧・検索
const putMemo = (page, d, t) => page.evaluate(async ([d, t]) => (await import('/js/db.js')).putMemo(d, t), [d, t]);
const ta = (page) => page.locator('textarea.memota').first();
const day = (page, k) => page.locator(`.week .day[data-date="${k}"]`);

test('月のマスに12×2の線（y15.5〜17.5・数字の中心）。保存で出て、空にすると消える', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await putMemo(page, '2026-11-20', '会議');
  await page.reload(); await page.waitForSelector('html[data-ready]');
  const line = day(page, '2026-11-20').locator('.mline');
  await expect(line).toHaveCount(1);
  const g = await day(page, '2026-11-20').evaluate((d) => { const b = d.getBoundingClientRect(), l = d.querySelector('.mline').getBoundingClientRect(), n = d.querySelector('.num').getBoundingClientRect(); return { w: l.width, h: l.height, top: l.top - b.top, cx: l.left + l.width / 2, ncx: n.left + n.width / 2 }; });
  expect(g.w).toBe(12); expect(g.h).toBe(2); expect(g.top).toBeCloseTo(15.5, 0); expect(Math.abs(g.cx - g.ncx)).toBeLessThan(1.5);
  await expect(day(page, '2026-11-21').locator('.mline')).toHaveCount(0);
  // 右ページをメモにして書く → 印が出る／空にすると消える
  await pagePick(page, 'right', 'メモ').click();
  await ta(page).fill('今日');
  await expect(day(page, '2026-11-12').locator('.mline')).toHaveCount(1);
  await ta(page).fill('  \n ');
  await expect(day(page, '2026-11-12').locator('.mline')).toHaveCount(0);
});

test('一覧: 新しい日順・1行56・検索欄・タップでその日へ。左右で使える', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await putMemo(page, '2026-11-01', 'A古い\n2行目');
  await putMemo(page, '2026-11-30', 'B新しい');
  await putMemo(page, '2026-11-15', '<b>C</b>');
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'right', 'メモ').click();
  await page.locator('.page.rp').getByRole('button', { name: /メモの一覧/ }).click();
  const rows = page.locator('.page.rp .mrow');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('B新しい');
  await expect(rows.nth(1)).toContainText('<b>C</b>');
  expect(await page.locator('.page.rp .mrow b').count()).toBe(3);
  expect(await rows.first().evaluate((e) => e.getBoundingClientRect().height)).toBe(56);
  await page.locator('.page.rp .mlq').fill('古い');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(ta(page)).toHaveValue('A古い\n2行目');
  await expect(page.locator('.page.rp .rdate')).toContainText('1日');
});

test('一覧の56行: 多数でも描ける', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.evaluate(async () => { const db = await import('/js/db.js'); for (let i = 1; i <= 28; i++) await db.putMemo(`2026-10-${String(i).padStart(2, '0')}`, `メモ${i}`); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'left', 'メモ').click();
  await page.locator('.page.lp').getByRole('button', { name: /メモの一覧/ }).click();
  await expect(page.locator('.page.lp .mrow')).toHaveCount(28);
});

test('検索: 別「メモ」段・正規化AND・XSS安全・日付へ移動・予定件数と別', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seed(page, [ev('e1', 'ランチ', '2026-11-13T12:00', '2026-11-13T13:00')]);
  await putMemo(page, '2027-02-03', 'ﾗﾝﾁ の <b>メモ</b> 本文');
  await putMemo(page, '2026-01-01', '別の話');
  await page.getByRole('button', { name: '予定を検索' }).first().click();
  await page.locator('#sr-q').fill('らんち メモ');
  const mem = page.locator('#sr-body [data-sec="memo"]');
  await expect(mem).toContainText('1件のメモ（全期間・最大200件）');
  await expect(page.locator('#sr-body [data-sec="events"]')).toContainText('該当する予定はありません');
  expect(await page.locator('#sr-body b').count()).toBe(0);
  await expect(mem.locator('mark').first()).toBeVisible();
  await page.locator('#sr-q').fill('ランチ');
  await expect(page.locator('#sr-body [data-sec="events"]')).toContainText('1件の予定');
  await expect(mem).toContainText('1件のメモ');
  await mem.locator('.mhit').click();
  await expect(page.locator('#search')).toBeHidden();
  await pagePick(page, 'right', 'メモ').click();
  await expect(ta(page)).toHaveValue('ﾗﾝﾁ の <b>メモ</b> 本文');
});

test('DB から消えたメモの印は再読込で消える', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await putMemo(page, '2026-11-18', 'X');
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.day[data-date="2026-11-18"] .mline')).toHaveCount(1);
  await page.evaluate(async () => { await (await import('/js/db.js')).deleteMemo('2026-11-18'); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.day[data-date="2026-11-18"] .mline')).toHaveCount(0);
});

test('下パネルで一覧が使え、線は六曜・+N・チップと重ならない', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await seed(page, [1, 2, 3, 4, 5].map((i) => ev(`m${i}`, `予定${i}`, '2026-11-18T10:00', '2026-11-18T11:00')));
  await putMemo(page, '2026-11-18', '下メモ');
  await page.reload(); await page.waitForSelector('html[data-ready]');
  const d = page.locator('.day[data-date="2026-11-18"]');
  await expect(d.locator('.mline')).toHaveCount(1);
  const boxes = await page.evaluate(() => {
    const day = document.querySelector('.day[data-date="2026-11-18"]'), wk = day.parentElement, r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    return { line: r(day.querySelector('.mline')), others: [...wk.querySelectorAll('.rk,.plus,.strip,.bar')].map(r).concat(day.querySelector('.rk') ? [r(day.querySelector('.rk'))] : []) };
  });
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const o of boxes.others) expect(hit(boxes.line, o)).toBe(false);
  await page.getByRole('button', { name: '下の段を表示' }).click();
  await page.waitForTimeout(320);
  await page.locator('.pswitch').getByRole('button', { name: 'メモ', exact: true }).click();
  await page.locator('.pnl').getByRole('button', { name: /メモの一覧/ }).click();
  await expect(page.locator('.pnl .mrow')).toHaveCount(1);
  await expect(page.locator('.pnl .mrow')).toContainText('下メモ');
});
