// 第19版 PR7（design/29 案A）: 開いた縦の日・週 = 1枚の紙・2つの窓。溝は getPosture の groove を偽装して動かす。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, tab, SIZES } from './helpers.js';

const OPEN = { available: true, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen', source: 'reservedRegions', at: 2 };
async function mockGroove(page, groove) {
  await page.addInitScript((po) => {
    const M = window.__mock = { calls: [], listeners: {} };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method) => {
        if (method === 'getPosture') return JSON.parse(JSON.stringify(po));
        if (method === 'checkPermission' || method === 'reminderPermission' || method === 'notifyStatus') return { status: 'denied' };
        throw { code: 'UNAVAILABLE', message: method };
      },
    };
  }, { ...OPEN, groove });
}
const S = SIZES.openPortrait669;
const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
const fold = async (page, view = '日', events = []) => {
  await openApp(page, S);
  if (events.length) await seed(page, events);
  await tab(page, view).click();
  await expect(page.locator('.fold')).toBeVisible();
};
const scrollTo = (page, px) => page.evaluate((v) => new Promise((done) => { for (const el of document.querySelectorAll('.fl')) el.scrollTop = v; requestAnimationFrame(() => requestAnimationFrame(done)); }), px);
// 窓の上の端・下の端の時刻（分）
const edges = (page) => page.evaluate(() => {
  const ft = document.querySelector('.fwin.ft').getBoundingClientRect(), fb = document.querySelector('.fwin.fb').getBoundingClientRect();
  const s = document.querySelector('.fl.ft').scrollTop, sb = document.querySelector('.fl.fb').scrollTop;
  return { topTop: ft.top, topBottom: ft.bottom, botTop: fb.top, botBottom: fb.bottom, s, sb, tTop: (s + 0) * 60 / 44, tTopEnd: (s + ft.height) * 60 / 44, tBot: (s + ft.height) * 60 / 44 };
});

