import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

// 第16版 PR27: ノートの常設エディタ部品（通常の画面にはまだ接続しない）。部品を直接マウントして検査する。
// mode: 'real' | 'dbfail' | 'quota'
async function mount(page, { delay = 100, mode = 'real', recover = false } = {}) {
  await page.evaluate(async ({ delay, mode, recover }) => {
    const [{ createNoteStore }, { mountNoteEditor }, realDb] = await Promise.all([import('/js/notes.js'), import('/js/notes-ui.js'), import('/js/db.js')]);
    window.__dbFail = mode === 'dbfail';
    const db = { getNote: realDb.getNote, trashNote: realDb.trashNote, restoreNote: realDb.restoreNote, listTrashedNotes: realDb.listTrashedNotes,
      putNote: (n) => (window.__dbFail ? Promise.reject(new Error('x')) : realDb.putNote(n)) };
    const real = globalThis.localStorage;
    const storage = mode === 'quota'
      ? { get length() { return real.length; }, key: (i) => real.key(i), getItem: (k) => real.getItem(k), removeItem: (k) => real.removeItem(k), setItem() { throw new Error('QuotaExceededError'); } }
      : real;
    const store = createNoteStore({ db, storage, delay });
    const host = document.createElement('div'); host.id = 'nedhost'; host.style.cssText = 'position:fixed;inset:0 0 0 0;background:#fff;z-index:99999;overflow:auto';
    document.body.append(host);
    window.__store = store; window.__db = realDb;
    window.__ned = mountNoteEditor(host, { store });
    if (recover) window.__recovered = await store.recoverNoteDrafts();
  }, { delay, mode, recover });
}
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const drafts = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('duo.note.draft.v1:')));

