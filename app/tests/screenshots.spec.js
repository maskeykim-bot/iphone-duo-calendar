import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { openApp, seed, ev, SIZES, tab, setStyle, fillEditor, fillRepeat } from './helpers.js';

const DIR = 'screenshots';
mkdirSync(DIR, { recursive: true });
const SEED = [
  ev('p1', 'プロジェクト定例', '2026-11-12T10:00', '2026-11-12T11:00', { place: '会議室A', recurrence: { freq: 'weekly', interval: 1, byDay: [1, 4], count: 10, until: null } }),
  ev('p2', 'ランチと散歩', '2026-11-12T12:30', '2026-11-12T13:30', { cat: 'private', place: '中目黒' }),
  ev('p3', '秋のゴルフ合宿', '2026-11-13T00:00', '2026-11-15T23:59', { cat: 'golf', all: true, place: '軽井沢' }),
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
