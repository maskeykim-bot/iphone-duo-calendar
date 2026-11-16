import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

// 第14版 PR4: 左右ページの状態と描画の分離
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
const seedPages = async (page, pages) => {
  await page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, pages: p })); }, pages);
  await page.reload(); await page.waitForSelector('html[data-ready]');
};

test('既定は 左=月 右=時間。pages が保存され、旧 home/view も残る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await expect(page.locator('.page.lp[data-page="month"] .week').first()).toBeVisible();
  await expect(page.locator('.page.rp[data-page="time"] .tl[data-pane="right"]')).toBeVisible();
  await expect(page.locator('.tl')).toHaveCount(1);
  await page.getByRole('button', { name: '次の月' }).click(); // set() で保存
  const s = await ui(page);
  expect(s.pages).toEqual({ left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false });
  expect(s.view).toBe('month');
});

test('壊れた pages は既定へ。重複は別種類にする', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'junk', right: 3 });
  await expect(page.locator('.page.lp')).toHaveAttribute('data-page', 'month');
  await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
  await seedPages(page, { left: 'time', right: 'time' });
  const kinds = await page.locator('.page').evaluateAll((l) => l.map((e) => e.dataset.page));
  expect(kinds[0]).toBe('time'); expect(kinds[1]).not.toBe('time');
});

test('左を時間・右を月にしても描ける。時間軸は左ペイン単位', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'time', right: 'month' });
  await expect(page.locator('.page.lp .tl[data-pane="left"]')).toBeVisible();
  await expect(page.locator('.page.rp[data-page="month"] .week').first()).toBeVisible();
  await expect(page.locator('.page.rp .tl')).toHaveCount(0);
  const b = await page.locator('.page.lp .tl').boundingBox(), W = SIZES.openLandscape951.width;
  expect(b.x + b.width).toBeLessThanOrEqual(W / 2 - 10 + 0.5);
  await expect(page.locator('.page.lp .nowl')).not.toHaveAttribute('hidden', /.*/);
  await expect.poll(() => page.locator('.page.lp .tl').evaluate((e) => e.scrollTop)).toBeGreaterThan(300);
});

test('タスク／メモは説明のみで、保存先を作らない', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await seedPages(page, { left: 'task', right: 'memo' });
  await expect(page.locator('.page.lp .pagewait')).toContainText('タスク');
  await expect(page.locator('.page.rp .pagewait')).toContainText('メモ');
  await expect(page.locator('.tl')).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /task|memo/i.test(k)));
  expect(keys).toEqual([]);
});

// ---- 第14版 PR5: 切替と時間の表示 ----
import { pagePick, setTimeMode } from './helpers.js';
const IDS = { 月: 'month', 時間: 'time', タスク: 'task', メモ: 'memo' };
const kinds = (page) => page.locator('.page').evaluateAll((l) => l.map((e) => e.dataset.page));
const box = async (loc) => (await loc.boundingBox());

test('切替は左右に1つずつ。幅240・高46・各60・選択54×36、折り目から10以上離れる', async ({ page }) => {
  for (const size of [SIZES.openLandscape951, SIZES.openLandscape]) {
    await openApp(page, size);
    const l = await box(page.locator('.pgsw.pgl')), r = await box(page.locator('.pgsw.pgr')), W = size.width, f = W / 2;
    for (const b of [l, r]) { expect(b.width).toBeCloseTo(240, 0); expect(b.height).toBeCloseTo(46, 0); }
    expect(l.x + l.width).toBeLessThanOrEqual(f - 10 + 0.5);
    expect(r.x).toBeGreaterThanOrEqual(f + 10 - 0.5);
    expect(l.y).toBeCloseTo(r.y, 0);
    const bs = await page.locator('.pgsw.pgl button').evaluateAll((l2) => l2.map((e) => e.getBoundingClientRect().width));
    bs.forEach((w) => expect(w).toBeCloseTo(60, 0));
    const pill = await box(page.locator('.pgsw.pgl button[aria-pressed="true"] .pill'));
    expect(pill.width).toBeCloseTo(54, 0); expect(pill.height).toBeCloseTo(36, 0);
    // 左ページの中央（利用幅 [Ls+8, f-10] の中央）
    expect(l.x + l.width / 2).toBeCloseTo((8 + f - 10) / 2, 0);
    await expect(page.locator('.tabs')).toHaveCount(0);
  }
});

test('左右の全12組合せ。同じ種類は交換し、再読込でも保たれる', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  for (const lname of Object.keys(IDS)) {
    for (const rname of Object.keys(IDS)) {
      if (lname === rname) continue;
      await pagePick(page, 'left', lname).click();
      await pagePick(page, 'right', rname).click();
      expect(await kinds(page)).toEqual([IDS[lname], IDS[rname]]);
      await expect(pagePick(page, 'left', lname)).toHaveAttribute('aria-pressed', 'true');
      await expect(pagePick(page, 'right', rname)).toHaveAttribute('aria-pressed', 'true');
    }
  }
  await pagePick(page, 'left', 'タスク').click(); await pagePick(page, 'right', 'メモ').click();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  expect(await kinds(page)).toEqual(['task', 'memo']);
});

test('左の時間を押すと 左=時間・右=月 に交換される', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, 'left', '時間').click();
  expect(await kinds(page)).toEqual(['time', 'month']);
  await expect(page.locator('.page.lp .tl[data-pane="left"]')).toBeVisible();
  await expect(page.locator('.page.rp .week').first()).toBeVisible();
  await expect(page.getByRole('status')).toContainText('右ページは月になりました');
});

