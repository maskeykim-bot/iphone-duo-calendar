// 第19.4版: くすみ色（design/36）と予定ごとの色（design/37）。qa/verify-muted-colors.md の項目ごと（C-1〜C-8・D-1・D-2・D-5・P-1〜P-10）。
// 色は画面の計算済みスタイルから読み、コントラスト比はこの試験の中で計算する（v194-lib.js）。期待する色の値は js/colors.js（単体テストで設計の計算と突き合わせ済み）。
// 実機が要る項目（D-3 P3 の色・D-4 標準色の実際の値・P-6 別アカウントへ移す）は自動にできない（V194.md に書く）。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { clickSettings, enableCalendars } from './helpers.js';
import { boot, SIZES, ev, allDay, catId, texts, marks, bgs, varOf, ratio, rgbHex, dbEvs, dbCats, dbColors, cell, toast, mockNative, mockNext, CALS } from './v194-lib.js';
import { colorSet, flickSet, mixHex, FLICK, INK, OUT_TEXT, BG, WEEKEND } from '../js/colors.js';

const W = catId('work'), P = catId('private'), F = catId('family'), O = catId('out'), G = catId('other');
const BASE = { [W]: '#2f5f8a', [P]: '#8a4b6b', [F]: '#2e6b5a', [O]: '#87500f', [G]: '#5a5e62', bright: '#34aadc' };
const CATS = [{ id: 'bright', name: '水色', color: '#34aadc' }];
// 11 月（今日 11/12 木）。前後の月（10/26〜31・12/1〜6）・週をまたぐ帯（11/14 土〜17 火）・入りきらない日（11/20）・祝日（11/3・11/23）
const EVENTS = [
  allDay('a1', '終日の仕事', '2026-11-12', '2026-11-12', { categoryId: W }), allDay('a2', '終日の私用', '2026-11-12', '2026-11-12', { categoryId: P }),
  ev('t1', '会議', '2026-11-12T09:00', '2026-11-12T10:00', { categoryId: F }), ev('t2', 'ランチ', '2026-11-12T12:00', '2026-11-12T13:00', { categoryId: O }), ev('t3', '雑務', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: G }),
  ev('t4', '水色の予定', '2026-11-10T10:00', '2026-11-10T11:00', { categoryId: 'bright' }), allDay('a3', '水色の終日', '2026-11-11', '2026-11-11', { categoryId: 'bright' }),
  allDay('m1', '週をまたぐ帯', '2026-11-14', '2026-11-17', { categoryId: W }),
  allDay('o1', '前の月の終日', '2026-10-28', '2026-10-28', { categoryId: P }), ev('o2', '前の月の時刻', '2026-10-29T10:00', '2026-10-29T11:00', { categoryId: F }), ev('o3', '次の月の時刻', '2026-12-02T10:00', '2026-12-02T11:00', { categoryId: O }), allDay('o4', '次の月の終日', '2026-12-03', '2026-12-03', { categoryId: G }),
  ...[0, 1, 2, 3, 4].map((i) => ev(`n${i}`, `多い日${i}`, `2026-11-20T1${i}:00`, `2026-11-20T1${i}:30`, { categoryId: [W, P, F, O, G][i] })),
];
const setOf = (e, mode) => (e.colorId ? { ...colorSet(BASE[e.categoryId], mode), ...flickSet(e.colorId, mode) } : colorSet(BASE[e.categoryId], mode));
const up = (h) => h.toUpperCase();
const MODES = [['ライト', false], ['ダーク（見本）', true]];

