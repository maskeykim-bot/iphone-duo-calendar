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
      expect(toHex(g.color)).toBe('#59655F'); expect(ratio('#59655F', bg), `${g.id} 文字（前後の月の基準 4.8）`).toBeGreaterThanOrEqual(4.8); expect(ratio(OUTC, bg)).toBeLessThan(4.8); // #5D6963 のままでは割る
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

// ---- 直し2: 編集シートの「色」の行（必須5）・色の帯の仕切り（必須6）・繰り返しの注記（望ましい12・企画 3）
const openCard = async (page, title) => { await page.locator('.mday .mdcard', { hasText: title }).first().click(); await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350); };
const rowOf = (page) => page.evaluate(() => {
  const r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height, cy: (q.top + q.bottom) / 2 }; };
  const f = document.querySelector('#f-color'), d = document.querySelector('#f-dest'), nm = f.querySelector('#color-name'), cs = getComputedStyle(nm), part = (c) => { const e = nm.querySelector(c); return e ? { ...r(e), text: e.textContent, cut: e.scrollWidth > e.clientWidth + 0.5 } : null; };
  return { row: r(f), lbl: r(f.querySelector('.dlbl')), lblFont: [getComputedStyle(f.querySelector('.dlbl')).fontSize, getComputedStyle(f.querySelector('.dlbl')).fontWeight], sw: r(f.querySelector('.csw')), swRadius: getComputedStyle(f.querySelector('.csw')).borderRadius, swLine: getComputedStyle(f.querySelector('.csw'), '::before').width,
    name: r(nm), text: nm.textContent, font: [cs.fontSize, cs.fontWeight, cs.letterSpacing], color: getComputedStyle(nm.querySelector('.cn1')).color, cn1: part('.cn1'), cn2: part('.cn2'), cn3: part('.cn3'),
    chev: r(f.querySelector('.dval > span:last-child')), dchev: r(d.querySelector('.dval > span:last-child')), ddot: r(d.querySelector('.cdot')), drow: r(d), aria: f.getAttribute('aria-label') };
});
test.describe('必須5 編集シートの「色」の行: 値は右寄せで、色の名前が切れずに読める', () => {
  const E = [ev('e1', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: P }), ev('e2', '練習', '2026-11-12T17:00', '2026-11-12T18:00', { categoryId: 'longcat' })];
  const CATS = [{ id: 'longcat', name: 'ゴルフ練習場の予約と打ちっぱなしの記録', color: '#1f6a73' }];
  test('閉じた縦: 「カテゴリの色（プライベート）」が全部出る。見本 28×20・名前 15pt W4・字間 0・名前と › の間 6・› 幅 8（右端はカレンダーの行の › と同じ）', async ({ page }) => {
    await boot(page, { events: E, cats: CATS });
    await openCard(page, '歯医者');
    const m = await rowOf(page);
    expect(m.text).toBe('カテゴリの色（プライベート）'); expect(m.aria).toBe('色 カテゴリの色（プライベート）');
    expect(m.row.h).toBe(44);
    expect(m.lblFont).toEqual(['15px', '400']);
    expect([m.cn1.cut, m.cn2.cut, m.cn3.cut]).toEqual([false, false, false]); // どこも切れていない
    expect([m.cn1.text, m.cn2.text, m.cn3.text]).toEqual(['カテゴリの色（', 'プライベート', '）']);
    expect([m.sw.w, m.sw.h, m.swRadius, m.swLine]).toEqual([28, 20, '4px', '3px']);
    expect(m.font[0]).toBe('15px'); expect(m.font[1]).toBe('400'); expect(['normal', '0px']).toContain(m.font[2]);
    expect(m.sw.l - m.lbl.r, '「色」と値の間').toBeGreaterThanOrEqual(16);
    expect(m.name.l - m.sw.r, '見本と名前の間').toBeCloseTo(6, 1);
    expect(m.chev.l - m.name.r, '名前と › の間').toBeCloseTo(6, 1);
    expect(m.chev.w).toBeCloseTo(8, 1);
    expect(m.chev.r, '› の右端はカレンダーの行と同じ').toBeCloseTo(m.dchev.r, 1);
    expect(m.sw.cy - m.row.t, '見本の縦の中心は、カレンダーの行の丸と同じ高さ').toBeCloseTo(m.ddot.cy - m.drow.t, 1); expect(Math.abs(m.sw.cy - m.row.cy)).toBeLessThanOrEqual(0.5); // 行の下の線 1 の分で 0.5
    expect(toHex(m.color)).toBe('#68716A'); // 既定は薄い文字（白の上 4.97）
    expect(m.name.w, '10 字（150pt）が入る').toBeGreaterThanOrEqual(150);
    // 選んだ色の名前は墨で、1 つだけ
    await page.locator('#f-color').click(); await page.locator('#color-pop .dopt', { hasText: 'ラベンダーグレー' }).click(); await expect(page.locator('#color-pop')).toBeHidden();
    const p = await rowOf(page);
    expect(p.text).toBe('ラベンダーグレー'); expect(p.cn2).toBeNull(); expect(p.cn1.cut).toBe(false); expect(toHex(p.color)).toBe('#1C1F1D');
    expect(p.chev.r).toBeCloseTo(m.chev.r, 1); expect(p.chev.l - p.name.r).toBeCloseTo(6, 1);
  });
  test('長い分類名: 「カテゴリの色（」と「）」は切らず、分類名だけが … で切れる', async ({ page }) => {
    await boot(page, { events: E, cats: CATS });
    await openCard(page, '練習');
    const m = await rowOf(page);
    expect(m.text).toBe('カテゴリの色（ゴルフ練習場の予約と打ちっぱなしの記録）');
    expect([m.cn1.cut, m.cn2.cut, m.cn3.cut]).toEqual([false, true, false]);
    expect(await page.locator('#color-name .cn2').evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis');
    expect(m.cn1.w).toBeGreaterThanOrEqual(7 * 14); // 「カテゴリの色（」7 字がそのまま
    expect(m.cn3.r).toBeLessThanOrEqual(m.chev.l - 5.9); expect(m.chev.r).toBeCloseTo(m.dchev.r, 1);
    expect(m.sw.l - m.lbl.r).toBeGreaterThanOrEqual(16); // 長くても「色」との間は 16 以上
    expect(m.row.r - m.chev.r).toBeCloseTo(4, 0);
  });
});

