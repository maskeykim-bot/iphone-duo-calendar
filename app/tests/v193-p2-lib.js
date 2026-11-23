// 第19.3版 その2 の試験の共通の道具（閉じた縦 466×678・右の帯 84 を主に）
import { openApp, seed, ev, SIZES } from './helpers.js';

export const DAY = '2026-11-12', EMPTY = '2026-11-16';
const hh = (n) => String(n).padStart(2, '0');
export const DATA = [
  ...['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${hh(9 + i)}:00`, `${DAY}T${hh(9 + i)}:30`)),
  ev('ad', '終日の予定', `${DAY}T00:00`, `${DAY}T23:59`, { all: true }),
  ev('wk', '月末の会議', '2026-11-28T10:00', '2026-11-28T11:00'),
];
// dg: 0＝カード、1＝時間・最低限、2＝時間・詳細（state.dayGrip）。hint=false にすると「バーを下へ引くと…」の札を出す端末（まだ見ていない）として起動
export async function boot(page, { stage = 4, dg = 0, sel = DAY, sar = 84, size = SIZES.closedPortrait, reduced = false, data = DATA, hint = true, ui = {} } = {}) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((v) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${v}px`)), sar);
  await page.addInitScript(({ s, d, st, hint, ui }) => {
    if (sessionStorage.getItem('v193p2')) return; sessionStorage.setItem('v193p2', '1');
    localStorage.setItem('duo.ui.v1', JSON.stringify({ home: false, monthForm: 'month', monthDay: 'list', selected: s, dayGrip: d, stage: st, ...ui })); localStorage.setItem('duo.hint.pull', '1');
    if (hint) localStorage.setItem('duo.hint.daybar', '1');
  }, { s: sel, d: dg, st: stage, hint, ui });
  await openApp(page, size);
  if (data) await seed(page, data);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__duoHapticLog.length = 0; });
}
export const SEC = '.mpull.browse';
export const stageOf = (page) => page.locator(SEC).evaluate((e) => Number(e.dataset.stage));
export const haptics = (page) => page.evaluate(() => window.__duoHapticLog.map((h) => ({ ...h, t: 0 })));
export const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')));
export const scTop = (page) => page.locator(SEC).evaluate((e) => e.scrollTop);
export const setScroll = async (page, v) => { await page.locator(SEC).evaluate((e, y) => { e.scrollTop = y; }, v); await page.waitForTimeout(250); };
export const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom, r: b.right }; }, sel);
// 1時間の高さ（となり合う時刻の線の間）と、--hh
export const hourGap = (page) => page.evaluate(() => { const l = [...document.querySelectorAll('.mpull.browse .mday .hl:not(.half)')]; return l[11].getBoundingClientRect().top - l[10].getBoundingClientRect().top; });
// 時間軸の m 分の線の y
export const lineY = (page, m) => page.evaluate((mm) => [...document.querySelectorAll('.mpull.browse .mday .hl:not(.half)')].find((e) => Number(e.style.getPropertyValue('--m')) === mm).getBoundingClientRect().top, m);
export const toTime = async (page) => { await page.locator('.mpull.browse .mdct [data-dg="time"]').click(); await page.waitForTimeout(350); };
export const toCard = async (page) => { await page.locator('.mpull.browse .mdct [data-dg="card"]').click(); await page.waitForTimeout(350); };
export const barPt = async (page) => { const g = await rect(page, '.mpull.browse .mdgrab'); return { x: g.x + g.w / 2, y: g.y + g.h / 2 }; };
// マウスで引く。hold: 離す前に止める時間（ms。120 以上なら はらいの速さ 0）。up=false なら押したまま
export async function mouseDrag(page, x0, y0, x1, y1, { steps = 12, hold = 0, up = true, settle = 450 } = {}) { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps }); if (hold) await page.waitForTimeout(hold); if (up) { await page.mouse.up(); await page.waitForTimeout(settle); } }
// 指（pointerType:touch）の動きを pointer の出来事で送る（両エンジン共通）
export async function touchDrag(page, x0, y0, x1, y1, { steps = 12, hold = 0, settle = 450 } = {}) {
  await page.evaluate(async ({ x0, y0, x1, y1, steps, hold }) => {
    const t = document.elementFromPoint(x0, y0); const o = (x, y) => ({ bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
    t.dispatchEvent(new PointerEvent('pointerdown', o(x0, y0)));
    for (let i = 1; i <= steps; i++) { window.dispatchEvent(new PointerEvent('pointermove', o(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps))); await new Promise((r) => requestAnimationFrame(r)); }
    if (hold) await new Promise((r) => setTimeout(r, hold));
    window.dispatchEvent(new PointerEvent('pointerup', { ...o(x1, y1), buttons: 0 }));
  }, { x0, y0, x1, y1, steps, hold });
  await page.waitForTimeout(settle);
}
export const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
