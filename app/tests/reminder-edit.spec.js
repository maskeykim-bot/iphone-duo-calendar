// 第14版 PR19: タスクの編集と完了の操作（偽装 native）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, clearTaskDue, pickTaskDue, setTaskTime } from './helpers.js';

async function mock(page, items) {
  await page.addInitScript((its) => {
    const M = window.__m = { calls: [], cbs: {}, items: its, delay: 0, fail: null, conflict: false, now: 100 };
    const find = (o) => M.items.find((x) => x.itemId === o.itemId);
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, JSON.parse(JSON.stringify(o))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'A', color: '#336699', allowsModify: true, isDefault: true }, { id: 'L2', title: 'B', color: '#993366', allowsModify: true, isDefault: false }] };
        if (m === 'listReminders') return { reminders: M.items.map((x) => ({ ...x })) };
        if (m === 'updateReminder' || m === 'setReminderDone') {
          if (M.delay) await new Promise((r) => setTimeout(r, M.delay));
          if (M.fail) { const c = M.fail; M.fail = null; throw { code: c }; }
          const r = find(o); if (!r) throw { code: 'NOT_FOUND' };
          if (m === 'setReminderDone') { r.done = o.done; r.doneAt = o.done ? '2026-11-16T10:00' : null; r.modifiedAt = ++M.now; return { reminder: { ...r } }; }
          Object.assign(r, o.patch); r.modifiedAt = ++M.now;
          return { reminder: { ...r }, conflicted: M.conflict };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, items);
}
const mk = (id, o = {}) => ({ itemId: id, externalId: 'e' + id, listId: 'L1', title: 'T' + id, notes: '', due: { date: '2026-11-12' }, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 50, readOnly: false, ...o });
const calls = (page, n) => page.evaluate((n) => window.__m.calls.filter((c) => c[0] === n).map((c) => c[1]), n);
const lp = (page) => page.locator('.page.lp');
async function ready(page, sz = SIZES.openLandscape) {
  await openApp(page, sz);
  await page.locator('.pgl [data-pick="task"]').first().click();
  await expect(page.locator('.page.lp input.remin')).toBeVisible();
}

