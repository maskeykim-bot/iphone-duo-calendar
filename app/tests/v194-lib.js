// 第19.4版（くすみ色・予定ごとの色）の試験の共通の道具。画面の「計算済みスタイル」から色を読み、WCAG 2.x の比をここで自分で計算する。
import { openApp, reloadKeep, ev, SIZES, catId } from './helpers.js';
export { SIZES, ev, catId };

export const DAY = '2026-11-12';
// 起動（閉じた縦は右の帯 84・段 2＝月 6 週・カード）。dark は見本（?theme=dark）
export async function boot(page, { size = SIZES.closedPortrait, dark = false, stage = 2, sel = DAY, events = [], cats = [], ui = {}, before = null } = {}) {
  const closed = Math.min(size.width, size.height) < 600;
  await page.addInitScript((v) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${v}px`)), closed ? 84 : 0);
  await page.addInitScript(({ s, st, ui }) => {
    if (sessionStorage.getItem('v194')) return; sessionStorage.setItem('v194', '1');
    localStorage.setItem('duo.ui.v1', JSON.stringify({ home: false, view: 'month', monthForm: 'month', monthDay: 'list', selected: s, dayGrip: 0, stage: st, rokuyo: true, pages: { left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false }, spreadType: 'pages', ...ui }));
    localStorage.setItem('duo.hint.pull', '1'); localStorage.setItem('duo.hint.daybar', '1');
  }, { s: sel, st: stage, ui });
  if (before) await before(page);
  await openApp(page, size, dark ? '?theme=dark' : '', { home: false });
  if (events.length || cats.length) {
    await page.evaluate(async ({ events, cats }) => {
      const db = await import('/js/db.js');
      if (cats.length) await db.applyCategoryChanges({ catPuts: cats.map((c, i) => ({ order: 10 + i, hidden: false, createdAt: 1, updatedAt: 1, ...c })) });
      if (events.length) await db.putMany(events);
    }, { events, cats });
    await reloadKeep(page);
  }
  await page.waitForTimeout(350);
}
export const allDay = (id, title, d1, d2, extra = {}) => ev(id, title, `${d1}T00:00`, `${d2}T23:59`, { all: true, ...extra });

// ---- 色を読む（ページの中で動く関数を文字で渡す）
const IN_PAGE = `
  const parse = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // 要素の後ろに実際に見えている地の色（透ける地は親へさかのぼって重ねる。不透明度も数える）
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let out = { r: 255, g: 255, b: 255, a: 1 }; for (const c of layers.reverse()) out = over(c, out); return out; };
  function opacityOf(el) { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; }
  const _unused = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const shown = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && opacityOf(e) > 0.5; }; // 段に入りきらず消してあるチップ（不透明度 0）は数えない
  // 文字: 文字の色（不透明度を地に重ねる）と、後ろの地の比
  const textOf = (el) => { const s = getComputedStyle(el), bg = bgOf(el), o = opacityOf(el); let c = parse(s.color); c = over({ ...c, a: c.a * o }, bg); return { color: hex(c), bg: hex(bg), ratio: cr(c, bg), weight: s.fontWeight, size: s.fontSize, text: el.textContent.trim().slice(0, 20) }; };
  // 印: 要素（または ::before）の地の色と、その後ろ（親の地）の比
  const markOf = (el, pseudo) => { const s = getComputedStyle(el, pseudo || null), under = pseudo ? bgOf(el) : bgOf(el.parentElement), o = opacityOf(el); let c = parse(s.backgroundColor); c = over({ ...c, a: c.a * o }, under); return { color: hex(c), bg: hex(under), ratio: cr(c, under), w: parseFloat(s.width), h: parseFloat(s.height), radius: s.borderTopLeftRadius, left: s.left, top: s.top }; };
