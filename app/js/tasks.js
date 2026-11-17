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
