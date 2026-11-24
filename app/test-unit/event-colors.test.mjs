// 第19.4版 段3（design/37 §4、data/連携_回答_37_予定の色.md）: 予定ごとの色のデータ。qa/verify-muted-colors.md の D-1・D-5・P-3・P-5・P-6・P-7・P-8・P-9（表の側）・P-10。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { XC_MAX, XC_KEEP_MS, XCOLORS_KEY, xcKeyOf, xcLoad, xcItems, xcSet, xcSweep, xcExport, xcImport, checkEventColors } from '../js/event-colors.js';
import { buildBackup, validateBackup, VERSION, SCHEMA } from '../js/backup.js';
import { expand, occurrenceAt, planEdit } from '../js/recur.js';
import { planPaste } from '../js/paste.js';
import { planMoveDuo } from '../js/move-day.js';
import { toDisplay } from '../js/iphone.js';
import { SCHEMA_VERSION } from '../js/db.js';
import { R, ev } from './fixtures.mjs';

const NOW = 1_800_000_000_000, DAY = 864e5;
const cat = (id, name, order = 0) => ({ id, name, color: '#2f5f8a', order, hidden: false, createdAt: 1, updatedAt: 2 });
const cats = [cat('c-work', '仕事', 0)];
const settings = { view: 'month', style: 'simple', desk: false };
const X = (key, start, calId = 'C1', x = {}) => ({ id: `ip:${key}@${start}`, origin: 'iphone', externalId: key, itemId: `i-${key}`, calId, title: `t${key}`, start, end: start, ...x });
const table = (...rows) => xcLoad(rows.map((r) => ({ calId: 'C1', title: 't', lastStart: '2026-11-12T10:00', seenAt: 1, ...r })));
const view = (x = {}) => ({ status: 'ok', range: { from: '2026-10-01', to: '2026-12-31' }, calIds: ['C1', 'C2'], events: [], ...x });

// ---------- キー（P-5）
test('P-5: キーは externalId。空なら itemId（その端末の中だけ）。繰り返しの全部の回が同じキー', () => {
  assert.equal(xcKeyOf({ externalId: 'EXT', itemId: 'ITEM' }), 'EXT');
  assert.equal(xcKeyOf({ externalId: '', itemId: 'ITEM' }), 'ITEM');
  assert.equal(xcKeyOf({ externalId: '', itemId: '' }), ''); assert.equal(xcKeyOf(null), '');
  const cal = { id: 'C1', title: '個人', color: '#d93025' };
  const occ = (start, od) => toDisplay({ id: `E1@${start}`, eventId: 'E1', itemId: 'I1', externalId: 'X1', occurrenceDate: od, calendarId: 'C1', title: '定例', start, end: start, recurring: true }, cal);
  const a = occ('2026-11-10T10:00', '2026-11-10T10:00'), b = occ('2026-11-17T10:00', '2026-11-17T10:00');
  assert.notEqual(a.id, b.id); assert.equal(xcKeyOf(a), 'X1'); assert.equal(xcKeyOf(b), 'X1'); // 回ごとの表示 id は違っても、色のキーは同じ
  const t = xcSet(new Map(), xcKeyOf(a), 'sage', { calId: a.calId, title: a.title, lastStart: a.start }, NOW);
  assert.equal(t.get(xcKeyOf(b)).colorId, 'sage');
  assert.equal(a.color, '#d93025'); // D-1: toDisplay は元の色のまま持つ（ここでは変換しない。36 §8.1）
});

