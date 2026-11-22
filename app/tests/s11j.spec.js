// 第19.2版 S11j: 4bf2f81 の設計レビュー（review-v19-2-4bf2f81-closed-final4.md）の必須 M-1（実装担当）。
// 値の根拠: design/34 §18-7「止まったときは遊びなしで決める」。
//   遊び 4（H ＜ T−4 で外す）は、指やアニメーションで日の欄の高さ H が動いている間だけ。段に止まったとき（段送りの終わり・キーでの段移動の終わり・指を離して段に着いたとき）は H ≧ T で決め直す。
//   貼ったまま H ＜ T で止まったら 0.15 秒 linear で消す（--gsb＝H−T）。動きを減らす設定では一瞬。止まっている状態では、どの来かたでも .gs ⇔ H ≧ T。
//   当たる組＝ T−4 ≦ 段の高さ ＜ T。段3（H 266）で: 帯なし・カード・終日 2 行（T 269）／帯あり・時間軸 B・終日あり・最初の予定 70 分（T≈267）／帯なし・時間軸 B・終日あり・最初の予定 55 分（T≈268）。
// §18-7 の終わり: 貼っていない時間軸からカードへは、見出しの「カード」でも一瞬で切り替える。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev } from './helpers.js';

const SHOTS = process.env.S11J_SHOTS || '';
const GEO = { portrait: { width: 466, height: 678 }, landscape: { width: 678, height: 466 } };
const FORMS = {
  '縦・帯あり': { sar: 84, land: false, G: 44, gripTop: 593, id: 'port-band' },
  '縦・帯なし': { sar: 0, land: false, G: 56, gripTop: 581, id: 'port-noband' },
  '横・帯あり': { sar: 84, land: true, G: 44, gripTop: 381, id: 'land-band' },
  '横・帯なし': { sar: 0, land: true, G: 56, gripTop: 369, id: 'land-noband' },
};
const MODES = { A: 0, B: 1, C: 2 };
const LONG = ['長い題名の終日の予定その一', '長い題名の終日の予定その二', '長い題名の終日の予定その三', '長い題名の終日の予定その四'];
const hh = (n) => String(n).padStart(2, '0');
// 日: ad＝終日の題名、first＝最初の予定の長さ（分）。2 件目からは 11:00〜 1 時間ずつ
const DAYS = {
  'ad2-t6': { key: '2026-11-24', ad: LONG, first: 60 },
  'ad1-f70': { key: '2026-11-20', ad: ['終日'], first: 70 },
  'ad1-f55': { key: '2026-11-19', ad: ['終日'], first: 55 },
  'ad1-t6': { key: '2026-11-18', ad: ['終日'], first: 60 },
  'ad0-t6': { key: '2026-11-17', ad: [], first: 60 },
  'ad1-t0': { key: '2026-11-16', ad: ['終日'], first: 0 },
};
const DATA = Object.entries(DAYS).flatMap(([id, d]) => [
  ...d.ad.map((t, i) => ev(`${id}-a${i}`, t, `${d.key}T00:00`, `${d.key}T23:59`, { all: true })),
  ...(d.first ? [ev(`${id}-t0`, '最初の予定', `${d.key}T09:00`, `${d.key}T${hh(9 + Math.floor(d.first / 60))}:${hh(d.first % 60)}`), ...Array.from({ length: 5 }, (_, i) => ev(`${id}-t${i + 1}`, `予定${i + 2}`, `${d.key}T${hh(11 + i)}:00`, `${d.key}T${hh(12 + i)}:00`))] : []),
]);
const STAGE_H = { 2: 170, 3: 266, 4: 418 };

