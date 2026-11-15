// iPhone カレンダー連携の純粋ロジック（DOM・ネイティブ呼び出しなし）。
import { addDays, addMonths, dayOf, newId, weekStart } from './util.js';
import { normalize, searchRange, terms } from './search.js';
import { expand, isFirstOccurrence, normRule, occurrenceAt, ruleEq } from './recur.js';

export const DEFAULTS = { version: 1, enabled: false, calendarIds: [], selectionInitialized: false, defaultCalendarId: null };

export function normSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULTS };
  const ids = Array.isArray(v.calendarIds) ? [...new Set(v.calendarIds.filter((x) => typeof x === 'string' && x))] : [];
  return {
    version: 1,
    enabled: v.enabled === true,
    calendarIds: ids,
    selectionInitialized: v.selectionInitialized === true,
    defaultCalendarId: typeof v.defaultCalendarId === 'string' && v.defaultCalendarId ? v.defaultCalendarId : null,
  };
}

const first = (k) => `${k.slice(0, 8)}01`;
// 表示日を含む月の前月1日〜翌々月1日（下端含まない）。週の表示がはみ出す場合も含める。
export function extRange(key) {
  const m1 = first(key);
  let from = addMonths(m1, -1), to = addMonths(m1, 2);
  const ws = weekStart(key);
  if (ws < from) from = ws;
  if (addDays(ws, 7) > to) to = addDays(ws, 7);
  return { from, to };
}
export const rangeKey = (r, ids) => `${r.from}|${r.to}|${[...ids].sort().join(',')}`;
export const covers = (outer, inner) => !!outer && outer.from <= inner.from && outer.to >= inner.to;
export const stampOf = (k) => `${k}T00:00`;

// ネイティブの予定 → 表示用モデル。終日の end は最終日を含む 00:00 → アプリ内形式の 23:59 に揃える。
export function toDisplay(raw, cal) {
  const all = !!raw.all;
  let start = String(raw.start), end = String(raw.end);
  if (all) { start = `${dayOf(start)}T00:00`; end = `${dayOf(end) < dayOf(start) ? dayOf(start) : dayOf(end)}T23:59`; } else if (end > start && end.endsWith('T00:00') && dayOf(end) !== dayOf(start)) end = `${addDays(dayOf(end), -1)}T23:59`;
  else if (end < start) end = start;
  return {
    id: `ip:${raw.id}`, origin: 'iphone', cat: 'ext', xid: String(raw.id), eventId: raw.eventId == null ? '' : String(raw.eventId), requestId: raw.requestId || null,
    itemId: raw.itemId == null ? '' : String(raw.itemId), externalId: raw.externalId == null ? '' : String(raw.externalId),
    occurrenceDate: typeof raw.occurrenceDate === 'string' && raw.occurrenceDate ? raw.occurrenceDate : null, modifiedAt: Number.isFinite(raw.modifiedAt) ? raw.modifiedAt : null,
    calId: raw.calendarId, calName: cal?.title || '', calSource: cal?.source || '', color: /^#[0-9a-fA-F]{6}$/.test(cal?.color || '') ? cal.color : '#68716a',
    title: String(raw.title || '').trim() ? String(raw.title) : '（無題）', start, end, rawEnd: String(raw.end), all, place: raw.place || '', notes: raw.notes || '', recurring: !!raw.recurring,
  };
}

// 削除待ち（outbox の delete）が指す外部予定か。span: this=その回だけ／future=その回以降／all=全部（単発も all 扱い）。
const hiddenByDelete = (x, d) => {
  const l = d.link || {};
  if (!((x.eventId && l.eventId && x.eventId === String(l.eventId)) || (x.requestId && l.requestId && x.requestId === l.requestId))) return false;
  if (!d.occurrenceStart || d.span === 'all') return true;
  return d.span === 'this' ? x.start === d.occurrenceStart : x.start >= d.occurrenceStart;
};

