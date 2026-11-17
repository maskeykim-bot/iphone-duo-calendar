import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { CAT_IDS } from '../js/categories.js';
import { openApp, seed, dbEvents, ev, SIZES, layout, period, findTextOverlaps, textInGutter } from './helpers.js';

const SEED = [
  ev('s1', 'プロジェクト定例', '2026-11-12T10:00', '2026-11-12T11:00', { place: '会議室A', categoryId: CAT_IDS.work }),
  ev('s2', 'ランチ', '2026-11-13T12:00', '2026-11-13T13:00', { place: 'Cafe ＡＢＣ', categoryId: CAT_IDS.private }),
  ev('s3', '歯医者', '2026-11-14T09:00', '2026-11-14T10:00', { notes: '前回の ﾌﾟﾛｼﾞｪｸﾄ 資料を持参。' + 'あ'.repeat(60) + '長いメモの途中に目印あり' + 'い'.repeat(60), categoryId: CAT_IDS.private }),
  ev('s4', 'ジム', '2026-11-16T07:00', '2026-11-16T08:00', { categoryId: CAT_IDS.family, recurrence: { freq: 'weekly', interval: 1, byDay: [1], count: null, until: null } }),
  ev('s5', '<b>危険</b>&amp;', '2026-11-17T10:00', '2026-11-17T11:00'),
  ev('s6', '複数日の出張', '2026-11-19T00:00', '2026-11-21T23:59', { all: true, categoryId: CAT_IDS.out }),
];
const searchBtn = (page) => page.getByRole('button', { name: '予定を検索' });
async function search(page, q) {
  await page.locator('#sr-q').fill(q);
  await expect(page.locator('#sr-body')).not.toContainText('検索しています');
}
const hits = (page) => page.locator('#sr-body .hit');

