import { test, expect } from '@playwright/test';
import { OPEN_SIZES, SIZES, loadSample, openApp, setStyle, tab, openMenu } from './helpers.js';

// 第10版 ②: 閉じた画面（月領域＋操作列）・4タブ・操作列。画面サイズは固定せず、同じ検査を複数の大きさで通す。
const CLOSED = [SIZES.closedPortrait, SIZES.closedLandscape];
const tabsGroup = (page) => page.getByRole('group', { name: '表示期間' });
const box = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
const hits = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

// 中心と四隅（内1px）で、その操作自身（または中身）が最前面に届くこと。
async function reachable(page, loc) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]];
    // 角丸の外側は対象外にするため、四隅は半径ぶん内側の点も使う
    const rad = Math.min(r.width, r.height) / 2, k = rad * (1 - Math.SQRT1_2) + 1;
    pts.splice(1, 4, [r.left + k, r.top + k], [r.right - k, r.top + k], [r.left + k, r.bottom - k], [r.right - k, r.bottom - k]);
    return pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t)); });
  });
}

for (const size of CLOSED) {
  test.describe(`閉じた ${size.width}×${size.height}`, () => {
    test('4タブ（ホーム・日・週・月）: 名前・aria-pressed・順序の説明', async ({ page }) => {
      await openApp(page, size);
      const g = tabsGroup(page);
      await expect(g.getByRole('button')).toHaveText(['ホーム', '日', '週', '月']);
      await expect(tab(page, 'ホーム')).toHaveAttribute('aria-pressed', 'true');
      for (const [i, n] of ['ホーム', '日', '週', '月'].entries()) await expect(tab(page, n)).toHaveAttribute('aria-description', `4個中${i + 1}番目`);
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'home');
    });

    test('ホーム → 日 → 週 → 月 → ホーム。今日は選択日だけ戻し、表示とホームは保つ', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
      await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true');
      await expect(tab(page, 'ホーム')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('[data-act="next"]').first().click();
      await expect(page.locator('#ctitle')).toHaveText('2026年 12月');
      await page.getByRole('button', { name: '今日に戻る' }).click();
      await expect(page.locator('#ctitle')).toHaveText('2026年 11月');
      await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true'); // view は保つ
      await tab(page, '週').click();
      await page.getByRole('button', { name: '今日に戻る' }).click();
      await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
      await tab(page, '日').click();
      await expect(tab(page, '日')).toHaveAttribute('aria-pressed', 'true');
      await tab(page, 'ホーム').click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'home');
      await expect(tab(page, 'ホーム')).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '今日に戻る' }).click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'home'); // ホームのまま
      await tab(page, '月').click(); // ホームから戻ると直前の view（月）
      await expect(page.locator('#ctitle')).toHaveText('2026年 11月');
    });

    test('操作列: 設定・検索・今日・＋は各48px、タブは各44以上×46、どれも最前面に届き重ならない', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      const rail = page.locator('.ctl'); // safe=0 は帯なし: 設定・検索は見出し、今日・＋は下段（いずれも .ctl）
      const btns = rail.getByRole('button');
      await expect(btns).toHaveCount(4);
      const all = [];
      for (let i = 0; i < 4; i++) {
        const b = btns.nth(i), r = await box(b);
        expect(r.w, `rail ${i} 幅`).toBeGreaterThanOrEqual(44 - 0.5); // 見出しは44、下段は48
        expect(r.h, `rail ${i} 高さ`).toBeGreaterThanOrEqual(44 - 0.5);
        expect(await reachable(page, b), `rail ${i} が届く`).toBe(true);
        all.push(r);
      }
      const tb = tabsGroup(page).getByRole('button');
      for (let i = 0; i < 4; i++) {
        const b = tb.nth(i), r = await box(b);
        expect(r.w, `tab ${i} 幅`).toBeGreaterThanOrEqual(44);
        expect(r.h, `tab ${i} 高さ`).toBeGreaterThanOrEqual(46 - 0.5);
        expect(await reachable(page, b), `tab ${i} が届く`).toBe(true);
        all.push(r);
      }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(hits(all[i], all[j]), `重なり ${i}/${j}`).toBe(false);
      // 設定は押すとメニュー、検索は検索パネル
      await page.getByRole('button', { name: '設定' }).click();
      await expect(page.locator('#menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '予定を検索' }).click();
      await expect(page.locator('#search')).toBeVisible();
    });

    test('safe 注入（上47・下34・左右47）でも、タブ・操作列は安全矩形の内側で重ならない', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      await page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--sat', '47px'); s.setProperty('--sab', '34px'); s.setProperty('--sal', '47px'); s.setProperty('--sar', '47px'); });
      await expect.poll(() => page.evaluate(() => document.querySelector('.mpane').getBoundingClientRect().left)).toBeGreaterThanOrEqual(47);
      await expect.poll(() => page.evaluate(() => document.querySelector('.ctl').lastElementChild.getBoundingClientRect().bottom <= innerHeight - 34 + 0.5 && document.querySelector('.tabs').getBoundingClientRect().bottom <= innerHeight - 34 + 0.5)).toBe(true);
      const { W, H } = await page.evaluate(() => ({ W: innerWidth, H: innerHeight }));
      const rects = [];
      for (const loc of [page.locator('.tabs'), ...[0, 1, 2, 3].map((i) => page.locator('.ctl').getByRole('button').nth(i))]) rects.push(await box(loc));
      for (const r of rects) {
        expect(r.l).toBeGreaterThanOrEqual(47 - 0.5); expect(r.r).toBeLessThanOrEqual(W - 47 + 0.5);
        expect(r.t).toBeGreaterThanOrEqual(47 - 0.5); expect(r.b).toBeLessThanOrEqual(H - 34 + 0.5);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(hits(rects[i], rects[j]), `重なり ${i}/${j}`).toBe(false);
    });

    test('最終週はスクロールでタブの上へ出せる（恒久的にタブの裏に隠れない）', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      await setStyle(page, '予定名');
      const sc = page.locator('.scroll.msc');
      await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const last = await box(page.locator('.scroll.msc .week').last());
      const tabTop = (await box(page.locator('.tabs'))).t;
      expect(last.b).toBeLessThanOrEqual(tabTop + 1); // scrollTop は整数に丸まるため最大1px
      // 曜日の行はスクロールの外
      expect(await page.evaluate(() => !document.querySelector('.scroll.msc').contains(document.querySelector('.weekdays')))).toBe(true);
    });
  });
}

