import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlankMemo, makeMemo, SCHEMA_VERSION } from '../js/db.js';

test('空白だけ（全角・改行含む）は空、文字があれば空でない', () => {
  for (const t of ['', ' ', '\n\t', '　 　', null, undefined, 5]) assert.equal(isBlankMemo(t), true);
  for (const t of ['a', ' a ', '　あ']) assert.equal(isBlankMemo(t), false);
});
test('makeMemo: id=date、日付はそのまま、作成時刻は引き継ぐ', () => {
  const m = makeMemo('2026-01-01', 'x', 5);
  assert.deepEqual(m, { id: '2026-01-01', date: '2026-01-01', text: 'x', createdAt: 5, updatedAt: 5, ink: null });
  assert.deepEqual(makeMemo('2026-01-01', 'y', 9, m), { id: '2026-01-01', date: '2026-01-01', text: 'y', createdAt: 5, updatedAt: 9, ink: null });
  assert.equal(makeMemo('2026-12-31', 'z').date, '2026-12-31');
});
test('不正な日付・本文は拒否', () => {
  for (const d of ['2026-02-30', '2026-1-1', '', null, '2026-13-01']) assert.throws(() => makeMemo(d, 'x'));
  assert.throws(() => makeMemo('2026-01-01', 5));
});
test('SCHEMA_VERSION は 4', () => assert.equal(SCHEMA_VERSION, 4));
