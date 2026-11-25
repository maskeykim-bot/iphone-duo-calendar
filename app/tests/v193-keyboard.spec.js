// 第19.3版 その2 D（征希さん「テキストの詳細がキーボードに隠れるから使えない」「予定を入れる時、メモを書きたいがキーボードに隠れて書けない」）の試験（実装担当）。Chromium と WebKit の両方。
// キーボードは 2 通りに模す: vv＝visualViewport が縮む（今までの試験と同じ）、native＝visualViewport は縮まず、@capacitor/keyboard の出来事（keyboardWillShow の keyboardHeight）だけが来る
//（実機はプラグインが WKWebView のキーボードの通知の購読を外すので、こちらの形になることがある。v19.2 まではこの形でシートがキーボードの下に残った）。
// 4 つの姿勢（閉じた縦 466×678・閉じた横 678×466・開いた縦 669×951・開いた横 951×669）で、予定のメモ欄・ノートの本文・書式のシート・タスクのメモ欄を見る。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, dayNoteEntry } from './helpers.js';
import { T, seedTasks } from './task-helpers.js';

const POST = [
  ['閉じた縦', 'closed', SIZES.closedPortrait, 372],
  ['閉じた横', 'closedland', SIZES.closedLandscape, 236],
  ['開いた縦', 'openp', SIZES.openPortrait669, 590],
  ['開いた横', 'openl', SIZES.openLandscape951, 372],
];
const SHOTS = process.env.V193_SHOTS || '';
async function boot(page, size, { sar = null, ui = null } = {}) {
  await page.addInitScript(({ closed, sar, ui }) => {
    const vv = new EventTarget(); vv.height = window.innerHeight; vv.offsetTop = 0; vv.scale = 1; vv.width = window.innerWidth;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar ?? (closed ? 84 : 0)}px`));
    try { localStorage.setItem('duo.hint.pull', '1'); localStorage.setItem('duo.hint.daybar', '1'); if (ui && !sessionStorage.getItem('v193kb')) { sessionStorage.setItem('v193kb', '1'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'), ...ui })); } } catch { /* */ }
  }, { closed: Math.min(size.width, size.height) < 600, sar, ui });
  await openApp(page, size, '', { home: false });
}
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)))));
// キーボードを出す／下げる。how='vv' は visualViewport、'native' はプラグインの出来事だけ
async function showKb(page, how, kbTop) {
  await page.evaluate(([how, k]) => {
    if (how === 'vv') { const vv = window.visualViewport; vv.offsetTop = 0; vv.height = k; vv.dispatchEvent(new Event('resize')); }
    else for (const n of ['keyboardWillShow', 'keyboardDidShow']) window.dispatchEvent(Object.assign(new Event(n), { keyboardHeight: window.innerHeight - k }));
  }, [how, kbTop]);
  await settle(page);
}
async function hideKb(page, how) {
  await page.evaluate((how) => {
    if (how === 'vv') { const vv = window.visualViewport; vv.offsetTop = 0; vv.height = window.innerHeight; vv.dispatchEvent(new Event('resize')); }
    else for (const n of ['keyboardWillHide', 'keyboardDidHide']) window.dispatchEvent(new Event(n));
  }, how);
  await settle(page);
}
const box = (page, sel) => page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, b: b.bottom, r: b.right }; }, sel);
// 入力中の textarea の「打っている行」（キャレットの行）の画面上の矩形
const caretOfTextarea = (page, sel) => page.evaluate((s) => {
  const ta = document.querySelector(s), cs = getComputedStyle(ta), m = document.createElement('div');
  m.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;width:${ta.clientWidth}px;font:${cs.font};padding:${cs.padding};line-height:${cs.lineHeight}`;
  m.textContent = ta.value.slice(0, ta.selectionEnd); const k = document.createElement('span'); k.textContent = '​'; m.append(k); document.body.append(m);
  const lh = parseFloat(cs.lineHeight) || 24, top = k.offsetTop; m.remove();
  const r = ta.getBoundingClientRect();
  return { top: r.top + top - ta.scrollTop, bottom: r.top + top + lh - ta.scrollTop, taTop: r.top, taBottom: r.bottom };
}, sel);
const caretOfNote = (page) => page.evaluate(() => { const g = getSelection(); const rg = g.getRangeAt(0).cloneRange(); rg.collapse(false); let r = [...rg.getClientRects()].pop(); if (!r || !r.height) { let n = g.focusNode; while (n && !(n.parentNode?.classList?.contains('ned-body'))) n = n.parentNode; r = n.getBoundingClientRect(); } return { top: r.top, bottom: r.bottom }; });
const LINES = ['一行目', '二行目', '三行目', '四行目', '五行目', '六行目', '七行目'];

