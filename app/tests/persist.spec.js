import { test, expect } from '@playwright/test';
import { SCHEMA_VERSION } from '../js/db.js';
import { openApp, loadSample, addEvent, pickDest, tab, layout, SIZES, catId, setStyle, modeStates, toggleDesk, fillDateTime, expectShown, reloadKeep } from './helpers.js';

test.describe('永続化', () => {
  test('再読込後も予定が残る（IndexedDB）', async ({ page }) => {
    await openApp(page);
    await addEvent(page, { title: '再読込テスト', cat: 'family' });
    await reloadKeep(page); // 閉じた画面は読み込み直すとカレンダーから始まる（design/34 §9.2）。ホームを開き直して見る
    await expect(page.locator('.next')).toContainText('再読込テスト');
    const meta = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('duo-calendar');
      r.onsuccess = () => res({ version: r.result.version, stores: [...r.result.objectStoreNames] });
    }));
    expect(meta.version).toBe(SCHEMA_VERSION);
    expect(meta.stores).toEqual(expect.arrayContaining(['tasks', 'notes', 'folders']));
    expect(meta.stores).toContain('events');
    expect(meta.stores).toContain('categories');
    expect(meta.stores).toContain("memos");
  });

  test('削除も再読込後に反映される', async ({ page }) => {
    await openApp(page);
    await loadSample(page);
    await page.locator('.next').click();
    await page.getByRole('button', { name: '予定を削除' }).click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('予定を削除しました。');
    await reloadKeep(page); // 閉じた画面は読み込み直すとカレンダーから始まる（design/34 §9.2）。ホームを開き直して見る
    await expect(page.locator('.next')).toContainText('ランチと散歩');
  });

  test('選択日・view・月表現・卓上がリサイズと再読込をまたいで残る', async ({ page }) => {
    await openApp(page, SIZES.openPortrait);
    await tab(page, '月').click();
    // 開いた縦では「手帳」が出ないため、卓上へ移ってから選ぶ（選択状態は姿勢をまたいで保持される）
    expect(await modeStates(page)).toEqual({ 予定名: true, 全部: false });
    await page.getByRole('button', { name: '次の月' }).click();
    await page.locator('[data-date="2026-12-10"]').click({ position: { x: 12, y: 10 } }); // 開いた縦は日表示へ進む
    await tab(page, '月').click();
    await toggleDesk(page);
    expect(await layout(page)).toBe('desk');
    await setStyle(page, '予定名');

    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('desk');
    await expect(page.locator('[data-date="2026-12-10"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await modeStates(page))['予定名']).toBe(true);

    await page.reload();
    await page.waitForSelector('html[data-ready]');
    expect(await layout(page)).toBe('desk');
    await expect(page.locator('[data-date="2026-12-10"]')).toHaveAttribute('aria-pressed', 'true');
    await toggleDesk(page); // 卓上表示をやめる
    await page.setViewportSize(SIZES.openPortrait); // 週は閉じた画面・開いた縦のタブ（開いた横は左右ページ）
    await expect.poll(() => layout(page)).toBe('open');

    await tab(page, '週').click();
    // 第19.2版 S11e（指示14・設計で確定）: 画面の記憶は閉じた画面と開いた画面とで別々（第19版 PR5 の「閉じた画面・開いた縦で共通」を置き換え）。
    // 閉じると閉じた画面の面（初めはカレンダー）。開いた縦の「週」は書き換えず、開くと週に戻る
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    await expectShown(page, '月');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1')).view)).toBe('week');
    await tab(page, '週').click(); // 閉じた画面で「…」→ 週の時間軸
    await expectShown(page, '週');
    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('spread');
    // 開いた横は左右ページが表示を決める（第14版 PR5）。閉じに戻すと、閉じた画面で見ていた週の時間軸のまま（この起動の間）
    await expect(page.locator('.pgsw')).toHaveCount(2);
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    await expectShown(page, '週');
    await page.locator('.cback').click(); // 閉じた画面をカレンダーへ戻しても、開いた縦は「週」のまま
    await expectShown(page, '月');
    await page.setViewportSize(SIZES.openPortrait);
    await expect.poll(() => layout(page)).toBe('open');
    await expectShown(page, '週');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expectShown(page, '週');
  });

  test('編集中ドラフトはリサイズと再読込でも残る', async ({ page }) => {
    await openApp(page, SIZES.closedPortrait);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await page.locator('#f-title').fill('下書きの予定');
    await pickDest(page, 'duo', catId('out'));
    await page.locator('#f-place').fill('オンライン');
    await fillDateTime(page, 'end', '2026/11/12 15:30');

    const check = async () => {
      await expect(page.locator('#editor')).toBeVisible();
      await expect(page.locator('#f-title')).toHaveValue('下書きの予定');
      await expect(page.locator('#dest-name')).toHaveText('外出');
      await expect(page.locator('#f-place')).toHaveValue('オンライン');
      await expect(page.locator('#f-end')).toHaveJSProperty('value', '2026/11/12');
      await expect(page.locator('#f-etime')).toContainText('15:30');
    };
    for (const size of [SIZES.openLandscape, SIZES.openPortrait, SIZES.closedLandscape, SIZES.closedPortrait]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(150);
      await check();
    }
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await check();
    // 閉じると下書きは破棄される
    await page.getByRole('button', { name: '閉じる' }).click();
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#editor')).toBeHidden();
  });

  // 日付メモ（v4）。別名の DB を旧版で作ってから、新しい db.js のインスタンスで開く。
  const migrate = (page, from) => page.evaluate(async (from) => {
    const name = `duo-calendar-mg${from}`;
    await new Promise((res, rej) => {
      const r = indexedDB.open(name, from);
      r.onupgradeneeded = () => {
        const db = r.result;
        const ev = db.createObjectStore('events', { keyPath: 'id' });
        ev.createIndex('start', 'start');
        db.createObjectStore('meta', { keyPath: 'key' });
        const base = { id: 'e1', title: '旧予定', start: '2026-11-12T09:00', end: '2026-11-12T10:00', all: false };
        ev.put(from >= 3 ? { ...base, categoryId: 'cat-work', notes: '', recurrence: null, exdates: [], overrides: {} } : { ...base, cat: 'work' });
        db.objectStoreNames.contains('meta') && r.transaction.objectStore('meta').put({ key: 'nativeOutbox', items: [{ k: 1 }] });
        if (from >= 3) {
          const c = db.createObjectStore('categories', { keyPath: 'id' });
          c.createIndex('order', 'order');
          c.put({ id: 'cat-work', name: '仕事', color: '#000', order: 0, hidden: false, createdAt: 1, updatedAt: 1 });
        }
      };
      r.onsuccess = () => { r.result.close(); res(); };
      r.onerror = () => rej(r.error);
    });
    const m = await import(`/js/db.js?mg${from}`);
    m.configure(`mg${from}`);
    const events = await m.listEvents();
    const outbox = await m.getOutbox();
    const cats = await m.listCategories();
    await m.putMemo('2026-11-12', '移行後のメモ');
    const db = await new Promise((res) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); });
    const info = { version: db.version, stores: [...db.objectStoreNames], idx: [...db.transaction('memos').objectStore('memos').indexNames] };
    db.close();
    return { events, outbox, cats, memo: await m.getMemo('2026-11-12'), info };
  }, from);

  for (const from of [1, 2, 3]) {
    test(`v${from} → v5 で既存データを保ち memos ができる`, async ({ page }) => {
      await openApp(page);
      const r = await migrate(page, from);
      expect(r.info.version).toBe(SCHEMA_VERSION);
      expect(r.info.stores).toEqual(expect.arrayContaining(['events', 'categories', 'meta', 'memos']));
      expect(r.info.idx).toEqual(['date']);
      expect(r.events.map((e) => e.title)).toEqual(['旧予定']);
      expect(r.outbox).toEqual([{ k: 1 }]);
      expect(r.cats.length).toBeGreaterThan(0);
      expect(r.memo.text).toBe('移行後のメモ');
    });
  }

  // 第16版 PR28: 実アプリの起動で、v4 のメモがノートへ（upgrade 内で1トランザクション）。2回目の起動で増えない。memos は不変。
  test('実起動: v4 のメモ3件が v5 upgrade でノートへ複製され、旧下書きも取り込み、2回起動しても増えない', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('v4seeded')) return;
      sessionStorage.setItem('v4seeded', '1');
      // 既に作ってある DB（v4）を壊さないよう、まだ無いときだけ v4 を作る（open が v5 を作る前に実行される）
      const req = indexedDB.open('duo-calendar', 4);
      req.onupgradeneeded = () => {
        const d = req.result;
        const e = d.createObjectStore('events', { keyPath: 'id' }); e.createIndex('start', 'start');
        d.createObjectStore('meta', { keyPath: 'key' });
        const c = d.createObjectStore('categories', { keyPath: 'id' }); c.createIndex('order', 'order');
        const m = d.createObjectStore('memos', { keyPath: 'id' }); m.createIndex('date', 'date');
        for (const [date, text] of [['2026-11-01', '十一月\n一日'], ['2026-11-02', '2026年11月2日（月）\n見出しあり'], ['2026-11-03', ' ']]) m.put({ id: date, date, text, createdAt: 10, updatedAt: 20, ink: null });
      };
      req.onsuccess = () => req.result.close();
      localStorage.setItem('duo.memo.draft.v1:2026-11-01', JSON.stringify({ date: '2026-11-01', text: '十一月\n下書きで続き', at: Date.now() }));
    });
    await openApp(page);
    const dump = () => page.evaluate(async () => { const m = await import('/js/db.js'); return { v: (await new Promise((r) => { const q = indexedDB.open('duo-calendar'); q.onsuccess = () => { const v = q.result.version; q.result.close(); r(v); }; })), notes: (await m.listNotes({ includeDeleted: true })).map((n) => [n.id, n.body, n.folderId]).sort(), folders: (await m.listFolders()).map((f) => f.id), memos: (await m.listMemos()).map((x) => [x.date, x.text, x.updatedAt]), mark: await m.readNotesMigration() }; });
    const a = await dump();
    expect(a.v).toBe(SCHEMA_VERSION);
    expect(a.mark.copied).toBe(2); expect(a.mark.blank).toBe(1); // 空白だけの1件は複製しない
    expect(a.notes.map((n) => n[0])).toEqual(['memo-2026-11-01', 'memo-2026-11-02']);
    expect(a.notes[0][1]).toContain('下書きで続き'); // 旧下書きは DB（更新20）より新しいので取り込まれる
    expect(a.notes[0][1].startsWith('2026年11月1日（日）\n')).toBe(true); // 見出しのない旧メモは年付き見出しを付ける
    expect(a.notes[1][1]).toBe('2026年11月2日（月）\n見出しあり'); // 同日見出しは足さない
    expect(a.folders).toEqual(['folder-daily-memos']);
    expect(a.memos).toEqual([['2026-11-01', '十一月\n一日', 20], ['2026-11-02', '2026年11月2日（月）\n見出しあり', 20], ['2026-11-03', ' ', 20]]); // 旧 memos は不変
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('duo.memo.draft')))).toEqual([]);
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const b = await dump();
    expect(b.notes).toEqual(a.notes); expect(b.folders).toEqual(a.folders); expect(b.memos).toEqual(a.memos);
  });

  test('メモ: 1日1件・端日・範囲・空白削除・降順・abort・再読込', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/db.js');
      const out = {};
      await m.putMemo('2026-01-01', 'a', 1000);
      await m.putMemo('2026-01-01', 'b', 2000);
      out.one = await m.getMemo('2026-01-01');
      await m.putMemo('2026-12-31', 'end');
      await m.putMemo('2026-02-28', 'mid');
      out.range = await m.memoDates('2026-01-01', '2026-12-31');
      out.edge = await m.memoDates('2026-01-02', '2026-12-30');
      out.inv = await m.memoDates('2026-12-31', '2026-01-01');
      out.list = (await m.listMemoDays()).map((x) => x.date);
      out.blank = await m.putMemo('2026-02-28', ' 　\n ');
      out.afterBlank = await m.getMemo('2026-02-28');
      await m.deleteMemo('2026-12-31');
      out.afterDel = await m.memoDates('2026-01-01', '2026-12-31');
      try { await m.putMemo('2026-02-30', 'x'); out.bad = 'ok'; } catch { out.bad = 'throw'; }
      out.badGet = await m.getMemo('2026-13-01');
      return out;
    });
    expect(r.one).toMatchObject({ id: '2026-01-01', date: '2026-01-01', text: 'b', createdAt: 1000, updatedAt: 2000, ink: null });
    expect(r.range).toEqual(['2026-01-01', '2026-02-28', '2026-12-31']);
    expect(r.edge).toEqual(['2026-02-28']);
    expect(r.inv).toEqual([]);
    expect(r.list).toEqual(['2026-12-31', '2026-02-28', '2026-01-01']);
    expect(r.blank).toBeNull();
    expect(r.afterBlank).toBeNull();
    expect(r.afterDel).toEqual(['2026-01-01']);
    expect(r.bad).toBe('throw');
    expect(r.badGet).toBeNull();
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    expect(await page.evaluate(async () => (await (await import('/js/db.js')).listMemoDays()).length)).toBe(1);
  });
  test('ノート変換規則（notes-model.js）がブラウザでも同じ結果になり、旧memosは変わらない', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const m = await import('/js/notes-model.js');
      const d = await import('/js/db.js?nm');
      d.configure('nm-spec');
      await d.putMemo('2026-11-15', '11月15日（日）\r\n本文', 1000);
      await d.putMemo('2026-11-14', '会議', 1000);
      const memos = await d.listMemos();
      const notes = memos.map((x) => m.noteFromMemo(x));
      return { notes: notes.map((n) => [n.id, n.title, n.sourceHeading, m.memoTextOf(n)]), texts: memos.map((x) => x.text), after: (await d.listMemos()).length };
    });
    expect(r.notes.map((n) => n[3])).toEqual(r.texts);
    expect(r.notes.map((n) => n[1]).sort()).toEqual(['2026年11月14日（土）', '2026年11月15日（日）']);
    expect(r.after).toBe(2);
  });
  test('ノートとフォルダのバックアップが本物の build/validate/applyImport で往復する', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const b = await import('/js/backup.js');
      const d = await import('/js/db.js?nb');
      d.configure('nb-spec');
      const notes = [{ id: 'a', body: '一つ目\n本文', folderId: 'f1', pinned: true, pinnedAt: 5, createdAt: 1, updatedAt: 2, deletedAt: null }, { id: 'b', body: 'ごみ箱', folderId: 'zz', createdAt: 1, updatedAt: 3, deletedAt: 9 }];
      const folders = [{ id: 'f1', name: '家', order: 0, createdAt: 1, updatedAt: 1 }];
      const text = JSON.stringify(b.buildBackup([], {}, new Date(), [], [], [], notes, folders));
      const v = b.validateBackup(text);
      const p = b.planNotes([], v.data.notes, [], v.data.folders, true);
      await d.applyImport({ replace: true, notePuts: p.notePuts, noteReplace: p.noteReplace, folderPuts: p.folderPuts, folderReplace: p.folderReplace });
      return { memos: 'memos' in JSON.parse(text), got: (await d.listNotes({ includeDeleted: true })).map((n) => [n.id, n.title, n.folderId, n.pinned, n.deletedAt]).sort(), folders: (await d.listFolders()).map((f) => f.name) };
    });
    expect(r.memos).toBe(false);
    expect(r.got).toEqual([['a', '一つ目', 'f1', true, null], ['b', 'ごみ箱', null, false, 9]]);
    expect(r.folders).toEqual(['家']);
  });
});
