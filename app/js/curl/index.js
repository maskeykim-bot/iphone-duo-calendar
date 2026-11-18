// めくりの入口。
//  - createCurl({ root, metrics, pages, onTurn, swipe, canStart, enabled, reduced })：アプリへの組み込み（第18版 PR4）。
//  - createCurl({ canvas, dims, dpr, dark, colors, k, preserve, onLost, onRestored })：部品だけを組む（PR2。部品のテスト用）。
// ダークの判定（DARK.enabled && prefers-color-scheme:dark）を見るのはこのファイルだけ。DARK.enabled は false のまま（ページのダーク配色ができたら true）。

import { makeSet, clampF } from './geom.js';
import { CurlRenderer } from './renderer.js';
import { createGesture, judgeDone } from './gesture.js';
import { clock, createAnim, lift, runTurn, runSwap } from './landing.js';
import { DARK, LIGHT } from './params.js';
import { curlPerfOn, curlPerfAuto, createPerf } from './perf.js';

export const curlDark = () => !!DARK.enabled && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
export const curlColors = () => (curlDark() ? DARK : LIGHT);

// WebGL が使えるか（使えないときは今の横すべりに逃げる）
export function webglAvailable() {
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl'); const ok = !!gl; gl?.getExtension('WEBGL_lose_context')?.loseContext(); return ok; } catch { return false; }
}

function createCurlParts({ canvas, dims, dpr, dark = false, colors, k, preserve, onLost, onRestored } = {}) {
  const renderer = new CurlRenderer(canvas, { dims, dpr, dark: dark === true, colors, k, preserve, onLost, onRestored });
  return { renderer, set: makeSet(dims), dims: renderer.dims, dispose: () => renderer.dispose() };
}

const keyOf = (m, dpr) => [m.lx0, m.lx1, m.spine, m.edge, m.py0, m.py1].map((v) => Math.round(v * 100)).join(',') + `/${dpr}`;

