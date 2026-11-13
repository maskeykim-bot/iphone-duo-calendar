// 日付・予定まわりの純粋関数。DOM に依存しない。
export const CATS = {
  work: '仕事',
  private: 'プライベート',
  golf: 'ゴルフ',
  economy: '経済指標',
};
export const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export const pad = (n) => String(n).padStart(2, '0');
export const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
export const isKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dkey(parseKey(s)) === s;
export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dkey(d);
};
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const addMonths = (k, n) => {
  const d = parseKey(k);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  t.setDate(Math.min(day, daysInMonth(t.getFullYear(), t.getMonth())));
  return dkey(t);
};
export const weekStart = (k) => addDays(k, -parseKey(k).getDay());
export const dayLabel = (k) => {
  const d = parseKey(k);
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`;
};
export const nowStamp = (d = new Date()) => `${dkey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const todayKey = () => dkey(new Date());

export const dayOf = (s) => s.slice(0, 10);
export const isMulti = (e) => dayOf(e.start) !== dayOf(e.end);
export function eventsOnDay(events, k) {
  return events
    .filter((e) => dayOf(e.start) <= k && dayOf(e.end) >= k)
    .sort((a, b) => Number(!!b.all) - Number(!!a.all) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'ja'));
}
export function timeLabel(e) {
  if (e.all) return '終日';
  return `${e.start.slice(11)} – ${e.end.slice(11)}`;
}

// 入力欄は地域依存の datetime-local を避け、固定書式のテキストで扱う。
export const toInput = (iso, all) => {
  const s = iso.slice(0, 10).replaceAll('-', '/');
  return all ? s : `${s} ${iso.slice(11, 16)}`;
};
export function parseInput(text, all) {
  const t = String(text).trim();
  const re = all ? /^(\d{4})\/(\d{2})\/(\d{2})$/ : /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/;
  const m = re.exec(t);
  if (!m) return null;
  const [y, mo, d] = [m[1], m[2], m[3]].map(Number);
  const hh = all ? 0 : Number(m[4]);
  const mi = all ? 0 : Number(m[5]);
  if (hh > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${dkey(date)}T${pad(hh)}:${pad(mi)}`;
}

// 古い（v1）レコードに既定値を補う。
export const withDefaults = (e) => ({ ...e, notes: e.notes ?? '', recurrence: e.recurrence ?? null, exdates: e.exdates ?? [], overrides: e.overrides ?? {} });

export const FREQS = { daily: '毎日', weekly: '毎週', monthly: '毎月', yearly: '毎年' };
export const LIMITS = { title: 80, place: 200, notes: 4000, count: 9999 };

// 繰り返しの要約（例: 毎週 月・木／10回）。start は開始日時（毎月・毎年の説明用）。
export function ruleSummary(rule, start) {
  if (!rule) return 'なし';
  const d = parseKey(dayOf(start));
  let s = FREQS[rule.freq] || '';
  if (rule.freq === 'weekly') s += ` ${(rule.byDay || []).map((i) => DOW[i]).join('・')}`;
  if (rule.freq === 'monthly') s = `毎月${d.getDate()}日`;
  if (rule.freq === 'yearly') s = `毎年${d.getMonth() + 1}月${d.getDate()}日`;
  if (rule.count != null) s += `／${rule.count}回`;
  else if (rule.until) s += `／${rule.until.replaceAll('-', '/')}まで`;
  return s;
}

// ドラフト → 保存用の予定。失敗時は { error, where } を返す。
export function validateDraft(f) {
  const title = (f.title || '').trim();
  if (!title) return { error: '予定名を入力してください。' };
  const all = !!f.all;
  let start = parseInput(f.start, all);
  let end = parseInput(f.end, all);
  if (!start || !end) {
    return { error: all ? '日付を 2026/11/12 の形式で入力してください。' : '日時を 2026/11/12 10:00 の形式で入力してください。' };
  }
  if (all) {
    start = `${dayOf(start)}T00:00`;
    end = `${dayOf(end)}T23:59`;
  }
  if (end < start) return { error: '終了は開始以降にしてください。' };
  if (!Object.hasOwn(CATS, f.cat)) return { error: 'カテゴリを選んでください。' };
  let recurrence = null;
  const freq = f.rfreq || 'none';
  if (freq !== 'none') {
    if (!Object.hasOwn(FREQS, freq)) return { error: '繰り返しの種類を選んでください。', where: 'repeat' };
    recurrence = { freq, interval: 1, byDay: null, count: null, until: null };
    if (freq === 'weekly') {
      const by = [...new Set((f.rbyday || []).map(Number))].filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b);
      if (!by.length) return { error: '曜日を1つ以上選んでください。', where: 'repeat' };
      recurrence.byDay = by;
    }
    if (f.rend === 'count') {
      const t = String(f.rcount ?? '').trim();
      const n = /^\d+$/.test(t) ? Number(t) : NaN;
      if (!(n >= 1 && n <= LIMITS.count)) return { error: '回数は1〜9999の整数で入力してください。', where: 'repeat' };
      recurrence.count = n;
    } else if (f.rend === 'until') {
      const u = parseInput(f.runtil, true);
      if (!u || dayOf(u) < dayOf(start)) return { error: '開始日以降の日付を選んでください。', where: 'repeat' };
      recurrence.until = dayOf(u);
    }
  }
  return { event: { title, cat: f.cat, all, start, end, place: (f.place || '').trim().slice(0, LIMITS.place), notes: String(f.notes || '').slice(0, LIMITS.notes), recurrence } };
}

// 月グリッド: 週ごとの日付配列
export function monthWeeks(selected) {
  const d = parseKey(selected);
  const y = d.getFullYear();
  const m = d.getMonth();
  const first = new Date(y, m, 1, 12);
  const n = Math.ceil((first.getDay() + daysInMonth(y, m)) / 7);
  const start = weekStart(dkey(first));
  return Array.from({ length: n }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

// 週内の複数日予定にレーンを割り当てる。lane 0 が最下段。
export function assignLanes(events, days, maxLanes = 2) {
  const multis = events
    .filter((e) => isMulti(e) && dayOf(e.start) <= days[6] && dayOf(e.end) >= days[0])
    .sort((a, b) => a.start.localeCompare(b.start) || dayOf(b.end).localeCompare(dayOf(a.end)) || a.title.localeCompare(b.title, 'ja'));
  const lanes = [];
  const bars = [];
  const hidden = Array(7).fill(0);
  for (const e of multis) {
    const sc = Math.max(0, days.findIndex((k) => k >= dayOf(e.start)));
    let ec = 6;
    for (let i = 6; i >= 0; i--) if (days[i] <= dayOf(e.end)) { ec = i; break; }
    let lane = lanes.findIndex((list) => list.every(([s, t]) => t < sc || s > ec));
    if (lane < 0) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push([sc, ec]);
    if (lane < maxLanes) bars.push({ e, sc, ec, lane, fromPrev: dayOf(e.start) < days[0], toNext: dayOf(e.end) > days[6] });
    else for (let i = sc; i <= ec; i++) hidden[i]++;
  }
  return { bars, hidden, used: Math.min(lanes.length, maxLanes) };
}

// 開いた縦の月: 複数日帯と単日短冊で共通の2レーンを使う。
// 複数日を先に（開始日時順）、単日は残ったレーンに時刻順。収まらない分は日ごとの hidden に数える。
export function assignSharedLanes(events, days, maxLanes = 2) {
  const occ = Array.from({ length: maxLanes }, () => Array(7).fill(false));
  const items = [];
  const hidden = Array(7).fill(0);
  const multis = events
    .filter((e) => isMulti(e) && dayOf(e.start) <= days[6] && dayOf(e.end) >= days[0])
    .sort((a, b) => a.start.localeCompare(b.start) || dayOf(b.end).localeCompare(dayOf(a.end)) || a.title.localeCompare(b.title, 'ja'));
  for (const e of multis) {
    const sc = Math.max(0, days.findIndex((k) => k >= dayOf(e.start)));
    let ec = 6;
    for (let i = 6; i >= 0; i--) if (days[i] <= dayOf(e.end)) { ec = i; break; }
    const lane = occ.findIndex((row) => row.slice(sc, ec + 1).every((v) => !v));
    if (lane < 0) { for (let i = sc; i <= ec; i++) hidden[i]++; continue; }
    for (let i = sc; i <= ec; i++) occ[lane][i] = true;
    items.push({ e, sc, ec, lane, multi: true, fromPrev: dayOf(e.start) < days[0], toNext: dayOf(e.end) > days[6] });
  }
  days.forEach((k, col) => {
    for (const e of eventsOnDay(events, k).filter((x) => !isMulti(x))) {
      const lane = occ.findIndex((row) => !row[col]);
      if (lane < 0) { hidden[col]++; continue; }
      occ[lane][col] = true;
      items.push({ e, sc: col, ec: col, lane, multi: false });
    }
  });
  return { items, hidden };
}

export function newId() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
