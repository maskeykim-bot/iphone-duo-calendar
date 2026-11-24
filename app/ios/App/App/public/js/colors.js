// 第19.4版（design/36・37）: 予定の色を「画面に出すときだけ」くすませる純粋関数。DOM・IndexedDB に依存しない。
// 保存（IndexedDB・バックアップ）と EventKit の色は元の hex のまま。ここを通すのは app.js の表示の入口だけ（36 §8.1）。
// 式は design/img/colors36-lib.mjs・colors37-lib.mjs の写し（sRGB↔線形、OKLCH、WCAG 2.x の比）。値は test-unit/colors.test.mjs で設計の表と突き合わせる。

export const BG = {
  light: { paper: '#F7F4ED', capsule: '#EFECE4', card: '#FFFFFF', sat: '#EEF1F4' },
  dark: { paper: '#1C1F1D', capsule: '#30352F', card: '#262A27', sat: '#232A2F' },
};
export const LEFT_PAGE = '#F0EDE5'; // 開いた横の左ページの地（app.css の .shell.spread）
export const INK = { light: '#293B35', dark: '#E8E6E0' };
// 前後の月の数字・予定の文字・+N（36 §15.4・§15.5）。下の欄の日付の横の薄い文字もこの色（§15.9）
export const OUT_TEXT = { light: '#5D6963', dark: '#A3A29E' };
export const OUT_TINT_ALPHA = 0.30;
export const OUT_LINE_ALPHA = { light: 0.79, dark: 0.62 };
// 週末（案 A で確定）: 土＝青の線と同じ、日・祝＝赤、土の列の地は残す
export const WEEKEND = {
  light: { sat: '#526B90', sun: '#B43C3C', hol: '#B43C3C', satCol: '#EEF1F4' },
  dark: { sat: '#8BA8C4', sun: '#D0928E', hol: '#D0928E', satCol: '#232A2F' },
};
const TEXT_NEED = 4.5, MARK_NEED = 3.0, PAD = 0.05;
const HEX = /^#[0-9a-fA-F]{6}$/;
const FALLBACK = '#68716A'; // 形の正しくない色は未分類の色として変換する（元の値は変えない）

export const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const rgb2hex = (c) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const lin = (h) => hex2rgb(h).map(toLin);
const fromLin = (l) => rgb2hex(l.map(toGam));
export const relLum = (h) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// CSS の color-mix(in srgb, c a%, base) と同じ混ぜ方
export const mixHex = (c, base, a) => { const x = hex2rgb(c), y = hex2rgb(base); return rgb2hex(x.map((v, i) => v * a + y[i] * (1 - a))); };

function lin2oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklab2lin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
export const toOklch = (h) => { const [L, a, b] = lin2oklab(lin(h)); return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]; };
const inGamut = (l) => l.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
// 色域の外なら、明るさと色相を保って彩度だけ下げる
export function oklch2hex(L, C, H) {
  let c = C;
  for (let i = 0; i < 60; i++) {
    const r = (H * Math.PI) / 180, l = oklab2lin([L, c * Math.cos(r), c * Math.sin(r)]);
    if (inGamut(l)) return fromLin(l);
    c *= 0.95;
  }
  return fromLin(oklab2lin([L, 0, 0]));
}

// 役ごとの式（36 §2.2・§15.2）。fill＝下の札だけ、tint＝ごく薄い地、line＝線と印・色の文字（4.5 で解く）
const ROLE = {
  light: { fill: { L: 0.855, k: 0.55, cMax: 0.060 }, tint: { L: 0.8955, k: 0.30, cMax: 0.022, flat: true }, line: { k: 0.75, cMax: 0.085, Lmax: 0.56, Lmin: 0.40 } },
  dark: { fill: { L: 0.405, k: 0.45, cMax: 0.050 }, tint: { L: 0.308, k: 0.30, cMax: 0.022, flat: true }, line: { k: 0.60, cMax: 0.075, Lmin: 0.72, Lmax: 0.86, dark: true } },
};
const GRAY_C = 0.02;
const chroma = (C0, p) => (C0 < GRAY_C ? Math.min(C0, 0.012) : Math.min(C0 * p.k, p.cMax));
const lineGrounds = (mode) => [BG[mode].paper, BG[mode].capsule, BG[mode].card];

