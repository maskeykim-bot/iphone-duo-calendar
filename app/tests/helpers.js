import { expect, test } from '@playwright/test';

// 第19.2版 S11c（design/34 §9.2・11:29 の決定）: 閉じた画面はいつもカレンダーから始まる（ホームは「…」→「ホーム」）。
// 第19.1版までに書いた spec は「閉じた画面はホームから始まる」前提なので、下の名前の spec だけ、起動のあと「…」→「ホーム」でホームを開いてから始める
//（本物の操作で開く。保存値は書かない）。ここに無い spec（新しく足す spec・品質のひな形 closed-pull-v20 / note-ime-r70 など）は仕様どおりカレンダーから始まる。
// spec ごとに変えたいときは openApp の opts.home（true＝ホームから／false＝カレンダーから）。
const HOME_START_SPECS = new Set(['allbtn-look', 'calendar-picker', 'calendar-settings', 'calendar-visibility', 'categories', 'category-retarget', 'chip-style', 'closed-month-s1', 'crud', 'curl-app', 'curl-native', 'curl-painter', 'curl-parts', 'curl-perf', 'date-nav', 'dated-notes', 'datetime', 'direct-input', 'edit-sheet', 'ext-edit', 'focus-keyboard', 'focus-modes', 'focus-tasks', 'focus-transition', 'holidays', 'home-list', 'home', 'kb-accessory-s3', 'layout-metrics', 'layout', 'memo-mark-list-search', 'memo', 'month-all', 'month-bottom', 'month-pull', 'move-to-day', 'native', 'note-sheet', 'notes-checklist', 'notes-editor', 'notes-folders', 'notes-rich-s3', 'notes-search-large', 'notify-backfill', 'notify-ui', 'notify', 'open-portrait-s2', 'open-portrait', 'pages', 'panel', 'paste', 'persist', 'popup-dismiss', 'portrait-fold-timeline', 'posture', 'press-sheet-type-s4', 'recur', 'ref-layout', 'reminder-add', 'reminder-delete', 'reminder-edit', 'reminder-gate', 'reminder-notify-ui', 'reminder-notify', 'reminder-removed', 'reminder-settings', 'reminder-tasks', 'review-fixes', 'rokuyo-setting', 'rokuyo', 's5-fixes', 's6-fixes', 's7a-notes', 's7b-high', 's7c-mid', 's7e', 's8-fixes', 'safe-layout', 'screenshots', 'search-backup', 'search-tasks', 'settings-hierarchy', 'strip-tasks-notes', 'sw', 'swipe', 'timeline', 'touch-check-tap', 'touch-check', 'tt-spread']);
const homeStart = (opts) => {
  if (opts.home != null) return !!opts.home;
  if (opts.fresh) return false;
  try { return HOME_START_SPECS.has(test.info().file.split('/').pop().replace(/\.spec\.js$/, '')); } catch { return false; }
};
import { CAT_IDS } from '../js/categories.js';

// テストでは旧キー（work/private）や既定カテゴリのキー（family/out/other）で指定できる。

// 第19.1版 S3: ノート本文は行ごとの div（contenteditable）。保存の文字は el.value で読む（記号つき）。
export const bodyIs = (loc, v) => (v instanceof RegExp ? expect.poll(() => loc.evaluate((e) => e.value)).toMatch(v) : expect.poll(() => loc.evaluate((e) => e.value)).toBe(v));

export const catId = (k) => CAT_IDS[k] ?? k;

export const SIZES = {
  closedPortrait: { width: 466, height: 678 },
  closedLandscape: { width: 678, height: 466 },
  openPortrait: { width: 626, height: 890 },
  openLandscape: { width: 890, height: 626 },
  // 第10版（見本 ref の画素から）。画面サイズ・折り目は固定せず、どちらの組でも同じ検査を通す。
  openPortrait669: { width: 669, height: 951 },
  openLandscape951: { width: 951, height: 669 },
};
export const OPEN_SIZES = [SIZES.openPortrait, SIZES.openPortrait669, SIZES.openLandscape, SIZES.openLandscape951];

