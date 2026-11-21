import { test, expect } from '@playwright/test';
import { openApp, seed, ev, setStyle, SIZES, tab } from './helpers.js';

// 第14版 PR3: 月と日の見出しに六曜を表示する（RK-1/2/5/7）
const POSTURES = [
  ['closed', SIZES.closedPortrait], ['closedL', SIZES.closedLandscape], ['openP', SIZES.openPortrait669],
  ['openP626', SIZES.openPortrait], ['openL', SIZES.openLandscape951], ['openL890', SIZES.openLandscape],
];
const setUi = (page, patch) => page.evaluate((p) => { const k = 'duo.ui.v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), ...p })); }, patch);
const goTo = async (page, day) => { await setUi(page, { selected: day }); await page.reload(); await page.waitForSelector('html[data-ready]'); };
const rk = (page, day) => page.locator(`[data-date="${day}"] .rk`);
const errors = (page) => { const a = []; page.on('pageerror', (e) => a.push(String(e))); return a; };

for (const [name, size] of POSTURES) {
  test(`月のマス（${name}）: 2026-11 の六曜・11/1 短縮・数字と重ならない・aria`, async ({ page }) => {
    const errs = errors(page);
    await openApp(page, size);
    await setUi(page, { view: 'month', home: false }); await page.reload(); await page.waitForSelector('html[data-ready]');
    const cell = (d) => page.locator(`[data-date="${d}"]`);
    if (name === 'closed' || name === 'closedL') { // 第19.2版 S11b（34 §6.1・§9.1 の10）: 閉じた画面は六曜をマスに出さず、日の見出し「月 大安」に出す。マスの読み上げにも六曜は入れない
      await expect(page.locator('.mgrid .rk').filter({ visible: true })).toHaveCount(0);
      await expect(cell('2026-11-16').first()).toHaveAttribute('aria-label', /^11月16日 月曜日、予定0件/);
      await cell('2026-11-16').first().click();
      await expect(page.locator('.mdh .hdw')).toHaveText(/月\s*大安/);
      await expect(cell('2026-11-01').first().locator('.num')).toContainText('1');
      expect(errs).toEqual([]);
      return;
    }
    await expect(rk(page, '2026-11-01')).toHaveText('赤口');
    await expect(rk(page, '2026-11-09')).toHaveText('仏滅');
    await expect(rk(page, '2026-11-16')).toHaveText('大安');
    await expect(cell('2026-11-01').locator('.num')).toHaveText('11/1');
    await expect(cell('2026-11-16')).toHaveAttribute('aria-label', /^11月16日（月）、大安、予定0件/);
    await expect(rk(page, '2026-11-16')).toHaveAttribute('aria-hidden', 'true');
    // 第19.1版 M-19: 当月は注の色 #68716A・W6・8px、前後の月は薄色 #8C918A
    const css = (loc) => loc.evaluate((e) => { const s = getComputedStyle(e); return [s.color, s.fontSize]; });
    expect(await css(rk(page, '2026-11-16'))).toEqual(['rgb(104, 113, 106)', '8px']);
    const out = page.locator('.day.out .rk').first();
    expect(await css(out)).toEqual(['rgb(140, 145, 138)', '8px']);
    expect(await rk(page, '2026-11-16').evaluate((e) => Number(getComputedStyle(e).fontWeight))).toBeGreaterThanOrEqual(600);
    // 第19.1版 H-06: 日付の行 18 に 日付（左）→ 六曜（右、閉じた画面 x+21 / 開いた縦 x+26・開いた横 x+21＝V-04 で閉じた画面と同じ寸法）と並べ、重ならない
    for (const d of ['2026-11-01', '2026-11-16', '2026-11-30']) {
      const g = await cell(d).evaluate((c) => { const r = c.getBoundingClientRect(), k = c.querySelector(".rk").getBoundingClientRect(); const tn = c.querySelector('.num'), rg = document.createRange(); rg.selectNodeContents(tn); const n = rg.getBoundingClientRect(); return { left: k.left - r.left, kl: k.left, nr: n.right, ok: k.right <= r.right + 0.5, top: k.top - r.top, h: k.height }; });
      if (d !== '2026-11-01') expect(Math.abs(g.left - (['closed', 'closedL'].includes(name) || name.startsWith('openL') ? 21 : 26))).toBeLessThanOrEqual(1.5); // 左の線 1 を含む
      expect(g.kl).toBeGreaterThanOrEqual(g.nr - 0.5);
      expect(g.ok).toBe(true);
      expect(g.top).toBeLessThanOrEqual(1.5); // 日付の行（上 18）の中
      expect(g.h).toBeLessThanOrEqual(18.5);
    }
    expect(errs).toEqual([]);
  });
}

test('「+N」・チップと六曜が重ならない（開いた縦・開いた横）', async ({ page }) => {
  for (const size of [SIZES.openPortrait669, SIZES.openLandscape951]) {
    await openApp(page, size);
    await seed(page, Array.from({ length: 6 }, (_, i) => ev(`p${i}`, `予定${i}`, `2026-11-16T${String(8 + i).padStart(2, '0')}:00`, `2026-11-16T${String(8 + i).padStart(2, '0')}:30`)));
    await setStyle(page, '予定名');
    const g = await page.locator('[data-date="2026-11-16"]').evaluate((c) => {
      const k = c.querySelector('.rk').getBoundingClientRect(), n = c.querySelector('.num').getBoundingClientRect();
      const pe = c.parentElement.querySelector('.plus[data-plus="2026-11-16"]'), pr = document.createRange(); pr.selectNodeContents(pe);
      const p = pr.getBoundingClientRect(); // +N の文字の範囲（押せる範囲 44×44 ではなく）
      const strips = [...c.parentElement.querySelectorAll('.strip')].map((e) => e.getBoundingClientRect()).filter((r) => r.left < c.getBoundingClientRect().right && r.right > c.getBoundingClientRect().left);
      return { kl: k.left, kr: k.right, nr: n.right, pl: p.left, minStripTop: Math.min(...strips.map((r) => r.top)), kb: k.bottom };
    });
    expect(g.kl).toBeGreaterThanOrEqual(g.nr - 0.5); // 六曜は日付の右
    expect(g.kr).toBeLessThanOrEqual(g.pl + 0.5); // +N は六曜の右（日付の行の右端）で重ならない
    expect(g.kb).toBeLessThanOrEqual(g.minStripTop + 0.5);
  }
});

test('六曜オフでは要素が出ず、1日は「11月1日」、aria に六曜が入らない', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await setUi(page, { rokuyo: false }); await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.rk, .hrk, .wrk')).toHaveCount(0);
  await expect(page.locator('[data-date="2026-11-01"] .num')).toHaveText('11月1日');
  await expect(page.locator('[data-date="2026-11-16"]')).toHaveAttribute('aria-label', /^11月16日（月）、予定0件/);
});

test('範囲の端: 1999年12月・2000年1月・2050年12月・2051年1月、pageerror 0', async ({ page }) => {
  const errs = errors(page);
  await openApp(page, SIZES.openPortrait669);
  const check = async (day, inRange) => {
    await goTo(page, day);
    const cells = page.locator('.week .day');
    const n = await cells.count();
    for (let i = 0; i < n; i++) {
      const c = cells.nth(i), d = await c.getAttribute('data-date');
      const want = d >= '2000-01-01' && d <= '2050-12-31';
      await expect(c.locator('.rk')).toHaveCount(want ? 1 : 0);
    }
    void inRange;
  };
  await check('1999-12-15'); await check('2000-01-15'); await check('2050-12-15'); await check('2051-01-15');
  await expect(page.locator('[data-date="2050-12-31"] .rk')).toHaveCount(1);
  expect(errs).toEqual([]);
});

test('日の見出し: 時間ページ・日表示・範囲外、日付の右8px・13px #68716A', async ({ page }) => {
  const errs = errors(page);
  await openApp(page, SIZES.openLandscape951);
  await setUi(page, { view: 'month', selected: '2026-11-16' }); await page.reload(); await page.waitForSelector('html[data-ready]');
  const rd = page.locator('.rdate');
  await expect(rd).toHaveText('11月16日（月）大安');
  const g = await rd.evaluate((h0) => { const h = h0.querySelector('.datebtn'), k = h.querySelector('.hrk'), s = getComputedStyle(k), r = document.createRange(); const t = h.querySelector('.hdt').firstChild; r.setStart(t, 0); r.setEnd(t, t.length); return { gap: k.getBoundingClientRect().left - r.getBoundingClientRect().right, fs: s.fontSize, col: s.color, clip: h0.scrollWidth > h0.clientWidth }; });
  expect(g.gap).toBeCloseTo(8, 0); expect(g.fs).toBe('13px'); expect(g.col).toBe('rgb(104, 113, 106)'); expect(g.clip).toBe(false);
  await goTo(page, '2026-11-16');
  await expect(page.locator('.page.rp .rdate .hrk')).toHaveText('大安'); // 見開きの日は右の時間ページ（旧 view=day の左右は PR5 で廃止）
  await goTo(page, '1999-12-31');
  await expect(page.locator('.rdate')).toHaveText('12月31日（金）');
  await expect(page.locator('.hrk')).toHaveCount(0);
  await goTo(page, '2051-01-01');
  await expect(page.locator('.hrk')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('閉じた画面・開いた縦の日表示の見出しに六曜（切ると消える）', async ({ page }) => {
  for (const size of [SIZES.closedPortrait, SIZES.openPortrait669]) {
    await openApp(page, size);
    await setUi(page, { view: 'day', home: false, selected: '2026-11-14', rokuyo: true }); await page.reload(); await page.waitForSelector('html[data-ready]');
    const h = page.locator('#ctitle');
    // 閉じた画面は開いたときカレンダーから始まり（design/34 §9.2）、日の時間軸はホームの「タイムライン ›」（今日 11/12）から開く。開いた縦は保存した日（11/14）の日表示のまま
    const closed = size === SIZES.closedPortrait, want = closed ? '11月12日（木）' : '11月14日（土）', rk = closed ? '先勝' : '先負';
    if (closed) await tab(page, '日').click();
    await expect(h).toHaveText(`${want}${rk}`);
    const clip = await h.evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    expect(clip).toBe(false);
    await setUi(page, { rokuyo: false }); await page.reload(); await page.waitForSelector('html[data-ready]');
    if (closed) await tab(page, '日').click();
    await expect(h).toHaveText(want);
  }
});

test('週の表示: 日付の下に 9px の六曜', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await setUi(page, { view: 'week', home: false, selected: '2026-11-16' }); await page.reload(); await page.waitForSelector('html[data-ready]');
  const w = page.locator('.fdates .fdt .wrk').first();
  await expect(w).toHaveCount(1);
  expect(await w.evaluate((e) => { const s = getComputedStyle(e), p = e.parentElement.getBoundingClientRect(), r = e.getBoundingClientRect(); return [s.fontSize, s.color, r.top >= p.top, r.bottom <= p.bottom + 0.5]; })).toEqual(['9px', 'rgb(168, 171, 164)', true, true]);
});

test('小さな月・検索・通知文には出さない／ニューヨークでも同じ日に同じ六曜', async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: 'America/New_York', viewport: SIZES.openPortrait669 });
  const page = await ctx.newPage();
  await openApp(page, SIZES.openPortrait669);
  await expect(rk(page, '2026-11-16')).toHaveText('大安');
  await expect(rk(page, '2026-11-01')).toHaveText('赤口');
  await ctx.close();
});

test.describe('オフライン', () => {
  test.use({ serviceWorkers: 'allow' });
  test('オフラインで再起動しても六曜が出る', async ({ page, context }) => {
  await openApp(page, SIZES.openPortrait669);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && !!(await (await caches.open((await caches.keys())[0])).match('./js/rokuyo.js')));
  await page.reload(); await page.waitForSelector('html[data-ready]'); // SW 制御下で一度読み直してから切る
  await context.setOffline(true);
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(rk(page, '2026-11-16')).toHaveText('大安');
  await context.setOffline(false);
});
});
