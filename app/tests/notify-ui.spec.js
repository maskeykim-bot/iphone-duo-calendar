// 第11版 PR4: 通知の画面（編集シートの行・通知パネル・ベル・タップ）。DuoNative は偽装で、Swift の実動作の証明ではない。
import { test, expect } from '@playwright/test';
import { notifyOn, openApp, SIZES, seed, ev, dbEvents, openMenu, pickDay as pick, fillDateTime } from './helpers.js';

async function mock(page, cfg = {}) {
  await notifyOn(page);
  await page.addInitScript((c) => {
    const M = window.__mock = { notif: c.notif ?? 'granted', after: c.after ?? 'granted', cal: c.cal ?? 'denied', calls: [], pending: [], listeners: {} };
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})) });
        switch (method) {
          case 'checkPermission': return { status: M.cal };
          case 'notifyStatus': return { status: M.notif };
          case 'requestNotifyPermission': if (M.notif === 'notDetermined') M.notif = M.after; return { status: M.notif };
          case 'notifySync': M.pending = opts.items; return { scheduled: opts.items.length, removed: 0, skipped: 0 };
          case 'notifyClear': M.pending = []; return { removed: 0 };
          case 'notifyTest': if (M.notif === 'denied') throw { code: 'PERMISSION_DENIED', message: 'x' }; return { scheduled: true };
          case 'openSettings': return { opened: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, cfg);
}
const calls = (page, m) => page.evaluate((m) => window.__mock.calls.filter((c) => c.method === m), m);
const count = (page, m) => calls(page, m).then((l) => l.length);
const add = (page) => page.locator('[data-act="add"]:visible').first().click();
const opts = (page, sel) => page.locator(sel).evaluate((s) => [...s.options].map((o) => o.textContent));
const shown = (page, id) => page.locator(id).textContent();

test.describe('編集シートの通知行', () => {
  test('新規は 30分前。終日にすると 当日 8:00、戻すと 30分前。選択肢は02の一覧どおり', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await expect(page.locator('#al0-row')).toBeVisible();
    expect(await shown(page, '#al0-v')).toBe('30分前 ›');
    expect(await opts(page, '#f-al0')).toEqual(['なし', '予定の時刻', '5分前', '10分前', '15分前', '30分前', '1時間前', '2時間前', '1日前', '2日前']);
    await page.locator('#f-all').check();
    expect(await shown(page, '#al0-v')).toBe('当日 8:00 ›');
    expect(await opts(page, '#f-al0')).toEqual(['なし', '当日 8:00', '前日 8:00', '2日前 8:00', '1週間前 8:00']);
    await page.locator('#f-all').uncheck();
    expect(await shown(page, '#al0-v')).toBe('30分前 ›');
  });

  test('終日の変換: 1日前以上は前日 8:00、それ以外は当日 8:00。2件は重複しない。なしは維持', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await page.locator('#f-al0').selectOption('b1440');
    await expect(page.locator('#al1-row')).toBeVisible();
    expect(await opts(page, '#f-al1')).not.toContain('1日前');
    await page.locator('#f-al1').selectOption('b5');
    await page.locator('#f-all').check();
    expect(await shown(page, '#al0-v')).toBe('前日 8:00 ›');
    expect(await shown(page, '#al1-v')).toBe('当日 8:00 ›');
    await page.locator('#f-all').uncheck();
    // 2件とも既定 30分前に変わるが同値は1件にまとまる
    expect(await shown(page, '#al0-v')).toBe('30分前 ›');
    await expect(page.locator('#al1-row')).toBeVisible(); // 1件のあとの「2つ目」
    expect(await shown(page, '#al1-v')).toBe('なし ›');
    await page.locator('#f-al0').selectOption('');
    await expect(page.locator('#al1-row')).toBeHidden();
    await page.locator('#f-all').check();
    expect(await shown(page, '#al0-v')).toBe('なし ›'); // 明示のなしは維持
  });

  test('1つ目をなしにすると2つ目が繰り上がる', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await page.locator('#f-al1').selectOption('b60');
    await page.locator('#f-al0').selectOption('');
    expect(await shown(page, '#al0-v')).toBe('1時間前 ›');
    await expect(page.locator('#al1-row')).toBeVisible();
  });

  test('保存すると alarms が入り、予約される。既定の通知付き予定を作れる', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await page.locator('#f-title').fill('通知つき');
    await fillDateTime(page, 'start', '2026/11/13 10:00');
    await fillDateTime(page, 'end', '2026/11/13 11:00');
    await page.locator('#f-al0').selectOption('b60');
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    expect((await dbEvents(page))[0].alarms).toEqual([{ before: 60 }]);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.map((i) => i.fireDate))).toEqual(['2026-11-13T09:00']);
  });

  test('既存の未設定の予定は、開いて保存しても既定を付けない。触ると付く', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [ev('old', '古い予定', '2026-11-13T10:00', '2026-11-13T11:00')]);
    await openEv(page, '2026-11-13', 'old');
    expect(await shown(page, '#al0-v')).toBe('なし ›');
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    expect('alarms' in (await dbEvents(page))[0]).toBe(false);
    await openEv(page, '2026-11-13', 'old');
    await page.locator('#f-al0').selectOption('b10');
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    expect((await dbEvents(page))[0].alarms).toEqual([{ before: 10 }]);
  });

  test('下書きの復元で通知の値が戻る', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await page.locator('#f-al0').selectOption('b120');
    await page.locator('#f-title').fill('下書き');
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#editor')).toBeVisible();
    expect(await shown(page, '#al0-v')).toBe('2時間前 ›');
  });

  test('過去の予定には注記。通知が全体オフなら案内（タップで通知パネル）', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await fillDateTime(page, 'start', '2026/11/01 10:00');
    await fillDateTime(page, 'end', '2026/11/01 11:00');
    await expect(page.locator('#al-note')).toHaveText('過去の予定には通知されません');
    await page.evaluate(() => localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: false })));
    await page.locator('#f-title').fill('x'); // 再描画
    await expect(page.locator('#al-off')).toBeVisible();
    await page.locator('#al-off').click();
    await expect(page.locator('#notify')).toBeVisible();
  });

  test('拒否されていると注記と設定を開くボタン', async ({ page }) => {
    await mock(page, { notif: 'denied' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await expect(page.locator('#al-perm')).toBeVisible();
    await page.locator('#al-settings').click();
    expect(await count(page, 'openSettings')).toBe(1);
  });
});

