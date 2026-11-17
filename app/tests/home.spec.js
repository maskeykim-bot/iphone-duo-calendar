// 第16版 PR14: ホームに今日のカード（design/14 案A）。2026-11-12 09:41 JST 固定。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, tab } from './helpers.js';
import { spy, seedTasks, dbTasks, legacyCalls } from './task-helpers.js';

// native は偽装（旧リマインダー集合つき・呼出は legacyCalls で0を検査）。タスクは Duo 内保存へ seed する。
const toTask = (o, n) => ({ id: o.itemId, title: o.title, due: o.due ?? null, done: !!o.done, doneAt: null, createdAt: n + 1, updatedAt: n + 1, order: n + 1, note: '', notify: false });
async function openH(page, size, items = []) {
  await spy(page);
  await openApp(page, size);
  if (items.length) await seedTasks(page, items.map(toTask));
}
const seedUi = async (page, patch) => {
  await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, ...p })); }, patch);
  await page.reload(); await page.waitForSelector('html[data-ready]');
};
const EVS = [
  ev('e0', '朝の予定', '2026-11-12T08:00', '2026-11-12T09:00'), // 終了済み
  ev('e1', '会議', '2026-11-12T10:00', '2026-11-12T11:00'),
  ev('e2', '昼', '2026-11-12T12:00', '2026-11-12T13:00'),
  ev('e3', '資料', '2026-11-12T14:00', '2026-11-12T15:00'),
  ev('e4', '歯医者', '2026-11-12T16:00', '2026-11-12T17:00'),
  ev('e5', '夕食', '2026-11-12T18:00', '2026-11-12T19:00'),
  ev('t1', '出張', '2026-11-13T09:00', '2026-11-13T18:00'),
  ev('t2', '打合せ', '2026-11-13T13:00', '2026-11-13T14:00'),
];
const TASKS = [
  { itemId: 'a', title: '期限切れ', due: { date: '2026-11-11' } },
  { itemId: 'b', title: '今日の', due: { date: '2026-11-12' } },
  { itemId: 'c', title: '古い', due: { date: '2026-11-05' } },
  { itemId: 'd', title: '四つ目', due: { date: '2026-11-12', time: '18:00' } },
  { itemId: 'f', title: '先', due: { date: '2026-11-20' } },
];

test('閉じたホーム: 次の予定・今日の予定3件＋ほか・タスク3件・メモ・明日。次の予定は二重掲載しない', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, TASKS);
  await seed(page, EVS);
  await tab(page, 'ホーム').click();
  await expect(page.locator('.next')).toContainText('会議');
  const ev3 = page.locator('.hevents .hrow');
  await expect(ev3).toHaveCount(3);
  await expect(ev3).toHaveText([/昼/, /資料/, /歯医者/]);
  await expect(page.locator('.hevents')).not.toContainText('朝の予定');
  await expect(page.locator('.hevents h3')).toContainText('5件');
  await expect(page.locator('.hmore')).toHaveText('ほか1件');
  await expect(page.locator('.htasks h3')).toContainText('4件');
  await expect(page.locator('.htask')).toHaveCount(3);
  await expect(page.locator('.htask').first()).toContainText('古い');
  await expect(page.locator('.htask .hdue').first()).toHaveText('11/5');
  await expect(page.locator('.hmemo')).toContainText('たたいて今日のメモを書く');
  await expect(page.locator('.htmr')).toContainText('明日 11/13（金）');
  await expect(page.locator('.htmr')).toContainText('09:00');
  await expect(page.locator('.htmr')).toContainText('ほか1件');
  // 並び: 次の予定 → 今日の予定 → タスク → メモ → 明日
  const idx = await page.evaluate(() => ['.hevents', '.htasks', '.hmemo', '.htmr'].map((s) => document.querySelector(s).getBoundingClientRect().top));
  idx.unshift(await page.locator('.hero').evaluate((e) => e.getBoundingClientRect().top));
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
});

test('閉じたホーム: 全体がスクロールし、タブは固定', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, TASKS);
  await seed(page, EVS);
  await tab(page, 'ホーム').click();
  const sc = page.locator('.home.listview');
  expect(await sc.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  const before = await tab(page, 'ホーム').boundingBox();
  await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  const after = await tab(page, 'ホーム').boundingBox();
  expect(after.y).toBe(before.y);
  const last = await page.locator('.htmr').boundingBox(), tb = await tab(page, 'ホーム').boundingBox();
  expect(last.y + last.height).toBeLessThanOrEqual(tb.y + 1);
});

test('20時以降は明日が今日の予定の上。選択日と独立して今日固定', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, []);
  await seed(page, EVS);
  await page.clock.setFixedTime(new Date('2026-11-12T21:00:00+09:00'));
  await seedUi(page, { selected: '2026-12-25' });
  await tab(page, 'ホーム').click();
  const ys = await page.evaluate(() => ['.htmr', '.hevents'].map((s) => document.querySelector(s).getBoundingClientRect().top));
  expect(ys[0]).toBeLessThan(ys[1]);
  await expect(page.locator('.date')).toContainText('12');
  await expect(page.locator('.hevents')).toContainText('この後の予定はありません');
});

