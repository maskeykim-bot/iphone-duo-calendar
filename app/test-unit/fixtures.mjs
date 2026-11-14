// 単体テスト共通のフィクスチャ（テストではなく node --test の対象外: *.test.mjs のみが対象）。
export const R = (freq, x = {}) => ({ freq, interval: 1, byDay: null, count: null, until: null, ...x });
export const ev = (id, s, e, rec, x = {}) => ({ id, title: 't' + id, categoryId: 'c-work', all: false, start: s, end: e, place: '', notes: '', recurrence: rec, exdates: [], overrides: {}, ...x });
// 性能計測用の予定セット（probe_perf / probe_recur と同じ形）。
export const perfEv = (id, s, e, rec) => ({ id, title: '会議' + id, categoryId: 'c-work', all: false, start: s, end: e, place: '本社', notes: 'メモ'.repeat(50), recurrence: rec, exdates: [], overrides: {} });
export const manyRecurring = (pre = 'p') => {
  const a = [];
  for (let i = 0; i < 200; i++) a.push(ev(pre + i, '2020-01-01T09:00', '2020-01-01T10:00', R(i % 2 ? 'daily' : 'weekly', { byDay: i % 2 ? null : [1, 2, 3, 4, 5] })));
  return a;
};
export const oldCountSeries = (pre = 'c') => Array.from({ length: 200 }, (_, i) => ev(pre + i, '2000-01-01T09:00', '2000-01-01T10:00', R('daily', { count: 9999 })));
export const dailyCount999 = () => Array.from({ length: 20 }, (_, i) => perfEv('c' + i, '2024-01-01T09:00', '2024-01-01T10:00', R('daily', { count: 999 })));
export const searchSet = () => {
  const b = [];
  for (let i = 0; i < 30; i++) b.push(perfEv('d' + i, '2025-01-01T09:00', '2025-01-01T10:00', R('daily')));
  for (let i = 0; i < 500; i++) b.push(perfEv('n' + i, `2026-0${1 + i % 9}-10T09:00`, `2026-0${1 + i % 9}-10T10:00`, null));
  return b;
};
export const TODAY = '2026-11-14';
export const GOAL_MS = 100;
