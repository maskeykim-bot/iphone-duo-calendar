import { test, expect } from '@playwright/test';
import { monthFormInit, openApp, loadSample, addEvent, tab, layout, findTextOverlaps, pickDay, modeStates, setStyle, seed, ev, SIZES, openMenu, clickChip } from './helpers.js';

const box = (loc) => loc.boundingBox();
const inside = (a, o, tol = 1) => a.y >= o.y - tol && a.y + a.height <= o.y + o.height + tol && a.x >= o.x - tol && a.x + a.width <= o.x + o.width + tol;
const noOverlap = (a, b) => a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5 || a.x + a.width <= b.x || b.x + b.width <= a.x;

const PORTRAITS = [SIZES.openPortrait, SIZES.openPortrait669];
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

for (const size of PORTRAITS) {
  const tag = `${size.width}×${size.height}`;
  test.describe(`開いた縦 ${tag}: 月`, () => {
    test('全幅の月。下部の予定一覧はなく、上の設定・検索と下の今日／タブ／＋が重ならない', async ({ page }) => {
      await monthFormInit(page, 'two');
      await openApp(page, size);
      await loadSample(page);
      expect(await layout(page)).toBe('open');
      await expect(page.locator('body')).toHaveAttribute('data-posture', 'portrait');
      expect(await modeStates(page)).toEqual({ 予定名: true, 全部: false }); // 手帳は出さない。入口は設定の「月の表現」
      await expect(page.locator('.agenda')).toHaveCount(0);
      await expect(page.locator('.foot, .top, .brand')).toHaveCount(0);
      const W = size.width, H = size.height, rx = W / 669, ry = H / 951;
      // 月グリッド（第12版）: 全幅・上端 head+24=106・下端 H-96p（p=H/951。第19版 PR5: タブ y=H-88p の上 8）。見出しは上 safe の帯の中（safe=0 は通常の82）
      // 第19版 PR6（design/22 §5）: 見出し y82〜126・曜日 126〜146（20）・月のマス y146〜443（297。溝 avoid の上端 459 −16）・つまみ y453〜457
      const sc = await box(page.locator('.mgrid'));
      expect(near(sc.x, 12) && near(sc.width, W - 24)).toBe(true);
      expect(near(sc.y, 146, 1) && near(sc.height, 297, 1)).toBe(true);
      const wd = await box(page.locator('.weekdays'));
      expect(near(wd.y, 126, 1) && near(wd.height, 20, 1)).toBe(true);
      const grab = await box(page.locator('.mgrab i'));
      expect(near(grab.y, 453, 1) && near(grab.height, 4, 0.5) && near(grab.width, 36, 0.5)).toBe(true);
      // 操作の位置と大きさ
      const set = await box(page.getByRole('button', { name: '設定' }));
      const search = await box(page.getByRole('button', { name: '予定を検索' }));
      const today = await box(page.getByRole('button', { name: '今日に戻る' }));
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      const tabs = await box(page.locator('.tabs'));
      // 第19.1版 S2（design/32 §5-5）: 設定 x20〜64・検索 右から20（x605〜649）、どちらも y19〜63（44×44）
      expect(near(set.x, 20) && near(set.y, 19) && near(set.width, 44) && near(set.height, 44)).toBe(true);
      expect(near(search.x, W - 20 - 44) && near(search.y, 19) && near(search.width, 44) && near(search.height, 44)).toBe(true);
      expect(near(today.x, 20) && near(today.y, H - 88 * ry, 1) && near(today.width, 48)).toBe(true);
      expect(near(add.x, W - 20 - 48) && near(add.y, H - 88 * ry, 1) && near(add.width, 48)).toBe(true);
      expect(near(tabs.x + tabs.width / 2, W / 2) && tabs.width >= 176 && near(tabs.height, 46)).toBe(true);
      expect(near(tabs.y, H - 88 * ry, 1)).toBe(true);
      // 「カレンダー｜タスク｜ノート」は上の帯の真ん中 x224〜444・y23〜59（252×36。V-01 で 220→252）。下の段には出ない（17 §1）
      const fmodes = await box(page.locator('.fmodes'));
      expect(near(fmodes.x, (W - 252) / 2, 1) && near(fmodes.y, 23) && near(fmodes.width, 252) && near(fmodes.height, 36)).toBe(true);
      expect(fmodes.y + fmodes.height).toBeLessThanOrEqual(82);
      for (const [a, b] of [[today, tabs], [tabs, add], [today, add], [set, search], [tabs, fmodes], [add, fmodes], [today, fmodes]]) expect(noOverlap(a, b)).toBe(true);
      expect(add.y + add.height).toBeLessThanOrEqual(H);
      // 月グリッドは下段の上で終わる（隠れる週がない）
      expect(sc.y + sc.height).toBeLessThanOrEqual(Math.min(today.y, tabs.y, add.y) + 1);
      // 見出し（月の題名・前・次・今日）は上の帯の下、y82〜126 の面
      const title = await box(page.locator('#ctitle'));
      expect(title.y).toBeGreaterThanOrEqual(82 - 1); expect(title.y + title.height).toBeLessThanOrEqual(126 + 1);
      expect(noOverlap(title, set) && noOverlap(title, search)).toBe(true);
      for (const n of ['前の週', '次の週']) { const b = await box(page.getByRole('button', { name: n })); expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44); expect(noOverlap(b, set) && noOverlap(b, search)).toBe(true); }
      // 予定名つきのチップ・帯
      const strip = page.locator('.mgrid .strip', { hasText: 'プロジェクト' }).first();
      await expect(strip).toBeVisible();
      expect(inside(await box(strip), sc)).toBe(true);
      expect(await strip.innerText()).toMatch(/^(\d{1,2}:\d\d )?プロジェクト/); // 時刻は既定で切（出すときは先頭0なし）
      await expect(page.locator('.mgrid .bar', { hasText: '秋のゴルフ合宿' }).first()).toBeVisible();
      expect(await findTextOverlaps(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    // 第19版 PR6: 月の型は 6行×49.5（297 を均等に分ける）。4週・5週の月も後ろの週で 6行にそろえ、最後の行まで溝の上（avoid の上端）に収まる
    const CASES = [['2026年12月（月曜始まり5週）', 1], ['2027年2月（4週）', 3], ['2026年11月（6週）', 0], ['2026年8月（6週）', -3]];
    for (const [name, fwd] of CASES) {
      test(`${name}: 月の型は6行を均等に、最後の行まで溝の上に収まる`, async ({ page }) => {
        await monthFormInit(page);
        await openApp(page, size);
        const btn = page.getByRole('button', { name: fwd >= 0 ? '次の月' : '前の月' });
        for (let i = 0; i < Math.abs(fwd); i++) await btn.click();
        await expect(page.locator('.mgrid .week')).toHaveCount(6);
        const hs = await page.locator('.mgrid .week').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
        for (const h of hs) expect(near(h, 49.5, 0.6)).toBe(true);
        const last = await box(page.locator('.mgrid .week').last()), grab = await box(page.locator('.mgrab i'));
        expect(last.y + last.height).toBeLessThanOrEqual(grab.y + 1);
        expect(last.y + last.height).toBeLessThanOrEqual(459);
        expect(await findTextOverlaps(page)).toEqual([]);
      });
    }

    test('日曜始まり: 2027年2月は列が日曜から。月送りで下の面・タブは動かない', async ({ page }) => {
      await monthFormInit(page);
      await openApp(page, size);
      await openMenu(page, 'general');
      await page.locator('#menu').getByRole('button', { name: /^週の始まり/ }).click();
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '次の月' }).click();
      await expect(page.locator('#ctitle')).toHaveText('2027年 2月');
      await expect(page.locator('.weekdays span').first()).toHaveText('日');
      await expect(page.locator('.mgrid .week')).toHaveCount(6);
      const tabs0 = await box(page.locator('.tabs')), day0 = await box(page.locator('.mday'));
      await page.getByRole('button', { name: '前の月' }).click();
      expect(await box(page.locator('.tabs'))).toEqual(tabs0);
      expect(await box(page.locator('.mday'))).toEqual(day0);
    });

    test('2週の型で 11/13 の5件が全部出て、日をたたくと下の日の部分が変わる（日表示へは進まない）', async ({ page }) => {
      await monthFormInit(page, 'two');
      await openApp(page, size);
      await seed(page, ['A', 'B', 'C', 'D', 'E'].map((t, i) => ev(`m${i}`, `予定${t}`, `2026-11-13T${String(9 + i).padStart(2, '0')}:00`, `2026-11-13T${String(9 + i).padStart(2, '0')}:30`)));
      for (const t of ['A', 'B', 'C', 'D', 'E']) await expect(page.locator('.mgrid .strip', { hasText: `予定${t}` })).toBeVisible();
      await expect(page.locator('.plus[data-plus="2026-11-13"]')).toHaveCount(0);
      await pickDay(page, '2026-11-13');
      await expect(page.locator('.mdh h3')).toContainText('11月13日（金）');
      await expect(page.locator('.mdlist .mdev')).toHaveCount(5);
      await expect(tab(page, '月')).toHaveAttribute('aria-pressed', 'true');
    });

    test('simple を保存したまま縦は予定名で表示し、閉じた画面へ戻すと手帳', async ({ page }) => {
      await openApp(page, SIZES.closedPortrait);
      await tab(page, '月').click();
      await setStyle(page, '手帳');
      await page.setViewportSize(size);
      await expect.poll(() => layout(page)).toBe('open');
      await expect(page.locator('.calendar .week.named').first()).toBeVisible();
      expect(await modeStates(page)).toEqual({ 予定名: true, 全部: false });
      await page.setViewportSize(SIZES.closedPortrait);
      await expect.poll(() => layout(page)).toBe('browse');
      expect(await modeStates(page)).toMatchObject({ 手帳: true });
    });

    test('2週の型は6段: 帯＋チップは6段まで、収まらない日は +N（日付の行）にする（帯も1件に数える）', async ({ page }) => {
      await monthFormInit(page, 'two');
      await openApp(page, size);
      await addEvent(page, { title: '出張A', all: true, start: '2026/11/16', end: '2026/11/18', cat: 'work' });
      await addEvent(page, { title: '合宿B', all: true, start: '2026/11/17', end: '2026/11/19', cat: 'family' });
      await addEvent(page, { title: '研修C', all: true, start: '2026/11/17', end: '2026/11/17', cat: 'private' });
      const bars = page.locator('.mgrid .bar');
      await expect(bars).toHaveCount(3); // 単日の終日も同形の帯
      await expect(page.locator('.plus[data-plus="2026-11-17"]')).toHaveCount(0);
      for (const t of ['終日D', '終日E', '終日F']) await addEvent(page, { title: t, all: true, start: '2026/11/17', end: '2026/11/17', cat: 'work' });
      await expect(bars).toHaveCount(6); // 11/17 はちょうど6件。全部出て +n は出ない
      await expect(page.locator('.plus[data-plus="2026-11-17"]')).toHaveCount(0);
      await addEvent(page, { title: '終日G', all: true, start: '2026/11/17', end: '2026/11/17', cat: 'work' });
      // 7件: 6件＋「+1」（+N は日付の行。段は全部名前）
      await expect(bars).toHaveCount(6);
      await expect(page.locator('[data-date="2026-11-17"] ~ .plus[data-plus="2026-11-17"]')).toHaveText('+1');
      const boxes = await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        expect(p.x < q.right - 0.5 && q.x < p.right - 0.5 && p.y < q.bottom - 0.5 && q.y < p.bottom - 0.5).toBe(false);
      }
      expect(await findTextOverlaps(page)).toEqual([]);
      await clickChip(page, page.locator('.mgrid .bar', { hasText: '出張A' }));
      await expect(page.locator('#editor')).toBeVisible();
    });

    test('全部: 週は伸びて内部スクロール、末尾まで下段の上に出せる', async ({ page }) => {
      await openApp(page, size);
      await seed(page, [1, 2, 3, 4, 5].map((i) => ev(`all${i}`, `終日${i}`, '2026-11-30T00:00', '2026-11-30T23:59', { all: true })));
      await setStyle(page, '全部');
      const sc = page.locator('.scroll.all');
      await expect(sc).toBeVisible();
      await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      // 第19.1版 S2（#21）: 1枚の紙を上の窓（y146〜458）と下の窓（y500〜）で見る。末尾まで送ると最終週の下端が下の窓の下端にそろい、窓はタブの上で終わる。
      // scroll は次のフレームで下の窓へ写る（allSync → syncAllWeeks → allMirror）。最終週が下の窓に描かれ、位置がそろうという「状態」を待つ（決まった時間は待たない）
      await expect.poll(async () => page.locator('.allb .week.all').last().evaluate((e) => !!e.dataset.drawn)).toBe(true);
      const winL = page.locator('.alwin.alb'), lastL = page.locator('.allb .week.all').last();
      await expect.poll(async () => { const w = await box(winL), l = await box(lastL); return Math.abs(l.y + l.height - (w.y + w.height)) <= 1; }).toBe(true);
      const win = await box(winL), tabs = await box(page.locator('.tabs'));
      expect(win.y + win.height).toBeLessThanOrEqual(tabs.y + 1);
    });
  });
}

