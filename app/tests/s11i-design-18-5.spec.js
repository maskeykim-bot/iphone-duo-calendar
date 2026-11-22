// S11i・S11j の受け入れ試験（design/34 §18-5・§18-6・§18-7、2026-11-22 品質。8960267 では「予定のある日の縦の段2」などが落ちるのが正しい）。
// §18-6（15:10）: 1 時間軸で終日ありは D＋描いた終日の行（32）。2 V＝min(描いた高さ,56)（短い予定は最小の高さで描かれても描いた高さ）。3 カード⇔時間軸の引きは一瞬。4 時刻つき 0 件の T＝170 は時間軸だけ、カードは貼らず つまみは終日の欄・予定なしのすぐ下。
// <worktree>/app/tests/ へ写し、npx playwright test s11i-design-18-5.spec.js --workers=2（WebKit は playwright.config の webkit の testMatch に足すか -c で）。
// §18-5: つまみ（下）を貼るのは 日の欄の高さ H ≧ T、外すのは H ＜ T−4。T ＝ D＋V＋G＋41（時刻つきの予定が 0 件の日は 170）。
//   D: 開いたときの位置で日の欄の上端から最初の時刻つきの予定の上端まで（描いた矩形から測る）。V＝min(予定の高さ,56)。G＝帯あり44・帯なし56。
// 値の表（最初の予定が 1 時間以上）: 帯あり 185／221／257／229／285、帯なし 197／233／269／241／297（終日なし／1行／2行／B／C）。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev } from './helpers.js';

const GEO = Object.freeze({ portrait: { width: 466, height: 678 }, landscape: { width: 678, height: 466 } });
const FORMS = Object.freeze({
  '縦・帯あり': { sar: 84, land: false, G: 44, gripTop: 593 },
  '縦・帯なし': { sar: 0, land: false, G: 56, gripTop: 581 },
  '横・帯あり': { sar: 84, land: true, G: 44, gripTop: 381 },
  '横・帯なし': { sar: 0, land: true, G: 56, gripTop: 369 },
});
const T_TABLE = Object.freeze({ 44: { A: [185, 221, 257], B: 229, C: 285 }, 56: { A: [197, 233, 269], B: 241, C: 297 } });
const MODES = Object.freeze({ A: 0, B: 1, C: 2 }); // duo.ui.v1 の dayGrip
// 日: 終日 0／1行／2行 × 時刻つき 0／6件（6件は 1 時間ずつ 9:00〜15:00。B の高さ 44・C 88 → V は 44／56）。
const LONG = ['長い題名の終日の予定その一', '長い題名の終日の予定その二', '長い題名の終日の予定その三', '長い題名の終日の予定その四'];
const DAYS = Object.freeze({
  'ad0-t0': { key: '2026-11-16', ad: [], timed: 0 },
  'ad1-t0': { key: '2026-11-17', ad: ['終日'], timed: 0 },
  'ad2-t0': { key: '2026-11-18', ad: LONG, timed: 0 },
  'ad0-t6': { key: '2026-11-19', ad: [], timed: 6 },
  'ad1-t6': { key: '2026-11-20', ad: ['終日'], timed: 6 },
  'ad2-t6': { key: '2026-11-24', ad: LONG, timed: 6 },
});
// §18-6 の 2: 最初の予定が 15 分以下（時間軸では描いたブロックの高さ、最小の高さを含む、を V に使う）。2 件目からは 1 時間ずつ 10:00〜15:00
const SHORT = Object.freeze({
  'ad0-s15': { key: '2026-11-25', ad: [], timed: 6, first: 15 },
  'ad1-s10': { key: '2026-11-26', ad: ['終日'], timed: 6, first: 10 },
});
const hh = (n) => String(n).padStart(2, '0');
// §18-7 M-1 の組を広げる（d9e7900 の QA）: 最初の予定が 70 分・55 分だと 時間軸 B・終日ありの T が 267〜269 になり、段3（266）が T−4 ≦ H ＜ T に入る（開発の実測 267.33／268.33）
const M1_EXTRA = Object.freeze({
  'ad1-m70': { key: '2026-11-27', ad: ['終日'], timed: 6, len: 70 },
  'ad1-m55': { key: '2026-11-30', ad: ['終日'], timed: 6, len: 55 },
});
const DATA = Object.entries({ ...DAYS, ...SHORT, ...M1_EXTRA }).flatMap(([id, d]) => [
  ...d.ad.map((t, i) => ev(`${id}-a${i}`, t, `${d.key}T00:00`, `${d.key}T23:59`, { all: true })),
  ...Array.from({ length: d.timed }, (_, i) => (i === 0 && d.len ? ev(`${id}-t${i}`, `最初の予定`, `${d.key}T08:00`, `${d.key}T${hh(8 + Math.floor(d.len / 60))}:${hh(d.len % 60)}`) : i === 0 && d.first ? ev(`${id}-t${i}`, `短い予定`, `${d.key}T09:00`, `${d.key}T09:${hh(d.first)}`) : ev(`${id}-t${i}`, `予定${i + 1}`, `${d.key}T${hh(9 + i)}:00`, `${d.key}T${hh(10 + i)}:00`))),
]);
const STAGE_H = { 2: 170, 3: 266, 4: 418 };

