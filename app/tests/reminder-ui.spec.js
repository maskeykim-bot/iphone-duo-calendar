// 第19版 PR10: タスクの画面（設定 › タスク・リストの部品・説明シート・確認の一覧・止まっている1行）。EventKit は偽物。
import { test, expect } from '@playwright/test';
import { openApp, openMenu, SIZES, tab } from './helpers.js';
import { openTasks, seedTasks, dbTasks, T } from './task-helpers.js';

const WRITES = ['createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder', 'createReminderList'];
const LISTS = [
  { id: 'L1', title: 'Duo', color: '#336699', sourceId: 'S1', allowsModify: true, isDefault: true },
  { id: 'L2', title: '仕事', color: '#CC5533', sourceId: 'S1', allowsModify: true },
  { id: 'L3', title: '読み取りだけ', color: '#AA33AA', sourceId: 'S1', allowsModify: false },
];
// perm: reminderPermission の最初の値。requestReminderPermission の結果は ask。
async function kit(page, { sync = null, perm = 'notDetermined', ask = 'granted', rems = [], lists = LISTS } = {}) {
  await page.addInitScript(({ sync, perm, ask, rems, lists }) => {
    if (sync) localStorage.setItem('duo-rem-sync', JSON.stringify(sync));
    const K = window.__K = { calls: [], cbs: {}, rems, perm, seq: 0, clock: Date.parse('2026-11-12T00:00:00Z'), created: {} };
    const tick = () => (K.clock += 5000);
    const view = (r) => ({ ...r, alarms: r.notify ? [{ at: 'x' }] : [], alarmsExtra: 0, priority: 0 });
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (pl, m, o, cb) => { K.cbs[o.eventName] = cb; return 'c'; },
      nativePromise: async (pl, m, o) => {
        K.calls.push([m, JSON.parse(JSON.stringify(o ?? {}))]);
        if (m === 'checkPermission' || m === 'notifyStatus') return { status: 'denied' };
        if (m === 'reminderPermission') return { status: K.perm };
        if (m === 'requestReminderPermission') { if (K.perm === 'notDetermined') K.perm = ask; return { status: K.perm }; }
        if (m === 'listReminderLists') return { lists };
        if (m === 'listReminders') return { reminders: K.rems.filter((r) => o.listIds.includes(r.listId)).map(view) };
        if (m === 'createReminder') {
          if (K.created[o.requestId]) return { reminder: view(K.created[o.requestId]) };
          const r = { itemId: `I${++K.seq}`, externalId: `X${K.seq}`, listId: o.listId, title: o.title, notes: o.notes || '', due: o.due, done: false, doneAt: null, notify: !!o.notify, recurring: false, readOnly: false, createdAt: tick(), modifiedAt: tick() };
          K.rems.push(r); K.created[o.requestId] = r; return { reminder: view(r) };
        }
        if (m === 'updateReminder') { const r = K.rems.find((x) => x.itemId === o.itemId); if (!r) throw { code: 'NOT_FOUND' }; const p = o.patch; if ('title' in p) r.title = p.title; if ('listId' in p) r.listId = p.listId; r.modifiedAt = tick(); return { reminder: view(r) }; }
        if (m === 'setReminderDone') { const r = K.rems.find((x) => x.itemId === o.itemId); if (!r) throw { code: 'NOT_FOUND' }; r.done = o.done; r.modifiedAt = tick(); return { reminder: view(r) }; }
        if (m === 'deleteReminder') { K.rems = K.rems.filter((r) => r.itemId !== o.itemId); return { deleted: true }; }
        if (m === 'checkReminderList') return { status: 'present' };
        throw { code: 'UNAVAILABLE' };
      },
    };
  }, { sync, perm, ask, rems, lists });
}
// 保存済みのタスクとリマインダーを先に用意してから同期をオンにする（起動時の最初の同期が空の Duo を見て取り込んでしまわないように）
async function seedThenOn(page, tasks, size, sync = ON) {
  await openApp(page, size);
  await seedTasks(page, tasks);
  await page.evaluate((v) => localStorage.setItem('duo-rem-sync', JSON.stringify(v)), sync);
  await page.reload(); await page.waitForSelector('html[data-ready]');
}
const REM = (o) => ({ externalId: `X${o.itemId}`, notes: '', due: null, done: false, doneAt: null, recurring: false, readOnly: false, createdAt: 1, modifiedAt: 5, ...o });
const calls = (page, names) => page.evaluate((n) => window.__K.calls.filter((c) => n.includes(c[0])).map((c) => c[0]), names);
const ON = { enabled: true, everEnabled: true, duoListId: 'L1', duoSourceId: 'S1', lists: ['L2'] };
const CLOSED = SIZES.closedPortrait, OPEN = SIZES.openLandscape951;

