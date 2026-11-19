// 古い手書き（ノートの `ink`）を表示だけする（第19版 PR9。design/27 §4.5.2、開発責任者 11/18 20:51・20:56 の決定）。
// ink を読むだけで、書き換えない。点の列は SVG の線（墨・太さ 3）、data:image は画像。編集できない。
// 点の形: [x,y] / [x,y,p] / [x,y,p,t] / {x,y}、線は点の配列か { points }。座標が種類ごとの配列 { x:[], y:[] } も1本の線として読む。
const NS = 'http://www.w3.org/2000/svg';
const num = Number.isFinite;
const pt = (p) => (Array.isArray(p) ? (num(p[0]) && num(p[1]) ? [p[0], p[1]] : null) : p && num(p.x) && num(p.y) ? [p.x, p.y] : null);
const stroke = (s) => {
  const arr = Array.isArray(s) ? s : Array.isArray(s?.points) ? s.points : null;
  if (!arr) return null;
  const out = arr.map(pt).filter(Boolean);
  return out.length ? out : null;
};
const isImg = (v) => typeof v === 'string' && v.startsWith('data:image/');

// ink → { kind: 'strokes', strokes: [[[x,y],...]], refW } | { kind: 'image', src } | null
export function readInk(ink) {
  if (ink == null) return null;
  if (typeof ink === 'object') {
    let strokes = Array.isArray(ink.strokes) ? ink.strokes.map(stroke).filter(Boolean) : [];
    if (!strokes.length && Array.isArray(ink.x) && Array.isArray(ink.y)) {
      const s = ink.x.map((x, i) => pt([x, ink.y[i]])).filter(Boolean);
      if (s.length) strokes = [s];
    }
    if (strokes.length) {
      let xmax = 0; for (const s of strokes) for (const p of s) if (p[0] > xmax) xmax = p[0];
      const w = [ink.refW, ink.width].find((v) => num(v) && v > 0);
      return { kind: 'strokes', strokes, refW: w ?? Math.max(xmax, 342) };
    }
    const src = [ink.dataUrl, ink.src, ink.image].find(isImg);
    if (src) return { kind: 'image', src };
    return null;
  }
  return isImg(ink) ? { kind: 'image', src: ink } : null;
}

// 本文の幅 width に合わせた要素（描けるものが無ければ null）。倍率 s＝min(1, width/refW)、左寄せ。
export function inkElement(ink, width) {
  const r = readInk(ink);
  if (!r) return null;
  const box = document.createElement('div'); box.className = 'ned-ink'; box.setAttribute('aria-hidden', 'true');
  if (r.kind === 'image') {
    const img = document.createElement('img'); img.src = r.src; img.alt = ''; img.draggable = false;
    box.append(img);
    return box;
  }
  const s = Math.min(1, (width > 0 ? width : r.refW) / r.refW);
  let ymax = 0; for (const st of r.strokes) for (const p of st) if (p[1] > ymax) ymax = p[1];
  const h = Math.ceil((ymax + 3) * s);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(Math.ceil(r.refW * s))); svg.setAttribute('height', String(h));
  svg.dataset.scale = String(s);
  for (const st of r.strokes) {
    const pl = document.createElementNS(NS, 'polyline');
    pl.setAttribute('points', st.map((p) => `${p[0] * s},${p[1] * s}`).join(' '));
    pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', 'currentColor'); pl.setAttribute('stroke-width', String(3 * s));
    pl.setAttribute('stroke-linecap', 'round'); pl.setAttribute('stroke-linejoin', 'round');
    svg.append(pl);
  }
  box.append(svg);
  return box;
}