async function bootDay(page, form, mode, dayKey, stage, { reduced = false } = {}) {
  const f = FORMS[form];
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((sar) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar}px`)), f.sar);
  await page.addInitScript(({ sel, dg, st }) => { if (sessionStorage.getItem('qa-i')) return; sessionStorage.setItem('qa-i', '1'); localStorage.setItem('duo.ui.v1', JSON.stringify({ home: false, monthForm: 'month', monthDay: 'list', selected: sel, dayGrip: dg, stage: st })); }, { sel: dayKey, dg: MODES[mode], st: stage ?? 4 });
  await openApp(page, GEO.portrait);
  await seed(page, DATA); await page.waitForTimeout(300);
  if (f.land) { await page.setViewportSize(GEO.landscape); await page.waitForTimeout(650); }
  await page.waitForTimeout(300);
}
// 開いたときの位置の様子
const state = (page) => page.evaluate(() => {
  const d = document.querySelector('.mpull.browse .mday') || document.querySelector('.mday'); const g = d.querySelector('.mdgrab'), h = d.querySelector('.mdh'), ad = d.querySelector('.mdad');
  const db = d.getBoundingClientRect(), gb = g.getBoundingClientRect(), hb = h.getBoundingClientRect();
  const evs = [...d.querySelectorAll('.mdcard, .tlev')].map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, card: e.classList.contains('mdcard') }; }).filter((r) => r.h > 0).sort((a, b) => a.top - b.top);
  let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
  return { stage: document.querySelector('.mpull')?.dataset.stage ?? null, dg: d.dataset.dg, H: db.height, paneTop: db.top, paneBottom: db.bottom, st: d.scrollTop, gs: d.classList.contains('gs'), stuck: g.classList.contains('stuck'), pos: getComputedStyle(g).position, op, gripTop: gb.top, gripBottom: gb.bottom, hdrBottom: hb.bottom, adH: ad ? ad.getBoundingClientRect().height : 0, evs, nlTop: d.querySelector('.mdnl')?.getBoundingClientRect().top ?? null, anim: g.getAnimations().length,
    // 時間軸の終日の行（.allday）: 描いた高さ＝時間軸（.tl）の上端 − 終日の行の上端（行 28 ＋ 間 4 ＝ 32）。終日の予定があるか（.adcol の中身）も見る
    tlAd: (() => { const a = d.querySelector('.mdbody > .allday'), tl = d.querySelector('.mdbody > .tl'); if (!a || !tl) return null; const ab = a.getBoundingClientRect(); return { top: ab.top, h: tl.getBoundingClientRect().top - ab.top, has: !!a.querySelector('.adcol > *, .adpill, button') }; })(),
    // カード・時刻つき 0 件: つまみを置く「すぐ上」の物（終日の欄 .mdad か 予定なし .mdnone2 の下端の大きいほう）
    aboveGrip: Math.max(0, ...[...d.querySelectorAll('.mdad, .mdnone2, .mdnone')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.bottom)) };
});
const adRows = (adH) => (adH < 1 ? 0 : adH < 46 ? 1 : 2); // 終日の欄 28（1行）／64（2行）。下の 8 は含まない
// T＝D＋V＋G＋41。§18-6:
//  1 時間軸で終日の予定がある日は、D に描いた終日の行の高さ（32）を足す。開いた位置で終日の行が見出しと最初の予定の間に描かれていれば D の矩形に入っているので足さない。送られて見えなければ足す。
//  2 V＝min(描いた高さ, 56)。時間軸の短い予定は描いたブロックの実際の高さ（最小の高さを含む）。
//  4 時刻つき 0 件の日の T＝170 は時間軸だけ（カードは貼らない）。
function expectT(form, mode, s, timed) {
  const f = FORMS[form];
  if (!timed) return { T: mode === 'A' ? null : 170, from: '時刻つき 0 件' };
  const first = s.evs[0]; let D = first.top - s.paneTop; const V = Math.min(first.h, 56);
  let adAdd = 0;
  if (mode !== 'A' && s.tlAd && s.tlAd.has) { const shown = s.tlAd.top >= s.hdrBottom - 0.6 && s.tlAd.top + s.tlAd.h <= first.top + 0.6; if (!shown) { adAdd = s.tlAd.h; D += adAdd; } }
  const table = mode === 'A' ? T_TABLE[f.G].A[adRows(s.adH)] : T_TABLE[f.G][mode] + (s.tlAd && s.tlAd.has ? s.tlAd.h : 0);
  return { T: D + V + f.G + 41, D, V, adAdd, table };
}

// ---- 1・2・3・6: 4 形 × A/B/C × 日 6 種 × 段（縦 2・3・4、横 1 つ） ----
const MATRIX = [
  ...Object.keys(FORMS).flatMap((form) => ['A', 'B', 'C'].flatMap((mode) => Object.entries(DAYS).map(([dayId, day]) => [form, mode, dayId, day]))),
  ...Object.keys(FORMS).flatMap((form) => ['B', 'C'].flatMap((mode) => Object.entries(SHORT).map(([dayId, day]) => [form, mode, dayId, day]))), // §18-6 の 2
];
for (const [form, mode, dayId, day] of MATRIX) for (const stage of FORMS[form].land ? [null] : [2, 3, 4]) {
  const tag = `${form}・${mode}・${dayId}${stage ? `・段${stage}` : ''}`;
  const head = day.first ? `§18-6-2 短い予定（${day.first}分）` : !day.timed ? (mode === 'A' ? '§18-6-4 カード・時刻つき 0 件' : '§18-6-4 時間軸・時刻つき 0 件（T＝170）') : day.ad.length && mode !== 'A' ? '§18-6-1 時間軸・終日あり' : '§18-5';
  test(`${head} ${tag}: 貼るのは H≧T だけ。貼るなら最初の予定がまるごと見える。端だけのぞかない`, async ({ page }) => {
    const f = FORMS[form];
    await bootDay(page, form, mode, day.key, stage ?? 4);
    const s = await state(page);
    if (stage) { expect(s.stage, '前提: 段').toBe(String(stage)); near(s.H, STAGE_H[stage], '前提: 日の欄の高さ'); }
    expect(s.dg, '前提: カード／時間軸').toBe(mode);
    if (day.timed) expect(s.evs.length, '前提: 時刻つきの予定が描かれている').toBeGreaterThan(0);
    const t = expectT(form, mode, s, day.timed);
    test.info().annotations.push({ type: '§18-5', description: JSON.stringify({ H: s.H, T: t, gs: s.gs, stuck: s.stuck, adH: s.adH, first: s.evs[0], gripTop: s.gripTop, hdrBottom: s.hdrBottom }) });
    // T が値の表と合う（カードは終日の行の数から、B・C は 1 時間の予定で）。D を描いた矩形から測っているので、ずれたら D の作りか表のどちらかがおかしい
    if (day.timed && t.table && !day.first) expect(Math.abs(t.T - t.table), `T（測った ${t.T.toFixed(1)}、終日の行を足した分 ${t.adAdd}）が表の ${t.table}（時間軸で終日ありは ＋描いた終日の行）と合う`).toBeLessThanOrEqual(1);
    if (day.first) { // §18-6 の 2: V は描いた高さ（56 未満）。56 を使うと T が大きくなりすぎる
      expect(s.evs[0].h, `前提: 最初の短い予定は 56 より低く描かれる（${s.evs[0].h}）`).toBeLessThan(56);
      expect(t.V, 'V＝描いた高さ').toBeCloseTo(s.evs[0].h, 1);
    }
    // 2: 貼る・貼らない
    if (!day.timed && mode === 'A') {
      expect(s.gs, '§18-6-4 時刻つき 0 件・カード: 貼らない（.gs なし）').toBe(false);
      expect(s.stuck, '時刻つき 0 件・カード: 貼り付かない').toBe(false);
      if (s.nlTop != null) expect(s.nlTop, 'つまみの下にノート ›').toBeGreaterThanOrEqual(s.gripBottom - 0.6);
      expect(s.gripTop, '終日の欄の下につまみ').toBeGreaterThanOrEqual(s.hdrBottom + s.adH - 0.6);
      // §18-6-4: つまみは 終日の欄か「予定なし」のすぐ下。8960267 の実測: 終日の欄の下端＝つまみの上端（差 0）、予定なし .mdnone2（高さ 44）は下の 8 につまみが乗る（差 −8）。差 −8〜+8 を「すぐ下」とする
      expect(Math.abs(s.gripTop - s.aboveGrip), `つまみは終日の欄・予定なしのすぐ下（上の物の下端 ${s.aboveGrip}、つまみの上端 ${s.gripTop}）`).toBeLessThanOrEqual(8.6);
    } else if (s.H >= t.T) expect(s.gs, `H ${s.H} ≧ T ${t.T.toFixed(1)} なので貼る`).toBe(true);
    else if (s.H < t.T - 4) expect(s.gs, `H ${s.H} ＜ T−4 ${(t.T - 4).toFixed(1)} なので貼らない`).toBe(false);
    // §18-7「横はいつも貼る」の読み方: 時刻つきの予定がある日と、時間軸の 0 件（T 170）のこと。カード・時刻つき 0 件は §18-6-4 のとおり横でも貼らない（設計が決めた）
    if (f.land && !(!day.timed && mode === 'A')) expect(s.gs, '横はいつも貼る（カード・時刻つき 0 件は §18-6-4 で貼らない）').toBe(true);
    if (stage === 2 && day.timed) expect(s.gs, '縦の段2 は予定のある日は貼らない').toBe(false);
    // 1・3: 貼っているとき、最初の予定は 見出しの下端 ≦ 上端、上端＋min(高さ,56) ≦ つまみの上端
    if (s.gs && s.stuck && day.timed) {
      const first = s.evs[0];
      expect(first.top, '最初の予定の上端 ≧ 見出しの下端').toBeGreaterThanOrEqual(s.hdrBottom - 0.6);
      expect(first.top + Math.min(first.h, 56), `最初の予定の上端＋min(高さ,56) ≦ つまみの上端 ${f.gripTop}`).toBeLessThanOrEqual(s.gripTop + 0.6);
      near(s.gripTop, f.gripTop, '貼ったつまみの上端');
    }
    // 端だけのぞかない（カード）: 見出しとつまみ（貼っていなければ日の欄の下端）の間に、1pt 以上見えて まるごとではないカードがあり、まるごと見えるカードが 0 枚 → 不可。
    // 段3 以上（と横）で貼っているとき、2 枚目以降がつまみの上で切れるのは v19.3（設計 §18-5 の残り）なので除く。貼っていないときに日の欄の下端（ホームバーの下）で切れるのは送る一覧の普通の切れ目。
    // §18-7 貼らないときの一覧の切れ方: 最初の予定は日の欄の下の端でだけ切れてよい（つまみ・見出しで切れない）。見える高さはカード 48 以上、時間軸 min(描いた高さ, 20) 以上（例: 縦・段2・終日 2 行の 54／56、C・段2 の 26）
    if (day.timed && !s.gs) {
      const first = s.evs[0];
      expect(first.top, '貼らないとき: 最初の予定は見出しで切れない（上端 ≧ 見出しの下端）').toBeGreaterThanOrEqual(s.hdrBottom - 0.6);
      const v = Math.min(first.bottom, s.paneBottom) - first.top;
      const need = mode === 'A' ? 48 : Math.min(first.h, 20);
      expect(v, `貼らないとき: 最初の予定の見える高さ ${v.toFixed(1)}／${first.h}（切れるのは日の欄の下の端だけ）≧ ${need}`).toBeGreaterThanOrEqual(need - 0.6);
      if (first.bottom > s.paneBottom + 0.6) expect(first.top + v, '切れているのは日の欄の下の端').toBeCloseTo(s.paneBottom, 0);
      const gripOver = s.gripTop < Math.min(first.bottom, s.paneBottom) - 0.6 && s.gripBottom > first.top + 0.6; expect(gripOver, '貼らないとき: つまみで最初の予定が切れない').toBe(false);
    }
    if (day.timed && mode === 'A' && s.gs) {
      const lo = s.hdrBottom, hi = s.gs && s.stuck ? s.gripTop : s.paneBottom;
      const vis = s.evs.map((e) => ({ ...e, v: Math.max(0, Math.min(e.bottom, hi) - Math.max(e.top, lo)) })).filter((e) => e.v >= 1);
      const whole = vis.filter((e) => e.v >= e.h - 0.6), part = vis.filter((e) => e.v < e.h - 0.6);
      expect(whole.length, `まるごと見えるカードが 1 枚以上（見える ${JSON.stringify(vis.map((e) => [Math.round(e.top), Math.round(e.v)]))}）`).toBeGreaterThan(0);
      if (s.gs && s.stuck && (stage == null || stage >= 3)) { /* 2 枚目以降のつまみの上の切れは除く（v19.3） */ } else if (s.gs && s.stuck) expect(part, '貼っているのに端だけのぞくカード').toEqual([]);
    }
    // 時間軸 B・C で予定がない日は §18-1 のまま（H ≧ 170 で貼る）
    if (!day.timed && mode !== 'A') expect(s.gs, `時間軸・予定なし: H ${s.H} ≧ 170 で貼る`).toBe(s.H >= 170);
  });
}

// ---- 4: 引きで H を T−6 ⇔ T+2 に行き来（縦、カード終日なし・時間軸 B） ----
const near = (a, b, msg = '') => expect(Math.abs(a - b), `${msg}: ${a} vs ${b}`).toBeLessThanOrEqual(0.6);
async function grabTop(page) { const g = await page.locator('.mgrab').boundingBox(); const p = { x: g.x + g.width / 2, y: g.y + g.height / 2 }; await page.mouse.move(p.x, p.y); await page.mouse.down(); return p; }
async function holdH(page, p, H) { for (let i = 0; i < 10; i++) { const s = await state(page); const dy = (678 - H) - s.paneTop; if (Math.abs(dy) <= 0.5) break; p.y += dy; await page.mouse.move(p.x, p.y, { steps: 3 }); await page.waitForTimeout(50); } await page.waitForTimeout(320); return state(page); }
const PULLS = [['A', 'ad0-t6'], ['B', 'ad0-t6'], ['A', 'ad1-t6'], ['C', 'ad0-t6'], ['B', 'ad0-t0'], ['B', 'ad1-t6'], ['B', 'ad0-s15'], ['C', 'ad1-s10']]; // ad0-t0 の時間軸は T＝170（§18-6-4）。B・ad1-t6 は終日の行 32 を足す（§18-6-1）。s15・s10 は V＝描いた高さ（§18-6-2）
for (const form of ['縦・帯あり', '縦・帯なし']) for (const [mode, dayId] of PULLS) {
  const D = { ...DAYS, ...SHORT }[dayId];
  const head = D.first ? '§18-6-2' : !D.timed ? '§18-6-4' : D.ad.length && mode !== 'A' ? '§18-6-1' : '§18-5';
  test(`${head} 引き ${form}・${mode}・${dayId}: H を T−6 ⇔ T+2 に往復。付くのは H≧T、外れるのは H＜T−4、切り替えは1往復2回まで、0.15 秒 linear、重なり 0、消える間も最初の予定にかからない`, async ({ page }) => {
    await bootDay(page, form, mode, D.key, 3);
    // T は開いた位置（段3）で描いた矩形から決める（§18-5・§18-6）。表のある日は表と ±1 で合うことも見る
    const s0 = await state(page); expect(s0.dg, '前提: カード／時間軸').toBe(mode); const t0 = expectT(form, mode, s0, D.timed); const T = Math.round(t0.T);
    if (t0.table && !D.first) expect(Math.abs(t0.T - t0.table), `T ${t0.T} と表 ${t0.table}`).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      window.__f = []; window.__an = []; window.__stop = false; const seen = new Set();
      const tick = () => {
        const d = document.querySelector('.mpull.browse .mday'); const g = d.querySelector('.mdgrab'), h = d.querySelector('.mdh');
        for (const a of g.getAnimations()) if (!seen.has(a)) { seen.add(a); const tm = a.effect.getTiming(); window.__an.push({ dur: Number(tm.duration), ease: tm.easing }); }
        let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        const gb = g.getBoundingClientRect(), hb = h.getBoundingClientRect(); const first = [...d.querySelectorAll('.mdcard, .tlev')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).sort((a, b) => a.top - b.top)[0];
        window.__f.push({ H: d.getBoundingClientRect().height, gs: d.classList.contains('gs'), op, gTop: gb.top, hdr: hb.bottom, fTop: first?.top, fH: first?.height });
        if (!window.__stop) requestAnimationFrame(tick);
      }; requestAnimationFrame(tick);
    });
    const p = await grabTop(page); const seq = [];
    for (const H of [T + 2, T - 2, T - 6, T - 2, T + 2, T - 6, T + 2]) { const s = await holdH(page, p, H); seq.push([H, Math.round(s.H * 10) / 10, s.gs]); }
    await page.mouse.up();
    const r = await page.evaluate(() => { window.__stop = true; return { f: window.__f, an: window.__an }; });
    test.info().annotations.push({ type: 'seq', description: JSON.stringify({ T, seq }) });
    const want = [true, true, false, false, true, false, true];
    expect(seq.map(([, , gs]) => gs), `T ${T}: 付く H≧T・外れる H＜T−4 ${JSON.stringify(seq)}`).toEqual(want);
    let flips = 0; for (let i = 1; i < r.f.length; i++) if (r.f[i].gs !== r.f[i - 1].gs) flips++;
    expect(flips, '切り替えは 3 往復で 6 回まで（1 往復 2 回）').toBeLessThanOrEqual(6);
    for (const a of r.an) { expect(a.dur, '0.15 秒').toBe(150); expect(a.ease, 'linear').toBe('linear'); }
    expect(r.an.length, 'フェードがある').toBeGreaterThan(0);
    const over = r.f.filter((x) => x.op > 0.05 && x.gTop < x.hdr - 0.5); expect(over.length, '見出しとつまみの重なり 0').toBe(0);
    const hit = r.f.filter((x) => x.op > 0.05 && x.op < 0.999 && x.fTop != null && x.gTop < x.fTop + Math.min(x.fH, 56) - 0.6);
    expect(hit.slice(0, 3), '消えていく間・出てくる間、つまみの上端 ≧ 最初の予定の上端＋min(高さ,56)').toEqual([]);
  });
}

// ---- 5: 同じ段で日を替えて T が変わる（縦・帯なし・段3: 1行の日 → 2行の日 → 1行の日）。一瞬で切り替わる ----
test('§18-5 日を替えて T が変わる（縦・帯なし・段3: ad1-t6 → ad2-t6 → ad1-t6）: 貼る→貼らない→貼る、getAnimations 0、途中の不透明度なし', async ({ page }) => {
  await bootDay(page, '縦・帯なし', 'A', DAYS['ad1-t6'].key, 3);
  const s0 = await state(page); expect(s0.gs, '1行の日は貼る（233 ≦ 266）').toBe(true);
  await page.evaluate(() => { window.__f = []; window.__stop = false; const tick = () => { const d = document.querySelector('.mpull.browse .mday'); const g = d?.querySelector('.mdgrab'); if (g) { let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); window.__f.push([op, g.getAnimations().length]); } if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const pick = async (k) => { await page.locator(`.mgrid:not([data-leaving]) .day[data-date="${k}"]`).first().click({ position: { x: 20, y: 12 } }); await page.waitForTimeout(500); return state(page); };
  const s1 = await pick(DAYS['ad2-t6'].key); expect(s1.adH, '前提: 2行').toBeGreaterThan(46); expect(s1.gs, '2行の日は貼らない（269 ＞ 266）').toBe(false);
  const s2 = await pick(DAYS['ad1-t6'].key); expect(s2.gs, '1行の日に戻すと貼る').toBe(true);
  const fr = await page.evaluate(() => { window.__stop = true; return window.__f; });
  expect(fr.filter(([, n]) => n > 0).length, 'つまみのアニメーション 0').toBe(0);
  expect(fr.filter(([op]) => op > 0.02 && op < 0.98).length, '途中の不透明度のコマ 0（一瞬）').toBe(0);
});
// §18-6 の 3: つまみを引いてカード⇔時間軸に変えるときは、A・B・C のどれでも一瞬（中身を描き直す）。T が変わって貼る・貼らないが入れ替わる組で見る
async function pullDayGrip(page, dy) { const g = await page.locator('.mday .mdgrab').boundingBox(); await page.mouse.move(g.x + g.width / 2, g.y + 20); await page.mouse.down(); await page.mouse.move(g.x + g.width / 2, g.y + 20 + dy, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(600); }
const countAnims = (page) => page.evaluate(() => { window.__n = 0; window.__mid = 0; window.__stop = false; const tick = () => { const g = document.querySelector('.mpull.browse .mday .mdgrab'); if (g) { window.__n += g.getAnimations().length; let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); if (op > 0.02 && op < 0.98) window.__mid++; } if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
const stopAnims = (page) => page.evaluate(() => { window.__stop = true; return { n: window.__n, mid: window.__mid }; });
for (const [form, dayId, from, dy, to, gs0, gs1, why] of [
  ['縦・帯なし', 'ad1-t6', 'A', 70, 'B', true, false, 'A 233 ≦ 266 貼る → B 241＋32＝273 ＞ 266 貼らない'],
  ['縦・帯あり', 'ad0-t6', 'A', 200, 'C', true, false, 'A 185 貼る → C 285 貼らない'],
  ['縦・帯なし', 'ad1-t6', 'B', -70, 'A', false, true, 'B 273 貼らない → A 233 貼る'],
  ['縦・帯あり', 'ad0-t6', 'C', -200, 'A', false, true, 'C 285 貼らない → A 185 貼る'],
]) {
  test(`§18-6-3 ${from}→${to}（${form}・段3・${dayId}）: つまみを引いて変えると 貼る・貼らない が一瞬で切り替わる（${why}）。アニメーション 0・途中の不透明度なし`, async ({ page }) => {
    await bootDay(page, form, from, DAYS[dayId].key, 3);
    const s0 = await state(page); expect(s0.dg, '前提: 始めの見せ方').toBe(from); expect.soft(s0.gs, `始め（${from}）`).toBe(gs0);
    // 品質の判断（4bf2f81 の QA、(3)）: 貼っていない時間軸 B のつまみ（下）は時間軸の最後（24:00 の下）にあり、開いた位置では画面の外（§18-5「送り切ると出る」）。
    // B→A・C→A は日の欄を送ってつまみを日の欄の中（上端から 120）に出してから引く（設計 §18-7「送り切ってつまみを引いても」）。見ること（.gs・アニメーション 0・途中の不透明度 0）は変えない
    if (from !== 'A' && !s0.gs) { await page.evaluate(() => { const d = document.querySelector('.mpull.browse .mday'), g = d.querySelector('.mdgrab'); d.scrollTop += g.getBoundingClientRect().top - d.getBoundingClientRect().top - 120; }); await page.waitForTimeout(200); }
    await countAnims(page); await pullDayGrip(page, dy);
    const s = await state(page); expect(s.dg, `前提: ${to} まで引けた`).toBe(to);
    expect.soft(s.gs, `${to} のあと`).toBe(gs1);
    const r = await stopAnims(page); expect(r.n, 'つまみのアニメーション 0').toBe(0); expect(r.mid, '途中の不透明度のコマ 0').toBe(0);
  });
}
// 動きを減らす設定では、引きで T をまたいでも一瞬
test('§18-5 動きを減らす設定: 引きで T をまたいでもフェードなし（縦・帯あり・A・ad0-t6）', async ({ page }) => {
  await bootDay(page, '縦・帯あり', 'A', DAYS['ad0-t6'].key, 3, { reduced: true });
  await page.evaluate(() => { window.__n = 0; window.__stop = false; const tick = () => { const g = document.querySelector('.mpull.browse .mday .mdgrab'); if (g) window.__n += g.getAnimations().length; if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const p = await grabTop(page); for (const H of [187, 179, 187]) await holdH(page, p, H); await page.mouse.up();
  expect(await page.evaluate(() => { window.__stop = true; return window.__n; })).toBe(0);
});

// ---- §18-6-3・§18-7: 貼っていない時間軸 B から 見出しの「カード」（.mdback）でカードへ。一瞬で切り替わる ----
test('§18-7 B→A を見出しの「カード」で（縦・帯なし・段3・ad1-t6）: 貼らない（B 273）→ 貼る（A 233）が一瞬（アニメーション 0・途中の不透明度なし）', async ({ page }) => {
  await bootDay(page, '縦・帯なし', 'B', DAYS['ad1-t6'].key, 3);
  const s0 = await state(page); expect(s0.dg, '前提: B').toBe('B'); expect.soft(s0.gs, '始め（B 273 ＞ 266）は貼らない').toBe(false);
  await countAnims(page);
  await page.locator('.mpull.browse .mday .mdh .mdback').click(); await page.waitForTimeout(600);
  const s = await state(page); expect(s.dg, '前提: カードに戻った').toBe('A');
  expect.soft(s.gs, 'A（233 ≦ 266）は貼る').toBe(true);
  const r = await stopAnims(page); expect(r.n, 'つまみのアニメーション 0').toBe(0); expect(r.mid, '途中の不透明度のコマ 0').toBe(0);
});

// ---- §18-7 必須 M-1: 止まったときは遊びなしで決める。どの来かたでも 止まっていれば .gs ⇔ H ≧ T ----
// 縦の段3（266）に「開いた直後」「段4→段3（キー）」「段2→段3（キー）」の3つで来て、見た目（.gs・.stuck・つまみの上端・最初の予定の上端と見える高さ）が同じか。
// T−4 ≦ 266 ＜ T に当たる組（いまの値では 帯なし・A・終日 2 行 T 269 だけ）も含め、縦の全部の組（日 6＋短い予定 2 × A・B・C）で見る。
const M1_DAYS = { ...DAYS, ...SHORT, ...M1_EXTRA };
const restLook = (s) => { const f = s.evs[0]; const hi = s.gs && s.stuck ? s.gripTop : s.paneBottom; return { gs: s.gs, stuck: s.stuck, gripTop: Math.round(s.gripTop), firstTop: f ? Math.round(f.top) : null, firstVis: f ? Math.round(Math.max(0, Math.min(f.bottom, hi) - Math.max(f.top, s.hdrBottom))) : null }; };
async function keyTo(page, n) { await page.locator('.mgrab').focus(); for (let i = 0; i < 8; i++) { const st = Number(await page.locator('.mpull').getAttribute('data-stage')); if (st === n) break; await page.keyboard.press(st < n ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(500); } await page.waitForTimeout(450); await page.evaluate(() => document.activeElement?.blur()); }
for (const form of ['縦・帯あり', '縦・帯なし']) for (const mode of ['A', 'B', 'C']) for (const [dayId, day] of Object.entries(M1_DAYS)) {
  if (day.first && mode === 'A') continue;
  const f = FORMS[form]; const tab = !day.timed ? null : day.first ? null : mode === 'A' ? T_TABLE[f.G].A[day.ad.length === 0 ? 0 : day.ad.length === 1 ? 1 : 2] : T_TABLE[f.G][mode] + (day.ad.length ? 32 : 0);
  const m1 = (tab != null && tab - 4 <= 266 && 266 < tab) || (day.len && mode === 'B');
  test(`§18-7${m1 ? ' 必須 M-1' : ''} 段3 ${form}・${mode}・${dayId}: 開いた直後・段4→段3・段2→段3 で見た目が同じ。止まっていれば .gs ⇔ H≧T（遊びなし）`, async ({ page }) => {
    await bootDay(page, form, mode, day.key, 3);
    const s0 = await state(page); expect(s0.stage, '前提: 段3').toBe('3'); expect(s0.dg).toBe(mode);
    const t = expectT(form, mode, s0, day.timed); const T = t.T;
    const want = T == null ? false : s0.H >= T - 0.01;
    const a = restLook(s0);
    await keyTo(page, 4); await keyTo(page, 3); const b = restLook(await state(page));
    await keyTo(page, 2); await keyTo(page, 3); const c = restLook(await state(page));
    test.info().annotations.push({ type: 'M-1', description: JSON.stringify({ T, H: s0.H, open: a, from4: b, from2: c }) });
    expect.soft(a.gs, `開いた直後: H ${s0.H} ${want ? '≧' : '＜'} T ${T}`).toBe(want);
    expect.soft(b, '段4→段3 は開いた直後と同じ').toEqual(a);
    expect.soft(c, '段2→段3 は開いた直後と同じ').toEqual(a);
  });
}
// M-1 の組: 段4→段3（キー）で 貼ったまま T 未満で止まったら 0.15 秒 linear で消す。指を離して段3 に着いたときも決め直す。動きを減らす設定では一瞬
async function watchFade(page) { await page.evaluate(() => { window.__an = []; window.__fr = []; window.__stop = false; const seen = new Set(); const tick = () => { const d = document.querySelector('.mpull.browse .mday'); const g = d?.querySelector('.mdgrab'); if (g) { for (const a of g.getAnimations()) if (!seen.has(a)) { seen.add(a); const tm = a.effect.getTiming(); window.__an.push({ dur: Number(tm.duration), ease: tm.easing }); } let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); window.__fr.push({ H: d.getBoundingClientRect().height, gs: d.classList.contains('gs'), op }); } if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }); }
const stopFade = (page) => page.evaluate(() => { window.__stop = true; return { an: window.__an, fr: window.__fr }; });
for (const how of ['キー 段4→段3', '指で 段4→段3 へ引いて離す', '動きを減らす設定・キー 段4→段3']) {
  test(`§18-7 必須 M-1 縦・帯なし・A・ad2-t6（T 269）: ${how}。止まった所（266）で決め直して貼らない。${how.startsWith('動き') ? '一瞬で消す' : '貼ったままなら 0.15 秒 linear で消す'}。最初のカードにつまみがかからない`, async ({ page }) => {
    await bootDay(page, '縦・帯なし', 'A', DAYS['ad2-t6'].key, 4, { reduced: how.startsWith('動き') });
    const s4 = await state(page); expect(s4.stage).toBe('4'); expect(s4.gs, '前提: 段4（418）は貼る').toBe(true);
    await watchFade(page);
    if (how.startsWith('指')) {
      const p = await grabTop(page);
      for (const H of [330, 290, 268]) await holdH(page, p, H); // 268 は T−4 ≦ H ＜ T（動いている間は貼ったまま）
      const mid = await state(page); test.info().annotations.push({ type: 'before-release', description: JSON.stringify({ H: mid.H, gs: mid.gs }) });
      await page.mouse.up(); await page.waitForTimeout(800);
    } else { await keyTo(page, 3); await page.waitForTimeout(300); }
    const r = await stopFade(page); const s = await state(page);
    expect(s.stage, '前提: 段3 に着いた').toBe('3'); near(s.H, 266, '段3 の高さ');
    expect(s.gs, '止まったら H 266 ＜ T 269 で貼らない').toBe(false);
    const first = s.evs[0]; const v = Math.min(first.bottom, s.paneBottom) - first.top;
    expect(v, `最初のカードがまるごと（見える ${v}）`).toBeGreaterThanOrEqual(first.h - 0.6);
    const wasOn = r.fr.some((x) => x.gs && x.H < 268.9 && x.H > 265);
    if (how.startsWith('動き')) { expect(r.an.length, '動きを減らす設定: アニメーション 0').toBe(0); expect(r.fr.filter((x) => x.op > 0.02 && x.op < 0.98).length, '途中の不透明度なし').toBe(0); }
    else if (wasOn) { expect(r.an.length, '貼ったまま T 未満で止まった → フェードで消す').toBeGreaterThan(0); for (const a of r.an) { expect(a.dur, '0.15 秒').toBe(150); expect(a.ease).toBe('linear'); } }
  });
}