async function bootDay(page, form, mode, dayKey, stage, { reduced = false } = {}) {
  const f = FORMS[form];
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-11-12T09:41:00+09:00'));
  await page.addInitScript((sar) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar}px`)), f.sar);
  await page.addInitScript(({ sel, dg, st }) => { if (sessionStorage.getItem('qa-j')) return; sessionStorage.setItem('qa-j', '1'); localStorage.setItem('duo.ui.v1', JSON.stringify({ home: false, monthForm: 'month', monthDay: 'list', selected: sel, dayGrip: dg, stage: st })); }, { sel: dayKey, dg: MODES[mode], st: stage });
  await openApp(page, GEO.portrait);
  await seed(page, DATA); await page.waitForTimeout(600);
}
const rotate = async (page, land) => { await page.setViewportSize(land ? GEO.landscape : GEO.portrait); await page.waitForTimeout(700); };
// 止まっているときの様子
const STATE = () => {
  const d = document.querySelector('.mpull.browse .mday'), g = d.querySelector('.mdgrab'), h = d.querySelector('.mdh');
  const db = d.getBoundingClientRect(), gb = g.getBoundingClientRect(), hb = h.getBoundingClientRect();
  const evs = [...d.querySelectorAll('.mdcard, .tlev')].map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height }; }).filter((r) => r.h > 0).sort((a, b) => a.top - b.top);
  let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
  return { stage: Number(document.querySelector('.mpull')?.dataset.stage || 0), dg: d.dataset.dg, H: db.height, T: d._gsT === Infinity ? null : d._gsT, paneTop: db.top, paneBottom: db.bottom, st: d.scrollTop, gs: d.classList.contains('gs'), stuck: g.classList.contains('stuck'), pos: getComputedStyle(g).position, op, gripTop: gb.top, gripBottom: gb.bottom, hdrBottom: hb.bottom, first: evs[0] || null, anims: g.getAnimations().length, gsb: d.style.getPropertyValue('--gsb'), fill: getComputedStyle(g, '::before').content !== 'none' };
};
const state = (page) => page.evaluate(STATE);
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
async function keyTo(page, n, wait = 700) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) { await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(wait); }
  await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(250);
}
// つまみのコマ撮り（rAF の全コマ: 高さ・.gs・不透明度・アニメーションの秒数と緩急・--gsb）
const startFrames = (page) => page.evaluate(() => {
  window.__f = []; window.__an = []; window.__stop = false; const seen = new Set(), t0 = performance.now();
  const tick = (now) => {
    const d = document.querySelector('.mpull.browse .mday'), g = d?.querySelector('.mdgrab'), h = d?.querySelector('.mdh');
    if (g) {
      for (const a of g.getAnimations()) if (!seen.has(a)) { seen.add(a); const tm = a.effect.getTiming(); window.__an.push({ dur: Number(tm.duration), ease: tm.easing, t: now - t0, H: d.getBoundingClientRect().height }); }
      let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const gb = g.getBoundingClientRect(), stuck = getComputedStyle(g).position === 'sticky';
      window.__f.push({ t: now - t0, H: d.getBoundingClientRect().height, gs: d.classList.contains('gs'), op, gTop: gb.top, hdr: h.getBoundingClientRect().bottom, stuck, gsb: d.style.getPropertyValue('--gsb') });
    }
    if (!window.__stop) requestAnimationFrame(tick);
  }; requestAnimationFrame(tick);
});
const stopFrames = (page) => page.evaluate(() => { window.__stop = true; return { f: window.__f, an: window.__an }; });
// 段を変える上のつまみを指（マウス）で dy だけ引いて離す
async function dragStage(page, dy) {
  const g = await page.locator('.mgrab').boundingBox(), x = g.x + g.width / 2, y = g.y + g.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(x, y + (dy * i) / 20); await page.waitForTimeout(16); }
  await page.waitForTimeout(150); // 止めてから離す（はらいにしない）
  await page.mouse.up(); await page.waitForTimeout(800);
}
const near = (a, b, msg = '') => expect(Math.abs(a - b), `${msg}: ${a} vs ${b}`).toBeLessThanOrEqual(0.6);
// 段3 で貼っていない止まった形（設計 §18-7: 最初の予定は下の端でだけ切れる。カード 48 以上・時間軸 min(高さ,20) 以上）
function expectUnstuckAt3(s, mode, tag) {
  expect(s.stage, `${tag}: 段`).toBe(3); near(s.H, 266, `${tag}: 日の欄の高さ`);
  expect(s.H, `${tag}: 前提 T−4 ≦ H`).toBeGreaterThanOrEqual(s.T - 4 - 0.01); expect(s.H, `${tag}: 前提 H ＜ T（T ${s.T}）`).toBeLessThan(s.T);
  expect(s.gs, `${tag}: 止まったら H ${s.H} ＜ T ${s.T} なので貼らない`).toBe(false);
  expect(s.stuck, `${tag}: 貼り付いていない`).toBe(false); expect(s.pos, `${tag}: sticky でない`).not.toBe('sticky'); expect(s.fill, `${tag}: 埋めた面なし`).toBe(false);
  expect(s.op, `${tag}: 不透明度`).toBe(1); expect(s.anims, `${tag}: アニメーションが残らない`).toBe(0); expect(s.gsb, `${tag}: --gsb が残らない`).toBe('');
  const v = Math.max(0, Math.min(s.first.bottom, s.paneBottom) - s.first.top);
  expect(s.first.top, `${tag}: 最初の予定の上端 ≧ 見出しの下端`).toBeGreaterThanOrEqual(s.hdrBottom - 0.6);
  expect(s.gripTop, `${tag}: つまみは最初の予定にかからない（つまみ ${s.gripTop}、予定の下端 ${s.first.bottom}）`).toBeGreaterThanOrEqual(Math.min(s.first.bottom, s.paneBottom) - 0.6);
  expect(v, `${tag}: 最初の予定の見える高さ ${v}／${s.first.h}`).toBeGreaterThanOrEqual((mode === 'A' ? Math.min(48, s.first.h) : Math.min(s.first.h, 20)) - 0.6);
}
const same = (a, b, tag) => { for (const k of ['gs', 'stuck', 'pos', 'fill', 'dg']) expect(a[k], `${tag}: ${k}`).toBe(b[k]); for (const k of ['H', 'T', 'gripTop', 'st', 'hdrBottom']) near(a[k], b[k], `${tag}: ${k}`); near(a.first.top, b.first.top, `${tag}: 最初の予定の上端`); };

// T−4 ≦ 266 ＜ T の組（縦）
const COMBOS = [
  ['縦・帯なし', 'A', 'ad2-t6', 269],
  ['縦・帯あり', 'B', 'ad1-f70', 267.3],
  ['縦・帯なし', 'B', 'ad1-f55', 268.3],
];
for (const [form, mode, dayId, T] of COMBOS) {
  const f = FORMS[form], tag0 = `${form}・${mode}・${dayId}（T ${T}）`;
  test(`S11j M-1 ${tag0}: 段3 は 開いた直後・段2 から・段4 から（キー）・段4 から（指）のどれでも貼らず、同じ見た目。段4→段3 は貼ったまま着いてから 0.15 秒 linear で消える`, async ({ page }) => {
    test.setTimeout(90000);
    await bootDay(page, form, mode, DAYS[dayId].key, 3);
    // 1. 開いた直後の段3
    const sOpen = await state(page); expect(sOpen.dg).toBe(mode); near(sOpen.T, T, '前提: T'); expectUnstuckAt3(sOpen, mode, '開いた直後');
    const shotOpen = await page.screenshot(SHOTS ? { path: `${SHOTS}/j-${f.id}-${mode}-${dayId}-s3-open.png` } : {});
    // 2. 段2 から上げる
    await keyTo(page, 2); let s = await state(page); expect(s.stage).toBe(2); expect(s.gs, '段2 は貼らない').toBe(false);
    await keyTo(page, 3); const sFrom2 = await state(page); expectUnstuckAt3(sFrom2, mode, '段2 から'); same(sFrom2, sOpen, '段2 から＝開いた直後');
    expect((await page.screenshot()).equals(shotOpen), '段2 から来た段3 の絵＝開いた直後の絵').toBe(true);
    // 3. 段4 からキーで戻す（4bf2f81 は貼ったまま最初のカードの下 3 を隠していた）
    await keyTo(page, 4); s = await state(page); expect(s.stage).toBe(4); expect(s.gs, '段4 は貼る').toBe(true); expect(s.stuck).toBe(true); near(s.gripTop, f.gripTop, '段4 のつまみの上端');
    await startFrames(page);
    await keyTo(page, 3);
    const fr = await stopFrames(page);
    const sFrom4 = await state(page); expectUnstuckAt3(sFrom4, mode, '段4 から（キー）'); same(sFrom4, sOpen, '段4 から＝開いた直後');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/j-${f.id}-${mode}-${dayId}-s3-from4.png` });
    expect((await page.screenshot()).equals(shotOpen), '段4 から来た段3 の絵＝開いた直後の絵').toBe(true);
    //   動いている間（H ＞ 266）は貼ったまま（遊び 4 の中）。着いてからフェード 1 回（0.15 秒・linear）、消える間の --gsb は H−T
    for (const q of fr.f.filter((x) => x.H > 266.5)) { expect(q.gs, `t${q.t | 0} 高さ ${q.H}: 動いている間は貼ったまま`).toBe(true); expect(q.op, `t${q.t | 0}: 動いている間は消し始めない`).toBeGreaterThanOrEqual(0.999); }
    expect(fr.an.length, 'フェードは 1 回').toBe(1); expect(fr.an[0].dur, '0.15 秒').toBe(150); expect(fr.an[0].ease, 'linear').toBe('linear'); near(fr.an[0].H, 266, 'フェードは段に着いてから始まる');
    const fading = fr.f.filter((x) => x.gs && x.op < 0.999);
    expect(fading.length, '消える途中のコマがある').toBeGreaterThanOrEqual(2);
    for (const q of fading) { near(parseFloat(q.gsb), 266 - sOpen.T, `t${q.t | 0}: 消える間の --gsb＝H−T`); expect(q.gTop, `t${q.t | 0}: 見出しと重ならない`).toBeGreaterThanOrEqual(q.hdr - 0.5); }
    { const mid = fading.filter((x) => x.op > 0.05 && x.op < 0.95); if (mid.length >= 2) { const a = mid[0], b = mid[mid.length - 1]; expect(Math.abs((a.op - b.op) - (b.t - a.t) / 150), '直線で消える').toBeLessThan(0.15); } }
    const span = fading[fading.length - 1].t - fading[0].t; expect(span, `消えるのにかかる時間 ${span}`).toBeLessThan(230);
    // 4. 段4 から指で引いて段3 に着く
    await keyTo(page, 4); s = await state(page); expect(s.gs).toBe(true);
    await dragStage(page, 140);
    const sDrag = await state(page); expectUnstuckAt3(sDrag, mode, '段4 から（指）'); same(sDrag, sOpen, '段4 から指で＝開いた直後');
    await page.mouse.move(2, 300); await page.waitForTimeout(100);
    expect((await page.screenshot()).equals(shotOpen), '指で来た段3 の絵＝開いた直後の絵').toBe(true);
    // 5. 段3 から上げ直すと貼る（H ≧ T）、戻すとまた貼らない
    await keyTo(page, 4); s = await state(page); expect(s.gs).toBe(true); expect(s.op).toBe(1); expect(s.anims).toBe(0);
    await keyTo(page, 3); expectUnstuckAt3(await state(page), mode, '2 回目の段4 から');
  });
  test(`S11j M-1 ${tag0}・動きを減らす設定: 段4→段3 は一瞬で貼らない形になる（アニメーション 0・途中の不透明度なし）`, async ({ page }) => {
    await bootDay(page, form, mode, DAYS[dayId].key, 4, { reduced: true });
    let s = await state(page); expect(s.stage).toBe(4); expect(s.gs).toBe(true);
    await startFrames(page);
    await keyTo(page, 3, 300);
    const fr = await stopFrames(page);
    s = await state(page); expectUnstuckAt3(s, mode, '動きを減らす・段4 から');
    expect(fr.an.length, 'アニメーション 0').toBe(0); expect(fr.f.filter((x) => x.op > 0.02 && x.op < 0.98).length, '途中の不透明度のコマ 0').toBe(0);
  });
}

