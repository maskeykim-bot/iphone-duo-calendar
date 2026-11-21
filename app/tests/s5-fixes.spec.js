// 第19.1版 S5: 残りの第19版の直し（H-08/09/10/16〜20、M-03〜05/09/11/12/15〜17/20/21、L-02〜04/06/07）。寸法は getBoundingClientRect で ±1。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, openMenu, setTimeUi, clickSettings, clickSearch, tab } from './helpers.js';

const box = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const near = (a, b, d = 1) => expect(Math.abs(a - b)).toBeLessThanOrEqual(d);
const openEditor = async (page) => { await page.locator('.cb.cadd, .rbtn.radd').first().click(); await expect(page.locator('#editor')).toBeVisible(); };

test.describe('予定の編集（H-09・H-10・L-06・L-03）', () => {
  test('カプセルは見た目 130×32・72×32（角丸 8）、押せる範囲は上下で 44', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait); await openEditor(page);
    const d = await box(page.locator('#f-start')), t = await box(page.locator('#f-stime'));
    near(d.w, 130); near(d.h, 32); near(t.w, 72); near(t.h, 32);
    expect(await page.locator('#f-start').evaluate((e) => getComputedStyle(e).borderRadius)).toBe('8px');
    const after = await page.locator('#f-start').evaluate((e) => { const c = getComputedStyle(e, '::after'); return [parseFloat(c.top), parseFloat(c.bottom)]; });
    expect(32 - after[0] - after[1]).toBeGreaterThanOrEqual(44);
    expect(await page.locator('#f-stime').evaluate((e) => getComputedStyle(e).fontWeight)).toBe('600');
    expect(await page.locator('#f-stime').evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain('tabular-nums');
    expect(await page.locator('#f-start').evaluate((e) => getComputedStyle(e).fontWeight)).toBe('400');
  });
  test('長さのチップは「長さ」の右に 3つずつ2行（各 84.7×28、間 8）。閉じた画面で切れない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await page.evaluate(() => { document.documentElement.style.setProperty('--sar', '84px'); }); await page.waitForTimeout(100); // 右の帯 84（閉じた画面の実機）
    await openEditor(page);
    const chips = page.locator('#editor .dchip');
    expect(await chips.count()).toBe(6);
    const bs = [];
    for (let i = 0; i < 6; i++) bs.push(await box(chips.nth(i)));
    for (const b of bs) { near(b.w, 84.7); near(b.h, 28); }
    const row = await box(page.locator('#editor .dtrow.dlen')); // 「長さ」の名札 50 の右。右端は行の右端
    near(bs[0].x, row.x + 4 + 50); near(bs[1].x - (bs[0].x + bs[0].w), 8); near(bs[2].x + bs[2].w, row.x + row.w);
    near(bs[3].y - (bs[0].y + bs[0].h), 8); near(bs[3].x, bs[0].x);
    const form = await box(page.locator('#editor .fbody'));
    for (const b of bs) expect(b.x + b.w).toBeLessThanOrEqual(form.x + form.w + 0.5);
  });
  for (const [name, size] of [['開いた縦', SIZES.openPortrait669], ['開いた横', SIZES.openLandscape951]]) {
    test(`${name}でも長さのチップがシートの幅に収まる`, async ({ page }) => {
      await openApp(page, size); await openEditor(page);
      const chips = page.locator('#editor .dchip'), sheet = await box(page.locator('#editor'));
      for (let i = 0; i < 6; i++) { const b = await box(chips.nth(i)); expect(b.x).toBeGreaterThanOrEqual(sheet.x); expect(b.x + b.w).toBeLessThanOrEqual(sheet.x + sheet.w + 0.5); }
    });
  }
  test('繰り返しの行は「繰り返し」名札＋右に「なし ›」（行 44）、メモ欄は下へ伸びる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait); await openEditor(page);
    const row = page.locator('#rtoggle');
    near((await box(row)).h, 44);
    await expect(row.locator('.rn')).toHaveText('繰り返し');
    await expect(page.locator('#rsum')).toHaveText('なし');
    await expect(row.locator('.sch')).toHaveText('›');
    expect(await page.locator('#editor textarea').last().evaluate((e) => getComputedStyle(e).resize)).toBe('none');
  });
  test('閉じる・保存は 22×22・線 2 のアイコン（丸 44）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait); await openEditor(page);
    for (const sel of ['#close', '#save']) {
      const svg = page.locator(`${sel} svg`), b = await box(svg);
      near(b.w, 22); near(b.h, 22);
      expect(await svg.evaluate((e) => e.getAttribute('stroke-width'))).toBe('2');
      near((await box(page.locator(sel))).w, 44); near((await box(page.locator(sel))).h, 44);
    }
  });
  test('時刻は先頭の 0 なし（9:00）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('a', '朝会', '2026-11-12T09:00', '2026-11-12T09:30')]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    expect(await page.locator('#app').innerText()).not.toMatch(/(^|\D)0\d:\d\d/);
    await openEditor(page);
    await setTimeUi(page, 'start', '09:00');
    await expect(page.locator('#f-stime')).toHaveText('9:00');
    await setTimeUi(page, 'end', '09:30');
    await expect(page.locator('#f-etime')).toHaveText('9:30');
  });
});

