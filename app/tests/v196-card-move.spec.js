// 第19.6版（征希さん「カードの移動はボタンとドラッグの両方」・設計 02「別日に移動｜日付選択 → プレビュー → 確定」）: カードの「別日に移動」ボタンとシート（実装担当）。
// 長押しで運ぶ動きは tests/v193-cards.spec.js・v193-design35-s9.spec.js（変えていない）。ここはボタンから。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { boot, DAY, DATA } from './v193-p2-lib.js';
import { ev, dbEvents } from './helpers.js';

const NEXT = '2026-11-13', D14 = '2026-11-14';
const card = (id) => `.mday .mdcard[data-event="${id}"]`;
const mv = (page, kind, id) => page.locator(`.mday .mdmv[data-kind="${kind}"][data-id="${id}"]`);
const S = '.cmv2';
const pickDay = (page, k) => page.locator(`${S} .dpgrid [data-day="${k}"]`).click();
const startOf = async (page, id) => (await dbEvents(page)).find((e) => e.id === id).start;

test('MV-1 予定: カードの右に 44×44 のボタン。押すとシート（予定の名前・いまの日と時刻・小さな月）。日を選ぶと移動先と「時刻と長さはそのまま」を見せ、「移動する」で移る。札の「元に戻す」で戻る', async ({ page }) => {
  await boot(page);
  const b = mv(page, 'event', 't0');
  const r = await b.boundingBox(), c = await page.locator(card('t0')).boundingBox();
  expect(Math.round(r.width)).toBe(44); expect(Math.round(r.height)).toBe(44);
  expect(r.x >= c.x && r.x + r.width <= c.x + c.width && r.y >= c.y && r.y + r.height <= c.y + c.height).toBe(true); // カードの中に収まる
  // 題名はボタンの手前で切れる（重ならない）
  expect(await page.locator(`${card('t0')} strong`).evaluate((e) => e.getBoundingClientRect().right)).toBeLessThanOrEqual(r.x + 0.5);
  await expect(b).toHaveAttribute('aria-label', '別日に移動');
  await b.click();
  await expect(page.locator(`${S} h3`)).toHaveText('別日に移動');
  await expect(page.locator(`${S} .cmvt`)).toHaveText('予定A');
  await expect(page.locator(`${S} .cmvpv small`)).toContainText('11月12日（木）'); await expect(page.locator(`${S} .cmvpv small`)).toContainText('9:00〜9:30（30分）');
  await expect(page.locator(`${S} .dpgrid`)).toBeVisible(); // 小さな月は開いた形で出る
  await expect(page.locator(`${S} .cmvgo`)).toBeDisabled();
  await pickDay(page, D14);
  await expect(page.locator(`${S} .dcap`)).toContainText('11月14日'); await expect(page.locator(`${S} .cmvgo`)).toBeEnabled();
  await expect(page.locator(`${S} .cmvnote`)).toContainText('時刻（9:00〜）と長さ（30分）はそのまま');
  expect(await startOf(page, 't0')).toBe(`${DAY}T09:00`); // 確定するまで保存しない
  await page.locator(`${S} .cmvgo`).click();
  await expect(page.locator(S)).toHaveCount(0);
  await expect(page.locator('#native-toast')).toContainText('14日（土）へ移しました');
  await expect(page.locator(card('t0'))).toHaveCount(0);
  await expect.poll(() => startOf(page, 't0')).toBe(`${D14}T09:00`);
  expect((await dbEvents(page)).filter((e) => e.title === '予定A').length).toBe(1); // 重複して作らない
  await page.locator('#native-toast button').click();
  await expect(page.locator(card('t0'))).toHaveCount(1);
  await expect.poll(() => startOf(page, 't0')).toBe(`${DAY}T09:00`);
});

