// 第19.4版 レビュー直し（design/V194_レビュー.md・data/V194_レビュー_企画.md・data/連携_V194_レビュー.md）。指摘ごとに、画面の寸法・重なり・色を測る。Chromium と WebKit の両方で回す。
// 枠・帯の重なり順は、計算済みスタイルだけでなく、画面の 1 画素を撮って色で確かめる（pixel）。
import zlib from 'node:zlib';
import { test, expect } from '@playwright/test';
import { boot, SIZES, ev, allDay, catId, ratio, cell, toast, dbEvs } from './v194-lib.js';
import { reloadKeep } from './helpers.js';
import { colorSet, flickSet, mixHex } from '../js/colors.js';

const W = catId('work'), P = catId('private'), F = catId('family'), O = catId('out'), G = catId('other');
const BASE = { [W]: '#2f5f8a', [P]: '#8a4b6b', [F]: '#2e6b5a', [O]: '#87500f', [G]: '#5a5e62' };
const FRAME = '#294E42', OUTC = '#5D6963', LEFT_PAGE = '#F0EDE5', SAT_BG = '#EEF1F4';
const SEL = '2026-11-17';
const EVENTS = [
  allDay('g1', '群馬いく！群馬いく！群馬', '2026-11-02', '2026-11-03', { categoryId: P }),
  allDay('wk', '週をまたぐ帯の題名はとても長い', '2026-11-07', '2026-11-10', { categoryId: F }),
  allDay('bandA', 'またぐ帯の題名はとても長い名前です', '2026-11-16', '2026-11-18', { categoryId: W }),
  allDay('bandB', 'ここから始まる帯の長い題名です', '2026-11-17', '2026-11-18', { categoryId: O }),
  allDay('one', '勤労感謝の集まりの長い名前', '2026-11-24', '2026-11-24', { categoryId: P }),
  ev('tm', 'トリミングの予約の長い名前', '2026-11-24T15:00', '2026-11-24T16:00', { categoryId: F }),
  allDay('o1', '前の月の終日', '2026-10-28', '2026-10-28', { categoryId: P }), ev('o2', '前の月の時刻', '2026-10-29T10:00', '2026-10-29T11:00', { categoryId: G }),
  allDay('o3', '次の月の終日', '2026-12-03', '2026-12-03', { categoryId: G }), allDay('o4', '次の月のくすみ色', '2026-12-04', '2026-12-04', { categoryId: W, colorId: 'sage' }),
  ...[0, 1, 2, 3, 4, 5].map((i) => ev(`n${i}`, `多い日${i}`, `2026-11-20T1${i}:00`, `2026-11-20T1${i}:30`, { categoryId: [W, P, F, O, G, W][i] })),
  ...[0, 1, 2, 3, 4, 5].map((i) => ev(`s${i}`, `土の多い日${i}`, `2026-11-21T1${i}:00`, `2026-11-21T1${i}:30`, { categoryId: [W, P, F, O, G, W][i] })),
  ev('edge1', '溝のそば', '2026-11-15T10:00', '2026-11-15T11:00', { categoryId: W }), ev('edge2', '溝のそば土', '2026-11-14T10:00', '2026-11-14T11:00', { categoryId: P }),
  ev('last', '最後の週の予定', '2026-11-30T10:00', '2026-11-30T11:00', { categoryId: F }),
];
const SCREENS = [['閉じた縦', SIZES.closedPortrait], ['開いた縦', SIZES.openPortrait669], ['開いた横', SIZES.openLandscape951]];

