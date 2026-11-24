import { test, expect } from '@playwright/test';
import { OPEN_SIZES, SIZES, loadSample, openApp, setStyle, tab, openMenu, layout, monthFormInit, expectShown, moreGo } from './helpers.js';

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
      // 第19.2版 S11e（34 §14.2）: 閉じた横は段を使わない（data-stage なし・いつも月）。縦は 2週の型＝段4（34 §10: 段を「月 1〜3・2週 4〜6・1週 7」に読み替える）
      const land = size.width > size.height;
      const st0 = land ? await page.locator('.mpull').getAttribute('data-stage') : await stageOf(page);
      expect(st0).toBe(land ? null : 4);
      if (land) await expect(page.locator('.mgrab')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '今日へ' })).toHaveCount(0); // 今日が画面にある間は出ない（34 §2.1）
      for (let i = 0; i < (land ? 1 : 4); i++) await page.locator('.mph [data-act="next"]').click({ force: true }); // 見えない「次の月」（2×2・opacity 0）。2週の段は 1週ずつ進む（11/12 → 12/10）。横は月なので 1か月
      await expect(page.locator('#ctitle')).toHaveText('2026年12月');
      await page.getByRole('button', { name: '今日へ' }).click();
      await expect(page.locator('#ctitle')).toHaveText('2026年11月');
      expect(land ? await page.locator('.mpull').getAttribute('data-stage') : await stageOf(page)).toBe(st0); // 段は保つ（§12 Q-11）
      await expect(page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-11-12"]')).toHaveAttribute('aria-selected', 'true');
      await tab(page, '週').click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
      await expect(page.locator('.shell.closed.tv-week')).toHaveCount(1);
      await expect(page.locator('.cback')).toBeVisible();
      await tab(page, '日').click(); // S11e（34 §15-④）: ホームの「タイムライン ›」は、別の画面ではなくカレンダーの日の欄の時間軸 B を開く（「‹ カレンダー」は要らない）
      await expect(page.locator('.shell.closed.tv-day')).toHaveCount(0);
      await expect(page.locator('.shell.closed.cal .mday')).toHaveAttribute('data-dg', 'B');
      await expect(page.locator('.cback')).toHaveCount(0);
      if (!land) expect(await stageOf(page)).toBe(st0); // 段4 は覚えている段のまま（段1〜3 のときだけ段7。§15-④）
      await tab(page, 'ホーム').click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'home');
      await page.getByRole('button', { name: 'カレンダーへ戻る' }).click();
      await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
      await expect(page.locator('#ctitle')).toHaveText('2026年11月');
      expect(land ? await page.locator('.mpull').getAttribute('data-stage') : await stageOf(page)).toBe(st0); // 覚えている段へ戻る
      if (land) { // 横の間は段を書き換えない。縦に戻すと覚えている段（指示10）
        await page.setViewportSize({ width: size.height, height: size.width });
        await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '4');
      }
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
      expect(Math.round(add.w)).toBe(56); expect(Math.round(add.h)).toBe(56); // S11e（34 §15-③・§14.5）: 帯がないときの＋は 見える 48・押せる 56
      const addVis = await box(page.locator('.cadd > :first-child')); expect(Math.round(addVis.w)).toBe(48); expect(Math.round(addVis.h)).toBe(48);
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
      await expect.poll(() => page.evaluate(() => document.querySelector('.ctl .ctask').getBoundingClientRect().right <= innerWidth - 47 + 0.5)).toBe(true); // S11e: ＋の新しい位置（§15-③）は safe を入れる前から下 34 の内側なので、描き直しはタスクの位置で待つ
      const { W, H } = await page.evaluate(() => ({ W: innerWidth, H: innerHeight }));
      const rects = [];
      for (const loc of [0, 1, 2].map((i) => page.locator('.ctl').getByRole('button').nth(i))) rects.push(await box(loc));
      for (const r of rects) {
        expect(r.l).toBeGreaterThanOrEqual(47 - 0.5); expect(r.r).toBeLessThanOrEqual(W - 47 + 0.5);
        expect(r.t).toBeGreaterThanOrEqual(47 - 0.5); expect(r.b).toBeLessThanOrEqual(H - 34 + 0.5);
      }
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(hits(rects[i], rects[j]), `重なり ${i}/${j}`).toBe(false);
    });

    test('日の欄の末尾（ノート）は、日の欄の中を送り切ると下の余白の上に出る（帯なしの縦の段1は 41、帯なしの横は 105）。格子は流れない（34 §2.1・§6.3・§14.5）', async ({ page }) => {
      await openApp(page, size);
      await tab(page, '月').click();
      // 34: 閉じた画面は格子を固定し、日の欄（.mday）の中だけが流れる。タブがなくなったので下の余白は 87 → 41（34 §10「33 全体」）
      const g0 = await box(page.locator('.mgrid'));
      // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦は格子を固定しない。画面（.mpull.browse）が1本で流れ、格子も一緒に流れる。日の欄 .mday はスクロール 0 で見えている箱（下端＝画面の下端）、中身と下の余白は .mdin が持つ。
      // 前→後（縦だけ。横は今までどおり）: 送る口 .mday → .mpull.browse／下の余白 段1 の 41 → 105（どの段でも最後のノートを右下の＋の上まで送れる）で .mdin が持つ／「格子は流れない」→「格子は送った分だけ上へ流れる」
      const sc = page.locator('.mday'), one = size.width < size.height, scr = one ? page.locator('.mpull.browse') : sc, padEl = one ? page.locator('.mday .mdin') : sc;
      const paneBottom = (await box(sc)).b;
      await scr.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const last = await box(page.locator('.mday .mdadd')); // v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 日の欄の末尾は「ノートの欄」（.mdnote）→「＋ タスク」「＋ ノート」の行（.mdadd）
      // S11e（品質の指示13）: 横の確かめを戻した。34 §14: 閉じた横は格子 x8〜374・y64〜424、日の欄は x382 から右・全部の高さ（y0〜466）。この試験は safe=0（帯なし）なので下の余白は 105（§14.5）。縦の段1は日の欄が 74 しかないので 41
      const land = size.width > size.height, pad = 105;
      expect(await padEl.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))).toBe(pad);
      expect(Math.abs(paneBottom - size.height)).toBeLessThan(0.6); // 日の欄は画面の下端まで
      if (land) {
        const pane = await box(sc);
        expect(Math.abs(pane.l - 382)).toBeLessThan(0.6); expect(Math.abs(pane.t)).toBeLessThan(0.6); expect(Math.abs(pane.r - size.width)).toBeLessThan(0.6);
        expect(Math.abs(g0.l - 8) < 0.6 && Math.abs(g0.t - 64) < 0.6 && Math.abs(g0.r - 374) < 0.6 && Math.abs(g0.b - 424) < 0.6, JSON.stringify(g0)).toBe(true);
        expect(last.l).toBeGreaterThanOrEqual(382 + 12 - 0.6); // 日の欄の中身は格子（x382 より左）に出ない
      }
      expect(last.b).toBeLessThanOrEqual(paneBottom - pad + 1);
      if (one ? await padEl.evaluate((el) => el.getBoundingClientRect().height > el.closest('.mpull.browse').clientHeight - 88 + 1) : await sc.evaluate((el) => el.scrollHeight > el.clientHeight + 1)) expect(last.b).toBeGreaterThanOrEqual(paneBottom - pad - 1); // 中身が日の欄より短いとき（横は日の欄が全部の高さ。縦は .mdin が最小の高さ＝画面−88 のまま）は、上の「余白の上」だけを見る
      const st = one ? await scr.evaluate((el) => el.scrollTop) : 0; if (one) expect(st).toBeGreaterThan(0);
      expect(Math.abs((await box(page.locator('.mgrid'))).t - (g0.t - st))).toBeLessThan(0.6); // 横: 格子は流れない。縦: 送った分だけ上へ
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
  // S11e（34 §15-③）: 見出しの右: … x370・タスク x414（各44。右端を 8 あける）。右下: ＋ は押せる 56 を x402〜458・y581〜637（見える 48 は x406〜454・y585〜633）、中心 y609
  const more = await box(page.getByRole('button', { name: 'その他', exact: true })), task = await box(page.locator('.ctl .ctask')), add = await box(page.getByRole('button', { name: '予定を追加' }));
  expect([more.l, more.w, task.l, task.w, add.l, add.w].map(Math.round)).toEqual([370, 44, 414, 44, 402, 56]);
  expect([more.t, more.h, task.t, task.h].map(Math.round)).toEqual([0, 44, 0, 44]);
  expect(Math.round(add.t + add.h / 2)).toBe(609);
  expect(await page.locator('.mday .mdin').evaluate((e) => parseFloat(getComputedStyle(e).paddingBottom))).toBe(105); // 日の欄の下の余白 105（最後のカードを＋の上まで送れる）。v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 余白は日の欄の中身の箱 .mdin が持つ（.mday → .mday .mdin）
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

