// 月キャッシュ・回数系列の高速化・検索の高速化が、最適化前の実装と同じ結果を返すことと、無効化の正しさを確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { expand, countBefore, planEdit } from '../js/recur.js';
import * as ref from './ref/recur-v0.mjs';
import { bumpRevision, monthOcc, occBetween, monthByDay, monthRange } from '../js/occcache.js';
import { searchEvents, normalize, normalizeMap, searchRange, terms } from '../js/search.js';
import { R, ev } from './fixtures.mjs';

const sig = (l) => l.map((o) => `${o.id}|${o.start}|${o.end}|${o.title}`);

const series = () => {
  const L = [];
  let n = 0;
  const add = (s, rec, x = {}) => L.push(ev('s' + n++, s, s.replace(/T\d\d:\d\d/, (t) => t), rec, x));
  for (const tm of ['09:00', '02:30', '00:00']) {
    for (const cnt of [1, 5, 40, 400, 3000]) {
      add(`2023-03-31T${tm}`, R('daily', { count: cnt }));
      add(`2024-02-29T${tm}`, R('yearly', { count: Math.min(cnt, 9) }));
      add(`2025-01-31T${tm}`, R('monthly', { count: cnt % 50 + 1 }));
      add(`2024-11-13T${tm}`, R('weekly', { byDay: [1, 3, 6], count: cnt }));
      add(`2026-03-07T${tm}`, R('weekly', { byDay: null, count: cnt }));
    }
    add(`2022-05-05T${tm}`, R('daily', { until: '2026-12-01' }));
    add(`2022-05-05T${tm}`, R('monthly'));
  }
  return L;
};
const WINDOWS = [['2026-11-01', '2026-11-30'], ['2026-03-01', '2026-04-12'], ['2025-12-28', '2026-02-07'], ['2024-02-25', '2024-03-05'], ['2030-01-01', '2030-01-31'], ['2023-03-25', '2023-04-05']];

test('回数指定の高速化: 最適化前の expand と全系列・全窓で一致（DST・月末・2/29 含む）', () => {
  const S = series();
  for (const [a, b] of WINDOWS) assert.deepEqual(sig(expand(S, a, b)), sig(ref.expand(S, a, b)), `${a}〜${b}`);
});

test('回数指定の高速化: 個別変更・削除例外付きでも一致', () => {
  const p = ev('o', '2026-03-01T02:30', '2026-03-01T03:00', R('daily', { count: 60 }), {
    exdates: ['2026-03-12T02:30'], overrides: { '2026-03-15T02:30': { title: 'mv', categoryId: 'c-work', all: false, start: '2026-04-02T10:00', end: '2026-04-02T11:00' } },
  });
  // 窓の外から移動してきた回の並び順だけは最適化前と異なりうる（表示側で必ず並べ替えるので順不同で比べる）。
  for (const [a, b] of WINDOWS.concat([['2026-04-01', '2026-04-30']])) assert.deepEqual(sig(expand([p], a, b)).sort(), sig(ref.expand([p], a, b)).sort());
});

test('countBefore が最適化前と一致（編集の「これ以降」で使う回数）', () => {
  for (const p of series()) {
    for (const k of ['2026-03-07T02:30', '2026-03-08T02:30', '2026-03-09T00:00', '2026-11-20T09:00', '2023-03-31T09:00', '2020-01-01T00:00', `${p.start.slice(0, 10)}T23:59`]) {
      assert.equal(countBefore(p, k), ref.countBefore(p, k), `${p.id} ${p.recurrence.freq} ${p.start} before ${k}`);
    }
  }
});

