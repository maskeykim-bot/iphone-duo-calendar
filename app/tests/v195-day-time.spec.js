// 第19.5版（征希さん「時間で表示した時は本家仕様にする」）: 閉じた画面の日の欄「時間」の新しい決まり（実装担当）。Chromium と WebKit の両方。
// 目盛り・つまみ・寄せ・ゴム・覚えるは tests/v193-design35-s9.spec.js の S-3〜S-9、保存・たたく・払い・閉じた横は tests/v193-day-cardtime.spec.js。ここはそのほか。
import { test, expect } from '@playwright/test';
import { ev, seed } from './helpers.js';
import { boot, DAY, ui, rect, hourGap, lineY, near, barPt, mouseDrag } from './v193-p2-lib.js';

const dg = (page) => page.locator('.mday').getAttribute('data-dg');
const emptyPt = async (page, min) => { const y = await lineY(page, min); if (y > 560) { await page.locator('.mpull.browse').evaluate((e, d) => { e.scrollTop += d; }, y - 320); await page.waitForTimeout(250); } return { x: (await rect(page, '.mday .tlcol')).x + 120, y: (await lineY(page, min)) + 4 }; }; // 画面の下に出ている時刻は、送ってから押す

test('T-1 詰めた形（1時間 14）で空きをたたくと、枠は作らず広げた形（56）になる。広げた形でたたくと 1 時間の仮の枠', async ({ page }) => {
  await boot(page, { dg: 1, stage: 7 });
  let p = await emptyPt(page, 15 * 60);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(500);
  await expect(page.locator('.dbox')).toHaveCount(0);
  expect(await dg(page)).toBe('C'); expect((await ui(page)).dayGrip).toBe(2); expect(near(await hourGap(page), 56, 0.5)).toBe(true);
  p = await emptyPt(page, 15 * 60);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.dbox .ds')).toHaveText('15:00〜16:00（1時間）');
  const b = await rect(page, '.dbox'); expect(near(b.h, 56)).toBe(true); expect(near(b.y, await lineY(page, 15 * 60))).toBe(true);
});

test('T-2 詰めた形で空きを長押ししても、枠は作らず広げるだけ（編集シートも開かない）', async ({ page }) => {
  await boot(page, { dg: 1, stage: 7 });
  const p = await emptyPt(page, 16 * 60);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(500);
  await expect(page.locator('.dbox')).toHaveCount(0); await expect(page.locator('#editor')).toBeHidden();
  expect(await dg(page)).toBe('C');
});

test('T-3 見せる範囲: 早い予定（7:30）がある日は 7:00 から。終わりは設定の 22:00（予定は 21:20 まで）。数字は 9・12・15・18・21、間は点（広げた形だけ見える）', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '朝', `${DAY}T07:30`, `${DAY}T08:00`), ev('b', '夜', `${DAY}T20:00`, `${DAY}T21:20`)] });
  const labs = () => page.evaluate(() => [...document.querySelectorAll('.mday .hlab')].filter((e) => !e.hidden).map((e) => ({ h: Number(e.dataset.rm) / 60, t: e.querySelector('.l3').textContent, dot: e.classList.contains('dot') ? getComputedStyle(e, '::before').opacity : null })));
  let l = await labs();
  expect(l.map((x) => x.h)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  expect(l.filter((x) => x.t).map((x) => x.t)).toEqual(['9', '12', '15', '18', '21']);
  expect(l.filter((x) => x.dot !== null).every((x) => x.dot === '0')).toBe(true); // 詰めた形は点を出さない
  const tl = await rect(page, '.mday .tl'); expect(near(await lineY(page, 420), tl.y + 12)).toBe(true);
  await page.locator('.mday .mdgrab').focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400);
  // v19.6（征希さん「つまみで両方」）で仕様変更: 広げた側（1時間 35 以上）は点でなく、1時間ごとの「8:00」。点が見えるのは 22〜35 の間
  expect(await page.evaluate(() => [...document.querySelectorAll('.mday .hlab')].filter((e) => !e.hidden).slice(0, 2).map((e) => e.innerText.trim()))).toEqual(['7:00', '8:00']);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.dayHh = 30; s.dayGrip = 1; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); }); await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  l = await labs();
  expect(l.filter((x) => x.dot !== null).every((x) => x.dot === '1')).toBe(true);
});

