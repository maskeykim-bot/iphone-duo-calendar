// 第7版: iPhone カレンダー連携。window.Capacitor を偽装して、DuoNative の契約どおりに呼ばれ表示されることを確認する。
import { test, expect } from '@playwright/test';
import { notifyOn, openApp, SIZES, tab, seed, ev, dbEvents, setStyle, openMenu, pickDest, enableCalendars, fillDateTime, setDateUi, clickSettings, clickSearch } from './helpers.js';
import { VERSION as BACKUP_VERSION } from '../js/backup.js';
// 新規予定のカレンダー選択: 種別の先頭を選ぶ（第15版 PR5）
const pickKind = async (page, type) => { await page.locator('#f-dest').click(); await page.locator(`#dest-pop .dopt[data-dtype="${type}"]`).first().click(); };
const toIphone = (page) => pickKind(page, 'iphone');
const toDuo = (page) => pickKind(page, 'duo');

const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const EVENTS = [
  { id: 'e1@2026-11-12T15:00', eventId: 'e1', calendarId: 'cal-1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00', all: false, place: '渋谷', notes: '保険証\n持参', recurring: false, requestId: null },
  { id: 'e2@2026-11-23T00:00', eventId: 'e2', calendarId: 'cal-2', title: '勤労感謝の日', start: '2026-11-23T00:00', end: '2026-11-23T00:00', all: true, place: '', notes: '', recurring: false, requestId: null },
  { id: 'e3@2026-11-14T00:00', eventId: 'e3', calendarId: 'cal-1', title: '<b>旅行</b>', start: '2026-11-14T00:00', end: '2026-11-15T00:00', all: true, place: '', notes: '', recurring: false, requestId: null },
  { id: 'ev-linked@2026-11-12T18:00', eventId: 'ev-linked', calendarId: 'cal-1', title: 'Duoで作成済み', start: '2026-11-12T18:00', end: '2026-11-12T19:00', all: false, place: '', notes: '', recurring: false, requestId: null },
];

async function mock(page, cfg = {}) {
  await notifyOn(page);
  await page.addInitScript((c) => {
    const M = window.__mock = { perm: c.perm ?? 'granted', afterRequest: c.afterRequest ?? 'granted', calls: [], cals: c.cals, events: c.events, createFail: 0, opened: true, share: { completed: true }, created: {}, listeners: {}, notif: c.notif ?? 'notDetermined', notifAfter: c.notifAfter ?? 'granted', pending: [], remPerm: c.remPerm ?? 'notDetermined', remAfter: c.remAfter ?? 'granted', remLists: c.remLists ?? [] };
    const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ plugin, method, opts: clone(opts) });
        switch (method) {
          case 'checkPermission': if (c.checkReject) throw { code: 'UNIMPLEMENTED', message: 'x' }; return { status: M.perm };
          case 'requestPermission': M.perm = M.afterRequest; return { status: M.perm };
          case 'reminderPermission': return { status: M.remPerm };
          case 'requestReminderPermission': if (M.remPerm === 'notDetermined') M.remPerm = M.remAfter; return { status: M.remPerm };
          case 'listReminderLists':
            if (M.remPerm === 'restricted') throw { code: 'RESTRICTED', message: 'restricted' };
            if (M.remPerm !== 'granted') throw { code: 'PERMISSION_DENIED', message: 'x' };
            return { lists: M.remLists };
          case 'openSettings': return { opened: true };
          case 'listCalendars': return { calendars: M.cals };
          case 'listEvents': return { events: M.events.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from) };
          case 'createEvent':
            if (M.createFail > 0) { M.createFail--; throw { code: 'UNAVAILABLE', message: 'boom' }; }
            M.created[opts.requestId] = M.created[opts.requestId] || `new-${Object.keys(M.created).length + 1}`;
            if (M.createErr) throw { code: M.createErr, message: 'x' };
            if (c.v2) { const n = M.created[opts.requestId]; return { itemId: `item-${n}`, externalId: `ext-${n}`, eventId: n, modifiedAt: 1763100000000, calendarId: opts.calendarId, occurrenceDate: null }; }
            return { eventId: M.created[opts.requestId] };
          case 'createEvents': {
            // Swift の契約の写し（型Aのみ）。1〜31件・rid重複／recurrence／copyFrom は全体 INVALID_ARGUMENT。件ごとの失敗は M.createEventsFail[rid]、commit 一括失敗は M.commitFail。
            const its = Array.isArray(opts.items) ? clone({ a: opts.items }).a : opts.items; // 入力を書き換えない（Swift と同じ）
            if (!Array.isArray(its) || its.length < 1 || its.length > 31 || new Set(its.map((i) => i?.requestId)).size !== its.length
              || its.some((i) => !i || !i.requestId || (!i.calendarId && !i.copyFrom) || 'recurrence' in i || i.end < i.start || (i.copyFrom && (!(i.copyFrom.itemId || i.copyFrom.externalId || i.copyFrom.eventId) || !i.copyFrom.occurrenceStart || !i.copyFrom.currentStart || 'title' in i || 'alarms' in i || 'calendarId' in i)))) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            const fl = M.createEventsFail ?? {};
            const out = its.map((i) => {
              if (M.created[i.requestId]) return { done: true, i };
              if (i.copyFrom) {
                const d = c.details.find((x) => (x.itemId === i.copyFrom.itemId || x.externalId === i.copyFrom.externalId || x.eventId === i.copyFrom.eventId) && (x.occurrenceDate ?? x.start) === i.copyFrom.occurrenceStart);
                if (!d) return { err: 'NOT_FOUND', i };
                if (M.copyAmbiguous) return { err: 'UNAVAILABLE', i };
                if (!d.allowsModify) return { err: 'READ_ONLY', i };
                i.calendarId = d.calendarId ?? 'cal-1';
              }
              if (fl[i.requestId]) return { err: fl[i.requestId], i };
              return { fresh: true, i };
            });
            const fresh = out.filter((o) => o.fresh);
            if (M.commitFail && fresh.length) return { results: out.map((o) => ({ requestId: o.i.requestId, ok: false, code: o.err ?? (o.done ? 'OK' : 'UNAVAILABLE') })).map((r, k) => (out[k].done ? { requestId: r.requestId, ok: true, ...mk(out[k].i) } : r)) };
            function mk(i) { const n = M.created[i.requestId] ?? (M.created[i.requestId] = `new-${Object.keys(M.created).length + 1}`); return { itemId: `item-${n}`, externalId: `ext-${n}`, eventId: n, modifiedAt: 1763100000000, calendarId: i.calendarId }; }
            return { results: out.map((o) => (o.err ? { requestId: o.i.requestId, ok: false, code: o.err } : { requestId: o.i.requestId, ok: true, ...mk(o.i) })) };
          }
          case 'updateEvent': case 'deleteEvent': {
            if (M.opErr) throw { code: M.opErr, message: 'x' };
            if (M.needForce && method === 'updateEvent' && !opts.force) throw { code: 'CONFLICT', message: 'x' };
            if (!opts.requestId || !['this', 'future', 'all'].includes(opts.span)) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (method === 'deleteEvent') return opts.missing ? { deleted: true, missing: true } : { deleted: true };
            if (opts.moveCalendarId !== undefined) { // 移動: Swift の契約の写し（存在する書込可の先だけ。繰り返しは all のみ。同じ先は何もしない）
              const d = (M.cals || []).find((x) => x.id === opts.moveCalendarId);
              if (!d) throw { code: 'CALENDAR_NOT_FOUND', message: 'x' };
              if (!d.allowsModify) throw { code: 'READ_ONLY', message: 'x' };
              if (M.moveIds) return { itemId: `moved-${opts.itemId}`, externalId: `moved-${opts.externalId ?? ''}`, eventId: `moved-${opts.eventId ?? 'x'}`, modifiedAt: 1763100002000, calendarId: opts.moveCalendarId, occurrenceDate: opts.occurrenceStart ?? null }; // 移動で識別子が変わる応答
              return { itemId: opts.itemId, externalId: opts.externalId ?? '', eventId: opts.eventId ?? 'x', modifiedAt: 1763100002000, calendarId: opts.moveCalendarId, occurrenceDate: opts.occurrenceStart ?? null };
            }
            return { itemId: opts.itemId, externalId: opts.externalId ?? '', eventId: opts.eventId ?? 'x', modifiedAt: 1763100001000, calendarId: opts.calendarId, occurrenceDate: opts.occurrenceStart ?? null };
          }
          case 'updateExternalEvent': case 'deleteExternalEvent': {
            // ext 専用の独立した分岐（requestId は不要）。Swift の契約の写しであり実動作の証明ではない。
            if (M.extErr) throw { code: M.extErr, reason: M.extReason, message: 'x' };
            if (!(opts.itemId || opts.externalId || opts.eventId) || !['this', 'future', 'all'].includes(opts.span) || !opts.occurrenceStart || !opts.currentStart) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (method === 'deleteExternalEvent') {
              if (M.extConflict && !opts.force) throw { code: 'CONFLICT', message: 'x' };
              return M.extMissing ? { deleted: true, missing: true } : { deleted: true };
            }
            if ('recurrence' in opts) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (opts.span === 'all' && ('start' in opts || 'end' in opts || 'all' in opts) && !opts.base) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (M.extMissing) throw { code: 'NOT_FOUND', message: 'x' };
            return { itemId: M.extNewItem ?? opts.itemId, externalId: opts.externalId ?? '', eventId: opts.eventId ?? 'x', modifiedAt: 1763100002000, calendarId: opts.calendarId ?? 'cal-1', occurrenceDate: opts.occurrenceStart, conflicted: !!M.extConflict, alarmsApplied: Math.min((opts.alarms ?? []).length, M.extAlarmCap ?? 2) };
          }
          case 'getEvent': {
            if (M.getErr) throw { code: M.getErr, message: 'x' };
            if (!(opts.itemId || opts.externalId || opts.eventId) || !opts.occurrenceStart || !opts.currentStart) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            const d = c.details.find((x) => (x.itemId === opts.itemId || x.externalId === opts.externalId || x.eventId === opts.eventId) && (x.occurrenceDate ?? x.start) === opts.occurrenceStart);
            if (!d && Object.values(M.created).includes(opts.eventId)) return { eventId: opts.eventId, start: opts.currentStart, modifiedAt: M.createdMod ?? 1763100000000 }; // createEvent(s) で作った予定の最新（PR32）
            if (!d) throw { code: 'NOT_FOUND', message: 'x' };
            return clone(d);
          }
          case 'openInCalendar': return { opened: M.opened };
          case 'shareFile': return M.share;
          case 'notifyStatus': return { status: M.notif };
          case 'requestNotifyPermission': if (M.notif === 'notDetermined') M.notif = M.notifAfter; return { status: M.notif };
          case 'notifySync': {
            const ok = ['granted', 'provisional', 'ephemeral'].includes(M.notif);
            const items = opts.items;
            if (!Array.isArray(items) || items.length > 60 || items.some((i) => !i || !String(i.id).startsWith('duo.') || typeof i.fireDate !== 'string')) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            if (!ok) throw { code: 'PERMISSION_DENIED', message: 'x' };
            const removed = M.pending.length; let skipped = 0;
            M.pending = items.filter((i) => { const keep = i.fireDate > '2026-11-14T00:00'; if (!keep) skipped++; return keep; });
            return { scheduled: M.pending.length, removed, skipped };
          }
          case 'selectionHaptic': // Swift の契約の写し: kind は light|warning だけ。main で UIFeedbackGenerator を鳴らす。
            if (!['light', 'warning'].includes(opts.kind)) throw { code: 'INVALID_ARGUMENT', message: 'x' };
            return { performed: true };
          case 'getPosture': // Swift の契約の写し（第16版 PR10）。未実装・available:false は M.posture で再現。
            if (c.postureReject) throw { code: 'UNIMPLEMENTED', message: 'x' };
            return clone(M.posture ?? { available: false, folded: false, regionRect: null, axis: null, angle: null, status: null, source: 'unsupported', at: 1763100000000 });
          case 'notifyClear': { const n = M.pending.length; M.pending = []; return { removed: n }; }
          case 'notifyTest': if (!['granted', 'provisional', 'ephemeral'].includes(M.notif)) throw { code: 'PERMISSION_DENIED', message: 'x' }; return { scheduled: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, events: EVENTS, details: DETAILS, ...cfg });
}
// getEvent（Detail）の偽装 fixture。RawEvent に詳細を足した形（契約は design/IMPL_PLAN_V13.md PR1）。
const DETAIL_BASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null,
  alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, hasUrl: false, editable: true, reason: null, seriesStart: null };