test.describe('検索', () => {
  test.beforeEach(async ({ page }) => { await openApp(page); await seed(page, SEED); await searchBtn(page).click(); });

  test('未入力の案内・範囲注記・クリア・Esc', async ({ page }) => {
    await expect(page.locator('#sr-q')).toBeFocused();
    await expect(page.locator('#sr-body')).toContainText('探したい予定の言葉を入力してください');
    await expect(page.locator('#sr-range')).toHaveText('検索範囲：2025/11/12–2028/11/12・最大200件');
    await search(page, '   ');
    await expect(page.locator('#sr-body')).toContainText('探したい予定の言葉');
    await search(page, 'ランチ');
    await expect(hits(page)).toHaveCount(1);
    await page.getByRole('button', { name: '検索語をクリア' }).click();
    await expect(page.locator('#sr-q')).toHaveValue('');
    await expect(hits(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#search')).toBeHidden();
    await expect(searchBtn(page)).toBeFocused();
  });

  test('タイトル・場所・メモで一致する', async ({ page }) => {
    await search(page, '定例');
    await expect(hits(page)).toHaveCount(1);
    await search(page, '会議室');
    await expect(hits(page)).toHaveCount(1);
    await search(page, '目印');
    await expect(hits(page)).toHaveCount(1);
    await expect(hits(page).first()).toContainText('歯医者');
    await expect(page.locator('#sr-body .hnote')).toContainText('…');
  });

  test('全角半角・ひらがなカタカナ・大文字小文字の揺れ', async ({ page }) => {
    for (const q of ['ﾌﾟﾛｼﾞｪｸﾄ', 'ぷろじぇくと', 'プロジェクト', 'ﾌﾟﾛｼﾞｪｸﾄ 定例']) {
      await search(page, q);
      await expect(hits(page).first()).toContainText(/プロジェクト定例|歯医者/);
    }
    await search(page, 'ぷろじぇくと');
    await expect(hits(page)).toHaveCount(2); // 予定名とメモ
    await expect(page.locator('#sr-body mark').first()).toHaveText('プロジェクト');
    await search(page, 'ﾌﾟﾛｼﾞｪｸﾄ 定例');
    await expect(hits(page)).toHaveCount(1); // AND
    await search(page, 'cafe abc');
    await expect(hits(page)).toHaveCount(1);
    await search(page, 'ＣＡＦＥ　ａｂｃ');
    await expect(hits(page)).toHaveCount(1);
    await expect(page.locator('#sr-body mark')).toHaveText(['Cafe', 'ＡＢＣ']);
  });

  test('繰り返しの各回が複数の日付グループで出る', async ({ page }) => {
    await search(page, 'ジム');
    await expect(hits(page)).toHaveCount(104); // 毎週月曜、検索範囲（今日〜2028/11/12）内の全回
    await expect(page.locator('#sr-body [data-sec="events"]')).toContainText('104件の予定');
    await expect(page.locator('#sr-body .hgroup h3').first()).toHaveText('11月16日（月）');
    await expect(page.locator('#sr-body .hgroup h3').nth(1)).toHaveText('11月23日（月）');
    await expect(hits(page).first().locator('.rep')).toHaveCount(1);
    await expect(hits(page).first()).toHaveAttribute('aria-label', /繰り返し/);
  });

  test('上限200件で打ち切り、注記を表示', async ({ page }) => {
    await page.keyboard.press('Escape');
    await seed(page, [ev('d1', '毎日ストレッチ', '2026-11-13T06:00', '2026-11-13T06:30', { recurrence: { freq: 'daily', interval: 1, byDay: [], count: null, until: null } })]);
    await searchBtn(page).click();
    await search(page, 'ストレッチ');
    await expect(page.locator('#sr-body [data-sec="events"]')).toContainText('200件を表示しています');
    await expect(hits(page)).toHaveCount(200);
  });

  test('該当なし／HTML は文字として扱い強調も安全', async ({ page }) => {
    await search(page, '存在しない語');
    await expect(page.locator('#sr-body')).toContainText('該当する予定はありません。検索語や検索範囲を確認してください。');
    await search(page, 'b>危険');
    await expect(hits(page)).toHaveCount(1);
    await search(page, '危険');
    await expect(page.locator('#sr-body b')).toHaveCount(0);
    await expect(hits(page).first().locator('strong')).toContainText('<b>');
    await search(page, 'amp');
    await expect(hits(page)).toHaveCount(1);
    await expect(page.locator('#sr-body mark')).toHaveText('amp');
  });

  test('結果をタップするとその日へ移動してパネルが閉じる', async ({ page }) => {
    await search(page, 'ランチ');
    await hits(page).first().click();
    await expect(page.locator('#search')).toBeHidden();
    expect(await layout(page)).toBe('browse');
    expect(await period(page)).toBe('11月13日（金）');
    await expect(page.locator('.tlev')).toHaveCount(1);
    await expect(page.locator('.tlev')).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('11月13日（金）へ移動しました。');
  });

  test('繰り返しの回をタップするとその回の日へ', async ({ page }) => {
    await search(page, 'ジム');
    await page.locator('#sr-body .hgroup', { hasText: '11月30日（月）' }).locator('.hit').click();
    expect(await period(page)).toBe('11月30日（月）');
  });
});

test.describe('検索とバックアップの表示', () => {
  for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ['開いた横', SIZES.openLandscape]]) {
    test(`${name}: 検索パネルとバックアップ画面でテキスト重なりなし`, async ({ page }) => {
      await openApp(page, size);
      await seed(page, SEED);
      await searchBtn(page).click();
      await page.locator('#sr-q').fill('ぷろじぇくと');
      await expect(hits(page)).toHaveCount(2);
      expect(await findTextOverlaps(page)).toEqual([]);
      if (size === SIZES.openLandscape) {
        expect(await layout(page)).toBe('spread');
        expect(await textInGutter(page)).toEqual([]);
        const r = await page.locator('#search').boundingBox();
        // 右ページ（中心+10 〜 右本文の終端 E=W-R-16）の内側
        expect(r.x).toBeGreaterThanOrEqual(size.width / 2 + 10 - 0.5);
        expect(r.x + r.width).toBeLessThanOrEqual(size.width - 16 + 0.5);
        expect(r.y).toBeGreaterThanOrEqual(24);
        expect(r.y + r.height).toBeLessThanOrEqual(size.height - 24 + 0.5);
      }
      await page.getByRole('button', { name: '閉じる' }).first().click();
      await page.getByRole('button', { name: '設定' }).click();
      await page.getByRole('button', { name: 'バックアップ' }).click();
      await expect(page.locator('#backup')).toBeVisible();
      expect(await findTextOverlaps(page)).toEqual([]);
      if (size === SIZES.openLandscape) expect(await textInGutter(page)).toEqual([]);
      // 確認画面も
      await page.setInputFiles('#bk-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T09:41:00+09:00', events: [ev('z1', '別の予定', '2026-12-01T10:00', '2026-12-01T11:00'), SEED[0]] })) });
      await expect(page.locator('#bk-add')).toBeVisible();
      expect(await findTextOverlaps(page)).toEqual([]);
      if (size === SIZES.openLandscape) expect(await textInGutter(page)).toEqual([]);
    });
  }
  test('開いた横: ヘッダー・メニューもガターに文字なし', async ({ page }) => {
    await openApp(page, SIZES.openLandscape);
    await seed(page, SEED);
    expect(await textInGutter(page)).toEqual([]);
    await page.getByRole('button', { name: '設定' }).click();
    expect(await textInGutter(page)).toEqual([]);
  });
});

