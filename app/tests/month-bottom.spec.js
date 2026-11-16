// 第13版 PR7: 開いた横の月の最下段をタブの上へ（G = tabsTop − 8q − gridTop。基準 q=1 で y96〜603、G=507）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, setStyle } from './helpers.js';

const setSafe = (page, { t = 0, r = 0, b = 0, l = 0 }) => page.evaluate(([t, r, b, l]) => {
  const s = document.documentElement.style;
  s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`);
}, [t, r, b, l]);
const cssVar = (page, n) => page.evaluate((n) => parseFloat(document.documentElement.style.getPropertyValue(`--${n}`)), n);
const geom = (page) => page.evaluate(() => {
  const sc = document.querySelector('.spread .scroll.msc, .spread .scroll.all').getBoundingClientRect();
  const tabs = document.querySelector('.pgsw.pgl').getBoundingClientRect();
  const wks = [...document.querySelectorAll('.spread .week')].map((w) => w.getBoundingClientRect());
  const s = document.querySelector('.spread .scroll.msc, .spread .scroll.all');
  return { top: sc.top, bottom: sc.bottom, tabsTop: tabs.top, rows: wks.map((r) => r.height), lastBottom: wks[wks.length - 1].bottom, scrollable: s.scrollHeight - s.clientHeight, ratio: 0 };
});
const near = (a, b, t = 0.6) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(t);
const MIXED = [
  ...Array.from({ length: 6 }, (_, i) => ev(`m${i}`, `月末${i}`, `2026-11-30T${String(9 + i).padStart(2, '0')}:00`, `2026-11-30T${String(9 + i).padStart(2, '0')}:30`)),
  ev('band', '帯予定', '2026-11-29T00:00', '2026-12-01T23:59', { all: true }),
];
const CASES = [
  ['951×669 safe R84', SIZES.openLandscape951, { r: 84 }],
  ['951×669 safe なし', SIZES.openLandscape951, {}],
  ['890×626 safe R84', SIZES.openLandscape, { r: 84 }],
  ['890×626 safe T/B', SIZES.openLandscape, { t: 20, b: 14, l: 10, r: 0 }],
];

for (const [name, size, safe] of CASES) {
  test(`${name}: 6週の最下段がタブの上で止まり、最終行（11/30）をタップできる`, async ({ page }) => {
    await openApp(page, size);
    await seed(page, MIXED);
    await setSafe(page, safe);
    await setStyle(page, '予定名');
    const T = safe.t ?? 0, B = safe.b ?? 0, H = size.height;
    const q = (H - T - B) / 669, tabsTop = Math.min(T + 611 * q, H - B - 46);
    await expect.poll(() => cssVar(page, 'grid-h')).toBeGreaterThan(0);
    const g = await geom(page);
    near(g.tabsTop, tabsTop);
    near(g.bottom, tabsTop - 8 * q);
    expect(g.rows.length).toBe(6);
    const G = tabsTop - 8 * q - (T + 96 * q);
    for (const h of g.rows) near(h, G / 6, 1);
    expect(g.lastBottom).toBeLessThanOrEqual(g.tabsTop + 0.5);
    expect(g.scrollable).toBeLessThanOrEqual(1);
    if (size === SIZES.openLandscape951 && !safe.t) near(G, 507, 0.6), near(G / 6, 84.5, 0.2);
    // 最終週: 11/30 の日セルがタブの上に完全に出ていて、実際に押せる
    const cell = page.locator('.spread [data-date="2026-11-30"]');
    const b = await cell.boundingBox();
    expect(b.y + b.height).toBeLessThanOrEqual(g.tabsTop + 0.5);
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-date]')?.dataset.date, [b.x + 6, b.y + 6]);
    expect(hit).toBe('2026-11-30');
    await cell.click({ position: { x: 6, y: 6 } });
    await expect(page.locator('.spread [data-date="2026-11-30"].selected')).toHaveCount(1);
    // 同日6件 → 段数ぶん＋ +N（件数の合計が合う）
    const placed = await page.locator('.spread .week').last().locator('.strip').evaluateAll((els) => els.filter((e) => e.dataset.sday === '2026-11-30').length);
    const plus = Number((await page.locator('.spread .plus[data-jump="2026-11-30"]').textContent()).replace('+', ''));
    expect(placed + plus + 1 /* 帯 */).toBe(7);
    // 描画した予定は週の行の外へはみ出さない
    const over = await page.evaluate(() => [...document.querySelectorAll('.spread .week')].some((w) => { const r = w.getBoundingClientRect(); return [...w.querySelectorAll('.strip,.bar')].some((c) => c.getBoundingClientRect().bottom > r.bottom + 0.5); }));
    expect(over).toBe(false);
  });
}

test('951×669: 6週は4段（+1）、5週・4週は5段、月切替でも線がタブ上8qで止まる', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  const many = (d) => Array.from({ length: 6 }, (_, i) => ev(`${d}-${i}`, `予定${i}`, `${d}T${String(9 + i).padStart(2, '0')}:00`, `${d}T${String(9 + i).padStart(2, '0')}:30`));
  await seed(page, [...many('2026-11-20'), ...many('2026-12-10'), ...many('2027-02-10')]);
  await setSafe(page, { r: 84 });
  await setStyle(page, '予定名');
  const expectN = async (n, cap, day) => {
    await expect.poll(async () => (await geom(page)).rows.length).toBe(n);
    const g = await geom(page);
    near(g.bottom, 603, 0.6); near(g.tabsTop, 611, 0.6);
    for (const h of g.rows) near(h, 507 / n, 0.6);
    expect(g.scrollable).toBeLessThanOrEqual(1);
    await expect(page.locator(`.spread .strip[data-sday="${day}"]`)).toHaveCount(cap);
    await expect(page.locator(`.spread .plus[data-jump="${day}"]`)).toHaveText(`+${6 - cap}`);
  };
  await expectN(6, 4, '2026-11-20');
  await page.getByRole('button', { name: '次の月' }).click();
  await expectN(5, 5, '2026-12-10');
  await page.getByRole('button', { name: '次の月' }).click(); await page.getByRole('button', { name: '次の月' }).click();
  await expectN(4, 5, '2027-02-10');
});

test('「全部」「手帳」でも最下段はタブの上、全予定へ到達でき、暗色・回転後も崩れない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(page, MIXED);
  await setSafe(page, { r: 84 });
  await setStyle(page, '全部');
  let g = await geom(page);
  near(g.bottom, 603, 0.6);
  const sc = page.locator('.spread .scroll.all');
  await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(page.locator('.spread .week.all [data-date="2026-11-30"]')).toBeVisible();
  const b = await page.locator('.spread [data-date="2026-11-30"]').boundingBox();
  expect(b.y + b.height).toBeLessThanOrEqual(g.tabsTop + 0.5);
  await setStyle(page, '手帳');
  g = await geom(page);
  near(g.bottom, 603, 0.6);
  await expect(page.locator('.spread [data-date="2026-11-30"] .dot')).toHaveCount(4);
  await setStyle(page, '予定名');
  // 回転（閉じた幅 → 横へ戻す）
  await page.setViewportSize(SIZES.openPortrait669);
  await page.setViewportSize(SIZES.openLandscape951);
  await expect.poll(async () => (await geom(page)).bottom).toBeGreaterThan(0);
  g = await geom(page);
  near(g.bottom, 603, 0.6);
  const ov = await page.evaluate(() => ({ x: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth, y: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight }));
  expect(ov.x).toBeLessThanOrEqual(0); expect(ov.y).toBeLessThanOrEqual(0);
});
