import test from 'node:test';
import assert from 'node:assert/strict';
import { planNotifyPolicy, ALLDAY_DAYS, MAX_PENDING, NOTIFY_DEFAULTS, TIMED_BEFORE, WINDOW_DAYS, alarmsFor, defaultAlarms, fireAt, normNotify, notifyText, planNotifications } from '../js/notify.js';
import { alarmsOk } from '../js/alarms.js';
import { validateDraft } from '../js/util.js';
import { buildBackup, validateBackup } from '../js/backup.js';
import { R, ev, manyRecurring } from './fixtures.mjs';

const NOW = new Date(2026, 10, 14, 9, 0); // 2026-11-14 09:00 ローカル
const S = normNotify({ enabled: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' } }); // 通知オン・既定ありの設定（新規の既定はオフ・なし）
const al = (x) => ev(x.id, x.s, x.e, x.rec ?? null, { alarms: x.alarms, ...(x.extra || {}) });
const planR = (events, now = NOW, s = S, o) => planNotifications(events, now, s, o);
const plan = (events, now, s, o) => planR(events, now, s, o).items;

test('定数', () => {
  assert.deepEqual([...TIMED_BEFORE], [0, 5, 10, 15, 30, 60, 120, 1440, 2880]);
  assert.deepEqual([...ALLDAY_DAYS], [0, 1, 2, 7]);
  assert.equal(MAX_PENDING, 60); assert.equal(WINDOW_DAYS, 30);
});

test('normNotify: 未保存・null・不正値 → オフ・既定なし', () => {
  for (const v of [undefined, null, {}, [], 'x', 5]) {
    assert.deepEqual(normNotify(v), { version: 1, enabled: false, showTitle: true, defaultTimed: null, defaultAllDay: null });
  }
  assert.equal(normNotify({ defaultTimed: { before: 7 } }).defaultTimed, null);
  assert.equal(normNotify({ defaultAllDay: { day: 3, at: '08:00' } }).defaultAllDay, null);
  assert.equal(normNotify({ defaultAllDay: { day: 1, at: '25:00' } }).defaultAllDay, null);
  const ok = normNotify({ enabled: true, showTitle: false, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '07:30' } });
  assert.deepEqual(ok, { version: 1, enabled: true, showTitle: false, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '07:30' } });
  assert.equal(normNotify({ enabled: 'no' }).enabled, false);
  assert.notEqual(normNotify(null), normNotify(null)); // 毎回新しいオブジェクト
  assert.ok(Object.isFrozen(NOTIFY_DEFAULTS));
});

test('planNotifyPolicy: 既定は常になし。enabled は保存値優先、未保存は既存=オン・新規=オフ。showTitle は保持', () => {
  assert.deepEqual(planNotifyPolicy(null, false), { version: 1, enabled: false, showTitle: true, defaultTimed: null, defaultAllDay: null });
  assert.equal(planNotifyPolicy(null, true).enabled, true);
  assert.equal(planNotifyPolicy({ enabled: false, defaultTimed: { before: 30 } }, true).enabled, false); // 保存済み false を尊重
  assert.equal(planNotifyPolicy({ enabled: true }, false).enabled, true);
  assert.equal(planNotifyPolicy({ showTitle: false }, true).showTitle, false);
  assert.deepEqual(planNotifyPolicy({ enabled: true, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '09:00' } }, true), { version: 1, enabled: true, showTitle: true, defaultTimed: null, defaultAllDay: null });
});

test('defaultAlarms: 既定なし→[]、既定あり→その値', () => {
  assert.deepEqual(defaultAlarms(false, normNotify(null)), []);
  assert.deepEqual(defaultAlarms(true, normNotify(null)), []);
  assert.deepEqual(defaultAlarms(false, S), [{ before: 30 }]);
  assert.deepEqual(defaultAlarms(true, S), [{ day: 0, at: '08:00' }]);
  assert.deepEqual(defaultAlarms(false, { defaultTimed: { before: 5 } }), [{ before: 5 }]);
});

test('alarmsFor: 未定義・null → []', () => {
  assert.deepEqual(alarmsFor({}), []); assert.deepEqual(alarmsFor({ alarms: null }), []);
  assert.deepEqual(alarmsFor({ alarms: [{ before: 5 }] }), [{ before: 5 }]);
});

