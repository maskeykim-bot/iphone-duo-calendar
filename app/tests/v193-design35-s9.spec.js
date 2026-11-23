// design/35-cards.md §9「品質がそのまま試験にできる確かめ方」を、行の ID のまま試験にしたもの（実装担当）。Chromium と WebKit の両方で回す。
// その2 で入れた行: S-1〜S-9（閉じた画面の「カード｜時間」と時間のバー）・L-1（閉じた横の切り替え）・O-1／O-2（開いた画面に「カード｜時間」とバーが無い）・
//   K-14（タスクの四角）・R-20（リマインダー停止の知らせ）・N-1／N-2（ノートのチェック行→タスク・両方向）。
// その3 で足す行: K-1〜K-12・V-1〜V-3・D-1〜D-3・M-1〜M-13・M-30〜M-38・N-20〜N-22（カードと別の日への移動）。
// 数字は getBoundingClientRect と getComputedStyle で、差 1 まで（35 §9）。閉じた縦 466×678・右の帯 84。
import { test, expect } from '@playwright/test';
import { SIZES, openApp, reloadKeep, notifyOn } from './helpers.js';
import { T, seedTasks } from './task-helpers.js';
import { boot as bootNote, openDayNote, typeList, saved, closeSheet, tasks as dbTasks } from './v193-note-lib.js';
import { boot, DAY, SEC, stageOf, haptics, ui, scTop, setScroll, rect, hourGap, lineY, toTime, toCard, barPt, mouseDrag, touchDrag, near } from './v193-p2-lib.js';

const css = (page, sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);

test('35 §9 S-1 切り替え: 日の見出しの右に「カード｜時間」132×32・角丸 8・地 #E4E0D6、1つの押せる範囲 66×44、帯ありで右端 x370', async ({ page }) => {
  await boot(page);
  const sw = await rect(page, '.mday .mdct'), mdh = await rect(page, '.mday .mdh');
  expect(near(sw.w, 132) && near(sw.h, 32)).toBe(true);
  expect(near(sw.r, 370)).toBe(true);
  expect(near(sw.y + sw.h / 2, mdh.y + 22)).toBe(true); // 見出し 44 の上下の中央
  expect(await css(page, '.mday .mdct', 'backgroundColor')).toBe('rgb(228, 224, 214)');
  expect(parseFloat(await css(page, '.mday .mdct', 'borderTopLeftRadius'))).toBe(8);
  const bs = await page.evaluate(() => [...document.querySelectorAll('.mday .mdct button')].map((b) => { const r = b.getBoundingClientRect(), c = getComputedStyle(b); return { t: b.textContent, w: r.width, h: r.height, y: r.top, pressed: b.getAttribute('aria-pressed'), fs: c.fontSize, fw: c.fontWeight, color: c.color }; }));
  expect(bs.map((b) => b.t)).toEqual(['カード', '時間']);
  for (const b of bs) { expect(near(b.w, 66) && near(b.h, 44)).toBe(true); expect(b.fs).toBe('13px'); expect(b.fw).toBe('600'); }
  expect(bs.map((b) => b.pressed)).toEqual(['true', 'false']);
  expect(bs[0].color).toBe('rgb(41, 59, 53)'); expect(bs[1].color).toBe('rgb(104, 113, 106)');
  expect(await page.locator('.mday .mdct').getAttribute('aria-label')).toBe('日の見せ方');
  // 押せる範囲の上端・下端（見た目 32 の上下に 6 ずつ）でも切り替わる
  await page.mouse.click(sw.x + 66 + 33, sw.y - 5); await page.waitForTimeout(350);
  expect((await ui(page)).dayGrip).toBe(1);
  await page.mouse.click(sw.x + 33, sw.b + 5); await page.waitForTimeout(350);
  expect((await ui(page)).dayGrip).toBe(0);
});

test('35 §9 S-2 カードにつまみなし: つまみ（下）の要素が無い。日の欄を上下に引いても dayGrip が変わらない', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.mday .mdgrab')).toHaveCount(0);
  await expect(page.locator('.mday .mdback')).toHaveCount(0);
  const c = await rect(page, '.mday .mdcard');
  for (const [a, b] of [[c.y + 20, c.y + 140], [c.y + 140, c.y + 10]]) { await mouseDrag(page, 150, a, 150, b); await touchDrag(page, 150, a, 150, b); }
  const h = await rect(page, '.mday .mdh');
  await touchDrag(page, 60, h.y + 20, 60, h.y + 160);
  expect((await ui(page)).dayGrip).toBe(0);
  expect(await page.locator('.mday').getAttribute('data-dg')).toBe('A');
  expect(await stageOf(page)).toBe(4);
  expect(await haptics(page)).toEqual([]);
});

test('35 §9 S-3 時間・最低限: 1時間の線の間が 28。終日の行がバーの下に見える。最初に見える時刻＝最初の予定の1時間前', async ({ page }) => {
  await boot(page);
  await toTime(page);
  expect((await ui(page)).dayGrip).toBe(1);
  expect(near(await hourGap(page), 28, 0.5)).toBe(true);
  const mdh = await rect(page, '.mday .mdh'), bar = await rect(page, '.mday .mdgrab'), ad = await rect(page, '.mday .mdbody > .allday'), pill = await rect(page, '.mday .mdbody .adpill'), tl = await rect(page, '.mday .tl');
  expect(near(bar.y, mdh.b)).toBe(true); expect(near(bar.h, 24)).toBe(true); // バーは見出しのすぐ下、区域 24
  const line = await rect(page, '.mday .mdgrab i');
  expect(near(line.w, 36) && near(line.h, 4) && near(line.y - bar.y, 10)).toBe(true);
  expect(await css(page, '.mday .mdgrab i', 'backgroundColor')).toBe('rgb(185, 180, 168)');
  expect(ad.y >= bar.b - 1).toBe(true); expect(pill.y >= bar.b - 1 && pill.b <= tl.y + 1).toBe(true); // 終日の行はバーの下・時間軸の上
  expect(pill.b < 678).toBe(true);
  expect(await scTop(page)).toBe(0); // 画面は送っていない（月が見えたまま）
  // 最初の予定 9:00 の1時間前＝8:00 の線が、時間軸の上端のすぐ下（上の余白 12）。7:00 の線は畳んであって見えない
  expect(near(await lineY(page, 480), tl.y + 12)).toBe(true);
  expect(await lineY(page, 420) < tl.y).toBe(true);
  const hidden = await page.evaluate(() => { const tl = document.querySelector('.mday .tl').getBoundingClientRect(); const l = [...document.querySelectorAll('.mday .hlab')].find((e) => e.textContent === '7:00').getBoundingClientRect(); return document.elementFromPoint(l.left + 4, Math.max(1, l.top + 7))?.textContent !== '7:00' && l.bottom <= tl.top + 12; });
  expect(hidden).toBe(true);
});

test('35 §9 S-4 バーで広げる: バーを下へ 60 引いて止めると 1時間 58。バーのすぐ下の時刻の線の y は引く前と同じ', async ({ page }) => {
  await boot(page, { dg: 1 });
  const y0 = await lineY(page, 480), p = await barPt(page), bar0 = await rect(page, '.mday .mdgrab');
  await mouseDrag(page, p.x, p.y, p.x, p.y + 60, { up: false, hold: 150 });
  expect(near(await hourGap(page), 58, 0.5)).toBe(true);
  expect(near(await lineY(page, 480), y0)).toBe(true);
  expect(near((await rect(page, '.mday .mdgrab')).y, bar0.y)).toBe(true); // バーも動かない（端のゴムの外）
  expect(await css(page, '.mday .mdgrab i', 'backgroundColor')).toBe('rgb(104, 113, 106)'); // 押している間 #68716A
  await page.mouse.up(); await page.waitForTimeout(450);
  // 指（pointerType:touch）でも同じ 1:0.5
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  const got = await page.evaluate(async ({ x, y }) => {
    const t = document.querySelector('.mpull.browse .mdgrab'); const o = (yy) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: 0, buttons: 1 });
    t.dispatchEvent(new PointerEvent('pointerdown', o(y)));
    const out = [];
    for (const d of [20, 40, 60]) { window.dispatchEvent(new PointerEvent('pointermove', o(y + d))); out.push(parseFloat(document.querySelector('.mday .tl').style.getPropertyValue('--hh'))); } // 同じコマのうちに変わる（1コマも遅れない）
    window.dispatchEvent(new PointerEvent('pointercancel', o(y + 60)));
    return out;
  }, p);
  expect(got).toEqual([38, 48, 58]);
});