// 止まっている状態では、どの段・どの来かたでも .gs ⇔ H ≧ T（カード・時刻つき 0 件は T なし＝貼らない）
for (const form of ['縦・帯あり', '縦・帯なし']) for (const [mode, dayId] of [['A', 'ad2-t6'], ['B', form === '縦・帯あり' ? 'ad1-f70' : 'ad1-f55'], ['A', 'ad1-t0'], ['C', 'ad0-t6']]) {
  test(`S11j M-1 ${form}・${mode}・${dayId}: キーで 段1→7→1 と止めていくと、どの段でも .gs ⇔ H ≧ T（上りと下りで同じ）`, async ({ page }) => {
    test.setTimeout(90000);
    await bootDay(page, form, mode, DAYS[dayId].key, 1);
    const up = {};
    for (const n of [1, 2, 3, 4, 5, 6, 7]) { await keyTo(page, n, 500); const s = await state(page); expect(s.stage).toBe(n); up[n] = s.gs; expect(s.gs, `上り 段${n}: H ${s.H}・T ${s.T}`).toBe(s.T != null && s.H >= s.T - 0.01); expect(s.anims).toBe(0); expect(s.op).toBe(1); }
    for (const n of [6, 5, 4, 3, 2, 1]) { await keyTo(page, n, 500); const s = await state(page); expect(s.stage).toBe(n); expect(s.gs, `下り 段${n}: H ${s.H}・T ${s.T}`).toBe(s.T != null && s.H >= s.T - 0.01); expect(s.anims).toBe(0); expect(s.op).toBe(1); expect(s.gs, `段${n}: 上りと下りで同じ`).toBe(up[n]); }
  });
}
// 横（H 466）: 段がないので遊びの組はない。縦のどの段（貼っていた段4・貼っていなかった段3）から回しても同じ形（時刻つきの予定がある日は貼る）
for (const [form, mode, dayId] of [['横・帯あり', 'B', 'ad1-f70'], ['横・帯なし', 'A', 'ad2-t6'], ['横・帯なし', 'B', 'ad1-f55']]) {
  const f = FORMS[form];
  test(`S11j M-1 ${form}・${mode}・${dayId}: 縦の段3（貼らない）から回しても、段4（貼る）から回しても、横は同じ形（.gs ⇔ H ≧ T）。縦へ戻すと段3 は貼らない`, async ({ page }) => {
    test.setTimeout(60000);
    await bootDay(page, form, mode, DAYS[dayId].key, 3);
    const p3 = await state(page); expectUnstuckAt3(p3, mode, '縦・段3');
    await rotate(page, true);
    const l3 = await state(page); near(l3.H, 466, '横の日の欄の高さ'); expect(l3.gs, `横: H 466 ≧ T ${l3.T} で貼る`).toBe(true); expect(l3.stuck).toBe(true); near(l3.gripTop, f.gripTop, '横のつまみの上端'); expect(l3.op).toBe(1); expect(l3.anims).toBe(0);
    expect(l3.first.top + Math.min(l3.first.h, 56), '横: 最初の予定がまるごと見える').toBeLessThanOrEqual(l3.gripTop + 0.6);
    const shot3 = await page.screenshot(SHOTS ? { path: `${SHOTS}/j-${f.id}-${mode}-${dayId}-from-s3.png` } : {});
    await rotate(page, false); expectUnstuckAt3(await state(page), mode, '横から縦へ戻した段3');
    await keyTo(page, 4); expect((await state(page)).gs).toBe(true);
    await rotate(page, true);
    const l4 = await state(page); same(l4, l3, '段4 から回した横＝段3 から回した横');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/j-${f.id}-${mode}-${dayId}-from-s4.png` });
    expect((await page.screenshot()).equals(shot3), '段4 から回した横の絵＝段3 から回した横の絵').toBe(true);
    await rotate(page, false); await keyTo(page, 3); expectUnstuckAt3(await state(page), mode, '横→縦・段4→段3');
  });
}

// §18-7 の終わり: 見出しの「カード」ボタンで時間軸→カード。貼る・貼らないは一瞬で切り替わる（つまみのアニメーション 0・途中の不透明度なし）
for (const [form, dayId, from, T0, T1] of [
  ['縦・帯なし', 'ad1-t6', 'B', 273, 233],
  ['縦・帯あり', 'ad0-t6', 'C', 285, 185],
]) {
  test(`S11j §18-7 見出しの「カード」で ${from}→A（${form}・段3・${dayId}）: 貼らない（T ${T0}）→ 貼る（T ${T1}）が一瞬で切り替わる`, async ({ page }) => {
    const f = FORMS[form];
    await bootDay(page, form, from, DAYS[dayId].key, 3);
    const s0 = await state(page); expect(s0.dg).toBe(from); expect(Math.abs(s0.T - T0), `前提: T ${s0.T}`).toBeLessThanOrEqual(1); expect(s0.gs, `${from} は貼らない`).toBe(false);
    await page.evaluate(() => { window.__n = 0; window.__mid = 0; window.__stop = false; const tick = () => { const g = document.querySelector('.mpull.browse .mday .mdgrab'); if (g) { window.__n += g.getAnimations().length; let op = 1; for (let e = g; e && e !== document.body; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); if (op > 0.02 && op < 0.98) window.__mid++; } if (!window.__stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const back = page.locator('.mpull.browse .mday .mdback'); await expect(back).toBeVisible(); await expect(back).toHaveText('カード');
    await back.click();
    await expect(page.locator('.mpull.browse .mday')).toHaveAttribute('data-dg', 'A');
    const s1 = await state(page); expect(s1.gs, '切り替えた直後にもう貼っている').toBe(true); expect(s1.op).toBe(1);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { window.__stop = true; return { n: window.__n, mid: window.__mid }; });
    const s = await state(page); expect(s.dg).toBe('A'); expect(Math.abs(s.T - T1), `A の T ${s.T}`).toBeLessThanOrEqual(1); expect(s.gs).toBe(true); expect(s.stuck).toBe(true); near(s.gripTop, f.gripTop, 'つまみの上端');
    expect(s.first.top + 56, '最初のカードがまるごと見える').toBeLessThanOrEqual(s.gripTop + 0.6);
    expect(await page.locator('.mpull.browse .mday .mdback').count(), 'カードでは「カード」ボタンは出ない').toBe(0);
    expect(r.n, 'つまみのアニメーション 0').toBe(0); expect(r.mid, '途中の不透明度のコマ 0').toBe(0);
  });
}
