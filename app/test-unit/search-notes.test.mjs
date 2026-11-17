import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchNotes, LIMIT, noteIndexSize } from '../js/search.js';

const N = (id, body, updatedAt, extra = {}) => ({ id, body, title: body.split('\n')[0], updatedAt, folderId: null, deletedAt: null, ...extra });

test('searchNotes: 印なしAND・全角半角カナ・題名と本文・更新の新しい順', () => {
  const r = searchNotes([N('a', 'ﾗﾝﾁ\n店', 1), N('b', '予定\nらんち と MEMO', 3), N('c', 'ランチだけ', 2)], 'ランチ ＭＥＭＯ');
  assert.deepEqual(r.items.map((n) => n.id), ['b']);
  assert.deepEqual(searchNotes([N('a', 'ﾗﾝﾁ', 1), N('b', 'らんち', 3), N('c', 'ランチ', 2)], 'ランチ').items.map((n) => n.id), ['b', 'c', 'a']);
});
test('searchNotes: フォルダを見ず全ノート。deletedAt 付きは除く', () => {
  const r = searchNotes([N('a', 'x', 1, { folderId: 'f1' }), N('b', 'x', 2, { folderId: null }), N('c', 'x', 3, { deletedAt: 5 })], 'x');
  assert.deepEqual(r.items.map((n) => n.id), ['b', 'a']);
});
test('searchNotes: 元の日付でも一致し、空語は全件（削除済み除く）', () => {
  assert.equal(searchNotes([N('a', 'z', 1, { sourceDate: '2026-11-01' })], '2026-11-01').total, 1);
  assert.equal(searchNotes([N('a', 'z', 1), N('b', 'y', 2)], '').total, 2);
});
test('searchNotes: 既定は別枠200件、limit:null は上限なし', () => {
  const many = Array.from({ length: 450 }, (_, i) => N(`n${i}`, `x${i}`, i));
  const r = searchNotes(many, 'x');
  assert.equal(r.items.length, LIMIT); assert.equal(r.total, 450); assert.equal(r.capped, true);
  const all = searchNotes(many, 'x', { limit: null });
  assert.equal(all.items.length, 450); assert.equal(all.capped, false);
});
test('searchNotes: 正規化は変わった1件だけ作り直す／消えたIDは掃除', () => {
  const a = N('a', 'ABC', 1), b = N('b', 'ABD', 2);
  assert.equal(searchNotes([a, b], 'abc').total, 1);
  const a2 = { ...a, body: 'XYZ', title: 'XYZ' };
  assert.equal(searchNotes([a2, b], 'abc').total, 0);
  assert.equal(searchNotes([a2, b], 'xyz').total, 1);
  const big = Array.from({ length: 300 }, (_, i) => N(`k${i}`, `q${i}`, i));
  searchNotes(big, 'q'); searchNotes([a], 'a');
  assert.ok(noteIndexSize() < 300);
});
test('searchNotes: 40000件の測定（Nodeの実測。実機の合格値には流用しない）', () => {
  const rows = Array.from({ length: 40000 }, (_, i) => N(`n${i}`, `ノート${i}\n本文 ﾗﾝﾁ ${i % 7} 日本語の本文です`, i, { pinned: i % 100 === 0 }));
  const t0 = performance.now(); const cold = searchNotes(rows, 'らんち 3', { limit: null }); const t1 = performance.now();
  const warm = searchNotes(rows, 'らんち 3', { limit: null }); const t2 = performance.now();
  console.log(`# node 40000件 正規化込み検索 ${(t1 - t0).toFixed(0)}ms / 再検索 ${(t2 - t1).toFixed(0)}ms`);
  assert.equal(cold.total, warm.total);
  assert.ok(cold.total > 5000);
  assert.equal(searchNotes(rows, '', { limit: null }).items.length, 40000);
});
