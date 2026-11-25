import { test, expect } from '@playwright/test';
import { openApp, seed, ev, tab, layout, setStyle, SIZES, chip, openMenu, monthFormInit } from './helpers.js';

// 第10版 ①: 寸法の唯一の入力（innerWidth/innerHeight と safe-area）→ 判定・CSS変数・診断行。
// 画面サイズ・折り目は決め打ちしない: どの値も viewport と safe からの計算で検証する。
const SIZES5 = [
  ['closed-466x678', SIZES.closedPortrait, ['home', 'browse']],
  ['open-portrait-626x890', SIZES.openPortrait, ['open']],
  ['open-portrait-669x951', SIZES.openPortrait669, ['open']],
  ['open-landscape-890x626', SIZES.openLandscape, ['spread']],
  ['open-landscape-951x669', SIZES.openLandscape951, ['spread']],
];
const cssVar = (page, name) => page.evaluate((n) => parseFloat(document.documentElement.style.getPropertyValue(`--${n}`)), name);
const setSafe = (page, { t = 0, r = 0, b = 0, l = 0 }) => page.evaluate(([t, r, b, l]) => {
  const s = document.documentElement.style;
  s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`);
}, [t, r, b, l]);
const diag = (page) => page.evaluate(() => document.querySelector('#layout-diagnostics').textContent);

test.describe('姿勢の判定（600 は閉じた判定のブレークポイント。機種寸法ではない）', () => {
  for (const [name, size, kinds] of SIZES5) {
    test(`${name}`, async ({ page }) => {
      await openApp(page, size);
      expect(kinds).toContain(await layout(page));
      const portrait = await page.evaluate(() => document.body.dataset.posture);
      expect(portrait).toBe(size.width < size.height && kinds[0] === 'open' ? 'portrait' : '');
    });
  }
  test('678×466 は閉じた、1024×768 は spread、折り目は常にビューポート中心', async ({ page }) => {
    await openApp(page, SIZES.closedLandscape);
    expect(['home', 'browse']).toContain(await layout(page));
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(() => layout(page)).toBe('spread');
    expect(await cssVar(page, 'fold-x')).toBe(512);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => layout(page)).toBe('open');
    await expect(page.locator('body')).toHaveAttribute('data-posture', 'portrait');
  });
});

test.describe('寸法変数（safe=0 では 06 の基準位置に一致する）', () => {
  const near = (a, b, tol = 0.02) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
  // 第12版 PR4（safe=0）: 閉じた = 本文 [0,W]・q=H/678・見出し下端 76q・grid top 92q・タブ幅 min(286,C-128)（帯なし）、
  // 開いた縦 = head 82・grid top 146（第19.1版 S2: 見出し y82〜126・曜日 20）・タブ 286・下段 top H-88p（第19版 PR5）（p=H/951）、開いた横 = q=H/669・左月 [8,f-10]・タブ top 611q。
  const q6 = (h) => h / 678, p9 = (h) => h / 951;
  const CASES = [
    // [size, 月の列幅, grid-top, tabs-x, tabs-y, fold-x, left-end, tabs-w]
    [SIZES.closedPortrait, 466 / 7, 92 * q6(678), 90, 678 - 41, null, 466, 286], // 第19.2版 S11c: 閉じた画面に下のタブはない（design/34 §9.1-9）。--tabs-y は「下の余白 41 の上端」（y637）を指す（旧: タブの上端 y599）
    [SIZES.openPortrait, 626 / 7, 146, 170, 890 - 88 * p9(890), null, 626, 286], // 第19版 PR5: タブ 286・y は下から 88p
    [SIZES.openPortrait669, 669 / 7, 146, 191.5, 951 - 88 * p9(951), null, 669, 286], // x191〜477・y863
    // v19.6（設計「見開き」・征希さん「各ページの上（設計どおり）」）で仕様変更: 開いた横は上にページ名の行 48。月の格子は 48 下から（grid-top ＝ 48＋96q）。下のタブは無く、--tabs-y は「ページの下の端」（画面の下の端。旧: タブの上端 611q）＝ min(48＋611q, H)
    [SIZES.openLandscape, 61, 48 + 96 * (626 / 669), 101.5, Math.min(48 + 611 * (626 / 669), 626), 445, 435, 240],
    [SIZES.openLandscape951, 65.36, 48 + 96, 116.75, 48 + 611, 475.5, 465.5, 240],
  ];
  for (const [size, c, gt, tx, ty, fold, leftEnd, tw] of CASES) {
    test(`${size.width}×${size.height}`, async ({ page }) => {
      await openApp(page, size);
      near(await cssVar(page, 'month-col-w'), c);
      near(await cssVar(page, 'grid-top'), gt);
      near(await cssVar(page, 'tabs-x'), tx, 0.1);
      near(await cssVar(page, 'tabs-y'), ty, 0.02);
      near(await cssVar(page, 'left-end'), leftEnd, 0.02);
      expect(await cssVar(page, 'tabs-w')).toBe(tw);
      expect(await cssVar(page, 'layout-w')).toBe(size.width);
      expect(await cssVar(page, 'layout-h')).toBe(size.height);
      if (fold !== null) near(await cssVar(page, 'fold-x'), fold);
      near(await cssVar(page, 'fold-x'), size.width / 2);
    });
  }
  test('safe 上47 下34（626×890）: 内容は安全矩形の内側、見出しは上 safe に足さず head=max(T,82)', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await setSafe(page, { t: 47, b: 34 });
    await expect.poll(() => cssVar(page, 'content-y')).toBe(47);
    expect(await cssVar(page, 'content-h')).toBe(809);
    near(await cssVar(page, 'head-h'), 82);
    near(await cssVar(page, 'grid-top'), 146, 0.02);
    near(await cssVar(page, 'tabs-y'), 890 - 34 - 88 * ((890 - 34) / 951), 0.02);
    expect(await cssVar(page, 'tabs-y') + 46).toBeLessThanOrEqual(890 - 34);
    await setSafe(page, { t: 100 });
    await expect.poll(() => cssVar(page, 'head-h')).toBe(100);
    near(await cssVar(page, 'grid-top'), 164, 0.02);
  });
  test('safe 左右47（890×626）でも折り目は 445 のまま・左はsafe内側へ', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await setSafe(page, { l: 47, r: 47 });
    await expect.poll(() => cssVar(page, 'content-x')).toBe(47);
    near(await cssVar(page, 'fold-x'), 445);
    near(await cssVar(page, 'left-end'), 435);
    near(await cssVar(page, 'month-col-w'), (435 - 55) / 7);
    near(await cssVar(page, 'right-start'), 455);
  });
  test('safe が非対称でも折り目を動かさない（左0・右47）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await setSafe(page, { l: 0, r: 47 });
    await expect.poll(() => cssVar(page, 'content-w')).toBe(951 - 47);
    near(await cssVar(page, 'fold-x'), 475.5);
  });
});

test.describe('診断行（設定メニュー）', () => {
  test('画面寸法の診断行が出て、リサイズで更新される', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await openMenu(page, 'details');
    const d = page.locator('#screen-diagnostics');
    await expect(d).toBeVisible();
    const w = SIZES.closedPortrait.width, h = SIZES.closedPortrait.height;
    await expect(d).toContainText(`画面 ${w}×${h} CSS px ・ DPR 1 ・ screen `);
    await expect(d).toContainText('safe-area 上0 右0 下0 左0');
    await page.setViewportSize({ width: 626, height: 890 });
    await expect(d).toContainText('画面 626×890 CSS px');
  });

  for (const [name, size] of SIZES5) {
    test(`${name}: メニューに W×H・DPR・safe が出る`, async ({ page }) => {
      await openApp(page, size);
      await openMenu(page, 'details');
      const d = page.locator('#layout-diagnostics');
      await expect(d).toBeVisible();
      await expect(d).toHaveText(`${size.width}×${size.height} px · DPR 1 · safe 上0 右0 下0 左0 px`);
      expect(parseFloat(await d.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(11);
      // 選択してコピーできる
      expect(await d.evaluate((e) => getComputedStyle(e).userSelect)).not.toBe('none');
    });
  }
  test('safe だけが変わっても（resize なしで）診断も寸法変数も追随する', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await openMenu(page, 'details');
    await setSafe(page, { t: 47, b: 34 });
    await expect(page.locator('#layout-diagnostics')).toHaveText('626×890 px · DPR 1 · safe 上47 右0 下34 左0 px');
    expect(await cssVar(page, 'content-y')).toBe(47);
    await setSafe(page, { t: 0, r: 47, b: 0, l: 47 });
    await expect(page.locator('#layout-diagnostics')).toHaveText('626×890 px · DPR 1 · safe 上0 右47 下0 左47 px');
  });
  test('メニュー表示中の resize・キーボード相当の高さ縮小でも生の値に追随する', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await openMenu(page, 'details');
    await page.setViewportSize({ width: 669, height: 640 }); // キーボード相当
    await expect(page.locator('#layout-diagnostics')).toHaveText('669×640 px · DPR 1 · safe 上0 右0 下0 左0 px');
    await page.setViewportSize({ width: 951, height: 669 });
    await expect(page.locator('#layout-diagnostics')).toHaveText('951×669 px · DPR 1 · safe 上0 右0 下0 左0 px');
  });
  for (const dpr of [2, 3]) {
    test.describe(`DPR ${dpr}`, () => {
      test.use({ deviceScaleFactor: dpr });
      test(`DPR ${dpr} を表示（CSS px は割らない）`, async ({ page }) => {
        await openApp(page, SIZES.closedPortrait);
        await openMenu(page, 'details');
        await expect(page.locator('#layout-diagnostics')).toHaveText(`466×678 px · DPR ${dpr} · safe 上0 右0 下0 左0 px`);
        expect(await cssVar(page, 'layout-w')).toBe(466);
      });
    });
  }
});

// 11/9〜15 の週: 11/12 に 終日1・複数日帯2・時刻6 = 9件。
const MIX = [
  ev('lone', '単日終日', '2026-11-12T00:00', '2026-11-12T23:59', { all: true }),
  ev('bx', '帯X', '2026-11-12T00:00', '2026-11-14T23:59', { all: true }),
  ev('by', '帯Y', '2026-11-10T00:00', '2026-11-12T23:59', { all: true }),
  ...Array.from({ length: 6 }, (_, i) => ev(`t${i}`, `時刻${i}`, `2026-11-12T${String(9 + i).padStart(2, '0')}:00`, `2026-11-12T${String(9 + i).padStart(2, '0')}:30`)),
];
async function monthOf(page, size) {
  if (size === SIZES.closedPortrait) await tab(page, '月').click();
  await setStyle(page, '予定名');
}
const placedOn = (page, k) => page.evaluate((k) => {
  const week = document.querySelector(`[data-date="${k}"]`).closest('.week');
  const cell = document.querySelector(`[data-date="${k}"]`).getBoundingClientRect(), mid = (cell.left + cell.right) / 2;
  const ids = [];
  for (const el of week.querySelectorAll('.bar, .strip')) {
    const r = el.getBoundingClientRect();
    if (el.matches('.strip') ? el.dataset.sday === k : r.left < mid && r.right > mid) ids.push([Number(el.dataset.lane ?? 0), el.dataset.event || el.dataset.cont]);
  }
  ids.sort((a, b) => a[0] - b[0]); ids.forEach((v, i) => { ids[i] = v[1]; }); // 第19.2版 S11b: 閉じた7段の帯は1マスごとの片（先頭の片が data-event、続きは data-cont）。段（lane）の順に並べる
  const total = Number(document.querySelector(`[data-date="${k}"]`).getAttribute('aria-label').match(/予定(\d+)件/)[1]);
  const plus = week.querySelector(`.plus[data-plus="${k}"]`);
  return { ids, total, plus: plus ? Number(plus.textContent.replace('+', '')) : 0 };
}, k);

test.describe('月レーン: 終日・帯・時刻チップの混在', () => {
  // 第19.1版 H-05: 「+N」は日付の行の右に置き、段は全部名前に使う（置く件数は cap）。月を引く画面の2週: 閉じ 4段・縦 6段
  for (const [name, size, cap, placed] of [['閉じた 466×678', SIZES.closedPortrait, 4, 4], ['開いた縦 669×951', SIZES.openPortrait669, 6, 6], ['開いた横 951×669', SIZES.openLandscape951, 4, 4]]) {
    test(`${name}: +N = 全件 - 置いた件数、同じ予定は同じ日に二重に置かない（通常 ${cap} 段）`, async ({ page }) => {
      if (size.width < size.height) await monthFormInit(page, 'two');
      await openApp(page, size);
      await seed(page, MIX);
      await monthOf(page, size);
      for (const k of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']) {
        const { ids, total, plus } = await placedOn(page, k);
        expect(new Set(ids).size, `${k} 重複`).toBe(ids.length);
        expect(ids.length).toBeLessThanOrEqual(cap);
        expect(plus, k).toBe(total - ids.length);
      }
      const d = await placedOn(page, '2026-11-12');
      expect(d.total).toBe(9);
      expect(d.ids.length).toBe(placed);
      // 帯（終日・複数日）が先に置かれ、時刻チップは残った段
      expect(d.ids.slice(0, 3).sort()).toEqual(['bx', 'by', 'lone']);
    });
  }
  test('+N は日一覧へ（全件が見える）', async ({ page }) => {
    // 月を引く画面の日の部分は「予定」（.mdlist）で見る（helpers の openApp は既定で時間軸にするため）
    await monthFormInit(page);
    await openApp(page, SIZES.openPortrait669);
    await seed(page, MIX);
    await monthOf(page, SIZES.openPortrait669);
    await page.locator('[data-date="2026-11-12"]').click({ position: { x: 8, y: 9 } }); // V-03: +N は押す的でない。マスをたたく。月を引く画面: 日の部分がその日になり、9件が全部見える
    await expect(page.locator('.mdlist .mdev')).toHaveCount(9);
  });
  test('手帳: 点は閉じ4・開き横(6週)4まで、超過は +N', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, MIX);
    await page.setViewportSize(SIZES.openLandscape951); // 閉じた画面の月は PR6 から予定名の帯だけ（手帳の点は開いた横・卓上）
    await expect.poll(() => layout(page)).toBe('spread');
    await setStyle(page, '手帳');
    await expect(page.locator('[data-date="2026-11-12"] .dot')).toHaveCount(4);
    await expect(page.locator('.plus[data-plus="2026-11-12"]')).toHaveText('+5');
  });
});

test.describe('月の文字「大」・時刻の出し入れ', () => {
  const six = Array.from({ length: 6 }, (_, i) => ev(`z${i}`, `大小${i}`, `2026-11-12T${String(9 + i).padStart(2, '0')}:00`, `2026-11-12T${String(9 + i).padStart(2, '0')}:30`));
  const menuBtn = (page, name) => page.locator('#menu').getByRole('button', { name });

  test('「月の文字: 大」は 11px・各姿勢で1件減り、再読み込み後も保たれる', async ({ page }) => {
    await monthFormInit(page, 'two');
    await openApp(page, SIZES.openPortrait669);
    await seed(page, six);
    await setStyle(page, '予定名');
    // 開いた縦の月は 2週の型（6段）。6件ちょうどは全部出る。「大」は 1段減って 5件＋「+1」（+N は日付の行）
    await expect(chip(page, '2026-11-12')).toHaveCount(6);
    await openMenu(page, 'display');
    await menuBtn(page, /^月の文字/).click();
    await expect(chip(page, '2026-11-12')).toHaveCount(5);
    await expect(page.locator('.plus[data-plus="2026-11-12"]')).toHaveText('+1');
    expect(await chip(page, '2026-11-12').first().evaluate((e) => getComputedStyle(e).fontSize)).toBe('11px');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).monthTextSize)).toBe('large');
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(chip(page, '2026-11-12')).toHaveCount(5);
    // 第19.2版 S11b: 閉じた画面は7段（34 §2.2）で、1マスの件数は段が決める（段1は4件）。「大」でも段の件数は変えない
    await page.setViewportSize(SIZES.closedPortrait);
    await tab(page, '月').click();
    await expect(chip(page, '2026-11-12')).toHaveCount(4);
    // 標準へ戻す（4段: 4件＋「+2」）
    await openMenu(page, 'display');
    await menuBtn(page, /^月の文字/).click();
    await expect(chip(page, '2026-11-12')).toHaveCount(4);
  });

  test('時刻は閉じ・開きとも既定オフで別。切替は保存され、題名の全文は aria に残る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, six.slice(0, 1));
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    const s = chip(page, '2026-11-12');
    await expect(s).toHaveText('大小0');
    // チップは押す的ではない（S5）。題名の全文はマスのボタンの aria-label「予定1件：…」に残る
    await expect(s).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.calendar .day[data-date="2026-11-12"]')).toHaveAttribute('aria-label', /予定1件：(\d+:\d\d )?大小0/);
    await openMenu(page, 'display');
    const t = menuBtn(page, '月表示に時刻を出す');
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await expect(s).toHaveText('9:00 大小0');
    await expect(page.locator('.calendar .day[data-date="2026-11-12"]')).toHaveAttribute('aria-label', /大小0/);
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')));
    expect(ui).toMatchObject({ monthTimeClosed: true, monthTimeOpen: false });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(chip(page, '2026-11-12')).toHaveText('9:00 大小0');
    // 開いた画面も既定オフ（保存済みの閉じ側「入」とは別）→ オンにするとオンのみ
    await page.setViewportSize(SIZES.openPortrait669);
    await setStyle(page, '予定名');
    await openMenu(page, 'display');
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, '2026-11-12')).toHaveText('大小0');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(page, '2026-11-12')).toHaveText('9:00 大小0');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ monthTimeClosed: true, monthTimeOpen: true });
  });

  test('第10版が自動保存した開き側「入」は切に戻る。第11版以降に明示した「入」は尊重。先頭0なし（3:00 / 10:00）', async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('duo.ui.v1')) localStorage.setItem('duo.ui.v1', JSON.stringify({ view: 'month', style: 'named', home: false, weekStart: 1, monthTimeClosed: false, monthTimeOpen: true })); });
    await openApp(page, SIZES.openPortrait669);
    await seed(page, [ev('e3', '早朝', '2026-11-12T03:00', '2026-11-12T04:00'), ev('e10', '昼前', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await tab(page, '月').click().catch(() => {});
    await setStyle(page, '予定名');
    await expect(chip(page, '2026-11-12').first()).not.toHaveText(/\d:\d\d/);
    await openMenu(page, 'display');
    await menuBtn(page, '月表示に時刻を出す').click();
    await expect(chip(page, '2026-11-12').filter({ hasText: '早朝' })).toHaveText('3:00 早朝');
    await expect(chip(page, '2026-11-12').filter({ hasText: '昼前' })).toHaveText('10:00 昼前');
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(chip(page, '2026-11-12').filter({ hasText: '早朝' })).toHaveText('3:00 早朝');
  });

  test('旧い保存値（新キーなし）でも既定で補完される', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('duo.ui.v1', JSON.stringify({ view: 'month', style: 'named', home: false, weekStart: 1 })));
    await openApp(page, SIZES.closedPortrait);
    await openMenu(page, 'display');
    await expect(page.locator('#menu').getByRole('button', { name: '月表示に時刻を出す' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#menu').getByRole('button', { name: /^月の文字: 標準/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('月の日付・配色・前後月', () => {
  // 第19.4版（design/36 §15.4）で仕様変更: 前「薄くするのは日付だけ（数字 #A8ABA4）」→ 数字も予定もまとめて薄く（文字 #5D6963・数字は普通の太さ。不透明度は使わない）
  test('前後の月の予定も描き、数字も予定もまとめて薄くする（#5D6963）。1日は六曜オンで「12/1」、オフで「12月1日」', async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('duo.ui.v1')) localStorage.setItem('duo.ui.v1', JSON.stringify({ monthForm: 'month' })); }); // 月の型（前後の月が見える）
    await openApp(page, SIZES.openPortrait669);
    await seed(page, [
      ev('f1', '米 耐久財受注・速報', '2026-10-26T21:30', '2026-10-26T22:00'),
      ev('f2', 'FOMC 政策', '2026-10-29T03:00', '2026-10-29T04:00'),
      ev('nx', '翌月の予定', '2026-12-01T10:00', '2026-12-01T11:00'),
    ]);
    await setStyle(page, '予定名');
    await expect(chip(page, '2026-10-26')).toHaveCount(1);
    await expect(chip(page, '2026-10-29')).toHaveCount(1);
    await expect(chip(page, '2026-12-01')).toHaveCount(1);
    const out = page.locator('[data-date="2026-10-26"]');
    expect(await out.evaluate((e) => ({ op: getComputedStyle(e).opacity, num: getComputedStyle(e.querySelector('.num')).color, fw: getComputedStyle(e.querySelector('.num')).fontWeight }))).toEqual({ op: '1', num: 'rgb(93, 105, 99)', fw: '400' });
    expect(await chip(page, '2026-10-26').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(93, 105, 99)');
    expect(await chip(page, '2026-10-26').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    await expect(page.locator('[data-date="2026-12-01"] .num')).toHaveText('12/1'); // 六曜オン（既定）
    await page.evaluate(() => { const k = 'duo.ui.v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), rokuyo: false })); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('[data-date="2026-12-01"] .num')).toHaveText('12月1日');
    await expect(page.locator('[data-date="2026-11-12"] .num')).toHaveText('12');
  });
  test('土曜セルは淡い青、日曜の日付は赤、選択は2px枠、今日だけ日付が丸', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await setStyle(page, '予定名');
    expect(await page.locator('[data-date="2026-11-14"]').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(238, 241, 244)');
    expect(await page.locator('[data-date="2026-11-15"] .num').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(180, 60, 60)');
    // 選択日 = 今日（11/12）。選択は 2px 枠 #294E42
    expect(await page.locator('[data-date="2026-11-12"]').evaluate((e) => getComputedStyle(e, '::after').boxShadow)).toContain('rgb(41, 78, 66) 0px 0px 0px 2px inset'); // 第19.4版 レビュー直し 必須2: 枠は ::after に描く（1日のチップ ＜ 枠 ＜ 複数日の帯）。見た目は同じ 2px
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 10, y: 10 } }); // 第19版 PR6: 開いた縦の月は日をたたくと下の日の部分が変わる（日表示へは進まない）
    await expect(page.locator('.mdh h3')).toContainText('11月18日（水）');
    expect(await page.locator('[data-date="2026-11-18"]').evaluate((e) => getComputedStyle(e, '::after').boxShadow)).toContain('2px');
    expect(await page.locator('[data-date="2026-11-18"] .num').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await page.locator('[data-date="2026-11-12"] .num').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('キーボード計測（設定 › 詳細だけ）', () => {
  test('詳細に出て、visualViewport の変化に追随し、値を読むだけで高さを変えない', async ({ page }) => {
    await openApp(page, { width: 466, height: 678 });
    await expect(page.locator('#kb-metrics')).toBeHidden();
    await openMenu(page, 'details');
    const k = page.locator('#kb-metrics');
    await expect(k).toBeVisible();
    await expect(k).toContainText('innerHeight 678');
    await expect(k).toContainText('未取得');
    const before = await page.evaluate(() => document.documentElement.style.cssText);
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: { height: 400, offsetTop: 20, scale: 1, addEventListener() {} } });
      void vv; window.dispatchEvent(new Event('resize'));
    });
    await page.setViewportSize({ width: 466, height: 677 });
    await page.setViewportSize({ width: 466, height: 678 });
    await expect(k).toContainText('kbTop 420');
    await expect(k).toContainText('推定キーボード 258');
    expect(typeof before).toBe('string');
  });
});
