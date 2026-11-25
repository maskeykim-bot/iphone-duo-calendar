// タスク（Duo 内保存）の型・検証・分類。DB には触れない（保存操作は db.js）。
// Task = { id, title, due: {date:'YYYY-MM-DD', time?:'HH:mm'} | null, done, doneAt: Stamp|null, createdAt, updatedAt: ms, order, note, notify }
import { isKey } from './util.js';
import { isFlickId } from './colors.js';
// v19.6: カード（タスク・ノート）の色の id か。db.js は色の決まり（colors.js）を直接読み込まない決まりなので、ここを通す
export const isCardColorId = (id) => isFlickId(id);
import { validSource } from './note-tasks.js';

export const TASK_NOTE_MAX = 10000;
// 題名の保存上限（RS-20）。入力欄は 80 字のまま（LIMITS.title）。取り込みの長い題名を切らない。
export const TASK_TITLE_MAX = 1000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const STAMP_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const isMs = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

// 検証。{ ok:true, task } か { ok:false, error }。task は既知の項目だけの新しいオブジェクト（日付文字列はそのまま）。
export function validateTask(t) {
  if (!t || typeof t !== 'object') return { ok: false, error: 'タスクの形式が不正です。' };
  if (typeof t.id !== 'string' || !t.id) return { ok: false, error: 'タスクの id が不正です。' };
  if (typeof t.title !== 'string') return { ok: false, error: 'タスク名が不正です。' };
  const title = t.title.trim();
  if (!title) return { ok: false, error: 'タスク名を入力してください。' };
  if (title.length > TASK_TITLE_MAX) return { ok: false, error: `タスク名は${TASK_TITLE_MAX}文字以内にしてください。` };
  const note = t.note ?? '';
  if (typeof note !== 'string') return { ok: false, error: 'タスクのメモが不正です。' };
  if (note.length > TASK_NOTE_MAX) return { ok: false, error: `タスクのメモは${TASK_NOTE_MAX}文字以内にしてください。` };
  let due = null;
  if (t.due != null) {
    if (typeof t.due !== 'object' || !isKey(t.due.date)) return { ok: false, error: 'タスクの期限が不正です。' };
    if (t.due.time != null && !(typeof t.due.time === 'string' && TIME_RE.test(t.due.time))) return { ok: false, error: 'タスクの期限の時刻が不正です。' };
    due = t.due.time != null ? { date: t.due.date, time: t.due.time } : { date: t.due.date };
  }
  const done = t.done ?? false;
  if (typeof done !== 'boolean') return { ok: false, error: 'タスクの完了状態が不正です。' };
  const doneAt = t.doneAt ?? null;
  if (doneAt !== null && !(typeof doneAt === 'string' && STAMP_RE.test(doneAt))) return { ok: false, error: 'タスクの完了時刻が不正です。' };
  const notify = t.notify ?? false;
  if (typeof notify !== 'boolean') return { ok: false, error: 'タスクの通知設定が不正です。' };
  if (!isMs(t.createdAt) || !isMs(t.updatedAt)) return { ok: false, error: 'タスクの日時が不正です。' };
  if (!(typeof t.order === 'number' && Number.isFinite(t.order))) return { ok: false, error: 'タスクの順序が不正です。' };
  const task = { id: t.id, title, due, done, doneAt: done ? doneAt : null, createdAt: t.createdAt, updatedAt: t.updatedAt, order: t.order, note, notify: due ? notify : false };
  // v19.3（征希さんの要望）: iOS リマインダーとの同期をやめた。昔のつながり（remItemId・remExternalId・remListId・remModifiedAt・syncState）は
  // ここで写さない（保存・バックアップの読み戻しのどちらでも復活しない）。任意の項目を足すときは、この下に「値があるときだけ写す」形で足す。
  // v19.3 その2 F: ノートのチェック行とのつながり（任意の項目 source。無いタスクは今までの形のまま。形が合わなければ写さない＝つながりなし）
  const source = validSource(t.source);
  if (source) task.source = source;
  // v19.6（征希さん「タスクとノートも色を選べるようにする」・2026-11-25 承認）: カードの色（任意の項目 colorId。フリックの 7 色の id。無いタスクは今までの形のまま。版は 6 のまま）
  if (isFlickId(t.colorId)) task.colorId = t.colorId;
  return { ok: true, task };
}