test('閉じた縦 466×678（safe=0・帯なし）: 本文は全幅・q=H/678（曜日 76q・grid 92q）・タブ 286 幅 中心 y622', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '月').click();
  const q = 678 / 678;
  const wk = await box(page.locator('.scroll.msc .week').first());
  expect(Math.abs(wk.t - 92 * q)).toBeLessThan(0.3);
  expect(Math.abs(wk.h - 500 * q / 6)).toBeLessThan(0.5);
  const wd = await box(page.locator('.weekdays'));
  expect(Math.abs(wd.t - 76 * q)).toBeLessThan(0.3);
  const t = await box(page.locator('.tabs'));
  expect(Math.abs(t.w - 286)).toBeLessThan(0.3);
  expect(Math.abs(t.t + t.h / 2 - 622)).toBeLessThan(0.3);
  expect(Math.abs(t.l - 90)).toBeLessThan(0.3);
  const pane = await box(page.locator('.mpane'));
  expect(Math.abs(pane.l)).toBeLessThan(0.3);
  expect(Math.abs(pane.r - 466)).toBeLessThan(0.3);
  await expect(page.locator('.rail')).toHaveCount(0); // 本文内の縦の操作列はない
  // 下段: 今日 x8・＋ x410（各48）、中心 y622
  const today = await box(page.getByRole('button', { name: '今日に戻る' })), add = await box(page.getByRole('button', { name: '予定を追加' }));
  expect([today.l, today.w, add.l, add.w].map(Math.round)).toEqual([8, 48, 410, 48]);
  expect(Math.round(today.t + 24)).toBe(622);
});

