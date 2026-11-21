// R-70（品質の案）: ノートの日本語入力で、変換途中の文字が行として残らないこと。
// 使い方: /tmp の worktree の app/tests/ に写して流す（WebKit も流すときは qa/scripts/playwright.r70.config.mjs を使う）。
//   cp qa/scripts/note-ime-r70.spec.js <wt>/app/tests/ && cd <wt>/app && npx playwright test -c <path>/playwright.r70.config.mjs
// 「模型」= 合成イベントで iPhone の WebKit の変換を真似たもの（WebKit の Playwright には IME の API がない）。
//   変換中の文字ノードを1つ持ち、つながっていれば中身を差し替え、切り離されたら今のキャレットの位置に入れ直す。
// 「CDP」= Chromium の本物の IME（Input.imeSetComposition / Input.insertText）。Chromium だけで動く。
import { test, expect } from '@playwright/test';
import { openApp, SIZES } from './helpers.js';

const DAY = '2026-11-12';
const KANA = ['き', 'きょ', 'きょう', 'きょうの', 'きょうのの', 'きょうののー', 'きょうののーと'];
const MID = new Set(['こ', 'これ', ...KANA]); // 途中の文字（行として残ってはいけない）
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const dayNotes = (page) => page.evaluate(async (d) => (await (await import('/js/db.js')).listNotes()).filter((n) => n.date === d && !n.deletedAt), DAY);
const ned = (page) => page.locator('.nsheet .ned-body');
const lines = (page) => ned(page).evaluate((b) => [...b.childNodes].map((n) => n.textContent));
const midLeft = (arr) => arr.filter((l) => MID.has(l.trim()));

// 征希さんの画面（閉じた月・日の部分は「予定」）で起動する。helpers は既定で「時間軸」にするので、先に「予定」を置く。
async function boot(page, size = SIZES.closedPortrait) {
  await page.addInitScript(() => { const k = 'duo.ui.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); if (!s.monthDay) localStorage.setItem(k, JSON.stringify({ ...s, monthDay: 'list' })); });
  await openApp(page, size);
  const m = page.getByRole('button', { name: '月', exact: true }); if (await m.isVisible()) { await m.click(); await page.waitForTimeout(300); }
  // cal-v191 S11b（仮）: 閉じた月の段1は日の欄が下のタブの帯にかかる（タブは S11c で消える）。ノートの欄を押せるよう段4へ進める（閉じた画面だけ）
  if (size.width < size.height && size.width < 600) { await page.locator('.mgrab').focus(); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400); }
}
async function openDaySheet(page, size = SIZES.closedPortrait) {
  await boot(page, size);
  const dn = page.locator(`[data-act="daynote"][data-day="${DAY}"]`).filter({ visible: true }).first();
  await dn.scrollIntoViewIfNeeded(); await dn.click();
  await expect(ned(page)).toBeVisible(); await page.waitForTimeout(300);
}
// 本文の DOM の変化を数える（本文の直下の子の出し入れ = 行の作り直し）
// 本文の行を作り直した回数（変換中だけ）。ブラウザが文字ノードを入れるのは数えず、行を取り除いたもの（= アプリの作り直し）だけ数える。
// compositionend の後の1回の整え（endComp）は数えない（document の capture で先に締める）。
const watch = (page) => ned(page).evaluate((b) => { const W = window.__r70 = { compBodyRewrites: 0, comp: false }; const cnt = (ms) => { for (const m of ms) if (m.type === 'childList' && m.target === b && m.removedNodes.length) W.compBodyRewrites++; }; const mo = new MutationObserver((ms) => { if (W.comp) cnt(ms); }); mo.observe(b, { childList: true }); document.addEventListener('compositionstart', () => { mo.takeRecords(); W.comp = true; }, true); document.addEventListener('compositionend', () => { cnt(mo.takeRecords()); W.comp = false; }, true); });
const rewrites = (page) => page.evaluate(() => window.__r70.compBodyRewrites);
// 模型（WebKit・Chromium の両方で動く）
const EMU = () => {
  const b = [...document.querySelectorAll('.nsheet .ned-body')][0]; let st = null;
  const fire = (type, data, isComposing) => (type.startsWith('composition') ? b.dispatchEvent(new CompositionEvent(type, { bubbles: true, data })) : b.dispatchEvent(new InputEvent(type, { bubbles: true, cancelable: type === 'beforeinput', inputType: 'insertCompositionText', data, isComposing })));
  const put = (t) => {
    const g = getSelection();
    if (st && st.node.isConnected && st.node.data.length >= st.start + st.len) { st.node.replaceData(st.start, st.len, t); st.len = t.length; }
    else { const r = g.getRangeAt(0); let node, start; if (window.__span && r.startContainer !== b) { node = document.createTextNode(t); start = 0; const sp = document.createElement('span'); sp.append(node); const c = r.startContainer; if (c.nodeType === 3) c.parentNode.insertBefore(sp, c.splitText(r.startOffset)); else { const ref = c.childNodes[r.startOffset] || null; if (ref && ref.nodeName === 'BR') { c.insertBefore(sp, ref); ref.remove(); } else c.insertBefore(sp, ref); } } else if (r.startContainer.nodeType === 3) { node = r.startContainer; start = r.startOffset; node.insertData(start, t); } else { node = document.createTextNode(t); start = 0; const c = r.startContainer; const ref = c.childNodes[r.startOffset] || null; if (ref && ref.nodeName === 'BR' && c !== b) { c.insertBefore(node, ref); ref.remove(); } else c.insertBefore(node, ref); } st = { node, start, len: t.length }; }
    g.setBaseAndExtent(st.node, st.start + st.len, st.node, st.start + st.len);
  };
  window.__emu = {
    start() { st = null; fire('compositionstart', '', true); },
    update(t) { fire('beforeinput', t, true); put(t); fire('compositionupdate', t, true); fire('input', t, true); },
    end(t) { if (t != null) { fire('beforeinput', t, true); put(t); fire('input', t, true); } fire('compositionend', t ?? '', false); st = null; },
    caretOffLine() { getSelection().setBaseAndExtent(b, 0, b, 0); }, // note_006 の「確定後、キャレットが行の外（本文の頭）」
    strayNode() { b.insertBefore(document.createTextNode(''), b.firstChild); const t = b.lastChild.firstChild; getSelection().setBaseAndExtent(t, t.length, t, t.length); }, // 行の外に文字ノードが1つ
  };
};
const emuType = async (page, list, commit) => { await page.evaluate(() => __emu.start()); for (const t of list) await page.evaluate((t) => __emu.update(t), t); await page.evaluate((c) => __emu.end(c), commit); };
const cdpType = async (cdp, list, commit) => { for (const t of list) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length }); if (commit != null) await cdp.send('Input.insertText', { text: commit }); };
const savedBody = async (page) => { await page.waitForTimeout(1300); const ns = await dayNotes(page); expect(ns.length).toBe(1); return ns[0].body; };

