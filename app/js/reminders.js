import { todayTasks, dueCounts as dueCountsOf } from './tasks.js';
import { monthPopParts, hourCellsHtml, minCellsHtml, splitHm, oddMinute, monthOf } from './datetime-ui.js';
// 削除（第14版 PR20）。force はない。expectModifiedAt は読み込んだ時の modifiedAt。不在は成功（missing）。
export async function removeTaskVia(call, target, expectModifiedAt) {
  const o = { itemId: target.itemId, expectModifiedAt: expectModifiedAt ?? null };
  if (target.externalId) o.externalId = target.externalId;
  const r = await call('taskDelete', o);
  if (!r || r.deleted !== true) throw { code: 'UNAVAILABLE' };
  return { missing: r.missing === true };
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
  if (!data) return `<div class="pagewait padb taskl" data-wait="task"><p class="remtx pad">${error ? 'タスクを読み込めませんでした。' : loading ? '読み込み中…' : ''}</p></div>`;
  const colors = new Map((data.lists || []).map((l) => [l.id, l.color]));
  const g = groupReminders(data.reminders, { now, selected, histDays });
  const row = (r, late) => taskRowHtml(pending?.has(r.itemId) ? { ...r, done: pending.get(r.itemId) } : r, colors.get(r.listId), late);
  const sec = (key, title, arr, late) => (arr.length ? `<section class="rmsec" data-sec="${key}"><h3 class="rmh${late ? ' late' : ''}">${escH(title)}</h3><div role="list">${arr.map((r) => row(r, late)).join('')}</div></section>` : '');
  let h = sec('overdue', '期限切れ', g.overdue, true) + sec('selected', mdFull(selected), g.selected, false) + sec('upcoming', 'この先', g.upcoming, false) + sec('nodue', '期限なし', g.nodue, false);
  const doneHead = `<button type="button" class="rmdonebtn" data-act="remdone" aria-expanded="${doneOpen}">完了（${g.done.length}） <span aria-hidden="true">${doneOpen ? '⌄' : '›'}</span></button>`;
  h += `<section class="rmsec" data-sec="done">${doneHead}${doneOpen ? `<div role="list">${g.done.map((r) => row(r, false)).join('')}</div><button type="button" class="rmmore" data-act="remmore"${busyMore ? ' disabled' : ''}>もっと前を表示</button>` : ''}</section>`;
  if (!g.overdue.length && !g.selected.length && !g.upcoming.length && !g.nodue.length) h = `<p class="remtx pad rmempty">未完了のタスクはありません。</p>${h}`;
  const addH = add ? addRowHtml(add.draft, { selected, noList: add.noList === true }) : '';
  return `<div class="pagewait padb taskl" data-wait="task">${addH}${h}</div>`;
}

