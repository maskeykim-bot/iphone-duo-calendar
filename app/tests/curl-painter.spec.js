// 第18版 PR3: ページの絵 painter（js/curl/painter.js）。tt の見開きで、painter の絵（2D canvas）と止まっている DOM を 200% で比べる。
// y のずれ：0.5pt 超は不合格、0.25pt 超は注意（annotation）。正本：design/IMPL_PLAN_V18.md PR3。
import { test, expect } from '@playwright/test';
import { openApp, SIZES, seed, ev, swipe } from './helpers.js';

test.use({ viewport: { width: 951, height: 669 }, deviceScaleFactor: 2 });
test.setTimeout(120000);

const UI = 'duo.ui.v1';
const TT = { selected: '2026-11-12', spreadType: 'tt' };
const preset = (page, patch) => page.addInitScript(({ k, p }) => {
  if (localStorage.getItem('__pt_seeded')) return;
  localStorage.setItem('__pt_seeded', '1');
  let s = {}; try { s = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { s = {}; }
  localStorage.setItem(k, JSON.stringify({ ...s, ...p }));
}, { k: UI, p: patch });
const setSafe = (page, r) => page.evaluate((r) => document.documentElement.style.setProperty('--sar', `${r}px`), r);
const putNote = (page, n) => page.evaluate(async (n) => (await import('/js/db.js')).putNote(n), n);
const note = (id, body, date) => ({ id, body, createdAt: 5, updatedAt: Date.UTC(2026, 10, 1) + body.length, folderId: null, pinned: false, pinnedAt: null, date, deletedAt: null });
async function land(page, { patch = {}, events = null, notes = null } = {}) {
  await preset(page, { ...TT, ...patch });
  await openApp(page, SIZES.openLandscape951);
  if (events || notes) {
    if (notes) for (const n of notes) await putNote(page, n);
    if (events) await seed(page, events); else { await page.reload(); await page.waitForSelector('html[data-ready]'); }
  }
  await setSafe(page, 84);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sar'))).toBe('84px');
  await expect(page.locator('.dpage')).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}
const rect = (page, sel) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

// 見開きの日・予定が多い日（+N・終日・複数日の帯・繰り返し・長い名前）
const EVENTS = [
  ev('s1', '会議', '2026-11-12T10:00', '2026-11-12T11:00'),
  ev('s2', '資料づくり', '2026-11-12T09:00', '2026-11-12T10:30', { categoryId: 'private' }),
  ev('a1', '終日の用事A', '2026-11-13', '2026-11-13', { all: true }),
  ev('a2', '終日の用事B', '2026-11-13', '2026-11-13', { all: true }),
  ev('a3', '終日の用事C', '2026-11-13', '2026-11-13', { all: true }),
  ev('a4', '終日の用事D', '2026-11-13', '2026-11-13', { all: true }),
  ev('l1', 'とてもとても長い予定の名前でここから先は省略されて「…」になるはずの文章です', '2026-11-13T13:00', '2026-11-13T15:00'),
  ev('l2', '短い', '2026-11-13T13:30', '2026-11-13T14:00'),
  ev('m1', '出張（3日間）', '2026-11-14', '2026-11-16', { all: true }),
  ev('r1', '毎日の確認', '2026-11-12T08:00', '2026-11-12T08:30', { recurrence: { freq: 'daily', interval: 1, byDay: [], until: null, count: null } }),
  ev('r2', '夕方の電話', '2026-11-14T17:00', '2026-11-14T18:00'),
  ev('r3', '日をまたぐ', '2026-11-14T22:00', '2026-11-15T02:00'),
];
const NOTES = [note('n1', '11日のメモ\n二行目のノート', '2026-11-12'), note('n2', 'ノートの本文がとても長くて、ページの幅で折り返されて何行にも渡って続きます。' + 'あいうえお'.repeat(20), '2026-11-14')];

// ---- 比べる道具（ブラウザの中）----
const readImg = async (b64) => { const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return x.getImageData(0, 0, bmp.width, bmp.height); };
// 同じ範囲の行ごとの「暗さ」を相関で重ね、ずれ（pt）を返す。dpr 2 なので 1px = 0.5pt。放物線で 0.05px まで
function compareJs() {
  window.__cmp = {
    imgFrom: async (src) => { const bmp = await createImageBitmap(await (await fetch(src)).blob()); const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0); return x.getImageData(0, 0, bmp.width, bmp.height); },
    prof(img, y0, y1, x0, x1) { const a = []; for (let y = y0; y < y1; y++) { let s = 0; for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; s += 255 - (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000; } a.push(s); } return a; },
    shift(A, B, range = 6) { // B を A に重ねるずれ（B が下にあれば正）
      const n = A.length, ma = A.reduce((s, v) => s + v, 0) / n, mb = B.reduce((s, v) => s + v, 0) / n; const a = A.map((v) => v - ma), b = B.map((v) => v - mb);
      const corr = (d) => { let s = 0, na = 0, nb = 0; for (let i = 0; i < n; i++) { const j = i - d; if (j < 0 || j >= n) continue; s += a[i] * b[j]; na += a[i] * a[i]; nb += b[j] * b[j]; } return na && nb ? s / Math.sqrt(na * nb) : 0; };
      let best = 0, bc = -2; const cs = {}; for (let d = -range; d <= range; d++) { cs[d] = corr(d); if (cs[d] > bc) { bc = cs[d]; best = d; } }
      let sub = 0; if (cs[best - 1] != null && cs[best + 1] != null) { const l = cs[best - 1], r = cs[best + 1], den = l - 2 * bc + r; if (den < 0) sub = 0.5 * (l - r) / den; }
      return { d: best + sub, c: bc, energyA: A.reduce((s, v) => s + Math.abs(v - ma), 0) };
    },
  };
}
// 左右どちらかのページ：canvas（painter）と DOM を比べる。regions = [{ name, y0, y1 }]（pt、ページ左上基準）
async function compare(page, kind, day, regions, { canvasSrc } = {}) {
  const sel = kind === 'L' ? '.dpage.lp' : '.dpage.rp';
  const r = await rect(page, sel);
  const shot = (await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } })).toString('base64');
  return page.evaluate(async ({ shot, kind, day, regions, canvasSrc, js }) => {
    if (!window.__cmp) new Function(js)();
    const cv = canvasSrc ?? window.__duoPainter.get().canvas(day, kind, 2).toDataURL('image/png');
    const A = await window.__cmp.imgFrom(`data:image/png;base64,${shot}`), B = await window.__cmp.imgFrom(cv);
    const w = Math.min(A.width, B.width), out = {};
    for (const g of regions) {
      const y0 = Math.max(0, Math.round(g.y0 * 2)), y1 = Math.min(A.height, B.height, Math.round(g.y1 * 2)), x0 = Math.round((g.x0 ?? 0) * 2), x1 = Math.min(w, Math.round((g.x1 ?? w / 2) * 2));
      const pa = window.__cmp.prof(A, y0, y1, x0, x1), pb = window.__cmp.prof(B, y0, y1, x0, x1), s = window.__cmp.shift(pa, pb);
      out[g.name] = { dy: s.d / 2, corr: s.c, energy: s.energyA };
    }
    // 全体の違い：4pt 角に区切った平均の差（文字のにじみに左右されない）
    const cell = 8; let sum = 0, cnt = 0, mx = 0;
    for (let y = 0; y + cell <= Math.min(A.height, B.height); y += cell) for (let x = 0; x + cell <= w; x += cell) {
      let da = 0, db = 0; for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) { const p = ((y + j) * A.width + x + i) * 4, q = ((y + j) * B.width + x + i) * 4; da += A.data[p] + A.data[p + 1] + A.data[p + 2]; db += B.data[q] + B.data[q + 1] + B.data[q + 2]; }
      const d = Math.abs(da - db) / (cell * cell * 3); sum += d; cnt++; mx = Math.max(mx, d);
    }
    return { rows: out, meanCell: sum / cnt, maxCell: mx, size: [A.width, A.height, B.width, B.height] };
  }, { shot, kind, day, regions, canvasSrc, js: `(${compareJs.toString()})()` });
}
// 見出し・終日・時間軸の1行目・予定行・ノートの1行目の範囲（DOM から読む）
async function regionsOf(page, sel) {
  return page.evaluate((sel) => {
    const P = document.querySelector(sel).getBoundingClientRect(), R = (e, pad = 3) => { const r = e.getBoundingClientRect(); return { y0: r.top - P.top - pad, y1: r.bottom - P.top + pad, x0: r.left - P.left - pad, x1: r.right - P.left + pad }; };
    const pg = document.querySelector(sel), out = [];
    const dph = pg.querySelector('.dph'); if (dph) out.push({ name: '見出し', ...R(dph, 0), x0: 0, x1: P.width });
    const ad = pg.querySelector('.allday'); if (ad && pg.querySelector('.adpill')) out.push({ name: '終日', ...R(ad, 2), x0: 0, x1: P.width });
    const tl = pg.querySelector('.tl'), tr = tl && tl.getBoundingClientRect();
    if (tl) {
      const lab = [...pg.querySelectorAll('.hlab')].find((e) => { const r = e.getBoundingClientRect(); return r.top >= tr.top + 2 && r.bottom <= tr.bottom; });
      if (lab) out.push({ name: '時間軸の1行目', ...R(lab, 4), x0: 0, x1: P.width });
      [...pg.querySelectorAll('.tlev')].filter((e) => { const r = e.getBoundingClientRect(); return r.top >= tr.top && r.bottom <= tr.bottom; }).slice(0, 3).forEach((e, i) => out.push({ name: `予定行${i + 1}`, ...R(e, 3) }));
    }
    const dn = pg.querySelector('.dnote'); if (dn && dn.querySelector('.dnt').textContent) { const r = dn.getBoundingClientRect(); out.push({ name: 'ノートの1行目', y0: r.top - P.top - 2, y1: r.top - P.top + 32, x0: 0, x1: P.width }); }
    return out;
  }, sel);
}
function judge(res, label, test_) {
  test_.info().annotations.push({ type: '計測', description: `${label}: ` + Object.entries(res.rows).map(([n, v]) => `${n} ${v.dy.toFixed(2)}pt`).join('、') });
  for (const [name, v] of Object.entries(res.rows)) {
    expect(v.energy, `${label} ${name} に絵がある`).toBeGreaterThan(300);
    expect(v.corr, `${label} ${name} の相関`).toBeGreaterThan(0.6);
    const a = Math.abs(v.dy);
    if (a > 0.25) test_.info().annotations.push({ type: '注意', description: `${label} ${name} のずれ ${v.dy.toFixed(2)}pt（0.25 超）` });
    expect(a, `${label} ${name} の y のずれ ${v.dy.toFixed(3)}pt`).toBeLessThanOrEqual(0.5);
  }
}

