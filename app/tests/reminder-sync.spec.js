// 第19版 D7: リマインダーとの同期（EventKit の偽物を window.Capacitor に差す）。入口の設定画面は D8・PR10。ここでは localStorage の設定で同期をオンにする。
import { test, expect } from '@playwright/test';
import { openTasks, dbTasks, T } from './task-helpers.js';
import { SIZES } from './helpers.js';

const SYNC = ['listReminders', 'createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder', 'checkReminderList', 'createReminderList'];

// EventKit の偽物。rems は window.__K.rems。cbs.calendarChanged を呼ぶとリマインダー側の変更を知らせる。
async function kit(page, { sync = true, rems = [] } = {}) {
  await page.addInitScript(({ sync, rems }) => {
    if (sync) localStorage.setItem('duo-rem-sync', JSON.stringify({ enabled: true, duoListId: 'L1', duoSourceId: 'S1' }));
    const K = window.__K = { calls: [], cbs: {}, rems, clock: Date.parse('2026-11-12T00:00:00Z'), seq: 0, created: {} };
    const tick = () => (K.clock += 5000);
    const view = (r) => ({ ...r, alarms: r.notify ? [{ at: 'x' }] : [], alarmsExtra: 0, priority: 0 });
    const find = (o) => K.rems.find((r) => r.itemId === o.itemId);
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { K.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        K.calls.push([m, JSON.parse(JSON.stringify(o ?? {}))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'notifyStatus') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'Duo', color: '#336699', sourceId: 'S1', allowsModify: true, isDefault: true }] };
        if (m === 'listReminders') return { reminders: K.rems.filter((r) => o.listIds.includes(r.listId)).map(view) };
        if (m === 'createReminder') {
          if (K.created[o.requestId]) return { reminder: view(K.created[o.requestId]) };
          const r = { itemId: `I${++K.seq}`, externalId: `X${K.seq}`, listId: o.listId, title: o.title, notes: o.notes || '', due: o.due, done: false, doneAt: null, notify: !!o.notify, recurring: false, readOnly: false, createdAt: tick(), modifiedAt: tick() };
          K.rems.push(r); K.created[o.requestId] = r; return { reminder: view(r) };
        }
        if (m === 'updateReminder') { const r = find(o); if (!r) throw { code: 'NOT_FOUND' }; const p = o.patch; if ('title' in p) r.title = p.title; if ('notes' in p) r.notes = p.notes; if ('due' in p) r.due = p.due; r.modifiedAt = tick(); return { reminder: view(r) }; }
        if (m === 'setReminderDone') { const r = find(o); if (!r) throw { code: 'NOT_FOUND' }; r.done = o.done; r.doneAt = o.done ? '2026-11-12T10:00' : null; r.modifiedAt = tick(); return { reminder: view(r) }; }
        if (m === 'deleteReminder') { K.rems = K.rems.filter((r) => r.itemId !== o.itemId); return { deleted: true }; }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, { sync, rems });
}
const calls = (page, names = SYNC) => page.evaluate((n) => window.__K.calls.filter((c) => n.includes(c[0])).map((c) => c[0]), names);
const settle = (page) => page.waitForTimeout(900);

