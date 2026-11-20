import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, tab, layout, findTextOverlaps, setStyle, toggleDesk, SIZES, showView, monthFormInit } from './helpers.js';

const box = (loc) => loc.boundingBox();
const inside = (inner, outer, tol = 1) => inner.y >= outer.y - tol && inner.y + inner.height <= outer.y + outer.height + tol && inner.x >= outer.x - tol && inner.x + inner.width <= outer.x + outer.width + tol;

test.describe('レイアウト（4サイズ）', () => {
  test('466×678 閉じた縦: ホームは今日・次の予定・残り・追加のみ', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, 'ホーム').click(); // 起動はカレンダー（design/34 §9.2・11:29 の決定）。ホームはタブから
    await loadSample(page);
    expect(await layout(page)).toBe('home');
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hevents')).toBeVisible();
    await expect(page.locator('.week, .agenda, .legend')).toHaveCount(0);
    for (const t of ['日', '週', '月']) await expect(tab(page, t)).toHaveAttribute('aria-pressed', 'false');
    const add = await box(page.getByRole('button', { name: '予定を追加' }));
    expect(add.y + add.height).toBeLessThanOrEqual(678);
    expect(add.x).toBeGreaterThanOrEqual(382); // ＋ は右の操作列
    // 今日の予定カードの行（最大3件）は全体スクロールの枠の中に入る（第16版 PR14）
    const list = await box(page.locator('.home.listview'));
    const tabs = await box(page.locator('.tabs'));
    expect(tabs.y).toBeGreaterThan(0);
    for (const ev of await page.locator('.hevents .hrow').all()) { const b = await box(ev); expect(inside(b, list)).toBe(true); }
  });

  test('予定が増えても今日の予定は3件＋ほか。全体をスクロールすると最後のカードをタブの上へ出せる', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await tab(page, 'ホーム').click(); // 起動はカレンダー（design/34 §9.2・11:29 の決定）
    for (let i = 0; i < 9; i++) await addEvent(page, { title: `追加予定${i}`, start: `2026/11/12 ${String(14 + (i % 8)).padStart(2, '0')}:00`, end: `2026/11/12 ${String(14 + (i % 8)).padStart(2, '0')}:30` });
    await expect(page.locator('.hevents .hrow')).toHaveCount(3); // 最大3件＋ほか
    const list = page.locator('.home.listview');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const last = await box(page.locator('.hcards > *').last());
    expect(last.y + last.height).toBeLessThanOrEqual((await box(page.locator('.tabs'))).y + 1);
  });

  test('466×678 閉じた日表示: 5件前後が見える', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await loadSample(page);
    await tab(page, '日').click();
    expect(await layout(page)).toBe('browse');
    // PR25: 閉じた日は時間軸。5件が時間ブロックとして並び、軸は画面（タブの上）に収まる
    const sc = await box(page.locator('.tlx'));
    await expect(page.locator('.tlev')).toHaveCount(5);
    expect(inside(await box(page.locator('.tl')), sc)).toBe(true);
    // 見出しは1回だけ
    await expect(page.getByRole('heading', { name: '11月12日（木）' })).toHaveCount(1);
    await expect(page.locator('.agenda')).toHaveCount(0);
  });

  test('閉じた月: 常設の凡例はなく、日の部分は内部スクロールで末尾（ノート）がタブの上へ出る（第19版 PR6）', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await loadSample(page);
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    await expect(page.locator('.calendar .legend')).toHaveCount(0);
    const sc = page.locator('.mday'); // design/34 §6.3: 閉じた画面は日の欄の中だけが流れる（下の余白 41。タブがなくなるまでは、タブの帯にも重ならない範囲で見る）
    await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const last = await box(page.locator('.mdnote'));
    expect(last.y + last.height).toBeLessThanOrEqual(678 - 41 + 0.5);
  });

  test('678×466 閉じた横: 1列でホームの操作が使える', async ({ page }) => {
    await openApp(page, SIZES.closedLandscape);
    await tab(page, 'ホーム').click(); // 起動はカレンダー（design/34 §9.2・11:29 の決定）
    await loadSample(page);
    expect(await layout(page)).toBe('home');
    const next = await box(page.locator('.next'));
    const date = await box(page.locator('.date'));
    expect(Math.abs((next.y + next.height / 2) - (date.y + date.height / 2))).toBeLessThan(80); // 同じ段
    const list = await box(page.locator('.home.listview'));
    const add = await box(page.getByRole('button', { name: '予定を追加' }));
    expect(add.y + add.height).toBeLessThanOrEqual(466);
    for (const ev of await page.locator('.hevents .hrow').all()) expect(inside(await box(ev), list)).toBe(true);
    await tab(page, '週').click();
    await expect(page.locator('.tlx .tlcol')).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  for (const size of [SIZES.openPortrait, SIZES.openPortrait669]) {
    test(`開いた縦 ${size.width}×${size.height}: 月は下段（今日・タブ・＋）に覆われず、6週月でも最後の週まで届く。下部アジェンダなし`, async ({ page }) => {
      await monthFormInit(page); // 第19版 PR6: 月を引く画面の「月」の型（6行）で見る
      await openApp(page, size);
      await loadSample(page);
      expect(await layout(page)).toBe('open');
      await expect(page.locator('.agenda')).toHaveCount(0);
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      const sc = await box(page.locator('.mgrid'));
      expect(sc.y + sc.height).toBeLessThanOrEqual(add.y + 1);
      // 6週月でも週行は縮まず、全週がスクロールなしで見える（詳細は open-portrait.spec.js）
      await page.getByRole('button', { name: '前の月' }).click();
      await page.getByRole('button', { name: '前の月' }).click();
      await page.getByRole('button', { name: '前の月' }).click(); // 2026年8月（6週）
      await expect(page.locator('.mgrid .week')).toHaveCount(6);
      const last = await box(page.locator('.mgrid .week').last());
      expect(last.y + last.height).toBeLessThanOrEqual(add.y + 1);
    });
  }

  test('626×890 開いた縦: 週は 1枚の紙・2つの窓の7列（第19版 PR7。日別の縦リストではない）', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await tab(page, '週').click();
    const xs = await page.locator('.fl.ft .tlcol').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(xs).toHaveLength(7);
    expect(new Set(xs).size).toBe(7);
    await expect(page.locator('.weekrow')).toHaveCount(0);
  });

  for (const size of [SIZES.openLandscape, SIZES.openLandscape951]) {
    test(`${size.width}×${size.height} 開いた横: 見開き（左見出し1行・右は時間軸・本文内に縦の操作列なし・日の右ページは5件がスクロールなし）`, async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      expect(await layout(page)).toBe('spread');
      const f = size.width / 2;
      const head = await box(page.locator('.shead'));
      expect(head.height).toBeLessThanOrEqual(80);
      // 全幅の追加バーはなく、＋は（safe=0 では帯がないので）右見出しの44角。右の縦の操作列（旧 76px）はない
      const plus = await box(page.getByRole('button', { name: '予定を追加' }));
      expect(plus.width).toBeLessThanOrEqual(48);
      expect(plus.height).toBeLessThanOrEqual(48);
      await expect(page.locator('.srail, .rail')).toHaveCount(0);
      const rail = { x: size.width - 16 }; // 右本文の終端 E = W-R-16（R=0）
      // 左ページは中心−10まで、右ページは中心+10から
      const lp = await box(page.locator('.page.lp')), rp = await box(page.locator('.page.rp'));
      expect(lp.x + lp.width).toBeLessThanOrEqual(f - 10 + 0.5);
      expect(rp.x).toBeGreaterThanOrEqual(f + 10 - 0.5);
      expect(rp.x + rp.width).toBeLessThanOrEqual(rail.x + 0.5);
      // 月では右は時間軸（予定カードの一覧ではない）
      await expect(page.locator('.tl')).toBeVisible();
      await expect(page.locator('.agenda')).toHaveCount(0);
      // 日（第14版 PR5）: 右の時間ページを1日にする。旧「右の詳細一覧」は廃止（時間軸で見る）
      await showView(page, '日');
      await expect(page.locator('.page.rp .tl')).toBeVisible();
      await expect(page.locator('.page.rp .tlev')).toHaveCount(5);
      expect((await box(page.locator('.page.rp'))).y + (await box(page.locator('.page.rp'))).height).toBeLessThanOrEqual(size.height);
    });
  }

  test('卓上: 上カレンダー／折り目帯（全文表示）／下に選択日と追加', async ({ page }) => {
    for (const size of [SIZES.openPortrait, SIZES.openLandscape]) {
      await openApp(page, size);
      if (size === SIZES.openPortrait) await loadSample(page);
      await toggleDesk(page);
      expect(await layout(page)).toBe('desk');
      const band = page.locator('.foldband');
      await expect(band).toHaveText('折り目の保護領域');
      expect(await band.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const bb = await box(band);
      expect(Math.abs(bb.y + bb.height / 2 - size.height / 2)).toBeLessThanOrEqual(1);
      const bottom = await box(page.locator('.deskbottom .list'));
      const add = await box(page.getByRole('button', { name: '予定を追加' }));
      expect(bottom.y).toBeGreaterThanOrEqual(bb.y + bb.height);
      expect(bottom.y + bottom.height).toBeLessThanOrEqual(add.y + 1);
      const top = await box(page.locator('.desktop .scroll'));
      expect(top.y + top.height).toBeLessThanOrEqual(bb.y + 1);
      await toggleDesk(page);
    }
  });
});

