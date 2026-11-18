// 実機の計測（第18版 PR5）。URL に curlperf=1 があるときだけ動く。無いときは import しても何もしない・何も出さない。
// 手順：design/CURLPERF_V18.md。出し方：画面隅の札＋「JSON をコピー」、window.__curlPerf、console.log('[curlperf]', JSON)。
// 速さの数字では合否を決めない（箱に GPU はない）。合否の線は JSON に入れるだけ。

export const curlPerfOn = () => { try { return new URLSearchParams(location.search).get('curlperf') === '1'; } catch { return false; } };
export const curlPerfAuto = () => { try { const n = parseInt(new URLSearchParams(location.search).get('auto'), 10); return n > 0 ? Math.min(n, 200) : 0; } catch { return 0; } };

// 合否の線（ms）。60Hz は計画の値。120Hz は連携 第15弾 9.1 の値（p95 9.5・p99 16.7・落ち 2%）。
export const LINES = {
  hz60: { p95: 18.0, p99: 33.4, dropRate: 0.01, longTasks: 0 },
  hz120: { p95: 9.5, p99: 16.7, dropRate: 0.02, longTasks: 0 },
};
export const ESTIMATE = { memoryMB: 58.1, basis: '高さ 603（連携手順書 8章の更新値）。見積もりで、実測ではない' };

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
function pct(sorted, q) { if (!sorted.length) return null; const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1)); return sorted[i]; }
function stat(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return { n: s.length, p50: r2(pct(s, 0.5)), p95: r2(pct(s, 0.95)), p99: r2(pct(s, 0.99)), max: r2(s.length ? s[s.length - 1] : null) };
}

