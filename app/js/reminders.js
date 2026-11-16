// タスク（iPhone のリマインダー）: 許可の確認と案内。状態確認だけでは許可を求めない。
export const REM_STATES = ['notDetermined', 'granted', 'denied', 'restricted'];
const norm = (s) => (REM_STATES.includes(s) ? s : 'denied');

// 状態だけ確認する（request はしない）。bridge 不在・失敗は 'unavailable'。
export async function checkReminderAccess(call) {
  try { const r = await call('reminderPermission', {}); return norm(r?.status); } catch { return 'unavailable'; }
}
// ボタンからだけ呼ぶ。許可ダイアログを出し、結果の状態を返す。
export async function requestReminderAccess(call) {
  try { const r = await call('requestReminderPermission', {}); return norm(r?.status); } catch { return 'unavailable'; }
}

// 一覧取得（第14版 PR14）。listIds は全 id を渡す（空は空結果）。completedSince は Stamp。
// 失敗は呼び出し側へ投げる（CANCELLED は後続の取得に置き換わった印）。タスク本文は保存しない。
export async function listReminders(call, listIds, completedSince) {
  const r = await call('listReminders', { listIds: [...listIds], completedSince });
  return Array.isArray(r?.reminders) ? r.reminders : [];
}

// 追加（第14版 PR16）。UI へはまだ公開しない。同じ requestId の再試行は同じ内容で呼ぶこと（異内容は INVALID_ARGUMENT）。
// listId は '' で OS 既定→書ける先頭。優先度・繰返し・URL は送れない。本文は保存しない。
export async function createReminder(call, { requestId, listId, title, notes = '', due = null }) {
  const r = await call('createReminder', { requestId, listId, title, notes, due });
  if (!r || !r.reminder) throw { code: 'UNAVAILABLE' };
  return r.reminder;
}

// 差分更新（第14版 PR18）。patch は変えた欄だけ（title/notes/listId/due。省略＝変更なし、due:null＝期限なし）。
// expectModifiedAt は読み込んだ時の modifiedAt（予定の expectModified とは別）。conflicted は差分上書きした印。
export async function updateReminder(call, target, expectModifiedAt, patch = {}) {
  const o = { itemId: target.itemId, expectModifiedAt: expectModifiedAt ?? null, patch: { ...patch } };
  if (target.externalId) o.externalId = target.externalId;
  const r = await call('updateReminder', o);
  if (!r || !r.reminder) throw { code: 'UNAVAILABLE' };
  return { reminder: r.reminder, conflicted: r.conflicted === true };
}
// 完了／戻し（同じ API）。衝突確認なし。
export async function setReminderDone(call, target, done) {
  const o = { itemId: target.itemId, done: !!done };
  if (target.externalId) o.externalId = target.externalId;
  const r = await call('setReminderDone', o);
  if (!r || !r.reminder) throw { code: 'UNAVAILABLE' };
  return r.reminder;
}