// 全ビュー・全サイズで、見えている文字が重ならないこと。
test.describe('可視テキストの重なり', () => {
  for (const [name, size] of Object.entries(SIZES)) {
    test(`${name} ${size.width}×${size.height}`, async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      const probs = [];
      const scan = async (tag) => { const o = await findTextOverlaps(page); if (o.length) probs.push(`${tag}: ${o.join(' / ')}`); };
      await scan('home');
      for (const v of ['日', '週', '月']) {
        await showView(page, v);
        if (v === '月') {
          for (const s of ['手帳', '予定名']) { await setStyle(page, s); await scan(`月/${s}`); }
        } else await scan(v);
      }
      if (size.width >= 600 && size.height >= 600) {
        await showView(page, '月');
        await toggleDesk(page);
        await setStyle(page, '予定名');
        await scan('卓上/予定名');
        await setStyle(page, '手帳');
        await scan('卓上/手帳');
      }
      expect(probs).toEqual([]);
    });
  }
});

test.describe('見開きの折り目（ビューポート中心 ±10px）', () => {
  for (const size of [SIZES.openLandscape, SIZES.openLandscape951]) test(`${size.width}×${size.height}: どのビューでも文字・カード・ボタンが折り目帯に乗らない`, async ({ page }) => {
    await openApp(page, size);
    await loadSample(page);
    const collect = () => page.evaluate(() => {
      const hits = [];
      const L = window.innerWidth / 2 - 10, R = window.innerWidth / 2 + 10;
      const hit = (r) => r.right > L + 0.5 && r.left < R - 0.5 && r.width > 0 && r.height > 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim() || n.parentElement.closest('[hidden],dialog:not([open]),#status')) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        for (const r0 of range.getClientRects()) {
          // overflow:hidden の祖先で切られた分は見えないので、可視部分だけで判定する（省略記号で切れるチップ名など）
          let r = { left: r0.left, right: r0.right, width: r0.width, height: r0.height };
          for (let a = n.parentElement; a && a !== document.documentElement; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflowX !== 'visible') { const ar = a.getBoundingClientRect(); r.left = Math.max(r.left, ar.left); r.right = Math.min(r.right, ar.right); }
          }
          r.width = r.right - r.left;
          if (hit(r)) hits.push(`text:${n.nodeValue.trim()}`);
        }
      }
      document.querySelectorAll('#app *').forEach((el) => {
        const cs = getComputedStyle(el);
        const painted = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderBottomWidth) || el.matches('button,input,select,.week,.event');
        if (painted && !el.matches('.shell,#app') && hit(el.getBoundingClientRect())) hits.push(`box:${el.className || el.tagName}`);
      });
      return hits;
    });
    const probs = [];
    for (const v of ['月', '週', '日']) {
      await showView(page, v);
      if (v === '月') for (const s of ['手帳', '予定名']) { await setStyle(page, s); probs.push(...(await collect()).map((h) => `${v}/${s} ${h}`)); }
      else probs.push(...(await collect()).map((h) => `${v} ${h}`));
    }
    expect(probs).toEqual([]);
    // 左右ページの端は折り目の実座標（中心±10）
    const lp = await page.locator('.page.lp').boundingBox(), rp = await page.locator('.page.rp').boundingBox();
    expect(Math.round(lp.x + lp.width)).toBe(Math.round(size.width / 2 - 10));
    expect(Math.round(rp.x)).toBe(Math.round(size.width / 2 + 10 + 8)); // S8 N-01（設計 2026-11-20）: 右ページの箱は折り目の側に 8 ずらす（保護域 ±10 の外に 18）
  });
});

