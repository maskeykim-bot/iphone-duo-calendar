// 第19.3版 その2 A（征希さん「閉じた時の表示は『カード・時間』で分けるだけ。時間の幅は最低限で表示し、スワイプバーで詳細まで見れるように広く」）の試験（実装担当）。
// Chromium と WebKit の両方。design/35 §9 の S-1〜S-9・L-1 は tests/v193-design35-s9.spec.js。ここはそのほかの決まり（保存・たたく・キー・払い・帯なし・閉じた横・ヒント・動きを減らす・その1の決まり）。
import { test, expect } from '@playwright/test';
import { SIZES, seed, ev } from './helpers.js';
import { boot, DAY, EMPTY, SEC, stageOf, haptics, ui, scTop, setScroll, rect, hourGap, lineY, toTime, toCard, barPt, mouseDrag, touchDrag, near, hhAfter } from './v193-p2-lib.js';
// v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 1時間の高さは 28／88 → 14（詰めた形）／56（広げた形）、寄る境は 58 → 35。つまみ（バー）は見出しの下 → 時間軸の下で、引いた量だけ時間軸が伸びる（指に 1:1）。
// 畳むのは「最初の予定の1時間前より上」→「9:00（早い予定があればその時刻）より前と、18:00（遅い予定があればその終わり）の1時間後より後」。開く文言は「前の時間」→「すべての時間」。
// v19.5 その2（征希さん「設定で決めた1日（8:00-22:00）で表示」「好きな位置で止められるように」）で仕様変更: 見せるのは 8:00〜22:00（外に予定がある日はその予定まで）。つまみは離した所で止まる（14〜56 の好きな高さ。寄せ・払いはやめた）。dayGrip は 35 を境に 1／2 を書く（保存の形は同じ）。高さそのものは duo.ui.v1 の dayHh
// DATA（30分の予定 5 本・9:00〜13:30）の見えている時間軸の高さは 220＋11.5×（1時間の高さ）。下へ 300 引くと 1時間 40.1、60 で 19.2

const dg = (page) => page.locator('.mday').getAttribute('data-dg');

test('A-1 保存の形は v19.2 のまま: dayGrip は 0（カード）・1（時間・最低限）・2（時間・詳細）の整数。duo.ui.v1 に足した項目なし', async ({ page }) => {
  await boot(page);
  await toTime(page); await toCard(page); // 1回保存させてから項目を控える
  const keys0 = Object.keys(await ui(page)).sort();
  expect(keys0).toContain('dayGrip');
  await toTime(page); expect((await ui(page)).dayGrip).toBe(1); expect(await dg(page)).toBe('B');
  const p = await barPt(page); await mouseDrag(page, p.x, p.y, p.x, p.y + 300, { hold: 150 });
  expect((await ui(page)).dayGrip).toBe(2); expect(await dg(page)).toBe('C');
  await toCard(page); expect((await ui(page)).dayGrip).toBe(0); expect(await dg(page)).toBe('A');
  expect(Object.keys(await ui(page)).filter((k) => k !== 'dayHh').sort()).toEqual(keys0.filter((k) => k !== 'dayHh')); // dayHh（1時間の高さ）は「時間」にした後だけ書く
});

test('A-2 古い保存値: 1 は「時間・最低限」（1時間 14）、2 は「詳細」（56）、0〜2 でない値はカード', async ({ page }) => {
  await boot(page, { dg: 1 });
  expect(await dg(page)).toBe('B'); expect(near(await hourGap(page), 14, 0.5)).toBe(true);
  await expect(page.locator('.mday .mdct [data-dg="time"]')).toHaveAttribute('aria-pressed', 'true');
  for (const [v, want] of [[2, 'C'], [5, 'A'], ['1', 'A'], [-1, 'A'], [1.5, 'A']]) {
    await page.evaluate((x) => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.dayGrip = x; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); }, v);
    await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(250);
    expect(await dg(page)).toBe(want);
  }
});

