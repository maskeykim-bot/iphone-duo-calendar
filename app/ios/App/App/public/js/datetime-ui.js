// 時刻のカプセル・長さのチップ・時分のマス（設計12 §1–2）。状態の計算は datetime.js、保存は app.js。
// ここは表示と操作だけ。開くのは一度に一つ。開いて閉じただけでは何も変えない。
import { splitIso, durationMin, endDayOffset, parseTimeDigits, parseDateDigits, digitsOnly, dialRing } from './datetime.js';
import { t0, DOW, addDays, addMonths, parseKey, todayKey, weekStart, weekdayHeads } from './util.js';

const p2 = (n) => String(n).padStart(2, '0');
export const DURATIONS = [15, 30, 60, 90, 120, 180];
export const durLabel = (m) => (m < 60 ? `${m}分` : `${m / 60}時間`);
// 終了の札（翌日／+N日）。0日以下は出さない。
export const dayBadge = (n) => (n >= 2 ? `+${n}日` : n === 1 ? '翌日' : '');
// 7〜21時を目立たせる（押せるのはどの時間も同じ）
export const hourUsual = (h) => h >= 7 && h <= 21;
// 5分刻みでない分は「いま 07分」と見出しに出し、マスはどれも選ばない
export const oddMinute = (mi) => (mi % 5 === 0 ? '' : `いま ${p2(mi)}分`);
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);


// ---------- 数字の短縮入力（長押しで文字の欄になる。設計12 §4） ----------
export const LONG_PRESS_MS = 500, SHAKE_MS = 200, MOVE_TOL = 10;
// cap: カプセルのボタン。opts: { cls, label, commit(digits) → boolean（読めたら適用して true）, same?(digits) }
// 確定は Enter／欄を離れたとき。Escape は取り消し。読めない値は元に戻して 0.2 秒揺らす（文は出さない）。
// 未確定の数字は保存しない（状態へは確定のときだけ渡す）。触っただけ・同じ値の確定は何も変えない。
export function attachDigitEntry(cap, opts) {
  let input = null, timer = 0, down = null, swallow = false, swallowTimer = 0;
  const clearTimer = () => { clearTimeout(timer); timer = 0; down = null; };
  function shake() {
    cap.classList.add('shake');
    setTimeout(() => cap.classList.remove('shake'), SHAKE_MS);
  }
  function end(focusCap) {
    if (!input) return;
    const el = input; input = null;
    el.remove();
    cap.classList.remove('editing');
    if (focusCap) cap.focus({ preventScroll: true });
  }
  function enter(first = '') {
    if (input) return; // touch と click の二重発火でも欄は一つ
    if (opts.blocked?.()) return;
    opts.onEnter?.(); // 数字を打つときはダイヤルを閉じる
    const el = document.createElement('input');
    el.type = 'text'; el.inputMode = 'numeric'; el.pattern = '[0-9]*'; el.autocomplete = 'off'; el.enterKeyHint = 'done';
    el.className = `capin ${opts.cls}`;
    el.maxLength = 12;
    el.setAttribute('aria-label', `${opts.label}、数字で入力`);
    el.value = digitsOnly(first);
    input = el;
    cap.after(el);
    cap.classList.add('editing');
    el.addEventListener('input', () => { const v = digitsOnly(el.value); if (v !== el.value) el.value = v; });
    el.addEventListener('keydown', (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return; // IME の変換確定の Enter では確定しない
      if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); commit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(true); }
    });
    el.addEventListener('blur', () => { if (input === el) commit(false); });
    for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend']) el.addEventListener(type, (ev) => ev.stopPropagation());
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }
  function commit(focusCap) {
    if (!input) return;
    const d = digitsOnly(input.value);
    end(focusCap);
    if (!d) return; // 何も打っていない = 取り消し
    if (opts.same?.(d)) return;
    if (!opts.commit(d)) shake();
  }
  cap.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    clearTimer();
    down = { x: ev.clientX, y: ev.clientY };
    timer = setTimeout(() => {
      timer = 0;
      swallow = true; clearTimeout(swallowTimer); swallowTimer = setTimeout(() => { swallow = false; }, 1500); // 指を離したあとの click は押下にしない
      enter();
    }, LONG_PRESS_MS);
  });
  cap.addEventListener('pointermove', (ev) => { if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > MOVE_TOL) clearTimer(); });
  // 長押し前の離す／キャンセル（スクロール開始など）は押下を取り消すだけ。長押し後のキャンセルは欄をそのまま残す。
  cap.addEventListener('pointerup', clearTimer);
  cap.addEventListener('pointercancel', clearTimer);
  cap.addEventListener('contextmenu', (ev) => { if (swallow || timer) ev.preventDefault(); });
  // click は部品の開閉。長押しで欄を出した直後の click は先に捨てる（キャプチャで止めて開閉側へ渡さない）。
  cap.addEventListener('click', (ev) => {
    if (swallow) { swallow = false; ev.stopImmediatePropagation(); ev.preventDefault(); }
  }, true);
  // キーボード: 数字キーで欄を開く（打った数字から始まる）。
  cap.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
    if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); enter(ev.key); }
  });
  return { enter, isEditing: () => !!input, cancel: () => end(false) };
}

