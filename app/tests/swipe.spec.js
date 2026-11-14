import { test, expect } from '@playwright/test';
import { openApp, loadSample, tab, period, swipe, settle, SIZES } from './helpers.js';

const LAYOUTS = [
  ['閉じた縦 466×678', SIZES.closedPortrait],
  ['開いた縦 626×890', SIZES.openPortrait],
  ['開いた横 890×626', SIZES.openLandscape],
];
const VIEWS = [
  ['月', '2026年 11月', '2026年 12月', '2026年 10月'],
  ['週', '11月9日〜11月15日', '11月16日〜11月22日', '11月2日〜11月8日'], // 月曜始まり
  ['日', '11月12日（木）', '11月13日（金）', '11月11日（水）'],
];
// 本文の中ほど。次送りは右寄り、前送りは左寄りから始める（開いた横では左右どちらのページも使う）。
// 見開きの右ページの時間軸はスワイプの対象外（ピンチ・縦スクロール用）。月は左ページ、日は右の詳細一覧、週は左右どちらでも。
const next = (s) => (s.width > s.height ? { x0: Math.round(s.width * 0.3), y0: Math.round(s.height * 0.5), dx: -120 } : { x0: Math.round(s.width * 0.7), y0: Math.round(s.height * 0.55), dx: -120 });
const prev = (s) => ({ x0: Math.round(s.width * 0.3), y0: Math.round(s.height * 0.55), dx: 120 });
const nextDay = (s) => ({ x0: Math.round(s.width * 0.6), y0: Math.round(s.height * 0.55), dx: -120 });
const prevDay = (s) => ({ x0: Math.round(s.width * 0.55), y0: Math.round(s.height * 0.55), dx: 120 });

for (const [lname, size] of LAYOUTS) {
  for (const [view, now, nextT, prevT] of VIEWS) {
    test(`${lname} ${view}: 左スワイプ＝次、右スワイプ＝前`, async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      await tab(page, view).click();
      expect(await period(page)).toBe(now);
      const spreadDay = size.width > size.height && view === '日'; // 見開きの日: 左は時間軸なので右の詳細一覧から
      const [nx, pv] = spreadDay ? [nextDay, prevDay] : [next, prev];
      await swipe(page, nx(size));
      await expect.poll(() => period(page)).toBe(nextT);
      await swipe(page, pv(size));
      await expect.poll(() => period(page)).toBe(now);
      await swipe(page, pv(size));
      await expect.poll(() => period(page)).toBe(prevT);
      await expect(page.getByRole('status')).toContainText(prevT);
    });
  }
}

test('スワイプ後は選択日・見出し・アジェンダが更新され、ライブ通知される（開いた縦・日）', async ({ page }) => {
  await openApp(page, SIZES.openPortrait);
  await loadSample(page);
  await swipe(page, next(SIZES.openPortrait)); // 月: 12/12（土）
  await expect(page.locator('[data-date="2026-12-12"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.agenda')).toHaveCount(0); // 開いた縦に下部一覧はない
  await expect(page.getByRole('status')).toHaveText('2026年 12月。選択日は12月12日（土）。');
});

test('閉じたホーム: 左スワイプで月を送り、ホームを終了して月表示へ', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await loadSample(page);
  await expect(page.locator('.shell.home')).toBeVisible();
  await swipe(page, { x0: 330, y0: 400, dx: -120, target: '.remaining' });
  await expect(page.locator('.shell.browse')).toBeVisible();
  expect(await period(page)).toBe('2026年 12月');
});

test('開いた横: 左ページ・右の一覧・週の右ページで1回だけ送る（時間軸は対象外）', async ({ page }) => {
  await openApp(page, SIZES.openLandscape);
  await loadSample(page);
  await swipe(page, { x0: 300, y0: 344, dx: -120 }); // 左ページ
  await expect.poll(() => period(page)).toBe('2026年 12月');
  await page.waitForTimeout(350);
  await swipe(page, { x0: 700, y0: 344, dx: -120 }); // 右ページの時間軸は対象外（変わらない）
  await page.waitForTimeout(350);
  expect(await period(page)).toBe('2026年 12月');
  await tab(page, '日').click();
  expect(await period(page)).toBe('12月12日（土）');
  await swipe(page, { x0: 700, y0: 344, dx: -120 }); // 右ページ（詳細一覧）
  await expect.poll(() => period(page)).toBe('12月13日（日）');
  await page.waitForTimeout(450); // スワイプ直後の click は抑止される
  await tab(page, '週').click();
  await expect.poll(() => period(page)).toBe('12月7日〜12月13日');
  await swipe(page, { x0: 700, y0: 500, dx: -120 }); // 週: 右ページ
  await expect.poll(() => period(page)).toBe('12月14日〜12月20日');
});

