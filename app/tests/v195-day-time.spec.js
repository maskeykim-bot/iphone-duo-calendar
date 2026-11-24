// 第19.5版（征希さん「時間で表示した時は本家仕様にする」）: 閉じた画面の日の欄「時間」の新しい決まり（実装担当）。Chromium と WebKit の両方。
// 目盛り・つまみ・寄せ・ゴム・覚えるは tests/v193-design35-s9.spec.js の S-3〜S-9、保存・たたく・払い・閉じた横は tests/v193-day-cardtime.spec.js。ここはそのほか。
import { test, expect } from '@playwright/test';
import { ev } from './helpers.js';
import { boot, DAY, ui, rect, hourGap, lineY, near } from './v193-p2-lib.js';

const dg = (page) => page.locator('.mday').getAttribute('data-dg');
const emptyPt = async (page, min) => { const y = await lineY(page, min); if (y > 560) { await page.locator('.mpull.browse').evaluate((e, d) => { e.scrollTop += d; }, y - 320); await page.waitForTimeout(250); } return { x: (await rect(page, '.mday .tlcol')).x + 120, y: (await lineY(page, min)) + 4 }; }; // 画面の下に出ている時刻は、送ってから押す

test('T-1 詰めた形（1時間 14）で空きをたたくと、枠は作らず広げた形（56）になる。広げた形でたたくと 1 時間の仮の枠', async ({ page }) => {
  await boot(page, { dg: 1, stage: 7 });
  let p = await emptyPt(page, 15 * 60);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(500);
  await expect(page.locator('.dbox')).toHaveCount(0);
  expect(await dg(page)).toBe('C'); expect((await ui(page)).dayGrip).toBe(2); expect(near(await hourGap(page), 56, 0.5)).toBe(true);
  p = await emptyPt(page, 15 * 60);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.dbox .ds')).toHaveText('15:00〜16:00（1時間）');
  const b = await rect(page, '.dbox'); expect(near(b.h, 56)).toBe(true); expect(near(b.y, await lineY(page, 15 * 60))).toBe(true);
});

test('T-2 詰めた形で空きを長押ししても、枠は作らず広げるだけ（編集シートも開かない）', async ({ page }) => {
  await boot(page, { dg: 1, stage: 7 });
  const p = await emptyPt(page, 16 * 60);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(500);
  await expect(page.locator('.dbox')).toHaveCount(0); await expect(page.locator('#editor')).toBeHidden();
  expect(await dg(page)).toBe('C');
});

test('T-3 見せる範囲: 早い予定（7:30）と遅い予定（〜21:20）がある日は 7:00〜23:00。数字は 9・12・15・18・21、間は点（広げた形だけ見える）', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '朝', `${DAY}T07:30`, `${DAY}T08:00`), ev('b', '夜', `${DAY}T20:00`, `${DAY}T21:20`)] });
  const labs = () => page.evaluate(() => [...document.querySelectorAll('.mday .hlab')].filter((e) => !e.hidden).map((e) => ({ h: Number(e.dataset.rm) / 60, t: e.textContent, dot: e.classList.contains('dot') ? getComputedStyle(e, '::before').opacity : null })));
  let l = await labs();
  expect(l.map((x) => x.h)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  expect(l.filter((x) => x.t).map((x) => x.t)).toEqual(['9', '12', '15', '18', '21']);
  expect(l.filter((x) => x.dot !== null).every((x) => x.dot === '0')).toBe(true); // 詰めた形は点を出さない
  const tl = await rect(page, '.mday .tl'); expect(near(await lineY(page, 420), tl.y + 12)).toBe(true);
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400);
  l = await labs();
  expect(l.filter((x) => x.dot !== null).every((x) => x.dot === '1')).toBe(true);
});

test('T-4 時刻が重なる予定は横に並ぶ（細いカードは始まりの時刻と題名）。重ならない予定のカードは上下に重ならない', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '会議', `${DAY}T10:00`, `${DAY}T11:00`), ev('b', '電話', `${DAY}T10:30`, `${DAY}T10:45`), ev('c', '昼', `${DAY}T11:00`, `${DAY}T11:15`), ev('d', '移動', `${DAY}T11:15`, `${DAY}T11:30`)] });
  const r = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mday .tlev[data-event]')].map((b) => { const q = b.getBoundingClientRect(); return [b.dataset.event, { x: q.left, r: q.right, y: q.top, b: q.bottom, h: q.height, nar: b.classList.contains('nar'), t2: getComputedStyle(b.querySelector('.ft2')).display }]; })));
  expect(r.a.nar && r.b.nar).toBe(true); expect(r.a.r <= r.b.x + 1).toBe(true); expect(r.b.t2).toBe('none');
  expect(r.c.nar || r.d.nar).toBe(false);
  for (const k of ['a', 'b', 'c', 'd']) expect(r[k].h >= 44 - 0.5, k).toBe(true);
  expect(r.c.y >= r.a.b - 1 && r.d.y >= r.c.b - 1).toBe(true);
});

test('T-5 予定のメモの1行目がカードに出る。終日の予定は、カードと同じ色の札で見出しのすぐ下', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '打ち合わせ', `${DAY}T10:00`, `${DAY}T11:00`, { notes: '資料を持つ\n2行目' }), ev('ad', '出張', `${DAY}T00:00`, `${DAY}T23:59`, { all: true })] });
  await expect(page.locator('.mday .tlev .fmemo')).toHaveText('資料を持つ');
  const pill = await rect(page, '.mday .mdad .mdallday'), tl = await rect(page, '.mday .tl'), mdh = await rect(page, '.mday .mdh');
  expect(pill.y >= mdh.b - 1 && pill.b <= tl.y + 1).toBe(true);
  await page.locator('.mday .mdct [data-dg="card"]').click(); await page.waitForTimeout(350);
  expect(near((await rect(page, '.mday .mdad .mdallday')).y, pill.y)).toBe(true); // カードにしても同じ位置
});
