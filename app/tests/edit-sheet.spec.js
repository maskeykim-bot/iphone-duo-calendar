// 第19版 PR3: 予定の編集シート（design/20 §3・§3.1）。見出し 44（✕・題・✓）、下の帯なし、行 44、キーボードの偽の kbTop で全部見える、溝を飛ばす。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

const dlg = (page) => page.locator('#editor');
const openNew = async (page) => { await page.locator('[data-act="add"]:visible').first().click(); await expect(dlg(page)).toBeVisible(); };

async function fakeEnv(page) {
  await page.addInitScript(() => {
    const vv = new EventTarget(); vv.height = window.innerHeight; vv.offsetTop = 0; vv.scale = 1; vv.width = window.innerWidth;
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    const M = window.__mock = { listeners: {}, posture: { available: true, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen', source: 'reservedRegions', at: 1 } };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.listeners[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m) => {
        if (m === 'getPosture') return JSON.parse(JSON.stringify(M.posture));
        if (m === 'checkPermission' || m === 'reminderPermission' || m === 'notifyStatus') return { status: 'denied' };
        throw { code: 'UNAVAILABLE', message: m };
      },
    };
  });
}
const setKb = (page, kbTop) => page.evaluate(async (k) => { const vv = window.visualViewport; vv.offsetTop = 0; vv.height = k; vv.dispatchEvent(new Event('resize')); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); }, kbTop);
let at = 10;
const fold = (page, rect) => page.evaluate(([r, a]) => window.__mock.listeners.postureChange({ available: true, folded: true, regionRect: r, axis: 'horizontal', angle: 40, status: 'partiallyOpen', source: 'reservedRegions', at: a }), [rect, ++at]);
const rect = (loc) => loc.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height, left: b.left, right: b.right }; });

for (const [name, size] of [['閉じた画面', SIZES.closedPortrait], ['開いた横', SIZES.openLandscape951], ['開いた縦', SIZES.openPortrait669]]) {
  test.describe(`編集シートの形（${name}）`, () => {
    test('見出し 44 に ✕・題・✓。下の固定の帯がない。✓ で保存、✕ で閉じる', async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      const head = await rect(dlg(page).locator('.formhead'));
      expect(head.h).toBeCloseTo(44, 0);
      await expect(dlg(page).locator('#edtitle')).toHaveText('予定を追加');
      for (const sel of ['#close', '#save']) { const b = await rect(dlg(page).locator(sel)); expect(b.h).toBeGreaterThanOrEqual(44); expect(b.right - b.left).toBeGreaterThanOrEqual(44); }
      await expect(dlg(page).locator('.factions, .actions')).toHaveCount(0);
      await expect(dlg(page).locator('#f-title')).toHaveAttribute('placeholder', 'タイトル');
      await dlg(page).locator('#f-title').fill('PR3の予定');
      await dlg(page).locator('#save').click();
      await expect(dlg(page)).toBeHidden();
      await openNew(page);
      await dlg(page).locator('#close').click();
      await expect(dlg(page)).toBeHidden();
    });

    test('行は高さ 44 の横並び。長さのチップは3つずつ2行（S5 H-10）。日付 130×32・時刻 72×32、終日はスイッチ 51×31', async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      for (const id of ['#row-s', '#row-e', '#row-d', '#dest-l']) expect((await rect(dlg(page).locator(id))).h).toBeGreaterThanOrEqual(44);
      const chips = dlg(page).locator('#f-dur .dchip');
      await expect(chips).toHaveText(['15分', '30分', '1時間', '1.5時間', '2時間', '3時間']);
      const tops = await chips.evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(new Set(tops).size).toBe(2); // 3つずつ2行（84.7×28・間 8）
      expect((await rect(chips.first())).h).toBeCloseTo(28, 0);
      const d = await dlg(page).locator('#f-start').boundingBox(), t = await dlg(page).locator('#f-stime').boundingBox();
      expect(d.width).toBeCloseTo(130, 0); expect(t.width).toBeCloseTo(72, 0);
      expect(d.height).toBeLessThanOrEqual(44); expect(t.height).toBeLessThanOrEqual(44);
      const sw = await rect(dlg(page).locator('#f-all'));
      expect(sw.right - sw.left).toBeCloseTo(51, 0); expect(sw.h).toBeCloseTo(31, 0);
      await expect(dlg(page).locator('#dtbox')).toHaveCSS('border-top-width', '0px');
      // 選んだ長さは緑の地に白
      await dlg(page).locator('#f-dur .dchip[data-min="15"]').click();
      await expect(dlg(page).locator('#f-dur .dchip[aria-pressed=true]')).toHaveText('15分');
      await expect(dlg(page).locator('#f-dur .dchip[aria-pressed=true]')).toHaveCSS('color', 'rgb(255, 255, 255)');
    });

    test('「予定を削除」は本文の最後（編集のとき）。予定名の Return は保存せず次の行へ', async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      await expect(dlg(page).locator('#delete')).toBeHidden();
      await dlg(page).locator('#f-title').fill('Return');
      await dlg(page).locator('#f-title').press('Enter');
      await expect(dlg(page)).toBeVisible();
      await expect(dlg(page).locator('#f-dest')).toBeFocused();
    });
  });
}

test('開いた横（kbTop 372）: タイトル・カレンダー・開始・終了・長さ・終日が全部見え、シートの下端は kbTop−8', async ({ page }) => {
  await fakeEnv(page);
  await openApp(page, SIZES.openLandscape951);
  await openNew(page);
  await dlg(page).locator('#f-title').focus();
  await setKb(page, 372);
  const sh = await rect(dlg(page));
  expect(sh.top).toBeCloseTo(12, 0);
  expect(sh.bottom).toBeCloseTo(364, 0);
  for (const id of ['#f-title', '#dest-l', '#row-s', '#row-e', '#row-d', '.check']) {
    const r = await rect(dlg(page).locator(id).first());
    expect(r.top).toBeGreaterThanOrEqual(sh.top); expect(r.bottom).toBeLessThanOrEqual(364.5);
  }
  await expect(dlg(page).locator('#f-title')).toBeFocused();
});

test('開いた縦: 溝（467〜484 と別の値）に止まる行がない。繰り返しなど下の行は下の面から', async ({ page }) => {
  await fakeEnv(page);
  await openApp(page, SIZES.openPortrait669);
  await openNew(page);
  for (const g of [{ y: 467, height: 17 }, { y: 440, height: 30 }]) {
    await fold(page, { x: 0, y: g.y, width: 669, height: g.height });
    await page.evaluate(() => window.__editorGrooveNow());
    const [a0, a1] = await page.evaluate(() => [parseFloat(document.documentElement.style.getPropertyValue('--groove-avoid-y0')), parseFloat(document.documentElement.style.getPropertyValue('--groove-avoid-y1'))]);
    expect(a1).toBeGreaterThan(a0);
    const rows = await dlg(page).locator('.fbody .erow:visible').evaluateAll((l) => l.map((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; }));
    expect(rows.length).toBeGreaterThan(6);
    for (const r of rows) expect(r.bottom <= a0 + 0.5 || r.top >= a1 - 0.5, `${JSON.stringify(r)} vs ${a0}〜${a1}`).toBe(true);
  }
});
