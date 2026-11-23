// 第19.3版（閉じた画面だけの直し・征希さんの要望）の試験（実装担当）。Chromium と WebKit の両方で回す（playwright.config.js の webkit の testMatch）。
//   要望1: 段（月の大きさ 1〜7）は つまみ（上）.mgrab を引いたとき（とキー ↑↓）だけ変わる。格子・日の欄・見出しのどこをスワイプしても変わらない（v19.2 の M9 をやめた）。
//   要望2: 月を固定せず、閉じた縦は画面全体を1本の縦スクロールにする。上に残るのは見出し（年月）と曜日の行だけ。格子が流れ切ったら見出しの右に選んだ日（design/33 §2）。
// 寸法は 466×678・右の帯 84（実機）と、帯なし（ブラウザ）。値は spec-values.js（design/34）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, seed, ev, SIZES } from './helpers.js';
import * as S from './spec-values.js';

const DAY = '2026-11-12', EMPTY = '2026-11-16';
const hh = (n) => String(n).padStart(2, '0');
const DATA = [
  ...['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${hh(9 + i)}:00`, `${DAY}T${hh(9 + i)}:30`)),
  ev('ad', '終日の予定', `${DAY}T00:00`, `${DAY}T23:59`, { all: true }),
  ev('wk', '月末の会議', '2026-11-28T10:00', '2026-11-28T11:00'),
];
// 開いた縦・開いた横の基準（open-baseline-5bc8af6.json）を作ったときと同じ予定（closed-pull-v20.spec.js の SEED）
const OPEN_SEED = [
  ...['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${hh(9 + i)}:00`, `${DAY}T${hh(9 + i)}:30`)),
  ev('ad', '終日の予定', DAY, '2026-11-13', { all: true }),
  ev('md', '三日の旅行', '2026-11-11', '2026-11-14', { all: true }),
  ev('wk', '月末の会議', '2026-11-28T10:00', '2026-11-28T11:00'),
];
async function boot(page, { stage = 4, dg = 0, sel = DAY, sar = 84, size = SIZES.closedPortrait, reduced = false } = {}) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((v) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${v}px`)), sar);
  await page.addInitScript(({ s, d, st }) => { if (sessionStorage.getItem('v193')) return; sessionStorage.setItem('v193', '1'); localStorage.setItem('duo.ui.v1', JSON.stringify({ home: false, monthForm: 'month', monthDay: 'list', selected: s, dayGrip: d, stage: st })); localStorage.setItem('duo.hint.pull', '1'); }, { s: sel, d: dg, st: stage });
  await openApp(page, size);
  await seed(page, DATA); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__duoHapticLog.length = 0; });
}
const SEC = '.mpull.browse';
const stageOf = (page) => page.locator(SEC).evaluate((e) => Number(e.dataset.stage));
const haptics = (page) => page.evaluate(() => window.__duoHapticLog.map((h) => h.stage));
const selected = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).selected);
const scTop = (page) => page.locator(SEC).evaluate((e) => e.scrollTop);
const setScroll = async (page, v) => { await page.locator(SEC).evaluate((e, y) => { e.scrollTop = y; }, v); await page.waitForTimeout(250); };
const raf2 = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const geo = (page) => page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom, r: b.right }; };
  const sec = document.querySelector('.mpull.browse');
  return { st: sec.scrollTop, max: sec.scrollHeight - sec.clientHeight, sec: r('.mpull.browse'), fix: r('.mpfix'), mph: r('.mph'), title: r('#ctitle'), wd: r('.weekdays'), wrap: r('.mgwrap'), grab: r('.mgrab'), day: r('.mday'), mdh: r('.mdh'), dgrab: r('.mdgrab'), note: r('.mday .mdadd'), /* v19.3 その3 で仕様変更: 日の欄の末尾は「ノートの欄」（.mdnote）→「＋ タスク」「＋ ノート」の行（.mdadd） */ stage: Number(sec.dataset.stage) };
});
// hold: 離す前に止める時間（ms）。120 以上なら はらいの速さ 0（離す前 80ms の動きがない）＝着いた所の段に寄る
async function mouseDrag(page, x0, y0, x1, y1, steps = 12, hold = 0) { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); if (hold) await page.waitForTimeout(hold); await page.mouse.up(); await page.waitForTimeout(550); }
// 指（pointerType:touch）の動きを pointer の出来事で送る（両エンジン共通。JS が段の引きとして受け取らないことを見る。本物のスクロールは Chromium の CDP で別に見る）
async function touchDrag(page, x0, y0, x1, y1, steps = 12, hold = 0) {
  await page.evaluate(async ({ x0, y0, x1, y1, steps, hold }) => {
    const t = document.elementFromPoint(x0, y0); const o = (x, y) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
    t.dispatchEvent(new PointerEvent('pointerdown', o(x0, y0)));
    for (let i = 1; i <= steps; i++) { window.dispatchEvent(new PointerEvent('pointermove', o(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps))); await new Promise((r) => requestAnimationFrame(r)); }
    if (hold) await new Promise((r) => setTimeout(r, hold));
    window.dispatchEvent(new PointerEvent('pointerup', { ...o(x1, y1), buttons: 0 }));
  }, { x0, y0, x1, y1, steps, hold });
  await page.waitForTimeout(550);
}
// 本物の指のスワイプ（Chromium だけ。CDP）
async function cdpSwipe(page, x, y0, y1, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, yy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] });
  await touch('touchStart', y0);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', y0 + (y1 - y0) * i / steps); await page.waitForTimeout(16); }
  await touch('touchEnd', y1); await page.waitForTimeout(700);
}
const wheel = async (page, x, y, dy) => { await page.mouse.move(x, y); const n = Math.ceil(Math.abs(dy) / 40); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await page.waitForTimeout(20); } await page.waitForTimeout(350); };
const near = (a, b, msg = '', tol = 1) => expect(Math.abs(a - b), `${msg}: ${a} vs ${b}`).toBeLessThanOrEqual(tol);

test.describe('1・2 つまみ以外のスワイプでは段が変わらない', () => {
  for (const kind of ['マウス', '指']) {
    const drag = kind === 'マウス' ? mouseDrag : touchDrag;
    test(`1 格子の上を縦にスワイプ（上へ・下へ、${kind}）: data-stage も格子の高さも変わらず、触覚ログに積まれない`, async ({ page }) => {
      for (const st of [1, 4]) {
        if (st === 1) await boot(page, { stage: 1 }); else { await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.stage = 4; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); }); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400); await page.evaluate(() => { window.__duoHapticLog.length = 0; }); }
        expect(await stageOf(page)).toBe(st);
        const g = (await geo(page)).wrap, x = g.x + 150, yc = g.y + g.h / 2, d = Math.min(150, g.h / 2 - 8);
        const sel0 = await selected(page);
        await drag(page, x, yc + d / 2, x, yc - d / 2 - (st === 1 ? 100 : 0)); // 上へ
        expect(await stageOf(page), `段${st}: 上へ`).toBe(st);
        await setScroll(page, 0);
        await drag(page, x, yc - d / 2, x, yc + d / 2 + 60); // 下へ
        expect(await stageOf(page), `段${st}: 下へ`).toBe(st);
        near((await geo(page)).wrap.h, S.STAGES[st].H, '格子の高さ');
        expect(await haptics(page), '触覚ログ').toEqual([]);
        expect(await selected(page), '引いたあとの click で日は選ばれない').toBe(sel0);
      }
    });
    test(`2 日の欄の上を縦にスワイプ（一番上から下へ・上へ、${kind}）: 段は変わらない`, async ({ page }) => {
      await boot(page, { stage: 3 });
      const d = (await geo(page)).day;
      await drag(page, 190, d.y + 60, 190, d.y + 180); // 一番上（スクロール 0）から下へ（v19.2 の M9b では段が戻った）
      expect(await stageOf(page), '下へ').toBe(3);
      await drag(page, 190, d.y + 180, 190, d.y + 40); // 上へ
      expect(await stageOf(page), '上へ').toBe(3);
      await drag(page, 190, d.y + 22, 190, d.y + 140); // 日の見出しの上から下へ
      expect(await stageOf(page), '日の見出しから').toBe(3);
      await drag(page, 190, 20, 190, 200); // 年月の見出しから下へ
      expect(await stageOf(page), '年月の見出しから').toBe(3);
      near((await geo(page)).wrap.h, S.STAGES[3].H, '格子の高さ');
      expect(await haptics(page)).toEqual([]);
    });
  }
  test('1・2・4 本物の指（Chromium）: 格子を上へスワイプすると画面が送られるだけ。日の欄を一番上から下へスワイプしても段は変わらない', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', '本物の指のスワイプは CDP（Chromium）で送る。WebKit は pointer の出来事とホイールで見る');
    await boot(page, { stage: 1 });
    const g0 = await geo(page);
    await cdpSwipe(page, 190, 400, 200);
    const g1 = await geo(page);
    expect(g1.stage).toBe(1); expect(g1.st, '画面が送られた').toBeGreaterThan(100); near(g1.wrap.h, 516, '格子の高さ'); near(g1.wrap.y, g0.wrap.y - g1.st, '格子が上へ');
    await cdpSwipe(page, 190, 200, 500); // 下へ戻す（一番上を越えて引く）
    const g2 = await geo(page);
    expect(g2.stage).toBe(1); expect(g2.st).toBe(0); near(g2.wrap.h, 516, '格子の高さ');
    await cdpSwipe(page, 190, g2.day.y + 30, g2.day.y - 200); // 日の欄から上へ: 同じ1本が動く
    const g3 = await geo(page); expect(g3.st).toBeGreaterThan(100); expect(g3.stage).toBe(1);
    await setScroll(page, 0);
    await cdpSwipe(page, 190, g2.day.y + 20, g2.day.y + 60); // 日の欄を一番上から下へ
    expect(await stageOf(page)).toBe(1);
    expect(await haptics(page)).toEqual([]);
  });
});

test.describe('3 つまみ（上）だけが段を変える', () => {
  const grabC = async (page) => { const g = (await geo(page)).grab; return { x: g.x + g.w / 2, y: g.y + 12 }; };
  for (const [from, to, dy, log] of [[4, 3, 152, [3]], [4, 1, 344, [3, 2, 1]], [1, 7, -430, [2, 3, 4, 5, 6, 7]]]) {
    test(`3 つまみ（上）を引く: 段${from}→段${to}。触覚ログは境の数だけ ${JSON.stringify(log)}`, async ({ page }) => {
      await boot(page, { stage: from });
      const c = await grabC(page);
      await mouseDrag(page, c.x, c.y, c.x, c.y + dy, 24, 150);
      expect(await stageOf(page)).toBe(to);
      near((await geo(page)).wrap.h, S.STAGES[to].H, '格子の高さ', S.TOL);
      expect(await haptics(page)).toEqual(log);
    });
  }
  test('3 つまみ（上）を指（pointerType:touch）で引いても段が変わる（段4→段3）', async ({ page }) => {
    await boot(page, { stage: 4 });
    const c = await grabC(page);
    await touchDrag(page, c.x, c.y, c.x, c.y + 152, 16, 150);
    expect(await stageOf(page)).toBe(3); expect(await haptics(page)).toEqual([3]);
  });
  test('3 キー ↑↓: つまみ（上）に焦点があるとき ↑ で段が進み、↓ で戻る。触覚ログは1件ずつ', async ({ page }) => {
    await boot(page, { stage: 4 });
    await page.locator('.mgrab').focus();
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(450); expect(await stageOf(page)).toBe(5);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(450); expect(await stageOf(page)).toBe(4);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(450); expect(await stageOf(page)).toBe(3);
    expect(await haptics(page)).toEqual([5, 4, 3]);
  });
  test('7 つまみ（上）の押せる範囲は 44pt 以上（格子の下端から 44。スクロールしても同じ）', async ({ page }) => {
    await boot(page, { stage: 4 });
    for (const st of [0, 60]) {
      await setScroll(page, st);
      const g = await geo(page); near(g.grab.y, g.wrap.b, 'つまみは格子のすぐ下'); expect(g.grab.h).toBeGreaterThanOrEqual(44);
      const hit = await page.evaluate(({ x, y0 }) => { let n = 0; for (let y = y0 + 0.5; y < y0 + 60; y += 1) { if (document.elementFromPoint(x, y)?.closest('.mgrab')) n++; else break; } return n; }, { x: g.grab.x + g.grab.w / 2, y0: g.grab.y });
      expect(hit, `スクロール ${st}: つまみに当たる高さ`).toBeGreaterThanOrEqual(44);
      // 押せる範囲の下の端（上から 40）をつかんでも引ける
      const x = g.grab.x + 40, y = g.grab.y + 40; const s0 = await stageOf(page);
      await mouseDrag(page, x, y, x, y - 32, 10, 150);
      expect(await stageOf(page), `スクロール ${st}: 下の端から引ける`).toBe(s0 + 1);
      expect(await scTop(page), '引いてもスクロール位置は動かない').toBe(st);
    }
    expect(await page.locator('.mgrab').evaluate((e) => getComputedStyle(e).touchAction)).toBe('none');
  });
});

test.describe('4・5 画面全体が1本でスクロールする', () => {
  test('4 格子の上・日の欄の上のホイールで同じ1本が動く。格子は見出しの下へ流れ、見出しと曜日の y は変わらない。日の欄の中に入れ子の縦スクロールはない', async ({ page }) => {
    await boot(page, { stage: 1 });
    const g0 = await geo(page);
    await wheel(page, 190, g0.wrap.y + 200, 200);
    const g1 = await geo(page);
    near(g1.st, 200, 'スクロール位置', 2); near(g1.wrap.y, g0.wrap.y - g1.st, '格子が上へ'); near(g1.grab.y, g0.grab.y - g1.st, 'つまみ（上）も一緒に'); near(g1.day.y, g0.day.y - g1.st, '日の欄も一緒に');
    near(g1.mph.y, g0.mph.y, '見出しの y', 0.5); near(g1.wd.y, g0.wd.y, '曜日の y', 0.5); near(g1.title.y, g0.title.y, '年月の y', 0.5);
    await wheel(page, 190, g1.day.y + 100, 150); // 日の欄の上から
    const g2 = await geo(page);
    near(g2.st, 350, 'スクロール位置', 2); near(g2.wrap.y, g0.wrap.y - g2.st, '格子が上へ');
    near(g2.mph.y, g0.mph.y, '見出しの y', 0.5); near(g2.wd.y, g0.wd.y, '曜日の y', 0.5);
    expect(g2.stage).toBe(1); near(g2.wrap.h, 516, '格子の高さは変わらない');
    // 格子は見出しの下に隠れる（見出しの帯の中の点に格子は当たらない）
    expect(await page.evaluate(() => !!document.elementFromPoint(190, 50)?.closest('.mpfix'))).toBe(true);
    const fixBg = await page.locator('.mpfix').evaluate((e) => getComputedStyle(e).backgroundColor); expect(fixBg, '見出しは地色で下を隠す').not.toBe('rgba(0, 0, 0, 0)');
    // 入れ子の縦スクロールなし
    const nested = await page.evaluate(() => [...document.querySelectorAll('.mpull.browse *')].filter((e) => { const o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1; }).map((e) => e.className));
    expect(nested).toEqual([]);
    await wheel(page, 190, 300, -600);
    const g3 = await geo(page); expect(g3.st).toBe(0); near(g3.wrap.y, 64, '戻すと格子は元の位置'); expect(await haptics(page)).toEqual([]);
  });
  test('4 スクロール 0 の配置は v19.2 と同じ（段 1〜7: 格子 y64・つまみ・日の欄の上端は spec-values、日の欄の箱は画面の下端まで）', async ({ page }) => {
    await boot(page, { stage: 1 });
    for (let n = 1; n <= 7; n++) {
      if (n > 1) { await page.locator('.mgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(500); }
      const g = await geo(page); expect(g.stage).toBe(n); expect(g.st).toBe(0);
      near(g.fix.y, 0, '見出し'); near(g.fix.h, 64, '見出し＋曜日'); near(g.wrap.y, S.HEAD.gridTop, '格子の上端'); near(g.wrap.h, S.STAGES[n].H, '格子の高さ', S.TOL);
      near(g.grab.y + 10, S.STAGES[n].grabLine[0], 'つまみの線', S.TOL); near(g.day.y, S.STAGES[n].dayTop, '日の欄の上端', S.TOL); near(g.day.b, 678, '日の欄の箱の下端'); near(g.sec.r, S.SCREEN.railX, '右の帯の手前まで');
    }
  });
  test('5 格子が流れ切ったら見出しの右に選んだ日「12日（木）」が 0.15 秒で出て、戻すと消える。「今日へ」と重ならない', async ({ page }) => {
    await boot(page, { stage: 4 });
    const op = () => page.locator('.mph .mpdate').evaluate((e) => Number(getComputedStyle(e).opacity));
    expect(await op()).toBe(0);
    await expect(page.locator('.mph .mpdate')).toHaveText('12日（木）');
    expect(await page.locator('.mph .mpdate').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0.15s');
    await setScroll(page, 100); expect(await op(), '格子が半分見えている間は出さない').toBe(0);
    await setScroll(page, 172); await page.waitForTimeout(250);
    expect(await op(), '流れ切ったら出る').toBe(1);
    const r = await page.evaluate(() => { const b = (s) => document.querySelector(s).getBoundingClientRect(); const d = b('.mph .mpdate'), t = (() => { const g = document.createRange(); g.selectNodeContents(document.querySelector('#ctitle')); return g.getBoundingClientRect(); })(); return { dl: d.left, dr: d.right, dt: d.top, db: d.bottom, tr: t.right }; });
    expect(r.dl, '年月の右').toBeGreaterThan(r.tr + 4); expect(r.dr).toBeLessThanOrEqual(S.GRID.x1 + 0.5); expect(r.dt).toBeGreaterThanOrEqual(0); expect(r.db).toBeLessThanOrEqual(44.5);
    await setScroll(page, 120); await page.waitForTimeout(250);
    expect(await op(), '戻すと消える').toBe(0);
    // 今日が格子にない日（12月）を選ぶと「今日へ」が出る。流し切っても日と重ならない
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.selected = '2026-12-24'; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); }); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    await expect(page.locator('.mph .mptoday')).toBeVisible();
    await setScroll(page, 172); await page.waitForTimeout(250);
    expect(await op()).toBe(1);
    const o = await page.evaluate(() => { const rg = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); }; const d = rg(document.querySelector('.mph .mpdate')), t = rg(document.querySelector('.mph .mptoday')), h = rg(document.querySelector('#ctitle')); return { gapToday: t.left - d.right, gapTitle: d.left - h.right }; });
    expect(o.gapToday, '日と「今日へ」のあき').toBeGreaterThanOrEqual(4); expect(o.gapTitle, '年月と日のあき').toBeGreaterThanOrEqual(4);
    // 今日へ: 今日を選び、画面も一番上へ戻る
    await page.locator('.mph .mptoday').click(); await page.waitForTimeout(500);
    expect(await selected(page)).toBe(DAY); expect(await scTop(page)).toBe(0); expect(await op()).toBe(0);
  });
});

test.describe('6・8 スクロールした状態での操作', () => {
  test('6 スクロールした状態でつまみ（上）を引いても、つまみが指に 1:1 で付いてくる（跳ねない・スクロール位置は動かない）', async ({ page }) => {
    await boot(page, { stage: 1 });
    await setScroll(page, 200);
    const g0 = await geo(page); const x = g0.grab.x + g0.grab.w / 2, y = g0.grab.y + 12;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y); // 触れた位置を 1:1 の基準にする（最初の1点）
    for (const dy of [-10, -40, -90, -150, -200, -120, -60]) { // 指が見出しの下端（y64）より下にある間
      await page.mouse.move(x, y + dy, { steps: 3 }); await raf2(page);
      const g = await geo(page);
      near(g.grab.y, g0.grab.y + dy, `dy=${dy}: つまみの y`); near(g.wrap.h, 516 + dy, `dy=${dy}: 格子の高さ`); expect(g.st, `dy=${dy}: スクロール位置`).toBe(200);
      near(g.mph.y, g0.mph.y, '見出しは動かない', 0.5);
    }
    await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(600); // 止めてから離す（はらいの速さ 0）
    const g = await geo(page); expect(g.stage).toBe(2); near(g.wrap.h, 420, '段2 に寄る'); expect(g.st).toBe(200);
    expect(await haptics(page)).toEqual([2, 3, 2]);
  });
  test('8 横の払い（月送り）は残っている（マウス・指）。段もスクロール位置も変わらない', async ({ page }) => {
    await boot(page, { stage: 1 });
    await setScroll(page, 40);
    const g = (await geo(page)).wrap; const y = g.y + 260;
    await expect(page.locator('#ctitle')).toHaveText('2026年11月');
    await mouseDrag(page, g.x + 300, y, g.x + 80, y + 10); await page.waitForTimeout(500);
    await expect(page.locator('#ctitle')).toHaveText('2026年12月');
    await touchDrag(page, g.x + 80, y, g.x + 300, y - 10); await page.waitForTimeout(500);
    await expect(page.locator('#ctitle')).toHaveText('2026年11月');
    expect(await stageOf(page)).toBe(1); expect(await scTop(page)).toBe(40); expect(await haptics(page)).toEqual([]);
  });
  test('8 マスのタップで日が変わり、スクロール位置は動かない（日の欄は中身だけ替わる）', async ({ page }) => {
    await boot(page, { stage: 1 });
    await setScroll(page, 150);
    await page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-11-26"]').click({ position: { x: 20, y: 12 } }); await page.waitForTimeout(500);
    expect(await selected(page)).toBe('2026-11-26'); expect(await scTop(page)).toBe(150); expect(await stageOf(page)).toBe(1);
    await expect(page.locator('.mday .mdh .hdt')).toHaveText('11月26日');
    await expect(page.locator('.mph .mpdate')).toHaveText('26日（木）');
  });
  test('8 チップの長押し移動（R-49）は残っている: 長押しでつかむと段もスクロール位置も変わらず、別の日へ落とせる', async ({ page }) => {
    await boot(page, { stage: 1 });
    const c = await page.locator('.mgrid .day[data-date="2026-11-28"] .strip.chip').first().boundingBox();
    const to = await page.locator('.mgrid .day[data-date="2026-11-20"]').boundingBox();
    await page.mouse.move(c.x + 10, c.y + 7); await page.mouse.down(); await page.waitForTimeout(500);
    await page.mouse.move(c.x + 10, c.y - 40, { steps: 6 }); await page.mouse.move(to.x + 20, to.y + 40, { steps: 8 });
    expect(await stageOf(page)).toBe(1); expect(await scTop(page)).toBe(0);
    await page.mouse.up(); await page.waitForTimeout(600);
    const moved = await page.evaluate(async () => (await (await import('/js/db.js')).listEvents()).find((e) => e.id === 'wk').start);
    expect(moved).toBe('2026-11-20T10:00'); expect(await stageOf(page)).toBe(1); expect(await haptics(page)).toEqual([]);
  });
});

test.describe('9 変えないもの', () => {
  test('9 閉じた横（678×466）は今までどおり: 段を持たず、画面はスクロールしない。日の欄の中がスクロールし、見出しは貼り付く。縦へ戻すと段はそのまま', async ({ page }) => {
    await boot(page, { stage: 3 });
    await page.setViewportSize(SIZES.closedLandscape); await page.waitForTimeout(700);
    const s = await page.evaluate(() => { const sec = document.querySelector('.mpull.browse'), d = sec.querySelector('.mday'), cs = (e) => getComputedStyle(e); const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 2) / 2); }; return { stage: sec.dataset.stage ?? null, land: sec.dataset.land, secOv: cs(sec).overflowY, secCan: sec.scrollHeight > sec.clientHeight + 1, fixPos: cs(sec.querySelector('.mpfix')).position, dayOv: cs(d).overflowY, dayPos: cs(d).position, mdin: cs(d.querySelector('.mdin')).display, mdh: cs(d.querySelector('.mdh')).position, wrap: r(sec.querySelector('.mgwrap')), day: r(d), grab: !!sec.querySelector('.mgrab'), mpdate: !!sec.querySelector('.mpdate'), fold: !!sec.querySelector('.mdfold') }; });
    expect(s).toEqual({ stage: null, land: '1', secOv: 'hidden', secCan: false, fixPos: 'relative', dayOv: 'auto', dayPos: 'absolute', mdin: 'contents', mdh: 'sticky', wrap: [8, 64, 366, 360], day: [382, 0, 212, 466], grab: false, mpdate: false, fold: false });
    // v19.3 その3 で仕様変更: 日の欄の下の「ノートの欄」（最小 88）が無くなり、日の欄の中身が短くなった（送れる量 66）。送る量を 80 → 60 に
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 60; }); await page.waitForTimeout(200);
    expect(await page.locator('.mday').evaluate((e) => e.scrollTop), '日の欄の中がスクロールする').toBe(60);
    near(await page.locator('.mday .mdh').evaluate((e) => e.getBoundingClientRect().top), 0, '日の見出しは貼り付く');
    await page.setViewportSize(SIZES.closedPortrait); await page.waitForTimeout(700);
    expect(await stageOf(page)).toBe(3); expect(await haptics(page)).toEqual([]);
  });
  // 開いた縦・開いた横: 5bc8af6 の基準（tests/open-baseline-5bc8af6.json。closed-pull-v20 の I と同じ比べ方）
  const KEYS = ['.mph', '#ctitle', '.weekdays', '.mgrid', '.mgrab', '.mday', '.tabs', '.ctl', '.pgsw', '.fmodes', '.dpage', '.home', '.rail'];
  const snapOpen = (page) => page.evaluate((keys) => ({ rects: Object.fromEntries(keys.map((k) => { const e = [...document.querySelectorAll(k)].find((x) => x.offsetParent || getComputedStyle(x).position === 'fixed'); if (!e) return [k, null]; const r = e.getBoundingClientRect(); return [k, [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2)]; })), buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent && !b.closest('[inert],[hidden]')).map((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\d+/g, '#')).sort() }), KEYS);
  const SEED = OPEN_SEED;
  for (const [name, size, tabName] of [['開いた縦 669×951・月', SIZES.openPortrait669, '月'], ['開いた横 951×669', SIZES.openLandscape951, null]]) {
    test(`9 ${name} は 5bc8af6 の基準と同じ（要素の位置 0.5 以内・見えるボタンの並び）。日の欄に .mdin・畳み・1本スクロールは持ち込まない`, async ({ page, browserName }) => {
      await openApp(page, size); await seed(page, SEED);
      if (tabName) { const t = page.getByRole('button', { name: tabName, exact: true }); if (await t.isVisible().catch(() => false)) await t.click(); }
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => ({ mdin: document.querySelectorAll('.mdin').length, fold: document.querySelectorAll('.mdfold').length, stage: document.querySelectorAll('[data-stage]').length }))).toEqual({ mdin: 0, fold: 0, stage: 0 });
      if (browserName !== 'chromium') return; // 基準の数字は Chromium で作ったもの（書体の幅で 0.5 を超えることがある）。WebKit は上の「持ち込まない」だけ
      const now = await snapOpen(page); const was = JSON.parse(readFileSync(new URL('./open-baseline-5bc8af6.json', import.meta.url), 'utf8'))[name];
      expect(was, '基準').toBeTruthy();
      for (const k of KEYS) { if (was.rects[k] === null) { expect(now.rects[k], k).toBeNull(); continue; } for (let i = 0; i < 4; i++) expect(Math.abs(now.rects[k][i] - was.rects[k][i]), `${k}[${i}]`).toBeLessThanOrEqual(S.TOL); }
      expect(now.buttons).toEqual(was.buttons);
    });
  }
});

test.describe('10 どの段・どの日でも格子を流し切れる', () => {
  for (const [name, sar, sel] of [['帯あり・予定のない日', 84, EMPTY], ['帯あり・予定のある日', 84, DAY], ['帯なし・予定のない日', 0, EMPTY], ['帯なし・予定のある日', 0, DAY]]) {
    test(`10 ${name}: 段 1〜7 で格子を見出しの下まで流し切れ、選んだ日が出る。送り切ると最後のノートが下の端・右下の＋に隠れずに見える`, async ({ page }) => {
      test.setTimeout(90000); // 段 1〜7 を順に見るので長い（1 本で 15 秒ほど。全体を並べて回すと 30 秒を越えることがある）
      await boot(page, { stage: 1, sar, sel });
      for (let n = 1; n <= 7; n++) {
        if (n > 1) { await setScroll(page, 0); await page.locator('.mgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(500); await page.evaluate(() => document.activeElement?.blur()); }
        const g0 = await geo(page); expect(g0.stage).toBe(n);
        expect(g0.max, `段${n}: 送れる量 ≧ 格子の高さ ${S.STAGES[n].H}`).toBeGreaterThanOrEqual(S.STAGES[n].H - 0.5);
        await setScroll(page, S.STAGES[n].H);
        const g1 = await geo(page);
        expect(g1.wrap.b, `段${n}: 格子の下端 ≦ 見出しの下端`).toBeLessThanOrEqual(g1.fix.b + 0.5);
        await expect(page.locator('.mph'), `段${n}: 選んだ日が出る`).toHaveClass(/scrd/);
        await setScroll(page, 99999);
        const g2 = await geo(page);
        near(g2.st, g2.max, '送り切り');
        expect(g2.note.b, `段${n}: ノートの下端はホームバーの帯（y645）より上`).toBeLessThanOrEqual(S.SCREEN.homeBarTop + 0.5);
        expect(g2.note.y, `段${n}: ノートの上端は見出しより下`).toBeGreaterThanOrEqual(g2.fix.b - 0.5);
        if (sar) expect(g2.note.r, '右の列にかからない').toBeLessThanOrEqual(S.SCREEN.railX + 0.5);
        else { const add = await page.locator('.cb.cadd').boundingBox(); const over = g2.note.b > add.y + 0.5 && g2.note.r > add.x + 0.5; expect(over, `段${n}: 右下の＋（y${add.y}〜）にかからない`).toBe(false); }
        const top = await page.evaluate(() => { const n = document.querySelector('.mday .mdadd'), b = n.getBoundingClientRect(); return !!document.elementFromPoint(b.left + 30, b.top + b.height / 2)?.closest('.mdadd'); }); // v19.3 その3 で仕様変更: 日の欄の末尾は「ノートの欄」（.mdnote）→「＋ タスク」「＋ ノート」の行（.mdadd）
        expect(top, `段${n}: ノートの真ん中が何にも隠れていない`).toBe(true);
      }
      expect(await haptics(page), 'キーの段送り 6 回だけ').toEqual([2, 3, 4, 5, 6, 7]);
    });
  }
});

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: その1 の describe「つまみ（下）の貼り付きと時間軸（1本のスクロールでの形）」（貼り付き 2 本＋時間軸 B・C 2 本）は外した。
// カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない。終日の行は畳まない（design/35 §5.2〜§5.4）。
// 代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-3・S-7、tests/v193-day-cardtime.spec.js の A-9・A-10・A-16