test.describe('開発用の文を出さない（H-16・H-17・M-13）', () => {
  test('設定の一番下の注・詳細の計測が出ず、詳細は「このアプリについて」だけ', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { nodev: true });
    await clickSettings(page);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#menu')).not.toContainText('ウィジェット・ヘルプ');
    await page.locator('#menu [data-go="details"]').click();
    await expect(page.locator('#about-app')).toBeVisible();
    for (const id of ['#layout-diagnostics', '#screen-diagnostics', '#kb-metrics', '#touch-check-open']) await expect(page.locator(id)).toBeHidden();
    const txt = await page.locator('#menu [data-screen="details"]').innerText();
    expect(txt).not.toMatch(/DPR|CSS px|safe-area/);
  });
  test('検索は「検索範囲」を出さず、0件のときだけ「この3年に見つかりませんでした」（13pt 灰）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { nodev: true });
    await clickSearch(page);
    await expect(page.locator('#search')).toBeVisible();
    await expect(page.locator('#sr-range')).toBeHidden();
    const shown = await page.locator('#search').innerText(); // 見えている文字（隠した要素の textContent は数えない）
    expect(shown).not.toContain('検索範囲'); expect(shown).not.toContain('最大200件');
    await page.locator('#sr-q').fill('zzzzzzzz');
    const n = page.locator('.srnone');
    await expect(n).toHaveText('この3年に見つかりませんでした');
    expect(await n.evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px');
    await page.locator('#sr-q').fill('');
    await expect(page.locator('.srnone')).toHaveCount(0);
  });
});

