// 第18版 PR5: 実機の計測 ?curlperf=1。Chromium と WebKit。速さの数字では合否を決めない（箱に GPU はない）。
// 正本：design/IMPL_PLAN_V18.md PR5。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

test.use({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
test.setTimeout(120000);

const UI = 'duo.ui.v1';
async function land(page, query) {
  await page.addInitScript((k) => { if (localStorage.getItem('__cp_seeded')) return; localStorage.setItem('__cp_seeded', '1'); localStorage.setItem(k, JSON.stringify({ selected: '2026-11-12', spreadType: 'tt' })); }, UI);
  await openApp(page, SIZES.openLandscape951, query);
  await page.evaluate(() => document.documentElement.style.setProperty('--sar', '84px'));
  await expect(page.locator('.dpage')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
}

test('CURLPERF: パラメータなしでは札も __curlPerf も出ず、何も出力しない', async ({ page }) => {
  const logs = []; page.on('console', (m) => logs.push(m.text()));
  await land(page);
  await page.waitForTimeout(400);
  expect(await page.locator('#curlperf').count()).toBe(0);
  expect(await page.evaluate(() => typeof window.__curlPerf)).toBe('undefined');
  expect(logs.filter((t) => t.includes('[curlperf]'))).toEqual([]);
  expect(await page.evaluate(() => !!window.__duoCurl)).toBe(true); // めくり自体は今までどおり
});

test('CURLPERF: curlperf=0 でも出ない', async ({ page }) => {
  await land(page, '?curlperf=0');
  expect(await page.locator('#curlperf').count()).toBe(0);
  expect(await page.evaluate(() => typeof window.__curlPerf)).toBe('undefined');
});

test('CURLPERF: ?curlperf=1&auto=2 で前へ・戻り各2回、JSON の項目がそろう', async ({ page }) => {
  const logs = []; page.on('console', (m) => logs.push(m.text()));
  await land(page, '?curlperf=1&auto=2');
  await expect(page.locator('#curlperf')).toBeVisible();
  await page.waitForFunction(() => window.__curlPerf?.auto?.finished === true, null, { timeout: 90000 });
  const r = await page.evaluate(() => JSON.parse(JSON.stringify(window.__curlPerf)));
  expect(r.auto.done + r.auto.failed).toBe(4);
  expect(r.auto.done, '自動のめくりが成立した').toBeGreaterThanOrEqual(2);
  expect(r.turns).toBe(r.auto.done);
  for (const k of ['env', 'firstFrameMs', 'textures', 'frames', 'longTasks', 'memory', 'contextLost', 'lines', 'verdict']) expect(r, k).toHaveProperty(k);
  expect(r.env.dpr).toBeGreaterThan(0); expect(r.env.screen.innerW).toBe(951); expect(r.env.userAgent).toContain('Mozilla');
  expect(typeof r.env.reducedMotion).toBe('boolean'); expect(typeof r.env.dark).toBe('boolean');
  expect(r.firstFrameMs.all.n).toBe(r.turns);
  for (const k of ['p50', 'p95', 'p99', 'max']) { expect(r.firstFrameMs.all[k]).toBeGreaterThanOrEqual(0); expect(r.frames[k]).toBeGreaterThanOrEqual(0); }
  for (const g of ['frontLeft', 'frontRight', 'back']) { expect(r.textures.byKind[g].paintMs.n).toBeGreaterThan(0); expect(r.textures.byKind[g].uploadMs.p50).toBeGreaterThanOrEqual(0); }
  expect(r.frames.n).toBeGreaterThan(0); expect(r.frames.dropRate).toBeGreaterThanOrEqual(0);
  expect(r.longTasks.over50ms).toBeGreaterThanOrEqual(0); expect(typeof r.longTasks.supported).toBe('boolean');
  expect(r.contextLost).toBe(0);
  for (const ph of ['before', 'during', 'after']) { expect(r.memory.phases[ph], ph).toBeTruthy(); expect(r.memory.phases[ph].totalBytes).toBeGreaterThanOrEqual(0); }
  expect(r.memory.phases.during.painterBytes).toBeGreaterThan(0);
  expect(r.memory.phases.after.painterBytes).toBe(0); // 終わって捨てた後
  expect(r.memory.phases.afterDirChange, '向きを変えた直後').toBeTruthy();
  expect(r.memory.estimate.memoryMB).toBe(58.1);
  expect(r.lines.hz60).toEqual({ p95: 18.0, p99: 33.4, dropRate: 0.01, longTasks: 0 });
  expect(r.lines.hz120).toBeTruthy();
  expect(typeof r.verdict.hz60.ok).toBe('boolean'); expect(typeof r.verdict.hz120.ok).toBe('boolean');
  expect(logs.some((t) => t.startsWith('[curlperf]'))).toBe(true);
  expect(await page.locator('#curlperf').innerText()).toContain('curlperf');
  expect(await page.locator('[data-curlperf-copy]').count()).toBe(1);
  // 日は前へ2回・戻り2回でもとの日に戻る
  expect(await page.locator('#app .dpage .dd').first().textContent()).toBeTruthy();
});