// ---------- 端末をまたぐ照合（ekIdentifier）----------
export const cleanLink = (l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined));
// externalId が空なら ekIdentifier は作らない。非空なら `${externalId}@${seriesStart}`。
export const withIdent = (l) => { const o = { ...l }; if (o.externalId && o.seriesStart) o.ekIdentifier = `${o.externalId}@${o.seriesStart}`; else delete o.ekIdentifier; return cleanLink(o); };

// 外部予定の回（occurrenceDate、なければ start）が、親の系列の実在する回か。単発は開始が一致するか。
// 系列は seriesStart（なければ親の開始）の日以降で、until（終了日を含む）・count の範囲に入る回だけ。例外（削除・移動）は無視して規則だけで見る。
function inSeries(parent, x) {
  const l = parent.nativeLink || {};
  if (!parent.recurrence) return x.start === parent.start;
  const key = x.occurrenceDate || x.start, day = dayOf(key), tm = key.slice(11);
  const lo = dayOf(l.seriesStart && l.seriesStart < parent.start ? l.seriesStart : parent.start);
  if (day < lo) return false;
  const bare = { ...parent, exdates: [], overrides: {} };
  return expand([bare], day, day).some((o) => o.occKey.slice(0, 10) === day && (key.length < 16 || o.occKey.slice(11) === tm));
}

// アプリ予定に linked で結びついた外部予定を除外する（タイトル・時刻の一致による推測はしない）。
// 一致: eventId／requestId／itemId、または externalId（単発は開始も、系列は回が範囲内）。unlinked の古い印では隠さない。
// outbox: 送信待ち。削除待ちの外部予定は、送信が終わる（または失敗して解除される）まで一時的に隠す。
export function dedupe(ext, appEvents, outbox = []) {
  const ids = new Set(), reqs = new Set(), items = new Set(), byExt = new Map();
  for (const e of appEvents) {
    const l = e.nativeLink;
    if (!l) continue;
    if (l.state === 'linked') {
      if (l.eventId) ids.add(String(l.eventId));
      if (l.itemId) items.add(String(l.itemId));
      if (l.externalId) { if (!byExt.has(l.externalId)) byExt.set(l.externalId, []); byExt.get(l.externalId).push(e); }
    }
    if (l.requestId && l.state !== 'unlinked') reqs.add(l.requestId);
  }
  const dels = outbox.filter((o) => o.kind === 'delete');
  return ext.filter((x) => !(x.eventId && ids.has(x.eventId)) && !(x.requestId && reqs.has(x.requestId)) && !(x.itemId && items.has(x.itemId))
    && !(x.externalId && byExt.get(x.externalId)?.some((p) => inSeries(p, x))) && !dels.some((d) => hiddenByDelete(x, d)));
}

const sameLink = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 外部予定から作る nativeLink（照合・補完で使う実値）。
function adopt(l, x, matchedBy) {
  return withIdent({
    ...l, v: 2, calendarId: x.calId || l.calendarId, itemId: x.itemId || l.itemId, eventId: x.eventId || l.eventId,
    externalId: x.externalId || l.externalId, ekModified: x.modifiedAt ?? l.ekModified, matchedBy, warn: null,
    calName: x.calName || l.calName, calSource: x.calSource ?? l.calSource, fallbackDeleteConfirmed: matchedBy === 'fallback' ? false : l.fallbackDeleteConfirmed,
  });
}