test.describe('R-70 ノートの変換（模型、Chromium と WebKit）', () => {
  for (const pre of ['ふつう', '変換中の文字を span で包む（連携の見立て）', '確定後にキャレットが行の外', '行の外に空の文字ノード']) {
    test(`本文: ${pre} → 途中の行が残らず、変換中に行を作り直さない`, async ({ page }) => {
      await openDaySheet(page); await page.evaluate(EMU); await watch(page);
      await emuType(page, ['こ', 'これ'], 'これは');
      if (pre.includes('span')) await page.evaluate(() => { window.__span = 1; });
      if (pre === '確定後にキャレットが行の外') await page.evaluate(() => __emu.caretOffLine());
      if (pre === '行の外に空の文字ノード') await page.evaluate(() => __emu.strayNode());
      await emuType(page, KANA, '今日のノート');
      const L = await lines(page);
      expect(midLeft(L), `画面に途中の行: ${JSON.stringify(L)}`).toEqual([]);
      expect(L.join('\n').split('今日のノート').length - 1).toBe(1);
      expect(L.filter((l) => l.trim()).length).toBeLessThanOrEqual(2); // 「これは」と「今日のノート」（同じ行でも別の行でもよい）
      expect(await rewrites(page), '変換中に本文の行を作り直した回数').toBe(0);
      const body = await savedBody(page);
      expect(midLeft(body.split('\n')), `保存に途中の行: ${JSON.stringify(body)}`).toEqual([]);
      expect(body).toContain('これは');
    });
  }
  test('連携の案: 変換中の行に span を差し込み isComposing の input → 行の数だけでなく、変換中のノードとキャレットが行の中に残ること', async ({ page }) => {
    await openDaySheet(page); await page.evaluate(EMU);
    await emuType(page, ['こ', 'これ'], 'これは');
    await page.evaluate(() => { window.__span = 1; __emu.start(); __emu.update('き'); });
    const after1 = await ned(page).evaluate((b) => ({ n: b.childNodes.length, span: !!b.querySelector('.nl span')?.isConnected, caretInLine: getSelection().anchorNode !== b && b.contains(getSelection().anchorNode) }));
    expect(after1.n, '行の数（連携の案の判定。5bc8af6 でもここは 1 で通る）').toBe(1);
    expect(after1.span, '変換中のノード（span）が作り直しで消えていない').toBe(true);
    expect(after1.caretInLine, 'キャレットが行の中').toBe(true);
    for (const t of KANA.slice(1)) await page.evaluate((t) => __emu.update(t), t);
    await page.evaluate(() => __emu.end('今日のノート'));
    expect(await lines(page)).toEqual(['これは今日のノート']);
    expect((await savedBody(page)).split('\n').slice(1)).toEqual(['これは今日のノート']);
  });
  test('本文直下の span の文字は、変換中の読み取りでも、確定後の作り直しでも消えない（flat が span を捨てていた件）', async ({ page }) => {
    await openDaySheet(page); await page.evaluate(EMU);
    await emuType(page, ['こ', 'これ'], 'これは');
    await page.evaluate(() => {
      const b = document.querySelector('.nsheet .ned-body');
      const sp = document.createElement('span');
      sp.dataset.r70 = 'direct';
      sp.textContent = '残してほしい行';
      b.append(sp);
    });
    // 変換中: readValue は flat() だけ（作り直さない）。直下の span の文字も拾う。onSel（selectionchange）も踏む。
    const mid = await ned(page).evaluate((b) => {
      b.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      const v = b.value;
      document.dispatchEvent(new Event('selectionchange'));
      return { v, stillThere: !!b.querySelector('[data-r70="direct"]') };
    });
    expect(mid.v, '変換中の flat が直下の span の文字を拾う').toContain('残してほしい行');
    expect(mid.stillThere, '変換中は作り直さないので span が残る').toBe(true);
    await page.evaluate(() => {
      const b = document.querySelector('.nsheet .ned-body');
      b.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    });
    await page.waitForTimeout(400);
    expect((await lines(page)).join('\n'), '確定後の作り直しでも文字が残る').toContain('残してほしい行');
    expect(await savedBody(page)).toContain('残してほしい行');
  });
  test('本文: 変換の取り消し（空で確定）で、途中の文字が画面にも保存にも残らない（キャレットが行の外の状態から）', async ({ page }) => {
    await openDaySheet(page); await page.evaluate(EMU);
    await emuType(page, ['こ', 'これ'], 'これは');
    await page.evaluate(() => __emu.caretOffLine());
    await emuType(page, ['き', 'きょ', 'きょう'], '');
    const L = await lines(page);
    expect(midLeft(L), JSON.stringify(L)).toEqual([]);
    expect(L.filter((l) => l.trim())).toEqual(['これは']);
    const body = await savedBody(page);
    expect(body.split('\n').filter((l) => l.trim()).slice(1)).toEqual(['これは']);
  });
  test('本文: 変換中に「完了」で閉じても、途中の行は1つも保存されない', async ({ page }) => {
    await openDaySheet(page); await page.evaluate(EMU);
    await emuType(page, ['こ', 'これ'], 'これは');
    await page.evaluate(() => __emu.caretOffLine());
    await page.evaluate(() => { __emu.start(); for (const t of ['き', 'きょ', 'きょう']) __emu.update(t); });
    await page.evaluate(() => __emu.end(null)); // 閉じる操作で IME が終わる（確定の文字なし）
    await page.locator('.nsheet .ned-done').click();
    const body = await savedBody(page);
    expect(body.split('\n').filter((l) => ['き', 'きょ'].includes(l.trim())), JSON.stringify(body)).toEqual([]);
    expect(body.split('\n').filter((l) => l.trim() === 'きょう').length).toBeLessThanOrEqual(1);
  });
});

