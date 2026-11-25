// 第19.6版（征希さん 2026-11-26「予定ノート」）: 予定ごとのノート（実装担当）。
// 決まり（征希さんの言葉）: 「1予定に1ノート」「初めて書いた時だけ作成」「予定を移動しても紐付けを維持」「予定を削除してもノートは残す」「繰り返し予定は開催回ごとに分ける」
// 「左の予定をタップしたら右にその予定ノートが開く」「ノート一覧からも『予定ノート』で絞り込めて、元の予定に戻れる」「予定のメモ欄には二重保存しない」
// 保存の形（任意の項目 eventRef・版は 6 のまま）は test-unit/event-ref.test.mjs。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { boot, DAY, D14, dbNotes, cardSel, note } from './v193-p3-lib.js';
import { ev, SIZES, dbEvents, pagePick } from './helpers.js';

const evNotes = async (page) => (await dbNotes(page)).filter((n) => n.eventRef);
const openEvSheet = async (page, id) => { await page.locator(`.mday .mdcard[data-event^="${id}"]`).first().click(); await expect(page.locator('#editor[open]')).toBeVisible(); };
const typeNote = async (page, text) => { await page.keyboard.type(text); await page.waitForTimeout(1300); };
const goDay = async (page, k) => { await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.selected = k; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); }, k); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(500); };
const doneSheet = async (page) => { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800); };

