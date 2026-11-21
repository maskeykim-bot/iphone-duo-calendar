// 第19.1版 S6: 反応しないボタン 0（元に戻す/やり直しは aria-disabled）、押した色の取り違え、小さな確認シート・全画面ページの動き（25 §1）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, clickSettings, tab } from './helpers.js';

const POSTS = [['閉じた', SIZES.closedPortrait], ['開いた縦', SIZES.openPortrait669], ['開いた横', SIZES.openLandscape951]];
const anims = (page) => page.evaluate(() => document.getAnimations().map((a) => `${a.animationName}:${a.effect.getTiming().duration}`));

test.describe('ノートの元に戻す/やり直し: disabled でなく aria-disabled', () => {
  test('押せないとき薄く見せ、押すと地が #EFECE4 に変わるが何も起きない。押せるときは普通に動く', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await page.evaluate(async () => (await import('/js/db.js')).putNote({ id: 'n1', body: '11月12日（木）\n一行目', createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date: '2026-11-12', deletedAt: null }));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, selected: '2026-11-12', spreadType: 'tt' })); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('.dpage.lp .dnote').click();
    const undo = page.getByRole('button', { name: '元に戻す' }), redo = page.getByRole('button', { name: 'やり直す' });
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    expect(await undo.evaluate((e) => e.disabled)).toBe(false); // disabled にしない（押した瞬間の反応を出す）
    await expect(redo).toHaveAttribute('aria-disabled', 'true');
    // 押せないとき: 文字色は薄く、押している間は地（::before）が出る
    expect(await undo.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(201, 197, 186)');
    await expect.poll(async () => (await undo.boundingBox()).y).toBeLessThan(200); // シートが出きるまで（0.25秒の動き）
    await expect.poll(async () => { const a = (await undo.boundingBox()).y; await page.waitForTimeout(60); return a === (await undo.boundingBox()).y; }).toBe(true);
    const b = await undo.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await expect.poll(() => undo.evaluate((e) => getComputedStyle(e, '::before').opacity)).toBe('1');
    expect(await undo.evaluate((e) => getComputedStyle(e, '::before').backgroundColor)).toBe('rgb(239, 236, 228)');
    await page.mouse.up();
    await expect(undo).toHaveAttribute('aria-disabled', 'true'); // 何も起きない
    // 書くと押せる
    await page.locator('.nsheet .ned-body').click(); await page.keyboard.press('Control+End'); await page.keyboard.type('追加');
    await expect(undo).toHaveAttribute('aria-disabled', 'false');
    await undo.click();
    await expect(redo).toHaveAttribute('aria-disabled', 'false');
  });
});

test.describe('押した色の取り違えがない', () => {
  test('選んでいる日のマスを押しても、地は濃い緑でなく #EFECE4。+N の上を押してもマスが押される（V-03: +N は押す的でない）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [1, 2, 3, 4, 5, 6].map((i) => ev(`p${i}`, `予定${i}`, '2026-11-12T1' + i + ':00', '2026-11-12T1' + i + ':30')));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    const day = page.locator('.week .day.selected').first();
    const plus = page.locator('.week .plus:visible').first(); // 閉じた7段の +N は 0 件のとき hidden
    const pb = await plus.boundingBox();
    // +N の押せる範囲（日付の行の右 44×44）の外で日マスの右下を押す
    const d = await day.boundingBox();
    await page.mouse.move(d.x + 4, d.y + d.height - 4); await page.mouse.down();
    await expect.poll(() => day.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(226, 221, 210)'); // 第19.2版 S11b（R-75）: 閉じた7段の押した地は #E2DDD2
    await page.mouse.up();
    await page.mouse.move(pb.x + pb.width - 6, pb.y + 8); await page.mouse.down();
    // V-03: +N は pointer-events:none。+N の所を押すと押されるのはマス（地 #EFECE4）で、+N 自体は変わらない
    await expect.poll(() => day.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(226, 221, 210)');
    expect(await plus.evaluate((e) => [getComputedStyle(e).opacity, getComputedStyle(e).backgroundColor])).toEqual(['1', 'rgba(0, 0, 0, 0)']);
    await page.mouse.up();
  });
});

for (const [name, size] of POSTS) {
  test.describe(`小さな確認シートと全画面ページの動き: ${name}`, () => {
    test('バックアップ（全画面ページ）: 出る 0.25 秒 sheetin、閉じるは同じ秒数で逆、終わってから閉じる', async ({ page }) => {
      await openApp(page, size, '', { motion: true });
      await clickSettings(page);
      await expect(page.locator('#menu')).toBeVisible();
      await page.getByRole('button', { name: 'バックアップ' }).click();
      await expect(page.locator('#backup')).toBeVisible();
      expect(await anims(page)).toContain('sheetin:250');
      // 設計 V-14（対象は閉じた・開いた縦）: シート＋後ろの暗い膜（dimin）が同じ曲線。開いた横は折り目の保護域があるので膜をかけず、シートの動き 1 つだけ（S7e で確かめた。S7c はここを全姿勢 2 つにしていて横で落ちた）
      const one = 'cubic-bezier(0.16, 1, 0.3, 1)';
      expect(await page.locator('#backup').evaluate((e) => getComputedStyle(e).animationTimingFunction)).toBe(await page.evaluate(() => document.body.dataset.layout) === 'spread' ? one : `${one}, ${one}`);
      await page.waitForTimeout(300);
      await page.locator('#bk-close').click();
      await expect(page.locator('#backup')).toHaveClass(/sheet-out/);
      expect(await anims(page)).toContain('sheetout:250');
      expect(await page.locator('#backup').evaluate((e) => e.open)).toBe(true); // 動いている間は開いたまま
      await expect(page.locator('#backup')).toBeHidden();
    });
  });
}

test.describe('小さな確認シート', () => {
  test('削除の確認: 出る sheetin 250、閉じる sheet-out、閉じる最中に開き直したら閉じずに開き直す。reduced motion は 0.15 秒のフェード', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { motion: true });
    await seed(page, [ev('c1', '確認の予定', '2026-11-12T10:00', '2026-11-12T11:00')]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '日').click();
    await page.locator('button[data-event="c1"]:visible').first().click();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#delete').click();
    await expect(page.locator('#confirm')).toBeVisible();
    expect(await page.locator('#confirm').evaluate((e) => [getComputedStyle(e).animationName, getComputedStyle(e).animationDuration])).toEqual(['sheetin, dimin', '0.25s, 0.25s']); // 設計 V-14: 膜も同じ 0.25 秒
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await expect(page.locator('#confirm')).toHaveClass(/sheet-out/);
    await expect(page.locator('#confirm')).toBeHidden();
    // reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#delete').click();
    await expect(page.locator('#confirm')).toBeVisible();
    expect(await page.locator('#confirm').evaluate((e) => [getComputedStyle(e).animationName, getComputedStyle(e).animationDuration])).toEqual(['sheetfadein', '0.15s']);
  });

  test('設定の「選んで閉じる」（週の始まり）も同じ寄せで閉じる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { motion: true });
    await clickSettings(page);
    await page.locator('#menu [data-go="general"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^週の始まり/ }).click();
    await expect(page.locator('#menu')).toHaveClass(/sheet-out/);
    await expect(page.locator('#menu')).toBeHidden();
  });
});