// 閉じた画面で今どれを見ているか（タブの代わり。34 §9.1-9）: ホーム／日（日の欄の時間軸 B。34 §15-④）／週の時間軸／月（カレンダー）
const closedShown = (page) => page.evaluate(() => { const c = document.querySelector('.shell.closed')?.classList; if (!c) return '（開いた画面）'; return c.contains('home') ? 'ホーム' : c.contains('tv-week') ? '週' : c.contains('cal') ? (document.querySelector('.mday')?.dataset.dg === 'B' ? '日' : '月') : '?'; });
const openPressed = (page) => page.evaluate(() => [...document.querySelectorAll('.tabs button')].find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent.trim() ?? '');
const uiRaw = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
// 第19.2版 S11e（指示14・設計で確定）: 第19版 PR5 の「選んだ表示は閉じた画面と開いた縦で共通」を置き換える。
// 画面の記憶は閉じた画面と開いた画面とで別々。閉じている間は閉じた画面の分（一番上の stage・selected・dayGrip。品質 s11d-design-14-15 S11e(b) の CLOSED_KEYS と同じ）だけを書き、開いた画面の分（view・home）には触れない。開いたら前に開いていた画面に戻る。
test('S11e 画面の記憶は別々: 閉じた画面でどの面を見ていても、開くと前に開いていた表示。5回開閉しても、閉じた側・開いた側それぞれ同じ面', async ({ page }) => {
  await openApp(page, SIZES.openPortrait669);
  await tab(page, '週').click(); // 開いた縦は「週」を選んでおく
  expect((await uiRaw(page)).view).toBe('week');
  await page.setViewportSize(SIZES.closedPortrait);
  await expect.poll(() => layout(page)).toBe('browse');
  expect(await closedShown(page)).toBe('月'); // 閉じた画面はカレンダーから（開いた縦の「週」を持ち込まない）
  for (const name of ['週', '日', 'ホーム', '月']) {
    await tab(page, name).click();
    expect(await closedShown(page)).toBe(name);
    if (name === '日') { await page.locator('.mday .mdct [data-dg="card"]').click(); /* v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 前 .mdback → 後「カード｜時間」の「カード」 */ await tab(page, '月').click(); continue; } // 日の欄を時間軸 B にしたまま次へ進むと「月」の面も B なので、カードへ戻す
    for (let i = 0; i < 5; i++) {
      await page.setViewportSize(SIZES.openPortrait669);
      await expect.poll(() => layout(page)).toBe('open');
      expect(await openPressed(page), `${name} 開 ${i}`).toBe('週'); // 前に開いていた画面
      await page.setViewportSize(SIZES.closedPortrait);
      await expect.poll(() => layout(page)).toMatch(/home|browse/);
      expect(await closedShown(page), `${name} 閉 ${i}`).toBe(name); // 閉じた画面で見ていた面
      const u = await uiRaw(page);
      expect([u.view, u.home === true], `${name} 閉 ${i} 保存`).toEqual(['week', false]); // 閉じている間、開いた画面の保存には触れない
    }
  }
});