test('同期オフ・許可なし: 5件足して完了・削除でき、リストの部品は出ない。許可の要求は 0', async ({ page }) => {
  await kit(page, { perm: 'denied' });
  await openTasks(page, OPEN, { seed: [] });
  const lp = page.locator('.page.lp');
  for (let i = 1; i <= 5; i++) { await lp.locator('input.remin').fill(`タスク${i}`); await lp.locator('input.remin').press('Enter'); await expect(lp).toContainText(`タスク${i}`); }
  await expect(lp.locator('.lchips, .dcap2, .rmlist, .stalled')).toHaveCount(0);
  await lp.locator('[data-act="remck"]').first().click();
  await expect.poll(async () => (await dbTasks(page)).filter((t) => t.done).length, { timeout: 4000 }).toBe(1);
  expect(await calls(page, ['requestReminderPermission', ...WRITES])).toEqual([]);
});

test('スイッチをオンにすると説明のシート。× で閉じるとオフのまま・許可の要求 0', async ({ page }) => {
  await kit(page);
  await openApp(page, CLOSED);
  await openMenu(page, 'reminders');
  await expect(page.locator('#m-rssub')).toBeHidden(); // 親の行は別の画面。ここでは設定 › タスクの中
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#m-rssw').click();
  const sh = page.locator('#rsheet');
  await expect(sh).toBeVisible();
  await expect(sh).toContainText('iPhone のリマインダーと同期');
  await expect(sh).toContainText('許可しなくても、タスクはこれまでどおり使えます。');
  const b = await sh.boundingBox();
  expect(b.y).toBeGreaterThan(280); expect(b.y).toBeLessThan(320);
  const x = await sh.locator('.rsx').boundingBox();
  expect(x.width).toBeGreaterThanOrEqual(44); expect(x.height).toBeGreaterThanOrEqual(44);
  await sh.locator('.rsx').click();
  await expect(sh).toBeHidden();
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'false');
  expect(await calls(page, ['requestReminderPermission', ...WRITES])).toEqual([]);
});

test('続ける → 許可 → 確認の一覧。「入れる」までリマインダーへの書き込みは 0。入れるとオンになり件数が出る', async ({ page }) => {
  await kit(page, { rems: [{ itemId: 'R9', externalId: 'XR9', listId: 'L1', title: 'パン', notes: '', due: { date: '2026-11-13' }, done: false, doneAt: null, recurring: false, readOnly: false, createdAt: 1, modifiedAt: 5 }] });
  await openApp(page, CLOSED);
  await seedTasks(page, [T('a', { title: '牛乳', order: 1 }), T('b', { title: 'パン', order: 2, due: { date: '2026-11-13' } }), T('c', { title: 'ごみ', order: 3 })]);
  await openMenu(page, 'reminders');
  await page.locator('#m-rssw').click();
  await page.locator('#rsheet .rsmain').click(); // 続ける
  const sh = page.locator('#rsheet');
  await expect(sh).toContainText('入れるタスク 2');
  await expect(sh).toContainText('同じものかもしれない 1');
  await expect(sh.locator('.rsseg button[aria-pressed="true"]')).toHaveText('結びつける');
  expect(await calls(page, ['requestReminderPermission'])).toEqual(['requestReminderPermission']);
  expect(await calls(page, WRITES)).toEqual([]);
  await sh.locator('.rsmain').click(); // 入れる
  await expect(sh.locator('.rsdone')).toHaveText('リマインダーに 2件入れました');
  expect(await calls(page, ['createReminder'])).toHaveLength(2);
  const t = await dbTasks(page);
  expect(t.find((x) => x.id === 'b').remItemId).toBe('R9'); // 結びつけた
  expect(t.every((x) => x.syncState === 'linked')).toBe(true);
  await sh.locator('.rsmain').click();
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#m-rsat')).toContainText('同期済み');
});

