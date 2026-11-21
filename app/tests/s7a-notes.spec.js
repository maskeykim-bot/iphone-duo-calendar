// 第19.1版 S7a（レビュー後の直し）: ノートの記号（企画 R-27・品質 高-1/高-2・設計 V-21）と、ノート・タスクまわりの寸法。
// 題名欄・一覧・ホームのカード・検索・ピン留めのどこにも「# 」「- 」「- [ ] 」を出さない。保存の文字は変えない（IndexedDB の生の文字で確かめる）。
// 寸法: V-18（題名欄 44）・V-19（開いた横の右ページ x500）・V-20（フォルダの行 28/14/13・札3つ）・V-15/中-3（閉じた月のチェック欄）・V-24（タスクの日付の見出し）・中-2（✓の押した見た目）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, pagePick, tab, clickSearch, openNoteList } from './helpers.js';
import { spy, seedTasks, T } from './task-helpers.js';

const BODY_A = '# 来期の予定\n本文の行\n- 牛乳\n- [ ] 予約\n- [x] 済んだ件';
const BODY_B = '- [ ] 買い物リスト\n牛乳と卵';
const BODY_C = '## 今週のメモ\nふつうの行';
const BODY_D = '# 今日のメモ\n- 箇条書き\n- [ ] 確認'; // 日付つき（日のカード・ホームのカード用）
const NOTES = [
  { id: 'a', body: BODY_A, createdAt: 1, updatedAt: 50, folderId: null },
  { id: 'b', body: BODY_B, createdAt: 1, updatedAt: 40, folderId: null, pinned: true, pinnedAt: 5 },
  { id: 'c', body: BODY_C, createdAt: 1, updatedAt: 30, folderId: null },
  { id: 'd', body: BODY_D, createdAt: 1, updatedAt: 60, folderId: null, date: '2026-11-12' },
];
const POSTURES = [
  ['閉じた 466×678（帯84）', SIZES.closedPortrait, 84, 'closed'],
  ['開いた縦 669×951', SIZES.openPortrait669, 0, 'port'],
  ['開いた横 951×669（帯84）', SIZES.openLandscape951, 84, 'land'],
];
const MARKS = /(^|\n|\s)(#{1,6} |- \[[ xX]\]|- )/;
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const rawNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);

async function seedNotes(page) {
  await page.evaluate(async (notes) => { const db = await import('/js/db.js'); for (const n of notes) await db.putNote(n); }, NOTES);
  await page.reload(); await page.waitForSelector('html[data-ready]');
}
// その姿勢でノートの一覧まで出す
async function toNotes(page, kind, sar) {
  if (sar) await page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), sar);
  if (kind === 'closed') await openNoteList(page);
  else if (kind === 'port') await page.locator('[data-fmode="note"]').click();
  else await pagePick(page, 'right', 'ノート').click();
  await page.locator('.mrow[data-nrow]').first().waitFor();
}
async function setup(page, kind, size, sar) {
  if (kind === 'land') await page.addInitScript(() => { const k = 'duo.ui.v1'; localStorage.setItem(k, JSON.stringify({ pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } })); });
  await openApp(page, size);
  await seedNotes(page);
  await toNotes(page, kind, sar);
}
const openNote = async (page, id) => { await page.locator(`.mrow[data-nrow="${id}"], .nupb[data-nrow="${id}"]`).first().click(); await page.locator('.ned-title:visible').first().waitFor(); await page.waitForTimeout(250); };