`;
const run = (page, body, arg) => page.evaluate(new Function('arg', `${IN_PAGE}\n${body}`), arg);
export const texts = (page, sel) => run(page, 'return [...document.querySelectorAll(arg)].filter(shown).map(textOf);', sel);
export const marks = (page, sel, pseudo = '') => run(page, 'return [...document.querySelectorAll(arg[0])].filter(shown).map((e) => markOf(e, arg[1]));', [sel, pseudo]);
export const bgs = (page, sel) => run(page, 'return [...document.querySelectorAll(arg)].filter(shown).map((e) => ({ bg: hex(bgOf(e)), under: hex(bgOf(e.parentElement)), ratio: cr(bgOf(e), bgOf(e.parentElement)), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, radius: getComputedStyle(e).borderRadius, border: getComputedStyle(e).borderTopColor, bw: getComputedStyle(e).borderTopWidth, text: e.textContent.trim().slice(0, 20) }));', sel);
export const varOf = (page, sel, name) => page.evaluate(([s, n]) => { const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length); return e ? getComputedStyle(e).getPropertyValue(n).trim() : null; }, [sel, name]);
// 比（この試験の中で計算する。js/colors.js は使わない）
const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
export const ratio = (a, b) => { const l = (h) => { const [r, g, bl] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; }; const x = l(a), y = l(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const rgbHex = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(); };
export const dbEvs = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listEvents()).map((e) => ({ ...e })));
export const dbCats = (page) => page.evaluate(async () => (await (await import('/js/db.js')).listCategories()).map((e) => ({ ...e })));
export const dbColors = (page) => page.evaluate(async () => (await (await import('/js/db.js')).getEventColors()).map((e) => ({ ...e })));
export const cell = (k) => `.week .day[data-date="${k}"]`;
export const toast = (page) => page.locator('#native-toast');

// ---- iPhone のカレンダーの偽装（DuoNative の契約の写し。Swift の実動作の証明ではない）
export const CALS = [
  { id: 'cal-1', title: '個人', color: '#d93025', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: true },
  { id: 'cal-2', title: '祝日', color: '#0b8043', sourceId: 's-s', source: 'Subscribed Calendars', sourceType: 'subscribed', allowsModify: false, isDefault: false },
  { id: 'cal-3', title: '水色', color: '#34aadc', sourceId: 's-g', source: 'Google', sourceType: 'caldav', allowsModify: true, isDefault: false },
];
const X = (o) => ({ all: false, place: '', notes: '', recurring: false, requestId: null, modifiedAt: 1763100000000, occurrenceDate: null, ...o, id: `${o.eventId}@${o.start}` });
export const XEVENTS = [
  X({ eventId: 'e1', itemId: 'it-1', externalId: 'ex-1', calendarId: 'cal-1', title: '歯医者', start: '2026-11-12T15:00', end: '2026-11-12T16:00' }),
  X({ eventId: 'e2', itemId: 'it-2', externalId: 'ex-2', calendarId: 'cal-2', title: '勤労感謝の日', start: '2026-11-23T00:00', end: '2026-11-23T00:00', all: true }),
  X({ eventId: 'w1', itemId: 'it-w', externalId: 'ex-w', calendarId: 'cal-1', title: '定例', start: '2026-11-10T09:00', end: '2026-11-10T10:00', recurring: true, occurrenceDate: '2026-11-10T09:00' }),
  X({ eventId: 'w1', itemId: 'it-w', externalId: 'ex-w', calendarId: 'cal-1', title: '定例', start: '2026-11-17T09:00', end: '2026-11-17T10:00', recurring: true, occurrenceDate: '2026-11-17T09:00' }),
  X({ eventId: 'l1', itemId: 'it-l', externalId: '', calendarId: 'cal-3', title: 'ローカルの予定', start: '2026-11-13T10:00', end: '2026-11-13T11:00' }),
];
export const mockNext = (page, o) => page.evaluate((v) => sessionStorage.setItem('v194mock', JSON.stringify(v)), o);
export async function mockNative(page, cfg = {}) {
  await page.addInitScript((c) => {
    const M = window.__mock = { perm: 'granted', calls: [], cals: c.cals, events: c.events, listFail: false, created: {}, listeners: {} };
    const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));
    // 読み込み直しの前に試験から渡す指示（sessionStorage 'v194mock'）: listFail＝読み込みを失敗させる、patch＝[{ start, set }] で予定を書き換える（iPhone 側で変えたことにする）
    try { const o = JSON.parse(sessionStorage.getItem('v194mock') || '{}'); M.listFail = !!o.listFail; for (const p of o.patch || []) { const e = M.events.find((x) => x.start === p.start); if (e) Object.assign(e, p.set); } } catch { /* */ }
    const DET = { alarms: [], alarmsExtra: 0, rule: null, ruleText: '', detached: false, allowsModify: true, sourceType: 'caldav', hasAttendees: false, isOrganizer: false, hasUrl: false, editable: true, reason: null, seriesStart: null };
    window.Capacitor = {
      isNativePlatform: () => true, getPlatform: () => 'ios',
      nativeCallback: (plugin, method, opts, cb) => { M.listeners[opts.eventName] = cb; return 'cb-1'; },
      nativePromise: async (plugin, method, opts) => {
        M.calls.push({ method, opts: clone(opts) });
        switch (method) {
          case 'checkPermission': case 'requestPermission': return { status: M.perm };
          case 'openSettings': return { opened: true };
          case 'listCalendars': return { calendars: M.cals };
          case 'listEvents': if (M.listFail) throw { code: 'UNAVAILABLE', message: 'x' }; return { events: M.events.filter((e) => opts.calendarIds.includes(e.calendarId) && e.start < opts.to && e.end >= opts.from) };
          case 'getEvent': { const d = M.events.find((x) => (x.itemId === opts.itemId || (x.externalId && x.externalId === opts.externalId) || x.eventId === opts.eventId) && (x.occurrenceDate ?? x.start) === opts.occurrenceStart); if (!d) throw { code: 'NOT_FOUND', message: 'x' }; const cal = M.cals.find((k) => k.id === d.calendarId); return clone({ ...DET, ...d, allowsModify: !!cal?.allowsModify, editable: !!cal?.allowsModify, reason: cal?.allowsModify ? null : 'readOnly' }); }
          case 'createEvent': { const n = M.created[opts.requestId] || (M.created[opts.requestId] = 'new-' + (Object.keys(M.created).length + 1)); return { itemId: 'item-' + n, externalId: 'ext-' + n, eventId: n, modifiedAt: 1763100000000, calendarId: opts.calendarId, occurrenceDate: null }; }
          case 'notifyStatus': return { status: 'denied' };
          case 'requestNotifyPermission': return { status: 'denied' };
          case 'selectionHaptic': return { performed: true };
          case 'getPosture': return { available: false, folded: false, regionRect: null, axis: null, angle: null, status: null, source: 'unsupported', at: 1763100000000 };
          default: throw { code: 'UNAVAILABLE', message: method };
        }
      },
    };
  }, { cals: CALS, events: XEVENTS, ...cfg });
}
