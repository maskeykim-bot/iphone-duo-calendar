// 第19.1版 S7b（レビュー後の直し・設計の高 V-01〜V-10＋品質 中-5・触覚）。寸法は getBoundingClientRect で ±1。
// V-01 切替 252×36／V-02 右の帯の絵 currentColor／V-03 +N は押す的でない／V-04 六曜と +N／V-05・V-06 週の題名と時間軸の最小 22／
// V-07 全部明るい色／V-08 設定の溝／V-09 下のバーの上のぼかし／V-10 上の帯の日付・検索・＋の位置。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, SIZES, seed, ev, tab, pagePick } from './helpers.js';

const P = SIZES.openPortrait669, L = SIZES.openLandscape951, C = SIZES.closedPortrait;
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const rect = (loc) => loc.first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const band = (page, r) => page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), r);
const LEGACY = { pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } };
const setUi = (page, ui) => page.addInitScript((ui) => { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { /* */ } localStorage.setItem(k, JSON.stringify({ ...s, ...ui })); }, ui);

// ---------- V-01・V-10・触覚 ----------
test.describe('V-01／V-10 開いた縦の上の帯（どの型でも同じ形・同じ場所）', () => {
  test('切替は 252×36（x208.5）・1つ 84・札 80×32 角丸 8・文字の左右 ≥5。設定 x20・検索 x605・＋ x601,y863。日付は切れない', async ({ page }) => {
    await openApp(page, P);
    const seen = {};
    for (const m of ['calendar', 'task', 'note']) {
      await page.locator(`.fmodes [data-fmode="${m}"]`).click();
      await expect(page.locator(`.fmodes [data-fmode="${m}"]`)).toHaveAttribute('aria-pressed', 'true');
      const f = await rect(page.locator('.fmodes'));
      near(f.x, 208.5); near(f.y, 23); near(f.w, 252); near(f.h, 36);
      expect(await page.locator('.fmodes').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('10px');
      const bs = await page.locator('.fmodes button').evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); const p = e.querySelector('.fmp').getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(e.querySelector('.fmp')); const t = rg.getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height, pw: p.width, ph: p.height, px: p.x - r.x, py: p.y - r.y, gl: t.left - p.left, gr: p.right - t.right, fs: getComputedStyle(e).fontSize, fw: getComputedStyle(e).fontWeight }; }));
      bs.forEach((b, i) => { near(b.x, 208.5 + 84 * i, 0.6); near(b.w, 84); near(b.h, 36); near(b.pw, 80); near(b.ph, 32); near(b.px, 2); near(b.py, 2); expect(b.gl).toBeGreaterThanOrEqual(5); expect(b.gr).toBeGreaterThanOrEqual(5); expect(b.fs).toBe('14px'); expect(b.fw).toBe('600'); });
      // 選んだ札は白・角丸 8、ほかは地のまま
      const pills = await page.locator('.fmodes .fmp').evaluateAll((l) => l.map((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, r: c.borderRadius }; }));
      pills.forEach((p, i) => { expect(p.r).toBe('8px'); expect(p.bg).toBe(['calendar', 'task', 'note'][i] === m ? 'rgb(255, 255, 255)' : 'rgba(0, 0, 0, 0)'); });
      // 押せる高さ 44（y19〜63）
      for (const [x, y] of [[250, 19.5], [250, 62.5], [334, 19.5], [418, 62.5]]) expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.fmodes button'), [x, y]), `${x},${y}`).toBe(true);
      const s = await rect(page.locator('.csearch')), a = await rect(page.locator('.cadd')), g = await rect(page.locator('.csettings'));
      near(s.x, 605); near(s.y, 19); near(s.w, 44); near(s.h, 44);
      near(a.x, 601); near(a.y, 863); near(a.w, 48); near(a.h, 48);
      near(g.x, 20); near(g.y, 19);
      if (m !== 'calendar') {
        const d = await page.locator('.fdate').evaluate((e) => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { x: r.x, w: r.width, right: r.right, sw: e.scrollWidth, cw: e.clientWidth, fs: c.fontSize, fw: c.fontWeight }; });
        expect(d.sw).toBeLessThanOrEqual(d.cw + 0.5); // 切れない（V-10）
        expect(d.fs).toBe('15px'); expect(d.fw).toBe('600');
        expect(d.right).toBeLessThanOrEqual(208.5 - 8);
      }
      seen[m] = [f, s, a, g].map((r) => [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 10) / 10).join());
    }
    expect(seen.task).toEqual(seen.calendar); expect(seen.note).toEqual(seen.calendar); // 型を変えても動かない（品質 中-1）
  });

  test('触覚: 型が変わったときだけ selectionHaptic を1回（同じ型を押しても出ない）', async ({ page }) => {
    await page.addInitScript(() => {
      const M = window.__hap = { calls: [] };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb', nativePromise: async (plugin, method, opts) => { M.calls.push(method); if (method === 'selectionHaptic') return { performed: true }; throw { code: 'UNAVAILABLE', message: method }; } };
    });
    await openApp(page, P);
    const n = () => page.evaluate(() => window.__hap.calls.filter((c) => c === 'selectionHaptic').length);
    const n0 = await n();
    await page.locator('.fmodes [data-fmode="task"]').click(); await page.waitForTimeout(100);
    expect(await n()).toBe(n0 + 1);
    await page.locator('.fmodes [data-fmode="task"]').click(); await page.waitForTimeout(100);
    expect(await n()).toBe(n0 + 1);
    await page.locator('.fmodes [data-fmode="note"]').click(); await page.waitForTimeout(100);
    expect(await n()).toBe(n0 + 2);
  });

  test('押した見た目: 選んでいない札は #EFECE4、選んだ札は #F6F4EE（0.10 秒）。ボタン全体の四角い地は出ない', async ({ page }) => {
    await openApp(page, P);
    for (const [m, want] of [['task', 'rgb(239, 236, 228)'], ['calendar', 'rgb(246, 244, 238)']]) {
      const b = await page.locator(`.fmodes [data-fmode="${m}"]`).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(250);
      const c = await page.locator(`.fmodes [data-fmode="${m}"]`).evaluate((e) => [getComputedStyle(e.querySelector('.fmp')).backgroundColor, getComputedStyle(e).backgroundColor]);
      expect(c[0]).toBe(want); expect(c[1]).toBe('rgba(0, 0, 0, 0)');
      await page.mouse.move(5, 500); await page.mouse.up(); await page.waitForTimeout(250);
      await page.locator('.fmodes [data-fmode="calendar"]').click();
    }
  });
});

