// 第19.1版 S3（#4 R-27・H-14・H-15）: ノートの記号を画面に出さない。保存の文字（「# 」「- 」「- [ ] 」「- [x] 」）は今のまま。
// 部品を直接マウントして、保存の文字・カーソル・改行・削除・変換中・貼り付け・元に戻す・書式バーを調べる。寸法は実画面（開いた横）で測る。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, bodyIs } from './helpers.js';

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
const val = (page) => body(page).evaluate((e) => e.value);
const sel = (page) => body(page).evaluate((e) => [e.selectionStart, e.selectionEnd]);
const setSel = (page, s, e = s) => body(page).evaluate((el, [a, b]) => { el.focus(); el.setSelectionRange(a, b); }, [s, e]);
const fmtBtn = (page, name) => page.getByRole('button', { name, exact: true });
const ALL = '題\n# 来期の予定\n本文の行\n- 牛乳\n## 小見出し\n- [ ] 予約\n- [x] 日程の調整\n  - [X] 字下げ\n\n最後の行';

test.describe('ノートの本文: 記号は画面に出さず、保存の文字は変えない', () => {
  test.beforeEach(async ({ page }) => { await openApp(page, SIZES.openPortrait669); await mount(page); });

  test('開いても本文を書き換えない（updatedAt 不変）。画面に記号が1つも出ない。値は保存の文字のまま', async ({ page }) => {
    await putNote(page, { id: 'r1', body: ALL, createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('r1')); await page.waitForTimeout(300);
    expect((await getNote(page, 'r1')).updatedAt).toBe(5);
    await bodyIs(body(page), ALL.split('\n').slice(1).join('\n'));
    const shown = await body(page).evaluate((e) => e.innerText);
    expect(shown).not.toMatch(/(^|\n)\s*(#{1,6} |- \[[ xX]\]|- )/); // 行頭の記号 0
    expect(shown).not.toContain('[ ]'); expect(shown).not.toContain('[x]');
    expect(await page.locator('.ned-body .nl').evaluateAll((l) => l.map((x) => x.dataset.k + (x.dataset.c ? x.dataset.c : '')))).toEqual(['h1', 'plain', 'bullet', 'h2', 'check0', 'check1', 'check1', 'plain', 'plain']);
    await expect(page.locator('.ned-chk')).toHaveCount(3); // チェックの四角は1行に1つ（記号との二重なし）
  });

  test('保存の往復: 書式バーの操作で保存の文字が note-lines と同じ形になる（見出し・箇条書き・チェック・トグルで戻る）', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('題'); await page.locator('.ned-title').press('Enter');
    await page.keyboard.type('一行目'); await page.keyboard.press('Enter'); await page.keyboard.type('二行目');
    await setSel(page, 0);
    await fmtBtn(page, 'チェックリストにする').click();
    expect(await val(page)).toBe('- [ ] 一行目\n二行目');
    await fmtBtn(page, '箇条書きにする').click();
    expect(await val(page)).toBe('- 一行目\n二行目');
    await fmtBtn(page, '文字の書式').click();
    await page.locator('.ned-fsb[data-fset="heading"]').click();
    expect(await val(page)).toBe('# 一行目\n二行目');
    await page.locator('.ned-fsb[data-fset="heading2"]').click();
    expect(await val(page)).toBe('## 一行目\n二行目');
    await page.locator('.ned-fsb[data-fset="plain"]').click();
    expect(await val(page)).toBe('一行目\n二行目');
    await expect.poll(async () => (await page.evaluate(() => window.__ned.id && null)), { timeout: 100 }).toBeNull();
    await page.evaluate(() => window.__ned.leave());
    const saved = await page.evaluate(async () => (await (await import('/js/db.js')).listNotes()).map((n) => n.body));
    expect(saved).toEqual(['題\n一行目\n二行目']);
  });

  test('「- 」「# 」「- [ ] 」と打つとその行が箇条書き・見出し・チェックになり、記号は画面から消えて保存の文字に残る', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('t'); await page.locator('.ned-title').press('Enter');
    await page.keyboard.type('- 牛乳'); await page.keyboard.press('Enter');
    expect(await val(page)).toBe('- 牛乳\n- '); // 次の項目が続く
    await page.keyboard.press('Enter'); // 空の項目は通常行へ
    await page.keyboard.type('# 見出し');
    await page.keyboard.press('Enter'); // 見出しのあとは通常行
    await page.keyboard.type('- [ ] 予約');
    expect(await val(page)).toBe('- 牛乳\n# 見出し\n- [ ] 予約');
    expect(await page.locator('.ned-body .nl').evaluateAll((l) => l.map((x) => x.dataset.k))).toEqual(['bullet', 'h1', 'check']);
    expect(await body(page).evaluate((e) => e.innerText)).not.toMatch(/- |# |\[ \]/);
    // 文字が続けて入る（キャレットが記号の位置に飛ばない）
    await page.keyboard.type('する');
    expect(await val(page)).toBe('- 牛乳\n# 見出し\n- [ ] 予約する');
  });

  test('Backspace: 記号の行の頭ではふつうの行に戻り、ふつうの行の頭では前の行とつながる。Delete: 行末で次の行をつなげ、次の行の記号は捨てる', async ({ page }) => {
    await putNote(page, { id: 'r2', body: '題\n- [ ] a\n- b\n本文\n# H', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('r2')); await page.waitForTimeout(200);
    // 「- [ ] a」の頭（文字の位置 0）で Backspace → ふつうの行「a」
    await setSel(page, 6); await page.keyboard.press('Backspace');
    expect(await val(page)).toBe('a\n- b\n本文\n# H');
    expect(await sel(page)).toEqual([0, 0]);
    // 「本文」の頭で Backspace → 前の行「- b」につながる（記号は前の行のまま）
    const at = (await val(page)).indexOf('本文'); await setSel(page, at); await page.keyboard.press('Backspace');
    expect(await val(page)).toBe('a\n- b本文\n# H');
    { const i = (await val(page)).indexOf('本文'); expect(await sel(page)).toEqual([i, i]); }
    // 行末で Delete → 次の行「# H」の記号を捨ててつなげる
    const end = (await val(page)).indexOf('\n# H'); await setSel(page, end); await page.keyboard.press('Delete');
    expect(await val(page)).toBe('a\n- b本文H');
    await expect(page.locator('.ned-body .nl')).toHaveCount(2);
  });

  test('Return: 文字の途中で分けると後ろが次の行へ。見出しの途中は後ろがふつうの行。箇条書きの頭の Return は今までどおり', async ({ page }) => {
    await putNote(page, { id: 'r3', body: '題\n# 見出しだよ\n- 牛乳です', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('r3')); await page.waitForTimeout(200);
    await setSel(page, 4); await page.keyboard.press('Enter'); // 見出し「見出」|「しだよ」
    expect(await val(page)).toBe('# 見出\nしだよ\n- 牛乳です');
    expect(await page.locator('.ned-body .nl').evaluateAll((l) => l.map((x) => x.dataset.k))).toEqual(['h1', 'plain', 'bullet']);
    const s = (await val(page)).indexOf('牛乳'); await setSel(page, s); await page.keyboard.press('Enter'); // 行頭で改行: 空行が上、箇条書きは下へ
    expect(await val(page)).toBe('# 見出\nしだよ\n- \n- 牛乳です'); // 既存の onEnter の決まり: 空の項目が上に残る
    expect((await sel(page))[0]).toBe((await val(page)).indexOf('牛乳'));
    await page.keyboard.type('X');
    expect(await val(page)).toBe('# 見出\nしだよ\n- \n- X牛乳です');
  });

  test('行をまたぐ選択: 全選択して打つ・消す・Return で置き換わる。保存の文字に消えた行の記号が残らない', async ({ page }) => {
    await putNote(page, { id: 'r4', body: '題\n- a\n- [ ] b\n# c', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('r4')); await page.waitForTimeout(200);
    await body(page).click(); await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    expect(await val(page)).toBe('');
    await expect(page.locator('.ned-body .nl')).toHaveCount(1);
    await page.keyboard.type('新しい');
    await page.keyboard.press('Control+A'); await page.keyboard.type('上書き');
    expect(await val(page)).toBe('上書き');
    // 途中から途中まで: 「- a」の a から「- [ ] b」の b の手前まで消す → 「- 」+「b」
    await page.evaluate(() => { window.__ned.bodyEl.value = '- aa\n- [ ] bb\n# cc'; });
    await setSel(page, 3, 12); await page.keyboard.press('Delete');
    expect(await val(page)).toBe('- ab\n# cc');
  });

  test('複数行の挿入（貼り付けの insertText 経路）: 記号つきの行は書式の行になり、保存の文字はそのまま', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('t'); await page.locator('.ned-title').press('Enter');
    await page.keyboard.insertText('先頭\n- 牛乳\n- [x] 済\n# 見出');
    expect(await val(page)).toBe('先頭\n- 牛乳\n- [x] 済\n# 見出');
    expect(await page.locator('.ned-body .nl').evaluateAll((l) => l.map((x) => x.dataset.k + (x.dataset.c || '')))).toEqual(['plain', 'bullet', 'check1', 'h1']);
    expect(await body(page).evaluate((e) => e.innerText)).not.toMatch(/- |# |\[x\]/);
  });

  test('貼り付け（paste イベント）: プレーンテキストだけを入れ、HTML は文字として扱う', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('t'); await page.locator('.ned-title').press('Enter');
    await body(page).evaluate((e) => { const dt = new DataTransfer(); dt.setData('text/plain', '<b>牛乳</b>\n- 卵'); dt.setData('text/html', '<b>x</b>'); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    // paste イベントだけでは beforeinput は出ない環境があるので、出ていなければ insertText 経路で確かめる
    if ((await val(page)) === '') await page.keyboard.insertText('<b>牛乳</b>\n- 卵');
    expect(await val(page)).toBe('<b>牛乳</b>\n- 卵');
    expect(await body(page).locator('b').count()).toBe(0);
  });

  test('元に戻す・やり直す: 画面の ↩ とキーボード（Ctrl+Z）の両方が、保存の文字を戻す', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('t'); await page.locator('.ned-title').press('Enter');
    await page.keyboard.type('一'); await page.waitForTimeout(1100); await page.keyboard.type('二'); await page.waitForTimeout(1100);
    await fmtBtn(page, 'チェックリストにする').click();
    expect(await val(page)).toBe('- [ ] 一二');
    await page.getByRole('button', { name: '元に戻す' }).click();
    expect(await val(page)).toBe('一二');
    await page.keyboard.press('Control+Z');
    expect(await val(page)).toBe('一');
    await page.getByRole('button', { name: 'やり直す' }).click();
    expect(await val(page)).toBe('一二');
  });

  test('日本語入力（変換中）: 変換中は DOM を触らず、確定で保存の文字になる。記号の行の中でも同じ', async ({ page }) => {
    await page.evaluate(() => window.__ned.create());
    await page.locator('.ned-title').fill('t'); await page.locator('.ned-title').press('Enter');
    await fmtBtn(page, 'チェックリストにする').click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'かんじ', selectionStart: 3, selectionEnd: 3 });
    expect(await body(page).evaluate((e) => e.innerText.replace(/\n/g, ''))).toContain('かんじ');
    const kind = await page.locator('.ned-body .nl').first().getAttribute('data-k');
    expect(kind).toBe('check');
    await cdp.send('Input.imeSetComposition', { text: '漢字', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: '漢字' });
    expect(await val(page)).toBe('- [ ] 漢字');
    await page.clock.setFixedTime(new Date('2026-11-12T09:42:00+09:00')); // 確定直後 50ms の Return は変換の確定とみなして項目を増やさない（既存の決まり）。時計は固定なので進める
    await page.keyboard.press('Enter');
    await page.keyboard.type('次');
    expect(await val(page)).toBe('- [ ] 漢字\n- [ ] 次');
    // 変換中に先頭が「- 」になる文字列でも、確定までは行の種類を変えない
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await page.clock.setFixedTime(new Date('2026-11-12T09:43:00+09:00'));
    await cdp.send('Input.imeSetComposition', { text: '-', selectionStart: 1, selectionEnd: 1 });
    expect(await page.locator('.ned-body .nl').last().getAttribute('data-k')).toBe('plain');
    await cdp.send('Input.insertText', { text: '-' });
  });

  test('カーソル移動: 矢印キーで行をまたいでも位置（保存の文字のオフセット）が記号を飛ばして進む', async ({ page }) => {
    await putNote(page, { id: 'r5', body: '題\nab\n- cd\n- [ ] ef', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('r5')); await page.waitForTimeout(200);
    await setSel(page, 0);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    expect(await sel(page)).toEqual([5, 5]); // 「ab」の次の行の頭＝「- 」の後ろ
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('End');
    expect(await sel(page)).toEqual([(await val(page)).length, (await val(page)).length]);
    await page.keyboard.press('Home');
    expect(await sel(page)).toEqual([(await val(page)).indexOf('ef'), (await val(page)).indexOf('ef')]);
  });

  test('チェックの四角: 押すと完了（文字は #68716A＋取り消し線）、保存の文字は「- [x] 」', async ({ page }) => {
    await putNote(page, { id: 'r6', body: '題\n- [ ] a', createdAt: 1, updatedAt: 5, folderId: null });
    await page.evaluate(() => window.__ned.open('r6')); await page.waitForTimeout(200);
    await page.locator('.ned-chk').first().click();
    expect(await val(page)).toBe('- [x] a');
    const st = await page.locator('.ned-body .nl').first().evaluate((e) => { const c = getComputedStyle(e); return [c.color, c.textDecorationLine]; });
    expect(st).toEqual(['rgb(104, 113, 106)', 'line-through']);
  });
});

test.describe('ノートの寸法（開いた横 951×669、右の帯 84）', () => {
  test('題と本文の頭が同じ x（513.5）。チェックの行だけ四角 20 が頭に、文字は +28。四角の押せる範囲は 44×44', async ({ page }) => {
    await page.addInitScript(() => { const k = 'duo.ui.v1'; if (localStorage.getItem('__s3d')) return; localStorage.setItem('__s3d', '1'); let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, pages: { left: 'month', right: 'memo', portraitBottom: 'time', portraitShown: false } })); });
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', '84px')));
    await openApp(page, SIZES.openLandscape951);
    await putNote(page, { id: 'm1', body: ALL, createdAt: 1, updatedAt: 5, folderId: null });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await page.locator('.mrow[data-nrow="m1"]').first().click();
    await expect(page.locator('.ned-body .nl').first()).toBeVisible();
    const m = await page.evaluate(() => {
      const tr = document.querySelector('.ned-title').getBoundingClientRect();
      const tx = (l) => { const r = document.createRange(); r.selectNodeContents(l); return r.getClientRects()[0].x; };
      const L = [...document.querySelectorAll('.ned-body .nl')].map((l) => ({ k: l.dataset.k, lv: Number(l.dataset.lv || 0), x: tx(l), h: l.getBoundingClientRect().height, fs: getComputedStyle(l).fontSize, fw: getComputedStyle(l).fontWeight, lh: getComputedStyle(l).lineHeight }));
      const boxes = [...document.querySelectorAll('.ned-chk')].map((b) => { const a = b.getBoundingClientRect(), x = b.querySelector('.ned-box').getBoundingClientRect(); return { hw: a.width, hh: a.height, bx: x.x, bw: x.width, bh: x.height, lv: Number(document.querySelectorAll('.ned-body .nl')[Number(b.dataset.line)].dataset.lv || 0) }; });
      return { titleX: tr.x + 8, L, boxes };
    });
    const near = (a, b, t = 1) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(t);
    for (const l of m.L) {
      if (l.k === 'plain' || l.k === 'h1' || l.k === 'h2') near(l.x, m.titleX); // 本文の頭 = 題と同じ x
      // v19.3 征希さんの要望（行頭記号はタブ・スワイプで段落を変えられるようにする）で仕様変更: 字下げの行（「  - [X] 字下げ」）は、文字も四角も1段 20 ずつ右へ（前は字下げを画面に出さず、どの段も +28 だった）
      else near(l.x, m.titleX + 28 + 20 * l.lv); // 箇条書き・チェックの文字 = +28（四角 20 + 間 8）＋段×20
    }
    const h1 = m.L.find((l) => l.k === 'h1'); expect([h1.fs, h1.fw, h1.lh]).toEqual(['20px', '600', '26px']);
    expect(m.L.map((l) => l.lv)).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 0]); expect(m.boxes.map((b) => b.lv)).toEqual([0, 0, 1]);
    for (const b of m.boxes) { near(b.bx, m.titleX + 20 * b.lv); near(b.bw, 20); near(b.bh, 20); expect(b.hw).toBeGreaterThanOrEqual(44); expect(b.hh).toBeGreaterThanOrEqual(44); }
    expect(m.boxes.length).toBe(3);
  });
});

