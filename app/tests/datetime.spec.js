// 第15版 PR16: 時刻のカプセルと時分のマス・長さのチップ・翌日の札
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, dbEvents, fillDateTime, setTimeUi, SIZES, OPEN_SIZES } from './helpers.js';

const dlg = (page) => page.locator('#editor');
const openNew = async (page) => { await page.locator('[data-act="add"]:visible').first().click(); await expect(dlg(page)).toBeVisible(); };
const save = async (page) => { await page.locator('#form [type=submit]').click(); await expect(dlg(page)).toBeHidden(); };

test.describe('時刻カプセルと時分のマス', () => {
  test('構成: 時24個・分12個（5分刻み）・長さ5種。7〜21時が強調。開くのは一度に一つ', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await expect(dlg(page).locator('#f-stime')).toHaveText('10:00');
    await expect(dlg(page).locator('#f-etime')).toHaveText('11:00');
    await expect(dlg(page).locator('#f-dur .dchip')).toHaveText(['30分', '1時間', '1.5時間', '2時間', '3時間']);
    await expect(dlg(page).locator('#f-dur .dchip[aria-pressed=true]')).toHaveText('1時間');
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#tp-h .tcell')).toHaveCount(24);
    await expect(dlg(page).locator('#tp-m .tcell')).toHaveCount(12);
    await expect(dlg(page).locator('#tp-h .usual')).toHaveCount(15);
    await expect(dlg(page).locator('#f-stime')).toHaveClass(/open/);
    // 別のカプセルへ切り替え。部品は終了の行の下へ
    await dlg(page).locator('#f-etime').click();
    await expect(dlg(page).locator('#f-stime')).not.toHaveClass(/open/);
    await expect(dlg(page).locator('#f-etime')).toHaveClass(/open/);
    await expect(dlg(page).locator('#tpop')).toHaveCount(1);
    // 再タップで閉じる
    await dlg(page).locator('#f-etime').click();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    // 他の欄に触れると閉じる
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#f-title').click();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
  });

  test('時→分で決まって閉じる。時だけなら分はそのまま。開閉だけでは未保存の変更にならない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#f-title').fill('a');
    await dlg(page).locator('#f-title').fill('');
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#tp-h [data-h="9"]').click();
    await expect(dlg(page).locator('#tpop')).toBeVisible();
    await expect(dlg(page).locator('#f-stime')).toHaveText('09:00');
    await expect(dlg(page).locator('#f-etime')).toHaveText('10:00');
    await dlg(page).locator('#tp-m [data-m="30"]').click();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await expect(dlg(page).locator('#f-stime')).toHaveText('09:30');
    await expect(dlg(page).locator('#f-etime')).toHaveText('10:30');
  });

  test('開いて閉じただけなら閉じる確認が出ない（dirty にならない）', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '会議', '2026-11-12T10:07', '2026-11-12T11:07')]);
    await page.locator('.next').click();
    await expect(page.locator('#f-title')).toHaveValue('会議');
    await page.locator('#f-stime').click();
    await page.locator('#f-etime').click();
    await page.locator('#f-etime').click();
    await page.locator('#close').click();
    await expect(dlg(page)).toBeHidden();
    await expect(page.locator('#discard')).toBeHidden();
  });

  test('07分: どの分も選ばず「いま 07分」。時だけ変えても 07分。保存で丸めない', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '会議', '2026-11-12T10:07', '2026-11-12T11:43')]);
    await page.locator('.next').click();
    await expect(page.locator('#f-stime')).toHaveText('10:07');
    await page.locator('#f-stime').click();
    await expect(page.locator('#tp-note')).toHaveText('いま 07分');
    await expect(page.locator('#tp-m [aria-pressed=true]')).toHaveCount(0);
    await page.locator('#tp-h [data-h="9"]').click();
    await expect(page.locator('#f-stime')).toHaveText('09:07');
    await expect(page.locator('#f-etime')).toHaveText('10:43');
    await expect(page.locator('#tp-note')).toHaveText('いま 07分');
    await save(page);
    const [e] = await dbEvents(page);
    expect([e.start, e.end]).toEqual(['2026-11-12T09:07', '2026-11-12T10:43']);
  });

  test('23時台＋2時間は翌日の札と終了日の更新で保存できる。+2日は実日数', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-title').fill('夜');
    await setTimeUi(page, 'start', '23:00');
    await expect(dlg(page).locator('#f-eday')).toHaveText('翌日'); // 23:00〜翌0:00
    await dlg(page).locator('#f-dur [data-min="120"]').click();
    await expect(dlg(page).locator('#f-end')).toHaveValue('2026/11/13');
    await expect(dlg(page).locator('#f-etime')).toContainText('01:00');
    await expect(dlg(page).locator('#f-eday')).toHaveText('翌日');
    await expect(dlg(page).locator('#f-dur .dchip[aria-pressed=true]')).toHaveText('2時間');
    await save(page);
    const [e] = await dbEvents(page);
    expect([e.start, e.end]).toEqual(['2026-11-12T23:00', '2026-11-13T01:00']);
  });

  test('終了を開始より前の時刻にすると終了の日が進む。2日先は +2日', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await setTimeUi(page, 'start', '14:00');
    await setTimeUi(page, 'end', '09:00');
    await expect(dlg(page).locator('#f-end')).toHaveValue('2026/11/13');
    await expect(dlg(page).locator('#f-eday')).toHaveText('翌日');
    await dlg(page).locator('#f-end').fill('2026/11/14');
    await expect(dlg(page).locator('#f-eday')).toHaveText('+2日');
  });

  test('終日 ON は時刻と長さを隠し、OFF で元の時刻に戻る', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await setTimeUi(page, 'start', '14:30');
    await dlg(page).locator('#f-all').setChecked(true);
    await expect(dlg(page).locator('#f-stime')).toBeHidden();
    await expect(dlg(page).locator('#f-etime')).toBeHidden();
    await expect(dlg(page).locator('#row-d')).toBeHidden();
    await dlg(page).locator('#f-all').setChecked(false);
    await expect(dlg(page).locator('#f-stime')).toHaveText('14:30');
    await expect(dlg(page).locator('#f-etime')).toHaveText('15:30');
  });

  for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ...OPEN_SIZES.map((s, i) => [`開いた${i}`, s])]) {
    test(`部品がシートの幅に収まる（${name}）`, async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      await dlg(page).locator('#f-etime').click();
      const r = await page.evaluate(() => {
        const d = document.querySelector('#editor').getBoundingClientRect();
        return [...document.querySelectorAll('#dtbox button, #dtbox input')].filter((e) => e.offsetParent).map((e) => { const b = e.getBoundingClientRect(); return b.left >= d.left - 0.5 && b.right <= d.right + 0.5; });
      });
      expect(r.length).toBeGreaterThan(30);
      expect(r.every(Boolean)).toBe(true);
    });
  }
});
