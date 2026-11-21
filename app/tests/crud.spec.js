import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, fillEditor, tab, pickDay, SIZES, fillDateTime, monthFormInit, expectShown } from './helpers.js';

test.describe('予定の追加・編集・削除', () => {
  test('初期は空で、サンプルを入れられる', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText('予定はまだありません')).toBeVisible();
    await loadSample(page);
    await expect(page.locator('.next')).toContainText('プロジェクト定例');
    await expect(page.locator('.hevents .hrow')).toHaveCount(3); // 残りは最大3件＋ほか（第16版 PR14）
    await expect(page.locator('.hmore')).toHaveText('ほか1件');
    await expect(page.getByRole('button', { name: 'サンプルを入れる' })).toHaveCount(0);
  });

  test('開始を変えると長さを保って終了も動く。終日の ON/OFF で時刻に戻る', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-act="add"]:visible').first().click();
    const dlg = page.locator('#editor');
    await fillDateTime(page, 'start', '2026/11/12 10:00');
    await fillDateTime(page, 'end', '2026/11/12 11:45');
    await fillDateTime(page, 'start', '2026/11/12 14:00');
    await expect(dlg.locator('#f-etime')).toContainText('15:45');
    await dlg.locator('#f-all').setChecked(true);
    await expect(dlg.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
    await expect(dlg.locator('#f-stime')).toBeHidden();
    await dlg.locator('#f-all').setChecked(false);
    await expect(dlg.locator('#f-stime')).toContainText('14:00');
    await expect(dlg.locator('#f-etime')).toContainText('15:45');
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
    // 日付と時刻は選ぶだけなので、書式の誤りや存在しない日付は作れない（PR17）。終了を開始より前の日にはできない。
    await fillEditor(page, { title: 'x', start: '2026/11/12 12:00' });
    await page.locator('#f-end').click();
    await expect(page.locator('#dp-grid [data-day="2026-11-11"]')).toBeDisabled();
    await page.locator('#f-title').click();
    await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/12');
    await fillEditor(page, { start: '2026/11/12 12:00', end: '2026/11/12 12:00' });
    await save();
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('終日と複数日: 日付形式に切替わり、各日に表示される', async ({ page }) => {
    // 月を引く画面の日の部分は「予定」（.mdlist）で見る（helpers の openApp は既定で時間軸にするため）
    await monthFormInit(page);
    await openApp(page, SIZES.openPortrait);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await fillEditor(page, { title: '社員旅行', all: true });
    await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
    await fillEditor(page, { end: '2026/11/14' });
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    // 第19版 PR6: 開いた縦の月は日セルを押すと下の面（日の部分）がその日になる
    for (const d of ['12', '13', '14']) {
      await pickDay(page, `2026-11-${d}`);
      await expect(page.locator('.mdlist .mdev')).toContainText('社員旅行');
      await expect(page.locator('.mdlist .mdev .mdt')).toHaveText('終日');
    }
    await pickDay(page, '2026-11-15');
    await expect(page.locator('.mdlist .mdev')).toHaveCount(0);
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

  test('今日へ（閉じた画面は見出し。design/34 §2.1・§9.1-3・8・§12 Q-11）: 選択日だけ今日へ。表示（カレンダー）と段は保つ', async ({ page }) => {
    // 旧: 右の列／下段の「今日に戻る」を日・週・月で押す。34 で「今日に戻る」のボタンは消え、見出し「2026年11月」をたたく（今日が画面にないときだけ右に「今日へ」）に置き換わった
    await openApp(page);
    await tab(page, '週').click();
    await page.getByRole('button', { name: '次の週' }).click({ force: true }); // 閉じた画面の ‹ › は見えない 2×2（34 §9.1-1）
    await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日'); // 閉じた週の横すべり（0.25秒）が終わってから先へ進む
    await expect(page.getByRole('button', { name: '今日に戻る' })).toHaveCount(0);
    await tab(page, '月').click(); // ‹ カレンダー
    const stage = await page.locator('.mpull.browse').getAttribute('data-stage');
    await expect(page.locator('[data-date="2026-11-19"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '今日へ' })).toHaveCount(0); // 今日が画面にある間は出ない
    await page.locator('#ctitle').click(); // 見出しをたたく
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.shell.browse.cal')).toBeVisible(); // ホームへは飛ばない
    await page.locator('.mph [data-act="next"]').click({ force: true }); // 12月へ
    await expect(page.locator('h2#ctitle')).toHaveText('2026年12月');
    await page.getByRole('button', { name: '今日へ' }).click();
    await expect(page.locator('h2#ctitle')).toHaveText('2026年11月');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mpull.browse')).toHaveAttribute('data-stage', stage); // 段は変えない
    await expect(page.getByRole('button', { name: '今日へ' })).toHaveCount(0);
  });

});
