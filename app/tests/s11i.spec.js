// 第19.2版 S11i: 8960267 のレビューの直し（実装担当）。K-3（企画の必須）。
// 値の根拠: design/34 §18-5「貼るのは最初の予定が 1 つ見えるときだけ」（図 img/closed-stick-18-5.png）と、その末尾の「品質が試験にする点」1〜7。
//   日の欄の高さ H ≧ T で貼り、H ＜ T−4 で外す。T ＝ D（最初の時刻つきの予定までの距離）＋ V（min(高さ, 56)）＋ G（つまみの箱。帯あり 44・帯なし 56）＋ 41。
//   時刻つきの予定が 0 件の日は T＝170（§18-1 のまま）。値の表: 帯あり 終日なし 185・1 行 221・2 行 257・時間軸 B 229・C 285／帯なしは +12。
//   縦の段の高さ: 段2＝170、段3＝266、段4＝418。横はいつも 466。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES } from './helpers.js';

const DAY = '2026-11-12', DAY2 = '2026-11-13', SHOTS = process.env.S11I_SHOTS || '';
const hh = (n) => String(n).padStart(2, '0');
const timedOn = (day, p) => Array.from({ length: 6 }, (_, i) => ev(`${p}t${i}`, `予定${i + 1}`, `${day}T${hh(9 + i)}:00`, `${day}T${hh(10 + i)}:00`)); // 9:00〜15:00 に 1 時間ずつ 6 件
const allOn = (day, p, rows) => (rows === 0 ? [] : rows === 1 ? [ev(`${p}a0`, '休み', day, day, { all: true })] : Array.from({ length: 6 }, (_, i) => ev(`${p}a${i}`, `長い題名の終日の予定その${i + 1}`, day, day, { all: true }))); // 6 件の長い題名はどの幅でも 2 行（+N）
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
async function boot(page, { sar = 84, land = false, data = [] } = {}) {
  await page.addInitScript((sar) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar}px`)), sar);
  await page.clock.setFixedTime(new Date(`${DAY}T09:41:00+09:00`));
  await openApp(page, SIZES.closedPortrait);
  if (data.length) await seed(page, data);
  if (land) { await page.setViewportSize({ width: 678, height: 466 }); await page.waitForTimeout(600); }
}
async function toStage(page, n) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) { await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(450); }
  await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(250);
}
// つまみ（下）のキーで日の欄の見せ方を替える（替えるたびに「開いたときの位置」へ合わせ直される）
async function toMode(page, m) {
  const cur = async () => 'ABC'.indexOf(await page.locator('.mpull.browse .mday').getAttribute('data-dg'));
  const want = 'ABC'.indexOf(m);
  for (let i = 0; i < 4 && (await cur()) !== want; i++) { await page.locator('.mpull.browse .mdgrab').focus(); await page.keyboard.press((await cur()) < want ? 'ArrowDown' : 'ArrowUp'); await page.waitForTimeout(450); }
  await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(150);
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦は画面（.mpull.browse）が1本で流れる。貼っていないつまみ（下）へ focus() すると画面がそこまで送られる（前は日の欄の中が送られ、見せ方を替えると日の欄ごと一番上へ戻っていた）。
  // この spec は「開いたときの位置（スクロール 0）」の形を見るので、替えたあと画面を一番上へ戻してから測る（止まってから決め直す 0.14 秒＋フェード 0.15 秒を待つ）
  if (await page.evaluate(() => { const s = document.querySelector('.mpull.browse[data-stage]'); if (!s || !s.scrollTop) return false; s.scrollTop = 0; return true; })) await page.waitForTimeout(400);
}
// 1コマ分の測り。first＝最初の時刻つきの予定（カードは .mdcard の先頭、時間軸はいちばん早い .tlev）。vis＝見出しの下端〜（貼り付いていれば面の上端、いなければ日の欄の下端）に見える高さ
const SNAP = () => {
  const el = document.querySelector('.mpull.browse .mday'), g = el.querySelector('.mdgrab'), hd = el.querySelector('.mdh'), nl = el.querySelector('.mdnl');
  const p = el.getBoundingClientRect(), b = g.getBoundingClientRect(), h = hd.getBoundingClientRect();
  let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
  const stuck = g.classList.contains('stuck'), shown = op > 0.001 && b.top < p.bottom;
  const tl = el.querySelector('.tl');
  const evs = [...el.querySelectorAll(tl ? '.tlev[data-event]' : '.mdcard')].map((c) => c.getBoundingClientRect()).sort((a, c) => a.top - c.top);
  const lo = h.bottom, hi = stuck ? b.top : p.bottom;
  const items = evs.map((r) => ({ top: r.top, h: r.height, vis: Math.max(0, Math.min(r.bottom, hi) - Math.max(r.top, lo)), need: Math.min(r.height, 56), headVis: Math.max(0, Math.min(r.top + Math.min(r.height, 56), hi) - Math.max(r.top, lo)) }));
  const ad = el.querySelector('.mdad')?.getBoundingClientRect();
  return { top: p.top, bottom: p.bottom, h: p.height, T: el._gsT, dg: el.dataset.dg, gs: el.classList.contains('gs'), sticky: getComputedStyle(g).position === 'sticky', stuck, op, gt: b.top, gb: b.bottom, hb: h.bottom, st: el.scrollTop, adH: ad ? ad.height : 0, nlGap: nl.getBoundingClientRect().top - b.bottom, first: items[0] || null, items, ov: shown ? Math.max(0, Math.min(b.bottom, h.bottom) - Math.max(b.top, h.top)) : 0, stage: Number(document.querySelector('.mpull').dataset.stage || 0), anims: g.getAnimations().map((a) => a.effect.getTiming().duration), fill: getComputedStyle(g, '::before').content !== 'none' };
};
const snap = (page) => page.evaluate(SNAP);
const startFrames = (page) => page.evaluate((src) => { const f = new Function(`return (${src})()`); window.__fr = []; window.__frStop = false; const t0 = performance.now(); const tick = (now) => { window.__fr.push({ t: now - t0, ...f() }); if (!window.__frStop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, SNAP.toString());
const stopFrames = (page) => page.evaluate(() => { window.__frStop = true; return window.__fr; });

const FORMS = [
  { name: '縦・帯あり', sar: 84, land: false, G: 44, grabTop: 593 },
  { name: '縦・帯なし', sar: 0, land: false, G: 56, grabTop: 581 },
  { name: '横・帯あり', sar: 84, land: true, G: 44, grabTop: 381 },
  { name: '横・帯なし', sar: 0, land: true, G: 56, grabTop: 369 },
];
const STG_H = { 2: 170, 3: 266, 4: 418, 5: 450, 6: 482, 7: 504 };
// §18-5 の値の表（帯あり。帯なしは +12）
// §18-6（品質の質問への答え）: 1＝時間軸でも終日の予定がある日は描いた終日の行 32 を足す／4＝時刻つき 0 件の T＝170 は時間軸だけ（カードは貼らない＝.gs なし）
const tableT = (mode, rows, timed, G) => (!timed ? 170 : (mode === 'A' ? [185, 221, 257][rows] : (mode === 'B' ? 229 : 285) + (rows ? 32 : 0)) + (G - 44));

// 点 1・2・3・6: 4 形 × カード・時間軸 B・C × 終日 0／1 行／2 行 × 時刻つき 0／6 件。縦は段 2・3・4、横は 1 つ
for (const f of FORMS) {
  test.describe(`S11i §18-5 ${f.name}: 貼るのは最初の予定が 1 つまるごと見えるときだけ`, () => {
    for (const rows of [0, 1, 2]) for (const timed of [0, 6]) {
      test(`終日 ${rows} 行・時刻つき ${timed} 件: A・B・C${f.land ? '' : ' × 段 2・3・4'} で、表どおりに貼る・貼らない。貼ったら最初の予定がまるごと見える。端だけのぞかない`, async ({ page }) => {
        test.setTimeout(90000);
        await boot(page, { sar: f.sar, land: f.land, data: [...allOn(DAY, 'x', rows), ...(timed ? timedOn(DAY, 'x') : [])] });
        for (const n of f.land ? [0] : [2, 3, 4]) {
          if (n) await toStage(page, n);
          for (const mode of ['A', 'B', 'C']) {
            await toMode(page, mode);
            const s = await snap(page), tag = `${f.name} 段${n} ${mode} 終日${rows}行 時刻つき${timed}件 ${JSON.stringify({ h: s.h, T: s.T, gs: s.gs, stuck: s.stuck, gt: s.gt, first: s.first, adH: s.adH })}`;
            const H = f.land ? 466 : STG_H[n], T = tableT(mode, rows, timed, f.G);
            expect(s.dg, tag).toBe(mode); expect(Math.abs(s.h - H), tag).toBeLessThanOrEqual(0.6);
            if (mode === 'A') expect(Math.abs(s.adH - [0, 28, 64][rows]), `終日の欄の行数（描いた高さ） ${tag}`).toBeLessThanOrEqual(1);
            // 点 2: 表の T と、貼る・貼らない
            // （時間軸 B の 1 時間の予定は描いた高さが 43＝44−すき間 1 なので、測った T は表の 229 より 1 小さい 228。§18-5「描いた矩形から測る」）
            if (timed || mode !== 'A') { expect(Math.abs(s.T - T), `T は表の値 ${T} ${tag}`).toBeLessThanOrEqual(1); expect(s.gs, `高さ ${H} と T ${T}: 貼る=${H >= T} ${tag}`).toBe(H >= T); }
            else expect(s.gs, `時刻つき 0 件のカードは貼らない（§18-6 の 4） ${tag}`).toBe(false);
            expect(s.op, tag).toBe(1); expect(s.anims, tag).toEqual([]); expect(s.ov, `見出しと重ならない ${tag}`).toBe(0);
            if (timed) {
              expect(s.first, tag).not.toBeNull();
              if (s.gs) { // 点 1: 開いたときの位置で、最初の予定が見出しの下からつまみの上端までにまるごと（長い予定は上から 56）入る
                expect(s.stuck, `予定の多い日は貼り付いている ${tag}`).toBe(true); expect(s.fill, tag).toBe(true);
                expect(Math.abs(s.gt - f.grabTop), `つまみの上端 y${f.grabTop} ${tag}`).toBeLessThanOrEqual(0.6);
                expect(s.first.top, `最初の予定の上端 ≧ 見出しの下端 ${tag}`).toBeGreaterThanOrEqual(s.hb - 0.5);
                expect(s.first.top + s.first.need, `最初の予定の上端＋min(高さ,56) ≦ つまみの上端 ${tag}`).toBeLessThanOrEqual(s.gt + 0.5);
                // 点 3: 細い切れ端だけの形がない（見出しとつまみの間に、まるごと見える予定が 1 つ以上）
                expect(s.items.filter((c) => c.headVis >= c.need - 0.5).length, `まるごと見える予定が 1 つ以上 ${tag}`).toBeGreaterThanOrEqual(1);
              } else {
                expect(H, `貼らないのは H ＜ T ${tag}`).toBeLessThan(s.T);
                expect(s.sticky, tag).toBe(false); expect(s.stuck, tag).toBe(false); expect(s.fill, `埋めた面なし ${tag}`).toBe(false);
                expect(s.gt, `つまみは一覧の後ろ（日の欄の下の端より下） ${tag}`).toBeGreaterThanOrEqual(s.bottom - 0.5);
                expect(s.first.top, `最初の予定は見出しの下から ${tag}`).toBeGreaterThanOrEqual(s.hb - 0.5);
              }
              // 品質の検査（STEER 14:18）: 止まった位置で、最初の時刻つきの予定は「まるごと見える（長い予定は上から 56）」か「まったく見えない」。
              // ただし貼らない段2 の終日 2 行だけは、最初のカードの下の 2 が日の欄の下の端（ホームバーの帯の中）で切れる（44＋72＋56＝172 ＞ 170。§18-5 は終日 1 行までの形しか決めていない。S11.md に記録）
              // 貼らない時間軸・広い（C）の段2 は、1 時間前の線から始まるので最初の予定は下の端で切れる（§18-5「時間軸は、最初の予定の 1 時間前から下の端まで線と予定が続く」）。カードと、貼っているときに見る
              if (mode === 'A' || s.gs) {
                const cutOk = !s.gs && rows === 2 && n === 2 ? 2.5 : 0.5;
                expect(s.first.headVis === 0 || s.first.headVis >= s.first.need - cutOk, `最初の予定は まるごと か 見えない ${tag}`).toBe(true);
                expect(s.first.headVis, `最初の予定がまるごと見える ${tag}`).toBeGreaterThanOrEqual(s.first.need - cutOk);
              }
            } else if (mode === 'A') { // 点 6: 時刻つき 0 件のカードは貼り付かない。終日 → つまみ → ノート ›
              expect(s.stuck, `貼り付かない ${tag}`).toBe(false); expect(s.fill, tag).toBe(false);
              expect(Math.abs(s.nlGap), `つまみのすぐ下が ノート › ${tag}`).toBeLessThanOrEqual(0.6);
            } else { // 点 6: 時間軸は §18-1 のとおり H ≧ 170 で貼る
              expect(s.gs, tag).toBe(true); expect(s.stuck, `時間軸は貼る ${tag}`).toBe(true);
              expect(Math.abs(s.gt - f.grabTop), tag).toBeLessThanOrEqual(0.6);
            }
            if (SHOTS && (timed ? mode === 'A' || rows === 0 : mode !== 'C' && rows !== 1) && n !== 4) await page.screenshot({ path: `${SHOTS}/i-${f.land ? 'land' : 'port'}-${f.sar ? 'band' : 'noband'}-s${n}-${mode}-ad${rows}-t${timed}.png` });
          }
          await toMode(page, 'A');
        }
      });
    }
    if (!f.land) {
      // 点 4: 引きで H を T−6 ⇔ T+2 に行き来
      for (const [mode, rows] of [['A', 1], ['B', 0]]) {
        test(`${mode}・終日 ${rows} 行: 引きで高さを T−6 ⇔ T+2 に行き来。H ≧ T で付き、H ＜ T−4 で外れ、切り替えは 2 回まで。0.15 秒・直線。見出しと重ならず、消える間は最初の予定にかからない`, async ({ page }) => {
          await boot(page, { sar: f.sar, data: [...allOn(DAY, 'x', rows), ...timedOn(DAY, 'x')] });
          if (mode !== 'A') { await toStage(page, 4); await toMode(page, mode); await toStage(page, 1); }
          const gb = await page.locator('.mgrab').boundingBox(), p = { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 };
          await page.mouse.move(p.x, p.y); await page.mouse.down(); p.y -= 8; await page.mouse.move(p.x, p.y, { steps: 4 });
          const hold = async (h, settle = 350) => { for (let i = 0; i < 8; i++) { const now = (await snap(page)).h, d = h - now; if (Math.abs(d) <= 0.4) break; p.y -= d; await page.mouse.move(p.x, p.y, { steps: i ? 1 : 5 }); await page.waitForTimeout(30); } await page.waitForTimeout(settle); return snap(page); };
          let s = await hold(tableT(mode, rows, 6, f.G) - 8); expect(s.gs, `T−6 下から: 貼らない ${JSON.stringify(s.h)}`).toBe(false); expect(Math.abs(s.T - tableT(mode, rows, 6, f.G))).toBeLessThanOrEqual(1);
          const T = s.T; // 描いた矩形から測った T（B は 228）
          s = await hold(T - 1); expect(s.gs, 'T−1 下から: まだ貼らない').toBe(false);
          await startFrames(page);
          s = await hold(T + 2); expect(s.gs, 'T+2: 貼る').toBe(true); expect(s.stuck).toBe(true); expect(s.op).toBe(1); expect(s.anims).toEqual([]);
          s = await hold(T - 3); expect(s.gs, 'T−3 上から: 遊び 4 の間は貼ったまま').toBe(true); expect(s.op).toBe(1);
          s = await hold(T - 6); expect(s.gs, 'T−6: 外す').toBe(false); expect(s.sticky).toBe(false); expect(s.anims).toEqual([]);
          const fr = await stopFrames(page);
          let flips = fr[0].gs ? 1 : 0; for (let i = 1; i < fr.length; i++) if (fr[i].gs !== fr[i - 1].gs) flips++; // 記録を始める前は貼っていない（上で確かめた）。WebKit は最初のコマがもう貼ったあとのことがある
          expect(flips, `1 往復で .gs の切り替えは 2 回`).toBe(2);
          for (const q of fr) {
            expect(q.ov, `t${q.t | 0} 高さ ${q.h}: 見出しとつまみの重なり`).toBeLessThanOrEqual(0.5);
            if (q.gs && q.op > 0.001 && (q.h >= T || q.op < 0.999)) expect(q.gt, `t${q.t | 0} 高さ ${q.h}: 貼っている間と消えていく間、つまみの上端 ≧ 最初の予定の上端＋min(高さ,56)（遊び 4 の間だけは最大 4 かかる）`).toBeGreaterThanOrEqual(q.first.top + q.first.need - 0.6);
            for (const d of q.anims) expect(d, 'フェードは 0.15 秒').toBe(150);
          }
          const iOn = fr.findIndex((q) => q.gs); expect(fr[iOn].h, '付くのは H ≧ T').toBeGreaterThanOrEqual(T - 0.6);
          // 出る: 0→1 を 0.15 秒・直線
          const on = []; for (let i = iOn; i < fr.length && fr[i].gs; i++) on.push(fr[i]);
          const full = on.find((q) => q.op >= 0.999); expect(full.t - on[0].t).toBeGreaterThan(90); expect(full.t - on[0].t).toBeLessThan(230);
          { const mid = on.filter((q) => q.op > 0.05 && q.op < 0.95 && q.t <= full.t); expect(mid.length, '出る途中のコマ').toBeGreaterThanOrEqual(2); const a = mid[0], b = mid[mid.length - 1]; expect(Math.abs((b.op - a.op) - (b.t - a.t) / 150)).toBeLessThan(0.12); }
          // 消える: 外れ始めは H ＜ T−4。1→0 を 0.15 秒・直線
          const iFade = fr.findIndex((q, i) => i > iOn && q.gs && q.op < 0.999 && q.t > full.t); expect(iFade).toBeGreaterThan(-1);
          expect(fr[iFade].h, '外れるのは H ＜ T−4').toBeLessThan(T - 4 + 0.6);
          const out = []; for (let i = iFade; i < fr.length && fr[i].gs; i++) out.push(fr[i]);
          { const mid = out.filter((q) => q.op > 0.05 && q.op < 0.95); expect(mid.length, '消える途中のコマ').toBeGreaterThanOrEqual(2); const a = mid[0], b = mid[mid.length - 1]; expect(Math.abs((a.op - b.op) - (b.t - a.t) / 150)).toBeLessThan(0.12); }
          await page.mouse.up(); await page.waitForTimeout(400);
        });
      }
      // 点 6: 時刻つき 0 件の日の時間軸は §18-1 のまま 170／166
      test('時刻つき 0 件・時間軸 B: §18-1 のまま、高さ 170 以上で貼り、166 未満で外す', async ({ page }) => {
        await boot(page, { sar: f.sar, data: allOn(DAY, 'x', 1) });
        await toStage(page, 4); await toMode(page, 'B'); await toStage(page, 1);
        const gb = await page.locator('.mgrab').boundingBox(), p = { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 };
        await page.mouse.move(p.x, p.y); await page.mouse.down(); p.y -= 8; await page.mouse.move(p.x, p.y, { steps: 4 });
        const hold = async (h) => { for (let i = 0; i < 8; i++) { const now = (await snap(page)).h, d = h - now; if (Math.abs(d) <= 0.4) break; p.y -= d; await page.mouse.move(p.x, p.y, { steps: i ? 1 : 5 }); await page.waitForTimeout(30); } await page.waitForTimeout(350); return snap(page); };
        for (const [h, want] of [[168, false], [172, true], [167, true], [164, false], [168, false], [170, true]]) {
          const s = await hold(h); expect(s.T).toBe(170);
          expect(s.gs, `高さ ${h}（実 ${s.h}）: 貼る=${want}`).toBe(want); expect(s.ov).toBe(0);
          if (want) { expect(s.stuck).toBe(true); expect(s.op).toBe(1); }
        }
        await page.mouse.up(); await page.waitForTimeout(400);
      });
    }
  });
}

// 点 5: 同じ段で日を替えて T が変わる（縦・帯なし・段3: 終日 1 行＝T 233 貼る → 終日 2 行＝T 269 貼らない → 戻す）。フェードせず一瞬
test('S11i §18-5 縦・帯なし・段3: 日を替えて T が変わるときは一瞬（1 行の日＝貼る → 2 行の日＝貼らない → 1 行の日＝貼る。0.15 秒のフェードなし）', async ({ page }) => {
  await boot(page, { sar: 0, data: [...allOn(DAY, 'x', 1), ...timedOn(DAY, 'x'), ...allOn(DAY2, 'y', 2), ...timedOn(DAY2, 'y')] });
  await toStage(page, 3);
  let s = await snap(page); expect(s.T).toBeCloseTo(233, 0); expect(s.gs).toBe(true); expect(s.stuck).toBe(true);
  for (const [day, T, want] of [[DAY2, 269, false], [DAY, 233, true], [DAY2, 269, false]]) {
    await startFrames(page);
    await page.locator(`.mgrid:not([data-leaving]) [data-date="${day}"]`).click(); await page.waitForTimeout(450);
    const fr = await stopFrames(page);
    s = await snap(page);
    expect(Math.abs(s.T - T), `${day} の T`).toBeLessThanOrEqual(1); expect(s.h).toBeCloseTo(266, 0);
    expect(s.gs, `${day}: 貼る=${want}`).toBe(want); expect(s.stuck).toBe(want); expect(s.op).toBe(1); expect(s.anims, 'getAnimations が 0').toEqual([]);
    for (const q of fr) { expect(q.anims.filter((d) => d === 150), `t${q.t | 0}: つまみだけのフェード（0.15 秒）はない`).toEqual([]); expect(q.ov).toBeLessThanOrEqual(0.5); }
    if (want) { expect(s.first.top + 56).toBeLessThanOrEqual(s.gt + 0.5); expect(s.gt).toBeCloseTo(581, 0); } else { expect(s.sticky).toBe(false); expect(s.first.headVis).toBeGreaterThanOrEqual(55.5); }
  }
});
test('S11i §18-5 縦・帯あり・段3: カード⇔時間軸・広い（C）で T が変わるときは一瞬（A＝貼る → C＝貼らない → A）', async ({ page }) => {
  await boot(page, { sar: 84, data: [...allOn(DAY, 'x', 1), ...timedOn(DAY, 'x')] });
  await toStage(page, 3);
  let s = await snap(page); expect(s.T).toBeCloseTo(221, 0); expect(s.stuck).toBe(true);
  await toMode(page, 'C'); s = await snap(page); expect(s.dg).toBe('C'); expect(s.T).toBeCloseTo(285 + 32, 0); expect(s.gs).toBe(false); expect(s.sticky).toBe(false); expect(s.anims).toEqual([]);
  expect(s.first.top, 'C: 最初の予定は見出しの下から（1 時間前が見出しのすぐ下）').toBeCloseTo(s.hb + 12 + 88, 0);
  await toMode(page, 'B'); s = await snap(page); expect(Math.abs(s.T - (229 + 32))).toBeLessThanOrEqual(1); expect(s.gs).toBe(true); expect(s.stuck).toBe(true); expect(s.op).toBe(1);
  expect(s.first.top).toBeCloseTo(s.hb + 12 + 44, 0); expect(s.first.top + s.first.need).toBeLessThanOrEqual(s.gt + 0.5);
  await toMode(page, 'A'); s = await snap(page); expect(s.gs).toBe(true); expect(s.stuck).toBe(true); expect(s.anims).toEqual([]);
});
// 送った量は見ない: 貼らない段2 で日の欄を送っても、送り切るまで貼り付きは変わらない。送り切ると カード → つまみ（線なし・面なし）→ ノート ›
for (const f of FORMS.filter((x) => !x.land)) {
  test(`S11i §18-5 ${f.name}・段2（貼らない）: 日の欄を送っても貼り付かない。送り切ると カード → つまみ → ノート ›（上の線・埋めた面なし）`, async ({ page }) => {
    await boot(page, { sar: f.sar, data: [...allOn(DAY, 'x', 1), ...timedOn(DAY, 'x')] });
    await toStage(page, 2);
    const max = await page.evaluate(() => { const m = document.querySelector('.mpull.browse .mday'); return m.scrollHeight - m.clientHeight; });
    for (let t = 0; t <= max; t += 7) {
      const s = await page.evaluate(([t, src]) => { const m = document.querySelector('.mpull.browse .mday'); m.scrollTop = t; m.dispatchEvent(new Event('scroll')); return new Function(`return (${src})()`)(); }, [t, SNAP.toString()]);
      expect(s.gs, `送り ${t}`).toBe(false); expect(s.stuck).toBe(false); expect(s.fill).toBe(false); expect(s.op).toBe(1);
    }
    const e = await page.evaluate((src) => { const m = document.querySelector('.mpull.browse .mday'); m.scrollTop = m.scrollHeight; m.dispatchEvent(new Event('scroll')); const s = new Function(`return (${src})()`)(); const g = m.querySelector('.mdgrab'), last = [...m.querySelectorAll('.mdcard')].at(-1).getBoundingClientRect(); return { ...s, lastB: last.bottom, sh: getComputedStyle(g).boxShadow, gh: g.getBoundingClientRect().height }; }, SNAP.toString());
    expect(Math.abs(e.gt - e.lastB), '最後のカードのすぐ下につまみ').toBeLessThanOrEqual(0.6); expect(Math.abs(e.nlGap)).toBeLessThanOrEqual(0.6);
    expect(e.gh).toBeCloseTo(f.G, 0); expect(e.sh, '上の線なし').toBe('none'); expect(e.fill).toBe(false);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/i-port-${f.sar ? 'band' : 'noband'}-s2-A-ad1-t6-end.png` });
  });
}