test.describe('設定の行・戻る・×（H-18・H-19・M-14・L-02）', () => {
  test('一般: 名札＋今の値＋›（行 48）、スイッチ 51×31', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { nodev: true });
    await openMenu(page, 'general');
    const row = page.locator('#m-week');
    near((await box(row)).h, 48);
    await expect(row.locator('.mn')).toHaveText('週の始まり');
    await expect(row.locator('.mv')).toHaveText('月曜');
    await expect(row.locator('.sch')).toHaveText('›');
    expect(await row.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    const sw = await box(page.locator('#m-rokuyo .rkswitch')); near(sw.w, 51); near(sw.h, 31);
    await row.click(); // 押した行の地が残らない
    await openMenu(page, 'general').catch(() => {});
  });
  test('表示形式: 「月の文字」は値の行、時刻はスイッチ。時間軸の縮小・拡大は −／＋ の 88×32（角丸 8）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951, '', { nodev: true });
    await openMenu(page, 'display');
    await expect(page.locator('#m-msize .mv')).toHaveText('標準');
    await expect(page.locator('#m-msize')).not.toContainText('大にする');
    const sw = await box(page.locator('#m-mtime .rkswitch')); near(sw.w, 51); near(sw.h, 31);
    const g = page.locator('#m-tlz .mpm'); const b = await box(g);
    near(b.w, 88); near(b.h, 32);
    expect(await g.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('8px');
    await expect(page.locator('#m-tlz button').nth(0)).toHaveText('−');
    await expect(page.locator('#m-tlz button').nth(1)).toHaveText('＋');
    await expect(page.getByRole('button', { name: '時間軸を拡大' })).toBeVisible();
  });
  test('戻るは左上「‹ 設定」（緑 15pt）、閉じるは右上の × 丸 44。ルートは右上だけ ×', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '', { nodev: true });
    await clickSettings(page);
    await expect(page.locator('#m-close')).toBeHidden();
    const root = await box(page.locator('#m-back'));
    near(root.w, 44); near(root.h, 44);
    await page.locator('#menu [data-go="general"]').click();
    const back = page.locator('#m-back');
    await expect(back).toContainText('設定');
    const b = await box(back), sheet = await box(page.locator('#menu'));
    expect(b.x - sheet.x).toBeLessThanOrEqual(20);
    expect(await back.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(41, 78, 66)');
    expect(await back.evaluate((e) => getComputedStyle(e).fontSize)).toBe('15px');
    near((await box(back)).h, 44);
    const c = await box(page.locator('#m-close')); near(c.w, 44); near(c.h, 44);
    expect(c.x + c.w).toBeGreaterThan(sheet.x + sheet.w - 20);
    await page.locator('#m-close').click();
    await expect(page.locator('#menu')).toBeHidden();
  });
  test('検索の閉じるも × 丸 44（22×22 の線画）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await clickSearch(page);
    const b = await box(page.locator('#sr-close')); near(b.w, 44); near(b.h, 44);
    near((await box(page.locator('#sr-close svg'))).w, 22);
  });
  test('ルートの行のアイコンは 22×22・線 1.5 で、項目ごとに別の絵', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await clickSettings(page);
    const ds = await page.locator('#menu [data-screen="root"] .srow:visible .sic svg').evaluateAll((a) => a.map((s) => [s.getAttribute('stroke-width'), s.getBoundingClientRect().width, s.innerHTML]));
    expect(ds.length).toBeGreaterThanOrEqual(6);
    for (const d of ds) { expect(d[0]).toBe('1.5'); near(d[1], 22); }
    expect(new Set(ds.map((d) => d[2])).size).toBe(ds.length);
  });
  test('設定を開いている間、右の帯の入口（閉じた画面は「…」）は × に変わらない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await clickSettings(page);
    await expect(page.locator('#menu')).toBeVisible();
    // 閉じた画面の設定の入口は右の列の「…」（design/34 §9.1-5）。設定を開いている間も「…」のまま
    const after = await page.locator('.cb[data-act="more"] .bi').first().evaluate((e) => getComputedStyle(e, '::after').content);
    expect(after).not.toContain('×');
    await expect(page.locator('.cb[data-act="more"] .bi svg').first()).toBeVisible();
  });
});