test.describe('通知の許可', () => {
  test('初めての通知付き保存で requestNotifyPermission を1回だけ。2回目は求めない', async ({ page }) => {
    await mock(page, { notif: 'notDetermined', after: 'granted' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    for (const t of ['一つ目', '二つ目']) {
      await add(page);
      await page.locator('#f-title').fill(t);
      await page.locator('#editor').getByRole('button', { name: '保存' }).click();
      await expect(page.locator('#editor')).toBeHidden();
    }
    await expect.poll(() => count(page, 'requestNotifyPermission')).toBe(1);
    await page.waitForTimeout(900);
    expect(await count(page, 'requestNotifyPermission')).toBe(1);
    await expect.poll(() => count(page, 'notifySync')).toBeGreaterThan(0);
    expect((await dbEvents(page)).length).toBe(2);
  });

  test('拒否されても保存は成立し、予約はしない。起動では要求しない', async ({ page }) => {
    await mock(page, { notif: 'notDetermined', after: 'denied' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
    await add(page);
    await page.locator('#f-title').fill('拒否');
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect.poll(() => count(page, 'requestNotifyPermission')).toBe(1);
    await page.waitForTimeout(900);
    expect((await dbEvents(page)).length).toBe(1);
    expect(await count(page, 'notifySync')).toBe(0);
  });

  test('通知なしの保存では要求しない', async ({ page }) => {
    await mock(page, { notif: 'notDetermined' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await add(page);
    await page.locator('#f-title').fill('なし');
    await page.locator('#f-al0').selectOption('');
    await page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await page.waitForTimeout(700);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
  });
});

test.describe('通知パネル', () => {
  const A = ev('a1', '会議', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }], place: '会議室A' });
  const openPanel = async (page) => { await openMenu(page); await page.locator('#menu [data-m="notify"]').click(); await expect(page.locator('#notify')).toBeVisible(); };

  test('既定の表示・オフで notifyClear・予定名オフで文面が変わる・既定の変更は新規にだけ効く・テスト通知', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.length)).toBe(1);
    await openPanel(page);
    await expect(page.locator('#nt-sw')).toHaveAttribute('aria-checked', 'true');
    expect(await shown(page, '#notify .nrows .alrow:nth-of-type(1) .alv')).toBe('30分前 ›');
    expect(await shown(page, '#notify .nrows .alrow:nth-of-type(2) .alv')).toBe('当日 8:00 ›');
    await expect(page.locator('#nt-count')).toHaveText('1');
    await expect(page.locator('#notify')).toContainText('30日先まで・最大60件');
    // 予定名を出さない
    await page.locator('#nt-showtitle').click();
    await expect.poll(() => page.evaluate(() => window.__mock.pending[0]?.title)).toBe('予定があります');
    // 既定の変更: 新規の予定にだけ
    await page.locator('#nt-dt').selectOption('b60');
    await expect(page.locator('#notify .nrows .alrow').first().locator('.alv')).toHaveText('1時間前 ›');
    // テスト
    await page.locator('#nt-test').click();
    await expect(page.locator('#notify')).toContainText('1分後にテスト通知を送ります');
    expect(await count(page, 'notifyTest')).toBe(1);
    // オフ
    await page.locator('#nt-sw').click();
    await expect.poll(() => count(page, 'notifyClear')).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__mock.pending.length)).toBe(0);
    await page.locator('#nt-close').click();
    await add(page);
    expect(await shown(page, '#al0-v')).toBe('1時間前 ›');
    expect((await dbEvents(page))[0].alarms).toEqual([{ before: 30 }]); // 既存は変わらない
  });

  test('拒否: 赤いカードと設定を開く。オンにしても出続ける', async ({ page }) => {
    await mock(page, { notif: 'denied' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await openPanel(page);
    await expect(page.locator('#notify .deny')).toContainText('iPhone の設定で通知が許可されていません。');
    await page.locator('#nt-settings').click();
    expect(await count(page, 'openSettings')).toBe(1);
    await page.locator('#nt-sw').click();
    await page.locator('#nt-sw').click();
    await expect(page.locator('#notify .deny')).toBeVisible();
    await page.locator('#nt-test').click();
    await expect(page.locator('#notify')).toContainText('テスト通知を送れません');
  });

  test('仮許可の案内。未確認でオンにすると許可を要求する', async ({ page }) => {
    await mock(page, { notif: 'provisional' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await openPanel(page);
    await expect(page.locator('#notify')).toContainText('通知センターに静かに届きます');
    await page.locator('#nt-close').click();
    await page.evaluate(() => localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: false })));
    await page.evaluate(() => { window.__mock.notif = 'notDetermined'; });
    await openPanel(page);
    await page.locator('#nt-sw').click();
    await expect.poll(() => count(page, 'requestNotifyPermission')).toBe(1);
  });

  test('OFF 中は許可を求めない。OFF中の既定選択・保存でも0回、ON・ON中の既定選択・テスト通知で求める。なしの選択は求めない', async ({ page }) => {
    await mock(page, { notif: 'notDetermined', after: 'granted' });
    await page.addInitScript(() => localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: false, showTitle: true, defaultTimed: null, defaultAllDay: null })));
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await openPanel(page);
    await page.locator('#nt-dt').selectOption('b30');
    await page.waitForTimeout(700);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
    expect(await count(page, 'notifySync')).toBe(0);
    await page.locator('#nt-sw').click(); // ON: 許可を求め、付け済みを再予約する（既定は復活しない）
    await expect.poll(() => count(page, 'requestNotifyPermission')).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo-notify')).defaultAllDay)).toBeNull();
    await expect.poll(() => count(page, 'notifySync')).toBeGreaterThan(0);
    await page.locator('#nt-da').selectOption('');
    await page.locator('#nt-dt').selectOption('');
    expect(await count(page, 'requestNotifyPermission')).toBe(1);
  });

  test('ON 中に既定を選ぶと許可を求める。OFF にすると notifyClear', async ({ page }) => {
    await mock(page, { notif: 'notDetermined', after: 'granted' });
    await page.addInitScript(() => localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: true, showTitle: true, defaultTimed: null, defaultAllDay: null })));
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await openPanel(page);
    expect(await count(page, 'requestNotifyPermission')).toBe(0);
    await page.locator('#nt-da').selectOption('d0@08:00');
    await expect.poll(() => count(page, 'requestNotifyPermission')).toBe(1);
    await page.locator('#nt-sw').click();
    await expect.poll(() => count(page, 'notifyClear')).toBeGreaterThan(0);
  });

  test('Esc で閉じてフォーカスがメニューの起点へ戻る', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await openPanel(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#notify')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement?.dataset?.act)).toBe('menu');
  });
});

