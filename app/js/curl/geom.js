// 紙の曲がり方（design/21 §6.6〜6.10）。curl-geom.js の式のまま。寸法は引数でもらう。
import { TUNE } from './params.js';
export const DEG = Math.PI / 180;
const hyp = Math.hypot;
// dims = { spine（背）, edge（右の紙の端）, py0, py1（ページの縦）, lx0, lx1（左ページの左端・右端） }
// forward（次へ）：背から右の端までの紙を、背を軸に左へ。backward（前へ）：背から左へ同じ幅の紙を右へ。
export function makeSet(dims) {
  const { spine, edge, py0, py1 } = dims, w = edge - spine, left = spine - w;
  return {
    forward: { sgn: 1, x0: spine, x1: edge, spine, edge, mid: (spine + edge) / 2, py0, py1 },
    backward: { sgn: -1, x0: left, x1: spine, spine, edge: left, mid: (left + spine) / 2, py0, py1 },
  };
}
// 指の位置 f を決まりの範囲に止める。傾きは垂直から 35° まで、紙は背でつながっている、折れはじめの線は背の上端・下端を越えない。
export function okF(s, g, f) {
  for (const sy of [s.py0, s.py1]) { if (hyp(f[0] - s.spine, f[1] - sy) > hyp(g[0] - s.spine, g[1] - sy) + 1e-6) return false; }
  const sh = shape(s, g, f); if (!sh) return true;
  for (const sy of [s.py0, s.py1]) if ((s.spine - sh.P[0]) * sh.n[0] + (sy - sh.P[1]) * sh.n[1] > 1e-6) return false;
  return true;
}
export function clampF(s, g, f) {
  const inward = -s.sgn; let vx = f[0] - g[0], vy = f[1] - g[1];
  if (vx * inward < 0.01) vx = 0.01 * inward;
  const lim = Math.abs(vx) * Math.tan(TUNE.maxTilt * DEG);
  if (Math.abs(vy) > lim) vy = Math.sign(vy) * lim;
  const t = [g[0] + vx, g[1] + vy];
  if (okF(s, g, t)) return t;
  let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; okF(s, g, [g[0] + vx * m, g[1] + vy * m]) ? lo = m : hi = m; }
  return [g[0] + vx * lo, g[1] + vy * lo];
}
// 網目の頂点を巻いたあとの 3D 位置（シェーダと同じ式。自動チェック用）
export function deform(sh, X) {
  const d = (X[0] - sh.P[0]) * sh.n[0] + (X[1] - sh.P[1]) * sh.n[1], pr = Math.PI * sh.r;
  if (d <= 0) return [X[0], X[1], 0];
  if (d < pr && sh.r > 1e-3) { const th = d / sh.r, k = sh.r * Math.sin(th) - d; return [X[0] + k * sh.n[0], X[1] + k * sh.n[1], sh.r * (1 - Math.cos(th))]; }
  const k = -(d - pr) - d; return [X[0] + k * sh.n[0], X[1] + k * sh.n[1], 2 * sh.r];
}
function solveD(L, r) { if (r < 1e-3) return L / 2; const pr = Math.PI * r; if (L >= pr) return (L + pr) / 2; let lo = 0, hi = pr; for (let i = 0; i < 32; i++) { const m = (lo + hi) / 2; (m - r * Math.sin(m / r) < L) ? lo = m : hi = m; } return (lo + hi) / 2; }
// g = つかんだ点（紙の端、指の高さ）、f = 指。返す：筒の始まり P、向き n（指→つかんだ点）、半径 r、lift（0〜1）
export function shape(s, g, f) {
  const vx = g[0] - f[0], vy = g[1] - f[1], L = hyp(vx, vy);
  if (L < 0.25) return null;
  const n = [vx / L, vy / L];
  const land = 2 * s.spine - s.edge; // 着地点の x
  const toLand = Math.max(0, (f[0] - land) * s.sgn);
  let r = Math.min(TUNE.r0 + TUNE.rk * L, TUNE.rMax) * Math.min(1, toLand / TUNE.flatten);
  // 背の上端・下端が筒の中に入らないよう、入るときは半径を小さくする
  const crosses = (rr) => { const D = solveD(L, rr), P = [g[0] - n[0] * D, g[1] - n[1] * D]; return [s.py0, s.py1].some((sy) => (s.spine - P[0]) * n[0] + (sy - P[1]) * n[1] > 0); };
  let rLimited = false;
  if (r > 0 && crosses(r)) { rLimited = true; let lo = 0, hi = r; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; crosses(m) ? hi = m : lo = m; } r = lo; }
  const D = solveD(L, r);
  const P = [g[0] - n[0] * D, g[1] - n[1] * D];
  const lift = Math.min(1, L / (s.x1 - s.x0));
  return { P, n, r, L, lift, D, rLimited };
}
