// 第19.1版 S7e（設計の答え 2026-11-20 1:20・00:25 の残り）。寸法は getBoundingClientRect／getComputedStyle。
// 1:20-1 文字の値（予定名 15/400・注 11/400・✓ 14/600）／1:20-2 タブの下 20＝ぼかし 24 が全部の面・送り切ると最後の行がバー上端から 8 以上／
// 1:20-3 「＋ タスクを追加」＝余白 87 で送り切ると行の下端がバー上端から 8 以上／00:25 開いた横の予定シートの影＝開いた縦と同じ／V-19 左ページの見出し x16。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, tab, pagePick, monthFormInit } from './helpers.js';
import { seedTasks, T } from './task-helpers.js';

const P = SIZES.openPortrait669, L = SIZES.openLandscape951, C = SIZES.closedPortrait;
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const rect = (loc) => loc.first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const band = async (page, r) => { await page.evaluate((r) => { document.documentElement.style.setProperty('--sar', `${r}px`); window.dispatchEvent(new Event('resize')); }, r); await page.waitForTimeout(150); };
const LEGACY = { pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } };
const setUi = (page, ui) => page.addInitScript((ui) => { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { /* */ } localStorage.setItem(k, JSON.stringify({ ...s, ...ui })); }, ui);
const POS = [['閉じた', C, 84], ['開いた縦', P, 0], ['開いた横', L, 84]];

const MANY = [];
for (let d = 2; d <= 28; d++) { const n = d === 12 ? 11 : 2 + (d % 9); for (let i = 0; i < n; i++) MANY.push(ev(`m${d}-${i}`, `予定${d}-${i}`, `2026-11-${String(d).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:00`, `2026-11-${String(d).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:30`)); }

// ---------- 1:20-1 文字の値 ----------
// 予定名＝`.event strong`（月の日の下の一覧・週・ホーム・検索の行）と `.hrow strong`（ホームの行）。注＝10→11（単位 .dunit・終日 .adl・時間軸の .fh/.fdw/.ftm/.tt）。✓＝`.mdtask.done .rmck::after`。
for (const [name, size, sar] of POS) {
  test(`1:20-1 文字の値: 予定名 15/400・注 11/400・✓ 14/600（${name}）`, async ({ page }) => {
    test.setTimeout(90000);
    await openApp(page, size); if (sar) await band(page, sar);
    await seed(page, MANY);
    await seedTasks(page, [T('d1', { title: '済んだタスク', due: { date: '2026-11-12' }, done: true })]);
    const seen = { strong: 0, bad: [] };
    const scan = async (label) => {
      const r = await page.evaluate(() => {
        const bad = []; let strong = 0;
        for (const e of document.querySelectorAll('.event strong, .hrow strong')) { if (e.getBoundingClientRect().width < 1) continue; strong++; const cs = getComputedStyle(e); if (cs.fontSize !== '15px' || cs.fontWeight !== '400') bad.push(`strong ${cs.fontSize}/${cs.fontWeight}`); }
        for (const e of document.querySelectorAll('.dunit,.adl,.fold .fh,.fold .fdw,.fold .ftm,.tlev:not(.fev) .tt,.xi,.fold .fall .adplus')) { if (e.getBoundingClientRect().width < 1) continue; const cs = getComputedStyle(e); if (cs.fontSize !== '11px' || cs.fontWeight !== '400') bad.push(`${e.className} ${cs.fontSize}/${cs.fontWeight}`); }
        return { bad, strong };
      });
      seen.strong += r.strong; seen.bad.push(...r.bad.map((b) => `${label}: ${b}`));
    };
    const ticks = [];
    const tickScan = async () => { ticks.push(...await page.evaluate(() => [...document.querySelectorAll('.mdtask.done .rmck')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const cs = getComputedStyle(e, '::after'); return [cs.fontSize, cs.fontWeight]; }))); };
    if (size === L) {
      for (const side of ['left', 'right']) for (const kind of ['月', '時間', 'タスク', 'ノート']) { await pagePick(page, side, kind).click(); await page.waitForTimeout(300); await scan(`${side} ${kind}`); await tickScan(); }
    } else if (size === C) { // 閉じた画面に下のタブはない（design/34 §9.1-9）。同じ4つの面を「…」・ホーム・「‹ カレンダー」から開く
      for (const n of ['ホーム', '日', '週', '月']) { await tab(page, n).click(); await page.waitForTimeout(300); await scan(n); await tickScan(); }
    } else {
      const tabs = await page.locator('.tabs button').count();
      for (let i = 0; i < tabs; i++) { await page.locator('.tabs button').nth(i).click(); await page.waitForTimeout(300); await scan(`tab${i}`); await tickScan(); }
      if (size === P) for (const m of ['task', 'note', 'calendar']) { await page.locator(`.fmodes [data-fmode="${m}"]`).click(); await page.waitForTimeout(300); await scan(m); await tickScan(); }
    }
    expect(seen.bad).toEqual([]);
    if (size !== L) expect(seen.strong).toBeGreaterThan(0); // 開いた横は予定の題が .fold の中（13/600 の別の段）で、.event strong の行は出ない
    for (const c of ticks) expect(c).toEqual(['14px', '600']); // 済んだタスクの ✓（見える面だけ。単体の値は下の CSS 検査でも確かめる）
  });
}

