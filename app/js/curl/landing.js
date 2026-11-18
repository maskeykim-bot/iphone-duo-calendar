// めくりの動き（第18版 PR4）。curl-v1 の finish() と同じ時間・緩急・左端の入れ替え・透かしの消し方（design/21 §6.11）。
// 変えたのは「着地の 0.15 秒で薄くするのが紙の alpha ではなく canvas 全体の opacity」な点だけ（決定 B：下に本物の次の2日の DOM があり、薄くなると DOM が見える。
// 下の絵と DOM は同じ中身なので、見た目は紙の alpha を下げるのと同じ）。
import { TIME, easeOut3, easeStd } from './params.js';
import { clampF } from './geom.js';

// 時計。テスト用に止めて進められる（アプリの見た目には影響しない）
export const clock = {
  manual: false, t: 0, q: [], id: 0,
  now() { return this.manual ? this.t : performance.now(); },
  raf(f) { if (!this.manual) return requestAnimationFrame(() => f(this.now())); const id = ++this.id; this.q.push([id, f]); return id; },
  caf(id) { if (!this.manual) cancelAnimationFrame(id); else this.q = this.q.filter(([i]) => i !== id); },
  // 止めた時計を ms 進める（16ms のコマごとに、そのコマに登録された処理を1回ずつ）
  advance(ms, step = 16) { for (let left = ms; left > 0; left -= step) { this.t += Math.min(step, left); const q = this.q; this.q = []; for (const [, f] of q) f(this.t); } },
};

// 動きの持ち主。cancel() で全部止める（待っている tween は false で終わる）
export function createAnim() {
  const a = { dead: false, ids: new Set(), res: new Set(),
    cancel() { a.dead = true; for (const id of a.ids) clock.caf(id); a.ids.clear(); for (const r of [...a.res]) r(false); a.res.clear(); } };
  return a;
}
export function tween(ms, ease, fn, a) {
  return new Promise((res) => {
    if (a.dead) { res(false); return; }
    a.res.add(res);
    const t0 = clock.now(); let id = 0;
    const f = () => {
      a.ids.delete(id); if (a.dead) return;
      const u = Math.min(1, (clock.now() - t0) / ms); fn(ease(u), u);
      if (u < 1) { id = clock.raf(f); a.ids.add(id); } else { a.res.delete(res); res(true); }
    };
    id = clock.raf(f); a.ids.add(id);
  });
}
const lerp2 = (a, b, e) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];

// 角を持ち上げる（辺 24pt から触れたとき、0.10 秒で 12pt）
export function lift(ctx, a) {
  const { st } = ctx, s = st.s, g = st.g;
  return tween(TIME.lift, (u) => u, (u) => { if (st.moved) return; st.f = clampF(s, g, [g[0] - s.sgn * 12 * u, g[1]]); ctx.draw(); }, a);
}
// 指を離したあと。done＝めくり切る／戻る。ctx = { st, R（renderer）, draw(), fade(a: 1→0), landed() }
export async function runTurn(ctx, done, a) {
  const { st, R } = ctx, s = st.s, dir = st.dir, L = R.land;
  const from = st.f.slice(), to = done ? [2 * s.spine - s.edge, st.g[1]] : st.g.slice();
  const strip = done && dir === 'backward' ? tween(TIME.fade, easeStd, (e) => { L.stripMix = e; }, a) : null; // 戻り：手を離した瞬間に左端を前の日へ 0.15 秒
  await tween(done ? TIME.page : TIME.back, easeOut3, (e, u) => {
    if (done) L.showMul = 1 - Math.min(1, Math.max(0, (u - TIME.showFrom) / (1 - TIME.showFrom))); // §6.11-10：0.30 秒の後ろ 40% で透かし 16%→0
    st.f = clampF(s, st.g, lerp2(from, to, e));
    if (done && dir === 'forward') L.stripMix = e; // 前へ：めくり終わりの 0.30 秒で左端を次の日へ
    if (e >= 1 && done) st.f = to;
    ctx.draw();
  }, a);
  if (strip) await strip;
  if (a.dead) return false;
  if (done) { // 背に重なって止まったら、下を新しい中身にして、0.15 秒で薄くする（位置も大きさも動かさない）
    if (dir === 'forward') L.Lnew = 1; else L.Rnew = 1;
    ctx.draw(); ctx.landed?.();
    await tween(TIME.fade, easeStd, (e) => { ctx.fade(1 - e); }, a);
  }
  return !a.dead;
}
// 視差効果を減らす：めくらずに入れ替える。見開きの写し（copy）を上に置き、0.15 秒で薄くする。
export function runSwap(copy, a) { return tween(TIME.fade, easeStd, (e) => { copy.style.opacity = String(1 - e); }, a); }
