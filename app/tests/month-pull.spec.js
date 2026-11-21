import { test, expect } from '@playwright/test';
import { openApp, seed, ev, tab, SIZES, monthFormInit, findTextOverlaps } from './helpers.js';
import { seedTasks, T } from './task-helpers.js';

// 第19版 PR6: ③ 月タブ＝月を引く画面（design/22）。閉じた画面 466×678 と開いた縦 669×951。
// openApp は月の型が保存されていなければ「月」で起動する（第18版までの spec 用）。ここでは既定（2週）を見るため 'two' を先に保存する。
const box = (loc) => loc.boundingBox();
const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
const form = (page) => page.locator('.mpull').getAttribute('data-form');
const gridH = async (page) => (await box(page.locator('.mgrid'))).height;
const settle = (page) => page.waitForTimeout(340);
// 11/12 に時刻つき 5 件（時刻が早い順に並ぶ）
const FIVE = ['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`p${i}`, `予定${t}`, `2026-11-12T${String(9 + i).padStart(2, '0')}:00`, `2026-11-12T${String(9 + i).padStart(2, '0')}:30`));
const grab = (page) => page.locator('.mgrab');
// 実機の閉じた画面（右の帯 84）。寸法を資料の値（見出し x8〜374 など）で確かめる試験で使う
const band = async (page) => { await page.evaluate(() => { document.documentElement.style.setProperty('--sar', '84px'); window.dispatchEvent(new Event('resize')); }); await page.waitForTimeout(150); };
const pull = async (page, dy) => {
  const b = await box(page.locator('.mgrab i'));
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + dy, { steps: 8 }); await page.mouse.up();
};

