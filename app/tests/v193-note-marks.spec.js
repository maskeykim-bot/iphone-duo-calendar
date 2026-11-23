// 第19.3版 その2 B・C（征希さん「ノートに言葉を入れると行頭記号が無くなる。言葉を入れた後には変更できる。行頭記号はタブ（iPhoneならスワイプ）で段落を変えられるようにする」）
// B: 空の行で箇条書き・チェックを選んでから文字を打っても（英字・日本語の変換）、行頭記号が残る。文字のある行でも記号を付ける・替える・外す。
// C: 箇条書き・チェックの行の字下げ（Tab／Shift+Tab、指で右／左へ払う）。保存は行頭の空白 2 つで1段、最大 4 段。
// 「模型」= note-ime-r70.spec.js と同じ作り（合成イベントで iPhone の WebKit の変換を真似る）。Chromium と WebKit の両方で回す。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, dayNoteEntry } from './helpers.js';

const DAY = '2026-11-12';
const SHOTS = '/workspace/cal-v191-shots/V193';
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const getNote = (page, id) => page.evaluate(async (id) => (await import('/js/db.js')).getNote(id), id);
const dayNotes = (page) => page.evaluate(async (d) => (await (await import('/js/db.js')).listNotes()).filter((n) => n.date === d && !n.deletedAt), DAY);
const ned = (page) => page.locator('.nsheet .ned-body');
const val = (page) => ned(page).evaluate((b) => b.value);
const rowsOf = (page) => ned(page).evaluate((b) => [...b.children].map((c) => `${c.dataset.k}${c.dataset.lv ? c.dataset.lv : ''}:${c.textContent}`));
const sel = (page, s, e = s) => ned(page).evaluate((b, [s, e]) => { b.focus(); b.setSelectionRange(s, e); }, [s, e]);
const caret = (page) => ned(page).evaluate((b) => [b.selectionStart, b.selectionEnd]);
const top = (page, k) => page.locator(`.nsheet .ned-top [data-fmt=${k}]`).click();
const sheetSet = async (page, k) => { if (!(await page.locator('.nsheet .ned-fsheet').isVisible())) await top(page, 'type'); await page.locator(`.nsheet .ned-fsb[data-fset=${k}]`).click(); };
const sheetClose = (page) => page.locator('.nsheet [data-act=fsclose]').click();
const PRE = { bullet: '- ', check: '- [ ] ' };

