// 第19.2版 S11b（R-75・§12 Q-13）: 閉じた画面の7段で月のチップを長押しして別の日へ落とす。
// 新しい処理はなく、開いた画面と同じ R-49 の moveTimes / planMoveDuo をそのまま通る（app.js の moveGrabbed と同じ式で実効日を出す）。
// NY の夏時間の境（2026-03-08 と 2026-11-01）をまたいでも、時刻の文字列は変わらず日付だけ変わる。1日1本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { moveTimes, planMoveDuo, planMoveDuoUndo } from '../js/move-day.js';
import { addDays, dayOf, parseKey } from '../js/util.js';

const dayDiffKeys = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);
// moveGrabbed と同じ: つかんだマス（fromDay）から落としたマス（toDay）への日数の差を、予定の開始日に足す
const eff = (occ, fromDay, toDay) => addDays(dayOf(occ.start), dayDiffKeys(toDay, fromDay || dayOf(occ.start)));
const P = (o = {}) => ({ id: 'a', title: '定例', categoryId: 'c', all: false, start: '', end: '', place: '', notes: '', recurrence: null, exdates: [], overrides: {}, ...o });

function boundaryCase(day, before, after) {
  // ① 時刻つき単日のチップを、境の前の日→後の日へ。時刻（1:30 や 9:00 など）はそのまま
  for (const t of ['00:30', '01:30', '09:00', '23:30']) {
    const p = P({ start: `${before}T${t}`, end: `${before}T23:45` > `${before}T${t}` ? `${before}T23:45` : `${before}T23:59` });
    const m = planMoveDuo(p, p, null, eff(p, before, after), () => 'n');
    assert.equal(m.after.start, `${after}T${t}`, `${before}→${after} ${t}`);
    assert.equal(m.note, null);
    const u = planMoveDuoUndo(m.puts[0], m.puts[0], m.undo, () => 'n'); // 元に戻す
    assert.equal(u.puts[0].start, p.start); assert.equal(u.puts[0].end, p.end);
  }
  // ② 3日の終日の帯の「真ん中のマス」をつかんで落とす。長さは保つ（つかんだ日の差だけ全体が動く）
  const band = P({ all: true, start: `${before}T00:00`, end: `${addDays(before, 2)}T23:59` });
  const mid = addDays(before, 1);
  const mb = planMoveDuo(band, band, null, eff(band, mid, addDays(mid, 2)), () => 'n');
  assert.equal(mb.after.start, `${addDays(before, 2)}T00:00`); assert.equal(mb.after.end, `${addDays(before, 4)}T23:59`);
  // ③ 繰り返しの1回だけが動く（その回の例外）。時刻は同じ
  const rec = P({ start: `${addDays(before, -2)}T09:00`, end: `${addDays(before, -2)}T10:00`, recurrence: { freq: 'daily', interval: 1 } });
  const occKey = `${before}T09:00`, occ = { ...rec, start: `${before}T09:00`, end: `${before}T10:00` };
  const mr = planMoveDuo(rec, occ, occKey, eff(occ, before, after), () => 'new1');
  assert.equal(mr.after.start, `${after}T09:00`); assert.equal(mr.after.end, `${after}T10:00`);
  assert.equal(mr.note, null);
  // ④ moveTimes そのもの（日付だけ変わる）
  const r = moveTimes({ start: `${before}T01:30`, end: `${before}T02:15` }, after, before);
  assert.equal(r.start.slice(10), 'T01:30'); assert.equal(r.start.slice(0, 10), after);
}

test('閉じた画面からの落とし: 2026-03-08（NY 夏時間の始まり）の前後で、日付だけ変わり時刻はずれない', () => {
  boundaryCase('2026-03-08', '2026-03-07', '2026-03-09');
  // 2:00〜2:59 が無い日へ直接落とす（時刻の文字は 1:30 など存在する時刻のまま）
  const p = P({ start: '2026-03-07T01:30', end: '2026-03-07T01:45' });
  const m = planMoveDuo(p, p, null, eff(p, '2026-03-07', '2026-03-08'), () => 'n');
  assert.equal(m.after.start, '2026-03-08T01:30');
});
test('閉じた画面からの落とし: 2026-11-01（NY 夏時間の終わり）の前後で、日付だけ変わり時刻はずれない', () => {
  boundaryCase('2026-11-01', '2026-10-31', '2026-11-02');
  // 1:00〜1:59 が2回ある日へ落とす
  const p = P({ start: '2026-10-31T01:30', end: '2026-10-31T01:45' });
  const m = planMoveDuo(p, p, null, eff(p, '2026-10-31', '2026-11-01'), () => 'n');
  assert.equal(m.after.start, '2026-11-01T01:30');
  assert.equal(m.note, null);
});