test.describe('R-70 ノートの変換（Chromium の本物の IME）', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP は Chromium だけ');
  test('本文（新しいその日のノート）: 1行「これは今日のノート」、題名は日付', async ({ page }) => {
    await openDaySheet(page); await watch(page);
    const cdp = await page.context().newCDPSession(page);
    await cdpType(cdp, ['こ', 'これ', 'これは'], 'これは'); await cdpType(cdp, KANA, '今日のノート');
    expect(await lines(page)).toEqual(['これは今日のノート']);
    expect(await rewrites(page)).toBe(0);
    const body = await savedBody(page);
    expect(body.split('\n').slice(1)).toEqual(['これは今日のノート']);
  });
  test('本文: 行の外に文字ノードが1つある状態でも、途中の「き」が残らない', async ({ page }) => {
    await openDaySheet(page); await page.evaluate(EMU);
    const cdp = await page.context().newCDPSession(page);
    await cdpType(cdp, ['こ', 'これ', 'これは'], 'これは');
    await page.evaluate(() => __emu.strayNode());
    await cdpType(cdp, KANA, '今日のノート');
    const body = await savedBody(page);
    expect(body, JSON.stringify(body)).not.toMatch(/これはき|^き$/m);
    expect(body).toContain('今日のノート');
  });
  test('本文: Esc（空で取り消し）で「これは」だけに戻る', async ({ page }) => {
    await openDaySheet(page);
    const cdp = await page.context().newCDPSession(page);
    await cdpType(cdp, ['こ', 'これ', 'これは'], 'これは');
    await cdpType(cdp, ['き', 'きょ', 'きょう'], null);
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    expect(await lines(page)).toEqual(['これは']);
    expect((await savedBody(page)).split('\n').slice(1)).toEqual(['これは']);
  });
  test('題名: 1行の「今日のノート」、途中の文字は残らない', async ({ page }) => {
    await openDaySheet(page);
    const cdp = await page.context().newCDPSession(page);
    const t = page.locator('.nsheet .ned-title'); await t.fill(''); await t.click();
    await cdpType(cdp, KANA, '今日のノート');
    await expect(t).toHaveValue('今日のノート');
    expect((await savedBody(page)).split('\n')[0]).toBe('今日のノート');
  });
  test('変換中に画面を開く（466×678 → 669×951）: 確定後は1行', async ({ page }) => {
    await openDaySheet(page);
    const cdp = await page.context().newCDPSession(page);
    await cdpType(cdp, ['き', 'きょ', 'きょう'], null);
    await page.setViewportSize(SIZES.openPortrait669); await page.waitForTimeout(400);
    await cdpType(cdp, KANA.slice(3), '今日のノート');
    const body = await savedBody(page);
    expect(midLeft(body.split('\n')), JSON.stringify(body)).toEqual([]);
    expect(body.split('\n').filter((l) => l.includes('今日のノート')).length).toBe(1);
  });
  test('既にある途中の行（ゴミ行）を勝手に消さない: 開いただけでは1文字も変えず、書き足しても前の行は残る', async ({ page }) => {
    const GARBAGE = '2026年11月12日（木）\n今日のノート\nきょうののーと\nきょうの\nきょう\nこれは';
    await boot(page);
    await putNote(page, { id: 'r70-g', body: GARBAGE, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date: DAY, deletedAt: null });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const dn = page.locator(`[data-act="daynote"][data-day="${DAY}"]`).filter({ visible: true }).first();
    await dn.scrollIntoViewIfNeeded(); await dn.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(300);
    await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800);
    expect((await getNote(page, 'r70-g')).body).toBe(GARBAGE);
    await dn.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(300);
    await ned(page).click(); await page.keyboard.press('Control+End');
    const cdp = await page.context().newCDPSession(page);
    await cdpType(cdp, ['つ', 'つい', 'ついき'], '追記');
    await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800);
    expect((await getNote(page, 'r70-g')).body).toBe(GARBAGE + '追記');
  });
});