test('fireAt: 全 alarm', () => {
  const t = { all: false, start: '2026-11-20T10:00' };
  for (const [b, exp] of [[0, '2026-11-20T10:00'], [5, '2026-11-20T09:55'], [10, '2026-11-20T09:50'], [15, '2026-11-20T09:45'], [30, '2026-11-20T09:30'], [60, '2026-11-20T09:00'], [120, '2026-11-20T08:00'], [1440, '2026-11-19T10:00'], [2880, '2026-11-18T10:00']]) {
    assert.equal(fireAt(t, { before: b }), exp, `before ${b}`);
  }
  const a = { all: true, start: '2026-11-20T00:00' };
  assert.equal(fireAt(a, { day: 0, at: '08:00' }), '2026-11-20T08:00');
  assert.equal(fireAt(a, { day: 1, at: '08:00' }), '2026-11-19T08:00');
  assert.equal(fireAt(a, { day: 2, at: '08:00' }), '2026-11-18T08:00');
  assert.equal(fireAt(a, { day: 7, at: '08:00' }), '2026-11-13T08:00');
  assert.equal(fireAt(a, { day: 7, at: '09:30' }), '2026-11-13T09:30');
  assert.equal(fireAt({ all: true, start: '2026-03-01T00:00' }, { day: 1, at: '08:00' }), '2026-02-28T08:00');
  assert.equal(fireAt(t, { day: 0, at: '08:00' }), null); // 種類違いは無効
});

test('fireAt: NY の DST 開始日 02:30 → 03:30（NY のときだけ）', { skip: process.env.TZ !== 'America/New_York' }, () => {
  assert.equal(fireAt({ all: true, start: '2026-03-08T00:00' }, { day: 0, at: '02:30' }), '2026-03-08T03:30');
  assert.equal(fireAt({ all: false, start: '2026-03-08T03:00' }, { before: 30 }), '2026-03-08T01:30');
  assert.equal(fireAt({ all: false, start: '2026-03-09T10:00' }, { before: 1440 }), '2026-03-08T10:00'); // 暦の1日前（同じ時刻）
});

test('planNotifications: enabled:false → []、alarms 無し・未定義は鳴らない', () => {
  const e = al({ id: 'a', s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [{ before: 30 }] });
  assert.equal(plan([e], NOW, { enabled: false }).length, 0);
  assert.equal(plan([ev('u', '2026-11-20T10:00', '2026-11-20T11:00', null), al({ id: 'n', s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [] }), al({ id: 'z', s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: null })]).length, 0);
});

test('planNotifications: 範囲境界（過去・now ちょうど・30日ちょうど・30日超）', () => {
  const at = (s, before = 0) => al({ id: s, s, e: s, alarms: [{ before }] });
  const got = plan([at('2026-11-14T08:59'), at('2026-11-14T09:00'), at('2026-11-14T09:01'), at('2026-12-14T09:00'), at('2026-12-14T09:01')]);
  // 30日超の1件があるので、最後に duo.refresh（最後の実通知 12/14 09:00 の1分後）が付く
  assert.deepEqual(got.map((x) => x.fireDate), ['2026-11-14T09:01', '2026-12-14T09:00', '2026-12-14T09:01']);
  assert.deepEqual(got.map((x) => x.id).slice(2), ['duo.refresh']);
  assert.equal(plan([at('2026-11-14T09:01'), at('2026-12-14T09:00')]).length, 2); // 窓外が無ければ実通知だけ
});

test('planNotifications: 61件→近い順60件、2件の alarm は #0/#1', () => {
  const evs = Array.from({ length: 61 }, (_, i) => al({ id: `e${String(i).padStart(2, '0')}`, s: `2026-11-${String(15 + (i % 10)).padStart(2, '0')}T${String(10 + (i % 5)).padStart(2, '0')}:00`, e: `2026-11-30T23:00`, alarms: [{ before: 30 }] }));
  const got = plan(evs);
  assert.equal(got.length, 60);
  assert.deepEqual(got.map((x) => x.fireDate), [...got.map((x) => x.fireDate)].sort());
  const two = plan([al({ id: 'two', s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [{ before: 30 }, { before: 5 }] })]);
  assert.deepEqual(two.map((x) => x.id), ['duo.two@2026-11-20T10:00#0', 'duo.two@2026-11-20T10:00#1']);
  assert.equal(plan(evs, NOW, S, { max: 5 }).length, 5);
});