for (const [name, key, size, kbTop] of POST) for (const how of ['vv', 'native']) {
  test(`D-1 予定のメモ欄 ${name}・${how}: メモ欄と打っている行がいつもキーボードの上。行が増えても隠れない。キーボードを閉じると元のシートに戻る`, async ({ page }) => {
    await boot(page, size);
    await page.locator('[data-act="add"]:visible').first().click();
    await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350);
    const d0 = await box(page, '#editor');
    await page.locator('#f-notes').focus(); await showKb(page, how, kbTop);
    await expect(page.locator('html')).toHaveAttribute('data-kb', '1');
    const chk = async (tag) => {
      const d = await box(page, '#editor'), fb = await box(page, '#editor .fbody'), c = await caretOfTextarea(page, '#f-notes'), lab = await box(page, '#editor .enotes .dtk');
      expect(d.b, `${tag}: シートの下端 ${d.b} はキーボードの上端 ${kbTop} の上`).toBeLessThanOrEqual(kbTop - 8 + 0.5);
      expect(d.y, `${tag}: シートの上端は画面の中`).toBeGreaterThanOrEqual(0);
      expect(c.taBottom, `${tag}: メモ欄の下端 ${c.taBottom}`).toBeLessThanOrEqual(Math.min(fb.b, kbTop) + 0.5);
      expect(c.taTop, `${tag}: メモ欄の上端 ${c.taTop}`).toBeGreaterThanOrEqual(fb.y - 0.5);
      expect(c.bottom, `${tag}: 打っている行の下端 ${c.bottom}`).toBeLessThanOrEqual(Math.min(c.taBottom, kbTop) + 0.5);
      expect(c.top, `${tag}: 打っている行の上端 ${c.top}`).toBeGreaterThanOrEqual(Math.max(c.taTop, fb.y) - 0.5);
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.className, [d.x + d.w / 2, (c.top + c.bottom) / 2]);
      expect(hit, `${tag}: 打っている行の所に見えているのはメモ欄`).toBe('f-notes');
      return { d, lab };
    };
    await chk('出した直後');
    for (const [i, l] of LINES.entries()) { await page.keyboard.type(l); if (i < LINES.length - 1) await page.keyboard.press('Enter'); await settle(page); await chk(`${i + 1} 行目`); }
    expect(await page.locator('#f-notes').inputValue()).toBe(LINES.join('\n'));
    if (SHOTS && how === 'native') {
      await page.evaluate((k) => { const el = document.createElement('div'); el.id = '__kb'; el.style.cssText = `position:fixed;left:0;right:0;top:${k}px;bottom:0;z-index:99999;background:#D1D5DB;border-top:1px solid #9CA3AF;display:flex;align-items:center;justify-content:center;font:13px sans-serif;color:#4B5563`; el.textContent = 'キーボード（模したもの）'; document.documentElement.append(el); }, kbTop);
      await page.screenshot({ path: `${SHOTS}/p2-kb-event-memo-${key}.png` });
      await page.evaluate(() => document.getElementById('__kb')?.remove());
    }
    // 途中の行へキャレットを戻しても、その行が見える
    await page.locator('#f-notes').evaluate((t) => { t.setSelectionRange(2, 2); document.dispatchEvent(new Event('selectionchange')); }); await settle(page);
    await chk('1 行目へ戻した');
    await hideKb(page, how);
    await expect(page.locator('html')).not.toHaveAttribute('data-kb', '1');
    const d1 = await box(page, '#editor');
    for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(d1[k] - d0[k]), `閉じたあとのシートの ${k}`).toBeLessThanOrEqual(0.5);
  });
}