// ---- 第14版 PR17: タスクを続けて追加する（追加先の選び方・排他・再試行。本文は保存しない） ----
// 追加先: OS 既定（書ける場合）→ 書ける先頭。書けるリストがなければ null。
function pickAddList(lists) {
  const ok = (Array.isArray(lists) ? lists : []).filter((l) => l && typeof l.id === 'string' && l.allowsModify !== false);
  return (ok.find((l) => l.isDefault) || ok[0] || null)?.id ?? null;
}
// 追加の行。draft: { open, title, due(日付キー|null|undefined=選択日に従う), busy, err }。入力値は描画後に呼び出し側が入れる。
export function addRowHtml(d, { selected, noList = false } = {}) {
  if (noList) return `<div class="rmadd off"><button type="button" class="rmaddbtn" disabled aria-describedby="rmaddwhy">＋ タスクを追加</button><p class="rmwhy" id="rmaddwhy">書き込めるリストがないため、追加できません。</p></div>`;
  const due = d.due === undefined ? selected : d.due;
  const time = due ? d.time || '' : '';
  const label = due ? `期限 ${mdLabel(due)}${time ? ` ${time}` : ''}` : '期限なし';
  const chip = due
    ? `<span class="rmchip"><button type="button" class="rmchipl" data-act="remdue2" aria-expanded="${!!d.pop}" aria-label="期限を選ぶ: ${escH(label)}">${escH(label)}</button><button type="button" class="rmchipx" data-act="remdue0" aria-label="期限をなしにする">×</button></span>`
    : `<button type="button" class="rmchip rmchip0" data-act="remdue2" aria-expanded="${!!d.pop}" aria-label="期限を選ぶ">期限なし</button>`;
  const on = d.notify === true;
  const nchip = due
    ? `<button type="button" class="rmchip rmnote${on ? ' on' : ''}" data-act="remnote" role="switch" aria-checked="${on}" aria-label="通知">${on ? '通知あり' : '通知なし'}</button>`
    : '';
  return `<div class="rmadd open"><div class="rmaddin"><input type="text" class="remin" enterkeyhint="done" autocomplete="off" aria-label="タスクの題名" placeholder="タスクを入力"${d.busy ? ' readonly aria-busy="true"' : ''}>${chip}${nchip}<button type="button" class="rmaddgo" data-act="remsubmit" aria-label="タスクを追加"${d.busy ? ' disabled' : ''}>追加</button></div>`
    + (d.pop ? addDuePopHtml(d, due, time) : '')
    + `<p class="rmwhy" id="rmnotewhy">${due ? (on ? (time ? '期限の時刻に通知します。' : '期限の日の 8:00 に通知します。') : '通知しません。') : '期限がないタスクは通知されません。'}</p>`
    + `${d.err ? `<p class="rmwhy err" role="alert">${escH(d.err)}</p>` : ''}</div>`;
}
// 期限の部品（予定と同じ日付の小さな月＋「時刻を入れる」）。d.pop = { vm }
function addDuePopHtml(d, due, time) {
  const m = monthPopParts(d.pop.vm || monthOf(due || todayKeyLocal()), { cur: due || '', attr: 'data-act="remdp"' });
  const cur = splitHm(time), odd = cur ? oddMinute(cur.mi) : '';
  return `<div class="dpop rmdp"><div class="dpchips">${m.chips}</div>`
    + `<div class="dpmh"><button type="button" class="dpnav" data-act="remdpn" data-n="-1" aria-label="前の月">‹</button><span class="dpmt" aria-live="polite">${m.title}</span><button type="button" class="dpnav" data-act="remdpn" data-n="1" aria-label="次の月">›</button></div>`
    + `<div class="dpwk">${m.heads}</div><div class="dpgrid">${m.grid}</div>`
    + `<div class="rmdpt"><button type="button" class="rmchip rmtimeon${time ? ' on' : ''}" data-act="remtimeon" role="switch" aria-checked="${!!time}"${due ? '' : ' disabled'}>時刻を入れる</button></div>`
    + (time ? `<div class="tpop"><p class="tlab">時</p><div class="tgrid hgrid">${hourCellsHtml(cur, 'data-act="remth"')}</div><p class="tlab">分${odd ? ` <span class="tnote">${odd}</span>` : ''}</p><div class="tgrid mgrid">${minCellsHtml(cur, 'data-act="remtm"')}</div></div>` : '')
    + `</div>`;
}
const todayKeyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---- 第14版 PR19: タスクの編集と完了（本文は保存しない。メモリ上だけ） ----
export const NOTE_NEED_DUE = '期限を入れると通知できます。';
const normDue = (d) => (d && d.date ? (d.time ? { date: d.date, time: d.time } : { date: d.date }) : null);
export const hasNotify = (r) => Array.isArray(r?.alarms) && r.alarms.length > 0;
const sameDue = (a, b) => JSON.stringify(normDue(a)) === JSON.stringify(normDue(b));
// 編集シートの初期状態。lock: 'ro'（書けないリスト）| 'rec'（繰り返し＝完了だけ）| null。
export function openTaskEditor(r, lists = []) {
  const form = { title: r.title || '', date: r.due?.date || '', time: r.due?.time || '', notes: r.notes || '' };
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
  const due = f.date ? (f.time ? { date: f.date, time: f.time } : { date: f.date }) : null;
  if (!sameDue(due, orig.due)) patch.due = due;
  // 通知は利用者が操作した時だけ送る（表示しただけでは送らない）。期限なしには送れない。元と同じ値への操作も送らない。
  if (typeof f.notify === 'boolean' && due && f.notify !== hasNotify(orig)) patch.notify = f.notify;
  if (!due && hasNotify(orig)) patch.notify = false; // 期限なしは通知なし
  return { patch };
}
// 保存。変更なしは呼ばない（noop）。優先度・繰返しは送らない。
export async function saveTask(call, orig, form) {
  if (orig.readOnly || orig.recurring) return { ok: false, code: orig.readOnly ? 'READ_ONLY' : 'NOT_EDITABLE' };
  const b = buildTaskPatch(orig, form);
  if (b.error) return { ok: false, invalid: b.error };
  if (!Object.keys(b.patch).length) return { ok: true, noop: true, reminder: orig, conflicted: false };
  try {
    const r = await call('taskUpdate', { itemId: orig.itemId, patch: b.patch }); // Duo 内保存の口（native は呼ばない）
    return { ok: true, reminder: r.reminder, conflicted: false };
  } catch (e) { return { ok: false, code: e?.code || 'UNAVAILABLE' }; }
}
export function taskEditorHtml(ed) {
  const f = ed.form, dis = ed.lock ? ' disabled' : '';
  const r = ed.orig;
  const meta = '';
  const why = ed.lock === 'ro' ? '<p class="small" role="note">読み取り専用のリストのため変更できません。</p>' : ed.lock === 'rec' ? '<p class="small" role="note">繰り返しのタスクは完了だけ変更できます。</p>' : '';
  return `<div class="tkwrap"><label>題名<input id="tk-title" maxlength="200" value="${escH(f.title)}"${dis}></label>`
    + `<div class="dtrow tkrow" id="tk-daterow"><span class="dtk">期限</span><button type="button" id="tk-date" class="dcap" aria-haspopup="true" aria-expanded="false" value="${escH(f.date)}"${dis}></button></div>`
    + `<div class="dtrow tkrow" id="tk-timerow"><label class="tkck tkton"><input id="tk-timeon" type="checkbox" role="switch"${dis}> 時刻を入れる</label><button type="button" id="tk-time" class="tcap" aria-haspopup="true" aria-expanded="false" value="${escH(f.time)}"${dis}${f.time ? '' : ' hidden'}></button></div>`
    + `<div class="tknote"><label class="tkck"><input id="tk-notify" type="checkbox"${dis}> 通知する</label><p class="small" id="tk-notewhy" role="note"></p>`
    + `</div>`
    + `<label>メモ<textarea id="tk-notes"${dis}>${escH(f.notes)}</textarea></label>`
    + (meta ? `<p class="small tkmeta">${meta}</p>` : '') + why + '</div>';
}

