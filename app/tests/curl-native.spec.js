// iOS 本来のめくり（B、1段目の試作）。DuoNative を偽装して、Web 側の判定・撮る範囲・呼ぶ順・切り替え・A に戻る条件を確かめる。
// 正本：duo-calendar-team/data/連携_第18弾_ネイティブめくりの呼び出し.md（1段目の列）、design/31-native-curl-B.md、qa/verify-curl-native-compare.md
// ネイティブ側（UIPageViewController の見た目・透明な次のページ・コマの間隔）は箱では見られないので、ここでは扱わない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev } from './helpers.js';

test.use({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
test.setTimeout(120000);

const UI = 'duo.ui.v1';
const EVENTS = [ev('a', '左の会議', '2026-11-12T10:00', '2026-11-12T11:00'), ev('c', '十四日の予定', '2026-11-14T09:30', '2026-11-14T10:30')];
const heads = (page) => page.locator('#app .dpage .dd').allTextContents();
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => !m || c.method === m), m);
const st = (page) => page.evaluate(() => __duoCurl.state());

async function land(page, { engine = 'native', caps = true, capsVersion = 2, turnFail = false, abortBack = false, reduce = false, nativeOff = false } = {}) {
  await page.addInitScript(({ k, engine, caps, capsVersion, turnFail, abortBack, nativeOff }) => {
    if (!localStorage.getItem('__cn_seeded')) {
      localStorage.setItem('__cn_seeded', '1');
      let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; }
      localStorage.setItem(k, JSON.stringify({ ...s, selected: '2026-11-12', spreadType: 'tt' }));
      if (engine) localStorage.setItem('duo-curl-engine', engine);
    }
    if (nativeOff) return;
    const heads = () => [...document.querySelectorAll('#app .dpage .dd')].map((e) => e.textContent);
    const M = window.__mock = { calls: [], listeners: {}, turnFail, abortBack };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (p, m, o, cb) => { M.listeners[o.eventName] = cb; return 'cb-1'; },
      nativePromise: async (p, method, opts) => {
        const tmp = document.querySelector('.curltemp');
        const c = { method, opts: JSON.parse(JSON.stringify(opts ?? {})), heads: heads(), copy: !!document.querySelector('.curlcopy'), shade: !!document.querySelector('.curlshade'), temp: tmp ? { left: tmp.style.left, width: tmp.style.width, ...(window.__duoCurl?.lastTemp ?? {}) } : null, ui: localStorage.getItem(k) };
        M.calls.push(c);
        switch (method) {
          case 'curlCaps': if (!caps) throw { code: 'UNIMPLEMENTED', message: method }; return { version: capsVersion, stage: 1, maxFps: 120, proMotionKey: true };
          case 'prepareCurl': return { ok: true, reused: false };
          case 'turnPage': if (M.turnFail) throw { code: 'UNAVAILABLE', message: 'x' }; await new Promise((r) => setTimeout(r, 30)); return { ok: true, shownMs: 5 };
          case 'backReady': await new Promise((r) => setTimeout(r, 20)); if (M.abortBack) { window.__duoCurl.clear(); } return { ok: true, ms: 12 };
          case 'webReady': await new Promise((r) => setTimeout(r, 80)); c.after = heads(); return { done: true, finished: true, perf: { engine: 'native', n: 30, p95: 8.4 } };
          case 'cancelCurl': case 'releaseCurl': case 'curlPerf': return { ok: true };
          case 'checkPermission': case 'notifyStatus': return { status: 'denied' };
          case 'getPosture': return { available: false, folded: false, regionRect: null, axis: null, angle: null, status: null, source: 'none', at: 0 };
          default: throw { code: 'UNIMPLEMENTED', message: method };
        }
      },
    };
  }, { k: UI, engine, caps, capsVersion, turnFail, abortBack, nativeOff });
  if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, SIZES.openLandscape951);
  await seed(page, EVENTS);
  await page.evaluate(() => document.documentElement.style.setProperty('--sar', '84px'));
  await expect(page.locator('.dpage')).toHaveCount(2);
  await page.waitForTimeout(200);
}
// ゆっくり動かして離す（速さ ≒ 0）
async function drag(page, x0, x1, y = 300, { hold } = {}) {
  await page.mouse.move(x0, y); await page.mouse.down();
  const n = 12; for (let i = 1; i <= n; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / n, y); await page.waitForTimeout(16); }
  await page.waitForTimeout(220); // 止めてから離す（払いにしない）
  if (hold) await hold();
  await page.mouse.up();
}
const settle = (page) => expect.poll(async () => (await st(page)).busy, { timeout: 5000 }).toBe(false);