test('表: 付ける・変える・外す。入力は変えない。置き場所のキーは xcolors', () => {
  assert.equal(XCOLORS_KEY, 'xcolors');
  const t0 = new Map(), t1 = xcSet(t0, 'K', 'kusumiPink', { calId: 'C1', title: '歯医者', lastStart: '2026-11-12T15:00' }, NOW);
  assert.equal(t0.size, 0);
  assert.deepEqual(t1.get('K'), { key: 'K', colorId: 'kusumiPink', calId: 'C1', title: '歯医者', lastStart: '2026-11-12T15:00', seenAt: NOW });
  const t2 = xcSet(t1, 'K', 'sage', {}, NOW + 5);
  assert.equal(t2.get('K').colorId, 'sage'); assert.equal(t2.get('K').title, '歯医者'); assert.equal(t2.get('K').missingSince, undefined);
  assert.equal(xcSet(t2, 'K', null).size, 0); assert.equal(xcSet(t2, 'K', 'a'.repeat(41)).size, 0); // 不正な値は「外す」
  assert.equal(xcSet(t2, '', 'sage').size, 1);
  assert.deepEqual(xcItems(xcLoad(xcItems(t1))), xcItems(t1)); // 保存 → 読み直しで同じ
});

test('表: 上限 3000 件。超えたら seenAt の古い順に消す', () => {
  let t = new Map();
  for (let i = 0; i < XC_MAX; i++) t.set(`k${i}`, { key: `k${i}`, colorId: 'sage', calId: 'C1', title: '', lastStart: '', seenAt: 1000 + i });
  t = xcSet(t, 'new', 'greige', {}, NOW);
  assert.equal(t.size, XC_MAX); assert.equal(t.has('new'), true); assert.equal(t.has('k0'), false); assert.equal(t.has('k1'), true);
});

test('表の読み直し: 形の正しくない行だけ捨てる', () => {
  const t = xcLoad([{ key: 'a', colorId: 'sage' }, { key: 'a', colorId: 'greige' }, { key: '', colorId: 'sage' }, { key: 'b', colorId: 'x'.repeat(41) }, null, 'x', { key: 'c', colorId: 'future8', lastStart: 'bad', missingSince: 5 }]);
  assert.deepEqual([...t.keys()], ['a', 'c']); assert.equal(t.get('a').colorId, 'sage');
  assert.deepEqual(t.get('c'), { key: 'c', colorId: 'future8', calId: '', title: '', lastStart: '', seenAt: 0, missingSince: 5 }); // 知らない ID も値は残す
  assert.equal(xcLoad(undefined).size, 0); assert.equal(xcLoad({}).size, 0);
});