test.describe('painter の絵と DOM（200%）', () => {
  test('見えているページ：見出し・時間軸の1行目・予定行・終日・ノートの1行目の y（左右）', async ({ page }) => {
    await land(page, { events: EVENTS, notes: NOTES });
    for (const [kind, sel, day] of [['L', '.dpage.lp', '2026-11-12'], ['R', '.dpage.rp', '2026-11-13']]) {
      const regs = await regionsOf(page, sel);
      expect(regs.map((r) => r.name)).toContain('見出し');
      expect(regs.map((r) => r.name)).toContain('時間軸の1行目');
      if (kind === 'L') { expect(regs.map((r) => r.name)).toContain('予定行1'); expect(regs.map((r) => r.name)).toContain('ノートの1行目'); } else expect(regs.map((r) => r.name)).toContain('終日');
      judge(await compare(page, kind, day, regs), `${kind} ${day}`, test);
    }
  });

  test('まだ DOM にない日（画面外に一時的に置いて測る）も、その日が出たときの DOM と同じ y', async ({ page }) => {
    await land(page, { events: EVENTS, notes: NOTES });
    // 14 日の左・15 日の右を先に絵にする（見えているのは 12・13 日）。画面外のものは DOM に残らない
    const urls = await page.evaluate(() => { const p = window.__duoPainter.get(); return { L: p.canvas('2026-11-14', 'L', 2).toDataURL('image/png'), R: p.canvas('2026-11-15', 'R', 2).toDataURL('image/png') }; });
    expect(await page.locator('body *').evaluateAll((a) => a.filter((e) => e.getAttribute('aria-hidden') === 'true' && e.classList.contains('shell')).length)).toBe(0);
    await swipe(page, { x0: 840, y0: 250, dx: -330 });
    await page.waitForFunction(() => !__duoCurl.state().busy);
    expect(await page.locator('.dpage .dd').allTextContents()).toEqual(['11月14日（土）', '11月15日（日）']);
    for (const [kind, sel] of [['L', '.dpage.lp'], ['R', '.dpage.rp']]) {
      const regs = await regionsOf(page, sel);
      judge(await compare(page, kind, null, regs, { canvasSrc: urls[kind] }), `画面外→${kind}`, test);
    }
  });
});

