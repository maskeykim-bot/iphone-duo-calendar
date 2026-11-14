import { test, expect } from '@playwright/test';
import { openApp, seed, ev, tab, layout, setStyle, SIZES, chip } from './helpers.js';

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
const openMenu = (page) => page.getByRole('button', { name: 'その他' }).click();

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
  const CASES = [
    // [size, 月の列幅, grid-top, tabs-x, tabs-y, fold-x, left-end]
    [SIZES.closedPortrait, 53.71, 102, 57, 606, null, 380, 'browse'],
    [SIZES.openPortrait, 89.43, 93.59, 178, 824.51, null, 626, 'open'],
    [SIZES.openPortrait669, 95.57, 100, 199.5, 881, null, 669, 'open'],
    [SIZES.openLandscape, 61, 89.83, 86.5, 571.73, 445, 435, 'spread'],
    [SIZES.openLandscape951, 65.36, 96, 101.75, 611, 475.5, 465.5, 'spread'],
  ];
  for (const [size, c, gt, tx, ty, fold, leftEnd] of CASES) {
    test(`${size.width}×${size.height}`, async ({ page }) => {
      await openApp(page, size);
      near(await cssVar(page, 'month-col-w'), c);
      near(await cssVar(page, 'grid-top'), gt);
      near(await cssVar(page, 'tabs-x'), tx, 0.1);
      near(await cssVar(page, 'tabs-y'), ty, 0.02);
      near(await cssVar(page, 'left-end'), leftEnd, 0.02);
      expect(await cssVar(page, 'tabs-w')).toBe(270);
      expect(await cssVar(page, 'layout-w')).toBe(size.width);
      expect(await cssVar(page, 'layout-h')).toBe(size.height);
      if (fold !== null) near(await cssVar(page, 'fold-x'), fold);
      near(await cssVar(page, 'fold-x'), size.width / 2);
    });
  }
  test('safe 上47 下34（626×890）: 内容は安全矩形の内側、下端は H-下safe を越えない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await setSafe(page, { t: 47, b: 34 });
    await expect.poll(() => cssVar(page, 'content-y')).toBe(47);
    expect(await cssVar(page, 'content-h')).toBe(809);
    near(await cssVar(page, 'grid-top'), 132.07, 0.02);
    near(await cssVar(page, 'tabs-y'), 796.45, 0.02);
    expect(await cssVar(page, 'tabs-y') + 46).toBeLessThanOrEqual(890 - 34);
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
  for (const [name, size] of SIZES5) {
    test(`${name}: メニューに W×H・DPR・safe が出る`, async ({ page }) => {
      await openApp(page, size);
      await openMenu(page);
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
    await openMenu(page);
    await setSafe(page, { t: 47, b: 34 });
    await expect(page.locator('#layout-diagnostics')).toHaveText('626×890 px · DPR 1 · safe 上47 右0 下34 左0 px');
    expect(await cssVar(page, 'content-y')).toBe(47);
    await setSafe(page, { t: 0, r: 47, b: 0, l: 47 });
    await expect(page.locator('#layout-diagnostics')).toHaveText('626×890 px · DPR 1 · safe 上0 右47 下0 左47 px');
  });
  test('メニュー表示中の resize・キーボード相当の高さ縮小でも生の値に追随する', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await openMenu(page);
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
        await openMenu(page);
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
    if (el.matches('.strip') ? el.dataset.sday === k : r.left < mid && r.right > mid) ids.push(el.dataset.event);
  }
  const total = Number(document.querySelector(`[data-date="${k}"]`).getAttribute('aria-label').match(/予定(\d+)件/)[1]);
  const plus = week.querySelector(`.plus[data-jump="${k}"]`);
  return { ids, total, plus: plus ? Number(plus.textContent.replace('+', '')) : 0 };
}, k);

test.describe('月レーン: 終日・帯・時刻チップの混在', () => {
  for (const [name, size, cap] of [['閉じた 466×678', SIZES.closedPortrait, 4], ['開いた縦 669×951', SIZES.openPortrait669, 5], ['開いた横 951×669', SIZES.openLandscape951, 5]]) {
    test(`${name}: +N = 全件 - 置いた件数、同じ予定は同じ日に二重に置かない（通常 ${cap} 段）`, async ({ page }) => {
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
      expect(d.ids.length).toBe(cap);
      // 帯（終日・複数日）が先に置かれ、時刻チップは残った段
      expect(d.ids.slice(0, 3).sort()).toEqual(['bx', 'by', 'lone']);
    });
  }
  test('+N は日一覧へ（全件が見える）', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await seed(page, MIX);
    await monthOf(page, SIZES.openPortrait669);
    await page.locator('.plus[data-jump="2026-11-12"]').click();
    await expect(page.locator('.daylist .event')).toHaveCount(9);
  });
  test('手帳: 点は閉じ4・開き5まで、超過は +N', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, MIX);
    await tab(page, '月').click();
    await setStyle(page, '手帳');
    await expect(page.locator('[data-date="2026-11-12"] .dot')).toHaveCount(4);
    await expect(page.locator('.plus[data-jump="2026-11-12"]')).toHaveText('+5');
    await page.setViewportSize(SIZES.openLandscape951);
    await expect.poll(() => layout(page)).toBe('spread');
    await setStyle(page, '手帳');
    await expect(page.locator('[data-date="2026-11-12"] .dot')).toHaveCount(5);
    await expect(page.locator('.plus[data-jump="2026-11-12"]')).toHaveText('+4');
  });
});

