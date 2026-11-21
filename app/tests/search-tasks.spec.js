// 第16版 PR20: タスク検索（古い完了も見つかる）と、帯・ホーム・月の件数が保存済みタスクと一致する。
import { test, expect } from '@playwright/test';
import { SIZES, openApp, clickSearch } from './helpers.js';
import { spy, seedTasks, dbTasks, T } from './task-helpers.js';

const SEED = [
  T('a', { title: '牛乳を買う', due: { date: '2026-11-17' }, order: 1 }),
  T('b', { title: '買う 来週', due: { date: '2026-11-20', time: '10:00' }, order: 2 }),
  T('c', { title: 'メモ付き', note: '買う前に確認', due: null, order: 3 }),
  T('old', { title: '古い買う', done: true, doneAt: '2026-09-01T08:00', due: { date: '2026-09-01' }, order: 4 }),
  T('x', { title: '関係なし', due: { date: '2026-11-17' }, order: 5 }),
];
test('検索: 未完了（期限順）→期限なし→完了の順で、31日より前の完了も見つかる。件数は保存集合と一致', async ({ page }) => {
  await spy(page, { reminders: false });
  await openApp(page, SIZES.closedPortrait);
  await seedTasks(page, SEED);
  await clickSearch(page);
  await page.locator('#sr-q').fill('買う');
  await expect(page.locator('#sr-body [data-sec="task"]')).toBeVisible();
  const ids = await page.locator('#sr-body [data-thit]').evaluateAll((e) => e.map((x) => x.dataset.thit));
  expect(ids).toEqual(['a', 'b', 'c', 'old']);
  const stored = (await dbTasks(page)).filter((t) => /買う/.test(`${t.title}${t.note}`)).length;
  await expect(page.locator('#sr-body [data-sec="task"] .hcount')).toContainText(`${stored}件のタスク`);
  await page.locator('#sr-q').fill('買う　来週');
  await expect(page.locator('#sr-body [data-thit]')).toHaveCount(1);
  await expect(page.locator('#sr-body [data-thit="b"]')).toBeVisible();
});