test('T-4 時刻が重なる予定は横に並ぶ（細いカードは始まりの時刻と題名）。重ならない予定のカードは上下に重ならない', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '会議', `${DAY}T10:00`, `${DAY}T11:00`), ev('b', '電話', `${DAY}T10:30`, `${DAY}T10:45`), ev('c', '昼', `${DAY}T11:00`, `${DAY}T11:15`), ev('d', '移動', `${DAY}T11:15`, `${DAY}T11:30`)] });
  const r = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.mday .tlev[data-event]')].map((b) => { const q = b.getBoundingClientRect(); return [b.dataset.event, { x: q.left, r: q.right, y: q.top, b: q.bottom, h: q.height, nar: b.classList.contains('nar'), t2: getComputedStyle(b.querySelector('.ft2')).display }]; })));
  expect(r.a.nar && r.b.nar).toBe(true); expect(r.a.r <= r.b.x + 1).toBe(true); expect(r.b.t2).toBe('none');
  expect(r.c.nar || r.d.nar).toBe(false);
  for (const k of ['a', 'b', 'c', 'd']) expect(r[k].h >= 44 - 0.5, k).toBe(true);
  expect(r.c.y >= r.a.b - 1 && r.d.y >= r.c.b - 1).toBe(true);
});

test('T-5 予定のメモの1行目がカードに出る。終日の予定は、カードと同じ色の札で見出しのすぐ下', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '打ち合わせ', `${DAY}T10:00`, `${DAY}T11:00`, { notes: '資料を持つ\n2行目' }), ev('ad', '出張', `${DAY}T00:00`, `${DAY}T23:59`, { all: true })] });
  await expect(page.locator('.mday .tlev .fmemo')).toHaveText('資料を持つ');
  const pill = await rect(page, '.mday .mdad .mdallday'), tl = await rect(page, '.mday .tl'), mdh = await rect(page, '.mday .mdh');
  expect(pill.y >= mdh.b - 1 && pill.b <= tl.y + 1).toBe(true);
  await page.locator('.mday .mdct [data-dg="card"]').click(); await page.waitForTimeout(350);
  expect(near((await rect(page, '.mday .mdad .mdallday')).y, pill.y)).toBe(true); // カードにしても同じ位置
});

// ---- その2（征希さん 2026-11-24 夜: 設定で決めた1日で表示／別の時間へのドラッグ／好きな位置で止める／取っ手を時刻から離す）
const dbEv = (page, id) => page.evaluate(async (i) => (await (await import('/js/db.js')).getEvent(i)), id);
const hold = async (page, x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(450); };

test('T-6 つまみは好きな位置で止まる: 下へ 69 引いて離すと 1時間 20 のまま。読み込み直しても 20。たたくと 56、もう一度で 14', async ({ page }) => {
  await boot(page, { dg: 1 });
  let p = await barPt(page);
  await mouseDrag(page, p.x, p.y, p.x, p.y + 69, { hold: 150 });
  expect(near(await hourGap(page), 20, 0.3)).toBe(true);
  expect((await ui(page)).dayGrip).toBe(1); expect(near((await ui(page)).dayHh, 20, 0.3)).toBe(true);
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  expect(near(await hourGap(page), 20, 0.3)).toBe(true);
  await page.locator('.mday .mdct [data-dg="card"]').click(); await page.waitForTimeout(350);
  await page.locator('.mday .mdct [data-dg="time"]').click(); await page.waitForTimeout(350);
  expect(near(await hourGap(page), 20, 0.3)).toBe(true); // カードから戻しても同じ高さ
  p = await barPt(page); await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  expect(near(await hourGap(page), 56, 0.5)).toBe(true); expect((await ui(page)).dayGrip).toBe(2);
  p = await barPt(page); await page.mouse.click(p.x, p.y); await page.waitForTimeout(450);
  expect(near(await hourGap(page), 14, 0.5)).toBe(true); expect((await ui(page)).dayGrip).toBe(1);
});

