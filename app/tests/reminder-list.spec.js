// 第14版 PR14: listReminders の契約（JS 側）。Swift の実証ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

const R = (o) => ({ itemId: 'i', externalId: 'e', listId: 'L1', title: 't', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: null, modifiedAt: null, readOnly: false, ...o });
const SAMPLE = [
  R({ itemId: 'a' }),
  R({ itemId: 'b', due: { date: '2026-11-16' } }),
  R({ itemId: 'c', due: { date: '2026-11-16', time: '09:30' }, alarms: [{ at: '2026-11-16T09:30' }], alarmsExtra: 1, priority: 9, createdAt: 1, modifiedAt: 2 }),
  R({ itemId: 'd', done: true, doneAt: '2026-10-20T08:00', recurring: true, readOnly: true }),
];

async function mock(page) {
  await page.addInitScript((sample) => {
    const M = window.__m = { calls: [], mode: 'ok', pend: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'c',
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [] };
        if (m === 'listReminders') {
          if (M.mode === 'hold') return new Promise((res, rej) => M.pend.push({ res, rej, o }));
          if (!o.listIds.length) return { reminders: [] };
          return { reminders: sample };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, SAMPLE);
}

test.describe('listReminders の契約', () => {
  test('型つき応答を返し、空 listIds は空、引数をそのまま渡す', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    const r = await page.evaluate(async () => {
      const m = await import('/js/reminders.js'); const n = await import('/js/native.js');
      const a = await m.listReminders(n.call, ['L1'], '2026-10-16T00:00');
      const b = await m.listReminders(n.call, [], '2026-10-16T00:00');
      return { a, b, args: window.__m.calls.filter((c) => c[0] === 'listReminders').map((c) => c[1]).slice(-2) }; // 起動時にアプリ自身も取得する（PR15）ため、直接 call した最後の2件だけを見る
    });
    expect(r.a).toEqual(SAMPLE);
    expect(r.a[0].due).toBeNull();
    expect(r.a[1].due).toEqual({ date: '2026-11-16' });
    expect(r.a[2].due.time).toBe('09:30');
    expect(r.a[3]).toMatchObject({ done: true, doneAt: '2026-10-20T08:00', recurring: true, readOnly: true });
    expect(r.a[0].createdAt).toBeNull();
    expect(r.b).toEqual([]);
    expect(r.args[0]).toEqual({ listIds: ['L1'], completedSince: '2026-10-16T00:00' });
  });
  test('遅い旧応答と取消: CANCELLED は拒否され文言が出る。新しい応答は別に解決', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    const r = await page.evaluate(async () => {
      window.__m.mode = 'hold';
      const m = await import('/js/reminders.js'); const n = await import('/js/native.js');
      const p1 = m.listReminders(n.call, ['L1'], '2026-10-16T00:00').then(() => 'ok', (e) => ({ code: e.code, text: n.reminderErrText(e, 'x') }));
      const p2 = m.listReminders(n.call, ['L1'], '2026-10-16T00:00').then((v) => v.length, () => 'err');
      const [a, b] = window.__m.pend;
      a.rej({ code: 'CANCELLED' });
      b.res({ reminders: [{ itemId: 'z' }] });
      return { r1: await p1, r2: await p2 };
    });
    expect(r.r1).toEqual({ code: 'CANCELLED', text: 'リマインダーの取得を取り消しました。' });
    expect(r.r2).toBe(1);
  });
  test('既存 listEvents / タスク本文は IndexedDB に入らない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    await page.evaluate(async () => {
      const m = await import('/js/reminders.js'); const n = await import('/js/native.js');
      await m.listReminders(n.call, ['L1'], '2026-10-16T00:00');
    });
    const dump = await page.evaluate(async () => {
      const out = [];
      for (const d of await indexedDB.databases()) {
        const db = await new Promise((res) => { const q = indexedDB.open(d.name); q.onsuccess = () => res(q.result); });
        for (const s of db.objectStoreNames) out.push(JSON.stringify(await new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); })));
      }
      return out.join('');
    });
    expect(dump).not.toContain('"itemId"');
  });
});
