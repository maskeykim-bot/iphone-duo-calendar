import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, tab, setStyle, SIZES } from './helpers.js';

// 計算後スタイル: 予定名チップ・帯・短冊は 12px / 行高 16px、+N は 11px（レビュー eea54b3 の L1）。
async function crowdDay(page) {
  // 複数日の帯を 3 本重ねる（レーン上限 2 を超え +N が出る）
  for (let i = 0; i < 3; i++) {
    await addEvent(page, { title: `連日検査${i}`, start: '2026/11/11 09:00', end: '2026/11/13 18:00' });
  }
  for (let i = 0; i < 6; i++) {
    await addEvent(page, { title: `チップ検査${i}`, start: `2026/11/12 ${String(9 + i).padStart(2, '0')}:00`, end: `2026/11/12 ${String(9 + i).padStart(2, '0')}:30` });
  }
}
const styles = (loc) => loc.first().evaluate((el) => {
  const s = getComputedStyle(el);
  return { fs: s.fontSize, lh: s.lineHeight, h: el.getBoundingClientRect().height };
});

for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ['開いた横', SIZES.openLandscape], ['開いた縦', SIZES.openPortrait]]) {
  test(`${name}: チップ・帯は 12px/16px、+N は 11px`, async ({ page }) => {
    await openApp(page, size);
    await loadSample(page);
    await crowdDay(page);
    if (size === SIZES.closedPortrait) { await tab(page, '月').click(); }
    await setStyle(page, '予定名');
    const cal = page.locator('.calendar');
    const chip = cal.locator('.chip, .strip');
    await expect(chip.first()).toBeVisible();
    for (const loc of [cal.locator('.chip'), cal.locator('.bar, .strip')]) {
      if (await loc.count() === 0) continue;
      const s = await styles(loc);
      expect(s.fs).toBe('12px');
      expect(s.h).toBeCloseTo(16, 0);
      if (s.lh !== 'normal') expect(s.lh).toBe('16px');
    }
    if (size !== SIZES.openPortrait) {
      const more = cal.locator('.more');
      await expect(more.first()).toBeAttached();
      const m = await styles(more);
      expect(m.fs).toBe('12px');
      expect(m.h).toBeCloseTo(16, 0);
    }
    const plus = cal.locator('.plus');
    await expect(plus.first()).toBeAttached();
    expect((await styles(plus)).fs).toBe('11px');
    // +N は日付行の右端（日付 .num より右）
    const p = await plus.first().boundingBox();
    const day = await plus.first().evaluate((el) => el.closest('.day').getBoundingClientRect().toJSON());
    const num = await plus.first().evaluate((el) => el.closest('.day').querySelector('.num').getBoundingClientRect().toJSON());
    expect(p.x).toBeGreaterThanOrEqual(num.x + num.width - 1);
    expect(p.x + p.width).toBeLessThanOrEqual(day.x + day.width + 1);
    expect(p.y).toBeLessThan(day.y + 24);
  });
}

test('今日に戻る直後: 閉じたホームの日・週・月はどれも選択状態でない', async ({ page }) => {
  await openApp(page);
  await tab(page, '週').click();
  await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '次の週' }).click();
  await tab(page, '日').click();
  await page.getByRole('button', { name: '今日に戻る' }).click();
  await expect(page.locator('.shell.home')).toBeVisible();
  for (const t of ['日', '週', '月']) await expect(tab(page, t)).toHaveAttribute('aria-pressed', 'false');
});