// ---- 第14版 PR15: 分類・読込・表示（タスク本文は保存しない。メモリ上だけ） ----
export const HIST_DAYS = 30;
const pad2 = (n) => String(n).padStart(2, '0');
const dk = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const stampOf = (d) => `${dk(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// Stamp（端末の現地時刻 'YYYY-MM-DDTHH:mm'）。完了の取得下限＝現在から days 日前。
export function completedSinceStamp(now, days) { const d = new Date(now.getTime()); d.setDate(d.getDate() - days); return stampOf(d); }
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const dueKey = (r) => `${r.due.date}T${r.due.time || '00:00'}`;
const byDue = (a, b) => cmp(dueKey(a), dueKey(b)) || cmp(a.title || '', b.title || '') || cmp(a.itemId, b.itemId);
const hasMs = (v) => typeof v === 'number' && Number.isFinite(v);
// 期限なしは作成の古い順。作成日時の欠落は後ろへ置き、題名・id 順。
const byCreated = (a, b) => (hasMs(a.createdAt) && hasMs(b.createdAt) ? a.createdAt - b.createdAt : hasMs(a.createdAt) ? -1 : hasMs(b.createdAt) ? 1 : 0)
  || cmp(a.title || '', b.title || '') || cmp(a.itemId, b.itemId);
const byDone = (a, b) => cmp(b.doneAt || '', a.doneAt || '') || cmp(a.title || '', b.title || '') || cmp(a.itemId, b.itemId);

// 分類: 期限切れ → 選択日 → この先 → 期限なし → 完了。
// 期限切れ＝実際の現在日時より前、または選択日より前の日付（どの欄にも入らない既往期限を拾う。過去の選択日と重複しない）。
export function groupReminders(items, { now = new Date(), selected, histDays = HIST_DAYS } = {}) {
  const nowS = stampOf(now), since = completedSinceStamp(now, histDays);
  const g = { overdue: [], selected: [], upcoming: [], nodue: [], done: [] };
  const seen = new Set();
  for (const r of Array.isArray(items) ? items : []) {
    if (!r || typeof r.itemId !== 'string' || seen.has(r.itemId)) continue;
    seen.add(r.itemId);
    if (r.done) { if (!r.doneAt || r.doneAt >= since) g.done.push(r); continue; }
    if (!r.due || !r.due.date) { g.nodue.push(r); continue; }
    const past = r.due.time ? dueKey(r) < nowS : r.due.date < nowS.slice(0, 10);
    if (past || r.due.date < selected) g.overdue.push(r);
    else if (r.due.date === selected) g.selected.push(r);
    else g.upcoming.push(r);
  }
  g.overdue.sort(byDue); g.selected.sort(byDue); g.upcoming.sort(byDue); g.nodue.sort(byCreated); g.done.sort(byDone);
  return g;
}

// 一覧の読込。リスト一覧→listIds（すべて）→listReminders。古い要求は世代で捨てる（捨てた分は null）。
// 権限エラーは投げる。CANCELLED は後続の要求に置き換わった印として null。
export function createReminderLoader(call) {
  let gen = 0;
  return {
    cancel() { gen++; },
    async load(days = HIST_DAYS, now = new Date()) {
      const g = ++gen;
      try {
        const l = await call('listReminderLists', {});
        if (g !== gen) return null;
        const lists = Array.isArray(l?.lists) ? l.lists : [];
        const reminders = await listReminders(call, lists.map((x) => x.id), completedSinceStamp(now, days));
        if (g !== gen) return null;
        return { lists, reminders };
      } catch (e) {
        if (g !== gen || e?.code === 'CANCELLED') return null;
        throw e;
      }
    },
  };
}

const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOWJ = ['日', '月', '火', '水', '木', '金', '土'];
const mdLabel = (k) => { const [, m, d] = k.split('-').map(Number); return `${m}/${d}`; };
const mdFull = (k) => { const [y, m, d] = k.split('-').map(Number); return `${m}月${d}日(${DOWJ[new Date(y, m - 1, d).getDay()]})`; };
const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#68716A');

function dueText(r) {
  const parts = [];
  if (r.due?.date) parts.push(r.due.time ? `${mdLabel(r.due.date)} ${r.due.time}` : mdLabel(r.due.date));
  if (r.recurring) parts.push('繰り返し');
  return parts.join('・');
}
export function taskRowHtml(r, color, overdue) {
  const dt = dueText(r), hasDue = !!dt;
  const pri = r.priority > 0 ? '<span class="rmpri" aria-label="優先度あり">!</span>' : '';
  const ro = r.readOnly ? ' ro' : '';
  const c = safeColor(color);
  const id = escH(r.itemId), ti = escH(r.title || '（題名なし）');
  return `<div class="rmrow${hasDue ? ' two' : ''}${r.done ? ' done' : ''}${ro}" data-key="rm:${id}" role="listitem" style="--rc:${c}">`
    + `<button type="button" class="rmckb" data-act="remck" data-id="${id}" role="checkbox" aria-checked="${r.done ? 'true' : 'false'}" aria-label="${r.done ? '未完了に戻す' : '完了にする'}：${ti}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button>`
    + `<button type="button" class="rmbody" data-act="remedit" data-id="${id}"><span class="rmt">${pri}${ti}</span>${hasDue ? `<span class="rmd${overdue ? ' late' : ''}">${escH(dt)}</span>` : ''}</button>`
    + `${r.readOnly ? '<span class="rmro">読み取り専用</span>' : ''}</div>`;
}
// ui: { doneOpen, histDays }。loading（初回）/ error は呼び出し側が渡す。
export function tasksHtml(data, { selected, now = new Date(), doneOpen = false, histDays = HIST_DAYS, loading = false, error = false, busyMore = false, add = null, pending = null } = {}) {
  if (!data) return `<div class="pagewait padb taskl" data-wait="task"><p class="remtx pad">${error ? 'リマインダーを読み込めませんでした。' : loading ? '読み込み中…' : ''}</p></div>`;
  const colors = new Map((data.lists || []).map((l) => [l.id, l.color]));
  const g = groupReminders(data.reminders, { now, selected, histDays });
  const row = (r, late) => taskRowHtml(pending?.has(r.itemId) ? { ...r, done: pending.get(r.itemId) } : r, colors.get(r.listId), late);
  const sec = (key, title, arr, late) => (arr.length ? `<section class="rmsec" data-sec="${key}"><h3 class="rmh${late ? ' late' : ''}">${escH(title)}</h3><div role="list">${arr.map((r) => row(r, late)).join('')}</div></section>` : '');
  let h = sec('overdue', '期限切れ', g.overdue, true) + sec('selected', mdFull(selected), g.selected, false) + sec('upcoming', 'この先', g.upcoming, false) + sec('nodue', '期限なし', g.nodue, false);
  const doneHead = `<button type="button" class="rmdonebtn" data-act="remdone" aria-expanded="${doneOpen}">完了（${g.done.length}） <span aria-hidden="true">${doneOpen ? '⌄' : '›'}</span></button>`;
  h += `<section class="rmsec" data-sec="done">${doneHead}${doneOpen ? `<div role="list">${g.done.map((r) => row(r, false)).join('')}</div><button type="button" class="rmmore" data-act="remmore"${busyMore ? ' disabled' : ''}>もっと前を表示</button>` : ''}</section>`;
  if (!g.overdue.length && !g.selected.length && !g.upcoming.length && !g.nodue.length) h = `<p class="remtx pad rmempty">未完了のタスクはありません。</p>${h}`;
  const addH = add ? addRowHtml(add.draft, { selected, noList: !add.listId }) : '';
  return `<div class="pagewait padb taskl" data-wait="task">${addH}${h}</div>`;
}

