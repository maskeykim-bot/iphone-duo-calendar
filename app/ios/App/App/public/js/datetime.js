// 日時の編集状態と計算（純粋関数。DOM・保存に触れない）。
// 方針: 触っていない値は元の文字列のまま返し、丸めない（10:07 は 10:07）。
// 計算は壁時計（年月日時分）で行い、タイムゾーン・夏時間に左右されない（Date.UTC を暦計算にだけ使う）。
// 日時は 'YYYY-MM-DDTHH:mm'。終日の end は最終日の 23:59（アプリ内形式）。

const p2 = (n) => String(n).padStart(2, '0');
const RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

export function splitIso(s) {
  const m = RE.exec(String(s));
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}
// 壁時計の分（暦の通し分）。閏日・年末・月末をそのまま扱える。
const toMin = (s) => { const t = splitIso(s); return t ? Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi) / 60000 : NaN; };
const fromMin = (n) => {
  const d = new Date(n * 60000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
};
const day = (s) => s.slice(0, 10);
const time = (s) => s.slice(11, 16);
const dayNum = (k) => { const t = splitIso(`${k}T00:00`); return t ? Date.UTC(t.y, t.mo - 1, t.d) / 86400000 : NaN; };
const dayAdd = (k, n) => day(fromMin((dayNum(k) + n) * 1440));
export const isDay = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && day(fromMin(dayNum(k) * 1440)) === k;

// 暦日の差（end の日 − start の日）。夏時間の日でも 24 時間扱いにならない。
export const dayDiff = (a, b) => dayNum(day(b)) - dayNum(day(a));
// 壁時計の長さ（分）
export const durationMin = (start, end) => toMin(end) - toMin(start);
export const addMinutes = (iso, n) => fromMin(toMin(iso) + n);

// 入力欄の文字列（'2026/11/12 10:07' または '2026/11/12'）→ ISO。丸めない。書式が不正なら null。
export function isoFromInput(text, all) {
  const m = (all ? /^(\d{4})\/(\d{2})\/(\d{2})$/ : /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/).exec(String(text).trim());
  if (!m) return null;
  const h = all ? 0 : +m[4], mi = all ? 0 : +m[5];
  if (h > 23 || mi > 59) return null;
  const k = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isDay(k)) return null;
  return `${k}T${p2(h)}:${p2(mi)}`;
}
export const inputFromIso = (iso, all) => { const s = day(iso).replaceAll('-', '/'); return all ? s : `${s} ${time(iso)}`; };

const clean = { startDate: false, startHour: false, startMin: false, endDate: false, endHour: false, endMin: false, all: false };

// 状態を作る。orig は開いたときの値（rawEnd は外部予定のネイティブ形の終了）。
export function makeState({ start, end, all, rawEnd }) {
  const a = !!all;
  return {
    orig: { start, end, all: a, rawEnd: rawEnd ?? null },
    start, end, all: a,
    // 終日にする前の時刻（OFF で戻す）。元が終日なら null。
    timed: a ? null : { start: time(start), end: time(end) },
    touched: { ...clean },
  };
}
// 入力欄（スラッシュ書式）から。読めなければ null。
export function stateFromInput(startText, endText, all, rawEnd) {
  const s = isoFromInput(startText, !!all), e = isoFromInput(endText, !!all);
  if (!s || !e) return null;
  return makeState({ start: all ? `${day(s)}T00:00` : s, end: all ? `${day(e)}T23:59` : e, all, rawEnd });
}

const withT = (st, patch, flags) => ({ ...st, ...patch, touched: { ...st.touched, ...flags } });
const clampN = (v, hi) => Number.isInteger(v) && v >= 0 && v <= hi;

