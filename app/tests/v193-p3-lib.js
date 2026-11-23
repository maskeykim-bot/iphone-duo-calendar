// 第19.3版 その3（カード：予定・タスク・ノートを同じカードにして別の日へ動かす）の試験の共通の道具。閉じた縦 466×678・右の帯 84 を主に
import { reloadKeep, ev, SIZES } from './helpers.js';
import { boot as boot2 } from './v193-p2-lib.js';

export const DAY = '2026-11-12', D13 = '2026-11-13', D14 = '2026-11-14', D16 = '2026-11-16';
export const note = (id, body, date, extra = {}) => ({ id, body, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null, ...extra });
export const task = (id, title, due, extra = {}) => ({ id, title, due, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false, ...extra });
export const EVENTS = [ev('e1', '会議', `${DAY}T09:00`, `${DAY}T10:00`, { notes: '資料を印刷して持参' }), ev('e2', 'ランチ', `${DAY}T12:00`, `${DAY}T13:00`)];
export const TASKS = [task('t1', '見積もりを送る', { date: DAY, time: '18:00' })];
export const NOTES = [note('n1', '買い物\n牛乳・卵・食パン・コーヒー豆', DAY)];
// 予定・タスク・ノートを入れて起動する（閉じた縦・段 6＝2週・カード）。o は v193-p2-lib の boot と同じ（size・stage・dg・sel・sar・reduced・ui）
export async function boot(page, { events = EVENTS, tasks = TASKS, notes = NOTES, ...o } = {}) {
  await boot2(page, { stage: 6, data: null, ...o });
  await page.evaluate(async ({ events, tasks, notes }) => {
    const db = await import('/js/db.js');
    if (events.length) await db.putMany(events);
    for (const t of tasks) await db.putTask(t);
    for (const n of notes) await db.putNote(n);
  }, { events, tasks, notes });
  await reloadKeep(page);
  await page.waitForTimeout(450);
  await page.evaluate(() => { window.__duoHapticLog.length = 0; window.__duoMoveLog = []; });
}
export const SEC = '.mpull.browse';
export const rect = (page, sel) => page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom, r: b.right, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; }, sel);
export const css = (page, sel, prop) => page.evaluate(([s, p]) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); return e ? getComputedStyle(e)[p] : null; }, [sel, prop]);
export const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
export const cardSel = (kind, id) => `.mday .mdcard[data-${kind}="${id}"]`;
export const cell = (k) => `.week .day[data-date="${k}"]`;
export const center = async (page, sel) => { const r = await rect(page, sel); return { x: r.cx, y: r.cy }; };
// 押したまま ms 待つ（0.35 秒で持ち上がる）
export async function hold(page, p, ms = 430) { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(ms); }
// 長押しで持ち上げて to まで運ぶ（離さない）
export async function carry(page, fromSel, toSel, { steps = 8, ms = 430 } = {}) {
  const a = await center(page, fromSel), b = typeof toSel === 'string' ? await center(page, toSel) : toSel;
  await hold(page, a, ms); await page.mouse.move(b.x, b.y, { steps }); await page.waitForTimeout(60);
  return { a, b };
}
// 長押し → 運ぶ → 落とす
export async function dropOn(page, fromSel, toSel, o = {}) { const r = await carry(page, fromSel, toSel, o); await page.mouse.up(); await page.waitForTimeout(o.settle ?? 350); return r; }
export const mvlog = (page) => page.evaluate(() => (window.__duoMoveLog || []).map((x) => ({ ...x })));
export const toast = (page) => page.locator('#native-toast');
export const dbTasks = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listTasks()).map((t) => ({ ...t })));
export const dbNotes = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listNotes({ includeDeleted: true })).map((n) => ({ ...n })));
export const dbEvs = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listEvents()).map((e) => ({ ...e })));
export const status = (page) => page.locator('#status').textContent();
export { SIZES, ev };