test('閉じた縦で、月の表現は設定の「月の表現」から選ぶ。全部・手帳が保存され、リロード後も復元される', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await loadSample(page);
  await tab(page, '月').click();
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeHidden(); // 常設の切替は無い
  await setStyle(page, '全部');
  await expect(page.locator('.scroll.all')).toBeVisible();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.scroll.all')).toBeVisible();
  await setStyle(page, '手帳');
  await expect(page.locator('.week.simple').first()).toBeVisible();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.week.simple').first()).toBeVisible();
  await openMenu(page, 'display');
  await page.locator('#menu').getByRole('button', { name: '月の表現', exact: true }).click();
  await expect(page.locator('#m-variant').getByRole('button', { name: '手帳' })).toHaveAttribute('aria-pressed', 'true');
});

test('メニューにカテゴリの色の説明があり、月には常設の凡例がない', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '月').click();
  await expect(page.locator('.calendar .legend')).toHaveCount(0);
  await openMenu(page, 'calendar');
  await expect(page.locator('#menu [aria-label="カテゴリ凡例"]')).toBeVisible();
});

test('卓上表示の入口はメニュー（上部ボタンは無い）。入って、メニューから出られる', async ({ page }) => {
  await openApp(page, SIZES.openPortrait);
  await expect(page.getByRole('button', { name: '卓上', exact: true })).toHaveCount(0);
  await openMenu(page, 'general');
  await page.locator('#menu').getByRole('button', { name: '卓上表示', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-layout', 'desk');
  await expect(tabsGroup(page).getByRole('button')).toHaveCount(4);
  await openMenu(page, 'general');
  await page.locator('#menu').getByRole('button', { name: '卓上表示をやめる' }).click();
  await expect(page.locator('body')).not.toHaveAttribute('data-layout', 'desk');
});

for (const size of OPEN_SIZES) {
  test(`開いた ${size.width}×${size.height}: 浮動タブが全姿勢にあり、ホームが使え、今日は表示を保つ`, async ({ page }) => {
    await openApp(page, size);
    if (size.width > size.height) { // 開いた横は左右ページの切替（第14版 PR5。pages.spec で詳細を検査）
      await expect(page.locator('.tabs')).toHaveCount(0);
      await expect(page.locator('.pgsw button')).toHaveText(['ホーム', '月', '時間', 'タスク', 'ノート', 'ホーム', '月', '時間', 'タスク', 'ノート']);
      return;
    }
    await expect(tabsGroup(page).getByRole('button')).toHaveText(['ホーム', '日', '週', '月']);
    await expect(page.locator('.segment')).toHaveCount(0);
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true'); // 開いた画面の既定は月
    const tb = tabsGroup(page).getByRole('button');
    for (let i = 0; i < 4; i++) {
      const r = await box(tb.nth(i));
      expect(r.w).toBeGreaterThanOrEqual(44); expect(r.h).toBeGreaterThanOrEqual(45.5);
      expect(await reachable(page, tb.nth(i)), `tab ${i}`).toBe(true);
    }
    const t = await box(page.locator('.tabs')), { W, H } = await page.evaluate(() => ({ W: innerWidth, H: innerHeight }));
    expect(t.l).toBeGreaterThanOrEqual(0); expect(t.r).toBeLessThanOrEqual(W); expect(t.b).toBeLessThanOrEqual(H);
    // ホーム → 本文は今日の画面。data-layout は open/spread のまま
    const kind = await page.evaluate(() => document.body.dataset.layout);
    await tab(page, 'ホーム').click();
    await expect(tab(page, 'ホーム')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-layout', kind);
    await page.getByRole('button', { name: '今日に戻る' }).click();
    await expect(tab(page, 'ホーム')).toHaveAttribute('aria-pressed', 'true'); // 今日は表示を保つ
    await tab(page, '週').click();
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hero')).toHaveCount(0);
    await page.getByRole('button', { name: '今日に戻る' }).click();
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
    await tab(page, '月').click();
    await expect(page.locator('.calendar .week').first()).toBeVisible();
  });
}