// ---------- v19.3: iOS リマインダーとの同期をやめた（征希さんの要望）。昔のつながりを外すための口だけ残す ----------
// 墓標（syncState:'tombstone'）＝同期していた頃に Duo で消した跡。一覧・件数・通知・検索・バックアップに出さない。
export const isTombstone = (t) => !!t && t.syncState === 'tombstone';
export const liveTasks = (list) => (Array.isArray(list) ? list : []).filter((t) => !isTombstone(t));
export const LINK_KEYS = ['remItemId', 'remExternalId', 'remListId', 'remModifiedAt', 'syncState'];
export const hasOldLink = (t) => !!t && LINK_KEYS.some((k) => t[k] != null);
// つながりの項目だけを外す（題名・期限・完了・メモ・notify・並び・createdAt・updatedAt は触らない）。
export function unlinkTask(t) {
  const o = { ...t };
  for (const k of LINK_KEYS) delete o[k];
  return o;
}
// 版を上げた最初の起動で 1 回通す（何度通しても同じ）。生きているタスクはつながりだけ外し、墓標（もう一覧に出ない削除の跡）は片づける。
// iOS のリマインダー側には何もしない。db: { listTasks, putTask, deleteTask }。戻り値は外した件数（知らせを出すかの判定に使う）。
export async function dropOldLinks(db) {
  const out = { unlinked: 0, tombstones: 0, failed: 0 };
  for (const t of await db.listTasks()) {
    if (!hasOldLink(t)) continue;
    try {
      if (isTombstone(t)) { await db.deleteTask(t.id); out.tombstones++; } else { await db.putTask(unlinkTask(t)); out.unlinked++; }
    } catch { out.failed++; } // 1 件が書けなくても残りは続ける（次の起動でもう一度）
  }
  return out;
}

