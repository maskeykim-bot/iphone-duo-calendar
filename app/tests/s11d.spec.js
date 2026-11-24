// 第19.2版 S11d: 設計レビュー 7c9fb05 の必須 M1〜M9 と、品質レビュー 7c9fb05 の ④〜⑥ の足しの試験（実装担当）。
// 値の根拠: design/review/review-v19-2-7c9fb05-closed-mid.md §2、design/34 §3・§5・§6.3・§9.4・§13、qa/review-v19-2-7c9fb05.md §6。
// 品質の 12 本（s11b-design-m.spec.js）が見ていない所（横の払いとの住み分け・長押しとの優先・触覚の回数・引いたあとの click・並びの順・つまみ（下）が見えない日）を見る。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES } from './helpers.js';
import * as S from './spec-values.js';

const DAY = '2026-11-12';
const T5 = ['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`));
const SEED = [...T5, ev('ad', '終日の社内研修', DAY, DAY, { all: true }), ev('md', '出張', DAY, '2026-11-14', { all: true }), ev('wk', '月末の会議', '2026-11-28T10:00', '2026-11-28T11:00'), ev('x1', '資料の見直し', '2026-11-18T13:00', '2026-11-18T14:00')];
const cell = (k) => `.mgrid:not([data-leaving]) .day[data-date="${k}"]`;
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
const selected = (page) => page.locator('.mgrid:not([data-leaving]) .day[aria-selected="true"]').getAttribute('data-date');
async function boot(page, list = SEED) {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
  await openApp(page, SIZES.closedPortrait);
  await seed(page, list);
  const m = page.getByRole('button', { name: '月', exact: true });
  if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(300); }
}
async function toStage(page, n) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown');
  await page.waitForTimeout(400);
  expect(await stageOf(page)).toBe(n);
}
const drag = async (page, x0, y0, x1, y1, steps = 12) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); await page.mouse.up(); await page.waitForTimeout(500); };

test.describe('S11d M1・M2 の足し', () => {
  test('M1 週の間の線は、土曜（地のあるマス）の上にも出る: 行の上の層（::before）に inset 0 .5px 0 #E4E0D6。1行目には線がない', async ({ page }) => {
    await boot(page);
    const s = await page.evaluate(() => { const ws = [...document.querySelectorAll('.mgrid:not([data-leaving]) .week')]; const g = (w) => ({ bt: getComputedStyle(w).borderTopWidth, sh: getComputedStyle(w).boxShadow, before: getComputedStyle(w, '::before').boxShadow, bc: getComputedStyle(w, '::before').content, z: getComputedStyle(w, '::before').zIndex, pe: getComputedStyle(w, '::before').pointerEvents }); return { first: g(ws[0]), second: g(ws[1]), n: ws.length }; });
    expect(s.n).toBe(6);
    expect(s.second.bt).toBe('0px');
    expect(s.second.sh).toBe('rgb(228, 224, 214) 0px 0.5px 0px 0px inset');
    expect(s.second.before).toBe('rgb(228, 224, 214) 0px 0.5px 0px 0px inset');
    expect(s.second.z).toBe('1'); expect(s.second.pe).toBe('none'); // チップ（z2）より下、押せない
    expect(s.first.bt).toBe('0px'); expect(s.first.sh).toBe('none'); expect(s.first.bc).toBe('none');
  });
  // 第19.4版 レビュー直し（design/V194_レビュー.md 必須2）で決まりが変わった: 重なり順は「1 日のチップ ＜ 枠 ＜ 複数日の帯」。前は「枠は帯より上」（帯の題名の上に枠の線が乗っていた）
  test('M2 選んだ日の枠は、1 日のチップより上・複数日の帯より下の層', async ({ page }) => {
    await boot(page);
    await page.locator(cell('2026-11-13')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(300); // 出張（12〜14）の帯が通るマス
    const s = await page.locator(cell('2026-11-13')).evaluate((d) => { const z = (c) => Number(getComputedStyle(c).zIndex) || 0, all = [...d.parentElement.querySelectorAll('.chip')], band = (c) => c.classList.contains('bar') && !c.classList.contains('one'); return { frame: Number(getComputedStyle(d, '::after').zIndex), ones: all.filter((c) => !band(c)).map(z), bands: all.filter(band).map(z) }; });
    expect(s.bands.length).toBeGreaterThan(0);
    for (const z of s.ones) expect(s.frame).toBeGreaterThan(z);
    for (const z of s.bands) expect(z).toBeGreaterThan(s.frame);
  });
});

test.describe('S11d M5 の足し', () => {
  test('日の欄（.mday）は入れ替えの間もいつも1つ。見出しは入れ替えのあとその日になり、日の欄は一番上', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 80; });
    await page.evaluate(() => { window.__n = []; const t0 = performance.now(); const f = () => { window.__n.push(document.querySelectorAll('.mday').length); if (performance.now() - t0 < 500) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } });
    await expect(page.locator(cell('2026-11-18'))).toHaveAttribute('aria-selected', 'true'); // 選んだ枠はすぐ
    await page.waitForTimeout(450);
    expect(new Set(await page.evaluate(() => window.__n))).toEqual(new Set([1]));
    await expect(page.locator('.mdh .hdt')).toHaveText('11月18日');
    expect(await page.locator('.mday').evaluate((e) => e.scrollTop)).toBe(0);
    await expect(page.locator('.mday .mdcard')).toHaveCount(1); // 11/18 の予定だけ
    expect(await page.locator('.mday').evaluate((e) => [...e.children].every((k) => getComputedStyle(k).opacity === '1') && getComputedStyle(e).pointerEvents !== 'none')).toBe(true);
  });
  test('視差効果を減らす: 入れ替えは即時（暗くなるコマがない）', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page);
    await page.evaluate(() => { window.__op = []; const t0 = performance.now(); const f = () => { window.__op.push(Math.min(...[...document.querySelectorAll('.mday > *')].map((k) => Number(getComputedStyle(k).opacity)), 1)); if (performance.now() - t0 < 500) requestAnimationFrame(f); }; requestAnimationFrame(f); });
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(550);
    expect(Math.min(...await page.evaluate(() => window.__op))).toBe(1);
    await expect(page.locator('.mdh .hdt')).toHaveText('11月18日');
  });
});