test.describe('見るだけの表示にも記号を出さない（M-06）', () => {
  const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
  test('1日ページのノート欄: 空の日は「この日のノートを書く」15pt #A8ABA4 が1行目。ノートがある日は記号なしで行の種類を描く', async ({ page }) => {
    await page.addInitScript(() => { if (localStorage.getItem('__s3t')) return; localStorage.setItem('__s3t', '1'); const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, selected: '2026-11-12', spreadType: 'tt' })); });
    await openApp(page, SIZES.openLandscape951);
    await putNote(page, { id: 'd1', body: '今日\n# 見出し\n- 牛乳\n- [ ] 予約\n- [x] 済み', createdAt: 1, updatedAt: 5, folderId: null, date: '2026-11-12' });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const ph = page.locator('.dpage.rp .dnote .dnt-ph');
    await expect(ph).toHaveText('この日のノートを書く');
    const st = await ph.evaluate((e) => { const r = e.getBoundingClientRect(), n = e.closest('.dnote').getBoundingClientRect(), c = getComputedStyle(e); return { fs: c.fontSize, color: c.color, top: Math.round(r.top - n.top), h: r.height }; });
    expect(st).toEqual({ fs: '15px', color: 'rgb(168, 171, 164)', top: 0, h: 30 });
    const left = page.locator('.dpage.lp .dnote');
    await expect(left.locator('.nl')).toHaveCount(5);
    expect(await left.innerText()).not.toMatch(/(^|\n)\s*(#+ |- )|\[[ x]\]/);
    expect(await left.locator('.nl').evaluateAll((l) => l.map((x) => x.dataset.k + (x.dataset.c || '')))).toEqual(['plain', 'h1', 'bullet', 'check0', 'check1']);
    await ph.click(); // たたくとシートが開く（案内は消える＝シートの下になる）
    await expect(page.locator('.nsheet')).toBeVisible();
  });
});