for (const [label, dark] of MODES) {
  const mode = dark ? 'dark' : 'light', ink = INK[mode], paper = BG[mode].paper, capsule = BG[mode].capsule;
  test.describe(`${label}`, () => {
    test('C-1・C-2・C-3 閉じた縦: 終日・複数日のチップは ごく薄い地＋左の線 2.5×10＋墨の文字（高さ 14）、時刻つきは地なし＋同じ線。文字 4.5 以上・線 3 以上', async ({ page }) => {
      await boot(page, { dark, events: EVENTS, cats: CATS });
      expect(await page.evaluate(() => document.documentElement.dataset.theme || '')).toBe(dark ? 'dark' : '');
      // 終日（11/12 の 2 本）: 地＝薄い地、文字＝墨、高さ 14
      for (const [id, e] of [['a1', EVENTS[0]], ['a2', EVENTS[1]]]) {
        const sel = `${cell('2026-11-12')} .bar.chip[data-event="${id}"]`, s = setOf(e, mode);
        const [b] = await bgs(page, sel); expect(b.bg).toBe(s.tint); expect(b.h).toBe(14); expect(b.radius).toBe('3px');
        const [t] = await texts(page, `${sel} .st`); expect(t.color).toBe(ink); expect(t.bg).toBe(s.tint); expect(t.ratio).toBeGreaterThanOrEqual(4.5); expect(t.weight).toBe('600');
        const [m] = await marks(page, `${sel} .cline`); expect(m.color).toBe(s.mark); expect([m.w, m.h, m.radius, m.left, m.top]).toEqual([2.5, 10, '1.25px', '2px', '2px']); expect(m.ratio).toBeGreaterThanOrEqual(3);
        expect(ratio(s.mark, paper)).toBeGreaterThanOrEqual(3); expect(ratio(ink, s.tint)).toBeGreaterThanOrEqual(4.5);
        expect(await page.locator(`${sel} .bt`).evaluate((x) => getComputedStyle(x).left)).toBe('7px'); // 文字はチップの左から 7
      }
      // 時刻つき（今日のマス。地は紙）: 地なし＋線＋墨
      const tsel = `${cell('2026-11-10')} .strip.timed`;
      const [tb] = await bgs(page, tsel); expect(tb.bg).toBe(tb.under); expect(tb.h).toBe(14);
      const [tt] = await texts(page, `${tsel} .st`); expect(tt.color).toBe(ink); expect(tt.ratio).toBeGreaterThanOrEqual(4.5);
      const [tm] = await marks(page, `${tsel} .cline`); const bs = colorSet('#34aadc', mode);
      expect(tm.color).toBe(bs.mark); expect([tm.w, tm.h]).toEqual([2.5, 10]); expect(tm.ratio).toBeGreaterThanOrEqual(3);
      expect(await page.locator(tsel).evaluate((x) => getComputedStyle(x).paddingLeft)).toBe('7px');
      if (!dark) { expect(bs.mark).toBe('#4084A5'); expect(bs.line).toBe('#2B7191'); } // 決定 4: 元が明るい色の左の線は mark（3:1）。色の文字用の線（4.5）とは別の値
      // 月のマスに見えている文字は全部 4.5 以上、線は全部 3 以上
      const all = await texts(page, '.mgrid .day .chip .st, .mgrid .day .num, .mgrid .plus.dyn:not([hidden]), .weekdays span');
      expect(all.length).toBeGreaterThan(50);
      for (const t of all) expect(t.ratio, `${t.text} ${t.color}×${t.bg}`).toBeGreaterThanOrEqual(4.5);
      const lines = await marks(page, '.mgrid .day .cline'); expect(lines.length).toBeGreaterThan(10);
      for (const m of lines) expect(m.ratio, `${m.color}×${m.bg}`).toBeGreaterThanOrEqual(3);
    });

    test('C-1・C-2・C-3・D-5 下の選択日の欄: 札は くすみ色の塗り＋縁 1＋墨の文字（濃い塗りではない）。カードの縦線 3 以上。日付の横の文字は #5D6963 でカプセルの上 4.85 以上', async ({ page }) => {
      await boot(page, { dark, events: EVENTS, cats: CATS });
      const pills = await bgs(page, '.mday .mdallday'); expect(pills.length).toBe(2);
      for (const [i, e] of [EVENTS[0], EVENTS[1]].entries()) {
        const s = setOf(e, mode), p = pills[i];
        expect(p.bg).toBe(s.fill); expect(rgbHex(p.border)).toBe(s.edge); expect(p.bw).toBe('1px'); expect(p.under).toBe(capsule);
        expect(ratio(s.edge, capsule)).toBeGreaterThanOrEqual(3); expect(ratio(s.edge, s.fill)).toBeGreaterThanOrEqual(3);
        expect(ratio('#FFFFFF', s.fill) < 4.5 || dark).toBe(true); // 白い文字が載るような濃い塗りではない
      }
      for (const t of await texts(page, '.mday .mdallday .mdat')) { expect(t.color).toBe(ink); expect(t.ratio).toBeGreaterThanOrEqual(4.5); }
      const lines = await marks(page, '.mday .mdcard.mdk-event .mdln'); expect(lines.length).toBe(3);
      for (const [i, e] of [EVENTS[2], EVENTS[3], EVENTS[4]].entries()) { expect(lines[i].color).toBe(setOf(e, mode).mark); expect(lines[i].ratio).toBeGreaterThanOrEqual(3); expect(lines[i].w).toBe(3); }
      for (const t of await texts(page, '.mday .mdcard strong, .mday .mdcard .mdt1, .mday .mdcard .mdt2')) expect(t.ratio, `${t.text} ${t.color}×${t.bg}`).toBeGreaterThanOrEqual(4.5);
      // 日付の横の薄い文字（「木 先勝」）
      const [h] = await texts(page, '.mday .mdh .hdw'); expect(h.color).toBe(OUT_TEXT[mode]); expect(h.bg).toBe(capsule); expect(h.ratio).toBeGreaterThanOrEqual(dark ? 4.5 : 4.85);
      if (!dark) { expect(h.color).toBe('#5D6963'); expect(Math.floor(h.ratio * 100) / 100).toBe(4.85); }
      // 時間の型: 枠は 薄い地＋左 3 の線＋墨・角丸 4
      await page.locator('.mday .mdct button', { hasText: '時間' }).click(); await page.waitForTimeout(400);
      const blocks = await bgs(page, '.mday .tlev'); expect(blocks.length).toBe(3);
      for (const [i, e] of [EVENTS[2], EVENTS[3], EVENTS[4]].entries()) { const s = setOf(e, mode); expect(blocks[i].bg).toBe(s.tint); expect(blocks[i].radius).toBe('4px'); expect(ratio(s.mark, s.tint)).toBeGreaterThanOrEqual(3); }
      expect(await page.locator('.mday .tlev').first().evaluate((x) => getComputedStyle(x).boxShadow)).toMatch(/3px 0px 0px 0px inset/);
      for (const t of await texts(page, '.mday .tlev .tn')) { expect(t.color).toBe(ink); expect(t.ratio).toBeGreaterThanOrEqual(4.5); }
    });

    test('C-4・C-5 前後の月: 数字も予定もまとめて薄い（文字 #5D6963・普通の太さ・4.8 以上、地は薄い地の 30%、線は 79%（ダーク 62%）で 3 以上。不透明度は使わない）。+N は必ず見える', async ({ page }) => {
      await boot(page, { dark, events: EVENTS, cats: CATS });
      const out = OUT_TEXT[mode];
      const nums = await texts(page, '.mgrid .day.out .num'); expect(nums.length).toBe(12); // 10/26〜31 と 12/1〜6
      for (const n of nums) { expect(n.color).toBe(out); expect(n.weight).toBe('400'); expect(n.ratio).toBeGreaterThanOrEqual(4.8); }
      const inNum = await texts(page, `${cell('2026-11-10')} .num`); expect(inNum[0].color).toBe(ink); expect(inNum[0].weight).toBe('600');
      // 前後の月の終日（10/28）: 地＝薄い地の 30%、線＝線の 79%、文字＝ #5D6963
      const s = colorSet(BASE[P], mode), sel = `${cell('2026-10-28')} .bar.chip`;
      const [b] = await bgs(page, sel); expect(b.bg).toBe(s.tintOut);
      const [t] = await texts(page, `${sel} .st`); expect(t.color).toBe(out); expect(t.bg).toBe(s.tintOut); expect(t.ratio).toBeGreaterThanOrEqual(4.8);
      const [m] = await marks(page, `${sel} .cline`); expect(m.color).toBe(s.lineOut); expect(m.ratio).toBeGreaterThanOrEqual(3); expect(ratio(s.lineOut, paper)).toBeGreaterThanOrEqual(3);
      // 前後の月の時刻つき（10/29・12/2）
      for (const k of ['2026-10-29', '2026-12-02']) { const [x] = await texts(page, `${cell(k)} .strip.timed .st`); expect(x.color).toBe(out); expect(x.ratio).toBeGreaterThanOrEqual(4.8); const [l] = await marks(page, `${cell(k)} .cline`); expect(l.ratio).toBeGreaterThanOrEqual(3); }
      // 薄くするのは色だけ（不透明度は 1）。今の月と比べて、文字の比がはっきり低い
      expect(await page.locator('.mgrid .day.out .chip').evaluateAll((l) => l.map((e) => getComputedStyle(e).opacity))).toEqual(['1', '1', '1', '1']);
      expect(nums[0].ratio).toBeLessThan(inNum[0].ratio - 3);
      // +N: 入りきらない日（11/20 は 5 件・3 段）に必ず出る。色は前後の月の文字と同じ
      const plus = page.locator('.mgrid .plus.dyn[data-plus="2026-11-20"]'); await expect(plus).toBeVisible(); expect(await plus.textContent()).toBe('+2');
      const [p] = await texts(page, '.mgrid .plus.dyn[data-plus="2026-11-20"]'); expect(p.color).toBe(out); expect(p.ratio).toBeGreaterThanOrEqual(4.5);
      // 段を変えても（月・2 件）+N は出たまま
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.stage = 3; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); }); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
      await expect(page.locator('.mgrid .plus.dyn[data-plus="2026-11-20"]')).toBeVisible(); expect(await page.locator('.mgrid .plus.dyn[data-plus="2026-11-20"]').textContent()).toBe('+3');
    });

    test('C-6 土日は案 A: 土の数字・曜日は青 #526B90、日・祝は赤 #B43C3C、土の列の地 #EEF1F4 は残る。前後の月の土日・祝は薄い文字', async ({ page }) => {
      await boot(page, { dark, events: [] });
      const w = WEEKEND[mode];
      const one = async (sel) => (await texts(page, sel))[0];
      const sat = await one(`${cell('2026-11-14')} .num`), sun = await one(`${cell('2026-11-15')} .num`), hol = await one(`${cell('2026-11-03')} .num`), holMon = await one(`${cell('2026-11-23')} .num`), wd = await one(`${cell('2026-11-10')} .num`);
      expect(sat.color).toBe(w.sat); expect(sat.bg).toBe(w.satCol); expect(sun.color).toBe(w.sun); expect(hol.color).toBe(w.hol); expect(holMon.color).toBe(w.hol); expect(wd.color).toBe(ink);
      for (const t of [sat, sun, hol, holMon]) expect(t.ratio, `${t.color}×${t.bg}`).toBeGreaterThanOrEqual(4.5);
      if (!dark) { expect([sat.color, sun.color, hol.color, sat.bg]).toEqual(['#526B90', '#B43C3C', '#B43C3C', '#EEF1F4']); expect(Math.floor(sat.ratio * 100) / 100).toBe(4.79); }
      const heads = await texts(page, '.mpull .weekdays span'); expect(heads.length).toBe(7);
      expect(heads[5].color).toBe(w.sat); expect(heads[6].color).toBe(w.sun); for (const h of heads) expect(h.ratio).toBeGreaterThanOrEqual(4.5);
      // 前後の月の土（10/31）・日（12/6）は薄い文字（赤・青にしない）。土の列の地は残る
      const oSat = await one(`${cell('2026-10-31')} .num`), oSun = await one(`${cell('2026-12-06')} .num`);
      expect(oSat.color).toBe(OUT_TEXT[mode]); expect(oSat.bg).toBe(w.satCol); expect(oSun.color).toBe(OUT_TEXT[mode]); expect(oSat.ratio).toBeGreaterThanOrEqual(4.8);
    });

    test('C-1 開いた横・開いた縦: 月のチップと帯（薄い地＋左の線 2.5×10＋墨・高さ 14）、時間軸の枠（薄い地＋左 3・角丸 4）、終日の帯。文字 4.5・線 3', async ({ page }) => {
      for (const size of [SIZES.openLandscape951, SIZES.openPortrait669]) {
        await boot(page, { dark, size, events: EVENTS, cats: CATS });
        const strips = await bgs(page, '.week .strip:not(.chip):not(.outm)'); expect(strips.length).toBeGreaterThanOrEqual(3);
        const s1 = colorSet(BASE.bright, mode);
        const [b] = await bgs(page, '.week .strip[data-event="t4"]'); expect(b.bg).toBe(s1.tint); expect(b.h).toBe(14); expect(b.radius).toBe('3px');
        const [m] = await marks(page, '.week .strip[data-event="t4"]', '::before'); expect(m.color).toBe(s1.mark); expect([m.w, m.h, m.radius, m.left]).toEqual([2.5, 10, '1.25px', '2px']); expect(m.ratio).toBeGreaterThanOrEqual(3);
        expect(await page.locator('.week .strip[data-event="t4"]').evaluate((x) => getComputedStyle(x).paddingLeft)).toBe('7px');
        // 帯（週をまたぐ）: 週の頭ごとに線と題名、続く側の角は 0
        const bars = await page.locator('.week .bar[data-event="m1"]').evaluateAll((l) => l.map((e) => { const c = getComputedStyle(e), b4 = getComputedStyle(e, '::before'); return { r: [c.borderTopLeftRadius, c.borderTopRightRadius], bg: c.backgroundColor, t: e.textContent, line: b4.width, h: c.height }; }));
        expect(bars.length).toBe(2); expect(bars.map((x) => x.r)).toEqual([['3px', '0px'], ['0px', '3px']]); expect(bars.every((x) => x.t === '週をまたぐ帯' && x.line === '2.5px' && x.h === '14px' && rgbHex(x.bg) === colorSet(BASE[W], mode).tint)).toBe(true);
        for (const t of await texts(page, '.week .strip .st, .week .bar .st, .week .day .num, .week .plus')) expect(t.ratio, `${t.text} ${t.color}×${t.bg}`).toBeGreaterThanOrEqual(4.5);
        for (const x of await marks(page, '.week .strip, .week .bar', '::before')) expect(x.ratio, `${x.color}×${x.bg}`).toBeGreaterThanOrEqual(3);
        // 前後の月（開いた月）: チップの地 30%・文字 #5D6963
        const so = colorSet(BASE[F], mode), lp = !dark && size === SIZES.openLandscape951; const [ob] = await bgs(page, '.week .strip.outm[data-event="o2"]'); expect(ob.bg).toBe(lp ? mixHex(so.tint, '#F0EDE5', 0.30) : so.tintOut); // レビュー直し 望ましい7: 開いた横の左ページ（#F0EDE5）ではそのページの地に混ぜる
        const [ot] = await texts(page, '.week .strip.outm[data-event="o2"] .st'); expect(ot.color).toBe(lp ? '#59655F' : OUT_TEXT[mode]); expect(ot.ratio).toBeGreaterThanOrEqual(4.8);
        if (size === SIZES.openLandscape951) { // 右のページ: 時間軸と終日の帯
          const blocks = await bgs(page, '.page.rp .tlev, .tl .tlev'); expect(blocks.length).toBeGreaterThan(0);
          const tints = [EVENTS[2], EVENTS[3], EVENTS[4]].map((e) => setOf(e, mode).tint);
          for (const k of blocks) { expect(tints).toContain(k.bg); expect(k.radius).toBe('4px'); }
          expect(await page.locator('.tl .tlev').first().evaluate((x) => [getComputedStyle(x).boxShadow, getComputedStyle(x).paddingLeft])).toEqual([expect.stringMatching(/3px 0px 0px 0px inset/), '11px']);
          for (const t of await texts(page, '.tl .tlev .tn, .tl .tlev .tt, .adpill')) { expect(t.color).toBe(ink); expect(t.ratio, `${t.text}`).toBeGreaterThanOrEqual(4.5); }
          const pills = await bgs(page, '.adpill'); expect(pills.map((x) => x.bg)).toEqual([setOf(EVENTS[0], mode).tint, setOf(EVENTS[1], mode).tint]);
          for (const x of await marks(page, '.adpill', '::before')) { expect(x.w).toBe(2.5); expect(x.ratio).toBeGreaterThanOrEqual(3); }
        }
        await page.evaluate(() => sessionStorage.clear());
      }
    });

    test('P-1・37 予定ごとの色: フリックの 7 色はチップ・札・カード・枠で同じ組。7 色とも 文字 4.5・線 3', async ({ page }) => {
      const evs = FLICK.map((f, i) => (i % 2 ? allDay(`f${i}`, f.name, `2026-11-${16 + i}`, `2026-11-${16 + i}`, { categoryId: W, colorId: f.id }) : ev(`f${i}`, f.name, `2026-11-${16 + i}T10:00`, `2026-11-${16 + i}T11:00`, { categoryId: W, colorId: f.id })));
      await boot(page, { dark, events: [...evs, allDay('p1', '札', '2026-11-12', '2026-11-12', { categoryId: P, colorId: 'terracotta' }), ev('p2', 'カード', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: P, colorId: 'sage' })] });
      for (const [i, f] of FLICK.entries()) {
        const s = flickSet(f.id, mode), sel = `${cell(`2026-11-${16 + i}`)} .chip`;
        const [m] = await marks(page, `${sel} .cline`); expect(m.color).toBe(up(f[mode][1])); expect(m.ratio).toBeGreaterThanOrEqual(3);
        const [t] = await texts(page, `${sel} .st`); expect(t.color).toBe(ink); expect(t.ratio).toBeGreaterThanOrEqual(4.5);
        if (i % 2) { const [b] = await bgs(page, sel); expect(b.bg).toBe(up(f[mode][0])); expect(b.bg).toBe(s.tint); }
        expect(ratio(s.line, paper)).toBeGreaterThanOrEqual(3); expect(ratio(s.line, capsule)).toBeGreaterThanOrEqual(3);
      }
      const t = flickSet('terracotta', mode), g = flickSet('sage', mode);
      const [pill] = await bgs(page, '.mday .mdallday'); expect(pill.bg).toBe(t.tint); expect(rgbHex(pill.border)).toBe(t.line);
      const [ln] = await marks(page, '.mday .mdcard.mdk-event .mdln'); expect(ln.color).toBe(g.line); expect(ln.ratio).toBeGreaterThanOrEqual(3);
      await page.locator('.mday .mdct button', { hasText: '時間' }).click(); await page.waitForTimeout(400);
      const [blk] = await bgs(page, '.mday .tlev'); expect(blk.bg).toBe(g.tint);
    });
  });
}

