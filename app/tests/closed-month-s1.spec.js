import { test, expect } from '@playwright/test';
import { openApp, seed, ev, tab, SIZES, monthFormInit } from './helpers.js';
import { seedTasks, T } from './task-helpers.js';

// 第19.1版 S1: 閉じた画面の月（design/33 §5）・日付の行（H-05/H-06/M-19）・開いた横の既定＝予定名（H-04）・閉じた週（H-07/M-08）・L-01・L-05。
// 閉じた画面の寸法は実機の右の帯 84（--sar:84px）で確かめる。
const box = (loc) => loc.boundingBox();
const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;
const band = async (page) => { await page.evaluate(() => { document.documentElement.style.setProperty('--sar', '84px'); window.dispatchEvent(new Event('resize')); }); await page.waitForTimeout(150); };
const six = Array.from({ length: 6 }, (_, i) => ev(`z${i}`, `名前${i}`, `2026-11-12T${String(9 + i).padStart(2, '0')}:00`, `2026-11-12T${String(9 + i).padStart(2, '0')}:30`));

test.describe('閉じた画面 466×678（帯 84）', () => {
  test('日付の行 22（design/34 §2.3 で置き換え）: 今日の丸 20 は中心 (x+13, y+11)・日付 14/600 は左 4・+N 11/400 #68716A は右 4・六曜はマスに出さない', async ({ page }) => {
    await monthFormInit(page, 'month');
    await openApp(page, SIZES.closedPortrait);
    await seed(page, six);
    await tab(page, '月').click();
    await band(page);
    const g = await page.locator('[data-date="2026-11-12"]').evaluate((c) => {
      const r = c.getBoundingClientRect(), n = c.querySelector('.num'), nb = n.getBoundingClientRect();
      const p = c.parentElement.querySelector('.plus[data-plus="2026-11-12"]'), rg = document.createRange(); rg.selectNodeContents(p); const pt = rg.getBoundingClientRect();
      const ns = getComputedStyle(n), ps = getComputedStyle(p), rk = c.querySelector('.rk');
      const tr = document.createRange(); tr.selectNodeContents(n.firstChild); const tb = tr.getBoundingClientRect();
      return { cellW: r.width, nw: nb.width, nh: nb.height, cx: tb.left + tb.width / 2 - r.left, cy: tb.top + tb.height / 2 - r.top, pr: r.right - pt.right, nfs: parseFloat(ns.fontSize), nfw: Number(ns.fontWeight), pfs: parseFloat(ps.fontSize), pfw: Number(ps.fontWeight), pc: ps.color, rk: rk ? getComputedStyle(rk).display : 'none', today: c.classList.contains('today'), ptext: p.textContent };
    });
    expect(near(g.cellW, 52.3, 0.3)).toBe(true);
    expect(g.nfs).toBe(14); expect(g.nfw).toBeGreaterThanOrEqual(600);
    expect(near(g.nw, 20, 0.6) && near(g.nh, 20, 0.6)).toBe(true); // 今日の丸は直径 20
    expect(near(g.cx, 13, 0.6) && near(g.cy, 11, 0.6)).toBe(true);
    expect(g.rk).toBe('none');
    expect(g.pfs).toBe(11); expect(g.pfw).toBe(400); expect(g.pc).toBe('rgb(93, 105, 99)'); // 第19.4版（design/36 §15.5）: +N は #68716A → #5D6963（カプセル・土の列の地の上でも 4.8 以上）
    expect(near(g.pr, 4, 0.8)).toBe(true);
    expect(g.ptext).toMatch(/^\+\d+$/);
  });

  test('下のタブとその上のぼかし（y575〜599）は閉じた画面にない（design/34 §6.1・§9.1-9 で置き換え）。ホーム・日・週・月すべて', async ({ page }) => {
    // 旧: タブの上 24（y575〜599）に地色のぼかし。34 §6.1「33 §5 の 87 とタブの上のぼかし y575〜599 は、閉じた画面ではなくす」
    await openApp(page, SIZES.closedPortrait);
    await band(page);
    for (const name of ['ホーム', '日', '週', '月']) {
      await tab(page, name).click();
      await page.waitForTimeout(150);
      await expect(page.locator('.tabs'), name).toHaveCount(0);
      expect(await page.locator('.tabfade').evaluateAll((es) => es.filter((e) => getComputedStyle(e).display !== 'none').length), name).toBe(0);
      // 下の余白 41 の帯（y637〜678、ホームバーの帯 33＋8）に、押せるものを邪魔する被せがない
      expect(await page.evaluate(() => { const e = document.elementFromPoint(191, 640); return !!e && !e.closest('.tabs, .tabfade'); }), name).toBe(true);
    }
  });

  test('閉じたホーム: 一番下まで送ると最後のカード（明日）・「＋ タスクを追加」がホームバーの帯（y645）の上 8 まで出る（34 で置き換え: タブの上 8 → 帯の上 8）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, six);
    await tab(page, 'ホーム').click(); // 起動はカレンダー（design/34 §9.2・11:29 の決定）。ホームはタブから
    await seedTasks(page, [T('h1', { title: '今日のタスク1', due: { date: '2026-11-12' } }), T('h2', { title: '今日のタスク2', due: { date: '2026-11-12' } }), T('h3', { title: '今日のタスク3', due: { date: '2026-11-12' } })]);
    await band(page);
    await page.locator('.home.listview').evaluate((e) => { const s = [e, ...e.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 2 && getComputedStyle(x).overflowY !== 'visible'); (s || e).scrollTop = 99999; });
    await page.waitForTimeout(200);
    await expect(page.locator('.tabs')).toHaveCount(0);
    const barTop = 678 - 33; // ホームバーの帯の上端 y645。下の余白は 41（帯 33＋8。design/34 §6.1・§10「33 全体」: 87 → 41）
    const last = await box(page.locator('.htmr'));
    expect(near(last.y + last.height, barTop - 8, 1)).toBe(true);
    const add = await box(page.locator('.hadd'));
    expect(add.y + add.height).toBeLessThanOrEqual(barTop - 8 + 1);
  });

  test('見えない「期間を選ぶ」は押せない（pointer-events:none）。キーボードでは今までどおり開く', async ({ page }) => {
    await monthFormInit(page, 'month');
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await expect(page.locator('.mrpick').first()).toHaveCSS('pointer-events', 'none');
  });

  test('月のチップ: 切れた予定名だけ最後の右 4 を地の色へぼかす。短い名前はそのまま', async ({ page }) => {
    await monthFormInit(page, 'month');
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('long', '長い名前の予定がマスの幅で切れる', '2026-11-12T10:00', '2026-11-12T11:00'), ev('short', '朝', '2026-11-13T10:00', '2026-11-13T11:00')]);
    await tab(page, '月').click();
    await band(page);
    const long = page.locator('.mgrid .strip[data-sday="2026-11-12"]'), short = page.locator('.mgrid .strip[data-sday="2026-11-13"]');
    await expect(long).toHaveClass(/cut/);
    await expect(short).not.toHaveClass(/cut/);
    const a = await long.evaluate((e) => { const s = getComputedStyle(e, '::after'); return { w: parseFloat(s.width), bg: s.backgroundImage }; });
    expect(a.w).toBe(4); expect(a.bg).toContain('linear-gradient');
  });

  test('閉じた週: 曜日 10pt と日付 13pt の2段（今日は日付に緑の丸 22）。枠は時刻なしで題名 10pt W6・行 12（V-05。行数は枠の高さ＝(高さ−4)÷12）。複数日の終日は週で1本の帯', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [
      ev('trip', '出張（3日間）', '2026-11-11', '2026-11-13', { all: true }),
      ev('m1', '十時の打ち合わせ', '2026-11-12T10:00', '2026-11-12T12:00'),
    ]);
    await tab(page, '週').click();
    await band(page);
    const heads = await page.locator('.tlheads .tlhd').evaluateAll((es) => es.map((e) => { const w = e.querySelector('.dw'), d = e.querySelector('.dd'), r = e.getBoundingClientRect(), cr = e.parentElement.getBoundingClientRect(); const dr = d.getBoundingClientRect(), wr = w.getBoundingClientRect(); return { dwFs: parseFloat(getComputedStyle(w).fontSize), ddFs: parseFloat(getComputedStyle(d).fontSize), left: r.left, right: r.right, dw: dr.width, dh: dr.height, today: e.classList.contains('today'), bg: getComputedStyle(d).backgroundColor, wTop: wr.top, dTop: dr.top, textW: Math.max(w.scrollWidth, d.scrollWidth), colW: r.width }; }));
    expect(heads).toHaveLength(7);
    for (const h of heads) { expect(h.dwFs).toBe(10); expect(h.ddFs).toBe(13); expect(h.dTop).toBeGreaterThan(h.wTop); expect(h.textW).toBeLessThanOrEqual(h.colW); }
    const today = heads.find((h) => h.today);
    expect(near(today.dw, 22, 0.6) && near(today.dh, 22, 0.6)).toBe(true);
    expect(today.bg).toBe('rgb(41, 78, 66)');
    // 枠: 時刻（.tt）なし・10pt・W6（V-05: 9→10。行数は高さで決める）
    const ev1 = page.locator('.tlev', { hasText: '十時の打ち合わせ' });
    await expect(ev1.locator('.tt')).toHaveCount(0);
    const st = await ev1.evaluate((e) => { const s = getComputedStyle(e.querySelector('.tn')); return { fs: parseFloat(s.fontSize), fw: Number(s.fontWeight), lc: getComputedStyle(e.querySelector('.tn')).webkitLineClamp }; });
    const h1 = (await ev1.boundingBox()).height; expect(st.fs).toBe(10); expect(st.fw).toBeGreaterThanOrEqual(600); expect(st.lc).toBe(String(Math.floor((h1 - 4) / 12)));
    await expect(ev1).toHaveAttribute('aria-label', /10:00 – 12:00 十時の打ち合わせ/); // 時刻は読み上げに残る
    // 複数日の終日は1本（日ごとの札にしない）。11/11〜11/13 の3列ぶんの幅
    const trips = page.locator('.adband', { hasText: '出張' });
    await expect(trips).toHaveCount(1);
    const tb = await box(trips), cols = await page.locator('.tlheads .tlhd').evaluateAll((es) => es.map((e) => e.getBoundingClientRect().width));
    expect(near(tb.width, cols[0] * 3 - 2, 1.5)).toBe(true);
  });
});

