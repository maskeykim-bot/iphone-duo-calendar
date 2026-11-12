import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, fillEditor, tab, pickDay, SIZES } from './helpers.js';

test.describe('予定の追加・編集・削除', () => {
  test('初期は空で、サンプルを入れられる', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText('予定はまだありません')).toBeVisible();
    await loadSample(page);
    await expect(page.locator('.next')).toContainText('プロジェクト定例');
    await expect(page.locator('.remaining .event')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'サンプルを入れる' })).toHaveCount(0);
  });

  test('追加 → 編集 → 削除（確認あり）', async ({ page }) => {
    await openApp(page);
    await addEvent(page, { title: '歯医者', cat: 'private', place: '駅前' });
    await expect(page.getByRole('status')).toHaveText('予定を保存しました。');
    await expect(page.locator('.next')).toContainText('歯医者');

    await page.locator('.next').click();
    await expect(page.getByRole('heading', { name: '予定を編集' })).toBeVisible();
    await expect(page.locator('#f-title')).toHaveValue('歯医者');
    await fillEditor(page, { title: '歯医者（定期）', cat: 'work' });
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.locator('.next')).toContainText('歯医者（定期）');
    await expect(page.locator('.next')).toContainText('仕事');

    await page.locator('.next').click();
    await page.getByRole('button', { name: '予定を削除' }).click();
    await expect(page.getByRole('heading', { name: 'この予定を削除しますか？' })).toBeVisible();
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.locator('#editor')).toBeVisible();
    await page.getByRole('button', { name: '予定を削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('.next')).not.toContainText('歯医者');
  });

  test('検証: 予定名・書式・存在しない日付・終了が開始より前', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '予定を追加' }).click();
    const save = () => page.locator('#editor').getByRole('button', { name: '保存' }).click();
    const err = page.locator('#error');
    await save();
    await expect(err).toContainText('予定名を入力');
    await fillEditor(page, { title: 'x', start: '2026-11-12 10:00' });
    await save();
    await expect(err).toContainText('形式');
    await fillEditor(page, { start: '2026/02/30 10:00', end: '2026/02/28 11:00' });
    await save();
    await expect(err).toContainText('形式');
    await fillEditor(page, { start: '2026/11/12 25:00', end: '2026/11/12 26:00' });
    await save();
    await expect(err).toContainText('形式');
    await fillEditor(page, { start: '2026/11/12 12:00', end: '2026/11/12 11:00' });
    await save();
    await expect(err).toContainText('終了は開始以降');
    await expect(page.locator('#editor')).toBeVisible();
    await fillEditor(page, { start: '2026/11/12 12:00', end: '2026/11/12 12:00' });
    await save();
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('終日と複数日: 日付形式に切替わり、各日に表示される', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await fillEditor(page, { title: '社員旅行', all: true });
    await expect(page.locator('#f-start')).toHaveValue('2026/11/12');
    await fillEditor(page, { end: '2026/11/14' });
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    for (const d of ['12', '13', '14']) {
      await pickDay(page, `2026-11-${d}`);
      await expect(page.locator('.agenda .event')).toContainText('社員旅行');
      await expect(page.locator('.agenda .event .clock')).toHaveText('終日');
    }
    await pickDay(page, '2026-11-15');
    await expect(page.locator('.agenda .event')).toHaveCount(0);
  });

  test('Esc でシートを閉じ、変更は反映されない', async ({ page }) => {
    await openApp(page);
    await addEvent(page, { title: '元の名前' });
    await page.locator('.next').click();
    await fillEditor(page, { title: '破棄する名前' });
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('.next')).toContainText('元の名前');
  });

  test('今日に戻る: 日付・view・ホームをリセット', async ({ page }) => {
    await openApp(page);
    await tab(page, '週').click();
    await page.getByRole('button', { name: '次の週' }).click();
    await tab(page, '日').click();
    await page.getByRole('button', { name: '今日に戻る' }).click();
    await expect(page.locator('.shell.home')).toBeVisible();
    await tab(page, '月').click();
    await expect(page.locator('h2#ctitle')).toHaveText('2026年 11月');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
  });
});
