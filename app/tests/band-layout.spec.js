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
// 第19.2版 S11c（design/34 §9.1・§12 Q-3）: 閉じた画面の右の列は「タスク・…・＋」の3つ。設定・検索は「…」の中、ノートは日の欄の「ノート ›」、今日へは見出し。下のタブはない。
// ここから下の閉じた画面の試験は、帯の6つのボタンとタブを前提にした古い形を 34 の形に書き直したもの（確かめる項目は同じ: 帯の位置と大きさ・届くこと・重ならないこと・格子の上端・安全矩形・退避）。
const bandBtns = ['タスク', 'その他', '予定を追加'];
const moreGo = async (page, name) => { await btn(page, 'その他').click(); await expect(page.getByRole('menu')).toBeVisible(); await page.getByRole('menuitem', { name }).click(); };

test.describe('閉じた 466×678 + 右 safe（帯あり）', () => {
  for (const R of [84, 70, 56]) {
    test(`R=${R}: 帯 [W-R,W] にタスク・…・＋、本文は [0,W-R]、列幅 (W-R)/7`, async ({ page }) => {
      await withSafe(page, SIZES.closedPortrait, { r: R }, '月');
      const W = 466, q = 1, cx = W - R / 2;
      await expect(page.locator('.ctl.band')).toHaveCount(1);
      await expect(page.locator('.rail')).toHaveCount(0);
      const pane = await bx(page.locator('.mpane'));
      near(pane.x, 0); near(pane.x + pane.width, W - R);
      near(await cssVar(page, 'month-col-w'), (W - R) / 7, 0.02);
      const bg = await bx(page.locator('.bandbg'));
      near(bg.x, W - R); near(bg.width, R);
      // 48角の見た目の top = T+[172,232]q（タスク・…）、＋ H-B-80q。押せる範囲は 56 角（上下左右に 4 広い。34 §9.1-12〜14・§12 Q-3）
      const want = { タスク: 172, その他: 232, 予定を追加: 598 }; // 旧: 設定 172・検索 232・タスク 418・ノート 478・今日 538・＋ 598
      for (const [n, top] of Object.entries(want)) {
        const b = btn(page, n), r = await bx(b);
        near(r.width, 56); near(r.height, 56); near(r.x + r.width / 2, cx); near(r.y, top * q - 4);
        const vis = await bx(b.locator('.bi, span').first());
        near(vis.width, 48);
        expect(await reaches(page, b), n).toBe(true);
      }
      await expect(page.locator('.ctl').getByRole('button')).toHaveCount(3);
      const rs = await noOverlaps(page, Object.keys(want).map((n) => btn(page, n)));
      expect(rs[0].y).toBeGreaterThanOrEqual(160 * q - 0.5); // 最初のhit上端は T+160q 以降
      // design/34 §2.1: 見出し y0〜44＋曜日 y44〜64 → 格子の上端は y64（旧: 見出し 48＋曜日 20＝y68）
      near((await bx(page.locator('.mgrid .week').first())).y, 64);
      near((await bx(page.locator('.weekdays'))).y + (await bx(page.locator('.weekdays'))).height, 64);
      await expect(page.locator('.tabs')).toHaveCount(0); // 下のタブはない（34 §9.1-9）
      // 見出しに ‹ ›・全部・今日は出さない（34 §9.1-1〜3）。読み上げ用の「前の月」「次の月」は見えない 2×2、「今日へ」は今日が画面にある間は出ない
      await expect(page.locator('.ctl [data-act="allmonth"]')).toHaveCount(0);
      await expect(page.locator('.mph [data-act="allmonth"]')).toHaveCount(0);
      for (const a of ['prev', 'next']) { const nb = page.locator(`.mph [data-act="${a}"]`); await expect(nb).toHaveCount(1); await expect(nb).toHaveCSS('opacity', '0'); const r = await bx(nb); expect(r.width).toBeLessThanOrEqual(2.5); expect(r.height).toBeLessThanOrEqual(2.5); }
      await expect(page.locator('.mph [data-act="mptoday"]')).toBeHidden();
      // 帯の何もない所は遮らない（本体の帯）
      expect(await page.evaluate((cx) => !document.elementFromPoint(cx, 350)?.closest('.ctl, .bandbg'), cx)).toBe(true);
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }

  test('R=84: ホーム・日・週・月の4表示で、タスク・…・＋が1つずつ帯に届く。月以外は「‹ カレンダー」で戻れ、全部のボタンは見出しにない', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 });
    for (const v of ['ホーム', '日', '週', '月']) {
      await tab(page, v).click();
      for (const n of bandBtns) { await expect(page.getByRole('button', { name: n, exact: true }), `${v}/${n}`).toHaveCount(1); expect(await reaches(page, btn(page, n)), `${v}/${n}`).toBe(true); }
      await expect(page.locator('[data-act="allmonth"]')).toHaveCount(0); // 全部は「…」→「月の表現」（34 §9.1-2）
      const back = page.getByRole('button', { name: 'カレンダーへ戻る' });
      const cal = v === '月' || v === '日'; // S11e（34 §15-④）: 「日」はカレンダーの日の欄の時間軸 B（カレンダーそのものなので「‹ カレンダー」は要らない）
      await expect(back, `${v}/‹ カレンダー`).toHaveCount(cal ? 0 : 1);
      if (!cal) { const r = await bx(back); near(r.x, 0); near(r.y, 0); near(r.width, 120); near(r.height, 44); expect(await reaches(page, back), `${v}/‹ カレンダー`).toBe(true); } // 34 §9.2: 押せる範囲 x0〜120×44
    }
  });

  test('R=84: 全部は「…」→「月の表現」で入れて戻せ、再読込後も保つ。設定は「…」→メニュー・検索は「…」→検索パネル', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
    await expect(page.locator('[data-act="allmonth"]')).toHaveCount(0);
    await btn(page, 'その他').click();
    await expect(page.getByRole('menuitem', { name: /月の表現/ })).toHaveText('月の表現（予定名）');
    await page.getByRole('menuitem', { name: /月の表現/ }).click();
    const variant = page.locator('#m-variant');
    await expect(variant.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await variant.getByRole('button', { name: '全部', exact: true }).click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('.scroll.all')).toBeVisible();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await setSafe(page, { r: 84 });
    await expect(page.locator('.ctl.band')).toHaveCount(1);
    await expect(page.locator('.scroll.all')).toBeVisible();
    await btn(page, 'その他').click();
    await expect(page.getByRole('menuitem', { name: /月の表現/ })).toHaveText('月の表現（全部）');
    await page.getByRole('menuitem', { name: /月の表現/ }).click();
    await expect(variant.getByRole('button', { name: '全部', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await variant.getByRole('button', { name: '予定名', exact: true }).click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('.scroll.all')).toHaveCount(0);
    await moreGo(page, '設定');
    const m = await bx(page.locator('#menu'));
    expect(await page.locator('#menu').isVisible()).toBe(true);
    expect(m.x + m.width).toBeLessThanOrEqual(466 - 84 + 0.5); // メニューは安全矩形の内側
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    await moreGo(page, '検索');
    await expect(page.locator('#search')).toBeVisible();
  });

  test('R=84: 帯の入口は「その他」（…、aria-hidden の svg）。設定のボタンは帯になく、「…」の中の項目', async ({ page }) => {
    // 旧: 歯車と名前「設定」、「その他」はない。34 §9.1-5・14 で 設定 →「…」→「設定」に置き換え
    await withSafe(page, SIZES.closedPortrait, { r: 84 });
    await expect(page.getByRole('button', { name: 'その他', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '設定', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-act="more"] svg')).toHaveAttribute('aria-hidden', 'true');
    await btn(page, 'その他').click();
    await expect(page.getByRole('menuitem', { name: '設定', exact: true })).toHaveCount(1);
  });

  test('R=55（56 未満）は帯のボタンを置かず見出し・右下へ。本文右端は W-R のまま', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 55 }, '月');
    await expect(page.locator('.ctl.band')).toHaveCount(0);
    const pane = await bx(page.locator('.mpane'));
    near(pane.x + pane.width, 466 - 55);
    await expect(page.locator('.mph [data-act="allmonth"]')).toHaveCount(0);
    await expect(page.locator('.tabs')).toHaveCount(0);
    const rs = await noOverlaps(page, [...bandBtns.map((n) => btn(page, n)), page.locator('.mph h2')]);
    for (const r of rs) expect(r.x + r.width).toBeLessThanOrEqual(466 - 55 + 0.5);
    for (const n of bandBtns) expect(await reaches(page, btn(page, n)), n).toBe(true);
  });

  test('safe を 84→0→84 と変えるだけで配置が再計算される（回転なし）', async ({ page }) => {
    await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
    await expect(page.locator('.ctl.band')).toHaveCount(1);
    await setSafe(page, {});
    await expect(page.locator('.ctl.band')).toHaveCount(0);
    near((await bx(page.locator('.mpane'))).width, 466);
    near((await bx(btn(page, '予定を追加'))).x, 402); // S11e（34 §15-③）: 右下の＋は 見える 48 を右 12（x406〜454）、押せる 56（x402〜458）
    await setSafe(page, { r: 84 });
    await expect(page.locator('.ctl.band')).toHaveCount(1);
    near((await bx(btn(page, 'その他'))).x + 28, 424);
  });

  test('高さが小さくて56角のhitが並べないときは、帯があっても見出し・右下へ退避する', async ({ page }) => {
    await withSafe(page, { width: 466, height: 560 }, { r: 84 }, '月');
    await expect(page.locator('.ctl.band')).toHaveCount(0);
    for (const n of bandBtns) expect(await reaches(page, btn(page, n)), n).toBe(true);
    await noOverlaps(page, bandBtns.map((n) => btn(page, n)));
  });

  test('R=84・T47・B34・L0（非対称）: q=(H-T-B)/678 で縦位置を計算し、安全矩形の内側', async ({ page }) => {
    // 高さ 678 では V=597 で 60q<56 になり退避するため、帯が成立する高さ 800 で検査する
    await withSafe(page, { width: 466, height: 800 }, { t: 47, r: 84, b: 34 }, '月');
    const H = 800, q = (H - 47 - 34) / 678;
    const task = await bx(btn(page, 'タスク')), more = await bx(btn(page, 'その他')), add = await bx(btn(page, '予定を追加'));
    near(task.y, 47 + 172 * q - 4); near(more.y, 47 + 232 * q - 4); near(add.y, H - 34 - 80 * q - 4);
    expect(add.y + add.height).toBeLessThanOrEqual(H - 34 + 4.5);
    near((await bx(page.locator('.mgrid .week').first())).y, 47 + 64); // design/34 §2.1: 見出し 44＋曜日 20
    await expect(page.locator('.tabs')).toHaveCount(0);
  });

  test.describe('実タップ', () => {
    test.use({ hasTouch: true });
    test('帯のタスク・「…」→検索・＋を tap で押せる', async ({ page }) => {
      await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
      await btn(page, 'その他').tap();
      await page.getByRole('menuitem', { name: '検索' }).tap();
      await expect(page.locator('#search')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#search')).toBeHidden();
      await btn(page, '予定を追加').tap();
      await expect(page.locator('#editor')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#editor')).toBeHidden();
      await btn(page, 'タスク').tap();
      await expect(page.locator('.stripp[data-page="task"]')).toBeVisible();
    });
  });
});

test.describe('開いた横 + 右 safe（帯あり）', () => {
  // [size, 左月の列幅, 右本文の始まり, 線の終端 E, 線幅, 設定top, 検索top, 左タブtop]
  const CASES = [
    // S8 N-01（設計 2026-11-20）: 右ページの箱は折り目の側に 8 ずれる（485.5→493.5、455→463）。時間軸の線の左端もそれに従い f+68、幅は 8 縮む
    [SIZES.openLandscape951, 65.36, 493.5, 851, 307.5, 124, 184, 611],
    [SIZES.openLandscape, 61, 463, 790, 277, 116.03, 172.17, 571.73],
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
      near(hl.x, f + 68); near(hl.x + hl.width, E); near(hl.width, lw);
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
      await pagePick(page, 'right', 'ノート').click();
      await pagePick(page, 'left', 'タスク').click();
      await expect(page.locator('[data-act="allmonth"]')).toHaveCount(0);
    });
    test(`${size.width}×${size.height} safe=0: 帯なし。線は E=W-16 まで、操作は見出し`, async ({ page }) => {
      await openApp(page, size);
      const W = size.width, f = W / 2;
      await expect(page.locator('.ctl.band')).toHaveCount(0);
      const hl = await bx(page.locator('.tl .hl').first());
      near(hl.x, f + 68); near(hl.x + hl.width, W - 16); // S8 N-01: 右ページの箱 +8
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
      // 第19版 PR6（design/22 §5）: 見出し（月の題名・前・次・今日）は y82〜126 の面、曜日 20、月のマス y146〜。設定・検索は上の帯のまま
      const wd = await bx(page.locator('.weekdays'));
      near(wd.y, head + 44); near(wd.height, 20);
      const sc = await bx(page.locator('.mgrid'));
      near(sc.y, head + 64);
      // 第19.1版 S2（design/32 §5-5）: 設定 x20〜64・検索 右から20（x605〜649）、どちらも y19〜63（44×44）
      const items = { 設定: [20, 44], 予定を検索: [W - 20 - 44, 44] };
      const rs = [];
      for (const [n, [x, w]] of Object.entries(items)) {
        const loc = page.getByRole('button', { name: n, exact: true });
        const r = await bx(loc);
        near(r.x, x); near(r.width, w); near(r.height, 44); near(r.y, 19);
        expect(await reaches(page, loc), n).toBe(true);
        rs.push(r);
      }
      const title = await bx(page.locator('#ctitle'));
      near(title.y + title.height / 2, head + 22, 1);
      const search = rs[1];
      expect(search.x + search.width).toBeCloseTo(W - 20, 0);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i], rs[j]), `${i}/${j}`).toBe(false);
      for (const r of rs) expect(overlap(r, title)).toBe(false);
      const fm = await bx(page.locator('.fmodes'));
      near(fm.x, (W - 252) / 2); near(fm.y, 23); near(fm.width, 252); /* V-01: 220→252 */ near(fm.height, 36); // 切替は上の帯の真ん中（17 §1）
      for (const r of rs.concat([title])) expect(overlap(fm, r)).toBe(false);
      // 下段: 今日 x20・＋ 右20・タブ 286 中央、いずれも top H-88p（第19版 PR5）
      const today = await bx(btn(page, '今日に戻る')), add = await bx(btn(page, '予定を追加')), tabs = await bx(page.locator('.tabs'));
      near(today.x, 20); near(add.x + add.width, W - 20); near(tabs.width, 286); near(tabs.x + tabs.width / 2, W / 2);
      for (const r of [today, add, tabs]) near(r.y, H - 88 * p, 1);
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
    near(set.x, 30 + 20); near(search.x, 669 - 20 - 20 - 44); // 設定は左 safe から20、検索は右 safe から20（S2）
    expect(search.x + search.width).toBeLessThanOrEqual(669 - 20 - 20 + 0.5);
  });
});

test('ダークでも帯の操作が届く（見た目の合成は実機で確認）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await withSafe(page, SIZES.closedPortrait, { r: 84 }, '月');
  for (const n of bandBtns) expect(await reaches(page, btn(page, n))).toBe(true);
});