export function createCurl(opts = {}) {
  if (!opts.root) return createCurlParts(opts);
  const { root, metrics, pages, onTurn, swipe, canStart = () => true, enabled = () => true, reduced = () => false } = opts;
  let renderer = null, cv = null, key = '', st = null, failed = false, blocking = false, resetting = false, disposed = false, copy = null;
  let anim = createAnim(), webgl = null; const lostAt = [];
  // ?curlperf=1 のときだけ計測（js/curl/perf.js）。無いときは null で、下の perf?. は何もしない
  const perf = curlPerfOn() ? createPerf({ root, metrics, busy: () => !!st || blocking, stats: () => pages.stats(), canvasBytes: () => (cv ? cv.width * cv.height * 4 : 0), env: () => ({ reduced: reduced(), dark: curlDark(), mode: mode() }) }) : null;
  const dprNow = () => opts.dpr || Math.min(3, window.devicePixelRatio || 1);
  const usable = () => !failed && (webgl ??= webglAvailable());
  // 'curl'（紙をめくる）| 'reduce'（視差効果を減らす：入れ替え）| 'slide'（WebGL なし・失敗：今の横すべり）
  const mode = () => (reduced() ? 'reduce' : usable() && !renderer?.lost ? 'curl' : 'slide');
  const mark = (on) => { if (on) document.documentElement.dataset.curling = '1'; else delete document.documentElement.dataset.curling; };
  const hide = () => { if (cv) { cv.style.display = 'none'; cv.style.opacity = ''; } };

  function teardown() { // 動き・絵・網目・canvas を全部捨てる（次に要るとき作り直す）
    anim.cancel(); anim = createAnim();
    if (copy) { copy.remove(); copy = null; }
    try { pages.release(); pages.setRenderer(null); } catch { /* 捨てるだけ */ }
    try { renderer?.dispose(); } catch { /* 失われていても続ける */ }
    cv?.remove(); renderer = null; cv = null; key = ''; st = null; blocking = false; mark(false); perf?.end();
  }
  function fail(e) { hook.lastError = e?.message || String(e ?? "");  failed = true; teardown(); }
  function ensure() {
    const m = metrics(); if (!m) return null;
    const k = keyOf(m, dprNow());
    if (renderer && k !== key) teardown();
    if (!renderer) {
      cv = document.createElement('canvas'); cv.className = 'curlcv'; cv.setAttribute('aria-hidden', 'true'); cv.style.display = 'none';
      root.parentNode.insertBefore(cv, root.nextSibling);
      const c = curlColors();
      renderer = new CurlRenderer(cv, { dims: { W: m.edge, H: m.py1, spine: m.spine, edge: m.edge, py0: m.py0, py1: m.py1, lx0: m.lx0, lx1: m.lx1 }, dpr: dprNow(), dark: curlDark(), colors: { ...c, bg: c.paper, groove: c.paper }, onLost, onRestored: () => {} });
      pages.setRenderer(renderer); key = k;
    }
    return m;
  }
  function onLost() { // iOS は裏に回ったときやメモリ不足で起きる。めくり中は元へ戻す（日は進めない）。離したあと（done）は日が進んだ DOM をそのまま出す
    const now = Date.now(); while (lostAt.length && now - lostAt[0] > 60000) lostAt.shift(); lostAt.push(now);
    if (lostAt.length >= 2) failed = true; // 1分に2回：この起動中は横すべりに切り替える
    anim.cancel(); anim = createAnim(); hide(); st = null; blocking = false; mark(false);
    try { pages.release(); } catch { /* 失われた絵 */ }
    perf?.lost(); perf?.end();
  }
  function begin(dir, p, m) {
    const s = makeSet(m)[dir], gy = Math.min(m.py1, Math.max(m.py0, p[1]));
    st = { dir, s, g: [s.edge, gy], start: p, f: [s.edge, gy], started: false, moved: false, released: false, done: false, m };
  }
  const draw = () => { if (st && renderer && !renderer.lost) st.shape = renderer.draw(st.g, st.f); };
  function startCurl() { // 触れた向きの絵だけを作る（pointerdown）
    const t0 = performance.now(), scene = pages.prepare(st.dir);
    if (renderer.lost) return false;
    if (!['Lo', 'Ln', 'Ro', 'Rn', 'front', 'next'].every((k) => scene[k]?.t) || renderer.gl.getError()) { fail(); return false; } // テクスチャの作成に失敗 → 横すべりへ
    renderer.setScene(scene); st.prepMs = performance.now() - t0; st.shown = true;
    cv.style.opacity = ''; cv.style.display = 'block'; draw(); perf?.first(renderer.gl, pages.stats().last, st.g[1]); return true;
  }
  const ctx = () => ({ st, R: renderer, draw, fade: (a) => { cv.style.opacity = String(a); }, landed: () => hook.onLanded?.() });
  function cleanup() { hide(); try { pages.release(); } catch { /* 捨てるだけ */ } st = null; blocking = false; mark(false); perf?.end(); }

  async function finishTurn(done) {
    const cur = st; if (!cur || cur.released) return;
    cur.released = true; cur.done = done; const a = anim, dir = cur.dir === 'forward' ? 1 : -1;
    if (reduced() || !cur.shown) { await swapTurn(done, dir, a); return; }
    if (done) onTurn(dir); // 日を ±2 にして render()。めくりの canvas の下に本物の次の2日の DOM が出る（決定 B）
    const ok = await runTurn(ctx(), done, a);
    if (!ok || a.dead || st !== cur) return; // 止められた（幅の変化・コンテキスト消失）。後始末は止めた側
    cleanup();
  }
  async function swapTurn(done, dir, a) { // 視差効果を減らす：めくらない。今の見開きの写しを上に置き、下で ±2 日、写しを 0.15 秒で薄くする
    const cur = st;
    if (!done) { cleanup(); return; }
    copy = makeCopy();
    onTurn(dir);
    try { if (copy) await runSwap(copy, a); } finally { copy?.remove(); copy = null; if (st === cur) cleanup(); }
  }
  function makeCopy() {
    const sh = root.querySelector('.shell.spread.tt'); if (!sh) return null;
    const div = document.createElement('div'); div.className = `${sh.className} curlcopy`; div.setAttribute('style', sh.getAttribute('style') || ''); div.setAttribute('aria-hidden', 'true'); div.inert = true;
    const src = [...sh.querySelectorAll('.dpage')]; for (const p of src) div.appendChild(p.cloneNode(true));
    root.parentNode.insertBefore(div, root.nextSibling);
    const tl0 = [...sh.querySelectorAll('.tl')], tl1 = [...div.querySelectorAll('.tl')]; tl1.forEach((t, i) => { if (tl0[i]) t.scrollTop = tl0[i].scrollTop; });
    return div;
  }

  const gest = createGesture({
    root, now: () => clock.now(), metrics,
    enabled: () => !disposed && !st && !copy && mode() !== 'slide' && enabled(),
    canStart: (t, ev) => canStart(t, ev),
    onDown(g) {
      perf?.down(g.dir);
      let m = null; try { m = mode() === 'reduce' ? metrics() : ensure(); } catch (e) { fail(e); return; }
      if (!m) return;
      begin(g.dir, g.down, m);
      if (mode() === 'reduce') return;
      try { if (!startCurl()) return; } catch (e) { fail(e); return; }
      lift(ctx(), anim); // 辺 24pt に触れたら 0.10 秒で角を少し持ち上げる（§6.1）
    },
    onStart(g, p) { if (!st) return; swipe?.cancel(); st.started = true; st.moved = true; st.start = p; blocking = true; mark(true); },
    onMove(g, p) {
      if (!st || !st.started) return;
      const s = st.s, f = [st.g[0] + (p[0] - st.start[0]), st.g[1] + (p[1] - st.start[1])];
      st.f = clampF(s, st.g, f); st.vx = g.vx; if (!reduced()) draw();
    },
    onEnd(g) { if (!st) return; finishTurn(judgeDone(st.s, st.f[0], g.vx)); },
    onAbort(g, reason) { if (resetting || !st || st.released) return; finishTurn(false); },
  });
  // めくっている間（離したあとの動き）は他のタップを止める
  const blockTap = (ev) => { if (blocking && st?.released && ev.target instanceof Node && (root.contains(ev.target) || ev.type === 'click')) { ev.stopPropagation(); ev.preventDefault(); } };
  window.addEventListener('pointerdown', blockTap, true); window.addEventListener('click', blockTap, true);
  const onVis = () => { if (document.hidden) reset('hidden'); };
  document.addEventListener('visibilitychange', onVis);

  // 幅の変化・回転・閉じた・型を変えた・見開きでなくなった・隠れた：止めて（途中なら元に戻す・日は進めない）、絵・網目・canvas を全部捨てる
  function reset(reason = 'reset') { resetting = true; try { gest.cancel(reason); } finally { resetting = false; } teardown(); }
  function sync() { const m = metrics(); if (!m) { if (renderer || st || copy) reset('gone'); return; } if (renderer && key !== keyOf(m, dprNow())) reset('size'); }

  // ---- テスト用の口（アプリの見た目には影響しない）----
  const hook = globalThis.__duoCurl = {
    clock,
    manual(v) { clock.manual = !!v; clock.t = performance.now(); clock.q = []; },
    // ms 進める。16ms のコマごとに、続きの処理（await のあとの tween）が走るまで待つ
    async advance(ms) { for (let left = ms; left > 0; left -= 16) { clock.advance(Math.min(16, left)); for (let i = 0; i < 6; i++) await Promise.resolve(); } },
    metrics: () => metrics(),
    state: () => ({ mode: mode(), shown: !!st?.shown && cv?.style.display === 'block', dir: st?.dir, done: st?.done, released: st?.released, started: st?.started, f: st?.f, g: st?.g, vx: st?.vx,
      busy: !!st || blocking, failed, err: hook.lastError ?? null, lost: !!renderer?.lost, canvas: !!cv, opacity: cv?.style.opacity ?? '', textures: renderer?.textures.size ?? 0, land: renderer?.land ? { ...renderer.land } : null,
      stats: pages.stats(), dims: renderer?.dims ?? null, prepMs: st?.prepMs ?? null, lostCount: lostAt.length, reduced: reduced(), copy: !!copy, dpr: renderer?.dpr ?? null }),
    // 姿勢を置く（時間を使わない）。plain: 文字のない紙で作る。戻り値：{ f, shape }
    pose(dir, gy, f, o = {}) {
      const m = ensure(); begin(dir, [dir === 'forward' ? m.edge - 4 : m.lx0 + 30, gy], m); st.started = true; st.pose = true;
      for (const h of [...renderer.textures]) renderer.deleteTexture(h); // 前の姿勢の絵を捨てる
      if (o.dark) { renderer.dark = true; renderer.colors = { ...DARK, bg: DARK.paper, groove: DARK.paper }; }
      if (o.k) Object.assign(renderer.K, o.k); // この描画器だけの上書き（試験用。K 自体は凍結のまま）
      if (o.plain) {
        const D = pages.dims(), dpr = renderer.dpr, paper = renderer.colors.paper, mk = (w) => { const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(D.h * dpr); const x = c.getContext('2d'); x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height); return renderer.createTexture(c); };
        const T = { Lo: mk(D.lw), Ln: mk(D.lw), Ro: mk(D.rw), Rn: mk(D.rw), next: mk(D.rw) };
        renderer.setScene({ dir, ...T, front: dir === 'forward' ? T.Ro : T.Lo, frontRect: dir === 'forward' ? [D.spine, D.py0, D.edge, D.py1] : [D.lx0, D.py0, D.lx1, D.py1] }); st.shown = true; cv.style.opacity = ''; cv.style.display = 'block';
      } else if (!startCurl()) return null;
      st.f = clampF(st.s, st.g, f); draw(); return { f: st.f, shape: st.shape };
    },
    // 直前の姿勢をもう一度描いて、その場で画素を読む（rect は pt { x, y, w, h }）
    probe(rect) { draw(); return renderer ? renderer.readPixels(rect) : null; },
    redraw: draw,
    clear() { reset('clear'); },
    loseExt: null,
    loseContext() { hook.loseExt = renderer?.gl.getExtension('WEBGL_lose_context'); hook.loseExt?.loseContext(); },
    restoreContext() { hook.loseExt?.restoreContext(); },
    onLanded: null,
  };

  if (perf && curlPerfAuto()) perf.auto(curlPerfAuto());
  return {
    mode, usable, sync, reset, busy: () => !!st || blocking,
    cancel: (reason = 'cancel') => gest.cancel(reason), // 長押しで予定のドラッグになった／ほかの操作が始まった
    dispose() { disposed = true; reset('dispose'); perf?.dispose(); gest.dispose(); window.removeEventListener('pointerdown', blockTap, true); window.removeEventListener('click', blockTap, true); document.removeEventListener('visibilitychange', onVis); if (globalThis.__duoCurl === hook) delete globalThis.__duoCurl; },
  };
}
export * from './params.js';
export * from './geom.js';
