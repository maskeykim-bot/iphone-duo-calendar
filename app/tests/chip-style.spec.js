import { test, expect } from '@playwright/test';
import { PALETTE } from '../js/categories.js';
import { openApp, tab, setStyle, seed, ev, SIZES, chip } from './helpers.js';

// 第10版 ①: 月のチップ・帯・+N の計算後スタイル（06 §1〜§3）。画面サイズ・折り目は固定しない。
const POSTURES = [
  ['閉じた縦 466×678', SIZES.closedPortrait, 9],
  ['開いた縦 626×890', SIZES.openPortrait, 10],
  ['開いた縦 669×951', SIZES.openPortrait669, 10],
  ['開いた横 890×626', SIZES.openLandscape, 9.5],
  ['開いた横 951×669', SIZES.openLandscape951, 9.5],
];
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

// 12色のカテゴリを DB に入れ、11/2〜11/13 に1件ずつ（各色）時刻付きの予定を置く。
async function seedPalette(page) {
  await page.evaluate(async (pal) => {
    const db = await import('/js/db.js');
    const now = Date.now();
    for (const [i, c] of pal.entries()) await db.putCategory({ id: `pal-${i}`, name: c.name, color: c.light, order: 10 + i, hidden: false, createdAt: now, updatedAt: now });
  }, PALETTE);
  const events = PALETTE.map((p, i) => ev(`p${i}`, `色${i + 1}検査`, `2026-11-${String(2 + i).padStart(2, '0')}T10:00`, `2026-11-${String(2 + i).padStart(2, '0')}T11:00`, { categoryId: `pal-${i}` }));
  await seed(page, events);
}
async function toMonth(page, size) {
  if (size === SIZES.closedPortrait) await tab(page, '月').click();
  await setStyle(page, '予定名');
}
const cs = (loc) => loc.evaluate((el) => {
  const s = getComputedStyle(el), r = el.getBoundingClientRect();
  return { fs: parseFloat(s.fontSize), fw: Number(s.fontWeight), h: r.height, top: r.top, bg: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius, to: s.textOverflow, ws: s.whiteSpace, ov: s.overflowX, ovy: s.overflowY };
});

for (const [name, size, fs] of POSTURES) {
  for (const scheme of ['light', 'dark']) {
    test(`${name} ${scheme}: 時刻つきチップは 本色＋白・太字・14px・角丸3.5・切って省略しない（12色）`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page, size);
      await seedPalette(page);
      await toMonth(page, size);
      for (const [i, p] of PALETTE.entries()) {
        const strip = chip(page, `2026-11-${String(2 + i).padStart(2, '0')}`);
        await expect(strip).toHaveCount(1);
        const s = await cs(strip);
        expect(s.fs).toBe(fs);
        expect(s.fw).toBeGreaterThanOrEqual(600);
        expect(Math.abs(s.h - 14)).toBeLessThanOrEqual(0.2);
        expect(s.radius).toBe('3.5px');
        expect(s.bg).toBe(rgb(p.light)); // 保存された本色（dark 値・tint へ差し替えない）
        expect(s.color).toBe('rgb(255, 255, 255)');
        expect(s.to).toBe('clip');
        expect(s.ws).toBe('nowrap');
        expect(s.ov).toBe('hidden');
        expect(await strip.evaluate((el) => !el.textContent.includes('…') && !el.querySelector('.rep,.xi'))).toBe(true);
      }
    });
  }
}

test('レーンは日付行の下（19px）から16px刻み、チップ14px＋隙間2px', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await seed(page, ['a', 'b', 'c'].map((n, i) => ev(n, `予定${n}`, `2026-11-12T${String(9 + i).padStart(2, "0")}:00`, `2026-11-12T${String(9 + i).padStart(2, "0")}:30`)));
  await setStyle(page, '予定名');
  const week = await page.locator('.week').filter({ has: page.locator('[data-date="2026-11-12"]') }).boundingBox();
  const tops = [];
  for (const n of ['a', 'b', 'c']) tops.push((await chip(page, '2026-11-12').filter({ hasText: `予定${n}` }).boundingBox()).y - week.y);
  // 週の上端の罫線1pxぶんを許容
  expect(tops[0]).toBeGreaterThanOrEqual(19);
  expect(tops[0]).toBeLessThanOrEqual(21);
  expect(tops[1] - tops[0]).toBeCloseTo(16, 1);
  expect(tops[2] - tops[1]).toBeCloseTo(16, 1);
});

