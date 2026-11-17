import * as db from './db.js';
import { isoFromInput, stateFromInput, setStartDate, pickEndDate, setStartTime, setEndTime, setDuration, setAll } from './datetime.js';
import { createTimeUi, createDateUi, createDateField, createTimeField, fireInput, monthOf, withHm } from './datetime-ui.js';
import { SAMPLE } from './sample.js';
import { initSwipe } from './swipe.js';
import { initDirectInput, dayRange, rangeText, minutesAt, dragRange, tapRange, moveHandle, spanText, hm as hmText, snap15, edgeZone, edgeVelocity, createDwell, createFrameLoop } from './direct-input.js';
import { occurrenceAt, parseOccId, planDelete, planEdit, editInfo, normRule } from './recur.js';
import { bumpRevision, occBetween } from './occcache.js';
import { LIMIT, groupByDay, highlight, excerpt, searchEvents, searchMemos } from './search.js';
import { backupName, buildBackup, countStats, localIso, planAppend, planMemos, planTasks, validateBackup, MAX_BYTES } from './backup.js';
import { CAT_IDS, LIMITS as CAT_LIMITS, canHideCategory, defaultDeleteTarget, ensureOneVisible, supplementForReplace, PALETTE, UNCATEGORIZED, countByCategory, fixEventCategories, legacyToId, mergeCategories, moveCategory, nameTaken, RETARGET_TOAST, newCategory, paletteName, planDeleteCategory, resolveCategory, sortCategories, tint, validateCategory } from './categories.js';
import { alarmOptions, alarmsAria, alarmsDup, convertAlarms, decAlarm, defaultAlarms, encAlarm, fireAt, nextNotifyText, normNotify, pastForNotify, planNotifications, planNotifyPolicy, MAX_PENDING, WINDOW_DAYS } from './notify.js';
import { rokuyoOf } from './rokuyo.js';
import { holidayOf } from './holidays.js';
import { splitEvents, eveningFirst, homeTasks, dueText, tomorrowSummary, axisBars, firstLines } from './home.js';
import { PAGE_IDS, normalizePages, selectPage, normTimeMode, TIME_MODES, TIME_LABELS } from './pages.js';
import { memoStore, setMemoHook, recoverMemoDraft, SAVE_FAILED } from './memos.js';
import { DELETE_UNDO_MS, tasksHtml, HIST_DAYS, openTaskEditor, taskEditorHtml, taskDirty, saveTask, hasNotify, NOTE_NEED_DUE, createDeleteController, TASK_DELETED, dueCounts, overdueTodayCount } from './reminders.js';
import { LOCAL_LIST, TASK_STORE_TEXT, createTaskStore, createLocalCall, createLocalAddController, rowOf, createTaskDoneController, DONE_UNDO_MS, inheritTaskSettings, normTaskSettings } from './tasks.js';
import { PASTE_MAX, addDaysCapped, bandLabel, clipTitle, daysBetween, pasteLabel, planPaste, spanOf, toggleDay } from './paste.js';
import { call, errCode, errReason, errText, haptic, listen, nativeAvailable } from './native.js';
import { createDestPage, destRowsHtml } from './destination-ui.js';
import { KB_METRICS_ENABLED, kbMetrics, kbText, screenText } from './kbmetrics.js';
import { createPosture, postureText } from './posture.js';
import { makeVisible, buildExtArgs, buildExtDeleteArgs, cleanLink, covers, dedupe, extCanMove, extEditable, extIn, extRange, fmtLoaded, groupBySource, keepAfterReplace, lastDay, mergeOps, normDest, normSettings, pickAddCal, planLinkMigration, planNativeOps, resolveDest, rangeKey, refreshLinks, relink, searchExt, stampOf, subLabel, toDisplay, uniqueRequestIds, visibleDestGroups, allDestHidden, withIdent, writable, ymdSlash } from './iphone.js';
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
    // 同（開いた画面・見開き・卓上。既定は切）。第10版は既定「入」の値を自動保存していたため、monthTimeV=11 の印がない保存値の true は旧既定とみなして切に戻す
    monthTimeOpen: s.monthTimeV === 11 ? s.monthTimeOpen === true : false,
    monthTextSize: s.monthTextSize === 'large' ? 'large' : 'normal', // 月の文字: 標準 / 大
    pages: normalizePages(s.pages), // 開いた横の左右ページ（月・時間・タスク・メモ）と縦の下パネル。旧 home/view は閉じた画面・縦の従来表示用に保持
    timeMode: normTimeMode(s.timeMode), // 時間ページの表示（左右別）: '1' 1日 | '3' 3日 | 'week' 週 | 'list' 一覧
    lastSide: s.lastSide === 'left' ? 'left' : 'right', // 最後に触ったページ（＋の行き先）
    holidayRed: s.holidayRed !== false, // 祝日を赤で表示（既定オン。boolean の false だけが切。日曜の赤は常に出す）
    rokuyo: s.rokuyo !== false, // 六曜を表示（既定オン。boolean の false だけが切。未保存・破損・欠落はオン）
  };
}
const state = { ...loadUi(), events: [], categories: [], loaded: false, strip: null }; // strip: 右の帯から開いたタスク／メモ（'task'|'memo'）。メモリだけ、保存しない
// コピー貼り付けの選択状態（メモリだけ。DB・native へは書かない）。第14版 PR33。
// 確定は confirmPaste（PR34）が pasteCommit へ接続する。
const PASTE_ENTRY = true;
const PS = { on: false, src: null, srcLink: null, srcDay: '', days: [], busy: 0, onConfirm: null };
setFirstDay(state.weekStart);
let hiddenCats = new Set();
function setCategories(list) {
  state.categories = sortCategories(list);
  hiddenCats = new Set(state.categories.filter((c) => c.hidden).map((c) => c.id));
}
if (params.has('desk')) state.desk = params.get('desk') === '1';
// 通知の設定。localStorage['duo-notify' + suffix]、バックアップの settings.notify に出し入れする。未保存でも既定（時刻あり30分前／終日は当日 8:00）を返す。
const NOTIFY_KEY = `duo-notify${suffix}`;
// 保存できなかったときは、この実行中だけ実効値をメモリに保つ（notifyMem）。
const NOTIFY_POLICY_KEY = `duo-notify-policy.v15${suffix}`;
const LS_EVIDENCE = (() => { // 起動の最初（この起動の保存より前）に既存端末の証拠を採る
  try { return [UI_KEY, DRAFT_KEY, NOTIFY_KEY, `duo-native-cal${suffix}`, `duo-native-rem${suffix}`, `duo-task-settings${suffix}`].some((k) => localStorage.getItem(k) !== null); } catch { return false; }
})();
let notifyMem = null;
function loadNotify() {
  if (notifyMem) return normNotify(notifyMem);
  try { return normNotify(JSON.parse(localStorage.getItem(NOTIFY_KEY) || 'null')); } catch { return normNotify(null); }
}
function saveNotify(n) {
  const next = normNotify({ ...loadNotify(), ...n });
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify(next)); notifyMem = null; } catch { notifyMem = next; /* 保存不可でも続ける */ }
}
// 通知の既定を「なし」にする一度きりの移行（PR12）。設定の書込成功後にだけ印を書く。失敗時は実効値を保ち次回再試行。
async function applyNotifyPolicy() {
  let done = false;
  try { done = localStorage.getItem(NOTIFY_POLICY_KEY) !== null; } catch { done = false; }
  if (done) return;
  let existing = LS_EVIDENCE;
  try { const ev = await db.readLegacyEvidence(); existing = existing || ev.events > 0 || ev.memos > 0 || ev.meta > 0 || ev.legacyCats > 0; } catch { /* 証拠が読めなければ LS の証拠だけで判断 */ }
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(NOTIFY_KEY) || 'null'); } catch { stored = null; }
  const next = planNotifyPolicy(stored, existing);
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
    localStorage.setItem(NOTIFY_POLICY_KEY, new Date().toISOString());
    notifyMem = null;
  } catch { notifyMem = next; }
}
const chipTime = (iso) => iso.slice(11).replace(/^0/, ''); // 月チップの時刻は先頭の0なし（3:00 / 10:00）
function saveUi() {
  const { selected, view, style, desk, home, monthExpand, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTextSize, rokuyo, holidayRed, pages, timeMode, lastSide } = state;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ selected, view, style, desk, home, monthExpand, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTimeV: 11, monthTextSize, rokuyo, holidayRed, pages, timeMode, lastSide })); } catch { /* 保存不可でも動作は続ける */ }
}
// 左右（または縦の下パネル）のページを選ぶ。同じ種類が左右に並ぶ場合は交換。
function setPage(side, id) { set({ pages: selectPage(state.pages, side, id) }); }
function set(patch) {
  if (state.strip && !('strip' in patch) && ['view', 'home', 'pages', 'desk'].some((k) => k in patch)) patch = { ...patch, strip: null }; // 下のタブ・ページ切替で帯の入口から元へ戻る
  if (memoStore.anyDirty() && ['selected', 'pages', 'view', 'home', 'desk'].some((k) => k in patch)) { memoSync(); memoStore.flushAll(); } // 日付・ページを変える前に未保存のメモを書く
  if (patch.pages) for (const w of Object.keys(ML.open)) if (patch.pages[w] === 'memo' && state.pages[w] !== 'memo') ML.open[w] = false; // メモへ入り直したら本文（この日）から始める
  Object.assign(state, patch); if ('weekStart' in patch) setFirstDay(state.weekStart); saveUi(); render(); }

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
let directCtl = null; // 直接入力の制御（回転で取り消す）
function vpSchedule() { cancelAnimationFrame(vpRaf); vpRaf = requestAnimationFrame(vpTick); }
function vpTick() {
  const changed = measureL();
  const { kb } = updateVars();
  const sc = safeChanged();
  updateDiagnostics();
  if (changed || sc) { directCtl?.cancel('rotate'); render(); }
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
// 開いた縦の下パネル（月タブのときだけ使える）。設定（pages.portraitShown / portraitBottom）は他のタブへ移っても消さない。
const panelAvail = () => layoutKind() === 'open' && isPortrait() && state.view === 'month' && !listShown();
const panelOn = () => panelAvail() && state.pages.portraitShown;
// 「一覧」（今日と次の予定のリスト）を本文に出しているか。閉じた画面は home、開いた画面は「一覧」を選んだとき。
function listShown() { const k = layoutKind(); return k === 'home' || (state.home === true && k !== 'browse' && k !== 'spread'); }
// 見開きでは左右のページ（pages）が表示を決める。月の部品が見る「表示」は常に月（従来の日・週・一覧は時間ページの中で描く）。
// 見開きで今見えているページ。右の帯のタスク／メモ（state.strip）が右ページを一時的に置き換える。保存した pages は変えない。
const PG = () => (state.strip && layoutKind() === 'spread' && state.pages.left !== state.strip ? { ...state.pages, right: state.strip } : state.pages);
const viewNow = () => (layoutKind() === 'spread' ? 'month' : state.view);

// ---------- 寸法の唯一の入力 → CSS 変数（座標はすべて画面座標 CSS px） ----------
// 入力: 安定寸法 L（innerWidth/innerHeight）・safe area・週数。折り目は常にビューポート中心 L.w/2。
let lastSafe = null;
let portraitWeekH = 0; // 下パネル表示中の開いた縦の月の1週の高さ（0＝パネルなし）
let spreadWeekH = 0; // 開いた横の月の1週の高さ（updateLayoutMetrics が決める。段数の上限計算に使う）
const safeKey = (S) => `${S.top}/${S.right}/${S.bottom}/${S.left}`;
function safeChanged() { const k = safeKey(safe()); const c = k !== lastSafe; lastSafe = k; return c; }
const r2 = (n) => Math.round(n * 100) / 100;
// 帯（safe area）に置く操作。右の帯は閉じた画面・開いた横の右 safe、開いた縦は上 safe。84/82 など機種の値は書かない（safe() の値だけが基準）。
const HIT_BAND = 56, VIS_BAND = 48, HIT_HDR = 44;
const POS = { post: 'closed', band: false, bg: null, hbar: false, set: null, search: null, all: null, task: null, memo: null, today: null, add: null, pnl: null, ux: 1 };
function updateLayoutMetrics() {
  const S = safe(); lastSafe = safeKey(S);
  const kind = layoutKind(), W = L.w, H = L.h;
  const T = S.top, R = S.right, B = S.bottom, Ls = S.left;
  const x0 = Ls, y0 = T, U = W - Ls - R, V = H - T - B;
  const post = kind === 'home' || kind === 'browse' ? 'closed' : kind === 'open' && isPortrait() ? 'portrait' : 'landscape';
  const n = monthWeeks(state.selected).length;
  const v = { 'layout-w': W, 'layout-h': H, 'content-x': x0, 'content-y': y0, 'content-w': U, 'content-h': V, 'fold-x': W / 2 };
  const pos = { post, band: false, bg: null, hbar: false, set: null, search: null, all: null, task: null, memo: null, today: null, add: null, pnl: null, ux: 1 };
  portraitWeekH = 0;
  for (const k of ['pnl-top', 'pnl-h', 'pnl-up-h']) de.style.removeProperty(`--${k}`);
  const box = (x, y, s, vs) => ({ x, y, s, v: vs });
  let left, right, c, headH, gridTop, G, tabsCx, tabsY, ctrlY, rightStart = 0, swRx = 0, tabsW = 270, q = V / 678, hc = 0;
  const bandOk = R >= HIT_BAND;
  if (post === 'closed') {
    // 閉じた画面: 本文 [Ls, W-R]（safe の外側＝帯の中に旧 rail を足さない）。q は safe を除いた高さ / 678。
    const C = W - R - Ls;
    left = x0; right = W - R; c = C / 7; headH = 76 * q; gridTop = y0 + 92 * q; G = 500 * q;
    const cy = H - B - 56 * q;
    const tops = [172, 232].map((t) => y0 + t * q).concat([H - B - 260 * q, H - B - 200 * q, H - B - 140 * q, H - B - 80 * q]); // 設定・検索・タスク・メモ・今日・＋
    const m = (HIT_BAND - VIS_BAND) / 2;
    pos.band = bandOk && tops[0] - m >= y0 + 160 * q && tops.every((t, i) => i === 0 || t - m >= tops[i - 1] + VIS_BAND + m);
    if (R > 0) pos.bg = { x: W - R, w: R };
    if (pos.band) {
      const cx = W - R / 2, bx = cx - HIT_BAND / 2;
      pos.set = box(bx, tops[0] - m, HIT_BAND, VIS_BAND); pos.search = box(bx, tops[1] - m, HIT_BAND, VIS_BAND);
      pos.task = box(bx, tops[2] - m, HIT_BAND, VIS_BAND); pos.memo = box(bx, tops[3] - m, HIT_BAND, VIS_BAND);
      pos.today = box(bx, tops[4] - m, HIT_BAND, VIS_BAND); pos.add = box(bx, tops[5] - m, HIT_BAND, VIS_BAND);
      tabsW = Math.min(286, C - 16);
    } else {
      pos.hbar = true;
      const hy = Math.max(y0, y0 + headH - 6 - HIT_HDR);
      pos.set = box(Ls + 4, hy, HIT_HDR, HIT_HDR); pos.search = box(W - R - 4 - HIT_HDR, hy, HIT_HDR, HIT_HDR);
      pos.today = box(Ls + 8, cy - 24, 48, 48); pos.add = box(W - R - 8 - 48, cy - 24, 48, 48);
      tabsW = Math.min(286, C - 128);
    }
    tabsCx = (Ls + W - R) / 2; tabsY = cy - 23; ctrlY = cy - 24;
  } else if (post === 'portrait') {
    // 開いた縦: 見出しは上 safe の帯の中（T に足さない）。head = max(T, 82)。縦位置は safe を除いた画面全体（上は帯込み）。
    const head = Math.max(T, 82), p = (H - B) / 951, ux = U / 669;
    left = x0; right = W - R; c = U / 7; headH = head; gridTop = head + 24; G = (H - B - 71 * p) - gridTop;
    const rowTop = Math.min(H - B - 70 * p, H - B - 48);
    ctrlY = rowTop; tabsY = rowTop; tabsCx = Ls + U / 2;
    tabsW = Math.min(270, Math.max(0, U - 2 * (20 + 48 + 8)));
    hc = Math.min(head - 22, Math.max(22, head * 46 / 82));
    pos.hbar = true; pos.ux = ux;
    pos.set = box(Ls + 20 * ux, hc - 22, HIT_HDR, HIT_HDR); pos.search = box(Ls + 484 * ux, hc - 22, HIT_HDR, HIT_HDR);
    pos.today = box(Ls + 20, rowTop, 48, 48); pos.add = box(W - R - 20 - 48, rowTop, 48, 48);
    q = p;
    v['content-y'] = T; v['content-h'] = V;
    if (panelAvail()) pos.pnl = box(Ls + 80, rowTop, 48, 48); // 今日の丸の右、間12
    if (panelOn()) {
      // 下パネル: マスは通常の高さ比 414/774、パネルは マスの下端〜（操作段の上端−8p）。基準 y520〜873。
      G = G * 414 / 774;
      const pb = rowTop - 8 * p;
      v['pnl-top'] = gridTop + G; v['pnl-h'] = Math.max(0, pb - gridTop - G); v['pnl-up-h'] = Math.max(0, pb - gridTop);
      portraitWeekH = G / n;
    }
  } else {
    // 開いた横: 左月 [Ls+8, f-10]、右本文 [f+10, E]、E = W-R-16。
    q = V / 669;
    const f = W / 2, E = W - R - 16;
    // 月の最下段はタブの上へ: 実際のタブ上端 − 8q が月の下端（基準 q=1 で y96〜603、G=507）。機種別の固定値は持たない。
    const tabsTop = Math.min(y0 + 611 * q, H - B - 46);
    left = x0 + 8; right = f - 10; c = (right - left) / 7; headH = 76 * q; gridTop = y0 + 96 * q; G = Math.max(0, tabsTop - 8 * q - gridTop); rightStart = f + 10;
    spreadWeekH = G / n;
    hc = y0 + 40 * q;
    swRx = (f + 10 + E) / 2; // 右ページの切替の中心（右ページの利用幅 [f+10, E] の中央）
    tabsY = y0 + 611 * q; ctrlY = tabsY; tabsCx = (left + right) / 2;
    const tops = [124, 184].map((t) => y0 + t * q).concat([H - B - 249 * q, H - B - 189 * q, H - B - 129 * q, H - B - 69 * q]); // 設定・検索・タスク・メモ・今日・＋
    const m = (HIT_BAND - VIS_BAND) / 2;
    pos.band = bandOk && tops[0] - m >= y0 + 112 * q && tops.every((t, i) => i === 0 || t - m >= tops[i - 1] + VIS_BAND + m);
    if (R > 0) pos.bg = { x: W - R, w: R };
    if (pos.band) {
      const bx = W - R / 2 - HIT_BAND / 2;
      pos.set = box(bx, tops[0] - m, HIT_BAND, VIS_BAND); pos.search = box(bx, tops[1] - m, HIT_BAND, VIS_BAND);
      pos.task = box(bx, tops[2] - m, HIT_BAND, VIS_BAND); pos.memo = box(bx, tops[3] - m, HIT_BAND, VIS_BAND);
      pos.today = box(bx, tops[4] - m, HIT_BAND, VIS_BAND); pos.add = box(bx, tops[5] - m, HIT_BAND, VIS_BAND);
    }
    Object.assign(v, { 'left-start': left, 'right-end': E });
  }
  Object.assign(POS, pos);
  de.style.setProperty('--ux', String(Math.round(pos.ux * 1e5) / 1e5));
    if (post === 'landscape') tabsW = Math.min(240, Math.max(176, right - left, 0), Math.max(176, (W - R - 16) - rightStart));
  tabsW = Math.max(post === 'portrait' ? 0 : 176, tabsW);
  const maxY = H - B;
  Object.assign(v, {
    'left-end': right, 'right-start': rightStart, 'grid-top': gridTop, 'grid-h': G, 'week-h': G / n, 'month-col-w': c,
    'tabs-x': tabsCx - tabsW / 2, 'sw-r-x': swRx - tabsW / 2, 'tabs-y': Math.min(tabsY, maxY - 46), 'tabs-w': tabsW, 'controls-y': Math.min(ctrlY, maxY - 48),
    'head-h': headH, 'wd-h': gridTop - (post === 'portrait' ? 0 : y0) - headH, 'hc': hc,
  });
  if (post === 'landscape') v['hpt'] = Math.max(0, 40 * q - 22);
  // 閉じた画面: 月のスクロール末尾は、最終週をタブの上へ出せるだけ（安全矩形の下端 − タブ上端）、最低56
  de.style.setProperty('--end-pad-closed', `${r2(Math.max(56, y0 + V - (v['tabs-y'] ?? 0)))}px`);
  de.style.setProperty('--ry', String(Math.round(q * 1e5) / 1e5)); // 基準比率 q（閉 678／横 669／縦 951 に対する高さの比）
  for (const [k, val] of Object.entries(v)) de.style.setProperty(`--${k}`, `${r2(val)}px`);
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
let postureCtl = null; // initNative 前は null
function updateDiagnostics() {
  postureCtl?.reapply(); // 閉じた画面⇄開いたで外面除外を再評価
  const el = $('#layout-diagnostics'); if (el) el.textContent = diagText();
  updateKbMetrics();
  updateScreenDiag();
}
// 画面寸法の診断（読むだけ）。長押し（約500ms・touch/マウス）でクリップボードへコピー。
function screenDiagText() {
  return screenText({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio || 1, screenW: window.screen?.width, screenH: window.screen?.height, safe: safe() });
}
function updateScreenDiag() { const el = $('#screen-diagnostics'); if (el) el.textContent = screenDiagText(); }
function initScreenDiagCopy() {
  const el = $('#screen-diagnostics'); if (!el) return;
  let timer = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerdown', () => {
    cancel();
    timer = setTimeout(async () => {
      timer = 0;
      const t = screenDiagText();
      try { await navigator.clipboard.writeText(t); notice('コピーしました', null, 2000); }
      catch { const sel = getSelection(); const rg = document.createRange(); rg.selectNodeContents(el); sel?.removeAllRanges(); sel?.addRange(rg); notice('コピーできません。選択したので手動でコピーしてください', null, 3500); }
    }, 500);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
// キーボード計測は設定 › 詳細が開いているときだけ読む（常時ポーリングしない・値は読むだけで何も変更しない）。
function updateKbMetrics() {
  const el = $('#kb-metrics');
  if (!el) return;
  if (!KB_METRICS_ENABLED) { el.hidden = true; return; }
  const m = kbMetrics({ innerHeight: window.innerHeight, vv: window.visualViewport, posture: 'devicePosture' in navigator, segments: !!window.visualViewport?.segments || 'getWindowSegments' in window });
  el.textContent = kbText(m).replace(/ · division\/frame\/angle\/status 未取得$/, '') + ' · ' + postureText(postureCtl?.effective ?? null, { failed: !!postureCtl?.failed, kbTop: m.kbTop, native: NATIVE });
}

// タッチ確認モード（実機の座標確認用。保存しない・通常時は DOM に層がない）。
let touchLayer = null;
function closeTouchCheck() { touchLayer?.remove(); touchLayer = null; }
function openTouchCheck() {
  if (touchLayer) return;
  const L = document.createElement('div');
  L.id = 'touch-check'; L.setAttribute('role', 'dialog'); L.setAttribute('aria-label', 'タッチ確認');
  const info = document.createElement('div'); info.className = 'tc-info';
  const end = document.createElement('button'); end.type = 'button'; end.className = 'tc-end'; end.textContent = 'タッチ確認を終わる';
  const head = () => { const S = safe(); return `${window.innerWidth}×${window.innerHeight} px · DPR ${num(window.devicePixelRatio || 1)}\nsafe 上${num(S.top)} 右${num(S.right)} 下${num(S.bottom)} 左${num(S.left)}`; };
  info.textContent = `${head()}\n画面をタップすると座標が出ます`;
  const stop = (e) => { e.stopPropagation(); };
  L.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.target === end) return;
    const S = safe(), x = e.clientX, y = e.clientY;
    info.textContent = `${head()}\nclient ${num(x)}, ${num(y)}\nsafe内 ${num(x - S.left)}, ${num(y - S.top)}`;
    const dot = document.createElement('div'); dot.className = 'tc-dot'; dot.style.left = `${x}px`; dot.style.top = `${y}px`;
    const t = document.createElement('i'); t.textContent = `${Math.round(x)},${Math.round(y)}`; dot.append(t);
    L.insertBefore(dot, info);
    const dots = L.querySelectorAll('.tc-dot'); if (dots.length > 20) dots[0].remove();
  });
  for (const t of ['pointerup', 'click', 'touchstart', 'touchmove', 'contextmenu']) L.addEventListener(t, (e) => { if (e.target === end && t !== 'contextmenu') return; e.preventDefault(); stop(e); });
  end.addEventListener('click', (e) => { e.stopPropagation(); closeTouchCheck(); });
  L.append(info, end); document.body.append(L); touchLayer = L; end.focus({ preventScroll: true });
}

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
// 新しい予定の追加先（defaultDest）を、表示中のものへ解決する。未設定（移行前）は Duo の表示中先頭。
const destNow = () => resolveDest(link.defaultDest, { cats: state.categories, cals: X.calendars, ids: link.calendarIds, usable: extActive() });
const destCalId = () => { const d = destNow(); return d.type === 'iphone' ? d.id : ''; };
const setDest = (d) => setLink({ defaultDest: d });
// 旧設定の一度きりの移行（許可・一覧取得後に確定。保存したら再実行しない）。旧キー（addByDefault 等）は消さない。
function migrateLinkOnce() {
  const patch = planLinkMigration(link, { perm: X.perm, cals: X.listed ? X.calendars : null, cats: state.categories });
  if (patch) setLink(patch);
}
const linkMigPending = () => !link.enabledMig || !link.defaultDest;
// perm: null（未確認）| granted | denied | restricted | notDetermined | writeOnly
// iPhone への反映の送信待ち（meta.nativeOutbox の写し）。items は更新のたびに新しい配列にする。
const OBX = { items: [], inflight: null, timer: 0, chain: Promise.resolve() };
const X = { avail: NATIVE, perm: null, listed: false, calendars: [], cache: null, status: 'idle', stale: false, gen: 0, inflight: null, inflightKey: '', failKey: '', vis: null, visFor: null };
const extActive = () => NATIVE && X.avail && link.enabled && X.perm === 'granted';
// 表示用の外部予定（アプリ予定のリンクと一致するものは除外）。入力が変わるまで使い回す。
function visExt() {
  if (!extActive() || !X.cache) return [];
  if (X.visFor?.[0] !== X.cache || X.visFor?.[1] !== state.events || X.visFor?.[2] !== OBX.items || X.visFor?.[3] !== link.calendarIds) {
    const on = new Set(link.calendarIds); // オフにしたカレンダーの予定は、再読込を待たず画面・検索から外す（CT-6）
    X.vis = dedupe(X.cache.events, state.events, OBX.items).filter((e) => on.has(e.calId)); X.visFor = [X.cache, state.events, OBX.items, link.calendarIds];
  }
  return X.vis;
}
const isX = (e) => e.origin === 'iphone';
const catOf = (e) => resolveCategory(e.categoryId, state.categories);
const catCls = (e) => (isX(e) ? 'ext' : '');
// 色はカテゴリ一覧から inline の CSS 変数で（固定クラスは使わない）。iPhone の予定はカレンダーの色。
const colorVars = (c) => `--cat:${c};--tint:${tint(c)};`;
// iPhone に保存した予定（linked / pending）の色と札は保存先カレンダーのもの。未取得なら保存した名前と安全な色。
const calOfLink = (e) => {
  const l = e.nativeLink;
  if (isX(e) || !l || (l.state !== 'linked' && l.state !== 'pending')) return null;
  const c = X.calendars.find((x) => x.id === l.calendarId);
  return { name: c ? c.title : l.calName || 'iPhone', color: c?.color || '#68716A' };
};
const catVar = (e) => { if (isX(e)) return `--cat:${e.color};`; const c = calOfLink(e); return colorVars(c ? c.color : catOf(e).color); };
const catSty = (e) => ` style="${catVar(e)}"`;
const tagText = (e) => (isX(e) ? subLabel(e) : calOfLink(e)?.name ?? catOf(e).name);
const xi = (e) => (isX(e) ? '<span class="xi" aria-hidden="true">▦</span>' : '');
const xname = (e) => (isX(e) ? `iPhone、${e.calName}、` : '');

// ---------- テンプレート ----------
// 浮動タブ: ホーム／日／週／月（今日はボタンへ移った）。native button + aria-pressed。ホームのみ data-act=list（保存値 state.home は従来のまま）。
const TABS = [['list', 'ホーム'], ['day', '日'], ['week', '週'], ['month', '月']];
function tabs() {
  const act = state.strip ? null : listShown() ? 'list' : state.view; // 帯のタスク／メモを開いている間はどのタブも選ばれない
  return `<div class="tabs" role="group" aria-label="表示期間">${TABS.map(([v, l], i) => `<button type="button" ${v === 'list' ? 'data-act="list"' : `data-view="${v}"`} aria-pressed="${v === act}" aria-description="4個中${i + 1}番目"><span class="pill">${l}</span></button>`).join('')}</div>`;
}
const todayBtn = '<button type="button" class="today" data-act="today">今日に戻る</button>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_PNL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 13h17" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_TASK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4.5 12.8l4.6 4.6L19.5 6.8" fill="none" stroke="#294E42" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_MEMO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.2" fill="none" stroke="#294E42" stroke-width="1.8"/><path d="M8.6 9h6.8M8.6 12.5h6.8M8.6 16h4" stroke="#294E42" stroke-width="1.6" stroke-linecap="round"/></svg>';
// 設定の入口（歯車）。名前は「設定」に統一。
const ICON_GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M10.3 3.2h3.4l.5 2.3 1.6.9 2.2-.8 1.7 3-1.7 1.6v1.8l1.7 1.6-1.7 3-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-3 1.7-1.6v-1.8L4.3 8.8l1.7-3 2.2.8 1.6-.9z"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const hdr = `<button type="button" class="iconbtn" data-act="search" aria-label="予定を検索">${ICON_SEARCH}</button><button type="button" class="iconbtn" data-act="menu" aria-label="設定" aria-haspopup="dialog">${ICON_GEAR}</button>`;
const brand = `<div class="brand"><span class="logo">Duo.</span><span class="small">私の手帳</span></div>${hdr}`;
// 帯・見出し・下段の操作（位置は updateLayoutMetrics の POS。safe area の値だけが基準）。
const posStyle = (p) => (p ? ` style="left:${r2(p.x)}px;top:${r2(p.y)}px;width:${p.s}px;height:${p.s}px;--v:${p.v}px"` : '');
const todayLabel = () => { const d = parseKey(todayKey()); return `${DOW[d.getDay()]}${d.getDate()}`; };
const CTL = {
  set: () => `<button type="button" class="cb csettings" data-act="menu" aria-label="設定" aria-haspopup="dialog"${posStyle(POS.set)}><span class="bi">${ICON_GEAR}</span></button>`,
  search: () => `<button type="button" class="cb csearch" data-act="search" aria-label="予定を検索"${posStyle(POS.search)}><span class="bi">${ICON_SEARCH}</span></button>`,
  task: () => {
    const n = stripTaskCount(), on = stripOn('task');
    return `<button type="button" class="cb cstrip ctask${on ? ' on' : ''}" data-act="strip" data-strip="task" aria-pressed="${on}" aria-label="${n ? `タスク、期限切れと今日 ${n}件` : 'タスク'}"${posStyle(POS.task)}><span class="bi">${ICON_TASK}${n ? `<span class="bdg" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</span></button>`;
  },
  memo: () => {
    const has = memoDayHas(todayKey()), on = stripOn('memo');
    return `<button type="button" class="cb cstrip cmemo${on ? ' on' : ''}${has ? ' has' : ''}" data-act="strip" data-strip="memo" aria-pressed="${on}" aria-label="${has ? 'メモ、今日のメモあり' : 'メモ'}"${posStyle(POS.memo)}><span class="bi">${ICON_MEMO}</span></button>`;
  },
  today: () => `<button type="button" class="cb ctoday" data-act="today" aria-label="今日に戻る"${posStyle(POS.today)}><span class="bi" aria-hidden="true">${todayLabel()}</span></button>`,
  pnl: () => { const on = state.pages.portraitShown; return `<button type="button" class="cb cpnl${on ? ' on' : ''}" data-act="pnltoggle" aria-label="${on ? '下の段を隠す' : '下の段を表示'}"${posStyle(POS.pnl)}><span class="bi">${ICON_PNL}</span></button>`; },
  add: () => `<button type="button" class="cb cadd" data-act="add" aria-label="予定を追加"${posStyle(POS.add)}><span class="bi" aria-hidden="true">＋</span></button>`,
};
// 右の帯のタスク／メモ。閉じた画面は全面に出している間、見開きはどちらかのページがそれのとき「開いている」。
const stripOn = (id) => (layoutKind() === 'spread' ? PG().left === id || PG().right === id : state.strip === id);
const stripTaskCount = () => {
  if (!RM.data) return 0;
  const ids = delCtl.ids(), list = ids.size ? RM.data.reminders.filter((x) => !ids.has(x.itemId)) : RM.data.reminders;
  return overdueTodayCount(list, shownIds(), doneCtl.pending(), todayKey());
};
const monthAll = () => viewNow() === 'month' && !listShown();
// 帯／見出しの上の操作群。帯があるとき（閉じた画面・開いた横）は帯に5つ（全は月のみ）、なければ見出し・下段へ。
function ctl() {
  const bg = POS.bg ? `<div class="bandbg" aria-hidden="true" style="left:${r2(POS.bg.x)}px;width:${r2(POS.bg.w)}px"></div>` : '';
  let h = '';
  if (POS.post === 'closed') {
    h = POS.band ? CTL.set() + CTL.search() + CTL.task() + CTL.memo() + CTL.today() + CTL.add() : CTL.set() + CTL.search() + CTL.today() + CTL.add();
  } else if (POS.post === 'portrait') h = CTL.set() + CTL.search() + CTL.today() + (POS.pnl ? CTL.pnl() : '') + CTL.add();
  else if (POS.band) h = CTL.set() + CTL.search() + CTL.task() + CTL.memo() + CTL.today() + CTL.add();
  return `${bg}<div class="ctl${POS.band ? ' band' : ''}" role="group" aria-label="操作">${h}</div>`;
}
// 画面・検索・通知で共通の表示条件。入力が変わるまで使い回す。
let visFnKey = null, visFn = null;
function duoVisible() {
  const k = [state.events, hiddenCats, link, X.perm, X.calendars];
  if (!visFnKey || k.some((v, i) => v !== visFnKey[i])) { visFn = makeVisible({ events: state.events, hiddenCats, link, perm: X.perm, calendars: X.calendars }); visFnKey = k; }
  return visFn;
}
const occIn = (a, b) => {
  let base = occBetween(state.events, a, b);
  base = base.filter(duoVisible()); // 非表示のカテゴリ・オフのカレンダーへ追加した写しは表示から隠す（予定は消さない）
  const x = visExt();
  return x.length ? base.concat(extIn(x, a, b)) : base;
};
// 通知の印。Duo が鳴らす通知を持つ予定だけ（Web・全体オフ・iPhone 由来・iPhone と結びついた予定は出さない）。
const duoNotifies = (e) => !isX(e) && !['linked', 'pending'].includes(e.nativeLink?.state);
// Duo が鳴らす通知を持つ（回ごとの個別変更を含む）。許可の要求の判断に使う。
const hasDuoAlarms = (e) => duoNotifies(e) && ((Array.isArray(e.alarms) && e.alarms.length > 0) || Object.values(e.overrides || {}).some((o) => Array.isArray(o?.alarms) && o.alarms.length > 0));
const hasBell = (e) => NATIVE && duoNotifies(e) && Array.isArray(e.alarms) && e.alarms.length > 0 && loadNotify().enabled;
const alLabel = (e) => (hasBell(e) ? ` ${alarmsAria(e.alarms)}` : '');
const BELL = '<svg class="bell" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M6 1.2a.7.7 0 0 1 .7.7v.35A3.3 3.3 0 0 1 9.3 5.5v1.7l.9 1.1v.6H1.8v-.6l.9-1.1V5.5a3.3 3.3 0 0 1 2.6-3.25V1.9A.7.7 0 0 1 6 1.2zM4.8 10h2.4a1.2 1.2 0 0 1-2.4 0z" fill="currentColor"/></svg>';
const bell = (e) => (hasBell(e) ? BELL : '');
const rep = (e) => (e.recurring ? '<span class="rep" aria-hidden="true">↻</span>' : '');
const repLabel = (e, t) => (e.recurring || isX(e) || alLabel(e) ? ` aria-label="${esc(`${xname(e)}${t}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"` : '');
const addBtn = '<footer class="foot"><button type="button" class="add" data-act="add">＋ 予定を追加</button></footer>';
const legend = () => `<div class="legend" aria-label="カテゴリ凡例">${state.categories.filter((c) => !c.hidden).map((c) => `<span style="--cat:${c.color}">${esc(c.name)}</span>`).join('')}</div>`;
const xlegend = () => (extActive() ? '<div class="xlegend small">▦ iPhoneの予定（カレンダーの色）</div>' : '');

function periodTitle() {
  const d = parseKey(state.selected);
  if (viewNow() === 'month') return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
  if (viewNow() === 'week') {
    const s = parseKey(weekStart(state.selected)), e = parseKey(addDays(weekStart(state.selected), 6));
    return `${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`;
  }
  return dayLabel(state.selected);
}
// 六曜（表示のみ）。日付の文字列 k のまま引く（Date を通さない）。オフ・範囲外・不正は null → 要素ごと出さない。
const rkOf = (k) => (state.rokuyo ? rokuyoOf(k) : null);
const rkSpan = (k, cls) => { const r = rkOf(k); return r ? `<span class="${cls}" aria-hidden="true">${r.name}</span>` : ''; };
// 祝日（内蔵表）。名前は設定に関わらず出し、赤は「祝日を赤で表示」がオンのときだけ。日曜の赤は設定に関わらず常に出す。
const holName = (k) => holidayOf(k);
const isRed = (k) => parseKey(k).getDay() === 0 || (state.holidayRed && !!holidayOf(k));
const holSpan = (k) => { const n = holName(k); return n ? `<span class="hnm" aria-hidden="true">${esc(n)}</span>` : ''; };
const holSpoken = (k) => { const n = holName(k); return n ? `、祝日、${n}` : ''; };
const dayTitle = (k) => `<span class="hdt${isRed(k) ? ' hol' : ''}">${dayLabel(k)}</span>${holSpan(k)}${rkSpan(k, holName(k) ? 'hrk hx' : 'hrk')}`; // 日の見出し（日付、祝日名、六曜。狭幅は六曜を省く）
const unit = () => ({ month: '月', week: '週', day: '日' }[viewNow()]);
const navBtn = (dir) => `<button type="button" data-act="${dir > 0 ? 'next' : 'prev'}" aria-label="${dir > 0 ? '次' : '前'}の${unit()}">${dir > 0 ? '›' : '‹'}</button>`;
const arrows = () => `<div class="arrows">${navBtn(-1)}${navBtn(1)}</div>`;
// 月の表現: 手帳（点）｜予定名｜全部。「全部」は monthExpand、手帳・予定名は style に対応する。入口は設定メニューの「月の表現」。
// 開いた縦の月は常に予定名の表示なので、「手帳」は出さない（予定名｜全部）。
const monthMode = (kind) => (state.monthExpand ? 'all' : kind === 'portrait' ? 'named' : state.style);
const variantBtns = (kind) => [['simple', '手帳'], ['named', '予定名'], ['all', '全部']].filter(([v]) => !(kind === 'portrait' && v === 'simple')).map(([v, l]) => `<button type="button" data-mode="${v}" aria-pressed="${monthMode(kind) === v}">${l}</button>`).join('');
// 期間の見出し（前の期間｜見出し｜次の期間）
// 月見出し付近の「全部」ボタン: 1タップで 全部 ⇔ 通常（直前の手帳／予定名）。押せる範囲は 44pt 角（見た目は小さい）。
const allBtn = (cls = 'allbtn', st = '') => `<button type="button" class="${cls}" data-act="allmonth" aria-pressed="${state.monthExpand}" aria-label="${state.monthExpand ? '通常の予定表示に戻す' : '全部の予定を表示'}"${st}><span aria-hidden="true">全</span></button>`;
// 見出し: 閉じた画面（帯あり）は 前・題名・次 のみ（全は帯）。帯なし／開いた縦は 全 も見出しに置く。
const chead = () => {
  if (PS.on && monthAll()) return `<div class="chead pasting">${pasteBand()}</div>`;
  const inBand = POS.post === 'closed' && POS.band;
  const month = state.view === 'month';
  return `<div class="chead">${inBand && month ? '<span class="chsp" aria-hidden="true"></span>' : ''}${navBtn(-1)}<h2 id="ctitle">${periodTitle()}${state.view === 'day' ? rkSpan(state.selected, 'hrk') : ''}</h2>${navBtn(1)}${state.view === 'month' ? allBtn() : ''}</div>`;
};

function card(e) {
  const sub = [e.place ? esc(e.place) : '', isMulti(e) ? `${e.start.slice(5, 10).replace('-', '/')} 〜 ${e.end.slice(5, 10).replace('-', '/')}` : '', e.nativeLink?.state === 'linked' ? 'iPhoneにも追加済み' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="event ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}"${repLabel(e, `${timeLabel(e)} ${e.title}`)}><span class="clock">${timeLabel(e)}${bell(e)}</span><span class="tag">${esc(tagText(e))}</span><strong>${rep(e)}${esc(e.title)}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
}
const sampleBtn = () => (state.loaded && state.events.length === 0 ? '<button type="button" class="ghost" data-act="sample">サンプルを入れる</button>' : '');
function dayList(k) {
  const list = eventsOnDay(occIn(k, k), k);
  if (list.length) return list.map(card).join('');
  return `<div class="empty"><p>予定のない、余白の一日。</p><button type="button" class="ghost" data-new="${k}">＋ この日に追加</button> ${sampleBtn()}</div>`;
}
function agenda(k) {
  const n = eventsOnDay(occIn(k, k), k).length;
  return `<section class="agenda" aria-label="選択日の予定"><div class="eyebrow">選択日の予定</div><h3>${dayTitle(k)}</h3><div class="count small">${n}件の予定</div><div class="list" data-scroll="agenda">${dayList(k)}</div></section>`;
}

// ---------- 月（手帳｜予定名｜全部 共通の週描画） ----------
// 日付行18・最初のレーン19・16px刻み・チップ14px・下余白2（CSS の --date-h/--lane-top/--lane-step/--chip-h と同値）。
const LANE_TOP = 19, LANE_STEP = 16, LANE_PAD = 2;
const xCount = (es) => { const n = es.filter(isX).length; return n ? `（うちiPhone ${n}件）` : ''; };
const weekdaysHtml = (cls = '') => `<button type="button" class="mrpick" data-act="pickrange">期間を選ぶ</button><div class="weekdays${cls}">${weekdayHeads().map(({ i, label }) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${label}</span>`).join('')}</div>`;
// 姿勢ごとの月の設定。kind は calendar(kind) の姿勢名（browse=閉じた／portrait=開いた縦／spread・desk・open=横）。
// 通常の段数: 閉4／開5（大文字は1件減）。「全部」は全姿勢5段（大文字は4段）。時刻は姿勢ごとの設定。
function monthCfg(kind) {
  const closed = kind === 'browse' || kind === 'home', large = state.monthTextSize === 'large';
  if (kind === 'spread' && spreadWeekH > 0) {
    // 開いた横: 6週は4段、5/4週は5段（大文字は1件減）。さらに1週の高さに描画が収まる段数（最終レーン上端＋チップ14）まで下げる。
    const n = monthWeeks(state.selected).length, nominal = (n >= 6 ? 4 : 5) - (large ? 1 : 0);
    const fit = Math.max(1, Math.floor((spreadWeekH - LANE_TOP - 14) / LANE_STEP) + 1);
    const cap = Math.min(nominal, fit);
    return { cap, allCap: large ? 4 : 5, time: state.monthTimeOpen };
  }
  if (kind === 'portrait' && portraitWeekH > 0) {
    // 下パネル表示中の縦: 6/5週は3段、4週は5段（大文字は1件減）。1週の高さに収まる段数まで下げ、あふれは +N。
    const n = monthWeeks(state.selected).length, nominal = (n >= 6 ? 3 : n === 5 ? 3 : 5) - (large ? 1 : 0);
    const fit = Math.max(1, Math.floor((portraitWeekH - LANE_TOP - 14) / LANE_STEP) + 1);
    return { cap: Math.min(nominal, fit), allCap: large ? 4 : 5, time: state.monthTimeOpen };
  }
  return { cap: (closed ? 4 : 5) - (large ? 1 : 0), allCap: large ? 4 : 5, time: closed ? state.monthTimeClosed : state.monthTimeOpen };
}
// 月の週の元データ（イベント・レーン配置）。cap 段まで置き、あふれは hidden（+N）。
function weekData(days, cap) {
  const wev = occIn(days[0], days[6]);
  const { items, hidden, used } = assignSharedLanes(wev, days, cap);
  return { days, wev, items, hidden, used };
}
const needOf = (used) => LANE_TOP + used * LANE_STEP + LANE_PAD;
// 貼付の見本（PR34）。選んだ各日から始まる帯／チップを、その週の空きレーンへ薄く描く。DB・予定一覧には入らない（描画だけ）。
function pasteGhosts(w, cap) {
  if (!PS.on || !PS.days.length || !PS.src) return [];
  const n = spanOf(PS.src), days = w.days, occ = Array.from({ length: cap }, () => Array(7).fill(false)), out = [];
  for (const b of w.items || []) if (b.lane < cap) for (let i = b.sc; i <= b.ec; i++) occ[b.lane][i] = true;
  const d0 = parseKey(days[0]);
  for (const d of PS.days) {
    const off = Math.round((parseKey(d) - d0) / 864e5), sc = Math.max(0, off), ec = Math.min(6, off + n - 1);
    if (ec < 0 || sc > 6) continue;
    const lane = occ.findIndex((row) => row.slice(sc, ec + 1).every((v) => !v));
    if (lane < 0) continue; // 空きがなければ見本は出さない（貼付そのものには影響しない）
    for (let i = sc; i <= ec; i++) occ[lane][i] = true;
    out.push({ sc, ec, lane, first: off >= 0, last: off + n - 1 <= 6, n, day: d });
  }
  return out;
}
function pasteGhostHtml(w, cap) {
  const gs = pasteGhosts(w, cap);
  if (!gs.length) return '';
  const s = PS.src, v = s.origin === 'iphone' ? `--cat:${s.color || '#68716A'};` : catVar(s);
  return gs.map((g) => {
    const t = clipTitle(s.title), time = !s.all && g.n === 1 ? `${s.start.slice(11, 16)} ` : '';
    const label = !g.first ? `${t}（つづき）` : g.n > 1 ? `${t} ${g.n}日` : `${time}${t}`;
    return `<span class="pghost${g.n > 1 ? ' pband2' : ''}${g.first ? '' : ' cont'}${g.last ? '' : ' more'}" aria-hidden="true" data-pghost="${g.day}" style="${v}${colPos(g.sc, g.ec)};top:${LANE_TOP + g.lane * LANE_STEP}px">${esc(label)}</span>`;
  }).join('');
}
const colPos = (sc, ec) => `left:calc(${sc} * 100% / 7 + 1.5px);width:calc(${ec - sc + 1} * 100% / 7 - 3px)`;
// 週の中身: 日セル（button）・+N（兄弟 button）・帯／チップ（兄弟 button）。ボタンの入れ子は作らない。
// mode: simple（点）| named | all。
function weekInner(w, { mode, cur, sel, today, cap, time, tk = null }) {
  const { days, wev, items, hidden } = w;
  let html = '';
  days.forEach((k, col) => {
    const es = eventsOnDay(wev, k), d = parseKey(k), dow = d.getDay();
    const r = rkOf(k), label = d.getDate() === 1 ? (state.rokuyo ? `${d.getMonth() + 1}/1` : `${d.getMonth() + 1}月1日`) : d.getDate(); // 六曜オンの1日は「11/1」（左の六曜とぶつかるため）
    const tn = tk?.get(k) || 0; // 月にタスクの件数（開いた画面だけ。タスク名は出さない）
    const dots = mode === 'simple' ? `<span class="dots">${es.slice(0, cap).map((e) => `<i class="dot ${catCls(e)}"${catSty(e)}></i>`).join('')}</span>` : '';
    const ps = PS.on ? PS.days.includes(k) : false, pSrc = PS.on && k === PS.srcDay;
    html += `<button type="button" class="day${d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}${dow === 6 ? ' sat' : dow === 0 ? ' sun' : ''}${state.holidayRed && holName(k) ? ' hol' : ''}${ps ? ' psel' : ''}${pSrc ? ' psrc' : ''}" data-date="${k}" aria-label="${dayLabel(k)}${holSpoken(k)}${r ? `、${r.name}` : ''}、予定${es.length}件${xCount(es)}${tn ? `、未完了のタスク${tn}件` : ''}${PS.on ? `${pSrc ? '、コピー元' : ''}、${ps ? '選択中。この日を外す' : 'この日を選ぶ'}` : ''}" aria-pressed="${PS.on ? ps : k === sel}">${pSrc ? '<span class="pcsrc" aria-hidden="true">コピー元</span>' : ''}${ps ? '<i class="pck" aria-hidden="true">✓</i>' : ''}${r ? `<span class="rk" aria-hidden="true">${r.name}</span>` : ''}<span class="num${state.rokuyo && d.getDate() === 1 ? ' sd' : ''}">${label}</span>${memoMark(k)}${tn ? `<span class="tkn" aria-hidden="true">✓${tn}</span>` : ''}${dots}</button>`;
    const extra = mode === 'simple' ? es.length - cap : hidden[col];
    if (extra > 0) html += `<button type="button" class="plus" data-jump="${k}" style="right:calc(${6 - col} * 100% / 7)" aria-label="${dayLabel(k)}の予定をすべて見る（ほか${extra}件）">+${extra}</button>`;
  });
  if (mode === 'simple') return html;
  html += pasteGhostHtml(w, cap);
  for (const b of items) {
    const { e } = b, top = `top:${LANE_TOP + b.lane * LANE_STEP}px`;
    if (b.band) {
      const when = dayOf(e.start) === dayOf(e.end) ? `${dayLabel(dayOf(e.start))} 終日` : `${dayOf(e.start)}から${dayOf(e.end)}`;
      html += `<button type="button" class="bar ${catCls(e)}" data-event="${esc(e.id)}" style="${catVar(e)}left:calc(${b.sc} * 100% / 7);width:calc(${b.ec - b.sc + 1} * 100% / 7);${top}" aria-label="${esc(`${xname(e)}${e.title} ${when}${e.recurring ? ' 繰り返し' : ''}`)}"><span class="bt">${esc(e.title)}</span></button>`;
    } else {
      const k = days[b.sc];
      html += `<button type="button" class="strip ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}${colPos(b.sc, b.ec)};${top}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}`)}">${time ? `${chipTime(e.start)} ` : ''}${esc(e.title)}</button>`;
    }
  }
  return html;
}
function monthGrid(kind) {
  const sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth();
  const mode = kind === 'portrait' ? 'named' : state.style, cfg = monthCfg(kind), tk = monthTaskCounts(kind);
  let html = '';
  for (const days of monthWeeks(sel)) {
    const w = mode === 'simple' ? { days, wev: occIn(days[0], days[6]), items: [], hidden: [] } : weekData(days, cfg.cap);
    html += `<div class="week ${mode}" style="--need:${mode === 'simple' ? 56 : needOf(cfg.cap)}px">${weekInner(w, { mode, cur, sel, today, cap: cfg.cap, time: cfg.time, tk })}</div>`;
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
  allCtx = { mode: 'all', cap: cfg.allCap, time: cfg.time, tk: monthTaskCounts(kind) };
  let rows = '';
  for (const days of weeks) {
    const w = weekData(days, cfg.allCap);
    allWeeks.set(days[0], w);
    const gl = pasteGhosts(w, cfg.allCap).reduce((m, g) => Math.max(m, g.lane + 1), 0);
    rows += `<div class="week all" data-wk="${days[0]}" style="--need:${needOf(Math.max(w.used, gl))}px"></div>`;
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
    if (want && !r.dataset.drawn) { r.innerHTML = weekInner(allWeeks.get(r.dataset.wk), { ...allCtx, cur, sel, today }); r.dataset.drawn = '1'; if (PS.on) applyPasteInert(); }
    else if (!want && r.dataset.drawn) { r.textContent = ''; delete r.dataset.drawn; }
  });
  paintRange();
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
  return `<button type="button" class="event week-event ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><span class="clock">${e.all || (vlist && isMulti(e)) ? '終日' : e.start.slice(11)}${bell(e)}</span><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
}
function weekRow(k, short, vlist = false) {
  const list = eventsOnDay(occIn(k, k), k), d = parseKey(k);
  const head = `<span class="wdt${isRed(k) ? ' hol' : ''}">${short ? `${d.getDate()}（${DOW[d.getDay()]}）` : dayLabel(k)}</span>${holName(k) ? `<span class="wrk whn" aria-hidden="true">${esc(holName(k))}</span>` : ''}${rkSpan(k, 'wrk')}`;
  const body = list.map((e) => weekEvent(e, k, vlist)).join('') || '<div class="empty-row">予定なし</div>';
  return `<section class="weekrow${k === todayKey() ? ' today' : ''}${k === state.selected ? ' selected' : ''}"><button type="button" class="wd" data-jump="${k}" aria-label="${dayLabel(k)}${holSpoken(k)}を日表示で開く">${head}</button>${vlist ? `<div class="wevents">${body}</div>` : body}</section>`;
}
const weekNotes = '<div class="weeknotes"><div class="eyebrow">今週の余白</div>日付から一日の詳細へ。予定を選ぶと全文を確認できます。</div>';

// 閉じた日・週: 空き時刻を選べる時間軸（日1列／週7列。狭幅は横スクロールで列幅 CLOSED_COL を確保）。
const CLOSED_COL = 52;
function closedTimeBody() {
  const ks = viewNow() === 'week' ? weekKeys() : [state.selected];
  const empty = state.loaded && state.events.length === 0 ? `<div class="tlempty">${sampleBtn()}</div>` : '';
  const inner = timelineHtml(ks, Math.max(CLOSED_COL * ks.length, safeW() - 8) - 50, 'closed');
  return `${empty}<div class="tlx"><div class="tlw" style="min-width:${50 + ks.length * CLOSED_COL}px">${inner}</div></div>`;
}
function calendarBody(kind) {
  if (kind === 'browse' && viewNow() !== 'month') return closedTimeBody();
  if (viewNow() === 'month') return state.monthExpand ? monthGridAll(kind) : `${weekdaysHtml()}<div class="scroll msc" data-scroll="cal">${monthGrid(kind)}</div>`;
  if (viewNow() === 'week') {
    const cols = kind === 'open' || kind === 'desk';
    const vlist = kind === 'portrait';
    return `<div class="scroll" data-scroll="cal"><div class="weekview${cols ? ' cols' : ''}${vlist ? ' vlist' : ''}">${weekKeys().map((k) => weekRow(k, cols || vlist, vlist)).join('')}</div></div>`;
  }
  return `<div class="scroll" data-scroll="cal"><div class="daylist">${dayList(state.selected)}</div></div>`;
}
const calendar = (kind) => `<section class="calendar" aria-label="カレンダー">${chead()}${calendarBody(kind)}</section>`;

// ホーム（今日のカード）。第16版 PR14・design/14 案A。選択日と独立して今日固定。
// mode: 'cards'＝閉じた画面・縦の一覧（縦に重ねる）、'axis'＝開いた横（今日の予定は9〜19時の小さな時間軸）、'cols'＝開いた縦の下段（3列）。
const homeTaskList = () => (!RM.data ? null : RM.data.reminders.filter((x) => !delCtl.has(x.itemId)));
const homeGo = (to, label, cls = '') => `<button type="button" class="hgo${cls}" data-act="homego" data-to="${to}" aria-label="${esc(label)}">${esc(label.replace(/を開く$/, ''))} ›</button>`;
function homeEventRow(e) {
  return `<button type="button" class="hrow event-row ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}"${repLabel(e, `${timeLabel(e)} ${e.title}`)}><span class="ht">${e.all ? '終日' : e.start.slice(11)}${bell(e)}</span><i class="hbar" aria-hidden="true"></i><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
}
function homeAxis(list, now, k) {
  const A = axisBars(list, now, k), hrs = Array.from({ length: 11 }, (_, i) => 9 + i);
  const bars = A.bars.map((b) => { const e = list.find((x) => x.id === b.id); return `<button type="button" class="hbarev ${catCls(e)}${b.past ? ' past' : ''}" style="${catVar(e)}top:${b.top}px;height:${b.height}px" data-act="homego" data-to="time" data-hm="${esc(b.start.slice(11))}" aria-label="${esc(`${timeLabel(e)} ${e.title}をタイムラインで開く`)}"><span>${esc(e.title)}</span></button>`; }).join('');
  return `<div class="haxis" style="height:${A.height}px">${hrs.map((h) => `<span class="hh" style="top:${(h - 9) * 14}px">${h}</span>`).join('')}<div class="hbars">${bars}${A.nowTop === null ? '' : `<i class="hnow" style="top:${A.nowTop}px" aria-hidden="true"></i>`}</div></div>`;
}
function homeTasksCard() {
  const all = homeTaskList(), today = todayKey();
  if (!all) return `<section class="hcard htasks" aria-label="タスク"><div class="hh3"><h3>タスク</h3>${homeGo('task', 'すべて')}</div><p class="small hempty">タスクはタスクのページで見られます。</p></section>`;
  const T = homeTasks(all, today, doneCtl.pending());
  const rows = T.items.map((r) => {
    const done = doneCtl.pending().get(r.itemId) === true, du = dueText(r.due, today), od = r.due.date < today;
    return `<div class="htask${done ? ' done' : ''}"><button type="button" class="rmckb" data-act="remck" data-id="${esc(r.itemId)}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}：${esc(r.title || '')}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button><span class="htt">${esc(r.title || '')}</span>${du ? `<small class="hdue${od ? ' od' : ''}">${esc(du)}</small>` : ''}</div>`;
  }).join('');
  return `<section class="hcard htasks" aria-label="タスク"><div class="hh3"><h3>タスク ${T.total}件</h3>${homeGo('task', 'すべて')}</div>${rows || '<p class="small hempty">今日のタスクはありません</p>'}<button type="button" class="hadd" data-act="homego" data-to="taskadd">＋ タスクを追加</button></section>`;
}
function homeMemoCard() {
  const k = todayKey(), e = memoStore.get(k), ls = e?.loaded ? firstLines(e.text, 2) : [];
  return `<section class="hcard hmemo" aria-label="今日のメモ"><div class="hh3"><h3>今日のメモ</h3>${homeGo('memolist', 'メモ一覧')}</div><button type="button" class="hmemob" data-act="homego" data-to="memo" data-memo-today="${k}" aria-label="今日のメモを開く">${ls.length ? ls.map((l) => `<span>${esc(l)}</span>`).join('') : '<span class="hempty">たたいて今日のメモを書く</span>'}</button></section>`;
}
function listHtml(mode = 'cards') {
  const now = nowStamp(), k = todayKey(), d = parseKey(k), tm = addDays(k, 1);
  const list = eventsOnDay(occIn(k, k), k).filter((e) => e.end > now);
  // 今日にもう予定がなければ、未来の回も含めて日付順に次の予定を探す。
  const future = list.length ? null : occIn(addDays(k, 1), addDays(k, 400)).sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)))[0];
  const { next, shown, more, count } = splitEvents(list, future);
  const nextDay = next && dayOf(next.start) !== k ? `<small class="nd">${dayLabel(dayOf(next.start))}</small> ` : '';
  const nextHtml = next
    ? `<button type="button" class="next ${catCls(next)}"${catSty(next)} data-event="${esc(next.id)}"${repLabel(next, `次の予定 ${next.title}`)}><small>次の予定 · ${esc(tagText(next))}</small><strong>${xi(next)}${rep(next)}${esc(next.title)}</strong><span class="when"><span class="time">${nextDay}${next.all ? '終日' : next.start.slice(11)}</span>${next.all || dayOf(next.start) !== dayOf(next.end) ? '' : ` — ${next.end.slice(11)}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}${nextBell(next)}</span></button>`
    : `<div class="next none"><small>次の予定</small><strong>${extActive() ? '読み込み済みの期間に次の予定はありません。' : state.events.length ? 'この後の予定はありません' : '予定はまだありません'}</strong>${sampleBtn()}</div>`;
  const hero = `<section class="hero"><div class="date-block"><div class="eyebrow">今日 / ${d.getFullYear()}年${d.getMonth() + 1}月</div><div class="date">${d.getDate()}<span>${DOW[d.getDay()]}曜日</span></div></div>${nextHtml}</section>`;
  const body = mode === 'axis' ? homeAxis(list, now, k) : shown.map(homeEventRow).join('');
  const evCard = `<section class="hcard hevents" aria-label="今日の予定"><div class="hh3"><h3>今日の予定 ${count}件</h3>${homeGo('time', 'タイムライン')}</div>${body || '<p class="small hempty">この後の予定はありません</p>'}${mode !== 'axis' && more ? `<button type="button" class="hmore" data-act="homego" data-to="time">ほか${more}件</button>` : ''}</section>`;
  const tl = tomorrowSummary(eventsOnDay(occIn(tm, tm), tm)), td = parseKey(tm);
  const tmCard = `<button type="button" class="hcard htmr" data-act="homego" data-to="tomorrow" aria-label="明日の予定を開く"><b>明日 ${td.getMonth() + 1}/${td.getDate()}（${DOW[td.getDay()]}）</b> <small>${tl.count}件</small>${tl.first ? `<span>${tl.first.all ? '終日' : tl.first.start.slice(11)} ${esc(tl.first.title)}${tl.more ? `　ほか${tl.more}件` : ''}</span>` : '<span class="hempty">予定はありません</span>'}</button>`;
  if (mode === 'cols') return `<div class="hcols"><div class="hcol">${nextHtml}</div><div class="hcol">${homeTasksCard()}</div><div class="hcol">${homeMemoCard()}</div></div>`;
  const eve = eveningFirst(now);
  return `${hero}<div class="hcards">${eve ? tmCard : ''}${evCard}${homeTasksCard()}${homeMemoCard()}${eve ? '' : tmCard}</div>`;
}
// 閉じた一覧の「次の予定」の時刻行に、次に鳴る通知の時刻を添える。
function nextBell(e) {
  if (!hasBell(e)) return '';
  const t = nextNotifyText(e, new Date());
  return t ? ` <small class="nb">${BELL}${esc(t)} に通知</small>` : '';
}
const listView = (mode = 'cards') => `<div class="home listview hm-${mode}" aria-label="ホーム">${listHtml(mode)}</div>`;
// 閉じた画面（一覧 = home / 日・週・月 = browse）: 本文は safe の内側いっぱい。操作は帯（右 safe）または見出し・下段。
function closed(kind) {
  const body = state.strip ? stripPage(state.strip) : kind === 'home' ? listView() : calendar('browse');
  return `<div class="shell closed ${kind}${POS.band ? ' band' : ' fb'}${state.strip ? ' strp' : ''}"><div class="mpane">${body}</div>${ctl()}${tabs()}</div>`;
}
// 閉じた画面で右の帯のタスク／メモを開いたときの全面ページ。下のタブはどれも選ばれず、帯の同じ丸かタブで戻る。
function stripPage(id) {
  const t = id === 'memo' ? `メモ <small>${esc(dayLabel(state.selected))}</small>` : 'タスク';
  return `<section class="page stripp" data-page="${id}" aria-label="${PAGE_NAMES[id]}"><div class="sph"><h2>${t}</h2></div>${id === 'memo' ? memoBody('closed') : taskBody('closed')}</section>`;
}
// 開いた縦: 全幅の月（下に予定一覧は置かない）。見出し（設定・前・題名・次・全・検索）は上 safe の帯の中、下に 今日・タブ・＋。
function open() {
  return `<div class="shell open portrait"><div class="pcol">${listShown() ? listView() : calendar('portrait')}</div><div class="hline" aria-hidden="true"></div>${panelOn() ? bottomPanel() : panelAvail() ? '<div class="pgrab" data-grab="1" aria-hidden="true"></div>' : ''}${ctl()}${tabs()}</div>`;
}
// ---------- 開いた縦の下パネル（上は月、下は 時間｜タスク｜メモ） ----------
const PN = { expand: false, swallow: 0 }; // expand: メモ入力中にマスの上端まで広げる（口だけ。入力は後続の版）
const BOTTOM_LABELS = { home: 'ホーム', time: '時間', task: 'タスク', memo: 'メモ' };
function bottomBody(id) {
  if (id === 'time') return timelineHtml(tlKeys(1), Math.max(0, safeW() - 40 * POS.ux - 50), 'bottom');
  if (id === 'home') return listView('cols');
  if (id === 'memo') return memoBody('bottom');
  return taskBody('bottom');
}
const safeW = () => L.w - safe().left - safe().right;
function bottomPanel() {
  const id = state.pages.portraitBottom;
  const sw = Object.keys(BOTTOM_LABELS).map((k, i) => `<button type="button" data-pnl="${k}" aria-pressed="${k === id}" aria-description="${Object.keys(BOTTOM_LABELS).length}個中${i + 1}番目"><span class="pill">${BOTTOM_LABELS[k]}</span></button>`).join('');
  return `<section class="pnl${PN.expand ? ' up' : ''}" data-panel="${id}" aria-label="下の段">
    <button type="button" class="pgrip" data-act="pnlgrip" aria-label="下の段を隠す"><i aria-hidden="true"></i></button>
    <h3 class="pdate">${dayTitle(state.selected)}</h3>
    <div class="pswitch" role="group" aria-label="下の段の種類">${sw}</div>
    <button type="button" class="pclose" data-act="pnlhide" aria-label="下の段を隠す"><span aria-hidden="true">×</span></button>
    <div class="pbody2">${bottomBody(id)}</div>
  </section>`;
}
// 下の段の出し入れ（0.25秒。マスの高さ・パネルの出入りを動かす。表示状態は pages に保存）。
function animatePanel(old, leaving) {
  if (reduced()) return;
  const names = ['--grid-h', '--week-h'], nw = names.map((n) => de.style.getPropertyValue(n));
  names.forEach((n, i) => de.style.setProperty(n, old[i]));
  de.classList.add('pnl-anim'); void de.offsetHeight;
  names.forEach((n, i) => de.style.setProperty(n, nw[i]));
  const pnl = root.querySelector('.pnl');
  if (pnl) { pnl.style.transition = 'none'; pnl.classList.add('enter'); void pnl.offsetHeight; pnl.style.transition = ''; pnl.classList.remove('enter'); }
  if (leaving) {
    leaving.classList.add('leave'); leaving.setAttribute('aria-hidden', 'true'); leaving.inert = true;
    root.querySelector('.shell')?.appendChild(leaving); void leaving.offsetHeight; leaving.classList.add('go');
  }
  setTimeout(() => { de.classList.remove('pnl-anim'); leaving?.remove(); }, 280);
}
function setPanel(shown, from) {
  if (state.pages.portraitShown === shown || !panelAvail()) return;
  const old = ['--grid-h', '--week-h'].map((n) => de.style.getPropertyValue(n));
  const leaving = shown ? null : root.querySelector('.pnl')?.cloneNode(true);
  PN.expand = false;
  set({ pages: { ...state.pages, portraitShown: shown } });
  animatePanel(old, leaving);
  root.querySelector(`[data-act="${from || 'pnltoggle'}"]`)?.focus({ preventScroll: true });
  say(shown ? '下の段を表示しました。' : '下の段を隠しました。');
}
function pickBottom(id) {
  set({ pages: selectPage(state.pages, 'portraitBottom', id) });
  root.querySelector(`[data-pnl="${id}"]`)?.focus({ preventScroll: true });
  say(`下の段を${BOTTOM_LABELS[id]}にしました。`);
}
// メモ入力中の拡大口: 下の段をマスの上端（y106）まで広げる。再描画せず class だけ切り替える（入力欄のフォーカスを保つ）。
function setPanelExpand(on) { PN.expand = on; root.querySelector('.pnl')?.classList.toggle('up', on); }
root.addEventListener('focusin', (ev) => { if (ev.target.closest?.('.pnl') && ev.target.matches('textarea, [contenteditable=true]')) setPanelExpand(true); });
root.addEventListener('focusout', (ev) => { if (!rendering && ev.target.closest?.('.pnl') && ev.target.matches('textarea, [contenteditable=true]')) setPanelExpand(false); });
// つまみを下へ引く＝しまう／マスの下端から上へ引く＝出す。8px以内は押しただけ（つまみは click、下端は下のマスへ通す）。
let pg = null;
root.addEventListener('pointerdown', (ev) => {
  const g = ev.target.closest?.('.pgrip, .pgrab');
  if (!g || !ev.isPrimary) return;
  pg = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, grab: g.classList.contains('pgrab') };
});
window.addEventListener('pointerup', (ev) => {
  if (!pg || ev.pointerId !== pg.id) return;
  const { x, y, grab } = pg, dy = ev.clientY - y; pg = null;
  if (Math.abs(dy) > 8 || Math.abs(ev.clientX - x) > 8) {
    PN.swallow = performance.now() + 400;
    if (grab ? dy < -40 : dy > 40) setPanel(grab);
  } else if (grab) {
    const el = document.elementsFromPoint(ev.clientX, ev.clientY).find((e) => !e.closest('.pgrab'));
    el?.closest('button')?.click();
  }
});
window.addEventListener('pointercancel', () => { pg = null; });
function desk() {
  return `<div class="shell desk"><div class="desktop"><header class="top">${brand}<div class="toolbar">${todayBtn}</div></header>${listShown() ? listView() : calendar('desk')}${tabs()}</div>
    <div class="foldband" role="separator" aria-label="折り目の保護領域">折り目の保護領域</div>
    <div class="deskbottom">${agenda(state.selected)}${addBtn}</div></div>`;
}
// ---------- 見開き（開いた横）: 左ページ＝月／一覧／日の時間軸／週の前半、右ページ＝時間軸／日の詳細／週の後半 ----------
// 折り目（ビューポート中心 ±10px）には何も置かない。左右ページは中心±10 で clip し、背景は中心で直接接続する。
// 時間軸の状態はペイン（左 / 右）ごと: 1時間の高さ(px)・1日/3日・初期スクロールの判定キー。quiet はピンチ・ドラッグ直後の空きタップ抑止（共通）。
const mkTl = () => ({ hh: 60, key: '' });
const TLP = { left: mkTl(), right: mkTl(), bottom: mkTl(), closed: mkTl() };
const TLQ = { quiet: 0 };
const paneOf = (el) => (['left', 'bottom', 'closed'].includes(el?.dataset?.pane) ? el.dataset.pane : 'right');
const firstTl = () => root.querySelector('.tl');
const HH_MIN = 31, HH_MAX = 80, TL_PAD = 12;
const clampHh = (n) => Math.min(HH_MAX, Math.max(HH_MIN, n));
const minOf = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const tlKeys = (days) => Array.from({ length: days }, (_, i) => addDays(state.selected, i));
const PAGE_NAMES = { task: 'タスク', memo: 'メモ' };
function sheadTitle() {
  if (viewNow() !== 'month' || listShown()) return `${periodTitle()}${viewNow() === 'day' && !listShown() ? rkSpan(state.selected, 'hrk') : ''}`;
  const d = parseKey(state.selected);
  return `<span class="yr">${d.getFullYear()}年</span> ${d.getMonth() + 1}月`;
}
// 左ページ見出し: 年（薄色）月 ｜ 全（月のみ）・前・次（44角）。帯がないときは設定もここ。
const shead = (side = 'left') => PS.on && PG()[side] === 'month' ? `<div class="shead pasting">${pasteBand()}</div>` : `<div class="shead"><h2 id="ctitle">${sheadTitle()}</h2>${side === 'right' ? rctl() : ''}<div class="sctl">${monthAll() ? allBtn() : ''}${navBtn(-1)}${navBtn(1)}${side === 'left' ? gearBtn() : ''}</div></div>`;
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
  return `<button type="button" class="tlev ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}--m:${s};--d:${en - s};left:calc(${col} * 100% / ${n} + 1px);width:calc(100% / ${n} - 2px)" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${t}${e.recurring ? ' 繰り返し' : ''}${isX(e) ? '' : `、${tagText(e)}`}${e.nativeLink?.state === 'linked' ? '、iPhoneにも追加済み' : ''}${alLabel(e)}`)}"><span class="tt">${sub}${bell(e)}</span>${esc(t)}</button>`;
}
// 終日段: 11px「終日」＋カテゴリの淡色地・本色12px太字のピル。最大3件（3日表示は各日1件）、幅不足なら減らして +N（その日の一覧へ）。
function allDayRow(ks, avail) {
  const cap = ks.length === 1 ? 3 : 1, colW = avail / ks.length;
  const cols = ks.map((k) => {
    const list = eventsOnDay(occIn(k, k), k).filter((e) => e.all);
    let shown = Math.min(cap, list.length);
    const est = (es) => es.reduce((a, e) => a + Math.min(colW, e.title.length * 12 + 26) + 6, 0) + (list.length > es.length ? 40 : 0);
    while (shown > 1 && est(list.slice(0, shown)) > colW) shown--;
    const pills = list.slice(0, shown).map((e) => `<button type="button" class="adpill ${catCls(e)}" data-event="${esc(e.id)}" style="${catVar(e)}" aria-label="${esc(`${xname(e)}${dayLabel(k)} 終日 ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}">${esc(e.title)}</button>`).join('');
    const extra = list.length - shown;
    return `<div class="adcol" data-day="${k}">${pills}${extra > 0 ? `<button type="button" class="adplus" data-jump="${k}" aria-label="${dayLabel(k)}の終日の予定をすべて見る（ほか${extra}件）">+${extra}</button>` : ''}</div>`;
  }).join('');
  return `<div class="allday" aria-label="終日の予定"><span class="adl">終日</span><div class="adcols">${cols}</div></div>`;
}
function timelineHtml(ks, avail, pane = 'right') {
  const heads = ks.length > 1 ? `<div class="tlheads"><span class="tlh0"></span>${ks.map((k) => { const d = parseKey(k); return `<button type="button" class="tlhd${k === state.selected ? ' sel' : ''}${k === todayKey() ? ' today' : ''}" data-tlday="${k}" aria-pressed="${k === state.selected}" aria-label="${dayLabel(k)}を選ぶ">${d.getDate()}（${DOW[d.getDay()]}）${rkSpan(k, 'wrk')}</button>`; }).join('')}</div>` : '';
  let lines = '';
  for (let h = 0; h <= 24; h++) {
    lines += `<i class="hl" style="--m:${h * 60}"></i>`;
    if (h < 24) lines += `<span class="hlab" style="--m:${h * 60}">${h}:00</span><i class="hl half" style="--m:${h * 60 + 30}"></i>`;
  }
  const cols = ks.map((k) => `<div class="tlcol" data-day="${k}">${dayBlocks(k).map((b) => tlBlock(b, k)).join('')}</div>`).join('');
  return `${allDayRow(ks, avail)}${heads}<div class="tl" data-scroll="tl" data-pane="${pane}" style="--hh:${TLP[pane].hh}px"><div class="tlin" data-pane="${pane}" data-days="${ks.join(',')}">${lines}<div class="tlcols">${cols}</div><div class="nowl" hidden><span class="nowt"></span></div></div></div>`;
}
// 右ページの日見出し（11月14日（土））＋ 1日／3日の切替（見た目 60×32・押せる範囲の高さ 44）。帯がないときは 今日・検索・＋ も見出しへ。
const rctl = () => (POS.band ? '' : `<div class="rctl"><button type="button" class="rbtn s44 rtoday" data-act="today" aria-label="今日に戻る"><span aria-hidden="true">${todayLabel()}</span></button><button type="button" class="rbtn s44 rsearch" data-act="search" aria-label="予定を検索">${ICON_SEARCH}</button><button type="button" class="rbtn s44 radd" data-act="add" aria-label="予定を追加"><span aria-hidden="true">＋</span></button></div>`);
const rpad = () => `<div class="rpad">${rctl()}</div>`;
// ---- 見開きの左右ページ: 見出し・時間ページ・切替 ----
const TLM = { open: null }; // 開いている時間カプセルの選択肢（'left' | 'right' | null）
const tmode = (side) => state.timeMode[side];
const tdays = (side) => (tmode(side) === '3' ? 3 : 1);
const tlStep = (side) => (tmode(side) === 'week' ? 7 : 1);
// 時間ページの見出しのカプセル（見た目 60×32・押せる範囲の高さ 44）。たたくと 1日・3日・週・リスト の選択肢（幅 120・1行 44）。
function timeCapsule(side) {
  const m = tmode(side);
  return `<button type="button" class="spanbtn" data-act="tlmenu" data-pane="${side}" aria-haspopup="menu" aria-expanded="${TLM.open === side}" aria-label="時間の表示: ${TIME_LABELS[m]}。変更する"><span aria-hidden="true">${TIME_LABELS[m]} ▾</span></button>`;
}
function timeMenu(side) {
  if (TLM.open !== side) return '';
  return `<div class="tlmenu" role="menu" aria-label="時間の表示" data-pane="${side}">${TIME_MODES.map((m) => `<button type="button" role="menuitemradio" aria-checked="${m === tmode(side)}" data-tlmode="${m}" data-pane="${side}">${TIME_LABELS[m]}</button>`).join('')}</div>`;
}
const gearBtn = () => (POS.band ? '' : `<button type="button" class="sset" data-act="menu" aria-label="設定" aria-haspopup="dialog">${ICON_GEAR}</button>`);
const paneNav = (side, dir) => `<button type="button" data-act="${dir > 0 ? 'next' : 'prev'}" data-pane="${side}" aria-label="${dir > 0 ? '次' : '前'}の${PG()[side] === 'time' && tmode(side) === 'week' ? '週' : '日'}">${dir > 0 ? '›' : '‹'}</button>`;
// 時間・タスク・メモの見出し: 日付（たたくと小さな月）｜（右は 今日・検索・＋）｜（時間のみ）カプセル ｜ 前・次（左右とも）。帯がなければ左は設定もここ。
function dateHead(side, id) {
  return `<div class="rhead dh"><h2 class="rdate"><button type="button" class="datebtn" data-act="mini" data-pane="${side}" aria-haspopup="dialog" aria-expanded="${MM.open === side}" aria-label="日付を選ぶ: ${esc(dayLabel(state.selected))}">${dayTitle(state.selected)}</button></h2>${side === 'right' ? rctl() : ''}${id === 'time' ? timeCapsule(side) : ''}<div class="sctl">${paneNav(side, -1)}${paneNav(side, 1)}${side === 'left' ? gearBtn() : ''}</div></div>`;
}
// 小さな月（幅 280・高さ 260、1マス 40×36）。選んでいる日は共通。六曜は出さない。メモの印は memoMark の差込口。
const MM = { open: null, ym: '' };
// メモがある日の印（日付下の短い線 12×2）。全期間のキーを1回読んで Set で持ち、保存・削除・読み込みで無効化する。
const MK = { set: null, gen: 0, loading: false, failed: false };
const memoDayHas = (k) => !!MK.set && MK.set.has(k);
const memoMark = (k) => (memoDayHas(k) ? '<i class="mline" aria-hidden="true"></i>' : '');
function ensureMarks() {
  if (MK.set || MK.loading || MK.failed) return;
  const g = MK.gen; MK.loading = true;
  db.memoDates('1000-01-01', '9999-12-31').then((ks) => { if (g !== MK.gen) return; MK.set = new Set(ks); MK.loading = false; render(); }, () => { if (g === MK.gen) { MK.loading = false; MK.failed = true; } });
}
function invalidateMarks() { MK.set = null; MK.gen++; MK.loading = false; MK.failed = false; }
function patchMark(k, has) {
  if (MK.set) { if (has === MK.set.has(k)) return; has ? MK.set.add(k) : MK.set.delete(k); } else { invalidateMarks(); ensureMarks(); return; }
  if (k === todayKey()) { const m = root.querySelector('.cmemo'); if (m) { m.classList.toggle('has', has); m.setAttribute('aria-label', has ? 'メモ、今日のメモあり' : 'メモ'); } }
  root.querySelectorAll(`.day[data-date="${k}"], .mmc[data-mmday="${k}"]`).forEach((b) => {
    const i = b.querySelector('.mline');
    if (has && !i) { const n = document.createElement('i'); n.className = 'mline'; n.setAttribute('aria-hidden', 'true'); const dots = b.querySelector('.dots'); b.insertBefore(n, dots); } else if (!has && i) i.remove();
  });
}
function miniMonth(side) {
  if (MM.open !== side) return '';
  const d = parseKey(MM.ym || state.selected);
  const cells = monthWeeks(MM.ym || state.selected).flat().map((k) => {
    const c = parseKey(k), out = c.getMonth() !== d.getMonth();
    return `<button type="button" class="mmc${out ? ' out' : ''}${isRed(k) ? ' hol' : ''}${k === state.selected ? ' sel' : ''}${k === todayKey() ? ' tod' : ''}" data-mmday="${k}" data-pane="${side}" aria-label="${esc(dayLabel(k))}${esc(holSpoken(k))}${k === state.selected ? '、選択中' : ''}" aria-pressed="${k === state.selected}"><span class="n">${c.getDate()}</span>${memoMark(k)}</button>`;
  }).join('');
  return `<div class="mmenu" role="dialog" aria-label="日付を選ぶ" data-pane="${side}" style="width:min(280px,${Math.max(0, paneWidth(side))}px)"><div class="mmh"><button type="button" data-mmnav="-1" data-pane="${side}" aria-label="前の月">‹</button><span class="mmt" aria-live="polite">${d.getFullYear()}年${d.getMonth() + 1}月</span><button type="button" data-mmnav="1" data-pane="${side}" aria-label="次の月">›</button></div><div class="mmg">${cells}</div></div>`;
}
function closeMini(focus = true) {
  if (!MM.open) return;
  const sd = MM.open; MM.open = null; render();
  if (focus) root.querySelector(`[data-act="mini"][data-pane="${sd}"]`)?.focus({ preventScroll: true });
}
const rightWidth = () => Math.max(0, L.w - safe().right - 16 - (L.w / 2 + 10));
const paneWidth = (side) => (side === 'right' ? rightWidth() : Math.max(0, L.w / 2 - 10 - (safe().left + 8)));
// 予定リスト（時間ページの「リスト」）。選択日以降を日ごとの見出し（32）＋予定の行（40）で並べ、予定のない日は飛ばす。
// ホーム（今日の画面）とは別物。窓（日数）は端までスクロールすると先へ広げる。描画だけで保存はしない。
const AGL = { left: 60, right: 60 }, AGL_STEP = 60, AGL_MAX = 3660;
function agendaView(side) {
  const from = state.selected;
  let days = [], n = AGL[side];
  for (;;) { // 窓が短くて画面が埋まらない（スクロールできない）ときは、日の数が足りるまで窓を倍々に広げる
    const to = addDays(from, n - 1), evs = occIn(from, to);
    days = [];
    for (let i = 0; i < n; i++) {
      const k = addDays(from, i), list = eventsOnDay(evs, k);
      if (list.length) days.push(`<section class="agd" data-agday="${k}"><h4 class="agh${isRed(k) ? ' hol' : ''}">${esc(dayLabel(k))}${holSpan(k)}</h4>${list.map((e) => agendaRow(e, k)).join('')}</section>`);
    }
    if (days.length >= 12 || n >= AGL_MAX || !state.loaded) break; // 読み込み前は広げない（空に見えるだけで窓を最大にしない）
    n = Math.min(AGL_MAX, n * 2);
  }
  AGL[side] = n;
  const body = days.join('') || `<p class="smsg agnone">${esc(dayLabel(from))}以降の予定はありません。</p>`;
  return `<div class="scroll agenda-list padb" data-scroll="agl" data-pane="${side}" data-agl="${side}" role="list" aria-label="予定リスト ${esc(dayLabel(from))}から">${body}</div>`;
}
function agendaRow(e, k) {
  const t = e.all || dayOf(e.start) !== k ? '終日' : e.start.slice(11);
  return `<button type="button" class="agrow ${catCls(e)}"${catSty(e)} role="listitem" data-event="${esc(e.id)}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><span class="agt">${t}</span><i class="agbar" aria-hidden="true"></i><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
}
// 端の近くまで来たら先の日を足す（保存しない・iPhone の予定は範囲を取り直す）。
root.addEventListener('scroll', (ev) => {
  const el = ev.target;
  if (!el?.dataset?.agl || el.scrollHeight - el.scrollTop - el.clientHeight > 240) return;
  const side = el.dataset.agl;
  if (AGL[side] >= AGL_MAX) return;
  AGL[side] = Math.min(AGL_MAX, AGL[side] + AGL_STEP);
  syncExt(); render();
}, true);
// 時間ページの中身（1日・3日は時間軸、週とリストはそのペイン内で描く）。
function timeBody(side, w) {
  const m = tmode(side);
  if (m === 'week') return `<div class="scroll weekpage padb" data-scroll="wk" data-pane="${side}">${weekKeys().map((x) => weekRow(x, false)).join('')}</div>`;
  if (m === 'list') return agendaView(side);
  return timelineHtml(tlKeys(tdays(side)), w - 50, side);
}
// ページ id 付きの描画。side＝'left'|'right'、id＝'month'|'time'|'task'|'memo'。
// ---------- 日付メモ（左右ページ・縦の下パネルで同じ日に同じ本文。保存は memos.js） ----------
let homeMemoSig = null, memoComposing = false, renderPending = false, rendering = false;
const memoSaid = new Set(), memoSynced = new Map();
function memoBody(where) {
  const k = state.selected, e = memoStore.get(k);
  if (ML.open[where]) return `${memoTools(where)}${memoListHtml(where)}`;
  return `${memoTools(where)}<div class="memopage padb" data-memo-wrap="${where}"><textarea class="memota" data-memo="${k}" data-where="${where}" aria-label="${esc(dayLabel(k))}のメモ" placeholder="この日のメモ" spellcheck="false"${e?.loaded ? '' : ' readonly'}></textarea><div class="memost" data-memost="${k}">自動で保存</div></div>`;
}
// ---- メモの一覧（メモがある日を新しい順・1行56・検索欄） ----
const ML = { open: { left: false, right: false, bottom: false, closed: false }, q: { left: '', right: '', bottom: '', closed: '' }, rows: null, seq: 0, failed: false };
// 「この日｜一覧」は明示選択（トグルにしない）。今日以外の日は「今日に戻る」、一覧からは「戻る」を出す。
const memoTools = (where) => {
  const o = ML.open[where], seg = (mode, label, aria, on) => `<button type="button" class="mseg" data-act="memolist" data-where="${where}" data-mode="${mode}" aria-pressed="${on}" aria-label="${aria}${on ? '（表示中）' : ''}">${label}</button>`;
  const back = o ? `<button type="button" class="mback" data-act="memolist" data-where="${where}" data-mode="day" aria-label="この日のメモに戻る">戻る</button>`
    : state.selected !== todayKey() ? `<button type="button" class="mback" data-act="today" aria-label="今日に戻る">今日に戻る</button>` : '';
  return `<div class="mtools"><div class="mseggrp" role="group" aria-label="メモの表示">${seg('day', 'この日', 'この日のメモ', !o)}${seg('list', '一覧', 'メモの一覧', o)}</div>${back}</div>`;
};
function memoRowsHtml(where) {
  if (ML.failed) return '<p class="smsg">メモを読み込めませんでした。</p>';
  if (!ML.rows) return '<p class="smsg" role="status">読み込んでいます…</p>';
  const q = ML.q[where], rows = q.trim() ? searchMemos(ML.rows, q) : { items: ML.rows, ts: [] };
  if (!rows.items.length) return `<p class="smsg">${q.trim() ? '該当するメモはありません。' : 'メモはまだありません。'}</p>`;
  return rows.items.map((m) => {
    const first = (m.text.split('\n').find((l) => l.trim()) || '').trim();
    return `<button type="button" class="mrow" data-mrow="${m.date}" aria-label="${esc(dayLabel(m.date))} ${esc(first)}"><b>${esc(m.date.slice(0, 4) === todayKey().slice(0, 4) ? dayLabel(m.date) : `${m.date.slice(0, 4)}年${dayLabel(m.date)}`)}</b><span>${rows.ts.length ? highlight(first, rows.ts, esc) : esc(first)}</span></button>`;
  }).join('');
}
const memoListHtml = (where) => `<div class="memopage mlist padb" data-mlist-wrap="${where}"><div class="mlsb"><input type="search" class="mlq" data-mlq="${where}" placeholder="メモを検索" aria-label="メモを検索" value="${esc(ML.q[where])}" autocomplete="off" spellcheck="false"></div><div class="mlrows" data-mlist="${where}">${memoRowsHtml(where)}</div></div>`;
function paintMemoLists() { root.querySelectorAll('[data-mlist]').forEach((el) => { el.innerHTML = memoRowsHtml(el.dataset.mlist); }); }
async function loadMemoList() {
  const seq = ++ML.seq;
  try { await flushMemosNow(); const rows = await db.listMemoDays(); if (seq !== ML.seq) return; ML.rows = rows.filter((m) => m && typeof m.text === 'string' && m.text.trim()); ML.failed = false; } catch { if (seq !== ML.seq) return; ML.failed = true; }
  paintMemoLists();
}
const invalidateMemoList = () => { ML.rows = null; ML.seq++; if (Object.values(ML.open).some(Boolean)) loadMemoList(); };
const memoListUsed = () => Object.entries(ML.open).some(([w, o]) => o && root.querySelector(`[data-mlist="${w}"]`));
root.addEventListener('input', (ev) => { const q = ev.target.closest?.('input.mlq'); if (q) { ML.q[q.dataset.mlq] = q.value; paintMemoLists(); } });
root.addEventListener('click', (ev) => {
  const r = ev.target.closest?.('[data-mrow]'); if (!r) return;
  const where = r.closest('[data-mlist-wrap]')?.dataset.mlistWrap; if (where) ML.open[where] = false;
  set({ selected: r.dataset.mrow }); say(`${dayLabel(r.dataset.mrow)}のメモを開きました。`);
  root.querySelector('textarea.memota')?.focus({ preventScroll: true });
});
const memoStatusHtml = (e, k) => e?.failed ? `<span class="merr">${SAVE_FAILED}</span><button type="button" data-act="memoretry" data-mdate="${k}">再試行</button>` : e?.loadFailed ? '<span class="merr">メモを読み込めませんでした。</span>' : '自動で保存';
function paintMemo(k) {
  const e = memoStore.get(k);
  if (e?.loaded && k === todayKey() && root.querySelector('.hmemo') && !memoStore.dirty(k) && homeMemoSig !== e.text) { homeMemoSig = e.text; if (!rendering) render(); }
  root.querySelectorAll(`textarea.memota[data-memo="${k}"]`).forEach((ta) => {
    if (e?.loaded) ta.readOnly = false;
    if (e?.loaded && !memoComposing && ta.value !== e.text) ta.value = e.text;
  });
  root.querySelectorAll(`.memost[data-memost="${k}"]`).forEach((el) => { el.innerHTML = memoStatusHtml(e, k); });
  if (e?.loaded && !memoStore.dirty(k) && !e.failed) { patchMark(k, !/^\s*$/.test(e.text)); if (memoSynced.get(k) !== e.text) { memoSynced.set(k, e.text); if (ML.rows || Object.values(ML.open).some(Boolean)) invalidateMemoList(); } }
  if (e?.failed && !memoSaid.has(k)) { memoSaid.add(k); say(SAVE_FAILED); } else if (!e?.failed) memoSaid.delete(k);
}
setMemoHook(paintMemo);
// 描画後: 本文を入れ（HTML には埋めない）、未読込なら読み、フォーカスとカーソルを戻す。
function fillMemos(keep) {
  root.querySelectorAll('textarea.memota').forEach((ta) => {
    const k = ta.dataset.memo, e = memoStore.get(k);
    if (e?.loaded) ta.value = e.text; else memoStore.loadMemo(k);
    if (keep && keep.where === ta.dataset.where) {
      ta.focus({ preventScroll: true });
      try { ta.setSelectionRange(keep.s, keep.e, keep.d || 'none'); } catch { /* 無視 */ }
      ta.scrollTop = keep.sc;
    }
    paintMemo(k);
  });
}
// 変換中などで input が届いていない本文を DOM から拾う。
function memoSync() {
  root.querySelectorAll('textarea.memota').forEach((ta) => { const e = memoStore.get(ta.dataset.memo); if (e?.loaded && e.text !== ta.value) memoStore.setText(ta.dataset.memo, ta.value); });
}
root.addEventListener('input', (ev) => { const ta = ev.target.closest?.('textarea.memota'); if (ta && !ev.isComposing && !memoComposing && !ta.readOnly) memoStore.setText(ta.dataset.memo, ta.value); });
let remComposing = false; // 題名欄の実変換中だけ true（入力欄のノードは再描画で保たれるので描画は待たない）
root.addEventListener('compositionstart', (ev) => { if (ev.target.closest?.('input.remin')) { remComposing = true; return; } if (ev.target.closest?.('textarea.memota')) memoComposing = true; });
root.addEventListener('compositionend', (ev) => {
  const rin = ev.target.closest?.('input.remin');
  if (rin) {
    remComposing = false;
    if (!RM.add.busy) RM.add.title = rin.value;
    if (RM.add.want) { RM.add.want = false; remSubmit(); } // 変換確定前に追加を押していたら、確定後に1回だけ保存
    return;
  }
  const ta = ev.target.closest?.('textarea.memota'); if (!ta) return;
  memoComposing = false;
  if (!ta.readOnly) memoStore.setText(ta.dataset.memo, ta.value);
  if (renderPending) { renderPending = false; render(); }
});
root.addEventListener('focusout', (ev) => { if (ev.target.closest?.('input.remin')) remComposing = false; if (memoComposing && ev.target.closest?.('textarea.memota')) { memoComposing = false; if (renderPending) { renderPending = false; setTimeout(render, 0); } } });
const flushMemosNow = () => { memoSync(); return memoStore.flushAll(); };
// バックアップの前後: 未保存のメモを保存し終えるまで待つ。保存できなかった日があれば false。
const flushMemosAwait = async () => { try { const r = await flushMemosNow(); return r.every((x) => x !== false) && !memoStore.anyDirty(); } catch { return false; } };
document.addEventListener('visibilitychange', () => { if (document.hidden) { flushMemosNow(); delCtl.flush(); doneCtl.flush(); } });
window.addEventListener('pagehide', () => { doneCtl.flush(); delCtl.flush(); });
window.addEventListener('pagehide', flushMemosNow);
// ---------- タスク: 続けて追加（PR17） ----------
root.addEventListener('input', (ev) => { const i = ev.target.closest?.('input.remin'); if (i && !RM.add.busy) RM.add.title = i.value; });
root.addEventListener('keydown', (ev) => {
  const i = ev.target.closest?.('input.remin'); if (!i) return;
  if (ev.key !== 'Enter') return;
  if (ev.isComposing || remComposing) return; // 実変換中の Enter は確定だけ（229 だけでは捨てない）
  ev.preventDefault(); remSubmit();
});
const remInput = () => root.querySelector('input.remin');
function fillAdd(keep) {
  const i = remInput(); if (!i) return;
  if (i.value !== RM.add.title && !RM.add.busy) i.value = RM.add.title;
  if (keep || RM.add.focus) {
    RM.add.focus = false;
    i.focus({ preventScroll: true });
    try { const n = i.value.length; i.setSelectionRange(keep ? Math.min(keep.s, n) : n, keep ? Math.min(keep.e, n) : n); } catch { /* 無視 */ }
  }
}
function openAdd() { const i = remInput(); if (i) i.focus({ preventScroll: true }); else { RM.add.focus = true; render(); } }
// 追加ボタンは入力欄からフォーカスを奪わない（キーボードを保つ）
for (const t of ['pointerdown', 'mousedown']) root.addEventListener(t, (ev) => { if (ev.target.closest?.('[data-act="remsubmit"]')) ev.preventDefault(); });
async function remSubmit() {
  const a = RM.add, i = remInput();
  if (a.busy || !i) return;
  if (remComposing) { a.want = true; return; } // 実変換中は確定を待つ
  a.title = i.value;
  const due = a.due === undefined ? state.selected : a.due;
  const time = due ? a.time || '' : '';
  if (!a.title.trim()) return;
  a.busy = true; a.err = ''; i.readOnly = true; i.setAttribute('aria-busy', 'true');
  root.querySelectorAll('[data-act="remsubmit"]').forEach((b) => { b.disabled = true; });
  root.querySelectorAll('.rmwhy.err').forEach((e) => e.remove());
  const r = await addCtl.submit({ title: a.title, due, time, notify: a.notify }); // Duo 内に保存（native は呼ばない）
  if (RM.add !== a) return;
  a.busy = false;
  const cur = remInput() || i; // 再描画されても同じノード（保たれている）
  cur.readOnly = false; cur.removeAttribute('aria-busy');
  root.querySelectorAll('[data-act="remsubmit"]').forEach((b) => { b.disabled = false; });
  if (r.ok) {
    a.title = ''; a.err = ''; cur.value = ''; // DB への保存に成功した後だけ同じノードを空にする
    RM.mut++; // 読込中の古い結果で追加済みの行を消さない
    const list = RM.data?.reminders || [];
    if (!list.some((x) => x.itemId === r.reminder.itemId)) RM.data = { lists: [LOCAL_LIST], reminders: [...list, r.reminder] };
    RM.sig = ''; a.focus = true; render(); scheduleTasks(); say('タスクを追加しました。');
  } else {
    a.err = taskErrText(r.code, 'もう一度 Enter か「追加」で試せます。'); // 文字は残す
    a.focus = true; render(); say(a.err);
  }
}
const taskErrText = (code, fallback) => (TASK_STORE_TEXT[code] ? `${TASK_STORE_TEXT[code]}${fallback}` : code === 'NOT_FOUND' ? 'このタスクは削除されています。' : fallback);
// ---------- タスク: Duo 内保存（IndexedDB tasks）。許可・リスト・native は使わない ----------
const newDraft = () => ({ open: false, title: '', due: undefined, time: '', pop: null, notify: undefined, busy: false, err: '' }); // due: undefined＝選んでいる日に従う／null＝期限なし
const RM = { add: newDraft(), data: null, err: false, doneOpen: false, histDays: HIST_DAYS, more: false, timer: 0, sig: '', mut: 0 };
let tkDrop = null; // 編集シートを閉じる口（シート側の定義後に設定）
// 端末内の設定（月の件数だけ。旧リマインダーの同期・リスト・追加先の設定は消さず、以後読まない）。
// 新設定 duo-task-settings が無い時だけ、旧 duo-native-rem の monthTasks を一度継承して保存する。
const REM_KEY = `duo-native-rem${suffix}`;
const TASK_SET_KEY = `duo-task-settings${suffix}`;
const parseLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
function loadRemSettings() {
  const r = inheritTaskSettings(parseLS(TASK_SET_KEY), parseLS(REM_KEY));
  if (r.inherited) { try { localStorage.setItem(TASK_SET_KEY, JSON.stringify(r.value)); } catch { /* 無視 */ } }
  return r.value;
}
let remSet = loadRemSettings();
function setRemSettings(next) { remSet = normTaskSettings(next); try { localStorage.setItem(TASK_SET_KEY, JSON.stringify(remSet)); } catch { /* 無視 */ } }
const SHOWN = new Set([LOCAL_LIST.id]);
const shownIds = () => SHOWN;
// 月の「✓N」: 設定オン・読み込み済みの時だけ。閉じた画面（browse）には出さない。
function monthTaskCounts(kind) {
  if (kind === 'browse' || !remSet.monthTasks || !RM.data) return null;
  const over = doneCtl.pending(), ids = delCtl.ids();
  const list = ids.size ? RM.data.reminders.filter((x) => !ids.has(x.itemId)) : RM.data.reminders;
  return dueCounts(list, shownIds(), over);
}
const taskStore = createTaskStore(db);
const localCall = createLocalCall(taskStore); // 完了・削除・編集の controller の口（Duo 内保存へ）
const addCtl = createLocalAddController(taskStore);
// 完了の丸: 押すと表示だけ即変え、1.5秒後に最後の状態を1回保存して完了段へ移す。6秒は「元に戻す」。失敗は表示を戻して理由を出す。
const doneCtl = createTaskDoneController(taskStore, {
  onPending: () => render(),
  onSettle: (id, { result, failed, err, done }) => {
    RM.mut++;
    if (result && RM.data) RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === id ? rowOf(result) : x)) };
    RM.sig = '';
    render(); scheduleTasks();
    if (failed) {
      const m = taskErrText(errCode(err), '完了の変更はもとに戻しました。');
      notice(m); say(m);
    } else if (result && done) {
      notice('完了にしました', { label: '元に戻す', fn: () => undoDone(id) }, DONE_UNDO_MS);
    }
  },
});
async function undoDone(id) {
  document.querySelector('#native-toast')?.remove();
  if (doneCtl.has(id)) return;
  const r = await doneCtl.undo(id);
  RM.mut++;
  if (r.ok) {
    if (RM.data) RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === id ? rowOf(r.task) : x)) };
    RM.sig = ''; render(); scheduleTasks(); say('完了を取り消しました。');
  } else { const m = taskErrText(errCode(r.err), '完了は取り消せませんでした。'); notice(m); say(m); }
}
// 削除: 即非表示、4秒は取り消せる。確定は Duo 内の保存。失敗は表示へ戻す。
const delCtl = createDeleteController(localCall, {
  onChange: () => { RM.sig = ''; render(); },
  onSettle: (id, { ok, err }) => {
    RM.mut++;
    if (ok && RM.data) RM.data = { ...RM.data, reminders: RM.data.reminders.filter((x) => x.itemId !== id) };
    RM.sig = ''; render(); scheduleTasks();
    if (!ok) {
      const m = taskErrText(errCode(err), 'タスクはもとに戻しました。');
      notice(m); say(m);
    }
  },
});
function deleteTask(id) {
  const r = RM.data?.reminders.find((x) => x.itemId === id);
  if (!r || doneCtl.has(id) || !delCtl.schedule(r)) return false;
  const m = TASK_DELETED;
  notice(m, { label: '取り消す', fn: () => { if (delCtl.undo(id)) { document.querySelector('#native-toast')?.remove(); say('削除を取り消しました。'); scheduleTasks(); } } }, DELETE_UNDO_MS);
  say(m);
  return true;
}
function toggleDone(id) {
  const r = RM.data?.reminders.find((x) => x.itemId === id);
  if (!r || !doneCtl.toggle(r)) return;
  const now = doneCtl.pending().get(id);
  say(now ? '完了にしました。' : '未完了に戻しました。');
}
function taskBody(where) {
  return tasksHtml(RM.data ? { ...RM.data, reminders: RM.data.reminders.filter((x) => !delCtl.has(x.itemId)) } : RM.data, { selected: state.selected, doneOpen: RM.doneOpen, histDays: RM.histDays, loading: !RM.err, error: RM.err, busyMore: RM.more, pending: doneCtl.pending(), add: RM.data ? { draft: RM.add } : null });
}
// Duo 内の保存から読む。読込の間に追加・完了・削除があれば、その結果は捨てて読み直す（追加済みの行を消さない）。
let loadSeq = 0;
async function loadTasks() {
  const g = ++loadSeq, m0 = RM.mut;
  try {
    const rows = (await taskStore.list()).map(rowOf);
    if (g !== loadSeq) return;
    if (m0 !== RM.mut) { scheduleTasks(); return; }
    RM.err = false; RM.more = false;
    const r = { lists: [LOCAL_LIST], reminders: rows };
    const sig = JSON.stringify(r);
    if (sig === RM.sig && RM.data) return;
    RM.sig = sig; RM.data = r; render();
    if (calScreenOpen()) renderCalScreen();
  } catch {
    if (g !== loadSeq) return;
    RM.more = false;
    if (!RM.data) { RM.err = true; render(); }
  }
}
function scheduleTasks() { clearTimeout(RM.timer); RM.timer = setTimeout(loadTasks, 300); }
function renderPage(side, id) {
  const cls = side === 'left' ? 'lp' : 'rp';
  if (id === 'home') return `<section class="page ${cls}" data-page="home" aria-label="ホーム"><div class="rhead hh"><h2>ホーム</h2>${side === 'right' ? rctl() : ''}${side === 'left' ? `<div class="sctl">${gearBtn()}</div>` : ''}</div><div class="listpane">${listView('axis')}</div></section>`;
  if (id === 'month') return `<section class="page ${cls} calendar" data-page="month" aria-label="カレンダー">${shead(side)}${calendarBody('spread')}</section>`;
  if (id === 'time') return `<section class="page ${cls}" data-page="time">${dateHead(side, 'time')}${timeBody(side, paneWidth(side))}${timeMenu(side)}${miniMonth(side)}</section>`;
  if (id === 'memo') return `<section class="page ${cls}" data-page="memo">${dateHead(side, id)}${memoBody(side)}${miniMonth(side)}</section>`;
  return `<section class="page ${cls}" data-page="${id}">${dateHead(side, id)}${taskBody(side)}${miniMonth(side)}</section>`;
}
// 各ページの下の切替「月｜時間｜タスク｜メモ」（幅 240・高 46）。選んでいるページを押すと何も変えない。
const PAGE_LABELS = { home: 'ホーム', month: '月', time: '時間', task: 'タスク', memo: 'メモ' };
function pageSwitch(side) {
  return `<div class="pgsw ${side === 'left' ? 'pgl' : 'pgr'}" role="group" aria-label="${side === 'left' ? '左' : '右'}ページの種類">${PAGE_IDS.map((id, i) => `<button type="button" data-pick="${id}" data-side="${side}" aria-pressed="${id === PG()[side]}" aria-description="${PAGE_IDS.length}個中${i + 1}番目"><span class="pill">${PAGE_LABELS[id]}</span></button>`).join('')}</div>`;
}
function spread() {
  return `<div class="shell spread${POS.band ? ' band' : ' fb'}">${renderPage('left', PG().left)}${renderPage('right', PG().right)}${ctl()}${pageSwitch('left')}${pageSwitch('right')}</div>`;
}
// 時間軸: 初回／選択日の変更で「今の1時間前」へ。現在時刻の線は毎分更新。
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function updateNow() {
  root.querySelectorAll('.tlin').forEach((inner) => {
    const ks = inner.dataset.days.split(','), i = ks.indexOf(todayKey()), el = inner.querySelector('.nowl');
    if (i < 0) { el.hidden = true; return; }
    el.hidden = false;
    el.style.setProperty('--m', String(nowMin()));
    el.style.setProperty('--i', String(i));
    el.style.setProperty('--n', String(ks.length));
    el.querySelector('.nowt').textContent = hhmm(nowMin());
  });
}
function initTimeline() {
  const tls = root.querySelectorAll('.tl');
  TLP.left.key = tls.length && [...tls].some((t) => paneOf(t) === 'left') ? TLP.left.key : '';
  TLP.right.key = tls.length && [...tls].some((t) => paneOf(t) === 'right') ? TLP.right.key : '';
  TLP.closed.key = tls.length && [...tls].some((t) => paneOf(t) === 'closed') ? TLP.closed.key : '';
  tls.forEach((tl) => {
    const pane = paneOf(tl), T = TLP[pane];
    const key = `${layoutKind()}|${state.view}|${state.home}|${PG().left}|${PG().right}|${state.selected}|${state.timeMode[pane]}|${pane === 'bottom' ? state.pages.portraitBottom : ''}`;
    if (key !== T.key) { T.key = key; tl.scrollTop = Math.max(0, nowMin() - 60) * T.hh / 60; }
  });
  updateNow();
}
// 倍率の変更。中心の時刻（画面上の位置 cy）を固定する。
function setHh(next, cy, tlEl) {
  const tl = tlEl || firstTl();
  if (!tl) return;
  const T = TLP[paneOf(tl)];
  const hh = clampHh(next);
  if (hh === T.hh) return;
  const c = cy ?? tl.clientHeight / 2;
  const centerMin = (tl.scrollTop + c - TL_PAD) / T.hh * 60;
  T.hh = hh;
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
    tlPinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, hh0: TLP[paneOf(tl)].hh, tl };
    TLQ.quiet = performance.now() + 500;
  }
});
window.addEventListener('pointermove', (ev) => {
  const p = tlPtr.get(ev.pointerId);
  if (!p) return;
  if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 8) TLQ.quiet = performance.now() + 400;
  p.cx = ev.clientX; p.cy = ev.clientY; p.moved = true;
  if (tlPinch && tlPtr.size >= 2) {
    const [a, b] = [...tlPtr.values()];
    const d = Math.hypot((a.cx ?? a.x) - (b.cx ?? b.x), (a.cy ?? a.y) - (b.cy ?? b.y));
    const r = tlPinch.tl.getBoundingClientRect();
    setHh(tlPinch.hh0 * d / tlPinch.d0, ((a.cy ?? a.y) + (b.cy ?? b.y)) / 2 - r.top, tlPinch.tl);
    TLQ.quiet = performance.now() + 500;
  }
});
const tlEnd = (ev) => { if (tlPtr.delete(ev.pointerId) && tlPtr.size < 2) tlPinch = null; };
window.addEventListener('pointerup', tlEnd);
window.addEventListener('pointercancel', tlEnd);
// ---------- 時間軸の直接入力（第14版 PR25）----------
// 入力中の枠 DF は描画だけの状態（DB・native へは書かない）。mode: 'temp'＝短tapの仮枠（取っ手つき）／'drag'＝長押しドラッグ中／'sheet'＝編集シート中。
// render() で DOM が作り直されても paintDraft() が同じ場所へ描き直す。
const DF = { mode: null, day: '', pane: '', start: 0, end: 0, anchor: 0 };
const lastCatOk = () => (state.categories.some((c) => c.id === lastCat) ? lastCat : defaultCatId());
const colOf = (pane, day) => [...root.querySelectorAll(`.tl[data-pane="${pane}"] .tlcol`)].find((c) => c.dataset.day === day) || null;
const hhOf = (pane) => TLP[pane]?.hh ?? 60;
const minAtY = (y, col, pane) => minutesAt(y, col.getBoundingClientRect().top, TL_PAD, hhOf(pane));
function paintDraft() {
  root.querySelectorAll('.dbox, .dtag').forEach((n) => n.remove());
  if (!DF.mode) return;
  const col = colOf(DF.pane, DF.day);
  if (!col) { if (DF.mode !== 'sheet') DF.mode = null; return; }
  const cat = resolveCategory(lastCatOk(), state.categories);
  const box = document.createElement('div');
  box.className = 'dbox'; box.dataset.mode = DF.mode;
  box.setAttribute('style', `${colorVars(cat.color)}--m:${DF.start};--d:${DF.end - DF.start}`);
  box.innerHTML = `<b class="dt">新しい予定</b><span class="ds">${spanText(DF)}</span>${DF.mode === 'temp' ? '<i class="hdl hdl-s" data-h="start"></i><i class="hdl hdl-e" data-h="end"></i>' : ''}`;
  col.append(box);
  const inner = col.closest('.tlin'), hh = hhOf(DF.pane);
  [['s', DF.start], ['e', DF.end]].forEach(([k, m], i) => {
    const t = document.createElement('span');
    t.className = `dtag dtag-${k}`; t.textContent = hmText(m);
    const top = TL_PAD + m * hh / 60 - 9;
    t.style.top = `${i ? Math.max(top, TL_PAD + DF.start * hh / 60 - 9 + 18) : top}px`;
    inner.append(t);
  });
}
function clearDraftBox() { if (!DF.mode) return; DF.mode = null; paintDraft(); }
function openDraft() {
  const { day, start, end } = DF;
  DF.mode = 'sheet'; paintDraft();
  openEditor(null, root.querySelector('[data-act="add"]'), day, start, { endMin: end, direct: true });
}
// 空きタップ: 1回目＝その時刻（15分刻み）から1時間の仮枠、枠の上の2回目＝編集シート、枠の外＝枠を消す。
function tlTap(ev, col) {
  if (performance.now() < TLQ.quiet) return;
  if (ev.target.closest('.hdl')) return;
  if (DF.mode === 'temp') { if (ev.target.closest('.dbox')) openDraft(); else clearDraftBox(); return; }
  if (DF.mode) return;
  const pane = paneOf(col.closest('.tl'));
  Object.assign(DF, { mode: 'temp', day: col.dataset.day, pane }, tapRange(minAtY(ev.clientY, col, pane)));
  paintDraft();
}
// 仮枠の取っ手（見た目12・押せる範囲44）。押してすぐ動かし、離したあとの click は抑止する。
root.addEventListener('pointerdown', (ev) => {
  const h = ev.target.closest?.('.hdl');
  if (!h || DF.mode !== 'temp') return;
  ev.preventDefault();
  const which = h.dataset.h, id = ev.pointerId;
  const mv = (e) => {
    if (e.pointerId !== id || DF.mode !== 'temp') return;
    const col = colOf(DF.pane, DF.day); if (!col) return;
    const y = e.clientY + (hhOf(DF.pane) / 60) * 7.5; // 15分刻みの最も近い線へ
    const r = moveHandle(DF, which, minAtY(y, col, DF.pane));
    if (r.start !== DF.start || r.end !== DF.end) { Object.assign(DF, r); paintDraft(); }
  };
  const done = (e) => {
    if (e.pointerId !== id) return;
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
    TLQ.quiet = performance.now() + 400;
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
});

// ---------- 描画（スクロール位置とフォーカスを保つ） ----------
let lastKind = '';
function render() {
  if (memoComposing) { renderPending = true; return; } // IME 変換中は入力欄を作り直さない
  ensurePasteMonth();
  const kind = layoutKind();
  const fam = (k) => (k === 'home' || k === 'browse' ? 'closed' : k);
  if (state.strip && (!['closed', 'spread'].includes(fam(kind)) || (lastKind && fam(lastKind) !== fam(kind)))) state.strip = null; // 開閉・回転で姿勢が変わったら元の表示へ
  updateLayoutMetrics();
  updateDiagnostics();
  if (menuDlg.open) placeMenu();
  const scrolls = {};
  const anchor = root.querySelector('.scroll.all') ? anchorRec : null;
  root.querySelectorAll('[data-scroll]').forEach((el) => { scrolls[`${lastKind}:${el.dataset.scroll}${el.dataset.pane || ''}`] = el.scrollTop; });
  const f = document.activeElement;
  const focusKey = f && root.contains(f) ? f.dataset.act ? `act:${f.dataset.act}` : f.dataset.view ? `view:${f.dataset.view}` : f.dataset.mode ? `mode:${f.dataset.mode}` : f.dataset.date ? `date:${f.dataset.date}` : '' : '';
  document.body.dataset.layout = kind;
  document.body.dataset.posture = kind === 'open' && isPortrait() ? 'portrait' : '';
  const ma = document.activeElement;
  const memoKeep = ma && ma.matches?.('textarea.memota') ? { where: ma.dataset.where, s: ma.selectionStart, e: ma.selectionEnd, d: ma.selectionDirection, sc: ma.scrollTop } : null;
  const ra = document.activeElement;
  const remKeep = ra && ra.matches?.('input.remin') ? { s: ra.selectionStart, e: ra.selectionEnd } : null;
  const remNode = root.querySelector('input.remin'); // 入力欄は一覧の再描画で作り直さず、同じノードを戻す
  rendering = true;
  root.innerHTML = { home: () => closed('home'), browse: () => closed('browse'), open, desk, spread }[kind]();
  rendering = false;
  if (remNode) { const nn = root.querySelector('input.remin'); if (nn && nn !== remNode) { nn.replaceWith(remNode); remNode.readOnly = !!RM.add.busy; } }
  fillMemos(memoKeep);
  if (root.querySelector('.hmemo')) { const e = memoStore.get(todayKey()); if (!e?.loaded) memoStore.loadMemo(todayKey()); }
  fillAdd(remKeep);
  ensureMarks();
  if (memoListUsed() && !ML.rows && !ML.failed) loadMemoList();
  lastKind = kind;
  root.querySelectorAll('[data-scroll]').forEach((el) => { el.scrollTop = scrolls[`${kind}:${el.dataset.scroll}${el.dataset.pane || ''}`] || 0; });
  restoreAll(anchor);
  measureMonthPane();
  initTimeline();
  paintDraft();
  paintRange();
  applyPasteInert();
  if (focusKey && !document.activeElement?.matches?.('input.remin')) { // 入力欄へ送ったフォーカスは取り戻さない
    const [t, v] = focusKey.split(/:(.*)/);
    const sel = { act: `[data-act="${v}"]`, view: `[data-view="${v}"]`, mode: `[data-mode="${v}"]`, date: `[data-date="${v}"]` }[t];
    root.querySelector(sel)?.focus({ preventScroll: true });
  }
  syncExt();
}

// ---------- 操作 ----------
function move(n, pane) {
  const k = state.selected;
  if (pane && layoutKind() === 'spread' && PG()[pane] !== 'month') { set({ selected: addDays(k, n * (PG()[pane] === 'time' ? tlStep(pane) : 1)) }); return; }
  set({ selected: viewNow() === 'month' ? addMonths(k, n) : addDays(k, n * (viewNow() === 'week' ? 7 : 1)) });
}
// 見開きの切替。左右で同じ種類になるときは入れ替わる。最後に触ったページを記録（＋の行き先）。
function pickPage(side, id) {
  const before = state.pages, next = selectPage(before, side, id);
  TLM.open = null; MM.open = null;
  set({ pages: next, lastSide: side });
  const swapped = before[side] !== id && before[side === 'left' ? 'right' : 'left'] === id;
  say(`${side === 'left' ? '左' : '右'}ページを${PAGE_LABELS[id]}にしました。${swapped ? `${side === 'left' ? '右' : '左'}ページは${PAGE_LABELS[next[side === 'left' ? 'right' : 'left']]}になりました。` : ''}`);
}
// ＋の行き先: 見開きでは最後に触ったページに合わせる。月・時間は予定、タスク・メモは入力の接続（後続の版）まで案内のみ。
function addFromHere(b) {
  const id = state.strip && layoutKind() !== 'spread' ? state.strip : layoutKind() === 'spread' ? PG()[state.lastSide] : panelOn() ? state.pages.portraitBottom : 'month';
  if (id === 'memo') { const ta = root.querySelector('textarea.memota'); if (ta) { ta.focus(); say('メモを書けます。'); } return; }
  if (id === 'task') { if (RM.data) { openAdd(); say('タスクを入力できます。'); } else say('タスクを読み込んでいます。'); return; }
  openEditor(null, b);
}
// 右の帯のタスク／メモ（DP-3）。閉じた画面は全面、見開きは右ページを一時的に置き換える（保存した pages は変えない）。
const STRIP = { prevSel: null, tip: null, swallow: 0 };
function flashPage(side) {
  const el = root.querySelector(`.page.${side === 'left' ? 'lp' : 'rp'}`);
  if (!el) return;
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 200);
}
function toggleStrip(id) {
  const kind = layoutKind();
  if (PS.on || (kind !== 'spread' && kind !== 'home' && kind !== 'browse')) return;
  TLM.open = null; MM.open = null;
  const name = PAGE_NAMES[id];
  if (state.strip === id) { // もう一度: 元へ戻す（メモのために動かした日付も、触っていなければ戻す）
    const back = id === 'memo' && STRIP.prevSel && state.selected === todayKey() ? { selected: STRIP.prevSel } : {};
    STRIP.prevSel = null;
    set({ strip: null, ...back });
    say(kind === 'spread' ? `${name}を閉じました。右ページは${PAGE_LABELS[state.pages.right]}です。` : `${name}を閉じました。`);
    return;
  }
  if (kind === 'spread') {
    const p = state.pages;
    if (p.left === id || (p.right === id && !state.strip)) { const side = p.left === id ? 'left' : 'right'; flashPage(side); say(`${side === 'left' ? '左' : '右'}ページがすでに${name}です。`); return; }
  }
  const memoDay = id === 'memo' && state.selected !== todayKey();
  STRIP.prevSel = memoDay ? state.selected : null;
  if (id === 'memo') ML.open.closed = ML.open.right = false; // 今日のメモの本文から始める
  set({ strip: id, ...(id === 'memo' ? { selected: todayKey() } : {}), ...(kind === 'spread' ? { lastSide: 'right' } : {}) });
  say(kind === 'spread' ? `右ページを${name}にしました。` : `${name}を開きました。`);
}
// 帯の丸を長押し（0.8秒）すると名前の吹き出しを出す。押し終えたあとの click は無視する。
function stripTipHide() { STRIP.tip?.remove(); STRIP.tip = null; }
root.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest?.('.cstrip');
  if (!b) return;
  stripTipHide();
  const t = setTimeout(() => {
    const r = b.getBoundingClientRect(), tip = document.createElement('div');
    tip.className = 'stip'; tip.setAttribute('aria-hidden', 'true'); tip.textContent = b.dataset.strip === 'task' ? 'タスク' : 'メモ';
    tip.style.top = `${r.top + r.height / 2}px`; tip.style.right = `${innerWidth - r.left + 4}px`;
    document.body.append(tip); STRIP.tip = tip; STRIP.swallow = performance.now() + 100000;
  }, 800);
  const end = () => { clearTimeout(t); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); if (STRIP.swallow) STRIP.swallow = performance.now() + 400; setTimeout(stripTipHide, 600); };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
});
function say(msg) { $('#status').textContent = ''; requestAnimationFrame(() => { $('#status').textContent = msg; }); }

root.addEventListener('click', (ev) => {
  if (DF.mode === 'temp' && !ev.target.closest('.dbox') && (!ev.target.closest('.tlcol') || ev.target.closest('button'))) clearDraftBox();
  const col = ev.target.closest('.tlcol');
  if (col && !ev.target.closest('button')) { tlTap(ev, col); return; }
  const b = ev.target.closest('button');
  if (TLM.open && !ev.target.closest('.tlmenu, [data-act="tlmenu"]')) { TLM.open = null; render(); return; } // 選択肢の外をたたくと閉じる（たたいた先の操作はしない）
  if (RM.add.pop && !ev.target.closest('.rmdp, [data-act="remdue2"]')) { RM.add.pop = null; render(); }
  if (MM.open && !ev.target.closest('.mmenu, [data-act="mini"]')) { closeMini(false); return; } // 小さな月の外をたたくと閉じる（たたいた先の操作はしない）
  if (!b || !root.contains(b)) return;
  const d = b.dataset;
  if (PS.on && pasteClick(b)) return;
  const pg = layoutKind() === 'spread' && d.act !== 'add' ? b.closest('.page') : null;
  if (pg) { const sd = pg.classList.contains('lp') ? 'left' : 'right'; if (sd !== state.lastSide) { state.lastSide = sd; saveUi(); } }
  if (d.view) set({ view: d.view, home: false });
  else if (d.act === 'list') set({ home: true });
  else if (d.act === 'homego') homeGo2(d, b);
  else if (d.act === 'remck') toggleDone(d.id);
  else if (d.act === 'remedit') openTask(d.id, b);
  else if (d.act === 'remsubmit') remSubmit();
  else if (d.act === 'remnote') { RM.add.notify = RM.add.notify !== true; RM.add.focus = true; render(); }
  else if (d.act === 'remdue0') { RM.add.due = null; RM.add.time = ''; RM.add.pop = null; RM.add.focus = true; render(); }
  else if (d.act === 'remdue2') { const a = RM.add, cur = a.due === undefined ? state.selected : a.due; a.pop = a.pop ? null : { vm: monthOf(cur || todayKey()) }; a.focus = true; render(); }
  else if (d.act === 'remdp') { const a = RM.add; haptic('light').catch(() => {}); a.due = d.day; a.pop = null; a.focus = true; render(); }
  else if (d.act === 'remdpn') { const a = RM.add; if (a.pop) { a.pop = { vm: addMonths(a.pop.vm, Number(d.n)) }; render(); root.querySelector(`[data-act="remdpn"][data-n="${d.n}"]`)?.focus({ preventScroll: true }); } }
  else if (d.act === 'remtimeon') { const a = RM.add; if (a.due === null) return; a.time = a.time ? '' : '09:00'; render(); root.querySelector('[data-act="remtimeon"]')?.focus({ preventScroll: true }); }
  else if (d.act === 'remth') { const a = RM.add; haptic('light').catch(() => {}); a.time = withHm(a.time, Number(d.h), null); render(); root.querySelector(`[data-act="remth"][data-h="${d.h}"]`)?.focus({ preventScroll: true }); }
  else if (d.act === 'remtm') { const a = RM.add; haptic('light').catch(() => {}); a.time = withHm(a.time, null, Number(d.m)); a.pop = null; a.focus = true; render(); }
  else if (d.act === 'remdone') { RM.doneOpen = !RM.doneOpen; render(); root.querySelector('[data-act="remdone"]')?.focus({ preventScroll: true }); }
  else if (d.act === 'remmore') { RM.histDays += HIST_DAYS; RM.more = true; render(); root.querySelector('[data-act="remmore"]')?.focus({ preventScroll: true }); loadTasks(); }
  else if (d.date) {
    const compact = ['home', 'browse'].includes(layoutKind()) || (isPortrait() && !panelOn());
    // 閉じた画面・開いた縦では選択日サイド（一覧）が無いので、日付選択でその日の日表示へ進む。
    set(compact && state.view === 'month' ? { selected: d.date, view: 'day' } : { selected: d.date });
  } else if (d.jump) set({ selected: d.jump, view: 'day' });
  else if (d.event) openEditor(d.event, b);
  else if (d.new) openEditor(null, b, d.new);
  else if (d.act === 'add') addFromHere(b);
  else if (d.act === 'pnltoggle') setPanel(!state.pages.portraitShown);
  else if (d.act === 'pnlhide') setPanel(false);
  else if (d.act === 'pnlgrip') { if (performance.now() >= PN.swallow) setPanel(false); }
  else if (d.pnl) pickBottom(d.pnl);
  else if (d.act === 'strip') { if (STRIP.swallow && performance.now() < STRIP.swallow) { STRIP.swallow = 0; return; } STRIP.swallow = 0; toggleStrip(d.strip); }
  else if (d.act === 'allmonth') set({ monthExpand: !state.monthExpand });
  else if (d.act === 'today') set({ selected: todayKey() }); // 今日へ戻るのは選択日だけ。表示（一覧・日・週・月）は保つ
  else if (d.act === 'prev') move(-1, d.pane);
  else if (d.act === 'next') move(1, d.pane);
  else if (d.act === 'memolist') { const w = d.where, want = d.mode ? d.mode === 'list' : !ML.open[w]; if (ML.open[w] === want) return; memoSync(); ML.open[w] = want; render(); if (ML.open[w]) { loadMemoList(); root.querySelector(`[data-mlq="${w}"]`)?.focus({ preventScroll: true }); } }
  else if (d.act === 'remsettings') { call('openSettings').catch(() => {}); }
  else if (d.act === 'memoretry') memoStore.flushMemo(d.mdate);
  else if (d.act === 'sample') loadSample();
  else if (d.act === 'pickrange') startRangeKbd(b);
  else if (d.mr) rangeKbd(d.mr);
  else if (d.act === 'search') openSearch(b);
  else if (d.act === 'menu') openMenu(b);
  else if (d.act === 'tlmenu') { MM.open = null; TLM.open = TLM.open === d.pane ? null : d.pane; render(); }
  else if (d.act === 'mini') { TLM.open = null; MM.open = MM.open === d.pane ? null : d.pane; MM.ym = state.selected; render(); if (MM.open) root.querySelector('.mmc.sel, .mmc')?.focus({ preventScroll: true }); }
  else if (d.mmnav) { MM.ym = addMonths(MM.ym || state.selected, Number(d.mmnav)); render(); root.querySelector(`[data-mmnav="${d.mmnav}"]`)?.focus({ preventScroll: true }); }
  else if (d.mmday) { const sd = d.pane; MM.open = null; set({ selected: d.mmday, lastSide: sd }); root.querySelector(`[data-act="mini"][data-pane="${sd}"]`)?.focus({ preventScroll: true }); say(`${dayLabel(d.mmday)}を選びました。`); }
  else if (d.tlmode) { TLM.open = null; AGL[d.pane] = 60; set({ timeMode: { ...state.timeMode, [d.pane]: d.tlmode }, lastSide: d.pane }); root.querySelector('[data-act="tlmenu"]')?.focus({ preventScroll: true }); say(`時間の表示を${TIME_LABELS[d.tlmode]}にしました。`); }
  else if (d.pick) pickPage(d.side, d.pick);
  else if (d.tlday) set({ selected: d.tlday });
});

// ホームのカードからの移動（第16版 PR14）。日付は今日（または明日）へ。開いた横は反対側のページ、縦下段は下段、閉じた画面は全面ページ／日表示へ。
function homeGo2(d, b) {
  const to = d.to, kind = layoutKind(), day = to === 'tomorrow' ? addDays(todayKey(), 1) : todayKey();
  const page = { time: 'time', tomorrow: 'time', task: 'task', taskadd: 'task', memo: 'memo', memolist: 'memo' }[to];
  const after = () => {
    if (to === 'memolist') { const w = kind === 'spread' ? (PG().left === 'memo' ? 'left' : 'right') : kind === 'open' ? 'bottom' : 'closed'; ML.open[w] = true; render(); loadMemoList(); }
    else if (to === 'memo') root.querySelector('textarea.memota')?.focus({ preventScroll: true });
    else if (to === 'taskadd' && RM.data) { openAdd(); }
    if (to === 'time' && d.hm) { const tl = root.querySelector('.page[data-page="time"] .tl, .pnl .tl'); const T = tl && TLP[paneOf(tl)]; if (tl && T) tl.scrollTop = Math.max(0, hmMin(d.hm) - 60) * T.hh / 60; }
  };
  if (kind === 'spread') {
    const side = PG().left === 'home' ? 'right' : PG().right === 'home' ? 'left' : state.lastSide;
    set({ selected: day, pages: selectPage(state.pages, side, page), lastSide: side });
  } else if (kind === 'open') {
    set({ selected: day, pages: selectPage(state.pages, 'portraitBottom', page) });
    if (!state.pages.portraitShown) setPanel(true);
  } else if (page === 'time') set({ selected: day, home: false, view: 'day' });
  else if (state.strip !== page) toggleStrip(page);
  after();
  say(`${PAGE_LABELS[page]}を開きました。`);
}
const hmMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

async function loadSample() {
  try {
    const ok = new Set(state.categories.map((c) => c.id)), first = state.categories[0]?.id ?? CAT_IDS.none;
    await db.putMany(SAMPLE.map((e) => ({ ...e, categoryId: ok.has(e.categoryId) ? e.categoryId : first })));
    state.events = await db.listEvents();
    bumpRevision();
    requestNotifySync('sample');
    render();
    say('サンプルの予定を入れました。');
  } catch { say('サンプルを保存できませんでした。'); }
}

// ---------- パネル共通（編集・範囲・確認・メニュー・検索・バックアップ） ----------
const dlg = $('#editor'), confirmDlg = $('#confirm'), scopeDlg = $('#scope'), menuDlg = $('#menu'), searchDlg = $('#search'), backupDlg = $('#backup'), form = $('#form');
const discardDlg = $('#discard'), scrim = $('#scrim');
const xdDlg = $('#xdetail'), xrDlg = $('#xretry'), catsDlg = $('#cats'), notifyDlg = $('#notify'), taskDlg = $('#taskdlg');
const panels = [dlg, confirmDlg, scopeDlg, discardDlg, menuDlg, searchDlg, backupDlg, xdDlg, xrDlg, catsDlg, notifyDlg, taskDlg];
const anyPanel = () => panels.some((d) => d.open);
const syncInert = () => { root.inert = anyPanel(); };
const origins = new Map();
function openPanel(d, from) {
  origins.set(d, from || document.activeElement);
  d.show();
  syncInert();
  if (d === xdDlg || d === taskDlg) syncScrim();
}
function closePanel(d, restore = true) {
  d._restore = restore;
  if (d.open) d.close();
  syncInert();
}
// カテゴリ編集を編集シートから開いたときは、閉じたら編集シートの選択肢を作り直す（新規カテゴリはそのまま選択）。
catsDlg.addEventListener('close', () => {
  if (dlg.open) {
    dlg.inert = confirmDlg.open || scopeDlg.open || discardDlg.open;
    updateXUi();
    saveDraft();
  }
});
menuDlg.addEventListener('close', () => { document.body.classList.remove('settings-open'); });
menuDlg.addEventListener('cancel', (ev) => { ev.preventDefault(); menuBack(); });
for (const d of [dlg, menuDlg, searchDlg, backupDlg, xdDlg, catsDlg, notifyDlg, taskDlg]) {
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
let edBase = null; // 開いた時点のフォームの写し。null は「破棄確認が必要」（復元した下書き）
let editing = null; // 描画ID（通常予定は id、繰り返しの回は parentId@occurrenceKey）
const F = {
  title: $('#f-title'), all: $('#f-all'), start: $('#f-start'), end: $('#f-end'), place: $('#f-place'), notes: $('#f-notes'),
  rfreq: $('#f-rfreq'), rend: $('#f-rend'), rcount: $('#f-rcount'), runtil: $('#f-runtil'), dest: $('#f-dest'),
};
const R = { toggle: $('#rtoggle'), panel: $('#rpanel'), sum: $('#rsum'), desc: $('#rdesc'), days: $('#rdays-wrap'), end: $('#rend-wrap'), countL: $('#rcount-l'), untilL: $('#runtil-l'), err: $('#rerror') };
let rsel = [], autoDays = true;
// iPhone の予定（ext）の編集状態。Duo の resolve/commit/outbox には流さない。null は Duo の予定／新規。
let extEd = null; // { before, detail, cal, alarms0, gen }
let alarms; // 編集中の通知。undefined=項目なし（既存で未設定。触るまで既定を付けない）／配列=明示（[] はなし）

function resolve(id) {
  const pr = parseOccId(id);
  if (pr) {
    const p = state.events.find((e) => e.id === pr.parentId && e.recurrence);
    if (p) return { p, occKey: pr.occKey, occ: occurrenceAt(p, pr.occKey) };
  }
  const p = state.events.find((e) => e.id === id);
  return p ? { p, occKey: null, occ: p } : null;
}
const startDow = () => { const t = parseInput(fullStart(), F.all.checked); return parseKey(t ? dayOf(t) : state.selected).getDay(); };
const startKey = () => { const t = parseInput(fullStart(), F.all.checked); return t ? dayOf(t) : state.selected; };

// 直近に選んだ Duo のカテゴリ（時間軸の仮枠の色に使う）。保存先の選択はカレンダー1行（destSel）。
let lastCat = '';
const defaultCatId = () => (state.categories.find((c) => !c.hidden) ?? state.categories[0])?.id ?? CAT_IDS.none;
// 旧下書き（categoryId / xadd / xcal）を追加先へ読み替える。判断できなければ null（設定の追加先に従う）。
function draftDest(d) {
  const n = normDest(d.dest);
  if (n) return n;
  if (d.xadd === true && d.xcal) return { type: 'iphone', id: String(d.xcal) };
  if (d.xadd === false) return { type: 'duo', id: draftCat(d) };
  return null;
}
// 既存予定の編集の下書き: 保存した dest を優先。古い下書きは categoryId を Duo の予定の先として読み替える。
function draftEditDest(d, id) {
  const n = normDest(d.dest);
  if (n) return n;
  const cur = resolve(id), l = cur?.p.nativeLink;
  if (!cur || l?.state === 'linked' || l?.state === 'pending') return null;
  return state.categories.some((c) => c.id === d.categoryId) ? { type: 'duo', id: d.categoryId } : null;
}
function draftCat(d) {
  const ids = state.categories.map((c) => c.id);
  if (ids.includes(d.categoryId)) return d.categoryId;
  const l = legacyToId(d.cat);
  return l && ids.includes(l) ? l : defaultCatId();
}
function readForm() {
  return {
    title: F.title.value, categoryId: formCat(), dest: destSel, all: F.all.checked, start: fullStart(), end: fullEnd(), place: F.place.value, notes: F.notes.value,
    rfreq: F.rfreq.value, rbyday: [...rsel], rend: F.rend.value, rcount: F.rcount.value, runtil: F.runtil.value, ropen: !R.panel.hidden, autoDays,
    alarms,
  };
}
function saveDraft() {
  if (extEd) return; // iPhone の予定の本文はローカル下書きにしない
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, ...readForm() })); } catch { /* 無視 */ }
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* 無視 */ } }
// 日時の編集状態（js/datetime.js）。入力欄の文字は従来どおり保存の入口で、状態は触っていない値を丸めず保つための裏付け。
let dt = null;
// 日付は文字の欄、時刻は dt（時刻のカプセル）。保存・下書き・検証へは「日付 時刻」の一つの文字に組み立てる。
const slash = (iso) => iso.slice(0, 10).replaceAll('-', '/');
const fullStart = () => (F.all.checked || !dt ? F.start.value : `${F.start.value} ${dt.start.slice(11, 16)}`);
const fullEnd = () => (F.all.checked || !dt ? F.end.value : `${F.end.value} ${dt.end.slice(11, 16)}`);
// 時刻カプセル・長さ・時分のマス（js/datetime-ui.js）。状態は dt が持ち、日付の欄へ写す。
function afterTimeEdit() {
  syncDateFields();
  tui.render();
  dui.render();
  onFormChange();
}
// 日付のカプセル。値（F.start / F.end の value）は保存の入口の「2026/11/12」。表示は dateLabel。
function syncDateFields() { if (dt) { F.start.value = slash(dt.start); F.end.value = slash(dt.end); } }
const dui = createDateUi({
  box: $('#dtbox'), start: $('#f-start'), end: $('#f-end'), rows: { start: $('#row-s'), end: $('#row-e') }, pop: $('#dpop'),
  chips: $('#dp-chips'), title: $('#dp-title'), prev: $('#dp-prev'), next: $('#dp-next'), heads: $('#dp-heads'), grid: $('#dp-grid'),
}, {
  get: () => dt,
  buzz: () => { haptic('light').catch(() => {}); },
  holiday: (k) => state.holidayRed && !!holidayOf(k),
  pick: (which, k) => { if (!dt) return; dt = which === 'start' ? setStartDate(dt, k) : pickEndDate(dt, k); afterTimeEdit(); },
});
const tui = createTimeUi({
  box: $('#dtbox'), start: $('#f-stime'), end: $('#f-etime'), badge: $('#f-eday'), dur: $('#f-dur'), pop: $('#tpop'),
  rows: { start: $('#row-s'), end: $('#row-e') }, hours: $('#tp-h'), mins: $('#tp-m'), minNote: $('#tp-note'),
}, {
  get: () => dt,
  buzz: () => { haptic('light').catch(() => {}); },
  setTime: (which, h, m) => { if (!dt) return; dt = (which === 'start' ? setStartTime : setEndTime)(dt, h, m); afterTimeEdit(); },
  setDuration: (min) => { if (!dt) return; dt = setDuration(dt, min); afterTimeEdit(); },
});
// 繰り返しの終了日: 予定の日付と同じカプセル＋小さな月。値は F.runtil.value（「2026/12/31」。旧下書きと同じ形）。
const holidayMemo = (k) => state.holidayRed && !!holidayOf(k);
const untilUi = createDateField(F.runtil, {
  after: R.untilL, scope: $('#rpanel'), label: '終了日', empty: '終了日を選ぶ',
  get: () => { const u = parseInput(F.runtil.value, true); return u ? dayOf(u) : ''; },
  min: () => startKey(),
  holiday: holidayMemo,
  buzz: () => { haptic('light').catch(() => {}); },
  set: (k) => { F.runtil.value = slash(k); fireInput(F.runtil); },
});
function applyAllDayUi() {
  const all = F.all.checked;
  $('#dtbox').classList.toggle('allday', all);
  // 大文字（月の文字「大」またはシステムの文字サイズが大きいとき）は時を4列×6行・52pt以上に組み替える
  $('#dtbox').classList.toggle('dtlarge', state.monthTextSize === 'large' || parseFloat(getComputedStyle(document.documentElement).fontSize) > 17);
  tui.close();
  dui.close();
  tui.render();
  dui.render();
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
  if (R.untilL.hidden) untilUi.close();
  untilUi.render();
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
  $('#edtitle').textContent = id || extEd ? '予定を編集' : '予定を追加';
  F.title.value = values.title; F.all.checked = values.all;
  F.start.value = values.start; F.end.value = values.end; F.place.value = values.place; F.notes.value = values.notes || '';
  F.rfreq.value = ['daily', 'weekly', 'monthly', 'yearly'].includes(values.rfreq) ? values.rfreq : 'none';
  F.rend.value = ['count', 'until'].includes(values.rend) ? values.rend : 'none';
  F.rcount.value = values.rcount ?? '10';
  F.runtil.value = values.runtil || values.start.slice(0, 10);
  rsel = (values.rbyday || []).map(Number).filter((n) => n >= 0 && n <= 6);
  autoDays = values.autoDays !== false && !id;
  $('#delete').hidden = !id || !!extEd;
  $('#copyrow').hidden = !(PASTE_ENTRY && id && !extEd);
  $('#error').textContent = '';
  applyExtUi();
  R.err.textContent = '';
  applyAllDayUi();
  dt = stateFromInput(values.start, values.end, values.all, extEd?.before.rawEnd);
  syncDateFields(); // 日付のカプセルは日付だけ。時刻は dt（未操作の 10:07 を丸めない）
  applyAllDayUi();
  setRepeatOpen(!!values.ropen);
  destSel = extEd ? null : normDest(values.dest);
  { const d0 = destEff(); lastCat = d0.type === 'duo' ? d0.id : lastCatOk(); }
  closeDestPop(false);
  alarms = Array.isArray(values.alarms) ? values.alarms.map((a) => ({ ...a })) : undefined;
  updateRepeatUi();
  updateAlarmUi();
  if (extEd) extEd.alarms0 = JSON.stringify(alarms ?? null);
  if (NATIVE) refreshNotifyPerm().then(() => { if (dlg.open) updateAlarmUi(); });
  edBase = editSnap();
  dlg.show();
  syncInert();
  syncScrim();
  if (focus) F.title.focus({ preventScroll: true });
}
// iPhone の予定の編集シートの見た目（カテゴリ→カレンダー、繰り返しは表示だけ、札、案内）。extEd が null なら通常に戻す。
function applyExtUi() {
  const x = extEd;
  document.querySelector('#form .repeat').hidden = !!x;
  $('#rfix').hidden = !(x && x.before.recurring);
  $('#ed-tag').hidden = !x;
  $('#ext-gone').hidden = true;
  if (!x) return;
  const b = x.before, d = x.detail;
  $('#ed-tag').innerHTML = `<i class="cdot" style="background:${esc(b.color)}" aria-hidden="true"></i>${esc(subLabel(b))}${b.recurring ? ' <span aria-hidden="true">↻</span>' : ''}`;
  const rule = d.rule && d.rule.freq ? ruleSummary(d.rule, b.start) : '';
  $('#rfix-sum').textContent = rule || d.ruleText || '繰り返し';
}
// 新規予定のカレンダー選択（1行）。destSel はシート内の一時選択（null = 設定の追加先に従う）。設定値は書き換えない。
let destSel = null;
const isNewSheet = () => !editing && !extEd;
function destExists(d) {
  if (!d) return false;
  if (d.type === 'duo') return state.categories.some((c) => c.id === d.id);
  return extActive() && writable(X.calendars).some((c) => c.id === d.id);
}
// 既存予定の現在の保存先（新規は null）。ext と linked / pending は iPhone のカレンダー、それ以外は Duo のカテゴリ。
function curDest() {
  if (extEd) return { type: 'iphone', id: extEd.before.calId };
  const cur = editing ? resolve(editing) : null;
  if (!cur) return null;
  const l = cur.p.nativeLink;
  if (l && (l.state === 'linked' || l.state === 'pending')) return { type: 'iphone', id: l.calendarId };
  return { type: 'duo', id: state.categories.some((c) => c.id === cur.p.categoryId) ? cur.p.categoryId : CAT_IDS.none };
}
// 現在先を変えられない: 追加中（pending）、読み取り専用、カレンダー不明・権限なし。表示だけして編集は禁止。
function destLocked() {
  const c = curDest();
  if (!c || c.type !== 'iphone' || extEd) return false;
  if (resolve(editing)?.p.nativeLink?.state === 'pending') return true;
  const cal = X.calendars.find((x) => x.id === c.id);
  return !(extActive() && cal && cal.allowsModify);
}
// iPhone の予定（ext / linked / pending）は Duo へ戻せない。移せるのは書き込める iPhone カレンダーだけ。
const destAllowed = (d) => destExists(d) && (curDest()?.type !== 'iphone' || d.type === 'iphone');
const destEff = () => {
  if (isNewSheet()) return destExists(destSel) ? destSel : destNow();
  return (destSel && !destLocked() && destAllowed(destSel) ? destSel : curDest()) || destNow();
};
// フォームの categoryId: Duo の先はそのカテゴリ。linked / pending のままなら既存を保持。Duo から iPhone へ移すときだけ none。
function formCat() {
  const d = destEff();
  if (d.type === 'duo') return d.id;
  const cur = !extEd && editing ? resolve(editing) : null;
  if (cur && curDest()?.type === 'iphone') return state.categories.some((c) => c.id === cur.p.categoryId) ? cur.p.categoryId : CAT_IDS.none;
  return CAT_IDS.none;
}
// 未取得のカレンダーは保存済みの名前と安全な色で表示する。
function savedCal(id) {
  if (extEd?.before.calId === id) return { name: extEd.before.calName, color: extEd.before.color };
  const l = editing ? resolve(editing)?.p.nativeLink : null;
  return l?.calendarId === id ? { name: l.calName } : null;
}
function destInfo(d) {
  if (d.type === 'iphone') {
    const c = X.calendars.find((x) => x.id === d.id);
    if (c) return { name: `${c.title}（${c.source}）`, color: c.color, hidden: !link.calendarIds.includes(c.id) };
    const sv = savedCal(d.id);
    return { name: sv?.name || 'iPhone', color: sv?.color || '#68716A', hidden: false };
  }
  const c = state.categories.find((x) => x.id === d.id);
  return { name: c ? c.name : UNCATEGORIZED.name, color: c ? c.color : '#5A5E62', hidden: !!c?.hidden };
}
function destGroups(locked = curDest()?.type === 'iphone') {
  const byVis = (l) => [...l.filter((x) => !x.hidden), ...l.filter((x) => x.hidden)];
  const gs = locked ? [] : [{ head: 'Duo（この端末だけ）', items: byVis(state.categories.map((c) => ({ type: 'duo', id: c.id, name: c.name, color: c.color, hidden: !!c.hidden }))) }];
  if (extActive()) {
    for (const g of groupBySource(writable(X.calendars))) {
      gs.push({ head: `iPhone ・ ${g.heading}`, items: byVis(g.items.map((c) => ({ type: 'iphone', id: c.id, name: c.title, color: c.color, hidden: !link.calendarIds.includes(c.id) }))) });
    }
  }
  return gs;
}
const destPop = $('#dest-pop');
// 候補はシートの中の専用ページ（js/destination-ui.js）。開いている間はフォームを inert にするだけで、DOM・値・dirty・下書きは触らない。
const destPage = createDestPage(destPop, {
  title: 'カレンダー',
  settings: true,
  bodyHtml() {
    const cur = destEff(), raw = destGroups(), gs = visibleDestGroups(raw, curDest());
    return (allDestHidden(raw) ? '<p class="dnote">すべて非表示になっています。設定 › カレンダーで ✓ を付けると表示されます。</p>' : '') + destRowsHtml(gs, cur);
  },
  onOpen() { form.inert = true; F.dest.setAttribute('aria-expanded', 'true'); },
  onClose(focus) {
    form.inert = false;
    F.dest.setAttribute('aria-expanded', 'false');
    if (focus) F.dest.focus({ preventScroll: true });
  },
  onPick(d) {
    destSel = { type: d.type, id: d.id };
    if (destSel.type === 'duo') lastCat = destSel.id;
    updateXUi();
    saveDraft();
  },
  onSettings() { openCalSettingsFromEditor(); },
});
const renderDestPop = () => destPage.render();
const closeDestPop = (focus = true) => destPage.close(focus);
const openDestPop = () => destPage.open();
F.dest.addEventListener('click', () => { if (!destPage.isOpen()) openDestPop(); });
// 下端の「表示するカレンダーを選ぶ ›」。編集中のフォームはそのまま残し、設定 › カレンダーを重ねる。戻る／閉じるで未保存のフォームへ戻る。
let menuFromEditor = false;
function openCalSettingsFromEditor() {
  closeDestPop(false);
  if (menuDlg.open) return;
  menuFromEditor = true;
  dlg.inert = true;
  setTimeout(() => { openMenu(F.dest); showMenuScreen('calendar'); }, 0); // 同じクリックが外側の「メニューを閉じる」処理へ届いた後で開く
}
menuDlg.addEventListener('close', () => {
  if (!menuFromEditor) return;
  menuFromEditor = false;
  if (dlg.open) {
    dlg.inert = confirmDlg.open || scopeDlg.open || discardDlg.open;
    updateXUi();
    saveDraft();
    F.dest.focus({ preventScroll: true });
  }
});
dlg.addEventListener('close', () => { closeDestPop(false); });
// すべての編集で「カレンダー」1行を出す。編集中のリンク済み予定には案内を出す。
function updateXUi() {
  const cur = editing ? resolve(editing) : null;
  const linked = !!(editing && cur && cur.p.nativeLink?.state === 'linked');
  $('#xlinked').hidden = !linked;
  $('#xext').hidden = !extEd;
  const lock = destLocked();
  F.dest.disabled = lock;
  if (lock) closeDestPop(false);
  const d = destInfo(destEff());
  $('#dest-name').textContent = d.name;
  $('#dest-dot').style.background = d.color;
  if (destPage.isOpen()) renderDestPop();
}
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
    rcount: String(r?.count ?? 10), runtil: r?.until ? r.until.replaceAll('-', '/') : '', ropen: false, autoDays: false, alarms: o.alarms,
  };
}
function openEditor(id, from, day = state.selected, startMin = null, opts = {}) {
  if (id && isXId(id)) { openExtDetail(id, from); return; }
  extEd = null;
  origins.set(dlg, from || document.activeElement);
  const cur = id ? resolve(id) : null;
  const endMin = opts.endMin ?? (startMin == null ? null : startMin + 60);
  const t0 = startMin == null ? '10:00' : hhmm(startMin), t1 = startMin == null ? '11:00' : endMin > 1439 ? '23:59' : hhmm(endMin);
  const dd = day.replaceAll('-', '/');
  const values = cur
    ? valuesFrom(cur)
    : { title: '', categoryId: defaultCatId(), all: !!opts.all, start: opts.all ? dd : `${dd} ${t0}`, end: opts.all ? (opts.endDay || day).replaceAll('-', '/') : `${dd} ${t1}`, place: '', notes: '', rfreq: 'none', rbyday: [], rend: 'none', rcount: '10', runtil: '', ropen: false, alarms: defaultAlarms(!!opts.all, loadNotify()), dest: null };
  showEditor(values, cur ? id : null);
  saveDraft();
}
function closeEditor() {
  if (!extEd) clearDraft();
  if (confirmDlg.open) confirmDlg.close();
  if (scopeDlg.open) scopeDlg.close();
  if (discardDlg.open) discardDlg.close();
  extEd = null;
  closePanel(dlg);
}
function onFormChange(ev) {
  if (AL.sel.includes(ev?.target)) return;
  if (F.rfreq.value === 'weekly' && (autoDays || !rsel.length)) { rsel = [startDow()]; autoDays = true; }
  if (F.rend.value === 'until' && !F.runtil.value.trim()) F.runtil.value = startKey().replaceAll('-', '/');
  updateRepeatUi();
  updateAlarmUi();
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
  // 終日にする前の時刻は状態が覚えていて、OFF で戻る（10:07 も 10:07 のまま）。日付の欄はそのまま。
  if (dt) dt = setAll(dt, all);
  applyAllDayUi();
  alarms = convertAlarms(alarms, all, loadNotify());
  updateAlarmUi();
  saveDraft();
});
$('#close').addEventListener('click', () => fadeClose(dlg, closeEditor));

// ---------- 予定のポップアップを閉じる（08 §5）: 幕タップ・下に引く・0.2秒のフェード ----------
// 未保存の変更の有無（開閉だけの ropen、遅れて決まる既定の追加先、自動曜日は数えない）。
function editSnap() { const { ropen, autoDays: _a, ...rest } = readForm(); if (isNewSheet()) rest.categoryId = ''; else rest.dest = destEff(); return JSON.stringify(rest); }
const editorDirty = () => edBase == null || edBase !== editSnap();
// 幕が受け持つポップアップ（最前面が編集シートか iPhone の予定詳細のときだけ）
const popupTop = () => [dlg, xdDlg, taskDlg].find((d) => d.open && panels.every((p) => p === d || p === dlg || p === xdDlg || p === taskDlg || !p.open)) || null;
function syncScrim() { scrim.hidden = !(dlg.open || xdDlg.open || taskDlg.open); }
for (const d of [dlg, xdDlg, taskDlg]) d.addEventListener('close', syncScrim);
dlg.addEventListener('close', () => { if (DF.mode === 'sheet') clearDraftBox(); });
let fading = false, guardUntil = 0, guardAt = null;
// 幕を触って閉じた直後は、同じ場所へ遅れて届く click を下の要素へ通さない（別の場所の操作は妨げない）。
const guardClicks = (x, y) => { guardUntil = performance.now() + 400; guardAt = x == null ? null : { x, y }; };
const ghost = (ev) => performance.now() < guardUntil && (!guardAt || Math.hypot(ev.clientX - guardAt.x, ev.clientY - guardAt.y) < 40);
function fadeClose(d, done) {
  if (fading || !d.open || (d === dlg && extBusy)) return;
  fading = true;
  if (d === dlg) clearDraft(); // フェード中に再読込されても下書きを復元しない
  d.classList.add('fading'); scrim.classList.add('fade');
  setTimeout(() => {
    done();
    d.classList.remove('fading', 'snap'); d.style.transform = ''; d.style.opacity = '';
    scrim.classList.remove('fade'); scrim.style.opacity = '';
    fading = false;
    syncScrim();
  }, 200);
}
const closeXd = () => closePanel(xdDlg);
// 外側タップ・下に引く操作の共通の入口。編集シートは未保存の変更があれば確認を出す。
function dismissPopup(viaScrim, at) {
  const d = popupTop();
  if (!d || fading || (d === dlg && extBusy)) return false;
  if (viaScrim) guardClicks(at?.x, at?.y);
  if (d === dlg) {
    if (editorDirty()) { openDiscard(); return true; }
    fadeClose(dlg, closeEditor);
  } else if (d === taskDlg) {
    if (taskIsDirty()) { openDiscard(taskDlg); return true; }
    fadeClose(taskDlg, closeTask);
  } else fadeClose(xdDlg, closeXd);
  return true;
}
let dcTarget = dlg;
function openDiscard(t = dlg) {
  dcTarget = t;
  t.inert = true;
  discardDlg.show();
  syncInert();
  $('#dc-keep').focus({ preventScroll: true });
}
discardDlg.addEventListener('close', () => {
  syncInert();
  if (dcTarget === taskDlg) { if (taskDlg.open) taskDlg.inert = false; }
  else if (dlg.open && !confirmDlg.open && !scopeDlg.open) dlg.inert = false;
});
$('#dc-keep').addEventListener('click', () => { discardDlg.close(); if (dcTarget === taskDlg) { if (taskDlg.open) { taskDlg.inert = false; $('#tk-title').focus({ preventScroll: true }); } } else if (dlg.open) F.title.focus({ preventScroll: true }); });
$('#dc-drop').addEventListener('click', () => { discardDlg.close(); if (dcTarget === taskDlg) fadeClose(taskDlg, closeTask); else fadeClose(dlg, closeEditor); });
scrim.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); if (popupTop()) dismissPopup(true, { x: ev.clientX, y: ev.clientY }); });
scrim.addEventListener('pointerdown', (ev) => ev.preventDefault());
// 幕の外の click（折り目の帯・遅れて届く click）は、幕が出ている間と閉じた直後は何も起こさない。
document.addEventListener('click', (ev) => {
  const blocked = !scrim.hidden && ev.target !== scrim && !ev.target.closest?.('dialog');
  if (blocked || ghost(ev)) { ev.stopPropagation(); ev.preventDefault(); }
}, true);

// 下に引いて閉じる。つかめるのは見出しの帯と、本文が先頭にあるときの本文。横の動きは別物（月の前後移動は root が受け持つ）。
const PULL_MIN = 80, PULL_FLING = 40;
function initPull(d) {
  let g = null;
  const target = () => !fading;
  const setPos = (dy) => {
    d.style.transform = `translateY(${dy}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - dy / 240));
  };
  const begin = (x, y, scroller) => { g = { x, y, t: performance.now(), dy: 0, on: false, scroller }; };
  const move = (x, y) => { // true = 下に引く操作として扱う（既定動作を止める）
    if (!g) return false;
    const dx = x - g.x, dy = y - g.y;
    if (!g.on) {
      if (Math.abs(dx) > 12 && Math.abs(dx) >= Math.abs(dy)) { g = null; return false; } // 横の動き
      if (dy < 12 || dy < Math.abs(dx) * 1.5) return false;
      if (g.scroller && g.scroller.scrollTop > 0) { g = null; return false; }
      g.on = true; d.classList.remove('snap');
    }
    g.dy = Math.max(0, dy);
    setPos(g.dy);
    return true;
  };
  const end = (cancelled) => {
    const s = g; g = null;
    if (!s || !s.on) return false;
    const fling = (s.dy >= PULL_FLING) && (performance.now() - s.t < 250);
    if (!cancelled && (s.dy >= PULL_MIN || fling)) {
      const c = popupTop();
      if (c === dlg && editorDirty()) { snapBack(); openDiscard(); }
      else if (c === taskDlg && taskIsDirty()) { snapBack(); openDiscard(taskDlg); }
      else dismissPopup(false);
    } else snapBack();
    return true;
  };
  const snapBack = () => {
    d.classList.add('snap'); d.style.transform = ''; scrim.style.opacity = '';
    setTimeout(() => d.classList.remove('snap'), 220);
  };
  // 見出しの帯（pointer。touch-action:none）
  d.addEventListener('pointerdown', (ev) => {
    if (!target() || !ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    if (popupTop() !== d) return;
    const head = ev.target.closest('.formhead,.phead');
    if (!head || ev.target.closest('button,input,select,textarea')) return;
    begin(ev.clientX, ev.clientY, null);
    d.setPointerCapture?.(ev.pointerId);
    g.pid = ev.pointerId;
  });
  d.addEventListener('pointermove', (ev) => { if (g && g.pid === ev.pointerId) move(ev.clientX, ev.clientY); });
  d.addEventListener('pointerup', (ev) => { if (g && g.pid === ev.pointerId) end(false); });
  d.addEventListener('pointercancel', (ev) => { if (g && g.pid === ev.pointerId) end(true); });
  // 本文（touch）。先頭にあるときだけ、下向きの動きをシートの移動にする
  d.addEventListener('touchstart', (ev) => {
    if (!target() || ev.touches.length !== 1 || popupTop() !== d) { g = null; return; }
    const sc = ev.target.closest('.fbody,.pbody');
    if (!sc) return; // 見出し・フッターは pointer 側
    const t = ev.touches[0];
    begin(t.clientX, t.clientY, sc);
  }, { passive: true });
  d.addEventListener('touchmove', (ev) => {
    if (!g || g.pid != null || ev.touches.length !== 1) return;
    const t = ev.touches[0];
    if (move(t.clientX, t.clientY) && ev.cancelable) ev.preventDefault();
  }, { passive: false });
  d.addEventListener('touchend', () => { if (g && g.pid == null) end(false); });
  d.addEventListener('touchcancel', () => { if (g && g.pid == null) end(true); });
}
initPull(dlg);
initPull(xdDlg);
initPull(taskDlg);

// ---------- タスク: 編集シート（PR19） ----------
let TK = null; // { ed, busy }
const tkForm = () => ({ title: $('#tk-title').value, date: $('#tk-date').value, time: $('#tk-time').value, notes: $('#tk-notes').value, notify: TK?.notify });
const taskIsDirty = () => !!TK && taskDirty(TK.ed, tkForm());
// 通知の欄: 期限なしは通知不可。戻した時は利用者が操作した状態（なければ元の状態）を映す。
function tkNotifyUi() {
  const c = $('#tk-notify'), why = $('#tk-notewhy'); if (!c || !TK) return;
  const hasDue = !!$('#tk-date').value;
  c.disabled = !hasDue || !!TK.ed.lock;
  c.checked = hasDue && (typeof TK.notify === 'boolean' ? TK.notify : hasNotify(TK.ed.orig));
  why.textContent = !hasDue ? NOTE_NEED_DUE : c.checked ? ($('#tk-time').value ? '期限の時刻に通知します。' : '期限の日の 8:00 に通知します。') : '';
}
function tkUi() {
  tkNotifyUi();
  const lock = !!TK.ed.lock, gone = TK.gone;
  $('#tk-save').hidden = lock || gone;
  $('#tk-del').hidden = lock || gone;
  $('#tk-del').disabled = TK.busy;
  $('#tk-save').disabled = TK.busy;
  $('#tk-err').textContent = TK.ed.err || '';
  $('#tk-note').hidden = gone;
}
// 期限は予定と同じ日付のカプセル＋小さな月、時刻は「時刻を入れる」で時分のマス。値は各カプセルの .value（'YYYY-MM-DD' / 'HH:mm'、なしは ''）。
function tkFields() {
  const lock = !!TK.ed.lock, scope = $('#tk-body').firstElementChild;
  const dateEl = $('#tk-date'), timeEl = $('#tk-time'), on = $('#tk-timeon');
  let dUi = null, tUi = null;
  const sync = () => { on.disabled = lock || !dateEl.value; on.checked = !!timeEl.value; timeEl.hidden = !timeEl.value; dUi.render(); tUi.render(); };
  const buzz = () => { haptic('light').catch(() => {}); };
  dUi = createDateField(dateEl, {
    after: $('#tk-daterow'), scope, label: '期限', empty: '期限なし', canOpen: () => !lock, holiday: holidayMemo, buzz,
    get: () => dateEl.value,
    set: (k) => { dateEl.value = k; sync(); fireInput(dateEl); },
    clear: { label: '期限をなしにする', on: () => { if (timeEl.value) TK.lastTime = timeEl.value; dateEl.value = ''; timeEl.value = ''; sync(); fireInput(dateEl); } },
  });
  tUi = createTimeField(timeEl, {
    after: $('#tk-timerow'), scope, label: '期限の時刻', canOpen: () => !lock, buzz,
    get: () => timeEl.value,
    set: (v) => { timeEl.value = v; sync(); fireInput(timeEl); },
  });
  on.addEventListener('change', () => {
    if (on.checked) timeEl.value = TK.lastTime || TK.ed.orig.due?.time || '09:00';
    else { TK.lastTime = timeEl.value; timeEl.value = ''; tUi.close(); }
    sync(); fireInput(timeEl);
  });
  sync();
}
function openTask(id, from) {
  const r = RM.data?.reminders.find((x) => x.itemId === id);
  if (!r || anyPanel()) return;
  TK = { ed: openTaskEditor(r, RM.data.lists), busy: false, gone: false, notify: undefined }; tkKey = r.itemId;
  $('#tk-body').innerHTML = taskEditorHtml(TK.ed);
  tkFields();
  tkUi();
  openPanel(taskDlg, from);
  const t = $('#tk-title'); (t.disabled ? $('#tk-close') : t).focus({ preventScroll: true });
}
let tkKey = '';
tkDrop = () => { if (taskDlg.open) closeTask(); };
function closeTask() { tkKey = TK?.ed.itemId || tkKey; TK = null; closePanel(taskDlg); }
taskDlg.addEventListener('close', () => {
  const key = TK?.ed.itemId || tkKey; TK = null; tkKey = '';
  const o = origins.get(taskDlg);
  if (key && !o?.isConnected) root.querySelector(`[data-key="rm:${CSS.escape(key)}"] .rmbody`)?.focus({ preventScroll: true });
});
$('#tk-body').addEventListener('change', (e) => { if (TK && e.target.id === 'tk-notify') { TK.notify = e.target.checked; tkNotifyUi(); } });
$('#tk-body').addEventListener('input', (e) => { if (TK && (e.target.id === 'tk-date' || e.target.id === 'tk-time')) tkNotifyUi(); });
$('#tk-close').addEventListener('click', () => dismissPopup(false));
$('#tk-del').addEventListener('click', () => {
  if (!TK || TK.busy || TK.ed.lock || TK.gone) return;
  const id = TK.ed.itemId;
  fadeClose(taskDlg, closeTask);
  deleteTask(id);
});
$('#tk-save').addEventListener('click', async () => {
  if (!TK || TK.busy || TK.ed.lock) return;
  const t = TK, orig = t.ed.orig;
  t.busy = true; t.ed.err = ''; tkUi();
  const r = await saveTask(localCall, orig, tkForm());
  if (TK !== t) return;
  t.busy = false;
  if (r.ok) {
    if (!r.noop && RM.data) { RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === orig.itemId ? r.reminder : x)) }; RM.sig = ''; render(); scheduleTasks(); }
    fadeClose(taskDlg, closeTask);
    if (!r.noop) say('タスクを保存しました。');
    return;
  }
  t.ed.err = r.invalid || taskErrText(r.code, 'もう一度お試しください。');
  if (r.code === 'NOT_FOUND') { t.gone = true; t.ed.err = 'このタスクは削除されています。'; loadTasks(); } // 作り直さない
  tkUi(); say(t.ed.err);
});
// 保存・削除の確定（1トランザクション）。
// iPhone へ反映する操作（ops）は、予定の保存と同じトランザクションで送信待ちへ積む。
async function commit(plan, { ops = [] } = {}) {
  if (ops.length) OBX.items = await db.applyChangesWithOutbox({ ...plan, outbox: (cur) => mergeOps(cur, ops, OBX.inflight) });
  else await db.applyChanges(plan);
  const gone = new Set([...plan.dels, ...plan.puts.map((e) => e.id)]);
  state.events = [...state.events.filter((e) => !gone.has(e.id)), ...plan.puts];
  bumpRevision();
  requestNotifySync('edit');
  if (ops.some((o) => o.kind !== 'drop')) requestFlush();
  if (plan.puts.some(hasDuoAlarms)) askNotifyPerm(); // 結果を待たない。拒否されても保存は成立
}
// 送信待ちを作る入力（新系列の id がまだ確定していない np への操作も、確定後に送る操作として積める）。
const opsCtx = (extra = {}) => ({ waiting: new Set(OBX.items.filter((o) => o.newParentId).map((o) => o.newParentId)), ...extra });
const planOps = (prev, plan, scope, occKey, form, extra) => (NATIVE ? planNativeOps(prev, plan, scope, occKey, form, opsCtx(extra)) : { ops: [], plan });
const SAVE_FAIL = 'もう一度お試しください。';

let saving = false;
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (saving || extBusy) return;
  const r = validateDraft(extEd ? { ...readForm(), alarms: undefined } : readForm(), [...state.categories.map((c) => c.id), CAT_IDS.none]);
  $('#error').textContent = ''; R.err.textContent = '';
  if (r.error) {
    if (r.where === 'repeat') { setRepeatOpen(true); R.err.textContent = r.error; } else $('#error').textContent = r.error;
    return;
  }
  if (extEd) { submitExt(r.event); return; }
  const cur = editing ? resolve(editing) : null;
  if (cur?.occKey) { openScope('edit', cur, r.event); return; }
  const prev = cur?.p;
  const item = { ...prev, ...r.event, id: prev ? prev.id : newId(), exdates: prev?.exdates ?? [], overrides: prev?.overrides ?? {}, updatedAt: Date.now() };
  if (!item.recurrence) { item.exdates = []; item.overrides = {}; }
  // 新規の通常予定だけ: アプリDBへ pending で確定してから、iPhone 側の作成を1回だけ呼ぶ。
  const dsel = destEff();
  const mv = prev ? moveKind(prev, dsel) : null;
  const xwant = prev ? mv === 'toX' : dsel.type === 'iphone';
  if ((xwant || mv === 'x2x') && !destExists(dsel)) { $('#error').textContent = 'このカレンダーには追加できません。別のカレンダーを選んでください。'; return; }
  if (xwant && prev && !moveOk(prev)) { $('#error').textContent = MOVE_PARTIAL; return; }
  if (xwant) toPending(item, dsel, prev);
  const { ops, plan: splan } = prev ? planOps(prev, { puts: [item], dels: [] }, 'all', null, r.event, mv === 'x2x' ? { moveTo: dsel.id } : undefined) : { ops: [], plan: { puts: [item], dels: [] } };
  saving = true;
  try {
    await commit(splan, { ops });
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
});

// 既存予定の保存先の変更。'toX' = Duo → iPhone（作成して結びつける）、'x2x' = iPhone → 別の iPhone（updateEvent で移動）、null = 変更なし。
const MOVE_PARTIAL = 'この予定は一部の回が個別に変更されているため、iPhone のカレンダーへは移せません。';
function moveKind(prev, d) {
  const c = prev.nativeLink?.state === 'linked' || prev.nativeLink?.state === 'pending' ? { type: 'iphone', id: prev.nativeLink.calendarId } : { type: 'duo', id: prev.categoryId };
  if (c.type === 'duo') return d.type === 'iphone' ? 'toX' : null;
  return d.type === 'iphone' && d.id !== c.id ? 'x2x' : null;
}
// 個別の変更・削除指定を持つ系列は、そのまま iPhone へ作れない（「すべて」で保存するときは解除される）。
const moveOk = (p) => !p.recurrence || (!(p.exdates || []).length && !Object.keys(p.overrides || {}).length);
// Duo の予定を iPhone へ移す: 同じ予定のまま pending の結びつきを付ける。分類は none にし、元の分類は失敗時の復帰用に残す。
function toPending(item, d, prev) {
  if (prev) item.moveFromCat = prev.categoryId;
  item.categoryId = CAT_IDS.none;
  item.nativeLink = { state: 'pending', requestId: newId(), calendarId: d.id };
}

// ---------- 範囲シート（この予定のみ／これ以降すべて／すべて） ----------
let scopeCtx = null; // { kind:'edit'|'delete', cur, ev }
function openScope(kind, cur, ev) {
  scopeCtx = { kind, cur, ev };
  const del = kind === 'delete', occ = cur.occ;
  const dn0 = del ? deleteNotice(cur.p) : null;
  $('#sc-title').textContent = del ? (dn0?.duoOnly ? 'Duo から削除する範囲' : '削除する範囲') : '変更する範囲';
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
    if (moveKind(cur.p, destEff())) {
      scopeDlg.querySelector('[data-scope="only"]').disabled = true;
      scopeDlg.querySelector('[data-scope="following"]').disabled = true;
      notes.push('カレンダーの変更は『すべて』でのみできます。');
    }
  }
  $('#sc-note').textContent = notes.join(' ');
  const dn = dn0;
  $('#sc-warn').hidden = !dn?.text;
  $('#sc-warn').textContent = dn ? dn.text(occ.title) : '';
  dlg.inert = true;
  scopeDlg.show();
  syncInert();
  (scopeDlg.querySelector('[data-scope]:not(:disabled)'))?.focus({ preventScroll: true });
}
scopeDlg.addEventListener('close', () => {
  if (!confirmDlg.open && !scopeDlg.open) {
    dlg.inert = false; xdDlg.inert = false;
    if (dlg.open) (scopeCtx?.kind === 'delete' && !scopeCtx.ext ? $('#delete') : form.querySelector('[type=submit]')).focus({ preventScroll: true });
    else if (xdDlg.open) $('#xd-del').focus({ preventScroll: true });
  }
});
function cancelScope() { scopeDlg.close(); }
$('#sc-cancel').addEventListener('click', cancelScope);
scopeDlg.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-scope]');
  if (!b || b.disabled || !scopeCtx) return;
  if (scopeCtx.ext) { handleExtScope(b.dataset.scope); return; }
  const scope = b.dataset.scope, { kind, cur, ev: form0 } = scopeCtx;
  if (kind === 'delete') {
    const dn = deleteNotice(cur.p);
    if (scope === 'all' && dn) { askDelete(scope, cur); return; } // iPhone と結びついた「すべて」だけ2段目を残す
    await runDelete({ scope, cur, duoOnly: !!dn?.duoOnly, fb: !!dn?.fallback }, scopeDlg); // 範囲の選択が確認（Duo だけの予定の「すべて」も即実行）
    return;
  }
  const dsel = destEff(), mv = moveKind(cur.p, dsel);
  try {
    let plan0 = planEdit(cur.p, cur.occKey, scope, form0, newId);
    if (mv === 'toX' && scope === 'all') plan0 = { ...plan0, puts: plan0.puts.map((e) => { if (e.id !== cur.p.id) return e; const n = { ...e }; toPending(n, dsel, cur.p); return n; }) };
    const { ops, plan } = planOps(cur.p, plan0, scope, cur.occKey, form0, mv === 'x2x' && scope === 'all' ? { moveTo: dsel.id } : undefined);
    await commit(plan, { ops });
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
  if (mv === 'toX' && scope === 'all') createNative(cur.p.id); else say('予定を保存しました。');
});

// ---------- 削除（通常は確認のみ、繰り返しは範囲→確認） ----------
let pendingDelete = null; // { scope, cur, single, duoOnly }
let xc = null; // iPhone の予定の確認ダイアログの内容 { mode:'single'|'all'|'conflict'|'gone', scope, force }
// iPhone と結びついた予定の削除の注意（07）。text(予定名) は本文、duoOnly は権限がない／書き込めないとき Duo だけで消す選択。
// 結びついていなければ null。pending でも、新系列の確定待ち（np）は結びつき扱い。
function deleteNotice(p) {
  const l = p.nativeLink;
  if (!(l?.state === 'linked' || (l?.state === 'pending' && OBX.items.some((o) => o.newParentId === p.id)))) return null;
  const cal = X.calendars.find((c) => c.id === l.calendarId);
  const duoOnly = !NATIVE || ['denied', 'restricted', 'writeOnly', 'notDetermined'].includes(X.perm) || (!!cal && !cal.allowsModify);
  return duoOnly
    ? { duoOnly, text: () => 'Duo からだけ削除されます。iPhone のカレンダーには残ります。' }
    : { duoOnly, fallback: l.matchedBy === 'fallback' && !l.fallbackDeleteConfirmed, text: (t) => `${t}\niPhone のカレンダーからも削除されます。${l.matchedBy === 'fallback' && !l.fallbackDeleteConfirmed ? `\niPhone のカレンダーの『${t}』も削除されます` : ''}` };
}
function showConfirm(title, cur, duoOnly, dn) {
  $('#deletetitle').textContent = dn ? dn.text(cur.p.title) : cur.p.title;
  $('#dodelete').textContent = duoOnly ? 'Duo から削除' : '削除する';
  void title;
}
function askDelete(scope, cur) {
  const dn = deleteNotice(cur.p);
  pendingDelete = { scope, cur, duoOnly: !!dn?.duoOnly, fb: !!dn?.fallback };
  const day = dayLabel(dayOf(cur.occ.start));
  void day;
  $('#confirmtitle').textContent = 'すべての繰り返しを削除しますか？';
  $('#deletetitle').textContent = dn.duoOnly ? dn.text() : 'iPhone のカレンダーからも削除されます。'; // 予定名は付けない
  $('#dodelete').textContent = dn.duoOnly ? 'Duo から削除' : 'すべて削除';
  scopeDlg.close();
  dlg.inert = true;
  confirmDlg.show();
  syncInert();
  $('#canceldelete').focus({ preventScroll: true });
}
$('#delete').addEventListener('click', () => {
  const cur = editing ? resolve(editing) : null;
  if (cur?.occKey) { openScope('delete', cur); return; }
  const dn = cur ? deleteNotice(cur.p) : null;
  pendingDelete = cur ? { scope: 'only', cur, single: true, duoOnly: !!dn?.duoOnly, fb: !!dn?.fallback } : null;
  $('#confirmtitle').textContent = 'この予定を削除しますか？';
  if (cur) showConfirm('', cur, !!dn?.duoOnly, dn);
  else { $('#deletetitle').textContent = ''; $('#dodelete').textContent = '削除する'; }
  confirmDlg.show();
  dlg.inert = true;
  syncInert();
  $('#canceldelete').focus({ preventScroll: true });
});
confirmDlg.addEventListener('close', () => {
  const c = xc;
  xc = null;
  $('#canceldelete').hidden = false; $('#dodelete').classList.add('danger'); $('#dodelete').disabled = false;
  if (!scopeDlg.open) {
    dlg.inert = false; xdDlg.inert = false;
    if (dlg.open) (extEd ? F.title : $('#delete')).focus({ preventScroll: true });
    else if (xdDlg.open) $('#xd-del').focus({ preventScroll: true });
  }
  if (c?.mode === 'gone') { extEd = null; closeEditor(); loadExt(true); } // 「閉じる」（Escape も同じ）で編集シートも閉じる
});
function cancelConfirm() {
  const pd = pendingDelete, c = xc;
  confirmDlg.close();
  if (c) { if (c.mode === 'all') openScopeExt('delete'); return; }
  if (pd && !pd.single) openScope('delete', pd.cur); // 最終確認キャンセルは範囲へ戻る
}
$('#canceldelete').addEventListener('click', cancelConfirm);
let deleting = false;
// 削除の実行部（範囲の直接選択・最終確認・単発で共通）。from は閉じるダイアログ。失敗時は何も変えずエラーを出す。
async function runDelete(pd, from) {
  if (deleting) return;
  deleting = true;
  try {
    if (pd?.fb && !pd.duoOnly) { // 代わりの照合で結びついた予定の最初の削除を確定した。以後は追加の文を出さない（キャンセルでは消費しない）
      const rid = pd.cur.p.nativeLink.requestId;
      const ack = await db.applyAck({ keys: [pd.cur.p.id], update: (raw) => (raw.nativeLink?.requestId === rid && raw.nativeLink.state === 'linked' ? { ...raw, nativeLink: { ...raw.nativeLink, fallbackDeleteConfirmed: true } } : null) });
      applyEvents(ack.events);
      pd.cur = { ...pd.cur, p: state.events.find((e) => e.id === pd.cur.p.id) || pd.cur.p };
    }
    if (pd && !pd.single) {
      // この明示選択（Duo から削除）では iPhone への削除を積まず、同じ範囲の未送信の更新も止める。
      const { ops } = planOps(pd.cur.p, null, pd.scope, pd.cur.occKey, null, { dropOnly: pd.duoOnly });
      await commit(planDelete(pd.cur.p, pd.cur.occKey, pd.scope), { ops });
    } else {
      const prev = pd ? pd.cur.p : null;
      const { ops } = prev ? planOps(prev, null, 'all', null, null, { dropOnly: pd.duoOnly }) : { ops: [] };
      await commit({ puts: [], dels: [editing] }, { ops });
    }
  } catch { from.close(); $('#error').textContent = '削除できませんでした。'; deleting = false; return; }
  pendingDelete = null;
  scopeDlg.close();
  confirmDlg.close();
  closeEditor();
  render();
  say('予定を削除しました。');
  deleting = false;
}
$('#dodelete').addEventListener('click', () => {
  if (xc) { if (xc.mode === 'gone') confirmDlg.close(); else runExtDelete(xc.scope, !!xc.force, confirmDlg); return; }
  runDelete(pendingDelete, confirmDlg);
});

// ---------- その他メニュー ----------
const MENU_TITLES = { root: '設定', general: '一般', display: '表示形式', calendar: 'カレンダー', reminders: 'タスク', google: 'Google カレンダー', details: '詳細' };
let menuScreen = 'root';
function showMenuScreen(name, focus = true, opener = null) {
  menuScreen = name;
  if (name !== 'calendar') { calEdit = false; calDel = null; }
  menuDlg.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.dataset.screen !== name; });
  $('#m-title').textContent = MENU_TITLES[name];
  const back = $('#m-back');
  back.textContent = name === 'root' ? '×' : '‹';
  back.setAttribute('aria-label', name === 'root' ? '設定を閉じる' : '設定に戻る');
  document.body.classList.toggle('settings-open', menuDlg.open);
  menuDlg.querySelector('.mscreens').scrollTop = 0;
  if (focus) (opener?.isConnected ? opener : menuDlg.querySelector(`[data-screen="${name}"] button:not([hidden])`) || back).focus({ preventScroll: true });
  if (name === 'calendar') { setDestPage.close(false); enterCalScreen(); }
  else setDestPage.close(false);
}
// 下層なら1つ戻り（戻り先の行へフォーカス）、一番上なら閉じる。
function menuBack() {
  if (setDestPage.isOpen()) { setDestPage.close(); return; } // 追加先ページが開いていれば、まずそこから戻る
  if (menuScreen === 'root' || (menuFromEditor && menuScreen === 'calendar')) { closePanel(menuDlg); return; }
  const prev = menuScreen;
  showMenuScreen('root', true, menuDlg.querySelector(`[data-go="${prev}"]`));
}
function openMenu(from) {
  calEdit = false; calDel = null; calUndo = null; clearTimeout(calUndoTimer);
  if (menuDlg.open) { closePanel(menuDlg); return; } // 帯の設定ボタン（×）でも閉じる
  $('#m-desk').hidden = L.w < 600 || L.h < 600;
  $('#m-notify').hidden = !NATIVE;
  $('#m-reminders').hidden = false;
  $('#m-gset').hidden = !NATIVE; $('#m-gmsg').hidden = true;
  $('#m-desk').textContent = state.desk ? '卓上表示をやめる' : '卓上表示';
  $('#m-week').textContent = `週の始まり: ${state.weekStart === 1 ? '月曜（日曜にする）' : '日曜（月曜にする）'}`;
  $('#m-sample').hidden = !(state.loaded && state.events.length === 0);
  syncMonthMenu();
  syncModeMenu();
  syncRokuyoMenu();
  syncTaskMenu();
  $('#m-tlz').hidden = !root.querySelector('.tl');
  const cats = state.categories.filter((c) => !c.hidden);
  $('#m-legend').hidden = !cats.length;
  $('#m-legend').innerHTML = cats.length ? `<div class="eyebrow">カテゴリの色</div>${legend()}${xlegend()}` : '';
  updateDiagnostics();
  openPanel(menuDlg, from);
  placeMenu(from);
  showMenuScreen('root');
}
// 設定は白いシート（角丸22）。閉じた／開いた縦は画面幅いっぱい（帯があれば帯の手前まで）、開いた横は左ページ内（折り目と右ページを残す）、卓上は下ペイン。
function placeMenu() {
  const S = safe(), kind = layoutKind();
  const vy = parseFloat(de.style.getPropertyValue('--vy')) || 0, vb = parseFloat(de.style.getPropertyValue('--vb')) || 0;
  const left = S.left + 8;
  let right = (POS.post === 'closed' && POS.bg ? POS.bg.x : L.w - S.right) - 8;
  if (kind === 'spread') right = Math.min(right, L.w / 2 - 10);
  const topMin = Math.max(vy, S.top) + (kind === 'open' ? 90 : 12);
  const top = kind === 'desk' ? Math.max(L.h / 2 + 20, topMin) : topMin;
  const bottom = Math.max(vb, S.bottom) + 12;
  Object.assign(menuDlg.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: `${bottom}px`, width: `${Math.max(200, right - left)}px`, maxWidth: 'none', height: 'auto', maxHeight: 'none' });
}
// 月の時刻は現在の姿勢用（閉じた／それ以外）。文字の大きさは全姿勢共通。
const timeKey = () => (['home', 'browse'].includes(layoutKind()) ? 'monthTimeClosed' : 'monthTimeOpen');
function syncMonthMenu() {
  const t = $('#m-mtime'), z = $('#m-msize');
  t.setAttribute('aria-pressed', String(state[timeKey()]));
  z.setAttribute('aria-pressed', String(state.monthTextSize === 'large'));
  z.textContent = `月の文字: ${state.monthTextSize === 'large' ? '大（標準にする）' : '標準（大にする）'}`;
}
// タスクの設定（Web でも出す）。月の件数のスイッチと、固定の完了表示期間だけ。リスト・同期・許可の設定はない。
function syncTaskMenu() {
  $('#m-tk').hidden = false;
  $('#m-tkmonth').setAttribute('aria-checked', String(remSet.monthTasks));
}
function syncRokuyoMenu() { $('#m-holiday').setAttribute('aria-checked', String(state.holidayRed)); $('#m-rokuyo').setAttribute('aria-checked', String(state.rokuyo)); }
// 月の表現（手帳｜予定名｜全部）。月表示のときだけ。1回選ぶと閉じる。
function syncModeMenu() {
  const on = viewNow() === 'month' && !listShown() && (layoutKind() !== 'spread' || PG().left === 'month' || PG().right === 'month');
  $('#m-mode').hidden = !on;
  $('#m-mode').setAttribute('aria-expanded', 'false');
  $('#m-variant').hidden = true;
  $('#m-variant').innerHTML = on ? variantBtns(isPortrait() ? 'portrait' : layoutKind()) : '';
}
menuDlg.addEventListener('click', (ev) => {
  const mb0 = ev.target.closest('[data-m="tkmonth"]');
  if (mb0) { setRemSettings({ ...remSet, monthTasks: !remSet.monthTasks }); syncTaskMenu(); render(); say(`月にタスクを${remSet.monthTasks ? '表示します' : '表示しません'}。`); return; }
  if (calClick(ev)) return;
  const cv = ev.target.closest('[data-cvis]'), cc = ev.target.closest('[data-cal]');
  if (cv) { calToggleCat(cv.dataset.cvis, cv); return; }
  if (cc) { calToggleIphone(cc.dataset.cal); return; }
  if (ev.target.closest('#lk-req')) { lkRequest(); return; }
  if (ev.target.closest('#lk-settings, [data-act="remsettings"]')) { openSettings(); return; }
  if (ev.target.closest('#lk-reload')) { X.failKey = ''; loadExt(true); renderCalScreen(); return; }
  if (ev.target.closest('#m-dest')) { if (!setDestPage.isOpen()) setDestPage.open(); return; }
  const go = ev.target.closest('[data-go]');
  if (go) { showMenuScreen(go.dataset.go, true); return; }
  if (ev.target.closest('#m-back')) { menuBack(); return; }
  if (ev.target.closest('#m-gset')) { openGoogleSettings(); return; }
  const mb = ev.target.closest('[data-mode]');
  if (mb) { closePanel(menuDlg); const m = mb.dataset.mode; set(m === 'all' ? { monthExpand: true } : { style: m, monthExpand: false }); return; }
  const b = ev.target.closest('[data-m]');
  if (!b) return;
  const m = b.dataset.m, from = origins.get(menuDlg);
  if (b.id === 'touch-check-open') { closePanel(menuDlg); openTouchCheck(); return; }
  else if (m === 'notify') { closePanel(menuDlg, false); openNotify(from); }
  else if (m === 'backup') { closePanel(menuDlg, false); openBackup(from); }
  else if (m === 'desk') { closePanel(menuDlg); set({ desk: !state.desk }); }
  else if (m === 'week') { closePanel(menuDlg); set({ weekStart: state.weekStart === 1 ? 0 : 1 }); say(`週の始まりを${state.weekStart === 1 ? '月曜' : '日曜'}にしました。`); }
  else if (m === 'sample') { closePanel(menuDlg); loadSample(); }
  else if (m === 'mode') { const v = $('#m-variant'); v.hidden = !v.hidden; b.setAttribute('aria-expanded', String(!v.hidden)); if (!v.hidden) v.querySelector('button')?.focus({ preventScroll: true }); }
  else if (m === 'mtime') { set({ [timeKey()]: !state[timeKey()] }); syncMonthMenu(); say(`月表示の時刻を${state[timeKey()] ? '出します' : '出しません'}。`); }
  else if (m === 'holiday') { set({ holidayRed: !state.holidayRed }); syncRokuyoMenu(); say(`祝日を赤で${state.holidayRed ? '表示します' : '表示しません'}。`); }
  else if (m === 'rokuyo') { set({ rokuyo: !state.rokuyo }); syncRokuyoMenu(); say(`六曜を${state.rokuyo ? '出します' : '出しません'}。`); }
  else if (m === 'msize') { set({ monthTextSize: state.monthTextSize === 'large' ? 'normal' : 'large' }); syncMonthMenu(); say(`月の文字を${state.monthTextSize === 'large' ? '大' : '標準'}にしました。`); }
  else if (m === 'tlin' || m === 'tlout') { const T = TLP[paneOf(firstTl())]; setHh(T.hh * (m === 'tlin' ? 1.25 : 0.8)); say(`時間軸を${m === 'tlin' ? '拡大' : '縮小'}しました（1時間 ${Math.round(T.hh)}px）。`); }
  else closePanel(menuDlg);
});
menuDlg.addEventListener('change', (ev) => { if (ev.target.id === 'cat-target') calTarget = ev.target.value; });
document.addEventListener('click', (ev) => {
  if (menuDlg.open && !ev.composedPath().includes(menuDlg) && !ev.target.closest('[data-act="menu"]')) closePanel(menuDlg); // 中身を描き直してもメニュー内のクリックとして扱う
});

// ---------- カテゴリの名前・色の編集（設定 › カレンダー の編集モードから開く1枚。一覧・並べ替え・削除は設定側） ----------
const CT = { body: $('#cat-body'), close: $('#cat-close'), title: $('#cat-title') };
// id が null なら新規。menuFrom は設定から開いたときの元の位置（閉じたら設定 › カレンダー（編集中）へ戻る）。
let cs = { id: null, name: '', color: '', err: '', busy: false, menuFrom: null };
function openCategoryEditor(from, id = null) {
  const c = id ? state.categories.find((x) => x.id === id) : null;
  if (id && !c) return;
  cs = { id, name: c ? c.name : '', color: c ? c.color : newCategory(state.categories, { id: '', name: '' }).color, err: '', busy: false, menuFrom: from || null };
  renderCats();
  if (dlg.open) dlg.inert = true;
  openPanel(catsDlg, from);
  CT.body.querySelector('#cat-name')?.focus({ preventScroll: true });
}
async function commitCats({ catPuts = [], catDels = [], eventPuts = [] }) {
  await db.applyCategoryChanges({ catPuts, catDels, eventPuts });
  const dels = new Set(catDels), puts = new Map(catPuts.map((c) => [c.id, c]));
  setCategories([...state.categories.filter((c) => !dels.has(c.id) && !puts.has(c.id)), ...catPuts]);
  if (eventPuts.length) { const m = new Map(eventPuts.map((e) => [e.id, e])); state.events = state.events.map((e) => m.get(e.id) || e); }
  bumpRevision();
  requestNotifySync('category');
  render();
}
const catColorName = (c) => paletteName(c) || '色';
function previewHtml(name, color) {
  const n = esc(name.trim() || 'カテゴリ名');
  return `<div class="catpre" style="${colorVars(color)}"><span class="chip">${n}</span><span class="bar-like">${n}</span></div>`;
}
function renderCats() {
  const dis = cs.busy ? ' disabled' : '';
  CT.title.textContent = cs.id ? 'カテゴリを編集' : 'カテゴリを追加';
  CT.close.textContent = '完了';
  const pal = PALETTE.map((p) => `<button type="button" class="swatch" data-color="${p.light}" style="background:${p.light}" aria-label="${p.name}" aria-pressed="${p.light === cs.color.toLowerCase()}"></button>`).join('');
  CT.body.innerHTML = `<section class="card"><label>名前<input id="cat-name" maxlength="${CAT_LIMITS.name}" value="${esc(cs.name)}" placeholder="例：仕事" autocomplete="off"></label>
    <span id="cat-color-l" class="lbl">色</span><div class="palette" role="group" aria-labelledby="cat-color-l">${pal}</div>
    <span class="lbl">見本</span>${previewHtml(cs.name, cs.color)}
    <p class="berr" role="alert" id="cat-err">${esc(cs.err)}</p></section>
    <button type="button" class="row cancel" data-cat-cancel${dis}>キャンセル</button>`;
}
async function catSave() {
  if (cs.busy) return;
  const list = state.categories, now = Date.now(), name = cs.name.trim();
  const base = cs.id ? list.find((c) => c.id === cs.id) : newCategory(list, { id: newId(), name, color: cs.color }, now);
  if (!base) { closePanel(catsDlg); return; }
  const v = validateCategory({ ...base, name, color: cs.color || base.color, updatedAt: now }, now);
  if (!v.ok) { cs.err = v.error; renderCats(); CT.body.querySelector('#cat-name')?.focus({ preventScroll: true }); return; }
  if (nameTaken(list, v.value.name, v.value.id)) { cs.err = 'ほかのカテゴリと同じ名前は使えません。'; renderCats(); CT.body.querySelector('#cat-name')?.focus({ preventScroll: true }); return; }
  if (!cs.id && list.length >= CAT_LIMITS.max) { cs.err = `カテゴリは最大${CAT_LIMITS.max}個までです。`; renderCats(); return; }
  cs.busy = true;
  try { await commitCats({ catPuts: [v.value] }); } catch { cs.busy = false; cs.err = 'もう一度お試しください。'; renderCats(); return; }
  cs.busy = false;
  calFocusId = v.value.id;
  closePanel(catsDlg);
  say(`カテゴリ「${v.value.name}」を保存しました。`);
}
const catsBack = () => { if (!cs.busy) closePanel(catsDlg); };
CT.close.addEventListener('click', catSave);
CT.body.addEventListener('input', (ev) => { if (ev.target.id === 'cat-name') { cs.name = ev.target.value; const pre = CT.body.querySelector('.catpre'); if (pre) pre.outerHTML = previewHtml(cs.name, cs.color); } });
CT.body.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.id === 'cat-name') { ev.preventDefault(); catSave(); } });
CT.body.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.color) { cs.color = d.color; renderCats(); CT.body.querySelector(`[data-color="${d.color}"]`)?.focus({ preventScroll: true }); }
  else if (d.catCancel !== undefined) catsBack();
});
// 名前・色の編集を閉じたら、設定から来ていたときは 設定 › カレンダー（編集中）へ戻る。
catsDlg.addEventListener('close', () => {
  const from = cs.menuFrom;
  cs.menuFrom = null;
  if (!from || dlg.open) return;
  catsDlg._restore = false;
  openMenu(from);
  showMenuScreen('calendar', false);
  calEdit = true;
  renderCalScreen();
  const id = calFocusId; calFocusId = '';
  ($('#m-cal-duo').querySelector(id ? `[data-cedit="${CSS.escape(id)}"]` : '[data-cadd]') || $('#m-cedit'))?.focus({ preventScroll: true });
});

// ---------- 検索 ----------
const SR = { q: $('#sr-q'), clear: $('#sr-clear'), range: $('#sr-range'), xrange: $('#sr-xrange'), body: $('#sr-body') };
let srSeq = 0, srTimer = 0, srToday = todayKey(), srItems = [], srSnap = null, srMemos = [], srMemoSeq = 0;
const ymd = (k) => k.replaceAll('-', '/');
function openSearch(from) {
  srToday = todayKey();
  // 検索開始時点の成功キャッシュと範囲を固定する（検索のために3年分を取りに行かない）。
  srSnap = extActive() ? { events: [...visExt()], range: X.cache?.range || null } : null;
  SR.q.value = '';
  srMemos = []; const ms = ++srMemoSeq; // メモは全期間。未保存分を書いてから読む（失敗しても予定の検索は使える）
  flushMemosNow().then(() => db.listMemos()).then((m) => { if (ms === srMemoSeq) { srMemos = m; if (SR.q.value.trim()) renderSearch(true, true); } }, () => {});
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
function memoHitHtml(m, ts) {
  const yr = Number(srToday.slice(0, 4)), lab = Number(m.date.slice(0, 4)) === yr ? dayLabel(m.date) : `${m.date.slice(0, 4)}年${dayLabel(m.date)}`;
  const ex = excerpt(m.text, ts) || m.text.slice(0, 80);
  return `<button type="button" class="mhit" data-mhit="${m.date}" aria-label="${esc(`${lab}のメモ ${ex}`)}"><span class="hmeta">${esc(lab)}</span><span class="hnote">${highlight(ex, ts, esc)}</span></button>`;
}
function renderSearch(initial = false, quiet = false) {
  const say2 = (m) => { if (!quiet) say(m); };
  const mres = searchMemos(srMemos, SR.q.value);
  const res = searchEvents(state.events, SR.q.value, srToday, srSnap ? searchExt(srSnap.events, SR.q.value, srToday) : [], duoVisible());
  SR.clear.hidden = !SR.q.value;
  SR.range.textContent = `検索範囲：${ymd(res.range.from)}–${ymd(res.range.to)}・最大${LIMIT}件`;
  SR.xrange.hidden = !srSnap;
  if (srSnap) SR.xrange.textContent = srSnap.range ? `iPhoneの検索範囲：${ymdSlash(srSnap.range.from)}–${ymdSlash(lastDay(srSnap.range.to))}（読み込み済み）` : 'iPhoneの予定はまだ読み込まれていません。';
  srItems = res.items;
  const yr = Number(srToday.slice(0, 4));
  if (!res.ts.length) { SR.body.innerHTML = '<p class="smsg">探したい予定の言葉を入力してください。予定名・メモ・場所から探せます。</p>'; if (!initial) say2('検索語を消しました。'); return; }
  if (!res.total && !mres.total) { SR.body.innerHTML = '<p class="smsg">該当する予定はありません。検索語や検索範囲を確認してください。</p>'; say2('該当する予定はありません。'); return; }
  const groups = groupByDay(res.items).map((g) => {
    const label = Number(g.key.slice(0, 4)) === yr ? dayLabel(g.key) : `${g.key.slice(0, 4)}年${dayLabel(g.key)}`;
    return `<section class="hgroup"><h3>${label}</h3>${g.items.map((e) => hitHtml(e, res.ts)).join('')}</section>`;
  }).join('');
  const evHtml = res.total ? `<p class="small hcount">${res.total}件の予定</p>${res.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${groups}` : '<p class="smsg">該当する予定はありません。検索語や検索範囲を確認してください。</p>';
  const mHtml = mres.total ? `<section class="ssec" data-sec="memo" aria-label="メモ"><h2 class="srhead">メモ</h2><p class="small hcount">${mres.total}件のメモ（全期間・最大${LIMIT}件）</p>${mres.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${mres.items.map((m) => memoHitHtml(m, mres.ts)).join('')}</section>` : '';
  SR.body.innerHTML = `<section class="ssec" data-sec="events">${evHtml}</section>${mHtml}`;
  say2(`${res.total}件の予定${mres.total ? `、${mres.total}件のメモ` : ''}が見つかりました。`);
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
  const mh = ev.target.closest('[data-mhit]');
  if (mh) {
    const k = mh.dataset.mhit;
    closePanel(searchDlg, false);
    set({ selected: k, view: 'day', home: false });
    say(`${dayLabel(k)}へ移動しました。`);
    return;
  }
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
    BK.body.innerHTML = `<section class="card"><h3>書き出し</h3><p>予定${st.total}件・うち繰り返し${st.recurring}件／設定も含めて保存（日付のメモとタスクも含みます。リマインダーのリスト・追加先・月の件数の設定は含みません）</p><button type="button" class="solid" id="bk-export"${dis}>JSONを書き出す</button><p class="small">iPhoneでは共有シートの『ファイルに保存』で残せます。</p>${bk.msg ? `<p class="bmsg">${esc(bk.msg)}</p>` : ''}</section>
      <section class="card"><h3>読み込み</h3><p>書き出したJSONファイルから予定を戻します。</p><button type="button" id="bk-pick"${dis}>JSONファイルを選ぶ</button>${bk.busy ? '<p class="small" role="status">ファイルを検証しています…</p>' : ''}${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}</section>`;
  } else if (bk.stage === 'invalid') {
    BK.body.innerHTML = `<section class="card"><h3>読み込めませんでした</h3><p class="berr" role="alert">このファイルは読み込めません。DuoのバックアップJSONを選んでください。</p><p class="small">ファイル：${esc(bk.name)}</p><p class="small">理由：${esc(bk.reason)}</p><p class="small">今の予定は変更していません。</p><button type="button" id="bk-pick">ファイルを選び直す</button><button type="button" id="bk-back" class="row cancel">戻る</button></section>`;
  } else if (bk.stage === 'confirm') {
    const f = countStats(bk.data.events), p = bk.plan;
    BK.body.innerHTML = `<section class="card"><h3>この内容を読み込みますか？</h3>
      <dl class="facts"><dt>ファイル</dt><dd>${esc(bk.name)}</dd><dt>書き出し日時</dt><dd>${esc(fmtStamp(bk.data.exportedAt))}</dd>
      <dt>ファイルの予定</dt><dd>${f.total}件（繰り返し${f.recurring}件・個別変更／削除指定${f.exceptions}件）</dd>
      <dt>現在の予定</dt><dd>${st.total}件</dd><dt>追加見込み</dt><dd>${p.add.length}件（重複${p.dup}件・競合${p.conflict}件）</dd>${bk.data.memos ? `<dt>メモ</dt><dd>ファイル${bk.data.memos.length}件／現在${bk.curMemos.length}件／追加${p.memo.added}件・連結${p.memo.merged}件</dd>` : ''}${bk.data.tasks ? `<dt>タスク</dt><dd>ファイル${bk.data.tasks.length}件／現在${bk.curTasks.length}件／追加${p.task.added}件</dd>` : ''}</dl>
      ${p.conflict ? `<p class="small">競合${p.conflict}件は現在の予定を残します</p>` : ''}${catLine()}</section>
      <button type="button" class="row" id="bk-add"${dis}>追加（同じ予定は重複させない）<small>今の予定と設定を残します</small></button>
      <button type="button" class="row" id="bk-replace"${dis}>置き換え<small>今の予定はすべて消えて、このファイルの内容になります。設定も置き換わります（メモとタスクも、ファイルに項目があれば置き換わります）</small></button>
      <button type="button" class="row cancel" id="bk-cancel"${dis}>キャンセル</button>${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}`;
  } else {
    BK.body.innerHTML = `<section class="card"><h3>今の予定${st.total}件を削除して、${bk.data.events.length}件に置き換えますか？</h3><p>元に戻せません。必要なら先に書き出してください。</p>${NATIVE ? '<p class="small">iPhoneの予定と連携設定は変更しません。復元後、iPhoneにも追加済みの予定はこの端末のiPhoneの予定と照合し直します。見つからない予定は、最初に変更・削除するときに結びつきが外れます。</p>' : ''}
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
    if (!await flushMemosAwait()) { bk.err = '保存できていないメモがあるため書き出せません。メモの再試行をしてからもう一度お試しください。'; say(bk.err); renderBackup(); return; }
    const text = JSON.stringify(buildBackup(state.events, { ...state, notify: loadNotify(), tasks: remSet }, new Date(), state.categories, await db.listMemos(), await db.listTasks()), null, 2);
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
  let res, curMemos = [], curTasks = [];
  try {
    if (!await flushMemosAwait()) { bk = { stage: 'main', busy: false, msg: '', err: '保存できていないメモがあるため読み込めません。メモの再試行をしてからもう一度お試しください。' }; renderBackup(); return; }
    curMemos = await db.listMemos(); curTasks = await db.listTasks();
    if (file.size > MAX_BYTES) res = { ok: false, reason: 'ファイルが大きすぎます（上限10MiB）' };
    else res = validateBackup(await file.text(), { categories: state.categories });
  } catch { res = { ok: false, reason: 'ファイルを読み取れません' }; }
  if (!res.ok) bk = { stage: 'invalid', busy: false, name: file.name, reason: res.reason };
  else bk = { stage: 'confirm', busy: false, name: file.name, data: res.data, report: res.report, curMemos, curTasks, plan: planAppend(state.events, res.data.events, curMemos, res.data.memos || [], curTasks, res.data.tasks || []), err: '' };
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
  const { plan } = bk, name = bk.name;
  let data = bk.data, dupLinks = 0, tp = null;
  if (kind === 'replace') { const u = uniqueRequestIds(data.events); data = { ...data, events: u.events }; dupLinks = u.unlinked; } // 二重の requestId は先の1件だけ結びつけ
  bk = { ...bk, busy: true, err: '' };
  renderBackup();
  try {
    // メモは確定時点の DB を基に計画し直す（確認画面の後に打った分も保つ）。
    if (!await flushMemosAwait()) throw new Error('memo unsaved');
    const memoNow = Date.now(), curMemos = await db.listMemos();
    const mp = kind === 'add' ? planMemos(curMemos, data.memos || [], memoNow) : null;
    tp = kind === 'add' ? planTasks(await db.listTasks(), data.tasks || []) : null;
    // カテゴリと予定を1トランザクションで。参照先のカテゴリが無い予定は未分類に付け替える。
    const now = Date.now(), cin = data.categories.map((c) => ({ ...c, createdAt: c.createdAt || now, updatedAt: c.updatedAt || now }));
    if (kind === 'add') {
      const fx = fixEventCategories(plan.add, mergeCategories(state.categories, cin, 'add').categories, now);
      const fin = ensureOneVisible(fx.categories, now).list; // 書く結果が全部 hidden なら先頭だけ表示に戻す
      const cur = new Map(state.categories.map((c) => [c.id, c]));
      const same = (c) => cur.get(c.id)?.name === c.name && cur.get(c.id)?.color === c.color && !!cur.get(c.id)?.hidden === !!c.hidden;
      await db.applyImport({ catPuts: fin.filter((c) => !cur.has(c.id) || !same(c)), eventPuts: fx.events, memoPuts: mp.puts, taskPuts: tp.puts });
    } else {
      let cats = data.hasCategories ? mergeCategories([], cin, 'replace').categories : mergeCategories(state.categories, cin, 'add').categories;
      if (!cats.length) cats = state.categories;
      if (data.hasCategories) cats = supplementForReplace(cats, data.events, now).list; // 不足する家族/外出/その他（と参照される仕事/私用）を補う
      const fx = fixEventCategories(data.events, cats, now);
      OBX.items = await db.applyImport({ catPuts: ensureOneVisible(fx.categories, now).list, eventPuts: fx.events, replace: true, outbox: (cur) => keepAfterReplace(cur, fx.events), ...(data.memos ? { memoReplace: true, memoPuts: data.memos } : {}), ...(data.tasks ? { taskReplace: true, taskPuts: data.tasks } : {}) });
    }
  } catch {
    try { state.events = await db.listEvents(); } catch { /* 無視 */ }
    bumpRevision();
    bk = { stage: kind === 'add' ? 'confirm' : 'replace', busy: false, name, data, plan, err: '読み込みに失敗しました。現在の予定は変更していません。' };
    renderBackup();
    return;
  }
  memoStore.invalidateAll(); // 成功後: 下書きと表示中の本文を捨て、DB の内容を読み直す
  invalidateMarks(); memoSynced.clear(); ML.rows = null; ML.seq++; ML.failed = false;
  state.events = await db.listEvents();
  bumpRevision();
  try { setCategories(await db.listCategories()); } catch { /* 直前の一覧で続ける */ }
  let msg;
  if (kind === 'add') msg = `${plan.add.length}件を追加しました（重複${plan.skipped}件を除外）。${data.memos?.length ? `メモは追加${plan.memo.added}件・連結${plan.memo.merged}件。` : ''}${data.tasks?.length ? `タスクは追加${tp.added}件。` : ''}`;
  else {
    msg = `${data.events.length}件の予定${data.settings ? 'と設定' : ''}に置き換えました。${data.memos?.length ? `メモ${data.memos.length}件。` : ''}${data.tasks?.length ? `タスク${data.tasks.length}件。` : ''}${dupLinks ? `同じiPhone連携の印を持つ予定があったため、${dupLinks}件の結びつきを外しました。` : ''}`;
    if (data.settings) { const { notify, tasks: tset, ...ui } = data.settings; Object.assign(state, ui); saveUi(); if (tset) setRemSettings(tset); setFirstDay(state.weekStart); if (notify) saveNotify(notify); }
  }
  // 復元した linked の予定は、この端末の iPhone の予定と照合し直す（代わりの照合は復元直後の予定だけ）。
  for (const e of (kind === 'add' ? plan.add : data.events)) if (e.nativeLink?.state === 'linked') RESTORED.add(e.id);
  if (extActive()) loadExt(true);
  requestNotifySync('import'); // state と（置換なら）通知設定が確定した後
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
// 取得する範囲: 選択日の周り。ホームを出しているときは今日の周りも、予定リストを出しているときはその窓の先までも含める。
function extNeed() {
  const kind = layoutKind(), pg = state.pages;
  const home = kind === 'home' || listShown() || (kind === 'spread' && (PG().left === 'home' || PG().right === 'home')) || (panelOn() && pg.portraitBottom === 'home');
  let r = extRange(kind === 'home' ? todayKey() : state.selected);
  if (home && kind !== 'home') { const t = extRange(todayKey()); r = { from: t.from < r.from ? t.from : r.from, to: t.to > r.to ? t.to : r.to }; }
  if (kind === 'spread') for (const sd of ['left', 'right']) if (PG()[sd] === 'time' && tmode(sd) === 'list') { const e = addDays(state.selected, AGL[sd] + 1); if (e > r.to) r = { ...r, to: e }; }
  return r;
}
let lk = { busy: false, err: '', catBusy: false };
let firstCheck = true, extTimer = 0, xBusy = false;

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
  X.calendars = cals; X.listed = true;
  if (X.perm === 'granted') migrateLinkOnce();
  const known = new Set(cals.map((c) => c.id));
  const patch = { calendarIds: link.calendarIds.filter((id) => known.has(id)) };
  if (!link.selectionInitialized) { patch.calendarIds = cals.map((c) => c.id); patch.selectionInitialized = true; } // 初回は全選択
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
      await reconcileLinks(); // 世代確認の後。照合は同期で計算し、保存時に現状と再確認する
    } catch (e) {
      if (gen !== X.gen) return;
      X.status = 'error'; X.failKey = key0;
      if (['PERMISSION_DENIED', 'RESTRICTED', 'WRITE_ONLY'].includes(errCode(e))) dropLink('カレンダーへのアクセスを確認してください。');
    } finally {
      if (gen === X.gen) { X.inflight = null; X.inflightKey = ''; afterExt(); }
    }
  })();
  X.inflight = p;
  return p;
}
// 復元したばかりの予定の id（メモリのみ）。代わりの照合は、この予定にだけ・外部読込のたびに再試行する。
const RESTORED = new Set();
async function reconcileLinks() {
  const ext = X.cache?.events;
  if (!ext) return;
  try {
    const rel = relink(state.events, ext, RESTORED);
    const moved = new Map(rel.map((r) => [r.id, r]));
    const merged = state.events.map((e) => (moved.has(e.id) ? { ...e, nativeLink: moved.get(e.id).link } : e));
    const ups = new Map([...rel, ...refreshLinks(merged, ext)].map((r) => [r.id, { from: moved.get(r.id)?.from || r.from, link: r.link }]));
    for (const e of state.events) if (RESTORED.has(e.id) && !ups.has(e.id) && e.nativeLink?.itemId && ext.some((x) => x.itemId === e.nativeLink.itemId)) RESTORED.delete(e.id);
    for (const id of moved.keys()) RESTORED.delete(id);
    if (!ups.size) return;
    // 保存時にも、計算した時点と同じ結びつきか確かめる。native への反映（update）は作らない。
    const ack = await db.applyAck({ keys: [...ups.keys()], update: (raw) => { const u = ups.get(raw.id); return u && JSON.stringify(raw.nativeLink) === JSON.stringify(u.from) ? { ...raw, nativeLink: u.link } : null; } });
    applyEvents(ack.events);
  } catch { /* 照合の失敗は表示を止めない。次の読込で再試行 */ }
}
// 同じ iPhone の予定か（表示用 id は開始を含むので使わない）。itemId、なければ eventId＋回の日時。
function sameExt(a, b) {
  const same = a.itemId && b.itemId ? a.itemId === b.itemId : a.eventId === b.eventId;
  return same && (!b.recurring || (a.occurrenceDate || '') === (b.occurrenceDate || ''));
}
function afterExt() {
  render();
  if (calScreenOpen()) renderCalScreen();
  if (xdDlg.open && xdCur && !visExt().some((x) => sameExt(x, xdCur))) $('#xd-err').textContent = 'この予定は見つかりません。カレンダーで確認してください。';
  if (dlg.open) updateXUi();
  if (dlg.open && extEd) $('#ext-gone').hidden = X.status !== 'ok' || visExt().some((x) => sameExt(x, extEd.before)); // 入力・基準値は変えない。注意帯だけ
}
function dropLink(msg) {
  setLink({ enabled: false });
  X.gen++; X.cache = null; X.status = 'idle'; X.inflight = null; X.inflightKey = ''; X.failKey = '';
  lk.err = msg;
  say(msg);
  render();
  if (calScreenOpen()) renderCalScreen();
}
async function resumeExt() {
  if (!NATIVE || !X.avail) return;
  const p = await checkPerm();
  if (['granted', 'writeOnly'].includes(p)) requestFlush(0);
  if (p === 'granted' && !link.enabled && linkMigPending()) { try { await refreshCalendars(); } catch { /* 取得できなければ次回 */ } } else if (p && p !== 'granted') migrateLinkOnce();
  if (!link.enabled) { if (calScreenOpen()) renderCalScreen(); return; }
  if (p !== 'granted') { if (p) dropLink('カレンダーへのアクセスを確認してください。'); return; }
  try { await refreshCalendars(); } catch { /* 取得できなくても直前の一覧で続ける */ }
  if (X.cache && X.cache.tz !== new Date().getTimezoneOffset()) { X.cache = null; bumpRevision(); } // タイムゾーン変更: キャッシュ破棄
  await loadExt(true);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (NATIVE) postureCtl?.refresh(); resumeExt(); requestNotifySync('resume'); } });

// ---------- 設定 › カレンダー（Duo／iPhone のアカウント別／リマインダー。✓で表示を切り替える） ----------
// ✓を変えても iPhone 側の予定・カレンダーは書き換えない（Duo の画面に出すかどうかだけ）。
const calScreenOpen = () => menuDlg.open && menuScreen === 'calendar';
const calDot = (c) => `<i class="cdot" style="background:${esc(safeColor(c))}" aria-hidden="true"></i>`;
const calRow = (attr, on, color, name, tag = '') => `<button type="button" class="crow${on ? '' : ' off'}" role="checkbox" aria-checked="${on}" ${attr}>${calDot(color)}<span class="cname">${esc(name || '（名前なし）')}</span>${tag}<span class="cck" aria-hidden="true">${on ? '✓' : ''}</span></button>`;
function renderCalScreen() {
  const box = $('#m-cal');
  if (!box) return;
  // Duo
  let h = `<h3 class="calsec dhead"><span>Duo（この端末だけ）</span><button type="button" id="m-cedit" class="chbtn">${calEdit ? '完了' : '編集'}</button></h3>`;
  h += calEdit ? calEditRows() : state.categories.map((c) => calRow(`data-cvis="${esc(c.id)}"`, !c.hidden, c.color, c.name)).join('');
  $('#m-cal-duo').innerHTML = h;
  // iPhone（アカウント別）
  const dis = lk.busy ? ' disabled' : '';
  h = '';
  if (NATIVE && X.avail) {
    const steps = '設定アプリで許可すると使えます。';
    if (lk.err) h += `<p class="berr cnote" role="alert">${esc(lk.err)}</p>`;
    if (linkSaveFailed) h += '<p class="berr cnote" role="alert">連携設定を保存できませんでした。</p>';
    if (X.perm === 'granted') {
      const gs = groupBySource(X.calendars);
      if (!gs.length) h += `<p class="cnote">${X.listed ? '表示できる iPhone のカレンダーがありません。' : '読み込み中…'}</p>`;
      for (const g of gs) h += `<h3 class="calsec">${esc(g.heading)}</h3>${g.items.map((c) => calRow(`data-cal="${esc(c.id)}"`, link.calendarIds.includes(c.id), c.color, c.title, c.allowsModify ? '' : '<small class="cro">表示のみ</small>')).join('')}`;
    } else if (X.perm === 'notDetermined') h += `<h3 class="calsec">iPhone</h3><p class="cnote">iPhone のカレンダーを出すには、アクセスを許可してください。</p><button type="button" class="cbtn" id="lk-req"${dis}>許可する</button>`;
    else if (X.perm === 'denied') h += `<h3 class="calsec">iPhone</h3><p class="cnote" role="alert">${steps}</p><button type="button" class="cbtn" id="lk-settings">設定を開く</button>`;
    else if (X.perm === 'restricted') h += '<h3 class="calsec">iPhone</h3><p class="cnote" role="alert">この端末ではカレンダーへのアクセスが制限されています。端末の管理者に確認してください。</p>';
    else if (X.perm === 'writeOnly') h += `<h3 class="calsec">iPhone</h3><p class="cnote" role="alert">予定を表示するにはフルアクセスが必要です。設定アプリで許可すると使えます。</p><button type="button" class="cbtn" id="lk-req"${dis}>フルアクセスを許可</button><button type="button" class="cbtn" id="lk-settings">設定を開く</button>`;
    else h += '<h3 class="calsec">iPhone</h3><p class="cnote" role="alert">カレンダーの状態を確認できませんでした。</p>';
  }
  $('#m-cal-ip').innerHTML = h;
  // 新しい予定の追加先
  const d = destInfo(destNow()), open = setDestPage.isOpen();
  $('#m-dest').innerHTML = `<span class="dname">新しい予定の追加先</span>${calDot(d.color)}<span class="dval">${esc(d.name)}</span><span class="sch" aria-hidden="true">›</span>`;
  $('#m-dest').setAttribute('aria-expanded', String(open));
  if (open) setDestPage.render();
  // 再読込／最終取得（カレンダー末尾に小さく）
  const foot = $('#m-cal-foot');
  if (NATIVE && X.avail && X.perm === 'granted') {
    const loading = X.status === 'loading';
    let st = 'まだ読み込んでいません';
    if (loading) st = '読み込み中…';
    else if (X.status === 'error') st = `読み込めませんでした。${X.cache ? '前回読み込み分を表示中' : ''}`;
    else if (X.cache) st = `最終読み込み：${fmtLoaded(X.cache.loadedAt)}`;
    foot.hidden = false;
    foot.innerHTML = `<span id="lk-status" role="status">${esc(st)}</span><button type="button" id="lk-reload"${loading ? ' disabled' : ''}>再読み込み</button>`;
  } else { foot.hidden = true; foot.innerHTML = ''; }
}
// 新しい予定の追加先の一覧（編集シートと同じ部品・同じ並び）。設定の中の専用ページで、開いている間は下の画面を inert にする。
const setDestPage = createDestPage($('#m-destpop'), {
  title: '新しい予定の追加先',
  settings: false,
  bodyHtml() {
    const cur = destNow(), raw = destGroups(false), gs = visibleDestGroups(raw, null);
    return (allDestHidden(raw) ? '<p class="dnote">すべて非表示になっています。設定 › カレンダーで ✓ を付けると表示されます。</p>' : '') + destRowsHtml(gs, cur, { typeAttr: 'sdtype', idAttr: 'sdid' });
  },
  onOpen() { menuDlg.querySelector('.mhead').inert = true; menuDlg.querySelector('.mscreens').inert = true; $('#m-dest').setAttribute('aria-expanded', 'true'); },
  onClose(focus) {
    menuDlg.querySelector('.mhead').inert = false; menuDlg.querySelector('.mscreens').inert = false;
    $('#m-dest').setAttribute('aria-expanded', 'false');
    if (focus && menuDlg.open) $('#m-dest').focus({ preventScroll: true });
  },
  onPick(d) { setDest(d); renderCalScreen(); say('新しい予定の追加先を変えました。'); },
});
menuDlg.addEventListener('close', () => setDestPage.close(false));
// ---- Duo 段の編集モード（右上の編集/完了）。削除・並べ替えは即保存、名前と色は1枚の編集で。外部（iPhone）の名前・色は触らない ----
let calEdit = false, calDel = null, calTarget = '', calUndo = null, calUndoTimer = 0, calFocusId = '';
function calEditRows() {
  const list = state.categories, one = list.length <= 1, dis = lk.catBusy ? ' disabled' : '';
  const rows = list.map((c, i) => {
    let r = `<div class="crow edit" data-crow="${esc(c.id)}"><button type="button" class="cdel" data-cdel="${esc(c.id)}" aria-label="「${esc(c.name)}」を削除"${one || dis ? ' disabled' : ''}><span aria-hidden="true">−</span></button><button type="button" class="cmain" data-cedit="${esc(c.id)}" aria-label="「${esc(c.name)}」の名前と色を編集"${dis}>${calDot(c.color)}<span class="cname">${esc(c.name)}</span></button><span class="mv"><button type="button" data-cup="${esc(c.id)}" aria-label="${esc(c.name)}を上へ"${i === 0 || lk.catBusy ? ' disabled' : ''}>↑</button><button type="button" data-cdown="${esc(c.id)}" aria-label="${esc(c.name)}を下へ"${i === list.length - 1 || lk.catBusy ? ' disabled' : ''}>↓</button></span></div>`;
    if (calDel === c.id) {
      const others = list.filter((x) => x.id !== c.id), n = state.events.filter((e) => e.categoryId === c.id || Object.values(e.overrides || {}).some((o) => o?.categoryId === c.id)).length;
      r += `<div class="delbox calbox"><p>「${esc(c.name)}」を削除しますか？</p>${n ? `<label>${n}件の予定を移すカテゴリ<select id="cat-target">${others.map((x) => `<option value="${esc(x.id)}"${x.id === calTarget ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : '<p class="small">このカテゴリの予定はありません。</p>'}<div class="pair2"><button type="button" data-cdelcancel>キャンセル</button><button type="button" class="dangerfill" data-cdelgo${dis}>削除する</button></div></div>`;
    }
    return r;
  }).join('');
  const full = list.length >= CAT_LIMITS.max;
  return `${rows}<button type="button" class="crow addrow" data-cadd${full ? ' disabled' : ''}><span class="cplus" aria-hidden="true">＋</span><span class="cname">カテゴリを追加</span></button>${full ? `<p class="cnote">カテゴリは最大${CAT_LIMITS.max}個まで作れます。</p>` : ''}${one ? '<p class="cnote">カテゴリは1つ以上必要です。</p>' : ''}${calUndo ? `<div class="undobar" role="status"><span>「${esc(calUndo.cat.name)}」を削除しました。</span><button type="button" data-cundo>元に戻す</button></div>` : ''}`;
}
function calClick(ev) {
  const t = ev.target, b = t.closest('#m-cal-duo button');
  if (!b || b.disabled) return false;
  const d = b.dataset, from = origins.get(menuDlg) || b;
  if (b.id === 'm-cedit') calSetEdit(!calEdit);
  else if (d.cdel !== undefined) { calDel = d.cdel; calTarget = defaultDeleteTarget(state.categories, d.cdel); renderCalScreen(); calEditFocus('#cat-target, [data-cdelgo]'); }
  else if (d.cdelcancel !== undefined) { const id = calDel; calDel = null; renderCalScreen(); calEditFocus(`[data-cdel="${CSS.escape(id)}"]`); }
  else if (d.cdelgo !== undefined) calDelete();
  else if (d.cundo !== undefined) calUndoDelete();
  else if (d.cup !== undefined) calMove(d.cup, -1);
  else if (d.cdown !== undefined) calMove(d.cdown, 1);
  else if (d.cedit !== undefined) { closePanel(menuDlg, false); openCategoryEditor(from, d.cedit); }
  else if (d.cadd !== undefined) { closePanel(menuDlg, false); openCategoryEditor(from, null); }
  else return false;
  return true;
}
function calEditFocus(sel) { const el = $('#m-cal-duo').querySelector(sel); el?.focus({ preventScroll: true }); return !!el; }
function calSetEdit(on) {
  calEdit = on; calDel = null;
  if (!on) { clearTimeout(calUndoTimer); calUndo = null; }
  renderCalScreen();
  $('#m-cedit')?.focus({ preventScroll: true });
}
async function calEditCommit(fn) {
  if (lk.catBusy) return false;
  lk.catBusy = true;
  let ok = true;
  try { await commitCats(fn()); } catch { ok = false; say('もう一度お試しください。'); }
  lk.catBusy = false;
  return ok;
}
async function calDelete() {
  const cur = state.categories.find((c) => c.id === calDel);
  if (!cur || lk.catBusy) return;
  const plan = planDeleteCategory(state.categories, state.events, cur.id, calTarget);
  if (!plan.ok) { say(plan.error); return; }
  const originals = state.events.filter((e) => plan.eventPuts.some((p) => p.id === e.id));
  const tgt = state.categories.find((c) => c.id === plan.targetId);
  const prevTarget = plan.catPuts.length && tgt ? [tgt] : [];
  if (!await calEditCommit(() => ({ catDels: plan.catDels, eventPuts: plan.eventPuts, catPuts: plan.catPuts }))) { renderCalScreen(); return; }
  clearTimeout(calUndoTimer);
  const timer = setTimeout(() => { if (calUndo?.cat.id === cur.id) { calUndo = null; if (calScreenOpen()) renderCalScreen(); } }, 5000);
  calUndoTimer = timer;
  calDel = null; calUndo = { cat: cur, originals, prevTarget };
  renderCalScreen();
  calEditFocus('[data-cundo]');
  say(`カテゴリ「${cur.name}」を削除しました。`);
}
async function calUndoDelete() {
  const u = calUndo;
  if (!u || lk.catBusy) return;
  clearTimeout(calUndoTimer);
  calUndo = null;
  const ok = await calEditCommit(() => ({ catPuts: [u.cat, ...u.prevTarget], eventPuts: u.originals }));
  if (ok) say(`カテゴリ「${u.cat.name}」を元に戻しました。`);
  renderCalScreen();
  calEditFocus(`[data-cedit="${CSS.escape(u.cat.id)}"]`);
}
async function calMove(id, dir) {
  const ok = await calEditCommit(() => ({ catPuts: moveCategory(state.categories, id, dir).changed }));
  renderCalScreen();
  if (ok) calEditFocus(`[data-c${dir < 0 ? 'up' : 'down'}="${CSS.escape(id)}"]:not(:disabled)`) || calEditFocus(`[data-c${dir < 0 ? 'down' : 'up'}="${CSS.escape(id)}"]`);
}
// 設定の「カレンダー」を開いたとき: 許可を確かめ、許可済みなら一覧を取り直す（オフだった連携は✓で選べる状態に戻す）。
async function enterCalScreen() {
  renderCalScreen();
  if (!NATIVE) return;
  if (!X.avail) return;
  await resumeExt();
  if (X.perm === 'granted' && !link.enabled) await enableLink();
  renderCalScreen();
}
async function enableLink() {
  if (!link.enabledMig) setLink({ enabledMig: true }); // 利用者が今つないだ。旧「オフ」の移行は不要
  try { await refreshCalendars(); } catch { lk.err = 'カレンダーの一覧を読み込めませんでした。もう一度お試しください。'; renderCalScreen(); return; }
  lk.err = '';
  setLink({ enabled: true });
  loadExt(true);
  requestFlush(0);
  requestNotifySync('calendarAccess');
  render();
  renderCalScreen();
}
async function lkRequest() {
  if (lk.busy) return;
  lk.busy = true; lk.err = ''; renderCalScreen();
  try { const r = await call('requestPermission'); X.perm = r?.status || X.perm; } catch (e) { lk.err = errText(e, 'アクセスの確認に失敗しました。もう一度お試しください。'); }
  lk.busy = false;
  if (X.perm === 'granted') await enableLink();
  renderCalScreen();
  $('#m-cal-ip').querySelector('button')?.focus({ preventScroll: true });
}
async function calToggleCat(id, btn) {
  const c = state.categories.find((x) => x.id === id);
  if (!c || lk.catBusy) return;
  if (!c.hidden && !canHideCategory(state.categories, c.id)) { // 最後の表示は隠せない: 書かずに0.2秒揺らして3秒案内
    btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 200);
    notice('カテゴリを1つは表示してください', null, 3000);
    return;
  }
  lk.catBusy = true;
  try { await commitCats({ catPuts: [{ ...c, hidden: !c.hidden, updatedAt: Date.now() }] }); } catch { say('もう一度お試しください。'); }
  lk.catBusy = false;
  renderCalScreen();
  $('#m-cal-duo').querySelector(`[data-cvis="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
}
function calToggleIphone(id) {
  const ids = new Set(link.calendarIds);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  setLink({ calendarIds: [...ids], selectionInitialized: true }); // 全オフも保持する
  X.failKey = '';
  loadExt(true);
  renderCalScreen();
  $('#m-cal-ip').querySelector(`[data-cal="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  render();
}

// iPhone の予定のポップアップ（09 §1）。開くたびに getEvent で確かめ、書けるときだけ「削除」「編集」を出す。
const REASON_TEXT = {
  readOnlyCalendar: 'このカレンダーは読み取り専用のため、Duo では変更できません。',
  birthdays: '誕生日は「連絡先」から変更してください。',
  invitee: '招待された予定のため、Duo では変更できません。',
  organizerWithAttendees: '出席者のいる予定は、iPhone のカレンダーで変更してください。',
};
const XD_NOTE = 'iPhoneのカレンダーで、この予定の日付を開きます。';
const SAVE_FAIL_X = 'iPhone のカレンダーに保存できませんでした。もう一度お試しください。';
const SAVE_UNAVAIL_X = 'iPhone のカレンダーに保存できませんでした。カレンダーで開いて変更してください。';
const DELETE_FAIL_X = 'iPhone のカレンダーから削除できませんでした。';
let xdCur = null, xdGen = 0, xdState = null; // xdState: { gen, status:'loading'|'ok'|'fail', before, detail, cal, ed, pre }
let extBusy = false;
const setExtBusy = (b) => { extBusy = b; for (const el of [$('#xd-del'), $('#xd-edit'), $('#dodelete'), form.querySelector('[type=submit]')]) el.disabled = b; };
const preReason = (cal) => (!cal || cal.allowsModify !== true ? (cal?.sourceType === 'birthdays' ? 'birthdays' : 'readOnlyCalendar') : null);
const extTarget = (x) => ({ itemId: x.itemId, externalId: x.externalId, eventId: x.eventId, occurrenceStart: x.occurrenceDate || x.start, currentStart: x.start });
function xdBody(e) {
  const t = (k) => `${ymdSlash(dayOf(k))} ${k.slice(11)}`;
  const when = e.all
    ? `<dt>開始</dt><dd>${ymdSlash(dayOf(e.start))}（終日）</dd><dt>終了</dt><dd>${ymdSlash(dayOf(e.end))}（含む最終日）</dd>`
    : `<dt>開始</dt><dd>${esc(t(e.start))}</dd><dt>終了</dt><dd>${esc(t(e.rawEnd && e.rawEnd >= e.start ? e.rawEnd : e.end))}</dd>`;
  $('#xd-body').innerHTML = `<h3 class="xdt">${esc(e.title)}</h3><p class="xdcal caltag"><i class="cdot" style="background:${e.color}" aria-hidden="true"></i>${esc(subLabel(e))}${e.recurring ? ' <span class="rep" aria-hidden="true">↻</span>' : ''}</p>
    <dl class="facts">${when}<dt>場所</dt><dd>${e.place ? esc(e.place) : '場所なし'}</dd><dt>メモ</dt><dd class="notes">${e.notes ? esc(e.notes) : 'メモなし'}</dd></dl>`;
}
// 下の段。取得中・失敗は編集・削除なし。書けるとき: 削除/編集＋小さい「カレンダーで開く」。書けないとき: 理由＋大きい「カレンダーで開く」。
function xdFoot() {
  const s = xdState, can = s?.status === 'ok' && s.ed.editable;
  const reason = s?.status === 'ok' ? (s.ed.editable ? null : s.ed.reason) : s?.pre;
  $('#xd-act').hidden = !can;
  $('#xd-copyrow').hidden = !PASTE_ENTRY;
  $('#xd-copy').disabled = s?.status !== 'ok';
  $('#xd-note').hidden = can;
  $('#xd-note').textContent = REASON_TEXT[reason] || XD_NOTE;
  const o = $('#xd-open');
  o.classList.toggle('small', can); o.classList.toggle('primary', !can); o.classList.toggle('wide', !can);
}
function openExtDetail(id, from) {
  const e = visExt().find((x) => x.id === id);
  if (!e) return;
  xdCur = e;
  $('#xd-err').textContent = '';
  const cal = X.calendars.find((c) => c.id === e.calId);
  const gen = ++xdGen;
  xdState = { gen, status: 'loading', cal, pre: preReason(cal) };
  xdBody(e);
  xdFoot();
  openPanel(xdDlg, from);
  $('#xd-close').focus({ preventScroll: true });
  const live = () => gen === xdGen && xdDlg.open && xdCur === e; // 別の予定・閉じたあとの遅い応答は捨てる
  call('getEvent', extTarget(e)).then((d) => {
    if (!live()) return;
    const before = { ...toDisplay(d, cal), id: e.id };
    xdState = { gen, status: 'ok', cal, detail: d, before, ed: extEditable(e, cal, d) };
    xdBody(before); xdFoot();
  }).catch((err) => {
    if (!live()) return;
    xdState = { gen, status: 'fail', cal, pre: preReason(cal) };
    if (errCode(err) === 'NOT_FOUND') $('#xd-err').textContent = 'この予定は見つかりません。カレンダーで確認してください。';
    xdFoot();
  });
}
xdDlg.addEventListener('close', () => { xdGen++; });
$('#xd-close').addEventListener('click', () => fadeClose(xdDlg, closeXd));
$('#xd-open').addEventListener('click', async () => {
  if (!xdCur) return;
  $('#xd-err').textContent = '';
  try { const r = await call('openInCalendar', { start: xdCur.start }); if (!r?.opened) throw new Error('not opened'); } catch { $('#xd-err').textContent = 'カレンダーを開けませんでした。'; }
});
$('#xext-open').addEventListener('click', async () => {
  if (!extEd) return;
  try { const r = await call('openInCalendar', { start: extEd.before.start }); if (!r?.opened) throw new Error('x'); } catch { $('#error').textContent = 'カレンダーを開けませんでした。'; }
});
const xdReady = () => (xdState?.status === 'ok' && xdState.ed.editable && !extBusy ? xdState : null);
$('#xd-edit').addEventListener('click', () => {
  const s = xdReady();
  if (!s) return;
  const b = s.before;
  extEd = { before: b, detail: s.detail, cal: s.cal, alarms0: '', touched: false };
  origins.set(dlg, origins.get(xdDlg));
  closePanel(xdDlg, false);
  showEditor({
    title: b.title, categoryId: defaultCatId(), all: b.all, start: toInput(b.start, b.all), end: toInput(b.end, b.all), place: b.place, notes: b.notes,
    rfreq: 'none', rbyday: [], rend: 'none', rcount: '10', runtil: '', ropen: false, alarms: Array.isArray(s.detail.alarms) ? s.detail.alarms : [],
  }, null);
});
$('#xd-del').addEventListener('click', () => {
  const s = xdReady();
  if (!s) return;
  if (s.before.recurring) openScopeExt('delete');
  else showExtConfirm({ mode: 'single', title: 'この予定を削除しますか？', text: `${s.before.title}\niPhone のカレンダーから削除されます。`, ok: '削除する', scope: 'only' });
});

// 確認ダイアログ（iPhone の予定）。gone は「閉じる」だけ。
function showExtConfirm(c) {
  xc = c;
  $('#confirmtitle').textContent = c.title;
  $('#deletetitle').textContent = c.text || '';
  $('#dodelete').textContent = c.ok;
  $('#dodelete').classList.toggle('danger', c.mode !== 'gone');
  $('#canceldelete').hidden = c.mode === 'gone';
  dlg.inert = true; xdDlg.inert = true;
  confirmDlg.show();
  syncInert();
  (c.mode === 'gone' ? $('#dodelete') : $('#canceldelete')).focus({ preventScroll: true });
}
// 範囲シート（iPhone の予定）。kind: 'edit'（after は保存する値）| 'delete'
function openScopeExt(kind, after) {
  const del = kind === 'delete', b = del ? xdState.before : extEd.before;
  scopeCtx = { kind, ext: true, after };
  $('#sc-title').textContent = del ? '削除する範囲' : '変更する範囲';
  $('#sc-target').textContent = `対象：${dayLabel(dayOf(b.start))} ${b.all ? '終日' : b.start.slice(11)} ${b.title}`;
  const rows = scopeDlg.querySelectorAll('[data-scope]');
  rows.forEach((r) => { r.classList.toggle('danger', del); r.disabled = false; });
  const notes = [];
  if (del) { $('#sc-warn').hidden = false; $('#sc-warn').textContent = `${b.title}\niPhone のカレンダーから削除されます。`; } else {
    $('#sc-warn').hidden = true; $('#sc-warn').textContent = '';
    notes.push('iPhone のカレンダーに保存されます。');
    if (after.calendarId && after.calendarId !== b.calId) {
      scopeDlg.querySelector('[data-scope="only"]').disabled = true;
      scopeDlg.querySelector('[data-scope="following"]').disabled = true;
      notes.push('カレンダーの変更は『すべて』でのみできます。');
    }
  }
  $('#sc-note').textContent = notes.join(' ');
  if (del) xdDlg.inert = true; else dlg.inert = true;
  scopeDlg.show();
  syncInert();
  scopeDlg.querySelector('[data-scope]:not(:disabled)')?.focus({ preventScroll: true });
}
function handleExtScope(scope) {
  const { kind, after } = scopeCtx;
  if (extBusy) return;
  if (kind === 'delete') {
    if (scope === 'all') { showExtConfirm({ mode: 'all', title: 'すべての繰り返しを削除しますか？', text: 'iPhone のカレンダーから削除されます。', ok: 'すべて削除', scope: 'all' }); scopeDlg.close(); return; }
    runExtDelete(scope, false, scopeDlg);
    return;
  }
  runExtSave(scope, after);
}
const notices = (list) => { if (list[0]) notice(list[0]); if (list[1]) setTimeout(() => notice(list[1]), 4000); };
async function runExtDelete(scope, force, from) {
  const s = xdState;
  if (extBusy || !s?.before) return;
  setExtBusy(true);
  let r;
  try { r = await call('deleteExternalEvent', buildExtDeleteArgs(s.before, scope, s.detail, force)); } catch (e) {
    setExtBusy(false);
    if (errCode(e) === 'CONFLICT' && !force) {
      showExtConfirm({ mode: 'conflict', title: 'iPhone のカレンダーで内容が変わっています', text: 'それでも削除しますか？', ok: '削除する', scope, force: true });
      if (from === scopeDlg) scopeDlg.close();
      return;
    }
    if (from.open) from.close();
    notice(['PERMISSION_DENIED', 'RESTRICTED', 'WRITE_ONLY'].includes(errCode(e)) ? errText(e, DELETE_FAIL_X) : DELETE_FAIL_X);
    return;
  }
  setExtBusy(false);
  scopeCtx = null;
  if (from.open) from.close();
  closePanel(xdDlg);
  if (r?.missing) notice('この予定はすでに iPhone のカレンダーから削除されていました。');
  loadExt(true); // 通常の成功トーストや反映待ちは出さない
}
function submitExt(ev) {
  const x = extEd;
  if (!x || extBusy) return;
  const after = { title: ev.title, place: ev.place, notes: ev.notes, start: ev.start, end: ev.end, all: ev.all, calendarId: destEff().id };
  if (x.touched) after.alarms = Array.isArray(alarms) ? alarms : [];
  if (x.before.recurring) { openScopeExt('edit', after); return; }
  runExtSave('only', after);
}
async function runExtSave(scope, after) {
  const x = extEd;
  if (!x || extBusy) return;
  const args = buildExtArgs(x.before, after, scope, x.detail);
  $('#error').textContent = '';
  if (!args) { scopeCtx = null; if (scopeDlg.open) scopeDlg.close(); closeEditor(); return; } // 変更なし
  setExtBusy(true);
  let r;
  try { r = await call('updateExternalEvent', args); } catch (e) {
    setExtBusy(false);
    const code = errCode(e);
    if (code === 'NOT_FOUND') {
      showExtConfirm({ mode: 'gone', title: 'この予定は iPhone のカレンダーで削除されています', text: '', ok: '閉じる' });
      if (scopeDlg.open) scopeDlg.close();
      return;
    }
    if (scopeDlg.open) scopeDlg.close();
    if (code === 'UNAVAILABLE') $('#error').textContent = SAVE_UNAVAIL_X;
    else if (code === 'NOT_EDITABLE' || code === 'READ_ONLY') $('#error').textContent = REASON_TEXT[errReason(e)] || errText(e, SAVE_FAIL_X);
    else if (['PERMISSION_DENIED', 'RESTRICTED', 'WRITE_ONLY'].includes(code)) $('#error').textContent = errText(e, SAVE_FAIL_X);
    else notice(SAVE_FAIL_X);
    return; // 入力は保持。もう一度保存できる
  }
  setExtBusy(false);
  scopeCtx = null;
  const msgs = [];
  if (r?.conflicted) msgs.push(MSG.conflictUpdate);
  if (Array.isArray(after.alarms) && after.alarms.length > (r?.alarmsApplied ?? after.alarms.length)) msgs.push('このカレンダーでは通知は1つだけ保存されました。');
  if (scopeDlg.open) scopeDlg.close();
  closeEditor();
  if (after.start && dayOf(after.start) !== state.selected) set({ selected: dayOf(after.start) });
  notices(msgs);
  loadExt(true); // 返ってきた ID ではなく再読込の結果で表示する（古い ID は使わない）
}

// iPhone への追加（再試行は同じ requestId。別の予定を作らない）
function openRetry(id, msg, canRetry) {
  xrId = id;
  xrBatch = null;
  $('#xr-msg').textContent = msg;
  $('#xr-retry').hidden = !canRetry;
  openPanel(xrDlg, document.activeElement);
  (canRetry ? $('#xr-retry') : $('#xr-close')).focus({ preventScroll: true });
}
let xrId = null;
let xrKeep = false; // 「再試行」を選んだ閉じ方だけ pending を保つ
// 追加の失敗確定: 同じ id / requestId で現在 pending の結びつきだけ unlinked にする（本文・alarms・requestId は残す）。
// 成功（または対象がもう無い）なら true。DB 失敗は false（pending のまま）。
async function abandonCreate(id, requestId) {
  try {
    const ack = await db.applyAck({ keys: [id], update: (raw) => (raw.nativeLink?.requestId === requestId && raw.nativeLink.state === 'pending' ? (({ moveFromCat, ...rest }) => ({ ...rest, ...(moveFromCat !== undefined ? { categoryId: moveFromCat } : {}), nativeLink: { ...raw.nativeLink, state: 'unlinked', warn: null } }))(raw) : null) });
    applyEvents(ack.events);
    if (ack.events.length) { requestNotifySync('link'); render(); }
    return true;
  } catch {
    return false;
  }
}
async function giveUpCreate(id, requestId) {
  if (await abandonCreate(id, requestId)) return;
  say('もう一度お試しください。');
  const e = state.events.find((x) => x.id === id);
  if (e?.nativeLink?.state === 'pending' && e.nativeLink.requestId === requestId) openRetry(id, 'Duoへの保存に失敗しました。iPhoneのカレンダーへの追加は取りやめていません。', true);
}
const applyEvents = (list) => {
  if (!list?.length) return;
  const m = new Map(list.map((e) => [e.id, e]));
  state.events = state.events.map((e) => m.get(e.id) || e);
  bumpRevision();
};
// 復元時の一意照合用に、作成・同期時点のカレンダー名とアカウント名を残す。
const calIdent = (cid) => { const c = X.calendars.find((x) => x.id === cid); return c ? { calName: c.title, calSource: c.source || '' } : {}; };
// 作成結果 r から linked の結びつきを作る（単発・まとめで共有）。
const HARD_CREATE = ['PERMISSION_DENIED', 'WRITE_ONLY', 'CALENDAR_NOT_FOUND', 'RESTRICTED', 'READ_ONLY'];
function linkFrom(l, r) {
  return cleanLink({
    v: 2, state: 'linked', requestId: l.requestId, calendarId: r.calendarId || l.calendarId, itemId: r.itemId != null ? String(r.itemId) : undefined,
    externalId: r.externalId != null ? String(r.externalId) : undefined, eventId: String(r.eventId), ekModified: Number.isFinite(r.modifiedAt) ? r.modifiedAt : undefined,
    syncedAt: Date.now(), matchedBy: 'id', warn: null, ...calIdent(r.calendarId || l.calendarId),
  });
}
// 作成の間に編集・削除されていたときに積む差分（e は作成開始時の予定、sent は送った本文）。
function lateOps(id, e, sent, nl) {
  const latest = state.events.find((x) => x.id === id);
  const snap = { ...(latest || e), ...sent, id, nativeLink: withIdent({ ...nl, seriesStart: sent.start }) };
  return planNativeOps(snap, { puts: latest ? [latest] : [], dels: latest ? [] : [id] }, 'all', null, latest || null, opsCtx()).ops;
}
async function createNative(id) {
  const e = state.events.find((x) => x.id === id), l = e?.nativeLink;
  if (!e || l?.state !== 'pending' || xBusy) return;
  xBusy = true;
  const sent = { title: e.title, start: e.start, end: e.end, all: !!e.all, place: e.place || '', notes: e.notes || '', ...(Array.isArray(e.alarms) ? { alarms: e.alarms } : {}), ...(e.recurrence ? { recurrence: normRule(e.recurrence) } : {}) };
  try {
    const args = { requestId: l.requestId, calendarId: l.calendarId, title: e.title, start: e.start, end: e.all ? `${dayOf(e.end)}T00:00` : e.end, all: !!e.all, place: e.place || '', notes: e.notes || '' };
    if (e.recurrence) args.recurrence = normRule(e.recurrence); // 新規の規則だけ（例外入りの系列は送らない）
    if (Array.isArray(e.alarms)) args.alarms = e.alarms; // linked の通知は iPhone 側（EKAlarm）が鳴らす
    const r = await call('createEvent', args);
    if (!r?.eventId) throw new Error('no event id');
    const nl = linkFrom(l, r);
    // 本文は読み直した最新のものを残し、結びつきだけ書く（作成中の編集を古いスナップショットで消さない）。
    const ack = await db.applyAck({ keys: [id], update: (raw) => (raw.nativeLink?.requestId === l.requestId && raw.nativeLink.state === 'pending' ? (({ moveFromCat: _m, ...rest }) => ({ ...rest, nativeLink: withIdent({ ...nl, seriesStart: raw.start }) }))(raw) : null) });
    applyEvents(ack.events);
    // 作成の間に編集・削除されていたら、差分（または削除）を送信待ちへ積む。
    const ops = lateOps(id, e, sent, nl);
    if (ops.length) { OBX.items = await db.applyChangesWithOutbox({ outbox: (cur) => mergeOps(cur, ops, OBX.inflight) }); requestFlush(); }
    requestNotifySync('link');
    render();
    say('予定を保存し、iPhoneのカレンダーにも追加しました。');
    loadExt(true);
  } catch (err) {
    const msg = 'Duoに保存しました。iPhoneのカレンダーには追加できませんでした。';
    const hard = HARD_CREATE.includes(errCode(err));
    say(msg);
    if (hard) {
      // 再試行できない失敗はこの時点で確定。通知はDuo側に戻る。
      openRetry(id, `${msg}${errText(err, '')}メニューの『iPhone カレンダー連携』と追加先を確認してください。`, false);
      xrKeep = true; // 確定は下で行う（close 側の二重確定を避ける）
      await giveUpCreate(id, l.requestId);
      xrKeep = false;
    } else openRetry(id, msg, true);
  } finally { xBusy = false; }
}


// ---------- 貼り付けの確定とまとめ再試行（PR31） ----------
// pasteCommit(plan): planPaste の結果を確定する。Duo 分を1トランザクション → createEvents（31件ずつ）→ 結果を同じ requestId／pending のものだけに反映。
// iPhone だけの複製（型B）は DB に何も書かない。画面の接続は後続 PR。戻り値 { ok, done, failures, saveFailed?, busy? }。
const PASTE_BATCH = 31;
const pasteDay = (d) => `${+d.slice(5, 7)}月${+d.slice(8, 10)}日`;
const sentOf = (e) => ({ title: e.title, start: e.start, end: e.end, all: !!e.all, place: e.place || '', notes: e.notes || '', ...(Array.isArray(e.alarms) ? { alarms: e.alarms } : {}) });
const argsOf = (e) => ({ requestId: e.nativeLink.requestId, calendarId: e.nativeLink.calendarId, title: e.title, start: e.start, end: e.all ? `${dayOf(e.end)}T00:00` : e.end, all: !!e.all, place: e.place || '', notes: e.notes || '', ...(Array.isArray(e.alarms) ? { alarms: e.alarms } : {}) });
const pendingEntry = (e) => ({ kind: 'A', id: e.id, rid: e.nativeLink.requestId, day: dayOf(e.start), e, sent: sentOf(e), item: argsOf(e) });
let xrBatch = null; // 再試行ダイアログが抱える失敗分 { pend:[A entry], b:[B entry], canRetry, hard:[...] }

async function sendEntries(entries) {
  const res = new Map();
  for (let i = 0; i < entries.length; i += PASTE_BATCH) {
    const chunk = entries.slice(i, i + PASTE_BATCH);
    try {
      const r = await call('createEvents', { items: chunk.map((x) => x.item) });
      const by = new Map((Array.isArray(r?.results) ? r.results : []).map((x) => [x?.requestId, x]));
      for (const x of chunk) { const o = by.get(x.rid); res.set(x.rid, o?.ok && o.eventId ? o : { ok: false, code: o?.code || 'UNAVAILABLE' }); }
    } catch (err) {
      for (const x of chunk) res.set(x.rid, { ok: false, code: errCode(err) || 'UNAVAILABLE' });
    }
  }
  return res;
}
// 結果を DB・表示へ反映して { done, failures } を返す。型A: 成功→linked／再試行不可→unlinked（1トランザクション）、再試行できる失敗は pending のまま。
async function applyPasteResults(entries, res) {
  const out = { done: 0, failures: [], made: [] };
  const fail = (x, code, retry) => out.failures.push({ kind: x.kind, day: x.day, rid: x.rid, id: x.id, code, retry, entry: x });
  const as = entries.filter((x) => x.kind === 'A');
  const byId = new Map(as.map((x) => [x.id, x]));
  const links = new Map();
  const upd = (raw) => {
    const x = byId.get(raw.id), r = res.get(x?.rid);
    if (!x || raw.nativeLink?.requestId !== x.rid || raw.nativeLink.state !== 'pending') return null;
    if (r.ok) { const nl = linkFrom(raw.nativeLink, r); links.set(x.id, nl); return { ...raw, nativeLink: withIdent({ ...nl, seriesStart: raw.start }) }; }
    return HARD_CREATE.includes(r.code) ? { ...raw, nativeLink: { ...raw.nativeLink, state: 'unlinked', warn: null } } : null;
  };
  const keys = as.filter((x) => res.get(x.rid).ok || HARD_CREATE.includes(res.get(x.rid).code)).map((x) => x.id);
  let acked = true;
  if (keys.length) {
    try { applyEvents((await db.applyAck({ keys, update: upd })).events); } catch { acked = false; }
  }
  const ops = [];
  for (const x of entries) {
    const r = res.get(x.rid);
    if (x.kind === 'B') { if (r.ok) { out.done++; out.made.push({ kind: 'ext', rid: x.rid, target: { ...(r.itemId != null ? { itemId: String(r.itemId) } : {}), ...(r.externalId != null ? { externalId: String(r.externalId) } : {}), ...(r.eventId != null ? { eventId: String(r.eventId) } : {}), occurrenceStart: x.item.start, currentStart: x.item.start }, modifiedAt: Number.isFinite(r.modifiedAt) ? r.modifiedAt : null }); } else fail(x, r.code, !HARD_CREATE.includes(r.code)); continue; }
    if (r.ok) {
      if (!acked) { fail(x, 'UNAVAILABLE', true); continue; }
      out.done++;
      out.made.push({ kind: 'duo', id: x.id, updatedAt: x.e.updatedAt });
      const nl = links.get(x.id) || linkFrom({ requestId: x.rid, calendarId: x.item.calendarId }, r);
      ops.push(...lateOps(x.id, x.e, x.sent, nl));
    } else fail(x, r.code, !acked || !HARD_CREATE.includes(r.code));
  }
  if (ops.length) { try { OBX.items = await db.applyChangesWithOutbox({ outbox: (cur) => mergeOps(cur, ops, OBX.inflight) }); requestFlush(); } catch { /* 差分は次の編集・起動で再計画される */ } }
  return out;
}
const pasteDays = (xs) => {
  const ds = [...new Set(xs.map((x) => x.day))].sort();
  return ds.length > 3 ? `${ds.slice(0, 3).map(pasteDay).join('、')}ほか${ds.length - 3}日` : ds.map(pasteDay).join('、');
};
function pasteFailText(out) {
  const a = out.failures.filter((f) => f.kind === 'A'), b = out.failures.filter((f) => f.kind === 'B');
  return [
    out.done ? `${out.done}件は貼り付けました。` : '',
    a.length ? `${pasteDays(a)}は iPhone のカレンダーに入れられませんでした。Duo には保存してあります。` : '',
    b.length ? `${pasteDays(b)}は貼り付けられませんでした。Duo にも入っていません。` : '',
  ].filter(Boolean).join('');
}
function showPasteFail(out, canRetry, text = pasteFailText(out)) {
  const keep = out.failures.filter((f) => f.retry);
  xrBatch = { pend: keep.filter((f) => f.kind === 'A').map((f) => f.entry), b: keep.filter((f) => f.kind === 'B').map((f) => f.entry), canRetry };
  xrId = null;
  $('#xr-msg').textContent = text;
  $('#xr-retry').hidden = !(canRetry && keep.length);
  openPanel(xrDlg, document.activeElement);
  ($('#xr-retry').hidden ? $('#xr-close') : $('#xr-retry')).focus({ preventScroll: true });
  say(text);
}
// 送って反映し、通知・表示を1回だけ更新する。再試行できない失敗が残れば（またはまだ再試行の余地があれば）ダイアログで知らせる。
async function runPaste(entries, { retried = false } = {}) {
  const res = await sendEntries(entries);
  const out = await applyPasteResults(entries, res);
  requestNotifySync('link');
  render();
  if (out.done) loadExt(true);
  if (out.failures.length) showPasteFail(out, !retried);
  else say(`${out.done}日に貼り付けました。`);
  return out;
}
async function pasteCommit(plan) {
  if (!plan?.ok || !plan.items?.length) return { ok: false, done: 0, failures: [] };
  if (xBusy) return { ok: false, busy: true, done: 0, failures: [] };
  xBusy = true;
  try {
    const duoPuts = plan.items.filter((i) => i.event).map((i) => i.event);
    if (duoPuts.length) {
      try { await db.applyChanges({ puts: duoPuts, dels: [] }); } catch { say(SAVE_FAIL); return { ok: false, saveFailed: true, done: 0, failures: [] }; } // native は呼ばない
      const ids = new Set(duoPuts.map((e) => e.id));
      state.events = [...state.events.filter((e) => !ids.has(e.id)), ...duoPuts];
      bumpRevision();
    }
    const entries = plan.items.filter((i) => i.native).map((i) => (i.event
      ? { kind: 'A', id: i.event.id, rid: i.native.requestId, day: i.day, e: i.event, sent: sentOf(i.event), item: i.native }
      : { kind: 'B', rid: i.native.requestId, day: i.day, item: i.native }));
    if (duoPuts.some((e) => !e.nativeLink && hasDuoAlarms(e))) askNotifyPerm();
    if (!entries.length) { requestNotifySync('edit'); render(); say(`${duoPuts.length}日に貼り付けました。`); startUndo(duoPuts.map((e) => ({ kind: 'duo', id: e.id, updatedAt: e.updatedAt }))); return { ok: true, done: duoPuts.length, failures: [] }; }
    const dn = duoPuts.length - entries.filter((x) => x.kind === 'A').length; // iPhone へ送らない Duo だけの分（混在は想定しない）
    const out = await runPaste(entries);
    out.done += dn;
    const sent = new Set(entries.filter((x) => x.kind === 'A').map((x) => x.id));
    startUndo([...duoPuts.filter((e) => !sent.has(e.id)).map((e) => ({ kind: 'duo', id: e.id, updatedAt: e.updatedAt })), ...out.made]);
    return { ok: true, done: out.done, failures: out.failures.map(({ kind, day, code, retry }) => ({ kind, day, code, retry })) };
  } finally { xBusy = false; }
}
window.pasteCommit = pasteCommit;
// ---------- 貼り付けの取消（PR32。メモリだけ・6秒） ----------
// undoRec = { items:[{kind:'duo',id,updatedAt}|{kind:'ext',rid,target,modifiedAt}], armed, timer, n }。バックアップ・DB には何も書かない。
const UNDO_MS = 6000;
let undoRec = null;
function dropUndo() { if (undoRec) { clearTimeout(undoRec.timer); undoRec = null; } }
function startUndo(items) {
  dropUndo();
  if (!items.length) return;
  undoRec = { items, n: items.length, armed: false, timer: 0 };
  armUndo(undoRec);
}
// 失敗ダイアログ（または再試行中）が出ている間は始めず、閉じたあとの6秒にする。
function armUndo(rec, ms = UNDO_MS) {
  if (undoRec !== rec) return;
  clearTimeout(rec.timer);
  if (xrDlg.open || xBusy) { rec.timer = setTimeout(() => armUndo(rec, ms), 200); return; }
  rec.at = Date.now();
  rec.timer = setTimeout(() => { if (undoRec === rec) undoRec = null; }, ms);
  notice(`${rec.n}件を貼り付けました。`, { label: '元に戻す', fn: undoPaste }, ms);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) dropUndo(); });
const undoLinkedOp = (raw, now) => {
  const l = raw.nativeLink;
  if (l?.state !== 'linked' || !l.eventId) return null;
  return { opId: newId(), kind: 'delete', undoOnly: true, eventKey: raw.id, link: { ...l }, span: 'this', occurrenceStart: null, payload: {}, newParentId: null, newRequestId: null, createdAt: now, tries: 0, start: raw.start, expectModified: Number.isFinite(l.ekModified) ? l.ekModified : null, restore: raw };
};
async function undoPaste() {
  const rec = undoRec;
  if (!rec || !rec.at) return;
  const left = Math.max(1, UNDO_MS - (Date.now() - rec.at));
  clearTimeout(rec.timer); undoRec = null; // 連打しても1回だけ
  document.querySelector('#native-toast')?.remove();
  const duo = rec.items.filter((i) => i.kind === 'duo'), ext = rec.items.filter((i) => i.kind === 'ext');
  let kept = 0;
  if (duo.length) {
    let r;
    try { r = await db.applyUndo({ items: duo, mk: (raw) => undoLinkedOp(raw, Date.now()), outbox: (cur, ops) => mergeOps(cur, ops, OBX.inflight) }); } catch {
      say(SAVE_FAIL); undoRec = rec; armUndo(rec, left); return; // 何も消えていない。残り時間で再度押せる
    }
    OBX.items = r.list;
    const gone = new Set(r.deleted);
    if (gone.size) { state.events = state.events.filter((e) => !gone.has(e.id)); bumpRevision(); }
    kept += r.kept.length;
    requestNotifySync('undo');
    if (r.ops.length) requestFlush();
    render();
  }
  for (const x of ext) {
    try { await call('deleteExternalEvent', { ...x.target, span: 'this', expectModified: x.modifiedAt, force: false }); } catch { kept++; }
  }
  if (ext.length) loadExt(true);
  notice(kept ? `${kept}件は貼り付けたあとに変更されていたため、残しました。` : '貼り付けを取り消しました。');
}

// 閉じる・放棄: 残った pending を unlinked へ戻す（Duo の通知で鳴るように）。同じ requestId で pending のものだけ。
async function abandonMany(list) {
  const rids = new Map(list.map((x) => [x.id, x.rid]));
  try {
    const ack = await db.applyAck({ keys: [...rids.keys()], update: (raw) => (raw.nativeLink?.requestId === rids.get(raw.id) && raw.nativeLink.state === 'pending' ? { ...raw, nativeLink: { ...raw.nativeLink, state: 'unlinked', warn: null } } : null) });
    applyEvents(ack.events);
    if (ack.events.length) { requestNotifySync('link'); render(); }
  } catch { say('もう一度お試しください。'); }
}
// 「再試行」: 失敗した分だけ同じ requestId で1回だけ。再び失敗したら閉じるだけにする。
async function retryBatch(b) {
  if (xBusy) { showPasteFail({ failures: [...b.pend.map((x) => ({ kind: 'A', day: x.day, retry: true, entry: x })), ...b.b.map((x) => ({ kind: 'B', day: x.day, retry: true, entry: x }))], done: 0 }, true, $('#xr-msg').textContent); return; }
  xBusy = true;
  let rec = [], out = null;
  try {
    // 作成中の本文は読み直す（保存待ちの予定が消えた・もう pending でないなら送らない）
    const fresh = b.pend.map((x) => { const e = state.events.find((y) => y.id === x.id); return e?.nativeLink?.state === 'pending' && e.nativeLink.requestId === x.rid ? pendingEntry(e) : null; }).filter(Boolean);
    rec = fresh.filter((x) => x.e.recurrence); // 繰り返しは createEvents に載せない（単発と同じ経路で）
    const ents = [...fresh.filter((x) => !x.e.recurrence), ...b.b];
    if (ents.length) out = await runPaste(ents, { retried: true });
  } finally { xBusy = false; }
  if (out?.failures.length) return;
  for (const x of rec) { await createNative(x.id); if (xrDlg.open) break; }
}

// ---------- iPhone への反映（送信待ちを1件ずつ送る） ----------
const MSG = {
  missing: 'iPhone のカレンダーに元の予定が見つからないため、結びつきを外しました。Duo の予定はそのまま残っています。',
  conflictUpdate: 'iPhone のカレンダー側でも変更されていたため、Duo の内容で上書きしました。',
  conflictDelete: 'iPhone 側で変更されていたため、iPhone の予定は残しました',
  writeOnly: 'iPhone のカレンダーに反映するには、フルアクセスの許可が必要です。',
  fail: 'iPhone のカレンダーに反映できませんでした。次に開いたときにもう一度試します。',
  readOnly: 'このカレンダーには書き込めないため、iPhone のカレンダーへの反映を止めました。Duo の予定はそのまま残っています。',
  gaveUp: 'iPhone のカレンダーに反映できなかったため、結びつきを外しました。Duo の予定はそのまま残っています。',
};
let noticeTimer = 0;
// お知らせ（既定4秒、ms で変えられる）。action を付けると右にボタンを出す。
function notice(msg, action, ms = 4000) {
  clearTimeout(noticeTimer);
  document.querySelector('#native-toast')?.remove();
  const el = document.createElement('div');
  el.id = 'native-toast'; el.className = 'undobar toastbar'; el.setAttribute('role', 'status');
  const sp = document.createElement('span'); sp.textContent = msg; el.append(sp);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', action.fn); el.append(b); }
  document.body.append(el);
  noticeTimer = setTimeout(() => el.remove(), ms);
}
function requestFlush(delay = 400) {
  if (!NATIVE || !OBX.items.length) return;
  clearTimeout(OBX.timer);
  OBX.timer = setTimeout(() => { OBX.chain = OBX.chain.then(runFlush).catch(() => {}); }, delay);
}
async function ackOps({ keys = [], update, outbox }) {
  const r = await db.applyAck({ keys, update, outbox });
  OBX.items = r.list;
  applyEvents(r.events);
  return r;
}
// 新系列の確定待ちのまま取り残された np（待つ操作が消えた）は結びつきを外す。
async function sweepOrphans() {
  for (const e of state.events) {
    const l = e.nativeLink;
    if (l?.state === 'pending' && l.seriesStart && !OBX.items.some((o) => o.newRequestId === l.requestId)) {
      await ackOps({ keys: [e.id], update: (raw) => (raw.nativeLink?.requestId === l.requestId && raw.nativeLink.state === 'pending' ? { ...raw, nativeLink: { ...raw.nativeLink, state: 'unlinked', warn: null } } : null), outbox: (c) => c });
    }
  }
}
async function runFlush() {
  if (!['granted', 'writeOnly'].includes(X.perm)) return; // 許可がなければ待ちのまま
  await sweepOrphans();
  const tried = new Set();
  let failed = false;
  for (;;) {
    const op = OBX.items.find((o) => !tried.has(o.opId));
    if (!op) break;
    tried.add(op.opId); // 失敗は同じ flush 内では再試行しない（次の起点で）
    const r = await sendOp(op);
    if (r === 'stop') { failed = false; break; }
    if (r === 'fail') failed = true;
  }
  if (failed) notice(MSG.fail);
}
// 送る直前の最新の結びつき。新系列の確定待ちの操作は、確定するまで送らない。
function resolveLink(op) {
  const ev = state.events.find((e) => e.id === op.eventKey), l = ev?.nativeLink;
  const same = l && l.requestId === op.link.requestId;
  if (op.link.state === 'pending') {
    if (same && l.state === 'linked') return { link: l };
    if (OBX.items.some((o) => o.newRequestId === op.link.requestId)) return { wait: true };
    return { drop: true };
  }
  if (same && l.state !== 'linked') return { drop: true }; // 解除済み
  return { link: same ? l : op.link };
}
function buildArgs(op, link) {
  const a = { itemId: link.itemId || '', externalId: link.externalId || '', eventId: link.eventId || '', requestId: link.requestId, calendarId: link.calendarId || '', span: op.span };
  const occ = op.span === 'all' ? (link.seriesStart || op.occurrenceStart) : op.occurrenceStart;
  if (occ) a.occurrenceStart = occ;
  if (Number.isFinite(link.ekModified)) a.expectModified = link.ekModified;
  if (op.kind === 'update') {
    const p = op.payload;
    for (const k of ['title', 'place', 'notes']) if (k in p) a[k] = p[k];
    if ('start' in p) { a.start = p.start; a.end = p.all ? `${dayOf(p.end)}T00:00` : p.end; a.all = !!p.all; }
    if ('alarms' in p) a.alarms = p.alarms;
    if ('calendarId' in p) a.moveCalendarId = p.calendarId;
    if ('recurrence' in p) a.recurrence = p.recurrence;
    if (op.newRequestId) a.newRequestId = op.newRequestId;
  }
  return a;
}
const removeOp = (id) => (cur) => cur.filter((o) => o.opId !== id);
async function sendOp(op) {
  const rl = resolveLink(op);
  if (rl.wait) return 'skip';
  if (rl.drop) { await ackOps({ outbox: removeOp(op.opId) }); return 'ok'; }
  const link = rl.link, args = buildArgs(op, link);
  OBX.inflight = op.opId;
  if (op.undoOnly) { try { return await sendUndo(op, link, args); } finally { OBX.inflight = null; } }
  try {
    let res, conflict = false;
    try { res = await call(op.kind === 'delete' ? 'deleteEvent' : 'updateEvent', args); } catch (e) {
      if (op.kind === 'update' && errCode(e) === 'CONFLICT') { res = await call('updateEvent', { ...args, force: true }); conflict = true; } else throw e;
    }
    await onSendOk(op, link, res || {}, conflict);
    return 'ok';
  } catch (e) {
    return await onSendFail(op, link, e);
  } finally { OBX.inflight = null; }
}
// 取消用の削除: 削除の直前に最新の iPhone 側を確認し、貼付後に変わっていれば（force せず）消さずに Duo の予定を戻す。
async function sendUndo(op, link, args) {
  try {
    const ids = { itemId: link.itemId || '', externalId: link.externalId || '', eventId: link.eventId || '' };
    let d = null;
    try { d = await call('getEvent', { ...ids, occurrenceStart: op.start, currentStart: op.start }); } catch (e) {
      if (errCode(e) === 'NOT_FOUND') { await ackOps({ outbox: removeOp(op.opId) }); return 'ok'; } // すでに無い
      throw e;
    }
    if (Number.isFinite(op.expectModified) && Number.isFinite(d?.modifiedAt) && d.modifiedAt !== op.expectModified) throw { code: 'CONFLICT' };
    if (Number.isFinite(op.expectModified)) args.expectModified = op.expectModified;
    await call('deleteEvent', args);
    await ackOps({ outbox: removeOp(op.opId) });
    return 'ok';
  } catch (e) { return await onSendFail(op, link, e); }
}
// 取消の削除を取りやめる: iPhone の予定は消さず、Duo の予定を（なければ）戻す。
async function keepUndone(op) {
  try {
    const r = await db.restoreUndone({ record: op.restore, opId: op.opId });
    OBX.items = r.list;
    if (r.restored) { state.events = [...state.events.filter((e) => e.id !== op.restore.id), r.event]; bumpRevision(); }
  } catch { /* 送信待ちは残り、次の機会にもう一度判定する */ return; }
  notice('iPhone 側で変更されていたため、1件は残しました。');
  requestNotifySync('undo');
  render();
}
async function onSendOk(op, link, res, conflict) {
  const now = Date.now(), del = op.kind === 'delete';
  const ids = (base) => ({
    ...base, v: 2, state: 'linked',
    itemId: res.itemId != null ? String(res.itemId) : base.itemId, externalId: res.externalId != null ? String(res.externalId) : base.externalId,
    eventId: res.eventId != null ? String(res.eventId) : base.eventId, calendarId: res.calendarId || base.calendarId,
    ekModified: del ? now : Number.isFinite(res.modifiedAt) ? res.modifiedAt : base.ekModified, syncedAt: now, warn: null,
    ...(op.kind === 'update' && op.payload?.calendarId ? { calName: undefined, calSource: undefined, ...calIdent(res.calendarId || op.payload.calendarId) } : {}), // 移動したら保存名も新しい先へ
  });
  const npLink = op.newParentId ? withIdent({ ...ids({ requestId: op.newRequestId, calendarId: link.calendarId }), seriesStart: op.occurrenceStart, matchedBy: 'id' }) : null;
  const moves = op.kind === 'update' && (op.span === 'all' || (op.span === 'this' && !op.occurrenceStart));
  const r = await ackOps({
    keys: [op.eventKey, ...(op.newParentId ? [op.newParentId] : [])],
    update: (raw, key) => {
      const l = raw.nativeLink;
      if (key === op.newParentId) return l?.requestId === op.newRequestId && l.state === 'pending' ? { ...raw, nativeLink: npLink } : null;
      if (!l || l.requestId !== link.requestId || l.state === 'unlinked') return null;
      if (op.newParentId) return { ...raw, nativeLink: withIdent({ ...l, ekModified: Number.isFinite(res.modifiedAt) ? res.modifiedAt : l.ekModified, syncedAt: now, warn: null }) };
      return { ...raw, nativeLink: withIdent({ ...ids(l), seriesStart: moves ? raw.start : (l.seriesStart || raw.start) }) };
    },
    // 待ちから消すのは opId だけ。新系列が確定したら、np への待ちの操作へ新しい結びつきを渡す。
    outbox: (cur) => cur.filter((o) => o.opId !== op.opId).map((o) => (npLink && o.link?.requestId === op.newRequestId ? { ...o, link: npLink } : o)),
  });
  if (conflict) notice(MSG.conflictUpdate);
  if (op.newParentId || r.events.length) requestNotifySync('link');
  render();
}
// 結びつきを外す（同じ予定への待ちも除く）。Duo の予定は残す。
async function unlinkOp(op, warn, msg) {
  const reqs = new Set([op.link.requestId, op.newRequestId].filter(Boolean));
  await ackOps({
    keys: [op.eventKey, ...(op.newParentId ? [op.newParentId] : [])],
    update: (raw) => (raw.nativeLink && reqs.has(raw.nativeLink.requestId) && raw.nativeLink.state !== 'unlinked' ? { ...raw, nativeLink: { ...raw.nativeLink, state: 'unlinked', warn } } : null),
    outbox: (cur) => cur.filter((o) => o.opId !== op.opId && !reqs.has(o.link?.requestId)),
  });
  notice(msg);
  requestNotifySync('link');
  render();
}
async function onSendFail(op, link, e) {
  const code = errCode(e);
  if (op.undoOnly && ['CONFLICT', 'READ_ONLY', 'CALENDAR_NOT_FOUND'].includes(code)) { await keepUndone(op); return 'ok'; }
  switch (code) {
    case 'NOT_FOUND':
      if (op.kind === 'delete') { await ackOps({ outbox: removeOp(op.opId) }); return 'ok'; }
      await unlinkOp(op, 'missing', MSG.missing); return 'ok';
    case 'CONFLICT': // update は force で再送済みなので、ここへ来るのは delete（iPhone の予定は消さない）
      await unlinkOp(op, 'conflict', MSG.conflictDelete); return 'ok';
    case 'CALENDAR_NOT_FOUND': await unlinkOp(op, 'missing', MSG.readOnly); return 'ok';
    case 'READ_ONLY': await unlinkOp(op, null, MSG.readOnly); return 'ok';
    case 'WRITE_ONLY':
      X.perm = 'writeOnly';
      await ackOps({ keys: [op.eventKey], update: (raw) => (raw.nativeLink?.requestId === link.requestId && raw.nativeLink.warn !== 'writeOnly' ? { ...raw, nativeLink: { ...raw.nativeLink, warn: 'writeOnly' } } : null) });
      notice(MSG.writeOnly, { label: '設定を開く', fn: openSettings });
      if (calScreenOpen()) renderCalScreen();
      return 'stop';
    case 'PERMISSION_DENIED': case 'RESTRICTED':
      X.perm = code === 'RESTRICTED' ? 'restricted' : 'denied';
      if (link.enabled) dropLink('カレンダーへのアクセスを確認してください。');
      return 'stop';
    default: {
      const tries = (op.tries || 0) + 1;
      if (tries >= 5 && op.undoOnly) { await keepUndone(op); return 'ok'; }
      if (tries >= 5) { await unlinkOp(op, null, MSG.gaveUp); return 'ok'; }
      await ackOps({ outbox: (cur) => cur.map((o) => (o.opId === op.opId ? { ...o, tries } : o)) });
      return 'fail';
    }
  }
}
$('#xr-close').addEventListener('click', () => closePanel(xrDlg));
$('#xr-retry').addEventListener('click', () => {
  const b = xrBatch; xrBatch = null;
  xrKeep = true; closePanel(xrDlg);
  if (b) retryBatch(b); else createNative(xrId);
});
// 閉じる・Escape・通知タップなど「再試行しない」閉じ方はすべてここで確定する（pending を放置しない）。
xrDlg.addEventListener('close', () => {
  syncInert();
  const keep = xrKeep, id = xrId, b = xrBatch;
  xrKeep = false;
  if (keep || xrDlg.open) return;
  if (b) { xrBatch = null; if (b.pend.length) abandonMany(b.pend); return; }
  if (!id) return; // 再試行の閉じ方、または閉じたあと再び開いた（再失敗）なら確定しない
  const l = state.events.find((x) => x.id === id)?.nativeLink;
  if (l?.state === 'pending') giveUpCreate(id, l.requestId);
});


// ---------- 通知（編集シートの行・設定パネル・許可・タップ） ----------
const AL = { wrap: $('#alwrap'), sel: [$('#f-al0'), $('#f-al1')], row: [$('#al0-row'), $('#al1-row')], val: [$('#al0-v'), $('#al1-v')], note: $('#al-note'), off: $('#al-off'), perm: $('#al-perm'), xperm: $('#al-xperm'), ilink: $('#al-ilink'), extra: $('#al-extra') };
const openGoogleSettings = async () => {
  const m = $('#m-gmsg'); m.hidden = true;
  let r = null;
  try { r = await call('openSettings'); } catch { /* 下の案内を出す */ }
  if (!r?.opened) { m.textContent = '設定アプリを開けませんでした。iPhone の「設定」アプリから、カレンダー › アカウント へ進んでください。'; m.hidden = false; }
};
const openSettings = async () => { try { await call('openSettings'); } catch { /* 開けなくても案内は残る */ } };
// 編集中の予定の iPhone との関係。linked / pending は iPhone 側のアラームが鳴らす（Duo は鳴らさない）。
const editLinked = () => {
  if (extEd) return true; // iPhone の予定: 通知は iPhone のアラーム
  const cur = editing ? resolve(editing) : null;
  return !!(cur && ['linked', 'pending'].includes(cur.p.nativeLink?.state));
};
function updateAlarmUi() {
  AL.wrap.hidden = !NATIVE;
  if (!NATIVE) return;
  const all = F.all.checked, list = Array.isArray(alarms) ? alarms : [];
  const linked = editLinked(), n = loadNotify();
  const noAccess = linked && X.perm !== 'granted';
  const rows = list.length ? 2 : 1;
  for (let i = 0; i < 2; i++) {
    AL.row[i].hidden = i >= rows;
    if (i >= rows) continue;
    const other = list[1 - i] ? encAlarm(list[1 - i]) : null;
    const opts = alarmOptions(all, list).filter((o) => o.value === '' || o.value !== other);
    const cur = list[i] ? encAlarm(list[i]) : '';
    AL.sel[i].innerHTML = opts.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    AL.sel[i].value = cur;
    AL.sel[i].disabled = noAccess;
    AL.val[i].textContent = `${(opts.find((o) => o.value === cur) || opts[0]).label} ›`;
    AL.val[i].classList.toggle('none', !cur);
  }
  const fires = !linked && list.length > 0;
  const st = parseInput(fullStart(), all);
  const past = fires && !!st && F.rfreq.value === 'none' && pastForNotify({ all, start: st, end: st }, list, new Date());
  AL.note.hidden = !past;
  AL.note.textContent = '過去の予定には通知されません';
  AL.off.hidden = linked || n.enabled;
  AL.perm.hidden = !(fires && n.enabled && N.perm === 'denied');
  AL.ilink.hidden = !linked || noAccess;
  AL.xperm.hidden = !noAccess;
  const extra = extEd?.detail?.alarmsExtra || 0;
  AL.extra.hidden = !(extEd && extra > 0);
  AL.extra.textContent = extra > 0 ? `iPhone で設定した通知が他に${extra}件あります。ここで通知を変えると置き換わります。` : '';
}
function onAlarmChange(i) {
  const vals = [0, 1].filter((j) => !AL.row[j].hidden).map((j) => decAlarm(AL.sel[j].value));
  vals[i] = decAlarm(AL.sel[i].value);
  const next = vals.filter(Boolean);
  if (extEd) extEd.touched = true;
  alarms = alarmsDup(next) ? next.filter((a, j) => next.findIndex((b) => encAlarm(b) === encAlarm(a)) === j) : next;
  updateAlarmUi();
  saveDraft();
}
AL.sel.forEach((el, i) => el.addEventListener('change', (ev) => { ev.stopPropagation(); onAlarmChange(i); }));
AL.off.addEventListener('click', () => openNotify(AL.off));
$('#al-settings').addEventListener('click', openSettings);
$('#al-xsettings').addEventListener('click', openSettings);

// 通知の許可。notifyStatus / requestNotifyPermission も再予約と同じ直列 chain に載せる（同時に native を呼ばない）。
function refreshNotifyPerm() {
  if (!NATIVE) return Promise.resolve();
  const p = N.chain.then(async () => { try { const st = await call('notifyStatus'); N.perm = st?.status || N.perm; } catch { /* 不明のまま */ } });
  N.chain = p;
  return p;
}
// notDetermined のときだけ iOS の許可ダイアログを要求する。許可状態が変わったら再予約。
// 通知が全体オフのときは求めない（テスト通知だけ force で求める）。
function askNotifyPerm({ force = false } = {}) {
  if (!NATIVE || (!force && !loadNotify().enabled)) return Promise.resolve();
  const p = N.chain.then(async () => {
    try {
      const st = await call('notifyStatus');
      N.perm = st?.status || N.perm;
      if (N.perm === 'notDetermined') {
        const r = await call('requestNotifyPermission');
        N.perm = r?.status || N.perm;
        notifyPermissionChanged();
      }
    } catch { /* 許可の確認に失敗しても保存・操作は成立 */ }
    if (dlg.open) updateAlarmUi();
    if (notifyDlg.open) renderNotify();
  });
  N.chain = p;
  return p;
}

// 通知パネル（その他メニュー →「通知」）。右ページ／全画面の dialog.full。
const NT = { body: $('#nt-body') };
let nt = { msg: '', err: '', busy: false };
function openNotify(from) {
  nt = { msg: '', err: '', busy: false };
  renderNotify();
  openPanel(notifyDlg, from);
  NT.body.querySelector('button')?.focus({ preventScroll: true });
  refreshNotifyPerm().then(() => { if (notifyDlg.open) renderNotify(); });
}
function optHtml(opts, cur) { return opts.map((o) => `<option value="${esc(o.value)}"${o.value === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join(''); }
function renderNotify() {
  const n = loadNotify(), on = n.enabled, dis = nt.busy ? ' disabled' : '';
  const tOpts = alarmOptions(false, [n.defaultTimed]), aOpts = alarmOptions(true, [n.defaultAllDay]);
  const tCur = encAlarm(n.defaultTimed), aCur = encAlarm(n.defaultAllDay);
  const lbl = (opts, cur) => (opts.find((o) => o.value === cur) || opts[0]).label;
  let h = `<div class="swrow nsw"><span id="nt-swl">予定の通知</span><button type="button" role="switch" id="nt-sw" class="sw" aria-checked="${on}" aria-labelledby="nt-swl"${dis}><span class="knob" aria-hidden="true"></span><span class="swt">${on ? 'オン' : 'オフ'}</span></button></div>`;
  if (N.perm === 'denied') h += '<section class="card ncard deny"><p class="berr" role="alert">iPhone の設定で通知が許可されていません。</p><button type="button" id="nt-settings">設定を開く</button></section>';
  else if (N.perm === 'provisional') h += '<section class="card ncard"><p>通知は通知センターに静かに届きます。ロック画面に出すには、設定で許可してください。</p><button type="button" id="nt-settings">設定を開く</button></section>';
  if (nt.err) h += `<p class="berr" role="alert">${esc(nt.err)}</p>`;
  h += `<h3 class="nh">新しい予定の既定</h3><section class="card nrows">
    <label class="alrow"><span class="alk">時刻のある予定</span><span class="alv">${esc(lbl(tOpts, tCur))} ›</span><select id="nt-dt" aria-label="時刻のある予定の既定">${optHtml(tOpts, tCur)}</select></label>
    <label class="alrow"><span class="alk">終日の予定</span><span class="alv">${esc(lbl(aOpts, aCur))} ›</span><select id="nt-da" aria-label="終日の予定の既定">${optHtml(aOpts, aCur)}</select></label>
    <p class="small">ここを変えても、すでにある予定の通知は変わりません。</p></section>
    <div class="swrow nsw"><span id="nt-tl">通知に予定名を表示</span><button type="button" role="switch" id="nt-showtitle" class="sw" aria-checked="${n.showTitle}" aria-labelledby="nt-tl"><span class="knob" aria-hidden="true"></span><span class="swt">${n.showTitle ? 'オン' : 'オフ'}</span></button></div>
    <p class="nsmall">オフにすると、ロック画面には「予定があります」とだけ出ます。</p>
    <section class="card nstat"><p class="ncount"><strong>予約中 <span id="nt-count">${N.scheduled == null ? '—' : N.scheduled}</span>件</strong></p><p class="small">${WINDOW_DAYS}日先まで・最大${MAX_PENDING}件。アプリを開くたびに先の分を予約し直します。長く開かないと、その先は届きません。通知が上限や${WINDOW_DAYS}日先で切れるときは、最後に「Duo カレンダーを開いてください」のお知らせが1件入ります（その分、予定の通知は${MAX_PENDING - 1}件になります）。</p></section>
    <button type="button" id="nt-test" class="nbtn"${dis}>1分後にテスト通知を送る</button>`;
  if (nt.msg) h += `<p class="bmsg" role="status">${esc(nt.msg)}</p>`;
  NT.body.innerHTML = h;
}
function updateNotifyCount() {
  const el = $('#nt-count');
  if (el) el.textContent = N.scheduled == null ? '—' : N.scheduled;
}
NT.body.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  if (b.id === 'nt-settings') openSettings();
  else if (b.id === 'nt-sw') {
    const next = !loadNotify().enabled;
    saveNotify({ enabled: next });
    notifySettingsChanged(); // オフは直列 clear
    renderNotify();
    NT.body.querySelector('#nt-sw')?.focus({ preventScroll: true });
    if (next) { await askNotifyPerm(); if (notifyDlg.open) renderNotify(); NT.body.querySelector('#nt-sw')?.focus({ preventScroll: true }); }
  } else if (b.id === 'nt-showtitle') {
    saveNotify({ showTitle: !loadNotify().showTitle });
    notifySettingsChanged();
    renderNotify();
    NT.body.querySelector('#nt-showtitle')?.focus({ preventScroll: true });
  } else if (b.id === 'nt-test') {
    nt = { msg: '', err: '', busy: true }; renderNotify();
    await askNotifyPerm({ force: true });
    try { await call('notifyTest'); nt = { msg: '1分後にテスト通知を送ります。', err: '', busy: false }; } catch (e) { nt = { msg: '', err: errCode(e) === 'PERMISSION_DENIED' ? '通知が許可されていないため、テスト通知を送れません。' : 'テスト通知を送れませんでした。もう一度お試しください。', busy: false }; }
    renderNotify();
    NT.body.querySelector('#nt-test')?.focus({ preventScroll: true });
  }
});
NT.body.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'nt-dt') saveNotify({ defaultTimed: decAlarm(t.value) });
  else if (t.id === 'nt-da') saveNotify({ defaultAllDay: decAlarm(t.value) });
  else return;
  notifySettingsChanged();
  renderNotify();
  NT.body.querySelector(`#${t.id}`)?.focus({ preventScroll: true });
  if (t.value) askNotifyPerm().then(() => { if (notifyDlg.open) renderNotify(); }); // 「なし」では求めない。オフ中は askNotifyPerm 側で求めない
});
$('#nt-close').addEventListener('click', () => closePanel(notifyDlg));

// 通知のタップ: その日を開く（閉じた／縦は日表示、見開きは月＋右の時間軸）。対象の回を1.5秒だけ枠で示す。詳細・編集は開かない。
let lastTap = { key: '', t: 0 };
function onNotifyTap(p) {
  if (!p || !isKey(p.day)) return;
  const key = `${p.day}|${p.eventId}`, now = Date.now();
  if (key === lastTap.key && now - lastTap.t < 1500) return; // 同じ通知の二重配送
  lastTap = { key, t: now };
  if (!N.ready) { N.tap = p; return; }
  openNotifyTarget(p);
}
function openNotifyTarget({ day, eventId }) {
  for (const d of [menuDlg, searchDlg, backupDlg, xdDlg, xrDlg, catsDlg, notifyDlg]) if (d.open) closePanel(d, false);
  const target = eventsOnDay(occIn(day, day), day).find((e) => !isX(e) && (e.id === eventId || e.parentId === eventId));
  const spreadKind = layoutKind() === 'spread';
  // 見開きで時間ページがどちらにも無いときは、予定を見せるため右を時間にする。日付は左右共通。
  const needTime = spreadKind && target && PG().left !== 'time' && PG().right !== 'time';
  MM.open = null;
  set({ selected: day, home: false, view: spreadKind ? 'month' : 'day', ...(needTime ? { pages: selectPage(state.pages, 'right', 'time') } : {}) });
  if (!target) { say(`${dayLabel(day)}を開きました。`); return; }
  const sel = spreadKind ? '.page[data-page="time"] .tlev, .page[data-page="time"] .adpill' : '.daylist .event, .tlx .tlev, .tlx .adpill';
  const el = [...root.querySelectorAll(sel)].find((b) => b.dataset.event === target.id && (!b.dataset.sday || b.dataset.sday === day));
  if (el) {
    const tl = el.closest('.tl');
    if (tl) tl.scrollTop = Math.max(0, tl.scrollTop + el.getBoundingClientRect().top - tl.getBoundingClientRect().top - 40);
    else el.scrollIntoView({ block: 'nearest' });
    el.classList.add('nhl');
    setTimeout(() => el.classList.remove('nhl'), 1500);
  }
  say(`${dayLabel(day)}の予定「${target.title}」の通知を開きました。`);
}

// ---------- 通知の再予約（予約の正本は常に「今の予定＋通知設定」。差分でなく全件を送り直す） ----------
// N.scheduled / N.lastReason はメモリだけ。要求は 500ms trailing debounce、世代で古い応答を捨て、native 呼出しは常に1本ずつ。
const N = { ready: false, tap: null, perm: null, scheduled: null, lastReason: '', err: '', gen: 0, timer: 0, chain: Promise.resolve() };
const NOTIFY_OK = ['granted', 'provisional', 'ephemeral'];
function requestNotifySync(reason = 'unknown') {
  if (!NATIVE || !N.ready) return;
  const gen = ++N.gen;
  N.lastReason = reason;
  clearTimeout(N.timer);
  N.timer = setTimeout(() => { N.chain = N.chain.then(() => runNotifySync(gen)).catch(() => {}); }, 500);
}
async function runNotifySync(gen) {
  if (gen !== N.gen) return; // 開始前に新しい要求が来ていれば、そちらに任せる
  try {
    const n = loadNotify();
    if (!n.enabled) {
      await call('notifyClear'); // 許可状態に関係なく、オフなら全消去
      if (gen === N.gen) { N.scheduled = 0; N.err = ''; updateNotifyCount(); }
      return;
    }
    const st = await call('notifyStatus');
    if (gen !== N.gen) return;
    N.perm = st?.status || null;
    if (!NOTIFY_OK.includes(N.perm)) { N.scheduled = null; return; } // 許可はここでは要求しない
    const { items } = planNotifications(state.events, new Date(), n, { visible: duoVisible() });
    if (gen !== N.gen) return;
    const r = await call('notifySync', { items });
    if (gen === N.gen) { N.scheduled = Number.isFinite(r?.scheduled) ? r.scheduled : items.length; N.err = ''; updateNotifyCount(); }
  } catch (e) {
    if (gen === N.gen) { N.err = errCode(e) || 'UNAVAILABLE'; N.scheduled = null; }
  }
}
// 公開呼出し名。PR 4 の設定・許可処理もここへ接続する。
window.syncNotifications = requestNotifySync;
const notifySettingsChanged = () => requestNotifySync('settings'); // オン・既定・showTitle の変更。オフなら直列 clear
const notifyPermissionChanged = () => requestNotifySync('permission');

// 折り状態（PR11）。外面（閉じた画面）は layoutKind が home/browse のため折り扱いから除外。本文の配置はまだ変えない。
postureCtl = createPosture({
  call, listen, el: document.documentElement,
  eligible: () => !['home', 'browse'].includes(layoutKind()),
  onChange: () => updateKbMetrics(),
});
window.__posture = postureCtl; // 手動「折り」代替とテスト用
async function initNative() {
  if (!NATIVE) return;
  postureCtl.start(); // 権限処理より前に購読→取得。失敗・未対応でも起動を止めない
  // 連携オフ・カレンダー権限なしでも通知は動くので、購読は権限確認より前に行う。
  listen('calendarChanged', () => { clearTimeout(extTimer); extTimer = setTimeout(() => { if (extActive()) loadExt(true); }, 300); });
  listen('notificationTapped', onNotifyTap);
  listen('notificationPresented', () => requestNotifySync('fired')); // 前面で鳴ったら次の予約を補充（既存の debounce・直列・世代処理）
  listen('timeChanged', () => { X.cache = null; bumpRevision(); requestNotifySync('time'); if (extActive()) loadExt(true); else render(); });
  const p = await checkPerm();
  if (p === null) return;
  if (['granted', 'writeOnly'].includes(p)) requestFlush(0);
  if (p === 'granted' && !link.enabled && linkMigPending()) { try { await refreshCalendars(); } catch { /* 取得できなければ次回 */ } } else if (p !== 'granted') migrateLinkOnce();
  if (link.enabled) {
    if (p === 'granted') { try { await refreshCalendars(); } catch { /* 一覧は後で再取得 */ } loadExt(true); } else dropLink('カレンダーへのアクセスを確認してください。');
  }
  if (extActive() && !dlg.open) {
    const pend = state.events.filter((e) => e.nativeLink?.state === 'pending');
    if (pend.length === 1) openRetry(pend[0].id, 'iPhoneのカレンダーへの追加が完了していない予定があります。', true);
    else if (pend.length) { // 全件を1つのダイアログにまとめる
      xrId = null;
      xrBatch = { pend: pend.map(pendingEntry), b: [], canRetry: true };
      $('#xr-msg').textContent = `iPhoneのカレンダーへの追加が完了していない予定が${pend.length}件あります。`;
      $('#xr-retry').hidden = false;
      openPanel(xrDlg, document.activeElement);
      $('#xr-retry').focus({ preventScroll: true });
    }
  }
  if (dlg.open) updateXUi();
}

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (MM.open && !anyPanel()) { closeMini(); return; }
  if (TLM.open && !anyPanel()) { const sd = TLM.open; TLM.open = null; render(); root.querySelector(`[data-act="tlmenu"][data-pane="${sd}"]`)?.focus({ preventScroll: true }); return; }
  if (dlg.open && destPage.isOpen() && !scopeDlg.open && !confirmDlg.open && !discardDlg.open) { closeDestPop(); return; }
  if (scopeDlg.open) cancelScope();
  else if (xrDlg.open) closePanel(xrDlg);
  else if (confirmDlg.open) cancelConfirm();
  else if (menuDlg.open) menuBack();
  else if (xdDlg.open) closePanel(xdDlg);
  else if (taskDlg.open) dismissPopup(false);
  else if (notifyDlg.open) closePanel(notifyDlg);
  else if (catsDlg.open) catsBack();
  else if (backupDlg.open) backBackup();
  else if (searchDlg.open) closePanel(searchDlg);
  else if (dlg.open && !extBusy) closeEditor();
});

// ---------- タスク行の左スワイプ削除（PR20）。タスクページは左右スワイプのページ送りを使わない ----------
{
  let g = null, sup = 0;
  const reset = (row) => { if (row) { row.style.transition = 'transform .15s'; row.style.transform = ''; setTimeout(() => { row.style.transition = ''; }, 200); } };
  root.addEventListener('pointerdown', (ev) => {
    const row = ev.target instanceof Element ? ev.target.closest('.rmrow') : null;
    if (g || !row || !ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0) || anyPanel() || row.classList.contains('ro')) return;
    g = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, row, key: row.dataset.key.slice(3), on: false };
  });
  window.addEventListener('pointermove', (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    if (!g.on) { if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { g = null; return; } if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5) g.on = true; else return; }
    g.row.style.transform = `translateX(${Math.min(0, dx)}px)`;
  });
  const fin = (ev, cancel) => {
    if (!g || ev.pointerId !== g.id) return;
    const { row, key, on } = g, dx = ev.clientX - g.x, dy = ev.clientY - g.y; g = null;
    if (!on) return;
    sup = 1; setTimeout(() => { sup = 0; }, 400);
    if (!cancel && dx <= -72 && Math.abs(dx) >= Math.abs(dy) * 1.5) { row.style.transform = ''; deleteTask(key); } else reset(row);
  };
  window.addEventListener('pointerup', (ev) => fin(ev, false));
  window.addEventListener('pointercancel', (ev) => fin(ev, true));
  document.addEventListener('click', (ev) => { if (sup && ev.target.closest?.('.rmrow')) { sup = 0; ev.stopPropagation(); ev.preventDefault(); } }, true);
}

// ---------- スワイプ（左＝次、右＝前） ----------
const SWIPE_ZONE = '.scroll, .agenda, .remaining, .home, .hero, .page, .list, .tlx';
const SWIPE_EXCLUDE = '.top, .shead, .rhead, .allday, .tlheads, .mmenu, .chead, .foot, .add, .tabs, .pgsw, .tlmenu, .dbox, .ctl, .bandbg, .hline, .foldband, .gutter, input, select, textarea, label, dialog';
let swiping = false;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const paneContent = () => [...root.querySelectorAll('.scroll > *, .agenda > *, .hero > *, .remaining > *, .margin > *')];

// 見開きでは、なぞり始めたページ（左 'left' / 右 'right'）で動きを決める。月＝月送り、時間・メモ＝日送り（時間の週は7日）、タスク＝動かない。
let swipePane = null;
const pageOf = (t) => { const pg = t.closest('.page'); return pg && layoutKind() === 'spread' ? { side: pg.classList.contains('lp') ? 'left' : 'right', id: pg.dataset.page } : null; };
function swipeMove(dir) {
  const pane = swipePane; swipePane = null;
  if (pane && PG()[pane] !== 'month') {
    move(dir, pane);
    say(`選択日は${dayLabel(state.selected)}。`);
    return;
  }
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
const swipeCtl = initSwipe({
  root,
  canStart: (t) => {
    if (anyPanel() || swiping || !(t instanceof Element) || !t.closest(SWIPE_ZONE) || t.closest(SWIPE_EXCLUDE)) return false;
    const pg = pageOf(t);
    swipePane = null;
    if (!pg) { // 見開き以外の時間軸は従来どおり対象外。閉じた日・週（.tlx）は横にあふれていなければ日・週送りを許す
      const x = t.closest('.tlx');
      return x ? x.scrollWidth <= x.clientWidth + 1 : !t.closest('.tl');
    }
    if (PS.on && pg.id !== 'month') return false; // 貼付中は月のページだけ動く
    if (pg.id === 'task') return false;
    if (pg.id === 'memo' && isTextEl(document.activeElement)) return false; // メモを編集中は動かさない
    if (pg.id !== 'month') swipePane = pg.side;
    return true;
  },
  onSwipe: swipeTo,
});

// ---------- 直接入力の起点（PR24 の共通制御へ PR25 で時間軸を接続。月・チップは PR26 以降） ----------
// 既存予定・操作部品・入力欄の上は null。時刻座標のない行（旧一覧・余白）は時間入力にしない。
const DIRECT_ZONE_EXCLUDE = '.ev, .strip, .tlev, .dbox, button, input, select, textarea, label, dialog, .tlheads, .tlmenu, .mmenu, .tabs';
function directOrigin(t) {
  if (anyPanel() || !(t instanceof Element)) return null;
  const chip = !PS.on && PASTE_ENTRY ? t.closest('.week .bar[data-event], .week .strip[data-event]') : null; // 月のチップ（長押しでコピー・編集・削除のメニュー）
  if (chip && !t.closest('.tabs, .mmenu, .tlmenu')) return { kind: 'chip', id: chip.dataset.event, el: chip };
  const md = t.closest('.week .day[data-date]'); // 月の日マス（空白・数字）。帯・チップ・+N は別の要素なので起点にならない
  if (md && !t.closest('.tabs, .mmenu, .tlmenu')) return { kind: 'month', day: md.dataset.date, side: pageOf(md)?.side ?? null };
  if (t.closest('.week')) return null; // チップ・+N など月の他の要素は期間選択しない
  if (t.closest(DIRECT_ZONE_EXCLUDE)) return null;
  const ad = t.closest('.allday');
  if (ad) { const c = t.closest('.adcol'); return c ? { kind: 'allday', day: c.dataset.day } : null; } // 「終日」の文字や段の外は対象外
  const col = t.closest('.tlcol');
  if (col && col.closest('.tl')) return { kind: 'time', day: col.dataset.day, pane: paneOf(col.closest('.tl')) };
  return null;
}
const dragAt = (y, o) => { const col = colOf(o.pane, o.day); return col ? minAtY(y, col, o.pane) : null; };
const DIR = { anchor: 0 };
// 端スクロール（PR27）。時間軸＝上下40ptで毎秒120pt、月＝上下40ptに600ms滞在で前後の月。タイマー・rAF は終了・取消・回転で必ず解放する。
const EG = { x: 0, y: 0, tl: null, carry: 0, origin: null };
const feel = (kind = 'light') => { haptic(kind).catch(() => {}); };
const monthBounds = () => {
  const ws = [...monthScope().querySelectorAll('.week')].map((w) => w.getBoundingClientRect()).filter((r) => r.height > 0);
  return ws.length ? { top: Math.min(...ws.map((r) => r.top)), bottom: Math.max(...ws.map((r) => r.bottom)) } : null;
};
function timeRecalc() {
  if (DF.mode !== 'drag' || EG.origin?.kind !== 'time') return;
  const m = dragAt(EG.y, EG.origin); if (m == null) return;
  const r = dragRange(DIR.anchor, m);
  if (r.start !== DF.start || r.end !== DF.end) { Object.assign(DF, r); paintDraft(); feel('light'); }
}
const edgeLoop = createFrameLoop((dt) => {
  const o = EG.origin;
  if (!o || o.kind !== 'time' || DF.mode !== 'drag') return;
  const tl = EG.tl?.isConnected ? EG.tl : (EG.tl = colOf(o.pane, o.day)?.closest('.tl') ?? null);
  if (!tl) return;
  const rc = tl.getBoundingClientRect(), v = edgeVelocity(EG.y, rc.top, rc.bottom);
  if (!v) { EG.carry = 0; return; }
  const d = v * dt + EG.carry, w = Math.trunc(d);
  EG.carry = d - w;
  if (!w) return;
  const before = tl.scrollTop; tl.scrollTop = before + w;
  if (tl.scrollTop !== before) timeRecalc();
});
const monthDwell = createDwell({
  fire: (dir) => {
    if (MR.mode !== 'drag') return;
    swipePane = null; swipeMove(dir);
    requestAnimationFrame(() => { // 移動後の画面で、指の下の日へ終了日を合わせる（起点 MR.anchor は日付キーのまま保持）
      if (MR.mode !== 'drag') return;
      const k = dayAtPoint(EG.x, EG.y, monthScope());
      if (k && k !== MR.cur) { MR.cur = k; feel('light'); }
      paintRange();
    });
  },
});
function monthEdgeUpdate() {
  const b = monthBounds();
  monthDwell.update(b ? edgeZone(EG.y, b.top, b.bottom) : 0);
}
function stopEdge() { edgeLoop.stop(); monthDwell.stop(); EG.tl = null; EG.carry = 0; EG.origin = null; }
directCtl = initDirectInput({
  root, swipe: swipeCtl,
  classify: (t) => directOrigin(t),
  onStart: ({ origin: o, x, y }) => {
    EG.x = x; EG.y = y; EG.origin = o; EG.carry = 0; EG.tl = null;
    if (o.kind === 'chip') { openChipMenu(o.id, o.el); feel('light'); return; }
    if (o.kind === 'month') {
      Object.assign(MR, { mode: 'drag', anchor: o.day, cur: o.day, side: o.side }); paintRange(); feel('light');
      monthEdgeUpdate(); return;
    }
    if (o.kind !== 'time') return;
    const m = dragAt(y, o); if (m == null) return;
    DIR.anchor = m;
    Object.assign(DF, { mode: 'drag', day: o.day, pane: o.pane, anchor: m }, dragRange(m, m));
    paintDraft(); feel('light');
    edgeLoop.start();
  },
  onMove: ({ x, y, origin: o }) => {
    EG.x = x; EG.y = y;
    if (o.kind === 'month') {
      if (MR.mode !== 'drag') return;
      const k = dayAtPoint(x, y, monthScope());
      if (k && k !== MR.cur) { MR.cur = k; paintRange(); feel('light'); }
      monthEdgeUpdate();
      return;
    }
    if (o.kind !== 'time' || DF.mode !== 'drag') return;
    timeRecalc();
  },
  onEnd: ({ x, y, origin: o }) => {
    stopEdge();
    if (o.kind === 'month') {
      if (MR.mode !== 'drag') return;
      const k = dayAtPoint(x, y, monthScope()); if (k) MR.cur = k;
      if (PS.on) { const r = dayRange(MR.anchor, MR.cur); clearRange(); pasteAddDays(daysBetween(r.start, r.end)); return; }
      openRangeSheet(); return;
    }
    if (o.kind === 'allday') { openEditor(null, root.querySelector('[data-act="add"]'), o.day, null, { all: true, direct: true }); return; }
    if (o.kind !== 'time' || DF.mode !== 'drag') return;
    const m = dragAt(y, o); if (m != null) Object.assign(DF, dragRange(DIR.anchor, m));
    openDraft();
  },
  onCancel: () => { stopEdge(); if (DF.mode === 'drag') clearDraftBox(); if (MR.mode === 'drag') clearRange(); },
});
// 回転・ページ破棄では入力中の枠を取り消す（指の下の座標系が変わるため）。
window.addEventListener('orientationchange', () => directCtl?.cancel('rotate'));
window.addEventListener('pagehide', () => directCtl?.cancel('pagehide'));

// ---------- 月の期間入力（PR26）。MR は描画だけの状態（DB・native へは書かない） ----------
// mode: 'drag'＝長押しドラッグ中／'kbd'＝VoiceOver 等のボタン操作／'sheet'＝編集シート中。日付キーで持つので、再描画・全表示の仮想化にも追従する。
const MR = { mode: null, anchor: '', cur: '', side: null, bar: null, tag: null };
const monthScope = () => (MR.side ? root.querySelector(`.page.${MR.side === 'left' ? 'lp' : 'rp'}`) || root : root);
function clearRangeDom() {
  root.querySelectorAll('.day.msel').forEach((n) => n.classList.remove('msel', 'ms-first', 'ms-last'));
  MR.tag?.remove(); MR.tag = null;
}
function paintRange() {
  clearRangeDom();
  if (!MR.mode) { MR.bar?.remove(); MR.bar = null; return; }
  const { start: from, end: to } = dayRange(MR.anchor, MR.cur);
  let firstEl = null;
  monthScope().querySelectorAll('.day[data-date]').forEach((n) => {
    const k = n.dataset.date;
    if (k < from || k > to) return;
    n.classList.add('msel');
    if (k === from) { n.classList.add('ms-first'); firstEl = n; }
    if (k === to) n.classList.add('ms-last');
  });
  const tag = document.createElement('div');
  tag.className = 'mrtag'; tag.textContent = rangeText(from, to); tag.setAttribute('role', 'status');
  const host = monthScope();
  const hr = host.getBoundingClientRect(), r = (firstEl || [...host.querySelectorAll('.day.msel')][0])?.getBoundingClientRect();
  tag.style.left = `${Math.max(hr.left + 4, Math.min(r ? r.left : hr.left + 4, hr.right - 190))}px`;
  tag.style.top = `${Math.max(hr.top + 2, (r ? r.top : hr.top) - 30)}px`;
  document.body.append(tag); MR.tag = tag;
}
function clearRange() { if (!MR.mode) return; MR.mode = null; paintRange(); }
function dayAtPoint(x, y, scope) {
  for (const n of document.elementsFromPoint(x, y)) {
    const d = n.closest?.('.day[data-date]');
    if (d && scope.contains(d)) return d.dataset.date;
  }
  return null;
}
function openRangeSheet() {
  const { start: from, end: to } = dayRange(MR.anchor, MR.cur);
  MR.mode = 'sheet'; paintRange();
  openEditor(null, root.querySelector('[data-act="add"]'), from, null, { all: true, direct: true, endDay: to });
}
dlg.addEventListener('close', () => { if (MR.mode === 'sheet') clearRange(); });
// VoiceOver 代替: 「期間を選ぶ」→ 開始は選択日。終了日を1日ずつ動かして「決める」。
function startRangeKbd(btn) {
  if (anyPanel()) return;
  MR.mode = 'kbd'; MR.anchor = state.selected; MR.cur = state.selected; MR.side = pageOf(btn)?.side ?? null;
  paintRange();
  const bar = document.createElement('div');
  bar.className = 'mrbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '期間を選ぶ');
  bar.innerHTML = '<button type="button" data-mr="back">終了日を1日戻す</button><button type="button" data-mr="fwd">終了日を1日進める</button><button type="button" data-mr="ok">この期間で入力</button><button type="button" data-mr="no">やめる</button>';
  document.body.append(bar); MR.bar = bar;
  bar.addEventListener('click', (ev) => { const m = ev.target.closest('[data-mr]'); if (m) rangeKbd(m.dataset.mr); });
  bar.querySelector('[data-mr="fwd"]').focus({ preventScroll: true });
}
function rangeKbd(a) {
  if (MR.mode !== 'kbd') return;
  if (a === 'no') { MR.bar?.remove(); MR.bar = null; clearRange(); return; }
  if (a === 'ok') { MR.bar?.remove(); MR.bar = null; openRangeSheet(); return; }
  const cur = addDays(MR.cur, a === 'fwd' ? 1 : -1);
  if (cur < MR.anchor) return; // 終了日は開始日より前にしない（開始日を変えるなら選択日を変える）
  MR.cur = cur; paintRange();
  say(rangeText(MR.anchor, MR.cur));
}

// ---------- コピーと貼る日の選択（第14版 PR33）。実行（確定）は PR34 で PS.onConfirm へ接続する ----------
// 状態 PS はメモリだけ。選択・キャンセルでは DB・native を一切呼ばない（getEvent で型紙を取る ext のコピー開始を除く）。
function pasteBand() {
  const b = bandLabel(PS.src), n = PS.days.length;
  return `<div class="pband${b.multi ? ' multi' : ''}" role="group" aria-label="貼り付け先の日を選ぶ"><div class="pbl"><span class="pbt">${esc(b.text)}</span>${b.sub ? `<span class="pbs">${b.sub}</span>` : ''}</div><span class="pbnav">${navBtn(-1)}${navBtn(1)}</span><button type="button" class="pbc" data-pa="cancel">キャンセル</button><button type="button" class="pbo${n >= PASTE_MAX ? ' full' : ''}" data-pa="ok"${n ? '' : ' disabled'} aria-label="${pasteLabel(n)}">${n ? `<b class="pn">${n}</b>日に貼り付け` : '貼り付け'}</button></div>`;
}
// 貼付中は月が見えている状態を保つ（開閉・回転で別の表示になっても月へ戻す）。
function ensurePasteMonth() {
  if (!PS.on) return;
  state.strip = null;
  if (layoutKind() === 'spread') {
    if (state.pages.left !== 'month' && state.pages.right !== 'month') state.pages = selectPage(state.pages, state.lastSide, 'month');
  } else if (listShown() || state.view !== 'month') { state.home = false; state.view = 'month'; }
}
function applyPasteInert() {
  if (!PS.on) return;
  root.querySelectorAll('.week .bar, .week .strip, .week .plus, .mrpick, [data-act="add"], .tabs, .pgsw, .pnl, .pgrab').forEach((el) => { el.inert = true; });
  root.querySelectorAll('.pnl').forEach((el) => el.classList.add('pdim'));
  root.querySelectorAll('.page').forEach((p) => { const other = p.dataset.page !== 'month'; p.inert = other; p.classList.toggle('pdim', other); });
}
function startPaste(src, srcLink = null) {
  if (!PASTE_ENTRY || !src) return;
  directCtl?.cancel('paste'); MR.bar?.remove(); MR.bar = null; clearRange(); closeChipMenu();
  Object.assign(PS, { on: true, src: { ...src }, srcLink: srcLink ? { ...srcLink } : null, srcDay: dayOf(src.start), days: [] });
  render();
  say(`${bandLabel(PS.src).text}。日をたたいて選びます。`);
}
function cancelPaste() {
  if (!PS.on) return;
  Object.assign(PS, { on: false, src: null, srcLink: null, srcDay: '', days: [] });
  render();
  say('貼り付けをやめました。');
}
function pasteFull(day) {
  feel('warning');
  notice(`一度に貼り付けられるのは${PASTE_MAX}日までです`, null, 3000);
  const el = day ? root.querySelector(`.day[data-date="${day}"]`) : null;
  if (el && !reduced()) { el.classList.remove('pshake'); void el.offsetWidth; el.classList.add('pshake'); setTimeout(() => el.classList.remove('pshake'), 200); }
}
function pasteToggle(day) {
  const r = toggleDay(PS.days, day);
  if (r.full) { pasteFull(day); return; }
  PS.days = r.days;
  render();
  say(`${dayLabel(day)}を${PS.days.includes(day) ? '選びました' : '外しました'}。${PS.days.length}日。`);
}
function pasteAddDays(list) {
  const r = addDaysCapped(PS.days, list);
  PS.days = r.days;
  render();
  if (r.full) pasteFull(list[list.length - 1]);
  else say(`${PS.days.length}日を選んでいます。`);
}
// 貼付中の操作。日と帯のボタンと月送りだけ通し、チップ・＋・他ページなどは何もしない。
function pasteClick(b) {
  const d = b.dataset;
  if (d.pa === 'cancel') { if (!PS.busy) cancelPaste(); return true; }
  if (d.pa === 'ok') { if (PS.days.length && !PS.busy && PS.onConfirm) PS.onConfirm({ src: PS.src, srcLink: PS.srcLink, days: [...PS.days] }); return true; }
  if (d.date) { pasteToggle(d.date); return true; }
  if (['prev', 'next', 'today', 'allmonth'].includes(d.act)) return false;
  return true;
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && PS.on && !anyPanel() && !PS.busy) cancelPaste(); });
// 確定: 計画を作って pasteCommit へ（Duo 分は1回の保存、iPhone 分は createEvents）。保存に失敗したら選択を残して再度押せる。
async function confirmPaste({ src, srcLink, days }) {
  if (PS.busy) return;
  const plan = planPaste(src, days, { cals: X.calendars, enabled: extActive(), destCalendarId: destCalId(), destCatId: (() => { const d = destNow(); return d.type === 'duo' ? d.id : ''; })(), catVisible: (id) => state.categories.some((c) => c.id === id && !c.hidden), defaultCatId, newId, pastedAt: Date.now(), srcLink });
  if (!plan.ok) { notice(plan.error === 'too-many' ? `一度に貼り付けられるのは${PASTE_MAX}日までです` : '貼り付ける日を選んでください'); return; }
  PS.busy = 1;
  root.querySelectorAll('[data-pa]').forEach((b) => { b.disabled = true; });
  let r = null;
  try { r = await pasteCommit(plan); } finally { PS.busy = 0; }
  if (r?.busy || r?.saveFailed) { render(); if (r.busy) notice('iPhone との通信中です。少し待ってからもう一度押してください。'); return; } // 選択は残す
  Object.assign(PS, { on: false, src: null, srcLink: null, srcDay: '', days: [] });
  render();
}
PS.onConfirm = confirmPaste;

// コピーする予定の型紙。Duo は回（occurrenceAt 後）を写し、ext は getEvent の詳細から作る。
function duoSource(id) {
  const r = resolve(id);
  if (!r) return null;
  const o = r.occ;
  const src = { title: o.title, categoryId: o.categoryId, all: !!o.all, start: o.start, end: o.end, place: o.place || '', notes: o.notes || '', alarms: Array.isArray(o.alarms) ? o.alarms.map((a) => ({ ...a })) : undefined };
  if (o.nativeLink) src.nativeLink = { ...o.nativeLink };
  return { src, link: r.p.nativeLink ? { ...r.p.nativeLink } : null };
}
async function extSource(id) {
  const e = visExt().find((x) => x.id === id);
  if (!e) return null;
  const d = await call('getEvent', extTarget(e));
  return { ...toDisplay(d, X.calendars.find((c) => c.id === e.calId)), id, alarms: Array.isArray(d.alarms) ? d.alarms.map((a) => ({ ...a })) : undefined };
}
let copyGen = 0;
async function copyFrom(id) {
  if (!PASTE_ENTRY) return;
  if (isXId(id)) {
    const gen = ++copyGen;
    try {
      const s = await extSource(id);
      if (gen !== copyGen) return;
      if (!s) throw new Error('gone');
      startPaste(s, null);
    } catch { if (gen === copyGen) notice('コピーできませんでした。iPhone のカレンダーを確認してください。'); }
  } else { const s = duoSource(id); if (s) startPaste(s.src, s.link); }
}

// チップの長押しメニュー（幅160・1行44・角丸12）。書けない iPhone の予定は編集・削除を無効にし、コピーは使える。
let chipMenu = null;
function closeChipMenu() { chipMenu?.remove(); chipMenu = null; document.removeEventListener('pointerdown', chipMenuOutside, true); }
function chipMenuOutside(ev) { if (chipMenu && !chipMenu.contains(ev.target)) closeChipMenu(); }
function openChipMenu(id, chipEl) {
  closeChipMenu();
  const ext = isXId(id), x = ext ? visExt().find((v) => v.id === id) : null;
  const editable = !ext || !preReason(X.calendars.find((c) => c.id === x?.calId));
  const m = document.createElement('div');
  m.className = 'cmenu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', '予定の操作'); m.dataset.cmenu = id;
  m.innerHTML = `<button type="button" role="menuitem" data-cm="copy">コピー</button><button type="button" role="menuitem" data-cm="edit"${editable ? '' : ' disabled'}>編集</button><button type="button" role="menuitem" data-cm="del" class="danger"${editable ? '' : ' disabled'}>削除</button>`;
  const r = chipEl.getBoundingClientRect(), W = 160, H = 132;
  m.style.left = `${Math.round(Math.min(Math.max(4, r.left), window.innerWidth - W - 4))}px`;
  m.style.top = `${Math.round(r.bottom + 4 + H > window.innerHeight - 4 ? Math.max(4, r.top - H - 4) : r.bottom + 4)}px`;
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cm]');
    if (!b || b.disabled) return;
    closeChipMenu();
    if (b.dataset.cm === 'copy') copyFrom(id);
    else { openEditor(id, chipEl); if (b.dataset.cm === 'del' && !ext) $('#delete').click(); }
  });
  document.body.append(m); chipMenu = m;
  document.addEventListener('pointerdown', chipMenuOutside, true);
  m.querySelector('[data-cm="copy"]').focus({ preventScroll: true });
}
window.addEventListener('orientationchange', closeChipMenu);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && chipMenu) closeChipMenu(); });
// ポップアップの「コピー」（予定の下の行）。書けない iPhone の予定でもコピーはできる。
$('#copy').addEventListener('click', () => {
  if (!editing || extEd || extBusy) return;
  if (editorDirty()) { $('#error').textContent = '変更を保存するか閉じてから、コピーしてください。'; return; }
  const s = duoSource(editing);
  if (!s) return;
  closeEditor();
  startPaste(s.src, s.link);
});
$('#xd-copy').addEventListener('click', () => {
  const s = xdState;
  if (s?.status !== 'ok') return;
  closePanel(xdDlg);
  startPaste(s.before, null);
});

// ---------- 起動 ----------
// 寸法 L が変わった時だけ再描画する。キーボードの出入りは位置・寸法の変数更新だけ。
window.addEventListener('resize', vpSchedule);
window.addEventListener('orientationchange', vpSchedule);
initScreenDiagCopy();
window.visualViewport?.addEventListener('resize', vpSchedule);
window.visualViewport?.addEventListener('scroll', vpSchedule);
// safe area だけが変わった場合（回転を伴わない変化・検証用の注入）も再配置する。自分が書く --vy/--vb では再入しない。
new MutationObserver(() => { if (safeKey(safe()) !== lastSafe) vpSchedule(); }).observe(de, { attributes: true, attributeFilter: ['style', 'class'] });
document.addEventListener('focusin', (ev) => { if (isTextEl(ev.target)) { clearTimeout(kbTimer); kbHold = false; vpSchedule(); setTimeout(() => reveal(ev.target), 50); } });
document.addEventListener('focusout', (ev) => {
  if (rendering || !isTextEl(ev.target)) return;
  kbHold = true; clearTimeout(kbTimer);
  kbTimer = setTimeout(() => { kbHold = false; vpSchedule(); }, 700);
});
setInterval(() => { if (!anyPanel() && listShown()) render(); else updateNow(); }, 60000);

async function boot() {
  updateVars();
  render();
  await applyNotifyPolicy(); // 既存端末の証拠は、カテゴリ移行や新しい印より前に採る
  let rt = null; // カテゴリの一度きり移行（取得より前）。失敗は印なしでロールバック済み。次の起動で再実行。戻り値は PR12 が移行前の証拠として使う
  try { rt = await db.migrateCategoriesOnce(new Date()); } catch { rt = null; }
  boot.retarget = rt;
  try { setCategories(await db.listCategories()); let bf = null; try { bf = await db.backfillNotifyOnce(new Date()); } catch { bf = null; /* ロールバック済み。次の起動で再実行 */ } state.events = await db.listEvents(); try { OBX.items = await db.getOutbox(); } catch { OBX.items = []; } bumpRevision(); N.ready = true; requestNotifySync(bf?.ran ? 'backfill' : 'launch'); } catch { say('保存領域を開けませんでした。'); }
  state.loaded = true;
  render();
  if (rt?.marker?.toast === 'pending' && rt.marker.moved > 0) { notice(RETARGET_TOAST, null, 6000); db.markRetargetToastDone().catch(() => {}); }
  try { await recoverMemoDraft(); } catch { /* 下書きは残る */ }
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }
  if (draft && typeof draft === 'object') {
    const id = draft.editing && resolve(draft.editing) ? draft.editing : null;
    origins.set(dlg, root.querySelector('[data-act="add"]'));
    showEditor({
      title: draft.title || '', categoryId: draftCat(draft), all: !!draft.all, start: draft.start || '', end: draft.end || '', place: draft.place || '', notes: draft.notes || '',
      rfreq: draft.rfreq, rbyday: Array.isArray(draft.rbyday) ? draft.rbyday : [], rend: draft.rend, rcount: draft.rcount, runtil: draft.runtil, ropen: !!draft.ropen, autoDays: draft.autoDays, dest: id ? draftEditDest(draft, id) : draftDest(draft),
      alarms: Array.isArray(draft.alarms) ? draft.alarms : id ? undefined : defaultAlarms(!!draft.all, loadNotify()),
    }, id, false);
    edBase = null; // 復元した下書きは未保存の変更として扱う
  }
  if (N.tap) { const t = N.tap; N.tap = null; openNotifyTarget(t); }
  loadTasks(); // Duo 内のタスクを読む（許可・native は使わない）
  await Promise.race([initNative(), new Promise((r) => setTimeout(r, 2500))]);
  document.documentElement.dataset.ready = '1';
}
boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && location.protocol !== 'capacitor:' && !(window.Capacitor?.isNativePlatform?.()) && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