// 2026-11-12 9:41 JST に固定して起動する。
// 第16版 PR13: 新規の既定は 左ホーム・右月。第15版までの spec は「保存済みの 左月・右時間」の端末として起動する
//（既存の左右選択は尊重される）。新規の既定を調べる spec だけ { fresh: true } を渡す。
export const LEGACY_PAGES = { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false };
export async function openApp(page, size = SIZES.closedPortrait, query = '', opts = {}) {
  if (!opts.fresh) {
    await page.addInitScript(({ q, pages }) => {
      const ns = new URLSearchParams(q).get('ns'), key = `duo.ui.v1${ns ? `.${ns}` : ''}`;
      let s = {}; try { s = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { s = {}; }
      if (!s.pages) localStorage.setItem(key, JSON.stringify({ ...s, pages }));
    }, { q: query, pages: LEGACY_PAGES });
  }
  // 第19版 PR6: 月タブ（閉じた画面・開いた縦）は「月を引く画面」で、既定の型は 2週。第18版までの spec は月全体（6行）が見える前提なので、
  // 型が保存されていなければ「月」で起動する。既定（2週）を調べる spec は monthFormInit(page, 'two') を先に呼ぶ。
  if (!opts.fresh) await page.addInitScript(({ q, closedSize }) => { // fresh（まっさらな端末）では保存キーを書かない（既存端末の証拠になるため）
    const ns = new URLSearchParams(q).get('ns'), key = `duo.ui.v1${ns ? `.${ns}` : ''}`;
    let s = {}; try { s = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { s = {}; }
    if (!s.monthForm) localStorage.setItem(key, JSON.stringify({ ...s, monthForm: 'month' }));
    s = JSON.parse(localStorage.getItem(key) || '{}');
    if (!s.monthDay) localStorage.setItem(key, JSON.stringify({ ...s, monthDay: 'time' })); // 日の部分は 時間軸（.tlev）で起動。既定（予定）を調べる spec は monthFormInit を先に呼ぶ
  }, { q: query, closedSize: Math.min(size.width, size.height) < 600 });
  // 第19.5版: 閉じた画面の「月を固定」（既定オン）。第19.4版までの spec は月ごと送れる前提なので、保存が無ければ固定なしで起動する。固定を調べる spec は monthPin を先に書く
  if (!opts.fresh) await page.addInitScript((q) => { const ns = new URLSearchParams(q).get('ns'), key = `duo.ui.v1${ns ? `.${ns}` : ''}`; let s = {}; try { s = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { s = {}; } if (s.monthPin === undefined) localStorage.setItem(key, JSON.stringify({ ...s, monthPin: false })); }, query);
  // 第19.1版 S4: シートは下から 0.25 秒で出る（H-02）。既存の spec は出きった位置の寸法を測るので、出る動きは止めておく。
  // 動きそのものを調べる spec は { motion: true } を渡す（tests/press-sheet-type-s4.spec.js）。閉じ終わるまでの 0.25 秒は動きを止めても同じ（JS の待ち）。
  if (!opts.motion) await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'test-no-sheet-motion'; st.textContent = 'dialog,dialog[open],dialog.sheet-out,#scrim{animation:none!important}'; document.head.append(st); }); });
  // 第19.1版 S5 H-16: 開発用の表示（画面寸法・キーボード計測・タッチ確認）は既定で隠す。既存の spec は出る前提なので helpers が dev を立てる。隠れることを調べる spec は { nodev: true }。
  if (!opts.nodev) await page.addInitScript(() => { try { localStorage.setItem('duo.dev', '1'); } catch { /* */ } });
  await page.setViewportSize(size);
  await page.clock.setFixedTime(new Date('2026-11-12T09:41:00+09:00'));
  await page.goto(`/index.html${query}`);
  await page.waitForSelector('html[data-ready]');
  // 第19.2版 S11c（design/34 §9.2）: 閉じた画面はいつもカレンダーから始まる。ホームから始める spec（上の HOME_START_SPECS か { home: true }）は「…」→「ホーム」で開く。
  if (Math.min(size.width, size.height) < 600 && homeStart(opts) && (await page.locator('.shell.closed .cmore').count())) await closedGo(page, 'ホーム');
}
// 閉じた画面で読み込み直したあと（起動はカレンダー）、ホームへ戻る
export async function reloadHome(page) { await page.reload(); await page.waitForSelector('html[data-ready]'); if (isClosedSize(page)) await closedGo(page, 'ホーム'); }
export async function loadSample(page) {
  const b = page.getByRole('button', { name: 'サンプルを入れる' }).first();
  if (await b.isVisible()) await b.click();
  else { // 月だけの画面（開いた縦など）は設定メニューから入れる
    await openMenu(page, 'details');
    await page.locator('#menu').getByRole('button', { name: 'サンプルを入れる' }).click();
    await expect(page.locator('#menu')).toBeHidden(); // 選んで閉じる動き（0.25秒）が終わってから
  }
  await expect(page.getByRole('status')).toHaveText('サンプルの予定を入れました。');
}
// 第19.2版 S11c（design/34 §9.1-9・§9.2）: 閉じた画面に下のタブはない。月＝カレンダー（‹ カレンダーで戻る）、ホームと週の時間軸は「…」から、
// 日の時間軸はホームの「タイムライン ›」から。開いた縦・横のタブは今までどおり（本物のボタンを返す）。
// v19.3 征希さんの要望（つまみだけで段・月ごとスクロール）で仕様変更: 閉じた縦の日の欄の時間軸（B・C）は中でスクロールしない。開いたときは最初の予定の1時間前より上（終日の行も）を畳んでいる（v19.2 までは日の欄の中を送った先に隠れていて、Playwright が送って出していた）。
// 畳んだ所にある物（終日のピル・早い時刻）を押す前に、時間軸の右上の「前の時間」で開く
export async function dayUnfold(page) { const b = page.locator('.mpull.browse[data-stage] .mdfold button'); if (await b.count()) { await b.click(); await page.waitForTimeout(150); } }
export const isClosedSize = (page) => { const v = page.viewportSize(); return !!v && Math.min(v.width, v.height) < 600; };
export async function openMore(page) { await page.locator('.cmore').click(); await expect(page.getByRole('menu')).toBeVisible(); }
export async function moreGo(page, name) { await openMore(page); await page.getByRole('menuitem', { name }).click(); }
export const CLOSED_DAY = '.shell.closed.tv-day, .shell.closed.cal .mpull.browse .mday:is([data-dg="B"], [data-dg="C"])';
export async function closedGo(page, name) {
  const back = page.locator('.cback');
  if (name === '月') { if (await back.count()) await back.click(); await expect(page.locator('.shell.closed.cal')).toHaveCount(1); return; }
  if (name === 'ホーム') { if (!(await page.locator('.shell.closed.home:not(.strp)').count())) await moreGo(page, /ホーム/); await expect(page.locator('.home.listview')).toBeVisible(); return; }
  if (name === '週') { if (!(await page.locator('.shell.closed.tv-week').count())) await moreGo(page, '週の時間軸'); await expect(page.locator('.shell.closed.tv-week')).toHaveCount(1); return; }
  if (name === '日') { // 第19.2版 S11e（design/34 §15-④）: 閉じた画面に日の時間軸の画面（28 §1）はない。ホームの「タイムライン ›」で、カレンダーの日の欄の時間軸 B（今日）を開く。日の欄がない「全部」の月のときだけ、今までの日の画面
    if (await page.locator(CLOSED_DAY).count()) return;
    await closedGo(page, 'ホーム');
    await page.locator('.home.listview .hgo[data-act="homego"][data-to="time"]').first().click();
    await expect(page.locator(CLOSED_DAY)).toHaveCount(1); return;
  }
  throw new Error(`closedGo: ${name}`);
}
// いま見ている表示（ホーム・日・週・月）。開いた画面は下のタブの aria-pressed、閉じた画面はタブがないので（design/34 §9.1-9）出ている面そのもので見る
export async function expectShown(page, name, shown = true) {
  if (!isClosedSize(page)) { await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', String(shown)); return; }
  const sel = { ホーム: '.shell.closed.home:not(.strp)', 日: CLOSED_DAY, 週: '.shell.closed.tv-week', 月: '.shell.closed.cal' }[name];
  await expect(page.locator(sel)).toHaveCount(shown ? 1 : 0);
}
// ノートの一覧の入口: 閉じた画面は日の欄の「ノート ›」（design/34 §9.1-7。右の列の「ノート」は消えた）、開いた横は帯の「ノート」
export async function openNoteList(page) {
  if (isClosedSize(page) && (await page.locator('.shell.closed .cmore').count())) {
    if (await page.locator('.shell.closed.strp .stripp[data-page="memo"]').count()) return;
    await closedGo(page, '月');
    if (!(await page.locator('.mday .mdnl').count())) await setStyle(page, '予定名'); // 「全部」の月には日の欄がない
    await page.locator('.mday .mdnl').click(); // click が見える所まで送ってから押す（描き直しの途中でも待つ）
    await expect(page.locator('.stripp[data-page="memo"]')).toBeVisible();
  } else await page.locator('[data-act="strip"][data-strip="memo"]').first().click();
}
// 設定・検索の入口: 閉じた画面は「…」→「設定」／「検索」（design/34 §9.1-5・6）、開いた画面は今までどおりのボタン
export async function clickSettings(page) { if (isClosedSize(page) && (await page.locator('.shell.closed .cmore').count())) await moreGo(page, '設定'); else await page.locator('[data-act="menu"]:visible').first().click(); }
export async function clickSearch(page) { if (isClosedSize(page) && (await page.locator('.shell.closed .cmore').count())) await moreGo(page, '検索'); else await page.locator('[data-act="search"]:visible').first().click(); }
// 閉じた7段の段を n にする（つまみ（上）のキー操作。34 §3）。閉じた画面の「日」（34 §15-④）は段1〜3 を段7 にするので、そのあと月の別の日を使う試験が段を戻すのに使う
export async function closedStage(page, n) {
  const g = page.locator('.mpull.browse .mgrab'); await g.focus();
  for (let i = 0; i < 8; i++) { const s = Number(await page.locator('.mpull').getAttribute('data-stage')); if (s === n) break; await page.keyboard.press(s < n ? 'ArrowUp' : 'ArrowDown'); }
  await expect(page.locator('.mpull')).toHaveAttribute('data-stage', String(n)); await page.waitForTimeout(450);
}
export const tab = (page, name) => (isClosedSize(page) ? { click: () => closedGo(page, name) } : page.getByRole('button', { name, exact: true }));
export const layout = (page) => page.evaluate(() => document.body.dataset.layout);

// 新規予定のカレンダー選択（1行 → 一覧）。type は 'duo'（カテゴリ id）か 'iphone'（カレンダー id）。
export async function pickDest(page, type, id) {
  const dlg = page.locator('#editor');
  await dlg.locator('#f-dest').click();
  await dlg.locator(`#dest-pop .dopt[data-dtype="${type}"][data-did="${id}"]`).click();
  await expect(dlg.locator('#dest-pop')).toBeHidden();
}
// 日付は文字の欄、時刻は時刻のカプセルと時分のマスから（'2026/11/12 14:30' / '2026/11/12'）。分は5分刻みだけ選べる。
export async function setTimeUi(page, which, hhmm) {
  const dlg = page.locator('#editor');
  const cap = dlg.locator(which === 'start' ? '#f-stime' : '#f-etime');
  const [h, m] = hhmm.split(':').map(Number);
  if (m % 5) throw new Error(`UIでは5分刻みだけ: ${hhmm}`);
  await cap.click();
  // ダイヤルは輪。近い向きへ矢印キーで回し、値が合ったら同じカプセルをもう一度たたいて閉じる。
  for (const [col, want, mod] of [['#tp-h', h, 24], ['#tp-m', m, 60]]) {
    const read = async () => { const [ch, cm] = (await cap.textContent()).split(':').map(Number); return col === '#tp-h' ? ch : cm; };
    let cur = await read();
    if (cur === want) continue;
    const up = (((want - cur) % mod) + mod) % mod <= mod / 2;
    await dlg.locator(col).focus();
    for (let i = 0; i < 40 && cur !== want; i++) { await page.keyboard.press(up ? 'ArrowUp' : 'ArrowDown'); cur = await read(); }
  }
  await cap.click();
  await expect(dlg.locator('#tpop')).toBeHidden();
}
// 日付は日付のカプセルと小さな月から（'2026/11/12'）。月送りで目的の月まで進めて日をたたく。
export async function setDateUi(page, which, slash) {
  const dlg = page.locator('#editor');
  const [y, m] = slash.split('/').map(Number);
  const key = slash.replaceAll('/', '-');
  const cap = dlg.locator(which === 'start' ? '#f-start' : '#f-end');
  if (await cap.getAttribute('value') === slash) return; // 同じ日ならそのまま
  await cap.click();
  for (let i = 0; i < 240; i++) {
    const t = await dlg.locator('#dp-title').textContent();
    const [ty, tm] = t.match(/\d+/g).map(Number);
    const diff = (y - ty) * 12 + (m - tm);
    if (!diff) break;
    await dlg.locator(diff > 0 ? '#dp-next' : '#dp-prev').click();
  }
  await dlg.locator(`#dp-grid [data-day="${key}"]`).click();
  await expect(dlg.locator('#dpop')).toBeHidden();
}
export async function fillDateTime(page, which, text) {
  const dlg = page.locator('#editor');
  const [date, time] = text.split(' ');
  await setDateUi(page, which, date);
  if (time) await setTimeUi(page, which, time);
}
export async function fillEditor(page, f) {
  const dlg = page.locator('#editor');
  if (f.title !== undefined) await dlg.locator('#f-title').fill(f.title);
  // 新規も既存予定の編集も「カレンダー」1行から選ぶ
  if (f.cat) await pickDest(page, 'duo', catId(f.cat));
  if (f.cal) await pickDest(page, 'iphone', f.cal);
  if (f.all !== undefined) await dlg.locator('#f-all').setChecked(f.all);
  if (f.start !== undefined) await fillDateTime(page, 'start', f.start);
  if (f.end !== undefined) await fillDateTime(page, 'end', f.end);
  if (f.place !== undefined) await dlg.locator('#f-place').fill(f.place);
}
export async function addEvent(page, f) {
  await page.locator('[data-act="add"]:visible').first().click();
  await expect(page.locator('#editor')).toBeVisible();
  await fillEditor(page, f);
  await page.locator('#editor').getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#editor')).toBeHidden();
}

// 月の表現（手帳／予定名／全部）は設定メニューの「月の表現」から選ぶ。開いた縦には「手帳」がない。選ぶとメニューは閉じる。
export async function setStyle(page, name) {
  await openMenu(page, 'display');
  const mode = page.locator('#menu').getByRole('button', { name: '月の表現', exact: true });
  if (!(await mode.isVisible())) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await expect(page.locator('#menu')).toBeHidden(); return; }
  await mode.click();
  const b = page.locator('#m-variant').getByRole('button', { name, exact: true });
  if (await b.count()) await b.click(); else { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
  await expect(page.locator('#menu')).toBeHidden();
}
// 日セルは日付の位置を押す（予定名の帯・短冊が中央に重なるため）。
export const pickDay = (page, key) => page.locator(`[data-date="${key}"]`).click({ position: { x: 12, y: 10 } });

// 期間見出し（#ctitle / .stitle）。ダイアログ中（inert）でも読めるよう textContent。
// 期間の見出し（日付部分のみ。第14版の六曜 .hrk は除く。六曜の検査は rokuyo.spec.js）
export const period = (page) => page.evaluate(() => { const h = document.querySelector('#ctitle, .stitle')?.cloneNode(true); h?.querySelectorAll('.hrk').forEach((e) => e.remove()); return h?.textContent.trim() ?? ''; });
export const settle = (page) => page.waitForFunction(() => !document.documentElement.dataset.swiping);

// Pointer Events を直接送る。target を省くと開始点の要素に送る。
export async function swipe(page, { x0, y0, dx, dy = 0, type = 'touch', steps = 6, target = null, finish = 'up', second = false }) {
  await page.evaluate(({ x0, y0, dx, dy, type, steps, target, finish, second }) => {
    const first = target ? document.querySelector(target) : document.elementFromPoint(x0, y0);
    const fire = (name, x, y, o = {}) => first.dispatchEvent(new PointerEvent(name, {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: type, isPrimary: true,
      clientX: x, clientY: y, button: 0, buttons: name === 'pointerup' ? 0 : 1, ...o,
    }));
    fire('pointerdown', x0, y0);
    for (let i = 1; i <= steps; i++) {
      fire('pointermove', x0 + (dx * i) / steps, y0 + (dy * i) / steps);
      if (second && i === 2) fire('pointerdown', x0 + 30, y0, { pointerId: 2, isPrimary: false });
    }
    if (finish === 'cancel') fire('pointercancel', x0 + dx, y0 + dy);
    fire('pointerup', x0 + dx, y0 + dy);
  }, { x0, y0, dx, dy, type, steps, target, finish, second });
  await settle(page);
}

// 画面内の「見えている文字」の矩形を集め、重なりを返す。
export async function findTextOverlaps(page, { ignoreApp = false } = {}) {
  return page.evaluate((ignoreApp) => {
    const items = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest('script,style,[hidden],#status')) continue;
      if (el.closest('dialog:not([open])')) continue;
      if (el.closest('[inert]')) continue; // 全画面パネルの背面（操作・読み上げ対象外）
      if (ignoreApp && el.closest('#app')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const inFloat = !!el.closest('.tabs, .pgsw, .ctl');
      for (const r0 of range.getClientRects()) {
        // 浮動タブ・操作列は月の下に重ねて浮かせる設計。その下に隠れた文字（中心がタブ内）は見えないので対象外。
        if (!inFloat) { const hit = document.elementFromPoint(Math.min(Math.max((r0.left + r0.right) / 2, 0), vw - 1), Math.min(Math.max((r0.top + r0.bottom) / 2, 0), vh - 1)); if (hit?.closest('.tabs, .pgsw, .ctl')) continue; if (!el.closest('.mdh, .mdgrab') && hit?.closest('.mpull.browse .mday .mdh, .mpull.browse .mday .mdgrab')) continue; /* 第19.2版 S11e: 閉じた画面の日の欄の時間軸（34 §6.2・§15-④）は見出し 44 を貼り付ける（不透明）。その下へ送られた時刻の文字（中心が見出しの中）は見えないので対象外 */ }
        let r = { l: Math.max(r0.left, 0), t: Math.max(r0.top, 0), r: Math.min(r0.right, vw), b: Math.min(r0.bottom, vh) };
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
            const ar = a.getBoundingClientRect();
            r = { l: Math.max(r.l, ar.left), t: Math.max(r.t, ar.top), r: Math.min(r.r, ar.right), b: Math.min(r.b, ar.bottom) };
          }
        }
        if (r.r - r.l < 1 || r.b - r.t < 1) continue;
        items.push({ ...r, node: n, text, heading: !!el.closest('h1,h2,h3,.date,.logo,.stitle'), el, float: inFloat });
      }
    }
    const bad = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.node === b.node) continue; // 同一テキストの折返し・省略記号の分割矩形
        if (a.float !== b.float) continue; // 浮動タブ・浮動の操作は月・一覧の上に重ねる設計（末尾余白でスクロールすれば外せる）。浮動どうしは検査する
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (w <= 0 || h <= 0) continue;
        const minH = Math.min(a.b - a.t, b.b - b.t);
        const strict = a.heading || b.heading;
        // 行ボックスのわずかな交差は許容。見出しは 1px でも不可。
        if (strict ? (w > 1 && h > 1) : (w > 2 && h > Math.max(3, minH * 0.3))) bad.push(`"${a.text}" × "${b.text}" (${w.toFixed(1)}x${h.toFixed(1)})`);
      }
    }
    return bad;
  }, ignoreApp);
}

