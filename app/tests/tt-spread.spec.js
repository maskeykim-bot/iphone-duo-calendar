// 第18版 PR1: 見開きの型「今日＋明日」と1日ページ。寸法は design/26 §1・§2（951×669・右の帯 84）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, swipe } from './helpers.js';

const UI = 'duo.ui.v1';
const setSafe = (page, { t = 0, r = 0, b = 0, l = 0 }) => page.evaluate(([t, r, b, l]) => {
  const s = document.documentElement.style;
  s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`);
}, [t, r, b, l]);
// 保存済みの設定を最初の1回だけ上書きして起動（再読み込みでは上書きしない）。
const preset = (page, patch) => page.addInitScript(({ k, p }) => {
  if (localStorage.getItem('__tt_seeded')) return;
  localStorage.setItem('__tt_seeded', '1');
  let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; }
  localStorage.setItem(k, JSON.stringify({ ...s, ...p }));
}, { k: UI, p: patch });
async function land(page, patch = null, events = null) {
  if (patch) await preset(page, patch);
  await openApp(page, SIZES.openLandscape951);
  if (events) await seed(page, events);
  await setSafe(page, { r: 84 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sar'))).toBe('84px');
  await page.waitForTimeout(80);
}
const ttBtn = (page) => page.locator('.ctl').getByRole('button', { name: '今日と明日の見開き', exact: true });
const near = (a, b, tol = 0.5, msg = '') => expect(Math.abs(a - b), `${msg} ${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const heads = (page) => page.locator('.dpage .dd').allTextContents();
const TT = { selected: '2026-11-12', spreadType: 'tt' };
// めくりが終わる（着地の 0.15 秒まで）のを待つ。めくっている間は次のめくりを始めない（第18版 PR4）
const settle = (page) => page.waitForFunction(() => !globalThis.__duoCurl?.state().busy);

test.describe('今日＋明日（開いた横）', () => {
  test('型の切替・保存・復元（再読み込み）、pages に戻すと元の左右へ', async ({ page }) => {
    await land(page);
    await expect(page.locator('.dpage')).toHaveCount(0);
    await expect(ttBtn(page)).toHaveAttribute('aria-pressed', 'false');
    const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).pages, UI);
    await ttBtn(page).click();
    await expect(page.locator('.dpage')).toHaveCount(2);
    await expect(ttBtn(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).spreadType, UI)).toBe('tt');
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, { r: 84 }); await page.waitForTimeout(80);
    await expect(page.locator('.dpage')).toHaveCount(2);
    await ttBtn(page).click();
    await expect(page.locator('.dpage')).toHaveCount(0);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).pages, UI)).toEqual(before); // 左右の種類は書き換えない
    await expect(page.locator('.page[data-page="month"]')).toHaveCount(1);
    await expect(page.locator('.page[data-page="time"]')).toHaveCount(1);
  });

  test('ボタン: 56×56・帯の中・他の操作と重ならない', async ({ page }) => {
    await land(page);
    const b = await box(ttBtn(page));
    near(b.w, 56); near(b.h, 56);
    expect(b.x).toBeGreaterThanOrEqual(867 - 0.5); expect(b.r).toBeLessThanOrEqual(951 + 0.5);
    for (const n of ['設定', '予定を検索', '今日に戻る', '予定を追加']) {
      const o = await box(page.locator('.ctl').getByRole('button', { name: n, exact: true }));
      const ov = Math.min(b.r, o.r) - Math.max(b.x, o.x) > 0.5 && Math.min(b.b, o.b) - Math.max(b.y, o.y) > 0.5;
      expect(ov, n).toBe(false);
    }
  });

  test('左右の矩形（x8〜465.5 / 485.5〜851・y0〜603）と1日ページの中 82/300/24/197、左右で縦の寸法が同じ', async ({ page }) => {
    await land(page, TT);
    const L = page.locator('.dpage.lp'), R = page.locator('.dpage.rp');
    const lb = await box(L), rb = await box(R);
    near(lb.x, 8); near(lb.r, 465.5); near(lb.y, 0); near(lb.b, 603);
    near(rb.x, 485.5); near(rb.r, 851); near(rb.y, 0); near(rb.b, 603);
    const parts = async (p) => ({ h: await box(p.locator('.dph')), e: await box(p.locator('.dev')), g: await box(p.locator('.dgrip')), n: await box(p.locator('.dnote')) });
    const a = await parts(L), c = await parts(R);
    for (const [k, [y, h]] of Object.entries({ h: [0, 82], e: [82, 300], g: [382, 24], n: [406, 197] })) {
      for (const p of [a, c]) { near(p[k].y, y, 0.5, k); near(p[k].h, h, 0.5, k); }
      near(a[k].y, c[k].y, 0.01, `左右 ${k}`); near(a[k].h, c[k].h, 0.01, `左右 ${k}`);
    }
    // 溝（465.5〜485.5）には何も置かない
    expect(await page.evaluate(() => [...document.querySelectorAll('.dpage *')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 465.6 && r.left < 485.4; }))).toBe(false);
    // つまみの見た目 36×4・押せる高さ 24
    const gi = await box(L.locator('.dgrip i'));
    near(gi.w, 36); near(gi.h, 4);
    // 時間軸: 時刻の列 16〜56（ページ左から）、予定の枠は 60 から右 20 まで
    const lab = await box(L.locator('.hlab').first()), col = await box(L.locator('.tlcol'));
    near(lab.x - lb.x, 16); near(lab.w, 40); near(col.x - lb.x, 60); near(lb.r - col.r, 20);
    // ノートの罫線 30 おき・左右 16 内側・#EEEAE1
    const nb = await box(L.locator('.dnote')); near(nb.x - lb.x, 16); near(lb.r - nb.r, 16);
    const bg = await L.locator('.dnote').evaluate((e) => getComputedStyle(e).backgroundImage);
    expect(bg).toContain('rgb(238, 234, 225)'); expect(bg).toContain('29px'); expect(bg).toContain('30px');
  });

  test('紙の色は左右とも #FFFDFA（この型のときだけ）', async ({ page }) => {
    await land(page, TT);
    for (const s of ['.dpage.lp', '.dpage.rp', '.shell.spread']) expect(await page.locator(s).evaluate((e) => getComputedStyle(e).backgroundColor), s).toBe('rgb(255, 253, 250)');
    await ttBtn(page).click();
    expect(await page.locator('.shell.spread').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('linear-gradient'); // 今の見開きは変わらない
  });

  test('日の見出し: 日付 20pt W600 左16・六曜 13pt 灰を右16', async ({ page }) => {
    await land(page, TT);
    const L = page.locator('.dpage.lp'), lb = await box(L);
    const dd = await box(L.locator('.dd')), rk = L.locator('.drk');
    near(dd.x - lb.x, 16);
    const f = await L.locator('.dd').evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight]; });
    expect(f).toEqual(['20px', '600']);
    if (await rk.count()) { near(lb.r - (await box(rk)).r, 16); expect(await rk.evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px'); }
  });

  test('つまみで左右一緒に動き保存される・ノート最小120・160未満で一覧', async ({ page }) => {
    await land(page, TT, [ev('a', '会議', '2026-11-12T10:00', '2026-11-12T11:00')]);
    const g = page.locator('.dpage.lp .dgrip'); let gb = await box(g);
    await page.mouse.move(gb.x + gb.w / 2, gb.y + 12); await page.mouse.down();
    await page.mouse.move(gb.x + gb.w / 2, gb.y + 12 + 40, { steps: 4 });
    // 引いている最中も左右一緒
    near((await box(page.locator('.dpage.lp .dev'))).h, 340); near((await box(page.locator('.dpage.rp .dev'))).h, 340);
    await page.mouse.up();
    for (const s of ['.dpage.lp', '.dpage.rp']) { near((await box(page.locator(`${s} .dev`))).h, 340); near((await box(page.locator(`${s} .dnote`))).y, 446); }
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).ttSplit, UI)).toBe(340);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, { r: 84 }); await page.waitForTimeout(80);
    near((await box(page.locator('.dpage.rp .dev'))).h, 340);
    // 下へ大きく: ノート欄は最小 120（予定欄の上限 377）
    gb = await box(page.locator('.dpage.lp .dgrip'));
    await page.mouse.move(gb.x + 30, gb.y + 12); await page.mouse.down(); await page.mouse.move(gb.x + 30, gb.y + 300, { steps: 5 }); await page.mouse.up();
    near((await box(page.locator('.dpage.lp .dnote'))).h, 120); near((await box(page.locator('.dpage.rp .dnote'))).h, 120);
    // 上へ大きく: 160 未満で一覧（1件 32）
    gb = await box(page.locator('.dpage.lp .dgrip'));
    await page.mouse.move(gb.x + 30, gb.y + 12); await page.mouse.down(); await page.mouse.move(gb.x + 30, gb.y - 250, { steps: 5 }); await page.mouse.up();
    await expect(page.locator('.dpage.lp .dlist')).toHaveCount(1);
    await expect(page.locator('.dpage.rp .dlist')).toHaveCount(1);
    await expect(page.locator('.dpage .tl')).toHaveCount(0);
    near((await box(page.locator('.dpage.lp .dlrow').first())).h, 32);
    // つまみは横スワイプ・めくりの起点にならない
    const sel0 = await heads(page);
    gb = await box(page.locator('.dpage.lp .dgrip'));
    await swipe(page, { x0: gb.x + 60, y0: gb.y + 12, dx: -150 });
    expect(await heads(page)).toEqual(sel0);
  });

  test('±2日（12・13 → 14・15）。月末・年末をまたぐ', async ({ page }) => {
    await land(page, TT);
    await swipe(page, { x0: 840, y0: 250, dx: -330 });
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    await settle(page);
    await swipe(page, { x0: 40, y0: 250, dx: 340 });
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), selected: '2026-11-29' })), UI);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, { r: 84 }); await page.waitForTimeout(80);
    expect(await heads(page)).toEqual(['11月29日（日）', '11月30日（月）']);
    await swipe(page, { x0: 840, y0: 250, dx: -330 });
    expect(await heads(page)).toEqual(['12月1日（火）', '12月2日（水）']);
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), selected: '2026-12-30' })), UI);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, { r: 84 }); await page.waitForTimeout(80);
    await swipe(page, { x0: 840, y0: 250, dx: -330 });
    const h = await heads(page);
    expect(h.map((x) => x.replace(/^2027年/, ''))).toEqual(['1月1日（金）元日', '1月2日（土）']);
  });

  test('型を変えても選んでいる日は変えない／日送りの 0.25 秒', async ({ page }) => {
    await land(page, { selected: '2026-11-18' });
    await ttBtn(page).click();
    expect(await heads(page)).toEqual(['11月18日（水）', '11月19日（木）']);
    await swipe(page, { x0: 840, y0: 250, dx: -330 });
    await ttBtn(page).click();
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).selected, UI)).toBe('2026-11-20');
    await ttBtn(page).click();
    // 紙をめくる絵（WebGL）が使えないときの逃げ：端に限らず今の横スワイプで ±2日、0.25 秒の横すべり（第18版 PR4）
    await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, { r: 84 }); await page.waitForTimeout(80);
    const t0 = Date.now();
    await swipe(page, { x0: 700, y0: 250, dx: -160 });
    const dt = Date.now() - t0;
    expect(dt, `すべり ${dt}ms`).toBeGreaterThanOrEqual(200); expect(dt).toBeLessThan(600);
  });

  test('時間軸のスクロール位置は左右で共通（日を送っても保つ）', async ({ page }) => {
    await land(page, TT);
    await page.locator('.dpage.lp .tl').evaluate((e) => { e.scrollTop = 333; });
    await expect.poll(() => page.locator('.dpage.rp .tl').evaluate((e) => e.scrollTop)).toBe(333);
    await page.locator('.dpage.rp .tl').evaluate((e) => { e.scrollTop = 200; });
    await expect.poll(() => page.locator('.dpage.lp .tl').evaluate((e) => e.scrollTop)).toBe(200);
    await swipe(page, { x0: 840, y0: 250, dx: -330 });
    expect(await page.locator('.dpage.lp .tl').evaluate((e) => e.scrollTop)).toBe(200);
    expect(await page.locator('.dpage.rp .tl').evaluate((e) => e.scrollTop)).toBe(200);
  });

  test('予定のタップで編集（左右どちらも）・1時間 60', async ({ page }) => {
    await land(page, TT, [ev('a', '左の会議', '2026-11-12T10:00', '2026-11-12T11:00'), ev('b', '右の会議', '2026-11-13T10:00', '2026-11-13T11:00')]);
    const l = page.locator('.dpage.lp .tlev'), r = page.locator('.dpage.rp .tlev');
    near((await box(l)).h, 59, 1.5);
    await l.click();
    await expect(page.locator('#editor')).toBeVisible();
    expect(await page.locator('#f-title').inputValue()).toBe('左の会議');
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeHidden();
    await r.click();
    await expect(page.locator('#editor')).toBeVisible();
    expect(await page.locator('#f-title').inputValue()).toBe('右の会議');
  });

  test('長押し 350ms で予定のなぞる入力（めくらない・日は変わらない）', async ({ page }) => {
    await land(page, TT);
    const col = await box(page.locator('.dpage.rp .tlcol'));
    const y = col.y + 12 + 14 * 60 - (await page.locator('.dpage.rp .tl').evaluate((e) => e.scrollTop)); // 14:00 付近
    const ty = Math.min(Math.max(y, 120), 360);
    await page.mouse.move(col.x + 80, ty); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(col.x + 90, ty + 50, { steps: 5 }); await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
  });

  test('ノート欄: 日付つきノートの本文を表示。0件=新規・1件=開く', async ({ page }) => {
    await land(page, TT);
    await expect(page.locator('.dpage.lp .dnt')).toHaveText('');
    await page.locator('.dpage.lp .dnote').click();
    // 第19版 PR9: 0件・1件はそのページの上にノートのシートが出る（ページは置き換わらない）
    await expect(page.locator('.nsheet .ned-body')).toBeVisible();
    await expect(page.locator('.dpage')).toHaveCount(2);
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page.locator('.nsheet')).toBeHidden();
  });

  test('ノート欄: 1件は本文を出してたたくと開く・複数は絞った一覧', async ({ page }) => {
    await preset(page, TT);
    await openApp(page, SIZES.openLandscape951);
    const base = (id, body, date, t) => ({ id, body, createdAt: 5, updatedAt: t, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null });
    await page.evaluate(async (list) => { const db = await import('/js/db.js'); for (const n of list) await db.putNote(n); }, [
      base('a', '11月12日（木）\n会議の準備', '2026-11-12', 10),
      base('b1', '重なりその1', '2026-11-13', 10), base('b2', '重なりその2', '2026-11-13', 20),
    ]);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, { r: 84 }); await page.waitForTimeout(80);
    await expect(page.locator('.dpage.lp .dnt')).toContainText('会議の準備');
    await expect(page.locator('.dpage.rp .dnt')).toHaveText('重なりその2'); // 複数は新しい1件目
    // 罫線に沿った行の高さ 30
    expect(await page.locator('.dpage.lp .dnt').evaluate((e) => getComputedStyle(e).lineHeight)).toBe('30px');
    await page.locator('.dpage.lp .dnote').click();
    await expect(page.locator('.nsheet .ned-body')).toBeVisible();
    await expect(page.locator('.nsheet .ned-body')).toHaveValue(/会議の準備/);
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page.locator('.nsheet')).toBeHidden();
    await page.locator('.dpage.rp .dnote').click();
    await expect(page.locator('.page[data-page="memo"]')).toHaveCount(1);
    await expect(page.locator('.page[data-page="memo"]')).toContainText('重なりその1');
    await expect(page.locator('.page[data-page="memo"]')).toContainText('重なりその2');
  });

  test('帯のタスク／メモで右ページを置き換えている間は今の見開き・pagesが既定で変わらない', async ({ page }) => {
    await land(page);
    await expect(page.locator('.dpage')).toHaveCount(0);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).spreadType ?? 'pages', UI)).toBe('pages');
  });

  test('不正な保存値は pages・予定欄の高さは既定300', async ({ page }) => {
    await land(page, { spreadType: 'zzz', ttSplit: 'x' });
    await expect(page.locator('.dpage')).toHaveCount(0);
    await ttBtn(page).click();
    near((await box(page.locator('.dpage.lp .dev'))).h, 300);
  });
});

test.describe('今日＋明日（開いた縦）', () => {
  test('上＝選択日・下＝次の日の1日ページ、横すべりで ±2日（0.25秒）。閉じた画面は型を無視', async ({ page }) => {
    await preset(page, TT);
    await openApp(page, SIZES.openPortrait669);
    await expect(page.locator('.dpage')).toHaveCount(2);
    const a = await box(page.locator('.dpage.lp')), b = await box(page.locator('.dpage.rp'));
    expect(b.y).toBeGreaterThanOrEqual(a.b - 1); near(a.w, 669, 1); near(b.w, 669, 1);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    const t0 = Date.now();
    await swipe(page, { x0: 500, y0: a.y + 200, dx: -200 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    await swipe(page, { x0: 200, y0: b.y + 100, dx: 200 });
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    // 閉じた画面
    await page.setViewportSize(SIZES.closedPortrait);
    await expect(page.locator('.dpage')).toHaveCount(0);
  });
});