test('S11e 閉じた画面で起動すると、開いた縦・横で保存していた画面（view・home）を書き換えない。閉じた画面が書くのは stage・selected・dayGrip だけ', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('__s11e')) { localStorage.setItem('__s11e', '1'); localStorage.setItem('duo.ui.v1', JSON.stringify({ view: 'day', home: true, selected: '2026-10-05', monthForm: 'month', monthDay: 'list', pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } })); } });
  await openApp(page, SIZES.closedPortrait);
  await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse'); // 起動はカレンダー（34 §9.2）
  await expect(page.locator('#ctitle')).toHaveText('2026年10月'); // 閉じた画面の分がまだないときは、前の保存の日から
  await page.locator('.mgrid .day[data-date="2026-10-20"]').click({ position: { x: 8, y: 8 } });
  await page.locator('.mgrab').focus(); await page.keyboard.press('ArrowUp');
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '2');
  await page.locator('.mday .mdct [data-dg="time"]').click(); // v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 前「つまみ（下）にキー ↓」→ 後「見出しの右の『時間』」
  await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
  await moreGo(page, '週の時間軸');
  await expect.poll(async () => { const u = await uiRaw(page); return { selected: u.selected, stage: u.stage, dayGrip: u.dayGrip }; }).toEqual({ selected: '2026-10-20', stage: 2, dayGrip: 1 }); // S11f: 品質 B-2 の形（一番上の stage・selected・dayGrip）
  const u = await uiRaw(page);
  expect([u.view, u.home]).toEqual(['day', true]); // 開いた画面の分はそのまま
  expect(u.closed).toBeUndefined();
  // 読み込み直すと、閉じた画面は自分の分（10/20・段2・B）で開く
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '2');
  await expect(page.locator('.mgrid:not([data-leaving]) .day[data-date="2026-10-20"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
  // 開くと、前に開いていた画面（ホーム）。選んだ日はいま見ている日を引き継ぐ
  await page.setViewportSize(SIZES.openPortrait669);
  await expect.poll(() => layout(page)).toBe('open');
  await expectShown(page, 'ホーム');
});

