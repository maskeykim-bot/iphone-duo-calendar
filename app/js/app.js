import * as db from './db.js';
import { isoFromInput, stateFromInput, setStartDate, pickEndDate, setStartTime, setEndTime, setDuration, setAll } from './datetime.js';
import { createTimeUi, createDateUi, createDateField, createTimeField, fireInput, monthOf, withHm } from './datetime-ui.js';
import { SAMPLE } from './sample.js';
import { initSwipe } from './swipe.js';
import { planMoveDuo, planMoveDuoUndo, buildMoveExtArgs, buildUndoExtArgs, extUndoAllowed, UNDO_CONFLICT_TEXT } from './move-day.js';
import { grabAllowed, initDirectInput, dayRange, rangeText, minutesAt, dragRange, tapRange, moveHandle, moveBox, spanText, hm as hmText, snap15, hitDraftPart, edgeZone, edgeVelocity, createDwell, createFrameLoop } from './direct-input.js';
import { occurrenceAt, parseOccId, planDelete, planEdit, editInfo, normRule } from './recur.js';
import { bumpRevision, occBetween } from './occcache.js';
import { LIMIT, groupByDay, highlight, excerpt, normalize, terms, searchEvents, searchNotes, searchTasks, noteIndexSize } from './search.js';
import { backupName, buildBackup, countStats, localIso, legacyHashes, planAppend, planLegacyNotes, planNotes, planTasks, validateBackup, MAX_BYTES } from './backup.js';
import { CAT_IDS, LIMITS as CAT_LIMITS, canHideCategory, defaultDeleteTarget, ensureOneVisible, supplementForReplace, PALETTE, UNCATEGORIZED, countByCategory, fixEventCategories, legacyToId, mergeCategories, moveCategory, nameTaken, RETARGET_TOAST, newCategory, paletteName, planDeleteCategory, resolveCategory, sortCategories, tint, validateCategory } from './categories.js';
import { alarmOptions, alarmsAria, alarmsDup, convertAlarms, decAlarm, defaultAlarms, encAlarm, fireAt, nextNotifyText, normNotify, pastForNotify, planNotifications, planNotifyPolicy, MAX_PENDING, WINDOW_DAYS } from './notify.js';
import { rokuyoOf } from './rokuyo.js';
import { createPainter } from './curl/painter.js';
import { createCurl, curlColors } from './curl/index.js';
import { createNativeCurl, getEngine as curlEngine, setEngine as setCurlEngine, B_OFF as CURL_B_OFF } from './curl/native-curl.js';
import { holidayOf } from './holidays.js';
import { splitEvents, eveningFirst, homeTasks, dueText, tomorrowSummary, axisBars } from './home.js';
import { PAGE_IDS, normalizePages, selectPage, normTimeMode, TIME_MODES, TIME_LABELS, FOCUS_MODES, FOCUS_LABELS, normFocusMode, normSpreadType, normTtSplit } from './pages.js';
import { noteStore, setNoteHook, recoverNoteDrafts, importLegacyMemoDrafts, folderOps, groupNotes, filterByFolder, FOLDER_NAME_MAX } from './notes.js';
import { mountNoteEditor } from './notes-ui.js';
import { richLines, viewOf } from './note-lines.js';
import { titleOf, noteDateOf, dateOccupants, dailyHeading, ensureDailyFolder } from './notes-model.js';
import { DELETE_UNDO_MS, tasksHtml, focusTasksHtml, HIST_DAYS, openTaskEditor, taskEditorHtml, taskDirty, saveTask, hasNotify, NOTE_NEED_DUE, createDeleteController, TASK_DELETED } from './reminders.js';
import { liveTasks as liveTasksOf, LOCAL_LIST, TASK_STORE_TEXT, createTaskStore, createLocalCall, createLocalAddController, rowOf, createTaskDoneController, DONE_UNDO_MS, TASK_VIEWS, TASK_VIEW_LABELS, normTaskView, dueCounts, todayTasks, inheritTaskSettings, normTaskSettings } from './tasks.js';
import { PASTE_MAX, addDaysCapped, bandLabel, clipTitle, daysBetween, pasteLabel, planPaste, spanOf, toggleDay } from './paste.js';
import { call, hideKeyboardAccessoryBar, errCode, errReason, errText, haptic, listen, nativeAvailable, remNative, requestReminderPermission } from './native.js';
import { createReminderSync, normSyncSettings, previewFirst, applyFirst, prevListCandidates, SYNC_WINDOW_DAYS } from './reminder-sync.js';
import { createDestPage, destRowsHtml } from './destination-ui.js';
import { KB_METRICS_ENABLED, kbMetrics, kbText, screenText } from './kbmetrics.js';
import { createPosture, postureText, grooveBands } from './posture.js';
import { FOLD_HH, FOLD_RATE, foldGeometry, windowMinutes, rawMinutesAt, foldEdgeZone, labelY, partTitles, openingMinute, clampS } from './fold.js';
import { kbTopOf, hingeBand, computeKbLayout, caretBox, scrollDelta, STRIP_MIN } from './keyboard-layout.js';
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
    style: STYLES.includes(s.style) ? s.style : 'named', // 新しい端末の既定は予定名（第19.1版 H-04）。保存済みの設定は尊重する
    desk: s.desk === true,
    home: s.home === true ? true : s.home === false ? false : null, // null=未選択（閉じた画面では一覧、開いた画面では月などの本文）。true=「一覧」を選んだ
    monthExpand: s.monthExpand === true,
    monthForm: ['one', 'two', 'month'].includes(s.monthForm) ? s.monthForm : 'two', // 月を引く画面の型（第19版 PR6）。初めは 2週
    monthDay: s.monthDay === 'time' ? 'time' : 'list', // 月を引く画面の日の部分（予定｜時間軸）。初めは 予定
    weekStart: s.weekStart === 0 ? 0 : 1, // 週の始まり: 0=日曜 / 1=月曜（既定）
    monthTimeClosed: s.monthTimeClosed === true, // 月表示に時刻を出す（閉じた画面。既定は切）
    // 同（開いた画面・見開き・卓上。既定は切）。第10版は既定「入」の値を自動保存していたため、monthTimeV=11 の印がない保存値の true は旧既定とみなして切に戻す
    monthTimeOpen: s.monthTimeV === 11 ? s.monthTimeOpen === true : false,
    monthTextSize: s.monthTextSize === 'large' ? 'large' : 'normal', // 月の文字: 標準 / 大
    pages: normalizePages(s.pages), // 開いた横の左右ページ（月・時間・タスク・メモ）と縦の下パネル。旧 home/view は閉じた画面・縦の従来表示用に保持
    timeMode: normTimeMode(s.timeMode), // 時間ページの表示（左右別）: '1' 1日 | '3' 3日 | 'week' 週 | 'list' 一覧
    spreadType: normSpreadType(s.spreadType), // 見開きの型: 'pages'（左右自由。既定）| 'tt'（今日＋明日）。左右の種類（pages）は別に保つ
    ttSplit: normTtSplit(s.ttSplit), // 今日＋明日の1日ページの予定欄の高さ（左右共通）
    taskView: normTaskView(s.taskView), // 集中タスクの見方（today|plan|all|done）
    focusMode: normFocusMode(s.focusMode), // 開いた縦の集中モード（calendar|task|note）。他の姿勢では使わず、保存だけ保つ
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
  const { selected, view, style, desk, home, monthExpand, monthForm, monthDay, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTextSize, rokuyo, holidayRed, pages, timeMode, lastSide, focusMode, taskView, spreadType, ttSplit } = state;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ selected, view, style, desk, home, monthExpand, monthForm, monthDay, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTimeV: 11, monthTextSize, rokuyo, holidayRed, pages, timeMode, lastSide, focusMode, taskView, spreadType, ttSplit })); } catch { /* 保存不可でも動作は続ける */ }
}
// 左右（または縦の下パネル）のページを選ぶ。同じ種類が左右に並ぶ場合は交換。
function setPage(side, id) { set({ pages: selectPage(state.pages, side, id) }); }
function set(patch) {
  if (state.strip && !('strip' in patch) && ['view', 'home', 'pages', 'desk'].some((k) => k in patch)) patch = { ...patch, strip: null }; // 下のタブ・ページ切替で帯の入口から元へ戻る
  if (noteStore.anyDirty() && ['pages', 'view', 'home', 'desk', 'focusMode'].some((k) => k in patch)) { noteSync(); noteStore.flushAll(); } // ページを変える前に未保存のノートを書く
  Object.assign(state, patch); if ('weekStart' in patch) setFirstDay(state.weekStart); saveUi(); render(); }

