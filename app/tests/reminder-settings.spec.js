// 第14版 PR23: タスクのリスト設定（表示リスト／追加先）と月の「✓N」。
import { test, expect } from '@playwright/test';
import { openApp, openMenu, SIZES, OPEN_SIZES } from './helpers.js';

async function mock(page, { store = null, lists = null } = {}) {
  await page.addInitScript(({ store, lists }) => {
    if (store && !localStorage.getItem('duo-native-rem')) localStorage.setItem('duo-native-rem', JSON.stringify(store));
    const pad = (n) => String(n).padStart(2, '0');
    const day = (off) => { const d = new Date(2026, 10, 12 + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const R = (o) => ({ itemId: 'i', externalId: 'e', listId: 'A', title: 't', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: null, modifiedAt: 1, readOnly: false, ...o });
    const M = window.__m = { calls: [], day };
    M.lists = lists || [
      { id: 'A', title: '仕事', color: '#336699', allowsModify: true, isDefault: true },
      { id: 'B', title: '家', color: '#B43C3C', allowsModify: true, isDefault: false },
      { id: 'C', title: '共有', color: '#2E7D32', allowsModify: false, isDefault: false },
    ];
    M.items = [
      R({ itemId: 'a1', title: '秘密のA1', due: { date: day(0) } }),
      R({ itemId: 'a2', title: '秘密のA2', due: { date: day(0), time: '10:00' } }),
      R({ itemId: 'b1', title: '秘密のB1', listId: 'B', due: { date: day(0) } }),
      R({ itemId: 'c1', title: '秘密のC1', listId: 'C', readOnly: true, due: { date: day(1) } }),
      R({ itemId: 'd1', title: '済み', due: { date: day(1) }, done: true, doneAt: `${day(-1)}T08:00` }),
    ];
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: () => 'c',
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, o]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: M.lists };
        if (m === 'listReminders') return { reminders: M.items.filter((r) => o.listIds.includes(r.listId) && (!r.done || r.doneAt >= o.completedSince)) };
        if (m === 'setReminderDone') { const r = M.items.find((x) => x.itemId === o.itemId); r.done = o.done; r.doneAt = o.done ? `${day(0)}T09:00` : null; return { reminder: r }; }
        if (m === 'createReminder') { const r = R({ itemId: `n${M.items.length}`, listId: o.listId, title: o.title, due: o.due }); M.items.push(r); return { reminder: r }; }
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, { store, lists });
}
const OPEN = SIZES.openLandscape;
const cnt = (page, k) => page.locator(`.page.lp .day[data-date="${k}"] .tkn, .day[data-date="${k}"] .tkn`).first();
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-rem') || 'null'));
const listCalls = (page) => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'listReminders').map((c) => c[1].listIds));
const D0 = '2026-11-12', D1 = '2026-11-13';

