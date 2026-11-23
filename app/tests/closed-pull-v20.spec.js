// 第20版 閉じた画面（design/34、R-71〜R-75）のテストのひな形（品質 2026-11-20。§12 反映）。
// 使い方: spec-values.js・pull-scan.js・open-baseline-5bc8af6.json と一緒に <worktree>/app/tests/ へ写し、
//   npx playwright test -c <path>/playwright.v20.config.mjs
// 題の頭の札: [未実装] = 今のアプリ（5bc8af6）にない形なので落ちて当然。仕様の値で書いてある。
//             [守り]   = 今も通るはずのもの（変えないもの・戻ってはいけないもの）。
// 要素の名前は、まだ実装がないので「約束の案」（SEL）。data-stage（1〜7）は開発責任者が付ける（決定済み）。合わせたら SEL だけ直す。
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { openApp, seed, ev, SIZES } from './helpers.js';
import * as S from './spec-values.js';
import { SCAN } from './pull-scan.js';

const SEL = {
  pull: '.mpull',                       // data-stage="1".."7"（開発責任者が付けると決定）
  grid: '.mgrid',                       // 入れ替えの間は2つ。出ていく方に data-leaving
  grab: '.mgrab', grabLine: '.mgrab i', // つまみ（上）。role="slider" aria-valuemin=1 aria-valuemax=7
  day: '.mday', dayHead: '.mdh', dayGrab: '.mdgrab', dayCards: '.mdcard', dayAllDay: '.mdallday',
  cell: (k) => `.mgrid:not([data-leaving]) .day[data-date="${k}"]`,
  weekdays: '.weekdays',
  title: '#ctitle',
  tasksBtn: (p) => p.getByRole('button', { name: /^タスク/ }).last(), // 右の列のもの（日の欄の「タスク」見出しと区別。約束の案）
  moreBtn: (p) => p.getByRole('button', { name: /^(…|その他|メニュー)$/ }),
  plusBtn: (p) => p.getByRole('button', { name: /^(＋|予定を追加)$/ }),
  undoBtn: (p) => p.getByRole('button', { name: '元に戻す' }),
  todayBtn: (p) => p.getByRole('button', { name: '今日へ' }),
  prevMonthBtn: (p) => p.locator('.mpull.browse .mph [data-act="prev"]'),
  nextMonthBtn: (p) => p.locator('.mpull.browse .mph [data-act="next"]'),
};
const DAY = '2026-11-12'; // openApp の今日
const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, null, { timeout: 2000 });
const near = (a, b, msg = '') => expect(Math.abs(a - b), `${msg} ${a} ≈ ${b}`).toBeLessThanOrEqual(S.TOL);
const stageOf = (page) => page.locator(SEL.pull).getAttribute('data-stage', { timeout: 1500 }).then(Number);
const raf2 = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const SEED = [
  ...['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`)),
  ev('ad', '終日の予定', DAY, '2026-11-13', { all: true }),
  ev('md', '三日の旅行', '2026-11-11', '2026-11-14', { all: true }),
  ev('wk', '月末の会議', '2026-11-28T10:00', '2026-11-28T11:00'),
];
// 閉じた画面で、仕様どおりならカレンダー（段1）から始まる。今のアプリはホームから始まるので、月のタブがあれば押す（今の版でも測れるように）。
async function boot(page, { fresh = false } = {}) {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px'))); // 実機の右の帯 84（x382〜466）
  await openApp(page, SIZES.closedPortrait, '', fresh ? { fresh: true } : {});
  await seed(page, SEED);
  const m = page.getByRole('button', { name: '月', exact: true });
  if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(300); }
}
// 段 n にする（§9.4 のキー ↑↓。↑ で段が進む＝格子が低くなる、↓ で戻る。§12 Q-6 で確定）
async function toStage(page, n) {
  const g = page.locator(SEL.grab); await g.focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown');
  await page.waitForTimeout(400);
  expect(await stageOf(page)).toBe(n);
}
async function grabCenter(page) { const b = await box(page.locator(SEL.grabLine)); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
// 見える丸 48（48×48 の箱があればそれを使う。なければボタン自身＝押せる範囲の箱）
const visCircle = (loc) => loc.evaluate((e) => {
  const ok = (r) => Math.abs(r.width - 48) <= 0.6 && Math.abs(r.height - 48) <= 0.6;
  const all = [e, ...e.querySelectorAll('*')].map((x) => x.getBoundingClientRect());
  const r = all.find(ok) || e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
}, null, { timeout: 2000 });
function assertRailVis(b, rail, name) {
  near(b.x, rail.vis.x[0], `${name} 見える左`); near(b.r, rail.vis.x[1], `${name} 見える右`);
  near(b.y, rail.vis.y[0], `${name} 見える上`); near(b.b, rail.vis.y[1], `${name} 見える下`);
}
function assertRailHit(b, rail, name) {
  near(b.x, rail.hit.x[0], `${name} 押せる左`); near(b.r, rail.hit.x[1], `${name} 押せる右`);
  near(b.y, rail.hit.y[0], `${name} 押せる上`); near(b.b, rail.hit.y[1], `${name} 押せる下`);
}
// 触覚の口。配列が無ければここで落ちる（存在しないと通る if は書かない）。
const hapticLog = async (page) => {
  const log = await page.evaluate((k) => window[k], S.HAPTIC.log);
  expect(log, `window.${S.HAPTIC.log} がある（配列）`).toEqual(expect.any(Array));
  return log;
};
const hapticClear = async (page) => {
  await hapticLog(page);
  await page.evaluate((k) => { window[k].length = 0; }, S.HAPTIC.log);
};

test.describe.configure({ timeout: 60000 });

test.describe('A. 7段の寸法（§2.2）', () => {
  for (let n = 1; n <= 7; n++) {
    const st = S.STAGES[n];
    test(`[未実装] 段${n}（${st.name}）: H ${st.H}、行 ${st.rows}、つまみの線 y${st.grabLine[0]}〜${st.grabLine[1]}、日の欄の上端 ${st.dayTop}、1マス ${st.cap} 件`, async ({ page }) => {
      await boot(page); await toStage(page, n);
      const g = await box(page.locator(SEL.grid)); near(g.y, S.HEAD.gridTop, '格子の上端'); near(g.h, st.H, 'H');
      expect(await page.locator(`${SEL.grid} .week`).count()).toBe(st.rows);
      const l = await box(page.locator(SEL.grabLine)); near(l.y, st.grabLine[0], '線の上'); near(l.b, st.grabLine[1], '線の下'); near(l.w, S.GRAB.line.w, '線の幅');
      near((await box(page.locator(SEL.day))).y, st.dayTop, '日の欄の上端');
      const maxChips = await page.locator(SEL.grid).evaluate((g) => Math.max(...[...g.querySelectorAll('.day')].map((d) => [...d.querySelectorAll('.chip,.ev,.bar')].filter((c) => Number(getComputedStyle(c).opacity) > 0.5).length)));
      expect(maxChips, '1マスの件数').toBeLessThanOrEqual(st.cap);
    });
  }
  test('[未実装] 起動はカレンダーの段1（11:29 の決定）。見出し y0〜44、曜日 y44〜64', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { fresh: true });
    expect(await stageOf(page)).toBe(1);
    const t = await box(page.locator(SEL.title)); expect(t.y).toBeGreaterThanOrEqual(0); expect(t.b).toBeLessThanOrEqual(S.HEAD.h);
    const w = await box(page.locator(SEL.weekdays)); near(w.y, S.HEAD.weekdayTop); near(w.h, S.HEAD.weekdayH);
  });
  test('[未実装] つまみ: 線 36×4 角丸2、押せる範囲は x8〜374 の全幅×高さ 44', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const l = await box(page.locator(SEL.grabLine)); near(l.w, 36); near(l.h, 4);
    const hit = await box(page.locator(SEL.grab)); near(hit.x, S.GRAB.hit.x0); near(hit.r, S.GRAB.hit.x1); near(hit.h, S.GRAB.hit.h);
  });
  test('[未実装] 日の欄の下の余白 41（送り切ったとき、最後の中身の下端が 678−41 より上）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 送るのは日の欄の中ではなく画面（.mpull.browse）の1本。前→後: d.scrollTop → 画面の scrollTop。最後の中身は日の欄の中身の箱（.mdin。下の余白 41 を持つ）の子で見る
    const r = await page.locator(SEL.day).evaluate((d) => { const sc = d.closest('.mpull.browse'); sc.scrollTop = sc.scrollHeight; const kids = [...d.querySelectorAll('.mdin *')].filter((e) => e.offsetParent && e.getBoundingClientRect().height); return { last: Math.max(...kids.map((e) => e.getBoundingClientRect().bottom)), pad: sc.scrollHeight - sc.clientHeight }; });
    expect(r.last).toBeLessThanOrEqual(S.SCREEN.h - S.DAYLIST.bottomPad + S.TOL);
  });
  test('[未実装] 今日の数字は丸の中央（x+13, y+11）。今日以外の日は左 4（§12 Q-2）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const pos = await page.evaluate(({ todaySel, otherSel, cx, cy, left }) => {
      const numBox = (cell, dayNum) => {
        const walk = (n, acc) => { if (n.nodeType === 3 && n.data.trim() === dayNum) acc.push(n); else if (n.nodeType === 1) for (const c of n.childNodes) walk(c, acc); return acc; };
        const nodes = walk(cell, []);
        if (!nodes.length) return null;
        const range = document.createRange(); range.selectNodeContents(nodes[0]);
        const r = range.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      };
      const today = document.querySelector(todaySel), other = document.querySelector(otherSel);
      const tr = today.getBoundingClientRect(), or_ = other.getBoundingClientRect();
      return {
        todayCell: { x: tr.x, y: tr.y }, todayNum: numBox(today, '12'),
        otherCell: { x: or_.x, y: or_.y }, otherNum: numBox(other, '13'),
        expectToday: { cx: tr.x + cx, cy: tr.y + cy }, expectOtherLeft: or_.x + left,
      };
    }, { todaySel: SEL.cell(DAY), otherSel: SEL.cell('2026-11-13'), cx: S.CELL.today.cx, cy: S.CELL.today.cy, left: S.CELL.date.left });
    expect(pos.todayNum, '今日の数字が見える').toBeTruthy();
    near(pos.todayNum.cx, pos.expectToday.cx, '今日の数字の中央 x');
    near(pos.todayNum.cy, pos.expectToday.cy, '今日の数字の中央 y');
    expect(pos.otherNum, '今日以外の数字が見える').toBeTruthy();
    near(pos.otherNum.x, pos.expectOtherLeft, '今日以外は左 4');
  });
});