export const REM_TEXT = {
  intro: 'iPhone のリマインダーと同じタスクを、ここで見たり追加したりできます。',
  allow: 'リマインダーへのアクセスを許可',
  denied: '設定アプリでリマインダーへのアクセスを許可すると使えます。',
  settings: '設定を開く',
  restricted: 'この端末ではリマインダーへのアクセスが制限されています。',
  web: 'タスクは iPhone のアプリで使えます。',
};

// state: null（確認中）| 'unavailable' | 'notDetermined' | 'denied' | 'restricted'。granted は呼び出し側が通常のページを出す。
export function taskAccessHtml(state, where, native) {
  const w = String(where).replace(/[^a-z]/g, '');
  let body;
  if (!native || state === 'unavailable') body = `<p class="remtx">${REM_TEXT.web}</p>`;
  else if (state === 'denied') body = `<p class="remtx">${REM_TEXT.denied}</p><button type="button" class="rembtn" data-act="remsettings" data-where="${w}">${REM_TEXT.settings}</button>`;
  else if (state === 'restricted') body = `<p class="remtx">${REM_TEXT.restricted}</p>`;
  else if (state === 'notDetermined') body = `<p class="remtx">${REM_TEXT.intro}</p><button type="button" class="rembtn" data-act="remreq" data-where="${w}">${REM_TEXT.allow}</button>`;
  else body = `<p class="remtx">${REM_TEXT.intro}</p>`; // 確認中
  return `<div class="pagewait padb remgate" data-wait="task" data-remstate="${native ? state || 'checking' : 'web'}" data-where="${w}">${body}</div>`;
}

