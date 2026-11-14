// 最適化前の recur.js（HEAD 5512061 時点）。最適化後の expand / countBefore との一致確認用の基準実装。変更しないこと。
// 繰り返し予定の展開・編集計画。DOM に依存しない純粋関数。日付キーは YYYY-MM-DD、日時は YYYY-MM-DDTHH:MM（端末ローカル）。
import { addDays, daysInMonth, dayOf, pad, parseKey, weekStartOf } from '../../js/util.js';
const weekStart = (k) => weekStartOf(k, 0); // 繰り返しの週は日曜基準（表示の週の始まり設定とは別）

const dayDiff = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);
const BODY = ['title', 'categoryId', 'place', 'notes', 'alarms'];
// alarms は配列なので JSON で比べる（null・未定義は同じ扱い）。
const bodyEq = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

export const normRule = (r) => (r
  ? { freq: r.freq, interval: 1, byDay: r.freq === 'weekly' ? [...new Set(r.byDay || [])].sort((a, b) => a - b) : null, count: r.count ?? null, until: r.until ?? null }
  : null);
export const ruleEq = (a, b) => JSON.stringify(normRule(a)) === JSON.stringify(normRule(b));

// 存在する開始日を昇順に無限列挙（count 指定時は anchor から、無指定時は from へジャンプ可）。
function* candidates(rule, anchor, from) {
  const start = from > anchor ? from : anchor;
  const y0 = Number(start.slice(0, 4)), m0 = Number(start.slice(5, 7)) - 1;
  const key = (y, m, d) => `${String(y).padStart(4, '0')}-${pad(m + 1)}-${pad(d)}`;
  if (rule.freq === 'daily') {
    for (let n = dayDiff(start, anchor); ; n++) yield addDays(anchor, n);
  } else if (rule.freq === 'weekly') {
    const by = rule.byDay?.length ? [...rule.byDay].sort((a, b) => a - b) : [parseKey(anchor).getDay()];
    for (let ws = weekStart(start); ; ws = addDays(ws, 7)) for (const d of by) { const k = addDays(ws, d); if (k >= start) yield k; }
  } else if (rule.freq === 'monthly') {
    const dom = Number(anchor.slice(8));
    for (let i = 0; ; i++) {
      const y = y0 + Math.floor((m0 + i) / 12), m = (m0 + i) % 12;
      if (dom <= daysInMonth(y, m)) { const k = key(y, m, dom); if (k >= start) yield k; }
    }
  } else {
    const mo = Number(anchor.slice(5, 7)) - 1, dom = Number(anchor.slice(8));
    for (let y = y0; ; y++) if (dom <= daysInMonth(y, mo)) { const k = key(y, mo, dom); if (k >= start) yield k; }
  }
}
// DST 等で存在しないローカル時刻はその回をスキップ。
function validTime(k, tm) {
  const [y, m, d] = k.split('-').map(Number), hh = Number(tm.slice(0, 2)), mi = Number(tm.slice(3, 5));
  const t = new Date(y, m - 1, d, hh, mi);
  return t.getHours() === hh && t.getMinutes() === mi;
}

export const parseOccId = (id) => {
  const m = /^(.*)@(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/.exec(String(id));
  return m ? { parentId: m[1], occKey: m[2] } : null;
};

function make(p, key) {
  const k = key.slice(0, 10), o = p.overrides?.[key];
  const dd = dayDiff(dayOf(p.end), dayOf(p.start));
  const base = o
    ? { title: o.title, categoryId: o.categoryId ?? p.categoryId, all: !!o.all, start: o.start, end: o.end, place: o.place || '', notes: o.notes || '' }
    : { title: p.title, categoryId: p.categoryId, all: !!p.all, start: key, end: `${addDays(k, dd)}T${p.end.slice(11)}`, place: p.place || '', notes: p.notes || '' };
  // 通知（alarms）は個別変更 → 親の順に継承。どちらにも無ければ項目を作らない。
  const alarms = o?.alarms !== undefined && o.alarms !== null ? o.alarms : p.alarms;
  if (alarms !== undefined) base.alarms = alarms;
  return { ...base, id: `${p.id}@${key}`, parentId: p.id, occKey: key, recurring: true, moved: !!o };
}
export const occurrenceAt = make;

// 日付キー範囲 [rs, re]（両端含む）に重なる予定・各回を返す。通常予定はそのまま、繰り返しは各回を別オブジェクトで。
export function expand(events, rs, re) {
  const out = [];
  const hit = (e) => dayOf(e.start) <= re && dayOf(e.end) >= rs;
  for (const p of events) {
    if (!p.recurrence) { if (hit(p)) out.push(p); continue; }
    const rule = p.recurrence, anchor = dayOf(p.start), tm = p.start.slice(11);
    const dd = dayDiff(dayOf(p.end), anchor);
    const ex = new Set(p.exdates || []), ov = p.overrides || {};
    const seen = new Set();
    const from = rule.count == null ? addDays(rs, -dd) : anchor;
    let idx = 0, guard = 0;
    for (const k of candidates(rule, anchor, from)) {
      if (k > re || ++guard > 400000) break;
      if (rule.until && k > rule.until) break;
      if (!validTime(k, tm)) continue;
      idx++;
      if (rule.count != null && idx > rule.count) break;
      const key = `${k}T${tm}`;
      seen.add(key);
      if (ex.has(key)) continue;
      const occ = make(p, key);
      if (hit(occ)) out.push(occ);
    }
    // 元の位置が範囲外でも、移動先が範囲内の例外を拾う。
    for (const key of Object.keys(ov)) {
      if (seen.has(key) || ex.has(key)) continue;
      const occ = make(p, key);
      if (hit(occ)) out.push(occ);
    }
  }
  return out;
}

// boundaryKey（回の開始日時）より前の実在する回数（削除例外も数える）。
export function countBefore(p, boundaryKey) {
  if (!p.recurrence) return 0;
  const anchor = dayOf(p.start), tm = p.start.slice(11);
  let n = 0, guard = 0;
  for (const k of candidates(p.recurrence, anchor, anchor)) {
    if (`${k}T${tm}` >= boundaryKey || ++guard > 400000) break;
    if (validTime(k, tm)) n++;
  }
  return n;
}
export const isFirstOccurrence = (p, occKey) => occKey <= p.start;

// alarms は入力側（フォーム）が持っているときだけ載せる（持っていない形を null で上書きしない）。
const pick = (o) => ({ title: o.title, categoryId: o.categoryId, all: !!o.all, start: o.start, end: o.end, place: o.place || '', notes: o.notes || '', ...(o.alarms !== undefined ? { alarms: o.alarms } : {}) });
const filterKeys = (obj, fn) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => fn(k)));
const hasExceptions = (p, fn = () => true) => (p.exdates || []).some(fn) || Object.keys(p.overrides || {}).some(fn);