test('planEdit（これ以降・回数指定）の結果が最適化前と一致', () => {
  const p = ev('q', '2025-03-07T09:00', '2025-03-07T10:00', R('weekly', { byDay: [5], count: 30 }));
  const form = { title: 'x', categoryId: 'c-work', all: false, start: '2026-03-06T09:00', end: '2026-03-06T10:00', place: '', notes: '', recurrence: R('weekly', { byDay: [5], count: 30 }) };
  assert.deepEqual(planEdit(p, '2026-03-06T09:00', 'following', form, () => 'n').puts.map((x) => x.recurrence), [
    R('weekly', { byDay: [5], until: '2026-03-05' }), R('weekly', { byDay: [5], count: Math.max(1, 30 - ref.countBefore(p, '2026-03-06T09:00')) }),
  ]);
});

test('月キャッシュ: キャッシュ有無で結果が一致、2 回目は同じ配列を返す', () => {
  bumpRevision();
  const S = series().concat([ev('single', '2026-11-30T20:00', '2026-12-02T10:00', null)]);
  const m1 = monthOcc(S, '2026-11');
  assert.deepEqual(sig(m1), sig(expand(S, ...Object.values(monthRange('2026-11')))));
  assert.equal(monthOcc(S, '2026-11'), m1);
  for (const [a, b] of [['2026-11-01', '2026-11-07'], ['2026-11-15', '2026-11-15'], ['2026-10-29', '2026-11-04'], ['2026-11-30', '2026-12-05']]) {
    assert.deepEqual(sig(occBetween(S, a, b)), sig(expand(S, a, b)), `${a}〜${b}`);
  }
  assert.deepEqual(sig(occBetween(S, '2026-11-10', '2027-12-31')), sig(expand(S, '2026-11-10', '2027-12-31'))); // 月を超える範囲は直接展開
});

test('月キャッシュ: 日ごとの索引が日ごとの絞り込みと一致', () => {
  bumpRevision();
  const S = series().concat([ev('single', '2026-11-30T20:00', '2026-12-02T10:00', null)]);
  const by = monthByDay(S, '2026-11'), { from, to } = monthRange('2026-11');
  const occ = expand(S, from, to);
  for (let k = from; k <= to; k = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8) + 1, 12).toISOString().slice(0, 10) && ((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8) + 1, 12))) {
    assert.deepEqual(sig(by.get(k) || []), sig(occ.filter((e) => e.start.slice(0, 10) <= k && e.end.slice(0, 10) >= k)), k);
  }
});

test('無効化: 編集・削除・追加のあと古い回が出ない（bumpRevision あり）', () => {
  bumpRevision();
  const p = ev('e1', '2026-11-02T09:00', '2026-11-02T10:00', R('weekly', { byDay: [1] }));
  let events = [p];
  assert.deepEqual(monthOcc(events, '2026-11').filter((o) => o.start.startsWith('2026-11-09')).map((o) => o.title), ['te1']);
  // 個別変更
  const edited = { ...p, overrides: { '2026-11-09T09:00': { title: '変更', categoryId: 'c-work', all: false, start: '2026-11-09T09:00', end: '2026-11-09T10:00' } }, updatedAt: 1 };
  events = [edited]; bumpRevision();
  assert.deepEqual(monthOcc(events, '2026-11').filter((o) => o.start.startsWith('2026-11-09')).map((o) => o.title), ['変更']);
  // 時刻変更
  events = [{ ...edited, start: '2026-11-02T11:00', end: '2026-11-02T12:00', overrides: {}, updatedAt: 2 }]; bumpRevision();
  assert.deepEqual(monthOcc(events, '2026-11').filter((o) => o.start.startsWith('2026-11-09')).map((o) => o.start), ['2026-11-09T11:00']);
  // 追加
  events = [...events, ev('n1', '2026-11-09T08:00', '2026-11-09T08:30', null)]; bumpRevision();
  assert.equal(monthOcc(events, '2026-11').filter((o) => o.start.startsWith('2026-11-09')).length, 2);
  // 削除
  events = []; bumpRevision();
  assert.equal(monthOcc(events, '2026-11').length, 0);
});