// ---------- 消えたかどうか（P-8。連携の回答 5 の 4 つの条件）
test('P-8 ①: 読み込みが成功していない（status が ok でない・cache がない）ときは判断しない', () => {
  const t = table({ key: 'K', colorId: 'sage' });
  for (const v of [view({ status: 'error' }), view({ status: 'loading' }), view({ status: 'idle' }), null, undefined, view({ range: null }), view({ events: null })]) {
    const r = xcSweep(t, v, NOW); assert.equal(r.changed, false); assert.equal(r.table, t); assert.equal(r.table.get('K').missingSince, undefined);
  }
});
test('P-8 ②: 行の calId が読み込んだカレンダー（cache.ids）にない（設定でオフにした）ときは判断しない', () => {
  const t = table({ key: 'K', colorId: 'sage', calId: 'C9' });
  const r = xcSweep(t, view(), NOW); assert.equal(r.changed, false); assert.equal(r.table.get('K').missingSince, undefined);
  const t2 = table({ key: 'K', colorId: 'sage', calId: '' }); assert.equal(xcSweep(t2, view(), NOW).changed, false); // calId が分からない行も判断しない
});
test('P-8 ③: ids が空（アクセス権がない）ときは判断しない', () => {
  const t = table({ key: 'K', colorId: 'sage' });
  const r = xcSweep(t, view({ calIds: [] }), NOW); assert.equal(r.changed, false); assert.equal(r.table.get('K').missingSince, undefined);
});
test('P-8 ④: lastStart が range の外のときは判断しない（端の日は中）', () => {
  for (const ls of ['2026-09-30T23:59', '2027-01-01T00:00', '']) { const t = table({ key: 'K', colorId: 'sage', lastStart: ls }); const r = xcSweep(t, view(), NOW); assert.equal(r.changed, false, ls); }
  for (const ls of ['2026-10-01T00:00', '2026-12-31T23:59']) { const t = table({ key: 'K', colorId: 'sage', lastStart: ls }); const r = xcSweep(t, view(), NOW); assert.equal(r.table.get('K').missingSince, NOW, ls); }
});
test('P-8: 4 つのどれにも当たらず見つからない行だけ missingSince が入る。また見つかれば消える。30 日たっても見つからなければ表から消す', () => {
  const t = table({ key: 'K', colorId: 'sage' }, { key: 'L', colorId: 'greige' });
  const r1 = xcSweep(t, view({ events: [X('L', '2026-11-12T10:00')] }), NOW);
  assert.equal(r1.changed, true); assert.equal(r1.table.get('K').missingSince, NOW); assert.equal(r1.table.get('L').missingSince, undefined); assert.equal(r1.table.get('K').colorId, 'sage');
  assert.equal(t.get('K').missingSince, undefined); // 入力は変えない
  const r2 = xcSweep(r1.table, view({ events: [X('L', '2026-11-12T10:00')] }), NOW + 29 * DAY); // 29 日: まだ残る（missingSince は最初の日のまま）
  assert.equal(r2.table.get('K').missingSince, NOW); assert.equal(r2.table.has('K'), true);
  const r3 = xcSweep(r2.table, view({ events: [X('K', '2026-11-20T09:00', 'C2', { title: '改題' })] }), NOW + 29 * DAY); // また見つかった（iPhone 側で題名・時刻・カレンダーを変えた）
  assert.equal(r3.table.get('K').missingSince, undefined); assert.equal(r3.table.get('K').colorId, 'sage');
  assert.deepEqual([r3.table.get('K').calId, r3.table.get('K').title, r3.table.get('K').lastStart], ['C2', '改題', '2026-11-20T09:00']);
  const r4 = xcSweep(r2.table, view({ events: [] }), NOW + XC_KEEP_MS); // 30 日
  assert.equal(r4.table.has('K'), false); assert.equal(XC_KEEP_MS, 30 * DAY);
  // 30 日たっていても、判断しない場合（カレンダーをオフ・失敗・範囲の外）は消さない
  assert.equal(xcSweep(r2.table, view({ calIds: ['C2'] }), NOW + 99 * DAY).table.has('K'), true);
  assert.equal(xcSweep(r2.table, view({ status: 'error' }), NOW + 99 * DAY).table.has('K'), true);
  assert.equal(xcSweep(r2.table, view({ range: { from: '2027-01-01', to: '2027-03-31' } }), NOW + 99 * DAY).table.has('K'), true);
});
test('P-8: 繰り返しは範囲の中の回が 1 つでもあれば「ある」。何も変わらなければ書き直さない', () => {
  const t = table({ key: 'K', colorId: 'sage', title: 'tK', lastStart: '2026-11-17T10:00' });
  const r = xcSweep(t, view({ events: [X('K', '2026-11-10T10:00'), X('K', '2026-11-17T10:00'), X('Z', '2026-11-11T10:00')] }), NOW);
  assert.equal(r.changed, false); assert.equal(r.table, t);
  const r2 = xcSweep(t, view({ events: [X('Z', '2026-11-11T10:00')] }), NOW); assert.equal(r2.table.get('K').missingSince, NOW);
  // itemId だけの予定（externalId が空）も同じキーで見つかる
  const t4 = table({ key: 'ITEM9', colorId: 'sage' });
  assert.equal(xcSweep(t4, view({ events: [{ externalId: '', itemId: 'ITEM9', calId: 'C1', title: 't', start: '2026-11-12T10:00' }] }), NOW).changed, false);
});

