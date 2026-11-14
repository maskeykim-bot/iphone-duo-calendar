// 通知の既定値・計画・文面。DOM・ネイティブに依存しない純粋関数。日時は YYYY-MM-DDTHH:MM（端末ローカル）。
import { addDays, dayOf, dkey, pad, parseKey, DOW } from './util.js';
import { expand } from './recur.js';
import { ALLDAY_DAYS, TIMED_BEFORE, okAllDay, okTimed } from './alarms.js';
export { ALLDAY_DAYS, TIMED_BEFORE };

export const MAX_PENDING = 60;
export const WINDOW_DAYS = 30;
export const NOTIFY_DEFAULTS = Object.freeze({
  version: 1, enabled: true, showTitle: true,
  defaultTimed: Object.freeze({ before: 30 }), defaultAllDay: Object.freeze({ day: 0, at: '08:00' }),
});

// 保存値の正しい項目だけ採用し、無い・不正な項目は既定にする。常に新しいオブジェクトを返す。
export function normNotify(v) {
  const o = v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
  return {
    version: 1,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : NOTIFY_DEFAULTS.enabled,
    showTitle: typeof o.showTitle === 'boolean' ? o.showTitle : NOTIFY_DEFAULTS.showTitle,
    defaultTimed: { before: okTimed(o.defaultTimed) ? o.defaultTimed.before : NOTIFY_DEFAULTS.defaultTimed.before },
    defaultAllDay: okAllDay(o.defaultAllDay) ? { day: o.defaultAllDay.day, at: o.defaultAllDay.at } : { ...NOTIFY_DEFAULTS.defaultAllDay },
  };
}

// 新規予定の初期値（既定は新規作成のときに写すだけ）。
export const defaultAlarms = (all, s) => {
  const n = normNotify(s);
  return all ? [{ ...n.defaultAllDay }] : [{ ...n.defaultTimed }];
};

// 回の alarms（未定義・null は予約なし）。
export const alarmsFor = (occ) => (Array.isArray(occ?.alarms) ? occ.alarms : []);

const localStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDate = (k) => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)), Number(k.slice(11, 13)), Number(k.slice(14, 16)));

// 発火のローカル日時。時刻あり：1日以上前は暦の日数で戻し（同じ時刻）、それ未満は経過時間で戻す。
// 終日：開始日から day 日前の at。DST で存在しない時刻は Date が補正した時刻になる。
export function fireAt(occ, alarm) {
  if (occ.all) {
    if (!okAllDay(alarm)) return null;
    const d = parseKey(dayOf(occ.start));
    return localStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - alarm.day, Number(alarm.at.slice(0, 2)), Number(alarm.at.slice(3, 5))));
  }
  if (!okTimed(alarm)) return null;
  const s = toDate(occ.start);
  if (alarm.before >= 1440) return localStr(new Date(s.getFullYear(), s.getMonth(), s.getDate() - alarm.before / 1440, s.getHours(), s.getMinutes()));
  return localStr(new Date(s.getTime() - alarm.before * 60000));
}

const clip = (t) => { const a = Array.from(String(t ?? '')); return a.length > 40 ? `${a.slice(0, 40).join('')}…` : a.join(''); };
const mdw = (k) => { const d = parseKey(k); return `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`; };
const hm = (s) => s.slice(11);
const timedLabel = (b) => (b === 0 ? '開始' : b === 60 ? '1時間後' : b === 120 ? '2時間後' : b === 1440 ? '明日' : b === 2880 ? '明後日' : `${b}分後`);
const allLabel = (d) => (d === 0 ? '今日' : d === 1 ? '明日' : d === 2 ? '明後日' : '1週間後');

// 通知の文面（design/02 §3）。showTitle:false では予定名・場所を出さない。
export function notifyText(occ, alarm, showTitle = true) {
  const sd = dayOf(occ.start), ed = dayOf(occ.end);
  const label = occ.all ? allLabel(alarm.day) : timedLabel(alarm.before);
  let when;
  if (occ.all) {
    const multi = ed > sd;
    const endTxt = multi ? (ed.slice(0, 7) === sd.slice(0, 7) ? `${Number(ed.slice(8))}日（${DOW[parseKey(ed).getDay()]}）` : mdw(ed)) : '';
    if (alarm.day === 0) when = multi ? `終日（〜${mdw(ed)}）` : '終日';
    else when = `終日 ・ ${mdw(sd)}${multi ? `〜${endTxt}` : ''}`;
  } else {
    const range = ed === sd ? `${hm(occ.start)}〜${hm(occ.end)}` : `${hm(occ.start)}〜${mdw(ed)}${hm(occ.end)}`;
    when = alarm.before >= 1440 ? `${mdw(sd)}${range}` : range;
  }
  if (!showTitle) return { title: '予定があります', body: `${label} ・ ${when}` };
  const place = (occ.place || '').trim();
  return { title: `${label}：${clip(occ.title)}`, body: place ? `${when} ・ ${place}` : when };
}

// 展開前の親で除外する：iPhone 由来と、iPhone と結びついた（linked / pending）予定。unlinked は対象。
const excluded = (e) => e.origin === 'iphone' || e.nativeLink?.state === 'linked' || e.nativeLink?.state === 'pending';

