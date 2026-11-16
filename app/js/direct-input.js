// 直接入力（長押し→ドラッグ）の共通制御。第14版 PR24。画面への接続は次PR以降。
// 状態: idle → waiting（長押し待ち）→ dragging（350ms確定）→ up/cancel。ペンは待たず即確定。
// 長押し前に動いた（>SLOP）ら通常の scroll / swipe に任せて何もしない。
export const HOLD_MS = 350, SLOP = 8;

// ---- 量子化（純関数） ----
export const snap15 = (m) => Math.floor(m / 15) * 15;
// 列の上端 colTop（getBoundingClientRect().top、scroll 込み）・余白 pad・1時間の高さ hh から 15分刻みの分（0〜1440）。
export function minutesAt(y, colTop, pad, hh) {
  const raw = ((y - colTop - pad) / hh) * 60;
  return Math.min(1440, Math.max(0, snap15(raw)));
}
// 起点 anchor と現在 cur（どちらも15分刻みの分）から {start,end}。最小15分、日境界で clamp。上へ動かせば触れた時刻が終わり。
export function dragRange(anchor, cur, initial = 30) {
  if (cur === anchor) {
    const s = Math.min(anchor, 1440 - initial);
    return { start: Math.max(0, s), end: Math.max(0, s) + initial };
  }
  if (cur > anchor) return { start: anchor, end: Math.min(1440, Math.max(cur, anchor + 15)) };
  const start = Math.max(0, cur); // 上へ: 触れた時刻が終わり
  return { start, end: Math.min(1440, Math.max(anchor, start + 15)) };
}
// 短tapの仮枠: 触れた時刻（15分刻み）から1時間。日の終わりを越えないよう開始を詰める。
export function tapRange(m, len = 60) {
  const start = Math.max(0, Math.min(snap15(m), 1440 - len));
  return { start, end: start + len };
}
// 開始・終了のどちらか一方の取っ手を動かす。最小15分・日境界で clamp。
export function moveHandle(r, which, m) {
  if (which === 'start') return { start: Math.max(0, Math.min(snap15(m), r.end - 15)), end: r.end };
  return { start: r.start, end: Math.min(1440, Math.max(snap15(m), r.start + 15)) };
}
export const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function durText(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h ? `${h}時間` : ''}${m ? `${m}分` : ''}`;
}
export const spanText = (r) => `${hm(r.start)}〜${hm(r.end)}（${durText(r.end - r.start)}）`;
// 点が入る日（rects: [{key,left,right,top,bottom}]）。入らなければ null。
export function dayAt(x, y, rects) {
  for (const r of rects) if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return r.key;
  return null;
}
// 2つの日付キー（YYYY-MM-DD）から含む終了日の昇順 {start,end,days}。逆方向を正規化。
export function dayRange(a, b) {
  const [s, e] = a <= b ? [a, b] : [b, a];
  const days = Math.round((Date.parse(e + 'T00:00:00Z') - Date.parse(s + 'T00:00:00Z')) / 86400000) + 1;
  return { start: s, end: e, days };
}

// 札の文言「11月18日〜20日（3日間）」。月をまたぐときは終わりにも月を付ける。1日は「11月18日（1日）」。
export function rangeText(from, to) {
  const { start, end, days } = dayRange(from, to);
  const m = (k) => +k.slice(5, 7), d = (k) => +k.slice(8, 10);
  if (days <= 1) return `${m(start)}月${d(start)}日（1日）`;
  return `${m(start)}月${d(start)}日〜${m(end) === m(start) ? '' : `${m(end)}月`}${d(end)}日（${days}日間）`;
}

// ---- 状態機械（DOM非依存。タイマーと時計を注入できる） ----
export function createPressMachine({ onConfirm, onMove, onEnd, onCancel, onRelease, holdMs = HOLD_MS, slop = SLOP,
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let state = 'idle', p = null, timer = 0;
  const clean = () => { clearTimer(timer); timer = 0; state = 'idle'; p = null; };
  const confirm = () => {
    if (state !== 'waiting') return;
    clearTimer(timer); timer = 0; state = 'dragging';
    onConfirm?.({ ...p.start, pointerType: p.type });
  };
  return {
    get state() { return state; },
    down(e) { // {id,type,x,y,origin}
      if (state !== 'idle') { // 2本目: 長押し待ちも確定後も中止
        if (e.id !== p.id) this.cancel('multi');
        return false;
      }
      p = { id: e.id, type: e.type, start: { x: e.x, y: e.y, origin: e.origin }, t0: now() };
      state = 'waiting';
      if (e.type === 'pen') confirm();
      else timer = setTimer(confirm, holdMs);
      return true;
    },
    move(e) {
      if (state === 'idle' || e.id !== p.id) return;
      if (state === 'waiting') {
        if (Math.hypot(e.x - p.start.x, e.y - p.start.y) > slop) { clean(); onRelease?.('moved'); }
        return;
      }
      onMove?.({ x: e.x, y: e.y });
    },
    up(e) {
      if (state === 'idle' || e.id !== p.id) return;
      if (state === 'waiting' && now() - p.t0 >= holdMs) confirm(); // タイマー遅延でも350ms以上なら確定扱い
      if (state === 'dragging') { const r = { x: e.x, y: e.y }; clean(); onEnd?.(r); }
      else { clean(); onRelease?.('tap'); }
    },
    cancel(reason = 'cancel') {
      if (state === 'idle') return;
      const was = state; clean();
      if (was === 'dragging') onCancel?.(reason); else onRelease?.(reason);
    },
  };
}

// ---- DOM 接続 ----
// classify(target) -> null | {kind:'time'|'allday'|'month'|'chip', ...任意}。null なら何もしない（既存予定上は null を返す）。
// 確定時に swipe.cancel() を呼び、後続 click を1回抑止する。
export function initDirectInput({ root, classify, swipe, onStart, onMove, onEnd, onCancel }) {
  let origin = null, clickSup = false, supTimer = 0;
  const machine = createPressMachine({
    onConfirm: (s) => {
      swipe?.cancel();
      window.addEventListener('touchmove', blockTouch, { passive: false });
      onStart?.({ ...s, origin });
    },
    onMove: (m) => onMove?.({ ...m, origin }),
    onEnd: (m) => { teardown(); armSuppress(); onEnd?.({ ...m, origin }); origin = null; },
    onCancel: (r) => { teardown(); armSuppress(); onCancel?.({ reason: r, origin }); origin = null; },
    onRelease: () => { teardown(); origin = null; },
  });
  function blockTouch(ev) { if (ev.cancelable) ev.preventDefault(); } // 確定後はスクロールさせない
  function teardown() {
    window.removeEventListener('touchmove', blockTouch);
    window.removeEventListener('pointermove', mv, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cn, true);
    window.removeEventListener('lostpointercapture', cn, true);
    window.removeEventListener('blur', cn);
    document.removeEventListener('visibilitychange', vis);
  }
  function armSuppress() { clickSup = true; clearTimeout(supTimer); supTimer = setTimeout(() => { clickSup = false; }, 400); }
  const pt = (ev) => ({ id: ev.pointerId, x: ev.clientX, y: ev.clientY });
  const mv = (ev) => machine.move(pt(ev));
  const up = (ev) => machine.up(pt(ev));
  const cn = (ev) => machine.cancel(ev.type);
  const vis = () => { if (document.hidden) machine.cancel('hidden'); };
  document.addEventListener('click', (ev) => {
    if (!clickSup) return;
    clickSup = false; clearTimeout(supTimer);
    ev.stopPropagation(); ev.preventDefault();
  }, true);
  // 2本目の指は root 外でも検知して中止。
  window.addEventListener('pointerdown', (ev) => { if (machine.state !== 'idle') machine.cancel('multi'); }, true);
  root.addEventListener('pointerdown', (ev) => {
    if (machine.state !== 'idle') return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (!ev.isPrimary || !(ev.target instanceof Element)) return;
    const o = classify(ev.target, ev);
    if (!o) return;
    origin = o; clickSup = false;
    window.addEventListener('pointermove', mv, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cn, true);
    window.addEventListener('lostpointercapture', cn, true);
    window.addEventListener('blur', cn);
    document.addEventListener('visibilitychange', vis);
    machine.down({ ...pt(ev), type: ev.pointerType, origin: o });
  });
  return { cancel: (r) => machine.cancel(r), get state() { return machine.state; } };
}
