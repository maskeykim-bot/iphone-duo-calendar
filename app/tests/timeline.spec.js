// 第10版 ④: 見開き（開いた横）の右ページ時間軸・折り目の保護域・76px の操作列・非対称 safe。
// 画面サイズ・折り目は固定せず、innerWidth/2 を実測して検査する。
import { test, expect } from '@playwright/test';
import { openApp, loadSample, tab, layout, seed, ev, openMenu, SIZES } from './helpers.js';
import { CAT_IDS } from '../js/categories.js';

const SPREADS = [SIZES.openLandscape, SIZES.openLandscape951, { width: 1024, height: 768 }];
const SAFE = { top: 47, right: 30, bottom: 34, left: 20 }; // 非対称
const day = (n) => `2026-11-${String(n).padStart(2, '0')}`;
const T = (d, hm) => `${day(d)}T${hm}`;

const SEED = [
  ev('a', '朝の会', T(12, '00:00'), T(12, '00:30')), ev('b', '夜', T(12, '23:00'), T(12, '23:59')),
  ev('c', '日またぎ', T(11, '22:00'), T(13, '02:00')), ev('d1', '重複A', T(12, '13:00'), T(12, '14:00')), ev('d2', '重複B', T(12, '13:30'), T(12, '15:00')),
  ev('e', '給与振込み', day(12), day(13), { all: true }), ev('f', '会議', T(12, '10:00'), T(12, '11:00')),
].map((e) => (e.all ? { ...e, start: day(12), end: day(13) } : e));