test.describe('月の文字「大」・時刻の出し入れ', () => {
  const six = Array.from({ length: 6 }, (_, i) => ev(`z${i}`, `大小${i}`, `2026-11-12T${String(9 + i).padStart(2, '0')}:00`, `2026-11-12T${String(9 + i).padStart(2, '0')}:30`));
  const menuBtn = (page, name) => page.locator('#menu').getByRole('button', { name });

  test('「月の文字: 大」は 11px・各姿勢で1件減り、再読み込み後も保たれる', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await seed(page, six);
    await setStyle(page, '予定名');
    await expect(chip(page, '2026-11-12')).toHaveCount(5);
    await openMenu(page);
    await menuBtn(page, /^月の文字/).click();
    await expect(chip(page, '2026-11-12')).toHaveCount(4);
    await expect(page.locator('.plus[data-jump="2026-11-12"]')).toHaveText('+2');
    expect(await chip(page, '2026-11-12').first().evaluate((e) => getComputedStyle(e).fontSize)).toBe('11px');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).monthTextSize)).toBe('large');
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(chip(page, '2026-11-12')).toHaveCount(4);
    // 閉じた画面は 4→3
    await page.setViewportSize(SIZES.closedPortrait);
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    await expect(chip(page, '2026-11-12')).toHaveCount(3);
    // 標準へ戻す
    await openMenu(page);
    await menuBtn(page, /^月の文字/).click();
    await expect(chip(page, '2026-11-12')).toHaveCount(4);
  });

  test('時刻は閉じ（既定オフ）と開き（既定オン）で別。切替は保存され、題名の全文は aria に残る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, six.slice(0, 1));
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    const s = chip(page, '2026-11-12');
    await expect(s).toHaveText('大小0');
    await expect(s).toHaveAttribute('aria-label', /09:00 – 09:30 大小0/);
    await openMenu(page);
    const t = menuBtn(page, '月表示に時刻を出す');
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await expect(s).toHaveText('09:00 大小0');
    await expect(s).toHaveAttribute('aria-label', /大小0/);
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')));
    expect(ui).toMatchObject({ monthTimeClosed: true, monthTimeOpen: true });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(chip(page, '2026-11-12')).toHaveText('09:00 大小0');
    // 開いた画面は既定オン → オフにしても閉じた側は変わらない
    await page.setViewportSize(SIZES.openPortrait669);
    await setStyle(page, '予定名');
    await openMenu(page);
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(page, '2026-11-12')).toHaveText('大小0');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ monthTimeClosed: true, monthTimeOpen: false });
  });

  test('旧い保存値（新キーなし）でも既定で補完される', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('duo.ui.v1', JSON.stringify({ view: 'month', style: 'named', home: false, weekStart: 1 })));
    await openApp(page, SIZES.closedPortrait);
    await openMenu(page);
    await expect(page.locator('#menu').getByRole('button', { name: '月表示に時刻を出す' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#menu').getByRole('button', { name: /^月の文字: 標準/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('月の日付・配色・前後月', () => {
  test('前後の月の予定も描き、薄くするのは日付だけ。1日は「12月1日」', async ({ page }) => {
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
    expect(await out.evaluate((e) => ({ op: getComputedStyle(e).opacity, num: getComputedStyle(e.querySelector('.num')).color }))).toEqual({ op: '1', num: 'rgb(168, 171, 164)' });
    expect(await chip(page, '2026-10-26').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    await expect(page.locator('[data-date="2026-12-01"] .num')).toHaveText('12月1日');
    await expect(page.locator('[data-date="2026-11-12"] .num')).toHaveText('12');
  });
  test('土曜セルは淡い青、日曜の日付は赤、選択は2px枠、今日だけ日付が丸', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await setStyle(page, '予定名');
    expect(await page.locator('[data-date="2026-11-14"]').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(238, 241, 244)');
    expect(await page.locator('[data-date="2026-11-15"] .num').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(192, 57, 43)');
    // 選択日 = 今日（11/12）。選択は 2px 枠 #294E42
    expect(await page.locator('[data-date="2026-11-12"]').evaluate((e) => getComputedStyle(e).boxShadow)).toContain('rgb(41, 78, 66) 0px 0px 0px 2px inset');
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 10, y: 10 } });
    expect(await page.locator('[data-date="2026-11-18"]').evaluate((e) => getComputedStyle(e).boxShadow)).toContain('2px');
    expect(await page.locator('[data-date="2026-11-18"] .num').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await page.locator('[data-date="2026-11-12"] .num').evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  });
});