// hooks: { root, metrics(), busy(), stats(), canvasBytes(), env() }
export function createPerf(h) {
  const t0 = performance.now();
  const S = { turns: [], first: [], tex: [], gaps: [], windows: [], long: [], lost: 0, phases: {}, maxBytes: 0, lastDir: null, auto: null };
  let down = null, sampling = false, rafId = 0, lastT = 0, longObs = null, longOk = false, badge = null, txt = null, pending = 0, disposed = false;

  try {
    longObs = new PerformanceObserver((list) => { for (const e of list.getEntries()) S.long.push({ s: e.startTime, d: e.duration }); });
    longObs.observe({ entryTypes: ['longtask'] }); longOk = true;
  } catch { longObs = null; }

  const mem = () => {
    const st = h.stats?.() || {}, pm = globalThis.performance?.memory;
    const m = { painterBytes: st.bytes ?? null, painterMaxBytes: st.maxBytes ?? null, canvasBytes: h.canvasBytes?.() ?? null, jsHeapUsed: pm ? pm.usedJSHeapSize : null, jsHeapTotal: pm ? pm.totalJSHeapSize : null };
    m.totalBytes = (m.painterBytes || 0) + (m.canvasBytes || 0); S.maxBytes = Math.max(S.maxBytes, m.totalBytes); return m;
  };
  const snap = (name) => { S.phases[name] = mem(); };
  const loop = (t) => { if (!sampling) return; if (lastT) S.gaps.push(t - lastT); lastT = t; rafId = requestAnimationFrame(loop); };
  function startSampling() { if (sampling) return; sampling = true; lastT = 0; S.windows.push({ s: performance.now(), e: null }); rafId = requestAnimationFrame(loop); }
  function stopSampling() { if (!sampling) return; sampling = false; cancelAnimationFrame(rafId); const w = S.windows[S.windows.length - 1]; if (w) w.e = performance.now(); }

  function report() {
    const gaps = S.gaps, med = pct([...gaps].sort((a, b) => a - b), 0.5), dropped = med ? gaps.filter((g) => g > 1.5 * med).length : 0;
    const frames = { ...stat(gaps), median: r2(med), dropped, dropRate: gaps.length ? r2(dropped / gaps.length) : null };
    const inWin = (e) => S.windows.some((w) => e.s >= w.s - 1 && e.s <= (w.e ?? Infinity));
    const longIn = S.long.filter(inWin), over50 = longIn.filter((e) => e.d > 50).length;
    const byDir = (d) => stat(S.first.filter((f) => f.dir === d).map((f) => f.ms));
    const group = (n) => (n === 'back' ? 'back' : n[0] === 'L' ? 'frontLeft' : 'frontRight');
    const tex = {}; for (const t of S.tex) { const g = group(t.name); (tex[g] ||= { paint: [], upload: [] }); tex[g].paint.push(t.paintMs); tex[g].upload.push(t.uploadMs); }
    const texOut = {}; for (const [g, v] of Object.entries(tex)) texOut[g] = { paintMs: stat(v.paint), uploadMs: stat(v.upload) };
    const pass = (L) => ({
      p95: frames.p95 != null && frames.p95 <= L.p95, p99: frames.p99 != null && frames.p99 <= L.p99,
      dropRate: frames.dropRate != null && frames.dropRate <= L.dropRate, longTasks: over50 <= L.longTasks,
    });
    const p60 = pass(LINES.hz60), p120 = pass(LINES.hz120);
    const env = h.env?.() || {};
    return {
      version: 1, at: new Date().toISOString(), elapsedMs: r2(performance.now() - t0),
      env: { dpr: devicePixelRatio, screen: { w: screen.width, h: screen.height, innerW: innerWidth, innerH: innerHeight }, reducedMotion: !!env.reduced, dark: !!env.dark, mode: env.mode ?? null, userAgent: navigator.userAgent },
      turns: S.turns.length, turnList: S.turns.slice(-60),
      firstFrameMs: { all: stat(S.first.map((f) => f.ms)), forward: byDir('forward'), backward: byDir('backward'), list: S.first.slice(-60).map((f) => ({ dir: f.dir, ms: r2(f.ms), y: f.y ?? null })) },
      textures: { byKind: texOut, prepareMs: stat(S.first.map((f) => f.prepMs).filter((v) => v != null)), count: S.tex.length },
      frames,
      longTasks: { supported: longOk, countInTurns: longIn.length, over50ms: over50, maxMs: r2(longIn.reduce((m, e) => Math.max(m, e.d), 0)) },
      memory: { phases: S.phases, maxTotalBytes: S.maxBytes, maxTotalMB: r2(S.maxBytes / 1000000), mbUnit: 1000000, estimate: ESTIMATE },
      contextLost: S.lost,
      auto: S.auto,
      lines: LINES,
      verdict: { hz60: { ...p60, ok: Object.values(p60).every(Boolean) }, hz120: { ...p120, ok: Object.values(p120).every(Boolean) }, note: '速さの数字は実機で見る。箱（GPU なし）の値は参考にならない' },
    };
  }
  function publish(log) {
    const r = report(); globalThis.__curlPerf = r;
    if (txt) {
      const v = r.verdict;
      txt.textContent = `curlperf ${r.turns}回 初コマ p50 ${r.firstFrameMs.all.p50 ?? '-'}ms\nrAF p95 ${r.frames.p95 ?? '-'} p99 ${r.frames.p99 ?? '-'} 落ち ${r.frames.dropRate == null ? '-' : Math.round(r.frames.dropRate * 1000) / 10 + '%'}\n長い処理 ${r.longTasks.over50ms} 消失 ${r.contextLost}\n60Hz ${v.hz60.ok ? 'OK' : 'NG'} / 120Hz ${v.hz120.ok ? 'OK' : 'NG'}${S.auto ? `\n自動 ${S.auto.done}/${S.auto.total}${S.auto.finished ? ' 終' : ''}` : ''}`;
    }
    if (log) console.log('[curlperf]', JSON.stringify(r));
    return r;
  }
  const later = () => { clearTimeout(pending); pending = setTimeout(() => publish(false), 200); };

  function mountBadge() {
    if (badge || disposed || !document.body) return;
    badge = document.createElement('div'); badge.id = 'curlperf'; badge.setAttribute('data-curlperf', '');
    badge.style.cssText = 'position:fixed;left:50%;bottom:2px;transform:translateX(-50%);z-index:2147483000;font:10px/1.25 ui-monospace,Menlo,monospace;color:#fff;background:rgba(20,20,20,.82);padding:3px 6px;border-radius:6px;white-space:pre;pointer-events:none;max-width:300px';
    txt = document.createElement('div'); txt.textContent = 'curlperf: めくり待ち';
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'JSON をコピー'; btn.setAttribute('data-curlperf-copy', '');
    btn.style.cssText = 'pointer-events:auto;margin-top:2px;font:10px system-ui;padding:1px 6px;border-radius:4px;border:0;background:#fff;color:#111';
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation(); const j = JSON.stringify(publish(true), null, 1);
      try { await navigator.clipboard.writeText(j); btn.textContent = 'コピーした'; }
      catch { const ta = document.createElement('textarea'); ta.value = j; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* 無理 */ } ta.remove(); btn.textContent = ok ? 'コピーした' : 'コピーできない（console を見て）'; }
      setTimeout(() => { btn.textContent = 'JSON をコピー'; }, 1500);
    });
    badge.append(txt, btn); document.body.appendChild(badge);
  }
  if (document.body) mountBadge(); else document.addEventListener('DOMContentLoaded', mountBadge, { once: true });
  setTimeout(() => publish(false), 0); // env() は createCurl の組み立てが終わってから読む

  // ---- 自動のめくり（指の代わりに PointerEvent を送る）----
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  async function waitIdle(limit = 3000) { const t = performance.now(); while (h.busy() && performance.now() - t < limit) await frame(); await wait(120); return !h.busy(); }
  function ev(type, x, y, target) {
    const e = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 91, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    (type === 'pointerdown' ? target : document).dispatchEvent(e);
  }
  async function oneTurn(dir, y) {
    const m = h.metrics(); if (!m) return false;
    const x0 = dir === 'forward' ? m.edge - 10 : m.lx0 + 36, x1 = dir === 'forward' ? m.lx1 - 20 : m.spine + 20, el = document.elementFromPoint(x0, y);
    if (!el) return false;
    const n0 = S.turns.length;
    ev('pointerdown', x0, y, el); await frame();
    if (!h.busy()) { ev('pointerup', x0, y); return false; }
    const steps = 16; // 約 16 コマで動かす（指の速さ ≒ 距離/0.27 秒）
    for (let i = 1; i <= steps; i++) { ev('pointermove', x0 + (x1 - x0) * i / steps, y); await frame(); }
    ev('pointerup', x1, y);
    await waitIdle();
    return S.turns.length > n0;
  }
  async function runAuto(n) {
    S.auto = { total: n * 2, done: 0, failed: 0, finished: false, requested: n };
    for (let i = 0; i < 100 && !h.metrics(); i++) await wait(100); // 見開きが出るまで待つ
    await wait(600);
    const m0 = h.metrics(); if (!m0) { S.auto.finished = true; S.auto.error = '今日＋明日の見開きが出ない'; publish(true); return; }
    const frac = [0.12, 0.5, 0.88]; // 上・真ん中・下
    for (const dir of ['forward', 'backward']) {
      for (let i = 0; i < n && !disposed; i++) {
        const m = h.metrics(); if (!m) break;
        let ok = false;
        for (let k = 0; k < 3 && !ok; k++) { const f = frac[(i + k) % 3], y = m.py0 + (m.py1 - m.py0) * f; ok = await oneTurn(dir, y); }
        if (ok) S.auto.done++; else S.auto.failed++;
        later();
      }
    }
    S.auto.finished = true; publish(true);
  }

  return {
    // pointerdown（触れた）。ここから最初のコマまでを測る
    down(dir) { down = { t: performance.now(), dir }; if (S.lastDir && S.lastDir !== dir) down.changed = true; snap('before'); },
    // 最初のコマを描き終えた（gl.finish で GPU まで待つ）。prep = painter.stats().last
    first(gl, prep, y) {
      if (!down) return;
      try { gl?.finish(); } catch { /* 失われた */ }
      const ms = performance.now() - down.t;
      S.first.push({ dir: down.dir, ms, prepMs: prep?.totalMs ?? null, y });
      for (const t of prep?.tex || []) S.tex.push(t);
      snap('during'); if (down.changed) snap('afterDirChange');
      S.lastDir = down.dir; startSampling();
    },
    // 後始末（絵・めくりを捨てた）
    end() {
      if (!sampling && !down) return;
      const shown = sampling; stopSampling(); snap('after');
      if (shown && down) S.turns.push({ dir: down.dir, firstMs: r2(S.first[S.first.length - 1]?.ms), gaps: S.gaps.length });
      down = null; later();
    },
    lost() { S.lost++; later(); },
    auto: runAuto,
    report, publish,
    dispose() { disposed = true; stopSampling(); longObs?.disconnect(); badge?.remove(); badge = null; if (globalThis.__curlPerf) delete globalThis.__curlPerf; },
  };
}
