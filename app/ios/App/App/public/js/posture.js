// 折り状態（第16版 PR11）。Swift の getPosture / postureChange（Posture）を受け取り、html.folded・軸 class・矩形 CSS 変数へ反映する。
// 角度は表示（詳細の計測）だけに使い、配置の根拠にしない。本文の配置はこの PR では変えない。
const STATUS = [null, 'closed', 'fullyOpen', 'partiallyOpen', 'unknown'];
const num = (n) => typeof n === 'number' && Number.isFinite(n);

export const FALLBACK_GROOVE = Object.freeze({ g0: 467, g1: 484, source: 'fallback' });
// 溝 [g0, g1]。null・非数・g1<g0 は null（呼び出し側が開いた縦ならフォールバックを使う）。高さ17未満は中心 c から c±8.5。
export function normGroove(g) {
  if (!g || typeof g !== 'object' || !num(g.g0) || !num(g.g1) || g.g1 < g.g0) return null;
  const source = g.source === 'native' ? 'native' : 'fallback';
  if (g.g1 - g.g0 < 17) { const c = (g.g0 + g.g1) / 2; return { g0: c - 8.5, g1: c + 8.5, source }; }
  return { g0: g.g0, g1: g.g1, source };
}
// 式（design/29 §9）。467〜484 → avoid 459〜492・cut 458〜500。
export function grooveBands(g) {
  return { avoid: [g.g0 - 8, g.g1 + 8], cut: [g.g0 - 9, g.g1 + 16] };
}
const GROOVE_VARS = ['--groove-y0', '--groove-y1', '--groove-avoid-y0', '--groove-avoid-y1', '--groove-cut-y0', '--groove-cut-y1', '--groove-source'];
// 開いた縦のときだけ変数を付ける。ほか（閉じた画面・開いた横）は外す。開いた縦で値が無ければフォールバック。
export function applyGroove(el, groove, portraitOpen) {
  if (!portraitOpen) { GROOVE_VARS.forEach((v) => el.style.removeProperty(v)); return null; }
  const g = normGroove(groove) || { ...FALLBACK_GROOVE };
  const b = grooveBands(g), px = (n) => `${Math.round(n * 100) / 100}px`;
  const set = (k, v) => el.style.setProperty(k, v);
  set('--groove-y0', px(g.g0)); set('--groove-y1', px(g.g1));
  set('--groove-avoid-y0', px(b.avoid[0])); set('--groove-avoid-y1', px(b.avoid[1]));
  set('--groove-cut-y0', px(b.cut[0])); set('--groove-cut-y1', px(b.cut[1]));
  set('--groove-source', g.source);
  return g;
}

// 不正値は null（無視）。正しい形だけ正規化して返す。
export function normPosture(p) {
  if (!p || typeof p !== 'object' || typeof p.available !== 'boolean' || typeof p.folded !== 'boolean') return null;
  let rect = null;
  if (p.regionRect !== null && p.regionRect !== undefined) {
    const q = p.regionRect;
    if (!q || typeof q !== 'object' || !['x', 'y', 'width', 'height'].every((k) => num(q[k])) || q.width < 0 || q.height < 0) return null;
    rect = { x: q.x, y: q.y, width: q.width, height: q.height };
  }
  const axis = p.axis === 'horizontal' || p.axis === 'vertical' ? p.axis : null;
  const status = STATUS.includes(p.status ?? null) ? (p.status ?? null) : null;
  return {
    available: p.available, folded: p.available && p.folded, regionRect: rect, axis,
    angle: num(p.angle) ? p.angle : null, status, groove: normGroove(p.groove),
    source: p.source === 'reservedRegions' ? 'reservedRegions' : 'unsupported', at: num(p.at) ? p.at : 0,
  };
}

// 適用先 DOM へ反映する（el: documentElement 相当）。eligible=false（外面など）や未対応では class・変数を解除する。
export function applyPosture(el, p, eligible = true) {
  const on = !!p && p.available && p.folded && eligible;
  el.classList.toggle('folded', on);
  el.classList.toggle('fold-h', on && p.axis === 'horizontal');
  el.classList.toggle('fold-v', on && p.axis === 'vertical');
  const vars = ['--hinge-x', '--hinge-y', '--hinge-w', '--hinge-h'];
  if (on && p.regionRect) {
    const r = p.regionRect;
    [r.x, r.y, r.width, r.height].forEach((v, i) => el.style.setProperty(vars[i], `${Math.round(v * 100) / 100}px`));
  } else vars.forEach((v) => el.style.removeProperty(v));
}

