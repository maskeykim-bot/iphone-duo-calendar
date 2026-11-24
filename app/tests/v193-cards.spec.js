// 第19.3版 その3（征希さん「メモもカードで分ける」「カードはそのままカレンダーの別日に移動できる」「タスクもカード表示できれば自由に移動できる」）。
// 寸法・動きの細かい行は tests/v193-design35-s9.spec.js（design/35 §9 の ID）。ここは指示書の項目と、品質が足した観点（qa/verify-v19-3-cards.md）:
//   カードを作る・開く／終日・複数日・同じ日／「時間」のときの枠／開いて期限を変える／iOS 連携の予定の保存の経路（native の模擬）／
//   保存の形（IndexedDB の版 6・ストア・項目。ノートの本文は 1 文字も変わらない・旧メモ由来の sourceDate が残る）／バックアップ・検索／
//   月のマスのチップがはみ出さない（K-13）／つかんでいる間の取り合い（M-22）／速さ（追記7: 持ち上げ・落とす・元に戻すの動き始め 100ms 以内、落としてから表示 300ms 以内）。
// Chromium と WebKit の両方で回す（CDP を使う CPU 4 倍落としの計測は Chromium だけ）。
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SIZES, enableCalendars, clickSettings } from './helpers.js';
import * as P3 from './v193-p3-lib.js';
import { scTop, stageOf, ui, haptics } from './v193-p2-lib.js';

const { DAY, D13, D14, D16, cardSel, cell, hold, carry, dropOn, mvlog, toast, dbTasks, dbNotes, dbEvs, rect, css, near, note, task, ev, SEC } = P3;
const undo = async (page) => { await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(350); };

// ---------- カードを作る・開く ----------
test('C-2「＋ ノート」: その日の新しいノートを題名から書ける（1行目に日付の見出しは足さない・空のあいだ「題名」）。閉じるとカードが 1 枚増える。何も書かずに閉じたら何も残らない', async ({ page }) => {
  await P3.boot(page, { notes: [] });
  await page.locator('.mday [data-act="addnote"]').click(); await page.waitForTimeout(600);
  const title = page.locator('.nsheet .ned-title');
  await expect(title).toBeFocused(); expect(await title.getAttribute('placeholder')).toBe('題名'); expect(await title.inputValue()).toBe('');
  expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('11月12日（木）');
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800);
  expect(await dbNotes(page)).toEqual([]); await expect(page.locator('.mday .mdk-note')).toHaveCount(0); // 空のまま閉じた: 何も作らない
  await page.locator('.mday [data-act="addnote"]').click(); await page.waitForTimeout(600);
  await page.keyboard.type('買い物'); await page.keyboard.press('Enter'); await page.keyboard.type('牛乳と卵');
  await page.waitForTimeout(1300);
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800);
  const ns = await dbNotes(page);
  expect(ns.length).toBe(1); expect(ns[0].body).toBe('買い物\n牛乳と卵'); expect(ns[0].date).toBe(DAY); expect('sourceDate' in ns[0]).toBe(false);
  expect(await page.locator('.mday .mdk-note strong').allTextContents()).toEqual(['買い物']);
  expect(await page.locator('.mday .mdk-note small').textContent()).toBe('牛乳と卵');
  // 1 日に何枚でも
  await page.locator('.mday [data-act="addnote"]').click(); await page.waitForTimeout(600);
  await page.keyboard.type('議事メモ'); await page.waitForTimeout(1300);
  await page.locator('.nsheet .ned-done').click(); await page.waitForTimeout(800);
  expect((await page.locator('.mday .mdk-note strong').allTextContents()).sort()).toEqual(['買い物', '議事メモ'].sort()); // 並びは作った順（この試験は時計を止めているので作った時刻が同じ＝順は問わない）
  expect(await page.locator('.nsheet .ned-title').count() ? await page.locator('.ned-title').first().getAttribute('placeholder') : '新規ノート').toBe('新規ノート'); // シートを閉じたら元の言葉に戻す
});

test('C-3「＋ タスク」: その日を期限にした新しいタスクを題名から書ける。保存するとカードが増える。四角（左 x0〜52）で完了、ほかをたたくと開く。期限なしのタスクは日の欄に出ない', async ({ page }) => {
  await P3.boot(page, { tasks: [task('tn', '期限なしのタスク', null)] });
  await expect(page.locator('.mday .mdk-task')).toHaveCount(0);
  await page.locator('.mday [data-act="addtask"]').click();
  await expect(page.locator('#taskdlg[open]')).toBeVisible();
  await expect(page.locator('#tk-title')).toBeFocused(); expect(await page.locator('#tk-date').evaluate((e) => e.value)).toBe(DAY);
  await expect(page.locator('#tk-del')).toBeHidden();
  await page.locator('#tk-save').click();
  await expect(page.locator('#tk-err')).toHaveText('題名を入力してください。'); expect((await dbTasks(page)).length).toBe(1); // 題名なしでは作らない
  await page.locator('#tk-title').fill('見積もりを送る'); await page.locator('#tk-save').click(); await page.waitForTimeout(500);
  await expect(page.locator('#taskdlg[open]')).toHaveCount(0);
  const t = (await dbTasks(page)).find((x) => x.title === '見積もりを送る');
  expect(t.due).toEqual({ date: DAY }); expect(t.done).toBe(false); expect(t.notify).toBe(false);
  expect(Object.keys(t).sort()).toEqual(['createdAt', 'done', 'doneAt', 'due', 'id', 'note', 'notify', 'order', 'title', 'updatedAt']); // 項目は今までの形
  const sel = cardSel('task', t.id);
  await expect(page.locator(sel)).toHaveCount(1);
  const r = await rect(page, sel);
  await page.mouse.click(r.x + 300, r.cy); await expect(page.locator('#taskdlg[open]')).toBeVisible(); // カードのほかの所: 開く
  expect(await page.locator('#tk-title').inputValue()).toBe('見積もりを送る'); await expect(page.locator('#tk-del')).toBeVisible();
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.mouse.click(r.x + 48, r.y + 50); await page.waitForTimeout(150); // 左 x0〜52×56 の端: 完了
  expect(await page.locator(`${sel} .mdck`).getAttribute('aria-checked')).toBe('true'); await expect(page.locator('#taskdlg[open]')).toHaveCount(0);
  await expect(page.locator('.mday', { hasText: '期限なしのタスク' })).toHaveCount(0);
});

