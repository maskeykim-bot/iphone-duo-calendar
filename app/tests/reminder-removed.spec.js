// 第16版 PR22 で外し、第19版 D5〜D8 で同期のために戻し、第19.3版でもう一度すべて外した。
// v19.3 征希さんの要望（リマインダー同期をやめる）で仕様変更: 前は「Info.plist に NSReminders* の 2 キーが入り、Swift に許可・一覧・書き込みの 10 メソッドが登録・実装され、
// native.js が reminderPermission などを橋渡しする」ことを見ていた。今は逆に、どれも無いことを見る（くわしい検査は tests/v193-tasks-local.spec.js）。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spy, reminderCalls, openTasks, T } from './task-helpers.js';
import { SIZES } from './helpers.js';

const root = path.resolve(import.meta.dirname, '..');
const GONE = ['reminderPermission', 'requestReminderPermission', 'listReminderLists', 'listReminders', 'createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder', 'checkReminderList', 'createReminderList'];

test('静的: Info.plist に NSReminders* の 2 キーが無く、Swift にリマインダーの許可・一覧・書き込みの登録も実装も無い。JS のどこからも呼ばない。カレンダーの文言は残る', () => {
  const pl = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
  for (const k of ['NSRemindersFullAccessUsageDescription', 'NSRemindersUsageDescription']) expect(pl.includes(k), k).toBe(false);
  expect(pl.includes('NSCalendarsFullAccessUsageDescription')).toBe(true);
  expect(pl.includes('のカレンダーを Duo カレンダーのタスクとして表示')).toBe(false); // 旧文では戻さない
  const sw = fs.readFileSync(path.join(root, 'ios/App/App/DuoNativePlugin.swift'), 'utf8');
  for (const m of GONE) {
    expect(sw.includes(`CAPPluginMethod(name: "${m}"`), `登録 ${m}`).toBe(false);
    expect(sw.includes(`@objc func ${m}(`), `実装 ${m}`).toBe(false);
  }
  expect(sw.includes('requestFullAccessToReminders') || sw.includes('.reminder') || sw.includes('EKReminder')).toBe(false);
  expect(sw.includes('requestFullAccessToEvents')).toBe(true); // 予定用の EventKit は残る
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    const j = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    for (const m of GONE) expect(j.includes(m), `${f} に ${m}`).toBe(false);
  }
  expect(fs.existsSync(path.join(root, 'js/reminder-sync.js'))).toBe(false);
});

test('native.js: リマインダーの橋（reminderPermission・requestReminderPermission・listReminderLists・remNative・reminderErrText）は無い。予定・通知の橋は残る', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const n = await import('/js/native.js');
    return { gone: ['reminderPermission', 'requestReminderPermission', 'listReminderLists', 'remNative', 'reminderErrText'].filter((k) => k in n), keep: ['call', 'listen', 'nativeAvailable', 'errText', 'haptic'].filter((k) => typeof n[k] === 'function') };
  });
  expect(r.gone).toEqual([]);
  expect(r.keep).toEqual(['call', 'listen', 'nativeAvailable', 'errText', 'haptic']);
});

test('実行: 旧リマインダー集合が端末にあっても、起動・追加・完了・削除でリマインダー系の呼出は0、許可画面なし', async ({ page }) => {
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
