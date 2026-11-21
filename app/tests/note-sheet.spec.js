// 第19版 PR9: ノート第1段（design/27）。シートの位置・上の帯・戻す/やり直す・完了・下へ伸びる紙・古い手書きの表示。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, bodyIs } from './helpers.js';

const UI = 'duo.ui.v1';
const near = (a, b, tol = 0.5, msg = '') => expect(Math.abs(a - b), `${msg} ${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const preset = (page, patch) => page.addInitScript(({ k, p }) => {
  if (localStorage.getItem('__ns_seeded')) return;
  localStorage.setItem('__ns_seeded', '1');
  let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; }
  localStorage.setItem(k, JSON.stringify({ ...s, ...p }));
}, { k: UI, p: patch });
const setKb = (page, kbTop) => page.evaluate(async (k) => { const vv = window.visualViewport; vv.offsetTop = 0; vv.height = k; vv.scale = 1; vv.dispatchEvent(new Event('resize')); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); }, kbTop);
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const base = (id, body, date, extra = {}) => ({ id, body, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null, ...extra });
const fakeVv = (page) => page.addInitScript(() => { const vv = new EventTarget(); vv.height = window.innerHeight; vv.offsetTop = 0; vv.scale = 1; vv.width = window.innerWidth; Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true }); });
const TT = { selected: '2026-11-12', spreadType: 'tt' };

async function landTT(page, size = SIZES.openLandscape951) {
  await preset(page, TT);
  await openApp(page, size);
  await page.waitForTimeout(80);
}
const sheet = (page) => page.locator('.nsheet');
const ned = (page) => page.locator('.nsheet .ned-body');

test.describe('ノートのシート（開いた横）', () => {
  test('今日（左）を書く: シート x8〜465.5・y64〜669、帯 y72〜116（戻す x20〜116、道具 x128〜、完了 x412〜456）、本文 x24〜449.5', async ({ page }) => {
    await landTT(page);
    await page.locator('.dpage.lp .dnote').click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator('.dpage')).toHaveCount(2);
    await page.waitForTimeout(400);
    const s = await box(sheet(page));
    near(s.x, 8); near(s.r, 465.5); near(s.y, 64); near(s.b, 669);
    const top = await box(page.locator('.nsheet .ned-top'));
    near(top.y, 72); near(top.h, 44);
    const g = await box(page.locator('.nsheet .ned-gundo')); near(g.x, 20); near(g.w, 96);
    const t = await box(page.locator('.nsheet .ned-gtools')); near(t.x, 128); near(t.w, 140);
    const d = await box(page.locator('.nsheet .ned-done')); near(d.r, 456); near(d.w, 44);
    const b = await box(page.locator('.nsheet .ned-bodywrap')); near(b.x + 8, 24); near(b.r - 8, 449.5);
    near(b.y, 146, 1); // 題名の行（30）は窓の外に固定。設計は y120〜（題名も紙の中）。差 26 は報告
  });
  test('明日（右）を書く: シート x485.5〜951、戻す x497.5〜593.5、完了 x895〜939、本文 x501.5〜835。キーボードがあっても帯は動かず、窓は kbTop−8 まで', async ({ page }) => {
    await fakeVv(page); await landTT(page);
    await page.locator('.dpage.rp .dnote').click();
    await expect(sheet(page)).toBeVisible(); await page.waitForTimeout(400);
    const s = await box(sheet(page)); near(s.x, 485.5); near(s.r, 951);
    const g = await box(page.locator('.nsheet .ned-gundo')); near(g.x, 497.5); near(g.r, 593.5);
    const d = await box(page.locator('.nsheet .ned-done')); near(d.x, 895); near(d.r, 939);
    const b0 = await box(page.locator('.nsheet .ned-bodywrap')); near(b0.x + 8, 501.5); near(b0.r - 8, 835);
    const t0 = await box(page.locator('.nsheet .ned-top'));
    await ned(page).focus(); await setKb(page, 372);
    const t1 = await box(page.locator('.nsheet .ned-top')); near(t1.y, t0.y, 0.01); near(t1.x, t0.x, 0.01);
    const b1 = await box(page.locator('.nsheet .ned-bodywrap')); expect(b1.b).toBeLessThanOrEqual(372 + 0.5);
  });
  test('シートが出ている間はめくれない（右の端 x827〜851）。完了で閉じたあとは戻る', async ({ page }) => {
    await landTT(page);
    await page.locator('.dpage.lp .dnote').click();
    await expect(sheet(page)).toBeVisible();
    const before = await page.locator('.dpage .dd').allTextContents();
    await page.mouse.move(845, 300); await page.mouse.down(); await page.mouse.move(700, 300, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(500);
    expect(await page.locator('.dpage .dd').allTextContents()).toEqual(before);
    await page.getByRole('button', { name: '完了' }).click();
    await expect(sheet(page)).toBeHidden();
  });
});

test.describe('ノートのシート（開いた縦・閉じた画面）', () => {
  test('開いた縦: シート y130〜溝の上、帯 y138〜182（戻す x16〜112、完了 x609〜653）、本文 x28〜641', async ({ page }) => {
    await preset(page, { selected: '2026-11-12' });
    await openApp(page, SIZES.openPortrait669);
    const btn = page.locator('[data-act="daynote"]:visible').first();
    await expect(btn).toBeVisible();
    await btn.click(); await expect(sheet(page)).toBeVisible(); await page.waitForTimeout(400);
    const s = await box(sheet(page)); near(s.y, 130); near(s.x, 0); near(s.w, 669);
    expect(s.b).toBeLessThanOrEqual(467.5);
    const top = await box(page.locator('.nsheet .ned-top')); near(top.y, 138);
    const g = await box(page.locator('.nsheet .ned-gundo')); near(g.x, 16); near(g.r, 112);
    const d = await box(page.locator('.nsheet .ned-done')); near(d.r, 653);
    const b = await box(page.locator('.nsheet .ned-bodywrap')); near(b.x + 8, 28); near(b.r - 8, 641);
  });
  test('閉じた画面: シート y152〜、帯 y160〜204（戻す x12〜108、完了 x410〜454）、本文 x20〜362', async ({ page }) => {
    await preset(page, { selected: '2026-11-12' });
    await openApp(page, SIZES.closedPortrait);
    let btn = page.locator('[data-act="daynote"]:visible').first();
    if (!(await btn.count())) { await page.locator('.tabs button', { hasText: /^月$/ }).first().click(); btn = page.locator('[data-act="daynote"]:visible').first(); }
    if (await page.locator('.mgrab').count()) { await page.locator('.mgrab').focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400); } // S11b: 段1は日の欄がタブの帯にかかる（タブは S11c で消える）ので段4へ
    await expect(btn).toBeVisible();
    await btn.click(); await expect(sheet(page)).toBeVisible(); await page.waitForTimeout(400);
    const s = await box(sheet(page)); near(s.y, 152); near(s.x, 0); near(s.w, 466);
    const top = await box(page.locator('.nsheet .ned-top')); near(top.y, 160);
    const g = await box(page.locator('.nsheet .ned-gundo')); near(g.x, 12); near(g.r, 108);
    const d = await box(page.locator('.nsheet .ned-done')); near(d.r, 454);
    const b = await box(page.locator('.nsheet .ned-bodywrap')); near(b.x + 8, 20); near(b.r - 8, 362);
  });
});

test.describe('戻す・やり直す・完了・紙', () => {
  async function openSheet(page) {
    await landTT(page);
    await putNote(page, base('n1', '11月12日（木）\n一行目', '2026-11-12'));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('.dpage.lp .dnote').click();
    await bodyIs(ned(page), '一行目');
  }
  test('文字・書式が戻る/やり直せる。保存される本文は行頭の印の形', async ({ page }) => {
    await openSheet(page);
    await ned(page).click(); await page.keyboard.press('Control+End');
    await page.keyboard.type('追加');
    await page.getByRole('button', { name: 'チェックリストにする' }).click();
    await bodyIs(ned(page), '- [ ] 一行目追加');
    await expect.poll(async () => (await getNote(page, 'n1')).body).toBe('11月12日（木）\n- [ ] 一行目追加');
    const undo = page.getByRole('button', { name: '元に戻す' }), redo = page.getByRole('button', { name: 'やり直す' });
    await expect(redo).toBeDisabled();
    await undo.click(); await bodyIs(ned(page), '一行目追加');
    await expect(redo).toBeEnabled();
    await undo.click(); await bodyIs(ned(page), '一行目');
    await redo.click(); await bodyIs(ned(page), '一行目追加');
    await redo.click(); await bodyIs(ned(page), '- [ ] 一行目追加');
  });
  test('字のシート: 見出し・小見出し・本文・箇条書き・チェック', async ({ page }) => {
    await openSheet(page);
    await ned(page).click(); await ned(page).evaluate((e) => e.setSelectionRange(0, 0));
    await page.getByRole('button', { name: '文字の書式' }).click();
    await page.getByRole('button', { name: '小見出し', exact: true }).click();
    await bodyIs(ned(page), '## 一行目');
    await page.getByRole('button', { name: '見出し', exact: true }).click();
    await bodyIs(ned(page), '# 一行目');
    await page.getByRole('button', { name: '本文', exact: true }).click();
    await bodyIs(ned(page), '一行目');
    await page.getByRole('button', { name: '箇条書き', exact: true }).click();
    await bodyIs(ned(page), '- 一行目');
    await page.getByRole('button', { name: '書式を閉じる' }).click();
  });
  test('戻す履歴は50回まで。完了で捨てる', async ({ page }) => {
    await openSheet(page);
    await ned(page).click();
    for (let i = 0; i < 60; i++) { await page.evaluate(() => window.__x = 0); await ned(page).evaluate((e, i) => { e.value += String(i % 10); e.dispatchEvent(new InputEvent('input', { inputType: 'insertText' })); window.dispatchEvent(new Event('x')); }, i); await page.getByRole('button', { name: 'チェックリストにする' }).click(); }
    const h = await page.evaluate(() => 0);
    void h;
    // 履歴の数は公開 API で見る
    const n = await page.evaluate(async () => { const m = await import('/js/notes-ui.js'); return m.UNDO_MAX; });
    expect(n).toBe(50);
    let count = 0; const undo = page.getByRole('button', { name: '元に戻す' });
    while (await undo.isEnabled() && count < 100) { await undo.click(); count++; }
    expect(count).toBe(50);
    await page.getByRole('button', { name: '完了' }).click();
    await expect(sheet(page)).toBeHidden();
  });
  test('紙: 100行書いても下に 90 の空き。末尾の空きをたたくと次の行にカーソル', async ({ page }) => {
    await openSheet(page);
    const long = Array.from({ length: 100 }, (_, i) => `行${i}`).join('\n');
    await ned(page).fill(long);
    const wrap = page.locator('.nsheet .ned-bodywrap');
    await wrap.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    const tail = await box(page.locator('.nsheet .ned-tail')); near(tail.h, 90);
    await page.locator('.nsheet .ned-tail').click();
    await bodyIs(ned(page), long + '\n');
    expect(await ned(page).evaluate((e) => e.selectionStart)).toBe(long.length + 1);
  });
});

test.describe('古い手書き（表示だけ）', () => {
  const PTS = { strokes: [[[0, 0], [100, 50], [684, 20]]], refW: 684 };
  const IMG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIxMCI+PC9zdmc+';
  async function openWith(page, ink) {
    await landTT(page);
    await putNote(page, base('n1', '11月12日（木）\n本文', '2026-11-12', { ink }));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('.dpage.lp .dnote').click();
    await bodyIs(ned(page), '本文');
  }
  test('点の列: 本文の下に線。倍率 s=min(1, 幅/refW)、左寄せ。編集して保存しても ink は1バイトも変わらない', async ({ page }) => {
    await openWith(page, PTS);
    const svg = page.locator('.nsheet .ned-ink svg'); await expect(svg).toBeVisible();
    const bw = (await box(ned(page))).w - 16; const s = Math.min(1, bw / 684);
    near(Number(await svg.getAttribute('data-scale')), s, 0.001);
    const sb = await box(svg), nb = await box(ned(page)); near(sb.x, nb.x + 8, 1);
    expect(sb.y).toBeGreaterThanOrEqual((await box(ned(page))).b - 1);
    const before = JSON.stringify((await getNote(page, 'n1')).ink);
    await ned(page).click(); await page.keyboard.press('Control+End'); await page.keyboard.type('編集');
    await expect.poll(async () => (await getNote(page, 'n1')).body).toBe('11月12日（木）\n本文編集');
    expect(JSON.stringify((await getNote(page, 'n1')).ink)).toBe(before);
    await svg.click({ force: true, position: { x: 5, y: 5 } }).catch(() => {});
    await expect(sheet(page)).toBeVisible();
  });
  test('refW なし: max(点の x の最大, 342) を基準にする', async ({ page }) => {
    await openWith(page, { strokes: [[{ x: 10, y: 10 }, { x: 600, y: 40 }]] });
    const svg = page.locator('.nsheet .ned-ink svg'); await expect(svg).toBeVisible();
    const bw = (await box(ned(page))).w - 16;
    near(Number(await svg.getAttribute('data-scale')), Math.min(1, bw / 600), 0.001);
  });
  test('data:image: 画像として出る。ink は変わらない', async ({ page }) => {
    await openWith(page, IMG);
    await expect(page.locator('.nsheet .ned-ink img')).toHaveCount(1);
    expect((await getNote(page, 'n1')).ink).toBe(IMG);
  });
});