test.describe('第18.5版：iOS のめくりは止めてある', () => {
  test('duo-curl-engine が native でも今のめくり（A）。DuoNative の curlCaps も呼ばない。設定の「めくりの方式（試作）」は出ない', async ({ page }) => {
    await land(page, { engine: 'native' });
    expect((await st(page)).mode).toBe('curl');
    expect(await page.evaluate(() => localStorage.getItem('duo-curl-engine'))).toBe('native'); // 保存は消さない
    await page.mouse.move(700, 300); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(700 - 30 * i, 300); await page.waitForTimeout(16); }
    await page.mouse.up(); await settle(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    const ms = (await calls(page)).map((c) => c.method);
    for (const m of ['curlCaps', 'prepareCurl', 'turnPage', 'backReady', 'webReady']) expect(ms, m).not.toContain(m);
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('#menu [data-go="details"]').click();
    await expect(page.locator('#m-curl')).toBeHidden();
  });
});

// 下は B を戻したとき用（native-curl.js の B_OFF を false にしたら .skip を外す）
test.describe.skip('iOS のめくり（B、1段目）', () => {
  test('前へ：触れた瞬間に左右2ページ全体を撮り、離したら turnPage（紙＝右 x485.5〜851・背 .min、覆い＝左 x8〜465.5）→ 覆いの下に仮の次の左（日は進めない）→ backReady → 下を2日先に → webReady。紙は指に付かない', async ({ page }) => {
    await land(page);
    expect((await st(page)).mode).toBe('native');
    await page.mouse.move(700, 300); await page.mouse.down();
    const prep = await calls(page, 'prepareCurl');
    expect(prep.length, '押した瞬間に撮る').toBe(1);
    expect(prep[0].opts.fwd).toEqual({ x: 485.5, y: expect.any(Number), w: 365.5, h: expect.any(Number) });
    expect(prep[0].opts.back).toEqual({ x: 8, y: expect.any(Number), w: 457.5, h: expect.any(Number) }); // 18.3：左ページ全体（日付・時刻の列も）
    const m = await page.evaluate(() => __duoCurl.metrics());
    expect(prep[0].opts.fwd.y).toBe(m.py0); expect(prep[0].opts.fwd.h).toBe(m.py1 - m.py0);
    for (let i = 1; i <= 12; i++) { await page.mouse.move(700 - 25 * i, 300); await page.waitForTimeout(16); }
    const s = await st(page);
    expect(s.native).toBe(true); expect(s.canvas, 'WebGL の canvas は作らない').toBe(false);
    expect(s.shade.dir).toBe('forward'); expect(s.shade.w).toBe(24); expect(s.shade.x).toBe(851 - 24);
    expect(s.shade.armed, '境目を越えたら濃く').toBe(true); expect(s.shade.a).toBeCloseTo(0.12, 5);
    await page.waitForTimeout(220); await page.mouse.up();
    await settle(page);
    const tp = await calls(page, 'turnPage'), wr = await calls(page, 'webReady'), br = await calls(page, 'backReady');
    expect(tp.length).toBe(1); expect(wr.length).toBe(1); expect(br.length).toBe(1);
    expect(tp[0].opts).toMatchObject({ dir: 'forward', spine: 'min', animDir: 'forward', next: 'clear', rect: { x: 485.5, w: 365.5 }, cover: { x: 8, w: 457.5 } });
    const order = (await calls(page)).map((c) => c.method).filter((x) => ['turnPage', 'backReady', 'webReady'].includes(x));
    expect(order).toEqual(['turnPage', 'backReady', 'webReady']);
    expect(br[0].opts.rect, '裏は着地先の左ページ全体').toMatchObject({ x: 8, w: 457.5 });
    expect(br[0].heads, '決定 F：裏を撮るときも日は進めない').toEqual(['11月12日（木）', '11月13日（金）']);
    expect(br[0].temp, '覆いの下に仮の次の左（14日）').toMatchObject({ day: '2026-11-14', kind: 'L', left: '8px', width: '457.5px' });
    expect(JSON.parse(br[0].ui).selected, '仮の表示は保存しない').toBe('2026-11-12');
    expect(wr[0].temp, 'webReady の前に仮の表示は外す').toBe(null);
    expect(tp[0].heads, 'turnPage のときはまだ今の日').toEqual(['11月12日（木）', '11月13日（金）']);
    expect(tp[0].shade, '紙を出す前に帯を消す').toBe(false);
    expect(wr[0].heads, 'webReady の前に下の DOM は着地後').toEqual(['11月14日（土）', '11月15日（日）']);
    expect(wr[0].copy, '動かない側はネイティブの覆い（Web の写しは使わない）').toBe(false);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    expect(await page.locator('.curltemp, .curlcopy').count()).toBe(0);
    expect(await page.evaluate(() => window.__duoCurlNative.perf.length)).toBe(1);
  });

  test('戻る：左ページ全体 x8〜465.5 を紙に（背 .max・reverse）、覆いは右 x485.5〜851、裏は仮の次の右（11日）。左の帯の入れ替えはしない。2日戻る', async ({ page }) => {
    await land(page);
    await drag(page, 200, 520);
    await settle(page);
    const tp = await calls(page, 'turnPage'), br = await calls(page, 'backReady');
    expect(tp.length).toBe(1);
    expect(tp[0].opts).toMatchObject({ dir: 'backward', spine: 'max', animDir: 'reverse', rect: { x: 8, w: 457.5 }, cover: { x: 485.5, w: 365.5 } });
    expect(br[0].opts.rect).toMatchObject({ x: 485.5, w: 365.5 });
    expect(br[0].temp).toMatchObject({ day: '2026-11-11', kind: 'R', left: '485.5px' });
    expect(br[0].heads).toEqual(['11月12日（木）', '11月13日（金）']);
    expect(await heads(page)).toEqual(['11月10日（火）', '11月11日（水）']);
    const s = await st(page); expect(s.busy).toBe(false);
  });

  test('戻りの陰の帯は左ページの左端 x8 の内側', async ({ page }) => {
    await land(page);
    await page.mouse.move(200, 300); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(200 + 25 * i, 300); await page.waitForTimeout(16); }
    const s = await st(page); expect(s.shade.dir).toBe('backward'); expect(s.shade.x).toBe(8); expect(s.shade.w).toBe(24);
    await page.waitForTimeout(220); await page.mouse.up(); await settle(page);
  });

  test('裏を撮っている途中でやめた（閉じた・裏に回った）：仮の表示を外し、日・選んだ日・保存は元のまま。ネイティブの紙は外す', async ({ page }) => {
    await land(page, { abortBack: true });
    await drag(page, 700, 400);
    await settle(page);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('duo.ui.v1'))).selected).toBe('2026-11-12');
    expect(await page.locator('.curltemp').count()).toBe(0);
    expect((await calls(page, 'webReady')).length).toBe(0);
    expect((await calls(page, 'cancelCurl')).length).toBeGreaterThan(0);
  });

  test('境目の手前で離す：turnPage を呼ばず、帯を消して何も起こさない。描き直していなければ撮った絵を使い回す（prepareCurl は1回）', async ({ page }) => {
    await land(page);
    await drag(page, 700, 640, 300, { hold: async () => { const s = await st(page); expect(s.shade.armed).toBe(false); expect(s.shade.w).toBe(15); expect(s.shade.a).toBeCloseTo(0.05, 5); } });
    await settle(page);
    expect((await calls(page, 'turnPage')).length).toBe(0);
    await expect.poll(() => page.locator('.curlshade').count()).toBe(0);
    expect(await heads(page)).toEqual(['11月12日（木）', '11月13日（金）']);
    await drag(page, 700, 650);
    await settle(page);
    expect((await calls(page, 'prepareCurl')).length, '同じ rev・同じスクロール').toBe(1);
    // めくって描き直したら撮り直す
    await drag(page, 700, 400); await settle(page);
    await drag(page, 700, 650); await settle(page);
    expect((await calls(page, 'prepareCurl')).length).toBe(2);
  });

  test('A に戻る：視差効果を減らす／古い DuoNative（curlCaps なし）／Web 版。設定は今のめくりが既定', async ({ page, browser }) => {
    await land(page, { reduce: true });
    expect((await st(page)).mode).toBe('reduce');
    const p2 = await browser.newPage({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
    await land(p2, { caps: false });
    expect((await st(p2)).mode, '古い DuoNative').not.toBe('native');
    await p2.close();
    const p4 = await browser.newPage({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
    await land(p4, { capsVersion: 1 });
    expect((await st(p4)).mode, '18.3 より前の DuoNative（version 1）').not.toBe('native');
    await p4.close();
    const p3 = await browser.newPage({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
    await land(p3, { engine: null });
    expect(await p3.evaluate(() => localStorage.getItem('duo-curl-engine'))).toBe(null);
    expect((await st(p3)).mode, '既定は今のめくり').not.toBe('native');
    await p3.close();
  });

  test('turnPage が失敗：その1回は 0.15 秒の入れ替えで進め、この起動の間は A', async ({ page }) => {
    await land(page, { turnFail: true });
    await drag(page, 700, 400);
    await settle(page);
    expect(await heads(page)).toEqual(['11月14日（土）', '11月15日（日）']);
    expect((await st(page)).mode).not.toBe('native');
    expect((await calls(page, 'webReady')).length).toBe(0);
  });

  test('設定 › 詳細「めくりの方式（試作）」：今のめくり｜iOS のめくり。localStorage duo-curl-engine に保存し、duo.ui.v1 には入れない', async ({ page }) => {
    await land(page, { engine: null });
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('#menu [data-go="details"]').click();
    await expect(page.locator('#m-curl-t')).toHaveText('めくりの方式（試作）');
    await expect(page.locator('#m-curl-web')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#m-curl-native')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#m-curl-native').click();
    await expect(page.locator('#m-curl-native')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('duo-curl-engine'))).toBe('native');
    await expect(page.locator('#m-curl-d')).toContainText('指を離すと iOS のめくり');
    expect(await page.evaluate(() => localStorage.getItem('duo.ui.v1'))).not.toContain('curl');
    await page.locator('#m-curl-web').click();
    expect(await page.evaluate(() => localStorage.getItem('duo-curl-engine'))).toBe('web');
  });

  test('Web 版（DuoNative なし）では iOS のめくりは選べない', async ({ page }) => {
    await land(page, { engine: 'native', nativeOff: true });
    expect((await st(page)).mode).not.toBe('native');
    await page.locator('[data-act="menu"]:visible').first().click();
    await page.locator('#menu [data-go="details"]').click();
    await expect(page.locator('#m-curl-native')).toBeDisabled();
    await expect(page.locator('#m-curl-d')).toContainText('iPhone のアプリだけ');
  });
});