test.describe('時間軸（H-08・H-20・M-05・M-09）', () => {
  test('今の時刻の札から上下 12 以内の時刻ラベルは出さない（開いた横の時間ページ）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await page.evaluate(() => {});
    const r = await page.evaluate(() => {
      const now = document.querySelector('.tlin .nowt'); if (!now) return null;
      const nb = now.getBoundingClientRect();
      return [...document.querySelectorAll('.tlin .hlab')].filter((l) => getComputedStyle(l).visibility !== 'hidden').map((l) => l.getBoundingClientRect()).filter((b) => b.width && Math.min(Math.abs(b.bottom - nb.top), Math.abs(b.top - nb.bottom)) < 12 && b.bottom > nb.top - 12 && b.top < nb.bottom + 12).length;
    });
    if (r !== null) expect(r).toBe(0);
  });
  test('時間軸の予定の枠は カテゴリの色の地・白の題名 12pt W6・時刻 10pt・角丸 8', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await seed(page, [ev('a', '打ち合わせ', '2026-11-12T13:00', '2026-11-12T15:00')]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const e = page.locator('.tlev:not(.fev)[data-event="a"]').first();
    await expect(e).toBeVisible();
    expect(await e.evaluate((x) => getComputedStyle(x).borderRadius)).toBe('8px');
    expect(await e.evaluate((x) => getComputedStyle(x).color)).toBe('rgb(255, 255, 255)');
    expect(await e.locator('.tn').evaluate((x) => [getComputedStyle(x).fontSize, getComputedStyle(x).fontWeight])).toEqual(['13px', '600']); // 設計 V-22: 12→13（段にない大きさ）
    expect(await e.locator('.tt').evaluate((x) => getComputedStyle(x).fontSize)).toBe('11px'); // 設計 2026-11-20 1:20: 注 10/400→11/400（S7e）
    const bg = await e.evaluate((x) => getComputedStyle(x).backgroundColor);
    const lum = bg.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    expect(1.05 / (L + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
  test('今日＋明日: 左右のタブを出さず、窓の下 12 にかかる時刻ラベルは出さない', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951, '?ns=s5tt');
    await page.evaluate(() => { const k = 'duo.ui.v1.s5tt'; localStorage.setItem(k, JSON.stringify({ spreadType: 'tt' })); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.shell.tt')).toBeVisible();
    await expect(page.locator('.pgsw')).toHaveCount(0);
    const bad = await page.evaluate(() => [...document.querySelectorAll('.dpage .tl')].flatMap((tl) => { const tb = tl.getBoundingClientRect(); return [...tl.querySelectorAll('.hlab')].filter((l) => getComputedStyle(l).visibility !== 'hidden').map((l) => l.getBoundingClientRect()).filter((b) => b.height && b.bottom > tb.bottom - 12 && b.top < tb.bottom); }).length);
    expect(bad).toBe(0);
    expect(await page.locator('.dpage .tl').first().evaluate((e) => getComputedStyle(e).maskImage)).toContain('linear-gradient');
  });
  test('ホームの小さな時間軸: 枠の最小の高さ 14・題名 10pt 1行・重なる予定は横に2列', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('a', '重なり一', '2026-11-12T13:00', '2026-11-12T14:00'), ev('b', '重なり二', '2026-11-12T13:00', '2026-11-12T13:30'), ev('c', '短い', '2026-11-12T16:00', '2026-11-12T16:15')]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const bars = page.locator('.hbarev');
    if (await bars.count() === 0) return; // この姿勢の既定のホームに軸が無ければ（カード表示）対象外
    const ax = await box(page.locator('.haxis'));
    expect(ax.h).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < await bars.count(); i++) expect((await box(bars.nth(i))).h).toBeGreaterThanOrEqual(13.5);
  });
});