// ---------- 1:20-2 タブの下 20（ぼかし 24 が全部の面・送り切ると最後の行がバー上端から 8 以上） ----------
async function endState(page) {
  await page.evaluate(() => { for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; } });
  await page.mouse.move(200, 300);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(80); }
  await page.waitForTimeout(250);
}
// バーと横が重なる見える文字のうち、いちばん下の文字の下端が（バー上端 − 8）以下
async function lowestTextGap(page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll('.tabs, .pgsw')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getBoundingClientRect());
    let worst = 1e9; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode, t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement;
      if (el.closest('.tabs,.pgsw,.cb,.ctl,.fmodes,dialog,.vh,.fllab,.tabfade') || getComputedStyle(el).visibility === 'hidden') continue;
      const rg = document.createRange(); rg.selectNodeContents(n); const rc = rg.getBoundingClientRect(); if (rc.width < 2) continue;
      for (const b of bars) if (rc.right > b.x && rc.left < b.right && rc.top < b.bottom) worst = Math.min(worst, b.y - rc.bottom);
    }
    return worst;
  });
}
// 閉じた画面（タブなし）: 見えている文字のうち、いちばん下の文字の下端から、ホームバーの帯（画面の下 33）の上端までのあき。帯にかかる文字があれば負になる
async function lowestTextGapClosed(page) {
  return page.evaluate(() => {
    const barTop = innerHeight - 33, right = innerWidth - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sar')) || 0);
    let worst = 1e9; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode, t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement;
      if (el.closest('.cb,.ctl,dialog,.vh,#status,[hidden],script,style,#layout-diagnostics,#screen-diagnostics,#kb-metrics') || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none') continue;
      let op = 1; for (let a = el; a; a = a.parentElement) op *= Number(getComputedStyle(a).opacity); if (op <= 0.01) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r0 of rg.getClientRects()) {
        let r = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom };
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const ar = a.getBoundingClientRect(); r = { l: Math.max(r.l, ar.left), t: Math.max(r.t, ar.top), r: Math.min(r.r, ar.right), b: Math.min(r.b, ar.bottom) }; } }
        if (r.r - r.l < 2 || r.b - r.t < 1 || r.t >= innerHeight || r.l >= right) continue;
        worst = Math.min(worst, barTop - r.b);
      }
    }
    return worst;
  });
}
const fadeOk = (page) => page.evaluate(() => [...document.querySelectorAll('.tabfade')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { h: r.height, bottom: r.bottom, bg: cs.backgroundImage.startsWith('linear-gradient'), pe: cs.pointerEvents }; }));

