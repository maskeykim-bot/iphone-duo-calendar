import { test, expect } from '@playwright/test';
import { openApp, tab, SIZES, setStyle } from './helpers.js';

const info = (page) => page.locator('.allbtn').evaluate((b) => {
  const s = b.querySelector('span'), cb = getComputedStyle(b), cs = getComputedStyle(s), r = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
  return { bBg: cb.backgroundColor, bBorder: cb.borderTopWidth, w: r.width, h: r.height, sw: sr.width, sh: sr.height, bg: cs.backgroundColor, bw: cs.borderTopWidth, bc: cs.borderTopColor, color: cs.color };
});

for (const [name, size] of [['閉じた', SIZES.closedPortrait], ['開いた縦', SIZES.openPortrait], ['見開き', SIZES.openLandscape]]) {
  test(`「全」ボタンの見た目（${name}）: 通常は紙色の地に枠と文字、全部表示のときだけ緑。押せる範囲は 44×44 で透明`, async ({ page }) => {
    await openApp(page, size);
    await tab(page, '月').click();
    let i = await info(page);
    expect(i.bBg).toBe('rgba(0, 0, 0, 0)');
    expect([i.w, i.h, i.sw, i.sh]).toEqual([44, 44, 28, 28]);
    expect(i.bg).toBe('rgb(247, 244, 237)');
    expect(parseFloat(i.bw)).toBeGreaterThanOrEqual(1); // CSS は 1.5px。Chromium は計算値を 1px に丸めるため下限だけ見る
    expect(i.bc).toBe('rgb(41, 59, 53)');
    expect(i.color).toBe('rgb(41, 59, 53)');
    await page.locator('.allbtn').click();
    await expect(page.locator('.allbtn')).toHaveAttribute('aria-pressed', 'true');
    i = await info(page);
    expect(i.bBg).toBe('rgba(0, 0, 0, 0)'); // 後ろの 44×44 の四角が出ない
    expect([i.w, i.h, i.sw, i.sh]).toEqual([44, 44, 28, 28]);
    expect(i.bg).toBe('rgb(41, 78, 66)');
    expect(i.color).toBe('rgb(255, 255, 255)');
  });
}
