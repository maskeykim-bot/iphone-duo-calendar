// probe_recur.mjs の単体テスト化。TZ は npm run test:unit が Asia/Tokyo と America/New_York の2回で実行する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { expand, planEdit } from '../js/recur.js';
import { R, ev } from './fixtures.mjs';

const NY = process.env.TZ === 'America/New_York';
const starts = (l) => l.map((o) => o.start);

test('TZ が指定されている（2つの TZ で実行する前提）', () => {
  assert.ok(['Asia/Tokyo', 'America/New_York'].includes(process.env.TZ), `TZ=${process.env.TZ}`);
});

test('DST の欠落時刻（NY 2026-03-08 02:30）はその回をスキップ、東京は欠落しない', () => {
  const r = starts(expand([ev('a', '2026-03-07T02:30', '2026-03-07T03:00', R('daily'))], '2026-03-06', '2026-03-10'));
  const want = ['2026-03-07T02:30', '2026-03-09T02:30', '2026-03-10T02:30'];
  assert.deepEqual(r, NY ? want : ['2026-03-07T02:30', '2026-03-08T02:30', ...want.slice(1)]);
});

test('終日の毎日（DST をまたぐ）は 00:00→23:59 のまま全日出る', () => {
  const r = expand([ev('b', '2026-03-07T00:00', '2026-03-07T23:59', R('daily'), { all: true })], '2026-03-07', '2026-03-09').map((o) => `${o.start}→${o.end}`);
  assert.deepEqual(r, ['2026-03-07', '2026-03-08', '2026-03-09'].map((d) => `${d}T00:00→${d}T23:59`));
});

test('回数指定 + DST: スキップされた回は回数に数えない（NY）', () => {
  const r = starts(expand([ev('c', '2026-03-07T02:30', '2026-03-07T03:00', R('daily', { count: 3 }))], '2026-03-01', '2026-03-31'));
  assert.deepEqual(r, NY ? ['2026-03-07T02:30', '2026-03-09T02:30', '2026-03-10T02:30'] : ['2026-03-07T02:30', '2026-03-08T02:30', '2026-03-09T02:30']);
});

test('毎週で起点が byDay に含まれない場合は byDay の曜日だけ（起点の水曜は出ない）', () => {
  const r = starts(expand([ev('d', '2026-11-11T10:00', '2026-11-11T11:00', R('weekly', { byDay: [1] }))], '2026-11-01', '2026-11-30'));
  assert.deepEqual(r, ['2026-11-16T10:00', '2026-11-23T10:00', '2026-11-30T10:00']);
});

test('範囲外から範囲内へ移動した個別変更を拾う', () => {
  const mv = ev('e', '2026-01-05T10:00', '2026-01-05T11:00', R('weekly', { byDay: [1] }), { overrides: { '2026-01-12T10:00': { title: 'moved', cat: 'work', all: false, start: '2026-02-20T10:00', end: '2026-02-20T11:00' } } });
  assert.deepEqual(starts(expand([mv], '2026-02-20', '2026-02-20')), ['2026-02-20T10:00']);
});

test('until より後の個別変更キー（ゴースト）は表示されない', { todo: '現状の不具合: until=2026-01-10 の系列で 01-12 の override が表示される（probe_recur の overrideBeyondUntil）' }, () => {
  const ou = ev('f', '2026-01-05T10:00', '2026-01-05T11:00', R('weekly', { byDay: [1], until: '2026-01-10' }), { overrides: { '2026-01-12T10:00': { title: 'ghost', cat: 'work', all: false, start: '2026-01-12T10:00', end: '2026-01-12T11:00' } } });
  assert.deepEqual(expand([ou], '2026-01-01', '2026-01-31').map((o) => o.title), ['tf']);
});

test('「これ以降」編集（回数指定）: 旧系列は until で切り、新系列は残り回数を持つ', () => {
  const fc = ev('g', '2026-11-01T10:00', '2026-11-01T11:00', R('daily', { count: 10 }));
  const pe = planEdit(fc, '2026-11-05T10:00', 'following', { ...fc, title: 'X', start: '2026-11-05T10:00', end: '2026-11-05T11:00', recurrence: fc.recurrence }, () => 'new');
  const n = (p) => expand([p], '2026-10-01', '2026-12-31').length;
  assert.equal(pe.puts.length, 2);
  assert.equal(pe.puts[0].recurrence.until, '2026-11-04');
  assert.equal(pe.puts[0].recurrence.count, null);
  assert.equal(pe.puts[1].recurrence.count, 6);
  assert.deepEqual(pe.puts.map(n), [4, 6]);
});
