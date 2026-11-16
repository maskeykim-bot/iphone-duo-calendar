// 第14版 PR17: タスクを続けて追加する（偽装 native）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

async function mock(page, { lists } = {}) {
  await page.addInitScript((ls) => {
    const M = window.__m = { calls: [], cbs: {}, created: {}, items: [], seq: 0, delay: 0, loseNext: false, failNext: null,
      lists: ls || [{ id: 'L1', title: 'A', color: '#336699', allowsModify: true, isDefault: false }, { id: 'L2', title: 'B', color: '#993366', allowsModify: true, isDefault: true }] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: M.lists };
        if (m === 'listReminders') return { reminders: M.items.slice() };
        if (m === 'createReminder') {
          if (M.failNext) { const c = M.failNext; M.failNext = null; throw { code: c }; }
          const fp = JSON.stringify([o.listId, o.title, o.notes, o.due]);
          let rec = M.created[o.requestId];
          if (rec && rec.fp !== fp) throw { code: 'INVALID_ARGUMENT' };
          if (!rec) {
            rec = M.created[o.requestId] = { fp, r: { itemId: 'x' + (++M.seq), externalId: 'e' + M.seq, listId: o.listId, title: o.title, notes: '', due: o.due, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: M.seq, modifiedAt: 1, readOnly: false } };
            M.items.push(rec.r);
          }
          if (M.delay) await new Promise((r) => setTimeout(r, M.delay));
          if (M.loseNext) { M.loseNext = false; throw { code: 'UNAVAILABLE' }; }
          return { reminder: rec.r };
        }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, lists);
}
const OPEN = SIZES.openLandscape;
const creates = (page) => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'createReminder').map((c) => c[1]));
async function ready(page) {
  await openApp(page, OPEN);
  await page.locator('.pgl [data-pick="task"]').first().click();
  await expect(page.locator('.page.lp .rmaddbtn')).toBeVisible();
}
const lp = (page) => page.locator('.page.lp');
async function openAdd(page) { await lp(page).locator('[data-act="remadd"]').click(); const i = lp(page).locator('input.remin'); await expect(i).toBeFocused(); return i; }

