// 第16版 PR12: 右の帯にタスクとメモの入口（DP-3）。閉じた画面・開いた横の帯に6項目。縦の上帯には置かない。
import { test, expect } from '@playwright/test';
import { openApp, tab, SIZES } from './helpers.js';
import { spy, seedTasks, T } from './task-helpers.js';

// 期限切れ＋今日の未完了を over 件、他に完了・先の予定を Duo 内保存へ seed（band が起動後に入れる）。native は偽装のみ。
const PEND = new WeakMap();
async function mock(page, over = 3) {
  await spy(page);
  const day = (off) => { const d = new Date(2026, 10, 12 + off); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const L = [];
  const T1 = (id, title, due, o = {}) => L.push(T(id, { title, due, order: L.length + 1, createdAt: L.length + 1, updatedAt: L.length + 1, ...o }));
  for (let i = 0; i < over; i++) T1(`o${i}`, `対象${i}`, { date: day(i % 2 ? 0 : -1 - (i % 5)) });
  T1('soon', '先', { date: day(3) }); T1('nd', 'なし', null); T1('dn', '済', { date: day(0) }, { done: true, doneAt: `${day(0)}T08:00` });
  PEND.set(page, L);
}
const setSafe = (page, r) => page.evaluate((r) => { const s = document.documentElement.style; s.setProperty('--sar', `${r}px`); }, r);
const band = async (page, size, r = 84) => { await openApp(page, size); if (PEND.get(page)?.length) await seedTasks(page, PEND.get(page)); await setSafe(page, r); await page.waitForTimeout(80); };
const sb = (page, id) => page.locator(`.ctl [data-strip="${id}"]`);
const near = (a, b, tol = 0.8) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const names = (page) => page.locator('.ctl button').evaluateAll((e) => e.map((b) => b.dataset.act + (b.dataset.strip ? `:${b.dataset.strip}` : '')));

test.describe('閉じた画面の帯', () => {
  test('6項目が指定の順・位置（丸48・当たり56）、全は帯にない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    expect(await names(page)).toEqual(['menu', 'search', 'strip:task', 'strip:memo', 'today', 'add']);
    const want = { task: 418, memo: 478 };
    for (const [id, top] of Object.entries(want)) {
      const r = await sb(page, id).boundingBox();
      near(r.width, 56); near(r.height, 56); near(r.y, top - 4); near(r.x + 28, 466 - 42);
      const v = await sb(page, id).locator('.bi').boundingBox();
      near(v.width, 48); near(v.height, 48);
    }
    await expect(page.locator('.ctl [data-act="allmonth"]')).toHaveCount(0);
    // 全は月ヘッダーへ。押すと全部表示、状態を保つ
    const all = page.locator('.mph [data-act="allmonth"]');
    await expect(all).toHaveCount(1);
    await all.click();
    await expect(page.locator('.scroll.all')).toBeVisible();
    await tab(page, '週').click(); await tab(page, '月').click();
    await expect(page.locator('.scroll.all')).toBeVisible();
  });

  test('たたくと全面にタスク、タブは未選択、再押下とタブで戻る。日付・表示は上書きしない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await tab(page, '週').click();
    const before = await page.evaluate(() => localStorage.getItem('duo.ui.v1'));
    expect(before).toBeTruthy();
    await sb(page, 'task').click();
    await expect(page.locator('.stripp[data-page="task"]')).toBeVisible();
    await expect(sb(page, 'task')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.tabs [aria-pressed="true"]').count()).toBe(0);
    await expect(page.locator('.stripp [data-key="rm:o0"]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('duo.ui.v1'))).toBe(before);
    await sb(page, 'task').click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
    await sb(page, 'task').click();
    await tab(page, '月').click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true');
  });

  test('ノートの入口: タスクからノートへ直接移れる。日付は動かさず、再押下で戻る', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await tab(page, '日').click();
    await page.locator('[data-act="next"]').first().click();
    await page.locator('[data-act="next"]').first().click();
    await sb(page, 'task').click();
    await sb(page, 'memo').click();
    await expect(page.locator('.stripp[data-page="memo"] [data-act="notenew"]')).toBeVisible();
    await expect(page.locator('.stripp h2')).toHaveText('ノート');
    await expect(sb(page, 'memo')).toHaveAttribute('aria-pressed', 'true');
    await expect(sb(page, 'task')).toHaveAttribute('aria-pressed', 'false');
    await sb(page, 'memo').click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expect(page.locator('#ctitle')).toContainText('14'); // ノートは日付を動かさない
  });

  test('帯のノートに「今日のメモあり」の印はない。入口の名前は「ノート」', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await page.evaluate(async () => { const d = await import('/js/db.js'); await d.putMemo('2026-11-12', '買い物'); await d.migrateNotesOnce(); });
    await expect(sb(page, 'memo')).not.toHaveClass(/has/);
    await expect(sb(page, 'memo')).toHaveAttribute('aria-label', 'ノート');
    await sb(page, 'memo').click();
    await expect(page.locator('.stripp .mrow')).toHaveCount(1);
    await expect(sb(page, 'memo')).not.toHaveClass(/has/);
  });

  test('開いている丸は #DDE7E2 に緑枠', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await sb(page, 'task').click();
    const s = await sb(page, 'task').locator('.bi').evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.boxShadow]; });
    expect(s[0]).toBe('rgb(221, 231, 226)');
    expect(s[1]).toContain('rgb(41, 78, 66)');
  });

  test('長押し0.8秒で名前の吹き出し。離したあとの click で開かない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    const r = await sb(page, 'memo').boundingBox();
    await page.mouse.move(r.x + 28, r.y + 28);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await expect(page.locator('.stip')).toHaveCount(0);
    await page.waitForTimeout(700);
    await expect(page.locator('.stip')).toHaveText('ノート');
    await page.mouse.up();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expect(page.locator('.stip')).toHaveCount(0, { timeout: 3000 });
    await sb(page, 'memo').click();
    await expect(page.locator('.stripp')).toBeVisible();
  });

  test('帯がない（safe=0）画面には入口を足さない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait);
    await expect(page.locator('[data-strip]')).toHaveCount(0);
  });
});