// ---------- 時刻のダイヤル（design/24） ----------
export const COMMON_TIMES = [[9, 0], [10, 0], [13, 0], [15, 0], [19, 0]];
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// 1本の列。輪（時 0〜23／分 00〜55）を縦に並べ、指で回す。離すと一番近い段へ 0.15 秒で寄る。速く回すと惰性。
// o: { kind:'h'|'m', get() → 今の値, set(v), dims() → { rows, rowH }, buzz(), reduced?() }
export function createDialColumn(el, o) {
  const fmt = (v) => (o.kind === 'h' ? String(v) : p2(v));
  let view = dialRing(o.kind, o.get()), off = 0, drag = null, raf = 0, wheelAcc = 0;
  const reduced = () => (o.reduced ? o.reduced() : reducedMotion());
  const sync = () => { const c = o.get(); if (Number.isInteger(c)) view = dialRing(o.kind, c); };
  function draw() {
    const { rows, rowH } = o.dims(), R = Math.floor(rows / 2) + 1, n = view.list.length;
    el.style.setProperty('--rowh', `${rowH}px`);
    let html = '';
    for (let k = -R; k <= R; k++) {
      const v = view.list[(((view.idx + k) % n) + n) % n], d = Math.round(Math.abs(k + off / rowH));
      html += `<div class="ditem d${Math.min(d, 3)}" data-v="${v}" data-k="${k}" style="transform:translateY(${(k + rows / 2 - 0.5) * rowH + off}px)">${fmt(v)}</div>`;
    }
    el.innerHTML = html;
    const c = view.list[view.idx];
    el.setAttribute('aria-valuenow', String(c)); el.setAttribute('aria-valuetext', fmt(c));
  }
  // dir: +1 = 値が増える向き。輪の次の値へ（5分刻みでない値はここで寄る）。
  function step(dir) {
    const v = view.list[(((view.idx + dir) % view.list.length) + view.list.length) % view.list.length];
    o.buzz?.(); o.set(v); sync();
  }
  function settle() {
    cancelAnimationFrame(raf); raf = 0;
    const from = off;
    if (!from || reduced()) { off = 0; draw(); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const q = Math.min(1, (t - t0) / 150);
      off = from * (1 - (1 - (1 - q) ** 3));
      if (q >= 1) off = 0;
      draw();
      raf = q < 1 ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(tick);
  }
  function move(dy) {
    const { rowH } = o.dims();
    off += dy;
    // 下へ引く（off>0）と前の値が真ん中へ来る＝値は減る
    while (off > rowH / 2) { step(-1); off -= rowH; }
    while (off < -rowH / 2) { step(+1); off += rowH; }
    draw();
  }
  function inertia(v) {
    let last = performance.now();
    const tick = (t) => {
      const dt = t - last; last = t;
      move(v * dt); v *= Math.exp(-dt / 250);
      if (Math.abs(v) < 0.03) { raf = 0; settle(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  el.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    cancelAnimationFrame(raf); raf = 0; sync();
    drag = { id: ev.pointerId, y: ev.clientY, y0: ev.clientY, t: performance.now(), v: 0, moved: false };
    try { el.setPointerCapture(ev.pointerId); } catch { /* 無視 */ }
  });
  el.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const now = performance.now(), dy = ev.clientY - drag.y;
    if (!drag.moved && Math.abs(ev.clientY - drag.y0) < 6) return;
    drag.moved = true;
    const dt = Math.max(1, now - drag.t);
    drag.v = 0.8 * (dy / dt) + 0.2 * drag.v; drag.y = ev.clientY; drag.t = now;
    move(dy);
  });
  const up = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (ev.type === 'pointercancel') { settle(); return; }
    if (!d.moved) { // たたいた段へ進む
      const r = el.getBoundingClientRect(), { rows, rowH } = o.dims();
      const k = Math.floor((ev.clientY - r.top) / rowH - rows / 2 + 0.5);
      const dir = Math.sign(k);
      for (let i = 0; i < Math.abs(k); i++) step(dir);
      draw(); return;
    }
    const idle = performance.now() - d.t;
    if (!reduced() && idle < 80 && Math.abs(d.v) > 0.4) inertia(Math.max(-2, Math.min(2, d.v))); else settle(); // 弾く速さは 2pt/ms まで
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    wheelAcc += ev.deltaY;
    const { rowH } = o.dims();
    while (Math.abs(wheelAcc) >= rowH) { step(wheelAcc > 0 ? -1 : +1); wheelAcc -= Math.sign(wheelAcc) * rowH; } // 下へ回す＝前の値
    draw();
  }, { passive: false });
  // adjustable: 上下で 1時間／5分（輪でつながる）
  el.addEventListener('keydown', (ev) => {
    const up2 = ev.key === 'ArrowUp' || ev.key === 'ArrowRight' || ev.key === 'PageUp', dn = ev.key === 'ArrowDown' || ev.key === 'ArrowLeft' || ev.key === 'PageDown';
    if (!up2 && !dn) return;
    ev.preventDefault(); ev.stopPropagation();
    sync(); step(up2 ? +1 : -1); draw();
  });
  return { refresh() { if (!drag && !raf) { sync(); draw(); } }, draw: () => { sync(); draw(); } };
}

