import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, tab, layout, findTextOverlaps, pickDay, SIZES } from './helpers.js';

const box = (loc) => loc.boundingBox();
const inside = (a, o, tol = 1) => a.y >= o.y - tol && a.y + a.height <= o.y + o.height + tol && a.x >= o.x - tol && a.x + a.width <= o.x + o.width + tol;
const noOverlap = (a, b) => a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5 || a.x + a.width <= b.x || b.x + b.width <= a.x;

test.describe('開いた縦 626×890: 月', () => {
  test('上に全幅の月、下にアジェンダ。予定名が見え、アジェンダ3件以上、重ならない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    expect(await layout(page)).toBe('open');
    await expect(page.locator('body')).toHaveAttribute('data-posture', 'portrait');
    // 手帳／予定名の切替は隠れ、左右分割ではない
    // 開いた縦の月は常に予定名なので「手帳」は出さず、「予定名｜全部」の2つ
    await expect(page.getByRole('button', { name: '手帳', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: '予定名', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'false');
    const cal = await box(page.locator('.calendar'));
    const ag = await box(page.locator('.agenda'));
    expect(cal.width).toBeGreaterThanOrEqual(590);
    expect(ag.width).toBeGreaterThanOrEqual(590);
    expect(cal.y + cal.height).toBeLessThanOrEqual(ag.y);
    expect(noOverlap(cal, ag)).toBe(true);
    expect(Math.round(cal.height)).toBe(482);

    // 月内に予定名（先頭数文字）
    const strip = page.locator('.calendar .strip', { hasText: 'プロジェクト' }).first();
    await expect(strip).toBeVisible();
    expect(inside(await box(strip), cal)).toBe(true);
    expect((await strip.innerText()).startsWith('プロジェクト')).toBe(true);
    // 帯（複数日）も予定名つき
    await expect(page.locator('.calendar .bar', { hasText: '秋のゴルフ合宿' }).first()).toBeVisible();

    // 同一画面にアジェンダが3件以上（スクロールなし）
    const list = await box(page.locator('.agenda .list'));
    const evs = page.locator('.agenda .event');
    await expect(evs).toHaveCount(5);
    let visible = 0;
    for (const ev of await evs.all()) if (inside(await box(ev), list)) visible++;
    expect(visible).toBeGreaterThanOrEqual(3);
    // 超過分はリスト内スクロール
    expect(await page.locator('.agenda .list').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // 追加ボタンは右寄せ44px、アジェンダの下
    const add = await box(page.getByRole('button', { name: '予定を追加' }));
    expect(add.height).toBeGreaterThanOrEqual(44);
    expect(add.height).toBeLessThanOrEqual(46);
    expect(add.x + add.width).toBeGreaterThan(626 - 40);
    expect(add.x).toBeGreaterThan(626 / 2);
    expect(ag.y + ag.height).toBeLessThanOrEqual(add.y + 1);
    // 文字の重なりなし
    expect(await findTextOverlaps(page)).toEqual([]);
    // 全画面スクロールなし
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  // 月曜始まりで6週になる月
  for (const [name, back] of [['2026年8月', 3], ['2027年5月', -6]]) {
    test(`6週ある月（${name}）でも月とアジェンダは重ならず、週行は縮まない`, async ({ page }) => {
      await openApp(page, SIZES.openPortrait);
      await loadSample(page);
      const btn = page.getByRole('button', { name: back > 0 ? '前の月' : '次の月' });
      for (let i = 0; i < Math.abs(back); i++) await btn.click();
      await expect(page.locator('#ctitle')).toHaveText(name.replace('年', '年 '));
      const weeks = page.locator('.week');
      await expect(weeks).toHaveCount(6);
      for (const h of await weeks.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))) expect(h).toBe(64);
      const cal = await box(page.locator('.calendar'));
      const ag = await box(page.locator('.agenda'));
      const last = await box(weeks.last());
      expect(Math.round(cal.height)).toBe(482);
      expect(last.y + last.height).toBeLessThanOrEqual(cal.y + cal.height + 1);
      expect(noOverlap(cal, ag)).toBe(true);
      expect(await page.locator('.calendar .scroll').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }

  test('5週月でも月ペイン高とアジェンダ位置は変わらない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    const y5 = (await box(page.locator('.agenda'))).y; // 11月は5週
    await page.getByRole('button', { name: '前の月' }).click();
    await page.getByRole('button', { name: '前の月' }).click();
    await page.getByRole('button', { name: '前の月' }).click(); // 8月は6週
    expect(Math.abs((await box(page.locator('.agenda'))).y - y5)).toBeLessThanOrEqual(1);
  });

  test('共通2レーン: 帯＋短冊は2段まで、収まらない分は +N（複数日も数える）', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await addEvent(page, { title: '出張A', all: true, start: '2026/11/16', end: '2026/11/18', cat: 'work' });
    await addEvent(page, { title: '合宿B', all: true, start: '2026/11/17', end: '2026/11/19', cat: 'family' });
    await addEvent(page, { title: '研修C', all: true, start: '2026/11/17', end: '2026/11/17', cat: 'private' });
    const bars = page.locator('.bar');
    await expect(bars).toHaveCount(2);
    // 11/17: 出張A・合宿Bが2レーンを占有、研修Cは +1
    const cell = page.locator('[data-date="2026-11-17"] .plus');
    await expect(cell).toHaveText('+1');
    await expect(page.locator('.strip', { hasText: '研修C' })).toHaveCount(0);
    const [a, b] = await Promise.all([bars.nth(0).boundingBox(), bars.nth(1).boundingBox()]);
    expect(a.y).not.toBe(b.y);
    expect(await findTextOverlaps(page)).toEqual([]);
    // 帯のタップで編集へ
    await bars.first().click();
    await expect(page.locator('#editor')).toBeVisible();
  });
});

test.describe('開いた縦 626×890: 週', () => {
  test('1日1ブロックの縦リスト。長いタイトルは省略されず全文表示', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    const long = 'とても長いタイトルの予定を登録して省略されずに全文が折り返して表示されることを確認する';
    await addEvent(page, { title: long, start: '2026/11/12 20:00', end: '2026/11/12 21:00' });
    await tab(page, '週').click();
    await expect(page.locator('.weekview.vlist')).toBeVisible();
    const rows = page.locator('.weekrow');
    await expect(rows).toHaveCount(7);
    const rects = await rows.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width }; }));
    expect(new Set(rects.map((r) => Math.round(r.x))).size).toBe(1);
    expect(rects[0].w).toBeGreaterThanOrEqual(590);
    // 左に日付、右に予定
    const wd = await box(rows.nth(4).locator('.wd'));
    const evb = await box(page.locator('.weekrow.selected .event').first());
    expect(evb.x).toBeGreaterThan(wd.x + wd.width);
    // 省略なし
    const t = page.locator('.weekrow .event strong', { hasText: 'とても長い' });
    await expect(t).toHaveText(long);
    expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis')).toBe(true);
    expect((await box(t)).height).toBeGreaterThan(30); // 折り返して複数行
    for (const s of await page.locator('.weekrow .event strong').all()) {
      expect(await s.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    // 空の日は「予定なし」、アジェンダは置かない
    await expect(page.locator('.agenda')).toHaveCount(0);
    await expect(page.locator('.empty-row').first()).toHaveText('予定なし');
    // 本文は独立スクロール（画面全体はスクロールしない）
    expect(await page.locator('.calendar .scroll').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const add = await box(page.getByRole('button', { name: '予定を追加' }));
    const sc = await box(page.locator('.calendar .scroll'));
    expect(sc.y + sc.height).toBeLessThanOrEqual(add.y + 1);
    expect(await findTextOverlaps(page)).toEqual([]);
  });

  test('複数日予定は該当日それぞれに「終日」で載り、日付から日表示へ進める', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    await tab(page, '週').click();
    await page.getByRole('button', { name: '次の週' }).click(); // 11/16〜22（月曜始まり。出張・京都は 11/19〜23 なので19〜22の4日）
    await expect(page.locator('.weekrow', { hasText: '出張・京都' })).toHaveCount(4);
    await expect(page.locator('.weekrow', { hasText: '出張・京都' }).first().locator('.clock')).toHaveText('終日');
    await page.getByRole('button', { name: '11月20日（金）を日表示で開く' }).click();
    await expect(page.locator('#ctitle')).toHaveText('11月20日（金）');
  });
});
