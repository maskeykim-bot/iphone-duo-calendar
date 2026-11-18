// めくりの入口。
//  - createCurl({ root, metrics, pages, onTurn, swipe, canStart, enabled, reduced, native })：アプリへの組み込み（第18版 PR4）。
//    native：iOS のめくり（B、1段目の試作。native-curl.js の createNativeCurl）。native.on() のときは WebGL を使わず、離したらネイティブがめくる。
//  - createCurl({ canvas, dims, dpr, dark, colors, k, preserve, onLost, onRestored })：部品だけを組む（PR2。部品のテスト用）。
// ダークの判定（DARK.enabled && prefers-color-scheme:dark）を見るのはこのファイルだけ。DARK.enabled は false のまま（ページのダーク配色ができたら true）。

import { makeSet, clampF } from './geom.js';
import { CurlRenderer } from './renderer.js';
import { createGesture, judgeDone } from './gesture.js';
import { clock, createAnim, lift, runTurn, runSwap } from './landing.js';
import { DARK, LIGHT, JUDGE, TIME } from './params.js';
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
  const { root, metrics, pages, onTurn, swipe, canStart = () => true, enabled = () => true, reduced = () => false, native: nat = null } = opts;
  let renderer = null, cv = null, key = '', st = null, failed = false, blocking = false, resetting = false, disposed = false, copy = null;
  let anim = createAnim(), webgl = null; const lostAt = [];
  // ?curlperf=1 のときだけ計測（js/curl/perf.js）。無いときは null で、下の perf?. は何もしない
  const perf = curlPerfOn() ? createPerf({ root, metrics, busy: () => !!st || blocking, stats: () => pages.stats(), canvasBytes: () => (cv ? cv.width * cv.height * 4 : 0), env: () => ({ reduced: reduced(), dark: curlDark(), mode: mode() }) }) : null;
  const dprNow = () => opts.dpr || Math.min(3, window.devicePixelRatio || 1);
  const usable = () => !failed && (webgl ??= webglAvailable());
  // iOS のめくり（B）で動かすか。視差効果を減らす・古い DuoNative・この起動で失敗したときは A（下の mode）
  const natOn = () => !!nat?.on() && !reduced();
  // 'curl'（紙をめくる）| 'native'（iOS のめくり B）| 'reduce'（視差効果を減らす：入れ替え）| 'slide'（WebGL なし・失敗：今の横すべり）
  const mode = () => (reduced() ? 'reduce' : natOn() ? 'native' : usable() && !renderer?.lost ? 'curl' : 'slide');
  const mark = (on) => { if (on) document.documentElement.dataset.curling = '1'; else delete document.documentElement.dataset.curling; };
  const hide = () => { if (cv) { cv.style.display = 'none'; cv.style.opacity = ''; } };

  function teardown() { // 動き・絵・網目・canvas を全部捨てる（次に要るとき作り直す）
    if (st?.native) { nat.shadeOff(false); if (st.released && st.done) nat.cancel('reset'); } // B：めくっている途中なら、重ねた紙をすぐ外す
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
    // k：紙の端はページの端からめくり始め、指の動き×k で動く（18.2）。指が押した所から反対側の端（前へ＝左ページの左端、戻り＝右ページの右端）まで動けば
    // 紙がめくり切れる倍率。辺から押せば 1（今まで通り）、中ほど・反対の端から押すほど大きく（上限 kMax）
    const land = 2 * s.spine - s.edge, reach = s.sgn > 0 ? p[0] - Math.max(m.lx0, 20) : m.edge - p[0];
    const k = Math.min(JUDGE.kMax, Math.max(1, Math.abs(s.edge - land) / Math.max(1, reach)));
    st = { dir, s, g: [s.edge, gy], start: p, down: p, k, liftOff: 0, f: [s.edge, gy], started: false, moved: false, released: false, done: false, m };
  }
  const draw = () => { if (st && renderer && !renderer.lost) st.shape = renderer.draw(st.g, st.f); };
  function prepareCurl() { // 触れた向きの絵だけを作る（pointerdown）。まだ見せない
    const t0 = performance.now(), scene = pages.prepare(st.dir);
    if (renderer.lost) return false;
    if (!['Lo', 'Ln', 'Ro', 'Rn', 'front', 'next'].every((k) => scene[k]?.t) || renderer.gl.getError()) { fail(); return false; } // テクスチャの作成に失敗 → 横すべりへ
    renderer.setScene(scene); st.prepMs = performance.now() - t0; st.ready = true; return true;
  }
  function showCurl() {
    if (!st?.ready || st.shown || renderer.lost) return false;
    st.shown = true; cv.style.opacity = ''; cv.style.display = 'block'; draw(); perf?.first(renderer.gl, pages.stats().last, st.g[1]); return true;
  }
  function startCurl() { return prepareCurl() && showCurl(); }
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
  // ---- iOS のめくり（B、1段目）。指は Web が持ち、離したら turnPage → 下を着地後の DOM に → rAF 2回 → webReady → ネイティブがめくる ----
  const raf2 = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  function startNative(dir, p, m) { begin(dir, p, m); st.native = true; st.started = true; st.moved = true; blocking = true; mark(true); nat.prepare(m); }
  async function finishNative(done) {
    const cur = st; if (!cur || cur.released) return;
    cur.released = true; cur.done = done; const a = anim, dirN = cur.dir === 'forward' ? 1 : -1, m = cur.m;
    if (!done) { nat.shadeOff(true); cleanup(); return; } // 境目を越えずに離した：帯を 0.15 秒で消し、何も起こさない
    nat.shadeOff(false);
    let shown = false;
    try { shown = !!(await nat.show(cur.dir, m))?.ok; } catch (e) { nat.fail(e); }
    if (a.dead || st !== cur) { if (shown) nat.cancel('reset'); return; }
    if (!shown) { nat.fail({ code: 'NOT_SHOWN' }); await swapTurn(true, dirN, a); return; } // 紙を出せなかった：この1回は 0.15 秒の入れ替えで進め、この起動の間は A
    // 紙（めくるページ全体）と覆い（動かない側＝着地先のページ）が本物のページの上に出た。画面はこのまま止まって見える。
    // 決定 F：日は進めず、A の 18.2 と同じ描き方（painter）で着地先のページを「保存しない仮の表示」として覆いの下に出し、撮る（紙の裏）
    const tmp = makeTemp(cur.dir, m);
    await raf2();
    if (a.dead || st !== cur) { tmp?.remove(); nat.cancel('reset'); return; }
    let back = null;
    if (tmp) { try { back = await nat.back(cur.dir, m); } catch (e) { back = null; hook.lastBackError = e?.code || e?.message || 'error'; } }
    tmp?.remove(); cur.backOk = !!back?.ok; cur.backMs = back?.ms ?? null;
    if (a.dead || st !== cur) { nat.cancel('reset'); return; } // 途中でやめた：仮の表示を外しただけ。日も選んだ日も保存も変わっていない
    // めくりが決まった：本物の DOM を ±2 日に（覆いと紙の下。めくった下には次の日が透けて見える）
    onTurn(dirN);
    await raf2();
    if (a.dead || st !== cur) { nat.cancel('reset'); return; }
    // ネイティブがめくり、終わったら紙と覆いを 0.15 秒で薄くして外す（下はもう着地後の本物のページ。左の帯の入れ替えはしない）
    try { await nat.go(cur.dir); } catch (e) { nat.fail(e); nat.cancel('error'); }
    if (a.dead || st !== cur) return;
    await new Promise((res) => setTimeout(res, TIME.fade + 20));
    if (st === cur) cleanup();
  }
  // 着地先のページ（進む＝次の左 D+2、戻る＝次の右 D−1）を painter で描いた絵。覆いの下（同じ位置）に置く。DOM・日付・保存には触らない
  function makeTemp(dir, m) {
    try {
      const fwd = dir === 'forward', n = pages.need(dir), spec = fwd ? n.Ln : n.Rn;
      const c = pages.canvas(spec.day, spec.kind, Math.min(3, window.devicePixelRatio || 1));
      const x = fwd ? m.lx0 : m.spine, w = fwd ? m.lx1 - m.lx0 : m.edge - m.spine;
      c.className = 'curltemp'; c.setAttribute('aria-hidden', 'true');
      Object.assign(c.style, { position: 'fixed', left: `${x}px`, top: `${m.py0}px`, width: `${w}px`, height: `${m.py1 - m.py0}px`, zIndex: '60', pointerEvents: 'none' });
      document.body.appendChild(c); hook.lastTemp = { day: spec.day, kind: spec.kind, x, w };
      return c;
    } catch (e) { hook.lastTemp = { error: e?.message || String(e) }; return null; }
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
    onDown(g) { // 辺 24 に触れたときだけ、すぐ絵を作って角を持ち上げる。それ以外は向きが決まってから（タップ・縦スクロールのたびに絵を作らない）
      perf?.down(g.dir);
      if (natOn()) { const m = metrics(); if (m) nat.prepare(m); return; } // B：触れた瞬間に左右2ページを撮る（描き直していなければ使い回す）。角は持ち上げない
      if (!g.lift) return;
      let m = null; try { m = mode() === 'reduce' ? metrics() : ensure(); } catch (e) { fail(e); return; }
      if (!m) return;
      begin(g.dir, g.down, m);
      if (mode() === 'reduce') return;
      try { if (!prepareCurl()) return; showCurl(); } catch (e) { fail(e); return; }
      lift(ctx(), anim); // 辺 24pt に触れたら 0.10 秒で角を少し持ち上げる（§6.1）
    },
    onStart(g, p) {
      if (!st && natOn()) { const m = metrics(); if (!m) return; swipe?.cancel(); startNative(g.dir, g.down, m); return; }
      if (st && st.dir !== g.dir) { anim.cancel(); anim = createAnim(); hide(); try { pages.release(); } catch { /* 捨てるだけ */ } st = null; } // 辺で持ち上げた向きと逆へ動かした
      if (!st) {
        let m = null; try { m = mode() === 'reduce' ? metrics() : ensure(); } catch (e) { fail(e); return; }
        if (!m) return;
        begin(g.dir, g.down, m);
        if (mode() !== 'reduce') { try { if (!prepareCurl()) { st = null; return; } } catch (e) { fail(e); return; } }
      }
      swipe?.cancel();
      st.liftOff = Math.abs(st.f[0] - st.g[0]); // 持ち上げていた分はそのまま続ける（決めた瞬間に紙が落ちない）
      st.started = true; st.moved = true; blocking = true; mark(true);
      if (mode() !== 'reduce' && !st.shown) { try { showCurl(); } catch (e) { fail(e); } }
    },
    onMove(g, p) {
      if (!st || !st.started) return;
      const s = st.s, f = [st.g[0] - s.sgn * st.liftOff + (p[0] - st.down[0]) * st.k, st.g[1] + (p[1] - st.down[1])];
      st.f = clampF(s, st.g, f); st.vx = g.vx;
      if (st.native) { nat.shadeAt(st.dir, st.m, p[0] - st.down[0], judgeDone(s, st.f[0], 0)); return; } // B：紙は指に付かない。外の端に陰の帯（境目を越えたら濃く）
      if (!reduced()) draw();
    },
    onEnd(g, p) {
      if (!st) return; st.vx = g.vx;
      const vx = Math.abs(p[0] - st.down[0]) >= JUDGE.flickMinPx ? g.vx : 0; // ほんの少し動かして離しただけを払いとみなさない
      const done = judgeDone(st.s, st.f[0], vx) || !!g.quick;
      if (st.native) finishNative(done); else finishTurn(done);
    },
    onAbort(g, reason) { if (resetting || !st || st.released) return; if (st.native) finishNative(false); else finishTurn(false); },
  });
  // めくっている間（離したあとの動き）は他のタップを止める
  const blockTap = (ev) => { if (blocking && st?.released && ev.target instanceof Node && (root.contains(ev.target) || ev.type === 'click')) { ev.stopPropagation(); ev.preventDefault(); } };
  window.addEventListener('pointerdown', blockTap, true); window.addEventListener('click', blockTap, true);
  const onVis = () => { if (document.hidden) { reset('hidden'); if (nat?.held()) nat.release(); } }; // 裏に回った：B の撮った絵も捨てる
  document.addEventListener('visibilitychange', onVis);

  // 幅の変化・回転・閉じた・型を変えた・見開きでなくなった・隠れた：止めて（途中なら元に戻す・日は進めない）、絵・網目・canvas を全部捨てる
  function reset(reason = 'reset') { resetting = true; try { gest.cancel(reason); } finally { resetting = false; } teardown(); }
  function sync() { const m = metrics(); if (!m) { if (nat?.held() && !st) nat.release(); if (renderer || st || copy) reset('gone'); return; } if (renderer && key !== keyOf(m, dprNow())) reset('size'); }

  // ---- テスト用の口（アプリの見た目には影響しない）----
  const hook = globalThis.__duoCurl = {
    clock,
    manual(v) { clock.manual = !!v; clock.t = performance.now(); clock.q = []; },
    // ms 進める。16ms のコマごとに、続きの処理（await のあとの tween）が走るまで待つ
    async advance(ms) { for (let left = ms; left > 0; left -= 16) { clock.advance(Math.min(16, left)); for (let i = 0; i < 6; i++) await Promise.resolve(); } },
    metrics: () => metrics(),
    state: () => ({ mode: mode(), shown: !!st?.shown && cv?.style.display === 'block', dir: st?.dir, done: st?.done, released: st?.released, started: st?.started, f: st?.f, g: st?.g, vx: st?.vx,
      busy: !!st || blocking, failed, err: hook.lastError ?? null, lost: !!renderer?.lost, canvas: !!cv, opacity: cv?.style.opacity ?? '', textures: renderer?.textures.size ?? 0, land: renderer?.land ? { ...renderer.land } : null,
      mapW: renderer?.mapW ?? null, stats: pages.stats(), dims: renderer?.dims ?? null, prepMs: st?.prepMs ?? null, lostCount: lostAt.length, reduced: reduced(), copy: !!copy, dpr: renderer?.dpr ?? null,
      native: !!st?.native, shade: nat?.shadeState?.() ?? null }),
    // B を指なしで1回めくる（実機・シミュレータの確認用）。dir: 'forward' | 'backward'
    async nativeTurn(dir = 'forward') {
      if (!natOn() || st || copy) return false; const m = metrics(); if (!m) return false;
      startNative(dir, [dir === 'forward' ? m.edge - 40 : m.lx0 + 60, (m.py0 + m.py1) / 2], m);
      await finishNative(true); return true;
    },
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
