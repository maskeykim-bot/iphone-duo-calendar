import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, contentKey, planAppend, planTasks, stripRuntime, validateBackup, VERSION } from '../js/backup.js';
import { CAT_IDS, DEFAULTS_NEW, UNCATEGORIZED } from '../js/categories.js';
import { R, ev } from './fixtures.mjs';

const settings = { view: 'month', style: 'simple', desk: false };
const cat = (id, name, order = 0) => ({ id, name, color: '#2f5f8a', order, hidden: false, createdAt: 1, updatedAt: 2 });
const cats = [cat('c-work', '仕事', 0), cat('c-fam', '家族', 1)];
const file = (o) => JSON.stringify({ app: 'duo-calendar', version: 3, exportedAt: '2026-11-14T10:00:00+09:00', ...o });
const roundtrip = (events, extra = {}) => validateBackup(JSON.stringify(buildBackup(events, { ...settings, ...extra }, new Date(), cats)), { categories: cats });

const link = { v: 2, state: 'linked', requestId: 'r1', itemId: 'I1', externalId: 'X1', ekIdentifier: 'X1@2026-11-20T10:00', calendarId: 'C1', eventId: 'E1', syncedAt: 1763000000000, warn: null };
// 全項目を持つ予定（未知の項目・個別変更の alarms を含む）。
const full = () => ev('F', '2026-11-02T10:00', '2026-11-02T11:00', R('weekly', { byDay: [1], until: '2027-03-01' }), {
  alarms: [{ before: 30 }], nativeLink: link, strokes: { placeholder: true, pts: [1, 2, 3] }, futureFlag: 'x', updatedAt: 1763000000123,
  place: '本社', notes: 'メモ', exdates: ['2026-11-09T10:00'],
  overrides: { '2026-11-16T10:00': { title: '変更', categoryId: 'c-fam', all: false, start: '2026-11-16T14:00', end: '2026-11-16T15:00', place: '', notes: '', alarms: [{ before: 10 }, { before: 60 }], extra: { a: 1 } } },
});

