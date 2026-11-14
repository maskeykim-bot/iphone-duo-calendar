// バックアップの書き出し・検証・追加計画。DOM に依存しない。
import { FREQS, LIMITS, isKey } from './util.js';
import { expand, normRule } from './recur.js';
import { CAT_IDS, LEGACY, UNCATEGORIZED, legacyToId, validateCategory } from './categories.js';

export const APP = 'duo-calendar';
export const VERSION = 3;
export const SCHEMA = 3; // 書き出した端末の IndexedDB SCHEMA_VERSION（参考情報）
export const READABLE = [1, 2, 3];
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

const LIMIT_CATS = 50;

// ---------- 書き出し（項目を限定しない） ----------
// 表示用に作る項目と危険なキーだけを除き、それ以外（nativeLink・alarms・未知の項目）はそのまま持つ。
const RUNTIME = new Set(['recurring', 'occKey', 'parentId', 'moved', 'origin']);
const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
const deepClean = (v) => {
  if (Array.isArray(v)) return v.map(deepClean);
  if (isObj(v)) { const o = {}; for (const [k, x] of Object.entries(v)) if (!DANGEROUS.has(k)) o[k] = deepClean(x); return o; }
  return v;
};
export function stripRuntime(e) {
  const o = {};
  for (const [k, x] of Object.entries(e || {})) if (!RUNTIME.has(k) && !DANGEROUS.has(k)) o[k] = deepClean(x);
  return o;
}
const bodyDefaults = (o) => ({ ...o, all: !!o.all, place: o.place || '', notes: o.notes || '' });
// 保存・書き出し・読み込みで共通の整形。未知の項目は残し、既知の項目だけ既定値で補う。
function shape(e) {
  const o = bodyDefaults(stripRuntime(e));
  o.recurrence = o.recurrence ? { ...o.recurrence, ...normRule(o.recurrence) } : null;
  o.exdates = [...(o.exdates || [])];
  o.overrides = Object.fromEntries(Object.entries(o.overrides || {}).map(([k, v]) => [k, bodyDefaults(v)]));
  return o;
}
export const exportEvent = shape;

const NOTIFY_BEFORE = [0, 5, 10, 15, 30, 60, 120, 1440, 2880];
const NOTIFY_DAYS = [0, 1, 2, 7];
const isHm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const okTimed = (a) => isObj(a) && NOTIFY_BEFORE.includes(a.before);
const okAllDay = (a) => isObj(a) && NOTIFY_DAYS.includes(a.day) && isHm(a.at);

// categories: 現在のカテゴリ一覧。settings: { view, style, desk, monthExpand, weekStart(0|1), notify? }。
export function buildBackup(events, settings = {}, now = new Date(), categories = []) {
  const s = { view: settings.view, style: settings.style, desk: !!settings.desk, monthExpand: !!settings.monthExpand };
  if (settings.weekStart === 0 || settings.weekStart === 1) s.weekStart = settings.weekStart;
  if (isObj(settings.notify)) s.notify = deepClean(settings.notify);
  return { app: APP, version: VERSION, schema: SCHEMA, exportedAt: localIso(now), categories: categories.map((c) => deepClean(c)), events: events.map(exportEvent), settings: s };
}
export const countStats = (events) => ({
  total: events.length,
  recurring: events.filter((e) => e.recurrence).length,
  exceptions: events.reduce((n, e) => n + (e.exdates?.length || 0) + Object.keys(e.overrides || {}).length, 0),
});

// ---------- 読み込みの検証 ----------
// 本文系フィールドの検証。失敗時は理由の文字列。カテゴリは categoryId か旧 cat のどちらか。
const goodCatId = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 64;
function checkBody(o, where) {
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > LIMITS.title) return `${where}: 予定名が不正です`;
  if (!goodCatId(o.categoryId) && typeof o.cat !== 'string') return `${where}: カテゴリが不正です`;
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

// alarms（B.2 の形・最大2件。null は継承）と nativeLink（C.2 の形）。不正ならその項目だけ捨てる。
const alarmsOk = (a) => a === null || (Array.isArray(a) && a.length <= 2 && a.every((x) => okTimed(x) || okAllDay(x)));
const LINK_STATES = ['pending', 'linked', 'unlinked'];
const LINK_STR = ['requestId', 'calendarId', 'itemId', 'externalId', 'ekIdentifier', 'eventId'];
const linkOk = (l) => isObj(l) && LINK_STATES.includes(l.state)
  && LINK_STR.every((k) => l[k] == null || (typeof l[k] === 'string' && l[k].length <= 500))
  && (l.v == null || Number.isInteger(l.v)) && (l.syncedAt == null || Number.isFinite(l.syncedAt))
  && (l.warn == null || l.warn === 'missing' || l.warn === 'writeOnly');
