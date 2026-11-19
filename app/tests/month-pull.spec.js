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
  test.beforeEach(async ({ page }) => { await monthFormInit(page, 'two'); });

  test('初めは「2週」と「予定」。見出し・曜日 20・2行×80・つまみ 24（36×4）・日の部分がつながる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    expect(await form(page)).toBe('two');
    await expect(page.locator('[data-mday="list"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ctitle')).toHaveText('2026年 11月');
    await expect(page.locator('.mptoday')).toHaveText('今日');
    const wd = await box(page.locator('.weekdays')), g = await box(page.locator('.mgrid')), h = await box(page.locator('.mgrab')), i = await box(page.locator('.mgrab i')), d = await box(page.locator('.mday'));
    expect(near(wd.height, 20)).toBe(true);
    expect(near(g.y, wd.y + wd.height) && near(g.height, 160)).toBe(true);
    expect(near(h.y, g.y + g.height) && near(h.height, 24)).toBe(true);
    expect(near(i.width, 36) && near(i.height, 4)).toBe(true);
    expect(near(d.y, h.y + h.height)).toBe(true);
    // 見る週は選んだ日（11/12）を含む週から。2週は 11/9〜11/22
    const days = await page.locator('.mgrid .day').evaluateAll((e) => e.map((x) => x.dataset.date));
    expect(days[0]).toBe('2026-11-09'); expect(days.length).toBe(14); expect(days[13]).toBe('2026-11-22');
    for (const r of await page.locator('.mgrid .week').all()) expect(near((await box(r)).height, 80)).toBe(true);
    await expect(page.locator('.mdh h3')).toContainText('11月12日（木）');
  });

  test('1週は1行80で4件、2週は2行80で4件、月は6行64で2件。+N は日付の行の右（段は全部名前に使う）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, FIVE);
    await tab(page, '月').click();
    await band(page);
    const chips = () => page.locator('.mgrid .strip[data-sday="2026-11-12"]').count();
    const plus = () => page.locator('.mgrid .plus[data-jump="2026-11-12"]');
    // 2週: 4段が全部名前（4件＋「+1」）。+N は日付の行（上 18）の右、8pt W6 #68716A、右 2、押せる 44×44
    expect(await chips()).toBe(4); await expect(plus()).toHaveText('+1');
    const pl = await plus().evaluate((e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(), d = e.parentElement.querySelector('[data-date="2026-11-12"]').getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(e); const t = g.getBoundingClientRect(); return { fs: parseFloat(s.fontSize), fw: Number(s.fontWeight), color: s.color, w: r.width, h: r.height, top: r.top - d.top, right: d.right - t.right, tb: t.bottom - d.top }; });
    expect(pl.fs).toBe(8); expect(pl.fw).toBeGreaterThanOrEqual(600); expect(pl.color).toBe('rgb(104, 113, 106)');
    expect(near(pl.w, 44, 0.6) && near(pl.h, 44, 0.6) && near(pl.top, 0, 0.6)).toBe(true);
    expect(near(pl.right, 2, 0.6)).toBe(true); expect(pl.tb).toBeLessThanOrEqual(18.5);
    // 4件の段は 18 から 15 おき（日付の行の下）
    const tops = await page.locator('.mgrid .strip[data-sday="2026-11-12"]').evaluateAll((es) => es.map((e) => e.getBoundingClientRect().top - e.closest('.week').getBoundingClientRect().top));
    expect(near(tops[0], 18, 1.2) && near(tops[3] - tops[0], 45, 0.6)).toBe(true);
    // 1週
    await grab(page).focus(); await page.keyboard.press('ArrowUp'); await settle(page);
    expect(await form(page)).toBe('one');
    expect(near(await gridH(page), 80)).toBe(true);
    expect(await chips()).toBe(4); await expect(plus()).toHaveText('+1');
    // 月（6行×64＝384、y68〜452。名前 2件、+N は日付の行）
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await settle(page);
    expect(await form(page)).toBe('month');
    expect(near(await gridH(page), 384)).toBe(true);
    expect(await chips()).toBe(2); await expect(plus()).toHaveText('+3');
    expect(await page.locator('.mgrid .week').count()).toBe(6);
    for (const r of await page.locator('.mgrid .week').all()) expect(near((await box(r)).height, 64)).toBe(true);
    const g = await box(page.locator('.mgrid')); expect(near(g.y, 68) && near(g.x, 8) && near(g.width, 366)).toBe(true); // 格子 x8〜374（H-21）
    expect(near((await box(page.locator('.mgrid .day').first())).width, 52.3, 0.2)).toBe(true);
    const tops2 = await page.locator('.mgrid .strip[data-sday="2026-11-12"]').evaluateAll((es) => es.map((e) => e.getBoundingClientRect().top - e.closest('.week').getBoundingClientRect().top));
    expect(near(tops2[0], 18, 1.2) && near(tops2[1] - tops2[0], 18, 0.6)).toBe(true);
  });

  test('4件ちょうどは全部出る（+n なし）。5件目から「+n」', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, FIVE.slice(0, 4));
    await tab(page, '月').click();
    expect(await page.locator('.mgrid .strip[data-sday="2026-11-12"]').count()).toBe(4);
    await expect(page.locator('.mgrid .plus[data-jump="2026-11-12"]')).toHaveCount(0);
  });

  test('つまみを引くと月の高さが指に付いてくる。離すと一番近い型へ 0.25 秒で寄り、保存される。たたきは何もしない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    // たたき
    const b = await box(page.locator('.mgrab i'));
    await page.mouse.click(b.x + 18, b.y + 2);
    await settle(page);
    expect(await form(page)).toBe('two');
    // 途中（+160 で 320 の高さ）→ 離すと 384 へ（一番近い型）
    const x = b.x + 18, y = b.y + 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 160, { steps: 6 });
    expect(near(await gridH(page), 320, 2)).toBe(true); // 160 + 160（指に付いてくる）
    await page.mouse.up();
    await page.waitForTimeout(60);
    const mid = await gridH(page);
    expect(mid).toBeGreaterThan(320 - 0.5); expect(mid).toBeLessThanOrEqual(384 + 0.5);
    await settle(page);
    expect(near(await gridH(page), 384)).toBe(true);
    expect(await form(page)).toBe('month');
    expect((await ui(page)).monthForm).toBe('month');
    // 上へ引くと 1週へ
    await pull(page, -400); await settle(page);
    expect(await form(page)).toBe('one');
    expect(near(await gridH(page), 80)).toBe(true);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await form(page)).toBe('one'); // 型は覚える
  });

  test('月の日をたたくと下の日の部分が変わる。画面（月の部分）は動かない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('x1', '十八日の会議', '2026-11-18T10:00', '2026-11-18T11:00'), ...FIVE.slice(0, 1)]);
    await tab(page, '月').click();
    const g0 = await box(page.locator('.mgrid')), d0 = await box(page.locator('.mday'));
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 12, y: 10 } }); // 2行目の日
    await expect(page.locator('[data-date="2026-11-18"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mdh h3')).toContainText('11月18日（水）');
    await expect(page.locator('.mdlist .mdev')).toHaveText([/10:00\s*十八日の会議/]);
    expect(await box(page.locator('.mgrid'))).toEqual(g0);
    expect(await box(page.locator('.mday'))).toEqual(d0);
    expect(((await page.locator('.mgrid .day').first().getAttribute('data-date')))).toBe('2026-11-09'); // 見る週は動かない
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true'); // 日表示へは進まない
  });

  test('前・次と左右のスワイプは 1週ずつ（月の型は1か月ずつ）。今日で選んだ日が戻る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await page.locator('[data-act="next"]').first().click();
    await expect(page.locator('[data-date="2026-11-19"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.mgrid .day').first().getAttribute('data-date')).toBe('2026-11-16');
    await page.locator('.mptoday').click();
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.mgrid .day').first().getAttribute('data-date')).toBe('2026-11-09');
    await grab(page).focus(); await page.keyboard.press('ArrowDown'); await settle(page);
    await page.locator('[data-act="next"]').first().click();
    await expect(page.locator('#ctitle')).toHaveText('2026年 12月');
  });

  test('画面を1本でスクロールしても月は縮まない（1週・2週・月どの型でも）。固定は見出し 48＋曜日 20 だけ。月が流れ切ると見出しの右に「19日（木）」', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, Array.from({ length: 14 }, (_, i) => ev(`m${i}`, `長い日${i}`, `2026-11-12T${String(8 + i).padStart(2, '0')}:00`, `2026-11-12T${String(8 + i).padStart(2, '0')}:30`)));
    await tab(page, '月').click();
    await band(page);
    const sc = page.locator('.mpull');
    const date = page.locator('.mph .mpdate');
    for (const f of ['two', 'one', 'month']) {
      if (f === 'one') { await grab(page).focus(); await page.keyboard.press('ArrowUp'); await settle(page); }
      if (f === 'month') { await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await settle(page); }
      expect(await form(page)).toBe(f);
      const H = { one: 80, two: 160, month: 384 }[f];
      await sc.evaluate((e) => { e.scrollTop = 0; });
      await expect(date).toHaveCSS('opacity', '0');
      await sc.evaluate((e, y) => { e.scrollTop = y; }, Math.round(H / 2));
      await page.waitForTimeout(250);
      expect(near(await gridH(page), H)).toBe(true); // 縮まない
      await expect(page.locator('.mgrid .week')).toHaveCount({ one: 1, two: 2, month: 6 }[f]);
      // 固定は見出し 48（y0〜48）と曜日の行 20（y48〜68）だけ
      const mph = await box(page.locator('.mph')), wd = await box(page.locator('.weekdays'));
      expect(near(mph.y, 0) && near(mph.height, 48) && near(wd.y, 48) && near(wd.height, 20)).toBe(true);
      await expect(date).toHaveCSS('opacity', '0'); // 月がまだ見えている
      await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
      await page.waitForTimeout(300);
      expect(near(await gridH(page), H)).toBe(true);
      await expect(date).toHaveCSS('opacity', '1'); // 月が流れ切った
      await expect(date).toHaveText('12日（木）'); // 今見ている日（このテストの時計は 11/12）
      expect((await ui(page)).monthForm).toBe(f);
      // 上へ戻すと月がそのまま見え、日の表示は消える
      await sc.evaluate((e) => { e.scrollTop = 0; });
      await page.waitForTimeout(300);
      await expect(date).toHaveCSS('opacity', '0');
      expect(await form(page)).toBe(f);
    }
  });

  test('閉じた画面の月（型「月」）: スクロール0で日の見出しと予定1件目が y476〜564、日の部分の最小 523、一番下の余白 87、タブの上 24 のぼかし', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, FIVE.slice(0, 1));
    await page.addInitScript(() => localStorage.setItem('duo.ui.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'), monthForm: 'month', monthDay: 'list' })));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    await band(page);
    const g = await box(page.locator('.mgrid')), gr = await box(page.locator('.mgrab')), dh = await box(page.locator('.mdh')), ev1 = await box(page.locator('.mdev').first());
    expect(near(g.y, 68) && near(g.height, 384)).toBe(true);
    expect(near(gr.y, 452) && near(gr.height, 24)).toBe(true); // つまみ y452〜476
    expect(near(dh.y, 476) && near(dh.height, 44)).toBe(true);
    expect(near(ev1.y, 520) && near(ev1.height, 44)).toBe(true); // 予定1件目 y520〜564
    expect(ev1.y + ev1.height).toBeLessThanOrEqual(599);
    // 「予定｜時間軸」: 見た目 132×32、1つ 66、押せる 44
    const sw = await box(page.locator('.mdsw')), b1 = await box(page.locator('.mdsw button').first());
    expect(near(sw.width, 132) && near(sw.height, 32)).toBe(true);
    expect(near(b1.width, 66) && near(b1.height, 44)).toBe(true);
    // 日の部分の最小の高さ 523（予定の少ない日でも）。一番下の余白 87
    expect((await box(page.locator('.mday'))).height).toBeGreaterThanOrEqual(523 - 0.5);
    const sc = page.locator('.mpull');
    await sc.evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(200);
    const dd = await box(page.locator('.mday')), pe = await box(page.locator('.mpend')), tabs = await box(page.locator('.tabs'));
    expect(near(dd.y, 68) && near(dd.y + dd.height, 591)).toBe(true); // 流し切ると日の部分が y68〜591
    expect(near(pe.height, 87)).toBe(true);
    expect(near(pe.y, 591)).toBe(true); // 最後の行はタブの上 8（y591）まで
    expect(near(tabs.y - 8, 591)).toBe(true);
    // タブの上 24（y575〜599）に地色の 0→100% のぼかし
    const fade = await page.locator('.tabfade').evaluate((e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { y: r.top, h: r.height, bg: s.backgroundImage, pe: s.pointerEvents }; });
    expect(near(fade.y, 575) && near(fade.h, 24)).toBe(true);
    expect(fade.bg).toContain('rgba(247, 244, 237, 0)'); expect(fade.bg).toContain('rgb(247, 244, 237)');
    expect(fade.pe).toBe('none');
  });

  test('月の日をたたくと下の日の部分がその日になる。日の部分がすでに上にあるときは画面を動かさない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('x1', '十八日の会議', '2026-11-18T10:00', '2026-11-18T11:00'), ...FIVE.slice(0, 1)]);
    await tab(page, '月').click();
    await band(page);
    const sc = page.locator('.mpull');
    await sc.evaluate((e) => { e.scrollTop = 70; }); // 月の2行目が見出しの下に見えている
    await page.waitForTimeout(150);
    const y0 = await sc.evaluate((e) => e.scrollTop);
    await page.locator('[data-date="2026-11-18"]').click({ position: { x: 12, y: 70 } });
    await expect(page.locator('.mdh h3')).toContainText('11月18日（水）');
    expect(await sc.evaluate((e) => e.scrollTop)).toBe(y0);
  });

  test('「予定｜時間軸」: 1時間 44 で今の時刻に赤い線。型とともに保存される。下にタスクとノート', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seedTasks(page, [T('t1', { title: '十二日が期限', due: { date: '2026-11-12' } }), T('t2', { title: '別の日', due: { date: '2026-11-20' } })]);
    await tab(page, '月').click();
    await expect(page.locator('.mdtask')).toHaveCount(1);
    await expect(page.locator('.mdtask')).toContainText('十二日が期限');
    await expect(page.locator('.mdnotes')).toBeVisible();
    await page.locator('[data-mday="time"]').click();
    await expect(page.locator('[data-mday="time"]')).toHaveAttribute('aria-pressed', 'true');
    const hs = await page.locator('.mday .hlab').evaluateAll((e) => e.slice(0, 3).map((x) => x.getBoundingClientRect().top));
    expect(near(hs[1] - hs[0], 44, 0.6)).toBe(true);
    await expect(page.locator('.mday .nowl')).not.toHaveAttribute('hidden', ''); // 今日の線
    expect((await ui(page)).monthDay).toBe('time');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('[data-mday="time"]')).toHaveAttribute('aria-pressed', 'true');
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
    const plus = () => page.locator('.mgrid .plus[data-jump="2026-11-12"]');
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
  await grab(page).focus(); await page.keyboard.press('ArrowUp'); await settle(page); // 1週
  expect(await form(page)).toBe('one');
  await page.locator('[data-mday="time"]').click();
  // 閉じた画面は .mpull が1本のスクロール（1週は月の部分 80＋つまみ 24 の先から日の部分）。日の部分のずれ 300 を覚える
  await page.locator('.mpull').evaluate((e) => { e.scrollTop = 80 + 24 + 300; });
  await page.waitForTimeout(100);
  for (let i = 0; i < 5; i++) {
    await page.setViewportSize(SIZES.openPortrait669);
    await expect.poll(() => page.evaluate(() => document.body.dataset.layout)).toBe('open');
    expect(await form(page)).toBe('one');
    await expect(page.locator('[data-mday="time"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-date="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true');
    expect(near(await page.locator('.mday').evaluate((e) => e.scrollTop), 300, 2)).toBe(true);
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => page.evaluate(() => document.body.dataset.layout)).toBe('browse');
    await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mpull')).toBeVisible();
    expect(near(await page.locator('.mpull').evaluate((e) => e.scrollTop), 80 + 24 + 300, 2)).toBe(true); // 閉じた画面でも同じ位置
  }
});
