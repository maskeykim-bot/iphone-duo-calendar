// 第19.2版 S11g: 61b9ce7 のレビューの直し（実装担当）。
// 値の根拠: design/34 §17（17-1 K-1・17-2 K-2・17-5）、design/review/review-v19-2-61b9ce7-closed-final.md、research/review-v19-2-61b9ce7-closed-2026-11-22.md、data/連携_レビュー_61b9ce7.md 低1。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openApp, seed, ev, SIZES, clickSettings } from './helpers.js';

const DAY = '2026-11-12', FILL = 'rgb(239, 236, 228)', LINE = 'rgb(228, 224, 214) 0px 0.5px 0px 0px inset';
const SEED = [...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`)), ev('ad', '終日の予定', DAY, DAY, { all: true })];
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
async function boot(page, { sar = 84, land = false } = {}) {
  await page.addInitScript((sar) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar}px`)), sar);
  await page.clock.setFixedTime(new Date(`${DAY}T09:41:00+09:00`));
  await openApp(page, SIZES.closedPortrait);
  await seed(page, SEED);
  if (land) { await page.setViewportSize({ width: 678, height: 466 }); await page.waitForTimeout(600); }
}
async function toStage(page, n) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown');
  await page.waitForTimeout(400); await page.evaluate(() => document.activeElement?.blur());
}
// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: §17-1（K-1）・§17-2（K-2）「貼り付いたつまみ（下）の下を日の欄の地で埋める」の試験（縦横 × 帯あり／なし × 段 × A・B の 4 本＋段1＋帯なしの＋の 2 本）は外した。
// カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-* はすべて捨てる」）。
// 代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16（貼り付き・埋めた面が無い）。§17-5 と連携 低1 はそのまま。

test.describe('S11g §17-5 帯なしの横で、ノートのシートの上にタスクのバッジを出さない', () => {
  test('シートを開いている間はバッジ（x660〜678・y0〜18）が見えず、閉じると戻る', async ({ page }) => {
    await boot(page, { sar: 0, land: true });
    await page.evaluate(async (d) => { const db = await import('/js/db.js'); const t = Date.parse(`${d}T00:00:00+09:00`); await db.putTask({ id: 'g1', title: '今日のタスク', due: { date: d }, done: false, doneAt: null, createdAt: t, updatedAt: t, order: 1, note: '', notify: false }); }, DAY);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    const bdg = page.locator('.shell.closed .cb.ctask .bdg');
    await expect(bdg).toBeVisible();
    const b = await bdg.boundingBox(); expect(b.x).toBeCloseTo(660, 0); expect(b.y).toBeCloseTo(0, 0); expect(b.width).toBeCloseTo(18, 0);
    await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(150);
    await page.locator('.mday [data-act="daynote"]').click(); await page.waitForTimeout(600);
    const sh = await page.locator('.nsheet').boundingBox(); expect(sh.y).toBeCloseTo(8, 0); expect(sh.x + sh.width).toBeCloseTo(678, 0);
    await expect(bdg).toBeHidden();
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page.locator('.nsheet')).toBeHidden();
    await expect(bdg).toBeVisible();
  });
});

test.describe('S11g 連携 低1 閉じた画面で書き出したバックアップの settings.view', () => {
  test('開いた縦で「週」にして閉じ、閉じた画面（月）で書き出す → settings.view は開いた側の week', async ({ page }, info) => {
    await openApp(page, SIZES.openPortrait669 || SIZES.openPortrait);
    await page.getByRole('button', { name: '週', exact: true }).click(); await page.waitForTimeout(300);
    await page.setViewportSize({ width: 466, height: 678 }); await page.waitForTimeout(600);
    await expect(page.locator('.shell.closed')).toBeVisible();
    await clickSettings(page);
    await page.getByRole('button', { name: 'バックアップ' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
    const p = info.outputPath('bk.json'); await dl.saveAs(p);
    expect(JSON.parse(fs.readFileSync(p, 'utf8')).settings.view).toBe('week');
  });
});