test('A-3 「時間」は最後に見ていた幅で開く（この起動の間）。カードに戻すとバーが消える', async ({ page }) => {
  await boot(page, { dg: 2 });
  await toCard(page); await expect(page.locator('.mday .mdgrab')).toHaveCount(0);
  await toTime(page); expect(await dg(page)).toBe('C'); expect(near(await hourGap(page), 56, 0.5)).toBe(true);
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
  await toCard(page); await toTime(page);
  expect(await dg(page)).toBe('B'); expect(near(await hourGap(page), 14, 0.5)).toBe(true);
});

test('A-4 切り替えの動き: 前を消してから次を出す（0.20 秒・見出しと切り替えは動かさない）。動きを減らす設定では 0.15 秒のフェード', async ({ page }) => {
  await boot(page);
  await page.locator('.mday .mdct [data-dg="time"]').click();
  const a = await page.evaluate(() => [...document.querySelectorAll('.mday .mdin > *')].map((k) => ({ c: k.className.split(' ')[0], n: k.getAnimations().map((x) => x.effect.getTiming().duration) })));
  expect(a.find((x) => x.c === 'mdh').n).toEqual([]);
  expect(a.find((x) => x.c === 'mdbody').n).toEqual([200]);
  expect(a.find((x) => x.c === 'mdgrab').n).toEqual([200]);
  await page.waitForTimeout(300);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.mday .mdct [data-dg="card"]').click();
  const b = await page.evaluate(() => document.querySelector('.mday .mdbody').getAnimations().map((x) => x.effect.getTiming().duration));
  expect(b).toEqual([150]);
});

test('A-5 バーをたたくと 14 ⇄ 56（0.25 秒）。キー ↑↓ でも。読み上げは「時間の幅」「最低限／詳細」', async ({ page }) => {
  await boot(page, { dg: 1 });
  const g = page.locator('.mday .mdgrab');
  await expect(g).toHaveAttribute('role', 'slider'); await expect(g).toHaveAttribute('aria-valuetext', '最低限');
  expect(await g.getAttribute('aria-label')).toContain('時間の幅');
  let p = await barPt(page);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(120);
  const mid = await hourGap(page); expect(mid > 14 && mid < 56).toBe(true);
  await page.waitForTimeout(350);
  expect(near(await hourGap(page), 56, 0.5)).toBe(true); expect((await ui(page)).dayGrip).toBe(2);
  await expect(page.locator('.mday .mdgrab')).toHaveAttribute('aria-valuetext', '詳細');
  p = await barPt(page); await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  expect(near(await hourGap(page), 14, 0.5)).toBe(true); expect((await ui(page)).dayGrip).toBe(1);
  await page.locator('.mday .mdgrab').focus();
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  expect((await ui(page)).dayGrip).toBe(2); expect(await page.evaluate(() => document.activeElement?.className)).toContain('mdgrab');
  await page.keyboard.press('ArrowDown'); expect((await ui(page)).dayGrip).toBe(2);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  expect((await ui(page)).dayGrip).toBe(1);
  await page.keyboard.press('ArrowUp'); expect((await ui(page)).dayGrip).toBe(1); // 上へ送ってもカードにはならない（カードは切り替えで）
  expect(await dg(page)).toBe('B');
});