// ---- バックアップ ----
const openBackup = async (page) => {
  await page.getByRole('button', { name: '設定' }).click();
  await page.getByRole('button', { name: 'バックアップ' }).click();
  await expect(page.locator('#backup')).toBeVisible();
};
async function exportFile(page, path) {
  await openBackup(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
  await dl.saveAs(path);
  await expect(page.getByRole('status')).toHaveText('書き出しファイルを作成しました。');
  return dl;
}
const pick = (page, name, content) => page.setInputFiles('#bk-file', { name, mimeType: 'application/json', buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)) });
const RICH = [
  ...SEED,
  ev('r1', '特殊', '2026-11-18T10:00', '2026-11-18T11:00', {
    notes: '行1\n行2', place: '渋谷', recurrence: { freq: 'weekly', interval: 1, byDay: [3, 5], count: 8, until: null }, exdates: ['2026-11-20T10:00'],
    overrides: { '2026-11-25T10:00': { title: '変更回', categoryId: CAT_IDS.family, all: false, start: '2026-11-25T14:00', end: '2026-11-25T15:00', place: 'X', notes: 'n' } },
  }),
];

test.describe('バックアップ', () => {
  test('書き出し: ファイル名と JSON 形式、件数表示', async ({ page }, info) => {
    await openApp(page);
    await seed(page, RICH);
    await openBackup(page);
    await expect(page.locator('#bk-body')).toContainText('予定7件・うち繰り返し2件／設定も含めて保存');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]);
    expect(dl.suggestedFilename()).toBe('duo-calendar-backup-2026-11-12.json');
    const p = info.outputPath('out.json');
    await dl.saveAs(p);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    expect(j.app).toBe('duo-calendar');
    expect(j.version).toBe(5);
    expect(j.schema).toBe(5);
    expect(j.categories.length).toBeGreaterThanOrEqual(5);
    expect(j.exportedAt).toMatch(/^2026-11-12T09:41:00\+09:00$/);
    expect(j.events).toHaveLength(7);
    expect(j.settings).toEqual({ view: 'month', style: 'simple', desk: false, monthExpand: false, rokuyo: true, holidayRed: true, pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false }, weekStart: 1, tasks: { monthTasks: false }, notify: { enabled: true, showTitle: true, defaultTimed: null, defaultAllDay: null } });
    expect(j.memos).toBeUndefined(); expect(j.notes).toEqual([]); expect(j.folders).toEqual([]); // ノート有効: memos は出さない
    expect(j.tasks).toEqual([]);
  });

  test('往復: 書き出して別の DB へ置き換え読み込み → 同一内容', async ({ page }, info) => {
    await openApp(page, SIZES.closedPortrait, '?ns=src&nosw');
    await seed(page, RICH);
    const p = info.outputPath('rt.json');
    await exportFile(page, p);
    const src = await dbEvents(page);
    await openApp(page, SIZES.closedPortrait, '?ns=dst&nosw');
    await seed(page, [ev('other', '消える予定', '2026-12-24T10:00', '2026-12-24T11:00')]);
    await openBackup(page);
    await page.setInputFiles('#bk-file', p);
    await expect(page.locator('#bk-body')).toContainText('duo-calendar-backup'.slice(0, 0) + 'rt.json');
    await expect(page.locator('#bk-body')).toContainText('追加見込み');
    await expect(page.locator('#bk-body')).toContainText('ファイルの予定');
    await page.locator('#bk-replace').click();
    await expect(page.locator('#bk-body')).toContainText('今の予定1件を削除して、7件に置き換えますか？');
    await expect(page.locator('#bk-body')).toContainText('元に戻せません');
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('7件の予定と設定に置き換えました。');
    expect(await dbEvents(page)).toEqual(src);
  });

  test('追加: 重複はスキップし件数を通知。設定は保持', async ({ page }, info) => {
    await openApp(page);
    await seed(page, SEED);
    const p = info.outputPath('add.json');
    await exportFile(page, p);
    await page.locator('#bk-close').click();
    // 同一ファイルの追加は全件重複
    await openBackup(page);
    await page.setInputFiles('#bk-file', p);
    await expect(page.locator('#bk-body')).toContainText('現在の予定');
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toHaveText('0件を追加しました（重複6件を除外）。');
    expect(await dbEvents(page)).toHaveLength(6);
    // 新規1件＋既存（同一ID同一内容）＋ID違い同内容 → 1件だけ追加
    await openBackup(page);
    await pick(page, 'mix.json', { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [SEED[0], { ...SEED[1], id: 'dup-diff-id' }, ev('new1', '新規', '2026-12-01T10:00', '2026-12-01T11:00')], settings: { view: 'day', style: 'named', desk: false } });
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toHaveText('1件を追加しました（重複2件を除外）。');
    const list = await dbEvents(page);
    expect(list).toHaveLength(7);
    expect(list.some((e) => e.id === 'new1')).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).view)).toBe('month'); // 追加では設定を変えない
  });

  test('追加: 同じIDで内容が違う競合は現在の予定を残す', async ({ page }) => {
    await openApp(page);
    await seed(page, SEED);
    await openBackup(page);
    await pick(page, 'c.json', { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [{ ...SEED[0], title: '書き換え案' }] });
    await expect(page.locator('#bk-body')).toContainText('競合1件は現在の予定を残します');
    await page.locator('#bk-add').click();
    expect((await dbEvents(page)).find((e) => e.id === 's1').title).toBe('プロジェクト定例');
  });

  test('置き換え: 2段目でキャンセルすると変更なし。確定で設定も置換', async ({ page }) => {
    await openApp(page);
    await seed(page, SEED);
    const before = await dbEvents(page);
    const file = { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [ev('n1', 'ファイルの予定', '2026-12-01T10:00', '2026-12-01T11:00')], settings: { view: 'week', style: 'named', desk: false } };
    await openBackup(page);
    await pick(page, 'r.json', file);
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rcancel').click();
    await expect(page.locator('#bk-add')).toBeVisible();
    expect(await dbEvents(page)).toEqual(before);
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbEvents(page)).map((e) => e.id)).toEqual(['n1']);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).toMatchObject({ view: 'week', style: 'named' });
  });

  test('置き換えの途中失敗では元データが残る（単一トランザクション）', async ({ page }) => {
    await openApp(page);
    await seed(page, SEED);
    const before = await dbEvents(page);
    const failed = await page.evaluate(async () => {
      const db = await import('/js/db.js');
      try { await db.replaceAll([{ id: 'ok', title: 'a' }, { /* keyPath なし → DataError */ title: 'bad' }]); return false; } catch { return true; }
    });
    expect(failed).toBe(true);
    expect(await dbEvents(page)).toEqual(before);
  });

  const dbCats = (page) => page.evaluate(async () => (await import('/js/db.js')).listCategories());
  const LINK = { v: 2, state: 'linked', requestId: 'req-1', itemId: 'I1', externalId: 'X1', ekIdentifier: 'X1@2026-11-20T10:00', calendarId: 'C1', eventId: 'E1', syncedAt: 1763000000000, warn: null };

  test('v3 往復: 全項目（nativeLink・alarms・未知の項目）・カテゴリ・設定（monthExpand・notify）が別の DB で一致', async ({ page }, info) => {
    await openApp(page, SIZES.closedPortrait, '?ns=v3src&nosw');
    const rich = ev('full', '全項目', '2026-11-20T10:00', '2026-11-20T11:00', {
      categoryId: 'my-cat', alarms: [{ before: 30 }], nativeLink: LINK, strokes: { placeholder: true }, updatedAt: 1763000000123,
      recurrence: { freq: 'weekly', interval: 1, byDay: [5], count: null, until: '2027-01-31' }, exdates: ['2026-11-27T10:00'],
      overrides: { '2026-12-04T10:00': { title: '変更', categoryId: 'my-cat', all: false, start: '2026-12-04T12:00', end: '2026-12-04T13:00', place: '', notes: '', alarms: [{ before: 5 }] } },
    });
    await seed(page, [rich]);
    await page.evaluate(async () => {
      const db = await import('/js/db.js');
      await db.putCategory({ id: 'my-cat', name: '自作カテゴリ', color: '#5e4c8e', order: 9, hidden: true, createdAt: 1, updatedAt: 2 });
      localStorage.setItem('duo.ui.v1.v3src', JSON.stringify({ view: 'week', style: 'named', desk: true, monthExpand: true, home: true }));
      localStorage.setItem('duo-notify.v3src', JSON.stringify({ version: 1, enabled: true, showTitle: false, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '07:30' } }));
    });
    await page.reload();
    const p = info.outputPath('v3.json');
    await exportFile(page, p);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    expect(j.settings).toEqual({ view: 'week', style: 'named', desk: true, monthExpand: true, rokuyo: true, holidayRed: true, pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false }, weekStart: 1, tasks: { monthTasks: false }, notify: { enabled: true, showTitle: false, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '07:30' } } });
    expect(j.categories.find((c) => c.id === 'my-cat')).toMatchObject({ name: '自作カテゴリ', color: '#5e4c8e', hidden: true });
    const src = await dbEvents(page);
    expect(src[0].nativeLink).toEqual(LINK);
    await openApp(page, SIZES.closedPortrait, '?ns=v3dst&nosw');
    await openBackup(page);
    await page.setInputFiles('#bk-file', p);
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect(await dbEvents(page)).toEqual(src);
    expect((await dbCats(page)).find((c) => c.id === 'my-cat')).toMatchObject({ name: '自作カテゴリ', color: '#5e4c8e', hidden: true });
    const st = await page.evaluate(() => ({ ui: JSON.parse(localStorage.getItem('duo.ui.v1.v3dst')), notify: JSON.parse(localStorage.getItem('duo-notify.v3dst')) }));
    expect(st.ui).toMatchObject({ view: 'week', style: 'named', desk: true, monthExpand: true });
    expect(st.notify).toEqual({ version: 1, enabled: true, showTitle: false, defaultTimed: { before: 15 }, defaultAllDay: { day: 1, at: '07:30' } });
  });

  test('同じファイルを2回読み込んでも二重にならない（追加。連携あり）', async ({ page }, info) => {
    await openApp(page, SIZES.closedPortrait, '?ns=twice&nosw');
    await seed(page, [ev('L1', 'iPhone にも追加', '2026-11-20T10:00', '2026-11-20T11:00', { nativeLink: LINK, alarms: [{ before: 30 }] }), ...SEED]);
    const p = info.outputPath('twice.json');
    await exportFile(page, p);
    await page.locator('#bk-close').click();
    const before = await dbEvents(page);
    for (let i = 0; i < 2; i++) {
      await openBackup(page);
      await page.setInputFiles('#bk-file', p);
      await page.locator('#bk-add').click();
      await expect(page.getByRole('status')).toHaveText(`0件を追加しました（重複${before.length}件を除外）。`);
    }
    expect(await dbEvents(page)).toEqual(before);
    // id が変わった同じ iPhone の予定（requestId 一致）も重複扱い
    await openBackup(page);
    await pick(page, 'renamed.json', { app: 'duo-calendar', version: 3, exportedAt: '2026-11-13T00:00:00Z', categories: [], events: [{ ...before.find((e) => e.id === 'L1'), id: 'L1-other-id', title: '名前を変えた' }] });
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toHaveText('0件を追加しました（重複1件を除外）。');
    expect(await dbEvents(page)).toEqual(before);
  });

  test('v2 ファイルの読み込み: cat → カテゴリ id、旧ゴルフ・経済指標は「その他」へ（復活しない）、未知は未分類。既存データは消えない', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait, '?ns=v2in&nosw');
    await seed(page, [ev('keep', '残る予定', '2026-11-30T10:00', '2026-11-30T11:00')]);
    await page.evaluate(async () => { const db = await import('/js/db.js'); const cs = await db.listCategories(); for (const c of cs) if ([ 'd0c47a10-0000-4000-8000-000000000003', 'd0c47a10-0000-4000-8000-000000000004'].includes(c.id)) await db.applyCategoryChanges({ catDels: [c.id] }); });
    await openBackup(page);
    await page.setInputFiles('#bk-file', 'tests/fixtures/backup-v2.json');
    await expect(page.locator('#bk-body')).toContainText('カテゴリ：追加');
    await expect(page.locator('#bk-body')).toContainText('未分類へ1件');
    await page.locator('#bk-add').click();
    await expect(page.getByRole('status')).toHaveText('5件を追加しました（重複0件を除外）。');
    const list = await dbEvents(page);
    expect(list.map((e) => e.id).sort()).toEqual(['keep', 'v2-a', 'v2-b', 'v2-c', 'v2-d', 'v2-e']);
    const byId = Object.fromEntries(list.map((e) => [e.id, e]));
    expect(byId['v2-a'].categoryId).toBe(CAT_IDS.work);
    expect(byId['v2-b'].categoryId).toBe(CAT_IDS.other);
    expect(byId['v2-c'].categoryId).toBe(CAT_IDS.other);
    expect(byId['v2-d'].categoryId).toBe(CAT_IDS.none);
    expect(byId['v2-e'].overrides['2026-12-21T08:00'].categoryId).toBe(CAT_IDS.work);
    expect(list.some((e) => 'cat' in e)).toBe(false);
    const names = (await dbCats(page)).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['未分類']));
    expect(names).not.toContain('経済指標'); expect(names).not.toContain('ゴルフ');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1.v2in')).view)).toBe('month'); // 追加では設定を変えない
    // 置き換えなら設定も v2 のとおり
    await openBackup(page);
    await page.setInputFiles('#bk-file', 'tests/fixtures/backup-v2.json');
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbEvents(page)).map((e) => e.id).sort()).toEqual(['v2-a', 'v2-b', 'v2-c', 'v2-d', 'v2-e']);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1.v2in')))).toMatchObject({ view: 'week', style: 'named', monthExpand: false });
  });

  const BAD = [
    ['壊れた JSON', '{"app": "duo-calendar", "events": [', '壊れた'],
    ['形式違い', { hello: 'world' }, '未対応の形式'],
    ['別アプリ', { app: 'other', version: 2, events: [] }, '未対応の形式'],
    ['将来版', { app: 'duo-calendar', version: 6, exportedAt: '2026-11-13T00:00:00Z', events: [] }, '未対応のバージョン'],
    ['events が配列でない', { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: {} }, 'events'],
    ['不正な日時', { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [{ ...SEED[0], start: '2026-13-40T10:00' }] }, '不正な日時'],
    ['必須欠落', { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [{ id: 'x', start: '2026-11-12T10:00', end: '2026-11-12T11:00' }] }, '予定名'],
    ['2件目だけ不正でも一部取り込まない', { app: 'duo-calendar', version: 2, exportedAt: '2026-11-13T00:00:00Z', events: [ev('good', 'OK', '2026-12-01T10:00', '2026-12-01T11:00'), { ...SEED[1], categoryId: undefined, cat: undefined }] }, 'カテゴリ'],
  ];
  for (const [name, content, reason] of BAD) {
    test(`不正ファイル: ${name} → エラー表示のみで DB は変わらない`, async ({ page }) => {
      await openApp(page);
      await seed(page, SEED);
      const before = await dbEvents(page);
      await openBackup(page);
      await pick(page, 'bad<b>.json', content);
      await expect(page.locator('#bk-body [role=alert]')).toContainText('このファイルは読み込めません。DuoのバックアップJSONを選んでください。');
      await expect(page.locator('#bk-body')).toContainText(reason);
      await expect(page.locator('#bk-body b')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'ファイルを選び直す' })).toBeVisible();
      expect(await dbEvents(page)).toEqual(before);
    });
  }
});


