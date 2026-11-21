import { test, expect } from '@playwright/test';
import { openApp, tab, SIZES, setStyle } from './helpers.js';

const info = (page) => page.locator('.allbtn').evaluate((b) => {
  const s = b.querySelector('span'), cb = getComputedStyle(b), cs = getComputedStyle(s), r = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
  return { bBg: cb.backgroundColor, bBorder: cb.borderTopWidth, w: r.width, h: r.height, sw: sr.width, sh: sr.height, bg: cs.backgroundColor, bw: cs.borderTopWidth, bc: cs.borderTopColor, color: cs.color };
});

// 第19.2版 S11c（design/34 §9.1-2）: 閉じた画面の見出しの「全部」は消えた（「…」→「月の表現（手帳｜予定名｜全部）」へ）。ボタンの見た目は開いた縦・見開きで見る。
test('閉じた画面の見出しに「全部」ボタンはない。「…」→「月の表現」の「全部」で入り、同じ入口で戻る（選んでいる項目は aria-pressed）', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await tab(page, '月').click();
  await expect(page.locator('.allbtn')).toHaveCount(0);
  await page.getByRole('button', { name: 'その他', exact: true }).click();
  await page.getByRole('menuitem', { name: /月の表現/ }).click();
  const all = page.locator('#m-variant').getByRole('button', { name: '全部', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await all.click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('.scroll.all')).toBeVisible();
  await expect(page.locator('.allbtn')).toHaveCount(0);
  await page.getByRole('button', { name: 'その他', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /月の表現/ })).toHaveText('月の表現（全部）');
  await page.getByRole('menuitem', { name: /月の表現/ }).click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#m-variant').getByRole('button', { name: '予定名', exact: true }).click();
  await expect(page.locator('.scroll.all')).toHaveCount(0);
});

for (const [name, size] of [['開いた縦', SIZES.openPortrait], ['見開き', SIZES.openLandscape]]) {
  test(`「全部」ボタンの見た目（${name}）: 通常は紙色の地に枠と文字、全部表示のときだけ緑。押せる範囲は 44×44 で透明`, async ({ page }) => {
    await openApp(page, size);
    if (name !== '見開き') await tab(page, '月').click(); // 見開きの既定は左=月
    let i = await info(page);
    expect(i.bBg).toBe('rgba(0, 0, 0, 0)');
    expect([i.h, i.sh]).toEqual([44, 28]); expect(i.w).toBeGreaterThanOrEqual(44); expect(i.sw).toBeGreaterThanOrEqual(28); // 設計 V-26: 「全部」は幅なり・高さ 28（角丸 14）
    expect(i.bg).toBe('rgb(247, 244, 237)');
    expect(parseFloat(i.bw)).toBeGreaterThanOrEqual(1); // CSS は 1.5px。Chromium は計算値を 1px に丸めるため下限だけ見る
    expect(i.bc).toBe('rgb(41, 59, 53)');
    expect(i.color).toBe('rgb(41, 59, 53)');
    await page.locator('.allbtn').click();
    await expect(page.locator('.allbtn')).toHaveAttribute('aria-pressed', 'true');
    i = await info(page);
    expect(i.bBg).toBe('rgba(0, 0, 0, 0)'); // 後ろの 44×44 の四角が出ない
    expect([i.h, i.sh]).toEqual([44, 28]); expect(i.w).toBeGreaterThanOrEqual(44); expect(i.sw).toBeGreaterThanOrEqual(28); // 設計 V-26: 「全部」は幅なり・高さ 28（角丸 14）
    expect(i.bg).toBe('rgb(41, 78, 66)');
    expect(i.color).toBe('rgb(255, 255, 255)');
  });
}
