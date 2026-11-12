// バックアップの書き出し・検証・追加計画。DOM に依存しない。
import { CATS, FREQS, LIMITS, isKey } from './util.js';
import { normRule } from './recur.js';

export const APP = 'duo-calendar';
export const VERSION = 2;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_EVENTS = 10000;
export const MAX_EXCEPTIONS = 100000;
const VIEWS = ['day', 'week', 'month'];
const STYLES = { simple: 'simple', named: 'named', names: 'named' };
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const isStamp = (s) => typeof s === 'string' && STAMP.test(s) && isKey(s.slice(0, 10)) && Number(s.slice(11, 13)) < 24 && Number(s.slice(14)) < 60;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// 端末ローカルの ISO 8601（UTC オフセット付き）。
export function localIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset(), a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
export const backupName = (d = new Date()) => `duo-calendar-backup-${localIso(d).slice(0, 10)}.json`;

const clean = (e) => ({
  id: e.id, title: e.title, cat: e.cat, all: !!e.all, start: e.start, end: e.end, place: e.place || '', notes: e.notes || '',
  recurrence: e.recurrence ? normRule(e.recurrence) : null, exdates: [...(e.exdates || [])], overrides: e.overrides || {},
  ...(e.updatedAt != null ? { updatedAt: e.updatedAt } : {}),
});
export function buildBackup(events, settings, now = new Date()) {
  return { app: APP, version: VERSION, exportedAt: localIso(now), events: events.map(clean), settings: { view: settings.view, style: settings.style, desk: !!settings.desk } };
}
export const countStats = (events) => ({
  total: events.length,
  recurring: events.filter((e) => e.recurrence).length,
  exceptions: events.reduce((n, e) => n + (e.exdates?.length || 0) + Object.keys(e.overrides || {}).length, 0),
});

// 本文系フィールドの検証。失敗時は理由の文字列。
function checkBody(o, where) {
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > LIMITS.title) return `${where}: 予定名が不正です`;
  if (!Object.hasOwn(CATS, o.cat)) return `${where}: カテゴリが不正です`;
  if (o.all !== undefined && typeof o.all !== 'boolean') return `${where}: 終日の指定が不正です`;
  if (!isStamp(o.start) || !isStamp(o.end)) return `${where}: 不正な日時です`;
  if (o.end < o.start) return `${where}: 終了が開始より前です`;
  if (o.place !== undefined && (typeof o.place !== 'string' || o.place.length > LIMITS.place)) return `${where}: 場所が不正です`;
  if (o.notes !== undefined && (typeof o.notes !== 'string' || o.notes.length > LIMITS.notes)) return `${where}: メモが不正です`;
  return '';
}
function checkRule(r, where) {
  if (!isObj(r) || !Object.hasOwn(FREQS, r.freq)) return `${where}: 繰り返しの種類が不正です`;
  if (r.interval !== undefined && r.interval !== 1) return `${where}: 繰り返しの間隔が不正です`;
  if (r.freq === 'weekly') {
    if (!Array.isArray(r.byDay) || !r.byDay.length || !r.byDay.every((n) => Number.isInteger(n) && n >= 0 && n <= 6)) return `${where}: 曜日の指定が不正です`;
  } else if (r.byDay != null && !(Array.isArray(r.byDay) && !r.byDay.length)) return `${where}: 曜日の指定が不正です`;
  const hasCount = r.count != null, hasUntil = r.until != null;
  if (hasCount && hasUntil) return `${where}: 回数と終了日は同時に指定できません`;
  if (hasCount && !(Number.isInteger(r.count) && r.count >= 1 && r.count <= LIMITS.count)) return `${where}: 回数が不正です`;
  if (hasUntil && !isKey(r.until)) return `${where}: 終了日が不正です`;
  return '';
}

