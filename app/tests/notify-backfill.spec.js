// 第15版 PR12: 通知の既定「なし」への一度きりの移行（実 IndexedDB / localStorage）。旧・自動30分付与は行わない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, ev, dbEvents } from './helpers.js';

const NK = 'duo-notify', PK = 'duo-notify-policy.v15';
const lsNotify = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), NK);
const lsPolicy = (page) => page.evaluate((k) => localStorage.getItem(k), PK);
const reload = async (page) => { await page.reload(); await page.waitForSelector('html[data-ready]'); };
const alarmsOf = async (page) => Object.fromEntries((await dbEvents(page)).map((e) => [e.id, e.alarms]));
// 初回起動の後に、端末を「旧版のまま」へ戻す（localStorage 全消去と、旧い meta の印の削除）
const rewind = (page) => page.evaluate(async () => {
  localStorage.clear();
  const db = await new Promise((res) => { const r = indexedDB.open('duo-calendar'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').clear(); t.oncomplete = res; });
  db.close();
});
const F = ev('fut', '未来', '2026-11-20T10:00', '2026-11-20T11:00');
const E = ev('empty', 'なし', '2026-11-21T10:00', '2026-11-21T11:00', { alarms: [] });
const A = ev('al', '通知あり', '2026-11-22T10:00', '2026-11-22T11:00', { alarms: [{ before: 30 }, { before: 5 }] });
const AD = ev('ad', '終日', '2026-11-24T00:00', '2026-11-24T23:59', { all: true, alarms: [{ day: 1, at: '09:00' }] });
const REC = ev('rec', '毎週', '2026-11-02T10:00', '2026-11-02T11:00', { recurrence: { freq: 'weekly', interval: 1, byDay: null, count: null, until: null }, overrides: { '2026-11-09T10:00': { title: 'x', start: '2026-11-09T10:00', end: '2026-11-09T11:00', alarms: [{ before: 10 }] } } });
const ALL = [F, E, A, AD, REC];

test.describe('通知の既定の一度きり移行', () => {
  test('まっさらな端末：オフ・既定なし、印あり。予定へ何も付けない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    expect(await lsNotify(page)).toEqual({ version: 1, enabled: false, showTitle: true, defaultTimed: null, defaultAllDay: null });
    expect(await lsPolicy(page)).not.toBeNull();
  });

  test('旧版の設定だけ（enabled 未保存）：オン、既定なし、showTitle 保持', async ({ page }) => {
    await page.addInitScript(([k]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ showTitle: false, defaultTimed: { before: 15 } })); }, [NK]);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    expect(await lsNotify(page)).toEqual({ version: 1, enabled: true, showTitle: false, defaultTimed: null, defaultAllDay: null });
  });

  test('保存済み enabled:false は尊重（既存端末でも）', async ({ page }) => {
    await page.addInitScript(([k]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ enabled: false, defaultTimed: { before: 30 } })); }, [NK]);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    expect((await lsNotify(page)).enabled).toBe(false);
    expect((await lsNotify(page)).defaultTimed).toBeNull();
  });

  test('予定だけがある旧端末（設定も印も無し）：オン。既存のアラームは完全不変で、再起動でも変わらない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.evaluate(async (l) => { await (await import('/js/db.js')).putMany(l); }, ALL);
    const before = await dbEvents(page);
    await rewind(page);
    await reload(page);
    expect((await lsNotify(page)).enabled).toBe(true);
    expect(await dbEvents(page)).toEqual(before);
    expect((await alarmsOf(page)).fut).toBeUndefined();
    await reload(page);
    expect(await dbEvents(page)).toEqual(before);
    expect(await lsNotify(page)).toEqual({ version: 1, enabled: true, showTitle: true, defaultTimed: null, defaultAllDay: null });
  });

  test('メモだけがある旧端末も既存とみなす（オン）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.evaluate(async () => { const db = await new Promise((res) => { const r = indexedDB.open('duo-calendar'); r.onsuccess = () => res(r.result); }); await new Promise((res) => { const t = db.transaction('memos', 'readwrite'); t.objectStore('memos').put({ id: 'm1', date: '2026-11-12', text: 'メモ' }); t.oncomplete = res; }); db.close(); });
    await rewind(page);
    await reload(page);
    expect((await lsNotify(page)).enabled).toBe(true);
  });

  test('印があれば再移行しない（利用者が選んだ既定は保たれる）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ version: 1, enabled: true, showTitle: true, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '09:00' } })), NK);
    await reload(page);
    expect(await lsNotify(page)).toEqual({ version: 1, enabled: true, showTitle: true, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '09:00' } });
  });

  test('設定の書込に失敗したら印を書かず、次の起動で再試行（既存の判定を誤らない）', async ({ page }) => {
    await page.addInitScript(([k]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ showTitle: true })); }, [NK]);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.evaluate(([p]) => localStorage.removeItem(p), [PK]);
    await page.addInitScript(([n]) => { if (sessionStorage.getItem('f')) return; sessionStorage.setItem('f', '1'); const s = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === n) throw new Error('quota'); return s.call(this, k, v); }; }, [NK]);
    await reload(page);
    expect(await lsPolicy(page)).toBeNull();
    await reload(page); // 失敗の仕掛けは1回だけ
    expect(await lsPolicy(page)).not.toBeNull();
    expect((await lsNotify(page)).enabled).toBe(true);
  });
});

test.describe('移行と通知の同期（偽装ネイティブ）', () => {
  const mock = (page) => page.addInitScript(() => {
    const M = window.__mock = { calls: [], pending: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': return { status: 'denied' };
          case 'notifyStatus': return { status: 'granted' };
          case 'notifySync': M.pending = opts.items; return { scheduled: opts.items.length, removed: 0, skipped: 0 };
          case 'notifyClear': return { removed: 0 };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  });
  const count = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => c.method === m).length, m);

  test('既存端末は移行後も既存アラームが予約され、許可は要求しない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.evaluate(async (l) => { await (await import('/js/db.js')).putMany(l); }, [A]);
    await rewind(page);
    await mock(page);
    await reload(page);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.map((i) => i.id))).toEqual(['duo.al@2026-11-22T10:00#0', 'duo.al@2026-11-22T10:00#1']);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
  });

  test('まっさらな端末は予約0（オフ）で、許可は要求しない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__mock.pending.length)).toBe(0);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
  });
});
