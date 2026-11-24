import { test, expect } from '@playwright/test';
import { openApp, loadSample, SIZES, tab, seed, ev, period, monthFormInit, setStyle } from './helpers.js';

// PR24: 共通制御（DOM 接続）。画面への本接続は次PR。ここでは initDirectInput を単体の場にぶら下げて確認する。
const setup = (page) => page.evaluate(async () => {
  const { initDirectInput } = await import('./js/direct-input.js');
  const { initSwipe } = await import('./js/swipe.js');
  const host = document.createElement('div');
  host.id = 'di'; host.style.cssText = 'position:fixed;left:40px;top:100px;width:300px;height:300px;background:#eee;z-index:99999';
  document.body.append(host);
  const w = window; w.__di = { log: [], clicks: 0, swipes: 0 };
  host.addEventListener('click', () => w.__di.clicks++);
  const sw = initSwipe({ root: host, canStart: () => true, onSwipe: () => w.__di.swipes++ });
  w.__dc = initDirectInput({ root: host, swipe: sw, classify: () => ({ kind: 'time' }),
    onStart: () => w.__di.log.push('start'), onMove: () => w.__di.log.push('move'),
    onEnd: () => w.__di.log.push('end'), onCancel: (c) => w.__di.log.push('cancel:' + c.reason) });
});
const log = (page) => page.evaluate(() => window.__di);

test.describe('direct-input DOM', () => {
  test.beforeEach(async ({ page }) => { await openApp(page, SIZES.openPortrait); await loadSample(page); await setup(page); });

  test('短い押下は確定せず click が通る', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
    const d = await log(page); expect(d.log).toEqual([]); expect(d.clicks).toBe(1);
  });
  test('長押し確定→drag→up で end、後続 click と swipe を抑止', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(250, 152, { steps: 5 }); await page.mouse.up();
    const d = await log(page);
    expect(d.log[0]).toBe('start'); expect(d.log.at(-1)).toBe('end');
    expect(d.swipes).toBe(0); expect(d.clicks).toBe(0);
  });
  test('長押し前に大きく動けば通常の swipe（確定しない）', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.mouse.move(250, 152, { steps: 5 }); await page.mouse.up();
    const d = await log(page); expect(d.log).toEqual([]); expect(d.swipes).toBe(1);
  });
  test('hidden で清掃され、続く up は無反応', async ({ page }) => {
    await page.mouse.move(100, 150); await page.mouse.down(); await page.waitForTimeout(420);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.mouse.up();
    const d = await log(page); expect(d.log).toEqual(['start', 'cancel:hidden']);
    expect(await page.evaluate(() => window.__dc.state)).toBe('idle');
  });
});

// ---- PR25: 時間軸への接続 ----
const hhOfCol = (page, sel) => page.locator(sel).first().evaluate((c) => parseFloat(getComputedStyle(c.closest('.tl')).getPropertyValue('--hh')));
// 指定時刻が時間軸の中央に来るようスクロールしてから、その列の座標を返す。
const pointAt = (page, min, nth = 0, sel = '.tlcol') => page.locator(sel).nth(nth).evaluate((c, min) => {
  const tl = c.closest('.tl'), h = parseFloat(getComputedStyle(tl).getPropertyValue('--hh'));
  tl.scrollTop = Math.max(0, 12 + min * h / 60 - tl.clientHeight / 2);
  // 第19.2版 S11e（design/34 §15-④）: 閉じた画面の「日」は日の欄（.mday）の時間軸 B。時間軸そのものは送れず、日の欄が1本で送られるので、日の欄を送って見出し 44 と下のつまみ（S11f §16-1）の間の中央へ持ってくる
  // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦の日の欄は中でスクロールしない（画面 .mpull.browse の1本）。開いたときは最初の予定の1時間前より上を畳んでいるので、その時刻が畳んだ所なら「前の時間」で開いてから、画面を送って貼り付いた見出し（年月＋曜日 64）と下のつまみの間の中央へ持ってくる（前: .mday.scrollTop を送る）
  const md = c.closest('.mpull.browse .mday');
  if (md && tl.matches('[data-fs]')) { // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 時間軸は伸び縮みする（予定のある時間だけ広がる）ので、位置は時刻の目盛り（.hlab。本当の分は data-rm、線は 7 下）の間を割って出す。見せる範囲（9:00〜最後の予定の1時間後）の外は「すべての時間」で開いてから
    const lab = (m) => md.querySelector(`.hlab[data-rm="${m}"]`);
    if (lab(Math.floor(min / 60) * 60).hidden || (lab(Math.floor(min / 60) * 60 + 60)?.hidden ?? false)) md.querySelector('.mdfold button')?.click();
    const yOf = (m) => { const h0 = Math.floor(m / 60) * 60, a = lab(h0).getBoundingClientRect().top + 7, b = h0 + 60 >= 1440 ? a + h : lab(h0 + 60).getBoundingClientRect().top + 7; return a + (m - h0) / 60 * (b - a); };
    const sec = md.closest('.mpull.browse'), s = sec.getBoundingClientRect(); sec.scrollTop += yOf(min) + 1 - (s.top + 64 + (s.height - 64 - 85) / 2);
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: yOf(min) + 1 };
  }
  if (md) { const sec = md.closest('.mpull.browse'); if (min < (Number(tl.style.getPropertyValue('--foldm')) || 0)) md.querySelector('.mdfold button')?.click(); const y0 = c.getBoundingClientRect().top + 12 + min * h / 60 + 1, s = sec.getBoundingClientRect(); sec.scrollTop += y0 - (s.top + 64 + (s.height - 64 - 85) / 2); }
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + 12 + min * h / 60 + 1 };
}, min);
async function scrollTo(page, sel, top) { await page.locator(sel).first().evaluate((e, t) => { e.scrollTop = t; const md = e.closest('.mpull.browse .mday'); if (md) { if (!t) md.querySelector('.mdfold button')?.click(); md.closest('.mpull.browse').scrollTop = t; } /* v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦は画面（.mpull.browse）の1本が送られる。一番上（0）は、畳んである終日の行・早い時刻を「前の時間」で開いた上で画面の一番上（前: .mday.scrollTop） */ }, top); }
async function press(page, p, ms = 420) { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(ms); }
const dbCount = (page) => page.evaluate(async () => (await (await import('./js/db.js')).listEvents()).length);