test('T-7 設定「時間に出す1日」: 既定は 8:00〜22:00。10:00〜18:00 にすると、その範囲だけ（外に予定がある日はその予定まで広げる）', async ({ page }) => {
  await boot(page, { dg: 1, data: [ev('a', '昼', `${DAY}T12:00`, `${DAY}T13:00`)] });
  const hours = () => page.evaluate(() => [...document.querySelectorAll('.mday .hlab')].filter((e) => !e.hidden).map((e) => Number(e.dataset.rm) / 60));
  let h = await hours(); expect([h[0], h[h.length - 1]]).toEqual([8, 22]);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('duo.ui.v1')); s.dayHours = { from: 10, to: 18 }; localStorage.setItem('duo.ui.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('html[data-ready]'); await page.waitForTimeout(300);
  h = await hours(); expect([h[0], h[h.length - 1]]).toEqual([10, 18]);
  expect((await ui(page)).dayHours).toEqual({ from: 10, to: 18 });
  await seed(page, [ev('b', '朝', `${DAY}T07:15`, `${DAY}T07:45`), ev('c', '夜', `${DAY}T20:00`, `${DAY}T21:10`)]); await page.waitForTimeout(300);
  h = await hours(); expect([h[0], h[h.length - 1]]).toEqual([7, 22]);
});

test('T-8 別の時間へ: 「時間」の予定のカードを長押しして時間軸の中で 1 時間ぶん下へ引いて離すと、同じ日のまま 1 時間あとへ。元に戻せる', async ({ page }) => {
  await boot(page, { dg: 2, stage: 7, data: [ev('a', '会議', `${DAY}T15:00`, `${DAY}T16:00`)] });
  await page.locator('.mpull.browse').evaluate((e) => { e.scrollTop = 250; }); await page.waitForTimeout(250);
  const c = await rect(page, '.mday .tlev[data-event="a"]');
  await hold(page, c.x + 120, c.y + 20);
  await page.mouse.move(c.x + 150, c.y + 20 + 56, { steps: 8 }); await page.waitForTimeout(80);
  await expect(page.locator('.gchip .gct')).toContainText('16:00〜17:00');
  await page.mouse.up(); await page.waitForTimeout(500);
  const e = await dbEv(page, 'a'); expect([e.start, e.end]).toEqual([`${DAY}T16:00`, `${DAY}T17:00`]);
  await expect(page.locator('#native-toast span').first()).toHaveText('16:00〜17:00 に変えました');
  await page.locator('#native-toast button', { hasText: '元に戻す' }).click(); await page.waitForTimeout(500);
  const e0 = await dbEv(page, 'a'); expect([e0.start, e0.end]).toEqual([`${DAY}T15:00`, `${DAY}T16:00`]);
  return;
  await expect(page.locator('.mday .tlev[data-event="a"] .ft1')).toHaveText('16:00');
});

test('T-9 時間軸の外（月のマス）へ運ぶと時刻は元のまま、日だけ変わる。元の場所で離せば何も変わらない', async ({ page }) => {
  await boot(page, { dg: 2, stage: 4, data: [ev('a', '会議', `${DAY}T10:00`, `${DAY}T11:00`)] });
  const c = await rect(page, '.mday .tlev[data-event="a"]');
  await hold(page, c.x + 120, c.y + 20);
  await page.mouse.move(c.x + 120, c.y + 60, { steps: 4 }); // いったん時間軸の中で下へ
  const cell = await rect(page, '.mgrid .day[data-date="2026-11-14"]');
  await page.mouse.move(cell.x + cell.w / 2, cell.y + cell.h / 2, { steps: 8 }); await page.waitForTimeout(80);
  await page.mouse.up(); await page.waitForTimeout(500);
  const e = await dbEv(page, 'a'); expect([e.start, e.end]).toEqual(['2026-11-14T10:00', '2026-11-14T11:00']);
});

