// 第16版 PR17: 月のタスク件数（✓N）の設定と、廃止した同期・リスト・追加先・許可の設定が無いこと。タスクは Duo 内保存。
import { test, expect } from '@playwright/test';
import { openApp, openMenu, SIZES, OPEN_SIZES } from './helpers.js';
import { spy, legacyCalls, seedTasks, T } from './task-helpers.js';

const D0 = '2026-11-12', D1 = '2026-11-13';
const SEED = [
  T('a1', { title: '秘密のA1', order: 1 }),
  T('a2', { title: '秘密のA2', order: 2, due: { date: D0, time: '10:00' } }),
  T('b1', { title: '秘密のB1', order: 3 }),
  T('c1', { title: '秘密のC1', order: 4, due: { date: D1 } }),
  T('d1', { title: '済み', order: 5, due: { date: D1 }, done: true, doneAt: '2026-11-11T08:00' }),
  T('n1', { title: '期限なし', order: 6, due: null }),
];
// store: localStorage の旧設定（初回だけ入れる）。
async function boot(page, size, { store = null } = {}) {
  await spy(page);
  await page.addInitScript((st) => { if (st && !localStorage.getItem('duo-native-rem')) localStorage.setItem('duo-native-rem', JSON.stringify(st)); }, store);
  await openApp(page, size);
  await seedTasks(page, SEED);
}
const OPEN = SIZES.openLandscape;
const cnt = (page, k) => page.locator(`.page.lp .day[data-date="${k}"] .tkn, .day[data-date="${k}"] .tkn`).first();
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo-task-settings') || 'null'));
const storedOld = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo-native-rem') || 'null'));
const ON = { lists: null, addTo: '', monthTasks: true };

test.describe('月にタスクを表示', () => {
  test('初期は off（件数なし）。オンにすると開いた画面にだけ ✓N、タスク名は出ない', async ({ page }) => {
    await boot(page, OPEN);
    await expect(page.locator('.day[data-date="2026-11-12"]').first()).toBeVisible();
    await expect(page.locator('.tkn')).toHaveCount(0);
    await openMenu(page, 'reminders');
    await expect(page.locator('#m-tkmonth')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#m-tkmonth').click();
    await expect(page.locator('#m-tkmonth')).toHaveAttribute('aria-checked', 'true');
    await expect(cnt(page, D0)).toHaveText('✓3');
    await expect(cnt(page, D1)).toHaveText('✓1'); // 完了・期限なしは数えない
    expect((await stored(page)).monthTasks).toBe(true);
    expect(await page.locator('body').innerHTML()).not.toContain('秘密のA1');
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain('秘密の');
    await expect(page.locator('.day[data-date="2026-11-12"] >> nth=0')).toHaveAttribute('aria-label', /未完了のタスク3件/);
    expect(await legacyCalls(page)).toEqual([]);
  });
  test('旧 monthTasks:true は新設定へ一度だけ継承。以後は新設定が正で、旧設定は変わらない', async ({ page }) => {
    const old = { enabled: false, lists: ['L1'], addTo: 'L1', monthTasks: true };
    await boot(page, OPEN, { store: old });
    expect(await stored(page)).toEqual({ monthTasks: true });
    await expect(cnt(page, D0)).toHaveText('✓3');
    await openMenu(page, 'reminders');
    await expect(page.locator('#m-tkmonth')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#m-tkwin')).toHaveText('30日');
    await page.locator('#m-tkmonth').click();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await stored(page)).toEqual({ monthTasks: false }); // 旧が true のままでも再継承しない
    expect(await storedOld(page)).toEqual(old);
  });
  test('閉じた画面では出さない', async ({ page }) => {
    await boot(page, SIZES.closedPortrait, { store: ON });
    await page.getByRole('button', { name: '月', exact: true }).first().click().catch(() => {});
    await expect(page.locator('.tkn')).toHaveCount(0);
  });
  for (const size of OPEN_SIZES) {
    test(`位置: 数字の中心から右14pt・8pt、+N と重ならない ${size.width}x${size.height}`, async ({ page }) => {
      await boot(page, size, { store: ON });
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
  test('完了で件数が減り、戻すと増える。保存の変更（期限）後の再読込でも更新', async ({ page }) => {
    await boot(page, OPEN, { store: ON });
    await expect(cnt(page, D0)).toHaveText('✓3');
    await page.locator('.pgr [data-pick="task"]').first().click();
    const rp = page.locator('.page.rp');
    await rp.locator('[data-key="rm:a1"] [data-act="remck"]').click();
    await expect(cnt(page, D0)).toHaveText('✓2');
    await rp.locator('[data-key="rm:a1"] [data-act="remck"]').click();
    await expect(cnt(page, D0)).toHaveText('✓3');
    await page.waitForTimeout(1800);
    await page.evaluate(async () => { const d = await import('/js/db.js'); const t = (await d.listTasks()).find((x) => x.id === 'a2'); await d.putTask({ ...t, due: { date: '2026-11-17' } }); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(cnt(page, D0)).toHaveText('✓2');
  });
});

test.describe('廃止した設定（同期・リスト・追加先・許可）', () => {
  test('設定›カレンダーのリマインダー段は空。許可・同期・リストの操作は無い。native 呼出0', async ({ page }) => {
    await boot(page, OPEN);
    await openMenu(page, 'calendar');
    await expect(page.locator('#m-cal-rem')).toHaveCount(0);
    await expect(page.locator('#m-remsync, #m-remreq, [data-tkshow], [data-tkadd], #m-remhist')).toHaveCount(0);
    expect(await legacyCalls(page)).toEqual([]);
  });
  test('旧設定（lists・addTo・enabled:false）は消さず、読まない: タスクは隠れず追加もできる', async ({ page }) => {
    const old = { enabled: false, lists: [], addTo: 'L9', monthTasks: false };
    await boot(page, OPEN, { store: old });
    await page.locator('.pgl [data-pick="task"]').first().click();
    const lp = page.locator('.page.lp');
    await expect(lp.locator('[data-key="rm:a1"]')).toBeVisible();
    await expect(lp.locator('.remgate')).toHaveCount(0);
    const i = lp.locator('input.remin');
    await i.click(); await i.fill('新しい'); await i.press('Enter');
    await expect(i).toHaveValue('');
    await expect(lp.locator('.rmt', { hasText: '新しい' })).toHaveCount(1);
    expect(await storedOld(page)).toMatchObject(old); // 旧設定はそのまま
    expect(await stored(page)).toEqual({ monthTasks: false }); // 新設定は monthTasks だけ
    expect(await legacyCalls(page)).toEqual([]);
  });
});