// els: { box, start, end（時刻カプセル）, badge, dur（長さの行）, pop, rows: {start,end}, hours, mins, title?, chips? }
// api: { get() → 編集状態または null, setTime(which, h, m), setDuration(min), buzz() }
export function createTimeUi(els, api) {
  let open = null; // 'start' | 'end' | null
  const caps = { start: els.start, end: els.end };
  const face = () => document.body.dataset.layout === 'spread' || document.body.dataset.posture === 'portrait';
  const large = () => els.box.classList.contains('dtlarge');
  const dims = () => (face() ? { rows: 7, rowH: 44 } : large() ? { rows: 3, rowH: 44 } : { rows: 5, rowH: 32 });
  const WHO = { start: '開始', end: '終了' };
  const cur = () => { const st = api.get(); return st && open ? splitIso(st[open]) : null; };
  const cols = {
    h: createDialColumn(els.hours, { kind: 'h', get: () => cur()?.h, set: (v) => api.setTime(open, v, null), dims, buzz: () => api.buzz?.() }),
    m: createDialColumn(els.mins, { kind: 'm', get: () => cur()?.mi, set: (v) => api.setTime(open, null, v), dims, buzz: () => api.buzz?.() }),
  };
  for (const [k, el, lab] of [['h', els.hours, '時'], ['m', els.mins, '分']]) {
    el.setAttribute('role', 'slider'); el.tabIndex = 0;
    el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', k === 'h' ? '23' : '55');
    el.setAttribute('aria-orientation', 'vertical');
    el.dataset.unit = lab;
  }
  // 開いた横（左のページ）と開いた縦（下の面）は面として出す。閉じた画面は行のすぐ下。
  function place() {
    const pop = els.pop, f = open && face();
    pop.classList.toggle('face', !!f);
    const dlgEl = els.box.closest('dialog');
    dlgEl?.classList.toggle('tface-open', !!f);
    ['--tf-l', '--tf-r', '--tf-t', '--tf-b'].forEach((n) => dlgEl?.style.removeProperty(n));
    pop.style.cssText = '';
    if (!f) return;
    const de = document.documentElement, v = (n) => parseFloat(getComputedStyle(de).getPropertyValue(n));
    const W = window.innerWidth, H = window.innerHeight;
    let l, t, r, b;
    if (document.body.dataset.layout === 'spread') { l = v('--left-start') || 8; r = v('--left-end') || W / 2; t = 24; b = H - 24; }
    else { const e = els.box.closest('dialog').getBoundingClientRect(); l = e.left; r = e.right; t = v('--groove-avoid-y1') || Math.round(H * 0.517); b = H - Math.max(v('--rb') || 0, 34); }
    Object.assign(pop.style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
    if (document.body.dataset.layout === 'spread' && dlgEl) { // S7 G2: 右ページのシートの clip-path（折り目側の影を切る）が左ページの面まで切らないよう、面の矩形を残す
      const e = dlgEl.getBoundingClientRect();
      dlgEl.style.setProperty('--tf-l', `${l - e.left}px`); dlgEl.style.setProperty('--tf-r', `${r - e.left}px`);
      dlgEl.style.setProperty('--tf-t', `${t - e.top}px`); dlgEl.style.setProperty('--tf-b', `${b - e.top}px`);
    }
    const q = pop.getBoundingClientRect(); // 変形のある親の中でも合わせる
    if (Math.abs(q.left - l) > 0.5 || Math.abs(q.top - t) > 0.5) Object.assign(pop.style, { left: `${l - (q.left - l)}px`, top: `${t - (q.top - t)}px` });
  }

  function render() {
    const st = api.get();
    const t = (iso) => (iso ? t0(iso.slice(11, 16)) : '--:--');
    els.start.textContent = st ? t(st.start) : '--:--';
    els.end.textContent = st ? t(st.end) : '--:--';
    const b = st && !st.all ? dayBadge(endDayOffset(st)) : '';
    els.badge.textContent = b; els.badge.hidden = !b;
    els.start.setAttribute('aria-label', `開始の時刻、${t(st?.start)}、ボタン`);
    els.end.setAttribute('aria-label', `終了の時刻、${t(st?.end)}${b ? `、${b}` : ''}、ボタン`);
    const len = st && !st.all ? durationMin(st.start, st.end) : NaN;
    els.dur.querySelectorAll('[data-min]').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.min) === len)));
    for (const k of ['start', 'end']) {
      caps[k].classList.toggle('open', open === k);
      caps[k].setAttribute('aria-expanded', String(open === k));
    }
    if (open && st) {
      els.pop.dataset.rows = String(dims().rows); els.pop.style.setProperty('--rows', String(dims().rows));
      els.pop.style.setProperty('--rowh', `${dims().rowH}px`);
      if (els.title) els.title.textContent = `${WHO[open]}の時刻`;
      els.hours.setAttribute('aria-label', `${WHO[open]}、時`); els.mins.setAttribute('aria-label', `${WHO[open]}、分`);
      cols.h.refresh(); cols.m.refresh();
    }
  }
  function show(which) {
    open = which;
    els.pop.hidden = !which;
    if (which) {
      els.rows[which].after(els.pop);
      document.activeElement?.blur?.(); // キーボードとは同時に出さない
      els.pop.dataset.rows = String(dims().rows); els.pop.style.setProperty('--rows', String(dims().rows));
    }
    place();
    render();
    if (which) { cols.h.draw(); cols.m.draw(); }
  }
  function close(focusCap = false) {
    const was = open;
    if (open) show(null);
    if (focusCap && was) caps[was].focus({ preventScroll: true });
  }

  els.dur.innerHTML = DURATIONS.map((m) => `<button type="button" class="dchip" data-min="${m}" aria-pressed="false">${durLabel(m)}</button>`).join('');
  if (els.chips) els.chips.innerHTML = COMMON_TIMES.map(([h, m]) => `<button type="button" class="tfchip" data-h="${h}" data-m="${m}">${h}:${p2(m)}</button>`).join('');
  els.chips?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-h]');
    if (!b || !open) return;
    api.buzz?.();
    api.setTime(open, Number(b.dataset.h), Number(b.dataset.m));
    render();
  });

  for (const k of ['start', 'end']) {
    caps[k].addEventListener('click', () => { if (api.get()?.all) return; show(open === k ? null : k); });
    attachDigitEntry(caps[k], {
      blocked: () => !!api.get()?.all, onEnter: () => close(), cls: 'tcap-in', label: `${k === 'start' ? '開始' : '終了'}の時刻`,
      same: (d) => { const t = parseTimeDigits(d), st = api.get(); if (!t || !st) return false; const c = splitIso(st[k]); return t.h === c.h && t.m === c.mi; },
      commit: (d) => { const t = parseTimeDigits(d); if (!t || !api.get() || api.get().all) return false; close(); api.setTime(k, t.h, t.m); return true; },
    });
  }
  els.pop.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) { ev.preventDefault(); ev.stopPropagation(); close(true); } });
  els.dur.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-min]');
    if (!b) return;
    close();
    api.buzz();
    api.setDuration(Number(b.dataset.min));
  });
  // 他の欄に触れたら閉じる（部品の中・カプセルは除く）。シートの引き下げ・親の月送りへ伝えない。
  const outside = (ev) => { if (open && !ev.target.closest('#tpop,#f-stime,#f-etime,#f-start,#f-end')) close(); };
  els.box.addEventListener('focusin', outside);
  els.box.closest('form')?.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', () => { if (open) { place(); render(); cols.h.draw(); cols.m.draw(); } });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend']) {
    els.box.addEventListener(type, (ev) => ev.stopPropagation(), { passive: true });
  }
  return { render, close, isOpen: () => open };
}