// 予約する通知の一覧（notifySync の items）。非表示カテゴリも含む。
export function planNotifications(events, now, s, { days = WINDOW_DAYS, max = MAX_PENDING } = {}) {
  const n = normNotify(s);
  if (!n.enabled) return [];
  const today = dkey(now);
  const limit = new Date(now.getTime() + days * 864e5);
  const targets = events.filter((e) => !excluded(e) && (e.recurrence || (e.alarms || []).length));
  const pool = [];
  for (const occ of expand(targets, today, addDays(today, days + 7))) {
    const parentId = occ.parentId ?? occ.id;
    alarmsFor(occ).forEach((alarm, i) => {
      const fire = fireAt(occ, alarm);
      if (!fire) return;
      const fd = toDate(fire);
      if (!(fd > now) || fd > limit) return;
      const { title, body } = notifyText(occ, alarm, n.showTitle);
      pool.push({ id: `duo.${parentId}@${occ.occKey ?? occ.start}#${i}`, title, body, fireDate: fire, thread: `duo.${dayOf(occ.start)}`, day: dayOf(occ.start), eventId: parentId });
    });
  }
  pool.sort((a, b) => (a.fireDate < b.fireDate ? -1 : a.fireDate > b.fireDate ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pool.slice(0, max);
}

// ---------- 画面（通知行・パネル・ベル）用 ----------
// 選択肢の値の符号化: ''=なし、時刻あり 'b30'、終日 'd1@08:00'。
export const encAlarm = (a) => (a == null ? '' : a.before !== undefined ? `b${a.before}` : `d${a.day}@${a.at}`);
export function decAlarm(v) {
  const m = /^b(\d+)$/.exec(v ?? '');
  if (m) return { before: Number(m[1]) };
  const d = /^d(\d+)@(\d\d:\d\d)$/.exec(v ?? '');
  return d ? { day: Number(d[1]), at: d[2] } : null;
}
const BEFORE_LABEL = { 0: '予定の時刻', 5: '5分前', 10: '10分前', 15: '15分前', 30: '30分前', 60: '1時間前', 120: '2時間前', 1440: '1日前', 2880: '2日前' };
const DAY_LABEL = { 0: '当日', 1: '前日', 2: '2日前', 7: '1週間前' };
const hmLabel = (at) => `${Number(at.slice(0, 2))}:${at.slice(3)}`;
export const alarmLabel = (a) => (a.before !== undefined ? BEFORE_LABEL[a.before] : `${DAY_LABEL[a.day]} ${hmLabel(a.at)}`);
// 選択肢（なしを含む）。all は終日用。extra は 08:00 以外など標準にない現在値（失わないよう足す）。
export function alarmOptions(all, extra = []) {
  const std = all ? ALLDAY_DAYS.map((day) => ({ day, at: '08:00' })) : TIMED_BEFORE.map((before) => ({ before }));
  const have = new Set(std.map(encAlarm));
  const add = extra.filter((a) => a && (all ? a.day !== undefined : a.before !== undefined) && !have.has(encAlarm(a)));
  return [{ value: '', label: 'なし' }, ...[...std, ...add].map((a) => ({ value: encAlarm(a), label: alarmLabel(a) }))];
}
export const alarmsDup = (alarms) => new Set(alarms.map(encAlarm)).size !== alarms.length;
const uniq = (list) => { const seen = new Set(); return list.filter((a) => { const k = encAlarm(a); if (seen.has(k)) return false; seen.add(k); return true; }); };
// 終日の切替。時刻あり→終日：1日以上前は前日 08:00、他は当日 08:00。終日→時刻あり：既定。[]（明示のなし）は維持。
export function convertAlarms(alarms, toAll, s) {
  if (!Array.isArray(alarms) || !alarms.length) return alarms;
  const n = normNotify(s);
  return uniq(alarms.map((a) => (toAll ? (a.before !== undefined ? { day: a.before >= 1440 ? 1 : 0, at: '08:00' } : a) : (a.before !== undefined ? a : { ...n.defaultTimed }))));
}
// 画面の読み上げ・ベル用。
export const alarmsAria = (alarms) => (Array.isArray(alarms) && alarms.length ? `通知 ${alarms.map(alarmLabel).join('、')}` : '');
// 次に鳴る通知の表示（「9:30」「11/14 9:30」）。無ければ ''。
export function nextNotifyText(occ, now) {
  const stamp = localStr(now), fires = alarmsFor(occ).map((a) => fireAt(occ, a)).filter((f) => f && f > stamp).sort();
  if (!fires.length) return '';
  const f = fires[0], t = hmLabel(f.slice(11));
  return f.slice(0, 10) === stamp.slice(0, 10) ? t : `${Number(f.slice(5, 7))}/${Number(f.slice(8, 10))} ${t}`;
}
// 開始が過去か（時刻あり：開始、終日：すべての発火が過去）。
export function pastForNotify(occ, alarms, now) {
  const stamp = localStr(now);
  if (!occ.all) return occ.start <= stamp;
  const fs = alarms.map((a) => fireAt(occ, a)).filter(Boolean);
  return fs.length > 0 && fs.every((f) => f <= stamp);
}