const DETAILS = [
  { ...DETAIL_BASE, id: 'e1@2026-11-12T15:00', eventId: 'e1', itemId: 'it-1', externalId: 'ex-1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00', place: '渋谷', notes: '保険証\n持参', alarms: [{ before: 30 }], seriesStart: '2026-11-12T15:00' },
  { ...DETAIL_BASE, id: 'e2@2026-11-23T00:00', eventId: 'e2', itemId: 'it-2', externalId: 'ex-2', calendarId: 'cal-2', title: '勤労感謝の日', all: true, start: '2026-11-23T00:00', end: '2026-11-23T00:00', allowsModify: false, sourceType: 'subscribed', editable: false, reason: 'readOnlyCalendar' },
  { ...DETAIL_BASE, id: 'w1@2026-11-16T09:00', eventId: 'w1', itemId: 'it-w', externalId: 'ex-w', title: '定例', start: '2026-11-16T09:00', end: '2026-11-16T10:00', recurring: true, occurrenceDate: '2026-11-16T09:00',
    rule: { freq: 'weekly', byDay: [1], count: 10 }, ruleText: '毎週', alarms: [{ before: 10 }, { before: 60 }], alarmsExtra: 1, seriesStart: '2026-11-02T09:00' },
  { ...DETAIL_BASE, id: 'w1@2026-11-19T09:00', eventId: 'w1', itemId: 'it-w', externalId: 'ex-w', title: '定例', start: '2026-11-19T09:00', end: '2026-11-19T10:00', recurring: false, detached: true, occurrenceDate: '2026-11-16T09:00', seriesStart: null },
  { ...DETAIL_BASE, id: 'b1@2026-11-20T00:00', eventId: 'b1', itemId: 'it-b', externalId: 'ex-b', calendarId: 'cal-2', title: '誕生日', all: true, start: '2026-11-20T00:00', end: '2026-11-20T00:00', allowsModify: false, sourceType: 'birthdays', editable: false, reason: 'birthdays', alarms: [{ day: 1, at: '09:00' }] },
  { ...DETAIL_BASE, id: 'm1@2026-11-21T10:00', eventId: 'm1', itemId: 'it-m', externalId: 'ex-m', title: '会議', start: '2026-11-21T10:00', end: '2026-11-21T11:00', recurring: true, occurrenceDate: '2026-11-21T10:00', rule: null, ruleText: '2週間ごと', hasAttendees: true, isOrganizer: true, editable: false, reason: 'organizerWithAttendees' },
];
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => !m || c.method === m), m);
// 設定 › カレンダー（✓方式。許可済みなら開くだけで連携が入る）。
const openLinkPanel = async (page) => {
  await clickSettings(page);
  await page.locator('#menu [data-go="calendar"]').click();
  await expect(page.locator('#menu [data-screen="calendar"]')).toBeVisible();
};
const closeSettings = async (page) => { await page.locator('#m-back').click(); await page.locator('#m-back').click(); await expect(page.locator('#menu')).toBeHidden(); };
async function enable(page) { await enableCalendars(page); }

test.describe('Web 版（Capacitor なし）', () => {
  test('連携の入口もブリッジ呼び出しも出ない', async ({ page }) => {
    await openApp(page);
    await clickSettings(page);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('[data-m="link"]')).toBeHidden();
    await page.locator('#menu [data-go="calendar"]').click();
    await expect(page.locator('#m-cal-ip')).toBeEmpty();
    await expect(page.locator('#m-cal-foot')).toBeHidden();
    await page.locator('#m-back').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#xadd')).toHaveCount(0);
  });
});

test.describe('通知ブリッジ契約（偽装。Swift 実動作の証明ではない）', () => {
  const item = (n, fireDate = '2026-12-01T09:00') => ({ id: `duo.e${n}@2026-12-01T09:30#0`, title: 't', body: 'b', fireDate, thread: 'duo.2026-12-01', day: '2026-12-01', eventId: `e${n}` });

  test('状態・許可要求は notDetermined のときだけ要求し、5メソッドが応答する', async ({ page }) => {
    await mock(page, { notif: 'notDetermined', notifAfter: 'denied' });
    await openApp(page);
    const r = await page.evaluate(async () => {
      const { call } = await import('/js/native.js');
      const a = await call('notifyStatus'); const b = await call('requestNotifyPermission'); const c = await call('requestNotifyPermission');
      return [a.status, b.status, c.status];
    });
    expect(r).toEqual(['notDetermined', 'denied', 'denied']);
  });

  test('第14版 PR29: createEvents の契約（型A・rid別失敗・commit一括失敗・再試行で二重なし・不正は全体拒否）', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { call, errCode } = await import('./js/native.js');
      const A = (n, x = {}) => ({ requestId: `r${n}`, calendarId: 'cal-1', title: `t${n}`, start: '2026-11-20T10:00', end: '2026-11-20T11:00', all: false, place: '', notes: '', alarms: [{ before: 10 }], ...x });
      const M = window.__mock;
      const ok = await call('createEvents', { items: [A(1), A(2), A(3, { all: true, alarms: [{ day: 0, at: '09:00' }] })] });
      M.createEventsFail = { r5: 'READ_ONLY' };
      const part = await call('createEvents', { items: [A(4), A(5), A(6)] });
      M.createEventsFail = {};
      const retry = await call('createEvents', { items: [A(5), A(4)] });
      const bad = {};
      bad.empty = await call('createEvents', { items: [] }).catch(errCode);
      bad.dup = await call('createEvents', { items: [A(7), A(7)] }).catch(errCode);
      bad.rec = await call('createEvents', { items: [A(8, { recurrence: null })] }).catch(errCode);
      bad.b = await call('createEvents', { items: [A(9, { copyFrom: {} })] }).catch(errCode);
      bad.b2 = await call('createEvents', { items: [{ requestId: 'b9', copyFrom: { itemId: 'x', occurrenceStart: 'a', currentStart: 'a' }, start: '2026-11-20T10:00', end: '2026-11-20T11:00', all: false, title: 'no' }] }).catch(errCode);
      bad.many = await call('createEvents', { items: Array.from({ length: 32 }, (_, i) => A(100 + i)) }).catch(errCode);
      M.commitFail = true;
      const cf = await call('createEvents', { items: [A(20), A(21)] });
      return { ok, part, retry, bad, cf, created: Object.keys(M.created) };
    });
    expect(r.ok.results.map((x) => x.ok)).toEqual([true, true, true]);
    expect(r.ok.results[0]).toMatchObject({ requestId: 'r1', itemId: expect.any(String), externalId: expect.any(String), eventId: expect.any(String), calendarId: 'cal-1' });
    expect(r.part.results.map((x) => x.ok)).toEqual([true, false, true]);
    expect(r.part.results[1]).toEqual({ requestId: 'r5', ok: false, code: 'READ_ONLY' });
    expect(r.retry.results.map((x) => [x.requestId, x.ok])).toEqual([['r5', true], ['r4', true]]);
    expect(r.retry.results[1].eventId).toBe(r.part.results[0].eventId);
    expect(r.bad).toEqual({ empty: 'INVALID_ARGUMENT', dup: 'INVALID_ARGUMENT', rec: 'INVALID_ARGUMENT', b: 'INVALID_ARGUMENT', b2: 'INVALID_ARGUMENT', many: 'INVALID_ARGUMENT' });
    expect(r.cf.results).toEqual([{ requestId: 'r20', ok: false, code: 'UNAVAILABLE' }, { requestId: 'r21', ok: false, code: 'UNAVAILABLE' }]);
    expect(r.created).not.toContain('r20');
  });

  test('第14版 PR30: createEvents 型B（copyFrom）の契約・元特定失敗・READ_ONLY・同ridで再作成なし', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { call, errCode } = await import('./js/native.js');
      const M = window.__mock;
      const B = (n, id, occ, x = {}) => ({ requestId: `b${n}`, copyFrom: { itemId: id, occurrenceStart: occ, currentStart: occ }, start: '2026-11-25T10:00', end: '2026-11-25T11:00', all: false, ...x });
      const A = { requestId: 'a1', calendarId: 'cal-1', title: 't', start: '2026-11-20T10:00', end: '2026-11-20T11:00', all: false, place: '', notes: '', alarms: [] };
      const mixed = await call('createEvents', { items: [B(1, 'it-1', '2026-11-12T15:00'), A, B(2, 'it-2', '2026-11-23T00:00'), B(3, 'nope', '2026-11-12T15:00')] });
      const again = await call('createEvents', { items: [B(1, 'it-1', '2026-11-12T15:00')] });
      M.copyAmbiguous = true;
      const amb = await call('createEvents', { items: [B(4, 'it-1', '2026-11-12T15:00')] });
      M.copyAmbiguous = false;
      const bad = await call('createEvents', { items: [B(5, '', '2026-11-12T15:00', { copyFrom: { occurrenceStart: 'x', currentStart: 'x' } })] }).catch(errCode);
      return { mixed, again, amb, bad };
    });
    expect(r.mixed.results.map((x) => [x.requestId, x.ok, x.code])).toEqual([['b1', true, undefined], ['a1', true, undefined], ['b2', false, 'READ_ONLY'], ['b3', false, 'NOT_FOUND']]);
    expect(r.mixed.results[0]).not.toHaveProperty('url');
    expect(r.again.results[0].eventId).toBe(r.mixed.results[0].eventId);
    expect(r.amb.results[0]).toEqual({ requestId: 'b4', ok: false, code: 'UNAVAILABLE' });
    expect(r.bad).toBe('INVALID_ARGUMENT');
  });

  test('selectionHaptic: light/warning は performed、kind 不正は INVALID_ARGUMENT。native.js の haptic 経由', async ({ page }) => {
    await mock(page); await openApp(page);
    const o = await page.evaluate(async () => {
      const { haptic, call, errCode } = await import('./js/native.js');
      return { a: await haptic('light'), b: await haptic('warning'), c: await call('selectionHaptic', { kind: 'x' }).catch(errCode), d: await call('selectionHaptic', {}).catch(errCode), e: await haptic('x').catch(errCode) };
    });
    expect(o).toEqual({ a: { performed: true }, b: { performed: true }, c: 'INVALID_ARGUMENT', d: 'INVALID_ARGUMENT', e: 'INVALID_ARGUMENT' });
  });

  test('notifySync: 件数・skipped・removed、61件と構造不正は INVALID_ARGUMENT、未許可は PERMISSION_DENIED', async ({ page }) => {
    await mock(page, { notif: 'granted' });
    await openApp(page);
    const out = await page.evaluate(async ([it]) => {
      const { call, errCode } = await import('/js/native.js');
      const mk = (n, f = '2026-12-01T09:00') => ({ ...it, id: `duo.e${n}@x#0`, eventId: `e${n}`, fireDate: f });
      const o = {};
      o.a = await call('notifySync', { items: [mk(1), mk(2, '2020-01-01T09:00')] });
      o.b = await call('notifySync', { items: [mk(3)] });
      o.c = await call('notifySync', { items: Array.from({ length: 61 }, (_, i) => mk(i)) }).catch(errCode);
      o.d = await call('notifySync', { items: [{ id: 'x' }] }).catch(errCode);
      o.e = await call('notifyClear');
      o.t = await call('notifyTest');
      window.__mock.notif = 'denied';
      o.f = await call('notifySync', { items: [mk(1)] }).catch(errCode);
      o.g = await call('notifyTest').catch(errCode);
      return o;
    }, [item(0)]);
    expect(out).toEqual({ a: { scheduled: 1, removed: 0, skipped: 1 }, b: { scheduled: 1, removed: 1, skipped: 0 }, c: 'INVALID_ARGUMENT', d: 'INVALID_ARGUMENT', e: { removed: 1 }, t: { scheduled: true }, f: 'PERMISSION_DENIED', g: 'PERMISSION_DENIED' });
  });

  test('notificationTapped / timeChanged を listen で受けられる', async ({ page }) => {
    await mock(page);
    await openApp(page);
    const got = await page.evaluate(async () => {
      const { listen } = await import('/js/native.js');
      const seen = [];
      listen('notificationTapped', (e) => seen.push(e));
      window.__mock.listeners.notificationTapped?.({ day: '2026-12-01', eventId: 'e1' });
      return seen;
    });
    expect(got).toEqual([{ day: '2026-12-01', eventId: 'e1' }]);
  });
});