test('タスクのシートの「ノート「買い物」 ›」（35 §8）: ノートのチェック行からできたタスクは、期限の下の行からそのノートを開ける。ふつうのタスクには出ない', async ({ page }) => {
  await P3.boot(page, { notes: [note('n1', '買い物\n- [ ] 牛乳', DAY)], tasks: [task('k1', '牛乳', { date: DAY }, { source: { type: 'note-check', noteId: 'n1', text: '牛乳', nth: 0, pos: 0 } }), task('t1', '見積もりを送る', { date: DAY }, { createdAt: 2 })] });
  await page.locator(`${cardSel('task', 't1')} .mdopen`).click(); await expect(page.locator('#taskdlg[open]')).toBeVisible();
  await expect(page.locator('#taskdlg .tksrc')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.locator(`${cardSel('task', 'k1')} .mdopen`).click(); await expect(page.locator('#taskdlg[open]')).toBeVisible();
  const row = page.locator('#taskdlg .tksrc');
  await expect(row).toHaveText('ノート「買い物」 ›');
  const r = await rect(page, '#taskdlg .tksrc'), tr = await rect(page, '#tk-timerow');
  expect(near(r.h, 44)).toBe(true); expect(r.y >= tr.b - 1).toBe(true);
  expect(await css(page, '#taskdlg .tksrc', 'fontSize')).toBe('13px'); expect(await css(page, '#taskdlg .tksrc', 'fontWeight')).toBe('400'); expect(await css(page, '#taskdlg .tksrc', 'color')).toBe('rgb(41, 78, 66)');
  await row.click(); await page.waitForTimeout(900);
  await expect(page.locator('#taskdlg[open]')).toHaveCount(0); await expect(page.locator('.nsheet:not([hidden])')).toBeVisible();
  expect(await page.locator('.nsheet .ned-title').inputValue()).toBe('買い物');
});

// ---------- 閉じた横の並び ----------
test('閉じた横: カードは幅 188・高さ 56 で、切り替えの行（y50〜82）の下 y88 から。題名は 1 行で「…」。区画の見出しと「＋ タスク」「＋ ノート」も入る', async ({ page }) => {
  await P3.boot(page, { size: SIZES.closedLandscape, events: [ev('e1', '長い題名の打ち合わせをする予定です', `${DAY}T09:00`, `${DAY}T10:00`)] });
  const c = await rect(page, cardSel('event', 'e1'));
  expect(near(c.w, 188) && near(c.h, 56) && near(c.x, 394)).toBe(true); expect(c.y >= 88 - 1).toBe(true);
  expect(await page.locator(`${cardSel('event', 'e1')} strong`).evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  for (const k of [cardSel('task', 't1'), cardSel('note', 'n1')]) { await page.locator(k).evaluate((e) => e.scrollIntoView({ block: 'center' })); const r = await rect(page, k); expect(near(r.w, 188) && near(r.h, 56)).toBe(true); }
  await page.locator('.mday .mdadd').evaluate((e) => e.scrollIntoView({ block: 'end' }));
  const add = await page.evaluate(() => [...document.querySelectorAll('.mday .mdadd button')].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; }));
  expect(add.length).toBe(2); expect(add[1].r <= 582 + 1).toBe(true); expect(add[1].l >= add[0].r - 1).toBe(true); for (const a of add) expect(near(a.h, 44)).toBe(true);
});

// ---------- 終日・複数日・時間のとき・同じ日 ----------
const TRIP = ev('ad', '三日の旅行', '2026-11-11T00:00', '2026-11-13T23:59', { all: true });
test('M-15・M-16 終日・複数日の予定は帯のまま。帯を長押しで運ぶと、長さを保って日付だけずれる（終日のまま）。札の印は色の線', async ({ page }) => {
  await P3.boot(page, { events: [TRIP, ev('one', '創立記念日', `${DAY}T00:00`, `${DAY}T23:59`, { all: true })], stage: 4 });
  await expect(page.locator('.mday .mdallday')).toHaveCount(2); await expect(page.locator('.mday .mdcard.mdk-event')).toHaveCount(0); // カードにはしない
  await carry(page, '.mday .mdallday[data-event="ad"]', cell(D14));
  await expect(page.locator('.gchip .gcl')).toHaveCount(1); expect(await page.locator('.gchip .gct').textContent()).toBe('三日の旅行');
  await page.mouse.up(); await page.waitForTimeout(400);
  let e = (await dbEvs(page)).find((x) => x.id === 'ad');
  expect([e.start, e.end, e.all]).toEqual(['2026-11-13T00:00', '2026-11-15T23:59', true]); // 12 日（中日）からつかんで 14 へ＝2 日ずれる。長さ 3 日のまま
  await expect(toast(page).locator('span')).toHaveText('13日（金）へ移しました'); // 札は開始日
  await undo(page);
  e = (await dbEvs(page)).find((x) => x.id === 'ad'); expect([e.start, e.end]).toEqual(['2026-11-11T00:00', '2026-11-13T23:59']);
  await page.waitForTimeout(300);
  await dropOn(page, '.mday .mdallday[data-event="one"]', cell(D16));
  e = (await dbEvs(page)).find((x) => x.id === 'one'); expect([e.start, e.end, e.all]).toEqual([`${D16}T00:00`, `${D16}T23:59`, true]);
});