test.describe('R-70 の直しで戻ってはいけないもの（S8 の決まり・貼り付け）', () => {
  const openSeed = async (page, body) => {
    await boot(page);
    await putNote(page, { id: 'r70-s', body, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date: DAY, deletedAt: null });
    await page.reload(); await page.waitForSelector('html[data-ready]');
    const dn = page.locator(`[data-act="daynote"][data-day="${DAY}"]`).filter({ visible: true }).first();
    await dn.scrollIntoViewIfNeeded(); await dn.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(300);
  };
  const done = async (page) => { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800); return (await getNote(page, 'r70-s')).body; };
  test('空にした題名は記号を残さない（「# 」だけの行にしない）', async ({ page }) => {
    await openSeed(page, '# 見出し\n本文');
    await page.locator('.nsheet .ned-title').fill('');
    expect((await done(page)).split('\n')[0]).toBe('');
  });
  test('題名に自分で「# x」と打つと、保存は「# x」（「# # x」にしない）', async ({ page }) => {
    await openSeed(page, '# 見出し\n本文');
    await page.locator('.nsheet .ned-title').fill('# x');
    expect((await done(page)).split('\n')[0]).toBe('# x');
  });
  test('題名への複数行の貼り付け: 1行目が題名（記号は出さない）、残りは本文の先頭', async ({ page }) => {
    await openSeed(page, '題\n本文');
    const t = page.locator('.nsheet .ned-title'); await t.fill(''); await t.focus();
    await page.evaluate(() => { const t = document.querySelector('.nsheet .ned-title'); t.value = '# 貼った題\n二行目'; t.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' })); });
    await expect(t).toHaveValue('貼った題');
    expect((await done(page)).split('\n').slice(0, 3)).toEqual(['# 貼った題', '二行目', '本文']);
  });
});