test.describe('B. 重ならない（§4、R-71）', () => {
  test('[未実装] 段1→段7 を 1pt ずつ引き、各位置で文字の重なり 0、格子の文字が格子の下へ出ない、日の欄の文字が上へ出ない', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down();
    const bad = [];
    for (let p = 0; p <= S.BOUNDS[5].pull + 30; p += 1) {
      await page.mouse.move(x, y - p); await raf2(page);
      const s = await page.evaluate(SCAN);
      if (s.n || s.gridBelow || s.dayAbove) bad.push({ pull: p, n: s.n, gridBelow: s.gridBelow, dayAbove: s.dayAbove, first: s.pairs[0] });
    }
    await page.mouse.up();
    expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
  });
  test('[未実装] 段7→段1 へ戻すときも 1pt ずつ 0', async ({ page }) => {
    await boot(page); await toStage(page, 7);
    const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down();
    const bad = [];
    for (let p = 0; p <= S.BOUNDS[5].pull + 30; p += 1) { await page.mouse.move(x, y + p); await raf2(page); const s = await page.evaluate(SCAN); if (s.n || s.gridBelow || s.dayAbove) bad.push({ pull: p, n: s.n }); }
    await page.mouse.up();
    expect(bad).toEqual([]);
  });
  for (const bd of S.BOUNDS.filter((b) => b.swap)) {
    test(`[未実装] 入れ替え ${bd.swap}（H=${bd.H}）: 16ms ごとに見て、2つの格子の文字が同時に見えない（不透明度の積 0）。0.20 秒で終わる`, async ({ page }) => {
      await boot(page); await toStage(page, bd.between[0]);
      const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down();
      const H0 = S.STAGES[bd.between[0]].H;
      await page.mouse.move(x, y - (H0 - bd.H - 2), { steps: 10 }); await raf2(page);
      const rec = page.evaluate((sel) => new Promise((res) => { const t0 = performance.now(), out = []; const f = () => { const gs = [...document.querySelectorAll(sel)]; const ops = gs.map((g) => { let o = 1; for (let a = g; a; a = a.parentElement) o *= Number(getComputedStyle(a).opacity); const txt = [...g.querySelectorAll('*')].some((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim())); return txt ? o : 0; }); out.push({ t: performance.now() - t0, ops }); if (performance.now() - t0 < 400) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }), SEL.grid);
      await page.mouse.move(x, y - (H0 - bd.H + 4)); // 境をまたぐ
      const frames = await rec; await page.mouse.up();
      const both = frames.filter((f) => f.ops.filter((o) => o > 0.001).length > 1);
      expect(both, `2つ見えたコマ ${JSON.stringify(both.slice(0, 3))}`).toEqual([]);
      expect(frames.some((f) => f.ops.length > 1), '入れ替えの間は2つの格子がある（約束の案）').toBe(true);
      const last2 = frames.filter((f) => f.ops.length > 1).pop(); expect(last2.t).toBeLessThanOrEqual((S.SWAP.inTo * 1000) + 34);
    });
  }
});

