// 指の追跡（第18版 PR4、第18.1版で感度を直した）。めくりを始める判定・速さ・離したときの判定の材料・他の操作との取り合い。
// 始め方（design/26 §3 と §追記 18.1）：前へ＝右ページの外側の帯（edge−band〜edge）、戻り＝左ページの外側の帯（lx0〜lx0+band。画面の左 20 は端の戻る操作に譲る）。
//   band＝min(110, ページ幅×0.35)。辺 24（前へ edge−24〜edge・戻り lx0+20〜lx0+44）だけは触れた瞬間に角を持ち上げる。帯のそれ以外は向きが決まるまで何もしない。
// ページの中ほど（帯の外）では始めない。10pt 動いたら決める：横 ≥ 縦×0.7 なら横（めくり）、そうでなければ縦スクロール（最後まで横に乗り換えない）。
import { JUDGE } from './params.js';

export const EDGE_BACK_FROM = 20, EDGE_BACK_TO = 44; // 戻りの角を持ち上げる辺：lx0 から 20〜44（x28〜52）
export const TAP_PX = 8;
export const SCREEN_EDGE = 20; // 画面の左右 20 は OS の戻る操作に譲る

// 帯の幅（pt）。ページ幅＝edge−spine
export const bandWidth = (m) => Math.max(JUDGE.edge, Math.min(JUDGE.band, (m.edge - m.spine) * JUDGE.bandFrac));
// 押した x がどちらの帯か。'forward' | 'backward' | null
export function edgeDir(x, m) {
  const b = bandWidth(m);
  if (x >= m.edge - b && x <= m.edge) return 'forward';
  if (x >= Math.max(m.lx0, SCREEN_EDGE) && x <= m.lx0 + b) return 'backward';
  return null;
}
// 触れた瞬間に角を持ち上げる辺（設計の 24pt）の中か
export function inLiftEdge(x, dir, m) {
  return dir === 'forward' ? x >= m.edge - JUDGE.edge : x >= m.lx0 + EDGE_BACK_FROM && x <= m.lx0 + EDGE_BACK_TO;
}
// 向きの判定。dx, dy は押した所からの動き。'h'（横）| 'v'（縦）| null（まだ決めない）
export function decideAxis(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < JUDGE.decide) return null;
  return ax >= ay * JUDGE.ratio ? 'h' : 'v';
}
// めくり切るか（design/21 §6.3、curl-v1 release と同じ式）。s＝geom の方向の組、fx＝紙の端（つかんだ所）の今の x、vx＝指の速さ（pt/秒）
export function judgeDone(s, fx, vx) {
  return s.sgn > 0 ? (vx < -JUDGE.flick || (fx < s.mid && vx <= JUDGE.flick)) : (vx > JUDGE.flick || (fx > s.mid && vx >= -JUDGE.flick));
}
// 速い払い：押してから quickMs 以内に、めくる向きへ quickPx 以上動かして離した（逆向きに速く戻していない）
export function quickFlick(dir, dxTotal, ms, vx) {
  const sg = dir === 'forward' ? -1 : 1;
  return ms <= JUDGE.quickMs && dxTotal * sg >= JUDGE.quickPx && vx * sg > -JUDGE.flick;
}
// 指の速さ：直近 JUDGE.velMs の動きから（止めてから離すと 0 に近づく）
export function velocity(samples, t) {
  const recent = samples.filter((q) => t - q[1] <= JUDGE.velMs);
  if (recent.length < 2) return 0;
  const a = recent[0], b = recent[recent.length - 1], dt = (b[1] - a[1]) / 1000;
  return dt > 0 ? (b[0] - a[0]) / dt : 0;
}
// 縦にスクロールできる祖先（帯で横を先取りしたあと縦だったときに、代わりに動かす）
function scroller(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.scrollHeight > e.clientHeight + 1) { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') return e; }
  }
  return null;
}