// ノートを開く（閉じた画面は日の欄のノート、開いた縦は日の部分のノートの欄、開いた横は手帳の見開き（左右とも日）の左のノートの欄）
const NOTE_UI = (key) => (key === 'openl' ? { selected: '2026-11-12', spreadType: 'tt' } : null);
async function openNote(page) {
  await dayNoteEntry(page).click();
  await expect(page.locator('.ned-body:visible').first()).toBeVisible(); await page.waitForTimeout(450);
  await page.locator('.ned-body:visible').first().click(); await page.waitForTimeout(150);
}
for (const [name, key, size, kbTop] of POST) for (const how of ['vv', 'native']) {
  test(`D-2 ノートの本文 ${name}・${how}: 打っている行がいつもキーボードの上（20 行打っても）。本文の窓の下端はキーボードの上。閉じると元に戻る`, async ({ page }) => {
    await boot(page, size, { ui: NOTE_UI(key) });
    await openNote(page);
    const w0 = await box(page, '.ned-bodywrap');
    await showKb(page, how, kbTop);
    const chk = async (tag) => {
      const c = await caretOfNote(page), w = await box(page, '.ned-bodywrap');
      expect(w.b, `${tag}: 本文の窓の下端 ${w.b}`).toBeLessThanOrEqual(kbTop + 0.5);
      expect(c.bottom, `${tag}: 打っている行の下端 ${c.bottom}`).toBeLessThanOrEqual(Math.min(w.b, kbTop) + 0.5);
      expect(c.top, `${tag}: 打っている行の上端 ${c.top}`).toBeGreaterThanOrEqual(w.y - 0.5);
    };
    await chk('出した直後');
    for (let i = 1; i <= 20; i++) { await page.keyboard.type(`${i} 行目の文字`); await page.keyboard.press('Enter'); if (i % 4 === 0) { await settle(page); await chk(`${i} 行`); } }
    await settle(page); await chk('20 行のあと');
    if (SHOTS && how === 'native' && key === 'closed') {
      await page.evaluate((k) => { const el = document.createElement('div'); el.id = '__kb'; el.style.cssText = `position:fixed;left:0;right:0;top:${k}px;bottom:0;z-index:99999;background:#D1D5DB;border-top:1px solid #9CA3AF;display:flex;align-items:center;justify-content:center;font:13px sans-serif;color:#4B5563`; el.textContent = 'キーボード（模したもの）'; document.documentElement.append(el); }, kbTop);
      await page.screenshot({ path: `${SHOTS}/p2-kb-note.png` });
      await page.evaluate(() => document.getElementById('__kb')?.remove());
    }
    await hideKb(page, how);
    const w1 = await box(page, '.ned-bodywrap');
    expect(Math.abs(w1.b - w0.b), '閉じたあとの本文の窓の下端').toBeLessThanOrEqual(0.5);
  });

  test(`D-3 書式のシート（文字の書式）${name}・${how}: キーボードが出ているときに開くと、キーボードを下げてその場所に出る。書式を変えてもキーボードを出し直さない。キーボードが残っていたらその上へ出る`, async ({ page }) => {
    await boot(page, size, { ui: NOTE_UI(key) });
    await openNote(page);
    await page.keyboard.type('牛乳');
    await showKb(page, how, kbTop);
    const fmtBtn = page.locator('.ned-fmt:visible [data-fmt="type"]').first();
    await fmtBtn.click(); await settle(page);
    const fs = page.locator('.ned-fsheet:visible');
    await expect(fs).toHaveCount(1);
    // 本文からフォーカスが外れている（＝実機ではキーボードが下がる）
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ned-body') || false), 'シートを開いたら本文のフォーカスを外す').toBe(false);
    const H = size.height, f0 = await box(page, '.ned-fsheet');
    expect(Math.abs(f0.h - (H - kbTop)), 'シートの高さ＝キーボードの高さ').toBeLessThanOrEqual(1);
    // ① キーボードが下がった（ふつうの流れ）: シートは画面の下端（キーボードがあった所）
    await hideKb(page, how); await page.waitForTimeout(600);
    const f1 = await box(page, '.ned-fsheet');
    expect(Math.abs(f1.b - H), '下端は画面の下端').toBeLessThanOrEqual(0.5); expect(Math.abs(f1.y - kbTop), '上端はキーボードの上端だった所').toBeLessThanOrEqual(1);
    // 書式を変えても本文へフォーカスを戻さない（キーボードを出し直さない）。本文は変わる
    await fs.locator('[data-fset="check"]').click(); await settle(page);
    expect(await page.locator('.ned-body:visible').first().evaluate((e) => e.value)).toBe('- [ ] 牛乳');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ned-body') || false), '書式を変えても本文にフォーカスを戻さない').toBe(false);
    await expect(fs.locator('[data-fset="check"]')).toHaveAttribute('aria-pressed', 'true');
    await fs.locator('[data-fset="bullet"]').click(); await settle(page);
    expect(await page.locator('.ned-body:visible').first().evaluate((e) => e.value)).toBe('- 牛乳');
    // ② それでもキーボードが出直した（出たままだった）ら、シートはキーボードの上端の上へ（裏に隠れない）
    await showKb(page, how, kbTop); await page.waitForTimeout(200);
    const f2 = await box(page, '.ned-fsheet');
    expect(f2.b, `シートの下端 ${f2.b} はキーボードの上端 ${kbTop} の上`).toBeLessThanOrEqual(kbTop + 0.5);
    for (const k of ['heading', 'plain', 'bullet', 'check']) { const b = await fs.locator(`[data-fset="${k}"]`).boundingBox(); expect(b.y + b.height, `「${k}」のボタンがキーボードの上`).toBeLessThanOrEqual(kbTop + 0.5); expect(b.y).toBeGreaterThanOrEqual(0); }
    await hideKb(page, how); await page.waitForTimeout(200);
    expect(Math.abs((await box(page, '.ned-fsheet')).b - H), 'キーボードが下がれば下端へ戻る').toBeLessThanOrEqual(0.5);
    // 閉じると本文へ戻り、キャレットは文字の位置のまま（続けて打てる）
    await fs.locator('[data-act="fsclose"]').click(); await settle(page);
    await expect(page.locator('.ned-fsheet:visible')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('ned-body') || false)).toBe(true);
    await page.keyboard.type('と卵');
    expect(await page.locator('.ned-body:visible').first().evaluate((e) => e.value)).toBe('- 牛乳と卵');
  });
}

