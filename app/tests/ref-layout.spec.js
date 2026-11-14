import { test, expect } from '@playwright/test';
import { CAT_IDS } from '../js/categories.js';
import { openApp, tab, seed, ev, SIZES, setStyle, openMenu, chip, textInGutter } from './helpers.js';

// 第10版 ⑤: 月見出し横の「全部」ボタン、ダークの塗り、verify-ref-layouts.md の自動化項目。画面サイズ・折り目は固定せず innerWidth/2 から計算。
const POSTURES = [
  ['閉じた縦 466×678', SIZES.closedPortrait, 'closed'],
  ['開いた縦 626×890', SIZES.openPortrait, 'portrait'],
  ['開いた縦 669×951', SIZES.openPortrait669, 'portrait'],
  ['開いた横 890×626', SIZES.openLandscape, 'spread'],
  ['開いた横 951×669', SIZES.openLandscape951, 'spread'],
];
const day = (n) => `2026-11-${String(n).padStart(2, '0')}`;
const many = (key, n, pre) => Array.from({ length: n }, (_, i) => ev(`${pre}${i}`, `${pre}-${i + 1}`, `${key}T${String(8 + i).padStart(2, '0')}:00`, `${key}T${String(8 + i).padStart(2, '0')}:30`));
const toMonth = async (page, kind) => { if (kind === 'closed') await tab(page, '月').click(); };
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')));
const allBtn = (page) => page.locator('.allbtn');

for (const [name, size, kind] of POSTURES) {
  test(`${name}: 月見出し横の「全部」ボタン（1タップで 全部⇔通常、直前の表現へ戻る）`, async ({ page }) => {
    await openApp(page, size);
    await toMonth(page, kind);
    if (kind !== 'portrait') await setStyle(page, '手帳');
    const b = allBtn(page);
    await expect(b).toHaveCount(1);
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    const box = await b.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const f = size.width / 2;
    expect(box.x + box.width <= f - 10 || box.x >= f + 10).toBe(true); // 折り目±10 を避ける
    // 中心・四隅（内1px）で当該ボタンに届く＝操作列・タブ・他のボタンと重ならない
    const hits = await page.evaluate(({ x, y, width: w, height: h }) => [[w / 2, h / 2], [1, 1], [w - 1, 1], [1, h - 1], [w - 1, h - 1]].map(([dx, dy]) => !!document.elementFromPoint(x + dx, y + dy)?.closest('.allbtn')), box);
    expect(hits).toEqual([true, true, true, true, true]);
    const rects = await page.evaluate(() => { const a = document.querySelector('.allbtn').getBoundingClientRect(); return [...document.querySelectorAll('.chead button:not(.allbtn), .chead h2, .sctl button:not(.allbtn), .shead h2, .rail, .tabs')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(a.right, r.right) - Math.max(a.left, r.left) > 0.5 && Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) > 0.5; }); });
    expect(rects.some(Boolean)).toBe(false);
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.scroll.all')).toBeVisible();
    expect(await ui(page)).toMatchObject({ monthExpand: true });
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.scroll.all')).toHaveCount(0);
    expect(await ui(page)).toMatchObject({ monthExpand: false, style: 'simple' }); // 直前の表現を保つ
    if (kind !== 'portrait') expect(await page.locator('.week.simple').count()).toBeGreaterThan(0);
    if (kind === 'spread') expect(await textInGutter(page)).toEqual([]);
  });
}

test('「全部」ボタンは月以外（週・日）の見出しには出ない', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '週').click();
  await expect(allBtn(page)).toHaveCount(0);
  await tab(page, '月').click();
  await expect(allBtn(page)).toHaveCount(1);
});

// ---- 追加1: ダークでも塗りは本色・文字は白 ----
for (const [name, size, kind] of POSTURES) {
  test(`${name}: ダーク（prefers-color-scheme: dark）でもチップは保存の本色の塗り＋白文字`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, size);
    await seed(page, [ev('d1', 'ダーク検査', `${day(12)}T10:00`, `${day(12)}T11:00`)]);
    await toMonth(page, kind);
    await setStyle(page, '予定名');
    const light = await page.evaluate(async (id) => { const c = (await (await import('/js/db.js')).listCategories()).find((x) => x.id === id); return c?.color; }, CAT_IDS.work);
    const s = await chip(page, day(12)).evaluate((el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, color: c.color }; });
    const rgb = light ? `rgb(${[1, 3, 5].map((i) => parseInt(light.slice(i, i + 2), 16)).join(', ')})` : null;
    if (rgb) expect(s.bg).toBe(rgb);
    expect(s.color).toBe('rgb(255, 255, 255)');
    expect(s.bg).not.toBe('rgba(0, 0, 0, 0)');
  });
}