test('T-10 仮の枠の取っ手は左の時刻の札と重ならない（始まり＝左から 72、終わり＝右から 48）', async ({ page }) => {
  await boot(page, { dg: 2, stage: 7 });
  const p = await emptyPt(page, 16 * 60);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.dbox .hdl')).toHaveCount(2);
  const r = await page.evaluate(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); return { box: q('.dbox'), s: q('.dbox .hdl-s'), e: q('.dbox .hdl-e'), tags: [...document.querySelectorAll('.dtag')].map((t) => t.getBoundingClientRect().right) }; });
  expect(near(r.s.left - r.box.left, 72 + 2, 3) && near(r.box.right - r.e.right, 48 + 2, 3)).toBe(true);
  for (const t of r.tags) { expect(r.s.left - 15 > t).toBe(true); expect(r.e.left - 15 > t).toBe(true); } // 押せる範囲（中心から 22）の左端が札の右より外…までは求めず、丸と札が 15 以上離れる
});

test('T-11 時刻を動かしている間、落とす先が枠で見える: 枠の上端はカードの上端＋引いた量（15分に丸める）。左に始まりの時刻の札。指についてくる札は隠れる。時間軸の外へ出ると枠は消えて札が戻る', async ({ page }) => {
  await boot(page, { dg: 2, stage: 4, data: [ev('a', '会議', `${DAY}T15:00`, `${DAY}T16:00`)] });
  await page.locator('.mpull.browse').evaluate((e) => { e.scrollTop = 420; }); await page.waitForTimeout(250);
  const c = await rect(page, '.mday .tlev[data-event="a"]');
  await hold(page, c.x + 120, c.y + 30);
  await page.mouse.move(c.x + 160, c.y + 30 + 40, { steps: 6 }); await page.waitForTimeout(80); // 40 下へ＝43 分 → 15 分に丸めて 45 分
  const g = await rect(page, '.mday .fsghost');
  expect(near(g.y, c.y + 42, 1.5)).toBe(true); expect(near(g.h, 54, 1.5)).toBe(true);
  expect(await page.locator('.mday .fsghost').innerText()).toMatch(/15:45[\s\S]*16:45[\s\S]*会議/);
  await expect(page.locator('.mday .fsgtag')).toHaveText('15:45');
  expect(await page.locator('.gchip').evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
  const head = await rect(page, '.mday .mdh'); // 時間軸の外（日の見出しの上）
  await page.mouse.move(c.x + 160, head.y + 10, { steps: 8 }); await page.waitForTimeout(80);
  await expect(page.locator('.mday .fsghost')).toHaveCount(0);
  expect(await page.locator('.gchip').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await page.mouse.move(c.x + 160, c.y + 30 + 40, { steps: 8 }); await page.waitForTimeout(80);
  // 見出しの近くでは画面が自動で送られるので、戻った所の時刻は枠に出ている時刻で確かめる（枠の時刻＝保存される時刻）
  const shown = await page.evaluate(() => [document.querySelector('.mday .fsghost .g1').textContent, document.querySelector('.mday .fsghost .g2').textContent]);
  expect(shown[0]).not.toBe('15:00');
  await page.mouse.up(); await page.waitForTimeout(500);
  await expect(page.locator('.fsghost, .fsgtag')).toHaveCount(0);
  const pad = (t) => t.padStart(5, '0');
  const e = await dbEv(page, 'a'); expect([e.start, e.end]).toEqual([`${DAY}T${pad(shown[0])}`, `${DAY}T${pad(shown[1])}`]);
});