// タスクの詳細（メモ欄）。閉じた画面・開いた横は編集シート（#taskdlg の #tk-notes）、開いた縦は「タスク」の画面で行を選んだ下の詳細（.ftcard のメモ欄）
async function openTaskEdit(page) {
  const closed = Math.min(page.viewportSize().width, page.viewportSize().height) < 600;
  if (closed) await page.locator('.cb.ctask').click();
  else if (await page.locator('.pgname.pgl:visible').count()) { await page.locator('.pgname.pgl').click(); await page.locator('.pgl [data-pick="task"]:visible').first().click(); } // v19.6（設計「見開き」・征希さん「各ページの上（設計どおり）」）で仕様変更: ページ名を押してから選ぶ。 // 開いた横: 左ページをタスクに
  else { // 開いた縦: 「タスク」の画面（上が一覧、下が詳細）
    await page.locator('[data-fmode="task"]:visible').first().click();
    await page.locator('.ftlist .rmrow .rmbody').first().click();
    await expect(page.locator('.ftcard [data-ft="notes"]')).toBeVisible(); await page.waitForTimeout(350);
    return { ta: '.ftcard [data-ft="notes"]', dlg: null };
  }
  await page.locator('[data-act="remedit"]:visible').first().click();
  await expect(page.locator('#taskdlg')).toBeVisible(); await page.waitForTimeout(350);
  return { ta: '#tk-notes', dlg: '#taskdlg' };
}
for (const [name, key, size, kbTop] of POST) for (const how of ['vv', 'native']) {
  test(`D-4 タスクのメモ欄 ${name}・${how}: メモ欄と打っている行がキーボードの上。行が増えても隠れない。閉じると元に戻る`, async ({ page }) => {
    await boot(page, size);
    await seedTasks(page, [T('k1', { title: '見積もりを送る' })]);
    const { ta, dlg } = await openTaskEdit(page);
    const d0 = dlg ? await box(page, dlg) : null, t0 = await box(page, ta);
    await page.locator(ta).focus(); await showKb(page, how, kbTop);
    const chk = async (tag) => {
      const d = dlg ? await box(page, dlg) : null, c = await caretOfTextarea(page, ta);
      if (d) expect(d.b, `${tag}: シートの下端 ${d.b}`).toBeLessThanOrEqual(kbTop + 0.5);
      expect(c.taBottom, `${tag}: メモ欄の下端 ${c.taBottom}`).toBeLessThanOrEqual(kbTop + 0.5);
      expect(c.bottom, `${tag}: 打っている行の下端 ${c.bottom}`).toBeLessThanOrEqual(Math.min(c.taBottom, kbTop) + 0.5);
      expect(c.top, `${tag}: 打っている行の上端 ${c.top}`).toBeGreaterThanOrEqual(Math.max(c.taTop, d ? d.y : 0) - 0.5);
      const hit = await page.evaluate(([s, y]) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, y) === e; }, [ta, (c.top + c.bottom) / 2]);
      expect(hit, `${tag}: 打っている行の所に見えているのはメモ欄`).toBe(true);
    };
    await chk('出した直後');
    for (const [i, l] of LINES.entries()) { await page.keyboard.type(l); if (i < LINES.length - 1) await page.keyboard.press('Enter'); await settle(page); await chk(`${i + 1} 行目`); }
    if (SHOTS && how === 'native' && key === 'closed') {
      await page.evaluate((k) => { const el = document.createElement('div'); el.id = '__kb'; el.style.cssText = `position:fixed;left:0;right:0;top:${k}px;bottom:0;z-index:99999;background:#D1D5DB;border-top:1px solid #9CA3AF;display:flex;align-items:center;justify-content:center;font:13px sans-serif;color:#4B5563`; el.textContent = 'キーボード（模したもの）'; document.documentElement.append(el); }, kbTop);
      await page.screenshot({ path: `${SHOTS}/p2-kb-task.png` });
      await page.evaluate(() => document.getElementById('__kb')?.remove());
    }
    await hideKb(page, how);
    if (dlg) { const d1 = await box(page, dlg); for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(d1[k] - d0[k]), `閉じたあとのシートの ${k}`).toBeLessThanOrEqual(0.5); }
    else { const t1 = await box(page, ta); expect(Math.abs(t1.x - t0.x) + Math.abs(t1.w - t0.w), '閉じたあとのメモ欄の位置と幅').toBeLessThanOrEqual(0.5); }
  });
}