test('A-6 押せる範囲は全幅×44（区域 24 の上下に 10 ずつ）。上へ引いても 14 より縮まずカードにもならない（ゴム 最大 24 で戻る）', async ({ page }) => {
  await boot(page, { dg: 1 });
  await barPt(page); // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: つまみは時間軸の下（画面の中へ送ってから測る）
  const bar = await rect(page, '.mday .mdgrab');
  for (const [x, y] of [[20, bar.y - 8], [250, bar.b + 8], [190, bar.y + 12]]) { // v19.5: 行の右端（x290 より右）は「すべての時間」が上にある
    const hit = await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.mdgrab'), [x, y]);
    expect(hit, `(${x},${y})`).toBe(true);
  }
  // 切り替え（見出しの右）は、バーの押せる範囲より上（たたけば切り替わる）
  const sw = await rect(page, '.mday .mdct');
  expect(await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.mdct'), [sw.x + 20, sw.b + 4])).toBe(true);
  const p = await barPt(page), y0 = await lineY(page, 540), b0 = await rect(page, '.mday .mdgrab');
  await mouseDrag(page, p.x, p.y, p.x, p.y - 100, { up: false, hold: 150 });
  expect(near(await hourGap(page), 14, 0.5)).toBe(true);
  expect(near(b0.y - (await rect(page, '.mday .mdgrab')).y, 24)).toBe(true); // ゴムで動くのは、つまみとその下の区画（時間軸の上端は動かない）
  expect(near(await lineY(page, 540), y0)).toBe(true);
  await page.mouse.up(); await page.waitForTimeout(450);
  expect(near((await rect(page, '.mday .mdgrab')).y, b0.y)).toBe(true);
  expect(await dg(page)).toBe('B'); expect((await ui(page)).dayGrip).toBe(1);
  expect(await haptics(page)).toEqual([]);
});

test('A-7 速く払っても離した所で止まる: 下へ 30 を速く払うと 1時間 16.6、そこから上へ 30 を速く払うと 14', async ({ page }) => {
  // v19.5 その2（征希さん「設定で決めた1日（8:00-22:00）で表示」「好きな位置で止められるように」）で仕様変更: 前は「速く払うと払った向きの端へ」
  await boot(page, { dg: 1 });
  let p = await barPt(page);
  await touchDrag(page, p.x, p.y, p.x, p.y + 30, { steps: 3 });
  expect((await ui(page)).dayGrip).toBe(1); expect(near(await hourGap(page), 14 + 30 / 11.5, 0.5)).toBe(true);
  p = await barPt(page);
  await touchDrag(page, p.x, p.y, p.x, p.y - 30, { steps: 3 });
  expect((await ui(page)).dayGrip).toBe(1); expect(near(await hourGap(page), 14, 0.5)).toBe(true);
});

test('A-8 予定は白いカード（始まり・終わり・色の線・題名）。詰めた形（14）でもカードは 44 より低くならず、字がはみ出さない。広げた形（56）は長さどおり', async ({ page }) => {
  // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 枠は「色の地＋題名1行（詳細は題名の下に時刻）」→ 白いカード（始まり・終わりの時刻は左に2行。カードの表示と同じ並び）。カードが 44 より低くなる時間だけ、その時間を広げる
  await boot(page, { dg: 1, data: [ev('h1', '一時間の予定', `${DAY}T13:00`, `${DAY}T14:00`), ev('h2', '打ち合わせ', `${DAY}T15:00`, `${DAY}T16:30`)] });
  const read = () => page.evaluate(() => [...document.querySelectorAll('.mday .tlev[data-event]')].map((b) => { const r = b.getBoundingClientRect(), q = (s) => b.querySelector(s), ins = (e) => { const t = e.getBoundingClientRect(); return t.top >= r.top - 0.5 && t.bottom <= r.bottom + 0.5 && t.left >= r.left - 0.5 && t.right <= r.right + 0.5; }; return { h: r.height, y: r.top, b: r.bottom, t1: q('.ft1').textContent, t2: q('.ft2').textContent, in: ['.ft1', '.ft2', '.fln', '.tn'].every((s) => ins(q(s))), bg: getComputedStyle(b).backgroundColor, tr: !!q('.tr'), lw: q('.fln').getBoundingClientRect().width }; }));
  const m = await read();
  expect(m.map((x) => [x.t1, x.t2])).toEqual([['13:00', '14:00'], ['15:00', '16:30']]);
  for (const x of m) { expect(near(x.h, 44)).toBe(true); expect(x.in).toBe(true); expect(x.bg).toBe('rgb(255, 255, 255)'); expect(x.tr).toBe(false); expect(x.lw).toBe(3); }
  expect(m[1].y >= m[0].b + 13).toBe(true); // 14:00〜15:00（予定なし）は 14 のまま詰まり、カードは重ならない
  expect(near(await lineY(page, 900) - await lineY(page, 840), 14, 0.5)).toBe(true);
  expect(near(await lineY(page, 840) - await lineY(page, 780), 44, 0.5)).toBe(true); // 13:00〜14:00 は予定のカードの分だけ広がる
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  const d = await read();
  expect(near(d[0].h, 54) && near(d[1].h, 82)).toBe(true); // 56×1時間−2、56×1.5時間−2
  // v19.6（征希さん「つまみで両方」）で仕様変更: 広げた側は色の地の枠（題名の下に「13:00〜14:00」）。白いカードの時刻 2 行と色の線は出さない
  const w = await page.evaluate(() => [...document.querySelectorAll('.mday .tlev[data-event]')].map((b) => { const r = b.getBoundingClientRect(), q = (s) => b.querySelector(s), t = q('.ftr').getBoundingClientRect(); return { bg: getComputedStyle(b).backgroundColor, tr: q('.ftr').textContent, in: t.bottom <= r.bottom + 0.5, ft1: getComputedStyle(q('.ft1')).display }; }));
  expect(w.map((x) => x.tr)).toEqual(['13:00〜14:00', '15:00〜16:30']);
  for (const x of w) { expect(x.bg).not.toBe('rgb(255, 255, 255)'); expect(x.in).toBe(true); expect(x.ft1).toBe('none'); }
  expect(await page.evaluate(() => [...document.querySelectorAll('.mday .hlab')].filter((e) => !e.hidden).slice(3, 6).map((e) => e.querySelector('.l1').textContent))).toEqual(['11:00', '12:00', '13:00']); // 今の時刻（9:41）の札の近くの目盛りは隠れるので、離れた 11:00 から
});

test('A-9 「すべての時間」で 0:00 から開く（画面は動かさない）。日を選び直す・カード⇔時間で畳み直す。幅を変えても開いたまま', async ({ page }) => {
  await boot(page, { dg: 1 });
  const b = page.locator('.mday .mdfold button');
  await expect(b).toHaveText('すべての時間');
  const tl = await rect(page, '.mday .tl');
  await b.evaluate((e) => e.click()); await page.waitForTimeout(150); // つまみの行の右（時間軸の下）。画面を送らずに押す
  expect(await scTop(page)).toBe(0);
  expect(near(await lineY(page, 0), tl.y + 12)).toBe(true);
  await expect(page.locator('.mday .mdfold')).toHaveCount(0);
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  expect(near(await lineY(page, 0), tl.y + 12)).toBe(true); // 幅を変えても開いたまま
  await toCard(page); await toTime(page);
  expect(near(await lineY(page, 480), (await rect(page, '.mday .tl')).y + 12)).toBe(true); // 畳み直す（8:00 から）
  // 0 時台の予定しかない日は 0:00 から見せる（前は畳まない）。22:00 より後は畳んであるので「すべての時間」は出る
  await seed(page, [ev('z', '夜中', `${EMPTY}T00:30`, `${EMPTY}T01:00`)]);
  await page.locator(`.mgrid .day[data-date="${EMPTY}"]`).click(); await page.waitForTimeout(400);
  await expect(page.locator('.mday .mdfold button')).toHaveText('すべての時間');
  expect(near(await lineY(page, 0), (await rect(page, '.mday .tl')).y + 12)).toBe(true);
  expect(await page.evaluate(() => [...document.querySelectorAll('.mday .hlab')].filter((e) => !e.hidden).map((e) => Number(e.dataset.rm) / 60).pop())).toBe(22);
});

test('A-10 その1の決まり: 時間でも画面は1本のスクロール（入れ子の縦スクロールなし）。バーで幅を変えても段と画面の位置は変わらない。つまみ（上）で段だけ変わる', async ({ page }) => {
  await boot(page, { dg: 1 });
  const nested = await page.evaluate(() => [...document.querySelectorAll('.mpull.browse *')].filter((e) => { const c = getComputedStyle(e); return /(auto|scroll)/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 1; }).map((e) => e.className));
  expect(nested).toEqual([]);
  const p = await barPt(page), st0 = await scTop(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 300, { hold: 150 });
  expect(await stageOf(page)).toBe(4); expect(await scTop(page)).toBe(st0); // 画面の位置は、つまみを見える所へ送ったまま変わらない
  // 時間軸の終わりと区画（「＋」の行）まで1本で送れる
  const sec = await page.locator(SEC).evaluate((e) => ({ max: e.scrollHeight - e.clientHeight }));
  expect(sec.max > 300).toBe(true);
  await setScroll(page, sec.max);
  const note = await rect(page, '.mday .mdadd'); expect(note.b <= 678 - 33 + 1).toBe(true); // v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 日の欄の末尾は「ノートの欄」→「＋ タスク」「＋ ノート」の行
  await setScroll(page, 0);
  // つまみ（上）を 86 上へ → 段が進む（小さい月へ）。時間の幅（dayGrip 2）はそのまま
  const g = await rect(page, '.mgrab');
  await mouseDrag(page, g.x + g.w / 2, g.y + 12, g.x + g.w / 2, g.y + 12 - 86, { hold: 150, settle: 550 });
  expect(await stageOf(page)).toBeGreaterThan(4); expect((await ui(page)).dayGrip).toBe(2); expect(near(await hourGap(page), hhAfter(300), 0.5)).toBe(true);
});

test('A-11 帯がない画面（ブラウザ）: 切り替えは右下の＋・右上の「…」「タスク」にかからない。バーの押せる所は＋にかからない', async ({ page }) => {
  await boot(page, { sar: 0, dg: 1, stage: 7 });
  const sw = await rect(page, '.mday .mdct'), add = await rect(page, '.cadd');
  expect(sw.r <= 466 - 8 - 56 + 1).toBe(true);
  const over = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  for (const s of ['.cadd', '.cmore', '.ctask']) expect(over(sw, await rect(page, s)), s).toBe(false);
  await barPt(page);
  const bar = await rect(page, '.mday .mdgrab');
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.mdgrab'), [add.x - 170, bar.y + 12])).toBe(true); // v19.5: ＋のすぐ左は「すべての時間」。その左がバー
});

test('A-12 閉じた横: 日の欄の中がスクロール（今までどおり）。時間は終日の札・9:00 からの時間軸・バーで、バーは流れる。段は使わない', async ({ page }) => {
  await boot(page, { size: SIZES.closedLandscape, dg: 1 });
  await expect(page.locator(`${SEC}[data-stage]`)).toHaveCount(0);
  const md = page.locator('.mday');
  expect(await md.evaluate((e) => getComputedStyle(e).overflowY)).toMatch(/auto|scroll/);
  // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 並びは 切り替えの行（y50〜82）→ 終日の札 → 時間軸（9:00 から）→ つまみ
  const bar = await rect(page, '.mday .mdgrab'), tl = await rect(page, '.mday .tl'), pill = await rect(page, '.mday .mdallday');
  expect(pill.y >= 88 - 1 && pill.b <= tl.y + 1).toBe(true); expect(near(bar.y, tl.b)).toBe(true);
  expect(near(await lineY(page, 480), tl.y + 12)).toBe(true);
  expect(await md.evaluate((e) => e.scrollTop)).toBe(0);
  await md.evaluate((e) => { e.scrollTop = 200; }); await page.waitForTimeout(200);
  const moved = await md.evaluate((e) => e.scrollTop); expect(moved > 50).toBe(true);
  expect(near((await rect(page, '.mday .mdgrab')).y, bar.y - moved)).toBe(true); // バーは貼り付かない
  expect(near((await rect(page, '.mday .mdh')).y, 0)).toBe(true); // 日の見出しは今までどおり貼り付く
  await md.evaluate((e) => { e.scrollTop = 0; });
  let p = await barPt(page);
  await touchDrag(page, p.x, p.y, p.x, p.y + 40, { steps: 8, hold: 150 }); // 1時間 17.5（35 より低い間は dayGrip 1）
  expect((await ui(page)).dayGrip).toBe(1);
  p = await barPt(page);
  await touchDrag(page, p.x, p.y, p.x, p.y + 300, { steps: 8, hold: 150 });
  expect((await ui(page)).dayGrip).toBe(2); const hhL = await hourGap(page); expect(near(hhL, hhAfter(340), 0.6)).toBe(true);
  // 縦へ戻しても同じ段
  await page.setViewportSize(SIZES.closedPortrait); await page.waitForTimeout(600);
  expect(await dg(page)).toBe('C'); expect(near(await hourGap(page), hhL, 0.5)).toBe(true);
});

test('A-13 初めて「時間」にした1回だけ、札「バーを下へ引くと、時間が広がります」。触れると消え、2回目は出ない', async ({ page }) => {
  await boot(page, { hint: false });
  await expect(page.locator('.mbarhint')).toHaveCount(0);
  await toTime(page);
  const h = page.locator('.mbarhint');
  await expect(h).toHaveText('バーを下へ引くと、時間が広がります');
  const r = await rect(page, '.mbarhint'), bar = await rect(page, '.mday .mdgrab');
  expect(r.y >= bar.b - 1 && r.x >= 12 && r.r <= 370).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('duo.hint.daybar'))).toBe('1');
  await page.mouse.click(100, 30); await page.waitForTimeout(300);
  await expect(h).toHaveCount(0);
  await toCard(page); await toTime(page);
  await expect(page.locator('.mbarhint')).toHaveCount(0);
});

