// 第15版 PR16: 時刻のカプセルと時分のマス・長さのチップ・翌日の札
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, dbEvents, fillDateTime, setTimeUi, setDateUi, openMenu, SIZES, OPEN_SIZES } from './helpers.js';

const dlg = (page) => page.locator('#editor');
const openNew = async (page) => { await page.locator('[data-act="add"]:visible').first().click(); await expect(dlg(page)).toBeVisible(); };
const save = async (page) => { await page.locator('#form [type=submit]').click(); await expect(dlg(page)).toBeHidden(); };

test.describe('時刻カプセルと時分のマス', () => {
  test('構成: ダイヤルは時・分の2列（輪）・長さ6種。開くのは一度に一つ。同じカプセル・別の欄で閉じる', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await expect(dlg(page).locator('#f-stime')).toHaveText('10:00');
    await expect(dlg(page).locator('#f-etime')).toHaveText('11:00');
    await expect(dlg(page).locator('#f-dur .dchip')).toHaveText(['15分', '30分', '1時間', '1.5時間', '2時間', '3時間']);
    await expect(dlg(page).locator('#f-dur .dchip[aria-pressed=true]')).toHaveText('1時間');
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#tpop .dcol')).toHaveCount(2);
    await expect(dlg(page).locator('#tp-h .ditem')).toHaveCount(7); // 見える5段＋上下の1段
    await expect(dlg(page).locator('#tp-m .ditem.d0')).toHaveText('00');
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

  test('時を回すと分はそのまま。回しても部品は開いたまま。開閉だけでは未保存の変更にならない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#f-title').fill('a');
    await dlg(page).locator('#f-title').fill('');
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#tp-h').focus();
    await page.keyboard.press('ArrowDown');
    await expect(dlg(page).locator('#tpop')).toBeVisible();
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:00');
    await expect(dlg(page).locator('#f-etime')).toHaveText('10:00');
    await dlg(page).locator('#tp-m').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:30');
    await expect(dlg(page).locator('#f-etime')).toHaveText('10:30');
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
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

  test('07分: 回すまで丸めず真ん中に「07」。時だけ回しても 07分。回したときだけ5分に寄る。保存で丸めない', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '会議', '2026-11-12T10:07', '2026-11-12T11:43')]);
    await page.locator('.next').click();
    await expect(page.locator('#f-stime')).toHaveText('10:07');
    await page.locator('#f-stime').click();
    await expect(page.locator('#tp-m .ditem.d0')).toHaveText('07');
    await expect(page.locator('#tp-m')).toHaveAttribute('aria-valuetext', '07');
    await expect(page.locator('#tp-m .ditem.d1')).toHaveText(['05', '10']); // 輪の中の正しい位置（05・07・10）
    await page.locator('#tp-h').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#f-stime')).toHaveText('9:07');
    await expect(page.locator('#f-etime')).toHaveText('10:43');
    await expect(page.locator('#tp-m .ditem.d0')).toHaveText('07');
    await save(page);
    const [e] = await dbEvents(page);
    expect([e.start, e.end]).toEqual(['2026-11-12T09:07', '2026-11-12T10:43']);
  });

  test('07分を回すと上は10分・下は05分へ寄る', async ({ page }) => {
    await openApp(page);
    await seed(page, [ev('a', '会議', '2026-11-12T10:07', '2026-11-12T11:43')]);
    await page.locator('.next').click();
    await page.locator('#f-stime').click();
    await page.locator('#tp-m').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#f-stime')).toHaveText('10:10');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#f-stime')).toHaveText('10:05');
    await page.locator('#f-stime').click();
    await page.locator('#f-etime').click();
    await page.locator('#tp-m').focus();
    await page.keyboard.press('ArrowDown'); // 43 → 40
    await expect(page.locator('#f-etime')).toHaveText('11:40');
  });

  test('23時台＋2時間は翌日の札と終了日の更新で保存できる。+2日は実日数', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-title').fill('夜');
    await setTimeUi(page, 'start', '23:00');
    await expect(dlg(page).locator('#f-eday')).toHaveText('翌日'); // 23:00〜翌0:00
    await dlg(page).locator('#f-dur [data-min="120"]').click();
    await expect(dlg(page).locator('#f-end')).toHaveJSProperty('value', '2026/11/13');
    await expect(dlg(page).locator('#f-etime')).toContainText('1:00');
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
        return [...document.querySelectorAll('#dtbox button, #dtbox input, #dtbox .dial')].filter((e) => e.offsetParent && !e.classList.contains('dchip') && !e.closest('#tpop.face')).map((e) => { const b = e.getBoundingClientRect(); return b.left >= d.left - 0.5 && b.right <= d.right + 0.5; });
      });
      expect(r.length).toBeGreaterThan(3);
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
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:15');
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

