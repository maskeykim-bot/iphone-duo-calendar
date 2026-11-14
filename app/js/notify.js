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