test.describe('Web・iPhone との結びつき', () => {
  test('Web 版（偽装なし）では通知行・メニュー・ベルが出ない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [ev('a1', '会議', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }] })]);
    await add(page);
    await expect(page.locator('#alwrap')).toBeHidden();
    await page.locator('#close').click();
    await openMenu(page);
    await expect(page.locator('#m-notify')).toBeHidden();
    await page.keyboard.press('Escape');
    await pickDay(page, '2026-11-13');
    expect(await page.locator('.bell').count()).toBe(0);
  });

  test('linked: 「iPhone のカレンダーが通知します」。フルアクセスなしでは無効＋案内。notifySync には入らない', async ({ page }) => {
    const L = ev('l1', 'リンク', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }], nativeLink: { v: 2, state: 'linked', requestId: 'r', calendarId: 'c', itemId: 'i', eventId: 'e' } });
    await mock(page, { cal: 'writeOnly' });
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [L]);
    await openEv(page, '2026-11-13', 'l1');
    await expect(page.locator('#al0-row')).toBeVisible();
    await expect(page.locator('#al-xperm')).toBeVisible();
    await expect(page.locator('#f-al0')).toBeDisabled();
    await expect(page.locator('#al-ilink')).toBeHidden();
    expect(await page.evaluate(() => window.__mock.pending.length)).toBe(0);
  });

  test('linked でフルアクセスあり: 案内文が出て、行は操作できる', async ({ page }) => {
    const L = ev('l1', 'リンク', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }], nativeLink: { v: 2, state: 'linked', requestId: 'r', calendarId: 'c', itemId: 'i', eventId: 'e' } });
    await mock(page, { cal: 'granted' });
    await page.addInitScript(() => localStorage.setItem('duo-native-cal', JSON.stringify({ enabled: true, calendarIds: ['c'] })));
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [L]);
    await openEv(page, '2026-11-13', 'l1');
    await expect(page.locator('#al-ilink')).toHaveText('iPhone のカレンダーが通知します');
    await expect(page.locator('#f-al0')).toBeEnabled();
  });
});