test.describe('必須6・望ましい12 色の帯と繰り返しの注記', () => {
  const E = [ev('e1', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: P }), ev('rp', '毎週の定例', '2026-11-10T10:00', '2026-11-10T11:00', { categoryId: W, recurrence: { freq: 'weekly', interval: 1 } })];
  const strip = async (page, id) => { const b = await page.locator(`.week .strip[data-event^="${id}"]`).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.locator('.cmenu [data-cm="color"]').click(); await expect(page.locator('.colorstrip')).toBeVisible(); };
  test('色の帯: 最初の見本に文字はなく、7 色との間に仕切り 1×20（#DCD7CB）。押す的は 40×44 が 8 つで、仕切りは的と的の間。全部 336 の中', async ({ page }) => {
    await boot(page, { size: SIZES.openLandscape951, events: E });
    await strip(page, 'e1');
    const m = await page.evaluate(() => { const r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, w: q.width, h: q.height }; }; const s = document.querySelector('.colorstrip'); return { strip: r(s), text: s.querySelector('.csr').textContent.trim(), b: s.querySelectorAll('.csw b').length, csn: s.querySelector('.csn').textContent, btns: [...s.querySelectorAll('.cso')].map((e) => ({ ...r(e), label: e.getAttribute('aria-label'), sw: r(e.querySelector('.csw')) })), div: { ...r(s.querySelector('.csdiv')), bg: getComputedStyle(s.querySelector('.csdiv')).backgroundColor, hidden: s.querySelector('.csdiv').getAttribute('aria-hidden') }, order: [...s.querySelector('.csr').children].map((e) => e.className.split(' ')[0]) }; });
    expect(m.text).toBe(''); expect(m.b).toBe(0); // 「分類」の字はない
    expect(m.csn).toBe('カテゴリの色'); expect(m.btns[0].label).toBe('カテゴリの色に戻す、選択中');
    expect(m.order).toEqual(['cso', 'csdiv', 'cso', 'cso', 'cso', 'cso', 'cso', 'cso', 'cso']);
    expect(m.btns.length).toBe(8);
    for (const b of m.btns) { expect([b.w, b.h]).toEqual([40, 44]); expect([b.sw.w, b.sw.h]).toEqual([32, 24]); expect(b.l).toBeGreaterThanOrEqual(m.strip.l); expect(b.r).toBeLessThanOrEqual(m.strip.r); }
    expect([m.div.w, m.div.h]).toEqual([1, 20]); expect(toHex(m.div.bg)).toBe('#DCD7CB'); expect(m.div.hidden).toBe('true');
    expect((m.div.t + m.div.b) / 2).toBeCloseTo((m.btns[0].sw.t + m.btns[0].sw.b) / 2, 1); // 見本の縦の中心
    expect(m.div.l).toBeGreaterThanOrEqual(m.btns[0].r); expect(m.div.r).toBeLessThanOrEqual(m.btns[1].l); // 押す的と押す的のすき間
    expect(m.div.l - m.btns[0].sw.r).toBeGreaterThan(4); // 選んでいる見本の輪（外へ 4）とくっつかない
    expect(m.btns[0].sw.l - m.strip.l).toBeCloseTo(8, 1); expect(m.strip.r - m.btns[7].sw.r).toBeCloseTo(8, 1);
    expect([m.strip.w, m.strip.h]).toEqual([336, 78]);
    // 1 回の予定のトーストは今までどおり
    await page.locator('.colorstrip [data-cs="sage"]').click();
    await expect(toast(page)).toContainText('色を変えました'); await expect(toast(page)).not.toContainText('すべての回');
  });
  test('繰り返しの予定を色の帯で変えると「すべての回の色を変えました｜元に戻す」。全部の回が同じ色になり、元に戻せる', async ({ page }) => {
    await boot(page, { size: SIZES.openLandscape951, events: E });
    await strip(page, 'rp');
    await page.locator('.colorstrip [data-cs="terracotta"]').click();
    await expect(toast(page)).toContainText('すべての回の色を変えました'); await expect(toast(page).locator('button')).toHaveText('元に戻す');
    expect(await toast(page).evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(60); // 1 行
    expect((await dbEvs(page)).find((e) => e.id === 'rp').colorId).toBe('terracotta');
    const marks = await page.evaluate(() => [...document.querySelectorAll('.week .strip[data-event^="rp"]')].map((e) => getComputedStyle(e).getPropertyValue('--cat-mark').trim()));
    expect(marks.length).toBeGreaterThanOrEqual(3); expect(new Set(marks)).toEqual(new Set(['#A56148'])); // 全部の回
    await toast(page).locator('button').click();
    await expect.poll(async () => (await dbEvs(page)).find((e) => e.id === 'rp').colorId).toBeUndefined();
  });
  test('色を選ぶ画面: 繰り返しの予定のときだけ、7 色の下に「繰り返しの予定は、すべての回が同じ色になります。」（12pt W4・#5D6963・上 12・左右 20・行間 1.5）', async ({ page }) => {
    await boot(page, { events: E, sel: '2026-11-10' });
    await openCard(page, '毎週の定例');
    await page.locator('#f-color').click(); await expect(page.locator('#color-pop')).toBeVisible(); await page.waitForTimeout(350);
    const n = await page.evaluate(() => { const e = document.querySelector('#color-pop .crep'), s = getComputedStyle(e), q = e.getBoundingClientRect(), last = [...document.querySelectorAll('#color-pop .dopt')].pop().getBoundingClientRect(), pg = e.parentElement.getBoundingClientRect(); return { text: e.textContent, fs: s.fontSize, fw: s.fontWeight, lh: parseFloat(s.lineHeight) / parseFloat(s.fontSize), color: s.color, top: q.top - last.bottom, left: q.left - pg.left, right: pg.right - q.right, fits: document.querySelector('#color-pop').scrollHeight <= document.querySelector('#color-pop').clientHeight }; });
    expect(n.text).toBe('繰り返しの予定は、すべての回が同じ色になります。');
    expect([n.fs, n.fw]).toEqual(['12px', '400']); expect(n.lh).toBeCloseTo(1.5, 2); expect(toHex(n.color)).toBe(OUTC);
    expect(n.top).toBeCloseTo(12, 0); expect(n.left).toBeCloseTo(20, 0); expect(n.right).toBeGreaterThanOrEqual(19.5);
    expect(n.fits).toBe(true); // 閉じた縦でもスクロールなしで入る
    expect(ratio(OUTC, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  test('色を選ぶ画面: 繰り返しでない予定には注記を出さない', async ({ page }) => {
    await boot(page, { events: E });
    await openCard(page, '歯医者');
    await page.locator('#f-color').click(); await expect(page.locator('#color-pop')).toBeVisible();
    expect(await page.locator('#color-pop .crep').count()).toBe(0);
  });
});

// ---- 直し3: 連携 M-1＝品質 Q-1（下書きを戻すと色が消える）、品質 Q-2（薄い文字の実測）・Q-5（現在時刻の札）
// 文字の色（計算済みスタイル）と、その文字のすぐ横に実際に描かれている地の画素から比を出す
const measured = async (page, sel, side = 'left') => {
  const els = await page.evaluate(([sel]) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0 && !e.hidden).map((e) => { const q = e.getBoundingClientRect(), d = e.closest('.day') || (e.dataset.plus ? document.querySelector(`.week .day[data-date="${e.dataset.plus}"]`) : null); return { text: e.textContent.trim(), color: getComputedStyle(e).color, weight: getComputedStyle(e).fontWeight, l: q.left, r: q.right, t: q.top, b: q.bottom, out: !!d?.classList.contains('out'), sat: !!d?.classList.contains('sat') || e.classList.contains('sat'), selected: !!d?.classList.contains('selected'), today: !!d?.classList.contains('today') }; }), [sel]);
  const out = [];
  for (const e of els) {
    const plus = side === 'plus'; // 開いた画面の +N は 44×44 の箱の右上に字がある: 字の右の余白（3）の中、日付の段の高さで測る
    const x = plus ? Math.floor(e.r) - 2 : side === 'left' ? Math.floor(e.l) - 1 : side === 'right' ? Math.ceil(e.r) + 1 : Math.floor(e.l) + 1, y = plus ? Math.round(e.t + 9) : Math.round((e.t + e.b) / 2);
    const bg = await pixel(page, x, y), color = toHex(e.color);
    out.push({ ...e, color, bg, ratio: ratio(color, bg) });
  }
  return out;
};
const MANY = [...EVENTS, ...[0, 1, 2, 3, 4, 5].map((i) => ev(`p${i}`, `前の月の多い日${i}`, `2026-10-31T1${i}:00`, `2026-10-31T1${i}:30`, { categoryId: W })), allDay('ad', '終日の予定', '2026-11-12', '2026-11-12', { categoryId: P }), ev('tt', '時刻の予定', '2026-11-12T13:00', '2026-11-12T14:00', { categoryId: F })];

for (const [name, size] of SCREENS) {
  test(`+N の実測（${name}）: #5D6963。当月・土の列・前後の月のどの地の上でも 4.5 以上（文字の色と、実際に描かれている地の画素から）`, async ({ page }) => {
    await boot(page, { size, events: MANY, sel: '2026-11-12' });
    const got = (await measured(page, '.week .plus', name === '閉じた縦' ? 'right' : 'plus')).filter((g) => /^\+\d/.test(g.text) && !g.selected);
    expect(got.length).toBeGreaterThanOrEqual(3);
    expect(got.some((g) => g.sat && !g.out), '土の列の +N').toBe(true); expect(got.some((g) => g.out), '前後の月の +N').toBe(true);
    for (const g of got) { expect(g.color, g.text).toBe(OUTC); expect(g.ratio, `${g.text} ${g.color}×${g.bg}${g.sat ? ' 土' : ''}${g.out ? ' 前後の月' : ''}`).toBeGreaterThanOrEqual(g.out || g.sat ? 4.8 : 4.5); }
    if (name === '開いた横') expect(new Set(got.filter((g) => !g.sat && !g.today).map((g) => g.bg))).toEqual(new Set([LEFT_PAGE])); // 左ページの地の上で測っている
  });
}
for (const [name, size] of SCREENS.slice(1)) {
  test(`品質 Q-2・設計 望ましい8 の実測（${name}）: 六曜と曜日は #5D6963。前後の月・土の列の上で 4.8 以上、当月で 4.5 以上`, async ({ page }) => {
    await boot(page, { size, events: MANY, sel: '2026-11-12' });
    const rk = (await measured(page, '.week .day .rk')).filter((g) => !g.selected);
    const pick = [...rk.filter((g) => g.out), ...rk.filter((g) => g.sat && !g.out), ...rk.filter((g) => !g.out && !g.sat).slice(0, 4)];
    expect(pick.filter((g) => g.out).length).toBeGreaterThanOrEqual(10); expect(pick.filter((g) => g.sat && !g.out).length).toBeGreaterThanOrEqual(4);
    for (const g of pick) {
      expect(g.color, g.text).toBe(OUTC);
      expect(g.ratio, `六曜 ${g.text} ${g.color}×${g.bg}${g.sat ? ' 土' : ''}${g.out ? ' 前後の月' : ''}`).toBeGreaterThanOrEqual(g.out || g.sat ? 4.8 : 4.5);
      if (g.out) expect(g.weight).toBe('400');
    }
    expect(pick.some((g) => g.sat && g.bg === SAT_BG), '土の列の地の上で測っている').toBe(true);
    if (name === '開いた横') expect(pick.some((g) => g.bg === LEFT_PAGE), '左ページの地の上で測っている').toBe(true);
    const wd = await measured(page, '.weekdays span', 'inside'); expect(wd.length).toBe(7);
    for (const g of wd) { expect(g.ratio, `曜日 ${g.text} ${g.color}×${g.bg}`).toBeGreaterThanOrEqual(4.5); if (!/[土日]/.test(g.text)) expect(g.color).toBe(OUTC); }
    if (name === '開いた横') expect(wd.some((g) => g.bg === LEFT_PAGE)).toBe(true);
  });
}
test('品質 Q-2 の実測（開いた縦の月＋一覧）: 日の一覧の「終日」と時刻（.mdt）は #5D6963 で 4.5 以上', async ({ page }) => {
  await boot(page, { size: SIZES.openPortrait, events: MANY, sel: '2026-11-12' });
  await expect(page.locator('.shell.open.portrait .mday .mdev .mdt').first()).toBeVisible();
  const got = await measured(page, '.mdev .mdt', 'right');
  expect(got.length).toBeGreaterThanOrEqual(2); expect(got.some((g) => g.text === '終日')).toBe(true); expect(got.some((g) => /^\d+:\d\d$/.test(g.text))).toBe(true);
  for (const g of got) { expect(g.color).toBe(OUTC); expect(g.ratio, `${g.text} ${g.color}×${g.bg}`).toBeGreaterThanOrEqual(4.5); }
  expect(ratio('#8C918A', '#F7F4ED')).toBeLessThan(3); // 直す前
});

test('品質 Q-5: 現在時刻の札の地は #CF3F3B（白の文字 4.5 以上。実際の画素でも）', async ({ page }) => {
  await boot(page, { size: SIZES.openLandscape951, events: MANY, sel: '2026-11-12' });
  const now = page.locator('.nowt').first(); await expect(now).toBeVisible();
  const s = await now.evaluate((e) => { const c = getComputedStyle(e), q = e.getBoundingClientRect(); return { bg: c.backgroundColor, color: c.color, x: q.left + 4, y: q.top + q.height / 2, line: getComputedStyle(e.closest('.nowl'), '::before').backgroundColor }; });
  expect(toHex(s.bg)).toBe('#CF3F3B'); expect(toHex(s.color)).toBe('#FFFFFF'); expect(toHex(s.line)).toBe('#CF3F3B');
  expect(await pixel(page, Math.round(s.x), Math.round(s.y))).toBe('#CF3F3B');
  expect(ratio('#FFFFFF', '#CF3F3B')).toBeGreaterThanOrEqual(4.5); expect(ratio('#FFFFFF', '#D64541')).toBeLessThan(4.5);
});

test.describe('連携 M-1・品質 Q-1 下書きを戻しても、選んだ色が戻る（保存しても消えない）', () => {
  const RP = [ev('rp', '定例', '2026-11-03T10:00', '2026-11-03T11:00', { categoryId: W, colorId: 'sage', recurrence: { freq: 'weekly', interval: 1 } }), ev('e1', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: P })];
  const draftOf = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('duo.draft.v1') || 'null'));
  const marksOf = (page, id) => page.locator(`.mgrid .chip[data-event^="${id}"]`).evaluateAll((l) => l.map((e) => getComputedStyle(e).getPropertyValue('--cat-mark').trim()));
  for (const scope of ['only', 'all']) {
    test(`繰り返しの予定（色＝セージ）を編集中に再起動 → 色の行はセージのまま → ${scope === 'only' ? '保存（選べるなら「この予定のみ」）' : '「すべて」で保存'}しても全部の回がセージ`, async ({ page }) => {
      await boot(page, { events: RP, sel: '2026-11-17' });
      expect(new Set(await marksOf(page, 'rp'))).toEqual(new Set(['#65785B']));
      await openCard(page, '定例');
      await page.locator('#f-title').fill('定例（改題中）'); await page.waitForTimeout(400);
      expect((await draftOf(page)).colorId).toBe('sage');
      await reloadKeep(page); // 再起動（WebView の作り直し）
      await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350);
      await expect(page.locator('#f-title')).toHaveValue('定例（改題中）');
      expect(await page.locator('#color-name').textContent(), '色の行は下書きの色').toBe('セージ');
      expect(await page.locator('#color-sw').evaluate((e) => getComputedStyle(e).getPropertyValue('--cat-tint').trim())).toBe('#DDE3D8');
      await page.locator('#editor button[type=submit]').click(); await expect(page.locator('[data-scope="all"]')).toBeVisible();
      const only = page.locator('[data-scope="only"]:not([disabled])'); // 戻した下書きでは「この予定のみ」が選べないことがある（回の手がかりが下書きにないとき）。選べるほうで保存する
      await (scope === 'only' && (await only.count()) ? only : page.locator('[data-scope="all"]')).click(); await expect(page.locator('#editor')).toBeHidden();
      const p = (await dbEvs(page)).find((e) => e.id === 'rp');
      expect(p.colorId, '本体の colorId が残る').toBe('sage');
      const m = await marksOf(page, 'rp'); expect(m.length).toBeGreaterThanOrEqual(4); expect(new Set(m), '全部の回がセージ').toEqual(new Set(['#65785B']));
    });
  }
  test('下書きの中で選び直した色も戻る（色を選ぶ → 再起動 → 色が戻る → 保存しても残る）。「カテゴリの色」に戻した下書きは、戻したまま', async ({ page }) => {
    await boot(page, { events: RP, sel: '2026-11-12' });
    await openCard(page, '歯医者');
    await page.locator('#f-color').click(); await page.locator('#color-pop .dopt', { hasText: 'テラコッタ' }).click(); await expect(page.locator('#color-pop')).toBeHidden(); await page.waitForTimeout(400);
    expect((await draftOf(page)).colorId).toBe('terracotta');
    expect((await dbEvs(page)).find((e) => e.id === 'e1').colorId).toBeUndefined();
    await reloadKeep(page);
    await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350);
    expect(await page.locator('#color-name').textContent()).toBe('テラコッタ');
    await page.locator('#editor button[type=submit]').click(); await expect(page.locator('#editor')).toBeHidden();
    expect((await dbEvs(page)).find((e) => e.id === 'e1').colorId).toBe('terracotta');
    expect(new Set(await marksOf(page, 'e1'))).toEqual(new Set(['#A56148']));
    // 色を外した下書き（colorId: null）は、外したまま戻る
    await openCard(page, '歯医者');
    await page.locator('#f-color').click(); await page.locator('#color-pop .dopt').first().click(); await expect(page.locator('#color-pop')).toBeHidden(); await page.waitForTimeout(400);
    expect((await draftOf(page)).colorId).toBeNull();
    await reloadKeep(page);
    await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350);
    expect(await page.locator('#color-name').textContent()).toBe('カテゴリの色（プライベート）');
    await page.locator('#editor button[type=submit]').click(); await expect(page.locator('#editor')).toBeHidden();
    expect('colorId' in (await dbEvs(page)).find((e) => e.id === 'e1')).toBe(false);
  });
  test('下書きの colorId が壊れていても落ちない（文字列でない・41 字以上はカテゴリの色として戻す）', async ({ page }) => {
    await boot(page, { events: RP, sel: '2026-11-12' });
    await openCard(page, '歯医者'); await page.locator('#f-title').fill('歯医者2'); await page.waitForTimeout(400);
    await page.evaluate(() => { const d = JSON.parse(sessionStorage.getItem('duo.draft.v1')); d.colorId = 'x'.repeat(41); sessionStorage.setItem('duo.draft.v1', JSON.stringify(d)); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350);
    expect(await page.locator('#color-name').textContent()).toBe('カテゴリの色（プライベート）');
  });
});
