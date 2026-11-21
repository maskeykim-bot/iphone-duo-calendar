// 第19.2版 S11b（7c9fb05）設計レビュー 必須 M1〜M9・design/34 §13 の自動テスト（品質 2026-11-21）。
// 根拠: design/review/review-v19-2-7c9fb05-closed-mid.md §2、design/34 §13。7c9fb05 では落ちてよい（直しの確かめ用）。
// 使い方: spec-values.js と一緒に <worktree>/app/tests/ へ写し、npx playwright test s11b-design-m.spec.js --project=chromium
// 注意: Chromium は 0.5 の線を 1 に丸める。M1 は WebKit（実機と同じ）でも流すこと（--project=webkit は playwright.config の testMatch を足して）。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES } from './helpers.js';
import * as S from './spec-values.js';

const DAY = '2026-11-12'; // openApp の今日（2行目以降の週＝上に線がある行）
const SEED = [
  ...['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`)),
  ev('ad', '終日の予定', DAY, '2026-11-13', { all: true }),
  ev('md', '三日の旅行', '2026-11-11', '2026-11-14', { all: true }),
  ev('wk', '月末の会議', '2026-11-28T10:00', '2026-11-28T11:00'),
];
const cell = (k) => `.mgrid:not([data-leaving]) .day[data-date="${k}"]`;
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
async function boot(page) {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
  await openApp(page, SIZES.closedPortrait);
  await seed(page, SEED);
  const m = page.getByRole('button', { name: '月', exact: true });
  if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(300); }
}
async function toStage(page, n) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown');
  await page.waitForTimeout(400);
  expect(await stageOf(page)).toBe(n);
}
// 日の欄のつまみ（下）を下へ引いて時間軸 B へ
async function dayGripToB(page) {
  const g = page.locator('.mdgrab'); await g.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  const b = await g.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + S.DAYGRIP.toTimeline + 6, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500);
  await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
}