// 第15版 PR18: 数字の短縮入力・読み上げ（adjustable）・大文字
const HAP = () => {
  const M = window.__hap = { calls: [] };
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb',
    nativePromise: async (plugin, method, opts) => {
      M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts)) });
      if (method === 'selectionHaptic') return { performed: true };
      throw { code: 'UNAVAILABLE', message: method };
    },
  };
};
const longPress = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
};
const typeEnter = async (page, digits) => { await page.keyboard.type(digits); await page.keyboard.press('Enter'); };

test.describe('数字の短縮入力', () => {
  test('時刻: 長押しで欄になり 930→9:30（長さを保つ）。部品は開かず、カプセルへフォーカスが戻る', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime');
    const inp = dlg(page).locator('input.capin.tcap-in');
    await expect(inp).toBeFocused();
    await expect(dlg(page).locator('#f-stime')).toBeHidden();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await expect(inp).toHaveAttribute('inputmode', 'numeric');
    await typeEnter(page, '930');
    await expect(dlg(page).locator('input.capin')).toHaveCount(0);
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:30');
    await expect(dlg(page).locator('#f-etime')).toHaveText('10:30');
    await expect(dlg(page).locator('#f-stime')).toBeFocused();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
  });

  test('時刻: 1430 / 9 / 21 と、終了の 21（日付はそのまま）', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime'); await typeEnter(page, '1430');
    await expect(dlg(page).locator('#f-stime')).toHaveText('14:30');
    await longPress(page, '#f-etime'); await typeEnter(page, '21');
    await expect(dlg(page).locator('#f-etime')).toHaveText('21:00');
    await longPress(page, '#f-stime'); await typeEnter(page, '9');
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:00');
    await expect(dlg(page).locator('#f-etime')).toHaveText('15:30'); // 長さ6時間30分を保つ
  });

  test('読めない値（2560・24）は元に戻り、0.2秒揺れ、エラー文は出ず、未保存の変更にもならない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime');
    await typeEnter(page, '2560');
    const cap = dlg(page).locator('#f-stime');
    await expect(cap).toHaveText('10:00');
    await expect(cap).toHaveClass(/shake/);
    await expect(cap).not.toHaveClass(/shake/, { timeout: 1000 });
    await expect(dlg(page).locator('#error')).toHaveText('');
    await expect(dlg(page).locator('.capin')).toHaveCount(0);
    await longPress(page, '#f-etime'); await typeEnter(page, '24');
    await expect(dlg(page).locator('#f-etime')).toHaveText('11:00');
  });

  test('何も打たずに確定・同じ値・Escape は何も変えず、シートも閉じない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime'); await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-stime')).toHaveText('10:00');
    await expect(dlg(page).locator('#f-stime')).not.toHaveClass(/shake/);
    await longPress(page, '#f-stime'); await page.keyboard.type('1000'); await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-stime')).not.toHaveClass(/shake/);
    await longPress(page, '#f-stime'); await page.keyboard.type('15'); await page.keyboard.press('Escape');
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).locator('#f-stime')).toHaveText('10:00');
    await expect(dlg(page).locator('#f-stime')).toBeFocused();
    // 未確定の数字は状態へ入っていない: 閉じる確認が出ない
    await dlg(page).locator('#f-title').fill('a'); await dlg(page).locator('#f-title').fill('');
  });

  test('日付: 1114・930・20270105、年なしは編集中の値の年（11月でも0105は同年1月）', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2026/11/12');
    await longPress(page, '#f-start'); await expect(dlg(page).locator('input.dcap-in')).toBeFocused();
    await expect(dlg(page).locator('#dpop')).toBeHidden();
    await typeEnter(page, '1114');
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2026/11/14');
    await expect(dlg(page).locator('#f-end')).toHaveAttribute('value', '2026/11/14');
    await expect(dlg(page).locator('#f-start')).toHaveText('11月14日（土）');
    await longPress(page, '#f-start'); await typeEnter(page, '0105');
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2026/01/05');
    await longPress(page, '#f-start'); await typeEnter(page, '20270105');
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2027/01/05');
    await expect(dlg(page).locator('#f-start')).toHaveText('2027年1月5日（火）');
    await longPress(page, '#f-start'); await typeEnter(page, '930');
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2027/09/30');
  });

  test('日付: 0230・1332・開始より前の終了日は元の値に戻して揺れる。エラー文は出ない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    for (const bad of ['0230', '1332', '12']) {
      await longPress(page, '#f-start'); await typeEnter(page, bad);
      await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2026/11/12');
      await expect(dlg(page).locator('#error')).toHaveText('');
    }
    await longPress(page, '#f-start'); await page.keyboard.type('0230'); await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-start')).toHaveClass(/shake/);
    await longPress(page, '#f-end'); await typeEnter(page, '1101');
    await expect(dlg(page).locator('#f-end')).toHaveAttribute('value', '2026/11/12');
    await longPress(page, '#f-end'); await typeEnter(page, '1115');
    await expect(dlg(page).locator('#f-end')).toHaveAttribute('value', '2026/11/15');
  });

  test('保存: 数字入力した日時で予定が保存される', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-title').fill('短縮');
    await longPress(page, '#f-start'); await typeEnter(page, '1114');
    await longPress(page, '#f-stime'); await typeEnter(page, '1430');
    await longPress(page, '#f-etime'); await typeEnter(page, '1530');
    await save(page);
    const e = (await dbEvents(page)).find((x) => x.title === '短縮');
    expect([e.start, e.end]).toEqual(['2026-11-14T14:30', '2026-11-14T15:30']);
  });

  test('長押し後の pointercancel では欄が残り、続く click で部品は開かない。IME 変換中の Enter では確定しない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime');
    await page.evaluate(() => {
      const c = document.querySelector('#f-stime');
      c.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, isPrimary: true }));
    });
    await expect(dlg(page).locator('input.tcap-in')).toBeFocused();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    // 変換中の Enter（isComposing）は確定しない
    await page.keyboard.type('15');
    await page.evaluate(() => {
      const i = document.querySelector('input.tcap-in');
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
    });
    await expect(dlg(page).locator('input.tcap-in')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-stime')).toHaveText('15:00');
  });

  test('欄に全角数字・文字を打っても数字だけが残る。touch と click の二重発火でも欄は一つ', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime');
    await page.evaluate(() => {
      const c = document.querySelector('#f-stime');
      for (let i = 0; i < 3; i++) c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, isPrimary: true, clientX: 5, clientY: 5 }));
    });
    await page.waitForTimeout(650);
    await expect(dlg(page).locator('input.capin')).toHaveCount(1);
    await dlg(page).locator('input.capin').fill('ab１２x');
    await expect(dlg(page).locator('input.capin')).toHaveValue('12');
    await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-stime')).toHaveText('12:00');
  });

  test('短いタップは今までどおり部品を開く（長押しだけが欄）。動かすと長押しにならない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#tpop')).toBeVisible();
    await dlg(page).locator('#f-stime').click();
    const b = await dlg(page).locator('#f-etime').boundingBox();
    await page.mouse.move(b.x + 10, b.y + 10); await page.mouse.down();
    await page.mouse.move(b.x + 40, b.y + 10, { steps: 4 });
    await page.waitForTimeout(650); await page.mouse.up();
    await expect(dlg(page).locator('input.capin')).toHaveCount(0);
  });

  test('キーボード: カプセルにフォーカスして数字キーで欄が開く', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').focus();
    await page.keyboard.type('845');
    await expect(dlg(page).locator('input.tcap-in')).toHaveValue('845');
    await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-stime')).toHaveText('8:45');
    await expect(dlg(page).locator('#f-stime')).toBeFocused();
  });

  test('終日では時刻の欄は開かない。日付は終日でも打てる', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-all').check();
    await longPress(page, '#f-start'); await typeEnter(page, '1120');
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('value', '2026/11/20');
  });
});

