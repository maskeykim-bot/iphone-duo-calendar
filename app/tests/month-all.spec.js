import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, seed, ev, tab, layout, SIZES, textInGutter, findTextOverlaps, setStyle, modeStates, openMenu, monthFormInit } from './helpers.js';

const day = (n) => `2026-11-${String(n).padStart(2, '0')}`;
// 1日に n 件（10:00 から30分刻み）。
const many = (key, n, pre = 'm') => Array.from({ length: n }, (_, i) => ev(`${pre}${key}-${i}`, `${pre}${key.slice(8)}-${i + 1}`, `${key}T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, `${key}T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '45' : '15'}`));
const weekH = (page) => page.locator('.week.all').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 10) / 10));
const scrollTop = (page) => page.locator('.scroll.all').evaluate((el) => el.scrollTop);
async function showAll(page, size = SIZES.closedPortrait) {
  await tab(page, '月').click();
  await setStyle(page, '全部');
  expect((await modeStates(page))['全部']).toBe(true);
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
  test('設定の「月の表現」は「手帳｜予定名｜全部」。手帳・予定名は既存の style に、全部は monthExpand に対応する', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    expect(Object.keys(await modeStates(page))).toEqual(['手帳', '予定名', '全部']); // 入口は設定の「月の表現」
    expect((await modeStates(page))['予定名']).toBe(true); // 第19.1版 H-04: 新しい端末の既定は予定名
    await setStyle(page, '予定名');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ style: 'named', monthExpand: false });
    await setStyle(page, '全部');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ style: 'named', monthExpand: true });
    expect((await modeStates(page))['予定名']).toBe(false);
    await setStyle(page, '手帳'); // 全部をやめて手帳へ
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
    const plus = page.locator('.plus[data-plus="2026-11-12"]');
    await expect(plus).toHaveText('+1');
    // 日付の行（上端18px）の右端に数字。V-03: +N 自体は押す的にしない（span・pointer-events:none）。マスをたたけばその日（日セルが 44 を満たす）
    const dayBox = await page.locator('[data-date="2026-11-12"]').boundingBox();
    const pb = await plus.boundingBox();
    expect(Math.abs(pb.y - dayBox.y)).toBeLessThanOrEqual(1);
    expect(await plus.evaluate((e) => [e.tagName, getComputedStyle(e).pointerEvents])).toEqual(['SPAN', 'none']);
    expect(Math.abs(dayBox.x + dayBox.width - (pb.x + pb.width))).toBeLessThanOrEqual(1);
    expect(await plus.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(8); // 閉じた画面（マス 52.3）は 8pt W6（design/33 §5）
    const glyph = await plus.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
    expect(glyph.bottom - dayBox.y).toBeLessThanOrEqual(19);
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: dayBox.width - 8, y: 9 } }); // V-03: +N の上をたたく＝マスをたたく
    await expect(page.locator('#ctitle')).toHaveText('11月12日（木）先勝');
    await expect(page.getByRole('button', { name: '日', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tlev')).toHaveCount(6);
    // 5件ちょうどの日には +N は出ない
    await tab(page, '月').click();
    await expect(page.locator('.plus[data-plus="2026-11-26"]')).toHaveCount(0);
  });

  test('行の高さは週ごとの最大件数で決まる（5件の週は 18+5×16+2=100pt）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [...many(day(12), 6), ...many(day(18), 3, 'r')]);
    await showAll(page);
    const hs = await weekH(page); // 10/26〜 の6週（月曜始まり）: 11/9週=5件, 11/16週=3件
    const weeks = await page.locator('.week.all').evaluateAll((els) => els.map((e) => e.dataset.wk));
    expect(weeks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(hs[2]).toBeGreaterThanOrEqual(100);
    expect(hs[2]).toBeGreaterThan(hs[3]);
    expect(hs[3]).toBeGreaterThanOrEqual(18 + 3 * 16 + 2);
    // 予定の少ない週は「いつもの高さ」（同じ値）のまま
    expect(hs[0]).toBe(hs[1]);
    expect(hs[1]).toBe(hs[4]);
    expect(hs[2]).toBe(100);
    expect(await page.locator('.week.all').nth(2).evaluate((e) => e.style.getPropertyValue('--need'))).toBe('100px');
  });

  test('曜日見出しと下部は固定で、月の部分だけ上下にスクロールする。月は変わらない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [...many(day(12), 6), ...many(day(18), 6, 'r'), ...many(day(25), 6, 's'), ...many(day(2), 6, 't')]);
    await showAll(page);
    const sc = page.locator('.scroll.all');
    expect(await sc.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    const head0 = await page.locator('.weekdays').boundingBox();
    const leg0 = await page.locator('.tabs').boundingBox();
    const title = await page.locator('#ctitle').textContent();
    await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(40);
    expect(await page.locator('.weekdays').boundingBox()).toEqual(head0);
    expect(await page.locator('.tabs').boundingBox()).toEqual(leg0);
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
    // 期待: 見えている週と前後1週（小さい月では全週が描かれることもある）
    const expected = () => page.locator('.scroll.all').evaluate((sc) => {
      const r = sc.getBoundingClientRect(), rows = [...sc.children];
      const vis = rows.map((w) => { const b = w.getBoundingClientRect(); return b.bottom > r.top && b.top < r.bottom; });
      const a = vis.indexOf(true), z = vis.lastIndexOf(true);
      return rows.map((_, i) => (i >= a - 1 && i <= z + 1 ? 1 : 0)).join('');
    });
    const d0 = await drawn();
    expect(d0.length).toBe(6);
    expect(d0).toBe(await expected());
    expect(d0.startsWith('1')).toBe(true);
    // 高さは描画の有無に関係なく同じ（空の行も確保済み）
    const h0 = await weekH(page);
    expect(h0.filter((h) => h >= 100).length).toBeGreaterThanOrEqual(4);
    await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect.poll(drawn).toMatch(/1$/);
    await expect.poll(async () => (await drawn()) === (await expected())).toBe(true); // 描画はスクロール後のフレームで追随する
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
    // 閉じた画面は月の高さが基準寸法に固定され、スクロールできる量は少ない。末尾までスクロールして、その時に見えている先頭の週を基準にする。
    await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(20);
    await expect.poll(async () => { const a = await firstWeek(); await page.waitForTimeout(100); return a === (await firstWeek()); }).toBe(true);
    const WK = await firstWeek();
    // 位置はスクロールイベント（フレームごと）で記録されるので、実際の操作と同じく1フレーム待ってから開閉する
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // 開いた縦（予定名｜全部）
    await page.setViewportSize(SIZES.openPortrait);
    await expect.poll(() => layout(page)).toBe('open');
    expect((await modeStates(page))['全部']).toBe(true);
    await expect(page.locator('.scroll.all')).toBeVisible();
    // 週の高さは必要高（19+段×16+2）まで縮むので、小さい月では先頭までスクロールできない（保持可能な範囲で維持）。
    // そのため「見えていた週が引き続き見えている」ことを確かめる。
    const visible = (wk) => page.locator('.scroll.all').evaluate((sc, k) => {
      const r = sc.getBoundingClientRect(), b = sc.querySelector(`[data-wk="${k}"]`).getBoundingClientRect();
      return b.bottom > r.top + 2 && b.top < r.bottom - 2;
    }, wk);
    await expect.poll(() => visible(WK)).toBe(true);
    // 開いた横（見開き）
    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('spread');
    expect((await modeStates(page))['全部']).toBe(true);
    await expect.poll(() => visible(WK)).toBe(true);
    // 閉じた横
    await page.setViewportSize(SIZES.closedLandscape);
    await expect.poll(() => layout(page)).toBe('browse');
    expect((await modeStates(page))['全部']).toBe(true);
    await expect.poll(() => visible(WK)).toBe(true);
    // 閉じた縦へ戻す
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    await expect.poll(() => visible(WK)).toBe(true);
    // 再読み込み（モードは保たれる）
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    expect((await modeStates(page))['全部']).toBe(true);
    await expect(page.locator('.scroll.all')).toBeVisible();
  });

  test('バックアップの往復でモード（monthExpand）と週の始まりが保たれる', async ({ page }, info) => {
    await openApp(page, SIZES.closedPortrait, '?ns=mall&nosw');
    await tab(page, '月').click();
    await setStyle(page, '全部');
    await openMenu(page, 'general');
    await page.getByRole('button', { name: /^週の始まり/ }).click(); // 日曜へ
    await expect(page.locator('#menu')).toBeHidden(); // 選んで閉じる動き（0.25秒）が終わってから
    const open = async () => { await expect(page.locator('#backup')).toBeHidden(); await page.getByRole('button', { name: '設定' }).click(); await page.getByRole('button', { name: 'バックアップ' }).click(); };
    await open();
    const p = info.outputPath('mall.json');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
    await dl.saveAs(p);
    expect(JSON.parse(readFileSync(p, 'utf8')).settings).toMatchObject({ monthExpand: true, weekStart: 0 });
    // 別の保存領域（既定の月曜・手帳）へ置き換え読み込み
    await openApp(page, SIZES.closedPortrait, '?ns=mall2&nosw');
    await tab(page, '月').click();
    expect((await modeStates(page))['予定名']).toBe(true); // 第19.1版 H-04: 新しい端末の既定は予定名
    await expect(page.locator('.weekdays span').first()).toHaveText('月');
    await open();
    await page.setInputFiles('#bk-file', p);
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await modeStates(page))['全部']).toBe(true);
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
    for (const b of wrapA) expect(b.t).toBe('週またぎ'); // 矢印なし。週ごとに分割して各週で題名を中央に置く
    // 帯は週の上端から 19 + lane*16 のレーン位置
    const wkTop = async (wk) => (await page.locator(`.week.all[data-wk="${wk}"]`).boundingBox()).y;
    for (const b of [trip, ...wrapA]) expect(((b.y - (await wkTop(b.wk)) - 18) % 16 + 16) % 16).toBeLessThan(1.01);
    // 同じ週の中で、帯と短冊が重ならない
    const items = await page.locator('.week.all .bar, .week.all .strip').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { wk: e.closest('.week').dataset.wk, l: r.left, r: r.right, t: r.top, b: r.bottom, n: e.textContent.trim() }; }));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], c = items[j];
      if (a.wk !== c.wk) continue;
      const overlap = Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1;
      expect(overlap, `${a.n} と ${c.n}`).toBe(false);
    }
    // 帯のボタンは列の境目に合う（線は内側1px）
    const grid = await page.locator('.week.all').first().boundingBox();
    const cw = grid.width / 7;
    expect(Math.abs((trip.x - grid.x) / cw - Math.round((trip.x - grid.x) / cw))).toBeLessThan(0.02);
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
    await openMenu(page, 'display');
    await page.locator('#menu').getByRole('button', { name: '月の表現', exact: true }).click();
    // 全部へ切り替える1回の描画（クリックの同期処理）を計測。中央値で判定。
    const ms = await page.evaluate(() => {
      const click = (n) => [...document.querySelectorAll('#m-variant button')].find((b) => b.textContent === n).click();
      const out = [];
      for (let i = 0; i < 5; i++) { click('予定名'); const t = performance.now(); click('全部'); out.push(performance.now() - t); }
      return out.sort((a, b) => a - b);
    });
    expect(ms[2]).toBeLessThan(50);
    // 月を送っても（占有率が高い月でも）同様
    const ms2 = await page.evaluate(() => { const b = document.querySelector('[data-act="next"]'); const t = performance.now(); b.click(); return performance.now() - t; });
    expect(ms2).toBeLessThan(50);
  });

  test('折り目（中心±10）に文字が入らない（見開きの全部）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await seed(page, [...SEED, ...many(day(13), 8, 'w')]);
    expect(await layout(page)).toBe('spread');
    await setStyle(page, '全部');
    await expect(page.locator('.scroll.all')).toBeVisible();
    expect(await textInGutter(page)).toEqual([]);
    const pg = await page.locator('.page.calendar').boundingBox();
    expect(pg.x + pg.width).toBeLessThanOrEqual(890 / 2 - 10 + 0.5);
    for (const b of await page.locator('.week.all .strip, .week.all .bar, .week.all .plus').all()) {
      const r = await b.boundingBox();
      expect(r.x + r.width).toBeLessThanOrEqual(890 / 2 - 10 + 0.5);
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
        await monthFormInit(page); // 第19版 PR6: 閉じた画面の月は「月を引く画面」。手帳・予定名は「月」の型（6行×64）で見る
        await openApp(page, SIZES.closedPortrait);
        await tab(page, '月').click();
        for (let i = 0; i < y; i++) await page.getByRole('button', { name: '次の月' }).click();
        void m;
        await setStyle(page, mode);
        await expect(page.locator('.weekdays span')).toHaveText(['月', '火', '水', '木', '金', '土', '日']);
        if (mode !== '全部') {
          const weeks = page.locator('.mgrid .week');
          await expect(weeks).toHaveCount(6); // 4週の月も後ろの週で6行にそろえる
          expect(await weeks.first().locator('.day').first().getAttribute('data-date')).toBe(y ? '2027-02-01' : '2026-10-26');
          const top = (await weeks.first().boundingBox()).y, last = await weeks.last().boundingBox();
          expect(Math.abs(last.y + last.height - (top + 516))).toBeLessThanOrEqual(1); // 第19.2版 S11b: 閉じた画面の段1は6行×86＝H516（design/34 §2.2・spec-values STAGES[1]。旧 design/33 §1 の6行×64は34で置き換わる★）
          return;
        }
        const weeks = page.locator('.week');
        await expect(weeks).toHaveCount(y ? 4 : 6);
        const first = await page.locator('.week').first().locator('.day').first().getAttribute('data-date');
        expect(first).toBe(y ? '2027-02-01' : '2026-10-26');
        // 閉じた画面の月グリッドは基準の高さ G（--grid-h）を週数で等分する。末尾の週の下端が曜日の下 + G に届く（4週でも埋める）。
        const G = await page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue('--grid-h')));
        const top = (await weeks.first().boundingBox()).y;
        const last = await weeks.last().boundingBox();
        expect(last.y + last.height).toBeGreaterThanOrEqual(top + G - 1);
      });
    }
  }

  test('開いた縦（予定名・全部）でも月曜始まりの月は下が空かない', async ({ page }) => {
    await monthFormInit(page); // 第19版 PR6: 予定名は月を引く画面（月の型は6行で297）、全部は従来の月
    await openApp(page, SIZES.openPortrait);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '次の月' }).click(); // 2027年2月
    await setStyle(page, '予定名');
    await expect(page.locator('#ctitle')).toHaveText('2027年 2月');
    await expect(page.locator('.mgrid .week')).toHaveCount(6);
    const g = await page.locator('.mgrid').boundingBox(), l = await page.locator('.mgrid .week').last().boundingBox();
    expect(l.y + l.height).toBeGreaterThanOrEqual(g.y + g.height - 1);
    await setStyle(page, '全部');
    await expect(page.locator('#ctitle')).toHaveText('2027年 2月');
    await expect(page.locator('.scroll.all .week')).toHaveCount(4);
    // 第19.1版 S2: 開いた縦の「全部」は紙を上の窓・下の窓で見る。末尾の週は下の窓（.alwin.alb）の中
    const win = await page.locator('.alwin.alb').count();
    const sc = await page.locator(win ? '.alwin.alb' : '.calendar .scroll').boundingBox();
    const last = await page.locator(win ? '.allb .week' : '.week').last().boundingBox();
    // 末尾の週がスクロール領域の下端に届く（余るときは行が伸びて埋める。必要高が上回るときは内部スクロール）
    expect(last.y + last.height).toBeGreaterThanOrEqual(sc.y + sc.height - 1);
  });

  test('設定で日曜始まりに切り替え: 見出し・月グリッド・週表示・保存', async ({ page }) => {
    await monthFormInit(page);
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await openMenu(page, 'general');
    await expect(page.getByRole('button', { name: /^週の始まり: 月曜/ })).toBeVisible();
    await page.getByRole('button', { name: /^週の始まり/ }).click();
    await expect(page.locator('.weekdays span')).toHaveText(['日', '月', '火', '水', '木', '金', '土']);
    await expect(page.locator('.mgrid .week')).toHaveCount(6); // 月の型は常に6行（日曜始まりの11月は5週＋翌週）
    expect(await page.locator('.week').first().locator('.day').first().getAttribute('data-date')).toBe('2026-11-01');
    await tab(page, '週').click();
    await expect(page.locator('#ctitle')).toHaveText('11月8日〜14日'); // 閉じた画面の週は同じ月なら後ろの月を省く（第19版 PR5）
    // 保存: 再読み込み後も日曜始まり
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    await expect(page.locator('.weekdays span').first()).toHaveText('日');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).weekStart)).toBe(0);
    // 月曜へ戻す
    await openMenu(page, 'general');
    await expect(page.getByRole('button', { name: /^週の始まり: 日曜/ })).toBeVisible();
    await page.getByRole('button', { name: /^週の始まり/ }).click();
    await expect(page.locator('.weekdays span').first()).toHaveText('月');
  });

  test('週表示・月の範囲表示は月曜起点（既定）', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await tab(page, '週').click();
    await expect(page.locator('#ctitle')).toHaveText('11月9日〜15日'); // 第19版 PR7: 開いた縦の週は 1枚の紙・2つの窓（日付の行は 月〜日）
    await expect(page.locator('.fdates .fdt').first()).toContainText('月9');
    await expect(page.locator('.fdates .fdt').last()).toContainText('日15');
  });
});

test.describe('開いた横の「全」は1日5件', () => {
  for (const size of [{ width: 951, height: 669 }, { width: 890, height: 626 }]) {
    test(`${size.width}x${size.height}: 7件の日は5件+「+2」。内部スクロールで最終週へ。オフで元の段数`, async ({ page }) => {
      await openApp(page, size);
      await seed(page, many(day(12), 7));
      expect(await layout(page)).toBe('spread');
      const offStrips = async () => page.locator('.week.named [data-date="2026-11-12"] .strip, .week.simple [data-date="2026-11-12"] .strip').count();
      await setStyle(page, '予定名');
      const before = await offStrips();
      expect(before).toBeLessThan(5);
      await setStyle(page, '全部');
      const sc = page.locator('.scroll.all');
      await expect(sc).toBeVisible();
      await expect(page.locator('.week.all .strip').filter({ hasText: /^m12-/ })).toHaveCount(5);
      await expect(page.locator('.plus[data-plus="2026-11-12"]')).toHaveText('+2');
      const m = await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; const r = e.getBoundingClientRect(); return { sh: e.scrollHeight, ch: e.clientHeight, bottom: r.bottom }; });
      expect(m.sh).toBeGreaterThan(m.ch);
      const last = await page.locator('.week.all').last().boundingBox();
      expect(last.y + last.height).toBeLessThanOrEqual(m.bottom + 1);
      const tabs = await page.locator('[data-pick="month"][data-side="left"]').boundingBox();
      if (tabs) expect(m.bottom).toBeLessThanOrEqual(tabs.y + 0.5);
      await setStyle(page, '予定名');
      await expect(page.locator('.scroll.all')).toHaveCount(0);
      expect(await offStrips()).toBe(before);
    });
  }
});

// ---- 第15版 PR20: 月の「全」の品質条件 AE-1〜5（実DOMの測定） ----
const setUi = async (page, patch) => {
  await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, ...p })); }, patch);
  await page.reload(); await page.waitForSelector('html[data-ready]');
};
// 描いた短冊・帯が自分の週の枠に収まり、同じ週で重ならないこと。末週が内部スクロールで下端まで届くこと。
async function measureAll(page) {
  const sc = page.locator('.scroll.all').first();
  await expect(sc).toBeVisible();
  const out = { weeks: [], last: null };
  const n = await sc.locator('.week.all').count();
  for (let i = 0; i < n; i++) { // 週ごとにスクロールして描かせ、測る
    await sc.evaluate((e, k) => { const w = e.children[k]; e.scrollTop = w.offsetTop; }, i);
    await expect(sc.locator('.week.all').nth(i).locator('.day').first()).toBeVisible();
    out.weeks.push(await sc.locator('.week.all').nth(i).evaluate((w) => {
      const wr = w.getBoundingClientRect(), its = [...w.querySelectorAll('.bar,.strip')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
      const lanes = new Set(its.map((r) => Math.round(r.t - wr.top))).size;
      let overlap = false;
      for (let a = 0; a < its.length; a++) for (let c = a + 1; c < its.length; c++) if (Math.min(its[a].r, its[c].r) - Math.max(its[a].l, its[c].l) > 1 && Math.min(its[a].b, its[c].b) - Math.max(its[a].t, its[c].t) > 1) overlap = true;
      return { h: wr.height, inside: its.every((r) => r.b <= wr.bottom + 0.5), lanes, overlap, strips: w.querySelectorAll('.strip').length, bars: w.querySelectorAll('.bar').length };
    }));
  }
  await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  out.last = await sc.evaluate((e) => {
    const b = document.querySelector('.alwin.alb'); // 開いた縦（第19.1版 S2）: 末週は下の窓にある。紙が窓の合計より長い分だけスクロールできる
    if (b) { const r = b.getBoundingClientRect(), w = document.querySelector('.allb').lastElementChild.lastElementChild.getBoundingClientRect(); return { gap: r.bottom - w.bottom, over: e.scrollHeight - e.clientHeight - b.clientHeight }; }
    const r = e.getBoundingClientRect(), w = e.lastElementChild.getBoundingClientRect(); return { gap: r.bottom - w.bottom, over: e.scrollHeight - e.clientHeight };
  });
  return out;
}
const AE_SEED = [
  ...many(day(12), 7), // 通常 5 / 大 4 を超える日
  ...many(day(26), 6, 'q'), // 6週月では最終週近く
  ...many(day(30), 7, 'z'), // 月曜始まりの6週目
  ev('b1', '帯A', day(10) + 'T00:00', day(14) + 'T23:59', { all: true }),
  ev('b2', '帯B', day(11) + 'T00:00', day(13) + 'T23:59', { all: true }), // 12日は帯2本＋短冊
];

test.describe('AE-1/2/5 「全」の段数と描画（通常5・大4・5/6週・帯重複）', () => {
  const cases = [];
  for (const [sn, size] of [['見開き951', SIZES.openLandscape951], ['見開き890', SIZES.openLandscape], ['開いた縦', SIZES.openPortrait], ['閉じた縦', SIZES.closedPortrait]]) {
    for (const large of [false, true]) for (const ws of [1, 0]) cases.push({ sn, size, large, ws });
  }
  for (const c of cases) {
    test(`${c.sn} 文字${c.large ? '大' : '標準'} ${c.ws ? '月曜始まり(6週)' : '日曜始まり(5週)'}`, async ({ page }) => {
      await openApp(page, c.size);
      await seed(page, AE_SEED);
      await setUi(page, { monthExpand: true, style: 'named', weekStart: c.ws, monthTextSize: c.large ? 'large' : 'normal', view: 'month', pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } });
      if (c.sn === '閉じた縦') await tab(page, '月').click();
      const cap = c.large ? 4 : 5;
      const sc = page.locator('.scroll.all').first();
      await expect(sc).toBeVisible();
      expect(await page.locator('.scroll.all .week.all').count()).toBe(c.ws ? 6 : 5);
      // 12日: 帯2本＋短冊。レーンは cap まで、残りは +N（予定9件）
      await sc.evaluate((e) => { e.scrollTop = 0; });
      const day12 = await page.locator('.week.all').evaluateAll((ws, k) => {
        const w = ws.find((x) => x.querySelector(`[data-date="${k}"]`)); if (!w) return null;
        const wr = w.getBoundingClientRect(), d = w.querySelector(`[data-date="${k}"]`).getBoundingClientRect(), cx = d.left + d.width / 2;
        const hit = [...w.querySelectorAll('.bar,.strip')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < cx && r.right > cx; });
        const plus = w.querySelector(`.plus[data-plus="${k}"]`);
        return { shown: hit.length, plus: plus ? Number(plus.textContent.replace('+', '')) : 0, lanes: new Set(hit.map((e) => Math.round(e.getBoundingClientRect().top - wr.top))).size };
      }, day(12));
      expect(day12.shown).toBe(cap);
      expect(day12.shown + day12.plus).toBe(9);
      expect(day12.lanes).toBe(cap);
      const m = await measureAll(page);
      for (const w of m.weeks) { expect(w.inside).toBe(true); expect(w.overlap).toBe(false); expect(w.lanes).toBeLessThanOrEqual(cap); }
      expect(m.weeks.some((w) => w.lanes === cap)).toBe(true);
      expect(m.last.gap).toBeGreaterThanOrEqual(-1); // 末週は領域からはみ出さない
      if (m.last.over > 1 && c.sn !== '閉じた縦') expect(m.last.gap).toBeLessThanOrEqual(1); // あふれて内部スクロールするときは末週が下端まで届く
      if (c.sn === '閉じた縦') { // 末尾までスクロールした末週の下端は、下のタブバーの上端より上（隠れない）
        const tabTop = (await tab(page, '月').boundingBox()).y, lastB = await page.locator('.week.all').last().evaluate((e) => e.getBoundingClientRect().bottom);
        expect(lastB).toBeLessThanOrEqual(tabTop + 1);
      }
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }
});

test.describe('AE-3 「全」の解除と再押下・状態保持', () => {
  test('見開き: 解除→再押下で同じ週へ戻る。回転・再起動でも全のまま同じ週', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, [...AE_SEED, ...many(day(3), 7, 'a'), ...many(day(5), 7, 'b'), ...many(day(19), 7, 'c'), ...many(day(2), 7, 'd')]);
    await setUi(page, { monthExpand: true, style: 'named', weekStart: 1, view: 'month' });
    const sc = page.locator('.scroll.all').first();
    const firstWk = () => sc.evaluate((s) => { const r = s.getBoundingClientRect(); for (const w of s.children) if (w.getBoundingClientRect().bottom > r.top + 2) return w.dataset.wk; return ''; });
    await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // 第19.1版: 週の行が 1pt 低くなり（18+5×16+2=100）、末尾まで送った溢れ（78）が先頭の週の高さ（85）に届かない。先頭の週が丸ごとは外れないので、末尾まで送れていること（scrollTop が最大）と、先頭の週が7ptしか見えないことで確かめる
    const st = await sc.evaluate((e) => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight, first: e.children[0].getBoundingClientRect().bottom - e.getBoundingClientRect().top }));
    expect(st.top).toBeGreaterThan(40); expect(Math.abs(st.top - st.max)).toBeLessThanOrEqual(1); expect(st.first).toBeLessThan(10);
    await page.locator('.allbtn').click(); // 解除
    await expect(page.locator('.scroll.all')).toHaveCount(0);
    await page.locator('.allbtn').click(); // 再押下
    await expect(sc).toBeVisible();
    await expect.poll(async () => (await sc.evaluate((s, k) => { const r = s.getBoundingClientRect(), b = s.querySelector(`[data-wk="${k}"]`).getBoundingClientRect(); return b.bottom > r.top + 2 && b.top < r.bottom - 2; }, '2026-11-09'))).toBe(true); // 選択日(11/12)の週が見える
    // 回転 → 戻す → 再起動
    await page.setViewportSize(SIZES.openLandscape951.height ? { width: 669, height: 951 } : SIZES.openPortrait669);
    await expect(page.locator('.scroll.all').first()).toBeVisible();
    await page.setViewportSize(SIZES.openLandscape951);
    await expect(page.locator('.scroll.all').first()).toBeVisible();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.scroll.all').first()).toBeVisible();
    await expect(page.locator('.allbtn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).monthExpand)).toBe(true);
  });
});
