// 第19.5版（征希さん「直感的に操作できるよう変更したい」「今日に戻るボタンもよろしく」）: 閉じた縦の右の列と「月を固定」（実装担当）。
// 位置と大きさは tests/closed-tabs.spec.js（S11c）・tests/band-layout.spec.js。ここは動き。
import { test, expect } from '@playwright/test';
import { boot, DAY, SEC, ui, scTop, setScroll, rect, near } from './v193-p2-lib.js';

const rail = (page, name) => page.locator('.ctl.crl').getByRole('button', { name, exact: true });

test('R-1 ホーム: 押すとホーム（押した印つき）、もう一度でカレンダーに戻る。タスク・ノートも右の列から開く', async ({ page }) => {
  await boot(page);
  await rail(page, 'ホーム').click();
  await expect(page.locator('.shell.closed.home')).toHaveCount(1); await expect(rail(page, 'ホーム')).toHaveAttribute('aria-pressed', 'true');
  await rail(page, 'ホーム').click();
  await expect(page.locator('.shell.closed.home')).toHaveCount(0); await expect(page.locator(SEC)).toHaveCount(1);
  await rail(page, 'ノート').click(); await expect(rail(page, 'ノート')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.ctl.crl .ctask').click(); await expect(page.locator('.ctl.crl .ctask')).toHaveAttribute('aria-pressed', 'true'); await expect(rail(page, 'ノート')).toHaveAttribute('aria-pressed', 'false');
});

test('R-2 今日に戻る: 別の日を選んでいても、押すと今日（11/12）が選ばれる。検索は検索の画面を開く', async ({ page }) => {
  await boot(page, { sel: '2026-11-20' });
  await expect(page.locator('.mdh .hdt')).toHaveText('11月20日');
  await rail(page, '今日に戻る').click();
  await expect(page.locator('.mdh .hdt')).toHaveText('11月12日'); expect((await ui(page)).selected).toBe(DAY);
  await rail(page, '予定を検索').click(); await expect(page.locator('#search')).toBeVisible();
});

test('R-3 月を固定: 既定は固定（保存が無い端末）。固定中は下へ送っても月の格子とつまみは動かず、日の欄だけが送られる。解除すると月ごと送れる。読み込み直しても同じ', async ({ page }) => {
  await boot(page, { stage: 4, ui: { monthPin: true } });
  const pin = rail(page, '月を固定');
  await expect(pin).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator(`${SEC}.pin`)).toHaveCount(1);
  const g0 = await rect(page, '.mgwrap'), b0 = await rect(page, '.mgrab'), h0 = await rect(page, '.mday .mdh');
  await setScroll(page, 150);
  expect(await scTop(page)).toBe(150);
  const g1 = await rect(page, '.mgwrap'), b1 = await rect(page, '.mgrab'), h1 = await rect(page, '.mday .mdh');
  expect(near(g1.y, g0.y) && near(b1.y, b0.y)).toBe(true); expect(near(h1.y, h0.y - 150)).toBe(true);
  // 送られた日の欄は、月とつまみの下に隠れる（上に重ならない）
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.mgwrap'), [100, g0.y + 40])).toBe(true);
  await setScroll(page, 0);
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'false'); expect((await ui(page)).monthPin).toBe(false); await expect(page.locator(`${SEC}.pin`)).toHaveCount(0);
  await setScroll(page, 150);
  expect(near((await rect(page, '.mgwrap')).y, g0.y - 150)).toBe(true);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  await expect(rail(page, '月を固定')).toHaveAttribute('aria-pressed', 'false');
  await rail(page, '月を固定').click(); expect((await ui(page)).monthPin).toBe(true);
});

test('R-4 帯がない画面・閉じた横は今までの形（右の列のまとまりは出さない）', async ({ page }) => {
  await boot(page, { sar: 0 });
  await expect(page.locator('.ctl.crl')).toHaveCount(0); await expect(page.locator('.railg')).toHaveCount(0);
  await expect(page.locator('.ctl .ctask')).toHaveCount(1); await expect(page.locator('.ctl .cmore')).toHaveCount(1);
});

test('R-5 ホームの「これからの 7 日間」: 明日から 7 行。予定は 3 件まで＋「ほか N 件」、予定のない日は「予定なし」。行をたたくと、その日を選んでカレンダーへ', async ({ page }) => {
  const { ev, seed } = await import('./helpers.js');
  await boot(page);
  await seed(page, [1, 2, 3, 4, 5].map((i) => ev(`w${i}`, `用事${i}`, `2026-11-14T1${i}:00`, `2026-11-14T1${i}:30`)));
  await rail(page, 'ホーム').click();
  const rows = page.locator('.hweek .hwrow');
  await expect(rows).toHaveCount(7);
  expect(await rows.evaluateAll((es) => es.map((e) => e.dataset.day))).toEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  await expect(rows.nth(1).locator('.hwe')).toHaveCount(3); await expect(rows.nth(1).locator('.hwm')).toHaveText('ほか2件');
  await expect(rows.nth(1).locator('.hwe').first()).toContainText('11:00'); await expect(rows.nth(1).locator('.hwe').first()).toContainText('用事1');
  await expect(rows.nth(0).locator('.hwn')).toHaveText('予定なし');
  await expect(page.locator('.home .htmr')).toHaveCount(0); // 閉じた画面は「明日」の札の代わりに 7 日間
  const sc = page.locator('.home.listview'); expect(await sc.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true); // 下へ送って読める
  await rows.nth(1).click();
  await expect(page.locator('.shell.closed.home')).toHaveCount(0); await expect(page.locator('.mdh .hdt')).toHaveText('11月14日'); expect((await ui(page)).selected).toBe('2026-11-14');
});
