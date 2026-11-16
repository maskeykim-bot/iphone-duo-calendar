// 開いた横（見開き）の左右ページと、開いた縦の下パネルが何を出すかの状態。描画は持たない。
export const PAGE_IDS = ['month', 'time', 'task', 'memo'];
export const DEFAULT_PAGES = { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false };
const BOTTOM_IDS = ['time', 'task', 'memo'];
const ok = (v) => PAGE_IDS.includes(v);
const firstFree = (taken, prefer) => [prefer, ...PAGE_IDS].find((id) => !taken.includes(id));

// 保存値・不正値を安全な形へ。左右は必ず別のページ（重複は右を空いているものへ）。
export function normalizePages(p) {
  const s = p && typeof p === 'object' ? p : {};
  const l = ok(s.left) ? s.left : null;
  let r = ok(s.right) ? s.right : null;
  if (l && l === r) r = null;
  const left = l || firstFree([r], DEFAULT_PAGES.left);
  const right = r || firstFree([left], DEFAULT_PAGES.right);
  return {
    left, right,
    portraitBottom: BOTTOM_IDS.includes(s.portraitBottom) ? s.portraitBottom : DEFAULT_PAGES.portraitBottom,
    portraitShown: s.portraitShown === true,
  };
}

// side（'left' | 'right' | 'portraitBottom'）のページを id にする。左右で同じ種類になる場合は交換。新しい値を返す（入力は変えない）。
export function selectPage(pages, side, id) {
  const p = normalizePages(pages);
  if (!ok(id)) return p;
  if (side === 'portraitBottom') return BOTTOM_IDS.includes(id) ? { ...p, portraitBottom: id } : p;
  if (side !== 'left' && side !== 'right') return p;
  const other = side === 'left' ? 'right' : 'left';
  if (p[side] === id) return p;
  if (p[other] === id) return { ...p, [side]: id, [other]: p[side] };
  return { ...p, [side]: id };
}

// 時間ページの表示（左右のペインごと）。'1' 1日 | '3' 3日 | 'week' 週 | 'list' 一覧。不正・欠落は '1'。
export const TIME_MODES = ['1', '3', 'week', 'list'];
export const TIME_LABELS = { 1: '1日', 3: '3日', week: '週', list: '一覧' };
export function normTimeMode(t) {
  const s = t && typeof t === 'object' ? t : {};
  const f = (v) => (TIME_MODES.includes(v) ? v : '1');
  return { left: f(s.left), right: f(s.right) };
}