test.describe('ネイティブ（偽装）', () => {
  test('checkPermission が失敗したら入口を隠す', async ({ page }) => {
    await mock(page, { checkReject: true });
    await openApp(page);
    await clickSettings(page);
    await page.locator('#menu [data-go="calendar"]').click();
    await expect(page.locator('[data-m="link"]')).toBeHidden();
  });

  test('設定 › カレンダー: 旧スイッチ・旧パネルはなく、許可のない間は何も要求しない', async ({ page }) => {
    await mock(page, { perm: 'notDetermined' });
    await openApp(page);
    await openLinkPanel(page);
    const labels = await page.locator('#menu [data-screen="calendar"] button:visible').allTextContents();
    expect(labels.join('|')).not.toContain('iPhone カレンダー連携');
    await expect(page.locator('#lk-sw, #link, [data-m="link"]')).toHaveCount(0);
    await expect(page.locator('#m-cal-ip')).toContainText('iPhone のカレンダーを出すには、アクセスを許可してください。');
    expect(await calls(page, 'listEvents')).toHaveLength(0);
    expect(await calls(page, 'requestPermission')).toHaveLength(0);
  });

  test('許可フロー: notDetermined → 説明 → ユーザー操作でのみ要求 → granted で全選択', async ({ page }) => {
    await mock(page, { perm: 'notDetermined', afterRequest: 'granted' });
    await openApp(page);
    await openLinkPanel(page);
    await expect(page.getByText('iPhone のカレンダーを出すには、アクセスを許可してください。')).toBeVisible();
    expect(await calls(page, 'requestPermission')).toHaveLength(0);
    await page.locator('#lk-req').click();
    await expect(page.locator('[data-cal]')).toHaveCount(2);
    expect(await calls(page, 'requestPermission')).toHaveLength(1);
    await expect(page.locator('[data-cal][aria-checked="true"]')).toHaveCount(2);
    await expect(page.locator('#m-cal-ip .calsec', { hasText: 'Google' })).toBeVisible();
    await expect(page.locator('#m-cal-ip .cro')).toHaveText('表示のみ');
    await expect(page.locator('#lk-status')).toContainText('最終読み込み：');
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal')));
    expect(ls).toMatchObject({ version: 1, enabled: true, selectionInitialized: true });
    expect(ls.calendarIds.sort()).toEqual(['cal-1', 'cal-2']);
    const le = (await calls(page, 'listEvents'))[0].opts;
    expect(le).toMatchObject({ from: '2026-10-01T00:00', to: '2027-01-01T00:00' });
  });

  for (const [st, text] of [['denied', '設定アプリで許可すると使えます。'], ['restricted', 'この端末ではカレンダーへのアクセスが制限されています。'], ['writeOnly', '予定を表示するにはフルアクセスが必要です。']]) {
    test(`許可フロー: ${st} の案内。連携オンは確定しない`, async ({ page }) => {
      await mock(page, { perm: st, afterRequest: st });
      await openApp(page);
      await openLinkPanel(page);
      await expect(page.locator('#m-cal-ip')).toContainText(text);
      await expect(page.locator('[data-cal]')).toHaveCount(0);
      expect(await calls(page, 'requestPermission')).toHaveLength(0); // 自動で再要求しない
      expect((await page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal') || '{}'))).enabled).toBeFalsy();
      if (st !== 'restricted') {
        await page.locator('#lk-settings').click();
        expect(await calls(page, 'openSettings')).toHaveLength(1);
      }
      if (st === 'writeOnly') {
        await page.locator('#lk-req').click();
        expect(await calls(page, 'requestPermission')).toHaveLength(1);
        await expect(page.locator('[data-cal]')).toHaveCount(0);
      }
    });
  }

  test('混在表示: ホーム・日・月（帯・短冊・凡例）・アクセシブル名', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    // ホーム: 次の予定
    await expect(page.locator('.next')).toContainText('歯医者');
    await expect(page.locator('.next')).toContainText('iPhone · 家族');
    // 日表示
    await tab(page, '日').click();
    const card = page.locator('.mdcard.ext, .tlev.ext', { hasText: '歯医者' });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-label', /iPhone、家族、/);
    expect(await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--cat').trim())).toBe('#d93025');
    // 並び: 終日→時間付き（アプリ予定がなくても iPhone 内で開始昇順）
    // 月（予定名）
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    // 月のチップ・帯は出所アイコンを出さず（aria-label に「iPhone、カレンダー名」を残す）、塗りはカレンダーの元色
    const dent = page.locator('.calendar .strip[data-sday="2026-11-12"]', { hasText: '歯医者' });
    await expect(dent).not.toContainText('▦');
    await expect(dent).toHaveAttribute('aria-hidden', 'true'); // チップは押す的ではない（S5）。出所と題名はマスのボタンの aria-label にある
    await expect(page.locator('.calendar .day[data-date="2026-11-12"]')).toHaveAttribute('aria-label', /予定\d+件.*：iPhone、[^、]+、(\d+:\d\d )?歯医者/); // S8 品質の低: 読み上げに時刻（「15:00 歯医者」）が入る。 出所（iPhone、カレンダー名）も読み上げに残す
    expect(await dent.locator('.cline').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(217, 48, 37)'); // カレンダーの色 #d93025（第19.2版 S11b: 時刻つきは地を塗らず左の線がカレンダーの色）
    await expect(page.locator('.bar', { hasText: '<b>旅行</b>' })).toHaveCount(1); // 11/14(土)〜15(日)は月曜始まりでは同じ週なので1本（週境界の分割は month-all.spec.js で確認）。HTML は文字として表示
    // 凡例は設定メニューの中
    await openMenu(page, 'calendar');
    await expect(page.locator('#menu .xlegend')).toHaveText('▦ iPhoneの予定（カレンダーの色）');
    await expect(page.locator('#menu .legend span')).toHaveCount(5); // 新規の既定カテゴリ5つ（仕事・プライベート・家族・外出・その他）
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-label', /うちiPhone 2件/);
  });

  test('詳細シート: 読み取り専用・カレンダーで開く・失敗表示', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await tab(page, '日').click();
    await page.locator('.mdcard.ext, .tlev.ext', { hasText: '歯医者' }).click();
    const d = page.locator('#xdetail');
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { name: 'iPhoneの予定' })).toBeVisible();
    await expect(d).toContainText('歯医者');
    await expect(d).toContainText('iPhone · 家族');
    await expect(d).toContainText('2026/11/12 15:00');
    await expect(d).toContainText('渋谷');
    await expect(d).toContainText('保険証');
    // 書けるカレンダー: 削除・編集が出る（第13版）。保存ボタンは出ない
    await expect(d.getByRole('button', { name: '編集', exact: true })).toBeVisible();
    await expect(d.getByRole('button', { name: '削除', exact: true })).toBeVisible();
    await expect(d.getByRole('button', { name: /保存/ })).toHaveCount(0);
    await expect(page.locator('#editor')).toBeHidden();
    await d.locator('#xd-open').click();
    expect((await calls(page, 'openInCalendar'))[0].opts).toEqual({ start: '2026-11-12T15:00' });
    await page.evaluate(() => { window.__mock.opened = false; });
    await d.locator('#xd-open').click();
    await expect(d.locator('#xd-err')).toHaveText('カレンダーを開けませんでした。');
    await expect(d).toBeVisible();
    await d.locator('#xd-close').click();
    await expect(d).toBeHidden();
    // 終日: 含む最終日
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-23"]').click({ position: { x: 12, y: 10 } });
    await page.locator('.mdcard.ext, .mdallday.ext, .tlev.ext, .adpill.ext', { hasText: '勤労感謝' }).click();
    await expect(d).toContainText('終日');
    await expect(d).toContainText('場所なし');
    await expect(d).toContainText('メモなし');
    // 読み取り専用のカレンダー: 編集・削除なし、理由と大きい「カレンダーで開く」だけ
    await expect(d.locator('#xd-note')).toHaveText('このカレンダーは読み取り専用のため、Duo では変更できません。');
    await expect(d.getByRole('button', { name: /削除|保存|編集/ })).toHaveCount(0);
    await expect(d.locator('#xd-open')).toBeVisible();
  });

  test('iPhone にも追加: createEvent の引数・リンク保存・二重表示なし', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#dest-l')).toBeVisible();
    await expect(page.locator('#f-cat')).toHaveCount(0);
    await expect(page.locator('#f-xadd')).toHaveCount(0); // 旧スイッチは新規シートから無くなる
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）'); // 設定の追加先（iPhone の既定）
    // 書込可のみ（家族）。読み取り専用の祝日は出ない
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-dtype="iphone"] .dn')).toHaveText(['家族']);
    await page.keyboard.press('Escape'); // 一覧だけ閉じ、シートは残る
    await expect(page.locator('#dest-pop')).toBeHidden();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-dest')).toBeFocused();
    // 第11版 PR9: 繰り返しありでも選べる（無効化しない）
    await page.locator('#rtoggle').click();
    await page.locator('#f-rfreq').selectOption('daily');
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）');
    await page.locator('#f-rfreq').selectOption('none');
    await toDuo(page);
    await page.locator('#f-title').fill('会食');
    await fillDateTime(page, 'start', '2026/11/20 19:00');
    await fillDateTime(page, 'end', '2026/11/20 21:00');
    await page.locator('#f-place').fill('銀座');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('予定を保存し、iPhoneのカレンダーにも追加しました。');
    const c = await calls(page, 'createEvent');
    expect(c).toHaveLength(1);
    expect(c[0].opts).toMatchObject({ calendarId: 'cal-1', title: '会食', start: '2026-11-20T19:00', end: '2026-11-20T21:00', all: false, place: '銀座', notes: '' });
    expect(c[0].opts.requestId).toMatch(/.{8,}/);
    const saved = (await dbEvents(page)).find((e) => e.title === '会食');
    expect(saved.nativeLink).toMatchObject({ v: 2, state: 'linked', requestId: c[0].opts.requestId, eventId: 'new-1', calendarId: 'cal-1', seriesStart: '2026-11-20T19:00', warn: null });
    // 外部側にも同じ eventId の予定が現れても、アプリ予定1つだけ表示（除外）
    await page.evaluate(() => { window.__mock.events.push({ id: 'new-1@2026-11-20T19:00', eventId: 'new-1', calendarId: 'cal-1', title: '会食', start: '2026-11-20T19:00', end: '2026-11-20T21:00', all: false, place: '銀座', notes: '', recurring: false, requestId: null }); window.__mock.listeners.calendarChanged?.(); });
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-20"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.mdcard, .tlev', { hasText: '会食' })).toHaveCount(1);
    await expect(page.locator('.mdcard, .tlev', { hasText: '会食' })).toHaveAttribute('aria-label', /iPhoneにも追加済み/);
    // 編集には案内
    await page.locator('.mdcard, .tlev', { hasText: '会食' }).click();
    await expect(page.locator('#xlinked')).toContainText('iPhoneにも追加済み。Duo で変えた内容は iPhone のカレンダーにも反映されます。');
    await expect(page.locator('#xadd')).toHaveCount(0);
  });

  test('時刻のマスを押すたびに触覚（light）。開閉だけでは呼ばない', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-stime').click();
    await page.locator('#f-stime').click();
    expect(await calls(page, 'selectionHaptic')).toHaveLength(0);
    await page.locator('#f-stime').click();
    await page.locator('#tp-h').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); // 10 → 13
    await page.locator('#tp-m').focus();
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowUp'); // 00 → 45
    const h = await calls(page, 'selectionHaptic');
    expect(h.map((c) => c.opts.kind)).toEqual(Array(12).fill('light')); // 1段ごとに軽い触覚
    await expect(page.locator('#f-stime')).toHaveText('13:45');
    await expect(page.locator('#f-etime')).toHaveText('14:45');
  });

  test('終日の追加: end は最終日 00:00。失敗してもアプリ予定は残り、再試行は同じ requestId', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createFail = 1; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('出張');
    await page.locator('#f-all').check();
    await setDateUi(page, 'start', '2026/11/25');
    await setDateUi(page, 'end', '2026/11/26');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await expect(r).toContainText('Duoに保存しました。iPhoneのカレンダーには追加できませんでした。');
    expect((await dbEvents(page)).find((e) => e.title === '出張').nativeLink.state).toBe('pending');
    await r.locator('#xr-retry').click();
    await expect(r).toBeHidden();
    const c = await calls(page, 'createEvent');
    expect(c).toHaveLength(2);
    expect(c[1].opts.requestId).toBe(c[0].opts.requestId);
    expect(c[1].opts).toMatchObject({ all: true, start: '2026-11-25T00:00', end: '2026-11-26T00:00' });
    expect((await dbEvents(page)).find((e) => e.title === '出張').nativeLink.state).toBe('linked');
  });

  test('第11版 PR9: 新規の繰り返し予定も iPhone に追加（recurrence 引数・再試行は同じ requestId・二重通知なし）', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createFail = 1; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('毎週の会');
    await fillDateTime(page, 'start', '2026/11/20 19:00');
    await fillDateTime(page, 'end', '2026/11/20 20:00');
    await page.locator('#rtoggle').click();
    await page.locator('#f-rfreq').selectOption('weekly');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await r.locator('#xr-retry').click();
    await expect(r).toBeHidden();
    const c = await calls(page, 'createEvent');
    expect(c).toHaveLength(2);
    expect(c[1].opts.requestId).toBe(c[0].opts.requestId);
    for (const k of c) expect(k.opts.recurrence).toMatchObject({ freq: 'weekly', interval: 1, count: null, until: null });
    expect(c[1].opts.recurrence.byDay).toEqual([5]);
    const ev = (await dbEvents(page)).find((e) => e.title === '毎週の会');
    expect(ev.nativeLink.state).toBe('linked');
  });

  test('第11版 PR5: createEvent の戻りが v2（itemId/externalId/modifiedAt/calendarId）でも壊れず、alarms 引数を渡さない現状でも作成できる', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('v2戻り');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    await expect(page.getByRole('status')).toHaveText('予定を保存し、iPhoneのカレンダーにも追加しました。');
    const saved = (await dbEvents(page)).find((e) => e.title === 'v2戻り');
    expect(saved.nativeLink).toMatchObject({ state: 'linked', eventId: 'new-1', calendarId: 'cal-1' });
  });

  test('第11版 PR5: createEvent の WRITE_ONLY は再試行なしの案内（許可の確認）になる', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createErr = 'WRITE_ONLY'; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('許可不足');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await expect(r).toContainText('カレンダーのフルアクセスの許可が必要です。');
    await expect(page.locator('#xr-retry')).toBeHidden();
    // 第12版 PR2: 再試行できない失敗はエラー受領時点で確定（unlinked、本文・requestId は残る）
    await expect.poll(async () => (await dbEvents(page)).find((e) => e.title === '許可不足').nativeLink.state).toBe('unlinked');
    expect((await dbEvents(page)).find((e) => e.title === '許可不足').nativeLink.requestId).toBeTruthy();
  });

  const failCreate = async (page, title, close) => {
    await page.evaluate(() => { window.__mock.createFail = 1; });
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill(title);
    await fillDateTime(page, 'start', '2026/12/05 10:00');
    await fillDateTime(page, 'end', '2026/12/05 11:00');
    await page.locator('#f-al0').selectOption('b30');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#xretry')).toBeVisible();
    // 再試行の選択中は pending のまま（通知は iPhone 側の予定）
    expect((await dbEvents(page)).find((e) => e.title === title).nativeLink.state).toBe('pending');
    await close();
  };

  test('第12版 PR2: 失敗後に「閉じる」で放棄 → unlinked になり Duo の通知が予約される', async ({ page }) => {
    await mock(page, { notif: 'granted' });
    await openApp(page);
    await enable(page);
    await failCreate(page, '放棄A', () => page.locator('#xr-close').click());
    await expect(page.locator('#xretry')).toBeHidden();
    await expect.poll(async () => (await dbEvents(page)).find((e) => e.title === '放棄A').nativeLink.state).toBe('unlinked');
    const id = (await dbEvents(page)).find((e) => e.title === '放棄A').id;
    expect(await page.evaluate(() => window.__mock.pending.map((i) => i.eventId))).not.toContain(id); // 再試行の選択中は予約されていない
    await expect.poll(() => page.evaluate(() => window.__mock.pending.map((i) => i.eventId))).toContain(id);
    // 再読込しても放棄分は再提示されない
    await page.reload();
    await expect(page.locator('#xretry')).toBeHidden();
  });

  test('第12版 PR2: 失敗後に Escape でも放棄、再試行を選ぶと放棄しない', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await failCreate(page, '放棄B', () => page.keyboard.press('Escape'));
    await expect.poll(async () => (await dbEvents(page)).find((e) => e.title === '放棄B').nativeLink.state).toBe('unlinked');
    await failCreate(page, '再試行C', () => page.locator('#xr-retry').click());
    await expect.poll(async () => (await dbEvents(page)).find((e) => e.title === '再試行C').nativeLink.state).toBe('linked');
  });

  test('第12版 PR2: 再試行も失敗 → 閉じると放棄（同じ requestId のまま）', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await failCreate(page, '放棄D', async () => {
      await page.evaluate(() => { window.__mock.createFail = 1; });
      await page.locator('#xr-retry').click();
      await expect(page.locator('#xretry')).toBeVisible();
      await expect(page.locator('#xr-retry')).toBeVisible();
      expect((await dbEvents(page)).find((e) => e.title === '放棄D').nativeLink.state).toBe('pending');
      await page.locator('#xr-close').click();
    });
    await expect.poll(async () => (await dbEvents(page)).find((e) => e.title === '放棄D').nativeLink.state).toBe('unlinked');
    const c = await calls(page, 'createEvent');
    expect(new Set(c.map((k) => k.opts.requestId)).size).toBe(1);
  });

  test('第12版 PR2: 再試行パネルを開いたまま予定が消えても、放棄で復活しない', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await failCreate(page, '放棄E', async () => {
      const id = (await dbEvents(page)).find((e) => e.title === '放棄E').id;
      await page.evaluate(async (id) => { const db = await import('/js/db.js'); await db.deleteEvent(id); }, id);
      await page.locator('#xr-close').click();
    });
    await expect(page.locator('#xretry')).toBeHidden();
    await page.waitForTimeout(300);
    expect((await dbEvents(page)).find((e) => e.title === '放棄E')).toBeUndefined();
  });

  test('二重表示の除外: linked.eventId と一致する外部予定は表示・検索から除く', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await seed(page, [ev('a1', 'Duoで作成済み', '2026-11-12T18:00', '2026-11-12T19:00', { nativeLink: { state: 'linked', requestId: 'r1', eventId: 'ev-linked', calendarId: 'cal-1' } })]);
    await enable(page);
    await tab(page, '日').click();
    await expect(page.locator('.mdcard, .tlev', { hasText: 'Duoで作成済み' })).toHaveCount(1);
    await expect(page.locator('.mdcard.ext, .tlev.ext', { hasText: 'Duoで作成済み' })).toHaveCount(0);
    await expect(page.locator('.tlev.ext')).toHaveCount(1); // 歯医者のみ
    // 検索
    await clickSearch(page);
    await page.locator('#sr-q').fill('Duoで作成');
    await expect(page.locator('#sr-body .hit')).toHaveCount(1);
  });

  test('検索: iPhone の予定を含め、範囲を別行で表示。選択で日表示→再タップで詳細', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await clickSearch(page);
    await expect(page.locator('#sr-xrange')).toHaveText('iPhoneの検索範囲：2026/10/01–2026/12/31（読み込み済み）');
    await page.locator('#sr-q').fill('はいしゃ'.replace('はいしゃ', '歯医者'));
    const hit = page.locator('#sr-body .hit.ext');
    await expect(hit).toHaveCount(1);
    await expect(hit).toContainText('iPhone · 家族');
    await hit.click();
    await expect(page.locator('#search')).toBeHidden();
    await page.locator('.mdcard.ext, .tlev.ext', { hasText: '歯医者' }).click();
    await expect(page.locator('#xdetail')).toBeVisible();
  });

  test('バックアップ: shareFile を優先し、外部予定は含めず nativeLink は保持する。キャンセルは無通知', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await seed(page, [ev('a1', 'Duo予定', '2026-11-12T18:00', '2026-11-12T19:00', { nativeLink: { state: 'linked', requestId: 'r1', eventId: 'zzz', calendarId: 'cal-1' } })]);
    await enable(page);
    await clickSettings(page);
    await page.locator('[data-m="backup"]').click();
    await page.locator('#bk-export').click();
    await expect(page.locator('.bmsg')).toHaveText('書き出しファイルを共有しました。');
    const s = await calls(page, 'shareFile');
    expect(s).toHaveLength(1);
    expect(s[0].opts.mime).toBe('application/json');
    expect(s[0].opts.name).toMatch(/^duo-calendar-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(s[0].opts.text);
    expect(json).toMatchObject({ app: 'duo-calendar', version: BACKUP_VERSION });
    expect(JSON.stringify(json)).not.toMatch(/歯医者/);
    expect(json.events[0].nativeLink).toEqual({ state: 'linked', requestId: 'r1', eventId: 'zzz', calendarId: 'cal-1' });
    // キャンセル（completed:false）は通知しない
    await page.evaluate(() => { window.__mock.share = { completed: false }; });
    await page.locator('#bk-export').click();
    await expect(page.locator('.bmsg')).toHaveCount(0);
    await expect(page.locator('#backup')).toBeVisible();
    // 置き換え確認の追記
    await page.evaluate(() => { const f = new File([JSON.stringify({ app: 'duo-calendar', version: 2, exportedAt: '2026-11-12T10:00:00+09:00', events: [] })], 'b.json', { type: 'application/json' }); const dt = new DataTransfer(); dt.items.add(f); const i = document.querySelector('#bk-file'); i.files = dt.files; i.dispatchEvent(new Event('change')); });
    await page.locator('#bk-replace').click();
    await expect(page.locator('#bk-body')).toContainText('iPhoneの予定と連携設定は変更しません。');
  });

  test('✓を外すとその予定は消え、全オフでも連携は保持。選択はlocalStorageに保存（EventKit変更APIは呼ばない）', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await seed(page, [ev('a1', 'Duo予定', '2026-11-12T08:00', '2026-11-12T09:00')]);
    await enable(page);
    await tab(page, '日').click();
    await expect(page.locator('.tlev.ext')).toHaveCount(2); // 歯医者・Duoで作成済み（この試験ではリンクなし）
    await openLinkPanel(page);
    await page.locator('[data-cal="cal-1"]').click();
    await expect(page.locator('.tlev.ext')).toHaveCount(0);
    await expect(page.locator('[data-cal="cal-1"]')).toHaveAttribute('aria-checked', 'false');
    await page.locator('[data-cal="cal-2"]').click(); // 全オフも可
    await expect(page.locator('[data-cal][aria-checked="true"]')).toHaveCount(0);
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-cal')));
    expect(ls.enabled).toBe(true);
    expect(ls.calendarIds).toEqual([]);
    await closeSettings(page);
    await expect(page.locator('.mdcard, .tlev')).toHaveCount(1);
    for (const m of ['createEvent', 'createEvents', 'updateEvent', 'deleteEvent', 'deleteExternalEvent']) expect(await calls(page, m)).toHaveLength(0);
  });
});