for (const [name, size, fs] of POSTURES) {
  test(`${name}: 帯は塗らず線＋中央の題名（2px・top+12.5・列境界から内1px）、+N は 9px・押せる範囲 44×44`, async ({ page }) => {
    await openApp(page, size);
    await seed(page, [
      ev('pay', '給与振込み', '2026-11-13T00:00', '2026-11-14T23:59', { all: true }),
      ev('gun', '群馬いく！', '2026-11-17T00:00', '2026-11-17T23:59', { all: true }),
      // 11/12 は帯1＋時刻6件（通常の段数を超えて +N が出る）
      ev('lone', '単日終日', '2026-11-12T00:00', '2026-11-12T23:59', { all: true }),
      ...Array.from({ length: 6 }, (_, i) => ev(`t${i}`, `検査${i}`, `2026-11-12T${String(9 + i).padStart(2, "0")}:00`, `2026-11-12T${String(9 + i).padStart(2, "0")}:30`)),
    ]);
    await toMonth(page, size);
    const bar = page.locator('.calendar .bar', { hasText: '給与振込み' });
    await expect(bar).toHaveCount(1);
    const info = await bar.evaluate((el) => {
      const s = getComputedStyle(el), a = getComputedStyle(el, '::after'), r = el.getBoundingClientRect();
      const d13 = document.querySelector('[data-date="2026-11-13"]').getBoundingClientRect(), d14 = document.querySelector('[data-date="2026-11-14"]').getBoundingClientRect();
      const week = el.closest('.week').getBoundingClientRect(), t = el.querySelector('.bt').getBoundingClientRect();
      return {
        bg: s.backgroundColor, bl: s.borderLeftWidth, h: r.height, color: s.color, fs: parseFloat(s.fontSize), fw: Number(s.fontWeight),
        lineH: parseFloat(a.height), lineTop: parseFloat(a.top), lineL: parseFloat(a.left), lineR: parseFloat(a.right),
        left: r.left - d13.left, right: d14.right - r.right, top: r.top - week.top, textMid: (t.left + t.right) / 2, barMid: (r.left + r.right) / 2,
        content: el.textContent, to: s.textOverflow,
      };
    });
    expect(info.bg).toBe('rgba(0, 0, 0, 0)');
    expect(info.bl).toBe('0px');
    expect(info.fs).toBe(fs);
    expect(info.fw).toBeGreaterThanOrEqual(600);
    expect(info.lineH).toBe(2);
    expect(info.lineTop).toBe(12.5);
    expect(info.lineL).toBe(1);
    expect(info.lineR).toBe(1);
    expect(Math.abs(info.left)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(info.right)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(info.textMid - info.barMid)).toBeLessThanOrEqual(1); // 題名は帯の中央
    expect(info.content).toBe('給与振込み'); // 矢印・アイコンなし
    // 単日終日も同形（線＋題名）。段は日付行の下
    const one = page.locator('.calendar .bar', { hasText: '群馬いく！' });
    await expect(one).toHaveCount(1);
    expect((await cs(one)).bg).toBe('rgba(0, 0, 0, 0)');
    // +N
    const plus = page.locator('.week .plus[data-jump="2026-11-12"]');
    await expect(plus).toHaveCount(1);
    const p = await plus.evaluate((el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(), d = document.querySelector('[data-date="2026-11-12"]').getBoundingClientRect(); return { fs: parseFloat(s.fontSize), w: r.width, h: r.height, right: d.right - r.right, top: r.top - d.top, tag: el.tagName, nested: !!el.closest('button:not(.plus)') }; });
    expect(p.fs).toBe(9);
    expect(p.w).toBeGreaterThanOrEqual(44);
    expect(p.h).toBeGreaterThanOrEqual(44);
    expect(Math.abs(p.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.top)).toBeLessThanOrEqual(1);
    expect(p.nested).toBe(false);
    // 中心と四隅から1px内側で +N に届く（日セルや別の操作に隠されない）
    const box = await plus.boundingBox();
    for (const [x, y] of [[0.5, 0.5], [box.width - 1, 1], [1, box.height - 1], [box.width - 1, box.height - 1], [box.width / 2, box.height / 2]]) {
      const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button')?.dataset.jump, [box.x + x, box.y + y]);
      expect(hit).toBe('2026-11-12');
    }
  });
}