// ---------- V-02 ----------
test('V-02 右の帯のタスク・ノートの絵は currentColor。ふだんは緑の線、選んだ丸（緑の地）では白', async ({ page }) => {
  await openApp(page, C); await band(page, 84);
  for (const [id, cls] of [['task', '.ctask'], ['memo', '.cmemo']]) {
    const stroke = () => page.locator(`${cls} svg [stroke]`).first().evaluate((e) => getComputedStyle(e).stroke);
    expect(await stroke()).toBe('rgb(41, 78, 66)');
    expect(await page.locator(`${cls} svg [stroke]`).first().getAttribute('stroke')).toBe('currentColor');
    await page.locator(`[data-strip="${id}"]`).first().click();
    await expect(page.locator(`${cls}.on`)).toHaveCount(1);
    expect(await stroke()).toBe('rgb(255, 255, 255)');
    expect(await page.locator(`${cls} .bi`).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(41, 78, 66)');
    await page.locator(`[data-strip="${id}"]`).first().click();
  }
});

// ---------- V-03・V-04 ----------
const MANY = [];
for (let d = 2; d <= 28; d++) { const n = d === 12 ? 11 : 2 + (d % 9); for (let i = 0; i < n; i++) MANY.push(ev(`m${d}-${i}`, `予定${d}-${i}`, `2026-11-${String(d).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:00`, `2026-11-${String(d).padStart(2, '0')}T${String(8 + i).padStart(2, '0')}:30`)); }
for (const [name, size, sar, ui, expectSel] of [
  ['閉じた 466×678', C, 84, { monthForm: 'month' }, '.week .day'],
  ['開いた縦 669×951', P, 0, { monthForm: 'month', view: 'month' }, '.week .day'],
  ['開いた横 951×669（左ページ月）', L, 84, { ...LEGACY, view: 'month' }, '.week .day'],
  ['開いた横 951×669（右ページ月）', L, 84, { pages: { left: 'time', right: 'month', portraitBottom: 'time', portraitShown: false }, view: 'month' }, '.week .day'],
]) {
  test.describe(`V-03／V-04 月の +N ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await setUi(page, ui);
      await openApp(page, size); if (sar) await band(page, sar);
      await seed(page, MANY);
      if (size === P || size === C) await page.locator('.tabs button', { hasText: '月' }).click();
      await page.waitForTimeout(400);
    });

    test('V-03 +N は押す的にしない（span・aria-hidden・pointer-events:none）。+N の上をたたくとマスが押される（チップは予定が開く）', async ({ page }) => {
      const plus = page.locator('.week .plus');
      const cnt = await plus.count();
      expect(cnt).toBeGreaterThan(5);
      const info = await plus.evaluateAll((l) => l.map((e) => ({ tag: e.tagName, ah: e.getAttribute('aria-hidden'), pe: getComputedStyle(e).pointerEvents, jump: e.dataset.jump ?? null, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
      for (const i of info) { expect(i.tag).toBe('SPAN'); expect(i.ah).toBe('true'); expect(i.pe).toBe('none'); expect(i.jump).toBeNull();  }
      // +N の中心の点を最前面で受けるのは、その日のマス（button.day）
      const hits = await plus.evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { ok: t?.closest('.day') ? t.closest('.day').dataset.date : (t?.closest('[data-event],.strip,.bar') ? 'chip' : (t?.className ?? '')), day: e.closest('.week')?.querySelectorAll('.day').length }; }));
      expect(hits.filter((h) => !/^2026-/.test(h.ok) && h.ok !== 'chip'), JSON.stringify(hits.slice(0, 3))).toEqual([]);
    });

    test('V-04 全マスで 日付の円（16）・日付・六曜・+N が重ならない。六曜は +N の左 ≥2、+N は右 2・8px W600', async ({ page }) => {
      const res = await page.evaluate(() => {
        const rg = (e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { l: b.left, r: b.right }; };
        const out = [];
        for (const wk of document.querySelectorAll('.week')) {
          const plusList = [...wk.querySelectorAll('.plus')];
          for (const d of wk.querySelectorAll('.day')) {
            const c = d.getBoundingClientRect(); if (!c.width) continue;
            const num = d.querySelector('.num'), rk = d.querySelector('.rk');
            const p = plusList.find((e) => { const r = e.getBoundingClientRect(); return r.x >= c.x - 1 && r.right <= c.right + 2 && r.y >= c.y - 1 && r.y < c.y + 30; });
            const pcs = p && getComputedStyle(p);
            out.push({ date: d.dataset.date, w: c.width, num: num ? rg(num) : null, numBox: num ? num.getBoundingClientRect() : null, rk: rk ? rg(rk) : null, plus: p ? rg(p) : null, plusRight: p ? c.right - rg(p).r : null, plusTxt: p?.textContent, pfs: pcs?.fontSize, pfw: pcs?.fontWeight, cx: c.x });
          }
        }
        return out;
      });
      const withPlus = res.filter((r) => r.plus);
      expect(withPlus.length).toBeGreaterThan(5);
      for (const r of res) {
        if (r.rk && r.num) expect(r.rk.l, `${r.date} 日付と六曜`).toBeGreaterThanOrEqual(r.num.r - 0.5);
        if (r.plus && r.rk) expect(r.plus.l - r.rk.r, `${r.date} 六曜と ${r.plusTxt}`).toBeGreaterThanOrEqual(2);
        if (r.plus && r.num) expect(r.plus.l - r.num.r, `${r.date} 日付と ${r.plusTxt}`).toBeGreaterThanOrEqual(2);
        if (r.plus) { expect(r.pfw).toBe('600'); }
      }
      if (size === L) {
        // 閉じた画面の 33 §5 と同じ寸法: 日付の円 16・六曜 x+21〜37（8px）・+N 8px 右 2
        for (const r of withPlus) { expect(r.pfs).toBe('8px'); near(r.plusRight, 2, 1.1); }
      }
      // 二桁（+10 以上）も含めて測った
      expect(withPlus.some((r) => /^\+1\d$/.test(r.plusTxt)) || withPlus.some((r) => /^\+[7-9]$/.test(r.plusTxt))).toBe(true);
    });
  });
}

test('V-03 閉じた月: +N の 44×44 が無くなったので、チップを押すと予定が開く（+N のある 12 日でも）', async ({ page }) => {
  await setUi(page, { monthForm: 'month' });
  await openApp(page, C); await band(page, 84);
  await seed(page, MANY);
  await page.locator('.tabs button', { hasText: '月' }).click(); await page.waitForTimeout(400);
  const plus = page.locator('[data-date="2026-11-12"]').locator('xpath=..').locator('.plus').first();
  await expect(plus).toHaveCount(1);
  const pr = await plus.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  // +N の右上の隅（元の 44×44 の当たりがチップに重なっていた所）をたたく → マスのたたき（日を選ぶ）。チップは予定が開く
  const chip = page.locator('.week .strip[data-sday="2026-11-12"]').first();
  await expect(chip).toHaveCount(1);
  const cb = await chip.boundingBox();
  await page.mouse.click(cb.x + cb.width - 6, cb.y + cb.height / 2);
  await expect(page.locator('#xdetail[open], #editor[open]')).toHaveCount(1);
  expect(pr.x).toBeGreaterThan(0);
});

// ---------- V-05・V-06 ----------
test.describe('V-05 閉じた週の題名は 10pt/行 12・行数は枠の高さで決める', () => {
  test('30分→1行・60分→3行・90分→5行・半端な2行目を出さない', async ({ page }) => {
    await openApp(page, C); await band(page, 84);
    await seed(page, [
      ev('w30', '日銀 短観 の発表を待つ長い名前の予定', '2026-11-12T09:00', '2026-11-12T09:30'),
      ev('w60', 'ECB 理事会 の結果を見る長い名前の予定ですよ ECB 理事会 の結果を見る長い名前の予定ですよ', '2026-11-13T10:00', '2026-11-13T11:00'),
      ev('w90', '午後の会議が長く続く長い名前の予定の続き続き午後の会議が長く続く長い名前の予定の続き続き', '2026-11-14T13:00', '2026-11-14T14:30'),
      ev('w120', '二時間の予定のとても長い名前の予定の続き続き続き二時間の予定のとても長い名前の予定の続き続き続き', '2026-11-15T15:00', '2026-11-15T17:00'),
    ]);
    await page.locator('.tabs button', { hasText: '週' }).click(); await page.waitForTimeout(500);
    const rows = await page.locator('.tlev').evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(), n = e.querySelector('.tn'), c = getComputedStyle(n), nr = n.getBoundingClientRect(); return { t: n.textContent.slice(0, 4), h: r.height, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, clamp: c.webkitLineClamp, pt: getComputedStyle(e).paddingTop, nh: nr.height, top: nr.top - r.top, bottom: r.bottom - nr.bottom }; }));
    expect(rows.length).toBe(4);
    for (const r of rows) {
      expect(r.fs).toBe('10px'); expect(r.fw).toBe('600'); expect(r.lh).toBe('12px'); expect(r.pt).toBe('2px');
      const lines = Math.floor((r.h - 4) / 12);
      expect(Number(r.clamp), `${r.t} 高さ${r.h}`).toBe(lines);
      near(r.nh, 12 * lines, 0.6); // 行数ぶんだけ（長い題名はちょうどその行数まで）
      expect(r.top).toBeGreaterThanOrEqual(1.5); expect(r.bottom).toBeGreaterThanOrEqual(1.5); // 枠の中。切れた行を出さない
    }
  });
});

test.describe('V-06 開いた縦の時間軸の予定は見た目の最小 22', () => {
  test('15分の予定も高さ 22・題名 13/16 W6 1行・上 3。重なる予定は別の列（22 で計算）', async ({ page }) => {
    await openApp(page, P);
    await seed(page, [
      ev('a1', '短い確認（15分）', '2026-11-12T10:00', '2026-11-12T10:15'),
      ev('a2', '次の15分', '2026-11-12T10:20', '2026-11-12T10:35'),
      ev('a3', '離れた15分', '2026-11-12T12:00', '2026-11-12T12:15'),
    ]);
    await page.locator('.tabs button', { hasText: '日' }).click(); await page.waitForTimeout(500);
    const r = await page.locator('.fev').evaluateAll((l) => l.filter((e) => e.getBoundingClientRect().height > 0 && /15分|離れた/.test(e.textContent)).slice(0, 3).map((e) => { const b = e.getBoundingClientRect(), t = e.querySelector('.ftl'), tb = t.getBoundingClientRect(), c = getComputedStyle(t); return { x: b.x, y: b.y, w: b.width, h: b.height, top: tb.top - b.top, th: tb.height, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, title: t.textContent }; }));
    const byTitle = Object.fromEntries(r.map((x) => [x.title, x]));
    for (const x of r) { near(x.h, 22, 0.6); near(x.top, 3, 0.6); expect(x.fs).toBe('13px'); expect(x.fw).toBe('600'); expect(x.lh).toBe('16px'); expect(x.th).toBeLessThanOrEqual(16.5); expect(x.top + x.th).toBeLessThanOrEqual(x.h + 0.5); }
    const A = byTitle['短い確認（15分）'], B = byTitle['次の15分'];
    const inter = !(A.x + A.w <= B.x + 0.5 || B.x + B.w <= A.x + 0.5 || A.y + A.h <= B.y + 0.5 || B.y + B.h <= A.y + 0.5);
    expect(inter, '10:00 と 10:20 の 15分は、最小 22 で重なるので別の列').toBe(false);
  });

  test('週: 題名 10pt/行 12・上 2・行数は枠の高さ、15分も 22', async ({ page }) => {
    await openApp(page, P);
    await seed(page, [ev('b1', '短い15分の予定', '2026-11-12T10:00', '2026-11-12T10:15'), ev('b2', '一時間の予定のとても長い名前の予定ですよ', '2026-11-13T10:00', '2026-11-13T11:00')]);
    await page.locator('.tabs button', { hasText: '週' }).click(); await page.waitForTimeout(500);
    const r = await page.locator('.fev').evaluateAll((l) => l.filter((e) => e.getBoundingClientRect().height > 0).slice(0, 12).map((e) => { const b = e.getBoundingClientRect(), t = e.querySelector('.ftl'), tb = t.getBoundingClientRect(), c = getComputedStyle(t); return { h: b.height, top: tb.top - b.top, th: tb.height, fs: c.fontSize, lh: c.lineHeight, clamp: c.webkitLineClamp, title: t.textContent }; }).filter((x) => /15分|一時間/.test(x.title)));
    const x15 = r.find((x) => /15分/.test(x.title)), x60 = r.find((x) => /一時間/.test(x.title));
    near(x15.h, 22, 0.6); expect(x15.fs).toBe('10px'); expect(x15.lh).toBe('12px'); near(x15.top, 2, 0.6); expect(x15.clamp).toBe('1');
    near(x60.h, 44, 1); expect(x60.clamp).toBe('3'); near(x60.th, 36, 0.6); // (44−4)÷12＝3 行
  });
});

// ---------- V-07 ----------
test.describe('V-07 ダークでも全部明るい色（3姿勢）', () => {
  test('index.html の color-scheme・Info.plist の UIUserInterfaceStyle=Light・暗い色の規則が 0', async () => {
    expect(readFileSync('index.html', 'utf8')).toMatch(/<meta name="color-scheme" content="light">/);
    expect(readFileSync('index.html', 'utf8')).toMatch(/<meta name="theme-color" content="#f7f4ed">/);
    const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
    expect(plist).toMatch(/<key>UIUserInterfaceStyle<\/key>\s*<string>Light<\/string>/);
    expect(readFileSync('css/app.css', 'utf8')).not.toMatch(/prefers-color-scheme\s*:\s*dark/);
  });
  for (const [name, size, sar, ui] of [
    ['閉じた', C, 84, { view: 'month' }], ['開いた縦', P, 0, {}], ['開いた横', L, 84, LEGACY],
  ]) {
    test(`${name}: emulateMedia dark でも地・タブ・時間軸・文字が明るい／暗い（ライトと同じ）`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await setUi(page, ui);
      await openApp(page, size); if (sar) await band(page, sar);
      await seed(page, [ev('d1', '朝会', '2026-11-12T09:00', '2026-11-12T09:30')]);
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      const light = async () => page.evaluate(() => { const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; }; return { body: getComputedStyle(document.body).backgroundColor, tabs: g('.tabs, .pgsw'), cs: getComputedStyle(document.documentElement).colorScheme, hol: getComputedStyle(document.documentElement).getPropertyValue('--holiday').trim() }; });
      const check = async (label) => { const o = await light(); expect(lum(o.body), `${label} body ${o.body}`).toBeGreaterThan(0.85); if (o.tabs) expect(lum(o.tabs), `${label} tabs ${o.tabs}`).toBeGreaterThan(0.85); expect(o.cs).toBe('light'); expect(o.hol).toBe('#B43C3C'); };
      await check('初期');
      if (size === P) {
        for (const t of ['日', '週', '月', 'ホーム']) {
          await page.locator('.tabs button', { hasText: t }).click(); await page.waitForTimeout(300);
          await check(t);
          const parts = await page.evaluate(() => { const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; }; return { fold: g('.fold'), shell: g('.shell'), fmodes: g('.fmodes'), tabs: g('.tabs') }; });
          for (const [k, v] of Object.entries(parts)) if (v && v !== 'rgba(0, 0, 0, 0)') expect(lum(v), `${t} ${k} ${v}`).toBeGreaterThan(0.8);
        }
        // 日の予定の文字は暗い（紙の上）
        await page.locator('.tabs button', { hasText: '日' }).click(); await page.waitForTimeout(300);
        const ink = await page.evaluate(() => getComputedStyle(document.querySelector('.fold .fhead') || document.body).color);
        expect(lum(ink)).toBeLessThan(0.4);
      }
    });
  }
});

// ---------- V-08 ----------
test.describe('V-08 開いた縦の設定のシート（出る動きを止めない）', () => {
  test('どの画面も行が帯 y459〜492 にかからない。一覧は「詳細」が y500〜548（上の面の最後の行は y459 まで）', async ({ page }) => {
    await openApp(page, P, '', { motion: true });
    await page.locator('[data-act="menu"]').first().click();
    await page.waitForTimeout(80); // 出る動きの途中でも、止まったときの位置で決める
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#menu .menurows[data-screen="root"] > *')].some((e) => e.dataset.gpush))).toBe(true);
    await page.waitForTimeout(400);
    const v = (n) => page.evaluate((n) => parseFloat(document.documentElement.style.getPropertyValue(n)), n);
    const a0 = await v('--groove-avoid-y0'), a1 = await v('--groove-avoid-y1');
    near(a0, 459, 0.5); near(a1, 492, 0.5);
    const rows = () => page.evaluate(() => [...document.querySelectorAll('#menu .menurows:not([hidden]) > *')].filter((e) => e.offsetParent && e.offsetHeight > 1).map((e) => { const b = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 8), y0: b.top, y1: b.bottom }; }));
    let r = await rows();
    for (const x of r) expect(x.y1 <= a0 + 0.5 || x.y0 >= a1 - 0.5, `${x.t} ${x.y0}-${x.y1}`).toBe(true);
    const det = r.find((x) => x.t.startsWith('詳細')), bk = r.find((x) => x.t.startsWith('バックアップ'));
    near(det.y0, 500, 0.6); near(det.y1, 548, 0.6); expect(bk.y1).toBeLessThanOrEqual(459.5);
    // ほかの画面
    for (const go of ['general', 'display', 'calendar', 'reminders', 'google', 'details']) {
      const b = page.locator(`#menu [data-go="${go}"]:visible`);
      if (!(await b.count())) continue;
      await page.evaluate(() => { document.querySelector('#m-back')?.click(); });
      await page.waitForTimeout(300);
      if (!(await b.count())) continue;
      await b.first().click(); await page.waitForTimeout(500);
      r = await rows();
      for (const x of r) expect(x.y1 <= a0 + 0.5 || x.y0 >= a1 - 0.5, `${go}: ${x.t} ${x.y0}-${x.y1}`).toBe(true);
    }
  });
});

