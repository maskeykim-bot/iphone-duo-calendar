// ページの絵 painter（第18版 PR3）。「今日＋明日」の1日ページ（PR1 の dayPage）を canvas 2D に描き、めくりのテクスチャにする。
// 位置は見えている DOM の各行の getBoundingClientRect から読む（手で足した補正は使わない）。
// まだ DOM にない日（めくった先の2日）は、同じ dayPage の HTML を画面の外へ一時的に置いて測り、すぐ外す。
// 中身（予定・終日・ノート・六曜・祝日）は dayPage が本物のデータから作った DOM をそのまま読む（六曜オフ・祝日赤オフ・+N・「…」も DOM と同じ）。
import { LIGHT } from './params.js';

export const FRONT_DPR = 3; // 表（決定：3 固定。テストでは引数で変える）
export const BACK_DPR = 2;  // 裏
const ELLIPSIS = '…';
const snapY = (y, dpr) => Math.round(y * dpr) / dpr; // canvas の y は Math.round(y*dpr)/dpr

const isScrollClip = (cs) => /^(hidden|auto|scroll|clip)$/.test(cs.overflowX) || /^(hidden|auto|scroll|clip)$/.test(cs.overflowY);
const inter = (a, b) => (a ? { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) } : b);
const num = (v) => parseFloat(v) || 0;

