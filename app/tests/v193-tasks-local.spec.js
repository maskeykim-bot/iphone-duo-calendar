// v19.3 その2 項目 E（征希さんの要望）: タスクの iOS リマインダー同期をやめる。
// 出典: 指示書その2 E・追記3/5/6、連携 第20弾 §2・§3 (e)、設計 design/35-cards.md §2.1・§8.1・§9（K-14・R-20・M-36）、品質 qa/verify-v19-3-cards.md §6（R-1〜R-15・R-20）・§8 B-6。
// DuoNative は偽物（window.Capacitor）。Swift の実動作の証明ではない（Mac でのビルドと実機の確認が別に要る）。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { openApp, openMenu, clickSettings, closedGo, notifyOn, pickTaskDue, reloadKeep, SIZES } from './helpers.js';
import { T, seedTasks, dbTasks } from './task-helpers.js';

const root = path.resolve(import.meta.dirname, '..');
const SHOTS = '/workspace/cal-v191-shots/V193';
const POSTURES = [
  ['閉じた縦', { width: 466, height: 678 }, 'closed'],
  ['閉じた横', { width: 678, height: 466 }, 'closedland'],
  ['開いた縦', { width: 669, height: 951 }, 'openp'],
  ['開いた横', { width: 951, height: 669 }, 'openl'],
];
const CP = POSTURES[0][1];
const REM = /Reminder/i;
const LINK = ['remItemId', 'remExternalId', 'remListId', 'remModifiedAt', 'syncState'];
const SYNC_ON = { enabled: true, everEnabled: true, duoListId: 'L1', duoListTitle: 'Duo', lists: ['L2'], addTo: '', declined: [], syncedAt: 1 };
const H = 'iPhone のリマインダーとの同期をやめました';
const P1 = 'Duo のタスクは、これまでどおり Duo の中に残ります。題名、期限、完了の状態は変わりません。';
const P2 = 'リマインダー側に残っている項目は、Duo からは消しません。ただし、これからの変更は互いに反映されません。Siri やリマインダーで新しく作った項目も、Duo には入りません。';

// native の偽物。呼ばれたメソッドは全部 calls に残す（リマインダー系が 1 回も無いことを見る）。通知は予約の一覧を持つ。
async function nat(page) {
  await notifyOn(page);
  await page.addInitScript(() => {
    const M = window.__m = { calls: [], pending: [], cbs: {} };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { M.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        M.calls.push([m, JSON.parse(JSON.stringify(o ?? {}))]);
        if (m === 'checkPermission') return { status: 'denied' };
        if (m === 'notifyStatus' || m === 'requestNotifyPermission') return { status: 'granted' };
        if (m === 'notifySync') { M.pending = o.items; return { scheduled: o.items.length, removed: 0, skipped: 0 }; }
        if (m === 'notifyClear') { M.pending = []; return { removed: 0 }; }
        // もしリマインダー系が呼ばれたら、昔の端末と同じに「許可あり」で答える（黙って通ってしまわないよう、下で 0 回を検査する）
        if (m === 'reminderPermission' || m === 'requestReminderPermission') return { status: 'granted' };
        if (m === 'listReminderLists') return { lists: [{ id: 'L1', title: 'Duo', allowsModify: true }] };
        if (m === 'listReminders') return { reminders: [] };
        throw { code: 'UNAVAILABLE' };
      },
    };
  });
}
const calls = (page) => page.evaluate(() => window.__m.calls.map((c) => c[0]));
const remCalls = async (page) => (await calls(page)).filter((m) => REM.test(m));
const pending = (page) => page.evaluate(() => window.__m.pending.map((i) => [i.id, i.fireDate]));
const taskPending = async (page) => (await pending(page)).filter((p) => p[0].startsWith('duo.task.'));
// v19.2 までの端末のふり: 同期の設定値と、つながり（rem*・syncState）の入ったタスクを保存してから起動し直す（＝版を上げた最初の起動）
async function upgrade(page, { sync = null, tasks = [] } = {}) {
  if (sync) await page.evaluate((s) => localStorage.setItem('duo-rem-sync', JSON.stringify(s)), sync);
  if (tasks.length) await seedTasks(page, tasks); else await reloadKeep(page);
}
const linked = (id, o = {}) => T(id, { remItemId: `R-${id}`, remExternalId: `X-${id}`, remListId: 'L1', remModifiedAt: 1700000000000, syncState: 'linked', ...o });
const tomb = (id, o = {}) => T(id, { remExternalId: `X-${id}`, remListId: 'pending', syncState: 'tombstone', ...o });
const sheet = (page) => page.locator('#remend');
const rectOf = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
const near = (a, b, tol, msg) => expect(Math.abs(a - b), `${msg}: ${a} ≒ ${b}`).toBeLessThanOrEqual(tol);
const endKey = (page) => page.evaluate(() => localStorage.getItem('duo-rem-ended'));