test.describe('ノートの編集部品', () => {
  test.beforeEach(async ({ page }) => { await openApp(page, SIZES.openPortrait669); });

  test('保存ボタンなし。入力→自動保存→再読込で残り、保存後は下書きが消える。1行目が題名', async ({ page }) => {
    await mount(page);
    await expect(page.locator('.ned').getByRole('button', { name: /保存/ })).toHaveCount(0);
    const id = await page.evaluate(async () => { await window.__ned.create(); return window.__ned.id; });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getNote(page, id)).toBeNull(); // 空のうちは書かない
    await page.locator('.ned-title').fill('買い物');
    await page.locator('.ned-title').press('Enter');
    await expect(page.locator('.ned-body')).toBeFocused();
    await page.keyboard.type('牛乳\n卵');
    expect(await drafts(page)).toEqual([`duo.note.draft.v1:${id}`]);
    await expect.poll(async () => (await getNote(page, id))?.body).toBe('買い物\n牛乳\n卵');
    expect((await getNote(page, id)).title).toBe('買い物');
    await expect.poll(() => drafts(page)).toEqual([]);
    expect(await page.locator('.ned-title').evaluate((e) => getComputedStyle(e).fontSize)).toBe('20px');
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await mount(page);
    await page.evaluate((id) => window.__ned.open(id), id);
    await expect(page.locator('.ned-title')).toHaveValue('買い物');
    await expect(page.locator('.ned-body')).toHaveValue('牛乳\n卵');
  });

  test('保存前に終了しても、再開で最後の文字が戻る（古い下書きでDBを上書きしない）', async ({ page }) => {
    await putNote(page, { id: 'n1', body: '元\n本文', createdAt: 1, updatedAt: 2, folderId: null });
    await mount(page, { delay: 60000 });
    await page.evaluate(() => window.__ned.open('n1'));
    await page.locator('.ned-body').fill('本文を直した');
    await page.locator('.ned-body').press('End');
    await page.keyboard.type('！');
    expect((await getNote(page, 'n1')).body).toBe('元\n本文'); // まだ DB は古い
    await page.reload(); await page.waitForSelector('html[data-ready]');
    // 第16版 PR28: 下書きの回復は起動（boot）が行う。部品の再マウントでは回復済みで、DB は最後の文字を持つ。
    await mount(page, { recover: true });
    expect(await page.evaluate(() => window.__recovered)).toEqual([]);
    expect((await getNote(page, 'n1')).body).toBe('元\n本文を直した！');
    expect(await drafts(page)).toEqual([]);
  });

  test('ノートを切り替える前に flush され、戻ると最後の文字がある', async ({ page }) => {
    await putNote(page, { id: 'a', body: 'A', createdAt: 1, updatedAt: 2 });
    await putNote(page, { id: 'b', body: 'B', createdAt: 1, updatedAt: 3 });
    await mount(page, { delay: 60000 });
    await page.evaluate(() => window.__ned.open('a'));
    await page.locator('.ned-body').fill('一行目の次');
    await page.evaluate(() => window.__ned.open('b'));
    expect((await getNote(page, 'a')).body).toBe('A\n一行目の次');
    expect(await drafts(page)).toEqual([]);
    await expect(page.locator('.ned-title')).toHaveValue('B');
    await page.evaluate(() => window.__ned.open('a'));
    await expect(page.locator('.ned-body')).toHaveValue('一行目の次');
  });

  test('変換中に強制 pagehide / 非表示になっても入力済みの文字を書く', async ({ page }) => {
    await mount(page, { delay: 60000 });
    const id = await page.evaluate(async () => { await window.__ned.create(); return window.__ned.id; });
    await page.locator('.ned-title').evaluate((t) => { t.focus(); t.dispatchEvent(new CompositionEvent('compositionstart')); t.value = 'にほん'; });
    expect(await drafts(page)).toEqual([]); // 変換中は保存対象にしない
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(async () => (await getNote(page, id))?.body).toBe('にほん');
  });

  test('空の作成途中は離れると破棄、既存ノートは空にしても勝手に消えない', async ({ page }) => {
    await putNote(page, { id: 'k', body: '残す\n本文', createdAt: 1, updatedAt: 2 });
    await mount(page);
    await page.evaluate(async () => { await window.__ned.create(); await window.__ned.open('k'); });
    expect(await page.evaluate(async () => (await window.__db.listNotes()).map((n) => n.id))).toEqual(['k']);
    expect(await drafts(page)).toEqual([]);
    await expect(page.locator('.ned-body')).toHaveValue('本文');
    await page.evaluate(() => window.__ned.leave());
    expect((await getNote(page, 'k')).body).toBe('残す\n本文');
  });

  test('DB 保存の失敗は欄の近くに出て、下書きが残り、再試行で保存される', async ({ page }) => {
    await mount(page, { mode: 'dbfail', delay: 20 });
    const id = await page.evaluate(async () => { await window.__ned.create(); return window.__ned.id; });
    await page.locator('.ned-title').fill('失敗する');
    await expect(page.locator('.ned-status')).toContainText('ノートを保存できませんでした');
    expect(await drafts(page)).toEqual([`duo.note.draft.v1:${id}`]);
    expect(await getNote(page, id)).toBeNull();
    await page.evaluate(() => { window.__dbFail = false; });
    await page.locator('.ned-retry').click();
    await expect(page.locator('.ned-status')).toBeHidden();
    expect((await getNote(page, id)).body).toBe('失敗する');
    expect(await drafts(page)).toEqual([]);
  });

  test('端末の下書き領域が一杯でも DB には保存され、欄の近くに知らせる', async ({ page }) => {
    await mount(page, { mode: 'quota', delay: 60000 });
    const id = await page.evaluate(async () => { await window.__ned.create(); return window.__ned.id; });
    await page.locator('.ned-title').fill('容量');
    await expect(page.locator('.ned-status')).toContainText('下書きを端末に控えられません');
    await expect.poll(async () => (await getNote(page, id))?.body).toBe('容量');
  });

  test('削除は最近削除に入り、30日以内は元に戻せる（44pt の当たり）', async ({ page }) => {
    await putNote(page, { id: 't1', body: '消す\n本文', createdAt: 1, updatedAt: 2 });
    await mount(page);
    await page.evaluate(() => window.__ned.open('t1'));
    await page.getByRole('button', { name: '削除', exact: true }).click();
    await expect.poll(async () => (await getNote(page, 't1')).deletedAt).not.toBeNull();
    expect((await getNote(page, 't1')).body).toBe('消す\n本文');
    await page.getByRole('button', { name: '最近削除した項目' }).click();
    const row = page.locator('.ned-trashrow[data-id="t1"]');
    await expect(row).toContainText('消す');
    const b = await row.getByRole('button', { name: '元に戻す' }).boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    await row.getByRole('button', { name: '元に戻す' }).click();
    await expect(row).toHaveCount(0);
    expect((await getNote(page, 't1')).deletedAt).toBeNull();
  });

  test('題名と本文は1つの本文として保存され、CRLF と末尾の改行を保つ', async ({ page }) => {
    await putNote(page, { id: 'c', body: '題\r\n中身\r\n', createdAt: 1, updatedAt: 2 });
    await mount(page);
    await page.evaluate(() => window.__ned.open('c'));
    await expect(page.locator('.ned-title')).toHaveValue('題');
    await page.locator('.ned-title').fill('題名');
    await page.evaluate(() => window.__ned.flushNow());
    expect((await getNote(page, 'c')).body).toBe('題名\r\n中身\r\n');
  });
});