test.describe('タスクの編集と完了', () => {
  test('完了は即 native、1.5秒は同じ段で完了表示、その後完了段へ', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    const row = lp(page).locator('[data-key="rm:a"]');
    await row.locator('[data-act="remck"]').click();
    await expect(row).toHaveClass(/done/);
    expect(await calls(page, 'setReminderDone')).toEqual([{ itemId: 'a', externalId: 'ea', done: true }]);
    await expect(lp(page).locator('[data-sec="selected"] [data-key="rm:a"]')).toHaveCount(1); // まだ同じ段
    await page.waitForTimeout(800);
    await expect(lp(page).locator('[data-sec="selected"] [data-key="rm:a"]')).toHaveCount(1);
    await expect(lp(page).locator('[data-sec="selected"]')).toHaveCount(0, { timeout: 2500 }); // 移った
    await expect(lp(page).locator('[data-act="remdone"]')).toContainText('完了（1）');
  });

  test('素早い完了戻しは順に2回送り、移動しない', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    const ck = lp(page).locator('[data-key="rm:a"] [data-act="remck"]');
    await ck.click(); await ck.click();
    await expect(lp(page).locator('[data-key="rm:a"]')).not.toHaveClass(/done/);
    await page.waitForTimeout(2000);
    expect((await calls(page, 'setReminderDone')).map((c) => c.done)).toEqual([true, false]);
    await expect(lp(page).locator('[data-sec="selected"] [data-key="rm:a"]')).toHaveCount(1);
  });

  test('遅い応答でも再tapは直列、失敗は表示を戻してお知らせ', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    await page.evaluate(() => { window.__m.delay = 300; });
    const ck = lp(page).locator('[data-key="rm:a"] [data-act="remck"]');
    await ck.click(); await ck.click();
    await page.waitForTimeout(100);
    expect((await calls(page, 'setReminderDone')).length).toBe(1); // 2回目は1回目の応答後（直列）
    await expect.poll(async () => (await calls(page, 'setReminderDone')).map((c) => c.done)).toEqual([true, false]);
    await page.waitForTimeout(1800);
    await page.evaluate(() => { window.__m.delay = 0; window.__m.fail = 'UNAVAILABLE'; });
    await ck.click();
    await expect(page.locator('#native-toast')).toBeVisible();
    await expect(lp(page).locator('[data-key="rm:a"]')).not.toHaveClass(/done/);
  });

  test('読み取り専用の丸は押せない。繰り返しは完了できる', async ({ page }) => {
    await mock(page, [mk('r', { readOnly: true }), mk('c', { recurring: true })]); await ready(page);
    await expect(lp(page).locator('[data-key="rm:r"] [data-act="remck"]')).toBeDisabled();
    await lp(page).locator('[data-key="rm:c"] [data-act="remck"]').click();
    await expect.poll(async () => (await calls(page, 'setReminderDone')).length).toBe(1);
  });

  test('編集は変えた欄だけ送る（題名のみ。期限・リストは送らない）と期待modifiedAt', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await expect(page.locator('#taskdlg')).toBeVisible();
    await expect(page.locator('#tk-title')).toBeFocused();
    await expect(page.locator('#tk-note')).toContainText('iPhone のリマインダーに保存されます。');
    expect(await page.evaluate(() => document.querySelector('.page').closest('[inert]') !== null)).toBe(true);
    await page.locator('#tk-title').fill('新題名');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect(await calls(page, 'updateReminder')).toEqual([{ itemId: 'a', externalId: 'ea', expectModifiedAt: 50, patch: { title: '新題名' } }]);
    await expect(lp(page).locator('[data-key="rm:a"] .rmt')).toHaveText('新題名');
  });

  test('期限をなしにする(null)・変更なしは送らない', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await calls(page, 'updateReminder')).length).toBe(0);
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await clearTaskDue(page);
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ due: null });
  });

  test('衝突はお知らせ、削除済みは作り直さず案内', async ({ page }) => {
    await mock(page, [mk('a'), mk('b')]); await ready(page);
    await page.evaluate(() => { window.__m.conflict = true; });
    await lp(page).locator('[data-key="rm:a"] [data-act="remedit"]').click();
    await page.locator('#tk-notes').fill('メモ');
    await page.locator('#tk-save').click();
    await expect(page.locator('#native-toast')).toContainText('Duo の内容で上書きしました');
    await lp(page).locator('[data-key="rm:b"] [data-act="remedit"]').click();
    await page.evaluate(() => { window.__m.items = window.__m.items.filter((x) => x.itemId !== 'b'); });
    await page.locator('#tk-title').fill('x');
    await page.locator('#tk-save').click();
    await expect(page.locator('#tk-err')).toContainText('削除されています');
    await expect(page.locator('#tk-save')).toBeHidden();
    expect((await calls(page, 'createReminder')).length).toBe(0);
  });

  test('繰り返し・読み取り専用は編集欄が無効で保存なし', async ({ page }) => {
    await mock(page, [mk('c', { recurring: true, priority: 1 })]); await ready(page);
    await lp(page).locator('[data-key="rm:c"] [data-act="remedit"]').click();
    await expect(page.locator('#tk-title')).toBeDisabled();
    await expect(page.locator('#tk-save')).toBeHidden();
    await expect(page.locator('#taskdlg')).toContainText('繰り返し');
    await page.keyboard.press('Escape');
    await expect(page.locator('#taskdlg')).toBeHidden();
  });

  test('未保存の変更は破棄の確認、閉じると行へフォーカスが戻る', async ({ page }) => {
    await mock(page, [mk('a')]); await ready(page);
    const edit = lp(page).locator('[data-key="rm:a"] [data-act="remedit"]');
    await edit.click();
    await page.locator('#tk-title').fill('変更');
    await page.keyboard.press('Escape');
    await expect(page.locator('#discard')).toBeVisible();
    await page.locator('#dc-keep').click();
    await expect(page.locator('#tk-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('#dc-drop').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
    await expect(edit).toBeFocused();
    expect((await calls(page, 'updateReminder')).length).toBe(0);
  });

  for (const k of ['openPortrait', 'openLandscape951']) test(`${k} でも編集・完了できる`, async ({ page }) => {
    await mock(page, [mk('a')]);
    await openApp(page, SIZES[k]);
    if (k === 'openPortrait') { await page.locator('[data-act="pnltoggle"]').first().click().catch(() => {}); await page.locator('[data-pnl="task"]').first().click().catch(() => {}); }
    else { await page.locator('.pgl [data-pick="task"]').first().click(); }
    const row = page.locator('[data-key="rm:a"]').first();
    await expect(row).toBeVisible();
    await row.locator('[data-act="remck"]').click();
    await expect.poll(async () => (await calls(page, 'setReminderDone')).length).toBe(1);
    await row.locator('[data-act="remedit"]').click().catch(() => {});
  });
});

