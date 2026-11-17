// iPhone カレンダー連携の純粋ロジック（DOM・ネイティブ呼び出しなし）。
import { addDays, addMonths, dayOf, newId, weekStart } from './util.js';
import { normalize, searchRange, terms } from './search.js';
import { CAT_IDS } from './categories.js';
import { expand, isFirstOccurrence, normRule, occurrenceAt, ruleEq } from './recur.js';

export const DEFAULTS = { version: 1, enabled: false, calendarIds: [], selectionInitialized: false, defaultCalendarId: null, addByDefault: true, defaultDest: null, enabledMig: true };

// 新しい予定の追加先 { type:'duo'|'iphone', id }。不正は null（未設定＝移行前）。
export function normDest(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if ((d.type !== 'duo' && d.type !== 'iphone') || typeof d.id !== 'string' || !d.id) return null;
  return { type: d.type, id: d.id };
}

export function normSettings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULTS };
  const ids = Array.isArray(v.calendarIds) ? [...new Set(v.calendarIds.filter((x) => typeof x === 'string' && x))] : [];
  return {
    version: 1,
    enabled: v.enabled === true,
    calendarIds: ids,
    selectionInitialized: v.selectionInitialized === true,
    defaultCalendarId: typeof v.defaultCalendarId === 'string' && v.defaultCalendarId ? v.defaultCalendarId : null,
    addByDefault: v.addByDefault !== false, // 旧設定。defaultDest へ移行するまでの読み取り専用（以後は参照しない）
    defaultDest: normDest(v.defaultDest),
    enabledMig: v.enabledMig === true, // 旧「連携オフ」を一度だけ移した版印（保存済みの旧設定には無い）
  };
}

