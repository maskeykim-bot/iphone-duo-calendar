// 第19.6版（設計「見開き｜残す機能とボタン配置」・征希さん 2026-11-26「各ページの上（設計どおり）」「配置に進む」）: 見開きのページ名と「配置」（実装担当）。
// ページ名と帯の寸法・全組み合わせは tests/pages.spec.js。ここは 開け閉めと「配置」。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick } from './helpers.js';

const L = SIZES.openLandscape951;
const kinds = (page) => page.evaluate(() => [...document.querySelectorAll('.spread .page')].map((p) => p.dataset.page));
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')));
const item = (page, name) => page.locator('.pgcfgm').getByRole('menuitem', { name, exact: true });

test('SP-1 ページ名: 各ページの上に 1 つずつ（高さ 32・押せる 44）。押すと下に切り替えの帯、もう一度・外を押す・選ぶ で閉じる。下のタブとぼかしは無い', async ({ page }) => {
  await openApp(page, L);
  await expect(page.locator('.pgname')).toHaveCount(2); await expect(page.locator('.pgsw, .tabs, .tabfade')).toHaveCount(0);
  const n = await page.locator('.pgname.pgl').boundingBox(); expect(Math.round(n.height)).toBe(32); expect(Math.round(n.y)).toBe(8);
  expect(await page.locator('.pgname.pgl').evaluate((e) => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + 10, r.top - 5) === e && document.elementFromPoint(r.left + 10, r.bottom + 5) === e; })).toBe(true); // 上下 6 まで押せる（44）
  // ページの中身はページ名の行の下から
  expect((await page.locator('.page.lp').boundingBox()).y).toBe(48);
  await page.locator('.pgname.pgl').click();
  await expect(page.locator('.pgname.pgl')).toHaveAttribute('aria-expanded', 'true'); await expect(page.locator('.pgsw.pgl button')).toHaveCount(5);
  await page.locator('.pgname.pgl').click(); await expect(page.locator('.pgsw')).toHaveCount(0);
  await page.locator('.pgname.pgr').click(); await expect(page.locator('.pgsw.pgr')).toHaveCount(1);
  await page.mouse.click(300, 400); await expect(page.locator('.pgsw')).toHaveCount(0); // 外を押す
  const [l0] = await kinds(page);
  await pagePick(page, 'left', l0 === 'task' ? '時間' : 'タスク').click();
  await expect(page.locator('.pgsw')).toHaveCount(0); await expect(page.locator('.pgname.pgl span')).toHaveText(l0 === 'task' ? '時間' : 'タスク');
});

test('SP-2 配置: 右ページの上の右端。「左右を入れ替える」で左右が入れ替わる（読み込み直しても同じ）', async ({ page }) => {
  await openApp(page, L);
  await pagePick(page, 'left', '月').click(); await pagePick(page, 'right', '時間').click();
  const c = await page.locator('.pgcfg').boundingBox(), rp = await page.locator('.page.rp').boundingBox();
  expect(Math.round(c.height)).toBe(32); expect(c.x + c.width).toBeLessThanOrEqual(rp.x + rp.width + 0.5); expect(c.x).toBeGreaterThan(951 / 2 + 10);
  await page.locator('.pgcfg').click();
  await item(page, '左右を入れ替える').click();
  expect(await kinds(page)).toEqual(['time', 'month']);
  await expect(page.locator('.pgcfgm')).toHaveCount(0);
  await page.reload(); await page.waitForSelector('html[data-ready]');
  expect(await kinds(page)).toEqual(['time', 'month']);
});

test('SP-3 配置: いまの組み合わせを保存して、あとで呼び出せる。同じ物は二重に保存しない。4 つまで。× で消せる。保存先は表示の設定だけ', async ({ page }) => {
  await openApp(page, L);
  await pagePick(page, 'left', '月').click(); await pagePick(page, 'right', '時間').click();
  await page.locator('.pgcfg').click(); await item(page, '「月｜時間」を保存').click();
  expect((await ui(page)).pageSets).toEqual([{ left: 'month', right: 'time' }]);
  await page.locator('.pgcfg').click(); await expect(item(page, '「月｜時間」は保存済み')).toBeDisabled(); await page.keyboard.press('Escape');
  await pagePick(page, 'left', 'タスク').click(); await pagePick(page, 'right', 'ノート').click();
  await page.locator('.pgcfg').click(); await item(page, '「タスク｜ノート」を保存').click();
  // 呼び出す
  await page.locator('.pgcfg').click(); await item(page, '月｜時間').click();
  expect(await kinds(page)).toEqual(['month', 'time']);
  await page.reload(); await page.waitForSelector('html[data-ready]');
  expect((await ui(page)).pageSets).toEqual([{ left: 'month', right: 'time' }, { left: 'task', right: 'memo' }]);
  // 消す
  await page.locator('.pgcfg').click(); await page.locator('.pgcfgm').getByRole('button', { name: 'タスク｜ノート を消す' }).click();
  await expect.poll(async () => (await ui(page)).pageSets).toEqual([{ left: 'month', right: 'time' }]);
  // 4 つまで
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.pageSets = [['home', 'month'], ['month', 'time'], ['time', 'task'], ['task', 'memo'], ['memo', 'home'], ['x', 'y'], ['month', 'month']].map(([left, right]) => ({ left, right })); localStorage.setItem('duo.ui.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await pagePick(page, 'left', 'ノート').click(); await pagePick(page, 'right', 'ホーム').click();
  await page.locator('.pgcfg').click();
  await expect(page.locator('.pgcfgm [data-pc="use"]')).toHaveCount(4); await expect(item(page, '保存は 4 つまで')).toBeDisabled();
});

test('SP-4 「今日＋明日」の型と開いた縦・閉じた画面には、ページ名も配置も出さない', async ({ page }) => {
  await openApp(page, L);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.spreadType = 'tt'; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.shell.tt')).toHaveCount(1); await expect(page.locator('.pgname, .pgcfg')).toHaveCount(0); expect((await page.locator('.dpage.lp').boundingBox()).y).toBe(0);
  await page.setViewportSize(SIZES.openPortrait669); await page.waitForTimeout(400); await expect(page.locator('.pgname, .pgcfg')).toHaveCount(0);
  await page.setViewportSize(SIZES.closedPortrait); await page.waitForTimeout(400); await expect(page.locator('.pgname, .pgcfg')).toHaveCount(0);
});