test('「時間」のときも、時間軸の枠・終日の行を長押しで月のマスへ落とせる（時刻は残す）。区画（タスク・ノートのカード）は時間軸の下に同じ形で出る', async ({ page }) => {
  await P3.boot(page, { dg: 1, stage: 4, events: [...P3.EVENTS, TRIP] });
  await expect(page.locator('.mday .tl')).toHaveCount(1);
  expect(await page.locator('.mday .mdsh').allTextContents()).toEqual(['タスク ›', 'ノート ›']);
  const tl = await rect(page, '.mday .tl'), tk = await rect(page, cardSel('task', 't1'));
  expect(tk.y > tl.b - 1).toBe(true); expect(near(tk.h, 56)).toBe(true);
  await dropOn(page, '.mday .tlev[data-event="e1"]', cell(D14));
  const e = (await dbEvs(page)).find((x) => x.id === 'e1'); expect([e.start, e.end]).toEqual([`${D14}T09:00`, `${D14}T10:00`]);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  await undo(page);
  await dropOn(page, '.mday .mdallday', cell(D14)); // v19.5（征希さん「時間で表示した時は本家仕様にする」）で仕様変更: 「時間」の終日は「終日の行」の札（.adpill）→ カードと同じ色の札（.mdallday）
  const t = (await dbEvs(page)).find((x) => x.id === 'ad'); expect([t.start, t.end]).toEqual(['2026-11-13T00:00', '2026-11-15T23:59']);
});

test('M-19 同じ日へ落とす: 何もしない（保存しない＝updatedAt も変わらない・札なし・触覚なし）。予定・タスク・ノートとも', async ({ page }) => {
  await P3.boot(page);
  const before = { e: await dbEvs(page), t: await dbTasks(page), n: await dbNotes(page) };
  for (const [k, id] of [['event', 'e1'], ['task', 't1'], ['note', 'n1']]) {
    await carry(page, cardSel(k, id), cell(D14));
    const c = await P3.center(page, cell(DAY)); await page.mouse.move(c.x, c.y, { steps: 4 }); await page.waitForTimeout(60);
    await page.mouse.up(); await page.waitForTimeout(350);
    await expect(toast(page)).toHaveCount(0);
  }
  expect(await dbEvs(page)).toEqual(before.e); expect(await dbTasks(page)).toEqual(before.t); expect(await dbNotes(page)).toEqual(before.n);
  expect((await mvlog(page)).filter((x) => x.ev === 'drop' || x.ev === 'shown').length).toBe(0);
});

