// 第19.4版 段1（design/36・37）: js/colors.js の純粋関数。値は設計の計算（colors36-lib.mjs・colors37-lib.mjs）が出した
// fixtures/colors36-37.json と 1 色ずつ突き合わせる（scripts/gen-colors-fixture.mjs が書き出す。手で書いた値は使わない）。
// コントラスト比はここでも自分で計算する（WCAG 2.x）。qa/verify-muted-colors.md の C-2・C-3・C-4・C-5・C-6・C-7（値の側）・D-1（変換が元の値を変えない）・P-1・P-10。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LEFT_PAGE, BG, INK, OUT_TEXT, OUT_LINE_ALPHA, OUT_TINT_ALPHA, WEEKEND, FLICK, COLOR_ID_MAX, colorSet, flickSet, eventSet, setVars, isFlickId, flickName, validColorId, contrast, mixHex, toOklch } from '../js/colors.js';
import { PALETTE, DEFAULTS_NEW, LEGACY, UNCATEGORIZED } from '../js/categories.js';

const FX = JSON.parse(readFileSync(new URL('./fixtures/colors36-37.json', import.meta.url), 'utf8'));
const MODES = ['light', 'dark'];
const ROLES = ['fill', 'tint', 'line', 'mark'];
// 自分で計算する比（js/colors.js の contrast とは別に書く。式の写し間違いを見つけるため）
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const grounds = (m) => [BG[m].paper, BG[m].capsule, BG[m].card];
const ALL_SRC = [...FX.palette.map((p) => p.hex), ...FX.auto.map((a) => a.hex)];

test('段1: 自分で書いた比と colors.js の contrast が同じ', () => {
  for (const [a, b] of [['#293B35', '#F7F4ED'], ['#5D6963', '#EFECE4'], ['#FFFFFF', '#000000'], ['#526B90', '#EEF1F4']]) assert.ok(Math.abs(cr(a, b) - contrast(a, b)) < 1e-12);
  assert.equal(Math.floor(cr('#293B35', '#F7F4ED') * 100) / 100, 10.79); // 36 §15.6 の表J
  assert.equal(Math.floor(cr('#5D6963', '#EFECE4') * 100) / 100, 4.85);
});

test('段1: パレット 12 色の 塗り・薄い地・線・左の線 が設計の計算と 1 つ残らず同じ（ライト・ダーク）', () => {
  assert.equal(FX.palette.length, 12);
  assert.deepEqual(FX.palette.map((p) => p.hex.toLowerCase()), PALETTE.map((p) => p.light)); // categories.js の 12 色と同じ並び
  for (const p of FX.palette) for (const m of MODES) { const s = colorSet(p.hex, m); for (const r of ROLES) assert.equal(s[r], p[m][r], `${p.name} ${m} ${r}`); }
});

test('段1: 既定 5 色は 36 §0 の表の値（微調整した値）', () => {
  const want = [['#2f5f8a', '#D4DDEB', '#526B90', '#C3E5FC'], ['#8a4b6b', '#E7D7E1', '#643B57', '#D7B3CA'], ['#2e6b5a', '#D1E1D8', '#4C725F', '#CAE8D8'], ['#87500f', '#E7DACE', '#734A22', '#EBC8A9'], ['#5a5e62', '#E0DCD5', '#423C34', '#BDB6AC']];
  assert.deepEqual(DEFAULTS_NEW.map((c) => c.color), want.map((w) => w[0]));
  for (const [hex, tint, line, fill] of want) { const s = colorSet(hex, 'light'); assert.deepEqual([s.tint, s.line, s.fill, s.mark], [tint, line, fill, line]); }
  assert.deepEqual(['#2f5f8a', '#8a4b6b', '#2e6b5a', '#87500f', '#5a5e62'].map((h) => colorSet(h, 'dark').line), ['#ABD0E9', '#BD97B0', '#A6C6B6', '#C19D7C', '#A29E98']); // 36 §5
  assert.equal(colorSet('#2F5F8A').line, '#526B90'); // 大文字でも同じ
});

test('段1: 式で作る色（未分類・古い 4 色・iPhone の標準 7 色・試験のモック・1枚目の色・端の色）も設計の計算と同じ', () => {
  assert.ok(FX.auto.length >= 20);
  for (const a of FX.auto) for (const m of MODES) { const s = colorSet(a.hex, m); for (const r of ROLES) assert.equal(s[r], a[m][r], `${a.name} ${a.hex} ${m} ${r}`); }
  for (const l of Object.values(LEGACY)) assert.ok(FX.auto.some((a) => a.hex.toLowerCase() === l.color), `古い色 ${l.color} が表にある`);
  assert.ok(FX.auto.some((a) => a.hex.toLowerCase() === UNCATEGORIZED.color));
});

