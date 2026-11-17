import { test, expect } from '@playwright/test';
import { openApp, loadSample, addEvent, pickDest, tab, layout, SIZES, catId, setStyle, modeStates, toggleDesk, fillDateTime } from './helpers.js';

test.describe('永続化', () => {
  test('再読込後も予定が残る（IndexedDB）', async ({ page }) => {
    await openApp(page);
    await addEvent(page, { title: '再読込テスト', cat: 'family' });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.next')).toContainText('再読込テスト');
    const meta = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('duo-calendar');
      r.onsuccess = () => res({ version: r.result.version, stores: [...r.result.objectStoreNames] });
    }));
    expect(meta.version).toBe(5);
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
    await page.reload();
    await page.waitForSelector('html[data-ready]');
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
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize(SIZES.openLandscape);
    await expect.poll(() => layout(page)).toBe('spread');
    // 開いた横は左右ページが表示を決める（第14版 PR5）。閉じた画面・縦の「週」は保たれ、閉じに戻すと週のまま
    await expect(page.locator('.pgsw')).toHaveCount(2);
    await page.setViewportSize(SIZES.closedPortrait);
    await expect.poll(() => layout(page)).toBe('browse');
    await expect(tab(page, '週')).toHaveAttribute('aria-pressed', 'true');
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
      expect(r.info.version).toBe(5);
      expect(r.info.stores).toEqual(expect.arrayContaining(['events', 'categories', 'meta', 'memos']));
      expect(r.info.idx).toEqual(['date']);
      expect(r.events.map((e) => e.title)).toEqual(['旧予定']);
      expect(r.outbox).toEqual([{ k: 1 }]);
      expect(r.cats.length).toBeGreaterThan(0);
      expect(r.memo.text).toBe('移行後のメモ');
    });
  }

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
