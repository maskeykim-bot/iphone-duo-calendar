// 品質の写し（S11i 用）: 8960267 の tests/s11h.spec.js を design/34 §18-5 に合わせた。リポジトリの s11h.spec.js は触っていない。
// §18-5: この日（時刻つき 7 件・終日 1 行・カード）は T＝221（帯あり）／233（帯なし）。貼るのは H≧T、外すのは H＜T−4。段2（170）は貼らない、段3（266）は貼る。
// 第19.2版 S11h: 8cd8a6c のレビューの直し（実装担当）。
// 値の根拠: design/34 §18（18-1 貼り付きは日の欄の高さで決める・18-2 帯なしのつまみの箱は 56・18-3 シートの上に残る見出しのボタンを inert）、design/review/review-v19-2-8cd8a6c-closed-final2.md。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES } from './helpers.js';

const DAY = '2026-11-12';
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
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) { await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(450); }
  await page.evaluate(() => document.activeElement?.blur());
}
// 1コマ分の測り: 日の欄・見出し・つまみ（下）。ft＝面の上端（::before が上へ出ていればその上端。S11h からは帯なしもつまみの箱の上端と同じ）。ov＝面（見えているとき）と見出しの重なりの高さ
const SNAP = () => {
  const el = document.querySelector('.mpull.browse .mday'), g = el.querySelector('.mdgrab'), hd = el.querySelector('.mdh');
  const p = el.getBoundingClientRect(), b = g.getBoundingClientRect(), h = hd.getBoundingClientRect(), i = g.querySelector('i').getBoundingClientRect();
  const bf = getComputedStyle(g, '::before'), ft = b.top + (bf.content !== 'none' ? Math.min(0, parseFloat(bf.top) || 0) : 0);
  const op = Number(getComputedStyle(g).opacity), shown = op > 0.001 && ft < p.bottom && b.bottom > p.top;
  const cards = [...el.querySelectorAll('.mdcard')], cb = cards.length ? cards[cards.length - 1].getBoundingClientRect().bottom : 0;
  return { top: p.top, h: p.height, gs: el.classList.contains('gs'), sticky: getComputedStyle(g).position === 'sticky', stuck: g.classList.contains('stuck'), op, gt: b.top, ft, cb, gb: b.bottom, gl: b.left, gr: b.right, line: [i.top, i.bottom], hb: h.bottom, ov: shown ? Math.max(0, Math.min(b.bottom, h.bottom) - Math.max(ft, h.top)) : 0, stage: Number(document.querySelector('.mpull').dataset.stage || 0), anims: g.getAnimations().length };
};
const snap = (page) => page.evaluate(SNAP);
// コマごとに ms の間、測りを集める
const frames = (page, ms) => page.evaluate(([src, ms]) => new Promise((res) => { const f = new Function(`return (${src})()`), out = [], t0 = performance.now(); const tick = (now) => { out.push({ t: now - t0, ...f() }); if (now - t0 < ms) requestAnimationFrame(tick); else res(out); }; requestAnimationFrame(tick); }), [SNAP.toString(), ms]);

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: §18-1（貼り付きは日の欄の高さで決める。縦 5 本 × 帯あり／なし、横 2 本）・§18-2（帯なしのつまみ（下）の箱はいつも 56。3 本）の試験は外した。
// カードにつまみ（下）は無く、時間のバーは見出しのすぐ下で貼り付けない（design/35 §5.2〜§5.4「§16-1・§17-1・§17-2・§18-* はすべて捨てる」）。
// 代わりの試験: tests/v193-design35-s9.spec.js の S-2・S-7、tests/v193-day-cardtime.spec.js の A-16。§18-3（シートを開いている間の見出し）はそのまま。

test.describe('S11h §18-3 シートを開いている間、上に残る見出しのボタンを押せなくする', () => {
  const openSheet = async (page) => {
    await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(150);
    await page.locator('.mday [data-act="addnote"]').click(); await page.waitForTimeout(600); // v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 日の欄の「ノートの欄」→「＋ ノート」
    await expect(page.locator('.nsheet')).toBeVisible();
  };
  // §18-6: 見出しの帯ごと inert にしてよいので、ボタン自身の inert でなく 祖先を含めて見る
  const inert = (page) => page.evaluate(() => [...document.querySelectorAll('.shell.closed .cb.ctask, .shell.closed .cb.cmore')].map((b) => !!b.closest('[inert]')));
  const head = (page) => page.evaluate(() => (document.querySelector('.mph h2, .mph h1, #ctitle, .stitle')?.textContent || '').trim());
  test('§18-6 横・帯なし: シートを開いて (656,4)・(620,4)・(350,4) 今日へ・(10,2)/(14,2) 月送り をたたいても shell の class も月も変わらない（タスクの画面に切り替わらない・メニューも出ない）。閉じると押せる', async ({ page }) => {
    await boot(page, { sar: 0, land: true });
    expect(await inert(page)).toEqual([false, false]);
    await openSheet(page);
    const sh = await page.locator('.nsheet').boundingBox(); expect(sh.y).toBeCloseTo(8, 0);
    expect(await inert(page)).toEqual([true, true]);
    const cls = await page.locator('.shell').getAttribute('class');
    const tb = await page.locator('.cb.ctask').boundingBox(); expect(tb.y).toBeLessThan(8); // 上の 8 に端が残っている
    const h0 = await head(page); const changed = [];
    for (const [x, y] of [[656, 4], [tb.x + tb.width / 2, 4], [620, 4], [600, 3], [350, 4], [10, 2], [14, 2]]) { await page.mouse.click(x, y); await page.waitForTimeout(250); const h = await head(page); if (h !== h0) changed.push([x, y, h]); }
    expect(await page.locator('.shell').getAttribute('class')).toBe(cls);
    expect.soft(changed, '§18-6 見出しの帯（今日へ・月送り）も働かない').toEqual([]);
    await expect(page.locator('.nsheet')).toBeVisible();
    expect(await page.locator('.cb.cmore').getAttribute('aria-expanded')).toBe('false');
    expect(await page.evaluate(() => { const e = document.elementFromPoint(656, 4); return !!e?.closest('.cb'); }), 'inert のボタンは当たらない').toBe(false);
    // 見た目は変えない
    expect(await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.cb.ctask')); return [c.opacity, c.visibility]; })).toEqual(['1', 'visible']);
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page.locator('.nsheet')).toBeHidden();
    expect(await inert(page)).toEqual([false, false]);
    await page.mouse.click(656, 4); await page.waitForTimeout(400);
    expect(await page.locator('.shell').getAttribute('class')).not.toBe(cls); // 閉じたあとは今までどおりタスクへ
  });
  test('横・帯あり／縦・帯なし: シートを開いても inert にしない（§17-5 と同じ条件のときだけ）', async ({ page }) => {
    await boot(page, { sar: 0 }); await toStage(page, 4);
    await openSheet(page);
    expect(await inert(page)).toEqual([false, false]);
  });
});
