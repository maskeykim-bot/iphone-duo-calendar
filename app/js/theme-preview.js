// 第19.4版: ダークの見本（確かめ用）。design/36 §5 のダークは「値だけ」で、アプリはライト固定（V-07。iOS は UIUserInterfaceStyle=Light）。
// ?theme=dark で開いたときだけ app.js がこのファイルを読み込み、スタイルシートの色を暗い側へ写す。利用者の設定には出さない。
// 予定の色（くすみ色）は js/colors.js のダークの値（inline の変数）で、ここでは触らない。ここが写すのは画面の地・文字・罫線だけ。
// design/25 §6 に値がある色はその値、ない色は OKLCH の明るさを「紙からの離れ」で写す（紙 → 地、白 → カード、墨 → 明るい文字）。
import { toOklch, oklch2hex } from './colors.js';

const PAIRS = { // ライト → ダーク（design/25 §6、design/36 §15）
  f7f4ed: '#1C1F1D', ffffff: '#262A27', fffdfa: '#262A27', '293b35': '#E8E6E0', '1c1f1d': '#E8E6E0', '68716a': '#A3A9A2', e4e0d6: '#343A36', dddcd3: '#343A36',
  efece4: '#30352F', '294e42': '#6FA08C', b43c3c: '#D0928E', eef1f4: '#232A2F', '526b90': '#8BA8C4', '5d6963': '#A3A29E',
};
const PAPER_L = 0.9675, GROUND_L = 0.236;
export function darkOf(hex) {
  const k = hex.slice(1).toLowerCase();
  if (PAIRS[k]) return PAIRS[k];
  const [L, C, H] = toOklch(`#${k}`), d = Math.abs(PAPER_L - L);
  const up = d <= 0.05 ? d * 1.45 : 0.0725 + (d - 0.05) * 1.04;
  return oklch2hex(Math.min(0.97, GROUND_L + up), C * 0.8, H);
}
const hex6 = (h) => (h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join('')}` : h);
const h2 = (n) => Math.round(n).toString(16).padStart(2, '0');
function swap(text) {
  return text
    .replace(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi, (m) => {
      if (m.length === 9) return /^#000000/i.test(m) ? m : darkOf(m.slice(0, 7)) + m.slice(7); // 8 けた: 透けぐあいは残す（黒の影はそのまま）
      if (m.length === 5) return m; // #0000 など
      return darkOf(hex6(m));
    })
    .replace(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/g, (m, r, g, b, a) => {
      if (a !== undefined && +r + +g + +b === 0) return m; // 影（黒の半透明）はそのまま
      const d = darkOf(`#${h2(r)}${h2(g)}${h2(b)}`), [x, y, z] = [1, 3, 5].map((i) => parseInt(d.slice(i, i + 2), 16));
      return a === undefined ? `rgb(${x}, ${y}, ${z})` : `rgba(${x}, ${y}, ${z}, ${a})`;
    });
}
function walk(rules) {
  for (const r of rules) {
    if (r.cssRules && r.cssRules.length && !(r instanceof CSSStyleRule)) { walk(r.cssRules); continue; }
    if (!r.style || /data-theme=.?dark/.test(r.selectorText || '')) continue; // ダークの決めた値（html[data-theme=dark]）は写さない
    const before = r.style.cssText;
    if (!/#[0-9a-f]{3}|rgb/i.test(before) || /url\(/.test(before)) continue;
    const after = swap(before);
    if (after !== before) r.style.cssText = after;
  }
}
export function applyDarkPreview(doc = document) {
  for (const sheet of doc.styleSheets) { try { walk(sheet.cssRules); } catch { /* 読めないシートはそのまま */ } }
  doc.querySelector('meta[name=theme-color]')?.setAttribute('content', '#1C1F1D');
}
