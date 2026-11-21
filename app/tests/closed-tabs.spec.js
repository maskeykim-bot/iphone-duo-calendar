import { test, expect } from '@playwright/test';
import { OPEN_SIZES, SIZES, loadSample, openApp, setStyle, tab, openMenu, layout, monthFormInit, expectShown } from './helpers.js';

// 第10版 ②: 閉じた画面（月領域＋操作列）・4タブ・操作列。画面サイズは固定せず、同じ検査を複数の大きさで通す。
const CLOSED = [SIZES.closedPortrait, SIZES.closedLandscape];
const tabsGroup = (page) => page.getByRole('group', { name: '表示期間' });
const box = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
const hits = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

// 中心と四隅（内1px）で、その操作自身（または中身）が最前面に届くこと。
async function reachable(page, loc) {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]];
    // 角丸の外側は対象外にするため、四隅は半径ぶん内側の点も使う
    const rad = Math.min(r.width, r.height) / 2, k = rad * (1 - Math.SQRT1_2) + 1;
    pts.splice(1, 4, [r.left + k, r.top + k], [r.right - k, r.top + k], [r.left + k, r.bottom - k], [r.right - k, r.bottom - k]);
    return pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t)); });
  });
}

// 第19.2版 S11c（design/34 §9.1-9・§9.2・§12 Q-3・Q-11）: 閉じた画面の下のタブ（ホーム｜日｜週｜月）は廃止。
// 月は格子そのもの、ホームと週の時間軸は「…」から、戻りは「‹ カレンダー」。右の列は「タスク・…・＋」の3つ。今日へは見出し。
// ここから下の閉じた画面の試験は、タブを前提にした古い形を 34 の形に書き直したもの（確かめる項目は同じ: 入口の名前と状態・行き来・操作列の大きさと届くこと・安全矩形・下端の余白）。
const stageOf = (page) => page.locator('.mpull.browse').getAttribute('data-stage').then(Number);
for (const size of CLOSED) {
  test.describe(`閉じた ${size.width}×${size.height}`, () => {
    test('下のタブはない。起動はカレンダー。操作は タスク・…・＋ の3つで、「…」の中は ホーム・週の時間軸・検索・月の表現・設定', async ({ page }) => {
      await openApp(page, size);
      await expect(page.locator('.tabs')).toHaveCount(0);
      await expect(tabsGroup(page)).toHaveCount(0);
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse'); // 14 §1 を変える: 起動はカレンダー（34 §9.2）
      await expect(page.locator('.shell.closed.cal .mpull.browse')).toHaveCount(1);
      const btns = page.locator('.ctl').getByRole('button');
      await expect(btns).toHaveCount(3);
      expect(await btns.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).toEqual(['タスク', 'その他', '予定を追加']);
      const more = page.getByRole('button', { name: 'その他', exact: true });
      await expect(more).toHaveAttribute('aria-haspopup', 'menu');
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.click();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      const items = page.getByRole('menu').getByRole('menuitem');
      await expect(items).toHaveCount(5);
      for (const [i, n] of ['ホーム', '週の時間軸', '検索', '月の表現', '設定'].entries()) await expect(items.nth(i)).toContainText(n);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(more).toBeFocused();
      await expect(page.locator('.cback')).toHaveCount(0); // カレンダーには「‹ カレンダー」は出ない
    });

    test('カレンダー → ホーム → 週の時間軸 → カレンダー。戻りは「‹ カレンダー」。今日へは選んだ日だけ戻し、段は保つ', async ({ page }) => {
      await monthFormInit(page, 'two');
      await openApp(page, size);
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
      const st0 = await stageOf(page);
      expect(st0).toBe(4); // 2週の型＝段4（34 §10: 段を「月 1〜3・2週 4〜6・1週 7」に読み替える）
      await expect(page.getByRole('button', { name: '今日へ' })).toHaveCount(0); // 今日が画面にある間は出ない（34 §2.1）
      for (let i = 0; i < 4; i++) await page.locator('.mph [data-act="next"]').click({ force: true }); // 見えない「次の月」（2×2・opacity 0）。2週の段は 1週ずつ進む（11/12 → 12/10）
      await expect(page.locator('#ctitle')).toHaveText('2026年12月');
      await page.getByRole('button', { name: '今日へ' }).click();
      await expect(page.locator('#ctitle')).toHaveText('2026年11月');
      expect(await stageOf(page)).toBe(st0); // 段は保つ（§12 Q-11）
      await expect(page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-11-12"]')).toHaveAttribute('aria-selected', 'true');
      await tab(page, '週').click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
      await expect(page.locator('.shell.closed.tv-week')).toHaveCount(1);
      await expect(page.locator('.cback')).toBeVisible();
      await tab(page, '日').click(); // 日の時間軸（28 §1）はホームの「タイムライン ›」から
      await expect(page.locator('.shell.closed.tv-day')).toHaveCount(1);
      await tab(page, 'ホーム').click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'home');
      await page.getByRole('button', { name: 'カレンダーへ戻る' }).click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
      await expect(page.locator('#ctitle')).toHaveText('2026年11月');
      expect(await stageOf(page)).toBe(st0); // 覚えている段へ戻る
    });

    test('操作列: タスク・…・＋ は各44以上（＋は48）、どれも最前面に届き重ならない。設定・検索は「…」から', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      const rail = page.locator('.ctl'); // safe=0 は帯なし: 「…」「タスク」は見出しの右、＋は右下（いずれも .ctl）
      const btns = rail.getByRole('button');
      await expect(btns).toHaveCount(3);
      const all = [];
      for (let i = 0; i < 3; i++) {
        const b = btns.nth(i), r = await box(b);
        expect(r.w, `rail ${i} 幅`).toBeGreaterThanOrEqual(44 - 0.5); // 見出しは44、右下の＋は48
        expect(r.h, `rail ${i} 高さ`).toBeGreaterThanOrEqual(44 - 0.5);
        expect(await reachable(page, b), `rail ${i} が届く`).toBe(true);
        all.push(r);
      }
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      expect(Math.round(add.w)).toBe(48); expect(Math.round(add.h)).toBe(48);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(hits(all[i], all[j]), `重なり ${i}/${j}`).toBe(false);
      // 設定は「…」→「設定」でメニュー、検索は「…」→「検索」で検索パネル（34 §9.1-5・6）
      await page.getByRole('button', { name: 'その他', exact: true }).click();
      await page.getByRole('menuitem', { name: '設定' }).click();
      await expect(page.locator('#menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#menu')).toBeHidden();
      await page.getByRole('button', { name: 'その他', exact: true }).click();
      await page.getByRole('menuitem', { name: '検索' }).click();
      await expect(page.locator('#search')).toBeVisible();
    });

    test('safe 注入（上47・下34・左右47）でも、操作列は安全矩形の内側で重ならない', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      await page.evaluate(() => { const s = document.documentElement.style; s.setProperty('--sat', '47px'); s.setProperty('--sab', '34px'); s.setProperty('--sal', '47px'); s.setProperty('--sar', '47px'); });
      await expect.poll(() => page.evaluate(() => document.querySelector('.mpane').getBoundingClientRect().left)).toBeGreaterThanOrEqual(47);
      await expect.poll(() => page.evaluate(() => document.querySelector('.ctl').lastElementChild.getBoundingClientRect().bottom <= innerHeight - 34 + 0.5)).toBe(true);
      const { W, H } = await page.evaluate(() => ({ W: innerWidth, H: innerHeight }));
      const rects = [];
      for (const loc of [0, 1, 2].map((i) => page.locator('.ctl').getByRole('button').nth(i))) rects.push(await box(loc));
      for (const r of rects) {
        expect(r.l).toBeGreaterThanOrEqual(47 - 0.5); expect(r.r).toBeLessThanOrEqual(W - 47 + 0.5);
        expect(r.t).toBeGreaterThanOrEqual(47 - 0.5); expect(r.b).toBeLessThanOrEqual(H - 34 + 0.5);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(hits(rects[i], rects[j]), `重なり ${i}/${j}`).toBe(false);
    });

    test('日の欄の末尾（ノート）は、日の欄の中を送り切ると下の余白 41 の上に出る。格子は流れない（34 §2.1・§6.3）', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      // 34: 閉じた画面は格子を固定し、日の欄（.mday）の中だけが流れる。タブがなくなったので下の余白は 87 → 41（34 §10「33 全体」）
      const g0 = await box(page.locator('.mgrid'));
      const sc = page.locator('.mday');
      await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const last = await box(page.locator('.mday .mdnote'));
      const paneBottom = (await box(sc)).b;
      if (size.height > size.width) expect(Math.abs(paneBottom - size.height)).toBeLessThan(0.6); // 日の欄は画面の下端まで（design/34 は 466×678 の寸法。横向きは段の寸法が決まっていない）
      expect(last.b).toBeLessThanOrEqual(paneBottom - 41 + 1);
      expect(last.b).toBeGreaterThanOrEqual(paneBottom - 41 - 1);
      expect(Math.abs((await box(page.locator('.mgrid'))).t - g0.t)).toBeLessThan(0.3);
    });
  });
}

