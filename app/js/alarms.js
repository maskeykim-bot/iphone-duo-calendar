// 通知（alarms）の定数と検証。依存なしの小モジュール（util / recur / backup / notify から循環なしで使うため）。
export const TIMED_BEFORE = Object.freeze([0, 5, 10, 15, 30, 60, 120, 1440, 2880]);
export const ALLDAY_DAYS = Object.freeze([0, 1, 2, 7]);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isHm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const okTimed = (a) => isObj(a) && TIMED_BEFORE.includes(a.before);
export const okAllDay = (a) => isObj(a) && ALLDAY_DAYS.includes(a.day) && isHm(a.at);
// 予定の alarms：配列は最大2件。null は「継承」（予定本体では予約なし）。undefined は呼び出し側で「項目なし」として扱う。
export const alarmsOk = (a) => a === null || (Array.isArray(a) && a.length <= 2 && a.every((x) => okTimed(x) || okAllDay(x)));