// 予定・個別変更に共通の任意項目の検証。捨てた件数を返す。
function checkOptional(o) {
  let dropped = 0;
  if (o.alarms !== undefined && !alarmsOk(o.alarms)) { delete o.alarms; dropped++; }
  if (o.nativeLink !== undefined && !linkOk(o.nativeLink)) { delete o.nativeLink; dropped++; }
  return dropped;
}

// 設定の検証（未知のキーは無視）。{ value } | { error }
function checkSettings(s) {
  if (!isObj(s)) return { error: '設定が不正です' };
  if (s.view !== undefined && !VIEWS.includes(s.view)) return { error: '設定の表示モードが不正です' };
  if (s.style !== undefined && !Object.hasOwn(STYLES, s.style)) return { error: '設定の月表現が不正です' };
  if (s.desk !== undefined && typeof s.desk !== 'boolean') return { error: '設定の卓上指定が不正です' };
  if (s.monthExpand !== undefined && typeof s.monthExpand !== 'boolean') return { error: '設定の月の広げる表示が不正です' };
  if (s.weekStart !== undefined && s.weekStart !== 0 && s.weekStart !== 1) return { error: '設定の週の始まりが不正です' };
  const out = {};
  if (s.weekStart !== undefined) out.weekStart = s.weekStart;
  if (s.view !== undefined) out.view = s.view;
  if (s.style !== undefined) out.style = STYLES[s.style];
  if (s.desk !== undefined) out.desk = s.desk;
  if (s.monthExpand !== undefined) out.monthExpand = s.monthExpand;
  if (s.notify != null) {
    const n = s.notify;
    if (!isObj(n) || (n.enabled !== undefined && typeof n.enabled !== 'boolean') || (n.showTitle !== undefined && typeof n.showTitle !== 'boolean')
      || (n.defaultTimed !== undefined && !okTimed(n.defaultTimed)) || (n.defaultAllDay !== undefined && !okAllDay(n.defaultAllDay))) return { error: '設定の通知が不正です' };
    out.notify = {};
    for (const k of ['enabled', 'showTitle', 'defaultTimed', 'defaultAllDay']) if (n[k] !== undefined) out.notify[k] = deepClean(n[k]);
  }
  return { value: out };
}

// 個別変更のキーが実在する回か（終了日より後などは捨てる）。
function validKeys(e) {
  const keys = Object.keys(e.overrides || {});
  if (!keys.length) return new Set();
  const bare = { ...e, overrides: {}, exdates: [] };
  const hit = (a, b) => new Set(expand([bare], a, b).map((o) => o.start));
  if (e.recurrence.count != null) { // 回数指定は先頭から数える（上限 9999 回）
    const last = keys.reduce((m, k) => (k > m ? k : m), keys[0]).slice(0, 10);
    return hit(e.start.slice(0, 10), last);
  }
  const ok = new Set();
  for (const k of keys) if (hit(k.slice(0, 10), k.slice(0, 10)).has(k)) ok.add(k);
  return ok;
}