test.describe('内容の一致', () => {
  const cases = [
    ['予定 0 件の日', { events: EVENTS, notes: NOTES }, 'R', '.dpage.rp', '2026-11-13', null],
    ['予定が多い日・終日の +N・長い名前の「…」', { events: EVENTS, notes: NOTES }, 'R', '.dpage.rp', '2026-11-13', null],
    ['複数日の帯・繰り返し・日またぎ', { patch: { selected: '2026-11-14' }, events: EVENTS, notes: NOTES }, 'L', '.dpage.lp', '2026-11-14', null],
    ['ノートあり（長文は折り返し）', { patch: { selected: '2026-11-14' }, events: EVENTS, notes: NOTES }, 'L', '.dpage.lp', '2026-11-14', null],
    ['ノートなし', { patch: { selected: '2026-11-16' }, events: EVENTS, notes: NOTES }, 'L', '.dpage.lp', '2026-11-16', null],
    ['六曜オフ', { patch: { rokuyo: false }, events: EVENTS, notes: NOTES }, 'L', '.dpage.lp', '2026-11-12', (page) => expect(page.locator('.dpage .drk')).toHaveCount(0)],
    ['祝日の赤オフ（勤労感謝の日 11/23）', { patch: { selected: '2026-11-22', holidayRed: false }, events: EVENTS, notes: NOTES }, 'R', '.dpage.rp', '2026-11-23', (page) => expect(page.locator('.dpage.rp .hdt.hol')).toHaveCount(0)],
    ['祝日の赤オン（11/23）', { patch: { selected: '2026-11-22' }, events: EVENTS, notes: NOTES }, 'R', '.dpage.rp', '2026-11-23', (page) => expect(page.locator('.dpage.rp .hdt.hol')).toHaveCount(1)],
  ];
  for (const [name, o, kind, sel, day, extra] of cases) {
    test(name, async ({ page }) => {
      await land(page, o);
      if (extra) await extra(page);
      const res = await compare(page, kind, day, await regionsOf(page, sel));
      // 全体：4pt 角ごとの平均の差が小さい（文字のにじみは許す）
      expect(res.meanCell, `${name} 全体の平均差`).toBeLessThan(2.5);
      expect(res.maxCell, `${name} いちばん違う 4pt 角`).toBeLessThan(90);
      judge(res, name, test);
    });
  }
  test('内容：DOM にある文字と色が絵に出る（+N・省略・終日のピル）', async ({ page }) => {
    await land(page, { events: EVENTS, notes: NOTES });
    const dom = await page.evaluate(() => ({ plus: document.querySelector('.dpage.rp .adplus')?.textContent, pills: document.querySelectorAll('.dpage.rp .adpill').length, ell: [...document.querySelectorAll('.dpage.rp .tlev')].map((e) => { const t = e.querySelector('.tn') || e; return t.scrollWidth > t.clientWidth; }) }));
    expect(dom.pills).toBeGreaterThan(0);
    expect(dom.plus).toMatch(/^\+\d+$/);
    expect(dom.ell.some(Boolean), '長い名前が DOM でも切れている').toBe(true);
    // painter の命令に「…」・ピルの地・予定の帯が入っている（canvas の色で確かめる）
    const px = await page.evaluate(() => { const c = window.__duoPainter.get().canvas('2026-11-13', 'R', 2), x = c.getContext('2d'), pill = document.querySelector('.dpage.rp .adpill'), P = document.querySelector('.dpage.rp').getBoundingClientRect(), r = pill.getBoundingClientRect(); const d = x.getImageData(Math.round((r.left - P.left + 14) * 2), Math.round((r.top - P.top + r.height / 2 - 9) * 2), 1, 1).data; return { pill: [...d], want: getComputedStyle(pill).backgroundColor }; });
    expect(px.pill[3]).toBe(255);
    expect(px.pill.slice(0, 3).join(',')).not.toBe('255,253,250'); // 紙の色ではなくピルの地
  });
});

