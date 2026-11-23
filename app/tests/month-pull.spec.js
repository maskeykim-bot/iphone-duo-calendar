import { test, expect } from '@playwright/test';
import { openApp, seed, ev, tab, SIZES, monthFormInit, findTextOverlaps, setStyle } from './helpers.js';
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
    await expect(page.locator('#ctitle')).toHaveText('2026年11月'); // design/34 §2.1「2026年11月」（設計レビュー 7c9fb05 D3: 年と月の間をあけない）
    await expect(page.locator('.mptoday')).toBeHidden(); // 「今日へ」は今日が画面にないときだけ出る（design/34 §2.1。旧: いつも「今日」）
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
    await expect(page.locator('.shell.closed.cal .mpull.browse')).toHaveCount(1); // 日表示へは進まない（下のタブはない。カレンダーのまま。design/34 §9.1-9）
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
    await expect(page.locator('#ctitle')).toHaveText('2026年12月');
  });

  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 前→後: 「日の欄の中だけが流れ、格子は動かない。見出しの右の日付は出さない」→「画面（.mpull.browse）が1本で流れ、格子も月ごと上へ流れる（縮まない）。流れ切ったら見出しの右に選んだ日（design/33 §2）」。固定は見出し 44＋曜日 20 のまま
  test('画面が1本で流れ、格子は月ごと流れる・縮まない（段1・4・7。v19.3）。固定は見出し 44＋曜日 20', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, Array.from({ length: 14 }, (_, i) => ev(`m${i}`, `長い日${i}`, `2026-11-12T${String(8 + i).padStart(2, '0')}:00`, `2026-11-12T${String(8 + i).padStart(2, '0')}:30`)));
    await tab(page, '月').click();
    await band(page);
    const md = page.locator('.mpull.browse');
    for (const [n, H] of [[1, 516], [4, 172], [7, 86]]) {
      await grab(page).focus();
      for (let i = 0; i < 8 && Number(await page.locator('.mpull').getAttribute('data-stage')) !== n; i++) { await page.keyboard.press(Number(await page.locator('.mpull').getAttribute('data-stage')) < n ? 'ArrowUp' : 'ArrowDown'); }
      await settle(page);
      await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n));
      await md.evaluate((e) => { e.scrollTop = 0; });
      const g0 = await box(page.locator('.mgrid'));
      await md.evaluate((e) => { e.scrollTop = e.scrollHeight; });
      await page.waitForTimeout(250);
      const st = await md.evaluate((e) => e.scrollTop); expect(st).toBeGreaterThanOrEqual(H); // 格子を流し切れる
      const g1 = await box(page.locator('.mgrid')); expect(near(g1.y, g0.y - st) && near(g1.x, g0.x) && near(g1.width, g0.width) && near(g1.height, g0.height)).toBe(true); // 格子は送った分だけ上へ流れる
      expect(near(await gridH(page), H)).toBe(true); // 縮まない
      expect(await page.locator('.mday').evaluate((e) => e.scrollTop), '日の欄の中は流れない').toBe(0);
      const mph = await box(page.locator('.mph')), wd = await box(page.locator('.weekdays'));
      expect(near(mph.y, 0) && near(mph.height, 44) && near(wd.y, 44) && near(wd.height, 20)).toBe(true);
      await expect(page.locator('.mph.scrd .mpdate')).toHaveText('12日（木）'); // 格子が流れ切ったら見出しの右に選んだ日（design/33 §2）
      expect((await ui(page)).stage ?? 1).toBe(n); // 段1は既定（まだ動かしていなければ保存はない）
      await md.evaluate((e) => { e.scrollTop = 0; });
    }
  });

  test('閉じた画面の月（段1。design/34 §2.2 で置き換え）: 日の見出し y604〜648（17/600）、日の欄は（スクロール 0 で）y604〜678、一番下の余白 41。タブとその上のぼかしはない', async ({ page }) => {
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
    expect(await md.locator('.mdin').evaluate((e) => getComputedStyle(e).paddingBottom)).toBe('41px'); // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 下の余白は日の欄の中身の箱 .mdin が持つ（.mday は中でスクロールしない。前: .mday → 後: .mday .mdin）
    // 34 §6.1・§9.1-9（S11c）: 下のタブと、その上 24（y575〜599）のぼかしは閉じた画面にない
    await expect(page.locator('.tabs')).toHaveCount(0);
    expect(await page.locator('.tabfade').evaluateAll((es) => es.filter((e) => getComputedStyle(e).display !== 'none').length)).toBe(0);
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

  // 第19.2版 S11d（design/34 §5「覚えておくもの」・設計レビュー 7c9fb05 M8・品質レビュー 7c9fb05 中）: S11b の「段は保存しない（開くたびにカード）」は仕様と逆だったので戻す。
  // 日の欄のつまみの段（A カード／B 時間軸／C 時間軸・広い）は覚える。日を選び直しても、読み込み直しのあとも同じ。保存値が 0〜2 の整数でなければカード。
  test('日の欄のつまみ（下）で 時間軸（34 §6.2）: 1時間 44 で今の時刻に赤い線。日の欄の下にタスクはなく、ノートがある。段は覚える（日を選び直しても・読み込み直しても同じ。34 §5・M8）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seedTasks(page, [T('t1', { title: '十二日が期限', due: { date: '2026-11-12' } }), T('t2', { title: '別の日', due: { date: '2026-11-20' } })]);
    await tab(page, '月').click();
    await expect(page.locator('.mdtask')).toHaveCount(0); // 34 §9.1 の 11: 日の欄の下のタスクは出さない（右の列の「タスク」へ）
    await expect(page.locator('.mdnl')).toBeVisible(); await expect(page.locator('.mdnote')).toBeVisible(); // 「ノート ›」と下の欄
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A'); // 初めはカード
    await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowDown'); // つまみ（下）を下へ＝時間軸（キーでも同じ）
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
    const hs = await page.locator('.mday .hlab').evaluateAll((e) => e.slice(0, 3).map((x) => x.getBoundingClientRect().top));
    expect(near(hs[1] - hs[0], 44, 0.6)).toBe(true);
    await expect(page.locator('.mday .nowl')).not.toHaveAttribute('hidden', ''); // 今日の線
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).dayGrip)).toBe(1); // UI_KEY に保存（IndexedDB・バックアップの版6は変えない）
    await page.locator('.mgrid .day[data-date="2026-11-18"]').click({ position: { x: 30, y: 70 } }); await page.waitForTimeout(400);
    await expect(page.locator('.mdh .hdt')).toHaveText('11月18日');
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B'); // 日を選び直しても時間軸のまま
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B'); // 読み込み直しても時間軸のまま
    await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowDown'); // 時間軸・広い
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'C');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'C');
    const hs2 = await page.locator('.mday .hlab').evaluateAll((e) => e.slice(0, 3).map((x) => x.getBoundingClientRect().top));
    expect(near(hs2[1] - hs2[0], 88, 0.6)).toBe(true); // C は1時間 88
    await page.locator('.mdback').click(); // 見出しの右の「カード」
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'A');
    for (const bad of [3, -1, 1.5, '1', null, true]) { // 0〜2 の整数でない保存値はカードへ戻す
      await page.evaluate((v) => { const k = 'duo.ui.v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k)), dayGrip: v })); }, bad);
      await page.reload(); await page.waitForSelector('html[data-ready]');
      await expect(page.locator('.mday'), `dayGrip=${JSON.stringify(bad)}`).toHaveAttribute('data-dg', 'A');
    }
  });

  test('「全部」の月は従来のまま。「…」→「月の表現」で入り・戻る（design/34 §9.1-2: 見出しの「全部」は消えた）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await expect(page.locator('.mph [data-act="allmonth"]')).toHaveCount(0);
    await setStyle(page, '全部');
    await expect(page.locator('.scroll.all')).toBeVisible();
    await expect(page.locator('.mpull')).toHaveCount(0);
    await expect(page.locator('.chead [data-act="allmonth"]')).toHaveCount(0);
    await setStyle(page, '予定名');
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
  // S11d（34 §5・M8・品質レビュー 7c9fb05 中）: 日の欄を時間軸にする。S11b で外した時間軸の確かめを戻す（閉じた画面の段はつまみ（下）。開いた縦の「予定｜時間軸」とは別に覚える）
  await page.locator('.mdgrab').focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦は日の欄の中でスクロールしない（画面の1本。位置は覚えない）。前→後: 「閉じた画面で日の欄を 300 送り、開いた縦と同じ位置で出る」→「開いた縦で日の部分を 300 送る（1回目）。閉じる⇄開くのあとも開いた縦は同じ位置、閉じた縦はいつも一番上（日の欄の中も画面も 0）」。型・日・段・日の欄の段が同じなのは変えない
  for (let i = 0; i < 5; i++) {
    await page.setViewportSize(SIZES.openPortrait669);
    await expect.poll(() => page.evaluate(() => document.body.dataset.layout)).toBe('open');
    expect(await form(page)).toBe('one');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    if (i === 0) { await page.locator('.mday').evaluate((e) => { e.scrollTop = 300; }); await page.waitForTimeout(100); }
    expect(near(await page.locator('.mday').evaluate((e) => e.scrollTop), 300, 2)).toBe(true);
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => page.evaluate(() => document.body.dataset.layout)).toBe('browse');
    await expect(page.locator('.shell.closed.cal')).toHaveCount(1); // 下のタブはない（design/34 §9.1-9）。カレンダーのまま
    await expect(page.locator('.mpull')).toBeVisible();
    await expect(page.locator('.mpull')).toHaveAttribute('data-stage', '7'); // 段も
    await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B'); // 日の欄の段（時間軸）も、閉じる⇄開くのあと同じ
    expect(await page.evaluate(() => document.querySelector('.mday').scrollTop + document.querySelector('.mpull.browse').scrollTop)).toBe(0); // 閉じた縦はいつも一番上から（v19.3）
  }
});