test.describe('閉じた画面 466×678', () => {
  test.beforeEach(async ({ page }) => { await monthFormInit(page, 'month'); }); // design/34: 起動は段1（月）

  test('初めは段1（月）と「予定」（design/34 §2.2 で置き換え）。見出し 44・曜日 20・格子 y64〜580（6行×86）・つまみ 24（36×4）・日の部分がつながる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    expect(await form(page)).toBe('month');
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '1');
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A'); // 34 §6.1・S11b: 日の欄は「カード」から。「予定｜時間軸」の切り替えは消え、つまみ（下）で時間軸へ
    await expect(page.locator('[data-mday]')).toHaveCount(0);
    await expect(page.locator('#ctitle')).toHaveText('2026年 11月');
    await expect(page.locator('.mptoday')).toHaveText('今日');
    const mph = await box(page.locator('.mph')), wd = await box(page.locator('.weekdays')), g = await box(page.locator('.mgrid')), h = await box(page.locator('.mgrab')), i = await box(page.locator('.mgrab i')), d = await box(page.locator('.mday'));
    expect(near(mph.y, 0) && near(mph.height, 44)).toBe(true);
    expect(near(wd.y, 44) && near(wd.height, 20)).toBe(true);
    expect(near(g.y, 64) && near(g.height, 516)).toBe(true);
    expect(near(h.height, 44) && near(i.y, g.y + g.height + 10) && near(i.width, 36) && near(i.height, 4)).toBe(true); // 区域 24 の上から 10〜14（押せる範囲は 44）
    expect(near(d.y, g.y + g.height + 24)).toBe(true);
    // 月の段は 6 週をいつも出す。選んだ日（11/12）の月は 10/26〜12/6
    const days = await page.locator('.mgrid .day').evaluateAll((e) => e.map((x) => x.dataset.date));
    expect(days[0]).toBe('2026-10-26'); expect(days.length).toBe(42); expect(days[41]).toBe('2026-12-06');
    for (const r of await page.locator('.mgrid .week').all()) expect(near((await box(r)).height, 86)).toBe(true);
    await expect(page.locator('.mdh h3')).toContainText('11月12日'); await expect(page.locator('.mdh .hdw')).toContainText('木'); // 34 §6.1: 見出し「11月12日」＋右に「木 先勝」
  });

  test('段ごとに 4・3・2 件が名前で出て、あふれは +N（design/34 §2.2・§4）。+N は日付の行の右（11/400 #68716A、右 4）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, FIVE);
    await tab(page, '月').click();
    await band(page);
    const vis = () => page.locator('.mgrid .strip[data-sday="2026-11-12"]').evaluateAll((es) => es.filter((e) => Number(getComputedStyle(e).opacity) > 0.5).length);
    const plus = () => page.locator('.mgrid .plus[data-plus="2026-11-12"]');
    // 段1: 4件（+1）。チップは日付の行（22）の下から 16 おき
    expect(await vis()).toBe(4); await expect(plus()).toHaveText('+1');
    const pl = await plus().evaluate((e) => { const s = getComputedStyle(e), d = e.parentElement.querySelector('[data-date="2026-11-12"]').getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(e); const t = g.getBoundingClientRect(); return { fs: parseFloat(s.fontSize), fw: Number(s.fontWeight), color: s.color, right: d.right - t.right, top: t.top - d.top, tb: t.bottom - d.top }; });
    expect(pl.fs).toBe(11); expect(pl.fw).toBe(400); expect(pl.color).toBe('rgb(104, 113, 106)');
    expect(near(pl.right, 4, 1)).toBe(true); expect(pl.tb).toBeLessThanOrEqual(22.5);
    const tops = await page.locator('.mgrid .strip[data-sday="2026-11-12"]').evaluateAll((es) => es.map((e) => e.getBoundingClientRect().top - e.closest('.week').getBoundingClientRect().top));
    expect(near(tops[0], 22, 1.2) && near(tops[3] - tops[0], 48, 0.6)).toBe(true);
    // 段2: 3件（+2）、段3: 2件（+3）、段4（2週）: 4件（+1）、段7（1週）: 4件（+1）
    const grabEl = page.locator('.mgrab'); await grabEl.focus();
    for (const [n, k, p] of [[2, 3, '+2'], [3, 2, '+3'], [4, 4, '+1'], [5, 3, '+2'], [6, 2, '+3'], [7, 4, '+1']]) {
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(450);
      await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
      expect(await vis(), `段${n}`).toBe(k); await expect(plus(), `段${n}`).toHaveText(p);
    }
  });

  test('4件ちょうどは全部出る（+n なし）。5件目から「+n」', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, FIVE.slice(0, 4));
    await tab(page, '月').click();
    expect(await page.locator('.mgrid .strip[data-sday="2026-11-12"]').count()).toBe(4);
    await expect(page.locator('.mgrid .plus[data-plus="2026-11-12"]:not([hidden])')).toHaveCount(0);
  });

  test('つまみを引くと月の高さが指に付いてくる。離すと一番近い段へ 0.25 秒で寄り、保存される。たたきは何もしない（design/34 §3・§5 の7段）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    // たたき
    const b = await box(page.locator('.mgrab i'));
    await page.mouse.click(b.x + 18, b.y + 2);
    await settle(page);
    expect(await form(page)).toBe('month'); await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '1');
    // 途中（-60 で 456）→ ゆっくり離すと段2（420）へ（一番近い段）
    const x = b.x + 18, y = b.y + 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 60, { steps: 6 });
    expect(near(await gridH(page), 456, 2)).toBe(true); // 516 − 60（指に付いてくる）
    await page.waitForTimeout(200);
    await page.mouse.up();
    await settle(page);
    expect(near(await gridH(page), 420)).toBe(true);
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '2');
    expect((await ui(page)).stage).toBe(2); expect((await ui(page)).monthForm).toBe('month');
    // 大きく上へ引くと 1週（段7）へ
    await pull(page, -400); await settle(page);
    expect(await form(page)).toBe('one'); await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '7');
    expect(near(await gridH(page), 86)).toBe(true);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await form(page)).toBe('one'); // 段は覚える
  });

  test('月の日をたたくと下の日の部分が変わる。画面（月の部分）は動かない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('x1', '十八日の会議', '2026-11-18T10:00', '2026-11-18T11:00'), ...FIVE.slice(0, 1)]);
    await tab(page, '月').click();
    const g0 = await box(page.locator('.mgrid')), d0 = await box(page.locator('.mday'));
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 12, y: 10 } }); // 2行目の日
    await expect(page.locator('[data-date="2026-11-18"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mdh h3')).toContainText('11月18日'); await expect(page.locator('.mdh .hdw')).toContainText('水');
    await expect(page.locator('.mdcards .mdcard')).toHaveText([/10:00[\s\S]*11:00[\s\S]*十八日の会議/]); // 34 §6.1: カードは始まりと終わりの時刻を必ず出す
    expect(await box(page.locator('.mgrid'))).toEqual(g0);
    expect(await box(page.locator('.mday'))).toEqual(d0);
    expect(((await page.locator('.mgrid .day').first().getAttribute('data-date')))).toBe('2026-10-26'); // 見る月は動かない（段1は 6 週・10/26 から）
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true'); // 日表示へは進まない
  });

  test('前・次（見えないボタン）は段4・2週では1週ずつ、段1・月では1か月ずつ。今日で選んだ日が戻る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await grab(page).focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); await settle(page);
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '4');
    await page.locator('[data-act="next"]').first().click({ force: true });
    await expect(page.locator('[data-date="2026-11-19"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.mgrid .day').first().getAttribute('data-date')).toBe('2026-11-16');
    await page.locator('.mptoday').click();
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.mgrid .day').first().getAttribute('data-date')).toBe('2026-11-09');
    await grab(page).focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown'); await settle(page);
    await page.locator('[data-act="next"]').first().click({ force: true });
    await expect(page.locator('#ctitle')).toHaveText('2026年 12月');
  });

  test('日の欄の中だけが流れ、格子は動かない・縮まない（段1・4・7。design/34 §6.3 で置き換え）。固定は見出し 44＋曜日 20', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, Array.from({ length: 14 }, (_, i) => ev(`m${i}`, `長い日${i}`, `2026-11-12T${String(8 + i).padStart(2, '0')}:00`, `2026-11-12T${String(8 + i).padStart(2, '0')}:30`)));
    await tab(page, '月').click();
    await band(page);
    const md = page.locator('.mday');
    for (const [n, H] of [[1, 516], [4, 172], [7, 86]]) {
      await grab(page).focus();
      for (let i = 0; i < 8 && Number(await page.locator('.mpull').getAttribute('data-stage')) !== n; i++) { await page.keyboard.press(Number(await page.locator('.mpull').getAttribute('data-stage')) < n ? 'ArrowUp' : 'ArrowDown'); }
      await settle(page);
      await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
      await md.evaluate((e) => { e.scrollTop = 0; });
      const g0 = await box(page.locator('.mgrid'));
      await md.evaluate((e) => { e.scrollTop = e.scrollHeight; });
      await page.waitForTimeout(250);
      expect(await md.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
      expect(await box(page.locator('.mgrid'))).toEqual(g0); // 格子は動かない
      expect(near(await gridH(page), H)).toBe(true); // 縮まない
      const mph = await box(page.locator('.mph')), wd = await box(page.locator('.weekdays'));
      expect(near(mph.y, 0) && near(mph.height, 44) && near(wd.y, 44) && near(wd.height, 20)).toBe(true);
      await expect(page.locator('.mph .mpdate')).toHaveCount(0); // 見出しの右の日付は出さない（34 §6.3）
      expect((await ui(page)).stage).toBe(n);
      await md.evaluate((e) => { e.scrollTop = 0; });
    }
  });

  test('閉じた画面の月（段1。design/34 §2.2 で置き換え）: 日の見出し y604〜648（17/600）、日の欄は y604〜678 でその中だけが流れる、一番下の余白 41、タブの上 24 のぼかし（タブが消えるまで）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, FIVE.slice(0, 1));
    await page.addInitScript(() => localStorage.setItem('duo.ui.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'), monthForm: 'month', stage: 1, monthDay: 'list' })));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    await band(page);
    const g = await box(page.locator('.mgrid')), gr = await box(page.locator('.mgrab i')), dh = await box(page.locator('.mdh'));
    expect(near(g.y, 64) && near(g.height, 516)).toBe(true);
    expect(near(gr.y, 590) && near(gr.height, 4)).toBe(true); // つまみの線 y590〜594
    expect(near(dh.y, 604) && near(dh.height, 44)).toBe(true);
    expect(await page.locator('.mdh h3').evaluate((e) => getComputedStyle(e).fontSize)).toBe('17px');
    // 34 §6.2（S11b）: 「予定｜時間軸」の切り替え 132×32 は消え、日の欄のつまみ（下）に置き換わった
    await expect(page.locator('.mdsw')).toHaveCount(0);
    await expect(page.locator('.mdgrab')).toHaveCount(1);
    // 日の欄は y604〜678。流し切ると、最後の行の下に余白 41
    const md = page.locator('.mday');
    const dd = await box(md); expect(near(dd.y, 604) && near(dd.y + dd.height, 678)).toBe(true);
    expect(await md.evaluate((e) => getComputedStyle(e).paddingBottom)).toBe('41px');
    // タブの上 24（y575〜599）に地色の 0→100% のぼかし
    const fade = await page.locator('.tabfade').evaluate((e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { y: r.top, h: r.height, bg: s.backgroundImage, pe: s.pointerEvents }; });
    expect(near(fade.y, 575) && near(fade.h, 24)).toBe(true);
    expect(fade.bg).toContain('rgba(247, 244, 237, 0)'); expect(fade.bg).toContain('rgb(247, 244, 237)');
    expect(fade.pe).toBe('none');
  });

  test('月の日をたたくと下の日の部分がその日になる。格子（月の部分）は動かない（design/34 §6.3: 日の欄の中だけが流れる）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('x1', '十八日の会議', '2026-11-18T10:00', '2026-11-18T11:00'), ...FIVE.slice(0, 1)]);
    await tab(page, '月').click();
    await band(page);
    const g0 = await box(page.locator('.mgrid'));
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.mdh h3')).toContainText('11月18日');
    expect(await box(page.locator('.mgrid'))).toEqual(g0);
  });

  test('日の欄のつまみ（下）で 時間軸（34 §6.2・S11b で置き換え）: 1時間 44 で今の時刻に赤い線。日の欄の下にタスクはなく、ノートがある。段は保存しない（開くたびにカード）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seedTasks(page, [T('t1', { title: '十二日が期限', due: { date: '2026-11-12' } }), T('t2', { title: '別の日', due: { date: '2026-11-20' } })]);
    await tab(page, '月').click();
    await grab(page).focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); await settle(page); // 段4: 日の欄をタブの上へ出す（段1は日の見出しがタブの帯にかかる。タブは次の段で消える）
    await expect(page.locator('.mdtask')).toHaveCount(0); // 34 §9.1 の 11: 日の欄の下のタスクは出さない（右の列の「タスク」へ）
    await expect(page.locator('.mdnl')).toBeVisible(); await expect(page.locator('.mdnote')).toBeVisible(); // 「ノート ›」と下の欄
    await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowDown'); // つまみ（下）を下へ＝時間軸（キーでも同じ）
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
    const hs = await page.locator('.mday .hlab').evaluateAll((e) => e.slice(0, 3).map((x) => x.getBoundingClientRect().top));
    expect(near(hs[1] - hs[0], 44, 0.6)).toBe(true);
    await expect(page.locator('.mday .nowl')).not.toHaveAttribute('hidden', ''); // 今日の線
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A'); // 保存しない
  });

  test('「全部」の月は従来のまま。見出しの全で入り・戻る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await page.locator('.mph [data-act="allmonth"]').click();
    await expect(page.locator('.scroll.all')).toBeVisible();
    await expect(page.locator('.mpull')).toHaveCount(0);
    await page.locator('.chead [data-act="allmonth"]').click();
    await expect(page.locator('.mpull')).toBeVisible();
  });
});

