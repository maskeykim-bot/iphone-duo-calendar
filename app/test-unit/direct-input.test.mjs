import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPressMachine, minutesAt, dragRange, dayAt, dayRange, rangeText, snap15 } from '../js/direct-input.js';

function rig(extra = {}) {
  let t = 0, timers = [];
  const log = [];
  const m = createPressMachine({
    now: () => t,
    setTimer: (f, ms) => { const o = { f, at: t + ms }; timers.push(o); return o; },
    clearTimer: (o) => { timers = timers.filter((x) => x !== o); },
    onConfirm: (s) => log.push(['confirm', s.pointerType]),
    onMove: () => log.push(['move']),
    onEnd: () => log.push(['end']),
    onCancel: (r) => log.push(['cancel', r]),
    onRelease: (r) => log.push(['release', r]),
    ...extra,
  });
  const adv = (ms) => { t += ms; for (const o of [...timers]) if (o.at <= t) { timers = timers.filter((x) => x !== o); o.f(); } };
  return { m, log, adv, set: (v) => { t = v; } };
}
const P = (id = 1, x = 0, y = 0, type = 'touch') => ({ id, x, y, type });

test('349ms は確定せず tap、350ms で確定', () => {
  let r = rig(); r.m.down(P()); r.adv(349); assert.equal(r.m.state, 'waiting'); r.m.up(P()); assert.deepEqual(r.log, [['release', 'tap']]);
  r = rig(); r.m.down(P()); r.adv(350); assert.equal(r.m.state, 'dragging'); r.m.up(P()); assert.deepEqual(r.log, [['confirm', 'touch'], ['end']]);
});
test('タイマーが遅れても up 時刻が350ms以上なら確定', () => {
  const r = rig(); r.m.down(P()); r.set(350); r.m.up(P());
  assert.deepEqual(r.log.map((l) => l[0]), ['confirm', 'end']);
  const r2 = rig(); r2.m.down(P()); r2.set(349); r2.m.up(P()); assert.deepEqual(r2.log, [['release', 'tap']]);
});
test('待機中に8px超動くと通常 scroll に任せる／8pxちょうどは待機のまま', () => {
  let r = rig(); r.m.down(P()); r.m.move(P(1, 0, 8)); assert.equal(r.m.state, 'waiting');
  r.m.move(P(1, 0, 9)); assert.equal(r.m.state, 'idle'); r.adv(500); assert.deepEqual(r.log, [['release', 'moved']]);
});
test('確定後の移動は onMove、他ポインタの移動は無視', () => {
  const r = rig(); r.m.down(P()); r.adv(350); r.m.move(P(1, 50, 50)); r.m.move(P(2, 9, 9)); assert.deepEqual(r.log.map((l) => l[0]), ['confirm', 'move']);
});
test('2指目で待機中・確定後とも中止', () => {
  let r = rig(); r.m.down(P()); r.m.down(P(2)); r.adv(400); assert.deepEqual(r.log, [['release', 'multi']]);
  r = rig(); r.m.down(P()); r.adv(350); r.m.down(P(2)); assert.deepEqual(r.log, [['confirm', 'touch'], ['cancel', 'multi']]); assert.equal(r.m.state, 'idle');
});
test('cancel: 待機中は release、確定後は cancel、idle は無反応。以後 up は無視（二重反応なし）', () => {
  let r = rig(); r.m.down(P()); r.m.cancel('pointercancel'); r.m.up(P()); r.adv(500); assert.deepEqual(r.log, [['release', 'pointercancel']]);
  r = rig(); r.m.down(P()); r.adv(350); r.m.cancel('hidden'); r.m.up(P()); assert.deepEqual(r.log, [['confirm', 'touch'], ['cancel', 'hidden']]);
  r = rig(); r.m.cancel(); assert.deepEqual(r.log, []);
});
test('ペンは待たず即確定', () => {
  const r = rig(); r.m.down(P(1, 0, 0, 'pen')); assert.deepEqual(r.log, [['confirm', 'pen']]);
});
test('ペイン独立: 機械を2つ作ると互いに干渉しない', () => {
  const a = rig(), b = rig(); a.m.down(P()); a.adv(350); assert.equal(b.m.state, 'idle'); assert.equal(a.m.state, 'dragging');
});

