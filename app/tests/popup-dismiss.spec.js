// 第11版 PR11: 予定のポップアップの閉じ方（design/08 §5）。幕・外側タップ・下に引く・未保存の確認・0.2秒のフェード。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES, swipe, period } from './helpers.js';

const POSTURES = [
  ['閉じた', SIZES.closedPortrait],
  ['開いた縦', SIZES.openPortrait669],
  ['見開き', SIZES.openLandscape951],
];
const E = ev('p1', '定例会議', '2026-11-12T10:00', '2026-11-12T11:00');
const E2 = ev('p2', '打ち合わせ', '2026-11-13T10:00', '2026-11-13T11:00');

async function setup(page, size) {
  await openApp(page, size);
  await seed(page, [E, E2]);
}
const snapshot = (page) => page.evaluate(() => ({ html: document.querySelector('#app').innerHTML, layout: document.body.dataset.layout }));
async function openFirst(page) {
  await page.locator('[data-event="p1"]:visible').first().click();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#scrim')).toBeVisible();
}
// ポップアップの外にある、下の要素（日付・予定・ボタン・タブ）の中心点。折り目±12 は避ける。
const outsidePoint = (page, sel = '[data-date],[data-event],[data-act],[data-view],button') => page.evaluate((sel) => {
  const d = document.querySelector('#editor').getBoundingClientRect();
  const fold = innerWidth / 2;
  for (const el of document.querySelectorAll(`#app ${sel.split(',').join(',#app ')}`)) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue;
    if (x > d.left - 2 && x < d.right + 2 && y > d.top - 2 && y < d.bottom + 2) continue;
    if (document.body.dataset.layout === 'spread' && Math.abs(x - fold) < 14) continue;
    return { x, y };
  }
  const r = document.querySelector('#editor').getBoundingClientRect();
  return r.top > 20 ? { x: innerWidth / 2, y: 6 } : { x: 6, y: innerHeight - 6 };
}, sel);