test('planNotifications: 同時刻は id 順・冪等（同じ入力は同じ結果）', () => {
  const evs = ['b', 'a', 'c'].map((id) => al({ id, s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [{ before: 30 }] }));
  const a = plan(evs), b = plan([...evs].reverse());
  assert.deepEqual(a.map((x) => x.eventId), ['a', 'b', 'c']);
  assert.deepEqual(a, b); assert.deepEqual(plan(evs), a);
  assert.equal(a[0].thread, 'duo.2026-11-20'); assert.equal(a[0].day, '2026-11-20');
});

test('planNotifications: 繰り返し（exdates・移動・alarms 継承・[]と未定義）', () => {
  const p = ev('r', '2026-11-16T10:00', '2026-11-16T11:00', R('daily', { count: 5 }), {
    alarms: [{ before: 30 }], exdates: ['2026-11-17T10:00'],
    overrides: {
      '2026-11-18T10:00': { title: '移動', categoryId: 'c-work', all: false, start: '2026-11-18T15:00', end: '2026-11-18T16:00', place: '', notes: '', alarms: [{ before: 5 }] },
      '2026-11-19T10:00': { title: 'なし', categoryId: 'c-work', all: false, start: '2026-11-19T10:00', end: '2026-11-19T11:00', place: '', notes: '', alarms: [] },
      '2026-11-20T10:00': { title: '継承', categoryId: 'c-work', all: false, start: '2026-11-20T10:00', end: '2026-11-20T11:00', place: '', notes: '', alarms: null },
    },
  });
  const got = plan([p]);
  assert.deepEqual(got.map((x) => [x.id, x.fireDate]), [
    ['duo.r@2026-11-16T10:00#0', '2026-11-16T09:30'],
    ['duo.r@2026-11-18T10:00#0', '2026-11-18T14:55'],
    ['duo.r@2026-11-20T10:00#0', '2026-11-20T09:30'],
  ]);
  assert.equal(got[1].day, '2026-11-18'); assert.equal(got[1].eventId, 'r');
  assert.equal(plan([{ ...p, alarms: undefined, overrides: {} }]).length, 0);
});

test('planNotifications: origin iphone／linked／pending は除外、unlinked は対象（繰り返しの親でも）', () => {
  const base = { s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [{ before: 30 }] };
  const evs = [
    al({ id: 'ip', ...base, extra: { origin: 'iphone' } }),
    al({ id: 'li', ...base, extra: { nativeLink: { state: 'linked' } } }),
    al({ id: 'pe', ...base, extra: { nativeLink: { state: 'pending' } } }),
    al({ id: 'un', ...base, extra: { nativeLink: { state: 'unlinked' } } }),
    al({ id: 'rl', ...base, rec: R('daily', { count: 3 }), extra: { nativeLink: { state: 'linked' } } }),
    al({ id: 'ru', ...base, rec: R('daily', { count: 2 }), extra: { nativeLink: { state: 'unlinked' } } }),
  ];
  assert.deepEqual([...new Set(plan(evs).map((x) => x.eventId))].sort(), ['ru', 'un']);
});

test('planNotifications: 非表示カテゴリも対象、終日の1週間前は37日先まで見る', () => {
  const h = al({ id: 'h', s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [{ before: 0 }], extra: { categoryId: 'hidden-cat' } });
  const far = al({ id: 'far', s: '2026-12-21T00:00', e: '2026-12-21T23:59', alarms: [{ day: 7, at: '08:00' }, { day: 0, at: '08:00' }], extra: { all: true } });
  const got = plan([h, far]);
  assert.deepEqual(got.map((x) => x.id), ['duo.h@2026-11-20T10:00#0', 'duo.far@2026-12-21T00:00#0', 'duo.refresh']); // 当日 08:00 の通知は窓外
  assert.equal(got[1].fireDate, '2026-12-14T08:00');
});