test.describe('開いた横 951×669', () => {
  test('新しい端末の月は予定名（点ではない）。マス 63.8×83.5 に日付の行 18＋チップ 4段、+N は日付の行、六曜と重ならない', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, [...six, ev('x7', '名前6', '2026-11-12T15:00', '2026-11-12T15:30')]);
    await expect(page.locator('.week.named').first()).toBeVisible();
    await expect(page.locator('.week .dot')).toHaveCount(0);
    const cell = await box(page.locator('[data-date="2026-11-12"]'));
    expect(near(cell.width, 63.8, 1.5) && near(cell.height, 83.5, 1.5)).toBe(true);
    const chips = page.locator('.week .strip[data-sday="2026-11-12"]');
    await expect(chips).toHaveCount(4);
    const info = await chips.first().evaluate((e) => { const s = getComputedStyle(e), w = e.closest('.week').getBoundingClientRect(); return { fs: parseFloat(s.fontSize), fw: Number(s.fontWeight), r: s.borderTopLeftRadius, top: e.getBoundingClientRect().top - w.top }; });
    expect(info.fs).toBe(9); expect(info.fw).toBeGreaterThanOrEqual(600); expect(info.r).toBe('3px');
    expect(info.top).toBeGreaterThanOrEqual(18); expect(info.top).toBeLessThanOrEqual(20);
    const d = await page.locator('[data-date="2026-11-12"]').evaluate((c) => { const r = c.getBoundingClientRect(), n = c.querySelector('.num').getBoundingClientRect(), k = c.querySelector('.rk').getBoundingClientRect(), p = c.parentElement.querySelector('.plus[data-plus="2026-11-12"]'), rg = document.createRange(); rg.selectNodeContents(p); const pt = rg.getBoundingClientRect(); const ps = getComputedStyle(p); return { nl: n.left - r.left, nw: n.width, kl: k.left - r.left, kr: k.right - r.left, pl: pt.left - r.left, pr: r.right - pt.right, pfs: parseFloat(ps.fontSize), pfw: Number(ps.fontWeight), pc: ps.color, ptop: pt.top - r.top, pb: pt.bottom - r.top, txt: p.textContent }; });
    expect(near(d.nl, 3, 0.8)).toBe(true); expect(near(d.kl, 21, 1.2)).toBe(true); /* V-04: 開いた横の六曜 x+21〜37 */ expect(d.kl).toBeGreaterThanOrEqual(d.nl + d.nw - 0.5);
    expect(d.txt).toBe('+3'); expect(d.pfs).toBe(8); expect(d.pfw).toBeGreaterThanOrEqual(600); expect(d.pc).toBe('rgb(93, 105, 99)'); /* 第19.4版 レビュー直し 必須4: 開いた画面の +N も #5D6963 */ expect(near(d.pr, 4, 1)).toBe(true); /* S8 N-05: 選んだマスは 4 */ /* V-04: +N 8pt 右 2 */ /* S9 品質: 設計 fc56bc9・STEER 05:59 で右あき4(±1)に固定 */
    expect(d.pl).toBeGreaterThanOrEqual(d.kr); expect(d.pb).toBeLessThanOrEqual(18.5); // 日付の行 18 に収まる
  });

  test('保存済みの設定は尊重する（手帳で保存していた端末は手帳のまま）', async ({ page }) => {
    await page.addInitScript(() => { const k = 'duo.ui.v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), style: 'simple' })); });
    await openApp(page, SIZES.openLandscape951);
    await seed(page, six);
    await expect(page.locator('.week.simple').first()).toBeVisible();
    await expect(page.locator('.week .dot').first()).toBeVisible();
  });
});
