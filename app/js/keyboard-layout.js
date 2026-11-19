// 第16版 PR34: キーボードの上端（kbTop）と折り目の溝に合わせた入力欄・本文の配置（純粋関数）。
// 座標はすべて layout viewport の CSS px。機種の固定 y は持たず、実際の kbTop・溝の矩形から出す。角度は使わない。
// 溝 = [top, bottom]。上面は溝の上 MARGIN まで、下面は溝の下 MARGIN から。

export const MARGIN = 8;     // 溝の上下に空ける余白
export const ADD_H = 48;     // タスク追加欄
export const ASSIST_HIT = 44; // 補助列の当たり
export const ASSIST_VIS_MIN = 36;
export const ADD_GAP = 8;    // 追加欄の下端とキーボードの間（0〜8pt）
export const ASSIST_GAP = 4; // 補助列と追加欄の間
export const REST_MIN = 44;  // 下面に残す一覧の最低の高さ
export const STRIP_MIN = 36; // ノートの「ほかのノート」1 行の最低の高さ（当たりは ::before で 44）
export const GRAY = '#CFD3D8';

const fin = (n) => typeof n === 'number' && Number.isFinite(n);

// visualViewport 相当 → kbTop（offsetTop + height）。拡大中・不正値は null。
export function kbTopOf(vv, innerHeight) {
  if (!vv || !fin(vv.height)) return null;
  if ((vv.scale ?? 1) > 1.01) return null;
  const top = fin(vv.offsetTop) ? Math.max(0, vv.offsetTop) : 0;
  const v = top + vv.height;
  return fin(innerHeight) ? Math.min(v, innerHeight) : v;
}

// 溝の上下。実矩形（横軸の region）があればそれ、なければ高さの中央 ±8.5。
export function hingeBand({ rect = null, axis = null, height }) {
  if (rect && fin(rect.y) && fin(rect.height) && rect.height >= 0 && axis !== 'vertical' && rect.width > rect.height) return { top: rect.y, bottom: rect.y + rect.height, real: true };
  const c = height / 2;
  return { top: c - 8.5, bottom: c + 8.5, real: false };
}

const overlap = (a0, a1, b0, b1) => a0 < b1 && a1 > b0;