test('あとで: オンにならず、書き込みも 0', async ({ page }) => {
  await kit(page, { perm: 'granted' });
  await openApp(page, CLOSED);
  await seedTasks(page, [T('a', { title: '牛乳' })]);
  await openMenu(page, 'reminders');
  await page.locator('#m-rssw').click(); await page.locator('#rsheet .rsmain').click();
  await page.locator('#rsheet .rslater').click();
  await expect(page.locator('#rsheet')).toBeHidden();
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'false');
  expect(await calls(page, WRITES)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo-rem-sync') || '{}').enabled || false)).toBe(false);
});

test('断られたとき: スイッチはオフのまま、橙の囲みと「設定を開く」。タスクのページは変わらない', async ({ page }) => {
  await kit(page, { ask: 'denied' });
  await openApp(page, CLOSED);
  await seedTasks(page, [T('a', { title: '牛乳' })]);
  await openMenu(page, 'reminders');
  await page.locator('#m-rssw').click(); await page.locator('#rsheet .rsmain').click();
  await expect(page.locator('#rsheet')).toBeHidden();
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'false');
  const box = page.locator('#m-rsdeny');
  await expect(box).toContainText('リマインダーの許可がありません。');
  await expect(box).toContainText('設定アプリでオンにできます。');
  const bb = await box.locator('button').boundingBox();
  expect(Math.round(bb.width)).toBe(112); expect(Math.round(bb.height)).toBe(24);
  await page.locator('#m-rsopen').click();
  expect(await calls(page, ['openSettings'])).toEqual(['openSettings']);
});

test('オン中にスイッチを切ると確認。やめるでもタスクは消えない', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'granted' });
  await openApp(page, CLOSED);
  await seedTasks(page, [T('a', { title: '牛乳' })]);
  await openMenu(page, 'reminders');
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#m-rssw').click();
  await expect(page.locator('#rsheet')).toContainText('同期をやめても、Duo とリマインダーのタスクはどちらも消えません。');
  await page.locator('#rsheet [data-rs="close"]').click(); // キャンセル
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#m-rssw').click(); await page.locator('#rsheet [data-rs="off"]').click();
  await expect(page.locator('#m-rssw')).toHaveAttribute('aria-checked', 'false');
  expect((await dbTasks(page)).length).toBe(1);
});

test('設定 › タスク（オン）: 追加先・取り込むリスト（Duo は ✓ 固定）・注', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'granted' });
  await openApp(page, CLOSED);
  await openMenu(page, 'reminders');
  await expect(page.locator('#m-rsdest')).toContainText('Duo');
  const rows = page.locator('#m-rslists .rslist');
  await expect(rows).toHaveCount(3);
  const bb = await rows.first().boundingBox(); expect(Math.round(bb.height)).toBe(40);
  await expect(rows.nth(0)).toHaveAttribute('aria-disabled', 'true');
  await expect(rows.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(rows.nth(2)).toHaveAttribute('aria-checked', 'false');
  await rows.nth(2).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo-rem-sync')).lists)).toEqual(['L2', 'L3']);
  await page.locator('#m-rsdest').click();
  await expect(page.locator('#rsheet .rsrowp')).toHaveCount(2); // 書けないリストは出ない
  await page.locator('#rsheet .rsrowp').nth(1).click();
  await expect(page.locator('#rsheet')).toBeHidden();
  await expect(page.locator('#m-rsdestv')).toContainText('仕事');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo-rem-sync')).addTo)).toBe('L2');
});