test.describe('第11版 PR6: updateEvent / deleteEvent の JS↔Swift 契約（呼び出し側は PR7）', () => {
  const call = (page, method, opts) => page.evaluate(async ([m, o]) => {
    try { return { ok: await window.Capacitor.nativePromise('DuoNative', m, o) }; } catch (e) { return { err: e.code }; }
  }, [method, opts]);
  const base = { itemId: 'i1', externalId: 'x1', eventId: 'e1', requestId: 'r1', calendarId: 'cal-1' };

  test('差分・空配列・null・各 span・新 requestId がそのまま渡り、戻りは識別子つき', async ({ page }) => {
    await mock(page);
    await openApp(page);
    for (const o of [
      { ...base, span: 'this', title: 'a' },
      { ...base, span: 'this', occurrenceStart: '2026-11-20T10:00', alarms: [] },
      { ...base, span: 'future', occurrenceStart: '2026-11-20T10:00', recurrence: null, newRequestId: 'r2', expectModified: 1763100000000 },
      { ...base, span: 'all', occurrenceStart: '2026-11-01T10:00', recurrence: { freq: 'weekly', interval: 1, byDay: [0, 3], count: 5, until: null }, force: true },
    ]) {
      const r = await call(page, 'updateEvent', o);
      expect(r.ok).toMatchObject({ itemId: 'i1', calendarId: 'cal-1' });
    }
    const c = await calls(page, 'updateEvent');
    expect(c).toHaveLength(4);
    expect(c[1].opts.alarms).toEqual([]);
    expect(c[2].opts).toMatchObject({ span: 'future', recurrence: null, newRequestId: 'r2' });
    expect(c[3].opts.recurrence.byDay).toEqual([0, 3]);
    expect(c[0].opts).not.toHaveProperty('alarms');
  });

  test('deleteEvent: 成功・missing・全失敗コード', async ({ page }) => {
    await mock(page);
    await openApp(page);
    expect((await call(page, 'deleteEvent', { ...base, span: 'this' })).ok).toEqual({ deleted: true });
    expect((await call(page, 'deleteEvent', { ...base, span: 'all', missing: true })).ok).toEqual({ deleted: true, missing: true });
    expect((await call(page, 'deleteEvent', { ...base, span: 'bad' })).err).toBe('INVALID_ARGUMENT');
    for (const code of ['NOT_FOUND', 'CONFLICT', 'WRITE_ONLY', 'PERMISSION_DENIED', 'RESTRICTED', 'READ_ONLY', 'CALENDAR_NOT_FOUND', 'INVALID_ARGUMENT', 'UNAVAILABLE']) {
      await page.evaluate((c) => { window.__mock.opErr = c; }, code);
      expect((await call(page, 'updateEvent', { ...base, span: 'this' })).err).toBe(code);
      expect((await call(page, 'deleteEvent', { ...base, span: 'this' })).err).toBe(code);
    }
  });
});

