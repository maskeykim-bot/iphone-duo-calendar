// 第19.1版 S2: 開いた縦のホーム（design/32 案A）・切替を上の帯へ（17 §1）・月「全部」の2つの窓（29）・設定シートの帯送り。寸法は ±1。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, tab, openMenu, monthFormInit } from './helpers.js';

const P = SIZES.openPortrait669;
const box = async (loc) => { const b = await loc.first().boundingBox(); expect(b, 'visible').toBeTruthy(); return b; };
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const cssPx = (page, n) => page.evaluate((n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)), n);
const EIGHT = [...Array(8)].map((_, i) => ev(`t${i}`, `今日の予定${i + 1}`, `2026-11-12T${String(10 + i).padStart(2, '0')}:00`, `2026-11-12T${String(10 + i).padStart(2, '0')}:30`));
const FIVE = [...Array(5)].map((_, i) => ev(`w${i}`, `金曜${i + 1}`, `2026-11-13T${String(9 + i).padStart(2, '0')}:00`, `2026-11-13T${String(9 + i).padStart(2, '0')}:30`));

test.describe('開いた縦のホーム（案A）', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, P);
    await seed(page, [...EIGHT, ...FIVE]);
    await tab(page, 'ホーム').click();
    await expect(page.locator('.phome')).toBeVisible();
  });

  test('寸法: 上の面 y82〜459・下の面 y500〜847、帯 y459〜492 に何も置かない', async ({ page }) => {
    const a0 = await cssPx(page, '--groove-avoid-y0'), a1 = await cssPx(page, '--groove-avoid-y1');
    const d = await box(page.locator('.pv-date')), nx = await box(page.locator('.pvnext')), td = await box(page.locator('.pv-today'));
    near(d.x, 24); near(d.y, 90); near(d.height, 44);
    near(nx.x, 12); near(nx.y, 142); near(nx.width, 645); near(nx.height, 100);
    near(td.x, 12); near(td.y, 250); near(td.width, 645); near(td.height, 201);
    expect(td.y + td.height).toBeLessThanOrEqual(a0);
    const wk = await box(page.locator('.pv-week')), tk = await box(page.locator('.pv-tasks')), nt = await box(page.locator('.pv-notes'));
    near(wk.x, 12); near(wk.y, 500); near(wk.width, 645); near(wk.height, 112);
    near(tk.x, 12); near(tk.y, 620); near(tk.width, 318); near(tk.height, 227);
    near(nt.x, 339); near(nt.y, 620); near(nt.width, 318); near(nt.height, 227);
    expect(wk.y).toBeGreaterThanOrEqual(a1);
    const tabs = await box(page.locator('.tabs'));
    near(tabs.y - (tk.y + tk.height), 16);
    // 帯の中に、文字・枠が1つもない（見えているものだけ）
    const inBand = await page.evaluate(({ a0, a1 }) => [...document.querySelectorAll('.phome *')].filter((e) => {
      if (e.children.length && !e.matches('button, h2, h3, span, strong, small')) return false;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > a0 + 0.5 && r.top < a1 - 0.5;
    }).map((e) => e.className || e.tagName), { a0, a1 });
    expect(inBand).toEqual([]);
    await expect(page.locator('.phome .htmr')).toHaveCount(0); // 明日のカードは出さない
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });

  test('今日の予定 8件: 5行＋「ほか n件 ›」。カードの高さは 201 のまま', async ({ page }) => {
    await expect(page.locator('.pv-today .hrow')).toHaveCount(5);
    const n = await page.locator('.pv-today h3').textContent();
    expect(n).toMatch(/今日の予定 \d+件/);
    const total = Number(n.match(/(\d+)件/)[1]);
    await expect(page.locator('.pv-today .hmore2')).toHaveText(`ほか ${total - 5}件 ›`);
    near((await box(page.locator('.pv-today'))).height, 201);
    for (const r of await page.locator('.pv-today .hrow').all()) near((await r.boundingBox()).height, 32);
    const m = await box(page.locator('.pv-today .hmore2'));
    expect(m.height).toBeGreaterThanOrEqual(36); // 押せる高さは ::before で 44
  });

  test('今週の帯: 7マス 92.1・日付の行 18・チップ 14＋間 2・最大3段、あふれは日付の行右の +N', async ({ page }) => {
    const days = page.locator('.pvwk .day');
    await expect(days).toHaveCount(7);
    const wk = await box(page.locator('.pv-week'));
    for (const dd of await days.all()) near((await dd.boundingBox()).width, 645 / 7, 0.8);
    const fri = page.locator('.pvwk .day[data-date="2026-11-13"]');
    const fb = await box(fri);
    const chips = page.locator('.pvwk .strip');
    const ys = (await chips.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top * 10) / 10, r.height, r.left, r.right, r.bottom]; })));
    const mine = ys.filter(([, , l, r]) => l >= fb.x - 1 && r <= fb.x + fb.width + 1);
    expect(mine.length).toBe(3); // 最大3段
    mine.sort((a, b) => a[0] - b[0]);
    near(mine[0][0] - fb.y, 18, 2.5); // 日付の行 18 の下から
    for (const m of mine) near(m[1], 14);
    near(mine[1][0] - mine[0][0], 16); near(mine[2][0] - mine[1][0], 16);
    for (const m of mine) expect(m[4]).toBeLessThanOrEqual(fb.y + fb.height + 0.5);
    const plus = page.locator('.pvwk .plus[data-jump="2026-11-13"]');
    await expect(plus).toHaveText('+2');
    const pb = await box(plus);
    expect(pb.width).toBeGreaterThanOrEqual(43.5); expect(pb.height).toBeGreaterThanOrEqual(43.5); // 押せる 44
    expect(pb.y).toBeLessThanOrEqual(fb.y + 0.5);
    expect(await plus.evaluate((e) => getComputedStyle(e).fontSize)).toBe('9px');
    expect(wk.y + wk.height).toBeLessThanOrEqual(await cssPx(page, '--tabs-y'));
  });

  test('今週のマスをたたくと日タブのその日。「月 ›」で月タブ', async ({ page }) => {
    await page.locator('.pvwk .day[data-date="2026-11-14"]').click({ position: { x: 20, y: 70 } });
    await expect(tab(page, '日')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.fold')).toBeVisible();
    await expect(page.locator('.fhead h2')).toContainText('11月14日');
    await tab(page, 'ホーム').click();
    await page.locator('[data-pv="month"]').click();
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mpull')).toBeVisible();
  });

  test('今週のマスの長押しで期間選択・メニューは出ない', async ({ page }) => {
    const b = await box(page.locator('.pvwk .day[data-date="2026-11-10"]'));
    await page.mouse.move(b.x + 20, b.y + 60); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
    await expect(page.locator('.mrtag:visible, #rsheet:visible, .dmenu:visible, #editor[open]')).toHaveCount(0);
  });

  test('「すべて ›」「ノート」は集中モード、タイムライン › は日タブ', async ({ page }) => {
    await page.locator('[data-pv="task"]').click();
    await expect(page.locator('.fmodes [data-fmode="task"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.fmodes [data-fmode="calendar"]').click();
    await tab(page, 'ホーム').click();
    await page.locator('.pv-today [data-pv="day"]').last().click();
    await expect(tab(page, '日')).toHaveAttribute('aria-pressed', 'true');
  });

  test('設定 x20〜64・検索 x605〜649（y19〜63・44×44）。切替は上の帯の真ん中 x224〜444・y23〜59、下の段にはない', async ({ page }) => {
    const s = await box(page.getByRole('button', { name: '設定', exact: true })), q = await box(page.getByRole('button', { name: '予定を検索', exact: true }));
    near(s.x, 20); near(s.y, 19); near(s.width, 44); near(s.height, 44);
    near(q.x, 605); near(q.y, 19); near(q.width, 44); near(q.height, 44);
    const f = await box(page.locator('.fmodes'));
    near(f.x, 224.5); near(f.y, 23); near(f.width, 220); near(f.height, 36);
    expect(f.y + f.height).toBeLessThanOrEqual(82);
    const bs = await page.locator('.fmodes button').all();
    expect(bs.length).toBe(3);
    for (const b of bs) {
      const r = await b.boundingBox(); near(r.width, 220 / 3, 0.5); near(r.height, 36);
      const hit = await b.evaluate((e) => { const c = getComputedStyle(e, '::before'); return [parseFloat(c.top), parseFloat(c.bottom)]; });
      near(hit[0], -4, 0.1); near(hit[1], -4, 0.1); // 押せる高さ 44（y19〜63）
    }
    expect(await page.locator('.fmodes').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('10px');
    expect(await page.locator('.fmodes button[aria-pressed=true]').evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).backgroundColor])).toEqual(['14px', 'rgb(255, 255, 255)']);
    const t = await box(page.locator('.tabs'));
    expect(f.y + f.height).toBeLessThan(t.y);
  });

  test('文字を大きくしたとき: 上の面・下の面が窓になり、窓の中だけスクロール（帯にかからない）', async ({ page }) => {
    await page.addStyleTag({ content: 'html{font-size:20px!important}' });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.locator('.tabs button', { hasText: '日' }).click();
    await tab(page, 'ホーム').click();
    await expect(page.locator('.phome.big')).toBeVisible();
    const a0 = await cssPx(page, '--groove-avoid-y0'), a1 = await cssPx(page, '--groove-avoid-y1');
    const wt = await box(page.locator('.pvt')), wb = await box(page.locator('.pvb'));
    expect(wt.y + wt.height).toBeLessThanOrEqual(a0 + 0.5);
    expect(wb.y).toBeGreaterThanOrEqual(a1 - 0.5);
    expect(await page.locator('.pvt').evaluate((e) => getComputedStyle(e).overflowY)).toBe('auto');
  });
});