test('A-14 予定のない日: カードは「予定はありません」、時間は 8:00〜22:00。切り替えは同じ位置、バーは時間軸のすぐ下', async ({ page }) => {
  await boot(page, { sel: EMPTY });
  await expect(page.locator('.mday .mdnone2')).toHaveText('予定はありません');
  const sw0 = await rect(page, '.mday .mdct');
  await toTime(page);
  const sw1 = await rect(page, '.mday .mdct'), tl = await rect(page, '.mday .tl');
  expect(near(sw0.y, sw1.y) && near(sw0.x, sw1.x)).toBe(true);
  expect(near(await lineY(page, 480), tl.y + 12)).toBe(true);
  expect(near(tl.h, 12 + 14 * 14 + 12)).toBe(true); // 8:00〜22:00 を 1時間 14 で（上下の余白 12）
  expect(near((await rect(page, '.mday .mdgrab')).y, tl.b)).toBe(true);
});

test('A-15 祝日名・六曜で見出しが長い日でも、日付と切り替えが重ならない（曜日の側を省く）', async ({ page }) => {
  await boot(page, { sel: '2026-11-23' });
  const h = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { dt: r('.mday .mdh .hdt'), dw: r('.mday .mdh .hdw'), sw: r('.mday .mdct'), text: document.querySelector('.mday .mdh .hdw').textContent }; });
  expect(h.text).toContain('勤労感謝の日');
  expect(h.dw.right <= h.sw.left + 0.5).toBe(true); expect(h.dt.right <= h.dw.left + 0.5).toBe(true);
});