// 表示条件（画面・検索・通知で共通）。ctx: { events（全親）, hiddenCats:Set, link:{enabled,calendarIds}, perm, calendars }。
// linked/pending は追加先 calendarId の ✓（連携が有効で許可が取れているとき）が正。id が端末に無ければ非表示のまま。
// それ以外（unlinked・Duo のみ・連携オフ）は実効 categoryId（繰り返しの回の個別変更を含む）の hidden で判定する。
export function makeVisible(ctx) {
  const hid = ctx.hiddenCats || new Set(), byId = new Map();
  for (const e of ctx.events || []) byId.set(e.id, e);
  const ids = new Set(ctx.link?.calendarIds || []);
  const known = ctx.calendars?.length ? new Set(ctx.calendars.map((c) => c.id)) : null;
  const calOn = !!ctx.link?.enabled && (ctx.perm == null || ctx.perm === 'granted');
  return (e) => {
    const l = (byId.get(e.parentId ?? e.id) || e).nativeLink;
    if (calOn && l && (l.state === 'linked' || l.state === 'pending') && l.calendarId) return ids.has(l.calendarId) && (!known || known.has(l.calendarId));
    return !hid.has(e.categoryId);
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
// 新規の追加先：シート内の選択 → 設定の既定 → iPhone の既定 → 最初。どれも書けるカレンダーだけ。なければ ''。
export function pickAddCal(cals, sel, defId) {
  const w = writable(cals || []);
  const ok = (id) => id && w.some((c) => c.id === id);
  if (ok(sel)) return sel;
  if (ok(defId)) return defId;
  return w.find((c) => c.isDefault)?.id || w[0]?.id || '';
}

// 追加先の候補（可視のみ）。groups: [{head, items:[{type,id,hidden,...}]}]。非表示は出さない。
// keep（編集中の予定の現在先）だけは非表示でも、その段の先頭に1件残す。空になった段は除く。
export function visibleDestGroups(groups, keep) {
  const same = (i) => !!keep && i.type === keep.type && i.id === keep.id;
  return (groups || [])
    .map((g) => ({ ...g, items: [...g.items.filter((i) => same(i)), ...g.items.filter((i) => !same(i) && !i.hidden)] }))
    .filter((g) => g.items.length);
}
// 候補が1件も表示中でない（異常な全非表示）。
export const allDestHidden = (groups) => (groups || []).every((g) => g.items.every((i) => i.hidden));

// 追加先の解決（表示中のものだけ）。dest が表示中・書込可ならそのまま。
// 非表示・消失・読取専用・連携オフは代替へ：同じ source の表示中 → 表示中の「その他」→ 表示中の Duo 先頭。全部非表示だけ「その他」を仮選択。
// ctx: { cats, cals, ids（表示するカレンダー id）, usable（カレンダー連携が使える）}。
export function resolveDest(dest, ctx) {
  const d = normDest(dest), cats = ctx.cats || [], cals = ctx.cals || [], ids = ctx.ids || [];
  const w = ctx.usable ? writable(cals) : [];
  const vis = cats.filter((c) => !c.hidden);
  if (d?.type === 'duo' && vis.some((c) => c.id === d.id)) return d;
  if (d?.type === 'iphone' && w.some((c) => c.id === d.id && ids.includes(c.id))) return d;
  if (d?.type === 'iphone') {
    const cur = cals.find((c) => c.id === d.id);
    const alt = cur && groupBySource(w).find((g) => g.sourceId === cur.sourceId)?.items.find((c) => ids.includes(c.id));
    if (alt) return { type: 'iphone', id: alt.id };
  } else if (vis[0]) return { type: 'duo', id: vis[0].id };
  const other = cats.find((c) => c.id === CAT_IDS.other);
  if (other && !other.hidden) return { type: 'duo', id: other.id };
  if (vis[0]) return { type: 'duo', id: vis[0].id };
  return { type: 'duo', id: other ? other.id : cats[0]?.id || CAT_IDS.other };
}

// 旧設定からの一度きりの移行計画（純粋）。戻り値は設定へ足す patch か null。
// ctx: { perm（null=未確認）, cals（一覧取得後のみ配列。未取得は null）, cats }。カテゴリ未読込・取得遅延では何も決めない。
// ・defaultDest 未設定のみ：旧 addByDefault（許可あり・書込可カレンダーあり）→ iPhone、それ以外は Duo。連携していた端末の権限なしは Duo（未連携は接続時まで決めない）。
// ・旧「連携オフ」で許可あり：enabled=true／calendarIds=[]／selectionInitialized=true（予定は出ない。✓ で出す）。enabledMig で再実行しない。
export function planLinkMigration(link, ctx) {
  const cats = ctx.cats || [];
  if (!cats.length) return null;
  const granted = ctx.perm === 'granted' && Array.isArray(ctx.cals);
  const patch = {};
  if (!link.defaultDest) {
    const vis = cats.find((c) => !c.hidden) || cats.find((c) => c.id === CAT_IDS.other) || cats[0];
    const duo = { type: 'duo', id: vis.id };
    let dest = null;
    if (link.addByDefault === false) dest = duo;
    else if (granted) dest = writable(ctx.cals).length ? { type: 'iphone', id: pickAddCal(ctx.cals, '', link.defaultCalendarId) } : duo;
    else if (link.enabled && ctx.perm && ctx.perm !== 'granted') dest = duo; // 連携していた端末の権限なし。未連携は接続時に決める
    if (dest) patch.defaultDest = dest;
  }
  if (!link.enabledMig && granted) {
    patch.enabledMig = true;
    if (!link.enabled) Object.assign(patch, { enabled: true, calendarIds: [], selectionInitialized: true });
  }
  return Object.keys(patch).length ? patch : null;
}

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
  // 別の iPhone カレンダーへの移動は単発か「すべて」だけ（この回・これ以降では系列を分けない）。返る calendarId で結びつきを更新する。
  if (ctx.moveTo && ctx.moveTo !== link.calendarId && (span === 'all' || (span === 'this' && !recurring))) payload.calendarId = ctx.moveTo;
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
      if (i >= 0) {
        const payload = { ...out[i].payload, ...n.payload };
        if (payload.calendarId !== undefined && payload.calendarId === n.link?.calendarId) delete payload.calendarId; // 未送信のまま元の先へ戻した
        if (Object.keys(payload).length) out[i] = { ...out[i], link: n.link, payload };
        else out.splice(i, 1);
      } else out.push(n);
    } else {
      out = out.filter((o) => o.opId === inflight || !covers_(n, o));
      if (n.kind === 'delete' && !out.some((o) => o.kind === 'delete' && o.eventKey === n.eventKey && o.span === n.span && o.occurrenceStart === n.occurrenceStart)) out.push(n);
    }
  }
  return out;
}

// 置換の読み込み後も残す送信待ち: eventKey と requestId が両方一致するものだけ。
export const keepAfterReplace = (list, events) => list.filter((o) => events.some((e) => e.id === o.eventKey && e.nativeLink?.requestId === o.link?.requestId));

