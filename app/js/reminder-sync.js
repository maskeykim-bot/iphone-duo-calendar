// iPhone のリマインダーとの双方向同期（第19版 D7）。正本は Duo の IndexedDB。
// ・Duo に書けたら同じ操作でリマインダーへ書く（失敗は syncState:'pending' のまま次の機会に再送。本文は別に持たない）。
// ・calendarChanged（300ms で間引き）と前面復帰で差分を取る。欄ごとに新しい方を残す（RS-12）。
// ・Duo から消すと墓標（tasks.js tombstoneOf）が残り、その外部 id を取り込み直さない（RS-11）。
// ・リマインダー側で消されたら Duo は消さず、つながりを外して「連携なし」（syncState:'local'。決定 4、RS-9・RS-56）。
// ・書き出し先の「Duo」リストが消えたら、2 回確かめたうえで syncState:'listMissing'（RS-47）。
// 純粋な計画（planSync）と、native・DB を注入された実行（createReminderSync）に分けてある。
import { isLinked, isTombstone, newTaskId, stampNow, unlinkTask, TASK_TITLE_MAX } from './tasks.js';

export const SYNC_WINDOW_DAYS = 30; // 完了の取得窓（reminders.js の HIST_DAYS と同じ）
export const ECHO_MS = 1000; // 差が 1 秒未満ならリマインダー側を新しいと見ない（書き出した直後のエコー）
export const CONFLICT_NOTICE = 'iPhone のリマインダーと同時に変わっていたため、新しい方を残しました。';
export const DUO_LIST_TITLE = 'Duo';
export const SYNC_FIELDS = ['title', 'note', 'due', 'done', 'notify'];

export const SYNC_DEFAULT = { enabled: false, everEnabled: false, lists: [], duoListId: '', duoSourceId: '', duoListTitle: DUO_LIST_TITLE, listMissing: false, listAsked: false, addTo: '', syncedAt: 0, declined: [] };
const str = (v) => (typeof v === 'string' ? v : '');
export function normSyncSettings(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    enabled: o.enabled === true,
    everEnabled: o.everEnabled === true || o.enabled === true,
    lists: Array.isArray(o.lists) ? [...new Set(o.lists.filter((x) => typeof x === 'string' && x))] : [],
    duoListId: str(o.duoListId), duoSourceId: str(o.duoSourceId), duoListTitle: str(o.duoListTitle) || DUO_LIST_TITLE,
    listMissing: o.listMissing === true, listAsked: o.listAsked === true,
    declined: Array.isArray(o.declined) ? [...new Set(o.declined.filter((x) => typeof x === 'string' && x))].slice(-2000) : [],
    addTo: str(o.addTo), syncedAt: Number.isFinite(o.syncedAt) && o.syncedAt > 0 ? o.syncedAt : 0,
  };
}