test.describe('開いた縦: safe area・キーボード・下書き', () => {
  for (const size of PORTRAITS) {
    test(`${size.width}×${size.height}: safe 上47・下34 でも操作は安全矩形の内側で、見出し・月・下段が重ならない`, async ({ page }) => {
      await openApp(page, size);
      await page.addStyleTag({ content: ':root{--sat:47px;--sab:34px;--sar:0px;--sal:0px}' });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--content-y'))).toBe('47px');
      const ry = (size.height - 34) / 951; // p=(H-B)/951。上 safe は見出しに足さない（head=max(T,82)=82）
      const set = await box(page.getByRole('button', { name: '設定' }));
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      const tabs = await box(page.locator('.tabs'));
      const sc = await box(page.locator('.mgrid'));
      expect(near(set.y, 19, 1)).toBe(true); // 帯の中 y19〜63
      expect(add.y + add.height).toBeLessThanOrEqual(size.height - 34 + 0.5);
      expect(tabs.y + tabs.height).toBeLessThanOrEqual(size.height - 34 + 0.5);
      expect(near(sc.y, 146, 1)).toBe(true);
      expect(near(tabs.y, size.height - 34 - 88 * ry, 1)).toBe(true);
      expect(sc.y + sc.height).toBeLessThanOrEqual(tabs.y + 1);
      expect(await findTextOverlaps(page)).toEqual([]);
    });
  }

  test('入力中のキーボード相当の高さ縮小でも DOM は変わらず、下書きが残る', async ({ page }) => {
    const size = SIZES.openPortrait669;
    await openApp(page, size);
    await page.locator('[data-act="add"]:visible').first().click();
    await page.locator('#f-title').fill('下書きの予定');
    const before = await page.locator('#app').innerHTML();
    const tabs0 = await box(page.locator('.tabs'));
    await page.setViewportSize({ width: size.width, height: 600 });
    await page.waitForTimeout(300);
    expect(await page.locator('#app').innerHTML()).toBe(before);
    expect(await box(page.locator('.tabs'))).toEqual(tabs0);
    await expect(page.locator('#f-title')).toHaveValue('下書きの予定');
  });
});

