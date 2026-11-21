// 第19.1版 S7c（レビュー後の直し・設計の中・低 V-11〜V-27、品質 中-2・低-1・低-2、STEER 23:00 検索の文）。寸法は getBoundingClientRect で ±1。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, SIZES, seed, ev, tab } from './helpers.js';

const P = SIZES.openPortrait669, L = SIZES.openLandscape951, C = SIZES.closedPortrait;
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const rect = (loc) => loc.first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const band = (page, r) => page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), r);
const bg = (loc) => loc.first().evaluate((e) => getComputedStyle(e).backgroundColor);
const press = async (page, loc) => { const r = await rect(loc); await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await page.mouse.down(); await page.waitForTimeout(220); };

test('V-13 :hover は全部 @media (hover:hover) の中', () => {
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const bad = css.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(':hover') && !l.includes('@media (hover:hover)') && !l.trimStart().startsWith('/*') && !l.trimStart().startsWith(':hover は'));
  expect(bad.map(([i]) => i)).toEqual([]);
  for (const sel of ['.next:hover', '.primary:hover', '.dangerfill:hover']) expect(css, sel).toMatch(new RegExp(`@media \\(hover:hover\\) and \\(pointer:fine\\)\\{[^}]*${sel.replace('.', '\\.')}`));
});

test.describe('S7c 検索の文（STEER 23:00）', () => {
  for (const [name, size, sar] of [['閉じた', C, 84], ['開いた縦', P, 0], ['開いた横', L, 84]]) {
    test(name, async ({ page }) => {
      await openApp(page, size); if (sar) await band(page, sar);
      await page.evaluate(async () => { const db = await import('/js/db.js'); await db.putNote({ id: 'n1', body: '猫のメモ本文', createdAt: 1, updatedAt: 5, folderId: null }); await db.putTask({ id: 't1', title: '犬のタスク', due: null, done: false, doneAt: null, createdAt: 1, updatedAt: 5, order: 1, note: '', notify: false }); });
      await page.reload(); await page.waitForSelector('html[data-ready]'); if (sar) await band(page, sar);
      await page.locator('[data-act="search"]:visible').first().click();
      const q = page.locator('#sr-q'), body = page.locator('#sr-body');
      await q.fill('猫'); await page.waitForTimeout(400);
      let t = await body.innerText();
      expect(t).toContain('予定：この3年に見つかりませんでした'); expect(t).not.toContain('検索語を確認'); expect(t).toContain('猫のメモ');
      const sr = await page.evaluate(() => { const e = document.querySelector('#sr-body .srnone'); const cs = getComputedStyle(e); return [cs.fontSize, cs.color]; });
      expect(sr[0]).toBe('13px'); expect(sr[1]).toBe('rgb(104, 113, 106)');
      await q.fill('犬'); await page.waitForTimeout(400);
      t = await body.innerText();
      expect(t).toContain('予定：この3年に見つかりませんでした'); expect(t).not.toContain('検索語を確認'); expect(t).toContain('犬のタスク');
      await q.fill('zzqq存在しない'); await page.waitForTimeout(400);
      t = await body.innerText();
      expect(t).toContain('見つかりませんでした。検索語を確認してください。'); expect(t).toContain('この3年に見つかりませんでした');
    });
  }
});

test('V-11／品質 中-2 予定の編集の日付・時刻カプセルは押すと #E2DDD2', async ({ page }) => {
  await openApp(page, C); await band(page, 84);
  await page.locator('[data-act="add"]:visible').first().click(); await page.locator('#editor').waitFor();
  for (const sel of ['#editor .tcap:visible', '#editor .dcap:visible']) {
    const el = page.locator(sel).first(); const before = await bg(el);
    await press(page, el); expect(await bg(el), sel).toBe('rgb(226, 221, 210)'); await page.mouse.up();
    expect(before).toBe('rgb(239, 236, 228)');
  }
});

test('V-12 「今日」の文字リンクは不透明度 0.5・地なし', async ({ page }) => {
  await openApp(page, C); await band(page, 84); await tab(page, '月').click(); await page.waitForTimeout(300);
  const el = page.locator('.mptoday').first(); await press(page, el);
  const s = await el.evaluate((e) => { const cs = getComputedStyle(e); return [cs.opacity, cs.backgroundColor]; }); await page.mouse.up();
  expect(Number(s[0])).toBeCloseTo(0.5, 1); expect(s[1]).toBe('rgba(0, 0, 0, 0)');
});

test('V-16 閉じたホームの行・「ほか n件」は 44', async ({ page }) => {
  await openApp(page, C); await seed(page, [ev('h1', '会議', '2026-11-12T10:00', '2026-11-12T10:30'), ev('h2', '終日の件', '2026-11-12', '2026-11-12', { all: true }), ev('h3', '夕方', '2026-11-12T17:00', '2026-11-12T18:00'), ev('h4', '夜', '2026-11-12T19:00', '2026-11-12T20:00'), ev('h5', '深夜', '2026-11-12T21:00', '2026-11-12T22:00'), ev('h6', '最後', '2026-11-12T22:30', '2026-11-12T23:00')]); await band(page, 84); await tab(page, 'ホーム').click(); await page.waitForTimeout(300);
  const rows = await page.locator('.hrow').evaluateAll((e) => e.map((x) => x.getBoundingClientRect().height));
  expect(rows.length).toBeGreaterThan(0); for (const h of rows) near(h, 44);
  const more = page.locator('.hmore'); if (await more.count()) near((await rect(more)).h, 44);
});