test.describe('複数日の帯', () => {
  // 第10版: 帯（終日・複数日）と時刻チップは共通レーン。第13版 PR7: 開いた横の6週は4段（951×669）、収まらない分は +N。
  test('予定名表示で帯が重ならず並び、4段を超えた分は +N（帯も1件に数える）', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951);
    await addEvent(page, { title: '出張A', all: true, start: '2026/11/16', end: '2026/11/18', cat: 'work' });
    await addEvent(page, { title: '合宿B', all: true, start: '2026/11/17', end: '2026/11/19', cat: 'family' });
    await setStyle(page, '予定名');
    const bars = page.locator('.bar');
    await expect(bars).toHaveCount(2);
    const [a, b] = await Promise.all([bars.nth(0).boundingBox(), bars.nth(1).boundingBox()]);
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap).toBe(false);
    expect(a.y).not.toBe(b.y);
    expect((await Promise.all([bars.nth(0).innerText(), bars.nth(1).innerText()])).join()).toMatch(/出張A.*合宿B|合宿B.*出張A/);
    await addEvent(page, { title: '研修C', all: true, start: '2026/11/17', end: '2026/11/17', cat: 'private' });
    await addEvent(page, { title: '集中D', all: true, start: '2026/11/16', end: '2026/11/18', cat: 'out' });
    await expect(bars).toHaveCount(4); // 4段に収まる
    await expect(page.locator('.plus')).toHaveCount(0);
    await addEvent(page, { title: '終日E', all: true, start: '2026/11/17', end: '2026/11/17', cat: 'work' });
    await expect(bars).toHaveCount(4); // 11/17 の5件のうち4件だけ置く
    await expect(page.locator('.plus[data-plus="2026-11-17"]')).toHaveText('+1');
    await expect(page.locator('.plus')).toHaveCount(1);
    const boxes = await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      expect(p.x < q.right - 0.5 && q.x < p.right - 0.5 && p.y < q.bottom - 0.5 && q.y < p.bottom - 0.5).toBe(false);
    }
    expect(await findTextOverlaps(page)).toEqual([]);
  });

  const BAND_CASES = [
    ['closedPortrait', ''], ['closedLandscape', ''], ['openPortrait', ''], ['openLandscape', ''],
    ['openPortrait', '?desk=1'], ['openLandscape', '?desk=1'],
  ];
  for (const [size, q] of BAND_CASES) {
    test(`帯は自週の日付直下で週行内に収まる (${size}${q})`, async ({ page }) => {
      await openApp(page, SIZES[size], q);
      await addEvent(page, { title: '出張A', all: true, start: '2026/11/16', end: '2026/11/18', cat: 'work' });
      await addEvent(page, { title: '合宿B', all: true, start: '2026/11/17', end: '2026/11/19', cat: 'family' });
      await addEvent(page, { title: '長期出張', all: true, start: '2026/11/19', end: '2026/11/23' });
      if (size.startsWith('closed')) await tab(page, '月').click();
      await setStyle(page, '予定名');
      const info = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
        const weeks = [...document.querySelectorAll('.week.named')];
        return [...document.querySelectorAll('.bar')].map((bar) => {
          const w = bar.closest('.week'); const i = weeks.indexOf(w);
          const num = w.querySelector('.num'); const next = weeks[i + 1];
          return { bar: r(bar), week: r(w), num: r(num), nextNum: next ? r(next.querySelector('.num')) : null };
        });
      });
      expect(info.length).toBeGreaterThanOrEqual(3);
      for (const b of info) {
        expect(b.bar.top).toBeGreaterThanOrEqual(b.week.top);
        expect(b.bar.bottom).toBeLessThanOrEqual(b.week.bottom);
        expect(b.bar.top).toBeGreaterThanOrEqual(b.num.bottom - 1);
        expect(b.bar.top - b.num.bottom).toBeLessThanOrEqual(6 + (size === 'openPortrait' ? 20 : 16)); // 2本目のレーンは +16px（開いた縦の月を引く画面は段の間隔 20）
        if (b.nextNum) expect(b.nextNum.top - b.bar.bottom).toBeGreaterThanOrEqual(2); // 第19版 PR6: 月を引く画面の段（日付16＋チップ14・行約50）は帯の下〜次の日付が 2.5〜5（旧 8）
      }
    });
  }

  test('週をまたぐ帯は週ごとに分割し、矢印なしで各週に題名を中央に置く', async ({ page }) => {
    await monthFormInit(page); // 第19版 PR6: 月の型（11/23 の週まで見える）
    await openApp(page, SIZES.openPortrait);
    await addEvent(page, { title: '長期出張', all: true, start: '2026/11/19', end: '2026/11/23' });
    await setStyle(page, '予定名');
    const bars = page.locator('.bar');
    await expect(bars).toHaveCount(2);
    for (const i of [0, 1]) {
      await expect(bars.nth(i)).toHaveText('長期出張');
      expect(await bars.nth(i).evaluate((el) => !/[→←]/.test(el.textContent))).toBe(true);
    }
    const wk = await bars.evaluateAll((els) => els.map((e) => e.closest('.week').dataset.wk ?? e.closest('.week').querySelector('.day').dataset.date));
    expect(new Set(wk).size).toBe(2);
  });
});
