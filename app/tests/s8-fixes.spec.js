// 第19.1版 S8（d6840a3 の再レビューの直し）。設計 design/review/2026-11-20-v191-d6840a3-visual-review.md の N-01〜N-09、企画 research/review-v19-1-d6840a3-usability-2026-11-20.md の低、
// 連携 data/連携_レビュー_d6840a3.md の低 L-1・L-2。寸法は getBoundingClientRect で ±1。時計は helpers の 2026-11-12 9:41（実機の確認は 11-19 で別に撮る）。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, ev, seed, tab, pagePick, openNoteList } from './helpers.js';
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
    // S9 品質: 箱と見出しの矩形を 1 回の evaluate で原子的に読み、期待値（箱 485.5±0.6・見出し 501.5±1・幅>0）に落ち着くまで待つ。
    // 読みと判定を分けると並列負荷下で dpage の再描画の x≈0 を拾うため、判定ごと原子化する（期待値は弱めない。失敗時は最後に見えた値を出す）。
    await expect.poll(async () => page.evaluate(() => {
      const rp = document.querySelector('.dpage.rp');
      const h = document.querySelector('.dpage.rp .hdt');
      if (!rp || !h) return 'まだ無い';
      const br = rp.getBoundingClientRect(), bh = h.getBoundingClientRect();
      const ok = br.width > 0 && bh.width > 0 && Math.abs(br.x - 485.5) <= 0.6 && Math.abs(bh.x - 501.5) <= 1;
      return ok ? 'OK' : `箱x=${br.x.toFixed(1)}/485.5 見出しx=${bh.x.toFixed(1)}/501.5 箱幅=${br.width.toFixed(1)} 見出し幅=${bh.width.toFixed(1)}`;
    }), { timeout: 8000 }).toBe('OK');
  });
  test('折り目の保護域（中心 475.5±10）に右ページの何も入らない', async ({ page }) => {
    await setup(page);
    for (const name of ['ホーム', '時間', 'タスク', 'ノート', '月']) {
      await pagePick(page, 'right', name).click();
      // S9 品質: 描き終わり（右ページの見出しが幅>0）を待つ。固定の待ちはしない
      await expect.poll(() => page.evaluate(() => { const h = document.querySelector('.page.rp .rhead h2, .page.rp .shead h2, .page.rp h2'); return !!h && h.getBoundingClientRect().width > 0; })).toBe(true);
      // S9 品質: 保護域に入る要素を expect.poll で確かめ、再描画の一瞬の誤検出を無視して「ずっと 0 件」を要求する（弱めない）
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.page.rp *')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.visibility !== 'hidden' && r.left < 485.4 && r.right > 465.6; }).map((e) => e.className || e.tagName).slice(0, 5)), { timeout: 5000 }).toEqual([]);
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
      if (name === '日') {
        // 第19.2版 S11e（design/34 §15-④）・S11f（§16-1）: 閉じた画面の「日」はカレンダーの日の欄の時間軸 B。日の欄（.mday）が1本で送られ、時間軸の下につまみ（下）・「ノート ›」・ノートが続く。
        // N-02 の趣旨（最後の時間がバーに隠れず、23:00 の予定が見えて押せる）を、この形で見る: 23:00 の予定と 24:00 の線を、貼り付いたつまみ（y593〜637）の上まで送れる。送り切ったとき、最後の中身はバー（y645）の 8 上
        const md = page.locator('.mpull.browse .mday'); await expect(md).toHaveAttribute('data-dg', 'B');
        const hh = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.mday .tl')).getPropertyValue('--hh')));
        // v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦は日の欄の中ではなく画面（.mpull.browse）の1本を送る（前: .mday.scrollTop → 後: .mpull.browse.scrollTop。最後の中身は .mdin の子で見る）。見ること（24:00 の線・23:00 の予定・送り切りの下端）は同じ
        await page.locator('.mday .tlev', { hasText: '深夜の指標' }).evaluate((e, hh) => { const md = e.closest('.mpull.browse'); md.scrollTop += e.getBoundingClientRect().top + hh - 580; }, hh); await page.waitForTimeout(300);
        const e = await boxOf(page.locator('.mday .tlev', { hasText: '深夜の指標' })), g = await boxOf(page.locator('.mday .mdnl')); // v19.3 征希さん『カード・時間で分けるだけ』で仕様変更: つまみ（下）は時間軸の下に無い（時間のバーは見出しのすぐ下）。時間軸のすぐ下は「ノート ›」（前: .mdgrab → 後: .mdnl）
        // v19.3: 開いたときは最初の予定（23:00）の1時間前から始まる（畳む）ので、24:00 の線は送らなくても見えている（y318。前は日の欄の中を送って y580 に合わせた）。580 より下（つまみの裏）にないことを見る
        expect(e.y + hh, `24:00 の線 ${e.y + hh} は 580 以下`).toBeLessThanOrEqual(580 + 1.5); expect(e.y, '23:00 の予定は年月と曜日（y64）より下').toBeGreaterThanOrEqual(64);
        expect(e.y + hh, '24:00 の線が「ノート ›」の上').toBeLessThanOrEqual(g.y);
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.tlev')?.textContent ?? null, [e.x + e.w / 2, e.y + e.h / 2]);
        expect(hit, '予定の中心を押すとその予定に当たる').toContain('深夜の指標');
        await md.evaluate((m) => { const s = m.closest('.mpull.browse'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(300);
        const last = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.mday > .mdin > *')].map((x) => x.getBoundingClientRect().bottom)));
        expect(last, `送り切ったときの最後の中身の下端 ${last} はバー上端 645 の 8 上まで`).toBeLessThanOrEqual(645 - 8 + 1); // v19.3: 23:00 からだけ見せる日は中身が短く、日の欄の最小の高さ（格子を流し切るための 画面−88）の中で上に寄る（前は ≈637）。バーに隠れないことを見る
        return;
      }
      const tl = page.locator('.tl[data-pane=closed]').first();
      await tl.evaluate((t) => { t.scrollTop = t.scrollHeight; }); await page.waitForTimeout(300);
      await expect(page.locator('.tabs')).toHaveCount(0);
      const tabs = { y: 678 - 33 } /* バー＝ホームバーの帯（上端 y645）。下のタブは design/34 §9.1-9 で廃止、下の余白は 87 → 41（帯 33＋8） */;
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
      if (size !== C) { await page.locator('[data-mday="list"]:visible').first().click().catch(() => {}); await page.waitForTimeout(300); } // 閉じた7段には「予定｜時間軸」の切り替えがない（S11b）
      if (size === C) { // 第19.2版 S11b（34 §6.1）: 閉じた日の欄のカードの題名は 15/600
        expect(await page.locator('.mdcard strong').first().evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight]; })).toEqual(['15px', '600']); return;
      }
      const cs = await page.locator('.mdev strong').first().evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight]; });
      expect(cs).toEqual(['15px', '400']);
    });
  }
});

