// バックアップの書き出し・検証・追加計画。DOM に依存しない。
import { FREQS, LIMITS, isKey } from './util.js';
import { expand, normRule } from './recur.js';
import { alarmsOk, okAllDay, okTimed } from './alarms.js';
import { normNotify } from './notify.js';
import { PAGE_IDS, BOTTOM_IDS, normalizePages } from './pages.js';
import { validateTask } from './tasks.js';
import { noteCharLimit, titleOf, noteFromMemo, memoTextOf, ensureDailyFolder, noteDateOf } from './notes-model.js';
import { CAT_IDS, DEFAULTS_NEW, LEGACY, UNCATEGORIZED, legacyToId, validateCategory } from './categories.js';

export const APP = 'duo-calendar';
export const VERSION = 6;
export const SCHEMA = 6; // 書き出した端末の IndexedDB SCHEMA_VERSION（参考情報）
export const READABLE = [1, 2, 3, 4, 5, 6];
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_EVENTS = 10000;
export const MAX_EXCEPTIONS = 100000;
export const MAX_MEMOS = 40000;
export const MAX_TASKS = 100000;
export const MAX_MEMO_CHARS = 100000;
// ノートの件数には製品上の上限を設けない（負荷試験の基準は40000件）。実際の歯止めは MAX_BYTES（10MiB）のファイル容量。
// 本文の上限は notes-model の noteCharLimit（移行で足した日付見出し分は別枠）。フォルダは100・名前30字。
export const MAX_FOLDERS = 100;
export const MAX_FOLDER_NAME = 30;
export const NOTE_LIMIT_NOTE = 'ノートの件数に上限はありませんが、バックアップのファイルは10MiBまでです（超えると読み込めません）。';
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