test('閉じた縦 466×678（safe=0・帯なし）: 本文は全幅。見出し 44・曜日 20・2週の型（段4）は行 86。「…」「タスク」は見出しの右、＋は右下', async ({ page }) => {
  await monthFormInit(page, 'two');
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '月').click();
  // design/34 §2.1・§2.2: 見出し y0〜44、曜日 y44〜64、格子上端 y64。段4（2週・4件）は行 86、つまみ 24
  const wd = await box(page.locator('.weekdays'));
  expect(Math.abs(wd.t - 44)).toBeLessThan(0.3);
  expect(Math.abs(wd.h - 20)).toBeLessThan(0.3);
  const wk = await box(page.locator('.mgrid .week').first());
  expect(Math.abs(wk.t - (wd.t + wd.h))).toBeLessThan(0.3);
  expect(Math.abs(wk.h - 86)).toBeLessThan(0.5);
  await expect(page.locator('.tabs')).toHaveCount(0);
  const pane = await box(page.locator('.mpane'));
  expect(Math.abs(pane.l)).toBeLessThan(0.3);
  expect(Math.abs(pane.r - 466)).toBeLessThan(0.3);
  await expect(page.locator('.rail')).toHaveCount(0); // 本文内の縦の操作列はない
  // 見出しの右: … x374・タスク x418（各44）。右下: ＋ x410（48）、中心 y622
  const more = await box(page.getByRole('button', { name: 'その他', exact: true })), task = await box(page.locator('.ctl .ctask')), add = await box(page.getByRole('button', { name: '予定を追加' }));
  expect([more.l, more.w, task.l, task.w, add.l, add.w].map(Math.round)).toEqual([374, 44, 418, 44, 410, 48]);
  expect([more.t, more.h, task.t, task.h].map(Math.round)).toEqual([0, 44, 0, 44]);
  expect(Math.round(add.t + 24)).toBe(622);
});