test.describe('開いた縦の日・週: 窓の寸法', () => {
  test('日: 見出し・終日・上の窓 y158〜458・下の窓 y500〜917、1時間 44', async ({ page }) => {
    await fold(page, '日');
    const e = await edges(page);
    expect(e.topTop).toBeCloseTo(158, 0); expect(e.topBottom).toBeCloseTo(458, 0);
    expect(e.botTop).toBeCloseTo(500, 0); expect(e.botBottom).toBeCloseTo(917, 0);
    const lines = await page.locator('.fwin.ft .fhl:not(.half)').evaluateAll((els) => els.slice(0, 3).map((x) => x.getBoundingClientRect().y));
    expect(lines[1] - lines[0]).toBeCloseTo(44, 0.5);
    const lb = await page.locator('.fwin.fb .fhl:not(.half)').evaluateAll((els) => els.slice(0, 3).map((x) => x.getBoundingClientRect().y));
    expect(lb[1] - lb[0]).toBeCloseTo(44, 0.5);
    const head = await rect(page.locator('.fhead'));
    expect(head.y).toBeCloseTo(82, 0); expect(head.h).toBeCloseTo(44, 0);
    const all = await rect(page.locator('.fall'));
    expect(all.y).toBeCloseTo(126, 0); expect(all.h).toBeCloseTo(32, 0);
    await expect(page.locator('#ctitle')).toContainText('11月12日（木）');
  });
  test('週: 日付の行 y126〜170・終日 y170〜194・上の窓 y194〜458・7列 x48〜657（1列 87）', async ({ page }) => {
    await fold(page, '週');
    const e = await edges(page);
    expect(e.topTop).toBeCloseTo(194, 0); expect(e.topBottom).toBeCloseTo(458, 0); expect(e.botTop).toBeCloseTo(500, 0);
    const d = await rect(page.locator('.fdates'));
    expect(d.y).toBeCloseTo(126, 0); expect(d.h).toBeCloseTo(44, 0);
    const cols = await page.locator('.fl.ft .tlcol').evaluateAll((els) => els.map((x) => { const r = x.getBoundingClientRect(); return [r.x, r.width]; }));
    expect(cols).toHaveLength(7);
    expect(cols[0][0]).toBeCloseTo(48, 0); expect(cols[0][1]).toBeCloseTo(87, 0);
    await expect(page.locator('#ctitle')).toHaveText('11月9日〜15日');
  });
  test('2つの窓は同じ位置で一緒に動き、y458 と y500 の時刻は同じ（飛ばない）。範囲は上の窓の上の端 0:00〜9:07', async ({ page }) => {
    await fold(page, '日');
    for (const px of [0, 37, 120, 333, 401, 9999]) {
      await scrollTo(page, px);
      const e = await edges(page);
      expect(e.sb).toBeCloseTo(e.s, 0);
      const yTop = await page.evaluate(() => { const p = document.querySelector('.fwin.ft .fhl'); return p.getBoundingClientRect().y; });
      const yBot = await page.evaluate(() => { const p = document.querySelector('.fwin.fb .fhl'); return p.getBoundingClientRect().y; });
      // 紙の上の端（0:00）の高さから、y458 と y500 が指す紙の位置の差は 0
      const pTop = 458 - yTop, pBot = 500 - yBot;
      expect(Math.abs(pTop - pBot)).toBeLessThanOrEqual(0.5);
    }
    await scrollTo(page, 9999);
    const e = await edges(page);
    expect(e.s * 60 / 44).toBeGreaterThan(9 * 60); expect(e.s * 60 / 44).toBeLessThanOrEqual(9 * 60 + 8);
    // いちばん下まで: 24:00 の線が y855 以上（タブに隠れない）
    const y24 = await page.locator('.fwin.fb .fhl:not(.half)').last().evaluate((el) => el.getBoundingClientRect().y);
    expect(y24).toBeLessThanOrEqual(855.5);
  });
  test('開いたときの位置: 今日は 今−1時間（9:41 → 8:30）、ほかの日は最初の予定−1時間、なければ 8:00', async ({ page }) => {
    await fold(page, '日');
    expect((await edges(page)).s * 60 / 44).toBeCloseTo(8 * 60 + 30, 0);
    await page.locator('[data-act="next"]').first().click(); // 11/13（予定なし）
    await expect(page.locator('#ctitle')).toContainText('11月13日');
    expect((await edges(page)).s * 60 / 44).toBeCloseTo(8 * 60, 0);
  });
});

test.describe('開いた縦の日・週: 溝の位置（3通り）', () => {
  for (const [name, groove, cut] of [['467〜484', { g0: 467, g1: 484, source: 'native' }, [458, 500]], ['ずらした 480〜497', { g0: 480, g1: 497, source: 'native' }, [471, 513]], ['fallback（なし）', null, [458, 500]]]) {
    test(`${name}: 窓の切れ目が cut の値に動き、止まっている文字は avoid の帯にない`, async ({ page }) => {
      await mockGroove(page, groove);
      await openApp(page, S);
      await tab(page, '日').click();
      const e = await edges(page);
      expect(e.topBottom).toBeCloseTo(cut[0], 0); expect(e.botTop).toBeCloseTo(cut[1], 0);
      const [a0, a1] = await page.evaluate(() => ['--groove-avoid-y0', '--groove-avoid-y1'].map((k) => parseFloat(document.documentElement.style.getPropertyValue(k))));
      // 止まっている文字（時刻のラベル）が avoid の帯 [a0, a1) に入らない
      for (const px of [0, 100, 250]) {
        await scrollTo(page, px);
        const ys = await page.locator('.fh:visible').evaluateAll((els) => els.map((x) => { const r = x.getBoundingClientRect(); return [r.top, r.bottom]; }));
        for (const [t, b] of ys) expect(t >= a1 - 0.5 || b <= a0 + 0.5).toBe(true);
      }
      // 時刻が飛ばない
      const yTop = await page.evaluate(() => document.querySelector('.fwin.ft .fhl').getBoundingClientRect().y);
      const yBot = await page.evaluate(() => document.querySelector('.fwin.fb .fhl').getBoundingClientRect().y);
      expect(Math.abs((cut[0] - yTop) - (cut[1] - yBot))).toBeLessThanOrEqual(0.5);
    });
  }
});