// ---------- 日付のカプセルと小さな月（設計12 §3） ----------
// 「11月14日（土）」。今年でない日だけ年を入れる。
export function dateLabel(k, thisYear = Number(todayKey().slice(0, 4))) {
  const d = parseKey(k);
  return `${d.getFullYear() === thisYear ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`;
}
const dateSpoken = (k) => { const d = parseKey(k); return `${d.getMonth() + 1}月${d.getDate()}日${DOW[d.getDay()]}曜日`; };
export const monthOf = (k) => `${k.slice(0, 8)}01`;
// 週始まり設定どおりの6週（42日）。月が5週でも6行出す。
export function monthGrid6(vm) {
  const st = weekStart(vm);
  return Array.from({ length: 42 }, (_, i) => addDays(st, i));
}
export const SWIPE_MIN = 50;

// 小さな月の中身（HTML 文字列）。日付のカプセル（予定・繰り返し・タスク）が共通で使う。
// opts: { cur: 選択中の日|'', min: これより前は押せない日|'', holiday(k)→boolean, today, attr: 日のボタンに付ける属性（例 'data-act="remdp"'） }
export function monthPopParts(vm, { cur = '', min = '', holiday = () => false, today = todayKey(), attr = '' } = {}) {
  const d = parseKey(vm);
  const chips = [['今日', today], ['明日', addDays(today, 1)], [`来週の${DOW[parseKey(today).getDay()]}曜`, addDays(today, 7)]]
    .map(([t, k]) => `<button type="button" class="dpchip" ${attr} data-day="${k}"${min && k < min ? ' disabled' : ''}>${t}</button>`).join('');
  const heads = weekdayHeads().map(({ i, label }) => `<span class="${i === 0 ? 'hol' : ''}">${label}</span>`).join('');
  const grid = monthGrid6(vm).map((k) => {
    const c = parseKey(k), out = k.slice(0, 7) !== vm.slice(0, 7), red = c.getDay() === 0 || holiday(k);
    const off = !!min && k < min;
    return `<button type="button" class="dcell${out ? ' out' : ''}${red ? ' hol' : ''}${k === today ? ' tod' : ''}${k === cur ? ' sel' : ''}" ${attr} data-day="${k}" aria-label="${dateSpoken(k)}" aria-pressed="${k === cur}"${off ? ' disabled' : ''}><span class="n">${c.getDate()}</span></button>`;
  }).join('');
  return { title: `${d.getFullYear()}年${d.getMonth() + 1}月`, chips, heads, grid };
}
// 時・分のマス（HTML 文字列）。cur: { h, mi } | null
export function hourCellsHtml(cur, attr = '') {
  return HOURS.map((h) => `<button type="button" class="tcell ${hourUsual(h) ? 'usual' : 'rare'}" ${attr} data-h="${h}" aria-label="${h}時" aria-pressed="${!!cur && cur.h === h}">${h}</button>`).join('');
}
export function minCellsHtml(cur, attr = '') {
  return MINUTES.map((m) => `<button type="button" class="tcell mcell" ${attr} data-m="${m}" aria-label="${p2(m)}分" aria-pressed="${!!cur && cur.mi === m}">${p2(m)}</button>`).join('');
}
// 'HH:mm' → { h, mi }
export const splitHm = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(String(t || '')); return m ? { h: +m[1], mi: +m[2] } : null; };
// 時刻の変更（触った所だけ変える。分はそのまま＝07分も保つ）。cur: 'HH:mm'|''、h/m は null なら据え置き。
export const withHm = (cur, h, m) => { const c = splitHm(cur) || { h: 9, mi: 0 }; return `${p2(h ?? c.h)}:${p2(m ?? c.mi)}`; };