test('同期オフ（既定）: 起動・追加・完了・削除・前面復帰・calendarChanged でも同期の呼び出しは 0', async ({ page }) => {
  await kit(page, { sync: false });
  await openTasks(page, SIZES.openLandscape, { seed: [T('a')] });
  const lp = page.locator('.page.lp');
  await lp.locator('input.remin').fill('追加した');
  await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('追加した');
  await page.evaluate(() => { window.__K.cbs.calendarChanged?.(); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page);
  expect(await calls(page)).toEqual([]);
  expect((await dbTasks(page)).every((t) => !t.syncState && !t.remItemId)).toBe(true);
});

test('同期オン: 追加すると createReminder が 1 回。Duo のタスクにつながりが付く。完了も 1 回で伝わる', async ({ page }) => {
  await kit(page);
  await openTasks(page, SIZES.openLandscape, { seed: [] });
  const lp = page.locator('.page.lp');
  await lp.locator('input.remin').fill('同期する');
  await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('同期する');
  await settle(page);
  expect((await calls(page)).filter((m) => m === 'createReminder')).toHaveLength(1);
  const t = (await dbTasks(page))[0];
  expect(t).toMatchObject({ title: '同期する', syncState: 'linked', remListId: 'L1' });
  expect(t.remItemId && t.remExternalId && t.remModifiedAt).toBeTruthy();
  const before = await page.evaluate(() => window.__K.calls.length);
  await page.evaluate(() => window.__K.cbs.calendarChanged?.()); // 自分の書き込みの知らせ: 差分なし
  await settle(page);
  expect((await page.evaluate((n) => window.__K.calls.slice(n).map((c) => c[0]), before)).filter((m) => ['createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder'].includes(m))).toEqual([]);
});

test('リマインダー側の変更は calendarChanged と前面復帰で Duo に入る', async ({ page }) => {
  await kit(page, { rems: [{ itemId: 'R1', externalId: 'XR1', listId: 'L1', title: 'もとの題名', notes: '', due: { date: '2026-11-12' }, done: false, recurring: false, readOnly: false, createdAt: 1, modifiedAt: 10 }] });
  await openTasks(page, SIZES.openLandscape, { seed: [] });
  const lp = page.locator('.page.lp');
  await expect(lp).toContainText('もとの題名'); // 起動時に取り込む
  await page.evaluate(() => { window.__K.rems[0].title = 'リマインダーで変えた'; window.__K.rems[0].modifiedAt = 99999999999; window.__K.cbs.calendarChanged(); });
  await expect(lp).toContainText('リマインダーで変えた', { timeout: 5000 });
  await page.evaluate(() => { window.__K.rems[0].title = '裏で変えた'; window.__K.rems[0].modifiedAt = 199999999999; Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(lp).toContainText('裏で変えた', { timeout: 5000 });
  expect((await calls(page)).filter((m) => m === 'createReminder')).toHaveLength(0);
});

test('決定 4: リマインダーで消すと Duo のタスクは残り「連携なし」。元に戻すは出ず、書き出し直さない', async ({ page }) => {
  await kit(page, { rems: [{ itemId: 'R1', externalId: 'XR1', listId: 'L1', title: '消される', notes: 'メモ', due: { date: '2026-11-12' }, done: false, recurring: false, readOnly: false, createdAt: 1, modifiedAt: 10 }] });
  await openTasks(page, SIZES.openLandscape, { seed: [] });
  const lp = page.locator('.page.lp');
  await expect(lp).toContainText('消される');
  await page.evaluate(() => { window.__K.rems = []; window.__K.cbs.calendarChanged(); });
  await settle(page); await settle(page);
  await expect(lp).toContainText('消される');
  await expect(page.locator('#native-toast')).toHaveCount(0);
  const ts = await dbTasks(page);
  expect(ts).toHaveLength(1);
  expect(ts[0]).toMatchObject({ title: '消される', note: 'メモ', syncState: 'local' });
  for (const k of ['remItemId', 'remExternalId', 'remListId', 'remModifiedAt']) expect(k in ts[0], k).toBe(false);
  await page.evaluate(() => { window.__K.cbs.calendarChanged(); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page);
  expect(await calls(page, ['createReminder', 'updateReminder', 'deleteReminder'])).toEqual([]);
});

test('Duo から消す: 墓標が残り、deleteReminder が 1 回。一覧には出ない', async ({ page }) => {
  await kit(page);
  await openTasks(page, SIZES.openLandscape, { seed: [] });
  const lp = page.locator('.page.lp');
  await lp.locator('input.remin').fill('消す');
  await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('消す');
  await settle(page);
  await lp.locator('.rmrow', { hasText: '消す' }).locator('[data-act="remedit"]').click();
  await page.locator('#tk-del').click();
  await expect(lp).not.toContainText('消す');
  expect((await calls(page)).filter((m) => m === 'deleteReminder')).toHaveLength(0); // 4 秒の取り消しの間は呼ばない
  await expect.poll(async () => (await calls(page)).filter((m) => m === 'deleteReminder').length, { timeout: 8000 }).toBe(1);
  expect((await calls(page)).filter((m) => m === 'deleteReminder')).toHaveLength(1);
  const ts = await dbTasks(page);
  expect(ts).toHaveLength(1);
  expect(ts[0].syncState).toBe('tombstone');
  await expect(lp).not.toContainText('消す');
});