test('M-22 取り合いなし: つかんでいる間は、画面のスクロール・月の段のつまみ・横の払い（月送り）・カード｜時間が動かない。離したあとは今までどおり', async ({ page }) => {
  await P3.boot(page, { stage: 4 });
  const st0 = await stageOf(page), ym0 = await page.locator('#ctitle').textContent();
  const p = await P3.center(page, cardSel('task', 't1'));
  await hold(page, p);
  // 上へ・下へ・横へ大きく運ぶ（スクロール・月送り・段の変更が起きないこと）
  for (const [x, y] of [[p.x, p.y - 150], [p.x, p.y + 150], [p.x - 200, p.y], [p.x + 100, p.y]]) { await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(40); }
  const g = await rect(page, '.mgrab'); await page.mouse.move(g.cx, g.cy, { steps: 4 }); await page.mouse.move(g.cx, g.cy + 80, { steps: 4 }); // つまみ（上）の上を通っても段は変わらない
  expect(await stageOf(page)).toBe(st0); expect(await page.locator('#ctitle').textContent()).toBe(ym0); expect((await ui(page)).dayGrip).toBe(0);
  expect(await css(page, SEC, 'touchAction')).toBe('none');
  await page.mouse.move(430, 600, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(350);
  expect(await haptics(page)).toEqual([]); // 段・バーの触覚ログは増えない
  expect(await css(page, SEC, 'touchAction')).toBe('pan-y'); expect(await page.evaluate(() => document.documentElement.dataset.grab)).toBeUndefined();
  expect((await dbTasks(page))[0].due.date).toBe(DAY);
});

// ---------- 開いて日付を変える（予定・タスク） ----------
test('D-5 タスクを開いて期限の日を変えて保存: 動かしたのと同じ扱い（札「14日（土）へ移しました｜元に戻す」。時刻はそのまま）。元に戻すで期限だけ戻る', async ({ page }) => {
  await P3.boot(page);
  await page.locator(`${cardSel('task', 't1')} .mdopen`).click(); await expect(page.locator('#taskdlg[open]')).toBeVisible();
  await page.locator('#tk-title').fill('見積もりを出す');
  await page.locator('#tk-date').click(); await page.locator(`#taskdlg .dpgrid [data-day="${D14}"]`).click();
  await page.locator('#tk-save').click(); await page.waitForTimeout(500);
  expect((await dbTasks(page))[0].due).toEqual({ date: D14, time: '18:00' });
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  await expect(page.locator(`${cell(D14)} .chip[data-task="t1"]`)).toHaveCount(1); await expect(page.locator(cardSel('task', 't1'))).toHaveCount(0);
  await undo(page);
  const t = (await dbTasks(page))[0]; expect(t.due).toEqual({ date: DAY, time: '18:00' }); expect(t.title).toBe('見積もりを出す'); // 戻すのは期限だけ
  await expect(page.locator(cardSel('task', 't1'))).toHaveCount(1);
});
test('D-5 予定を開いて開始の日を変えて保存: 今のシートのまま（終了も同じだけずれる）。カードは先の日へ', async ({ page }) => {
  await P3.boot(page);
  await page.locator(cardSel('event', 'e1')).click(); await expect(page.locator('#editor[open]')).toBeVisible();
  await page.locator('#f-start').click(); await page.locator(`#dpop [data-day="${D14}"]`).click();
  await page.locator('#save').click(); await page.waitForTimeout(500);
  const e = (await dbEvs(page)).find((x) => x.id === 'e1'); expect([e.start, e.end]).toEqual([`${D14}T09:00`, `${D14}T10:00`]);
  await expect(page.locator(`${cardSel('event', 'e1')}[data-sday="${DAY}"]`)).toHaveCount(0); await expect(page.locator(`${cell(D14)} .chip[data-event="e1"]`)).toHaveCount(1); // 12 日の欄からは消え、14 日のマスに出る（今のシートは、保存した予定の日を選ぶ）
});
test('ノートのシートの「日付を外す」: その日の日の欄からカードが消える（date: null。sourceDate には戻さない）。6 秒は元に戻せる', async ({ page }) => {
  const old = note('memo-2026-11-12', '2026年11月12日（木）\n旧メモ', DAY, { sourceDate: DAY, sourceHeading: true });
  await P3.boot(page, { notes: [old] });
  await page.locator(cardSel('note', old.id)).click(); await page.waitForTimeout(600);
  await page.locator('.nsheet .nsdcap').click(); await page.locator('.nsheet > .dpop .dpclear').click(); await page.waitForTimeout(400);
  expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('日付なし');
  let n = (await dbNotes(page))[0]; expect([n.date, n.sourceDate, n.body]).toEqual([null, DAY, old.body]);
  await expect(page.locator(cardSel('note', old.id))).toHaveCount(0); await expect(page.locator(`${cell(DAY)} .chip[data-note]`)).toHaveCount(0);
  await expect(toast(page).locator('span')).toHaveText('日付を外しました');
  await undo(page);
  n = (await dbNotes(page))[0]; expect([n.date, n.sourceDate]).toEqual([DAY, DAY]);
  expect(await page.locator('.nsheet .nsdcap').textContent()).toBe('11月12日（木）');
});

// ---------- iOS カレンダー連携の予定（native の模擬）: 今の保存の経路を通る ----------
const CALS = [
  { id: 'cal-1', title: '家族', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
];
const XBASE = { calendarId: 'cal-1', all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null, alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, hasUrl: false, editable: true, reason: null };
const mk = (o) => ({ ...XBASE, id: `${o.eventId}@${o.start}`, itemId: `it-${o.eventId}`, externalId: `ex-${o.eventId}`, ...o });
const DETAILS = [
  mk({ eventId: 'h1', title: '祝日の予定', calendarId: 'cal-2', start: `${DAY}T13:00`, end: `${DAY}T14:00`, allowsModify: false, sourceType: 'subscribed', editable: false, reason: 'readOnlyCalendar' }),
  mk({ eventId: 'x1', title: '歯医者', start: `${DAY}T15:00`, end: `${DAY}T16:00` }),
];
async function mockNative(page, { fail = false } = {}) {
  await page.addInitScript(({ cals, details, fail }) => {
    const M = window.__mock = { calls: [], details: JSON.parse(JSON.stringify(details)), fail };
    const brief = (d) => ({ id: d.id, eventId: d.eventId, itemId: d.itemId, externalId: d.externalId, calendarId: d.calendarId, title: d.title, start: d.start, end: d.end, all: d.all, place: d.place, notes: d.notes, recurring: d.recurring, occurrenceDate: d.occurrenceDate, modifiedAt: d.modifiedAt, requestId: null });
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios', nativeCallback: () => 'cb-1',
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: JSON.parse(JSON.stringify(opts ?? {})), t: performance.now() });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: 'granted' };
          case 'listCalendars': return { calendars: cals };
          case 'listEvents': return { events: M.details.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from).map(brief) };
          case 'getEvent': { const d = M.details.find((x) => x.eventId === opts.eventId); if (!d) throw { code: 'NOT_FOUND' }; return JSON.parse(JSON.stringify(d)); }
          case 'updateExternalEvent': {
            await new Promise((r) => setTimeout(r, 120)); // iPhone 側の書き込みの待ち
            if (M.fail) throw { code: 'UNKNOWN', message: 'x' };
            const d = M.details.find((x) => x.eventId === opts.eventId); d.start = opts.start; d.end = opts.end; d.id = `${d.eventId}@${d.start}`; d.modifiedAt += 1000;
            return { ...brief(d), modifiedAt: d.modifiedAt };
          }
          case 'updateEvent': return { eventId: opts.eventId, modifiedAt: 1763100009000, calendarId: opts.calendarId };
          case 'notifyStatus': return { status: 'denied' };
          case 'notifySync': case 'notifyClear': return { scheduled: 0, removed: 0, skipped: 0 };
          case 'selectionHaptic': case 'impactHaptic': case 'notificationHaptic': return { performed: true };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, details: DETAILS, fail });
}
const WRITE = ['updateExternalEvent', 'updateEvent', 'createEvent', 'deleteEvent', 'deleteExternalEvent'];
const writes = (page) => page.evaluate((w) => window.__mock.calls.filter((c) => w.includes(c.method)), WRITE);
async function bootNative(page, o = {}) {
  await mockNative(page, o);
  await P3.boot(page, { events: [ev('e1', '会議', `${DAY}T09:00`, `${DAY}T10:00`), ev('lk', 'リンク会議', `${DAY}T11:00`, `${DAY}T12:00`, { nativeLink: { v: 2, state: 'linked', calendarId: 'cal-1', requestId: 'r1', eventId: 'lk-x', itemId: 'lk-i' } })], tasks: [], notes: [], stage: 4, ...o.boot });
  await enableCalendars(page);
  await expect(page.locator('.mday .mdcard.ext', { hasText: '歯医者' })).toHaveCount(1);
  await page.evaluate(() => { window.__mock.calls.length = 0; window.__duoMoveLog = []; });
}
// iPhone の予定のカード（id はネイティブの予定の id と回の日時からできている）
const extCard = async (page, title) => `.mday .mdcard.ext[data-event="${(await page.locator('.mday .mdcard.ext', { hasText: title }).getAttribute('data-event')).replace(/"/g, '\\"')}"]`;
test('iPhone の予定のカード: 長押しで 14 へ → updateExternalEvent（その回だけ・日付と時刻だけ。題名とメモは送らない）。表示は先に変わり、カレンダー側と同じ日時になる。元に戻すも同じ経路', async ({ page }) => {
  await bootNative(page);
  const src = await extCard(page, '歯医者');
  expect(await page.locator(src).getAttribute('aria-label')).toBe('予定、15時00分、16時00分まで、歯医者、iPhone、家族');
  await carry(page, src, cell(D14));
  await expect(page.locator('.gchip.on .gcl')).toHaveCount(1); expect(await css(page, '.gchip .gcl', 'backgroundColor')).toBe('rgb(166, 102, 92)'); // 印の線はカレンダーの色 #d93025 をくすませた左の線 #A6665C（第19.4版 design/36。保存・EventKit の色は元のまま）
  await page.mouse.up(); await page.waitForTimeout(40);
  await expect(page.locator(`${cell(D14)} .chip`, { hasText: '歯医者' })).toHaveCount(1); // 書き込みを待たずに先の日へ出る
  expect((await writes(page)).length <= 1).toBe(true);
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  const w = (await writes(page))[0];
  expect(w.method).toBe('updateExternalEvent'); expect([w.opts.start, w.opts.end]).toEqual([`${D14}T15:00`, `${D14}T16:00`]);
  expect(w.opts.title).toBeUndefined(); expect(w.opts.notes).toBeUndefined(); expect(w.opts.eventId).toBe('x1');
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  expect(await page.locator('#status').textContent()).toBe('歯医者を11月14日土曜日へ移しました');
  await expect(page.locator(`${cell(DAY)} .chip`, { hasText: '歯医者' })).toHaveCount(0);
  await undo(page);
  await expect.poll(async () => (await writes(page)).length).toBe(2);
  const u = (await writes(page))[1]; expect(u.method).toBe('updateExternalEvent'); expect([u.opts.start, u.opts.end]).toEqual([`${DAY}T15:00`, `${DAY}T16:00`]);
  await expect(page.locator('.mday .mdcard.ext', { hasText: '歯医者' })).toHaveCount(1);
  expect(await dbEvs(page).then((l) => l.map((e) => e.id).sort())).toEqual(['e1', 'lk']); // iPhone の予定を Duo の保存先へ写していない
});
test('M-17 読み取り専用の iPhone の予定: 見た目は変えず、長押しで持ち上がらない。理由を出して、書き込み 0', async ({ page }) => {
  await bootNative(page);
  const ro = await extCard(page, '祝日の予定');
  await hold(page, await P3.center(page, ro), 520);
  await expect(page.locator('.gchip, .ghole, .lifted')).toHaveCount(0);
  await expect(toast(page)).toBeVisible(); expect((await toast(page).locator('span').textContent()).length > 4).toBe(true); // 理由の文（今の REASON_TEXT）
  await page.mouse.up(); await page.waitForTimeout(300);
  expect(await writes(page)).toEqual([]);
  await expect(page.locator('#editor[open], #xdetail[open]')).toHaveCount(0);
});
test('M-24 iPhone への書き込みが断られた: 先に変えた表示を元へ戻し、「移せませんでした。」。カードは元の日に残る', async ({ page }) => {
  await bootNative(page, { fail: true });
  const src = await extCard(page, '歯医者');
  await dropOn(page, src, cell(D14), { settle: 500 });
  await expect(toast(page).locator('span')).toHaveText('移せませんでした。'); await expect(toast(page).locator('button')).toHaveCount(0);
  await expect(page.locator(src)).toHaveCount(1); await expect(page.locator(`${cell(D14)} .chip`, { hasText: '歯医者' })).toHaveCount(0);
  expect((await mvlog(page)).some((x) => x.ev === 'haptic' && x.kind === 'warning')).toBe(true);
});
test('M-18 iPhone にもつながった Duo の予定: IndexedDB を先に直し、送信待ち経由で updateEvent（日付の部分だけ・時刻はそのまま）', async ({ page }) => {
  await bootNative(page);
  await dropOn(page, cardSel('event', 'lk'), cell(D14));
  const e = (await dbEvs(page)).find((x) => x.id === 'lk'); expect([e.start, e.end]).toEqual([`${D14}T11:00`, `${D14}T12:00`]);
  await expect(toast(page).locator('span')).toHaveText('14日（土）へ移しました');
  await expect.poll(async () => (await writes(page)).map((w) => w.method), { timeout: 8000 }).toEqual(['updateEvent']);
  const w = (await writes(page))[0];
  expect([w.opts.start, w.opts.end]).toEqual([`${D14}T11:00`, `${D14}T12:00`]); expect(w.opts.eventId).toBe('lk-x');
  // つながっていない Duo の予定は iPhone へ書かない
  await dropOn(page, cardSel('event', 'e1'), cell(D16));
  await page.waitForTimeout(1200);
  expect((await writes(page)).map((x) => x.method)).toEqual(['updateEvent']);
});

