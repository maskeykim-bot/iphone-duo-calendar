// 第18版 PR4: 組み込み。アプリの中（tt の見開き・951×669・右の帯 84・dpr 2）でのページめくり。Chromium と WebKit。
// 正本：design/IMPL_PLAN_V18.md PR4、qa/verify-curl-integration.md 1章④・2章（CS-15〜18、§6.11-10）。
// 時間は止めて進める（window.__duoCurl.manual / advance）。速さは測らない（箱に GPU はない）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, swipe } from './helpers.js';

test.use({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
test.setTimeout(120000);

const UI = 'duo.ui.v1';
const preset = (page, patch) => page.addInitScript(({ k, p }) => {
  if (localStorage.getItem('__ca_seeded')) return;
  localStorage.setItem('__ca_seeded', '1');
  let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; }
  localStorage.setItem(k, JSON.stringify({ ...s, ...p }));
}, { k: UI, p: patch });
const setSafe = (page, r) => page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), r);
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const note = (id, body, date) => ({ id, body, createdAt: 5, updatedAt: Date.UTC(2026, 10, 1) + body.length, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null });
const heads = (page) => page.locator('#app .dpage .dd').allTextContents();
const cv = (page) => page.evaluate(() => { const s = __duoCurl.state(); return s; });
const EVENTS = [
  ev('a', '左の会議', '2026-11-12T10:00', '2026-11-12T11:00'),
  ev('b', '右の会議', '2026-11-13T10:00', '2026-11-13T11:00'),
  ev('c', '十四日の予定', '2026-11-14T09:30', '2026-11-14T10:30'),
  ev('d', '十五日の予定', '2026-11-15T11:00', '2026-11-15T12:30'),
  ev('e', '十日の予定', '2026-11-10T09:00', '2026-11-10T10:00'),
];
const NOTES = [note('n14', '14日のメモ\n二行目', '2026-11-14'), note('n10', '10日のメモ', '2026-11-10'), note('n12', '12日のメモ', '2026-11-12')];