async function withSafe(page, S = SAFE) {
  await page.addStyleTag({ content: `:root{--sat:${S.top}px;--sar:${S.right}px;--sab:${S.bottom}px;--sal:${S.left}px}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--content-y'))).toBe(`${S.top}px`);
}
const hh = (page) => page.evaluate(() => { const l = [...document.querySelectorAll('.tl .hl:not(.half)')]; return l[1].getBoundingClientRect().top - l[0].getBoundingClientRect().top; });
const blocks = (page) => page.locator('.tl .tlev');

// 折り目の保護域（中心±10）に、文字・枠・背景・線・操作の「見えている矩形」が入っていないか。祖先の overflow で切られた分は見えない。
async function foldHits(page) {
  return page.evaluate(() => {
    const f = window.innerWidth / 2, A = f - 10, B = f + 10, hits = [];
    const clip = (el, r) => {
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const q = a.getBoundingClientRect(); r = { left: Math.max(r.left, q.left), right: Math.min(r.right, q.right), top: Math.max(r.top, q.top), bottom: Math.min(r.bottom, q.bottom) }; }
      }
      return r;
    };
    const cross = (r) => r.right - r.left > 0 && r.bottom - r.top > 0 && r.right > A + 0.5 && r.left < B - 0.5;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!n.nodeValue.trim() || el.closest('[hidden],#status,script,style') || el.closest('dialog:not([open])')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r0 of rg.getClientRects()) if (cross(clip(el, { left: r0.left, right: r0.right, top: r0.top, bottom: r0.bottom }))) hits.push(`text:${n.nodeValue.trim()}`);
    }
    for (const el of document.querySelectorAll('#app *, dialog[open], dialog[open] *')) {
      if (el.matches('.shell,#app,.page,.tlcols,.tlin,.tl,.adcols,.scroll,.msc')) continue; // 背景だけの器
      if (el.closest('dialog:not([open]),[hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const q = el.getBoundingClientRect();
      const bw = Math.max(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderLeftWidth) || 0, parseFloat(cs.borderBottomWidth) || 0, parseFloat(cs.borderRightWidth) || 0);
      const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || bw > 0 || cs.boxShadow !== 'none' || el.matches('button,input,select,textarea');
      if (!painted) continue;
      let r = clip(el, { left: q.left, right: q.right, top: q.top, bottom: q.bottom });
      // 影は矩形の外へ広がる分も数える
      if (cs.boxShadow !== 'none' && !cs.boxShadow.includes('inset')) { const m = cs.boxShadow.match(/(-?[\d.]+)px/g) || []; const sp = Math.max(0, ...m.map((v) => Math.abs(parseFloat(v)))); r = { left: r.left - sp, right: r.right + sp, top: r.top, bottom: r.bottom }; }
      if (cross(r)) hits.push(`box:${el.className || el.tagName}`);
    }
    return hits;
  });
}
// フォーカス枠（outline）の矩形が保護域へ入らないこと。ページ内の操作を順に focus する。
async function focusHits(page) {
  return page.evaluate(() => {
    const f = window.innerWidth / 2, A = f - 10, B = f + 10, hits = [];
    for (const el of document.querySelectorAll('.page button:not([hidden]), .rail button, .tabs button')) {
      const q0 = el.getBoundingClientRect();
      if (q0.width < 1 || q0.height < 1) continue;
      el.focus({ preventScroll: true });
      const cs = getComputedStyle(el);
      if (cs.outlineStyle === 'none') continue;
      const grow = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
      let r = { left: q0.left - grow, right: q0.right + grow, top: q0.top - grow, bottom: q0.bottom + grow };
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX !== 'visible') { const q = a.getBoundingClientRect(); r = { ...r, left: Math.max(r.left, q.left), right: Math.min(r.right, q.right) }; }
      }
      if (r.right - r.left > 0 && r.right > A + 0.5 && r.left < B - 0.5) hits.push(`focus:${el.className || el.tagName}:${el.dataset.date || el.dataset.act || ''}`);
    }
    return hits;
  });
}

test.describe('見開き: 判定・背景・操作列', () => {
  for (const size of SPREADS) {
    test(`${size.width}×${size.height}: spread 判定・背景は中心で直接接続・76px 列・操作は 48px 以上で重ならない`, async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      expect(await layout(page)).toBe('spread');
      const f = size.width / 2;
      const bg = await page.evaluate((f) => {
        const probe = (x) => { const e = document.elementsFromPoint(x, 300).find((el) => el.matches('.shell')); return e ? getComputedStyle(e).backgroundImage : ''; };
        return { img: probe(f - 30), fold: getComputedStyle(document.documentElement).getPropertyValue('--fold-x') };
      }, f);
      expect(parseFloat(bg.fold)).toBe(f);
      expect(bg.img).toMatch(/240, 237, 229/);
      expect(bg.img).toMatch(/255, 253, 250/);
      // 操作列の各ボタン 48×48 以上・中心と四隅(内1px)がそのボタンに届く・互いに重ならない
      const names = ['今日に戻る', '月を開く', '一覧を開く', '予定を検索', '予定を追加'];
      const rects = [];
      for (const n of names) {
        const b = page.locator('.srail').getByRole('button', { name: n });
        const r = await b.boundingBox();
        expect(r.width).toBeGreaterThanOrEqual(48 - 0.5);
        expect(r.height).toBeGreaterThanOrEqual(48 - 0.5);
        const ok = await b.evaluate((el) => { const q = el.getBoundingClientRect(); return [[.5, .5], [0, 0], [1, 0], [0, 1], [1, 1]].every(([a, c]) => { const x = q.left + 8 + a * (q.width - 16), y = q.top + 8 + c * (q.height - 16); return el.contains(document.elementFromPoint(x, y)); }); });
        expect(ok).toBe(true);
        rects.push(r);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true);
      }
      for (const n of ['前の月', '次の月', 'その他']) { const r = await page.getByRole('button', { name: n }).first().boundingBox(); expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(44); expect(r.x + r.width).toBeLessThanOrEqual(f - 10 + 0.5); }
      const tabs = await page.locator('.tabs').boundingBox();
      expect(tabs.x + tabs.width).toBeLessThanOrEqual(f - 10 + 0.5);
      for (const b of await page.locator('.tabs button').all()) { const r = await b.boundingBox(); expect(r.width).toBeGreaterThanOrEqual(44); expect(r.height).toBeGreaterThanOrEqual(46 - 0.5); }
    });
  }

  test('890×626 非対称 safe: 左右ページ・操作列は安全矩形の内側、折り目は画面中心のまま', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await loadSample(page);
    await withSafe(page);
    const W = 890, H = 626;
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fold-x'))).toBe(`${W / 2}px`);
    const lp = await page.locator('.page.lp').boundingBox(), rp = await page.locator('.page.rp').boundingBox(), rail = await page.locator('.srail').boundingBox();
    expect(lp.x).toBeGreaterThanOrEqual(SAFE.left + 8 - 0.5);
    expect(lp.x + lp.width).toBeCloseTo(W / 2 - 10, 0);
    expect(rp.x).toBeCloseTo(W / 2 + 10, 0);
    expect(rp.y).toBeGreaterThanOrEqual(SAFE.top - 0.5);
    expect(rp.y + rp.height).toBeLessThanOrEqual(H - SAFE.bottom + 0.5);
    expect(rp.x + rp.width).toBeCloseTo(W - SAFE.right - 76, 0);
    for (const n of ['今日に戻る', '予定を追加']) { const r = await page.locator('.srail').getByRole('button', { name: n }).boundingBox(); expect(r.y + r.height).toBeLessThanOrEqual(H - SAFE.bottom + 0.5); expect(r.x + r.width).toBeLessThanOrEqual(W - SAFE.right + 0.5); }
    const tabs = await page.locator('.tabs').boundingBox();
    expect(tabs.y + tabs.height).toBeLessThanOrEqual(H - SAFE.bottom + 0.5);
    expect(rail.x + rail.width).toBeCloseTo(W, 0); // 列の背景は画面端まで
    expect(await foldHits(page)).toEqual([]);
  });
});

test.describe('見開き: 折り目の保護域（文字・罫線・チップ・操作・影・focus）', () => {
  for (const size of SPREADS) {
    test(`${size.width}×${size.height}（非対称 safe）: どのビューでも・メニューやパネル中でも・resize 後も保護域に何も入らない`, async ({ page }) => {
      await openApp(page, size);
      await seed(page, SEED);
      await withSafe(page);
      const probs = [];
      const check = async (label) => { for (const h of await foldHits(page)) probs.push(`${label} ${h}`); for (const h of await focusHits(page)) probs.push(`${label} ${h}`); };
      await check('月');
      await page.locator('[data-act="tl3"]').click();
      await check('月/3日');
      await page.locator('[data-act="tl3"]').click();
      await tab(page, '週').click(); await check('週');
      await tab(page, '日').click(); await check('日');
      await page.locator('.srail').getByRole('button', { name: '一覧を開く' }).click(); await check('一覧');
      await page.locator('.srail').getByRole('button', { name: '月を開く' }).click(); await check('月2');
      // 全部の月
      await openMenu(page);
      await page.locator('#menu').getByRole('button', { name: '月の表現', exact: true }).click();
      await page.locator('#m-variant').getByRole('button', { name: '全部', exact: true }).click();
      await check('全部');
      await page.locator('.scroll.all').evaluate((e) => { e.scrollTop = e.scrollHeight; });
      await check('全部/末尾');
      // メニュー（左ページ内）・編集パネル（右ページ内）
      await openMenu(page); await check('menu'); await page.keyboard.press('Escape');
      await page.locator('[data-act="add"]').first().click(); await expect(page.locator('#editor')).toBeVisible(); await check('editor'); await page.keyboard.press('Escape');
      await page.locator('[data-act="search"]').first().click(); await expect(page.locator('#search')).toBeVisible(); await check('search'); await page.keyboard.press('Escape');
      // resize 後
      await page.setViewportSize({ width: size.width + 40, height: size.height });
      await page.waitForTimeout(150);
      await check('resize');
      expect(probs).toEqual([]);
    });
  }

  test('スワイプのアニメーション途中も保護域へ描画が漏れない', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await seed(page, SEED);
    await page.evaluate(() => { window.__hits = []; });
    // アニメ中を採取するため、next を押す代わりに Web Animations を直接進める
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('.scroll > *, .agenda > *, .hero > *, .remaining > *, .margin > *')];
      els.forEach((el) => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(32px)' }], { duration: 100000, fill: 'forwards' }).pause());
      document.querySelectorAll('.page').forEach((p) => p.getAnimations?.());
      els.forEach((el) => el.getAnimations().forEach((a) => { a.currentTime = 100000; }));
    });
    expect(await foldHits(page)).toEqual([]);
  });
});

test.describe('見開き: 右ページの時間軸', () => {
  for (const [size, minHours] of [[SIZES.openLandscape, 8.5], [SIZES.openLandscape951, 9.3]]) {
    test(`${size.width}×${size.height}: 60px/時・${minHours}時間以上が見える・現在札と赤線・今の1時間前から`, async ({ page }) => {
      await openApp(page, size);
      await seed(page, SEED_LIGHT);
      expect(Math.round(await hh(page))).toBe(60);
      const tl = await page.locator('.tl').evaluate((e) => ({ ch: e.clientHeight, st: e.scrollTop }));
      expect(tl.ch / 60).toBeGreaterThanOrEqual(minHours);
      expect(Math.abs(tl.st - (9 * 60 + 41 - 60))).toBeLessThanOrEqual(1); // 2026-11-12 09:41 の1時間前
      const now = page.locator('.nowt');
      await expect(now).toHaveText('09:41');
      const [pill, line] = await Promise.all([now.boundingBox(), page.locator('.nowl').evaluate((e) => { const c = getComputedStyle(e, '::before'); return { h: parseFloat(c.height), bg: c.backgroundColor }; })]);
      expect(Math.round(pill.height)).toBe(22);
      expect(line.h).toBeCloseTo(1.5, 1);
      expect(line.bg).toBe('rgb(214, 69, 65)');
      const pr = await now.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, c: getComputedStyle(e).color, r: getComputedStyle(e).borderRadius }));
      expect(pr).toEqual({ bg: 'rgb(214, 69, 65)', c: 'rgb(255, 255, 255)', r: '11px' });
      // 時刻列 44px・線は a+50 から
      const rp = await page.locator('.page.rp').boundingBox();
      const l0 = await page.locator('.tl .hl').first().boundingBox();
      expect(Math.round(l0.x - rp.x)).toBe(50);
    });
  }

  test('今日でない日を選ぶと現在札は出ず、日の変更で今の1時間前へ戻る', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, SEED_LIGHT);
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.nowl')).toBeHidden();
    await page.locator('.tl').evaluate((e) => { e.scrollTop = 0; });
    await page.locator('[data-date="2026-11-19"]').click({ position: { x: 12, y: 10 } });
    await expect.poll(() => page.locator('.tl').evaluate((e) => e.scrollTop)).toBeGreaterThan(400);
    await page.locator('[data-act="today"]').click();
    await expect(page.locator('.nowt')).toBeVisible();
  });

  test('0時・23時・日またぎ・同時刻の重なり・終日4件', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, SEED.concat([ev('g1', '終日1', day(12), day(12), { all: true }), ev('g2', '終日2', day(12), day(12), { all: true }), ev('g3', '終日3', day(12), day(12), { all: true }), ev('g4', '終日4', day(12), day(12), { all: true })].map((e) => ({ ...e, start: day(12), end: day(12) }))));
    const byId = async (id) => page.locator(`.tl .tlev[data-event="${id}"]`).evaluate((e) => { const r = e.getBoundingClientRect(), p = e.closest('.tlin').getBoundingClientRect(); return { top: r.top - p.top, h: r.height, left: r.left - e.parentElement.getBoundingClientRect().left, w: r.width, cw: e.parentElement.getBoundingClientRect().width }; });
    const a = await byId('a'), b = await byId('b'), c = await byId('c');
    expect(a.top).toBeCloseTo(12, 0); // 0:00
    expect(a.h).toBeGreaterThanOrEqual(20);
    expect(b.top).toBeCloseTo(12 + 23 * 60, 0);
    expect(b.top + b.h).toBeLessThanOrEqual(12 + 24 * 60 + 1);
    // 11/11 22:00〜11/13 02:00 は 11/12 では 0〜24 時いっぱい
    expect(c.top).toBeCloseTo(12, 0);
    expect(Math.round(c.h)).toBeGreaterThanOrEqual(24 * 60 - 2);
    const d1 = await byId('d1'), d2 = await byId('d2');
    expect(Math.abs(d1.w - d2.w)).toBeLessThan(1);
    expect(d1.w).toBeLessThan(d1.cw / 3 + 1); // 日またぎ(c)も含め3列
    expect(d1.left).not.toBeCloseTo(d2.left, 0);
    // 終日 4 件（+ 給与振込み）: ピル3件まで、あふれは +N
    const pills = await page.locator('.adpill').count();
    expect(pills).toBeLessThanOrEqual(3);
    const plus = page.locator('.adplus');
    await expect(plus).toHaveCount(1);
    await expect(plus).toContainText('+');
    const pr = await plus.boundingBox();
    expect(pr.height).toBeGreaterThanOrEqual(28 - 0.5);
    await plus.click();
    await expect(page.locator('.agenda .event')).toHaveCount(11); // 日表示へ（その日の全件: 時刻付き7・給与・終日4）
  });

  test('1日／3日切替: 3本の時間列・同じスクロール・日付で選択日を更新', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, SEED_LIGHT);
    await expect(page.locator('.tlcol')).toHaveCount(1);
    await page.locator('[data-act="tl3"]').click();
    await expect(page.locator('.tlcol')).toHaveCount(3);
    expect(await page.locator('.tlcol').evaluateAll((l) => l.map((e) => e.dataset.day))).toEqual([day(12), day(13), day(14)]);
    const st = await page.locator('.tl').evaluate((e) => e.scrollTop);
    expect(st).toBeGreaterThan(400);
    await page.locator('[data-tlday="2026-11-13"]').click();
    await expect(page.locator('[data-date="2026-11-13"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tlcol').first()).toHaveAttribute('data-day', day(13));
    await page.locator('[data-act="tl3"]').click();
    await expect(page.locator('.tlcol')).toHaveCount(1);
  });

  const pinch = (page, d0, d1, cy) => page.evaluate(({ d0, d1, cy }) => {
    const tl = document.querySelector('.tl'), r = tl.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + (cy ?? r.height / 2);
    const fire = (t, id, px, name) => t.dispatchEvent(new PointerEvent(name, { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: px, clientY: y, button: 0, buttons: name === 'pointerup' ? 0 : 1 }));
    const target = tl.querySelector('.tlcol');
    fire(target, 1, x - d0 / 2, 'pointerdown'); fire(target, 2, x + d0 / 2, 'pointerdown');
    for (let i = 1; i <= 6; i++) { const d = d0 + (d1 - d0) * i / 6; fire(target, 1, x - d / 2, 'pointermove'); fire(target, 2, x + d / 2, 'pointermove'); }
    fire(target, 1, x - d1 / 2, 'pointerup'); fire(target, 2, x + d1 / 2, 'pointerup');
  }, { d0, d1, cy });
  test('ピンチ: 31〜80px/時の範囲・中心時刻を保つ・操作ボタンでも拡大縮小できる', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, SEED_LIGHT);
    const center = () => page.locator('.tl').evaluate((e) => { const h = parseFloat(getComputedStyle(e).getPropertyValue('--hh')); return { h, min: (e.scrollTop + e.clientHeight / 2 - 12) / h * 60 }; });
    const before = await center();
    await pinch(page, 100, 130);
    const mid = await center();
    expect(mid.h).toBeGreaterThan(60);
    expect(Math.abs(mid.min - before.min)).toBeLessThan(8);
    await pinch(page, 100, 900);
    expect((await center()).h).toBe(80);
    await pinch(page, 900, 20);
    expect((await center()).h).toBe(31);
    expect(Math.round(await hh(page))).toBe(31);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await openMenu(page);
    await page.locator('#menu').getByRole('button', { name: '時間軸を拡大' }).click();
    expect((await center()).h).toBeGreaterThan(60);
  });

  test('空きタップで30分刻みの1時間の予定を追加。ドラッグ・ピンチの後は追加しない', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await page.locator('.tl').evaluate((e) => { e.scrollTop = 500; });
    const at = (min) => page.locator('.tlcol').evaluate((c, min) => { const r = c.getBoundingClientRect(), h = parseFloat(getComputedStyle(c.closest('.tl')).getPropertyValue('--hh')); return { x: r.left + r.width / 2, y: r.top + 12 + min * h / 60 }; }, min);
    const p = await at(10 * 60 + 40); // 10:40 → 10:30
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x, p.y + 40, { steps: 4 }); await page.mouse.up();
    await expect(page.locator('#editor')).toBeHidden(); // ドラッグ後
    await page.waitForTimeout(450);
    const q = await at(10 * 60 + 40);
    await page.mouse.click(q.x, q.y);
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-start')).toHaveValue('2026/11/12 10:30');
    await expect(page.locator('#f-end')).toHaveValue('2026/11/12 11:30');
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeHidden();
    // ピンチ直後
    await pinch(page, 100, 140);
    const r = await at(14 * 60);
    await page.mouse.click(r.x, r.y);
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('日: 左が時間軸・右が詳細一覧、週は前4日／後3日の分割リスト、一覧は左の内容＋右の時間軸', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await loadSample(page);
    await tab(page, '日').click();
    await expect(page.locator('.page.lp .tl')).toBeVisible();
    await expect(page.locator('.page.rp .agenda .event')).toHaveCount(5);
    await expect(page.locator('.page.rp .tl')).toHaveCount(0);
    await tab(page, '週').click();
    await expect(page.locator('.page.lp .weekrow')).toHaveCount(4);
    await expect(page.locator('.page.rp .weekrow')).toHaveCount(3);
    await tab(page, '一覧').click();
    await expect(page.locator('.page.lp .listview')).toBeVisible();
    await expect(page.locator('.page.rp .tl')).toBeVisible();
    await tab(page, '月').click();
    await expect(page.locator('.page.lp .week').first()).toBeVisible();
    // 時間軸の予定から編集が開く
    await page.locator('.tl .tlev').first().click();
    await expect(page.locator('#editor')).toBeVisible();
  });
});

const SEED_LIGHT = [ev('s1', '会議', T(12, '10:00'), T(12, '11:00')), ev('s2', '資料', T(18, '09:00'), T(18, '10:00'))];
void CAT_IDS;