// ---------- 保存の形 ----------
test('保存の形は変えない: IndexedDB の版 6・ストアの並びは同じ。動かしても、ノートは date だけ・タスクは due と updatedAt だけ・予定は start/end と updatedAt だけが変わる（本文は 1 文字も変わらない・旧メモ由来の sourceDate と id は残る）', async ({ page }) => {
  const old = note('memo-2026-11-12', '2026年11月12日（木）\r\n旧メモの本文\n\n- [ ] 　全角の空白\n  ｎ', DAY, { sourceDate: DAY, sourceHeading: true, folderId: 'folder-daily-memos', createdAt: 3, ink: null });
  await P3.boot(page, { notes: [old, note('n1', '買い物\n牛乳', DAY)], stage: 4 });
  const meta = () => page.evaluate(async () => { const name = (await indexedDB.databases()).find((d) => d.name.startsWith('duo-calendar')); const db = await new Promise((res) => { const r = indexedDB.open(name.name); r.onsuccess = () => res(r.result); }); const o = { version: db.version, stores: [...db.objectStoreNames].sort(), idx: Object.fromEntries([...db.objectStoreNames].map((s) => [s, [...db.transaction(s).objectStore(s).indexNames].sort()])) }; db.close(); return o; });
  const m0 = await meta(); expect(m0.version).toBe(6);
  const b = { e: await dbEvs(page), t: await dbTasks(page), n: await dbNotes(page) };
  const noToast = () => page.evaluate(() => document.querySelector('#native-toast')?.remove()); // 下の札が、日の欄の下の方のカードに重なるので片づけてから次をつかむ
  await dropOn(page, cardSel('note', old.id), cell(D14)); await noToast(); await dropOn(page, cardSel('note', 'n1'), cell(D14)); await noToast();
  await dropOn(page, cardSel('task', 't1'), cell(D14)); await noToast(); await dropOn(page, cardSel('event', 'e1'), cell(D14));
  expect(await meta()).toEqual(m0); // 版・ストア・索引は同じ
  const a = { e: await dbEvs(page), t: await dbTasks(page), n: await dbNotes(page) };
  for (const n0 of b.n) { const n1 = a.n.find((x) => x.id === n0.id); expect(n1).toEqual({ ...n0, date: D14 }); expect(n1.body).toBe(n0.body); }
  expect(a.n.find((x) => x.id === old.id).sourceDate).toBe(DAY);
  const t0 = b.t[0], t1 = a.t[0]; expect({ ...t1, updatedAt: 0 }).toEqual({ ...t0, due: { date: D14, time: '18:00' }, updatedAt: 0 }); expect(Object.keys(t1).sort()).toEqual(Object.keys(t0).sort());
  const e0 = b.e.find((x) => x.id === 'e1'), e1 = a.e.find((x) => x.id === 'e1');
  expect({ ...e1, updatedAt: 0 }).toEqual({ ...e0, start: `${D14}T09:00`, end: `${D14}T10:00`, updatedAt: 0 }); expect(a.e.find((x) => x.id === 'e2')).toEqual(b.e.find((x) => x.id === 'e2'));
  // 旧形式への書き戻し（memoTextOf）: 動かしたあとも、元のメモの本文がそのまま取り出せる
  const memo = await page.evaluate(async (id) => { const { memoTextOf, noteDateOf } = await import('/js/notes-model.js'); const n = await (await import('/js/db.js')).getNote(id); return { text: memoTextOf(n), date: noteDateOf(n) }; }, old.id);
  expect(memo).toEqual({ text: '旧メモの本文\n\n- [ ] 　全角の空白\n  ｎ', date: D14 });
});