test('閉じた縦で、月の表現は設定の「月の表現」から選ぶ。全部・手帳が保存され、リロード後も復元される', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await loadSample(page);
  await tab(page, '月').click();
  await expect(page.getByRole('button', { name: '全部', exact: true })).toBeHidden(); // 常設の切替は無い
  await setStyle(page, '全部');
  await expect(page.locator('.scroll.all')).toBeVisible();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.scroll.all')).toBeVisible();
  await setStyle(page, '手帳'); // 手帳の設定は保存される。月タブ（月を引く画面）は予定名の帯で描くので、手帳の点は「全部」でないとき出ない（第19版 PR6）
  await expect(page.locator('.mpull')).toBeVisible();
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.mpull')).toBeVisible();
  await openMenu(page, 'display');
  await page.locator('#menu').getByRole('button', { name: '月の表現', exact: true }).click();
  await expect(page.locator('#m-variant').getByRole('button', { name: '手帳' })).toHaveAttribute('aria-pressed', 'true');
});

test('メニューにカテゴリの色の説明があり、月には常設の凡例がない', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '月').click();
  await expect(page.locator('.calendar .legend')).toHaveCount(0);
  await openMenu(page, 'calendar');
  await expect(page.locator('#menu [aria-label="カテゴリ凡例"]')).toBeVisible();
});