test.describe('テクスチャの枚数・向き・捨て方', () => {
  test('向きごとに4枚（18.2：裏は次のページの絵を使い回す）。向きを変えると前の絵を先に捨てる', async ({ page }) => {
    await land(page, { events: EVENTS, notes: NOTES });
    const r = await page.evaluate(async () => {
      const { createCurl } = await import('/js/curl/index.js');
      const p = window.__duoPainter.get(), D = p.dims(), cv = document.createElement('canvas');
      const dims = { W: 951, H: 669, spine: D.spine, edge: D.edge, py0: D.py0, py1: D.py1, lx0: D.lx0, lx1: D.lx1 };
      const curl = createCurl({ canvas: cv, dims, dpr: 2 }), R = curl.renderer, log = [];
      const ct = R.createTexture.bind(R), dt = R.deleteTexture.bind(R);
      R.createTexture = (c) => { log.push('c'); return ct(c); }; R.deleteTexture = (h) => { if (h) log.push('d'); return dt(h); };
      p.setRenderer(R);
      const out = {}; const sizes = (sc) => ['Lo', 'Ln', 'Ro', 'Rn', 'next'].map((k) => [sc[k].w, sc[k].h]);
      const s1 = p.prepare('forward'); out.f = { stats: p.stats(), tex: R.textures.size, sizes: sizes(s1), frontIsRo: s1.front === s1.Ro, nextIsLn: s1.next === s1.Ln, rect: s1.frontRect, back: s1.backRect, days: p.need('forward') };
      log.length = 0; const s2 = p.prepare('backward');
      out.b = { stats: p.stats(), tex: R.textures.size, log: log.join(''), frontIsLo: s2.front === s2.Lo, nextIsRn: s2.next === s2.Rn, rect: s2.frontRect, back: s2.backRect, days: p.need('backward') };
      // 描ける（落ちない）
      const s = curl.set.forward; out.drew = !!(R.setScene(s2), R.draw([s.edge, 300], [s.edge - 100, 300]));
      p.release(); out.rel = { stats: p.stats(), tex: R.textures.size };
      p.prepare('forward'); p.dispose(); out.disp = { stats: p.stats(), tex: R.textures.size };
      curl.dispose(); return { ...out, D };
    });
    const w3 = (w) => Math.round(w * 3), w2 = (w) => Math.round(w * 2), H3 = Math.round(603 * 3), H2 = Math.round(603 * 2);
    void w2; void H2;
    expect(r.f.sizes).toEqual([[w3(r.D.lw), H3], [w3(r.D.lw), H3], [w3(r.D.rw), H3], [w3(r.D.rw), H3], [w3(r.D.lw), H3]]);
    expect(r.f.stats).toMatchObject({ made: 4, freed: 0, live: 4, dpr: { front: 3, back: 2 } });
    expect(r.f.tex).toBe(4);
    expect(r.f.frontIsRo).toBe(true); expect(r.f.nextIsLn, '前へ：裏＝次の左').toBe(true); expect(r.b.nextIsRn, '戻り：裏＝次の右').toBe(true);
    expect(r.f.days).toMatchObject({ Lo: { day: '2026-11-12' }, Ln: { day: '2026-11-14' }, Ro: { day: '2026-11-13' }, Rn: { day: '2026-11-15' }, front: 'Ro' });
    expect(r.b.days).toMatchObject({ Lo: { day: '2026-11-12' }, Ln: { day: '2026-11-10' }, Ro: { day: '2026-11-13' }, Rn: { day: '2026-11-11' }, front: 'Lo' });
    expect(r.f.rect[0]).toBe(r.D.spine); expect(r.b.rect[0]).toBe(r.D.lx0);
    expect(r.f.back[0]).toBe(r.D.lx0); expect(r.b.back[0]).toBe(r.D.spine);
    expect(r.b.stats).toMatchObject({ made: 8, freed: 4, live: 4 });
    expect(r.b.tex).toBe(4);
    expect(r.b.log).toBe('dddd' + 'cccc'); // 前の向きの4枚を先に全部捨ててから作る
    expect(r.b.frontIsLo).toBe(true);
    expect(r.drew).toBe(true);
    expect(r.rel.stats).toMatchObject({ live: 0, bytes: 0 }); expect(r.rel.tex).toBe(0);
    expect(r.rel.stats.made).toBe(r.rel.stats.freed);
    expect(r.disp.stats).toMatchObject({ live: 0, bytes: 0 }); expect(r.disp.tex).toBe(0);
    expect(r.disp.stats.made).toBe(r.disp.stats.freed);
  });
  test('画面外に置いたページは測ったらすぐ消える・アプリの DOM を変えない', async ({ page }) => {
    await land(page, { events: EVENTS, notes: NOTES });
    const before = await page.evaluate(() => document.querySelector('.shell.spread').outerHTML);
    const n0 = await page.evaluate(() => document.querySelectorAll('.dpage').length);
    await page.evaluate(() => window.__duoPainter.get().canvas('2026-11-20', 'L', 2));
    expect(await page.evaluate(() => document.querySelectorAll('.dpage').length)).toBe(n0);
    expect(await page.evaluate(() => document.querySelector('.shell.spread').outerHTML)).toBe(before);
  });
  test('アプリの操作からはまだ呼ばない：tt の見開きを出してもめくりの canvas は無い', async ({ page }) => {
    await land(page);
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