// ---------- レイアウト寸法 L（キーボードで変わらない寸法）と可視範囲 V ----------
// L = キーボード非表示時の文書領域。テキスト入力中（とその直後）は幅が変わらない限り高さの縮小を無視する。
const de = document.documentElement;
const L = { w: window.innerWidth, h: window.innerHeight };
const maxH = new Map([[L.w, L.h]]);
let kbHold = false, kbTimer = 0;
const isTextEl = (a) => !!a && !!a.matches?.('textarea, .ned-body, select, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit])');
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
  if (el?.classList?.contains('ned-body')) { revealCaret(el); return; }
  const sc = el?.closest?.('.fbody, .pbody, .ftdn');
  if (!sc) return;
  const a = el.getBoundingClientRect(), b = sc.getBoundingClientRect(), pad = 8;
  if (a.top < b.top + pad) sc.scrollTop -= b.top + pad - a.top;
  else if (a.bottom > b.bottom - pad) sc.scrollTop += a.bottom - (b.bottom - pad);
}
// ノート本文: 入力行（挿入位置の行）が本文の窓の中に見えるよう、窓だけを最小距離スクロールする。
function revealCaret(ta) {
  const sc = ta.closest('.ned-bodywrap'); if (!sc || !sc.clientHeight) return;
  const c = caretBox(ta), t = ta.getBoundingClientRect(), v = sc.getBoundingClientRect();
  const d = scrollDelta({ itemTop: t.top + c.top, itemBottom: t.top + c.bottom, viewTop: v.top, viewBottom: v.bottom });
  if (d) sc.scrollTop += d;
}
// キーボード上端（kbTop）と折り目の溝に合わせた入力欄・本文の配置（PR34）。CSS 変数と html の属性だけを書く（DOM は作り直さない）。
let klKey = '';
function clearKbLayout() {
  if (!klKey) return;
  klKey = ''; de.classList.remove('kbl'); delete de.dataset.kbl; delete de.dataset.kbe; delete de.dataset.kbdn; delete de.dataset.kbnu;
  for (const k of ['up-top', 'up-h', 'dn-top', 'dn-h', 'add-top', 'as-top', 'as-pad', 'as-h', 'ed-top', 'ed-h', 'nu-top', 'nu-h']) de.style.removeProperty(`--kl-${k}`);
}
function applyKbLayout() {
  const m = fmode();
  const kbTop = kbTopOf(window.visualViewport, window.innerHeight);
  const kbUp = !!de.dataset.kb && kbTop !== null;
  const mode = m === 'task' && kbUp && root.querySelector('.ftdn') ? 'task' : m === 'note' && NB.cur && root.querySelector('.nhost') ? 'note' : null;
  if (!mode) { clearKbLayout(); return; }
  const p = postureCtl?.effective ?? null, H = L.h;
  const hinge = hingeBand({ rect: p?.available ? p.regionRect : null, axis: p?.axis, height: H });
  const top = mode === 'task' ? parseFloat(getComputedStyle(de).getPropertyValue('--head-h')) || 82 : Math.ceil(root.querySelector('.ntools')?.getBoundingClientRect().bottom || 126);
  const sab = safe().bottom;
  const lay = computeKbLayout({ H, kbTop: kbUp ? kbTop : H - sab, hinge, top, hasAdd: mode === 'task', restMin: mode === 'note' ? STRIP_MIN : undefined });
  const folded = de.classList.contains('folded');
  const r = (v) => `${Math.round(v * 100) / 100}px`;
  const v = { 'up-top': r(lay.up.top), 'up-h': r(lay.up.height), 'dn-top': r(lay.dn?.top ?? 0), 'dn-h': r(lay.dn?.height ?? 0), 'as-top': r(lay.assist.hitTop), 'as-pad': r(lay.assist.visTop - lay.assist.hitTop), 'as-h': r(lay.assist.hitHeight), 'add-top': r(lay.add?.top ?? 0) };
  // ノート: 折って書くとき（または下面が足りないとき）は本文が上面、ほかのノートの題名が下面。開ききりは上が一覧・下が本文。
  const edUp = folded || !lay.dn;
  const ed = edUp ? lay.up : lay.dn, nu = edUp ? lay.dn : lay.up;
  Object.assign(v, { 'ed-top': r(ed.top), 'ed-h': r(ed.height), 'nu-top': r(nu?.top ?? 0), 'nu-h': r(nu?.height ?? 0) });
  const key = `${mode}|${edUp}|${Object.values(v).join(',')}`;
  if (key === klKey) return;
  klKey = key;
  de.classList.add('kbl'); de.dataset.kbl = mode; de.dataset.kbe = edUp ? 'up' : 'dn'; de.dataset.kbdn = lay.dn ? '1' : '0'; de.dataset.kbnu = nu && nu.height >= STRIP_MIN ? '1' : '0';
  for (const [k, val] of Object.entries(v)) de.style.setProperty(`--kl-${k}`, val);
  const a = document.activeElement; if (a?.matches?.('.ned-body')) revealCaret(a);
}
window.__kbLayoutNow = () => { klKey = ''; applyKbLayout(); };
// 入力・カーソル移動のたびに、本文の入力行を窓へ追随させる（変換中も。DOM は触らずスクロールだけ）。
let caretRaf = 0;
const caretFollow = () => { cancelAnimationFrame(caretRaf); caretRaf = requestAnimationFrame(() => { const a = document.activeElement; if (a?.classList?.contains('ned-body') && de.classList.contains('kbl')) revealCaret(a); }); };
document.addEventListener('selectionchange', caretFollow);
document.addEventListener('input', (ev) => { if (ev.target?.classList?.contains('ned-body')) caretFollow(); }, true);
let vpRaf = 0;
let directCtl = null; // 直接入力の制御（回転で取り消す）
function vpSchedule() { cancelAnimationFrame(vpRaf); vpRaf = requestAnimationFrame(vpTick); }
function vpTick() {
  const changed = measureL();
  const { kb } = updateVars();
  const sc = safeChanged();
  updateDiagnostics();
  if (changed || sc) { directCtl?.cancel('rotate'); ttCurl?.reset('rotate'); flushEditing(); render(); }
  applyKbLayout();
  placeNoteSheet();
  if (dlg.open) grooveSchedule();
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
// 開いた縦の集中モード。開いた縦以外では常に calendar 扱い（保存値は残す）。
const fmode = () => (layoutKind() === 'open' && isPortrait() ? state.focusMode : 'calendar');
const panelAvail = () => layoutKind() === 'open' && isPortrait() && fmode() === 'calendar' && state.view === 'month' && !listShown() && state.spreadType !== 'tt' && !pullOn();
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
const POS = { post: 'closed', band: false, bg: null, hbar: false, set: null, search: null, all: null, task: null, memo: null, today: null, add: null, pnl: null, fm: null, tt: null, fmode: 'calendar', ux: 1 };
let ttPageH = 603; // 開いた横の1日ページの高さ（y0〜603。updateLayoutMetrics が決める）
function updateLayoutMetrics() {
  const S = safe(); lastSafe = safeKey(S);
  const kind = layoutKind(), W = L.w, H = L.h;
  const T = S.top, R = S.right, B = S.bottom, Ls = S.left;
  const x0 = Ls, y0 = T, U = W - Ls - R, V = H - T - B;
  const post = kind === 'home' || kind === 'browse' ? 'closed' : kind === 'open' && isPortrait() ? 'portrait' : 'landscape';
  const n = monthWeeks(state.selected).length;
  const v = { 'layout-w': W, 'layout-h': H, 'content-x': x0, 'content-y': y0, 'content-w': U, 'content-h': V, 'fold-x': W / 2 };
  const pos = { post, band: false, bg: null, hbar: false, set: null, search: null, all: null, task: null, memo: null, today: null, add: null, pnl: null, fm: null, tt: null, fmode: 'calendar', ux: 1 };
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
    // 第19版 PR5（design/28）: タブ x191〜477・y863〜909（高さ 46）、＋ は右下の丸 48（y863〜911）。下の 34 はよける。
    left = x0; right = W - R; c = U / 7; headH = head; gridTop = head + 64; // 見出し（月・‹ ›・全・今日）は上の帯の下 y82〜126、曜日 126〜146、マスは y146〜（上の帯は設定・切替・検索だけ）
    const rowTop = Math.min(H - B - 88 * p, H - B - 48);
    G = rowTop - 8 * p - gridTop; // 月はタブの上 8 まで
    ctrlY = rowTop; tabsY = rowTop; tabsCx = Ls + U / 2;
    tabsW = Math.min(286, Math.max(0, U - 2 * (20 + 48 + 8)));
    hc = Math.min(head - 22, Math.max(22, head * 46 / 82));
    pos.hbar = true; pos.ux = ux;
    // 設定 x20〜64・検索は右の端から 20（x605〜649）、どちらも y19〜63（44×44。design/32 §5-5）
    pos.set = box(Ls + 20, 19, HIT_HDR, HIT_HDR); pos.search = box(W - R - 20 - HIT_HDR, 19, HIT_HDR, HIT_HDR);
    pos.today = box(Ls + 20, rowTop, 48, 48); pos.add = box(W - R - 20 - 48, rowTop, 48, 48);
    pos.fmode = fmode();
    // 開いた縦の上の帯は設計08 §6.2: 右の x540〜（ux 比）は時刻・電池のため空け、操作を置かない。
    const cluster = Ls + 540 * ux, headLimit = Math.min(cluster, W - R);
    // 「カレンダー｜タスク｜ノート」は上の帯の真ん中 x224〜444・y23〜59（220×36、角丸10。17 §1）。押せる高さは ::before で y19〜63（44）。下の段には出さない。
    const fmX = Ls + (U - 220) / 2;
    if (pos.fmode === 'calendar') {
      pos.fm = { x: fmX, y: 23, w: 220, h: 36 };
    } else { // タスク／ノート: 日付｜切替｜検索｜＋。検索と＋も予約の左へ収める
      const addX = headLimit - HIT_HDR, searchX = addX - 8 * ux - HIT_HDR;
      pos.fm = { x: fmX, y: 23, w: Math.max(0, Math.min(220, searchX - 8 * ux - fmX)), h: 36 };
      pos.search = box(searchX, 19, HIT_HDR, HIT_HDR); pos.add = box(addX, 19, HIT_HDR, HIT_HDR);
      pos.today = null; pos.pnl = null;
    }
    q = p;
    v['content-y'] = T; v['content-h'] = V;
    if (panelAvail()) pos.pnl = box(Ls + 80, rowTop, 48, 48); // 今日の丸の右、間12
    if (panelOn()) {
      // 下パネル: マスは通常の高さ比 414/774、パネルは マスの下端〜（操作段の上端−8p）。基準 y520〜873。
      G = ((H - B - 71 * p) - gridTop) * 414 / 774; // 下パネルの月は今の高さ比のまま（PR6 で月タブごと作り直す）
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
      // 見開きの型（今日＋明日）: 検索とタスクの間の空きの真ん中。56 が入らなければ出さない（既存の並びは詰めない）
      const gTop = tops[1] + VIS_BAND + m, gBot = tops[2] - m;
      if (gBot - gTop >= HIT_BAND) pos.tt = box(bx, gTop + (gBot - gTop - HIT_BAND) / 2, HIT_BAND, VIS_BAND);
    }
    ttPageH = Math.max(0, tabsTop - 8 * q - y0); v['tt-h'] = ttPageH;
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
    'head-h': headH, 'wd-h': post === 'portrait' ? 20 : gridTop - y0 - headH, 'hc': hc,
  });
  if (post === 'landscape') v['hpt'] = Math.max(0, 40 * q - 22);
  // 閉じた画面: 月のスクロール末尾は、最終週をタブの上へ出せるだけ（安全矩形の下端 − タブ上端）、最低56
  de.style.setProperty('--end-pad-closed', `${r2(Math.max(56, y0 + V - (v['tabs-y'] ?? 0)))}px`);
  de.style.setProperty('--ry', String(Math.round(q * 1e5) / 1e5)); // 基準比率 q（閉 678／横 669／縦 951 に対する高さの比）
  for (const [k, val] of Object.entries(v)) de.style.setProperty(`--${k}`, `${r2(val)}px`);
  de.style.setProperty('--chip-fs', `${state.monthTextSize === 'large' ? 11 : post === 'closed' ? 9 : post === 'portrait' ? 10 : 9}px`);
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
const FOCUS_NOUN = { calendar: '予定', task: 'タスク', note: 'ノート' };
// 開いた縦の集中モード切替（カレンダー｜タスク｜ノート）。native button + aria-pressed。
const focusSwitch = () => {
  const f = POS.fm; if (!f) return '';
  const on = POS.fmode;
  const date = on === 'calendar' ? '' : `<span class="fdate" style="left:${r2(POS.set.x + 52 * POS.ux)}px;top:${r2(f.y)}px;height:${f.h}px">${esc(dayLabel(todayKey()))}</span>`;
  return `${date}<div class="fmodes" role="group" aria-label="集中モード" style="left:${r2(f.x)}px;top:${r2(f.y)}px;width:${r2(f.w)}px;height:${f.h}px">${FOCUS_MODES.map((m, i) => `<button type="button" data-fmode="${m}" aria-pressed="${m === on}" aria-description="3個中${i + 1}番目">${FOCUS_LABELS[m]}</button>`).join('')}</div>`;
};
const ICON_TT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="4.5" width="8" height="15" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="4.5" width="8" height="15" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 9h3M5.5 12h3M15.5 9h3M15.5 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const CTL = {
  set: () => `<button type="button" class="cb csettings" data-act="menu" aria-label="設定" aria-haspopup="dialog"${posStyle(POS.set)}><span class="bi">${ICON_GEAR}</span></button>`,
  search: () => `<button type="button" class="cb csearch" data-act="search" aria-label="${FOCUS_NOUN[POS.fmode] || '予定'}を検索"${posStyle(POS.search)}><span class="bi">${ICON_SEARCH}</span></button>`,
  task: () => {
    const n = stripTaskCount(), on = stripOn('task');
    return `<button type="button" class="cb cstrip ctask${on ? ' on' : ''}" data-act="strip" data-strip="task" aria-pressed="${on}" aria-label="${n ? `タスク、期限切れと今日 ${n}件` : 'タスク'}"${posStyle(POS.task)}><span class="bi">${ICON_TASK}${n ? `<span class="bdg" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</span></button>`;
  },
  memo: () => {
    const on = stripOn('memo');
    return `<button type="button" class="cb cstrip cmemo${on ? ' on' : ''}" data-act="strip" data-strip="memo" aria-pressed="${on}" aria-label="ノート"${posStyle(POS.memo)}><span class="bi">${ICON_MEMO}</span></button>`;
  },
  tt: () => { const on = ttOn(); return `<button type="button" class="cb ctt${on ? ' on' : ''}" data-act="spreadtype" aria-pressed="${on}" aria-label="今日と明日の見開き"${posStyle(POS.tt)}><span class="bi">${ICON_TT}</span></button>`; },
  today: () => `<button type="button" class="cb ctoday" data-act="today" aria-label="今日に戻る"${posStyle(POS.today)}><span class="bi" aria-hidden="true">${todayLabel()}</span></button>`,
  pnl: () => { const on = state.pages.portraitShown; return `<button type="button" class="cb cpnl${on ? ' on' : ''}" data-act="pnltoggle" aria-label="${on ? '下の段を隠す' : '下の段を表示'}"${posStyle(POS.pnl)}><span class="bi">${ICON_PNL}</span></button>`; },
  add: () => `<button type="button" class="cb cadd" data-act="add" aria-label="${FOCUS_NOUN[POS.fmode] || '予定'}を追加"${posStyle(POS.add)}><span class="bi" aria-hidden="true">＋</span></button>`,
};
// 右の帯のタスク／メモ。閉じた画面は全面に出している間、見開きはどちらかのページがそれのとき「開いている」。
const stripOn = (id) => (layoutKind() === 'spread' ? PG().left === id || PG().right === id : state.strip === id);
const stripTaskCount = () => {
  if (!RM.data) return 0;
  const ids = delCtl.ids(), list = ids.size ? RM.data.reminders.filter((x) => !ids.has(x.itemId)) : RM.data.reminders;
  return todayTasks(list, todayKey(), doneCtl.pending()).total;
};
const monthAll = () => viewNow() === 'month' && !listShown();
// 帯／見出しの上の操作群。帯があるとき（閉じた画面・開いた横）は帯に5つ（全は月のみ）、なければ見出し・下段へ。
function ctl() {
  const bg = POS.bg ? `<div class="bandbg" aria-hidden="true" style="left:${r2(POS.bg.x)}px;width:${r2(POS.bg.w)}px"></div>` : '';
  let h = '';
  if (POS.post === 'closed') {
    h = POS.band ? CTL.set() + CTL.search() + CTL.task() + CTL.memo() + CTL.today() + CTL.add() : CTL.set() + CTL.search() + CTL.today() + CTL.add();
  } else if (POS.post === 'portrait') h = CTL.set() + focusSwitch() + CTL.search() + (POS.today ? CTL.today() : '') + (POS.pnl ? CTL.pnl() : '') + CTL.add();
  else if (POS.band) h = CTL.set() + CTL.search() + (POS.tt ? CTL.tt() : '') + CTL.task() + CTL.memo() + CTL.today() + CTL.add();
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
    // 閉じた画面の週は同じ月なら「11月16日〜22日」（design/28 §1）。月をまたぐときは両方の月を書く
    const short = (POS.post === 'closed' || foldOn()) && s.getMonth() === e.getMonth();
    return `${s.getMonth() + 1}月${s.getDate()}日〜${short ? '' : `${e.getMonth() + 1}月`}${e.getDate()}日`;
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
const LANE_TOP = 18, LANE_STEP = 16, LANE_PAD = 2;
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
function pasteGhostHtml(w, cap, lt = LANE_TOP, ls = LANE_STEP) {
  const gs = pasteGhosts(w, cap);
  if (!gs.length) return '';
  const s = PS.src, v = s.origin === 'iphone' ? `--cat:${s.color || '#68716A'};` : catVar(s);
  return gs.map((g) => {
    const t = clipTitle(s.title), time = !s.all && g.n === 1 ? `${s.start.slice(11, 16)} ` : '';
    const label = !g.first ? `${t}（つづき）` : g.n > 1 ? `${t} ${g.n}日` : `${time}${t}`;
    return `<span class="pghost${g.n > 1 ? ' pband2' : ''}${g.first ? '' : ' cont'}${g.last ? '' : ' more'}" aria-hidden="true" data-pghost="${g.day}" style="${v}${colPos(g.sc, g.ec)};top:${lt + g.lane * ls}px">${esc(label)}</span>`;
  }).join('');
}
const colPos = (sc, ec) => `left:calc(${sc} * 100% / 7 + 1.5px);width:calc(${ec - sc + 1} * 100% / 7 - 3px)`;
// 週の中身: 日セル（button）・+N（兄弟 button）・帯／チップ（兄弟 button）。ボタンの入れ子は作らない。
// mode: simple（点）| named | all。
function weekInner(w, { mode, cur, sel, today, cap, time, tk = null, lt = LANE_TOP, ls = LANE_STEP, plusLane = -1 }) {
  const { days, wev, hidden } = w;
  let items = w.items;
  // 月を引く画面（design/22 §1）: 入りきらない日は最後の1件の代わりに「+n」を最後の段へ出す（その日だけの予定を1件はずして数に足す）。
  const dropped = Array(7).fill(0);
  if (plusLane >= 0) items = items.filter((b) => { if (b.sc === b.ec && b.lane === plusLane && hidden[b.sc] > 0) { dropped[b.sc]++; return false; } return true; });
  let html = '';
  days.forEach((k, col) => {
    const es = eventsOnDay(wev, k), d = parseKey(k), dow = d.getDay();
    const r = rkOf(k), label = d.getDate() === 1 ? (state.rokuyo ? `${d.getMonth() + 1}/1` : `${d.getMonth() + 1}月1日`) : d.getDate(); // 六曜オンの1日は「11/1」（左の六曜とぶつかるため）
    const tn = tk?.get(k) || 0; // 月にタスクの件数（開いた画面だけ。タスク名は出さない）
    const dots = mode === 'simple' ? `<span class="dots">${es.slice(0, cap).map((e) => `<i class="dot ${catCls(e)}"${catSty(e)}></i>`).join('')}</span>` : '';
    const ps = PS.on ? PS.days.includes(k) : false, pSrc = PS.on && k === PS.srcDay;
    html += `<button type="button" class="day${cur !== null && d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}${dow === 6 ? ' sat' : dow === 0 ? ' sun' : ''}${state.holidayRed && holName(k) ? ' hol' : ''}${ps ? ' psel' : ''}${pSrc ? ' psrc' : ''}" data-date="${k}" aria-label="${dayLabel(k)}${holSpoken(k)}${r ? `、${r.name}` : ''}、予定${es.length}件${xCount(es)}${NB.marks.has(k) ? '、ノートあり' : ''}${tn ? `、未完了のタスク${tn}件` : ''}${PS.on ? `${pSrc ? '、コピー元' : ''}、${ps ? '選択中。この日を外す' : 'この日を選ぶ'}` : ''}" aria-pressed="${PS.on ? ps : k === sel}">${pSrc ? '<span class="pcsrc" aria-hidden="true">コピー元</span>' : ''}${ps ? '<i class="pck" aria-hidden="true">✓</i>' : ''}${r ? `<span class="rk" aria-hidden="true">${r.name}</span>` : ''}<span class="num${state.rokuyo && d.getDate() === 1 ? ' sd' : ''}">${label}</span>${tn ? `<span class="tkn" aria-hidden="true">✓${tn}</span>` : ''}${NB.marks.has(k) ? '<i class="mline" aria-hidden="true"></i>' : ''}${dots}</button>`;
    const extra = mode === 'simple' ? es.length - cap : hidden[col];
    if (extra > 0 && plusLane >= 0) html += `<button type="button" class="plus pn" data-jump="${k}" style="${colPos(col, col)};top:${lt + plusLane * ls}px" aria-label="${dayLabel(k)}の予定をすべて見る（ほか${extra + dropped[col]}件）">+${extra + dropped[col]}</button>`;
    else if (extra > 0) html += `<button type="button" class="plus" data-jump="${k}" style="right:calc(${6 - col} * 100% / 7)" aria-label="${dayLabel(k)}の予定をすべて見る（ほか${extra}件）">+${extra}</button>`;
  });
  if (mode === 'simple') return html;
  html += pasteGhostHtml(w, cap, lt, ls);
  for (const b of items) {
    const { e } = b, top = `top:${lt + b.lane * ls}px`;
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
  if (kind === 'portrait' && !panelOn()) {
    // 開いた縦（H-13・#21）: 1枚の紙を2つの窓で見る。上の窓 y146〜458、下の窓 y500〜（溝 y459〜492 には何も置かない。行は y458 で切り、残りは y500 から続く。紙は飛ばさない）。
    const top = cssPx('--grid-top', 146), c0 = cssPx('--groove-cut-y0', 458), c1 = cssPx('--groove-cut-y1', 500), G = cssPx('--grid-h', 709);
    const topH = Math.max(0, c0 - top), botH = Math.max(0, top + G - c1), st = `--n:${weeks.length};--ah:${r2(G / weeks.length)}px`;
    return `${weekdaysHtml(' all')}<div class="alwin alt" style="top:${r2(top)}px;height:${r2(topH)}px;${st}"><div class="scroll all" data-scroll="cal" style="${st}">${rows}</div></div><div class="alwin alb" style="top:${r2(c1)}px;height:${r2(botH)}px;${st}"><div class="scroll allb"><div class="allbp" style="margin-top:${-r2(topH)}px">${rows}</div></div></div>`;
  }
  return `${weekdaysHtml(' all')}<div class="scroll all" data-scroll="cal" style="--n:${weeks.length}">${rows}</div>`;
}
// 下の窓（.allb）の行を上の窓の行から写す。2つの窓は同じ scrollTop（紙の位置 s）で一緒に動く。
const allWin = () => { const a = root.querySelector('.alwin .scroll.all'), b = root.querySelector('.alwin .scroll.allb'); return a && b ? { a, b } : null; };
function allMirror() {
  const w = allWin(); if (!w) return;
  const ra = [...w.a.children], rb = [...w.b.firstElementChild.children];
  ra.forEach((r, i) => {
    const c = rb[i]; if (!c) return;
    if (r.dataset.drawn) { if (c.dataset.src !== r.innerHTML.length + ':' + (r.dataset.drawn || '')) { c.innerHTML = r.innerHTML; c.dataset.drawn = '1'; c.dataset.src = r.innerHTML.length + ':1'; c.querySelectorAll('button').forEach((x) => { x.tabIndex = -1; }); } }
    else if (c.dataset.drawn) { c.textContent = ''; delete c.dataset.drawn; delete c.dataset.src; }
  });
}
function allSync(el) {
  const w = allWin(); if (!w) return;
  const max = Math.max(0, w.a.scrollHeight - w.a.clientHeight - w.b.clientHeight), s = Math.min(max, Math.max(0, el.scrollTop)), o = el === w.a ? w.b : w.a;
  if (Math.abs(el.scrollTop - s) > 0.01) el.scrollTop = s;
  if (Math.abs(o.scrollTop - s) > 0.01) o.scrollTop = s;
}
// 見えている週（スクロール位置から計算）と前後1週だけ描く。行の高さは固定なので、描画してもスクロール位置はずれない。
function syncAllWeeks() {
  const sc = root.querySelector('.scroll.all');
  if (!sc) return;
  const aw = allWin(), rows = [...sc.children], top = sc.scrollTop, bot = top + sc.clientHeight + (aw ? aw.b.clientHeight : 0);
  let a = rows.length, z = -1;
  rows.forEach((r, i) => { if (r.offsetTop < bot && r.offsetTop + r.offsetHeight > top) { a = Math.min(a, i); z = Math.max(z, i); } });
  const cur = parseKey(state.selected).getMonth(), sel = state.selected, today = todayKey();
  rows.forEach((r, i) => {
    const want = i >= a - 1 && i <= z + 1;
    if (want && !r.dataset.drawn) { r.innerHTML = weekInner(allWeeks.get(r.dataset.wk), { ...allCtx, cur, sel, today }); r.dataset.drawn = '1'; if (PS.on) applyPasteInert(); }
    else if (!want && r.dataset.drawn) { r.textContent = ''; delete r.dataset.drawn; }
  });
  allMirror();
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
    const vis = sc.clientHeight + (allWin()?.b.clientHeight || 0);
    sc.scrollTop = w && w.offsetTop + w.offsetHeight > vis ? w.offsetTop : 0;
  }
  allYm = ym;
  syncAllWeeks();
  recSize = sizeOf(sc);
  anchorRec = anchorOf(sc);
  let raf = 0;
  sc.addEventListener('scroll', () => {
    allSync(sc);
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
const CLOSED_COL = 48; // 第19版 PR5（design/28 §1）: 7日を1画面に入れる 1列 48。時刻の列 30、1時間 44
function closedTimeBody() {
  const ks = viewNow() === 'week' ? weekKeys() : [state.selected];
  const empty = state.loaded && state.events.length === 0 ? `<div class="tlempty">${sampleBtn()}</div>` : '';
  const wk = ks.length > 1, lw = wk ? 30 : 50;
  const inner = timelineHtml(ks, Math.max(wk ? CLOSED_COL * ks.length : 0, safeW() - 16) - lw, 'closed');
  return `${empty}<div class="tlx${wk ? ' wk' : ''}"><div class="tlw" style="min-width:${lw + (wk ? ks.length * CLOSED_COL : 0)}px">${inner}</div></div>`;
}
// ---------- 開いた縦の日・週（第19版 PR7、design/29 案A「1枚の紙・2つの窓」。計算は js/fold.js） ----------
// 時間軸を1枚の紙として、上の窓と下の窓（折り目の溝で切る）から見る。2つの窓は同じ scrollTop（紙の位置 s）で一緒に動く。
const FD = { s: 0, key: '', g: null, ks: [], carry: false };
const VIEWTOP = { min: null, toFold: false, toClosed: false }; // 閉じた画面⇔開いた縦で、いちばん上の時刻（分）を共通に覚える
const cssPx = (n, d) => { const v = parseFloat(de.style.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
const foldOn = () => layoutKind() === 'open' && isPortrait() && fmode() === 'calendar' && !listShown() && !PS.on && !ttOn() && (state.view === 'day' || state.view === 'week');
function foldGeom(week, rows) {
  const bot = L.h - safe().bottom;
  return foldGeometry({ head: cssPx('--head-h', 82), week, rows, cut0: cssPx('--groove-cut-y0', 458), cut1: cssPx('--groove-cut-y1', 500), tabsTop: cssPx('--tabs-y', bot - 88), winBot: bot - 34 });
}
const foldAll = (k) => eventsOnDay(occIn(k, k), k).filter((e) => e.all);
function foldBlock(b, k, i, week) {
  const { e, s, en, col, n } = b, t = e.title, gap = week ? 3 : 8;
  const lab = `${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${t}${e.recurring ? ' 繰り返し' : ''}${isX(e) ? '' : `、${tagText(e)}`}${e.nativeLink?.state === 'linked' ? '、iPhoneにも追加済み' : ''}${alLabel(e)}`;
  return `<button type="button" class="tlev fev ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" data-s="${s}" data-en="${en}" data-fk="${k}:${i}" style="${catVar(e)}--m:${s};--d:${en - s};left:calc(var(--ins) + ${col} * (100% - 2 * var(--ins)) / ${n});width:calc((100% - 2 * var(--ins)) / ${n} - ${gap}px)" aria-label="${esc(lab)}"><span class="ftl">${xi(e)}${esc(t)}</span>${week ? '' : `<span class="ftm">${hhmm(s)}〜${hhmm(en)}${bell(e)}</span>`}</button>`;
}
function foldPaper(g, ks, week) {
  let lines = '';
  for (let h = 0; h <= 24; h++) {
    lines += `<i class="fhl" style="--m:${h * 60}"></i>`;
    if (h < 24) lines += `<i class="fhl half" style="--m:${h * 60 + 30}"></i>`;
  }
  const cols = ks.map((k) => `<div class="tlcol${k === todayKey() ? ' ftd' : ''}" data-day="${k}">${dayBlocks(k).map((b, i) => foldBlock(b, k, i, week)).join('')}</div>`).join('');
  const ti = ks.indexOf(todayKey());
  const now = ti < 0 ? '' : `<div class="fnow" hidden style="--m:${nowMin()};--i:${ti};--n:${ks.length}"><i class="fn1"></i><i class="fn2"></i></div>`;
  return `${lines}<div class="tlcols flcols">${cols}</div>${now}`;
}
function foldHtml() {
  const week = state.view === 'week', ks = week ? weekKeys() : [state.selected], today = todayKey();
  const ads = ks.map(foldAll);
  const rows = Math.min(3, Math.max(1, ...ads.map((l) => l.length)));
  const g = foldGeom(week, rows); FD.g = g; FD.ks = ks;
  const lw = week ? 36 : 48;
  const chips = ads.map((list, i) => {
    const k = ks[i], over = list.length > 3, shown = over ? list.slice(0, 2) : list;
    const pills = shown.map((e) => `<button type="button" class="adpill ${catCls(e)}" data-event="${esc(e.id)}" style="${catVar(e)}" aria-label="${esc(`${xname(e)}${dayLabel(k)} 終日 ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}">${esc(e.title)}</button>`).join('');
    const plus = over ? `<button type="button" class="adplus" data-jump="${k}" aria-label="${dayLabel(k)}の終日の予定をすべて見る（ほか${list.length - 2}件）">+${list.length - 2}</button>` : '';
    return `<div class="adcol${k === today ? ' ftd' : ''}" data-day="${k}">${pills}${plus}</div>`;
  }).join('');
  const dates = week ? `<div class="fdates fani" style="top:${g.allTop - g.dates}px;height:${g.dates}px"><span class="fdl" style="width:${lw}px"></span>${ks.map((k) => { const d = parseKey(k); return `<button type="button" class="fdt${k === today ? ' today' : ''}${isRed(k) ? ' hol' : ''}${k === state.selected ? ' sel' : ''}" data-jump="${k}" aria-label="${dayLabel(k)}${holSpoken(k)}を日表示で開く"><span class="fdw">${DOW[d.getDay()]}</span><b class="fdd">${d.getDate()}</b>${rkSpan(k, 'wrk')}</button>`; }).join('')}</div>` : '';
  const labs = Array.from({ length: 25 }, (_, h) => `<span class="fh" data-m="${h * 60}">${week ? h : `${h}:00`}</span>`).join('');
  const win = (cls, top, h, ih, off) => `<div class="fwin ${cls} fani" style="top:${r2(top)}px;height:${r2(h)}px"><div class="fl ${cls}" data-fl="${cls}"><div class="flin" style="height:${r2(ih)}px"><div class="flpaper" style="top:${r2(-off)}px;height:${r2(g.paperH)}px">${foldPaper(g, ks, week)}</div></div></div><div class="fllab" aria-hidden="true">${labs}<span class="fnt" hidden></span></div></div>`;
  const style = `--lw:${lw}px;--hh:${FOLD_HH}px;--ins:${week ? 1.5 : 4}px;--ftop:${r2(g.winTop)}px;--fcut0:${r2(g.cut0)}px;--fcut1:${r2(g.cut1)}px`;
  return `<section class="calendar fold fold-${week ? 'week' : 'day'}" aria-label="カレンダー" style="${style}">${foldHead()}${dates}<div class="allday fall fani" style="top:${g.allTop}px;height:${g.allH}px"><span class="adl" style="width:${lw}px">終日</span><div class="adcols">${chips}</div></div><div class="fgv" aria-hidden="true"></div>${win('ft', g.winTop, g.topH, g.topH + g.smax, 0)}${win('fb', g.cut1, g.botH, g.paperH - g.topH, g.topH)}</section>`;
}
const foldHead = () => `<div class="chead fhead">${navBtn(-1)}<h2 id="ctitle">${periodTitle()}${state.view === 'day' ? rkSpan(state.selected, 'hrk') : ''}</h2>${navBtn(1)}<button type="button" class="ftoday" data-act="today" aria-label="今日の日付へ">今日</button></div>`;
const foldDefaultMin = () => {
  const ks = FD.ks, today = todayKey(), isNow = ks.includes(today);
  let first = null;
  for (const k of ks) for (const b of dayBlocks(k)) if (first == null || b.s < first) first = b.s;
  return openingMinute({ today: isNow, nowMin: nowMin(), firstStart: first });
};
// 描画のあと: 紙の位置を戻して配置し直す。日・週が変わったとき（key）だけ開いたときの位置にする。姿勢が変わったときは見ていた時刻を引き継ぐ。
function initFold() {
  const ft = root.querySelector('.fl.ft'), fb = root.querySelector('.fl.fb');
  if (!ft || !fb || !FD.g) { FD.key = ''; FD.carry = false; return; }
  const key = `${state.view}|${state.view === 'week' ? weekStart(state.selected) : state.selected}`;
  if (FD.carry && VIEWTOP.min != null) { FD.s = clampS(FD.g, (VIEWTOP.min * FOLD_HH) / 60); FD.key = key; }
  else if (key !== FD.key) { FD.key = key; FD.s = clampS(FD.g, (foldDefaultMin() * FOLD_HH) / 60); }
  FD.carry = false;
  FD.s = clampS(FD.g, FD.s);
  ft.scrollTop = FD.s; fb.scrollTop = FD.s;
  foldLayout();
}
// 2つの窓の位置から、ラベル・今の時刻の線・またぐ予定・長押しの札を配置する（スクロールのたびに呼ぶ。軽い計算だけ）。
function foldLayout() {
  const fold = root.querySelector('.fold'), g = FD.g; if (!fold || !g) return;
  const ft = fold.querySelector('.fl.ft'), fb = fold.querySelector('.fl.fb'); if (!ft || !fb) return;
  const s = FD.s = clampS(g, ft.scrollTop), wm = windowMinutes(g, s), week = state.view === 'week';
  const wins = [{ el: fold.querySelector('.fwin.ft'), t: wm.top, h: g.topH, bottom: false }, { el: fold.querySelector('.fwin.fb'), t: wm.bot, h: g.botH, bottom: true }];
  const nowOn = FD.ks.includes(todayKey()), now = nowMin();
  const nowIn = (w) => nowOn && (w.bottom ? now >= wm.tc && now <= w.t[1] : now >= w.t[0] && now < wm.tc);
  for (const w of wins) {
    for (const h of w.el.querySelectorAll('.fh')) {
      const m = Number(h.dataset.m), y = labelY(m, w.t[0], w.t[1], w.h, w.bottom);
      const hide = y == null || (nowOn && Math.abs(m - now) <= 18 && nowIn(w));
      h.style.visibility = hide ? 'hidden' : '';
      if (!hide) h.style.top = `${r2(y)}px`;
    }
    const nt = w.el.querySelector('.fnt'), ny = nowIn(w) ? labelY(now, w.t[0], w.t[1], w.h, w.bottom) : null;
    nt.hidden = ny == null;
    if (ny != null) { nt.style.top = `${r2(ny)}px`; nt.textContent = hhmm(now); }
    const nl = w.el.querySelector('.fnow'); if (nl) nl.hidden = !nowIn(w);
  }
  // 予定: 上下の窓に同じ予定がある。またぐ予定は窓ごとに見える部分を測って題名・時刻・切り口を決める。
  const pxs = (m) => (m * FOLD_HH) / 60, topP = s, botP = s + g.topH; // 各窓の上の端の紙 px
  const byKey = new Map();
  fold.querySelectorAll('.fev').forEach((el) => { const k = el.dataset.fk; (byKey.get(k) || byKey.set(k, []).get(k)).push(el); });
  for (const [, [a, b]] of byKey) {
    if (!a || !b) continue;
    const s0 = Number(a.dataset.s), en = Number(a.dataset.en), p0 = pxs(s0), p1 = pxs(en);
    const vis = (lo, hi) => Math.max(0, Math.min(p1, hi) - Math.max(p0, lo)); // 窓の紙 px の範囲 [lo, hi) で見える高さ
    const hA = vis(topP, topP + g.topH), hB = vis(botP, botP + g.botH);
    const both = hA > 0 && hB > 0 && s0 < wm.tc && en > wm.tc;
    const day = !week;
    const r = both ? partTitles(hA, hB, day) : { a: { title: true, time: day && hA >= 34, small: false }, b: { title: true, time: day && hB >= 34, small: false } };
    const set1 = (el, h, part, lo, cut, upper) => {
      el.style.visibility = h > 0 ? '' : 'hidden';
      el.dataset.ti = part.title ? '1' : '0'; el.dataset.tm = part.time ? '1' : '0'; el.dataset.small = part.small ? '1' : '0';
      el.style.setProperty('--ty', `${r2(Math.max(0, lo - p0))}px`);
      if (cut) { el.dataset.cut = upper ? 'b' : 't'; el.style.setProperty('--cl', `${r2(upper ? lo + g.topH - p0 - 2.5 : lo - p0 + 1.5)}px`); } else { delete el.dataset.cut; }
      if (upper) el.removeAttribute('aria-hidden'); else if (both || h <= 0) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden'); // VoiceOver は1つの予定として読む
      el.tabIndex = el.getAttribute('aria-hidden') ? -1 : 0;
    };
    set1(a, hA, r.a, topP, both, true); set1(b, hB, r.b, botP, both, false);
    if (hA <= 0) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; }
  }
  // 長押しで作る枠の札（緑 44×18）。始まりと終わりは、その時刻がある窓の時刻の列に出す。
  for (const t of fold.querySelectorAll('.dtag[data-fm]')) {
    const w = wins[Number(t.dataset.fw)], m = Number(t.dataset.fm), isEnd = t.classList.contains('dtag-e');
    let y = labelY(m, w.t[0], w.t[1], w.h, w.bottom);
    if (y != null && isEnd && DF.start != null) { const ys = labelY(DF.start, w.t[0], w.t[1], w.h, w.bottom); if (ys != null) y = Math.max(y, ys + 18); }
    t.style.display = y == null ? 'none' : '';
    if (y != null) t.style.top = `${r2(y - 9)}px`;
  }
}
// 窓の位置（紙の s）を動かす。2つの窓が同じ値で動く。
function foldScrollTo(s) {
  const g = FD.g; if (!g) return 0;
  const v = clampS(g, s);
  for (const el of root.querySelectorAll('.fl')) if (Math.abs(el.scrollTop - v) > 0.01) el.scrollTop = v;
  FD.s = v; foldLayout(); return v;
}
root.addEventListener('scroll', (ev) => {
  const el = ev.target;
  if (el?.classList?.contains('fl')) { const o = root.querySelector(`.fl.${el.dataset.fl === 'ft' ? 'fb' : 'ft'}`); if (o && Math.abs(o.scrollTop - el.scrollTop) > 0.01) o.scrollTop = el.scrollTop; FD.s = el.scrollTop; foldLayout(); VIEWTOP.min = (FD.s * 60) / FOLD_HH; return; }
  if (el?.matches?.('.closed .tlx .tl')) VIEWTOP.min = Math.max(0, ((el.scrollTop - TL_PAD) * 60) / TLP.closed.hh);
}, true);
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
const calendar = (kind) => (pullOn() && (kind === 'browse' || kind === 'portrait') ? pullHtml(kind) : `<section class="calendar" aria-label="カレンダー">${chead()}${calendarBody(kind)}</section>`);

// ---------- 月を引く画面（第19版 PR6、design/22。閉じた画面と開いた縦の「月」タブ） ----------
// つまみで 1週・2週・月 に縮み、下に選んだ日（予定｜時間軸・タスク・ノート）がつながる。「全部」（monthExpand）のときは従来の月のまま。
const MFORMS = ['one', 'two', 'month'];
const MFORM_NAME = { one: '1週', two: '2週', month: '月' };
const pullKind = () => { const k = layoutKind(); return k === 'browse' ? 'browse' : k === 'open' && isPortrait() ? 'portrait' : null; };
function pullOn() {
  const k = pullKind();
  if (!k || state.view !== 'month' || state.monthExpand || listShown() || state.strip || fmode() !== 'calendar') return false;
  return !(k === 'portrait' && ttOn());
}
// 型ごとの行の高さと予定の段（閉じた画面 466×678 は 22 §1、開いた縦 669×951 は §5）。lt=最初の段の上端、ls=段の間隔、chip=帯の高さ。
const PULL_CFG = {
  browse: { one: { rows: 1, h: 80, lt: 18, ls: 15, chip: 14, cap: 4, fs: 9 }, two: { rows: 2, h: 80, lt: 18, ls: 15, chip: 14, cap: 4, fs: 9 }, month: { rows: 6, h: 64, lt: 18, ls: 18, chip: 16, cap: 2, fs: 10 } },
  portrait: { one: { rows: 1, h: 297, lt: 20, ls: 20, chip: 18, cap: 13, fs: 10 }, two: { rows: 2, h: 148.5, lt: 20, ls: 20, chip: 18, cap: 6, fs: 10 }, month: { rows: 6, h: 49.5, lt: 18, ls: 15, chip: 14, cap: 2, fs: 9 } },
};
// 「月の文字: 大」は 1件減らして文字を 11pt に。時刻の出し入れは姿勢ごとの設定（閉じた=monthTimeClosed／開いた=monthTimeOpen）。
function pullCfg(kind, form) {
  const c = PULL_CFG[kind][form];
  return state.monthTextSize === 'large' ? { ...c, cap: Math.max(1, c.cap - 1), fs: 11 } : c;
}
const MP = { anchor: '', shrunk: false, drag: null, scroll: 0, cs: 0, swallow: 0 }; // anchor: 1週・2週で見せる先頭の週。shrunk: 日の部分のスクロールで一時的に 1週へ縮んでいる
const monthFormNow = () => state.monthForm; // 閉じた画面でも月は自動で縮まない（design/33 §2）
function pullWeeks(form) {
  const n = { one: 1, two: 2, month: 6 }[form];
  let start;
  if (form === 'month') start = monthWeeks(state.selected)[0][0];
  else {
    const sw = weekStart(state.selected);
    if (!MP.anchor || state.selected < MP.anchor || state.selected >= addDays(MP.anchor, n * 7)) MP.anchor = sw;
    start = MP.anchor;
  }
  return Array.from({ length: n }, (_, i) => Array.from({ length: 7 }, (_, j) => addDays(start, i * 7 + j)));
}
function pullGridHtml(kind, form) {
  const c = pullCfg(kind, form), sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth(), tk = monthTaskCounts(kind);
  return pullWeeks(form).map((days) => `<div class="week named" data-wk="${days[0]}">${weekInner(weekData(days, c.cap), { mode: 'named', cur: form === 'month' ? cur : null, sel, today, cap: c.cap, time: kind === 'browse' ? state.monthTimeClosed : state.monthTimeOpen, tk, lt: c.lt, ls: c.ls })}</div>`).join('');
}
function pullHead() {
  if (PS.on) return `<div class="mph pasting">${pasteBand()}</div>`;
  const u = state.monthForm === 'month' ? '月' : '週';
  const d = parseKey(state.selected);
  return `<div class="mph"><button type="button" data-act="prev" aria-label="前の${u}">‹</button><h2 id="ctitle">${d.getFullYear()}年 ${d.getMonth() + 1}月</h2><button type="button" data-act="next" aria-label="次の${u}">›</button>${allBtn()}<span class="mpdate" aria-hidden="true">${d.getDate()}日（${DOW[d.getDay()]}）</span><button type="button" class="mptoday" data-act="mptoday" aria-label="今日へ">今日</button></div>`;
}
function pullDayList(k) {
  const list = eventsOnDay(occIn(k, k), k);
  if (!list.length) return `<div class="mdnone"><p>予定はありません</p><button type="button" class="ghost" data-new="${k}">＋ この日に追加</button></div>`;
  return `<div class="mdlist" role="list">${list.map((e) => {
    const t = e.all || dayOf(e.start) !== k ? '終日' : e.start.slice(11);
    return `<button type="button" class="mdev ${catCls(e)}"${catSty(e)} role="listitem" data-event="${esc(e.id)}" data-sday="${k}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><i class="mdbar" aria-hidden="true"></i><span class="mdt">${t}${bell(e)}</span><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
  }).join('')}</div>`;
}
function pullDayTasks(k) {
  const all = homeTaskList();
  if (!all) return '';
  const pend = doneCtl.pending();
  const rows = all.filter((r) => r?.due?.date === k).map((r) => {
    const done = pend.has(r.itemId) ? pend.get(r.itemId) === true : !!r.done;
    return `<div class="htask mdtask${done ? ' done' : ''}"><button type="button" class="rmckb" data-act="remck" data-id="${esc(r.itemId)}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}：${esc(r.title || '')}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button><span class="htt">${esc(r.title || '')}</span>${r.due.time ? `<small class="hdue">${esc(r.due.time)}</small>` : ''}</div>`;
  });
  return `<section class="mdsec mdtasks" aria-label="タスク"><h4>タスク</h4>${rows.join('') || '<p class="mdempty">この日が期限のタスクはありません</p>'}</section>`;
}
function pullDayNote(k) {
  const first = NB.first.get(k), n = NB.marks.get(k) || 0;
  return `<section class="mdsec mdnotes" aria-label="ノート"><h4>ノート</h4><button type="button" class="dnote mdnote" data-act="daynote" data-day="${k}" aria-label="${esc(dayLabel(k))}のノート${n ? `${n}件を開く` : 'を書く'}"><span class="dnt">${first ? richHtml(richLines(first), 'div') : '<span class="mdempty">この日のノートを書く</span>'}</span></button></section>`;
}
function pullDayHtml() {
  const k = state.selected, m = state.monthDay;
  const sw = `<div class="mdsw" role="group" aria-label="日の見せ方">${[['list', '予定'], ['time', '時間軸']].map(([v, l]) => `<button type="button" data-mday="${v}" aria-pressed="${m === v}">${l}</button>`).join('')}</div>`;
  const body = m === 'time' ? timelineHtml([k], Math.max(0, safeW() - 24 - 50), 'mday', 44) : pullDayList(k);
  return `<div class="mday" data-scroll="mday"><div class="mdh"><h3>${dayTitle(k)}</h3>${sw}</div><div class="mdbody">${body}</div>${pullDayTasks(k)}${pullDayNote(k)}</div>`;
}
function pullHtml(kind) {
  const form = monthFormNow(), c = pullCfg(kind, form), cl = kind === 'browse';
  const top = `${pullHead()}${weekdaysHtml()}`;
  return `<section class="calendar mpull ${kind}" aria-label="カレンダー" data-form="${form}"${cl ? ' data-scroll="mpull"' : ''} style="--mp-row:${c.h}px;--chip-h:${c.chip}px;--chip-fs:${c.fs}px;--date-h:18px">${cl ? `<div class="mpfix">${top}</div>` : top}<div class="mgrid" data-nrows="${c.rows}">${pullGridHtml(kind, form)}</div><div class="mgrab" role="slider" tabindex="0" aria-label="月の大きさ: ${MFORM_NAME[form]}。上下に引いて変える" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${MFORMS.indexOf(form)}" aria-valuetext="${MFORM_NAME[form]}"><i aria-hidden="true"></i></div>${pullDayHtml()}${cl ? '<div class="mpend" aria-hidden="true"></div>' : ''}</section>`;
}
// 月の部分だけ描き直す（型・縮み）。日の部分とそのスクロール位置には触らない。
function paintPull(form = monthFormNow()) {
  const sec = root.querySelector('.mpull'); if (!sec) return;
  const kind = pullKind(), c = pullCfg(kind, form);
  sec.dataset.form = form;
  sec.style.setProperty('--mp-row', `${c.h}px`); sec.style.setProperty('--chip-h', `${c.chip}px`); sec.style.setProperty('--chip-fs', `${c.fs}px`);
  const g = sec.querySelector('.mgrid'); g.dataset.nrows = String(c.rows); g.innerHTML = pullGridHtml(kind, form);
  const h = sec.querySelector('.mgrab'); h.setAttribute('aria-valuenow', String(MFORMS.indexOf(form))); h.setAttribute('aria-valuetext', MFORM_NAME[form]); h.setAttribute('aria-label', `月の大きさ: ${MFORM_NAME[form]}。上下に引いて変える`);
  paintRange(); applyPasteInert();
}
function setMonthForm(f, speak = true) {
  if (!MFORMS.includes(f)) return;
  MP.shrunk = false; MP.anchor = '';
  if (f === state.monthForm) { paintPull(); return; }
  state.monthForm = f; saveUi();
  paintPull(f);
  if (speak) say(`月を${MFORM_NAME[f]}の表示にしました。`);
}
const mpHeights = (kind) => MFORMS.map((f) => PULL_CFG[kind][f].rows * PULL_CFG[kind][f].h);
// つまみ: 上下に引く。閉じた画面は引いた量だけ月の高さが変わり、離すと一番近い型へ 0.25 秒で寄る。開いた縦は月の高さが全部 297 なので、引いた量で型だけ切り替える。
root.addEventListener('pointerdown', (ev) => {
  const g = ev.target.closest?.('.mgrab'); if (!g || !ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  const kind = pullKind(), grid = root.querySelector('.mgrid'); if (!grid) return;
  MP.drag = { id: ev.pointerId, y0: ev.clientY, kind, form0: state.monthForm, h0: grid.getBoundingClientRect().height, moved: false, form: state.monthForm };
});
window.addEventListener('pointermove', (ev) => {
  const d = MP.drag; if (!d || ev.pointerId !== d.id) return;
  const dy = ev.clientY - d.y0;
  if (!d.moved && Math.abs(dy) < 6) return;
  d.moved = true;
  const sec = root.querySelector('.mpull'), grid = root.querySelector('.mgrid'); if (!sec || !grid) return;
  if (d.kind === 'browse') {
    const hs = mpHeights('browse'), h = Math.min(hs[2], Math.max(hs[0], d.h0 + dy));
    const f = MFORMS[hs.reduce((bi, v, i) => (Math.abs(v - h) < Math.abs(hs[bi] - h) ? i : bi), 0)];
    sec.classList.add('dragging'); grid.style.height = `${h}px`;
    if (f !== d.form) { d.form = f; MP.shrunk = false; paintPull(f); }
  } else {
    const i = Math.min(2, Math.max(0, MFORMS.indexOf(d.form0) + Math.round(dy / 60)));
    if (MFORMS[i] !== d.form) { d.form = MFORMS[i]; paintPull(d.form); }
  }
});
window.addEventListener('pointerup', (ev) => {
  const d = MP.drag; if (!d || ev.pointerId !== d.id) return;
  MP.drag = null;
  if (!d.moved) return; // たたきは何もしない
  MP.swallow = performance.now() + 400;
  const sec = root.querySelector('.mpull'), grid = root.querySelector('.mgrid');
  if (grid && sec) {
    const c = PULL_CFG[d.kind][d.form], to = `${c.rows * c.h}px`;
    sec.classList.remove('dragging');
    if (d.kind === 'browse' && !reduced() && grid.style.height && grid.style.height !== to) { void grid.offsetHeight; grid.style.height = to; setTimeout(() => { grid.style.height = ''; }, 260); } else grid.style.height = '';
  }
  setMonthForm(d.form);
});
window.addEventListener('pointercancel', (ev) => { if (MP.drag && ev.pointerId === MP.drag.id) { MP.drag = null; root.querySelector('.mpull')?.classList.remove('dragging'); const g = root.querySelector('.mgrid'); if (g) g.style.height = ''; paintPull(); } });
root.addEventListener('keydown', (ev) => {
  const g = ev.target.closest?.('.mgrab'); if (!g || !['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
  ev.preventDefault();
  const i = MFORMS.indexOf(state.monthForm) + (ev.key === 'ArrowDown' ? 1 : -1);
  if (i >= 0 && i <= 2) { setMonthForm(MFORMS[i]); root.querySelector('.mgrab')?.focus({ preventScroll: true }); }
});
// 閉じた画面は画面全体を1本でスクロールする（design/33 §2）。月は縮めない。月が見出しの下へ流れ切ったら、見出しの右に今見ている日を出す（0.15秒）。
// 開いた縦は日の部分だけがスクロールする（月は上の面に置いたまま）。
function paintMpScroll(sec) {
  const mph = sec?.querySelector('.mph'), fix = sec?.querySelector('.mpfix'), g = sec?.querySelector('.mgrid'); if (!mph || !fix || !g) return;
  mph.classList.toggle('scrd', g.getBoundingClientRect().bottom <= fix.getBoundingClientRect().bottom + 0.5);
}
root.addEventListener('scroll', (ev) => {
  const el = ev.target;
  if (!(el instanceof Element)) return;
  if (el.classList.contains('allb')) { allSync(el); return; }
  if (el.classList.contains('mday')) { MP.scroll = el.scrollTop; const c0 = PULL_CFG.browse[state.monthForm]; if (el.scrollTop > 0) MP.cs = c0.rows * c0.h + 24 + el.scrollTop; }
  else if (el.classList.contains('mpull') && pullKind() === 'browse') { const c0 = PULL_CFG.browse[state.monthForm]; MP.cs = el.scrollTop; MP.scroll = Math.max(0, el.scrollTop - (c0.rows * c0.h + 24)); paintMpScroll(el); }
}, true);

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
  if (mode === 'cols') return `<div class="hcols"><div class="hcol">${nextHtml}</div><div class="hcol">${homeTasksCard()}</div></div>`;
  if (mode === 'pv') return pvHome({ list, next, future, now, k, count });
  const eve = eveningFirst(now);
  return `${hero}<div class="hcards">${eve ? tmCard : ''}${evCard}${homeTasksCard()}${eve ? '' : tmCard}</div>`;
}
// 閉じた一覧の「次の予定」の時刻行に、次に鳴る通知の時刻を添える。
function nextBell(e) {
  if (!hasBell(e)) return '';
  const t = nextNotifyText(e, new Date());
  return t ? ` <small class="nb">${BELL}${esc(t)} に通知</small>` : '';
}
// ---------- 開いた縦のホーム（第19.1版 S2・design/32 案A）----------
// 上の面 y82〜459＝日付の行・次の予定・今日の予定、下の面 y500〜＝今週の帯・タスク・ノート。スクロールなし（あふれは「ほか n件」「+N」）。
// 文字を大きくしたときだけ、上の面・下の面をそれぞれ窓にして、窓の中だけスクロールする（枠は帯 y459〜492 にかからない）。
const pvBig = () => parseFloat(getComputedStyle(document.documentElement).fontSize) > 17;
const pvUntil = (e, now) => {
  if (e.all || dayOf(e.start) !== now.slice(0, 10)) return tagText(e);
  const hmi = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)), m = hmi(e.start) - hmi(now);
  if (m <= 0) return '進行中';
  return m < 60 ? `あと ${m}分` : `あと ${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}`;
};
function pvNextHtml(next, future, now, k, count) {
  if (!next) return `<div class="next none pvnext"><small>次の予定</small><strong>${extActive() ? '読み込み済みの期間に次の予定はありません。' : state.events.length ? 'この後の予定はありません' : '予定はまだありません'}</strong>${sampleBtn()}</div>`;
  const nd = dayOf(next.start) !== k ? `<small class="nd">${dayLabel(dayOf(next.start))}</small> ` : '';
  return `<button type="button" class="next pvnext ${catCls(next)}"${catSty(next)} data-event="${esc(next.id)}"${repLabel(next, `次の予定 ${next.title}`)}><small>次の予定 · ${esc(pvUntil(next, now))}</small><strong>${xi(next)}${rep(next)}${esc(next.title)}</strong><span class="when"><span class="time">${nd}${next.all ? '終日' : next.start.slice(11)}</span>${next.all || dayOf(next.start) !== dayOf(next.end) ? '' : ` — ${next.end.slice(11)}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}${nextBell(next)}</span></button>`;
}
function pvWeekHtml(k) {
  const ws = weekStart(k), days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const a = parseKey(days[0]), z = parseKey(days[6]);
  const title = `今週 ${a.getMonth() + 1}/${a.getDate()}〜${z.getMonth() === a.getMonth() ? '' : `${z.getMonth() + 1}/`}${z.getDate()}`;
  const w = weekData(days, 3);
  const inner = weekInner(w, { mode: 'named', cur: null, sel: null, today: k, cap: 3, time: false, lt: 18, ls: 16 });
  return `<section class="pv-week" aria-label="今週"><div class="pvh"><h3>${title}</h3><button type="button" class="hgo" data-pv="month" aria-label="月を開く">月 ›</button></div><div class="pvwk" style="--chip-h:14px;--chip-fs:9px;--date-h:18px"><div class="week named">${inner}</div></div></section>`;
}
function pvNoteHtml(k) {
  const body = NB.first.get(k) || '', lines = richLines(body, 6, true);
  const n = NB.marks.get(k) || 0;
  return `<section class="pv-notes" aria-label="今日のノート"><div class="pvh"><h3>ノート</h3><button type="button" class="hgo" data-pv="note" aria-label="ノートを開く">すべて ›</button></div><button type="button" class="pvnote" data-act="daynote" data-day="${k}" aria-label="${esc(dayLabel(k))}のノート${n ? `${n}件を開く` : 'を書く'}">${lines.length ? richHtml(lines) : '<span class="pvph">今日のノートを書く</span>'}</button></section>`;
}
function pvTasksHtml() {
  const all = homeTaskList(), today = todayKey();
  const head = (n) => `<div class="pvh"><h3>タスク${n == null ? '' : ` ${n}件`}</h3><button type="button" class="hgo" data-pv="task" aria-label="タスクを開く">すべて ›</button></div>`;
  if (!all) return `<section class="pv-tasks htasks" aria-label="タスク">${head(null)}<p class="small hempty">タスクはタスクのページで見られます。</p></section>`;
  const T = homeTasks(all, today, doneCtl.pending());
  const rows = T.items.map((r) => {
    const done = doneCtl.pending().get(r.itemId) === true, du = dueText(r.due, today), od = r.due.date < today;
    return `<div class="htask${done ? ' done' : ''}"><button type="button" class="rmckb" data-act="remck" data-id="${esc(r.itemId)}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}：${esc(r.title || '')}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button><span class="htt">${esc(r.title || '')}</span>${du ? `<small class="hdue${od ? ' od' : ''}">${esc(du)}</small>` : ''}</div>`;
  }).join('');
  return `<section class="pv-tasks htasks" aria-label="タスク">${head(T.total)}${rows || '<p class="small hempty">今日のタスクはありません</p>'}<button type="button" class="hadd" data-pv="taskadd">＋ タスクを追加</button></section>`;
}
function pvHome({ list, next, future, now, k, count }) {
  const more = Math.max(0, count - 5);
  const evCard = `<section class="pv-today" aria-label="今日の予定"><div class="pvh"><h3>今日の予定 ${count}件</h3>${more ? `<button type="button" class="hgo hmore2" data-pv="day" aria-label="今日の予定をあと${more}件見る">ほか ${more}件 ›</button>` : ''}<button type="button" class="hgo" data-pv="day" aria-label="タイムラインを開く">タイムライン ›</button></div>${list.slice(0, 5).map(homeEventRow).join('') || '<p class="small hempty">この後の予定はありません</p>'}</section>`;
  const top = `<div class="pv-date"><h2>${dayTitle(k)}</h2></div>${pvNextHtml(next, future, now, k, count)}${evCard}`;
  const bot = `${pvWeekHtml(k)}${pvTasksHtml()}${pvNoteHtml(k)}`;
  return `<div class="phome${pvBig() ? ' big' : ''}"><div class="pvw pvt">${top}</div><div class="pvw pvb">${bot}</div></div>`;
}
const listView = (mode = 'cards') => `<div class="home listview hm-${mode}" aria-label="ホーム">${listHtml(mode)}</div>`;
// 閉じた画面（一覧 = home / 日・週・月 = browse）: 本文は safe の内側いっぱい。操作は帯（右 safe）または見出し・下段。
function closed(kind) {
  const body = state.strip ? stripPage(state.strip) : kind === 'home' ? listView() : calendar('browse');
  const tv = kind === 'browse' && !state.strip && viewNow() !== 'month' ? ` tv tv-${viewNow()}` : ''; // 閉じた日・週の時間軸（design/28 §1）
  return `<div class="shell closed ${kind}${tv}${kind === 'browse' && pullOn() ? ' pull' : ''}${POS.band ? ' band' : ' fb'}${state.strip ? ' strp' : ''}"><div class="mpane">${body}</div><div class="tabfade" aria-hidden="true"></div>${ctl()}${tabs()}</div>`;
}
// 閉じた画面で右の帯のタスク／メモを開いたときの全面ページ。下のタブはどれも選ばれず、帯の同じ丸かタブで戻る。
function stripPage(id) {
  const t = id === 'memo' ? 'ノート' : 'タスク';
  return `<section class="page stripp" data-page="${id}" aria-label="${PAGE_NAMES[id]}"><div class="sph"><h2>${t}</h2></div>${id === 'memo' ? noteBody('closed') : taskBody('closed')}</section>`;
}
// 開いた縦のタスク／ノート専用面。カレンダーの部品（月・下の段・タブ）は出さない。既存のタスク・ノート部品を全面に置く。
function focusPage(m) {
  const id = m === 'note' ? 'memo' : 'task';
  return `<section class="page stripp fpage" data-page="${id}" aria-label="${FOCUS_LABELS[m]}">${id === 'memo' ? noteBody('closed') : focusTaskBody()}</section>`;
}
// 開いた縦: 全幅の月（下に予定一覧は置かない）。見出し（設定・前・題名・次・全・検索）は上 safe の帯の中、下に 今日・タブ・＋。
function open() {
  if (fmode() !== 'calendar') return `<div class="shell open portrait focus" data-focus="${fmode()}"><div class="pcol fcol">${focusPage(fmode())}</div>${ctl()}</div>`;
  if (ttOn()) return `<div class="shell open portrait tt"><div class="pcol ttp">${dayPage('left', state.selected, true)}${dayPage('right', addDays(state.selected, 1), true)}</div><div class="hline" aria-hidden="true"></div>${ctl()}${tabs()}</div>`;
  return `<div class="shell open portrait${pullOn() ? ' pull' : ''}${foldOn() ? ' fd' : ''}"><div class="pcol">${listShown() ? `<div class="home listview hm-pv" aria-label="ホーム">${listHtml('pv')}</div>` : foldOn() ? foldHtml() : calendar('portrait')}</div><div class="hline" aria-hidden="true"></div>${panelOn() ? bottomPanel() : panelAvail() ? '<div class="pgrab" data-grab="1" aria-hidden="true"></div>' : ''}${ctl()}${tabs()}</div>`;
}
// ---------- 開いた縦の下パネル（上は月、下は 時間｜タスク｜メモ） ----------
const PN = { expand: false, swallow: 0 }; // expand: メモ入力中にマスの上端まで広げる（口だけ。入力は後続の版）
const BOTTOM_LABELS = { home: 'ホーム', time: '時間', task: 'タスク', memo: 'ノート' };
function bottomBody(id) {
  if (id === 'time') return timelineHtml(tlKeys(1), Math.max(0, safeW() - 40 * POS.ux - 50), 'bottom');
  if (id === 'home') return listView('cols');
  if (id === 'memo') return noteBody('bottom');
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
root.addEventListener('focusin', (ev) => { if (ev.target.closest?.('.pnl') && ev.target.matches('textarea, .ned-body, [contenteditable=true]')) setPanelExpand(true); });
root.addEventListener('focusout', (ev) => { if (!rendering && ev.target.closest?.('.pnl') && ev.target.matches('textarea, .ned-body, [contenteditable=true]')) setPanelExpand(false); });
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
const TLP = { left: mkTl(), right: mkTl(), bottom: mkTl(), closed: { hh: 44, key: '' }, mday: { hh: 44, key: '' } };
const TLQ = { quiet: 0 };
const paneOf = (el) => (['left', 'bottom', 'closed', 'mday'].includes(el?.dataset?.pane) ? el.dataset.pane : 'right');
const firstTl = () => root.querySelector('.tl');
const HH_MIN = 31, HH_MAX = 80, TL_PAD = 12;
const clampHh = (n) => Math.min(HH_MAX, Math.max(HH_MIN, n));
const minOf = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const tlKeys = (days) => Array.from({ length: days }, (_, i) => addDays(state.selected, i));
const PAGE_NAMES = { task: 'タスク', memo: 'ノート' };
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
function tlBlock({ e, s, en, col, n }, k, cw = false) {
  const t = e.title, sub = hhmm(s);
  return `<button type="button" class="tlev ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}--m:${s};--d:${en - s};left:calc(${col} * 100% / ${n} + 1px);width:calc(100% / ${n} - 2px)" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${t}${e.recurring ? ' 繰り返し' : ''}${isX(e) ? '' : `、${tagText(e)}`}${e.nativeLink?.state === 'linked' ? '、iPhoneにも追加済み' : ''}${alLabel(e)}`)}">${cw ? `<span class="tn">${esc(t)}</span>` : `<span class="tt">${sub}${bell(e)}</span>${esc(t)}`}</button>`; // 閉じた週（cw）は枠に時刻を出さず題名だけ（H-07）
}
// 終日段: 11px「終日」＋カテゴリの淡色地・本色12px太字のピル。最大3件（3日表示は各日1件）、幅不足なら減らして +N（その日の一覧へ）。
// 第19.1版 S3（M-07）: ノートの札は見出しの行から外して、終日の行の右へ（押せる 44）。札の分の幅は終日のピルから引く。
const noteChipW = () => { const n = NB.marks.get(state.selected) || 0; return n ? 82 + 6 * (String(n).length - 1) : 60; }; // 札の幅＋左の間 8（実測 73.4＋8）
function allDayRow(ks, avail, chip = false) {
  if (chip) avail = Math.max(0, avail - noteChipW());
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
  return `<div class="allday" aria-label="終日の予定"><span class="adl">終日</span><div class="adcols">${cols}</div>${chip ? noteChip() : ''}</div>`;
}
// 閉じた週の終日段（H-07）: 複数日の終日は週の中で1本の帯（題名 9pt W6＋線 2）。日ごとの丸い札にはしない。段は最大3、あふれは日ごとの +N。
function allDayWeek(ks) {
  const per = ks.map((k) => eventsOnDay(occIn(k, k), k).filter((e) => e.all));
  const byId = new Map();
  per.forEach((list, i) => list.forEach((e) => { const o = byId.get(e.id + (e.recurring ? dayOf(e.start) : '')) || { e, sc: i, ec: i }; o.ec = i; byId.set(e.id + (e.recurring ? dayOf(e.start) : ''), o); }));
  const items = [...byId.values()].sort((a, b) => a.sc - b.sc || (b.ec - b.sc) - (a.ec - a.sc));
  const CAP = 3, lanes = [], hidden = Array(ks.length).fill(0), shown = [];
  for (const it of items) {
    let l = lanes.findIndex((end) => end < it.sc);
    if (l < 0 && lanes.length < CAP) { l = lanes.length; lanes.push(-1); }
    if (l < 0) { for (let i = it.sc; i <= it.ec; i++) hidden[i]++; continue; }
    lanes[l] = it.ec; shown.push({ ...it, l });
  }
  const bars = shown.map(({ e, sc, ec, l }) => `<button type="button" class="adpill adband ${catCls(e)}" data-event="${esc(e.id)}" style="${catVar(e)}left:calc(${sc} * 100% / ${ks.length} + 1px);width:calc(${ec - sc + 1} * 100% / ${ks.length} - 2px);top:${2 + l * 18}px" aria-label="${esc(`${xname(e)}${ec > sc ? `${dayOf(e.start)}から${dayOf(e.end)}` : `${dayLabel(ks[sc])} 終日`} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><span class="bt">${esc(e.title)}</span></button>`).join('');
  const more = hidden.some((n) => n > 0), y = 2 + lanes.length * 18;
  const plus = hidden.map((n, i) => (n > 0 ? `<button type="button" class="adplus" data-jump="${ks[i]}" style="left:calc(${i} * 100% / ${ks.length});width:calc(100% / ${ks.length});top:${y}px" aria-label="${dayLabel(ks[i])}の終日の予定をすべて見る（ほか${n}件）">+${n}</button>` : '')).join('');
  const h = Math.max(24, 2 + lanes.length * 18 + (more ? 14 : 0) + 2);
  return `<div class="allday adweek" aria-label="終日の予定" style="height:${h}px"><span class="adl">終日</span><div class="adcols">${bars}${plus}</div></div>`;
}
function timelineHtml(ks, avail, pane = 'right', fixedHh = 0, chip = false) {
  const cwk = pane === 'closed' && ks.length > 1; // 閉じた週: 曜日 10pt と日付 13pt の2段（M-08）
  const heads = ks.length > 1 ? `<div class="tlheads"><span class="tlh0"></span>${ks.map((k) => { const d = parseKey(k); return `<button type="button" class="tlhd${k === state.selected ? ' sel' : ''}${k === todayKey() ? ' today' : ''}" data-tlday="${k}" aria-pressed="${k === state.selected}" aria-label="${dayLabel(k)}を選ぶ">${cwk ? `<span class="dw">${DOW[d.getDay()]}</span><span class="dd">${d.getDate()}</span>` : `${d.getDate()}（${DOW[d.getDay()]}）`}${rkSpan(k, 'wrk')}</button>`; }).join('')}</div>` : '';
  let lines = '';
  for (let h = 0; h <= 24; h++) {
    lines += `<i class="hl" style="--m:${h * 60}"></i>`;
    if (h < 24) lines += `<span class="hlab" style="--m:${h * 60}">${h}:00</span><i class="hl half" style="--m:${h * 60 + 30}"></i>`;
  }
  const cols = ks.map((k) => `<div class="tlcol" data-day="${k}">${dayBlocks(k).map((b) => tlBlock(b, k, cwk)).join('')}</div>`).join('');
  return `${pane === 'closed' ? `${heads}${cwk ? allDayWeek(ks) : allDayRow(ks, avail)}` : `${allDayRow(ks, avail, chip)}${heads}`}<div class="tl" data-scroll="tl" data-pane="${pane}" style="--hh:${fixedHh || TLP[pane].hh}px"><div class="tlin" data-pane="${pane}" data-days="${ks.join(',')}">${lines}<div class="tlcols">${cols}</div><div class="nowl" hidden><span class="nowt"></span></div></div></div>`;
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
  return `<div class="rhead dh"><h2 class="rdate${id === 'time' ? ' keep' : ''}"><button type="button" class="datebtn" data-act="mini" data-pane="${side}" aria-haspopup="dialog" aria-expanded="${MM.open === side}" aria-label="日付を選ぶ: ${esc(dayLabel(state.selected))}">${dayTitle(state.selected)}</button></h2>${side === 'right' ? rctl() : ''}${id === 'time' ? timeCapsule(side) : ''}<div class="sctl">${paneNav(side, -1)}${paneNav(side, 1)}${side === 'left' ? gearBtn() : ''}</div></div>`;
}
const noteChip = () => { const n = NB.marks.get(state.selected) || 0; return `<button type="button" class="ndchip${n ? ' has' : ''}" data-act="notedayjump" aria-label="${esc(dayLabel(state.selected))}のノート${n}件を開く">ノート${n ? ` ${n}件` : ''}</button>`; };
// 小さな月（幅 280・高さ 260、1マス 40×36）。選んでいる日は共通。六曜は出さない。
const MM = { open: null, ym: '' };
function miniMonth(side) {
  if (MM.open !== side) return '';
  const d = parseKey(MM.ym || state.selected);
  const cells = monthWeeks(MM.ym || state.selected).flat().map((k) => {
    const c = parseKey(k), out = c.getMonth() !== d.getMonth();
    return `<button type="button" class="mmc${out ? ' out' : ''}${isRed(k) ? ' hol' : ''}${k === state.selected ? ' sel' : ''}${k === todayKey() ? ' tod' : ''}" data-mmday="${k}" data-pane="${side}" aria-label="${esc(dayLabel(k))}${esc(holSpoken(k))}${k === state.selected ? '、選択中' : ''}" aria-pressed="${k === state.selected}"><span class="n">${c.getDate()}</span>${NB.marks.has(k) ? '<i class="mline" aria-hidden="true"></i>' : ''}</button>`;
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
// 今日＋明日: 左右の時間軸は同じ scrollTop。
root.addEventListener('scroll', (ev) => {
  const el = ev.target;
  if (!el?.matches?.('.dpage .tl')) return;
  TT.top = el.scrollTop;
  for (const o of root.querySelectorAll('.dpage .tl')) if (o !== el && Math.abs(o.scrollTop - el.scrollTop) > 0.5) o.scrollTop = el.scrollTop;
}, true);
// つまみ（予定欄とノート欄の境目）。上下に引くと左右一緒に変わる。離したときに保存。横スワイプ・めくりの起点にはしない。
function ttSetSplit(v, commit) {
  const n = Math.min(ttSplitMax(), Math.max(64, Math.round(v)));
  const sh = root.querySelector('.shell.tt'); if (sh) sh.style.setProperty('--tt-split', `${n}px`);
  root.querySelectorAll('.dgrip').forEach((g) => g.setAttribute('aria-valuenow', String(n)));
  if (commit && n !== state.ttSplit) set({ ttSplit: n }); // 再描画で 160 を境に時間軸と一覧が入れ替わる
}
root.addEventListener('pointerdown', (ev) => {
  const g = ev.target.closest?.('.dgrip');
  if (!g || TT.drag || ttCurl?.busy() || !ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return; // めくっている間はつまみを動かさない
  ev.preventDefault();
  const id = ev.pointerId, y0 = ev.clientY, v0 = ttSplitNow();
  TT.drag = { id };
  g.classList.add('drag');
  const mv = (e) => { if (e.pointerId === id) ttSetSplit(v0 + e.clientY - y0, false); };
  const done = (e) => {
    if (e.pointerId !== id) return;
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
    TT.drag = null; g.classList.remove('drag');
    ttSetSplit(v0 + e.clientY - y0, true);
    TLQ.quiet = performance.now() + 400;
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
});
root.addEventListener('keydown', (ev) => {
  if (!ev.target.classList?.contains('dgrip') || !['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
  ev.preventDefault();
  ttSetSplit(ttSplitNow() + (ev.key === 'ArrowUp' ? -30 : 30), true);
  root.querySelector('.dgrip')?.focus({ preventScroll: true });
});
// 時間ページの中身（1日・3日は時間軸、週とリストはそのペイン内で描く）。
function timeBody(side, w) {
  const m = tmode(side);
  const nd = `<div class="ndrow">${noteChip()}</div>`; // 週・リストには終日の行が無いので、同じ高さの行に札だけ置く
  if (m === 'week') return `${nd}<div class="scroll weekpage padb" data-scroll="wk" data-pane="${side}">${weekKeys().map((x) => weekRow(x, false)).join('')}</div>`;
  if (m === 'list') return nd + agendaView(side);
  return timelineHtml(tlKeys(tdays(side)), w - 50, side, 0, true);
}
// ページ id 付きの描画。side＝'left'|'right'、id＝'month'|'time'|'task'|'memo'。
// ---------- ノート（旧「日ごとのメモ」。左右ページ・縦の下パネル・閉じた画面の帯で同じ一覧と同じエディタ。保存は notes.js） ----------
// 画面からは旧 memos へ一切書かない。旧メモは起動時にノートへ複製済み（db.js の移行）。
let noteComposing = false, renderPending = false, rendering = false;
const NB = { marks: new Map(), first: new Map(), day: null, dp: null, cur: null, rows: null, q: { left: '', right: '', bottom: '', closed: '' }, seq: 0, failed: false, blocked: false, ed: null, opening: null, focusNew: false, said: false, folders: null, sel: 'all', menu: null, swallow: 0, sheet: null };
const noteHead = (side) => `<div class="rhead dh"><h2 class="rdate">ノート</h2>${side === 'right' ? rctl() : ''}<div class="sctl">${side === 'left' ? gearBtn() : ''}</div></div>`;
function noteEditor() {
  if (!NB.ed) NB.ed = mountNoteEditor(document.createElement('div'), {
    store: noteStore,
    onOpen: (id) => { db.setLastNote(id).catch(() => {}); },
    onTrashChange: (id) => { if (id === NB.cur) { NB.cur = null; db.setLastNote(null).catch(() => {}); } invalidateNoteList(); render(); },
    onDone: () => { if (NB.sheet) closeNoteSheet(); else noteBack(); },
    onFormatSheet: (open, hadKb) => { if (NB.sheet) { NB.sheet.fs = !open ? null : hadKb ? (kbTopOf(window.visualViewport, window.innerHeight) ?? L.h - 250) : L.h - 250; placeNoteSheet(); } },
    loadInk: (id) => db.getNote(id).then((n) => n?.ink ?? null), // 古い手書きを表示だけする（読むだけ）
  });
  return NB.ed;
}
function noteBody(where) {
  if (NB.blocked) return '<div class="memopage padb"><p class="smsg" role="alert">ノートを準備できませんでした。アプリを閉じて、もう一度開いてください。（予定と元のメモは変わっていません）</p></div>';
  if (NB.cur) return noteOthers(where) + `<div class="ntools mtools"><button type="button" class="mback" data-act="noteback" aria-label="ノートの一覧に戻る">一覧</button><button type="button" class="mback" data-act="notenew" aria-label="新しいノート">＋ 新規</button></div><div class="memopage notepage padb" data-note-wrap="${where}"><div class="nmeta" data-nmeta="${where}"></div><div class="nhost" data-nhost="${where}"></div></div>`;
  return `<div class="ntools mtools"><span class="ntitle">ノート</span><button type="button" class="mback" data-act="notenew" aria-label="新しいノート">＋ 新規</button></div><div class="memopage mlist padb" data-mlist-wrap="${where}">${NB.day ? `<div class="nday"><span>${esc(dayLabel(NB.day))}のノート</span><button type="button" data-act="ndayplus" aria-label="この日のノートを開く・作る">＋</button><button type="button" data-act="ndayclear" aria-label="日の絞りを外す">✕</button></div>` : ''}<div class="mlsb"><input type="search" class="mlq" data-mlq="${where}" placeholder="ノートを検索" aria-label="ノートを検索" value="${esc(NB.q[where])}" autocomplete="off" spellcheck="false"></div><div class="nchips" data-nchips="${where}" role="toolbar" aria-label="フォルダ">${noteChipsHtml()}</div><div class="mlrows" data-mlist="${where}">${noteRowsHtml(where)}</div><div data-nmenu="${where}">${noteMenuHtml()}</div></div>`;
}
const noteDayText = (ms) => { const d = new Date(ms), t = new Date(); return `${d.getFullYear() === t.getFullYear() ? '' : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()}`; };
// 一覧は固定の行高で仮想表示する（40000件でも描くのは見える範囲＋前後だけ）。件数の行・見出し・ノート行を縦に並べた平らな表を持つ。
const NV = { ROW: 57, SEC: 30, CNT: 28, BUF: 700 };
NB.flat = {}; NB.perf = {}; globalThis.__duoNotePerf = NB.perf;
const nowMs = () => (globalThis.performance || Date).now();
function noteRowsHtml(where) {
  NB.flat[where] = null;
  if (NB.failed) return '<p class="smsg">ノートを読み込めませんでした。</p>';
  if (!NB.rows) return '<p class="smsg" role="status">読み込んでいます…</p>';
  const t0 = nowMs(), idx0 = noteIndexSize();
  const q = NB.q[where], hasQ = !!terms(q).length;
  // 検索中はフォルダを見ず全ノートが対象。検索語なしのときだけフォルダで絞る。
  const base = NB.day ? NB.rows.filter((n) => noteDateOf(n) === NB.day) : hasQ ? NB.rows : filterByFolder(NB.rows, NB.sel, NB.folders || []); // 日で絞っているときはフォルダを見ない
  const res = searchNotes(base, q, { limit: null }), ts = res.ts, rows = res.items;
  const t1 = nowMs();
  NB.perf.search = Math.round((t1 - t0) * 10) / 10; if (noteIndexSize() !== idx0) NB.perf.index = NB.perf.search; NB.perf.count = NB.rows.length; NB.perf.hits = rows.length;
  if (!rows.length) return `<p class="smsg">${q.trim() ? '該当するノートはありません。' : (NB.sel === 'all' ? 'ノートはまだありません。「＋ 新規」から書けます。' : 'このフォルダにノートはありません。')}</p>`;
  const { pinned, others } = groupNotes(rows);
  const rowHtml = (n) => {
    const title = n.title || titleOf(n.body), second = n.body.split('\n').slice(1).map((l) => viewOf(l.trim()).text.trim()).find(Boolean) || ''; // 一覧の2行目にも記号は出さない（S3）
    const nd = noteDateOf(n), fname = (NB.folders || []).find((x) => x.id === n.folderId)?.name || '';
    const dshort = nd ? `${nd.slice(5, 7).replace(/^0/, '')}/${nd.slice(8, 10).replace(/^0/, '')}` : '';
    const line2 = [noteDayText(n.updatedAt), fname, dshort].filter(Boolean).join(' ・ ');
    return `<div class="nrw${n.pinned ? ' pinned' : ''}" data-nrw="${esc(n.id)}"><button type="button" class="mrow" data-nrow="${esc(n.id)}" aria-label="${esc(title)}"><b>${n.pinned ? '<i class="npin" aria-hidden="true">📌</i>' : ''}${ts.length ? highlight(title, ts, esc) : esc(title)}</b><span>${esc(line2)}${second ? ` ${esc(second)}` : ''}</span></button>${nd ? `<button type="button" class="nsrc" data-nsrc="${nd}" aria-label="日付 ${esc(dayLabel(nd))}を開く">${dshort}</button>` : ''}<button type="button" class="nmore" data-nf="rowmenu" data-id="${esc(n.id)}" aria-label="${esc(title)}の操作">⋯</button></div>`;
  };
  const items = []; let top = 0;
  const add = (k, h, v) => { items.push({ k, h, top, v }); top += h; };
  add('cnt', NV.CNT, rows.length);
  if (pinned.length) { add('sec', NV.SEC, 'ピン留め'); for (const n of pinned) add('row', NV.ROW, n); add('sec', NV.SEC, 'ノート'); }
  for (const n of others) add('row', NV.ROW, n);
  NB.flat[where] = { items, height: top, rowHtml, ts, key: '' };
  NB.perf.list = Math.round((nowMs() - t0) * 10) / 10;
  return `<div class="nvs" data-nvs style="height:${top}px"></div>`;
}
// 見える範囲（＋前後 BUF px）の行だけを .nvs に描く。同じ範囲なら何もしない。
function paintNoteWindow(el) {
  const f = NB.flat[el.dataset.mlist], box = el.querySelector('[data-nvs]');
  if (!f || !box) return;
  const lo = el.scrollTop - NV.BUF, hi = el.scrollTop + (el.clientHeight || 800) + NV.BUF, L = f.items;
  let a = 0, b = L.length;
  while (a < b) { const m = (a + b) >> 1; if (L[m].top + L[m].h < lo) a = m + 1; else b = m; }
  let z = a; while (z < L.length && L[z].top <= hi) z++;
  const key = `${a}:${z}`;
  if (f.key === key) return;
  f.key = key;
  const t0 = nowMs();
  let h = '';
  for (let i = a; i < z; i++) {
    const it = L[i], st = ` style="top:${it.top}px"`;
    if (it.k === 'cnt') h += `<p class="small hcount"${st}>${it.v}件</p>`;
    else if (it.k === 'sec') h += `<h3 class="nsec"${st}>${it.v}</h3>`;
    else h += f.rowHtml(it.v).replace('<div class="nrw', `<div style="top:${it.top}px" class="nrw`);
  }
  const act = document.activeElement, id = act && box.contains(act) ? act.closest('[data-nrw]')?.dataset.nrw : null;
  box.innerHTML = h;
  if (id) box.querySelector(`[data-nrw="${CSS.escape(id)}"] .mrow`)?.focus({ preventScroll: true });
  NB.perf.window = Math.round((nowMs() - t0) * 10) / 10; NB.perf.rendered = z - a;
}
let nvRaf = 0;
root.addEventListener('scroll', (ev) => {
  const el = ev.target; if (!el?.matches?.('[data-mlist]')) return;
  if (nvRaf) return;
  nvRaf = requestAnimationFrame(() => { nvRaf = 0; paintNoteWindow(el); });
}, true);
// 集中ノートで本文を開いている間の「ほかのノート」。折って書くときは下面の1行、開ききりでは上面の一覧（配置は keyboard-layout の CSS 変数）。
function noteOthersHtml() {
  const rows = (NB.rows || []).filter((n) => n.id !== NB.cur).slice(0, 60);
  if (!rows.length) return `<span class="nupe">${NB.rows ? 'ほかのノートはありません' : '読み込んでいます…'}</span>`;
  return rows.map((n) => { const t = n.title || titleOf(n.body); return `<button type="button" class="nupb" data-nrow="${esc(n.id)}" aria-label="${esc(t)}を開く">${esc(t)}</button>`; }).join('');
}
const noteOthers = (where) => (where === 'closed' && fmode() === 'note' ? `<div class="nup" data-nup role="group" aria-label="ほかのノート">${noteOthersHtml()}</div>` : '');
function paintNoteLists() {
  root.querySelectorAll('[data-nup]').forEach((el) => { const sl = el.scrollLeft; el.innerHTML = noteOthersHtml(); el.scrollLeft = sl; });
  root.querySelectorAll('[data-mlist]').forEach((el) => { el.innerHTML = noteRowsHtml(el.dataset.mlist); paintNoteWindow(el); });
  root.querySelectorAll('[data-nchips]').forEach((el) => { const sl = el.scrollLeft; el.innerHTML = noteChipsHtml(); el.scrollLeft = sl; });
  paintNoteMenu();
}
const nfBtn = (act, id, text, cls = '', extra = '') => `<button type="button" class="${cls}" data-nf="${act}"${id != null ? ` data-id="${esc(id)}"` : ''}${extra}>${text}</button>`;
function noteChipsHtml() {
  const f = NB.folders || [], on = (v) => (NB.sel === v ? ' on' : '');
  const chip = (id, name) => `<button type="button" class="nchip${on(id)}" data-nf="sel" data-id="${esc(id)}" aria-pressed="${NB.sel === id}">${esc(name)}</button>`;
  return `${chip('all', 'すべて')}${f.map((x) => chip(x.id, x.name)).join('')}${chip('none', 'フォルダなし')}${nfBtn('newf', null, '＋', 'nchip nadd', ' aria-label="フォルダを作る"')}${f.some((x) => x.id === NB.sel) ? nfBtn('chipmenu', NB.sel, '管理', 'nchip nmanage', ' aria-label="このフォルダの管理"') : ''}`;
}
function noteMenuHtml() {
  const m = NB.menu; if (!m) return '';
  const f = NB.folders || [], fol = f.find((x) => x.id === m.id), row = (NB.rows || []).find((x) => x.id === m.id);
  const close = nfBtn('menuclose', null, '閉じる', 'nmbtn');
  const err = m.err ? `<p class="nerr" role="alert">${esc(m.err)}</p>` : '';
  let h = '';
  if (m.k === 'new') h = `<h3>新しいフォルダ</h3><input class="nfin" data-nfin maxlength="${FOLDER_NAME_MAX * 2}" aria-label="フォルダ名" placeholder="フォルダ名（${FOLDER_NAME_MAX}字まで）" autocomplete="off">${err}<div class="nmrow">${nfBtn('newfgo', null, '作る', 'nmbtn')}${close}</div>`;
  else if (m.k === 'chip' && fol) { const i = f.indexOf(fol); h = `<h3>${esc(fol.name)}</h3><input class="nfin" data-nfin maxlength="${FOLDER_NAME_MAX * 2}" aria-label="フォルダ名" value="${esc(fol.name)}" autocomplete="off">${err}<div class="nmrow">${nfBtn('renamego', fol.id, '名前を変える', 'nmbtn')}</div><div class="nmrow">${nfBtn('fmove', fol.id, '前へ', 'nmbtn', ` data-dir="-1"${i <= 0 ? ' disabled' : ''}`)}${nfBtn('fmove', fol.id, '後ろへ', 'nmbtn', ` data-dir="1"${i >= f.length - 1 ? ' disabled' : ''}`)}</div><div class="nmrow">${nfBtn('delask', fol.id, '削除', 'nmbtn danger')}${close}</div>`; }
  else if (m.k === 'del' && fol) { const n = (NB.rows || []).filter((x) => x.folderId === fol.id).length; h = `<h3>「${esc(fol.name)}」を削除しますか？</h3><p>中のノート ${n} 件は『フォルダなし』に移ります。</p>${err}<div class="nmrow">${nfBtn('delgo', fol.id, '削除する', 'nmbtn danger')}${nfBtn('menuclose', null, 'やめる', 'nmbtn')}</div>`; }
  else if (m.k === 'row' && row) h = `<h3>${esc(row.title || titleOf(row.body))}</h3><div class="nmrow">${nfBtn('rowpin', row.id, row.pinned ? 'ピン留めを外す' : 'ピン留めする', 'nmbtn')}</div><div class="nmrow">${nfBtn('rowmv', row.id, 'フォルダへ移動', 'nmbtn')}</div><div class="nmrow">${nfBtn('rowdel', row.id, '削除（30日は戻せます）', 'nmbtn danger')}${close}</div>`;
  else if (m.k === 'mv' && row) h = `<h3>移動先のフォルダ</h3><div class="nmlist">${[{ id: '', name: 'フォルダなし' }, ...f].map((x) => nfBtn('rowmvto', row.id, `${esc(x.name)}${(row.folderId || '') === x.id ? ' ✓' : ''}`, 'nmbtn', ` data-to="${esc(x.id)}"`)).join('')}</div>${err}<div class="nmrow">${close}</div>`;
  else return '';
  return `<div class="nmenu" role="dialog" aria-modal="true" aria-label="フォルダとノートの操作"><div class="nmbox">${h}</div></div>`;
}
function paintNoteMenu() {
  root.querySelectorAll('[data-nmenu]').forEach((el) => {
    const had = el.querySelector('[data-nfin]'), val = had?.value;
    el.innerHTML = noteMenuHtml();
    const inp = el.querySelector('[data-nfin]');
    if (inp && NB.menuFocus) { inp.focus({ preventScroll: true }); inp.select?.(); }
    else if (el.firstChild) el.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    if (inp && val != null && !NB.menuFocus) inp.value = val;
  });
  NB.menuFocus = false;
}
const openNoteMenu = (m) => { NB.menu = m; NB.menuFocus = m.k === 'new' || m.k === 'chip'; paintNoteMenu(); };
async function loadFolders() {
  try { NB.folders = await db.listFolders(); } catch { NB.folders = NB.folders || []; }
  if (NB.sel !== 'all' && NB.sel !== 'none' && !NB.folders.some((f) => f.id === NB.sel)) NB.sel = 'all';
}
async function loadNoteList() {
  const seq = ++NB.seq;
  try { await flushNotesNow(); db.purgeTrashedNotes().catch(() => {}); await loadFolders(); const all = await db.listNotes(); if (seq !== NB.seq) return; NB.rows = all.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1)); NB.failed = false; } catch { if (seq !== NB.seq) return; NB.failed = true; }
  paintNoteLists();
}
const invalidateNoteList = () => { NB.rows = null; NB.seq++; refreshNoteMarks(); };
const noteListUsed = () => !!root.querySelector('[data-mlist]');
// 検索語は150ms待ってから反映（古い入力の結果は捨てる）。結果が変わるので一覧は先頭へ戻す。
let nqTimer = 0, nqSeq = 0;
root.addEventListener('input', (ev) => {
  const q = ev.target.closest?.('input.mlq'); if (!q) return;
  NB.q[q.dataset.mlq] = q.value;
  const seq = ++nqSeq; clearTimeout(nqTimer);
  nqTimer = setTimeout(() => { if (seq !== nqSeq) return; root.querySelectorAll('[data-mlist]').forEach((el) => { el.scrollTop = 0; }); paintNoteLists(); }, 150);
});
// 月の印: 日付のあるノート（削除済みを除く）の件数。1日に複数あっても線は1本。保存の変更のたびに取り直す。
let marksSeq = 0;
async function refreshNoteMarks() {
  const seq = ++marksSeq;
  try {
    const m = new Map(), fb = new Map(), best = new Map();
    for (const n of await db.listNotes()) {
      if (n.deletedAt != null) continue;
      const k = noteDateOf(n); if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
      const b = best.get(k); if (!b || n.updatedAt > b.updatedAt) { best.set(k, n); fb.set(k, String(n.body ?? '').slice(0, 800)); } // 1日ページのノート欄に出す「1件目」（いちばん新しいもの）
    }
    if (seq !== marksSeq) return;
    const same = m.size === NB.marks.size && [...m].every(([k, v]) => NB.marks.get(k) === v) && fb.size === NB.first.size && [...fb].every(([k, v]) => NB.first.get(k) === v);
    NB.marks = m; NB.first = fb;
    if (!same) render();
  } catch { /* 印が出ないだけ */ }
}
async function filterNotesByDay(day) {
  if (NB.blocked) return;
  if (NB.sheet) { if (await closeNoteSheet() === false) return; }
  if (NB.ed && NB.cur) { const ok = await NB.ed.leave(); if (ok === false) return; NB.cur = null; NB.dp = null; invalidateNoteList(); }
  NB.day = day; render();
}
// 「この日のノート」: 0件=日ごとのメモに新規（1行目は日付見出し）、1件=開く、複数=その日に絞った一覧。
let dayNoteBusy = false;
// その日の新しいノート（日ごとのメモのフォルダ、1行目は日付見出し）を作って id を返す。
async function createDayNote(day) {
  let fid = null;
  try { const r = ensureDailyFolder(await db.listFolders()); if (r.created) await db.putFolder(r.folder); fid = r.folder.id; invalidateNoteList(); NB.folders = null; } catch { /* フォルダなしで作る */ }
  const id = noteStore.newNote();
  await noteStore.setMeta(id, { date: day, ...(fid ? { folderId: fid } : {}) });
  noteStore.setText(id, `${dailyHeading(day)}\n`);
  return id;
}
async function openDayNote(day) {
  if (!day || NB.blocked || dayNoteBusy) return;
  if (NB.sheet) { if (await closeNoteSheet() === false) return; }
  dayNoteBusy = true;
  try {
    let all; try { all = await db.listNotes(); } catch { say('ノートを読み込めませんでした。'); return; }
    const occ = dateOccupants(all, day, null);
    if (occ.length === 1) { NB.day = null; await noteOpen(occ[0].id); return; }
    if (occ.length > 1) { await filterNotesByDay(day); return; }
    if (NB.ed && NB.cur) { const ok = await NB.ed.leave(); if (ok === false) return; }
    const id = await createDayNote(day);
    NB.day = null; NB.cur = id; NB.focusNew = true; NB.dp = null; render();
  } finally { dayNoteBusy = false; }
}
// 長押しメニューと見出しのチップから: 右ページ（なければ下・帯）をノートにして、その日のノートへ。
function showNotePage() {
  const kind = layoutKind();
  if (kind === 'spread') { const side = PG().right === 'memo' ? 'right' : PG().left === 'memo' ? 'left' : 'right'; if (PG()[side] !== 'memo') set({ pages: selectPage(state.pages, side, 'memo'), lastSide: side }); }
  else if (panelOn()) set({ pages: selectPage(state.pages, 'portraitBottom', 'memo') });
  else set({ strip: 'memo' });
}
async function noteDayJump(day) { showNotePage(); await filterNotesByDay(day); }
async function noteOpen(id) {
  if (NB.sheet) { if (await closeNoteSheet() === false) return; }
  if (NB.ed && NB.cur && NB.cur !== id) { const ok = await NB.ed.leave(); if (ok === false) return; }
  NB.cur = id; NB.dp = null; render();
}
async function noteBack() {
  if (NB.sheet) { if (await closeNoteSheet() === false) return; }
  if (NB.ed && NB.cur) { const ok = await NB.ed.leave(); if (ok === false) return; }
  NB.cur = null; NB.dp = null; db.setLastNote(null).catch(() => {}); invalidateNoteList(); render();
}
async function noteNew() {
  if (NB.blocked) return;
  if (NB.sheet) { if (await closeNoteSheet() === false) return; }
  if (NB.ed && NB.cur) { const ok = await NB.ed.leave(); if (ok === false) return; }
  NB.cur = noteStore.newNote(); NB.focusNew = true;
  if (NB.sel !== 'all' && NB.sel !== 'none' && NB.folders?.some((f) => f.id === NB.sel)) noteStore.setMeta(NB.cur, { folderId: NB.sel }); // 開いているフォルダの中に作る
  render();
}
// 描画後: 一覧なら読み込み、エディタなら常設の1つを置き直し（フォーカスとカーソルを戻す）。
function fillNotes(keep) {
  if (NB.blocked) return;
  const host = root.querySelector('[data-nhost]');
  if (host && NB.cur && root.querySelector('[data-nup]') && !NB.rows && !NB.failed) loadNoteList();
  if (!host || !NB.cur) { if (noteListUsed()) { if (!NB.rows && !NB.failed) loadNoteList(); else root.querySelectorAll('[data-mlist]').forEach(paintNoteWindow); } return; }
  const ed = noteEditor(), id = NB.cur;
  host.append(ed.el); paintNoteMeta();
  if (ed.id !== id && NB.opening !== id) {
    NB.opening = id;
    ed.open(id).then(() => { if (NB.opening === id) NB.opening = null; if (NB.focusNew && NB.cur === id) { NB.focusNew = false; ed.titleEl.focus({ preventScroll: true }); } }, () => { NB.opening = null; });
  }
  if (keep) {
    const t = keep.which === 'title' ? ed.titleEl : ed.bodyEl;
    t.focus({ preventScroll: true });
    try { t.setSelectionRange(keep.s, keep.e, keep.d || 'none'); } catch { /* 無視 */ }
    t.scrollTop = keep.sc;
  }
}
// 回転・開閉の前に、編集中の文字を最新のまま保存へ流す（失敗時は draft が端末に残る。IME 中でも落とさない）。
function flushEditing() { try { noteSync(); noteStore.flushAll().catch(() => {}); ftFlush(); } catch { /* 保存失敗でも描画は続ける */ } }
// 集中画面のスクロール位置は姿勢（kind）をまたいで保つ。同じ種類の n 番目の要素へ戻す。
const KEEP_SCROLL = '.ftlist, .ftdn, .ftup, .nup, .mlrows, .ned-bodywrap, .taskl';
const keepScrollKey = (el, i) => `${i}|${NB.cur || ''}|${el.className}`;
function captureScrolls() { const m = new Map(); root.querySelectorAll(KEEP_SCROLL).forEach((el, i) => { if (el.scrollTop) m.set(keepScrollKey(el, i), el.scrollTop); }); return m; }
function restoreScrolls(m) { if (!m.size) return; root.querySelectorAll(KEEP_SCROLL).forEach((el, i) => { const v = m.get(keepScrollKey(el, i)); if (v && !el.scrollTop) el.scrollTop = v; }); }
const noteKeepOf = (ma) => (NB.ed && ma && (ma === NB.ed.titleEl || ma === NB.ed.bodyEl) ? { which: ma === NB.ed.titleEl ? 'title' : 'body', s: ma.selectionStart, e: ma.selectionEnd, d: ma.selectionDirection, sc: ma.scrollTop } : null);
// 本文の見出し: フォルダの選択とピン留め
async function paintNoteMeta() {
  const id = NB.cur; if (!id) return;
  const hosts = [...root.querySelectorAll('[data-nmeta]')]; if (!hosts.length) return;
  let m = null, f = NB.folders;
  try { if (!f) { await loadFolders(); f = NB.folders; } m = await noteStore.getMeta(id); } catch { m = null; }
  if (NB.cur !== id) return;
  const cur = m?.folderId || '', date = m?.date || null;
  for (const h of root.querySelectorAll('[data-nmeta]')) {
    if (document.activeElement?.matches?.('[data-nfsel]') && h.contains(document.activeElement)) continue;
    h.innerHTML = `<label class="nmlab">フォルダ<select data-nfsel aria-label="フォルダ">${[{ id: '', name: 'フォルダなし' }, ...(f || [])].map((x) => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><button type="button" class="ndate${date ? ' on' : ''}" data-act="ndate" aria-haspopup="dialog" aria-expanded="${!!NB.dp}" aria-label="日付${date ? `: ${esc(dayLabel(date))}` : 'を付ける'}">${date ? `${esc(dayLabel(date))} ›` : '日付 ›'}</button><button type="button" class="nmpin${m?.pinned ? ' on' : ''}" data-nf="pin" aria-pressed="${!!m?.pinned}">${m?.pinned ? '📌 ピン留め中' : 'ピン留め'}</button>${noteDatePopHtml(date)}`;
  }
}
// ノートの日付: 小さな月で日を選ぶ。月の下に「日付を外す」。選んだ日に別のノートがあれば、開くか付け替えるかを確認する。
function noteDatePopHtml(date) {
  const dp = NB.dp; if (!dp) return '';
  if (dp.confirm) {
    const c = dp.confirm;
    return `<div class="ndpop ndconf" role="alertdialog" aria-label="この日にはすでにノートがあります"><p>この日にはすでにノートがあります。</p><div class="nmrow"><button type="button" class="nmbtn" data-act="ndopen">そのノートを開く</button></div><div class="nmrow"><button type="button" class="nmbtn" data-act="ndswap">このノートに付け替える</button></div><div class="nmrow"><button type="button" class="nmbtn" data-act="ndcancel">やめる</button></div></div>`;
  }
  const base = dp.ym || date || state.selected, d = parseKey(base);
  const cells = monthWeeks(base).flat().map((k) => {
    const c = parseKey(k), out = c.getMonth() !== d.getMonth();
    return `<button type="button" class="mmc${out ? ' out' : ''}${isRed(k) ? ' hol' : ''}${k === date ? ' sel' : ''}${k === todayKey() ? ' tod' : ''}" data-ndday="${k}" aria-label="${esc(dayLabel(k))}${k === date ? '、選択中' : ''}" aria-pressed="${k === date}"><span class="n">${c.getDate()}</span></button>`;
  }).join('');
  return `<div class="ndpop" role="dialog" aria-label="ノートの日付を選ぶ"><div class="mmh"><button type="button" data-ndnav="-1" aria-label="前の月">‹</button><span class="mmt" aria-live="polite">${d.getFullYear()}年${d.getMonth() + 1}月</span><button type="button" data-ndnav="1" aria-label="次の月">›</button></div><div class="mmg">${cells}</div><div class="ndfoot"><button type="button" class="nmbtn" data-act="ndclear"${date ? '' : ' disabled'}>日付を外す</button><button type="button" class="nmbtn" data-act="ndclose">閉じる</button></div></div>`;
}
async function noteDateAct(d) {
  const id = NB.cur; if (!id) return;
  const refresh = () => { paintNoteMeta(); if (NB.rows) invalidateNoteList(); };
  try {
    if (d.act === 'ndate') { NB.dp = NB.dp ? null : { ym: '', confirm: null }; return paintNoteMeta(); }
    if (d.act === 'ndclose' || d.act === 'ndcancel') { NB.dp = d.act === 'ndcancel' && NB.dp?.confirm ? { ym: NB.dp.ym, confirm: null } : null; return paintNoteMeta(); }
    if (d.ndnav) { NB.dp.ym = addMonths(NB.dp.ym || (await noteStore.getMeta(id))?.date || state.selected, Number(d.ndnav)); return paintNoteMeta(); }
    if (d.act === 'ndclear') { await noteStore.setMeta(id, { date: null }); NB.dp = null; say('日付を外しました。'); return refresh(); }
    if (d.ndday) {
      const others = dateOccupants(await db.listNotes(), d.ndday, id);
      if (others.length) { NB.dp = { ym: NB.dp?.ym || '', confirm: { date: d.ndday, ids: others.map((n) => n.id) } }; return paintNoteMeta(); }
      await noteStore.setMeta(id, { date: d.ndday }); NB.dp = null; say(`${dayLabel(d.ndday)}を付けました。`); return refresh();
    }
    const c = NB.dp?.confirm; if (!c) return;
    if (d.act === 'ndswap') {
      for (const oid of c.ids) await noteStore.setMeta(oid, { date: null }); // 相手の本体は消さない。日付だけ外す
      await noteStore.setMeta(id, { date: c.date }); NB.dp = null; say(`${dayLabel(c.date)}を付け替えました。`); return refresh();
    }
    if (d.act === 'ndopen') {
      NB.dp = null;
      if (c.ids.length === 1) return noteOpen(c.ids[0]);
      await noteBack(); NB.day = c.date; paintNoteLists(); render();
    }
  } catch { say('日付を付けられませんでした。'); }
}
root.addEventListener('change', async (ev) => {
  const sel = ev.target.closest?.('[data-nfsel]'); if (!sel || !NB.cur) return;
  await noteStore.setMeta(NB.cur, { folderId: sel.value || null }); paintNoteMeta();
});
// フォルダ・ピンの操作（ボタン。長押し・スワイプはこの同じ処理を呼ぶ）
async function noteRefresh() { await loadNoteList(); }
async function noteFolderAct(b) {
  const d = b.dataset, a = d.nf;
  const val = () => root.querySelector('[data-nmenu] [data-nfin]')?.value ?? '';
  const fail = (msg) => { if (NB.menu) { NB.menu.err = msg; paintNoteMenu(); } };
  if (a === 'sel') { NB.sel = d.id; root.querySelectorAll('[data-mlist]').forEach((el) => { el.scrollTop = 0; }); paintNoteLists(); root.querySelector(`[data-nchips] [data-id="${CSS.escape(d.id)}"]`)?.focus({ preventScroll: true }); }
  else if (a === 'newf') openNoteMenu({ k: 'new' });
  else if (a === 'menuclose') { NB.menu = null; paintNoteMenu(); }
  else if (a === 'newfgo') { const r = await folderOps.create(val()); if (r.error) return fail(r.error); NB.menu = null; NB.sel = r.folder.id; await loadFolders(); paintNoteLists(); paintNoteMeta(); }
  else if (a === 'chipmenu') openNoteMenu({ k: 'chip', id: d.id });
  else if (a === 'renamego') { const r = await folderOps.rename(d.id, val()); if (r.error) return fail(r.error); NB.menu = null; await loadFolders(); paintNoteLists(); }
  else if (a === 'fmove') { const r = await folderOps.move(d.id, Number(d.dir)); if (r.error) return fail(r.error); await loadFolders(); NB.menu = { k: 'chip', id: d.id }; paintNoteLists(); }
  else if (a === 'delask') openNoteMenu({ k: 'del', id: d.id });
  else if (a === 'delgo') { const r = await folderOps.remove(d.id); if (r.error) return fail(r.error); NB.menu = null; if (NB.sel === d.id) NB.sel = 'all'; await loadFolders(); await noteRefresh(); paintNoteMeta(); }
  else if (a === 'rowmenu') openNoteMenu({ k: 'row', id: d.id });
  else if (a === 'rowpin') { const n = NB.rows?.find((x) => x.id === d.id); NB.menu = null; await noteStore.setMeta(d.id, { pinned: !n?.pinned }); await noteRefresh(); }
  else if (a === 'rowmv') openNoteMenu({ k: 'mv', id: d.id });
  else if (a === 'rowmvto') { NB.menu = null; await noteStore.setMeta(d.id, { folderId: d.to || null }); await noteRefresh(); }
  else if (a === 'rowdel') { NB.menu = null; const r = await noteStore.trash(d.id); if (r === false) { NB.menu = { k: 'row', id: d.id, err: 'ノートを保存できないため削除しませんでした。' }; } await noteRefresh(); }
  else if (a === 'pin') { if (!NB.cur) return; const m = await noteStore.getMeta(NB.cur); await noteStore.setMeta(NB.cur, { pinned: !m?.pinned }); paintNoteMeta(); }
}
// 長押し（チップ＝管理、行＝操作メニュー）と、行の左スワイプ（ピン留め）
root.addEventListener('pointerdown', (ev) => {
  const chip = ev.target.closest?.('.nchip[data-nf="sel"]'), row = ev.target.closest?.('.nrw'), mrow = ev.target.closest?.('.mrow');
  if (!chip && !(row && mrow)) return;
  const x0 = ev.clientX, y0 = ev.clientY; let moved = false, done = false;
  const target = chip ? { k: 'chip', id: chip.dataset.id } : { k: 'row', id: row.dataset.nrw };
  const lp = (chip && (chip.dataset.id === 'all' || chip.dataset.id === 'none')) ? 0 : setTimeout(() => { if (done || moved) return; done = true; NB.swallow = performance.now() + 600; openNoteMenu(target); }, 500);
  const mv = (e) => { const dx = e.clientX - x0, dy = e.clientY - y0; if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { moved = true; clearTimeout(lp); } };
  const up = (e) => {
    clearTimeout(lp); off();
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!done && row && mrow && dx < -60 && Math.abs(dy) < 30 && e.type === 'pointerup') { done = true; NB.swallow = performance.now() + 400; const n = NB.rows?.find((r) => r.id === row.dataset.nrw); noteStore.setMeta(row.dataset.nrw, { pinned: !n?.pinned }).then(noteRefresh); }
  };
  const off = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
});
root.addEventListener('click', (ev) => { if (NB.swallow && performance.now() < NB.swallow && ev.target.closest?.('.nchip, .nrw')) { ev.stopImmediatePropagation(); ev.preventDefault(); } NB.swallow = 0; }, true);
// 変換中などで input が届いていない本文を DOM から拾う。
function noteSync() { NB.ed?.sync(); }
let remComposing = false; // 題名欄の実変換中だけ true（入力欄のノードは再描画で保たれるので描画は待たない）
root.addEventListener('compositionstart', (ev) => { if (ev.target.closest?.('input.remin')) { remComposing = true; return; } if (ev.target.closest?.('.ned, [data-ft]')) noteComposing = true; });
root.addEventListener('compositionend', (ev) => {
  const rin = ev.target.closest?.('input.remin');
  if (rin) {
    remComposing = false;
    if (!RM.add.busy) RM.add.title = rin.value;
    if (RM.add.want) { RM.add.want = false; remSubmit(); } // 変換確定前に追加を押していたら、確定後に1回だけ保存
    return;
  }
  if (!ev.target.closest?.('.ned, [data-ft]')) return;
  noteComposing = false;
  if (renderPending) { renderPending = false; render(); }
  if (ev.target.closest?.('[data-ft]')) ftChanged(ev.target, false);
});
root.addEventListener('focusout', (ev) => { if (ev.target.closest?.('input.remin')) remComposing = false; if (noteComposing && ev.target.closest?.('.ned, [data-ft]')) { noteComposing = false; if (renderPending) { renderPending = false; setTimeout(render, 0); } } });
const flushNotesNow = () => { noteSync(); return noteStore.flushAll(); };
// バックアップの前後: 未保存のノートを保存し終えるまで待つ。保存できなかったものがあれば false。
const flushNotesAwait = async () => { try { const r = await flushNotesNow(); return r.every((x) => x !== false) && !noteStore.anyDirty(); } catch { return false; } };
setNoteHook((id) => { refreshNoteMarks(); if (NB.rows && !noteStore.dirty(id) && !noteStore.get(id)?.failed) { invalidateNoteList(); if (noteListUsed()) loadNoteList(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { flushNotesNow(); delCtl.flush(); doneCtl.flush(); } });
window.addEventListener('pagehide', () => { doneCtl.flush(); delCtl.flush(); });
window.addEventListener('pagehide', flushNotesNow);
// ---------- 集中タスクの詳細（PR33）: 入力はすぐ保存へ流す。保存は共通の saveTask（編集シートと同じ）、同じ項目への保存は順番に ----------
function ftCard() { return root.querySelector('.ftcard[data-id]'); }
function ftFlush() { clearTimeout(FT.timer); FT.timer = 0; const c = ftCard(); if (c) ftSave(c.dataset.id); }
function ftChanged(el, soon) {
  const c = el.closest('.ftcard'); if (!c) return;
  clearTimeout(FT.timer);
  if (soon) { if (el.dataset.ft === 'title') FT.timer = setTimeout(() => { if (!noteComposing) ftSave(c.dataset.id); }, 500); return; }
  ftSave(c.dataset.id);
}
function ftSave(id) {
  FT.chain = FT.chain.then(async () => {
    const c = ftCard(), orig = RM.data?.reminders.find((x) => x.itemId === id);
    if (!c || c.dataset.id !== id || !orig) return;
    const v = (k) => c.querySelector(`[data-ft="${k}"]`);
    const date = v('date').value;
    const form = { title: v('title').value, date, time: date ? v('time').value : '', notes: v('notes').value, notify: v('notify').checked };
    const err = c.querySelector('[data-ft-err]');
    const r = await saveTask(localCall, orig, form);
    const c2 = ftCard(); const e2 = c2?.querySelector('[data-ft-err]') || err;
    if (r.ok) {
      if (e2) { e2.hidden = true; e2.textContent = ''; }
      if (!r.noop && RM.data) { RM.mut++; RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === id ? r.reminder : x)) }; RM.sig = ''; render(); scheduleTasks(); if (r.reminder.alarms?.length) askNotifyPerm(); }
      return;
    }
    const m = r.invalid || taskErrText(r.code, 'もう一度お試しください。');
    if (r.code === 'NOT_FOUND') { FT.sel = null; loadTasks(); }
    if (e2) { e2.hidden = false; e2.textContent = m; }
    say(m);
  }).catch(() => {});
}
root.addEventListener('input', (ev) => { const el = ev.target.closest?.('[data-ft]'); if (el && !ev.isComposing) ftChanged(el, true); });
root.addEventListener('change', (ev) => { const el = ev.target.closest?.('[data-ft]'); if (el) ftChanged(el, false); });
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
  const r = await addCtl.submit({ title: a.title, due, time, notify: a.notify, listId: syncOn() ? addDestId() : '' }); // Duo 内に保存（native は呼ばない）
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
    if (r.reminder.alarms?.length) askNotifyPerm(); // 結果を待たない。拒否されても保存は成立
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
  return dueCounts(list, over);
}
// ---------- リマインダーとの同期（第19版 D7）。既定はオフ。オンにする入口は設定 › タスク（D8・PR10）。オフ・native なしでは何もしない ----------
const SYNC_KEY = `duo-rem-sync${suffix}`;
const SYNC_BASE_KEY = `duo-rem-base${suffix}`; // 端末内の「前回合意した値」（欄ごとの衝突判定用。バックアップには入れない）
let remSync = null;
const RS = { perm: '', lists: [], chip: 'all', sheet: null, denied: false, flash: false }; // 第19版 PR10: タスクの画面の状態（許可・リスト・選んだチップ・開いているシート）
let syncSet = normSyncSettings(parseLS(SYNC_KEY));
const setSyncSettings = (next) => { syncSet = normSyncSettings(next); try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncSet)); } catch { /* 無視 */ } };
const taskStore = createTaskStore(db, { syncOn: () => NATIVE && syncSet.enabled, onWrite: () => remSync?.kick('write', 0) });
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
// 集中タスク（開いた縦）。見方・選択・もっと前の開閉は画面だけの状態（見方は保存）。
const FT = { sel: null, older: false, timer: 0, chain: Promise.resolve() };
function focusTaskBody() {
  return focusTasksHtml(viewData(), { view: state.taskView, sel: FT.sel, olderOpen: FT.older, selected: state.selected, pending: doneCtl.pending(), add: RM.data ? { draft: RM.add } : null, loading: !RM.err, error: RM.err, rl: listUi() });
}
function taskBody(where) {
  return tasksHtml(viewData(), { selected: state.selected, doneOpen: RM.doneOpen, histDays: RM.histDays, loading: !RM.err, error: RM.err, busyMore: RM.more, pending: doneCtl.pending(), add: RM.data ? { draft: RM.add } : null, rl: listUi() });
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
    if (RS.flash && RM.data) { const old = new Set(RM.data.reminders.map((x) => x.itemId)); for (const x of rows) if (!old.has(x.itemId)) x.fresh = true; RS.flash = false; setTimeout(() => { if (RM.data) { RM.data = { ...RM.data, reminders: RM.data.reminders.map(({ fresh, ...x }) => x) }; RM.sig = ''; render(); } }, 1000); }
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
remSync = createReminderSync({
  db, native: remNative,
  getSettings: () => (NATIVE ? syncSet : { ...syncSet, enabled: false }),
  setSettings: setSyncSettings,
  base: { get: () => parseLS(SYNC_BASE_KEY), set: (b) => { try { localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(b)); } catch { /* 無視 */ } } },
  onChange: () => { RM.mut++; RM.sig = ''; scheduleTasks(); },
  onNotice: (m) => { notice(m, null, 3000); document.querySelector('#native-toast')?.classList.add('rstoast'); say(m); },
  onEvent: (e) => { if (e.type === 'incoming') { RS.flash = true; notice('iPhone のリマインダーの変更を入れました', null, 3000); document.querySelector('#native-toast')?.classList.add('rstoast'); say('iPhone のリマインダーの変更を入れました。'); } },
});
window.__remSync = remSync;
// ---------- 第19版 PR10: タスクの画面（設定 › タスク・リストの部品・説明シート・確認の一覧・止まっている1行） ----------
// データの口は reminder-sync.js（D7）。ここは見え方と入口。同期オフ・Web・許可なしでは今までと同じ見た目で、リストの部品は出さない。
const syncOn = () => NATIVE && syncSet.enabled;
const DUO_COLOR = '#68716A';
const listColor = (l) => (/^#[0-9a-fA-F]{6}$/.test(l?.color || '') ? l.color : DUO_COLOR);
// 取り込み先として扱うリスト（Duo ＋ 選んだもの）。Duo は id 'duo'（書き出し先の本当の id とそろえて見せる）。
function rsLists() {
  const duo = RS.lists.find((l) => l.id === syncSet.duoListId) || RS.lists.find((l) => l.title === syncSet.duoListTitle && l.allowsModify !== false);
  const out = [{ id: 'duo', duo: true, realId: duo?.id || syncSet.duoListId || '', title: 'Duo', color: listColor(duo), allowsModify: true }];
  for (const id of syncSet.lists) { const l = RS.lists.find((x) => x.id === id); if (l && l.id !== duo?.id) out.push({ id: l.id, title: l.title, color: listColor(l), allowsModify: l.allowsModify !== false, shared: !!(l.shared || l.isShared) }); }
  return out;
}
function listUi() {
  const stalled = NATIVE && syncSet.everEnabled && (RS.perm === 'denied' || RS.perm === 'restricted');
  const active = syncOn() && RS.perm === 'granted';
  if (!active && !stalled) return null;
  const lists = active ? rsLists() : [];
  const sel = lists.some((l) => l.id === RS.chip) ? RS.chip : 'all';
  const dest = active ? lists.find((l) => l.id === addDestKey()) || lists[0] : null;
  return { active, stalled, lists, sel, multi: active && lists.length >= 2, dest, gone: NATIVE && syncSet.everEnabled };
}
// 追加先の候補（書けるもの）と、今の保存先（カプセルで選んだ → チップ → 設定 → Duo）
const addDestKey = () => {
  const ok = rsLists().filter((l) => l.allowsModify);
  const pick = [RM.add.listId, RS.chip !== 'all' ? RS.chip : '', syncSet.addTo === syncSet.duoListId ? 'duo' : syncSet.addTo];
  for (const k of pick) if (k && ok.some((l) => l.id === k)) return k;
  return 'duo';
};
const addDestId = () => { const l = rsLists().find((x) => x.id === addDestKey()); return !l || l.duo ? '' : l.id; };
// 表示用のデータ（削除待ちを除き、Duo リストを 'duo' にそろえ、チップで絞る）
function viewData() {
  if (!RM.data) return RM.data;
  const ids = delCtl.ids();
  let rows = ids.size ? RM.data.reminders.filter((x) => !ids.has(x.itemId)) : RM.data.reminders;
  const ui = listUi();
  if (!ui || !ui.active) return { ...RM.data, reminders: rows };
  if (syncSet.duoListId) rows = rows.map((r) => (r.listId === syncSet.duoListId ? { ...r, listId: 'duo' } : r));
  if (ui.sel !== 'all') rows = rows.filter((r) => r.listId === ui.sel);
  return { lists: ui.lists.map((l) => ({ id: l.id, color: l.color })), reminders: rows };
}
// 許可とリストの今の様子を読む。同期を使ったことがない（または設定を開いていない）ときは native を呼ばない。
async function refreshRs(force = false) {
  if (!NATIVE || (!syncSet.everEnabled && !force)) return;
  const before = JSON.stringify([RS.perm, RS.lists]);
  try { RS.perm = (await remNative.permission())?.status || 'denied'; } catch { RS.perm = 'unavailable'; }
  if (RS.perm === 'granted' && syncSet.enabled) { try { const r = await remNative.lists(); if (!r.unavailable) RS.lists = r.lists || []; } catch { /* 前のまま */ } }
  if (JSON.stringify([RS.perm, RS.lists]) !== before) { syncRsUi(); render(); }
}
const hhmm2 = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
// 設定 › タスク の同期の段
function syncRsUi() {
  const box = $('#m-rs');
  $('#m-rssub').textContent = NATIVE && RS.perm !== 'unavailable' ? (syncSet.enabled ? '同期オン' : '同期オフ') : '';
  const show = NATIVE && RS.perm !== 'unavailable';
  box.hidden = !show;
  if (!show) return;
  const on = syncSet.enabled && RS.perm !== 'denied' && RS.perm !== 'restricted';
  $('#m-rssw').setAttribute('aria-checked', String(on));
  const at = $('#m-rsat'); at.hidden = !(on && syncSet.syncedAt); at.textContent = syncSet.syncedAt ? `同期済み ${hhmm2(syncSet.syncedAt)}` : '';
  $('#m-rsdeny').hidden = on || !(RS.denied || (syncSet.everEnabled && (RS.perm === 'denied' || RS.perm === 'restricted')));
  const rson = $('#m-rson'); rson.hidden = !on;
  if (!on) return;
  const ls = rsLists(), dest = ls.find((l) => l.id === addDestKeySettings()) || ls[0];
  $('#m-rsdestv').innerHTML = `<i class="ldot" style="background:${esc(dest.color)}"></i>${esc(dest.title)}`;
  const duoReal = ls[0].realId;
  $('#m-rslists').innerHTML = RS.lists.map((l) => {
    const isDuo = l.id === duoReal || (!duoReal && l.title === syncSet.duoListTitle && ls[0].color === listColor(l));
    const chk = isDuo || syncSet.lists.includes(l.id);
    return `<button type="button" class="rslist${isDuo ? ' fixed' : ''}" role="checkbox" aria-checked="${chk}" data-rslist="${esc(l.id)}"${isDuo ? ' aria-disabled="true"' : ''}><i class="ldot" style="background:${esc(listColor(l))}"></i><span class="rsn">${esc(isDuo ? 'Duo' : l.title)}</span>${l.shared || l.isShared ? '<small>共有</small>' : ''}<b aria-hidden="true">${chk ? '✓' : ''}</b></button>`;
  }).join('');
}
const addDestKeySettings = () => { const ok = rsLists().filter((l) => l.allowsModify); return ok.some((l) => l.id === syncSet.addTo) ? syncSet.addTo : ok.some((l) => l.realId && l.realId === syncSet.addTo) ? 'duo' : 'duo'; };

// ---- シート（説明・確認の一覧・保存先の一覧・やめる確認）。1 つの dialog を中身で替える ----
const rsDlg = $('#rsheet');
function rsClose(restoreSwitch = true) {
  RS.sheet = null;
  if (rsDlg.open) rsDlg.close();
  syncInert();
  if (restoreSwitch && menuDlg.open) $('#m-rssw')?.focus({ preventScroll: true });
}
function rsPlace(kind) {
  const vh = window.innerHeight;
  // 設定が開いていればその枠、編集シートが開いていればその枠、どちらもなければ画面の幅いっぱい（開いた横は左ページ内）
  const open = menuDlg.open ? menuDlg : taskDlg.open ? taskDlg : null;
  let m = open ? open.getBoundingClientRect() : null;
  if (!m) { const S = safe(); const left = S.left + 8; let right = window.innerWidth - S.right - 8; if (layoutKind() === 'spread') right = Math.min(right, window.innerWidth / 2 - 10); m = { left, top: Math.max(S.top, 12) + (layoutKind() === 'open' ? 90 : 12), width: Math.max(200, right - left), bottom: vh - Math.max(S.bottom, 12) }; }
  const top = kind === 'explain' || kind === 'off' ? Math.max(m.top, Math.min(300, vh - 360)) : m.top;
  Object.assign(rsDlg.style, { left: `${m.left}px`, width: `${m.width}px`, top: `${top}px`, bottom: kind === 'explain' || kind === 'off' ? `${Math.max(12, vh - m.bottom)}px` : `${Math.max(12, vh - m.bottom)}px`, right: 'auto', margin: '0' });
  rsDlg.dataset.kind = kind;
}
const dueMini = (d) => (d?.date ? `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}${d.time ? ` ${d.time}` : ''}` : '');
function rsHtml() {
  const S = RS.sheet; if (!S) return '';
  const head = (t, x = true) => `<div class="rshead"><h2 id="rs-h">${esc(t)}</h2>${x ? '<button type="button" class="rsx" data-rs="close" aria-label="閉じる">✕</button>' : ''}</div>`;
  if (S.kind === 'explain') return `${head('iPhone のリマインダーと同期')}<div class="rsbody"><p>Duo のタスクを、リマインダーの「Duo」リストにも入れます。リマインダーで変えた分も Duo に入ります。</p><p>許可しなくても、タスクはこれまでどおり使えます。</p><p>内容は iPhone の外に送りません。</p></div><button type="button" class="primary rsmain" data-rs="continue"${S.busy ? ' disabled' : ''}>続ける</button>`;
  if (S.kind === 'off') return `${head('同期をやめますか？', false)}<div class="rsbody"><p>同期をやめても、Duo とリマインダーのタスクはどちらも消えません。</p></div><div class="rsacts"><button type="button" data-rs="close">キャンセル</button><button type="button" class="danger" data-rs="off">やめる</button></div>`;
  if (S.kind === 'dest') {
    const cur = S.cur;
    return `${head('保存先のリスト')}<div class="rspage" role="listbox" aria-label="保存先のリスト">${S.lists.map((l) => `<button type="button" class="rsrowp" role="option" aria-selected="${l.id === cur}" data-rs="pick" data-list="${esc(l.id)}"><i class="ldot" style="background:${esc(l.color)}"></i><span>${esc(l.title)}</span><b aria-hidden="true">${l.id === cur ? '✓' : ''}</b></button>`).join('')}</div>`;
  }
  if (S.kind === 'confirm') {
    const pv = S.pv, add = pv.toAdd, shown = add.slice(0, 4);
    const row = (t) => `<div class="rsrow40"><span class="rst">${esc(t.title)}</span><small>${esc(dueMini(t.due))}</small></div>`;
    const maybe = pv.maybe.map((m, i) => `<div class="rsmaybe"><div class="rsrow40"><span class="rst">${esc(m.task.title)}</span><small>${esc(dueMini(m.task.due))}</small></div><div class="rsseg" role="group" aria-label="${esc(m.task.title)}の扱い">${[['link', '結びつける'], ['keep', '両方残す'], ['skip', '入れない']].map(([k, t]) => `<button type="button" data-rs="choice" data-i="${i}" data-c="${k}" aria-pressed="${m.choice === k}">${t}</button>`).join('')}</div></div>`).join('');
    const done = S.result;
    const NEW = '__new', listRow = (id, t, c) => `<button type="button" class="rspk" role="radio" aria-checked="${S.prevId === id}" data-rs="prevlist" data-list="${esc(id)}"${S.busy ? ' disabled' : ''}>${c ? `<i class="ldot" style="background:${esc(c)}"></i>` : ''}<span class="rst">${esc(t)}</span></button>`;
    const prevSel = S.choose ? `<h3>以前の「Duo」リスト</h3><p class="rsmore">${S.cands.length >= 2 ? '「Duo」という名前のリストが複数あります。書き出し先を選んでください。' : '「Duo」リストが見つかりません。以前書き出したリストがあれば選んでください。'}</p><div role="radiogroup" aria-label="書き出し先のリスト">${S.cands.map((l) => listRow(l.id, l.title, l.color)).join('')}${listRow(NEW, '新しく「Duo」リストを作る')}</div>` : '';
    const pk = pv.pick || [];
    const pickHtml = pk.length ? `<h3>リマインダーにある件 ${pk.length}</h3><p class="rsmore">選んだ件だけ Duo に入ります。選ばない件はリマインダーに残ります。</p><button type="button" class="rslater" data-rs="pickall"${S.busy ? ' disabled' : ''}>${pk.every((x) => x.on) ? 'すべて外す' : 'すべて選ぶ'}</button>${pk.map((x, i) => `<button type="button" class="rspk" role="checkbox" aria-checked="${x.on}" data-rs="pickrem" data-i="${i}"${S.busy ? ' disabled' : ''}><span class="rst">${esc(String(x.rem.title ?? '').trim() || '（題名なし）')}</span><small>${esc(dueMini(x.rem.due))}</small></button>`).join('')}` : '';
    const needList = S.choose && S.cands.length >= 2 && !S.prevId;
    return `${head('iPhone のリマインダーと同期', !S.busy)}<div class="rsscroll">${prevSel}<h3>入れるタスク ${add.length}</h3>${shown.map(row).join('')}${add.length > 4 ? `<p class="rsmore">ほか ${add.length - 4}件</p>` : ''}${pv.maybe.length ? `<h3>同じものかもしれない ${pv.maybe.length}</h3>${maybe}` : ''}${pickHtml}</div>`
      + (done ? `<p class="rsdone" role="status">リマインダーに ${done.created}件入れました${done.errors ? `（入れられなかった ${done.errors}件）` : ''}</p><button type="button" class="primary rsmain" data-rs="close">閉じる</button>`
        : `<button type="button" class="primary rsmain" data-rs="apply"${S.busy || needList ? ' disabled' : ''}>入れる</button><button type="button" class="rslater" data-rs="later"${S.busy ? ' disabled' : ''}>あとで（設定 › タスク からやり直せる）</button>`);
  }
  return '';
}
function rsOpen(sheet, focusSel) {
  RS.sheet = sheet;
  rsPlace(sheet.kind);
  rsDlg.innerHTML = rsHtml();
  if (!rsDlg.open) { rsDlg.show(); syncInert(); }
  (rsDlg.querySelector(focusSel || '.rsmain, .rsrowp, button') || rsDlg).focus({ preventScroll: true });
}
const rsRepaint = (keepFocus) => { const a = document.activeElement?.dataset?.rs, i = document.activeElement?.dataset?.i, c = document.activeElement?.dataset?.c; rsDlg.innerHTML = rsHtml(); if (keepFocus && a) rsDlg.querySelector(`[data-rs="${a}"]${i ? `[data-i="${i}"][data-c="${c}"]` : ''}`)?.focus({ preventScroll: true }); };
// 選んだ（または 1 つに決まった）以前のリストの中身で確認の一覧を作り直す。読むだけ。
async function rsLoadPrev(S) {
  const list = S.prevId && S.prevId !== '__new' ? RS.lists.find((l) => l.id === S.prevId) : null;
  const rems = list ? ((await remNative.listReminders({ listIds: [list.id], completedSince: '1970-01-01T00:00' }))?.reminders || []) : [];
  if (RS.sheet !== S) return;
  S.pv = previewFirst(await db.listTasks(), rems, { declined: syncSet.declined });
}
rsDlg.addEventListener('cancel', (ev) => { ev.preventDefault(); if (!RS.sheet?.busy) rsClose(); });
rsDlg.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-rs]'); if (!b || !RS.sheet) return;
  const S = RS.sheet, k = b.dataset.rs;
  if (k === 'close') { if (!S.busy) rsClose(); return; }
  if (k === 'later') { rsClose(); return; }
  if (k === 'off') { setSyncSettings({ ...syncSet, enabled: false }); rsClose(false); syncRsUi(); render(); scheduleTasks(); say('同期をやめました。'); $('#m-rssw')?.focus({ preventScroll: true }); return; }
  if (k === 'choice') { S.pv.maybe[Number(b.dataset.i)].choice = b.dataset.c; rsRepaint(true); return; }
  if (k === 'pick') {
    const id = b.dataset.list; S.cur = id; rsRepaint(true);
    setTimeout(() => { if (RS.sheet !== S) return; rsClose(false); S.onPick(id); }, 150);
    return;
  }
  if (k === 'pickrem') { const x = S.pv.pick[Number(b.dataset.i)]; if (x) x.on = !x.on; rsRepaint(true); return; }
  if (k === 'pickall') { const all = S.pv.pick.every((x) => x.on); for (const x of S.pv.pick) x.on = !all; rsRepaint(true); return; }
  if (k === 'prevlist') {
    if (S.busy) return; S.prevId = b.dataset.list; S.busy = true; rsRepaint(true);
    try { await rsLoadPrev(S); } catch { S.pv = previewFirst(await db.listTasks(), [], { declined: syncSet.declined }); }
    if (RS.sheet !== S) return;
    S.busy = false; rsRepaint(true); return;
  }
  if (k === 'continue') {
    if (S.busy) return; S.busy = true; rsRepaint(true);
    let st;
    // OS に求めるのは notDetermined のときだけ（RS-1・RS-2）。granted は求めずに進み、denied・restricted は求めない。
    try { st = (await remNative.permission()).status; if (st === 'notDetermined') st = (await requestReminderPermission()).status; } catch { st = 'denied'; }
    if (RS.sheet !== S) return;
    RS.perm = st;
    if (st !== 'granted') { RS.denied = true; rsClose(false); syncRsUi(); render(); $('#m-rssw')?.focus({ preventScroll: true }); return; }
    RS.denied = false;
    // 以前の「Duo」リスト（題名がちょうど「Duo」で書けるもの）。1 つならそれ、2 つ以上は選んでもらう、0 なら選ぶか新しく作る（RS-49b）。選ぶまで書き込みはしない。
    S.cands = []; S.prevId = ''; S.choose = false; S.pv = previewFirst(await db.listTasks(), [], { declined: syncSet.declined });
    try {
      const ls = await remNative.lists(); RS.lists = ls.lists || [];
      const cands = prevListCandidates(RS.lists, syncSet.duoListTitle);
      S.cands = cands.length ? cands : RS.lists.filter((l) => l.allowsModify !== false);
      S.choose = cands.length !== 1 && S.cands.length > 0;
      S.prevId = cands.length === 1 ? cands[0].id : cands.length === 0 ? '__new' : '';
      if (cands.length === 0 && !S.cands.length) S.choose = false;
      await rsLoadPrev(S);
    } catch { /* 一覧が取れなければ、リマインダー側の件なしで進む */ }
    S.kind = 'confirm'; S.busy = false; rsPlace('confirm'); rsDlg.innerHTML = rsHtml(); rsDlg.querySelector('.rsmain')?.focus({ preventScroll: true });
    return;
  }
  if (k === 'apply') {
    if (S.busy) return; S.busy = true; rsRepaint(true);
    // ここまで書き込みは 0。オンにして、選んだ分を pending にし、同期を 1 回走らせる。
    // 書き出し先: 見分けた（選んだ）以前のリストをそのまま使う。同じ名前のリストを増やさない（RS-50b）。選ばなければ新しく作る。
    let dest = {};
    const pl = S.choose || S.prevId ? RS.lists.find((l) => l.id === S.prevId) : null;
    if (pl) dest = { duoListId: pl.id, duoSourceId: pl.sourceId || '', duoListTitle: String(pl.title).trim() || syncSet.duoListTitle };
    else if (S.choose && S.prevId === '__new' && S.cands.length >= 2) { try { const c = (await remNative.createReminderList({ title: syncSet.duoListTitle, sourceId: '' })).list; dest = { duoListId: c.id, duoSourceId: c.sourceId || '' }; } catch { /* あとの同期でもう一度 */ } }
    let res = null, dec = [];
    try {
      const ar = await applyFirst({ db, toAdd: S.pv.toAdd, maybe: S.pv.maybe, pick: S.pv.pick || [], base: remSync.base() });
      dec = ar.declined;
    } catch { res = null; }
    setSyncSettings({ ...syncSet, ...dest, enabled: true, everEnabled: true, declined: [...syncSet.declined, ...dec] });
    try { res = await remSync.sync('first'); } catch { res = null; }
    S.busy = false; S.result = { created: res?.created || 0, errors: res?.errors || 0 };
    RM.mut++; RM.sig = ''; scheduleTasks(); syncRsUi(); render();
    rsRepaint(false); rsDlg.querySelector('.rsmain')?.focus({ preventScroll: true });
    say(`リマインダーに ${S.result.created}件入れました。`);
  }
});
// 保存先の一覧を開く（target: 設定の追加先／追加欄のカプセル／タスクの移動）
function openDestPage(cur, onPick, only) {
  const lists = rsLists().filter((l) => l.allowsModify && (!only || only(l)));
  rsOpen({ kind: 'dest', lists, cur, onPick });
}
function scheduleTasks() { clearTimeout(RM.timer); RM.timer = setTimeout(loadTasks, 300); requestNotifySync('task'); } // タスクの追加・完了・削除・編集・復元はすべてここを通る
function renderPage(side, id) {
  const cls = side === 'left' ? 'lp' : 'rp';
  if (id === 'home') return `<section class="page ${cls}" data-page="home" aria-label="ホーム"><div class="rhead hh"><h2>ホーム</h2>${side === 'right' ? rctl() : ''}${side === 'left' ? `<div class="sctl">${gearBtn()}</div>` : ''}</div><div class="listpane">${listView('axis')}</div></section>`;
  if (id === 'month') return `<section class="page ${cls} calendar" data-page="month" aria-label="カレンダー">${shead(side)}${calendarBody('spread')}</section>`;
  if (id === 'time') return `<section class="page ${cls}" data-page="time">${dateHead(side, 'time')}${timeBody(side, paneWidth(side))}${timeMenu(side)}${miniMonth(side)}</section>`;
  if (id === 'memo') return `<section class="page ${cls}" data-page="memo">${noteHead(side)}${noteBody(side)}</section>`;
  return `<section class="page ${cls}" data-page="${id}">${dateHead(side, id)}${taskBody(side)}${miniMonth(side)}</section>`;
}
// 各ページの下の切替「月｜時間｜タスク｜メモ」（幅 240・高 46）。選んでいるページを押すと何も変えない。
const PAGE_LABELS = { home: 'ホーム', month: '月', time: '時間', task: 'タスク', memo: 'ノート' };
function pageSwitch(side) {
  return `<div class="pgsw ${side === 'left' ? 'pgl' : 'pgr'}" role="group" aria-label="${side === 'left' ? '左' : '右'}ページの種類">${PAGE_IDS.map((id, i) => `<button type="button" data-pick="${id}" data-side="${side}" aria-pressed="${!ttOn() && id === PG()[side]}" aria-description="${PAGE_IDS.length}個中${i + 1}番目"><span class="pill">${PAGE_LABELS[id]}</span></button>`).join('')}</div>`;
}
// ---------- 見開きの型「今日＋明日」（第18版 PR1）。左＝選択日、右＝その次の日。左右とも1日ページ ----------
// 開いた横（帯のタスク／メモで右ページを置き換えている間と貼り付け中は今の見開き）と、開いた縦（月・一覧のときだけ）で使う。
const ttOn = () => {
  if (state.spreadType !== 'tt') return false;
  const k = layoutKind();
  if (k === 'spread') return !state.strip && !PS.on;
  return k === 'open' && isPortrait() && fmode() === 'calendar' && !listShown() && !PS.on;
};
const TT = { top: 0, init: false, drag: null }; // top: 左右共通の時間軸のスクロール位置
const TT_HEAD = 82, TT_GRIP = 24, TT_NOTE_MIN = 120, TT_TIME_MIN = 160, TT_LIST_ROW = 32;
const ttSplitMax = () => Math.max(64, ttPageH - TT_HEAD - TT_GRIP - TT_NOTE_MIN);
const ttSplitNow = () => Math.min(ttSplitMax(), Math.max(64, state.ttSplit));
// 予定欄が 160 未満のときの一覧（1件 32）。終日が先、あとは開始順。
function ttList(k) {
  const list = eventsOnDay(occIn(k, k), k).sort((a, b) => (b.all ? 1 : 0) - (a.all ? 1 : 0) || String(a.start).localeCompare(String(b.start)));
  const rows = list.map((e) => {
    const t = e.all || dayOf(e.start) !== k ? '終日' : e.start.slice(11);
    return `<button type="button" class="agrow dlrow ${catCls(e)}"${catSty(e)} role="listitem" data-event="${esc(e.id)}" data-sday="${k}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><span class="agt">${t}</span><i class="agbar" aria-hidden="true"></i><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
  }).join('');
  return `<div class="dlist" data-scroll="dlist" data-pane="${k}" role="list" aria-label="${esc(dayLabel(k))}の予定">${rows || '<p class="dnone">予定はありません</p>'}</div>`;
}
// 1日ページ。縦の寸法（見出し82・予定欄・つまみ24・ノート）は左右で同じ。ノート欄の行の y は CSS の整数 px。
// 見るだけのノートの行（記号は出さない）。書式は notes-ui の本文と同じ data-k の描き方。
function richHtml(vs, tag = 'span') { return vs.map((v) => `<${tag} class="nl" data-k="${v.kind}"${v.kind === 'check' ? ` data-c="${v.checked ? 1 : 0}"` : ''}>${esc(v.text)}</${tag}>`).join(''); }
function dayPage(side, k, portrait = false) {
  const body = !portrait && ttSplitNow() < TT_TIME_MIN ? ttList(k) : timelineHtml([k], Math.max(0, (portrait ? safeW() : paneWidth(side)) - 80), side, 60);
  const first = NB.first.get(k), n = NB.marks.get(k) || 0;
  // 第19.1版 S3（M-06）: ノートが無い日は 1行目に「この日のノートを書く」（たたくとシートが開いて消える）。記号は出さず行の種類で描く。
  const note = `<button type="button" class="dnote" data-act="daynote" data-day="${k}" aria-label="${esc(dayLabel(k))}のノート${n ? `${n}件を開く` : 'を書く'}"><span class="dnt">${first ? richHtml(richLines(first), 'div') : '<span class="dnt-ph">この日のノートを書く</span>'}</span></button>`;
  const grip = portrait ? '' : `<div class="dgrip" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="予定とノートの境目" aria-valuemin="64" aria-valuemax="${ttSplitMax()}" aria-valuenow="${ttSplitNow()}"><i aria-hidden="true"></i></div>`;
  return `<section class="page ${side === 'left' ? 'lp' : 'rp'} dpage" data-page="day" data-day="${k}" aria-label="${esc(dayLabel(k))}"><div class="dph"><h2 class="dd"><span class="hdt${isRed(k) ? ' hol' : ''}">${dayLabel(k)}</span>${holSpan(k)}</h2>${rkSpan(k, 'drk')}</div><div class="dev">${body}</div>${grip}${note}</section>`;
}
// めくりのページの絵（第18版 PR3）。めくり（js/curl/index.js、PR4）がここから呼ぶ。テスト用に window.__duoPainter.get() で取れる。
let ttPaint = null, ttCurl = null; // ttCurl: めくりの制御（第18版 PR4。swipe の定義の下で作る）
const ttPainter = () => (ttPaint ||= createPainter({
  shell: () => root.querySelector('.shell.spread.tt'), dayHtml: (side, k) => dayPage(side, k),
  selected: () => state.selected, addDays, scrollTop: () => TT.top, afterMount: (host) => updateNow(host), colors: curlColors(),
}));
window.__duoPainter = { get: ttPainter };
const ttStyle = () => ` style="--tt-split:${ttSplitNow()}px"`;
function spread() {
  if (ttOn()) return `<div class="shell spread tt${POS.band ? ' band' : ' fb'}"${ttStyle()}>${dayPage('left', state.selected)}${dayPage('right', addDays(state.selected, 1))}${ctl()}${pageSwitch('left')}${pageSwitch('right')}</div>`;
  return `<div class="shell spread${POS.band ? ' band' : ' fb'}">${renderPage('left', PG().left)}${renderPage('right', PG().right)}${ctl()}${pageSwitch('left')}${pageSwitch('right')}</div>`;
}
// 時間軸: 初回／選択日の変更で「今の1時間前」へ。現在時刻の線は毎分更新。
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
function updateNow(scope = root) {
  scope.querySelectorAll('.tlin').forEach((inner) => {
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
  const dts = [...root.querySelectorAll('.dpage .tl')]; // 今日＋明日: 左右共通のスクロール位置（日を送っても保つ）
  if (dts.length) { if (!TT.init) { TT.init = true; TT.top = Math.max(0, nowMin() - 60); } dts.forEach((t) => { t.scrollTop = TT.top; }); } else TT.init = false;
  tls.forEach((tl) => {
    if (tl.closest('.dpage, .mday')) return;
    const pane = paneOf(tl), T = TLP[pane];
    const key = `${layoutKind()}|${state.view}|${state.home}|${PG().left}|${PG().right}|${state.selected}|${state.timeMode[pane]}|${pane === 'bottom' ? state.pages.portraitBottom : ''}`;
    if (key !== T.key) { T.key = key; tl.scrollTop = pane === 'closed' && VIEWTOP.toClosed && VIEWTOP.min != null ? TL_PAD + VIEWTOP.min * T.hh / 60 : Math.max(0, nowMin() - 60) * T.hh / 60; }
  });
  updateNow();
}
// 倍率の変更。中心の時刻（画面上の位置 cy）を固定する。
function setHh(next, cy, tlEl) {
  const tl = tlEl || firstTl();
  if (!tl || tl.closest('.dpage, .mday')) return; // 今日＋明日の時間軸は 1時間 60 で固定
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
  if (!tl || tl.closest('.dpage, .mday')) return;
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
const colOf = (pane, day) => (pane === 'fold' ? [...root.querySelectorAll('.fl.ft .tlcol')] : [...root.querySelectorAll(`.tl[data-pane="${pane}"] .tlcol`)]).find((c) => c.dataset.day === day) || null;
const hhOf = (pane) => (pane === 'fold' ? FOLD_HH : ttOn() ? 60 : TLP[pane]?.hh ?? 60);
// 開いた縦（fold）は2つの窓。指の高さを紙の時刻へ（折り目の間は境の時刻で止まる）
const minAtY = (y, col, pane) => (pane === 'fold' ? Math.min(1440, Math.max(0, snap15(rawMinutesAt(FD.g, FD.s, y)))) : minutesAt(y, col.getBoundingClientRect().top, TL_PAD, hhOf(pane)));
function paintDraft() {
  root.querySelectorAll('.dbox, .dtag').forEach((n) => n.remove());
  if (!DF.mode) return;
  const col = colOf(DF.pane, DF.day);
  if (!col) { if (DF.mode !== 'sheet') DF.mode = null; return; }
  const cat = resolveCategory(lastCatOk(), state.categories);
  const box = document.createElement('div');
  box.className = 'dbox'; box.dataset.mode = DF.mode;
  box.setAttribute('style', `${colorVars(cat.color)}--m:${DF.start};--d:${DF.end - DF.start}`);
  box.innerHTML = `<b class="dt">新しい予定</b><span class="ds">${spanText(DF)}</span>${DF.mode === 'temp' ? '<i class="hdl hdl-s" data-h="start"></i><i class="hdl hdl-e" data-h="end"></i><button type="button" class="dx" aria-label="仮の枠を取り消す">✕</button>' + DRAFT_ACTIONS.map(([k, l]) => `<button type="button" class="vh" data-nudge="${k}">${l}</button>`).join('') : ''}`;
  if ((DF.end - DF.start) * hhOf(DF.pane) / 60 < 60) box.dataset.short = '';
  if (DF.mode === 'temp') {
    box.tabIndex = 0; box.setAttribute('role', 'group'); box.setAttribute('aria-label', `新しい予定の仮枠 ${spanText(DF)}`);
  }
  if (DF.pane === 'fold') { // 開いた縦: 2つの窓の紙に同じ枠を置き、札は時刻の列（窓ごと）へ。位置は foldLayout が決める
    const cols = [...root.querySelectorAll('.fold .tlcol')].filter((c) => c.dataset.day === DF.day);
    cols.forEach((c, i) => { const b2 = i ? box.cloneNode(true) : box; if (i) b2.setAttribute('aria-hidden', 'true'); c.append(b2); });
    root.querySelectorAll('.fold .fllab').forEach((lab, i) => [['s', DF.start], ['e', DF.end]].forEach(([k, m]) => {
      const t = document.createElement('span'); t.className = `dtag dtag-${k}`; t.textContent = hmText(m); t.dataset.fm = String(m); t.dataset.fw = String(i); lab.append(t);
    }));
    foldLayout();
    return;
  }
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
// VoiceOver のカスタム操作（仮枠）。15分単位で動かす／長さを変える。
function nudgeDraft(kind) {
  if (DF.mode !== 'temp') return;
  const r = kind === 'earlier' ? moveBox(DF, DF.start - 15) : kind === 'later' ? moveBox(DF, DF.start + 15)
    : kind === 'longer' ? moveHandle(DF, 'end', DF.end + 15) : moveHandle(DF, 'end', DF.end - 15);
  if (r.start === DF.start && r.end === DF.end) return;
  Object.assign(DF, r); paintDraft(); feel('light');
  const nb = root.querySelector(`.dbox [data-nudge="${kind}"]`) || root.querySelector('.dbox');
  nb?.focus({ preventScroll: true });
}
const DRAFT_ACTIONS = [['earlier', '15分早く'], ['later', '15分遅く'], ['longer', '15分長く'], ['shorter', '15分短く']];
function clearDraftBox() { if (!DF.mode) return; DF.mode = null; paintDraft(); }
function openDraft() {
  const { day, start, end } = DF;
  DF.mode = 'sheet'; paintDraft();
  openEditor(null, root.querySelector('[data-act="add"]'), day, start, { endMin: end, direct: true });
}
root.addEventListener('keydown', (ev) => {
  if (DF.mode !== 'temp' || !ev.target.classList?.contains('dbox')) return;
  const k = { ArrowUp: ev.shiftKey ? 'shorter' : 'earlier', ArrowDown: ev.shiftKey ? 'longer' : 'later' }[ev.key];
  if (k) { ev.preventDefault(); nudgeDraft(k); }
});
// 空きタップ: 1回目＝その時刻（15分刻み）から1時間の仮枠、枠の上の2回目＝編集シート、枠の外＝枠を消す。
function tlTap(ev, col) {
  if (performance.now() < TLQ.quiet) return;
  const hd = ev.target.closest('.hdl');
  if (hd) { // 丸の中心から16pt 以内は取っ手（たたきは無視）、内側は枠本体のたたき
    const bb = hd.closest('.dbox')?.getBoundingClientRect();
    if (!bb || hitDraftPart(bb.height, ev.clientY - bb.top) !== 'move') return;
    openDraft(); return;
  }
  if (DF.mode === 'temp') { if (ev.target.closest('.dbox')) openDraft(); else clearDraftBox(); return; }
  if (DF.mode) return;
  const pane = col.closest('.fl') ? 'fold' : paneOf(col.closest('.tl'));
  Object.assign(DF, { mode: 'temp', day: col.dataset.day, pane }, tapRange(minAtY(ev.clientY, col, pane)));
  paintDraft();
}
// 仮枠の本体（取っ手の外側）を押したまま上下に引くと、同じ日の中で枠ごと動く（15分刻み）。8pt 以下の動きはたたき（click→openDraft）。
const BOXMOVE_SLOP = 8, BOXMOVE_EDGE = 48;
const BM = { on: false, id: 0, y0: 0, raw0: 0, r0: null, moved: false };
const rawAt = (y, col, pane) => (pane === 'fold' ? rawMinutesAt(FD.g, FD.s, y) : ((y - col.getBoundingClientRect().top - TL_PAD) / hhOf(pane)) * 60);
function boxMoveRecalc(y) {
  const col = colOf(DF.pane, DF.day); if (!col) return;
  const r = moveBox(BM.r0, BM.r0.start + rawAt(y, col, DF.pane) - BM.raw0);
  if (r.start !== DF.start || r.end !== DF.end) { Object.assign(DF, r); paintDraft(); feel('light'); }
}
function startBoxMove(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  const col = colOf(DF.pane, DF.day); if (!col || BM.on) return;
  ev.preventDefault();
  const id = ev.pointerId;
  Object.assign(BM, { on: true, id, y0: ev.clientY, raw0: rawAt(ev.clientY, col, DF.pane), r0: { start: DF.start, end: DF.end }, moved: false });
  EG.y = ev.clientY;
  const mv = (e) => {
    if (e.pointerId !== id || DF.mode !== 'temp') return;
    EG.y = e.clientY;
    if (!BM.moved) { if (Math.abs(e.clientY - BM.y0) <= BOXMOVE_SLOP) return; BM.moved = true; EG.carry = 0; EG.tl = null; EG.origin = { kind: 'boxmove' }; edgeLoop.start(); }
    if (e.cancelable) e.preventDefault();
    boxMoveRecalc(e.clientY);
  };
  const done = (e) => {
    if (e.pointerId !== id) return;
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
    if (BM.moved) { edgeLoop.stop(); EG.tl = null; EG.carry = 0; EG.origin = null; TLQ.quiet = performance.now() + 400; }
    BM.on = false; BM.moved = false;
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
}
// 仮枠の取っ手（見た目12・押せる範囲44）。押してすぐ動かし、離したあとの click は抑止する。
root.addEventListener('pointerdown', (ev) => {
  if (DF.mode !== 'temp') return;
  if (ev.target.closest?.('.dx, [data-nudge]')) return;
  let h = ev.target.closest?.('.hdl');
  if (h) { // 丸の中心から16pt より内側は移動
    const bb = ev.target.closest('.dbox').getBoundingClientRect();
    const part = hitDraftPart(bb.height, ev.clientY - bb.top);
    if (part === 'move') h = null; else if (part) h = root.querySelector(`.dbox .hdl-${part === 'start' ? 's' : 'e'}`);
  }
  if (!h) { if (ev.target.closest?.('.dbox')) startBoxMove(ev); return; }
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
let renderRev = 0; // 描き直し番号（iOS のめくり B が、撮った絵を使い回してよいかを見る）
// 第19版 PR5（design/28）: 選んでいるタブは閉じた画面と開いた縦で共通に覚える。state.home は「null＝まだ選んでいない」を
// 閉じた画面ではホーム、開いた縦では月と読むので、姿勢が変わる瞬間に今見ているタブへ確定させる（開いた横は変えない）。
function syncTabAcrossPosture(kind, fam) {
  if (!lastKind || fam(lastKind) === fam(kind) || state.home !== null) return;
  const wasPortrait = document.body.dataset.posture === 'portrait';
  if (lastKind === 'home' && kind === 'open' && L.h >= L.w) { state.home = true; saveUi(); }
  else if (lastKind === 'open' && wasPortrait && fam(kind) === 'closed') { state.home = false; saveUi(); }
}
function render() {
  if (noteComposing) { renderPending = true; return; } // IME 変換中は入力欄を作り直さない
  renderRev++;
  ensurePasteMonth();
  const fam = (k) => (k === 'home' || k === 'browse' ? 'closed' : k);
  syncTabAcrossPosture(layoutKind(), fam);
  const kind = layoutKind(), prevKind = lastKind;
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
  const noteKeep = noteKeepOf(ma);
  const ra = document.activeElement;
  const remKeep = ra && ra.matches?.('input.remin') ? { s: ra.selectionStart, e: ra.selectionEnd } : null;
  const fa = document.activeElement, ftKeep = fa && fa.matches?.('[data-ft]') && fa.closest('.ftcard') ? { k: fa.dataset.ft, v: fa.value, s: fa.selectionStart, e: fa.selectionEnd } : null;
  const keepScrolls = captureScrolls();
  const remNode = root.querySelector('input.remin'); // 入力欄は一覧の再描画で作り直さず、同じノードを戻す
  rendering = true;
  root.innerHTML = { home: () => closed('home'), browse: () => closed('browse'), open, desk, spread }[kind]();
  rendering = false;
  if (remNode) { const nn = root.querySelector('input.remin'); if (nn && nn !== remNode) { nn.replaceWith(remNode); remNode.readOnly = !!RM.add.busy; } }
  fillNotes(noteKeep);
  fillAdd(remKeep);
  if (ftKeep) { const n = root.querySelector(`.ftcard [data-ft="${ftKeep.k}"]`); if (n && !n.disabled) { if (ftKeep.k === 'title' || ftKeep.k === 'notes') n.value = ftKeep.v; n.focus({ preventScroll: true }); try { if (ftKeep.s != null) n.setSelectionRange(ftKeep.s, ftKeep.e); } catch { /* date/time は無視 */ } } }
  lastKind = kind;
  root.querySelectorAll('[data-scroll]').forEach((el) => { el.scrollTop = scrolls[`${kind}:${el.dataset.scroll}${el.dataset.pane || ''}`] || 0; });
  restoreScrolls(keepScrolls);
  // 月を引く画面: 日の部分のスクロール位置は閉じた画面と開いた縦で共通に覚える（姿勢が変わったときだけ共通の値へ）
  { // 月を引く画面: スクロール位置は閉じた画面と開いた縦で共通に覚える（日の部分のずれ MP.scroll と、閉じた画面の全体の位置 MP.cs）
    const pk = pullKind(), c0 = PULL_CFG.browse[state.monthForm], gb = c0.rows * c0.h + 24;
    if (prevKind && prevKind !== kind) {
      if (pk === 'portrait') { const md = root.querySelector('.mday'); if (md) md.scrollTop = MP.scroll; }
      else if (pk === 'browse') { const mp = root.querySelector('.mpull'); if (mp) { MP.cs = MP.scroll > 0 ? gb + MP.scroll : Math.min(MP.cs, gb); mp.scrollTop = MP.cs; } }
    }
    if (pk === 'browse') paintMpScroll(root.querySelector('.mpull'));
  }
  restoreAll(anchor);
  measureMonthPane();
  if (prevKind && fam(prevKind) !== fam(kind)) { FD.carry = true; VIEWTOP.toClosed = true; } // 閉じた画面⇔開いた縦: いちばん上の時刻を引き継ぐ
  initTimeline();
  initFold();
  VIEWTOP.toClosed = false;
  paintDraft();
  paintRange();
  applyPasteInert();
  if (focusKey && !document.activeElement?.matches?.('input.remin')) { // 入力欄へ送ったフォーカスは取り戻さない
    const [t, v] = focusKey.split(/:(.*)/);
    const sel = { act: `[data-act="${v}"]`, view: `[data-view="${v}"]`, mode: `[data-mode="${v}"]`, date: `[data-date="${v}"]` }[t];
    root.querySelector(sel)?.focus({ preventScroll: true });
  }
  syncExt();
  applyKbLayout();
  ttCurl?.sync(); // 寸法が変わった・今日＋明日でなくなった：めくりを止めて絵と canvas を捨てる（めくり中の再描画では何もしない）
}

// ---------- 操作 ----------
function move(n, pane) {
  const k = state.selected;
  if (ttOn()) { set({ selected: addDays(k, n * 2) }); return; } // 今日＋明日は2日ずつ
  if (pane && layoutKind() === 'spread' && PG()[pane] !== 'month') { set({ selected: addDays(k, n * (PG()[pane] === 'time' ? tlStep(pane) : 1)) }); return; }
  if (pullOn() && !pane) { MP.anchor = ''; set({ selected: state.monthForm === 'month' ? addMonths(k, n) : addDays(k, 7 * n) }); return; }
  set({ selected: viewNow() === 'month' ? addMonths(k, n) : addDays(k, n * (viewNow() === 'week' ? 7 : 1)) });
}
// 見開きの型の切替（帯のボタン）。選んでいる日は変えない。帯のタスク／メモで置き換えていた右ページは元へ戻す。
function setSpreadType(t) {
  TLM.open = null; MM.open = null;
  set({ spreadType: normSpreadType(t), strip: null });
  say(ttOn() ? `今日と明日の見開きにしました。${dayLabel(state.selected)}と${dayLabel(addDays(state.selected, 1))}。` : '左右のページの見開きに戻しました。');
}
// 1日ページのノート欄をたたく: 帯の「ノート」と同じく右ページをノートにして、第17版の「この日のノート」の規則（0件=新規、1件=開く、複数=絞った一覧）で開く。
async function ttOpenNote(day, btn) {
  // 第19版 PR9: 1日ページのノート欄をたたくと、そのページの上にノートのシートが下から出る（design/27 §2）。複数あるときは今までどおり一覧。
  if (!day || NB.blocked || dayNoteBusy || NB.sheet || sheetBusy || curlBusyNow()) return;
  let all; try { all = await db.listNotes(); } catch { say('ノートを読み込めませんでした。'); return; }
  const occ = dateOccupants(all, day, null);
  if (occ.length > 1) {
    if (layoutKind() === 'spread') set({ strip: 'memo', lastSide: 'right' }); else showNotePage();
    await openDayNote(day); return;
  }
  const r = btn?.getBoundingClientRect?.();
  const side = r && r.width && (r.left + r.right) / 2 > L.w / 2 ? 'right' : 'left';
  await openNoteSheet(occ.length === 1 ? occ[0].id : null, day, side);
}
// ---------- ノートのシート（第19版 PR9、design/27 §2・§8）。常設のエディタ（NB.ed）を下から出るシートに置く ----------
let sheetBusy = false;
const curlBusyNow = () => !!ttCurl?.busy?.();
const SHEET_EL = (() => { const d = document.createElement('div'); d.className = 'nsheet'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'ノート'); d.hidden = true; document.body.append(d); return d; })();
// 位置・帯・本文の窓（design/27 §2.1〜§2.3）。シートの下端は kbTop（書式のシートが出ている間は開く前の kbTop に止める）。
function sheetGeometry(side) {
  const W = L.w, H = L.h, kind = layoutKind();
  const kbT = kbTopOf(window.visualViewport, window.innerHeight);
  let bottom = NB.sheet?.fs != null ? NB.sheet.fs : (de.dataset.kb && kbT !== null ? kbT : H);
  bottom = Math.min(bottom, H);
  const g = { x: 0, y: 152, w: W, pl: 12, pr: 12, bml: 12, bmr: Math.max(0, W - 20 - 342 - 8), kind };
  if (kind === 'spread') {
    const pw = (W - 20) / 2 - 8; // 左ページ（457.5）
    if (side === 'left') Object.assign(g, { x: 8, y: 64, w: pw, pl: 12, pr: 9.5, bml: 8, bmr: 8 });
    else { const rw = pw - 92; Object.assign(g, { x: W / 2 + 10, y: 64, w: W - (W / 2 + 10), pl: 12, pr: 12, bml: 8, bmr: Math.max(0, (W - (W / 2 + 10)) - 16 - (rw - 32) - 8) }); }
  } else if (kind === 'open') {
    const y = 130; const gy0 = cssPx('--groove-y0', 467);
    Object.assign(g, { x: 0, y, w: W, pl: 16, pr: 16, bml: 20, bmr: 20 });
    g.bottom = Math.min(bottom, gy0);
  }
  g.bottom ??= bottom;
  return g;
}
function placeNoteSheet() {
  if (!NB.sheet) return;
  const g = sheetGeometry(NB.sheet.side), st = SHEET_EL.style;
  st.left = `${g.x}px`; st.top = `${g.y}px`; st.width = `${g.w}px`; st.height = `${Math.max(120, g.bottom - g.y)}px`;
  st.setProperty('--ns-pl', `${g.pl}px`); st.setProperty('--ns-pr', `${g.pr}px`); st.setProperty('--ns-bml', `${g.bml}px`); st.setProperty('--ns-bmr', `${g.bmr}px`);
  st.setProperty('--ns-pb', de.dataset.kb && kbTopOf(window.visualViewport, window.innerHeight) !== null ? '8px' : '0px'); // キーボードが出ているとき本文の窓の下端は kbTop の 8 上（20 §3）
  SHEET_EL.dataset.kind = g.kind; SHEET_EL.dataset.side = NB.sheet.side;
  const fs = NB.ed?.fsheetEl; if (fs) { fs.style.setProperty('--ns-x', `${g.x}px`); fs.style.setProperty('--ns-w', `${g.w}px`); }
}
async function openNoteSheet(id, day, side) {
  sheetBusy = true;
  try {
    if (NB.ed && NB.cur) { const ok = await NB.ed.leave(); if (ok === false) return; NB.cur = null; NB.dp = null; }
    const fresh = id == null;
    if (fresh) id = await createDayNote(day);
    const ed = noteEditor();
    NB.sheet = { id, day, side, fs: null };
    SHEET_EL.hidden = false; SHEET_EL.classList.remove('closing'); SHEET_EL.append(ed.el);
    placeNoteSheet();
    render(); // 週の帯・ノート欄の描き直し（シートの外はそのまま見える）
    await ed.open(id);
    if (fresh) { ed.bodyEl.focus({ preventScroll: true }); const n = ed.bodyEl.value.length; ed.bodyEl.setSelectionRange(n, n); }
    say('ノートを開きました。');
  } finally { sheetBusy = false; }
}
async function closeNoteSheet() {
  const sh = NB.sheet; if (!sh) return true;
  const ed = NB.ed;
  if (ed) { ed.closeFs?.(false); const ok = await ed.leave(); if (ok === false) return false; }
  NB.sheet = null;
  SHEET_EL.classList.add('closing');
  const fin = () => { if (NB.sheet) return; SHEET_EL.hidden = true; SHEET_EL.classList.remove('closing'); if (ed && SHEET_EL.contains(ed.el)) ed.el.remove(); };
  setTimeout(fin, reduced() ? 150 : 250);
  invalidateNoteList(); NB.cur = null; render();
  document.activeElement?.blur?.();
  return true;
}
// 見開きの切替。左右で同じ種類になるときは入れ替わる。最後に触ったページを記録（＋の行き先）。
function pickPage(side, id) {
  const before = state.pages, next = selectPage(before, side, id);
  TLM.open = null; MM.open = null;
  set({ pages: next, lastSide: side, ...(ttOn() ? { spreadType: 'pages' } : {}) }); // 今日＋明日から下のタブで種類を選んだら、左右の見開きへ
  const swapped = before[side] !== id && before[side === 'left' ? 'right' : 'left'] === id;
  say(`${side === 'left' ? '左' : '右'}ページを${PAGE_LABELS[id]}にしました。${swapped ? `${side === 'left' ? '右' : '左'}ページは${PAGE_LABELS[next[side === 'left' ? 'right' : 'left']]}になりました。` : ''}`);
}
// ＋の行き先: 見開きでは最後に触ったページに合わせる。月・時間は予定、タスク・メモは入力の接続（後続の版）まで案内のみ。
// 集中モードの切替。保存して、押したボタンへフォーカスを戻す。カレンダーの月・日付・全表示・下の段は触らない。
function setFocusMode(m) {
  m = normFocusMode(m);
  if (layoutKind() !== 'open' || !isPortrait() || m === state.focusMode) return;
  TLM.open = null; MM.open = null;
  set({ focusMode: m });
  root.querySelector(`[data-fmode="${m}"]`)?.focus({ preventScroll: true });
  say(`${FOCUS_LABELS[m]}にしました。`);
}
function addFromHere(b) {
  const fm = fmode();
  const id = fm === 'task' ? 'task' : fm === 'note' ? 'memo' : state.strip && layoutKind() !== 'spread' ? state.strip : layoutKind() === 'spread' ? PG()[state.lastSide] : panelOn() ? state.pages.portraitBottom : 'month';
  if (id === 'memo') { noteNew(); say('新しいノートを書けます。'); return; }
  if (id === 'task') { if (RM.data) { openAdd(); say('タスクを入力できます。'); } else say('タスクを読み込んでいます。'); return; }
  openEditor(null, b);
}
// 右の帯のタスク／メモ（DP-3）。閉じた画面は全面、見開きは右ページを一時的に置き換える（保存した pages は変えない）。
const STRIP = { tip: null, swallow: 0 };
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
  if (state.strip === id) { // もう一度: 元へ戻す
    set({ strip: null });
    say(kind === 'spread' ? `${name}を閉じました。右ページは${PAGE_LABELS[state.pages.right]}です。` : `${name}を閉じました。`);
    return;
  }
  if (kind === 'spread') {
    const p = state.pages;
    if (p.left === id || (p.right === id && !state.strip)) { const side = p.left === id ? 'left' : 'right'; flashPage(side); say(`${side === 'left' ? '左' : '右'}ページがすでに${name}です。`); return; }
  }
  set({ strip: id, ...(kind === 'spread' ? { lastSide: 'right' } : {}) });
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
    tip.className = 'stip'; tip.setAttribute('aria-hidden', 'true'); tip.textContent = b.dataset.strip === 'task' ? 'タスク' : 'ノート';
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
  if (DF.mode === 'temp' && ev.target.closest('.dbox button')) { // ✕・VoiceOver の15分操作
    if (performance.now() < TLQ.quiet) return;
    const nb = ev.target.closest('[data-nudge]');
    if (nb) nudgeDraft(nb.dataset.nudge); else clearDraftBox();
    return;
  }
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
  if (d.fmode) { setFocusMode(d.fmode); return; }
  if (d.view) set({ view: d.view, home: false });
  else if (d.act === 'list') set({ home: true });
  else if (d.pv) pvGo(d.pv);
  else if (d.act === 'homego') homeGo2(d, b);
  else if (d.act === 'tview') { set({ taskView: normTaskView(d.v) }); root.querySelector(`[data-act="tview"][data-v="${d.v}"]`)?.focus({ preventScroll: true }); }
  else if (d.act === 'ftolder') { FT.older = true; render(); }
  else if (d.act === 'ftdue') { const a = RM.add, t = new Date(); if (d.d === 'tomorrow') t.setDate(t.getDate() + 1); a.due = d.d === 'none' ? null : dkey(t); a.time = ''; a.pop = null; a.focus = true; render(); }
  else if (d.act === 'ftdel') { ftFlush(); FT.sel = null; deleteTask(d.id); render(); }
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
  else if (d.act === 'lchip') { RS.chip = d.list; render(); root.querySelector(`[data-act="lchip"][data-list="${d.list}"]`)?.focus({ preventScroll: true }); }
  else if (d.act === 'remdest') { openDestPage(addDestKey(), (id) => { RM.add.listId = id; RM.add.focus = true; render(); }); }
  else if (d.act === 'stalled') { openMenu(); showMenuScreen('reminders', true); }
  else if (d.act === 'remwait') { notice('次に開いたときに、もう一度リマインダーへ送ります。', null, 3000); }
  else if (d.act === 'remdone') { RM.doneOpen = !RM.doneOpen; render(); root.querySelector('[data-act="remdone"]')?.focus({ preventScroll: true }); }
  else if (d.act === 'remmore') { RM.histDays += HIST_DAYS; RM.more = true; render(); root.querySelector('[data-act="remmore"]')?.focus({ preventScroll: true }); loadTasks(); }
  else if (d.date && b.closest('.pvwk')) { set({ selected: d.date, view: 'day', home: false }); say(`${dayLabel(d.date)}を日表示で開きました。`); } // 今週の帯のマス → 日タブのその日
  else if (d.jump && b.closest('.pvwk')) { set({ selected: d.jump, view: 'day', home: false }); }
  else if (d.date) {
    const compact = !pullOn() && (['home', 'browse'].includes(layoutKind()) || (isPortrait() && !panelOn()));
    // 閉じた画面・開いた縦では選択日サイド（一覧）が無いので、日付選択でその日の日表示へ進む。
    set(compact && state.view === 'month' ? { selected: d.date, view: 'day' } : { selected: d.date });
    if (!compact && layoutKind() === 'spread' && PG().left === 'month' && PG().right === 'memo') filterNotesByDay(d.date); // 左の月の日で右のノート一覧を絞る
  } else if (d.jump) set(pullOn() ? { selected: d.jump } : { selected: d.jump, view: 'day' });
  else if (d.act === 'mptoday') { MP.anchor = ''; set({ selected: todayKey() }); }
  else if (d.mday) { set({ monthDay: d.mday }); root.querySelector(`[data-mday="${d.mday}"]`)?.focus({ preventScroll: true }); }
  else if (d.event) openEditor(d.event, b);
  else if (d.new) openEditor(null, b, d.new);
  else if (d.act === 'add') addFromHere(b);
  else if (d.act === 'pnltoggle') setPanel(!state.pages.portraitShown);
  else if (d.act === 'spreadtype') setSpreadType(ttOn() ? 'pages' : 'tt');
  else if (d.act === 'daynote') ttOpenNote(d.day, b);
  else if (d.act === 'pnlhide') setPanel(false);
  else if (d.act === 'pnlgrip') { if (performance.now() >= PN.swallow) setPanel(false); }
  else if (d.pnl) pickBottom(d.pnl);
  else if (d.act === 'strip') { if (STRIP.swallow && performance.now() < STRIP.swallow) { STRIP.swallow = 0; return; } STRIP.swallow = 0; toggleStrip(d.strip); }
  else if (d.act === 'allmonth') set({ monthExpand: !state.monthExpand });
  else if (d.act === 'today') set({ selected: todayKey() }); // 今日へ戻るのは選択日だけ。表示（一覧・日・週・月）は保つ
  else if (d.act === 'prev') { if (!d.pane && !swiping && closedTv()) swipeTo(-1); else move(-1, d.pane); }
  else if (d.act === 'next') { if (!d.pane && !swiping && closedTv()) swipeTo(1); else move(1, d.pane); }
  else if (d.act === 'noteback') noteBack();
  else if (d.act === 'notenew') noteNew();
  else if (d.nf) noteFolderAct(b);
  else if (d.act === 'ndayclear') { NB.day = null; render(); }
  else if (d.act === 'ndayplus') openDayNote(NB.day);
  else if (d.act === 'notedayjump') noteDayJump(state.selected);
  else if (d.ndday || d.ndnav || (d.act && d.act.startsWith('nd'))) noteDateAct(d);
  else if (d.nrow) noteOpen(d.nrow);
  else if (d.nsrc) { set({ selected: d.nsrc, strip: null }); say(`${dayLabel(d.nsrc)}を開きました。`); }
  else if (d.act === 'sample') loadSample();
  else if (d.act === 'pickrange') startRangeKbd(b);
  else if (d.mr) rangeKbd(d.mr);
  else if (d.act === 'search') openSearch(b, fmode());
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
function pvGo(to) { // 開いた縦のホームの行き先（design/32 §2）。「月 ›」は月タブ、「タイムライン ›」「ほか n件 ›」は日タブの今日、タスク・ノートは集中モード
  if (to === 'month') set({ view: 'month', home: false });
  else if (to === 'day') set({ selected: todayKey(), view: 'day', home: false });
  else if (to === 'task' || to === 'note') setFocusMode(to);
  else if (to === 'taskadd') { setFocusMode('task'); if (RM.data) openAdd(); }
}
function homeGo2(d, b) {
  const to = d.to, kind = layoutKind(), day = d.keepDay ? state.selected : to === 'tomorrow' ? addDays(todayKey(), 1) : todayKey();
  const page = { time: 'time', tomorrow: 'time', task: 'task', taskadd: 'task', memo: 'memo' }[to];
  const after = () => {
    if (to === 'taskadd' && RM.data) { openAdd(); }
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
const panels = [dlg, confirmDlg, scopeDlg, discardDlg, menuDlg, searchDlg, backupDlg, xdDlg, xrDlg, catsDlg, notifyDlg, taskDlg, $('#rsheet')];
const anyPanel = () => panels.some((d) => d.open && !d._slide); // 閉じる動きの最中のシートは、もう下の画面を止めない
const syncInert = () => { root.inert = anyPanel(); };
const origins = new Map();
// シートの出入り（H-02・動-5）: 出るのは CSS の animation（dialog[open]）、閉じるのは同じ秒数で逆に動かし、終わってから dialog を閉じる。
// 視差効果を減らす設定なら 0.15 秒のフェードだけ。
const SHEET_MS = 250, SHEET_MS_REDUCED = 150;
const sheetMs = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? SHEET_MS_REDUCED : SHEET_MS);
function slideOut(d, done) {
  if (d._slide) return;
  const tok = d._slide = {};
  d.classList.add('sheet-out');
  const fin = () => {
    if (d._slide !== tok) return;
    d._slide = null;
    d.classList.remove('sheet-out');
    done();
  };
  setTimeout(fin, sheetMs());
}
function cancelSlide(d) { if (d._slide) { d._slide = null; d.classList.remove('sheet-out', 'fading'); } }
let fading = false;
const SLIDE_SHEETS = new Set([dlg, xdDlg, taskDlg, menuDlg, searchDlg]);
function openPanel(d, from) {
  origins.set(d, from || document.activeElement);
  cancelSlide(d);
  d.show();
  syncInert();
  if (d === xdDlg || d === taskDlg) syncScrim();
}
function closePanel(d, restore = true) {
  d._restore = restore;
  if (d.open && restore && SLIDE_SHEETS.has(d) && !fading) { // restore=false は別のパネルへ受け渡す閉じ方なので動かさずに閉じる
    if (d._slide) return;
    const sc = [dlg, xdDlg, taskDlg].includes(d);
    if (sc) scrim.classList.add('fade');
    slideOut(d, () => { if (d.open) d.close(); if (sc) scrim.classList.remove('fade'); syncInert(); syncScrim(); });
    syncInert();
    return;
  }
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
// 設定のクリック
menuDlg.addEventListener('click', (ev) => {
  if (ev.target.closest('#m-rssw, #m-rsopen, #m-rsdest, [data-rslist]')) ev._rs = true; // 下の設定の click に「閉じる」と扱わせない
  if (ev.target.closest('#m-rssw')) { if (syncSet.enabled && RS.perm !== 'denied' && RS.perm !== 'restricted') rsOpen({ kind: 'off' }); else rsOpen({ kind: 'explain' }); return; }
  if (ev.target.closest('#m-rsopen')) { openSettings(); return; }
  if (ev.target.closest('#m-rsdest')) { openDestPage(addDestKeySettings(), (id) => { const l = rsLists().find((x) => x.id === id); setSyncSettings({ ...syncSet, addTo: l?.duo ? '' : id }); syncRsUi(); render(); }); return; }
  const lb = ev.target.closest('[data-rslist]');
  if (lb) {
    if (lb.classList.contains('fixed')) return;
    const id = lb.dataset.rslist, on = syncSet.lists.includes(id);
    setSyncSettings({ ...syncSet, lists: on ? syncSet.lists.filter((x) => x !== id) : [...syncSet.lists, id], addTo: on && syncSet.addTo === id ? '' : syncSet.addTo });
    if (on && RS.chip === id) RS.chip = 'all';
    syncRsUi(); RM.sig = ''; render(); remSync.kick('lists', 0);
  }
});
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
  rows: { start: $('#row-s'), end: $('#row-e') }, hours: $('#tp-h'), mins: $('#tp-m'), title: $('#tp-title'), chips: $('#tp-chips'),
}, {
  get: () => dt,
  buzz: () => { haptic('light').catch(() => {}); },
  setTime: (which, h, m) => { if (!dt) return; dt = (which === 'start' ? setStartTime : setEndTime)(dt, h, m); afterTimeEdit(); },
  setDuration: (min) => { if (!dt) return; dt = setDuration(dt, min); afterTimeEdit(); },
});
// 日付と時刻の小さな面は同時に開かない。カプセルに触れた瞬間に閉じると下の行が動いて押し損ねるので、触れた後（click）に相手を閉じる。
for (const b of [F.start, F.end]) b.addEventListener('click', () => tui.close());
for (const b of [$('#f-stime'), $('#f-etime')]) b.addEventListener('click', () => dui.close());
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
  cancelSlide(dlg); scrim.classList.remove('fade');
  dlg.show();
  grooveSchedule();
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
// 予定名の Return は保存せず次の行へ（design/20 §3）。次の行はカレンダー（なければ開始）。
F.title.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.isComposing || ev.keyCode === 229) return;
  ev.preventDefault();
  const nx = [$('#f-dest'), F.start].find((b) => b && !b.disabled && b.offsetParent);
  if (nx) nx.focus({ preventScroll: false });
});
// 開いた縦: 溝（--groove-avoid-y0〜y1）に止まる行は、その行から下の面（avoid-y1）へ送る（design/20 §3）。
// 本文を先頭にしたときの位置で決める。呼ぶたびに前の送りを消して引き直す（何度呼んでも同じ）。
function editorGroove() {
  const body = dlg.querySelector('.fbody');
  if (!body) return;
  const rows = [...body.querySelectorAll('.erow')];
  const had = rows.some((r) => r.dataset.gpush);
  for (const r of rows) { if (r.dataset.gpush) { r.style.marginTop = ''; delete r.dataset.gpush; } }
  const y0 = parseFloat(de.style.getPropertyValue('--groove-avoid-y0')), y1 = parseFloat(de.style.getPropertyValue('--groove-avoid-y1'));
  if (!dlg.open || !Number.isFinite(y0) || !Number.isFinite(y1) || !isPortrait()) return;
  const st = body.scrollTop;
  let shift = 0;
  for (const r of rows) {
    if (!r.offsetParent) continue;
    const b = r.getBoundingClientRect();
    const top = b.top + st + shift, bottom = b.bottom + st + shift;
    if (bottom > y0 && top < y1) {
      const push = Math.ceil(y1 - top);
      r.style.marginTop = `${push}px`; r.dataset.gpush = '1'; shift += push;
    }
  }
}
// 設定シート（H-22）: 開いた縦で帯（avoid-y0〜y1）にかかる行は、その行から下の面（avoid-y1）へ送る。見えている画面の行を、スクロールを先頭にしたときの位置で決める。
function menuGroove() {
  const sc = menuDlg.querySelector('.mscreens');
  if (!sc) return;
  const all = [...sc.querySelectorAll('.menurows > *')];
  for (const r of all) if (r.dataset.gpush) { r.style.marginTop = ''; delete r.dataset.gpush; }
  const y0 = parseFloat(de.style.getPropertyValue('--groove-avoid-y0')), y1 = parseFloat(de.style.getPropertyValue('--groove-avoid-y1'));
  if (!menuDlg.open || !Number.isFinite(y0) || !Number.isFinite(y1) || !isPortrait()) return;
  const st = sc.scrollTop, vis = all.filter((r) => r.offsetParent), base = vis.map((r) => { const b = r.getBoundingClientRect(); return [b.top + st, b.bottom + st]; });
  let shift = 0;
  vis.forEach((r, i) => {
    const top = base[i][0] + shift, bottom = base[i][1] + shift;
    if (bottom > y0 && top < y1) {
      let m = Math.ceil(y1 - top);
      r.style.marginTop = `${m}px`; r.dataset.gpush = '1';
      const real = r.getBoundingClientRect().top + st; // 前の行の下の余白と重なる（マージンの相殺）ぶん足りないことがあるので、実測で合わせる
      if (real < y1 - 0.25) { m += Math.ceil(y1 - real); r.style.marginTop = `${m}px`; }
      shift = r.getBoundingClientRect().top + st - base[i][0];
    }
  });
}
let grooveRaf = 0;
const grooveSchedule = () => { cancelAnimationFrame(grooveRaf); grooveRaf = requestAnimationFrame(() => { editorGroove(); menuGroove(); }); };
window.__editorGrooveNow = editorGroove;
window.__menuGrooveNow = menuGroove;
menuDlg.addEventListener('toggle', grooveSchedule);
menuDlg.addEventListener('click', grooveSchedule);
new MutationObserver(grooveSchedule).observe(menuDlg, { childList: true, subtree: true, characterData: true }); // 診断の文などが後から変わっても行の位置を引き直す（属性の変化＝自分の margin は見ない）
new ResizeObserver(grooveSchedule).observe(menuDlg);
for (const el of menuDlg.querySelectorAll('.menurows')) new ResizeObserver(grooveSchedule).observe(el); // 行の折り返しなどで高さが変わったときも引き直す（送りは先頭位置から決めるので、何度でも同じ結果）
new ResizeObserver(grooveSchedule).observe(dlg);
dlg.addEventListener('click', grooveSchedule);
dlg.addEventListener('toggle', grooveSchedule);

// ---------- 予定のポップアップを閉じる（08 §5）: 幕タップ・下に引く・0.2秒のフェード ----------
// 未保存の変更の有無（開閉だけの ropen、遅れて決まる既定の追加先、自動曜日は数えない）。
function editSnap() { const { ropen, autoDays: _a, ...rest } = readForm(); if (isNewSheet()) rest.categoryId = ''; else rest.dest = destEff(); return JSON.stringify(rest); }
const editorDirty = () => edBase == null || edBase !== editSnap();
// 幕が受け持つポップアップ（最前面が編集シートか iPhone の予定詳細のときだけ）
const popupTop = () => [dlg, xdDlg, taskDlg].find((d) => d.open && panels.every((p) => p === d || p === dlg || p === xdDlg || p === taskDlg || !p.open)) || null;
function syncScrim() { scrim.hidden = !(dlg.open || xdDlg.open || taskDlg.open); }
for (const d of [dlg, xdDlg, taskDlg]) d.addEventListener('close', syncScrim);
dlg.addEventListener('close', () => { if (DF.mode === 'sheet') clearDraftBox(); });
let guardUntil = 0, guardAt = null;
// 幕を触って閉じた直後は、同じ場所へ遅れて届く click を下の要素へ通さない（別の場所の操作は妨げない）。
const guardClicks = (x, y) => { guardUntil = performance.now() + 400; guardAt = x == null ? null : { x, y }; };
const ghost = (ev) => performance.now() < guardUntil && (!guardAt || Math.hypot(ev.clientX - guardAt.x, ev.clientY - guardAt.y) < 40);
function fadeClose(d, done) {
  if (fading || !d.open || (d === dlg && extBusy)) return;
  fading = true;
  if (d === dlg) clearDraft(); // フェード中に再読込されても下書きを復元しない
  d.classList.add('fading'); scrim.style.opacity = ''; scrim.classList.add('fade');
  slideOut(d, () => {
    done(); // fading の間は closePanel が動かさずに閉じる
    d.classList.remove('fading', 'snap'); d.style.transform = ''; d.style.opacity = '';
    scrim.classList.remove('fade'); scrim.style.opacity = '';
    fading = false;
    syncScrim();
  });
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
  if (fmode() === 'task') { FT.sel = id; render(); return; } // 集中タスクは下面の詳細で編集する（シートは開かない）
  TK = { ed: openTaskEditor(r, RM.data.lists), busy: false, gone: false, notify: undefined }; tkKey = r.itemId;
  TK.ed.listRow = editListRow(r);
  $('#tk-body').innerHTML = taskEditorHtml(TK.ed);
  tkFields();
  tkUi();
  openPanel(taskDlg, from);
  const t = $('#tk-title'); (t.disabled ? $('#tk-close') : t).focus({ preventScroll: true });
}
let tkKey = '';
// 編集シートの「リスト ›」。同期オンでつながっている件だけ（書けないリストは候補に出さない）
function editListRow(r) {
  const ui = listUi();
  if (!ui?.active || !r.linked || r.recurring) return null;
  const key = r.listId === syncSet.duoListId ? 'duo' : r.listId;
  const l = ui.lists.find((x) => x.id === key);
  return l ? { id: l.id, title: l.title, color: l.color } : { id: key, title: 'リスト', color: DUO_COLOR };
}
taskDlg.addEventListener('click', (ev) => {
  if (!ev.target.closest('#tk-list') || !TK) return;
  const id = TK.ed.itemId, cur = TK.ed.listRow?.id;
  openDestPage(cur, async (to) => {
    if (to === cur) return;
    const l = rsLists().find((x) => x.id === to);
    const r = await remSync.moveToList(id, l?.duo ? (l.realId || syncSet.duoListId) : to);
    if (!r.ok) { say('リストを移せませんでした。'); notice('リストを移せませんでした。', null, 3000); return; }
    RM.mut++; RM.sig = ''; await loadTasks();
    const row = RM.data?.reminders.find((x) => x.itemId === id);
    if (TK && row) { TK.ed.listRow = editListRow(row); const b = $('#tk-list'); if (b) { b.querySelector('.tklv').innerHTML = `<i class="ldot" style="background:${esc(TK.ed.listRow.color)}"></i>${esc(TK.ed.listRow.title)}`; } }
  });
});
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
    if (!r.noop && RM.data) { RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === orig.itemId ? r.reminder : x)) }; RM.sig = ''; render(); scheduleTasks(); if (r.reminder.alarms?.length) askNotifyPerm(); }
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
const SAVE_FAIL = '保存できませんでした。もう一度お試しください。';

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
  grooveSchedule();
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
  syncCurlMenu();
  refreshRs(); // 同期を使ったことがなければ native は呼ばない（許可の状態も読まない）
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
  syncRsUi();
  $('#m-tkmonth').setAttribute('aria-checked', String(remSet.monthTasks));
}
// めくりの方式（試作）：今のめくり（A）｜iOS のめくり（B）。iOS のアプリで DuoNative が新しいときだけ B を選べる
function syncCurlMenu(msg) {
  $('#m-curl').hidden = CURL_B_OFF; if (CURL_B_OFF) return; // 第18.5版：画面から外した
  const nat = curlEngine() === 'native', ok = !!natCurl.caps() && !natCurl.failed();
  $('#m-curl-web').setAttribute('aria-pressed', String(!nat));
  $('#m-curl-native').setAttribute('aria-pressed', String(nat));
  $('#m-curl-native').disabled = !NATIVE;
  $('#m-curl-d').textContent = msg || (!NATIVE ? 'iOS のめくりは iPhone のアプリだけで使えます。'
    : nat && natCurl.failed() ? 'iOS のめくりでうまく動かなかったので、アプリを開き直すまで今のめくりで動きます。'
    : nat && !ok ? 'この端末では使えません。今のめくりで動きます。'
    : nat ? '開いた横の「今日＋明日」で、横に動かして指を離すと iOS のめくりでめくれます（紙は指に付きません）。視差効果を減らすがオンのときは今のめくりです。'
    : '今の紙のめくりです。iOS のめくりを選ぶと、触り比べられます（試作）。');
}
function pickCurlEngine(v) {
  setCurlEngine(v); ttCurl?.reset('engine'); natCurl.release();
  if (v !== 'native') { syncCurlMenu(); say('めくりを今のめくりにしました。'); return; }
  syncCurlMenu();
  natCurl.probe().then((c) => { syncCurlMenu(); say(c ? 'めくりを iOS のめくりにしました。' : 'この端末では iOS のめくりは使えません。'); });
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
  if (ev._rs) return;
  const mb0 = ev.target.closest('[data-m="tkmonth"]');
  if (mb0) { setRemSettings({ ...remSet, monthTasks: !remSet.monthTasks }); syncTaskMenu(); render(); say(`月にタスクを${remSet.monthTasks ? '表示します' : '表示しません'}。`); return; }
  if (calClick(ev)) return;
  const cv = ev.target.closest('[data-cvis]'), cc = ev.target.closest('[data-cal]');
  if (cv) { calToggleCat(cv.dataset.cvis, cv); return; }
  if (cc) { calToggleIphone(cc.dataset.cal); return; }
  if (ev.target.closest('#lk-req')) { lkRequest(); return; }
  if (ev.target.closest('#lk-settings')) { openSettings(); return; }
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
  else if (m === 'curl-web' || m === 'curl-native') pickCurlEngine(m === 'curl-web' ? 'web' : 'native');
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
  if (menuDlg.open && !ev.composedPath().includes(menuDlg) && !ev.composedPath().includes(rsDlg) && !ev.target.closest('[data-act="menu"], [data-act="stalled"]')) closePanel(menuDlg); // 中身を描き直してもメニュー内のクリックとして扱う
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
  try { await commitCats({ catPuts: [v.value] }); } catch { cs.busy = false; cs.err = 'カテゴリを保存できませんでした。もう一度お試しください。'; renderCats(); return; }
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
let srSeq = 0, srTimer = 0, srToday = todayKey(), srItems = [], srSnap = null, srMemos = [], srMemoSeq = 0, srTasks = [], srTaskSeq = 0;
const ymd = (k) => k.replaceAll('-', '/');
const localDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let srOnly = null; // 集中モードの検索: 'task' | 'note' | null（全体）
function openSearch(from, mode) {
  srOnly = mode === 'task' || mode === 'note' ? mode : null;
  srToday = todayKey();
  // 検索開始時点の成功キャッシュと範囲を固定する（検索のために3年分を取りに行かない）。
  srSnap = extActive() ? { events: [...visExt()], range: X.cache?.range || null } : null;
  SR.q.value = '';
  srMemos = []; const ms = ++srMemoSeq; // メモは全期間。未保存分を書いてから読む（失敗しても予定の検索は使える）
  flushNotesNow().then(() => db.listNotes()).then((ns) => { if (ms === srMemoSeq) { srMemos = ns; if (SR.q.value.trim()) renderSearch(true, true); } }, () => {});
  srTasks = []; const ts0 = ++srTaskSeq; // タスクも全期間（古い完了を含む）。保存済みの集合から読む
  taskStore.list().then((t) => { if (ts0 === srTaskSeq) { srTasks = t; if (SR.q.value.trim()) renderSearch(true, true); } }, () => {});
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
  m = { id: m.id, date: noteDateOf(m) || localDay(m.updatedAt), body: m.body };
  const yr = Number(srToday.slice(0, 4)), lab = Number(m.date.slice(0, 4)) === yr ? dayLabel(m.date) : `${m.date.slice(0, 4)}年${dayLabel(m.date)}`;
  const ex = excerpt(m.body ?? m.text, ts) || (m.body ?? m.text).slice(0, 80);
  return `<button type="button" class="mhit" data-mhit="${esc(m.id)}" aria-label="${esc(`${lab}のノート ${ex}`)}"><span class="hmeta">${esc(lab)}</span><span class="hnote">${highlight(ex, ts, esc)}</span></button>`;
}
function taskHitHtml(t, ts) {
  const due = t.due ? `${t.due.date.slice(5, 7)}/${t.due.date.slice(8, 10)}${t.due.time ? ` ${t.due.time}` : ''}` : '期限なし';
  const meta = `${t.done ? '完了' : '未完了'} · ${due}`;
  const ex = t.note && !ts.every((x) => highlight(t.title, [x], esc).includes('<mark>')) ? excerpt(t.note, ts) : '';
  return `<button type="button" class="mhit thit${t.done ? ' done' : ''}" data-thit="${esc(t.id)}" aria-label="${esc(`タスク ${meta} ${t.title}`)}"><span class="hmeta">${esc(meta)}</span><strong>${highlight(t.title, ts, esc)}</strong>${ex ? `<span class="hnote">${highlight(ex, ts, esc)}</span>` : ''}</button>`;
}
function renderSearch(initial = false, quiet = false) {
  const say2 = (m) => { if (!quiet) say(m); };
  const none = (ts) => ({ ts, items: [], total: 0, capped: false });
  const mres = srOnly === 'task' ? none([]) : searchNotes(srMemos, SR.q.value);
  const tres = srOnly === 'note' ? none([]) : searchTasks(srTasks, SR.q.value);
  const res = srOnly ? { ...none(terms(SR.q.value)), range: { from: srToday, to: srToday } } : searchEvents(state.events, SR.q.value, srToday, srSnap ? searchExt(srSnap.events, SR.q.value, srToday) : [], duoVisible());
  SR.clear.hidden = !SR.q.value;
  SR.range.hidden = !!srOnly;
  SR.range.textContent = `検索範囲：${ymd(res.range.from)}–${ymd(res.range.to)}・最大${LIMIT}件`;
  SR.xrange.hidden = !srSnap;
  if (srSnap) SR.xrange.textContent = srSnap.range ? `iPhoneの検索範囲：${ymdSlash(srSnap.range.from)}–${ymdSlash(lastDay(srSnap.range.to))}（読み込み済み）` : 'iPhoneの予定はまだ読み込まれていません。';
  srItems = res.items;
  const yr = Number(srToday.slice(0, 4));
  if (!res.ts.length) { SR.body.innerHTML = '<p class="smsg">探したい予定の言葉を入力してください。予定名・メモ・場所から探せます。</p>'; if (!initial) say2('検索語を消しました。'); return; }
  if (!res.total && !mres.total && !tres.total) { const nn = srOnly ? FOCUS_NOUN[srOnly] : '予定'; SR.body.innerHTML = `<p class="smsg">該当する${nn}はありません。検索語${srOnly ? '' : 'や検索範囲'}を確認してください。</p>`; say2(`該当する${nn}はありません。`); return; }
  const groups = groupByDay(res.items).map((g) => {
    const label = Number(g.key.slice(0, 4)) === yr ? dayLabel(g.key) : `${g.key.slice(0, 4)}年${dayLabel(g.key)}`;
    return `<section class="hgroup"><h3>${label}</h3>${g.items.map((e) => hitHtml(e, res.ts)).join('')}</section>`;
  }).join('');
  const evHtml = res.total ? `<p class="small hcount">${res.total}件の予定</p>${res.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${groups}` : '<p class="smsg">該当する予定はありません。検索語や検索範囲を確認してください。</p>';
  const mHtml = mres.total ? `<section class="ssec" data-sec="memo" aria-label="ノート"><h2 class="srhead">ノート</h2><p class="small hcount">${mres.total}件のノート（全期間・最大${LIMIT}件）</p>${mres.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${mres.items.map((m) => memoHitHtml(m, mres.ts)).join('')}</section>` : '';
  const tHtml = tres.total ? `<section class="ssec" data-sec="task" aria-label="タスク"><h2 class="srhead">タスク</h2><p class="small hcount">${tres.total}件のタスク（全期間・最大${LIMIT}件）</p>${tres.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${tres.items.map((t) => taskHitHtml(t, tres.ts)).join('')}</section>` : '';
  SR.body.innerHTML = `${srOnly ? '' : `<section class="ssec" data-sec="events">${evHtml}</section>`}${mHtml}${tHtml}`;
  say2(`${res.total}件の予定${mres.total ? `、${mres.total}件のノート` : ''}${tres.total ? `、${tres.total}件のタスク` : ''}が見つかりました。`);
}
SR.q.addEventListener('input', () => {
  clearTimeout(srTimer);
  const seq = ++srSeq;
  SR.clear.hidden = !SR.q.value;
  if (!SR.q.value.trim()) { renderSearch(); return; }
  SR.body.innerHTML = '<p class="smsg" role="status">検索しています…</p>';
  srTimer = setTimeout(() => { if (seq === srSeq) renderSearch(); }, 150); // 古い応答は破棄
});
SR.clear.addEventListener('click', () => { clearTimeout(srTimer); srSeq++; SR.q.value = ''; renderSearch(); SR.q.focus({ preventScroll: true }); });
$('#sr-close').addEventListener('click', () => closePanel(searchDlg));
SR.body.addEventListener('click', (ev) => {
  const mh = ev.target.closest('[data-mhit]');
  if (mh) {
    closePanel(searchDlg, false);
    NB.cur = mh.dataset.mhit; NB.opening = null;
    homeGo2({ to: 'memo', keepDay: true }, mh);
    return;
  }
  const th = ev.target.closest('[data-thit]');
  if (th) {
    const id = th.dataset.thit;
    closePanel(searchDlg, false);
    if (RM.data?.reminders.some((x) => x.itemId === id)) openTask(id); else say('このタスクは見つかりません。');
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
    BK.body.innerHTML = `<section class="card"><h3>書き出し</h3><p>予定${st.total}件・うち繰り返し${st.recurring}件／設定も含めて保存（ノートとタスク（リマインダーと同期しているものを含む）も入ります。リマインダーのリスト・追加先・月の件数の設定は含みません）</p><button type="button" class="solid" id="bk-export"${dis}>JSONを書き出す</button><p class="small">iPhoneでは共有シートの『ファイルに保存』で残せます。</p>${bk.msg ? `<p class="bmsg">${esc(bk.msg)}</p>` : ''}</section>
      <section class="card"><h3>読み込み</h3><p>書き出したJSONファイルから予定を戻します。</p><button type="button" id="bk-pick"${dis}>JSONファイルを選ぶ</button>${bk.busy ? '<p class="small" role="status">ファイルを検証しています…</p>' : ''}${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}</section>`;
  } else if (bk.stage === 'invalid') {
    BK.body.innerHTML = `<section class="card"><h3>読み込めませんでした</h3><p class="berr" role="alert">このファイルは読み込めません。DuoのバックアップJSONを選んでください。</p><p class="small">ファイル：${esc(bk.name)}</p><p class="small">理由：${esc(bk.reason)}</p><p class="small">今の予定は変更していません。</p><button type="button" id="bk-pick">ファイルを選び直す</button><button type="button" id="bk-back" class="row cancel">戻る</button></section>`;
  } else if (bk.stage === 'confirm') {
    const f = countStats(bk.data.events), p = bk.plan;
    BK.body.innerHTML = `<section class="card"><h3>この内容を読み込みますか？</h3>
      <dl class="facts"><dt>ファイル</dt><dd>${esc(bk.name)}</dd><dt>書き出し日時</dt><dd>${esc(fmtStamp(bk.data.exportedAt))}</dd>
      <dt>ファイルの予定</dt><dd>${f.total}件（繰り返し${f.recurring}件・個別変更／削除指定${f.exceptions}件）</dd>
      <dt>現在の予定</dt><dd>${st.total}件</dd><dt>追加見込み</dt><dd>${p.add.length}件（重複${p.dup}件・競合${p.conflict}件）</dd>${bk.data.notes ? `<dt>ノート</dt><dd>ファイル${bk.data.notes.length}件／現在${bk.curNotes.length}件／追加${p.note.added}件・同じ${p.note.same}件${p.note.renamed ? `・別ノート${p.note.renamed}件` : ''}</dd>` : ''}${bk.data.folders ? `<dt>フォルダ</dt><dd>ファイル${bk.data.folders.length}件／追加${p.note.foldersAdded}件</dd>` : ''}${p.legacy ? `<dt>ノート（古いメモから）</dt><dd>追加${p.legacy.added}件・同じ${p.legacy.same}件・別ノート${p.legacy.differ}件（今のノートは消えません）</dd>` : ''}${bk.data.tasks ? `<dt>タスク</dt><dd>ファイル${bk.data.tasks.length}件／現在${bk.curTasks.length}件／追加${p.task.added}件</dd>` : ''}</dl>
      ${p.conflict ? `<p class="small">競合${p.conflict}件は現在の予定を残します</p>` : ''}${catLine()}</section>
      <button type="button" class="row" id="bk-add"${dis}>追加（同じ予定は重複させない）<small>今の予定と設定を残します</small></button>
      <button type="button" class="row" id="bk-replace"${dis}>置き換え<small>今の予定はすべて消えて、このファイルの内容になります。設定も置き換わります（ノートとタスクも、ファイルに項目があれば置き換わります）</small></button>
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
    if (!await flushNotesAwait()) { bk.err = '保存できていないノートがあるため書き出せません。ノートの再試行をしてからもう一度お試しください。'; say(bk.err); renderBackup(); return; }
    // ノート有効: tasks+notes+folders を出し、旧 memos は出さない（旧メモは端末内の控えに残る）。
    const tx0 = performance.now();
    const text = JSON.stringify(buildBackup(state.events, { ...state, notify: loadNotify(), tasks: remSet }, new Date(), state.categories, [], await db.listTasks(), await db.listNotes({ includeDeleted: true }), await db.listFolders()), null, 2);
    NB.perf.export = Math.round((performance.now() - tx0) * 10) / 10; // 書き出し（読み出し＋JSON化）の実測。端末ごとの記録用
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
  let res, curMemos = [], curTasks = [], curNotes = [], curFolders = [], hex = null;
  try {
    if (!await flushNotesAwait()) { bk = { stage: 'main', busy: false, msg: '', err: '保存できていないノートがあるため読み込めません。ノートの再試行をしてからもう一度お試しください。' }; renderBackup(); return; }
    curTasks = await db.listTasks();
    curNotes = await db.listNotes({ includeDeleted: true }); curFolders = await db.listFolders();
    if (file.size > MAX_BYTES) res = { ok: false, reason: 'ファイルが大きすぎます（上限10MiB）' };
    else res = validateBackup(await file.text(), { categories: state.categories });
    if (res.ok && !res.data.notes && res.data.memos?.length) hex = await legacyHashes(res.data.memos);
  } catch { res = { ok: false, reason: 'ファイルを読み取れません' }; }
  if (!res.ok) bk = { stage: 'invalid', busy: false, name: file.name, reason: res.reason };
  else bk = { stage: 'confirm', busy: false, name: file.name, data: res.data, report: res.report, curMemos, curTasks, plan: planAppend(state.events, res.data.events, curMemos, res.data.memos || [], curTasks, res.data.tasks || [], curNotes, res.data.notes, curFolders, res.data.folders, hex), curNotes, err: '' };
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
  let data = bk.data, dupLinks = 0, tp = null, lp = null, np = null;
  if (kind === 'replace') { const u = uniqueRequestIds(data.events); data = { ...data, events: u.events }; dupLinks = u.unlinked; } // 二重の requestId は先の1件だけ結びつけ
  bk = { ...bk, busy: true, err: '' };
  renderBackup();
  try {
    // メモは確定時点の DB を基に計画し直す（確認画面の後に打った分も保つ）。
    if (!await flushNotesAwait()) throw new Error('note unsaved');
    const memoNow = Date.now();
    tp = kind === 'add' ? planTasks(await db.listTasks(), data.tasks || []) : null;
    // 古いメモは追加専用（置換でも今のノート・フォルダ・ピンを消さない）。ハッシュは tx の前に計算する。
    const curNotesNow = await db.listNotes({ includeDeleted: true }), curFoldersNow = await db.listFolders();
    lp = !data.notes && data.memos?.length ? planLegacyNotes(curNotesNow, curFoldersNow, data.memos, await legacyHashes(data.memos), memoNow) : null;
    // 新形式のノート・フォルダ（ファイルに項目があるときだけ）。置換は明示された項目だけ置き換える。旧 memos へは書かない。
    np = data.notes || data.folders ? planNotes(curNotesNow, data.notes ?? null, curFoldersNow, data.folders ?? null, kind === 'replace') : null;
    const legacyPuts = np ? { notePuts: np.notePuts, noteReplace: np.noteReplace, folderPuts: np.folderPuts, folderReplace: np.folderReplace } : lp ? { notePuts: lp.notePuts, folderPuts: lp.folderPuts } : {};
    // カテゴリと予定を1トランザクションで。参照先のカテゴリが無い予定は未分類に付け替える。
    const now = Date.now(), cin = data.categories.map((c) => ({ ...c, createdAt: c.createdAt || now, updatedAt: c.updatedAt || now }));
    if (kind === 'add') {
      const fx = fixEventCategories(plan.add, mergeCategories(state.categories, cin, 'add').categories, now);
      const fin = ensureOneVisible(fx.categories, now).list; // 書く結果が全部 hidden なら先頭だけ表示に戻す
      const cur = new Map(state.categories.map((c) => [c.id, c]));
      const same = (c) => cur.get(c.id)?.name === c.name && cur.get(c.id)?.color === c.color && !!cur.get(c.id)?.hidden === !!c.hidden;
      await db.applyImport({ catPuts: fin.filter((c) => !cur.has(c.id) || !same(c)), eventPuts: fx.events, taskPuts: tp.puts, ...legacyPuts });
    } else {
      let cats = data.hasCategories ? mergeCategories([], cin, 'replace').categories : mergeCategories(state.categories, cin, 'add').categories;
      if (!cats.length) cats = state.categories;
      if (data.hasCategories) cats = supplementForReplace(cats, data.events, now).list; // 不足する家族/外出/その他（と参照される仕事/私用）を補う
      const fx = fixEventCategories(data.events, cats, now);
      OBX.items = await db.applyImport({ catPuts: ensureOneVisible(fx.categories, now).list, eventPuts: fx.events, replace: true, outbox: (cur) => keepAfterReplace(cur, fx.events), ...(data.tasks ? { taskReplace: true, taskPuts: data.tasks } : {}), ...legacyPuts });
    }
  } catch {
    try { state.events = await db.listEvents(); } catch { /* 無視 */ }
    bumpRevision();
    bk = { stage: kind === 'add' ? 'confirm' : 'replace', busy: false, name, data, plan, err: '読み込みに失敗しました。現在の予定は変更していません。' };
    renderBackup();
    return;
  }
  // 成功後: 表示中のノートと一覧を捨て、DB の内容を読み直す（書き込み前に未保存分は保存済み）
  noteStore.reset(); NB.ed?.destroy(); NB.ed = null; NB.cur = null; NB.opening = null; db.setLastNote(null).catch(() => {}); invalidateNoteList(); NB.failed = false;
  state.events = await db.listEvents();
  bumpRevision();
  try { setCategories(await db.listCategories()); } catch { /* 直前の一覧で続ける */ }
  let msg;
  if (kind === 'add') msg = `${plan.add.length}件を追加しました（重複${plan.skipped}件を除外）。${np?.added ? `ノートは追加${np.added}件（同じ${np.same}件）。` : ''}${lp ? `古いメモからノートを追加${lp.added}件・別ノート${lp.differ}件（同じ${lp.same}件）。` : ''}${data.tasks?.length ? `タスクは追加${tp.added}件。` : ''}`;
  else {
    msg = `${data.events.length}件の予定${data.settings ? 'と設定' : ''}に置き換えました。${np?.added ? `ノート${np.added}件。` : ''}${lp ? `古いメモからノートを追加${lp.added}件・別ノート${lp.differ}件（同じ${lp.same}件）。` : ''}${data.tasks?.length ? `タスク${data.tasks.length}件。` : ''}${dupLinks ? `同じiPhone連携の印を持つ予定があったため、${dupLinks}件の結びつきを外しました。` : ''}`;
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (NATIVE) postureCtl?.refresh(); resumeExt(); requestNotifySync('resume'); remSync?.kick('resume', 0); refreshRs(); } });

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
  try { await commitCats(fn()); } catch { ok = false; say('カテゴリを保存できませんでした。もう一度お試しください。'); }
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
  try { await commitCats({ catPuts: [{ ...c, hidden: !c.hidden, updatedAt: Date.now() }] }); } catch { say('カテゴリを保存できませんでした。もう一度お試しください。'); }
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
      say('元に戻せませんでした。もう一度お試しください。'); undoRec = rec; armUndo(rec, left); return; // 何も消えていない。残り時間で再度押せる
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
// タスクの通知: 期限日を開き、タスクがあれば詳細、無ければタスク一覧へ。
async function openTaskNotifyTarget(day, id) {
  const kind = layoutKind();
  if (!RM.data?.reminders.some((x) => x.itemId === id)) { try { await loadTasks(); } catch { /* 一覧へ */ } }
  const found = !!RM.data?.reminders.some((x) => x.itemId === id);
  if (kind === 'spread') {
    const has = state.pages.left === 'task' || state.pages.right === 'task';
    const side = PG().left === 'home' ? 'right' : PG().right === 'home' ? 'left' : state.lastSide;
    set({ selected: day, home: false, ...(has ? {} : { pages: selectPage(state.pages, side, 'task'), lastSide: side }) });
  } else if (kind === 'open') {
    set({ selected: day, home: false, pages: selectPage(state.pages, 'portraitBottom', 'task') });
    if (!state.pages.portraitShown) setPanel(true);
  } else {
    set({ selected: day, home: false, view: 'day' });
    if (state.strip !== 'task') toggleStrip('task');
  }
  if (found) { openTask(id); say(`${dayLabel(day)}のタスクを開きました。`); } else say('このタスクは見つかりません。タスク一覧を開きました。');
}
function openNotifyTarget({ day, eventId }) {
  for (const d of [menuDlg, searchDlg, backupDlg, xdDlg, xrDlg, catsDlg, notifyDlg, taskDlg]) if (d.open) closePanel(d, false);
  if (typeof eventId === 'string' && eventId.startsWith('task:')) { openTaskNotifyTarget(day, eventId.slice(5)); return; }
  const target = eventsOnDay(occIn(day, day), day).find((e) => !isX(e) && (e.id === eventId || e.parentId === eventId));
  const spreadKind = layoutKind() === 'spread';
  // 見開きで時間ページがどちらにも無いときは、予定を見せるため右を時間にする。日付は左右共通。
  const needTime = spreadKind && target && PG().left !== 'time' && PG().right !== 'time';
  MM.open = null;
  set({ selected: day, home: false, view: spreadKind ? 'month' : 'day', ...(needTime ? { pages: selectPage(state.pages, 'right', 'time') } : {}) });
  if (!target) { say(`${dayLabel(day)}を開きました。`); return; }
  const sel = spreadKind ? '.page[data-page="time"] .tlev, .page[data-page="time"] .adpill' : '.daylist .event, .tlx .tlev, .tlx .adpill, .fold .tlev, .fold .adpill';
  const els = [...root.querySelectorAll(sel)].filter((b) => b.dataset.event === target.id && (!b.dataset.sday || b.dataset.sday === day));
  const el = els[0];
  if (el && el.closest('.fold')) { // 開いた縦の日・週: 紙をその予定の少し前まで動かす（上下の窓の同じ予定にしるしを付ける）
    if (el.dataset.s) foldScrollTo(Math.max(0, (Number(el.dataset.s) * FOLD_HH) / 60 - FOLD_HH));
    els.forEach((b) => { b.classList.add('nhl'); setTimeout(() => b.classList.remove('nhl'), 1600); });
  } else if (el) {
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
    let tasks = [];
    try { tasks = liveTasksOf(await db.listTasks()); } catch { tasks = []; } // 読めなくても予定の通知は予約する
    if (gen !== N.gen) return;
    const { items } = planNotifications(state.events, new Date(), n, { visible: duoVisible(), tasks });
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
  portrait: () => isPortrait(), // 溝 --groove-* は開いた縦のときだけ（D2）
  onChange: () => { updateKbMetrics(); applyKbLayout(); updateFoldProbe(); if (dlg.open || menuDlg.open) grooveSchedule(); },
});
// ?foldprobe=1：溝 [g0, g1] の一時表示（TP-25-1）。審査版（KB_METRICS_ENABLED=false）では出さない。
function updateFoldProbe() {
  let box = document.getElementById('foldprobe');
  if (!KB_METRICS_ENABLED || new URLSearchParams(location.search).get('foldprobe') !== '1') { box?.remove(); return; }
  const g = isPortrait() && postureCtl ? (postureCtl.groove || { g0: 467, g1: 484, source: 'fallback' }) : null;
  if (!box) {
    box = document.createElement('div'); box.id = 'foldprobe'; box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;font:11px/1.4 ui-monospace,monospace';
    document.body.appendChild(box);
  }
  const band = (a, b, c) => `<div style="position:absolute;left:0;right:0;top:${a}px;height:${Math.max(0, b - a)}px;background:${c}"></div>`;
  const p = postureCtl?.effective ?? null, r = p?.regionRect;
  const f = (n) => Math.round(n * 100) / 100;
  let html = '';
  if (g) { const b = grooveBands(g); html += band(b.cut[0], b.cut[1], 'rgba(0,120,255,.15)') + band(b.avoid[0], b.avoid[1], 'rgba(255,160,0,.2)') + band(g.g0, g.g1, 'rgba(255,0,0,.35)'); }
  const txt = g ? `groove g0 ${f(g.g0)} g1 ${f(g.g1)} ${g.source} · avoid ${f(g.g0 - 8)}〜${f(g.g1 + 8)} · cut ${f(g.g0 - 9)}〜${f(g.g1 + 16)}` : 'groove null（開いた縦ではない）';
  const vv = window.visualViewport;
  html += `<div style="position:absolute;left:4px;top:4px;background:rgba(0,0,0,.7);color:#fff;padding:3px 6px;border-radius:4px">${txt}<br>available ${p?.available ?? '—'} folded ${p?.folded ?? '—'} axis ${p?.axis ?? '—'} status ${p?.status ?? '—'} source ${p?.source ?? '—'}<br>regionRect ${r ? `y${f(r.y)} h${f(r.height)}` : '—'} · ${window.innerWidth}×${window.innerHeight} scale ${f(vv?.scale ?? 1)}</div>`;
  box.innerHTML = html;
}
window.addEventListener('resize', () => updateFoldProbe());
updateFoldProbe();
window.__posture = postureCtl; // 手動「折り」代替とテスト用
async function initNative() {
  hideKeyboardAccessoryBar(); // ∧∨✓ の帯を消す（19.1）。ネイティブ以外・失敗しても何も起きない
  if (!NATIVE) return;
  postureCtl.start(); // 権限処理より前に購読→取得。失敗・未対応でも起動を止めない
  // 連携オフ・カレンダー権限なしでも通知は動くので、購読は権限確認より前に行う。
  listen('calendarChanged', () => { remSync?.kick('changed'); clearTimeout(extTimer); extTimer = setTimeout(() => { if (extActive()) loadExt(true); }, 300); });
  remSync?.kick('start', 0); // 同期がオンのときだけ動く（オフでは何も呼ばない）
  refreshRs(); // 一度でも同期をオンにした人だけ、許可とリストを読む（止まっている 1 行の判定）
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
  if (rsDlg.open) { if (!RS.sheet?.busy) rsClose(); return; }
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
const SWIPE_ZONE = '.mgrid, .mday, .scroll, .agenda, .remaining, .home, .hero, .page, .list, .tlx, .fold';
const SWIPE_EXCLUDE = '.mgrab, .mph, .top, .shead, .rhead, .allday, .tlheads, .dgrip, .mmenu, .chead, .foot, .add, .tabs, .pgsw, .tlmenu, .dbox, .ctl, .bandbg, .hline, .foldband, .gutter, input, select, textarea, .ned-body, label, dialog';
let swiping = false;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const paneContent = () => [...root.querySelectorAll('.mgrid, .mday > *, .dpage > *, .scroll > *, .agenda > *, .hero > *, .remaining > *, .margin > *, .tlx > .tlw, .fold .fani')];
const closedTv = () => layoutKind() === 'browse' && !state.strip && viewNow() !== 'month'; // 閉じた日・週（design/28 §1）

// 見開きでは、なぞり始めたページ（左 'left' / 右 'right'）で動きを決める。月＝月送り、時間＝日送り（時間の週は7日）、タスク＝動かない。
let swipePane = null;
const pageOf = (t) => { const pg = t.closest('.page'); return pg && (layoutKind() === 'spread' || pg.classList.contains('dpage')) ? { side: pg.classList.contains('lp') ? 'left' : 'right', id: pg.dataset.page } : null; };
function swipeMove(dir) {
  const pane = swipePane; swipePane = null;
  if (ttOn()) { move(dir); say(`${dayLabel(state.selected)}と${dayLabel(addDays(state.selected, 1))}。`); return; }
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
  if (reduced() && !closedTv()) { swipeMove(dir); return; }
  swiping = true;
  document.documentElement.dataset.swiping = '1';
  const tvw = closedTv() || foldOn();
  const dur = reduced() ? 75 : ttOn() || tvw ? 125 : 100; // 今日＋明日・閉じた日／週の横すべりは出入り合わせて 0.25 秒（今の型は 0.1＋0.1）。視差を減らすときは 0.15 秒のフェード
  const sh = reduced() ? 0 : 32;
  try {
    const out = paneContent().map((el) => el.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dir * sh}px)`, opacity: 0 }],
      { duration: dur, easing: 'ease-in', fill: 'forwards' }));
    await Promise.all(out.map((a) => a.finished));
    swipeMove(dir);
    const back = paneContent().map((el) => el.animate(
      [{ transform: `translateX(${dir * sh}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: dur, easing: 'ease-out' }));
    await Promise.all(back.map((a) => a.finished));
  } catch { /* アニメーションが中断されても状態は保つ */ } finally { swiping = false; delete document.documentElement.dataset.swiping; }
}
const swipeCtl = initSwipe({
  root,
  canStart: (t) => {
    if (anyPanel() || NB.sheet || swiping || !(t instanceof Element) || !t.closest(SWIPE_ZONE) || t.closest(SWIPE_EXCLUDE)) return false;
    if (ttSpreadOn() && ttCurl?.mode() !== 'slide') return false; // 今日＋明日の見開き：端 24 のめくり（または入れ替え）に任せる。端の外の横スワイプでは日を送らない
    const pg = pageOf(t);
    swipePane = null;
    if (!pg) { // 見開き以外の時間軸は従来どおり対象外。閉じた日・週（.tlx）は横にあふれていなければ日・週送りを許す
      const x = t.closest('.tlx');
      return x ? x.scrollWidth <= x.clientWidth + 1 : !t.closest('.tl');
    }
    if (PS.on && pg.id !== 'month') return false; // 貼付中は月のページだけ動く
    if (pg.id === 'task') return false;
    if (pg.id === 'memo') return false; // ノートのページは日送りしない（一覧のスクロールと編集を邪魔しない）
    if (pg.id !== 'month') swipePane = pg.side;
    return true;
  },
  onSwipe: swipeTo,
});
// ---------- 今日＋明日のページめくり（第18版 PR4。js/curl/）----------
// 紙をめくるのは 開いた横・型が tt・WebGL が使える・視差効果を減らすがオフ のときだけ。WebGL なし・失敗は今の横すべり（swipeTo。0.25 秒）、視差効果を減らすは入れ替え。
const ttSpreadOn = () => ttOn() && layoutKind() === 'spread';
function ttMetrics() { // めくりの寸法（アプリ座標）。見えている左右の1日ページの矩形（updateLayoutMetrics の --left-start/--left-end/--right-start/--right-end・--content-y・--tt-h）から
  if (!ttSpreadOn()) return null;
  const l = root.querySelector('.dpage.lp'), r = root.querySelector('.dpage.rp'); if (!l || !r) return null;
  const a = l.getBoundingClientRect(), b = r.getBoundingClientRect();
  return a.width > 0 && b.width > 0 ? { lx0: a.left, lx1: a.right, spine: b.left, edge: b.right, py0: a.top, py1: a.bottom } : null;
}
// 第18.1版：帯の中なら予定の枠・終日・時間の目盛り・ノートの上からでも、横に動いたらめくる（向きが決まるまでは何もしないので、タップ・長押し・縦スクロールは従来どおり）。
// 始めないのは つまみ・編集中の枠・ボタン類の帯（右の帯・タブ・ページ切替）・入力欄・入力中（フォーカス中）の文字の上だけ。
const CURL_EXCLUDE = '.dgrip, .dbox, .hdl, .dx, .tlmenu, .mmenu, .ctl, .bandbg, .tabs, .pgsw, .foldband, .hline, .top, .foot, .add, input, select, label, dialog, [contenteditable="true"]';
const curlCanStart = (t) => {
  if (!(t instanceof Element) || !t.closest('.dpage') || t.closest(CURL_EXCLUDE)) return false;
  const ta = t.closest('textarea, .ned-body'); if (ta && ta === document.activeElement) return false;
  return t.closest('.tlev, .adpill, .adplus, .dlrow, .dnote, button, textarea, .ned-body') ? 'quiet' : true; // タップで開く物の上：角は持ち上げず、横に動いたらめくる
};
// iOS のめくり（B、1段目の試作）。設定 › 詳細「めくりの方式（試作）」で選ぶ。撮った絵は rev（描き直し）・時間軸のスクロール位置・分が同じなら使い回す
const natCurl = createNativeCurl({
  rev: () => renderRev,
  view: () => `${[...root.querySelectorAll('.dpage .tl, .dpage .dev, .dpage .dnote')].map((e) => Math.round(e.scrollTop)).join(',')}|${nowMin()}`,
});
ttCurl = createCurl({
  root, metrics: ttMetrics, pages: ttPainter(), swipe: swipeCtl, reduced, native: natCurl,
  enabled: () => ttSpreadOn() && !TT.drag && !anyPanel() && !NB.sheet,
  canStart: curlCanStart,
  onTurn: (dir) => { swipePane = null; swipeMove(dir); }, // state.selected を ±2 日にして render()（今日＋明日の日送りと同じ）
});

// ---------- 直接入力の起点（PR24 の共通制御へ PR25 で時間軸を接続。月・チップは PR26 以降） ----------
// 既存予定・操作部品・入力欄の上は null。時刻座標のない行（旧一覧・余白）は時間入力にしない。
// ---------- 予定を長押しでつかんで別の日へ落とす（第19版 PR8、design/21 §1.3。データは js/move-day.js） ----------
// つかめるのは、月と同じ画面にある時間軸の枠・終日・一覧の行だけ（開いた横の月＋その日、開いた縦の月タブの下の面）。落とし先は月の日マス。
const GRAB_SEL = '.tlev:not(.fev), .adpill, .mdev, .agrow';
const moveDays = () => [...root.querySelectorAll('.week .day[data-date]')].filter((n) => n.getClientRects().length);
const grabMonthOk = () => grabAllowed({ layout: layoutKind(), tt: ttOn(), pasting: PS.on, monthDays: moveDays().length });
function grabOrigin(t) {
  if (!grabMonthOk() || t.closest('.tabs, .mmenu, .tlmenu, .dbox')) return null;
  const el = t.closest(GRAB_SEL); if (!el?.dataset.event) return null;
  const from = el.dataset.sday || el.closest('[data-day]')?.dataset.day || null;
  const md = el.closest('.mday'); // 開いた縦の月タブの下の面: 日の部分（.mday）が1本でスクロールする。時刻は動かさず（日だけ移す）、端のスクロールは .mday を動かす（R-49）
  const tl = !md && el.matches('.tlev') ? el.closest('.tl') : null;
  return { kind: 'grab', id: el.dataset.event, el, from, tl, sc: md || tl };
}
const dayDiffKeys = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);
const hmOfIso = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const isoPlusMin = (iso, m) => { const t = hmOfIso(iso) + m; return `${iso.slice(0, 10)}T${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const GR = { on: false, o: null, chip: null, drop: '', off: 0, y0: 0, s0: 0, ext: null, gen: 0 };
function moveDayAt(x, y) {
  for (const n of document.elementsFromPoint(x, y)) { const d = n.closest?.('.week .day[data-date]'); if (d) return d.dataset.date; }
  return null;
}
function grabPaintDrop(k) {
  if (k === GR.drop) return;
  root.querySelectorAll('.day.mdrop').forEach((n) => n.classList.remove('mdrop'));
  GR.drop = k || '';
  if (k) root.querySelectorAll(`.week .day[data-date="${k}"]`).forEach((n) => n.classList.add('mdrop'));
}
// つかんだ予定の情報（Duo は回を解いた形、iPhone は表示用）。時刻を動かせるのは Duo の時刻つき・1日内の予定の時間軸の枠だけ。
function grabInfo() {
  const o = GR.o, ext = visExt().find((x) => x.id === o.id);
  if (ext) return { ext, title: ext.title, shift: false };
  const cur = resolve(o.id); if (!cur) return null;
  const occ = cur.occ, one = !occ.all && dayOf(occ.start) === dayOf(occ.end);
  return { cur, title: occ.title, shift: !!o.tl && one, sMin: one ? hmOfIso(occ.start) : 0, eMin: one ? hmOfIso(occ.end) : 0 };
}
function grabRecalc() {
  if (!GR.on) return;
  if (!GR.o.el.isConnected) { // 描き直されたら、同じ予定の要素へ点線の枠を付け直す
    const n = root.querySelector(`[data-event="${CSS.escape(GR.o.id)}"]${GR.o.from && GR.o.el.dataset.sday ? `[data-sday="${GR.o.from}"]` : ''}`);
    if (n) { GR.o.el = n; n.classList.add('grabbed'); }
  }
  GR.chip.style.transform = `translate(${EG.x + 12}px, ${EG.y - 18}px)`;
  const tl = GR.o.tl, g = grabInfo();
  if (tl?.isConnected && g?.shift) {
    const rc = tl.getBoundingClientRect(), er = GR.o.el.getBoundingClientRect(); // 時刻は、つかんだ枠の列の中で引いている間だけ動く（月へ向かう横の動きでは変わらない）
    if (Math.abs(EG.x - GR.x0) <= 24 && EG.x >= er.left && EG.x < er.right && EG.y >= rc.top && EG.y < rc.bottom) {
      const hh = hhOf(paneOf(tl)), dm = ((EG.y - GR.y0) + (tl.scrollTop - GR.s0)) / hh * 60;
      const off = Math.min(1440 - g.eMin, Math.max(-g.sMin, Math.round(dm / 15) * 15));
      if (off !== GR.off) { GR.off = off; feel('light'); }
    }
  }
  const d = moveDayAt(EG.x, EG.y);
  if (d !== (GR.drop || null)) { grabPaintDrop(d); if (d) feel('light'); }
  GR.chip.textContent = g ? `${g.title}${g.shift ? ` ${hmText(g.sMin + GR.off)}〜${hmText(g.eMin + GR.off)}` : ''}` : '';
}
function grabClear() {
  grabPaintDrop('');
  GR.chip?.remove(); GR.chip = null;
  root.querySelectorAll('.grabbed').forEach((n) => n.classList.remove('grabbed'));
  document.documentElement.removeAttribute('data-grab');
  GR.on = false; GR.o = null; GR.ext = null; GR.off = 0; GR.gen++;
}
function grabRefuse(msg) { // つかめない予定: 軽く震えて戻す
  feel('warning'); directCtl?.cancel('refuse');
  if (msg) notice(msg, null, 3000);
}
function grabStart(o, x, y) {
  GR.o = o;
  const g = grabInfo();
  if (!g) { GR.o = null; directCtl?.cancel('gone'); return; }
  if (g.ext) { // iPhone の予定: 書けない予定はつかめない（読み取り専用・誕生日は先に分かる。招待・出席者・詳細が取れないのは getEvent の返事で）
    const cal = X.calendars.find((c) => c.id === g.ext.calId), pre = preReason(cal);
    if (pre) { GR.o = null; grabRefuse(REASON_TEXT[pre]); return; }
    const gen = ++GR.gen;
    GR.ext = { gen, status: 'loading', cal };
    call('getEvent', extTarget(g.ext)).then((d) => {
      if (gen !== GR.gen || !GR.ext) return;
      const ed = extEditable(g.ext, cal, d);
      GR.ext = { ...GR.ext, status: ed.editable ? 'ok' : 'no', detail: d, ed, before: { ...toDisplay(d, cal), id: g.ext.id } };
      if (!ed.editable) grabRefuse(REASON_TEXT[ed.reason] || null);
    }).catch(() => { if (gen === GR.gen && GR.ext) { GR.ext.status = 'no'; grabRefuse('この予定は取得できませんでした。'); } });
  }
  Object.assign(GR, { on: true, drop: '', off: 0, x0: x, y0: y, s0: o.tl?.scrollTop ?? 0 });
  o.el.classList.add('grabbed');
  document.documentElement.dataset.grab = '1';
  const chip = document.createElement('div'); chip.className = 'gchip'; chip.setAttribute('aria-hidden', 'true');
  chip.style.setProperty('--cat', getComputedStyle(o.el).getPropertyValue('--cat') || '#294E42');
  document.body.append(chip); GR.chip = chip;
  feel('medium');
  if (o.sc) edgeLoop.start();
  grabRecalc();
  say(`${g.title}をつかみました。月の日へ落とします。`);
}
// ---- 落とす
const MV = { rec: null, timer: 0 };
const mvDropUndo = () => { clearTimeout(MV.timer); MV.rec = null; };
const dayText = (k) => `${parseKey(k).getMonth() + 1}月${parseKey(k).getDate()}日`;
function moveDone(toDay, note, rec) {
  mvDropUndo();
  MV.rec = rec; MV.timer = setTimeout(() => { if (MV.rec === rec) MV.rec = null; }, UNDO_MS);
  const msg = `${dayText(toDay)}へ移しました。${note || ''}`;
  notice(msg, { label: '元に戻す', fn: undoMove }, UNDO_MS);
  say(msg);
}
async function moveGrabbed(g, fromDay, toDay, off, st) {
  if (g.ext) return moveExt(g, fromDay, toDay, st);
  const { p, occKey, occ } = g.cur;
  const occ2 = off ? { ...occ, start: isoPlusMin(occ.start, off), end: isoPlusMin(occ.end, off) } : occ;
  const eff = addDays(dayOf(occ.start), dayDiffKeys(toDay, fromDay || dayOf(occ.start)));
  const m = planMoveDuo(p, occ2, occKey, eff, newId);
  const scope = occKey ? 'only' : 'all';
  const form = { title: occ.title, categoryId: occ.categoryId, all: !!occ.all, place: occ.place || '', notes: occ.notes || '', ...(occ.alarms !== undefined ? { alarms: occ.alarms } : {}), recurrence: p.recurrence || null, start: m.after.start, end: m.after.end };
  const { ops, plan } = planOps(p, { puts: m.puts, dels: m.dels }, scope, occKey, form);
  try { await commit(plan, { ops }); } catch { feel('error'); say(SAVE_FAIL); notice(SAVE_FAIL); return; }
  const moved = plan.puts.find((e) => e.id === p.id);
  render();
  moveDone(dayOf(m.after.start), m.note, { kind: 'duo', id: p.id, occKey, scope, start: occ.start, end: occ.end, stamp: moved.updatedAt });
}
async function moveExt(g, fromDay, toDay, st) {
  const e = g.ext;
  if (!st || st.status === 'loading') {
    try { const d = await call('getEvent', extTarget(e)); const cal = X.calendars.find((c) => c.id === e.calId); st = { detail: d, cal, ed: extEditable(e, cal, d), before: { ...toDisplay(d, cal), id: e.id } }; } catch { feel('warning'); notice('この予定は取得できませんでした。'); return; }
  }
  if (st.status === 'no' || !st.ed?.editable) { feel('warning'); notice(REASON_TEXT[st.ed?.reason] || XD_NOTE); return; }
  const eff = addDays(dayOf(st.before.start), dayDiffKeys(toDay, fromDay || dayOf(st.before.start)));
  const mv = buildMoveExtArgs(st.before, eff, st.detail);
  if (!mv) return;
  let r;
  try { r = await call('updateExternalEvent', mv.args); } catch (err) {
    feel('error');
    const code = errCode(err);
    notice(code === 'NOT_FOUND' ? 'この予定は iPhone のカレンダーで削除されています。' : code === 'NOT_EDITABLE' || code === 'READ_ONLY' ? (REASON_TEXT[errReason(err)] || errText(err, SAVE_FAIL_X)) : SAVE_FAIL_X);
    loadExt(true); return;
  }
  loadExt(true);
  moveDone(dayOf(mv.after.start), mv.note, { kind: 'ext', before: st.before, moved: mv, reply: r, detail: st.detail });
}
async function undoMove() {
  const rec = MV.rec; if (!rec) return;
  mvDropUndo(); document.querySelector('#native-toast')?.remove();
  if (rec.kind === 'ext') {
    try {
      const cur = await call('getEvent', extTarget({ ...rec.before, start: rec.moved.after.start, occurrenceDate: rec.before.occurrenceDate || rec.before.start }));
      if (!extUndoAllowed(rec.reply?.modifiedAt, cur?.modifiedAt)) { notice(UNDO_CONFLICT_TEXT); return; }
      const args = buildUndoExtArgs(rec.before, rec.moved, rec.reply, rec.detail);
      if (args) await call('updateExternalEvent', args);
    } catch { feel('error'); notice(UNDO_CONFLICT_TEXT); loadExt(true); return; }
    loadExt(true); notice('元に戻しました。'); return;
  }
  const p2 = state.events.find((e) => e.id === rec.id);
  if (!p2 || p2.updatedAt !== rec.stamp) { notice('変更されていたため、そのままにしました。'); return; }
  const occ2 = rec.occKey ? occurrenceAt(p2, rec.occKey) : p2;
  const u = planMoveDuoUndo(p2, occ2, { occKey: rec.occKey, start: rec.start, end: rec.end }, newId);
  const form = { title: occ2.title, categoryId: occ2.categoryId, all: !!occ2.all, place: occ2.place || '', notes: occ2.notes || '', ...(occ2.alarms !== undefined ? { alarms: occ2.alarms } : {}), recurrence: p2.recurrence || null, start: rec.start, end: rec.end };
  const { ops, plan } = planOps(p2, { puts: u.puts, dels: u.dels }, rec.scope, rec.occKey, form);
  try { await commit(plan, { ops }); } catch { feel('error'); notice('元に戻せませんでした。もう一度お試しください。'); MV.rec = rec; MV.timer = setTimeout(() => { if (MV.rec === rec) MV.rec = null; }, UNDO_MS); return; }
  render(); notice('元に戻しました。');
}
document.addEventListener('visibilitychange', () => { if (document.hidden) mvDropUndo(); });

const DIRECT_ZONE_EXCLUDE = '.ev, .strip, .tlev, .dbox, button, input, select, textarea, .ned-body, label, dialog, .tlheads, .tlmenu, .mmenu, .tabs';
function directOrigin(t) {
  if (anyPanel() || !(t instanceof Element)) return null;
  if (t.closest('.pvwk')) return null; // 開いた縦ホームの今週の帯: 長押しで期間選択・メニューは出さない（たたくと日タブ）
  const chip = !PS.on && PASTE_ENTRY ? t.closest('.week .bar[data-event], .week .strip[data-event]') : null; // 月のチップ（長押しでコピー・編集・削除のメニュー）
  if (chip && !t.closest('.tabs, .mmenu, .tlmenu')) return { kind: 'chip', id: chip.dataset.event, el: chip };
  const md = t.closest('.week .day[data-date]'); // 月の日マス（空白・数字）。帯・チップ・+N は別の要素なので起点にならない
  if (md && !t.closest('.tabs, .mmenu, .tlmenu')) return { kind: 'month', day: md.dataset.date, side: pageOf(md)?.side ?? null };
  if (t.closest('.week')) return null; // チップ・+N など月の他の要素は期間選択しない
  const gr = grabOrigin(t); if (gr) return gr; // 時間軸の枠・終日・一覧の行をつかむ（第19版 PR8）。閉じた画面・今日＋明日・開いた縦の日・週タブでは出ない
  if (t.closest(DIRECT_ZONE_EXCLUDE)) return null;
  const ad = t.closest('.allday');
  if (ad) { const c = t.closest('.adcol'); return c ? { kind: 'allday', day: c.dataset.day } : null; } // 「終日」の文字や段の外は対象外
  const col = t.closest('.tlcol');
  if (col && col.closest('.fl')) return { kind: 'time', day: col.dataset.day, pane: 'fold' };
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
  const o = EG.origin, bm = o?.kind === 'boxmove' && DF.mode === 'temp' && BM.moved;
  if (o?.kind === 'grab') { // つかんだ枠: 時間軸の上下 40 で自動スクロール（1秒に2時間分）。指が軸の横の外なら動かさない
    const tl = o.sc; if (!GR.on || !tl?.isConnected) return;
    const rc = tl.getBoundingClientRect(); if (EG.x < rc.left || EG.x >= rc.right) { EG.carry = 0; return; }
    // 月タブの下の面: 上へ出たら（月の日へ向かう動き）は動かさない。下の端はタブの上まで（タブに隠れる所へ引いても進む）
    const mdy = tl.classList.contains('mday'), bot = mdy ? Math.min(rc.bottom, cssPx('--tabs-y', rc.bottom)) : rc.bottom;
    if (mdy && EG.y < rc.top) { EG.carry = 0; return; }
    const v = edgeVelocity(EG.y, rc.top, bot); if (!v) { EG.carry = 0; return; }
    const d = v * dt + EG.carry, w = Math.trunc(d); EG.carry = d - w; if (!w) return;
    const before = tl.scrollTop; tl.scrollTop = before + w; if (tl.scrollTop !== before) grabRecalc();
    return;
  }
  if (!o || !(bm || (o.kind === 'time' && DF.mode === 'drag'))) return;
  if ((bm ? DF.pane : o.pane) === 'fold') { // 開いた縦: 外側の端だけ（上の窓の上 40・タブの上 40）。折り目の側ではしない。1秒に2時間分
    const z = foldEdgeZone(FD.g, EG.y); if (!z) { EG.carry = 0; return; }
    const d = z * FOLD_RATE * dt + EG.carry, w = Math.trunc(d); EG.carry = d - w;
    if (!w) return;
    const before = FD.s; foldScrollTo(before + w);
    if (FD.s !== before) { if (bm) boxMoveRecalc(EG.y); else timeRecalc(); }
    return;
  }
  const tl = EG.tl?.isConnected ? EG.tl : (EG.tl = (bm ? colOf(DF.pane, DF.day) : colOf(o.pane, o.day))?.closest('.tl') ?? null);
  if (!tl) return;
  const rc = tl.getBoundingClientRect();
  const v = bm ? edgeZone(EG.y, rc.top, rc.bottom, BOXMOVE_EDGE) * hhOf(DF.pane) : edgeVelocity(EG.y, rc.top, rc.bottom); // 枠の移動は 1時間/秒
  if (!v) { EG.carry = 0; return; }
  const d = v * dt + EG.carry, w = Math.trunc(d);
  EG.carry = d - w;
  if (!w) return;
  const before = tl.scrollTop; tl.scrollTop = before + w;
  if (tl.scrollTop !== before) { if (bm) boxMoveRecalc(EG.y); else timeRecalc(); }
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
  root, swipe: { cancel() { swipeCtl.cancel(); ttCurl?.cancel('hold'); } }, // 長押しで予定のドラッグになったら、スワイプもめくりも止める
  classify: (t) => directOrigin(t),
  onStart: ({ origin: o, x, y }) => {
    EG.x = x; EG.y = y; EG.origin = o; EG.carry = 0; EG.tl = null;
    if (o.kind === 'chip') { openChipMenu(o.id, o.el); feel('light'); return; }
    if (o.kind === 'grab') { grabStart(o, x, y); return; }
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
    if (o.kind === 'grab') { grabRecalc(); return; }
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
    if (o.kind === 'grab') {
      if (!GR.on) return;
      const day = moveDayAt(x, y), g = grabInfo(), off = GR.off, st = GR.ext;
      grabClear();
      if (day && g) moveGrabbed(g, o.from, day, off, st); // 月の日以外・溝の上で離したら取りやめ（元のまま）
      return;
    }
    if (o.kind === 'month') {
      if (MR.mode !== 'drag') return;
      const k = dayAtPoint(x, y, monthScope()); if (k) MR.cur = k;
      if (PS.on) { const r = dayRange(MR.anchor, MR.cur); clearRange(); pasteAddDays(daysBetween(r.start, r.end)); return; }
      if (MR.anchor === MR.cur) { openDayMenu(MR.cur, root.querySelector(`.week .day[data-date="${MR.cur}"]`)); return; } // 1日だけ離した: 終日の予定かこの日のノートを選ぶ
      openRangeSheet(); return;
    }
    if (o.kind === 'allday') { openEditor(null, root.querySelector('[data-act="add"]'), o.day, null, { all: true, direct: true }); return; }
    if (o.kind !== 'time' || DF.mode !== 'drag') return;
    const m = dragAt(y, o); if (m != null) Object.assign(DF, dragRange(DIR.anchor, m));
    openDraft();
  },
  onCancel: () => { stopEdge(); if (GR.on) grabClear(); if (DF.mode === 'drag') clearDraftBox(); if (MR.mode === 'drag') clearRange(); },
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
// 月のチップの予定名は切るが、切れているものだけ最後の右 4 を地の色へぼかす（L-05）
function markCuts() {
  root.querySelectorAll('.week .strip, .week .bar .bt').forEach((el) => el.classList.toggle('cut', el.scrollWidth > el.clientWidth + 0.5));
}
function paintRange() {
  markCuts();
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
function closeChipMenu() { if (chipMenu?.dataset.daymenu && MR.mode === 'menu') clearRange(); chipMenu?.remove(); chipMenu = null; document.removeEventListener('pointerdown', chipMenuOutside, true); }
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
// 月の日を長押しして同じ日で離したときの小さなメニュー（チップのメニューと同じ寸法）。
function openDayMenu(day, el) {
  closeChipMenu();
  const m = document.createElement('div');
  m.className = 'cmenu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', `${dayLabel(day)}の操作`); m.dataset.daymenu = day;
  m.innerHTML = '<button type="button" role="menuitem" data-dm="ev">終日の予定</button><button type="button" role="menuitem" data-dm="note">この日のノート</button>';
  const r = (el || root).getBoundingClientRect(), W = 160, H = 88;
  m.style.left = `${Math.round(Math.min(Math.max(4, r.left), window.innerWidth - W - 4))}px`;
  m.style.top = `${Math.round(r.bottom + 4 + H > window.innerHeight - 4 ? Math.max(4, r.top - H - 4) : r.bottom + 4)}px`;
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-dm]'); if (!b) return;
    closeChipMenu();
    if (b.dataset.dm === 'ev') openRangeSheet();
    else { clearRange(); showNotePage(); openDayNote(day); }
  });
  document.body.append(m); chipMenu = m; MR.mode = 'menu';
  document.addEventListener('pointerdown', chipMenuOutside, true);
  m.querySelector('[data-dm="ev"]').focus({ preventScroll: true });
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

// ノートの起動処理。UI・検索・通知より先に、旧メモの変換（印が無ければ1トランザクション）→旧下書きの取り込み→ノート下書きの回復→最後のノートの確認。
// 変換に失敗したら編集を始めず、再起動を案内する（元のメモ・予定は変わらない）。
async function bootNotes() {
  try { await db.ensureNotesMigrated(); } catch { NB.blocked = true; return; }
  try { await importLegacyMemoDrafts(); } catch { /* 旧下書きは残る。次の起動で再試行 */ }
  try { await recoverNoteDrafts(); } catch { /* 下書きは残る */ }
  refreshNoteMarks();
  try {
    const id = await db.getLastNote(), n = id ? await db.getNote(id) : null;
    NB.cur = n && !n.deletedAt ? id : null;
  } catch { NB.cur = null; }
}
async function boot() {
  updateVars();
  render();
  await bootNotes();
  if (NB.blocked) { say('ノートを準備できませんでした。アプリを閉じて、もう一度開いてください。'); }
  await applyNotifyPolicy(); // 既存端末の証拠は、カテゴリ移行や新しい印より前に採る
  let rt = null; // カテゴリの一度きり移行（取得より前）。失敗は印なしでロールバック済み。次の起動で再実行。戻り値は PR12 が移行前の証拠として使う
  try { rt = await db.migrateCategoriesOnce(new Date()); } catch { rt = null; }
  boot.retarget = rt;
  try { setCategories(await db.listCategories()); let bf = null; try { bf = await db.backfillNotifyOnce(new Date()); } catch { bf = null; /* ロールバック済み。次の起動で再実行 */ } state.events = await db.listEvents(); try { OBX.items = await db.getOutbox(); } catch { OBX.items = []; } bumpRevision(); N.ready = true; requestNotifySync(bf?.ran ? 'backfill' : 'launch'); } catch { say('保存領域を開けませんでした。'); }
  state.loaded = true;
  render();
  if (rt?.marker?.toast === 'pending' && rt.marker.moved > 0) { notice(RETARGET_TOAST, null, 6000); db.markRetargetToastDone().catch(() => {}); }
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
// 押した反応（H-01）: iOS の WKWebView で CSS の :active を効かせるには、document に touchstart の聞き手が要る。
// 触覚（軽）は主なボタン（保存・タブ・チェック・＋）だけ。haptic は非ネイティブでは何もしない。
document.addEventListener('touchstart', () => {}, { passive: true });
const BUZZ_SEL = '.tabs button,.pgsw button,.pswitch button,#save,.cadd,.radd,.ned-chk,.rmckb,.ned-done,[data-act="add"],[data-act="remck"],[data-act="remsubmit"]';
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  const b = e.target.closest?.(BUZZ_SEL);
  if (b && !b.disabled) feel('light');
}, { passive: true });
boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && location.protocol !== 'capacitor:' && !(window.Capacitor?.isNativePlatform?.()) && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