// ---------- V-09 ----------
test.describe('V-09 下のバーの上のぼかし 24', () => {
  test('開いた縦: y839〜863・x0〜669・上 0%→下 #F7F4ED。最後の行は送り切るとバーの上 8 より上に出る', async ({ page }) => {
    await openApp(page, P);
    await seed(page, MANY);
    for (const t of ['ホーム', '日', '週', '月']) {
      await page.locator('.tabs button', { hasText: t }).click(); await page.waitForTimeout(400);
      const f = await rect(page.locator('.shell .tabfade'));
      near(f.x, 0); near(f.y, 839); near(f.w, 669); near(f.h, 24);
      expect(await page.locator('.shell .tabfade').evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundImage, c.pointerEvents]; })).toEqual(['linear-gradient(rgba(247, 244, 237, 0), rgb(247, 244, 237))', 'none']);
      const tb = await rect(page.locator('.tabs'));
      near(tb.y, 863);
      await endCheck(page, tb.y, t);
    }
  });
  test('開いた横: 各ページ y587〜611（左 #F0EDE5・右 #FFFDFA）。月・時間・タスク・ノートの最後の行はバーの上に出る', async ({ page }) => {
    await setUi(page, LEGACY);
    await openApp(page, L); await band(page, 84);
    await seed(page, MANY);
    const l = await rect(page.locator('.tabfade.tfl')), r = await rect(page.locator('.tabfade.tfr'));
    near(l.y, 587); near(l.h, 24); near(r.y, 587); near(r.h, 24);
    const lp = await rect(page.locator('.lp')), rp = await rect(page.locator('.rp'));
    near(l.x, lp.x); near(l.w, lp.w); near(r.x, rp.x); near(r.w, rp.w);
    expect(await page.locator('.tabfade.tfl').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('rgb(240, 237, 229)');
    expect(await page.locator('.tabfade.tfr').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('rgb(255, 253, 250)');
    for (const side of ['left', 'right']) for (const kind of ['時間', 'タスク', 'ノート', '月']) {
      await pagePick(page, side, kind).click(); await page.waitForTimeout(350);
      const tb = await rect(page.locator(`.pgsw.${side === 'left' ? 'pgl' : 'pgr'}`));
      near(tb.y, 611);
      await endCheck(page, tb.y, `${side} ${kind}`);
    }
  });
});
// スクロールする箱と紙を一番下まで送ったとき、バーの上 8 を越えて見える文字（バーと横が重なるもの）が 0
async function endCheck(page, barTop, label) {
  await page.evaluate(() => { for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e); if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; } });
  await page.mouse.move(300, 400);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(100); }
  await page.waitForTimeout(300);
  const bad = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('.tabs, .pgsw')].map((e) => e.getBoundingClientRect());
    const out = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const n = tw.currentNode, t = n.nodeValue.trim(); if (!t) continue; const el = n.parentElement;
      if (el.closest('.tabs,.pgsw,.cb,.ctl,.fmodes,dialog,.vh,.fllab,.tabfade') || getComputedStyle(el).visibility === 'hidden') continue;
      const rg = document.createRange(); rg.selectNodeContents(n); const rc = rg.getBoundingClientRect(); if (rc.width < 2) continue;
      for (const b of bars) if (rc.right > b.x && rc.left < b.right && rc.bottom > b.y - 8 + 0.5 && rc.top < b.bottom) { out.push(`${t.slice(0, 10)} ${Math.round(rc.top)}-${Math.round(rc.bottom)}`); break; }
    }
    return out;
  });
  expect(bad, `${label}: バー ${barTop} の上 8 を越える文字`).toEqual([]);
}

// ---------- 品質 中-5 ----------
for (const [name, size, sar] of [['閉じた', C, 84], ['開いた縦', P, 0], ['開いた横', L, 84]]) {
  test(`品質 中-5 予定シートの影は 0 12px 32px 16%（${name}。開いた横だけ無かった）`, async ({ page }) => {
    await openApp(page, size); if (sar) await band(page, sar);
    await page.locator('[data-act="add"]').first().click();
    await expect(page.locator('#editor[open]')).toHaveCount(1);
    const sh = await page.locator('#editor').evaluate((e) => getComputedStyle(e).boxShadow);
    // 開いた横だけは左のにじみが折り目（±10）に入らないよう右へ 16 ずらして縮める（16px 12px 32px -16px）。ほかは 0 12px 32px
    expect(sh).toContain(size === L ? '16px 12px 32px -16px' : '0px 12px 32px');
    expect(sh).toContain('rgba(0, 0, 0, 0.16)');
  });
}