// 遅れて埋める: requestId か itemId が一致する外部予定を見て、externalId が空→非空・変化したとき（と欠けた項目の補完）だけ更新する。
// 戻り値 [{id, from, link}]。同じ値なら何も返さない（毎回 commit しない）。ekModified は触らない（食い違いの検出を壊さない）。
export function refreshLinks(appEvents, ext) {
  const out = [];
  for (const e of appEvents) {
    const l = e.nativeLink;
    if (l?.state !== 'linked') continue;
    const xs = ext.filter((x) => (l.requestId && x.requestId === l.requestId) || (l.itemId && x.itemId === l.itemId));
    if (!xs.length) continue;
    const x = xs.find((y) => y.externalId) || xs[0];
    const nl = cleanLink({
      ...l, v: 2, itemId: l.itemId || x.itemId || undefined, eventId: l.eventId || x.eventId || undefined,
      externalId: x.externalId || l.externalId || undefined, seriesStart: l.seriesStart || e.start,
      calName: l.calName || x.calName || undefined, calSource: l.calSource ?? (x.calName ? x.calSource : undefined),
    });
    const fin = withIdent(nl);
    if (!sameLink(fin, l)) out.push({ id: e.id, from: l, link: fin });
  }
  return out;
}

// 復元・入れ直し・別端末の照合。この端末の外部予定に itemId が見つからない linked だけを、URL → externalId＋開始 → 代わりの照合 の順で探し直す。
// 代わりの照合は restoring（復元した予定の id）だけ。タイトル・開始・終日・カレンダー名とアカウント名が一致し、他と結びつかない候補がちょうど1件のときだけ。
// 戻り値 [{id, from, link}]。通常の表示ではタイトル推測をしない。
export function relink(appEvents, ext, restoring = new Set()) {
  const has = new Set(ext.map((x) => x.itemId).filter(Boolean));
  const taken = new Set(); // 他の予定が使っている外部予定の id
  for (const e of appEvents) {
    const l = e.nativeLink;
    if (l?.state === 'linked' && ((l.itemId && has.has(l.itemId)) || (l.eventId && ext.some((x) => x.eventId === l.eventId)))) ext.forEach((x) => { if ((l.itemId && x.itemId === l.itemId) || (l.eventId && x.eventId === l.eventId)) taken.add(x.id); });
  }
  const reqOwner = (e, x) => x.requestId && appEvents.some((o) => o !== e && o.nativeLink?.requestId === x.requestId && o.nativeLink.state !== 'unlinked');
  const groupOf = (xs) => { const m = new Map(); for (const x of xs) { const k = x.itemId || x.id; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m.values()]; };
  const pick = (g) => [...g].sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  const out = [];
  for (const e of appEvents) {
    const l = e.nativeLink;
    if (l?.state !== 'linked' || (l.itemId && has.has(l.itemId))) continue;
    if (l.eventId && ext.some((x) => x.eventId === l.eventId)) continue;
    const free = (x) => !taken.has(x.id);
    let how = null, grp = null;
    const byUrl = l.requestId ? ext.filter((x) => x.requestId === l.requestId && free(x)) : [];
    if (byUrl.length && groupOf(byUrl).length === 1) { how = 'url'; grp = byUrl; }
    if (!how && l.externalId) {
      const g = groupOf(ext.filter((x) => x.externalId === l.externalId && free(x) && !reqOwner(e, x) && inSeries(e, x)));
      if (g.length === 1) { how = 'external'; grp = g[0]; }
    }
    if (!how && restoring.has(e.id) && l.calName) {
      const t = String(e.title).trim(), st = l.seriesStart || e.start;
      const g = groupOf(ext.filter((x) => free(x) && !reqOwner(e, x) && String(x.title).trim() === t && x.start === st && !!x.all === !!e.all && x.calName === l.calName && x.calSource === (l.calSource || '')));
      if (g.length === 1) { how = 'fallback'; grp = g[0]; }
    }
    if (!how) continue;
    const x = pick(grp);
    grp.forEach((y) => taken.add(y.id));
    const nl = adopt(l, x, how);
    if (!sameLink(nl, l)) out.push({ id: e.id, from: l, link: nl });
  }
  return out;
}