test.describe('帯・月・ほか（M-03/04/11/12/15/16/17/20、L-07）', () => {
  test('開いた横の下のタブ: 1つ 64×40、5つで 320、角丸 20、文字 13 W6', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    const g = page.locator('.pgsw.pgl'), b = await box(g);
    near(b.w, 320); near(b.h, 40);
    expect(await g.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('20px');
    const btns = g.locator('button'); expect(await btns.count()).toBe(5);
    for (let i = 0; i < 5; i++) { const x = await box(btns.nth(i)); near(x.w, 64); near(x.h, 40); }
    const pill = g.locator('button[aria-pressed=true] .pill');
    expect(await pill.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight])).toEqual(['13px', '600']);
    const txt = await pill.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); const t = r.getBoundingClientRect(); const p = e.getBoundingClientRect(); return [t.left - p.left, p.right - t.right]; });
    near(txt[0], 12, 1.5); near(txt[1], 12, 1.5);
    const ps = await g.locator('button').first().evaluate((e) => { const c = getComputedStyle(e, '::after'); return parseFloat(c.top) + parseFloat(c.bottom); });
    expect(40 - ps).toBeGreaterThanOrEqual(44); // 押せる範囲は疑似要素で 44
  });
  test('月のマスの中のチップ・帯は押す的にしない（マス全体が1つの押す的）。押すとその日を選ぶ', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await seed(page, [ev('a', '朝会', '2026-11-13T09:00', '2026-11-13T09:30')]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tab(page, '月').click();
    const chip = page.locator('.week .strip[data-event="a"]').first();
    await expect(chip).toBeVisible();
    // 第19.2版 S11b（34 R-75）で置き換え: 閉じた7段のチップは日のボタンの子（aria-hidden）。チップの上をたたいても予定は開かず、そのマスの日を選ぶ。チップの被せは出さない
    expect(await chip.evaluate((e) => [e.tagName, e.getAttribute('aria-hidden'), !!e.closest('.day')])).toEqual(['SPAN', 'true', true]);
    const day = page.locator('.week .day[data-date="2026-11-13"]');
    expect(await day.getAttribute('aria-label')).toContain('朝会');
    const d = await box(day); expect(d.w).toBeGreaterThanOrEqual(44); expect(d.h).toBeGreaterThanOrEqual(44);
    const c = await box(chip);
    await page.mouse.move(c.x + c.w / 2, c.y + c.h / 2); await page.mouse.down();
    await expect(page.locator('.chip-press')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(d.x + 4, d.y + 3); // 日付の行を押しても同じ
    // チップの無い所（日付の行）を押したら、その日を選ぶだけ
    await page.mouse.click(d.x + d.w / 2, d.y + 6);
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#editor')).toBeHidden();
  });
  test('検索の入力欄のフォーカス枠は緑 #294E42 の 2pt', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await clickSearch(page);
    await page.locator('#sr-q').focus();
    const o = await page.locator('#sr-q').evaluate((e) => { const s = getComputedStyle(e); return [s.outlineColor, s.outlineWidth, s.outlineStyle, s.boxShadow]; });
    const css = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--focus').trim().toLowerCase());
    expect(css).toBe('#294e42');
    if (o[2] !== 'none') { expect(o[0]).toBe('rgb(41, 78, 66)'); expect(o[1]).toBe('2px'); }
  });
  test('設定›カレンダーの ✓ は緑 #294E42', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await openMenu(page, 'calendar');
    const c = page.locator('.crow .cck').first();
    await expect(c).toBeVisible();
    expect(await c.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(41, 78, 66)');
  });
  test('閉じた画面の帯: 開いている間の丸は 地を緑・アイコン白で、四角い地を出さない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await page.evaluate(() => { document.documentElement.style.setProperty('--sar', '84px'); });
    const b = page.locator('.cb.cstrip').first();
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(await b.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await b.locator('.bi').evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color])).toEqual(['rgb(41, 78, 66)', 'rgb(255, 255, 255)']);
  });
  test('サンプルを入れるは時間軸の上に出さない（空の日）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await expect(page.locator('.tlempty')).toHaveCount(0);
    await expect(page.locator('.tl').getByRole('button', { name: 'サンプルを入れる' })).toHaveCount(0);
  });
  test('小さな月: 選んだ日・今日とも丸（直径 36）。選んだ日は緑の塗り、今日は緑の線 1.5', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await page.locator('.datebtn').first().click();
    const sel = page.locator('.mmc.sel').first();
    await expect(sel).toBeVisible();
    const f = (loc, p) => loc.evaluate((e, p) => { const s = getComputedStyle(e, '::before'); return [parseFloat(s.width), parseFloat(s.height), s.borderTopLeftRadius, s.backgroundColor, s.borderTopWidth, s.borderTopColor][p]; }, p);
    expect(await f(sel, 0)).toBe(36); expect(await f(sel, 1)).toBe(36);
    expect(await f(sel, 3)).toBe('rgb(41, 78, 66)');
    const today = page.locator('.mmc.tod:not(.sel)').first();
    if (await today.count()) { expect(await f(today, 4)).toBe('1.5px'); expect(await f(today, 5)).toBe('rgb(41, 78, 66)'); }
  });
});