// ---------- iPhone 由来の予定（ext）の編集・削除（第13版 PR3）。DOM・ネイティブ呼び出し・DB 書込なしの純粋関数 ----------
// ext は IndexedDB へ入れず、ここで作った引数を native の updateExternalEvent / deleteExternalEvent へ渡す。入力は変更しない。

export const EDIT_REASONS = Object.freeze(['readOnlyCalendar', 'birthdays', 'invitee', 'organizerWithAttendees']);

// 編集できるか。JS（カレンダー一覧）とネイティブ（getEvent の detail）のどちらかが拒否なら読み取り専用。
// 詳細未取得は 'unavailable'、カレンダー不明は 'readOnlyCalendar'（どちらも許可しない）。誕生日は固有理由を優先。出席者ありは主催者でも拒否。
export function extEditable(x, cal, detail) {
  const no = (reason) => ({ editable: false, reason });
  if (!x || !detail) return no('unavailable');
  if (detail.reason === 'birthdays' || detail.sourceType === 'birthdays' || cal?.sourceType === 'birthdays') return no('birthdays');
  if (!cal || cal.allowsModify !== true || detail.allowsModify !== true) return no('readOnlyCalendar');
  if (detail.hasAttendees) return no(detail.isOrganizer ? 'organizerWithAttendees' : 'invitee');
  if (detail.reason) return no(EDIT_REASONS.includes(detail.reason) ? detail.reason : 'readOnlyCalendar');
  if (detail.editable === false) return no('readOnlyCalendar');
  return { editable: true, reason: null };
}

// 範囲（'only'|'following'|'all'）→ native の span。繰り返しでない予定は常に 'this'。
// following は、開いた回（occurrenceDate||start）の日付が系列の最初の回（detail.seriesStart）と同じなら all。先頭が分からなければ future。
export function extSpan(x, scope, detail) {
  if (!x.recurring) return 'this';
  if (scope === 'all') return 'all';
  if (scope === 'following') {
    const ss = detail?.seriesStart;
    return ss && dayOf(ss) === dayOf(x.occurrenceDate || x.start) ? 'all' : 'future';
  }
  return 'this';
}

// 場所の移動（calendarId の変更）は単発（繰り返しでない回）か all のときだけ。
export const extCanMove = (x, span) => span === 'all' || (span === 'this' && !x.recurring);

const toTarget = (x, span) => ({
  itemId: x.itemId || '', externalId: x.externalId || '', eventId: x.eventId || '',
  occurrenceStart: x.occurrenceDate || x.start, currentStart: x.start, span, expectModified: x.modifiedAt ?? null,
});

// 保存の引数。Target＋span＋expectModified と、変えた項目だけ。変更がなければ null。
// before: toDisplay の結果（開いたときの値）。after: { title, place, notes, start, end, all, calendarId, alarms }。alarms は通知の行を触ったときだけ（undefined は未操作）。
// end は表示用（終日は最終日 23:59）。送る end は native 規約: 終日は含む最終日の 00:00、時刻ありはそのまま。end が変わっていなければ開いたときの rawEnd をそのまま返す。
// requestId・recurrence・カテゴリ・nativeLink は出さない（規則は変えない）。
export function buildExtArgs(before, after, scope, detail) {
  const span = extSpan(before, scope, detail);
  const args = toTarget(before, span);
  const p = {};
  for (const f of ['title', 'place', 'notes']) if (after[f] !== undefined && (before[f] || '') !== (after[f] || '')) p[f] = after[f] || '';
  const allA = !!after.all;
  if (before.start !== after.start || before.end !== after.end || !!before.all !== allA) {
    p.start = after.start; p.all = allA;
    p.end = before.end === after.end && !!before.all === allA ? before.rawEnd : (allA ? `${dayOf(after.end)}T00:00` : after.end);
    if (span === 'all') args.base = { start: before.start, end: before.rawEnd, all: !!before.all };
  }
  if (after.alarms !== undefined) p.alarms = Array.isArray(after.alarms) ? after.alarms.map((a) => ({ ...a })) : [];
  if (after.calendarId && after.calendarId !== before.calId && extCanMove(before, span)) p.calendarId = after.calendarId;
  if (!Object.keys(p).length) return null;
  return { ...args, ...p };
}

// 削除の引数。force は食い違いの再確認後だけ true。
export const buildExtDeleteArgs = (before, scope, detail, force = false) => {
  const a = toTarget(before, extSpan(before, scope, detail));
  return force ? { ...a, force: true } : a;
};

