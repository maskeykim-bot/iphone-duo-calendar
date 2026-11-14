import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, contentKey, planAppend, stripRuntime, validateBackup, VERSION } from '../js/backup.js';
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

test('バージョンは 3、schema と settings の形', () => {
  const bk = buildBackup([], { ...settings, monthExpand: true, notify: { enabled: true, showTitle: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' } } }, new Date(), cats);
  assert.equal(bk.version, VERSION); assert.equal(VERSION, 3); assert.equal(bk.schema, 3);
  assert.deepEqual(bk.settings, { view: 'month', style: 'simple', desk: false, monthExpand: true, notify: { enabled: true, showTitle: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' } } });
  assert.equal(bk.categories.length, 2);
});

test('全項目を持つ予定の往復で項目が一つも落ちない（nativeLink 往復の回帰を含む）', () => {
  const src = full();
  const v = roundtrip([src, ev('plain', '2026-11-20T10:00', '2026-11-20T11:00', null)]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.events[0], src);
  assert.deepEqual(v.data.events[0].nativeLink, link);
  assert.deepEqual(v.data.events[0].overrides['2026-11-16T10:00'].alarms, [{ before: 10 }, { before: 60 }]);
  assert.deepEqual(v.report, { dropped: 0, fallbackCount: 0, legacyAdded: 0, ink: 0 });
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
  assert.deepEqual(v.data.settings, { view: 'week', style: 'named', desk: true, monthExpand: true, weekStart: 0, notify });
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

test('v2 ファイル: cat を固定 id へ。未知の cat は未分類。経済指標カテゴリが追加予定に入る', () => {
  const body = (id, c) => ({ ...ev(id, '2026-11-20T10:00', '2026-11-20T11:00', null), categoryId: undefined, cat: c });
  const t = JSON.stringify({ app: 'duo-calendar', version: 2, exportedAt: '2026-11-12T09:41:00+09:00', events: [body('a', 'economy'), body('b', 'golf'), body('c', 'xxx')], settings: { view: 'month', style: 'simple', desk: false } });
  const v = validateBackup(t, { categories: [] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.events.map((e) => e.categoryId), [CAT_IDS.economy, CAT_IDS.golf, CAT_IDS.none]);
  assert.equal(v.data.events.some((e) => 'cat' in e), false);
  assert.deepEqual(v.data.categories.map((c) => c.name).sort(), ['ゴルフ', '未分類', '経済指標'].sort());
  assert.equal(v.report.legacyAdded, 2); assert.equal(v.report.fallbackCount, 1);
  // 現在の DB に既にあるなら追加予定に入れない
  const w = validateBackup(t, { categories: [{ id: CAT_IDS.economy }, { id: CAT_IDS.golf }, { id: CAT_IDS.none }] });
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

test('version: 4 → 拒否、1 → 受理、未知のトップレベルキー（ink）は無視して件数だけ数える', () => {
  assert.equal(validateBackup(file({ version: 4, events: [] })).ok, false);
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
