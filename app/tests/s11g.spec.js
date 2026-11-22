// 第19.2版 S11g: 61b9ce7 のレビューの直し（実装担当）。
// 値の根拠: design/34 §17（17-1 K-1・17-2 K-2・17-5）、design/review/review-v19-2-61b9ce7-closed-final.md、research/review-v19-2-61b9ce7-closed-2026-11-22.md、data/連携_レビュー_61b9ce7.md 低1。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { openApp, seed, ev, SIZES, clickSettings } from './helpers.js';

const DAY = '2026-11-12', FILL = 'rgb(239, 236, 228)', LINE = 'rgb(228, 224, 214) 0px 0.5px 0px 0px inset';
const SEED = [...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`)), ev('ad', '終日の予定', DAY, DAY, { all: true })];
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
async function boot(page, { sar = 84, land = false } = {}) {
  await page.addInitScript((sar) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar}px`)), sar);
  await page.clock.setFixedTime(new Date(`${DAY}T09:41:00+09:00`));
  await openApp(page, SIZES.closedPortrait);
  await seed(page, SEED);
  if (land) { await page.setViewportSize({ width: 678, height: 466 }); await page.waitForTimeout(600); }
}
async function toStage(page, n) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown');
  await page.waitForTimeout(400); await page.evaluate(() => document.activeElement?.blur());
}
// つまみ（下）・埋めた面（::before）の矩形、上の線、(x,y) に見える要素
const measure = (page, pts) => page.evaluate((pts) => {
  const g = document.querySelector('.mpull.browse .mday .mdgrab'), b = g.getBoundingClientRect(), i = g.querySelector('i').getBoundingClientRect(), cs = getComputedStyle(g, '::before');
  const f = cs.content === 'none' ? null : { x0: b.left + parseFloat(cs.left), y0: b.top + parseFloat(cs.top), x1: b.left + parseFloat(cs.left) + parseFloat(cs.width), y1: b.top + parseFloat(cs.top) + parseFloat(cs.height), bg: cs.backgroundColor, sh: cs.boxShadow };
  return { grab: [b.left, b.top, b.right, b.bottom], line: [i.top, i.bottom], stuck: g.classList.contains('stuck'), sh: getComputedStyle(g).boxShadow, fill: f, hits: pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e === g ? 'grip' : e?.closest('.mdcard, .tlev, .tl, .mdnote, .mdnl') ? 'content' : (e?.className || e?.tagName); }) };
}, pts);
const paneState = (page) => page.evaluate(() => ({ dg: document.querySelector('.mday').dataset.dg, dialog: !!document.querySelector('dialog[open]'), sheet: !document.querySelector('.nsheet').hidden, top: document.querySelector('.mday').scrollTop, stage: document.querySelector('.mpull').dataset.stage }));

