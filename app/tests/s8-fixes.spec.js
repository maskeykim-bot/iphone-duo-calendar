// 第19.1版 S8（d6840a3 の再レビューの直し）。設計 design/review/2026-11-20-v191-d6840a3-visual-review.md の N-01〜N-09、企画 research/review-v19-1-d6840a3-usability-2026-11-20.md の低、
// 連携 data/連携_レビュー_d6840a3.md の低 L-1・L-2。寸法は getBoundingClientRect で ±1。時計は helpers の 2026-11-12 9:41（実機の確認は 11-19 で別に撮る）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, ev, seed, tab, pagePick } from './helpers.js';
import { T, seedTasks } from './task-helpers.js';

const P = SIZES.openPortrait669, L = SIZES.openLandscape951, C = SIZES.closedPortrait;
const near = (a, b, tol = 1, m = '') => expect(Math.abs(a - b), `${m} ${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const band = (page, r) => page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), r);
// 要素の最初の文字の左端（Range）
const textX = (loc) => loc.first().evaluate((e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getClientRects()[0].left; });
const boxOf = (loc) => loc.first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; });

test.describe('N-01 開いた横・右ページの箱 x493.5〜851（見出し 左x16・右x501.5、カード 左x12・右x497.5、月の格子 左x8・右x493.5）', () => {
  const setup = async (page) => { await openApp(page, L); await band(page, 84); await page.waitForTimeout(150); };
  test('右ページの箱と見出し（ホーム・時間・タスク・ノート・月）', async ({ page }) => {
    await setup(page);
    for (const name of ['ホーム', '時間', 'タスク', 'ノート', '月']) {
      await pagePick(page, 'right', name).click(); await page.waitForTimeout(250);
      const rp = await boxOf(page.locator('.page.rp'));
      near(rp.x, 493.5, 0.6, `${name} 箱の左`); near(rp.r, 851, 0.6, `${name} 箱の右`);
      if (name !== '月') {
        const h = page.locator('.page.rp .rhead h2').first();
        near(await textX(h), 501.5, 1, `${name} 見出しの左端`);
      } else {
        const yr = page.locator('.page.rp .shead h2, .page.rp .rhead h2').first();
        near(await textX(yr), 501.5, 1, '月の見出し');
        const g = await boxOf(page.locator('.page.rp .mgrid, .page.rp .week').first());
        near(g.x, 493.5, 1, '月の格子の左');
      }
    }
  });
  test('右ページのカード・タスクの行は x497.5、ノートの題と本文の文字は 501.5', async ({ page }) => {
    await setup(page);
    await pagePick(page, 'right', 'ホーム').click(); await page.waitForTimeout(250);
    near((await boxOf(page.locator('.page.rp .hcard').first())).x, 497.5, 1, 'ホームのカード');
    await seedTasks(page, [T('x1', { title: 'タスクx' })]); await band(page, 84);
    await pagePick(page, 'right', 'タスク').click(); await page.waitForTimeout(250);
    near(await textX(page.locator('.page.rp .rmh').first()), 497.5, 1, 'タスクの日付の見出し');
    await pagePick(page, 'right', 'ノート').click(); await page.waitForTimeout(250);
    near(await textX(page.locator('.page.rp .ntools .ntitle')), 501.5, 1, 'ノートの見出し');
  });
  test('左ページの見出しも x16（ホーム・時間・タスク・ノート・月）', async ({ page }) => {
    await setup(page);
    for (const name of ['ホーム', '時間', 'タスク', 'ノート', '月']) {
      await pagePick(page, 'left', name).click(); await page.waitForTimeout(250);
      const h = page.locator('.page.lp .rhead h2, .page.lp .shead h2').first();
      near(await textX(h), 16, 1, `左 ${name}`);
    }
  });
  test('今日＋明日の型は 1日ページの箱 485.5（めくりの背）のまま、中の見出しは x501.5', async ({ page }) => {
    await openApp(page, L); await band(page, 84);
    await page.evaluate(() => { const k = 'duo.ui.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.spreadType = 'tt'; localStorage.setItem(k, JSON.stringify(s)); });
    await page.reload(); await page.waitForSelector('html[data-ready]'); await band(page, 84);
    const r = page.locator('.dpage.rp');
    if (await r.count()) { near((await boxOf(r)).x, 485.5, 0.6, 'tt の箱'); near((await boxOf(page.locator('.dpage.rp .hdt'))).x, 501.5, 1, 'tt の見出し'); }
  });
  test('折り目の保護域（中心 475.5±10）に右ページの何も入らない', async ({ page }) => {
    await setup(page);
    for (const name of ['ホーム', '時間', 'タスク', 'ノート', '月']) {
      await pagePick(page, 'right', name).click(); await page.waitForTimeout(200);
      const hits = await page.evaluate(() => [...document.querySelectorAll('.page.rp *')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.visibility !== 'hidden' && r.left < 485.4 && r.right > 465.6; }).map((e) => e.className || e.tagName).slice(0, 5));
      expect(hits, name).toEqual([]);
    }
  });
  test('N-09 ノートの編集の下「削除」の文字は見出しと同じ x501.5（高さ 44）', async ({ page }) => {
    await setup(page);
    await page.evaluate(async () => { const db = await import('/js/db.js'); await db.putNote({ id: 'n1', body: '# 題\n本文', createdAt: 1, updatedAt: 5, folderId: null }); });
    await page.reload(); await page.waitForSelector('html[data-ready]'); await band(page, 84);
    await pagePick(page, 'right', 'ノート').click(); await page.waitForTimeout(200);
    await page.locator('.page.rp .mrow[data-nrow]').first().click(); await page.locator('.page.rp .ned-title').waitFor();
    near(await textX(page.locator('.page.rp .ned-del')), 501.5, 1, '削除の文字');
    near((await boxOf(page.locator('.page.rp .ned-del'))).h, 44, 0.5, '削除の高さ');
    near((await boxOf(page.locator('.page.rp .ned-trashbtn'))).h, 44, 0.5, '最近削除した項目の高さ');
  });
});

test.describe('N-02 閉じた日・週の送り切り：24:00 の線がバーの上 8、23:00 の予定が見えて押せる', () => {
  for (const [name, label] of [['日', '日'], ['週', '週']]) {
    test(name, async ({ page }) => {
      await openApp(page, C); await band(page, 84);
      await seed(page, [ev('late', '深夜の指標', '2026-11-12T23:00', '2026-11-12T23:30')]); await band(page, 84);
      await tab(page, label).click(); await page.waitForTimeout(400);
      const tl = page.locator('.tl[data-pane=closed]').first();
      await tl.evaluate((t) => { t.scrollTop = t.scrollHeight; }); await page.waitForTimeout(300);
      const tabs = await boxOf(page.locator('.tabs'));
      const e = await boxOf(page.locator('.tlev', { hasText: '深夜の指標' }));
      // 23:00 の行の上端 + 1時間（closed の 1時間の高さ）＝ 24:00 の線。バー上端から 8
      const hh = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tl[data-pane=closed]')).getPropertyValue('--hh')));
      near(e.y + hh, tabs.y - 8, 1.5, `24:00 の線 ${e.y + hh} / バー上端 ${tabs.y}`);
      expect(e.b, '23:00 の予定の下端がバーの上').toBeLessThanOrEqual(tabs.y - 8);
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tlev')?.textContent ?? null, [cx, cy]);
      expect(hit, '予定の中心を押すとその予定に当たる').toContain('深夜の指標');
    });
  }
});

test.describe('N-03 開いた横：シートを開いている間、右ページの見出しと両方の .pgsw を 0.25s で消す', () => {
  test('予定の編集（ダイヤルの面も）で opacity 0・押せない、閉じたら戻る', async ({ page }) => {
    await openApp(page, L, '', { motion: true }); await band(page, 84);
    const st = () => page.evaluate(() => { const g = (s) => [...document.querySelectorAll(s)].map((e) => { const c = getComputedStyle(e); return { o: c.opacity, v: c.visibility, d: c.transitionDuration, f: c.transitionTimingFunction }; }); return { head: g('.page.rp .rhead')[0], sw: g('.pgsw') }; });
    const s0 = await st(); expect(s0.head.o).toBe('1'); expect(s0.sw.length).toBe(2);
    await page.locator('[data-act="add"]:visible').first().click(); await page.locator('#editor').waitFor(); await page.waitForTimeout(450);
    const s1 = await st();
    expect(s1.head.o).toBe('0'); expect(s1.head.v).toBe('hidden');
    for (const s of s1.sw) { expect(s.o).toBe('0'); expect(s.v).toBe('hidden'); }
    expect(s1.head.d.split(',')[0].trim()).toBe('0.25s'); expect(s1.head.f).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    // 押せない：右ページの見出しの上を押しても何も起きず、読み上げツリーにも出ない（visibility:hidden）
    expect(await page.evaluate(() => document.querySelectorAll('.pgsw button').length && [...document.querySelectorAll('.pgsw button')].every((b) => getComputedStyle(b).visibility === 'hidden'))).toBe(true);
    // ダイヤルの面を開いても消えたまま
    await page.locator('#f-stime').click(); await page.waitForTimeout(450);
    expect((await st()).sw.every((s) => s.o === '0')).toBe(true);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.locator('#editor .xbtn, #editor [data-act="close"], #editor [data-act="cancel"]').first().click({ timeout: 2000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForFunction(() => !document.querySelector('dialog#editor[open]'));
    await page.waitForTimeout(450);
    const s2 = await st(); expect(s2.head.o).toBe('1'); expect(s2.head.v).toBe('visible'); for (const s of s2.sw) { expect(s.o).toBe('1'); expect(s.v).toBe('visible'); }
  });
  test('reduced motion は 0.15s のフェード', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openApp(page, L, '', { motion: true }); await band(page, 84);
    await page.locator('[data-act="add"]:visible').first().click(); await page.locator('#editor').waitFor(); await page.waitForTimeout(300);
    const d = await page.evaluate(() => { const e = document.querySelector('.pgsw'); const c = getComputedStyle(e); return [c.transitionDuration, c.opacity]; });
    expect(d[0].split(',')[0].trim()).toBe('0.15s'); expect(d[1]).toBe('0');
  });
});

test.describe('N-04 月の日の一覧の予定名 15/400', () => {
  for (const [name, size, sar] of [['閉じた月', C, 84], ['開いた縦の月', P, 0]]) {
    test(name, async ({ page }) => {
      await openApp(page, size); if (sar) await band(page, sar);
      await seed(page, [ev('a', '朝会', '2026-11-12T09:00', '2026-11-12T09:30')]); if (sar) await band(page, sar);
      await tab(page, '月').click().catch(() => {}); await page.waitForTimeout(500);
      await page.locator('[data-mday="list"]:visible').first().click().catch(() => {}); await page.waitForTimeout(300);
      const cs = await page.locator('.mdev strong').first().evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight]; });
      expect(cs).toEqual(['15px', '400']);
    });
  }
});

test.describe('N-05 選んだ今日のマス：+N は右 4、ノートの印は白 8×2 で丸の中', () => {
  for (const [name, size, sar, open] of [['閉じた月', C, 84, false], ['開いた横の月', L, 84, true]]) {
    test(name, async ({ page }) => {
      await openApp(page, size); if (sar) await band(page, sar);
      const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => ev(k, `予定${k}`, `2026-11-12T${String(8 + i).padStart(2, '0')}:00`, `2026-11-12T${String(8 + i).padStart(2, '0')}:30`));
      await page.evaluate(async (list) => { const db = await import('/js/db.js'); await db.putMany(list); await db.putNote({ id: 'dn', body: '今日のノート', createdAt: 1, updatedAt: 2, folderId: null, date: '2026-11-12' }); }, many);
      await page.reload(); await page.waitForSelector('html[data-ready]'); if (sar) await band(page, sar);
      if (open) { await pagePick(page, 'left', '月').click().catch(() => {}); } else { await tab(page, '月').click(); }
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const d = [...document.querySelectorAll('.week .day.today.selected')].find((e) => e.offsetParent); if (!d) return null;
        const c = d.getBoundingClientRect(), pl = d.parentElement.querySelector(`.plus[data-plus="${d.dataset.date}"]`);
        const ml = d.querySelector('.mline'), num = d.querySelector('.num').getBoundingClientRect();
        const out = { cellR: c.right, num: [num.left - c.left, num.top - c.top, num.right - c.left, num.bottom - c.top] };
        if (pl) { const g = document.createRange(); g.selectNodeContents(pl); out.plusR = g.getBoundingClientRect().right; }
        if (ml) { const m = ml.getBoundingClientRect(); const cs = getComputedStyle(ml); out.ml = [m.left - c.left, m.top - c.top, m.width, m.height, cs.backgroundColor]; }
        return out;
      });
      expect(r, '選んだ今日のマスがある').not.toBeNull();
      if (r.plusR != null) near(r.cellR - r.plusR, 4, 1, '+N の右');
      expect(r.ml, 'ノートの印がある').toBeTruthy();
      expect(r.ml[4]).toBe('rgb(255, 255, 255)'); near(r.ml[2], 8, 0.5); near(r.ml[3], 2, 0.5);
      // 丸（今日の数字）の中：印の矩形が丸 [3..19]×[2..18] に収まる
      expect(r.ml[0]).toBeGreaterThanOrEqual(r.num[0]); expect(r.ml[0] + r.ml[2]).toBeLessThanOrEqual(r.num[2]);
      expect(r.ml[1]).toBeGreaterThanOrEqual(r.num[1]); expect(r.ml[1] + r.ml[3]).toBeLessThanOrEqual(r.num[3]);
    });
  }
});

test('N-06 ダイヤルの面の縁：クリップの矩形が左・上・下だけ 1 広い', async ({ page }) => {
  await openApp(page, L); await band(page, 84);
  await page.locator('[data-act="add"]:visible').first().click(); await page.locator('#editor').waitFor();
  await page.locator('#f-stime').click(); await page.waitForTimeout(450);
  const r = await page.evaluate(() => {
    const d = document.querySelector('dialog#editor'), pop = document.querySelector('#editor .tpop.face'); const e = d.getBoundingClientRect(), f = pop.getBoundingClientRect();
    const v = (n) => parseFloat(d.style.getPropertyValue(n));
    return { l: v('--tf-l') - (f.left - e.left), t: v('--tf-t') - (f.top - e.top), b: v('--tf-b') - (f.bottom - e.top), r: v('--tf-r') - (f.right - e.left) };
  });
  near(r.l, -1, 0.5, '左'); near(r.t, -1, 0.5, '上'); near(r.b, 1, 0.5, '下'); near(r.r, 0, 0.5, '右（折り目の側）は 0');
});

test('N-07 開いた横ホームの小さな時間軸の時刻 span.hh は 11/400・行 14', async ({ page }) => {
  await openApp(page, L); await band(page, 84);
  await pagePick(page, 'right', 'ホーム').click(); await page.waitForTimeout(250);
  const cs = await page.locator('.haxis .hh').first().evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.lineHeight]; });
  expect(cs).toEqual(['11px', '400', '14px']);
});

test('N-08 開いた縦のタスクの型の見出しは「今日 · 11月12日（木）」の書き方', async ({ page }) => {
  await openApp(page, P);
  await page.evaluate(async () => { const db = await import('/js/db.js'); await db.putTask({ id: 'tt', title: '今日のタスク', due: { date: '2026-11-12' }, done: false, doneAt: null, createdAt: 1, updatedAt: 2, order: 1, note: '', notify: false }); });
  await page.reload(); await page.waitForSelector('html[data-ready]');
  await page.getByRole('button', { name: 'タスク', exact: true }).first().click(); await page.waitForTimeout(500);
  const heads = await page.locator('.rmh, .rmsec h3').allInnerTexts();
  expect(heads.some((h) => /^今日 · 11月12日（木）$/.test(h.trim())), heads.join('|')).toBe(true);
});

test.describe('連携の低 L-1・L-2／企画の低（題名欄の記号。IndexedDB の生の文字で確かめる）', () => {
  const open = async (page, body) => {
    await openApp(page, C); await band(page, 84);
    await page.evaluate(async (b) => { const db = await import('/js/db.js'); await db.putNote({ id: 'n1', body: b, createdAt: 1, updatedAt: 5, folderId: null }); }, body);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await band(page, 84);
    await page.locator('[data-act="strip"][data-strip="memo"]').first().click(); await page.locator('.mrow[data-nrow]').first().waitFor();
    await page.locator('.mrow[data-nrow="n1"]').first().click(); await page.locator('.ned-title:visible').first().waitFor();
  };
  const raw = (page) => page.evaluate(async () => (await (await import('/js/db.js')).getNote('n1')).body);
  const done = async (page) => { await page.locator('.ned-done:visible').first().click(); await page.waitForTimeout(500); };

  test('題名欄に触らず本文だけ直したノートは、題名の行を 1 文字も変えない（空の見出し「# 」も）', async ({ page }) => {
    await open(page, '# \n本文');
    const body = page.locator('.ned-body:visible, .ned-bodywrap:visible').first();
    await body.click(); await page.keyboard.type('X'); await page.waitForTimeout(300); await done(page);
    expect((await raw(page)).split('\n')[0]).toBe('# ');
  });
  test('L-1 題名欄を空にすると本文に「# 」だけが残らない', async ({ page }) => {
    await open(page, '# 今週のメモ\n本文の一行');
    const t = page.locator('.ned-title:visible').first(); await t.click(); await t.fill(''); await page.waitForTimeout(200); await done(page);
    const b = await raw(page); expect(b.split('\n')[0]).toBe(''); expect(b).toContain('本文の一行'); expect(b).not.toMatch(/^# *$/m);
  });
  test('L-2 見出しのノートの題名欄に「# x」と打っても「# # x」にならない', async ({ page }) => {
    await open(page, '# 今週のメモ\n本文の一行');
    const t = page.locator('.ned-title:visible').first(); await t.click(); await t.fill('# x'); await page.waitForTimeout(200); await done(page);
    expect((await raw(page)).split('\n')[0]).toBe('# x');
  });
  test('題名欄を普通に書き換えると元の記号を保つ', async ({ page }) => {
    await open(page, '## 今週のメモ\n本文の一行');
    const t = page.locator('.ned-title:visible').first(); await t.click(); await t.fill('来週のメモ'); await page.waitForTimeout(200); await done(page);
    expect((await raw(page)).split('\n')[0]).toBe('## 来週のメモ');
  });
  test('企画の低：記号つきの複数行を貼った直後から、題名欄に記号は出ない。保存の文字は元の記号を保つ', async ({ page }) => {
    await open(page, '無題のメモ\n本文');
    const t = page.locator('.ned-title:visible').first(); await t.click();
    await t.evaluate((el) => { el.value = '# 貼った題\n- 項目ア\n- [ ] チェック'; el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' })); });
    await page.waitForTimeout(200);
    expect(await t.inputValue()).toBe('貼った題');
    await done(page);
    expect((await raw(page)).startsWith('# 貼った題\n- 項目ア\n- [ ] チェック')).toBe(true);
  });
  test('見出しのノートに「# 題」を貼っても「# # 題」にならない', async ({ page }) => {
    await open(page, '# 今週のメモ\n本文');
    const t = page.locator('.ned-title:visible').first(); await t.click();
    await t.evaluate((el) => { el.value = '# 貼った題\n- 項目'; el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' })); });
    await page.waitForTimeout(200);
    expect(await t.inputValue()).toBe('貼った題'); await done(page);
    expect((await raw(page)).split('\n')[0]).toBe('# 貼った題');
  });
});

test.describe('★1-10（品質・設計 2026-11-20 4:05）閉じたホームの「＋ タスクを追加」はカードの見出しのすぐ下', () => {
  test('最初の画面で行全体（44・x12〜374）が見えて押せる／行は 44 ずつ／送り切りで最後の行がバー上端から 8 以上', async ({ page }) => {
    await openApp(page, C); await band(page, 84);
    await seedTasks(page, ['h1', 'h2', 'h3'].map((k) => T(k, { title: `タスク${k}`, due: { date: '2026-11-12' } })));
    await band(page, 84); await page.waitForTimeout(300);
    const add = await boxOf(page.locator('.htasks .hadd')), tabs = await boxOf(page.locator('.tabs'));
    near(add.h, 44, 0.6); near(add.x, 12, 1); near(add.r, 374, 1);
    expect(add.b, '最初の画面で行の下端がバー上端より 8 以上上').toBeLessThanOrEqual(tabs.y - 8);
    const hh3 = await boxOf(page.locator('.htasks .hh3')); near(add.y, hh3.b, 1, '見出しのすぐ下');
    const rows = await page.locator('.htasks .htask').evaluateAll((l) => l.map((e) => e.getBoundingClientRect().height));
    for (const h of rows) near(h, 44, 0.6, '行の高さ');
    // 押すとタブではなく追加の欄が開く（中心を押す）
    const cx = add.x + add.w / 2, cy = add.y + add.h / 2;
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.hadd'), [cx, cy])).toBe(true);
    // 「＋」の列と文字の x（チェック欄と同じ列・タスク名と同じ x）、15/400 緑
    const g = await page.evaluate(() => { const a = document.querySelector('.htasks .hadd'); const t = document.createRange(); t.selectNodeContents(a.querySelector('.hadd-t')); const r = document.querySelector('.htasks .htask .htt'); const q = document.createRange(); q.selectNodeContents(r); const c = getComputedStyle(a); return { tx: t.getBoundingClientRect().left, rx: q.getBoundingClientRect().left, fs: c.fontSize, fw: c.fontWeight, col: c.color }; });
    near(g.tx, g.rx, 1, '文字の x がタスク名と同じ'); expect([g.fs, g.fw, g.col]).toEqual(['15px', '400', 'rgb(41, 78, 66)']);
    // 送り切り
    await page.locator('.home.listview').evaluate((e) => { const s = [e, ...e.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 2 && getComputedStyle(x).overflowY !== 'visible'); (s || e).scrollTop = 99999; });
    await page.waitForTimeout(250);
    const last = await page.locator('.hcards > *').last().evaluate((e) => e.getBoundingClientRect().bottom);
    expect(last, '送り切りで最後のカードの下端がバー上端から 8 以上').toBeLessThanOrEqual(tabs.y - 8 + 0.5);
  });
  test('0 件のときは追加の行だけ。カードの下端 522（実機 678 の y）', async ({ page }) => {
    await openApp(page, C); await band(page, 84);
    await seedTasks(page, []); await band(page, 84); await page.waitForTimeout(300);
    const c = await boxOf(page.locator('.htasks'));
    if (await page.locator('.htasks .hadd').count()) { expect(await page.locator('.htasks .htask').count()).toBe(0); near(c.b - c.y, 522 - 432, 5, 'カードの高さ（設計 y432〜522。実測は見出し 28＋追加 44＋上下の余白 22）'); }
  });
  test('押した見た目：押している間 opacity .5', async ({ page }) => {
    await openApp(page, C); await band(page, 84);
    await seedTasks(page, [T('h1', { title: 'タスク', due: { date: '2026-11-12' } })]); await band(page, 84); await page.waitForTimeout(300);
    const a = await boxOf(page.locator('.htasks .hadd')); await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2); await page.mouse.down(); await page.waitForTimeout(220);
    expect(await page.locator('.htasks .hadd').evaluate((e) => getComputedStyle(e).opacity)).toBe('0.5'); await page.mouse.up();
  });
});

test('品質の低：月のマスの読み上げに時刻（「9:00 朝会」）が入る。終日は付けない', async ({ page }) => {
  await openApp(page, C); await band(page, 84);
  await seed(page, [ev('a', '朝会', '2026-11-12T09:00', '2026-11-12T09:30'), ev('b', '研修', '2026-11-12', '2026-11-12', { all: true })]); await band(page, 84);
  await tab(page, '月').click(); await page.waitForTimeout(400);
  const l = await page.locator('.calendar .day[data-date="2026-11-12"]').first().getAttribute('aria-label');
  expect(l).toContain('9:00 朝会'); expect(l).toContain('研修'); expect(l).not.toMatch(/0:00 研修|終日 研修/);
});
