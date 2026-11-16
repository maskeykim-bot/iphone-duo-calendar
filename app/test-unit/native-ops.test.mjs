import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, keepAfterReplace, mergeOps, planNativeOps } from '../js/iphone.js';
import { R, ev } from './fixtures.mjs';

const L = (x = {}) => ({ v: 2, state: 'linked', requestId: 'rq1', calendarId: 'c1', itemId: 'i1', externalId: 'x1', eventId: 'e1', seriesStart: '2026-11-02T09:00', ...x });
const single = (x = {}) => ev('s1', '2026-11-12T10:00', '2026-11-12T11:00', null, { nativeLink: L({ seriesStart: undefined }), ...x });
const series = (x = {}) => ev('r1', '2026-11-02T09:00', '2026-11-02T10:00', R('daily'), { nativeLink: L(), ...x });
let n = 0;
const ctx = { newId: () => `id${++n}`, now: 1 };
const plan = (p) => ({ puts: [p], dels: [] });

test('単発の編集 → update/this、削除 → delete/this', () => {
  const p = single();
  const r = planNativeOps(p, plan({ ...p, title: '新' }), 'all', null, { ...p, title: '新' }, ctx);
  assert.equal(r.ops.length, 1);
  assert.deepEqual([r.ops[0].kind, r.ops[0].span, r.ops[0].occurrenceStart, r.ops[0].payload], ['update', 'this', null, { title: '新' }]);
  const d = planNativeOps(p, { puts: [], dels: ['s1'] }, 'all', null, null, ctx);
  assert.deepEqual([d.ops[0].kind, d.ops[0].span], ['delete', 'this']);
});
test('この予定のみ → this と occurrenceStart', () => {
  const p = series(), k = '2026-11-05T09:00';
  const f = { title: 'x', all: false, start: k, end: '2026-11-05T10:00', place: '', notes: '', recurrence: p.recurrence };
  const r = planNativeOps(p, plan(p), 'only', k, f, ctx);
  assert.deepEqual([r.ops[0].span, r.ops[0].occurrenceStart, r.ops[0].payload], ['this', k, { title: 'x' }]);
  const d = planNativeOps(p, plan(p), 'only', k, null, ctx);
  assert.deepEqual([d.ops[0].kind, d.ops[0].span, d.ops[0].occurrenceStart], ['delete', 'this', k]);
});
test('これ以降 → future、np は別の requestId と pending', () => {
  const p = series(), k = '2026-11-05T09:00';
  const np = ev('np1', k, '2026-11-05T10:00', R('daily'), { title: '新' });
  const r = planNativeOps(p, { puts: [p, np], dels: [] }, 'following', k, { ...np }, ctx);
  const o = r.ops[0];
  assert.deepEqual([o.span, o.occurrenceStart, o.newParentId], ['future', k, 'np1']);
  const got = r.plan.puts.find((e) => e.id === 'np1').nativeLink;
  assert.equal(got.state, 'pending');
  assert.notEqual(got.requestId, 'rq1');
  assert.equal(got.requestId, o.newRequestId);
  assert.equal(r.plan.puts.find((e) => e.id === 'r1').nativeLink.requestId, 'rq1');
});
test('最初の回のこれ以降・すべて → all、seriesStart', () => {
  const p = series(), k = '2026-11-02T09:00';
  const f = { title: 'y', all: false, start: k, end: '2026-11-02T10:00', place: '', notes: '', recurrence: p.recurrence };
  for (const sc of ['all', 'following']) {
    const r = planNativeOps(p, plan({ ...p, title: 'y' }), sc, k, f, ctx);
    assert.deepEqual([r.ops[0].span, r.ops[0].occurrenceStart], ['all', k]);
  }
});
test('カテゴリだけ・unlinked・結びつきなし → 積まない', () => {
  const p = single();
  assert.equal(planNativeOps(p, plan({ ...p, categoryId: 'c-x' }), 'all', null, { ...p, categoryId: 'c-x' }, ctx).ops.length, 0);
  const u = single({ nativeLink: L({ state: 'unlinked' }) });
  assert.equal(planNativeOps(u, plan({ ...u, title: 'z' }), 'all', null, u, ctx).ops.length, 0);
  const none = ev('q', '2026-11-12T10:00', '2026-11-12T11:00', null);
  assert.equal(planNativeOps(none, plan({ ...none, title: 'z' }), 'all', null, none, ctx).ops.length, 0);
});
test('alarms だけの変更 → payload は alarms だけ', () => {
  const p = single({ alarms: [{ before: 30 }] });
  const a = { ...p, alarms: [{ before: 10 }] };
  assert.deepEqual(planNativeOps(p, plan(a), 'all', null, a, ctx).ops[0].payload, { alarms: [{ before: 10 }] });
  const b = { ...p, alarms: [] };
  assert.deepEqual(planNativeOps(p, plan(b), 'all', null, b, ctx).ops[0].payload, { alarms: [] });
});
test('日時は start/end/all を一組で載せる', () => {
  const p = single(), a = { ...p, end: '2026-11-12T12:00' };
  assert.deepEqual(planNativeOps(p, plan(a), 'all', null, a, ctx).ops[0].payload, { start: p.start, end: a.end, all: false });
});
test('単発 → 繰り返しは recurrence を載せる', () => {
  const p = single(), a = { ...p, recurrence: R('weekly', { byDay: [4] }) };
  const o = planNativeOps(p, plan(a), 'all', null, a, ctx).ops[0];
  assert.equal(o.span, 'this');
  assert.equal(o.payload.recurrence.freq, 'weekly');
});
test('同じ eventKey・span・回の update は 1 件に統合、別の回は別', () => {
  const p = single(), mk = (x) => planNativeOps(p, plan({ ...p, ...x }), 'all', null, { ...p, ...x }, ctx).ops[0];
  let l = mergeOps([], [mk({ title: 'a' })]);
  l = mergeOps(l, [mk({ place: 'b' })]);
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].payload, { title: 'a', place: 'b' });
  const s = series(), k1 = '2026-11-05T09:00', k2 = '2026-11-06T09:00';
  const only = (k) => planNativeOps(s, plan(s), 'only', k, { title: 'x', all: false, start: k, end: k.replace('09:00', '10:00'), place: '', notes: '', recurrence: s.recurrence }, ctx).ops[0];
  assert.equal(mergeOps(mergeOps([], [only(k1)]), [only(k2)]).length, 2);
});
test('送信中の操作へは統合しない', () => {
  const p = single(), a = { ...p, title: 'a' };
  const o1 = planNativeOps(p, plan(a), 'all', null, a, ctx).ops[0];
  const o2 = planNativeOps(p, plan({ ...p, place: 'b' }), 'all', null, { ...p, place: 'b' }, ctx).ops[0];
  assert.equal(mergeOps([o1], [o2], o1.opId).length, 2);
});
test('delete は範囲内の update だけ除く', () => {
  const s = series(), k1 = '2026-11-05T09:00', k2 = '2026-11-09T09:00';
  const up = (k) => planNativeOps(s, plan(s), 'only', k, { title: 'x', all: false, start: k, end: k.replace('09:00', '10:00'), place: '', notes: '', recurrence: s.recurrence }, ctx).ops[0];
  const base = mergeOps(mergeOps([], [up(k1)]), [up(k2)]);
  const del1 = planNativeOps(s, plan(s), 'only', k1, null, ctx).ops;
  assert.equal(mergeOps(base, del1).filter((o) => o.kind === 'update').length, 1);
  const delF = planNativeOps(s, plan(s), 'following', k1, null, ctx).ops;
  const r = mergeOps(base, delF);
  assert.deepEqual(r.map((o) => o.kind), ['delete']);
  const p = single(), a = { ...p, title: 'a' };
  const u = planNativeOps(p, plan(a), 'all', null, a, ctx).ops;
  assert.deepEqual(mergeOps(u, planNativeOps(p, plan(p), 'all', null, null, ctx).ops).map((o) => o.kind), ['delete']);
});
test('drop は積まずに範囲内の update を止める', () => {
  const p = single(), a = { ...p, title: 'a' };
  const u = planNativeOps(p, plan(a), 'all', null, a, ctx).ops;
  assert.deepEqual(mergeOps(u, planNativeOps(p, plan(p), 'all', null, null, { ...ctx, dropOnly: true }).ops), []);
});
test('新系列の確定待ちの np への編集は waiting のとき積める', () => {
  const np = ev('np1', '2026-11-05T09:00', '2026-11-05T10:00', null, { nativeLink: { v: 2, state: 'pending', requestId: 'rq2', calendarId: 'c1' } });
  const a = { ...np, title: 'z' };
  assert.equal(planNativeOps(np, plan(a), 'all', null, a, ctx).ops.length, 0);
  assert.equal(planNativeOps(np, plan(a), 'all', null, a, { ...ctx, waiting: new Set(['np1']) }).ops.length, 1);
});
test('置換の読み込みは eventKey と requestId が両方一致する待ちだけ残す', () => {
  const p = single(), a = { ...p, title: 'a' };
  const u = planNativeOps(p, plan(a), 'all', null, a, ctx).ops;
  assert.equal(keepAfterReplace(u, [p]).length, 1);
  assert.equal(keepAfterReplace(u, [{ ...p, nativeLink: L({ requestId: 'other' }) }]).length, 0);
  assert.equal(keepAfterReplace(u, []).length, 0);
});
test('dedupe: 削除待ちの外部予定を隠す（範囲を守る）', () => {
  const x = (start) => ({ id: 'ip:' + start, eventId: 'e1', requestId: null, start });
  const ext = [x('2026-11-05T09:00'), x('2026-11-06T09:00')];
  const del = (span, occ) => ({ kind: 'delete', span, occurrenceStart: occ, link: L() });
  assert.equal(dedupe(ext, [], [del('all', null)]).length, 0);
  assert.equal(dedupe(ext, [], [del('this', '2026-11-05T09:00')]).length, 1);
  assert.equal(dedupe(ext, [], [del('future', '2026-11-06T09:00')]).length, 1);
  assert.equal(dedupe(ext, [], []).length, 2);
});

