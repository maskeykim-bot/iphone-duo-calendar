// 第19.4版（design/37 §4.2、data/連携_回答_37_予定の色.md）: iPhone の予定に付けた色の表（純粋関数。DOM・IndexedDB・ネイティブに触れない）。
// EventKit の予定は色を持てないので、Duo の中に「予定のキー → colorId」を持つ。置き場所は meta の 1 件（key 'xcolors'）。IndexedDB の版は 6 のまま。
// キーは系列で 1 つ: externalId（calendarItemExternalIdentifier）。空なら itemId（その端末の中だけで通じる）。繰り返しは全部の回が同じキー＝同じ色。
// 1 件: { key, colorId, calId, title, lastStart, seenAt, missingSince? }。calId・title・lastStart は「消えたかどうか」の判断と手がかり用（照合には使わない）。
import { validColorId } from './colors.js';

export const XCOLORS_KEY = 'xcolors';
export const XC_MAX = 3000;
export const XC_KEEP_MS = 30 * 864e5; // 見つからなくなってから 30 日は残す（iCloud の同期待ちで色が消えないように）
const KEY_MAX = 500, TITLE_MAX = 200;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// 予定（toDisplay の形、または nativeLink）からキーを作る
export const xcKeyOf = (e) => (e && typeof e.externalId === 'string' && e.externalId ? e.externalId : e && e.itemId != null && String(e.itemId) ? String(e.itemId) : '');

// 保存してある値 → 表（Map）。形の正しくない行は捨てる
export function xcLoad(items) {
  const m = new Map();
  for (const r of Array.isArray(items) ? items : []) {
    if (!isObj(r) || typeof r.key !== 'string' || !r.key || r.key.length > KEY_MAX || !validColorId(r.colorId) || m.has(r.key)) continue;
    const o = { key: r.key, colorId: r.colorId, calId: str(r.calId, KEY_MAX), title: str(r.title, TITLE_MAX), lastStart: STAMP.test(r.lastStart || '') ? r.lastStart : '', seenAt: Number.isFinite(r.seenAt) ? r.seenAt : 0 };
    if (Number.isFinite(r.missingSince)) o.missingSince = r.missingSince;
    m.set(o.key, o);
  }
  return m;
}
export const xcItems = (table) => [...table.values()];
// 上限 3000 件。超えたら seenAt の古い順に消す
function cap(table) {
  if (table.size <= XC_MAX) return table;
  const keep = [...table.values()].sort((a, b) => b.seenAt - a.seenAt || (a.key < b.key ? -1 : 1)).slice(0, XC_MAX);
  return new Map(keep.map((r) => [r.key, r]));
}
// 色を付ける・外す（colorId が null・不正なら外す）。新しい表を返す（入力は変えない）
export function xcSet(table, key, colorId, info = {}, now = Date.now()) {
  const t = new Map(table);
  if (!key || typeof key !== 'string' || key.length > KEY_MAX) return t;
  if (!validColorId(colorId)) { t.delete(key); return t; }
  const cur = t.get(key);
  t.set(key, { key, colorId, calId: str(info.calId ?? cur?.calId, KEY_MAX), title: str(info.title ?? cur?.title, TITLE_MAX), lastStart: STAMP.test(info.lastStart || '') ? info.lastStart : cur?.lastStart || '', seenAt: now });
  return cap(t);
}