// 第19版 PR7（design/29 案A）: 開いた縦の週は「1枚の紙・2つの窓」。日別の縦リストは使わない（寸法・折り目は portrait-fold-timeline.spec.js）。
test.describe('開いた縦 626×890: 週', () => {
  test('7列の時間軸。長いタイトルは窓の中で折り返さず1行、日付の行は 月〜日、本文は窓の中だけでスクロール', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    await addEvent(page, { title: 'とても長いタイトルの予定を登録して列の幅で切れることを確認する', start: '2026/11/12 20:00', end: '2026/11/12 21:00' });
    await tab(page, '週').click();
    await expect(page.locator('.fold-week')).toBeVisible();
    await expect(page.locator('.fl.ft .tlcol')).toHaveCount(7);
    await expect(page.locator('.fdates .fdt')).toHaveText([/^月9/, /^火10/, /^水11/, /^木12/, /^金13/, /^土14/, /^日15/]);
    await expect(page.locator('.weekrow')).toHaveCount(0);
    await expect(page.locator('.agenda')).toHaveCount(0);
    // 窓は2つ。紙は窓の中でスクロールし、画面全体はスクロールしない
    expect(await page.locator('.fl.ft').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const add = await box(page.getByRole('button', { name: '予定を追加' })), win = await box(page.locator('.fwin.fb'));
    expect(win.y + win.height).toBeLessThanOrEqual(add.y + add.height + 1);
    expect(await findTextOverlaps(page)).toEqual([]);
  });

  test('複数日予定は該当日それぞれの終日の段に載り、日付から日表示へ進める', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await loadSample(page);
    await tab(page, '週').click();
    await page.getByRole('button', { name: '次の週' }).click(); // 11/16〜22（月曜始まり。出張・京都は 11/19〜23 なので19〜22の4日）
    await expect(page.locator('.fall .adcol .adpill', { hasText: '出張・京都' })).toHaveCount(4);
    await page.getByRole('button', { name: '11月20日（金）を日表示で開く' }).click();
    await expect(page.locator('#ctitle')).toHaveText('11月20日（金）先負');
  });
});