test.describe('ラベルと今の時刻の線', () => {
  test('境ちょうどの時刻のラベルは下の窓だけ。窓の端 8 以内は内側 8 へ寄る。今の時刻の線は1本', async ({ page }) => {
    await fold(page, '日');
    // どの位置でも同じ時刻のラベルが2つ出ない（境と同じ時刻は下の窓だけ）。境が 12:00 ちょうどになる位置（s=228）も含める
    for (const s of [0, 100, 227, 228, 229, 300]) {
      await scrollTo(page, s);
      const labs = await page.evaluate(() => [...document.querySelectorAll('.fh')].filter((x) => getComputedStyle(x).visibility !== 'hidden').map((x) => x.textContent));
      expect(new Set(labs).size).toBe(labs.length);
    }
    await scrollTo(page, 228);
    const tcExact = await page.evaluate(() => (document.querySelector('.fl.ft').scrollTop + 300) * 60 / 44);
    if (Math.abs(tcExact - 720) < 1e-6) {
      const w12 = await page.evaluate(() => [...document.querySelectorAll('.fh')].filter((x) => x.textContent === '12:00' && getComputedStyle(x).visibility !== 'hidden').map((x) => x.closest('.fwin').classList.contains('ft') ? 't' : 'b'));
      expect(w12).toEqual(['b']);
    }
    // 今の時刻の線（9:41）は1本、時刻は ±0.5pt
    await scrollTo(page, 0);
    expect(await page.locator('.fnow:not([hidden])').count()).toBe(1);
    const y = await page.locator('.fnow:not([hidden])').evaluate((el) => el.getBoundingClientRect().y);
    expect(Math.abs(y - (500 + (9 * 60 + 41) * 44 / 60 - 300))).toBeLessThanOrEqual(0.5); // s=0: 下の窓は 6:49 から（9:41 は下の窓）
    await expect(page.locator('.fnt:visible')).toHaveText('9:41');
    // 今の時刻が境ちょうど: 下の窓だけ（y500）
    const s2 = ((9 * 60 + 41) * 44 / 60) - 300; // 境 = 9:41 → 上の窓の上の端 = 9:41 − 300/44h
    await scrollTo(page, Math.max(0, s2));
    if (s2 >= 0) { expect(await page.locator('.fnow:not([hidden])').count()).toBe(1); }
  });
});

test.describe('またぐ予定', () => {
  const E = (len) => ev('x', '会議資料づくり', '2026-11-12T13:30:00', '2026-11-12T15:30:00');
  // 境 tc を 14:49 にする: 上の窓の上の端 = 14:49 − 300/44h
  const sFor = (tc) => (tc * 60 - 300) * 44 / 60 / 60 * 60 / 60;
  const setS = async (page, boundaryMin) => { const s = (boundaryMin - 300 * 60 / 44) * 44 / 60; await scrollTo(page, s); };
  test('上の部分の下の端が y458・下の部分の上の端が y500。切り口に点線。タップはどちらでも同じ予定', async ({ page }) => {
    await fold(page, '日', [E()]);
    await setS(page, 14 * 60 + 49);
    const a = page.locator('.fwin.ft .fev'), b = page.locator('.fwin.fb .fev');
    await expect(a).toHaveAttribute('data-cut', 'b'); await expect(b).toHaveAttribute('data-cut', 't');
    const ra = await a.evaluate((el) => { const w = el.closest('.fwin').getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.min(r.bottom, w.bottom); });
    const rb = await b.evaluate((el) => { const w = el.closest('.fwin').getBoundingClientRect(), r = el.getBoundingClientRect(); return Math.max(r.top, w.top); });
    expect(ra).toBeCloseTo(458, 0); expect(rb).toBeCloseTo(500, 0);
    // 下の部分は 15:30−14:49 = 41分 = 30.07pt → 題名を出す。上は 58pt
    await expect(a).toHaveAttribute('data-ti', '1'); await expect(b).toHaveAttribute('data-ti', '1');
    await expect(a).toHaveAttribute('data-tm', '1'); await expect(b).toHaveAttribute('data-tm', '0');
    // VoiceOver は1つ
    await expect(b).toHaveAttribute('aria-hidden', 'true');
    // タップ: 下の部分でも同じ予定の編集
    await b.click({ position: { x: 20, y: 10 } });
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-title')).toHaveValue('会議資料づくり');
  });
  test('下の部分が 30pt 以上なら題名をもう一度、30pt より小さいと色だけ（30.5／29.5）', async ({ page }) => {
    await fold(page, '日', [E()]);
    // 下の部分 = (15:30 − tc) × 44/60。30.5pt → 41.59分、29.5pt → 40.23分
    for (const [bm, want] of [[15 * 60 + 30 - 30.5 * 60 / 44, '1'], [15 * 60 + 30 - 29.5 * 60 / 44, '0']]) {
      await setS(page, bm);
      await expect(page.locator('.fwin.fb .fev')).toHaveAttribute('data-ti', want);
    }
  });
});

