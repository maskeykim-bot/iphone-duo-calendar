// 第19版 D15: 古い手書き（ink）をバックアップ・メモの保存で消さない
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, validateBackup, planMemos } from '../js/backup.js';
import { makeMemo } from '../js/db.js';

const NOW = new Date(2026, 10, 19, 12, 0);
const PTS = { strokes: [[1, 2], [3.5, 4], [5, 6]], refW: 342 };
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const note = (id, ink) => ({ id, body: '本文', title: '', folderId: null, pinned: false, pinnedAt: null, createdAt: 1, updatedAt: 2, deletedAt: null, date: null, ink });

test('① ink が点の列・data:image のノートを書き出して読み戻すと ink が1バイトも変わらない', () => {
  const notes = [note('n1', PTS), note('n2', IMG), note('n3', null)];
  const r = validateBackup(JSON.stringify(buildBackup([], {}, NOW, [], [], [], notes, [])));
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.data.notes.map((n) => [n.id, n]));
  assert.equal(JSON.stringify(by.n1.ink), JSON.stringify(PTS));
  assert.equal(by.n2.ink, IMG);
  assert.equal(by.n3.ink, null);
});

test('② planMemos: 今のメモの ink が連結後も残る', () => {
  const cur = [{ id: '2026-11-02', date: '2026-11-02', text: 'A', createdAt: 1, updatedAt: 2, ink: PTS }];
  const inc = [{ id: '2026-11-02', date: '2026-11-02', text: 'B', createdAt: 1, updatedAt: 2, ink: null }];
  const p = planMemos(cur, inc, 9);
  assert.equal(p.puts[0].text, 'A\n\nB');
  assert.equal(JSON.stringify(p.puts[0].ink), JSON.stringify(PTS));
  assert.equal(planMemos([{ ...cur[0], ink: undefined }], inc, 9).puts[0].ink, null);
});

test('③ v4 のファイルの日ごとメモの ink が読み込みで残る（不正な型は拒否）', () => {
  const memo = (date, ink) => ({ id: date, date, text: 'x', createdAt: 1, updatedAt: 2, ...(ink === undefined ? {} : { ink }) });
  const base = JSON.parse(JSON.stringify(buildBackup([], {}, NOW, [], [memo('2026-11-01')], [], null, null)));
  const txt = JSON.stringify({ ...base, version: 4, schema: 4, memos: [memo('2026-11-01', PTS), memo('2026-11-02', IMG), memo('2026-11-03')] });
  const r = validateBackup(txt);
  assert.equal(r.ok, true, r.reason);
  assert.equal(JSON.stringify(r.data.memos[0].ink), JSON.stringify(PTS));
  assert.equal(r.data.memos[1].ink, IMG);
  assert.equal(r.data.memos[2].ink, null);
  const bad = validateBackup(JSON.stringify({ ...base, version: 4, schema: 4, memos: [memo('2026-11-01', 5)] }));
  assert.equal(bad.ok, false);
});

test('④ makeMemo: prev の ink を引き継ぎ、prev なしは null', () => {
  const m = makeMemo('2026-11-02', '直した', 50, { createdAt: 10, ink: PTS });
  assert.equal(m.createdAt, 10);
  assert.equal(JSON.stringify(m.ink), JSON.stringify(PTS));
  assert.equal(makeMemo('2026-11-02', 'x', 50).ink, null);
  assert.equal(makeMemo('2026-11-02', 'x', 50, { createdAt: 1 }).ink, null);
});

test('⑤ 危険なキーだけが落ち、ほかは変わらない', () => {
  const ink = JSON.parse('{"strokes":[[1,2]],"__proto__":{"x":1},"constructor":1,"prototype":2,"keep":{"a":[1,{"__proto__":3,"b":4}]}}');
  const out = validateBackup(JSON.stringify(buildBackup([], {}, NOW, [], [], [], [note('n1', ink)], [])));
  assert.equal(out.ok, true);
  assert.equal(JSON.stringify(out.data.notes[0].ink), JSON.stringify({ strokes: [[1, 2]], keep: { a: [1, { b: 4 }] } }));
  const mem = JSON.parse(JSON.stringify(buildBackup([], {}, NOW, [], [{ id: '2026-11-01', date: '2026-11-01', text: 'x', createdAt: 1, updatedAt: 2, ink }], [], null, null)));
  assert.equal(JSON.stringify(mem.memos[0].ink), JSON.stringify({ strokes: [[1, 2]], keep: { a: [1, { b: 4 }] } }));
});