export function mute(hex, mode = 'light', role = 'fill') {
  const [L0, C0, H] = toOklch(hex), p = ROLE[mode][role], C = chroma(C0, p);
  const dL = Math.max(-0.06, Math.min(0.04, (L0 - 0.48) * 0.6)) * (mode === 'dark' ? 0.5 : 1);
  if (role !== 'line') return oklch2hex(p.L + (p.flat ? 0 : dL), C, H);
  const bgs = lineGrounds(mode), ok = (h) => bgs.every((b) => contrast(h, b) >= TEXT_NEED + PAD);
  if (!p.dark) { for (let L = Math.min(p.Lmax, L0 + 0.06); L >= p.Lmin - 0.2; L -= 0.002) { const h = oklch2hex(L, C, H); if (ok(h)) return h; } }
  else { for (let L = p.Lmin; L <= p.Lmax + 0.2; L += 0.002) { const h = oklch2hex(L, C, H); if (ok(h)) return h; } }
  return oklch2hex(p.dark ? 0.9 : 0.3, C, H);
}

// 既定 5 色の手直し（36 §2.3。パレットの 1〜5 と同じ hex のときだけ）
const TUNED = { '#2f5f8a': 1, '#8a4b6b': 2, '#2e6b5a': 3, '#87500f': 4, '#5a5e62': 5 };
// パレット 12 色（categories.js の PALETTE と同じ）。左の線 mark は線と同じ値にする（§15.2）
const PALETTE12 = new Set(['#2f5f8a', '#8a4b6b', '#2e6b5a', '#87500f', '#5a5e62', '#a13a3a', '#5e4c8e', '#1f6a73', '#556a1c', '#2c3f75', '#6e4e3a', '#476175']);
const TUNE = {
  1: { fill: { dL: +0.05, dH: -10 }, line: { dL: 0, dH: +10 } },
  2: { fill: { dL: -0.05, dH: -10 }, line: { dL: -0.12, dH: -10 } },
  3: { fill: { dL: +0.05, dH: -10 }, line: { dL: 0, dH: -10 } },
  4: { fill: { dL: 0, dH: 0 }, line: { dL: -0.08, dH: 0 } },
  5: { fill: { abs: [0.78, 0.016, 80] }, line: { abs: [0.36, 0.016, 80] } },
};
const TUNE_DARK = {
  1: { fill: { dL: +0.06 }, line: { dL: +0.12 } },
  2: { fill: { dL: -0.03 }, line: { dL: 0 } },
  3: { fill: { dL: +0.06 }, line: { dL: +0.08 } },
  4: { fill: { dL: 0 }, line: { dL: 0 } },
  5: { fill: { abs: [0.30, 0.012, 80] }, line: { abs: [0.70, 0.010, 80] } },
};
function tuned(hex, mode, role, t) {
  if (!t) return mute(hex, mode, role);
  const [L0, C0, H0] = toOklch(hex);
  if (t.abs) return oklch2hex(...t.abs);
  const p = ROLE[mode][role], C = chroma(C0, p), H = (H0 + (t.dH || 0) + 360) % 360;
  if (role === 'tint') return oklch2hex(p.L, C, H);
  if (role !== 'line') return oklch2hex(p.L + (t.dL || 0), C, H);
  const base = toOklch(mute(oklch2hex(L0, C0, H), mode, 'line'))[0];
  return oklch2hex(base + (t.dL || 0), C, H);
}
function tunedDark(hex, role, n) {
  const t = TUNE_DARK[n]?.[role === 'tint' ? 'fill' : role], dH = TUNE[n]?.fill?.dH ?? 0, dHl = TUNE[n]?.line?.dH ?? 0;
  if (!t) return mute(hex, 'dark', role);
  const [L0, C0, H0] = toOklch(hex);
  if (t.abs) { if (role === 'tint') return oklch2hex(ROLE.dark.tint.L, t.abs[1], t.abs[2]); return oklch2hex(...t.abs); }
  const p = ROLE.dark[role], C = chroma(C0, p);
  if (role === 'tint') return oklch2hex(p.L, C, (H0 + dHl + 360) % 360);
  if (role === 'fill') return oklch2hex(p.L + t.dL, C, (H0 + dH + 360) % 360);
  const H = (H0 + dH + 360) % 360;
  const base = toOklch(mute(oklch2hex(L0, C0, H), 'dark', 'line'))[0];
  return oklch2hex(base + t.dL, C, H);
}
// 左の線 mark（36 §15.2・決定 3）: 3:1 でよいので、元が明るい色は元の明るさを残す（紙・カプセル・白・自分の薄い地のどれにも 3:1）
function markLine(hex, line, tintHex) {
  const [L0] = toOklch(hex), [Ll, Cl, Hl] = toOklch(line);
  if (L0 <= Ll) return line;
  const bgs = [...lineGrounds('light'), tintHex];
  let best = line;
  for (let L = Ll; L <= Math.min(L0, 0.9); L += 0.002) { const h = oklch2hex(L, Cl, Hl); if (bgs.every((b) => contrast(h, b) >= MARK_NEED + PAD)) best = h; else break; }
  return best;
}
// 前後の月（36 §15.4）: 地は薄い地の 30%、線は線の色の 79%（ダーク 62%）。どちらも紙に混ぜる
function withOut(s, mode, solve) {
  const paper = BG[mode].paper;
  s.tintOut = mixHex(s.tint, paper, OUT_TINT_ALPHA);
  let a = OUT_LINE_ALPHA[mode];
  // 決まった組（37 の 7 色）は表の割合で 3:1 を割ることがあるので、割らない所まで 0.01 ずつ濃くする
  if (solve) for (; a < 1; a += 0.01) { const l = mixHex(s.line, paper, a); if (contrast(l, paper) >= MARK_NEED + PAD && contrast(l, s.tintOut) >= MARK_NEED + PAD) break; }
  s.lineOut = mixHex(s.line, paper, Math.min(1, a));
  // レビュー直し 望ましい7: 開いた横の左ページ（#F0EDE5）では、CSS が地と線をそのページの地へ混ぜ直す。線の割合（%）は、そのページの地と前後の月の地の両方に 3:1 を割らない所まで 1% ずつ濃くした値（ダークは見本だけなので紙と同じ割合）
  let b = Math.min(1, a);
  if (mode === 'light') { const pg = LEFT_PAGE, t = mixHex(s.tint, pg, OUT_TINT_ALPHA); for (; b < 1; b += 0.01) { const l = mixHex(s.line, pg, b); if (contrast(l, pg) >= MARK_NEED + PAD && contrast(l, t) >= MARK_NEED + PAD) break; } }
  s.lineOutA = Math.round(Math.min(1, b) * 100);
  // 下の札の縁（36 §15.7）: 左の線の色。塗りの上で 3:1 を割る色（元が明るい iPhone の色）だけ 4.5 の線の色にする
  s.edge = contrast(s.mark, s.fill) >= MARK_NEED + PAD ? s.mark : s.line;
  s.ink = INK[mode]; s.outText = OUT_TEXT[mode];
  return s;
}