test('notifyText: 文面（02 §3）', () => {
  const t = { all: false, title: 'プロジェクト定例', start: '2026-11-13T10:00', end: '2026-11-13T11:00', place: '会議室A' };
  assert.deepEqual(notifyText(t, { before: 30 }), { title: '30分後：プロジェクト定例', body: '10:00〜11:00 ・ 会議室A' });
  assert.equal(notifyText(t, { before: 0 }).title, '開始：プロジェクト定例');
  assert.equal(notifyText(t, { before: 60 }).title, '1時間後：プロジェクト定例');
  assert.deepEqual(notifyText(t, { before: 1440 }), { title: '明日：プロジェクト定例', body: '11月13日（金）10:00〜11:00 ・ 会議室A' });
  assert.equal(notifyText(t, { before: 2880 }).title, '明後日：プロジェクト定例');
  assert.equal(notifyText({ ...t, place: '' }, { before: 30 }).body, '10:00〜11:00');
  const a = { all: true, title: '秋のゴルフ合宿', start: '2026-11-13T00:00', end: '2026-11-15T23:59', place: '' };
  assert.deepEqual(notifyText(a, { day: 0, at: '08:00' }), { title: '今日：秋のゴルフ合宿', body: '終日（〜11月15日（日））' });
  assert.deepEqual(notifyText(a, { day: 1, at: '08:00' }), { title: '明日：秋のゴルフ合宿', body: '終日 ・ 11月13日（金）〜15日（日）' });
  assert.equal(notifyText(a, { day: 7, at: '08:00' }).title, '1週間後：秋のゴルフ合宿');
  assert.equal(notifyText({ ...a, end: '2026-11-13T23:59' }, { day: 0, at: '08:00' }).body, '終日');
});

test('notifyText: showTitle:false は予定名・場所なし、41文字→40文字＋…', () => {
  const t = { all: false, title: 'ひみつ会議', start: '2026-11-13T10:00', end: '2026-11-13T11:00', place: '会議室A' };
  const x = notifyText(t, { before: 30 }, false);
  assert.deepEqual(x, { title: '予定があります', body: '30分後 ・ 10:00〜11:00' });
  assert.ok(!JSON.stringify(x).includes('ひみつ') && !JSON.stringify(x).includes('会議室'));
  const n = (k) => notifyText({ ...t, title: 'あ'.repeat(k) }, { before: 30 }).title;
  assert.equal(n(40), `30分後：${'あ'.repeat(40)}`);
  assert.equal(n(41), `30分後：${'あ'.repeat(40)}…`);
  const items = plan([al({ id: 'x', s: '2026-11-20T10:00', e: '2026-11-20T11:00', alarms: [{ before: 30 }], extra: { title: 'ひみつ', place: '本社' } })], NOW, { showTitle: false });
  assert.ok(!JSON.stringify(items).includes('ひみつ') && !JSON.stringify(items).includes('本社'));
});

test('性能: 1万件で 100ms 目安', () => {
  const evs = Array.from({ length: 10000 }, (_, i) => al({ id: `p${i}`, s: `2026-11-${String(15 + (i % 14)).padStart(2, '0')}T10:00`, e: `2026-11-${String(15 + (i % 14)).padStart(2, '0')}T11:00`, alarms: [{ before: 30 }] }));
  const t0 = performance.now(); const got = plan(evs); const ms = performance.now() - t0;
  assert.equal(got.length, 60);
  assert.ok(ms < 250, `${ms}ms`); // 目安100ms、CI のぶれに余裕
  const rec = manyRecurring().map((e) => ({ ...e, alarms: [{ before: 30 }] }));
  const t1 = performance.now(); assert.equal(plan(rec).length, 60); assert.ok(performance.now() - t1 < 250);
});

test('validateDraft: alarms の検証と undefined 保持', () => {
  const f = { title: 't', categoryId: 'c-work', start: '2026/11/20 10:00', end: '2026/11/20 11:00' };
  assert.equal('alarms' in validateDraft(f).event, false);
  assert.deepEqual(validateDraft({ ...f, alarms: [] }).event.alarms, []);
  assert.deepEqual(validateDraft({ ...f, alarms: [{ before: 30 }, { before: 5 }] }).event.alarms, [{ before: 30 }, { before: 5 }]);
  for (const bad of [[{ before: 7 }], [{ before: 5 }, { before: 10 }, { before: 15 }], 'x', [{ day: 9, at: '08:00' }]]) assert.ok(validateDraft({ ...f, alarms: bad }).error, JSON.stringify(bad));
});