test.describe('読み上げ（adjustable）とフォーカス', () => {
  test('各列は「開始、時」「開始、分」の slider。上下キーで1時間・5分、輪でつながる。触覚が鳴る', async ({ page }) => {
    await page.addInitScript(HAP);
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    const h = dlg(page).locator('#tpop [role=slider][aria-label="開始、時"]'), m = dlg(page).locator('#tpop [role=slider][aria-label="開始、分"]');
    await expect(h).toHaveAttribute('aria-valuetext', '10');
    await expect(m).toHaveAttribute('aria-valuetext', '00');
    await h.focus();
    await page.keyboard.press('ArrowUp');
    await expect(dlg(page).locator('#f-stime')).toHaveText('11:00');
    await expect(h).toHaveAttribute('aria-valuetext', '11');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:00');
    await expect(dlg(page).locator('#tpop')).toBeVisible();
    await m.focus();
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:10');
    await page.keyboard.press('ArrowDown');
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:05');
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
    await expect(dlg(page).locator('#f-stime')).toHaveText('9:55'); // 00 → 55（輪）
    await h.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
    await expect(dlg(page).locator('#f-stime')).toHaveText('23:55'); // 0 → 23（輪）
    await page.keyboard.press('ArrowUp');
    await expect(dlg(page).locator('#f-stime')).toHaveText('0:55');
    expect(await page.evaluate(() => window.__hap.calls.filter((c) => c.method === 'selectionHaptic').length)).toBe(3 + 5 + 11); // 1段ごとに1回
  });

  test('終了の列は「終了、時」。開閉でラベルが変わる', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-etime').click();
    await expect(dlg(page).locator('#tp-h')).toHaveAttribute('aria-label', '終了、時');
    await expect(dlg(page).locator('#tp-title')).toBeHidden(); // 見出しは面（開いた横・縦）のときだけ
  });

  test('カプセルの読み上げ名と日付の読み上げ名', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#f-stime')).toHaveAttribute('aria-label', /開始の時刻、.*、ボタン/);
    await expect(dlg(page).locator('#f-start')).toHaveAttribute('aria-label', /^開始の日付、11月12日木曜日、ボタン$/);
    await expect(dlg(page).locator('#f-end')).toHaveAttribute('aria-label', /^終了の日付、11月12日木曜日、ボタン$/);
  });

  test('Escape: 部品だけ閉じてカプセルへフォーカスが戻る（シートは閉じない）。日を選んでもフォーカスが戻る', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#tp-h').focus();
    await page.keyboard.press('Escape');
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).locator('#f-stime')).toBeFocused();
    await dlg(page).locator('#f-end').click();
    await dlg(page).locator('#dp-grid [data-day="2026-11-20"]').click();
    await expect(dlg(page).locator('#f-end')).toBeFocused();
    await dlg(page).locator('#f-start').click();
    await dlg(page).locator('#dp-grid [data-day="2026-11-13"]').focus();
    await page.keyboard.press('Escape');
    await expect(dlg(page).locator('#dpop')).toBeHidden();
    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).locator('#f-start')).toBeFocused();
  });
});

