import { expect } from '@playwright/test';
import { CAT_IDS } from '../js/categories.js';

// テストでは旧キー（work/private）や既定カテゴリのキー（family/out/other）で指定できる。
export const catId = (k) => CAT_IDS[k] ?? k;

export const SIZES = {
  closedPortrait: { width: 466, height: 678 },
  closedLandscape: { width: 678, height: 466 },
  openPortrait: { width: 626, height: 890 },
  openLandscape: { width: 890, height: 626 },
};

// 2026-11-12 9:41 JST に固定して起動する。
export async function openApp(page, size = SIZES.closedPortrait, query = '') {
  await page.setViewportSize(size);
  await page.clock.setFixedTime(new Date('2026-11-12T09:41:00+09:00'));
  await page.goto(`/index.html${query}`);
  await page.waitForSelector('html[data-ready]');
}
export async function loadSample(page) {
  await page.getByRole('button', { name: 'サンプルを入れる' }).first().click();
  await expect(page.getByRole('status')).toHaveText('サンプルの予定を入れました。');
}
export const tab = (page, name) => page.getByRole('button', { name, exact: true });
export const layout = (page) => page.evaluate(() => document.body.dataset.layout);

export async function fillEditor(page, f) {
  const dlg = page.locator('#editor');
  if (f.title !== undefined) await dlg.locator('#f-title').fill(f.title);
  if (f.cat) await dlg.locator('#f-cat').selectOption(catId(f.cat));
  if (f.all !== undefined) await dlg.locator('#f-all').setChecked(f.all);
  if (f.start !== undefined) await dlg.locator('#f-start').fill(f.start);
  if (f.end !== undefined) await dlg.locator('#f-end').fill(f.end);
  if (f.place !== undefined) await dlg.locator('#f-place').fill(f.place);
}
export async function addEvent(page, f) {
  await page.locator('[data-act="add"]:visible').first().click();
  await expect(page.locator('#editor')).toBeVisible();
  await fillEditor(page, f);
  await page.locator('#editor').getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#editor')).toBeHidden();
}

// 「手帳／予定名」は開いた縦では隠れる。見えている時だけ切り替える。
export async function setStyle(page, name) {
  const b = page.getByRole('button', { name, exact: true });
  if (await b.isVisible()) await b.click();
}
// 日セルは日付の位置を押す（予定名の帯・短冊が中央に重なるため）。
export const pickDay = (page, key) => page.locator(`[data-date="${key}"]`).click({ position: { x: 12, y: 10 } });

// 期間見出し（#ctitle / .stitle）。ダイアログ中（inert）でも読めるよう textContent。
export const period = (page) => page.evaluate(() => document.querySelector('#ctitle, .stitle')?.textContent.trim() ?? '');
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
      for (const r0 of range.getClientRects()) {
        let r = { l: Math.max(r0.left, 0), t: Math.max(r0.top, 0), r: Math.min(r0.right, vw), b: Math.min(r0.bottom, vh) };
        for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
            const ar = a.getBoundingClientRect();
            r = { l: Math.max(r.l, ar.left), t: Math.max(r.t, ar.top), r: Math.min(r.r, ar.right), b: Math.min(r.b, ar.bottom) };
          }
        }
        if (r.r - r.l < 1 || r.b - r.t < 1) continue;
        items.push({ ...r, node: n, text, heading: !!el.closest('h1,h2,h3,.date,.logo,.stitle'), el });
      }
    }
    const bad = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.node === b.node) continue; // 同一テキストの折返し・省略記号の分割矩形
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
export async function seed(page, events) {
  await page.evaluate(async (list) => { const db = await import('/js/db.js'); await db.putMany(list); }, events);
  await page.reload();
  await page.waitForSelector('html[data-ready]');
}
export const dbEvents = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listEvents()).sort((a, b) => String(a.id).localeCompare(String(b.id))));
export const ev = (id, title, start, end, extra = {}) => ({ id, title, categoryId: CAT_IDS.work, all: false, start, end, place: '', notes: '', recurrence: null, exdates: [], overrides: {}, ...extra });

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
  if (f.runtil !== undefined) await dlg.locator('#f-runtil').fill(f.runtil);
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
  await page.locator('.daylist .event').nth(nth).click();
  await expect(page.locator('#editor')).toBeVisible();
}
export const chip = (page, key) => page.locator(`[data-date="${key}"] .chip`);

// 見えている文字のうち、ガター（x=425〜465）にかかるものを返す。
export async function textInGutter(page, l = 425, r = 465) {
  return page.evaluate(([l, r]) => {
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
  }, [l, r]);
}