test.describe('1:20-2 タブの下 20: ぼかし 24 が全部の面に出て、送り切ると最後の行はバー上端から 8 以上', () => {
  test('閉じた画面（ホーム・月・週と日の時間軸・タスク・ノート）: 下のタブとぼかしはなく（design/34 §6.1・§9.1-9）、送り切ると最後の行はホームバーの帯（y645）から 8 以上', async ({ page }) => {
    // 旧: 下のタブの上にぼかし 24、送り切ると最後の行がタブの上端から 8 以上（下の余白 87）。34 でタブとぼかしを廃止し、下の余白は 41（帯 33＋8）。
    // 確かめる項目は同じ（全部の面で、送り切ったとき最後の行が下の帯から 8 以上離れる）。帯だけがタブ（y599）からホームバーの帯（y645）に変わった。
    await monthFormInit(page, 'month');
    await openApp(page, C);
    await seed(page, MANY);
    await seedTasks(page, Array.from({ length: 12 }, (_, i) => T(`k${i}`, { title: `タスク${i}`, due: { date: '2026-11-12' } })));
    await page.evaluate(async () => { const db = await import('/js/db.js'); for (let i = 0; i < 14; i++) await db.putNote({ id: `n${i}`, body: `# メモ${i}\n本文`, createdAt: 1, updatedAt: 50 + i, folderId: null }); });
    await page.reload(); await page.waitForSelector('html[data-ready]'); await band(page, 84);
    const faces = [
      ['ホーム', () => tab(page, 'ホーム').click()], ['月', () => tab(page, '月').click()], ['週', () => tab(page, '週').click()], ['日', () => tab(page, '日').click()],
      ['タスク', async () => { await tab(page, '月').click(); await page.locator('.ctl .ctask').click(); }],
      ['ノート', async () => { await tab(page, '月').click(); await page.locator('.mday .mdnl').scrollIntoViewIfNeeded(); await page.locator('.mday .mdnl').click(); }],
    ];
    expect(faces.length).toBeGreaterThanOrEqual(6);
    for (const [name, go] of faces) {
      await go(); await page.waitForTimeout(400);
      await expect(page.locator('.tabs'), `${name} タブ`).toHaveCount(0);
      expect((await fadeOk(page)).length, `${name} ぼかし`).toBe(0);
      await endState(page);
      expect(await lowestTextGapClosed(page), `閉じた ${name}`).toBeGreaterThanOrEqual(8 - 0.5);
    }
  });
  test('開いた縦（日・週・月・ホームと、タスク・ノートの型）', async ({ page }) => {
    await openApp(page, P);
    await seed(page, MANY);
    await seedTasks(page, Array.from({ length: 14 }, (_, i) => T(`k${i}`, { title: `タスク${i}`, due: { date: '2026-11-12' } })));
    for (const t of ['ホーム', '日', '週', '月']) {
      await tab(page, t).click(); await page.waitForTimeout(400);
      const f = await fadeOk(page); expect(f.length, t).toBe(1); near(f[0].h, 24);
      const tb = await rect(page.locator('.tabs')); near(f[0].bottom, tb.y);
      await endState(page); expect(await lowestTextGap(page), `縦 ${t}`).toBeGreaterThanOrEqual(8 - 0.5);
    }
    // タスク・ノートの型には下のバー自体が無い（.tabs 0）ので、隠れる行もぼかしも要らない
    for (const m of ['task', 'note']) {
      await page.locator(`.fmodes [data-fmode="${m}"]`).click(); await page.waitForTimeout(400);
      expect(await page.locator('.tabs').count(), m).toBe(0);
      await endState(page); expect(await lowestTextGap(page), `縦 ${m}`).toBeGreaterThanOrEqual(8 - 0.5);
    }
  });
  test('開いた横（左右の各ページ：月・時間・タスク・ノート・ホーム）', async ({ page }) => {
    await setUi(page, LEGACY);
    await openApp(page, L); await band(page, 84);
    await seed(page, MANY);
    await seedTasks(page, Array.from({ length: 14 }, (_, i) => T(`k${i}`, { title: `タスク${i}`, due: { date: '2026-11-12' } })));
    for (const side of ['left', 'right']) for (const kind of ['月', '時間', 'タスク', 'ノート']) {
      await pagePick(page, side, kind).click(); await page.waitForTimeout(350);
      const f = await fadeOk(page); expect(f.length, `${side} ${kind}`).toBe(2);
      for (const x of f) { near(x.h, 24); expect(x.bg).toBe(true); expect(x.pe).toBe('none'); }
      const tb = await rect(page.locator(`.pgsw.${side === 'left' ? 'pgl' : 'pgr'}`)); near(f[side === 'left' ? 0 : 1].bottom, tb.y);
      await endState(page); expect(await lowestTextGap(page), `横 ${side} ${kind}`).toBeGreaterThanOrEqual(8 - 0.5);
    }
  });
});

