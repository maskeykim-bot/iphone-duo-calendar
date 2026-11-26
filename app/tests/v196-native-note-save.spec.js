// 第19.6版（征希さん 2026-11-26 実機「予定ノートに入力したけどそもそも文章が保存されない」「閉じた時はノート開くと閉じなくなる」）。
// ネイティブ（iOS 標準の入力欄）で書いたときの保存と、閉じた画面のノートのシートの閉じ方を、ネイティブの口をまねて確かめる。
// 原因 1: 入力欄から戻った文字を書き戻すとき、題名の行が変わる（新しいノートは必ず）と全部を出し直す道を通り、そこで「開いただけ」の印を今の文字にしてしまって保存へ流れていなかった（notes-ui の replaceBody）。
// 原因 2: ネイティブでは今までの操作の行（完了を含む）を隠すので、閉じた画面のノートのシートに閉じる手段が無かった → 日付の行の右端に「完了」（.nsdone）。
import { test, expect } from '@playwright/test';
import { boot, DAY, dbNotes } from './v193-p3-lib.js';

async function fakeNative(page, reply) {
  await page.addInitScript((reply) => {
    const M = window.__mock = { listeners: {}, calls: [] };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.listeners[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        if (m === 'getPosture') return { available: true, folded: false, regionRect: null, axis: null, angle: null, status: 'fullyOpen', source: 'reservedRegions', at: 1 };
        if (m === 'checkPermission' || m === 'reminderPermission' || m === 'notifyStatus') return { status: 'denied' };
        if (m === 'openNoteEditor') { M.calls.push(o); await new Promise((r) => setTimeout(r, 50)); return reply; }
        throw { code: 'UNAVAILABLE', message: m };
      },
    };
  }, reply);
}

test('NN-1 ネイティブで新しい予定ノートに書くと保存される（予定の題名を薄く出す口も渡す）。閉じた画面のシートは「完了」で閉じられる', async ({ page }) => {
  await fakeNative(page, { title: '', body: '資料を3部' });
  await boot(page, { notes: [] });
  await page.locator('.mday .mdcard[data-event^="e1"]').first().click(); await expect(page.locator('#editor[open]')).toBeVisible();
  await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet:not([hidden])')).toBeVisible();
  await expect(page.locator('.nsheet .ned-done')).toBeHidden(); // ネイティブでは今までの操作の行は出さない
  await expect(page.locator('.nsheet .nsdone')).toBeVisible();
  await page.locator('.nsheet .ned-body').focus(); // 本文に触れる → 標準の入力欄（まね）が開いて「資料を3部」で閉じる
  await expect.poll(async () => (await dbNotes(page)).length).toBe(1);
  const ns = await dbNotes(page);
  expect(ns[0].body).toBe('\n資料を3部'); expect(ns[0].eventRef).toEqual({ k: 'd:e1', title: '会議', day: DAY });
  expect((await page.evaluate(() => window.__mock.calls))[0].placeholder).toBe('会議');
  await page.locator('.nsheet .nsdone').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet:not([hidden])')).toHaveCount(0);
  expect((await dbNotes(page)).length).toBe(1);
});

test('NN-2 ネイティブで新しい日のノート（題名あり）に書いても保存される', async ({ page }) => {
  await fakeNative(page, { title: '買い物', body: '牛乳' });
  await boot(page, { notes: [] });
  await page.locator('.mday .mdadd [data-act="addnote"]').first().click(); // 日の欄の「＋ ノート」
  await expect(page.locator('.nsheet:not([hidden])')).toBeVisible(); await page.waitForTimeout(400);
  await page.locator('.nsheet .ned-title').focus();
  await expect.poll(async () => (await dbNotes(page)).map((n) => n.body)).toContain('買い物\n牛乳');
  await page.locator('.nsheet .nsdone').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet:not([hidden])')).toHaveCount(0);
});