let seq = 0;
export const newTaskId = (now = Date.now()) => `t${now.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// 新規タスク。order は呼び出し側が現在の最大 order + 1 を渡す（db.addTask が同じトランザクションで決める）。
export function makeTask({ id, title, due = null, note = '', notify = false, order }, now = Date.now()) {
  return validateTask({ id: id ?? newTaskId(now), title, due, done: false, doneAt: null, createdAt: now, updatedAt: now, order, note, notify });
}

// 分類（done に boolean 索引は使えないので配列で）。{ open, done } それぞれ order 昇順（同順位は id）。
export function classifyTasks(list) {
  const cmp = (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const open = [], done = [];
  for (const t of list) (t.done ? done : open).push(t);
  return { open: open.sort(cmp), done: done.sort(cmp) };
}

// ---------- Duo 内保存（local）アダプタ（第16版 PR17） ----------
// 画面の表示・完了・削除・編集は「行」（旧リマインダーと同じ形）で動く。行 = Task を写したもの。native は一切呼ばない。
export const LOCAL_LIST = { id: 'duo', title: 'タスク', color: '#68716A', allowsModify: true, isDefault: true, source: 'Duo' };
const pad2 = (n) => String(n).padStart(2, '0');
export const stampNow = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const rowOf = (t) => ({ itemId: t.id, listId: LOCAL_LIST.id, title: t.title, notes: t.note, due: t.due, done: t.done, doneAt: t.doneAt, alarms: t.notify ? [{}] : [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: t.createdAt, modifiedAt: t.updatedAt, readOnly: false, ...(t.colorId ? { colorId: t.colorId } : {}), ...(t.source ? { source: t.source } : {}) }); // source＝ノートのチェック行とのつながり（v19.3。日の欄のカードの副題「ノート「…」から」に使う）
const fail = (code, e) => Object.assign(new Error(e?.message || code), { code });
// 保存の失敗は理由を分けて表示できるよう code にする（容量超過は STORAGE_FULL、それ以外は STORE_FAILED）。
const storeErr = (e) => (e && (e.code === 'INVALID_ARGUMENT' || e.code === 'NOT_FOUND') ? e : fail(/quota/i.test(`${e?.name} ${e?.message}`) ? 'STORAGE_FULL' : /^(タスク|題名)/.test(e?.message || '') ? 'INVALID_ARGUMENT' : 'STORE_FAILED', e));
export const TASK_STORE_TEXT = { STORAGE_FULL: '端末の空きが足りず保存できませんでした。', STORE_FAILED: 'Duo 内に保存できませんでした。', INVALID_ARGUMENT: 'タスクの内容を確かめてください。' };

// db: { listTasks, getTask, putTask, addTask, deleteTask }（db.js）。
// ---------- 設定（第16版 PR19）: 月の件数だけ。完了の表示窓は固定30日 ----------
export const TASK_WINDOW_DAYS = 30;
export const normTaskSettings = (raw) => ({ monthTasks: !!raw && typeof raw === 'object' && raw.monthTasks === true });
// 新設定が保存済みならそれ、なければ旧 duo-native-rem の monthTasks だけを一度継承する。旧の同期・リスト・追加先は読まない。
export function inheritTaskSettings(newRaw, oldRaw) {
  if (newRaw && typeof newRaw === 'object' && !Array.isArray(newRaw)) return { value: normTaskSettings(newRaw), inherited: false };
  return { value: normTaskSettings(oldRaw), inherited: true };
}

// patch の検証。title/note/due/notify だけ受け、未知の項目・不正な型は拒否する（変えない項目は含めない）。
export function validateTaskPatch(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'タスクの変更内容が不正です。' };
  const out = {};
  for (const k of Object.keys(p)) {
    if (!['title', 'note', 'due', 'notify', 'colorId'].includes(k)) return { ok: false, error: 'タスクの変更内容が不正です。' };
    out[k] = p[k];
  }
  if ('title' in out) { if (typeof out.title !== 'string' || !out.title.trim()) return { ok: false, error: 'タスク名を入力してください。' }; out.title = out.title.trim(); }
  if ('note' in out && typeof out.note !== 'string') return { ok: false, error: 'タスクのメモが不正です。' };
  if ('colorId' in out && out.colorId !== null && !isFlickId(out.colorId)) return { ok: false, error: 'タスクの色が不正です。' };
  if ('notify' in out && typeof out.notify !== 'boolean') return { ok: false, error: 'タスクの通知設定が不正です。' };
  if ('due' in out && out.due !== null) {
    const d = out.due;
    if (!d || typeof d !== 'object' || !isKey(d.date) || (d.time != null && !TIME_RE.test(String(d.time)))) return { ok: false, error: 'タスクの期限が不正です。' };
    out.due = d.time != null ? { date: d.date, time: d.time } : { date: d.date };
  }
  return { ok: true, patch: out };
}

// v19.3: リマインダーへの書き出しのきっかけ（syncOn・onWrite・pending の印）は外した。保存は Duo の中だけ。
export function createTaskStore(db) {
  return {
    async list() { try { return liveTasks(await db.listTasks()); } catch (e) { throw storeErr(e); } },
    async listAll() { try { return await db.listTasks(); } catch (e) { throw storeErr(e); } },
    // id は呼び出し側が決める（同じ要求の再試行は同じ id → db.addTask が重複させない）。
    async add({ id, title, due = null, notify = false, note = '' }) {
      try {
        return await db.addTask({ id, title, due, notify, note });
      } catch (e) { throw storeErr(e); }
    },
    // patch: { title?, note?, due?, notify? }。変えていない項目は保持する。
    async update(id, patch, now = Date.now()) {
      try {
        const v = validateTaskPatch(patch);
        if (!v.ok) throw fail('INVALID_ARGUMENT', new Error(v.error));
        const cur = await db.getTask(id);
        if (!cur || isTombstone(cur)) throw fail('NOT_FOUND');
        const p = v.patch, due = 'due' in p ? p.due : cur.due;
        // 期限なしは通知なし。期限だけの変更では通知を ON にしない（notify は触らない）。
        return await db.putTask({ ...cur, ...('title' in p ? { title: p.title } : {}), ...('note' in p ? { note: p.note } : {}), due, ...('notify' in p ? { notify: p.notify } : {}), ...('colorId' in p ? { colorId: p.colorId } : {}), updatedAt: now });
      } catch (e) { throw storeErr(e); }
    },
    async setDone(id, done, now = Date.now()) {
      try {
        const cur = await db.getTask(id);
        if (!cur || isTombstone(cur)) throw fail('NOT_FOUND');
        return await db.putTask({ ...cur, done: !!done, doneAt: done ? stampNow(new Date(now)) : null, updatedAt: now });
      } catch (e) { throw storeErr(e); }
    },
    async remove(id, now = Date.now()) {
      try {
        const cur = await db.getTask(id);
        if (!cur || isTombstone(cur)) return { missing: !cur };
        await db.deleteTask(id);
        return { missing: false };
      } catch (e) { throw storeErr(e); }
    },
  };
}

// 旧リマインダーの controller（完了・削除・編集）が呼ぶ口を、そのまま Duo 内保存へ向ける。native は呼ばない。
export function createLocalCall(store) {
  return async (method, o = {}) => {
    switch (method) {
      case 'taskLists': return { lists: [LOCAL_LIST] };
      case 'taskList': return { reminders: (await store.list()).map(rowOf) };
      case 'taskSetDone': return { reminder: rowOf(await store.setDone(o.itemId, o.done)) };
      case 'taskDelete': return { deleted: true, ...(await store.remove(o.itemId)) };
      case 'taskUpdate': {
        const p = o.patch || {}, patch = {};
        if ('title' in p) patch.title = p.title;
        if ('notes' in p) patch.note = p.notes;
        if ('due' in p) patch.due = p.due;
        if ('notify' in p) patch.notify = p.notify;
        return { reminder: rowOf(await store.update(o.itemId, patch)), conflicted: false };
      }
      default: throw fail('UNAVAILABLE');
    }
  };
}

// 追加の制御。保存中は排他。失敗では本文を残し、同じ内容の再試行は同じ id（二重に作らない）、内容が変われば新しい id、成功したら捨てる。
export function createLocalAddController(store) {
  let pend = null, busy = false;
  const rid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    get busy() { return busy; },
    async submit({ title, due = null, time = '', notify }) {
      if (busy) return { ok: false, busy: true };
      const t = String(title ?? '').trim();
      if (!t) return { ok: false, empty: true };
      const dueV = due ? (time ? { date: due, time } : { date: due }) : null;
      const nv = !!dueV && notify === true;
      const fp = JSON.stringify([t, dueV, nv]);
      if (!pend || pend.fp !== fp) pend = { id: rid(), fp, args: { title: t, due: dueV, notify: nv } };
      const req = pend;
      busy = true;
      try {
        const task = await store.add({ id: req.id, ...req.args });
        if (pend === req) pend = null;
        return { ok: true, task, reminder: rowOf(task) };
      } catch (e) { return { ok: false, code: e?.code || 'STORE_FAILED' }; }
      finally { busy = false; }
    },
  };
}

// ---------- 完了の制御（第16版 PR18） ----------
// 押すと表示だけ即変わり（✓と打消線）、1.5秒そのままなら最後の状態だけを1回保存する。1.5秒内の再タップは保存せず表示だけ戻る。
// 保存済みの完了は6秒だけ元に戻せる（undo）。離脱時は flush で待たずに最後の状態を保存する。保存失敗は行を戻して理由を出す。
export const DONE_DELAY_MS = 1500;
export const DONE_UNDO_MS = 6000;
// store: { setDone(id, done) }。onPending(): 表示の上書きが変わった。onSettle(id, { result, failed, err, done }): 確定（result は保存後の行 Task）。
export function createTaskDoneController(store, { delay = DONE_DELAY_MS, onSettle, onPending, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const map = new Map();
  const finish = (e, out) => { map.delete(e.id); clearTimer(e.timer); e.timer = 0; onSettle?.(e.id, out); };
  async function commit(e) {
    e.timer = 0;
    if (e.saving || map.get(e.id) !== e) return;
    if (e.want === e.base) return finish(e, { result: null, failed: false, err: null, done: e.base, unchanged: true }); // 押し直して元に戻った: 保存0回
    const want = e.want;
    e.saving = true;
    let task = null, err = null;
    try { task = await store.setDone(e.id, want); } catch (x) { err = x; }
    e.saving = false;
    if (map.get(e.id) !== e) return;
    if (err) return finish(e, { result: null, failed: true, err, done: e.base });
    e.base = want; e.last = task;
    if (e.timer) return; // 保存中に押し直された: 時間が来たら最後の状態で改めて保存
    if (e.want !== e.base) return commit(e);
    finish(e, { result: task, failed: false, err: null, done: want });
  }
  return {
    has: (id) => map.has(id),
    pending() { return new Map([...map].map(([id, e]) => [id, e.want])); },
    toggle(r) {
      if (!r || r.readOnly) return false;
      let e = map.get(r.itemId);
      if (!e) { e = { id: r.itemId, base: !!r.done, want: !!r.done, timer: 0, saving: false, last: null }; map.set(r.itemId, e); }
      e.want = !e.want;
      clearTimer(e.timer);
      e.timer = setTimer(() => commit(e), delay);
      onPending?.();
      return true;
    },
    // 画面が裏に回る・離れる時: 待っている分を今すぐ保存する。
    flush() { const ps = []; for (const e of [...map.values()]) { clearTimer(e.timer); e.timer = 0; ps.push(commit(e)); } return Promise.all(ps); },
    // 完了のあと6秒の取り消し。完了の保存を取り消して未完了へ（doneAt は null）。
    async undo(id) {
      try { return { ok: true, task: await store.setDone(id, false) }; } catch (err) { return { ok: false, err }; }
    },
    reset() { for (const e of map.values()) clearTimer(e.timer); map.clear(); },
  };
}

// ---------- 件数と並びの共通関数（第16版 PR20） ----------
// 帯・ホーム・月の件数はすべてここから出す。入力は Task（id）でも行（itemId）でもよい。pending は完了操作中の表示上書き（id→done）。
const idOf = (r) => r.itemId ?? r.id;
const doneOf = (r, pending) => (pending && pending.has(idOf(r)) ? pending.get(idOf(r)) : !!r.done);
const dueKey = (r) => `${r.due.date}T${r.due.time || '00:00'}`;
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 日付キー → その日が期限の未完了数（期限なし・完了は数えない）。
export function dueCounts(list, pending) {
  const m = new Map();
  for (const r of list || []) {
    if (!r?.due?.date || doneOf(r, pending)) continue;
    m.set(r.due.date, (m.get(r.due.date) || 0) + 1);
  }
  return m;
}
// 期限が今日以前（期限切れ＋今日）の未完了。items は期限順で、完了操作中に完了へ押した行も取り消せるよう残す。total は未完了の件数（帯の数）。
export function todayTasks(list, today, pending) {
  const rows = [];
  let total = 0;
  for (const r of list || []) {
    if (!r?.due?.date || r.due.date > today) continue;
    const pend = pending && pending.has(idOf(r));
    const d = doneOf(r, pending);
    if (!d) total++;
    if (pend || !r.done) rows.push(r);
  }
  rows.sort((a, b) => cmpStr(dueKey(a), dueKey(b)) || cmpStr(String(a.title || ''), String(b.title || '')) || cmpStr(String(idOf(a)), String(idOf(b))));
  return { items: rows, total };
}

// ---------- 集中タスクの四つの見方（第16版 PR33） ----------
// 今日＝期限切れ＋今日／予定＝明日以降を日別／すべて＝未完了の全部（期限なし含む）／完了＝30日窓＋もっと前。
// 見方の「今日」は実際の今日。選んでいる日（state.selected）では動かさない。
export const TASK_VIEWS = ['today', 'plan', 'all', 'done'];
export const TASK_VIEW_LABELS = { today: '今日', plan: '予定', all: 'すべて', done: '完了' };
export const normTaskView = (v) => (TASK_VIEWS.includes(v) ? v : 'today');
const dkOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dueCmp = (a, b) => cmpStr(dueKey(a), dueKey(b)) || cmpStr(String(a.title || ''), String(b.title || '')) || cmpStr(String(idOf(a)), String(idOf(b)));
const hasNum = (v) => typeof v === 'number' && Number.isFinite(v);
const createdCmp = (a, b) => (hasNum(a.createdAt) && hasNum(b.createdAt) ? a.createdAt - b.createdAt : hasNum(a.createdAt) ? -1 : hasNum(b.createdAt) ? 1 : 0) || cmpStr(String(a.title || ''), String(b.title || '')) || cmpStr(String(idOf(a)), String(idOf(b)));
// list: Task か行。分類は保存済みの done で行う（完了操作の途中でも行は動かさない）。どの行も open/done のどちらか1か所だけに入る。
export function taskViews(list, { now = new Date(), days = TASK_WINDOW_DAYS } = {}) {
  const today = dkOf(now), hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const since = (() => { const d = new Date(now.getTime()); d.setDate(d.getDate() - days); return stampNow(d); })();
  const overdue = [], todayL = [], future = [], nodue = [], recent = [], older = [];
  const seen = new Set();
  for (const r of list || []) {
    if (!r || seen.has(idOf(r))) continue;
    seen.add(idOf(r));
    if (r.done) { (!r.doneAt || r.doneAt >= since ? recent : older).push(r); continue; }
    if (!r.due?.date) { nodue.push(r); continue; }
    if (r.due.date < today || (r.due.date === today && r.due.time && r.due.time < hm)) overdue.push(r);
    else if (r.due.date === today) todayL.push(r);
    else future.push(r);
  }
  overdue.sort(dueCmp); todayL.sort(dueCmp); future.sort(dueCmp); nodue.sort(createdCmp);
  const byDoneAt = (a, b) => cmpStr(b.doneAt || '', a.doneAt || '') || cmpStr(String(a.title || ''), String(b.title || '')) || cmpStr(String(idOf(a)), String(idOf(b)));
  recent.sort(byDoneAt); older.sort(byDoneAt);
  const plan = [];
  for (const r of future) { const last = plan[plan.length - 1]; if (last && last.date === r.due.date) last.items.push(r); else plan.push({ date: r.due.date, items: [r] }); }
  return { today, overdue, todayItems: todayL, count: overdue.length + todayL.length, plan, planCount: future.length, all: [...overdue, ...todayL, ...future, ...nodue], nodue, recent, older };
}