// ---- 値の見え方（比較用） ----
const normDue = (d) => (d && d.date ? (d.time ? { date: d.date, time: d.time } : { date: d.date }) : null);
export const duoView = (t) => ({ title: t.title, note: t.note || '', due: normDue(t.due), done: !!t.done, notify: !!t.notify && !!t.due });
export const remView = (r) => { const due = normDue(r.due); return { title: String(r.title ?? '').trim(), note: r.notes || '', due, done: !!r.done, notify: !!due && Array.isArray(r.alarms) && r.alarms.length > 0 }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sinceStamp = (now, days) => { const d = new Date(now.getTime()); d.setDate(d.getDate() - days); return stampNow(d); };

// 欄ごとの判定。base は前回合意した値（なければ null）。戻り値 { take, give, conflicts }
//  take: リマインダーの値を Duo へ取る欄／give: Duo の値をリマインダーへ書く欄／conflicts: 両方で変わった欄（done は含めない）。
export function mergeFields({ duo, rem, base, pending, duoAt, remAt, canGive }) {
  const take = {}, give = {}, conflicts = [];
  for (const f of SYNC_FIELDS) {
    if (same(duo[f], rem[f])) continue;
    if (f === 'title' && !rem.title) continue; // 空の題名は取り込まない
    let side; // 'rem' | 'duo'
    const b = base ? base[f] : undefined;
    if (base && same(duo[f], b)) side = 'rem';
    else if (base && same(rem[f], b)) side = 'duo';
    else if (!base && !pending) side = 'rem';
    else { // 両方で変わった（または基準がなく Duo にも未送信の変更がある）: 新しい方。リマインダーが 1 秒以上新しいときだけリマインダー。
      side = remAt - duoAt >= ECHO_MS ? 'rem' : 'duo';
      if (f !== 'done') conflicts.push(f);
    }
    if (side === 'duo' && !(canGive === true || (Array.isArray(canGive) && canGive.includes(f)))) side = 'rem'; // 読み取り専用・繰り返しは Duo から書けない
    (side === 'rem' ? take : give)[f] = side === 'rem' ? rem[f] : duo[f];
  }
  // 期限なしは通知なし
  if ('due' in take && take.due === null) { take.notify = false; delete give.notify; }
  return { take, give, conflicts };
}

// ---- 初めてオンにするときの確認の一覧（第19版 PR10。画面の部品。書き込みは applyFirst だけ） ----
// tasks: DB の全件。rems: 「Duo」リストの今あるリマインダー（無ければ空）。
//  toAdd: つながりのない Duo のタスク（リマインダーへ入れる）／maybe: 題名と期限が 1 対 1 で同じもの（題名だけ・2 件以上当たるものは出さない）。
const dueKeyOf = (d) => (d && d.date ? `${d.date}T${d.time || ''}` : '');
// 以前の「Duo」リストの候補（RS-49b）。題名がちょうど「Duo」（前後の空白は除く）で書けるリスト。名前だけが頼りなので、2 件以上は自動で選ばない。
// 既定のリストと同じソースのものは上に置くだけ（印。選ばない）。
export function prevListCandidates(lists, title = DUO_LIST_TITLE) {
  const ls = Array.isArray(lists) ? lists : [];
  const defSrc = (ls.find((l) => l && l.isDefault) || {}).sourceId || '';
  const hit = ls.filter((l) => l && String(l.title ?? '').trim() === title && l.allowsModify !== false);
  return [...hit.filter((l) => defSrc && l.sourceId === defSrc), ...hit.filter((l) => !(defSrc && l.sourceId === defSrc))];
}
// opts.declined: 前に「取り込まない」と決めた件の id（itemId・externalId）。
// pick: リマインダーにだけある件（以前の「Duo」リストの分。選ぶまで入れない。初期は全部オフ）。
export function previewFirst(tasks, rems, opts = {}) {
  const live = (tasks || []).filter((t) => !isTombstone(t) && !isLinked(t) && t.syncState !== 'local'); // 「連携なし」（リマインダーで消された）は書き出し直さない
  const rl = (rems || []).filter(Boolean);
  const declined = new Set(opts.declined || []);
  const key = (title, due) => `${String(title ?? '').trim()}\u0000${dueKeyOf(normDue(due))}`;
  const rc = new Map(), tc = new Map();
  for (const r of rl) rc.set(key(r.title, r.due), [...(rc.get(key(r.title, r.due)) || []), r]);
  for (const t of live) tc.set(key(t.title, t.due), [...(tc.get(key(t.title, t.due)) || []), t]);
  const maybe = [], maybeIds = new Set(), maybeRem = new Set();
  for (const t of live) {
    const k = key(t.title, t.due), a = tc.get(k), b = rc.get(k);
    if (t.due && a.length === 1 && b && b.length === 1) { maybe.push({ task: t, rem: b[0], choice: 'link' }); maybeIds.add(t.id); maybeRem.add(b[0].itemId); }
  }
  // すでに Duo のタスクとつながっている件は一覧に出さない
  const linkedItem = new Set(), linkedExt = new Set();
  for (const t of tasks || []) { if (t.remItemId) linkedItem.add(t.remItemId); if (t.remExternalId) linkedExt.add(t.remExternalId); }
  const pick = rl.filter((r) => !maybeRem.has(r.itemId) && !linkedItem.has(r.itemId) && !(r.externalId && linkedExt.has(r.externalId)) && !declined.has(r.itemId) && !(r.externalId && declined.has(r.externalId)))
    .map((r) => ({ rem: r, on: false }));
  return { toAdd: live.filter((t) => !maybeIds.has(t.id)), maybe, pick };
}
// リマインダーの 1 件から Duo のタスクを作る（取り込み。新しい id、つながりを付ける）。
export function taskFromRem(r, now, order) {
  const v = remView(r);
  return { id: newTaskId(now.getTime()), title: (v.title || '（題名なし）').slice(0, TASK_TITLE_MAX), due: v.due, done: v.done, doneAt: v.done ? (r.doneAt || stampNow(now)) : null, createdAt: Number.isFinite(r.createdAt) ? r.createdAt : now.getTime(), updatedAt: Number.isFinite(r.modifiedAt) ? r.modifiedAt : now.getTime(), order, note: v.note.slice(0, 10000), notify: v.notify, ...linkFields(r), syncState: 'linked' };
}
const linkFields = (r) => ({ remItemId: r.itemId, ...(r.externalId ? { remExternalId: r.externalId } : {}), remListId: r.listId, ...(Number.isFinite(r.modifiedAt) ? { remModifiedAt: r.modifiedAt } : {}) });
// 確認のあとの反映。link: つなぐ（書き込みなし）／keep: 両方残す（Duo のタスクはリマインダーへ書く）／skip: 入れない（この件は書き出さない）。
// toAdd と keep は pending に、skip は状態なしに（'local' は「リマインダーで消された」の印なので使わない）。つなぐ件は基準の値を残す。リマインダーへの書き込みは、このあとの同期が行う。
// pick: 選んだ（on）件だけ Duo に入れて結ぶ。選ばなかった件と「入れない」の件は declined に返す（リマインダーに残し、Duo には作らない。あとの同期でも取り込まない）。
export async function applyFirst({ db, toAdd, maybe, pick = [], base, now = new Date() }) {
  const declined = [];
  for (const t of toAdd) await db.putTask({ ...(await db.getTask(t.id) || t), syncState: 'pending' });
  for (const m of maybe) {
    const cur = (await db.getTask(m.task.id)) || m.task;
    if (m.choice === 'link') {
      await db.putTask({ ...cur, remItemId: m.rem.itemId, ...(m.rem.externalId ? { remExternalId: m.rem.externalId } : {}), remListId: m.rem.listId, ...(Number.isFinite(m.rem.modifiedAt) ? { remModifiedAt: m.rem.modifiedAt } : {}), syncState: 'linked' });
      if (base) base[cur.id] = duoView(cur);
    } else if (m.choice === 'keep') await db.putTask({ ...cur, syncState: 'pending' });
    else { const { syncState, ...rest } = cur; await db.putTask(rest); declined.push(m.rem.itemId); if (m.rem.externalId) declined.push(m.rem.externalId); } // 入れない: 状態なし（pending にならないので書き出されない）。リマインダー側も取り込まない
  }
  const on = pick.filter((p) => p.on);
  if (on.length) {
    let order = (await db.listTasks()).reduce((m, t) => Math.max(m, t.order), 0);
    for (const p of on) {
      const task = taskFromRem(p.rem, now, ++order);
      await db.putTask(task);
      if (base) base[task.id] = { ...remView(p.rem), title: task.title };
    }
  }
  for (const p of pick) if (!p.on) { declined.push(p.rem.itemId); if (p.rem.externalId) declined.push(p.rem.externalId); }
  return { declined, imported: on.length };
}

// ---- 計画（副作用なし） ----
// tasks: DB の全件（墓標を含む）。rems: 取得したリマインダー。readIds: 読んだリスト。presentIds: 今ある全リスト id。
export function planSync({ tasks, rems, readIds, presentIds, duoListId, base = {}, now = new Date(), declined = [] }) {
  const decl = new Set(declined);
  const windowStart = sinceStamp(now, SYNC_WINDOW_DAYS);
  const read = new Set(readIds), present = new Set(presentIds);
  const byItem = new Map(), byExt = new Map();
  for (const r of rems) {
    if (!r || typeof r.itemId !== 'string') continue;
    byItem.set(r.itemId, r);
    if (r.externalId) byExt.set(r.externalId, [...(byExt.get(r.externalId) || []), r]);
  }
  const plan = { creates: [], syncs: [], unlinks: [], deletes: [], imports: [], ambiguous: [], lost: [], matched: new Set() };
  const seen = { item: new Set(), ext: new Set() };
  for (const t of tasks) {
    if (t.remItemId) seen.item.add(t.remItemId);
    if (t.remExternalId) seen.ext.add(t.remExternalId);
    if (isTombstone(t)) { if (t.remListId) plan.deletes.push(t); continue; }
    if (t.syncState === 'local' || t.syncState === 'listMissing') continue;
    if (!isLinked(t)) { if (t.syncState === 'pending' && duoListId) plan.creates.push(t); continue; }
    let rem = t.remItemId ? byItem.get(t.remItemId) : null;
    if (!rem && t.remExternalId) {
      const hits = byExt.get(t.remExternalId) || [];
      if (hits.length > 1) { plan.ambiguous.push(t); continue; } // 外部 id が 2 件当たったら書かない（RS-34）
      rem = hits[0] || null;
    }
    if (!rem) {
      // 消されたと見なすのは、読んだリストにあった件だけ。完了窓の外へ出ただけ（古い完了）は削除と見なさない。
      const outside = t.done && (!t.doneAt || t.doneAt < windowStart);
      if (t.remListId && read.has(t.remListId) && present.has(t.remListId) && !outside) plan.unlinks.push(t);
      else if (!outside && t.remListId && !present.has(t.remListId)) plan.lost.push(t); // バックアップから戻したあと、この端末に元のリストも件も無い（RS-36）
      continue;
    }
    plan.matched.add(rem.itemId);
    const pending = t.syncState === 'pending';
    const linkSame = rem.itemId === t.remItemId && rem.externalId === (t.remExternalId || '') && rem.listId === t.remListId;
    if (!pending && linkSame && rem.modifiedAt === t.remModifiedAt) continue; // 変わっていない
    const canGive = rem.readOnly ? false : rem.recurring ? ['done'] : true;
    const m = mergeFields({ duo: duoView(t), rem: remView(rem), base: base[t.id] || null, pending, duoAt: t.updatedAt, remAt: rem.modifiedAt || 0, canGive });
    plan.syncs.push({ task: t, rem, ...m });
  }
  for (const r of rems) {
    if (!r || plan.matched.has(r.itemId) || seen.item.has(r.itemId) || (r.externalId && seen.ext.has(r.externalId))) continue;
    if (!read.has(r.listId)) continue;
    if (decl.has(r.itemId) || (r.externalId && decl.has(r.externalId))) continue; // 確認の一覧で「取り込まない」にした件
    plan.imports.push(r);
  }
  return plan;
}

const nativeDue = (d) => normDue(d);
// Duo → リマインダーの patch（native updateReminder 用）。done は別（setReminderDone）。
function remPatchOf(give) {
  const p = {};
  if ('title' in give) p.title = give.title;
  if ('note' in give) p.notes = give.note;
  if ('due' in give) p.due = nativeDue(give.due);
  if ('notify' in give) p.notify = !!give.notify;
  return p;
}
const errCodeOf = (e) => (e && typeof e === 'object' && typeof e.code === 'string' ? e.code : '');

// ---- 実行 ----
// deps: { db: {listTasks,getTask,putTask}, native(remNative), getSettings(), setSettings(next), base: {get,set}, now(), onChange(), onNotice(text), onEvent({type}) }
export function createReminderSync(deps) {
  const { db, native, getSettings, setSettings, base: baseStore, onChange = () => {}, onNotice = () => {}, onEvent = () => {} } = deps;
  const now = deps.now || (() => new Date());
  const timer = deps.setTimer || setTimeout;
  let running = null, again = false, kickTimer = 0;
  let baseMap = null, sawConflict = false;
  const getBase = () => (baseMap ||= (() => { try { const b = baseStore?.get(); return b && typeof b === 'object' ? b : {}; } catch { return {}; } })());
  const saveBase = () => { try { baseStore?.set(getBase()); } catch { /* 無視 */ } };
  const patchSettings = (p) => { const next = { ...getSettings(), ...p }; setSettings(next); return next; };

  // 読み直した最新に書く。snap は計画時のスナップショット。計画のあとに利用者が編集していたら、内容は上書きせず pending のまま残す。
  async function commit(snap, { take = {}, link = {}, state = 'linked', baseView = null }) {
    const cur = await db.getTask(snap.id);
    if (!cur || isTombstone(cur)) return false;
    const edited = cur.updatedAt !== snap.updatedAt || cur.syncState !== snap.syncState;
    let next = { ...cur, ...link };
    if (edited) {
      next.syncState = 'pending'; // 再度の同期で改めて見る（取り込みは見送る）
    } else {
      if ('title' in take) next.title = take.title;
      if ('note' in take) next.note = take.note;
      if ('due' in take) { next.due = take.due; if (!take.due) next.notify = false; }
      if ('notify' in take) next.notify = !!(take.notify && (take.due !== undefined ? take.due : next.due));
      if ('done' in take) { next.done = take.done; next.doneAt = take.done ? (take.doneAt || stampNow(now())) : null; }
      if (Object.keys(take).length) next.updatedAt = link.remModifiedAt || now().getTime();
      next.syncState = state;
      if (baseView) { getBase()[cur.id] = baseView; }
    }
    await db.putTask(next);
    return true;
  }

  async function createOne(t, listId) {
    const v = duoView(t);
    const o = { requestId: t.id, listId, title: v.title.slice(0, TASK_TITLE_MAX), notes: v.note, due: nativeDue(v.due), notify: v.notify };
    const res = await native.createReminder(o);
    let r = res?.reminder;
    if (!r?.itemId) throw { code: 'UNAVAILABLE' };
    if (v.done && !r.done) r = (await native.setReminderDone({ itemId: r.itemId, externalId: r.externalId || '', done: true }))?.reminder || r;
    await commit(t, { link: linkOf(r), state: 'linked', baseView: v });
  }
  const linkOf = (r) => ({ remItemId: r.itemId, ...(r.externalId ? { remExternalId: r.externalId } : {}), remListId: r.listId, ...(Number.isFinite(r.modifiedAt) ? { remModifiedAt: r.modifiedAt } : {}) });

  async function syncOne(s) {
    const { task: t, rem, take, give, conflicts } = s;
    let remAfter = rem, state = 'linked';
    const keys = Object.keys(give);
    if (keys.length) {
      try {
        const patch = remPatchOf(give);
        if (Object.keys(patch).length) {
          const res = await native.updateReminder({ itemId: rem.itemId, externalId: rem.externalId || '', expectModifiedAt: null, patch });
          remAfter = res?.reminder || remAfter;
        }
        if ('done' in give) {
          const res = await native.setReminderDone({ itemId: rem.itemId, externalId: rem.externalId || '', done: give.done });
          remAfter = res?.reminder || remAfter;
        }
      } catch (e) {
        const c = errCodeOf(e);
        if (c === 'READ_ONLY' || c === 'NOT_EDITABLE') state = 'linked'; // 書けない件は送らない（無限に再送しない）
        else throw e; // NOT_FOUND は次の同期で「消された」と判定される。それ以外は pending のまま再送
      }
    }
    const link = linkOf(remAfter);
    const merged = { ...duoView(t), ...take, ...give };
    if ('due' in take && !take.due) merged.notify = false;
    await commit(t, { take: { ...take, ...(take.done ? { doneAt: rem.doneAt || undefined } : {}) }, link, state, baseView: merged });
    if (conflicts.length) { onNotice(CONFLICT_NOTICE); sawConflict = true; }
    return Object.keys(take).length;
  }

  async function pass(reason) {
    sawConflict = false;
    const st = getSettings();
    if (!st.enabled) return { skipped: 'off' };
    let perm;
    try { perm = (await native.permission())?.status; } catch { return { skipped: 'unavailable' }; }
    if (perm === 'unavailable') return { skipped: 'unavailable' };
    if (perm !== 'granted') return { skipped: 'permission' };
    let ls;
    try { ls = await native.lists(); } catch { return { skipped: 'error' }; }
    if (ls.unavailable) return { skipped: 'unavailable' };
    const lists = ls.lists || [];
    const out = { wrote: 0, created: 0, imported: 0, unlinked: 0, errors: 0, taken: 0, reason };
    // ---- 書き出し先の「Duo」リスト ----
    let s = getSettings();
    const ids = new Set(lists.map((l) => l.id));
    if (s.duoListId && !ids.has(s.duoListId)) {
      let chk;
      try { chk = await native.checkReminderList({ listId: s.duoListId, title: s.duoListTitle, sourceId: s.duoSourceId }); } catch { return { ...out, skipped: 'error' }; }
      if (chk?.status === 'moved' && chk.newId) { // 識別子の付け替え。タスクは消さず、つながりも外さない
        const old = s.duoListId;
        s = patchSettings({ duoListId: chk.newId });
        for (const t of await db.listTasks()) if (t.remListId === old && !isTombstone(t)) await db.putTask({ ...t, remListId: chk.newId });
        ids.add(chk.newId);
      } else if (chk?.status === 'missing') {
        for (const t of await db.listTasks()) if (!isTombstone(t) && isLinked(t) && t.remListId === s.duoListId) await db.putTask(unlinkTask(t, 'listMissing'));
        s = patchSettings({ duoListId: '', listMissing: true });
        onChange(); onEvent({ type: 'listMissing', asked: s.listAsked });
        return { ...out, listMissing: true };
      } else if (chk?.status !== 'present') return { ...out, skipped: 'unknown' }; // ソースなし・曖昧・1 回目だけ: 外さない
    }
    if (!s.duoListId && !s.listMissing) { // まだ書き出し先がない: 題名「Duo」の書けるリストが 1 件ならそれ、無ければ作る、2 件以上は選ばない
      const hit = lists.filter((l) => l.title === s.duoListTitle && l.allowsModify !== false);
      if (hit.length === 1) s = patchSettings({ duoListId: hit[0].id, duoSourceId: hit[0].sourceId || '' });
      else if (hit.length === 0) {
        try { const c = (await native.createReminderList({ title: s.duoListTitle, sourceId: s.duoSourceId })).list; s = patchSettings({ duoListId: c.id, duoSourceId: c.sourceId || '' }); ids.add(c.id); } catch { out.errors++; }
      }
    }
    const readIds = [...new Set([s.duoListId, ...s.lists].filter((id) => id && ids.has(id)))];
    if (!readIds.length) return out;
    // ---- 取得 ----
    let rems;
    try { rems = (await native.listReminders({ listIds: readIds, completedSince: sinceStamp(now(), SYNC_WINDOW_DAYS) }))?.reminders || []; } catch { return { ...out, skipped: 'error' }; }
    const tasks = await db.listTasks();
    const plan = planSync({ tasks, rems, readIds, presentIds: [...ids], duoListId: s.duoListId, base: getBase(), now: now(), declined: s.declined });
    // ---- Duo から消した件（墓標）をリマインダーからも消す ----
    for (const t of plan.deletes) {
      try {
        await native.deleteReminder({ itemId: t.remItemId || t.remExternalId, externalId: t.remExternalId || '', expectModifiedAt: null });
      } catch (e) { const c = errCodeOf(e); if (c !== 'READ_ONLY' && c !== 'NOT_EDITABLE') { out.errors++; continue; } }
      const { remListId, ...rest } = t; // 消せた（または消せない件）: 墓標は残し、削除待ちの印だけ外す
      await db.putTask(rest); out.wrote++;
    }
    // ---- つながりのある件の差分 ----
    for (const sy of plan.syncs) { try { const n = await syncOne(sy); out.wrote++; if (n) out.taken++; } catch { out.errors++; } }
    // ---- リマインダー側で消された件: Duo は消さず「連携なし」へ（決定 4）。書き出し直さない ----
    for (const t of plan.unlinks) { const cur = await db.getTask(t.id); if (cur && !isTombstone(cur)) { await db.putTask(unlinkTask(cur, 'local')); delete getBase()[t.id]; out.unlinked++; } }
    // ---- Duo だけにある件の書き出し ----
    for (const t of plan.creates) { try { await createOne(t, t.remListId && ids.has(t.remListId) && t.remListId !== 'pending' ? t.remListId : s.duoListId); out.created++; } catch (e) { out.errors++; } }
    // ---- リマインダーだけにある件の取り込み ----
    if (plan.imports.length) {
      const all = await db.listTasks();
      let order = all.reduce((m, t) => Math.max(m, t.order), 0);
      for (const r of plan.imports) {
        const v = remView(r), task = taskFromRem(r, now(), ++order);
        try { await db.putTask(task); getBase()[task.id] = { ...v, title: task.title }; out.imported++; } catch { out.errors++; }
      }
    }
    // ---- バックアップから戻した件でリマインダーに見つからないもの: 自動では作り直さない（二重にしない）。pending のまま残し、「書き出し直す」を選んだときだけ作る（RS-36）----
    let newlyLost = 0;
    for (const t of plan.lost) {
      out.lost = (out.lost || 0) + 1;
      if (t.syncState === 'pending') continue;
      const cur = await db.getTask(t.id); if (!cur || isTombstone(cur)) continue;
      await db.putTask({ ...cur, syncState: 'pending' }); newlyLost++;
    }
    if (newlyLost) { onChange(); onEvent({ type: 'lost', n: out.lost }); }
    for (const t of plan.ambiguous) { onEvent({ type: 'ambiguous', id: t.id }); out.errors++; }
    saveBase();
    if (!out.errors) patchSettings({ syncedAt: now().getTime() });
    if (out.wrote || out.created || out.imported || out.unlinked) onChange();
    if ((out.taken || out.imported) && !sawConflict) onEvent({ type: 'incoming', taken: out.taken, imported: out.imported });
    return out;
  }

  function sync(reason = 'manual') {
    if (running) { again = true; return running; }
    running = (async () => {
      let res, n = 0;
      try { do { again = false; res = await pass(reason); } while (again && ++n < 2); } catch { res = { skipped: 'error' }; } finally { running = null; }
      return res;
    })();
    return running;
  }
  // きっかけ（Duo の書き込み・calendarChanged・前面復帰）。300ms で間引く（0 を渡すと次の tick）。
  function kick(reason = 'change', delay = 300) {
    if (!getSettings().enabled) return;
    clearTimeout(kickTimer);
    kickTimer = timer(() => sync(reason), delay);
  }

  // 「作り直す」: 「Duo」リストを 1 つ作り、listMissing の件を 1 件ずつ書き出す（RS-48b）。「今はしない」は declineRecreate（何も書かない）。
  async function recreateList() {
    const s = getSettings();
    if (!s.enabled || !s.listMissing) return { ok: false };
    const c = (await native.createReminderList({ title: s.duoListTitle, sourceId: s.duoSourceId })).list;
    patchSettings({ duoListId: c.id, duoSourceId: c.sourceId || s.duoSourceId, listMissing: false, listAsked: false });
    for (const t of await db.listTasks()) if (!isTombstone(t) && t.syncState === 'listMissing') await db.putTask({ ...t, syncState: 'pending' });
    onChange();
    await sync('recreate');
    return { ok: true };
  }
  function declineRecreate() { patchSettings({ listAsked: true }); }

  // リスト移動（RS-53〜55）。同じソースは calendar の付け替え 1 回。ソースをまたぐときは作成が成功してから元を消す。
  async function moveToList(taskId, listId) {
    const t = await db.getTask(taskId);
    if (!t || !isLinked(t)) return { ok: false, code: 'NOT_LINKED' };
    const lists = (await native.lists()).lists || [];
    const to = lists.find((l) => l.id === listId), from = lists.find((l) => l.id === t.remListId);
    if (!to || to.allowsModify === false) return { ok: false, code: 'READ_ONLY' };
    if (to.id === t.remListId) return { ok: true, noop: true };
    const same = !!from && !!from.sourceId && from.sourceId === to.sourceId;
    try {
      if (same) {
        const res = await native.updateReminder({ itemId: t.remItemId, externalId: t.remExternalId || '', expectModifiedAt: null, patch: { listId: to.id } });
        await db.putTask({ ...(await db.getTask(taskId)), ...linkOf(res.reminder) });
      } else {
        const v = duoView(t);
        const res = await native.createReminder({ requestId: `${t.id}:mv:${to.id}`, listId: to.id, title: v.title.slice(0, TASK_TITLE_MAX), notes: v.note, due: nativeDue(v.due), notify: v.notify });
        const nr = res.reminder;
        try {
          await native.deleteReminder({ itemId: t.remItemId, externalId: t.remExternalId || '', expectModifiedAt: null });
        } catch {
          try { await native.deleteReminder({ itemId: nr.itemId, externalId: nr.externalId || '', expectModifiedAt: null }); } catch { /* 元のつながりのまま。先に作った件は次の同期の取り込みで拾われないよう墓標にしない（要実機） */ }
          return { ok: false, code: 'UNAVAILABLE' };
        }
        await db.putTask({ ...(await db.getTask(taskId)), ...linkOf(nr) });
      }
      onChange();
      return { ok: true };
    } catch (e) { return { ok: false, code: errCodeOf(e) || 'UNAVAILABLE' }; }
  }

  // 見つからない件（RS-36）の書き出し直し。つながりを外して「Duo」リストへ 1 件ずつ作る（要求 id は Duo の id なので二重にならない）。
  async function reexportLost() {
    const s = getSettings();
    if (!s.enabled || !s.duoListId) return { ok: false, n: 0 };
    const lists = (await native.lists()).lists || [];
    const present = new Set(lists.map((l) => l.id));
    let n = 0;
    for (const t of await db.listTasks()) {
      if (isTombstone(t) || !isLinked(t) || !t.remListId || present.has(t.remListId)) continue;
      await db.putTask({ ...unlinkTask(t, 'pending'), syncState: 'pending' }); delete getBase()[t.id]; n++;
    }
    saveBase();
    if (n) { onChange(); await sync('reexport'); }
    return { ok: true, n };
  }

  return { sync, kick, reexportLost, recreateList, declineRecreate, moveToList, base: getBase, get running() { return !!running; } };
}