// ---- 第14版 PR17: タスクを続けて追加する（追加先の選び方・排他・再試行。本文は保存しない） ----
// 追加先: OS 既定（書ける場合）→ 書ける先頭。書けるリストがなければ null。
export function pickAddList(lists) {
  const ok = (Array.isArray(lists) ? lists : []).filter((l) => l && typeof l.id === 'string' && l.allowsModify !== false);
  return (ok.find((l) => l.isDefault) || ok[0] || null)?.id ?? null;
}
const newRequestId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
// 1つの入力欄に対する追加の制御。保存中は排他（busy）。失敗では本文を残し、同じ内容の再試行は同じ requestId、
// 内容（題名・期限・追加先）が変わったら新しい requestId、成功したら次の新タスク用に requestId を捨てる。
export function createAddController(call) {
  let pend = null, busy = false; // pend: { requestId, fp }
  return {
    get busy() { return busy; },
    // -> { ok:true, reminder } | { ok:false, code } | { ok:false, busy|empty|nolist:true }
    async submit({ title, listId, due = null }) {
      if (busy) return { ok: false, busy: true };
      const t = String(title ?? '').trim();
      if (!t) return { ok: false, empty: true };
      if (!listId) return { ok: false, nolist: true };
      const dueV = due ? { date: due } : null;
      const fp = JSON.stringify([listId, t, dueV]);
      if (!pend || pend.fp !== fp) pend = { requestId: newRequestId(), fp };
      const req = pend;
      busy = true;
      try {
        const reminder = await createReminder(call, { requestId: req.requestId, listId, title: t, notes: '', due: dueV });
        if (pend === req) pend = null;
        return { ok: true, reminder };
      } catch (e) {
        return { ok: false, code: e?.code || 'UNAVAILABLE' };
      } finally { busy = false; }
    },
  };
}

// 追加の行。draft: { open, title, due(日付キー|null|undefined=選択日に従う), busy, err }。入力値は描画後に呼び出し側が入れる。
export function addRowHtml(d, { selected, noList = false } = {}) {
  if (noList) return `<div class="rmadd off"><button type="button" class="rmaddbtn" disabled aria-describedby="rmaddwhy">＋ タスクを追加</button><p class="rmwhy" id="rmaddwhy">書き込めるリストがないため、追加できません。</p></div>`;
  if (!d.open) return `<div class="rmadd"><button type="button" class="rmaddbtn" data-act="remadd">＋ タスクを追加</button></div>`;
  const due = d.due === undefined ? selected : d.due;
  const chip = due
    ? `<span class="rmchip"><span>期限 ${mdLabel(due)}</span><button type="button" class="rmchipx" data-act="remdue0" aria-label="期限をなしにする">×</button></span>`
    : `<button type="button" class="rmchip rmchip0" data-act="remdue1" aria-label="期限を選んでいる日にする">期限なし</button>`;
  return `<div class="rmadd open"><div class="rmaddin"><input type="text" class="remin" enterkeyhint="done" autocomplete="off" aria-label="タスクの題名" placeholder="タスクを入力"${d.busy ? ' readonly aria-busy="true"' : ''}>${chip}</div>`
    + `${d.err ? `<p class="rmwhy err" role="alert">${escH(d.err)}</p>` : ''}</div>`;
}