test.describe('開いた縦 669×951', () => {
  test.beforeEach(async ({ page }) => { await monthFormInit(page, 'two'); });

  test('月は上の面（マス y146〜443・つまみ y453〜457）、日は下の面（y492〜）。月の高さは型によらず 297', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await seed(page, FIVE);
    expect(await form(page)).toBe('two');
    for (const f of ['two', 'one', 'month']) {
      if (f === 'one') { await grab(page).focus(); await page.keyboard.press('ArrowUp'); }
      if (f === 'month') { await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); }
      await settle(page);
      expect(await form(page)).toBe(f);
      const g = await box(page.locator('.mgrid')), i = await box(page.locator('.mgrab i')), d = await box(page.locator('.mday'));
      expect(near(g.y, 146, 1) && near(g.height, 297, 1)).toBe(true);
      expect(near(i.y, 453, 1) && near(i.height, 4, 0.5) && near(i.width, 36, 0.5)).toBe(true);
      expect(near(d.y, 492, 1) && near(d.y + d.height, 917, 1)).toBe(true);
      const rows = await page.locator('.mgrid .week').evaluateAll((e) => e.map((x) => x.getBoundingClientRect().height));
      expect(rows.length).toBe({ one: 1, two: 2, month: 6 }[f]);
      for (const h of rows) expect(near(h, 297 / rows.length, 0.6)).toBe(true);
    }
  });

  test('チップ: 1週は最大13件・2週は6件・月は2件。入りきらないときの +N は日付の行の右（段は全部名前）', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await seed(page, Array.from({ length: 15 }, (_, i) => ev(`q${i}`, `件${i}`, `2026-11-12T${String(6 + i).padStart(2, '0')}:00`, `2026-11-12T${String(6 + i).padStart(2, '0')}:30`)));
    const chips = () => page.locator('.mgrid .strip[data-sday="2026-11-12"]').count();
    const plus = () => page.locator('.mgrid .plus[data-plus="2026-11-12"]');
    expect(await chips()).toBe(6); await expect(plus()).toHaveText('+9'); // 2週は6段
    expect(near((await box(page.locator('.mgrid .strip').first())).height, 18, 0.5)).toBe(true);
    await grab(page).focus(); await page.keyboard.press('ArrowUp'); await settle(page);
    expect(await chips()).toBe(13); await expect(plus()).toHaveText('+2'); // 1週は13段
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await settle(page);
    expect(await chips()).toBe(2); await expect(plus()).toHaveText('+13'); // 月は2段
    expect(near((await box(page.locator('.mgrid .strip').first())).height, 14, 0.5)).toBe(true);
  });

  test('溝の帯（y459〜492）に止まっている文字・操作がない。つまみは溝の上の端で止まる。下の面だけスクロール', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await seed(page, Array.from({ length: 12 }, (_, i) => ev(`g${i}`, `溝${i}`, `2026-11-12T${String(8 + i).padStart(2, '0')}:00`, `2026-11-12T${String(8 + i).padStart(2, '0')}:30`)));
    const inBand = () => page.evaluate(() => [...document.querySelectorAll('#app button, #app h2, #app h3, #app .mdt')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 459 + 0.5 && r.top < 492 - 0.5 && !e.matches('.mgrab') && !e.closest('.mday'); }).map((e) => e.className || e.tagName));
    expect(await inBand()).toEqual([]);
    const h = await box(page.locator('.mgrab'));
    expect(h.y + h.height).toBeLessThanOrEqual(467 + 0.5); // 溝の上の端
    // 下の面だけがスクロールし、月は動かない
    const g0 = await box(page.locator('.mgrid'));
    await page.locator('.mday').evaluate((e) => { e.scrollTop = 200; });
    await page.waitForTimeout(100);
    expect(await box(page.locator('.mgrid'))).toEqual(g0);
    expect(await form(page)).toBe('two'); // 開いた縦は縮まない
    // 下の面の端: タブの上 8（y855）まで見える（下に 62 の余白）
    await page.locator('.mday').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    const last = await box(page.locator('.mdnote'));
    expect(last.y + last.height).toBeLessThanOrEqual(855 + 1);
    expect(await findTextOverlaps(page)).toEqual([]);
  });

  test('下の段ボタン（cpnl）は月タブに出さない。保存値 portraitShown は消さない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait669);
    await expect(page.locator('[data-act="pnltoggle"]')).toHaveCount(0);
    await expect(page.locator('.pnl')).toHaveCount(0);
    expect((await ui(page)).pages).toHaveProperty('portraitShown');
  });
});