// categories: 現在のカテゴリ一覧。settings: { view, style, desk, monthExpand, weekStart(0|1), notify? }。
// memos: 現在のメモ一覧（db.listMemos）。tasks: 現在のタスク一覧（db.listTasks）。order→id の安定順で出す。
const exportMemo = (m) => {
  const o = { id: m.date, date: m.date, text: m.text, createdAt: m.createdAt, updatedAt: m.updatedAt };
  if (m.ink != null) o.ink = deepClean(m.ink); // 古い手書きは消さない（D15）。無いときは今までと同じ形
  return o;
};
const taskCmp = (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const linkOf = (x) => { const o = {}; for (const k of ['remItemId', 'remExternalId', 'remListId', 'remModifiedAt', 'syncState']) if (x[k] != null) o[k] = x[k]; return o; };
const exportTask = (t) => { const r = validateTask(t); const x = r.ok ? r.task : t; return { id: x.id, title: x.title, due: x.due ? { ...x.due } : null, done: x.done, doneAt: x.doneAt, createdAt: x.createdAt, updatedAt: x.updatedAt, order: x.order, note: x.note, notify: x.notify, ...linkOf(x) }; };
// ノート有効時用の書出。notes: 現在のノート一覧（db.listNotes({includeDeleted:true})）、folders: db.listFolders()。
// notes が配列のとき（ノート有効）は tasks+notes+folders を出し memos は出さない。null（既定）なら従来どおり memos+tasks。
const exportNote = (n) => {
  const o = { id: n.id, body: n.body, folderId: typeof n.folderId === 'string' ? n.folderId : null, pinned: !!n.pinned, pinnedAt: n.pinned && Number.isFinite(n.pinnedAt) ? n.pinnedAt : null,
    createdAt: n.createdAt, updatedAt: n.updatedAt, deletedAt: Number.isFinite(n.deletedAt) ? n.deletedAt : null };
  o.date = noteDateOf(n);
  if (typeof n.sourceDate === 'string') o.sourceDate = n.sourceDate;
  if (n.sourceHeading) o.sourceHeading = true;
  if (typeof n.sourceOriginalFirstLine === 'string') o.sourceOriginalFirstLine = n.sourceOriginalFirstLine;
  if (n.ink != null) o.ink = deepClean(n.ink);
  return o; // title は書かない（読込時に本文から作り直す）
};
const exportFolder = (f) => ({ id: f.id, name: f.name, order: f.order, createdAt: f.createdAt, updatedAt: f.updatedAt });
const idCmp = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function buildBackup(events, settings = {}, now = new Date(), categories = [], memos = [], tasks = [], notes = null, folders = null) {
  const s = { view: settings.view, style: settings.style, desk: !!settings.desk, monthExpand: !!settings.monthExpand, rokuyo: settings.rokuyo !== false, holidayRed: settings.holidayRed !== false, pages: normalizePages(settings.pages) };
  if (settings.weekStart === 0 || settings.weekStart === 1) s.weekStart = settings.weekStart;
  s.tasks = { monthTasks: settings.tasks?.monthTasks === true };
  { const { version, ...n } = normNotify(settings.notify); void version; s.notify = n; } // 未保存でも既定込みで常に出す
  const out = { app: APP, version: VERSION, schema: SCHEMA, exportedAt: localIso(now), categories: categories.map((c) => deepClean(c)), events: events.map(exportEvent) };
  if (Array.isArray(notes)) {
    out.tasks = [...tasks].sort(taskCmp).map(exportTask);
    out.notes = [...notes].sort(idCmp).map(exportNote);
    out.folders = [...(folders || [])].sort((a, b) => a.order - b.order || idCmp(a, b)).map(exportFolder);
  } else {
    out.memos = [...memos].sort((a, b) => (a.date < b.date ? -1 : 1)).map(exportMemo);
    out.tasks = [...tasks].sort(taskCmp).map(exportTask);
  }
  out.settings = s;
  return out;
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
const LINK_STATES = ['pending', 'linked', 'unlinked'];
const LINK_STR = ['requestId', 'calendarId', 'itemId', 'externalId', 'ekIdentifier', 'eventId', 'calName', 'calSource'];
const LINK_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const linkOk = (l) => isObj(l) && LINK_STATES.includes(l.state)
  && LINK_STR.every((k) => l[k] == null || (typeof l[k] === 'string' && l[k].length <= 500))
  && (l.v == null || Number.isInteger(l.v)) && (l.syncedAt == null || Number.isFinite(l.syncedAt)) && (l.ekModified == null || Number.isFinite(l.ekModified))
  && (l.seriesStart == null || (typeof l.seriesStart === 'string' && LINK_STAMP.test(l.seriesStart)))
  && (l.matchedBy == null || ['id', 'url', 'external', 'fallback'].includes(l.matchedBy)) && (l.fallbackDeleteConfirmed == null || typeof l.fallbackDeleteConfirmed === 'boolean')
  && (l.warn == null || l.warn === 'missing' || l.warn === 'writeOnly' || l.warn === 'conflict');
// 予定・個別変更に共通の任意項目の検証。捨てた件数を返す。
function checkOptional(o) {
  let dropped = 0;
  if (o.alarms !== undefined && !alarmsOk(o.alarms)) { delete o.alarms; dropped++; }
  if (o.nativeLink !== undefined && !linkOk(o.nativeLink)) { delete o.nativeLink; dropped++; }
  return dropped;
}

const pagesOk = (p) => isObj(p)
  && (p.left === undefined || PAGE_IDS.includes(p.left)) && (p.right === undefined || PAGE_IDS.includes(p.right))
  && !(p.left !== undefined && p.left === p.right)
  && (p.portraitBottom === undefined || BOTTOM_IDS.includes(p.portraitBottom)) && (p.portraitShown === undefined || typeof p.portraitShown === 'boolean');
// 日付メモの検証。{ memos } | { error }。1件でも不正なら全体を拒否する。
const goodTime = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function checkMemos(list) {
  if (!Array.isArray(list)) return { error: 'メモの一覧が不正です' };
  if (list.length > MAX_MEMOS) return { error: `メモが多すぎます（上限${MAX_MEMOS}件）` };
  const seen = new Set(), memos = [];
  for (const [i, m] of list.entries()) {
    const where = `メモ${i + 1}件目`;
    if (!isObj(m)) return { error: `${where}: 形式が不正です` };
    if (!isKey(m.date)) return { error: `${where}: 日付が不正です` };
    if (m.id !== m.date) return { error: `${where}: idと日付が一致しません` };
    if (seen.has(m.date)) return { error: `${where}: 日付が重複しています` };
    seen.add(m.date);
    if (typeof m.text !== 'string' || /^\s*$/.test(m.text) || m.text.length > MAX_MEMO_CHARS) return { error: `${where}: 本文が不正です` };
    if (!goodTime(m.createdAt) || !goodTime(m.updatedAt)) return { error: `${where}: 時刻が不正です` };
    if (m.ink !== undefined && m.ink !== null && typeof m.ink !== 'object' && typeof m.ink !== 'string') return { error: `${where}: 手書きが不正です` };
    memos.push({ id: m.date, date: m.date, text: m.text, createdAt: m.createdAt, updatedAt: m.updatedAt, ink: m.ink == null ? null : deepClean(m.ink) });
  }
  return { memos };
}

// ノート・フォルダの検証。{ notes } | { error }。1件でも不正なら全体を拒否する。件数の上限はない（容量は MAX_BYTES）。
const optTime = (v) => v === undefined || v === null || goodTime(v);
function checkNotes(list) {
  if (!Array.isArray(list)) return { error: 'ノートの一覧が不正です' };
  const seen = new Set(), notes = [];
  for (const [i, n] of list.entries()) {
    const where = `ノート${i + 1}件目`;
    if (!isObj(n)) return { error: `${where}: 形式が不正です` };
    if (typeof n.id !== 'string' || !n.id) return { error: `${where}: idが不正です` };
    if (seen.has(n.id)) return { error: `${where}: idが重複しています` };
    seen.add(n.id);
    if (typeof n.body !== 'string') return { error: `${where}: 本文が不正です` };
    if (n.sourceDate !== undefined && !isKey(n.sourceDate)) return { error: `${where}: 元の日付が不正です` };
    if (n.date !== undefined && n.date !== null && !isKey(n.date)) return { error: `${where}: 日付が不正です` };
    if (n.sourceHeading !== undefined && typeof n.sourceHeading !== 'boolean') return { error: `${where}: 見出しの印が不正です` };
    if (n.sourceOriginalFirstLine !== undefined && typeof n.sourceOriginalFirstLine !== 'string') return { error: `${where}: 元の第一行が不正です` };
    const lim = noteCharLimit(n);
    if (n.body.length > lim && Array.from(n.body).length > lim) return { error: `${where}: 本文が長すぎます（上限${MAX_MEMO_CHARS}字）` };
    if (n.folderId !== undefined && n.folderId !== null && typeof n.folderId !== 'string') return { error: `${where}: フォルダ指定が不正です` };
    if (n.pinned !== undefined && typeof n.pinned !== 'boolean') return { error: `${where}: ピン留めが不正です` };
    if (!goodTime(n.createdAt) || !goodTime(n.updatedAt) || !optTime(n.pinnedAt) || !optTime(n.deletedAt)) return { error: `${where}: 時刻が不正です` };
    if (n.ink !== undefined && n.ink !== null && typeof n.ink !== 'object' && typeof n.ink !== 'string') return { error: `${where}: 手書きが不正です` };
    const o = exportNote({ ...n, ink: n.ink == null ? null : n.ink });
    o.title = titleOf(o.body);
    o.ink ??= null; // 読込後の形は DB のノートと同じ（ink は null か値）
    notes.push(o);
  }
  return { notes };
}
function checkFolders(list) {
  if (!Array.isArray(list)) return { error: 'フォルダの一覧が不正です' };
  if (list.length > MAX_FOLDERS) return { error: `フォルダが多すぎます（上限${MAX_FOLDERS}件）` };
  const seen = new Set(), folders = [];
  for (const [i, f] of list.entries()) {
    const where = `フォルダ${i + 1}件目`;
    if (!isObj(f)) return { error: `${where}: 形式が不正です` };
    if (typeof f.id !== 'string' || !f.id) return { error: `${where}: idが不正です` };
    if (seen.has(f.id)) return { error: `${where}: idが重複しています` };
    seen.add(f.id);
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!name || Array.from(name).length > MAX_FOLDER_NAME) return { error: `${where}: 名前が不正です（1〜${MAX_FOLDER_NAME}字）` };
    if (!(typeof f.order === 'number' && Number.isFinite(f.order))) return { error: `${where}: 並び順が不正です` };
    if (!goodTime(f.createdAt) || !goodTime(f.updatedAt)) return { error: `${where}: 時刻が不正です` };
    folders.push({ id: f.id, name, order: f.order, createdAt: f.createdAt, updatedAt: f.updatedAt });
  }
  return { folders };
}

// タスクの検証。{ tasks } | { error }。1件でも不正なら全体を拒否する（id 重複も拒否）。
function checkTasks(list) {
  if (!Array.isArray(list)) return { error: 'タスクの一覧が不正です' };
  if (list.length > MAX_TASKS) return { error: `タスクが多すぎます（上限${MAX_TASKS}件）` };
  const seen = new Set(), tasks = [];
  for (const [i, t] of list.entries()) {
    const where = `タスク${i + 1}件目`;
    if (!isObj(t)) return { error: `${where}: 形式が不正です` };
    const r = validateTask(t);
    if (!r.ok) return { error: `${where}: ${r.error}` };
    if (t.done !== undefined && typeof t.done !== 'boolean') return { error: `${where}: 完了状態が不正です` };
    if (seen.has(r.task.id)) return { error: `${where}: idが重複しています` };
    seen.add(r.task.id);
    tasks.push(exportTask(r.task));
  }
  return { tasks };
}

// 設定の検証（未知のキーは無視）。{ value } | { error }
export function checkSettings(s) {
  if (!isObj(s)) return { error: '設定が不正です' };
  if (s.view !== undefined && !VIEWS.includes(s.view)) return { error: '設定の表示モードが不正です' };
  if (s.style !== undefined && !Object.hasOwn(STYLES, s.style)) return { error: '設定の月表現が不正です' };
  if (s.desk !== undefined && typeof s.desk !== 'boolean') return { error: '設定の卓上指定が不正です' };
  if (s.monthExpand !== undefined && typeof s.monthExpand !== 'boolean') return { error: '設定の月の広げる表示が不正です' };
  if (s.weekStart !== undefined && s.weekStart !== 0 && s.weekStart !== 1) return { error: '設定の週の始まりが不正です' };
  if (s.rokuyo !== undefined && typeof s.rokuyo !== 'boolean') return { error: '設定の六曜表示が不正です' };
  if (s.holidayRed !== undefined && typeof s.holidayRed !== 'boolean') return { error: '設定の祝日の赤表示が不正です' };
  const out = {};
  if (s.rokuyo !== undefined) out.rokuyo = s.rokuyo;
  if (s.holidayRed !== undefined) out.holidayRed = s.holidayRed;
  if (s.pages != null && pagesOk(s.pages)) out.pages = normalizePages(s.pages); // 不正な pages はその設定だけ捨てる
  if (s.weekStart !== undefined) out.weekStart = s.weekStart;
  if (s.view !== undefined) out.view = s.view;
  if (s.style !== undefined) out.style = STYLES[s.style];
  if (s.desk !== undefined) out.desk = s.desk;
  if (s.monthExpand !== undefined) out.monthExpand = s.monthExpand;
  if (s.tasks != null) {
    if (!isObj(s.tasks) || (s.tasks.monthTasks !== undefined && typeof s.tasks.monthTasks !== 'boolean')) return { error: '設定のタスクが不正です' };
    out.tasks = { monthTasks: s.tasks.monthTasks === true };
  }
  if (s.notify != null) {
    const n = s.notify;
    if (!isObj(n) || (n.enabled !== undefined && typeof n.enabled !== 'boolean') || (n.showTitle !== undefined && typeof n.showTitle !== 'boolean')
      || (n.defaultTimed != null && !okTimed(n.defaultTimed)) || (n.defaultAllDay != null && !okAllDay(n.defaultAllDay))) return { error: '設定の通知が不正です' };
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
  if (typeof text === 'string' && text.startsWith('PK')) return { ok: false, reason: '新しい Duo カレンダーで作ったバックアップです。アプリを最新にしてから読み込んでください。' }; // 先頭が PK は zip（V20 の版 7）
  try { obj = JSON.parse(text); } catch { return { ok: false, reason: 'JSONとして読み込めません（壊れたファイル）' }; }
  if (!isObj(obj) || obj.app !== APP) return { ok: false, reason: '未対応の形式です（Duoのバックアップではありません）' };
  if (!READABLE.includes(obj.version)) return { ok: false, reason: `未対応のバージョンです（version: ${String(obj.version).slice(0, 20)}）` };
  if (!Array.isArray(obj.events)) return { ok: false, reason: '予定の一覧（events）がありません' };
  if (obj.events.length > MAX_EVENTS) return { ok: false, reason: `予定が多すぎます（上限${MAX_EVENTS}件）` };
  if (typeof obj.exportedAt !== 'string' || Number.isNaN(Date.parse(obj.exportedAt))) return { ok: false, reason: '書き出し日時が不正です' };
  const report = { dropped: 0, fallbackCount: 0, legacyAdded: 0, retargeted: 0, ink: Array.isArray(obj.ink) ? obj.ink.length : 0 };
  let settings = null;
  if (obj.settings != null) {
    const r = checkSettings(obj.settings);
    if (r.error) return { ok: false, reason: r.error };
    settings = r.value;
  }
  let memos = null; // null = ファイルにメモの項目がない（置換でも今のメモを残す）。v4 の空配列は「メモなし」
  if (obj.version >= 4 && obj.memos !== undefined) {
    const r = checkMemos(obj.memos);
    if (r.error) return { ok: false, reason: r.error };
    memos = r.memos;
  }
  // null = ファイルにその項目がない（置換でも現在を残す）。明示の空配列は「なし」（置換で空にする）。
  let notes = null, folders = null;
  if (obj.version >= 5 && obj.folders !== undefined) {
    const r = checkFolders(obj.folders);
    if (r.error) return { ok: false, reason: r.error };
    folders = r.folders;
  }
  if (obj.version >= 5 && obj.notes !== undefined) {
    const r = checkNotes(obj.notes);
    if (r.error) return { ok: false, reason: r.error };
    notes = r.notes;
  }
  let tasks = null; // null = ファイルにタスクの項目がない（置換でも今のタスクを残す）。v5 の空配列は「タスクなし」（置換で空にする）
  if (obj.version >= 5 && obj.tasks !== undefined) {
    const r = checkTasks(obj.tasks);
    if (r.error) return { ok: false, reason: r.error };
    tasks = r.tasks;
  }
  const categories = [], catIds = new Set();
  const hasCategories = obj.categories !== undefined;
  if (hasCategories) {
    if (!Array.isArray(obj.categories) || obj.categories.length > LIMIT_CATS) return { ok: false, reason: 'カテゴリの一覧が不正です' };
    for (const [i, c] of obj.categories.entries()) {
      const r = validateCategory(deepClean(c));
      if (!r.ok) return { ok: false, reason: `カテゴリ${i + 1}件目: ${r.error}` };
      if (catIds.has(r.value.id)) return { ok: false, reason: `カテゴリ${i + 1}件目: idが重複しています` };
      if (r.value.id === CAT_IDS.golf || r.value.id === CAT_IDS.economy) continue; // 旧2カテゴリは取り込まない（予定は「その他」へ）
      catIds.add(r.value.id); categories.push(r.value);
    }
  }
  const known = new Set([...catIds, ...(current.categories || []).map((c) => c.id)]);
  const legacyUsed = new Set();
  let usedNone = false, usedOther = false;
  // categoryId を確定する。旧 cat は固定 id に変換、知らない参照は未分類へ（fell=true）。
  const resolve = (o) => {
    const { cat, categoryId, ...rest } = o;
    let id = goodCatId(categoryId) ? categoryId : null, fell = false, moved = false;
    if (id === CAT_IDS.golf || id === CAT_IDS.economy) { id = CAT_IDS.other; moved = true; }
    else if (id === null) {
      const lid = legacyToId(cat);
      if (lid === CAT_IDS.golf || lid === CAT_IDS.economy) { id = CAT_IDS.other; moved = true; }
      else if (lid) { legacyUsed.add(cat); id = lid; } else { id = CAT_IDS.none; fell = true; }
    } else if (!known.has(id) && !Object.values(CAT_IDS).includes(id)) { id = CAT_IDS.none; fell = true; }
    if (id === CAT_IDS.none) usedNone = true;
    if (id === CAT_IDS.other && moved) usedOther = true;
    return { rest, id, fell, moved };
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
    let fell = main.fell, moved = main.moved;
    report.dropped += checkOptional(out);
    const keys = out.recurrence ? validKeys(out) : new Set();
    const ov = {};
    for (const [k, o] of Object.entries(out.overrides)) {
      if (!keys.has(k)) { report.dropped++; continue; }
      const x = resolve(shapeIn(o));
      if (x.fell) fell = true;
      if (x.moved) moved = true;
      const oo = bodyDefaults({ ...x.rest, categoryId: x.id });
      report.dropped += checkOptional(oo);
      ov[k] = oo;
    }
    out.overrides = ov;
    out.exdates = [...new Set(out.exdates)];
    if (fell) report.fallbackCount++;
    if (moved) report.retargeted++;
    events.push(out);
  }
  // 旧 cat が指す固定カテゴリがファイルにも現在にも無ければ LEGACY の定義で追加予定に入れる。
  const have = new Set([...catIds, ...(current.categories || []).map((c) => c.id)]);
  const addCat = (c) => { catIds.add(c.id); categories.push({ ...c, order: categories.length, hidden: false, createdAt: 0, updatedAt: 0 }); };
  for (const key of legacyUsed) if (!have.has(LEGACY[key].id)) { addCat(LEGACY[key]); report.legacyAdded++; }
  if (usedOther && !have.has(CAT_IDS.other)) addCat(DEFAULTS_NEW.find((d) => d.id === CAT_IDS.other));
  if (usedNone && !have.has(CAT_IDS.none)) addCat(UNCATEGORIZED);
  return { ok: true, data: { version: obj.version, exportedAt: obj.exportedAt, events, memos, tasks, notes, folders, settings, categories, hasCategories }, report };
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
// メモの追加計画。同日同文は何もせず、異なる本文は空行で連結して1件に保つ。
export function planMemos(current = [], incoming = [], now = Date.now()) {
  const byDate = new Map(current.map((m) => [m.date, m]));
  const puts = []; let added = 0, merged = 0, same = 0;
  for (const m of incoming || []) {
    const cur = byDate.get(m.date);
    if (!cur) { puts.push(m); added++; continue; }
    if (cur.text === m.text) { same++; continue; }
    puts.push({ ...cur, text: `${cur.text}\n\n${m.text}`, updatedAt: now, ink: cur.ink ?? null }); merged++;
  }
  return { puts, added, merged, same };
}
// タスクの追加計画。同ID同内容は無操作。同IDで内容が違えば既存を残し、決定的な別IDで追加する（再取込でも同じIDになり重複しない）。
const taskBody = (t) => JSON.stringify(sortObj({ ...exportTask(t), id: '' }));
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export function planTasks(current = [], incoming = []) {
  const byId = new Map(current.map((t) => [t.id, t]));
  const puts = []; let added = 0, same = 0, renamed = 0;
  for (const t of incoming || []) {
    const cur = byId.get(t.id), body = taskBody(t);
    if (!cur) { byId.set(t.id, t); puts.push(t); added++; continue; }
    if (taskBody(cur) === body) { same++; continue; }
    let id = `${t.id}-i${hash(body)}`, n = 1, hit;
    while ((hit = byId.get(id)) && taskBody(hit) !== body) id = `${t.id}-i${hash(body)}${n++}`;
    if (hit) { same++; continue; }
    const x = { ...t, id }; byId.set(id, x); puts.push(x); added++; renamed++;
  }
  return { puts, added, same, renamed };
}
// ノート・フォルダの計画。cur*: 現在、in*: ファイル（null = 項目なし → 何もしない／現在を保持）。replace: 置換で読み込むか。
// 参照先フォルダは「復元後に実在するフォルダ集合」で解決し、無ければ null。
// 追加：同ID同内容は無操作、異内容は既存を残し内容から決まる別IDで追加。フォルダは同IDなら現在の名前を保持する。
// 比較用：id・title を除き、既定値（ink:null / sourceHeading:false）は無いものと同じに扱う。
const noteBody = (n) => { const { id, title, ...r } = n; void id; void title; if (r.ink == null) delete r.ink; if (!r.sourceHeading) delete r.sourceHeading; return JSON.stringify(sortObj(r)); };
export function planNotes(curNotes = [], inNotes = null, curFolders = [], inFolders = null, replace = false) {
  const r = { notePuts: [], noteReplace: false, folderPuts: [], folderReplace: false, added: 0, same: 0, renamed: 0, foldersAdded: 0, foldersSame: 0, orphaned: 0 };
  const folderIds = new Set(curFolders.map((f) => f.id));
  if (inFolders) {
    if (replace) { r.folderReplace = true; folderIds.clear(); r.folderPuts = inFolders.map((f) => ({ ...f })); r.foldersAdded = inFolders.length; inFolders.forEach((f) => folderIds.add(f.id)); }
    else for (const f of inFolders) { if (folderIds.has(f.id)) { r.foldersSame++; continue; } folderIds.add(f.id); r.folderPuts.push({ ...f }); r.foldersAdded++; }
  }
  if (!inNotes) return r;
  const resolved = inNotes.map((n) => {
    if (typeof n.folderId === 'string' && !folderIds.has(n.folderId)) { r.orphaned++; return { ...n, folderId: null }; }
    return { ...n };
  });
  if (replace) { r.noteReplace = true; r.notePuts = resolved; r.added = resolved.length; return r; }
  const byId = new Map(curNotes.map((n) => [n.id, n]));
  for (const n of resolved) {
    const cur = byId.get(n.id), body = noteBody(n);
    if (!cur) { byId.set(n.id, n); r.notePuts.push(n); r.added++; continue; }
    if (noteBody(cur) === body) { r.same++; continue; }
    let id = `${n.id}-i${hash(body)}`, k = 1, hit;
    while ((hit = byId.get(id)) && noteBody(hit) !== body) id = `${n.id}-i${hash(body)}${k++}`;
    if (hit) { r.same++; continue; }
    const x = { ...n, id }; byId.set(id, x); r.notePuts.push(x); r.added++; r.renamed++;
  }
  return r;
}
// 旧メモ（v1〜4／途中版v5の memos）を追加専用でノートへ変換する計画。置換でも現在のノート・フォルダ・ピンは消さない。
// hashes: legacyHashes(memos) の結果（tx の外で先に計算する。planLegacyNotes 自体は同期）。
// 同日・同本文（取込済みの削除ノートを含む）は無操作。異なる本文は `memo-<Day>-<sha256先頭8桁>`（衝突時は桁を伸ばす）で別ノートにする。
// 固定フォルダは改名済みでも使い、無いときは新規ノートがある時だけ作る。既存ノートの folderId は動かさない。
export async function legacyHashes(memos = []) {
  const enc = new TextEncoder();
  return Promise.all((memos || []).map(async (m) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(m.text)))).map((b) => b.toString(16).padStart(2, '0')).join('')));
}
export function planLegacyNotes(curNotes = [], curFolders = [], memos = [], hashes = [], now = Date.now()) {
  const r = { notePuts: [], folderPuts: [], added: 0, same: 0, differ: 0, folderCreated: false };
  const byId = new Map(curNotes.map((n) => [n.id, n]));
  const seen = new Set(curNotes.filter((n) => n.sourceDate).map((n) => `${n.sourceDate}\u0000${memoTextOf(n)}`));
  (memos || []).forEach((m, i) => {
    const key = `${m.date}\u0000${m.text}`;
    if (seen.has(key)) { r.same++; return; }
    const base = noteFromMemo(m), cur = byId.get(base.id);
    if (cur && cur.body === base.body) { r.same++; return; }
    let note = base, differ = false;
    if (cur) {
      differ = true;
      const hex = hashes[i];
      if (typeof hex !== 'string' || hex.length < 8) throw new Error('legacy hash missing');
      for (let n = 8; ; n++) {
        const cand = noteFromMemo(m, `-${hex.slice(0, n)}`), hit = byId.get(cand.id);
        if (!hit) { note = cand; break; }
        if (hit.body === cand.body) { r.same++; return; }
        if (n >= hex.length) throw new Error('legacy id collision');
      }
    }
    byId.set(note.id, note); seen.add(key); r.notePuts.push(note);
    if (differ) r.differ++; else r.added++;
  });
  if (r.notePuts.length) {
    const f = ensureDailyFolder(curFolders, now);
    if (f.created) { r.folderPuts.push(f.folder); r.folderCreated = true; }
    r.notePuts = r.notePuts.map((n) => ({ ...n, folderId: f.folder.id }));
  }
  return r;
}
export function planAppend(current, incoming, curMemos = [], inMemos = [], curTasks = [], inTasks = [], curNotes = [], inNotes = null, curFolders = [], inFolders = null, legacyHex = null, now = Date.now()) {
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
  const note = planNotes(curNotes, inNotes, curFolders, inFolders, false);
  // 新形式の notes があるファイルはそちらを正とし、memos は二重に取り込まない。
  const legacy = !inNotes && legacyHex && inMemos?.length ? planLegacyNotes(curNotes, [...curFolders, ...note.folderPuts], inMemos, legacyHex, now) : null;
  return { add, dup, conflict, skipped: dup + conflict, memo: planMemos(curMemos, inMemos), task: planTasks(curTasks, inTasks), note, legacy };
}