async function land(page, { patch = {}, events = EVENTS, notes = NOTES, reduce = false, noGl = false } = {}) {
  await preset(page, { selected: '2026-11-12', spreadType: 'tt', ...patch });
  if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  if (noGl) await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
  await openApp(page, SIZES.openLandscape951);
  if (notes) for (const n of notes) await putNote(page, n);
  if (events) await seed(page, events); else { await page.reload(); await page.waitForSelector('html[data-ready]'); }
  await setSafe(page, 84);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sar'))).toBe('84px');
  await expect(page.locator('.dpage')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}
const manual = (page) => page.evaluate(() => __duoCurl.manual(true));
const adv = (page, ms) => page.evaluate((ms) => __duoCurl.advance(ms), ms);
// 指の動き。pts = [[x, y, 前に進める ms]]（最初は押す）。マウスで押して動かす（時計は止めてある）
async function down(page, x, y) { await page.mouse.move(x, y); await page.mouse.down(); }
async function moves(page, pts) { for (const [x, y, dt] of pts) { if (dt) await adv(page, dt); await page.mouse.move(x, y); } }
// ゆっくり離す（速さ ≒ 0）。最後の位置で止まって離す
const slowTo = async (page, from, to, y = 300) => { await moves(page, [[from, y, 16], [to + 1, y, 600], [to, y, 600]]); };
const finishAll = (page) => adv(page, 800);

test.describe('めくりの始まり（確認表 1章④）', () => {
  test('始める場所（18.2）：左右どちらのページのどこからでも、動かした向きでめくる（左へ＝前へ・右へ＝戻り）。画面の左 20 は除く', async ({ page }) => {
    await land(page, { events: null }); await manual(page);
    let yy = 110; const at = async (x, dx, y = (yy = 110 + ((yy - 80) % 240))) => { await down(page, x, y); await moves(page, [[x + dx, y, 0]]); const s = await cv(page); await page.mouse.up(); await adv(page, 800); await page.waitForTimeout(250); if (await page.locator('#editor').isVisible()) { await page.keyboard.press('Escape'); await expect(page.locator('#editor')).toBeHidden(); } return s; };
    for (const x of [100, 300, 460, 490, 668, 760, 850]) { const s = await at(x, -30); expect(s.shown, `x${x} 左へ`).toBe(true); expect(s.dir, `x${x} 左へ`).toBe('forward'); }
    for (const x of [22, 200, 460, 490, 668, 800, 845]) { const s = await at(x, 30); expect(s.shown, `x${x} 右へ`).toBe(true); expect(s.dir, `x${x} 右へ`).toBe('backward'); }
    expect((await at(19, 30)).shown, 'x19（左 20 は端の戻る操作）').toBe(false);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('辺 24 だけ触れた瞬間に角が上がる。それ以外は向きが決まるまで何も出さない（タップでは出ない）。辺で上げた向きと逆へ動かしても、動かした向きでめくる', async ({ page }) => {
    await land(page, { events: null }); await manual(page);
    await down(page, 780, 300); await moves(page, [[770, 300, 16]]); expect((await cv(page)).shown, '帯の内側・横に 10').toBe(true); await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    await down(page, 780, 300); await adv(page, 32); expect((await cv(page)).shown, '帯の内側・押しただけ').toBe(false); await page.mouse.up(); await finishAll(page); expect((await cv(page)).busy).toBe(false);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); // 短いタップは時間軸の仮枠（直接入力）になるので消す
    await down(page, 840, 200); await adv(page, 32); expect((await cv(page)).shown, '辺').toBe(true); expect((await cv(page)).dir).toBe('forward'); await page.mouse.up(); await finishAll(page);
    await down(page, 40, 200); await adv(page, 32); expect((await cv(page)).dir, '左の辺').toBe('backward');
    await moves(page, [[28, 200, 16]]); expect((await cv(page)).dir, '左の辺から左へ＝前へ').toBe('forward'); await page.mouse.up(); await finishAll(page);
  });

  test('10pt で決める。横 ≥ 縦×0.7 なら横（斜めでもめくる）。縦が大きければ縦スクロール（最後まで横に乗り換えない）', async ({ page }) => {
    await land(page); await manual(page);
    await down(page, 840, 300);
    await moves(page, [[840, 306, 16]]); expect((await cv(page)).started).toBe(false);
    await moves(page, [[838, 330, 16]]); // 縦が大きい
    await moves(page, [[700, 340, 16], [500, 340, 16]]); // 後から横に大きく動いても乗り換えない
    await page.mouse.up(); await adv(page, 800);
    const s = await cv(page); expect(s.started).toBeFalsy(); expect(s.busy).toBe(false); expect(s.canvas).toBe(true); expect(s.shown).toBe(false);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    // 斜め（横 9・縦 12 → 9 ≥ 12×0.7）：めくる
    await down(page, 800, 300); await moves(page, [[791, 312, 16]]); expect((await cv(page)).started, '斜め').toBe(true);
    await page.mouse.up(); await finishAll(page);
    // 縦寄り（横 6・縦 12 → 6 < 8.4）：めくらない
    await down(page, 800, 300); await moves(page, [[794, 312, 16]]); expect((await cv(page)).started, '縦寄り').toBeFalsy();
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('境目 x668.25：離したときそれより左なら進む（右なら戻る）。2日進む。中ほど・反対の端からも、指についてくる', async ({ page }) => {
    await land(page); await manual(page);
    const m = await page.evaluate(() => __duoCurl.metrics()); expect((m.spine + m.edge) / 2).toBe(668.25);
    // 紙の端 ＝ ページの端 − 持ち上げ分 + (指 − 押した指)×k。k＝めくる幅 731 ÷ 押した所から反対側の端までの距離（1〜3）
    const kF = (x0) => Math.min(3, Math.max(1, 731 / (x0 - 20))), kB = (x0) => Math.min(3, Math.max(1, 731 / (851 - x0)));
    const fx = (x0, f) => x0 + (f - 851) / kF(x0);
    await down(page, 840, 300); await slowTo(page, 820, fx(840, 668.25 + 14));
    expect((await cv(page)).f[0]).toBeGreaterThan(668.25); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '境目の右で離すと戻る').toEqual(['11月12日（木）', '11月13日（金）']);
    await down(page, 840, 300); await slowTo(page, 820, fx(840, 668.25 - 12));
    expect((await cv(page)).f[0]).toBeLessThan(668.25); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '境目の左で離すと進む（2日）').toEqual(['11月14日（土）', '11月15日（日）']);
    // ページの中ほど（x600）から：紙はページの端から、指の動き×k
    await down(page, 600, 300); await moves(page, [[590, 300, 16]]); expect((await cv(page)).f[0], '決めた瞬間の紙は端の近く').toBeGreaterThan(820);
    await slowTo(page, 590, fx(600, 668.25 - 12));
    expect((await cv(page)).f[0]).toBeLessThan(668.25); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '中ほどからでも進む').toEqual(['11月16日（月）', '11月17日（火）']);
    // 反対の端（左ページ x150）から左へ：前へ。k＝3
    await down(page, 150, 300); await slowTo(page, 140, 150 - (182.75 + 12) / 3);
    expect((await cv(page)).f[0]).toBeLessThan(668.25); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '反対の端からでも進む').toEqual(['11月18日（水）', '11月19日（木）']);
    // 戻り：左の端から（k＝1）。境目は (120+485.5)/2 = 302.75
    await down(page, 40, 300); await slowTo(page, 60, 40 + 182.75 - 12);
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '戻りの境目の手前で離すと戻らない').toEqual(['11月18日（水）', '11月19日（木）']);
    await down(page, 40, 300); await slowTo(page, 60, 40 + 182.75 + 12);
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '戻る（2日）').toEqual(['11月16日（月）', '11月17日（火）']);
    // 戻り：右ページ x700 から右へ（k＝731/151 → 3）
    await down(page, 700, 300); await slowTo(page, 710, 700 + (182.75 + 12) / kB(700));
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '右ページからでも戻る').toEqual(['11月14日（土）', '11月15日（日）']);
  });

  test('速い払い：押してから 280ms 以内に 36pt 以上めくる向きへ動かして離すと進む（短くても）', async ({ page }) => {
    await land(page); await manual(page);
    await down(page, 800, 300); await moves(page, [[788, 300, 40], [770, 300, 40], [760, 300, 40]]); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '前へ').toEqual(['11月14日（土）', '11月15日（日）']);
    await down(page, 60, 300); await moves(page, [[72, 300, 40], [90, 300, 40], [100, 300, 40]]); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), '戻り').toEqual(['11月12日（木）', '11月13日（金）']);
    // ゆっくり 40pt（400ms 以上）で止めて離す：進まない
    await down(page, 800, 300); await moves(page, [[788, 300, 200], [770, 300, 200], [760, 300, 200]]); await adv(page, 200); await page.mouse.up(); await finishAll(page);
    expect(await heads(page), 'ゆっくりは戻る').toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('500pt/秒以上の払いは位置にかかわらずその向き', async ({ page }) => {
    await land(page); await manual(page);
    // 前へ：境目の右（f > 668.25）で止めても、左へ 500pt/秒以上で離せば進む
    await down(page, 840, 300);
    await moves(page, [[820, 300, 16], [800, 300, 16], [780, 300, 16], [760, 300, 16], [740, 300, 16]]); // 1250pt/秒
    expect((await cv(page)).f[0]).toBeGreaterThan(668.25); expect((await cv(page)).vx).toBeLessThan(-500);
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    // 前へ：境目の左（f < 668.25）まで引いても、右へ 500pt/秒以上で離せば戻る
    await down(page, 840, 300);
    await moves(page, [[820, 300, 600], [640, 300, 600], [560, 300, 600], [572, 300, 16], [584, 300, 16], [596, 300, 16]]); // 位置は境目の左（f≈627）のまま、右へ 500pt/秒超
    expect((await cv(page)).f[0]).toBeLessThan(668.25); expect((await cv(page)).vx).toBeGreaterThan(500);
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    // 戻り：位置は手前でも右へ払えば戻る
    await down(page, 40, 300); await moves(page, [[60, 300, 16], [80, 300, 16], [100, 300, 16], [120, 300, 16], [140, 300, 16]]);
    await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('時間：めくり切り 0.30 秒・戻り 0.22 秒・着地 0.15 秒。18.3：左の帯の入れ替えはしない（stripMix は 0 のまま）', async ({ page }) => {
    await land(page); await manual(page);
    const sample = async (ms, step = 16) => { const out = []; for (let t = 0; t < ms; t += step) { await adv(page, step); out.push(await cv(page)); } return out; };
    // 前へ（めくり切る）
    await down(page, 840, 300); await slowTo(page, 820, 560); await moves(page, [[559, 300, 600]]); await page.mouse.up();
    const f = await sample(320, 16);
    const mix = f.map((s) => s.land?.stripMix ?? 0); for (const m of mix) expect(m, '前へ stripMix').toBe(0);
    const iLand = f.findIndex((s) => s.land?.Lnew === 1);
    expect(iLand * 16 + 16, `Lnew=1 になるのは 0.30 秒`).toBeGreaterThanOrEqual(288); expect(iLand * 16 + 16).toBeLessThanOrEqual(320);
    expect(f[iLand].mapW, '着地で紙は左ページの幅').toBe(1); expect(f[iLand].land.showMul).toBe(0); expect(f[Math.max(0, iLand - 3)].land.showMul, '透かしは 0.30 秒の後ろ 40% で消える').toBeGreaterThan(0);
    await adv(page, 100); const mid = await cv(page); expect(Number(mid.opacity)).toBeGreaterThan(0); expect(Number(mid.opacity)).toBeLessThan(1);
    await adv(page, 100); expect((await cv(page)).busy).toBe(false);
    // 戻る（めくり切らない）0.22 秒
    await down(page, 840, 300); await slowTo(page, 820, 700); await page.mouse.up();
    await adv(page, 192); expect((await cv(page)).shown, '0.19 秒ではまだ動いている').toBe(true);
    await adv(page, 64); expect((await cv(page)).busy, '0.26 秒で終わる').toBe(false);
    // 戻り（backward）：左の帯の入れ替えはしない
    await down(page, 40, 300); await slowTo(page, 60, 60 + 200); await page.mouse.up();
    const b = await sample(160, 16); const bm = b.map((s) => s.land?.stripMix ?? 0); for (const m of bm) expect(m, '戻り stripMix').toBe(0);
    await finishAll(page);
  });

  for (const [dn, x0, path] of [['前へ・端からゆっくり', 840, [[820, 300, 16], [600, 300, 400], [400, 300, 300]]], ['前へ・中ほどから払う', 660, [[640, 300, 16], [520, 300, 48]]], ['戻り・端からゆっくり', 20, [[40, 300, 16], [400, 300, 500], [700, 300, 300]]], ['戻り・払う', 30, [[60, 300, 16], [240, 300, 48]]]]) {
    test(`18.3 着地（${dn}）：紙は傾き 0 で左右のページにぴったり重なり、DOM へ戻した後と同じ絵（CB-1〜5）`, async ({ page }) => {
      await land(page); await manual(page);
      const rects = [[10, 4, 60, 30], [10, 80, 120, 120], [300, 80, 120, 120], [440, 4, 24, 400], [500, 4, 60, 30], [640, 80, 120, 120]].map(([x, y, w, h]) => ({ x, y, w, h }));
      const grab = () => page.evaluate((rects) => rects.map((r) => { const q = __duoCurl.probe(r), d = q.data, out = []; for (let i = 0; i < d.length; i += 16) out.push(d[i], d[i + 1], d[i + 2], 255); return out; }), rects);
      await down(page, x0, 300); await moves(page, path); await page.mouse.up();
      let last = null, after = null, st;
      for (let i = 0; i < 60; i++) { await adv(page, 16); st = await cv(page); if (!st.shown) break; if (st.land.Lnew === 1 && st.land.Rnew === 1 && !after) { after = await grab(); break; } if (st.land.showMul > 0) { last = { g: await grab(), mapW: st.mapW, f: st.f }; } }
      expect(last, '着地前のこま').not.toBeNull(); expect(after, '入れ替え後のこま').not.toBeNull();
      expect(last.mapW, '紙の幅').toBeGreaterThan(0.99);
      for (let k = 0; k < rects.length; k++) { const a = last.g[k], c = after[k]; let mx = 0, n = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - c[i]), Math.abs(a[i + 1] - c[i + 1]), Math.abs(a[i + 2] - c[i + 2])); if (d > 48) n++; mx = Math.max(mx, d); } expect(n / (a.length / 4), `枠 ${k} の食い違い（最大 ${mx}）`).toBeLessThan(0.03); }
      await finishAll(page);
    });
  }

  test('18.2 めくり中に次のページが見える：下は次の右（前へ）、裏は次の左。着地の前後で絵が変わらず、着地後は次の見開き', async ({ page }) => {
    await land(page); await manual(page);
    const params = await page.evaluate(async () => { const p = await import('/js/curl/params.js'); return { nextOnBack: p.K.nextOnBack, show: p.K.show }; });
    expect(params).toEqual({ nextOnBack: 1, show: 0.16 });
    const lum = (page, rect) => page.evaluate((rect) => { const q = __duoCurl.probe(rect).data; let mn = 255; for (let i = 0; i < q.length; i += 4) { const l = (q[i] * 299 + q[i + 1] * 587 + q[i + 2] * 114) / 1000; if (l < mn) mn = l; } return mn; }, rect);
    // 中ほど（x660）から左へ引いて止める。f≈531：紙は x531〜 で巻き、右ページの右寄り（x700〜）は下の次の右（15日 11:00〜12:30 の予定）が見える
    await down(page, 660, 300); await moves(page, [[648, 300, 16]]); await slowTo(page, 648, 400);
    const s1 = await cv(page); expect(s1.land.Rnew, '下の右は次の右').toBe(1); expect(s1.land.Lnew).toBe(0);
    const under = await lum(page, { x: 760, y: 290, w: 40, h: 20 }); // 15日の予定の枠（13日のこの時刻は空）
    expect(under, '下に次の日（15日）の予定').toBeLessThan(235);
    const under2 = await lum(page, { x: 760, y: 225, w: 40, h: 10 }); // 13日の予定（10:00〜11:00）の所は、15日では空
    expect(under2, '下に今の日（13日）の予定は出ない').toBeGreaterThan(235);
    await page.mouse.up();
    // 着地まで：紙の裏（x130〜470）の 14日 9:30〜10:30 の予定の所は、裏に描かれた次の左。着地の前後で同じ
    const seq = [];
    for (let i = 0; i < 40; i++) { await adv(page, 16); const st = await cv(page); if (!st.shown) break; seq.push({ L: st.land.Lnew, v: await lum(page, { x: 300, y: 200, w: 20, h: 20 }) }); }
    const pre = seq.filter((q) => !q.L).slice(-3), post = seq.filter((q) => q.L);
    expect(pre.length).toBeGreaterThan(0); expect(post.length).toBeGreaterThan(0);
    for (const q of [...pre, ...post]) expect(Math.abs(q.v - post[0].v), '着地の前後で絵が変わらない').toBeLessThan(6);
    expect(post[0].v, '14日の予定の枠').toBeLessThan(235);
    await finishAll(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    expect((await cv(page)).shown).toBe(false);
  });
});