test.describe('ベル', () => {
  const A = ev('a1', '会議', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }, { before: 1440 }] });
  const B = ev('b1', '通知なし', '2026-11-13T12:00', '2026-11-13T13:00', { alarms: [] });
  test('日の一覧にベル（12px）と読み上げ。月のチップには付けない。はみ出さない', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A, B]);
    expect(await page.locator('.week .bell').count()).toBe(0);
    await pickDay(page, '2026-11-13');
    const bell = page.locator('.tlev[data-event="a1"] .bell');
    await expect(bell).toHaveCount(1);
    const r = await bell.boundingBox();
    expect(Math.round(r.width)).toBe(12);
    await expect(page.locator('.tlev[data-event="a1"]')).toHaveAttribute('aria-label', /通知 30分前、1日前/);
    await expect(page.locator('.tlev[data-event="b1"] .bell')).toHaveCount(0);
    const o = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
    expect(o.sw).toBeLessThanOrEqual(o.cw);
  });

  test('閉じた一覧の次の予定に「HH:MM に通知」', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [ev('n1', '今日の予定', '2026-11-12T10:00', '2026-11-12T11:00', { alarms: [{ before: 5 }] })]);
    await page.locator('[data-act="list"]').first().click();
    await expect(page.locator('.next .nb')).toHaveText('9:55 に通知');
  });

  test('全体オフではベルを出さない', async ({ page }) => {
    await mock(page);
    await page.addInitScript(() => localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: false })));
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await pickDay(page, '2026-11-13');
    await expect(page.locator('.tlev[data-event="a1"]')).toBeVisible();
    expect(await page.locator('.bell').count()).toBe(0);
  });
});