test('backup: 設定の既定を未保存でも書き出し、alarms が往復する', () => {
  const bk = buildBackup([], { view: 'month', style: 'simple', desk: false });
  assert.deepEqual(bk.settings.notify, { enabled: false, showTitle: true, defaultTimed: null, defaultAllDay: null });
  assert.equal(alarmsOk([{ before: 0 }, { day: 7, at: '08:00' }]), true);
  const e = ev('A', '2026-11-20T10:00', '2026-11-20T11:00', null, { alarms: [{ before: 1440 }, { before: 0 }] });
  const v = validateBackup(JSON.stringify(buildBackup([e], { view: 'month', style: 'simple' }, new Date(), [{ id: 'c-work', name: '仕事', color: '#2f5f8a', order: 0, hidden: false, createdAt: 1, updatedAt: 2 }])));
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.events[0].alarms, [{ before: 1440 }, { before: 0 }]);
});

test('planNotifications: 31日×通知2つ → 近い順60件で補充後も同じ順序（前面発火後の再計画）', () => {
  const evs = Array.from({ length: 31 }, (_, i) => al({ id: `d${String(i).padStart(2, '0')}`, s: `2026-11-${String(15 + i > 30 ? 30 : 15 + i).padStart(2, '0')}T10:00`, e: '2026-11-30T23:00', alarms: [{ before: 30 }, { before: 5 }] }));
  const got = plan(evs);
  assert.equal(got.length, 60);
  assert.deepEqual(got.map((x) => x.fireDate), [...got.map((x) => x.fireDate)].sort());
  // 最初の通知が鳴った後（時刻が進む）の再計画で、次の通知が繰り上がって60件に補充される
  const later = plan(evs, new Date(2026, 10, 15, 9, 31));
  assert.equal(later.length, 60);
  assert.ok(!later.some((x) => x.fireDate === got[0].fireDate));
});

// ---- PR36: 最後のお知らせ duo.refresh ----
const one = (id, s) => al({ id, s, e: s, alarms: [{ before: 0 }] });
const many = (n) => Array.from({ length: n }, (_, i) => one(`e${String(i).padStart(3, '0')}`, `2026-11-${String(15 + (i % 10)).padStart(2, '0')}T${String(10 + (i % 5)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`));

test('PR36 60/61境界：60件ちょうどは実通知だけ、61件は59実件＋refresh（最後の実通知の1分後）', () => {
  const r60 = planR(many(60));
  assert.equal(r60.items.length, 60); assert.equal(r60.truncated, false);
  assert.ok(!r60.items.some((x) => x.id === 'duo.refresh'));
  const r61 = planR(many(61));
  assert.equal(r61.items.length, 60); assert.equal(r61.truncated, true);
  const real = r61.items.slice(0, 59), rf = r61.items[59];
  assert.ok(real.every((x) => x.id !== 'duo.refresh'));
  assert.deepEqual(real, planR(many(61), NOW, S, { max: 100 }).items.slice(0, 59)); // 近い順の先頭59件
  const lastFire = real[58].fireDate, d = new Date(lastFire); // ローカル解釈
  assert.equal(rf.id, 'duo.refresh');
  const t = new Date(+lastFire.slice(0, 4), +lastFire.slice(5, 7) - 1, +lastFire.slice(8, 10), +lastFire.slice(11, 13), +lastFire.slice(14, 16) + 1);
  assert.equal(rf.fireDate, `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`);
  assert.ok(d);
  assert.deepEqual([rf.title, rf.body, rf.eventId, rf.day, rf.thread], ['Duo カレンダーを開いてください', 'この先の予定の通知を受け取るには、アプリを開いて通知を更新してください。', '', rf.fireDate.slice(0, 10), `duo.${rf.fireDate.slice(0, 10)}`]);
  assert.deepEqual(Object.keys(rf).sort(), ['body', 'day', 'eventId', 'fireDate', 'id', 'thread', 'title']);
});

test('PR36 60件ちょうど＋窓外あり → 59実件＋refresh', () => {
  const r = planR([...many(60), one('far', '2026-12-20T10:00')]);
  assert.equal(r.items.length, 60); assert.equal(r.truncated, true); assert.equal(r.items[59].id, 'duo.refresh');
});