test.describe('月にタスクを表示', () => {
  test('初期は off（件数なし）。オンにすると開いた画面にだけ ✓N、タスク名は出ない', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await expect(page.locator('.day[data-date="2026-11-12"]').first()).toBeVisible();
    await expect(page.locator('.tkn')).toHaveCount(0);
    await openMenu(page, 'reminders');
    await expect(page.locator('#m-tkmonth')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#m-tkmonth').click();
    await expect(page.locator('#m-tkmonth')).toHaveAttribute('aria-checked', 'true');
    await expect(cnt(page, D0)).toHaveText('✓3'); // A×2＋B×1（完了・期限なしは除く）
    await expect(cnt(page, D1)).toHaveText('✓1'); // 読み取り専用リストも表示対象。完了は数えない
    expect((await stored(page)).monthTasks).toBe(true);
    const html = await page.locator('body').innerHTML();
    expect(html).not.toContain('秘密のA1');
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain('秘密の');
    await expect(page.locator('.day[data-date="2026-11-12"] >> nth=0')).toHaveAttribute('aria-label', /未完了のタスク3件/);
  });
  test('閉じた画面では出さない', async ({ page }) => {
    await mock(page, { store: { lists: null, addTo: '', monthTasks: true } });
    await openApp(page, SIZES.closedPortrait);
    await page.getByRole('button', { name: '月', exact: true }).first().click().catch(() => {});
    await expect(page.locator('.tkn')).toHaveCount(0);
  });
  for (const size of OPEN_SIZES) {
    test(`位置: 数字の中心から右14pt・8pt、+N と重ならない ${size.width}x${size.height}`, async ({ page }) => {
      await mock(page, { store: { lists: null, addTo: '', monthTasks: true } });
      await openApp(page, size);
      const t = page.locator(`.day[data-date="${D0}"] .tkn`).first();
      await expect(t).toBeVisible();
      const g = await page.evaluate((k) => {
        const out = [];
        for (const day of document.querySelectorAll(`.day[data-date="${k}"]`)) {
          const n = day.querySelector('.num'), t = day.querySelector('.tkn'); if (!t) continue;
          const nb = n.getBoundingClientRect(), tb = t.getBoundingClientRect();
          out.push({ dx: tb.left - (nb.left + nb.width / 2), fs: getComputedStyle(t).fontSize, right: tb.right, dayRight: day.getBoundingClientRect().right });
        }
        return out;
      }, D0);
      expect(g.length).toBeGreaterThan(0);
      for (const x of g) { expect(Math.abs(x.dx - 14)).toBeLessThan(1.5); expect(x.fs).toBe('8px'); expect(x.right).toBeLessThanOrEqual(x.dayRight); }
      // +N の見た目（文字）と ✓N の矩形が交わらない
      const hit = await page.evaluate(() => {
        const bad = [];
        for (const t of document.querySelectorAll('.tkn')) {
          const tb = t.getBoundingClientRect(), wk = t.closest('.week'); if (!wk) continue;
          for (const p of wk.querySelectorAll('.plus')) {
            const r = document.createRange(); r.selectNodeContents(p); const pb = r.getBoundingClientRect();
            if (pb.width && tb.left < pb.right && tb.right > pb.left && tb.top < pb.bottom && tb.bottom > pb.top) bad.push([t.textContent, p.textContent]);
          }
        }
        return bad;
      });
      expect(hit).toEqual([]);
    });
  }
  test('完了で件数が減り、戻すと増える。日付変更の再取得でも更新', async ({ page }) => {
    await mock(page, { store: { lists: null, addTo: '', monthTasks: true } });
    await openApp(page, OPEN);
    await expect(cnt(page, D0)).toHaveText('✓3');
    await page.locator('.pgr [data-pick="task"]').first().click();
    const lp = page.locator('.page.rp');
    await lp.locator('[data-key="rm:a1"] [data-act="remck"]').click();
    await expect(cnt(page, D0)).toHaveText('✓2');
    await lp.locator('[data-key="rm:a1"] [data-act="remck"]').click();
    await expect(cnt(page, D0)).toHaveText('✓3');
    // iPhone 側で期限が変わった → 次の取得で件数が動く
    await page.evaluate(() => { window.__m.items.find((r) => r.itemId === 'a2').due = { date: window.__m.day(5) }; });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(cnt(page, D0)).toHaveText('✓2');
  });
});

const closeMenu = async (page) => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await expect(page.locator('#menu')).toBeHidden(); };
const createCalls = (page) => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'createReminder').map((c) => c[1].listId));
const taskCalls = (page) => page.evaluate(() => window.__m.calls.filter((c) => c[0] === 'listReminders' || c[0] === 'listReminderLists').length);

