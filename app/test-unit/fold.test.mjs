import test from 'node:test';
import assert from 'node:assert/strict';
import { foldGeometry, windowMinutes, rawMinutesAt, foldEdgeZone, labelY, partTitles, openingMinute, alldayHeight } from '../js/fold.js';

const G = (o = {}) => foldGeometry({ head: 82, week: false, rows: 1, cut0: 458, cut1: 500, tabsTop: 863, winBot: 917, ...o });
test('窓の寸法: 日 158〜458 / 500〜917、紙 1056+62、範囲 0:00〜9:07', () => {
  const g = G();
  assert.equal(g.winTop, 158); assert.equal(g.topH, 300); assert.equal(g.botH, 417); assert.equal(g.paperH, 1118); assert.equal(g.smax, 401);
  assert.ok(Math.abs(g.smax * 60 / 44 - (9 * 60 + 7)) < 1);
  const w = G({ week: true });
  assert.equal(w.winTop, 194); assert.equal(w.topH, 264);
});
test('終日の高さ', () => { assert.deepEqual([1, 2, 3].map((n) => alldayHeight(false, n)), [32, 56, 80]); assert.deepEqual([1, 2, 3].map((n) => alldayHeight(true, n)), [24, 42, 60]); });
test('窓の切れ目: 境の時刻が上下で同じ・溝がずれても切れ目は cut に従う', () => {
  for (const [c0, c1] of [[458, 500], [471, 513]]) {
    const g = G({ cut0: c0, cut1: c1 });
    for (const s of [0, 77, 401]) { const w = windowMinutes(g, s); assert.equal(w.top[1], w.bot[0]); }
  }
});
test('指の高さ → 時刻: 折り目の間は境で止まる。タブは y855 として扱う', () => {
  const g = G(), s = 100, tc = (s + g.topH) * 60 / 44;
  assert.ok(Math.abs(rawMinutesAt(g, s, 458) - tc) < 1e-9);
  assert.ok(Math.abs(rawMinutesAt(g, s, 500) - tc) < 1e-9);
  for (const y of [459, 480, 499]) assert.equal(rawMinutesAt(g, s, y), rawMinutesAt(g, s, 458));
  assert.equal(rawMinutesAt(g, s, 900), rawMinutesAt(g, s, 855));
});
test('自動スクロールは外側の端だけ', () => {
  const g = G();
  assert.equal(foldEdgeZone(g, 170), -1); assert.equal(foldEdgeZone(g, 300), 0);
  assert.equal(foldEdgeZone(g, 430), 0); assert.equal(foldEdgeZone(g, 520), 0);
  assert.equal(foldEdgeZone(g, 830), 1); assert.equal(foldEdgeZone(g, 880), 1);
});
test('ラベル: 端 8 以内は内側 8、境と同じ時刻は下の窓だけ', () => {
  assert.equal(labelY(300, 300, 600, 300, false), 8); // 上の端ちょうど → 8
  assert.equal(labelY(600, 300, 600, 300, false), null); // 境は上に出さない
  assert.notEqual(labelY(600, 600, 900, 300, true), null);
  assert.equal(labelY(100, 300, 600, 300, false), null);
});
test('またぐ予定の題名: 30 以上で下にも、30 未満は色だけ。時刻は 34 以上（日だけ）', () => {
  assert.deepEqual(partTitles(58, 30.5, true), { a: { title: true, time: true, small: false }, b: { title: true, time: false, small: false } });
  assert.equal(partTitles(58, 29.5, true).b.title, false);
  assert.equal(partTitles(58, 29.5, false).a.time, false);
  assert.equal(partTitles(10, 25, true).a.title, false); assert.equal(partTitles(10, 25, true).b.title, true);
  const both = partTitles(10, 12, true); assert.equal(both.b.title, true); assert.equal(both.b.small, true); assert.equal(both.a.title, false);
});
test('開いたときの位置', () => {
  assert.equal(openingMinute({ today: true, nowMin: 9 * 60 + 41 }), 8 * 60 + 30);
  assert.equal(openingMinute({ today: false, firstStart: 13 * 60 + 20 }), 12 * 60 + 15);
  assert.equal(openingMinute({ today: false, firstStart: null }), 480);
  assert.equal(openingMinute({ today: true, nowMin: 20 }), 0);
});
