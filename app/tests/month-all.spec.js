import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, seed, ev, tab, layout, SIZES, textInGutter, findTextOverlaps } from './helpers.js';

const day = (n) => `2026-11-${String(n).padStart(2, '0')}`;
// 1日に n 件（10:00 から30分刻み）。
const many = (key, n, pre = 'm') => Array.from({ length: n }, (_, i) => ev(`${pre}${key}-${i}`, `${pre}${key.slice(8)}-${i + 1}`, `${key}T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, `${key}T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '45' : '15'}`));
const modeBtn = (page, name) => page.getByRole('button', { name, exact: true });
const weekH = (page) => page.locator('.week.all').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10));
const scrollTop = (page) => page.locator('.scroll.all').evaluate((el) => el.scrollTop);
async function showAll(page, size = SIZES.closedPortrait) {
  await tab(page, '月').click();
  await modeBtn(page, '全部').click();
  await expect(modeBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scroll.all')).toBeVisible();
  void size;
}

// 11月: 12日に6件、26日に5件、他は少数。複数日の帯（19〜23。月曜始まりでは22|23で週をまたぐ）と週をまたぐ帯（15〜17）。
const SEED = [
  ...many(day(12), 6),
  ...many(day(26), 5, 'q'),
  ev('one', '単発', day(25) + 'T10:00', day(25) + 'T11:00'),
  ev('trip', '出張帯', day(19) + 'T00:00', day(23) + 'T23:59', { all: true }),
  ev('wrap', '週またぎ', day(15) + 'T00:00', day(17) + 'T23:59', { all: true }),
];

test.describe('月「全部」表示', () => {
  test('ヘッダーは「手帳｜予定名｜全部」。手帳・予定名は既存の style に、全部は monthExpand に対応する', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    for (const n of ['手帳', '予定名', '全部']) await expect(modeBtn(page, n)).toBeVisible();
    await expect(modeBtn(page, '手帳')).toHaveAttribute('aria-pressed', 'true');
    await modeBtn(page, '予定名').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ style: 'named', monthExpand: false });
    await modeBtn(page, '全部').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ style: 'named', monthExpand: true });
    await expect(modeBtn(page, '予定名')).toHaveAttribute('aria-pressed', 'false');
    await modeBtn(page, '手帳').click(); // 全部をやめて手帳へ
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ style: 'simple', monthExpand: false });
    await expect(page.locator('.scroll.all')).toHaveCount(0);
  });

  test('1日6件: 5件と「+1」。+1 を押すとその日の日表示へ', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, SEED);
    await showAll(page);
    const strips = page.locator('.week.all .strip');
    await expect(strips.filter({ hasText: /^m12-/ })).toHaveCount(5);
    await expect(strips.filter({ hasText: 'm12-6' })).toHaveCount(0);
    const plus = page.locator('.plus[data-jump="2026-11-12"]');
    await expect(plus).toHaveText('+1');
    // 日付の行（上端24pt以内）の右端
    const dayBox = await page.locator('[data-date="2026-11-12"]').boundingBox();
    const pb = await plus.boundingBox();
    expect(pb.y).toBeGreaterThanOrEqual(dayBox.y - 1);
    expect(pb.y + pb.height).toBeLessThanOrEqual(dayBox.y + 25);
    expect(dayBox.x + dayBox.width - (pb.x + pb.width)).toBeLessThanOrEqual(6);
    expect(await plus.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(11);
    await plus.click();
    await expect(page.locator('#ctitle')).toHaveText('11月12日（木）');
    await expect(page.getByRole('button', { name: '日', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.daylist .event')).toHaveCount(6);
    // 5件ちょうどの日には +N は出ない
    await tab(page, '月').click();
    await expect(page.locator('.plus[data-jump="2026-11-26"]')).toHaveCount(0);
  });

  test('行の高さは週ごとの最大件数で決まる（5件の週は 24+5×18+6=120pt）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [...many(day(12), 6), ...many(day(18), 3, 'r')]);
    await showAll(page);
    const hs = await weekH(page); // 10/26〜 の6週（月曜始まり）: 11/9週=5件, 11/16週=3件
    const weeks = await page.locator('.week.all').evaluateAll((els) => els.map((e) => e.dataset.wk));
    expect(weeks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(hs[2]).toBeGreaterThanOrEqual(120);
    expect(hs[2]).toBeGreaterThan(hs[3]);
    expect(hs[3]).toBeGreaterThanOrEqual(24 + 3 * 18 + 6);
    // 予定の少ない週は「いつもの高さ」（同じ値）のまま
    expect(hs[0]).toBe(hs[1]);
    expect(hs[1]).toBe(hs[4]);
    expect(hs[2]).toBe(120);
    expect(await page.locator('.week.all').nth(2).evaluate((e) => e.style.getPropertyValue('--need'))).toBe('120px');
  });

  test('曜日見出しと下部は固定で、月の部分だけ上下にスクロールする。月は変わらない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [...many(day(12), 6), ...many(day(18), 6, 'r'), ...many(day(25), 6, 's'), ...many(day(2), 6, 't')]);
    await showAll(page);
    const sc = page.locator('.scroll.all');
    expect(await sc.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    const head0 = await page.locator('.weekdays').boundingBox();
    const leg0 = await page.locator('.legend').boundingBox();
    const title = await page.locator('#ctitle').textContent();
    await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
    expect(await page.locator('.weekdays').boundingBox()).toEqual(head0);
    expect(await page.locator('.legend').boundingBox()).toEqual(leg0);
    expect(await page.locator('#ctitle').textContent()).toBe(title);
    // 最後の週が見える（スクロール領域の内側）
    const last = await page.locator('.week.all').last().boundingBox();
    const scb = await sc.boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(scb.y + scb.height + 1);
    // 文書全体はスクロールしない
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });

  test('見えている週と前後1週だけ描く（行の高さは先に確保され、描画してもスクロール位置はずれない）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [...many(day(12), 5), ...many(day(18), 5, 'r'), ...many(day(25), 5, 's'), ...many(day(2), 5, 't'), ...many(day(4), 5, 'u'), ...many(day(30), 5, 'v')]);
    await showAll(page);
    const drawn = () => page.locator('.week.all').evaluateAll((els) => els.map((e) => (e.dataset.drawn ? 1 : 0)).join(''));
    const d0 = await drawn();
    expect(d0.length).toBe(6);
    expect(d0.split('').filter((x) => x === '1').length).toBeLessThan(6);
    expect(d0.startsWith('1')).toBe(true);
    // 高さは描画の有無に関係なく同じ（空の行も確保済み）
    const h0 = await weekH(page);
    expect(h0.filter((h) => h >= 120).length).toBeGreaterThanOrEqual(4);
    await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect.poll(drawn).toMatch(/1$/);
    expect(await drawn()).not.toBe(d0);
    expect(await weekH(page)).toEqual(h0);
  });

  test('開閉・向き変更・再読み込みでモードが保たれ、開閉・向き変更では見えていた週が保たれる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [...many(day(12), 5), ...many(day(18), 5, 'r'), ...many(day(25), 5, 's'), ...many(day(2), 5, 't'), ...many(day(4), 5, 'u'), ...many(day(30), 5, 'v')]);
    await showAll(page);
    // 見えている先頭の週（スクロール領域の上端にかかる週）を調べる
    const firstWeek = () => page.locator('.scroll.all').evaluate((sc) => {
      const r = sc.getBoundingClientRect();
      for (const w of sc.children) if (w.getBoundingClientRect().bottom > r.top + 2) return w.dataset.wk;
      return '';
    });
    await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.querySelector('[data-wk="2026-11-09"]').offsetTop + 40; });
    await expect.poll(firstWeek).toBe('2026-11-09');
    // 位置はスクロールイベント（フレームごと）で記録されるので、実際の操作と同じく1フレーム待ってから開閉する
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // 開いた縦（予定名｜全部）
    await page.setViewportSize(SIZES.openPortrait);
    await expect.poll(() => layout(page)).toBe('open');
    await expect(modeBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.scroll.all')).toBeVisible();
    { const w = await firstWeek(); expect(w).toBe('2026-11-09'); }
    // 開いた横（見開き）
    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('spread');
    await expect(modeBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
    expect(await firstWeek()).toBe('2026-11-09');
    // 閉じた横
    await page.setViewportSize(SIZES.closedLandscape);
    await expect.poll(() => layout(page)).toBe('browse');
    await expect(modeBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
    expect(await firstWeek()).toBe('2026-11-09');
    // 閉じた縦へ戻す
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    expect(await firstWeek()).toBe('2026-11-09');
    // 再読み込み（モードは保たれる）
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(modeBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.scroll.all')).toBeVisible();
  });

  test('バックアップの往復でモード（monthExpand）と週の始まりが保たれる', async ({ page }, info) => {
    await openApp(page, SIZES.closedPortrait, '?ns=mall&nosw');
    await tab(page, '月').click();
    await modeBtn(page, '全部').click();
    await page.getByRole('button', { name: 'その他' }).click();
    await page.getByRole('button', { name: /^週の始まり/ }).click(); // 日曜へ
    const open = async () => { await page.getByRole('button', { name: 'その他' }).click(); await page.getByRole('button', { name: 'バックアップ' }).click(); };
    await open();
    const p = info.outputPath('mall.json');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
    await dl.saveAs(p);
    expect(JSON.parse(readFileSync(p, 'utf8')).settings).toMatchObject({ monthExpand: true, weekStart: 0 });
    // 別の保存領域（既定の月曜・手帳）へ置き換え読み込み
    await openApp(page, SIZES.closedPortrait, '?ns=mall2&nosw');
    await tab(page, '月').click();
    await expect(modeBtn(page, '手帳')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.weekdays span').first()).toHaveText('月');
    await open();
    await page.setInputFiles('#bk-file', p);
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    await expect(modeBtn(page, '全部')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.weekdays span').first()).toHaveText('日');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1.mall2')))).toMatchObject({ monthExpand: true, weekStart: 0 });
  });

  test('複数日の帯がずれない: 帯と単日の短冊は同じレーンに重ならず、列に沿う', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, SEED);
    await showAll(page);
    const bars = await page.locator('.week.all .bar').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height, wk: e.closest('.week').dataset.wk }; }));
    const trip = bars.find((b) => b.t.includes('出張帯'));
    const wrapA = bars.filter((b) => b.t.includes('週またぎ'));
    expect(trip).toBeTruthy();
    expect(wrapA.length).toBe(2); // 11/15(日)〜11/17: 月曜始まりでは週の境目で2本
    expect(wrapA[0].t).toContain('→');
    expect(wrapA[1].t).toContain('←');
    // 帯は週の上端から 24 + lane*18 のレーン位置
    const wkTop = async (wk) => (await page.locator(`.week.all[data-wk="${wk}"]`).boundingBox()).y;
    for (const b of [trip, ...wrapA]) expect(((b.y - (await wkTop(b.wk)) - 24) % 18 + 18) % 18).toBeLessThan(1.01);
    // 同じ週の中で、帯と短冊が重ならない
    const items = await page.locator('.week.all .bar, .week.all .strip').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { wk: e.closest('.week').dataset.wk, l: r.left, r: r.right, t: r.top, b: r.bottom, n: e.textContent.trim() }; }));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.wk !== c.wk) continue;
      const overlap = Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1;
      expect(overlap, `${a.n} と ${c.n}`).toBe(false);
    }
    // 帯の左右端は列の境目（セル幅の整数倍 + 2px）に合う
    const grid = await page.locator('.week.all').first().boundingBox();
    const cw = grid.width / 7;
    expect(Math.abs((trip.x - grid.x - 2) / cw - Math.round((trip.x - grid.x - 2) / cw))).toBeLessThan(0.02);
    expect(Math.abs(trip.w / cw - 4)).toBeLessThan(0.1); // 19(木)〜22(日) の4日。23(月)は次の週の帯
    expect(bars.filter((b) => b.t.includes('出張帯')).length).toBe(2);
    expect(await findTextOverlaps(page)).toEqual([]);
  });

  test('1日10件×31日の描画が 50ms 未満', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    const list = [];
    for (let d = 1; d <= 30; d++) list.push(...many(day(d), 10, `p${d}_`));
    list.push(...many('2026-11-30', 10, 'z'));
    await seed(page, list.map((e, i) => ({ ...e, id: `perf${i}` })));
    await tab(page, '月').click();
    // 全部へ切り替える1回の描画（クリックの同期処理）を計測。中央値で判定。
    const ms = await page.evaluate(() => {
      const click = (n) => [...document.querySelectorAll('.variant button')].find((b) => b.textContent === n).click();
      const out = [];
      for (let i = 0; i < 5; i++) { click('予定名'); const t = performance.now(); click('全部'); out.push(performance.now() - t); }
      return out.sort((a, b) => a - b);
    });
    expect(ms[2]).toBeLessThan(50);
    // 月を送っても（占有率が高い月でも）同様
    const ms2 = await page.evaluate(() => { const b = document.querySelector('[data-act="next"]'); const t = performance.now(); b.click(); return performance.now() - t; });
    expect(ms2).toBeLessThan(50);
  });

  test('折り目 x=425〜465 に文字が入らない（見開きの全部）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await seed(page, [...SEED, ...many(day(13), 8, 'w')]);
    expect(await layout(page)).toBe('spread');
    await modeBtn(page, '全部').click();
    await expect(page.locator('.scroll.all')).toBeVisible();
    expect(await textInGutter(page)).toEqual([]);
    const pg = await page.locator('.page.calendar').boundingBox();
    expect(pg.x + pg.width).toBeLessThanOrEqual(425);
    for (const b of await page.locator('.week.all .strip, .week.all .bar, .week.all .plus').all()) {
      const r = await b.boundingBox();
      expect(r.x + r.width).toBeLessThanOrEqual(425 + 0.5);
    }
    // 上下にスクロールしても同じ
    await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    expect(await textInGutter(page)).toEqual([]);
  });
});

test.describe('週の始まり（月曜が既定）', () => {
  for (const [name, y, m] of [['2026年11月（6週）', 0, 0], ['2027年2月（4週）', 3, 0]]) {
    for (const mode of ['手帳', '予定名', '全部']) {
      test(`月曜始まり ${name} ${mode}: グリッドの下が空かない`, async ({ page }) => {
        await openApp(page, SIZES.closedPortrait);
        await tab(page, '月').click();
        for (let i = 0; i < y; i++) await page.getByRole('button', { name: '次の月' }).click();
        void m;
        await modeBtn(page, mode).click();
        await expect(page.locator('.weekdays span')).toHaveText(['月', '火', '水', '木', '金', '土', '日']);
        const weeks = page.locator('.week');
        await expect(weeks).toHaveCount(y ? 4 : 6);
        const first = await page.locator('.week').first().locator('.day').first().getAttribute('data-date');
        expect(first).toBe(y ? '2027-02-01' : '2026-10-26');
        const sc = await page.locator('.calendar .scroll').boundingBox();
        const last = await weeks.last().boundingBox();
        const bottom = last.y + last.height;
        // 末尾の週がスクロール領域の下端に届く（4週で余るときは行が伸びて埋める）。あふれるときはスクロール。
        expect(bottom).toBeGreaterThanOrEqual(sc.y + sc.height - 1);
      });
    }
  }

  test('開いた縦（予定名・全部）でも月曜始まりの月は下が空かない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '次の月' }).click(); // 2027年2月
    for (const mode of ['予定名', '全部']) {
      await modeBtn(page, mode).click();
      await expect(page.locator('#ctitle')).toHaveText('2027年 2月');
      await expect(page.locator('.week')).toHaveCount(4);
      const sc = await page.locator('.calendar .scroll').boundingBox();
      const last = await page.locator('.week').last().boundingBox();
      expect(Math.abs(last.y + last.height - (sc.y + sc.height))).toBeLessThanOrEqual(1);
    }
  });

  test('設定で日曜始まりに切り替え: 見出し・月グリッド・週表示・保存', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await page.getByRole('button', { name: 'その他' }).click();
    await expect(page.getByRole('button', { name: /^週の始まり: 月曜/ })).toBeVisible();
    await page.getByRole('button', { name: /^週の始まり/ }).click();
    await expect(page.locator('.weekdays span')).toHaveText(['日', '月', '火', '水', '木', '金', '土']);
    await expect(page.locator('.week')).toHaveCount(5); // 2026年11月は日曜始まりで5週
    expect(await page.locator('.week').first().locator('.day').first().getAttribute('data-date')).toBe('2026-11-01');
    await tab(page, '週').click();
    await expect(page.locator('#ctitle')).toHaveText('11月8日〜11月14日');
    // 保存: 再読み込み後も日曜始まり
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    await expect(page.locator('.weekdays span').first()).toHaveText('日');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).weekStart)).toBe(0);
    // 月曜へ戻す
    await page.getByRole('button', { name: 'その他' }).click();
    await expect(page.getByRole('button', { name: /^週の始まり: 日曜/ })).toBeVisible();
    await page.getByRole('button', { name: /^週の始まり/ }).click();
    await expect(page.locator('.weekdays span').first()).toHaveText('月');
  });

  test('週表示・月の範囲表示は月曜起点（既定）', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await tab(page, '週').click();
    await expect(page.locator('#ctitle')).toHaveText('11月9日〜11月15日');
    await expect(page.locator('.weekrow .wd').first()).toContainText('9（月）');
    await expect(page.locator('.weekrow .wd').last()).toContainText('15（日）');
  });
});
