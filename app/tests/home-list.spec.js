import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, pagePick, tab } from './helpers.js';

// 第16版 PR13: ホームと予定リストの経路を分ける。2026-11-12 09:41 JST 固定。
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
const seedUi = async (page, patch) => {
  await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, ...p })); }, patch);
  await page.reload(); await page.waitForSelector('html[data-ready]');
};
const EVS = [
  ev('a1', '朝会', '2026-11-12T10:00', '2026-11-12T10:30'),
  ev('a2', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00'),
  ev('a3', '出張', '2026-11-14T09:00', '2026-11-14T18:00'),
  ev('a4', '遠い予定', '2027-01-20T11:00', '2027-01-20T12:00'),
  ev('a5', '前の予定', '2026-11-10T11:00', '2026-11-10T12:00'),
];

test('保存済みの timeMode.list は値を保ち、表示名はリスト。ホームは時間に混ざらない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seed(page, EVS);
  await seedUi(page, { pages: { left: 'home', right: 'time', portraitBottom: 'time', portraitShown: false }, timeMode: { left: '1', right: 'list' } });
  await expect(page.locator('.page.rp [data-act="tlmenu"]')).toContainText('リスト');
  await expect(page.locator('.page.rp [data-act="tlmenu"]')).not.toContainText('一覧');
  await expect(page.locator('.page.rp .agenda-list')).toBeVisible();
  await expect(page.locator('.page.rp .hero')).toHaveCount(0);
  await expect(page.locator('.page.lp[data-page="home"] .hero')).toBeVisible();
  expect((await ui(page)).timeMode).toEqual({ left: '1', right: 'list' });
});

test('予定リスト: 選択日以降だけ、日見出し32・行40、予定のない日は飛ばす', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seed(page, EVS);
  await seedUi(page, { selected: '2026-11-12', timeMode: { left: '1', right: 'list' } });
  const l = page.locator('.page.rp .agenda-list');
  await expect(l.locator('.agd')).toHaveCount(3); // 11/12・11/14・遠い予定（日が少ないので窓が自動で広がる）
  await expect(l.locator('.agh')).toHaveText([/11月12日/, /11月14日/, /1月20日/]);
  await expect(l.getByText('前の予定')).toHaveCount(0);
  expect(Math.round((await l.locator('.agh').first().boundingBox()).height)).toBe(32);
  expect(Math.round((await l.locator('.agrow').first().boundingBox()).height)).toBe(40);
  await expect(l.locator('.agrow').first()).toContainText('10:00');
  await l.getByText('歯医者').click();
  await expect(page.locator('#editor, dialog[open]').first()).toBeVisible(); // 予定の詳細が開く
});

test('予定リスト: 端までスクロールすると先の日が追加で読み込まれる。選択日を変えると起点も変わる', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  const daily = Array.from({ length: 20 }, (_, i) => ev(`d${i}`, `毎日${i}`, `2026-11-${String(12 + i).padStart(2, '0').replace(/^3[1-9]$/, '30')}T09:00`, `2026-11-${String(12 + i).padStart(2, '0').replace(/^3[1-9]$/, '30')}T09:30`));
  await seed(page, [...daily, ev('far', '遠い予定', '2027-02-01T11:00', '2027-02-01T12:00')]);
  await seedUi(page, { selected: '2026-11-12', timeMode: { left: '1', right: 'list' } });
  const l = page.locator('.page.rp .agenda-list');
  await expect(l.locator('.agd').first()).toBeVisible();
  await expect(l.getByText('遠い予定')).toHaveCount(0); // 60日の窓の外
  await l.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(l.getByText('遠い予定')).toHaveCount(1);
  await page.locator('.page.rp [data-act="next"]').click();
  await expect(l.locator('.agh').first()).toContainText('11月13日');
});

test('ホームは独立ページ: 切替にホームがあり、右でも選べる。開いた縦の下の段にもホーム', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seed(page, EVS);
  await expect(page.locator('.pgsw.pgl button')).toHaveText(['ホーム', '月', '時間', 'タスク', 'ノート']);
  await pagePick(page, 'right', 'ホーム').click();
  await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'home');
  await expect(page.locator('.page.rp .hero')).toBeVisible();
  await openApp(page, SIZES.openPortrait669);
  await seedUi(page, { pages: { left: 'home', right: 'month', portraitBottom: 'home', portraitShown: true } });
  await expect(page.locator('.pnl .pswitch button')).toHaveText(['ホーム', '時間', 'タスク', 'ノート']);
  await expect(page.locator('.pnl .hcols')).toBeVisible();
  await page.locator('.pnl [data-pnl="time"]').click();
  await expect(page.locator('.pnl .hcols')).toHaveCount(0);
});

test('閉じた画面: 下のタブは ホーム・日・週・月。保存済みの 日・週・月 は保つ', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await expect(page.locator('.tabs button')).toHaveText(['ホーム', '日', '週', '月']);
  await seedUi(page, { home: false, view: 'week' });
  await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
  await seedUi(page, { home: true, view: 'week' });
  await expect(tab(page, 'ホーム')).toHaveAttribute('aria-pressed', 'true');
  expect((await ui(page)).view).toBe('week');
});