test.describe('タスクの続けて追加', () => {
  test('追加行は高さ44・既定リスト（OS既定）・期限チップは選択日・Enterで保存して続けて入力', async ({ page }) => {
    await mock(page); await ready(page);
    expect(await lp(page).locator('.rmaddbtn').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const i = await openAdd(page);
    expect(await i.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限 11/12');
    await i.fill('牛乳'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    await expect(i).toBeFocused(); await expect(i).toHaveValue('');
    await i.fill('パン'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x2"]')).toBeVisible();
    const c = await creates(page);
    expect(c.map((x) => [x.title, x.listId, x.due])).toEqual([['牛乳', 'L2', { date: '2026-11-12' }], ['パン', 'L2', { date: '2026-11-12' }]]);
    expect(c[0].requestId).not.toBe(c[1].requestId);
    // 再取得（外部変更）されても二重行にならない
    await page.evaluate(() => window.__m.cbs.eventStoreChanged?.({})); // 無い場合は何もしない
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(lp(page).locator('[data-key="rm:x1"]')).toHaveCount(1);
    await expect(lp(page).locator('[data-key="rm:x2"]')).toHaveCount(1);
  });

  test('× で期限なし（nullを送る）。もう一度たたくと選択日に戻る', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await lp(page).locator('[data-act="remdue0"]').click();
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限なし');
    await expect(i).toBeFocused();
    await i.fill('いつか'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    expect((await creates(page))[0].due).toBeNull();
    // 「期限なし」をたたくと日付の部品が開き、日をたたくと期限が付く
    await lp(page).locator('[data-act="remdue2"]').click();
    await lp(page).locator('.rmdp .dcell[data-day="2026-11-12"]').click();
    await expect(lp(page).locator('.rmdp')).toHaveCount(0);
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限 11/12');
  });

  test('連打は1件だけ（保存中は排他）／保存中の入力は変えられない', async ({ page }) => {
    await mock(page); await ready(page);
    await page.evaluate(() => { window.__m.delay = 400; });
    const i = await openAdd(page);
    await i.fill('連打');
    await i.press('Enter'); await i.press('Enter'); await i.press('Enter');
    await expect(i).toHaveAttribute('readonly', '');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    expect((await creates(page)).length).toBe(1);
  });

  test('IME変換中のEnterは保存しない（確定後のEnterで保存）', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await i.fill('かいもの');
    await i.evaluate((e) => { e.dispatchEvent(new CompositionEvent('compositionstart')); });
    await i.evaluate((e) => { e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true })); });
    await page.evaluate(() => window.__m.cbs && 0);
    expect((await creates(page)).length).toBe(0);
    await i.evaluate((e) => { e.dispatchEvent(new CompositionEvent('compositionend')); });
    await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    expect((await creates(page))[0].title).toBe('かいもの');
  });

  test('変換中に再描画が来ても入力欄は作り直されない', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await i.fill('abc');
    await i.evaluate((e) => { e.dataset.mark = '1'; e.dispatchEvent(new CompositionEvent('compositionstart')); });
    await page.locator('.page.lp .tlrow, .page.lp').first().evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('[data-pick="task"]').first().evaluate(() => 0);
    await expect(lp(page).locator('input.remin')).toHaveAttribute('data-mark', '1');
    await i.evaluate((e) => e.dispatchEvent(new CompositionEvent('compositionend')));
  });

  test('失敗では本文を残し、再試行は同じ requestId。応答喪失でも二重にならない', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await page.evaluate(() => { window.__m.loseNext = true; });
    await i.fill('失う'); await i.press('Enter');
    await expect(lp(page).locator('.rmwhy.err')).toBeVisible();
    await expect(i).toHaveValue('失う'); await expect(i).toBeFocused();
    await i.press('Enter'); // 同じ内容で再試行
    await expect(lp(page).locator('.rmwhy.err')).toHaveCount(0);
    await expect(i).toHaveValue('');
    const c = await creates(page);
    expect(c.length).toBe(2); expect(c[1].requestId).toBe(c[0].requestId);
    expect(await page.evaluate(() => window.__m.items.length)).toBe(1);
    await page.waitForTimeout(600);
    await expect(lp(page).locator('[data-key^="rm:x"]')).toHaveCount(1);
    // 新しいタスクは別の requestId
    await i.fill('次'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x2"]')).toBeVisible();
    expect((await creates(page))[2].requestId).not.toBe(c[0].requestId);
  });

  test('失敗後に題名を直したら新しい requestId（旧IDへ異内容を送らない）', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await page.evaluate(() => { window.__m.failNext = 'UNAVAILABLE'; });
    await i.fill('あ'); await i.press('Enter');
    await expect(lp(page).locator('.rmwhy.err')).toBeVisible();
    await i.fill('あい'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    const c = await creates(page);
    expect(c[1].requestId).not.toBe(c[0].requestId);
  });

  test('既定リストが消えたら LIST_NOT_FOUND → 取り直して次の書けるリストへ。本文は残る', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await page.evaluate(() => { const M = window.__m; M.lists = M.lists.filter((l) => l.id !== 'L2'); M.failNext = 'LIST_NOT_FOUND'; });
    await i.fill('移る'); await i.press('Enter');
    await expect(lp(page).locator('.rmwhy.err')).toContainText('リスト');
    await expect(i).toHaveValue('移る');
    await expect.poll(() => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'listReminderLists').length)).toBeGreaterThan(1);
    await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    expect((await creates(page)).pop().listId).toBe('L1');
  });

  test('書けるリストがなければ disabled＋理由', async ({ page }) => {
    await mock(page, { lists: [{ id: 'R', title: 'R', color: '#111111', allowsModify: false, isDefault: true }] });
    await ready(page);
    await expect(lp(page).locator('.rmaddbtn')).toBeDisabled();
    await expect(lp(page).locator('.rmwhy')).toContainText('書き込めるリストがない');
  });

  test('ページの＋で入力欄にフォーカス。DB・outbox・バックアップにタスクを入れない', async ({ page }) => {
    await mock(page); await ready(page);
    await page.locator('[data-act="add"]').first().click();
    const i = lp(page).locator('input.remin');
    await expect(i).toBeFocused();
    await i.fill('秘密のタスク名'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    const dump = await page.evaluate(async () => {
      const dbs = (await indexedDB.databases?.()) || [];
      let out = '';
      for (const d of dbs) {
        const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        for (const n of db.objectStoreNames) {
          out += JSON.stringify(await new Promise((res) => { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => res(q.result); }));
        }
        db.close();
      }
      let ls = ''; for (let k = 0; k < localStorage.length; k++) ls += localStorage.key(k) + localStorage.getItem(localStorage.key(k));
      const b = await import('/js/backup.js'); const db = await import('/js/db.js');
      const bk = JSON.stringify(b.buildBackup(await db.listEvents(), {}, new Date(), [], []));
      return { out, ls, bk };
    });
    expect(dump.out).not.toContain('秘密のタスク名');
    expect(dump.ls).not.toContain('秘密のタスク名');
    expect(dump.bk).not.toContain('秘密のタスク名');
  });

  test('期限の部品で日付と時刻を選んで追加できる（時刻つき due、notify は省略）', async ({ page }) => {
    await mock(page); await ready(page);
    const i = await openAdd(page);
    await lp(page).locator('[data-act="remdue2"]').click();
    await lp(page).locator('.rmdp .dcell[data-day="2026-11-20"]').click();
    await lp(page).locator('[data-act="remdue2"]').click();
    await lp(page).locator('[data-act="remtimeon"]').click();
    await lp(page).locator('[data-act="remth"][data-h="10"]').click();
    await lp(page).locator('[data-act="remtm"][data-m="30"]').click();
    await expect(lp(page).locator('.rmchip:not(.rmnote)')).toContainText('期限 11/20 10:30');
    await i.fill('時刻つき'); await i.press('Enter');
    await expect(lp(page).locator('[data-key="rm:x1"]')).toBeVisible();
    const c = (await creates(page))[0];
    expect(c.due).toEqual({ date: '2026-11-20', time: '10:30' });
    expect('notify' in c).toBe(false);
  });
});