for (const [name, size, sar, kind] of POSTURES) {
  test.describe(`S7a ノートの記号 ${name}`, () => {
    test.beforeEach(async ({ page }) => { await setup(page, kind, size, sar); });

    test('一覧・ピン留めの題名と2行目に記号が出ない（本文の文字は変わらない）', async ({ page }) => {
      const texts = await page.locator('.mrow[data-nrow]').evaluateAll((e) => e.map((x) => x.innerText));
      expect(texts.length).toBeGreaterThanOrEqual(3);
      for (const t of texts) expect(t, t).not.toMatch(MARKS);
      await expect(page.locator('.mrow[data-nrow="a"] b')).toHaveText('来期の予定');
      await expect(page.locator('.mrow[data-nrow="b"] b')).toContainText('買い物リスト'); // ピン留め（題名「- [ ] 」を外す）
      await expect(page.locator('.mrow[data-nrow="c"] b')).toHaveText('今週のメモ');
      expect((await rawNote(page, 'a')).body).toBe(BODY_A);
      expect((await rawNote(page, 'b')).body).toBe(BODY_B);
    });

    test('編集画面の題名欄に記号が出ない。開いただけでは保存しない。題名を直しても元の記号を保つ', async ({ page }) => {
      await openNote(page, 'a');
      const title = page.locator('.ned-title:visible').first();
      await expect(title).toHaveValue('来期の予定');
      const raw0 = await rawNote(page, 'a');
      expect(raw0.body).toBe(BODY_A); expect(raw0.updatedAt).toBe(50); // 開いただけで書き換えない
      await title.click(); await page.keyboard.press('End'); await page.keyboard.type('です');
      await expect.poll(async () => (await rawNote(page, 'a')).body, { timeout: 4000 }).toBe('# 来期の予定です\n本文の行\n- 牛乳\n- [ ] 予約\n- [x] 済んだ件');
      await expect(title).toHaveValue('来期の予定です');
      // 題名を全部消す → 記号も残さない（S8 連携 L-1・STEER 04:06。一覧の題名は「新規ノート」）。書き直すと元の記号が戻る
      await title.fill('');
      await expect.poll(async () => (await rawNote(page, 'a')).body, { timeout: 4000 }).toBe('\n本文の行\n- 牛乳\n- [ ] 予約\n- [x] 済んだ件');
      await title.fill('新題');
      await expect.poll(async () => (await rawNote(page, 'a')).body, { timeout: 4000 }).toBe('# 新題\n本文の行\n- 牛乳\n- [ ] 予約\n- [x] 済んだ件');
    });

    test('「- [ ] 」「## 」で始まる題名も欄には出さず、保存では元のまま', async ({ page }) => {
      await openNote(page, 'b');
      const title = page.locator('.ned-title:visible').first();
      await expect(title).toHaveValue('買い物リスト');
      await title.click(); await page.keyboard.press('End'); await page.keyboard.type('（月）');
      await expect.poll(async () => (await rawNote(page, 'b')).body, { timeout: 4000 }).toBe('- [ ] 買い物リスト（月）\n牛乳と卵');
      await page.locator('[data-act="noteback"]').click();
      await openNote(page, 'c');
      await expect(page.locator('.ned-title:visible').first()).toHaveValue('今週のメモ');
      expect((await rawNote(page, 'c')).body).toBe(BODY_C);
    });
  });
}

test.describe('S7a 検索（記号あり・なしの両方で当たる。抜き出しに記号を出さない）', () => {
  for (const [name, size, sar, kind] of POSTURES) {
    test(`${name}`, async ({ page }) => {
      await setup(page, kind, size, sar);
      await clickSearch(page);
      const q = page.locator('#sr-q');
      const hits = async (text) => { await q.fill(text); await page.waitForTimeout(400); return page.locator('.mhit:not(.thit)').evaluateAll((e) => e.map((x) => ({ id: x.dataset.mhit, text: x.innerText, marks: [...x.querySelectorAll('mark')].map((m) => m.textContent) }))); };
      // 記号なし・記号ありの両方
      for (const [text, id] of [['今週', 'c'], ['# 今週', 'c'], ['## 今週', 'c'], ['買い物', 'b'], ['- [ ] 買い物', 'b'], ['来期', 'a'], ['# 来期', 'a']]) {
        const h = await hits(text);
        expect(h.map((x) => x.id), text).toContain(id);
      }
      // 抜き出しに記号が出ない。強調は記号を外した文字の上
      const h1 = await hits('買い物');
      expect(h1.length).toBeGreaterThan(0);
      for (const x of h1) { expect(x.text, x.text).not.toMatch(MARKS); expect(x.marks).toContain('買い物'); }
      const h2 = await hits('予約');
      expect(h2.map((x) => x.id)).toEqual(['a']);
      expect(h2[0].text).not.toMatch(MARKS); expect(h2[0].text).toContain('来期の予定'); expect(h2[0].marks).toEqual(['予約']);
      // 予定は0件でノートだけ当たる: 古い「検索範囲」の文ではなく、今の文言（他の検索と同じ形）
      const body = await page.locator('#sr-body').innerText();
      expect(body).not.toContain('検索範囲を確認');
      if (kind !== 'port') { // 開いた縦のノート画面からの検索は「ノートだけ」の範囲で、予定の欄は出ない（FOCUS）
        // STEER 23:00: 当たりがあるときは予定の欄に1行だけ。「検索語を確認して」は出さない
        expect(body).toContain('予定：この3年に見つかりませんでした');
        expect(body).not.toContain('検索語を確認');
        expect(body).not.toContain('該当する予定はありません');
      }
      expect((await rawNote(page, 'a')).body).toBe(BODY_A); // 検索で保存の文字は変わらない
    });
  }
});