test('PR36 窓だけで切れる：refresh は30日後の9:00（最後の実通知より後）', () => {
  const r = planR([one('a', '2026-11-20T10:00'), one('far', '2026-12-20T10:00')]);
  assert.deepEqual(r.items.map((x) => x.id), ['duo.a@2026-11-20T10:00#0', 'duo.refresh']);
  assert.equal(r.items[1].fireDate, '2026-12-14T09:00'); assert.equal(r.items[1].day, '2026-12-14');
  assert.equal(r.truncated, true);
  // 実通知が0件でも窓外があれば refresh だけ
  assert.deepEqual(planR([one('far', '2026-12-20T10:00')]).items.map((x) => x.id), ['duo.refresh']);
});

test('PR36 窓外の判定：有限の繰返し・無限の繰返し・例外・終わった繰返し', () => {
  const ids = (evs) => planR(evs).items.map((x) => x.id).includes('duo.refresh');
  const rec = (id, rule, x = {}) => al({ id, s: '2026-11-16T10:00', e: '2026-11-16T11:00', rec: rule, alarms: [{ before: 30 }], extra: x });
  assert.equal(ids([rec('f1', R('daily', { count: 5 }))]), false);        // 窓内で終わる
  assert.equal(ids([rec('f2', R('daily', { until: '2026-12-10' }))]), false);
  assert.equal(ids([rec('f3', R('daily', { count: 60 }))]), true);        // 窓の先まで続く
  assert.equal(ids([rec('f4', R('weekly', { byDay: [1], until: '2027-01-31' }))]), true);
  assert.equal(ids([rec('inf', R('daily'))]), true);                      // 無限
  assert.equal(ids([{ ...rec('inf2', R('daily')), alarms: [] }]), false); // 無限でも通知なし
  assert.equal(ids([{ ...rec('inf3', R('daily')), alarms: undefined }]), false);
  // 例外：窓外へ移した回に通知があれば真、通知なしの移動・削除だけなら偽
  const mv = { title: 'm', categoryId: 'c-work', all: false, start: '2027-01-05T10:00', end: '2027-01-05T11:00', place: '', notes: '', alarms: [{ before: 5 }] };
  assert.equal(ids([rec('o1', R('daily', { count: 3 }), { overrides: { '2026-11-17T10:00': mv } })]), true);
  assert.equal(ids([rec('o2', R('daily', { count: 3 }), { overrides: { '2026-11-17T10:00': { ...mv, alarms: [] } } })]), false);
  assert.equal(ids([rec('o3', R('daily', { count: 3 }), { exdates: ['2026-11-17T10:00'] })]), false);
  // 窓外の単発：通知なしは偽、除外（linked）は偽
  assert.equal(ids([al({ id: 's', s: '2026-12-20T10:00', e: '2026-12-20T11:00', alarms: [] })]), false);
  assert.equal(ids([al({ id: 'l', s: '2026-12-20T10:00', e: '2026-12-20T11:00', alarms: [{ before: 0 }], extra: { nativeLink: { state: 'linked' } } })]), false);
});

test('PR36 作らない：通知オフ・全部過去・なし・iPhone由来／pending', () => {
  const evs = [...many(61), one('far', '2026-12-20T10:00')];
  assert.deepEqual(planR(evs, NOW, { enabled: false }), { items: [], truncated: false });
  assert.deepEqual(planR([]), { items: [], truncated: false });
  assert.deepEqual(planR([one('p', '2026-11-01T10:00')]), { items: [], truncated: false });
  assert.deepEqual(planR([al({ id: 'i', s: '2026-12-20T10:00', e: '2026-12-20T11:00', alarms: [{ before: 0 }], extra: { origin: 'iphone' } }), al({ id: 'pe', s: '2026-12-20T10:00', e: '2026-12-20T11:00', alarms: [{ before: 0 }], extra: { nativeLink: { state: 'pending' } } })]), { items: [], truncated: false });
});

test('PR36 showTitle:false でも refresh の文面は同じ・max指定は max-1＋1', () => {
  const r = planR(many(61), NOW, { ...S, showTitle: false });
  assert.equal(r.items[59].title, 'Duo カレンダーを開いてください');
  assert.equal(planR(many(61), NOW, S, { max: 5 }).items.length, 5);
});

test('PR36 再計画で refresh は作り直され、近づくと実通知に置き換わる', () => {
  const evs = many(61);
  const a = planR(evs).items, b = planR(evs, new Date(2026, 10, 16, 9, 0)).items;
  assert.equal(a.filter((x) => x.id === 'duo.refresh').length, 1);
  assert.equal(b.filter((x) => x.id === 'duo.refresh').length, b.length === 60 && planR(evs, new Date(2026, 10, 16, 9, 0)).truncated ? 1 : 0);
});