test('段1: 左の線 mark は 36 §15.2 の表の値（水色は濃い青と離れる。既定の 12 色は線と同じ）', () => {
  const want = { '#1264A0': '#3E6E98', '#34AADC': '#4084A5', '#B93B18': '#975A4A', '#FF2968': '#AB6972', '#9AA615': '#7A8144', '#FF9500': '#A27246', '#FFCC00': '#8F7A3C', '#63DA38': '#608655', '#1BADF8': '#4882A8', '#CC73E1': '#946D9D', '#A2845E': '#8E785D', '#68716A': '#69706B' };
  for (const [hex, mark] of Object.entries(want)) assert.equal(colorSet(hex, 'light').mark, mark, hex);
  for (const p of PALETTE) assert.equal(colorSet(p.light, 'light').mark, colorSet(p.light, 'light').line);
  for (const h of ALL_SRC) assert.equal(colorSet(h, 'dark').mark, colorSet(h, 'dark').line); // ダークは線と同じ
});

test('C-2: 文字（墨）はどの薄い地・塗りの上でも 4.5 以上。色の文字（線の色）は紙・カプセル・白の上で 4.5 以上（ライト・ダーク）', () => {
  let min = 99;
  for (const m of MODES) for (const h of ALL_SRC) {
    const s = colorSet(h, m);
    for (const g of [s.tint, s.fill]) { const v = cr(INK[m], g); min = Math.min(min, v); assert.ok(v >= 4.5, `${h} ${m} 墨×${g} ${v}`); }
    for (const g of grounds(m)) assert.ok(cr(s.text, g) >= 4.5, `${h} ${m} 色の文字×${g} ${cr(s.text, g)}`);
    assert.equal(s.ink, INK[m]);
  }
  assert.ok(min >= 5.5, `最小 ${min}`); // 36 §13 #2: ふつうの日の最小は 5.90（ライト・灰の札）と 5.50（ダーク・緑の札）
});

test('C-3: 線と左の線は 紙・カプセル・白（カード）・自分の薄い地 のどれに対しても 3 以上。札の縁（左の線の色）は塗りの上でも 3 以上', () => {
  for (const m of MODES) for (const h of ALL_SRC) {
    const s = colorSet(h, m);
    for (const k of ['line', 'mark']) for (const g of [...grounds(m), s.tint]) assert.ok(cr(s[k], g) >= 3, `${h} ${m} ${k} ${s[k]}×${g} ${cr(s[k], g)}`);
    assert.ok(cr(s.edge, s.fill) >= 3, `${h} ${m} 縁×塗り ${cr(s.edge, s.fill)}`); for (const g of grounds(m)) assert.ok(cr(s.edge, g) >= 3, `${h} ${m} 縁×${g}`);
  }
});

test('C-4: 前後の月。文字 #5D6963／#A3A29E はどの地・どのチップの地の上でも 4.8 以上、地は薄い地の 30%、線は線の 79%（ダーク 62%）で 3 以上', () => {
  assert.deepEqual(OUT_TEXT, { light: '#5D6963', dark: '#A3A29E' });
  for (const m of MODES) {
    assert.equal(OUT_TEXT[m], FX.out[m].text); assert.equal(OUT_LINE_ALPHA[m], FX.out[m].lineAlpha); assert.equal(OUT_TINT_ALPHA, FX.out[m].tintAlpha);
    assert.equal(OUT_TEXT[m], mixHex(INK[m], BG[m].paper, FX.out[m].textAlpha)); // 本文色を紙に 75%（ダーク 66%）
    const src13 = [...PALETTE.map((p) => p.light), UNCATEGORIZED.color];
    src13.forEach((h, i) => { const s = colorSet(h, m); assert.equal(s.tintOut, FX.out[m].tints[i], `${h} ${m} tintOut`); assert.equal(s.lineOut, FX.out[m].lines[i], `${h} ${m} lineOut`); });
    for (const g of [BG[m].paper, BG[m].capsule, BG[m].sat, BG[m].card]) assert.ok(cr(OUT_TEXT[m], g) >= 4.8, `${m} 文字×${g} ${cr(OUT_TEXT[m], g)}`);
    for (const h of src13) { const s = colorSet(h, m); assert.ok(cr(OUT_TEXT[m], s.tintOut) >= 4.8, `${h} ${m} 文字×チップの地`); assert.ok(cr(s.lineOut, BG[m].paper) >= 3 && cr(s.lineOut, s.tintOut) >= 3, `${h} ${m} 線`); assert.equal(s.outText, OUT_TEXT[m]); }
    // 式で作る色（iPhone の色など）でも 文字 4.8・線 3 を割らない
    for (const h of ALL_SRC) { const s = colorSet(h, m); assert.ok(cr(OUT_TEXT[m], s.tintOut) >= 4.8, `${h} ${m} 文字×チップの地 ${cr(OUT_TEXT[m], s.tintOut)}`); assert.ok(cr(s.lineOut, BG[m].paper) >= 3 && cr(s.lineOut, s.tintOut) >= 3, `${h} ${m} 前後の月の線 ${cr(s.lineOut, BG[m].paper)}`); }
  }
});