// ---------- データ（表示のときだけ変える）
test('D-1 保存の色は元のまま: IndexedDB の分類の色・書き出したバックアップは元の hex。画面の style には変換後の色だけが入る', async ({ page }) => {
  await boot(page, { events: EVENTS, cats: CATS });
  const cats = await dbCats(page);
  expect(Object.fromEntries(cats.map((c) => [c.id, c.color]))).toMatchObject({ [W]: '#2f5f8a', [P]: '#8a4b6b', [F]: '#2e6b5a', [O]: '#87500f', [G]: '#5a5e62', bright: '#34aadc' });
  const bk = await page.evaluate(async () => { const db = await import('/js/db.js'), b = await import('/js/backup.js'); return b.buildBackup(await db.listEvents(), {}, new Date(), await db.listCategories(), [], [], [], [], []); });
  expect(bk.version).toBe(6); expect(bk.categories.find((c) => c.id === W).color).toBe('#2f5f8a'); expect(bk.categories.find((c) => c.id === 'bright').color).toBe('#34aadc');
  expect(JSON.stringify(bk)).not.toMatch(/#D4DDEB|#526B90|#C3E5FC|#4084A5/i); // くすませた色はどこにも保存されない
  expect((await dbEvs(page)).every((e) => !('color' in e) && !('colorId' in e))).toBe(true);
  const html = await page.locator('#app').innerHTML();
  expect(html).not.toMatch(/#2f5f8a|#8a4b6b|#34aadc/i); expect(html).toMatch(/--cat-tint:#D4DDEB/);
  // 設定で分類の色を変えても、保存されるのは選んだ元の色（12 色の丸は くすみ色の塗り＋線の縁 で見せる）
  await clickSettings(page); await page.locator('#menu [data-go="calendar"]').click(); await page.locator('#m-cedit').click(); await expect(page.locator('#m-cedit')).toHaveText('完了');
  await page.locator(`#menu [data-cedit="${W}"]`).click();
  const sw = page.locator('.swatch[data-color="#a13a3a"]'); await expect(sw).toBeVisible();
  const s6 = colorSet('#a13a3a');
  expect(await sw.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.borderTopColor]; }).then((l) => l.map(rgbHex))).toEqual([s6.fill, s6.line]);
  await sw.click(); await page.locator('#cat-close').click(); await expect(page.locator('#cats')).toBeHidden();
  expect((await dbCats(page)).find((c) => c.id === W).color).toBe('#a13a3a');
});