// ---- DOM → 描く命令（ページ左上を原点にした pt）----
function collect(page, colors) {
  const P = page.getBoundingClientRect(), ops = [];
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - P.left, t: r.top - P.top, r: r.right - P.left, b: r.bottom - P.top, w: r.width, h: r.height }; };
  // el の外側の切り抜き（overflow が hidden/auto/clip の祖先の内側。includeSelf なら el 自身も）
  const clipOf = (el, includeSelf) => {
    let c = null;
    for (let e = includeSelf ? el : el.parentElement; e && e !== page.parentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (isScrollClip(cs)) { const r = rectOf(e); c = inter(c, { l: r.l + num(cs.borderLeftWidth), t: r.t + num(cs.borderTopWidth), r: r.r - num(cs.borderRightWidth), b: r.b - num(cs.borderBottomWidth) }); }
      if (e === page) break;
    }
    return c;
  };
  const radiusOf = (cs) => num(cs.borderTopLeftRadius);
  const fillBox = (el, clip) => {
    const cs = getComputedStyle(el), bg = cs.backgroundColor;
    if (!bg || bg === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(bg)) return;
    ops.push({ k: 'box', r: rectOf(el), color: bg, rad: radiusOf(cs), clip });
  };
  // 左の細い帯（box-shadow: inset 4px 0 0 色）
  const stripe = (el, clip) => {
    const cs = getComputedStyle(el), m = /^(.*?)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?\s+inset$|^inset\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?\s+(.*)$/.exec(cs.boxShadow.trim());
    if (!m) return;
    const color = m[1] ?? m[10], dx = num(m[2] ?? m[6]);
    if (dx > 0) ops.push({ k: 'stripe', r: rectOf(el), w: dx, color, rad: radiusOf(cs), clip });
  };
  // 文字：1文字ずつ DOM の位置（Range の矩形）に置く。省略（text-overflow:ellipsis）は DOM と同じく「…」に置き換える
  const texts = (root) => {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const s = n.data; if (!s.trim()) continue;
      const el = n.parentElement, cs = getComputedStyle(el);
      const clip = clipOf(n.parentElement, true);
      let ell = null; // 省略の右端
      for (let e = el; e && e !== page.parentElement; e = e.parentElement) { const c2 = getComputedStyle(e); if (c2.textOverflow === 'ellipsis' && isScrollClip(c2)) { const r = rectOf(e); ell = r.r - num(c2.borderRightWidth) - num(c2.paddingRight); break; } if (e === page) break; }
      const rg = document.createRange(), cl = []; let off = 0;
      for (const ch of s) {
        rg.setStart(n, off); rg.setEnd(n, off + ch.length); off += ch.length;
        const r = rg.getBoundingClientRect();
        if (r.width === 0 && cl.length) { cl[cl.length - 1].s += ch; continue; } // 結合文字・折りたたまれた空白
        if (r.width === 0 && r.height === 0) continue;
        cl.push({ s: ch, x: r.left - P.left, t: r.top - P.top, w: r.width, h: r.height });
      }
      // 行ごとに（t が同じ）
      const lines = []; for (const g of cl) { const L = lines[lines.length - 1]; if (L && Math.abs(L[0].t - g.t) < 2) L.push(g); else lines.push([g]); }
      const font = { style: cs.fontStyle, weight: cs.fontWeight, size: cs.fontSize, family: cs.fontFamily, color: cs.color };
      for (const L of lines) {
        if (ell != null) {
          const last = L[L.length - 1];
          if (last.x + last.w > ell + 0.01) { ops.push({ k: 'ell', glyphs: L, limit: ell, font, clip }); continue; } // はみ出す → 入る所までと「…」
        }
        ops.push({ k: 'text', glyphs: L, font, clip });
      }
    }
  };
  const svgs = (root) => root.querySelectorAll('svg').forEach((sv) => {
    const p = sv.querySelector('path'); if (!p) return;
    const vb = (sv.getAttribute('viewBox') || '0 0 12 12').split(/\s+/).map(Number);
    ops.push({ k: 'svg', r: rectOf(sv), d: p.getAttribute('d'), vb, color: getComputedStyle(sv).color, clip: clipOf(sv, false) });
  });
  const dph = page.querySelector('.dph'), dev = page.querySelector('.dev'), grip = page.querySelector('.dgrip i'), note = page.querySelector('.dnote');
  // 見出し：日付・祝日名・六曜（六曜オフ・祝日赤オフは DOM がそのまま反映）
  if (dph) texts(dph);
  if (dev) {
    // 終日
    dev.querySelectorAll('.allday').forEach((ad) => {
      ad.querySelectorAll('.adpill').forEach((el) => fillBox(el, clipOf(el, false)));
      texts(ad);
    });
    // 時間軸
    dev.querySelectorAll('.tl').forEach((tl) => {
      const tc = clipOf(tl, true);
      tl.querySelectorAll('.hl').forEach((el) => { const cs = getComputedStyle(el), w = num(cs.borderTopWidth); if (w > 0) ops.push({ k: 'hline', r: rectOf(el), color: cs.borderTopColor, dotted: cs.borderTopStyle === 'dotted', clip: tc }); });
      tl.querySelectorAll('.hlab').forEach((el) => texts(el));
      tl.querySelectorAll('.tlev').forEach((el) => { const c = clipOf(el, false); fillBox(el, c); stripe(el, c); texts(el); svgs(el); });
      tl.querySelectorAll('.nowl:not([hidden])').forEach((el) => {
        const cs = getComputedStyle(el, '::before'), r = rectOf(el);
        if (cs.content !== 'none') ops.push({ k: 'box', r: { l: r.l + num(cs.left), t: r.t + num(cs.top), r: r.l + num(cs.left) + num(cs.width), b: r.t + num(cs.top) + num(cs.height) }, color: cs.backgroundColor, rad: 0, clip: tc });
        el.querySelectorAll('.nowt').forEach((t) => fillBox(t, tc));
        texts(el);
      });
    });
    // 一覧（予定欄が 160 未満のとき）
    dev.querySelectorAll('.dlrow').forEach((row) => { const c = clipOf(row, false); row.querySelectorAll('.agbar').forEach((b) => fillBox(b, c)); texts(row); svgs(row); });
    dev.querySelectorAll('.dnone').forEach((el) => texts(el));
  }
  if (grip) fillBox(grip, clipOf(grip, false));
  if (note) {
    const r = rectOf(note), c = clipOf(note.firstElementChild || note, false);
    for (let y = r.t + 29; y < r.b; y += 30) ops.push({ k: 'rule', x: r.l, w: r.w, y, color: colors.line, clip: { l: r.l, t: r.t, r: r.r, b: r.b } });
    texts(note);
  }
  return { w: P.width, h: P.height, ops };
}