test.describe('大文字', () => {
  test('文字を大きくすると1段 44・見える段 3・高さ 132（閉じた画面）', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('duo.ui.v1', JSON.stringify({ monthTextSize: 'large' })));
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ h: document.querySelector('#tpop .dial').getBoundingClientRect().height, n: document.querySelectorAll('#tp-h .ditem').length, rh: document.querySelector('#tp-h .ditem').getBoundingClientRect().height }));
    expect(r.h).toBeCloseTo(132, 0); expect(r.rh).toBeCloseTo(44, 0); expect(r.n).toBe(5);
  });

  test('標準の文字では1段 32・5段・高さ 160・幅 180（x143〜323）', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await page.waitForTimeout(300);
    const b = await dlg(page).locator('#tpop .dial').boundingBox();
    expect(b.height).toBeCloseTo(160, 0); expect(b.width).toBeCloseTo(180, 0); expect(b.x).toBeCloseTo(143, 0);
  });

  test('大文字でも長押しの欄がシート内に収まる', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('duo.ui.v1', JSON.stringify({ monthTextSize: 'large' })));
    await openApp(page);
    await openNew(page);
    await longPress(page, '#f-stime');
    const ok = await page.evaluate(() => { const d = document.querySelector('#editor').getBoundingClientRect(), b = document.querySelector('input.capin').getBoundingClientRect(); return b.left >= d.left && b.right <= d.right && b.height >= 40; });
    expect(ok).toBe(true);
  });
});