test('バックアップ・検索: 動かしたあとも、書き出しは版 6（version・schema）で、ノートは新しい date と元の sourceDate を持つ。検索はノート・タスクを先の日で見つける', async ({ page }) => {
  const old = note('memo-2026-11-12', '2026年11月12日（木）\n旧メモの本文', DAY, { sourceDate: DAY, sourceHeading: true });
  await P3.boot(page, { notes: [old] });
  await dropOn(page, cardSel('note', old.id), cell(D14)); await dropOn(page, cardSel('task', 't1'), cell(D14));
  await page.waitForTimeout(6300);
  // 画面の書き出しを通す（設定 › バックアップ）: ファイルの中身を読む
  await clickSettings(page); await page.getByRole('button', { name: 'バックアップ' }).click();
  await expect(page.getByRole('button', { name: 'JSONを書き出す' })).toBeVisible();
  const dl = Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSONを書き出す' }).click()]).then((x) => x[0]);
  const file = await (await dl).path(), json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.version).toBe(6); expect(json.schema).toBe(6);
  const n = json.notes.find((x) => x.id === old.id), t = json.tasks.find((x) => x.id === 't1');
  expect([n.date, n.sourceDate, n.body]).toEqual([D14, DAY, old.body]); expect(t.due).toEqual({ date: D14, time: '18:00' });
});

