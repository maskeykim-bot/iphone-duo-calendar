import * as db from './db.js';
import { SAMPLE } from './sample.js';
import { initSwipe } from './swipe.js';
import { occurrenceAt, parseOccId, planDelete, planEdit, editInfo } from './recur.js';
import { bumpRevision, occBetween } from './occcache.js';
import { LIMIT, groupByDay, highlight, excerpt, searchEvents } from './search.js';
import { backupName, buildBackup, countStats, localIso, planAppend, validateBackup, MAX_BYTES } from './backup.js';
import { CAT_IDS, LIMITS as CAT_LIMITS, PALETTE, UNCATEGORIZED, countByCategory, fixEventCategories, legacyToId, mergeCategories, moveCategory, nameTaken, newCategory, paletteName, planDeleteCategory, resolveCategory, sortCategories, tint, validateCategory } from './categories.js';
import { call, errCode, errText, listen, nativeAvailable } from './native.js';
import { covers, dedupe, extIn, extRange, fmtLoaded, groupBySource, lastDay, normSettings, rangeKey, searchExt, stampOf, subLabel, toDisplay, writable, ymdSlash } from './iphone.js';
import {
  DOW, addDays, addMonths, assignSharedLanes, dayLabel, dayOf, dkey, eventsOnDay, isKey, isMulti,
  monthWeeks, newId, nowStamp, pad, parseInput, parseKey, ruleSummary, setFirstDay, timeLabel, toInput, todayKey, validateDraft, weekStart, weekdayHeads,
} from './util.js';

const params = new URLSearchParams(location.search);
const NS = params.get('ns') || '';
const suffix = NS ? `.${NS}` : '';
const UI_KEY = `duo.ui.v1${suffix}`;
const DRAFT_KEY = `duo.draft.v1${suffix}`;
db.configure(NS);

const $ = (s) => document.querySelector(s);
const root = $('#app');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 状態 ----------
const VIEWS = ['day', 'week', 'month'];
const STYLES = ['simple', 'named'];
function loadUi() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { s = {}; }
  return {
    selected: isKey(s.selected) ? s.selected : todayKey(),
    view: VIEWS.includes(s.view) ? s.view : 'month',
    style: STYLES.includes(s.style) ? s.style : 'simple',
    desk: s.desk === true,
    home: s.home === true ? true : s.home === false ? false : null, // null=未選択（閉じた画面では一覧、開いた画面では月などの本文）。true=「一覧」を選んだ
    monthExpand: s.monthExpand === true,
    weekStart: s.weekStart === 0 ? 0 : 1, // 週の始まり: 0=日曜 / 1=月曜（既定）
    monthTimeClosed: s.monthTimeClosed === true, // 月表示に時刻を出す（閉じた画面。既定は切）
    monthTimeOpen: s.monthTimeOpen !== false, // 同（開いた画面・見開き・卓上。既定は入）
    monthTextSize: s.monthTextSize === 'large' ? 'large' : 'normal', // 月の文字: 標準 / 大
  };
}
const state = { ...loadUi(), events: [], categories: [], loaded: false };
setFirstDay(state.weekStart);
let hiddenCats = new Set();
function setCategories(list) {
  state.categories = sortCategories(list);
  hiddenCats = new Set(state.categories.filter((c) => c.hidden).map((c) => c.id));
}
if (params.has('desk')) state.desk = params.get('desk') === '1';
// 通知の既定（形式だけ。UI は今回なし）。localStorage['duo-notify' + suffix]、バックアップの settings.notify に出し入れする。
const NOTIFY_KEY = `duo-notify${suffix}`;
function loadNotify() {
  try { const { version, ...n } = JSON.parse(localStorage.getItem(NOTIFY_KEY) || 'null') || {}; void version; return Object.keys(n).length ? n : undefined; } catch { return undefined; }
}
function saveNotify(n) {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify({ version: 1, ...(loadNotify() || {}), ...n })); } catch { /* 保存不可でも続ける */ }
}
function saveUi() {
  const { selected, view, style, desk, home, monthExpand, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTextSize } = state;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ selected, view, style, desk, home, monthExpand, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTextSize })); } catch { /* 保存不可でも動作は続ける */ }
}
function set(patch) { Object.assign(state, patch); if ('weekStart' in patch) setFirstDay(state.weekStart); saveUi(); render(); }

// ---------- レイアウト寸法 L（キーボードで変わらない寸法）と可視範囲 V ----------
// L = キーボード非表示時の文書領域。テキスト入力中（とその直後）は幅が変わらない限り高さの縮小を無視する。
const de = document.documentElement;
const L = { w: window.innerWidth, h: window.innerHeight };
const maxH = new Map([[L.w, L.h]]);
let kbHold = false, kbTimer = 0;
const isTextEl = (a) => !!a && !!a.matches?.('textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit])');
const keyboardLikely = () => kbHold || isTextEl(document.activeElement);
function measureL() {
  const w = window.innerWidth, h = window.innerHeight;
  let nh = h;
  if (keyboardLikely()) nh = w === L.w ? Math.max(L.h, h) : Math.max(maxH.get(w) || 0, h);
  const changed = w !== L.w || nh !== L.h;
  L.w = w; L.h = nh;
  maxH.set(w, keyboardLikely() ? Math.max(maxH.get(w) || 0, nh) : nh);
  return changed;
}
// safe area の計測（CSS の --sat 等を実寸に解決）。
let probe = null;
function safe() {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--sat) var(--sar) var(--sab) var(--sal)';
    document.body.append(probe);
  }
  const c = getComputedStyle(probe);
  return { top: parseFloat(c.paddingTop) || 0, right: parseFloat(c.paddingRight) || 0, bottom: parseFloat(c.paddingBottom) || 0, left: parseFloat(c.paddingLeft) || 0 };
}
function updateVars() {
  const vv = window.visualViewport, H = window.innerHeight;
  const zoomed = (vv?.scale || 1) > 1.01;
  const vy = vv && !zoomed ? Math.max(0, vv.offsetTop) : 0;
  const vh = vv && !zoomed ? vv.height : H;
  const gap = Math.max(0, Math.round(H - (vy + vh)));
  de.style.setProperty('--vy', `${Math.round(vy)}px`);
  de.style.setProperty('--vb', `${gap}px`);
  const kb = !zoomed && (H < L.h - 80 || vy + vh < L.h - 80);
  if (kb) de.dataset.kb = '1'; else delete de.dataset.kb;
  return { kb, vh };
}
// フォーカス中の入力が本文の可視範囲に入るよう、本文だけを最小距離スクロールする（文書は動かさない）。
function reveal(el) {
  const sc = el?.closest?.('.fbody, .pbody');
  if (!sc) return;
  const a = el.getBoundingClientRect(), b = sc.getBoundingClientRect(), pad = 8;
  if (a.top < b.top + pad) sc.scrollTop -= b.top + pad - a.top;
  else if (a.bottom > b.bottom - pad) sc.scrollTop += a.bottom - (b.bottom - pad);
}
let vpRaf = 0;
function vpSchedule() { cancelAnimationFrame(vpRaf); vpRaf = requestAnimationFrame(vpTick); }
function vpTick() {
  const changed = measureL();
  const { kb } = updateVars();
  const sc = safeChanged();
  updateDiagnostics();
  if (changed || sc) render();
  const a = document.activeElement;
  if (kb && isTextEl(a)) {
    const d = a.closest('dialog');
    const mh = d ? parseFloat(getComputedStyle(d).maxHeight) : NaN;
    if (d && Number.isFinite(mh) && mh < 160) { a.blur(); say('入力欄を表示するためキーボードを閉じました。'); } else reveal(a);
  }
}

// ---------- レイアウト判定（L・卓上トグル） ----------
// 機種の寸法は決め打ちしない。600 はコンパクト（閉じた）判定のブレークポイント。
function layoutKind() {
  const w = L.w, h = L.h;
  if (Math.min(w, h) < 600) return state.home !== false ? 'home' : 'browse';
  if (state.desk) return 'desk';
  return w > h ? 'spread' : 'open';
}
// 開いた縦（通常の開いた状態で縦長）。月は全幅、週は日別の縦リスト。
const isPortrait = () => layoutKind() === 'open' && L.h >= L.w;
// 「一覧」（今日と次の予定のリスト）を本文に出しているか。閉じた画面は home、開いた画面は「一覧」を選んだとき。
function listShown() { const k = layoutKind(); return k === 'home' || (state.home === true && k !== 'browse'); }

// ---------- 寸法の唯一の入力 → CSS 変数（座標はすべて画面座標 CSS px） ----------
// 入力: 安定寸法 L（innerWidth/innerHeight）・safe area・週数。折り目は常にビューポート中心 L.w/2。
let lastSafe = null;
const safeKey = (S) => `${S.top}/${S.right}/${S.bottom}/${S.left}`;
function safeChanged() { const k = safeKey(safe()); const c = k !== lastSafe; lastSafe = k; return c; }
const REF = { closed: [466, 678], portrait: [669, 951], landscape: [951, 669] }; // 比率の基準分母（画面サイズ・折り目の固定値ではない）
const r2 = (n) => Math.round(n * 100) / 100;
function updateLayoutMetrics() {
  const S = safe(); lastSafe = safeKey(S);
  const kind = layoutKind(), W = L.w, H = L.h;
  const x0 = S.left, y0 = S.top, U = W - S.left - S.right, V = H - S.top - S.bottom;
  const post = kind === 'home' || kind === 'browse' ? 'closed' : kind === 'open' && isPortrait() ? 'portrait' : 'landscape';
  const [bw, bh] = REF[post], rx = U / bw, ry = V / bh;
  const n = monthWeeks(state.selected).length;
  const v = { 'layout-w': W, 'layout-h': H, 'content-x': x0, 'content-y': y0, 'content-w': U, 'content-h': V, 'fold-x': W / 2 };
  let left, right, railW = 0, c, headH, gridTop, G, tabsCx, tabsY, ctrlY, tlTop = 0, rightStart = 0;
  if (post === 'closed') {
    railW = 84; left = x0 + 4; right = x0 + U - railW - 2; c = (U - 90) / 7; gridTop = y0 + 102 * ry; G = 510 * ry; tabsY = y0 + 606 * ry; ctrlY = y0 + 598 * ry; headH = 82 * ry;
  } else if (post === 'portrait') {
    left = x0; right = W - S.right; c = U / 7; gridTop = y0 + 100 * ry; G = 780 * ry; tabsY = y0 + 881 * ry; ctrlY = y0 + 881 * ry; headH = 72 * ry;
  } else {
    railW = 76; left = x0 + 8; right = W / 2 - 10; c = (right - left) / 7; gridTop = y0 + 96 * ry; G = 573 * ry; tabsY = y0 + 611 * ry; ctrlY = y0 + 600 * ry; headH = 76 * ry; tlTop = y0 + 108 * ry; rightStart = W / 2 + 10;
  }
  tabsCx = (left + right) / 2;
  // 開いた縦の操作: 上=設定(x0+20rx)・検索(x0+480rx)（y0+24ry・44角）、下=今日(x0+20rx)・＋(右端−20rx−48)
  Object.assign(v, { 'set-x': x0 + 20 * rx, 'set-y': y0 + 24 * ry, 'search-x': x0 + 480 * rx, 'today-x': x0 + 20 * rx, 'add-x': W - S.right - 20 * rx - 48 });
  de.style.setProperty('--rx', String(r2(rx)));
  const tabsW = Math.min(270, Math.max(176, right - left));
  const maxY = H - S.bottom - (post === 'closed' ? 26 * ry : 0); // ボタン・タブの下端が安全矩形を越えない（閉じた画面は下から26ry以上内側）
  Object.assign(v, {
    'left-end': right, 'right-start': rightStart, 'rail-w': railW, 'grid-top': gridTop, 'grid-h': G, 'week-h': G / n, 'month-col-w': c,
    'tabs-x': tabsCx - tabsW / 2, 'tabs-y': Math.min(tabsY, maxY - 46), 'tabs-w': tabsW, 'controls-y': Math.min(ctrlY, maxY - 48), 'timeline-top': tlTop,
    'head-h': headH, 'wd-h': gridTop - y0 - headH,
  });
  if (post === 'landscape') {
    // 見開き: 左ページ x0+8〜W/2-10、右ページ W/2+10〜(右端-76)、右端76の操作列。右の操作は下から詰め、重ならないようにする。
    const bottom = H - S.bottom, addY = Math.min(600 * ry + y0, bottom - 48), capY = Math.min(446 * ry + y0, addY - 10 - 144), todayY = Math.min(386 * ry + y0, capY - 12 - 48);
    const sv = { 'left-start': left, 'right-end': W - S.right - railW, 'sr-today-y': todayY, 'sr-cap-y': capY, 'sr-add-y': addY };
    for (const [k, val] of Object.entries(sv)) de.style.setProperty(`--${k}`, `${r2(val)}px`);
  }
  // 閉じた画面: 月のスクロール末尾は、最終週をタブの上へ出せるだけ（安全矩形の下端 − タブ上端）、最低56
  de.style.setProperty('--end-pad-closed', `${r2(Math.max(56, y0 + V - (v['tabs-y'] ?? 0)))}px`);
  de.style.setProperty('--ry', String(r2(ry))); // 閉じた画面の操作列の縦位置（基準比率）
  for (const [k, val] of Object.entries(v)) de.style.setProperty(`--${k}`, `${r2(val)}px`);
  // 月の字: 閉9／縦10／横9.5。「月の文字: 大」は 11px。
  de.style.setProperty('--chip-fs', `${state.monthTextSize === 'large' ? 11 : post === 'closed' ? 9 : post === 'portrait' ? 10 : 9.5}px`);
  return { post, n };
}
// 描画後: 今の画面枠の月ペインの利用高から、グリッド高・基準週高を実測して渡す（新レイアウト完成までの暫定）。
function measureMonthPane() {
  if (layoutKind() !== 'desk') return; // 閉じた画面・開いた縦・見開きは §1.2 の寸法をそのまま使う（卓上だけ暫定の実測）
  const pane = root.querySelector('.scroll.msc, .scroll.all');
  if (!pane) return;
  const n = root.querySelectorAll('.week').length || monthWeeks(state.selected).length;
  de.style.setProperty('--grid-h', `${r2(pane.clientHeight)}px`);
  de.style.setProperty('--week-h', `${r2(pane.clientHeight / n)}px`);
}
// 診断行: 生の innerWidth×innerHeight・DPR・safe（コピー可。外へ送らず保存もしない）。
const num = (n) => String(Math.round(n * 100) / 100);
function diagText() {
  const S = safe();
  return `${window.innerWidth}×${window.innerHeight} px · DPR ${num(window.devicePixelRatio || 1)} · safe 上${num(S.top)} 右${num(S.right)} 下${num(S.bottom)} 左${num(S.left)} px`;
}
function updateDiagnostics() { const el = $('#layout-diagnostics'); if (el) el.textContent = diagText(); }

// ---------- iPhone カレンダー連携の状態（ネイティブ版のみ） ----------
const NATIVE = nativeAvailable();
const LINK_KEY = `duo-native-cal${suffix}`;
let linkSaveFailed = false;
function loadLink() {
  try { return normSettings(JSON.parse(localStorage.getItem(LINK_KEY) || 'null')); } catch { return normSettings(null); }
}
let link = loadLink();
function setLink(patch) {
  link = { ...link, ...patch };
  try { localStorage.setItem(LINK_KEY, JSON.stringify(link)); linkSaveFailed = false; } catch { linkSaveFailed = true; }
}
// perm: null（未確認）| granted | denied | restricted | notDetermined | writeOnly
const X = { avail: NATIVE, perm: null, calendars: [], cache: null, status: 'idle', stale: false, gen: 0, inflight: null, inflightKey: '', failKey: '', vis: null, visFor: null };
const extActive = () => NATIVE && X.avail && link.enabled && X.perm === 'granted';
// 表示用の外部予定（アプリ予定のリンクと一致するものは除外）。入力が変わるまで使い回す。
function visExt() {
  if (!extActive() || !X.cache) return [];
  if (X.visFor?.[0] !== X.cache || X.visFor?.[1] !== state.events) { X.vis = dedupe(X.cache.events, state.events); X.visFor = [X.cache, state.events]; }
  return X.vis;
}
const isX = (e) => e.origin === 'iphone';
const catOf = (e) => resolveCategory(e.categoryId, state.categories);
const catCls = (e) => (isX(e) ? 'ext' : '');
// 色はカテゴリ一覧から inline の CSS 変数で（固定クラスは使わない）。iPhone の予定はカレンダーの色。
const colorVars = (c) => `--cat:${c};--tint:${tint(c)};`;
const catVar = (e) => (isX(e) ? `--cat:${e.color};` : colorVars(catOf(e).color));
const catSty = (e) => ` style="${catVar(e)}"`;
const tagText = (e) => (isX(e) ? subLabel(e) : catOf(e).name);
const xi = (e) => (isX(e) ? '<span class="xi" aria-hidden="true">▦</span>' : '');
const xname = (e) => (isX(e) ? `iPhone、${e.calName}、` : '');