test.describe('S7a 日のカード・ホームのカードに記号が出ない', () => {
  for (const [name, size, sar, kind] of POSTURES) {
    test(`${name}`, async ({ page }) => {
      await openApp(page, size); await seedNotes(page);
      if (sar) await page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), sar);
      const shown = await page.evaluate(() => [...document.querySelectorAll('.dnt, .pvnote, .mdnote, .dnote')].filter((e) => e.offsetParent).map((e) => e.innerText));
      for (const t of shown) expect(t, t).not.toMatch(MARKS);
    });
  }
});

test.describe('S7a 題名欄 44・フォルダの行・右ページのそろい（V-18/19/20）', () => {
  for (const [name, size, sar, kind] of POSTURES) {
    test(`${name}: 題名欄 44（文字と本文の位置は変えない）`, async ({ page }) => {
      await setup(page, kind, size, sar); await openNote(page, 'a');
      const m = await page.evaluate(() => { const t = document.querySelector('.ned-title'), b = document.querySelector('.ned-bodywrap'); const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect(); return { th: tr.height, ty: tr.y, by: br.y, pad: getComputedStyle(t).paddingTop }; });
      near(m.th, 44); expect(m.pad).toBe('7px');
      near(m.by - (m.ty + 7), 36); // 文字の頭から本文まで 36（題の行 30 ＋ 間 6）。前の版と同じ（V-18: 本文の位置は変えない）
    });
  }
  test('開いた横: 見出し・一覧・フォルダの行・題と本文の文字が x500（V-19）。札は 28・角丸 14・13pt・間 8（V-20）', async ({ page }) => {
    await setup(page, 'land', SIZES.openLandscape951, 84);
    const listX = await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('.ntools .ntitle')); return [r.getClientRects()[0].x, document.querySelector('.mlq').getBoundingClientRect().x]; });
    near(listX[0], 501.5); near(listX[1], 501.5); // S8 N-01（設計 2026-11-20）: 右ページの箱 +8 で見出しの文字は x501.5（旧 x500） // 一覧の画面: 「ノート」の文字と検索の欄も x500
    await openNote(page, 'a');
    const m = await page.evaluate(() => {
      const X = (e) => Math.round(e.getBoundingClientRect().x * 10) / 10;
      const textX = (e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getClientRects()[0].x * 10) / 10; };
      const pills = [...document.querySelectorAll('.nmeta > button')].map((b) => { const p = b.querySelector('.nfp'), r = p.getBoundingClientRect(), cs = getComputedStyle(p), br = b.getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height, bh: br.height, rad: cs.borderTopLeftRadius, fs: cs.fontSize, cls: b.className }; }); // 見える札（.nfp）が 28、ボタンは押せる範囲 44
      const nl = document.querySelector('.ned-body .nl');
      return { head: textX(document.querySelector('h2.rdate')), list: textX(document.querySelector('.ntools .mback')), folder: X(document.querySelector('.nmeta')), pill0: pills[0].x, title: X(document.querySelector('.ned-title')) + parseFloat(getComputedStyle(document.querySelector('.ned-title')).paddingLeft), // textarea の文字の頭 = 箱 + 左の余白
      body: textX(nl), pills };
    });
    for (const k of ['head', 'list', 'folder', 'pill0', 'title', 'body']) near(m[k], 501.5); // S8 N-01: x501.5
    expect(m.pills.map((p) => p.cls.split(' ')[0])).toEqual(['nfpill', 'ndate', 'nmpin']);
    for (const p of m.pills) { near(p.h, 28, 0.5); near(p.bh, 44, 0.5); expect(p.rad).toBe('14px'); expect(p.fs).toBe('13px'); }
    near(m.pills[1].x - (m.pills[0].x + m.pills[0].w), 8, 0.5); near(m.pills[2].x - (m.pills[1].x + m.pills[1].w), 8, 0.5);
    // 押せる範囲は 44（札の上下 8）
    const hit = await page.locator('.nmeta .ndate').evaluate((b) => { const r = b.querySelector('.nfp').getBoundingClientRect(); const cx = r.x + r.width / 2; return [document.elementFromPoint(cx, r.y - 7)?.closest('button')?.className, document.elementFromPoint(cx, r.y + r.height + 7)?.closest('button')?.className]; });
    expect(hit[0]).toContain('ndate'); expect(hit[1]).toContain('ndate');
  });
  test('フォルダの札: 押すと小さなメニュー。選ぶとフォルダが変わり、札の文字も変わる（選ぶ欄は出さない）', async ({ page }) => {
    await page.evaluate(() => 0);
    await openApp(page, SIZES.openLandscape951);
    await page.evaluate(async (notes) => { const db = await import('/js/db.js'); await db.putFolder({ id: 'f1', name: '仕事', order: 0, createdAt: 1, updatedAt: 1 }); for (const n of notes) await db.putNote(n); }, NOTES);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await pagePick(page, 'right', 'ノート').click();
    await openNote(page, 'a');
    await expect(page.locator('select[data-nfsel]')).toHaveCount(0);
    const pill = page.locator('.nmeta .nfpill').first();
    await expect(pill).toContainText('フォルダ：なし');
    await pill.click();
    await expect(page.locator('.nmenu')).toBeVisible();
    await page.locator('.nmenu [data-nf="curmvto"][data-to="f1"]').click();
    await expect(pill).toContainText('フォルダ：仕事');
    await expect.poll(async () => (await rawNote(page, 'a')).folderId).toBe('f1');
    expect((await rawNote(page, 'a')).body).toBe(BODY_A);
  });
});