test('C-5・C-6: +N は前後の月の文字と同じ色。土日は案 A（土＝青の線、日・祝＝赤、土の列の地は残す）で、どの地の上でも 4.5 以上', () => {
  assert.equal(FX.moreN, OUT_TEXT.light);
  assert.deepEqual([WEEKEND.light.sat, WEEKEND.light.sun, WEEKEND.light.hol, WEEKEND.light.satCol], [FX.weekendA.sat, FX.weekendA.sun, FX.weekendA.hol, FX.weekendA.satCol]);
  assert.equal(WEEKEND.light.sat, colorSet('#2f5f8a', 'light').line); assert.equal(WEEKEND.light.satCol, FX.satCol.light); assert.equal(WEEKEND.dark.satCol, FX.satCol.dark);
  assert.equal(BG.light.sat, WEEKEND.light.satCol);
  for (const m of MODES) {
    for (const g of [BG[m].paper, BG[m].capsule, BG[m].sat, BG[m].card]) assert.ok(cr(WEEKEND[m].sat, g) >= 4.5, `${m} 土×${g} ${cr(WEEKEND[m].sat, g)}`);
    for (const g of [BG[m].paper, BG[m].capsule, BG[m].sat, BG[m].card]) assert.ok(cr(WEEKEND[m].hol, g) >= 4.5, `${m} 祝×${g} ${cr(WEEKEND[m].hol, g)}`);
    assert.ok(cr(WEEKEND[m].sun, BG[m].paper) >= 4.5);
  }
});

test('C-7: 色相は元のまま（iPhone の標準 7 色でずれ 1.1° 以内。36 §6.2）。既定 5 色の手直しは 10° まで', () => {
  const dh = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  for (const h of ['#FF2968', '#FF9500', '#FFCC00', '#63DA38', '#1BADF8', '#CC73E1', '#A2845E']) {
    const s = colorSet(h, 'light'), H0 = toOklch(h)[2];
    for (const r of ['fill', 'line', 'mark']) assert.ok(dh(toOklch(s[r])[2], H0) <= 1.15, `${h} ${r} ${dh(toOklch(s[r])[2], H0)}`);
  }
  for (const h of ['#2f5f8a', '#8a4b6b', '#2e6b5a', '#87500f']) assert.ok(dh(toOklch(colorSet(h, 'light').line)[2], toOklch(h)[2]) <= 11.5, h);
});

test('D-1: 変換は元の値を変えない・形の正しくない色は未分類の色として出す・同じ色は同じ組（使い回し）', () => {
  const src = '#2f5f8a'; colorSet(src); assert.equal(src, '#2f5f8a');
  assert.equal(colorSet('#68716a'), colorSet('#68716A'));
  for (const bad of ['', null, undefined, 'red', '#12345', '#1234567', '#ggg000', 12]) assert.deepEqual(colorSet(bad), colorSet('#68716A'));
  assert.throws(() => { colorSet(src).tint = '#000000'; }, TypeError); // 組は凍らせてある
});