// ---------- テンプレート ----------
// 浮動タブ: 一覧／日／週／月（今日はボタンへ移った）。native button + aria-pressed。一覧のみ data-act=list。
const TABS = [['list', '一覧'], ['day', '日'], ['week', '週'], ['month', '月']];
function tabs() {
  const act = listShown() ? 'list' : state.view;
  return `<div class="tabs" role="group" aria-label="表示期間">${TABS.map(([v, l], i) => `<button type="button" ${v === 'list' ? 'data-act="list"' : `data-view="${v}"`} aria-pressed="${v === act}" aria-description="4個中${i + 1}番目"><span class="pill">${l}</span></button>`).join('')}</div>`;
}
const todayBtn = '<button type="button" class="today" data-act="today">今日に戻る</button>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const hdr = `<button type="button" class="iconbtn" data-act="search" aria-label="予定を検索">${ICON_SEARCH}</button><button type="button" class="iconbtn" data-act="menu" aria-label="その他" aria-haspopup="dialog">…</button>`;
const brand = `<div class="brand"><span class="logo">Duo.</span><span class="small">私の手帳</span></div>${hdr}`;
// 閉じた画面の右の操作列: 上に設定・検索、下に今日（曜日＋日付）・＋。各48px。
function rail() {
  const d = parseKey(todayKey());
  return `<div class="rail" aria-label="操作"><div class="rtop"><button type="button" class="rbtn" data-act="menu" aria-label="その他" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg></button><button type="button" class="rbtn" data-act="search" aria-label="予定を検索">${ICON_SEARCH}</button></div>
    <div class="rbot"><button type="button" class="rbtn rtoday" data-act="today" aria-label="今日に戻る"><span aria-hidden="true">${DOW[d.getDay()]}${d.getDate()}</span></button><button type="button" class="rbtn radd" data-act="add" aria-label="予定を追加"><span aria-hidden="true">＋</span></button></div></div>`;
}
// 開いた縦の操作（浮動）: 上に設定・検索（44）、下に今日・＋（48）。
function pctl() {
  const d = parseKey(todayKey());
  return `<div class="pctl" aria-label="操作"><button type="button" class="rbtn pbtn psettings" data-act="menu" aria-label="その他" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg></button><button type="button" class="rbtn pbtn psearch" data-act="search" aria-label="予定を検索">${ICON_SEARCH}</button>
    <button type="button" class="rbtn pbtn ptoday" data-act="today" aria-label="今日に戻る"><span aria-hidden="true">${DOW[d.getDay()]}${d.getDate()}</span></button><button type="button" class="rbtn radd pbtn padd" data-act="add" aria-label="予定を追加"><span aria-hidden="true">＋</span></button></div>`;
}
const occIn = (a, b) => {
  let base = occBetween(state.events, a, b);
  if (hiddenCats.size) base = base.filter((e) => !hiddenCats.has(e.categoryId)); // 非表示のカテゴリは表示から隠す（予定は消さない）
  const x = visExt();
  return x.length ? base.concat(extIn(x, a, b)) : base;
};
const rep = (e) => (e.recurring ? '<span class="rep" aria-hidden="true">↻</span>' : '');
const repLabel = (e, t) => (e.recurring || isX(e) ? ` aria-label="${esc(`${xname(e)}${t}${e.recurring ? ' 繰り返し' : ''}`)}"` : '');
const addBtn = '<footer class="foot"><button type="button" class="add" data-act="add">＋ 予定を追加</button></footer>';
const legend = () => `<div class="legend" aria-label="カテゴリ凡例">${state.categories.filter((c) => !c.hidden).map((c) => `<span style="--cat:${c.color}">${esc(c.name)}</span>`).join('')}</div>`;
const xlegend = () => (extActive() ? '<div class="xlegend small">▦ iPhoneの予定（カレンダーの色）</div>' : '');

function periodTitle() {
  const d = parseKey(state.selected);
  if (state.view === 'month') return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
  if (state.view === 'week') {
    const s = parseKey(weekStart(state.selected)), e = parseKey(addDays(weekStart(state.selected), 6));
    return `${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`;
  }
  return dayLabel(state.selected);
}
const unit = () => ({ month: '月', week: '週', day: '日' }[state.view]);
const navBtn = (dir) => `<button type="button" data-act="${dir > 0 ? 'next' : 'prev'}" aria-label="${dir > 0 ? '次' : '前'}の${unit()}">${dir > 0 ? '›' : '‹'}</button>`;
const arrows = () => `<div class="arrows">${navBtn(-1)}${navBtn(1)}</div>`;
// 月の表現: 手帳（点）｜予定名｜全部。「全部」は monthExpand、手帳・予定名は style に対応する。入口は設定メニューの「月の表現」。
// 開いた縦の月は常に予定名の表示なので、「手帳」は出さない（予定名｜全部）。
const monthMode = (kind) => (state.monthExpand ? 'all' : kind === 'portrait' ? 'named' : state.style);
const variantBtns = (kind) => [['simple', '手帳'], ['named', '予定名'], ['all', '全部']].filter(([v]) => !(kind === 'portrait' && v === 'simple')).map(([v, l]) => `<button type="button" data-mode="${v}" aria-pressed="${monthMode(kind) === v}">${l}</button>`).join('');
// 期間の見出し（前の期間｜見出し｜次の期間）
const chead = () => `<div class="chead">${navBtn(-1)}<h2 id="ctitle">${periodTitle()}</h2>${navBtn(1)}</div>`;

function card(e) {
  const sub = [e.place ? esc(e.place) : '', isMulti(e) ? `${e.start.slice(5, 10).replace('-', '/')} 〜 ${e.end.slice(5, 10).replace('-', '/')}` : '', e.nativeLink?.state === 'linked' ? 'iPhoneにも追加済み' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="event ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}"${repLabel(e, `${timeLabel(e)} ${e.title}`)}><span class="clock">${timeLabel(e)}</span><span class="tag">${esc(tagText(e))}</span><strong>${rep(e)}${esc(e.title)}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
}
const sampleBtn = () => (state.loaded && state.events.length === 0 ? '<button type="button" class="ghost" data-act="sample">サンプルを入れる</button>' : '');
function dayList(k) {
  const list = eventsOnDay(occIn(k, k), k);
  if (list.length) return list.map(card).join('');
  return `<div class="empty"><p>予定のない、余白の一日。</p><button type="button" class="ghost" data-new="${k}">＋ この日に追加</button> ${sampleBtn()}</div>`;
}
function agenda(k) {
  const n = eventsOnDay(occIn(k, k), k).length;
  return `<section class="agenda" aria-label="選択日の予定"><div class="eyebrow">選択日の予定</div><h3>${dayLabel(k)}</h3><div class="count small">${n}件の予定</div><div class="list" data-scroll="agenda">${dayList(k)}</div></section>`;
}

// ---------- 月（手帳｜予定名｜全部 共通の週描画） ----------
// 日付行18・最初のレーン19・16px刻み・チップ14px・下余白2（CSS の --date-h/--lane-top/--lane-step/--chip-h と同値）。
const LANE_TOP = 19, LANE_STEP = 16, LANE_PAD = 2;
const xCount = (es) => { const n = es.filter(isX).length; return n ? `（うちiPhone ${n}件）` : ''; };
const weekdaysHtml = (cls = '') => `<div class="weekdays${cls}">${weekdayHeads().map(({ i, label }) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${label}</span>`).join('')}</div>`;
// 姿勢ごとの月の設定。kind は calendar(kind) の姿勢名（browse=閉じた／portrait=開いた縦／spread・desk・open=横）。
// 通常の段数: 閉4／開5（大文字は1件減）。「全部」は全姿勢5段（大文字は4段）。時刻は姿勢ごとの設定。
function monthCfg(kind) {
  const closed = kind === 'browse' || kind === 'home', large = state.monthTextSize === 'large';
  return { cap: (closed ? 4 : 5) - (large ? 1 : 0), allCap: large ? 4 : 5, time: closed ? state.monthTimeClosed : state.monthTimeOpen };
}
// 月の週の元データ（イベント・レーン配置）。cap 段まで置き、あふれは hidden（+N）。
function weekData(days, cap) {
  const wev = occIn(days[0], days[6]);
  const { items, hidden, used } = assignSharedLanes(wev, days, cap);
  return { days, wev, items, hidden, used };
}
const needOf = (used) => LANE_TOP + used * LANE_STEP + LANE_PAD;
const colPos = (sc, ec) => `left:calc(${sc} * 100% / 7 + 1.5px);width:calc(${ec - sc + 1} * 100% / 7 - 3px)`;
// 週の中身: 日セル（button）・+N（兄弟 button）・帯／チップ（兄弟 button）。ボタンの入れ子は作らない。
// mode: simple（点）| named | all。
function weekInner(w, { mode, cur, sel, today, cap, time }) {
  const { days, wev, items, hidden } = w;
  let html = '';
  days.forEach((k, col) => {
    const es = eventsOnDay(wev, k), d = parseKey(k), dow = d.getDay();
    const label = d.getDate() === 1 ? `${d.getMonth() + 1}月1日` : d.getDate();
    const dots = mode === 'simple' ? `<span class="dots">${es.slice(0, cap).map((e) => `<i class="dot ${catCls(e)}"${catSty(e)}></i>`).join('')}</span>` : '';
    html += `<button type="button" class="day${d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}${dow === 6 ? ' sat' : dow === 0 ? ' sun' : ''}" data-date="${k}" aria-label="${dayLabel(k)}、予定${es.length}件${xCount(es)}" aria-pressed="${k === sel}"><span class="num">${label}</span>${dots}</button>`;
    const extra = mode === 'simple' ? es.length - cap : hidden[col];
    if (extra > 0) html += `<button type="button" class="plus" data-jump="${k}" style="right:calc(${6 - col} * 100% / 7)" aria-label="${dayLabel(k)}の予定をすべて見る（ほか${extra}件）">+${extra}</button>`;
  });
  if (mode === 'simple') return html;
  for (const b of items) {
    const { e } = b, top = `top:${LANE_TOP + b.lane * LANE_STEP}px`;
    if (b.band) {
      const when = dayOf(e.start) === dayOf(e.end) ? `${dayLabel(dayOf(e.start))} 終日` : `${dayOf(e.start)}から${dayOf(e.end)}`;
      html += `<button type="button" class="bar ${catCls(e)}" data-event="${esc(e.id)}" style="${catVar(e)}left:calc(${b.sc} * 100% / 7);width:calc(${b.ec - b.sc + 1} * 100% / 7);${top}" aria-label="${esc(`${xname(e)}${e.title} ${when}${e.recurring ? ' 繰り返し' : ''}`)}"><span class="bt">${esc(e.title)}</span></button>`;
    } else {
      const k = days[b.sc];
      html += `<button type="button" class="strip ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}${colPos(b.sc, b.ec)};${top}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}`)}">${time ? `${e.start.slice(11)} ` : ''}${esc(e.title)}</button>`;
    }
  }
  return html;
}
function monthGrid(kind) {
  const sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth();
  const mode = kind === 'portrait' ? 'named' : state.style, cfg = monthCfg(kind);
  let html = '';
  for (const days of monthWeeks(sel)) {
    const w = mode === 'simple' ? { days, wev: occIn(days[0], days[6]), items: [], hidden: [] } : weekData(days, cfg.cap);
    html += `<div class="week ${mode}" style="--need:${mode === 'simple' ? 56 : needOf(cfg.cap)}px">${weekInner(w, { mode, cur, sel, today, cap: cfg.cap, time: cfg.time })}</div>`;
  }
  return html;
}

// 「全部」: 1日5件まで。週の高さ = max(グリッド÷週数, 19 + その週の使用段数×16 + 2)。
// 見えている週と前後1週だけ中身を描き、それ以外は高さだけ確保した空の行にする。
let allYm = ''; // 直前に描いた「全部」の月（月が変わったらスクロール位置を引き継がない）
let allWeeks = new Map(); // 週の先頭の日付 → { days, wev, items, hidden, used }（描画のたびに作り直す）
let allCtx = null;
function monthGridAll(kind) {
  const weeks = monthWeeks(state.selected), cfg = monthCfg(kind);
  allWeeks = new Map();
  allCtx = { mode: 'all', cap: cfg.allCap, time: cfg.time };
  let rows = '';
  for (const days of weeks) {
    const w = weekData(days, cfg.allCap);
    allWeeks.set(days[0], w);
    rows += `<div class="week all" data-wk="${days[0]}" style="--need:${needOf(w.used)}px"></div>`;
  }
  return `${weekdaysHtml(' all')}<div class="scroll all" data-scroll="cal" style="--n:${weeks.length}">${rows}</div>`;
}
// 見えている週（スクロール位置から計算）と前後1週だけ描く。行の高さは固定なので、描画してもスクロール位置はずれない。
function syncAllWeeks() {
  const sc = root.querySelector('.scroll.all');
  if (!sc) return;
  const rows = [...sc.children], top = sc.scrollTop, bot = top + sc.clientHeight;
  let a = rows.length, z = -1;
  rows.forEach((r, i) => { if (r.offsetTop < bot && r.offsetTop + r.offsetHeight > top) { a = Math.min(a, i); z = Math.max(z, i); } });
  const cur = parseKey(state.selected).getMonth(), sel = state.selected, today = todayKey();
  rows.forEach((r, i) => {
    const want = i >= a - 1 && i <= z + 1;
    if (want && !r.dataset.drawn) { r.innerHTML = weekInner(allWeeks.get(r.dataset.wk), { ...allCtx, cur, sel, today }); r.dataset.drawn = '1'; }
    else if (!want && r.dataset.drawn) { r.textContent = ''; delete r.dataset.drawn; }
  });
}
// 見えている先頭の週と、その週の中での位置（割合）を覚える。向き・開閉で行の高さが変わっても同じ週に戻せる。
// 画面サイズが変わると、描画し直す前にブラウザがスクロール位置を詰めてしまう。そのため、位置は「スクロールしたとき」に
// （領域の大きさが変わっていないときだけ）記録しておき、描画し直すときはその記録を使う。
let anchorRec = null, recSize = '';
const sizeOf = (sc) => `${sc.clientWidth}x${sc.clientHeight}`;
function anchorOf(sc) {
  const r = sc.getBoundingClientRect();
  for (const w of sc.children) {
    const wr = w.getBoundingClientRect();
    if (wr.bottom > r.top + 1) return { ym: allYm, wk: w.dataset.wk, ratio: Math.max(0, (r.top - wr.top) / (wr.height || 1)) };
  }
  return null;
}
function restoreAll(anchor) {
  const sc = root.querySelector('.scroll.all');
  if (!sc) { anchorRec = null; return; }
  const ym = state.selected.slice(0, 7), target = anchor && anchor.ym === ym ? sc.querySelector(`[data-wk="${anchor.wk}"]`) : null;
  if (target) sc.scrollTop = target.offsetTop + anchor.ratio * target.offsetHeight;
  else { // 初回・月が変わったとき: 選んでいる日の週が見えるように
    const w = sc.querySelector(`[data-wk="${weekStart(state.selected)}"]`);
    sc.scrollTop = w && w.offsetTop + w.offsetHeight > sc.clientHeight ? w.offsetTop : 0;
  }
  allYm = ym;
  syncAllWeeks();
  recSize = sizeOf(sc);
  anchorRec = anchorOf(sc);
  let raf = 0;
  sc.addEventListener('scroll', () => {
    if (sizeOf(sc) === recSize) anchorRec = anchorOf(sc);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(syncAllWeeks);
  }, { passive: true });
}

// 週・日
const weekKeys = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart(state.selected), i));
function weekEvent(e, k, vlist = false) {
  return `<button type="button" class="event week-event ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}`)}"><span class="clock">${e.all || (vlist && isMulti(e)) ? '終日' : e.start.slice(11)}</span><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
}
function weekRow(k, short, vlist = false) {
  const list = eventsOnDay(occIn(k, k), k), d = parseKey(k);
  const head = short ? `${d.getDate()}（${DOW[d.getDay()]}）` : dayLabel(k);
  const body = list.map((e) => weekEvent(e, k, vlist)).join('') || '<div class="empty-row">予定なし</div>';
  return `<section class="weekrow${k === todayKey() ? ' today' : ''}${k === state.selected ? ' selected' : ''}"><button type="button" class="wd" data-jump="${k}" aria-label="${dayLabel(k)}を日表示で開く">${head}</button>${vlist ? `<div class="wevents">${body}</div>` : body}</section>`;
}
const weekNotes = '<div class="weeknotes"><div class="eyebrow">今週の余白</div>日付から一日の詳細へ。予定を選ぶと全文を確認できます。</div>';

