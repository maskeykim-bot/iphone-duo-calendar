// 横スワイプ検出（Pointer Events）。判定だけを行い、移動処理は onSwipe(dir) に任せる。
// dir: +1 = 左スワイプ（次）, -1 = 右スワイプ（前）
const MIN_DX = 50, RATIO = 1.5, DECIDE_PX = 12, TAP_PX = 8, EDGE = 20;

export function initSwipe({ root, canStart, onSwipe }) {
  let g = null;
  let suppress = false, suppressTimer = 0;

  // 確定スワイプ・8px超のドラッグの後に来る click はセル選択／編集に使わせない。
  document.addEventListener('click', (ev) => {
    if (!suppress) return;
    suppress = false; clearTimeout(suppressTimer);
    ev.stopPropagation(); ev.preventDefault();
  }, true);

  const end = () => {
    g = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  };
  function onMove(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    const far = Math.max(Math.abs(dx), Math.abs(dy));
    if (far > TAP_PX) g.moved = true;
    if (!g.decided && far >= DECIDE_PX) {
      g.decided = true;
      if (Math.abs(dy) >= Math.abs(dx)) g.vertical = true; // 縦スクロール扱い。最後まで横へ乗り換えない
    }
  }
  function onUp(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const { x, y, moved, vertical, cancelled } = g;
    const dx = ev.clientX - x, dy = ev.clientY - y;
    end();
    if (moved || Math.max(Math.abs(dx), Math.abs(dy)) > TAP_PX) {
      suppress = true; clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppress = false; }, 400);
    }
    if (cancelled || vertical) return;
    if (Math.abs(dx) >= MIN_DX && Math.abs(dx) / Math.max(Math.abs(dy), 1) >= RATIO) onSwipe(dx < 0 ? 1 : -1);
  }
  function onCancel(ev) { if (g && ev.pointerId === g.id) end(); }

  // 追跡中に別ポインタが増えたら中止（2本指・ピンチ）。root 外でも検知する。
  window.addEventListener('pointerdown', (ev) => { if (g && ev.pointerId !== g.id) g.cancelled = true; }, true);
  root.addEventListener('pointerdown', (ev) => {
    if (g) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (!ev.isPrimary) return;
    if (ev.clientX < EDGE || ev.clientX > window.innerWidth - EDGE) return; // OSの戻る操作を優先
    if (!canStart(ev.target)) return;
    suppress = false;
    g = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false, decided: false, vertical: false, cancelled: false };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}
