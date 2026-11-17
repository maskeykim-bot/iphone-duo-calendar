// 第16版 PR22: リマインダー連携を外した。経路がなく、要求は0、外部（純正リマインダー）は不変。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spy, legacyCalls, openTasks, T } from './task-helpers.js';
import { SIZES } from './helpers.js';

const OLD = ['reminderPermission', 'requestReminderPermission', 'listReminderLists', 'listReminders', 'createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder'];
const root = path.resolve(import.meta.dirname, '..');

test('静的: JS に旧8メソッド名がなく、Swift に登録・実装がなく、Info.plist にリマインダー権限がない', () => {
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    for (const m of OLD) expect(s.includes(m), `${f} に ${m}`).toBe(false);
  }
  const sw = fs.readFileSync(path.join(root, 'ios/App/App/DuoNativePlugin.swift'), 'utf8');
  for (const m of OLD) expect(sw.includes(m), `Swift に ${m}`).toBe(false);
  expect(/EKReminder|\.reminder\b|requestFullAccessToReminders/.test(sw)).toBe(false);
  const pl = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
  expect(pl.includes('NSReminders')).toBe(false);
  expect(pl.includes('NSCalendarsFullAccessUsageDescription')).toBe(true);
});

test('実行: 旧リマインダー集合が端末にあっても、起動・追加・完了・削除で旧メソッドの呼出は0、許可画面なし', async ({ page }) => {
  await spy(page);
  await openTasks(page, SIZES.openLandscape, { seed: [T('a'), T('b', { due: null })] });
  const lp = page.locator('.page.lp');
  await lp.locator('input.remin').fill('追加した');
  await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('追加した');
  await expect(page.locator('body')).not.toContainText('旧リマインダー');
  await expect(page.locator('[data-remstate], #m-remreq')).toHaveCount(0);
  expect(await legacyCalls(page)).toEqual([]);
});