// ---------------- 静的な検査（R-7・R-10） ----------------
test('35 §9 R-20／品質 R-7・R-10 静的: Info.plist に NSReminders* が無い。Swift・JS・HTML・sw にリマインダー API の参照が無い。予定用の EventKit と PrivacyInfo の UserDefaults は残る', () => {
  const pl = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
  expect(pl).not.toMatch(/NSReminders/);
  expect(pl).not.toMatch(/リマインダー/);
  expect(pl).toContain('<key>NSCalendarsFullAccessUsageDescription</key>'); // カレンダーの許可文言は残す
  expect(pl).toContain('<key>CFBundleIdentifier</key>'); // バンドル ID の行は触っていない
  const sw = fs.readFileSync(path.join(root, 'ios/App/App/DuoNativePlugin.swift'), 'utf8');
  expect(sw).not.toMatch(/reminder/i);
  expect(sw).not.toMatch(/EKReminder|remCreatedKey|リマインダー/);
  for (const keep of ['requestFullAccessToEvents', '@objc func listEvents(', '@objc func updateEvent(', '@objc func updateExternalEvent(', '@objc func notifySync(', 'createdKey = "duo.native.created.v2"']) expect(sw, keep).toContain(keep);
  // 登録（pluginMethods）と実装（@objc func）が 1 対 1（コンパイルできない環境の代わりの取り残し検査）
  const reg = [...sw.matchAll(/CAPPluginMethod\(name: "(\w+)"/g)].map((m) => m[1]);
  expect(reg.length).toBeGreaterThan(20);
  expect(new Set(reg).size).toBe(reg.length);
  for (const m of reg) expect(sw.includes(`@objc func ${m}(`), `実装 ${m}`).toBe(true);
  // 括弧の対応（文字列と行コメントを除いて数える）
  const bare = sw.replace(/\/\/.*$/gm, '').replace(/"(\\.|[^"\\\n])*"/g, '""');
  for (const [o, c] of [['{', '}'], ['(', ')'], ['[', ']']]) expect(bare.split(o).length, `${o}${c}`).toBe(bare.split(c).length);
  for (const f of ['AppDelegate.swift', 'SceneDelegate.swift', 'MainViewController.swift']) expect(fs.readFileSync(path.join(root, 'ios/App/App', f), 'utf8'), f).not.toMatch(/reminder/i);
  const pv = fs.readFileSync(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
  expect(pv).toContain('NSPrivacyAccessedAPICategoryUserDefaults'); expect(pv).toContain('CA92.1'); expect(pv).not.toMatch(/reminder/i);
  // JS: 同期の部品は無く、リマインダーの native メソッド名はどのファイルにも無い
  expect(fs.existsSync(path.join(root, 'js/reminder-sync.js'))).toBe(false);
  const API = /reminderPermission|requestReminderPermission|listReminderLists|listReminders|createReminder|updateReminder|setReminderDone|deleteReminder|checkReminderList|createReminderList|remNative|reminderErrText|reminder-sync|EKReminder/;
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((n) => n.endsWith('.js'))) expect(API.test(fs.readFileSync(path.join(root, 'js', f), 'utf8')), `js/${f}`).toBe(false);
  expect(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')).not.toContain('reminder-sync');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  expect(html).not.toMatch(/m-rssw|m-rsdest|m-rslists|m-rsdeny|id="rsheet"/);
  // 版は 6 のまま（IndexedDB・バックアップ）
  expect(fs.readFileSync(path.join(root, 'js/db.js'), 'utf8')).toMatch(/SCHEMA_VERSION = 6\b/);
  expect(fs.readFileSync(path.join(root, 'js/backup.js'), 'utf8')).toMatch(/\bVERSION = 6\b/);
});

// ---------------- 設定 › タスク（R-1） ----------------
test('品質 R-1: 設定 › タスクに同期スイッチ・リスト選び・最初の取り込み・許可の経路が無い。常設の一文（13/400 #68716A）と、同期と関係ない設定は残る（native・同期オンだった端末）', async ({ page }) => {
  await nat(page);
  await openApp(page, CP, '?nosw');
  await upgrade(page, { sync: SYNC_ON, tasks: [linked('a')] });
  await sheet(page).locator('#remend-ok').click(); await expect(sheet(page)).toBeHidden();
  await openMenu(page, 'reminders');
  const scr = page.locator('#menu [data-screen="reminders"]');
  await expect(scr.locator('[role="switch"]')).toHaveCount(1); // 「月にタスクを表示」だけ
  await expect(scr.locator('#m-tkmonth')).toBeVisible();
  await expect(scr).toContainText('完了したタスク');
  await expect(page.locator('#m-rs, #m-rssw, #m-rsdest, #m-rslists, #m-rsdeny, #m-rsopen, [data-rslist], #rsheet')).toHaveCount(0);
  for (const t of ['と同期', '取り込むリスト', '追加先', '許可', '設定を開く', '同期オン', '同期オフ']) await expect(scr).not.toContainText(t);
  const note = scr.locator('#m-tknosync');
  await expect(note).toHaveText('リマインダーとの同期は行いません。');
  await expect(note).toBeVisible();
  expect(await note.evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.color]; })).toEqual(['13px', '400', 'rgb(104, 113, 106)']);
  // 設定の一番上の「タスク」の行に「同期オン」などの添え字は出ない
  expect(await page.locator('#m-reminders').innerText()).not.toMatch(/同期/);
  // 注はグループの下端にあり、画面からはみ出さない・ほかの行と重ならない
  const nb = await rectOf(note), mb = await rectOf(page.locator('#menu'));
  expect(nb.x).toBeGreaterThanOrEqual(mb.x); expect(nb.r).toBeLessThanOrEqual(mb.r + 0.5); expect(nb.b).toBeLessThanOrEqual(mb.b + 0.5);
  const prev = await rectOf(scr.locator('#m-tk .swnote').nth(1)); expect(nb.y).toBeGreaterThanOrEqual(prev.b - 0.5);
  await page.screenshot({ path: `${SHOTS}/p2-tasks-settings.png` });
  expect(await remCalls(page)).toEqual([]);
});

