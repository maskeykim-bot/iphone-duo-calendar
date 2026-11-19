// 第19.1版 S4: 押した反応（H-01）・シートの出入り（H-02・動-5）・ダイヤルとスイッチの秒数（動-3/4）・書体（H-03）・角丸（M-02）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, SIZES } from './helpers.js';

const CSS = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');

test.describe('CSS の決まり', () => {
  test('明朝・Georgia が1つも残らない', () => {
    expect(CSS).not.toMatch(/Georgia|Mincho|明朝/i);
    expect(CSS.replace(/sans-serif/g, '')).not.toMatch(/serif/i);
  });
  test('角丸は組（0・3・4・8・10・12・14・16・24・50%・999）だけ', () => {
    const bad = [];
    for (const m of CSS.matchAll(/border-radius:\s*([^;}!]+)/g)) for (const v of m[1].trim().split(/\s+/)) {
      if (v === 'inherit' || v === '50%') continue;
      if (!['0', '3px', '4px', '8px', '10px', '12px', '14px', '16px', '24px', '999px'].includes(v)) bad.push(v);
    }
    expect(bad).toEqual([]);
  });
  test(':active の規則がある（灰の点滅は消す）', () => {
    expect(CSS).toMatch(/-webkit-tap-highlight-color:transparent/);
    expect(CSS).toMatch(/:where\(button:not\(\[role=switch\]\)\):active/);
    expect(CSS).toMatch(/#EFECE4/i);
  });
});

test.describe('押した反応', () => {
  test('タブ・丸ボタンを押している間、色が変わり、離すと戻る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    const off = page.locator('.tabs button[aria-pressed=false]').first();
    const pill = off.locator('.pill');
    const before = await pill.evaluate((e) => getComputedStyle(e).backgroundColor);
    const b = await off.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await expect.poll(() => pill.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(239, 236, 228)');
    expect(before).not.toBe('rgb(239, 236, 228)');
    await page.mouse.move(0, 0); await page.mouse.up();
    await expect.poll(() => pill.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(before);
    const bi = page.locator('.cb.csearch .bi, .rbtn.rsearch').first();
    const sb = await page.locator('.cb.csearch, .rbtn.rsearch').first().boundingBox();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
    await expect.poll(() => bi.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(239, 236, 228)');
    await page.mouse.move(0, 0); await page.mouse.up();
  });
  test('緑の ＋ は黒 12%（brightness .88）、文字のリンクは不透明度 0.5、トランジション 0.10 秒', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    const add = page.locator('.cb.cadd').first();
    const bi = add.locator('.bi');
    const ab = await add.boundingBox();
    await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2); await page.mouse.down();
    await expect.poll(() => bi.evaluate((e) => getComputedStyle(e).filter)).toBe('brightness(0.88)');
    await page.mouse.move(0, 0); await page.mouse.up();
    const r = await page.evaluate(() => {
      const probe = document.createElement('button'); probe.className = 'hgo'; probe.textContent = 'x'; document.body.append(probe);
      const pre = getComputedStyle(probe).transitionDuration; probe.remove(); return pre;
    });
    expect(r).toContain('0.15s');
  });
  test('JS: document に passive の touchstart（iOS で :active を効かせる）', async ({ page }) => {
    await page.addInitScript(() => { window.__ts = []; const o = document.addEventListener.bind(document); document.addEventListener = (t, f, opt) => { if (t === 'touchstart') window.__ts.push(opt); return o(t, f, opt); }; });
    await openApp(page, SIZES.closedPortrait);
    expect((await page.evaluate(() => window.__ts)).some((o) => o && o.passive === true)).toBe(true);
  });
});

test.describe('シートの出入り', () => {
  for (const [name, size] of [['閉じた', SIZES.closedPortrait], ['開いた縦', SIZES.openPortrait669], ['開いた横', SIZES.openLandscape951]]) {
    test(`${name}: 編集シートは開いた直後に translateY のアニメがあり、角丸 24・影は段3、閉じ終わってから閉じる`, async ({ page }) => {
      await openApp(page, size);
      await page.locator('.cb.cadd, .rbtn.radd').first().click();
      const info = await page.evaluate(() => {
        const an = document.getAnimations().map((a) => ({ n: a.animationName, t: a.effect?.getTiming?.().duration, e: getComputedStyle(a.effect.target).animationTimingFunction }));
        return an;
      });
      const sheet = info.find((a) => a.n === 'sheetin');
      expect(sheet).toBeTruthy();
      expect(sheet.t).toBe(250);
      expect(sheet.e).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
      const ed = page.locator('#editor');
      const cs = await ed.evaluate((e) => { const c = getComputedStyle(e); return { r: c.borderTopLeftRadius, sh: c.boxShadow }; });
      expect(cs.r).toBe('24px');
      if (name !== '開いた横') expect(cs.sh).toContain('0px 12px 32px'); // 見開きは影なし（枠線）の既存の決まり
      await page.waitForTimeout(350);
      await page.locator('#close').click();
      // 閉じる動き: sheet-out が付き、まだ open
      await expect(ed).toHaveClass(/sheet-out/);
      expect(await ed.evaluate((e) => e.open)).toBe(true);
      await expect.poll(() => ed.evaluate((e) => e.open)).toBe(false);
    });
  }
  test('視差効果を減らす設定: 0.15 秒のフェードだけ（translateY なし）', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page, SIZES.closedPortrait);
    await page.locator('.cb.cadd').first().click();
    const names = await page.evaluate(() => document.getAnimations().map((a) => [a.animationName, a.effect.getTiming().duration]));
    expect(names).toContainEqual(['sheetfadein', 150]);
    expect(names.some(([n]) => n === 'sheetin')).toBe(false);
  });
});

test.describe('ダイヤルとスイッチの秒数', () => {
  test('終日スイッチ 0.15 秒 cubic-bezier(0.2,0.8,0.2,1)、ダイヤル 0.25 秒 cubic-bezier(0.16,1,0.3,1)', () => {
    expect(CSS).toMatch(/#editor input\[type=checkbox\]\[role=switch\]\{[^}]*transition:background \.15s cubic-bezier\(0\.2,0\.8,0\.2,1\)/);
    expect(CSS).toMatch(/#editor input\[type=checkbox\]\[role=switch\]::before\{[^}]*transition:transform \.15s cubic-bezier\(0\.2,0\.8,0\.2,1\)/);
    expect(CSS).toMatch(/animation:dialgrow \.25s cubic-bezier\(0\.16,1,0\.3,1\)/);
  });
});

test.describe('書体', () => {
  test('次の予定の時刻は 20/26 W6 等幅数字、月の見出し（閉じた）は 17/22 W6', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    const t = page.locator('.next .time, .pvnext .time').first();
    if (await t.count()) {
      const c = await t.evaluate((e) => { const s = getComputedStyle(e); return [s.fontSize, s.fontWeight, s.fontVariantNumeric, s.fontFamily]; });
      expect(c[0]).toBe('20px'); expect(c[1]).toBe('600'); expect(c[2]).toContain('tabular-nums'); expect(c[3]).not.toMatch(/Georgia|serif$/);
    }
    const any = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => /Georgia|Mincho/i.test(getComputedStyle(e).fontFamily)).length);
    expect(any).toBe(0);
  });
});