test('D-2・D-1 iPhone の予定（偽装）: 予定・設定のカレンダーの丸・詳細の丸は変換後の色。EventKit へ色を書く呼び出しはない。色が取れないときの代わりは #68716a の変換', async ({ page }) => {
  await boot(page, { before: (p) => mockNative(p, { cals: [...CALS, { id: 'cal-4', title: '色なし', color: 'display-p3 1.09 -0.2 0.5', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: false }] }) });
  await enableCalendars(page); await expect(page.locator(`${cell('2026-11-12')} .chip[data-event^="ip:e1"]`)).toBeVisible();
  const red = colorSet('#d93025'), aqua = colorSet('#34aadc'), grn = colorSet('#0b8043'), fb = colorSet('#68716a');
  // 予定（isX）: カードの縦線・月のチップの線は mark
  const [ln] = await marks(page, '.mday .mdcard[data-event^="ip:e1"] .mdln'); expect(ln.color).toBe(red.mark); expect(ln.ratio).toBeGreaterThanOrEqual(3);
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event^="ip:e1"]`, '--cat-tint')).toBe(red.tint);
  const [c3] = await marks(page, `${cell('2026-11-13')} .chip[data-event^="ip:l1"] .cline`); expect(c3.color).toBe(aqua.mark); expect(aqua.mark).not.toBe(aqua.line);
  const [hb] = await bgs(page, `${cell('2026-11-23')} .bar.chip`); expect(hb.bg).toBe(grn.tint);
  expect(await page.locator('#app').innerHTML()).not.toMatch(/#d93025|#34aadc|#0b8043/i);
  // 詳細の丸
  await page.locator('.mday .mdcard[data-event^="ip:e1"]').click(); await expect(page.locator('#xdetail')).toBeVisible();
  expect(rgbHex(await page.locator('#xd-body .xdcal .cdot').evaluate((e) => getComputedStyle(e).backgroundColor))).toBe(red.line);
  await page.locator('#xd-close').click(); await expect(page.locator('#xdetail')).toBeHidden();
  // 設定のカレンダーの丸（calRow・calDot）
  await clickSettings(page); await page.locator('#menu [data-go="calendar"]').click();
  const dots = await page.locator('#menu [data-cal]').evaluateAll((l) => l.map((e) => [e.dataset.cal, getComputedStyle(e.querySelector('.cdot')).backgroundColor]));
  expect(Object.fromEntries(dots.map(([k, v]) => [k, rgbHex(v)]))).toEqual({ 'cal-1': red.line, 'cal-2': grn.line, 'cal-3': aqua.line, 'cal-4': fb.line });
  expect(await page.locator('#menu').innerHTML()).not.toMatch(/#d93025|#34aadc|#0b8043|display-p3/i);
  // EventKit へは読むだけ（色を書く・予定を書き換える呼び出しはない）
  const methods = await page.evaluate(() => [...new Set(window.__mock.calls.map((c) => c.method))]);
  for (const m of methods) expect(['checkPermission', 'requestPermission', 'listCalendars', 'listEvents', 'getEvent', 'notifyStatus', 'requestNotifyPermission', 'notifySync', 'notifyClear', 'getPosture', 'selectionHaptic', 'setAccessoryBarVisible']).toContain(m);
});

test('見本のダークは利用者に出ない: ふつうに開くとライト（data-theme なし・紙 #F7F4ED）。OS がダークでも変わらない', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await boot(page, { events: EVENTS, cats: CATS });
  expect(await page.evaluate(() => [document.documentElement.dataset.theme || '', getComputedStyle(document.body).backgroundColor, getComputedStyle(document.documentElement).colorScheme])).toEqual(['', 'rgb(247, 244, 237)', 'light']);
  expect(await varOf(page, `${cell('2026-11-12')} .bar.chip`, '--cat-tint')).toBe('#D4DDEB');
});

// ---------- 色を選ぶ（design/37）
const openCard = async (page, title) => { await page.locator('.mday .mdcard', { hasText: title }).first().click(); await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350); };
const save = async (page) => { await page.locator('#editor button[type=submit]').click(); };

test('P-1・P-2 編集シートの「色」の行: カレンダーの行のすぐ下・高さ 44。選べるのは カテゴリの色＋フリックの 7 色だけ。選んで保存 → colorId、戻すと項目が消える', async ({ page }) => {
  await boot(page, { events: [ev('e1', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: P })] });
  await openCard(page, '歯医者');
  const row = page.locator('#f-color'), r = await row.boundingBox(), d = await page.locator('#f-dest').boundingBox();
  expect(Math.round(r.height)).toBe(44); expect(Math.round(r.y - (d.y + d.height))).toBe(0); expect(Math.round(r.x)).toBe(Math.round(d.x)); expect(Math.round(r.width)).toBe(Math.round(d.width));
  expect(await page.locator('#color-name').textContent()).toBe('カテゴリの色（プライベート）'); // 既定
  const ps = colorSet('#8a4b6b');
  expect(await varOf(page, '#color-sw', '--cat-tint')).toBe(ps.tint);
  expect(await page.locator('#color-sw').evaluate((e) => { const b = e.getBoundingClientRect(), l = getComputedStyle(e, '::before'); return [b.width, b.height, getComputedStyle(e).borderRadius, l.width]; })).toEqual([28, 20, '4px', '3px']);
  await row.click(); await expect(page.locator('#color-pop')).toBeVisible();
  const opts = page.locator('#color-pop .dopt');
  expect(await opts.evaluateAll((l) => l.map((e) => e.querySelector('.dn').firstChild.textContent))).toEqual(['カテゴリの色', ...FLICK.map((f) => f.name)]);
  expect(await opts.evaluateAll((l) => l.map((e) => [Math.round(e.getBoundingClientRect().height), e.getAttribute('aria-selected')]))).toEqual([[44, 'true'], ...FLICK.map(() => [44, 'false'])]);
  expect(await page.locator('#color-pop .csw').first().evaluate((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; })).toEqual([32, 24]);
  expect(await page.locator('#color-pop h4').evaluateAll((l) => l.map((e) => [e.textContent, Math.round(e.getBoundingClientRect().height), getComputedStyle(e).fontSize]))).toEqual([['カテゴリ', 26, '12px'], ['くすみ色（Duo フリックと同じ 7 色）', 26, '12px']]);
  expect(await page.locator('#color-pop').evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true); // 閉じた縦でもスクロールなしで入る
  expect(await page.locator('#color-pop .cnote').count()).toBe(0); // iPhone の予定のときだけ出す注意
  expect(await opts.nth(1).getAttribute('aria-label')).toBe('色 くすみピンク');
  await opts.nth(1).click(); await expect(page.locator('#color-pop')).toBeHidden(); // たたくとすぐ選ばれて戻る
  expect(await page.locator('#color-name').textContent()).toBe('くすみピンク'); expect(await varOf(page, '#color-sw', '--cat-tint')).toBe('#E8D9D8');
  expect((await dbEvs(page))[0].colorId).toBeUndefined(); // 保存はシートの「保存」で
  await save(page); await expect(page.locator('#editor')).toBeHidden();
  expect((await dbEvs(page))[0].colorId).toBe('kusumiPink');
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event="e1"]`, '--cat-mark')).toBe('#9E645F');
  // カテゴリを変えても、選んだ色はそのまま
  await openCard(page, '歯医者'); await page.locator('#f-dest').click(); await page.locator(`#dest-pop .dopt[data-did="${W}"]`).click(); await expect(page.locator('#dest-pop')).toBeHidden();
  expect(await page.locator('#color-name').textContent()).toBe('くすみピンク');
  // 「カテゴリの色」に戻す
  await page.locator('#f-color').click(); expect(await page.locator('#color-pop .dopt[aria-selected="true"] .dn').textContent()).toBe('くすみピンク');
  await page.locator('#color-pop .dopt').first().click(); await expect(page.locator('#color-pop')).toBeHidden();
  expect(await page.locator('#color-name').textContent()).toBe('カテゴリの色（仕事）');
  await save(page); await expect(page.locator('#editor')).toBeHidden();
  const e = (await dbEvs(page))[0]; expect('colorId' in e).toBe(false); expect(e.categoryId).toBe(W);
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event="e1"]`, '--cat-mark')).toBe('#526B90');
});

test('P-2 長押しメニューの「色」: 2 番目に「色」→ 色の帯（336×78・見本 8 つ）→ たたくとすぐ変わり「元に戻す」（6 秒）で戻る', async ({ page }) => {
  await boot(page, { size: SIZES.openLandscape951, events: [ev('e1', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: P })] });
  const chip = page.locator('.week .strip[data-event="e1"]'), b = await chip.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  const menu = page.locator('.cmenu[data-cmenu]'); await expect(menu).toBeVisible();
  expect(await menu.locator('button').allTextContents()).toEqual(['コピー', '色', '編集', '削除']);
  await menu.locator('[data-cm="color"]').click();
  const strip = page.locator('.colorstrip'); await expect(strip).toBeVisible();
  const sb = await strip.boundingBox(); expect([Math.round(sb.width), Math.round(sb.height)]).toEqual([336, 78]); expect(sb.x).toBeGreaterThanOrEqual(8); expect(sb.x + sb.width).toBeLessThanOrEqual(951 - 8);
  expect(await strip.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('14px');
  const sws = strip.locator('.cso');
  expect(await sws.evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')))).toEqual(['カテゴリの色に戻す、選択中', ...FLICK.map((f) => f.name)]);
  expect(await sws.evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(), s = e.querySelector('.csw').getBoundingClientRect(); return [r.width, r.height, s.width, s.height]; }))).toEqual(Array(8).fill([40, 44, 32, 24]));
  expect(await strip.locator('.csn').textContent()).toBe('カテゴリの色');
  await strip.locator('[data-cs="kusumiPink"]').click(); await expect(strip).toBeHidden();
  await expect.poll(async () => (await dbEvs(page))[0].colorId).toBe('kusumiPink');
  expect(await varOf(page, '.week .strip[data-event="e1"]', '--cat-tint')).toBe('#E8D9D8');
  await expect(toast(page)).toContainText('色を変えました'); await expect(page.locator('#status')).toHaveText('色を変えました。');
  await toast(page).getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => 'colorId' in (await dbEvs(page))[0]).toBe(false);
  expect(await varOf(page, '.week .strip[data-event="e1"]', '--cat-tint')).toBe(colorSet('#8a4b6b').tint);
  // もう一度開くと、選んでいる見本に輪と「選択中」
  await page.evaluate(() => document.querySelector('#native-toast')?.remove());
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.locator('.cmenu [data-cm="color"]').click(); await page.locator('.colorstrip [data-cs="sage"]').click(); await expect.poll(async () => (await dbEvs(page))[0].colorId).toBe('sage');
  await page.evaluate(() => document.querySelector('#native-toast')?.remove());
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.locator('.cmenu [data-cm="color"]').click();
  expect(await page.locator('.colorstrip .cso[aria-pressed="true"]').getAttribute('aria-label')).toBe('セージ、選択中'); expect(await page.locator('.colorstrip .csn').textContent()).toBe('セージ');
  expect(await page.locator('.colorstrip .cso[aria-pressed="true"] .csw').evaluate((e) => getComputedStyle(e).boxShadow)).toMatch(/2px.*4px/);
  await page.keyboard.press('Escape'); await expect(page.locator('.colorstrip')).toBeHidden();
});

test('P-2 閉じた 7 段の月では長押しは「別の日へ動かす」のまま（色のメニューは出ない）。色はたたいてシートの「色」の行から', async ({ page }) => {
  await boot(page, { events: [ev('e1', '歯医者', '2026-11-12T15:00', '2026-11-12T16:00', { categoryId: P })] });
  const b = await page.locator(`${cell('2026-11-12')} .chip[data-event="e1"]`).boundingBox();
  await page.mouse.move(b.x + 20, b.y + 7); await page.mouse.down(); await page.waitForTimeout(800);
  expect(await page.locator('.cmenu').count()).toBe(0);
  await page.mouse.up(); await page.waitForTimeout(300);
  expect(await page.locator('.cmenu').count()).toBe(0);
});

test('P-3 繰り返しの予定で「この予定のみ」を選んで色を変える: 色は全部の回に付く。colorId は系列の本体だけ・overrides には入らない', async ({ page }) => {
  await boot(page, { sel: '2026-11-17', events: [ev('s', '定例', '2026-11-03T10:00', '2026-11-03T11:00', { categoryId: W, recurrence: { freq: 'weekly', interval: 1, byDay: [2], count: null, until: null } })] });
  await openCard(page, '定例');
  await page.locator('#f-color').click(); await page.locator('#color-pop .dopt', { hasText: 'テラコッタ' }).click();
  await page.locator('#f-title').fill('定例（この回だけ改題）');
  await save(page);
  await expect(page.locator('#scope')).toBeVisible().catch(() => {});
  await page.locator('[data-scope="only"]').click(); await expect(page.locator('#editor')).toBeHidden();
  const [p] = await dbEvs(page);
  expect(p.colorId).toBe('terracotta'); expect(Object.keys(p.overrides)).toEqual(['2026-11-17T10:00']);
  expect(p.overrides['2026-11-17T10:00'].title).toBe('定例（この回だけ改題）'); expect('colorId' in p.overrides['2026-11-17T10:00']).toBe(false); expect(p.title).toBe('定例');
  // 全部の回（11/3・10・17・24、前後の月も）が同じ色
  const marksAll = await page.locator('.mgrid .chip[data-event^="s@"]').evaluateAll((l) => l.map((e) => getComputedStyle(e).getPropertyValue('--cat-mark').trim()));
  expect(marksAll.length).toBeGreaterThanOrEqual(5); expect([...new Set(marksAll)]).toEqual(['#A56148']);
  // バックアップの overrides に colorId が出ない
  const bk = await page.evaluate(async () => { const db = await import('/js/db.js'), b = await import('/js/backup.js'); return b.buildBackup(await db.listEvents(), {}, new Date(), await db.listCategories()); });
  expect(bk.events[0].colorId).toBe('terracotta'); expect(JSON.stringify(bk.events[0].overrides)).not.toContain('colorId');
  // 別の回を開くと、色の行は同じ色。「カテゴリの色」に戻して「この予定のみ」でも、全部の回が戻る
  await page.locator(cell('2026-11-24')).click({ position: { x: 12, y: 10 } }); await page.waitForTimeout(300);
  await openCard(page, '定例'); expect(await page.locator('#color-name').textContent()).toBe('テラコッタ');
  await page.locator('#f-color').click(); await page.locator('#color-pop .dopt').first().click();
  await save(page); await page.locator('[data-scope="only"]').click(); await expect(page.locator('#editor')).toBeHidden();
  const [p2] = await dbEvs(page); expect('colorId' in p2).toBe(false); expect(JSON.stringify(p2.overrides)).not.toContain('colorId');
  expect([...new Set(await page.locator('.mgrid .chip[data-event^="s@"]').evaluateAll((l) => l.map((e) => getComputedStyle(e).getPropertyValue('--cat-mark').trim())))]).toEqual(['#526B90']);
});

test('P-3・15b・16 色の情報がない今までのデータはカテゴリの色。知らない colorId・overrides の colorId は表示に使わず、値は残る', async ({ page }) => {
  const k = '2026-11-10T10:00';
  await boot(page, { events: [ev('old', '昔の予定', '2026-11-12T10:00', '2026-11-12T11:00', { categoryId: F }), ev('unk', '知らない色', '2026-11-12T12:00', '2026-11-12T13:00', { categoryId: P, colorId: 'xxx' }),
    ev('s', '定例', '2026-11-03T10:00', '2026-11-03T11:00', { categoryId: W, recurrence: { freq: 'weekly', interval: 1, byDay: [2], count: null, until: null }, overrides: { [k]: { title: '定例', categoryId: W, all: false, start: k, end: '2026-11-10T11:00', place: '', notes: '', colorId: 'sage' } } })] });
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event="old"]`, '--cat-mark')).toBe(colorSet('#2e6b5a').mark);
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event="unk"]`, '--cat-mark')).toBe(colorSet('#8a4b6b').mark);
  expect(await varOf(page, `${cell('2026-11-10')} .chip[data-event^="s@"]`, '--cat-mark')).toBe('#526B90'); // overrides の sage は読まない
  await openCard(page, '知らない色'); expect(await page.locator('#color-name').textContent()).toBe('カテゴリの色（プライベート）');
  await page.locator('#f-title').fill('知らない色（改題）'); await save(page); await expect(page.locator('#editor')).toBeHidden();
  const by = Object.fromEntries((await dbEvs(page)).map((e) => [e.id, e]));
  expect(by.unk.colorId).toBe('xxx'); expect(by.unk.title).toBe('知らない色（改題）'); expect(by.s.overrides[k].colorId).toBe('sage'); expect('colorId' in by.old).toBe(false);
});

test('P-7・P-10・15 バックアップの読み込み（置き換え）: colorId と eventColors が戻る。41 字の colorId・不正な eventColors はその 1 件だけ捨てる。IndexedDB の版は 6', async ({ page }) => {
  await boot(page, { events: [ev('keep', '消える', '2026-11-12T10:00', '2026-11-12T11:00')] });
  await page.evaluate(async () => (await import('/js/db.js')).putEventColors([{ key: 'OLD', colorId: 'sage', calId: '', title: '', lastStart: '', seenAt: 1 }]));
  const cats = await dbCats(page);
  const file = { app: 'duo-calendar', version: 6, exportedAt: '2026-11-13T00:00:00Z', categories: cats, events: [ev('a', '色つき', '2026-11-12T10:00', '2026-11-12T11:00', { colorId: 'greige' }), ev('b', '長すぎる色', '2026-11-12T12:00', '2026-11-12T13:00', { colorId: 'a'.repeat(41) }), ev('c', '数の色', '2026-11-12T14:00', '2026-11-12T15:00', { colorId: 5 })],
    eventColors: [{ key: 'ex-1', colorId: 'kusumiBlue', calId: 'cal-1', title: '歯医者', lastStart: '2026-11-12T15:00' }, { key: 'bad', colorId: 'a'.repeat(41) }, { key: 'ex-1', colorId: 'sage' }, 7] };
  await clickSettings(page); await page.locator('[data-m="backup"]').click(); await expect(page.locator('#backup')).toBeVisible();
  await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.locator('#bk-replace').click(); await page.locator('#bk-rdo').click(); await expect(page.locator('#backup')).toBeHidden();
  const by = Object.fromEntries((await dbEvs(page)).map((e) => [e.id, e]));
  expect(Object.keys(by).sort()).toEqual(['a', 'b', 'c']); expect(by.a.colorId).toBe('greige'); expect('colorId' in by.b).toBe(false); expect('colorId' in by.c).toBe(false); expect(by.b.title).toBe('長すぎる色');
  expect((await dbColors(page)).map((r) => [r.key, r.colorId])).toEqual([['ex-1', 'kusumiBlue']]); // 置き換え: 表も置き換え（OLD は消える）
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event="a"]`, '--cat-mark')).toBe('#80715F'); expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event="b"]`, '--cat-mark')).toBe('#526B90');
  expect(await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('duo-calendar'); r.onsuccess = () => { res(r.result.version); r.result.close(); }; }))).toBe(6);
});

// ---------- iPhone の予定の色（偽装）
test('P-5・13 iPhone の予定の色: 詳細の「色」の行から付ける。キーは externalId（空なら itemId）。繰り返しの全部の回が同じ色。読み込み直しても残る。EventKit には書かない', async ({ page }) => {
  await boot(page, { before: (p) => mockNative(p) });
  await enableCalendars(page); await expect(page.locator(`${cell('2026-11-12')} .chip[data-event^="ip:e1"]`)).toBeVisible();
  // 繰り返し（w1。11/10 と 11/17 の 2 回）: 11/10 の回に付けると 11/17 も同じ色
  await page.locator(cell('2026-11-10')).click({ position: { x: 12, y: 10 } }); await page.waitForTimeout(300);
  await page.locator('.mday .mdcard[data-event^="ip:w1"]').click(); await expect(page.locator('#xdetail')).toBeVisible();
  const row = page.locator('#xd-color'); await expect(row).toBeVisible();
  expect(Math.round((await row.boundingBox()).height)).toBe(44); expect(await row.locator('.cnm').textContent()).toBe('カレンダーの色（個人）');
  await row.click(); await page.locator('.colorstrip [data-cs="lavenderGray"]').click();
  await expect.poll(async () => (await dbColors(page)).map((r) => [r.key, r.colorId, r.calId, r.title])).toEqual([['ex-w', 'lavenderGray', 'cal-1', '定例']]);
  await expect(row.locator('.cnm')).toHaveText('ラベンダーグレー');
  expect(rgbHex(await page.locator('#xd-body .xdcal .cdot').evaluate((e) => getComputedStyle(e).backgroundColor))).toBe('#7A6D99');
  await page.locator('#xd-close').click(); await expect(page.locator('#xdetail')).toBeHidden();
  for (const k of ['2026-11-10', '2026-11-17']) expect(await varOf(page, `${cell(k)} .chip[data-event^="ip:w1"]`, '--cat-mark')).toBe('#7A6D99');
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event^="ip:e1"]`, '--cat-mark')).toBe(colorSet('#d93025').mark); // ほかの予定はカレンダーの色のまま
  // externalId が空の予定（ローカル）は itemId がキー。長押しではなく詳細から
  await page.locator(cell('2026-11-13')).click({ position: { x: 12, y: 10 } }); await page.waitForTimeout(300);
  await page.locator('.mday .mdcard[data-event^="ip:l1"]').click(); await page.locator('#xd-color').click(); await page.locator('.colorstrip [data-cs="milkTea"]').click();
  await expect.poll(async () => (await dbColors(page)).map((r) => r.key).sort()).toEqual(['ex-w', 'it-l']);
  await page.locator('#xd-close').click();
  // 読み込み直しても残る（meta の 1 件）。iPhone 側で題名・時刻を変えても、externalId が同じなら付いたまま
  await mockNext(page, { patch: [{ start: '2026-11-17T09:00', set: { title: '定例（改題）', start: '2026-11-17T13:00', end: '2026-11-17T14:00', id: 'w1@2026-11-17T13:00' } }] });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(700);
  for (const k of ['2026-11-10', '2026-11-17']) expect(await varOf(page, `${cell(k)} .chip[data-event^="ip:w1"]`, '--cat-mark')).toBe('#7A6D99');
  expect(await varOf(page, `${cell('2026-11-13')} .chip[data-event^="ip:l1"]`, '--cat-mark')).toBe('#8A6E53');
  // 「カレンダーの色」に戻すと表から消える
  await page.locator(cell('2026-11-13')).click({ position: { x: 12, y: 10 } }); await page.waitForTimeout(300);
  await page.locator('.mday .mdcard[data-event^="ip:l1"]').click(); await page.locator('#xd-color').click();
  expect(await page.locator('.colorstrip .cso').first().getAttribute('aria-label')).toBe('カレンダーの色に戻す');
  await page.locator('.colorstrip .cso').first().click();
  await expect.poll(async () => (await dbColors(page)).map((r) => r.key)).toEqual(['ex-w']);
  const methods = await page.evaluate(() => [...new Set(window.__mock.calls.map((c) => c.method))]);
  expect(methods.filter((m) => /update|delete|create/i.test(m))).toEqual([]);
});