// 画面の 1 画素の色（#RRGGBB）。1×1 の PNG は、どのフィルタでも値がそのまま入る
async function pixel(page, x, y) {
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, scale: 'css', animations: 'disabled' });
  const idat = []; let ct = 2;
  for (let p = 8; p < png.length;) { const len = png.readUInt32BE(p), type = png.toString('latin1', p + 4, p + 8); if (type === 'IHDR') ct = png[p + 8 + 9]; if (type === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + len)); p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  expect([2, 6]).toContain(ct);
  return `#${[raw[1], raw[2], raw[3]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
// 計算済みの色 → #RRGGBB（color-mix の結果は color(srgb r g b) で返る）
const toHex = (s) => {
  let m = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/.exec(s);
  if (m) return `#${[m[1], m[2], m[3]].map((v) => Math.round(Number(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  m = /rgba?\(([^)]+)\)/.exec(s); const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return `#${p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};
const near = (a, b, tol = 2) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= tol);
// 選んだマスと枠・その週のチップの寸法
const measure = (page, k) => page.evaluate((k) => {
  const r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const d = [...document.querySelectorAll(`.week .day[data-date="${k}"]`)].find((e) => e.getClientRects().length), wk = d.closest('.week');
  const a = getComputedStyle(d, '::after'), s = getComputedStyle(d);
  const closed = a.borderLeftWidth !== '0px';
  const inset = parseFloat(a.left) || 0, bw = closed ? parseFloat(a.borderLeftWidth) : parseFloat((/(\d+(?:\.\d+)?)px inset/.exec(a.boxShadow) || [0, 0])[1]), br = parseFloat(s.borderRightWidth) || 0;
  const chips = [...wk.querySelectorAll('.strip, .bar')].filter((c) => c.getClientRects().length && Number(getComputedStyle(c).opacity) > 0.5).map((c) => ({
    id: c.dataset.event || c.dataset.cont || '', lead: !c.dataset.cont, cls: c.className, z: Number(getComputedStyle(c).zIndex), rect: r(c), bt: c.querySelector('.bt') ? r(c.querySelector('.bt')) : null,
    clipped: c.querySelector('.bt') ? c.querySelector('.bt').scrollWidth > c.querySelector('.bt').clientWidth : c.scrollWidth > c.clientWidth, after: !!(d.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) && !d.contains(c),
  }));
  return { cell: r(d), closed, frame: { content: a.content, z: Number(a.zIndex), inset, bw, br, radius: a.borderTopLeftRadius, lo: inset, li: inset + bw, ri: br + inset + bw, pe: a.pointerEvents }, dayShadow: s.boxShadow, chips };
}, k);
const bandOf = (m, id) => { const ps = m.chips.filter((c) => c.id === id); return { lead: ps.find((c) => c.lead), l: Math.min(...ps.map((c) => c.rect.l)), r: Math.max(...ps.map((c) => c.rect.r)), t: ps[0].rect.t, pieces: ps }; };

test.describe('必須1 複数日の帯の題名は、帯の地の中で切れる（左 7・右 2）', () => {
  test('閉じた縦: 題名の右端は帯の右端の 2 手前まで。となりのマスへはみ出さない', async ({ page }) => {
    await boot(page, { events: EVENTS, sel: '2026-11-12' });
    for (const id of ['g1', 'bandA', 'bandB']) {
      const m = await measure(page, id === 'g1' ? '2026-11-02' : '2026-11-16'), b = bandOf(m, id);
      expect(b.lead.bt, id).toBeTruthy();
      expect(b.lead.clipped, `${id} は長い題名で切れている`).toBe(true);
      expect(b.lead.bt.l - b.lead.rect.l).toBeCloseTo(7, 1);
      expect(b.r - b.lead.bt.r, `${id} 題名の右端は帯の右端の 2 手前`).toBeGreaterThanOrEqual(1.9);
      expect(b.r - b.lead.bt.r).toBeLessThanOrEqual(2.6);
    }
    // 週をまたぐ帯: どちらの週でも、その週の帯の中で切れる
    for (const k of ['2026-11-07', '2026-11-10']) {
      const m = await measure(page, k), b = bandOf(m, 'wk');
      expect(b.r - b.lead.bt.r, k).toBeGreaterThanOrEqual(-0.1);
      expect(b.r - b.lead.bt.r, k).toBeLessThanOrEqual(2.6);
    }
    // 帯のすぐ右のマス（11/4）の左端の画素に、題名の文字が乗っていない（地の色のまま）
    const m4 = await measure(page, '2026-11-04'), g = bandOf(await measure(page, '2026-11-02'), 'g1');
    const bg = await pixel(page, Math.ceil(m4.cell.l) + 1, Math.round(m4.cell.t + 8));
    for (const dx of [1, 2, 3, 4, 5, 6]) { const px = await pixel(page, Math.ceil(g.r) + dx, Math.round(g.t + 7)); expect(near(px, bg, 3), `帯の右 ${dx}: ${px} 地 ${bg}`).toBe(true); }
  });
});

