// 第19.3版 その2 F の試験の共通の道具（v193-note-tasks.spec.js と v193-design35-s9.spec.js が使う）
import { expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

export const DAY = '2026-11-12', OTHER = '2026-11-18';
export const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
export const notes = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listNotes({ includeDeleted: true })).map((n) => ({ id: n.id, body: n.body, date: n.date ?? null, sourceDate: n.sourceDate ?? null, deletedAt: n.deletedAt ?? null })));
// その日のノート。日の欄から新しく作ったノートは 1 行目が日付の見出し（「2026年11月12日（木）」。今までの決まり）なので、比べるときは見出しを除く（raw に元の本文）
export const strip = (b) => String(b ?? '').replace(/^\d{4}年\d+月\d+日（.）\n/, '');
export const dayNote = async (page, day = DAY) => { const n = (await notes(page)).find((x) => x.date === day && !x.deletedAt); return n ? { ...n, raw: n.body, body: strip(n.body) } : null; };
export const tasks = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listTasks()).map((t) => ({ id: t.id, title: t.title, due: t.due, done: t.done, source: t.source ?? null, notify: t.notify, keys: Object.keys(t).sort().join(',') })));
export const ned = (page) => page.locator('.nsheet .ned-body');
export const val = (page) => ned(page).evaluate((b) => b.value);
export const base = (id, body, date, extra = {}) => ({ id, body, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null, ...extra });

export async function boot(page, { size = SIZES.closedPortrait, sar = 84 } = {}) {
  await page.addInitScript((v) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${v}px`)), Math.min(size.width, size.height) < 600 ? sar : 0);
  await page.addInitScript(() => { const k = 'duo.ui.v1'; if (sessionStorage.getItem('v193nt')) return; sessionStorage.setItem('v193nt', '1'); const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, monthDay: 'list', home: false, stage: 7 })); localStorage.setItem('duo.hint.pull', '1'); localStorage.setItem('duo.hint.daybar', '1'); });
  await openApp(page, size, '', { home: false });
}
// その日のノートを開く。開いた画面は日のページのノートの欄。
// v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 閉じた画面の日の欄は「ノートの欄」ではなくノートのカード。その日のノートがあればそのカードをたたき、無ければ「＋ ノート」で新しく作る
//（新しいノートは 1 行目が題名。キャレットは題名にある＝そのまま題名を打って Enter で本文へ）
export async function openDayNote(page, day = DAY) {
  const dn = page.locator(`[data-act="daynote"][data-day="${day}"]`).filter({ visible: true }).first();
  if (await dn.count()) { await dn.scrollIntoViewIfNeeded(); await dn.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(350); await ned(page).click(); return; }
  const card = page.locator(`.mpull.browse .mday .mdcard[data-note][data-sday="${day}"]`).first();
  if (await card.count()) { await card.evaluate((e) => e.scrollIntoView({ block: 'center' })); await card.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(350); await ned(page).click(); return; }
  const add = page.locator(`.mpull.browse .mday [data-act="addnote"][data-day="${day}"]`);
  await add.evaluate((e) => e.scrollIntoView({ block: 'center' })); await add.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(350);
}
export const check = (page) => page.locator('.nsheet .ned-top [data-fmt="check"]').click();
export const closeSheet = async (page) => { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(700); };
// 保存（1 秒の間あき）と突き合わせが済むまで待つ
export const saved = (page) => page.waitForTimeout(1500);
// 「買い物」＋チェック行（lines）を打つ
export async function typeList(page, lines, title = '買い物') {
  await page.keyboard.type(title); await page.keyboard.press('Enter');
  await check(page);
  for (const [i, l] of lines.entries()) { await page.keyboard.type(l); if (i < lines.length - 1) await page.keyboard.press('Enter'); }
}