// els: { box, start, end（日付カプセル）, rows, pop, chips, title, prev, next, heads, grid }
// api: { get() → 編集状態または null, pick(which, key), buzz(), holiday(key) → boolean, closeOthers?() }
export function createDateUi(els, api) {
  let open = null, vm = '';
  const caps = { start: els.start, end: els.end };
  const dayOfSt = (st, w) => st?.[w]?.slice(0, 10) || '';

  function render() {
    const st = api.get();
    for (const [w, who] of [['start', '開始'], ['end', '終了']]) {
      const k = dayOfSt(st, w);
      caps[w].textContent = k ? dateLabel(k) : '----/--/--';
      caps[w].setAttribute('aria-label', `${who}の日付、${k ? dateSpoken(k) : '未設定'}、ボタン`);
      caps[w].classList.toggle('open', open === w);
      caps[w].setAttribute('aria-expanded', String(open === w));
    }
    if (!open || !st) return;
    const cur = dayOfSt(st, open), min = open === 'end' ? dayOfSt(st, 'start') : '';
    const m = monthPopParts(vm, { cur, min, holiday: api.holiday });
    els.title.textContent = m.title; els.chips.innerHTML = m.chips; els.heads.innerHTML = m.heads; els.grid.innerHTML = m.grid;
  }
  function show(which) {
    open = which;
    els.pop.hidden = !which;
    if (which) {
      vm = monthOf(dayOfSt(api.get(), which) || todayKey());
      els.rows[which].after(els.pop);
    }
    render();
  }
  function close(focusCap = false) {
    const was = open;
    if (open) show(null);
    if (focusCap && was) caps[was].focus({ preventScroll: true });
  }
  function pick(k) {
    if (!open) return;
    const w = open;
    api.buzz();
    show(null);
    api.pick(w, k);
    caps[w].focus({ preventScroll: true }); // 閉じたらカプセルへフォーカスを戻す
  }
  function nav(n) { vm = addMonths(vm, n); render(); }

  for (const w of ['start', 'end']) {
    caps[w].addEventListener('click', () => { if (!api.get()) return; show(open === w ? null : w); });
    attachDigitEntry(caps[w], {
      cls: 'dcap-in', label: `${w === 'start' ? '開始' : '終了'}の日付`,
      same: (d) => { const st = api.get(), cur = dayOfSt(st, w); return !!cur && parseDateDigits(d, Number(cur.slice(0, 4))) === cur; },
      commit: (d) => {
        const st = api.get(), cur = dayOfSt(st, w);
        const k = cur ? parseDateDigits(d, Number(cur.slice(0, 4))) : null;
        if (!k || (w === 'end' && k < dayOfSt(st, 'start'))) return false; // 存在しない日・開始より前の終了日は元のまま
        close(); api.pick(w, k); return true;
      },
    });
  }
  els.pop.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) { ev.preventDefault(); ev.stopPropagation(); close(true); } });
  els.prev.addEventListener('click', () => nav(-1));
  els.next.addEventListener('click', () => nav(1));
  els.chips.addEventListener('click', (ev) => { const b = ev.target.closest('[data-day]'); if (b && !b.disabled) pick(b.dataset.day); });
  let swiped = false;
  els.grid.addEventListener('click', (ev) => {
    if (swiped) { swiped = false; return; } // スワイプの後に来る click は日の選択にしない
    const b = ev.target.closest('[data-day]');
    if (b && !b.disabled) pick(b.dataset.day);
  });
  // 左右 50pt 以上のスワイプで月を変える（swipe.js と同じ基準）。縦はスクロールに任せる。
  let g = null;
  els.grid.addEventListener('pointerdown', (ev) => { if (ev.isPrimary) g = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; });
  const swipeEnd = (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    g = null;
    if (ev.type === 'pointerup' && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) / Math.max(Math.abs(dy), 1) >= 1.5) {
      swiped = true; setTimeout(() => { swiped = false; }, 400);
      nav(dx < 0 ? 1 : -1);
    }
  };
  els.grid.addEventListener('pointerup', swipeEnd);
  els.grid.addEventListener('pointercancel', swipeEnd);

  // 他の欄に触れたら閉じる（部品の中・日付カプセルは除く）。
  const outside = (ev) => { if (open && !ev.target.closest('#dpop,#f-start,#f-end,#f-stime,#f-etime')) close(); };
  els.box.addEventListener('focusin', outside);
  els.box.closest('form')?.addEventListener('pointerdown', outside, true);
  return { render, close, isOpen: () => open };
}