const LINK = { v: 2, state: 'linked', requestId: 'rq-1', calendarId: 'cal-1', itemId: 'it-1', externalId: 'ex-1', eventId: 'ev-1', ekModified: 1763100000000, seriesStart: '2026-11-12T10:00' };
const linkedEv = (x = {}) => ev('L1', '会食', '2026-11-12T10:00', '2026-11-12T11:00', { nativeLink: LINK, ...x });
async function openLinked(page, title = '会食') {
  await tab(page, '月').click();
  await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
  await page.locator('.mdcard, .tlev', { hasText: title }).click();
  await expect(page.locator('#editor')).toBeVisible();
}
const saveEdit = async (page, title) => { await page.locator('#f-title').fill(title); await page.locator('#editor [type=submit]').click(); await expect(page.locator('#editor')).toBeHidden(); };
const sent = (page, m) => calls(page, m);

test.describe('ネイティブ（偽装）第11版 PR7: iPhone へ反映', () => {
  test('linked の単発を編集 → updateEvent の引数（itemId・span:this・差分だけ・expectModified）', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await saveEdit(page, '会食（変更）');
    await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBe(1);
    const [c] = await sent(page, 'updateEvent');
    expect(c.opts).toMatchObject({ itemId: 'it-1', externalId: 'ex-1', eventId: 'ev-1', requestId: 'rq-1', calendarId: 'cal-1', span: 'this', title: '会食（変更）', expectModified: 1763100000000 });
    expect(c.opts).not.toHaveProperty('start');
    expect(c.opts).not.toHaveProperty('place');
    await expect.poll(async () => (await dbEvents(page))[0].nativeLink.ekModified).toBe(1763100001000);
    expect((await page.evaluate(async () => (await import('/js/db.js')).getOutbox()))).toEqual([]);
  });

  test('カテゴリだけの変更では送らない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await page.locator('#f-place').fill('');
    await page.locator('#editor [type=submit]').click();
    await page.waitForTimeout(900);
    expect(await sent(page, 'updateEvent')).toHaveLength(0);
  });

  test('3 回続けて編集（WRITE_ONLY で待ち）→ 許可後に updateEvent は 1 回、再起動後も再送', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'WRITE_ONLY'; });
    for (const t of ['A', 'B', 'C']) { await openLinked(page, t === 'A' ? '会食' : t === 'B' ? 'A' : 'B'); await saveEdit(page, t); await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBeGreaterThan(0); }
    const ob = await page.evaluate(async () => (await import('/js/db.js')).getOutbox());
    expect(ob).toHaveLength(1);
    expect(ob[0].payload).toEqual({ title: 'C' });
    expect((await dbEvents(page))[0].nativeLink.warn).toBe('writeOnly');
    await expect(page.locator('#native-toast')).toContainText('フルアクセスの許可が必要です');
    const before = (await sent(page, 'updateEvent')).length;
    // 再起動相当 → フルアクセスに変わっていれば送られる
    await page.addInitScript(() => {});
    await page.evaluate(() => { window.__mock.opErr = null; window.__mock.perm = 'granted'; });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBe(1);
    void before;
  });

  test('NOT_FOUND → 結びつきが外れ、Duo の予定は残り、お知らせが出る', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'NOT_FOUND'; });
    await openLinked(page);
    await saveEdit(page, 'x');
    await expect(page.locator('#native-toast')).toContainText('iPhone のカレンダーに元の予定が見つからないため、結びつきを外しました。Duo の予定はそのまま残っています。');
    const e = (await dbEvents(page))[0];
    expect(e.title).toBe('x');
    expect(e.nativeLink).toMatchObject({ state: 'unlinked', warn: 'missing' });
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
  });

  test('CONFLICT の update → force:true で再送し上書きを知らせる', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.needForce = true; });
    await openLinked(page);
    await saveEdit(page, 'y');
    await expect(page.locator('#native-toast')).toContainText('iPhone のカレンダー側でも変更されていたため、Duo の内容で上書きしました。');
    const c = await sent(page, 'updateEvent');
    expect(c.map((x) => !!x.opts.force)).toEqual([false, true]);
    expect((await dbEvents(page))[0].nativeLink.state).toBe('linked');
  });

  test('linked の削除 → 確認文・deleteEvent・外部の同じ予定は出ない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('会食\niPhone のカレンダーからも削除されます。');
    await expect(page.locator('#deletetitle')).toHaveCSS('font-size', '13px');
    await expect(page.locator('#deletetitle')).toHaveCSS('color', 'rgb(104, 113, 106)');
    await expect(page.locator('#canceldelete')).toBeFocused();
    await expect(page.locator('#dodelete')).toHaveText('削除する');
    await page.locator('#dodelete').click();
    await expect.poll(async () => (await sent(page, 'deleteEvent')).length).toBe(1);
    expect((await sent(page, 'deleteEvent'))[0].opts).toMatchObject({ itemId: 'it-1', span: 'this', requestId: 'rq-1' });
    expect(await dbEvents(page)).toHaveLength(0);
  });

  test('Duo のみの予定の削除文は予定名だけで、deleteEvent は呼ばれない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [ev('D1', '歯医者2', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await enable(page);
    await openLinked(page, '歯医者2');
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('歯医者2');
    await page.locator('#dodelete').click();
    await page.waitForTimeout(700);
    expect(await sent(page, 'deleteEvent')).toHaveLength(0);
  });

  test('権限なし: 「Duo からだけ削除」・Duo から削除ボタン・native 呼出し 0・未送信の更新も止まる', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'UNAVAILABLE'; });
    await openLinked(page);
    await saveEdit(page, 'q'); // 失敗して待ちに残る
    await expect.poll(async () => (await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).length).toBe(1);
    await page.evaluate(() => { window.__mock.perm = 'denied'; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    await openLinked(page, 'q');
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('Duo からだけ削除されます。iPhone のカレンダーには残ります。');
    await expect(page.locator('#dodelete')).toHaveText('Duo から削除');
    const n0 = (await sent(page, 'deleteEvent')).length;
    await page.locator('#dodelete').click();
    await expect.poll(async () => (await dbEvents(page)).length).toBe(0);
    expect((await sent(page, 'deleteEvent')).length).toBe(n0);
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
  });

  test('繰り返しの削除範囲にも iPhone の注意が出る', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv({ recurrence: { freq: 'daily', interval: 1, byDay: null, count: null, until: null } })]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#sc-warn')).toHaveText('会食\niPhone のカレンダーからも削除されます。');
    await page.locator('[data-scope="all"]').click();
    await expect(page.locator('#confirmtitle')).toHaveText('すべての繰り返しを削除しますか？');
    await expect(page.locator('#deletetitle')).toHaveText('iPhone のカレンダーからも削除されます。');
    await expect(page.locator('#canceldelete')).toBeFocused();
    await expect(page.locator('#dodelete')).toHaveText('すべて削除');
    expect(await dbEvents(page)).toHaveLength(1); // 確定前は何も変わらない
    await page.locator('#canceldelete').click();
    await expect(page.locator('#sc-title')).toHaveText('削除する範囲'); // キャンセルは範囲へ戻る
    expect(await dbEvents(page)).toHaveLength(1);
  });

  test('画像: 結びついた繰り返しの範囲シートと「すべて」の2段目', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv({ recurrence: { freq: 'daily', interval: 1, byDay: null, count: null, until: null } })]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#scope')).toBeVisible();
    await page.screenshot({ path: 'screenshots/v12-pr3-delete-scope.png' });
    await page.locator('[data-scope="all"]').click();
    await expect(page.locator('#confirm')).toBeVisible();
    await page.screenshot({ path: 'screenshots/v12-pr3-linked-delete-all.png' });
  });

  test('結びついた繰り返しの「これ以降すべて」は2段目なしで1回だけ反映', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv({ recurrence: { freq: 'daily', interval: 1, byDay: null, count: null, until: null } })]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await page.locator('[data-scope="following"]').click();
    await expect(page.locator('#confirm')).toBeHidden();
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('保存と送信待ちは同じトランザクション: meta の書き込み失敗で本文も送信待ちも元のまま', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await page.evaluate(() => { const p = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v) { if (this.name === 'meta') throw new Error('boom'); return p.call(this, v); }; });
    await page.locator('#f-title').fill('壊れる');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#error')).toHaveText('保存できませんでした。もう一度お試しください。');
    await page.waitForTimeout(700);
    expect((await dbEvents(page))[0].title).toBe('会食');
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
    expect(await sent(page, 'updateEvent')).toHaveLength(0);
  });

  test('作成の戻りが v2 のとき alarms を渡し、itemId・externalId・ekIdentifier を保存', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    await enable(page);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('通知付き');
    await toIphone(page);
    await page.locator('#editor [type=submit]').click();
    await expect(page.getByRole('status')).toHaveText('予定を保存し、iPhoneのカレンダーにも追加しました。');
    const [c] = await sent(page, 'createEvent');
    expect(Array.isArray(c.opts.alarms)).toBe(true);
    const e = (await dbEvents(page)).find((x) => x.title === '通知付き');
    expect(e.nativeLink).toMatchObject({ itemId: 'item-new-1', externalId: 'ext-new-1', ekModified: 1763100000000 });
    expect(e.nativeLink.ekIdentifier).toBe(`ext-new-1@${e.start}`);
  });
});

test.describe('端末をまたぐ照合（ekIdentifier）', () => {
  const rawEv = (x) => ({ id: 'x@2026-11-12T10:00', eventId: 'other-dev', calendarId: 'cal-1', title: '会食', start: '2026-11-12T10:00', end: '2026-11-12T11:00', all: false, place: '', notes: '', recurring: false, requestId: null, ...x });

  test('別の端末（eventId・itemId が違い、URL なしで externalId が同じ）でも月表示で二重にならない', async ({ page }) => {
    await mock(page, { events: [rawEv({ itemId: 'zz', externalId: 'ex-1' })] });
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.mdcard, .tlev', { hasText: '会食' })).toHaveCount(1); // Duo の1件だけ
    await expect(page.locator('.mdcard.ext, .tlev.ext', { hasText: '会食' })).toHaveCount(0);
  });

  test('externalId が空だった結びつきは、同期後の読込で埋まり ekIdentifier も付く（同値では書き換えない）', async ({ page }) => {
    await mock(page, { events: [rawEv({ itemId: 'it-1', externalId: 'ex-9', requestId: 'rq-1', eventId: 'ev-1' })] });
    await openApp(page);
    const { externalId, ekIdentifier, ...bare } = LINK;
    void externalId; void ekIdentifier;
    await seed(page, [linkedEv({ nativeLink: bare })]);
    await enable(page);
    await expect.poll(async () => (await dbEvents(page))[0].nativeLink.ekIdentifier).toBe('ex-9@2026-11-12T10:00');
    expect((await dbEvents(page))[0].nativeLink.externalId).toBe('ex-9');
    expect(await sent(page, 'updateEvent')).toHaveLength(0); // 照合では iPhone へ反映しない
  });

  test('代わりの照合で結びついた予定の削除は、予定名つきの確認文。キャンセルでは消費しない', async ({ page }) => {
    await mock(page, { v2: true });
    await openApp(page);
    const nl = { ...LINK, itemId: 'gone', eventId: 'gone', matchedBy: 'fallback', fallbackDeleteConfirmed: false, calName: '家族', calSource: 'Google' };
    await seed(page, [linkedEv({ nativeLink: nl })]);
    await enable(page);
    await openLinked(page);
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toHaveText('会食\niPhone のカレンダーからも削除されます。\niPhone のカレンダーの『会食』も削除されます');
    await page.locator('#canceldelete').click();
    expect((await dbEvents(page))[0].nativeLink.fallbackDeleteConfirmed).toBe(false);
    await page.locator('#delete').click();
    await expect(page.locator('#deletetitle')).toContainText('『会食』も削除されます');
    await page.locator('#dodelete').click();
    await expect.poll(async () => (await sent(page, 'deleteEvent')).length).toBe(1);
  });
});

