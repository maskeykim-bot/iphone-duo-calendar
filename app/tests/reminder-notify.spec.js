// 第14版 PR21: createReminder の notify / updateReminder patch.notify の契約（JS 側）。Swift の実証ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page) {
  await page.addInitScript(() => {
    const M = window.__m = { calls: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'c',
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [] };
        if (m === 'listReminders') return { reminders: [] };
        if (m === 'createReminder' || m === 'updateReminder') {
          const base = { itemId: 'i1', externalId: 'e1', listId: 'L1', title: 't', notes: '', due: o.due ?? null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 5000, readOnly: false };
          return m === 'createReminder' ? { reminder: base } : { reminder: base, conflicted: false };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  });
}
const run = (page, fn) => page.evaluate(async (src) => {
  const m = await import('/js/reminders.js'); const n = await import('/js/native.js');
  return await (new Function('m', 'n', `return (async()=>{${src}})()`))(m, n);
}, fn);

test.describe('リマインダー通知の契約', () => {
  test.beforeEach(async ({ page }) => { await mock(page); await openApp(page, SIZES.open); });

  test('create は notify 省略で送らず、明示 false だけ送る', async ({ page }) => {
    const r = await run(page, `
      await m.createReminder(n.call, { requestId: 'a', listId: 'L1', title: 'x', due: { date: '2026-11-20' } });
      await m.createReminder(n.call, { requestId: 'b', listId: 'L1', title: 'x', due: { date: '2026-11-20' }, notify: false });
      return window.__m.calls.filter((x) => x[0] === 'createReminder').map((x) => x[1]);`);
    expect('notify' in r[0]).toBe(false);
    expect(r[1].notify).toBe(false);
  });

  test('update は notify 省略なら patch に含めず、操作時だけ送る。Duo notifySync は呼ばれない', async ({ page }) => {
    const r = await run(page, `
      const t = { itemId: 'i1' };
      await m.updateReminder(n.call, t, 1, { due: { date: '2026-11-21', time: '09:30' } });
      await m.updateReminder(n.call, t, 1, { notify: true });
      await m.updateReminder(n.call, t, 1, { notify: false });
      return { p: window.__m.calls.filter((x) => x[0] === 'updateReminder').map((x) => x[1].patch), sync: window.__m.calls.filter((x) => x[0] === 'notifySync').length };`);
    expect(r.p[0]).toEqual({ due: { date: '2026-11-21', time: '09:30' } });
    expect(r.p[1]).toEqual({ notify: true });
    expect(r.p[2]).toEqual({ notify: false });
    expect(r.sync).toBe(0);
  });
});