test.describe('操作の取り合い', () => {
  test('予定のタップで編集が開く。予定の枠の上からでも横に動かせばめくる（角は持ち上げない）。つまみの上からは始めない', async ({ page }) => {
    await land(page);
    const b = await page.locator('.dpage.rp .tlev').first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right }; });
    const x = Math.min(b.r - 2, 830), y = b.y + b.h / 2;
    // 押しただけでは何も出ない（タップで開く物の上）。横に動かすとめくりが始まり、戻せば日は変わらない
    await down(page, x, y); expect((await cv(page)).shown, '予定の枠の上・押しただけ').toBe(false);
    await moves(page, [[x - 30, y, 0]]); expect((await cv(page)).shown, '予定の枠の上から横へ').toBe(true);
    await moves(page, [[x, y, 0]]); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(500);
    await expect(page.locator('#editor'), 'めくったあとは開かない').toBeHidden();
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    // 予定のタップ（帯の中）で編集
    await page.mouse.click(x, y); await expect(page.locator('#editor')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#editor')).toBeHidden();
    const gb = await page.locator('.dpage.rp .dgrip').evaluate((e) => { const r = e.getBoundingClientRect(); return { y: r.y + r.height / 2 }; });
    await down(page, 840, gb.y); await moves(page, [[800, gb.y, 0], [700, gb.y, 0]]); expect((await cv(page)).shown, 'つまみの上').toBeFalsy(); await page.mouse.up();
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    // 予定のタップで編集（左）
    await page.locator('.dpage.lp .tlev').first().click();
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('時間の目盛り（左ページの左端）の上からも戻りを始められる', async ({ page }) => {
    await land(page); await manual(page);
    const gx = await page.evaluate(() => { const e = document.querySelector('.dpage.lp .gutter'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(24, r.x + r.width / 2), y: r.y + 120, ok: r.width > 0 }; });
    const at = gx?.ok ? gx : { x: 40, y: 300 };
    const t = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.className : ''; }, [at.x, at.y]);
    await down(page, at.x, at.y); await moves(page, [[at.x + 20, at.y, 16]]); expect((await cv(page)).shown, `目盛りの上（${t}）`).toBe(true); expect((await cv(page)).dir).toBe('backward');
    await page.mouse.up(); await finishAll(page);
  });

  test('つまみを引いてもめくらない（めくっている間はつまみも動かない）', async ({ page }) => {
    await land(page); await manual(page);
    const g = await page.locator('.dpage.lp .dgrip').evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x + 60, y: r.y + 12 }; });
    await down(page, g.x, g.y); await moves(page, [[g.x, g.y + 40, 16], [g.x, g.y + 80, 16]]); await page.mouse.up();
    expect((await cv(page)).canvas).toBe(false);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    // めくっている間は、つまみを動かせない
    await down(page, 840, 300); await slowTo(page, 820, 560); await page.mouse.up(); // 離したあとの動き
    const sp0 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).ttSplit, UI);
    await page.evaluate(() => { const g = document.querySelector('.dpage .dgrip'), r = g.getBoundingClientRect(); g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.x + 50, clientY: r.y + 12 })); window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: r.x + 50, clientY: r.y + 90, bubbles: true })); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: r.x + 50, clientY: r.y + 90, bubbles: true })); });
    await finishAll(page);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).ttSplit, UI)).toBe(sp0);
  });

  test('長押し 350ms で予定のなぞる入力になり、めくりは止まる（日は変わらない）', async ({ page }) => {
    await land(page, { events: null }); // 空の欄（端の x829 は時間軸の列の中）
    await page.mouse.move(829, 250); await page.mouse.down();
    await page.waitForFunction(() => __duoCurl.state().shown); // 端に触れて角が上がる
    await page.waitForTimeout(520); // 350ms の長押しが確定 → めくりを cancel()（0.22 秒で戻る）
    await page.waitForFunction(() => !__duoCurl.state().busy, null, { timeout: 3000 });
    await page.mouse.move(700, 330, { steps: 4 }); await page.mouse.up();
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    expect((await cv(page)).shown).toBe(false);
  });

  test('18.2 iOS の縦スクロールとの取り合い：縦寄りの動きは止めない（本物のスクロール）。横寄りだけ先取りし、そのあと縦なら代わりに動かして慣性で滑らせる', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Touch の組み立ては Chromium だけで試す');
    await land(page);
    const r = await page.evaluate(async () => {
      const x = 600, y = 300, t = document.elementFromPoint(x, y), tl = t.closest('.tl');
      const P = (n, cx, cy) => t.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, composed: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: 1 }));
      const T = (cx, cy) => { const e = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 5, target: t, clientX: cx, clientY: cy })], changedTouches: [new Touch({ identifier: 5, target: t, clientX: cx, clientY: cy })] }); t.dispatchEvent(e); return e.defaultPrevented; };
      const out = {};
      P('pointerdown', x, y); out.vert = T(x + 1, y + 4); P('pointermove', x + 1, y + 4); P('pointercancel', x + 1, y + 4); // 縦寄り → ブラウザに任せる（iOS はここで pointercancel）
      P('pointerdown', x, y); out.horiz = T(x - 3, y + 1); P('pointermove', x - 3, y + 1);
      // 先取りしたあと縦と分かった：代わりにスクロール
      const top0 = tl.scrollTop; out.canScroll = tl.scrollHeight > tl.clientHeight;
      for (let i = 1; i <= 6; i++) { const yy = y - 10 * i; T(x - 3, yy); P('pointermove', x - 3, yy); await new Promise((r) => setTimeout(r, 16)); }
      out.dragged = tl.scrollTop - top0; P('pointerup', x - 3, y - 60);
      const top1 = tl.scrollTop; await new Promise((r) => setTimeout(r, 300)); out.glided = tl.scrollTop - top1;
      return out;
    });
    expect(r.vert, '縦寄りは preventDefault しない').toBe(false);
    expect(r.horiz, '横寄りは先取り').toBe(true);
    expect(r.canScroll).toBe(true);
    expect(r.dragged, '代わりにスクロール').toBeGreaterThan(30);
    expect(r.glided, '離したあと慣性で滑る').toBeGreaterThan(10);
    expect((await cv(page)).started).toBeFalsy();
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('2本目の指で中止し、元へ戻す（日は進まない）', async ({ page }) => {
    await land(page); await manual(page);
    await page.evaluate(() => {
      const t = document.elementFromPoint(840, 300), fire = (n, x, y, o = {}) => t.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1, ...o }));
      fire('pointerdown', 840, 300); __duoCurl.advance(16); fire('pointermove', 800, 300); __duoCurl.advance(16); fire('pointermove', 640, 300);
      fire('pointerdown', 400, 300, { pointerId: 2, isPrimary: false }); // 2本目
    });
    const s = await cv(page); expect(s.released).toBe(true); expect(s.done).toBe(false);
    await adv(page, 192); expect((await cv(page)).shown).toBe(true);
    await adv(page, 64); expect((await cv(page)).busy).toBe(false);
    await page.evaluate(() => { const t = document.body; t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 640, clientY: 300 })); });
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('pointercancel（ブラウザが縦を取った）：めくり切らずに戻す。始まっていなければ何もしない', async ({ page }) => {
    await land(page); await manual(page);
    await page.evaluate(() => {
      const t = document.elementFromPoint(840, 300), fire = (n, x, y) => t.dispatchEvent(new PointerEvent(n, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 }));
      fire('pointerdown', 840, 300); __duoCurl.advance(16); fire('pointermove', 800, 300); __duoCurl.advance(16); fire('pointermove', 600, 300); fire('pointercancel', 600, 300);
    });
    await adv(page, 400); expect((await cv(page)).busy).toBe(false);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('めくっている間に render() が走っても canvas は消えず、日はずれない／終わったあと DOM は新しい内容', async ({ page }) => {
    await land(page); await manual(page);
    await down(page, 840, 300); await slowTo(page, 820, 560); await page.mouse.up(); // 離した（日はもう ±2）
    await adv(page, 100);
    // 予定が変わって再描画
    await page.evaluate(async () => { const m = await import('/js/db.js'); const e = (await m.getAllEvents?.()) ?? []; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('resize')); });
    const s = await cv(page); expect(s.canvas).toBe(true); expect(s.shown).toBe(true);
    await finishAll(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    await expect(page.locator('.dpage.lp .tlev')).toContainText('十四日の予定');
  });
});