// 戻り値: { ok:true, data:{version, exportedAt, categories, hasCategories, events, settings}, report } | { ok:false, reason }。DB には一切触れない。
// current: { categories } 現在のカテゴリ一覧（予定が参照する id がファイルにも現在にも無いときだけ未分類へ付け替える）。
export function validateBackup(text, current = {}) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, reason: 'JSONとして読み込めません（壊れたファイル）' }; }
  if (!isObj(obj) || obj.app !== APP) return { ok: false, reason: '未対応の形式です（Duoのバックアップではありません）' };
  if (!READABLE.includes(obj.version)) return { ok: false, reason: `未対応のバージョンです（version: ${String(obj.version).slice(0, 20)}）` };
  if (!Array.isArray(obj.events)) return { ok: false, reason: '予定の一覧（events）がありません' };
  if (obj.events.length > MAX_EVENTS) return { ok: false, reason: `予定が多すぎます（上限${MAX_EVENTS}件）` };
  if (typeof obj.exportedAt !== 'string' || Number.isNaN(Date.parse(obj.exportedAt))) return { ok: false, reason: '書き出し日時が不正です' };
  const report = { dropped: 0, fallbackCount: 0, legacyAdded: 0, ink: Array.isArray(obj.ink) ? obj.ink.length : 0 };
  let settings = null;
  if (obj.settings != null) {
    const r = checkSettings(obj.settings);
    if (r.error) return { ok: false, reason: r.error };
    settings = r.value;
  }
  const categories = [], catIds = new Set();
  const hasCategories = obj.categories !== undefined;
  if (hasCategories) {
    if (!Array.isArray(obj.categories) || obj.categories.length > LIMIT_CATS) return { ok: false, reason: 'カテゴリの一覧が不正です' };
    for (const [i, c] of obj.categories.entries()) {
      const r = validateCategory(deepClean(c));
      if (!r.ok) return { ok: false, reason: `カテゴリ${i + 1}件目: ${r.error}` };
      if (catIds.has(r.value.id)) return { ok: false, reason: `カテゴリ${i + 1}件目: idが重複しています` };
      catIds.add(r.value.id); categories.push(r.value);
    }
  }
  const known = new Set([...catIds, ...(current.categories || []).map((c) => c.id)]);
  const legacyUsed = new Set();
  let usedNone = false;
  // categoryId を確定する。旧 cat は固定 id に変換、知らない参照は未分類へ（fell=true）。
  const resolve = (o) => {
    const { cat, categoryId, ...rest } = o;
    let id = goodCatId(categoryId) ? categoryId : null, fell = false;
    if (id === null) {
      const lid = legacyToId(cat);
      if (lid) { legacyUsed.add(cat); id = lid; } else { id = CAT_IDS.none; fell = true; }
    } else if (!known.has(id) && !Object.values(CAT_IDS).includes(id)) { id = CAT_IDS.none; fell = true; }
    if (id === CAT_IDS.none) usedNone = true;
    return { rest, id, fell };
  };
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

    // 検証を通ったので整形する。未知の項目は残し、不正な alarms / nativeLink はその項目だけ捨てる。
    const main = resolve(shapeIn(e));
    const out = shape({ ...main.rest, categoryId: main.id });
    let fell = main.fell;
    report.dropped += checkOptional(out);
    const keys = out.recurrence ? validKeys(out) : new Set();
    const ov = {};
    for (const [k, o] of Object.entries(out.overrides)) {
      if (!keys.has(k)) { report.dropped++; continue; }
      const x = resolve(shapeIn(o));
      if (x.fell) fell = true;
      const oo = bodyDefaults({ ...x.rest, categoryId: x.id });
      report.dropped += checkOptional(oo);
      ov[k] = oo;
    }
    out.overrides = ov;
    out.exdates = [...new Set(out.exdates)];
    if (fell) report.fallbackCount++;
    events.push(out);
  }
  // 旧 cat が指す固定カテゴリがファイルにも現在にも無ければ LEGACY の定義で追加予定に入れる。
  const have = new Set([...catIds, ...(current.categories || []).map((c) => c.id)]);
  const addCat = (c) => { catIds.add(c.id); categories.push({ ...c, order: categories.length, hidden: false, createdAt: 0, updatedAt: 0 }); };
  for (const key of legacyUsed) if (!have.has(LEGACY[key].id)) { addCat(LEGACY[key]); report.legacyAdded++; }
  if (usedNone && !have.has(CAT_IDS.none)) addCat(UNCATEGORIZED);
  return { ok: true, data: { version: obj.version, exportedAt: obj.exportedAt, events, settings, categories, hasCategories }, report };
}
// 読み込み時に cat / categoryId を分ける前の複製（runtime・危険キーを除く）。
const shapeIn = (o) => stripRuntime(o);

// ---------- 追加の計画 ----------
// 重複判定用の内容キー: id・updatedAt・nativeLink を除いた全項目（キー順・exdates・alarms の順序を正規化）。
const sortObj = (v) => (Array.isArray(v) ? v.map(sortObj) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortObj(v[k])])) : v);
const alarmOrder = (a) => JSON.stringify(a);
const normAlarms = (o) => { if (o.alarms == null) delete o.alarms; else o.alarms = [...o.alarms].sort((a, b) => (alarmOrder(a) < alarmOrder(b) ? -1 : 1)); return o; };
export function contentKey(e) {
  const { id, updatedAt, nativeLink, ...rest } = shape(e);
  void id; void updatedAt; void nativeLink;
  rest.exdates = [...rest.exdates].sort();
  normAlarms(rest);
  rest.overrides = Object.fromEntries(Object.entries(rest.overrides).map(([k, o]) => { const { nativeLink: n, ...x } = o; void n; return [k, normAlarms(x)]; }));
  return JSON.stringify(sortObj(rest));
}
// 連携先が同じかを調べるキー（iPhone カレンダーの同じ予定）。
export function linkKeys(e) {
  const l = e?.nativeLink, out = [];
  if (isObj(l)) { if (l.requestId) out.push(`r:${l.requestId}`); if (l.ekIdentifier) out.push(`k:${l.ekIdentifier}`); }
  return out;
}
export function planAppend(current, incoming) {
  const byId = new Map(current.map((e) => [e.id, e]));
  const keys = new Set(current.map(contentKey));
  const links = new Set(current.flatMap(linkKeys));
  const add = []; let dup = 0, conflict = 0;
  for (const e of incoming) {
    const k = contentKey(e), same = byId.get(e.id);
    if (same) { if (contentKey(same) === k) dup++; else conflict++; continue; }
    const lk = linkKeys(e);
    if (lk.some((x) => links.has(x)) || keys.has(k)) { dup++; continue; }
    keys.add(k); lk.forEach((x) => links.add(x)); add.push(e);
  }
  return { add, dup, conflict, skipped: dup + conflict };
}
