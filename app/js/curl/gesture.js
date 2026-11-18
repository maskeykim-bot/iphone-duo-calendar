// 指の追跡（第18版 PR4）。めくりを始める判定・速さ・離したときの判定の材料・他の操作との取り合い。
// 始め方（design/26 §3、決定 9）：前へ＝右ページの右端 24（edge−24〜edge）、戻り＝左ページの左端 24 だが画面の左 20 は端の戻る操作に譲るので lx0+20〜lx0+44。
// ページの中ほどでは横に 12pt 動かしても始めない。12pt 動くまで決めない。縦の方が大きければ縦スクロール（最後まで横に乗り換えない）。
import { JUDGE } from './params.js';

export const EDGE_BACK_FROM = 20, EDGE_BACK_TO = 44; // 戻りの始め：lx0 から 20〜44（x28〜52）
export const TAP_PX = 8;

// 押した x がどちらの端か。'forward' | 'backward' | null
export function edgeDir(x, m) {
  if (x >= m.edge - JUDGE.edge && x <= m.edge) return 'forward';
  if (x >= m.lx0 + EDGE_BACK_FROM && x <= m.lx0 + EDGE_BACK_TO) return 'backward';
  return null;
}
// めくり切るか（design/21 §6.3、curl-v1 release と同じ式）。s＝geom の方向の組、fx＝紙の端（つかんだ所）の今の x、vx＝指の速さ（pt/秒）
export function judgeDone(s, fx, vx) {
  return s.sgn > 0 ? (vx < -JUDGE.flick || (fx < s.mid && vx <= JUDGE.flick)) : (vx > JUDGE.flick || (fx > s.mid && vx >= -JUDGE.flick));
}

// hooks: { enabled(): bool, metrics(): {lx0,lx1,spine,edge,py0,py1}|null, canStart(target, ev): bool,
//   onDown(g), onStart(g, p), onMove(g, p), onEnd(g, p), onAbort(g, reason), now(): ms }
export function createGesture({ root, enabled, metrics, canStart, onDown, onStart, onMove, onEnd, onAbort, now = () => performance.now() }) {
  let g = null, suppress = false, supTimer = 0;
  const armSuppress = () => { suppress = true; clearTimeout(supTimer); supTimer = setTimeout(() => { suppress = false; }, 400); };
  // 確定しためくり・8px 超のドラッグのあとの click は、セルや予定を開かせない（swipe.js と同じ）
  const onClick = (ev) => { if (!suppress) return; suppress = false; clearTimeout(supTimer); ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener('click', onClick, true);
  const detach = () => { window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cn, true); };
  const finish = (reason) => { // 取りやめ。まだ決まっていなくても、始めていれば知らせる
    const x = g; if (!x) return; g = null; detach();
    if (x.moved || x.started) armSuppress();
    if (!x.aborted) onAbort?.(x, reason);
  };
  const pt = (ev) => [ev.clientX, ev.clientY];
  function mv(ev) {
    if (!g || ev.pointerId !== g.id || g.aborted) return;
    const p = pt(ev), dx = p[0] - g.start[0], dy = p[1] - g.start[1], far = Math.max(Math.abs(dx), Math.abs(dy));
    if (far > TAP_PX) g.moved = true;
    if (!g.started) {
      if (far < JUDGE.dragStart) return;
      if (Math.abs(dy) >= Math.abs(dx)) { g.aborted = true; g.vertical = true; onAbort?.(g, 'vertical'); return; } // 縦スクロール。最後まで横に乗り換えない
      g.started = true; g.start = p; g.lastX = p[0]; g.lastT = now(); g.vx = 0;
      onStart?.(g, p); onMove?.(g, p); return;
    }
    const t = now(), dt = (t - g.lastT) / 1000;
    if (dt > 0) g.vx = g.vx * 0.6 + 0.4 * (p[0] - g.lastX) / dt;
    g.lastX = p[0]; g.lastT = t;
    onMove?.(g, p);
  }
  function up(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const x = g, p = pt(ev); g = null; detach();
    if (x.moved || x.started) armSuppress();
    if (x.aborted) return;
    if (!x.started) { onAbort?.(x, 'tap'); return; } // 12pt 動く前に離した（持ち上げていれば戻す）
    onEnd?.(x, p);
  }
  function cn(ev) { if (g && ev.pointerId === g.id) finish('pointercancel'); }
  // 2本目の指で中止（ピンチなど）。root の外でも見る
  const down2 = (ev) => { if (g && ev.pointerId !== g.id) finish('multi'); };
  window.addEventListener('pointerdown', down2, true);
  const rootDown = (ev) => {
    if (g || !enabled()) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (!ev.isPrimary || !(ev.target instanceof Element)) return;
    const m = metrics(); if (!m) return;
    const dir = edgeDir(ev.clientX, m); if (!dir) return;
    if (ev.clientX < 20 || ev.clientX > window.innerWidth - 20) return; // OS の戻る操作を優先
    if (!canStart(ev.target, ev)) return;
    suppress = false;
    g = { id: ev.pointerId, dir, start: pt(ev), down: pt(ev), moved: false, started: false, aborted: false, vertical: false, vx: 0, lastX: ev.clientX, lastT: now() };
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cn, true);
    onDown?.(g);
  };
  root.addEventListener('pointerdown', rootDown);
  return {
    get active() { return !!g; },
    // 外から止める（長押し確定・幅の変化・隠れた）。始めていれば onAbort が戻す
    cancel(reason = 'cancel') { if (g) finish(reason); },
    // 指は離れたが後始末だけ（click の抑止は残す）
    dispose() { finish('dispose'); root.removeEventListener('pointerdown', rootDown); window.removeEventListener('pointerdown', down2, true); document.removeEventListener('click', onClick, true); clearTimeout(supTimer); },
  };
}