for (const size of [CLOSED, OPEN]) {
  test(`リストの部品（${size.width}x${size.height}）: チップ・保存先カプセル・行のリスト名。選ぶと保存先もそのリスト`, async ({ page }) => {
    await kit(page, { sync: null, perm: 'granted', rems: [REM({ itemId: 'I9', listId: 'L2', title: '会議' })] });
    const seedL = [T('a', { title: '牛乳', due: null }), T('b', { title: '会議', due: null, order: 2, remItemId: 'I9', remExternalId: 'XI9', remListId: 'L2', remModifiedAt: 5, syncState: 'linked' })];
    let lp = page.locator('.page.lp');
    await seedThenOn(page, seedL, size);
    if (size === CLOSED) { await tab(page, 'ホーム').click(); /* 閉じた画面は読み込み直すとカレンダーから（design/34 §9.2） */ await page.locator('button', { hasText: 'すべて ›' }).first().click(); lp = page.locator('.page').filter({ has: page.locator('input.remin') }).first(); }
    else { await page.locator('.pgl [data-pick="task"]').first().click(); }
    const chips = lp.locator('.lchips');
    await expect(chips).toBeVisible();
    await expect(chips.locator('.lchip')).toHaveText(['すべて', 'Duo', '仕事']);
    const c = await chips.locator('.lchip').nth(1).boundingBox();
    expect(Math.round(c.height)).toBe(28);
    expect(await chips.locator('.lchip').nth(1).evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px');
    expect(await chips.locator('.lchip').nth(1).evaluate((e) => getComputedStyle(e).borderRadius)).toBe('14px');
    await expect(chips.locator('.lchip.on')).toHaveText('すべて');
    expect(await chips.locator('.lchip.on').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(41, 78, 66)');
    const cap = lp.locator('.dcap2');
    const cb = await cap.boundingBox();
    expect(Math.round(cb.height)).toBe(28); expect(cb.width).toBeLessThanOrEqual(104.5);
    await expect(cap).toContainText('Duo');
    expect(['1px', '1.5px']).toContain(await cap.evaluate((e) => getComputedStyle(e).borderTopWidth)); // CSS は 1.5px。DPR 1 の Chromium は 1px に丸める
    await expect(lp.locator('.rmlist').first()).toBeVisible();
    await expect(lp.locator('.rmrow', { hasText: '会議' }).locator('.rmlist')).toContainText('仕事');
    // 仕事を選ぶ → 絞り込み・保存先も仕事
    await chips.locator('.lchip', { hasText: '仕事' }).click();
    await expect(lp.locator('.rmrow')).toHaveCount(1);
    await expect(lp.locator('.dcap2')).toContainText('仕事');
    await lp.locator('input.remin').fill('新しい'); await lp.locator('input.remin').press('Enter');
    await expect.poll(async () => (await page.evaluate(() => window.__K.rems.find((r) => r.title === '新しい')?.listId)), { timeout: 5000 }).toBe('L2');
  });
}

test('カプセルで保存先を選ぶと 0.15 秒で戻り、フォーカスは入力欄に残る。書けないリストは候補に出ない', async ({ page }) => {
  await kit(page, { sync: { ...ON, lists: ['L2', 'L3'] }, perm: 'granted' });
  await openTasks(page, OPEN, { seed: [] });
  const lp = page.locator('.page.lp');
  await lp.locator('.dcap2').click();
  const rows = page.locator('#rsheet .rsrowp');
  await expect(rows).toHaveCount(2);
  const h = await rows.first().boundingBox(); expect(Math.round(h.height)).toBe(44);
  await rows.nth(1).click();
  await expect(page.locator('#rsheet')).toBeHidden();
  await expect(lp.locator('.dcap2')).toContainText('仕事');
  await expect(lp.locator('input.remin')).toBeFocused();
});

test('止まっている1行: 一度でもオンにして今は拒否のときだけ。押すと設定 › タスク', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'denied' });
  await openTasks(page, OPEN, { seed: [T('a')] });
  const st = page.locator('.page.lp .stalled');
  await expect(st).toHaveText(/リマインダーとの同期が止まっています/);
  const b = await st.boundingBox(); expect(Math.round(b.height)).toBe(28);
  expect(await st.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(240, 237, 229)');
  await st.click();
  await expect(page.locator('#menu [data-screen="reminders"]')).toBeVisible();
  await expect(page.locator('#m-rsdeny')).toBeVisible();
});
test('止まっている1行は、一度もオンにしていなければ（許可なしでも）出ない', async ({ page }) => {
  await kit(page, { perm: 'denied' });
  await openTasks(page, OPEN, { seed: [T('a')] });
  await expect(page.locator('.stalled')).toHaveCount(0);
});