test('P-8 「消えた」の判断: 読み込みの失敗・カレンダーをオフ では missingSince が入らない。読めて見つからないときだけ入り、また見つかれば消える', async ({ page }) => {
  await boot(page, { before: (p) => mockNative(p) });
  await enableCalendars(page); await expect(page.locator(`${cell('2026-11-12')} .chip[data-event^="ip:e1"]`)).toBeVisible();
  const seedRows = [{ key: 'ex-1', colorId: 'sage', calId: 'cal-1', title: '歯医者', lastStart: '2026-11-12T15:00', seenAt: 1 }, { key: 'gone', colorId: 'greige', calId: 'cal-1', title: '消した予定', lastStart: '2026-11-13T10:00', seenAt: 1 },
    { key: 'off', colorId: 'greige', calId: 'cal-9', title: 'オフのカレンダー', lastStart: '2026-11-13T10:00', seenAt: 1 }, { key: 'far', colorId: 'greige', calId: 'cal-1', title: '範囲の外', lastStart: '2031-01-01T10:00', seenAt: 1 }];
  const reload = async (fail) => { await page.evaluate(async (rows) => { if (rows) await (await import('/js/db.js')).putEventColors(rows); }, null); await mockNext(page, { listFail: fail }); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(900); };
  await page.evaluate(async (rows) => (await import('/js/db.js')).putEventColors(rows), seedRows);
  // ① 読み込みの失敗: 何も変えない
  await reload(true);
  expect((await dbColors(page)).filter((r) => r.missingSince != null)).toEqual([]);
  // 読めた: 見つからない 'gone' だけ missingSince。オフのカレンダー（cal-9）・範囲の外は判断しない。見つかった ex-1 は色が出る
  await reload(false);
  const by = Object.fromEntries((await dbColors(page)).map((r) => [r.key, r]));
  expect(Object.keys(by).sort()).toEqual(['ex-1', 'far', 'gone', 'off']);
  expect(typeof by.gone.missingSince).toBe('number'); expect(by['ex-1'].missingSince).toBeUndefined(); expect(by.off.missingSince).toBeUndefined(); expect(by.far.missingSince).toBeUndefined();
  expect(await varOf(page, `${cell('2026-11-12')} .chip[data-event^="ip:e1"]`, '--cat-mark')).toBe('#65785B');
  // 30 日より前に見つからなくなっていた行は、読めたときに消える。29 日なら残る
  const now = await page.evaluate(() => Date.now()); // 試験の中の時計（2026-11-12 に止めてある）
  await page.evaluate(async ([rows, now]) => (await import('/js/db.js')).putEventColors([...rows, { key: 'old', colorId: 'sage', calId: 'cal-1', title: '', lastStart: '2026-11-13T10:00', seenAt: 1, missingSince: now - 31 * 864e5 }, { key: 'young', colorId: 'sage', calId: 'cal-1', title: '', lastStart: '2026-11-13T10:00', seenAt: 1, missingSince: now - 29 * 864e5 }]), [seedRows, now]);
  await reload(false);
  expect((await dbColors(page)).map((r) => r.key).sort()).toEqual(['ex-1', 'far', 'gone', 'off', 'young']);
});