for (const [name, size] of POSTURES) {
  test.describe(`${name} ${size.width}×${size.height}`, () => {
    test('幕をタップして閉じる。下の要素は反応しない（選択日・表示・開いた予定が変わらない）', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      const before = await snapshot(page);
      const pt = await outsidePoint(page);
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, pt)).toBe('scrim');
      await page.mouse.click(pt.x, pt.y);
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('#xdetail')).toBeHidden();
      await expect(page.locator('#scrim')).toBeHidden();
      await page.waitForTimeout(600); // 遅れて届く click があっても何も起きない
      expect(await snapshot(page)).toEqual(before);
      // 閉じたあとは普通に操作できる
      await page.locator('[data-event="p1"]:visible').first().click();
      await expect(page.locator('#editor')).toBeVisible();
    });

    test('幕の色は黒12%、フェードは0.25秒（S4: シートと同じ秒数）', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      const bg = await page.locator('#scrim').evaluate((e) => getComputedStyle(e).backgroundColor);
      const img = await page.locator('#scrim').evaluate((e) => getComputedStyle(e).backgroundImage);
      expect(/rgba\(0, 0, 0, 0\.12/.test(bg + img)).toBe(true);
      expect(await page.locator('#scrim').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0.25s');
      expect(await page.locator('#editor').evaluate((e) => getComputedStyle(e).animationDuration)).toContain('0.25s'); // S4: 出るのは animation（opacity の transition ではない）
    });

    test('× で閉じる', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      await page.locator('#close').click();
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('#scrim')).toBeHidden();
    });

    test('見出しを下に引いて閉じる。少しだけ引いたら戻る。横の動きでは閉じない', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      // 第19版: 見出しは ✕・題・✓。左端 44 は ✕ ボタン（つかめない）なので、題（#edtitle）の上からつかむ
      const box = await page.locator('#editor #edtitle').boundingBox();
      const x = box.x + Math.min(20, box.width / 2), y = box.y + box.height / 2;
      const before = await snapshot(page);
      // 少し（30pt）だけ: 戻る
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 30, { steps: 4 }); await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await expect.poll(() => page.locator('#editor').evaluate((e) => e.style.transform)).toBe('');
      // 横: 閉じない・月は動かない
      const p0 = await period(page);
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 150, y + 6, { steps: 6 }); await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      expect(await period(page)).toBe(p0);
      // 十分に引く: 閉じる
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 140, { steps: 8 }); await page.mouse.up();
      await expect(page.locator('#editor')).toBeHidden();
      await page.waitForTimeout(500);
      expect(await snapshot(page)).toEqual(before);
    });

    test('編集シート: 変更なしなら即閉じ。変更ありなら確認（続けるで入力が残る、破棄で閉じる）', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      const before = await snapshot(page);
      await page.locator('#scrim').dispatchEvent('click'); // 変更なし
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('#discard')).toBeHidden();

      await openFirst(page);
      await page.locator('#f-title').fill('変えた名前');
      const pt = await outsidePoint(page);
      await page.mouse.click(pt.x, pt.y);
      await expect(page.locator('#discard')).toBeVisible();
      await expect(page.locator('#editor')).toBeVisible();
      // 確認シートは外側タップで閉じない
      const pt2 = await outsidePoint(page);
      const dr = await page.locator('#discard').boundingBox();
      const px = dr.x > 20 ? 10 : pt2.x, py = pt2.y;
      await page.mouse.click(px, py);
      await expect(page.locator('#discard')).toBeVisible();
      await page.getByRole('button', { name: '編集を続ける' }).click();
      await expect(page.locator('#discard')).toBeHidden();
      await expect(page.locator('#f-title')).toHaveValue('変えた名前');

      await page.locator('#scrim').dispatchEvent('click');
      await expect(page.locator('#discard')).toBeVisible();
      await page.getByRole('button', { name: '破棄', exact: true }).click();
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('#discard')).toBeHidden();
      await page.waitForTimeout(400);
      expect(await snapshot(page)).toEqual(before);
      // 保存されていない
      await openFirst(page);
      await expect(page.locator('#f-title')).toHaveValue('定例会議');
    });

    test('下に引いても、変更ありなら確認が出る', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      await page.locator('#f-place').fill('会議室');
      // 第19版: 見出しは ✕・題・✓。左端 44 は ✕ ボタン（つかめない）なので、題（#edtitle）の上からつかむ
      const box = await page.locator('#editor #edtitle').boundingBox();
      const x = box.x + Math.min(20, box.width / 2), y = box.y + box.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 140, { steps: 8 }); await page.mouse.up();
      await expect(page.locator('#discard')).toBeVisible();
      await expect(page.locator('#editor')).toBeVisible();
      await expect.poll(() => page.locator('#editor').evaluate((e) => e.style.transform)).toBe('');
      await page.getByRole('button', { name: '編集を続ける' }).click();
      await expect(page.locator('#f-place')).toHaveValue('会議室');
    });

    test('削除の確認シートは外側タップで閉じない（編集シートも開いたまま）', async ({ page }) => {
      await setup(page, size);
      await openFirst(page);
      await page.locator('#delete').click();
      await expect(page.locator('#confirm')).toBeVisible();
      const pt = await outsidePoint(page);
      const cb = await page.locator('#confirm').boundingBox();
      const inside = pt.x > cb.x && pt.x < cb.x + cb.width && pt.y > cb.y && pt.y < cb.y + cb.height;
      await page.mouse.click(inside ? 4 : pt.x, inside ? 4 : pt.y);
      await page.waitForTimeout(400);
      await expect(page.locator('#confirm')).toBeVisible();
      await expect(page.locator('#editor')).toBeVisible();
    });
  });
}

test('閉じた画面: シートの形（下に付く・上だけ丸い・つまみ）と、本文の下引き（touch）で閉じる', async ({ page }) => {
  await setup(page, SIZES.closedPortrait);
  await openFirst(page);
  const st = await page.locator('#editor').evaluate((e) => { const c = getComputedStyle(e); return { r: c.borderBottomLeftRadius, t: c.borderTopLeftRadius, g: getComputedStyle(e, '::before').content }; });
  expect(st.b ?? st.r).toBe('0px');
  expect(st.t).toBe('24px'); // S4: シートの角丸 24
  expect(st.g).toContain('');
  const box = await page.locator('#editor .fbody').boundingBox();
  const x = box.x + box.width / 2, y = box.y + 20;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, yy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: yy }] });
  await touch('touchStart', y);
  for (let i = 1; i <= 8; i++) await touch('touchMove', y + i * 18);
  await touch('touchEnd', y);
  await expect(page.locator('#editor')).toBeHidden();
});

test('開いた縦: 閉じたあとも月のスワイプ（前後移動）が使える', async ({ page }) => {
  await setup(page, SIZES.openPortrait);
  await openFirst(page);
  await page.locator('#scrim').dispatchEvent('click');
  await expect(page.locator('#editor')).toBeHidden();
  await page.waitForTimeout(500);
  const p0 = await period(page);
  await swipe(page, { x0: 440, y0: 500, dx: -120 });
  expect(await period(page)).not.toBe(p0);
});

test('見開き: 幕は折り目±10に掛からない', async ({ page }) => {
  await setup(page, SIZES.openLandscape951);
  await openFirst(page);
  const bg = await page.locator('#scrim').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(bg).toContain('linear-gradient');
});