test.describe('N-05/Q1 選んだ今日のマス：+N は右 4、ノートの印は白 8×1.5 角丸1 で丸の中', () => {
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
        if (ml) { const m = ml.getBoundingClientRect(); const cs = getComputedStyle(ml); out.ml = [m.left - c.left, m.top - c.top, m.width, m.height, cs.backgroundColor, cs.borderTopLeftRadius]; }
        return out;
      });
      expect(r, '選んだ今日のマスがある').not.toBeNull();
      if (r.plusR != null) near(r.cellR - r.plusR, 4, 1, '+N の右');
      expect(r.ml, 'ノートの印がある').toBeTruthy();
      expect(r.ml[4]).toBe('rgb(255, 255, 255)'); near(r.ml[2], 8, 0.5); near(r.ml[3], 1.5, 0.1);
      // Q1（設計 fc56bc9）: 閉じ・横は x+7〜15・y+15〜16.5
      near(r.ml[0], open ? 7 : 9, 0.6, '印の x'); near(r.ml[1], 15, 0.6, '印の y'); expect(r.ml[5]).toBe('1px'); // 第19.2版 S11b: 閉じた月は今日の丸が中央 (x+13, y+11) になり、印も丸の中央 x+9〜17
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
    await openNoteList(page); await page.locator('.mrow[data-nrow]').first().waitFor();
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
    const add = await boxOf(page.locator('.htasks .hadd')), tabs = { y: 678 - 33 } /* バー＝ホームバーの帯（上端 y645）。下のタブは design/34 §9.1-9 で廃止、下の余白は 87 → 41（帯 33＋8） */;
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
    if (await page.locator('.htasks .hadd').count()) { expect(await page.locator('.htasks .htask').count()).toBe(0); near(c.b - c.y, 94, 1, 'カードの高さ 94（設計 fc56bc9 レビュー Q3 で受け入れ。見出し 28＋追加 44＋上下の余白 22。旧 90）'); }
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