const cache = new Map();
// 1 色 → 画面の色の組 { tint 薄い地, line 線と印・色の文字, mark 左の線, fill 下の札の塗り, edge 下の札の縁, tintOut・lineOut 前後の月, ink, outText }
export function colorSet(hex, mode = 'light') {
  const src = HEX.test(hex || '') ? hex.toLowerCase() : FALLBACK.toLowerCase(), key = `${mode}:${src}`;
  let s = cache.get(key);
  if (s) return s;
  const n = TUNED[src];
  if (mode === 'dark') {
    s = n ? { fill: tunedDark(src, 'fill', n), tint: tunedDark(src, 'tint', n), line: tunedDark(src, 'line', n) } : { fill: mute(src, 'dark', 'fill'), tint: mute(src, 'dark', 'tint'), line: mute(src, 'dark', 'line') };
    s.mark = s.line;
  } else if (n) {
    const t = TUNE[n];
    s = { fill: tuned(src, 'light', 'fill', t.fill), tint: tuned(src, 'light', 'tint', t.fill.abs ? { abs: [ROLE.light.tint.L, 0.010, 80] } : { dH: t.line?.dH ?? 0 }), line: tuned(src, 'light', 'line', t.line) };
    s.mark = s.line;
  } else {
    s = { fill: mute(src, 'light', 'fill'), tint: mute(src, 'light', 'tint'), line: mute(src, 'light', 'line') };
    s.mark = PALETTE12.has(src) ? s.line : markLine(src, s.line, s.tint);
  }
  s.text = s.line; // 色の文字（分類名など。紙・白の上だけ）
  s = Object.freeze(withOut(s, mode, false));
  if (cache.size > 400) cache.clear();
  cache.set(key, s);
  return s;
}