// ---------- 第19版 PR4: 時刻のダイヤル（design/24） ----------
const dragCol = async (page, sel, dy, { fast = false } = {}) => {
  await page.waitForTimeout(300); // 開く 0.2 秒の伸びが終わってから
  const b = await dlg(page).locator(sel).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: fast ? 3 : 12 });
  if (!fast) await page.waitForTimeout(120); // 止めてから離す（弾かない）
  await page.mouse.up();
};

test.describe('ダイヤルの操作', () => {
  test('ドラッグで1段ずつ回る。下へ引くと前の値。離すと近い段に寄り、真ん中の値が決まる', async ({ page }) => {
    await page.addInitScript(HAP);
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await dragCol(page, '#tp-h', 64); // 32×2
    await expect(dlg(page).locator('#f-stime')).toHaveText('8:00');
    await expect(dlg(page).locator('#f-etime')).toHaveText('9:00'); // 長さを保つ
    await dragCol(page, '#tp-m', -32 * 3);
    await expect(dlg(page).locator('#f-stime')).toHaveText('8:15');
    await page.waitForTimeout(300);
    const off = await page.evaluate(() => [...document.querySelectorAll('#tp-h .ditem.d0')].map((e) => e.style.transform));
    expect(off.length).toBe(1);
    expect(await page.evaluate(() => window.__hap.calls.filter((c) => c.method === 'selectionHaptic').length)).toBe(5);
  });

  test('たたいた段へ進む。輪でつながる（0時の1つ上の段は 23）', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await setTimeUi(page, 'start', '00:00');
    await dlg(page).locator('#f-stime').click();
    await page.waitForTimeout(300);
    const b = await dlg(page).locator('#tp-h').boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2 - 32); // 1つ上の段
    await expect(dlg(page).locator('#f-stime')).toHaveText('23:00');
  });

  test('視差効果を減らす: 速く弾いても惰性で回らない（引いた分だけ）', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await dragCol(page, '#tp-h', 64, { fast: true });
    await page.waitForTimeout(700);
    await expect(dlg(page).locator('#f-stime')).toHaveText('8:00');
  });

  test('速く弾くと惰性で数段回る（視差効果を減らすがオフのとき）', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await page.waitForTimeout(300);
    const b = await dlg(page).locator('#tp-h').boundingBox();
    const x = b.x + b.width / 2, y = b.y + 20;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y + 40, { steps: 2 }); await page.mouse.up();
    await page.waitForTimeout(900);
    const t = await dlg(page).locator('#f-stime').textContent();
    expect(['9:00', '10:00']).not.toContain(t); // 40pt の引き（1段）より先まで惰性で進み、段に止まる
  });

  test('開いている間、キーボードの欄にフォーカスがない。文字の欄に触れると閉じる', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-title').click();
    await expect(dlg(page).locator('#f-title')).toBeFocused();
    await dlg(page).locator('#f-stime').click();
    await expect(dlg(page).locator('#tpop')).toBeVisible();
    expect(await page.evaluate(() => { const a = document.activeElement; return !!a && ['INPUT', 'TEXTAREA'].includes(a.tagName); })).toBe(false);
    await dlg(page).locator('#f-title').click();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
  });

  test('長押しで数字を打つときはダイヤルを閉じる', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-stime').click();
    await dlg(page).locator('#f-stime').focus();
    await page.keyboard.type('1430');
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(dlg(page).locator('#f-stime')).toHaveText('14:30');
  });

  test('開始を回すと終了は長さを保つ。23:30＋60分で終了は翌日 00:30。開閉だけなら変わらない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await setTimeUi(page, 'start', '23:30');
    await expect(dlg(page).locator('#f-etime')).toHaveText('0:30');
    await expect(dlg(page).locator('#f-eday')).toHaveText('翌日');
    await dlg(page).locator('#f-etime').click();
    await dlg(page).locator('#f-etime').click();
    await expect(dlg(page).locator('#f-etime')).toHaveText('0:30');
  });

  test('終日では時刻のダイヤルは開かない', async ({ page }) => {
    await openApp(page);
    await openNew(page);
    await dlg(page).locator('#f-all').check();
    await expect(dlg(page).locator('#tpop')).toBeHidden();
    await expect(dlg(page).locator('#f-stime')).toBeHidden();
  });
});