test('0件案内と次の予定なし', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, []);
  await tab(page, 'ホーム').click();
  await expect(page.locator('.htasks')).toContainText('今日のタスクはありません');
  await expect(page.locator('.hevents')).toContainText('この後の予定はありません');
  await expect(page.locator('.htmr')).toContainText('予定はありません');
  await expect(page.locator('.hadd')).toBeVisible();
});

test('今日の予定のあと次の予定なし（今日が終わった）は明日以降を次に出す', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, []);
  await seed(page, [EVS[0], EVS[6]]);
  await tab(page, 'ホーム').click();
  await expect(page.locator('.next')).toContainText('出張');
  await expect(page.locator('.hevents .hrow')).toHaveCount(0);
});

test('タスクの完了: 丸で完了にして取り消せる（行は完了表示で残り、件数は減る。Duo 内に保存）', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, TASKS);
  await tab(page, 'ホーム').click();
  await page.locator('.htask').first().locator('[data-act="remck"]').click();
  await expect(page.locator('.htask.done')).toHaveCount(1);
  await expect(page.locator('.htasks h3')).toContainText('3件');
  const b = await page.locator('.htask [data-act="remck"]').first().boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(44);
  await expect.poll(async () => (await dbTasks(page)).find((t) => t.id === 'c').done).toBe(true);
  // 取り消し（もう一度押す）で未完了へ戻り、保存も戻る
  await page.locator('.htask.done [data-act="remck"]').click();
  await expect(page.locator('.htask.done')).toHaveCount(0);
  await expect(page.locator('.htasks h3')).toContainText('4件');
  await expect.poll(async () => (await dbTasks(page)).find((t) => t.id === 'c').done).toBe(false);
  expect(await legacyCalls(page)).toEqual([]);
});

test('導線: タイムライン›は日表示の今日、明日は明日、すべて›はタスク', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, TASKS);
  await seed(page, EVS);
  await tab(page, 'ホーム').click();
  await page.locator('.hevents .hgo').click();
  await expect(tab(page, '日')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ctitle')).toContainText('12');
  await tab(page, 'ホーム').click();
  await page.locator('.htmr').click();
  await expect(tab(page, '日')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ctitle')).toContainText('13');
  await tab(page, 'ホーム').click();
  await page.locator('.htasks .hgo').click();
  await expect(page.locator('.stripp[data-page="task"]')).toBeVisible();
});

test('今日のメモ: 最初の2行を出し、たたくとメモを開く', async ({ page }) => {
  await openH(page, SIZES.closedPortrait, []);
  await page.evaluate(async () => { await (await import('/js/db.js')).putMemo('2026-11-12', '一行目\n\n二行目\n三行目', Date.now()); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await tab(page, 'ホーム').click();
  await expect(page.locator('.hmemob span')).toHaveText(['一行目', '二行目']);
  await page.locator('.hmemob').click();
  await expect(page.locator('.stripp[data-page="memo"] textarea.memota')).toBeVisible();
});

test('開いた横: ホームは9〜19時の小さな時間軸。予定をたたくと反対側の時間へ', async ({ page }) => {
  await openH(page, SIZES.openLandscape951, TASKS);
  await seed(page, EVS);
  await seedUi(page, { pages: { left: 'home', right: 'month', portraitBottom: 'time', portraitShown: false } });
  const ax = page.locator('.page.lp .haxis');
  await expect(ax).toBeVisible();
  expect(Math.round((await ax.boundingBox()).height)).toBe(140);
  await expect(page.locator('.page.lp .hbarev')).toHaveCount(5);
  await expect(page.locator('.page.lp .hnow')).toHaveCount(1);
  await expect(page.locator('.page.lp .hevents .hrow')).toHaveCount(0);
  await page.locator('.page.lp .hbarev', { hasText: '会議' }).click();
  await expect(page.locator('.page.rp[data-page="time"]')).toBeVisible();
  await expect(page.locator('.page.lp[data-page="home"]')).toBeVisible();
});

test('開いた縦の下段: 次の予定・タスク・今日のメモの3列', async ({ page }) => {
  await openH(page, SIZES.openPortrait669, TASKS);
  await seed(page, EVS);
  await seedUi(page, { pages: { left: 'home', right: 'month', portraitBottom: 'home', portraitShown: true } });
  const cols = page.locator('.pnl .hcol');
  await expect(cols).toHaveCount(3);
  await expect(cols.nth(0)).toContainText('会議');
  await expect(cols.nth(1)).toContainText('タスク');
  await expect(cols.nth(2)).toContainText('今日のメモ');
  const xs = await cols.evaluateAll((e) => e.map((x) => x.getBoundingClientRect().left));
  expect(xs[0]).toBeLessThan(xs[1]); expect(xs[1]).toBeLessThan(xs[2]);
});