const DP = { left: 'home', right: 'month', portraitBottom: 'time', portraitShown: false };
test('バージョンは 5、schema と settings の形', () => {
  const bk = buildBackup([], { ...settings, monthExpand: true, notify: { enabled: true, showTitle: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' } } }, new Date(), cats);
  assert.equal(bk.version, VERSION); assert.equal(VERSION, 5); assert.equal(bk.schema, 5);
  assert.deepEqual(bk.settings, { view: 'month', style: 'simple', desk: false, monthExpand: true, rokuyo: true, holidayRed: true, pages: DP, notify: { enabled: true, showTitle: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' } } });
  assert.equal(bk.categories.length, 2);
});

test('設定の通知: 既定 null と旧オブジェクトの両方を通す', () => {
  const n = { enabled: true, showTitle: false, defaultTimed: null, defaultAllDay: null };
  assert.deepEqual(roundtrip([], { view: 'month', style: 'simple', notify: n }).data.settings.notify, n);
  const old = { enabled: true, showTitle: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' } };
  assert.deepEqual(roundtrip([], { view: 'month', style: 'simple', notify: old }).data.settings.notify, old);
});

test('全項目を持つ予定の往復で項目が一つも落ちない（nativeLink 往復の回帰を含む）', () => {
  const src = full();
  const v = roundtrip([src, ev('plain', '2026-11-20T10:00', '2026-11-20T11:00', null)]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.events[0], src);
  assert.deepEqual(v.data.events[0].nativeLink, link);
  assert.deepEqual(v.data.events[0].overrides['2026-11-16T10:00'].alarms, [{ before: 10 }, { before: 60 }]);
  assert.deepEqual(v.report, { dropped: 0, fallbackCount: 0, legacyAdded: 0, retargeted: 0, ink: 0 });
});

test('nativeLink が書き出しにも読み込みにも残る（v2 では落ちていた）', () => {
  const linked = ev('L', '2026-11-20T10:00', '2026-11-20T11:00', null, { nativeLink: { state: 'linked', requestId: 'r1', eventId: 'E1', calendarId: 'C' } });
  const bk = buildBackup([linked], settings);
  assert.deepEqual(bk.events[0].nativeLink, linked.nativeLink);
  assert.deepEqual(validateBackup(JSON.stringify(bk)).data.events[0].nativeLink, linked.nativeLink);
});

test('表示用の項目（recurring / occKey / parentId / moved / origin）は書き出さない', () => {
  const o = stripRuntime({ ...ev('a', '2026-11-20T10:00', '2026-11-20T11:00', null), recurring: true, occKey: 'k', parentId: 'p', moved: true, origin: 'ip' });
  for (const k of ['recurring', 'occKey', 'parentId', 'moved', 'origin']) assert.equal(k in o, false);
  assert.equal(buildBackup([{ ...ev('a', '2026-11-20T10:00', '2026-11-20T11:00', null), occKey: 'k' }], settings).events[0].occKey, undefined);
});

test('設定の往復（view/style/desk/monthExpand/notify）。未知のキーは無視', () => {
  const notify = { enabled: false, showTitle: true, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '09:30' } };
  const v = roundtrip([], { view: 'week', style: 'named', desk: true, monthExpand: true, weekStart: 0, notify });
  assert.deepEqual(v.data.settings, { view: 'week', style: 'named', desk: true, monthExpand: true, rokuyo: true, holidayRed: true, pages: DP, weekStart: 0, notify });
  const w = validateBackup(file({ events: [], settings: { view: 'day', weekStart: 1, bogus: 1 } }));
  assert.deepEqual(w.data.settings, { view: 'day', weekStart: 1 });
  assert.equal(validateBackup(file({ events: [], settings: { weekStart: 2 } })).ok, false);
  assert.equal(validateBackup(file({ events: [], settings: { monthExpand: 'yes' } })).ok, false);
  assert.equal(validateBackup(file({ events: [], settings: { notify: { defaultTimed: { before: 7 } } } })).ok, false);
});

test('カテゴリの往復（hidden・未知の項目を含む）', () => {
  const c = [{ ...cat('c-work', '仕事'), hidden: true, future: 1 }, cat('c-fam', '家族', 1)];
  const v = validateBackup(JSON.stringify(buildBackup([], settings, new Date(), c)));
  assert.deepEqual(v.data.categories, c);
});

test('__proto__ を含む JSON を読んでも Object.prototype が汚染されない', () => {
  const text = file({ categories: cats, events: [{ ...ev('p', '2026-11-20T10:00', '2026-11-20T11:00', null), '__proto__': { polluted: 1 }, nativeLink: { state: 'linked', '__proto__': { polluted: 2 } }, strokes: JSON.parse('{"__proto__":{"polluted":3},"ok":1}') }] }).replace('"events":[{', '"events":[{"__proto__":{"polluted":4},');
  const v = validateBackup(text, { categories: cats });
  assert.equal(v.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(v.data.events[0], '__proto__'), false);
  assert.equal(v.data.events[0].strokes.ok, 1);
  assert.equal(Object.hasOwn(v.data.events[0].strokes, '__proto__'), false);
});

test('v2 ファイル: cat を固定 id へ。旧ゴルフ・経済指標は「その他」へ。未知の cat は未分類', () => {
  const body = (id, c) => ({ ...ev(id, '2026-11-20T10:00', '2026-11-20T11:00', null), categoryId: undefined, cat: c });
  const t = JSON.stringify({ app: 'duo-calendar', version: 2, exportedAt: '2026-11-12T09:41:00+09:00', events: [body('a', 'economy'), body('b', 'golf'), body('c', 'xxx')], settings: { view: 'month', style: 'simple', desk: false } });
  const v = validateBackup(t, { categories: [] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.events.map((e) => e.categoryId), [CAT_IDS.other, CAT_IDS.other, CAT_IDS.none]);
  assert.equal(v.data.events.some((e) => 'cat' in e), false);
  assert.deepEqual(v.data.categories.map((c) => c.name).sort(), ['その他', '未分類'].sort());
  assert.equal(v.report.legacyAdded, 0); assert.equal(v.report.retargeted, 2); assert.equal(v.report.fallbackCount, 1);
  // 現在の DB に既にあるなら追加予定に入れない
  const w = validateBackup(t, { categories: [{ id: CAT_IDS.other }, { id: CAT_IDS.none }] });
  assert.equal(w.data.categories.length, 0);
});

test('v2 の個別変更の cat も変換される。v1 も受理する', () => {
  const e = ev('r', '2026-11-02T10:00', '2026-11-02T11:00', R('weekly', { byDay: [1] }), { categoryId: undefined, cat: 'work', overrides: { '2026-11-09T10:00': { title: 'x', cat: 'private', all: false, start: '2026-11-09T10:00', end: '2026-11-09T11:00' } } });
  const v = validateBackup(JSON.stringify({ app: 'duo-calendar', version: 1, exportedAt: '2026-11-12T09:41:00+09:00', events: [e] }));
  assert.equal(v.ok, true); assert.equal(v.data.version, 1);
  assert.equal(v.data.events[0].categoryId, CAT_IDS.work);
  assert.equal(v.data.events[0].overrides['2026-11-09T10:00'].categoryId, CAT_IDS.private);
  assert.equal('cat' in v.data.events[0].overrides['2026-11-09T10:00'], false);
});

test('v3 で未知の categoryId → 未分類＋fallbackCount（現在の DB にある id は保つ）', () => {
  const evs = [ev('a', '2026-11-20T10:00', '2026-11-20T11:00', null, { categoryId: 'nowhere' }), ev('b', '2026-11-21T10:00', '2026-11-21T11:00', null, { categoryId: 'only-current' }), ev('c', '2026-11-22T10:00', '2026-11-22T11:00', null, { categoryId: 'c-work' })];
  const v = validateBackup(file({ categories: cats, events: evs }), { categories: [{ id: 'only-current' }] });
  assert.deepEqual(v.data.events.map((e) => e.categoryId), [CAT_IDS.none, 'only-current', 'c-work']);
  assert.equal(v.report.fallbackCount, 1);
  assert.ok(v.data.categories.some((c) => c.id === UNCATEGORIZED.id));
});

test('カテゴリ id 重複は拒否。51 件以上も拒否', () => {
  assert.equal(validateBackup(file({ categories: [cat('x', 'a'), cat('x', 'b')], events: [] })).ok, false);
  assert.equal(validateBackup(file({ categories: Array.from({ length: 51 }, (_, i) => cat('i' + i, 'n' + i)), events: [] })).ok, false);
});

test('不正な alarms / nativeLink はその項目だけ捨てて予定は読み込む（report.dropped）', () => {
  const bad = { ...ev('a', '2026-11-20T10:00', '2026-11-20T11:00', null, { categoryId: 'c-work' }), alarms: [{ before: 7 }], nativeLink: { state: 'weird' }, keep: 1 };
  const three = { ...ev('b', '2026-11-21T10:00', '2026-11-21T11:00', null, { categoryId: 'c-work' }), alarms: [{ before: 5 }, { before: 10 }, { before: 15 }] };
  const ok = { ...ev('c', '2026-11-22T10:00', '2026-11-22T11:00', null, { categoryId: 'c-work' }), alarms: [] };
  const v = validateBackup(file({ categories: cats, events: [bad, three, ok] }));
  assert.equal(v.ok, true); assert.equal(v.data.events.length, 3);
  assert.equal('alarms' in v.data.events[0], false); assert.equal('nativeLink' in v.data.events[0], false);
  assert.equal(v.data.events[0].keep, 1);
  assert.equal('alarms' in v.data.events[1], false);
  assert.deepEqual(v.data.events[2].alarms, []);
  assert.equal(v.report.dropped, 3);
});

test('planAppend: 別 id・同じ requestId → 重複、別 id・同じ ekIdentifier → 重複、同 id・別内容 → 競合', () => {
  const base = ev('A', '2026-11-20T10:00', '2026-11-20T11:00', null, { nativeLink: { v: 2, state: 'linked', requestId: 'r1', ekIdentifier: 'X@2026-11-20T10:00' } });
  const cur = [base];
  const byReq = { ...base, id: 'B', title: '内容も違う', nativeLink: { state: 'linked', requestId: 'r1' } };
  const byEk = { ...base, id: 'C', title: 'これも違う', nativeLink: { v: 2, state: 'linked', requestId: 'r9', ekIdentifier: 'X@2026-11-20T10:00' } };
  const conflict = { ...base, title: '書き換え案' };
  const fresh = ev('D', '2026-12-01T10:00', '2026-12-01T11:00', null, { nativeLink: { state: 'linked', requestId: 'r2', ekIdentifier: 'Y@x' } });
  const p = planAppend(cur, [byReq, byEk, conflict, fresh]);
  assert.deepEqual({ dup: p.dup, conflict: p.conflict, add: p.add.map((e) => e.id) }, { dup: 2, conflict: 1, add: ['D'] });
});

test('planAppend: 同じファイルを2回読み込んでも二重にならない（連携あり・個別変更あり・alarms の順序違い）', () => {
  const a = full(), b = ev('P', '2026-11-20T10:00', '2026-11-20T11:00', null, { alarms: [{ before: 30 }, { before: 5 }] });
  const text = JSON.stringify(buildBackup([a, b], settings, new Date(), cats));
  const first = validateBackup(text, { categories: cats }).data.events;
  const p1 = planAppend([], first);
  assert.equal(p1.add.length, 2);
  const second = validateBackup(text, { categories: cats }).data.events;
  const p2 = planAppend(p1.add, second);
  assert.equal(p2.add.length, 0); assert.equal(p2.dup, 2); assert.equal(p2.conflict, 0);
  // 別 id でファイルを読み直しても、連携が同じなら二重にならない。alarms の順序は無関係
  const renamed = { ...first[0], id: 'NEW-ID', updatedAt: 5 };
  assert.equal(planAppend(p1.add, [renamed]).dup, 1);
  assert.equal(contentKey({ ...b, alarms: [{ before: 5 }, { before: 30 }] }), contentKey(b));
});

test('planAppend: ファイル内の重複（同じ連携の2件）も1件だけ追加', () => {
  const l = (id) => ev(id, '2026-11-20T10:00', '2026-11-20T11:00', null, { title: id, nativeLink: { state: 'linked', requestId: 'same' } });
  assert.equal(planAppend([], [l('x'), l('y')]).add.length, 1);
});

test('終了日より後の個別変更キーは捨てられ report.dropped=1（probe_recur overrideBeyondUntil の回帰）', () => {
  const ov = (k) => ({ title: 'ghost', categoryId: 'c-work', all: false, start: k, end: k.slice(0, 11) + '11:00' });
  const e = ev('f', '2026-01-05T10:00', '2026-01-05T11:00', R('weekly', { byDay: [1], until: '2026-01-10' }), { overrides: { '2026-01-12T10:00': ov('2026-01-12T10:00'), '2026-01-05T10:00': ov('2026-01-05T10:00') } });
  const v = validateBackup(file({ categories: cats, events: [e] }));
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.data.events[0].overrides), ['2026-01-05T10:00']);
  assert.equal(v.report.dropped, 1);
  // 回数指定: 回数を超えるキー、系列に無い曜日のキー
  const c = ev('g', '2026-01-05T10:00', '2026-01-05T11:00', R('weekly', { byDay: [1], count: 2 }), { overrides: { '2026-01-12T10:00': ov('2026-01-12T10:00'), '2026-01-19T10:00': ov('2026-01-19T10:00'), '2026-01-13T10:00': ov('2026-01-13T10:00') } });
  const w = validateBackup(file({ categories: cats, events: [c] }));
  assert.deepEqual(Object.keys(w.data.events[0].overrides), ['2026-01-12T10:00']);
  assert.equal(w.report.dropped, 2);
});

test('version: 6 → 拒否、1 → 受理、未知のトップレベルキー（ink）は無視して件数だけ数える', () => {
  assert.equal(validateBackup(file({ version: 6, events: [] })).ok, false);
  assert.equal(validateBackup(JSON.stringify({ app: 'duo-calendar', version: 1, exportedAt: '2026-11-12T09:41:00+09:00', events: [] })).ok, true);
  const v = validateBackup(file({ events: [], ink: [{ a: 1 }, { a: 2 }], other: 1 }));
  assert.equal(v.ok, true); assert.equal(v.report.ink, 2);
});

test('カテゴリ欠落（categoryId も cat も無い）は拒否', () => {
  const e = { ...ev('a', '2026-11-20T10:00', '2026-11-20T11:00', null), categoryId: undefined };
  assert.equal(validateBackup(file({ events: [e] })).ok, false);
});

test('既定カテゴリ（新規インストール）だけで書き出した v3 が往復する', () => {
  const c = DEFAULTS_NEW.map((d, i) => ({ ...d, order: i, hidden: false, createdAt: 1, updatedAt: 1 }));
  const v = validateBackup(JSON.stringify(buildBackup([], settings, new Date(), c)));
  assert.equal(v.data.categories.length, 5);
});

test('「これ以降」で分けた2つの親（別の requestId）を2回追加読み込み → 2件とも残り、重複0', () => {
  const link = (r, e) => ({ v: 2, state: 'linked', requestId: r, calendarId: 'c', itemId: 'i', externalId: 'x', eventId: e, seriesStart: '2026-11-02T09:00' });
  const a = ev('p1', '2026-11-02T09:00', '2026-11-02T10:00', R('daily', { until: '2026-11-04' }), { nativeLink: link('rq-old', 'e1') });
  const b = ev('p2', '2026-11-05T09:00', '2026-11-05T10:00', R('daily'), { nativeLink: link('rq-new', 'e2') });
  const file = JSON.parse(JSON.stringify(buildBackup([a, b], {}, new Date(), [])));
  const res = validateBackup(JSON.stringify(file));
  assert.ok(res.ok);
  const p1 = planAppend([], res.data.events);
  assert.equal(p1.add.length, 2);
  const p2 = planAppend(p1.add, res.data.events);
  assert.equal(p2.add.length, 0);
  assert.equal(p2.skipped, 2);
  assert.notEqual(res.data.events[0].nativeLink.requestId, res.data.events[1].nativeLink.requestId);
});

test('nativeLink v2 の全項目（ekModified・matchedBy・seriesStart・warn:conflict・calName/calSource）が往復する', () => {
  const nl = { ...link, ekModified: 1763000000000, matchedBy: 'fallback', seriesStart: '2026-11-20T10:00', warn: 'conflict', calName: '家族', calSource: 'Google', fallbackDeleteConfirmed: true };
  const src = ev('N', '2026-11-20T10:00', '2026-11-20T11:00', null, { nativeLink: nl });
  const v = roundtrip([src]);
  assert.deepEqual(v.data.events[0].nativeLink, nl);
  assert.equal(v.report.dropped, 0);
  const bad = roundtrip([{ ...src, nativeLink: { ...nl, matchedBy: 'x' } }]);
  assert.equal(bad.data.events[0].nativeLink, undefined);
});
test('同じ ekIdentifier の予定は別 id・別 requestId でも追加の読み込みで重複になる', () => {
  const a = ev('A', '2026-11-20T10:00', '2026-11-20T11:00', null, { nativeLink: { ...link } });
  const b = ev('B', '2026-11-20T10:00', '2026-11-20T11:00', null, { title: '別名', nativeLink: { ...link, requestId: 'other' } });
  const p = planAppend([a], [b]);
  assert.equal(p.add.length, 0); assert.equal(p.dup, 1);
});

// ---------- v4: メモ・六曜・pages（第14版 PR10） ----------
import { planMemos } from '../js/backup.js';
const memo = (date, text, extra = {}) => ({ id: date, date, text, createdAt: 1000, updatedAt: 2000, ...extra });
const f4 = (o) => file({ version: 4, events: [], ...o });

test('v4: メモ・rokuyo・pages を書き出して往復する。タスクは空配列で出る', () => {
  const bk = buildBackup([], { ...settings, rokuyo: false, pages: { left: 'memo', right: 'month', portraitBottom: 'memo', portraitShown: true } }, new Date(), cats, [{ ...memo('2026-11-20', 'b'), ink: null }, memo('2026-11-02', 'a')]);
  assert.deepEqual(bk.memos.map((m) => m.date), ['2026-11-02', '2026-11-20']);
  assert.equal(bk.settings.rokuyo, false); assert.equal(bk.settings.pages.left, 'memo');
  assert.deepEqual(bk.tasks, []);
  const v = validateBackup(JSON.stringify(bk));
  assert.equal(v.ok, true); assert.equal(v.data.memos.length, 2); assert.equal(v.data.settings.rokuyo, false); assert.deepEqual(v.data.settings.pages, bk.settings.pages);
});

test('v1〜3 は memos なし(null)、v4 の空配列は [] （置換で消す）', () => {
  for (const version of [1, 2, 3]) assert.equal(validateBackup(file({ version, events: [], memos: [memo('2026-11-02', 'x')] })).data.memos, null);
  assert.equal(validateBackup(f4({})).data.memos, null);
  assert.deepEqual(validateBackup(f4({ memos: [] })).data.memos, []);
});

test('v4: rokuyo は全組合せ。不正はエラー、欠落は未指定（現在値保持）', () => {
  for (const r of [true, false]) assert.equal(validateBackup(f4({ settings: { rokuyo: r } })).data.settings.rokuyo, r);
  assert.equal(validateBackup(f4({ settings: { rokuyo: 'yes' } })).ok, false);
  assert.equal('rokuyo' in validateBackup(f4({ settings: { view: 'day' } })).data.settings, false);
  for (const left of ['home', 'month', 'time', 'task', 'memo']) for (const right of ['home', 'month', 'time', 'task', 'memo']) {
    if (left === right) continue;
    assert.equal(validateBackup(f4({ settings: { pages: { left, right, portraitBottom: 'task', portraitShown: true } } })).data.settings.pages.right, right);
  }
});

test('v4: pages が不正ならその設定だけ捨てる（他は読む）', () => {
  for (const pages of ['x', [], { left: 'zzz' }, { left: 'month', right: 'month' }, { portraitBottom: 'month' }, { portraitShown: 'yes' }]) {
    const v = validateBackup(f4({ settings: { view: 'day', pages } }));
    assert.equal(v.ok, true); assert.equal('pages' in v.data.settings, false); assert.equal(v.data.settings.view, 'day');
  }
});

test('v4: メモの不正は読み込み全体を拒否', () => {
  const bad = [
    memo('2026-13-40', 'x'), memo('2026-11-02', 'x', { id: '2026-11-03' }), memo('2026-11-02', ''), memo('2026-11-02', '  \n'), memo('2026-11-02', 5),
    memo('2026-11-02', 'x', { createdAt: 'a' }), memo('2026-11-02', 'x', { updatedAt: -1 }), memo('2026-11-02', 'x', { updatedAt: NaN }),
  ];
  for (const m of bad) assert.equal(validateBackup(f4({ memos: [memo('2026-11-01', 'ok'), m] })).ok, false);
  assert.equal(validateBackup(f4({ memos: [memo('2026-11-02', 'a'), memo('2026-11-02', 'b')] })).ok, false);
  assert.equal(validateBackup(f4({ memos: {} })).ok, false);
});

test('planMemos: 同日同文は追加なし、異文は空行で連結して1件、新しい日は追加', () => {
  const cur = [memo('2026-11-02', 'A', { createdAt: 5 })];
  const p = planMemos(cur, [memo('2026-11-02', 'A'), memo('2026-11-03', 'N')], 9);
  assert.deepEqual([p.same, p.added, p.merged], [1, 1, 0]);
  const q = planMemos(cur, [memo('2026-11-02', 'B')], 9);
  assert.equal(q.puts.length, 1); assert.equal(q.puts[0].text, 'A\n\nB'); assert.equal(q.puts[0].createdAt, 5); assert.equal(q.puts[0].updatedAt, 9);
  assert.equal(planAppend([], [], cur, [memo('2026-11-02', 'B')]).memo.merged, 1);
});

test('PR9: holidayRed は往復し、不正はエラー、欠落は未指定（現在値保持）', () => {
  const bk = buildBackup([], { ...settings, holidayRed: false }, new Date(), cats, []);
  assert.equal(bk.settings.holidayRed, false);
  assert.equal(validateBackup(JSON.stringify(bk)).data.settings.holidayRed, false);
  assert.equal(buildBackup([], { ...settings }, new Date(), cats, []).settings.holidayRed, true); // 欠落はオン
  assert.equal(validateBackup(f4({ settings: { holidayRed: 'x' } })).ok, false);
  assert.equal('holidayRed' in validateBackup(f4({ settings: { view: 'day' } })).data.settings, false);
});

// ---------- タスク（バックアップ v5） ----------
const T = (id, o = {}) => ({ id, title: `t-${id}`, due: null, done: false, doneAt: null, createdAt: 1000, updatedAt: 2000, order: 1, note: '', notify: false, ...o });
const TASKS = [T('b', { order: 2, due: { date: '2026-11-20', time: '10:07' }, notify: true }), T('a', { order: 1 }), T('c', { order: 3, done: true, doneAt: '2026-11-17T09:00', due: { date: '2026-11-18' }, note: 'メモ' })];
const v5 = (extra) => JSON.stringify({ app: 'duo-calendar', version: 5, exportedAt: '2026-11-17T10:00:00+09:00', events: [], ...extra });

test('v5: タスクは order→id の安定順で出て、往復で一致する', () => {
  const bk = buildBackup([], settings, new Date(), cats, [], [...TASKS].reverse());
  assert.deepEqual(bk.tasks.map((t) => t.id), ['a', 'b', 'c']);
  const r = validateBackup(JSON.stringify(bk));
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.data.tasks, bk.tasks);
  assert.deepEqual(r.data.tasks[1].due, { date: '2026-11-20', time: '10:07' }); assert.equal(r.data.tasks[1].notify, true);
  assert.equal(buildBackup([], settings, new Date(), cats).tasks.length, 0);
});

test('v5: tasks 欠落・旧版は null（現在を保持）、空配列は空（置換で空にする）', () => {
  assert.equal(validateBackup(v5({})).data.tasks, null);
  assert.equal(validateBackup(v5({ tasks: [] })).data.tasks.length, 0);
  assert.equal(validateBackup(JSON.stringify({ app: 'duo-calendar', version: 4, exportedAt: '2026-11-17T10:00:00+09:00', events: [], tasks: [T('x')] })).data.tasks, null);
});

test('v5: 不正なタスク 1 件で全体拒否', () => {
  for (const bad of [{ ...T('x'), title: '' }, { ...T('x'), due: { date: '2026-13-40' } }, { ...T('x'), done: 'yes' }, { ...T('x'), order: 'a' }, 5, { ...T('x'), id: '' }]) {
    assert.equal(validateBackup(v5({ tasks: [T('ok'), bad] })).ok, false);
  }
  assert.equal(validateBackup(v5({ tasks: [T('x'), T('x')] })).ok, false);
  assert.equal(validateBackup(v5({ tasks: {} })).ok, false);
});

test('v5: notes / folders 付きは全体拒否（黙って落とさない）', () => {
  assert.equal(validateBackup(v5({ notes: [] })).ok, false);
  assert.equal(validateBackup(v5({ folders: [], tasks: [] })).ok, false);
});

test('旧アプリ（v4 読取器）は v5 を丸ごと拒否する', () => {
  const old = (t) => { const o = JSON.parse(t); return o.app === 'duo-calendar' && [1, 2, 3, 4].includes(o.version); };
  assert.equal(old(JSON.stringify(buildBackup([], settings, new Date(), cats))), false);
});

test('planTasks: 同ID同内容は無操作、異内容は既存を残し決定的な別ID、再取込で重複しない', () => {
  const cur = [T('a'), T('b', { order: 2 })];
  const p = planTasks(cur, [T('a'), T('b', { order: 2, title: '違う' }), T('n', { order: 3 })]);
  assert.equal(p.same, 1); assert.equal(p.added, 2); assert.equal(p.renamed, 1);
  assert.ok(p.puts.every((t) => t.id !== 'b'));
  const renamed = p.puts.find((t) => t.id.startsWith('b-i'));
  assert.equal(renamed.title, '違う');
  const after = [...cur, ...p.puts];
  const p2 = planTasks(after, [T('a'), T('b', { order: 2, title: '違う' }), T('n', { order: 3 })]);
  assert.equal(p2.added, 0); assert.equal(p2.same, 3);
  assert.equal(planTasks(cur, [T('b', { order: 2, title: '違う' })]).puts[0].id, renamed.id);
});

test('planAppend は task の計画も返す', () => {
  assert.equal(planAppend([], [], [], [], [T('a')], [T('a'), T('z')]).task.added, 1);
});
