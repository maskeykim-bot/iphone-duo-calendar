// 第15版 PR16: 時刻のカプセルと時分のマス・長さのチップ・翌日の札
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, dbEvents, fillDateTime, setTimeUi, setDateUi, openMenu, SIZES, OPEN_SIZES } from './helpers.js';

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
    await expect(dlg(page).locator('#f-end')).toHaveJSProperty('value', '2026/11/13');
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
    await expect(dlg(page).locator('#f-end')).toHaveJSProperty('value', '2026/11/13');
    await expect(dlg(page).locator('#f-eday')).toHaveText('翌日');
    await setDateUi(page, 'end', '2026/11/14');
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

  // ---- 第15版 PR17: 日付のカプセルと小さな月 ----
  test('日付カプセル: 「11月12日（木）」、今年でない日だけ年を付ける。開閉だけでは変えない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await expect(dlg(page).locator('#f-start')).toHaveText('11月12日（木）');
    await expect(dlg(page).locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
    await setDateUi(page, 'start', '2027/01/05');
    await expect(dlg(page).locator('#f-start')).toHaveText('2027年1月5日（火）');
    await expect(dlg(page).locator('#f-end')).toHaveText('2027年1月5日（火）'); // 開始を動かすと終了の日も同じだけ動く
    const b = await dlg(page).locator('#f-start').boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(32);
    await dlg(page).locator('#f-start').click();
    await dlg(page).locator('#f-start').click();
    await dlg(page).locator('#f-etime').click();
    await dlg(page).locator('#f-etime').click();
    await expect(dlg(page).locator('#f-start')).toHaveJSProperty('value', '2027/01/05');
  });

  test('小さな月: 6行・週の始まり（月曜）・日曜の赤・選択日の丸と今日の輪・前後の月は薄い', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-start').click();
    await expect(dlg(page).locator('#dp-title')).toHaveText('2026年11月');
    await expect(dlg(page).locator('#dp-heads span')).toHaveText(['月', '火', '水', '木', '金', '土', '日']);
    await expect(dlg(page).locator('#dp-heads span.hol')).toHaveText(['日']);
    await expect(dlg(page).locator('#dp-grid .dcell')).toHaveCount(42); // 11月は5週でも6行
    await expect(dlg(page).locator('#dp-grid .dcell').first()).toHaveAttribute('data-day', '2026-10-26');
    await expect(dlg(page).locator('#dp-grid .sel')).toHaveAttribute('data-day', '2026-11-12');
    await expect(dlg(page).locator('#dp-grid .tod')).toHaveAttribute('data-day', '2026-11-12');
    const col = (d) => dlg(page).locator(`#dp-grid [data-day="${d}"]`).evaluate((e) => getComputedStyle(e).color);
    expect(await col('2026-11-15')).toBe('rgb(180, 60, 60)'); // 日曜
    expect(await col('2026-11-02')).toBe('rgb(41, 59, 53)');
    expect(await col('2026-10-31')).toBe('rgb(201, 198, 188)'); // 前の月
    const c = await dlg(page).locator('#dp-grid [data-day="2026-11-03"]').boundingBox();
    expect(c.height).toBeGreaterThanOrEqual(38);
    for (const id of ['#dp-prev', '#dp-next']) { const n = await dlg(page).locator(id).boundingBox(); expect(n.width).toBeGreaterThanOrEqual(44); expect(n.height).toBeGreaterThanOrEqual(44); }
  });

  test('日曜始まりの設定なら曜日の並びが変わる', async ({ page }) => {
    await openApp(page);
    await openMenu(page, 'general');
    await page.locator('#m-week').click();
    await expect(page.locator('#m-week')).toContainText('日曜');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    await openNew(page);
    await dlg(page).locator('#f-start').click();
    await expect(dlg(page).locator('#dp-heads span')).toHaveText(['日', '月', '火', '水', '木', '金', '土']);
    await expect(dlg(page).locator('#dp-grid .dcell').first()).toHaveAttribute('data-day', '2026-11-01');
  });

  test('チップ: 今日・明日・来週の同じ曜日。押すと決まって閉じる。明日14:30→長さ1時間が少ない操作で済む', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-start').click();
    await expect(dlg(page).locator('#dp-chips .dpchip')).toHaveText(['今日', '明日', '来週の木曜']);
    await dlg(page).locator('#dp-chips .dpchip', { hasText: '明日' }).click();
    await expect(dlg(page).locator('#dpop')).toBeHidden();
    await expect(dlg(page).locator('#f-start')).toHaveJSProperty('value', '2026/11/13');
    await expect(dlg(page).locator('#f-end')).toHaveJSProperty('value', '2026/11/13');
    await setTimeUi(page, 'start', '14:30');
    await dlg(page).locator('#f-dur [data-min="60"]').click();
    await dlg(page).locator('#f-title').fill('明日');
    await save(page);
    const [e] = await dbEvents(page);
    expect([e.start, e.end]).toEqual(['2026-11-13T14:30', '2026-11-13T15:30']);
    await openNew(page);
    await dlg(page).locator('#f-start').click();
    await dlg(page).locator('#dp-chips .dpchip', { hasText: '来週の木曜' }).click();
    await expect(dlg(page).locator('#f-start')).toHaveJSProperty('value', '2026/11/19');
  });

  test('日を選ぶと複数日の日数と時刻を保つ。終了の日だけ変えると日数が変わる', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '出張', '2026-11-12T09:15', '2026-11-14T17:40')]);
    await page.locator('.next').click();
    await setDateUi(page, 'start', '2026/11/20');
    await expect(dlg(page).locator('#f-end')).toHaveJSProperty('value', '2026/11/22');
    await expect(dlg(page).locator('#f-stime')).toHaveText('09:15');
    await expect(dlg(page).locator('#f-etime')).toContainText('17:40');
    await setDateUi(page, 'end', '2026/11/21');
    await expect(dlg(page).locator('#f-start')).toHaveJSProperty('value', '2026/11/20');
    await save(page);
    const [e] = await dbEvents(page);
    expect([e.start, e.end]).toEqual(['2026-11-20T09:15', '2026-11-21T17:40']);
  });

  test('終了日の部品では、開始より前の日は押せない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await setDateUi(page, 'start', '2026/11/15');
    await dlg(page).locator('#f-end').click();
    await expect(dlg(page).locator('#dp-grid [data-day="2026-11-14"]')).toBeDisabled();
    await expect(dlg(page).locator('#dp-grid [data-day="2026-11-15"]')).toBeEnabled();
    await expect(dlg(page).locator('#dp-chips .dpchip', { hasText: '今日' })).toBeDisabled();
    await dlg(page).locator('#dp-grid [data-day="2026-11-14"]').click({ force: true });
    await expect(dlg(page).locator('#f-end')).toHaveJSProperty('value', '2026/11/15');
  });

  test('開始日と同じ日の終了日を選んでも、終了が開始より前にならない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-title').fill('夜');
    await setTimeUi(page, 'start', '14:00');
    await setTimeUi(page, 'end', '09:00'); // 翌日の 09:00
    await setDateUi(page, 'end', '2026/11/12');
    await save(page);
    const [e] = await dbEvents(page);
    expect(e.end >= e.start).toBe(true);
  });

  test('月送り: ‹ › と 50pt 以上の横スワイプ。小さい動きでは変えず、日の選択にもならない。シートは閉じない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-start').click();
    await dlg(page).locator('#dp-next').click();
    await expect(dlg(page).locator('#dp-title')).toHaveText('2026年12月');
    await dlg(page).locator('#dp-prev').click();
    await expect(dlg(page).locator('#dp-title')).toHaveText('2026年11月');
    const g = await dlg(page).locator('#dp-grid').boundingBox();
    const y = g.y + g.height / 2, x = g.x + g.width / 2;
    const swipe = async (dx) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y, { steps: 3 }); await page.mouse.move(x + dx, y, { steps: 3 }); await page.mouse.up(); };
    await swipe(-70);
    await expect(dlg(page).locator('#dp-title')).toHaveText('2026年12月');
    await swipe(70);
    await expect(dlg(page).locator('#dp-title')).toHaveText('2026年11月');
    await swipe(-30);
    await expect(dlg(page).locator('#dp-title')).toHaveText('2026年11月');
    await expect(dlg(page).locator('#dpop')).toBeVisible();
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
  });

  test('終日: 日付のカプセルだけ。日付の選択は両端を含む形のまま保存される', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-title').fill('旅行');
    await dlg(page).locator('#f-all').setChecked(true);
    await expect(dlg(page).locator('#f-start')).toBeVisible();
    await setDateUi(page, 'start', '2026/11/20');
    await setDateUi(page, 'end', '2026/11/22');
    await save(page);
    const [e] = await dbEvents(page);
    expect(e.all).toBe(true);
    expect([e.start, e.end]).toEqual(['2026-11-20T00:00', '2026-11-22T23:59']);
  });

  test('開いたとき他の部品は閉じる（日付と時刻は同時に開かない）', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-start').click();
    await expect(dlg(page).locator('#dpop')).toBeVisible();
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#dpop')).toBeHidden();
    await expect(dlg(page).locator('#tpop')).toBeVisible();
    await dlg(page).locator('#f-end').click();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await expect(dlg(page).locator('#dpop')).toBeVisible();
    await dlg(page).locator('#f-title').click();
    await expect(dlg(page).locator('#dpop')).toBeHidden();
  });

  for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ...OPEN_SIZES.map((s, i) => [`開いた${i}`, s])]) {
    test(`日付の部品がシートの幅に収まる（${name}）`, async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      await dlg(page).locator('#f-end').click();
      const r = await page.evaluate(() => {
        const d = document.querySelector('#editor').getBoundingClientRect();
        return [...document.querySelectorAll('#dpop button, #dtbox .dcap')].filter((e) => e.offsetParent).map((e) => { const b = e.getBoundingClientRect(); return b.left >= d.left - 0.5 && b.right <= d.right + 0.5; });
      });
      expect(r.length).toBeGreaterThan(40);
      expect(r.every(Boolean)).toBe(true);
    });
  }
});
