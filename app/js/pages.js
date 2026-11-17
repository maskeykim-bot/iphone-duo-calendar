// 開いた横（見開き）の左右ページと、開いた縦の下パネルが何を出すかの状態。描画は持たない。
// ホームは独立したページ。新規の横は左ホーム・右月。保存済みの有効な左右は尊重する（normalizePages は有効値を書き換えない）。
export const PAGE_IDS = ['home', 'month', 'time', 'task', 'memo'];
export const DEFAULT_PAGES = { left: 'home', right: 'month', portraitBottom: 'time', portraitShown: false };
export const BOTTOM_IDS = ['home', 'time', 'task', 'memo'];
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

// 時間ページの表示（左右のペインごと）。'1' 1日 | '3' 3日 | 'week' 週 | 'list' 予定リスト（選択日以降。値は従来のまま）。不正・欠落は '1'。
export const TIME_MODES = ['1', '3', 'week', 'list'];
export const TIME_LABELS = { 1: '1日', 3: '3日', week: '週', list: 'リスト' };
export function normTimeMode(t) {
  const s = t && typeof t === 'object' ? t : {};
  const f = (v) => (TIME_MODES.includes(v) ? v : '1');
  return { left: f(s.left), right: f(s.right) };
}

// 開いた縦の集中モード（カレンダー｜タスク｜ノート）。未設定・不正は 'calendar'。保存済みの値は次の開いた縦でも使う。
export const FOCUS_MODES = ['calendar', 'task', 'note'];
export const FOCUS_LABELS = { calendar: 'カレンダー', task: 'タスク', note: 'ノート' };
export const normFocusMode = (v) => (FOCUS_MODES.includes(v) ? v : 'calendar');