test('卓上表示の入口はメニュー（上部ボタンは無い）。入って、メニューから出られる', async ({ page }) => {
  await openApp(page, SIZES.openPortrait);
  await expect(page.getByRole('button', { name: '卓上', exact: true })).toHaveCount(0);
  await openMenu(page, 'general');
  await page.locator('#menu').getByRole('button', { name: '卓上表示', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-layout', 'desk');
  await expect(tabsGroup(page).getByRole('button')).toHaveCount(4);
  await openMenu(page, 'general');
  await page.locator('#menu').getByRole('button', { name: '卓上表示をやめる' }).click();
  await expect(page.locator('body')).not.toHaveAttribute('data-layout', 'desk');
});

for (const size of OPEN_SIZES) {
  test(`開いた ${size.width}×${size.height}: 浮動タブが全姿勢にあり、ホームが使え、今日は表示を保つ`, async ({ page }) => {
    await openApp(page, size);
    if (size.width > size.height) { // 開いた横は左右ページの切替（第14版 PR5。pages.spec で詳細を検査）
      await expect(page.locator('.tabs')).toHaveCount(0);
      await expect(page.locator('.pgsw button')).toHaveText(['ホーム', '月', '時間', 'タスク', 'ノート', 'ホーム', '月', '時間', 'タスク', 'ノート']);
      return;
    }
    await expect(tabsGroup(page).getByRole('button')).toHaveText(['ホーム', '日', '週', '月']);
    await expect(page.locator('.segment')).toHaveCount(0);
    await expectShown(page, '月'); // 開いた画面の既定は月
    const tb = tabsGroup(page).getByRole('button');
    for (let i = 0; i < 4; i++) {
      const r = await box(tb.nth(i));
      expect(r.w).toBeGreaterThanOrEqual(44); expect(r.h).toBeGreaterThanOrEqual(45.5);
      expect(await reachable(page, tb.nth(i)), `tab ${i}`).toBe(true);
    }
    const t = await box(page.locator('.tabs')), { W, H } = await page.evaluate(() => ({ W: innerWidth, H: innerHeight }));
    expect(t.l).toBeGreaterThanOrEqual(0); expect(t.r).toBeLessThanOrEqual(W); expect(t.b).toBeLessThanOrEqual(H);
    // ホーム → 本文は今日の画面。data-layout は open/spread のまま
    const kind = await page.evaluate(() => document.body.dataset.layout);
    await tab(page, 'ホーム').click();
    await expectShown(page, 'ホーム');
    await expect(page.locator(kind === 'open' && size.height > size.width ? '.phome' : '.hero')).toBeVisible(); // 開いた縦のホームは案A（第19.1版 S2。日付の行・次の予定・今日の予定・今週の帯）
    await expect(page.locator('body')).toHaveAttribute('data-layout', kind);
    await page.getByRole('button', { name: '今日に戻る' }).click();
    await expectShown(page, 'ホーム'); // 今日は表示を保つ
    await tab(page, '週').click();
    await expectShown(page, '週');
    await expect(page.locator('.hero, .phome')).toHaveCount(0);
    await page.getByRole('button', { name: '今日に戻る' }).click();
    await expectShown(page, '週');
    await tab(page, '月').click();
    await expect(page.locator('.calendar .week').first()).toBeVisible();
  });
}

// ---------- 第19版 PR5（design/28）: タブをそろえる・閉じた画面の週・日タブ ----------
const near = (a, b, t = 0.5) => Math.abs(a - b) <= t;
const setSafeRight = (page, r) => page.evaluate((v) => document.documentElement.style.setProperty('--sar', `${v}px`), r);

test('S11c 閉じた画面 466×678（帯 84）: 下のタブはなく、右の列は タスク y172〜220・… y232〜280・＋ y598〜646（見える丸 48、押せる 56）', async ({ page }) => {
  // 旧: タブ x48〜334・y599〜645。34 §9.1-9 でタブを廃止し、§9.1-12〜14・§12 Q-3 の右の列に置き換え
  await openApp(page, SIZES.closedPortrait);
  await setSafeRight(page, 84); // 実機の右の帯
  await expect(page.locator('.ctl.band')).toHaveCount(1);
  await expect(page.locator('.tabs')).toHaveCount(0);
  for (const [sel, top] of [['.ctask', 172], ['.cmore', 232], ['.cadd', 598]]) {
    const hit = await box(page.locator(`.ctl ${sel}`)), vis = await box(page.locator(`.ctl ${sel} .bi`));
    expect(near(vis.l, 400) && near(vis.r, 448) && near(vis.t, top) && near(vis.b, top + 48), `${sel} 見える ${JSON.stringify(vis)}`).toBe(true);
    expect(near(hit.l, 396) && near(hit.r, 452) && near(hit.t, top - 4) && near(hit.b, top + 52), `${sel} 押せる ${JSON.stringify(hit)}`).toBe(true);
  }
});

test('PR5 開いた縦 669×951: タブ x191〜477・y863〜909、＋は右下の丸 48（x601〜649・y863〜911）。切替は残る', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  const t = await box(page.locator('.tabs'));
  expect(near(t.l, 191.5, 1) && near(t.r, 477.5, 1) && near(t.t, 863) && near(t.b, 909), JSON.stringify(t)).toBe(true);
  const bs = tabsGroup(page).getByRole('button');
  await expect(bs).toHaveText(['ホーム', '日', '週', '月']);
  for (const [i, n] of ['ホーム', '日', '週', '月'].entries()) { await expect(tab(page, n)).toHaveAttribute('aria-description', `4個中${i + 1}番目`); const r = await box(bs.nth(i)); expect(near(r.w, 71.5, 0.6) && near(r.h, 46)).toBe(true); }
  const add = await box(page.getByRole('button', { name: '予定を追加' }));
  expect(near(add.l, 601) && near(add.r, 649) && near(add.t, 863) && near(add.b, 911)).toBe(true);
  await expect(page.getByRole('group', { name: '集中モード' })).toBeVisible(); // 切替（カレンダー｜タスク｜ノート）を残す（TP-23 の答えまで）
});

// 閉じた画面で今どれを見ているか（タブの代わり。34 §9.1-9）: ホーム／日の時間軸／週の時間軸／月（カレンダー）
const closedShown = (page) => page.evaluate(() => { const c = document.querySelector('.shell.closed')?.classList; if (!c) return '（開いた画面）'; return c.contains('home') ? 'ホーム' : c.contains('tv-day') ? '日' : c.contains('tv-week') ? '週' : c.contains('cal') ? '月' : '?'; });
const openPressed = (page) => page.evaluate(() => [...document.querySelectorAll('.tabs button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent.trim() ?? '');
test('PR5 選んだ表示は閉じた画面と開いた縦で共通。5回開閉しても同じ表示・同じ日付', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  const sel = () => page.evaluate(() => { const u = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); return `${u.selected}|${u.view}`; });
  for (const name of ['週', '日', '月', 'ホーム']) {
    await tab(page, name).click();
    if (name === '週') { await page.locator('.chead [data-act="next"]').click({ force: true }); await expect.poll(sel).toContain('2026-11-19'); }
    expect(await closedShown(page)).toBe(name);
    const s0 = await sel();
    for (let i = 0; i < 5; i++) {
      await page.setViewportSize(SIZES.openPortrait669);
      await expect.poll(() => layout(page)).toBe('open');
      expect(await openPressed(page), `${name} 開 ${i}`).toBe(name);
      expect(await sel(), `${name} 開 ${i} 日付`).toBe(s0);
      await page.setViewportSize(SIZES.closedPortrait);
      await expect.poll(() => layout(page)).toMatch(/home|browse/);
      expect(await closedShown(page), `${name} 閉 ${i}`).toBe(name);
      expect(await sel(), `${name} 閉 ${i} 日付`).toBe(s0);
    }
  }
});

test('PR5 閉じた画面で「週の時間軸」を見ている途中で開くと、開いた縦も「週」。日付も保つ', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '週').click();
  await page.locator('.chead [data-act="next"]').click({ force: true });
  await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日');
  await page.setViewportSize(SIZES.openPortrait669);
  await expectShown(page, '週');
  await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日'); // 第19版 PR7: 開いた縦の週も同じ月なら短い見出し
  await page.setViewportSize(SIZES.closedPortrait);
  await expect.poll(() => closedShown(page)).toBe('週');
  await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日');
});