// ---- 第14版 PR19: タスクの編集と完了（本文は保存しない。メモリ上だけ） ----
export const TASK_NOTE = 'iPhone のリマインダーに保存されます。';
export const TASK_CONFLICT = 'iPhone のリマインダー側でも変更されていたため、Duo の内容で上書きしました。';
const normDue = (d) => (d && d.date ? (d.time ? { date: d.date, time: d.time } : { date: d.date }) : null);
const sameDue = (a, b) => JSON.stringify(normDue(a)) === JSON.stringify(normDue(b));
// 編集シートの初期状態。lock: 'ro'（書けないリスト）| 'rec'（繰り返し＝完了だけ）| null。
export function openTaskEditor(r, lists = []) {
  const form = { title: r.title || '', date: r.due?.date || '', time: r.due?.time || '', listId: r.listId, notes: r.notes || '' };
  const ls = (Array.isArray(lists) ? lists : []).filter((l) => l.id === r.listId || l.allowsModify !== false);
  return { itemId: r.itemId, orig: r, form, base: JSON.stringify(form), lists: ls, lock: r.readOnly ? 'ro' : r.recurring ? 'rec' : null, err: '' };
}
export const taskDirty = (ed, form) => !ed.lock && JSON.stringify(form) !== ed.base;
// 変えた欄だけの patch。{ error } は入力の誤り。
export function buildTaskPatch(orig, f) {
  const title = String(f.title ?? '').trim();
  if (!title) return { error: '題名を入力してください。' };
  if (f.time && !f.date) return { error: '時刻を入れるときは日付も選んでください。' };
  const patch = {};
  if (title !== (orig.title || '')) patch.title = title;
  if ((f.notes || '') !== (orig.notes || '')) patch.notes = f.notes || '';
  if (f.listId && f.listId !== orig.listId) patch.listId = f.listId;
  const due = f.date ? (f.time ? { date: f.date, time: f.time } : { date: f.date }) : null;
  if (!sameDue(due, orig.due)) patch.due = due;
  return { patch };
}
// 保存。変更なしは呼ばない（noop）。優先度・繰返しは送らない。
export async function saveTask(call, orig, form) {
  if (orig.readOnly || orig.recurring) return { ok: false, code: orig.readOnly ? 'READ_ONLY' : 'NOT_EDITABLE' };
  const b = buildTaskPatch(orig, form);
  if (b.error) return { ok: false, invalid: b.error };
  if (!Object.keys(b.patch).length) return { ok: true, noop: true, reminder: orig, conflicted: false };
  try {
    const r = await updateReminder(call, { itemId: orig.itemId, externalId: orig.externalId }, orig.modifiedAt, b.patch);
    return { ok: true, ...r };
  } catch (e) { return { ok: false, code: e?.code || 'UNAVAILABLE' }; }
}
export function taskEditorHtml(ed) {
  const f = ed.form, dis = ed.lock ? ' disabled' : '';
  const r = ed.orig;
  const opts = ed.lists.map((l) => `<option value="${escH(l.id)}"${l.id === f.listId ? ' selected' : ''}>${escH(l.title || '')}</option>`).join('');
  const meta = (r.priority > 0 ? '<span class="rmpri" aria-label="優先度あり">!</span> 優先度あり　' : '') + (r.recurring ? '繰り返し（リマインダーで変更できます）' : '');
  const why = ed.lock === 'ro' ? '<p class="small" role="note">読み取り専用のリストのため変更できません。</p>' : ed.lock === 'rec' ? '<p class="small" role="note">繰り返しのタスクは完了だけ変更できます。</p>' : '';
  return `<label>題名<input id="tk-title" maxlength="200" value="${escH(f.title)}"${dis}></label>`
    + `<div class="pair"><label>期限<input id="tk-date" type="date" value="${escH(f.date)}"${dis}></label><label>時刻<input id="tk-time" type="time" value="${escH(f.time)}"${dis}></label></div>`
    + `<label>リスト<select id="tk-list"${dis}>${opts}</select></label>`
    + `<label>メモ<textarea id="tk-notes"${dis}>${escH(f.notes)}</textarea></label>`
    + (meta ? `<p class="small tkmeta">${meta}</p>` : '') + why;
}

// 完了の丸（即 native へ。1.5 秒後に完了段へ移す。再 tap は同じタスク内で直列化。失敗は表示を戻す）。
// onSettle(id, { result, failed, err }) — 表示を確定する時に呼ぶ。pending() は表示だけの上書き（id→done）。
export function createDoneController(call, { delay = 1500, onSettle, onPending } = {}) {
  const map = new Map();
  const settle = (e) => {
    if (e.dead || e.inflight > 0) return;
    if (!e.broken && !e.fired) return;
    map.delete(e.id); e.dead = true; clearTimeout(e.timer);
    onSettle?.(e.id, { result: e.result, failed: e.broken, err: e.err });
  };
  return {
    has: (id) => map.has(id),
    pending() { return new Map([...map].map(([id, e]) => [id, e.want])); },
    toggle(r) {
      if (!r || r.readOnly) return false;
      let e = map.get(r.itemId);
      if (!e) { e = { id: r.itemId, target: { itemId: r.itemId, externalId: r.externalId }, want: !!r.done, inflight: 0, fired: false, broken: false, dead: false, result: null, err: null, timer: 0, chain: Promise.resolve() }; map.set(r.itemId, e); }
      const want = (e.want = !e.want);
      clearTimeout(e.timer); e.fired = false;
      e.timer = setTimeout(() => { e.fired = true; settle(e); }, delay);
      e.inflight++;
      e.chain = e.chain.then(async () => {
        if (e.broken || e.dead) return;
        try { e.result = await setReminderDone(call, e.target, want); } catch (x) { e.broken = true; e.err = x; }
      }).finally(() => { e.inflight--; settle(e); });
      onPending?.();
      return true;
    },
    reset() { for (const e of map.values()) { e.dead = true; clearTimeout(e.timer); } map.clear(); },
  };
}
