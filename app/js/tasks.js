// タスク（Duo 内保存）の型・検証・分類。DB には触れない（保存操作は db.js）。
// Task = { id, title, due: {date:'YYYY-MM-DD', time?:'HH:mm'} | null, done, doneAt: Stamp|null, createdAt, updatedAt: ms, order, note, notify }
import { LIMITS, isKey } from './util.js';

export const TASK_NOTE_MAX = 10000;
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
  if (title.length > LIMITS.title) return { ok: false, error: `タスク名は${LIMITS.title}文字以内にしてください。` };
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
  return { ok: true, task: { id: t.id, title, due, done, doneAt: done ? doneAt : null, createdAt: t.createdAt, updatedAt: t.updatedAt, order: t.order, note, notify: due ? notify : false } };
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
export const rowOf = (t) => ({ itemId: t.id, listId: LOCAL_LIST.id, title: t.title, notes: t.note, due: t.due, done: t.done, doneAt: t.doneAt, alarms: t.notify ? [{}] : [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: t.createdAt, modifiedAt: t.updatedAt, readOnly: false });
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
    if (!['title', 'note', 'due', 'notify'].includes(k)) return { ok: false, error: 'タスクの変更内容が不正です。' };
    out[k] = p[k];
  }
  if ('title' in out) { if (typeof out.title !== 'string' || !out.title.trim()) return { ok: false, error: 'タスク名を入力してください。' }; out.title = out.title.trim(); }
  if ('note' in out && typeof out.note !== 'string') return { ok: false, error: 'タスクのメモが不正です。' };
  if ('notify' in out && typeof out.notify !== 'boolean') return { ok: false, error: 'タスクの通知設定が不正です。' };
  if ('due' in out && out.due !== null) {
    const d = out.due;
    if (!d || typeof d !== 'object' || !isKey(d.date) || (d.time != null && !TIME_RE.test(String(d.time)))) return { ok: false, error: 'タスクの期限が不正です。' };
    out.due = d.time != null ? { date: d.date, time: d.time } : { date: d.date };
  }
  return { ok: true, patch: out };
}

export function createTaskStore(db) {
  return {
    async list() { try { return await db.listTasks(); } catch (e) { throw storeErr(e); } },
    // id は呼び出し側が決める（同じ要求の再試行は同じ id → db.addTask が重複させない）。
    async add({ id, title, due = null, notify = false, note = '' }) { try { return await db.addTask({ id, title, due, notify, note }); } catch (e) { throw storeErr(e); } },
    // patch: { title?, note?, due?, notify? }。変えていない項目は保持する。
    async update(id, patch, now = Date.now()) {
      try {
        const v = validateTaskPatch(patch);
        if (!v.ok) throw fail('INVALID_ARGUMENT', new Error(v.error));
        const cur = await db.getTask(id);
        if (!cur) throw fail('NOT_FOUND');
        const p = v.patch, due = 'due' in p ? p.due : cur.due;
        // 期限なしは通知なし。期限だけの変更では通知を ON にしない（notify は触らない）。
        return await db.putTask({ ...cur, ...('title' in p ? { title: p.title } : {}), ...('note' in p ? { note: p.note } : {}), due, ...('notify' in p ? { notify: p.notify } : {}), updatedAt: now });
      } catch (e) { throw storeErr(e); }
    },
    async setDone(id, done, now = Date.now()) {
      try {
        const cur = await db.getTask(id);
        if (!cur) throw fail('NOT_FOUND');
        return await db.putTask({ ...cur, done: !!done, doneAt: done ? stampNow(new Date(now)) : null, updatedAt: now });
      } catch (e) { throw storeErr(e); }
    },
    async remove(id) { try { const cur = await db.getTask(id); await db.deleteTask(id); return { missing: !cur }; } catch (e) { throw storeErr(e); } },
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