// ---- 第6版 ----
// アプリ自身の db.js（同一モジュール）で IndexedDB を直接読み書きする。シード後は再読込して反映。
// 第19.2版 S11c: 閉じた画面は読み込み直すとカレンダーから始まる（design/34 §9.2）。ホームを見ている途中でデータを入れた spec は、入れたあともホームを見る（「…」→「ホーム」で開き直す）。
export async function reloadKeep(page) {
  const was = !isClosedSize(page) ? null : (await page.locator('.shell.closed.home:not(.strp)').count()) ? 'ホーム' : (await page.locator('.shell.closed.tv-week').count()) ? '週' : (await page.locator('.shell.closed.tv-day').count()) ? '日' : null;
  await page.reload();
  await page.waitForSelector('html[data-ready]');
  if (was) await closedGo(page, was);
}
export async function seed(page, events) {
  await page.evaluate(async (list) => { const db = await import('/js/db.js'); await db.putMany(list); }, events);
  await reloadKeep(page);
}
export const dbEvents = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listEvents()).sort((a, b) => String(a.id).localeCompare(String(b.id))));
export const ev = (id, title, start, end, extra = {}) => ({ id, title, categoryId: CAT_IDS.work, all: false, start, end, place: '', notes: '', recurrence: null, exdates: [], overrides: {}, ...extra });