// 元系列を境界の前日で打ち切った親（回数は until へ置換）。
function cutParent(p, occKey) {
  const cut = addDays(occKey.slice(0, 10), -1);
  return { ...p, recurrence: { ...normRule(p.recurrence), count: null, until: cut }, exdates: (p.exdates || []).filter((k) => k < occKey), overrides: filterKeys(p.overrides, (k) => k < occKey), updatedAt: Date.now() };
}

// 編集の影響を事前に調べる（範囲シートの表示用）。
export function editInfo(p, occKey, form) {
  const occ = make(p, occKey);
  const ruleChanged = !ruleEq(form.recurrence, p.recurrence);
  const timeChanged = form.start !== occ.start || form.end !== occ.end || !!form.all !== !!occ.all;
  const changedBody = BODY.filter((f) => !bodyEq(form[f], occ[f]) && (f !== 'alarms' || form.alarms !== undefined));
  return {
    occ, ruleChanged, timeChanged, changedBody,
    clears: (scope) => (ruleChanged || timeChanged) && (scope === 'only' ? false : hasExceptions(p, scope === 'following' ? (k) => k >= occKey : () => true)),
  };
}

// scope: 'only' | 'following' | 'all'。戻り値 { puts, dels }。呼び出し側が1トランザクションで適用する。
export function planEdit(p, occKey, scope, form, newId) {
  const info = editInfo(p, occKey, form);
  const { occ, ruleChanged, timeChanged, changedBody } = info;
  const now = Date.now();
  const formVals = pick(form);
  if (scope === 'only') {
    return { puts: [{ ...p, overrides: { ...p.overrides, [occKey]: formVals }, updatedAt: now }], dels: [] };
  }
  if (scope === 'following' && !isFirstOccurrence(p, occKey)) {
    const before = countBefore(p, occKey);
    const keep = !ruleChanged && !timeChanged;
    const rule = form.recurrence ? { ...normRule(form.recurrence) } : null;
    if (rule && rule.count != null && !ruleChanged) rule.count = Math.max(1, (p.recurrence?.count ?? rule.count) - before);
    const ov = {};
    if (keep) {
      for (const [k, o] of Object.entries(p.overrides || {})) {
        if (k <= occKey) continue;
        ov[k] = { ...o, ...Object.fromEntries(changedBody.map((f) => [f, form[f]])) };
      }
    }
    const np = {
      id: newId(), ...(p.alarms !== undefined ? { alarms: p.alarms } : {}), ...formVals, recurrence: rule, notes: formVals.notes,
      exdates: keep ? (p.exdates || []).filter((k) => k > occKey) : [], overrides: ov, updatedAt: now,
    };
    return { puts: [cutParent(p, occKey), np], dels: [] };
  }
  // 'all'（または最初の回への 'following'）
  const np = { ...p, updatedAt: now };
  for (const f of changedBody) np[f] = form[f];
  if (timeChanged) {
    const dayDelta = dayDiff(dayOf(form.start), dayOf(occ.start));
    const sd = addDays(dayOf(p.start), dayDelta);
    const len = dayDiff(dayOf(form.end), dayOf(form.start));
    np.start = `${sd}T${form.start.slice(11)}`;
    np.end = `${addDays(sd, len)}T${form.end.slice(11)}`;
    np.all = !!form.all;
  }
  if (ruleChanged) np.recurrence = form.recurrence ? normRule(form.recurrence) : null;
  if (ruleChanged || timeChanged) { np.exdates = []; np.overrides = {}; }
  else if (changedBody.length) {
    np.overrides = Object.fromEntries(Object.entries(p.overrides || {}).map(([k, o]) => [k, { ...o, ...Object.fromEntries(changedBody.map((f) => [f, form[f]])) }]));
  }
  return { puts: [np], dels: [] };
}

export function planDelete(p, occKey, scope) {
  if (scope === 'only') {
    const ov = { ...p.overrides }; delete ov[occKey];
    return { puts: [{ ...p, exdates: [...new Set([...(p.exdates || []), occKey])], overrides: ov, updatedAt: Date.now() }], dels: [] };
  }
  if (scope === 'following' && !isFirstOccurrence(p, occKey)) return { puts: [cutParent(p, occKey)], dels: [] };
  return { puts: [], dels: [p.id] };
}
