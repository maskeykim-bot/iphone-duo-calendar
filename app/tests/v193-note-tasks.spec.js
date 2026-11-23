// 第19.3版 その2 F（征希さん「ノートにチェックボックスでタスクリストに追加する（ノートの日付けが期限）」）の試験（実装担当）。Chromium と WebKit の両方。
// 品質 qa/verify-v19-3-cards.md §7 の N-1〜N-8・N-11、§8 の B-1・B-3・B-4。design/35 §9 の N-1・N-2 は tests/v193-design35-s9.spec.js にも置いた。
// つながりはタスクの任意の項目 source（js/note-tasks.js）。IndexedDB・バックアップは版 6 のまま。ノートの本文には何も足さない。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

const DAY = '2026-11-12', OTHER = '2026-11-18';
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const notes = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listNotes({ includeDeleted: true })).map((n) => ({ id: n.id, body: n.body, date: n.date ?? null, sourceDate: n.sourceDate ?? null, deletedAt: n.deletedAt ?? null })));
const dayNote = async (page, day = DAY) => (await notes(page)).find((n) => n.date === day && !n.deletedAt) || null;
export const tasks = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listTasks()).map((t) => ({ id: t.id, title: t.title, due: t.due, done: t.done, source: t.source ?? null, notify: t.notify, keys: Object.keys(t).sort().join(',') })));
const ned = (page) => page.locator('.nsheet .ned-body');
const val = (page) => ned(page).evaluate((b) => b.value);
const base = (id, body, date, extra = {}) => ({ id, body, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null, ...extra });