// ---- 追加2: verify-ref-layouts.md の自動化項目 ----
for (const [name, size, kind] of POSTURES) {
  test(`${name}: 寸法・タブ4つ・件数（5件の日／10件の日）・折り目`, async ({ page }) => {
    await openApp(page, size);
    await seed(page, [...many(day(27), 5, 'five'), ...many(day(20), 10, 'ten')]);
    expect(await page.evaluate(() => [innerWidth, innerHeight])).toEqual([size.width, size.height]);
    await toMonth(page, kind);
    await setStyle(page, '予定名');
    expect(await page.locator('.tabs button').allTextContents()).toEqual(['一覧', '日', '週', '月']);
    const shown = (k) => chip(page, day(k)).count();
    const plus = (k) => page.locator(`.plus[data-jump="${day(k)}"]`);
    if (kind === 'closed') {
      expect(await shown(27)).toBe(4); await expect(plus(27)).toHaveText('+1');
      expect(await shown(20)).toBe(4); await expect(plus(20)).toHaveText('+6');
    } else {
      expect(await shown(27)).toBe(5); await expect(plus(27)).toHaveCount(0);
      expect(await shown(20)).toBe(5); await expect(plus(20)).toHaveText('+5');
    }
    await plus(20).click(); // +N → その日の表示へ
    expect(await ui(page)).toMatchObject({ selected: day(20) });
    if (kind === 'spread') expect(await textInGutter(page)).toEqual([]);
  });
}

for (const [name, size] of POSTURES.slice(3)) {
  for (const scheme of ['light', 'dark']) {
    test(`${name} ${scheme}: 見開き 操作列76・時間軸1時間60・左右ページの背景が違う`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page, size);
      const rail = await page.locator('.srail').boundingBox();
      expect(rail.width).toBe(76);
      expect(rail.x + rail.width).toBeLessThanOrEqual(size.width);
      const hl = await page.evaluate(() => { const l = [...document.querySelectorAll('.tl .hl:not(.half)')]; return l[1].getBoundingClientRect().top - l[0].getBoundingClientRect().top; });
      expect(hl).toBeCloseTo(60, 1);
      const bgi = await page.locator('.shell.spread').evaluate((e) => getComputedStyle(e).backgroundImage); // 左右の色は shell のグラデーションが折り目で接する
      expect(bgi).toContain('rgb(240, 237, 229)');
      expect(bgi).toContain('rgb(255, 253, 250)');
      // 折り目±10 に左右ページの要素（背景以外）がかからない
      const f = size.width / 2;
      const edges = await page.evaluate(() => ['.lp', '.rp'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.right]; }));
      expect(edges[0][1]).toBeLessThanOrEqual(f - 10 + 0.5);
      expect(edges[1][0]).toBeGreaterThanOrEqual(f + 10 - 0.5);
    });
  }
}

test('週の数: 月曜始まり 2026/11=6週、2027/2=4週（日曜始まりは5週）', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  const weeks = () => page.locator('.week').count();
  expect(await weeks()).toBe(6);
  await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...u, selected: '2027-02-10', weekStart: 1 })); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  expect(await weeks()).toBe(4);
  await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('duo.ui.v1')); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...u, weekStart: 0 })); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  expect(await weeks()).toBe(5);
});

test('開閉・回転のあとも「全部」と選択日が保たれる', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '月').click();
  await allBtn(page).click();
  await page.locator('[data-date="2026-11-18"]').first().click({ position: { x: 12, y: 10 } });
  for (const s of [SIZES.openPortrait669, SIZES.openLandscape951, SIZES.openPortrait, SIZES.closedPortrait]) {
    await page.setViewportSize(s);
    await expect.poll(() => ui(page)).toMatchObject({ monthExpand: true, selected: day(18) });
  }
  await page.reload(); await page.waitForSelector('html[data-ready]');
  expect(await ui(page)).toMatchObject({ monthExpand: true, selected: day(18) });
});