// 第15版 PR19: タスクの期限は予定と同じ日付・時刻の部品。未操作は何も送らない。
test.describe('タスクの期限の共通部品', () => {
  const editT = async (page, id) => { await lp(page).locator(`[data-key="rm:${id}"] [data-act="remedit"]`).click(); await expect(page.locator('#taskdlg')).toBeVisible(); };
  const save = async (page) => { await page.locator('#tk-save').click(); await expect(page.locator('#taskdlg')).toBeHidden(); };

  test('日付のみ・10:07・期限なし・特殊通知付きは、開いて保存しても update を送らない', async ({ page }) => {
    await mock(page, [mk('a'), mk('b', { due: { date: '2026-11-12', time: '10:07' } }), mk('c', { due: null }), mk('d', { alarms: [{ at: '2026-11-12T08:00' }], alarmsExtra: 2 })]);
    await ready(page);
    for (const id of ['a', 'b', 'c', 'd']) {
      await editT(page, id);
      await expect(page.locator('#tk-date')).toBeVisible();
      await save(page);
    }
    expect((await calls(page, 'updateReminder')).length).toBe(0);
  });

  test('10:07 は表示のまま、時だけ押しても 07 分を保ち、分は押さなければ変えない', async ({ page }) => {
    await mock(page, [mk('b', { due: { date: '2026-11-12', time: '10:07' } })]); await ready(page);
    await editT(page, 'b');
    await expect(page.locator('#tk-time')).toHaveText('10:07');
    await expect(page.locator('#tk-timeon')).toBeChecked();
    await setTaskTime(page, 11);
    await expect(page.locator('#tk-time')).toHaveText('11:07');
    await save(page);
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ due: { date: '2026-11-12', time: '11:07' } });
  });

  test('期限だけ変えても通知はオンにならない（notify を送らない）。時刻を外すと日付のみ', async ({ page }) => {
    await mock(page, [mk('a'), mk('b', { due: { date: '2026-11-12', time: '10:07' } })]); await ready(page);
    await editT(page, 'a');
    await pickTaskDue(page, '2026-11-20');
    await expect(page.locator('#tk-notify')).not.toBeChecked();
    await save(page);
    await editT(page, 'b');
    await page.locator('#tk-timeon').uncheck();
    await expect(page.locator('#tk-time')).toBeHidden();
    await save(page);
    const u = await calls(page, 'updateReminder');
    expect(u[0].patch).toEqual({ due: { date: '2026-11-20' } });
    expect(u[1].patch).toEqual({ due: { date: '2026-11-12' } });
  });

  test('期限なしでは「時刻を入れる」は使えない。日付を選ぶと使える。長押しの数字入力でも日付を入れられる', async ({ page }) => {
    await mock(page, [mk('c', { due: null })]); await ready(page);
    await editT(page, 'c');
    await expect(page.locator('#tk-date')).toHaveText('期限なし');
    await expect(page.locator('#tk-timeon')).toBeDisabled();
    await pickTaskDue(page, '2026-11-25');
    await expect(page.locator('#tk-timeon')).toBeEnabled();
    await setTaskTime(page, 8, 45);
    await save(page);
    expect((await calls(page, 'updateReminder'))[0].patch).toEqual({ due: { date: '2026-11-25', time: '08:45' } });
  });
});