test('15分境界の量子化（60pt/時、15pt刻み）', () => {
  assert.equal(snap15(14), 0); assert.equal(snap15(15), 15); assert.equal(snap15(29), 15);
  assert.equal(minutesAt(100 + 14, 100, 0, 60), 0);
  assert.equal(minutesAt(100 + 15, 100, 0, 60), 15);
  assert.equal(minutesAt(100 + 59, 100, 0, 60), 45);
  assert.equal(minutesAt(100 + 10 + 15, 100, 10, 60), 15); // pad
  assert.equal(minutesAt(0, 100, 0, 60), 0); assert.equal(minutesAt(99999, 100, 0, 60), 1440);
  assert.equal(minutesAt(100 + 30, 100, 0, 120), 15); // ペインごとの hh
});
test('dragRange: 初期30分・伸縮・逆方向・最小15分・日境界', () => {
  assert.deepEqual(dragRange(930, 930), { start: 930, end: 960 });
  assert.deepEqual(dragRange(930, 1020), { start: 930, end: 1020 });
  assert.deepEqual(dragRange(930, 840), { start: 840, end: 930 });
  assert.deepEqual(dragRange(930, 945), { start: 930, end: 945 });
  assert.deepEqual(dragRange(1425, 1440), { start: 1425, end: 1440 });
  assert.deepEqual(dragRange(1425, 1425), { start: 1410, end: 1440 });
  assert.deepEqual(dragRange(0, -30), { start: 0, end: 15 });
});
test('dayAt / dayRange', () => {
  const rs = [{ key: 'a', left: 0, right: 10, top: 0, bottom: 10 }, { key: 'b', left: 10, right: 20, top: 0, bottom: 10 }];
  assert.equal(dayAt(9, 5, rs), 'a'); assert.equal(dayAt(10, 5, rs), 'b'); assert.equal(dayAt(20, 5, rs), null);
  assert.deepEqual(dayRange('2026-11-20', '2026-11-18'), { start: '2026-11-18', end: '2026-11-20', days: 3 });
  assert.deepEqual(dayRange('2026-11-30', '2026-12-02'), { start: '2026-11-30', end: '2026-12-02', days: 3 });
  assert.equal(dayRange('2026-11-18', '2026-11-18').days, 1);
});

// ---- PR25 ----
import { tapRange, moveHandle, spanText, durText } from '../js/direct-input.js';
test('tapRange: 15分刻み・1時間・日末で詰める', () => {
  assert.deepEqual(tapRange(14 * 60 + 20), { start: 14 * 60 + 15, end: 15 * 60 + 15 });
  assert.deepEqual(tapRange(23 * 60 + 50), { start: 23 * 60, end: 1440 });
  assert.deepEqual(tapRange(0), { start: 0, end: 60 });
});
test('moveHandle: 最小15分・日境界 clamp', () => {
  const r = { start: 600, end: 660 };
  assert.deepEqual(moveHandle(r, 'end', 600), { start: 600, end: 615 });
  assert.deepEqual(moveHandle(r, 'end', 9999), { start: 600, end: 1440 });
  assert.deepEqual(moveHandle(r, 'start', 700), { start: 645, end: 660 });
  assert.deepEqual(moveHandle(r, 'start', -50), { start: 0, end: 660 });
});
test('spanText / durText', () => {
  assert.equal(spanText({ start: 930, end: 1020 }), '15:30〜17:00（1時間30分）');
  assert.equal(durText(30), '30分'); assert.equal(durText(60), '1時間'); assert.equal(durText(135), '2時間15分');
});

test('rangeText: 同月・月またぎ・1日・逆方向', () => {
  assert.equal(rangeText('2026-11-18', '2026-11-20'), '11月18日〜20日（3日間）');
  assert.equal(rangeText('2026-12-02', '2026-11-30'), '11月30日〜12月2日（3日間）');
  assert.equal(rangeText('2026-11-18', '2026-11-18'), '11月18日（1日）');
});
