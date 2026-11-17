import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

// 第16版 PR30: ノートのチェック欄と書式操作（部品を直接マウントして検査）。
async function mount(page) {
  await page.evaluate(async () => {
    const [{ createNoteStore }, { mountNoteEditor }, realDb] = await Promise.all([import('/js/notes.js'), import('/js/notes-ui.js'), import('/js/db.js')]);
    const db = { getNote: realDb.getNote, trashNote: realDb.trashNote, restoreNote: realDb.restoreNote, listTrashedNotes: realDb.listTrashedNotes, putNote: realDb.putNote };
    const store = createNoteStore({ db, storage: localStorage, delay: 50 });
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;overflow:auto';
    document.body.append(host);
    window.__ned = mountNoteEditor(host, { store });
  });
}
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const body = (page) => page.locator('.ned-body');

test.describe('ノートのチェック欄と書式', () => {
  test.beforeEach(async ({ page }) => { await openApp(page, SIZES.openPortrait669); await mount(page); });

  test('開いただけでは本文を変換・保存しない。書式ボタンで明示した行だけ変わる', async ({ page }) => {
    await putNote(page, { id: 'n1', body: '題\r\n牛乳\r\n卵\r\n\r\n- 既存', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('n1'));
    await page.waitForTimeout(300);
    expect((await getNote(page, 'n1')).updatedAt).toBe(5);
    await expect(page.locator('.ned-chk')).toHaveCount(0);
    await body(page).click(); await body(page).evaluate((e) => e.setSelectionRange(0, 0));
    await page.getByRole('button', { name: 'チェック欄', exact: true }).click();
    await expect.poll(async () => (await getNote(page, 'n1')).body).toBe('題\r\n- [ ] 牛乳\r\n卵\r\n\r\n- 既存');
  });

  test('Return で次の項目、空項目の Return で通常行へ。Return は1回だけ', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('買い物'); await page.locator('.ned-title').press('Enter');
    await page.getByRole('button', { name: 'チェック欄', exact: true }).click();
    await page.keyboard.type('牛乳'); await page.keyboard.press('Enter');
    await page.keyboard.type('卵'); await page.keyboard.press('Enter');
    await expect(body(page)).toHaveValue('- [ ] 牛乳\n- [ ] 卵\n- [ ] ');
    await page.keyboard.press('Enter');
    await expect(body(page)).toHaveValue('- [ ] 牛乳\n- [ ] 卵\n');
    await page.keyboard.type('おわり');
    await expect(body(page)).toHaveValue('- [ ] 牛乳\n- [ ] 卵\nおわり');
  });

  test('日本語変換中の Return は項目を増やさない', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('t'); await page.locator('.ned-title').press('Enter');
    await body(page).fill('- [ ] ');
    await body(page).evaluate((e) => { e.focus(); e.setSelectionRange(e.value.length, e.value.length); e.dispatchEvent(new CompositionEvent('compositionstart')); e.value += 'かんじ'; e.dispatchEvent(new InputEvent('input', { isComposing: true })); });
    await body(page).evaluate((e) => e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })));
    await expect(body(page)).toHaveValue('- [ ] かんじ');
    await body(page).evaluate((e) => { e.value = '- [ ] 漢字'; e.dispatchEvent(new CompositionEvent('compositionend')); });
    await expect(body(page)).toHaveValue('- [ ] 漢字');
  });

  test('チェック欄: 22pt の四角・44pt の当たり、押すと済みがブロック末尾へ、取り消しで戻る', async ({ page }) => {
    await putNote(page, { id: 'n2', body: '題\n- [ ] a\n- [ ] b\n- [ ] c\n中間\n- [ ] x', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('n2'));
    const chk = page.locator('.ned-chk');
    await expect(chk).toHaveCount(4);
    await expect.poll(async () => { const b = await chk.first().boundingBox(); return b && Math.min(b.width, b.height); }).toBeGreaterThanOrEqual(44);
    const box = await page.locator('.ned-box').first().boundingBox();
    expect(Math.round(box.width)).toBe(22);
    await chk.nth(0).click();
    await expect(body(page)).toHaveValue('- [ ] b\n- [ ] c\n- [x] a\n中間\n- [ ] x');
    await expect(chk.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await getNote(page, 'n2')).body).toBe('題\n- [ ] b\n- [ ] c\n- [x] a\n中間\n- [ ] x');
    await page.getByRole('button', { name: '書式操作を元に戻す' }).click();
    await expect(body(page)).toHaveValue('- [ ] a\n- [ ] b\n- [ ] c\n中間\n- [ ] x');
    await chk.nth(0).click(); // a を済みにして末尾へ。次に外すと未了の後ろへ戻る
    await expect(body(page)).toHaveValue('- [ ] b\n- [ ] c\n- [x] a\n中間\n- [ ] x');
    await chk.nth(2).click();
    await expect(body(page)).toHaveValue('- [ ] b\n- [ ] c\n- [ ] a\n中間\n- [ ] x');
  });

  test('題名は本文1行目と同期し、保存して再読込しても同じ形で戻る。HTML 文字は文字のまま', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    const id = await page.evaluate(() => window.__ned.id);
    await page.locator('.ned-title').fill('<b>題</b>'); await page.locator('.ned-title').press('Enter');
    await page.getByRole('button', { name: 'チェック欄', exact: true }).click();
    await page.keyboard.type('<img src=x onerror=alert(1)>');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: '見出し' }).click();
    await page.keyboard.type('H');
    await expect.poll(async () => (await getNote(page, id))?.body).toBe('<b>題</b>\n- [ ] <img src=x onerror=alert(1)>\n# H');
    expect((await getNote(page, id)).title).toBe('<b>題</b>');
    await page.locator('.ned-chk').first().click();
    await expect.poll(async () => (await getNote(page, id)).body).toBe('<b>題</b>\n- [x] <img src=x onerror=alert(1)>\n# H');
    await page.reload(); await page.waitForSelector('html[data-ready]'); await mount(page);
    await page.evaluate((id) => window.__ned.open(id), id);
    await expect(body(page)).toHaveValue('- [x] <img src=x onerror=alert(1)>\n# H');
    await expect(page.locator('.ned-chk')).toHaveCount(1);
    expect(await page.locator('.ned img, .ned b').count()).toBe(0);
  });
});