// ---------- 通知 ⇔ EventKit の相対秒（relativeOffset）。Swift の reverseAlarms / parseAlarms と同じ規則 ----------
// 時刻あり: offset ≤ 0・分単位・40320 分以内 → {before}。終日: day = ceil(-offset/86400)、at = offset + day×86400（分単位・day 0〜30）→ {day, at}。変換できなければ null。
export function offsetToAlarm(offset, allDay) {
  if (!Number.isInteger(offset) || offset % 60 !== 0) return null;
  if (!allDay) return offset <= 0 && -offset / 60 <= 40320 ? { before: -offset / 60 + 0 } : null;
  const day = Math.ceil(-offset / 86400) + 0, sec = offset + day * 86400;
  if (day < 0 || day > 30 || sec < 0 || sec >= 86400) return null;
  return { day, at: `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}` };
}
// 逆: Duo 形式 → 秒。表の外の値（20 分前など）も範囲内ならそのまま。不正は null。
export function alarmToOffset(a, allDay) {
  if (!a || typeof a !== 'object') return null;
  if (!allDay) return Number.isInteger(a.before) && a.before >= 0 && a.before <= 40320 ? -a.before * 60 + 0 : null;
  const m = typeof a.at === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.exec(a.at);
  if (!Number.isInteger(a.day) || a.day < 0 || a.day > 30 || !m) return null;
  return -a.day * 86400 + Number(m[1]) * 3600 + Number(m[2]) * 60 + 0;
}

// ---------- 「すべて」の日時差分（Swift の resolveHeadDates と同じ仕様）----------
// 開いた回の未変更値 base と新しい値 next から、系列の最初の回 head の新しい日時を求める（開いた回の絶対日付を先頭へ入れない）。
// 日の差は暦、時刻ありの長さ・時刻の差は分（ローカル時刻の絶対）。head/base の end は終日なら含む最終日。不正（時刻ありで終了が開始より前）は null。
const stampDate = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0);
const stampOf2 = (d) => `${dkeyOf(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dkeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (a, b) => Math.round((Date.UTC(+dayOf(b).slice(0, 4), +dayOf(b).slice(5, 7) - 1, +dayOf(b).slice(8)) - Date.UTC(+dayOf(a).slice(0, 4), +dayOf(a).slice(5, 7) - 1, +dayOf(a).slice(8))) / 86400000);
const minDiff = (a, b) => Math.round((stampDate(b) - stampDate(a)) / 60000);
const plusMin = (s, m) => stampOf2(new Date(stampDate(s).getTime() + m * 60000));
const shiftWall = (s, days) => `${addDays(dayOf(s), days)}T${s.slice(11, 16)}`;

export function headDates(head, base, next) {
  const targetAll = next.all ?? base.all;
  const nStart = next.start ?? base.start;
  let nEnd;
  if (next.end != null) nEnd = next.end;
  else if (next.start != null && !targetAll && !base.all) nEnd = plusMin(nStart, minDiff(base.start, base.end));
  else if (next.start != null && targetAll && base.all) nEnd = `${addDays(dayOf(nStart), dayDiff(base.start, base.end))}T00:00`;
  else if (targetAll !== !!base.all) nEnd = targetAll ? `${dayOf(nStart)}T00:00` : plusMin(nStart, 60);
  else nEnd = base.end;
  if (!targetAll && nEnd < nStart) return null;
  const dayShift = dayDiff(base.start, nStart);
  const headDay = addDays(dayOf(head.start), dayShift);
  if (targetAll) {
    const newLen = Math.max(0, dayDiff(nStart, nEnd));
    let len = newLen;
    if (base.all && head.all) len = Math.max(0, dayDiff(head.start, head.end) + newLen - dayDiff(base.start, base.end));
    return { start: `${headDay}T00:00`, end: `${addDays(headDay, len)}T00:00`, all: true };
  }
  let hs;
  if (base.all) hs = `${headDay}T${nStart.slice(11, 16)}`;
  else hs = plusMin(shiftWall(head.start, dayShift), minDiff(shiftWall(base.start, dayShift), nStart));
  const baseDur = base.all ? 0 : minDiff(base.start, base.end);
  const newDur = minDiff(nStart, nEnd);
  const headDur = head.all ? 0 : minDiff(head.start, head.end);
  const dur = base.all ? newDur : Math.max(0, headDur + newDur - baseDur);
  return { start: hs, end: plusMin(hs, dur), all: false };
}