test('V-17 開いた縦ホームの「月 ›」は 44×44（x613・y492）', async ({ page }) => {
  await openApp(page, P); await tab(page, 'ホーム').click(); await page.waitForTimeout(300);
  const r = await rect(page.locator('.pv-week .hgo')); near(r.x, 613); near(r.y, 492); near(r.w, 44); near(r.h, 44);
});

test('V-23（R-75 で置き換え）チップの上で押しても、そのマスの地は #E2DDD2（押した反応はマスだけ。チップの被せは出さない）', async ({ page }) => {
  await openApp(page, C); await band(page, 84);
  await seed(page, [ev('c1', '朝会', '2026-11-12T09:00', '2026-11-12T09:30')]); await band(page, 84);
  await tab(page, '月').click(); await page.waitForTimeout(300);
  const day = page.locator('.week .day[data-date="2026-11-12"]'); const base = await bg(day);
  const chip = page.locator('.week .strip[data-event="c1"]').first(); await expect(chip).toBeVisible();
  await press(page, chip);
  await page.waitForTimeout(200); expect(await bg(day)).toBe('rgb(226, 221, 210)'); await expect(page.locator('.chip-press')).toHaveCount(0); await page.mouse.up(); await page.waitForTimeout(400);
});

test('V-23 対照: マスの空きを押したときも #E2DDD2（R-75）', async ({ page }) => {
  await openApp(page, C); await band(page, 84); await tab(page, '月').click(); await page.waitForTimeout(300);
  const e2 = page.locator('.week .day[data-date="2026-11-17"]'); const r = await rect(e2); await page.mouse.move(r.x + 40, r.y + 20); await page.mouse.down(); await page.waitForTimeout(220);
  expect(await bg(e2)).toBe('rgb(226, 221, 210)'); await page.mouse.up();
});

test('V-25／V-14 設定の上の端は y24、膜は 0.25 秒で 0→1', async ({ page }) => {
  for (const [size, sar] of [[C, 84], [L, 84]]) {
    await openApp(page, size); await band(page, sar);
    await page.locator('[data-act="menu"]:visible').first().click(); await page.waitForTimeout(400);
    near((await rect(page.locator('dialog#menu'))).y, 24);
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  }
});
test('V-14 設定の膜は 0.25 秒で 0→1', async ({ page }) => {
  await openApp(page, C, '', { motion: true }); await band(page, 84); await page.waitForTimeout(300);
  await page.locator('[data-act="menu"]:visible').first().click();
  const a = await page.evaluate(async () => { const d = document.querySelector('dialog#menu'); const an = d.getAnimations(); an.forEach((x) => x.pause()); const out = []; for (const t of [0, 125, 250]) { an.forEach((x) => { x.currentTime = t; }); await new Promise((r) => requestAnimationFrame(() => r())); out.push([getComputedStyle(d).boxShadow, an.map((x) => x.animationName).join()]); } return out; });
  expect(a[0][1]).toContain('dimin12'); expect(a[0][0]).toContain('rgba(0, 0, 0, 0) 0px 0px 0px'); expect(a[2][0]).toContain('rgba(0, 0, 0, 0.12) 0px 0px 0px');
});

test('V-26 「全部」高さ28・角丸14・13pt W6、選ぶと緑の地に白', async ({ page }) => {
  await openApp(page, C); await band(page, 84); await tab(page, '月').click(); await page.waitForTimeout(300);
  const sp = page.locator('.allbtn span').first(); await expect(sp).toHaveText('全部');
  let s = await sp.evaluate((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { h: r.height, br: cs.borderRadius, fs: cs.fontSize, fw: cs.fontWeight, bg: cs.backgroundColor, c: cs.color }; });
  near(s.h, 28); expect(s.br).toBe('14px'); expect(s.fs).toBe('13px'); expect(s.fw).toBe('600');
  near((await rect(page.locator('.allbtn'))).h, 44);
  await page.locator('.allbtn').first().click(); await page.waitForTimeout(400);
  s = await page.locator('.allbtn span').first().evaluate((e) => { const cs = getComputedStyle(e); return { bg: cs.backgroundColor, c: cs.color }; });
  expect(s.bg).toBe('rgb(41, 78, 66)'); expect(s.c).toBe('rgb(255, 255, 255)');
});

test('V-27 右の帯でタスクを開くと中身が 0.15 秒フェード', async ({ page }) => {
  await openApp(page, C); await band(page, 84); await page.waitForTimeout(400);
  const info = await page.evaluate(() => { document.querySelector('[data-act="strip"][data-strip="task"]').click(); const el = document.querySelector('.mpane.s7fade'); return el ? getComputedStyle(el).animationDuration : null; });
  expect(info).toBe('0.15s');
  await page.waitForTimeout(300); expect(await page.locator('.s7fade').count()).toBe(0);
});

test('V-22 段にない太さ・大きさが残らない（700・800・10.83・18）', async ({ page }) => {
  await openApp(page, C); await band(page, 84);
  const bad = await page.evaluate(() => { const o = []; for (const e of document.querySelectorAll('body *')) { const cs = getComputedStyle(e), r = e.getBoundingClientRect(); if (r.width < 1 || !(e.textContent || '').trim()) continue; if (['700', '800'].includes(cs.fontWeight) || cs.fontSize === '10.8333px' || cs.fontSize === '18px') o.push(e.className + ':' + cs.fontSize + '/' + cs.fontWeight); } return o; });
  expect(bad).toEqual([]);
});
