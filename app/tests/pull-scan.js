// 閉じた画面の文字の重なりを数える（R-71 の測り方。r71-overlap-scan.mjs と closed-pull-v20.spec.js で共通）。
// 見えている文字の箱（不透明度の積 > 0、overflow の祖先で切る、ほかの要素の下に隠れた中心は除く）を集め、交わる組を数える。
// 判定は tests/helpers.js の findTextOverlaps と同じしきい（見出しは 1px、ほかは 2px × 行の 30%）。それに「不透明度 > 0」を足した。
export const SCAN = () => {
  const vw = innerWidth, vh = innerHeight, items = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const text = n.nodeValue.trim(), el = n.parentElement;
    if (!text || !el || el.closest('script,style,[hidden],#status,[inert],dialog:not([open]),#kb-metrics')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1; for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity);
    if (op <= 0.01) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const r0 of rg.getClientRects()) {
      let r = { l: Math.max(r0.left, 0), t: Math.max(r0.top, 0), r: Math.min(r0.right, vw), b: Math.min(r0.bottom, vh) };
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none') { const ar = a.getBoundingClientRect(); r = { l: Math.max(r.l, ar.left), t: Math.max(r.t, ar.top), r: Math.min(r.r, ar.right), b: Math.min(r.b, ar.bottom) }; } }
      if (r.r - r.l < 1 || r.b - r.t < 1) continue;
      const zone = el.closest('.mgrid') ? 'grid' : el.closest('.mday') ? 'day' : el.closest('.mph,.weekdays,.mpfix') ? 'head' : el.closest('.tabs') ? 'tabs' : el.closest('.ctl,.rail,#rail') ? 'rail' : 'other';
      items.push({ ...r, n, text, zone, heading: !!el.closest('h1,h2,h3,.date,.mdh'), op: Math.round(op * 100) / 100 });
    }
  }
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.n === b.n) continue;
    if ((a.zone === 'tabs') !== (b.zone === 'tabs')) continue; // 浮くタブは別に数える（下の tabsOver）
    const ww = Math.min(a.r, b.r) - Math.max(a.l, b.l), hh = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (ww <= 0 || hh <= 0) continue;
    const minH = Math.min(a.b - a.t, b.b - b.t);
    if ((a.heading || b.heading) ? (ww > 1 && hh > 1) : (ww > 2 && hh > Math.max(3, minH * 0.3))) pairs.push(`${a.zone}:${a.text.slice(0, 12)} × ${b.zone}:${b.text.slice(0, 12)} (${ww.toFixed(1)}×${hh.toFixed(1)})`);
  }
  const tabsOver = items.filter((a) => a.zone === 'tabs').reduce((s, a) => s + items.filter((b) => b.zone !== 'tabs' && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3).length, 0);
  const g = document.querySelector('.mgrid')?.getBoundingClientRect(), d = document.querySelector('.mday')?.getBoundingClientRect(), mdh = document.querySelector('.mdh')?.getBoundingClientRect();
  const gridBelow = g ? items.filter((a) => a.zone === 'grid' && a.b > g.bottom + 0.5).length : null; // §4: 格子の文字が格子の下端より下に出ている数
  const dayAbove = d ? items.filter((a) => a.zone === 'day' && a.t < d.top - 0.5).length : null;
  const gridOverDay = mdh ? items.filter((a) => a.zone === 'grid' && a.b > mdh.top + 0.5 && a.t < mdh.bottom).length : null; // 日の見出しの帯にかかる格子の文字
  return { form: document.querySelector('.mpull')?.dataset.form, gridH: g ? Math.round(g.height * 10) / 10 : null, gridBottom: g ? Math.round(g.bottom * 10) / 10 : null, dayTop: d ? Math.round(d.top * 10) / 10 : null, mdhTop: mdh ? Math.round(mdh.top * 10) / 10 : null, n: pairs.length, pairs, tabsOver, gridBelow, dayAbove, gridOverDay };
};