// ---------- タスクの通知（第16版 PR21） ----------
const TK = (id, due, o = {}) => ({ id, title: `タスク${id}`, due, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: true, ...o });

test('タスク通知: 時刻ありは期限ちょうど、日付だけは当日8時。ID・eventId・dayの形', () => {
  const r = planR([], NOW, S, { tasks: [TK('a', { date: '2026-11-15', time: '13:30' }), TK('b', { date: '2026-11-16' })] });
  assert.deepEqual(r.items.map((i) => [i.id, i.fireDate, i.eventId, i.day]), [
    ['duo.task.a', '2026-11-15T13:30', 'task:a', '2026-11-15'],
    ['duo.task.b', '2026-11-16T08:00', 'task:b', '2026-11-16'],
  ]);
  assert.equal(r.truncated, false);
  assert.match(r.items[0].title, /タスクa/);
});

test('タスク通知: 対象外（notify偽・完了・期限なし・過去・31日先・全体OFF）は0。showTitle:falseは題名を出さない', () => {
  const tasks = [
    TK('off', { date: '2026-11-15' }, { notify: false }), TK('done', { date: '2026-11-15' }, { done: true, doneAt: '2026-11-14T09:00' }),
    TK('nodue', null), TK('past', { date: '2026-11-14', time: '08:59' }), TK('far', { date: '2026-12-20' }),
  ];
  assert.deepEqual(plan([], NOW, S, { tasks }).map((i) => i.id), ['duo.refresh']); // 実通知は0。窓の外のタスクがあるので更新用だけ
  assert.equal(planR([], NOW, normNotify({ enabled: false }), { tasks: [TK('x', { date: '2026-11-15' })] }).items.length, 0);
  const hid = plan([], NOW, normNotify({ enabled: true, showTitle: false }), { tasks: [TK('x', { date: '2026-11-15' }, { title: '秘密' })] })[0];
  assert.ok(!hid.title.includes('秘密') && !hid.body.includes('秘密'));
  assert.equal(plan([], NOW, S, { tasks: [TK('edge', { date: '2026-11-14', time: '09:00' })] }).length, 0); // 今ちょうどは過去
});

test('タスク通知: 予定IDと衝突しない（予定の id が task.x でも別）', () => {
  const r = plan([al({ id: 'task.a', s: '2026-11-15T10:00', e: '2026-11-15T11:00', alarms: [{ before: 30 }] })], NOW, S, { tasks: [TK('a', { date: '2026-11-15', time: '10:00' })] });
  assert.equal(new Set(r.map((i) => i.id)).size, 2);
});

test('タスク通知: 予定とタスク合わせて近い順の59件＋refresh（61件以上）', () => {
  const evs = Array.from({ length: 35 }, (_, i) => al({ id: `e${i}`, s: `2026-11-15T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, e: `2026-11-15T23:59`, alarms: [{ before: 0 }] }));
  const tasks = Array.from({ length: 30 }, (_, i) => TK(`t${i}`, { date: '2026-11-16', time: `${String(i % 24).padStart(2, '0')}:${String(i).padStart(2, '0')}` }));
  const r = planR(evs, NOW, S, { tasks });
  assert.equal(r.items.length, 60); assert.equal(r.truncated, true);
  assert.equal(r.items.at(-1).id, 'duo.refresh');
  const real = r.items.slice(0, 59);
  assert.deepEqual(real.map((i) => i.fireDate), [...real.map((i) => i.fireDate)].sort());
  assert.ok(real.filter((i) => i.id.startsWith('duo.task.')).length > 0 && real.filter((i) => !i.id.startsWith('duo.task.')).length > 0);
  // ちょうど60件なら refresh なし
  const r60 = planR(evs.slice(0, 30), NOW, S, { tasks });
  assert.equal(r60.items.length, 60); assert.equal(r60.truncated, false);
});

test('タスク通知: 窓の外のタスクだけがあれば refresh を足す', () => {
  const r = planR([], NOW, S, { tasks: [TK('n', { date: '2026-11-15' }), TK('f', { date: '2026-12-20' })] });
  assert.equal(r.truncated, true); assert.equal(r.items.at(-1).id, 'duo.refresh');
});