// 開始の時刻を変える。長さを保つので終了も動く。m が null のときは今の分を保つ。
export function setStartTime(st, h, m = null) {
  if (st.all) return st;
  const cur = splitIso(st.start);
  const hh = h ?? cur.h, mm = m ?? cur.mi;
  if (!clampN(hh, 23) || !clampN(mm, 59)) return st;
  const len = durationMin(st.start, st.end);
  const start = `${day(st.start)}T${p2(hh)}:${p2(mm)}`;
  return withT(st, { start, end: addMinutes(start, len) }, { startHour: st.touched.startHour || hh !== cur.h, startMin: st.touched.startMin || mm !== cur.mi });
}
// 開始の日を変える。何日またぐか（暦日の差）と時刻を保つ。
export function setStartDate(st, k) {
  if (!isDay(k)) return st;
  const span = dayDiff(st.start, st.end);
  const start = `${k}T${time(st.start)}`;
  const end = `${dayAdd(k, span)}T${time(st.end)}`;
  return withT(st, { start, end }, { startDate: st.touched.startDate || k !== day(st.start) });
}
// 終了の時刻を変える。開始より前になるなら日付を進める。
export function setEndTime(st, h, m = null) {
  if (st.all) return st;
  const cur = splitIso(st.end);
  const hh = h ?? cur.h, mm = m ?? cur.mi;
  if (!clampN(hh, 23) || !clampN(mm, 59)) return st;
  let end = `${day(st.end)}T${p2(hh)}:${p2(mm)}`;
  if (end < st.start) end = `${dayAdd(day(end), 1)}T${p2(hh)}:${p2(mm)}`;
  if (end < st.start) end = `${dayAdd(day(st.start), 1)}T${p2(hh)}:${p2(mm)}`;
  return withT(st, { end }, { endHour: st.touched.endHour || hh !== cur.h, endMin: st.touched.endMin || mm !== cur.mi, endDate: st.touched.endDate || day(end) !== day(st.end) });
}
// 終了の日を明示的に変える。開始より前になるなら拒否（{ error }）。
export function setEndDate(st, k) {
  if (!isDay(k)) return { error: '日付が正しくありません。' };
  const end = st.all ? `${k}T23:59` : `${k}T${time(st.end)}`;
  const startCmp = st.all ? `${day(st.start)}T00:00` : st.start;
  if (end < startCmp) return { error: '終了は開始以降にしてください。' };
  return withT(st, { end }, { endDate: st.touched.endDate || k !== day(st.end) });
}
// 小さな月から終了日を選ぶ。開始の日より前は選べない（呼ぶ側がマスを無効にする）。
// 同じ日で今の終了時刻が開始より前になるときは、終了を開始と同じ時刻にそろえる（保存ではじかれない）。
export function pickEndDate(st, k) {
  if (!isDay(k) || k < day(st.start)) return st;
  const r = setEndDate(st, k);
  if (!r.error) return r;
  return withT(st, { end: st.start }, { endHour: true, endMin: true, endDate: st.touched.endDate || k !== day(st.end) });
}
// 長さ（分）を指定。終了を動かす。
export function setDuration(st, min) {
  if (st.all || !Number.isInteger(min) || min < 0) return st;
  const end = addMinutes(st.start, min);
  return withT(st, { end }, { endDate: st.touched.endDate || day(end) !== day(st.end), endHour: true, endMin: true });
}
// 終日の切替。ON で時刻を覚え、OFF で戻す（元が終日なら 10:00〜11:00）。
export function setAll(st, on) {
  on = !!on;
  if (on === st.all) return st;
  const flags = { all: st.touched.all || on !== st.orig.all };
  if (on) {
    return withT(st, { all: true, timed: { start: time(st.start), end: time(st.end) }, start: `${day(st.start)}T00:00`, end: `${day(st.end)}T23:59` }, flags);
  }
  const t = st.timed || { start: '10:00', end: '11:00' };
  const start = `${day(st.start)}T${t.start}`;
  let end = `${day(st.end)}T${t.end}`;
  if (end < start) end = addMinutes(start, 60);
  return withT(st, { all: false, start, end }, flags);
}

// 元の値と同じか（開いて閉じただけなら true）
export const unchanged = (st) => st.start === st.orig.start && st.end === st.orig.end && st.all === st.orig.all;
// 保存・送信に使う組。不変なら null（送らない）。時だけの変更でも元の分を保った start/end を一組で返す。
export function resultPair(st) {
  if (unchanged(st)) return null;
  return { start: st.start, end: st.end, all: st.all };
}
// 終了までの暦日数（0=当日、1=翌日）
export const endDayOffset = (st) => dayDiff(st.start, st.end);

// ---------- 数字の短縮入力（設計12 §4） ----------
// 全角数字・コロン・スラッシュ等を除いた数字だけにする。
export const digitsOnly = (s) => String(s ?? '').normalize('NFKC').replace(/\D/g, '');
// 時刻: 「9」→9:00、「21」→21:00、「930」→9:30、「1430」→14:30。読めなければ null（2560・1332・24 など）。
export function parseTimeDigits(text) {
  const d = digitsOnly(text);
  let h, m;
  if (d.length === 1 || d.length === 2) { h = +d; m = 0; }
  else if (d.length === 3) { h = +d.slice(0, 1); m = +d.slice(1); }
  else if (d.length === 4) { h = +d.slice(0, 2); m = +d.slice(2); }
  else return null;
  return clampN(h, 23) && clampN(m, 59) ? { h, m } : null;
}
// 日付: 「1114」→11月14日、「930」→9月30日、「20270105」→2027年1月5日。
// 年のない形は baseYear（編集中の値の年）を使う。来年へ送るなどの推測はしない。0230 のような存在しない日は null。
export function parseDateDigits(text, baseYear) {
  const d = digitsOnly(text);
  let y, mo, dd;
  if (d.length === 8) { y = +d.slice(0, 4); mo = +d.slice(4, 6); dd = +d.slice(6); }
  else if (d.length === 4) { y = baseYear; mo = +d.slice(0, 2); dd = +d.slice(2); }
  else if (d.length === 3) { y = baseYear; mo = +d.slice(0, 1); dd = +d.slice(1); }
  else return null;
  if (!Number.isInteger(y) || y < 1000 || y > 9999 || mo < 1 || mo > 12 || dd < 1) return null;
  const k = `${String(y).padStart(4, '0')}-${p2(mo)}-${p2(dd)}`;
  return isDay(k) ? k : null;
}

// ---------- ダイヤルの輪（design/24） ----------
// 時は 0〜23、分は 00〜55（5分刻み）を輪にしてつなぐ（23→0、55→00）。5分刻みでない分（14:07 の 07）は
// 回すまで丸めず、輪の中の正しい位置に差し込む（… 05, 07, 10 …）。{ list, idx }（idx は今の値の位置）。
export function dialRing(kind, cur) {
  const list = kind === 'h' ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i * 5);
  let idx = list.indexOf(cur);
  if (idx < 0 && Number.isInteger(cur) && cur >= 0 && cur <= (kind === 'h' ? 23 : 59)) {
    idx = list.findIndex((v) => v > cur); if (idx < 0) idx = list.length;
    list.splice(idx, 0, cur);
  }
  return { list, idx: Math.max(0, idx) };
}
// 輪を dir（+1／-1）だけ回した値（回したときだけ5分に寄る）。
export function dialStep(kind, cur, dir) {
  const { list, idx } = dialRing(kind, cur), n = list.length;
  return list[(((idx + dir) % n) + n) % n];
}