// 入力欄（タスク追加欄 or ノート補助）と補助列の置き場を決める。
//  H: レイアウト高さ  kbTop: キーボード上端（null/H 以上＝キーボードなし）  hinge: {top,bottom}
//  top: 本文の最上端（見出しの下）  hasAdd: 追加欄があるか（タスク）
// 返り値は上面の一覧／本文の矩形 up、下面の矩形 dn（なければ null）、追加欄 add、補助 assist。
export function computeKbLayout({ H, kbTop, hinge, top = 0, hasAdd = true, restMin = REST_MIN } = {}) {
  const kb = fin(kbTop) && kbTop < H - 1 ? kbTop : null;
  const g0 = hinge.top, g1 = hinge.bottom;
  const upBottom = g0 - MARGIN, dnTop = g1 + MARGIN;
  const bottom = kb ?? H;
  let add = null, addTop = 0;
  if (hasAdd) {
    let t = bottom - ADD_GAP - ADD_H, b = bottom - ADD_GAP, avoided = false;
    if (overlap(t, b, upBottom, dnTop)) { b = upBottom; t = b - ADD_H; avoided = true; }
    add = { top: t, height: ADD_H, bottom: b, avoided };
    addTop = t;
  }
  const addUp = !!add?.avoided || (add && add.bottom <= upBottom);
  // 補助列: 追加欄の上（ASSIST_GAP）。溝に入るなら上面の下端へ避ける。下面で余白に 4pt はみ出すだけなら見た目 40・当たり 44 を保つ。
  let aBottom = hasAdd ? addTop - ASSIST_GAP : bottom - ADD_GAP; // 追加欄なし（ノート）は補助がキーボードの真上
  let aTop = aBottom - ASSIST_HIT, visTop = aTop, avoidedA = false;
  const inUp = (t, b) => b <= upBottom;
  if (!inUp(aTop, aBottom)) {
    if (aTop >= dnTop) { /* 下面にそのまま収まる */ }
    else {
      const b2 = hasAdd ? addTop - 2 : aBottom, t2 = b2 - ASSIST_HIT;
      if (t2 >= g1 && b2 - dnTop >= ASSIST_VIS_MIN && !overlap(t2, b2, g0, g1)) { aBottom = b2; aTop = t2; visTop = dnTop; }
      else { aBottom = addUp && add ? addTop - ASSIST_GAP : upBottom; aTop = aBottom - ASSIST_HIT; visTop = aTop; avoidedA = true; }
    }
  }
  const assist = { hitTop: aTop, hitHeight: ASSIST_HIT, hitBottom: aBottom, visTop, visHeight: aBottom - visTop, avoided: avoidedA || aBottom <= upBottom };
  // 上面の矩形: 溝の上 MARGIN まで。上面へ避けた／上面にある入力欄の上端で切る。
  let upB = upBottom;
  if (add && add.bottom <= upBottom) upB = Math.min(upB, add.top - 4);
  if (assist.avoided) upB = Math.min(upB, assist.hitTop - 4);
  // 下面の矩形: 溝の下 MARGIN から、下面にある入力欄・補助の上まで（なければキーボードまで）。
  let dnB = bottom - ADD_GAP;
  if (add && !(add.bottom <= upBottom)) dnB = Math.min(dnB, add.top - 4);
  if (!assist.avoided) dnB = Math.min(dnB, assist.visTop - 4);
  const dn = dnB - dnTop >= restMin && dnTop < bottom ? { top: dnTop, bottom: dnB, height: dnB - dnTop } : null;
  return {
    active: kb !== null, kbTop: kb, hinge: { top: g0, bottom: g1 },
    up: { top, bottom: Math.max(top, upB), height: Math.max(0, upB - top) },
    dn, add, assist,
  };
}

// textarea の挿入位置（selectionEnd）の行の上端・下端（textarea の内容座標）。同じ書体の見えない複製で測る。
export function caretBox(ta, doc = document) {
  if (ta.isContentEditable) { // ノート本文（行ごとの div）: 挿入位置の行の矩形を、本文の上端からの距離で返す
    const g = (doc.defaultView || window).getSelection();
    const base = ta.getBoundingClientRect();
    let r = null;
    if (g && g.rangeCount && ta.contains(g.focusNode)) {
      const rg = g.getRangeAt(0).cloneRange(); rg.collapse(false);
      const rs = rg.getClientRects(); r = rs[rs.length - 1] || null;
      if (!r || !r.height) { let n = g.focusNode; while (n && n.parentNode !== ta) n = n.parentNode; r = n?.getBoundingClientRect?.() || null; }
    }
    if (!r) { const k = ta.lastElementChild?.getBoundingClientRect(); r = k || base; }
    return { top: r.top - base.top, bottom: r.bottom - base.top };
  }
  const cs = getComputedStyle(ta);
  const m = doc.createElement('div');
  m.setAttribute('aria-hidden', 'true');
  m.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;box-sizing:border-box;width:${ta.clientWidth}px;font:${cs.font};letter-spacing:${cs.letterSpacing};padding:${cs.padding};border:0;line-height:${cs.lineHeight}`;
  const pos = ta.selectionEnd ?? ta.value.length;
  m.textContent = ta.value.slice(0, pos);
  const mark = doc.createElement('span'); mark.textContent = '​'; m.append(mark);
  doc.body.append(m);
  const lh = parseFloat(cs.lineHeight) || 24;
  const top = mark.offsetTop, out = { top, bottom: top + lh };
  m.remove();
  return out;
}

// scroller の中で、入力行が可視（pad 余白つき）に入る最小のスクロール量。見えていれば 0。
export function scrollDelta({ itemTop, itemBottom, viewTop, viewBottom, pad = 8 }) {
  if (itemTop < viewTop + pad) return itemTop - (viewTop + pad);
  if (itemBottom > viewBottom - pad) return itemBottom - (viewBottom - pad);
  return 0;
}
