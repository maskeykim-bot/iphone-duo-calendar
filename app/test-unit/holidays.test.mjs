// 祝日の単体テスト（案。app/test-unit/holidays.test.mjs として入れる想定。fixtures は test-unit/fixtures/ に置く）。
// npm run test で東京とニューヨークの2つのタイムゾーンで走る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { holidayOf, holidayMeta, HOLIDAYS_RANGE } from '../js/holidays.js';
import { HOLIDAYS_TABLE } from '../js/holidays-table.js';

const plus = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const each = (a, b, f) => { for (let d = a; d <= b; d = plus(d, 1)) f(d); };

test('範囲: 1955-01-01〜2050-12-31。officialTo は 2027-12-31', () => {
  assert.deepEqual(HOLIDAYS_RANGE, { from: '1955-01-01', officialTo: '2027-12-31', to: '2050-12-31' });
  assert.equal(HOLIDAYS_TABLE.from, '1955-01-01');
});

test('公式の代表日（名前どおり、official は true）', () => {
  const cases = [
    ['1955-01-01', '元日'],
    ['2026-01-01', '元日'],
    ['2026-01-12', '成人の日'],
    ['2026-02-11', '建国記念の日'],
    ['2026-02-23', '天皇誕生日'],
    ['2026-03-20', '春分の日'],
    ['2026-04-29', '昭和の日'],
    ['2026-05-03', '憲法記念日'],
    ['2026-05-04', 'みどりの日'],
    ['2026-05-05', 'こどもの日'],
    ['2026-05-06', '休日'], // 憲法記念日が日曜のための振替
    ['2026-07-20', '海の日'],
    ['2026-08-11', '山の日'],
    ['2026-09-21', '敬老の日'],
    ['2026-09-22', '休日'], // 敬老の日と秋分の日に挟まれた国民の休日
    ['2026-09-23', '秋分の日'],
    ['2026-10-12', 'スポーツの日'],
    ['2026-11-03', '文化の日'],
    ['2026-11-23', '勤労感謝の日'],
    ['2027-03-21', '春分の日'],
    ['2027-03-22', '休日'],
    ['2027-11-23', '勤労感謝の日'],
  ];
  for (const [d, name] of cases) {
    assert.equal(holidayOf(d), name, d);
    assert.deepEqual(holidayMeta(d), { name, official: true }, d);
  }
  assert.equal(holidayOf('2026-01-02'), null);
  assert.equal(holidayMeta('2026-01-02'), null);
});

test('2019年の即位の特例と、2020・2021年の五輪による移動が公式値どおり入る', () => {
  const cases = [
    ['2019-04-30', '休日'],
    ['2019-05-01', '休日（祝日扱い）'],
    ['2019-05-02', '休日'],
    ['2019-05-05', 'こどもの日'],
    ['2019-05-06', '休日'],
    ['2019-10-14', '体育の日（スポーツの日）'],
    ['2019-10-22', '休日（祝日扱い）'],
    ['2019-02-23', null], // 2019年に天皇誕生日は無い
    ['2019-12-23', null],
    ['2020-07-23', '海の日'],
    ['2020-07-24', 'スポーツの日'],
    ['2020-08-10', '山の日'],
    ['2020-07-20', null], // 通常の第3月曜ではない
    ['2020-08-11', null],
    ['2020-10-12', null], // この年のスポーツの日は7月
    ['2021-07-22', '海の日'],
    ['2021-07-23', 'スポーツの日'],
    ['2021-08-08', '山の日'],
    ['2021-08-09', '休日'],
  ];
  for (const [d, name] of cases) {
    assert.equal(holidayOf(d), name, d);
    if (name) assert.equal(holidayMeta(d).official, true, d);
  }
});

test('過去の儀式の日も公式 CSV の名前のまま入る', () => {
  assert.equal(holidayOf('1959-04-10'), '結婚の儀');
  assert.equal(holidayOf('1989-02-24'), '大喪の礼');
  assert.equal(holidayOf('1990-11-12'), '即位礼正殿の儀');
  assert.equal(holidayOf('1993-06-09'), '結婚の儀');
});