test.describe('C. 段が変わる位置と吸い付き（§3・§5）', () => {
  test('[未実装] 段1から上へ引いた量 48・144・268・360・392・419 の前後 1pt で段が変わる', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down();
    for (const bd of S.BOUNDS) {
      await page.mouse.move(x, y - (bd.pull - 1)); await raf2(page); expect(await stageOf(page), `引いた量 ${bd.pull - 1}`).toBe(bd.between[0]);
      await page.mouse.move(x, y - (bd.pull + 1)); await raf2(page); expect(await stageOf(page), `引いた量 ${bd.pull + 1}`).toBe(bd.between[1]);
      near((await box(page.locator(`${SEL.grid}:not([data-leaving])`))).h, S.STAGES[1].H - (bd.pull + 1), '指に 1:1'); // 7c9fb05 の写しの直しを反映（入れ替えの間は .mgrid が2つ。入ってくる方を測る）
    }
    await page.mouse.up();
  });
  test('[未実装] ゆっくり離すと近い段へ 0.25 秒で寄る（距離 200 を超えると 0.30 秒）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down();
    for (let p = 0; p <= 60; p += 2) { await page.mouse.move(x, y - p); await page.waitForTimeout(16); }
    await page.waitForTimeout(150); // 速さを 0 に近づける
    const t = page.evaluate((sel) => new Promise((res) => { const g = document.querySelector(sel); const t0 = performance.now(), hs = []; const f = () => { hs.push([performance.now() - t0, g.getBoundingClientRect().height]); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(hs); }; requestAnimationFrame(f); }), SEL.grid);
    await page.mouse.up();
    const hs = await t; const end = hs.find(([, h]) => Math.abs(h - S.STAGES[2].H) <= S.TOL);
    expect(end, '段2（420）へ寄る').toBeTruthy();
    // cubic-bezier(0.16,1,0.3,1) は距離が小さいと 0.5pt 以内に入るのが約 0.15 秒。0.25 秒は「変化 0.05 未満が続き始める」時刻で見る。
    let settle = null;
    for (let i = 1; i < hs.length; i++) {
      if (Math.abs(hs[i][1] - hs[i - 1][1]) >= 0.05) continue;
      let ok = true;
      for (let j = i + 1; j < Math.min(i + 4, hs.length); j++) {
        if (Math.abs(hs[j][1] - hs[j - 1][1]) >= 0.05) { ok = false; break; }
      }
      if (ok) { settle = hs[i]; break; }
    }
    expect(settle, '寄せが止まるコマがある').toBeTruthy();
    expect(settle[0]).toBeGreaterThanOrEqual(S.SNAP.sec * 1000 - 50);
    expect(settle[0]).toBeLessThanOrEqual(S.SNAP.sec * 1000 + 50);
    expect(Math.abs(hs[hs.length - 1][1] - S.STAGES[2].H), '最後は段2の高さ').toBeLessThanOrEqual(S.TOL);
  });
  test('[未実装] 速く払っても飛ぶのは2段まで（段1→段3 で止まる）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y - 100, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page)).toBe(3);
  });
  test('[未実装] 動き 6 未満はたたき扱いで段は変わらない', async ({ page }) => {
    await boot(page); await toStage(page, 2);
    const { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 5); await page.mouse.up(); await page.waitForTimeout(400);
    expect(await stageOf(page)).toBe(2);
  });
  test('[未実装] 端のゴム: 段1でさらに 100 下へ引くと 30 ではなく最大 24 しか伸びない。段7で上へも同じ', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    let { x, y } = await grabCenter(page); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 100, { steps: 10 }); await raf2(page);
    near((await box(page.locator(SEL.grid))).h, S.STAGES[1].H + S.RUBBER.max, '段1のゴム'); await page.mouse.up(); await page.waitForTimeout(400);
    await toStage(page, 7); ({ x, y } = await grabCenter(page)); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 100, { steps: 10 }); await raf2(page);
    expect(await stageOf(page), '段7からさらに引いても段は7のまま').toBe(7);
    near((await box(page.locator(SEL.grid))).h, S.STAGES[7].H - S.RUBBER.max, '段7のゴム'); await page.mouse.up();
  });
  test('[未実装] 段は覚える（閉じる・開くの後も同じ）', async ({ page }) => {
    await boot(page); await toStage(page, 5);
    await page.setViewportSize(SIZES.openPortrait669); await page.waitForTimeout(300); await page.setViewportSize(SIZES.closedPortrait); await page.waitForTimeout(400);
    expect(await stageOf(page)).toBe(5);
  });
  test('[未実装] ↑ で段が進む（格子が低くなり、段の数字が増える）。↓ で戻る（§12 Q-6）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const h1 = (await box(page.locator(SEL.grid))).h;
    await page.locator(SEL.grab).focus();
    await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400);
    expect(await stageOf(page)).toBe(2);
    expect((await box(page.locator(SEL.grid))).h).toBeLessThan(h1);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400);
    expect(await stageOf(page)).toBe(1);
    near((await box(page.locator(SEL.grid))).h, h1, '↓ で段1の高さへ戻る');
  });
  test('[未実装] 速さ v は離す前 80ms の動きから。H′ がちょうど中間のときは、上向き（v が負）なら先の段、それ以外は手前の段（§12 Q-7）', async ({ page }) => {
    // 段1｜段2 の中間 H=468（引いた量 48）。v＝0 なら手前（段1）、上向きなら先（段2）。
    const midPull = S.BOUNDS[0].pull;
    await boot(page); await toStage(page, 1);
    let { x, y } = await grabCenter(page);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y - midPull, { steps: 16 });
    await page.waitForTimeout(S.SNAP.vWindowMs + 80); // 80ms 窓に点が1つ → v＝0
    await page.mouse.up(); await page.waitForTimeout(400);
    expect(await stageOf(page), 'v＝0 で中間なら手前の段').toBe(1);

    // 60Hz では 10ms 刻みの想定どおり v＝-80 にならない。中間（H=468）で離し、離す前 80ms だけ上向きに動かせば、式どおり先の段へ寄る。
    await toStage(page, 1);
    ({ x, y } = await grabCenter(page));
    const yEnd = y - midPull, yStart = yEnd + 8;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, yStart, { steps: 16 });
    await page.waitForTimeout(S.SNAP.vWindowMs + 80); // 近づく動きを 80ms 窓から外す
    const steps = 6;
    for (let i = 1; i <= steps; i++) { await page.mouse.move(x, yStart + (yEnd - yStart) * (i / steps)); await page.waitForTimeout(17); }
    await page.mouse.up(); await page.waitForTimeout(400);
    expect(await stageOf(page), '上向きで H′ が中間なら先の段').toBe(2);
  });
  test('[未実装] 指に 1:1: 毎フレーム、H の変化と指の縦の動きの差が 1pt 以内、遅れは 1 フレーム（16.7ms）以内（§12 Q-14）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const { x, y } = await grabCenter(page);
    await page.mouse.move(x, y); await page.mouse.down();
    const recP = page.evaluate((sel) => new Promise((res) => {
      const moves = [], frames = [];
      const onMove = (e) => moves.push({ t: performance.now(), y: e.clientY });
      window.addEventListener('pointermove', onMove, true);
      const f = () => {
        const g = document.querySelector(sel);
        frames.push({ t: performance.now(), h: g ? g.getBoundingClientRect().height : 0 });
        if (frames.length < 90) requestAnimationFrame(f);
        else { window.removeEventListener('pointermove', onMove, true); res({ moves, frames }); }
      };
      requestAnimationFrame(f);
    }), SEL.grid);
    await page.mouse.move(x, y - 200, { steps: 40 });
    const { moves, frames } = await recP;
    await page.mouse.up();
    expect(moves.length, '指の動きがある').toBeGreaterThan(2);
    expect(frames.length, '描画のコマがある').toBeGreaterThan(10);
    const H0 = S.STAGES[1].H, y0 = moves[0].y;
    const bad = [];
    for (const fr of frames) {
      const recent = moves.filter((mv) => mv.t <= fr.t);
      if (!recent.length) continue;
      const last = recent[recent.length - 1];
      const prev = recent.length >= 2 ? recent[recent.length - 2] : last;
      // 同じミリ秒のコマは、まだ前の指位置の高さのことがある（遅れ 1 フレーム）。直前かその前の動きに 1pt 以内で合えばよい。
      const d = Math.min(Math.abs(fr.h - (H0 - (y0 - last.y))), Math.abs(fr.h - (H0 - (y0 - prev.y))));
      if (d > S.FOLLOW.maxDeltaPt) bad.push({ t: fr.t, h: fr.h, expected: H0 - (y0 - last.y), d });
    }
    expect(bad.slice(0, 5), `差が 1pt を超えたコマ ${bad.length}`).toEqual([]);
    const lags = [];
    for (const mv of moves) {
      const expected = H0 - (y0 - mv.y);
      // 同じミリ秒のコマは、高さを録るより先に rAF が走ることがある。次の 1 コマで反映されていれば仕様どおり（遅れ 1 フレーム以内）。
      const sameOrAfter = frames.filter((f) => f.t >= mv.t);
      const reflected = sameOrAfter.find((f) => Math.abs(expected - f.h) <= S.FOLLOW.maxDeltaPt);
      if (!reflected) { lags.push({ t: mv.t, y: mv.y, skipped: Infinity }); continue; }
      const skipped = sameOrAfter.filter((f) => f.t < reflected.t).length;
      if (skipped > 1) lags.push({ t: mv.t, skipped, lag: reflected.t - mv.t });
    }
    expect(lags.slice(0, 5), `遅れが 2 コマ以上の動き ${lags.length}`).toEqual([]);
  });
  test('[未実装] 触覚: 段1→段7 をゆっくり引くと、境をまたぐたびに1回、合計6回（stage はまたいだ先の 2〜7）。戻すときも6回（6〜1）。離したあとの吸い付きでは足さない（window.__duoHapticLog）', async ({ page }) => {
    await boot(page);
    await hapticClear(page);
    await toStage(page, 1);
    await hapticClear(page);
    const { x, y } = await grabCenter(page);
    await page.mouse.move(x, y); await page.mouse.down();
    for (const bd of S.BOUNDS) { await page.mouse.move(x, y - (bd.pull + 1)); await raf2(page); }
    const up = await hapticLog(page);
    expect(up.map((e) => e.stage), '段1→7 は6回、先の段').toEqual(S.HAPTIC.stagesUp);
    for (let i = 0; i < up.length; i++) {
      expect(typeof up[i].t, 't は時刻').toBe('number');
      if (i) expect(up[i].t).toBeGreaterThanOrEqual(up[i - 1].t);
    }
    await page.mouse.up(); await page.waitForTimeout(S.SNAP.sec * 1000 + 80);
    expect((await hapticLog(page)).map((e) => e.stage), '離したあとの吸い付きでは足さない').toEqual(S.HAPTIC.stagesUp);

    await hapticClear(page);
    const g = await grabCenter(page);
    await page.mouse.move(g.x, g.y); await page.mouse.down();
    for (const bd of [...S.BOUNDS].reverse()) {
      await page.mouse.move(g.x, g.y + (bd.H + 1 - S.STAGES[7].H)); await raf2(page);
    }
    expect((await hapticLog(page)).map((e) => e.stage), '段7→1 は6回').toEqual(S.HAPTIC.stagesDown);
    await page.mouse.up(); await page.waitForTimeout(S.SNAP.sec * 1000 + 80);
    expect((await hapticLog(page)).map((e) => e.stage), '戻して離しても足さない').toEqual(S.HAPTIC.stagesDown);
  });
  test('[未実装] 触覚: 同じ境を行ったり来たりしても、またぐごとに1回だけで二重に出ない', async ({ page }) => {
    await boot(page);
    await hapticClear(page);
    await toStage(page, 1);
    await hapticClear(page);
    const mid = S.BOUNDS[0].pull; // 48（段1｜段2）
    const { x, y } = await grabCenter(page);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y - (mid + 1)); await raf2(page); // →段2
    await page.mouse.move(x, y - (mid - 1)); await raf2(page); // →段1
    await page.mouse.move(x, y - (mid + 1)); await raf2(page); // →段2
    const log = await hapticLog(page);
    expect(log.map((e) => e.stage), 'またぐごとに1回（2, 1, 2）').toEqual([2, 1, 2]);
    await page.mouse.up(); await page.waitForTimeout(S.SNAP.sec * 1000 + 80);
    expect((await hapticLog(page)).map((e) => e.stage), '離しても二重に出ない').toEqual([2, 1, 2]);
  });
  test('[未実装] 触覚は出さない: たたき（動き6未満）、同じ段の中の引き、端のゴム（段1の下・段7の上）とその戻り', async ({ page }) => {
    await boot(page);
    await hapticClear(page);
    await toStage(page, 1);
    await hapticClear(page);
    const { x, y } = await grabCenter(page);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 5); await page.mouse.up(); await page.waitForTimeout(400);
    expect((await hapticLog(page)).length, 'たたきでは出さない').toBe(0);

    await hapticClear(page);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 20, { steps: 8 }); await raf2(page);
    expect((await hapticLog(page)).length, '同じ段の中では出さない').toBe(0);
    await page.mouse.up();

    await hapticClear(page);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 100, { steps: 10 }); await raf2(page);
    expect((await hapticLog(page)).length, '段1のゴムでは出さない').toBe(0);
    await page.mouse.up(); await page.waitForTimeout(S.RUBBER.backSec * 1000 + 80);
    expect((await hapticLog(page)).length, 'ゴムの戻りでも出さない').toBe(0);

    await toStage(page, 7);
    await hapticClear(page);
    const g = await grabCenter(page);
    await page.mouse.move(g.x, g.y); await page.mouse.down(); await page.mouse.move(g.x, g.y - 100, { steps: 10 }); await raf2(page);
    expect((await hapticLog(page)).length, '段7のゴムでは出さない').toBe(0);
    await page.mouse.up(); await page.waitForTimeout(S.RUBBER.backSec * 1000 + 80);
    expect((await hapticLog(page)).length, '段7のゴムの戻りでも出さない').toBe(0);
  });
});