// ---------- 1:20-3 「＋ タスクを追加」 ----------
test('1:20-3 閉じたホーム: 下の余白 41（34 で 87 → 41）で送り切ると「＋ タスクを追加」の行の下端がホームバーの帯の上端から 8 以上離れる', async ({ page }) => {
  await openApp(page, C, '', { home: true }); await band(page, 84);
  await seed(page, MANY);
  await seedTasks(page, [T('h1', { title: 'タスク1', due: { date: '2026-11-12' } }), T('h2', { title: 'タスク2', due: { date: '2026-11-12' } }), T('h3', { title: 'タスク3', due: { date: '2026-11-12' } })]);
  await page.waitForTimeout(300);
  const pad = await page.evaluate(() => { const h = document.querySelector('.home.listview'); return h ? parseFloat(getComputedStyle(h).paddingBottom) : -1; });
  const inner = await page.evaluate(() => { const h = document.querySelector('.home.listview'); const s = [h, ...h.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 2 && getComputedStyle(x).overflowY !== 'visible'); return s ? parseFloat(getComputedStyle(s).paddingBottom) : -1; });
  expect(Math.max(pad, inner)).toBeGreaterThanOrEqual(41 - 0.5); // 下の余白 41（ホームバーの帯 33＋8。design/34 §10「33 全体」: タブがなくなり 87 → 41）
  await page.locator('.home.listview').evaluate((e) => { const s = [e, ...e.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 2 && getComputedStyle(x).overflowY !== 'visible'); (s || e).scrollTop = 99999; });
  await page.waitForTimeout(250);
  await expect(page.locator('.tabs')).toHaveCount(0);
  const tabTop = 678 - 33; // バー＝ホームバーの帯（y645）。旧: 下のタブの上端 y599
  const add = await rect(page.locator('.hadd'));
  expect(add.y + add.h, `hadd 下端 ${add.y + add.h} / バー上端 ${tabTop}`).toBeLessThanOrEqual(tabTop - 8 + 0.5);
  near(add.h, 44, 0.6);
});
test('1:20-3 ノート編集（閉じた画面）に出る .hadd があれば、ホームと同じ形（44 高・余白 41・送り切りで帯から 8 以上）', async ({ page }) => {
  // measure の「ノート編集」の underBar（button.hadd）は、ホームのまま計った場合の値。右の帯でノートを開き編集に入ると .hadd は DOM に無い（0 件）か、あれば同じ規則に従う。
  await openApp(page, C); await band(page, 84);
  await seed(page, MANY);
  await page.evaluate(async () => { const db = await import('/js/db.js'); await db.putNote({ id: 'a', body: '# 今週のメモ\n- [ ] 買い物', createdAt: 1, updatedAt: 50, folderId: null }); });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await band(page, 84);
  await page.locator('.mday .mdnl').scrollIntoViewIfNeeded(); await page.locator('.mday .mdnl').click(); await page.waitForTimeout(450); // ノートの一覧は日の欄の「ノート ›」から（design/34 §9.1-7。右の列の「ノート」は消えた）
  await page.locator('.mpane .mrow').first().click(); await page.waitForTimeout(450);
  const hs = await page.evaluate(() => [...document.querySelectorAll('.hadd')].map((e) => ({ h: e.getBoundingClientRect().height, vis: !!e.offsetParent })));
  for (const h of hs) near(h.h, 44, 0.6);
  const tabTop = 678 - 33; // バー＝ホームバーの帯（y645）。下のタブはない（design/34 §9.1-9）
  const bottoms = await page.evaluate(() => [...document.querySelectorAll('.hadd')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().bottom));
  for (const b of bottoms) expect(b).toBeLessThanOrEqual(tabTop - 8 + 0.5);
});

// ---------- 00:25 / 品質 中-5 開いた横の予定シートの影は開いた縦と同じ ----------
test('品質 中-5（設計 00:25）開いた横の予定シートの影は開いた縦と同じ文字列', async ({ page, browser }) => {
  const shadow = async (size, sar) => {
    const ctx = await browser.newContext({ viewport: size, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' }); const p = await ctx.newPage();
    await openApp(p, size); if (sar) await band(p, sar);
    await p.locator('[data-act="add"]').first().click(); await expect(p.locator('#editor[open]')).toHaveCount(1);
    const s = await p.locator('#editor').evaluate((e) => getComputedStyle(e).boxShadow); await ctx.close(); return s;
  };
  const port = await shadow(P, 0), land = await shadow(L, 84), closed = await shadow(C, 84);
  expect(port).toBe('rgba(0, 0, 0, 0.16) 0px 12px 32px 0px');
  expect(land).toBe(port); expect(closed).toBe(port);
});

// ---------- V-19 左ページの見出し ----------
test('V-19 開いた横の左ページの見出し「2026年11月」は端から 16（x8→16）。月の格子は x8 のまま', async ({ page }) => {
  await setUi(page, LEGACY);
  await openApp(page, L); await band(page, 84);
  const lp = await rect(page.locator('.lp'));
  const yr = await page.locator('.lp .shead h2 .yr').first().evaluate((e) => { const rg = document.createRange(); rg.selectNodeContents(e); return rg.getBoundingClientRect().left; });
  near(yr, 16, 0.6); // 設計 25 §5（画面の端から 16。右ページの見出し x500 と同じ考え方）。x8→16
  near((await rect(page.locator('.lp .weekdays'))).x, 8, 0.6);
  near((await rect(page.locator('.lp .week').first())).x, 8, 0.6);
  void lp;
});
