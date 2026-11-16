// 第14版 PR22: タスクの追加・編集の通知の選択（偽装 native）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page, items) {
  await page.addInitScript((its) => {
    const M = window.__m = { calls: [], cbs: {}, items: its, now: 100, fail: null, seq: 0 };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, JSON.parse(JSON.stringify(o))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'A', color: '#336699', allowsModify: true, isDefault: true }] };
        if (m === 'listReminders') return { reminders: M.items.map((x) => ({ ...x })) };
        if (m === 'createReminder') {
          const r = { itemId: 'n' + (++M.seq), externalId: 'en', listId: o.listId, title: o.title, notes: '', due: o.due, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 9, modifiedAt: 9, readOnly: false };
          M.items.push(r); return { reminder: { ...r } };
        }
        if (m === 'updateReminder') {
          if (M.fail) { const c = M.fail; M.fail = null; throw { code: c }; }
          const r = M.items.find((x) => x.itemId === o.itemId);
          const { notify, ...rest } = o.patch; Object.assign(r, rest); r.modifiedAt = ++M.now;
          return { reminder: { ...r }, conflicted: false };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, items);
}
const mk = (id, o = {}) => ({ itemId: id, externalId: 'e' + id, listId: 'L1', title: 'T' + id, notes: '', due: { date: '2026-11-12' }, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 50, readOnly: false, ...o });
const calls = (page, n) => page.evaluate((n) => window.__m.calls.filter((c) => c[0] === n).map((c) => c[1]), n);
const lp = (page) => page.locator('.page.lp');
async function ready(page) {
  await openApp(page, SIZES.openLandscape);
  await page.locator('.pgl [data-pick="task"]').first().click();
  await expect(lp(page).locator('.rmaddbtn')).toBeVisible();
}
async function edit(page, id) { await lp(page).locator(`[data-key="rm:${id}"] [data-act="remedit"]`).click(); await expect(page.locator('#taskdlg')).toBeVisible(); }

test.describe('タスクの通知の選択', () => {
  test('開いて保存しても notify は送らない（既存の通知なしに既定を足さない）', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page); await edit(page, 'a');
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    await page.locator('#tk-title').fill('改');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ title: '改' });
  });

  test('時刻変更だけでは notify を送らず、操作したときだけ送る。日付のみは 8:00 の説明', async ({ page }) => {
    await mock(page, [mk('a', { alarms: [{ at: '2026-11-12T08:00' }] })]); await ready(page); await edit(page, 'a');
    await expect(page.locator('#tk-notify')).toBeChecked();
    await expect(page.locator('#tk-notewhy')).toContainText('8:00');
    await page.locator('#tk-time').fill('09:30');
    await expect(page.locator('#tk-notewhy')).toContainText('時刻');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ due: { date: '2026-11-12', time: '09:30' } });
  });

  test('通知を外すと notify:false だけ送る。未知の通知は警告表示', async ({ page }) => {
    await mock(page, [mk('a', { alarms: [{ at: '2026-11-12T08:00' }], alarmsExtra: 1 })]); await ready(page); await edit(page, 'a');
    await expect(page.locator('.tkextra')).toBeVisible();
    await page.locator('#tk-notify').uncheck();
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ notify: false });
  });

  test('期限なしでは通知不可。戻すと操作した状態を反映し、期限なしのまま notify は送らない', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page); await edit(page, 'a');
    await page.locator('#tk-notify').check();
    await page.locator('#tk-date').fill('');
    await expect(page.locator('#tk-notify')).toBeDisabled();
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    await page.locator('#tk-date').fill('2026-11-13');
    await expect(page.locator('#tk-notify')).toBeEnabled();
    await expect(page.locator('#tk-notify')).toBeChecked();
    await page.locator('#tk-date').fill('');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ due: null });
  });

  test('書込拒否では保存シートに残りお知らせを出す（通知の選択も保持）', async ({ page }) => {
    await mock(page, [mk('a', { alarms: [{ at: '2026-11-12T08:00' }] })]); await ready(page); await edit(page, 'a');
    await page.locator('#tk-notify').uncheck();
    await page.evaluate(() => { window.__m.fail = 'READ_ONLY'; });
    await page.locator('#tk-save').click();
    await expect(page.locator('#tk-err')).not.toHaveText('');
    await expect(page.locator('#taskdlg')).toBeVisible();
    await expect(page.locator('#tk-notify')).not.toBeChecked();
  });

  test('追加: 既定は通知なし（notify 省略）、オンにしたときだけ true、期限なしでは送らない', async ({ page }) => {
    await mock(page, []); await ready(page);
    await lp(page).locator('[data-act="remadd"]').click();
    const i = lp(page).locator('input.remin');
    await expect(lp(page).locator('[data-act="remnote"]')).toHaveAttribute('aria-checked', 'false');
    await i.fill('一'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:n1"]')).toBeVisible();
    await lp(page).locator('[data-act="remnote"]').click();
    await expect(lp(page).locator('[data-act="remnote"]')).toHaveAttribute('aria-checked', 'true');
    await lp(page).locator('input.remin').fill('二'); await lp(page).locator('input.remin').press('Enter');
    await expect(lp(page).locator('[data-key="rm:n2"]')).toBeVisible();
    await lp(page).locator('[data-act="remdue0"]').click();
    await expect(lp(page).locator('[data-act="remnote"]')).toHaveCount(0);
    await lp(page).locator('input.remin').fill('三'); await lp(page).locator('input.remin').press('Enter');
    await expect(lp(page).locator('[data-key="rm:n3"]')).toBeVisible();
    const c = await calls(page, 'createReminder');
    expect('notify' in c[0]).toBe(false);
    expect(c[1].notify).toBe(true);
    expect('notify' in c[2]).toBe(false);
  });
});