test('開いても閉じても同じ型・同じ切り替え・同じスクロール位置で出る（閉じた⇄開いた縦を5回）', async ({ page }) => {
  await monthFormInit(page, 'two');
  await openApp(page, SIZES.closedPortrait);
  await seed(page, Array.from({ length: 16 }, (_, i) => ev(`s${i}`, `共通${i}`, `2026-11-12T${String(6 + i).padStart(2, '0')}:00`, `2026-11-12T${String(6 + i).padStart(2, '0')}:30`)));
  await tab(page, '月').click();
  await grab(page).focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); await settle(page); // 段4（2週）から段7（1週）へ
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '7');
  expect(await form(page)).toBe('one');
  // 閉じた画面は日の欄（.mday）の中だけが流れる（design/34 §6.3）。日の部分のずれ 300 を覚える
  await page.locator('.mday').evaluate((e) => { e.scrollTop = 300; });
  await page.waitForTimeout(100);
  for (let i = 0; i < 5; i++) {
    await page.setViewportSize(SIZES.openPortrait669);
    await expect.poll(() => page.evaluate(() => document.body.dataset.layout)).toBe('open');
    expect(await form(page)).toBe('one');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    expect(near(await page.locator('.mday').evaluate((e) => e.scrollTop), 300, 2)).toBe(true);
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => page.evaluate(() => document.body.dataset.layout)).toBe('browse');
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mpull')).toBeVisible();
    expect(near(await page.locator('.mday').evaluate((e) => e.scrollTop), 300, 2)).toBe(true); // 閉じた画面でも同じ位置
  }
});