// 繰り返しの終了日: 日付のカプセルを長押しの文字欄でなく、小さな月で選ぶ（'YYYY/MM/DD'）。他の月へは ‹ › で移る。
export async function pickRuntil(page, text) {
  const dlg = page.locator('#editor'), key = text.replaceAll('/', '-');
  await dlg.locator('#f-runtil').click();
  for (let i = 0; i < 48; i++) {
    const c = dlg.locator(`#runtil-l ~ .dpfield [data-day="${key}"].dcell`);
    if (await c.count() && !(await c.first().evaluate((e) => e.classList.contains('out')))) { await c.first().click(); return; }
    const [y, m] = key.split('-').map(Number);
    const t = await dlg.locator('#runtil-l ~ .dpfield .dpmt').innerText();
    const [cy, cm] = t.match(/\d+/g).map(Number);
    await dlg.locator(`#runtil-l ~ .dpfield .dpnav`).nth((y * 12 + m) < (cy * 12 + cm) ? 0 : 1).click();
  }
  throw new Error('runtil not reachable ' + text);
}
// 編集ダイアログの繰り返し設定。f: { rfreq, days:[0..6], rend, rcount, runtil }
export async function fillRepeat(page, f) {
  const dlg = page.locator('#editor');
  if (await dlg.locator('#rpanel').isHidden()) await dlg.locator('#rtoggle').click();
  if (f.rfreq) await dlg.locator('#f-rfreq').selectOption(f.rfreq);
  if (f.days) {
    for (const d of [0, 1, 2, 3, 4, 5, 6]) {
      const b = dlg.locator(`.dow[data-dow="${d}"]`);
      const on = (await b.getAttribute('aria-pressed')) === 'true';
      if (on !== f.days.includes(d)) await b.click();
    }
  }
  if (f.rend) await dlg.locator('#f-rend').selectOption(f.rend);
  if (f.rcount !== undefined) await dlg.locator('#f-rcount').fill(String(f.rcount));
  if (f.runtil !== undefined) await pickRuntil(page, f.runtil);
}
export async function addRepeat(page, f) {
  await page.locator('[data-act="add"]:visible').first().click();
  await expect(page.locator('#editor')).toBeVisible();
  await fillEditor(page, f);
  await fillRepeat(page, f);
  await page.locator('#editor').getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#editor')).toBeHidden();
}
// 月表示（閉じた縦）から日付を選び、その日の最初の予定カードで編集を開く。
export async function openOccurrence(page, key, nth = 0) {
  await tab(page, '月').click();
  await pickDay(page, key);
  await page.locator('.mdcard, .mdev, .daylist .event, .tlev').nth(nth).click(); // 閉じた日はカード（.mdcard。第19.2版 S11b）、開いた縦は一覧（.mdev・.event）
  await expect(page.locator('#editor')).toBeVisible();
}
// 月の時刻つき単日チップ（日セルの兄弟 button.strip。data-sday が日付）。
export const chip = (page, key) => page.locator(`.calendar .strip[data-sday="${key}"]`);

