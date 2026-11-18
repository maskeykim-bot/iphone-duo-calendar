import { test, expect } from '@playwright/test';
import { openApp, tab, setStyle, SIZES } from './helpers.js';

// 第14版 PR7 の開いた縦の下パネル（月の下に 時間｜タスク｜メモ）は、第19版 PR6（design/22 §5）で月タブの中身が「月を引く画面」に変わり、
// 月タブでは出し入れのボタン（cpnl）を置かない（下の面はいつも日）。保存値 pages.portraitShown / portraitBottom は消さない。
// 下パネルの寸法・つまみ・回転などの旧検査は、パネルが月タブから出なくなったため古くなり、ここでは「出ない」「保存値が残る」「全部のときは従来どおり使える」に置き換えた。
const PORTRAITS = [SIZES.openPortrait, SIZES.openPortrait669];
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));

for (const size of PORTRAITS) {
  test.describe(`下パネル ${size.width}×${size.height}`, () => {
    test('月タブ（月を引く画面）には下の段のボタンもパネルも出ない。下の面は日', async ({ page }) => {
      await openApp(page, size);
      await expect(page.locator('.pnl')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /下の段を(表示|隠す)/ })).toHaveCount(0);
      await expect(page.locator('.pgrab')).toHaveCount(0);
      const day = await page.locator('.mday').boundingBox();
      expect(day.y).toBeGreaterThanOrEqual(492 - 1); // 溝（467〜484）＋下 8 の下
    });

    test('保存した下パネルの設定（表示・種類）は月タブでも他のタブでも消えない', async ({ page }) => {
      await page.addInitScript(() => { if (!localStorage.getItem('duo.ui.v1')) localStorage.setItem('duo.ui.v1', JSON.stringify({ view: 'month', home: false, pages: { left: 'month', right: 'time', portraitBottom: 'memo', portraitShown: true } })); });
      await openApp(page, size);
      await expect(page.locator('.pnl')).toHaveCount(0);
      await tab(page, '週').click();
      await tab(page, '月').click();
      await expect(page.locator('.mpull')).toBeVisible();
      expect((await ui(page)).pages).toMatchObject({ portraitShown: true, portraitBottom: 'memo' });
    });

    test('「全部」の月は従来の月のまま。下の段のボタンから下パネルが出る', async ({ page }) => {
      await openApp(page, size);
      await setStyle(page, '全部');
      await expect(page.locator('.mpull')).toHaveCount(0);
      await page.getByRole('button', { name: '下の段を表示' }).click();
      await expect(page.locator('.pnl')).toBeVisible();
      expect((await ui(page)).pages.portraitShown).toBe(true);
    });
  });
}