test.describe('開いた縦の月「全部」（1枚の紙・2つの窓）', () => {
  test('上の窓 y146〜458・下の窓 y500〜。帯 y459〜492 に文字も行も出ない。2つの窓は同じ位置で動く', async ({ page }) => {
    await openApp(page, P);
    await seed(page, [...EIGHT, ...FIVE]);
    await page.evaluate(() => { const k = 'duo.ui.v1', s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, monthExpand: true, view: 'month', home: false })); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const at = await box(page.locator('.alwin.alt')), ab = await box(page.locator('.alwin.alb'));
    near(at.y, 146); near(at.y + at.height, 458); near(ab.y, 500);
    const tabs = await box(page.locator('.tabs'));
    expect(ab.y + ab.height).toBeLessThanOrEqual(tabs.y);
    // 見出し y82〜126・曜日 126〜146（上の帯は設定・切替・検索だけ）
    const t = await box(page.locator('#ctitle')); expect(t.y).toBeGreaterThanOrEqual(81); expect(t.y + t.height).toBeLessThanOrEqual(127);
    near((await box(page.locator('.weekdays'))).y, 126);
    const sc = page.locator('.scroll.all');
    for (const y of [0, 20, 9999]) {
      await sc.evaluate((e, y) => { e.scrollTop = y; }, y);
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => [document.querySelector('.scroll.all').scrollTop, document.querySelector('.scroll.allb').scrollTop]);
      near(s[0], s[1], 0.5);
      const hits = await page.evaluate(() => {
        const out = [], top = document.querySelector('.alwin.alt').getBoundingClientRect(), bot = document.querySelector('.alwin.alb').getBoundingClientRect();
        const w = document.createTreeWalker(document.querySelector('#app'), NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) {
          if (!n.textContent.trim()) continue;
          const e = n.parentElement, r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
          const win = e.closest('.alwin'); if (!win) continue;
          const wr = win.getBoundingClientRect();
          const vis = Math.min(b.bottom, wr.bottom) - Math.max(b.top, wr.top); // 窓に見えている高さ
          if (vis > 0 && Math.min(b.bottom, wr.bottom) > 459 && Math.max(b.top, wr.top) < 492) out.push(n.textContent.trim());
        }
        return out;
      });
      expect(hits, `scroll ${y}`).toEqual([]);
    }
    // 時刻（紙）が飛ばない: 上の窓の下端の紙の位置 = 下の窓の上端の紙の位置 − 0（同じ紙）。下の窓は紙の topH 下から始まる
    const paper = await page.evaluate(() => { const a = document.querySelector('.scroll.all'), b = document.querySelector('.scroll.allb'); return [a.scrollTop + a.clientHeight, b.scrollTop + a.clientHeight]; });
    near(paper[0], paper[1], 0.5);
  });
});