test.describe('バッジ', () => {
  for (const [over, text] of [[0, null], [1, '1'], [99, '99'], [100, '99+']]) {
    test(`期限切れ＋今日の未完了 ${over} 件 → ${text ?? '出さない'}`, async ({ page }) => {
      await mock(page, over);
      await band(page, SIZES.closedPortrait);
      const b = sb(page, 'task');
      if (text === null) {
        await expect(b.locator('.bdg')).toHaveCount(0);
        await expect(b).toHaveAttribute('aria-label', 'タスク');
      } else {
        await expect(b.locator('.bdg')).toHaveText(text);
        await expect(b).toHaveAttribute('aria-label', `タスク、期限切れと今日 ${over}件`);
        const s = await b.locator('.bdg').evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.color, c.fontSize, e.getBoundingClientRect().height]; });
        expect(s).toEqual(['rgb(180, 60, 60)', 'rgb(255, 255, 255)', '10px', 18]);
      }
    });
  }
  test('先の期限・期限なし・完了済みは数えない', async ({ page }) => {
    await mock(page, 2);
    await band(page, SIZES.closedPortrait);
    await expect(sb(page, 'task').locator('.bdg')).toHaveText('2');
  });
});

test.describe('開いた横の帯', () => {
  for (const size of [SIZES.openLandscape, SIZES.openLandscape951]) {
    test(`${size.width}×${size.height}: 6項目（第18版: 見開きの型のボタンが検索とタスクの間に加わる）、右ページを切替・再押下で戻る`, async ({ page }) => {
      await mock(page);
      await band(page, size);
      expect(await names(page)).toEqual(['menu', 'search', 'spreadtype', 'strip:task', 'strip:memo', 'today', 'add']);
      const q = size.height / 669;
      near((await sb(page, 'task').boundingBox()).y, (size.height - 249 * q) - 4);
      near((await sb(page, 'memo').boundingBox()).y, (size.height - 189 * q) - 4);
      const savedPages = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('duo.ui.v1') || '{"pages":null}').pages));
      const pages0 = JSON.stringify({ left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false }); // 保存済みの選択（既定）。入口で書き換えない
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
      await sb(page, 'task').click();
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'task');
      await expect(page.locator('.page.lp')).toHaveAttribute('data-page', 'month');
      await expect(page.locator('.pgr [aria-pressed="true"]')).toHaveText('タスク');
      expect(await savedPages()).toBe(pages0);
      await sb(page, 'memo').click();
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'memo');
      await sb(page, 'memo').click();
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
    });
  }

  test('右ページの切替を押すと一時表示をやめ、その選択になる', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.openLandscape);
    await sb(page, 'task').click();
    await page.locator('.pgr').getByRole('button', { name: '時間', exact: true }).click();
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
    await sb(page, 'memo').click();
    await expect(sb(page, 'memo')).toHaveAttribute('aria-pressed', 'true');
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, 84);
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time'); // 保存されない
  });

  test('左ページがすでにタスクなら強調（0.2秒）だけで右は変わらない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.openLandscape);
    await page.locator('.pgl').getByRole('button', { name: 'タスク', exact: true }).click();
    await expect(page.locator('.page.lp')).toHaveAttribute('data-page', 'task');
    await sb(page, 'task').click();
    await expect(page.locator('.page.lp')).toHaveClass(/flash/);
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
    await expect(sb(page, 'task')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page.lp')).not.toHaveClass(/flash/);
    await sb(page, 'task').click();
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
  });
});

test('開いた縦の上帯には追加せず、下パネルからタスク・メモへ行ける', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('duo.ui.v1')) localStorage.setItem('duo.ui.v1', JSON.stringify({ monthExpand: true })); }); // 第19版 PR6: 下パネルは「全部」の月だけ
  await mock(page);
  await band(page, SIZES.openPortrait, 0);
  await expect(page.locator('[data-strip]')).toHaveCount(0);
  await page.locator('[data-act="pnltoggle"]').click();
  await page.locator('[data-pnl="task"]').click();
  await expect(page.locator('.pnl [data-key="rm:o0"]')).toBeVisible();
  await page.locator('[data-pnl="memo"]').click();
  await expect(page.locator('.pnl [data-act="notenew"]')).toBeVisible();
});

test('帯の姿勢が変わると（開いた横→縦）一時表示は解除される', async ({ page }) => {
  await mock(page);
  await band(page, SIZES.openLandscape);
  await sb(page, 'task').click();
  await page.setViewportSize(SIZES.openPortrait);
  await page.waitForTimeout(150);
  await page.setViewportSize(SIZES.openLandscape);
  await page.waitForTimeout(150);
  await setSafe(page, 84);
  await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
});
