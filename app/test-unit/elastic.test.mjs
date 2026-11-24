// 第19.5版: 閉じた画面の日の欄「時間」の、伸び縮みする時間軸（js/elastic.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elasticHours, elasticMap, solveHh, SLOTS } from '../js/elastic.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const mapOf = (bs, hh, min = 44) => elasticMap(elasticHours(bs, hh, min));

test('予定がなければ時刻に比例（1時間 hh）。分→位置→分で元に戻る', () => {
  const m = mapOf([], 14);
  assert.equal(elasticHours([], 14, 44).length, SLOTS);
  assert.ok(near(m.total, 14 * 24));
  for (const t of [0, 7, 540, 615, 1439, 1440]) { assert.ok(near(m.y(t), t * 14 / 60)); assert.ok(near(m.min(m.y(t)), t)); }
});

test('カードが minCard より低くなる予定の時間だけ広がる。予定のない時間は詰まったまま', () => {
  const m = mapOf([{ s: 600, en: 660 }], 14); // 10:00〜11:00
  assert.ok(near(m.y(660) - m.y(600), 44));
  assert.ok(near(m.y(600), 600 * 14 / 60)); // 予定より前は変わらない
  assert.ok(near(m.y(720) - m.y(660), 14)); // 予定のあとの1時間も 14
  assert.ok(near(m.total, 14 * 23 + 44));
});

test('30分の予定は、その30分だけが広がる（同じ時間の残り30分は詰まったまま）', () => {
  const m = mapOf([{ s: 1080, en: 1110 }], 14); // 18:00〜18:30
  assert.ok(near(m.y(1110) - m.y(1080), 44));
  assert.ok(near(m.y(1140) - m.y(1110), 7));
});

test('十分に高い予定は広げない（長さどおり）', () => {
  const m = mapOf([{ s: 540, en: 780 }], 14); // 4時間 = 56
  assert.ok(near(m.y(780) - m.y(540), 56));
  assert.ok(near(mapOf([{ s: 540, en: 600 }], 56).total, 56 * 24));
});

test('続けて並ぶ短い予定は、どれも minCard 以上で、時刻の順のまま重ならない', () => {
  const bs = [{ s: 600, en: 615 }, { s: 615, en: 630 }, { s: 630, en: 700 }, { s: 705, en: 720 }];
  const m = mapOf(bs, 14);
  for (const b of bs) assert.ok(m.y(b.en) - m.y(b.s) >= 44 - 1e-6, JSON.stringify(b));
  for (let i = 1; i < bs.length; i++) assert.ok(m.y(bs[i].s) >= m.y(bs[i - 1].en) - 1e-6);
});

test('重なる予定（列を分ける予定）も、それぞれ minCard 以上', () => {
  const bs = [{ s: 600, en: 660 }, { s: 630, en: 645 }];
  const m = mapOf(bs, 14);
  for (const b of bs) assert.ok(m.y(b.en) - m.y(b.s) >= 44 - 1e-6);
});

test('位置は時刻について単調。位置→分は端の外でも続く（指の動きを切らない）', () => {
  const m = mapOf([{ s: 0, en: 30 }, { s: 1380, en: 1440 }], 14);
  let prev = -1; for (let t = 0; t <= 1440; t += 5) { const y = m.y(t); assert.ok(y > prev); prev = y; assert.ok(near(m.min(y), t, 1e-6)); }
  assert.ok(m.min(-10) < 0); assert.ok(m.min(m.total + 10) > 1440);
});

test('15分の区切りに合わない予定（10:10〜10:40）も minCard 以上', () => {
  const m = mapOf([{ s: 610, en: 640 }], 14);
  assert.ok(m.y(640) - m.y(610) >= 44 - 1e-6);
});

test('solveHh: 見えている範囲の高さが target になる 1時間の高さ。端では lo・hi で止まる', () => {
  const bs = ['9', '10', '11', '12', '13'].map((h) => ({ s: h * 60, en: h * 60 + 30 })), vis = (hh) => { const m = mapOf(bs, hh); return m.y(1140) - m.y(540); };
  assert.ok(near(vis(14), 220 + 7.5 * 14)); assert.ok(near(vis(56), 220 + 7.5 * 56));
  assert.ok(near(solveHh(bs, 44, 540, 1140, vis(14) + 60, 14, 56), 22, 1e-3)); // 60 引くと 14 + 60 / 7.5
  assert.equal(solveHh(bs, 44, 540, 1140, vis(14) - 50, 14, 56), 14);
  assert.equal(solveHh(bs, 44, 540, 1140, vis(56) + 50, 14, 56), 56);
});
