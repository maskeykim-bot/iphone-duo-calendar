// 第11版 PR10: 一度だけの既定通知付与（実 IndexedDB）。DuoNative は偽装で、Swift の実動作の証明ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, ev, dbEvents, openMenu } from './helpers.js';

const F = ev('fut', '未来', '2026-11-20T10:00', '2026-11-20T11:00');
const P = ev('past', '過去', '2026-11-01T10:00', '2026-11-01T11:00');
const E = ev('empty', 'なし', '2026-11-21T10:00', '2026-11-21T11:00', { alarms: [] });
const L = ev('link', '連携', '2026-11-22T10:00', '2026-11-22T11:00', { nativeLink: { state: 'unlinked', v: 2 } });
const I = ev('iph', 'iPhone', '2026-11-23T10:00', '2026-11-23T11:00', { origin: 'iphone' });
const AD = ev('ad', '終日', '2026-11-24T00:00', '2026-11-24T23:59', { all: true });
const REND = ev('rend', '打切り', '2026-11-01T10:00', '2026-11-01T11:00', { recurrence: { freq: 'daily', interval: 1, byDay: null, count: 3, until: null } });
const REC = ev('rec', '毎週', '2026-11-02T10:00', '2026-11-02T11:00', { recurrence: { freq: 'weekly', interval: 1, byDay: null, count: null, until: null } });
const ALL = [F, P, E, L, I, AD, REND, REC];

const marker = (page) => page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('duo-calendar'); r.onsuccess = () => res(r.result); });
  return new Promise((res) => { const g = db.transaction('meta').objectStore('meta').get('notifyBackfillV1'); g.onsuccess = () => { db.close(); res(g.result?.value ?? null); }; });
});
const clearMarker = (page) => page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('duo-calendar'); r.onsuccess = () => res(r.result); });
  await new Promise((res) => { const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').delete('notifyBackfillV1'); t.oncomplete = res; });
  db.close();
});
const alarmsOf = async (page) => Object.fromEntries((await dbEvents(page)).map((e) => [e.id, e.alarms]));
const EXPECT = { fut: [{ before: 30 }], past: undefined, empty: [], link: undefined, iph: undefined, ad: [{ day: 0, at: '08:00' }], rend: undefined, rec: [{ before: 30 }] };

async function rearm(page, list = ALL) { // 起動済みの DB に予定を入れ、マーカーを消して、次の起動で移行を走らせる
  await openApp(page, SIZES.closedPortrait, '?nosw');
  await page.evaluate(async (l) => { await (await import('/js/db.js')).putMany(l); }, list);
  await clearMarker(page);
}

test.describe('一度だけの既定通知付与', () => {
  test('初回起動は空 DB でもマーカーを記録。対象だけに固定既定が付き、2回目は変わらない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    expect(await marker(page)).toMatch(/^\d{4}-\d\d-\d\dT/);
    await rearm(page);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await alarmsOf(page)).toEqual(EXPECT);
    const m = await marker(page);
    await page.evaluate(async () => { const db = await import('/js/db.js'); const [e] = (await db.listEvents()).filter((x) => x.id === 'fut'); await db.putEvent({ ...e, alarms: [{ before: 5 }] }); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect((await alarmsOf(page)).fut).toEqual([{ before: 5 }]); // 2回目は何もしない
    expect(await marker(page)).toBe(m);
  });

  test('途中で失敗したら予定もマーカーもロールバックし、次の起動で再実行', async ({ page }) => {
    await rearm(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('bfFail')) return;
      sessionStorage.setItem('bfFail', '1');
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (v, k) { if (this.name === 'meta' && v?.key === 'notifyBackfillV1') throw new Error('boom'); return put.call(this, v, k); };
    });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await marker(page)).toBeNull();
    expect((await alarmsOf(page)).fut).toBeUndefined();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await alarmsOf(page)).toEqual(EXPECT);
    expect(await marker(page)).not.toBeNull();
  });

  test('2タブが同時に起動しても一度だけ（後続は何も書かない）', async ({ page, context }) => {
    await rearm(page);
    const r = await page.evaluate(async () => { const db = await import('/js/db.js'); return Promise.all([db.backfillNotifyOnce(new Date()), db.backfillNotifyOnce(new Date())]); });
    expect(r.map((x) => x.ran).sort()).toEqual([false, true]);
    expect(r.find((x) => x.ran).count).toBe(3);
    expect(await alarmsOf(page)).toEqual(EXPECT);
  });

  test('バックアップの追加・置換では付与しない（ファイルの値のまま）。置換でもマーカーは残る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    const m = await marker(page);
    const n = ev('imp', '復元', '2026-11-25T10:00', '2026-11-25T11:00');
    const n2 = ev('imp2', '復元2', '2026-11-26T10:00', '2026-11-26T11:00', { alarms: [] });
    const pick = async (events, btn) => {
      const json = await page.evaluate(async (events) => {
        const [{ buildBackup }, db] = await Promise.all([import('/js/backup.js'), import('/js/db.js')]);
        return JSON.stringify(buildBackup(events, {}, new Date(), await db.listCategories()));
      }, events);
      await openMenu(page);
      await page.getByRole('button', { name: 'バックアップ' }).click();
      await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await page.locator(btn).click();
      if (btn === '#bk-replace') await page.locator('#bk-rdo').click();
      await expect(page.locator('#backup')).toBeHidden();
    };
    await pick([n], '#bk-add');
    expect((await alarmsOf(page)).imp).toBeUndefined();
    await pick([n, n2], '#bk-replace');
    expect(await alarmsOf(page)).toEqual({ imp: undefined, imp2: [] });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await alarmsOf(page)).toEqual({ imp: undefined, imp2: [] }); // 再起動でも付かない
    expect(await marker(page)).toBe(m);
  });
});

test.describe('移行と通知の同期（偽装ネイティブ）', () => {
  const mock = (page, notif) => page.addInitScript((notif) => {
    const M = window.__mock = { calls: [], pending: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': return { status: 'denied' };
          case 'notifyStatus': return { status: notif };
          case 'notifySync': M.pending = opts.items; return { scheduled: opts.items.length, removed: 0, skipped: 0 };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, notif);
  const count = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => c.method === m).length, m);

  test('付与後の起動で notifySync は1回だけ送り、付与した予定が含まれる。許可は要求しない', async ({ page }) => {
    await rearm(page, [F]);
    await mock(page, 'granted');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect.poll(() => page.evaluate(() => window.__mock.pending.map((i) => i.id))).toEqual(['duo.fut@2026-11-20T10:00#0']);
    await page.waitForTimeout(900);
    expect(await count(page, 'notifySync')).toBe(1);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
  });

  test('未許可でも移行は行い、許可は要求しない', async ({ page }) => {
    await rearm(page, [F]);
    await mock(page, 'notDetermined');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.waitForTimeout(900);
    expect((await alarmsOf(page)).fut).toEqual([{ before: 30 }]);
    expect(await count(page, 'notifySync')).toBe(0);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
  });
});
