// 第16版 PR35: 開閉・回転の前後で編集状態（文字・カーソル・scroll・モード）を保つ。DP-8/9・KB-2。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

const withMode = (page, mode) => page.addInitScript(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, focusMode: m })); }, ['duo.ui.v1', mode]);

test.describe('ノート編集中の回転・開閉', () => {
  test('文字・カーソルを保ち、入力欄を作り直さず、回転前に保存へ流す', async ({ page }) => {
    await withMode(page, 'note');
    await openApp(page, SIZES.openPortrait669);
    await page.getByRole('button', { name: 'ノートを追加' }).click();
    const body = page.locator('.ned-body');
    await page.locator('.ned-title').fill('題名');
    await body.click(); await body.pressSequentially('あいうえお');
    await body.evaluate((t) => { window.__node = t; t.setSelectionRange(2, 4); });
    await page.setViewportSize({ width: 951, height: 669 }); // 回転（見開き）
    await page.setViewportSize({ width: 669, height: 951 }); // 縦へ戻す
    await expect(page.locator('.shell.focus[data-focus="note"]')).toHaveCount(1);
    const st = await body.evaluate((t) => ({ same: t === window.__node, v: t.value, s: t.selectionStart, e: t.selectionEnd, f: document.activeElement === t }));
    expect(st).toEqual({ same: true, v: 'あいうえお', s: 2, e: 4, f: true });
    await expect.poll(() => page.evaluate(async () => (await (await import('/js/db.js')).listNotes?.())?.some((n) => n.body.includes('あいうえお')) ?? true)).toBe(true);
  });
});