for (const [name, size, setup2] of [
  ['開いた横（右ページ）', SIZES.openLandscape951, async () => {}],
  // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 閉じた画面の「時間」の詰めた形（1時間 14）は、空きをたたく・長押しすると、枠を作らずに広げた形（1時間 56）へ変わるだけ（tests/v195-day-time.spec.js）。枠を作って直すのは広げた形なので、広げてから始める
  ['閉じた縦の日', SIZES.closedPortrait, async (page) => { await tab(page, '日').click(); await page.locator('.mpull.browse .mdgrab').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200); }],
]) {
  test.describe(`時間軸の直接入力 ${name}`, () => {
    test.beforeEach(async ({ page }) => { if (name === '閉じた縦' || name === '開いた縦') await monthFormInit(page); /* 第19版 PR6: 月を引く画面の「月」の型（11/25 まで見える） */ await openApp(page, size); await setup2(page); await expect(page.locator('.tlcol').first()).toBeVisible(); });

    test('長押しで30分の枠→下へ伸ばす→離すとシート。保存は1回だけ', async ({ page }) => {
      const p = await pointAt(page, 10 * 60 + 5); // 10:05 → 10:00
      await press(page, p);
      await expect(page.locator('.dbox')).toHaveCount(1);
      await expect(page.locator('.dbox .ds')).toHaveText('10:00〜10:30（30分）');
      expect(await dbCount(page)).toBe(0);
      const hh = await hhOfCol(page, '.tlcol');
      await page.mouse.move(p.x, p.y + hh * 1.5, { steps: 5 }); // +90分 → 11:30
      await expect(page.locator('.dbox .ds')).toHaveText('10:00〜11:30（1時間30分）');
      await expect(page.locator('.dtag')).toHaveText(['10:00', '11:30']);
      await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-stime')).toContainText('10:00');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-etime')).toContainText('11:30');
      await expect(page.locator('#f-title')).toBeFocused();
      await expect(page.locator('.dbox .hdl')).toHaveCount(0); // シート中は取っ手なし
      expect(await dbCount(page)).toBe(0);
      await page.locator('#f-title').fill('直接入力');
      await page.locator('#form [type=submit]').click();
      await expect(page.locator('.tlev', { hasText: '直接入力' })).toHaveCount(1);
      await expect(page.locator('.dbox')).toHaveCount(0);
      expect(await dbCount(page)).toBe(1);
    });

    test('上へ動かすと触れた時刻が終わり。日の端で clamp。キャンセルで枠が消えDB0', async ({ page }) => {
      const p = await pointAt(page, 12 * 60);
      await press(page, p);
      const hh = await hhOfCol(page, '.tlcol');
      await page.mouse.move(p.x, p.y - hh * 0.5, { steps: 4 });
      await expect(page.locator('.dbox .ds')).toHaveText('11:30〜12:00（30分）');
      await page.mouse.up();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-stime')).toContainText('11:30');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-etime')).toContainText('12:00');
      await page.keyboard.press('Escape');
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('.dbox')).toHaveCount(0);
      expect(await dbCount(page)).toBe(0);
    });

    test('短tap→1時間の仮枠、枠の外で消える、枠の再tapでシート、取っ手で長さを直せる', async ({ page }) => {
      const p = await pointAt(page, 14 * 60 + 20); // 14:20 → 14:15
      await page.mouse.click(p.x, p.y);
      await expect(page.locator('#editor')).toBeHidden();
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:15（1時間）');
      await expect(page.locator('.dbox .hdl')).toHaveCount(2);
      const far = await pointAt(page, 17 * 60 + 20); // 仮枠から離れた同じ列の空き
      await page.waitForTimeout(450);
      await page.mouse.click(far.x, far.y);
      await expect(page.locator('.dbox')).toHaveCount(0);
      const p2 = await pointAt(page, 14 * 60 + 20);
      await page.mouse.click(p2.x, p2.y);
      // 終わりの取っ手を下へ（+30分）
      const hh = await hhOfCol(page, '.tlcol');
      const h = await page.locator('.hdl-e').boundingBox();
      const o = hh < 60 ? 6 : 0; // 閉じた日は 1時間 44（第19版 PR5）。1時間の枠は 60 未満の「短い枠」で、取っ手の押せる範囲は枠の外側（direct-input.js hitDraftPart）
      await page.mouse.move(h.x + 6, h.y + 6 + o); await page.mouse.down(); await page.mouse.move(h.x + 6, h.y + 6 + o + hh / 2, { steps: 4 }); await page.mouse.up();
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:45（1時間30分）');
      await expect(page.locator('#editor')).toBeHidden();
      await page.waitForTimeout(450);
      await page.locator('.dbox').click({ position: { x: 20, y: 20 } });
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-stime')).toContainText('14:15');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-etime')).toContainText('15:45');
    });

    test('仮枠は内側を引くと同じ日の中で15分刻みに動く。8pt以下はシート、端ではみ出さない', async ({ page }) => {
      const p = await pointAt(page, 14 * 60 + 20);
      await page.mouse.click(p.x, p.y);
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:15（1時間）');
      await page.waitForTimeout(450);
      const hh = await hhOfCol(page, '.tlcol');
      const b = await page.locator('.dbox').boundingBox();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const day = await page.locator('.dbox').evaluate((n) => n.closest('.tlcol').dataset.day);
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy + hh / 2, { steps: 5 }); await page.mouse.up();
      await expect(page.locator('.dbox .ds')).toHaveText('14:45〜15:45（1時間）');
      await expect(page.locator('#editor')).toBeHidden();
      expect(await page.locator('.dbox').evaluate((n) => n.closest('.tlcol').dataset.day)).toBe(day);
      await page.waitForTimeout(500);
      // 8pt 以下はたたき → シート
      const b2 = await page.locator('.dbox').boundingBox();
      await page.mouse.move(b2.x + b2.width / 2, b2.y + 20); await page.mouse.down(); await page.mouse.move(b2.x + b2.width / 2, b2.y + 24, { steps: 2 }); await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#editor')).toBeHidden();
      // 上端: 0:00 より上へは出ない
      await page.waitForTimeout(450);
      const q = await pointAt(page, 60);
      await page.mouse.click(q.x, q.y);
      const b3 = await page.locator('.dbox').boundingBox();
      await page.waitForTimeout(450);
      await page.mouse.move(b3.x + b3.width / 2, b3.y + 20); await page.mouse.down(); await page.mouse.move(b3.x + b3.width / 2, b3.y - 200, { steps: 6 }); await page.mouse.up();
      await expect(page.locator('.dbox .ds')).toHaveText(/^00:00〜01:00/);
      await expect(page.locator('#editor')).toBeHidden();
    });

    test('仮枠の✕で取り消し、丸の中心16pt以内は長さ・内側は移動、VoiceOver用の15分操作', async ({ page }) => {
      const p = await pointAt(page, 14 * 60 + 20);
      await page.mouse.click(p.x, p.y);
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:15（1時間）');
      await page.waitForTimeout(450);
      const hh = await hhOfCol(page, '.tlcol');
      // 15分操作（読み上げ用ボタン）
      await page.locator('.dbox [data-nudge="later"]').dispatchEvent('click');
      await expect(page.locator('.dbox .ds')).toHaveText('14:30〜15:30（1時間）');
      await page.locator('.dbox [data-nudge="earlier"]').dispatchEvent('click');
      await page.locator('.dbox [data-nudge="longer"]').dispatchEvent('click');
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:30（1時間15分）');
      await page.locator('.dbox [data-nudge="shorter"]').dispatchEvent('click');
      await expect(page.locator('.dbox .ds')).toHaveText('14:15〜15:15（1時間）');
      await expect(page.locator('#editor')).toBeHidden();
      // 丸の中心の下 30pt（16pt より内側）から引くと移動
      const hs = await page.locator('.hdl-s').boundingBox();
      const sx = hs.x + 7, sy = hs.y + 7;
      // v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 閉じた日の「時間・最低限」は1時間 28（前 44）で、1時間の仮枠の高さが 28。丸の真下 30 は枠の外になるので、枠の中央（どちらの丸からも 16 より遠い内側）から引く（前: 丸の中心の下 30 → 後: 1時間が 40 未満のときは枠の中央）。見ること（内側から引くと移動）は同じ
      const bx = await page.locator('.dbox').boundingBox(), [mx, my] = hh < 40 ? [bx.x + bx.width / 2, bx.y + bx.height / 2] : [sx, sy + 30];
      await page.mouse.move(mx, my); await page.mouse.down(); await page.mouse.move(mx, my + hh / 2, { steps: 5 }); await page.mouse.up();
      await expect(page.locator('.dbox .ds')).toHaveText('14:45〜15:45（1時間）');
      await page.waitForTimeout(500);
      // 丸の中心から引くと長さ
      const hs2 = await page.locator('.hdl-s').boundingBox();
      const o2 = hh < 60 ? -6 : 0; // 短い枠（1時間 44）は取っ手の押せる範囲が枠の外側
      const e2 = hh < 40 ? 0 : o2; // v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: 閉じた日の時間・最低限は1時間 28。外側から押した 6 は 13 分ぶんで 15 分刻みを 1 つ食うので、離す所は丸の中心から 30 分ぶん下（前: 押した所から 30 分ぶん下）
      await page.mouse.move(hs2.x + 7, hs2.y + 7 + o2); await page.mouse.down(); await page.mouse.move(hs2.x + 7, hs2.y + 7 + e2 + hh / 2, { steps: 5 }); await page.mouse.up();
      await expect(page.locator('.dbox .ds')).toHaveText('15:15〜15:45（30分）');
      await page.waitForTimeout(500);
      // ✕で取り消し（シートは開かない）
      const x = await page.locator('.dbox .dx').boundingBox();
      expect(x.width).toBe(20);
      await page.mouse.click(x.x + 10, x.y + 10);
      await expect(page.locator('.dbox')).toHaveCount(0);
      await expect(page.locator('#editor')).toBeHidden();
    });

    test('既存予定の上の長押しは新しい予定にならない（第19版 PR8: 月と同じ画面ではつかむ。月でない所で離せば取りやめ）。終日段の長押しは終日シート', async ({ page }) => {
      await seed(page, [ev('x1', '既存', '2026-11-12T10:00', '2026-11-12T11:00')]);
      const b = await page.locator('.tlev').first().boundingBox();
      await press(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
      await expect(page.locator('.dbox')).toHaveCount(0);
      // S11e（34 §15-④）: 閉じた画面の「日」はカレンダーの日の欄なので月のマスが同じ画面に見えるが、閉じた画面で長押しでつかめるのは格子のチップだけ（grabAllowed は開いた画面だけ。0568d18 から変えていない）。日の欄の枠は今までどおり離すと編集シート
      // v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更（「カードはそのままカレンダーの別日に移動できる」）: 閉じた画面の日の欄の枠・カードも長押しでつかめるようになった（前: 閉じた縦の日は離すと編集シートが開く → 後: 月が見えていればつかむ。同じ場所で離せば取りやめ）
      if (await page.locator('.week .day[data-date]').first().isVisible().catch(() => false)) { // PR8: 月と同じ画面ではつかむ。月の日の上でなく同じ場所で離すので取りやめ（編集シートも開かない）
        await expect(page.locator('.gchip')).toHaveCount(1);
        await page.mouse.up();
        await expect(page.locator('#editor')).toBeHidden();
        await expect(page.locator('.gchip')).toHaveCount(0);
      } else { // 閉じた画面などは今までどおり、離すと既存予定の編集シートが開く（新規入力ではない）
        await page.mouse.up();
        await expect(page.locator('#f-title')).toHaveValue('既存');
        await page.keyboard.press('Escape');
        await expect(page.locator('#editor')).toBeHidden();
      }
      await page.waitForTimeout(450);
      if (!(await page.locator('.adcol').count())) return; // v19.5 で仕様変更: 閉じた画面の「時間」に「終日」の行は無い（終日の予定はカードと同じ色の札。終日の予定を足すのは ＋ から）
      await scrollTo(page, '.tl', 0); // 閉じた画面の日の欄では、終日の段は時間軸と一緒に送られる（一番上へ戻してから押す）
      const a = await page.locator('.adcol').first().boundingBox();
      await press(page, { x: a.x + a.width / 2, y: a.y + a.height / 2 });
      await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-all')).toBeChecked();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
    });

    test('23時台の長押しは日末で clamp（30分が収まる）', async ({ page }) => {
      await scrollTo(page, '.tl', 99999);
      const p = await pointAt(page, 23 * 60 + 50);
      await press(page, p); await page.mouse.up();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-stime')).toContainText('23:30');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-etime')).toContainText('23:59');
    });
  });
}