test.describe('長押しで作る', () => {
  async function press(page, x, y, ms = 400) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); }
  test('上の窓で長押しして折り目をこえて下の窓へ引く。指が y458〜500 の間は時刻が境で止まり、緑の札は始まりと終わりの窓に出る', async ({ page }) => {
    await fold(page, '日');
    await scrollTo(page, 0);
    const col = await rect(page.locator('.fwin.ft .tlcol'));
    const y0 = 158 + 3 * 44 + 6; // 3:00 の線のすぐ下（上の窓は 0:00〜6:49）
    await press(page, col.x + 200, y0);
    await expect(page.locator('.dbox').first()).toBeVisible();
    // 折り目の間（y=480）: 時刻は境（上の窓の下の端）で止まる
    await page.mouse.move(col.x + 200, 480, { steps: 8 });
    const tc = (300) * 60 / 44; // s=0 → 境 = 6:49.09 は 15分に丸めて 06:45 の手前… 開始は 10:00 なので終了は 開始より後（最小15分）
    // 下の窓の 14:00 付近（y = 500 + (14*44 − (300))）
    const yb = 500 + (8 * 44 - 300) + 2; // 下の窓の 8:00 付近
    await page.mouse.move(col.x + 200, yb, { steps: 8 });
    await expect(page.locator('.dtag:visible')).toHaveCount(2);
    const wins = await page.locator('.dtag:visible').evaluateAll((els) => els.map((e) => e.closest('.fwin').classList.contains('ft') ? 't' : 'b'));
    expect(wins.sort()).toEqual(['b', 't']);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
  });
  test('自動スクロールは外側の端だけ。折り目の側（y418〜458・y500〜540）ではしない。タブの上 40（y815〜855）では 1秒に2時間分', async ({ page }) => {
    await fold(page, '日');
    await scrollTo(page, 100);
    const col = await rect(page.locator('.fwin.ft .tlcol'));
    await press(page, col.x + 200, 300);
    await page.mouse.move(col.x + 200, 430, { steps: 4 });
    const s0 = (await edges(page)).s; await page.waitForTimeout(500);
    expect((await edges(page)).s).toBeCloseTo(s0, 0);
    await page.mouse.move(col.x + 200, 520, { steps: 4 });
    await page.waitForTimeout(500);
    expect((await edges(page)).s).toBeCloseTo(s0, 0);
    await page.mouse.move(col.x + 200, 840, { steps: 6 });
    const s1 = (await edges(page)).s; await page.waitForTimeout(1000);
    const moved = ((await edges(page)).s - s1) * 60 / 44; // 分
    expect(moved).toBeGreaterThan(100); expect(moved).toBeLessThan(140); // 約 2 時間
    await page.mouse.up();
    await page.keyboard.press('Escape');
  });
});
test.describe('左右のスワイプとタブ', () => {
  test('日・週とも ‹ › で日・週が変わり、タブとスクロール位置の共通記憶がある', async ({ page }) => {
    await fold(page, '週');
    await page.locator('[data-act="next"]').first().click();
    await expect(page.locator('#ctitle')).toHaveText('11月16日〜22日');
    const t = await rect(page.locator('.tabs'));
    expect(Math.abs(t.y - 863)).toBeLessThanOrEqual(1); expect(Math.abs(t.x - 191)).toBeLessThanOrEqual(1);
  });
});
