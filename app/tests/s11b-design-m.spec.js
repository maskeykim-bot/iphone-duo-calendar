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
    await expect(page.getByRole('button', { name: '終日の予定', exact: true })).toHaveCount(0); // 開発の写しの直し（0568d18、QA 採用）: exact。種の予定「終日の予定」が、選んだ日（11/12）の日の欄の終日チップとマスの読み上げに部分一致して、いつも 2 件になるため（メニューの項目名はちょうど「終日の予定」）
    await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);
  });

  // M5 の測り方（0568d18 の QA で直した）: 前は「不透明度 0.95 未満のコマが続く長さ ≥90ms」で見ていた。これは緩急とコマの間隔で変わり、
  // WebKit では設計の緩急でも 70〜86ms になって落ちた（QA の切り分け: 標準の緩急で 10 回中 4 回落ち）。
  // 今は、時間（消す 0〜0.06 秒・出す 0.06〜0.15 秒）、順番（消えきってから替える・同時に2つ見せない）、終わりの状態、緩急の名前を見る。
  // 緩急は design/34 §16-3（2026-11-21）で確定: 出す方は直線（不透明度だけを 0.10 秒以下で変えるときは直線でよい）、消す方は標準。
  const M5_EASE = { out: 'cubic-bezier(0.2, 0.8, 0.2, 1)', in: 'linear' };
  test('M5 日を選ぶと日の欄の中身が 0.15 秒で入れ替わる（消す 0.06・出す 0.09、2つを同時に見せない、終わりは新しい日の一番上）', async ({ page }) => {
    await boot(page);
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 120; });
    await page.evaluate(() => {
      window.__qaAn = []; window.__qaFr = []; const orig = Element.prototype.animate;
      Element.prototype.animate = function (kf, opt) {
        const a = orig.call(this, kf, opt); const t = performance.now(); const o = typeof opt === 'number' ? { duration: opt } : (opt || {});
        const op = (Array.isArray(kf) ? kf : []).map((k) => k.opacity);
        const rec = { t, end: null, dur: Number(o.duration), delay: Number(o.delay || 0), ease: o.easing || 'linear', from: op[0], to: op.at(-1), inMday: !!this.closest?.('.mday') };
        window.__qaAn.push(rec); a.finished.then(() => { rec.end = performance.now(); }, () => { rec.end = -1; }); return a;
      };
      const t0 = performance.now(); window.__qaT0 = t0;
      const tick = () => { const ms = [...document.querySelectorAll('.mpull.browse .mday')]; const kids = ms.flatMap((m) => [...(m.querySelector(':scope > .mdin') || m).children]); /* v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 日の欄の中身（見出し・本体・つまみ・ノート）は .mday > .mdin の子になった（.mday はスクロール 0 で見えている箱）。見ること（中身が一度消えきる）は同じ */ window.__qaFr.push([performance.now() - t0, ms.length, Math.min(1, ...kids.map((k) => Number(getComputedStyle(k).opacity)))]); if (performance.now() - t0 < 700) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({ an: window.__qaAn.filter((a) => a.inMday), fr: window.__qaFr }));
    const outs = r.an.filter((a) => a.from === 1 && a.to === 0), ins = r.an.filter((a) => a.from === 0 && a.to === 1);
    expect(outs.length, '前の中身を消すアニメーションがある').toBeGreaterThan(0);
    expect(ins.length, '次の中身を出すアニメーションがある').toBeGreaterThan(0);
    for (const a of outs) expect(a.dur + a.delay, '消すのは 0.06 秒').toBe(60);
    for (const a of ins) expect(a.dur, '出すのは 0.09 秒（0.06〜0.15）').toBe(90);
    const outEnd = Math.max(...outs.map((a) => a.end)), inStart = Math.min(...ins.map((a) => a.t + a.delay));
    expect(outs.every((a) => a.end > 0), '消し終わる').toBe(true);
    expect(inStart, '消えきってから出し始める（2つを同時に見せない）').toBeGreaterThanOrEqual(outEnd - 1);
    expect(inStart - Math.min(...outs.map((a) => a.t)), '出し始めは押してから約 0.06 秒（1コマの遅れまで）').toBeLessThanOrEqual(60 + 40);
    if (M5_EASE.out) for (const a of outs) expect(a.ease).toBe(M5_EASE.out);
    if (M5_EASE.in) for (const a of ins) expect(a.ease).toBe(M5_EASE.in);
    expect(Math.max(...r.fr.map(([, n]) => n)), '.mday はいつも1つ').toBe(1);
    expect(Math.min(...r.fr.map(([, , o]) => o)), '一度消えきる').toBeLessThanOrEqual(0.05);
    expect(r.fr.at(-1)[2], '終わりは不透明度 1').toBe(1);
    const end = await page.evaluate(() => { const m = document.querySelector('.mpull.browse .mday'); return { st: m.scrollTop, h: m.querySelector('.mdh h3')?.textContent || '', hidden: m.getAttribute('aria-hidden'), pe: getComputedStyle(m).pointerEvents }; });
    expect(end.st, 'カードは一番上へ戻る').toBe(0);
    expect(end.h, '見出しは新しい日').toContain('18');
    expect(end.hidden).toBeNull(); expect(end.pe).not.toBe('none');
  });

  test('M5 視差効果を減らす設定では入れ替えは即時', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page);
    await page.evaluate(() => { window.__qaN = 0; const o = Element.prototype.animate; Element.prototype.animate = function (...a) { if (this.closest?.('.mday')) window.__qaN++; return o.apply(this, a); }; });
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(80);
    expect(await page.evaluate(() => window.__qaN)).toBe(0);
    await expect(page.locator('.mpull.browse .mday .mdh h3')).toContainText('18');
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
        const cards = [...document.querySelectorAll('.mday .mdcard, .mday .mdnone2')]; // 開発の写しの直し（QA 採用）: 「予定はありません」の class は .mdnone2。.mdempty はノートの欄（つまみより下）の「たたいて書く」で、カードではない（34 §13-2 は「最後のカード（予定がない日は『予定はありません』）の下端から」）
        const last = cards.at(-1); const lastBottom0 = last ? last.getBoundingClientRect().bottom : null; /* 開発の写しの直し（QA 採用）: 最後のカードの下端は、つまみと同じく送る前に測る（原本は送ったあとに測っていて、送った量だけずれる） */ const gr = g.getBoundingClientRect(), nr = nl.getBoundingClientRect(), line = g.querySelector('i, ::before') ? g.querySelector('i').getBoundingClientRect() : null;
        /* 開発の写しの直し（QA 採用）: 段1は日の欄が y604〜678 しかなく、center だと「ノート ›」の上端が y619 で、つまみ（上）の押せる範囲（格子の下端から 44＝y580〜624。34 §13-1）の下になる。日の欄の下端へ寄せて、つまみ（下）にかからないことだけを見る */ nl.scrollIntoView({ block: 'end' }); const nr2 = nl.getBoundingClientRect();
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

  // M8 の保存値（duo.ui.v1 の dayGrip。app.js loadUi は 0〜2 の整数だけを受け、ほかはカード=0）。
  for (const bad of [3, -1, 1.5, 'x', null, '1', true]) {
    test(`M8 保存値 dayGrip=${JSON.stringify(bad)} で起動するとカード（A）`, async ({ page }) => {
      await page.addInitScript((v) => { if (!sessionStorage.getItem('qa-dg')) { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, dayGrip: v })); sessionStorage.setItem('qa-dg', '1'); } }, bad);
      await boot(page);
      await expect(page.locator('.mpull.browse .mday')).toHaveAttribute('data-dg', 'A');
      await expect(page.locator('.mpull.browse .mday .tl')).toHaveCount(0);
    });
  }
  for (const [v, dg, hh] of [[1, 'B', 44], [2, 'C', 88]]) {
    test(`M8 保存値 dayGrip=${v} は ${dg} で起動し、閉じる⇄開く・読み込み直しのあとも ${dg}（保存値も ${v} のまま）`, async ({ page }) => {
      await page.addInitScript((v) => { if (!sessionStorage.getItem('qa-dg')) { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, dayGrip: v })); sessionStorage.setItem('qa-dg', '1'); } }, v);
      await boot(page);
      const md = page.locator('.mpull.browse .mday');
      await expect(md).toHaveAttribute('data-dg', dg);
      const hours = async () => md.locator('.hour').evaluateAll((es) => es.slice(0, 2).map((e) => e.getBoundingClientRect().top));
      for (let i = 0; i < 2; i++) {
        await page.setViewportSize({ width: 626, height: 890 }); await page.waitForTimeout(400);
        await page.setViewportSize({ width: 466, height: 678 }); await page.waitForTimeout(500);
        await expect(md, `閉じる⇄開く ${i + 1} 回目`).toHaveAttribute('data-dg', dg);
      }
      const h = await hours(); if (h.length === 2) expect(Math.abs(h[1] - h[0] - hh)).toBeLessThanOrEqual(0.5);
      await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
      await expect(page.locator('.mpull.browse .mday')).toHaveAttribute('data-dg', dg);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).dayGrip)).toBe(v);
    });
  }

  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: M9（格子のどこでも縦に引くと段が変わる）はやめた。段を変えるのは つまみ（上）だけ。前→後: 格子を上へ 150 引くと「段が進む」→「段は変わらない・触覚ログ 0」。つまみを同じだけ引くと進むことも見る
  test('M9（v19.3 でやめた）格子を縦に引いても段は変わらない。つまみ（上）を引くと変わる', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__duoHapticLog.length = 0; });
    await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(200, 150, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page), '段1で格子を上へ 150 → 段は変わらない').toBe(1);
    expect(await page.evaluate(() => window.__duoHapticLog.length), '触覚ログ 0').toBe(0);
    await page.locator('.mpull.browse').evaluate((e) => { e.scrollTop = 0; });
    const g = await page.locator('.mgrab').boundingBox();
    await page.mouse.move(200, g.y + 12); await page.mouse.down(); await page.mouse.move(200, g.y + 12 - 150, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page), 'つまみ（上）を上へ 150 → 段が進む').toBeGreaterThan(1);
  });

  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: M9b（日の欄を一番上から下へ引くと段が戻る）はやめた。前→後: 「段が戻る」→「段は変わらない・触覚ログ 0」
  test('M9b（v19.3 でやめた）日の欄を一番上から下へ引いても段は変わらない', async ({ page }) => {
    await boot(page); await toStage(page, 3);
    const d = await page.locator('.mday').boundingBox();
    await page.evaluate(() => { window.__duoHapticLog.length = 0; });
    await page.mouse.move(200, d.y + 60); await page.mouse.down(); await page.mouse.move(200, d.y + 180, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page), '段3で日の欄を下へ 120 → 段は変わらない').toBe(3);
    expect(await page.evaluate(() => window.__duoHapticLog.length), '触覚ログ 0').toBe(0);
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