test.describe('D. 1週は選んだ日から（§2.2・§9.4）', () => {
  test('[未実装] 11/14（土）を選んで段7: 並びは 11/14〜11/20、曜日の行は 土 日 月 火 水 木 金', async ({ page }) => {
    await boot(page); await page.locator(SEL.cell('2026-11-14')).click(); await toStage(page, 7);
    const days = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(days).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect((await page.locator(SEL.weekdays).innerText()).replace(/\s+/g, '')).toBe('土日月火水木金');
  });
  test('[未実装] 11/28 を選んで段7: 11/28〜12/4、見出しは「11月」（選んだ日が 11/28 のため。§12 Q-4）', async ({ page }) => {
    await boot(page); await page.locator(SEL.cell('2026-11-28')).click(); await toStage(page, 7);
    const days = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(days[0]).toBe('2026-11-28'); expect(days[6]).toBe('2026-12-04');
    await expect(page.locator(SEL.title)).toContainText('11月');
  });
  test('[未実装] 段7で 12/2 をたたくと、見出しは 0.15 秒で「12月」に変わる（いつも選んだ日のある月。§12 Q-4）', async ({ page }) => {
    await boot(page); await page.locator(SEL.cell('2026-11-28')).click(); await toStage(page, 7);
    await expect(page.locator(SEL.title)).toContainText('11月');
    const t0 = await page.evaluate(() => performance.now());
    await page.locator(SEL.cell('2026-12-02')).click();
    await expect(page.locator(SEL.title)).toContainText('12月');
    const dt = await page.evaluate((t0) => performance.now() - t0, t0);
    expect(dt).toBeLessThanOrEqual(S.SWAP.headSec * 1000 + 80);
    const days = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(days[0]).toBe('2026-11-28'); expect(days[6]).toBe('2026-12-04'); // 並びは動かない
  });
  test('[未実装] 段7でほかの日をたたいても、7日の並びは動かない', async ({ page }) => {
    await boot(page); await toStage(page, 7);
    const before = await page.locator(`${SEL.grid} .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    await page.locator(SEL.cell(before[4])).click(); await page.waitForTimeout(300);
    expect(await page.locator(`${SEL.grid} .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date))).toEqual(before);
  });
  test('[未実装] 2週（段4）は月曜始まりで、選んだ日の週と次の週', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    const days = await page.locator(`${SEL.grid} .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(days[0]).toBe('2026-11-09'); expect(days.length).toBe(14);
  });
});

test.describe('E. 月では日を触る（R-75）', () => {
  for (const n of [1, 4, 7]) {
    test(`[未実装] 段${n}: マスの四隅・真ん中・チップの上をたたくと、その日を選び、予定は開かない`, async ({ page }) => {
      await boot(page); await toStage(page, n);
      const cell = page.locator(SEL.cell(n === 7 ? '2026-11-13' : DAY));
      const b = await box(cell); const pts = [[3, 3], [b.w - 3, 3], [3, b.h - 3], [b.w - 3, b.h - 3], [b.w / 2, b.h / 2]];
      const chip = cell.locator('.chip,.ev,.bar').first();
      for (const [px, py] of pts) {
        await page.locator(SEL.cell(n === 7 ? '2026-11-15' : '2026-11-10')).click(); await page.waitForTimeout(150); // 7c9fb05 の写しの直しを反映: 段7の並びは選んだ日 11/12 から7日で 11/10 は画面にない（§2.2）
        await cell.click({ position: { x: px, y: py } }); await page.waitForTimeout(200);
        await expect(cell).toHaveAttribute('aria-selected', 'true');
        expect(await page.locator('#editor[open], dialog[open]').count()).toBe(0);
      }
      if (await chip.count()) { await chip.click(); await page.waitForTimeout(200); expect(await page.locator('#editor[open], dialog[open]').count(), 'チップをたたいても予定は開かない').toBe(0); }
    });
  }
  test('[未実装] 押したときマスの地が #E2DDD2（0.10 秒）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const cell = page.locator(SEL.cell('2026-11-13')); const b = await box(cell);
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down(); await page.waitForTimeout(170);
    expect(await cell.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(226, 221, 210)');
    await page.mouse.up();
  });
  test('[未実装] 閉じた画面の段1・4・7で、長押し 0.35 秒でチップをつかみ別の日へ落とすと日付が変わる（34 で新しく足す。中身は 21 §1.3 と R-49。§12 Q-13）', async ({ page }) => {
    await boot(page);
    for (const n of [1, 4, 7]) {
      await page.evaluate(async () => { const db = await import('/js/db.js'); const e = await db.getEvent?.('t0'); if (e) { e.start = '2026-11-12T09:00'; e.end = '2026-11-12T09:30'; await db.put?.(e) ?? db.putEvent?.(e); } });
      await page.locator(SEL.cell(DAY)).click(); await toStage(page, n);
      const dest = n === 7 ? '2026-11-13' : '2026-11-19';
      const chip = page.locator(SEL.cell(DAY)).locator('.chip,.ev,.bar').filter({ hasText: '予定A' }).first();
      const c = await box(chip); const to = await box(page.locator(SEL.cell(dest)));
      await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2); await page.mouse.down(); await page.waitForTimeout(S.CELL.longPressSec * 1000 + 80);
      await page.mouse.move(to.x + to.w / 2, to.y + to.h / 2, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(500);
      const e = await page.evaluate(async () => (await import('/js/db.js')).getEvent?.('t0'));
      expect(e?.start?.slice(0, 10), `段${n}`).toBe(dest);
      await expect(page.getByRole('button', { name: '元に戻す' })).toBeVisible();
      await page.getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(300);
    }
  });
  test('[未実装] 読み上げ: マスは1つのボタンで「11月12日 木曜日、予定N件」', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    await expect(page.locator(SEL.cell(DAY))).toHaveAttribute('aria-label', /11月12日 木曜日、予定\d+件/);
  });
});

test.describe('F. 左の色と終日のベタ塗り（§7、R-74）', () => {
  test('[未実装] 月のマスの時刻つき: 地は塗らず、左の線 2×10・角丸1。終日: ベタ塗り・角丸3・文字のコントラスト 4.5 以上', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const r = await page.locator(SEL.cell(DAY)).evaluate((d) => [...d.querySelectorAll('.chip,.ev,.bar')].map((c) => { const cs = getComputedStyle(c), line = c.querySelector('i,.cline'); const lr = line?.getBoundingClientRect(); return { all: c.dataset.all === '1' || c.classList.contains('all'), bg: cs.backgroundColor, r: cs.borderTopLeftRadius, line: lr ? [lr.width, lr.height] : null, fg: cs.color }; }));
    const timed = r.filter((c) => !c.all), all = r.filter((c) => c.all);
    expect(timed.length).toBeGreaterThan(0); expect(all.length).toBeGreaterThan(0);
    for (const c of timed) { expect(c.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/); expect(c.line).toEqual([S.CHIPS.timedLine.w, S.CHIPS.timedLine.h]); }
    const lum = (rgb) => { const [R, G, B] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
    for (const c of all) { expect(c.bg).not.toMatch(/rgba\(0, 0, 0, 0\)/); expect(c.r).toBe('3px'); const a = lum(c.bg), b = lum(c.fg); expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(S.CHIPS.minContrast); }
  });
  test('[未実装] 日の欄: 終日はベタ塗りのチップ 高さ 28・角丸14、時刻つきのカードは全部 56 で終わりの時刻あり', async ({ page }) => {
    await boot(page); await toStage(page, 3);
    const chips = await page.locator(`${SEL.day} ${SEL.dayAllDay}`).evaluateAll((cs) => cs.map((c) => [c.getBoundingClientRect().height, getComputedStyle(c).borderTopLeftRadius]));
    expect(chips.length).toBeGreaterThan(0); for (const [h, r] of chips) { expect(Math.abs(h - 28)).toBeLessThanOrEqual(S.TOL); expect(r).toBe('14px'); }
    const cards = await page.locator(`${SEL.day} ${SEL.dayCards}`).evaluateAll((cs) => cs.map((c) => [c.getBoundingClientRect().height, /\d{1,2}:\d{2}[\s\S]*\d{1,2}:\d{2}/.test(c.innerText)]));
    expect(cards.length).toBe(5); for (const [h, end] of cards) { expect(Math.abs(h - 56)).toBeLessThanOrEqual(S.TOL); expect(end).toBe(true); }
  });
  test('[未実装] 複数日の終日は週の中で1本の帯（11/11〜13）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    expect(await page.locator(`${SEL.grid} [data-event="md"]`).filter({ visible: true }).count()).toBe(1);
  });
});

test.describe('G. 消したものへ、移した先からたどり着ける（§9.1 の15項目）', () => {
  const openMore = async (page) => { await S && SEL.moreBtn(page).click(); await expect(page.getByRole('menu')).toBeVisible(); };
  test('[未実装] 1 ‹ › → 格子を左へ送ると次の月（段1）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const nav = page.locator('.mpull.browse .mph [data-act="prev"], .mpull.browse .mph [data-act="next"]');
    await expect(nav, '見出しに見えない前の月・次の月がある（可視の ‹ › ではない）').toHaveCount(2);
    // Playwright の toBeHidden は opacity:0 でも箱があれば visible とみなす。仕様は opacity:0 の 2×2。
    for (let i = 0; i < 2; i++) {
      await expect(nav.nth(i)).toHaveCSS('opacity', '0');
      const b = await box(nav.nth(i));
      expect(b.w, '見えないボタンの幅').toBeLessThanOrEqual(2.5);
    }
    const g = await box(page.locator(SEL.grid)); await page.mouse.move(g.x + 300, g.y + 100); await page.mouse.down(); await page.mouse.move(g.x + 60, g.y + 110, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(450);
    await expect(page.locator(SEL.title)).toContainText('12月');
  });
  test('[未実装] 読み上げ: 見出しに見えないボタン「前の月」「次の月」。段1は1か月、段4は1週、段7は7日送る（§12 Q-14）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    await expect(SEL.prevMonthBtn(page)).toHaveCount(1);
    await expect(SEL.nextMonthBtn(page)).toHaveCount(1);
    await SEL.nextMonthBtn(page).click({ force: true }); await page.waitForTimeout(S.TODAY.moveSec * 1000 + 80);
    await expect(page.locator(SEL.title)).toContainText('12月');
    await SEL.prevMonthBtn(page).click({ force: true }); await page.waitForTimeout(S.TODAY.moveSec * 1000 + 80);
    await expect(page.locator(SEL.title)).toContainText('11月');

    await toStage(page, 4);
    const w0 = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    await SEL.nextMonthBtn(page).click({ force: true }); await page.waitForTimeout(S.TODAY.moveSec * 1000 + 80);
    const w1 = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(w1[0]).toBe('2026-11-16'); expect(w1.length).toBe(w0.length);

    // 週を送ったあとは 11/12 が格子の外。選んだ日は 11/12 のままなので、そのまま段7へ（ここをたたくと 60s で落ちる）。
    await toStage(page, 7);
    const d0 = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    // 段4で次へ送ると選んだ日も 7 日進む（11/12→11/19）。段7の並びはその日から。次へでさらに 7 日。
    expect(d0[0]).toBe('2026-11-19');
    await SEL.nextMonthBtn(page).click({ force: true }); await page.waitForTimeout(S.TODAY.moveSec * 1000 + 80);
    const d1 = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(d1[0]).toBe('2026-11-26'); expect(d1.length).toBe(d0.length);
  });
  test('[未実装] 2 全部 → 「…」→「月の表現（手帳｜予定名｜全部）」', async ({ page }) => {
    await boot(page); await expect(page.locator('.mph [data-act="expand"], .mph .allbtn')).toHaveCount(0);
    await openMore(page); await page.getByRole('menuitem', { name: /月の表現/ }).click();
    await expect(page.getByRole('radio', { name: '全部' }).or(page.getByRole('button', { name: '全部' }))).toBeVisible();
  });
  test('[未実装] 3 今日 → 今日が画面にないときだけ「今日へ」（押せる範囲 x318〜382・y0〜44）。たたいても段は変えない。見出しの全体でも同じ（§12 Q-11）', async ({ page }) => {
    await boot(page); await expect(SEL.todayBtn(page)).toHaveCount(0);
    await page.locator(SEL.cell('2026-11-25')).click();
    const g = await box(page.locator(SEL.grid)); await page.mouse.move(g.x + 300, g.y + 100); await page.mouse.down(); await page.mouse.move(g.x + 60, g.y + 110, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(450);
    await expect(SEL.todayBtn(page)).toBeVisible();
    const t = await box(SEL.todayBtn(page));
    near(t.x, S.TODAY.hit.x[0], '今日へ 左'); near(t.r, S.TODAY.hit.x[1], '今日へ 右');
    near(t.y, S.TODAY.hit.y[0], '今日へ 上'); near(t.b, S.TODAY.hit.y[1], '今日へ 下');

    await toStage(page, 3);
    const stageBefore = await stageOf(page);
    await SEL.todayBtn(page).click(); await page.waitForTimeout(S.TODAY.moveSec * 1000 + 80);
    expect(await stageOf(page), 'たたいても段は変えない').toBe(stageBefore);
    await expect(page.locator(SEL.cell(DAY))).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator(SEL.day).evaluate((d) => d.scrollTop)).toBe(0);

    // 段7: 並びを今日から始め直す。見出しの全体をたたいても同じ。
    await page.locator(SEL.cell('2026-11-25')).click();
    const g2 = await box(page.locator(SEL.grid)); await page.mouse.move(g2.x + 300, g2.y + 100); await page.mouse.down(); await page.mouse.move(g2.x + 60, g2.y + 110, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(450);
    await toStage(page, 7);
    await page.locator(SEL.title).click(); await page.waitForTimeout(S.TODAY.moveSec * 1000 + 80);
    expect(await stageOf(page)).toBe(7);
    await expect(page.locator(SEL.cell(DAY))).toHaveAttribute('aria-selected', 'true');
    const days = await page.locator(`${SEL.grid}:not([data-leaving]) .day`).evaluateAll((ds) => ds.map((d) => d.dataset.date));
    expect(days[0]).toBe(DAY);
  });
  // v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 前「日の欄のつまみ（下）を下へ 40 で時間軸」→ 後「見出しの右の『カード｜時間』の『時間』」（design/35 §5.1。開いた縦の [data-mday] が閉じた画面に無いのは同じ）
  test('[未実装] 4 予定｜時間軸 → 日の見出しの右の「カード｜時間」の「時間」', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    await expect(page.locator('[data-mday]')).toHaveCount(0);
    await page.locator(`${SEL.day} .mdct [data-dg="time"]`).click(); await page.waitForTimeout(400);
    await expect(page.locator(`${SEL.day} .tlev, ${SEL.day} .timeline`).first()).toBeVisible();
  });
  test('[未実装] 5 設定 → 「…」→「設定」', async ({ page }) => { await boot(page); await openMore(page); await page.getByRole('menuitem', { name: '設定' }).click(); await expect(page.locator('#menu, [aria-label="設定"]').first()).toBeVisible(); });
  test('[未実装] 6 検索 → 「…」→「検索」', async ({ page }) => { await boot(page); await openMore(page); await page.getByRole('menuitem', { name: '検索' }).click(); await expect(page.getByRole('searchbox').first()).toBeVisible(); });
  test('[未実装] 7 ノート → 日の欄の「ノート ›」で一覧、下の欄でその日のノート', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    await page.locator(SEL.day).getByRole('button', { name: /ノート ›|ノートの一覧/ }).click(); await expect(page.locator('.mlist, [data-mlist]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator(SEL.day).getByRole('button', { name: /のノート/ }).click(); await expect(page.locator('.ned-body').first()).toBeVisible();
  });
  test('[未実装] 8 右の列の日付ボタンはない（今日へは見出し）', async ({ page }) => { await boot(page); await expect(page.getByRole('button', { name: '今日に戻る' })).toHaveCount(0); });
  test('[未実装] 9 下のタブはない。ホームと週の時間軸は「…」から、戻りは「‹ カレンダー」', async ({ page }) => {
    await boot(page); await expect(page.locator('.tabs')).toHaveCount(0);
    for (const name of ['ホーム', '週の時間軸']) {
      await openMore(page); await page.getByRole('menuitem', { name: new RegExp(name) }).click();
      await page.getByRole('button', { name: /カレンダー/ }).click(); await page.waitForTimeout(300); expect(await stageOf(page)).toBeGreaterThanOrEqual(1);
    }
  });
  test('[未実装] 10 六曜はマスに出さず、日の見出し「木 友引」に出す。設定に「月のマスにも六曜を出す」（初めはオフ）', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    expect(await page.locator(`${SEL.grid} .rokuyo, ${SEL.grid} .rk`).filter({ visible: true }).count()).toBe(0);
    await expect(page.locator(SEL.dayHead)).toContainText(/木\s*(大安|赤口|先勝|友引|先負|仏滅)/);
  });
  test('[未実装] 11 日の欄の下のタスクはない。右の列の「タスク」にバッジ', async ({ page }) => {
    await boot(page); await expect(page.locator(`${SEL.day} .mdtasks`)).toHaveCount(0); await expect(SEL.tasksBtn(page)).toBeVisible();
  });
  test('[未実装] 12 「タスク」の見える丸は x400〜448・y172〜220、押せる範囲は x396〜452・y168〜224（56×56。§12 Q-3）', async ({ page }) => {
    await boot(page);
    assertRailVis(await visCircle(SEL.tasksBtn(page)), S.RAIL.tasks, 'タスク');
    assertRailHit(await box(SEL.tasksBtn(page)), S.RAIL.tasks, 'タスク');
  });
  test('[守り] 13 「＋」の見える丸は x400〜448・y598〜646。選んでいる日に作る。見える丸の外・押せる範囲の内（4pt のあき）も押せる（§12 Q-3）', async ({ page }) => {
    await boot(page);
    assertRailVis(await visCircle(SEL.plusBtn(page)), S.RAIL.plus, '＋');
    const vis = S.RAIL.plus.vis;
    await page.mouse.click(vis.x[0] - 2, vis.y[0] - 2);
    await page.waitForTimeout(300);
    expect(await page.locator('#editor[open], dialog[open], .sheet').count(), '4pt のあきも押せる').toBeGreaterThan(0);
  });
  test('[守り] 13b 「＋」の押せる範囲は x396〜452・y594〜650（見える丸から上下左右に 4。§12 Q-3）', async ({ page }) => {
    await boot(page);
    assertRailHit(await box(SEL.plusBtn(page)), S.RAIL.plus, '＋');
  });
  test('[未実装] 14 「…」の見える丸は x400〜448・y232〜280、押せる範囲は x396〜452・y228〜284。中は幅 224（x152〜376、y232〜468）、上下のあき 8、行 44、左右の内側 16、行の間の線 0.5 #E4E0D6、上から ホーム・週の時間軸・検索・月の表現・設定（§12 Q-3・Q-10）', async ({ page }) => {
    await boot(page);
    assertRailVis(await visCircle(SEL.moreBtn(page)), S.RAIL.more, '…');
    assertRailHit(await box(SEL.moreBtn(page)), S.RAIL.more, '…');
    await openMore(page); const m = await box(page.getByRole('menu')); near(m.x, S.MENU.x[0]); near(m.r, S.MENU.x[1]); near(m.y, S.MENU.y[0]); near(m.b, S.MENU.y[1]);
    const items = page.getByRole('menuitem'); expect(await items.count()).toBe(5);
    for (let i = 0; i < 5; i++) { await expect(items.nth(i)).toContainText(S.MENU.items[i]); near((await box(items.nth(i))).h, S.MENU.row); }
    near((await box(items.nth(0))).y, S.MENU.y[0] + S.MENU.pad, '上のあき 8');
    near((await box(items.nth(4))).b, S.MENU.y[1] - S.MENU.pad, '下のあき 8');
    const first = await box(items.nth(0));
    expect(first.x).toBeGreaterThanOrEqual(S.MENU.x[0] + S.MENU.inset - S.TOL);
    const lines = await page.getByRole('menu').evaluate((menu) => [...menu.querySelectorAll('hr, [role="separator"], .sep, .line, li+li')].map((e) => {
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      return { h: r.height, color: (cs.borderTopColor && cs.borderTopWidth !== '0px' ? cs.borderTopColor : cs.backgroundColor), bw: cs.borderTopWidth };
    }).filter((l) => l.h <= 2 || (l.bw && parseFloat(l.bw) <= 1)));
    expect(lines.length, '行の間の線がある').toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.h <= S.MENU.line.h + 0.5 || parseFloat(l.bw || '0') <= S.MENU.line.h + 0.5).toBe(true);
      expect(l.color.replace(/\s/g, '')).toMatch(/228,\s*224,\s*214|#e4e0d6/i); // #E4E0D6
    }
  });
  test('[未実装] 15 つまみ（上）は「調整できる」1〜7、隠れた「期間を選ぶ」ボタンが残る', async ({ page }) => {
    await boot(page); const g = page.locator(SEL.grab);
    await expect(g).toHaveAttribute('role', 'slider'); await expect(g).toHaveAttribute('aria-valuemin', '1'); await expect(g).toHaveAttribute('aria-valuemax', '7');
    expect(await page.getByRole('button', { name: /期間を選ぶ/, includeHidden: true }).count()).toBeGreaterThan(0);
  });
});

test.describe('H. ノートを書いている間の右の列（§9.3）', () => {
  test('[未実装] 書いている間は「タスク」が「元に戻す」に、「＋」は消える。キーボードが閉じたら 0.15 秒で戻る', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    await page.locator(SEL.day).getByRole('button', { name: /のノート/ }).click(); await page.keyboard.type('メモ');
    await expect(SEL.undoBtn(page)).toBeVisible(); const u = await visCircle(SEL.undoBtn(page)); near(u.x, S.RAIL.tasks.vis.x[0]); near(u.y, S.RAIL.tasks.vis.y[0]);
    await expect(SEL.plusBtn(page)).toBeHidden(); await expect(SEL.tasksBtn(page)).toBeHidden();
    await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(S.NOTE_EDIT.restoreSec * 1000 + 60);
    await expect(SEL.tasksBtn(page)).toBeVisible(); await expect(SEL.plusBtn(page)).toBeVisible();
  });
});

test.describe('I. 変えないもの・戻らないもの', () => {
  const BASE = new URL('./open-baseline-5bc8af6.json', import.meta.url);
  const KEYS = ['.mph', '#ctitle', '.weekdays', '.mgrid', '.mgrab', '.mday', '.tabs', '.ctl', '.pgsw', '.fmodes', '.dpage', '.home', '.rail'];
  const snapOpen = (page) => page.evaluate((keys) => ({ rects: Object.fromEntries(keys.map((k) => { const e = [...document.querySelectorAll(k)].find((x) => x.offsetParent || getComputedStyle(x).position === 'fixed'); if (!e) return [k, null]; const r = e.getBoundingClientRect(); return [k, [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2)]; })), buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent && !b.closest('[inert],[hidden]')).map((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\d+/g, '#')).sort() }), KEYS);
  for (const [name, size, tabName] of [['開いた縦 669×951・月', SIZES.openPortrait669, '月'], ['開いた縦 669×951・ホーム', SIZES.openPortrait669, 'ホーム'], ['開いた横 951×669', SIZES.openLandscape951, null]]) {
    test(`[守り] ${name} が 5bc8af6 と同じ（要素の位置 0.5 以内、見えるボタンの名前の並び）`, async ({ page }) => {
      await openApp(page, size); await seed(page, SEED);
      if (tabName) { const t = page.getByRole('button', { name: tabName, exact: true }); if (await t.isVisible().catch(() => false)) await t.click(); }
      await page.waitForTimeout(400);
      const now = await snapOpen(page); const all = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : {};
      if (process.env.V20_WRITE_BASELINE) { all[name] = now; writeFileSync(BASE, JSON.stringify(all, null, 1)); return; }
      const was = all[name]; expect(was, '基準がない（V20_WRITE_BASELINE=1 で 5bc8af6 から作る）').toBeTruthy();
      for (const k of KEYS) { if (was.rects[k] === null) { expect(now.rects[k], k).toBeNull(); continue; } for (let i = 0; i < 4; i++) expect(Math.abs(now.rects[k][i] - was.rects[k][i]), `${k}[${i}]`).toBeLessThanOrEqual(S.TOL); }
      expect(now.buttons).toEqual(was.buttons);
    });
  }
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 月は固定しない。前→後: 「日の欄の中だけが流れ、格子は動かない」→「画面（.mpull.browse）が1本で流れ、格子も一緒に上へ流れる（行の高さは変わらない）」
  test('R-62（月を狭くしすぎない・下へ送れる）を v19.3 の形で: 段1の行 86（≥64）、画面が1本で流れ、格子も月ごと上へ流れる', async ({ page }) => {
    await boot(page); await toStage(page, 1);
    const rowH = await page.locator(`${SEL.grid} .week`).first().evaluate((w) => w.getBoundingClientRect().height); near(rowH, S.ROW[4]); expect(rowH).toBeGreaterThanOrEqual(64);
    const g0 = await box(page.locator(SEL.grid));
    const sc = await page.locator(SEL.day).evaluate((d) => { const s = d.closest('.mpull.browse'); s.scrollTop = 200; return { st: s.scrollTop, can: s.scrollHeight > s.clientHeight, inner: d.scrollTop }; });
    expect(sc.can).toBe(true); expect(sc.st).toBe(200); expect(sc.inner, '日の欄の中は流れない').toBe(0);
    const g1 = await box(page.locator(SEL.grid)); near(g1.y, g0.y - 200, '格子も月ごと流れる'); near(g1.h, g0.h, '格子の高さは変わらない');
    const rowH1 = await page.locator(`${SEL.grid} .week`).first().evaluate((w) => w.getBoundingClientRect().height); near(rowH1, S.ROW[4]);
  });
  test('[守り] ★の項目（34 で変わらないもの）は既存の spec で見る: このひな形の外で全件を流すこと', async () => {
    // 34 で置き換わらない★: 3-1・3-2・3-6（開いた横）、4-1・4-2（ノート）、6-1（R-49）、7-1、8-1、9-1、10-1。対応する spec は verify-v20-closed.md §6。
    expect(true).toBe(true);
  });
  test('[未実装] 段8はない: 段7からさらに上へ引いても data-stage は 7 のまま。ゴムで最大 24、離すと 0.22 秒で戻る', async ({ page }) => {
    await boot(page); await toStage(page, 7);
    const { x, y } = await grabCenter(page);
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y - 100, { steps: 10 }); await raf2(page);
    expect(await stageOf(page)).toBe(7);
    near((await box(page.locator(SEL.grid))).h, S.STAGES[7].H - S.RUBBER.max, 'ゴムは最大 24');
    const rec = page.evaluate((sel) => new Promise((res) => {
      const g = document.querySelector(sel); const t0 = performance.now(), hs = [];
      const f = () => { hs.push([performance.now() - t0, g.getBoundingClientRect().height]); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(hs); };
      requestAnimationFrame(f);
    }), SEL.grid);
    await page.mouse.up();
    const hs = await rec;
    const end = hs.find(([, h]) => Math.abs(h - S.STAGES[7].H) <= S.TOL);
    expect(end, '段7の高さへ戻る').toBeTruthy();
    // 7207f8a QA: 0.22 秒の out-cubic は 0.5pt 以内に入るのが約 0.16〜0.19 秒（無負荷で 162ms 実測）。
    // 「最初に TOL 以内のコマ」ではなく、C と同じく「変化 0.05 未満が続き始めるコマ」を戻り終わりとして見る。
    let settle = null;
    for (let i = 1; i < hs.length; i++) {
      if (Math.abs(hs[i][1] - hs[i - 1][1]) >= 0.05) continue;
      let ok = true;
      for (let j = i + 1; j < Math.min(i + 4, hs.length); j++) if (Math.abs(hs[j][1] - hs[j - 1][1]) >= 0.05) { ok = false; break; }
      if (ok) { settle = hs[i]; break; }
    }
    expect(settle, '戻りが止まるコマがある').toBeTruthy();
    expect(settle[0]).toBeGreaterThanOrEqual(S.RUBBER.backSec * 1000 - 50);
    expect(settle[0]).toBeLessThanOrEqual(S.RUBBER.backSec * 1000 + 50);
    expect(Math.abs(hs[hs.length - 1][1] - S.STAGES[7].H), '最後は段7の高さ').toBeLessThanOrEqual(S.TOL);
    expect(await stageOf(page)).toBe(7);
  });
});