// ---------- バックアップ（P-7・P-10・15・16）
test('P-7: VERSION も IndexedDB の版も 6 のまま。eventColors は最上位に出て、読み戻せる', () => {
  assert.equal(VERSION, 6); assert.equal(SCHEMA, 6); assert.equal(SCHEMA_VERSION, 6);
  const t = xcSet(xcSet(new Map(), 'K2', 'sage', { calId: 'C1', title: 'b', lastStart: '2026-11-12T10:00' }, NOW), 'K1', 'kusumiPink', { calId: 'C1', title: 'a', lastStart: '2026-11-13T10:00' }, NOW);
  const out = buildBackup([ev('a', '2026-11-12T10:00', '2026-11-12T11:00', null, { colorId: 'terracotta' })], settings, new Date(), cats, [], [], [], [], xcExport(t));
  assert.equal(out.version, 6);
  assert.deepEqual(out.eventColors, [{ key: 'K1', colorId: 'kusumiPink', calId: 'C1', title: 'a', lastStart: '2026-11-13T10:00' }, { key: 'K2', colorId: 'sage', calId: 'C1', title: 'b', lastStart: '2026-11-12T10:00' }]); // seenAt・missingSince は出さない
  assert.equal(out.events[0].colorId, 'terracotta');
  const r = validateBackup(JSON.stringify(out), { categories: cats });
  assert.equal(r.ok, true); assert.deepEqual(r.data.eventColors, out.eventColors); assert.equal(r.data.events[0].colorId, 'terracotta'); assert.equal(r.report.dropped, 0);
  // 色の表を渡さない書き出し（今までの呼び方）は項目を出さない。読むと null（置換でも今の表を残す）
  const old = buildBackup([ev('a', '2026-11-12T10:00', '2026-11-12T11:00', null)], settings, new Date(), cats);
  assert.equal('eventColors' in old, false); assert.equal(validateBackup(JSON.stringify(old), { categories: cats }).data.eventColors, null);
});
test('15b: 色を付ける前のデータ・バックアップ（v1〜6）は colorId も eventColors もないまま読める（カテゴリの色で出る）', () => {
  for (const version of [3, 5, 6]) {
    const r = validateBackup(JSON.stringify({ app: 'duo-calendar', version, exportedAt: '2026-11-14T10:00:00+09:00', categories: cats, events: [ev('a', '2026-11-12T10:00', '2026-11-12T11:00', null)] }), { categories: cats });
    assert.equal(r.ok, true); assert.equal('colorId' in r.data.events[0], false); assert.equal(r.data.eventColors, null);
  }
});
test('P-10: colorId は 40 字まで。41 字以上・文字列でない値はその 1 件だけ捨てる（全体は拒否しない）。知らない ID は値を残す', () => {
  const mk = (id, colorId) => ev(id, '2026-11-12T10:00', '2026-11-12T11:00', null, { colorId });
  const f = JSON.stringify({ app: 'duo-calendar', version: 6, exportedAt: '2026-11-14T10:00:00+09:00', categories: cats, events: [mk('ok', 'sage'), mk('max', 'a'.repeat(40)), mk('long', 'a'.repeat(41)), mk('num', 7), mk('obj', { a: 1 }), mk('unk', 'xxx'), mk('nul', null), mk('emp', '')] });
  const r = validateBackup(f, { categories: cats });
  assert.equal(r.ok, true); assert.equal(r.data.events.length, 8);
  const by = Object.fromEntries(r.data.events.map((e) => [e.id, e]));
  assert.equal(by.ok.colorId, 'sage'); assert.equal(by.max.colorId, 'a'.repeat(40)); assert.equal(by.unk.colorId, 'xxx');
  for (const id of ['long', 'num', 'obj', 'nul', 'emp']) assert.equal('colorId' in by[id], false, id);
  assert.equal(r.report.dropped, 4); // long・num・obj・emp（null は「なし」と同じで数えない）
  for (const id of ['long', 'num', 'obj']) assert.equal(by[id].title, `t${id}`); // ほかの項目はそのまま
});
test('P-7・P-10: eventColors は不正な 1 件だけ捨てる（3000 件まで・キーの重複は後ろを捨てる）。全体は拒否しない', () => {
  const good = { key: 'K1', colorId: 'sage', calId: 'C1', title: 'a', lastStart: '2026-11-12T10:00' };
  const r = checkEventColors([good, { ...good }, { key: 'K2', colorId: 'a'.repeat(41) }, { key: '', colorId: 'sage' }, { key: 'K3' }, null, 'x', { key: 'K4', colorId: 'greige', lastStart: 'いつか' }, { key: 'K5', colorId: 'greige', calId: 5 }, { key: 'K6', colorId: 'future8' }, { key: 'K7', colorId: 'sage', seenAt: 9, missingSince: 9, extra: 1 }]);
  assert.deepEqual(r.eventColors.map((x) => x.key), ['K1', 'K6', 'K7']); assert.equal(r.dropped, 8);
  assert.deepEqual(r.eventColors[2], { key: 'K7', colorId: 'sage', calId: '', title: '', lastStart: '' });
  assert.deepEqual(checkEventColors('x'), { eventColors: [], dropped: 1 }); assert.deepEqual(checkEventColors([]), { eventColors: [], dropped: 0 });
  const many = Array.from({ length: XC_MAX + 5 }, (_, i) => ({ key: `k${i}`, colorId: 'sage' }));
  const m = checkEventColors(many); assert.equal(m.eventColors.length, XC_MAX); assert.equal(m.dropped, 5);
  // ファイル全体としても通る（予定は読める）
  const f = JSON.stringify({ app: 'duo-calendar', version: 6, exportedAt: '2026-11-14T10:00:00+09:00', categories: cats, events: [ev('a', '2026-11-12T10:00', '2026-11-12T11:00', null)], eventColors: [good, { key: 'bad' }, 5] });
  const v = validateBackup(f, { categories: cats });
  assert.equal(v.ok, true); assert.equal(v.data.events.length, 1); assert.deepEqual(v.data.eventColors, [good]); assert.equal(v.report.colorsDropped, 2);
  assert.equal(validateBackup(f.replace('"eventColors":[', '"eventColors":"x","zz":['), { categories: cats }).ok, true); // 配列でなくても拒否しない
});
test('P-7: 古い版（v19.3 まで）の読み方でも失敗しない: 最上位の eventColors は見ない・予定の colorId は shape() が残す', () => {
  // 古い版の validateBackup は知らない最上位の項目を見ない。ここでは「eventColors を消したファイル」と「付いたままのファイル」の予定が同じに読めることで確かめる
  const base = { app: 'duo-calendar', version: 6, exportedAt: '2026-11-14T10:00:00+09:00', categories: cats, events: [ev('a', '2026-11-12T10:00', '2026-11-12T11:00', null, { colorId: 'sage', futureFlag: 1 })] };
  const a = validateBackup(JSON.stringify(base), { categories: cats }), b = validateBackup(JSON.stringify({ ...base, eventColors: [{ key: 'K', colorId: 'sage' }] }), { categories: cats });
  assert.deepEqual(a.data.events, b.data.events); assert.equal(a.data.events[0].colorId, 'sage'); assert.equal(a.data.events[0].futureFlag, 1);
});
test('読み込み: 「置き換え」は表も置き換え、「追加」はファイルの側を足す（同じキーは今の端末を残す）', () => {
  const cur = table({ key: 'A', colorId: 'sage' }, { key: 'B', colorId: 'greige' });
  const inc = [{ key: 'B', colorId: 'kusumiPink', calId: 'C1', title: 'b', lastStart: '' }, { key: 'C', colorId: 'milkTea', calId: 'C1', title: 'c', lastStart: '2026-11-12T10:00' }];
  const add = xcImport(cur, inc, 'add', NOW);
  assert.deepEqual([...add.keys()].sort(), ['A', 'B', 'C']); assert.equal(add.get('B').colorId, 'greige'); assert.equal(add.get('C').colorId, 'milkTea'); assert.equal(add.get('C').seenAt, NOW);
  const rep = xcImport(cur, inc, 'replace', NOW);
  assert.deepEqual([...rep.keys()].sort(), ['B', 'C']); assert.equal(rep.get('B').colorId, 'kusumiPink');
  assert.equal(cur.size, 2); assert.equal(xcImport(cur, [], 'replace', NOW).size, 0);
});

