import { test, expect } from '@playwright/test';
import { PALETTE } from '../js/categories.js';
import { colorSet } from '../js/colors.js';
import { openApp, tab, setStyle, seed, ev, SIZES, chip, monthFormInit } from './helpers.js';

// 第10版 ①: 月のチップ・帯・+N の計算後スタイル（06 §1〜§3）。画面サイズ・折り目は固定しない。
const POSTURES = [
  ['閉じた縦 466×678', SIZES.closedPortrait, 9],
  ['開いた縦 626×890', SIZES.openPortrait, 10],
  ['開いた縦 669×951', SIZES.openPortrait669, 10],
  ['開いた横 890×626', SIZES.openLandscape, 9],
  ['開いた横 951×669', SIZES.openLandscape951, 9],
];
// 第19版 PR6: 閉じた画面・開いた縦の月は「月を引く画面」。第19.1版 H-04・design/33 §1: 閉じた月の型「月」はチップ 16・10pt、そのほかは 14・9pt。角丸は 3、開いた横の文字も 9pt
const isPull = (size) => size.width < size.height;
// 第19.4版（design/36）: 画面に出る色は保存の本色ではなく、くすませた色（薄い地・左の線）。保存の色は変えない（tests/v194-colors.spec.js の D-1）
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
    test(`${name} ${scheme}: 時刻つきチップは ごく薄い地＋左の線 2.5×10＋墨の文字・太字・角丸3・切って省略しない（12色。第19.4版 design/36 §15.3）`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      if (isPull(size)) await monthFormInit(page);
      await openApp(page, size);
      await seedPalette(page);
      await toMonth(page, size);
      for (const [i, p] of PALETTE.entries()) {
        const strip = chip(page, `2026-11-${String(2 + i).padStart(2, '0')}`);
        await expect(strip).toHaveCount(1);
        const s = await cs(strip);
        expect(s.fs).toBe(size === SIZES.closedPortrait ? 10 : isPull(size) ? 9 : fs);
        expect(s.fw).toBeGreaterThanOrEqual(600);
        const set = colorSet(p.light);
        if (size === SIZES.closedPortrait) { // 第19.2版 S11b（34 §7・R-74）→ 第19.4版（36 §15.3）: 閉じた7段の時刻つきは地を塗らず、左の線 2.5×10（くすませた線の色）。高さ 14・文字 #293B35
          expect(Math.abs(s.h - 14)).toBeLessThanOrEqual(0.2);
          expect(s.bg).toBe('rgba(0, 0, 0, 0)');
          expect(s.color).toBe('rgb(41, 59, 53)');
          const ln = await strip.locator('.cline').evaluate((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, bg: getComputedStyle(e).backgroundColor }; });
          expect([ln.w, ln.h]).toEqual([2.5, 10]); expect(ln.bg).toBe(rgb(set.mark)); // 左の線の色（OS がダークでも同じ。アプリはライト固定）
        } else {
        expect(Math.abs(s.h - 14)).toBeLessThanOrEqual(0.2);
        expect(s.radius).toBe('3px');
        expect(s.bg).toBe(rgb(set.tint)); // ごく薄い地（OS がダークでも同じ）
        expect(s.color).toBe('rgb(41, 59, 53)'); // 墨の文字
        expect(await strip.evaluate((el) => { const b = getComputedStyle(el, '::before'); return [b.width, b.height, b.backgroundColor]; })).toEqual(['2.5px', '10px', rgb(set.mark)]);
        }
        expect(s.to).toBe('clip');
        expect(s.ws).toBe('nowrap');
        expect(s.ov).toBe('hidden');
        expect(await strip.evaluate((el) => !el.textContent.includes('…') && !el.querySelector('.rep,.xi'))).toBe(true);
      }
    });
  }
}

test('レーンは日付行 18 の下から16px刻み、チップ14px＋隙間2px（開いた横。閉じた・縦は月を引く画面で別の段）', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seed(page, ['a', 'b', 'c'].map((n, i) => ev(n, `予定${n}`, `2026-11-12T${String(9 + i).padStart(2, "0")}:00`, `2026-11-12T${String(9 + i).padStart(2, "0")}:30`)));
  await setStyle(page, '予定名');
  const week = await page.locator('.week').filter({ has: page.locator('[data-date="2026-11-12"]') }).boundingBox();
  const tops = [];
  for (const n of ['a', 'b', 'c']) tops.push((await chip(page, '2026-11-12').filter({ hasText: `予定${n}` }).boundingBox()).y - week.y);
  // 週の上端の罫線1pxぶんを許容
  expect(tops[0]).toBeGreaterThanOrEqual(18);
  expect(tops[0]).toBeLessThanOrEqual(20);
  expect(tops[1] - tops[0]).toBeCloseTo(16, 1);
  expect(tops[2] - tops[1]).toBeCloseTo(16, 1);
});