test('P-1・37: フリックの 7 色は ThemeCatalog の値のまま（設計の表と同じ。直しなし）。7 色とも基準を満たす', () => {
  assert.deepEqual(FLICK.map((f) => f.id), ['kusumiPink', 'sage', 'kusumiBlue', 'lavenderGray', 'greige', 'terracotta', 'milkTea']);
  assert.deepEqual(FLICK.map((f) => f.name), ['くすみピンク', 'セージ', 'くすみブルー', 'ラベンダーグレー', 'グレージュ', 'テラコッタ', 'ミルクティー']);
  assert.deepEqual(FX.flick.map((f) => f.id), FLICK.map((f) => f.id));
  for (const f of FX.flick) for (const m of MODES) {
    const s = flickSet(f.id, m);
    assert.equal(f[m].dL, 0); assert.equal(s.tint, f[m].tint); assert.equal(s.line, f[m].line); assert.equal(s.mark, s.line); assert.equal(s.fill, s.tint); assert.equal(s.edge, s.line);
    assert.ok(cr(INK[m], s.tint) >= 4.5, `${f.id} ${m} 墨×薄い地`);
    for (const g of [...grounds(m), s.tint, s.fill]) assert.ok(cr(s.line, g) >= 3, `${f.id} ${m} 線×${g} ${cr(s.line, g)}`);
    assert.ok(cr(OUT_TEXT[m], s.tintOut) >= 4.8, `${f.id} ${m} 前後の月の文字`);
    assert.ok(cr(s.lineOut, BG[m].paper) >= 3 && cr(s.lineOut, s.tintOut) >= 3, `${f.id} ${m} 前後の月の線 ${cr(s.lineOut, BG[m].paper)}`);
  }
  assert.equal(flickSet('kusumiPink', 'light').tint, '#E8D9D8'); assert.equal(flickSet('kusumiPink', 'light').line, '#9E645F');
  assert.equal(flickSet('milkTea', 'dark').tint, '#342C25'); assert.equal(flickSet('milkTea', 'dark').line, '#C2A688');
  assert.equal(flickSet('standard'), null); assert.equal(flickName('sage'), 'セージ'); assert.equal(flickName('x'), '');
});

test('P-1・P-10: 予定の色の組。7 色の ID ならその組（36 の式を通さない）、知らない ID・なし はカテゴリの色。colorId は 40 字まで', () => {
  const base = '#8a4b6b';
  for (const m of MODES) {
    const e = eventSet('kusumiPink', base, m);
    assert.equal(e.tint, flickSet('kusumiPink', m).tint); assert.equal(e.line, flickSet('kusumiPink', m).line);
    assert.equal(e.text, colorSet(base, m).line); // 色の文字は 4.5 の線の色（フリックの線は文字に使わない）
    for (const g of grounds(m)) assert.ok(cr(e.text, g) >= 4.5);
    for (const id of [null, undefined, '', 'xxx', 'standard', 'KusumiPink', 5, {}, 'a'.repeat(41)]) assert.equal(eventSet(id, base, m), colorSet(base, m));
  }
  assert.equal(COLOR_ID_MAX, 40);
  assert.equal(validColorId('kusumiPink'), true); assert.equal(validColorId('xxx'), true); assert.equal(validColorId('a'.repeat(40)), true);
  for (const bad of ['a'.repeat(41), '', null, undefined, 3, {}, [], true]) assert.equal(validColorId(bad), false);
  assert.equal(isFlickId('sage'), true); assert.equal(isFlickId('xxx'), false); assert.equal(isFlickId('toString'), false); assert.equal(isFlickId('__proto__'), false);
});

