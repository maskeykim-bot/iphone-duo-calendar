import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMemos, LIMIT } from '../js/search.js';

const M = (date, text) => ({ id: date, date, text });
test('searchMemos: 正規化AND・新しい日付順', () => {
  const r = searchMemos([M('2026-01-01', 'ﾗﾝﾁ memo'), M('2027-01-01', 'らんち と MEMO'), M('2026-05-05', 'ランチのみ')], 'ランチ ＭＥＭＯ');
  assert.deepEqual(r.items.map((m) => m.date), ['2027-01-01', '2026-01-01']);
  assert.equal(r.total, 2); assert.equal(r.capped, false);
});
test('searchMemos: 空語は0件、200件上限', () => {
  assert.equal(searchMemos([M('2026-01-01', 'a')], '  ').total, 0);
  const many = Array.from({ length: 250 }, (_, i) => M(`2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}-${i}`, 'x'));
  const r = searchMemos(many, 'x');
  assert.equal(r.items.length, LIMIT); assert.equal(r.total, 250); assert.equal(r.capped, true);
});
