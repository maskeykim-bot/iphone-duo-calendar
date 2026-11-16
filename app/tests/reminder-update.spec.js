// 第14版 PR18: updateReminder / setReminderDone の契約（JS 側）。Swift の実証ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page) {
  await page.addInitScript(() => {
    const base = { itemId: 'i1', externalId: 'e1', listId: 'L1', title: '牛乳', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 5000, readOnly: false };
    const M = window.__m = { calls: [], rem: { ...base }, mode: null };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'c',
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [] };
        if (m === 'listReminders') return { reminders: [] };
        if (m === 'updateReminder' || m === 'setReminderDone') {
          if (M.mode) throw { code: M.mode };
          const r = M.rem;
          if (m === 'setReminderDone') { r.done = o.done; r.doneAt = o.done ? '2026-11-16T10:00' : null; return { reminder: { ...r } }; }
          if (r.recurring) throw { code: 'NOT_EDITABLE' };
          const conflicted = o.expectModifiedAt != null && r.modifiedAt >= o.expectModifiedAt + 1000;
          Object.assign(r, o.patch);
          return { reminder: { ...r }, conflicted };
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

test.describe('updateReminder / setReminderDone の契約', () => {
  test.beforeEach(async ({ page }) => { await mock(page); await openApp(page, SIZES.open); });

  test('patch は渡した欄だけ。省略と null を区別し、衝突は conflicted', async ({ page }) => {
    const r = await run(page, `
      const t = { itemId: 'i1', externalId: 'e1' };
      const a = await m.updateReminder(n.call, t, 5000, { title: '牛乳2' });
      const b = await m.updateReminder(n.call, t, 5000, { due: null });
      const c = await m.updateReminder(n.call, t, 1000, { notes: 'x' });
      const d = await m.updateReminder(n.call, { itemId: 'i1' }, null, {});
      return { a, b, c, d, args: window.__m.calls.filter((x) => x[0] === 'updateReminder').map((x) => x[1]) };`);
    expect(r.args[0]).toEqual({ itemId: 'i1', externalId: 'e1', expectModifiedAt: 5000, patch: { title: '牛乳2' } });
    expect(Object.keys(r.args[0].patch)).toEqual(['title']);
    expect(r.args[1].patch).toEqual({ due: null });
    expect('externalId' in r.args[3]).toBe(false);
    expect(r.args[3]).toEqual({ itemId: 'i1', expectModifiedAt: null, patch: {} });
    expect(r.a.conflicted).toBe(false);
    expect(r.c.conflicted).toBe(true);
    expect(r.c.reminder.notes).toBe('x');
    expect(r.b.reminder.title).toBe('牛乳2');
  });

  test('完了と戻しは同じ API。衝突確認なし', async ({ page }) => {
    const r = await run(page, `
      const a = await m.setReminderDone(n.call, { itemId: 'i1' }, true);
      const b = await m.setReminderDone(n.call, { itemId: 'i1' }, false);
      return { a, b, args: window.__m.calls.filter((x) => x[0] === 'setReminderDone').map((x) => x[1]) };`);
    expect(r.a.done).toBe(true);
    expect(r.b.done).toBe(false);
    expect(r.args).toEqual([{ itemId: 'i1', done: true }, { itemId: 'i1', done: false }]);
  });

  test('繰返しは編集拒否・完了は可。エラーコードと文言', async ({ page }) => {
    const r = await run(page, `
      window.__m.rem.recurring = true;
      let code = null; try { await m.updateReminder(n.call, { itemId: 'i1' }, null, { title: 'z' }); } catch (e) { code = e.code; }
      const d = await m.setReminderDone(n.call, { itemId: 'i1' }, true);
      const texts = ['NOT_FOUND', 'NOT_EDITABLE', 'READ_ONLY', 'UNAVAILABLE'].map((c) => n.reminderErrText({ code: c }, 'fb'));
      return { code, done: d.done, texts };`);
    expect(r.code).toBe('NOT_EDITABLE');
    expect(r.done).toBe(true);
    expect(r.texts[0]).toContain('削除');
    expect(r.texts[3]).toBe('fb');
  });

  test('NOT_FOUND は投げ直す（再作成しない）', async ({ page }) => {
    const r = await run(page, `
      window.__m.mode = 'NOT_FOUND';
      let code = null; try { await m.setReminderDone(n.call, { itemId: 'i1' }, true); } catch (e) { code = e.code; }
      return { code, creates: window.__m.calls.filter((x) => x[0] === 'createReminder').length };`);
    expect(r.code).toBe('NOT_FOUND');
    expect(r.creates).toBe(0);
  });
});