// 帯・+N の見た目は従来の月（開いた横）。閉じた・縦の月を引く画面の帯と +n は tests/month-pull.spec.js で確かめる。
for (const [name, size, fs] of POSTURES.filter(([, sz]) => !isPull(sz))) {
  test(`${name}: 帯は時刻つきと同じ形（ごく薄い地＋左の線 2.5×10＋墨の題名・左寄せ・高さ 14・両端は内 1.5。第19.4版 design/36 §15.3）、+N は 8px（V-04）・押す的でない（V-03）`, async ({ page }) => {
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
      const s = getComputedStyle(el), a = getComputedStyle(el, '::before'), r = el.getBoundingClientRect();
      const d13 = document.querySelector('[data-date="2026-11-13"]').getBoundingClientRect(), d14 = document.querySelector('[data-date="2026-11-14"]').getBoundingClientRect();
      const week = el.closest('.week').getBoundingClientRect(), t = el.querySelector('.bt').getBoundingClientRect();
      return {
        bg: s.backgroundColor, bl: s.borderLeftWidth, h: r.height, color: s.color, fs: parseFloat(s.fontSize), fw: Number(s.fontWeight),
        lineH: parseFloat(a.height), lineW: parseFloat(a.width), lineL: parseFloat(a.left), lineBg: a.backgroundColor, after: getComputedStyle(el, '::after').content, ta: s.textAlign, btL: t.left - r.left, radius: s.borderRadius,
        left: r.left - d13.left, right: d14.right - r.right, top: r.top - week.top, textMid: (t.left + t.right) / 2, barMid: (r.left + r.right) / 2,
        content: el.textContent, to: s.textOverflow,
      };
    });
    const work = colorSet('#2f5f8a');
    expect(info.bg).toBe(rgb(work.tint)); // 前: 地なし＋本色の下線と中央の題名 → 36 §15.3: 薄い地＋左の線＋墨の題名
    expect(info.color).toBe('rgb(41, 59, 53)');
    expect(info.bl).toBe('0px');
    expect(info.fs).toBe(fs);
    expect(info.fw).toBeGreaterThanOrEqual(600);
    expect(info.h).toBe(14);
    expect([info.lineW, info.lineH, info.lineL, info.lineBg]).toEqual([2.5, 10, 2, rgb(work.mark)]);
    expect(info.after).toBe('none'); // 下線はやめた
    expect(info.radius).toBe('3px');
    expect(Math.abs(info.left - 1.5)).toBeLessThanOrEqual(0.5); // 始まりと終わりの側は、時刻つきのチップと同じ 1.5 の内寄せ
    expect(Math.abs(info.right - 1.5)).toBeLessThanOrEqual(0.5);
    expect(info.ta).toBe('left'); expect(info.btL).toBe(0); // 題名は左から（.bt の padding-left 7）
    expect(info.content).toBe('給与振込み'); // 矢印・アイコンなし
    // 単日終日も同形（線＋題名）。段は日付行の下
    const one = page.locator('.calendar .bar', { hasText: '群馬いく！' });
    await expect(one).toHaveCount(1);
    expect((await cs(one)).bg).toBe(rgb(work.tint));
    // +N
    const plus = page.locator('.week .plus[data-plus="2026-11-12"]');
    await expect(plus).toHaveCount(1);
    const p = await plus.evaluate((el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(), d = document.querySelector('[data-date="2026-11-12"]').getBoundingClientRect(); return { fs: parseFloat(s.fontSize), w: r.width, h: r.height, right: d.right - r.right, top: r.top - d.top, tag: el.tagName, nested: !!el.closest('button:not(.plus)') }; });
    expect(p.fs).toBe(8); // V-04: 開いた横も閉じた画面（33 §5）と同じ 8pt W6
    expect(p.tag).toBe('SPAN'); // V-03: +N は押す的にしない（44×44 の当たりも無くす）
    expect(Math.abs(p.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.top)).toBeLessThanOrEqual(1);
    expect(p.nested).toBe(false);
    // V-03: +N の上の点は、その日のマスが受ける（+N も、チップも、別の予定を覆わない）
    const box = await plus.boundingBox();
    for (const [x, y] of [[box.width - 4, 3], [box.width / 2, box.height / 2]]) {
      const hit = await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button')?.dataset.date, [box.x + x, box.y + y]);
      expect(hit).toBe('2026-11-12');
    }
  });
}