test('時間のカプセル: 1日・3日・週・一覧（幅120・行44）。週と一覧もそのペインで描く', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  const cap = page.locator('.page.rp [data-act="tlmenu"]');
  await expect(cap).toContainText('1日');
  await cap.click();
  const menu = page.locator('.tlmenu');
  expect((await box(menu)).width).toBeCloseTo(120, 0);
  const hs = await menu.locator('button').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(hs).toEqual([44, 44, 44, 44]);
  await expect(menu.locator('button')).toHaveText(['1日', '3日', '週', '一覧']);
  await page.locator('.tlmenu [data-tlmode="3"]').click();
  await expect(page.locator('.page.rp .tlcol')).toHaveCount(3);
  await setTimeMode(page, 'right', '週');
  await expect(page.locator('.page.rp .weekrow')).toHaveCount(7);
  await expect(page.locator('.page.lp .week').first()).toBeVisible(); // 左の月は分割されず残る
  await setTimeMode(page, 'right', '一覧');
  await expect(page.locator('.page.rp .listview')).toBeVisible();
  await expect(page.locator('.page.lp .week').first()).toBeVisible();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.page.rp [data-act="tlmenu"]')).toContainText('一覧');
  expect((await ui(page)).timeMode).toEqual({ left: '1', right: 'list' });
});

test('カプセルの一覧は外をたたくと閉じる（外の操作はしない）。Escape でも閉じる', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.locator('.page.rp [data-act="tlmenu"]').click();
  await expect(page.locator('.tlmenu')).toBeVisible();
  await page.locator('.page.lp .week').first().click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.tlmenu')).toHaveCount(0);
  await expect(page.locator('#editor')).not.toHaveAttribute('open', /.*/);
  await page.locator('.page.rp [data-act="tlmenu"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tlmenu')).toHaveCount(0);
});

test('左を時間・右を月にしても、右の月は月の見出しと前後を持ち、左の時間は日で動く', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, 'left', '時間').click();
  await expect(page.locator('.page.rp .shead h2')).toContainText('2026年');
  await page.locator('.page.rp').getByRole('button', { name: '次の月' }).click();
  await expect(page.locator('.page.rp .shead h2')).toContainText('12月');
  await page.locator('.page.lp').getByRole('button', { name: '次の日' }).click();
  await expect(page.locator('.page.lp .rdate')).toContainText('13日');
  await setTimeMode(page, 'left', '週');
  await page.locator('.page.lp').getByRole('button', { name: '次の週' }).click();
  await expect(page.locator('.page.lp .rdate')).toContainText('20日');
});

test('＋の行き先は最後に触ったページ。タスク・メモは予定を開かず案内のみ', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await pagePick(page, 'left', 'タスク').click(); // 左=タスク 右=時間（月は交換されず右の時間が残る）… 左を触った
  expect(await kinds(page)).toEqual(['task', 'time']);
  await page.getByRole('button', { name: '予定を追加' }).first().click();
  await expect(page.locator('#editor')).not.toHaveAttribute('open', /.*/);
  await expect(page.getByRole('status')).toContainText('タスクの入力は準備中');
  await page.locator('.page.rp [data-act="tlmenu"]').click(); // 右を触った
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '予定を追加' }).first().click();
  await expect(page.locator('#editor')).toHaveAttribute('open', /.*/);
});

test('下の余白64・折り目の描画なし。時間と一覧の末尾が切替の裏まで続く', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  const m = await page.locator('.page.rp .tlin').evaluate((e) => parseFloat(getComputedStyle(e).marginBottom));
  expect(m).toBe(64);
  await pagePick(page, 'right', 'メモ').click();
  const p = await page.locator('.page.rp .padb').evaluate((e) => parseFloat(getComputedStyle(e).paddingBottom));
  expect(p).toBe(64);
});

test('壊れた timeMode は1日へ。保存値の週は残る', async ({ page }) => {
  await openApp(page, SIZES.openLandscape951);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, timeMode: { left: 'x', right: 'week' } })); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.page.rp [data-act="tlmenu"]')).toContainText('週');
  await pagePick(page, 'left', '時間').click();
  await expect(page.locator('.page.lp [data-act="tlmenu"]')).toContainText('1日');
});

test('safe R84／非対称 safe でも、右の切替は右ページの利用幅 [f+10, W-R-16] の中央で、帯・折り目と重ならない', async ({ page }) => {
  for (const [size, safe] of [[SIZES.openLandscape951, { r: 84 }], [SIZES.openLandscape, { t: 47, r: 84, b: 34 }], [SIZES.openLandscape, { r: 30, l: 20, t: 10, b: 10 }]]) {
    await openApp(page, size);
    await page.evaluate(({ t = 0, r = 0, b = 0, l = 0 }) => { const s = document.documentElement.style; s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`); }, safe);
    await page.waitForTimeout(80);
    const W = size.width, f = W / 2, R = safe.r || 0, Ls = safe.l || 0;
    const l = await box(page.locator('.pgsw.pgl')), r = await box(page.locator('.pgsw.pgr'));
    expect(r.width).toBeCloseTo(240, 0);
    expect(r.x + r.width / 2).toBeCloseTo((f + 10 + W - R - 16) / 2, 0);
    expect(l.x + l.width / 2).toBeCloseTo((Ls + 8 + f - 10) / 2, 0);
    expect(l.x + l.width).toBeLessThanOrEqual(f - 10 + 0.5);
    expect(r.x).toBeGreaterThanOrEqual(f + 10 - 0.5);
    expect(r.x + r.width).toBeLessThanOrEqual(W - R + 0.5);
    // 実タップ: 右の「メモ」で右ページが替わる
    await pagePick(page, 'right', 'メモ').click();
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'memo');
    const hit = await page.locator('.pgsw.pgr button').first().evaluate((e) => { const q = e.getBoundingClientRect(); return document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2).closest('button') === e; });
    expect(hit).toBe(true);
  }
});