test('P-9 iPhone にも保存した Duo の予定: 色は colorId に持ち、保存で得た externalId で色の表にも同じ色が入る（別の端末では iPhone の予定として同じ色）。戻すと表からも外れる', async ({ page }) => {
  await boot(page, { before: (p) => mockNative(p) });
  await enableCalendars(page); await expect(page.locator(`${cell('2026-11-12')} .chip[data-event^="ip:e1"]`)).toBeVisible();
  await page.locator('[data-act="add"]:visible').first().click(); await expect(page.locator('#editor')).toBeVisible();
  await page.locator('#f-title').fill('会食');
  await page.locator('#f-dest').click(); await page.locator('#dest-pop .dopt[data-dtype="iphone"][data-did="cal-1"]').click(); await expect(page.locator('#dest-pop')).toBeHidden();
  expect(await page.locator('#color-name').textContent()).toBe('カレンダーの色（個人（Google））');
  await page.locator('#f-color').click(); await page.locator('#color-pop .dopt', { hasText: 'くすみブルー' }).click();
  await save(page); await expect(page.locator('#editor')).toBeHidden();
  await expect.poll(async () => (await dbEvs(page)).find((e) => e.title === '会食')?.nativeLink?.state, { timeout: 8000 }).toBe('linked');
  const e = (await dbEvs(page)).find((x) => x.title === '会食');
  expect(e.colorId).toBe('kusumiBlue'); expect(e.nativeLink.externalId).toBe('ext-new-1');
  await expect.poll(async () => (await dbColors(page)).map((r) => [r.key, r.colorId, r.calId])).toEqual([['ext-new-1', 'kusumiBlue', 'cal-1']]);
  expect(await page.evaluate(() => JSON.stringify(window.__mock.calls.filter((c) => c.method === 'createEvent').map((c) => c.opts)))).not.toMatch(/kusumiBlue|color/i); // EventKit へ色は渡さない
  // 「カレンダーの色」に戻すと、表からも外れる
  await page.locator('.mday .mdcard', { hasText: '会食' }).click(); await expect(page.locator('#editor')).toBeVisible();
  await page.locator('#f-color').click(); await page.locator('#color-pop .dopt').first().click(); await save(page); await expect(page.locator('#editor')).toBeHidden();
  await expect.poll(async () => dbColors(page)).toEqual([]);
  expect('colorId' in (await dbEvs(page)).find((x) => x.title === '会食')).toBe(false);
});