test('EN-1 予定のシートの「予定ノート」→ ノートのシート（上に「予定: 会議 ›」）。何も書かずに閉じたら何も残らない。書くと 1 件でき、予定のメモ欄は変わらない', async ({ page }) => {
  await boot(page, { notes: [] });
  await openEvSheet(page, 'e1');
  await expect(page.locator('#evnote')).toBeVisible();
  await page.locator('#evnote').click();
  await expect(page.locator('#editor[open]')).toHaveCount(0); await expect(page.locator('.nsheet:not([hidden])')).toBeVisible();
  await expect(page.locator('.nsheet .nsev')).toBeVisible(); await expect(page.locator('.nsheet .nsev span')).toHaveText('予定: 会議');
  expect(await page.locator('.nsheet .ned-title').getAttribute('placeholder')).toBe('会議'); // 題名が空のあいだは予定の題名を薄く
  await doneSheet(page);
  expect(await dbNotes(page)).toEqual([]); // 書かずに閉じた: 作らない
  await openEvSheet(page, 'e1'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await page.locator('.nsheet .ned-title').click(); await typeNote(page, '段取り'); await page.keyboard.press('Enter'); await typeNote(page, '資料を3部');
  await doneSheet(page);
  const ns = await dbNotes(page);
  expect(ns.length).toBe(1); expect(ns[0].body).toBe('段取り\n資料を3部');
  expect(ns[0].eventRef).toEqual({ k: 'd:e1', title: '会議', day: DAY }); expect(ns[0].date).toBe(null); // 日ノートとは別（日の欄のノートには出ない）
  await expect(page.locator('.mday .mdk-note')).toHaveCount(0);
  expect((await dbEvents(page)).find((e) => e.id === 'e1').notes).toBe('資料を印刷して持参'); // メモ欄に二重保存しない
});

test('EN-2 1予定に1ノート: もう一度開くと同じノート。予定を別の日へ動かしても同じノート（控えの日は新しくなる）。「予定: 会議 ›」で元の予定のシートが開く', async ({ page }) => {
  await boot(page, { notes: [note('nx', '会議の段取り', null, { eventRef: { k: 'd:e1', title: '会議', day: DAY } })] });
  await openEvSheet(page, 'e1'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet .ned-title')).toHaveValue('会議の段取り');
  await doneSheet(page);
  // 別日へ動かす（カードの「別日に移動」）
  await page.locator(`.mday .mdmv[data-kind="event"][data-id="e1"]`).click();
  await page.locator(`.cmv2 .dpgrid [data-day="${D14}"]`).click(); await page.locator('.cmv2 .cmvgo').click();
  await expect.poll(async () => (await dbEvents(page)).find((e) => e.id === 'e1').start).toBe(`${D14}T09:00`);
  await page.locator(`.week .day[data-date="${D14}"]`).click(); await page.waitForTimeout(400);
  await openEvSheet(page, 'e1'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet .ned-title')).toHaveValue('会議の段取り');
  const ns = await evNotes(page); expect(ns.length).toBe(1);
  await expect.poll(async () => (await evNotes(page))[0].eventRef.day).toBe(D14);
  // 元の予定へ
  await page.locator('.nsheet .nsev').click();
  await expect(page.locator('#editor[open]')).toBeVisible(); await expect(page.locator('#f-title')).toHaveValue('会議');
});

test('EN-3 繰り返しの予定は開催回ごとに別のノート', async ({ page }) => {
  await boot(page, { notes: [], events: [ev('rp', '朝会', `${DAY}T08:00`, `${DAY}T08:15`, { recurrence: { freq: 'daily', interval: 1 } })] });
  await openEvSheet(page, 'rp'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await page.locator('.nsheet .ned-title').click(); await typeNote(page, '12日の朝会'); await doneSheet(page);
  await page.locator(`.week .day[data-date="2026-11-13"]`).click(); await page.waitForTimeout(400);
  await page.locator('.mday .mdcard.mdk-event').first().click(); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet .ned-title')).toHaveValue(''); // 別の回は別のノート
  await page.locator('.nsheet .ned-title').click(); await typeNote(page, '13日の朝会'); await doneSheet(page);
  const ks = (await evNotes(page)).map((n) => n.eventRef.k).sort();
  expect(ks).toEqual(['d:rp@2026-11-12T08:00', 'd:rp@2026-11-13T08:00']);
});

test('EN-4 予定を消してもノートは残る。「予定: … ›」→「予定が見つかりません」のシートで、別の日の予定につなぎ直せる（すでに予定ノートのある予定は選べない）', async ({ page }) => {
  await boot(page, { notes: [note('nx', '会議の段取り', null, { eventRef: { k: 'd:gone', title: '消えた会議', day: D14 } }), note('ny', 'ランチの段取り', null, { eventRef: { k: 'd:e2', title: 'ランチ', day: DAY } })] });
  await page.setViewportSize(SIZES.openLandscape951); await page.waitForTimeout(500);
  await pagePick(page, 'right', 'ノート').click();
  await page.locator('.page.rp [data-nf="sel"][data-id="ev"]').click();
  await expect(page.locator('.page.rp .mrow')).toHaveCount(2);
  await expect(page.locator('.page.rp .mrow', { hasText: '会議の段取り' }).locator('span')).toContainText('予定 11/14');
  await page.locator('.page.rp .mrow', { hasText: '会議の段取り' }).click(); await page.waitForTimeout(400);
  await page.locator('.page.rp .nevent').click();
  const rl = page.locator('.relink');
  await expect(rl.locator('h3')).toHaveText('予定が見つかりません'); await expect(rl.locator('.rlwhy')).toContainText('「消えた会議」');
  await expect(rl.locator('.rlnone')).toHaveText('この日の予定はありません'); // 11/14 には予定が無い
  await rl.locator('.dcap').click(); await rl.locator(`.dpgrid [data-day="${DAY}"]`).click(); await page.waitForTimeout(300);
  await expect(rl.locator('.rlev')).toHaveCount(2);
  await expect(rl.locator('.rlev', { hasText: 'ランチ' })).toBeDisabled(); await expect(rl.locator('.rlev', { hasText: 'ランチ' }).locator('small')).toContainText('予定ノートあり');
  await rl.locator('.rlev', { hasText: '会議' }).click();
  await expect(page.locator('.relink')).toHaveCount(0); await expect(page.locator('#native-toast')).toContainText('「会議」につなぎ直しました');
  await expect.poll(async () => (await dbNotes(page)).find((n) => n.id === 'nx').eventRef).toEqual({ k: 'd:e1', title: '会議', day: DAY });
  await page.locator('.page.rp .nevent').click(); // つなぎ直した予定が開く
  await expect(page.locator('#editor[open]')).toBeVisible(); await expect(page.locator('#f-title')).toHaveValue('会議');
});

test('EN-6 予定をシートの「予定を削除」で消す → ノートは残る。見つからないシートの「つながりを外す」で ふつうのノートになる（本文はそのまま）', async ({ page }) => {
  await boot(page, { notes: [note('nx', '会議の段取り\n資料', null, { eventRef: { k: 'd:e1', title: '会議', day: DAY } })] });
  await openEvSheet(page, 'e1'); await page.locator('#delete').click();
  await expect(page.locator('#confirm')).toBeVisible(); await page.locator('#confirm .danger, #confirm [data-act="del"], #confirm button.primary').first().click();
  await expect.poll(async () => (await dbEvents(page)).some((e) => e.id === 'e1')).toBe(false);
  const n0 = (await dbNotes(page)).find((n) => n.id === 'nx'); expect(n0.deletedAt).toBe(null); expect(n0.body).toBe('会議の段取り\n資料');
  await page.setViewportSize(SIZES.openLandscape951); await page.waitForTimeout(500);
  await pagePick(page, 'right', 'ノート').click();
  await page.locator('.page.rp [data-nf="sel"][data-id="ev"]').click(); await page.locator('.page.rp .mrow').click(); await page.waitForTimeout(400);
  await page.locator('.page.rp .nevent').click();
  await page.locator('.relink .rlunlink').click();
  await expect.poll(async () => 'eventRef' in (await dbNotes(page)).find((n) => n.id === 'nx')).toBe(false);
  const n1 = (await dbNotes(page)).find((n) => n.id === 'nx'); expect(n1.body).toBe('会議の段取り\n資料'); expect(n1.deletedAt).toBe(null);
  await expect(page.locator('.page.rp .nevent')).toHaveCount(0);
});

test('EN-7 毎週の定例は「定例の id＋その回の元の日時」でつなぐ: 今週分だけ火曜から水曜へ動かしても今週のノートのまま。来週の回は別のノート。題名を変えてもつながったまま', async ({ page }) => {
  const TUE = '2026-11-17', WED = '2026-11-18', NEXT = '2026-11-24';
  await boot(page, { notes: [], sel: TUE, events: [ev('wk', '定例', '2026-11-10T10:00', '2026-11-10T11:00', { recurrence: { freq: 'weekly', interval: 1 } })] });
  await openEvSheet(page, 'wk'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await page.locator('.nsheet .ned-title').click(); await typeNote(page, '今週の段取り'); await doneSheet(page);
  expect((await evNotes(page)).map((n) => n.eventRef.k)).toEqual([`d:wk@${TUE}T10:00`]);
  // 今週分だけ水曜へ（カードの「別日に移動」は繰り返しならこの回だけ）
  await page.locator('.mday .mdmv[data-kind="event"]').first().click();
  await page.locator(`.cmv2 .dpgrid [data-day="${WED}"]`).click(); await expect(page.locator('.cmv2 .cmvnote')).toContainText('この回だけ'); await page.locator('.cmv2 .cmvgo').click();
  await page.waitForTimeout(500);
  await goDay(page, WED);
  await openEvSheet(page, 'wk'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet .ned-title')).toHaveValue('今週の段取り'); // 動かしても今週のノート
  await doneSheet(page);
  expect((await evNotes(page)).length).toBe(1);
  // 来週の回は別（空のまま閉じれば何も作らない）
  await goDay(page, NEXT);
  await openEvSheet(page, 'wk'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet .ned-title')).toHaveValue(''); await doneSheet(page);
  expect((await evNotes(page)).length).toBe(1);
  // 題名を変えても（題名ではつながないので）同じノート
  await page.evaluate(async () => { const db = await import('/js/db.js'); const e = (await db.listEvents()).find((x) => x.id === 'wk'); await db.putMany([{ ...e, title: '週次定例' }]); });
  await goDay(page, WED);
  const shown = (await page.locator('.mday .mdcard[data-event^="wk"] strong').first().textContent()).replace(/^↻/, '').trim(); // この回に出ている題名（この回だけ動かした回は、動かしたときの題名を持つ）
  await openEvSheet(page, 'wk'); await page.locator('#evnote').click(); await page.waitForTimeout(500);
  await expect(page.locator('.nsheet .ned-title')).toHaveValue('今週の段取り');
  await expect.poll(async () => (await evNotes(page))[0].eventRef.title).toBe(shown); // 控えの題名は、いま出ている題名にそろう（探すのには使わない）
});

test('EN-5 開いた横: 反対側のページがノートなら、予定を押すとそのページに予定ノートが開く（予定のシートは開かない）。反対側がノートでなければ今までどおりシート', async ({ page }) => {
  await boot(page, { notes: [], size: SIZES.openLandscape951 });
  await pagePick(page, 'left', '時間').click(); await pagePick(page, 'right', '月').click();
  await page.locator('.page.lp [data-event="e1"]').first().click();
  await expect(page.locator('#editor[open]')).toBeVisible(); // 反対側が月: 今までどおり
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog#editor[open]'));
  await pagePick(page, 'right', 'ノート').click();
  await page.locator('.page.lp [data-event="e1"]').first().click(); await page.waitForTimeout(500);
  await expect(page.locator('#editor[open]')).toHaveCount(0);
  await expect(page.locator('.page.rp .nevent span')).toHaveText('予定: 会議');
  expect(await page.locator('.page.rp .ned-title').getAttribute('placeholder')).toBe('会議');
  // 一覧の題名: 予定ノートで題名が空なら、予定の題名を出す
  await page.locator('.page.rp .ned-body').click(); await typeNote(page, '資料の確認');
  await page.locator('.page.rp [data-act="noteback"]').click(); await page.waitForTimeout(400);
  await page.locator('.page.rp [data-nf="sel"][data-id="ev"]').click();
  await expect(page.locator('.page.rp .mrow b')).toHaveText('会議');
});