test('段1: inline の CSS 変数は 色 7 つ（値は # と 16 進 6 けただけ）＋前後の月の線の割合 1 つ（数字と %。レビュー直し 望ましい7）。style に入れても壊れない', () => {
  for (const s of [colorSet('#2f5f8a'), colorSet('bad"<'), eventSet('sage', '#2f5f8a'), eventSet('sage', '#2f5f8a', 'dark')]) {
    const v = setVars(s);
    assert.match(v, /^(--cat-(line|mark|tint|fill|text|tint-out|line-out):#[0-9A-F]{6};){7}--cat-line-a:\d{2,3}%;$/);
  }
  assert.ok(setVars(colorSet('#2f5f8a')).includes('--cat-line:#526B90;') && setVars(colorSet('#2f5f8a')).includes('--cat-tint:#D4DDEB;'));
});

test('段1: 設計の計算がこの箱にあれば、書き出した表が今の設計の式と同じか確かめる（古い表で通さない）', { skip: !existsSync('/workspace/duo-calendar-team/design/img/colors36-lib.mjs') }, async () => {
  const M = await import('/workspace/duo-calendar-team/design/img/colors36-lib.mjs');
  for (const p of M.PALETTE) { const s = M.withMark(p.light, M.setOf(p.light, p.n), false); for (const m of MODES) for (const r of ROLES) assert.equal(colorSet(p.light, m)[r], s[m][r], `${p.name} ${m} ${r}`); }
  for (const c of [...M.IPHONE, ...M.IPHONE_MOCK]) { const s = M.withMark(c.hex, M.setOfAuto(c.hex), true); for (const m of MODES) for (const r of ROLES) assert.equal(colorSet(c.hex, m)[r], s[m][r], `${c.name} ${m} ${r}`); }
  // 乱数ではなく決まった並びの 216 色（6×6×6）でも同じ
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
    const hex = '#' + [r, g, b].map((v) => (v * 51).toString(16).padStart(2, '0')).join('');
    const s = M.withMark(hex, M.setOfAuto(hex), true);
    for (const m of MODES) for (const k of ROLES) assert.equal(colorSet(hex, m)[k], s[m][k], `${hex} ${m} ${k}`);
  }
});

test('C-2・C-3: 216 色（6×6×6）のどれが来ても、墨×薄い地・塗り 4.5、線・左の線 3、前後の月の文字 4.8・線 3 を割らない', () => {
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) {
    const hex = '#' + [r, g, b].map((v) => (v * 51).toString(16).padStart(2, '0')).join('');
    for (const m of MODES) {
      const s = colorSet(hex, m);
      assert.ok(cr(INK[m], s.tint) >= 4.5 && cr(INK[m], s.fill) >= 4.5, `${hex} ${m} 墨`); assert.ok(cr(s.edge, s.fill) >= 3, `${hex} ${m} 縁×塗り`);
      for (const k of ['line', 'mark']) for (const gr of [...grounds(m), s.tint]) assert.ok(cr(s[k], gr) >= 3, `${hex} ${m} ${k}×${gr} ${cr(s[k], gr)}`);
      for (const gr of grounds(m)) assert.ok(cr(s.text, gr) >= 4.5, `${hex} ${m} 色の文字`);
      assert.ok(cr(OUT_TEXT[m], s.tintOut) >= 4.8, `${hex} ${m} 前後の月の文字 ${cr(OUT_TEXT[m], s.tintOut)}`);
      assert.ok(cr(s.lineOut, BG[m].paper) >= 3 && cr(s.lineOut, s.tintOut) >= 3, `${hex} ${m} 前後の月の線 ${cr(s.lineOut, BG[m].paper)} ${cr(s.lineOut, s.tintOut)}`);
    }
  }
});

// レビュー直し（design/V194_レビュー.md 望ましい7）: 開いた横の左ページ #F0EDE5 の上では、前後の月の地（30%）と線をそのページの地に混ぜる。地が消えず、線は 3 以上、文字は 4.5 以上
test('レビュー直し 望ましい7: 左ページ #F0EDE5 に混ぜた前後の月の地は見え、線は 3 以上・文字 #5D6963 は 4.5 以上（既定 5 色・パレット・iPhone の色・7 色）', () => {
  assert.equal(LEFT_PAGE, '#F0EDE5');
  const sets = [...['#2f5f8a', '#8a4b6b', '#2e6b5a', '#87500f', '#5a5e62', '#a13a3a', '#5e4c8e', '#1f6a73', '#556a1c', '#34aadc', '#ff2968', '#68716a', '#ffcc00', '#d93025', '#0b8043'].map((h) => [h, colorSet(h)]), ...FLICK.map((f) => [f.id, flickSet(f.id)])];
  for (const [n, s] of sets) {
    assert.ok(Number.isInteger(s.lineOutA) && s.lineOutA >= OUT_LINE_ALPHA.light * 100 && s.lineOutA <= 100, `${n} 割合 ${s.lineOutA}`);
    const t = mixHex(s.tint, LEFT_PAGE, OUT_TINT_ALPHA), l = mixHex(s.line, LEFT_PAGE, s.lineOutA / 100);
    assert.notEqual(t, LEFT_PAGE, `${n} 地がページと同じ色でない`);
    assert.ok(contrast(l, LEFT_PAGE) >= 3 && contrast(l, t) >= 3, `${n} 線 ${contrast(l, LEFT_PAGE)} ${contrast(l, t)}`);
    assert.ok(contrast(OUT_TEXT.light, t) >= 4.5, `${n} 文字 ${contrast(OUT_TEXT.light, t)}`);
  }
  // 紙の上の値（36 §15.4 の tintOut・lineOut）は変えていない
  assert.equal(colorSet('#5a5e62').tintOut, mixHex(colorSet('#5a5e62').tint, BG.light.paper, OUT_TINT_ALPHA));
});