// ---------------- 同期しない・許可を求めない・設定値を消さない（R-2・R-4・R-6・R-8） ----------------
test('品質 R-2・R-4・R-6・R-8: 同期オンだった端末で、起動・前面復帰・calendarChanged・追加・完了・編集・削除のどれでも、リマインダーのメソッドは 1 回も呼ばれない。同期の設定値は消さない・書き換えない', async ({ page }) => {
  await nat(page);
  await openApp(page, SIZES.openLandscape951, '?nosw');
  await upgrade(page, { sync: SYNC_ON, tasks: [linked('a', { title: 'つながっていた' }), linked('b', { title: '消す件' })] });
  await expect(sheet(page)).toBeVisible();
  await sheet(page).locator('#remend-ok').click(); await expect(sheet(page)).toBeHidden();
  // 前面復帰
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  // リマインダー側の変更の知らせ（予定用にも使う calendarChanged）
  await page.evaluate(() => window.__m.cbs.calendarChanged?.({}));
  await page.waitForTimeout(700); // 昔の間引き 300ms より長く待つ
  await page.locator('.pgl [data-pick="task"]').first().click();
  const lp = page.locator('.page.lp');
  await lp.locator('input.remin').fill('Duo だけで足す'); await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('Duo だけで足す');
  await lp.locator('[data-key="rm:a"] [data-act="remedit"]').click();
  await page.locator('#tk-title').fill('直した'); await page.locator('#tk-save').click(); await expect(page.locator('#taskdlg')).toBeHidden();
  await lp.locator('[data-key="rm:a"] [data-act="remck"]').click();
  await lp.locator('[data-key="rm:b"] [data-act="remedit"]').click(); await page.locator('#tk-del').click();
  await expect.poll(async () => (await dbTasks(page)).map((t) => t.id).includes('b'), { timeout: 8000 }).toBe(false);
  await expect.poll(async () => (await dbTasks(page)).find((t) => t.id === 'a')?.done, { timeout: 5000 }).toBe(true);
  await page.evaluate(() => window.__m.cbs.calendarChanged?.({}));
  await page.waitForTimeout(700);
  expect(await remCalls(page)).toEqual([]); // リマインダーへ書かない・読まない・許可も見ない／求めない
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('duo-rem-sync')))).toEqual(SYNC_ON); // R-6: 設定値はそのまま（同期は再開しない）
  // 消した件は墓標を残さず消える。足した件につながりの項目は付かない
  const all = await dbTasks(page);
  expect(all.map((t) => t.title).sort()).toEqual(['Duo だけで足す', '直した']);
  for (const t of all) for (const k of LINK) expect(k in t, `${t.id}.${k}`).toBe(false);
  await expect(page.locator('.lchips, .dcap2, .stalled, .rmgone, .rmwait, .rmlist')).toHaveCount(0); // リストの部品・止まっている 1 行は出ない
});