// §17-1 の表（つまみの押せる所・埋める所）と §17-2（帯なしの面の上端）
// S11h で直した所: 帯なしのつまみの箱は 44（y593〜/y381〜）→ 56（y581〜/y369〜、線の上の余白 30）。根拠＝design/34 §18-2「帯なしのつまみの箱をいつも 56。押せる所も 56 にしてよい。§17-2 の『上に足した 12 は何もしない』はやめる」。面・線・埋める所の値は変えていない
const SHAPES = [
  { name: '縦・帯あり', sar: 84, land: false, grab: [8, 593, 374, 637], fill: [8, 637, 374, 678], pts: [[20, 640], [191, 640], [360, 670], [191, 670]] },
  { name: '縦・帯なし', sar: 0, land: false, top: 30, grab: [8, 581, 402, 637], fill: [8, 581, 458, 678], pts: [[20, 640], [233, 640], [430, 640], [430, 670], [100, 586]] },
  { name: '横・帯あり', sar: 84, land: true, grab: [382, 381, 594, 425], fill: [382, 425, 594, 466], pts: [[400, 430], [488, 430], [580, 460], [488, 460]] },
  { name: '横・帯なし', sar: 0, land: true, top: 30, grab: [382, 369, 614, 425], fill: [382, 369, 678, 466], pts: [[400, 430], [488, 430], [640, 430], [640, 460], [450, 374]] },
];
test.describe('S11g §17-1（K-1）・§17-2（K-2） 貼り付いたつまみ（下）の下を日の欄の地で埋める', () => {
  for (const s of SHAPES) {
    test(`${s.name}: 貼り付いている間、つまみの下端から日の欄の下端まで #EFECE4。カード・時間軸は見えず、たたいても引いても何もしない。送り切ると埋めない`, async ({ page }) => {
      await boot(page, s);
      for (const n of s.land ? [0] : [2, 4, 7]) {
        if (n) await toStage(page, n);
        for (const mode of ['A', 'B']) {
          if (mode === 'B') { await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(500); await page.evaluate(() => document.activeElement?.blur()); await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B'); }
          const m = await measure(page, s.pts);
          expect(m.stuck, `段${n} ${mode}`).toBe(true);
          m.grab.forEach((v, i) => expect(Math.abs(v - s.grab[i]), `段${n} ${mode} つまみ ${i}`).toBeLessThanOrEqual(0.5));
          expect(m.line[0]).toBeCloseTo(s.grab[1] + (s.top || 18), 0); expect(m.line[1]).toBeCloseTo(s.grab[1] + (s.top || 18) + 4, 0);
          expect(m.fill, `段${n} ${mode} 埋めた面`).not.toBeNull();
          [m.fill.x0, m.fill.y0, m.fill.x1, m.fill.y1].forEach((v, i) => expect(Math.abs(v - s.fill[i]), `段${n} ${mode} 埋めた面 ${i}`).toBeLessThanOrEqual(0.5));
          expect(m.fill.bg).toBe(FILL);
          // 上の 0.5 の線: 帯ありはつまみの上端（y593・横 y381）、帯なしは面の上端（y581・横 y369）に1本だけ
          if (s.sar) { expect(m.sh).toBe(LINE); expect(m.fill.sh).toBe('none'); } else { expect(m.sh).toBe('none'); expect(m.fill.sh).toBe(LINE); }
          expect(m.hits, `段${n} ${mode} 見える要素`).toEqual(s.pts.map(() => 'grip'));
          if (mode === 'B') { await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400); await page.evaluate(() => document.activeElement?.blur()); }
        }
      }
      // 埋めた面をたたく・引く → 何も起きない（下のカードは開かず、つまみの引きも始まらない）
      const before = await paneState(page);
      for (const [x, y] of s.pts) { await page.mouse.click(x, y); await page.waitForTimeout(250); }
      const [x, y] = s.pts[1];
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 60, { steps: 6 }); await page.mouse.move(x, y + 30, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500);
      expect(await paneState(page)).toEqual(before);
      // つまみ自体は今までどおり（下へ引くと時間軸）
      const gx = (s.grab[0] + s.grab[2]) / 2, gy = s.grab[3] - 24;
      await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move(gx, gy + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(600);
      await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
      await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400);
      // 送り切り: つまみは元の位置（最後のカードのすぐ下）。埋めない・線もない
      await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(200);
      const e = await measure(page, []);
      expect(e.stuck).toBe(false); expect(e.fill).toBeNull(); expect(e.sh).toBe('none');
    });
  }
  test('段1 は貼り付けないので埋めない。予定の少ない日（貼り付かない）も埋めない', async ({ page }) => {
    await boot(page);
    expect(await stageOf(page)).toBe(1);
    expect((await measure(page, [])).fill).toBeNull();
    await toStage(page, 4);
    await page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-11-18"]').click({ position: { x: 8, y: 10 } }); await page.waitForTimeout(400);
    const m = await measure(page, []); expect(m.stuck).toBe(false); expect(m.fill).toBeNull();
  });
  test('§17-2 帯なしの縦: ＋（見える y585〜633）はつまみの面の上に乗り、カードと重ならない（＋の左上の角の下は面）', async ({ page }) => {
    await boot(page, { sar: 0 }); await toStage(page, 4);
    const r = await page.evaluate(() => { const a = document.querySelector('.cb.cadd .bi').getBoundingClientRect(); const under = document.elementsFromPoint(a.left + 3, a.top + 3).filter((e) => !e.closest('.cb')); return { add: [a.left, a.top, a.right, a.bottom], first: under[0]?.className, card: under.some((e, i) => i === 0 && e.closest('.mdcard')) }; });
    expect(r.add[1]).toBeCloseTo(585, 0); expect(r.add[3]).toBeCloseTo(633, 0);
    expect(r.first).toContain('mdgrab'); expect(r.card).toBe(false);
  });
});

test.describe('S11g §17-5 帯なしの横で、ノートのシートの上にタスクのバッジを出さない', () => {
  test('シートを開いている間はバッジ（x660〜678・y0〜18）が見えず、閉じると戻る', async ({ page }) => {
    await boot(page, { sar: 0, land: true });
    await page.evaluate(async (d) => { const db = await import('/js/db.js'); const t = Date.parse(`${d}T00:00:00+09:00`); await db.putTask({ id: 'g1', title: '今日のタスク', due: { date: d }, done: false, doneAt: null, createdAt: t, updatedAt: t, order: 1, note: '', notify: false }); }, DAY);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    const bdg = page.locator('.shell.closed .cb.ctask .bdg');
    await expect(bdg).toBeVisible();
    const b = await bdg.boundingBox(); expect(b.x).toBeCloseTo(660, 0); expect(b.y).toBeCloseTo(0, 0); expect(b.width).toBeCloseTo(18, 0);
    await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(150);
    await page.locator('.mday [data-act="daynote"]').click(); await page.waitForTimeout(600);
    const sh = await page.locator('.nsheet').boundingBox(); expect(sh.y).toBeCloseTo(8, 0); expect(sh.x + sh.width).toBeCloseTo(678, 0);
    await expect(bdg).toBeHidden();
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page.locator('.nsheet')).toBeHidden();
    await expect(bdg).toBeVisible();
  });
});

test.describe('S11g 連携 低1 閉じた画面で書き出したバックアップの settings.view', () => {
  test('開いた縦で「週」にして閉じ、閉じた画面（月）で書き出す → settings.view は開いた側の week', async ({ page }, info) => {
    await openApp(page, SIZES.openPortrait669 || SIZES.openPortrait);
    await page.getByRole('button', { name: '週', exact: true }).click(); await page.waitForTimeout(300);
    await page.setViewportSize({ width: 466, height: 678 }); await page.waitForTimeout(600);
    await expect(page.locator('.shell.closed')).toBeVisible();
    await clickSettings(page);
    await page.getByRole('button', { name: 'バックアップ' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
    const p = info.outputPath('bk.json'); await dl.saveAs(p);
    expect(JSON.parse(fs.readFileSync(p, 'utf8')).settings.view).toBe('week');
  });
});
