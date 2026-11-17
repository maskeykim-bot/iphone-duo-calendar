// 第12版 PR4: 本体の帯（safe area）を操作の置き場に使う B案。
// 帯の位置と大きさは safe-area-inset の値だけが基準（84／82 を固定値にしない）。safe の注入は layout-metrics.spec.js の setSafe と同じ。
import { test, expect } from '@playwright/test';
import { openApp, tab, SIZES, setStyle, findTextOverlaps, pagePick } from './helpers.js';

const setSafe = (page, { t = 0, r = 0, b = 0, l = 0 }) => page.evaluate(([t, r, b, l]) => {
  const s = document.documentElement.style;
  s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`);
}, [t, r, b, l]);
const bx = (loc) => loc.boundingBox();
const near = (a, b, tol = 0.6) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const btn = (page, name) => page.locator('.ctl').getByRole('button', { name, exact: true });
const cssVar = (page, n) => page.evaluate((n) => parseFloat(document.documentElement.style.getPropertyValue(`--${n}`)), n);
// 中心と四隅（内8px。角丸の外は届かなくてよい）で、そのボタンに届く
const reaches = (page, loc) => loc.evaluate((el) => {
  const q = el.getBoundingClientRect(), m = 8;
  return [[q.width / 2, q.height / 2], [m, m], [q.width - m, m], [m, q.height - m], [q.width - m, q.height - m]].every(([dx, dy]) => el.contains(document.elementFromPoint(q.left + dx, q.top + dy)));
});
const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
async function noOverlaps(page, locs) {
  const rs = [];
  for (const l of locs) rs.push(await bx(l));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i], rs[j]), `重なり ${i}/${j}`).toBe(false);
  return rs;
}
async function withSafe(page, size, safe, view) {
  await openApp(page, size);
  if (view) await tab(page, view).click();
  await setSafe(page, safe);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sar'))).toBe(`${safe.r ?? 0}px`);
  await page.waitForTimeout(60);
}
const bandBtns = ['設定', '予定を検索', '今日に戻る', '予定を追加'];

test.describe('閉じた 466×678 + 右 safe（帯あり）', () => {
  for (const R of [84, 70, 56]) {
    test(`R=${R}: 帯 [W-R,W] に設定・検索・タスク・メモ・今日・＋、本文は [0,W-R]、列幅 (W-R)/7`, async ({ page }) => {
      await withSafe(page, SIZES.closedPortrait, { r: R }, '月');
      const W = 466, q = 1, cx = W - R / 2;
      await expect(page.locator('.ctl.band')).toHaveCount(1);
      await expect(page.locator('.rail')).toHaveCount(0);
      const pane = await bx(page.locator('.mpane'));
      near(pane.x, 0); near(pane.x + pane.width, W - R);
      near(await cssVar(page, 'month-col-w'), (W - R) / 7, 0.02);
      const bg = await bx(page.locator('.bandbg'));
      near(bg.x, W - R); near(bg.width, R);
      // 48角の見た目の top = T+[172,232,292]q、今日 H-B-140q、＋ H-B-80q。押せる範囲は 56 角（上に 4px 広い）
      const want = { 設定: 172, 予定を検索: 232, タスク: 418, メモ: 478, 今日に戻る: 538, 予定を追加: 598 }; // PR12: 全は月の見出しへ移り、帯にはタスク・メモ
      for (const [n, top] of Object.entries(want)) {
        const b = btn(page, n), r = await bx(b);
        near(r.width, 56); near(r.height, 56); near(r.x + r.width / 2, cx); near(r.y, top * q - 4);
        const vis = await bx(b.locator('.bi, span').first());
        near(vis.width, 48);
        expect(await reaches(page, b), n).toBe(true);
      }
      const rs = await noOverlaps(page, Object.keys(want).map((n) => btn(page, n)));
      expect(rs[0].y).toBeGreaterThanOrEqual(160 * q - 0.5); // 最初のhit上端は T+160q 以降
      // 曜日下端／grid top、週高、タブ
      near((await bx(page.locator('.scroll.msc .week').first())).y, 92 * q);
      near((await bx(page.locator('.weekdays'))).y + (await bx(page.locator('.weekdays'))).height, 92 * q);
      const tabs = await bx(page.locator('.tabs'));
      near(tabs.x + tabs.width / 2, (W - R) / 2); near(tabs.y + tabs.height / 2, 622); near(tabs.width, Math.min(286, W - R - 16)); near(tabs.height, 46);
      // 見出しは前後矢印＋題名＋全（PR12: 全は月ヘッダーへ。帯にはない）
      await expect(page.locator('.ctl [data-act="allmonth"]')).toHaveCount(0);
      await expect(page.locator('.chead [data-act="allmonth"]')).toHaveCount(1);
      await expect(page.locator('.chead button')).toHaveCount(3);
      // 帯の何もない所は遮らない（本体の帯）
      expect(await page.evaluate((cx) => !document.elementFromPoint(cx, 350)?.closest('.ctl, .bandbg'), cx)).toBe(true);
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }

  test('R=84: 一覧・日・週・月の4表示で、設定・検索・今日・＋が1つずつ帯に届き、全は月だけ', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 });
    for (const v of ['ホーム', '日', '週', '月']) {
      await tab(page, v).click();
      for (const n of bandBtns) { await expect(page.getByRole('button', { name: n, exact: true }), `${v}/${n}`).toHaveCount(1); expect(await reaches(page, btn(page, n))).toBe(true); }
      await expect(page.locator('[data-act="allmonth"]')).toHaveCount(v === '月' ? 1 : 0);
    }
  });

  test('R=84: 全の aria 名は2状態、aria-pressed と再読込後の状態を保つ。設定はメニュー・検索は検索パネル', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
    const all = page.locator('[data-act="allmonth"]');
    await expect(all).toHaveAttribute('aria-label', '全部の予定を表示');
    await expect(all).toHaveAttribute('aria-pressed', 'false');
    await all.click();
    await expect(all).toHaveAttribute('aria-label', '通常の予定表示に戻す');
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.scroll.all')).toBeVisible();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await setSafe(page, { r: 84 });
    await expect(page.locator('[data-act="allmonth"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-act="allmonth"]').click();
    await expect(page.locator('.scroll.all')).toHaveCount(0);
    await btn(page, '設定').click();
    const m = await bx(page.locator('#menu'));
    expect(await page.locator('#menu').isVisible()).toBe(true);
    expect(m.x + m.width).toBeLessThanOrEqual(466 - 84 + 0.5); // メニューは安全矩形の内側
    await page.keyboard.press('Escape');
    await btn(page, '予定を検索').click();
    await expect(page.locator('#search')).toBeVisible();
  });

  test('R=84: 歯車（aria-hidden の svg）と名前「設定」、旧「その他」はない', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 });
    await expect(page.getByRole('button', { name: '設定', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'その他' })).toHaveCount(0);
    await expect(page.locator('[data-act="menu"] svg')).toHaveAttribute('aria-hidden', 'true');
  });

  test('R=55（56 未満）は帯のボタンを置かず見出し・下段へ。本文右端は W-R のまま', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 55 }, '月');
    await expect(page.locator('.ctl.band')).toHaveCount(0);
    const pane = await bx(page.locator('.mpane'));
    near(pane.x + pane.width, 466 - 55);
    await expect(page.locator('.chead [data-act="allmonth"]')).toHaveCount(1);
    const tabs = await bx(page.locator('.tabs'));
    near(tabs.width, Math.min(286, 466 - 55 - 128));
    const rs = await noOverlaps(page, [...bandBtns.map((n) => btn(page, n)), page.locator('.tabs'), page.locator('.chead h2')]);
    for (const r of rs) expect(r.x + r.width).toBeLessThanOrEqual(466 - 55 + 0.5);
  });

  test('safe を 84→0→84 と変えるだけで配置が再計算される（回転なし）', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
    await expect(page.locator('.ctl.band')).toHaveCount(1);
    await setSafe(page, {});
    await expect(page.locator('.ctl.band')).toHaveCount(0);
    near((await bx(page.locator('.mpane'))).width, 466);
    near((await bx(btn(page, '予定を追加'))).x, 410); // 下段の＋ x=W-8-48
    await setSafe(page, { r: 84 });
    await expect(page.locator('.ctl.band')).toHaveCount(1);
    near((await bx(btn(page, '設定'))).x + 28, 424);
  });

  test('高さが小さくて56角のhitが並べないときは、帯があっても見出し・下段へ退避する', async ({ page }) => {
    await withSafe(page, { width: 466, height: 560 }, { r: 84 }, '月');
    await expect(page.locator('.ctl.band')).toHaveCount(0);
    for (const n of bandBtns) expect(await reaches(page, btn(page, n)), n).toBe(true);
    await noOverlaps(page, [...bandBtns.map((n) => btn(page, n)), page.locator('.tabs')]);
  });

  test('R=84・T47・B34・L0（非対称）: q=(H-T-B)/678 で縦位置を計算し、安全矩形の内側', async ({ page }) => {
    // 高さ 678 では V=597 で 60q<56 になり退避するため、帯が成立する高さ 800 で検査する
    await withSafe(page, { width: 466, height: 800 }, { t: 47, r: 84, b: 34 }, '月');
    const H = 800, q = (H - 47 - 34) / 678;
    const set = await bx(btn(page, '設定')), today = await bx(btn(page, '今日に戻る')), add = await bx(btn(page, '予定を追加'));
    near(set.y, 47 + 172 * q - 4); near(today.y, H - 34 - 140 * q - 4); near(add.y, H - 34 - 80 * q - 4);
    expect(add.y + add.height).toBeLessThanOrEqual(H - 34 + 4.5);
    near((await bx(page.locator('.scroll.msc .week').first())).y, 47 + 92 * q);
    const tabs = await bx(page.locator('.tabs'));
    near(tabs.y + tabs.height / 2, H - 34 - 56 * q);
  });

  test.describe('実タップ', () => {
    test.use({ hasTouch: true });
    test('帯の検索・今日・＋を tap で押せる', async ({ page }) => {
      await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
      await btn(page, '予定を検索').tap();
      await expect(page.locator('#search')).toBeVisible();
      await page.keyboard.press('Escape');
      await btn(page, '予定を追加').tap();
      await expect(page.locator('#editor')).toBeVisible();
    });
  });
});

test.describe('開いた横 + 右 safe（帯あり）', () => {
  // [size, 左月の列幅, 右本文の始まり, 線の終端 E, 線幅, 設定top, 検索top, 左タブtop]
  const CASES = [
    [SIZES.openLandscape951, 65.36, 485.5, 851, 315.5, 124, 184, 611],
    [SIZES.openLandscape, 61, 455, 790, 285, 116.03, 172.17, 571.73],
  ];
  for (const [size, col, rs0, E, lw, setTop, searchTop, tabTop] of CASES) {
    test(`${size.width}×${size.height} R84: 左 [8,f-10]・右 [f+10,W-R]・線 A=f+60〜E=W-R-16・帯 4ボタン`, async ({ page }) => {
      await withSafe(page, size, { r: 84 });
      const W = size.width, H = size.height, f = W / 2, q = H / 669;
      await expect(page.locator('.ctl.band')).toHaveCount(1);
      await expect(page.locator('.srail, .rail, .cap')).toHaveCount(0);
      near(await cssVar(page, 'month-col-w'), col, 0.02);
      const rp = await bx(page.locator('.page.rp'));
      near(rp.x, rs0); near(rp.x + rp.width, E);
      const hl = await bx(page.locator('.tl .hl').first());
      near(hl.x, f + 60); near(hl.x + hl.width, E); near(hl.width, lw);
      const bg = await bx(page.locator('.bandbg'));
      near(bg.x, W - 84); near(bg.width, 84);
      const cx = W - 42;
      const want = { 設定: setTop, 予定を検索: searchTop, 今日に戻る: H - 129 * q, 予定を追加: H - 69 * q };
      for (const [n, top] of Object.entries(want)) {
        const r = await bx(btn(page, n));
        near(r.width, 56); near(r.height, 56); near(r.x + 28, cx); near(r.y, top - 4, 0.8);
        expect(await reaches(page, btn(page, n)), n).toBe(true);
      }
      near((await bx(btn(page, '設定'))).y, 124 * q - 4, 0.8);
      expect((await bx(btn(page, '設定'))).y).toBeGreaterThanOrEqual(112 * q - 0.5);
      await noOverlaps(page, Object.keys(want).map((n) => btn(page, n)));
      // 左見出し: 全・‹・›（44角）を右寄せ、設定はない。右見出しに今日・検索・＋はない
      await expect(page.locator('.shead [data-act="menu"]')).toHaveCount(0);
      await expect(page.locator('.rhead [data-act="today"], .rhead [data-act="search"], .rhead [data-act="add"]')).toHaveCount(0);
      const lp = await bx(page.locator('.page.lp'));
      const hs = [];
      for (const s of ['.shead [data-act="allmonth"]', '.shead [data-act="prev"]', '.shead [data-act="next"]']) { const r = await bx(page.locator(s)); near(r.width, 44); near(r.height, 44); expect(r.x + r.width).toBeLessThanOrEqual(lp.x + lp.width + 0.5); hs.push(r); }
      near(hs[0].x + hs[0].width, hs[1].x); near(hs[1].x + hs[1].width, hs[2].x);
      const tabs = await bx(page.locator('.pgsw.pgl'));
      near(tabs.y, tabTop, 0.2);
      const span = await bx(page.locator('.rhead .spanbtn'));
      near(span.x + span.width, E - 96); // PR6: 右端 E は ‹ ›（各44）、その左8pt
      { const nx = await bx(page.locator(".rhead [data-act=\"next\"]")); near(nx.x + nx.width, E); near(nx.width, 44); } near(span.width, 60); expect(span.height).toBeGreaterThanOrEqual(44 - 0.5);
      const vis = await bx(page.locator('.rhead .spanbtn span'));
      near(vis.width, 60); near(vis.height, 32);
      near(span.y + span.height / 2, 40 * q, 0.8);
      expect(await findTextOverlaps(page)).toEqual([]);
      // 全は月だけ: 左が時間のときは左見出しに出ない（右が月になるので右に出る）
      await pagePick(page, 'left', 'タスク');
      await pagePick(page, 'right', 'メモ').click();
      await pagePick(page, 'left', 'タスク').click();
      await expect(page.locator('[data-act="allmonth"]')).toHaveCount(0);
    });
    test(`${size.width}×${size.height} safe=0: 帯なし。線は E=W-16 まで、操作は見出し`, async ({ page }) => {
      await openApp(page, size);
      const W = size.width, f = W / 2;
      await expect(page.locator('.ctl.band')).toHaveCount(0);
      const hl = await bx(page.locator('.tl .hl').first());
      near(hl.x, f + 60); near(hl.x + hl.width, W - 16);
      await expect(page.locator('.shead [data-act="menu"]')).toHaveCount(1);
      for (const a of ['today', 'search', 'add']) await expect(page.locator(`.rhead [data-act="${a}"]`)).toHaveCount(1);
    });
  }

  test('R=84・T47・B34（非対称）: q=(H-T-B)/669 で縦位置を計算', async ({ page }) => {
    await withSafe(page, { width: 951, height: 800 }, { t: 47, r: 84, b: 34 });
    const q = (800 - 47 - 34) / 669;
    near((await bx(btn(page, '設定'))).y, 47 + 124 * q - 4, 0.8);
    near((await bx(btn(page, '予定を追加'))).y, 800 - 34 - 69 * q - 4, 0.8);
    near((await bx(page.locator('.pgsw.pgl'))).y, 47 + 611 * q, 0.5);
  });

  test('R=84 で設定を押すとメニューは左ページの内側に出る', async ({ page }) => {
    await withSafe(page, SIZES.openLandscape951, { r: 84 });
    await btn(page, '設定').click();
    const m = await bx(page.locator('#menu'));
    expect(m.x + m.width).toBeLessThanOrEqual(951 / 2 - 10 + 0.5);
    expect(m.x).toBeGreaterThanOrEqual(0);
  });
});

test.describe('開いた縦 + 上 safe（見出しは帯の中）', () => {
  for (const [size, T] of [[SIZES.openPortrait669, 82], [SIZES.openPortrait669, 0], [SIZES.openPortrait, 82]]) {
    test(`${size.width}×${size.height} T=${T}: head=max(T,82)・見出しの設定／‹／題名／›／全／検索の座標`, async ({ page }) => {
      await withSafe(page, size, { t: T });
      const W = size.width, H = size.height, ux = W / 669, p = H / 951, head = Math.max(T, 82);
      near(await cssVar(page, 'head-h'), head);
      const wd = await bx(page.locator('.weekdays'));
      near(wd.y, head); near(wd.height, 24);
      const sc = await bx(page.locator('.calendar .scroll'));
      near(sc.y, head + 24); near(sc.y + sc.height, H - 71 * p, 1);
      const cy = head * 46 / 82;
      const items = { 設定: [20 * ux, 44], 前の月: [120 * ux, 44], 次の月: [376 * ux, 44], 全部の予定を表示: [432 * ux, 44], 予定を検索: [484 * ux, 44] };
      const rs = [];
      for (const [n, [x, w]] of Object.entries(items)) {
        const loc = page.getByRole('button', { name: n, exact: true });
        const r = await bx(loc);
        near(r.x, x); near(r.width, w); near(r.height, 44); near(r.y + 22, cy);
        expect(await reaches(page, loc), n).toBe(true);
        rs.push(r);
      }
      const title = await bx(page.locator('#ctitle'));
      near(title.x + title.width / 2, 270 * ux, 1); near(title.y + title.height / 2, cy, 1);
      const search = rs[4];
      expect(search.x + search.width).toBeLessThanOrEqual(540 * ux + 0.5); // 右上の予約（時刻・電池）
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i], rs[j]), `${i}/${j}`).toBe(false);
      for (const r of rs) expect(overlap(r, title)).toBe(false);
      // 下段: 今日 x20・＋ 右20・タブ 270 中央、いずれも top H-70p
      const today = await bx(btn(page, '今日に戻る')), add = await bx(btn(page, '予定を追加')), tabs = await bx(page.locator('.tabs'));
      near(today.x, 20); near(add.x + add.width, W - 20); near(tabs.width, 270); near(tabs.x + tabs.width / 2, W / 2);
      for (const r of [today, add, tabs]) near(r.y, H - 70 * p, 1);
      await expect(page.locator('.pctl, .rail')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }
  test('T=82 の 4表示: 設定・検索が見出しの帯にあり、一覧・日・週でも届く。全は月だけ', async ({ page }) => {
    await withSafe(page, SIZES.openPortrait669, { t: 82 });
    for (const v of ['ホーム', '日', '週', '月']) {
      await tab(page, v).click();
      for (const n of ['設定', '予定を検索', '今日に戻る', '予定を追加']) { await expect(page.getByRole('button', { name: n, exact: true }), `${v}/${n}`).toHaveCount(1); expect(await reaches(page, btn(page, n)), `${v}/${n}`).toBe(true); }
      await expect(page.locator('[data-act="allmonth"]')).toHaveCount(v === '月' ? 1 : 0);
    }
  });
  test('safe が左右非対称でも ux=(W-Ls-R)/669 で並ぶ（検索は予約の手前）', async ({ page }) => {
    await withSafe(page, SIZES.openPortrait669, { t: 82, r: 20, l: 30 });
    const U = 669 - 50, ux = U / 669;
    const set = await bx(btn(page, '設定')), search = await bx(btn(page, '予定を検索'));
    near(set.x, 30 + 20 * ux); near(search.x, 30 + 484 * ux);
    expect(search.x + search.width).toBeLessThanOrEqual(30 + 540 * ux + 0.5);
  });
});

test('ダークでも帯の操作が届く（見た目の合成は実機で確認）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
  for (const n of bandBtns) expect(await reaches(page, btn(page, n))).toBe(true);
});
