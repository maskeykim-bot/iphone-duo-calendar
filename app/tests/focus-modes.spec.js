// 第16版 PR32: 開いた縦の三つの集中モード（カレンダー｜タスク｜ノート）。DP-8/9。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, layout } from './helpers.js';

const P = SIZES.openPortrait669;
const sw = (page, m) => page.locator(`.fmodes [data-fmode="${m}"]`);
const uiKey = 'duo.ui.v1';
const withMode = (page, mode) => page.addInitScript(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, focusMode: m })); }, [uiKey, mode]);
const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').focusMode, uiKey);

test.describe('開いた縦の集中モード', () => {
  test('未設定はカレンダー。切替は3つで、カレンダー本文・操作は従来のまま', async ({ page }) => {
    await openApp(page, P);
    expect(await layout(page)).toBe('open');
    await expect(page.locator('.fmodes button')).toHaveText(['カレンダー', 'タスク', 'ノート']);
    await expect(sw(page, 'calendar')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.calendar')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '予定を検索' })).toBeVisible();
    await expect(page.getByRole('button', { name: '予定を追加' })).toBeVisible();
    const sc = await page.locator('.mgrid').boundingBox(); // 第19版 PR6: 月を引く画面のマスは y146〜（見出し 44＋曜日 20 の下）
    expect(Math.abs(sc.y - 146)).toBeLessThan(1.5);
    const h = await page.locator('.mph h2').boundingBox(), f = await page.locator('.fmodes').boundingBox();
    expect(h.x + h.width <= f.x || f.x + f.width <= h.x || h.y + h.height <= f.y || f.y + f.height <= h.y).toBe(true); // 月の見出しと重ならない
  });

  test('タスク／ノートは専用面だけ。カレンダー・タブ・今日は出さず、モードを保存して再起動でも開く', async ({ page }) => {
    await openApp(page, P);
    await sw(page, 'task').click();
    await expect(page.locator('.shell.focus[data-focus="task"]')).toHaveCount(1);
    await expect(page.locator('.calendar, .tabs, .weekdays, .pnl')).toHaveCount(0);
    await expect(page.locator('.ctl .ctoday, .ctl .cpnl')).toHaveCount(0);
    await expect(page.locator('.ctl').getByRole('button', { name: 'タスクを検索' })).toBeVisible();
    await expect(page.locator('.ctl').getByRole('button', { name: 'タスクを追加' })).toBeVisible();
    expect(await saved(page)).toBe('task');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.shell.focus[data-focus="task"]')).toHaveCount(1);
    await sw(page, 'note').click();
    await expect(page.locator('.shell.focus[data-focus="note"]')).toHaveCount(1);
    await expect(page.locator('.ctl').getByRole('button', { name: 'ノートを追加' })).toBeVisible();
    await expect(page.locator('.mlist, .notepage')).toHaveCount(1);
    expect(await saved(page)).toBe('note');
    await sw(page, 'calendar').click();
    await expect(page.locator('.calendar')).toHaveCount(1);
    const sc = await page.locator('.mgrid').boundingBox();
    expect(Math.abs(sc.y - 146)).toBeLessThan(1.5); // 第19版 PR6
  });

  test('保存済みのモードで開く。不正値はカレンダー', async ({ page }) => {
    await withMode(page, 'note');
    await openApp(page, P);
    await expect(page.locator('.shell.focus[data-focus="note"]')).toHaveCount(1);
    await expect(sw(page, 'note')).toHaveAttribute('aria-pressed', 'true');
  });
  test('不正な保存値はカレンダー', async ({ page }) => {
    await withMode(page, 'bogus');
    await openApp(page, P);
    await expect(page.locator('.calendar')).toHaveCount(1);
  });

  test('＋はモードごとに 予定／タスク／ノート を作る', async ({ page }) => {
    await openApp(page, P);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#editor, dialog[open]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await sw(page, 'task').click();
    await page.locator('.ctl').getByRole('button', { name: 'タスクを追加' }).click();
    await expect(page.locator('input.remin')).toBeVisible();
    await sw(page, 'note').click();
    await page.locator('.ctl').getByRole('button', { name: 'ノートを追加' }).click();
    await expect(page.locator('.nhost')).toHaveCount(1);
  });

  test('検索はモードの対象だけ', async ({ page }) => {
    await openApp(page, P);
    await sw(page, 'task').click();
    await page.locator('.ctl').getByRole('button', { name: 'タスクを検索' }).click();
    await page.locator('#sr-q').fill('zzzz');
    await expect(page.locator('#sr-body')).toContainText('該当するタスクはありません');
    await expect(page.locator('#sr-range')).toBeHidden();
  });

  test('縦→横→縦でモードを保つ。横は従来のページ方式', async ({ page }) => {
    await openApp(page, P);
    await sw(page, 'task').click();
    await page.setViewportSize(SIZES.openLandscape951);
    await expect.poll(() => layout(page)).toBe('spread');
    await expect(page.locator('.fmodes, .shell.focus')).toHaveCount(0);
    expect(await saved(page)).toBe('task');
    await page.setViewportSize(P);
    await expect(page.locator('.shell.focus[data-focus="task"]')).toHaveCount(1);
  });

  test('閉じた画面は帯・従来のまま（切替なし）', async ({ page }) => {
    await withMode(page, 'note');
    await openApp(page, SIZES.closedPortrait);
    await expect(page.locator('.fmodes')).toHaveCount(0);
  });

  // 設計08 §6.2: 開いた縦の上の帯の右（x540〜・高さ head）は時刻・電池の予約。集中切替ほか操作の右端がここに入らない。
  const reserved = (page, W, L = 0, R = 0) => {
    const U = W - L - R, ux = U / 669;
    return page.evaluate(({ L, ux, W, headSel }) => {
      const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 82;
      const x = L + 540 * ux;
      return { x, y: 0, w: W - x, h: head };
    }, { L, ux, W });
  };
  const boxOf = (loc) => loc.boundingBox();
  const overlaps = (a, r) => !!a && a.x + a.width > r.x + 0.5 && r.x + r.w > a.x + 0.5 && a.y + a.height > r.y + 0.5 && r.y + r.h > a.y + 0.5;
  const setSafe = (page, { t = 0, r = 0, b = 0, l = 0 } = {}) => page.evaluate(({ t, r, b, l }) => {
    const s = document.documentElement.style;
    s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`);
    window.dispatchEvent(new Event('resize'));
  }, { t, r, b, l });

  for (const [name, size, safe] of [
    ['669×951', SIZES.openPortrait669, {}],
    ['626×890', SIZES.openPortrait, {}],
    ['669×951 T=82', SIZES.openPortrait669, { t: 82 }],
    ['669×951 T=82 左右非対称', SIZES.openPortrait669, { t: 82, l: 30, r: 20 }],
  ]) {
    test(`カレンダーの切替は右上の予約（時刻・電池）に入らない（${name}）`, async ({ page }) => {
      await openApp(page, size);
      if (Object.keys(safe).length) {
        await setSafe(page, safe);
        await page.waitForTimeout(50);
      }
      const L = safe.l ?? 0, R = safe.r ?? 0;
      const rsv = await reserved(page, size.width, L, R);
      const f = await boxOf(page.locator('.fmodes'));
      expect(f, 'fmodes visible').toBeTruthy();
      expect(overlaps(f, rsv), 'fmodes vs reserved').toBe(false);
      expect(f.x + f.width).toBeLessThanOrEqual(rsv.x + rsv.w + 0.5);
      // 第19.1版 S2（design/32 §5-5）: 設定 x20〜64・検索は右から20、どちらも y19〜63（44×44）。検索は右上の予約に入る位置（案A の指定）
      const W = size.width - L - R;
      const setb = await boxOf(page.getByRole('button', { name: '設定', exact: true }));
      expect(overlaps(setb, rsv), '設定').toBe(false);
      expect(Math.abs(setb.x - (L + 20)) < 1 && Math.abs(setb.y - 19) < 1 && setb.width === 44 && setb.height === 44, '設定の位置').toBe(true);
      const sb = await boxOf(page.getByRole('button', { name: '予定を検索', exact: true }));
      expect(Math.abs(sb.x - (L + W - 20 - 44)) < 1 && Math.abs(sb.y - 19) < 1 && sb.width === 44 && sb.height === 44, '検索の位置').toBe(true);
      // 切替は上の帯の真ん中 252×36（y23〜59）。V-01: 220→252（1つ 84）
      expect(Math.abs(f.x - (L + (W - 252) / 2)) < 1 && Math.abs(f.y - 23) < 1 && Math.abs(f.width - 252) < 1 && Math.abs(f.height - 36) < 1, '切替の位置').toBe(true);
    });

    test(`タスク／ノートの切替・検索・＋は右上の予約に入らない（${name}）`, async ({ page }) => {
      await openApp(page, size);
      if (Object.keys(safe).length) {
        await setSafe(page, safe);
        await page.waitForTimeout(50);
      }
      await sw(page, 'task').click();
      const L = safe.l ?? 0, R = safe.r ?? 0;
      const rsv = await reserved(page, size.width, L, R);
      const f = await boxOf(page.locator('.fmodes'));
      const search = await boxOf(page.locator('.ctl').getByRole('button', { name: 'タスクを検索' }));
      const add = await boxOf(page.locator('.ctl').getByRole('button', { name: 'タスクを追加' }));
      // V-10: 切替だけが予約の左で終わる。検索はどの型でも右から20（x605〜649・y19〜63）、＋はどの型でも右下（カレンダーの型と同じ）
      expect(f, 'fmodes').toBeTruthy(); expect(overlaps(f, rsv), 'fmodes').toBe(false); expect(f.x + f.width).toBeLessThanOrEqual(rsv.x + 0.5);
      const W = size.width - L - R;
      expect(Math.abs(search.x - (L + W - 20 - 44)) < 1 && Math.abs(search.y - 19) < 1 && search.width === 44 && search.height === 44, '検索の位置').toBe(true);
      expect(Math.abs(add.x - (L + W - 20 - 48)) < 1 && add.width === 48 && add.y > size.height / 2, '＋は右下').toBe(true);
      await sw(page, 'note').click();
      const fn = await boxOf(page.locator('.fmodes'));
      const ns = await boxOf(page.locator('.ctl').getByRole('button', { name: 'ノートを検索' }));
      const na = await boxOf(page.locator('.ctl').getByRole('button', { name: 'ノートを追加' }));
      expect(overlaps(fn, rsv), 'fmodes').toBe(false); expect(fn.x + fn.width).toBeLessThanOrEqual(rsv.x + 0.5);
      expect(Math.abs(ns.x - search.x) < 1 && Math.abs(ns.y - search.y) < 1, 'ノートの検索もカレンダーの型と同じ位置').toBe(true);
      expect(Math.abs(na.x - add.x) < 1 && Math.abs(na.y - add.y) < 1, 'ノートの＋もタスクの型と同じ位置').toBe(true);
    });
  }
});