// hooks: { enabled(): bool, metrics(): {lx0,lx1,spine,edge,py0,py1}|null, canStart(target, ev): bool | 'quiet',
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
    if (!g || ev.pointerId !== g.id) return;
    const p = pt(ev);
    if (g.manual) { g.manual.el.scrollTop = g.manual.top - (p[1] - g.manual.y); return; } // 先取りした縦：代わりにスクロール
    if (g.aborted) return;
    const dx = p[0] - g.down[0], dy = p[1] - g.down[1], far = Math.max(Math.abs(dx), Math.abs(dy));
    if (far > TAP_PX) g.moved = true;
    if (!g.started) {
      const axis = decideAxis(dx, dy); if (!axis) return;
      if (axis === 'v') { // 縦スクロール。最後まで横に乗り換えない
        g.aborted = true; g.vertical = true;
        if (g.claimed) { const el = scroller(g.target); if (el) g.manual = { el, top: el.scrollTop, y: p[1] }; }
        onAbort?.(g, 'vertical'); return;
      }
      g.started = true; g.samples = [[g.down[0], g.t0], [p[0], now()]]; g.vx = velocity(g.samples, now());
      onStart?.(g, p); onMove?.(g, p); return;
    }
    const t = now();
    g.samples.push([p[0], t]); if (g.samples.length > 12) g.samples.shift();
    g.vx = velocity(g.samples, t);
    onMove?.(g, p);
  }
  function up(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const x = g, p = pt(ev); g = null; detach();
    if (x.moved || x.started) armSuppress();
    if (x.aborted) return;
    if (!x.started) { onAbort?.(x, 'tap'); return; } // 向きが決まる前に離した（持ち上げていれば戻す）
    const t = now();
    if (p[0] !== x.samples[x.samples.length - 1][0]) x.samples.push([p[0], t]);
    x.vx = velocity(x.samples, t);
    x.quick = quickFlick(x.dir, p[0] - x.down[0], t - x.t0, x.vx);
    onEnd?.(x, p);
  }
  // iOS：帯で押したあと横向きの動きなら、ブラウザに縦スクロール（pointercancel）を取らせない。めくり中は常に止める。
  function tm(ev) {
    if (!g || !ev.cancelable) return;
    if (g.manual || g.started) { ev.preventDefault(); return; }
    if (g.aborted) return;
    const t = [...ev.changedTouches].find((q) => Math.abs(q.clientX - g.last[0]) < 60 && Math.abs(q.clientY - g.last[1]) < 60) || ev.changedTouches[0]; if (!t) return;
    const dx = t.clientX - g.down[0], dy = t.clientY - g.down[1];
    g.last = [t.clientX, t.clientY];
    if (Math.abs(dx) >= Math.abs(dy) * JUDGE.ratio && (dx !== 0 || dy !== 0)) { ev.preventDefault(); g.claimed = true; }
  }
  document.addEventListener('touchmove', tm, { capture: true, passive: false });
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
    if (ev.clientX < SCREEN_EDGE || ev.clientX > window.innerWidth - SCREEN_EDGE) return; // OS の戻る操作を優先
    const ok = canStart(ev.target, ev); if (!ok) return; // 'quiet'：始めてよいが、触れた瞬間に角は持ち上げない（予定の枠など、タップで開く物の上）
    suppress = false;
    g = { id: ev.pointerId, dir, lift: ok !== 'quiet' && inLiftEdge(ev.clientX, dir, m), target: ev.target, start: pt(ev), down: pt(ev), last: pt(ev), t0: now(), moved: false, started: false, aborted: false, vertical: false, claimed: false, manual: null, quick: false, vx: 0, samples: [] };
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cn, true);
    onDown?.(g);
  };
  root.addEventListener('pointerdown', rootDown);
  return {
    get active() { return !!g; },
    // 外から止める（長押し確定・幅の変化・隠れた）。始めていれば onAbort が戻す
    cancel(reason = 'cancel') { if (g) finish(reason); },
    // 指は離れたが後始末だけ（click の抑止は残す）
    dispose() { finish('dispose'); root.removeEventListener('pointerdown', rootDown); window.removeEventListener('pointerdown', down2, true); document.removeEventListener('click', onClick, true); document.removeEventListener('touchmove', tm, { capture: true }); clearTimeout(supTimer); },
  };
}