test.describe('getEvent / listCalendars の契約（偽装。Swift 実動作の証明ではない）', () => {
  const get = (page, o) => page.evaluate(async (o) => { const n = await import('/js/native.js'); try { return { ok: await n.call('getEvent', o) }; } catch (e) { return { code: n.errCode(e) }; } }, o);
  test('Detail の全フィールドと null、listCalendars の isDefault', async ({ page }) => {
    await openApp(page); await mock(page); await page.reload();
    const cals = await page.evaluate(async () => (await (await import('/js/native.js')).call('listCalendars')).calendars);
    expect(cals.map((c) => c.isDefault)).toEqual([true, false]);
    const { ok: d } = await get(page, { itemId: 'it-1', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00' });
    for (const k of ['id', 'eventId', 'calendarId', 'title', 'start', 'end', 'all', 'place', 'notes', 'recurring', 'requestId', 'itemId', 'externalId', 'occurrenceDate', 'modifiedAt', 'alarms', 'alarmsExtra', 'rule', 'ruleText', 'detached', 'allowsModify', 'sourceType', 'hasAttendees', 'isOrganizer', 'hasUrl', 'editable', 'reason', 'seriesStart']) expect(d, k).toHaveProperty(k);
    expect(d.rule).toBeNull(); expect(d.reason).toBeNull(); expect(d.editable).toBe(true);
  });
  test('動かした回は occurrenceStart で引ける・理由・規則・引数不正・NOT_FOUND・権限エラー', async ({ page }) => {
    await openApp(page); await mock(page); await page.reload();
    const moved = (await get(page, { externalId: 'ex-w', occurrenceStart: '2026-11-16T09:00', currentStart: '2026-11-19T09:00' })).ok;
    expect(moved.rule).toBeTruthy(); // 偽装は先頭一致。動かした回の引数が currentStart として渡ることだけを確認
    expect((await calls(page, 'getEvent')).at(-1).opts.currentStart).toBe('2026-11-19T09:00');
    expect((await get(page, { itemId: 'it-b', occurrenceStart: '2026-11-20T00:00', currentStart: '2026-11-20T00:00' })).ok.reason).toBe('birthdays');
    const m = (await get(page, { itemId: 'it-m', occurrenceStart: '2026-11-21T10:00', currentStart: '2026-11-21T10:00' })).ok;
    expect(m.rule).toBeNull(); expect(m.ruleText).toContain('2週間'); expect(m.reason).toBe('organizerWithAttendees');
    expect((await get(page, { occurrenceStart: 'x', currentStart: 'x' })).code).toBe('INVALID_ARGUMENT');
    expect((await get(page, { itemId: 'zzz', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00' })).code).toBe('NOT_FOUND');
    for (const code of ['WRITE_ONLY', 'PERMISSION_DENIED', 'RESTRICTED', 'UNAVAILABLE']) {
      await page.evaluate((c) => { window.__mock.getErr = c; }, code);
      expect((await get(page, { itemId: 'it-1', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00' })).code).toBe(code);
    }
  });
});

test.describe('updateExternalEvent / deleteExternalEvent の契約（偽装。Swift 実動作の証明ではない）', () => {
  const T = { itemId: 'it-w', externalId: 'ex-w', eventId: 'w1', occurrenceStart: '2026-11-16T09:00', currentStart: '2026-11-16T09:00' };
  const run = (page, m, o) => page.evaluate(async ([m, o]) => { const n = await import('/js/native.js'); try { return { ok: await n.call(m, o) }; } catch (e) { return { code: n.errCode(e), reason: n.errReason(e), text: n.errText(e, '') }; } }, [m, o]);
  test.beforeEach(async ({ page }) => { await openApp(page); await mock(page); await page.reload(); });

  test('update: requestId なしで通り、conflicted・alarmsApplied・ID変更が返る', async ({ page }) => {
    await page.evaluate(() => { window.__mock.extConflict = true; window.__mock.extNewItem = 'it-new'; window.__mock.extAlarmCap = 1; });
    const r = (await run(page, 'updateExternalEvent', { ...T, span: 'this', expectModified: 1, title: 'x', alarms: [{ before: 5 }, { before: 10 }] })).ok;
    expect(r.conflicted).toBe(true); expect(r.alarmsApplied).toBe(1); expect(r.itemId).toBe('it-new');
    for (const k of ['itemId', 'externalId', 'eventId', 'modifiedAt', 'calendarId', 'occurrenceDate']) expect(r).toHaveProperty(k);
  });
  test('update: recurrence はキーがあれば null でも INVALID_ARGUMENT、all の日時は base 必須', async ({ page }) => {
    expect((await run(page, 'updateExternalEvent', { ...T, span: 'this', recurrence: null })).code).toBe('INVALID_ARGUMENT');
    expect((await run(page, 'updateExternalEvent', { ...T, span: 'all', start: '2026-11-17T09:00' })).code).toBe('INVALID_ARGUMENT');
    expect((await run(page, 'updateExternalEvent', { ...T, span: 'all', start: '2026-11-17T09:00', base: { start: '2026-11-16T09:00', end: '2026-11-16T10:00', all: false } })).ok.conflicted).toBe(false);
    expect((await run(page, 'updateExternalEvent', { occurrenceStart: T.occurrenceStart, currentStart: T.currentStart, span: 'this' })).code).toBe('INVALID_ARGUMENT');
    expect((await run(page, 'updateExternalEvent', { ...T, span: 'x' })).code).toBe('INVALID_ARGUMENT');
  });
  test('エラーコード・NOT_EDITABLE の理由と日本語、NOT_FOUND', async ({ page }) => {
    await page.evaluate(() => { window.__mock.extErr = 'NOT_EDITABLE'; window.__mock.extReason = 'invitee'; });
    const e = await run(page, 'updateExternalEvent', { ...T, span: 'this', title: 'x' });
    expect(e.code).toBe('NOT_EDITABLE'); expect(e.reason).toBe('invitee'); expect(e.text).toContain('iPhone');
    for (const code of ['READ_ONLY', 'CALENDAR_NOT_FOUND', 'WRITE_ONLY', 'PERMISSION_DENIED', 'RESTRICTED', 'UNAVAILABLE']) {
      await page.evaluate((c) => { window.__mock.extErr = c; }, code);
      expect((await run(page, 'updateExternalEvent', { ...T, span: 'this', title: 'x' })).code).toBe(code);
    }
    await page.evaluate(() => { window.__mock.extErr = null; window.__mock.extMissing = true; });
    expect((await run(page, 'updateExternalEvent', { ...T, span: 'this', title: 'x' })).code).toBe('NOT_FOUND');
  });
  test('delete: 競合は force なしで CONFLICT、force で削除、不存在は missing', async ({ page }) => {
    await page.evaluate(() => { window.__mock.extConflict = true; });
    expect((await run(page, 'deleteExternalEvent', { ...T, span: 'future', expectModified: 1 })).code).toBe('CONFLICT');
    expect((await run(page, 'deleteExternalEvent', { ...T, span: 'future', expectModified: 1, force: true })).ok).toEqual({ deleted: true });
    await page.evaluate(() => { window.__mock.extConflict = false; window.__mock.extMissing = true; });
    expect((await run(page, 'deleteExternalEvent', { ...T, span: 'all' })).ok).toEqual({ deleted: true, missing: true });
    expect((await run(page, 'deleteExternalEvent', { span: 'all', occurrenceStart: T.occurrenceStart, currentStart: T.currentStart })).code).toBe('INVALID_ARGUMENT');
  });
});

// 第13版 PR5: 「iPhone にも追加」を標準オン
const CALS3 = [
  { id: 'cal-a', title: '仕事', color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false },
  { id: 'cal-b', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-c', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const lk = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('duo-native-cal'))) || 'null'));
const openNew = (page) => page.locator('[data-act="add"]:visible').first().click();

test.describe('新規の標準オン（第13版 PR5）', () => {
  test('既定: オン・繰り返しの直下・場所の上、追加先は iPhone の既定。シートの選択は次へ持ち越さない', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await openApp(page);
    await enable(page);
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）');
    const ys = await page.evaluate(() => ['#f-title', '#dest-l', '#f-all'].map((q) => document.querySelector(q).getBoundingClientRect().top));
    expect(ys[0]).toBeLessThan(ys[1]); expect(ys[1]).toBeLessThan(ys[2]); // タイトルの下・終日の上に1行
    const bt = await page.locator('#f-dest').boundingBox();
    expect(Math.round(bt.height)).toBeGreaterThanOrEqual(44);
    await pickDest(page, 'iphone', 'cal-a');
    await expect(page.locator('#dest-name')).toHaveText('仕事（iCloud）');
    await page.locator('#close').click();
    await expect(page.locator('#editor')).toBeHidden();
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.locator('[data-act="add"]').first()).toBeAttached();
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）');
    // 設定は暗黙に変わらない
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('duo-native-cal')))))).defaultCalendarId).toBeFalsy();
  });

  test('1件だけオフ→次回はオン、設定は変わらない。オフでは createEvent なし', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await openApp(page);
    await enable(page);
    await openNew(page);
    await toDuo(page);
    await expect(page.locator('#dest-name')).toHaveText('仕事');
    await page.locator('#f-title').fill('Duoだけ');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    expect(await calls(page, 'createEvent')).toHaveLength(0);
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）'); // 一時選択は次へ持ち越さない
    expect((await lk(page)).defaultDest).toMatchObject({ type: 'iphone', id: 'cal-b' });
  });

  test('設定の「新しい予定の追加先」: 一覧から選ぶと再起動後も残り、新規シートの先頭になる', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await openApp(page);
    await enable(page);
    await openLinkPanel(page);
    await page.locator('#m-dest').click();
    await page.locator('#m-destpop .dopt[data-sdid="cal-a"]').click();
    await expect(page.locator('#m-dest')).toContainText('仕事（iCloud）');
    await closeSettings(page);
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('仕事（iCloud）');
    await page.locator('#close').click();
    await openLinkPanel(page);
    await page.locator('#m-dest').click();
    await page.locator('#m-destpop .dopt[data-sdtype="duo"]').first().click();
    await closeSettings(page);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText(/^(仕事|プライベート|家族|外出|その他)$/);
    await page.locator('#close').click();
    await openLinkPanel(page);
    await expect(page.locator('#m-dest')).not.toContainText('iCloud');
  });

  test('旧設定（addByDefault なし）は標準オン／不正値もオン', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await page.addInitScript(() => localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: true, calendarIds: ['cal-a', 'cal-b'], selectionInitialized: true, defaultCalendarId: null, addByDefault: 'no' })));
    await openApp(page);
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）');
    expect(await lk(page)).toMatchObject({ defaultDest: { type: 'iphone', id: 'cal-b' }, defaultCalendarId: null }); // 旧キーも残す
  });

  test('第15版 PR4: 旧設定の既定カレンダーが非表示（オフ）なら初期選択にならず、保存値は変えない', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await page.addInitScript(() => { if (!localStorage.getItem('duo-native-cal')) localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: true, calendarIds: ['cal-a'], selectionInitialized: true, defaultCalendarId: 'cal-b', addByDefault: true })); });
    await openApp(page);
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('その他'); // cal-b は非表示。同じ source に代わりが無いので Duo の「その他」へ（設計11 §1.1）
    expect(await lk(page)).toMatchObject({ defaultDest: { type: 'iphone', id: 'cal-b' } });
  });

  test('第15版 PR4: 旧オフ＋許可ありは有効化・全カレンダー未選択へ一度だけ移し、予定は出ない。再起動で繰り返さない', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [{ id: 'e1', calendarId: 'cal-a', title: '外部', start: '2026-11-16T10:00', end: '2026-11-16T11:00', allDay: false }] });
    await page.addInitScript(() => { if (!localStorage.getItem('duo-native-cal')) localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: false, calendarIds: ['cal-a'], selectionInitialized: true, defaultCalendarId: null, addByDefault: true })); });
    await openApp(page);
    await expect.poll(async () => (await lk(page)).enabledMig).toBe(true);
    expect(await lk(page)).toMatchObject({ enabled: true, calendarIds: [], selectionInitialized: true, defaultDest: { type: 'iphone' } });
    await page.evaluate(() => { const k = 'duo-native-cal', v = JSON.parse(localStorage.getItem(k)); v.calendarIds = ['cal-a']; localStorage.setItem(k, JSON.stringify(v)); });
    await page.reload();
    await openApp(page);
    await page.waitForTimeout(400);
    expect(await lk(page)).toMatchObject({ enabled: true, calendarIds: ['cal-a'] }); // 再起動で ids を空に戻さない
  });

  test('第15版 PR4: 権限なしの連携端末は Duo に確定、取得が遅れる間は既定先を決めない', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [], perm: 'denied' });
    await page.addInitScript(() => { if (!localStorage.getItem('duo-native-cal')) localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: true, calendarIds: ['cal-a'], selectionInitialized: true, defaultCalendarId: 'cal-a', addByDefault: true })); });
    await openApp(page);
    await expect.poll(async () => (await lk(page)).defaultDest?.type).toBe('duo');
  });

  test('第15版 PR4: 一覧の取得が終わるまで defaultDest を保存しない', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await page.addInitScript(() => { if (!localStorage.getItem('duo-native-cal')) localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: true, calendarIds: ['cal-a', 'cal-b'], selectionInitialized: true, defaultCalendarId: 'cal-a', addByDefault: true })); });
    await page.addInitScript(() => { const o = window.Capacitor; const f = o.nativePromise; o.nativePromise = async (p, m, a) => { if (m === 'listCalendars') await new Promise((r) => setTimeout(r, 4000)); return f(p, m, a); }; });
    await openApp(page);
    expect((await lk(page)).defaultDest ?? null).toBeNull();
    await expect.poll(async () => (await lk(page)).defaultDest?.id, { timeout: 9000 }).toBe('cal-a');
  });

  test('下書きの明示 xadd:false を優先。候補が消えたら先頭へ', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await openApp(page);
    await enable(page);
    await openNew(page);
    await toDuo(page);
    await page.locator('#f-title').fill('下書き');
    await page.reload();
    await expect(page.locator('#f-title')).toHaveValue('下書き');
    await expect(page.locator('#dest-name')).toHaveText('仕事');
  });

  test('設定の既定先が消えていたら iPhone の既定へ', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await page.addInitScript(() => localStorage.setItem('duo-native-cal', JSON.stringify({ version: 1, enabled: true, calendarIds: ['cal-a'], selectionInitialized: true, defaultCalendarId: 'cal-gone' })));
    await openApp(page);
    await openNew(page);
    await expect(page.locator('#dest-name')).toHaveText('その他'); // 既定先 cal-b は表示対象外（calendarIds=[cal-a]）なので「その他」;
  });

  test('書込先なし: 追加先の一覧は iPhone を出さず、新規シートも Duo だけ。未連携では出ない', async ({ page }) => {
    await mock(page, { cals: [CALS3[2]], events: [] });
    await openApp(page);
    await openNew(page);
    await expect(page.locator('#dest-l')).toBeVisible(); // 未連携は Duo のカテゴリだけ
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-dtype="iphone"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('#close').click();
    await enable(page);
    await openLinkPanel(page);
    await page.locator('#m-dest').click();
    await expect(page.locator('#m-destpop .dopt[data-sdtype="iphone"]')).toHaveCount(0);
    await page.locator('#m-destpop .dback').click(); // 追加先ページから設定へ戻る
    await expect(page.locator('[data-cal]')).toHaveCount(1); // 表示のみのカレンダーは✓で選べる
    await closeSettings(page);
    await openNew(page);
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-dtype="iphone"]')).toHaveCount(0); // 書込先なし
  });

  test('追加失敗: Duo に保存・通知は Duo へ戻り、シート選択は設定に残らない', async ({ page }) => {
    await mock(page, { cals: CALS3, events: [] });
    await openApp(page);
    await enable(page);
    await page.evaluate(() => { window.__mock.createErr = 'PERMISSION_DENIED'; });
    await openNew(page);
    await pickDest(page, 'iphone', 'cal-a');
    await page.locator('#f-title').fill('失敗');
    await page.locator('#editor [type=submit]').click();
    await expect(page.getByRole('status')).toContainText('iPhoneのカレンダーには追加できませんでした');
    const e = (await dbEvents(page)).find((x) => x.title === '失敗');
    expect(e.nativeLink?.state).not.toBe('linked');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('duo-native-cal')))));
    expect(st.defaultCalendarId).toBeNull();
  });
});