test('35 §9 S-5 バーで寄せる: 下へ 70 で離すと 0.25 秒後に 88、50 で離すと 28。58 をまたいだとき触覚ログ 1 件', async ({ page }) => {
  await boot(page, { dg: 1 });
  let p = await barPt(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 70, { hold: 150, settle: 0 });
  await page.waitForTimeout(120);
  const mid = await hourGap(page); expect(mid > 63 && mid < 88).toBe(true); // 0.25 秒かけて寄る途中
  await page.waitForTimeout(330);
  expect(near(await hourGap(page), 88, 0.5)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(2);
  expect(await page.locator('.mday').getAttribute('data-dg')).toBe('C');
  expect(await haptics(page)).toEqual([{ dayBar: 2, t: 0 }]); // 58 をまたいだ先（詳細）を 1 件だけ
  // 最低限へ戻して、下へ 50 で離す → 28 のまま。またいでいないので触覚は増えない
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
  await page.evaluate(() => { window.__duoHapticLog.length = 0; });
  p = await barPt(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 50, { hold: 150 });
  expect(near(await hourGap(page), 28, 0.5)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(1);
  expect(await haptics(page)).toEqual([]);
});

test('35 §9 S-6 ゴム: 88 からさらに下へ 100 引くと、88＋最大 24 の見かけで止まり、離すと 88', async ({ page }) => {
  await boot(page, { dg: 2 });
  const p = await barPt(page), bar0 = await rect(page, '.mday .mdgrab'), y0 = await lineY(page, 480);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 100, { up: false, hold: 150 });
  expect(near(await hourGap(page), 88, 0.5)).toBe(true); // 1時間の高さは 88 のまま
  const bar1 = await rect(page, '.mday .mdgrab');
  expect(near(bar1.y - bar0.y, 24)).toBe(true); // バーと時間軸が指に少しついてくる（超えた引きの 0.3 倍、最大 24）
  expect(near(await lineY(page, 480) - y0, 24)).toBe(true);
  await page.mouse.move(p.x, p.y + 30, { steps: 4 }); await page.waitForTimeout(150); // 止めてから離す（速く払うと払った向きへ寄る）
  expect(near((await rect(page, '.mday .mdgrab')).y - bar0.y, 9)).toBe(true); // 30×0.3
  await page.mouse.up(); await page.waitForTimeout(450);
  expect(near((await rect(page, '.mday .mdgrab')).y, bar0.y)).toBe(true);
  expect(near(await hourGap(page), 88, 0.5)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(2);
  expect(await haptics(page)).toEqual([]);
});

test('35 §9 S-7 バーは貼り付かない: 時間で下へ 300 送ると、バーも日の見出しと一緒に流れて画面の外へ。上に残るのは年月と曜日（y0〜64）だけ。戻すと見出しのすぐ下にあり、引けば幅が変わる', async ({ page }) => {
  await boot(page, { dg: 1 });
  // v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 日の欄の下の「ノートの欄」（最小 88）がノートのカードに替わり、ノートのない日は日の欄が短くなった（送れる量 247）。300 送れるよう、その日にノートを 2 枚置く
  await page.evaluate(async (d) => { const db = await import('/js/db.js'); for (const i of [1, 2]) await db.putNote({ id: `s7-${i}`, body: `メモ${i}`, createdAt: i, updatedAt: i, folderId: null, pinned: false, pinnedAt: null, date: d, deletedAt: null }); }, DAY);
  await reloadKeep(page); await page.waitForTimeout(400);
  const bar0 = await rect(page, '.mday .mdgrab'), mdh0 = await rect(page, '.mday .mdh');
  await setScroll(page, 300);
  expect(await scTop(page)).toBe(300);
  const bar1 = await rect(page, '.mday .mdgrab'), mdh1 = await rect(page, '.mday .mdh'), fix = await rect(page, '.mpfix');
  expect(near(bar1.y, bar0.y - 300) && near(mdh1.y, mdh0.y - 300)).toBe(true);
  expect(bar1.b < 64).toBe(true); // y64 に止まらない（見出し＋曜日の下に隠れて見えない）
  expect(await css(page, '.mday .mdgrab', 'position')).toBe('relative');
  expect(near(fix.y, 0) && near(fix.b, 64)).toBe(true);
  const stuck = await page.evaluate(() => [...document.querySelectorAll('.mpull.browse *')].filter((e) => getComputedStyle(e).position === 'sticky').map((e) => e.className));
  expect(stuck).toEqual(['mpfix']);
  await setScroll(page, 0);
  const bar2 = await rect(page, '.mday .mdgrab');
  expect(near(bar2.y, (await rect(page, '.mday .mdh')).b)).toBe(true);
  const p = await barPt(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 60, { up: false, hold: 150 });
  expect(near(await hourGap(page), 58, 0.5)).toBe(true);
  await page.mouse.up();
});

test('35 §9 S-8 バー以外では変わらない: 時間軸・格子・日の欄を縦に引いても、1時間の高さも段も変わらない（触覚ログも増えない）', async ({ page }) => {
  await boot(page, { dg: 1 });
  const tl = await rect(page, '.mday .tl'), grid = await rect(page, '.mgwrap'), mdh = await rect(page, '.mday .mdh'), ad = await rect(page, '.mday .mdbody > .allday');
  const pulls = [[200, tl.y + 40, 200, tl.y + 200], [200, tl.y + 220, 200, tl.y + 30], [20, tl.y + 60, 20, tl.y + 200], [200, grid.y + 30, 200, grid.y + 150], [200, grid.b - 20, 200, grid.y + 10], [60, mdh.y + 22, 60, mdh.y + 150], [30, ad.y + 14, 30, ad.y + 130]];
  for (const [x0, y0, x1, y1] of pulls) {
    await touchDrag(page, x0, y0, x1, y1, { settle: 80 });
    await mouseDrag(page, x0, y0, x1, y1, { settle: 80 });
    await page.keyboard.press('Escape'); // 時間軸の空きを長く引いて出来かけた予定の箱などは捨てる
  }
  await page.waitForTimeout(400);
  expect(near(await hourGap(page), 28, 0.5)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(1);
  expect(await stageOf(page)).toBe(4);
  expect(await haptics(page)).toEqual([]);
});

test('35 §9 S-9 覚える: 時間・詳細にして 閉じる⇄開く・読み込み直しのあとも dayGrip 2 のまま、1時間 88', async ({ page }) => {
  await boot(page, { dg: 1 });
  const p = await barPt(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 120, { hold: 150 });
  expect((await ui(page)).dayGrip).toBe(2);
  await page.setViewportSize(SIZES.openPortrait669); await page.waitForTimeout(500);
  await expect(page.locator('.shell.closed')).toHaveCount(0);
  expect((await ui(page)).dayGrip).toBe(2);
  await page.setViewportSize(SIZES.closedPortrait); await page.waitForTimeout(500);
  expect(await page.locator('.mday').getAttribute('data-dg')).toBe('C');
  expect(near(await hourGap(page), 88, 0.5)).toBe(true);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  expect(await page.locator('.mday').getAttribute('data-dg')).toBe('C');
  expect(near(await hourGap(page), 88, 0.5)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(2);
  await expect(page.locator('.mday .mdct [data-dg="time"]')).toHaveAttribute('aria-pressed', 'true');
});

test('35 §9 L-1 閉じた横の切り替え: 見出し 44 の下に「カード｜時間」188×32（y50〜82、1つ 94、押せる 94×44）。カード 188×56 は y88 より下', async ({ page }) => {
  await boot(page, { size: SIZES.closedLandscape });
  const mdh = await rect(page, '.mday .mdh'), sw = await rect(page, '.mday .mdct');
  expect(near(mdh.y, 0) && near(mdh.h, 44)).toBe(true);
  expect(near(sw.x, 394) && near(sw.w, 188) && near(sw.y, 50) && near(sw.b, 82)).toBe(true);
  const bs = await page.evaluate(() => [...document.querySelectorAll('.mday .mdct button')].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, y: r.top }; }));
  for (const b of bs) expect(near(b.w, 94) && near(b.h, 44) && near(b.y, 44)).toBe(true);
  const first = await page.evaluate(() => { const e = document.querySelector('.mday .mdad, .mday .mdcards, .mday .mdnone2').getBoundingClientRect(); return e.top; });
  expect(first >= 88 - 1).toBe(true);
  const card = await rect(page, '.mday .mdcard');
  expect(near(card.w, 188) && near(card.h, 56) && card.y >= 88).toBe(true);
  // 時間にすると、切り替えの行の下にバー（幅いっぱい×24）、その下に終日の行。1時間 28
  await toTime(page);
  const bar = await rect(page, '.mday .mdgrab');
  expect(near(bar.y, 88) && near(bar.h, 24) && near(bar.w, 188)).toBe(true);
  expect(near(await hourGap(page), 28, 0.5)).toBe(true);
  const p = await barPt(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 70, { hold: 150 });
  expect(near(await hourGap(page), 88, 0.5)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(2);
  await toCard(page);
  await expect(page.locator('.mday .mdgrab')).toHaveCount(0);
});

for (const [id, name, size] of [['O-1', '開いた縦', SIZES.openPortrait669], ['O-2', '開いた横', SIZES.openLandscape951]]) {
  test(`35 §9 ${id} ${name}は変わらない: 「カード｜時間」・時間のバー・カード 56 が無い（その2 の分。open-baseline との比べは v193-closed-scroll の 9 と closed-pull-v20 の I）`, async ({ page }) => {
    await boot(page, { size, dg: 2, sar: 0, ui: id === 'O-1' ? { view: 'month' } : {} });
    await expect(page.locator('.shell.closed')).toHaveCount(0);
    await expect(page.locator('.mdct, .mdctrow, .mdgrab, .mdcard')).toHaveCount(0);
    if (id === 'O-1') { // 開いた縦の日の欄は「予定｜時間軸」（.mdsw）のまま
      await expect(page.locator('.mpull .mdsw')).toHaveCount(1);
      expect(await page.locator('.mpull .mdsw button').allTextContents()).toEqual(['予定', '時間軸']);
    }
    expect((await ui(page)).dayGrip).toBe(2); // 閉じた画面の覚えは開いている間も変わらない
  });
}

// ---- K-14・R-20（項目 E。くわしい試験は tests/v193-tasks-local.spec.js）、N-1・N-2（項目 F。くわしい試験は tests/v193-note-tasks.spec.js） ----

for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ['開いた横', SIZES.openLandscape951]]) {
  test(`35 §9 K-14 タスクのページの四角（${name}）: 20×20・角丸 4・線 1.75。押せる範囲は 44 のまま`, async ({ page }) => {
    await openApp(page, size, '', { home: false });
    await seedTasks(page, [T('a', { title: '未完了' }), T('c', { title: '完了', done: true, doneAt: '2026-11-12T09:00', order: 3 })]);
    if (size.width < 600) await page.locator('.cb.ctask').click(); else await page.locator('.pgl [data-pick="task"]').first().click();
    await expect(page.locator('.rmck:visible').first()).toBeVisible();
    const list = await page.locator('.rmck').evaluateAll((l) => l.filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
      const r = e.getBoundingClientRect(), c = getComputedStyle(e), b = e.closest('.rmckb').getBoundingClientRect();
      let decl = ''; for (const sh of document.styleSheets) { let rules = []; try { rules = [...sh.cssRules]; } catch { /* */ } for (const ru of rules) { const v = ru.selectorText && ru.style ? ru.style.getPropertyValue('border') || ru.style.getPropertyValue('border-width') : ''; if (v && e.matches(ru.selectorText)) decl = v; } }
      return { w: r.width, h: r.height, rad: c.borderTopLeftRadius, decl, hit: [b.width, b.height] };
    }));
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const m of list) {
      expect(near(m.w, 20, 0.01) && near(m.h, 20, 0.01)).toBe(true); expect(m.rad).toBe('4px');
      expect(m.decl).toContain('1.75px'); // 等倍の画面では計算値が 1px に丸まるので、効いている宣言の値で見る（実機 3 倍では 5 画素）
      expect(m.hit[0] >= 44 && m.hit[1] >= 44).toBe(true);
    }
  });
}

test('35 §9 R-20 リマインダー停止の知らせ: 同期をオンにしていた端末で版を上げて起動すると、閉じた縦でシート y378〜678・後ろが暗い・見出しに焦点。OK で閉じ、2 回目の起動では出ない。一度もオンにしていない端末では出ない', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
  await openApp(page, SIZES.closedPortrait, '', { home: false });
  const sheet = page.locator('#remend');
  await expect(sheet).toBeHidden(); // 一度もオンにしていない端末
  await reloadKeep(page); await expect(sheet).toBeHidden();
  await page.evaluate(() => localStorage.setItem('duo-rem-sync', JSON.stringify({ enabled: true, everEnabled: true, duoListId: 'L1', duoListTitle: 'Duo', lists: [], addTo: '', declined: [], syncedAt: 1 })));
  await reloadKeep(page);
  await expect(sheet).toBeVisible(); await page.waitForTimeout(400);
  const r = await rect(page, '#remend');
  expect(near(r.x, 0) && near(r.r, 466) && near(r.y, 378) && near(r.b, 678)).toBe(true);
  await expect(sheet.locator('h2')).toHaveText('iPhone のリマインダーとの同期をやめました');
  expect(await sheet.innerText()).not.toMatch(/許可|権限/);
  const st = await sheet.evaluate((d) => ({ modal: d.matches(':modal'), back: getComputedStyle(d, '::backdrop').backgroundColor, focusIn: d.contains(document.activeElement) }));
  expect(st.modal).toBe(true); expect(st.back).toBe('rgba(28, 31, 29, 0.24)'); expect(st.focusIn).toBe(true);
  await sheet.locator('#remend-ok').click();
  await expect(sheet).toBeHidden();
  await reloadKeep(page); await page.waitForTimeout(400);
  await expect(sheet).toBeHidden(); // 2 回目の起動では出ない
});

test('35 §9 N-1 ノート→タスク: 日付のノートで「- [ ] 牛乳」→ 状態の行に「タスクに足しました（期限 11月12日）」（シートで最初の 1 件だけ）。閉じるとタスクに「牛乳」（期限 11/12）。日の欄のカードと副題「ノート「…」から」は その3', async ({ page }) => {
  await bootNote(page);
  await openDayNote(page);
  await typeList(page, ['牛乳']);
  await expect(page.locator('.nsheet .ned-status.info > span')).toHaveText('タスクに足しました（期限 11月12日）', { timeout: 4000 });
  await expect(page.locator('.nsheet .ned-status.info')).toHaveCount(0, { timeout: 3500 });
  await page.keyboard.press('Enter'); await page.keyboard.type('卵'); await saved(page);
  await expect(page.locator('.nsheet .ned-status.info')).toHaveCount(0);
  await closeSheet(page);
  expect((await dbTasks(page)).map((t) => [t.title, t.due?.date, t.due?.time ?? null]).sort()).toEqual([['卵', '2026-11-12', null], ['牛乳', '2026-11-12', null]]);
  await page.locator('.cb.ctask').click();
  await expect(page.locator('.rmrow .rmt', { hasText: '牛乳' })).toHaveCount(1);
});

test('35 §9 N-2 両方向: タスクの四角をたたく → ノートの行が「- [x] 」。ノートで四角をたたく → タスクが完了', async ({ page }) => {
  await bootNote(page);
  await openDayNote(page);
  await typeList(page, ['牛乳', '卵']); await saved(page);
  await page.locator('.nsheet .ned-chk').first().click(); await saved(page); // ノート側で「牛乳」
  expect((await dbTasks(page)).find((t) => t.title === '牛乳').done).toBe(true);
  await closeSheet(page);
  await page.locator('.cb.ctask').click();
  await page.locator('.rmrow', { hasText: '卵' }).locator('.rmckb').click(); // タスク側で「卵」
  const body = () => page.evaluate(async () => (await (await import('/js/db.js')).listNotes()).find((n) => n.date === '2026-11-12').body);
  await expect.poll(body, { timeout: 6000 }).toMatch(/- \[x\] 牛乳\n- \[x\] 卵$/);
  expect((await dbTasks(page)).every((t) => t.done)).toBe(true);
});

// ====================== その3: カード（K・V・D）と別の日への移動（M・N-20〜22） ======================
import * as P3 from './v193-p3-lib.js';
const { DAY: D12, D13, D14, D16, cardSel, cell, hold, carry, dropOn, mvlog, toast, dbTasks: p3Tasks, dbNotes: p3Notes, dbEvs: p3Evs, note: mkNote, task: mkTask } = P3;
const r3 = P3.rect, c3 = P3.css;
const KINDS = [['event', 'e1', '会議'], ['task', 't1', '見積もりを送る'], ['note', 'n1', '買い物']];
const scrollTo = (page, sel) => page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
// 線の太さは、1 倍の画面では計算値が整数に丸まる（1.75 → 1px）ので、スタイルシートの指定を読む（K-14 と同じ）
const borderDecl = (page, sel) => page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); let decl = ''; for (const sh of document.styleSheets) { let rules = []; try { rules = [...sh.cssRules]; } catch { /* */ } for (const ru of rules) { const v = ru.selectorText && ru.style ? ru.style.getPropertyValue('border') || ru.style.getPropertyValue('border-width') : ''; if (v && e.matches(ru.selectorText)) decl = v; } } return decl; }, sel);
const rawTasks = (page, list) => page.evaluate(async (a) => { const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n.startsWith('duo-calendar')); const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); await new Promise((res, rej) => { const tx = db.transaction('tasks', 'readwrite'); a.forEach((t) => tx.objectStore('tasks').put(t)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); }, list);
const anims = (page, sel) => page.evaluate((s) => document.querySelector(s)?.getAnimations().map((a) => ({ d: a.effect.getTiming().duration, e: a.effect.getTiming().easing })) || [], sel);

test('35 §9 K-1 3種類の箱: 高さ 56・角丸 14・地 #FFFFFF・幅 358、カードの間 8', async ({ page }) => {
  await P3.boot(page);
  const rs = [];
  for (const [k, id] of KINDS) {
    const sel = cardSel(k, id), r = await r3(page, sel); rs.push(r);
    expect(near(r.h, 56) && near(r.w, 358) && near(r.x, 12)).toBe(true);
    expect(await c3(page, sel, 'backgroundColor')).toBe('rgb(255, 255, 255)');
    expect(parseFloat(await c3(page, sel, 'borderTopLeftRadius'))).toBe(14);
    expect(await c3(page, sel, 'boxShadow')).toBe('none');
  }
  const e2 = await r3(page, cardSel('event', 'e2'));
  expect(near(e2.y - rs[0].b, 8)).toBe(true); // 予定のカードの間 8
});