test.describe('幅の変化・隠れた・WebGL なし・視差効果を減らす', () => {
  test('幅の変化（951→890）で止まり、元に戻る（日は進めない）。テクスチャ 0。作り直せる', async ({ page }) => {
    await land(page); await manual(page);
    await down(page, 840, 300); await moves(page, [[800, 300, 16], [700, 300, 16]]);
    expect((await cv(page)).textures).toBe(4);
    await page.setViewportSize(SIZES.openLandscape);
    await page.waitForFunction(() => !__duoCurl.state().canvas, null, { timeout: 4000 });
    const s = await cv(page); expect(s.textures).toBe(0); expect(s.busy).toBe(false); expect(s.stats.live).toBe(0); expect(s.stats.made).toBe(s.stats.freed);
    await page.mouse.up(); await setSafe(page, 84); await page.waitForTimeout(100);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    await expect(page.locator('canvas.curlcv')).toHaveCount(0);
    // 新しい幅でまた使える
    const m = await page.evaluate(() => __duoCurl.metrics()); await manual(page);
    await down(page, m.edge - 10, 300); await slowTo(page, m.edge - 30, m.edge - 30 - 190); await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
  });

  test('隠れた（visibilitychange）ら絵を全部捨てる', async ({ page }) => {
    await land(page); await manual(page);
    await down(page, 840, 300); await moves(page, [[800, 300, 16]]);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const s = await cv(page); expect(s.textures).toBe(0); expect(s.canvas).toBe(false); expect(s.stats.live).toBe(0);
    await page.mouse.up();
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('視差効果を減らす：めくらない。前へ・戻りを交互に 6 回、毎回 2 日・canvas は出ない', async ({ page }) => {
    await land(page, { reduce: true });
    expect((await cv(page)).mode).toBe('reduce');
    const want = [['11月14日（土）', '11月15日（日）'], ['11月12日（木）', '11月13日（金）']];
    for (let i = 0; i < 6; i++) {
      const fwd = i % 2 === 0;
      if (fwd) await swipe(page, { x0: 840, y0: 250, dx: -330 }); else await swipe(page, { x0: 40, y0: 250, dx: 340 });
      expect(await heads(page), `${i + 1} 回目`).toEqual(want[fwd ? 0 : 1]);
      expect(await page.locator('canvas.curlcv').count(), 'canvas は出ない').toBe(0);
      await expect(page.locator('.curlcopy')).toHaveCount(1); // 今の見開きの写し（0.15 秒で薄くなる）
      await page.waitForFunction(() => !__duoCurl.state().busy && !document.querySelector('.curlcopy'));
    }
    // 18.2：ページの中ほどからの横スワイプでも送る（入れ替え）
    await swipe(page, { x0: 700, y0: 250, dx: -200 });
    await page.waitForFunction(() => !__duoCurl.state().busy && !document.querySelector('.curlcopy'));
    expect(await heads(page)).toEqual(want[0]);
  });

  test('WebGL なし：めくりの部品を作らず、端に限らない横すべりで ±2 日（0.25 秒）', async ({ page }) => {
    await land(page, { noGl: true });
    const s = await cv(page); expect(s.mode).toBe('slide'); expect(s.canvas).toBe(false);
    const t0 = Date.now(); await swipe(page, { x0: 700, y0: 250, dx: -160 }); const dt = Date.now() - t0;
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    expect(dt, `${dt}ms`).toBeGreaterThanOrEqual(200); expect(dt).toBeLessThan(600);
    await swipe(page, { x0: 300, y0: 250, dx: 160 });
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    await expect(page.locator('canvas.curlcv')).toHaveCount(0);
  });

  test('コンテキスト消失（WEBGL_lose_context）：めくり中は元へ戻り日はずれない。復帰後にまた使える。1分に2回で横すべりへ', async ({ page }) => {
    await land(page); await manual(page);
    await down(page, 840, 300); await slowTo(page, 820, 560);
    await page.evaluate(() => __duoCurl.loseContext());
    await page.waitForFunction(() => __duoCurl.state().lost);
    const s = await cv(page); expect(s.shown).toBe(false); expect(s.textures).toBe(0); expect(s.mode).toBe('slide'); // 失われている間は横すべり
    await page.mouse.up(); await adv(page, 800);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    await page.evaluate(() => __duoCurl.restoreContext());
    await page.waitForFunction(() => !__duoCurl.state().lost);
    expect((await cv(page)).mode).toBe('curl');
    await down(page, 840, 300); await slowTo(page, 820, 560); await page.mouse.up(); await finishAll(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    // 2 回目の消失（1 分以内）→ この起動中は横すべり
    await down(page, 840, 300); await moves(page, [[800, 300, 16]]);
    await page.evaluate(() => __duoCurl.loseContext());
    await page.waitForFunction(() => __duoCurl.state().failed);
    await page.mouse.up();
    expect((await cv(page)).mode).toBe('slide');
    await swipe(page, { x0: 700, y0: 250, dx: -160 });
    expect(await heads(page)).toEqual(['11月16日（月）', '11月17日（火）']);
  });

  test('DARK.enabled は false のまま：ダークの端末でもめくりはライト（紙 #FFFDFA）', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await land(page); await manual(page);
    expect(await page.evaluate(async () => (await import('/js/curl/params.js')).DARK.enabled)).toBe(false);
    await page.evaluate(() => __duoCurl.pose('forward', 300, [640, 300], { plain: true }));
    const px = await page.evaluate(() => { const r = __duoCurl.probe({ x: 500, y: 100, w: 4, h: 4 }); return [...r.data.slice(0, 3)]; });
    expect(px).toEqual([255, 253, 250]);
  });
});

// ---- 紙の形・影・光（アプリの寸法で再確認：CS-15〜18）----
const b64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const lum = (px, i) => (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
const pose = (page, dir, gy, f, o = {}) => page.evaluate(([dir, gy, f, o]) => { const r = __duoCurl.pose(dir, gy, f, o); return r && { f: r.f, shape: r.shape }; }, [dir, gy, f, o]);
const probe = (page, rect) => page.evaluate((rect) => { const r = __duoCurl.probe(rect), u = r.data; let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return { w: r.width, h: r.height, b64: btoa(s) }; }, rect);
function erode(a, w, h, k = 4) {
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 1; for (let i = Math.max(0, x - k); i <= Math.min(w - 1, x + k); i++) if (!a[y * w + i]) { v = 0; break; } t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 1; for (let j = Math.max(0, y - k); j <= Math.min(h - 1, y + k); j++) if (!t[j * w + x]) { v = 0; break; } o[y * w + x] = v; }
  return o;
}
function scan2nd(img, mask, w, h, P, n) { // cs16_scan.py と同じ（面の色分けの内側だけで 1pt おきの輝度の2階差）
  const red = new Uint8Array(w * h), grn = new Uint8Array(w * h), L = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) { const r = mask[i * 4], g = mask[i * 4 + 1], b = mask[i * 4 + 2]; red[i] = r > 200 && g < 60 && b < 60 ? 1 : 0; grn[i] = g > 200 && r < 60 && b < 60 ? 1 : 0; L[i] = Math.round(lum(img, i * 4)); }
  const er = erode(red, w, h), eg = erode(grn, w, h); let paperPx = 0, bad = 0, badOutside = 0, max2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 4; x++) {
    const i = y * w + x; if (!(((er[i + 2] | eg[i + 2]) && (er[i] | eg[i]) && (er[i + 4] | eg[i + 4])))) continue;
    paperPx++;
    const d1a = L[i + 2] - L[i], d1b = L[i + 4] - L[i + 2], d2 = Math.abs(d1b - d1a); max2 = Math.max(max2, d2);
    if (d2 > 4) { bad++; const dist = Math.abs((x + 2) / 2 * n[0] + y / 2 * n[1] - (P[0] * n[0] + P[1] * n[1])); if (!(dist <= 11 && er[i + 2])) badOutside++; }
  }
  return { paperPx, max2, bad, badOutside };
}
const POSES = [['1-start', [846, 602]], ['2-quarter', [690, 575]], ['3-half', [520, 540]], ['4-3q', [350, 520]], ['5-before', [230, 570]]];
const toApp = (f, d) => [f[0] + (d.edge - 860), f[1] + (d.py1 - 661)]; // curl-v1 の座標から右下の角からの位置をそろえて写す

