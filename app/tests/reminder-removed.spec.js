// 第16版 PR22 で外し、第19版 D5 で許可と一覧だけ戻した。同期オフ（既定）では呼び出し0、外部（純正リマインダー）は不変。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spy, reminderCalls, openTasks, T } from './task-helpers.js';
import { SIZES } from './helpers.js';

const root = path.resolve(import.meta.dirname, '..');
const TEXT = 'iPhone のリマインダーと Duo カレンダーのタスクを同期するために使います。Duo でのタスクの追加・変更・完了・削除をリマインダーに反映し、リマインダー側の変更も Duo に取り込みます。内容は端末の外に送りません。';
// 第19版 D5: 許可と一覧を戻した。D7: 書き込み・取得・リスト確認を足した（呼ぶのは js/reminder-sync.js だけ。同期オフでは呼ばない）。
const BACK = ['reminderPermission', 'requestReminderPermission', 'listReminderLists'];
const WRITE = ['listReminders', 'createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder', 'checkReminderList', 'createReminderList'];

test('静的: Info.plist に2キーが §2.4 の文で入り、Swift に許可・一覧・同期用の書き込みが登録・実装され、JS の書き込み系の呼び出しは同期の部品だけ', () => {
  const pl = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
  for (const k of ['NSRemindersFullAccessUsageDescription', 'NSRemindersUsageDescription']) {
    expect(pl.includes(`<key>${k}</key>\n\t<string>${TEXT}</string>`), k).toBe(true);
  }
  expect(pl.includes('NSCalendarsFullAccessUsageDescription')).toBe(true);
  expect(pl.includes('のカレンダーを Duo カレンダーのタスクとして表示')).toBe(false); // 旧文では戻さない
  const sw = fs.readFileSync(path.join(root, 'ios/App/App/DuoNativePlugin.swift'), 'utf8');
  for (const m of BACK) {
    expect(sw.includes(`CAPPluginMethod(name: "${m}", returnType: CAPPluginReturnPromise)`), `登録 ${m}`).toBe(true);
    expect(sw.includes(`@objc func ${m}(`), `実装 ${m}`).toBe(true);
  }
  expect(sw.includes('requestFullAccessToReminders') && sw.includes('requestAccess(to: .reminder)')).toBe(true);
  expect(sw.includes('self.store.reset()')).toBe(true);
  for (const m of WRITE) {
    expect(sw.includes(`CAPPluginMethod(name: "${m}", returnType: CAPPluginReturnPromise)`), `登録 ${m}`).toBe(true);
    expect(sw.includes(`@objc func ${m}(`), `実装 ${m}`).toBe(true);
  }
  // 書き込み系を名前で呼ぶのは native.js（橋渡し）だけ。画面（app.js）や reminders.js から直接は呼ばない。
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    const j = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    for (const m of WRITE) if (f !== 'native.js') expect(new RegExp(`['"\`]${m}['"\`]`).test(j), `${f} に '${m}' の呼び出し`).toBe(false);
  }
});

test('native.js: 許可と一覧は native が無くても reject せず「使えない」を返し、あれば橋渡しする', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const n = await import('/js/native.js');
    const none = [await n.reminderPermission(), await n.requestReminderPermission(), await n.listReminderLists()];
    const calls = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', nativePromise: async (pl, m) => { calls.push(m); if (m === 'listReminderLists') return { lists: [{ id: 'L1' }] }; if (m === 'reminderPermission') return { status: 'granted' }; throw { code: 'UNIMPLEMENTED' }; } };
    return { none, ok: [await n.reminderPermission(), await n.listReminderLists(), await n.requestReminderPermission()], calls };
  });
  expect(r.none).toEqual([{ status: 'unavailable' }, { status: 'unavailable' }, { lists: [], unavailable: true }]);
  expect(r.ok).toEqual([{ status: 'granted' }, { lists: [{ id: 'L1' }] }, { status: 'unavailable' }]);
  expect(r.calls).toEqual(['reminderPermission', 'listReminderLists', 'requestReminderPermission']);
});

test('実行: 旧リマインダー集合が端末にあっても、起動・追加・完了・削除でリマインダー系の呼出は0（同期オフ）、許可画面なし', async ({ page }) => {
  await spy(page);
  await openTasks(page, SIZES.openLandscape, { seed: [T('a'), T('b', { due: null })] });
  const lp = page.locator('.page.lp');
  await lp.locator('input.remin').fill('追加した');
  await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('追加した');
  await expect(page.locator('body')).not.toContainText('旧リマインダー');
  await expect(page.locator('[data-remstate], #m-remreq')).toHaveCount(0);
  expect(await reminderCalls(page)).toEqual([]);
});