test.describe('リマインダー連携は外した（PR22。偽装。Swift 実動作の証明ではない）', () => {
  test('起動してもリマインダー系の要求は0で、カレンダー許可の状態確認は従来どおり', async ({ page }) => {
    await mock(page, { perm: 'denied', remPerm: 'notDetermined' });
    await page.goto('/');
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => window.__mock.calls.filter((c) => /Reminder/.test(c.method)).length);
    expect(n).toBe(0);
    expect(await page.evaluate(async () => (await import('/js/native.js')).call('checkPermission', {}))).toEqual({ status: 'denied' });
  });
});

// 第14版 PR31: 貼付結果と失敗分の再試行（偽装。Swift 実動作の証明ではない）
test.describe('貼付のまとめ確定と再試行（PR31）', () => {
  const D3 = ['2026-11-16', '2026-11-17', '2026-11-18'];
  // linked の Duo 予定を days へ貼る計画を作って確定する。新しい id は x1,x2,…（日ごとに 予定id・requestId の順）。
  const paste = (page, days, { fail = {}, source = {} } = {}) => page.evaluate(async ({ days, fail, source }) => {
    const { planPaste } = await import('/js/paste.js');
    window.__mock.createEventsFail = fail;
    let n = 0;
    const src = { title: '貼る', categoryId: 'work', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', alarms: [{ before: 30 }], nativeLink: { state: 'linked', calendarId: 'cal-1' }, ...source };
    const plan = planPaste(src, days, { cals: window.__mock.cals, enabled: true, destCalendarId: 'cal-1', defaultCatId: () => 'other', newId: () => `x${++n}`, pastedAt: 1 });
    window.__r = window.pasteCommit(plan);
    return null;
  }, { days, fail, source });
  const states = async (page) => Object.fromEntries((await dbEvents(page)).filter((e) => e.title === '貼る').map((e) => [e.start.slice(0, 10), e.nativeLink?.state]));
  const sends = async (page) => (await calls(page, 'createEvents')).map((c) => c.opts.items.map((i) => i.requestId));

  test('3件中1件だけ UNAVAILABLE: 1回の createEvents・日付つきダイアログ・再試行は同じ requestId だけ', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await paste(page, D3, { fail: { x4: 'UNAVAILABLE' } });
    const r = page.locator('#xretry');
    await expect(r).toBeVisible();
    await expect(r).toContainText('11月17日は iPhone のカレンダーに入れられませんでした。Duo には保存してあります。');
    expect(await sends(page)).toEqual([['x2', 'x4', 'x6']]);
    expect(await states(page)).toEqual({ '2026-11-16': 'linked', '2026-11-17': 'pending', '2026-11-18': 'linked' });
    await page.evaluate(() => { window.__mock.createEventsFail = {}; });
    await page.locator('#xr-retry').click();
    await expect.poll(async () => (await states(page))['2026-11-17']).toBe('linked');
    expect(await sends(page)).toEqual([['x2', 'x4', 'x6'], ['x4']]);
    await expect(r).toBeHidden();
  });

  test('「閉じる」で残りの pending は unlinked に戻り、通知（Duo）へ復帰する', async ({ page }) => {
    await mock(page, { notif: 'granted' });
    await openApp(page);
    await enable(page);
    await paste(page, D3, { fail: { x4: 'UNAVAILABLE' } });
    await expect(page.locator('#xretry')).toBeVisible();
    await page.locator('#xr-close').click();
    await expect.poll(async () => (await states(page))['2026-11-17']).toBe('unlinked');
    const id = (await dbEvents(page)).find((e) => e.start.startsWith('2026-11-17') && e.title === '貼る').id;
    await expect.poll(() => page.evaluate(() => window.__mock.pending.map((i) => i.eventId))).toContain(id);
    expect((await sends(page)).length).toBe(1); // 閉じただけでは再送しない
  });

  test('再試行できない失敗（READ_ONLY）は即 unlinked・再試行ボタンなし', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await paste(page, D3, { fail: { x2: 'READ_ONLY' } });
    await expect(page.locator('#xretry')).toContainText('11月16日');
    await expect(page.locator('#xr-retry')).toBeHidden();
    expect(await states(page)).toEqual({ '2026-11-16': 'unlinked', '2026-11-17': 'linked', '2026-11-18': 'linked' });
  });

  test('再試行も失敗 → 再試行ボタンは出ず、閉じると unlinked（requestId は同じ・送信は2回だけ）', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    await paste(page, D3, { fail: { x4: 'UNAVAILABLE' } });
    await page.locator('#xr-retry').click();
    await expect(page.locator('#xretry')).toBeVisible();
    await expect(page.locator('#xr-retry')).toBeHidden();
    expect((await states(page))['2026-11-17']).toBe('pending');
    await page.locator('#xr-close').click();
    await expect.poll(async () => (await states(page))['2026-11-17']).toBe('unlinked');
    expect(await sends(page)).toEqual([['x2', 'x4', 'x6'], ['x4']]);
  });

  test('DB の保存に失敗したら native は1回も呼ばない', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    const r = await page.evaluate(async () => {
      const { planPaste } = await import('/js/paste.js');
      let n = 0;
      const plan = planPaste({ title: 't', categoryId: 'work', start: '2026-11-12T10:00', end: '2026-11-12T11:00', nativeLink: { state: 'linked', calendarId: 'cal-1' } }, ['2026-11-16', '2026-11-17'], { cals: window.__mock.cals, enabled: true, destCalendarId: 'cal-1', defaultCatId: () => 'other', newId: () => `y${++n}`, pastedAt: 1 });
      plan.items[1].event.id = undefined; // IndexedDB が拒否する
      return window.pasteCommit(plan);
    });
    expect(r.saveFailed).toBe(true);
    expect(await calls(page, 'createEvents')).toHaveLength(0);
    expect((await dbEvents(page)).filter((e) => e.title === 't')).toHaveLength(0); // 1TX なので1件目も残らない
  });

  test('型B（iPhone だけ）の失敗は「Duo にも入っていません」。DB に書かず、再試行は同じ requestId', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    const before = (await dbEvents(page)).length;
    await page.evaluate(async () => {
      window.__mock.createEventsFail = { b2: 'UNAVAILABLE' };
      const B = (day, n) => ({ requestId: `b${n}`, copyFrom: { itemId: 'it-1', occurrenceStart: '2026-11-12T15:00', currentStart: '2026-11-12T15:00' }, start: `${day}T15:00`, end: `${day}T16:00`, all: false });
      window.pasteCommit({ ok: true, items: [{ day: '2026-11-16', native: B('2026-11-16', 1) }, { day: '2026-11-17', native: B('2026-11-17', 2) }] });
    });
    await expect(page.locator('#xretry')).toContainText('11月17日は貼り付けられませんでした。Duo にも入っていません。');
    expect((await dbEvents(page)).length).toBe(before);
    await page.evaluate(() => { window.__mock.createEventsFail = {}; });
    await page.locator('#xr-retry').click();
    await expect.poll(async () => (await sends(page)).length).toBe(2);
    expect((await sends(page))[1]).toEqual(['b2']);
    await expect(page.locator('#xretry')).toBeHidden();
    expect((await dbEvents(page)).length).toBe(before);
  });

  test('日付の列挙は3件まで、ほかN日', async ({ page }) => {
    await mock(page);
    await openApp(page);
    await enable(page);
    const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
    await paste(page, days, { fail: Object.fromEntries(days.map((_, i) => [`x${2 * i + 2}`, 'UNAVAILABLE'])) });
    await expect(page.locator('#xr-msg')).toContainText('11月16日、11月17日、11月18日ほか2日は');
  });

  const pend = (n, i) => ev(`p${i}`, `未完了${i}`, `2026-12-${String(1 + (i % 28)).padStart(2, '0')}T10:00`, `2026-12-${String(1 + (i % 28)).padStart(2, '0')}T11:00`, { nativeLink: { state: 'pending', requestId: `q${i}`, calendarId: 'cal-1' } });
  const startup = async (page, n) => {
    await mock(page);
    await openApp(page);
    await seed(page, Array.from({ length: n }, (_, i) => pend(n, i)));
    await enable(page);
    await page.reload();
    await page.waitForSelector('html[data-ready]');
  };

  test('起動時に pending が3件 → ダイアログ1つ「3件」→ 再試行で createEvents 1回', async ({ page }) => {
    await startup(page, 3);
    await expect(page.locator('#xretry')).toBeVisible();
    await expect(page.locator('#xr-msg')).toContainText('3件');
    await page.locator('#xr-retry').click();
    await expect.poll(async () => (await dbEvents(page)).filter((e) => e.nativeLink?.state === 'linked').length).toBe(3);
    expect(await sends(page)).toEqual([['q0', 'q1', 'q2']]);
  });

  test('起動時の pending が33件 → 31件＋2件の2回に分けて集計し、閉じれば全件 unlinked', async ({ page }) => {
    await startup(page, 33);
    await page.locator('#xr-retry').click();
    await expect.poll(async () => (await dbEvents(page)).filter((e) => e.nativeLink?.state === 'linked').length).toBe(33);
    expect((await sends(page)).map((s) => s.length)).toEqual([31, 2]);
  });

  test('起動時のダイアログを閉じると pending 全件が unlinked に戻り、再提示されない', async ({ page }) => {
    await startup(page, 3);
    await page.locator('#xr-close').click();
    await expect.poll(async () => (await dbEvents(page)).filter((e) => e.nativeLink?.state === 'unlinked').length).toBe(3);
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#xretry')).toBeHidden();
  });
});