// ---- 第14版 PR20: 削除（4秒の取消）。即非表示、4秒たつか画面が裏に回ったら native で削除。再作成での取消はしない ----
export const DELETE_UNDO_MS = 4000;
export const TASK_DELETED = 'タスクを削除しました';
export const TASK_DELETE_CONFLICT = 'iPhone のリマインダー側で変更されていたため、削除せずに残しました。';
// onChange(): 非表示の集合が変わった。onSettle(id, { ok, missing, err }): native の結果が出た（ok=false なら表示へ戻す）。
export function createDeleteController(call, { delay = DELETE_UNDO_MS, onChange, onSettle } = {}) {
  const map = new Map(); // id -> { r, timer, sent }
  const send = async (e) => {
    if (e.sent) return;
    e.sent = true; clearTimeout(e.timer);
    let out;
    try { const x = await removeTaskVia(call, { itemId: e.r.itemId, externalId: e.r.externalId }, e.r.modifiedAt); out = { ok: true, missing: x.missing }; }
    catch (err) { out = { ok: false, err }; }
    if (map.get(e.r.itemId) !== e) return;
    map.delete(e.r.itemId);
    onSettle?.(e.r.itemId, out);
    onChange?.();
  };
  return {
    has: (id) => map.has(id),
    ids: () => new Set(map.keys()),
    // 削除できないもの（読み取り専用・繰返し・すでに予約済み）は false。
    schedule(r) {
      if (!r || r.readOnly || r.recurring || map.has(r.itemId)) return false;
      const e = { r, timer: 0, sent: false };
      e.timer = setTimeout(() => send(e), delay);
      map.set(r.itemId, e);
      onChange?.();
      return true;
    },
    // 4秒内の取消。native へまだ送っていなければ何も呼ばずに元へ戻す。
    undo(id) {
      const e = map.get(id);
      if (!e || e.sent) return false;
      clearTimeout(e.timer); map.delete(id);
      onChange?.();
      return true;
    },
    // 画面が裏に回った時: 待っているものを今すぐ送る。
    flush() { for (const e of [...map.values()]) send(e); },
    // 許可の取消など: 送っていないものは送らずに捨てる。
    reset() { for (const e of map.values()) clearTimeout(e.timer); map.clear(); },
  };
}