test.describe('判定', () => {
  const unchanged = async (page, size, o) => {
    await swipe(page, { ...next(size), ...o });
    await page.waitForTimeout(350);
    expect(await period(page)).toBe('2026年 11月');
  };
  test('縦方向のドラッグでは期間が変わらない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await unchanged(page, SIZES.openPortrait, { dx: 10, dy: 140 });
    await unchanged(page, SIZES.openPortrait, { dx: -30, dy: -120 });
  });
  test('距離不足（50px未満）・縦横比不足（1.5未満）・縦優勢で始まる操作は確定しない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await unchanged(page, SIZES.openPortrait, { dx: -45, dy: 0 });
    await unchanged(page, SIZES.openPortrait, { dx: -90, dy: 70 });
    await unchanged(page, SIZES.openPortrait, { dx: -120, dy: 200, steps: 10 });
  });
  test('pointercancel・2本指・画面端20px以内・ヘッダーからの開始は中止', async ({ page }) => {
    const s = SIZES.openPortrait;
    await openApp(page, s);
    await unchanged(page, s, { finish: 'cancel' });
    await unchanged(page, s, { second: true });
    await unchanged(page, s, { x0: 10, dx: -150 });
    await unchanged(page, s, { x0: s.width - 10, dx: -150 });
    await unchanged(page, s, { y0: 25 }); // ヘッダー（ロゴ・タブの段）
    await unchanged(page, s, { target: '.padd', dx: -150 }); // 追加ボタン
  });
  test('編集ダイアログ表示中のスワイプは無効', async ({ page }) => {
    const s = SIZES.openPortrait;
    await openApp(page, s);
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#editor')).toBeVisible();
    await unchanged(page, s, { target: '.calendar .scroll', dx: -150 });
    await page.keyboard.press('Escape');
    await swipe(page, next(s));
    await expect.poll(() => period(page)).toBe('2026年 12月');
  });
  test('prefers-reduced-motion: reduce では即時に切り替わる', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page, SIZES.openPortrait);
    await page.evaluate(() => {
      window.__sawSwiping = false;
      new MutationObserver(() => { if (document.documentElement.dataset.swiping) window.__sawSwiping = true; })
        .observe(document.documentElement, { attributes: true });
    });
    await swipe(page, next(SIZES.openPortrait));
    expect(await period(page)).toBe('2026年 12月');
    expect(await page.evaluate(() => window.__sawSwiping)).toBe(false);
  });
});

test.describe('click の扱い（実マウス操作）', () => {
  test('短いタップでは従来どおり日セルを選択する', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    await page.locator('[data-date="2026-11-20"]').click({ position: { x: 12, y: 10 } });
    await expect.poll(() => period(page)).toBe('11月20日（金）'); // 開いた縦は日表示へ進む
  });

  test('確定スワイプ後に予定の編集ダイアログが開かない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    await tab(page, '日').click();
    const card = await page.locator('.daylist .event').first().boundingBox();
    const y = card.y + card.height / 2;
    await page.mouse.move(card.x + card.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(card.x + card.width * 0.3, y, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    await expect.poll(() => period(page)).toBe('11月13日（金）');
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('8pxを超えるドラッグ（スワイプ未満）ではセルを選択しない。その後のタップは効く', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    const cell = await page.locator('[data-date="2026-11-20"]').boundingBox();
    const y = cell.y + 10;
    await page.mouse.move(cell.x + 10, y);
    await page.mouse.down();
    await page.mouse.move(cell.x + 40, y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    await expect(page.locator('[data-date="2026-11-20"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(450);
    await page.locator('[data-date="2026-11-20"]').click({ position: { x: 12, y: 10 } });
    await expect.poll(() => period(page)).toBe('11月20日（金）');
  });
});