test.describe('紙の形・影・光（アプリの寸法・WebGL）', () => {
  for (const [dn, size] of [['951×669', SIZES.openLandscape951], ['890×626', SIZES.openLandscape]]) {
    test(`CS-15 紙の形（アプリ ${dn}）：進む・戻る各 700 点＋格子 420 点で外れ 0、傾き ≤ 35°`, async ({ page }) => {
      await land(page); if (size !== SIZES.openLandscape951) { await page.setViewportSize(size); await setSafe(page, 84); await page.waitForTimeout(200); }
      const m = await page.evaluate(() => __duoCurl.metrics());
      const r = await page.evaluate(async (m) => {
        const { makeSet, clampF, shape, deform } = await import('/js/curl/geom.js'), { TUNE } = await import('/js/curl/params.js'), set = makeSet(m), res = {};
        for (const dir of ['forward', 'backward']) {
          const s = set[dir], d = m, out = { points: 0, maxSpineMove: 0, maxEdgeErr: 0, maxTilt: 0, foldLeftOfSpine: 0, cornerFar: 0 };
          const ys = [...Array(10)].map((_, i) => d.py0 + (d.py1 - d.py0) * (i + 0.5) / 10), xs = [...Array(10)].map((_, i) => s.x0 + (s.x1 - s.x0) * (i + 0.5) / 10);
          const fingers = []; for (const y of ys) for (const x of xs) fingers.push([x, y]);
          for (const y of ys) for (const x of [s.edge - s.sgn * 900, s.edge - s.sgn * 600]) fingers.push([x, y + 300], [x, y - 300]);
          const jobs = []; for (const gy of [d.py0 + 1, (d.py0 + d.py1) / 2, d.py1 - 1, d.py0 + 112, d.py0 + 532]) for (const fp of fingers) jobs.push([gy, fp]);
          for (let j = 0; j < 20; j++) for (let i = 0; i < 21; i++) jobs.push([d.py0 + (d.py1 - d.py0) * (((j * 7 + i) % 20) + 0.5) / 20, [s.x0 + (s.x1 - s.x0) * i / 20, d.py0 + (d.py1 - d.py0) * (j + 0.5) / 20]]);
          for (const [gy, fp] of jobs) {
            const g = [s.edge, gy], f = clampF(s, g, fp), sh = shape(s, g, f); out.points++; if (!sh) continue;
            for (let k = 0; k <= 50; k++) { const S = [s.spine, d.py0 + (d.py1 - d.py0) * k / 50], q = deform(sh, S); out.maxSpineMove = Math.max(out.maxSpineMove, Math.hypot(q[0] - S[0], q[1] - S[1], q[2])); }
            const edges = [[[s.x0, d.py0], [s.x1, d.py0]], [[s.x1, d.py0], [s.x1, d.py1]], [[s.x1, d.py1], [s.x0, d.py1]], [[s.x0, d.py1], [s.x0, d.py0]], [[s.x0, d.py0], [s.x1, d.py1]]];
            for (const [a, b] of edges) { let len = 0, prev = deform(sh, a); for (let k = 1; k <= 800; k++) { const X = [a[0] + (b[0] - a[0]) * k / 800, a[1] + (b[1] - a[1]) * k / 800], q = deform(sh, X); len += Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q; } const L0 = Math.hypot(b[0] - a[0], b[1] - a[1]); out.maxEdgeErr = Math.max(out.maxEdgeErr, Math.abs(len - L0) / L0); }
            for (const sy of [d.py0, d.py1]) if ((s.spine - sh.P[0]) * sh.n[0] + (sy - sh.P[1]) * sh.n[1] > 0.01) out.foldLeftOfSpine++;
            const c = deform(sh, g); for (const sy of [d.py0, d.py1]) if (Math.hypot(c[0] - s.spine, c[1] - sy) > Math.hypot(g[0] - s.spine, g[1] - sy) + 0.01) out.cornerFar++;
            if (Math.hypot(c[0] - s.spine, c[1] - g[1]) > (s.x1 - s.x0) + 0.01) out.cornerFar++;
            out.maxTilt = Math.max(out.maxTilt, Math.abs(Math.atan2(sh.n[1], Math.abs(sh.n[0])) * 180 / Math.PI));
          }
          out.pass = out.maxSpineMove < 0.01 && out.maxEdgeErr < 0.002 && out.foldLeftOfSpine === 0 && out.cornerFar === 0 && out.maxTilt <= TUNE.maxTilt + 0.01; res[dir] = out;
        }
        return res;
      }, m);
      test.info().annotations.push({ type: `CS-15 ${dn}`, description: JSON.stringify({ m, ...r }) });
      for (const dir of ['forward', 'backward']) { expect(r[dir].points, dir).toBe(1120); expect(r[dir].pass, dir).toBe(true); expect(r[dir].maxTilt).toBeLessThanOrEqual(35.01); }
      expect(m.py1 - m.py0).toBeGreaterThan(500);
    });
  }

  test('CS-16 plain の5姿勢（dpr 2）：2階差がしきい値（4 段）を超える所 0（アプリの中の canvas）', async ({ page, browserName }) => {
    await land(page); await manual(page);
    const m = await page.evaluate(() => __duoCurl.metrics());
    for (const [name, f0] of POSES) {
      const f = toApp(f0, m), gy = 600 + (m.py1 - 661), rect = { x: 0, y: 0, w: m.edge, h: m.py1 };
      await pose(page, 'forward', gy, f, { plain: true, k: { backLine: 0, debug: 0 } }); const a = await probe(page, rect);
      const mk = await pose(page, 'forward', gy, f, { plain: true, k: { backLine: 0, debug: 1 } }); const mm = await probe(page, rect);
      const r = scan2nd(b64(a.b64), b64(mm.b64), a.w, a.h, mk.shape.P, mk.shape.n);
      test.info().annotations.push({ type: `${browserName} CS-16 ${name}`, description: JSON.stringify(r) });
      expect(r.paperPx).toBeGreaterThan(100000); expect(r.badOutside, name).toBe(0);
    }
  });

  async function rootProfile(page, dark, gy, f) {
    const rect = { x: 640, y: 100, w: 211, h: 440 }, shots = {};
    for (const [tag, k] of [['on', {}], ['off', { rootA0: 0 }]]) {
      const r = await pose(page, 'forward', gy, f, { plain: true, dark, k: { backLine: 0, debug: 0, rootA0: 0.12, ...k } }); const p = await probe(page, rect); shots[tag] = { px: b64(p.b64), w: p.w, P: r.shape.P, n: r.shape.n, lift: r.shape.lift };
    }
    const { P, n, lift, w } = shots.on, mean = (px, x, y) => { let s = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += lum(px, ((Math.round(2 * (y - rect.y)) + j) * w + Math.round(2 * (x - rect.x)) + i) * 4); return s / 9; };
    const at = (s) => { let t = 0; for (let k = -4; k <= 4; k++) { const cx = P[0] - n[1] * 4 * k + n[0] * s, cy = P[1] + n[0] * 4 * k + n[1] * s; t += (1 - mean(shots.on.px, cx, cy) / Math.max(1, mean(shots.off.px, cx, cy))) * 100; } return t / 9; };
    return { m10: at(-10), m5: at(-5), z: at(0), out: at(9 + lift + 0.5) };
  }
  test('根元の影：ライトは −10pt で 0%・0pt で 12%（11.9% 前後）・巻き側 9＋1×lift で 0。ダーク強制は 12%±1段', async ({ page, browserName }) => {
    await land(page); await manual(page);
    const r = await rootProfile(page, false, 334, [826, 334]);
    test.info().annotations.push({ type: `${browserName} 根元 ライト`, description: JSON.stringify(r) });
    expect(Math.abs(r.m10)).toBeLessThan(0.5); expect(r.z).toBeGreaterThan(11.4); expect(r.z).toBeLessThan(12.4); expect(Math.abs(r.out)).toBeLessThan(0.5);
    const d = await rootProfile(page, true, 334, [826, 334]); const step = 100 / 41;
    test.info().annotations.push({ type: `${browserName} 根元 ダーク強制`, description: JSON.stringify(d) });
    expect(d.z).toBeGreaterThan(12 - step); expect(d.z).toBeLessThan(12 + step); expect(Math.abs(d.m10)).toBeLessThan(step); expect(Math.abs(d.out)).toBeLessThan(step);
  });

  test('CS-18 背の近く：ライトは平らな紙との差 0、ダーク強制は最も明るい所が背景より +24 まで', async ({ page, browserName }) => {
    await land(page); await manual(page);
    const m = await page.evaluate(() => __duoCurl.metrics());
    const pct = (arr, p) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p / 100 * a.length))]; };
    for (const dark of [false, true]) {
      for (const fx of [700, 640, 600, 560, 522]) {
        const r = await pose(page, 'forward', 334, [fx - 9, 334], { plain: true, dark, k: { backLine: 0, debug: 0 } }); const p = await probe(page, { x: 0, y: 0, w: m.edge, h: m.py1 });
        const px = b64(p.b64), W = p.w, x0 = Math.floor(2 * r.f[0]) + 4, x1 = Math.floor(2 * (r.shape.P[0] + r.shape.r)) - 4, paper = [], flat = [];
        for (let y = 120; y < 1200; y++) { for (let x = x0; x < x1; x++) paper.push(Math.round(lum(px, (y * W + x) * 4))); for (let x = 600; x < 880; x++) flat.push(Math.round(lum(px, (y * W + x) * 4))); }
        const v = pct(paper, 75), fl = pct(flat, 75), top = pct(paper, 99.5);
        test.info().annotations.push({ type: `${browserName} CS-18 ${dark ? 'ダーク' : 'ライト'} F=${fx}`, description: `差 ${v - fl}、最明-平ら ${top - fl}` });
        if (!dark) expect(Math.abs(v - fl)).toBeLessThanOrEqual(0.5); else expect(top - fl).toBeLessThanOrEqual(24);
      }
    }
  });
});