test('リマインダー側で消された件は残り、四角が灰で「Duo だけに残しています」', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'granted' });
  await openTasks(page, OPEN, { seed: [T('a', { title: '消された', syncState: 'local' }), T('b', { title: '普通', order: 2 })] });
  const r = page.locator('.page.lp .rmrow', { hasText: '消された' });
  await expect(r).toContainText('Duo だけに残しています');
  expect(await r.locator('.rmck').evaluate((e) => getComputedStyle(e).borderTopColor)).toBe('rgb(201, 198, 188)');
  await expect(page.locator('.page.lp .rmrow', { hasText: '普通' })).not.toContainText('Duo だけに');
});

test('編集シートの「リスト ›」（行 44）。つながっている件だけ。選ぶとリマインダーでも移る', async ({ page }) => {
  await kit(page, { sync: null, perm: 'granted', rems: [REM({ itemId: 'I1', externalId: 'X1', listId: 'L1', title: '牛乳' })] });
  await seedThenOn(page, [T('a', { title: '牛乳', due: null, remItemId: 'I1', remExternalId: 'X1', remListId: 'L1', remModifiedAt: 5, syncState: 'linked' }), T('b', { title: 'ローカル', due: null, order: 2 })], OPEN);
  await page.locator('.pgl [data-pick="task"]').first().click();
  await page.locator('.page.lp .rmrow', { hasText: 'ローカル' }).locator('.rmbody').click();
  await expect(page.locator('#taskdlg')).toBeVisible();
  await expect(page.locator('#tk-list')).toHaveCount(0);
  await page.locator('#tk-close').click();
  await page.locator('.page.lp .rmbody[data-id="a"]').click();
  const lb = page.locator('#tk-list');
  const bb = await lb.boundingBox(); expect(Math.round(bb.height)).toBe(44);
  await lb.click();
  await page.locator('#rsheet .rsrowp', { hasText: '仕事' }).click();
  await expect.poll(async () => page.evaluate(() => window.__K.rems[0].listId), { timeout: 5000 }).toBe('L2');
});

test('Web（native なし）では同期の行ごと出さない。月の件数と完了の表示は残る', async ({ page }) => {
  await openApp(page, SIZES.closedPortrait);
  await openMenu(page, 'reminders');
  await expect(page.locator('#m-rs')).toBeHidden();
  await expect(page.locator('#m-rssub')).toHaveText('');
  await expect(page.locator('#m-tkmonth')).toBeVisible();
  await expect(page.locator('#m-tkwin')).toHaveText('30日分を表示');
});
test('許可が「使えない」（シミュレータ）のときは続けるの後で行ごと隠れる', async ({ page }) => {
  await kit(page, { ask: 'unavailable' });
  await openApp(page, CLOSED);
  await openMenu(page, 'reminders');
  await page.locator('#m-rssw').click(); await page.locator('#rsheet .rsmain').click();
  await expect(page.locator('#m-rs')).toBeHidden();
  expect(await calls(page, WRITES)).toEqual([]);
});