test('S11e 閉じた画面で「週の時間軸」を見ている途中で開いても、開いた縦は前の表示（月）のまま。日付は引き継ぎ、閉じると週の時間軸に戻る', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '週').click();
  await page.locator('.chead [data-act="next"]').click({ force: true });
  await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日');
  await page.setViewportSize(SIZES.openPortrait669);
  await expectShown(page, '月');
  await expect(page.locator('.day.selected[data-date="2026-11-19"]')).toHaveCount(1); // 選んだ日は引き継ぐ
  await page.setViewportSize(SIZES.closedPortrait);
  await expect.poll(() => closedShown(page)).toBe('週');
  await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日');
});

test('S11e 閉じた画面でホームを見ている途中で開いても、開いた縦はホームにならない（前の表示）。開いた縦で月を選んで閉じると、閉じた画面は見ていたホームのまま', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait, '', { home: true });
  expect(await closedShown(page)).toBe('ホーム');
  await page.setViewportSize(SIZES.openPortrait669);
  await expectShown(page, 'ホーム', false);
  await tab(page, '週').click();
  await page.setViewportSize(SIZES.closedPortrait);
  await expect.poll(() => closedShown(page)).toBe('ホーム');
  await page.getByRole('button', { name: 'カレンダーへ戻る' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-layout', 'browse');
  await page.setViewportSize(SIZES.openPortrait669);
  await expectShown(page, '週');
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

// 第19.2版 S11e（34 §15-④）: 閉じた画面に日の時間軸の画面（28 §1。時間軸 y80〜）はもうない。ホームの「タイムライン ›」は、カレンダーの日の欄の時間軸 B（1時間 44）を開く
// v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 時間（B）の1時間は 44 → 28（最低限）。見出しの下にバー 24（と終日の行）が入るので、最初の予定は「見出しの下 44＋12」→「時間軸の上端から 28＋12」。カードへ戻すのは「カード」（前 .mdback）
test('S11e 閉じた画面の日: ホームの「タイムライン ›」→ カレンダーの日の欄の時間 B（1時間 14）。段1〜3 は段7、段4〜7 はそのまま。9:00 が見出しの下', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await setSafeRight(page, 84);
  await loadSample(page);
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '1');
  await tab(page, '日').click();
  await expect(page.locator('.shell.closed.tv-day')).toHaveCount(0);
  await expect(page.locator('.cback')).toHaveCount(0);
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '7'); // 段1 → 段7（日の欄 y174〜678）
  const md = page.locator('.mday');
  await expect(md).toHaveAttribute('data-dg', 'B');
  const pane = await box(md);
  expect(near(pane.t, 174) && near(pane.b, 678), JSON.stringify(pane)).toBe(true);
  // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 1時間は 28 → 14（予定のない時間。予定のある時間はカードの分だけ広がる）。線は 3 時間ごとなので目盛り（.hlab）で、予定のない 19:00〜21:00 を測る。見せるのは 9:00 から（前: 最初の予定の1時間前から）。バーは時間軸のすぐ下（前: 見出しのすぐ下）
  expect(await page.locator('.mday .tl').evaluate((e) => parseFloat(getComputedStyle(e).getPropertyValue('--hh')))).toBe(14);
  const hl = await page.locator('.mday .hlab').evaluateAll((els) => els.filter((e) => ['1140', '1200', '1260'].includes(e.dataset.rm)).map((e) => e.getBoundingClientRect().top));
  expect(near(hl[1] - hl[0], 14) && near(hl[2] - hl[1], 14)).toBe(true);
  // 最初の時刻つきの予定の1時間前が、貼り付いた見出し（44）のすぐ下
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 日の欄は中でスクロールしない。前→後: 「日の欄の中を送ってある（scrollTop > 0）」→「1時間前より上を畳んである（.mdbody.folded）。日の欄も画面も送っていない」。最初の予定が見出しの下 1時間＋12 にあるのは同じ
  const m = await page.evaluate(() => { const md = document.querySelector('.mday'), tl = md.querySelector('.tl'), ev = [...md.querySelectorAll('.tlev[data-event]')].map((e) => e.getBoundingClientRect().top).sort((a, b) => a - b)[0]; return { ev, head: tl.getBoundingClientRect().top, bar: md.querySelector('.mdgrab').getBoundingClientRect().top - tl.getBoundingClientRect().bottom, st: md.scrollTop + md.closest('.mpull.browse').scrollTop, folded: !!md.querySelector('.mdbody.folded') }; });
  expect(m.st).toBe(0); expect(m.folded).toBe(true);
  expect(Math.abs(m.bar)).toBeLessThan(0.5); // バーは時間軸のすぐ下
  expect(m.ev - m.head).toBeGreaterThan(14 + 12 - 2); expect(m.ev - m.head).toBeLessThan(14 + 12 + 2); // 最初の予定（10:00）は、時間軸の上端から 上のあき 12＋9:00〜10:00 の 14
  await expect(page.locator('.mpane .hcard, .mpane .rmrow, .mpane [data-page="task"], .mpane [data-page="memo"]')).toHaveCount(0);
  // 段4 から開くと、段は覚えている段のまま
  await page.locator('.mday .mdct [data-dg="card"]').click();
  await page.locator('.mgrab').focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '4');
  await tab(page, 'ホーム').click(); await tab(page, '日').click();
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '4');
  await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
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