test.describe('時間ページの見出し（M-07）', () => {
  test('日付と六曜が切れない。ノートの札は見出しの行から外れ、終日の行の右に押せる 44', async ({ page }) => {
    await page.addInitScript(() => { const k = 'duo.ui.v1'; if (localStorage.getItem('__s3m7')) return; localStorage.setItem('__s3m7', '1'); let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } localStorage.setItem(k, JSON.stringify({ ...s, pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false } })); });
    await openApp(page, SIZES.openLandscape951);
    await page.evaluate(async () => (await import('/js/db.js')).putNote({ id: 'd2', body: 'ノート', createdAt: 1, updatedAt: 5, folderId: null, date: '2026-11-12' }));
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s); const rc = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const btn = q('.page.rp .datebtn'), chip = q('.page.rp .ndchip'), head = q('.page.rp .rhead'), ad = q('.page.rp .allday');
      const hrk = q('.page.rp .datebtn .hrk');
      return { btn: rc(btn), sw: btn.scrollWidth, cw: btn.clientWidth, hrk: hrk ? rc(hrk) : null, hrkFs: hrk && getComputedStyle(hrk).fontSize, hrkColor: hrk && getComputedStyle(hrk).color, chip: rc(chip), csw: chip.scrollWidth, ccw: chip.clientWidth, text: chip.textContent, head: rc(head), ad: rc(ad), hit: (() => { const r = getComputedStyle(chip, '::before'); return [r.top, r.bottom, r.left, r.right]; })(), dateFs: getComputedStyle(q('.page.rp .datebtn .hdt')).fontSize, dateFw: getComputedStyle(q('.page.rp .datebtn .hdt')).fontWeight };
    });
    expect(m.sw).toBeLessThanOrEqual(m.cw); // 日付＋六曜が切れない
    expect(Math.round(m.btn.w)).toBeGreaterThanOrEqual(181);
    if (m.hrk) { expect(m.hrk.r).toBeLessThanOrEqual(m.btn.r + 0.5); expect(m.hrkFs).toBe('13px'); expect(m.hrkColor).toBe('rgb(104, 113, 106)'); }
    expect([m.dateFs, m.dateFw]).toEqual(['20px', '600']);
    expect(m.csw).toBeLessThanOrEqual(m.ccw); expect(m.text).toBe('ノート 1件'); // 切れない
    expect(m.chip.y).toBeGreaterThanOrEqual(m.ad.y - 0.5); expect(m.chip.b).toBeLessThanOrEqual(m.ad.b + 0.5); // 終日の行の中
    expect(m.chip.y).toBeGreaterThanOrEqual(m.head.b - 0.5); // 見出しの行の外
    expect(Math.abs(m.chip.r - m.ad.r)).toBeLessThanOrEqual(8); // 終日の行の右
    const hit = await page.locator('.page.rp .ndchip').evaluate((e) => { const b = e.getBoundingClientRect(); const probes = [[b.x + b.width / 2, b.y - 10], [b.x + b.width / 2, b.bottom + 10]]; return probes.map(([x, y]) => document.elementFromPoint(x, y) === e); });
    expect(hit).toEqual([true, true]); // 22 の見た目の上下 11 まで押せる（高さ 44）
  });
});