// ---------- K-13 月のマスのチップがはみ出さない ----------
for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ['閉じた横', SIZES.closedLandscape]]) {
  test(`K-13 月のマスのチップ（${name}）: タスク・ノートの名前のチップを足しても、マスの枠からはみ出さない・文字が隣のマスにかからない。入りきらない分は +N`, async ({ page }) => {
    const long = 'とても長い名前のタスクやノートの題名がここに入ります';
    await P3.boot(page, { size, stage: 1,
      events: [ev('e1', `${long}予定`, `${DAY}T09:00`, `${DAY}T10:00`), ev('e2', 'ランチ', `${DAY}T12:00`, `${DAY}T13:00`)],
      tasks: [task('t1', `${long}タスク`, { date: DAY }), task('t2', 'T2', { date: DAY }, { createdAt: 2 }), task('t3', 'T3', { date: D13 })],
      notes: [note('n1', `${long}ノート`, DAY), note('n2', 'N2', DAY, { createdAt: 6 }), note('n3', `${long}13日`, D13)] });
    const res = await page.evaluate((days) => days.map((k) => {
      const c = [...document.querySelectorAll(`.mpull.browse .week .day[data-date="${k}"]`)].find((x) => x.getClientRects().length), r = c.getBoundingClientRect(), wk = c.closest('.week').getBoundingClientRect();
      const chips = [...c.querySelectorAll('.chip.xk, .chip.timed')].filter((e) => Number(getComputedStyle(e).opacity) > 0.5).map((e) => { const b = e.getBoundingClientRect(), st = e.querySelector('.st').getBoundingClientRect(), cs = getComputedStyle(e); return { l: b.left, r: b.right, t: b.top, b: b.bottom, clip: cs.overflowX, textR: Math.min(st.right, b.right), kind: e.dataset.task ? 'task' : e.dataset.note ? 'note' : 'event' }; });
      const plus = document.querySelector(`.mpull.browse .plus.dyn[data-plus="${k}"]`);
      return { cell: { l: r.left, r: r.right, t: r.top, b: r.bottom }, wkB: wk.bottom, chips, plus: plus && !plus.hidden ? plus.textContent : '' };
    }), [DAY, D13]);
    for (const d of res) {
      for (const c of d.chips) {
        expect(c.l >= d.cell.l - 0.5 && c.r <= d.cell.r + 0.5).toBe(true); // 左右は自分のマスの中
        expect(c.b <= d.wkB + 0.5).toBe(true); // 行の下へはみ出さない
        expect(['hidden', 'clip']).toContain(c.clip); expect(c.textR <= d.cell.r + 0.5).toBe(true); // 長い名前は切る（隣のマスにかからない）
      }
      const tops = d.chips.map((c) => Math.round(c.t)); expect(new Set(tops).size).toBe(tops.length); // 重ならない（1 段に 1 つ）
    }
    const d12 = res[0], total = 2 + 2 + 2, shown = d12.chips.length;
    expect(shown <= 4).toBe(true); expect(d12.plus).toBe(`+${total - shown}`); // 入りきらない分は +N
    expect(d12.chips.map((c) => c.kind)).toEqual(['event', 'event', 'task', 'task'].slice(0, shown)); // 予定 → タスク → ノート の順
  });
}