test('35 §9 K-2・K-3 題名（左 68・上 8・15/600/20、3つの左端が同じ）と副題（左 68・上 30・11/400 #68716A）', async ({ page }) => {
  await P3.boot(page);
  const xs = [];
  for (const [k, id] of KINDS) {
    const sel = cardSel(k, id), r = await r3(page, sel), t = await r3(page, `${sel} strong`), sub = await r3(page, `${sel} small`);
    expect(near(t.x - r.x, 68) && near(t.y - r.y, 8)).toBe(true); xs.push(t.x);
    expect(await c3(page, `${sel} strong`, 'fontSize')).toBe('15px'); expect(await c3(page, `${sel} strong`, 'fontWeight')).toBe('600'); expect(await c3(page, `${sel} strong`, 'lineHeight')).toBe('20px');
    expect(near(sub.x - r.x, 68) && near(sub.y - r.y, 30)).toBe(true);
    expect(await c3(page, `${sel} small`, 'fontSize')).toBe('11px'); expect(await c3(page, `${sel} small`, 'fontWeight')).toBe('400'); expect(await c3(page, `${sel} small`, 'color')).toBe('rgb(104, 113, 106)');
  }
  expect(near(xs[0], xs[1], 0.5) && near(xs[1], xs[2], 0.5)).toBe(true);
  expect(await page.locator(`${cardSel('event', 'e1')} small`).textContent()).toBe('資料を印刷して持参');
  expect(await page.locator(`${cardSel('task', 't1')} small`).textContent()).toBe('18:00 まで');
  expect(await page.locator(`${cardSel('note', 'n1')} small`).textContent()).toBe('牛乳・卵・食パン・コーヒー豆');
  // 副題がないとき: 題名の位置は動かさず空ける
  const e2 = await r3(page, cardSel('event', 'e2')), t2 = await r3(page, `${cardSel('event', 'e2')} strong`);
  expect(near(t2.y - e2.y, 8)).toBe(true); await expect(page.locator(`${cardSel('event', 'e2')} small`)).toHaveCount(0);
});

test('35 §9 K-4 種類の印: 予定＝時刻2つ（上 9・29）と色の線（左 56、3×40）／タスク＝四角 20×20・角丸 4・線 1.75（色の線なし）／ノート＝紙 16×20（色の線なし）', async ({ page }) => {
  await P3.boot(page);
  const e = cardSel('event', 'e1'), t = cardSel('task', 't1'), n = cardSel('note', 'n1');
  const er = await r3(page, e), t1 = await r3(page, `${e} .mdt1`), t2 = await r3(page, `${e} .mdt2`), ln = await r3(page, `${e} .mdln`);
  expect(near(t1.y - er.y, 9) && near(t2.y - er.y, 29) && near(t1.x - er.x, 12)).toBe(true);
  expect(await page.locator(`${e} .mdt1`).textContent()).toBe('9:00'); expect(await page.locator(`${e} .mdt2`).textContent()).toBe('10:00');
  expect(near(ln.x - er.x, 56) && near(ln.w, 3) && near(ln.h, 40) && near(ln.y - er.y, 8)).toBe(true);
  const tr = await r3(page, t), box = await r3(page, `${t} .rmck`);
  expect(near(box.w, 20, 0.5) && near(box.h, 20, 0.5)).toBe(true);
  expect(box.x >= tr.x + 12 && box.r <= tr.x + 48 && near(box.cy, tr.cy)).toBe(true); // 印の列 x12〜48 の中、上下の中央
  expect(parseFloat(await c3(page, `${t} .rmck`, 'borderTopLeftRadius'))).toBe(4); expect(await borderDecl(page, `${t} .rmck`)).toMatch(/^1\.75px solid/);
  await expect(page.locator(`${t} .mdln`)).toHaveCount(0);
  const nr = await r3(page, n), pp = await r3(page, `${n} .mdpaper`);
  expect(near(pp.w, 16, 0.5) && near(pp.h, 20, 0.5)).toBe(true);
  expect(pp.x >= nr.x + 12 && pp.r <= nr.x + 48 && near(pp.cy, nr.cy)).toBe(true);
  await expect(page.locator(`${n} .mdln`)).toHaveCount(0);
  // タスクの四角（左 x0〜52×56）は別の押せる物
  const ck = await r3(page, `${t} .mdck`); expect(near(ck.x - tr.x, 0) && near(ck.w, 52) && near(ck.h, 56)).toBe(true);
});

test('35 §9 K-5・V-3 色に頼らない: 白黒（filter:grayscale(1)）でも、印の形（数字と線・四角・紙）と区画の見出しの文字で分かる', async ({ page }, info) => {
  await P3.boot(page);
  await page.addStyleTag({ content: 'html{filter:grayscale(1)}' });
  // 形の違い: 印の要素の種類と外形（文字 2 行／正方形／縦長）
  const marks = await page.evaluate(() => ['event', 'task', 'note'].map((k) => { const c = document.querySelector(`.mday .mdcard.mdk-${k}`); const m = c.querySelector(k === 'event' ? '.mdt1' : k === 'task' ? '.rmck' : '.mdpaper'); const r = m.getBoundingClientRect(); return { tag: m.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), text: m.textContent.trim() }; }));
  expect(marks[0].text).toMatch(/^\d+:\d\d$/); expect(marks[1].w).toBe(marks[1].h); expect(marks[2].h > marks[2].w).toBe(true); expect(marks[2].tag).toBe('svg');
  expect(await page.locator('.mday .mdsh').allTextContents()).toEqual(['タスク ›', 'ノート ›']);
  // 月のマスの印の形も違う（タスク＝8×8 の四角、ノート＝8×10 の紙）
  const shot = process.env.V193_SHOTS; if (shot && info.project.name === 'chromium') await page.screenshot({ path: `${shot}/p3-cards-gray.png` });
});

test('35 §9 K-6 題名なし: 「（題名なし）」「（題名なし）」「新規ノート」が #A8ABA4・400', async ({ page }) => {
  await P3.boot(page, { events: [P3.ev('x1', '', `${D12}T09:00`, `${D12}T10:00`)], tasks: [], notes: [mkNote('n0', '', D12)] });
  await rawTasks(page, [mkTask('t0', '', { date: D12 })]); // 題名が空のタスクは今は保存できない（「タスク名を入力してください。」）。前の版のデータにあった場合の見え方を、保存先へ直に置いて確かめる
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(450);
  for (const [sel, txt] of [[cardSel('event', 'x1'), '（題名なし）'], [cardSel('task', 't0'), '（題名なし）'], [cardSel('note', 'n0'), '新規ノート']]) {
    expect((await page.locator(`${sel} strong`).textContent()).trim()).toBe(txt);
    expect(await c3(page, `${sel} strong`, 'color')).toBe('rgb(168, 171, 164)'); expect(await c3(page, `${sel} strong`, 'fontWeight')).toBe('400');
  }
  expect(await page.locator(cardSel('note', 'n0')).getAttribute('aria-label')).toBe('ノート、新規ノート');
  expect(await page.locator(`${cardSel('task', 't0')} .mdopen`).getAttribute('aria-label')).toBe('タスク、未完了、題名なし');
});

test('35 §9 K-7 長い題名（100 字・絵文字・改行）: 1 行で、右 12 の手前に「…」。カードは 56 のまま', async ({ page }) => {
  const long = 'あ'.repeat(96) + '😀😀😀😀';
  await P3.boot(page, { events: [P3.ev('x1', long, `${D12}T09:00`, `${D12}T10:00`)], tasks: [mkTask('t0', long, { date: D12 })], notes: [mkNote('n0', `${long}つづき\n2行目`, D12)] });
  for (const sel of [cardSel('event', 'x1'), cardSel('task', 't0'), cardSel('note', 'n0')]) {
    const r = await r3(page, sel), t = await r3(page, `${sel} strong`);
    expect(near(r.h, 56)).toBe(true); expect(near(t.h, 20)).toBe(true); expect(near(r.r - t.r, 12)).toBe(true);
    expect(await c3(page, `${sel} strong`, 'textOverflow')).toBe('ellipsis'); expect(await c3(page, `${sel} strong`, 'whiteSpace')).toBe('nowrap');
    expect(await page.locator(`${sel} strong`).evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  }
  // ノートの題名は 100 字（絵文字を割らない）・1 行目だけ
  const nt = (await page.locator(`${cardSel('note', 'n0')} strong`).textContent());
  expect(Array.from(nt).length).toBe(100); expect(nt.endsWith('😀😀😀😀')).toBe(true); expect(nt.includes('2行目')).toBe(false);
});

test('35 §9 K-8 完了・期限切れ: 完了＝四角 #294E42 の塗り・題名 #A8ABA4 取り消し線・1.5 秒後に区画の一番下へ。期限切れ＝四角の線と「期限切れ」が #B43C3C', async ({ page }) => {
  await P3.boot(page, { tasks: [mkTask('t1', '見積もりを送る', { date: D12, time: '18:00' }), mkTask('t2', '請求書の確認', { date: D12 }, { createdAt: 2 }), mkTask('t9', '書類を出す', { date: '2026-11-10' })] });
  const order = () => page.locator('.mday .mdtasks .mdcard').evaluateAll((l) => l.map((e) => e.dataset.task));
  expect(await order()).toEqual(['t1', 't2']);
  await scrollTo(page, cardSel('task', 't1'));
  await page.locator(`${cardSel('task', 't1')} .mdck`).click(); await page.waitForTimeout(200);
  const t = cardSel('task', 't1');
  expect(await c3(page, `${t} .rmck`, 'backgroundColor')).toBe('rgb(41, 78, 66)');
  expect(await c3(page, `${t} strong`, 'color')).toBe('rgb(168, 171, 164)'); expect(await c3(page, `${t} strong`, 'textDecorationLine')).toBe('line-through');
  expect(await page.locator(`${t} .mdck`).getAttribute('aria-checked')).toBe('true');
  expect(await order()).toEqual(['t1', 't2']); // 1.5 秒の待ちの間は元の位置
  await page.waitForTimeout(1500);
  expect(await order()).toEqual(['t2', 't1']); // 区画の一番下へ
  expect((await anims(page, cardSel('task', 't1'))).some((a) => a.d === 250)).toBe(true); // 0.25 秒（寄せ）
  expect((await p3Tasks(page)).find((x) => x.id === 't1').done).toBe(true);
  // 期限切れ（10 日が期限・未完了）
  await page.locator(cell('2026-11-10')).first().click(); await page.waitForTimeout(350);
  const o = cardSel('task', 't9');
  expect(await page.locator(o).getAttribute('class')).toContain('over');
  expect(await c3(page, `${o} .rmck`, 'borderTopColor')).toBe('rgb(180, 60, 60)');
  expect(await page.locator(`${o} small`).textContent()).toBe('期限切れ'); expect(await c3(page, `${o} .mdover`, 'color')).toBe('rgb(180, 60, 60)');
  expect(await page.locator(`${o} .mdopen`).getAttribute('aria-label')).toBe('タスク、未完了、期限切れ、書類を出す');
});

test('35 §9 K-9 押した色: カードを押したまま 0.2 秒で地 #F5F3EC', async ({ page }) => {
  await P3.boot(page);
  for (const [k, id] of KINDS) {
    const sel = cardSel(k, id); await scrollTo(page, sel);
    const r = await r3(page, sel);
    await page.mouse.move(r.x + 200, r.cy); await page.mouse.down(); await page.waitForTimeout(200);
    expect(await c3(page, sel, 'backgroundColor')).toBe('rgb(245, 243, 236)');
    await page.mouse.move(r.x + 200, r.cy + 30, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(150); // 8 より先に動かして離す（開かない）
  }
});

test('35 §9 K-10 並び: 終日 → 予定（時刻順）→「タスク ›」→ タスク →「ノート ›」→ ノート →「＋ タスク」「＋ ノート」', async ({ page }) => {
  await P3.boot(page, {
    events: [P3.ev('e2', 'ランチ', `${D12}T12:00`, `${D12}T13:00`), P3.ev('e1', '会議', `${D12}T09:00`, `${D12}T10:00`), P3.ev('ad', '三日の旅行', '2026-11-11T00:00', '2026-11-13T23:59', { all: true })],
    tasks: [mkTask('t1', '見積もりを送る', { date: D12, time: '18:00' }), mkTask('t2', '請求書の確認', { date: D12 }), mkTask('tn', '期限なし', null)],
    notes: [mkNote('n1', '買い物', D12), mkNote('n2', '議事メモ', D12, { createdAt: 6 }), mkNote('nn', '日付なし', null)],
  });
  const seq = await page.evaluate(() => [...document.querySelectorAll('.mday .mdallday, .mday .mdcard, .mday .mdsh, .mday .mdadd button')].map((e) => ({ t: e.matches('.mdallday') ? `終日:${e.querySelector('.mdat').textContent}` : e.matches('.mdsh') ? e.textContent.trim() : e.matches('.mdadd button') ? e.textContent.trim() : `${e.className.match(/mdk-(\w+)/)[1]}:${e.querySelector('strong').textContent.trim()}`, y: e.getBoundingClientRect().top })));
  expect(seq.map((x) => x.t)).toEqual(['終日:三日の旅行', 'event:会議', 'event:ランチ', 'タスク ›', 'task:見積もりを送る', 'task:請求書の確認', 'ノート ›', 'note:買い物', 'note:議事メモ', '＋ タスク', '＋ ノート']);
  for (let i = 1; i < seq.length - 1; i++) expect(seq[i].y >= seq[i - 1].y).toBe(true);
  // 期限なしのタスク・日付のないノートは日の欄に出ない
  await expect(page.locator('.mday', { hasText: '期限なし' })).toHaveCount(0); await expect(page.locator('.mday', { hasText: '日付なし' })).toHaveCount(0);
  // 「＋ タスク」「＋ ノート」: 13/600 #294E42、押せる高さ 44、左 x16 と x112
  const a = await page.evaluate(() => [...document.querySelectorAll('.mday .mdadd button')].map((b) => { const r = b.getBoundingClientRect(), c = getComputedStyle(b); return { x: r.left, h: r.height, fs: c.fontSize, fw: c.fontWeight, col: c.color }; }));
  expect(near(a[0].x, 16) && near(a[1].x, 112)).toBe(true);
  for (const b of a) { expect(near(b.h, 44)).toBe(true); expect(b.fs).toBe('13px'); expect(b.fw).toBe('600'); expect(b.col).toBe('rgb(41, 78, 66)'); }
});

test('35 §9 K-11 区画の見出し: 中身のない区画は見出しごと出ない。ある区画は高さ 32・13/600 #68716A・押せる高さ 44。「タスク ›」はタスクのページ、「ノート ›」はノートの一覧', async ({ page }) => {
  await P3.boot(page);
  await page.locator(cell(D16)).first().click(); await page.waitForTimeout(350); // 何もない日: 見出しごと出ない。「予定はありません」と「＋ タスク」「＋ ノート」だけ
  await expect(page.locator('.mday .mdnone2')).toHaveText('予定はありません'); await expect(page.locator('.mday .mdsh')).toHaveCount(0); await expect(page.locator('.mday .mdadd button')).toHaveCount(2);
  await page.locator(cell(D12)).first().click(); await page.waitForTimeout(350);
  for (const sel of ['.mday .mdtsh', '.mday .mdnl']) {
    const r = await r3(page, sel); expect(near(r.h, 32)).toBe(true); expect(near(r.x, 12)).toBe(true);
    expect(await c3(page, sel, 'fontSize')).toBe('13px'); expect(await c3(page, sel, 'fontWeight')).toBe('600'); expect(await c3(page, sel, 'color')).toBe('rgb(104, 113, 106)'); expect(await c3(page, sel, 'paddingLeft')).toBe('4px');
    const hit = await page.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return [document.elementFromPoint(r.left + 20, r.top - 5)?.closest('.mdsh') === e, document.elementFromPoint(r.left + 20, r.bottom - 1)?.closest('.mdsh') === e]; }, sel);
    expect(hit).toEqual([true, true]); // 見た目 32 の上に 6（上のカードとの間）まで押せる
  }
  await scrollTo(page, '.mday .mdtsh'); await page.locator('.mday .mdtsh').click(); await page.waitForTimeout(300);
  await expect(page.locator('.shell.closed .rmlist, .shell.closed .taskl, .shell.closed [data-page="task"]').first()).toBeVisible();
});