test('iPhone で足した件が入ると、まとめの知らせ1行（黒の帯 44・3秒）と、その行が一瞬 #E5EEE9 で光る', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'granted' });
  await openTasks(page, OPEN, { seed: [T('a', { title: '牛乳', due: null })] });
  await page.evaluate(() => { window.__K.rems.push({ itemId: 'N1', externalId: 'XN1', listId: 'L1', title: 'iPhoneで足した', notes: '', due: null, done: false, doneAt: null, recurring: false, readOnly: false, createdAt: 1, modifiedAt: Date.now() }); window.__K.cbs.calendarChanged?.(); });
  const toast = page.locator('#native-toast');
  await expect(toast).toHaveText('iPhone のリマインダーの変更を入れました');
  const b = await toast.boundingBox(); expect(Math.round(b.height)).toBe(44);
  const row = page.locator('.page.lp .rmrow', { hasText: 'iPhoneで足した' });
  await expect(row).toBeVisible();
  await expect(page.locator('.page.lp .rmrow.fresh')).toHaveCount(1);
  await expect(page.locator('.page.lp .rmrow.fresh')).toHaveCount(0, { timeout: 3000 }); // 1 秒で消える
  await expect(toast).toHaveCount(0, { timeout: 5000 }); // 3 秒
});

// ---- 第19版 D8: 許可の流れ（データ側） ----
test('D8 RS-1・RS-2: 許可を OS に求めるのは notDetermined のときだけ。granted・denied では求めない', async ({ page }) => {
  for (const perm of ['granted', 'denied', 'restricted']) {
    await kit(page, { perm });
    await openApp(page, CLOSED);
    await openMenu(page, 'reminders');
    await page.locator('#m-rssw').click(); await page.locator('#rsheet .rsmain').click();
    await expect(page.locator(perm === 'granted' ? '#rsheet .rsmain' : '#m-rsdeny')).toBeVisible();
    expect(await calls(page, ['requestReminderPermission', ...WRITES])).toEqual([]);
    await page.unrouteAll(); await page.goto('about:blank');
  }
});
test('D8 RS-3・RS-4・RS-45・RS-52: 取り消されても追加・完了・削除はできる。EventKit へは書かず、取得もしない。止まっている1行が出る', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'granted' });
  await openTasks(page, OPEN, { seed: [T('a', { title: '牛乳', due: null })] });
  await page.evaluate(() => { window.__K.perm = 'denied'; window.__K.calls.length = 0; document.dispatchEvent(new Event('visibilitychange')); window.__K.cbs.calendarChanged?.(); });
  const lp = page.locator('.page.lp');
  await expect(lp.locator('.stalled')).toHaveCount(1);
  await lp.locator('input.remin').fill('新しい'); await lp.locator('input.remin').press('Enter');
  await expect(lp).toContainText('新しい');
  await lp.locator('[data-act="remck"]').first().click();
  await expect.poll(async () => (await dbTasks(page)).filter((t) => t.done).length, { timeout: 4000 }).toBe(1);
  await page.waitForTimeout(900);
  expect(await calls(page, [...WRITES, 'listReminders', 'requestReminderPermission'])).toEqual([]);
  expect((await dbTasks(page)).length).toBe(2);
});
test('D8: 同期オンの calendarChanged は 300ms の間引きで取得 1 回。オフでは 0 回', async ({ page }) => {
  await kit(page, { sync: ON, perm: 'granted' });
  await openTasks(page, OPEN, { seed: [T('a', { title: '牛乳', due: null })] });
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__K.calls.length = 0; for (let i = 0; i < 3; i++) window.__K.cbs.calendarChanged?.(); });
  await page.waitForTimeout(900);
  expect(await calls(page, ['listReminders'])).toEqual(['listReminders']);
});