test.describe('S7a 閉じた月のタスクのチェック欄（V-15・中-3）', () => {
  for (const form of ['one', 'two', 'month']) {
    test(`型 ${form}: 閉じた日の欄の下にタスクは出ない（34 で置き換え）`, async ({ page }) => {
      await spy(page);
      await page.addInitScript((f) => { const k = 'duo.ui.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, monthForm: f, monthDay: 'list', pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } })); }, form);
      await openApp(page, SIZES.closedPortrait);
      await seedTasks(page, [T('t1', { title: '今日の資料印刷', due: { date: '2026-11-12', time: '11:00' }, order: 1, createdAt: 1, updatedAt: 1 }), T('t2', { title: '夕方に買い物', due: { date: '2026-11-12' }, order: 2, createdAt: 2, updatedAt: 2 })]);
      await page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), 84);
      await tab(page, '月').click(); await page.waitForTimeout(400);
      // 第19.2版 S11b（34 §9.1 の11）で置き換え: 閉じた画面の日の欄の下にタスクは出さない（右の列の「タスク」から）。チェック欄の寸法は開いた縦のほうの spec で見る
      await expect(page.locator('.mdtask')).toHaveCount(0);
    });
  }
});

test('S7a ✓（完了）を押すと緑の丸が opacity 0.7・scale 0.94 になる（品質 中-2）', async ({ page }) => {
  await setup(page, 'closed', SIZES.closedPortrait, 84); await openNote(page, 'a');
  const done = page.locator('.ned-done').first();
  const st = (e) => { const c = getComputedStyle(e, '::before'); return c.opacity + '|' + c.transform; };
  const f0 = await done.evaluate(st);
  expect(f0).toBe('1|none');
  const b = await done.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(200);
  const f1 = await done.evaluate(st);
  await page.mouse.up();
  // 設計 00:25 の決め: 押している間 opacity 0.7・scale 0.94（0.10s）
  expect(f1).toMatch(/^0\.7\|matrix\(0\.94, 0, 0, 0\.94/);
});

test.describe('S7a タスクの日付の見出し（V-24）', () => {
  test('「11月13日（金）」の書き方にそろえる。今日は「今日 · 11月12日（木）」。半角のかっこと「11/13」は出ない', async ({ page }) => {
    await spy(page);
    await openApp(page, SIZES.closedPortrait);
    await seedTasks(page, [T('t0', { title: '今日の件', due: { date: '2026-11-12' }, order: 1, createdAt: 1, updatedAt: 1 }), T('t1', { title: '明日の件', due: { date: '2026-11-13' }, order: 2, createdAt: 2, updatedAt: 2 }), T('t2', { title: '来月の件', due: { date: '2026-12-05' }, order: 3, createdAt: 3, updatedAt: 3 })]);
    await page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), 84);
    await page.locator('[data-act="strip"][data-strip="task"]').first().click(); await page.waitForTimeout(500);
    const heads = await page.locator('.rmh').allInnerTexts();
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) { expect(h, h).not.toMatch(/\(.\)/); expect(h, h).not.toMatch(/^\d+\/\d+/); }
    expect(heads.some((h) => /^今日 · 11月12日（木）$/.test(h) || /^11月1[0-9]日（.）$/.test(h) || /^12月5日（土）$/.test(h))).toBe(true);
  });
});
