import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, refreshLinks, relink, toDisplay, uniqueRequestIds, withIdent } from '../js/iphone.js';
import { R, ev } from './fixtures.mjs';

const L = (x = {}) => ({ v: 2, state: 'linked', requestId: 'rq1', calendarId: 'c1', itemId: 'i1', externalId: 'x1', eventId: 'e1', seriesStart: '2026-11-12T10:00', ...x });
const single = (x = {}, l = {}) => ev('s1', '2026-11-12T10:00', '2026-11-12T11:00', null, { nativeLink: L(l), ...x });
const series = (rule, l = {}) => ev('r1', '2026-11-02T09:00', '2026-11-02T10:00', rule, { nativeLink: L({ seriesStart: '2026-11-02T09:00', ...l }) });
let n = 0;
const X = (o = {}) => ({ id: `ip:${++n}`, origin: 'iphone', eventId: '', requestId: null, itemId: '', externalId: '', occurrenceDate: null, modifiedAt: null, calId: 'c9', calName: '家族', calSource: 'Google', title: '歯医者', start: '2026-11-12T10:00', end: '2026-11-12T11:00', all: false, ...o });

test('toDisplay: itemId/externalId/occurrenceDate/modifiedAt を保持', () => {
  const d = toDisplay({ id: 'a', eventId: 'e', itemId: 'I', externalId: 'X', occurrenceDate: '2026-11-12T10:00', modifiedAt: 5, start: '2026-11-12T10:00', end: '2026-11-12T11:00', calendarId: 'c' }, null);
  assert.deepEqual([d.itemId, d.externalId, d.occurrenceDate, d.modifiedAt], ['I', 'X', '2026-11-12T10:00', 5]);
});
test('dedupe: itemId／externalId＋開始で除外、開始が違う単発は除外しない', () => {
  const p = single();
  assert.equal(dedupe([X({ itemId: 'i1' })], [p]).length, 0);
  assert.equal(dedupe([X({ externalId: 'x1' })], [p]).length, 0);
  assert.equal(dedupe([X({ externalId: 'x1', start: '2026-11-13T10:00' })], [p]).length, 1);
});
test('dedupe: unlinked の古い requestId では隠さない', () => {
  assert.equal(dedupe([X({ requestId: 'rq1' })], [single({}, { state: 'unlinked' })]).length, 1);
  assert.equal(dedupe([X({ requestId: 'rq1' })], [single({}, { state: 'pending' })]).length, 0);
});
test('dedupe: 系列は seriesStart 以降・until（含む）・count の範囲の回だけ除外', () => {
  const p = series(R('daily', { until: '2026-11-05' }));
  const at = (d) => X({ externalId: 'x1', start: `${d}T09:00`, occurrenceDate: `${d}T09:00` });
  assert.equal(dedupe([at('2026-11-02'), at('2026-11-05')], [p]).length, 0);
  assert.equal(dedupe([at('2026-11-06'), at('2026-11-01')], [p]).length, 2);
  const c = series(R('daily', { count: 2 }));
  assert.equal(dedupe([at('2026-11-03'), at('2026-11-04')], [c]).map((x) => x.start).join(), '2026-11-04T09:00');
});
test('dedupe: 分割前後で UID が同じでも範囲外の回は隠さない', () => {
  const a = series(R('daily', { until: '2026-11-04' })), b = ev('r2', '2026-11-05T09:00', '2026-11-05T10:00', R('daily'), { nativeLink: L({ requestId: 'rq2', itemId: 'i2', seriesStart: '2026-11-05T09:00' }) });
  const x = (d) => X({ externalId: 'x1', start: `${d}T09:00`, occurrenceDate: `${d}T09:00` });
  assert.equal(dedupe([x('2026-11-03'), x('2026-11-08')], [a]).length, 1);
  assert.equal(dedupe([x('2026-11-03'), x('2026-11-08')], [a, b]).length, 0);
});
test('refreshLinks: externalId が空→埋まったときだけ更新、同じなら更新なし', () => {
  const p = single({}, { externalId: undefined, ekIdentifier: undefined, calName: '家族', calSource: 'Google' });
  const r = refreshLinks([p], [X({ requestId: 'rq1', externalId: 'ZZ' })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].link.externalId, 'ZZ'); assert.equal(r[0].link.ekIdentifier, 'ZZ@2026-11-12T10:00');
  assert.equal(refreshLinks([{ ...p, nativeLink: r[0].link }], [X({ requestId: 'rq1', externalId: 'ZZ' })]).length, 0);
  assert.equal(refreshLinks([{ ...p, nativeLink: r[0].link }], [X({ requestId: 'rq1', externalId: 'YY' })])[0].link.externalId, 'YY');
  assert.equal(refreshLinks([p], [X({ requestId: 'rq1', externalId: '' })]).length, 0);
});
test('ekIdentifier: externalId が空なら作らない、externalId@seriesStart', () => {
  assert.equal('ekIdentifier' in withIdent({ seriesStart: 's', externalId: '' }), false);
  assert.equal(withIdent({ seriesStart: 'S', externalId: 'E' }).ekIdentifier, 'E@S');
});
test('relink: URL → externalId の順、itemId が見つかる予定は触らない', () => {
  const p = single();
  assert.equal(relink([p], [X({ itemId: 'i1' })]).length, 0);
  const u = relink([p], [X({ itemId: 'n1', requestId: 'rq1', externalId: 'other', eventId: 'ne' })]);
  assert.deepEqual([u[0].link.matchedBy, u[0].link.itemId, u[0].link.eventId, u[0].link.calendarId], ['url', 'n1', 'ne', 'c9']);
  const e = relink([p], [X({ itemId: 'n2', externalId: 'x1' })]);
  assert.equal(e[0].link.matchedBy, 'external');
  assert.equal(relink([p], [X({ itemId: 'n2', externalId: 'x1', start: '2026-11-13T10:00' })]).length, 0);
});
test('relink: 代わりの照合は復元中・名前記録あり・候補1件のときだけ', () => {
  const p = single({}, { itemId: 'gone', externalId: 'old', requestId: 'rqx', calName: '家族', calSource: 'Google' });
  const c = [X({ itemId: 'n1', title: 'ts1' })];
  assert.equal(relink([p], c).length, 0); // 通常時は推測しない
  const r = relink([p], c, new Set(['s1']));
  assert.equal(r[0].link.matchedBy, 'fallback'); assert.equal(r[0].link.fallbackDeleteConfirmed, false);
  assert.equal(relink([p], [...c, X({ itemId: 'n2', title: 'ts1' })], new Set(['s1'])).length, 0); // 複数は拒否
  assert.equal(relink([p], [X({ itemId: 'n1', title: 'ts1', calName: '仕事' })], new Set(['s1'])).length, 0);
  assert.equal(relink([single({}, { itemId: 'gone', externalId: 'old', requestId: 'rqx' })], c, new Set(['s1'])).length, 0); // 名前の記録なし
  const other = ev('o', '2026-11-20T10:00', '2026-11-20T11:00', null, { nativeLink: L({ requestId: 'rqo', itemId: 'n1', externalId: 'zz', eventId: 'eo' }) });
  assert.equal(relink([p, other], c, new Set(['s1'])).length, 0); // 使用済みは拒否
});
test('uniqueRequestIds: 先の1件だけ linked、後は unlinked', () => {
  const a = single(), b = { ...single(), id: 's2' };
  const r = uniqueRequestIds([a, b]);
  assert.equal(r.unlinked, 1); assert.equal(r.events[0].nativeLink.state, 'linked'); assert.equal(r.events[1].nativeLink.state, 'unlinked');
});
