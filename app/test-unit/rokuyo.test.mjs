// 六曜の単体テスト（案。app/test-unit/rokuyo.test.mjs として入れる想定。fixtures は test-unit/fixtures/ に置く）。
// npm run test:unit で東京とニューヨークの2つのタイムゾーンで走る。
// 正解は、国立天文台の朔・中気から別に作った旧暦の月初め（fixtures/nao-sakugetsu-2025-2030.json）。表（rokuyo-table.js）どうしは比べない（品質 RK-3）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rokuyoOf, ROKUYO_NAMES, ROKUYO_RANGE } from '../js/rokuyo.js';
import { ROKUYO_TABLE } from '../js/rokuyo-table.js';

const NAO = JSON.parse(readFileSync(new URL('./fixtures/nao-sakugetsu-2025-2030.json', import.meta.url)));
const plus = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const each = (a, b, f) => { for (let d = a; d <= b; d = plus(d, 1)) f(d); };

test('表全体: 2000-01-01〜2050-12-31 の全日付で値があり、月は29/30日、閏月を除き番号が1つずつ進む', () => {
  assert.deepEqual(ROKUYO_RANGE, { from: '2000-01-01', to: '2050-12-31' });
  assert.match(ROKUYO_TABLE.lens, /^[01]+$/);
  let prev = null, n = 0, leaps = 0;
  each('2000-01-01', '2050-12-31', (d) => {
    const r = rokuyoOf(d); n++;
    assert.ok(r, d);
    assert.equal(r.name, ROKUYO_NAMES[(r.month + r.day) % 6], d);
    assert.ok(r.day >= 1 && r.day <= 30, d);
    if (prev && r.day === 1) {
      assert.ok(prev.day === 29 || prev.day === 30, d);
      if (r.leap) { leaps++; assert.equal(r.month, prev.month, `${d} 閏月は前の月と同じ番号`); }
      else assert.equal(r.month, prev.month % 12 + 1, d);
    } else if (prev) { assert.equal(r.day, prev.day + 1, d); assert.equal(r.month, prev.month, d); }
    prev = r;
  });
  assert.equal(n, 18628);
  assert.equal(leaps, 19); // 2001〜2050 の閏月（2000-01-01 より前に始まる閏月はない）
});

test('国立天文台の朔・中気から作った正解と、2025〜2030年の全日付（2191日）が一致する', () => {
  const ms = NAO.months;
  let i = 0, n = 0;
  each('2025-01-01', '2030-12-31', (d) => {
    while (i + 1 < ms.length && ms[i + 1].start <= d) i++;
    const m = ms[i];
    const day = (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${m.start}T00:00:00Z`)) / 864e5 + 1;
    const r = rokuyoOf(d);
    assert.deepEqual([r.month, r.day, r.leap, r.index], [m.month, day, m.leap, (m.month + day) % 6], d);
    n++;
  });
  assert.equal(n, 2191);
});

test('閏月の年: 2025年の閏6月と2028年の閏5月、月の変わり目の前後', () => {
  const cases = [
    ['2025-07-24', 6, 30, false, '大安'], ['2025-07-25', 6, 1, true, '赤口'], ['2025-08-22', 6, 29, true, '仏滅'], ['2025-08-23', 7, 1, false, '先勝'],
    ['2028-06-22', 5, 30, false, '仏滅'], ['2028-06-23', 5, 1, true, '大安'], ['2028-07-21', 5, 29, true, '先負'], ['2028-07-22', 6, 1, false, '赤口'],
    ['2026-02-16', 12, 29, false, '仏滅'], ['2026-02-17', 1, 1, false, '先勝'], // 旧正月は必ず先勝
  ];
  for (const [d, m, day, leap, name] of cases) assert.deepEqual((({ month, day: dd, leap: l, name: nm }) => [month, dd, l, nm])(rokuyoOf(d)), [m, day, leap, name], d);
});

test('2033〜2034年は閏11月（国立天文台の案1、こよみのページと同じ）', () => {
  assert.deepEqual([rokuyoOf('2033-11-22').month, rokuyoOf('2033-11-22').leap], [11, false]);
  assert.deepEqual([rokuyoOf('2033-12-22').month, rokuyoOf('2033-12-22').leap], [11, true]);
  assert.deepEqual([rokuyoOf('2034-01-20').month, rokuyoOf('2034-02-19').month, rokuyoOf('2034-02-19').leap], [12, 1, false]);
  assert.equal(rokuyoOf('2033-09-23').month, 9); // 秋分が9月に入る（案1の性質）
});

test('範囲の外（1999年以前・2051年以降）と不正な値は null で、例外を投げない', () => {
  for (const v of ['1999-12-31', '1900-01-01', '2051-01-01', '2099-12-31', '2026-02-30', '2026-13-01', '2026-1-1', '2026-11-16T00:00', '', 'abc', null, undefined, 20260101, {}]) {
    assert.doesNotThrow(() => rokuyoOf(v), String(v));
    assert.equal(rokuyoOf(v), null, String(v));
  }
  assert.ok(rokuyoOf('2000-01-01')); assert.ok(rokuyoOf('2050-12-31'));
});

test('性能: 18628日を引いて 200ms 未満（Node）', () => {
  const t = performance.now();
  each('2000-01-01', '2050-12-31', (d) => rokuyoOf(d));
  assert.ok(performance.now() - t < 200);
});

test('表のハッシュ値が npm run verify で全範囲を確かめたときの値と同じ（品質 RK-3）', async () => {
  const { createHash } = await import('node:crypto');
  const stamp = JSON.parse(readFileSync(new URL('./fixtures/rokuyo-table.verified.json', import.meta.url)));
  const actual = createHash('sha256').update(readFileSync(new URL('../js/rokuyo-table.js', import.meta.url))).digest('hex');
  assert.equal(actual, stamp.sha256, 'rokuyo-table.js が検証後に変わっています。npm run verify を回してください');
});