// ---------------- 既存データ（R-3・R-12） ----------------
test('品質 R-3・R-12: 版を上げた最初の起動で、生きているタスクのつながりだけが外れる（題名・期限・完了・メモ・notify・並び・時刻はそのまま）。墓標は片づく。リマインダー側には触れない', async ({ page }) => {
  await nat(page);
  await openApp(page, CP, '?nosw');
  const A = { title: '牛乳を買う', due: { date: '2026-11-13', time: '18:00' }, note: 'メモ\n2行目', notify: true, order: 3, createdAt: 111, updatedAt: 222 };
  const B = { title: '済んだ件', due: { date: '2026-11-10' }, done: true, doneAt: '2026-11-10T09:00', order: 4, createdAt: 112, updatedAt: 223 };
  const C = { title: '期限なし', due: null, order: 5, createdAt: 113, updatedAt: 224 };
  await upgrade(page, { sync: { ...SYNC_ON, enabled: false }, tasks: [linked('a', A), linked('b', { ...B, syncState: 'pending' }), T('c', { ...C, syncState: 'listMissing' }), T('d', { title: 'もともと Duo だけ', order: 6 }), tomb('z', { title: '消した跡', order: 7 })] });
  await expect.poll(async () => (await dbTasks(page)).map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  const g = Object.fromEntries((await dbTasks(page)).map((t) => [t.id, t]));
  expect(g.a).toEqual(T('a', A));
  expect(g.b).toEqual(T('b', B));
  expect(g.c).toEqual(T('c', C));
  expect(g.d).toEqual(T('d', { title: 'もともと Duo だけ', order: 6 }));
  expect(await remCalls(page)).toEqual([]);
  // もう一度起動しても同じ（2 回目は何も変えない）
  await reloadKeep(page);
  expect(Object.fromEntries((await dbTasks(page)).map((t) => [t.id, t]))).toEqual(g);
});

// ---------------- 通知（R-12・R-13・R-14・M-36 のその2の分） ----------------
test('品質 R-13・R-14: つながっていたタスクを移行すると、通知オンの件にアプリの通知が付く。同じタスクの予約は 1 つ（二重に鳴らない）。墓標・通知オフ・完了は鳴らない', async ({ page }) => {
  await nat(page);
  await openApp(page, SIZES.openLandscape951, '?nosw');
  await upgrade(page, { sync: SYNC_ON, tasks: [
    linked('a', { due: { date: '2026-11-13', time: '10:30' }, notify: true }),
    linked('b', { due: { date: '2026-11-14' }, notify: true, syncState: 'pending' }),
    linked('off', { due: { date: '2026-11-13' }, notify: false }),
    linked('dn', { due: { date: '2026-11-13' }, notify: true, done: true, doneAt: '2026-11-12T09:00' }),
    tomb('z', { due: { date: '2026-11-13', time: '11:00' }, notify: true }),
    T('u', { due: { date: '2026-11-15', time: '09:00' }, notify: true }),
  ] });
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.a', '2026-11-13T10:30'], ['duo.task.b', '2026-11-14T08:00'], ['duo.task.u', '2026-11-15T09:00']]);
  const ids = (await pending(page)).map((p) => p[0]);
  expect(new Set(ids).size).toBe(ids.length); // 同じ id の予約は 1 つ
  // 何度同期し直しても増えない（前面復帰）
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(600);
  expect(await taskPending(page)).toEqual([['duo.task.a', '2026-11-13T10:30'], ['duo.task.b', '2026-11-14T08:00'], ['duo.task.u', '2026-11-15T09:00']]);
  expect(await remCalls(page)).toEqual([]); // リマインダー側の通知（EKAlarm）は足さない・消さない
});
test('35 §9 M-36（その2の分）／品質 R-13: つながっていたタスクの期限を 12 日 → 14 日に変えると、14 日 18:00／日付だけは 14 日 8:00 にアプリの通知が 1 回だけ。12 日には残らない。リマインダーは呼ばれない', async ({ page }) => {
  await nat(page);
  await openApp(page, SIZES.openLandscape951, '?nosw');
  await upgrade(page, { tasks: [linked('m', { title: '時刻つき', due: { date: '2026-11-12', time: '18:00' }, notify: true }), linked('n', { title: '日付だけ', due: { date: '2026-11-12' }, notify: true, order: 2 })] });
  await sheet(page).locator('#remend-ok').click(); await expect(sheet(page)).toBeHidden();
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.m', '2026-11-12T18:00']]); // 日付だけの 12 日 8:00 はもう過ぎている（今は 12 日 9:41）
  await page.locator('.pgl [data-pick="task"]').first().click();
  for (const id of ['m', 'n']) {
    await page.locator(`.page.lp [data-key="rm:${id}"] [data-act="remedit"]`).click();
    await expect(page.locator('#taskdlg')).toBeVisible();
    await pickTaskDue(page, '2026-11-14');
    await page.locator('#tk-save').click();
    await expect(page.locator('#taskdlg')).toBeHidden();
  }
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.n', '2026-11-14T08:00'], ['duo.task.m', '2026-11-14T18:00']]); // 近い順
  expect((await pending(page)).filter((p) => p[1].startsWith('2026-11-12'))).toEqual([]);
  const g = Object.fromEntries((await dbTasks(page)).map((t) => [t.id, t]));
  expect([g.m.due, g.m.notify, g.n.due, g.n.notify]).toEqual([{ date: '2026-11-14', time: '18:00' }, true, { date: '2026-11-14' }, true]);
  expect(await remCalls(page)).toEqual([]);
});

// ---------------- 1 回だけの知らせ（R-11・R-15・R-20、設計 35 §8.1） ----------------
test('35 §9 R-20／品質 R-11・R-15: 同期をオンにしていた端末で版を上げて起動すると、閉じた縦でシート y378〜678・後ろが暗い・見出しに焦点・文は設計どおり。OK で閉じ、2 回目の起動では出ない。権限の API は呼ばない', async ({ page }) => {
  await nat(page);
  await openApp(page, CP, '?nosw');
  await expect(sheet(page)).toBeHidden(); // まっさらな端末では出ない
  await upgrade(page, { sync: SYNC_ON });
  await expect(sheet(page)).toBeVisible();
  const r = await rectOf(sheet(page));
  near(r.x, 0, 1, 'シート左'); near(r.r, 466, 1, 'シート右（帯の上も覆う）'); near(r.y, 378, 1, 'シート上'); near(r.b, 678, 1, 'シート下'); near(r.h, 300, 1, '高さ');
  const h = await rectOf(sheet(page).locator('h2')), ok = await rectOf(sheet(page).locator('#remend-ok'));
  near(h.x, 24, 1, '中身の左'); near(h.r, 442, 1, '中身の右'); near(h.y, 378 + 24, 1, '上の内側 24'); near(h.h, 24, 1, '見出しの行 24');
  near(ok.x, 24, 1, 'OK 左'); near(ok.r, 442, 1, 'OK 右'); near(ok.h, 48, 1, 'OK 高さ'); near(ok.b, 678 - 24, 1, '下の内側 24');
  const ps = sheet(page).locator('p');
  await expect(sheet(page).locator('h2')).toHaveText(H);
  expect(await ps.allInnerTexts()).toEqual([P1, P2]);
  await expect(sheet(page).locator('button')).toHaveCount(1); await expect(sheet(page).locator('#remend-ok')).toHaveText('OK');
  expect(await sheet(page).innerText()).not.toMatch(/許可|権限|設定アプリ/); // 権限には触れない
  const p1 = await rectOf(ps.nth(0)), p2 = await rectOf(ps.nth(1));
  near(p1.y, h.b + 12, 1, '見出し → 本文 12'); near(p2.y, p1.b + 12, 1, '段落の間 12'); expect(ok.y - p2.b, 'ボタンの上 24 以上').toBeGreaterThanOrEqual(23);
  const st = await sheet(page).evaluate((d) => {
    const c = getComputedStyle(d), b = getComputedStyle(d, '::backdrop'), hh = getComputedStyle(d.querySelector('h2')), pp = getComputedStyle(d.querySelector('p')), o = getComputedStyle(d.querySelector('#remend-ok'));
    return { bg: c.backgroundColor, rad: [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomLeftRadius], back: b.backgroundColor, modal: d.matches(':modal'), h: [hh.fontSize, hh.lineHeight, hh.fontWeight, hh.color], p: [pp.fontSize, pp.lineHeight, pp.color], ok: [o.borderTopLeftRadius, o.backgroundColor, o.color, o.fontSize, o.fontWeight], focus: document.activeElement?.id, behind: document.elementFromPoint(200, 100) === d };
  });
  expect(st.bg).toBe('rgb(255, 253, 250)'); expect(st.rad).toEqual(['24px', '24px', '0px']);
  expect(st.back).toBe('rgba(28, 31, 29, 0.24)'); // 後ろが暗い
  expect(st.modal).toBe(true); expect(st.behind).toBe(true); // モーダル（後ろは押せない・読まない）
  expect(st.focus).toBe('remend-h'); // 見出しに焦点
  expect(st.h).toEqual(['17px', '24px', '600', 'rgb(28, 31, 29)']); expect(st.p).toEqual(['15px', '22px', 'rgb(41, 59, 53)']);
  expect(st.ok).toEqual(['14px', 'rgb(41, 78, 66)', 'rgb(255, 255, 255)', '15px', '600']);
  expect(await endKey(page)).not.toBe('shown'); // 閉じるまでは「出した」にしない
  await sheet(page).locator('#remend-ok').click();
  await expect(sheet(page)).toBeHidden();
  expect(await endKey(page)).toBe('shown');
  // 2 回目以降の起動・前面復帰では出ない
  await reloadKeep(page);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(400);
  await expect(sheet(page)).toBeHidden();
  expect(await remCalls(page)).toEqual([]);
});
for (const [name, cond] of [
  ['enabled だけ true', { sync: { enabled: true } }],
  ['everEnabled だけ true（今はオフ）', { sync: { enabled: false, everEnabled: true } }],
  ['設定値は無いが、つながったタスクがある', { tasks: [linked('a')] }],
  ['設定値は無いが、墓標がある', { tasks: [tomb('z')] }],
]) {
  test(`35 §9 R-20／連携 §3 (e) 出す条件: ${name} → 1 回だけ出る`, async ({ page }) => {
    await openApp(page, CP, '?nosw');
    await upgrade(page, cond);
    await expect(sheet(page)).toBeVisible();
    await sheet(page).locator('#remend-ok').click();
    await expect(sheet(page)).toBeHidden();
    await reloadKeep(page);
    await page.waitForTimeout(300);
    await expect(sheet(page)).toBeHidden();
  });
}
test('35 §9 R-20／品質 R-15: 同期を一度もオンにしていない端末（設定値なし／enabled も everEnabled も false、つながりなし）では出ない', async ({ page }) => {
  await openApp(page, CP, '?nosw');
  await upgrade(page, { tasks: [T('a'), T('b', { due: null })] });
  await page.waitForTimeout(400);
  await expect(sheet(page)).toBeHidden();
  expect(await endKey(page)).toBe(null);
  await upgrade(page, { sync: { enabled: false, everEnabled: false, lists: [] } });
  await page.waitForTimeout(400);
  await expect(sheet(page)).toBeHidden();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(sheet(page)).toBeHidden();
});
test('35 §9 R-20／設計 §8.1 閉じ方: 後ろをたたく・下へ払う・Esc のどれでも閉じて「出した」印が残る。小さく引いただけでは閉じない', async ({ page }) => {
  await openApp(page, CP, '?nosw');
  const again = async () => { await page.evaluate(() => { localStorage.removeItem('duo-rem-ended'); }); await upgrade(page, { sync: SYNC_ON }); await expect(sheet(page)).toBeVisible(); };
  await again();
  await page.mouse.click(200, 120); // 後ろの暗い所
  await expect(sheet(page)).toBeHidden(); expect(await endKey(page)).toBe('shown');
  await again();
  await page.mouse.move(233, 420); await page.mouse.down(); await page.mouse.move(233, 440, { steps: 3 }); await page.mouse.up(); // 20pt だけ引いて離す
  await page.waitForTimeout(350);
  await expect(sheet(page)).toBeVisible(); near((await rectOf(sheet(page))).y, 378, 1, '元の位置へ戻る'); expect(await endKey(page)).not.toBe('shown');
  await page.mouse.move(233, 420); await page.mouse.down(); await page.mouse.move(233, 520, { steps: 6 }); await page.mouse.up(); // 下へ払う
  await expect(sheet(page)).toBeHidden(); expect(await endKey(page)).toBe('shown');
  await again();
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden(); expect(await endKey(page)).toBe('shown');
  // シートの中（文の上）をたたいても閉じない
  await again();
  await sheet(page).locator('p').first().click();
  await page.waitForTimeout(300);
  await expect(sheet(page)).toBeVisible();
});
test('35 §9 R-20: 裏で起動したときは出さず、最初に前面になったときに出す', async ({ page }) => {
  await openApp(page, CP, '?nosw');
  await page.evaluate((s) => localStorage.setItem('duo-rem-sync', JSON.stringify(s)), SYNC_ON);
  await page.addInitScript(() => { let h = true; Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); window.__front = () => { h = false; document.dispatchEvent(new Event('visibilitychange')); }; });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await page.waitForTimeout(400);
  await expect(sheet(page)).toBeHidden();
  await page.evaluate(() => window.__front());
  await expect(sheet(page)).toBeVisible();
});
for (const [name, size, key] of POSTURES) {
  test(`35 §9 R-20／設計 §8.1 姿勢: ${name} ${size.width}×${size.height} のシートの矩形（切れ・重なりなし）`, async ({ page }) => {
    await openApp(page, size, '?nosw');
    await upgrade(page, { sync: SYNC_ON, tasks: [linked('a', { title: '会議の資料を印刷' })] });
    await expect(sheet(page)).toBeVisible();
    const r = await rectOf(sheet(page)), h = await rectOf(sheet(page).locator('h2')), ok = await rectOf(sheet(page).locator('#remend-ok')), ps = sheet(page).locator('p');
    const p1 = await rectOf(ps.nth(0)), p2 = await rectOf(ps.nth(1));
    if (key === 'closed') { near(r.x, 0, 1, 'x0'); near(r.r, 466, 1, 'x466'); near(r.y, 378, 1, 'y378'); near(r.b, 678, 1, 'y678'); near(h.x, 24, 1, '中身 x24'); near(ok.r, 442, 1, '中身 x442'); }
    if (key === 'closedland') { near(r.x, 0, 1, 'x0'); near(r.r, 594, 1, 'x594'); near(r.y, 166, 1, 'y166'); near(r.b, 466, 1, 'y466'); near(h.x, 87, 1, '中身 x87'); near(ok.x, 87, 1, 'OK x87'); near(ok.r, 507, 1, '中身 x507'); }
    if (key === 'openp') { near(r.x, 0, 1, 'x0'); near(r.r, 669, 1, 'x669'); near(r.b, 951, 1, '下の端'); near(h.x, 24, 1, '中身 x24'); near(ok.r, 645, 1, '中身 x645'); near(951 - ok.b, 34, 1, '下の内側 34'); expect(r.y, '折り目 y459〜492 に掛からない').toBeGreaterThan(492); }
    if (key === 'openl') { near(r.x, 484, 1, 'x484（右のページだけ）'); near(r.r, 951, 1, 'x951'); near(r.b, 669, 1, '下の端'); near(h.x, 508, 1, '中身 x508'); near(ok.r, 927, 1, '中身 x927'); }
    // 並び: 上 24 → 見出し 24 → 12 → 段落 → 12 → 段落 → 24 以上 → OK 48 → 下
    near(h.y - r.y, 24, 1, '上の内側 24'); near(p1.y - h.b, 12, 1, '見出しの下 12'); near(p2.y - p1.b, 12, 1, '段落の間 12'); near(ok.h, 48, 1, 'OK 48');
    expect(ok.y - p2.b).toBeGreaterThanOrEqual(23);
    for (const b of [h, p1, p2, ok]) { expect(b.x).toBeGreaterThanOrEqual(r.x + 23); expect(b.r).toBeLessThanOrEqual(r.r - 23); expect(b.b).toBeLessThanOrEqual(r.b); }
    // 文字が箱からはみ出していない（折り返しで切れない）
    expect(await sheet(page).evaluate((d) => [...d.querySelectorAll('h2,p,button')].every((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1))).toBe(true);
    expect(await sheet(page).evaluate((d) => getComputedStyle(d, '::backdrop').backgroundColor)).toBe('rgba(28, 31, 29, 0.24)');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/p2-reminder-notice-${key}.png` });
    await sheet(page).locator('#remend-ok').click();
    await expect(sheet(page)).toBeHidden();
  });
}

// ---------------- K-14（タスクの四角 20×20・角丸 4・線 1.75、押せる範囲 44） ----------------
test.describe('K-14', () => {
  // 線 1.75: Chromium も WebKit も、getComputedStyle は画面の画素に丸めた値（等倍の画面で 1px）を返す。その要素に効いている CSS の宣言の値（1.75px）を読む。実機（3 倍）では 5 画素。
  for (const [name, size, key] of POSTURES) {
    test(`35 §9 K-14: ${name} ${size.width}×${size.height} のタスクの四角は 20×20・角丸 4・線 1.75。押せる範囲は 44 のまま（タスクのページ${key.startsWith('closed') ? '・ホーム' : ''}）`, async ({ page }) => {
      await openApp(page, size, '?nosw');
      await seedTasks(page, [T('a', { title: '未完了' }), T('b', { title: '時刻つき', due: { date: '2026-11-12', time: '18:00' }, order: 2 }), T('c', { title: '完了', done: true, doneAt: '2026-11-12T09:00', order: 3 })]);
      const measure = (sel) => page.locator(sel).evaluateAll((l) => l.filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
        const r = e.getBoundingClientRect(), c = getComputedStyle(e), b = e.closest('.rmckb').getBoundingClientRect();
        let decl = ''; // その要素に当たる規則のうち、最後に線の太さを決めているもの
        for (const sh of document.styleSheets) { let rules = []; try { rules = [...sh.cssRules]; } catch { /* 読めないシートは飛ばす */ } for (const ru of rules) { const v = ru.selectorText && ru.style ? ru.style.getPropertyValue('border') || ru.style.getPropertyValue('border-width') : ''; if (v && e.matches(ru.selectorText)) decl = v; } } // 例: '1.75px solid var(--rc)'（色が変数なので、太さは宣言の文字から読む）
        return { w: r.width, h: r.height, rad: c.borderTopLeftRadius, bw: [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth], decl, bs: c.borderTopStyle, hit: [b.width, b.height], inHit: r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5 };
      }));
      const check = (list, where, min) => {
        expect(list.length, `${where} の四角の数`).toBeGreaterThanOrEqual(min);
        for (const m of list) {
          near(m.w, 20, 0.01, `${where} 幅`); near(m.h, 20, 0.01, `${where} 高さ`);
          expect(m.rad, `${where} 角丸`).toBe('4px'); expect(m.decl, `${where} 線（宣言）`).toMatch(/^1\.75px solid /); expect(m.bs).toBe('solid');
          for (const w of m.bw) { expect(parseFloat(w), `${where} 線（計算値は画素に丸まる）`).toBeGreaterThanOrEqual(1); expect(parseFloat(w)).toBeLessThanOrEqual(1.75); }
          near(m.hit[0], 44, 0.01, `${where} 押せる幅 44`); expect(m.hit[1], `${where} 押せる高さ 44 以上`).toBeGreaterThanOrEqual(44); expect(m.inHit).toBe(true);
        }
      };
      if (key.startsWith('closed')) {
        await closedGo(page, 'ホーム');
        check(await measure('.htasks .rmck'), 'ホーム', 2);
        await page.locator('.htasks [data-act="homego"][data-to="task"]').click();
      } else {
        const pick = page.locator('.pgl [data-pick="task"]').first();
        if (await pick.count()) await pick.click(); else await page.getByRole('button', { name: 'タスク', exact: true }).first().click();
      }
      await expect(page.locator('input.remin').first()).toBeVisible();
      const doneBtn = page.locator('[data-act="remdone"]').first();
      if (await doneBtn.count() && (await doneBtn.getAttribute('aria-expanded')) === 'false') await doneBtn.click(); // 完了の段も開いて測る
      check(await measure('.rmrow .rmck'), 'タスクのページ', 2);
      // 色は今のまま（線＝行の色、完了は塗り）
      const col = await page.locator('.rmrow:not(.done) .rmck').first().evaluate((e) => [getComputedStyle(e).borderTopColor, getComputedStyle(e.closest('.rmrow')).getPropertyValue('--rc').trim()]);
      expect(col[0]).toBe('rgb(104, 113, 106)'); expect(col[1].toLowerCase()).toBe('#68716a');
    });
  }
});

// ---------------- Duo の中だけで追加・完了・編集・削除（R-5） ----------------
test('品質 R-5: 閉じた画面のタスクで、追加・完了・編集・削除ができる（native のリマインダーは 0 回）', async ({ page }) => {
  await nat(page);
  await openApp(page, CP, '?nosw');
  await upgrade(page, { tasks: [linked('a', { title: 'もとの題名' })] });
  await sheet(page).locator('#remend-ok').click(); await expect(sheet(page)).toBeHidden();
  await page.locator('[data-act="strip"].ctask').click();
  const inp = page.locator('input.remin');
  await expect(inp).toBeVisible();
  await inp.fill('閉じた画面で足す'); await inp.press('Enter');
  await expect(page.locator('.rmrow .rmt', { hasText: '閉じた画面で足す' })).toHaveCount(1);
  await page.locator('[data-key="rm:a"] [data-act="remedit"]').click();
  await expect(page.locator('#taskdlg')).toBeVisible();
  await page.locator('#tk-title').fill('直した題名'); await page.locator('#tk-save').click();
  await expect(page.locator('#taskdlg')).toBeHidden();
  await expect(page.locator('[data-key="rm:a"] .rmt')).toHaveText('直した題名');
  await page.locator('[data-key="rm:a"] [data-act="remck"]').click();
  await expect.poll(async () => (await dbTasks(page)).find((t) => t.id === 'a')?.done, { timeout: 5000 }).toBe(true);
  const added = (await dbTasks(page)).find((t) => t.title === '閉じた画面で足す');
  await page.locator(`[data-key="rm:${added.id}"] [data-act="remedit"]`).click();
  await page.locator('#tk-del').click();
  await expect.poll(async () => (await dbTasks(page)).map((t) => t.title), { timeout: 8000 }).toEqual(['直した題名']);
  expect(await remCalls(page)).toEqual([]);
});
test('品質 R-5: 閉じた画面のホームで、追加（＋ → タスクの入力欄）と完了ができる', async ({ page }) => {
  await nat(page);
  await openApp(page, CP, '?nosw', { home: true });
  await seedTasks(page, [T('a', { title: '今日の件' })]);
  await expect(page.locator('.htasks .htask')).toHaveCount(1);
  await page.locator('.htasks .htask [data-act="remck"]').click();
  await expect.poll(async () => (await dbTasks(page)).find((t) => t.id === 'a')?.done, { timeout: 5000 }).toBe(true);
  await closedGo(page, 'ホーム');
  await page.locator('.htasks [data-act="homego"][data-to="taskadd"]').click();
  const inp = page.locator('input.remin');
  await expect(inp).toBeVisible();
  await inp.fill('ホームから足す'); await inp.press('Enter');
  await expect.poll(async () => (await dbTasks(page)).map((t) => t.title).sort()).toEqual(['ホームから足す', '今日の件']);
  for (const t of await dbTasks(page)) for (const k of LINK) expect(k in t).toBe(false);
  expect(await remCalls(page)).toEqual([]);
});
for (const [name, size] of [['開いた縦', POSTURES[2][1]], ['開いた横', POSTURES[3][1]]]) {
  test(`品質 R-5: ${name}のタスクのページで、追加・完了・編集・削除ができる`, async ({ page }) => {
    await nat(page);
    await openApp(page, size, '?nosw');
    await seedTasks(page, [T('a', { title: 'もとの題名' }), T('b', { title: '消す件', order: 2 })]);
    const pick = page.locator('.pgl [data-pick="task"]').first();
    if (await pick.count()) await pick.click(); else await page.getByRole('button', { name: 'タスク', exact: true }).first().click();
    const inp = page.locator('input.remin').first();
    await expect(inp).toBeVisible();
    await inp.fill('開いた画面で足す'); await inp.press('Enter');
    await expect.poll(async () => (await dbTasks(page)).length).toBe(3);
    const focus = (await page.locator('.ftask').count()) > 0; // 開いた縦の集中タスクは、シートではなく下面の詳細で編集・削除する
    await page.locator('[data-key="rm:a"] [data-act="remedit"]').first().click();
    if (focus) { const t = page.locator('.ftcard [data-ft="title"]'); await t.fill('直した題名'); await t.blur(); }
    else { await expect(page.locator('#taskdlg')).toBeVisible(); await page.locator('#tk-title').fill('直した題名'); await page.locator('#tk-save').click(); await expect(page.locator('#taskdlg')).toBeHidden(); }
    await expect.poll(async () => (await dbTasks(page)).find((x) => x.id === 'a').title).toBe('直した題名');
    await page.locator('[data-key="rm:a"] [data-act="remck"]').first().click();
    await expect.poll(async () => { const t = (await dbTasks(page)).find((x) => x.id === 'a'); return [t.title, t.done]; }, { timeout: 5000 }).toEqual(['直した題名', true]);
    await page.locator('[data-key="rm:b"] [data-act="remedit"]').first().click();
    await page.locator(focus ? '[data-act="ftdel"]' : '#tk-del').click();
    await expect.poll(async () => (await dbTasks(page)).map((t) => t.title).sort(), { timeout: 8000 }).toEqual(['直した題名', '開いた画面で足す']);
    expect(await remCalls(page)).toEqual([]);
  });
}

// ---------------- バックアップ（B-6） ----------------
test('品質 B-6: v19.2 のバックアップ（rem*・syncState・墓標入り、版 6）を読み戻しても、つながりは復活しない。墓標は生き返らない。通知オンの件にはアプリの通知が付く。書き出しにも rem* は出ない', async ({ page }, info) => {
  await nat(page);
  await openApp(page, SIZES.openLandscape951, '?nosw');
  const A = { title: '読み戻す件', due: { date: '2026-11-13', time: '18:00' }, note: 'メモ', notify: true, order: 1, createdAt: 5, updatedAt: 6 };
  const file = { app: 'duo-calendar', version: 6, exportedAt: '2026-11-12T09:00:00+09:00', events: [], tasks: [linked('k', A), linked('p', { title: '送信待ちだった件', order: 2, syncState: 'pending' }), tomb('z', { title: '消した跡', order: 3 })] };
  const openBackup = async () => { await expect(page.locator('#backup')).toBeHidden(); await clickSettings(page); await page.getByRole('button', { name: 'バックアップ' }).click(); await expect(page.locator('#backup')).toBeVisible(); };
  await openBackup();
  await page.setInputFiles('#bk-file', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.locator('#bk-body')).toContainText('old.json');
  await page.locator('#bk-replace').click();
  await page.locator('#bk-rdo').click();
  await expect(page.locator('#backup')).toBeHidden();
  await expect.poll(async () => (await dbTasks(page)).map((t) => t.id)).toEqual(['k', 'p']); // 墓標 z は読み戻さない
  const g = Object.fromEntries((await dbTasks(page)).map((t) => [t.id, t]));
  expect(g.k).toEqual(T('k', A));
  for (const t of Object.values(g)) for (const k of LINK) expect(k in t, `${t.id}.${k}`).toBe(false);
  await expect.poll(() => taskPending(page)).toEqual([['duo.task.k', '2026-11-13T18:00']]);
  // 起動し直しても復活しない。知らせも（バックアップの読み戻しだけでは）出ない
  await reloadKeep(page);
  for (const t of await dbTasks(page)) for (const k of LINK) expect(k in t).toBe(false);
  await expect(sheet(page)).toBeHidden();
  // 書き出し: 版 6 のまま、rem* は出ない
  await openBackup();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
  const p = info.outputPath('out.json'); await dl.saveAs(p);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  expect(j.version).toBe(6); expect(j.schema).toBe(6);
  expect(j.tasks.map((t) => t.id)).toEqual(['k', 'p']);
  expect(JSON.stringify(j)).not.toMatch(/remItemId|remExternalId|remListId|remModifiedAt|syncState|tombstone/);
  expect(await remCalls(page)).toEqual([]);
});