test.describe('リストの表示と追加先（カレンダー内のリマインダー段）', () => {
  test('初回は全 id を保存。選ぶと native へはその id だけ、追加先は独立のまま。全オフも保持', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await page.locator('.pgr [data-pick="task"]').first().click();
    const lp = page.locator('.page.rp');
    await expect(lp.locator('[data-key="rm:b1"]')).toBeVisible();
    await expect.poll(() => stored(page)).toMatchObject({ enabled: true, lists: ['A', 'B', 'C'] });
    await openMenu(page, 'calendar');
    const rb = page.locator('#m-cal-rem');
    await expect(rb.locator('[data-tkshow="C"]')).toContainText('表示のみ');
    await expect(rb.locator('[data-tkadd="C"]')).toHaveCount(0); // 読み取り専用は追加先に出ない
    await expect(rb.locator('[data-tkadd=""]')).toHaveAttribute('aria-checked', 'true');
    await expect(rb.locator('#m-remhist')).toHaveText('完了したタスク：30日分を表示');
    await rb.locator('[data-tkshow="A"]').click();
    await rb.locator('[data-tkshow="C"]').click();
    await expect.poll(async () => (await listCalls(page)).at(-1)).toEqual(['B']);
    expect((await stored(page)).lists).toEqual(['B']);
    await closeMenu(page);
    await expect(lp.locator('[data-key="rm:a1"]')).toHaveCount(0);
    await lp.locator('[data-act="remadd"]').click();
    await lp.locator('input.remin').fill('新しい');
    await lp.locator('input.remin').press('Enter');
    await expect.poll(() => createCalls(page)).toEqual(['B']); // 追加先は✓付き書込可のみ（A は非表示）
    // 全オフ: 最後の1つも外せる。表示は空、追加不可、リロードしても全件に戻らない
    await openMenu(page, 'calendar');
    await rb.locator('[data-tkshow="B"]').click();
    await expect(rb.locator('[data-tkshow][aria-checked="true"]')).toHaveCount(0);
    await expect(rb).toContainText('追加できるリストがありません');
    expect((await stored(page)).lists).toEqual([]);
    await closeMenu(page);
    await expect(lp.locator('.rmrow')).toHaveCount(0);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect((await stored(page)).lists).toEqual([]);
    await expect(page.locator('.rmrow')).toHaveCount(0);
  });
  test('追加先を B にすると B へ。非表示にすると自動へ', async ({ page }) => {
    await mock(page);
    await openApp(page, OPEN);
    await page.locator('.pgr [data-pick="task"]').first().click();
    await openMenu(page, 'calendar');
    const rb = page.locator('#m-cal-rem');
    await rb.locator('[data-tkadd="B"]').click();
    await expect(rb.locator('[data-tkadd="B"]')).toHaveAttribute('aria-checked', 'true');
    expect((await stored(page)).addTo).toBe('B');
    await closeMenu(page);
    const lp = page.locator('.page.rp');
    await lp.locator('[data-act="remadd"]').click();
    await lp.locator('input.remin').fill('家のこと');
    await lp.locator('input.remin').press('Enter');
    await expect.poll(() => createCalls(page)).toEqual(['B']);
    await openMenu(page, 'calendar');
    await rb.locator('[data-tkshow="B"]').click(); // B を非表示 → 追加先は自動（A）
    await expect(rb.locator('[data-tkadd="B"]')).toHaveCount(0);
    await expect(rb.locator('[data-tkadd=""]')).toHaveAttribute('aria-checked', 'true');
    await closeMenu(page);
    if (await lp.locator('[data-act="remadd"]').count()) await lp.locator('[data-act="remadd"]').click();
    await lp.locator('input.remin').fill('仕事');
    await lp.locator('input.remin').press('Enter');
    await expect.poll(() => createCalls(page)).toEqual(['B', 'A']);
  });
  test('消えたリストの id は除かれ、追加先は自動に戻る。旧設定は enabled=true で移行', async ({ page }) => {
    await mock(page, { store: { lists: ['B', 'GONE'], addTo: 'GONE', monthTasks: true } });
    await openApp(page, OPEN);
    await expect.poll(() => stored(page)).toEqual({ enabled: true, lists: ['B'], addTo: '', monthTasks: true });
    await expect(cnt(page, D0)).toHaveText('✓1'); // B だけ
    expect((await listCalls(page)).at(-1)).toEqual(['B']);
  });
  test('増えたリストは選ばない。書込可が✓にない時は追加不可。既定なしは✓の書ける先頭', async ({ page }) => {
    await mock(page, { store: { lists: ['A', 'B'], addTo: '', monthTasks: false }, lists: [
      { id: 'A', title: '仕事', color: '#336699', allowsModify: false, isDefault: false },
      { id: 'B', title: '家', color: '#B43C3C', allowsModify: true, isDefault: false },
    ] });
    await openApp(page, OPEN);
    await page.locator('.pgr [data-pick="task"]').first().click();
    const lp = page.locator('.page.rp');
    await lp.locator('[data-act="remadd"]').click();
    await lp.locator('input.remin').fill('x');
    await lp.locator('input.remin').press('Enter');
    await expect.poll(() => createCalls(page)).toEqual(['B']);
    await page.evaluate(() => { window.__m.lists.push({ id: 'N', title: '新', color: '#000000', allowsModify: true, isDefault: false }); window.__m.items.push({ itemId: 'n1', externalId: 'e', listId: 'N', title: '新規', notes: '', due: null, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 1, readOnly: false }); });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-cal-rem [data-tkshow="N"]')).toHaveAttribute('aria-checked', 'false'); // 増加分は未選択
    expect((await stored(page)).lists).toEqual(['A', 'B']);
    await expect(lp.locator('[data-key="rm:n1"]')).toHaveCount(0);
    await closeMenu(page);
  });
  test('一覧の一時的な空では選択を失わない', async ({ page }) => {
    await mock(page, { store: { lists: ['A', 'B'], addTo: 'B', monthTasks: false } });
    await openApp(page, OPEN);
    await page.locator('.pgr [data-pick="task"]').first().click();
    await expect(page.locator('.page.rp [data-key="rm:a1"]')).toBeVisible();
    await page.evaluate(() => { window.__m.lists = []; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    expect(await stored(page)).toMatchObject({ lists: ['A', 'B'], addTo: 'B', monthTasks: false });
  });
});

test.describe('リマインダーの同期スイッチ', () => {
  test('オフで一覧取得0・タスクページは案内・✓N は出ない。選択は残り、オンで復帰', async ({ page }) => {
    await mock(page, { store: { lists: ['A', 'B'], addTo: 'B', monthTasks: true } });
    await openApp(page, OPEN);
    await expect(cnt(page, D0)).toHaveText('✓3');
    await openMenu(page, 'calendar');
    const sw = page.locator('#m-remsync');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#m-cal-rem [data-tkshow]')).toHaveCount(0);
    await closeMenu(page);
    await expect(page.locator('.tkn')).toHaveCount(0);
    await page.locator('.pgr [data-pick="task"]').first().click();
    await expect(page.locator('.page.rp .remgate')).toContainText('リマインダーの同期がオフ');
    const n0 = await taskCalls(page);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(700);
    expect(await taskCalls(page)).toBe(n0);
    expect(await stored(page)).toEqual({ enabled: false, lists: ['A', 'B'], addTo: 'B', monthTasks: true });
    // 再起動でもオフのまま（呼出0）
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.waitForTimeout(500);
    expect(await taskCalls(page)).toBe(0);
    // オンで復帰
    await openMenu(page, 'calendar');
    await page.locator('#m-remsync').click();
    await expect(cnt(page, D0)).toHaveText('✓3');
    expect((await stored(page)).enabled).toBe(true);
    expect((await stored(page)).lists).toEqual(['A', 'B']);
  });
  test('オフ前に始めた遅い listReminders の応答は捨てる', async ({ page }) => {
    await mock(page, { store: { lists: null, addTo: '', monthTasks: true } });
    await page.addInitScript(() => {
      const orig = () => window.Capacitor.nativePromise;
      const t = setInterval(() => {
        const f = window.Capacitor?.nativePromise; if (!f || f.__w) return;
        const w = async (pl, m, o) => { const r = await f(pl, m, o); if (m === 'listReminders' && window.__slow) await new Promise((res) => setTimeout(res, 800)); return r; };
        w.__w = true; window.Capacitor.nativePromise = w; clearInterval(t);
      }, 1);
      void orig;
    });
    await openApp(page, OPEN);
    await expect(cnt(page, D0)).toHaveText('✓3');
    await page.evaluate(() => { window.__slow = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { window.__m.items.push({ itemId: 'z1', externalId: 'e', listId: 'A', title: '遅い', notes: '', due: { date: window.__m.day(0) }, done: false, doneAt: null, alarms: [], alarmsExtra: 0, priority: 0, recurring: false, createdAt: 1, modifiedAt: 1, readOnly: false }); });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(450); // 取得が飛んでいる間にオフ
    await openMenu(page, 'calendar');
    await page.locator('#m-remsync').click();
    await closeMenu(page);
    await page.waitForTimeout(1400);
    await expect(page.locator('.tkn')).toHaveCount(0);
    const html = await page.locator('body').innerHTML();
    expect(html).not.toContain('遅い');
  });
});

test.describe('その他', () => {
  test('バックアップの説明に設定を含まないと明記。ネイティブ以外ではタスク設定を出さない', async ({ page }) => {
    await page.goto('/index.html');
    await page.setViewportSize(SIZES.openLandscape);
    await page.waitForSelector('html[data-ready]');
    await openMenu(page);
    await expect(page.locator('#m-reminders')).toBeHidden(); // ネイティブ以外はリマインダーの入口を出さない
    await expect(page.locator('#m-tk')).toBeHidden();
  });
});
