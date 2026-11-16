// 第14版 PR16: createReminder の契約（JS 側）。Swift の実証ではない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page) {
  await page.addInitScript(() => {
    const M = window.__m = { calls: [], mode: 'ok', created: {}, delay: 0, lose: false, seq: 0 };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'c',
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [] };
        if (m === 'listReminders') return { reminders: [] };
        if (m === 'createReminder') {
          if (M.mode === 'READ_ONLY' || M.mode === 'LIST_NOT_FOUND' || M.mode === 'UNAVAILABLE') throw { code: M.mode };
          const fp = JSON.stringify([o.listId, o.title, o.notes, o.due]);
          const done = M.created[o.requestId];
          if (done && done.fp !== fp) throw { code: 'INVALID_ARGUMENT' };
          let rec = done;
          if (!rec) {
            rec = M.created[o.requestId] = { fp, r: { itemId: 'x' + (++M.seq), externalId: 'e', listId: o.listId || 'L0', title: o.title, notes: o.notes, due: o.due, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 1, readOnly: false } };
          }
          if (M.delay) await new Promise((r) => setTimeout(r, M.delay));
          if (M.lose) { M.lose = false; throw { code: 'UNAVAILABLE' }; } // 保存はしたが応答が失われた
          return { reminder: rec.r };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  });
}
const run = (page, fn, arg) => page.evaluate(async ([src, a]) => {
  const m = await import('/js/reminders.js'); const n = await import('/js/native.js');
  return await (new Function('m', 'n', 'a', `return (async()=>{${src}})()`))(m, n, a);
}, [fn, arg]);

test.describe('createReminder の契約', () => {
  test('引数を型どおり渡し、同 requestId の再試行は同じ項目、異内容は INVALID_ARGUMENT', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    const r = await run(page, `
      const a = await m.createReminder(n.call, { requestId: 'r1', listId: 'L1', title: '牛乳', notes: '', due: { date: '2026-11-17', time: '09:00' } });
      const b = await m.createReminder(n.call, { requestId: 'r1', listId: 'L1', title: '牛乳', notes: '', due: { date: '2026-11-17', time: '09:00' } });
      const c = await m.createReminder(n.call, { requestId: 'r2', listId: 'L1', title: '牛乳', due: null });
      let code = null;
      try { await m.createReminder(n.call, { requestId: 'r1', listId: 'L1', title: '別', notes: '', due: null }); } catch (e) { code = e.code; }
      return { a, b, c, code, args: window.__m.calls.filter((x) => x[0] === 'createReminder').map((x) => x[1]) };
    `);
    expect(r.a.itemId).toBe(r.b.itemId);
    expect(r.c.itemId).not.toBe(r.a.itemId);
    expect(r.code).toBe('INVALID_ARGUMENT');
    expect(r.args[0]).toEqual({ requestId: 'r1', listId: 'L1', title: '牛乳', notes: '', due: { date: '2026-11-17', time: '09:00' } });
    expect(Object.keys(r.args[2]).sort()).toEqual(['due', 'listId', 'notes', 'requestId', 'title']);
  });
  test('応答喪失のあと同 requestId で再試行しても二重にならない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    const r = await run(page, `
      window.__m.lose = true; window.__m.delay = 30;
      const o = { requestId: 'r9', listId: 'L1', title: 't', notes: '', due: null };
      let first = null; try { await m.createReminder(n.call, o); } catch (e) { first = e.code; }
      const again = await m.createReminder(n.call, o);
      return { first, again, n: Object.keys(window.__m.created).length };
    `);
    expect(r.first).toBe('UNAVAILABLE');
    expect(r.n).toBe(1);
    expect(r.again.itemId).toBe('x1');
  });
  test('READ_ONLY / LIST_NOT_FOUND / UNAVAILABLE は投げられ、文言が出る', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    for (const [mode, text] of [['READ_ONLY', 'このリストには追加できません。'], ['LIST_NOT_FOUND', '追加先のリストが見つかりません。'], ['UNAVAILABLE', 'x']]) {
      const r = await run(page, `
        window.__m.mode = a;
        try { await m.createReminder(n.call, { requestId: 'q' + a, listId: 'L1', title: 't' }); return 'ok'; }
        catch (e) { return [e.code, n.reminderErrText(e, 'x')]; }
      `, mode);
      expect(r).toEqual([mode, text]);
    }
  });
  test('作成してもタスク本文は IndexedDB に入らず、UI に追加入口はまだ無い', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape);
    await run(page, `await m.createReminder(n.call, { requestId: 'z', listId: 'L1', title: 'ひみつの題名', notes: 'ひみつのメモ', due: null });`);
    const dump = await page.evaluate(async () => {
      const out = [];
      for (const d of await indexedDB.databases()) {
        const db = await new Promise((res) => { const q = indexedDB.open(d.name); q.onsuccess = () => res(q.result); });
        for (const s of db.objectStoreNames) out.push(JSON.stringify(await new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); })));
        db.close();
      }
      return out.join('|') + JSON.stringify(Object.entries(localStorage));
    });
    expect(dump).not.toContain('ひみつ');
    expect(await page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'createReminder').length)).toBe(1); // 自分で呼んだ1件だけ（アプリは呼ばない）
  });
});