test('PR5 ホームを見ている途中で開くと開いた縦もホーム（月ではない）。月なら月のまま閉じてもホームにならない', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait, '', { home: true });
  expect(await closedShown(page)).toBe('ホーム');
  await page.setViewportSize(SIZES.openPortrait669);
  await expectShown(page, 'ホーム');
  await tab(page, '月').click();
  await page.setViewportSize(SIZES.closedPortrait);
  await expect.poll(() => closedShown(page)).toBe('月');
  await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
});

test('PR5 閉じた画面の週: 見出し 48・日付の行 42・終日 24・時間軸 y114〜、1列 48・1時間 44（帯 84 の本文 366 幅）', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await setSafeRight(page, 84);
  await loadSample(page);
  await tab(page, '週').click();
  await expect(page.locator('.tlhd')).toHaveCount(7);
  const ch = await box(page.locator('.chead')), hd = await box(page.locator('.tlheads')), ad = await box(page.locator('.allday')), tl = await box(page.locator('.tl'));
  expect(near(ch.h, 48) && near(hd.t, 48) && near(hd.h, 42) && near(ad.t, 90) && near(ad.h, 24) && near(tl.t, 114), JSON.stringify({ ch, hd, ad, tl })).toBe(true);
  const cols = await page.locator('.tlcol').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(cols).toHaveLength(7);
  for (const w of cols) expect(near(w, 48), `列 ${w}`).toBe(true);
  expect(await page.locator('.tl').evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--hh')))).toBe(44);
  const hl = await page.locator('.hl:not(.half)').evaluateAll((els) => els.slice(0, 3).map((e) => e.getBoundingClientRect().top));
  expect(near(hl[1] - hl[0], 44) && near(hl[2] - hl[1], 44)).toBe(true);
  await expect(page.locator('.tabs')).toHaveCount(0); // 下のタブはない（34 §9.1-9）。戻りは見出しの左の「‹ カレンダー」（x0〜120×44、§9.2）
  const bk = await box(page.locator('.cback'));
  expect(near(bk.l, 0) && near(bk.t, 0) && near(bk.w, 120) && near(bk.h, 44), JSON.stringify(bk)).toBe(true);
  await expect(page.locator('.tlx')).not.toHaveJSProperty('scrollWidth', 0);
  expect(await page.locator('.tlx').evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5)).toBe(true); // 横にはみ出さない（7日が1画面）
  // タスク・ノートは出さない（TP-24）
  await expect(page.locator('.mpane .hcard, .mpane .rmrow, .mpane [data-page="task"], .mpane [data-page="memo"]')).toHaveCount(0);
});