function calendarBody(kind) {
  if (state.view === 'month') return state.monthExpand ? monthGridAll(kind) : `${weekdaysHtml()}<div class="scroll msc" data-scroll="cal">${monthGrid(kind)}</div>`;
  if (state.view === 'week') {
    const cols = kind === 'open' || kind === 'desk';
    const vlist = kind === 'portrait';
    return `<div class="scroll" data-scroll="cal"><div class="weekview${cols ? ' cols' : ''}${vlist ? ' vlist' : ''}">${weekKeys().map((k) => weekRow(k, cols || vlist, vlist)).join('')}</div></div>`;
  }
  return `<div class="scroll" data-scroll="cal"><div class="daylist">${dayList(state.selected)}</div></div>`;
}
const calendar = (kind) => `<section class="calendar" aria-label="カレンダー">${chead()}${calendarBody(kind)}</section>`;

// 一覧（今日と次の予定・今日の残り）。閉じた画面の本文、開いた画面では「一覧」タブの本文。
function listHtml() {
  const now = nowStamp(), k = todayKey(), d = parseKey(k);
  const list = eventsOnDay(occIn(k, k), k).filter((e) => e.end > now);
  let next = list.find((e) => !e.all) || list[0];
  const rest = list.filter((e) => e !== next);
  // 今日にもう予定がなければ、未来の回も含めて日付順に次の予定を探す。
  if (!next) next = occIn(addDays(k, 1), addDays(k, 400)).sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)))[0];
  const nextDay = next && dayOf(next.start) !== k ? `<small class="nd">${dayLabel(dayOf(next.start))}</small> ` : '';
  const nextHtml = next
    ? `<button type="button" class="next ${catCls(next)}"${catSty(next)} data-event="${esc(next.id)}"${repLabel(next, `次の予定 ${next.title}`)}><small>次の予定 · ${esc(tagText(next))}</small><strong>${xi(next)}${rep(next)}${esc(next.title)}</strong><span class="when"><span class="time">${nextDay}${next.all ? '終日' : next.start.slice(11)}</span>${next.all || dayOf(next.start) !== dayOf(next.end) ? '' : ` — ${next.end.slice(11)}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}</span></button>`
    : `<div class="next none"><small>次の予定</small><strong>${extActive() ? '読み込み済みの期間に次の予定はありません。' : state.events.length ? 'この後の予定はありません' : '予定はまだありません'}</strong>${sampleBtn()}</div>`;
  return `<section class="hero"><div class="date-block"><div class="eyebrow">今日 / ${d.getFullYear()}年${d.getMonth() + 1}月</div><div class="date">${d.getDate()}<span>${DOW[d.getDay()]}曜日</span></div></div>${nextHtml}</section>
    <section class="remaining" aria-label="今日の残り予定"><h3>今日の残り予定</h3><div class="list" data-scroll="rest">${rest.map(card).join('') || '<p class="small pad">この後の予定はありません。</p>'}</div></section>`;
}
const listView = () => `<div class="home listview" aria-label="一覧">${listHtml()}</div>`;
// 閉じた画面（一覧 = home / 日・週・月 = browse）: 月領域（左）＋ 操作列 84px（右）＋ 浮動タブ。
function closed(kind) {
  return `<div class="shell closed ${kind}"><div class="mpane">${kind === 'home' ? listView() : calendar('browse')}</div>${rail()}${tabs()}</div>`;
}
// 開いた縦: 全幅の月（下に予定一覧は置かない）＋上の設定・検索＋下の今日・タブ・＋。日・週・一覧も同じ枠でスクロール。
function open() {
  return `<div class="shell open portrait"><div class="pcol">${listShown() ? listView() : calendar('portrait')}</div>${pctl()}${tabs()}</div>`;
}
function desk() {
  return `<div class="shell desk"><div class="desktop"><header class="top">${brand}<div class="toolbar">${todayBtn}</div></header>${listShown() ? listView() : calendar('desk')}${tabs()}</div>
    <div class="foldband" role="separator" aria-label="折り目の保護領域">折り目の保護領域</div>
    <div class="deskbottom">${agenda(state.selected)}${addBtn}</div></div>`;
}
// ---------- 見開き（開いた横）: 左ページ＝月／一覧／日の時間軸／週の前半、右ページ＝時間軸／日の詳細／週の後半 ----------
// 折り目（ビューポート中心 ±10px）には何も置かない。左右ページは中心±10 で clip し、背景は中心で直接接続する。
const TL = { hh: 60, days: 1, key: '', quiet: 0 }; // 時間軸: 1時間の高さ(px)・1日/3日・初期スクロールの判定キー
const HH_MIN = 31, HH_MAX = 80, TL_PAD = 12;
const clampHh = (n) => Math.min(HH_MAX, Math.max(HH_MIN, n));
const minOf = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const tlKeys = (days) => Array.from({ length: days }, (_, i) => addDays(state.selected, i));
function sheadTitle() {
  if (state.view !== 'month' || listShown()) return periodTitle();
  const d = parseKey(state.selected);
  return `<span class="yr">${d.getFullYear()}年</span> ${d.getMonth() + 1}月`;
}
// 左ページ見出し: 年（薄色）月 ｜ 前・次（44角）｜ 設定（44角）。
const shead = () => `<div class="shead"><h2 id="ctitle">${sheadTitle()}</h2><div class="sctl">${navBtn(-1)}${navBtn(1)}<button type="button" class="sset" data-act="menu" aria-label="その他" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg></button></div></div>`;
// 右端の操作列（76px）: 今日・（月／一覧／検索）・＋。縦位置は下から詰める（JS の --sr-*-y）。
function srail() {
  const d = parseKey(todayKey());
  return `<div class="rail srail" aria-label="操作"><button type="button" class="rbtn rtoday" data-act="today" aria-label="今日に戻る"><span aria-hidden="true">${DOW[d.getDay()]}${d.getDate()}</span></button>
    <div class="cap" role="group" aria-label="表示と検索"><button type="button" data-view="month" aria-label="月を開く"><span aria-hidden="true">月</span></button><button type="button" data-act="list" aria-label="一覧を開く"><span aria-hidden="true">一覧</span></button><button type="button" data-act="search" aria-label="予定を検索"><span aria-hidden="true">検索</span></button></div>
    <button type="button" class="rbtn radd" data-act="add" aria-label="予定を追加"><span aria-hidden="true">＋</span></button></div>`;
}
// 時間軸 1 日分のブロック: 開始〜終了（分）。日をまたぐ予定は当日 0〜24 時へ clip。重なりは等幅の列に分ける。
function dayBlocks(k) {
  const items = eventsOnDay(occIn(k, k), k).filter((e) => !e.all).map((e) => {
    const s = dayOf(e.start) < k ? 0 : minOf(e.start);
    let en = dayOf(e.end) > k ? 1440 : minOf(e.end);
    if (en <= s) en = Math.min(1440, s + 20);
    return { e, s, en, ee: Math.max(en, s + 20) }; // ee: 重なり判定用（最小ブロック高 20px ≒ 20分）
  }).sort((a, b) => a.s - b.s || b.en - a.en);
  let cluster = [], colEnds = [], clusterEnd = 0;
  const flush = () => { const n = colEnds.length || 1; cluster.forEach((x) => { x.n = n; }); cluster = []; colEnds = []; clusterEnd = 0; };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    let c = colEnds.findIndex((t) => t <= it.s);
    if (c < 0) { c = colEnds.length; colEnds.push(0); }
    colEnds[c] = it.ee; it.col = c; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.ee);
  }
  flush();
  return items;
}
function tlBlock({ e, s, en, col, n }, k) {
  const t = e.title, sub = hhmm(s);
  return `<button type="button" class="tlev ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}--m:${s};--d:${en - s};left:calc(${col} * 100% / ${n} + 1px);width:calc(100% / ${n} - 2px)" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${t}${e.recurring ? ' 繰り返し' : ''}`)}"><span class="tt">${sub}</span>${esc(t)}</button>`;
}
// 終日段: 11px「終日」＋カテゴリの淡色地・本色12px太字のピル。最大3件（3日表示は各日1件）、幅不足なら減らして +N（その日の一覧へ）。
function allDayRow(ks, avail) {
  const cap = ks.length === 1 ? 3 : 1, colW = avail / ks.length;
  const cols = ks.map((k) => {
    const list = eventsOnDay(occIn(k, k), k).filter((e) => e.all);
    let shown = Math.min(cap, list.length);
    const est = (es) => es.reduce((a, e) => a + Math.min(colW, e.title.length * 12 + 26) + 6, 0) + (list.length > es.length ? 40 : 0);
    while (shown > 1 && est(list.slice(0, shown)) > colW) shown--;
    const pills = list.slice(0, shown).map((e) => `<button type="button" class="adpill ${catCls(e)}" data-event="${esc(e.id)}" style="${catVar(e)}" aria-label="${esc(`${xname(e)}${dayLabel(k)} 終日 ${e.title}${e.recurring ? ' 繰り返し' : ''}`)}">${esc(e.title)}</button>`).join('');
    const extra = list.length - shown;
    return `<div class="adcol" data-day="${k}">${pills}${extra > 0 ? `<button type="button" class="adplus" data-jump="${k}" aria-label="${dayLabel(k)}の終日の予定をすべて見る（ほか${extra}件）">+${extra}</button>` : ''}</div>`;
  }).join('');
  return `<div class="allday" aria-label="終日の予定"><span class="adl">終日</span><div class="adcols">${cols}</div></div>`;
}
function timelineHtml(ks, avail) {
  const heads = ks.length > 1 ? `<div class="tlheads"><span class="tlh0"></span>${ks.map((k) => { const d = parseKey(k); return `<button type="button" class="tlhd${k === state.selected ? ' sel' : ''}${k === todayKey() ? ' today' : ''}" data-tlday="${k}" aria-pressed="${k === state.selected}" aria-label="${dayLabel(k)}を選ぶ">${d.getDate()}（${DOW[d.getDay()]}）</button>`; }).join('')}</div>` : '';
  let lines = '';
  for (let h = 0; h <= 24; h++) {
    lines += `<i class="hl" style="--m:${h * 60}"></i>`;
    if (h < 24) lines += `<span class="hlab" style="--m:${h * 60}">${h}:00</span><i class="hl half" style="--m:${h * 60 + 30}"></i>`;
  }
  const cols = ks.map((k) => `<div class="tlcol" data-day="${k}">${dayBlocks(k).map((b) => tlBlock(b, k)).join('')}</div>`).join('');
  return `${allDayRow(ks, avail)}${heads}<div class="tl" data-scroll="tl" style="--hh:${TL.hh}px"><div class="tlin" data-days="${ks.join(',')}">${lines}<div class="tlcols">${cols}</div><div class="nowl" hidden><span class="nowt"></span></div></div></div>`;
}
// 右ページの日見出し（11月14日（土））＋ 1日／3日の切替（32px のカプセル・押せる範囲 44px）
function rightHead() {
  return `<div class="rhead"><h2 class="rdate">${dayLabel(state.selected)}</h2><button type="button" class="spanbtn" data-act="tl3" aria-label="表示する日数: ${TL.days}日。${TL.days === 1 ? '3日' : '1日'}にする"><span aria-hidden="true">${TL.days}日 ▾</span></button></div>`;
}
const rightWidth = () => Math.max(0, L.w - safe().right - 76 - (L.w / 2 + 10));
function spread() {
  const k = listShown() ? 'list' : state.view;
  const rw = rightWidth(), lw = L.w / 2 - 10 - (safe().left + 8);
  let left, right;
  if (k === 'list') {
    left = `<section class="page lp">${shead()}${listView()}</section>`;
    right = `<section class="page rp">${rightHead()}${timelineHtml(tlKeys(TL.days), rw - 50)}</section>`;
  } else if (k === 'month') {
    left = `<section class="page lp calendar" aria-label="カレンダー">${shead()}${calendarBody('spread')}</section>`;
    right = `<section class="page rp">${rightHead()}${timelineHtml(tlKeys(TL.days), rw - 50)}</section>`;
  } else if (k === 'week') {
    const ks = weekKeys();
    left = `<section class="page lp">${shead()}<div class="scroll weekpage" data-scroll="pl">${ks.slice(0, 4).map((x) => weekRow(x, false)).join('')}</div></section>`;
    right = `<section class="page rp"><div class="rpad"></div><div class="scroll weekpage" data-scroll="pr">${ks.slice(4).map((x) => weekRow(x, false)).join('')}${weekNotes}</div></section>`;
  } else {
    left = `<section class="page lp">${shead()}${timelineHtml([state.selected], lw - 50)}</section>`;
    right = `<section class="page rp"><div class="rpad"></div>${agenda(state.selected)}</section>`;
  }
  return `<div class="shell spread">${left}${right}${srail()}${tabs()}</div>`;
}
// 時間軸: 初回／選択日の変更で「今の1時間前」へ。現在時刻の線は毎分更新。
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function updateNow() {
  const inner = root.querySelector('.tlin');
  if (!inner) return;
  const ks = inner.dataset.days.split(','), i = ks.indexOf(todayKey()), el = inner.querySelector('.nowl');
  if (i < 0) { el.hidden = true; return; }
  el.hidden = false;
  el.style.setProperty('--m', String(nowMin()));
  el.style.setProperty('--i', String(i));
  el.style.setProperty('--n', String(ks.length));
  el.querySelector('.nowt').textContent = hhmm(nowMin());
}
function initTimeline() {
  const tl = root.querySelector('.tl');
  if (!tl) { TL.key = ''; return; }
  const key = `${layoutKind()}|${state.view}|${state.home}|${state.selected}|${TL.days}`;
  if (key !== TL.key) { TL.key = key; tl.scrollTop = Math.max(0, nowMin() - 60) * TL.hh / 60; }
  updateNow();
}
// 倍率の変更。中心の時刻（画面上の位置 cy）を固定する。
function setHh(next, cy) {
  const tl = root.querySelector('.tl');
  const hh = clampHh(next);
  if (!tl || hh === TL.hh) return;
  const c = cy ?? tl.clientHeight / 2;
  const centerMin = (tl.scrollTop + c - TL_PAD) / TL.hh * 60;
  TL.hh = hh;
  tl.style.setProperty('--hh', `${hh}px`);
  tl.scrollTop = TL_PAD + centerMin * hh / 60 - c;
}
// ピンチ（時間軸の内側だけ）。2本目の指が付いたら倍率、ドラッグ・ピンチの後は空きタップで予定を追加しない。
const tlPtr = new Map();
let tlPinch = null;
root.addEventListener('pointerdown', (ev) => {
  const tl = ev.target.closest?.('.tl');
  if (!tl) return;
  tlPtr.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (tlPtr.size === 2) {
    const [a, b] = [...tlPtr.values()];
    tlPinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, hh0: TL.hh, tl };
    TL.quiet = performance.now() + 500;
  }
});
window.addEventListener('pointermove', (ev) => {
  const p = tlPtr.get(ev.pointerId);
  if (!p) return;
  if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 8) TL.quiet = performance.now() + 400;
  p.cx = ev.clientX; p.cy = ev.clientY; p.moved = true;
  if (tlPinch && tlPtr.size >= 2) {
    const [a, b] = [...tlPtr.values()];
    const d = Math.hypot((a.cx ?? a.x) - (b.cx ?? b.x), (a.cy ?? a.y) - (b.cy ?? b.y));
    const r = tlPinch.tl.getBoundingClientRect();
    setHh(tlPinch.hh0 * d / tlPinch.d0, ((a.cy ?? a.y) + (b.cy ?? b.y)) / 2 - r.top);
    TL.quiet = performance.now() + 500;
  }
});
const tlEnd = (ev) => { if (tlPtr.delete(ev.pointerId) && tlPtr.size < 2) tlPinch = null; };
window.addEventListener('pointerup', tlEnd);
window.addEventListener('pointercancel', tlEnd);
// 空きタップ → その時刻（30分刻み・切り捨て）から1時間の予定を追加。
function tlTap(ev, col) {
  if (performance.now() < TL.quiet) return;
  const rect = col.getBoundingClientRect();
  const m = Math.min(1380, Math.max(0, Math.floor(((ev.clientY - rect.top - TL_PAD) / TL.hh * 60) / 30) * 30));
  openEditor(null, root.querySelector('[data-act="add"]'), col.dataset.day, m);
}

