// 第14版 PR15: タスクの分類と完了履歴の表示。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page, perm = 'granted') {
  await page.addInitScript((p) => {
    const pad = (n) => String(n).padStart(2, '0');
    const day = (off) => { const d = new Date(2026, 10, 12 + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const stamp = (off) => `${day(off)}T08:00`;
    const R = (o) => ({ itemId: 'i', externalId: 'e', listId: 'L1', title: 't', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: null, modifiedAt: null, readOnly: false, ...o });
    const M = window.__m = { calls: [], cbs: {}, perm: p, hold: false, pend: [], day, lastSince: null };
    M.items = [
      R({ itemId: 'late', title: '期限切れ', due: { date: day(-2) }, priority: 1 }),
      R({ itemId: 'today', title: '今日の', due: { date: day(0) }, recurring: true }),
      R({ itemId: 'soon', title: 'この先の', due: { date: day(3), time: '10:00' } }),
      R({ itemId: 'nd', title: 'なし', createdAt: 5 }),
      R({ itemId: 'ro', title: '読専', readOnly: true, createdAt: 9 }),
      R({ itemId: 'd1', title: '済1', done: true, doneAt: stamp(-3) }),
      R({ itemId: 'd2', title: '済2', done: true, doneAt: stamp(-45) }),
    ];
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: M.perm };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'L', color: '#336699' }] };
        if (m === 'listReminders') {
          M.lastSince = o.completedSince;
          const out = M.items.filter((r) => !r.done || r.doneAt >= o.completedSince);
          if (M.hold) return new Promise((res) => M.pend.push(() => res({ reminders: out })));
          return { reminders: out };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, perm);
}
const OPEN = SIZES.openLandscape;
const lr = (page) => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'listReminders').length);
const toTask = (page) => page.locator('.pgl [data-pick="task"]').first().click();

test.describe('タスクの分類と完了履歴', () => {
  test('分類の順・行の種類・完了は閉じている・本文を保存しない', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await toTask(page);
    const lp = page.locator('.page.lp');
    await expect(lp.locator('[data-key="rm:late"]')).toBeVisible();
    const secs = await lp.locator('[data-sec]').evaluateAll((e) => e.map((x) => x.dataset.sec));
    expect(secs).toEqual(['overdue', 'selected', 'upcoming', 'nodue', 'done']);
    await expect(lp.locator('[data-key="rm:late"] .rmpri')).toHaveText('!');
    await expect(lp.locator('[data-key="rm:today"] .rmd')).toContainText('繰り返し');
    await expect(lp.locator('[data-key="rm:ro"]')).toContainText('読み取り専用');
    expect(await lp.locator('[data-key="rm:nd"]').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await lp.locator('[data-key="rm:today"]').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
    await expect(lp.locator('[data-key="rm:d1"]')).toHaveCount(0);
    // 初回は完了を30日分だけ取りに行く
    const since = await page.evaluate(() => window.__m.lastSince);
    const exp = await page.evaluate(() => { const d = new Date(2026, 10, 12, 9, 41); d.setDate(d.getDate() - 30); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; });
    expect(since).toBe(exp);
    const ls = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    expect(ls).not.toContain('期限切れ');
  });
  test('完了を開く→もっと前で30日ずつ取り直す', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await toTask(page);
    const lp = page.locator('.page.lp');
    await lp.locator('[data-act="remdone"]').click();
    await expect(lp.locator('[data-key="rm:d1"]')).toBeVisible();
    await expect(lp.locator('[data-key="rm:d2"]')).toHaveCount(0);
    await lp.locator('[data-act="remmore"]').click();
    await expect(lp.locator('[data-key="rm:d2"]')).toBeVisible();
    expect(await page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'listReminders').map((c) => c[1].completedSince).length)).toBe(2);
  });
  test('選択日を変えると取り直さず分類だけ変わる。右ページでも同じ分類', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await page.locator('.pgr [data-pick="task"]').first().click();
    const rp = page.locator('.page.rp');
    await expect(rp.locator('[data-key="rm:today"]')).toBeVisible();
    expect(await rp.locator('[data-sec]').evaluateAll((e) => e.map((x) => x.dataset.sec))).toEqual(['overdue', 'selected', 'upcoming', 'nodue', 'done']);
    const n0 = await lr(page);
    const k = await page.evaluate(() => window.__m.day(3));
    await page.locator(`.page.lp [data-date="${k}"]`).first().click({ position: { x: 12, y: 10 } });
    await expect(rp.locator('[data-sec="selected"] [data-key="rm:soon"]')).toBeVisible();
    await expect(rp.locator('[data-sec="overdue"] [data-key="rm:today"]')).toBeVisible();
    expect(await lr(page)).toBe(n0);
  });
  test('外部変更（calendarChanged）は300msに間引いて取り直し、前面復帰でも取り直す', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp [data-key="rm:late"]')).toBeVisible();
    const n0 = await lr(page);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__m.cbs.calendarChanged({}); window.__m.items.push({ itemId: 'new', externalId: 'e', listId: 'L1', title: '新規', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: null, readOnly: false }); });
    await expect(page.locator('.page.lp [data-key="rm:new"]')).toBeVisible();
    expect(await lr(page)).toBe(n0 + 1);
    const n1 = await lr(page);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => lr(page)).toBeGreaterThan(n1);
  });
  test('遅い旧応答は新しい応答を上書きしない', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp [data-key="rm:late"]')).toBeVisible();
    await page.evaluate(() => { window.__m.hold = true; window.__m.cbs.calendarChanged({}); });
    await expect.poll(() => lr(page)).toBe(2);
    await page.evaluate(() => { window.__m.items = window.__m.items.filter((r) => r.itemId !== 'late'); window.__m.cbs.calendarChanged({}); });
    await expect.poll(() => lr(page)).toBe(3);
    await page.evaluate(() => { const p = window.__m.pend; p[1](); p[0](); });
    await expect(page.locator('.page.lp [data-key="rm:late"]')).toHaveCount(0);
  });
  test('権限が取り消されたらメモリ上のタスクを消して案内へ', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await toTask(page);
    await expect(page.locator('.page.lp [data-key="rm:late"]')).toBeVisible();
    await page.evaluate(() => { window.__m.perm = 'denied'; document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('.page.lp .remgate')).toContainText('設定アプリで');
    await expect(page.locator('[data-key^="rm:"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('期限切れ');
  });
  test('開いた縦の下パネルでも同じ分類', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openPortrait);
    const sw = page.locator('.pswitch');
    if (!(await sw.isVisible())) await page.locator('[data-act="pnltoggle"]').first().click();
    await sw.getByRole('button', { name: 'タスク', exact: true }).click();
    const pn = page.locator('.pnl');
    await expect(pn.locator('[data-key="rm:late"]')).toBeVisible();
    expect(await pn.locator('[data-sec]').evaluateAll((e) => e.map((x) => x.dataset.sec))).toEqual(['overdue', 'selected', 'upcoming', 'nodue', 'done']);
  });
});