test('PR5 閉じた画面の日: 時間軸 y80〜、1時間 44。タスク・ノートは出さない', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await setSafeRight(page, 84);
  await loadSample(page);
  await tab(page, '日').click();
  const tl = await box(page.locator('.tl'));
  expect(near(tl.t, 80), JSON.stringify(tl)).toBe(true);
  expect(await page.locator('.tl').evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--hh')))).toBe(44);
  await expect(page.locator('.mpane .hcard, .mpane .rmrow, .mpane [data-page="task"], .mpane [data-page="memo"]')).toHaveCount(0);
});

test('PR5 閉じた週・日で日付を変えると 0.25 秒で横に滑る（視差を減らすときは 0.15 秒のフェード）', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await loadSample(page);
  await tab(page, '週').click();
  const run = async () => {
    await page.evaluate(() => { window.__anims = []; const o = Element.prototype.animate; Element.prototype.animate = function (k, opt) { window.__anims.push({ k, d: opt.duration }); return o.call(this, k, opt); }; });
    await page.locator('.chead [data-act="next"]').click({ force: true }); // 閉じた画面の ‹ › は見えない 2×2（34 §9.1-1）
    await expect.poll(() => page.evaluate(() => window.__anims.length)).toBeGreaterThanOrEqual(2);
    return page.evaluate(() => window.__anims);
  };
  const a = await run();
  expect(a[0].d + a[1].d).toBe(250);
  expect(a.some((x) => x.k[1].transform !== 'translateX(0px)' && /translateX\((-?\d+)px\)/.test(x.k[1].transform) && x.k[1].transform !== 'translateX(0px)')).toBe(true);
  await page.waitForFunction(() => !document.documentElement.dataset.swiping);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const b = await run();
  expect(b[0].d + b[1].d).toBe(150);
  expect(b.every((x) => x.k.every((f) => f.transform.includes('translateX(0px)') || f.transform === 'translateX(0)' || /translateX\(-?0px\)/.test(f.transform)))).toBe(true);
});