async function boot(page, { size = SIZES.closedPortrait, sar = 0 } = {}) {
  if (sar) await page.addInitScript((v) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${v}px`)), sar);
  await page.addInitScript(() => { const k = 'duo.ui.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); if (!s.monthDay) localStorage.setItem(k, JSON.stringify({ ...s, monthDay: 'list' })); });
  await openApp(page, size);
  const m = page.getByRole('button', { name: '月', exact: true }); if (await m.isVisible()) { await m.click(); await page.waitForTimeout(300); }
}
const tapDay = async (page) => { const dn = dayNoteEntry(page, DAY); await dn.scrollIntoViewIfNeeded(); await dn.click(); await expect(ned(page)).toBeVisible(); await page.waitForTimeout(300); };
// 新しいその日のノート（本文は空）
async function openFresh(page, opts) { await boot(page, opts); await tapDay(page); await ned(page).click(); }
// 本文つきのノート（題名は「題」）
async function openSeed(page, rest, opts) {
  await boot(page, opts);
  await putNote(page, { id: 'v193-m', body: `題\n${rest}`, createdAt: 5, updatedAt: 10, folderId: null, pinned: false, pinnedAt: null, date: DAY, deletedAt: null });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await tapDay(page);
}
const done = async (page) => { await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(900); };
const savedRest = async (page) => { await page.waitForTimeout(1300); const ns = await dayNotes(page); expect(ns.length).toBe(1); return ns[0].body.split('\n').slice(1).join('\n'); };

// 変換の模型（note-ime-r70.spec.js の EMU と同じ動き）＋ 確定のときに WebKit が行を作り替える形（prune）
const EMU = () => {
  const b = [...document.querySelectorAll('.nsheet .ned-body')][0]; let st = null;
  const fire = (type, data, isComposing, it = 'insertCompositionText') => (type.startsWith('composition') ? b.dispatchEvent(new CompositionEvent(type, { bubbles: true, data })) : b.dispatchEvent(new InputEvent(type, { bubbles: true, cancelable: type === 'beforeinput', inputType: it, data, isComposing })));
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
    // 確定で、変換中の文字を消して空になった行をブラウザが取り除き、確定の文字を行の外（本文の直下）に入れ直す形。how: 'text'＝裸の文字／'div'＝書式のない div
    endPrune(t, how) {
      let ln = st.node; while (ln.parentNode !== b) ln = ln.parentNode;
      fire('beforeinput', null, true, 'deleteCompositionText'); const ref = ln.nextSibling; ln.remove(); fire('input', null, true, 'deleteCompositionText');
      fire('beforeinput', t, true, 'insertFromComposition');
      const tn = document.createTextNode(t); let node = tn; if (how === 'div') { node = document.createElement('div'); node.append(tn); }
      b.insertBefore(node, ref); getSelection().setBaseAndExtent(tn, t.length, tn, t.length);
      fire('input', t, true, 'insertFromComposition'); fire('compositionend', t, false); st = null;
    },
    caretOffLine() { getSelection().setBaseAndExtent(b, 0, b, 0); },
  };
};
const emuType = async (page, list, commit) => { await page.evaluate(() => __emu.start()); for (const t of list) await page.evaluate((t) => __emu.update(t), t); await page.evaluate((c) => __emu.end(c), commit); };
const KANA = ['き', 'きょ', 'きょう'];

test.describe('B: 空の行で記号を選んでから文字を打っても、行頭記号が残る', () => {
  for (const k of ['bullet', 'check']) {
    test(`${k}: 上の帯で選ぶ → 英字を打つ → 記号つきの行のまま（改行で次の行も同じ記号）`, async ({ page }) => {
      await openFresh(page);
      await top(page, k);
      expect(await val(page)).toBe(PRE[k]);
      await page.keyboard.type('milk');
      expect(await val(page)).toBe(`${PRE[k]}milk`);
      expect(await rowsOf(page)).toEqual([`${k}:milk`]);
      await page.keyboard.press('Enter'); await page.keyboard.type('eggs');
      expect(await rowsOf(page)).toEqual([`${k}:milk`, `${k}:eggs`]);
      expect(await savedRest(page)).toBe(`${PRE[k]}milk\n${PRE[k]}eggs`);
    });
    test(`${k}: 書式のシートで選ぶ → 閉じて英字を打つ → 記号つきの行のまま`, async ({ page }) => {
      await openFresh(page);
      await page.keyboard.type('x'); await page.keyboard.press('Enter');
      await sheetSet(page, k); await sheetClose(page);
      await page.keyboard.type('milk');
      expect(await rowsOf(page)).toEqual(['plain:x', `${k}:milk`]);
      expect(await savedRest(page)).toBe(`x\n${PRE[k]}milk`);
    });
    test(`${k}: 選んだあとキャレットが行の外（本文の頭）へ外れていても、英字は記号の行に入る`, async ({ page }) => {
      await openFresh(page); await page.evaluate(EMU);
      await page.keyboard.type('x'); await page.keyboard.press('Enter');
      await top(page, k);
      await page.evaluate(() => __emu.caretOffLine());
      await page.keyboard.type('milk');
      expect(await rowsOf(page)).toEqual(['plain:x', `${k}:milk`]);
      expect(await caret(page)).toEqual([2 + PRE[k].length + 4, 2 + PRE[k].length + 4]);
      expect(await savedRest(page)).toBe(`x\n${PRE[k]}milk`);
    });
    for (const mode of ['ふつう', '変換中の文字を span で包む', '選んだあとキャレットが行の外', '確定で行が消えて裸の文字が入る', '確定で行が書式のない div に替わる']) {
      test(`${k}: 日本語の変換（模型・${mode}）→ 確定しても記号つきの行のまま、途中の行は残らない`, async ({ page }) => {
        await openFresh(page); await page.evaluate(EMU);
        await page.keyboard.type('x'); await page.keyboard.press('Enter');
        await top(page, k);
        if (mode.includes('span')) await page.evaluate(() => { window.__span = 1; });
        if (mode.includes('行の外')) await page.evaluate(() => __emu.caretOffLine());
        if (mode.startsWith('確定で')) {
          await page.evaluate(() => { __emu.start(); for (const t of ['き', 'きょ', 'きょう']) __emu.update(t); });
          expect(await val(page), '変換中の読み取りにも記号がある').toBe(`x\n${PRE[k]}きょう`);
          await page.evaluate((how) => __emu.endPrune('今日', how), mode.includes('div') ? 'div' : 'text');
        } else await emuType(page, KANA, '今日');
        expect(await rowsOf(page)).toEqual(['plain:x', `${k}:今日`]);
        expect(await val(page)).toBe(`x\n${PRE[k]}今日`);
        // 続けてもう1語（確定後のキャレットが文字の後ろにある）
        await emuType(page, ['の', 'のー', 'のーと'], 'ノート');
        expect(await rowsOf(page)).toEqual(['plain:x', `${k}:今日ノート`]);
        expect(await savedRest(page)).toBe(`x\n${PRE[k]}今日ノート`);
      });
    }
    test(`${k}: 変換の取り消し（空で確定）でも、空の記号の行はそのまま残る`, async ({ page }) => {
      await openFresh(page); await page.evaluate(EMU);
      await top(page, k);
      await emuType(page, KANA, '');
      expect(await val(page)).toBe(PRE[k]);
      await page.keyboard.type('ok');
      expect(await rowsOf(page)).toEqual([`${k}:ok`]);
    });
    test(`${k}: 日本語の変換（Chromium の本物の IME）→ 記号つきの行のまま`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'CDP は Chromium だけ');
      await openFresh(page);
      await top(page, k);
      const cdp = await page.context().newCDPSession(page);
      for (const t of KANA) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
      expect(await val(page)).toBe(`${PRE[k]}きょう`);
      await cdp.send('Input.insertText', { text: '今日' });
      expect(await rowsOf(page)).toEqual([`${k}:今日`]);
      await page.keyboard.press('Enter');
      for (const t of ['の', 'のー', 'のーと']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
      await cdp.send('Input.insertText', { text: 'ノート' });
      expect(await rowsOf(page)).toEqual([`${k}:今日`, `${k}:ノート`]);
      expect(await savedRest(page)).toBe(`${PRE[k]}今日\n${PRE[k]}ノート`);
    });
  }
});

test.describe('B: 文字の入っている行でも、記号を付ける・替える・外す', () => {
  test('1行: 本文 → 箇条書き → チェック → 本文。文字はそのまま、キャレットは文字の位置のまま', async ({ page }) => {
    await openSeed(page, '買い物メモ\n次の行');
    await sel(page, 2); // 「買い|物メモ」
    await top(page, 'bullet');
    expect(await val(page)).toBe('- 買い物メモ\n次の行'); expect(await caret(page)).toEqual([4, 4]);
    await top(page, 'check');
    expect(await val(page)).toBe('- [ ] 買い物メモ\n次の行'); expect(await caret(page)).toEqual([8, 8]);
    await page.keyboard.type('の');
    expect(await rowsOf(page)).toEqual(['check:買いの物メモ', 'plain:次の行']);
    await sheetSet(page, 'bullet');
    expect(await val(page)).toBe('- 買いの物メモ\n次の行');
    await sheetSet(page, 'check');
    expect(await val(page)).toBe('- [ ] 買いの物メモ\n次の行');
    await sheetSet(page, 'plain');
    expect(await val(page)).toBe('買いの物メモ\n次の行');
    await sheetClose(page);
    expect(await caret(page)).toEqual([3, 3]);
    await page.keyboard.type('!');
    expect(await val(page)).toBe('買いの!物メモ\n次の行');
    expect(await savedRest(page)).toBe('買いの!物メモ\n次の行');
  });
  test('上の帯: 同じ記号をもう一度で外れる。チェック済みの行を箇条書きに替えても文字は変わらない', async ({ page }) => {
    await openSeed(page, '- [x] 済んだこと\n- 箇条');
    await sel(page, 8);
    await top(page, 'bullet');
    expect(await val(page)).toBe('- 済んだこと\n- 箇条');
    await top(page, 'bullet');
    expect(await val(page)).toBe('済んだこと\n- 箇条');
    await top(page, 'check'); await top(page, 'check');
    expect(await val(page)).toBe('済んだこと\n- 箇条');
  });
  test('複数行を選んで: チェック → 箇条書き → 本文（シート）。全部の行に効き、文字は変わらない', async ({ page }) => {
    const T = '牛乳\nたまご\nパン';
    await openSeed(page, T);
    await sel(page, 1, T.length - 1);
    await top(page, 'check');
    expect(await val(page)).toBe('- [ ] 牛乳\n- [ ] たまご\n- [ ] パン');
    expect(await rowsOf(page)).toEqual(['check:牛乳', 'check:たまご', 'check:パン']);
    await expect(page.locator('.nsheet .ned-chk')).toHaveCount(3);
    await top(page, 'bullet');
    expect(await val(page)).toBe('- 牛乳\n- たまご\n- パン');
    await sheetSet(page, 'plain');
    expect(await val(page)).toBe(T);
    await sheetSet(page, 'check');
    expect(await val(page)).toBe('- [ ] 牛乳\n- [ ] たまご\n- [ ] パン');
    expect(await savedRest(page)).toBe('- [ ] 牛乳\n- [ ] たまご\n- [ ] パン');
  });
  test('字下げのある行の記号を替えても、字下げ（行頭の空白）はそのまま', async ({ page }) => {
    await openSeed(page, '- 親\n  - 子');
    await sel(page, 9);
    await top(page, 'check');
    expect(await val(page)).toBe('- 親\n  - [ ] 子');
    expect(await rowsOf(page)).toEqual(['bullet:親', 'check1:子']);
  });
});

test.describe('保存済みの行（IME のごみの行）は消さない・直さない', () => {
  const GARBAGE = 'きょうののーと\nきょうの\n   - きょうの\n- [ ] きょうのの\n\t- きょ\n- \n- [ ] \nこれは';
  test('開いて閉じるだけでは1文字も変わらない。別の行に記号を付けて打っても、ごみの行はそのまま', async ({ page }) => {
    await openSeed(page, GARBAGE);
    await done(page);
    expect((await getNote(page, 'v193-m')).body).toBe(`題\n${GARBAGE}`);
    await tapDay(page);
    await ned(page).click(); await page.keyboard.press('ControlOrMeta+End');
    await sel(page, GARBAGE.length);
    await page.keyboard.press('Enter');
    await top(page, 'check'); await page.keyboard.type('new');
    await page.keyboard.press('Tab');
    await done(page);
    expect((await getNote(page, 'v193-m')).body).toBe(`題\n${GARBAGE}\n  - [ ] new`);
  });
});

// ---- C ----
// 指の払い（PointerEvent・pointerType=touch）。行の文字の上（左から 120）から dx・dy だけ動かす。返すのは、離す直前の行の translateX。
const swipe = (page, idx, dx, dy = 0, o = {}) => ned(page).evaluate(async (b, a) => {
  const ln = b.children[a.idx]; const r = ln.getBoundingClientRect(); const x0 = r.left + 120, y0 = r.top + r.height / 2;
  const ev = (t, x, y) => new PointerEvent(t, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: a.type || 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
  ln.dispatchEvent(ev('pointerdown', x0, y0));
  if (a.hold) await new Promise((res) => setTimeout(res, a.hold));
  const N = 5; let prevented = false;
  for (let i = 1; i <= N; i++) { const e = ev('pointermove', x0 + (a.dx * i) / N, y0 + (a.dy * i) / N); ln.dispatchEvent(e); prevented = prevented || e.defaultPrevented; }
  const tx = new DOMMatrixReadOnly(getComputedStyle(ln).transform).m41;
  const chk = document.querySelector(`.nsheet .ned-chk[data-line="${a.idx}"]`); const ctx = chk ? new DOMMatrixReadOnly(getComputedStyle(chk).transform).m41 : null;
  (b.children[a.idx] || document).dispatchEvent(ev(a.cancel ? 'pointercancel' : 'pointerup', x0 + a.dx, y0 + a.dy));
  return { tx, ctx, prevented };
}, { idx, dx, dy, ...o });
const padOf = (page, idx) => ned(page).evaluate((b, i) => parseFloat(getComputedStyle(b.children[i]).paddingLeft), idx);

test.describe('C: 外部キーボードの Tab／Shift+Tab で字下げ', () => {
  test('箇条書きの行: Tab＝1段下げ（行頭に空白 2 つ・見た目 20 ずつ右へ）、Shift+Tab＝1段上げ。キャレットは文字の位置のまま', async ({ page }) => {
    await openSeed(page, '- 親\n- 子の行\n本文');
    await sel(page, 7); // 「- 子|の行」
    const p0 = await padOf(page, 1);
    await page.keyboard.press('Tab');
    expect(await val(page)).toBe('- 親\n  - 子の行\n本文'); expect(await caret(page)).toEqual([9, 9]);
    expect(await rowsOf(page)).toEqual(['bullet:親', 'bullet1:子の行', 'plain:本文']);
    expect(await padOf(page, 1)).toBe(p0 + 20);
    await page.keyboard.press('Tab');
    expect(await val(page)).toBe('- 親\n    - 子の行\n本文'); expect(await padOf(page, 1)).toBe(p0 + 40);
    await page.keyboard.type('X');
    expect(await val(page)).toBe('- 親\n    - 子Xの行\n本文');
    await page.keyboard.press('Shift+Tab');
    expect(await val(page)).toBe('- 親\n  - 子Xの行\n本文'); expect(await padOf(page, 1)).toBe(p0 + 20);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
    expect(await val(page)).toBe('- 親\n- 子Xの行\n本文'); expect(await padOf(page, 1)).toBe(p0);
    expect(await savedRest(page)).toBe('- 親\n- 子Xの行\n本文');
  });
  test('チェックの行: 四角（押せる範囲）も段のぶん右へ。チェックの状態と文字は変わらない。最大 4 段で止まる', async ({ page }) => {
    await openSeed(page, '- [x] 済み\n- [ ] まだ');
    await sel(page, 7);
    const x0 = (await page.locator('.nsheet .ned-chk').first().boundingBox()).x;
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.press('Tab');
      const lv = Math.min(i, 4);
      expect(await val(page)).toBe(`${'  '.repeat(lv)}- [x] 済み\n- [ ] まだ`);
      expect((await page.locator('.nsheet .ned-chk').first().boundingBox()).x).toBe(x0 + 20 * lv);
    }
    await expect(page.locator('.nsheet .ned-chk').first()).toHaveAttribute('aria-checked', 'true');
    // 四角は字下げしても押せる（チェックを外す）
    await page.locator('.nsheet .ned-chk').first().click();
    expect(await val(page)).toContain('        - [ ] 済み');
    for (let i = 0; i < 6; i++) { await sel(page, (await val(page)).indexOf('済み')); await page.keyboard.press('Shift+Tab'); }
    expect((await val(page)).split('\n').sort()).toEqual(['- [ ] まだ', '- [ ] 済み']);
  });
  test('記号のない行・見出しの行では、Tab は今までの動きのまま（字下げしない・既定の動きを止めない）', async ({ page }) => {
    await openSeed(page, 'ふつうの行\n# 見出し\n- 箇条');
    await page.evaluate(() => { window.__tab = []; document.addEventListener('keydown', (e) => { if (e.key === 'Tab') window.__tab.push(e.defaultPrevented); }); });
    await sel(page, 2); await page.keyboard.press('Tab');
    expect(await val(page)).toBe('ふつうの行\n# 見出し\n- 箇条');
    await sel(page, 9); await page.keyboard.press('Tab'); await sel(page, 9); await page.keyboard.press('Shift+Tab');
    expect(await val(page)).toBe('ふつうの行\n# 見出し\n- 箇条');
    await sel(page, 16); await page.keyboard.press('Tab');
    expect(await val(page)).toBe('ふつうの行\n# 見出し\n  - 箇条');
    expect(await page.evaluate(() => window.__tab)).toEqual([false, false, false, true]);
  });
  test('複数行を選んで Tab: 記号の行だけ動く。戻す・やり直すに乗る', async ({ page }) => {
    const T = '- 一\n本文\n- [ ] 二\n- 三';
    await openSeed(page, T);
    await sel(page, 1, T.length - 1);
    await page.keyboard.press('Tab');
    const T1 = '  - 一\n本文\n  - [ ] 二\n  - 三';
    expect(await val(page)).toBe(T1);
    await page.keyboard.press('Tab');
    const T2 = '    - 一\n本文\n    - [ ] 二\n    - 三';
    expect(await val(page)).toBe(T2);
    await page.locator('.nsheet .ned-undo').click(); expect(await val(page)).toBe(T1);
    await page.locator('.nsheet .ned-undo').click(); expect(await val(page)).toBe(T);
    await page.locator('.nsheet .ned-redo').click(); expect(await val(page)).toBe(T1);
    await page.locator('.nsheet .ned-redo').click(); expect(await val(page)).toBe(T2);
    expect(await savedRest(page)).toBe(T2);
  });
  test('字下げした行で改行すると、次の行も同じ段・同じ記号で続く', async ({ page }) => {
    await openSeed(page, '- 親');
    await sel(page, 3);
    await page.keyboard.press('Enter'); await page.keyboard.type('子'); await page.keyboard.press('Tab');
    await page.keyboard.press('Enter'); await page.keyboard.type('子2');
    expect(await val(page)).toBe('- 親\n  - 子\n  - 子2');
    expect(await rowsOf(page)).toEqual(['bullet:親', 'bullet1:子', 'bullet1:子2']);
  });
});

test.describe('C: iPhone は行を右へ払うと1段下げ、左へ払うと1段上げ', () => {
  const T = '- 親\n- [ ] 子\n本文の行';
  test('右へ 40 払う → 1段下げ。左へ 40 払う → 1段上げ。払っている間は指に少し追う（1/3）。保存は行頭の空白 2 つ', async ({ page }) => {
    await openSeed(page, T);
    const r1 = await swipe(page, 1, 40, 4);
    expect(r1.prevented, '横の払いは縦スクロールに渡さない').toBe(true);
    expect(r1.tx).toBeGreaterThan(12); expect(r1.tx).toBeLessThanOrEqual(20);
    expect(r1.ctx, '四角も一緒に追う').toBeCloseTo(r1.tx, 3);
    expect(await val(page)).toBe('- 親\n  - [ ] 子\n本文の行');
    expect(await rowsOf(page)).toEqual(['bullet:親', 'check1:子', 'plain:本文の行']);
    await page.waitForTimeout(260);
    expect(await ned(page).evaluate((b) => getComputedStyle(b.children[1]).transform), '離したら段に寄って止まる').toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
    await swipe(page, 1, 60, -6);
    expect(await val(page)).toBe('- 親\n    - [ ] 子\n本文の行');
    const r3 = await swipe(page, 1, -40, 0);
    expect(r3.tx).toBeLessThan(-12);
    expect(await val(page)).toBe('- 親\n  - [ ] 子\n本文の行');
    await swipe(page, 0, 30, 0);
    expect(await val(page)).toBe('  - 親\n  - [ ] 子\n本文の行');
    expect(await savedRest(page)).toBe('  - 親\n  - [ ] 子\n本文の行');
    await done(page);
    expect((await getNote(page, 'v193-m')).body).toBe('題\n  - 親\n  - [ ] 子\n本文の行');
  });
  test('動かないもの: 24 未満・縦が勝つ動き（横が縦の 1.5 倍以下）・長押しからの動き（文字の選択）・マウス・途中で取り消し・記号のない行', async ({ page }) => {
    await openSeed(page, T);
    expect((await swipe(page, 1, 20, 0)).tx, '24 未満でも指には追う').toBeGreaterThan(0);
    expect(await val(page)).toBe(T);
    await page.waitForTimeout(260);
    const v = await swipe(page, 1, 30, 30);
    expect(v.tx).toBe(0); expect(v.prevented, '縦はスクロールに任せる').toBe(false);
    await swipe(page, 1, 30, 20); // 1.5 倍ちょうどは動かさない
    expect(await val(page)).toBe(T);
    const h = await swipe(page, 1, 60, 0, { hold: 450 });
    expect(h.tx).toBe(0); expect(h.prevented).toBe(false);
    await swipe(page, 1, 60, 0, { type: 'mouse' });
    await swipe(page, 1, 60, 0, { cancel: true });
    const p = await swipe(page, 2, 60, 0);
    expect(p.tx).toBe(0);
    expect(await val(page)).toBe(T);
    await page.waitForTimeout(260);
    expect(await ned(page).evaluate((b) => [...b.children].map((c) => getComputedStyle(c).transform).every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'))).toBe(true);
    expect((await getNote(page, 'v193-m')).body).toBe(`題\n${T}`);
  });
  test('端では動かない: 0 段を左へ・最大 4 段を右へ（指にはわずかに追うだけ）。戻す・やり直すに乗る', async ({ page }) => {
    await openSeed(page, T);
    const l = await swipe(page, 0, -60, 0);
    expect(l.tx).toBeLessThan(0); expect(l.tx).toBeGreaterThanOrEqual(-6);
    expect(await val(page)).toBe(T);
    for (let i = 0; i < 4; i++) await swipe(page, 0, 40, 0);
    expect(await val(page)).toBe(`        ${T}`);
    const r = await swipe(page, 0, 60, 0);
    expect(r.tx).toBeGreaterThan(0); expect(r.tx).toBeLessThanOrEqual(6);
    expect(await val(page)).toBe(`        ${T}`);
    await page.locator('.nsheet .ned-undo').click();
    expect(await val(page)).toBe(`      ${T}`);
    await page.locator('.nsheet .ned-redo').click();
    expect(await val(page)).toBe(`        ${T}`);
  });
  test('本文にフォーカスが無いまま払っても字下げでき、フォーカス（キーボード）は出さない。編集中ならキャレットは文字の位置のまま', async ({ page }) => {
    await openSeed(page, T);
    await page.evaluate(() => document.activeElement?.blur?.());
    await swipe(page, 1, 40, 0);
    expect(await val(page)).toBe('- 親\n  - [ ] 子\n本文の行');
    expect(await page.evaluate(() => document.activeElement?.classList?.contains('ned-body') ?? false)).toBe(false);
    await sel(page, 13); // 「  - [ ] 子|」
    await swipe(page, 1, -40, 0);
    expect(await val(page)).toBe(T); expect(await caret(page)).toEqual([11, 11]);
    await page.keyboard.type('供');
    expect(await val(page)).toBe('- 親\n- [ ] 子供\n本文の行');
  });
  test('視差効果を減らす: 寄せる動きなしで、すぐ段に付く', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSeed(page, T);
    await swipe(page, 1, 40, 0);
    expect(await val(page)).toBe('- 親\n  - [ ] 子\n本文の行');
    expect(await ned(page).evaluate((b) => getComputedStyle(b.children[1]).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
  });
});

test.describe('C: 見るだけの欄（日のノート）にも段が出る・保存の形', () => {
  test('字下げしたノートを閉じると、日の欄のノートの行も段のぶん右へ。開き直しても同じ段', async ({ page }) => {
    await openSeed(page, '- 親\n  - 子\n    - [ ] 孫');
    expect(await rowsOf(page)).toEqual(['bullet:親', 'bullet1:子', 'check2:孫']);
    await done(page);
    expect((await getNote(page, 'v193-m')).body).toBe('題\n- 親\n  - 子\n    - [ ] 孫');
    // v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 閉じた画面の日の欄にノートの「見るだけの欄」（.dnt）は無くなった（ノートはカード）。見るだけの欄が残っている開いた縦の日の部分で確かめる
    await page.setViewportSize(SIZES.openPortrait669); await page.waitForTimeout(700);
    if (!(await page.locator('.dnt .nl').count())) { const m = page.getByRole('button', { name: '月', exact: true }); if (await m.isVisible()) { await m.click(); await page.waitForTimeout(400); } }
    const lv = await page.evaluate(() => [...document.querySelectorAll('.dnt .nl')].filter((n) => n.offsetParent).map((n) => `${n.dataset.k}${n.dataset.lv || ''}:${n.textContent}:${parseFloat(getComputedStyle(n).paddingLeft)}`));
    expect(lv, '日の欄のノート（.dnt）の行: 種類＋段:文字:左の余白（24＋段×16）。日の欄の作りが変わってここに .dnt が出なくなったら、見るだけの欄の出る所に合わせて直す').toEqual(['plain:題:0', 'bullet:親:24', 'bullet1:子:40', 'check2:孫:56']);
    await tapDay(page);
    expect(await rowsOf(page)).toEqual(['bullet:親', 'bullet1:子', 'check2:孫']);
  });
});

test.describe('自分の目で確かめる絵（実機寸法 466×678・右の帯 84）', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', '絵は Chromium で撮る');
  test('p2-note-mark-typed / p2-note-mark-changed / p2-note-indent', async ({ page }) => {
    await openFresh(page, { sar: 84 }); await page.evaluate(EMU);
    await top(page, 'bullet'); await emuType(page, KANA, '今日の買い物'); await page.keyboard.press('Enter');
    await page.keyboard.type('milk'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await top(page, 'check'); await emuType(page, ['で', 'でん', 'でんわ'], '電話する'); await page.keyboard.press('Enter');
    await page.keyboard.type('mail');
    expect(await val(page)).toBe('- 今日の買い物\n- milk\n- [ ] 電話する\n- [ ] mail');
    await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/p2-note-mark-typed.png` });
    // 文字の入った行の記号を替える: 2行目（箇条書き）→ チェック。書式のシートを開いたまま（押された形が見える）
    const at = async (w) => (await val(page)).indexOf(w) + 1;
    await sel(page, await at('milk')); await sheetSet(page, 'check');
    await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/p2-note-mark-changed.png` });
    expect(await val(page)).toBe('- 今日の買い物\n- [ ] milk\n- [ ] 電話する\n- [ ] mail');
    await sheetClose(page);
    // 字下げ: 2行目を1段、3行目を2段、4行目を払いで1段
    await sel(page, await at('milk')); await page.keyboard.press('Tab');
    await sel(page, await at('電話')); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await swipe(page, 3, 40, 0);
    await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter'); await page.keyboard.type('sub'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await top(page, 'bullet'); await page.keyboard.type('a'); await page.keyboard.press('Enter'); await page.keyboard.type('b'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.keyboard.type('c'); await page.keyboard.press('Tab');
    await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/p2-note-indent.png` });
    expect(await val(page)).toBe('- 今日の買い物\n  - [ ] milk\n    - [ ] 電話する\n  - [ ] mail\n  - [ ] sub\n- a\n  - b\n    - c');
  });
});