// 読み込みのあとで「消えたかどうか」を見る（連携の回答 5）。
// view: { status, range:{from,to}（日付キー）, calIds:[読み込んだカレンダーの id], events:[toDisplay の予定] }。
// 判断しない場合: ① status が 'ok' でない（読み込みの失敗。cache は入らない）② 行の calId が calIds にない（設定でオフにした）
//                ③ calIds が空（アクセス権がない）④ lastStart が range の外。
// どれにも当たらず、その予定（繰り返しは範囲の中の回が 1 つも）見つからなかった行だけ missingSince を入れる。また見つかったら消す。
// missingSince から 30 日たっても見つからない行は表から消す。戻り値 { table, changed }。
export function xcSweep(table, view, now = Date.now()) {
  if (!view || view.status !== 'ok' || !view.range || !Array.isArray(view.calIds) || !view.calIds.length || !Array.isArray(view.events)) return { table, changed: false };
  const ids = new Set(view.calIds), from = `${view.range.from}T00:00`, to = `${view.range.to}T23:59`;
  const seen = new Map();
  for (const e of view.events) { const k = xcKeyOf(e); if (!k) continue; const c = seen.get(k); if (!c || e.start > c.start) seen.set(k, e); }
  const out = new Map(); let changed = false;
  for (const r of table.values()) {
    const hit = seen.get(r.key);
    if (hit) { // 見つかった: 手がかりを新しくし、missingSince を消す
      const n = { key: r.key, colorId: r.colorId, calId: str(hit.calId, KEY_MAX) || r.calId, title: str(hit.title, TITLE_MAX) || r.title, lastStart: STAMP.test(hit.start || '') ? hit.start : r.lastStart, seenAt: r.seenAt };
      if (r.missingSince != null || n.calId !== r.calId || n.title !== r.title || n.lastStart !== r.lastStart) { n.seenAt = now; changed = true; }
      out.set(r.key, n); continue;
    }
    const judge = ids.has(r.calId) && !!r.lastStart && r.lastStart >= from && r.lastStart <= to;
    if (!judge) { out.set(r.key, r); continue; } // 判断しない（そのまま残す）
    if (r.missingSince == null) { out.set(r.key, { ...r, missingSince: now }); changed = true; continue; }
    if (now - r.missingSince >= XC_KEEP_MS) { changed = true; continue; } // 30 日たった: 消す
    out.set(r.key, r);
  }
  return { table: changed ? out : table, changed };
}

// ---------- バックアップ ----------
// 書き出し: 最上位の eventColors（seenAt・missingSince は端末の中の話なので出さない）
export const xcExport = (table) => [...table.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((r) => ({ key: r.key, colorId: r.colorId, calId: r.calId, title: r.title, lastStart: r.lastStart }));
// 読み込みの検証（checkTasks と同じ形だが、全体は拒否しない。色なので）: 不正な 1 件だけ捨てて数える。3000 件まで、キーの重複は後ろを捨てる。
// 戻り値 { eventColors: [...], dropped }。配列でなければ { eventColors: [], dropped: 1 }。
export function checkEventColors(list) {
  if (!Array.isArray(list)) return { eventColors: [], dropped: 1 };
  const seen = new Set(), out = []; let dropped = 0;
  for (const r of list) {
    if (out.length >= XC_MAX) { dropped++; continue; }
    if (!isObj(r) || typeof r.key !== 'string' || !r.key || r.key.length > KEY_MAX || !validColorId(r.colorId) || seen.has(r.key)
      || (r.calId != null && typeof r.calId !== 'string') || (r.title != null && typeof r.title !== 'string') || (r.lastStart != null && r.lastStart !== '' && !(typeof r.lastStart === 'string' && STAMP.test(r.lastStart)))) { dropped++; continue; }
    seen.add(r.key);
    out.push({ key: r.key, colorId: r.colorId, calId: str(r.calId, KEY_MAX), title: str(r.title, TITLE_MAX), lastStart: r.lastStart || '' });
  }
  return { eventColors: out, dropped };
}
// 読み込み: 「置き換え」は表も置き換え、「追加」はファイルの側を足す（同じキーは今の端末を残す）
export function xcImport(table, incoming, mode, now = Date.now()) {
  const inc = xcLoad((incoming || []).map((r) => ({ ...r, seenAt: now })));
  if (mode === 'replace') return cap(inc);
  const t = new Map(table);
  for (const [k, r] of inc) if (!t.has(k)) t.set(k, r);
  return cap(t);
}