// ---------- 描画（スクロール位置とフォーカスを保つ） ----------
let lastKind = '';
function render() {
  const kind = layoutKind();
  updateLayoutMetrics();
  updateDiagnostics();
  const scrolls = {};
  const anchor = root.querySelector('.scroll.all') ? anchorRec : null;
  root.querySelectorAll('[data-scroll]').forEach((el) => { scrolls[`${lastKind}:${el.dataset.scroll}`] = el.scrollTop; });
  const f = document.activeElement;
  const focusKey = f && root.contains(f) ? f.dataset.act ? `act:${f.dataset.act}` : f.dataset.view ? `view:${f.dataset.view}` : f.dataset.mode ? `mode:${f.dataset.mode}` : f.dataset.date ? `date:${f.dataset.date}` : '' : '';
  document.body.dataset.layout = kind;
  document.body.dataset.posture = kind === 'open' && isPortrait() ? 'portrait' : '';
  root.innerHTML = { home: () => closed('home'), browse: () => closed('browse'), open, desk, spread }[kind]();
  lastKind = kind;
  root.querySelectorAll('[data-scroll]').forEach((el) => { el.scrollTop = scrolls[`${kind}:${el.dataset.scroll}`] || 0; });
  restoreAll(anchor);
  measureMonthPane();
  initTimeline();
  if (focusKey) {
    const [t, v] = focusKey.split(/:(.*)/);
    const sel = { act: `[data-act="${v}"]`, view: `[data-view="${v}"]`, mode: `[data-mode="${v}"]`, date: `[data-date="${v}"]` }[t];
    root.querySelector(sel)?.focus({ preventScroll: true });
  }
  syncExt();
}

// ---------- 操作 ----------
function move(n) {
  const k = state.selected;
  set({ selected: state.view === 'month' ? addMonths(k, n) : addDays(k, n * (state.view === 'week' ? 7 : 1)) });
}
function say(msg) { $('#status').textContent = ''; requestAnimationFrame(() => { $('#status').textContent = msg; }); }

root.addEventListener('click', (ev) => {
  const col = ev.target.closest('.tlcol');
  if (col && !ev.target.closest('button')) { tlTap(ev, col); return; }
  const b = ev.target.closest('button');
  if (!b || !root.contains(b)) return;
  const d = b.dataset;
  if (d.view) set({ view: d.view, home: false });
  else if (d.act === 'list') set({ home: true });
  else if (d.date) {
    const compact = ['home', 'browse'].includes(layoutKind()) || isPortrait();
    // 閉じた画面・開いた縦では選択日サイド（一覧）が無いので、日付選択でその日の日表示へ進む。
    set(compact && state.view === 'month' ? { selected: d.date, view: 'day' } : { selected: d.date });
  } else if (d.jump) set({ selected: d.jump, view: 'day' });
  else if (d.event) openEditor(d.event, b);
  else if (d.new) openEditor(null, b, d.new);
  else if (d.act === 'add') openEditor(null, b);
  else if (d.act === 'today') set({ selected: todayKey() }); // 今日へ戻るのは選択日だけ。表示（一覧・日・週・月）は保つ
  else if (d.act === 'prev') move(-1);
  else if (d.act === 'next') move(1);
  else if (d.act === 'sample') loadSample();
  else if (d.act === 'search') openSearch(b);
  else if (d.act === 'menu') openMenu(b);
  else if (d.act === 'tl3') { TL.days = TL.days === 1 ? 3 : 1; render(); say(`時間軸を${TL.days}日表示にしました。`); }
  else if (d.tlday) set({ selected: d.tlday });
});

async function loadSample() {
  try {
    const ok = new Set(state.categories.map((c) => c.id)), first = state.categories[0]?.id ?? CAT_IDS.none;
    await db.putMany(SAMPLE.map((e) => ({ ...e, categoryId: ok.has(e.categoryId) ? e.categoryId : first })));
    state.events = await db.listEvents();
    bumpRevision();
    render();
    say('サンプルの予定を入れました。');
  } catch { say('サンプルを保存できませんでした。'); }
}

// ---------- パネル共通（編集・範囲・確認・メニュー・検索・バックアップ） ----------
const dlg = $('#editor'), confirmDlg = $('#confirm'), scopeDlg = $('#scope'), menuDlg = $('#menu'), searchDlg = $('#search'), backupDlg = $('#backup'), form = $('#form');
const linkDlg = $('#link'), xdDlg = $('#xdetail'), xrDlg = $('#xretry'), catsDlg = $('#cats');
const panels = [dlg, confirmDlg, scopeDlg, menuDlg, searchDlg, backupDlg, linkDlg, xdDlg, xrDlg, catsDlg];
const anyPanel = () => panels.some((d) => d.open);
const syncInert = () => { root.inert = anyPanel(); };
const origins = new Map();
function openPanel(d, from) {
  origins.set(d, from || document.activeElement);
  d.show();
  syncInert();
}
function closePanel(d, restore = true) {
  d._restore = restore;
  if (d.open) d.close();
  syncInert();
}
// カテゴリ編集を編集シートから開いたときは、閉じたら編集シートの選択肢を作り直す（新規カテゴリはそのまま選択）。
catsDlg.addEventListener('close', () => {
  clearTimeout(cs.timer);
  if (dlg.open) {
    dlg.inert = confirmDlg.open || scopeDlg.open;
    if (cs.fromEditor) fillCatSelect(cs.created && state.categories.some((c) => c.id === cs.created) ? cs.created : state.categories.some((c) => c.id === lastCat) ? lastCat : defaultCatId());
    saveDraft();
  }
});
for (const d of [dlg, menuDlg, searchDlg, backupDlg, linkDlg, xdDlg, catsDlg]) {
  d.addEventListener('close', () => {
    syncInert();
    if (d._restore !== false) {
      const o = origins.get(d);
      (o?.isConnected ? o : root.querySelector('[data-act="add"]'))?.focus({ preventScroll: true });
    }
    d._restore = true;
  });
}

// ---------- 編集シート（ドラフトは sessionStorage に保持） ----------
let editing = null; // 描画ID（通常予定は id、繰り返しの回は parentId@occurrenceKey）
const F = {
  title: $('#f-title'), cat: $('#f-cat'), all: $('#f-all'), start: $('#f-start'), end: $('#f-end'), place: $('#f-place'), notes: $('#f-notes'),
  rfreq: $('#f-rfreq'), rend: $('#f-rend'), rcount: $('#f-rcount'), runtil: $('#f-runtil'), xadd: $('#f-xadd'), xcal: $('#f-xcal'),
};
const R = { toggle: $('#rtoggle'), panel: $('#rpanel'), sum: $('#rsum'), desc: $('#rdesc'), days: $('#rdays-wrap'), end: $('#rend-wrap'), countL: $('#rcount-l'), untilL: $('#runtil-l'), err: $('#rerror') };
let rsel = [], autoDays = true;

function resolve(id) {
  const pr = parseOccId(id);
  if (pr) {
    const p = state.events.find((e) => e.id === pr.parentId && e.recurrence);
    if (p) return { p, occKey: pr.occKey, occ: occurrenceAt(p, pr.occKey) };
  }
  const p = state.events.find((e) => e.id === id);
  return p ? { p, occKey: null, occ: p } : null;
}
const startDow = () => { const t = parseInput(F.start.value, F.all.checked); return parseKey(t ? dayOf(t) : state.selected).getDay(); };
const startKey = () => { const t = parseInput(F.start.value, F.all.checked); return t ? dayOf(t) : state.selected; };

// カテゴリ選択（編集シート）。選択肢はカテゴリ一覧から作り、末尾に「カテゴリを編集…」を置く。
const EDIT_CATS = '__edit-categories';
let lastCat = '';
const defaultCatId = () => (state.categories.find((c) => !c.hidden) ?? state.categories[0])?.id ?? CAT_IDS.none;
function draftCat(d) {
  const ids = state.categories.map((c) => c.id);
  if (ids.includes(d.categoryId)) return d.categoryId;
  const l = legacyToId(d.cat);
  return l && ids.includes(l) ? l : defaultCatId();
}
function fillCatSelect(id) {
  const list = state.categories.map((c) => ({ id: c.id, name: c.hidden ? `${c.name}（非表示）` : c.name }));
  let sel = list.some((c) => c.id === id) ? id : null;
  if (!sel && id) { list.push({ id: CAT_IDS.none, name: UNCATEGORIZED.name }); sel = CAT_IDS.none; } // 参照先が無い予定
  sel ??= defaultCatId();
  F.cat.innerHTML = list.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') + `<option value="${EDIT_CATS}">カテゴリを編集…</option>`;
  F.cat.value = sel;
  lastCat = sel;
}
F.cat.addEventListener('change', () => {
  if (F.cat.value === EDIT_CATS) { F.cat.value = lastCat; openCategories(F.cat, true); return; }
  lastCat = F.cat.value;
});