// ---- メモ・表示設定のバックアップ（第14版 PR10） ----
const dbMemos = (page) => page.evaluate(async () => (await import('/js/db.js')).listMemos());
const putMemoDb = (page, d, t) => page.evaluate(async ([d, t]) => (await import('/js/db.js')).putMemo(d, t, 1700000000000), [d, t]);
const M = (date, text) => ({ id: date, date, text, createdAt: 1000, updatedAt: 2000 });
const V4 = (o) => ({ app: 'duo-calendar', version: 4, exportedAt: '2026-11-13T00:00:00Z', events: [], ...o });

const dbTasks = (page) => page.evaluate(async () => (await import('/js/db.js')).listTasks());
const TK = (id, o = {}) => ({ id, title: `t-${id}`, due: null, done: false, doneAt: null, createdAt: 1000, updatedAt: 2000, order: 1, note: '', notify: false, ...o });
const V5 = (o) => ({ ...V4({ version: 5 }), ...o });

test.describe('タスクのバックアップ（v5）', () => {
  test('書き出して別の DB へ置き換えると、完了・期限なし・通知付きのタスクが同一に戻る', async ({ page }, info) => {
    await openApp(page, SIZES.closedPortrait, '?ns=tsrc&nosw');
    const rows = [TK('a'), TK('b', { order: 2, due: { date: '2026-11-20', time: '10:07' }, notify: true }), TK('c', { order: 3, done: true, doneAt: '2026-11-17T09:00', due: { date: '2026-11-18' }, note: 'メモ' })];
    await page.evaluate(async (r) => { const d = await import('/js/db.js'); for (const t of r) await d.putTask(t); }, rows);
    const p = info.outputPath('t.json');
    await exportFile(page, p);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    expect(j.tasks).toEqual(rows);
    await openApp(page, SIZES.closedPortrait, '?ns=tdst&nosw');
    await page.evaluate(async () => (await import('/js/db.js')).putTask({ id: 'gone', title: '消える', due: null, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false }));
    await openBackup(page);
    await page.setInputFiles('#bk-file', p);
    await expect(page.locator('#bk-body')).toContainText('タスク');
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect(await dbTasks(page)).toEqual(rows);
    // 追加で再取込しても重複しない
    await openBackup(page);
    await page.setInputFiles('#bk-file', p);
    await page.locator('#bk-add').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbTasks(page)).length).toBe(3);
  });

  test('tasks 欠落の v5 は現在のタスクを残し、不正なタスクや 不正なノート・フォルダは全体拒否で DB 不変', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => (await import('/js/db.js')).putTask({ id: 'keep', title: '守る', due: null, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false }));
    for (const f of [V5({ tasks: [TK('ok'), { ...TK('bad'), title: '' }] }), V5({ notes: [{ id: '', body: 'x', createdAt: 1, updatedAt: 1 }] }), V5({ folders: [{ id: 'f', name: '', order: 0, createdAt: 1, updatedAt: 1 }] })]) {
      await openBackup(page);
      await pick(page, 'bad.json', f);
      await expect(page.locator('#backup')).toContainText('読み込めませんでした');
      await page.locator('#bk-back').click(); await page.keyboard.press('Escape');
    }
    expect((await dbTasks(page)).map((t) => t.id)).toEqual(['keep']);
    await openBackup(page);
    await pick(page, 'ok.json', V5({ events: [] }));
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbTasks(page)).map((t) => t.id)).toEqual(['keep']);
  });
});