// 戻り値: { ok:true, data:{exportedAt, events, settings} } | { ok:false, reason }。DB には一切触れない。
export function validateBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, reason: 'JSONとして読み込めません（壊れたファイル）' }; }
  if (!isObj(obj) || obj.app !== APP) return { ok: false, reason: '未対応の形式です（Duoのバックアップではありません）' };
  if (obj.version !== VERSION) return { ok: false, reason: `未対応のバージョンです（version: ${String(obj.version).slice(0, 20)}）` };
  if (!Array.isArray(obj.events)) return { ok: false, reason: '予定の一覧（events）がありません' };
  if (obj.events.length > MAX_EVENTS) return { ok: false, reason: `予定が多すぎます（上限${MAX_EVENTS}件）` };
  if (typeof obj.exportedAt !== 'string' || Number.isNaN(Date.parse(obj.exportedAt))) return { ok: false, reason: '書き出し日時が不正です' };
  let settings = null;
  if (obj.settings != null) {
    const s = obj.settings;
    if (!isObj(s)) return { ok: false, reason: '設定が不正です' };
    if (s.view !== undefined && !VIEWS.includes(s.view)) return { ok: false, reason: '設定の表示モードが不正です' };
    if (s.style !== undefined && !Object.hasOwn(STYLES, s.style)) return { ok: false, reason: '設定の月表現が不正です' };
    if (s.desk !== undefined && typeof s.desk !== 'boolean') return { ok: false, reason: '設定の卓上指定が不正です' };
    settings = {};
    if (s.view !== undefined) settings.view = s.view;
    if (s.style !== undefined) settings.style = STYLES[s.style];
    if (s.desk !== undefined) settings.desk = s.desk;
  }
  const ids = new Set(), events = [];
  let exceptions = 0;
  for (const [i, e] of obj.events.entries()) {
    const where = `${i + 1}件目`;
    if (!isObj(e)) return { ok: false, reason: `${where}: 予定の形式が不正です` };
    if (!((typeof e.id === 'string' && e.id) || (typeof e.id === 'number' && Number.isFinite(e.id)))) return { ok: false, reason: `${where}: idが不正です` };
    if (ids.has(e.id)) return { ok: false, reason: `${where}: idが重複しています` };
    ids.add(e.id);
    let r = checkBody(e, where);
    if (r) return { ok: false, reason: r };
    if (e.recurrence != null) { r = checkRule(e.recurrence, where); if (r) return { ok: false, reason: r }; }
    if (e.exdates !== undefined && !(Array.isArray(e.exdates) && e.exdates.every(isStamp))) return { ok: false, reason: `${where}: 削除指定が不正です` };
    if (e.overrides !== undefined && !isObj(e.overrides)) return { ok: false, reason: `${where}: 個別変更が不正です` };
    for (const [k, o] of Object.entries(e.overrides || {})) {
      if (!isStamp(k) || !isObj(o)) return { ok: false, reason: `${where}: 個別変更のキーが不正です` };
      r = checkBody(o, `${where}の個別変更`);
      if (r) return { ok: false, reason: r };
    }
    if ((e.exdates?.length || e.overrides && Object.keys(e.overrides).length) && !e.recurrence) return { ok: false, reason: `${where}: 繰り返しがないのに例外があります` };
    exceptions += (e.exdates?.length || 0) + Object.keys(e.overrides || {}).length;
    if (exceptions > MAX_EXCEPTIONS) return { ok: false, reason: `例外が多すぎます（上限${MAX_EXCEPTIONS}件）` };
    if (e.updatedAt !== undefined && typeof e.updatedAt !== 'number') return { ok: false, reason: `${where}: 更新日時が不正です` };
    const ov = Object.fromEntries(Object.entries(e.overrides || {}).map(([k, o]) => [k, { title: o.title, cat: o.cat, all: !!o.all, start: o.start, end: o.end, place: o.place || '', notes: o.notes || '' }]));
    events.push({ ...clean(e), overrides: ov });
  }
  return { ok: true, data: { exportedAt: obj.exportedAt, events, settings } };
}

// 重複判定用: id と updatedAt を除いた内容（キー順・byDay/exdates の順序を正規化）。
const sortObj = (v) => (Array.isArray(v) ? v.map(sortObj) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortObj(v[k])])) : v);
export function contentKey(e) {
  const { id, updatedAt, ...rest } = clean(e);
  void id; void updatedAt;
  rest.exdates = [...rest.exdates].sort();
  return JSON.stringify(sortObj(rest));
}
export function planAppend(current, incoming) {
  const byId = new Map(current.map((e) => [e.id, e]));
  const keys = new Set(current.map(contentKey));
  const add = []; let dup = 0, conflict = 0;
  for (const e of incoming) {
    const k = contentKey(e), same = byId.get(e.id);
    if (same) { if (contentKey(same) === k) dup++; else conflict++; continue; }
    if (keys.has(k)) { dup++; continue; }
    keys.add(k); add.push(e);
  }
  return { add, dup, conflict, skipped: dup + conflict };
}