test('35 §9 K-12 月のマスの名前: 閉じた縦・横のマスにタスク（□ 8×8・角丸 2）とノート（紙 8×10）の名前のチップ。.tkn と緑の線は出ない。開いた縦・横の月は今のまま', async ({ page }) => {
  for (const size of [SIZES.closedPortrait, SIZES.closedLandscape]) {
    await P3.boot(page, { size, stage: 1, events: [P3.ev('e1', '会議', `${D12}T09:00`, `${D12}T10:00`)] });
    const c = `${cell(D12)}`;
    const chips = await page.evaluate((s) => [...document.querySelector(s).querySelectorAll('.chip')].map((e) => ({ t: e.textContent, k: e.dataset.task ? 'task' : e.dataset.note ? 'note' : 'event', top: e.getBoundingClientRect().top })), c);
    expect(chips.map((x) => `${x.k}:${x.t}`)).toEqual(['event:会議', 'task:見積もりを送る', 'note:買い物']); // 時刻つき → タスク → ノート
    expect(chips[0].top < chips[1].top && chips[1].top < chips[2].top).toBe(true);
    const bx = await r3(page, `${c} .cbox`), pp = await r3(page, `${c} .cpaper`);
    expect(near(bx.w, 8, 0.5) && near(bx.h, 8, 0.5)).toBe(true); expect(parseFloat(await c3(page, `${c} .cbox`, 'borderTopLeftRadius'))).toBe(2); expect(await borderDecl(page, `${c} .cbox`)).toMatch(/^1\.25px solid/);
    expect(near(pp.w, 8, 0.5) && near(pp.h, 10, 0.5)).toBe(true);
    await expect(page.locator(`${SEC} .week .tkn`)).toHaveCount(0); await expect(page.locator(`${SEC} .week .mline`)).toHaveCount(0);
  }
  for (const size of [SIZES.openPortrait669, SIZES.openLandscape951]) { // 開いた画面の月: 名前のチップは出ない（ノートは緑の線のまま）
    await page.setViewportSize(size); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    await expect(page.locator('.week .chip.xk')).toHaveCount(0);
    if (await page.locator(cell(D12)).count()) await expect(page.locator(`${cell(D12)} .mline`).first()).toBeVisible();
  }
});

test('35 §9 V-1 読み上げ（カード）: 種類 → 状態 → 時刻・期限 → 題名 → 添え。頭の語は「予定」「タスク」「ノート」', async ({ page }) => {
  await P3.boot(page, {
    events: [P3.ev('e1', '会議', `${D12}T09:00`, `${D12}T10:00`, { notes: '資料を印刷して持参' }), P3.ev('ad', '三日の旅行', '2026-11-11T00:00', '2026-11-13T23:59', { all: true }), P3.ev('rp', '定例', `${D12}T15:00`, `${D12}T15:30`, { recurrence: { freq: 'weekly', interval: 1, byDay: [4] } })],
    tasks: [mkTask('t1', '見積もりを送る', { date: D12, time: '18:00' }), mkTask('t2', '請求書の確認', { date: D12 }, { done: true, doneAt: '2026-11-12T07:00' })],
  });
  expect(await page.locator(cardSel('event', 'e1')).getAttribute('aria-label')).toBe('予定、9時00分、10時00分まで、会議、資料を印刷して持参');
  expect(await page.locator('.mday .mdallday').getAttribute('aria-label')).toBe('予定、終日、三日の旅行、3日間のうち2日目');
  expect(await page.locator('.mday .mdcard[data-event^="rp"]').getAttribute('aria-label')).toBe('予定、15時00分、15時30分まで、定例、繰り返し');
  expect(await page.locator(`${cardSel('task', 't1')} .mdopen`).getAttribute('aria-label')).toBe('タスク、未完了、見積もりを送る、18時00分まで');
  expect(await page.locator(`${cardSel('task', 't2')} .mdopen`).getAttribute('aria-label')).toBe('タスク、完了、請求書の確認');
  expect(await page.locator(cardSel('note', 'n1')).getAttribute('aria-label')).toBe('ノート、買い物、牛乳・卵・食パン・コーヒー豆');
});

test('35 §9 V-2 読み上げ（四角・マス）: 「完了にする、見積もりを送る」。マスは「11月12日 木曜日、予定2件、タスク1件、ノート1件」（0 件の種類は言わない）', async ({ page }) => {
  await P3.boot(page, { notes: [...P3.NOTES, mkNote('n3', '13日のノート', D13)] });
  expect(await page.locator(`${cardSel('task', 't1')} .mdck`).getAttribute('aria-label')).toBe('完了にする、見積もりを送る');
  expect(await page.locator(`${cardSel('task', 't1')} .mdck`).getAttribute('role')).toBe('checkbox');
  expect(await page.locator(cell(D12)).first().getAttribute('aria-label')).toMatch(/^11月12日 木曜日、予定2件、タスク1件、ノート1件：/);
  expect(await page.locator(cell(D13)).first().getAttribute('aria-label')).toBe('11月13日 金曜日、ノート1件'); // 予定・タスクが 0 件: 言わない
  expect(await page.locator(cell(D14)).first().getAttribute('aria-label')).toBe('11月14日 土曜日、予定0件'); // 何もない日
  await page.locator(`${cardSel('task', 't1')} .mdck`).click(); await page.waitForTimeout(150);
  expect(await page.locator(`${cardSel('task', 't1')} .mdck`).getAttribute('aria-label')).toBe('未完了に戻す、見積もりを送る');
});

test('35 §9 D-1 カードに日付なし: 3種類のカードの文字に「11月」「日（」を含まない（予定の時刻は出る）。旧メモ由来（1行目が日付の見出し）のノートも', async ({ page }) => {
  await P3.boot(page, { notes: [...P3.NOTES, mkNote('memo-2026-11-12', '2026年11月12日（木）\n旧メモの本文\n2行目', D12, { sourceDate: D12, sourceHeading: true, createdAt: 3 })] });
  const texts = await page.locator('.mday .mdcard').allInnerTexts();
  expect(texts.length).toBe(5);
  for (const t of texts) { expect(t).not.toContain('11月'); expect(t).not.toContain('日（'); expect(t).not.toMatch(/\d{4}年/); }
  expect(texts[0]).toContain('9:00');
  expect((await page.locator(`${cardSel('note', 'memo-2026-11-12')} strong`).textContent())).toBe('旧メモの本文');
  for (const l of await page.locator('.mday .mdcard, .mday .mdcard button').evaluateAll((l) => l.map((e) => e.getAttribute('aria-label')).filter(Boolean))) { expect(l).not.toContain('11月'); expect(l).not.toContain('日（'); }
});

// ---- D-2・D-3: 開くと日付・開いて日付を変える ----
const openCard = async (page, kind, id) => { await scrollTo(page, cardSel(kind, id)); await page.locator(cardSel(kind, id)).click(); await page.waitForTimeout(600); };
test('35 §9 D-2 開くと日付: シートの一番上の行に「11月12日（木）」のカプセル（高さ 32・角丸 8）。上の帯はその下（閉じた縦 y196〜240）。六曜は出ない。2027 年の日は「2027年1月5日（火）」', async ({ page }) => {
  await P3.boot(page, { notes: [...P3.NOTES, mkNote('n27', '来年のこと', '2027-01-05')], ui: { rokuyo: true } });
  await openCard(page, 'note', 'n1');
  const cap = await r3(page, '.nsheet .nsdcap'), row = await r3(page, '.nsheet .nsdate'), top = await r3(page, '.nsheet .ned-top'), sh = await r3(page, '.nsheet');
  expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('11月12日（木）'); // 六曜（先勝）は出ない
  expect(near(cap.h, 32) && near(cap.x, 20) && near(cap.y, 158)).toBe(true); expect(parseFloat(await c3(page, '.nsheet .nsdcap', 'borderTopLeftRadius'))).toBe(8);
  expect(await c3(page, '.nsheet .nsdcap', 'backgroundColor')).toBe('rgb(239, 236, 228)'); expect(await c3(page, '.nsheet .nsdcap', 'fontSize')).toBe('14px'); expect(await c3(page, '.nsheet .nsdcap', 'color')).toBe('rgb(41, 59, 53)');
  expect(near(row.y, sh.y) && near(row.h, 44) && near(sh.y, 152)).toBe(true); // シートの一番上の行 44
  expect(near(top.y, 196) && near(top.b, 240)).toBe(true);
  expect(await page.locator('.nsheet .ned-title').inputValue()).toBe('買い物');
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(700);
  // 今年でない日のノート（日付の行からその日へ移して確かめる代わりに、その日のカードを開く）
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, selected: '2027-01-05' })); });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(450);
  await openCard(page, 'note', 'n27');
  expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('2027年1月5日（火）');
});
test('35 §9 D-2 閉じた横・開いた縦・開いた横のシートにも日付の行 44（閉じた横: 日付の行 y8〜52、上の帯 y60〜104。R2）', async ({ page }) => {
  await P3.boot(page, { size: SIZES.closedLandscape });
  await openCard(page, 'note', 'n1');
  let row = await r3(page, '.nsheet .nsdate'), top = await r3(page, '.nsheet .ned-top');
  expect(near(row.y, 8) && near(row.b, 52)).toBe(true); expect(near(top.y, 60) && near(top.b, 104)).toBe(true);
  expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('11月12日（木）');
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(700);
  for (const size of [SIZES.openPortrait669, SIZES.openLandscape951]) {
    await page.setViewportSize(size);
    await page.evaluate((land) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, view: 'month', home: false, spreadType: land ? 'tt' : s.spreadType, focusMode: 'calendar' })); }, size.width > size.height);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(450);
    const dn = page.locator(`[data-act="daynote"][data-day="${D12}"]`).filter({ visible: true }).first();
    await dn.scrollIntoViewIfNeeded(); await dn.click(); await page.waitForTimeout(700);
    row = await r3(page, '.nsheet .nsdate'); top = await r3(page, '.nsheet .ned-top'); const sh = await r3(page, '.nsheet'), cap = await r3(page, '.nsheet .nsdcap');
    expect(near(row.y, sh.y) && near(row.h, 44)).toBe(true); expect(top.y >= row.b - 1 && top.y <= row.b + 9).toBe(true); // 上の帯の上に 44
    expect(near(cap.h, 32)).toBe(true); expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('11月12日（木）');
    await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(700);
  }
});
test('35 §9 D-3 開いて日付を変える: カプセル→小さな月→14。シートはそのまま、12 のカードが消え、14 のマスにチップ。札「14日（土）へ移しました｜元に戻す」が 6 秒', async ({ page }) => {
  await P3.boot(page);
  await openCard(page, 'note', 'n1');
  await page.locator('.nsheet .nsdcap').click(); await page.waitForTimeout(250);
  expect(await c3(page, '.nsheet .nsdcap', 'backgroundColor')).toBe('rgb(41, 78, 66)'); expect(await c3(page, '.nsheet .nsdcap', 'color')).toBe('rgb(255, 255, 255)'); // 緑の塗り・白文字
  await expect(page.locator('.nsheet > .dpop')).toBeVisible();
  expect(await page.locator('.nsheet > .dpop .dpchips').innerText()).toContain('今日');
  await page.locator(`.nsheet > .dpop .dpgrid [data-day="${D14}"]`).click(); await page.waitForTimeout(400);
  await expect(page.locator('.nsheet')).toBeVisible(); expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('11月14日（土）');
  await expect(page.locator('.nsheet > .dpop')).toBeHidden();
  await expect(page.locator(cardSel('note', 'n1'))).toHaveCount(0);
  await expect(page.locator(`${cell(D14)} .chip[data-note="n1"]`)).toHaveCount(1);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました'); await expect(toast(page).getByRole('button', { name: '元に戻す' })).toBeVisible();
  expect((await p3Notes(page)).find((n) => n.id === 'n1').date).toBe(D14);
  expect(await page.locator('#status').textContent()).toBe('買い物を11月14日土曜日へ移しました');
  await page.waitForTimeout(5000); await expect(toast(page)).toHaveCount(1);
  await page.waitForTimeout(1300); await expect(toast(page)).toHaveCount(0); // 6 秒で消える
});