// ---- CS-17：着地の前後で文字が動かない。着地後は本物の DOM（ずれ 0） ----
const CMP = `(${function () {
  window.__cmp = {
    imgFrom: async (b64) => { const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return x.getImageData(0, 0, bmp.width, bmp.height); },
    prof(img, y0, y1, x0, x1) { const a = []; for (let y = y0; y < y1; y++) { let s = 0; for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; s += 255 - (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000; } a.push(s); } return a; },
    shift(A, B, range = 6) {
      const n = A.length, ma = A.reduce((s, v) => s + v, 0) / n, mb = B.reduce((s, v) => s + v, 0) / n, a = A.map((v) => v - ma), b = B.map((v) => v - mb);
      const corr = (d) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < n; i++) { const j = i - d; if (j < 0 || j >= n) continue; s += a[i] * b[j]; na += a[i] * a[i]; nb += b[j] * b[j]; } return na && nb ? s / Math.sqrt(na * nb) : 0; };
      let best = 0, bc = -2; const cs = {}; for (let d = -range; d <= range; d++) { cs[d] = corr(d); if (cs[d] > bc) { bc = cs[d]; best = d; } }
      let sub = 0; if (cs[best - 1] != null && cs[best + 1] != null) { const l = cs[best - 1], r = cs[best + 1], den = l - 2 * bc + r; if (den < 0) sub = 0.5 * (l - r) / den; }
      return { d: best + sub, c: bc, energy: A.reduce((s, v) => s + Math.abs(v - ma), 0) };
    },
  };
}.toString()})()`;
async function shot(page, clip) { return (await page.screenshot({ clip })).toString('base64'); }
async function ysOf(page, A, B, regions, clip) {
  return page.evaluate(async ({ A, B, regions, js }) => {
    if (!window.__cmp) new Function(js)();
    const a = await window.__cmp.imgFrom(A), b = await window.__cmp.imgFrom(B), out = {};
    for (const g of regions) { const y0 = Math.round(g.y0 * 2), y1 = Math.min(a.height, b.height, Math.round(g.y1 * 2)), x0 = Math.round(g.x0 * 2), x1 = Math.min(a.width, Math.round(g.x1 * 2)); const s = window.__cmp.shift(window.__cmp.prof(a, y0, y1, x0, x1), window.__cmp.prof(b, y0, y1, x0, x1)); out[g.name] = { dy: s.d / 2, corr: s.c, energy: s.energy }; }
    return out;
  }, { A, B, regions, js: CMP });
}
test.describe('CS-17 着地', () => {
  for (const dir of ['forward', 'backward']) {
    test(`着地した瞬間の絵と、着地後の本物の DOM で 見出し・時間軸の1行目・予定行・ノートの1行目の y が 0.5pt 以内（0.25pt で注意）【${dir === 'forward' ? '前へ' : '戻り'}】`, async ({ page, browserName }) => {
      await land(page, { patch: { selected: dir === 'forward' ? '2026-11-12' : '2026-11-14' } }); await manual(page);
      // 動かしてから離す
      if (dir === 'forward') { await down(page, 840, 300); await slowTo(page, 820, 560); } else { await down(page, 40, 300); await slowTo(page, 60, 60 + 220); }
      await page.mouse.up();
      await page.evaluate(async (dir) => { let n = 0; const key = dir === 'forward' ? 'Lnew' : 'Rnew'; while (__duoCurl.state().land?.[key] !== 1 && n++ < 80) await __duoCurl.advance(16); }, dir);
      const s = await cv(page); expect(s.opacity === '' || s.opacity === '1').toBe(true); expect(s.shown).toBe(true);
      // 左ページ（前へは紙で隠れない左の端 x8〜120、戻りは左ページ全部）
      const x1 = dir === 'forward' ? 120 : 465.5, clip = { x: 8, y: 0, width: x1 - 8, height: 603 };
      const A = await shot(page, clip);
      await finishAll(page); expect((await cv(page)).busy).toBe(false);
      const B = await shot(page, clip);
      const reg = await page.evaluate((w) => {
        const P = document.querySelector('.dpage.lp').getBoundingClientRect(), R = (e, pad = 3) => { const r = e.getBoundingClientRect(); return { y0: r.top - P.top - pad, y1: r.bottom - P.top + pad, x0: 0, x1: w }; }, out = [];
        const lp = document.querySelector('.dpage.lp'), dph = lp.querySelector('.dph'); out.push({ name: '見出し', ...R(dph, 0) });
        const tl = lp.querySelector('.tl'), tr = tl.getBoundingClientRect(), lab = [...lp.querySelectorAll('.hlab')].find((e) => { const r = e.getBoundingClientRect(); return r.top >= tr.top + 2 && r.bottom <= tr.bottom; }); if (lab) out.push({ name: '時間軸の1行目', ...R(lab, 4) });
        [...lp.querySelectorAll('.tlev')].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= tr.top && r.bottom <= tr.bottom; }).slice(0, 2).forEach((e, i) => out.push({ name: `予定行${i + 1}`, ...R(e, 3) }));
        const dn = lp.querySelector('.dnote'); if (dn?.querySelector('.dnt').textContent) { const r = dn.getBoundingClientRect(); out.push({ name: 'ノートの1行目', y0: r.top - P.top - 2, y1: r.top - P.top + 32, x0: 0, x1: w }); }
        return out;
      }, x1 - 8);
      expect(reg.map((r) => r.name)).toEqual(expect.arrayContaining(['見出し', '時間軸の1行目', 'ノートの1行目']));
      const res = await ysOf(page, A, B, reg);
      test.info().annotations.push({ type: `${browserName} CS-17 ${dir}`, description: Object.entries(res).map(([n, v]) => `${n} ${v.dy.toFixed(2)}pt`).join('、') });
      for (const [name, v] of Object.entries(res)) {
        expect(v.energy, `${name} に絵がある`).toBeGreaterThan(300); expect(v.corr, `${name} の相関`).toBeGreaterThan(0.6);
        if (Math.abs(v.dy) > 0.25) test.info().annotations.push({ type: '注意', description: `${dir} ${name} のずれ ${v.dy.toFixed(2)}pt（0.25 超）` });
        expect(Math.abs(v.dy), `${dir} ${name} の y のずれ`).toBeLessThanOrEqual(0.5);
      }
      // 着地後は本物の DOM：もう一度撮っても同じ（ずれ 0）
      const C = await shot(page, clip); const res2 = await ysOf(page, B, C, reg);
      for (const [name, v] of Object.entries(res2)) expect(Math.abs(v.dy), `着地後 ${name}`).toBeLessThan(0.05);
      expect(await heads(page)).toEqual(dir === 'forward' ? ['11月14日（土）', '11月15日（日）'] : ['11月12日（木）', '11月13日（金）']);
    });
  }
});