function readForm() {
  return {
    title: F.title.value, categoryId: F.cat.value === EDIT_CATS ? lastCat : F.cat.value, all: F.all.checked, start: F.start.value, end: F.end.value, place: F.place.value, notes: F.notes.value,
    rfreq: F.rfreq.value, rbyday: [...rsel], rend: F.rend.value, rcount: F.rcount.value, runtil: F.runtil.value, ropen: !R.panel.hidden, autoDays,
    xadd: F.xadd.checked, xcal: F.xcal.value,
  };
}
function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, ...readForm() })); } catch { /* 無視 */ }
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* 無視 */ } }
function applyAllDayUi() {
  const all = F.all.checked;
  F.start.placeholder = all ? '2026/11/12' : '2026/11/12 10:00';
  F.end.placeholder = all ? '2026/11/12' : '2026/11/12 11:00';
}
function setRepeatOpen(open) {
  R.panel.hidden = !open;
  R.toggle.setAttribute('aria-expanded', String(open));
  R.toggle.querySelector('.tri').textContent = open ? '▾' : '▸';
}
function updateRepeatUi() {
  const freq = F.rfreq.value, k = startKey(), d = parseKey(k);
  R.days.hidden = freq !== 'weekly';
  R.end.hidden = freq === 'none';
  R.countL.hidden = freq === 'none' || F.rend.value !== 'count';
  R.untilL.hidden = freq === 'none' || F.rend.value !== 'until';
  R.panel.querySelectorAll('.dow').forEach((b) => b.setAttribute('aria-pressed', String(rsel.includes(Number(b.dataset.dow)))));
  R.desc.textContent = {
    none: '', daily: '毎日繰り返します。', weekly: '選んだ曜日に繰り返します（開始日より前は作成しません）。',
    monthly: `毎月${d.getDate()}日に繰り返します${d.getDate() > 28 ? '（その日がない月はスキップ）' : ''}。`,
    yearly: `毎年${d.getMonth() + 1}月${d.getDate()}日に繰り返します${d.getMonth() === 1 && d.getDate() === 29 ? '（閏年のみ）' : ''}。`,
  }[freq];
  let rule = null;
  if (freq !== 'none') {
    const n = /^\d+$/.test(F.rcount.value.trim()) ? Number(F.rcount.value.trim()) : null;
    const u = parseInput(F.runtil.value, true);
    rule = { freq, byDay: [...rsel].sort((a, b) => a - b), count: F.rend.value === 'count' ? n : null, until: F.rend.value === 'until' && u ? dayOf(u) : null };
  }
  R.sum.textContent = ruleSummary(rule, `${k}T00:00`);
  updateXUi();
}
function showEditor(values, id, focus = true) {
  editing = id;
  $('#edtitle').textContent = id ? '予定を編集' : '予定を追加';
  F.title.value = values.title; fillCatSelect(values.categoryId); F.all.checked = values.all;
  F.start.value = values.start; F.end.value = values.end; F.place.value = values.place; F.notes.value = values.notes || '';
  F.rfreq.value = ['daily', 'weekly', 'monthly', 'yearly'].includes(values.rfreq) ? values.rfreq : 'none';
  F.rend.value = ['count', 'until'].includes(values.rend) ? values.rend : 'none';
  F.rcount.value = values.rcount ?? '10';
  F.runtil.value = values.runtil || values.start.slice(0, 10);
  rsel = (values.rbyday || []).map(Number).filter((n) => n >= 0 && n <= 6);
  autoDays = values.autoDays !== false && !id;
  $('#delete').hidden = !id;
  $('#error').textContent = '';
  R.err.textContent = '';
  applyAllDayUi();
  setRepeatOpen(!!values.ropen);
  F.xadd.checked = !!values.xadd;
  xSel = values.xcal || '';
  updateRepeatUi();
  dlg.show();
  syncInert();
  if (focus) F.title.focus({ preventScroll: true });
}
// 新規通常予定だけに出す「iPhone のカレンダーにも追加」。編集中のリンク済み予定には案内を出す。
let xSel = '', xSig = '';
function updateXUi() {
  const eligible = extActive();
  const cur = editing ? resolve(editing) : null;
  const linked = !!(editing && cur && !cur.occKey && cur.p.nativeLink?.state === 'linked');
  $('#xlinked').hidden = !linked;
  $('#xadd').hidden = !(eligible && !editing);
  if ($('#xadd').hidden) return;
  const cals = writable(X.calendars), repeating = F.rfreq.value !== 'none';
  const sig = cals.map((c) => c.id).join('|');
  if (sig !== xSig) {
    xSig = sig;
    F.xcal.innerHTML = cals.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}（${esc(c.source)}）</option>`).join('');
  }
  if (F.xcal.value) xSel = F.xcal.value;
  const want = [xSel, link.defaultCalendarId].find((id) => id && cals.some((c) => c.id === id)) || cals[0]?.id || '';
  F.xcal.value = want; xSel = want;
  if (!cals.length || repeating) F.xadd.checked = false;
  F.xadd.disabled = !cals.length || repeating;
  $('#xnote').textContent = !cals.length ? '追加できるカレンダーがありません。' : repeating ? '繰り返し予定はiPhoneのカレンダーに追加できません。' : '';
  $('#xcal-l').hidden = !F.xadd.checked || F.xadd.disabled;
}
F.xadd.addEventListener('change', () => { updateXUi(); saveDraft(); });
F.xcal.addEventListener('change', () => { xSel = F.xcal.value; saveDraft(); });
$('#xlinked-open').addEventListener('click', async () => {
  const cur = editing ? resolve(editing) : null;
  if (!cur) return;
  try { const r = await call('openInCalendar', { start: cur.p.start }); if (!r?.opened) throw new Error('x'); } catch { $('#error').textContent = 'カレンダーを開けませんでした。'; }
});
function valuesFrom(cur) {
  const o = cur.occ, r = cur.p.recurrence;
  return {
    title: o.title, categoryId: o.categoryId, all: !!o.all, start: toInput(o.start, o.all), end: toInput(o.end, o.all), place: o.place || '', notes: o.notes || '',
    rfreq: r ? r.freq : 'none', rbyday: r?.byDay || [], rend: r ? (r.count != null ? 'count' : r.until ? 'until' : 'none') : 'none',
    rcount: String(r?.count ?? 10), runtil: r?.until ? r.until.replaceAll('-', '/') : '', ropen: false, autoDays: false,
  };
}
function openEditor(id, from, day = state.selected, startMin = null) {
  if (id && isXId(id)) { openExtDetail(id, from); return; }
  origins.set(dlg, from || document.activeElement);
  const cur = id ? resolve(id) : null;
  const t0 = startMin == null ? '10:00' : hhmm(startMin), t1 = startMin == null ? '11:00' : startMin + 60 > 1439 ? '23:59' : hhmm(startMin + 60);
  const values = cur
    ? valuesFrom(cur)
    : { title: '', categoryId: defaultCatId(), all: false, start: `${day.replaceAll('-', '/')} ${t0}`, end: `${day.replaceAll('-', '/')} ${t1}`, place: '', notes: '', rfreq: 'none', rbyday: [], rend: 'none', rcount: '10', runtil: '', ropen: false };
  showEditor(values, cur ? id : null);
  saveDraft();
}
function closeEditor() {
  clearDraft();
  if (confirmDlg.open) confirmDlg.close();
  if (scopeDlg.open) scopeDlg.close();
  closePanel(dlg);
}
function onFormChange() {
  if (F.rfreq.value === 'weekly' && (autoDays || !rsel.length)) { rsel = [startDow()]; autoDays = true; }
  if (F.rend.value === 'until' && !F.runtil.value.trim()) F.runtil.value = startKey().replaceAll('-', '/');
  updateRepeatUi();
  saveDraft();
}
form.addEventListener('input', onFormChange);
form.addEventListener('change', onFormChange);
R.toggle.addEventListener('click', () => { setRepeatOpen(R.panel.hidden); saveDraft(); });
R.panel.addEventListener('click', (ev) => {
  const b = ev.target.closest('.dow');
  if (!b) return;
  const n = Number(b.dataset.dow);
  rsel = rsel.includes(n) ? rsel.filter((x) => x !== n) : [...rsel, n].sort((a, c) => a - c);
  autoDays = false;
  updateRepeatUi();
  saveDraft();
});
F.all.addEventListener('change', () => {
  const all = F.all.checked;
  for (const [el, t] of [[F.start, '10:00'], [F.end, '11:00']]) {
    const v = el.value.trim();
    if (all && /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(v)) el.value = v.slice(0, 10);
    else if (!all && /^\d{4}\/\d{2}\/\d{2}$/.test(v)) el.value = `${v} ${t}`;
  }
  applyAllDayUi();
  saveDraft();
});
$('#close').addEventListener('click', closeEditor);

// 保存・削除の確定（1トランザクション）。
async function commit(plan) {
  await db.applyChanges(plan);
  const gone = new Set([...plan.dels, ...plan.puts.map((e) => e.id)]);
  state.events = [...state.events.filter((e) => !gone.has(e.id)), ...plan.puts];
  bumpRevision();
}
const SAVE_FAIL = '保存できませんでした。もう一度お試しください。';

let saving = false;
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (saving) return;
  const r = validateDraft(readForm(), [...state.categories.map((c) => c.id), CAT_IDS.none]);
  $('#error').textContent = ''; R.err.textContent = '';
  if (r.error) {
    if (r.where === 'repeat') { setRepeatOpen(true); R.err.textContent = r.error; } else $('#error').textContent = r.error;
    return;
  }
  const cur = editing ? resolve(editing) : null;
  if (cur?.occKey) { openScope('edit', cur, r.event); return; }
  const prev = cur?.p;
  const item = { ...prev, ...r.event, id: prev ? prev.id : newId(), exdates: prev?.exdates ?? [], overrides: prev?.overrides ?? {}, updatedAt: Date.now() };
  if (!item.recurrence) { item.exdates = []; item.overrides = {}; }
  // 新規の通常予定だけ: アプリDBへ pending で確定してから、iPhone 側の作成を1回だけ呼ぶ。
  const xwant = !editing && !item.recurrence && extActive() && F.xadd.checked && !F.xadd.disabled && !!F.xcal.value;
  if (xwant) item.nativeLink = { state: 'pending', requestId: newId(), calendarId: F.xcal.value };
  saving = true;
  try {
    await commit({ puts: [item], dels: [] });
  } catch {
    $('#error').textContent = SAVE_FAIL;
    saving = false;
    return;
  }
  saving = false;
  clearDraft();
  closePanel(dlg);
  set({ selected: dayOf(item.start) });
  if (xwant) createNative(item.id); else say('予定を保存しました。');
  hiddenNotice(item.categoryId);
});

// 非表示のカテゴリに保存したとき、4秒間だけ知らせて「表示する」で戻せる（予定が消えたように見えないように）。
let hnTimer = 0;
function hiddenNotice(catId) {
  const c = state.categories.find((x) => x.id === catId);
  clearTimeout(hnTimer);
  document.querySelector('#hidden-notice')?.remove();
  if (!c?.hidden) return;
  const el = document.createElement('div');
  el.id = 'hidden-notice';
  el.className = 'undobar toastbar';
  el.setAttribute('role', 'status');
  el.innerHTML = '<span>非表示のカテゴリに保存しました</span><button type="button" data-show-cat>表示する</button>';
  el.querySelector('button').addEventListener('click', async () => {
    clearTimeout(hnTimer); el.remove();
    try { await commitCats({ catPuts: [{ ...c, hidden: false, updatedAt: Date.now() }] }); say(`「${c.name}」を表示に戻しました。`); } catch { say('保存できませんでした。もう一度お試しください。'); }
  });
  document.body.append(el);
  hnTimer = setTimeout(() => el.remove(), 4000);
}

// ---------- 範囲シート（この予定のみ／これ以降すべて／すべて） ----------
let scopeCtx = null; // { kind:'edit'|'delete', cur, ev }
function openScope(kind, cur, ev) {
  scopeCtx = { kind, cur, ev };
  const del = kind === 'delete', occ = cur.occ;
  $('#sc-title').textContent = del ? '削除する範囲' : '変更する範囲';
  $('#sc-target').textContent = `対象：${dayLabel(dayOf(occ.start))} ${occ.all ? '終日' : occ.start.slice(11)} ${occ.title}`;
  const rows = scopeDlg.querySelectorAll('[data-scope]');
  rows.forEach((b) => { b.classList.toggle('danger', del); b.disabled = false; });
  const notes = [];
  if (!del) {
    const info = editInfo(cur.p, cur.occKey, ev);
    if (info.ruleChanged) {
      scopeDlg.querySelector('[data-scope="only"]').disabled = true;
      notes.push('繰り返しの変更は、これ以降またはすべてを選択してください。');
    } else notes.push('「この予定のみ」は日時・本文の個別変更です。繰り返しの設定は変わりません。');
    if (info.clears('following') || info.clears('all')) notes.push('「これ以降すべて」「すべて」を選ぶと、この範囲の個別変更と削除指定を解除します。');
  }
  $('#sc-note').textContent = notes.join(' ');
  dlg.inert = true;
  scopeDlg.show();
  syncInert();
  (scopeDlg.querySelector('[data-scope]:not(:disabled)'))?.focus({ preventScroll: true });
}
scopeDlg.addEventListener('close', () => {
  if (!confirmDlg.open && !scopeDlg.open) { dlg.inert = false; if (dlg.open) (scopeCtx?.kind === 'delete' ? $('#delete') : form.querySelector('[type=submit]')).focus({ preventScroll: true }); }
});
function cancelScope() { scopeDlg.close(); }
$('#sc-cancel').addEventListener('click', cancelScope);
scopeDlg.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-scope]');
  if (!b || b.disabled || !scopeCtx) return;
  const scope = b.dataset.scope, { kind, cur, ev: form0 } = scopeCtx;
  if (kind === 'delete') { askDelete(scope, cur); return; }
  try {
    await commit(planEdit(cur.p, cur.occKey, scope, form0, newId));
  } catch {
    scopeDlg.close();
    $('#error').textContent = SAVE_FAIL;
    return;
  }
  scopeCtx = null;
  clearDraft();
  scopeDlg.close();
  closePanel(dlg);
  set({ selected: dayOf(form0.start) });
  say('予定を保存しました。');
});

// ---------- 削除（通常は確認のみ、繰り返しは範囲→確認） ----------
let pendingDelete = null; // { scope, cur }
function askDelete(scope, cur) {
  pendingDelete = { scope, cur };
  const day = dayLabel(dayOf(cur.occ.start));
  $('#confirmtitle').textContent = { only: 'この予定を削除しますか？', following: `${day.replace(/（.）/, '')}以降の予定をすべて削除しますか？`, all: '繰り返し予定をすべて削除しますか？' }[scope];
  $('#deletetitle').textContent = cur.p.title;
  scopeDlg.close();
  dlg.inert = true;
  confirmDlg.show();
  syncInert();
  $('#canceldelete').focus({ preventScroll: true });
}
$('#delete').addEventListener('click', () => {
  const cur = editing ? resolve(editing) : null;
  if (cur?.occKey) { openScope('delete', cur); return; }
  pendingDelete = null;
  $('#confirmtitle').textContent = 'この予定を削除しますか？';
  $('#deletetitle').textContent = cur?.p.title || '';
  confirmDlg.show();
  dlg.inert = true;
  syncInert();
  $('#canceldelete').focus({ preventScroll: true });
});
confirmDlg.addEventListener('close', () => {
  if (!scopeDlg.open) { dlg.inert = false; if (dlg.open) $('#delete').focus({ preventScroll: true }); }
});
function cancelConfirm() {
  const pd = pendingDelete;
  confirmDlg.close();
  if (pd) openScope('delete', pd.cur); // 最終確認キャンセルは範囲へ戻る
}
$('#canceldelete').addEventListener('click', cancelConfirm);
$('#dodelete').addEventListener('click', async () => {
  const cur = editing ? resolve(editing) : null;
  try {
    if (pendingDelete) await commit(planDelete(pendingDelete.cur.p, pendingDelete.cur.occKey, pendingDelete.scope));
    else await commit({ puts: [], dels: [editing] });
  } catch { confirmDlg.close(); $('#error').textContent = '削除できませんでした。'; return; }
  void cur;
  pendingDelete = null;
  confirmDlg.close();
  closeEditor();
  render();
  say('予定を削除しました。');
});

// ---------- その他メニュー ----------
function openMenu(from) {
  $('#m-desk').hidden = L.w < 600 || L.h < 600;
  $('#m-link').hidden = !(NATIVE && X.avail);
  $('#m-desk').textContent = state.desk ? '卓上表示をやめる' : '卓上表示';
  $('#m-week').textContent = `週の始まり: ${state.weekStart === 1 ? '月曜（日曜にする）' : '日曜（月曜にする）'}`;
  $('#m-sample').hidden = !(state.loaded && state.events.length === 0);
  syncMonthMenu();
  syncModeMenu();
  $('#m-tlz').hidden = !root.querySelector('.tl');
  const cats = state.categories.filter((c) => !c.hidden);
  $('#m-legend').hidden = !cats.length;
  $('#m-legend').innerHTML = cats.length ? `<div class="eyebrow">カテゴリの色</div>${legend()}${xlegend()}` : '';
  updateDiagnostics();
  openPanel(menuDlg, from);
  placeMenu(from);
  menuDlg.querySelector('button:not([hidden])').focus({ preventScroll: true });
}
// メニューは起点の直下8pxに置き、安全矩形（可視範囲）の内側にクランプ。収まらなければ起点の上へ。
function placeMenu(from) {
  const S = safe(), w = Math.min(240, L.w - 24), r = from?.getBoundingClientRect?.();
  let maxL = L.w - S.right - 12 - w;
  if (layoutKind() === 'spread') maxL = Math.min(maxL, L.w / 2 - 10 - w); // 見開きのメニューは左ページ（折り目の保護域の外）に収める
  const left = Math.max(S.left + (layoutKind() === 'spread' ? 8 : 12), Math.min(r ? r.right - w : maxL, maxL));
  const vy = parseFloat(de.style.getPropertyValue('--vy')) || 0, vb = parseFloat(de.style.getPropertyValue('--vb')) || 0;
  const topMin = Math.max(vy, S.top) + 12, botMax = window.innerHeight - Math.max(vb, S.bottom) - 12;
  const mh = Math.min(menuDlg.scrollHeight, botMax - topMin);
  let top = r ? r.bottom + 8 : topMin;
  if (top + mh > botMax) top = Math.max(topMin, r && r.top - 8 - mh >= topMin ? r.top - 8 - mh : botMax - mh);
  Object.assign(menuDlg.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto', width: `${w}px`, maxHeight: `${Math.max(88, botMax - top)}px` });
}
// 月の時刻は現在の姿勢用（閉じた／それ以外）。文字の大きさは全姿勢共通。
const timeKey = () => (['home', 'browse'].includes(layoutKind()) ? 'monthTimeClosed' : 'monthTimeOpen');
function syncMonthMenu() {
  const t = $('#m-mtime'), z = $('#m-msize');
  t.setAttribute('aria-pressed', String(state[timeKey()]));
  z.setAttribute('aria-pressed', String(state.monthTextSize === 'large'));
  z.textContent = `月の文字: ${state.monthTextSize === 'large' ? '大（標準にする）' : '標準（大にする）'}`;
}
// 月の表現（手帳｜予定名｜全部）。月表示のときだけ。1回選ぶと閉じる。
function syncModeMenu() {
  const on = state.view === 'month' && !listShown();
  $('#m-mode').hidden = !on;
  $('#m-mode').setAttribute('aria-expanded', 'false');
  $('#m-variant').hidden = true;
  $('#m-variant').innerHTML = on ? variantBtns(isPortrait() ? 'portrait' : layoutKind()) : '';
}
menuDlg.addEventListener('click', (ev) => {
  const mb = ev.target.closest('[data-mode]');
  if (mb) { closePanel(menuDlg); const m = mb.dataset.mode; set(m === 'all' ? { monthExpand: true } : { style: m, monthExpand: false }); return; }
  const b = ev.target.closest('[data-m]');
  if (!b) return;
  const m = b.dataset.m, from = origins.get(menuDlg);
  if (m === 'cats') { closePanel(menuDlg, false); openCategories(from); }
  else if (m === 'backup') { closePanel(menuDlg, false); openBackup(from); }
  else if (m === 'link') { closePanel(menuDlg, false); openLink(from); }
  else if (m === 'desk') { closePanel(menuDlg); set({ desk: !state.desk }); }
  else if (m === 'week') { closePanel(menuDlg); set({ weekStart: state.weekStart === 1 ? 0 : 1 }); say(`週の始まりを${state.weekStart === 1 ? '月曜' : '日曜'}にしました。`); }
  else if (m === 'sample') { closePanel(menuDlg); loadSample(); }
  else if (m === 'mode') { const v = $('#m-variant'); v.hidden = !v.hidden; b.setAttribute('aria-expanded', String(!v.hidden)); if (!v.hidden) v.querySelector('button')?.focus({ preventScroll: true }); }
  else if (m === 'mtime') { set({ [timeKey()]: !state[timeKey()] }); syncMonthMenu(); say(`月表示の時刻を${state[timeKey()] ? '出します' : '出しません'}。`); }
  else if (m === 'msize') { set({ monthTextSize: state.monthTextSize === 'large' ? 'normal' : 'large' }); syncMonthMenu(); say(`月の文字を${state.monthTextSize === 'large' ? '大' : '標準'}にしました。`); }
  else if (m === 'tlin' || m === 'tlout') { setHh(TL.hh * (m === 'tlin' ? 1.25 : 0.8)); say(`時間軸を${m === 'tlin' ? '拡大' : '縮小'}しました（1時間 ${Math.round(TL.hh)}px）。`); }
  else closePanel(menuDlg);
});
document.addEventListener('click', (ev) => {
  if (menuDlg.open && !menuDlg.contains(ev.target) && !ev.target.closest('[data-act="menu"]')) closePanel(menuDlg);
});

// ---------- カテゴリ編集（設定メニューから。追加・名前と色・並べ替え・非表示・削除） ----------
const CT = { body: $('#cat-body'), close: $('#cat-close'), title: $('#cat-title') };
// stage: 'list' | 'edit'。edit の id が null なら新規。confirmDel は削除の確認中。undo は削除直後の「元に戻す」（5秒）。
let cs = { stage: 'list', id: null, name: '', color: '', err: '', confirmDel: false, target: '', undo: null, timer: 0, fromEditor: false, created: null, busy: false, msg: '' };
function openCategories(from, fromEditor = false) {
  cs = { stage: 'list', id: null, name: '', color: '', err: '', confirmDel: false, target: '', undo: null, timer: 0, fromEditor, created: null, busy: false, msg: '' };
  renderCats();
  if (dlg.open) dlg.inert = true;
  openPanel(catsDlg, from);
  CT.body.querySelector('button')?.focus({ preventScroll: true });
}
async function commitCats({ catPuts = [], catDels = [], eventPuts = [] }) {
  await db.applyCategoryChanges({ catPuts, catDels, eventPuts });
  const dels = new Set(catDels), puts = new Map(catPuts.map((c) => [c.id, c]));
  setCategories([...state.categories.filter((c) => !dels.has(c.id) && !puts.has(c.id)), ...catPuts]);
  if (eventPuts.length) { const m = new Map(eventPuts.map((e) => [e.id, e])); state.events = state.events.map((e) => m.get(e.id) || e); }
  bumpRevision();
  render();
}
const catColorName = (c) => paletteName(c) || '色';
function previewHtml(name, color) {
  const n = esc(name.trim() || 'カテゴリ名');
  return `<div class="catpre" style="${colorVars(color)}"><span class="chip">${n}</span><span class="bar-like">${n}</span></div>`;
}
function renderCats() {
  const list = state.categories, counts = countByCategory(state.events), dis = cs.busy ? ' disabled' : '';
  if (cs.stage === 'list') {
    CT.title.textContent = 'カテゴリ';
    CT.close.textContent = '閉じる';
    const nh = list.filter((c) => c.hidden).length;
    const rows = list.map((c, i) => `<li class="catrow${c.hidden ? ' off' : ''}"><button type="button" class="catmain" data-cat-edit="${esc(c.id)}" aria-label="${esc(c.name)}を編集"${dis}><i class="cdot big" style="background:${c.color}" aria-hidden="true"></i><span class="cname">${esc(c.name)}</span><span class="small ccount">${counts.get(c.id) || 0}件</span></button>
      <button type="button" role="switch" class="sw mini" data-cat-vis="${esc(c.id)}" aria-checked="${!c.hidden}" aria-label="${esc(c.name)}を表示"${dis}><span class="knob" aria-hidden="true"></span><span class="swt">表示</span></button>
      <span class="mv"><button type="button" data-cat-up="${esc(c.id)}" aria-label="${esc(c.name)}を上へ"${i === 0 || cs.busy ? ' disabled' : ''}>↑</button><button type="button" data-cat-down="${esc(c.id)}" aria-label="${esc(c.name)}を下へ"${i === list.length - 1 || cs.busy ? ' disabled' : ''}>↓</button></span></li>`).join('');
    const full = list.length >= CAT_LIMITS.max;
    CT.body.innerHTML = `${nh ? `<p class="small" id="cat-hidden">${nh}件のカテゴリを非表示中</p>` : ''}<ul class="catlist" aria-label="カテゴリ一覧">${rows}</ul>
      <button type="button" class="row catadd" data-cat-add${full || cs.busy ? ' disabled' : ''}>＋ カテゴリを追加</button>${full ? `<p class="small">カテゴリは最大${CAT_LIMITS.max}個まで作れます。</p>` : ''}
      ${cs.err ? `<p class="berr" role="alert">${esc(cs.err)}</p>` : ''}
      ${cs.undo ? `<div class="undobar" role="status"><span>「${esc(cs.undo.cat.name)}」を削除しました。</span><button type="button" data-cat-undo>元に戻す</button></div>` : ''}`;
    return;
  }
  const cur = cs.id ? list.find((c) => c.id === cs.id) : null;
  CT.title.textContent = cur ? 'カテゴリを編集' : 'カテゴリを追加';
  CT.close.textContent = '完了';
  const pal = PALETTE.map((p) => `<button type="button" class="swatch" data-color="${p.light}" style="background:${p.light}" aria-label="${p.name}" aria-pressed="${p.light === cs.color.toLowerCase()}"></button>`).join('');
  let del = '';
  if (cur) {
    if (list.length <= 1) del = '<button type="button" class="row danger" disabled data-cat-del>カテゴリを削除</button><p class="small">カテゴリは1つ以上必要です</p>';
    else if (!cs.confirmDel) del = '<button type="button" class="row danger" data-cat-del>カテゴリを削除</button>';
    else {
      const others = list.filter((c) => c.id !== cur.id), n = state.events.filter((e) => e.categoryId === cur.id || Object.values(e.overrides || {}).some((o) => o?.categoryId === cur.id)).length;
      const target = others.some((c) => c.id === cs.target) ? cs.target : others[0].id;
      cs.target = target;
      del = `<section class="card delbox"><h3>「${esc(cur.name)}」を削除しますか？</h3>${n ? `<label>${n}件の予定を移すカテゴリ<select id="cat-target">${others.map((c) => `<option value="${esc(c.id)}"${c.id === target ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : '<p>このカテゴリの予定はありません。</p>'}
        <div class="pair2"><button type="button" data-cat-delcancel>キャンセル</button><button type="button" class="dangerfill" data-cat-delgo>削除する</button></div></section>`;
    }
  }
  CT.body.innerHTML = `<section class="card"><label>名前<input id="cat-name" maxlength="${CAT_LIMITS.name}" value="${esc(cs.name)}" placeholder="例：仕事" autocomplete="off"></label>
    <span id="cat-color-l" class="lbl">色</span><div class="palette" role="group" aria-labelledby="cat-color-l">${pal}</div>
    <span class="lbl">見本</span>${previewHtml(cs.name, cs.color)}
    <p class="berr" role="alert" id="cat-err">${esc(cs.err)}</p></section>
    <button type="button" class="row cancel" data-cat-cancel${dis}>キャンセル</button>${del}`;
}
async function catSave() {
  if (cs.busy) return;
  const list = state.categories, now = Date.now(), name = cs.name.trim();
  const base = cs.id ? list.find((c) => c.id === cs.id) : newCategory(list, { id: newId(), name, color: cs.color }, now);
  const v = validateCategory({ ...base, name, color: cs.color || base.color, updatedAt: now }, now);
  if (!v.ok) { cs.err = v.error; renderCats(); CT.body.querySelector('#cat-name')?.focus({ preventScroll: true }); return; }
  if (nameTaken(list, v.value.name, v.value.id)) { cs.err = 'ほかのカテゴリと同じ名前は使えません。'; renderCats(); CT.body.querySelector('#cat-name')?.focus({ preventScroll: true }); return; }
  if (!cs.id && list.length >= CAT_LIMITS.max) { cs.err = `カテゴリは最大${CAT_LIMITS.max}個までです。`; renderCats(); return; }
  cs.busy = true;
  try { await commitCats({ catPuts: [v.value] }); } catch { cs.busy = false; cs.err = '保存できませんでした。もう一度お試しください。'; renderCats(); return; }
  cs.busy = false;
  if (!cs.id) cs.created = v.value.id;
  Object.assign(cs, { stage: 'list', id: null, err: '', confirmDel: false });
  renderCats();
  CT.body.querySelector(`[data-cat-edit="${CSS.escape(v.value.id)}"]`)?.focus({ preventScroll: true });
  say(`カテゴリ「${v.value.name}」を保存しました。`);
}
async function catDelete() {
  const cur = state.categories.find((c) => c.id === cs.id);
  if (!cur || cs.busy) return;
  const plan = planDeleteCategory(state.categories, state.events, cur.id, cs.target);
  if (!plan.ok) { cs.err = plan.error; renderCats(); return; }
  const originals = state.events.filter((e) => plan.eventPuts.some((p) => p.id === e.id));
  cs.busy = true;
  try { await commitCats({ catDels: plan.catDels, eventPuts: plan.eventPuts }); } catch { cs.busy = false; cs.err = '削除できませんでした。もう一度お試しください。'; renderCats(); return; }
  cs.busy = false;
  clearTimeout(cs.timer);
  const timer = setTimeout(() => { if (cs.undo?.cat.id === cur.id) { cs.undo = null; if (cs.stage === 'list' && catsDlg.open) renderCats(); } }, 5000);
  Object.assign(cs, { stage: 'list', id: null, err: '', confirmDel: false, undo: { cat: cur, originals }, timer });
  renderCats();
  say(`カテゴリ「${cur.name}」を削除しました。`);
}
async function catUndo() {
  const u = cs.undo;
  if (!u || cs.busy) return;
  clearTimeout(cs.timer);
  cs.undo = null; cs.busy = true;
  try { await commitCats({ catPuts: [u.cat], eventPuts: u.originals }); cs.err = ''; say(`カテゴリ「${u.cat.name}」を元に戻しました。`); } catch { cs.err = '元に戻せませんでした。'; }
  cs.busy = false;
  renderCats();
}
async function catMutate(fn) {
  if (cs.busy) return;
  cs.busy = true; cs.err = '';
  try { await commitCats(fn()); } catch { cs.err = '保存できませんでした。もう一度お試しください。'; }
  cs.busy = false;
  renderCats();
}
function catsBack() {
  if (cs.stage === 'edit') {
    Object.assign(cs, { stage: 'list', id: null, err: '', confirmDel: false });
    renderCats();
    CT.body.querySelector('[data-cat-add]')?.focus({ preventScroll: true });
  } else closePanel(catsDlg);
}
CT.close.addEventListener('click', () => { if (cs.stage === 'edit') catSave(); else if (!cs.busy) closePanel(catsDlg); });
CT.body.addEventListener('input', (ev) => { if (ev.target.id === 'cat-name') { cs.name = ev.target.value; const pre = CT.body.querySelector('.catpre'); if (pre) pre.outerHTML = previewHtml(cs.name, cs.color); } });
CT.body.addEventListener('change', (ev) => { if (ev.target.id === 'cat-target') cs.target = ev.target.value; });
CT.body.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'cat-name') { ev.preventDefault(); catSave(); } });
CT.body.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.catEdit !== undefined) {
    const c = state.categories.find((x) => x.id === d.catEdit);
    if (c) { Object.assign(cs, { stage: 'edit', id: c.id, name: c.name, color: c.color, err: '', confirmDel: false }); renderCats(); CT.body.querySelector('#cat-name')?.focus({ preventScroll: true }); }
  } else if (d.catAdd !== undefined) {
    Object.assign(cs, { stage: 'edit', id: null, name: '', color: newCategory(state.categories, { id: '', name: '' }).color, err: '', confirmDel: false });
    renderCats();
    CT.body.querySelector('#cat-name')?.focus({ preventScroll: true });
  } else if (d.catVis !== undefined) {
    const c = state.categories.find((x) => x.id === d.catVis);
    if (c) catMutate(() => ({ catPuts: [{ ...c, hidden: !c.hidden, updatedAt: Date.now() }] })).then(() => CT.body.querySelector(`[data-cat-vis="${CSS.escape(c.id)}"]`)?.focus({ preventScroll: true }));
  } else if (d.catUp !== undefined || d.catDown !== undefined) {
    const id = d.catUp ?? d.catDown, dir = d.catUp !== undefined ? -1 : 1;
    catMutate(() => ({ catPuts: moveCategory(state.categories, id, dir).changed })).then(() => (CT.body.querySelector(`[data-cat-${dir < 0 ? 'up' : 'down'}="${CSS.escape(id)}"]:not(:disabled)`) || CT.body.querySelector(`[data-cat-${dir < 0 ? 'down' : 'up'}="${CSS.escape(id)}"]`))?.focus({ preventScroll: true }));
  } else if (d.color) { cs.color = d.color; renderCats(); CT.body.querySelector(`[data-color="${d.color}"]`)?.focus({ preventScroll: true }); }
  else if (d.catCancel !== undefined) catsBack();
  else if (d.catDel !== undefined) { cs.confirmDel = true; cs.err = ''; renderCats(); CT.body.querySelector('[data-cat-delgo], #cat-target')?.focus({ preventScroll: true }); }
  else if (d.catDelcancel !== undefined) { cs.confirmDel = false; renderCats(); CT.body.querySelector('[data-cat-del]')?.focus({ preventScroll: true }); }
  else if (d.catDelgo !== undefined) catDelete();
  else if (d.catUndo !== undefined) catUndo();
});

// ---------- 検索 ----------
const SR = { q: $('#sr-q'), clear: $('#sr-clear'), range: $('#sr-range'), xrange: $('#sr-xrange'), body: $('#sr-body') };
let srSeq = 0, srTimer = 0, srToday = todayKey(), srItems = [], srSnap = null;
const ymd = (k) => k.replaceAll('-', '/');
function openSearch(from) {
  srToday = todayKey();
  // 検索開始時点の成功キャッシュと範囲を固定する（検索のために3年分を取りに行かない）。
  srSnap = extActive() ? { events: [...visExt()], range: X.cache?.range || null } : null;
  SR.q.value = '';
  renderSearch(true);
  openPanel(searchDlg, from);
  SR.q.focus({ preventScroll: true });
}
function hitHtml(e, ts) {
  const multi = isMulti(e);
  const time = e.all ? '終日' : multi ? `${e.start.slice(5, 10).replace('-', '/')} ${e.start.slice(11)} 〜 ${e.end.slice(5, 10).replace('-', '/')} ${e.end.slice(11)}` : `${e.start.slice(11)}–${e.end.slice(11)}`;
  const hl = (s) => highlight(s, ts, esc);
  const inTP = ts.every((t) => highlight(`${e.title}\n${e.place}`, [t], esc).includes('<mark>'));
  const ex = !inTP && e.notes ? excerpt(e.notes, ts) : '';
  return `<button type="button" class="hit ${catCls(e)}"${catSty(e)} data-hit="${esc(e.id)}"${repLabel(e, `${dayLabel(dayOf(e.start))} ${time} ${e.title}`)}><span class="hmeta">${esc(time)} · ${esc(tagText(e))}</span><strong>${xi(e)}${rep(e)}${hl(e.title)}</strong>${e.place ? `<span class="hplace">${hl(e.place)}</span>` : ''}${ex ? `<span class="hnote">${hl(ex)}</span>` : ''}</button>`;
}
function renderSearch(initial = false) {
  const res = searchEvents(state.events, SR.q.value, srToday, srSnap ? searchExt(srSnap.events, SR.q.value, srToday) : []);
  SR.clear.hidden = !SR.q.value;
  SR.range.textContent = `検索範囲：${ymd(res.range.from)}–${ymd(res.range.to)}・最大${LIMIT}件`;
  SR.xrange.hidden = !srSnap;
  if (srSnap) SR.xrange.textContent = srSnap.range ? `iPhoneの検索範囲：${ymdSlash(srSnap.range.from)}–${ymdSlash(lastDay(srSnap.range.to))}（読み込み済み）` : 'iPhoneの予定はまだ読み込まれていません。';
  srItems = res.items;
  const yr = Number(srToday.slice(0, 4));
  if (!res.ts.length) { SR.body.innerHTML = '<p class="smsg">探したい予定の言葉を入力してください。予定名・メモ・場所から探せます。</p>'; if (!initial) say('検索語を消しました。'); return; }
  if (!res.total) { SR.body.innerHTML = '<p class="smsg">該当する予定はありません。検索語や検索範囲を確認してください。</p>'; say('該当する予定はありません。'); return; }
  const groups = groupByDay(res.items).map((g) => {
    const label = Number(g.key.slice(0, 4)) === yr ? dayLabel(g.key) : `${g.key.slice(0, 4)}年${dayLabel(g.key)}`;
    return `<section class="hgroup"><h3>${label}</h3>${g.items.map((e) => hitHtml(e, res.ts)).join('')}</section>`;
  }).join('');
  SR.body.innerHTML = `<p class="small hcount">${res.total}件の予定</p>${res.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${groups}`;
  say(`${res.total}件の予定が見つかりました。`);
}
SR.q.addEventListener('input', () => {
  clearTimeout(srTimer);
  const seq = ++srSeq;
  SR.clear.hidden = !SR.q.value;
  if (!SR.q.value.trim()) { renderSearch(); return; }
  SR.body.innerHTML = '<p class="smsg" role="status">検索しています…</p>';
  srTimer = setTimeout(() => { if (seq === srSeq) renderSearch(); }, 250); // 古い応答は破棄
});
SR.clear.addEventListener('click', () => { clearTimeout(srTimer); srSeq++; SR.q.value = ''; renderSearch(); SR.q.focus({ preventScroll: true }); });
$('#sr-close').addEventListener('click', () => closePanel(searchDlg));
SR.body.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-hit]');
  if (!b) return;
  const e = srItems.find((x) => String(x.id) === b.dataset.hit);
  if (!e) return;
  const k = dayOf(e.start);
  closePanel(searchDlg, false);
  set({ selected: k, view: 'day', home: false });
  [...root.querySelectorAll('[data-event]')].find((el) => el.dataset.event === String(e.id))?.focus({ preventScroll: true });
  say(`${dayLabel(k)}へ移動しました。`);
});

// ---------- バックアップ ----------
const BK = { body: $('#bk-body'), file: $('#bk-file') };
let bk = { stage: 'main', busy: false, msg: '', err: '' };
const fmtStamp = (iso) => {
  const d = new Date(iso), l = localIso(d);
  return `${l.slice(0, 10).replaceAll('-', '/')} ${l.slice(11, 16)}（UTC${l.slice(19)}）`;
};
function openBackup(from) {
  bk = { stage: 'main', busy: false, msg: '', err: '' };
  renderBackup();
  openPanel(backupDlg, from);
  BK.body.querySelector('button')?.focus({ preventScroll: true });
}
function renderBackup() {
  const dis = bk.busy ? ' disabled' : '';
  const st = countStats(state.events);
  if (bk.stage === 'main') {
    BK.body.innerHTML = `<section class="card"><h3>書き出し</h3><p>予定${st.total}件・うち繰り返し${st.recurring}件／設定も含めて保存</p><button type="button" class="solid" id="bk-export"${dis}>JSONを書き出す</button><p class="small">iPhoneでは共有シートの『ファイルに保存』で残せます。</p>${bk.msg ? `<p class="bmsg">${esc(bk.msg)}</p>` : ''}</section>
      <section class="card"><h3>読み込み</h3><p>書き出したJSONファイルから予定を戻します。</p><button type="button" id="bk-pick"${dis}>JSONファイルを選ぶ</button>${bk.busy ? '<p class="small" role="status">ファイルを検証しています…</p>' : ''}${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}</section>`;
  } else if (bk.stage === 'invalid') {
    BK.body.innerHTML = `<section class="card"><h3>読み込めませんでした</h3><p class="berr" role="alert">このファイルは読み込めません。DuoのバックアップJSONを選んでください。</p><p class="small">ファイル：${esc(bk.name)}</p><p class="small">理由：${esc(bk.reason)}</p><p class="small">今の予定は変更していません。</p><button type="button" id="bk-pick">ファイルを選び直す</button><button type="button" id="bk-back" class="row cancel">戻る</button></section>`;
  } else if (bk.stage === 'confirm') {
    const f = countStats(bk.data.events), p = bk.plan;
    BK.body.innerHTML = `<section class="card"><h3>この内容を読み込みますか？</h3>
      <dl class="facts"><dt>ファイル</dt><dd>${esc(bk.name)}</dd><dt>書き出し日時</dt><dd>${esc(fmtStamp(bk.data.exportedAt))}</dd>
      <dt>ファイルの予定</dt><dd>${f.total}件（繰り返し${f.recurring}件・個別変更／削除指定${f.exceptions}件）</dd>
      <dt>現在の予定</dt><dd>${st.total}件</dd><dt>追加見込み</dt><dd>${p.add.length}件（重複${p.dup}件・競合${p.conflict}件）</dd></dl>
      ${p.conflict ? `<p class="small">競合${p.conflict}件は現在の予定を残します</p>` : ''}${catLine()}</section>
      <button type="button" class="row" id="bk-add"${dis}>追加（同じ予定は重複させない）<small>今の予定と設定を残します</small></button>
      <button type="button" class="row" id="bk-replace"${dis}>置き換え<small>今の予定はすべて消えて、このファイルの内容になります。設定も置き換わります</small></button>
      <button type="button" class="row cancel" id="bk-cancel"${dis}>キャンセル</button>${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}`;
  } else {
    BK.body.innerHTML = `<section class="card"><h3>今の予定${st.total}件を削除して、${bk.data.events.length}件に置き換えますか？</h3><p>元に戻せません。必要なら先に書き出してください。</p>${NATIVE ? '<p class="small">iPhoneの予定と連携設定は変更しません。復元後、以前iPhoneにも追加した予定が重複して表示されることがあります。</p>' : ''}
      <div class="pair2"><button type="button" id="bk-rcancel"${dis}>キャンセル</button><button type="button" class="dangerfill" id="bk-rdo"${dis}>すべて置き換える</button></div>${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}</section>`;
  }
}
function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
// 確認画面のカテゴリ行: 追加 n／同じ id で名前・色が違う n／未分類へ n 件。
function catLine() {
  // 件数は適用時（finishImport の追加）と同じ計算で出す。
  const m = mergeCategories(state.categories, bk.data.categories.map((c) => ({ ...c })), 'add');
  // 読み込み後に「未分類」を指す予定（検証で知らない参照を未分類にしたものと、適用時に付け替えるものの両方）。
  const fb = fixEventCategories(bk.plan.add, m.categories).events.filter((e) => e.categoryId === CAT_IDS.none || Object.values(e.overrides || {}).some((o) => o?.categoryId === CAT_IDS.none)).length;
  if (!m.added && !m.conflicts && !fb && !m.dropped) return '';
  return `<p class="small">カテゴリ：追加${m.added}件${m.conflicts ? `／同じidで名前・色が違う${m.conflicts}件（ファイルの名前・色に上書きします）` : ''}${m.renamed ? `／同じ名前に番号を付ける${m.renamed}件` : ''}${m.dropped ? `／上限${CAT_LIMITS.max}個を超える${m.dropped}件は追加しません` : ''}／未分類へ${fb}件</p>`;
}
async function doExport() {
  bk.err = ''; bk.msg = '';
  try {
    const text = JSON.stringify(buildBackup(state.events, { ...state, notify: loadNotify() }, new Date(), state.categories), null, 2);
    const file = new File([text], backupName(), { type: 'application/json' });
    if (NATIVE) {
      // ネイティブは共有シート（shareFile）を優先。失敗したときだけ従来の共有／ダウンロードへ。
      try {
        const b = document.querySelector('#bk-export')?.getBoundingClientRect();
        const r = await call('shareFile', { name: file.name, text, mime: 'application/json', ...(b ? { anchor: { x: b.left, y: b.top, width: b.width, height: b.height } } : {}) });
        if (r?.completed) { bk.msg = '書き出しファイルを共有しました。'; say(bk.msg); }
        renderBackup();
        return;
      } catch { /* 従来の方法へ */ }
    }
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); shared = true; bk.msg = '書き出しファイルを共有しました。'; } catch (e) { if (e?.name === 'AbortError') { renderBackup(); return; } }
    }
    if (!shared) { download(file); bk.msg = '書き出しファイルを作成しました。'; }
    say(bk.msg);
  } catch { bk.err = '書き出せませんでした。もう一度お試しください。'; say(bk.err); }
  renderBackup();
}
async function onPicked(file) {
  bk = { stage: 'main', busy: true, msg: '', err: '' };
  renderBackup();
  let res;
  try {
    if (file.size > MAX_BYTES) res = { ok: false, reason: 'ファイルが大きすぎます（上限10MiB）' };
    else res = validateBackup(await file.text(), { categories: state.categories });
  } catch { res = { ok: false, reason: 'ファイルを読み取れません' }; }
  if (!res.ok) bk = { stage: 'invalid', busy: false, name: file.name, reason: res.reason };
  else bk = { stage: 'confirm', busy: false, name: file.name, data: res.data, report: res.report, plan: planAppend(state.events, res.data.events), err: '' };
  renderBackup();
  BK.body.querySelector('button')?.focus({ preventScroll: true });
}
BK.file.addEventListener('change', () => {
  const f = BK.file.files[0];
  BK.file.value = '';
  if (f) onPicked(f);
});
async function finishImport(kind) {
  if (bk.busy) return;
  const { data, plan } = bk, name = bk.name;
  bk = { ...bk, busy: true, err: '' };
  renderBackup();
  try {
    // カテゴリと予定を1トランザクションで。参照先のカテゴリが無い予定は未分類に付け替える。
    const now = Date.now(), cin = data.categories.map((c) => ({ ...c, createdAt: c.createdAt || now, updatedAt: c.updatedAt || now }));
    if (kind === 'add') {
      const fx = fixEventCategories(plan.add, mergeCategories(state.categories, cin, 'add').categories, now);
      const cur = new Map(state.categories.map((c) => [c.id, c]));
      const same = (c) => cur.get(c.id)?.name === c.name && cur.get(c.id)?.color === c.color;
      await db.applyImport({ catPuts: fx.categories.filter((c) => !cur.has(c.id) || !same(c)), eventPuts: fx.events });
    } else {
      let cats = data.hasCategories ? mergeCategories([], cin, 'replace').categories : mergeCategories(state.categories, cin, 'add').categories;
      if (!cats.length) cats = state.categories;
      const fx = fixEventCategories(data.events, cats, now);
      await db.applyImport({ catPuts: fx.categories, eventPuts: fx.events, replace: true });
    }
  } catch {
    try { state.events = await db.listEvents(); } catch { /* 無視 */ }
    bumpRevision();
    bk = { stage: kind === 'add' ? 'confirm' : 'replace', busy: false, name, data, plan, err: '読み込みに失敗しました。現在の予定は変更していません。' };
    renderBackup();
    return;
  }
  state.events = await db.listEvents();
  bumpRevision();
  try { setCategories(await db.listCategories()); } catch { /* 直前の一覧で続ける */ }
  let msg;
  if (kind === 'add') msg = `${plan.add.length}件を追加しました（重複${plan.skipped}件を除外）。`;
  else {
    msg = `${data.events.length}件の予定${data.settings ? 'と設定' : ''}に置き換えました。`;
    if (data.settings) { const { notify, ...ui } = data.settings; Object.assign(state, ui); setFirstDay(state.weekStart); if (notify) saveNotify(notify); }
  }
  closePanel(backupDlg);
  set({});
  say(msg);
}
function backBackup() {
  if (bk.busy) return;
  if (bk.stage === 'replace') { bk = { ...bk, stage: 'confirm', err: '' }; renderBackup(); }
  else if (bk.stage === 'confirm' || bk.stage === 'invalid') { bk = { stage: 'main', busy: false, msg: '', err: '' }; renderBackup(); }
  else closePanel(backupDlg);
}
BK.body.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  if (b.id === 'bk-export') doExport();
  else if (b.id === 'bk-pick') BK.file.click();
  else if (b.id === 'bk-add') finishImport('add');
  else if (b.id === 'bk-replace') { bk = { ...bk, stage: 'replace', err: '' }; renderBackup(); BK.body.querySelector('#bk-rcancel')?.focus({ preventScroll: true }); }
  else if (b.id === 'bk-rdo') finishImport('replace');
  else if (b.id === 'bk-rcancel' || b.id === 'bk-cancel' || b.id === 'bk-back') backBackup();
});
$('#bk-close').addEventListener('click', () => { if (!bk.busy) closePanel(backupDlg); });

// ---------- iPhone カレンダー連携（読み取り専用の混在表示・追加・設定） ----------
const isXId = (id) => String(id).startsWith('ip:') && visExt().some((x) => x.id === id);
const idsKey = (ids) => [...ids].sort().join(',');
const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#68716a');
const extNeed = () => extRange(listShown() && layoutKind() === 'home' ? todayKey() : state.selected);
let lk = { busy: false, err: '', want: false };
let firstCheck = true, extTimer = 0, xBusy = false;
const LK = { body: $('#lk-body') };

async function checkPerm() {
  try {
    const r = await call('checkPermission');
    X.perm = r?.status || 'denied';
    firstCheck = false;
    return X.perm;
  } catch {
    if (firstCheck) X.avail = false; // プラグインが使えない: 入口を隠す
    firstCheck = false;
    return null;
  }
}
async function refreshCalendars() {
  const r = await call('listCalendars');
  const cals = (Array.isArray(r?.calendars) ? r.calendars : []).map((c) => ({ ...c, color: safeColor(c.color) }));
  X.calendars = cals;
  const known = new Set(cals.map((c) => c.id));
  const patch = { calendarIds: link.calendarIds.filter((id) => known.has(id)) };
  if (!link.selectionInitialized) { patch.calendarIds = cals.map((c) => c.id); patch.selectionInitialized = true; } // 初回は全選択
  if (link.defaultCalendarId && !cals.some((c) => c.id === link.defaultCalendarId && c.allowsModify)) patch.defaultCalendarId = null;
  setLink(patch);
}
// 必要な範囲が取得済みでなければ取得する（同じ範囲の連続要求は統合、失敗した範囲は自動では再試行しない）。
function syncExt() {
  if (!extActive()) return;
  const need = extNeed(), c = X.cache;
  if (c && c.ids === idsKey(link.calendarIds) && covers(c.range, need)) return;
  if (X.failKey === rangeKey(need, link.calendarIds)) return;
  loadExt();
}
function loadExt(force = false) {
  if (!extActive()) return Promise.resolve();
  const key0 = rangeKey(extNeed(), link.calendarIds);
  if (X.inflight && X.inflightKey === key0 && !force) return X.inflight;
  const gen = ++X.gen;
  X.status = 'loading'; X.inflightKey = key0;
  const p = (async () => {
    try {
      if (!X.calendars.length) await refreshCalendars();
      const need = extNeed(), cmap = new Map(X.calendars.map((c) => [c.id, c]));
      const ids = link.calendarIds.filter((id) => cmap.has(id));
      let events = [];
      if (ids.length) {
        const r = await call('listEvents', { from: stampOf(need.from), to: stampOf(need.to), calendarIds: ids });
        events = (Array.isArray(r?.events) ? r.events : []).map((raw) => toDisplay(raw, cmap.get(raw.calendarId)));
      }
      if (gen !== X.gen) return; // 古い応答は捨てる
      X.cache = { range: need, ids: idsKey(link.calendarIds), events, loadedAt: new Date(), tz: new Date().getTimezoneOffset() };
      X.status = 'ok'; X.failKey = '';
    } catch (e) {
      if (gen !== X.gen) return;
      X.status = 'error'; X.failKey = key0;
      if (['PERMISSION_DENIED', 'RESTRICTED'].includes(errCode(e))) dropLink('カレンダーへのアクセスを確認してください。');
    } finally {
      if (gen === X.gen) { X.inflight = null; X.inflightKey = ''; afterExt(); }
    }
  })();
  X.inflight = p;
  return p;
}
function afterExt() {
  render();
  if (linkDlg.open) renderLink();
  if (xdDlg.open && xdCur && !visExt().some((x) => x.id === xdCur.id)) $('#xd-err').textContent = 'この予定は見つかりません。カレンダーで確認してください。';
  if (dlg.open) updateXUi();
}
function dropLink(msg) {
  setLink({ enabled: false });
  X.gen++; X.cache = null; X.status = 'idle'; X.inflight = null; X.inflightKey = ''; X.failKey = '';
  lk.err = msg; lk.want = false;
  say(msg);
  render();
  if (linkDlg.open) renderLink();
}
async function resumeExt() {
  if (!NATIVE || !X.avail) return;
  const p = await checkPerm();
  if (!link.enabled) { if (linkDlg.open) renderLink(); return; }
  if (p !== 'granted') { if (p) dropLink('カレンダーへのアクセスを確認してください。'); return; }
  try { await refreshCalendars(); } catch { /* 取得できなくても直前の一覧で続ける */ }
  if (X.cache && X.cache.tz !== new Date().getTimezoneOffset()) { X.cache = null; bumpRevision(); } // タイムゾーン変更: キャッシュ破棄
  await loadExt(true);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeExt(); });

// 設定パネル
function openLink(from) {
  lk = { busy: false, err: '', want: false };
  renderLink();
  openPanel(linkDlg, from);
  LK.body.querySelector('button')?.focus({ preventScroll: true });
  resumeExt();
}
function renderLink() {
  const on = extActive(), dis = lk.busy ? ' disabled' : '';
  let h = `<p class="lkintro">iPhoneのカレンダーの予定をDuoに表示します。Duoから追加した予定も、iPhoneのカレンダーに残せます。</p>
    <div class="swrow"><span id="lk-swl">連携</span><button type="button" role="switch" id="lk-sw" class="sw" aria-checked="${on}" aria-labelledby="lk-swl"${dis}><span class="knob" aria-hidden="true"></span><span class="swt">${on ? 'オン' : 'オフ'}</span></button></div>`;
  if (linkSaveFailed) h += '<p class="berr" role="alert">連携設定を保存できませんでした。</p>';
  if (lk.err) h += `<p class="berr" role="alert">${esc(lk.err)}</p>`;
  if (!on && lk.want) {
    const steps = '設定 ＞ プライバシーとセキュリティ ＞ カレンダー ＞ Duo で『フルアクセス』を許可してください。';
    if (X.perm === 'notDetermined') h += `<section class="card"><h3>iPhone のカレンダーへのアクセスを許可してください</h3><p>予定の表示と追加に、カレンダーへのフルアクセスが必要です。iPhone側の予定をDuoから編集・削除することはありません。</p><button type="button" class="solid" id="lk-req"${dis}>アクセスを許可</button></section>`;
    else if (X.perm === 'denied') h += `<section class="card"><p class="berr" role="alert">カレンダーへのアクセスが許可されていません。${steps}</p><button type="button" id="lk-settings">設定を開く</button></section>`;
    else if (X.perm === 'restricted') h += '<section class="card"><p class="berr" role="alert">この端末ではカレンダーへのアクセスが制限されています。端末の管理者に確認してください。</p></section>';
    else if (X.perm === 'writeOnly') h += `<section class="card"><p class="berr" role="alert">予定を表示するにはフルアクセスが必要です。${steps}</p><button type="button" class="solid" id="lk-req"${dis}>フルアクセスを許可</button><button type="button" id="lk-settings">設定を開く</button></section>`;
  }
  if (on) {
    if (!link.calendarIds.length) h += '<p class="smsg" role="status">表示するカレンダーを選んでください。</p>';
    for (const g of groupBySource(X.calendars)) {
      h += `<section class="card calgroup"><h3>${esc(g.heading)}</h3>${g.items.map((c) => `<label class="calrow"><input type="checkbox" data-cal="${esc(c.id)}"${link.calendarIds.includes(c.id) ? ' checked' : ''}><i class="cdot" style="background:${c.color}" aria-hidden="true"></i><span class="cname">${esc(c.title)}</span>${c.allowsModify ? '' : '<small>読み取り専用</small>'}</label>`).join('')}</section>`;
    }
    h += '<p class="small">Google カレンダーを表示するには、iPhoneの『設定 ＞ カレンダー ＞ アカウント』でGoogleを追加してください。iOSのバージョンによっては『設定 ＞ アプリ ＞ カレンダー ＞ カレンダーアカウント』にあります。</p>';
    const loading = X.status === 'loading';
    let st = 'まだ読み込んでいません';
    if (loading) st = '読み込み中…';
    else if (X.status === 'error') st = `読み込めませんでした。もう一度お試しください。${X.cache ? '前回読み込み分を表示中' : ''}`;
    else if (X.cache) st = `最終読み込み：${fmtLoaded(X.cache.loadedAt)}`;
    if (X.status === 'ok' && X.cache && !X.cache.events.length && link.calendarIds.length) st += '　この期間の予定はありません。';
    h += `<div class="lkfoot"><span id="lk-status" role="status">${esc(st)}</span><button type="button" id="lk-reload"${loading ? ' disabled' : ''}>再読み込み</button></div>`;
  }
  LK.body.innerHTML = h;
}
async function lkToggle() {
  if (lk.busy) return;
  lk.err = '';
  if (link.enabled) { setLink({ enabled: false }); X.gen++; X.cache = null; X.status = 'idle'; X.inflight = null; X.inflightKey = ''; X.failKey = ''; lk.want = false; render(); renderLink(); return; }
  lk.busy = true; lk.want = true; renderLink();
  const p = await checkPerm();
  lk.busy = false;
  if (p === 'granted') await enableLink();
  else if (p === null) lk.err = 'カレンダーの状態を確認できませんでした。もう一度お試しください。';
  renderLink();
  LK.body.querySelector('#lk-req, #lk-settings, #lk-sw')?.focus({ preventScroll: true });
}
async function enableLink() {
  try { await refreshCalendars(); } catch { lk.err = 'カレンダーの一覧を読み込めませんでした。もう一度お試しください。'; return; }
  setLink({ enabled: true });
  lk.want = false;
  loadExt(true);
  render();
}
async function lkRequest() {
  if (lk.busy) return;
  lk.busy = true; lk.err = ''; renderLink();
  try { const r = await call('requestPermission'); X.perm = r?.status || X.perm; } catch (e) { lk.err = errText(e, 'アクセスの確認に失敗しました。もう一度お試しください。'); }
  lk.busy = false;
  if (X.perm === 'granted') await enableLink();
  renderLink();
}
LK.body.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  if (b.id === 'lk-sw') lkToggle();
  else if (b.id === 'lk-req') lkRequest();
  else if (b.id === 'lk-settings') { try { await call('openSettings'); } catch { /* 開けなくても案内は残る */ } }
  else if (b.id === 'lk-reload') { X.failKey = ''; loadExt(true); renderLink(); }
});
LK.body.addEventListener('change', (ev) => {
  const cb = ev.target.closest('[data-cal]');
  if (!cb) return;
  const ids = new Set(link.calendarIds);
  if (cb.checked) ids.add(cb.dataset.cal); else ids.delete(cb.dataset.cal);
  setLink({ calendarIds: [...ids] });
  X.failKey = '';
  loadExt(true);
  renderLink();
  render();
});
$('#lk-close').addEventListener('click', () => closePanel(linkDlg));

// 読み取り専用の詳細シート
let xdCur = null;
function openExtDetail(id, from) {
  const e = visExt().find((x) => x.id === id);
  if (!e) return;
  xdCur = e;
  $('#xd-err').textContent = '';
  const t = (k) => `${ymdSlash(dayOf(k))} ${k.slice(11)}`;
  const when = e.all
    ? `<dt>開始</dt><dd>${ymdSlash(dayOf(e.start))}（終日）</dd><dt>終了</dt><dd>${ymdSlash(dayOf(e.end))}（含む最終日）</dd>`
    : `<dt>開始</dt><dd>${esc(t(e.start))}</dd><dt>終了</dt><dd>${esc(t(e.rawEnd && e.rawEnd >= e.start ? e.rawEnd : e.end))}</dd>`;
  $('#xd-body').innerHTML = `<h3 class="xdt">${esc(e.title)}</h3><p class="xdcal"><i class="cdot" style="background:${e.color}" aria-hidden="true"></i>${esc(subLabel(e))}${e.recurring ? ' <span class="rep" aria-hidden="true">↻</span>' : ''}</p>
    <dl class="facts">${when}<dt>場所</dt><dd>${e.place ? esc(e.place) : '場所なし'}</dd><dt>メモ</dt><dd class="notes">${e.notes ? esc(e.notes) : 'メモなし'}</dd></dl>`;
  openPanel(xdDlg, from);
  $('#xd-close').focus({ preventScroll: true });
}
$('#xd-close').addEventListener('click', () => closePanel(xdDlg));
$('#xd-open').addEventListener('click', async () => {
  if (!xdCur) return;
  $('#xd-err').textContent = '';
  try { const r = await call('openInCalendar', { start: xdCur.start }); if (!r?.opened) throw new Error('not opened'); } catch { $('#xd-err').textContent = 'カレンダーを開けませんでした。'; }
});

// iPhone への追加（再試行は同じ requestId。別の予定を作らない）
function openRetry(id, msg, canRetry) {
  xrId = id;
  $('#xr-msg').textContent = msg;
  $('#xr-retry').hidden = !canRetry;
  openPanel(xrDlg, document.activeElement);
  (canRetry ? $('#xr-retry') : $('#xr-close')).focus({ preventScroll: true });
}
let xrId = null;
async function createNative(id) {
  const e = state.events.find((x) => x.id === id), l = e?.nativeLink;
  if (!e || l?.state !== 'pending' || xBusy) return;
  xBusy = true;
  try {
    const r = await call('createEvent', { requestId: l.requestId, calendarId: l.calendarId, title: e.title, start: e.start, end: e.all ? `${dayOf(e.end)}T00:00` : e.end, all: !!e.all, place: e.place || '', notes: e.notes || '' });
    if (!r?.eventId) throw new Error('no event id');
    await commit({ puts: [{ ...e, nativeLink: { state: 'linked', requestId: l.requestId, eventId: String(r.eventId), calendarId: l.calendarId } }], dels: [] });
    setLink({ defaultCalendarId: l.calendarId });
    render();
    say('予定を保存し、iPhoneのカレンダーにも追加しました。');
    loadExt(true);
  } catch (err) {
    const msg = 'Duoに保存しました。iPhoneのカレンダーには追加できませんでした。';
    const hard = ['PERMISSION_DENIED', 'CALENDAR_NOT_FOUND', 'RESTRICTED', 'READ_ONLY'].includes(errCode(err));
    openRetry(id, hard ? `${msg}${errText(err, '')}メニューの『iPhone カレンダー連携』と追加先を確認してください。` : msg, !hard);
    say(msg);
  } finally { xBusy = false; }
}
$('#xr-close').addEventListener('click', () => closePanel(xrDlg));
$('#xr-retry').addEventListener('click', () => { closePanel(xrDlg); createNative(xrId); });

async function initNative() {
  if (!NATIVE) return;
  const p = await checkPerm();
  if (p === null) return;
  listen('calendarChanged', () => { clearTimeout(extTimer); extTimer = setTimeout(() => { if (extActive()) loadExt(true); }, 300); });
  if (link.enabled) {
    if (p === 'granted') { try { await refreshCalendars(); } catch { /* 一覧は後で再取得 */ } loadExt(true); } else dropLink('カレンダーへのアクセスを確認してください。');
  }
  if (extActive() && !dlg.open) {
    const pend = state.events.find((e) => e.nativeLink?.state === 'pending');
    if (pend) openRetry(pend.id, 'iPhoneのカレンダーへの追加が完了していない予定があります。', true);
  }
  if (dlg.open) updateXUi();
}

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (scopeDlg.open) cancelScope();
  else if (xrDlg.open) closePanel(xrDlg);
  else if (confirmDlg.open) cancelConfirm();
  else if (menuDlg.open) closePanel(menuDlg);
  else if (xdDlg.open) closePanel(xdDlg);
  else if (linkDlg.open) closePanel(linkDlg);
  else if (catsDlg.open) catsBack();
  else if (backupDlg.open) backBackup();
  else if (searchDlg.open) closePanel(searchDlg);
  else if (dlg.open) closeEditor();
});

// ---------- スワイプ（左＝次、右＝前） ----------
const SWIPE_ZONE = '.scroll, .agenda, .remaining, .hero, .page, .list';
const SWIPE_EXCLUDE = '.top, .shead, .rhead, .allday, .tl, .tlheads, .chead, .foot, .add, .tabs, .rail, .pctl, .foldband, .gutter, input, select, textarea, label, dialog';
let swiping = false;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const paneContent = () => [...root.querySelectorAll('.scroll > *, .agenda > *, .hero > *, .remaining > *, .margin > *')];

function swipeMove(dir) {
  if (listShown()) set({ home: false, view: 'month', selected: addMonths(state.selected, dir) });
  else move(dir);
  say(`${periodTitle()}。選択日は${dayLabel(state.selected)}。`);
}
async function swipeTo(dir) {
  if (swiping) return;
  if (reduced()) { swipeMove(dir); return; }
  swiping = true;
  document.documentElement.dataset.swiping = '1';
  try {
    const out = paneContent().map((el) => el.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dir * 32}px)`, opacity: 0 }],
      { duration: 100, easing: 'ease-in', fill: 'forwards' }));
    await Promise.all(out.map((a) => a.finished));
    swipeMove(dir);
    const back = paneContent().map((el) => el.animate(
      [{ transform: `translateX(${dir * 32}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 100, easing: 'ease-out' }));
    await Promise.all(back.map((a) => a.finished));
  } catch { /* アニメーションが中断されても状態は保つ */ } finally { swiping = false; delete document.documentElement.dataset.swiping; }
}
initSwipe({
  root,
  canStart: (t) => !anyPanel() && !swiping && t instanceof Element && !!t.closest(SWIPE_ZONE) && !t.closest(SWIPE_EXCLUDE),
  onSwipe: swipeTo,
});

// ---------- 起動 ----------
// 寸法 L が変わった時だけ再描画する。キーボードの出入りは位置・寸法の変数更新だけ。
window.addEventListener('resize', vpSchedule);
window.addEventListener('orientationchange', vpSchedule);
window.visualViewport?.addEventListener('resize', vpSchedule);
window.visualViewport?.addEventListener('scroll', vpSchedule);
// safe area だけが変わった場合（回転を伴わない変化・検証用の注入）も再配置する。自分が書く --vy/--vb では再入しない。
new MutationObserver(() => { if (safeKey(safe()) !== lastSafe) vpSchedule(); }).observe(de, { attributes: true, attributeFilter: ['style', 'class'] });
document.addEventListener('focusin', (ev) => { if (isTextEl(ev.target)) { clearTimeout(kbTimer); kbHold = false; vpSchedule(); setTimeout(() => reveal(ev.target), 50); } });
document.addEventListener('focusout', (ev) => {
  if (!isTextEl(ev.target)) return;
  kbHold = true; clearTimeout(kbTimer);
  kbTimer = setTimeout(() => { kbHold = false; vpSchedule(); }, 700);
});
setInterval(() => { if (!anyPanel() && listShown()) render(); else updateNow(); }, 60000);

async function boot() {
  updateVars();
  render();
  try { setCategories(await db.listCategories()); state.events = await db.listEvents(); bumpRevision(); } catch { say('保存領域を開けませんでした。'); }
  state.loaded = true;
  render();
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }
  if (draft && typeof draft === 'object') {
    const id = draft.editing && resolve(draft.editing) ? draft.editing : null;
    origins.set(dlg, root.querySelector('[data-act="add"]'));
    showEditor({
      title: draft.title || '', categoryId: draftCat(draft), all: !!draft.all, start: draft.start || '', end: draft.end || '', place: draft.place || '', notes: draft.notes || '',
      rfreq: draft.rfreq, rbyday: Array.isArray(draft.rbyday) ? draft.rbyday : [], rend: draft.rend, rcount: draft.rcount, runtil: draft.runtil, ropen: !!draft.ropen, autoDays: draft.autoDays,
    }, id, false);
  }
  await Promise.race([initNative(), new Promise((r) => setTimeout(r, 2500))]);
  document.documentElement.dataset.ready = '1';
}
boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && location.protocol !== 'capacitor:' && !(window.Capacitor?.isNativePlatform?.()) && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