// 置換の読み込み: 同じ requestId の予定が複数あれば先の1件だけ linked/pending のまま、後は unlinked にする。{ events, unlinked }
export function uniqueRequestIds(events) {
  const seen = new Set();
  let unlinked = 0;
  const out = events.map((e) => {
    const l = e.nativeLink;
    if (!l?.requestId) return e;
    if (!seen.has(l.requestId)) { seen.add(l.requestId); return e; }
    if (l.state === 'unlinked') return e;
    unlinked++;
    return { ...e, nativeLink: cleanLink({ ...l, state: 'unlinked', warn: null }) };
  });
  return { events: out, unlinked };
}

// 範囲 [a, b]（日キー・両端含む）に重なる外部予定。
export const extIn = (ext, a, b) => ext.filter((e) => dayOf(e.start) <= b && dayOf(e.end) >= a);

export const subLabel = (e) => `iPhone · ${e.calName}`;

// 検索: スナップショットの外部予定を既存と同じ正規化・AND で絞る。
export function searchExt(snapshot, query, today) {
  const ts = terms(query), range = searchRange(today);
  if (!ts.length) return [];
  return snapshot.filter((e) => dayOf(e.start) <= range.to && dayOf(e.end) >= range.from).filter((e) => {
    const fields = [normalize(e.title), normalize(e.notes), normalize(e.place)];
    return ts.every((t) => fields.some((f) => f.includes(t)));
  });
}

// 追加先に選べるカレンダー（書込可）。
export const writable = (cals) => cals.filter((c) => c.allowsModify);

// カレンダー一覧をソース別にグループ化（sourceId → title → id の順、同名 source は sourceType を併記）。
export function groupBySource(cals) {
  const sorted = [...cals].sort((a, b) => String(a.sourceId).localeCompare(String(b.sourceId)) || String(a.title).localeCompare(String(b.title), 'ja') || String(a.id).localeCompare(String(b.id)));
  const groups = [];
  for (const c of sorted) {
    let g = groups[groups.length - 1];
    if (!g || g.sourceId !== c.sourceId) { g = { sourceId: c.sourceId, source: c.source, sourceType: c.sourceType, items: [] }; groups.push(g); }
    g.items.push(c);
  }
  const names = new Map();
  for (const g of groups) names.set(g.source, (names.get(g.source) || 0) + 1);
  for (const g of groups) g.heading = names.get(g.source) > 1 ? `${g.source}（${g.sourceType}）` : g.source;
  return groups;
}

export const fmtLoaded = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const ymdSlash = (k) => k.replaceAll('-', '/');
// 排他的な to を表示用の最終日にする。
export const lastDay = (to) => addDays(to, -1);

// ---------- iPhone への反映（送信待ち）。DOM・ネイティブ呼び出しなしの純粋関数 ----------
const jeq = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

// 対応 8 項目のうち before → after で変わったものだけ。日時は start/end/all を必ず一組で載せる。
// alarms は after が持っているときだけ比べる（null・未定義は「なし」= []）。
function bodyDiff(before, after) {
  const p = {};
  for (const f of ['title', 'place', 'notes']) if ((before[f] || '') !== (after[f] || '')) p[f] = after[f] || '';
  if (before.start !== after.start || before.end !== after.end || !!before.all !== !!after.all) { p.start = after.start; p.end = after.end; p.all = !!after.all; }
  if (after.alarms !== undefined && !jeq(before.alarms, after.alarms)) p.alarms = Array.isArray(after.alarms) ? after.alarms : [];
  return p;
}