// 見えている文字のうち、折り目（ビューポート中心 ±10px。既定）にかかるものを返す。
export async function textInGutter(page, l, r) {
  return page.evaluate(([l0, r0]) => {
    const l = l0 ?? window.innerWidth / 2 - 10, r = r0 ?? window.innerWidth / 2 + 10;
    const bad = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue.trim(), el = n.parentElement;
      if (!t || !el || el.closest('script,style,[hidden],#status,.vh') || el.closest('dialog:not([open])')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const rc of range.getClientRects()) {
        if (rc.width < 1 || rc.height < 1) continue;
        let vis = { l: rc.left, r: rc.right, t: rc.top, b: rc.bottom };
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const ar = a.getBoundingClientRect(); vis = { l: Math.max(vis.l, ar.left), r: Math.min(vis.r, ar.right), t: Math.max(vis.t, ar.top), b: Math.min(vis.b, ar.bottom) }; }
        }
        if (vis.r - vis.l < 1 || vis.b - vis.t < 1) continue;
        if (vis.l < r - 1 && vis.r > l + 1) bad.push(`${t} [${vis.l.toFixed(0)}–${vis.r.toFixed(0)}]`);
      }
    }
    return bad;
  }, [l ?? null, r ?? null]);
}

// ---- 第10版 ② ----
// 設定メニューを開く／閉じる。月の表現・卓上・凡例の入口はここ。
// screen を渡すと、その階層（一般・表示形式・カレンダー・リマインダー・詳細 など）まで進む。
export async function openMenu(page, screen) {
  if (isClosedSize(page)) await moreGo(page, '設定'); // 閉じた画面の設定は「…」→「設定」（design/34 §9.1-5）
  else await page.getByRole('button', { name: '設定' }).first().click();
  await expect(page.locator('#menu')).toBeVisible();
  if (screen) {
    await page.locator(`#menu [data-go="${screen}"]`).click();
    await expect(page.locator(`#menu [data-screen="${screen}"]`)).toBeVisible();
  }
}
// メニューの「月の表現」を開いて、各ボタンの状態（aria-pressed）を返してメニューを閉じる。無いときは null。
export async function modeStates(page) {
  await openMenu(page, 'display');
  const mode = page.locator('#menu').getByRole('button', { name: '月の表現', exact: true });
  let out = null;
  if (await mode.isVisible()) {
    await mode.click();
    out = await page.locator('#m-variant button').evaluateAll((bs) => Object.fromEntries(bs.map((b) => [b.textContent, b.getAttribute('aria-pressed') === 'true'])));
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  return out;
}
// 卓上表示の入／切（メニューから）。
export async function toggleDesk(page) {
  await openMenu(page, 'general');
  await page.locator('#menu').getByRole('button', { name: /^卓上表示/ }).click();
  await expect(page.locator('#menu')).toBeHidden(); // 選んで閉じる動き（0.25秒）が終わってから
}

// 第14版 PR5: 開いた横の左右ページの切替と時間の表示。side は 'left' | 'right'、name は 月/時間/タスク/メモ。
// v19.6（設計「見開き」・征希さん「各ページの上（設計どおり）」）で仕様変更: 下のタブは無くなり、各ページの上のページ名（.pgname）を押すと切り替えの帯（.pgsw）が出る。
// ここで返す物は今までどおり帯の中のボタン。click() だけ、帯が閉じていれば先にページ名を押して開く
export const openPageMenu = async (page, side) => { const sc = side === 'left' ? 'pgl' : 'pgr'; if (!(await page.locator(`.pgsw.${sc}`).count())) await page.locator(`.pgname.${sc}`).click(); };
export const pagePick = (page, side, name) => {
  const loc = page.locator(`.pgsw.${side === 'left' ? 'pgl' : 'pgr'}`).getByRole('button', { name, exact: true });
  return new Proxy(loc, { get(t, k) { if (k === 'click') return async (...args) => { await openPageMenu(page, side); return t.click(...args); }; const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v; } });
};
export async function setTimeMode(page, side, label) {
  await page.locator(`.page.${side === 'left' ? 'lp' : 'rp'} [data-act="tlmenu"]`).click();
  await page.locator(`.tlmenu [data-tlmode]`).filter({ hasText: new RegExp(`^${label}$`) }).click();
}
// 閉じた・縦は従来のタブ、開いた横は左右ページへ読み替える（月=左月・右時間／日=右の時間1日／週=右の時間・週／リスト=右の時間・リスト）。ホームは独立ページ（pagePick 'ホーム'）。
export async function showView(page, name) {
  if (!(await page.locator('.pgname').count())) { await tab(page, name).click(); return; }
  const lp = page.locator('.page.lp'), isMonth = (await lp.getAttribute('data-page')) === 'month';
  if (name === '月') { if (!isMonth) await pagePick(page, 'left', '月').click(); if ((await page.locator('.page.rp').getAttribute('data-page')) !== 'time') await pagePick(page, 'right', '時間').click(); return; }
  if ((await page.locator('.page.rp').getAttribute('data-page')) !== 'time') await pagePick(page, 'right', '時間').click();
  await setTimeMode(page, 'right', { 日: '1日', 週: '週', 一覧: 'リスト', リスト: 'リスト' }[name]);
}

// 設定 › カレンダーを開いて iPhone のカレンダー一覧が出るまで待ち、設定を閉じる（許可済みなら✓で連携が入る）。
export async function enableCalendars(page, { close = true } = {}) {
  await openMenu(page, 'calendar');
  await expect(page.locator('#menu [data-cal]').first()).toBeVisible();
  if (close) { await page.locator('#m-back').click(); await page.locator('#m-back').click(); await expect(page.locator('#menu')).toBeHidden(); }
}

// 通知オン・既定ありの端末（旧版からの移行済み相当）にする。第15版 PR12 で新規の既定はオフ・なしになったので、通知が要るテストは明示する。
export async function notifyOn(page, cfg = {}) {
  await page.addInitScript((c) => {
    if (localStorage.getItem('duo-notify-policy.v15')) return;
    localStorage.setItem('duo-notify', JSON.stringify({ version: 1, enabled: true, showTitle: true, defaultTimed: { before: 30 }, defaultAllDay: { day: 0, at: '08:00' }, ...c }));
    localStorage.setItem('duo-notify-policy.v15', 'test');
  }, cfg);
}

// タスクの編集シートの期限（予定と同じ日付のカプセル＋小さな月、「時刻を入れる」＋時分のマス）。
export async function pickTaskDue(page, key) {
  const pop = page.locator('#tk-body .dpfield');
  await page.locator('#tk-date').click();
  for (let i = 0; i < 48; i++) {
    const c = pop.locator(`.dcell[data-day="${key}"]:not(.out)`);
    if (await c.count()) { await c.first().click(); return; }
    const [y, m] = key.split('-').map(Number);
    const [cy, cm] = (await pop.locator('.dpmt').innerText()).match(/\d+/g).map(Number);
    await pop.locator('.dpnav').nth(y * 12 + m < cy * 12 + cm ? 0 : 1).click();
  }
  throw new Error(`task due not reachable ${key}`);
}
export async function clearTaskDue(page) {
  await page.locator('#tk-date').click();
  await page.locator('#tk-body .dpclear').click();
}
// 時刻を入れる（スイッチ）。h/m を押す。m を省くと分はそのまま。
export async function setTaskTime(page, h, m) {
  const on = page.locator('#tk-timeon');
  if (!(await on.isChecked())) await on.check();
  await page.locator('#tk-time').click();
  await page.locator(`#tk-body .tpfield [data-h="${h}"]`).click();
  if (m !== undefined) await page.locator(`#tk-body .tpfield [data-m="${m}"]`).click();
  else await page.locator('#tk-time').click();
}

// 第19版 PR6: 閉じた画面・開いた縦の月タブは「月を引く画面」。月送り・月の格子を前提にする検査は、月の型（'one'|'two'|'month'）を保存しておいてから起動する。
export async function monthFormInit(page, form = 'month') {
  await page.addInitScript((f) => { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } if (!s.monthForm) localStorage.setItem(k, JSON.stringify({ ...s, monthForm: f, monthDay: s.monthDay || 'list' })); }, form);
}
// 第19版 PR6: 開いた縦の月タブは「月を引く画面」で下の段ボタン（cpnl）を出さない。下パネルを調べる spec は「全部」の月（従来の月）で起動する。
export async function legacyPanelInit(page) {
  await page.addInitScript(() => { const k = 'duo.ui.v1'; let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; } if (s.monthExpand === undefined) localStorage.setItem(k, JSON.stringify({ ...s, monthExpand: true })); });
}
// 月を引く画面（閉じた画面）は日の部分を下へスクロールすると月が 1週へ縮む。予定を開くためのスクロールで縮んだ月を、上まで戻して元の型にする。
export async function monthUnshrink(page) {
  await page.evaluate(() => { const d = document.querySelector('.mday'); if (d) d.scrollTop = 0; });
  await page.waitForTimeout(400);
}