for (const [name, size] of SCREENS) {
  test.describe(`必須2 選んだ日の枠とチップ・帯の重なり順（${name}）`, () => {
    test('1 日のチップは枠の下で、マスの端から左右 5.5 内側（枠の線に重ならない）', async ({ page }) => {
      await boot(page, { size, events: EVENTS, sel: '2026-11-24' });
      const m = await measure(page, '2026-11-24'), f = m.frame;
      expect(f.content).not.toBe('none'); expect(f.pe).toBe('none'); expect(m.dayShadow).toBe('none');
      expect([f.inset, f.bw]).toEqual(m.closed ? [1, 2] : [0, 2]); // 枠は今までどおり（閉じた縦: 内側 1・線 2・角丸 4、開いた画面: 線 2）
      const ones = m.chips.filter((c) => ['one', 'tm'].includes(c.id));
      expect(ones.length).toBe(2);
      for (const c of ones) {
        expect(c.cls).toContain('insel');
        expect(c.rect.l - m.cell.l, `${c.id} 左`).toBeCloseTo(5.5, 1);
        expect(m.cell.r - c.rect.r, `${c.id} 右`).toBeCloseTo(5.5, 1);
        expect(c.rect.l - (m.cell.l + f.li)).toBeGreaterThanOrEqual(1); expect((m.cell.r - f.ri) - c.rect.r).toBeGreaterThanOrEqual(1); // 枠の内側の縁から 1 以上
        expect(c.z, `${c.id} は枠より下`).toBeLessThan(f.z);
        expect(c.rect.h).toBe(14);
        // 枠の左右の線は、チップの段でも切れずに見える
        const y = Math.round(c.rect.t + 7);
        expect(await pixel(page, Math.floor(m.cell.l + f.lo) + 1, y), `${c.id} の段の左の線`).toBe(FRAME);
        expect(await pixel(page, Math.floor(m.cell.r - f.ri) + 1, y), `${c.id} の段の右の線`).toBe(FRAME);
      }
      // 選んでいない日の 1 日のチップは今までどおり（内寄せ 1〜1.5）
      const m2 = await measure(page, '2026-11-15'), e1 = m2.chips.find((c) => c.id === 'edge1');
      expect(e1.cls).not.toContain('insel'); expect(e1.rect.l - m2.cell.l).toBeLessThanOrEqual(1.6);
    });

    test('複数日の帯は枠の上を通り、題名は枠の線の 1 手前で切れる', async ({ page }) => {
      await boot(page, { size, events: EVENTS, sel: SEL });
      const m = await measure(page, SEL), f = m.frame, a = bandOf(m, 'bandA'), b = bandOf(m, 'bandB');
      // 重なり順: 1 日のチップ ＜ 枠 ＜ 帯（同じ z-index のときは、あとに置いた帯が上）
      for (const p of [...a.pieces, ...b.pieces]) expect(p.z > f.z || (p.z === f.z && p.after), `帯 z=${p.z} 枠 z=${f.z}`).toBe(true);
      // 手前のマスから来る帯（11/16〜18）: 題名は枠の左の線の外の縁の 1 手前まで
      expect(a.lead.clipped).toBe(true);
      expect((m.cell.l + f.lo) - a.lead.bt.r, '枠の左の線の 1 手前').toBeGreaterThanOrEqual(0.9);
      expect((m.cell.l + f.lo) - a.lead.bt.r).toBeLessThanOrEqual(1.6);
      // 選んだマスから始まる帯（11/17〜18）: 題名は枠の右の線の内の縁の 1 手前まで
      expect(b.lead.clipped).toBe(true);
      expect((m.cell.r - f.ri) - b.lead.bt.r, '枠の右の線の 1 手前').toBeGreaterThanOrEqual(0.9);
      expect((m.cell.r - f.ri) - b.lead.bt.r).toBeLessThanOrEqual(1.6);
      // 画素: 帯の段では、枠の線の所に帯の地が見える（帯が上）。文字は乗っていない
      const ya = Math.round(a.t + 7), yb = Math.round(b.t + 7), tintA = colorSet(BASE[W]).tint, tintB = colorSet(BASE[O]).tint;
      expect(await pixel(page, Math.floor(m.cell.l + f.lo) + 1, ya), '帯A × 左の線').toBe(tintA);
      expect(await pixel(page, Math.floor(m.cell.r - f.ri) + 1, ya), '帯A × 右の線').toBe(tintA);
      expect(await pixel(page, Math.floor(m.cell.r - f.ri) + 1, yb), '帯B × 右の線').toBe(tintB);
      // 帯のない所（日付の段）では枠の線が見える
      expect(await pixel(page, Math.floor(m.cell.l + f.lo) + 1, Math.round(m.cell.t + 9))).toBe(FRAME);
    });
  });
}