// 編集・削除から送信待ちの操作を作る。戻り値 { ops, plan }。plan は「これ以降」のとき np に pending の nativeLink を付けて返す。
// scope: 'only'|'following'|'all'（単発は何でもよい）。form が null なら削除。
// ctx: { newId, now, dropOnly（削除を積まず範囲内の未送信 update だけ止める）, waiting:Set<np の id>（まだ新系列の id が確定していない np は、確定後に送る操作として積める） }
export function planNativeOps(prev, plan, scope, occKey, form, ctx = {}) {
  const link = prev?.nativeLink;
  const dep = link?.state === 'pending' && !!ctx.waiting?.has(prev.id);
  if (!prev || !(link?.state === 'linked' || dep)) return { ops: [], plan };
  const mk = ctx.newId || newId, now = ctx.now ?? Date.now();
  const recurring = !!prev.recurrence;
  let span = 'this', occurrenceStart = null;
  if (recurring) {
    if (scope === 'only') { span = 'this'; occurrenceStart = occKey; }
    else if (scope === 'following' && !isFirstOccurrence(prev, occKey)) { span = 'future'; occurrenceStart = occKey; }
    else { span = 'all'; occurrenceStart = link.seriesStart || prev.start; }
  }
  const base = { opId: mk(), eventKey: prev.id, link: { ...link }, span, occurrenceStart, payload: {}, newParentId: null, newRequestId: null, createdAt: now, tries: 0 };
  if (form == null) return { ops: [{ ...base, kind: ctx.dropOnly ? 'drop' : 'delete' }], plan };

  let before, after;
  if (span === 'future') { before = occurrenceAt(prev, occKey); after = plan.puts.find((e) => e.id !== prev.id); }
  else if (span === 'this' && recurring) { before = occurrenceAt(prev, occKey); after = form; }
  else { before = prev; after = plan.puts.find((e) => e.id === prev.id); }
  if (!after) return { ops: [], plan };
  const payload = bodyDiff(before, after);
  if (span !== 'this' || !recurring) {
    if (!ruleEq(after.recurrence, prev.recurrence)) payload.recurrence = after.recurrence ? normRule(after.recurrence) : null;
  }
  if (!Object.keys(payload).length) return { ops: [], plan };
  const op = { ...base, kind: 'update', payload };
  if (span === 'future') {
    op.newParentId = after.id; op.newRequestId = mk();
    const np = { ...after, nativeLink: { v: 2, state: 'pending', requestId: op.newRequestId, calendarId: link.calendarId, seriesStart: occKey } };
    return { ops: [op], plan: { ...plan, puts: plan.puts.map((e) => (e.id === np.id ? np : e)) } };
  }
  return { ops: [op], plan };
}

// delete（または drop = 積まずに範囲内の未送信 update だけ捨てる）が update を覆うか。
const covers_ = (d, o) => {
  if (d.eventKey !== o.eventKey || o.kind !== 'update') return false;
  if (d.span === 'all' || (d.span === 'this' && d.occurrenceStart == null)) return true;
  if (d.span === 'this') return o.span === 'this' && o.occurrenceStart === d.occurrenceStart;
  return o.span !== 'all' && o.occurrenceStart != null && o.occurrenceStart >= d.occurrenceStart;
};

// 送信待ちへ操作を足す。同じ eventKey・span・occurrenceStart の update は最新へ統合（差分は合併）。
// delete は範囲内の先行 update を除く（別の回は残す）。送信中（inflight）の操作は書き換えず、新しく積む。
export function mergeOps(list, ops, inflight = null) {
  let out = [...list];
  for (const n of ops) {
    if (n.kind === 'update') {
      const i = out.findIndex((o) => o.kind === 'update' && o.opId !== inflight && !o.newParentId && !n.newParentId && o.eventKey === n.eventKey && o.span === n.span && o.occurrenceStart === n.occurrenceStart);
      if (i >= 0) out[i] = { ...out[i], link: n.link, payload: { ...out[i].payload, ...n.payload } };
      else out.push(n);
    } else {
      out = out.filter((o) => o.opId === inflight || !covers_(n, o));
      if (n.kind === 'delete' && !out.some((o) => o.kind === 'delete' && o.eventKey === n.eventKey && o.span === n.span && o.occurrenceStart === n.occurrenceStart)) out.push(n);
    }
  }
  return out;
}

// 置換の読み込み後も残す送信待ち: eventKey と requestId が両方一致するものだけ。
export const keepAfterReplace = (list, events) => list.filter((o) => events.some((e) => e.id === o.eventKey && e.nativeLink?.requestId === o.link?.requestId));
