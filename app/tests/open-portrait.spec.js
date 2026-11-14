import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, tab, layout, findTextOverlaps, pickDay, modeStates, setStyle, seed, ev, SIZES } from './helpers.js';

const box = (loc) => loc.boundingBox();
const inside = (a, o, tol = 1) => a.y >= o.y - tol && a.y + a.height <= o.y + o.height + tol && a.x >= o.x - tol && a.x + a.width <= o.x + o.width + tol;
const noOverlap = (a, b) => a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5 || a.x + a.width <= b.x || b.x + b.width <= a.x;

const PORTRAITS = [SIZES.openPortrait, SIZES.openPortrait669];
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

for (const size of PORTRAITS) {
  const tag = `${size.width}×${size.height}`;
  test.describe(`開いた縦 ${tag}: 月`, () => {
    test('全幅の月。下部の予定一覧はなく、上の設定・検索と下の今日／タブ／＋が重ならない', async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      expect(await layout(page)).toBe('open');
      await expect(page.locator('body')).toHaveAttribute('data-posture', 'portrait');
      expect(await modeStates(page)).toEqual({ 予定名: true, 全部: false }); // 手帳は出さない。入口は設定の「月の表現」
      await expect(page.locator('.agenda')).toHaveCount(0);
      await expect(page.locator('.foot, .top, .brand')).toHaveCount(0);
      const W = size.width, H = size.height, rx = W / 669, ry = H / 951;
      // 月グリッド: 全幅・上端 100ry・高さ 780ry
      const sc = await box(page.locator('.calendar .scroll'));
      expect(near(sc.x, 0) && near(sc.width, W)).toBe(true);
      expect(near(sc.y, 100 * ry, 1)).toBe(true);
      expect(near(sc.height, 780 * ry, 1)).toBe(true);
      const wd = await box(page.locator('.weekdays'));
      expect(near(wd.y, 72 * ry, 1) && near(wd.height, 28 * ry, 1)).toBe(true);
      // 操作の位置と大きさ
      const set = await box(page.getByRole('button', { name: 'その他' }));
      const search = await box(page.getByRole('button', { name: '予定を検索' }));
      const today = await box(page.getByRole('button', { name: '今日に戻る' }));
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      const tabs = await box(page.locator('.tabs'));
      expect(near(set.x, 20 * rx) && near(set.y, 24 * ry) && near(set.width, 44) && near(set.height, 44)).toBe(true);
      expect(near(search.x, 480 * rx) && near(search.y, 24 * ry) && near(search.width, 44)).toBe(true);
      expect(near(today.x, 20 * rx) && near(today.y, 881 * ry, 1) && near(today.width, 48)).toBe(true);
      expect(near(add.x, W - 20 * rx - 48) && near(add.y, 881 * ry, 1) && near(add.width, 48)).toBe(true);
      expect(near(tabs.x + tabs.width / 2, W / 2) && tabs.width >= 176 && near(tabs.height, 46)).toBe(true);
      expect(near(tabs.y, 881 * ry, 1)).toBe(true);
      for (const [a, b] of [[today, tabs], [tabs, add], [today, add], [set, search]]) expect(noOverlap(a, b)).toBe(true);
      expect(add.y + add.height).toBeLessThanOrEqual(H);
      // 月グリッドは下段の上で終わる（隠れる週がない）
      expect(sc.y + sc.height).toBeLessThanOrEqual(Math.min(today.y, tabs.y, add.y) + 1);
      // 見出しは画面中央・操作と別の枠
      const title = await box(page.locator('#ctitle'));
      expect(near(title.x + title.width / 2, W / 2, 1)).toBe(true);
      expect(noOverlap(title, set) && noOverlap(title, search)).toBe(true);
      for (const n of ['前の月', '次の月']) { const b = await box(page.getByRole('button', { name: n })); expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44); expect(noOverlap(b, set) && noOverlap(b, search)).toBe(true); }
      // 予定名つきのチップ・帯
      const strip = page.locator('.calendar .strip', { hasText: 'プロジェクト' }).first();
      await expect(strip).toBeVisible();
      expect(inside(await box(strip), sc)).toBe(true);
      expect(await strip.innerText()).toMatch(/^(\d\d:\d\d )?プロジェクト/); // 開いた画面は既定で時刻を出す
      await expect(page.locator('.calendar .bar', { hasText: '秋のゴルフ合宿' }).first()).toBeVisible();
      expect(await findTextOverlaps(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    // 4週・5週・6週。月曜始まり/日曜始まり。いずれも週は G÷n で均等、必要高 101 を下回らず、最後の週が下段に隠れない
    const CASES = [['2026年12月（月曜始まり5週）', 1, 5], ['2027年2月（4週）', 3, 4], ['2026年11月（6週）', 0, 6], ['2026年8月（6週）', -3, 6]];
    for (const [name, fwd, weeks] of CASES) {
      test(`${name}: 週が均等で、最後の週まで下段に隠れない`, async ({ page }) => {
        await openApp(page, size);
        const ry = size.height / 951;
        const btn = page.getByRole('button', { name: fwd >= 0 ? '次の月' : '前の月' });
        for (let i = 0; i < Math.abs(fwd); i++) await btn.click();
        await expect(page.locator('.week')).toHaveCount(weeks);
        const hs = await page.locator('.week').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        const G = 780 * ry;
        for (const h of hs) { expect(h).toBeGreaterThanOrEqual(101 - 0.5); expect(near(h, Math.max(G / weeks, 101), 1)).toBe(true); }
        const sc = page.locator('.calendar .scroll');
        await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        const scb = await box(sc), last = await box(page.locator('.week').last()), tabs = await box(page.locator('.tabs'));
        expect(last.y + last.height).toBeLessThanOrEqual(scb.y + scb.height + 1);
        expect(scb.y + scb.height).toBeLessThanOrEqual(tabs.y + 1);
        expect(await findTextOverlaps(page)).toEqual([]);
      });
    }

    test('日曜始まり: 2027年2月は5週、列は日曜から。月送りで下段・週数以外は動かない', async ({ page }) => {
      await openApp(page, size);
      await page.getByRole('button', { name: 'その他' }).first().click();
      await page.locator('#menu').getByRole('button', { name: /^週の始まり/ }).click();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '次の月' }).click();
      await expect(page.locator('#ctitle')).toHaveText('2027年 2月');
      await expect(page.locator('.weekdays span').first()).toHaveText('日');
      await expect(page.locator('.week')).toHaveCount(5);
      const tabs0 = await box(page.locator('.tabs'));
      await page.getByRole('button', { name: '前の月' }).click();
      expect(await box(page.locator('.tabs'))).toEqual(tabs0);
    });

    test('11/27 の5件が出て、下部一覧はなく、日セルを押すとその日の日表示へ進む', async ({ page }) => {
      await openApp(page, size);
      await seed(page, ['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`m${i}`, `予定${t}`, `2026-11-27T${String(9 + i).padStart(2, '0')}:00`, `2026-11-27T${String(9 + i).padStart(2, '0')}:30`)));
      for (const t of ['A', 'B', 'C', 'D', 'E']) await expect(page.locator('.calendar .strip', { hasText: `予定${t}` })).toBeVisible();
      await expect(page.locator('.plus[data-jump="2026-11-27"]')).toHaveCount(0);
      await pickDay(page, '2026-11-27');
      await expect(page.locator('#ctitle')).toHaveText('11月27日（金）');
      await expect(page.locator('.daylist .event')).toHaveCount(5);
      await expect(tab(page, '日')).toHaveAttribute('aria-pressed', 'true');
    });

    test('simple を保存したまま縦は予定名で表示し、閉じた画面へ戻すと手帳', async ({ page }) => {
      await openApp(page, SIZES.closedPortrait);
      await tab(page, '月').click();
      await setStyle(page, '手帳');
      await page.setViewportSize(size);
      await expect.poll(() => layout(page)).toBe('open');
      await expect(page.locator('.calendar .week.named').first()).toBeVisible();
      expect(await modeStates(page)).toEqual({ 予定名: true, 全部: false });
      await page.setViewportSize(SIZES.closedPortrait);
      await expect.poll(() => layout(page)).toBe('browse');
      expect(await modeStates(page)).toMatchObject({ 手帳: true });
    });

    test('共通5レーン: 帯＋チップは5段まで、収まらない分は +N（帯も1件に数える）', async ({ page }) => {
      await openApp(page, size);
      await addEvent(page, { title: '出張A', all: true, start: '2026/11/16', end: '2026/11/18', cat: 'work' });
      await addEvent(page, { title: '合宿B', all: true, start: '2026/11/17', end: '2026/11/19', cat: 'family' });
      await addEvent(page, { title: '研修C', all: true, start: '2026/11/17', end: '2026/11/17', cat: 'private' });
      const bars = page.locator('.bar');
      await expect(bars).toHaveCount(3); // 単日の終日も同形の帯
      await expect(page.locator('.plus[data-jump="2026-11-17"]')).toHaveCount(0);
      for (const t of ['終日D', '終日E', '終日F']) await addEvent(page, { title: t, all: true, start: '2026/11/17', end: '2026/11/17', cat: 'work' });
      // 11/17: 6件のうち5段まで置き、ほか1件は +1
      await expect(bars).toHaveCount(5);
      await expect(page.locator('[data-date="2026-11-17"] ~ .plus[data-jump="2026-11-17"]')).toHaveText('+1');
      const boxes = await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        expect(p.x < q.right - 0.5 && q.x < p.right - 0.5 && p.y < q.bottom - 0.5 && q.y < p.bottom - 0.5).toBe(false);
      }
      expect(await findTextOverlaps(page)).toEqual([]);
      // 帯のタップで編集へ（+N に覆われない位置の帯）
      await page.locator('.bar', { hasText: '出張A' }).click({ position: { x: 4, y: 8 } });
      await expect(page.locator('#editor')).toBeVisible();
    });

    test('全部: 週は伸びて内部スクロール、末尾まで下段の上に出せる', async ({ page }) => {
      await openApp(page, size);
      await seed(page, [1, 2, 3, 4, 5].map((i) => ev(`all${i}`, `終日${i}`, '2026-11-30T00:00', '2026-11-30T23:59', { all: true })));
      await setStyle(page, '全部');
      const sc = page.locator('.scroll.all');
      await expect(sc).toBeVisible();
      await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect.poll(async () => page.locator('.week.all[data-drawn]').count()).toBeGreaterThan(0);
      const scb = await box(sc), last = await box(page.locator('.week.all').last()), tabs = await box(page.locator('.tabs'));
      expect(last.y + last.height).toBeLessThanOrEqual(scb.y + scb.height + 1);
      expect(scb.y + scb.height).toBeLessThanOrEqual(tabs.y + 1);
    });
  });
}

test.describe('開いた縦: safe area・キーボード・下書き', () => {
  for (const size of PORTRAITS) {
    test(`${size.width}×${size.height}: safe 上47・下34 でも操作は安全矩形の内側で、見出し・月・下段が重ならない`, async ({ page }) => {
      await openApp(page, size);
      await page.addStyleTag({ content: ':root{--sat:47px;--sab:34px;--sar:0px;--sal:0px}' });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--content-y'))).toBe('47px');
      const V = size.height - 47 - 34, ry = V / 951;
      const set = await box(page.getByRole('button', { name: 'その他' }));
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      const tabs = await box(page.locator('.tabs'));
      const sc = await box(page.locator('.calendar .scroll'));
      expect(set.y).toBeGreaterThanOrEqual(47);
      expect(near(set.y, 47 + 24 * ry, 1)).toBe(true);
      expect(add.y + add.height).toBeLessThanOrEqual(size.height - 34 + 0.5);
      expect(tabs.y + tabs.height).toBeLessThanOrEqual(size.height - 34 + 0.5);
      expect(sc.y).toBeGreaterThanOrEqual(47 + 72 * ry - 1);
      expect(sc.y + sc.height).toBeLessThanOrEqual(tabs.y + 1);
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }

  test('入力中のキーボード相当の高さ縮小でも DOM は変わらず、下書きが残る', async ({ page }) => {
    const size = SIZES.openPortrait669;
    await openApp(page, size);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('下書きの予定');
    const before = await page.locator('#app').innerHTML();
    const tabs0 = await box(page.locator('.tabs'));
    await page.setViewportSize({ width: size.width, height: 600 });
    await page.waitForTimeout(300);
    expect(await page.locator('#app').innerHTML()).toBe(before);
    expect(await box(page.locator('.tabs'))).toEqual(tabs0);
    await expect(page.locator('#f-title')).toHaveValue('下書きの予定');
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
    expect(sc.y + sc.height).toBeLessThanOrEqual(add.y + 1); // 日・週も同じ上下操作枠の中でスクロール
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