// ---- M: 別の日へ動かす（閉じた縦） ----
const LIFT = 'matrix(1.03, 0, 0, 1.03, 0, 0)';
const haps = async (page) => (await mvlog(page)).filter((x) => x.ev === 'haptic').map((x) => x.kind);
for (const [k, id, title] of KINDS) {
  test(`35 §9 M-1・M-11（${title}）つかむまで: 0.30 秒で離すと開く。0.35 秒押すと 1.03 倍・影 0 4 12・触覚 medium・元の場所に破線 1.5 #A8ABA4`, async ({ page }) => {
    await P3.boot(page);
    const sel = cardSel(k, id); await scrollTo(page, sel);
    const r = await r3(page, sel), p = { x: r.x + 200, y: r.cy };
    await hold(page, p, 300); await page.mouse.up(); await page.waitForTimeout(500);
    await expect(page.locator(k === 'event' ? '#editor[open]' : k === 'task' ? '#taskdlg[open]' : '.nsheet:not([hidden])')).toBeVisible(); // たたいた扱い＝開く
    expect(await haps(page)).toEqual([]);
    if (k === 'note') await page.locator('.nsheet .ned-done').click(); else await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    await scrollTo(page, sel); const r2 = await r3(page, sel), p2 = { x: r2.x + 200, y: r2.cy };
    await hold(page, p2, 350 + 220); // 0.35 秒で持ち上がり、0.15 秒で大きくなり切る
    await expect.poll(() => c3(page, sel, 'transform'), { timeout: 2000 }).toBe(LIFT);
    expect(await c3(page, sel, 'boxShadow')).toBe('rgba(0, 0, 0, 0.1) 0px 4px 12px 0px');
    expect(await c3(page, sel, 'backgroundColor')).toBe('rgb(255, 255, 255)'); // 地は白に戻す
    expect(await page.locator(sel).evaluate((e) => getComputedStyle(e).transitionDuration.split(',')[0].trim())).toBe('0.15s');
    expect(await haps(page)).toEqual(['medium']);
    const hole = await page.evaluate(() => { const h = document.querySelector('.ghole'), r = h.getBoundingClientRect(), c = getComputedStyle(h); return { x: r.left, y: r.top, w: r.width, h: r.height, style: c.borderTopStyle, color: c.borderTopColor, rad: c.borderTopLeftRadius, decl: h.matches('.ghole') }; });
    expect(near(hole.x, r2.x) && near(hole.y, r2.y) && near(hole.w, 358) && near(hole.h, 56)).toBe(true);
    expect(hole.style).toBe('dashed'); expect(hole.color).toBe('rgb(168, 171, 164)'); expect(hole.rad).toBe('14px');
    expect(await borderDecl(page, '.ghole')).toMatch(/^1\.5px dashed/);
    expect(await page.locator('#status').textContent()).toBe(`${title}をつかみました。月の日へ落とします。`);
    await page.mouse.up(); await page.waitForTimeout(400); // その場で離す＝やめた
    await expect(page.locator('.ghole, .gchip, .lifted, .grabbed')).toHaveCount(0); await expect(toast(page)).toHaveCount(0);
    await expect(page.locator('#editor[open], #taskdlg[open], .nsheet:not([hidden])')).toHaveCount(0); // 長押しのあとは開かない
  });
}
test('35 §9 M-1 タスクの四角の上で長押ししても同じようにつかむ（たたいたときだけ完了）', async ({ page }) => {
  await P3.boot(page);
  const ck = `${cardSel('task', 't1')} .mdck`; await scrollTo(page, ck);
  await hold(page, await P3.center(page, ck), 570);
  await expect.poll(() => c3(page, cardSel('task', 't1'), 'transform'), { timeout: 2000 }).toBe(LIFT);
  await page.mouse.up(); await page.waitForTimeout(300);
  expect(await page.locator(ck).getAttribute('aria-checked')).toBe('false'); // 完了にならない
  await page.locator(ck).click(); await page.waitForTimeout(150);
  expect(await page.locator(ck).getAttribute('aria-checked')).toBe('true');
});
test('35 §9 M-2 8 より先に動いたら: 押して 0.2 秒で 10 下へ → つかまない（ページの送りに任せる）', async ({ page }) => {
  await P3.boot(page);
  for (const [k, id] of KINDS) {
    const sel = cardSel(k, id); await scrollTo(page, sel);
    const p = await P3.center(page, sel);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.move(p.x, p.y + 10, { steps: 2 }); await page.waitForTimeout(400);
    await expect(page.locator('.gchip, .ghole, .lifted')).toHaveCount(0);
    await page.mouse.up(); await page.waitForTimeout(150);
    expect(await c3(page, SEC, 'touchAction')).toBe('pan-y'); expect(['auto', 'manipulation', 'pan-y']).toContain(await c3(page, sel, 'touchAction')); // 縦の動きは画面のスクロール（カード自身は止めない）
  }
  expect(await haps(page)).toEqual([]);
  // 指（pointerType:touch）でも同じ
  const p = await P3.center(page, cardSel('event', 'e1'));
  await page.evaluate(async ({ x, y }) => { const t = document.elementFromPoint(x, y); const o = (yy) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: 0, buttons: 1 }); t.dispatchEvent(new PointerEvent('pointerdown', o(y))); await new Promise((r) => setTimeout(r, 200)); window.dispatchEvent(new PointerEvent('pointermove', o(y - 10))); await new Promise((r) => setTimeout(r, 300)); window.dispatchEvent(new PointerEvent('pointercancel', o(y - 10))); }, p);
  await expect(page.locator('.gchip, .ghole, .lifted')).toHaveCount(0);
});
test('35 §9 M-3 札: つかんで 30 動かすと 高さ 32・角丸 8・白。下の端＝指の y−24、横の中心＝指の x（画面の端 8 内に収まる）', async ({ page }) => {
  await P3.boot(page);
  for (const [k, id, title] of KINDS) {
    const sel = cardSel(k, id); await scrollTo(page, sel);
    const p = await P3.center(page, sel);
    await hold(page, p); await page.mouse.move(p.x, p.y + 20, { steps: 3 }); await page.waitForTimeout(60);
    await expect(page.locator('.gchip.on')).toHaveCount(0); // 24 動くまではカードのまま
    await page.mouse.move(p.x + 5, p.y + 30, { steps: 2 }); await page.waitForTimeout(220);
    const c = await r3(page, '.gchip');
    expect(near(c.h, 32)).toBe(true); expect(near(c.b, p.y + 30 - 24)).toBe(true); expect(near(c.cx, p.x + 5)).toBe(true);
    expect(await c3(page, '.gchip', 'backgroundColor')).toBe('rgb(255, 255, 255)'); expect(await c3(page, '.gchip', 'borderTopLeftRadius')).toBe('8px'); expect(await c3(page, '.gchip', 'boxShadow')).toBe('rgba(0, 0, 0, 0.1) 0px 4px 12px 0px'); expect(await c3(page, '.gchip', 'opacity')).toBe('1');
    expect(await c3(page, '.gchip .gct', 'fontSize')).toBe('13px'); expect(await c3(page, '.gchip .gct', 'fontWeight')).toBe('600'); expect(await c3(page, '.gchip .gct', 'color')).toBe('rgb(28, 31, 29)');
    expect((await page.locator('.gchip .gct').textContent())).toBe(title);
    // 種類の印: 予定＝色の線 3×16、タスク＝四角 14、ノート＝紙 12×14
    const mk = await r3(page, k === 'event' ? '.gchip .gcl' : k === 'task' ? '.gchip .gcb' : '.gchip .gcp');
    expect([Math.round(mk.w), Math.round(mk.h)]).toEqual(k === 'event' ? [3, 16] : k === 'task' ? [14, 14] : [12, 14]);
    // 元の場所は破線の枠（カードの中身は見えない）
    expect(await c3(page, sel, 'outlineStyle')).toBe('dashed'); expect(await c3(page, sel, 'outlineColor')).toBe('rgb(168, 171, 164)'); await expect(page.locator('.ghole')).toHaveCount(0);
    // 画面の左端・右端へ運んでも 8 内
    await page.mouse.move(2, p.y + 30, { steps: 4 }); await page.waitForTimeout(40); expect(near((await r3(page, '.gchip')).x, 8)).toBe(true);
    await page.mouse.move(464, p.y + 30, { steps: 4 }); await page.waitForTimeout(40); expect(near((await r3(page, '.gchip')).r, 466 - 8)).toBe(true);
    await page.mouse.up(); await page.waitForTimeout(350);
  }
});
test('35 §9 M-4 行き先: 14 のマスの上で、マスの地 #E5EEE9・枠 2 #294E42・角丸 4。札に「→ 14日（土）」。マスが変わるたびに触覚 light 1 件。元の日は光らせない', async ({ page }) => {
  await P3.boot(page);
  await carry(page, cardSel('task', 't1'), cell(D14)); await page.waitForTimeout(200); // 入るときは 0.10 秒
  const c14 = cell(D14);
  expect(await c3(page, c14, 'backgroundColor')).toBe('rgb(229, 238, 233)');
  const af = await page.evaluate((s) => { const c = getComputedStyle(document.querySelector(s), '::after'); return { w: c.borderTopWidth, col: c.borderTopColor, rad: c.borderTopLeftRadius, inset: c.top }; }, c14);
  expect(af).toEqual({ w: '2px', col: 'rgb(41, 78, 66)', rad: '4px', inset: '1px' });
  expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 14日（土）'); expect(await c3(page, '.gchip .gcd', 'color')).toBe('rgb(41, 78, 66)');
  const n0 = (await haps(page)).filter((x) => x === 'light').length; expect(n0 >= 1).toBe(true);
  const p13 = await P3.center(page, cell(D13)), p12 = await P3.center(page, cell(D12));
  await page.mouse.move(p13.x, p13.y, { steps: 3 }); await page.waitForTimeout(60);
  expect((await haps(page)).filter((x) => x === 'light').length).toBe(n0 + 1);
  expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 13日（金）');
  await page.mouse.move(p13.x + 4, p13.y + 3, { steps: 2 }); await page.waitForTimeout(60);
  expect((await haps(page)).filter((x) => x === 'light').length).toBe(n0 + 1); // 同じマスの中では増えない
  await page.mouse.move(p12.x, p12.y, { steps: 3 }); await page.waitForTimeout(60);
  await expect(page.locator('.day.mdrop')).toHaveCount(0); await expect(page.locator('.gchip .gcd')).toHaveCount(0); // 元の日は光らせない
  expect(await c3(page, 'html', 'touchAction')).toBeDefined(); expect(await page.evaluate(() => document.documentElement.dataset.grab)).toBe('1'); // つかんでいる間はスクロール・つまみ・横の払いを止める
  expect(await c3(page, `${SEC} .mgrid`, 'touchAction')).toBe('none');
  await page.mouse.up(); await page.waitForTimeout(350);
});
for (const [k, id, title] of KINDS) {
  test(`35 §9 M-5・M-6・M-8・M-11（${title}）着地と元に戻す: 14 で離すと札が 0.15 秒で消え、14 にチップ、元の枠が 0.25 秒で閉じる。選んだ日は 12 のまま。6 秒以内の「元に戻す」で 12 に戻る`, async ({ page }) => {
    await P3.boot(page, { stage: 4 });
    const sel = cardSel(k, id);
    await carry(page, sel, cell(D14));
    await page.mouse.up(); await page.waitForTimeout(40);
    const chipAnim = await anims(page, '.gchip'); expect(chipAnim.some((a) => a.d === 150)).toBe(true); // 吸い込み 0.15 秒
    const next = k === 'event' ? cardSel('event', 'e2') : k === 'task' ? '.mday .mdnl' : '.mday .mdadd';
    expect((await anims(page, next)).some((a) => a.d === 250 && a.e === 'cubic-bezier(0.16, 1, 0.3, 1)')).toBe(true); // 下のカードが 0.25 秒（寄せ）で上がる
    expect(await page.locator(cell(D14)).first().evaluate((e) => e.classList.contains('mland'))).toBe(true); // マスの色を 0.25 秒残して 0.15 秒で消す
    await page.waitForTimeout(260);
    await expect(page.locator('.gchip')).toHaveCount(0);
    await expect(page.locator(sel)).toHaveCount(0);
    await expect(page.locator(`${cell(D14)} .chip[data-${k}${k === 'event' ? '^' : ''}="${id}"]`)).toHaveCount(1);
    expect(await page.locator(`${cell(D12)}`).first().getAttribute('aria-selected')).toBe('true'); // 選んだ日は変えない
    expect((await haps(page)).at(-1)).toBe('light');
    await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
    expect(await page.locator('#status').textContent()).toBe(`${title}を11月14日土曜日へ移しました`);
    await page.waitForTimeout(400); expect(await page.locator(cell(D14)).first().evaluate((e) => e.classList.contains('mland'))).toBe(false);
    if (k === 'event') { const e = (await p3Evs(page)).find((x) => x.id === 'e1'); expect([e.start, e.end]).toEqual([`${D14}T09:00`, `${D14}T10:00`]); } // M-6 時刻を残す
    if (k === 'task') expect((await p3Tasks(page)).find((x) => x.id === 't1').due).toEqual({ date: D14, time: '18:00' });
    if (k === 'note') expect((await p3Notes(page)).find((x) => x.id === 'n1').date).toBe(D14);
    await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
    await expect(page.locator(sel)).toHaveCount(1); await expect(page.locator(`${cell(D14)} .chip`)).toHaveCount(0);
    if (k === 'event') expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`);
    if (k === 'task') expect((await p3Tasks(page)).find((x) => x.id === 't1').due).toEqual({ date: D12, time: '18:00' });
    if (k === 'note') expect((await p3Notes(page)).find((x) => x.id === 'n1').date).toBe(D12);
    await expect(toast(page).locator('span')).toHaveText('元に戻しました。');
  });
  test(`35 §9 M-7・M-11（${title}）やめる: 格子の外・元の日（12）で離すと 0.22 秒で元へ。保存なし・札なし・触覚なし`, async ({ page }) => {
    await P3.boot(page);
    const sel = cardSel(k, id);
    for (const to of [cell(D12), { x: 420, y: 500 }]) {
      await scrollTo(page, sel);
      await carry(page, sel, to);
      const before = (await haps(page)).length;
      await page.mouse.up(); await page.waitForTimeout(30);
      const a = await anims(page, '.gchip'); expect(a.some((x) => x.d === 220 && x.e === 'cubic-bezier(0.33, 1, 0.68, 1)')).toBe(true); // 0.22 秒・out の3乗
      await page.waitForTimeout(300);
      await expect(page.locator('.gchip, .ghole, .grabbed, .lifted')).toHaveCount(0); await expect(toast(page)).toHaveCount(0);
      expect((await haps(page)).length).toBe(before);
      await expect(page.locator(sel)).toHaveCount(1);
    }
    expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`); expect((await p3Tasks(page))[0].due.date).toBe(D12); expect((await p3Notes(page))[0].date).toBe(D12);
  });
}
test('35 §9 M-8 元に戻すは 6 秒: 6 秒を過ぎると札が消える', async ({ page }) => {
  await P3.boot(page);
  await dropOn(page, cardSel('task', 't1'), cell(D14));
  await expect(toast(page)).toHaveCount(1);
  await page.waitForTimeout(5300); await expect(toast(page)).toHaveCount(1);
  await page.waitForTimeout(700); await expect(toast(page)).toHaveCount(0);
  expect((await p3Tasks(page))[0].due.date).toBe(D14);
});
test('35 §9 M-9 月が外にあるとき: 段1で下まで送り、カードをつかんで y64〜104 の帯へ → ページが上へ送られ、スクロール位置 0 で止まる。帯の上端に近い方が速い', async ({ page }) => {
  test.setTimeout(60000);
  await P3.boot(page, { stage: 1 });
  const sec = page.locator(SEC);
  await sec.evaluate((e) => { e.scrollTop = e.scrollHeight; }); await page.waitForTimeout(300);
  const top0 = await scTop(page); expect(top0 > 300).toBe(true);
  const sel = cardSel('task', 't1'), p = await P3.center(page, sel);
  await hold(page, p);
  const speed = async (y) => { await page.mouse.move(p.x, y, { steps: 4 }); await page.waitForTimeout(350); const a = await scTop(page), t0 = Date.now(); await page.waitForTimeout(400); const b = await scTop(page); return (a - b) / ((Date.now() - t0) / 1000); };
  const slow = await speed(100), fast = await speed(68); // 帯の入り口（深さ 4/40）と上端の近く（36/40）
  expect(slow > 80 && slow < 260).toBe(true); expect(fast > 300 && fast < 560).toBe(true); expect(fast > slow * 1.6).toBe(true);
  await page.mouse.move(p.x, 130, { steps: 2 }); await page.waitForTimeout(150); const s1 = await scTop(page); await page.waitForTimeout(250); expect(near(await scTop(page), s1, 2)).toBe(true); // 帯を出ると止まる
  await page.mouse.move(p.x, 70, { steps: 2 });
  await expect.poll(() => scTop(page), { timeout: 8000 }).toBe(0); // スクロール位置 0 で止まる
  const c = await P3.center(page, cell(D14)); await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(80);
  await page.mouse.up(); await page.waitForTimeout(350);
  expect((await p3Tasks(page))[0].due.date).toBe(D14); // 出てきた月のマスへ落とせる
});
test('35 §9 M-10 開閉・回転: つかんだまま閉じる⇄開く・回す → 何も保存されない。新しい画面に札も破線も残らない', async ({ page }) => {
  await P3.boot(page);
  for (const size of [SIZES.closedLandscape, SIZES.openPortrait669, SIZES.openLandscape951]) { // 回す・開く（縦）・開く（横）
    await page.setViewportSize(SIZES.closedPortrait); await page.waitForTimeout(500);
    await carry(page, cardSel('task', 't1'), cell(D14));
    await expect(page.locator('.gchip')).toHaveCount(1);
    await page.setViewportSize(size); await page.waitForTimeout(500);
    await expect(page.locator('.gchip, .ghole, .grabbed, .lifted, .day.mdrop')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.grab)).toBeUndefined();
    await page.mouse.up(); await page.waitForTimeout(300);
    await expect(toast(page)).toHaveCount(0);
    expect((await p3Tasks(page))[0].due.date).toBe(D12);
  }
});
test('35 §9 M-12 読み上げの道: 操作「日付を移す」→14、「1日後へ」。長押しと同じ結果・同じ札。読み上げ「〈題名〉を11月14日土曜日へ移しました」', async ({ page }) => {
  test.setTimeout(90000);
  await P3.boot(page);
  for (const [k, id, title] of KINDS) {
    const acts = page.locator(`.mday .mdacts button[data-kind="${k}"][data-id="${id}"]`);
    expect(await acts.allTextContents()).toEqual(['日付を移す', '1日前へ', '1日後へ']);
    await acts.nth(0).evaluate((b) => b.click()); // 読み上げだけの操作（見た目には出さない）
    const dlg = page.locator('.cmv[role="dialog"]'); await expect(dlg).toBeVisible();
    expect(await dlg.getAttribute('aria-label')).toBe(`${title}の日付`); expect(await dlg.locator('h3').textContent()).toBe(`${title}の日付`);
    await dlg.locator(`.dpgrid [data-day="${D14}"]`).click(); await page.waitForTimeout(350);
    await expect(dlg).toHaveCount(0);
    await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
    expect(await page.locator('#status').textContent()).toBe(`${title}を11月14日土曜日へ移しました`);
    await expect(page.locator(`${cell(D14)} .chip[data-${k}${k === 'event' ? '^' : ''}="${id}"]`)).toHaveCount(1);
    await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
    await page.locator(`.mday .mdacts button[data-kind="${k}"][data-id="${id}"]`).nth(2).evaluate((b) => b.click()); await page.waitForTimeout(350); // 1日後へ
    await expect(toast(page).locator('span')).toHaveText('13日（金）へ移しました');
    await expect(page.locator(`${cell(D13)} .chip[data-${k}${k === 'event' ? '^' : ''}="${id}"]`)).toHaveCount(1);
    await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
    await expect(page.locator(cardSel(k, id))).toHaveCount(1);
  }
  // 見た目のメニューは足さない（操作のボタンは隠してある）。キーボードでは Enter で開く
  expect(await page.locator('.mday .mdacts button').first().evaluate((b) => { const r = b.getBoundingClientRect(); return r.width <= 2 && r.height <= 2; })).toBe(true);
  await page.locator(cardSel('note', 'n1')).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  await expect(page.locator('.nsheet .nsdcap')).toBeVisible();
});
test('35 §9 M-13 視差効果を減らす: 拡大・吸い込み・戻りの移動なし、0.15 秒のフェードだけ（影は付ける）', async ({ page }) => {
  await P3.boot(page, { reduced: true });
  const sel = cardSel('task', 't1');
  const p = await P3.center(page, sel);
  await hold(page, p, 570);
  expect(await c3(page, sel, 'transform')).toBe('none'); expect(await c3(page, sel, 'boxShadow')).toBe('rgba(0, 0, 0, 0.1) 0px 4px 12px 0px');
  await page.mouse.move(p.x + 40, p.y + 40, { steps: 3 }); await page.waitForTimeout(30);
  await page.mouse.up(); await page.waitForTimeout(30); // やめた: 戻りの移動なし
  let a = await page.evaluate(() => document.querySelector('.gchip')?.getAnimations().map((x) => ({ d: x.effect.getTiming().duration, tr: x.effect.getKeyframes().some((kf) => 'transform' in kf || 'scale' in kf) })) || []);
  expect(a.length >= 1 && a.every((x) => x.d === 150 && !x.tr)).toBe(true);
  await page.waitForTimeout(300);
  await carry(page, sel, cell(D14)); await page.mouse.up(); await page.waitForTimeout(30); // 落とした: 吸い込みなし
  a = await page.evaluate(() => document.querySelector('.gchip')?.getAnimations().map((x) => ({ d: x.effect.getTiming().duration, tr: x.effect.getKeyframes().some((kf) => 'transform' in kf || 'scale' in kf) })) || []);
  expect(a.every((x) => x.d === 150 && !x.tr)).toBe(true);
  await page.waitForTimeout(350);
  expect((await p3Tasks(page))[0].due.date).toBe(D14);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
});