// ---------- 速さ（追記7） ----------
// 測り方: 画面の中で pointerdown／pointerup／「元に戻す」の click の時刻（performance.now）を控え、アプリの記録（window.__duoMoveLog）の
//   lift（持ち上げの動き始め）・shown（先の日の DOM が出来た）・painted（その次の描画のコマ）との差を取る。3 回の中央の値で見る（ゆらぎで落ちないように）。
//   時刻は、起動より前に window の capture に仕込んだ受け口で控える（アプリの受け口より先）。持ち上げは「0.35 秒の長押し待ち」を引いた値。上限: 動き始め 100ms・落としてから表示 300ms（実機の基準。ここでは試験機の値）。
async function perfHooks(page) { // 起動より前に仕込む（window の capture で、アプリの受け口より先に時刻を控える）
  await page.addInitScript(() => {
    const T = window.__pt = { down: 0, up: 0, click: 0, frames: [], long: 0, moveMax: 0 };
    window.addEventListener('pointerdown', () => { T.down = performance.now(); }, true);
    window.addEventListener('pointerup', () => { T.up = performance.now(); }, true);
    window.addEventListener('click', (e) => { if (e.target.closest?.('#native-toast button')) T.click = performance.now(); }, true);
    try { new PerformanceObserver((l) => { T.long += l.getEntries().length; }).observe({ type: 'longtask', buffered: false }); } catch { /* WebKit には無い */ }
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'pointermove') T.moveMax = Math.max(T.moveMax, e.processingEnd - e.processingStart); }).observe({ type: 'event', durationThreshold: 16 }); } catch { /* */ }
  });
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function measure(page, kind, id) {
  const sel = cardSel(kind, id), out = { lift: [], dropShown: [], dropPainted: [], undoShown: [], undoPainted: [], frameMax: [], frameMean: [] };
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.__duoMoveLog = []; window.__pt.frames = []; document.querySelector('#native-toast')?.remove(); }); // 前の回の札（下の端）がカードに重ならないよう片づける
    const a = await P3.center(page, sel), b = await P3.center(page, cell(D14));
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(520);
    await page.evaluate(() => { const T = window.__pt; let last = performance.now(); T.run = true; const f = (t) => { if (!T.run) return; T.frames.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame((t) => { last = t; requestAnimationFrame(f); }); });
    await page.mouse.move(b.x, b.y, { steps: 30 });
    await page.evaluate(() => { window.__pt.run = false; });
    await page.mouse.up(); await page.waitForTimeout(450);
    let r = await page.evaluate(() => ({ T: { ...window.__pt, frames: [...window.__pt.frames] }, L: window.__duoMoveLog.map((x) => ({ ev: x.ev, t: x.t })) }));
    const at = (L, ev, after = 0) => L.find((x) => x.ev === ev && x.t >= after)?.t;
    out.lift.push(at(r.L, 'lift') - r.T.down - 350);
    out.dropShown.push(at(r.L, 'shown', r.T.up) - r.T.up); out.dropPainted.push(at(r.L, 'painted', r.T.up) - r.T.up);
    const fr = r.T.frames.slice(1); out.frameMax.push(Math.max(...fr)); out.frameMean.push(fr.reduce((s, v) => s + v, 0) / fr.length);
    if (!(await toast(page).getByRole('button', { name: '元に戻す' }).count())) throw new Error(`落とせていない ${kind} ${i}: ${JSON.stringify({ a, b, log: r.L.map((x) => x.ev), toast: await toast(page).count() ? await toast(page).innerText() : '', top: await page.evaluate(() => document.elementFromPoint(191, 566)?.className) })}`);
    await toast(page).getByRole('button', { name: '元に戻す' }).click(); await page.waitForTimeout(450);
    r = await page.evaluate(() => ({ T: { ...window.__pt }, L: window.__duoMoveLog.map((x) => ({ ev: x.ev, t: x.t })) }));
    out.undoShown.push(at(r.L, 'shown', r.T.click) - r.T.click); out.undoPainted.push(at(r.L, 'painted', r.T.click) - r.T.click);
    await page.waitForTimeout(250);
  }
  const extra = await page.evaluate(() => ({ long: window.__pt.long, moveMax: window.__pt.moveMax }));
  return { ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(med(v) * 10) / 10])), ...extra };
}
const savePerf = (name, data) => { const dir = process.env.V193_PERF; if (!dir) return; fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/perf-${name}.json`, JSON.stringify(data, null, 1)); };
for (const [name, size] of [['閉じた縦', SIZES.closedPortrait], ['閉じた横', SIZES.closedLandscape]]) {
  test(`速さ（${name}）: 持ち上げ・落とす・元に戻すの動き始めは 100ms 以内、落としてから先の日に表示され終わるまで 300ms 以内。運んでいる間に長いタスクなし（予定・タスク・ノート）`, async ({ page }, info) => {
    test.setTimeout(120000);
    // カードのある日（予定 2・タスク 2・ノート 6＝10 枚。3 種類の 1 枚目が画面に入る数）と、ほかの日にも予定 40 件・タスク 20 件・ノート 20 件を入れた月で測る
    const d2 = (i) => { const d = 1 + (i % 28); return `2026-11-${String(d === 12 ? 13 : d).padStart(2, '0')}`; }; // 12 日（カードを測る日）は除く
    const many = { events: Array.from({ length: 2 }, (_, i) => ev(`e${i + 1}`, `予定${i + 1}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`)).concat(Array.from({ length: 40 }, (_, i) => ev(`o${i}`, `ほか${i}`, `${d2(i)}T10:00`, `${d2(i)}T11:00`))),
      tasks: Array.from({ length: 2 }, (_, i) => task(`t${i + 1}`, `タスク${i + 1}`, { date: DAY }, { createdAt: i })).concat(Array.from({ length: 20 }, (_, i) => task(`ot${i}`, `ほかのタスク${i}`, { date: d2(i + 15) }))),
      notes: Array.from({ length: 6 }, (_, i) => note(`n${i + 1}`, `ノート${i + 1}\n本文`, DAY, { createdAt: i })).concat(Array.from({ length: 20 }, (_, i) => note(`on${i}`, `ほかのノート${i}\n本文の行`, d2(i + 16), { createdAt: 20 + i }))) };
    await perfHooks(page);
    await P3.boot(page, { size, stage: size.width > size.height ? 4 : 7, ...many });
    await page.evaluate(() => { window.__pt.long = 0; });
    const res = {};
    for (const [k, id] of [['event', 'e1'], ['task', 't1'], ['note', 'n1']]) {
      if (size.width > size.height) await page.locator(cardSel(k, id)).evaluate((e) => e.scrollIntoView({ block: 'center' })); // 閉じた横: 日の欄の中を送ってカードを出す（左の月は動かない）
      const m = res[k] = await measure(page, k, id);
      expect(m.lift, `${k} 持ち上げ`).toBeLessThanOrEqual(100); expect(m.dropShown, `${k} 落とす`).toBeLessThanOrEqual(100); expect(m.undoShown, `${k} 元に戻す`).toBeLessThanOrEqual(100);
      expect(m.dropPainted, `${k} 落としてから表示`).toBeLessThanOrEqual(300); expect(m.undoPainted, `${k} 元に戻してから表示`).toBeLessThanOrEqual(300);
      if (info.project.name === 'chromium') expect(m.long, `${k} 長いタスク`).toBe(0);
    }
    expect(Object.keys(res).length).toBe(3);
    savePerf(`${info.project.name}-${size.width}x${size.height}`, res);
  });
}
test('速さ（CPU を 4 倍に落とした Chromium）: 落としてから先の日に表示され終わるまで 300ms 以内、動き始めは 100ms 以内（閉じた縦・予定・タスク・ノート）', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'CDP の Emulation.setCPUThrottlingRate は Chromium だけ');
  test.setTimeout(180000);
  await perfHooks(page);
  await P3.boot(page, { stage: 7, events: [...P3.EVENTS, ...Array.from({ length: 40 }, (_, i) => ev(`o${i}`, `ほか${i}`, `2026-11-${String(1 + (i % 28)).padStart(2, '0')}T10:00`, `2026-11-${String(1 + (i % 28)).padStart(2, '0')}T11:00`))] });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const res = {};
  for (const [k, id] of [['event', 'e1'], ['task', 't1'], ['note', 'n1']]) {
    const m = res[k] = await measure(page, k, id);
    expect(m.dropPainted, `${k} 落としてから表示（4 倍落とし）`).toBeLessThanOrEqual(300); expect(m.undoPainted, `${k} 元に戻してから表示（4 倍落とし）`).toBeLessThanOrEqual(300);
    expect(m.lift, `${k} 持ち上げ（4 倍落とし）`).toBeLessThanOrEqual(100); expect(m.dropShown, `${k} 落とす（4 倍落とし）`).toBeLessThanOrEqual(100); expect(m.undoShown, `${k} 元に戻す（4 倍落とし）`).toBeLessThanOrEqual(100);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  savePerf('chromium-cpu4-466x678', res);
});