test('無効化の保険: bumpRevision を忘れても events 配列が替われば古い回は出ない', () => {
  bumpRevision();
  const a = [ev('z1', '2026-11-02T09:00', '2026-11-02T10:00', R('daily'))];
  assert.ok(monthOcc(a, '2026-11').length > 30);
  assert.equal(monthOcc([], '2026-11').length, 0);
});

test('検索: 最適化前と同じ結果（親の一致・個別変更・除外・単発・ひらがな/カタカナ・半角）', () => {
  const today = '2026-11-14';
  const S = [
    ev('r1', '2026-01-05T10:00', '2026-01-05T11:00', R('weekly', { byDay: [1] }), { title: '定例ミーティング', notes: 'ｶﾞｲﾄﾞ', overrides: { '2026-01-12T10:00': { title: '別件', categoryId: 'c-work', all: false, start: '2026-01-12T10:00', end: '2026-01-12T11:00', notes: 'ミーティング延期' } }, exdates: ['2026-01-19T10:00'] }),
    ev('r2', '2026-01-05T10:00', '2026-01-05T11:00', R('weekly', { byDay: [2] }), { title: '体操', overrides: { '2026-01-13T10:00': { title: 'みーてぃんぐ特別', categoryId: 'c-work', all: false, start: '2026-01-13T10:00', end: '2026-01-13T11:00' }, '2026-01-20T10:00': { title: 'みーてぃんぐ除外', categoryId: 'c-work', all: false, start: '2026-01-20T10:00', end: '2026-01-20T11:00' } }, exdates: ['2026-01-20T10:00'] }),
    ev('r3', '2025-12-01T10:00', '2025-12-01T11:00', R('daily', { count: 800 }), { title: 'MEETING', place: '会議室' }),
    ev('s1', '2026-05-05T10:00', '2026-05-05T11:00', null, { title: 'ミーティング', place: '本社' }),
    ev('s2', '2020-05-05T10:00', '2020-05-05T11:00', null, { title: 'ミーティング(範囲外)' }),
    ev('s3', '2026-05-05T10:00', '2026-05-05T11:00', null, { title: '会議', notes: 'みーてぃんぐ' }),
  ];
  const oracle = (q) => {
    const ts = terms(q), r = searchRange(today);
    const f = (s) => normalizeMap(String(s ?? '')).norm;
    return ref.expand(S, r.from, r.to).filter((e) => ts.every((t) => [f(e.title), f(e.notes), f(e.place)].some((x) => x.includes(t))))
      .sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)));
  };
  for (const q of ['ミーティング', 'みーてぃんぐ', 'meeting', 'ガイド', '会議 meeting', '別件', '体操', 'zzz', '本社 ミーティング']) {
    const got = searchEvents(S, q, today);
    const want = oracle(q);
    assert.equal(got.total, want.length, q);
    assert.deepEqual(sig(got.items), sig(want.slice(0, 200)), q);
  }
});

test('検索: 親を編集（置き換え）したあとに古い文字列で出ない', () => {
  const p = ev('x1', '2026-11-20T10:00', '2026-11-20T11:00', null, { title: '歯医者' });
  assert.equal(searchEvents([p], '歯医者', '2026-11-14').total, 1);
  assert.equal(searchEvents([{ ...p, title: '散髪', updatedAt: 5 }], '歯医者', '2026-11-14').total, 0);
  p.title = '床屋'; // 同じオブジェクトを直接書き換えても古い正規化を使わない
  assert.equal(searchEvents([p], '歯医者', '2026-11-14').total, 0);
  assert.equal(searchEvents([p], '床屋', '2026-11-14').total, 1);
});

test('normalize: normalizeMap と同じ結果', () => {
  for (const s of ['', 'ABC', 'ｶﾞｷﾞｸﾞ', 'カタカナ ひらがな', 'é', 'e\u0301', 'Ａｂｃ１２３', '😀カ゛', '㈱ ㎏']) assert.equal(normalize(s), normalizeMap(s).norm, JSON.stringify(s));
});