test.describe('S11d M9 の足し（格子・日の欄の縦の引き）', () => {
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 段を引けるのは つまみ（上）だけ（M9 をやめた）。前→後: 格子のマスから上へ 150 →「段3」だったのを、格子からは「段1 のまま・触覚ログ 0」、同じ 150 を つまみ（上）から引くと「段3・ログ 2 件」
  test('格子を上へ 150 引いても段は変わらない（v19.3）。つまみ（上）を上へ 150 引く: 段1→段3、触覚ログは境をまたいだ 2 件（段2・段3）。引いたあとの click で日は選ばれない', async ({ page }) => {
    await boot(page);
    const sel0 = await selected(page);
    await page.evaluate(() => { window.__duoHapticLog.length = 0; });
    const b = await page.locator(cell('2026-11-04')).boundingBox();
    await drag(page, b.x + 27, b.y + 60, b.x + 27, b.y + 60 - 150);
    expect(await stageOf(page), '格子からは変わらない').toBe(1); expect(await page.evaluate(() => window.__duoHapticLog.length)).toBe(0); expect(await selected(page)).toBe(sel0);
    await page.locator('.mpull.browse').evaluate((e) => { e.scrollTop = 0; });
    const gb = await page.locator('.mgrab').boundingBox();
    await drag(page, b.x + 27, gb.y + 12, b.x + 27, gb.y + 12 - 150);
    expect(await stageOf(page)).toBe(3); // 引いた量 150 は境 144 を越えた所（34 §3）
    expect((await page.evaluate(() => window.__duoHapticLog)).map((h) => h.stage)).toEqual([2, 3]);
    expect(await selected(page)).toBe(sel0);
    const H = await page.locator('.mgwrap').evaluate((e) => e.getBoundingClientRect().height);
    expect(Math.abs(H - S.STAGES[3].H)).toBeLessThanOrEqual(S.TOL);
  });
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 前→後: 引き始めを格子のマス → つまみ（上）に（1:1・押した地が出ないことを見るのは同じ）
  test('つまみ（上）を引いている間、格子の高さは指に 1:1（触れた位置から）。押した地は出さない', async ({ page }) => {
    await boot(page);
    const b = await page.locator('.mgrab').boundingBox(); const x = b.x + 27, y = b.y + 12;
    await page.mouse.move(x, y); await page.mouse.down();
    for (const dy of [-10, -30, -60, -100]) {
      await page.mouse.move(x, y + dy); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const s = await page.evaluate(() => ({ H: document.querySelector('.mgwrap').getBoundingClientRect().height, pressed: [...document.querySelectorAll('.mgrid .day')].filter((d) => getComputedStyle(d).backgroundColor === 'rgb(226, 221, 210)').length }));
      expect(Math.abs(s.H - (S.STAGES[1].H + dy)), `dy=${dy}`).toBeLessThanOrEqual(1);
      expect(s.pressed, `dy=${dy} 押した地`).toBe(0);
    }
    await page.mouse.up(); await page.waitForTimeout(450);
  });
  test('横の払い（月送り）はそのまま: 格子を左へ払うと次の月。段は変わらない', async ({ page }) => {
    await boot(page);
    const g = await page.locator('.mgwrap').boundingBox();
    await drag(page, g.x + 300, g.y + 200, g.x + 60, g.y + 210, 8);
    await expect(page.locator('#ctitle')).toHaveText('2026年12月');
    expect(await stageOf(page)).toBe(1);
  });
  test('動きが 6 以下・たたきでは引かない（その日を選ぶ）', async ({ page }) => {
    await boot(page);
    const b = await page.locator(cell('2026-11-04')).boundingBox();
    await page.mouse.move(b.x + 27, b.y + 60); await page.mouse.down(); await page.mouse.move(b.x + 27, b.y + 56); await page.mouse.up(); await page.waitForTimeout(400);
    expect(await stageOf(page)).toBe(1);
    expect(await selected(page)).toBe('2026-11-04');
  });
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 前→後: 先に縦へ動いたら「段の引き（段が進む）」→「つかまない・段は変わらない（縦の動きは画面のスクロール）」
  test('チップの上で長押し 0.35 秒より先に縦へ動いたら、つかまない（段も変わらない）', async ({ page }) => {
    await boot(page);
    const c = await page.locator(`${cell('2026-11-18')} .strip.chip.timed`).first().boundingBox(); const x = c.x + c.width / 2, y = c.y + c.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 80, { steps: 6 });
    await page.waitForTimeout(450); // 長押しの時間を過ぎても
    await expect(page.locator('.chip.grabbed')).toHaveCount(0);
    await page.mouse.move(x, y - 150, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page)).toBe(1);
    expect((await page.evaluate(async () => (await (await import('/js/db.js')).getEvent('x1')).start))).toBe('2026-11-18T13:00'); // 予定は動いていない
  });
  test('チップを 0.35 秒つかんでから縦へ動かしたら、チップの移動（段は変わらない）', async ({ page }) => {
    await boot(page);
    const c = await page.locator(`${cell('2026-11-18')} .strip.chip.timed`).first().boundingBox(); const x = c.x + c.width / 2, y = c.y + c.height / 2;
    const to = await page.locator(cell('2026-11-25')).boundingBox();
    await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(450);
    await expect(page.locator('.chip.grabbed')).not.toHaveCount(0);
    await page.mouse.move(to.x + 27, to.y + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500);
    expect(await stageOf(page)).toBe(1);
    await expect.poll(() => page.evaluate(async () => (await (await import('/js/db.js')).getEvent('x1')).start)).toBe('2026-11-25T13:00');
  });
  test('日の欄: 送っている途中（scrollTop > 0）から下へ引いても、上へ引いても、段は変わらない（34 §6.3）', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    const d = await page.locator('.mday').boundingBox();
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 60; });
    await drag(page, 200, d.y + 80, 200, d.y + 200);
    expect(await stageOf(page), '送っている途中から下へ').toBe(4);
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 0; });
    await drag(page, 200, d.y + 200, 200, d.y + 80);
    expect(await stageOf(page), '一番上から上へ').toBe(4);
  });
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 前→後: 日の欄を一番上から下へ 120 引くと「段が戻る・触覚ログは境の数」→「段4 のまま・触覚ログ 0」（M9b をやめた）。引いたあとの click でカードが開かないのは同じ
  test('日の欄: 一番上から下へ 120 引いても段4 のまま、触覚ログは 0 件。カードは開かない', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    await page.evaluate(() => { window.__duoHapticLog.length = 0; });
    const c = await page.locator('.mday .mdcard').first().boundingBox();
    await drag(page, c.x + 150, c.y + 20, c.x + 150, c.y + 140);
    expect(await stageOf(page)).toBe(4);
    expect(await page.evaluate(() => window.__duoHapticLog.length)).toBe(0);
    await expect(page.locator('#editor')).toBeHidden(); // 引いたあとの click でカードは開かない
  });
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 前→後: 引き始めを格子のマス → つまみ（上）に（ゴム 24・戻り・ログ 0 を見るのは同じ）
  test('段1でつまみ（上）をさらに下へ引くとゴム（最大 24）。離すと段1へ戻り、触覚ログは 0 件', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__duoHapticLog.length = 0; });
    const b = await page.locator('.mgrab').boundingBox(); const x = b.x + 27, y = b.y + 12;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 120, { steps: 8 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const H = await page.locator('.mgwrap').evaluate((e) => e.getBoundingClientRect().height);
    expect(Math.abs(H - (S.STAGES[1].H + S.RUBBER.max))).toBeLessThanOrEqual(S.TOL);
    await page.mouse.up(); await page.waitForTimeout(450);
    expect(await stageOf(page)).toBe(1);
    expect(await page.evaluate(() => window.__duoHapticLog.length)).toBe(0);
  });
});