// ---------- 繰り返し（P-3）
const series = (x = {}) => ev('S', '2026-11-02T10:00', '2026-11-02T11:00', R('weekly', { byDay: [1] }), { colorId: 'kusumiPink', ...x });
const form = (p, occKey, x = {}) => { const o = occurrenceAt(p, occKey); return { title: o.title, categoryId: o.categoryId, all: false, place: '', notes: '', recurrence: p.recurrence, start: o.start, end: o.end, ...x }; };
test('P-3: 繰り返しの全部の回が、系列の本体の colorId で出る。overrides の colorId は読まない', () => {
  const p = series({ overrides: { '2026-11-09T10:00': { title: '変更', categoryId: 'c-work', all: false, start: '2026-11-09T14:00', end: '2026-11-09T15:00', place: '', notes: '', colorId: 'sage' } } });
  const occ = expand([p], '2026-11-01', '2026-11-30');
  assert.equal(occ.length, 5); assert.deepEqual([...new Set(occ.map((o) => o.colorId))], ['kusumiPink']);
  assert.equal(occ.find((o) => o.moved).colorId, 'kusumiPink'); // 個別変更の回も本体の色
  const none = expand([series({ colorId: undefined, overrides: p.overrides })], '2026-11-01', '2026-11-30');
  assert.equal(none.every((o) => !('colorId' in o)), true); // 本体に色がなければ、overrides に色があってもカテゴリの色
});
test('P-3: 「この予定のみ」で保存しても overrides に colorId は入らない（本体の色は残る）。バックアップの overrides にも出ない', () => {
  const p = series(), k = '2026-11-09T10:00';
  const plan = planEdit(p, k, 'only', form(p, k, { title: 'この回だけ', colorId: 'sage' }), () => 'N');
  assert.equal(plan.puts.length, 1); assert.equal(plan.puts[0].colorId, 'kusumiPink'); assert.equal('colorId' in plan.puts[0].overrides[k], false);
  const out = buildBackup(plan.puts, settings, new Date(), cats);
  assert.equal(out.events[0].colorId, 'kusumiPink'); assert.equal(JSON.stringify(out.events[0].overrides).includes('colorId'), false);
  // 別の日へ移す（長押し）も「この回だけ」の個別変更で、色は書かない
  const mv = planMoveDuo(p, occurrenceAt(p, k), k, '2026-11-11', () => 'N');
  assert.equal('colorId' in mv.puts[0].overrides[k], false); assert.equal(mv.puts[0].colorId, 'kusumiPink');
});
test('P-3: 「これ以降すべて」で分かれた新しい系列も同じ色。「すべて」は本体の色のまま', () => {
  const p = series(), k = '2026-11-16T10:00';
  const f = planEdit(p, k, 'following', form(p, k, { title: '後半' }), () => 'N2');
  assert.deepEqual(f.puts.map((e) => [e.id, e.colorId]), [['S', 'kusumiPink'], ['N2', 'kusumiPink']]);
  const a = planEdit(p, k, 'all', form(p, k, { title: '全部' }), () => 'N3');
  assert.equal(a.puts[0].colorId, 'kusumiPink');
  const none = planEdit(series({ colorId: undefined }), k, 'following', form(p, k, { title: '後半' }), () => 'N4');
  assert.equal(none.puts.every((e) => e.colorId == null), true);
});
test('37 §4.1: 読み込んだファイルの overrides の colorId は値を残す（表示には使わない）。不正な値だけ捨てる', () => {
  const k = '2026-11-09T10:00', o = (colorId) => ({ title: '変更', categoryId: 'c-work', all: false, start: '2026-11-09T14:00', end: '2026-11-09T15:00', place: '', notes: '', colorId });
  const f = (colorId) => JSON.stringify({ app: 'duo-calendar', version: 6, exportedAt: '2026-11-14T10:00:00+09:00', categories: cats, events: [series({ overrides: { [k]: o(colorId) } })] });
  const r = validateBackup(f('sage'), { categories: cats });
  assert.equal(r.data.events[0].overrides[k].colorId, 'sage');
  assert.equal(expand(r.data.events, '2026-11-09', '2026-11-09')[0].colorId, 'kusumiPink');
  const bad = validateBackup(f('a'.repeat(41)), { categories: cats });
  assert.equal(bad.ok, true); assert.equal('colorId' in bad.data.events[0].overrides[k], false); assert.equal(bad.report.dropped, 1);
});
test('37 §4.1: コピーで作った予定も colorId を引き継ぐ（iPhone の予定は表の色を渡す）', () => {
  const ctx = { cals: [], enabled: false, defaultCatId: () => 'c-work', newId: (() => { let n = 0; return () => `n${n++}`; })(), pastedAt: 5 };
  const src = { title: 'a', categoryId: 'c-work', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', colorId: 'sage' };
  assert.equal(planPaste(src, ['2026-11-20'], ctx).items[0].event.colorId, 'sage');
  assert.equal('colorId' in planPaste({ ...src, colorId: undefined }, ['2026-11-20'], ctx).items[0].event, false);
  assert.equal('colorId' in planPaste({ ...src, colorId: 'a'.repeat(41) }, ['2026-11-20'], ctx).items[0].event, false);
  const x = { origin: 'iphone', calId: 'RO', title: 'x', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', colorId: 'ignored' };
  assert.equal(planPaste(x, ['2026-11-20'], { ...ctx, srcColorId: 'greige' }).items[0].event.colorId, 'greige');
  assert.equal('colorId' in planPaste(x, ['2026-11-20'], ctx).items[0].event, false);
});

// ---------- 保存（D-1・P-7）
let n = 0;
async function fresh() { globalThis.indexedDB = new IDBFactory(); const m = await import(`../js/db.js?xc${n++}`); m.configure(`xc${n}`); return m; }
test('P-7: 色の表は meta の 1 件（key xcolors）。IndexedDB の版は 6 のまま・新しい store は作らない', async () => {
  const m = await fresh();
  assert.deepEqual(await m.getEventColors(), []);
  const items = xcItems(xcSet(new Map(), 'K', 'sage', { calId: 'C1', title: 'a', lastStart: '2026-11-12T10:00' }, NOW));
  await m.putEventColors(items);
  assert.deepEqual(await m.getEventColors(), items);
  const info = await new Promise((res) => { const r = indexedDB.open(`duo-calendar-xc${n}`); r.onsuccess = () => { const d = r.result; const g = d.transaction('meta').objectStore('meta').get('xcolors'); g.onsuccess = () => { res({ version: d.version, stores: [...d.objectStoreNames].sort(), row: g.result }); d.close(); }; }; });
  assert.equal(info.version, 6); assert.deepEqual(info.stores, ['categories', 'events', 'folders', 'memos', 'meta', 'notes', 'tasks']); assert.deepEqual(info.row, { key: 'xcolors', items });
});
test('D-1・P-7: 読み込みは予定と色の表を同じトランザクションで書く。eventColors を渡さなければ今の表のまま。予定の colorId と分類の色は元の値で保存される', async () => {
  const m = await fresh();
  await m.putEventColors([{ key: 'OLD', colorId: 'sage', calId: '', title: '', lastStart: '', seenAt: 1 }]);
  const e = ev('a', '2026-11-12T10:00', '2026-11-12T11:00', null, { colorId: 'kusumiPink' });
  await m.applyImport({ catPuts: [cat('c-work', '仕事')], eventPuts: [e], replace: true });
  assert.deepEqual((await m.getEventColors()).map((r) => r.key), ['OLD']);
  await m.applyImport({ catPuts: [cat('c-work', '仕事')], eventPuts: [e], replace: true, eventColors: [{ key: 'NEW', colorId: 'greige', calId: '', title: '', lastStart: '', seenAt: 2 }] });
  assert.deepEqual((await m.getEventColors()).map((r) => r.key), ['NEW']);
  assert.equal((await m.listEvents())[0].colorId, 'kusumiPink');
  assert.equal((await m.listCategories())[0].color, '#2f5f8a'); // くすませた色は保存しない
});

// ---------- 変換の入口（D-2）と、一括置換していないこと（D-5）
const SRC = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('D-5: iPhone の色が取れないときの代わりの色は #68716a のまま（iphone.js・app.js・categories.js）。下の欄の日付の横の文字だけ CSS で変えた', () => {
  assert.match(SRC('js/iphone.js'), /\/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(cal\?\.color \|\| ''\) \? cal\.color : '#68716a'/);
  assert.match(SRC('js/app.js'), /color: c\?\.color \|\| '#68716A' \};/);
  assert.match(SRC('js/app.js'), /const safeColor = \(c\) => \(\/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(c \|\| ''\) \? c : '#68716a'\);/);
  assert.match(SRC('js/categories.js'), /UNCATEGORIZED = \{ id: CAT_IDS\.none, name: '未分類', color: '#68716a'/);
  assert.match(SRC('ios/App/App/DuoNativePlugin.swift'), /fallbackColor = "#68716a"/);
  const css = SRC('css/app.css');
  assert.match(css, /\.mpull\.browse \.mdh \.hdw\{[^}]*color:var\(--outc\)\}/); assert.match(css, /:root\{[^}]*--outc:#5D6963;/);
  assert.match(css, /:root\{[^}]*--muted:#68716a;/); // 薄い文字の色そのもの（ほかの場所）は変えていない
  assert.equal(toDisplay({ id: 'e', calendarId: 'C', title: 't', start: '2026-11-12T10:00', end: '2026-11-12T11:00' }, { color: 'P3の色' }).color, '#68716a');
});
test('D-2・36 §8.1: 変換は app.js の表示の入口だけ。iphone.js・db.js・backup.js は色の変換を読み込まない', () => {
  for (const f of ['js/iphone.js', 'js/db.js', 'js/categories.js', 'js/native.js']) assert.equal(/colorSet|eventSet|from '\.\/colors\.js'/.test(SRC(f)), false, f);
  assert.equal(/colorSet|eventSet|flickSet|setVars/.test(SRC('js/backup.js')), false); // backup.js が使うのは colorId の長さの検証だけ
  const app = SRC('js/app.js');
  for (const re of [/const colorVars = \(c\) => setVars\(colorSet\(c, MODE\)\);/, /const catSet = \(e\) => eventSet\(colorIdOf\(e\), baseColorOf\(e\), MODE\);/, /const catVar = \(e\) => setVars\(catSet\(e\)\);/, /const calDot = \(c\) => `<i class="cdot" style="background:\$\{lineOf\(safeColor\(c\)\)\}"/, /<p class="xdcal caltag"><i class="cdot" style="background:\$\{catSet\(e\)\.line\}"/]) assert.match(app, re);
  assert.equal(/style="[^"]*(background|--cat[a-z-]*):\$\{(e|c|b|d|p|i)\.(color|light)\}/.test(app), false); // 元の色をそのまま style に入れている所がない
  assert.equal(/--cat:|--tint:|--solid:|var\(--cat\)|var\(--tint\)|var\(--solid/.test(app + SRC('css/app.css')), false); // 古い変数は残っていない
});
test('36 §8.2: Swift の hexColor は r・g・b を 0〜1 に収めてから変換する（2 つの分かれ道とも）', () => {
  const sw = SRC('ios/App/App/DuoNativePlugin.swift');
  assert.match(sw, /private func hexByte\(_ v: CGFloat\) -> Int \{\s*let c = v\.isNaN \? 0 : min\(max\(v, 0\), 1\)\s*return Int\(\(c \* 255\)\.rounded\(\)\)/);
  const fn = sw.slice(sw.indexOf('private func hexColor'), sw.indexOf('private func sourceTypeString'));
  assert.equal((fn.match(/hexByte\(/g) || []).length, 6); assert.equal(/\* 255\)/.test(fn), false);
  // 同じ収め方を JS で写して確かめる: 0〜1 の外でも必ず 2 けたずつ
  const hb = (v) => Math.round((Number.isNaN(v) ? 0 : Math.min(Math.max(v, 0), 1)) * 255), hex = (r, g, b) => '#' + [r, g, b].map((v) => hb(v).toString(16).padStart(2, '0')).join('');
  for (const c of [[1.09, -0.23, 0.5], [2, 2, 2], [-1, -1, -1], [NaN, 0.5, 1.0000001]]) assert.match(hex(...c), /^#[0-9a-f]{6}$/);
  assert.equal(hex(1.09, -0.23, 0.5), '#ff0080');
});