for (const [name, size] of [['開いた横', SIZES.openLandscape951], ['開いた縦', SIZES.openPortrait669]]) {
  test.describe(`ダイヤルの面（${name}）`, () => {
    test('面が出て、見出し・220×308・1段44・7段・よく使う時刻が並ぶ。閉じると元に戻る', async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      await dlg(page).locator('#f-stime').click();
      await page.waitForTimeout(300);
      await expect(dlg(page).locator('#tpop')).toHaveClass(/face/);
      await expect(dlg(page).locator('#tp-title')).toHaveText('開始の時刻');
      const d = await dlg(page).locator('#tpop .dial').boundingBox();
      expect(d.width).toBeCloseTo(220, 0); expect(d.height).toBeCloseTo(308, 0);
      await expect(dlg(page).locator('#tp-chips .tfchip')).toHaveText(['9:00', '10:00', '13:00', '15:00', '19:00']);
      const c = await dlg(page).locator('#tp-chips .tfchip').first().boundingBox();
      expect(c.width).toBeCloseTo(62, 0); expect(c.height).toBeCloseTo(28, 0);
      const pop = await dlg(page).locator('#tpop').boundingBox(), ed = await dlg(page).boundingBox();
      if (name === '開いた横') expect(pop.x + pop.width).toBeLessThanOrEqual(ed.x + 1); // 左のページ全体。シートは右のまま
      else { expect(pop.y).toBeCloseTo(492, 0); expect(pop.y + pop.height).toBeCloseTo(917, 0); } // 溝 467〜484 のあと
      await dlg(page).locator('#f-etime').click();
      await expect(dlg(page).locator('#tp-title')).toHaveText('終了の時刻');
      await dlg(page).locator('#f-etime').click();
      await expect(dlg(page).locator('#tpop')).toBeHidden();
      await expect(dlg(page).locator('#editor, #f-etime').first()).toBeVisible();
    });

    test('よく使う時刻で値が入る（開始 15:00 → 終了は長さを保って 16:00）。面は開いたまま', async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      await dlg(page).locator('#f-stime').click();
      await dlg(page).locator('#tp-chips .tfchip', { hasText: '15:00' }).click();
      await expect(dlg(page).locator('#f-stime')).toHaveText('15:00');
      await expect(dlg(page).locator('#f-etime')).toHaveText('16:00');
      await expect(dlg(page).locator('#tpop')).toBeVisible();
    });

    test('面でも回せる。1段 44。シートの✓で保存できる', async ({ page }) => {
      await openApp(page, size);
      await openNew(page);
      await dlg(page).locator('#f-title').fill('面');
      await dlg(page).locator('#f-stime').click();
      await dragCol(page, '#tp-h', 44 * 2);
      await expect(dlg(page).locator('#f-stime')).toHaveText('8:00');
      await dlg(page).locator('#save').click();
      await expect(dlg(page)).toBeHidden();
      const [e] = await dbEvents(page);
      expect(e.start).toBe('2026-11-12T08:00');
    });
  });
}