// ---- 第19版 D9: すでにあるタスクの移し方（RS-49・50・49b・50b） ----
const PREV = [REM({ itemId: 'P1', listId: 'L1', title: '前の牛乳' }), REM({ itemId: 'P2', listId: 'L1', title: '前のパン' }), REM({ itemId: 'P3', listId: 'L1', title: '前のごみ' })];
async function toConfirm(page) {
  await openMenu(page, 'reminders');
  await page.locator('#m-rssw').click(); await page.locator('#rsheet .rsmain').click();
}
test('RS-49・50: 入れ直し。以前の「Duo」リストの件が一覧に出て、選ぶまで書き込み 0。選んだ件だけ入り、残りは取り込まれない。リストは増えない', async ({ page }) => {
  await kit(page, { rems: PREV.map((r) => ({ ...r })) });
  await openApp(page, CLOSED);
  await seedTasks(page, [T('a', { title: '新しい件', order: 1 })]);
  await toConfirm(page);
  const sh = page.locator('#rsheet');
  await expect(sh).toContainText('リマインダーにある件 3');
  await expect(sh.locator('[data-rs="pickrem"][aria-checked="true"]')).toHaveCount(0); // 初期は全部オフ（自動では取り込まない）
  await expect(sh).not.toContainText('以前の「Duo」リスト'); // 1 つに決まったので選ばせない
  const b = await sh.locator('[data-rs="pickrem"]').first().boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(await calls(page, WRITES)).toEqual([]);
  await sh.locator('[data-rs="pickrem"]').nth(1).click();
  await expect(sh.locator('[data-rs="pickrem"]').nth(1)).toHaveAttribute('aria-checked', 'true');
  expect(await calls(page, WRITES)).toEqual([]);
  await sh.locator('.rsmain').click(); // 入れる
  await expect(sh.locator('.rsdone')).toBeVisible();
  const t = await dbTasks(page);
  expect(t.map((x) => x.title).sort()).toEqual(['前のパン', '新しい件'].sort());
  expect(t.find((x) => x.title === '前のパン')).toMatchObject({ remItemId: 'P2', remListId: 'L1', syncState: 'linked' });
  const c = await page.evaluate(() => window.__K.calls.filter((c) => ['createReminder', 'createReminderList'].includes(c[0])).map((c) => [c[0], c[1].title, c[1].listId]));
  expect(c).toEqual([['createReminder', '新しい件', 'L1']]); // 書き出し先は以前のリスト。新しいリストも作らない
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await expect.poll(async () => (await dbTasks(page)).length).toBe(2); // 選ばなかった件は次の同期でも取り込まれない
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('duo-rem-sync'))).declined.sort()).toEqual(['P1', 'P3', 'XP1', 'XP3']);
});
test('RS-49b: 「Duo」リストが 2 つあるときは自動で選ばない。選ぶまで「入れる」は押せず、選んだリストが書き出し先になる', async ({ page }) => {
  const lists = [...LISTS, { id: 'L4', title: 'Duo', color: '#118833', sourceId: 'S2', allowsModify: true }];
  await kit(page, { lists, rems: [REM({ itemId: 'Q1', listId: 'L4', title: '別の件' }), ...PREV.map((r) => ({ ...r }))] });
  await openApp(page, CLOSED);
  await seedTasks(page, [T('a', { title: '新しい件', order: 1 })]);
  await toConfirm(page);
  const sh = page.locator('#rsheet');
  await expect(sh).toContainText('「Duo」という名前のリストが複数あります');
  await expect(sh.locator('[data-rs="prevlist"]')).toHaveCount(3); // Duo ×2 と「新しく作る」
  await expect(sh.locator('.rsmain')).toBeDisabled();
  await expect(sh.locator('[data-rs="pickrem"]')).toHaveCount(0);
  expect(await calls(page, WRITES)).toEqual([]);
  await sh.locator('[data-rs="prevlist"][data-list="L4"]').click();
  await expect(sh).toContainText('リマインダーにある件 1');
  await expect(sh.locator('.rsmain')).toBeEnabled();
  await sh.locator('.rsmain').click();
  await expect(sh.locator('.rsdone')).toBeVisible();
  const c = await page.evaluate(() => window.__K.calls.filter((c) => c[0] === 'createReminder').map((c) => c[1].listId));
  expect(c).toEqual(['L4']);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('duo-rem-sync'))).duoListId).toBe('L4');
  expect((await dbTasks(page)).map((x) => x.title)).toEqual(['新しい件']); // 選ばなかった件は入らない
});