// ---- 命令 → canvas ----
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else ctx.rect(x, y, w, h); }
function paintOps(ctx, cmd, { dpr, colors }) {
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.fillStyle = colors.paper; ctx.fillRect(0, 0, cmd.w, cmd.h);
  ctx.textBaseline = 'alphabetic';
  const Y = (y) => snapY(y, dpr);
  for (const op of cmd.ops) {
    ctx.save();
    if (op.clip) { ctx.beginPath(); ctx.rect(op.clip.l, Y(op.clip.t), op.clip.r - op.clip.l, Y(op.clip.b) - Y(op.clip.t)); ctx.clip(); }
    if (op.k === 'box' || op.k === 'stripe') {
      const r = op.r, y0 = Y(r.t), y1 = Y(r.b);
      ctx.fillStyle = op.color; rr(ctx, r.l, y0, r.r - r.l, y1 - y0, op.rad);
      if (op.k === 'box') ctx.fill();
      else { ctx.clip(); ctx.fillRect(r.l, y0, op.w, y1 - y0); }
    } else if (op.k === 'hline') {
      const y = Y(op.r.t); ctx.fillStyle = op.color;
      if (op.dotted) for (let x = op.r.l; x < op.r.r; x += 2) ctx.fillRect(x, y, Math.min(1, op.r.r - x), 1); else ctx.fillRect(op.r.l, y, op.r.r - op.r.l, 1);
    } else if (op.k === 'rule') {
      ctx.fillStyle = op.color; ctx.fillRect(op.x, Y(op.y), op.w, 1);
    } else if (op.k === 'svg') {
      const r = op.r; ctx.translate(r.l, Y(r.t)); ctx.scale((r.r - r.l) / op.vb[2], (r.b - r.t) / op.vb[3]); ctx.fillStyle = op.color; ctx.fill(new Path2D(op.d));
    } else { // text / ell
      const f = op.font; ctx.font = `${f.style} ${f.weight} ${f.size} ${f.family}`; ctx.fillStyle = f.color;
      const asc = Math.round(ctx.measureText('あ').fontBoundingBoxAscent ?? num(f.size) * 0.88);
      let gs = op.glyphs;
      if (op.k === 'ell') { // 右端 limit に「…」が入るまで後ろから削る
        const ew = ctx.measureText(ELLIPSIS).width; let n = gs.length;
        while (n > 0 && gs[n - 1].x + gs[n - 1].w + ew > op.limit + 0.01) n--;
        gs = gs.slice(0, n); const last = gs[gs.length - 1] || op.glyphs[0];
        gs = [...gs, { s: ELLIPSIS, x: gs.length ? last.x + last.w : last.x, t: last.t, w: ew, h: last.h }];
      }
      for (const g of gs) { if (g.s.trim() === '') continue; ctx.fillText(g.s, g.x, Y(g.t + asc)); }
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---- painter ----
// opts: {
//   shell: () => 今日＋明日の見開き（.shell.spread.tt）の要素 or null,
//   dayHtml: (side 'left'|'right', dayKey) => dayPage の HTML,
//   selected: () => 今の左の日（'YYYY-MM-DD'）, addDays: (key, n) => key,
//   scrollTop: () => 時間軸の共通のスクロール位置（画面外に置くページも同じにする）,
//   afterMount: (host) => 画面外のページへ後から足す処理（現在時刻の線など。省略可）,
//   renderer: CurlRenderer（createTexture / deleteTexture を持つ）。無いときは canvas だけ作れる,
//   dpr: { front, back }（既定 3 / 2）, colors }
export function createPainter(opts) {
  const dprs = { front: opts.dpr?.front ?? FRONT_DPR, back: opts.dpr?.back ?? BACK_DPR };
  const colors = { ...LIGHT, ...(opts.colors || {}) };
  const st = { made: 0, freed: 0, bytes: 0, maxBytes: 0, live: [], last: null };
  let renderer = opts.renderer || null;

  const livePages = () => { const sh = opts.shell(); return sh ? { L: sh.querySelector('.dpage.lp'), R: sh.querySelector('.dpage.rp'), sh } : null; };
  // 寸法（アプリ座標 pt）。見えている左右ページの矩形から読む
  function dims() {
    const lp = livePages(); if (!lp || !lp.L || !lp.R) return null;
    const a = lp.L.getBoundingClientRect(), b = lp.R.getBoundingClientRect();
    return { lx0: a.left, lx1: a.right, spine: b.left, edge: b.right, py0: a.top, py1: a.bottom, lw: a.width, rw: b.width, h: a.height };
  }
  // 命令の集まりを作る。specs = [{ key, day, kind:'L'|'R' }]。見えているページはそのまま、無い日は画面外に置いて測る
  function measure(specs) {
    const lp = livePages(); if (!lp) throw new Error('今日＋明日の見開きがありません');
    const out = new Map(), need = [];
    for (const s of specs) {
      const el = (s.kind === 'L' ? lp.L : lp.R);
      if (el && el.dataset.day === s.day) out.set(s.key, collect(el, colors)); else need.push(s);
    }
    if (need.length) {
      const sh = lp.sh, host = document.createElement('div');
      host.className = sh.className; host.setAttribute('style', sh.getAttribute('style') || '');
      host.setAttribute('aria-hidden', 'true'); host.inert = true;
      host.style.cssText += ';visibility:hidden;pointer-events:none;z-index:-1';
      host.innerHTML = need.map((s) => opts.dayHtml(s.kind === 'L' ? 'left' : 'right', s.day)).join('');
      sh.parentNode.insertBefore(host, sh); // body 直下でなく同じ親（CSS の祖先条件をそろえる）。測ったらすぐ外す
      try {
        opts.afterMount?.(host);
        const top = opts.scrollTop?.() ?? 0;
        host.querySelectorAll('.tl').forEach((t) => { t.scrollTop = top; });
        const pages = host.querySelectorAll('.dpage');
        need.forEach((s, i) => out.set(s.key, collect(pages[i], colors)));
      } finally { host.remove(); }
    }
    return out;
  }
  function paint(cmd, dpr) {
    const c = document.createElement('canvas'); c.lang = 'ja'; c.width = Math.round(cmd.w * dpr); c.height = Math.round(cmd.h * dpr);
    const ctx = c.getContext('2d'); try { ctx.lang = 'ja'; } catch { /* 未対応 */ }
    paintOps(ctx, cmd, { dpr, colors }); return c;
  }
  // 1枚の絵（canvas）。テストと、テクスチャの元
  function canvas(day, kind, dpr = dprs.front) { return paint(measure([{ key: 'p', day, kind }]).get('p'), dpr); }
  // 向き dir（'forward'＝2日進む／'backward'＝2日戻る）で要る5枚。前は今の左・次の左・今の右・次の右・裏（表は front 用の絵を今の右／今の左と共有）
  function need(dir) {
    const d = opts.selected(), a = (n) => opts.addDays(d, n), fwd = dir === 'forward';
    return {
      Lo: { day: d, kind: 'L', dpr: dprs.front }, Ln: { day: a(fwd ? 2 : -2), kind: 'L', dpr: dprs.front },
      Ro: { day: a(1), kind: 'R', dpr: dprs.front }, Rn: { day: a(fwd ? 3 : -1), kind: 'R', dpr: dprs.front },
      // 裏（第18.2版）：めくる紙の裏は、着地したときに見えるページそのもの＝次の左（前へ）／次の右（戻り）の絵を使う（別の絵は作らない）
      front: fwd ? 'Ro' : 'Lo', // めくる紙の表
    };
  }
  const free = () => { // 作ってある絵を全部捨てる（GPU から先に消す）
    for (const h of st.live) { renderer?.deleteTexture(h); st.freed++; st.bytes -= h.bytes; }
    st.live = [];
  };
  // 向きの絵を作る。前の絵は先に捨てる。返す：renderer.setScene に渡す scene
  function prepare(dir) {
    if (!renderer) throw new Error('renderer がありません');
    free();
    const tp = performance.now(), D = dims(), n = need(dir), names = ['Lo', 'Ln', 'Ro', 'Rn'], lastTex = [];
    const cmds = measure(names.map((k) => ({ key: k, day: n[k].day, kind: n[k].kind })));
    const T = {};
    for (const k of names) {
      const tk = performance.now(), c = paint(cmds.get(k), n[k].dpr), paintMs = performance.now() - tk, h = renderer.createTexture(c);
      lastTex.push({ name: k, paintMs, uploadMs: h.ms }); // 計測用（?curlperf=1 が読む）
      h.bytes = c.width * c.height * 4; h.name = k; st.live.push(h); st.made++; st.bytes += h.bytes; T[k] = h;
      c.width = c.height = 0; // 2D の側のメモリは GPU へ送ったらすぐ返す
    }
    st.maxBytes = Math.max(st.maxBytes, st.bytes);
    st.last = { totalMs: performance.now() - tp, tex: lastTex };
    const fwd = dir === 'forward';
    return { dir, Lo: T.Lo, Ln: T.Ln, Ro: T.Ro, Rn: T.Rn, front: T[n.front], next: fwd ? T.Ln : T.Rn,
      frontRect: fwd ? [D.spine, D.py0, D.edge, D.py1] : [D.lx0, D.py0, D.lx1, D.py1],
      backRect: fwd ? [D.lx0, D.py0, D.lx1, D.py1] : [D.spine, D.py0, D.edge, D.py1] }; // 裏の絵（next）が着地後に置かれる矩形
  }
  return {
    dims, need, canvas, prepare, release: free,
    setRenderer(r) { if (r !== renderer) { free(); renderer = r; } },
    stats: () => ({ made: st.made, freed: st.freed, live: st.live.length, bytes: st.bytes, maxBytes: st.maxBytes, last: st.last, dpr: { ...dprs } }),
    dispose() { free(); renderer = null; },
  };
}
