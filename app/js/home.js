import { todayTasks } from './tasks.js';
// ホーム（今日のカード）の純粋な集合計算。描画・保存は持たない（app.js が使う）。第16版 PR14。
export const MAX_EVENTS = 3, MAX_TASKS = 3, EVENING_HOUR = 20;
export const AXIS_FROM = 9, AXIS_TO = 19, HOUR_PX = 14;
const hm = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));

// 今日の残り（終了前）の回から、次の予定・残り最大3件・「ほか」件数を分ける。次の予定は残りに二重掲載しない。
// future: 今日に予定がないときの「次の日の予定」（呼び側が探す）。
export function splitEvents(list, future) {
  const l = Array.isArray(list) ? list : [];
  const next = l.find((e) => !e.all) || l[0] || future || null;
  const rest = l.filter((e) => e !== next);
  return { next, rest, shown: rest.slice(0, MAX_EVENTS), more: Math.max(0, rest.length - MAX_EVENTS), count: l.length };
}
// 20時以降は明日のカードを今日の予定の上へ。
export const eveningFirst = (stamp) => Number(String(stamp).slice(11, 13)) >= EVENING_HOUR;

// 期限が今日以前の未完了。pending は完了操作中の表示上書き（id→done）。完了にした行は押した直後も取り消せるよう残す。
export function homeTasks(reminders, today, pending) {
  const r = todayTasks(Array.isArray(reminders) ? reminders : [], today, pending);
  return { items: r.items.slice(0, MAX_TASKS), total: r.total };
}
const addDay = (k, n) => { const d = new Date(`${k}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// 期限の短い表記: 期限切れは「昨日」「11/14」、今日は時刻（なければ空）。
export function dueText(due, today) {
  if (!due?.date) return '';
  if (due.date < today) return due.date === addDay(today, -1) ? '昨日' : `${Number(due.date.slice(5, 7))}/${Number(due.date.slice(8, 10))}`;
  return due.time || '';
}
// 明日のカード: 件数と、最初の1件（終日は先頭、なければ時刻順の先頭）。
export function tomorrowSummary(list) {
  const l = Array.isArray(list) ? list : [];
  const first = l.find((e) => !e.all) || l[0] || null;
  return { count: l.length, first, more: Math.max(0, l.length - 1) };
}
// 9〜19時の小さな時間軸。今日の分だけを切り出し、軸の外は端で切る。終日は含めない。
export function axisBars(list, now, day) {
  const from = AXIS_FROM * 60, to = AXIS_TO * 60, bars = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (e.all) continue;
    const s = e.start.slice(0, 10) < day ? 0 : hm(e.start), en = e.end.slice(0, 10) > day ? 1440 : hm(e.end);
    const a = Math.max(from, s), z = Math.min(to, Math.max(en, s + 15));
    if (z <= a) continue;
    bars.push({ id: e.id, top: ((a - from) * HOUR_PX) / 60, height: Math.max(6, ((z - a) * HOUR_PX) / 60), past: e.end <= now, start: e.start });
  }
  const nm = hm(now);
  const nowTop = now.slice(0, 10) === day && nm >= from && nm <= to ? ((nm - from) * HOUR_PX) / 60 : null;
  return { bars, nowTop, height: ((to - from) * HOUR_PX) / 60 };
}
// メモの最初の n 行（空行は飛ばす）。
export function firstLines(text, n = 2) {
  return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, n);
}