test('MV-2 同じ日は移さない（「移動する」は押せない・保存しない）。やめる・Esc・外側で閉じると、何も変わらない', async ({ page }) => {
  await boot(page);
  await mv(page, 'event', 't1').click();
  await pickDay(page, DAY);
  await expect(page.locator(`${S} .cmvgo`)).toBeDisabled(); await expect(page.locator(`${S} .cmvnote`)).toContainText('いまと同じ日です');
  await page.locator(`${S} .cmvx`).click(); await expect(page.locator(S)).toHaveCount(0);
  await mv(page, 'event', 't1').click(); await pickDay(page, NEXT); await page.keyboard.press('Escape'); await expect(page.locator(S)).toHaveCount(0);
  expect(await startOf(page, 't1')).toBe(`${DAY}T10:00`);
  await expect(page.locator('#native-toast')).toHaveCount(0);
});

test('MV-3 重なり: 移動先の同じ時間に予定があれば、確定の前に知らせる（移すことはできる）。重ならない日には出さない', async ({ page }) => {
  await boot(page, { data: [...DATA, ev('x1', '先約', `${NEXT}T09:15`, `${NEXT}T10:00`)] });
  await mv(page, 'event', 't0').click();
  await pickDay(page, D14); await expect(page.locator(`${S} .cmvnote .cmvw`)).toHaveCount(0);
  await page.locator(`${S} .dcap`).click(); await pickDay(page, NEXT);
  await expect(page.locator(`${S} .cmvnote .cmvw`)).toContainText('この時間に「先約」があります');
  await page.locator(`${S} .cmvgo`).click();
  await expect.poll(() => startOf(page, 't0')).toBe(`${NEXT}T09:00`);
});

test('MV-4 繰り返しの予定: ボタンの名前は「この回を別日に移動」。「この回だけ移します」を見せ、移るのはその回だけ', async ({ page }) => {
  await boot(page, { data: [ev('rp', '毎日の朝会', `${DAY}T08:00`, `${DAY}T08:15`, { recurrence: { freq: 'daily', interval: 1 } })] });
  const b = page.locator('.mday .mdmv[data-kind="event"]').first();
  await expect(b).toHaveAttribute('aria-label', 'この回を別日に移動');
  await b.click(); await pickDay(page, D14);
  await expect(page.locator(`${S} .cmvnote`)).toContainText('この回だけ移します');
  await page.locator(`${S} .cmvgo`).click();
  await expect(page.locator('#native-toast')).toContainText('この回だけ');
  const p = (await dbEvents(page)).find((e) => e.id === 'rp');
  expect(p.start).toBe(`${DAY}T08:00`); expect(Object.keys(p.overrides || {}).length + (p.exdates || []).length).toBeGreaterThan(0); // 親はそのまま、その回だけ別扱い
});

test('MV-5 タスク・ノート: 同じボタンとシートで移せる（タスクは時刻そのまま、ノートは日付だけ）', async ({ page }) => {
  await boot(page);
  await page.evaluate(async (day) => {
    const db = await import('/js/db.js');
    await db.addTask({ title: '移すタスク', due: { date: day, time: '17:00' } });
    await db.putNote({ id: 'n-mv', body: '移すノート', folderId: null, pinned: false, pinnedAt: null, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null, date: day });
  }, DAY);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  await page.locator('.mday .mdmv[data-kind="task"]').click();
  await expect(page.locator(`${S} .cmvpv dt`).first()).toHaveText('タスク'); await expect(page.locator(`${S} .cmvpv small`)).toContainText('17:00 まで');
  await pickDay(page, D14); await expect(page.locator(`${S} .cmvnote`)).toContainText('時刻（17:00）はそのまま');
  await page.locator(`${S} .cmvgo`).click();
  await expect.poll(() => page.evaluate(async () => (await (await import('/js/db.js')).listTasks()).find((t) => t.title === '移すタスク').due)).toEqual({ date: D14, time: '17:00' });
  await page.locator('#native-toast').waitFor(); await page.waitForTimeout(300);
  await page.locator('.mday .mdmv[data-kind="note"]').click();
  await expect(page.locator(`${S} .cmvpv dt`).first()).toHaveText('ノート');
  await pickDay(page, NEXT); await page.locator(`${S} .cmvgo`).click();
  await expect.poll(() => page.evaluate(async () => (await (await import('/js/db.js')).getNote('n-mv')).date)).toBe(NEXT);
});