test('D-5 プラグインの出来事と visualViewport の両方が来たら、上にある方（小さい kbTop）で決める。片方だけ消えても、もう片方が残っていればキーボードありのまま', async ({ page }) => {
  await boot(page, SIZES.closedPortrait);
  await page.locator('[data-act="add"]:visible').first().click(); await expect(page.locator('#editor')).toBeVisible(); await page.waitForTimeout(350);
  await page.locator('#f-notes').focus();
  await showKb(page, 'native', 400); expect((await box(page, '#editor')).b).toBeLessThanOrEqual(392.5);
  await showKb(page, 'vv', 372); expect((await box(page, '#editor')).b).toBeLessThanOrEqual(364.5);
  await hideKb(page, 'vv'); expect((await box(page, '#editor')).b).toBeLessThanOrEqual(392.5);
  await expect(page.locator('html')).toHaveAttribute('data-kb', '1');
  await hideKb(page, 'native');
  await expect(page.locator('html')).not.toHaveAttribute('data-kb', '1');
  // 不正な高さ（0・負・数でない）はキーボードなし
  for (const h of [0, -5, NaN, undefined]) { await page.evaluate((v) => window.dispatchEvent(Object.assign(new Event('keyboardWillShow'), { keyboardHeight: v })), h); await settle(page); await expect(page.locator('html')).not.toHaveAttribute('data-kb', '1'); }
});
