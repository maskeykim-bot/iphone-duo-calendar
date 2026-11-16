// 時刻のカプセル・長さのチップ・時分のマス（設計12 §1–2）。状態の計算は datetime.js、保存は app.js。
// ここは表示と操作だけ。開くのは一度に一つ。開いて閉じただけでは何も変えない。
import { splitIso, durationMin, endDayOffset } from './datetime.js';
import { DOW, addDays, addMonths, parseKey, todayKey, weekStart, weekdayHeads } from './util.js';

const p2 = (n) => String(n).padStart(2, '0');
export const DURATIONS = [30, 60, 90, 120, 180];
export const durLabel = (m) => (m < 60 ? `${m}分` : `${m / 60}時間`);
// 終了の札（翌日／+N日）。0日以下は出さない。
export const dayBadge = (n) => (n >= 2 ? `+${n}日` : n === 1 ? '翌日' : '');
// 7〜21時を目立たせる（押せるのはどの時間も同じ）
export const hourUsual = (h) => h >= 7 && h <= 21;
// 5分刻みでない分は「いま 07分」と見出しに出し、マスはどれも選ばない
export const oddMinute = (mi) => (mi % 5 === 0 ? '' : `いま ${p2(mi)}分`);
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

// els: { start, end（時刻カプセル）, badge, dur（長さの行）, pop, rows: {start,end}, hours, mins, minNote }
// api: { get() → 編集状態または null, setTime(which, h, m), setDuration(min), buzz() }
export function createTimeUi(els, api) {
  let open = null; // 'start' | 'end' | null
  const caps = { start: els.start, end: els.end };

  function render() {
    const st = api.get();
    const t = (iso) => (iso ? iso.slice(11, 16) : '--:--');
    els.start.textContent = st ? t(st.start) : '--:--';
    els.end.textContent = st ? t(st.end) : '--:--';
    const b = st && !st.all ? dayBadge(endDayOffset(st)) : '';
    els.badge.textContent = b; els.badge.hidden = !b;
    els.end.append(els.badge);
    els.start.setAttribute('aria-label', `開始の時刻、${t(st?.start)}、ボタン`);
    els.end.setAttribute('aria-label', `終了の時刻、${t(st?.end)}${b ? `、${b}` : ''}、ボタン`);
    const len = st && !st.all ? durationMin(st.start, st.end) : NaN;
    els.dur.querySelectorAll('[data-min]').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.min) === len)));
    for (const k of ['start', 'end']) {
      caps[k].classList.toggle('open', open === k);
      caps[k].setAttribute('aria-expanded', String(open === k));
    }
    if (open && st) {
      const cur = splitIso(st[open]);
      els.hours.querySelectorAll('[data-h]').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.h) === cur.h)));
      els.mins.querySelectorAll('[data-m]').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.m) === cur.mi)));
      const note = oddMinute(cur.mi);
      els.minNote.textContent = note; els.minNote.hidden = !note;
    }
  }
  function show(which) {
    open = which;
    els.pop.hidden = !which;
    if (which) els.rows[which].after(els.pop);
    render();
  }
  function close() { if (open) show(null); }

  els.hours.innerHTML = HOURS.map((h) => `<button type="button" class="tcell ${hourUsual(h) ? 'usual' : 'rare'}" data-h="${h}" aria-label="${h}時" aria-pressed="false">${h}</button>`).join('');
  els.mins.innerHTML = MINUTES.map((m) => `<button type="button" class="tcell mcell" data-m="${m}" aria-label="${p2(m)}分" aria-pressed="false">${p2(m)}</button>`).join('');
  els.dur.innerHTML = DURATIONS.map((m) => `<button type="button" class="dchip" data-min="${m}" aria-pressed="false">${durLabel(m)}</button>`).join('');

  for (const k of ['start', 'end']) {
    caps[k].addEventListener('click', () => { if (api.get()?.all) return; show(open === k ? null : k); });
  }
  els.hours.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-h]');
    if (!b || !open) return;
    api.buzz();
    api.setTime(open, Number(b.dataset.h), null); // 分はそのまま（07分も保つ）
    render();
  });
  els.mins.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-m]');
    if (!b || !open) return;
    api.buzz();
    api.setTime(open, null, Number(b.dataset.m));
    close();
  });
  els.dur.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-min]');
    if (!b) return;
    close();
    api.buzz();
    api.setDuration(Number(b.dataset.min));
  });
  // 他の欄に触れたら閉じる（部品の中・カプセルは除く）。シートの引き下げ・親の月送りへ伝えない。
  const outside = (ev) => { if (open && !ev.target.closest('#tpop,#f-stime,#f-etime')) close(); };
  els.box.addEventListener('focusin', outside);
  els.box.closest('form')?.addEventListener('pointerdown', outside, true);
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
const monthOf = (k) => `${k.slice(0, 8)}01`;
// 週始まり設定どおりの6週（42日）。月が5週でも6行出す。
export function monthGrid6(vm) {
  const st = weekStart(vm);
  return Array.from({ length: 42 }, (_, i) => addDays(st, i));
}
export const SWIPE_MIN = 50;

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
    const cur = dayOfSt(st, open), min = open === 'end' ? dayOfSt(st, 'start') : '', today = todayKey();
    const d = parseKey(vm);
    els.title.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月`;
    const chips = [['今日', today], ['明日', addDays(today, 1)], [`来週の${DOW[parseKey(today).getDay()]}曜`, addDays(today, 7)]];
    els.chips.innerHTML = chips.map(([t, k]) => `<button type="button" class="dpchip" data-day="${k}"${k < min ? ' disabled' : ''}>${t}</button>`).join('');
    els.heads.innerHTML = weekdayHeads().map(({ i, label }) => `<span class="${i === 0 ? 'hol' : ''}">${label}</span>`).join('');
    els.grid.innerHTML = monthGrid6(vm).map((k) => {
      const c = parseKey(k), out = k.slice(0, 7) !== vm.slice(0, 7), red = c.getDay() === 0 || api.holiday(k);
      const off = !!min && k < min;
      return `<button type="button" class="dcell${out ? ' out' : ''}${red ? ' hol' : ''}${k === today ? ' tod' : ''}${k === cur ? ' sel' : ''}" data-day="${k}" aria-label="${dateSpoken(k)}" aria-pressed="${k === cur}"${off ? ' disabled' : ''}><span class="n">${c.getDate()}</span></button>`;
    }).join('');
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
  function close() { if (open) show(null); }
  function pick(k) {
    if (!open) return;
    const w = open;
    api.buzz();
    show(null);
    api.pick(w, k);
  }
  function nav(n) { vm = addMonths(vm, n); render(); }

  for (const w of ['start', 'end']) {
    caps[w].addEventListener('click', () => { if (!api.get()) return; show(open === w ? null : w); });
  }
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
  const outside = (ev) => { if (open && !ev.target.closest('#dpop,#f-start,#f-end')) close(); };
  els.box.addEventListener('focusin', outside);
  els.box.closest('form')?.addEventListener('pointerdown', outside, true);
  return { render, close, isOpen: () => open };
}