// ---------- 単独の日付・時刻の欄（繰り返しの終了日・タスクの期限。予定の開始/終了と同じ部品） ----------
// 値はカプセル（button）の .value に持つ。値を変えたら cap から input イベントを上げる（既存のフォームの入口と同じ）。
const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
// opts: { after: 部品を挿入する直前の要素, scope: 外側に触れたら閉じる範囲, label, empty: 空のときの表示,
//   get() → 'YYYY-MM-DD'|'', set(k), min?() → 日|'', holiday?(k), buzz?(), clear?: { label, on() }, canOpen?() }
export function createDateField(cap, opts) {
  const pop = document.createElement('div');
  pop.className = 'dpop dpfield'; pop.hidden = true;
  pop.innerHTML = '<div class="dpchips"></div><div class="dpmh"><button type="button" class="dpnav" aria-label="前の月">‹</button><span class="dpmt" aria-live="polite"></span><button type="button" class="dpnav" aria-label="次の月">›</button></div><div class="dpwk"></div><div class="dpgrid"></div>';
  if (opts.clear) { const b = document.createElement('button'); b.type = 'button'; b.className = 'dpclear'; b.textContent = opts.clear.label; pop.append(b); }
  opts.after.after(pop);
  const q = (c) => pop.querySelector(c);
  const [prev, next] = pop.querySelectorAll('.dpnav');
  let open = false, vm = '';
  const spoken = (k) => dateSpoken(k);
  function render() {
    const k = opts.get();
    cap.textContent = k ? dateLabel(k) : (opts.empty || '日付を選ぶ');
    cap.setAttribute('aria-label', `${opts.label}、${k ? spoken(k) : '未設定'}、ボタン`);
    cap.classList.toggle('open', open); cap.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const m = monthPopParts(vm, { cur: k, min: opts.min?.() || '', holiday: opts.holiday });
    q('.dpmt').textContent = m.title; q('.dpchips').innerHTML = m.chips; q('.dpwk').innerHTML = m.heads; q('.dpgrid').innerHTML = m.grid;
    const c = q('.dpclear'); if (c) c.hidden = !k;
  }
  function show(on) {
    open = on; pop.hidden = !on;
    if (on) { vm = monthOf(opts.get() || todayKey()); opts.after.after(pop); }
    render();
  }
  function close(focusCap = false) { const was = open; if (open) show(false); if (focusCap && was) cap.focus({ preventScroll: true }); }
  function pick(k) { opts.buzz?.(); show(false); opts.set(k); render(); cap.focus({ preventScroll: true }); }
  cap.addEventListener('click', () => { if (opts.canOpen && !opts.canOpen()) return; show(!open); });
  attachDigitEntry(cap, {
    cls: 'dcap-in', label: opts.label,
    blocked: () => (opts.canOpen ? !opts.canOpen() : false),
    same: (d) => { const cur = opts.get(); return !!cur && parseDateDigits(d, Number(cur.slice(0, 4))) === cur; },
    commit: (d) => {
      const cur = opts.get(), k = parseDateDigits(d, Number((cur || todayKey()).slice(0, 4)));
      const min = opts.min?.() || '';
      if (!k || (min && k < min)) return false;
      close(); opts.set(k); render(); return true;
    },
  });
  pop.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) { ev.preventDefault(); ev.stopPropagation(); close(true); } });
  prev.addEventListener('click', () => { vm = addMonths(vm, -1); render(); });
  next.addEventListener('click', () => { vm = addMonths(vm, 1); render(); });
  q('.dpchips').addEventListener('click', (ev) => { const b = ev.target.closest('[data-day]'); if (b && !b.disabled) pick(b.dataset.day); });
  let swiped = false, g = null;
  const grid = q('.dpgrid');
  grid.addEventListener('click', (ev) => {
    if (swiped) { swiped = false; return; }
    const b = ev.target.closest('[data-day]'); if (b && !b.disabled) pick(b.dataset.day);
  });
  grid.addEventListener('pointerdown', (ev) => { if (ev.isPrimary) g = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; });
  const swipeEnd = (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y; g = null;
    if (ev.type === 'pointerup' && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) / Math.max(Math.abs(dy), 1) >= 1.5) {
      swiped = true; setTimeout(() => { swiped = false; }, 400);
      vm = addMonths(vm, dx < 0 ? 1 : -1); render();
    }
  };
  grid.addEventListener('pointerup', swipeEnd); grid.addEventListener('pointercancel', swipeEnd);
  q('.dpclear')?.addEventListener('click', () => { show(false); opts.clear.on(); render(); cap.focus({ preventScroll: true }); });
  const outside = (ev) => { if (open && !pop.contains(ev.target) && ev.target !== cap) close(); };
  (opts.scope || document).addEventListener('focusin', outside);
  (opts.scope || document).addEventListener('pointerdown', outside, true);
  return { render, close, isOpen: () => open };
}