test.describe('閉じた週の時間軸', () => {
  test('7列・狭幅は横スクロール。列の長押しでその日に入る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait); await tab(page, '週').click();
    await expect(page.locator('.tlcol')).toHaveCount(7);
    const x = await page.locator('.tlx').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(x.sw).toBeGreaterThanOrEqual(x.cw);
    await scrollTo(page, '.tl', 500);
    const day = await page.locator('.tlcol').nth(2).getAttribute('data-day');
    const p = await pointAt(page, 9 * 60, 2);
    await press(page, p); await page.mouse.up();
    await expect(page.locator('#f-start')).toHaveJSProperty('value', day.replaceAll('-', '/'));
    await expect(page.locator('#f-stime')).toContainText('9:00');
  });
});

// PR26: 月のドラッグから期間予定
const dayCenter = (page, key) => page.locator(`.day[data-date="${key}"]`).first().evaluate((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 6 }; });
async function monthPress(page, a) {
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(420);
}
for (const [name, size, setup2] of [
  ['閉じた縦', SIZES.closedPortrait, async (page) => { await tab(page, '月').click(); }],
  ['開いた縦', SIZES.openPortrait, async () => {}],
  ['開いた横', SIZES.openLandscape951, async () => {}],
  ['全表示', SIZES.closedPortrait, async (page) => { await tab(page, '月').click(); await setStyle(page, '全部'); }], // 閉じた画面の「全部」は「…」→「月の表現」（design/34 §9.1-2）
]) {
  test.describe(`月の期間入力 ${name}`, () => {
    test.beforeEach(async ({ page }) => { if (name === '閉じた縦' || name === '開いた縦') await monthFormInit(page); /* 第19版 PR6: 月を引く画面の「月」の型（11/25 まで見える） */ await openApp(page, size); await setup2(page); await expect(page.locator('.day[data-date="2026-11-18"]').first()).toBeVisible(); });

    // 第19.2版 S11d（design/34 §9.4・設計レビュー 7c9fb05 M4）: 閉じた7段では、チップのない所を長押ししても何もしない（期間の札・枠・メニュー・シートは出ない）。
    // 期間を選ぶのは読み上げ用の隠れた「期間を選ぶ」だけ（下の「VoiceOver 代替」の試験）。新しい予定は「＋」から。開いた縦・開いた横・「全部」の月は今までどおり。
    if (name === '閉じた縦') {
      test('閉じた7段: チップのない所を長押し→横へ滑らせても、札も枠も出ず、離しても何も開かない。DBは0のまま（34 §9.4・M4）', async ({ page }) => {
        const a = await dayCenter(page, '2026-11-18'), b = await dayCenter(page, '2026-11-20');
        await monthPress(page, a);
        await expect(page.locator('.day.msel')).toHaveCount(0);
        await expect(page.locator('.mrtag')).toHaveCount(0);
        await page.mouse.move(b.x, a.y, { steps: 6 }); // 横へ滑らせる（縦は段の引きになる。M9）
        await expect(page.locator('.day.msel')).toHaveCount(0);
        await expect(page.locator('.mrtag')).toHaveCount(0);
        await page.mouse.up();
        await page.waitForTimeout(300);
        await expect(page.locator('#editor')).toBeHidden();
        await expect(page.locator('.cmenu')).toHaveCount(0);
        expect(await dbCount(page)).toBe(0);
      });
      test('閉じた7段: 1日だけ長押しして離しても、小さなメニュー（終日の予定／この日のノート）は出ない。その日は選ばれない（34 §9.4・M4）', async ({ page }) => {
        const a = await dayCenter(page, '2026-11-20');
        await monthPress(page, a); await page.waitForTimeout(300); await page.mouse.up();
        await page.waitForTimeout(300);
        await expect(page.locator('.cmenu')).toHaveCount(0);
        await expect(page.locator('[role="menu"]:visible')).toHaveCount(0);
        await expect(page.locator('#editor')).toBeHidden();
        await expect(page.locator('.day.msel')).toHaveCount(0);
        expect(await dbCount(page)).toBe(0);
      });
    } else {
    test('長押し→週をまたいで滑らせる→札と枠→離すと終日の期間シート。DBは0のまま', async ({ page }) => {
      const a = await dayCenter(page, '2026-11-18'), b = await dayCenter(page, '2026-11-25');
      await monthPress(page, a);
      await expect(page.locator('.day.msel')).toHaveCount(1);
      await expect(page.locator('.mrtag')).toHaveText('11月18日（1日）');
      await page.mouse.move(b.x, b.y, { steps: 6 });
      await expect(page.locator('.mrtag')).toHaveText('11月18日〜25日（8日間）');
      await expect(page.locator('.day.msel')).toHaveCount(8);
      expect(await dbCount(page)).toBe(0);
      await page.mouse.up();
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-all')).toBeChecked();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/18');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/25');
      expect(await dbCount(page)).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('.day.msel')).toHaveCount(0);
      await expect(page.locator('.mrtag')).toHaveCount(0);
      expect(await dbCount(page)).toBe(0);
    });

    test('逆方向は正規化され、1日だけ離すとその日の終日シート。保存は1回', async ({ page }) => {
      const a = await dayCenter(page, '2026-11-20'), b = await dayCenter(page, '2026-11-18');
      await monthPress(page, a); await page.mouse.move(b.x, b.y, { steps: 6 });
      await expect(page.locator('.mrtag')).toHaveText('11月18日〜20日（3日間）');
      await page.mouse.up();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/18');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/20');
      await page.keyboard.press('Escape');
      await expect(page.locator('#editor')).toBeHidden(); // S4: シートは閉じる動き（0.25秒）が終わってから閉じる
      await monthPress(page, a); await page.mouse.up();
      await expect(page.locator('#editor')).toBeHidden(); // 1日だけ離したら小さなメニュー（第17版 PR3）
      await page.locator('.cmenu [data-dm="ev"]').click();
      await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/20');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/20');
      await page.locator('#f-title').fill('期間');
      await page.locator('#form [type=submit]').click();
      await expect.poll(() => dbCount(page)).toBe(1);
    });
    }

    test('通常tapは日選択のまま。短い押下の後に期間選択は出ない', async ({ page }) => {
      const a = await dayCenter(page, '2026-11-19');
      await page.mouse.click(a.x, a.y);
      await expect(page.locator('.day.msel')).toHaveCount(0);
      await expect(page.locator('.mrtag')).toHaveCount(0);
      await expect(page.locator('#editor')).toBeHidden();
    });
  });
}