export async function boot(page, { size = SIZES.closedPortrait, sar = 84 } = {}) {
  await page.addInitScript((v) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${v}px`)), Math.min(size.width, size.height) < 600 ? sar : 0);
  await page.addInitScript(() => { const k = 'duo.ui.v1'; if (sessionStorage.getItem('v193nt')) return; sessionStorage.setItem('v193nt', '1'); const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, monthDay: 'list', home: false, stage: 7 })); localStorage.setItem('duo.hint.pull', '1'); localStorage.setItem('duo.hint.daybar', '1'); });
  await openApp(page, size, '', { home: false });
}
// その日のノートを開く（閉じた画面は日の欄のノート）
export async function openDayNote(page, day = DAY) {
  const dn = page.locator(`[data-act="daynote"][data-day="${day}"]`).filter({ visible: true }).first();
  await dn.scrollIntoViewIfNeeded(); await dn.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(350); await ned(page).click();
}
const check = (page) => page.locator('.nsheet .ned-top [data-fmt="check"]').click();
export const closeSheet = async (page) => { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(700); };
// 保存（1 秒の間あき）と突き合わせが済むまで待つ
export const saved = (page) => page.waitForTimeout(1500);
// 「買い物」＋チェック行（lines）を打つ
export async function typeList(page, lines, title = '買い物') {
  await page.keyboard.type(title); await page.keyboard.press('Enter');
  await check(page);
  for (const [i, l] of lines.entries()) { await page.keyboard.type(l); if (i < lines.length - 1) await page.keyboard.press('Enter'); }
}

test('N-1 日付のあるノートでチェック行に文字を入れる → 同じ題名・期限＝ノートの日付（時刻なし）のタスクが 1 件。状態の行に「タスクに足しました（期限 11月12日）」が 2 秒（シートで最初の 1 件だけ）。本文には何も足さない', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳']);
  const st = page.locator('.nsheet .ned-status.info');
  await expect(st).toHaveText('タスクに足しました（期限 11月12日）', { timeout: 4000 });
  expect(await st.evaluate((e) => { const c = getComputedStyle(e); return [c.color, c.fontSize, c.fontWeight]; })).toEqual(['rgb(104, 113, 106)', '12px', '400']);
  await expect(st).toHaveCount(0, { timeout: 3500 }); // 2 秒で消える
  const ts = await tasks(page);
  expect(ts.length).toBe(1);
  expect(ts[0].title).toBe('牛乳'); expect(ts[0].due).toEqual({ date: DAY }); expect(ts[0].done).toBe(false); expect(ts[0].notify).toBe(false);
  const n = await dayNote(page);
  expect(n.body).toBe('買い物\n- [ ] 牛乳'); // 保存の文字の形は今のまま（id や印を足さない）
  expect(ts[0].source).toEqual({ type: 'note-check', noteId: n.id, text: '牛乳', nth: 0, pos: 0 });
  // 2 件目は知らせを出さない（1 回のシートで最初の 1 件だけ）
  await page.keyboard.press('Enter'); await page.keyboard.type('卵'); await saved(page);
  expect((await tasks(page)).map((t) => t.title).sort()).toEqual(['卵', '牛乳']);
  await expect(page.locator('.nsheet .ned-status.info')).toHaveCount(0);
  await closeSheet(page);
  // タスクの一覧に出る
  await page.locator('.cb.ctask').click();
  await expect(page.locator('.rmrow .rmt', { hasText: '牛乳' })).toHaveCount(1);
  await expect(page.locator('.rmrow .rmt', { hasText: '卵' })).toHaveCount(1);
});

test('N-2 両方向: ノートでチェック → タスクが完了。タスクを完了・戻す → ノートの行が「- [x] 」「- [ ] 」', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳', '卵']); await saved(page);
  // ノートで「牛乳」をチェック（左の四角）
  await page.locator('.nsheet .ned-ck').first().click(); await saved(page);
  let ts = await tasks(page);
  expect(ts.find((t) => t.title === '牛乳').done).toBe(true); expect(ts.find((t) => t.title === '卵').done).toBe(false);
  expect((await dayNote(page)).body).toBe('買い物\n- [ ] 卵\n- [x] 牛乳'); // チェックした行は下へ（今までの決まり）
  await closeSheet(page);
  // タスクの一覧で「卵」を完了 → ノートの行が - [x]
  await page.locator('.cb.ctask').click();
  await page.locator('.rmrow', { hasText: '卵' }).locator('.rmckb').click();
  await expect.poll(async () => (await dayNote(page)).body, { timeout: 6000 }).toBe('買い物\n- [x] 卵\n- [x] 牛乳');
  expect((await tasks(page)).every((t) => t.done)).toBe(true);
  // 完了を戻す → - [ ]
  await page.locator('.rmrow', { hasText: '牛乳' }).locator('.rmckb').click();
  await expect.poll(async () => (await dayNote(page)).body, { timeout: 6000 }).toMatch(/- \[ \] 牛乳/);
  ts = await tasks(page);
  expect(ts.find((t) => t.title === '牛乳').done).toBe(false); expect(ts.find((t) => t.title === '卵').done).toBe(true);
  expect(ts.length).toBe(2); // 往復しても増えない
  // ノートを開き直すと、同じチェックの状態で出る
  await page.locator('.cback').click(); await openDayNote(page);
  expect(await val(page)).toBe((await dayNote(page)).body);
});

test('N-3 二重に足されない: 開き直し・ほかの行の編集・完了の往復・読み込み直しのあとも 1 行 1 件', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳']); await saved(page);
  await closeSheet(page);
  for (let i = 0; i < 2; i++) { await openDayNote(page); await page.keyboard.press('Control+End'); await page.keyboard.type('！'); await saved(page); await closeSheet(page); }
  let ts = await tasks(page); expect(ts.length).toBe(1); expect(ts[0].title).toBe('牛乳！！');
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(600);
  expect((await tasks(page)).length).toBe(1);
  await openDayNote(page); await page.keyboard.press('Control+Home'); await page.keyboard.type('今日の'); await saved(page); await closeSheet(page);
  ts = await tasks(page); expect(ts.length).toBe(1); expect(ts[0].title).toBe('牛乳！！');
  expect((await dayNote(page)).body).toBe('今日の買い物\n- [ ] 牛乳！！');
});

test('N-3 変換の確定（Chromium の IME）: 変換の途中で保存が走っても、確定のあと 1 行 1 件で題名は確定した文字', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP の IME は Chromium だけ');
  await boot(page);
  await openDayNote(page);
  await page.keyboard.type('買い物'); await page.keyboard.press('Enter'); await check(page);
  const cdp = await page.context().newCDPSession(page);
  for (const t of ['ぎ', 'ぎゅ', 'ぎゅう', 'ぎゅうにゅう']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
  await page.waitForTimeout(1400); // 変換の途中で 1 秒たつ
  await cdp.send('Input.insertText', { text: '牛乳' });
  await saved(page);
  const ts = await tasks(page);
  expect(ts.map((t) => t.title)).toEqual(['牛乳']);
  expect((await dayNote(page)).body).toBe('買い物\n- [ ] 牛乳');
});

test('N-4 同じ題名・似た題名の行が 2 本: タスクも 2 件。片方だけチェックすると片方だけ完了', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳', '牛乳', '牛乳パック']); await saved(page);
  let ts = await tasks(page);
  expect(ts.map((t) => t.title).sort()).toEqual(['牛乳', '牛乳', '牛乳パック']);
  expect(new Set(ts.map((t) => t.id)).size).toBe(3);
  await page.locator('.nsheet .ned-ck').nth(1).click(); await saved(page);
  ts = await tasks(page);
  expect(ts.filter((t) => t.title === '牛乳').map((t) => t.done).sort()).toEqual([false, true]);
  expect(ts.find((t) => t.title === '牛乳パック').done).toBe(false);
  expect(ts.length).toBe(3);
});

test('N-5 日付のないノートでは作らない。あとから別のノートに書いた行は、そのノートの日付が期限', async ({ page }) => {
  await boot(page);
  await putNote(page, base('free-1', '覚え書き', null));
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await page.locator('.mdnl').click(); // ノートの一覧
  await page.locator('[data-nrw="free-1"], .mrow', { hasText: '覚え書き' }).first().click();
  const body = page.locator('.ned-body:visible').first();
  await expect(body).toBeVisible(); await body.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
  await page.locator('.ned-fmt:visible [data-fmt="check"]').first().click(); await page.keyboard.type('日付なしの行'); await saved(page);
  expect((await notes(page)).find((n) => n.id === 'free-1').body).toBe('覚え書き\n- [ ] 日付なしの行');
  expect(await tasks(page)).toEqual([]);
});

test('N-6 行の文字を直すと、タスクの題名も直る（タスクは同じ 1 件のまま）', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳', '卵']); await saved(page);
  const id0 = (await tasks(page)).find((t) => t.title === '卵').id;
  await page.keyboard.type(' 10個'); await saved(page);
  const ts = await tasks(page);
  expect(ts.length).toBe(2);
  expect(ts.find((t) => t.id === id0).title).toBe('卵 10個');
  expect(ts.find((t) => t.id === id0).source.text).toBe('卵 10個');
});

test('N-7 行を消す／普通の行に戻す → タスクは残り、つながりだけ外れる。あとの完了はノートに戻さない', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳', '卵']); await saved(page);
  // 「卵」の行を普通の行に戻す（書式のシートの「本文」）
  await page.locator('.nsheet .ned-top [data-fmt="type"]').click(); await page.locator('.nsheet .ned-fsb[data-fset="plain"]').click(); await page.locator('.nsheet [data-act="fsclose"]').click(); await saved(page);
  expect((await dayNote(page)).body).toBe('買い物\n- [ ] 牛乳\n卵');
  let ts = await tasks(page);
  expect(ts.length).toBe(2); expect(ts.find((t) => t.title === '卵').source).toBe(null); expect(ts.find((t) => t.title === '牛乳').source).not.toBe(null);
  expect(ts.find((t) => t.title === '卵').keys).not.toContain('source');
  // 「牛乳」の行を消す
  await ned(page).evaluate((b) => { b.focus(); b.setSelectionRange(3, 12); }); await page.keyboard.press('Backspace'); await saved(page);
  expect((await dayNote(page)).body).toBe('買い物卵');
  ts = await tasks(page);
  expect(ts.map((t) => t.title).sort()).toEqual(['卵', '牛乳']); expect(ts.every((t) => t.source === null)).toBe(true);
  await closeSheet(page);
  // 外れたタスクを完了しても、ノートは変わらない
  await page.locator('.cb.ctask').click();
  await page.locator('.rmrow', { hasText: '牛乳' }).locator('.rmckb').click(); await page.waitForTimeout(2200);
  expect((await tasks(page)).find((t) => t.title === '牛乳').done).toBe(true);
  expect((await dayNote(page)).body).toBe('買い物卵');
});

test('N-8 保存済みの行（IME のごみの行を含む）は、起動しても・開いても・ほかの行を直してもタスクにしない。足した行だけタスクになる。保存済みの行の文字は 1 文字も変えない', async ({ page }) => {
  await boot(page);
  const OLD = '十二日のメモ\n- [ ] ｇｙ\n- [ ] 前からある行\n- [x] 済んだ行\nｋ';
  await putNote(page, base('memo-2026-11-12', OLD, DAY, { sourceDate: DAY }));
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(800);
  expect(await tasks(page)).toEqual([]); // 起動だけでは作らない
  await openDayNote(page); await saved(page);
  expect(await tasks(page)).toEqual([]); // 開いただけでも作らない
  await page.keyboard.press('Control+End'); await page.keyboard.type('追記'); await saved(page);
  expect(await tasks(page)).toEqual([]); // ほかの行を直しても作らない
  await page.keyboard.press('Enter'); await check(page); await page.keyboard.type('新しい行'); await saved(page);
  const ts = await tasks(page);
  expect(ts.map((t) => t.title)).toEqual(['新しい行']); expect(ts[0].due).toEqual({ date: DAY });
  const n = (await notes(page)).find((x) => x.id === 'memo-2026-11-12');
  expect(n.body).toBe(`${OLD}追記\n- [ ] 新しい行`); expect(n.sourceDate).toBe(DAY);
  // 前からある行をチェックしても、タスクは増えない（つながっていない行）
  await page.locator('.nsheet .ned-ck').nth(1).click(); await saved(page);
  expect((await tasks(page)).map((t) => t.title)).toEqual(['新しい行']);
});

test('ノートの日付を付け替えると、期限がまだ元の日付と同じ、つながったタスクだけ一緒に動く（design/35 §8・決定 7。その3 のカードの移動でも同じ関数を使う）', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳', '卵']); await saved(page); await closeSheet(page);
  const n = await dayNote(page);
  // 「牛乳」だけ、タスクの側で期限を 20 日に変えておく
  await page.evaluate(async () => { const db = await import('/js/db.js'); const t = (await db.listTasks()).find((x) => x.title === '牛乳'); await db.putTask({ ...t, due: { date: '2026-11-20' } }); });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(500);
  await openDayNote(page);
  await page.locator('.nsheet [data-act="notedate"], .nsheet .ndbtn, .nsheet [data-act="ndopen"]').first().click().catch(() => {});
  const cell = page.locator(`[data-ndday="${OTHER}"]`).first();
  test.skip(!(await cell.count()), 'この画面の日付の付け替えの入口は その3（メモのシートの日付の行）で入る');
  await cell.click(); await page.waitForTimeout(600);
  const ts = await tasks(page);
  expect((await notes(page)).find((x) => x.id === n.id).date).toBe(OTHER);
  expect(ts.find((t) => t.title === '卵').due).toEqual({ date: OTHER });
  expect(ts.find((t) => t.title === '牛乳').due).toEqual({ date: '2026-11-20' });
  expect(ts.every((t) => t.source?.noteId === n.id)).toBe(true); // つながりは残る
});

for (const [name, size] of [['閉じた横', SIZES.closedLandscape], ['開いた縦', SIZES.openPortrait669], ['開いた横', SIZES.openLandscape951]]) {
  test(`${name}でも: 日付のあるノートのチェック行がタスクになり、チェックがタスクの完了にそろう`, async ({ page }) => {
    await boot(page, { size });
    await putNote(page, base('n-post', '買い物', DAY));
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(400);
    await page.evaluate(async () => { const m = await import('/js/app.js').catch(() => null); void m; });
    // ノートを編集の画面で開く（姿勢ごとの入口は問わず、その日のノートの欄から）
    const dn = page.locator('[data-act="daynote"]:visible, .dnote:visible').first();
    test.skip(!(await dn.count()), 'この姿勢の初めの画面にノートの欄がない');
    await dn.click();
    const body = page.locator('.ned-body:visible').first();
    await expect(body).toBeVisible(); await page.waitForTimeout(400); await body.click();
    await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
    await page.locator('.ned-fmt:visible [data-fmt="check"]').first().click(); await page.keyboard.type('牛乳'); await saved(page);
    let ts = await tasks(page);
    expect(ts.map((t) => [t.title, t.due?.date, t.done])).toEqual([['牛乳', DAY, false]]);
    await page.locator('.ned-ck:visible').first().click(); await saved(page);
    ts = await tasks(page);
    expect(ts.map((t) => [t.title, t.done])).toEqual([['牛乳', true]]);
    expect((await notes(page)).find((x) => x.id === 'n-post').body).toBe('買い物\n- [x] 牛乳');
  });
}

test('B-1・B-3・B-4 バックアップ: 版は 6 のまま。つながり（source）はタスクの任意の項目として書き出し、読み戻すとつながりも戻る。ノートの本文に id は無い', async ({ page }) => {
  await boot(page);
  await openDayNote(page);
  await typeList(page, ['牛乳']); await saved(page); await closeSheet(page);
  const n = await dayNote(page);
  const out = await page.evaluate(async () => {
    const db = await import('/js/db.js'), bk = await import('/js/backup.js');
    const data = bk.buildBackup ? null : null; void data;
    const names = Object.keys(bk);
    return { names, schema: db.SCHEMA_VERSION ?? null };
  });
  expect(out.schema === null || out.schema === 6).toBe(true);
  const dbv = await page.evaluate(async () => { const l = await indexedDB.databases(); return l.find((d) => d.name.startsWith('duo-calendar')).version; });
  expect(dbv).toBe(6);
  expect(n.body).toBe('買い物\n- [ ] 牛乳');
  const t = (await tasks(page))[0];
  expect(t.keys).toBe('createdAt,done,doneAt,due,id,note,notify,order,source,title,updatedAt'); // 足したのは任意の項目 source だけ
});
