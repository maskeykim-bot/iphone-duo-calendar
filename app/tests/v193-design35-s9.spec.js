// design/35-cards.md §9「品質がそのまま試験にできる確かめ方」を、行の ID のまま試験にしたもの（実装担当）。Chromium と WebKit の両方で回す。
// その2 で入れた行: S-1〜S-9（閉じた画面の「カード｜時間」と時間のバー）・L-1（閉じた横の切り替え）・O-1／O-2（開いた画面に「カード｜時間」とバーが無い）・
//   K-14（タスクの四角）・R-20（リマインダー停止の知らせ）・N-1／N-2（ノートのチェック行→タスク・両方向）。
// その3 で足す行: K-1〜K-12・V-1〜V-3・D-1〜D-3・M-1〜M-13・M-30〜M-38・N-20〜N-22（カードと別の日への移動）。
// 数字は getBoundingClientRect と getComputedStyle で、差 1 まで（35 §9）。閉じた縦 466×678・右の帯 84。
import { test, expect } from '@playwright/test';
import { SIZES } from './helpers.js';
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