test.describe('月の期間入力 その他', () => {
  test('スワイプ（長押し前の横移動）は月送りのまま・チップ起点は期間選択しない', async ({ page }) => {
    await openApp(page, SIZES.openPortrait); await seed(page, [ev('m1', '帯予定', '2026-11-17T00:00', '2026-11-19T23:59', { all: true }), ev('m2', '時刻予定', '2026-11-20T10:00', '2026-11-20T11:00')]);
    const chip = page.locator('.strip, .bar').first();
    const r = await chip.evaluate((n) => { const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.down(); await page.waitForTimeout(420);
    await expect(page.locator('.day.msel')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator('.mrtag')).toHaveCount(0);
    if (await page.locator('#editor').isVisible()) await expect(page.locator('#f-title')).not.toHaveValue(''); // 既存予定の通常の click（新規入力ではない）
    expect(await dbCount(page)).toBe(2);
  });
  test('長押し中の hidden で取り消され、枠も札も消える', async ({ page }) => {
    await monthFormInit(page); await openApp(page, SIZES.openPortrait); // S11d: 閉じた7段は長押しの期間選択がない（34 §9.4・M4）ので、同じ取り消しを開いた縦で見る
    const a = await dayCenter(page, '2026-11-18');
    await monthPress(page, a);
    await expect(page.locator('.day.msel')).toHaveCount(1);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(page.locator('.day.msel')).toHaveCount(0);
    await expect(page.locator('.mrtag')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeHidden();
    expect(await dbCount(page)).toBe(0);
  });
  test('VoiceOver 代替「期間を選ぶ」: 終了日をボタンで動かして入力', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait); await tab(page, '月').click();
    await page.locator('.mrpick').first().focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.mrbar')).toBeVisible();
    await page.locator('[data-mr="fwd"]').click(); await page.locator('[data-mr="fwd"]').click();
    await expect(page.locator('.mrtag')).toHaveText('11月12日〜14日（3日間）');
    await page.locator('[data-mr="ok"]').click();
    await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
    await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/14');
    expect(await dbCount(page)).toBe(0);
  });
});

// ---- PR27: 端スクロールと触覚 ----
const HAPTIC_MOCK = () => {
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
const tlRect = (page, nth = 0) => page.locator('.tl').nth(nth).evaluate((t) => { const r = t.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, st: t.scrollTop }; });
const scrollOf = (page) => page.locator('.tlcol').first().evaluate((c) => c.closest('.tl').scrollTop);

test.describe('端スクロール: 時間軸', () => {
  test.beforeEach(async ({ page }) => { await openApp(page, SIZES.openLandscape951); await expect(page.locator('.tlcol').first()).toBeVisible(); });

  test('下端40ptで毎秒約120ptずつ進み、枠が伸びる。中央へ戻すと止まり、逆は上へ戻る。離した後は動かない', async ({ page }) => {
    const p = await pointAt(page, 10 * 60 + 5);
    const tl = await tlRect(page);
    await press(page, p);
    const s0 = await scrollOf(page);
    await page.mouse.move(p.x, tl.bottom - 20, { steps: 4 });
    await page.waitForTimeout(1000);
    const s1 = await scrollOf(page);
    expect(s1 - s0).toBeGreaterThan(60); expect(s1 - s0).toBeLessThan(180); // 約1秒で120pt（フレームのばらつきを許す）
    const end1 = await page.evaluate(() => window.__t = document.querySelector('.dbox .ds').textContent);
    expect(end1).toMatch(/^10:00〜/); expect(end1).not.toBe('10:00〜10:30（30分）');
    await page.mouse.move(p.x, (tl.top + tl.bottom) / 2, { steps: 4 }); // 中央へ → 止まる
    await page.waitForTimeout(150);
    const s2 = await scrollOf(page); await page.waitForTimeout(400);
    expect(await scrollOf(page)).toBe(s2);
    await page.mouse.move(p.x, tl.top + 15, { steps: 4 }); // 上端 → 逆戻り（枠は縮む）
    await page.waitForTimeout(700);
    expect(await scrollOf(page)).toBeLessThan(s2);
    await page.mouse.move(p.x, tl.bottom - 20, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/12');
    await expect(page.locator('#f-stime')).toContainText('10:00');
    const s3 = await scrollOf(page); await page.waitForTimeout(400);
    expect(await scrollOf(page)).toBe(s3); // ループ解放
    expect(await dbCount(page)).toBe(0);
  });

  test('ペン: 長押しなしで即入力。端以外では動かしてもスクロールしない', async ({ page }) => {
    const p = await pointAt(page, 10 * 60 + 5);
    const s0 = await scrollOf(page);
    const fire = (type, y) => page.evaluate(({ type, x, y }) => {
      const el = type === 'pointerdown' ? document.elementFromPoint(x, y) : window;
      el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
    }, { type, x: p.x, y });
    await fire('pointerdown', p.y);
    await expect(page.locator('.dbox')).toHaveCount(1); // 350ms 待たず確定
    await fire('pointermove', p.y + 60);
    await page.waitForTimeout(300);
    expect(await scrollOf(page)).toBe(s0);
    await expect(page.locator('.dbox .ds')).not.toHaveText('10:00〜10:30（30分）');
    await fire('pointerup', p.y + 60);
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('回転（viewport 変更）で取り消され、枠が消え、スクロールも止まる。離しても何も開かない', async ({ page }) => {
    const p = await pointAt(page, 10 * 60 + 5);
    const tl = await tlRect(page);
    await press(page, p);
    await page.mouse.move(p.x, tl.bottom - 20, { steps: 3 });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await expect(page.locator('.dbox')).toHaveCount(0);
    const s = await scrollOf(page); await page.waitForTimeout(400);
    expect(await scrollOf(page)).toBe(s);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeHidden();
    expect(await dbCount(page)).toBe(0);
  });

  test('reduced motion でも端スクロールは働く', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const p = await pointAt(page, 10 * 60 + 5);
    const tl = await tlRect(page);
    await press(page, p);
    const s0 = await scrollOf(page);
    await page.mouse.move(p.x, tl.bottom - 20, { steps: 3 });
    await page.waitForTimeout(600);
    expect(await scrollOf(page)).toBeGreaterThan(s0 + 30);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
  });
});

test.describe('端スクロール: 月（滞在で前後の月）', () => {
  // S11d: 閉じた7段は長押しの期間選択がない（34 §9.4・M4）。滞在で前後の月へ送る動きは、長押しの期間選択が残る開いた縦で見る（確かめる中身は同じ）
  test.beforeEach(async ({ page }) => { await monthFormInit(page); await openApp(page, SIZES.openPortrait); await expect(page.locator('.day[data-date="2026-11-18"]').first()).toBeVisible(); });
  const gridEdge = (page) => page.evaluate(() => { const ws = [...document.querySelectorAll('.week')].map((w) => w.getBoundingClientRect()); return { top: Math.min(...ws.map((r) => r.top)), bottom: Math.max(...ws.map((r) => r.bottom)) }; });

  test('下端に600ms滞在で次の月へ1回だけ。起点の日付は保持され、離れて入り直すと再び進む', async ({ page }) => {
    const a = await dayCenter(page, '2026-11-18'), g = await gridEdge(page);
    const before = await period(page);
    await monthPress(page, a);
    await page.mouse.move(a.x, g.bottom - 12, { steps: 5 });
    await page.waitForTimeout(300);
    expect(await period(page)).toBe(before); // 600ms 未満では動かない
    await page.waitForTimeout(500);
    const after = await period(page);
    expect(after).not.toBe(before);
    await expect(page.locator('.mrtag')).toContainText('11月18日〜');
    await page.waitForTimeout(900); // 居続けても2回目は進まない
    expect(await period(page)).toBe(after);
    const g2 = await gridEdge(page);
    await page.mouse.move(a.x, (g2.top + g2.bottom) / 2, { steps: 4 });
    await page.mouse.move(a.x, g2.bottom - 12, { steps: 4 }); // 入り直し
    await page.waitForTimeout(800);
    expect(await period(page)).not.toBe(after);
    await page.mouse.up();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-all')).toBeChecked();
    await expect(page.locator('#f-start')).toHaveJSProperty('value', '2026/11/18');
    expect(await dbCount(page)).toBe(0);
  });

  test('上端に滞在で前の月、reduced motion でも動く。離した後はタイマーが残らない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const a = await dayCenter(page, '2026-11-18'), g = await gridEdge(page);
    const before = await period(page);
    await monthPress(page, a);
    await page.mouse.move(a.x, g.top + 12, { steps: 5 });
    await page.waitForTimeout(300);
    await page.mouse.up(); // 滞在中に離す → 発火しない
    await expect(page.locator('#editor')).toBeVisible();
    await page.waitForTimeout(700);
    expect(await period(page)).toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('#editor')).toBeHidden(); // S4: シートは閉じる動き（0.25秒）が終わってから閉じる
    await monthPress(page, a);
    await page.mouse.move(a.x, g.top + 12, { steps: 5 });
    await page.waitForTimeout(800);
    expect(await period(page)).not.toBe(before);
    await page.mouse.up();
  });

  test('回転で取り消すと滞在タイマーも解放され月は動かない', async ({ page }) => {
    const a = await dayCenter(page, '2026-11-18'), g = await gridEdge(page);
    const before = await period(page);
    await monthPress(page, a);
    await page.mouse.move(a.x, g.bottom - 12, { steps: 5 });
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await expect(page.locator('.day.msel')).toHaveCount(0);
    await page.waitForTimeout(900);
    expect(await period(page)).toBe(before);
    await page.mouse.up();
  });
});

test.describe('触覚', () => {
  test('ネイティブ: 長押し確定と刻み変更だけ light を呼ぶ（同じ刻みでは呼ばない）', async ({ page }) => {
    await page.addInitScript(HAPTIC_MOCK);
    await openApp(page, SIZES.openLandscape951); await expect(page.locator('.tlcol').first()).toBeVisible();
    const hap = () => page.evaluate(() => window.__hap.calls.filter((c) => c.method === 'selectionHaptic').map((c) => c.opts.kind));
    const p = await pointAt(page, 10 * 60 + 5), hh = await hhOfCol(page, '.tlcol');
    await press(page, p);
    expect(await hap()).toEqual(['light']);
    await page.mouse.move(p.x, p.y + 3); // 同じ刻み
    await page.waitForTimeout(100);
    expect(await hap()).toEqual(['light']);
    await page.mouse.move(p.x, p.y + hh * 0.5, { steps: 4 }); // +30分 = 2刻み以上
    await page.waitForTimeout(100);
    const n = (await hap()).length;
    expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(5);
    await page.mouse.up();
  });
  test('ネイティブ: 月の長押しと日の変化で light', async ({ page }) => {
    await page.addInitScript(HAPTIC_MOCK);
    await monthFormInit(page); await openApp(page, SIZES.openPortrait); // S11d: 閉じた7段は長押しの期間選択がない（34 §9.4・M4）ので開いた縦で
    const a = await dayCenter(page, '2026-11-18'), b = await dayCenter(page, '2026-11-19');
    await monthPress(page, a);
    const cnt = () => page.evaluate(() => window.__hap.calls.filter((c) => c.method === 'selectionHaptic').length);
    expect(await cnt()).toBe(1);
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await expect.poll(cnt).toBe(2);
    await page.mouse.up();
  });
  test('非ネイティブでは何も呼ばず入力は普通に動く。kind 不正は INVALID_ARGUMENT', async ({ page }) => {
    await openApp(page, SIZES.openLandscape951); await expect(page.locator('.tlcol').first()).toBeVisible();
    const p = await pointAt(page, 10 * 60 + 5);
    await press(page, p);
    await expect(page.locator('.dbox')).toHaveCount(1);
    await page.mouse.up();
    const r = await page.evaluate(async () => {
      const { haptic } = await import('./js/native.js');
      return { a: await haptic('light'), b: await haptic('warning'), c: await haptic('bad').catch((e) => e.code), d: await haptic(undefined) };
    });
    expect(r).toEqual({ a: { performed: false }, b: { performed: false }, c: 'INVALID_ARGUMENT', d: { performed: false } });
  });
});