// opts: { after, scope, label, get() → 'HH:mm'|'', set('HH:mm'), buzz?(), canOpen?() }
export function createTimeField(cap, opts) {
  const pop = document.createElement('div');
  pop.className = 'tpop tpfield'; pop.hidden = true;
  pop.innerHTML = '<p class="tlab">時</p><div class="tgrid hgrid"></div><p class="tlab">分 <span class="tnote" hidden></span></p><div class="tgrid mgrid"></div>';
  opts.after.after(pop);
  const hg = pop.querySelector('.hgrid'), mg = pop.querySelector('.mgrid'), note = pop.querySelector('.tnote');
  let open = false;
  hg.innerHTML = hourCellsHtml(null); mg.innerHTML = minCellsHtml(null);
  function render() {
    const v = opts.get(), cur = splitHm(v);
    cap.textContent = v ? t0(v) : '--:--';
    cap.setAttribute('aria-label', `${opts.label}、${v || '未設定'}、ボタン`);
    cap.classList.toggle('open', open); cap.setAttribute('aria-expanded', String(open));
    if (!open) return;
    hg.querySelectorAll('[data-h]').forEach((c) => c.setAttribute('aria-pressed', String(!!cur && Number(c.dataset.h) === cur.h)));
    mg.querySelectorAll('[data-m]').forEach((c) => c.setAttribute('aria-pressed', String(!!cur && Number(c.dataset.m) === cur.mi)));
    const n = cur ? oddMinute(cur.mi) : ''; note.textContent = n; note.hidden = !n;
  }
  function show(on) { open = on; pop.hidden = !on; if (on) opts.after.after(pop); render(); }
  function close(focusCap = false) { const was = open; if (open) show(false); if (focusCap && was) cap.focus({ preventScroll: true }); }
  const set = (h, m) => { opts.set(withHm(opts.get(), h, m)); render(); };
  cap.addEventListener('click', () => { if (opts.canOpen && !opts.canOpen()) return; show(!open); });
  attachDigitEntry(cap, {
    cls: 'tcap-in', label: opts.label,
    blocked: () => (opts.canOpen ? !opts.canOpen() : false),
    same: (d) => { const t = parseTimeDigits(d), c = splitHm(opts.get()); return !!t && !!c && t.h === c.h && t.m === c.mi; },
    commit: (d) => { const t = parseTimeDigits(d); if (!t) return false; close(); opts.set(withHm('', t.h, t.m)); render(); return true; },
  });
  hg.addEventListener('click', (ev) => { const b = ev.target.closest('[data-h]'); if (!b) return; opts.buzz?.(); set(Number(b.dataset.h), null); }); // 分はそのまま
  mg.addEventListener('click', (ev) => { const b = ev.target.closest('[data-m]'); if (!b) return; opts.buzz?.(); set(null, Number(b.dataset.m)); close(true); });
  pop.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) { ev.preventDefault(); ev.stopPropagation(); close(true); } });
  const outside = (ev) => { if (open && !pop.contains(ev.target) && ev.target !== cap) close(); };
  (opts.scope || document).addEventListener('focusin', outside);
  (opts.scope || document).addEventListener('pointerdown', outside, true);
  return { render, close, isOpen: () => open };
}
export { fire as fireInput };
