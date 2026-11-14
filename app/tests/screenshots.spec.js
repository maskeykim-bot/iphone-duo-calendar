import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { CAT_IDS } from '../js/categories.js';
import { openApp, seed, ev, SIZES, tab, setStyle, fillEditor, fillRepeat } from './helpers.js';

const DIR = 'screenshots';
mkdirSync(DIR, { recursive: true });
const SEED = [
  ev('p1', 'プロジェクト定例', '2026-11-12T10:00', '2026-11-12T11:00', { place: '会議室A', recurrence: { freq: 'weekly', interval: 1, byDay: [1, 4], count: 10, until: null } }),
  ev('p2', 'ランチと散歩', '2026-11-12T12:30', '2026-11-12T13:30', { categoryId: CAT_IDS.private, place: '中目黒' }),
  ev('p3', '秋のゴルフ合宿', '2026-11-13T00:00', '2026-11-15T23:59', { categoryId: CAT_IDS.family, all: true, place: '軽井沢' }),
];
const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png` });

test.describe('スクリーンショット', () => {
  test('editor-repeat / repeat-scope / month-repeat（閉じた縦）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, SEED);
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    await shot(page, 'month-repeat');
    await page.locator('[data-date="2026-11-16"]').click({ position: { x: 12, y: 10 } });
    await page.locator('.daylist .event').first().click();
    await fillRepeat(page, {});
    await shot(page, 'editor-repeat');
    await fillEditor(page, { title: 'プロジェクト定例（改）' });
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#scope')).toBeVisible();
    await shot(page, 'repeat-scope');
  });

  test('search-closed / backup / import-confirm（閉じた縦）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, SEED);
    await page.getByRole('button', { name: '予定を検索' }).click();
    await page.locator('#sr-q').fill('ぷろじぇくと');
    await expect(page.locator('#sr-body .hit').first()).toBeVisible();
    await shot(page, 'search-closed');
    await page.locator('#sr-close').click();
    await page.getByRole('button', { name: 'その他' }).click();
    await page.getByRole('button', { name: 'バックアップ' }).click();
    await shot(page, 'backup');
    await page.setInputFiles('#bk-file', { name: 'duo-calendar-backup-2026-11-13.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T09:41:00+09:00', events: [...SEED.slice(0, 2), ev('n1', '新しい予定', '2026-12-01T10:00', '2026-12-01T11:00')] })) });
    await expect(page.locator('#bk-add')).toBeVisible();
    await shot(page, 'import-confirm');
  });

  test('search-open-landscape（開いた横）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await seed(page, SEED);
    await page.getByRole('button', { name: '予定を検索' }).click();
    await page.locator('#sr-q').fill('定例');
    await expect(page.locator('#sr-body .hit').first()).toBeVisible();
    await shot(page, 'search-open-landscape');
  });
});

// ---- 第10版 ⑤: 月表示（閉じた／開いた縦／開いた横）。11月・selected=14日・menu閉・フォント読込後2RAF ----
const V10 = [
  ['closed', SIZES.closedPortrait], ['open-portrait', SIZES.openPortrait], ['open-portrait', SIZES.openPortrait669],
  ['open-landscape', SIZES.openLandscape], ['open-landscape', SIZES.openLandscape951],
];
const V10SEED = [
  ...Array.from({ length: 5 }, (_, i) => ev(`s${i}`, ['米 耐久財受注・速報', 'FOMC 政策', '歯医者', '打ち合わせ', 'ジム'][i], `2026-11-27T${String(9 + i).padStart(2, '0')}:00`, `2026-11-27T${String(9 + i).padStart(2, '0')}:30`)),
  ev('pay', '給与振込み', '2026-11-13T00:00', '2026-11-14T23:59', { all: true, categoryId: CAT_IDS.family }),
  ...SEED,
];
for (const [posture, size] of V10) {
  for (const theme of ['light', 'dark']) {
    test(`v10 ${posture} ${size.width}x${size.height} month named ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openApp(page, size);
      await seed(page, V10SEED);
      if (posture === 'closed') await tab(page, '月').click();
      await setStyle(page, '予定名');
      await page.locator('[data-date="2026-11-14"]').first().click({ position: { x: 12, y: 10 } }).catch(() => {});
      await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
      await shot(page, `v10-${posture}-${size.width}x${size.height}-month-named-${theme}`);
    });
  }
  if (posture === 'closed' || posture === 'open-landscape') {
    test(`v10 ${posture} ${size.width}x${size.height} month simple light`, async ({ page }) => {
      await openApp(page, size);
      await seed(page, V10SEED);
      if (posture === 'closed') await tab(page, '月').click();
      await setStyle(page, '手帳');
      await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
      await shot(page, `v10-${posture}-${size.width}x${size.height}-month-simple-light`);
    });
  }
  test(`v10 ${posture} ${size.width}x${size.height} month all light（先頭／末尾）`, async ({ page }) => {
    await openApp(page, size);
    await seed(page, V10SEED);
    if (posture === 'closed') await tab(page, '月').click();
    await page.locator('.allbtn').click();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
    await shot(page, `v10-${posture}-${size.width}x${size.height}-month-all-light`);
    await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await shot(page, `v10-${posture}-${size.width}x${size.height}-month-all-light-scroll-end`);
  });
}