test.describe('S11b 設計レビュー 必須（M1〜M9）', () => {
  test('M1 行の上の線は高さを取らない: 行の上端から 日付の中心 11・チップ 22＋16k・最後のチップの下のあき 2（段1〜3、線のある行）', async ({ page }) => {
    await boot(page);
    for (const [n, rows] of [[1, 86], [2, 70], [3, 54]]) {
      await toStage(page, n);
      const m = await page.evaluate((k) => {
        const d = document.querySelector(`.mgrid:not([data-leaving]) .day[data-date="${k}"]`); const w = d.closest('.week');
        const wr = w.getBoundingClientRect(), dr = d.getBoundingClientRect(), nr = d.querySelector('.num').getBoundingClientRect();
        const chips = [...d.querySelectorAll('.chip')].filter((c) => Number(getComputedStyle(c).opacity) > 0.5).map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top);
        return { rowH: wr.height, dayTop: dr.top - wr.top, dayH: dr.height, numCy: nr.top + nr.height / 2 - wr.top, tops: chips.map((c) => c.top - wr.top), lastBottomGap: wr.height - (chips.at(-1).bottom - wr.top) };
      }, DAY);
      expect(Math.abs(m.rowH - rows), `段${n} 行の高さ`).toBeLessThanOrEqual(S.TOL);
      expect(Math.abs(m.dayTop), `段${n} マスは行の上端から（線で下がらない）`).toBeLessThanOrEqual(0.25);
      expect(Math.abs(m.dayH - rows), `段${n} マスは行の高さをまるごと使う`).toBeLessThanOrEqual(0.25);
      expect(Math.abs(m.numCy - 11), `段${n} 日付の中心 y+11`).toBeLessThanOrEqual(0.75);
      m.tops.forEach((t, k) => expect(Math.abs(t - (22 + 16 * k)), `段${n} チップ${k} の上端 22+16k`).toBeLessThanOrEqual(0.25));
      expect(Math.abs(m.lastBottomGap - 2), `段${n} 下のあき 2`).toBeLessThanOrEqual(0.25);
    }
  });

  test('M2 選んだ日の枠: ::after・内側 1・太さ 2・角丸 4・#294E42・z-index 4・box-shadow なし', async ({ page }) => {
    await boot(page);
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(250);
    const s = await page.locator(cell('2026-11-18')).evaluate((e) => {
      const a = getComputedStyle(e, '::after'), d = getComputedStyle(e);
      return { content: a.content, top: a.top, left: a.left, right: a.right, bottom: a.bottom, bw: a.borderTopWidth, bc: a.borderTopColor, br: a.borderTopLeftRadius, z: a.zIndex, pe: a.pointerEvents, shadow: d.boxShadow };
    });
    expect(s.content).not.toBe('none');
    expect([s.top, s.left, s.right, s.bottom]).toEqual(['1px', '1px', '1px', '1px']);
    expect(s.bw).toBe('2px'); expect(s.bc).toBe('rgb(41, 78, 66)'); expect(s.br).toBe('4px'); expect(s.z).toBe('4'); expect(s.pe).toBe('none');
    expect(s.shadow).toBe('none');
  });

  test('M3 時刻つきチップを押している間（:active）も地は塗らない・暗くしない（マスの地だけ #E2DDD2）', async ({ page }) => {
    await boot(page);
    const chip = page.locator(`${cell(DAY)} .strip.chip.timed`).first();
    const b = await chip.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(120);
    const s = await chip.evaluate((e) => ({ act: e.matches(':active'), bg: getComputedStyle(e).backgroundColor, f: getComputedStyle(e).filter, cell: getComputedStyle(e.closest('.day')).backgroundColor }));
    await page.mouse.up();
    expect(s.act, ':active になっている（試験の前提）').toBe(true);
    expect(s.bg).toBe('rgba(0, 0, 0, 0)'); expect(s.f).toBe('none');
    expect(s.cell).toBe('rgb(226, 221, 210)');
  });

  test('M3b 長押しでつかんでいる間、元のチップは破線の枠だけ（ベタ塗りにしない）', async ({ page }) => {
    await boot(page);
    const chip = page.locator(`${cell(DAY)} .strip.chip.timed`).first();
    const b = await chip.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(500);
    const s = await page.evaluate(() => { const g = document.querySelector('.mgrid .chip.grabbed'); if (!g) return null; const c = getComputedStyle(g); return { bg: c.backgroundColor, f: c.filter, os: c.outlineStyle }; });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 2); await page.mouse.up(); await page.keyboard.press('Escape');
    expect(s, 'つかんだ元（.grabbed）がある').not.toBeNull();
    expect(s.bg).toBe('rgba(0, 0, 0, 0)'); expect(s.f).toBe('none'); expect(s.os).toBe('dashed');
  });

  test('M4 チップのない所を長押ししても何も出ない（期間の札・メニューなし）', async ({ page }) => {
    await boot(page);
    const c = page.locator(cell('2026-11-10')); const b = await c.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 12); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); await page.waitForTimeout(200);
    await expect(page.getByText(/11月10日（\d+日）/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '終日の予定', exact: true })).toHaveCount(0); // 写しの直し: exact。種の予定「終日の予定」が、選んだ日（11/12）の日の欄の終日チップとマスの読み上げに部分一致して、いつも 2 件になるため（メニューの項目名はちょうど「終日の予定」）
    await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);
  });

  test('M5 日を選ぶと日の欄の中身が 0.15 秒で入れ替わる（2つを同時に見せない）', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__qaOp = []; const t0 = performance.now(); const tick = () => { const kids = [...document.querySelectorAll('.mday > *')]; const m = Math.min(...kids.map((k) => Number(getComputedStyle(k).opacity)), 1); window.__qaOp.push([performance.now() - t0, m]); if (performance.now() - t0 < 600) requestAnimationFrame(tick); }; window.__qaStart = () => { window.__qaOp = []; requestAnimationFrame(tick); }; });
    await page.evaluate(() => window.__qaStart());
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(650);
    const op = await page.evaluate(() => window.__qaOp);
    const dim = op.filter(([, o]) => o < 0.95);
    expect(dim.length, '途中で不透明度が下がるコマがある').toBeGreaterThan(0);
    expect(Math.min(...op.map(([, o]) => o)), '一度消えきる').toBeLessThanOrEqual(0.05);
    const span = dim.at(-1)[0] - dim[0][0];
    expect(span, '入れ替えの長さ ≈ 0.15 秒').toBeLessThanOrEqual(150 + 40);
    expect(span).toBeGreaterThanOrEqual(150 - 60);
  });

  test('M6 日の見出し h3 は行 44（段1で日付の中心 y626）', async ({ page }) => {
    await boot(page);
    const s = await page.locator('.mdh h3').evaluate((e) => { const t = e.querySelector('.hdt') || e; const r = t.getBoundingClientRect(); return { lh: getComputedStyle(e).lineHeight, lhT: getComputedStyle(t).lineHeight, cy: r.top + r.height / 2 }; });
    expect(s.lh).toBe('44px');
    expect(Math.abs(s.cy - 626), `日付の中心 ${s.cy}`).toBeLessThanOrEqual(1);
  });

  test('M7（34 §13-2）つまみ（下）の押せる範囲は「ノート ›」にかからない。押せる範囲は最後のカードの下端から 44、「ノート ›」は区域の下 12 から', async ({ page }) => {
    await boot(page);
    for (const n of [1, 4, 7]) {
      await toStage(page, n);
      const m = await page.evaluate(() => {
        const g = document.querySelector('.mdgrab'), nl = document.querySelector('.mday [data-act="notelist"]');
        const cards = [...document.querySelectorAll('.mday .mdcard, .mday .mdnone2')]; // 写しの直し: 「予定はありません」の class は .mdnone2。.mdempty はノートの欄（つまみより下）の「たたいて書く」で、カードではない（34 §13-2 は「最後のカード（予定がない日は『予定はありません』）の下端から」）
        const last = cards.at(-1); const lastBottom0 = last ? last.getBoundingClientRect().bottom : null; /* 写しの直し: 最後のカードの下端は、つまみと同じく送る前に測る（原本は送ったあとに測っていて、送った量だけずれる） */ const gr = g.getBoundingClientRect(), nr = nl.getBoundingClientRect(), line = g.querySelector('i, ::before') ? g.querySelector('i').getBoundingClientRect() : null;
        /* 写しの直し: 段1は日の欄が y604〜678 しかなく、center だと「ノート ›」の上端が y619 で、つまみ（上）の押せる範囲（格子の下端から 44＝y580〜624。34 §13-1）の下になる。日の欄の下端へ寄せて、つまみ（下）にかからないことだけを見る */ nl.scrollIntoView({ block: 'end' }); const nr2 = nl.getBoundingClientRect();
        const hit = document.elementFromPoint(nr2.left + nr2.width / 2, nr2.top + 2);
        return { gTop: gr.top, gBottom: gr.bottom, gH: gr.height, nlTop: nr.top, lastBottom: lastBottom0, hitIsNote: !!hit && (hit === nl || nl.contains(hit)), lineTop: line ? line.top - gr.top : null };
      });
      expect(m.hitIsNote, `段${n}「ノート ›」の上端をたたくと「ノート ›」`).toBe(true);
      expect(m.gBottom, `段${n} 押せる範囲の下 ≤ ノート › の上`).toBeLessThanOrEqual(m.nlTop + 0.25);
      if (m.lastBottom != null) expect(Math.abs(m.gTop - m.lastBottom), `段${n} 押せる範囲は最後のカードの下端から`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.gH - 44)).toBeLessThanOrEqual(0.5);
      if (m.lineTop != null) expect(Math.abs(m.lineTop - 18), `段${n} 線は押せる範囲の上から 18（間 8＋区域の上 10）`).toBeLessThanOrEqual(0.5);
    }
  });

  test('M8 日の欄のつまみの段（カード／時間軸）を覚える: 日を選び直しても、開き直しても同じ', async ({ page }) => {
    await boot(page);
    await dayGripToB(page);
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(400);
    await expect(page.locator('.mday'), '日を選び直しても時間軸のまま').toHaveAttribute('data-dg', 'B');
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
    const m = page.getByRole('button', { name: '月', exact: true }); if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(300); }
    await expect(page.locator('.mday'), '開き直しても時間軸のまま').toHaveAttribute('data-dg', 'B');
  });

  test('M9 格子のどこを縦に引いても段が変わる（つまみと同じ）', async ({ page }) => {
    await boot(page);
    await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(200, 150, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page), '段1で格子を上へ 150 → 段が進む').toBeGreaterThan(1);
  });

  test('M9b 日の欄を一番上まで戻した状態で下へ引くと段が戻る', async ({ page }) => {
    await boot(page); await toStage(page, 3);
    const d = await page.locator('.mday').boundingBox();
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 0; });
    await page.mouse.move(200, d.y + 60); await page.mouse.down(); await page.mouse.move(200, d.y + 180, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page), '段3で日の欄を下へ 120 → 段が戻る').toBeLessThan(3);
  });

  test('§13-1 つまみ（上）の押せる範囲は格子の下端から高さ 44（4件目のチップにかからない）', async ({ page }) => {
    await boot(page);
    for (const n of [1, 4, 7]) {
      await toStage(page, n);
      const m = await page.evaluate(() => { const g = document.querySelector('.mgrab').getBoundingClientRect(), w = document.querySelector('.mgwrap').getBoundingClientRect(); return { top: g.top, h: g.height, gridBottom: w.bottom }; });
      expect(Math.abs(m.top - m.gridBottom), `段${n} 押せる範囲の上 = 格子の下端`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.h - 44)).toBeLessThanOrEqual(0.5);
    }
  });
});