// ===== S9（設計 fc56bc9 レビュー Q1・Q2・L-01）=====
async function seedMany(page, size, sar) {
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => ev(k, `予定${k}`, `2026-11-12T${String(8 + i).padStart(2, '0')}:00`, `2026-11-12T${String(8 + i).padStart(2, '0')}:30`));
  await page.evaluate(async (list) => { const db = await import('/js/db.js'); await db.putMany(list); await db.putNote({ id: 'dn', body: '今日のノート', createdAt: 1, updatedAt: 2, folderId: null, date: '2026-11-12' }); }, many);
  await page.reload(); await page.waitForSelector('html[data-ready]'); if (sar) await band(page, sar);
}
test('Q1 開いた縦：今日のマスのノートの印は x+9〜17・y+16〜17.5（白 8×1.5 角丸1）', async ({ page }) => {
  await openApp(page, P); await seedMany(page, P, 0);
  await tab(page, '月').click().catch(() => {}); await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const d = [...document.querySelectorAll('.week .day.today')].find((e) => e.offsetParent); if (!d) return null;
    const ml = d.querySelector('.mline'); if (!ml) return null; const c = d.getBoundingClientRect(), m = ml.getBoundingClientRect(), cs = getComputedStyle(ml);
    return [m.left - c.left, m.top - c.top, m.width, m.height, cs.borderTopLeftRadius];
  });
  expect(r, '印がある').toBeTruthy();
  near(r[0], 9, 0.6, 'x'); near(r[1], 16, 0.6, 'y'); near(r[2], 8, 0.1); near(r[3], 1.5, 0.1); expect(r[4]).toBe('1px');
});
test('Q2 閉じた月：+N のある選んだマスだけ六曜を隠す。+N 右あき 4。非選択マスは出す。開いた横は出す', async ({ page }) => {
  for (const [size, sar, open] of [[C, 84, false], [L, 84, true]]) {
    await openApp(page, size); if (sar) await band(page, sar); await seedMany(page, size, sar);
    if (open) { await pagePick(page, 'left', '月').click().catch(() => {}); } else { await tab(page, '月').click(); }
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const days = [...document.querySelectorAll('.week .day')].filter((e) => e.offsetParent);
      const vis = (d) => { const k = d.querySelector('.rk'); return k ? getComputedStyle(k).visibility : 'none'; };
      const sel = days.find((d) => d.classList.contains('selected') && d.classList.contains('today'));
      const others = days.filter((d) => !d.classList.contains('selected')).map(vis);
      const hasPlus = !!sel?.parentElement.querySelector(`.plus[data-plus="${sel.dataset.date}"]`);
      return { selRk: sel ? vis(sel) : null, hasPlus, others };
    });
    expect(r.hasPlus, '+N が出ている').toBe(true);
    expect(r.selRk, open ? '開いた横は六曜を出す' : '閉じた月は隠す').toBe(open ? 'visible' : 'hidden');
    expect(r.others.every((v) => v === 'visible'), '非選択マスの六曜は出す').toBe(true);
  }
});
test('L-01 開いた横ホームのミニタイムライン：.hbarev span は 11/400・行 12', async ({ page }) => {
  await openApp(page, L); await band(page, 84);
  await page.evaluate(async (e) => { const db = await import('/js/db.js'); await db.putMany([e]); }, ev('m1', '会議', '2026-11-12T10:00', '2026-11-12T11:00'));
  await page.reload(); await page.waitForSelector('html[data-ready]'); await band(page, 84);
  await pagePick(page, 'right', 'ホーム').click(); await page.waitForTimeout(250);
  const cs = await page.locator('.hbarev span').first().evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.lineHeight, e.getBoundingClientRect().height]; });
  expect(cs.slice(0, 3)).toEqual(['11px', '400', '12px']);
});