// ---- 第14版 PR23: タスクのリスト設定と月の件数（設定は端末内 duo-native-rem。バックアップには入れない） ----
// enabled: リマインダーの同期（false の間は一覧を取得しない。欠落・不正は true）。
// lists: null＝初回未選択（最初の一覧取得の成功で全 id を保存する）| id 配列＝選んだリスト（[] は意図した全オフ）。以後に増えたリストは選ばない。
// addTo: ''＝自動（選択中で書ける: OS 既定→先頭）| リスト id。monthTasks: 初期 off。
export const REM_SETTINGS_DEFAULT = { enabled: true, lists: null, addTo: '', monthTasks: false };
export function normRemSettings(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const lists = Array.isArray(o.lists) ? [...new Set(o.lists.filter((x) => typeof x === 'string' && x))] : null;
  return { enabled: o.enabled !== false, lists, addTo: typeof o.addTo === 'string' ? o.addTo : '', monthTasks: o.monthTasks === true };
}
// 表示するリストの id（実在するものだけ）。未初期化（null）の間だけ全件、選択済みは [] でも空のまま（全オフを全件へ戻さない）。
export function shownListIds(s, lists) {
  const all = (Array.isArray(lists) ? lists : []).filter((l) => l && typeof l.id === 'string').map((l) => l.id);
  if (!s || !Array.isArray(s.lists)) return all;
  const have = new Set(all);
  return s.lists.filter((id) => have.has(id));
}
// 初回の一覧取得が成功（空でない）した時、未初期化なら全 id を選択として保存する。それ以外は同じ object を返す。
export function initRemLists(s, lists) {
  if (!s || Array.isArray(s.lists)) return s;
  const ids = shownListIds(s, lists);
  return ids.length ? { ...s, lists: ids } : s;
}
// 消えたリストの id を設定から除く（全部消えても [] のまま。全件には戻さない）。リスト一覧が空（取得の一時的な空）の時は触らない。変化がなければ同じ object を返す。
export function pruneRemSettings(s, lists) {
  const ids = new Set((Array.isArray(lists) ? lists : []).map((l) => l?.id));
  if (!ids.size) return s;
  let lists2 = s.lists, addTo = s.addTo;
  if (Array.isArray(s.lists)) { const k = s.lists.filter((id) => ids.has(id)); if (k.length !== s.lists.length) lists2 = k; }
  if (addTo && !ids.has(addTo)) addTo = '';
  return lists2 === s.lists && addTo === s.addTo ? s : { ...s, lists: lists2, addTo };
}
// 追加先。選択（✓）中で書けるリストだけが候補。設定の先が候補ならそれ、なければ自動（OS 既定→候補の先頭）。候補がなければ null（追加不可）。
// selected 省略時は一覧の全件を候補とする。
export function resolveAddList(lists, addTo, selected) {
  const sel = selected === undefined ? null : new Set(selected);
  const cand = (Array.isArray(lists) ? lists : []).filter((l) => l && typeof l.id === 'string' && l.allowsModify !== false && (!sel || sel.has(l.id)));
  const ok = addTo && cand.find((l) => l.id === addTo);
  return ok ? ok.id : pickAddList(cand);
}
// 表示するリストのタスクだけ。
export function filterByLists(reminders, shown) {
  const set = shown instanceof Set ? shown : new Set(shown);
  return (Array.isArray(reminders) ? reminders : []).filter((r) => r && set.has(r.listId));
}
// 日付キー → 未完了で期限がその日のタスク数（表示リストのみ）。doneOverride: id→done（完了操作中の表示上の上書き）。タスク名は返さない。
// 右の帯のタスクの数: 期限が今日以前（期限切れ＋今日）の未完了。doneOverride は完了操作の途中の見え方。
export function overdueTodayCount(reminders, shown, doneOverride, today) {
  return todayTasks(filterByLists(reminders, shown), today, doneOverride).total;
}
export function dueCounts(reminders, shown, doneOverride) {
  return dueCountsOf(filterByLists(reminders, shown), doneOverride);
}