test('2028〜2050年の予定: 国立天文台の春分・秋分表と同じ日付で、official は false', () => {
  const nao = JSON.parse(readFileSync(new URL('./fixtures/holidays/nao-equinox-2020-2050.json', import.meta.url)));
  for (let y = 2028; y <= 2050; y++) {
    const row = nao.years[String(y)];
    assert.equal(holidayOf(row.spring), '春分の日', row.spring);
    assert.equal(holidayOf(row.autumn), '秋分の日', row.autumn);
    assert.equal(holidayMeta(row.spring).official, false, row.spring);
    assert.equal(holidayMeta(row.autumn).official, false, row.autumn);
  }
  // 2028年は現行法どおり（元日・成人の日=第2月曜、振替も「休日」）
  assert.equal(holidayOf('2028-01-01'), '元日');
  assert.equal(holidayOf('2028-01-10'), '成人の日'); // 2028-01-01 は土曜なので第2月曜は10日
  assert.equal(holidayMeta('2028-01-01').official, false);
});

test('範囲の外（1954年以前・2051年以降）と不正な値は null で、例外を投げない', () => {
  for (const v of ['1954-12-31', '1900-01-01', '2051-01-01', '2099-12-31', '2026-02-30', '2026-13-01', '2026-1-1', '2026-11-16T00:00', '', 'abc', null, undefined, 20260101, {}]) {
    assert.doesNotThrow(() => holidayOf(v), String(v));
    assert.equal(holidayOf(v), null, String(v));
    assert.equal(holidayMeta(v), null, String(v));
  }
  assert.equal(holidayOf('1955-01-01'), '元日');
  assert.equal(holidayOf('2050-12-31'), null); // 年末は祝日ではないが、範囲内なので例外なく null
  assert.equal(holidayOf('2050-09-23'), '秋分の日');
});

test('性能: 1955-01-01〜2050-12-31 を引いて 200ms 未満（Node）', () => {
  const t = performance.now();
  let n = 0;
  each('1955-01-01', '2050-12-31', (d) => { holidayOf(d); n++; });
  assert.equal(n, 35064);
  assert.ok(performance.now() - t < 200);
});

test('表のハッシュ値が npm run verify で全範囲を確かめたときの値と同じ', async () => {
  const { createHash } = await import('node:crypto');
  const stamp = JSON.parse(readFileSync(new URL('./fixtures/holidays/holidays-table.verified.json', import.meta.url)));
  const actual = createHash('sha256').update(readFileSync(new URL('../js/holidays-table.js', import.meta.url))).digest('hex');
  assert.equal(actual, stamp.sha256, 'holidays-table.js が検証後に変わっています。npm run verify を回してください');
});

test('内閣府 CSV 1067件がすべて一致し、公式範囲に余分な日がない。予定は409件', () => {
  const csv = readFileSync(new URL('./fixtures/holidays/syukujitsu.utf8.csv', import.meta.url), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
  assert.equal(csv.length, 1067);
  const want = new Map();
  for (const line of csv) {
    const [d, name] = line.split(',');
    const [y, m, dd] = d.split('/');
    want.set(`${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, name.trim());
  }
  let official = 0, predicted = 0;
  each('1955-01-01', '2050-12-31', (d) => {
    const meta = holidayMeta(d);
    if (d <= '2027-12-31') {
      assert.equal(holidayOf(d), want.get(d) ?? null, d);
      if (meta) official++;
    } else if (meta) { assert.equal(meta.official, false, d); predicted++; }
  });
  assert.equal(official, 1067);
  assert.equal(predicted, 409);
});

test('表の先頭に出典・加工・予定値の説明がある', () => {
  const head = readFileSync(new URL('../js/holidays-table.js', import.meta.url), 'utf8').split('\n').slice(0, 5).join('\n');
  assert.match(head, /内閣府/);
  assert.match(head, /PDL1\.0/);
  assert.match(head, /予定/);
});