// v19.2 の S11f〜S11j（design/34 §16-1・§17-1・§17-2・§18-1〜§18-7）「つまみ（下）を日の欄の下端に貼り付ける」は、design/35 §5.4 で捨てた。
// 外した試験（s11g の §17-1/2、s11h の §18-1/2、s11i・s11j・s11i-design-18-5 の全部）の代わりに、「貼り付く物・埋めた面が無い」ことを 縦横 × 帯あり／なし × 段 × カード／時間 で見る
for (const [name, sar, size] of [['縦・帯あり', 84, SIZES.closedPortrait], ['縦・帯なし', 0, SIZES.closedPortrait], ['横・帯あり', 84, SIZES.closedLandscape], ['横・帯なし', 0, SIZES.closedLandscape]]) {
  test(`A-16 ${name}: 捨てた貼り付き（34 §16-1・§17・§18）— カード・時間のどの段でも、日の欄の下端に貼り付くつまみ・埋めた面が無い。最後のカードの下はすぐ「ノート ›」`, async ({ page }) => {
    test.setTimeout(90000);
    const land = size.width > size.height;
    await boot(page, { sar, size, stage: 4, dg: 0 });
    const toStage = async (n) => { await page.locator('.mgrab').focus(); for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(450); };
    for (const stage of land ? [4] : [1, 3, 4, 7]) for (const dgv of [0, 1, 2]) {
      if (!land) { await page.locator(SEC).evaluate((e) => { e.scrollTop = 0; }); await toStage(stage); }
      if (dgv === 0) await toCard(page); else { await toTime(page); await page.locator('.mday .mdgrab').focus(); await page.keyboard.press(dgv === 2 ? 'ArrowDown' : 'ArrowUp'); await page.waitForTimeout(150); }
      expect((await ui(page)).dayGrip).toBe(dgv);
      const sc = land ? '.mpull.browse .mday' : SEC;
      for (const y of [0, 120, 99999]) {
        await page.locator(sc).evaluate((e, v) => { e.scrollTop = v; }, y); await page.waitForTimeout(120);
        const st = await page.evaluate(() => {
          const md = document.querySelector('.mpull.browse .mday'), g = md.querySelector('.mdgrab');
          const sticky = [...md.querySelectorAll('*')].filter((e) => getComputedStyle(e).position === 'sticky').map((e) => e.className.split(' ')[0]);
          const before = g ? getComputedStyle(g, '::before') : null;
          return { gs: md.classList.contains('gs'), stuck: !!md.querySelector('.stuck'), sticky, grab: !!g, gpos: g ? getComputedStyle(g).position : null, fillH: before ? parseFloat(before.height) : 0, gsb: md.style.getPropertyValue('--gsb'), anims: g ? g.getAnimations().length : 0 };
        });
        const tag = `${name} 段${stage} dg${dgv} y${y}`;
        expect(st.gs, tag).toBe(false); expect(st.stuck, tag).toBe(false); expect(st.gsb, tag).toBe('');
        expect(st.sticky, tag).toEqual(land ? ['mdh'] : []); // 閉じた横の日の見出しだけ（今までどおり）
        expect(st.grab, tag).toBe(dgv !== 0);
        if (dgv) { expect(st.gpos, tag).toBe('relative'); expect(st.fillH <= 44.5, tag).toBe(true); expect(st.anims, tag).toBe(0); }
      }
      if (dgv === 0) { // 送り切り: 最後のカード（下の間 8）のすぐ下が「ノート ›」。間につまみの箱（44／56）は無い
        const gap = await page.evaluate(() => { const c = [...document.querySelectorAll('.mday .mdbody .mdcard')].pop().getBoundingClientRect(), n = document.querySelector('.mday .mdrest').getBoundingClientRect(); return n.top - c.bottom; }); // v19.3 その3 で仕様変更: 最後の予定のカードのすぐ下（間 8）は「ノート ›」→ 区画（タスク・ノート・「＋」の行）の箱 .mdrest
        expect(near(gap, 8), `${name} 段${stage}: カード→ノート › の間 ${gap}`).toBe(true);
      }
    }
  });
}