// ---- M-30〜M-38・N-20〜N-22 ----
const WEEKLY = P3.ev('rp', '定例', `${D12}T15:00`, `${D12}T15:30`, { recurrence: { freq: 'weekly', interval: 1, byDay: [4] } });
test('35 §9 M-30 繰り返しの回: 毎週の予定の 12 日の回を 13 へ。札に「この回だけ」（高さ 20・角丸 8・#EFECE4）。落とした札「13日（金）へ移しました（この回だけ）」。13 日だけ動き、他の週の回は動かない。系列か回かを聞く画面は出ない', async ({ page }) => {
  await P3.boot(page, { events: [WEEKLY], stage: 1 });
  await page.locator(SEC).evaluate((e) => { e.scrollTop = 0; });
  const src = `${cell(D12)} .chip[data-event^="rp"]`; // 月のマスのチップから（札はすぐ出る）
  await carry(page, src, cell(D13));
  expect(await page.locator('#status').textContent()).toBe('定例をつかみました。この回だけ移します。月の日へ落とします。');
  const bd = await r3(page, '.gchip .gcr');
  expect(await page.locator('.gchip .gcr').textContent()).toBe('この回だけ'); expect(near(bd.h, 20)).toBe(true);
  expect(await c3(page, '.gchip .gcr', 'backgroundColor')).toBe('rgb(239, 236, 228)'); expect(await c3(page, '.gchip .gcr', 'borderTopLeftRadius')).toBe('8px'); expect(await c3(page, '.gchip .gcr', 'fontSize')).toBe('11px'); expect(await c3(page, '.gchip .gcr', 'fontWeight')).toBe('600'); expect(await c3(page, '.gchip .gcr', 'color')).toBe('rgb(104, 113, 106)');
  expect(await page.locator('.gchip .gct').textContent()).toBe('↻ 定例'); expect(await c3(page, '.gchip .gct', 'maxWidth')).toBe('140px');
  expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 13日（金）');
  const g = await r3(page, '.gchip'); expect(g.x >= 8 && g.r <= 466 - 8).toBe(true);
  await page.mouse.up(); await page.waitForTimeout(400);
  { // 1 行に収める。入らないときだけ「（この回だけ）」を残して曜日を省く（35 §6.9。字の幅はエンジンの書体で違う）
    const t = await toast(page).locator('span').evaluate((sp) => { const txt = sp.textContent, one = sp.scrollWidth <= sp.clientWidth + 0.5 && sp.getClientRects().length === 1; sp.textContent = '13日（金）へ移しました（この回だけ）'; const fits = sp.scrollWidth <= sp.clientWidth + 0.5; sp.textContent = txt; return { txt, one, fits }; });
    expect(t.one).toBe(true); expect(t.txt).toBe(t.fits ? '13日（金）へ移しました（この回だけ）' : '13日へ移しました（この回だけ）');
    if (test.info().project.name === 'chromium') expect(t.txt).toBe('13日（金）へ移しました（この回だけ）');
  }
  expect(await page.locator('#status').textContent()).toBe('定例のこの回だけを11月13日金曜日へ移しました');
  await expect(page.locator('#scope[open], dialog.scope[open], #scopedlg[open]')).toHaveCount(0); // 聞く画面は出ない
  await expect(page.locator(`${cell(D13)} .chip[data-event^="rp"]`)).toHaveCount(1); await expect(page.locator(`${cell(D12)} .chip[data-event^="rp"]`)).toHaveCount(0);
  await expect(page.locator(`${cell('2026-11-19')} .chip[data-event^="rp"]`)).toHaveCount(1); await expect(page.locator(`${cell('2026-11-26')} .chip[data-event^="rp"]`)).toHaveCount(1); // 他の週は動かない
  const e = (await p3Evs(page)).find((x) => x.id === 'rp');
  expect(e.start).toBe(`${D12}T15:00`); expect(Object.values(e.overrides || {}).map((o) => o.start)).toEqual([`${D13}T15:00`]); // 系列はそのまま。その回だけの上書き
  await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
  await expect(page.locator(`${cell(D12)} .chip[data-event^="rp"]`)).toHaveCount(1);
});
const OLD = mkNote('memo-2026-11-12', '2026年11月12日（木）\n旧メモの本文\n  IME のごみ　ｎ', D12, { sourceDate: D12, sourceHeading: true, folderId: 'folder-daily-memos', createdAt: 3 });
test('35 §9 M-31 旧メモ: id memo-2026-11-12 のノートを 14 へ → 動く。id と sourceDate は元のまま、date だけ 2026-11-14、本文は 1 文字も変わらない。保存を失敗させると「移せませんでした。」3 秒・0.22 秒で元へ・date は元のまま', async ({ page }) => {
  await P3.boot(page, { notes: [OLD] });
  const sel = cardSel('note', OLD.id), before = (await p3Notes(page)).find((n) => n.id === OLD.id);
  await page.evaluate(() => { window.__duoMoveFail = 'save'; });
  await carry(page, sel, cell(D14)); // つかむ前に拒否する札は出ない（持ち上がる）
  await expect(page.locator('.gchip.on')).toHaveCount(1); await expect(toast(page)).toHaveCount(0);
  await page.mouse.up(); await page.waitForTimeout(120);
  await expect(toast(page).locator('span')).toHaveText('移せませんでした。'); await expect(toast(page).locator('button')).toHaveCount(0);
  expect((await haps(page)).at(-1)).toBe('warning');
  await expect(page.locator(sel)).toHaveCount(1); // カードは元の場所へ
  expect((await anims(page, sel)).some((a) => a.d === 220 && a.e === 'cubic-bezier(0.33, 1, 0.68, 1)')).toBe(true);
  expect((await p3Notes(page)).find((n) => n.id === OLD.id)).toEqual(before);
  await expect(page.locator(`${cell(D14)} .chip`)).toHaveCount(0);
  await page.waitForTimeout(2500); await expect(toast(page)).toHaveCount(1); await page.waitForTimeout(700); await expect(toast(page)).toHaveCount(0); // 3 秒
  await page.evaluate(() => { window.__duoMoveFail = null; });
  await dropOn(page, sel, cell(D14));
  const after = (await p3Notes(page)).find((n) => n.id === OLD.id);
  expect(after).toEqual({ ...before, date: D14 }); // id・sourceDate・sourceHeading・本文・updatedAt はそのまま
  expect(after.sourceDate).toBe(D12); expect(after.body).toBe(OLD.body); expect(after.updatedAt).toBe(OLD.updatedAt);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
});
test('35 §9 M-32 移せなかった: 計画が作れない予定（試験用に null を返す）→「移せませんでした。」3 秒、触覚 warning、カードは元の場所', async ({ page }) => {
  await P3.boot(page);
  await page.evaluate(() => { window.__duoMoveFail = 'plan'; });
  await dropOn(page, cardSel('event', 'e1'), cell(D14), { settle: 120 });
  await expect(toast(page).locator('span')).toHaveText('移せませんでした。');
  expect((await haps(page)).at(-1)).toBe('warning');
  await expect(page.locator(cardSel('event', 'e1'))).toHaveCount(1); expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`);
  // 保存が断られたとき（予定・タスク）も同じ札で、表示は元へ戻る
  await page.evaluate(() => { window.__duoMoveFail = 'save'; });
  for (const [k, id] of [['event', 'e1'], ['task', 't1']]) {
    await page.evaluate(() => { window.__duoMoveLog = []; });
    await dropOn(page, cardSel(k, id), cell(D14), { settle: 60 });
    expect((await mvlog(page)).filter((x) => x.ev === 'return').map((x) => x.ms)).toEqual([220]); // カードは 0.22 秒で元へ
    await expect(toast(page).locator('span')).toHaveText('移せませんでした。');
    await expect(page.locator(cardSel(k, id))).toHaveCount(1); await expect(page.locator(`${cell(D14)} .chip`)).toHaveCount(0);
    await page.waitForTimeout(300);
  }
  expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`); expect((await p3Tasks(page))[0].due.date).toBe(D12);
});
test('35 §9 M-33 閉じた横: 持ち上げ・札・着地・やめる・元に戻すが同じ秒数・同じ札。落とせるのは左の格子のマス。札は画面の端 8 内', async ({ page }) => {
  await P3.boot(page, { size: SIZES.closedLandscape });
  for (const [k, id, title] of KINDS) {
    const sel = cardSel(k, id); await scrollTo(page, sel);
    const p = await P3.center(page, sel);
    await hold(page, p, 570);
    await expect.poll(() => c3(page, sel, 'transform'), { timeout: 2000 }).toBe(LIFT); await expect(page.locator('.ghole')).toHaveCount(1);
    const c1 = await P3.center(page, cell('2026-11-01')); // 左端のマス
    await page.mouse.move(c1.x, c1.y, { steps: 6 }); await page.waitForTimeout(220);
    const g = await r3(page, '.gchip'); expect(near(g.h, 32) && g.x >= 8 - 0.5 && near(g.b, c1.y - 24)).toBe(true);
    expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 1日（日）');
    await page.mouse.move(c1.x + 300, c1.y + 500, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(40); // 格子の外: やめる
    expect((await anims(page, '.gchip')).some((a) => a.d === 220)).toBe(true); await page.waitForTimeout(300);
    await scrollTo(page, sel);
    await dropOn(page, sel, cell(D14));
    await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
    expect(await page.locator('#status').textContent()).toBe(`${title}を11月14日土曜日へ移しました`);
    await expect(page.locator(sel)).toHaveCount(0);
    await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
    await expect(page.locator(sel)).toHaveCount(1);
  }
  expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`); expect((await p3Tasks(page))[0].due).toEqual({ date: D12, time: '18:00' }); expect((await p3Notes(page))[0].date).toBe(D12);
});
test('35 §9 M-34 マスのチップから: 閉じた画面で、マスのタスク □・ノートの紙のチップを長押しすると 0.35 秒で札になり、落とすと移る。+N で隠れた物はつかめない', async ({ page }) => {
  await P3.boot(page, { stage: 1, events: [] });
  for (const [k, id, title] of [['task', 't1', '見積もりを送る'], ['note', 'n1', '買い物']]) {
    const src = `${cell(D12)} .chip[data-${k}="${id}"]`, p = await P3.center(page, src);
    await hold(page, p, 300); await expect(page.locator('.gchip')).toHaveCount(0);
    await page.waitForTimeout(130);
    await expect(page.locator('.gchip.on')).toHaveCount(1); await expect(page.locator('.ghole, .lifted')).toHaveCount(0); // 持ち上げず、すぐ札
    expect(await page.locator('.gchip .gct').textContent()).toBe(title);
    expect(await c3(page, src, 'outlineStyle')).toBe('dashed'); { const m = (await c3(page, src, 'outlineColor')).match(/\d+/g).map(Number); expect(near(m[0], 168, 6) && near(m[1], 171, 6) && near(m[2], 164, 6)).toBe(true); } // WebKit は計算値が少し丸まる
    const c = await P3.center(page, cell(D14)); await page.mouse.move(c.x, c.y, { steps: 6 }); await page.waitForTimeout(60);
    await page.mouse.up(); await page.waitForTimeout(350);
    await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
    await expect(page.locator(`${cell(D14)} .chip[data-${k}="${id}"]`)).toHaveCount(1);
  }
  expect((await p3Tasks(page))[0].due.date).toBe(D14); expect((await p3Notes(page))[0].date).toBe(D14);
});
test('35 §9 M-34 +N で隠れた物はつかめない（段 3＝1マス 2 件。マスに出ていない物は日の欄のカードから）', async ({ page }) => {
  await P3.boot(page, { stage: 3, sel: D14, events: [P3.ev('a1', '朝会', `${D14}T08:00`, `${D14}T08:30`), P3.ev('a2', '昼会', `${D14}T12:00`, `${D14}T12:30`)], tasks: [mkTask('t1', '見積もりを送る', { date: D14 })], notes: [] });
  await page.waitForTimeout(200);
  const shown = await page.locator(`${cell(D14)} .chip`).evaluateAll((l) => l.filter((e) => Number(getComputedStyle(e).opacity) > 0.5).map((e) => e.textContent));
  expect(shown.some((t) => t.includes('見積もり'))).toBe(false);
  expect(await page.locator(`.plus.dyn[data-plus="${D14}"]`).textContent()).toBe('+1');
  const c = await P3.rect(page, cell(D14));
  const hid = await page.locator(`${cell(D14)} .chip[data-task="t1"]`).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, op: getComputedStyle(e).opacity }; });
  expect(hid.op).toBe('0'); expect(hid.y > c.b).toBe(true); // 3 段目は行の外（見えない）
  await hold(page, hid, 570); await expect(page.locator('.gchip')).toHaveCount(0); await page.mouse.up(); // 隠れたチップのある所を長押ししても、つかまない
  await expect(page.locator(cardSel('task', 't1'))).toHaveCount(1); // 日の欄のカードにはある
});
test('35 §9 M-35 ノートの衝突なし: ノートのある 14 日へ別のノートを落とす → 確認は出ない。14 日のノートの区画が 2 枚になる', async ({ page }) => {
  await P3.boot(page, { notes: [...P3.NOTES, mkNote('n14', '14日のノート', D14, { createdAt: 9 })] });
  await dropOn(page, cardSel('note', 'n1'), cell(D14));
  await expect(page.locator('.ndconf, [role="alertdialog"]')).toHaveCount(0);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  await page.locator(cell(D14)).first().click(); await page.waitForTimeout(350);
  expect(await page.locator('.mday .mdnotes2 .mdcard strong').allTextContents()).toEqual(['買い物', '14日のノート']);
  expect((await p3Notes(page)).filter((n) => n.date === D14).map((n) => n.id).sort()).toEqual(['n1', 'n14']);
});

// M-36: タスクの通知（アプリの予約が、移した先の日の同じ時刻に 1 件だけ。日付だけのタスクは先の日の 8:00）
async function natNotify(page) {
  await notifyOn(page);
  await page.addInitScript(() => {
    const M = window.__m = { calls: [], pending: [] };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'c', nativePromise: async (pl, m, o) => {
      M.calls.push([m, JSON.parse(JSON.stringify(o ?? {}))]);
      if (m === 'checkPermission') return { status: 'denied' };
      if (m === 'notifyStatus' || m === 'requestNotifyPermission') return { status: 'granted' };
      if (m === 'notifySync') { M.pending = o.items; return { scheduled: o.items.length, removed: 0, skipped: 0 }; }
      if (m === 'notifyClear') { M.pending = []; return { removed: 0 }; }
      throw { code: 'UNAVAILABLE' };
    } };
  });
}
const taskPending = (page) => page.evaluate(() => window.__m.pending.filter((i) => i.id.startsWith('duo.task.')).map((i) => [i.id, i.fireDate]).sort());
test('35 §9 M-36 タスクの通知: 通知オン・期限 12 日 18:00 のタスクを 14 へ／日付だけのタスクを 14 へ → 14 日 18:00／14 日 8:00 にアプリの通知が 1 回だけ。12 日には鳴らない。リマインダーは呼ばない', async ({ page }) => {
  await natNotify(page);
  await P3.boot(page, { tasks: [mkTask('ta', '時刻つき', { date: D13, time: '18:00' }, { notify: true }), mkTask('tb', '日付だけ', { date: D13 }, { notify: true, createdAt: 2 })], sel: D13, events: [], notes: [] });
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.ta', `${D13}T18:00`], ['duo.task.tb', `${D13}T08:00`]]);
  await dropOn(page, cardSel('task', 'ta'), cell(D14));
  await dropOn(page, cardSel('task', 'tb'), cell(D14));
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.ta', `${D14}T18:00`], ['duo.task.tb', `${D14}T08:00`]]); // 先の日の同じ時刻に 1 件ずつ（前の日の予約は残らない）
  const ts = await p3Tasks(page);
  expect(ts.map((t) => [t.id, t.due, t.notify])).toEqual([['ta', { date: D14, time: '18:00' }, true], ['tb', { date: D14 }, true]]);
  expect(await page.evaluate(() => window.__m.calls.map((c) => c[0]).filter((m) => /Reminder/i.test(m)))).toEqual([]);
  // 元に戻すと、予約も元の日へ
  await toast(page).getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.ta', `${D14}T18:00`], ['duo.task.tb', `${D13}T08:00`]]);
});

// M-37・M-38: 開いた画面（見た目は変えず、長押しを足すだけ）
async function bootOpen(page, size, o = {}) {
  await P3.boot(page, { size, sar: 0, ui: { view: 'month', focusMode: 'calendar', pages: { left: 'month', right: size.width > size.height ? 'memo' : 'time', portraitBottom: 'time', portraitShown: false }, spreadType: 'pages', monthTasks: true }, ...o });
}
test('35 §9 M-37 開いた縦のメモ・タスク（R7）: 日の欄のタスクの行・ノートの題名の行を長押し→月の 14 へ（行が 1.03 倍・破線・札）。ノートの本文の長押しはつかまない', async ({ page }) => {
  await bootOpen(page, SIZES.openPortrait669, { notes: [mkNote('n1', '買い物\n牛乳・卵\n3行目', D12)] });
  const row = '.mpull .mday .mdtask', title = '.mpull .mday .mdnotes .dnote .nl:first-child', body2 = '.mpull .mday .mdnotes .dnote .nl:nth-child(2)';
  await expect(page.locator('.mday .mdcard')).toHaveCount(0); // 開いた画面にカードは出ない（見た目は今のまま）
  await scrollTo(page, row);
  await hold(page, await P3.center(page, row), 570);
  await expect.poll(() => c3(page, row, 'transform'), { timeout: 2000 }).toBe(LIFT); expect(await c3(page, row, 'boxShadow')).toBe('rgba(0, 0, 0, 0.1) 0px 4px 12px 0px');
  expect(await c3(page, '.ghole', 'borderTopStyle')).toBe('dashed'); expect(await c3(page, '.ghole', 'borderTopColor')).toBe('rgb(168, 171, 164)');
  expect(await page.locator('#status').textContent()).toBe('見積もりを送るをつかみました。月の日へ落とします。');
  const c = await P3.center(page, cell(D14)); await page.mouse.move(c.x, c.y, { steps: 8 }); await page.waitForTimeout(200);
  const g = await r3(page, '.gchip'); expect(near(g.h, 32) && near(g.b, c.y - 24) && near(g.cx, c.x)).toBe(true);
  expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 14日（土）'); await expect(page.locator('.gchip .gcb')).toHaveCount(1);
  await page.mouse.up(); await page.waitForTimeout(350);
  expect((await p3Tasks(page))[0].due).toEqual({ date: D14, time: '18:00' });
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
  expect((await p3Tasks(page))[0].due.date).toBe(D12);
  // ノートの本文（2行目）の長押し: つかまない
  await scrollTo(page, body2);
  await hold(page, await P3.center(page, body2), 570);
  await expect(page.locator('.gchip, .ghole, .lifted')).toHaveCount(0);
  await page.mouse.move(5, 5); await page.mouse.up(); await page.waitForTimeout(300);
  if (await page.locator('.nsheet:not([hidden])').count()) { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(700); }
  // ノートの題名の行（1行目）: つかめる
  await scrollTo(page, title);
  await carry(page, title, cell(D14), { ms: 570 });
  await expect(page.locator('.gchip .gcp')).toHaveCount(1); expect(await page.locator('.gchip .gct').textContent()).toBe('買い物');
  await page.mouse.up(); await page.waitForTimeout(400);
  expect((await p3Notes(page))[0].date).toBe(D14);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  await expect(page.locator(`${cell(D12)} .mline`)).toHaveCount(0); await expect(page.locator(`${cell(D14)} .mline`).first()).toBeVisible(); // 開いた月の印は今のまま（緑の線）
  // 開いた月の件数（.tkn）と緑の線からはつかめない
  for (const sel of [`${cell(D14)} .mline`, `${cell(D12)} .tkn`]) {
    if (!(await page.locator(sel).count())) continue;
    await hold(page, await P3.center(page, sel), 570); await expect(page.locator('.gchip.on')).toHaveCount(0); await page.mouse.up(); await page.waitForTimeout(200);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
  expect((await p3Notes(page))[0].date).toBe(D14); expect((await p3Tasks(page))[0].due.date).toBe(D12);
});
test('35 §9 M-37 開いた横のノート（R7）: ノートのページの題名の行を長押し→左の月の 14 へ。タスクのページ・ノートの一覧の行はつかめない', async ({ page }) => {
  await bootOpen(page, SIZES.openLandscape951, { notes: [mkNote('n1', '買い物\n牛乳・卵', D12)] });
  // ノートの一覧の行: つかめない
  const rowSel = '.page.rp [data-nrow], .page.rp .nrw';
  await expect(page.locator(rowSel).first()).toBeVisible();
  await hold(page, await P3.center(page, '.page.rp .mrow'), 400); const n0 = await page.evaluate(() => document.querySelectorAll('.gchip, .lifted, .ghole').length); // 0.35 秒を過ぎても持ち上がらない
  await page.mouse.up(); expect(n0).toBe(0); await page.waitForTimeout(500);
  if (await page.locator('[data-nmenu] [data-nf="menuclose"]').count()) { await page.locator('[data-nmenu] [data-nf="menuclose"]').click(); await page.locator('.page.rp .mrow').click(); await page.waitForTimeout(400); } // そのまま離す＝たたいた扱いでノートが開く（行の長押しメニューは 0.5 秒から。今のまま）
  await expect(page.locator('.page.rp .ned-title')).toBeVisible(); await page.waitForTimeout(400);
  expect(await page.locator('.page.rp .ned-title').inputValue()).toBe('買い物');
  // 本文の長押しはつかまない（文字の選択のまま）
  await hold(page, await P3.center(page, '.page.rp .ned-body'), 570); await expect(page.locator('.gchip, .lifted')).toHaveCount(0); await page.mouse.up();
  await page.evaluate(() => document.activeElement?.blur?.()); await page.waitForTimeout(200);
  const title = '.page.rp .ned-title';
  await hold(page, await P3.center(page, title), 570);
  await expect.poll(() => c3(page, title, 'transform'), { timeout: 2000 }).toBe(LIFT); await expect(page.locator('.ghole')).toHaveCount(1);
  const c = await P3.center(page, cell(D14)); await page.mouse.move(c.x, c.y, { steps: 10 }); await page.waitForTimeout(200);
  await expect(page.locator('.gchip.on .gcp')).toHaveCount(1); expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 14日（土）');
  expect(await page.locator(cell(D14)).first().evaluate((e) => e.classList.contains('mdrop'))).toBe(true);
  await page.mouse.up(); await page.waitForTimeout(400);
  expect((await p3Notes(page))[0].date).toBe(D14); expect((await p3Notes(page))[0].body).toBe('買い物\n牛乳・卵');
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  // タスクのページの行: つかめない（月が見えていても）
  await page.locator('.pgr [data-pick="task"]').first().click(); await page.waitForTimeout(400);
  await hold(page, await P3.center(page, '.page.rp .rmrow, .page.rp .rmbody'), 570); await expect(page.locator('.gchip, .lifted')).toHaveCount(0);
  await page.mouse.move(3, 3); await page.mouse.up();
});
test('35 §9 M-38 開いた画面の予定の札（R1）: 開いた縦・横で予定を長押しで運ぶ → 札は白地・印つき、行き先の枠は角丸 4、やめたら 0.22 秒。配置と落とし先は今のまま', async ({ page }) => {
  for (const size of [SIZES.openPortrait669, SIZES.openLandscape951]) {
    await P3.boot(page, { size, sar: 0, ui: { view: 'month', focusMode: 'calendar', pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false }, spreadType: 'pages' } });
    const src = page.locator('.mdev, .tlev:not(.fev), .agrow', { hasText: '会議' }).filter({ visible: true }).first();
    await src.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const b = await src.boundingBox(), p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await hold(page, p, 570);
    await expect.poll(() => src.evaluate((e) => getComputedStyle(e).transform), { timeout: 2000 }).toBe(LIFT); await expect(page.locator('.ghole')).toHaveCount(1);
    const c = await P3.center(page, cell('2026-11-20')); await page.mouse.move(c.x, c.y, { steps: 10 }); await page.waitForTimeout(200);
    const g = await r3(page, '.gchip');
    expect(near(g.h, 32) && near(g.b, c.y - 24)).toBe(true);
    expect(await c3(page, '.gchip', 'backgroundColor')).toBe('rgb(255, 255, 255)'); expect(await c3(page, '.gchip', 'borderTopLeftRadius')).toBe('8px'); await expect(page.locator('.gchip .gcl')).toHaveCount(1);
    expect(await page.locator('.gchip .gcd').textContent()).toBe('→ 20日（金）');
    const af = await page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length), cs = getComputedStyle(el, '::after'); return { w: cs.borderTopWidth, col: cs.borderTopColor, rad: cs.borderTopLeftRadius, bg: getComputedStyle(el).backgroundColor }; }, cell('2026-11-20'));
    expect(af).toEqual({ w: '2px', col: 'rgb(41, 78, 66)', rad: '4px', bg: 'rgb(229, 238, 233)' });
    await page.mouse.move(c.x, 5, { steps: 3 }); // 月の外でやめる
    if (await page.locator('.day.mdrop').count()) await page.mouse.move(3, 3, { steps: 2 });
    await page.mouse.up(); await page.waitForTimeout(30);
    expect((await anims(page, '.gchip')).some((a) => a.d === 220 && a.e === 'cubic-bezier(0.33, 1, 0.68, 1)')).toBe(true);
    await page.waitForTimeout(300);
    expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`);
    // 落とし先は今のまま（月のマス）
    const b2 = await src.boundingBox();
    await hold(page, { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 }); await page.mouse.move(c.x, c.y, { steps: 10 }); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(400);
    expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe('2026-11-20T09:00');
    await expect(toast(page).locator('span')).toHaveText('20日（金）へ移しました');
    await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350);
    expect((await p3Evs(page)).find((x) => x.id === 'e1').start).toBe(`${D12}T09:00`);
  }
});