test.describe('メモ・設定のバックアップ', () => {
  test('書き出しに保存前のノートと六曜・pages が入る（notes+folders+tasks。旧 memos は出ない）', async ({ page }, info) => {
    await openApp(page, SIZES.openLandscape);
    await page.evaluate(() => { const k = 'duo.ui.v1'; const u = JSON.parse(localStorage.getItem(k) || '{}'); u.rokuyo = false; u.pages = { left: 'memo', right: 'month', portraitBottom: 'task', portraitShown: true }; localStorage.setItem(k, JSON.stringify(u)); });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('[data-act="notenew"]').first().click();
    await page.locator('.ned-title').first().fill('保存前のノート'); // 1秒の自動保存より前に書き出す
    const p = info.outputPath('m.json');
    await exportFile(page, p);
    const j = JSON.parse(readFileSync(p, 'utf8'));
    expect(j.notes.map((n) => n.body)).toEqual(['保存前のノート']);
    expect(j.memos).toBeUndefined();
    expect(j.folders).toEqual([]);
    expect(j.settings.rokuyo).toBe(false);
    expect(j.settings.pages).toEqual({ left: 'memo', right: 'month', portraitBottom: 'task', portraitShown: true });
    expect(Object.keys(j).filter((k) => /task|reminder/i.test(k))).toEqual(['tasks']);
    expect(j.tasks).toEqual([]);
  });

  test('新形式のノート・フォルダ: 書き出して全部消したあと置き換えで同じに戻る（ピン・フォルダ・削除印）。旧 memos は変わらない', async ({ page }, info) => {
    await openApp(page);
    await putMemoDb(page, '2026-11-01', '旧メモ');
    await page.evaluate(async () => {
      const m = await import('/js/db.js');
      await m.applyImport({ folderPuts: [{ id: 'home', name: '家', order: 1, createdAt: 1, updatedAt: 1 }], notePuts: [
        { id: 'a', body: 'ピン留め\n本文', folderId: 'home', pinned: true, pinnedAt: 9, createdAt: 1, updatedAt: 5, deletedAt: null },
        { id: 'b', body: '削除済み', folderId: null, pinned: false, pinnedAt: null, createdAt: 2, updatedAt: 6, deletedAt: 77 }] });
    });
    const dump = () => page.evaluate(async () => { const m = await import('/js/db.js'); return { n: (await m.listNotes({ includeDeleted: true })).map((x) => [x.id, x.body, x.folderId, x.pinned, x.pinnedAt, x.deletedAt]), f: (await m.listFolders()).map((x) => [x.id, x.name]) }; });
    const before = await dump();
    const p = info.outputPath('n.json');
    await exportFile(page, p);
    await page.keyboard.press('Escape');
    expect(JSON.parse(readFileSync(p, 'utf8')).memos).toBeUndefined();
    await page.evaluate(async () => (await import('/js/db.js')).applyImport({ noteReplace: true, folderReplace: true }));
    expect((await dump()).n).toEqual([]);
    await openBackup(page);
    await pick(page, 'n.json', JSON.parse(readFileSync(p, 'utf8')));
    await expect(page.locator('#backup')).toContainText('ノート');
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect(await dump()).toEqual(before);
    expect((await dbMemos(page)).map((m) => m.text)).toEqual(['旧メモ']);
  });

  test('置き換え: 旧形式（v4）のメモはノートへ追加。旧 memos・今のノートは消えず、rokuyo・pages は復元される', async ({ page }) => {
    await openApp(page);
    await putMemoDb(page, '2026-11-01', '古いメモ');
    await openBackup(page);
    await pick(page, 'r.json', V4({ memos: [M('2026-12-05', '戻るメモ')], settings: { rokuyo: false, pages: { left: 'task', right: 'memo', portraitBottom: 'memo', portraitShown: true } } }));
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbMemos(page)).map((m) => [m.date, m.text])).toEqual([['2026-11-01', '古いメモ']]); // 画面から旧 memos へは書かない
    const notes = await page.evaluate(async () => (await import('/js/db.js')).listNotes({ includeDeleted: true }));
    expect(notes.map((n) => n.id)).toEqual(['memo-2026-12-05']);
    expect(notes[0].body).toContain('戻るメモ');
    const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')));
    expect(ui.rokuyo).toBe(false); expect(ui.pages).toEqual({ left: 'task', right: 'memo', portraitBottom: 'memo', portraitShown: true });
  });

  test('置き換え: memos 欠落（v3）も v4 の空配列も、既存のノートと旧 memos を消さない。設定欠落は現在値保持', async ({ page }) => {
    await openApp(page);
    await putMemoDb(page, '2026-11-01', '残る');
    await page.evaluate(async () => (await import('/js/db.js')).putNote({ id: 'mine', body: '自分', createdAt: 1, updatedAt: 2, folderId: null }));
    await openBackup(page);
    await pick(page, 'v3.json', { ...V4({}), version: 3, settings: { view: 'day' } });
    await page.locator('#bk-replace').click(); await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbMemos(page)).map((m) => m.text)).toEqual(['残る']);
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')))).rokuyo).toBe(true);
    await openBackup(page);
    await pick(page, 'v4e.json', V4({ memos: [] }));
    await page.locator('#bk-replace').click(); await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbMemos(page)).map((m) => m.text)).toEqual(['残る']);
    expect((await page.evaluate(async () => (await import('/js/db.js')).listNotes())).map((n) => n.id)).toEqual(['mine']);
  });

  test('古いメモの復元はノートへ追加専用（置換でも今のノートを消さない／2回目は増えない／確認画面に件数）', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => { const m = await import('/js/db.js'); await m.applyImport({ notePuts: [{ id: 'mine', body: '自分のノート', title: '', folderId: null, pinned: true, pinnedAt: 9, createdAt: 1, updatedAt: 2, deletedAt: null }] }); });
    const notes = () => page.evaluate(async () => (await import('/js/db.js')).listNotes({ includeDeleted: true }));
    await openBackup(page);
    await pick(page, 'n.json', V4({ memos: [M('2026-12-05', '戻るメモ'), M('2026-12-06', '二つ目')] }));
    await expect(page.locator('#backup')).toContainText('追加2件・同じ0件・別ノート0件');
    await page.locator('#bk-replace').click();
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#backup')).toBeHidden();
    let ns = await notes();
    expect(ns.map((n) => n.id).sort()).toEqual(['memo-2026-12-05', 'memo-2026-12-06', 'mine']);
    expect(ns.find((n) => n.id === 'mine').pinned).toBe(true);
    await openBackup(page);
    await pick(page, 'n.json', V4({ memos: [M('2026-12-05', '戻るメモ'), M('2026-12-06', '二つ目')] }));
    await expect(page.locator('#backup')).toContainText('追加0件・同じ2件・別ノート0件');
  });

  test('追加: 旧形式のメモは同日同文なら増えず、異文は別ノート。旧 memos は変わらない', async ({ page }) => {
    await openApp(page);
    await putMemoDb(page, '2026-11-01', 'A'); await putMemoDb(page, '2026-11-02', 'S');
    await page.evaluate(async () => (await import('/js/db.js')).migrateNotesOnce());
    await openBackup(page);
    await pick(page, 'a.json', V4({ memos: [M('2026-11-01', 'B'), M('2026-11-02', 'S'), M('2026-11-03', 'N')] }));
    await page.locator('#bk-add').click();
    await expect(page.locator('#backup')).toBeHidden();
    expect((await dbMemos(page)).map((m) => [m.date, m.text])).toEqual([['2026-11-01', 'A'], ['2026-11-02', 'S']]);
    const notes = await page.evaluate(async () => (await import('/js/db.js')).listNotes());
    const ids = notes.map((n) => n.id).sort();
    expect(ids.filter((x) => /^memo-2026-11-01-[0-9a-f]{8}$/.test(x))).toHaveLength(1); // 異文は別ノート
    expect(ids).toEqual(expect.arrayContaining(['memo-2026-11-01', 'memo-2026-11-02', 'memo-2026-11-03']));
    expect(notes).toHaveLength(4);
  });

  test('不正なメモ・v5 は読み込み全体を拒否し、何も変えない', async ({ page }) => {
    await openApp(page);
    await putMemoDb(page, '2026-11-01', '守る');
    for (const f of [V4({ memos: [M('2026-11-02', 'a'), M('2026-11-02', 'b')] }), V4({ memos: [{ ...M('2026-11-02', 'a'), id: 'x' }] }), V4({ memos: [M('2026-11-02', 'a'), { ...M('2026-11-03', 'b'), updatedAt: 'z' }] }), V4({ version: 6 }), V4({ version: 5, notes: [{ id: '' }] }), V4({ version: 5, tasks: [{ id: 'x' }] }), V4({ settings: { rokuyo: 'x' } })]) {
      await openBackup(page);
      await pick(page, 'bad.json', f);
      await expect(page.locator('#backup')).toContainText('読み込めませんでした');
      await page.locator('#bk-back').click(); await page.keyboard.press('Escape');
    }
    expect((await dbMemos(page)).map((m) => m.text)).toEqual(['守る']);
  });

  test('失敗時は予定もメモも変わらない（rollback）', async ({ page }) => {
    await openApp(page);
    await seed(page, SEED);
    await putMemoDb(page, '2026-11-01', '守る');
    const before = await dbEvents(page);
    await openBackup(page);
    await pick(page, 'f.json', V4({ events: [ev('n1', '新', '2026-12-01T10:00', '2026-12-01T11:00')], memos: [M('2026-12-05', '新メモ')] }));
    await page.locator('#bk-replace').click();
    await page.evaluate(() => { const o = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { if (this.name === 'notes') throw new Error('boom'); return o.apply(this, a); }; });
    await page.locator('#bk-rdo').click();
    await expect(page.locator('#bk-body')).toContainText('読み込みに失敗しました');
    expect(await dbEvents(page)).toEqual(before);
    expect((await dbMemos(page)).map((m) => m.text)).toEqual(['守る']);
    expect(await page.evaluate(async () => (await import('/js/db.js')).listNotes())).toEqual([]);
  });
});