// ---- 第15版 PR6: 別の iPhone カレンダーへの移動 ----
test('移動: ctx.moveTo が現在先と違えば payload.calendarId だけの update（日時・通知は載せない）', () => {
  const p = single();
  const r = planNativeOps(p, plan(p), 'all', null, { ...p }, { ...ctx, moveTo: 'c2' });
  assert.equal(r.ops.length, 1);
  assert.deepEqual([r.ops[0].kind, r.ops[0].span, r.ops[0].payload], ['update', 'this', { calendarId: 'c2' }]);
  assert.equal(planNativeOps(p, plan(p), 'all', null, { ...p }, { ...ctx, moveTo: 'c1' }).ops.length, 0); // 同じ先は何も送らない
});
test('移動: 本文の変更と同時でも日時・alarms は変えたものだけ', () => {
  const p = single();
  const r = planNativeOps(p, plan({ ...p, title: '新' }), 'all', null, { ...p, title: '新' }, { ...ctx, moveTo: 'c2' });
  assert.deepEqual(r.ops[0].payload, { title: '新', calendarId: 'c2' });
});
test('移動: 繰り返しは「すべて」だけ。この回・これ以降では calendarId を載せない', () => {
  const p = series(), k = '2026-11-05T09:00';
  const f = { title: 'x', all: false, start: k, end: '2026-11-05T10:00', place: '', notes: '', recurrence: p.recurrence };
  assert.equal(planNativeOps(p, plan(p), 'only', k, f, { ...ctx, moveTo: 'c2' }).ops[0].payload.calendarId, undefined);
  const all = planNativeOps(p, plan(p), 'all', k, { ...p }, { ...ctx, moveTo: 'c2' });
  assert.deepEqual([all.ops[0].span, all.ops[0].payload], ['all', { calendarId: 'c2' }]);
});
test('mergeOps: 未送信のまま元の先へ戻すと calendarId が消え、空になった更新は捨てる', () => {
  const p = single();
  const a = planNativeOps(p, plan(p), 'all', null, { ...p }, { ...ctx, moveTo: 'c2' }).ops;
  const back = [{ ...a[0], opId: 'o2', payload: { calendarId: 'c1' } }];
  assert.deepEqual(mergeOps(mergeOps([], a), back), []);
  const b = [{ ...a[0], opId: 'o3', payload: { title: 't', calendarId: 'c1' } }];
  assert.deepEqual(mergeOps(mergeOps([], a), b)[0].payload, { title: 't' });
});