// N-20〜N-22: ノートのチェック行からできたタスクと、移動
const SRC = (text, pos) => ({ type: 'note-check', noteId: 'n1', text, nth: 0, pos });
const LIST = { notes: [mkNote('n1', '買い物\n- [ ] 牛乳\n- [ ] 卵', D12)], tasks: [mkTask('k1', '牛乳', { date: D12 }, { source: SRC('牛乳', 0) }), mkTask('k2', '卵', { date: D12 }, { source: SRC('卵', 1), createdAt: 2 })], events: [] };
const dues = async (page) => Object.fromEntries((await p3Tasks(page)).map((t) => [t.id, t.due.date]));
test('35 §9 N-20 ノートを動かす（決定 7）: チェック 2 行のノート（12 日）を 16 へ。うち 1 件は期限を 20 日に変えてある → 期限 12 日のままのタスクだけ 16 日へ。札「ノートとタスク 1 件を移しました」。元に戻すで両方 12 日へ', async ({ page }) => {
  await P3.boot(page, { ...LIST, tasks: [LIST.tasks[0], { ...LIST.tasks[1], due: { date: '2026-11-20' } }], stage: 4 });
  expect(await page.locator(`${cardSel('task', 'k1')} small`).textContent()).toBe('ノート「買い物」から');
  await dropOn(page, cardSel('note', 'n1'), cell(D16));
  await expect(toast(page).locator('span')).toHaveText('ノートとタスク 1 件を移しました'); await expect(toast(page).getByRole('button', { name: '元に戻す' })).toBeVisible();
  expect(await page.locator('#status').textContent()).toBe('買い物と、つながったタスク1件を11月16日月曜日へ移しました');
  expect(await dues(page)).toEqual({ k1: D16, k2: '2026-11-20' }); expect((await p3Notes(page))[0].date).toBe(D16);
  await expect(page.locator(`${cell(D16)} .chip[data-note="n1"]`)).toHaveCount(1); await expect(page.locator(`${cell(D16)} .chip[data-task="k1"]`)).toHaveCount(1); // 行き先にノートとタスクのチップ
  await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(400);
  expect(await dues(page)).toEqual({ k1: D12, k2: '2026-11-20' }); expect((await p3Notes(page))[0].date).toBe(D12);
  expect((await p3Tasks(page)).every((t) => t.source?.noteId === 'n1')).toBe(true); // つながりは残る
});
test('35 §9 N-21・N-22 タスクだけ動かす → そのあとノートを動かす: 札は 1 行「14日（土）へ移しました｜元に戻す」。ノートの日付と行は 12 日のまま、副題は残り、チェックは両方向でそろう。ノートを 16 へ動かすと、期限 12 日のままの「卵」だけ付いていく', async ({ page }) => {
  test.setTimeout(60000);
  await P3.boot(page, { ...LIST, stage: 4 });
  await dropOn(page, cardSel('task', 'k1'), cell(D14));
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました'); expect(await toast(page).locator('span').count()).toBe(1); // 2 行の知らせは出ない
  expect(await dues(page)).toEqual({ k1: D14, k2: D12 });
  let n = (await p3Notes(page))[0]; expect([n.date, n.body]).toEqual([D12, '買い物\n- [ ] 牛乳\n- [ ] 卵']);
  expect((await p3Tasks(page)).find((t) => t.id === 'k1').source).toEqual(SRC('牛乳', 0)); // つながりは残る
  await page.waitForTimeout(6200); // 札が消えるのを待つ
  // カードの四角をたたく → ノートの行が「- [x] 」（14 日の日の欄で）
  await page.locator(cell(D14)).first().click(); await page.waitForTimeout(350);
  expect(await page.locator(`${cardSel('task', 'k1')} small`).textContent()).toBe('ノート「買い物」から'); // 副題はそのまま
  await page.locator(`${cardSel('task', 'k1')} .mdck`).click();
  await expect.poll(async () => (await p3Notes(page))[0].body.split('\n').sort().join('|'), { timeout: 6000 }).toBe('- [ ] 卵|- [x] 牛乳|買い物'); // チェックした行は、今までの決まりどおり未チェックの下へ移る
  // ノートの行のチェックを外す → カードの四角も戻る
  await page.locator(cell(D12)).first().click(); await page.waitForTimeout(350);
  await page.locator(cardSel('note', 'n1')).click(); await page.waitForTimeout(700);
  await page.locator('.nsheet .ned-chk[aria-checked="true"], .nsheet .ned-chk.on').first().click();
  await expect.poll(async () => (await p3Tasks(page)).find((t) => t.id === 'k1').done, { timeout: 6000 }).toBe(false);
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800);
  expect((await p3Notes(page))[0].body.split('\n').sort().join('|')).toBe('- [ ] 卵|- [ ] 牛乳|買い物');
  // N-22: ノート（12 日）を 16 へ
  await page.waitForTimeout(6000); await expect(toast(page)).toHaveCount(0);
  await dropOn(page, cardSel('note', 'n1'), cell(D16));
  await expect(toast(page).locator('span')).toHaveText('ノートとタスク 1 件を移しました');
  expect(await dues(page)).toEqual({ k1: D14, k2: D16 }); // 「牛乳」は 14 日のまま、「卵」だけ 16 日へ
  expect((await p3Tasks(page)).map((t) => t.source?.noteId)).toEqual(['n1', 'n1']);
  await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(400);
  expect(await dues(page)).toEqual({ k1: D14, k2: D12 }); expect((await p3Notes(page))[0].date).toBe(D12); // ノートと「卵」だけ戻る。単独で動かした「牛乳」は対象外
});