test.describe('通知のタップ', () => {
  const A = ev('a1', '会議', '2026-11-13T10:00', '2026-11-13T11:00', { alarms: [{ before: 30 }] });
  const tap = (page, p) => page.evaluate((p) => window.__mock.listeners.notificationTapped(p), p);

  test('閉じた画面: その日の日表示で対象を強調。編集は開かない。1.5秒で消える', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await tap(page, { day: '2026-11-13', eventId: 'a1' });
    await expect(page.locator('.tlev[data-event="a1"].nhl')).toHaveCount(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).view)).toBe('day');
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('.nhl')).toHaveCount(0, { timeout: 3000 });
  });

  test('見開き: 月なしの メモ｜タスク でも右を時間にして対象を強調し、日付は左右共通', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape, '?nosw');
    await seed(page, [A]);
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'); localStorage.setItem('duo.ui.v1', JSON.stringify({ ...s, pages: { left: 'memo', right: 'task' } })); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await tap(page, { day: '2026-11-13', eventId: 'a1' });
    await expect(page.locator('.page[data-page="time"] .tlev[data-event="a1"].nhl')).toHaveCount(1);
    await expect(page.locator('.page[data-page="time"] .datebtn')).toContainText('13'); // ノートのページには日付がない
  });

  test('開いた縦: 日表示（全幅の月は維持される別の見え方ではなく選択日の日表示）', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openPortrait, '?nosw');
    await seed(page, [A]);
    await tap(page, { day: '2026-11-13', eventId: 'a1' });
    await expect(page.locator('.daylist [data-event="a1"].nhl')).toHaveCount(1);
  });

  test('見開き: 月のまま右の時間軸の対象を強調し、スクロールする', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.openLandscape, '?nosw');
    await seed(page, [A]);
    await tap(page, { day: '2026-11-13', eventId: 'a1' });
    const b = page.locator('.rp .tlev[data-event="a1"].nhl');
    await expect(b).toHaveCount(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).view)).toBe('month');
    const box = await b.boundingBox(), tl = await page.locator('.rp .tl').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(tl.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(tl.y + tl.height + 1);
    await expect(page.locator('#editor')).toBeHidden();
  });

  test('削除済みの予定は日だけ開く（エラーなし）。不正な日は無視', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [A]);
    await tap(page, { day: '2026-11-20', eventId: 'gone' });
    await expect(page.locator('.chead h2, #ctitle')).toContainText('11月20日');
    expect(await page.locator('.nhl').count()).toBe(0);
    await tap(page, { day: 'xxxx', eventId: 'a1' });
    await expect(page.locator('.chead h2, #ctitle')).toContainText('11月20日');
  });

  test('繰り返しの回: eventId は親。その日の回を強調する', async ({ page }) => {
    await mock(page);
    await openApp(page, SIZES.closedPortrait, '?nosw');
    await seed(page, [ev('r1', '毎日', '2026-11-12T08:00', '2026-11-12T08:30', { alarms: [{ before: 5 }], recurrence: { freq: 'daily', interval: 1, byDay: null, count: null, until: null } })]);
    await tap(page, { day: '2026-11-14', eventId: 'r1' });
    await expect(page.locator('.tlev.nhl')).toHaveCount(1);
    await expect(page.locator('.tlev.nhl')).toHaveAttribute('data-event', /^r1@2026-11-14/);
  });
});

test.describe('通知パネルの配置', () => {
  for (const [name, size] of [['466×678', SIZES.closedPortrait], ['626×890', SIZES.openPortrait], ['890×626', SIZES.openLandscape], ['951×669', SIZES.openLandscape951]]) {
    test(`${name}: 通知パネルは画面内に収まり、折り目をまたがず、フォーカスが戻る`, async ({ page }) => {
      await mock(page);
      await openApp(page, size, '?nosw');
      await openMenu(page);
      await page.locator('#menu [data-m="notify"]').click();
      await expect(page.locator('#notify')).toBeVisible();
      const r = await page.locator('#notify').boundingBox(), v = page.viewportSize();
      expect(r.x).toBeGreaterThanOrEqual(-0.5);
      expect(r.x + r.width).toBeLessThanOrEqual(v.width + 0.5);
      expect(r.y + r.height).toBeLessThanOrEqual(v.height + 0.5);
      if (v.width > v.height && v.width >= 800) expect(r.x).toBeGreaterThanOrEqual(v.width / 2 + 9); // 見開きは右ページ
      const o = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
      expect(o.sw).toBeLessThanOrEqual(o.cw);
      for (const sel of ['#nt-close', '#nt-sw', '#nt-test']) { const b = await page.locator(sel).boundingBox(); expect(b.height).toBeGreaterThanOrEqual(44); }
      const fonts = await page.evaluate(() => [...document.querySelectorAll('#notify select')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
      for (const f of fonts) expect(f).toBeGreaterThanOrEqual(16);
      await page.keyboard.press('Escape');
      await expect(page.locator('#notify')).toBeHidden();
    });
  }
});

async function pickDay(page, day) {
  if (!(await page.locator(`[data-date="${day}"]`).count())) await page.locator('[data-view="month"]:visible').first().click();
  await pick(page, day);
}
async function openEv(page, day, id) {
  await pickDay(page, day);
  await page.locator(`.tlev[data-event="${id}"], .agenda [data-event="${id}"]`).first().click();
  await expect(page.locator('#editor')).toBeVisible();
}
