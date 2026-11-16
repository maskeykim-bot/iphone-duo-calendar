// 時刻のカプセル・長さのチップ・時分のマス（設計12 §1–2）。状態の計算は datetime.js、保存は app.js。
// ここは表示と操作だけ。開くのは一度に一つ。開いて閉じただけでは何も変えない。
import { splitIso, durationMin, endDayOffset } from './datetime.js';

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