test.describe('S11d 品質レビュー 7c9fb05 ⑤ 終日の並び', () => {
  test('終日の予定の順は、マスの段（複数日の帯が先）・日の欄の終日チップ・マスの読み上げで同じ', async ({ page }) => {
    await boot(page);
    for (const n of [1, 4, 7]) {
      await toStage(page, n);
      const s = await page.evaluate((k) => {
        const d = document.querySelector(`.mgrid:not([data-leaving]) .day[data-date="${k}"]`);
        const lanes = [...d.querySelectorAll('.bar.chip[data-event]')].sort((a, b) => Number(a.dataset.lane) - Number(b.dataset.lane)).map((c) => c.dataset.event);
        const pane = [...document.querySelectorAll('.mday .mdallday')].map((c) => c.dataset.event);
        const lab = d.getAttribute('aria-label');
        return { lanes, pane, lab: [lab.indexOf('出張'), lab.indexOf('終日の社内研修'), lab.indexOf('予定A')] };
      }, DAY);
      expect(s.lanes, `段${n} マスの段`).toEqual(['md', 'ad']); // 複数日の帯（出張）が上
      expect(s.pane, `段${n} 日の欄の終日チップ`).toEqual(s.lanes);
      expect(s.lab[0], `段${n} 読み上げ`).toBeGreaterThan(-1);
      expect(s.lab[0]).toBeLessThan(s.lab[1]); expect(s.lab[1]).toBeLessThan(s.lab[2]); // 出張 → 終日の社内研修 → 時刻つき
    }
  });
});

// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: S11f §16-1「段2〜7 は、つまみ（下）を日の欄の下端に貼り付ける（押せる y593〜637）。引くと時間軸、『カード』で戻る」と「予定1件の日はつまみが最後のカードのすぐ下」の 2 本を、
// 「カードにつまみ（下）は無い。時間へは見出しの右の『カード｜時間』」（design/35 §5.1・§5.2）に置き換えた。.mdtl が無い・日の欄を一番上から下へ引いてもカードのまま、は同じ
test.describe('S11d 品質レビュー 7c9fb05 ⑥ → v19.3 予定の多い日の「カード｜時間」', () => {
  test('予定の多い日（段4）: 見出しの右に「時間軸」（.mdtl）はなく、つまみ（下）もない。「時間」で時間軸、「カード」で戻る', async ({ page }) => {
    await boot(page); await toStage(page, 4);
    await expect(page.locator('.mdtl')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '時間軸にする' })).toHaveCount(0);
    await expect(page.locator('.mday .mdgrab')).toHaveCount(0);
    await page.locator('.mday .mdct [data-dg="time"]').click();
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
    await expect(page.locator('.mday .tlev')).not.toHaveCount(0);
    await page.locator('.mday .mdct [data-dg="card"]').click();
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A');
    // 日の欄を一番上から下へ引いても、時間軸へは行かない（段も変わらない）
    const d = await page.locator('.mday').boundingBox();
    await drag(page, 200, d.y + 60, 200, d.y + 110);
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A');
  });
  test('どの段・どの日にも .mdtl はない。予定1件の日も、最後のカードのすぐ下（間 8）が「ノート ›」', async ({ page }) => {
    await boot(page);
    for (const n of [7, 4, 1]) { await toStage(page, n); await expect(page.locator('.mdtl'), `段${n}`).toHaveCount(0); }
    await toStage(page, 4);
    await page.locator(cell('2026-11-18')).click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(400);
    await expect(page.locator('.mdtl')).toHaveCount(0);
    await expect(page.locator('.mday .mdgrab')).toHaveCount(0);
    const m = await page.evaluate(() => { const nl = document.querySelector('.mday .mdnl'), last = [...document.querySelectorAll('.mday .mdcard, .mday .mdnone2')].at(-1); return { top: nl.getBoundingClientRect().top, last: last.getBoundingClientRect().bottom, card: last.classList.contains('mdcard') }; });
    expect(Math.abs(m.top - m.last - (m.card ? 8 : 0))).toBeLessThanOrEqual(0.5);
  });
});