test.describe('必須3 色の帯は折り目の溝にかからない', () => {
  const press = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.locator('.cmenu [data-cm="color"]').click(); await expect(page.locator('.colorstrip')).toBeVisible(); return b; };
  const vars = (page) => page.evaluate(() => { const s = getComputedStyle(document.documentElement), v = (n) => parseFloat(s.getPropertyValue(n)); return { ls: v('--left-start'), le: v('--left-end'), rs: v('--right-start'), re: v('--right-end'), fold: v('--fold-x'), keep: v('--fold-keepout'), g0: v('--groove-avoid-y0'), g1: v('--groove-avoid-y1') }; });
  test('開いた横: 溝のすぐ左の列（土・日）のチップから出しても、左ページの中に左右 8 空けて収まる（幅 336 のまま）', async ({ page }) => {
    await boot(page, { size: SIZES.openLandscape951, events: EVENTS, sel: '2026-11-12' });
    const v = await vars(page);
    for (const id of ['edge1', 'edge2', 'o2']) {
      await press(page, `.week .strip[data-event="${id}"]`);
      const r = await page.locator('.colorstrip').boundingBox();
      expect([r.width, r.height]).toEqual([336, 78]);
      expect(r.x, `${id} 左`).toBeGreaterThanOrEqual(v.ls + 8); expect(r.x + r.width, `${id} 右`).toBeLessThanOrEqual(v.le - 8);
      expect(r.x + r.width).toBeLessThanOrEqual(v.fold - v.keep); // 溝（--fold-x ± --fold-keepout）の外
      await page.keyboard.press('Escape'); await expect(page.locator('.colorstrip')).toHaveCount(0);
    }
  });
  test('開いた縦: 上下が溝にかかる所（月の最後の週）では、チップの上側へ出る', async ({ page }) => {
    await boot(page, { size: SIZES.openPortrait669, events: EVENTS, sel: '2026-11-12' });
    const v = await vars(page);
    expect(v.g1).toBeGreaterThan(v.g0);
    const b = await press(page, '.week .strip[data-event="last"]');
    expect(b.y + b.height + 4 + 78, '下に出すと溝にかかる位置').toBeGreaterThan(v.g0);
    const r = await page.locator('.colorstrip').boundingBox();
    expect(r.y + r.height <= v.g0 || r.y >= v.g1, `帯 ${r.y}〜${r.y + r.height} 溝 ${v.g0}〜${v.g1}`).toBe(true);
    expect(r.y + r.height).toBeLessThanOrEqual(b.y); // チップの上側
    expect([r.width, r.height]).toEqual([336, 78]);
  });
});