// ── 37: Duo フリックのくすみ 7 色（ThemeCatalog.swift 119〜146 行の値のまま。36 の式は通さない）
// light: [薄い地＝背景, 線＝アクセント]、dark: [薄い地＝機能キー, 線＝アクセント]
export const FLICK = [
  { id: 'kusumiPink', name: 'くすみピンク', light: ['#E8D9D8', '#9E645F'], dark: ['#362D2C', '#C99A95'] },
  { id: 'sage', name: 'セージ', light: ['#DDE3D8', '#65785B'], dark: ['#2A3127', '#9CB08F'] },
  { id: 'kusumiBlue', name: 'くすみブルー', light: ['#D8DFE6', '#5E758E'], dark: ['#283038', '#93A9BF'] },
  { id: 'lavenderGray', name: 'ラベンダーグレー', light: ['#DEDBE6', '#7A6D99'], dark: ['#2F2C37', '#A99FC2'] },
  { id: 'greige', name: 'グレージュ', light: ['#E3DED7', '#80715F'], dark: ['#312D28', '#B7A792'] },
  { id: 'terracotta', name: 'テラコッタ', light: ['#E7D8CF', '#A56148'], dark: ['#372A25', '#CF917A'] },
  { id: 'milkTea', name: 'ミルクティー', light: ['#E6DDD2', '#8A6E53'], dark: ['#342C25', '#C2A688'] },
];
export const COLOR_ID_MAX = 40;
const FLICK_BY = new Map(FLICK.map((f) => [f.id, f]));
export const isFlickId = (id) => typeof id === 'string' && FLICK_BY.has(id);
export const flickName = (id) => FLICK_BY.get(id)?.name || '';
// 保存してよい colorId か（40 字までの文字列。知らない ID は値を残してカテゴリの色で出す）。null・項目なしは「カテゴリの色」
export const validColorId = (v) => typeof v === 'string' && v.length > 0 && v.length <= COLOR_ID_MAX;
const fcache = new Map();
// 7 色の組。fill（下の札）は薄い地と同じ（線が 3:1 を保てるのは薄い地の上だけ）。textHex は色の文字に使う色（線は 4.5 に届かないので、元の分類・カレンダーの線の色を渡す）
export function flickSet(id, mode = 'light') {
  const f = FLICK_BY.get(id);
  if (!f) return null;
  const key = `${mode}:${id}`;
  let s = fcache.get(key);
  if (!s) { const [tint, line] = f[mode]; s = Object.freeze(withOut({ tint, line, mark: line, fill: tint, text: null }, mode, true)); fcache.set(key, s); }
  return s;
}
// 予定 1 件の色の組: colorId が 7 色のどれかならその組、そうでなければ base（分類・カレンダーの元の hex）を 36 の式で
export function eventSet(colorId, base, mode = 'light') {
  const b = colorSet(base, mode), f = isFlickId(colorId) ? flickSet(colorId, mode) : null;
  return f ? { ...f, text: b.line } : b;
}
// inline の CSS 変数
export const setVars = (s) => `--cat-line:${s.line};--cat-mark:${s.mark};--cat-tint:${s.tint};--cat-fill:${s.fill};--cat-text:${s.text || s.line};--cat-tint-out:${s.tintOut};--cat-line-out:${s.lineOut};--cat-line-a:${s.lineOutA}%;`;