test.describe('設定シート（H-22）', () => {
  test('開いた縦: 帯 y459〜492 にかかる行は y492 から下の面へ送る', async ({ page }) => {
    await openApp(page, P);
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await expect(page.locator('#menu')).toBeVisible();
    await page.waitForTimeout(400);
    const a0 = await cssPx(page, '--groove-avoid-y0'), a1 = await cssPx(page, '--groove-avoid-y1');
    const rows = await page.locator('#menu .menurows:not([hidden]) > *').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 8), r.top, r.bottom, e.dataset.gpush || '']; }));
    for (const [n, t, b] of rows) expect(t >= a1 - 0.5 || b <= a0 + 0.5, `${n} ${t}〜${b}`).toBe(true);
    expect(rows.some((r) => r[3] === '1')).toBe(true);
    const pushed = rows.find((r) => r[3] === '1'); near(pushed[1], a1, 1);
    // 下層の画面でも同じ
    await page.locator('#menu [data-go="details"]').click();
    await page.waitForTimeout(300);
    const r2 = await page.locator('#menu .menurows:not([hidden]) > *').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0, 8), r.top, r.bottom]; }));
    for (const [n, t, b] of r2) expect(t >= a1 - 0.5 || b <= a0 + 0.5, `${n} ${t}〜${b}`).toBe(true);
  });
});