test.describe('必須4・望ましい7・8・14 開いた画面の薄い文字と前後の月', () => {
  for (const [name, size] of SCREENS.slice(1)) {
    test(`${name}: +N・曜日（月〜金）・六曜は #5D6963（土の列の地・左ページの地の上でも 4.5 以上）。前後の月の六曜は W4`, async ({ page }) => {
      await boot(page, { size, events: EVENTS, sel: '2026-11-12' });
      const got = await page.evaluate(() => {
        const vis = (s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length);
        const c = (e) => getComputedStyle(e).color;
        return { plus: vis('.week .plus').map((e) => [e.textContent, c(e)]), wd: vis('.weekdays span').map((e) => [e.className, c(e)]), rk: vis('.week .day:not(.out) .rk').map(c), rko: vis('.week .day.out .rk').map((e) => [c(e), getComputedStyle(e).fontWeight]) };
      });
      expect(got.plus.length).toBeGreaterThanOrEqual(2); // 11/20（金）と 11/21（土の列）
      for (const [t, col] of got.plus) expect(toHex(col), t).toBe(OUTC);
      const wd = got.wd.filter(([cls]) => !/sat|sun/.test(cls)); expect(wd.length).toBe(5);
      for (const [, col] of wd) expect(toHex(col)).toBe(OUTC);
      expect(got.wd.filter(([cls]) => /sat/.test(cls)).map(([, col]) => toHex(col))).toEqual(['#526B90']); // 土・日は案 A のまま
      expect(got.wd.filter(([cls]) => /sun/.test(cls)).map(([, col]) => toHex(col))).toEqual(['#B43C3C']);
      expect(got.rk.length).toBeGreaterThan(20); for (const col of got.rk) expect(toHex(col)).toBe(OUTC);
      expect(got.rko.length).toBeGreaterThan(5); for (const [col, w] of got.rko) { expect(toHex(col)).toBe(OUTC); expect(w).toBe('400'); }
      for (const bg of ['#F7F4ED', SAT_BG, LEFT_PAGE]) expect(ratio(OUTC, bg), bg).toBeGreaterThanOrEqual(4.5);
      expect(ratio('#68716A', SAT_BG)).toBeLessThan(4.5); expect(ratio('#68716A', LEFT_PAGE)).toBeLessThan(4.5); // 直す前の色は割っていた
    });
  }
  test('開いた横: 前後の月の予定の地と線は、左ページの地 #F0EDE5 に混ぜた色（地が消えない・線は 3 以上・文字は 4.5 以上）', async ({ page }) => {
    await boot(page, { size: SIZES.openLandscape951, events: EVENTS, sel: '2026-11-12' });
    expect(await pixel(page, 12, 660)).toBe(LEFT_PAGE); // 左ページの地
    const got = await page.evaluate(() => [...document.querySelectorAll('.week .strip.outm, .week .bar.outm')].filter((e) => e.getClientRects().length).map((e) => { const q = e.getBoundingClientRect(); return { id: e.dataset.event, bg: getComputedStyle(e).backgroundColor, line: getComputedStyle(e, '::before').backgroundColor, color: getComputedStyle(e).color, x: q.left, y: q.top, w: q.width }; }));
    const sets = { o1: colorSet(BASE[P]), o2: colorSet(BASE[G]), o3: colorSet(BASE[G]), o4: flickSet('sage') };
    expect(got.map((g) => g.id).sort()).toEqual(['o1', 'o2', 'o3', 'o4']);
    for (const g of got) {
      const s = sets[g.id], bg = toHex(g.bg), line = toHex(g.line);
      expect(near(bg, mixHex(s.tint, LEFT_PAGE, 0.30)), `${g.id} 地 ${bg}`).toBe(true);
      expect(near(line, mixHex(s.line, LEFT_PAGE, s.lineOutA / 100)), `${g.id} 線 ${line}`).toBe(true);
      expect(bg).not.toBe(LEFT_PAGE);
      expect(ratio(bg, LEFT_PAGE), `${g.id} 地×ページ`).toBeGreaterThanOrEqual(1.03); // 紙に混ぜていたときは 1.00〜1.02 で見えなかった
      expect(ratio(line, LEFT_PAGE), `${g.id} 線×ページ`).toBeGreaterThanOrEqual(3); expect(ratio(line, bg), `${g.id} 線×地`).toBeGreaterThanOrEqual(3);
      expect(toHex(g.color)).toBe(OUTC); expect(ratio(OUTC, bg), `${g.id} 文字`).toBeGreaterThanOrEqual(4.5);
      { const px = await pixel(page, Math.round(g.x + g.w / 2), Math.round(g.y) + 1); expect(near(px, bg, 2), `${g.id} 画面の画素 ${px} 計算 ${bg}`).toBe(true); } // 実際に描かれている色
    }
  });
  test('開いた縦・閉じた縦の前後の月は、紙に混ぜた値のまま（36 §15.4）', async ({ page }) => {
    await boot(page, { size: SIZES.openPortrait669, events: EVENTS, sel: '2026-11-12' });
    const bg = await page.locator('.week .bar.outm[data-event="o1"]').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(toHex(bg)).toBe(colorSet(BASE[P]).tintOut);
  });
  test('開いた横: 下のバーの上のぼかしは 12（時間軸の枠が 2 つに切れて見えない）。開いた縦は 24 のまま', async ({ page }) => {
    await boot(page, { size: SIZES.openLandscape951, events: EVENTS, sel: '2026-11-12' });
    const f = await page.evaluate(() => { const y = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabs-y')); return [...document.querySelectorAll('.tabfade')].map((e) => { const q = e.getBoundingClientRect(); return [q.height, q.bottom - y]; }); });
    expect(f).toEqual([[12, 0], [12, 0]]);
    await page.setViewportSize(SIZES.openPortrait669); await page.waitForTimeout(500);
    expect(await page.locator('.shell.open.portrait .tabfade').evaluate((e) => e.getBoundingClientRect().height)).toBe(24);
  });
  test('望ましい13 開いた縦: 下の欄の最後の行は、下の操作の丸の上端の 8 上まで送れる', async ({ page }) => {
    await boot(page, { size: SIZES.openPortrait669, events: EVENTS, sel: '2026-11-24' });
    const r = await page.evaluate(() => { const sc = document.querySelector('.shell.open.portrait .mday'); sc.scrollTop = sc.scrollHeight; const rows = [...sc.querySelectorAll('button, .mdcard')].filter((e) => e.getClientRects().length); const last = rows[rows.length - 1].getBoundingClientRect(); const fab = document.querySelector('.cb.ctoday').getBoundingClientRect(); return { bottom: last.bottom, fabTop: fab.top, can: sc.scrollHeight > sc.clientHeight }; });
    expect(r.fabTop - r.bottom).toBeGreaterThanOrEqual(8);
  });
});

test('連携 L-4: 開いた月の帯・チップの data-lane は段の番号（引用符が二重でない）', async ({ page }) => {
  await boot(page, { size: SIZES.openLandscape951, events: EVENTS, sel: '2026-11-12' });
  const got = await page.evaluate(() => [...document.querySelectorAll('.week > .strip, .week > .bar')].map((e) => ({ lane: e.getAttribute('data-lane'), bad: [...e.attributes].some((a) => /"/.test(a.name)) })));
  expect(got.length).toBeGreaterThan(10);
  for (const g of got) { expect(g.lane).toMatch(/^\d+$/); expect(g.bad).toBe(false); }
});