// 月のマスの中のチップ・帯は pointer-events:none（押す的として数えない）。押した位置のチップを日マスの click が開く（第19.1版 S6）。
// Playwright の locator.click() は遮られると断るので、チップの座標をマウスで押す（日マスが受け、chipAtPoint で予定のポップアップを開く）。
export async function clickChip(page, loc, pos = {}) {
  const el = loc.first();
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.click(b.x + (pos.x ?? Math.min(8, b.width / 2)), b.y + (pos.y ?? b.height / 2));
}

// 予定を開く: 一覧・時間軸の button はそのまま押し、月のチップ・帯（span）は座標を押す。
export async function clickEvent(page, id) {
  const first = page.locator(`[data-event="${id}"]:visible`).first();
  const tag = await first.evaluate((e) => e.tagName);
  if (tag === 'BUTTON') await first.click(); else await clickChip(page, first);
}

// その日のノートを開く入口。v19.3 その3（征希さん「メモもカードで分ける」）で仕様変更: 閉じた画面の日の欄は「ノートの欄」（daynote）ではなくカード。
// その日のノートがあればそのカード、無ければ「＋ ノート」（新しいノート。1 行目が題名で、日付の見出しは足さない）。開いた画面は今までどおり日のページ・日の部分のノートの欄
export const dayNoteEntry = (page, day = '') => page.locator(`[data-act="daynote"]${day ? `[data-day="${day}"]` : ''}:visible, .dnote:visible, .mpull.browse .mday .mdcard[data-note]:visible, .mpull.browse .mday [data-act="addnote"]:visible`).first();