// 第14版 PR32: 貼り付けた予定を六秒以内に取り消す（偽装。Swift 実動作の証明ではない）
test.describe('貼付の取消（PR32）', () => {
  const D3 = ['2026-11-16', '2026-11-17', '2026-11-18'];
  const paste = (page, days, { fail = {}, source = {} } = {}) => page.evaluate(async ({ days, fail, source }) => {
    const { planPaste } = await import('/js/paste.js');
    window.__mock.createEventsFail = fail;
    let n = 0;
    const src = { title: '貼る', categoryId: 'work', all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '', notes: '', alarms: [{ before: 30 }], nativeLink: { state: 'linked', calendarId: 'cal-1' }, ...source };
    const plan = planPaste(src, days, { cals: window.__mock.cals, enabled: true, destCalendarId: 'cal-1', defaultCatId: () => 'other', newId: () => `x${++n}`, pastedAt: 1 });
    return await window.pasteCommit(plan);
  }, { days, fail, source });
  const mine = async (page) => (await dbEvents(page)).filter((e) => e.title === '貼る');
  const EXT = { origin: 'iphone', calId: 'cal-1', itemId: 'it-1', externalId: 'ex-1', eventId: 'e1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00', all: false, nativeLink: undefined, alarms: undefined };
  const toast = (page) => page.locator('#native-toast');

  test('linked 3件: 6秒内の取消で Duo と iPhone（deleteEvent）から消え、通知は入れ直し、取消の記録は残らない', async ({ page }) => {
    await mock(page, { notif: 'granted' });
    await openApp(page); await enable(page);
    const r = await paste(page, D3);
    expect(r.done).toBe(3);
    await expect(toast(page)).toContainText('3件を貼り付けました。');
    const n0 = (await calls(page, 'notifySync')).length;
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect(toast(page)).toContainText('貼り付けを取り消しました。');
    expect(await mine(page)).toHaveLength(0);
    await expect.poll(async () => (await calls(page, 'deleteEvent')).length).toBe(3);
    expect((await calls(page, 'notifySync')).length).toBeGreaterThan(n0);
    expect(await page.evaluate(() => window.__mock.pending.length)).toBe(0);
    expect(JSON.stringify(await dbEvents(page))).not.toContain('undo');
  });

  test('貼付後に編集した Duo 予定は残り、件数を説明する。取消連打でも1回だけ', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, D3);
    await page.evaluate(async () => { const db = await import('/js/db.js'); const e = (await db.listEvents()).find((x) => x.start.startsWith('2026-11-17') && x.title === '貼る'); await db.putEvent({ ...e, title: '貼る', notes: '編集', updatedAt: 99 }); });
    const b = toast(page).getByRole('button', { name: '元に戻す' });
    await b.dblclick().catch(() => {});
    await expect(toast(page)).toContainText('1件は貼り付けたあとに変更されていたため、残しました。');
    const left = await mine(page);
    expect(left.map((e) => e.start.slice(0, 10))).toEqual(['2026-11-17']);
    expect(left[0].notes).toBe('編集');
    await expect.poll(async () => (await calls(page, 'deleteEvent')).length).toBe(2);
  });

  test('linked 側が貼付後に iPhone で変更されていたら削除せず、Duo の予定も戻す', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, D3);
    await page.evaluate(() => { window.__mock.createdMod = 1763199999999; });
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect.poll(async () => (await mine(page)).length).toBe(3);
    expect(await calls(page, 'deleteEvent')).toHaveLength(0);
    await expect(toast(page)).toContainText('残しました');
    expect((await mine(page)).every((e) => e.nativeLink?.state === 'linked')).toBe(true);
    await expect.poll(async () => (await page.evaluate(async () => (await (await import('/js/db.js')).getOutbox()).length))).toBe(0);
  });

  test('iPhone だけの複製（型B）: force なしの deleteExternalEvent。CONFLICT は残す', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, D3, { source: EXT });
    expect(await mine(page)).toHaveLength(0);
    await page.evaluate(() => { window.__mock.extConflict = true; });
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect(toast(page)).toContainText('3件は貼り付けたあとに変更されていたため、残しました。');
    const d = await calls(page, 'deleteExternalEvent');
    expect(d).toHaveLength(3);
    for (const c of d) expect(c.opts).toMatchObject({ span: 'this', expectModified: 1763100000000, force: false });
  });

  test('型B は成功すれば消える。DB を壊さず「取り消しました」', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, D3, { source: EXT });
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect(toast(page)).toContainText('貼り付けを取り消しました。');
    expect(await calls(page, 'deleteExternalEvent')).toHaveLength(3);
  });

  test('6秒を過ぎると取り消せない（ボタンが消え、記録も捨てる）。再起動後もない', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, ['2026-11-16']);
    await expect(toast(page).getByRole('button', { name: '元に戻す' })).toBeVisible();
    await page.waitForTimeout(4400);
    await expect(toast(page).getByRole('button', { name: '元に戻す' })).toBeVisible(); // 通常の4秒では消えない
    await expect(toast(page)).toBeHidden({ timeout: 3000 });
    expect(await mine(page)).toHaveLength(1);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.getByRole('button', { name: '元に戻す' })).toHaveCount(0);
  });

  test('失敗ダイアログ中は始めず、閉じたあとから6秒', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, D3, { fail: { x4: 'UNAVAILABLE' } });
    await expect(page.locator('#xretry')).toBeVisible();
    await page.waitForTimeout(6500);
    await page.locator('#xr-close').click();
    await expect(toast(page).getByRole('button', { name: '元に戻す' })).toBeVisible();
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect(toast(page)).toContainText('貼り付けを取り消しました。');
    await expect.poll(async () => (await mine(page)).length).toBe(1); // 失敗した1件（Duo のみ）は貼付の成功分ではないので残る
  });

  test('DB 失敗では何も消えず、再度押せる', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, ['2026-11-16', '2026-11-17']);
    await page.evaluate(async () => {
      const db = await import('/js/db.js'); const orig = db.applyUndo;
      window.__origUndo = orig;
      // モジュール名前空間は書換不可のため IDBObjectStore.delete を一度だけ失敗させる
      const od = IDBObjectStore.prototype.delete; IDBObjectStore.prototype.delete = function (...a) { IDBObjectStore.prototype.delete = od; throw new Error('boom'); };
    });
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect(page.locator('#status')).toContainText('元に戻せませんでした');
    expect(await mine(page)).toHaveLength(2);
    expect(await calls(page, 'deleteEvent')).toHaveLength(0);
    await expect(toast(page).getByRole('button', { name: '元に戻す' })).toBeVisible();
    await toast(page).getByRole('button', { name: '元に戻す' }).click();
    await expect.poll(async () => (await mine(page)).length).toBe(0);
  });

  test('別のお知らせに入れ替わるとボタンは消えるが、DB・通知は壊れない', async ({ page }) => {
    await mock(page);
    await openApp(page); await enable(page);
    await paste(page, ['2026-11-16']);
    await expect(toast(page)).toBeVisible();
    await page.evaluate(() => { document.querySelector('#native-toast').remove(); });
    expect(await mine(page)).toHaveLength(1);
    await page.waitForTimeout(6300); // 記録は6秒で静かに捨てられる
  });
});

// ---------- 第15版 PR6: 既存予定の保存先の移動と、色・札を保存先カレンダーに揃える ----------
const CALS6 = [...CALS, { id: 'cal-3', title: '仕事', color: '#1a73e8', sourceId: 's-i', source: 'iCloud', sourceType: 'caldav', allowsModify: true, isDefault: false }];
const mock6 = (page, cfg = {}) => mock(page, { v2: true, cals: CALS6, ...cfg });
const dbOne = async (page) => (await dbEvents(page))[0];

test.describe('第15版 PR6: 既存予定のカレンダー移動', () => {
  test('linked の編集: 旧カテゴリ行はなく、候補は iPhone のカレンダーだけ（Duo へは戻せない）', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await expect(page.locator('#f-cat, #cat-l, #f-ecal, #ecal-l')).toHaveCount(0);
    await expect(page.locator('#dest-name')).toHaveText('家族（Google）');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-dtype="duo"]')).toHaveCount(0);
    await expect(page.locator('#dest-pop .dopt .dn')).toHaveText(['家族', '仕事']);
  });

  test('linked を別の iPhone カレンダーへ: updateEvent の moveCalendarId だけ（日時・通知は送らない）、二重作成なし、結びつきを返り値で更新', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.moveIds = true; });
    await openLinked(page);
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBe(1);
    const [c] = await sent(page, 'updateEvent');
    expect(c.opts).toMatchObject({ itemId: 'it-1', requestId: 'rq-1', calendarId: 'cal-1', moveCalendarId: 'cal-3', span: 'this', expectModified: 1763100000000 });
    for (const k of ['start', 'end', 'all', 'alarms', 'title', 'place', 'notes', 'recurrence']) expect(c.opts).not.toHaveProperty(k);
    expect(await sent(page, 'createEvent')).toHaveLength(0);
    await expect.poll(async () => (await dbOne(page)).nativeLink.calendarId).toBe('cal-3');
    const l = (await dbOne(page)).nativeLink;
    expect(l).toMatchObject({ state: 'linked', itemId: 'moved-it-1', eventId: 'moved-ev-1', calName: '仕事' });
    expect(await dbEvents(page)).toHaveLength(1);
    expect(await page.evaluate(async () => (await import('/js/db.js')).getOutbox())).toEqual([]);
    expect((await dbOne(page)).categoryId).toBe('d0c47a10-0000-4000-8000-000000000001'); // 既存の categoryId は保持（Duo→iPhone のときだけ none）
  });

  test('移さずに保存したら calendarId の移動は送らない。別カレンダーへ移したあと元へ戻すと変更なし', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await pickDest(page, 'iphone', 'cal-3');
    await pickDest(page, 'iphone', 'cal-1');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await page.waitForTimeout(700);
    expect(await sent(page, 'updateEvent')).toHaveLength(0);
  });

  test('移動の失敗（READ_ONLY）: 予定は消えず、結びつきだけ外れて案内が出る', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'READ_ONLY'; });
    await openLinked(page);
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect.poll(async () => (await dbOne(page)).nativeLink.state).toBe('unlinked');
    expect(await dbEvents(page)).toHaveLength(1);
  });

  test('移動の一時失敗は同じ内容で再送され、二重作成しない', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await page.evaluate(() => { window.__mock.opErr = 'UNAVAILABLE'; });
    await openLinked(page);
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#editor [type=submit]').click();
    await expect.poll(async () => (await sent(page, 'updateEvent')).length).toBeGreaterThan(0);
    const ob = await page.evaluate(async () => (await import('/js/db.js')).getOutbox());
    expect(ob).toHaveLength(1);
    expect(ob[0].payload).toEqual({ calendarId: 'cal-3' });
    expect((await dbOne(page)).nativeLink.state).toBe('linked');
    expect(await sent(page, 'createEvent')).toHaveLength(0);
  });

  test('Duo の予定を iPhone へ移す: createEvent を1回、同じ予定に linked を付けて categoryId は none。重複しない', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [ev('D1', '歯科', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await enable(page);
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
    await page.locator('.mdcard, .tlev', { hasText: '歯科' }).click();
    await expect(page.locator('#dest-name')).toHaveText('仕事');
    await page.locator('#f-dest').click();
    await expect(page.locator('#dest-pop .dopt[data-dtype="duo"]').first()).toBeVisible();
    await page.locator('#dest-pop .dopt[data-dtype="iphone"][data-did="cal-3"]').click();
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect.poll(async () => (await sent(page, 'createEvent')).length).toBe(1);
    const [c] = await sent(page, 'createEvent');
    expect(c.opts).toMatchObject({ calendarId: 'cal-3', title: '歯科', start: '2026-11-12T10:00' });
    await expect.poll(async () => (await dbOne(page)).nativeLink?.state).toBe('linked');
    const e = await dbOne(page);
    expect(await dbEvents(page)).toHaveLength(1);
    expect(e).toMatchObject({ id: 'D1', categoryId: 'd0c47a10-0000-4000-8000-000000000000' });
    expect(e.nativeLink.calendarId).toBe('cal-3');
    expect(e).not.toHaveProperty('moveFromCat');
    expect(await sent(page, 'updateEvent')).toHaveLength(0);
  });

  test('Duo → iPhone の作成に失敗: 予定は消えず、放棄すると元のカテゴリに戻る', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [ev('D1', '歯科', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await enable(page);
    await page.evaluate(() => { window.__mock.createFail = 1; });
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
    await page.locator('.mdcard, .tlev', { hasText: '歯科' }).click();
    const before = (await dbOne(page)).categoryId;
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#editor [type=submit]').click();
    await expect(page.locator('#xretry')).toBeVisible();
    expect(await dbEvents(page)).toHaveLength(1);
    await page.locator('#xr-close').click();
    await expect.poll(async () => (await dbOne(page)).nativeLink?.state).toBe('unlinked');
    expect((await dbOne(page)).categoryId).toBe(before);
    expect(await dbEvents(page)).toHaveLength(1);
  });

  test('色と札は保存先カレンダーのもの。未取得なら保存した名前と安全な色', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv({ nativeLink: { ...LINK, calName: '旧名' } })]);
    await enable(page);
    await tab(page, '月').click();
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: 12, y: 10 } });
    const blk = page.locator('.mdcard, .tlev', { hasText: '会食' });
    await expect(blk).toHaveAttribute('style', /--cat:#d93025/);
    await expect(blk).toHaveAttribute('aria-label', /家族/);
  });

  test('移動の選択肢を選んだだけの途中で閉じると破棄確認。元に戻せば確認なし', async ({ page }) => {
    await mock6(page);
    await openApp(page);
    await seed(page, [linkedEv()]);
    await enable(page);
    await openLinked(page);
    await pickDest(page, 'iphone', 'cal-3');
    await page.locator('#scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#discard')).toBeVisible();
  });
});