// 古い非同期取得が新しいイベントを上書きしない。seq は要求順、at は Swift の時刻。
export function createPosture({ call, listen, el, eligible = () => true, portrait = () => false, onChange = () => {}, now = Date.now } = {}) {
  let cur = null, manual = null, seq = 0, lastAt = -Infinity, listening = false, failed = false;
  let adopted = null, cand = null; // 採用中の溝と直前の候補（開閉の途中の値で変数を動かさない）
  const effective = () => (manual === null ? cur : { ...(cur || normPosture({ available: true, folded: manual, regionRect: null, axis: null, angle: null, status: null, source: 'unsupported', at: 0 })), available: true, folded: manual });
  const reflect = () => {
    const e = effective();
    if (el) { applyPosture(el, e, eligible()); applyGroove(el, adopted, !!portrait() && eligible()); }
    onChange(e);
  };
  // 採用は、初めて／null から戻るとき、status が fullyOpen・closed のとき、同じ値（差 0.5 未満）が続いたときだけ。動いている途中は直前の値を保つ。
  function settleGroove(p) {
    const g = p.groove;
    if (!g) { adopted = null; cand = null; return; }
    const same = cand && Math.abs(cand.g0 - g.g0) < 0.5 && Math.abs(cand.g1 - g.g1) < 0.5;
    if (!adopted || same || p.status === 'fullyOpen' || p.status === 'closed') adopted = g;
    cand = g;
  }
  function accept(raw, fromEvent) {
    const p = normPosture(raw);
    if (!p) return false;
    if (!fromEvent && p.at < lastAt) return false; // 取得の応答がイベントより古い
    if (fromEvent && p.at < lastAt) return false;
    lastAt = Math.max(lastAt, p.at); cur = p; failed = false; settleGroove(p); reflect();
    return true;
  }
  async function refresh() {
    const my = ++seq, ev0 = lastAt;
    try {
      const r = await call('getPosture', {});
      if (my !== seq) return false; // 逆順応答（後の取得が先に返った）
      const p = normPosture(r);
      if (p && lastAt > ev0 && p.at < lastAt) return false; // 取得中に新しいイベントが届いた
      return accept(r, false);
    } catch { if (my === seq && !cur) { failed = true; reflect(); } return false; }
  }
  function start() {
    if (!listening) { listening = true; try { listen('postureChange', (p) => { seq++; accept(p, true); }); } catch { /* 購読失敗でも起動する */ } }
    return refresh();
  }
  return {
    start, refresh, reapply: reflect,
    setManual(v) { manual = v === null ? null : !!v; reflect(); }, // 手動「折り」代替（集中UIが使う）。null で解除
    get posture() { return cur; }, get effective() { return effective(); }, get failed() { return failed; }, get manual() { return manual; }, get groove() { return adopted; },
    _now: now,
  };
}

// 詳細の計測用テキスト。角度は表示のみ。kbTop は visualViewport の下端、差 = ヒンジ上端 − kbTop。
export function postureText(p, { failed = false, kbTop = null, native = true } = {}) {
  if (!native) return 'division 非ネイティブ（未取得）';
  if (!p) return failed ? '折り状態 取得失敗' : '折り状態 未取得';
  if (!p.available) return '折り状態 未対応（division なし）';
  const v = (n) => (n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100));
  const r = p.regionRect;
  const parts = [`折り ${p.folded ? 'あり' : 'なし'}`, `軸 ${p.axis ?? '—'}`, `status ${p.status ?? '—'}`, `angle ${v(p.angle)}°（配置には不使用）`];
  parts.push(r ? `ヒンジ x${v(r.x)} y${v(r.y)} w${v(r.width)} h${v(r.height)}` : 'ヒンジ —');
  if (r && kbTop !== null && Number.isFinite(kbTop)) parts.push(`キーボード上端との差 ${v(r.y - kbTop)}`);
  return parts.join(' · ');
}
