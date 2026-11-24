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
import { colorSet, eventSet, setVars, isFlickId, flickName, flickSet, FLICK, validColorId } from './colors.js';
import { CAT_IDS, LIMITS as CAT_LIMITS, canHideCategory, defaultDeleteTarget, ensureOneVisible, supplementForReplace, PALETTE, UNCATEGORIZED, countByCategory, fixEventCategories, legacyToId, mergeCategories, moveCategory, nameTaken, RETARGET_TOAST, newCategory, paletteName, planDeleteCategory, resolveCategory, sortCategories, validateCategory } from './categories.js';
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
import { richLines, viewOf, levelOfPre, toggleCheck } from './note-lines.js';
import { isNoteTask, planNoteSync, lineOfSource, baselineOf, tasksFollowingNote } from './note-tasks.js';
import { titleOf, displayLine, displayText, noteDateOf, dateOccupants, dailyHeading, ensureDailyFolder, EMPTY_TITLE, cardTextOf } from './notes-model.js';
import { DELETE_UNDO_MS, tasksHtml, focusTasksHtml, HIST_DAYS, openTaskEditor, taskEditorHtml, taskDirty, saveTask, hasNotify, NOTE_NEED_DUE, createDeleteController, TASK_DELETED } from './reminders.js';
import { liveTasks as liveTasksOf, isTombstone as isTaskTombstone, TASK_TITLE_MAX, dropOldLinks, LOCAL_LIST, TASK_STORE_TEXT, createTaskStore, createLocalCall, createLocalAddController, rowOf, createTaskDoneController, DONE_UNDO_MS, TASK_VIEWS, TASK_VIEW_LABELS, normTaskView, dueCounts, todayTasks, inheritTaskSettings, normTaskSettings } from './tasks.js';
import { PASTE_MAX, addDaysCapped, bandLabel, clipTitle, daysBetween, pasteLabel, planPaste, spanOf, toggleDay } from './paste.js';
import { call, hideKeyboardAccessoryBar, errCode, errReason, errText, haptic, listen, nativeAvailable } from './native.js';
import { createDestPage, destRowsHtml } from './destination-ui.js';
import { xcKeyOf, xcLoad, xcItems, xcSet, xcSweep, xcExport, xcImport } from './event-colors.js';
import { KB_METRICS_ENABLED as KB_METRICS_BUILD, kbMetrics, kbText, screenText } from './kbmetrics.js';
// 開発用の表示（画面寸法・キーボード計測・タッチ確認）は審査版・征希さんの版では出さない。確かめるときだけ ?dev=1 で出す（第19.1版 S5 H-16）。
const DEV = new URLSearchParams(location.search).has('dev') || (() => { try { return localStorage.getItem('duo.dev') === '1'; } catch { return false; } })();
if (DEV) document.documentElement.dataset.dev = '';
const KB_METRICS_ENABLED = KB_METRICS_BUILD || DEV;
import { createPosture, postureText, grooveBands } from './posture.js';
import { FOLD_HH, FOLD_RATE, foldGeometry, windowMinutes, rawMinutesAt, foldEdgeZone, labelY, partTitles, openingMinute, clampS } from './fold.js';
import { kbTopOf, hingeBand, computeKbLayout, caretBox, scrollDelta, STRIP_MIN } from './keyboard-layout.js';
import { makeVisible, buildExtArgs, buildExtDeleteArgs, cleanLink, covers, dedupe, extCanMove, extEditable, extIn, extRange, fmtLoaded, groupBySource, keepAfterReplace, lastDay, mergeOps, normDest, normSettings, pickAddCal, planLinkMigration, planNativeOps, resolveDest, rangeKey, refreshLinks, relink, searchExt, stampOf, subLabel, toDisplay, uniqueRequestIds, visibleDestGroups, allDestHidden, withIdent, writable, ymdSlash } from './iphone.js';
import {
  DOW, addDays, addMonths, assignSharedLanes, dayLabel, dayOf, dkey, eventsOnDay, isKey, isMulti,
  monthWeeks, newId, nowStamp, pad, parseInput, parseKey, ruleSummary, setFirstDay, t0, timeLabel, toInput, todayKey, validateDraft, weekStart, weekdayHeads,
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
const L = { w: window.innerWidth, h: window.innerHeight }; // 安定寸法（キーボードで変わらない。measureL が更新する）
const VIEWS = ['day', 'week', 'month'];
const STYLES = ['simple', 'named'];
function loadUi() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { s = {}; }
  const stage0 = s.stage ?? s.stageHeld, grip0 = s.dayGrip; // stageHeld＝閉じた横の間に保存したときの段の控え（下の saveUi）
  return {
    selected: isKey(s.selected) ? s.selected : todayKey(),
    view: VIEWS.includes(s.view) ? s.view : 'month',
    style: STYLES.includes(s.style) ? s.style : 'named', // 新しい端末の既定は予定名（第19.1版 H-04）。保存済みの設定は尊重する
    desk: s.desk === true,
    home: s.home === true ? true : s.home === false ? false : null, // null=未選択（閉じた画面では一覧、開いた画面では月などの本文）。true=「一覧」を選んだ
    monthExpand: s.monthExpand === true,
    monthForm: ['one', 'two', 'month'].includes(s.monthForm) ? s.monthForm : 'two', // 月を引く画面の型（第19版 PR6）。初めは 2週
    stage: [1, 2, 3, 4, 5, 6, 7].includes(stage0) ? stage0 : ({ month: 1, two: 4, one: 7 }[s.monthForm] || 1), // 閉じた画面の引きの段 1〜7（第19.2版 S11a・design/34）。起動は段1
    dayGrip: [0, 1, 2].includes(grip0) ? grip0 : 0, // 閉じた7段の日の欄のつまみの段（0=カード、1=時間軸、2=時間軸・広い）。0〜2 の整数でなければカード（第19.2版 S11d・design/34 §5・設計レビュー M8）
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
// 第19.2版 S11e・S11f（指示14・品質 B-2）: 画面の記憶は、閉じた画面と開いた画面とで分ける。
// 閉じた画面が読み書きするのは 段（stage）・選んだ日（selected）・日の欄のつまみの段（dayGrip）だけ。開いた縦・横の 表示（view）・ホーム（home）は、閉じている間は書き換えず、保存にもそのまま戻す。開いたらこの画面に戻る。
// OPENUI＝開いた側の view・home。CLOSEDUI＝閉じた画面で見ている面（メモリだけ。起動はいつもカレンダー。34 §9.2）。どれも UI_KEY の中（DB の版6は変えない）。
const OPENUI = { view: state.view, home: state.home };
const CLOSEDUI = { view: 'month', home: false };
const closedSize = () => Math.min(L.w, L.h) < 600; // 閉じた画面（縦 466×678・横 678×466）
const closedLand = () => closedSize() && L.w > L.h; // 閉じた横（design/34 §14）
// 第19.2版 S11c（design/34 §9.2・11:29 の決定）: 閉じた画面でアプリを開いたときは、いつもカレンダー（覚えている段）から始める。ホーム・週の時間軸は「…」から。
if (closedSize()) { state.home = false; state.view = 'month'; }
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
  // 閉じている間は 段・選んだ日・日の欄のつまみの段 だけが変わる（開いた画面の 表示・ホーム は前のまま戻す）。段は開いた縦の月の型と共有（design/34 §10）
  if (!closedSize()) { OPENUI.view = state.view; OPENUI.home = state.home; }
  const { view, home } = OPENUI, { selected, dayGrip } = state;
  // 閉じた横（34 §14）は段を使わない。横の間の保存には stage を書かず（S11e 指示10）、縦に戻ったとき・横のまま起動し直したときのために控え（stageHeld）だけを残す
  const stage = closedLand() ? undefined : state.stage, stageHeld = closedLand() ? state.stage : undefined;
  const { style, desk, monthExpand, monthForm, monthDay, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTextSize, rokuyo, holidayRed, pages, timeMode, lastSide, focusMode, taskView, spreadType, ttSplit } = state;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ selected, view, style, desk, home, monthExpand, monthForm, stage, stageHeld, dayGrip, monthDay, weekStart: ws, monthTimeClosed, monthTimeOpen, monthTimeV: 11, monthTextSize, rokuyo, holidayRed, pages, timeMode, lastSide, focusMode, taskView, spreadType, ttSplit })); } catch { /* 保存不可でも動作は続ける */ }
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
// 第19.3版 その2 D（征希さん「予定を入れる時、メモを書きたいがキーボードに隠れて書けない」「テキストの詳細がキーボードに隠れるから使えない」）:
// 実機は @capacitor/keyboard（19.1 で ∧∨✓ の帯を消すために入れた。resize: none）が WKWebView のキーボードの通知の購読を外すので、キーボードが出ても visualViewport が縮まないことがある
//（＝ data-kb が立たず、シートも本文の窓もキーボードの下に残る）。プラグインの出来事 keyboardWillShow／DidShow（keyboardHeight）・WillHide／DidHide も聞き、
// キーボードの上端 kbTop は「visualViewport の下端」と「画面の高さ − keyboardHeight」の小さい方（上にある方）で決める。どちらか片方しか来ない端末でも同じ配置になる
const NKB = { h: 0 };
function kbTopNow() {
  const v = kbTopOf(window.visualViewport, window.innerHeight), n = NKB.h > 0 ? Math.max(0, window.innerHeight - NKB.h) : null;
  return n === null ? v : v === null ? n : Math.min(v, n);
}
function nativeKb(h) {
  const v = Number.isFinite(h) && h > 0 ? Math.round(h) : 0;
  if (v === NKB.h) return;
  NKB.h = v; vpSchedule();
  if (v) setTimeout(() => { const a = document.activeElement; if (isTextEl(a)) reveal(a); }, 60);
}
for (const [name, on] of [['keyboardWillShow', true], ['keyboardDidShow', true], ['keyboardWillHide', false], ['keyboardDidHide', false]]) {
  window.addEventListener(name, (ev) => nativeKb(on ? Number(ev.keyboardHeight ?? ev.detail?.keyboardHeight) : 0));
  try { window.Capacitor?.Plugins?.Keyboard?.addListener?.(name, (info) => nativeKb(on ? Number(info?.keyboardHeight) : 0)); } catch { /* ネイティブ以外 */ }
}
function updateVars() {
  const vv = window.visualViewport, H = window.innerHeight;
  const zoomed = (vv?.scale || 1) > 1.01;
  const vy = vv && !zoomed ? Math.max(0, vv.offsetTop) : 0;
  const vh0 = vv && !zoomed ? vv.height : H;
  const vh = NKB.h > 0 ? Math.min(vh0, Math.max(0, H - NKB.h - vy)) : vh0; // プラグインが知らせたキーボードの分も引く（上の説明）
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
  const kt = de.dataset.kb ? kbTopNow() : null; // v19.3 その2 D: 見えている下端は、欄の箱の下端とキーボードの上端の上の方
  let a = el.getBoundingClientRect(); const b = sc.getBoundingClientRect(), pad = 8, vb = Math.min(b.bottom, kt ?? Infinity);
  if (a.top < b.top + pad) sc.scrollTop -= b.top + pad - a.top;
  else if (a.bottom > vb - pad) sc.scrollTop += a.bottom - (vb - pad);
  if (el.matches?.('textarea')) { // 長い文字を打つ欄（予定・タスクのメモ）: 欄が窓より高い・行が増えたときも、打っている行（キャレットの行）が見える所まで送る
    a = el.getBoundingClientRect();
    const c = caretBox(el);
    if (c.top < el.scrollTop) el.scrollTop = c.top; else if (c.bottom > el.scrollTop + el.clientHeight) el.scrollTop = c.bottom - el.clientHeight; // 欄の中でも、打っている行を欄の窓の中へ
    const y0 = Math.max(a.top, a.top + c.top - el.scrollTop), y1 = Math.min(a.bottom, a.top + c.bottom - el.scrollTop);
    const d = y1 > y0 ? scrollDelta({ itemTop: y0, itemBottom: y1, viewTop: b.top, viewBottom: vb, pad }) : 0;
    if (d) sc.scrollTop += d;
  }
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
  const kbTop = kbTopNow();
  const kbUp = !!de.dataset.kb && kbTop !== null;
  const mode = m === 'task' && kbUp && root.querySelector('.ftdn') ? 'task' : m === 'note' && NB.cur && root.querySelector('.nhost') ? 'note' : null;
  if (!mode) { clearKbLayout(); return; }
  const p = postureCtl?.effective ?? null, H = L.h;
  const hinge = hingeBand({ rect: p?.available ? p.regionRect : null, axis: p?.axis, height: H });
  const top = mode === 'task' ? parseFloat(getComputedStyle(de).getPropertyValue('--head-h')) || 82 : Math.ceil(root.querySelector('.ntools')?.getBoundingClientRect().bottom || 126);
  // v19.3 その2 D（征希さん「テキストの詳細がキーボードに隠れるから使えない」）: 開いた縦の「タスク」で、下の詳細（.ftcard の題名・期限・メモ）を打っている間は、追加欄の配置（詳細ごと隠す）にしない。
  // 詳細の欄を、キーボードの上の空き（溝の下が 132 以上あれば溝の下、なければ溝の上）に置き、その中で打っている行まで送る。追加欄と候補の列はその間出さない
  if (mode === 'task' && document.activeElement?.closest?.('.ftdn .ftcard')) {
    const r2 = (x) => `${Math.round(x * 100) / 100}px`, kt = kbTop;
    const up = { top, bottom: Math.min(hinge.top - 8, kt - 8) }, dn = { top: hinge.bottom + 8, bottom: kt - 8 };
    const ed = dn.bottom - dn.top >= 132 ? dn : up, key = `taskd|${r2(ed.top)}|${r2(ed.bottom)}`;
    if (key === klKey) return;
    clearKbLayout(); klKey = key;
    de.classList.add('kbl'); de.dataset.kbl = 'taskd';
    de.style.setProperty('--kl-ed-top', r2(ed.top)); de.style.setProperty('--kl-ed-h', r2(Math.max(0, ed.bottom - ed.top)));
    reveal(document.activeElement);
    return;
  }
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
const caretFollow = () => { cancelAnimationFrame(caretRaf); caretRaf = requestAnimationFrame(() => { const a = document.activeElement; if (a?.classList?.contains('ned-body')) { if (de.classList.contains('kbl') || de.dataset.kb) revealCaret(a); } else if (a?.matches?.('textarea') && de.dataset.kb) reveal(a); }); }; // v19.3 その2 D: ノートのシート（kbl でない形）と、予定・タスクのメモ欄（textarea）も、キーボードが出ている間は打っている行を追う
document.addEventListener('selectionchange', caretFollow);
document.addEventListener('input', (ev) => { if (ev.target?.classList?.contains('ned-body') || ev.target?.matches?.('textarea')) caretFollow(); }, true);
let vpRaf = 0, revealT = 0;
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
    if (d && Number.isFinite(mh) && mh < 160) { a.blur(); say('入力欄を表示するためキーボードを閉じました。'); } else { reveal(a); clearTimeout(revealT); revealT = setTimeout(() => { const b = document.activeElement; if (de.dataset.kb && isTextEl(b)) reveal(b); }, 90); } // v19.3 その2 D: シートの並べ直し（溝よけ）が済んだあとにもう一度（WebKit は並べ直しが 1 コマ遅い）
  }
}

// ---------- レイアウト判定（L・卓上トグル） ----------
// 機種の寸法は決め打ちしない。600 はコンパクト（閉じた）判定のブレークポイント。
function layoutKind() {
  const w = L.w, h = L.h;
  if (Math.min(w, h) < 600) return state.home === true ? 'home' : 'browse'; // 起動はカレンダー（design/34 §9.2・11:29 の決定）。ホームは「ホーム」から
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
const CL_LAND_GRID = 382; // 閉じた横の格子の列の幅（閉じた縦の中身の幅と同じ。マス 52.3）
// 閉じた横の帯の仮の値（CSS の :root の --cl-land-rail・--cl-land-home の1か所。実機で測って置き換える）
function closedLandVals() { const c = getComputedStyle(de); return { rail: parseFloat(c.getPropertyValue('--cl-land-rail')) || 84, home: parseFloat(c.getPropertyValue('--cl-land-home')) || 33 }; }
const POS = { land: null, post: 'closed', band: false, bg: null, hbar: false, set: null, search: null, all: null, task: null, more: null, memo: null, today: null, add: null, pnl: null, fm: null, tt: null, fmode: 'calendar', ux: 1 };
let ttPageH = 603; // 開いた横の1日ページの高さ（y0〜603。updateLayoutMetrics が決める）
function updateLayoutMetrics() {
  const S = safe(); lastSafe = safeKey(S);
  const kind = layoutKind(), W = L.w, H = L.h;
  const T = S.top, R = S.right, B = S.bottom, Ls = S.left;
  const x0 = Ls, y0 = T, U = W - Ls - R, V = H - T - B;
  const post = kind === 'home' || kind === 'browse' ? 'closed' : kind === 'open' && isPortrait() ? 'portrait' : 'landscape';
  const n = monthWeeks(state.selected).length;
  const v = { 'layout-w': W, 'layout-h': H, 'content-x': x0, 'content-y': y0, 'content-w': U, 'content-h': V, 'fold-x': W / 2 };
  const pos = { land: null, post, band: false, bg: null, hbar: false, set: null, search: null, all: null, task: null, more: null, memo: null, today: null, add: null, pnl: null, fm: null, tt: null, fmode: 'calendar', ux: 1 };
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
    // 第19.2版 S11c（design/34 §9.1・§12 Q-3）: 右の列は「タスク・…・＋」の3つ。見える丸 48、押せる範囲 56（上下左右に 4）。下のタブはない。
    // 第19.2版 S11e（design/34 §14・§15-③）: 閉じた横は格子（x0〜382）と日の欄を左右に並べる。右の列は タスク 172・… 232（縦と同じ y）、＋ はホームバーの帯の 8 上。
    // 横の帯の幅とホームバーの帯の高さは CSS の --cl-land-rail・--cl-land-home（仮の値。1か所）から読む
    const land = W > H, LV = land ? closedLandVals() : null, hb = Math.max(B, land ? LV.home : 33);
    const tTask = y0 + 172 * (land ? 1 : q), tMore = y0 + 232 * (land ? 1 : q), tAdd = land ? H - hb - 8 - VIS_BAND : H - B - 80 * q;
    const m = (HIT_BAND - VIS_BAND) / 2;
    pos.band = bandOk && tTask - m >= y0 + 160 * (land ? 1 : q) && tMore - m >= tTask + VIS_BAND + m && tAdd - m >= tMore + VIS_BAND + m;
    if (R > 0) pos.bg = { x: W - R, w: R };
    if (pos.band) {
      const cx = W - (land ? LV.rail : R) / 2, bx = cx - HIT_BAND / 2;
      pos.task = box(bx, tTask - m, HIT_BAND, VIS_BAND); pos.more = box(bx, tMore - m, HIT_BAND, VIS_BAND); pos.add = box(bx, tAdd - m, HIT_BAND, VIS_BAND);
    } else { // 右の帯がない（ブラウザなど。§15-③・§14.5）: 見出しの右に「…」「タスク」（押せる 44・記号 22・丸なし。押した地の丸 36）。縦は右端を 8 あけ、横は右端から。＋ は右下（見える 48 を右 12・ホームバーの帯の 12 上、押せる 56）
      pos.hbar = true;
      const rx = W - R - (land ? 0 : 8);
      pos.task = box(rx - HIT_HDR, y0, HIT_HDR, 36); pos.more = box(rx - 2 * HIT_HDR, y0, HIT_HDR, 36);
      pos.add = box(W - R - 12 - VIS_BAND - m, H - hb - 12 - VIS_BAND - m, HIT_BAND, VIS_BAND);
    }
    if (land) { // 行＝⌊(h−64−9)÷6⌋、1マスの件数＝⌊(行−22)÷16⌋（最低1）。h＝画面の高さ−上の帯−下の帯（§14.3）
      const row = Math.max(22, Math.floor((H - T - hb - 64 - 9) / 6));
      pos.land = { row, cap: Math.max(1, Math.min(4, Math.floor((row - 22) / 16))), H: row * 6, dayW: W - R - Ls - CL_LAND_GRID - 24 };
    }
    tabsW = Math.min(286, C - 16);
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
    // 「カレンダー｜タスク｜ノート」は上の帯の真ん中、どの型でも同じ形・同じ場所に固定（V-01）: 252×36・x208.5〜460.5・y23〜59、角丸10、1つ 84。押せる高さは ::before で y19〜63（44）。
    // 検索はどの型でも x605〜649・y19〜63、＋はどの型でも右下 x601〜649（V-10）。タスク・ノートの型でも上の帯の部品は動かさない。
    const fmX = Ls + (U - 252) / 2;
    pos.fm = { x: fmX, y: 23, w: 252, h: 36 };
    if (pos.fmode !== 'calendar') { pos.today = null; pos.pnl = null; }
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
  if (post === 'closed') v['tabs-y'] = maxY - 41; // 閉じた画面に下のタブはない（design/34 §9.1-9）。下の余白 41 の上端を「下の帯の上端」として使う
  // 閉じた画面: 月のスクロール末尾は、最終週をタブの上へ出せるだけ（安全矩形の下端 − タブ上端）、最低56
  de.style.setProperty('--end-pad-closed', '41px'); // 第19.2版 S11c: タブがなくなったので下の余白は 41（design/34 §10「33 全体」）
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
// 第19.4版（design/36 §8.1）: 色は画面に出すときだけくすませる。入口はここ（colorVars・catVar・catSet）と、設定の丸（calDot）・詳細の丸。保存と EventKit の色は元の hex のまま。
// ダークは値だけ（36 §5）。アプリはライト固定（V-07）なので、確かめ用に html[data-theme=dark]（?theme=dark）のときだけ使う
const MODE = (() => { try { if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* */ } return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; })();
if (MODE === 'dark') import('./theme-preview.js').then((m) => m.applyDarkPreview()).catch(() => {}); // 見本のときだけ読み込む
const lineOf = (c) => colorSet(c, MODE).line; // 色の点・凡例・丸（4.5 の線の色）
const colorVars = (c) => setVars(colorSet(c, MODE));
// iPhone に保存した予定（linked / pending）の色と札は保存先カレンダーのもの。未取得なら保存した名前と安全な色。
const calOfLink = (e) => {
  const l = e.nativeLink;
  if (isX(e) || !l || (l.state !== 'linked' && l.state !== 'pending')) return null;
  const c = X.calendars.find((x) => x.id === l.calendarId);
  return { name: c ? c.title : l.calName || 'iPhone', color: c?.color || '#68716A' };
};
// 予定の元の色（保存のままの hex）: iPhone の予定はカレンダーの色、iPhone に保存した Duo の予定は保存先カレンダーの色、それ以外は分類の色
const baseColorOf = (e) => { if (isX(e)) return e.color; const c = calOfLink(e); return c ? c.color : catOf(e).color; };
// 予定ごとの色（design/37）: Duo の予定は colorId（繰り返しは系列の本体の値。overrides の colorId は読まない）、iPhone の予定は色の表（meta 'xcolors'）
const colorIdOf = (e) => (isX(e) ? xColorIdOf(e) : e.colorId);
const catSet = (e) => eventSet(colorIdOf(e), baseColorOf(e), MODE);
const catVar = (e) => setVars(catSet(e));
// iPhone の予定に付けた色の表（design/37 §4.2。meta 'xcolors' の写し）。キーは externalId（空なら itemId）で、繰り返しは全部の回が同じ色
const XC = { map: new Map() };
const xColorIdOf = (e) => XC.map.get(xcKeyOf(e))?.colorId ?? null;
async function xcPut(table) { if (table === XC.map) return; XC.map = table; bumpRevision(); await db.putEventColors(xcItems(table)); }
// iPhone にも保存した Duo の予定（linked）: 保存で得た externalId で、色の表にも同じ色を入れる（別の端末では iPhone の予定として見えるため。連携の回答 6）。外したら表からも外す
function xcMirror(events) {
  let t = XC.map;
  for (const e of events) {
    const l = e?.nativeLink, key = l?.state === 'linked' && typeof l.externalId === 'string' ? l.externalId : '';
    if (!key) continue;
    const want = validColorId(e.colorId) ? e.colorId : null, have = t.get(key)?.colorId ?? null;
    if (want !== have) t = xcSet(t, key, want, { calId: l.calendarId || '', title: e.title, lastStart: e.start });
  }
  return xcPut(t).catch(() => {});
}
// 読み込みが成功したあとだけ「消えたかどうか」を見る（連携の回答 5 の 4 つの条件は event-colors.js の xcSweep）
function xcSweepNow() {
  if (!XC.map.size || X.status !== 'ok' || !X.cache) return;
  const r = xcSweep(XC.map, { status: X.status, range: X.cache.range, calIds: X.cache.ids ? X.cache.ids.split(',') : [], events: X.cache.events });
  if (r.changed) xcPut(r.table).catch(() => {});
}
const xcAfterLoad = () => { xcMirror(state.events).then(xcSweepNow); };
const catSty = (e) => ` style="${catVar(e)}"`;
const tagText = (e) => (isX(e) ? subLabel(e) : calOfLink(e)?.name ?? catOf(e).name);
const xi = (e) => (isX(e) ? '<span class="xi" aria-hidden="true">▦</span>' : '');
const xname = (e) => (isX(e) ? `iPhone、${e.calName}、` : '');
// 読み上げ用の時刻（S8 品質の低）: 時刻つきの予定は「9:00 朝会」。終日・日をまたいで続く日は付けない
const spokenAt = (e, k) => (!e.all && typeof e.start === 'string' && e.start.length >= 16 && e.start.slice(0, 10) === k ? `${+e.start.slice(11, 13)}:${e.start.slice(14, 16)} ` : '');

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
const ICON_TASK = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4.5 12.8l4.6 4.6L19.5 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_MEMO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.6 9h6.8M8.6 12.5h6.8M8.6 16h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
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
  return `${date}<div class="fmodes" role="group" aria-label="集中モード" style="left:${r2(f.x)}px;top:${r2(f.y)}px;width:${r2(f.w)}px;height:${f.h}px">${FOCUS_MODES.map((m, i) => `<button type="button" data-fmode="${m}" aria-pressed="${m === on}" aria-description="3個中${i + 1}番目"><span class="fmp">${FOCUS_LABELS[m]}</span></button>`).join('')}</div>`;
};
const ICON_TT = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="4.5" width="8" height="15" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="4.5" width="8" height="15" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 9h3M5.5 12h3M15.5 9h3M15.5 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor"/></svg>';
const ICON_UNDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 7 5 11l4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11h9a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_REDO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="m15 7 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 11h-9a5 5 0 0 0 0 10h3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const noteHist = () => { try { return NB.ed?.history?.() || { undo: 0, redo: 0 }; } catch { return { undo: 0, redo: 0 }; } };
const MORE = { open: false }; // 閉じた画面の「…」のポップアップ
// S11h（34 §18-3）: 帯がない横でシート（ノート。x0〜678・y8〜）を開いている間は、上の y0〜8 に端が残る見出しのボタン（タスク・…）を押せなくする（§17-5 でバッジを隠すのと同じ条件。見た目は変えない）
const sheetOverHead = () => !POS.band && closedLand() && !!document.querySelector('body > .nsheet:not([hidden])');
const sheetHeadSync = () => { const on = sheetOverHead(); for (const b of root.querySelectorAll('.shell.closed .cb.ctask, .shell.closed .cb.cmore, .shell.closed .mpull.browse .mph')) b.inert = on; }; // S11i（品質 8960267）: 見出しの帯（年月＝今日へ・見えない前の月/次の月）も同じ条件で押せなくする
const NE_HIDE = ' tabindex="-1" aria-hidden="true"'; // 書いている間は隠れている右の列のボタン（読み上げ・キーの順からも外す）
let noteEditing = false; // 閉じた画面でノートを書いている間（右の列の「タスク」→「元に戻す」、「＋」は隠す）
const CTL = {
  set: () => `<button type="button" class="cb csettings" data-act="menu" aria-label="設定" aria-haspopup="dialog"${posStyle(POS.set)}><span class="bi">${ICON_GEAR}</span></button>`,
  search: () => `<button type="button" class="cb csearch" data-act="search" aria-label="${FOCUS_NOUN[POS.fmode] || '予定'}を検索"${posStyle(POS.search)}><span class="bi">${ICON_SEARCH}</span></button>`,
  task: () => {
    const n = stripTaskCount(), on = stripOn('task');
    return `<button type="button" class="cb cstrip ctask${on ? ' on' : ''}" data-act="strip" data-strip="task"${noteEditing ? NE_HIDE : ''}${sheetOverHead() ? ' inert' : ''} aria-pressed="${on}" aria-label="${n ? `タスク、期限切れと今日 ${n}件` : 'タスク'}"${posStyle(POS.task)}><span class="bi">${ICON_TASK}${n ? `<span class="bdg" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</span></button>`;
  },
  memo: () => {
    const on = stripOn('memo');
    return `<button type="button" class="cb cstrip cmemo${on ? ' on' : ''}" data-act="strip" data-strip="memo" aria-pressed="${on}" aria-label="ノート"${posStyle(POS.memo)}><span class="bi">${ICON_MEMO}</span></button>`;
  },
  tt: () => { const on = ttOn(); return `<button type="button" class="cb ctt${on ? ' on' : ''}" data-act="spreadtype" aria-pressed="${on}" aria-label="今日と明日の見開き"${posStyle(POS.tt)}><span class="bi">${ICON_TT}</span></button>`; },
  // 第19.2版 S11c（design/34 §9.1-14・§9.2・§9.3）: 閉じた画面の「…」と、ノートを書いている間の「元に戻す」
  more: () => `<button type="button" class="cb cmore${MORE.open ? ' on' : ''}" data-act="more"${noteEditing ? NE_HIDE : ''}${sheetOverHead() ? ' inert' : ''} aria-label="その他" aria-haspopup="menu" aria-expanded="${MORE.open}"${posStyle(POS.more)}><span class="bi">${ICON_MORE}</span></button>`,
  // S11e（34 §15-②）: 帯があるとき、書いている間は タスク→元に戻す、…→やり直す（＋は隠す）。使えないときは記号 #C9C5BA（data-off。押しても何もしない）
  undo: () => `<button type="button" class="cb cundo" data-act="noteundo" aria-label="元に戻す" data-off="${noteHist().undo ? 0 : 1}"${noteEditing ? '' : ' tabindex="-1" aria-hidden="true"'}${posStyle(POS.task)}><span class="bi">${ICON_UNDO}</span></button>`,
  redo: () => `<button type="button" class="cb credo" data-act="noteredo" aria-label="やり直す" data-off="${noteHist().redo ? 0 : 1}"${noteEditing ? '' : ' tabindex="-1" aria-hidden="true"'}${posStyle(POS.more)}><span class="bi">${ICON_REDO}</span></button>`,
  today: () => `<button type="button" class="cb ctoday" data-act="today" aria-label="今日に戻る"${posStyle(POS.today)}><span class="bi" aria-hidden="true">${todayLabel()}</span></button>`,
  pnl: () => { const on = state.pages.portraitShown; return `<button type="button" class="cb cpnl${on ? ' on' : ''}" data-act="pnltoggle" aria-label="${on ? '下の段を隠す' : '下の段を表示'}"${posStyle(POS.pnl)}><span class="bi">${ICON_PNL}</span></button>`; },
  add: () => `<button type="button" class="cb cadd" data-act="add"${noteEditing ? NE_HIDE : ''} aria-label="${FOCUS_NOUN[POS.fmode] || '予定'}を追加"${posStyle(POS.add)}><span class="bi" aria-hidden="true">＋</span></button>`,
};
// 右の帯のタスク／メモ。閉じた画面は全面に出している間、見開きはどちらかのページがそれのとき「開いている」。
const safeBandNow = () => safe().right >= HIT_BAND;
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
    h = CTL.task() + CTL.more() + (POS.band ? CTL.undo() + CTL.redo() : '') + CTL.add(); // 第19.2版 S11c: タスク・…・＋ だけ（設定・検索・ノート・今日は「…」・日の欄・見出しへ。design/34 §9.1）
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
const legend = () => `<div class="legend" aria-label="カテゴリ凡例">${state.categories.filter((c) => !c.hidden).map((c) => `<span style="--cat-line:${lineOf(c.color)}">${esc(c.name)}</span>`).join('')}</div>`;
const xlegend = () => (extActive() ? '<div class="xlegend small">▦ iPhoneの予定（カレンダーの色）</div>' : '');

function periodTitle() {
  const d = parseKey(state.selected);
  if (viewNow() === 'month') return `${d.getFullYear()}年${POS.post === 'closed' ? '' : ' '}${d.getMonth() + 1}月`; // 閉じた画面は「2026年11月」（design/34 §2.1。年と月の間をあけない）
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
const allBtn = (cls = 'allbtn', st = '') => `<button type="button" class="${cls}" data-act="allmonth" aria-pressed="${state.monthExpand}" aria-label="${state.monthExpand ? '通常の予定表示に戻す' : '全部の予定を表示'}"${st}><span aria-hidden="true">全部</span></button>`;
// 見出し: 閉じた画面（帯あり）は 前・題名・次 のみ（全は帯）。帯なし／開いた縦は 全 も見出しに置く。
const chead = () => {
  if (PS.on && monthAll()) return `<div class="chead pasting">${pasteBand()}</div>`;
  if (POS.post === 'closed') { // 第19.2版 S11c（design/34 §9.1-1・2）: 閉じた画面の見出しに ‹ ›・全部は出さない（左右に送る。読み上げ用の見えないボタンは残す。全部は「…」→月の表現）
    const nb = (dir) => navBtn(dir).replace('<button type="button"', '<button type="button" class="vh cnav"');
    return `<div class="chead cch">${nb(-1)}<h2 id="ctitle">${periodTitle()}${state.view === 'day' ? rkSpan(state.selected, 'hrk') : ''}</h2>${nb(1)}</div>`;
  }
  return `<div class="chead">${navBtn(-1)}<h2 id="ctitle">${periodTitle()}${state.view === 'day' ? rkSpan(state.selected, 'hrk') : ''}</h2>${navBtn(1)}${state.view === 'month' ? allBtn() : ''}</div>`;
};

function card(e) {
  const sub = [e.place ? esc(e.place) : '', isMulti(e) ? `${e.start.slice(5, 10).replace('-', '/')} 〜 ${e.end.slice(5, 10).replace('-', '/')}` : '', e.nativeLink?.state === 'linked' ? 'iPhoneにも追加済み' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="event ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}"${repLabel(e, `${timeLabel(e)} ${e.title}`)}><span class="clock">${timeLabel(e)}${bell(e)}</span><span class="tag">${esc(tagText(e))}</span><strong>${rep(e)}${esc(e.title)}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
}
const sampleBtn = () => (state.loaded && state.events.length === 0 ? '<button type="button" class="ghost" data-act="sample">サンプルを入れる</button>' : '');
function dayList(k) {
  const list = eventsOnDay(occIn(k, k), k);
  if (list.length) return list.map(card).join('');
  return `<div class="empty"><p>予定のない、余白の一日。</p><button type="button" class="ghost" data-new="${k}">＋ この日に追加</button></div>`;
}
function agenda(k) {
  const n = eventsOnDay(occIn(k, k), k).length;
  return `<section class="agenda" aria-label="選択日の予定"><div class="eyebrow">選択日の予定</div><h3>${dayTitle(k)}</h3><div class="count small">${n}件の予定</div><div class="list" data-scroll="agenda">${dayList(k)}</div></section>`;
}

// ---------- 月（手帳｜予定名｜全部 共通の週描画） ----------
// 日付行18・最初のレーン19・16px刻み・チップ14px・下余白2（CSS の --date-h/--lane-top/--lane-step/--chip-h と同値）。
const LANE_TOP = 18, LANE_STEP = 16, LANE_PAD = 2;
const xCount = (es) => { const n = es.filter(isX).length; return n ? `（うちiPhone ${n}件）` : ''; };
const weekdaysHtml = (cls = '') => `<button type="button" class="mrpick vh" data-act="pickrange">期間を選ぶ</button><div class="weekdays${cls}">${weekdayHeads().map(({ i, label }) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${label}</span>`).join('')}</div>`;
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
  const s = PS.src, v = catVar(s);
  return gs.map((g) => {
    const t = clipTitle(s.title), time = !s.all && g.n === 1 ? `${t0(s.start.slice(11, 16))} ` : '';
    const label = !g.first ? `${t}（つづき）` : g.n > 1 ? `${t} ${g.n}日` : `${time}${t}`;
    return `<span class="pghost${g.n > 1 ? ' pband2' : ''}${g.first ? '' : ' cont'}${g.last ? '' : ' more'}" aria-hidden="true" data-pghost="${g.day}" style="${v}${colPos(g.sc, g.ec)};top:${lt + g.lane * ls}px">${esc(label)}</span>`;
  }).join('');
}
const colPos = (sc, ec) => `left:calc(${sc} * 100% / 7 + 1.5px);width:calc(${ec - sc + 1} * 100% / 7 - 3px)`;
// 閉じた7段のマスの読み上げ: 「11月12日 木曜日、予定N件…」（六曜はマスに出さないので読み上げの先頭にも置かない）
const DOW_LONG = ['日', '月', '火', '水', '木', '金', '土'];
const dynDayLabel = (k) => { const d = parseKey(k); return `${d.getMonth() + 1}月${d.getDate()}日 ${DOW_LONG[d.getDay()]}曜日${holSpoken(k)}`; };
// 閉じた7段のチップ（design/34 §7、第19.4版 design/36 §15.3）。時刻つき単日＝地なし＋左の線 2.5×10。終日・複数日＝ごく薄い地＋左の線＋墨の文字（週をまたいで続く側だけ角丸 0。週の頭ごとに線と題名）。
// 帯は見た目は週の中の1本。作りは、またぐマスごとに1片（どの片も自分のマスの子なので、たたいた所のマスが日になる）。題名は先頭の片だけが持ち、右のマスの上へも続けて見せる。
function dynChipPieces(b, days, lt, ls, time) {
  const { e } = b, top = lt + b.lane * ls, n = b.ec - b.sc + 1;
  const cutL = dayOf(e.start) < days[0], cutR = dayOf(e.end) > days[6];
  const out = [];
  for (let col = b.sc; col <= b.ec; col++) {
    const lead = col === b.sc, last = col === b.ec, gl = lead && !cutL ? 1 : 0, gr = last && !cutR ? 1 : 0;
    const at = `data-lane="${b.lane}" ${lead ? `data-lead="1" data-sc="${b.sc}" data-ec="${b.ec}" data-event="${esc(e.id)}"` : `data-cont="${esc(e.id)}"`} data-sday="${days[b.sc]}"`;
    const ov = b.band && !lead ? 3 : 0; // つづきの片は左へ 3 重ねて、角丸の隅を前の片（同じ色）で埋める（継ぎ目に欠けが出ない）
    const pos = `top:${top}px;left:${gl - ov}px;width:calc(100% - ${gl + gr}px + ${ov}px);z-index:${lead ? 3 : 2}`;
    const title = esc(e.title);
    if (!b.band) { out.push({ col, html: `<span class="strip chip timed ${catCls(e)}" ${at} style="${catVar(e)}${pos}" aria-hidden="true"><i class="cline"></i><span class="st">${time ? `${chipTime(e.start)} ` : ''}${title}</span></span>` }); continue; }
    const txt = lead ? `<span class="bt" style="width:calc(${n} * 100% - ${gl + 1}px)"><span class="st">${title}</span></span>` : '';
    const rl = (lead && !cutL) || ov ? 3 : 0, rr = last && !cutR ? 3 : 0;
    out.push({ col, html: `<span class="bar chip ${e.all ? 'all' : 'multi'} ${catCls(e)}" ${at}${e.all ? ' data-all="1"' : ''} style="${catVar(e)}${pos};border-radius:${rl}px ${rr}px ${rr}px ${rl}px" aria-hidden="true">${lead ? '<i class="cline"></i>' : ''}${txt}</span>` });
  }
  return out;
}
// 週の中身: 日セル（button。マス全体が1つの押す的）・+N（span。押す的にしない＝V-03。マスをたたけばその日）・帯／チップ（span。押す的にしない＝pointer-events:none・aria-hidden。予定の名前は日セルの aria-label にまとめる）。S5 M-11。
// mode: simple（点）| named | all。
function weekInner(w, { mode, cur, sel, today, cap, time, tk = null, lt = LANE_TOP, ls = LANE_STEP, plusLane = -1, dyn = false }) {
  const { days, wev, hidden } = w;
  let items = w.items;
  // 月を引く画面（design/22 §1）: 入りきらない日は最後の1件の代わりに「+n」を最後の段へ出す（その日だけの予定を1件はずして数に足す）。
  const dropped = Array(7).fill(0);
  if (plusLane >= 0) items = items.filter((b) => { if (b.sc === b.ec && b.lane === plusLane && hidden[b.sc] > 0) { dropped[b.sc]++; return false; } return true; });
  let html = '';
  const inCell = Array(7).fill('');
  if (dyn) for (const b of items) for (const pc of dynChipPieces(b, days, lt, ls, time)) inCell[pc.col] += pc.html; // 閉じた7段: チップは日のボタンの中（R-75。どこをたたいても日になる）
  // 第19.3版 その3（design/35 §2.4・決定 5）: 閉じた画面のマスに、タスクとノートの名前のチップも出す（予定の下の空いた段へ タスク → ノート の順。入りきらない分は +N に数える）。
  // 印は形で分ける: タスク＝四角 8×8・角丸 2（完了は塗り）、ノート＝角の折れた紙 8×10。件数（.tkn）と緑の線（.mline）は閉じた画面では出さない
  const xhid = Array(7).fill(0), xn = days.map(() => ({ t: 0, n: 0 }));
  if (dyn) {
    const occ = Array.from({ length: cap }, () => Array(7).fill(false));
    for (const b of items) if (b.lane < cap) for (let i = b.sc; i <= b.ec; i++) occ[b.lane][i] = true;
    const pend = doneCtl.pending();
    days.forEach((k, col) => {
      const ts = dayTaskRows(k), ns = NB.cards.get(k) || []; xn[col] = { t: ts.length, n: ns.length };
      const put = (attr, mark, title) => {
        const lane = occ.findIndex((row) => !row[col]); if (lane < 0) { xhid[col]++; return; }
        occ[lane][col] = true;
        inCell[col] += `<span class="strip chip xk" data-lane="${lane}" data-lead="1" data-sc="${col}" data-ec="${col}" ${attr} data-sday="${k}" style="top:${lt + lane * ls}px;left:1px;width:calc(100% - 2px);z-index:3" aria-hidden="true">${mark}<span class="st">${esc(title)}</span></span>`;
      };
      for (const r of ts) { const done = pend.has(r.itemId) ? pend.get(r.itemId) === true : !!r.done; put(`data-task="${esc(r.itemId)}"`, `<i class="cbox${done ? ' on' : ''}"></i>`, r.title || '（題名なし）'); }
      for (const c of ns) put(`data-note="${esc(c.id)}"`, '<i class="cpaper"></i>', c.title || EMPTY_TITLE);
    });
  }
  const full = dyn ? assignSharedLanes(wev, days, 99).items : null; // 閉じた7段の読み上げはマスの段の順（品質⑤）
  days.forEach((k, col) => {
    const es = eventsOnDay(wev, k), d = parseKey(k), dow = d.getDay();
    if (full) { const rank = new Map(full.filter((b) => b.sc <= col && b.ec >= col).map((b) => [b.e.id, b.lane])), r2 = (e) => (rank.has(e.id) ? rank.get(e.id) : 999); es.sort((a, b) => r2(a) - r2(b)); }
    const r = rkOf(k), label = dyn && d.getDate() === 1 ? `<small class="mo">${d.getMonth() + 1}/</small>1` : d.getDate() === 1 ? (state.rokuyo ? `${d.getMonth() + 1}/1` : `${d.getMonth() + 1}月1日`) : d.getDate(); // 六曜オンの1日は「11/1」（左の六曜とぶつかるため）
    const tn = tk?.get(k) || 0; // 月にタスクの件数（開いた画面だけ。タスク名は出さない）
    const dots = mode === 'simple' ? `<span class="dots">${es.slice(0, cap).map((e) => `<i class="dot ${catCls(e)}"${catSty(e)}></i>`).join('')}</span>` : '';
    const ps = PS.on ? PS.days.includes(k) : false, pSrc = PS.on && k === PS.srcDay;
    const extra = mode === 'simple' ? es.length - cap : hidden[col] + xhid[col];
    const kinds = dyn ? ([es.length ? `予定${es.length}件${xCount(es)}` : '', xn[col].t ? `タスク${xn[col].t}件` : '', xn[col].n ? `ノート${xn[col].n}件` : ''].filter(Boolean).join('、')) : ''; // 35 §2.3: 件数を種類ごとに（0 件の種類は言わない。何もない日は日付だけ。品質 L-2）
    html += `<button type="button" class="day${extra > 0 && k === sel ? ' selplus' : ''}${cur !== null && d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}${dow === 6 ? ' sat' : dow === 0 ? ' sun' : ''}${state.holidayRed && holName(k) ? ' hol' : ''}${ps ? ' psel' : ''}${pSrc ? ' psrc' : ''}" data-date="${k}" aria-label="${dyn ? dynDayLabel(k) : `${dayLabel(k)}${holSpoken(k)}${r ? `、${r.name}` : ''}`}${dyn ? (kinds ? `、${kinds}` : '') : `、予定${es.length}件${xCount(es)}`}${es.length ? `：${es.map((x) => xname(x) + spokenAt(x, k) + x.title).join('、')}` : ''}${!dyn && NB.marks.has(k) ? '、ノートあり' : ''}${tn ? `、未完了のタスク${tn}件` : ''}${PS.on ? `${pSrc ? '、コピー元' : ''}、${ps ? '選択中。この日を外す' : 'この日を選ぶ'}` : ''}" aria-pressed="${PS.on ? ps : k === sel}"${dyn ? ` aria-selected="${k === sel}"` : ''}>${pSrc ? '<span class="pcsrc" aria-hidden="true">コピー元</span>' : ''}${ps ? '<i class="pck" aria-hidden="true">✓</i>' : ''}${r ? `<span class="rk" aria-hidden="true">${r.name}</span>` : ''}<span class="num${state.rokuyo && d.getDate() === 1 ? ' sd' : ''}">${label}</span>${tn ? `<span class="tkn" aria-hidden="true">✓${tn}</span>` : ''}${NB.marks.has(k) && !dyn ? '<i class="mline" aria-hidden="true"></i>' : ''}${dots}${inCell[col]}</button>`;
    if (dyn) html += `<span class="plus dyn" data-plus="${k}" data-col="${col}" data-hid="${Math.max(0, extra)}" style="right:calc(${6 - col} * 100% / 7 + 4px)" aria-hidden="true" hidden></span>`;
    else if (extra > 0 && plusLane >= 0) html += `<span class="plus pn" data-plus="${k}" style="${colPos(col, col)};top:${lt + plusLane * ls}px" aria-hidden="true">+${extra + dropped[col]}</span>`;
    else if (extra > 0) html += `<span class="plus${k === sel ? ' onsel' : ''}" data-plus="${k}" style="right:calc(${6 - col} * 100% / 7)" aria-hidden="true">+${extra}</span>`;
  });
  if (mode === 'simple') return html;
  html += pasteGhostHtml(w, cap, lt, ls);
  if (!dyn) for (const b of items) {
    const { e } = b, top = `top:${lt + b.lane * ls}px`;
    if (b.band) {
      const when = dayOf(e.start) === dayOf(e.end) ? `${dayLabel(dayOf(e.start))} 終日` : `${dayOf(e.start)}から${dayOf(e.end)}`;
      const bl = dayOf(e.start) < days[0] ? 0 : 1.5, br = dayOf(e.end) > days[6] ? 0 : 1.5; // 始まりと終わりの側だけ、時刻つきのチップと同じ 1.5 の内寄せ（週をまたいで続く側は端まで）
      const o1 = cur !== null && parseKey(days[b.sc]).getMonth() !== cur && parseKey(days[b.ec]).getMonth() !== cur;
      html += `<span class="bar ${catCls(e)}${o1 ? ' outm' : ''}${dayOf(e.start) < days[0] ? ' cl' : ''}${dayOf(e.end) > days[6] ? ' cr' : ''}" data-lane=""${b.lane}" data-sc="${b.sc}" data-ec="${b.ec}" data-event="${esc(e.id)}" style="${catVar(e)}left:calc(${b.sc} * 100% / 7 + ${bl}px);width:calc(${b.ec - b.sc + 1} * 100% / 7 - ${bl + br}px);${top}" aria-hidden="true" title="${esc(`${e.title} ${when}`)}"><span class="bt"><span class="st">${esc(e.title)}</span></span></span>`;
    } else {
      const k = days[b.sc];
      html += `<span class="strip ${catCls(e)}${cur !== null && parseKey(k).getMonth() !== cur ? ' outm' : ''}" data-lane=""${b.lane}" data-sc="${b.sc}" data-ec="${b.ec}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}${colPos(b.sc, b.ec)};${top}" aria-hidden="true"><span class="st">${time ? `${chipTime(e.start)} ` : ''}${esc(e.title)}</span></span>`;
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
  const empty = ''; // 空の日の「サンプルを入れる」は時間軸の上に出さない（ホームの次の予定カードの中だけ。L-07）
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
  return `<button type="button" class="tlev fev ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" data-s="${s}" data-en="${en}" data-fk="${k}:${i}" style="${catVar(e)}--m:${s};--d:${en - s};left:calc(var(--ins) + ${col} * (100% - 2 * var(--ins)) / ${n});width:calc((100% - 2 * var(--ins)) / ${n} - ${gap}px)" aria-label="${esc(lab)}"><span class="ftl">${xi(e)}${esc(t)}</span>${week ? '' : `<span class="ftm">${t0(hhmm(s))}〜${t0(hhmm(en))}${bell(e)}</span>`}</button>`;
}
function foldPaper(g, ks, week) {
  let lines = '';
  for (let h = 0; h <= 24; h++) {
    lines += `<i class="fhl" style="--m:${h * 60}"></i>`;
    if (h < 24) lines += `<i class="fhl half" style="--m:${h * 60 + 30}"></i>`;
  }
  const cols = ks.map((k) => `<div class="tlcol${k === todayKey() ? ' ftd' : ''}" data-day="${k}">${dayBlocks(k, 30).map((b, i) => foldBlock(b, k, i, week)).join('')}</div>`).join('');
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
    const ny0 = nowIn(w) ? labelY(now, w.t[0], w.t[1], w.h, w.bottom) : null;
    for (const h of w.el.querySelectorAll('.fh')) {
      const m = Number(h.dataset.m), y = labelY(m, w.t[0], w.t[1], w.h, w.bottom);
      const hide = y == null || (ny0 != null && Math.abs(y - ny0) < 7 + 12); // 札（高さ14）から上下 12 以内は出さない（H-08）
      h.style.visibility = hide ? 'hidden' : '';
      if (!hide) h.style.top = `${r2(y)}px`;
    }
    const nt = w.el.querySelector('.fnt'), ny = nowIn(w) ? labelY(now, w.t[0], w.t[1], w.h, w.bottom) : null;
    nt.hidden = ny == null;
    if (ny != null) { nt.style.top = `${r2(ny)}px`; nt.textContent = t0(hhmm(now)); }
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
const MP = { a1: '', anchor: '', shrunk: false, drag: null, scroll: 0, cs: 0, swallow: 0 }; // anchor: 1週・2週で見せる先頭の週。shrunk: 日の部分のスクロールで一時的に 1週へ縮んでいる
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
    const t = e.all || dayOf(e.start) !== k ? '終日' : t0(e.start.slice(11));
    return `<button type="button" class="mdev ${catCls(e)}"${catSty(e)} role="listitem" data-event="${esc(e.id)}" data-sday="${k}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><i class="mdbar" aria-hidden="true"></i><span class="mdt">${t}${bell(e)}</span><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
  }).join('')}</div>`;
}
function pullDayTasks(k) {
  const all = homeTaskList();
  if (!all) return '';
  const pend = doneCtl.pending();
  const rows = all.filter((r) => r?.due?.date === k).map((r) => {
    const done = pend.has(r.itemId) ? pend.get(r.itemId) === true : !!r.done;
    return `<div class="htask mdtask${done ? ' done' : ''}"><button type="button" class="rmckb" data-act="remck" data-id="${esc(r.itemId)}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}、${esc(r.title || '')}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button><span class="htt">${esc(r.title || '')}</span>${r.due.time ? `<small class="hdue">${esc(r.due.time)}</small>` : ''}</div>`;
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
  if (kind === 'browse') return stageHtml();
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
  state.monthForm = f;
  if (STG_FORM[state.stage] !== f) state.stage = { month: 1, two: 4, one: 7 }[f]; // 開いた縦と段を共有（design/34 §10）
  saveUi();
  paintPull(f);
  if (speak) say(`月を${MFORM_NAME[f]}の表示にしました。`);
}
const mpHeights = (kind) => MFORMS.map((f) => PULL_CFG[kind][f].rows * PULL_CFG[kind][f].h);
// つまみ: 上下に引く。閉じた画面は引いた量だけ月の高さが変わり、離すと一番近い型へ 0.25 秒で寄る。開いた縦は月の高さが全部 297 なので、引いた量で型だけ切り替える。
root.addEventListener('pointerdown', (ev) => {
  const g = ev.target.closest?.('.mgrab'); if (!g || !ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  if (g.closest('.mpull.browse')) { stageDown(ev); return; }
  const kind = pullKind(), grid = root.querySelector('.mgrid'); if (!grid) return;
  MP.drag = { id: ev.pointerId, y0: ev.clientY, kind, form0: state.monthForm, h0: grid.getBoundingClientRect().height, moved: false, form: state.monthForm };
});
window.addEventListener('pointermove', (ev) => {
  if (ST.drag) { stageMove(ev); return; }
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
  if (ST.drag) { stageUp(ev); return; }
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
window.addEventListener('pointercancel', (ev) => { if (ST.drag && ev.pointerId === ST.drag.id) { stageCancel(); return; } if (MP.drag && ev.pointerId === MP.drag.id) { MP.drag = null; root.querySelector('.mpull')?.classList.remove('dragging'); const g = root.querySelector('.mgrid'); if (g) g.style.height = ''; paintPull(); } });
root.addEventListener('keydown', (ev) => {
  const g = ev.target.closest?.('.mgrab'); if (!g || !['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
  ev.preventDefault();
  if (g.closest('.mpull.browse')) { stageKey(ev.key === 'ArrowUp' ? 1 : -1); return; } // ↑ で段が進む（格子が低くなる）。design/34 §12 Q-6
  const i = MFORMS.indexOf(state.monthForm) + (ev.key === 'ArrowDown' ? 1 : -1);
  if (i >= 0 && i <= 2) { setMonthForm(MFORMS[i]); root.querySelector('.mgrab')?.focus({ preventScroll: true }); }
});
// ---------- 閉じた画面の引きの7段（第19.2版 S11a、design/34 §2〜§5・§12） ----------
// 段 1〜3＝月 6週（4/3/2件）、4〜6＝2週（4/3/2件）、7＝1週（4件）。H＝格子の高さ。指に 1:1 で追い、離すと一番近い段へ寄る。
// 格子は自分の高さで切り（.mgwrap/.week の overflow）、行数が変わる境（H=248・97）では前の格子を 0→0.08 秒で消してから次の格子を 0.08→0.20 秒で出す（重ねない）。
const STG = [null, { rows: 6, cap: 4, H: 516 }, { rows: 6, cap: 3, H: 420 }, { rows: 6, cap: 2, H: 324 }, { rows: 2, cap: 4, H: 172 }, { rows: 2, cap: 3, H: 140 }, { rows: 2, cap: 2, H: 108 }, { rows: 1, cap: 4, H: 86 }];
const STG_FORM = [null, 'month', 'month', 'month', 'two', 'two', 'two', 'one'];
const STG_NAME = [null, '月・4件', '月・3件', '月・2件', '2週・4件', '2週・3件', '2週・2件', '1週・4件'];
const STG_MID = [468, 372, 248, 156, 124, 97]; // 段 n と n+1 の境の H（隣り合う段の高さのちょうど中間）
const STG_ROWS = { m: 6, w2: 2, w1: 1 };
const STG_VWIN = 80;
const STG_EASE = (x1, y1, x2, y2) => (t) => { // cubic-bezier（CSS と同じ）
  let lo = 0, hi = 1, u = t;
  const bx = (v) => 3 * (1 - v) ** 2 * v * x1 + 3 * (1 - v) * v * v * x2 + v ** 3, by = (v) => 3 * (1 - v) ** 2 * v * y1 + 3 * (1 - v) * v * v * y2 + v ** 3;
  for (let i = 0; i < 30; i++) { u = (lo + hi) / 2; if (bx(u) < t) lo = u; else hi = u; }
  return by(u);
};
const stgSnapEase = STG_EASE(0.16, 1, 0.3, 1);
const stgKindOf = (n) => (n <= 3 ? 'm' : n <= 6 ? 'w2' : 'w1');
// H に一番近い段。ちょうど境のとき、up（上へ＝v が負）なら段の数字が大きい方、そうでなければ小さい方（§12 Q-7）。
const stgOfH = (h, up = false) => { let n = 1; while (n < 7 && (up ? h <= STG_MID[n - 1] + 0.05 : h < STG_MID[n - 1] - 0.05)) n++; return n; };
try { window.__duoHapticLog = window.__duoHapticLog || []; } catch { /* */ } // 触覚ログ（品質の試験が見る口。段の境をまたぐたびに1件）
const ST = { n: 1, kind: 'm', H: 516, tok: 0, raf: 0, drag: null, snapping: false, land: false };
const stageNow = () => state.stage;
// いま出している格子の型。閉じた横（§14）は段を使わず、いつも月（6週）。段そのもの（state.stage）は横の間は書き換えない
const stgKindNow = () => (closedLand() ? 'm' : stgKindOf(stageNow()));
function stageWeeks(kind) {
  const sel = state.selected;
  if (kind === 'm') {
    const ws = monthWeeks(sel);
    while (ws.length < 6) ws.push(Array.from({ length: 7 }, (_, i) => addDays(ws[ws.length - 1][0], 7 + i))); // 6週をいつも出す（前後の月の日も）
    return ws;
  }
  if (kind === 'w2') return pullWeeks('two');
  if (!MP.a1 || sel < MP.a1 || sel >= addDays(MP.a1, 7)) MP.a1 = sel; // 1週は選んだ日から7日。たたいても並びは動かさない
  return [Array.from({ length: 7 }, (_, i) => addDays(MP.a1, i))];
}
const stageWdInner = (kind, days) => {
  const heads = kind === 'w1' ? days.map((k) => { const i = parseKey(k).getDay(); return { i, label: DOW[i] }; }) : weekdayHeads();
  return heads.map(({ i, label }) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${label}</span>`).join('');
};
function stageHead(ws = stageWeeks(stgKindNow())) {
  if (PS.on) return `<div class="mph pasting">${pasteBand()}</div>`;
  const d = parseKey(state.selected);
  // 第19.2版 S11c（design/34 §2.1・§9.1-1〜3・§12 Q-11）: ‹ ›・全部・今日は出さない。見出しをたたくと今日へ。今日が画面にないときだけ右端に「今日へ」
  return `<div class="mph${root.querySelector('.mpull.browse[data-stage] .mph.scrd') && !closedLand() ? ' scrd' : ''}"${sheetOverHead() ? ' inert' : ''}><button type="button" class="vh" data-act="prev" aria-label="前の月">前の月</button><h2 id="ctitle">${d.getFullYear()}年${d.getMonth() + 1}月</h2><button type="button" class="vh" data-act="next" aria-label="次の月">次の月</button>${closedLand() ? '' : `<span class="mpdate" aria-hidden="true">${d.getDate()}日<span class="mpdw">（${DOW[d.getDay()]}）</span></span>`}<button type="button" class="mptoday" data-act="mptoday" aria-label="今日へ"${ws.some((w) => w.includes(todayKey())) ? ' hidden' : ''}>今日へ</button></div>`; // 第19.3版: .mpdate＝格子が見出しの下へ流れ切ったときだけ出す「12日（木）」（design/33 §2。paintMpScroll）
}
function stageGridHtml(kind, H, ws = stageWeeks(kind)) {
  const sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth(), tk = monthTaskCounts('browse');
  const weeks = ws.map((days) => `<div class="week named" data-wk="${days[0]}">${weekInner(weekData(days, 4), { mode: 'named', cur: kind === 'm' ? cur : null, sel, today, cap: 4, time: state.monthTimeClosed, tk, lt: 22, ls: 16, dyn: true })}</div>`).join('');
  return `<div class="mgrid" data-kind="${kind}" data-rows="${STG_ROWS[kind]}"${ST.land ? ` data-cap="${POS.land?.cap ?? 2}"` : ''} style="--rh:${H / STG_ROWS[kind]}px">${weeks}</div>`;
}
function stageHtml() {
  cancelAnimationFrame(ST.raf); ST.raf = 0; ST.tok++; ST.drag = null; ST.snapping = false;
  // 閉じた横（design/34 §14）: 格子（月・6週、行 60・2件）と日の欄を左右に並べる。つまみ（上）と段は使わない（data-stage を付けない。state.stage はそのまま）
  const land = closedLand(), n = stageNow(), kind = land ? 'm' : stgKindOf(n), H = land ? (POS.land?.H ?? 360) : STG[n].H;
  ST.n = n; ST.kind = kind; ST.H = H; ST.land = land;
  const ws = stageWeeks(kind);
  const grab = land ? '' : `<div class="mgrab" role="slider" tabindex="0" aria-label="月の大きさ。上下に引いて変える" aria-orientation="vertical" aria-valuemin="1" aria-valuemax="7" aria-valuenow="${n}" aria-valuetext="${STG_NAME[n]}"><i aria-hidden="true"></i></div>`;
  return `<section class="calendar mpull browse${land ? ' land' : ''}" aria-label="カレンダー"${land ? ' data-land="1" data-form="month"' : ` data-stage="${n}" data-form="${STG_FORM[n]}" data-scroll="stg"`} style="--H:${H}px;--chip-h:14px;--chip-fs:10px;--date-h:22px"><div class="mpfix">${stageHead(ws)}<button type="button" class="mrpick vh" data-act="pickrange">期間を選ぶ</button><div class="weekdays">${stageWdInner(kind, ws[0])}</div></div><div class="mgwrap">${stageGridHtml(kind, H, ws)}</div>${grab}${stageDayHtml()}</section>`;
}
// ---- 閉じた7段の日の欄（design/34 §6）。見出し44・終日のベタ塗りチップ・高さ56のカード・つまみ（下）・ノート。開いた縦の pullDayHtml は変えない。
// 第19.3版 その2（征希さん「閉じた時の表示は『カード・時間』で分けるだけ」・design/35 §5）: 日の欄は見出しの右の「カード｜時間」でたたいて切り替える。つまみ（下）の A→B→C の3段と、下の端への貼り付き（S11f〜S11j の T の境）はやめた。
// 時間のときだけ、見出しのすぐ下にグレーのバー（.mdgrab）を置き、下へ引くと1時間の高さが 28（最低限）→88（詳細）に広がる（指に 1:1 の半分＝引いた量×0.5。離すと 58 を境に近い方へ 0.25 秒）。バーは貼り付けず、画面と一緒に流れる
const DAYBAR = { min: 28, max: 88, snap: 58, rate: 0.5, rubber: 0.3, rubberMax: 24, flick: 300 }; // design/35 §5.3（flick＝離す前 80ms の速さがこれ（毎秒）を超えたら払った向きへ）
const DG = { mode: state.dayGrip, hh: state.dayGrip === 2 ? DAYBAR.max : DAYBAR.min, last: state.dayGrip || 1, drag: null, raf: 0, swap: 0, tlKey: '', unfold: false }; // mode 0=A カード、1=B 時間・最低限（1時間 28）、2=C 時間・詳細（88）。hh は1時間の高さ。state.dayGrip に覚える（保存の形・値の範囲 0〜2 は v19.2 のまま。古い 1 は「時間・最低限」として読む）。last＝最後に見ていた時間の段（「時間」をたたいたときに戻る先。覚えるのはこの起動の間だけ）
const DG_EASE = STG_EASE(0.16, 1, 0.3, 1);
const dayMode = () => DG.mode;
const dayNth = (e, k) => { const n = Math.round((parseKey(dayOf(e.end)) - parseKey(dayOf(e.start))) / 864e5) + 1; return n > 1 ? `（${Math.round((parseKey(k) - parseKey(dayOf(e.start))) / 864e5) + 1}/${n}日目）` : ''; };
const dayEndText = (e, k) => {
  const ed = dayOf(e.end), hm = t0(e.end.slice(11, 16));
  if (e.end <= e.start || ed === k) return ed === k && e.end > e.start ? hm : t0(e.start.slice(11, 16)); // 終わりがない予定（終わり＝始まり）は始まりと同じ時刻
  const gap = Math.round((parseKey(ed) - parseKey(k)) / 864e5);
  return gap === 1 ? `翌 ${hm}` : `${parseKey(ed).getMonth() + 1}/${parseKey(ed).getDate()} ${hm}`;
};
// 品質⑤: 終日の予定の並びは、マスの段（lane）の順を正とする（複数日の帯が先）。日の欄の終日チップとマスの読み上げをこの順にそろえる
function stageLaneRank(k) {
  const days = stageWeeks(stgKindNow()).find((w) => w.includes(k)); if (!days) return null;
  const col = days.indexOf(k);
  return new Map(assignSharedLanes(occIn(days[0], days[6]), days, 99).items.filter((b) => b.sc <= col && b.ec >= col).map((b) => [b.e.id, b.lane]));
}
// ---- 第19.3版 その3（征希さん「メモもカードで分ける」「タスクもカード表示できれば自由に移動できる」・design/35 §1〜§3）: 日の欄のカード
// 予定・タスク・ノートは同じ箱（高さ 56・角丸 14・白・間 8、題名は左 68）。種類は印の形（時刻2行と色の線／四角 20／角の折れた紙 16×20）・区画の見出しの文字・読み上げの頭の語で分ける（色だけに頼らない）。
// カードの面に日付は出さない（予定の時刻は出す）。読み上げは「種類、状態、時刻・期限、題名、添え」（35 §2.3）。
const hmSpoken = (t) => String(t).replace(/(\d{1,2}):(\d\d)/g, (_, h, m) => `${Number(h)}時${m}分`).replace(/^翌 /, '翌日');
const PAPER_SVG = '<svg class="mdpaper" viewBox="0 0 16 20" width="16" height="20" aria-hidden="true"><path d="M1.625 1.625h8.75l4 4v12.75H1.625z" fill="#F7F4ED" stroke="#68716A" stroke-width="1.25" stroke-linejoin="round"/><path d="M10.375 1.625v4h4" fill="none" stroke="#68716A" stroke-width="1.25" stroke-linejoin="round"/><path d="M4.5 10.5h7M4.5 14h7" stroke="#68716A" stroke-width="1"/></svg>';
function evCardLabel(e, k, memo) {
  const al = hasBell(e) ? (Array.isArray(e.alarms) ? alarmsAria(e.alarms).replace(/^通知 /, '').split('、').map((x) => `${x}に通知`) : ['通知']) : [];
  return ['予定', hmSpoken(dayOf(e.start) < k ? '0:00' : t0(e.start.slice(11, 16))), `${hmSpoken(dayEndText(e, k))}まで`, e.title || '題名なし', memo, e.recurring ? '繰り返し' : '', ...al, e.nativeLink?.state === 'linked' ? 'iPhone にも追加済み' : '', isX(e) ? `iPhone、${e.calName}` : ''].filter(Boolean).join('、');
}
function evAllLabel(e, k) {
  const n = Math.round((parseKey(dayOf(e.end)) - parseKey(dayOf(e.start))) / 864e5) + 1, i = Math.round((parseKey(k) - parseKey(dayOf(e.start))) / 864e5) + 1;
  return ['予定', '終日', e.title || '題名なし', n > 1 ? `${n}日間のうち${i}日目` : '', e.recurring ? '繰り返し' : '', e.nativeLink?.state === 'linked' ? 'iPhone にも追加済み' : '', isX(e) ? `iPhone、${e.calName}` : ''].filter(Boolean).join('、');
}
// その日が期限のタスク（削除待ちを除く）。未完了（時刻つきが先・時刻順 → 作った順）→ 完了（一番下。完了の 1.5 秒の待ちの間は元の位置のまま）
function dayTaskRows(k) {
  const all = homeTaskList(); if (!all) return [];
  const key = (r) => `${r.done ? 1 : 0}${r.due.time ? `0${r.due.time}` : '1'}`;
  return all.filter((r) => r?.due?.date === k).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
}
const noteCardById = (id) => { for (const [day, l] of NB.cards) { const c = l.find((x) => x.id === id); if (c) return { ...c, day }; } return null; };
const taskSrcText = (r) => { if (!r.source) return ''; const c = noteCardById(r.source.noteId); return c ? `ノート「${c.title || EMPTY_TITLE}」から` : ''; };
// 読み上げだけの操作（35 §6.8。VoiceOver のカスタムアクションの代わりに、カードのすぐ後ろへ隠したボタン 3 つ）
const cardActs = (kind, id, k, rec = false) => `<span class="mdacts">${[['pick', rec ? 'この回の日付を移す' : '日付を移す'], ['prev', rec ? 'この回を1日前へ' : '1日前へ'], ['next', rec ? 'この回を1日後へ' : '1日後へ']].map(([h, l]) => `<button type="button" class="vh" data-act="cardmv" data-how="${h}" data-kind="${kind}" data-id="${esc(id)}" data-day="${k}">${l}</button>`).join('')}</span>`;
function dayTaskCards(k) {
  const rows = dayTaskRows(k); if (!rows.length) return '';
  const pend = doneCtl.pending(), today = todayKey();
  const cs = rows.map((r) => {
    const done = pend.has(r.itemId) ? pend.get(r.itemId) === true : !!r.done, over = !done && k < today;
    const src = taskSrcText(r), memo = (r.notes || '').split('\n').find((x) => x.trim()) || '';
    const sub = [r.due.time ? `${t0(r.due.time)} まで` : '', src].filter(Boolean).join('・') || memo.trim();
    const lab = ['タスク', done ? '完了' : '未完了', over ? '期限切れ' : '', r.title || '題名なし', r.due.time ? `${hmSpoken(t0(r.due.time))}まで` : '', src].filter(Boolean).join('、');
    const id = esc(r.itemId);
    return `<div class="mdcard mdk-task${done ? ' done' : ''}${over ? ' over' : ''}" role="listitem" data-task="${id}" data-sday="${k}"><button type="button" class="mdopen" data-act="remedit" data-id="${id}" aria-label="${esc(lab)}"><strong${r.title ? '' : ' class="mdnt"'}>${r.title ? esc(r.title) : '（題名なし）'}${r.alarms?.length ? BELL : ''}</strong>${sub || over ? `<small>${over ? `<b class="mdover">期限切れ</b>${sub ? ' ' : ''}` : ''}${esc(sub)}</small>` : ''}</button><button type="button" class="mdck rmckb" data-act="remck" data-id="${id}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}、${esc(r.title || '題名なし')}"><span class="rmck" aria-hidden="true"></span></button></div>${cardActs('task', r.itemId, k)}`;
  }).join('');
  return `<button type="button" class="mdsh mdtsh" data-act="tasklist" aria-label="タスクのページを開く"><span aria-hidden="true">タスク ›</span></button><div class="mdcards mdtasks" role="list" aria-label="タスク">${cs}</div>`;
}
function dayNoteCards(k) {
  const list = NB.cards.get(k) || []; if (!list.length) return '';
  const cs = list.map((c) => `<button type="button" class="mdcard mdk-note" role="listitem" data-act="cardnote" data-note="${esc(c.id)}" data-sday="${k}" aria-label="${esc(['ノート', c.title || EMPTY_TITLE, c.sub].filter(Boolean).join('、'))}">${PAPER_SVG}<strong${c.title ? '' : ' class="mdnt"'}>${esc(c.title || EMPTY_TITLE)}</strong>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</button>${cardActs('note', c.id, k)}`).join('');
  return `<button type="button" class="mdsh mdnl" data-act="notelist" aria-label="ノートの一覧"><span aria-hidden="true">ノート ›</span></button><div class="mdcards mdnotes2" role="list" aria-label="ノート">${cs}</div>`;
}
function stageDayHtml() {
  const k = state.selected, d = parseKey(k), mode = dayMode(), r = rkOf(k), hn = holName(k);
  const list = eventsOnDay(occIn(k, k), k);
  const land = closedLand();
  const sw = `<div class="mdsw mdct" role="group" aria-label="日の見せ方">${[['card', 'カード', !mode], ['time', '時間', !!mode]].map(([v, l, on]) => `<button type="button" data-dg="${v}" aria-pressed="${on}">${l}</button>`).join('')}</div>`;
  const head = `<div class="mdh"><h3><span class="hdt${isRed(k) ? ' hol' : ''}">${d.getMonth() + 1}月${d.getDate()}日</span><span class="hdw">${DOW[d.getDay()]}${hn ? ` ${esc(hn)}` : ''}${r ? ` ${r.name}` : ''}</span></h3>${land ? '' : sw}</div>${land ? `<div class="mdctrow">${sw}</div>` : ''}`; // 第19.3版 その2（35 §5.1）: 見出しの右に「カード｜時間」（132×32、押せる 66×44）。閉じた横は見出しの下の行（幅いっぱい×32、押せる高さ 44）
  let body;
  if (mode) body = timelineHtml([k], Math.max(0, (closedLand() && POS.land ? POS.land.dayW : safeW() - 24) - 50), 'mday', DG.hh);
  else {
    const rank = stageLaneRank(k), rk2 = (e) => (rank?.has(e.id) ? rank.get(e.id) : 999);
    const alls = list.filter((e) => e.all).sort((a, b) => rk2(a) - rk2(b)), cards = list.filter((e) => !e.all).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const chips = alls.map((e) => { const cs = catSet(e); return `<button type="button" class="mdallday ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${setVars(cs)}--cat-edge:${cs.edge}" aria-label="${esc(evAllLabel(e, k))}">${xi(e)}${rep(e)}<span class="mdat">${esc(e.title)}</span>${dayNth(e, k) ? `<small>${dayNth(e, k)}</small>` : ''}</button>`; }).join('');
    const cs = cards.map((e) => {
      const memo = (e.notes || '').split('\n').find((x) => x.trim()) || '';
      return `<button type="button" class="mdcard mdk-event ${catCls(e)}" role="listitem" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}" aria-label="${esc(evCardLabel(e, k, memo.trim()))}"><span class="mdt1">${dayOf(e.start) < k ? '0:00' : t0(e.start.slice(11, 16))}</span><span class="mdt2">${dayEndText(e, k)}</span><i class="mdln" aria-hidden="true"></i><strong${e.title ? '' : ' class="mdnt"'}>${xi(e)}${rep(e)}${e.title ? esc(e.title) : '（題名なし）'}${bell(e)}</strong>${memo ? `<small>${esc(memo)}</small>` : ''}</button>${cardActs('event', e.id, k, !!e.recurring)}`;
    }).join('');
    body = `${chips ? `<div class="mdad">${chips}</div>` : ''}${cs ? `<div class="mdcards mdevs" role="list" aria-label="予定">${cs}</div>` : ''}${list.length ? '' : '<p class="mdnone2">予定はありません</p>'}`;
  }
  // 35 §5.2・§5.3: カードにバーは出さない（要素ごと無い）。時間のときだけ、見出しのすぐ下に「時間の幅」のバー
  const grab = mode ? `<div class="mdgrab" role="slider" tabindex="0" aria-label="時間の幅。下へ引くと広がり、上へ引くと戻る" aria-orientation="vertical" aria-valuemin="1" aria-valuemax="2" aria-valuenow="${mode}" aria-valuetext="${mode === 2 ? '詳細' : '最低限'}"><i aria-hidden="true"></i></div>` : '';
  // 35 §3: 予定 →「タスク ›」→ タスクのカード →「ノート ›」→ ノートのカード →「＋ タスク」「＋ ノート」（中身のない区画は見出しごと出さない。時間のときも、時間軸の下に同じ区画）
  // ノートの一覧の入口（34 §9.1-7 の「ノート ›」）: 閉じた画面ではここだけが入口。その日にノートが無くて区画の見出しを出さないときは、同じ「ノート ›」を「＋」の行の右端に置く（いつも 1 つだけ出る）
  const nc = dayNoteCards(k);
  const rest = `<div class="mdrest">${dayTaskCards(k)}${nc}<div class="mdadd"><button type="button" data-act="addtask" data-day="${k}" aria-label="${esc(dayLabel(k))}が期限のタスクを足す">＋ タスク</button><button type="button" data-act="addnote" data-day="${k}" aria-label="${esc(dayLabel(k))}のノートを足す">＋ ノート</button>${nc ? '' : '<button type="button" class="mdnl mdnlx" data-act="notelist" aria-label="ノートの一覧"><span aria-hidden="true">ノート ›</span></button>'}</div></div>`;
  // 第19.3版: 閉じた縦は .mpull が1本でスクロールする。.mday は「スクロール 0 で見えている日の欄」の箱（高さは今までどおり 画面−88−H）、中身は .mdin が持ち、箱の下へあふれて続く。閉じた横は .mdin を箱にしない（display:contents。今までどおり .mday の中がスクロール）
  return `<div class="mday" data-scroll="mday" data-dg="${'ABC'[mode]}"><div class="mdin">${head}${grab}<div class="mdbody">${body}</div>${rest}</div></div>`;
}
// 終日のチップは2行まで。入りきらない分は最後に「+N」チップ（#E4E0D6）。時間軸のときは開いた最初の予定の1時間前を見出しのすぐ下へ。
function dayAfterRender(el = root.querySelector('.mpull.browse .mday')) {
  if (!el) return;
  const ad = el.querySelector('.mdad');
  if (ad) {
    const chips = [...ad.querySelectorAll('.mdallday')]; ad.querySelector('.mdmore')?.remove(); chips.forEach((c) => { c.hidden = false; });
    const rowsOf = () => new Set(chips.filter((c) => !c.hidden).map((c) => c.offsetTop)).size;
    if (rowsOf() > 2) {
      const more = document.createElement('span'); more.className = 'mdmore'; ad.append(more);
      let hid = 0;
      const place = () => { more.textContent = `+${hid}`; };
      for (let i = chips.length - 1; i >= 0; i--) {
        chips[i].hidden = true; hid++; place();
        const vis = chips.filter((c) => !c.hidden); more.hidden = false;
        const rows = new Set([...vis, more].map((c) => c.offsetTop));
        if (rows.size <= 2) break;
      }
    }
  }
  if (el.dataset.dg === 'C') { // 時間軸・広い: 題名の下に「14:00〜15:00」
    const k = state.selected, list = eventsOnDay(occIn(k, k), k);
    for (const b of el.querySelectorAll('.tlev[data-event]')) {
      if (b.querySelector('.tr')) continue;
      const e = list.find((x) => x.id === b.dataset.event); if (!e) continue;
      const sp = document.createElement('span'); sp.className = 'tr'; sp.textContent = `${t0(e.start.slice(11, 16))}〜${t0(e.end.slice(11, 16))}`; b.append(sp);
    }
  }
  const tl = el.querySelector('.tl');
  // 時間軸を「開いたとき」（カードから切り替えた・日を選び直した・起動）だけ最初の予定の1時間前へ合わせる。同じ日・同じ時間軸の描き直し（閉じる⇄開く・バーで幅を変えた など）では、開いたままなら開いたまま（M8）
  const tk = tl ? `${state.selected}|${state.loaded ? 1 : 0}|${ST.land ? 'L' : 'P'}` : ''; const fresh = tk !== DG.tlKey; DG.tlKey = tk;
  if (tl) { // 第19.3版: 日の欄を中で送って合わせない。開いたときは最初の予定の1時間前より上を畳む（dayFold）。その2: 閉じた横も同じ（終日の行とバーが開いた位置で見える）
    if (fresh && el.dataset.dgFresh !== '0') DG.unfold = false;
    dayFold(el);
    updateNow(el); // 今の時刻の赤い線
  }
}
// 時間軸を開いたときに一番上に見せる時刻（分）＝最初の時刻つきの予定の1時間前。予定がない日は今（今日）か 9:00 の1時間前
function dayFoldMin() {
  const k = state.selected, ms = eventsOnDay(occIn(k, k), k).filter((e) => !e.all && dayOf(e.start) === k).map((e) => hmOfIso(e.start));
  const now = new Date(), min = ms.length ? Math.min(...ms) : (dkey(now) === k ? now.getHours() * 60 + now.getMinutes() : 9 * 60);
  return Math.max(0, min - 60);
}
// 第19.3版（閉じた画面の「時間」）: 画面は1本のスクロールで、スクロール 0 では月が見えている。日の欄の中を送って合わせる代わりに、時間軸の「最初の予定の1時間前」より上を畳んで、バー・終日の行のすぐ下から始める
//（時間軸の中身 .tlin を --foldm 分だけ上へずらし、.tl の上端で切る。1時間の高さ --hh が変わっても同じ時刻で切れる＝バーで幅を変えている間、バーのすぐ下の時刻の線は動かない。35 §5.3「伸ばす中心」）。
// その2（35 §5.3・品質 §11-1）: 終日の行は畳まない（バーのすぐ下に、開いた位置で必ず見える）。畳んだ分は、時間軸の右上の「前の時間」で開く（0:00 から。日を選び直す・カード⇔時間で畳み直す）。入れ子の縦スクロールは作らない
function dayFold(el) {
  const tl = el.querySelector('.tl'), body = el.querySelector('.mdbody'); if (!tl || !body) return;
  const m = DG.unfold ? 0 : dayFoldMin();
  tl.style.setProperty('--foldm', String(m));
  body.classList.toggle('folded', !DG.unfold);
  let b = el.querySelector('.mdfold');
  if (DG.unfold || !(m > 0)) { b?.remove(); return; }
  if (!b) { b = document.createElement('div'); b.className = 'mdfold'; b.innerHTML = '<button type="button" data-act="dayunfold"></button>'; tl.before(b); }
  const t = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  b.firstElementChild.textContent = '前の時間'; b.firstElementChild.setAttribute('aria-label', `0:00 から ${t} までの時間軸も表示`);
}
function dayUnfold() {
  const el = root.querySelector('.mpull.browse .mday'); if (!el || DG.unfold) return;
  DG.unfold = true; dayFold(el);
  el.querySelector('.mdgrab')?.focus({ preventScroll: true });
  say('0:00 からの時間軸を表示しました。');
}
// 日の欄の中身（見出し・バー・本体・ノート）。第19.3版で .mdin に入れた
const dayKids = (el) => [...(el.querySelector(':scope > .mdin') || el).children];
function paintDayPane(anim = false, keep = false) {
  const old = root.querySelector('.mpull.browse .mday'); if (!old) return;
  const st = old.scrollTop;
  old.insertAdjacentHTML('afterend', stageDayHtml()); old.remove();
  const el = root.querySelector('.mpull.browse .mday');
  if (keep) el.dataset.dgFresh = '0'; else DG.tlKey = ''; // 「カード｜時間」で切り替えたときは、開いた時間軸を最初の予定の1時間前へ合わせ直す。バーで幅を変えたとき（keep）はそのまま
  dayAfterRender(el); if (keep) el.scrollTop = st;
  if (!anim) return;
  // 前を 0.08 秒で消してから、次を 0.12 秒で出す（35 §5.1。見出しと切り替えは動かさない）。視差効果を減らす: 0.15 秒のフェード
  const kf = reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], tm = reduced() ? { duration: 150, easing: 'linear' } : { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };
  for (const k of dayKids(el)) if (!k.matches('.mdh, .mdctrow')) k.animate(kf, tm);
}
// M5（34 §9.4・設計レビュー 7c9fb05）: 日を選んだら、日の欄の中身（見出しも）を 0.15 秒で入れ替える。前を 0〜0.06 秒で消し切ってから、次を 0.06〜0.15 秒で出す（2つを同時に見せない）。
// 選んだ枠・見出しの月はすぐに変える。前の日の欄の箱をそのまま戻して消し、消えきった瞬間に次の箱（一番上）へ替える。.mday はいつも1つ。
function daySwap(old, st0) {
  const neu = root.querySelector('.mpull.browse .mday'); if (!neu || !old || neu === old) return;
  const tok = ++DG.swap;
  neu.replaceWith(old); old.scrollTop = st0; old.style.pointerEvents = 'none'; old.setAttribute('aria-hidden', 'true');
  const outs = dayKids(old).map((k) => k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 60, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }).finished.catch(() => {}));
  Promise.all(outs).then(() => {
    if (!old.isConnected) return; // 途中で描き直された（次の描画が正しい中身を出している）
    if (tok !== DG.swap) { old.replaceWith(neu); return; }
    old.replaceWith(neu); neu.scrollTop = 0; MP.scroll = neu.scrollTop;
    for (const k of dayKids(neu)) k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90, easing: 'linear' });
  });
}
const DAY_NAME = ['カード', '時間', '時間・詳細'];
function setDayMode(mode, announce = true, keep = false) {
  const was = dayMode();
  DG.hh = mode === 2 ? DAYBAR.max : DAYBAR.min; DG.mode = mode ? mode : 0; if (DG.mode) DG.last = DG.mode;
  if (state.dayGrip !== DG.mode) { state.dayGrip = DG.mode; saveUi(); }
  paintDayPane(was !== mode && (was === 0 || mode === 0), keep);
  if (announce && was !== mode) say(mode && was ? `時間の幅を${mode === 2 ? '詳細' : '最低限'}にしました。` : `日の欄を${DAY_NAME[mode ? 1 : 0]}にしました。`);
  if (mode && !was) dayBarHint();
}
// 「カード｜時間」をたたいた（35 §5.1）。時間は、最後に見ていた幅（最低限か詳細）で開く
function dayTab(to) {
  const m = to === 'time' ? (dayMode() || DG.last || 1) : 0;
  cancelAnimationFrame(DG.raf); DG.raf = 0; DG.drag = null;
  if (m !== dayMode()) setDayMode(m);
  root.querySelector(`.mpull.browse .mdct [data-dg="${to}"]`)?.focus({ preventScroll: true });
}
// 35 §5.4（§9.5 の続き）: 「時間」に初めて切り替えた1回だけ、バーの下に札「バーを下へ引くと、時間が広がります」（0.15 秒で出し、触れるか 6 秒で消す）
const BARHINT_KEY = `duo.hint.daybar${suffix}`;
const BARHINT = { el: null, timer: 0, done: (() => { try { return localStorage.getItem(BARHINT_KEY) !== null; } catch { return true; } })() };
function dayBarHint() {
  const md = root.querySelector('.mpull.browse .mday'), g = md?.querySelector('.mdgrab');
  if (BARHINT.done || !g || PS.on || anyPanel()) return;
  BARHINT.done = true; try { localStorage.setItem(BARHINT_KEY, '1'); } catch { /* 覚えられなくても1回は出す */ }
  const el = document.createElement('div'); el.className = 'mhint mbarhint'; el.setAttribute('role', 'note');
  el.innerHTML = '<span>バーを下へ引くと、時間が広がります</span>';
  g.after(el); BARHINT.el = el;
  const hide = () => {
    if (!BARHINT.el) return;
    clearTimeout(BARHINT.timer); document.removeEventListener('pointerdown', hide, true);
    const e = BARHINT.el; BARHINT.el = null; e.classList.add('out'); setTimeout(() => e.remove(), 170);
  };
  BARHINT.timer = setTimeout(hide, 6000);
  document.addEventListener('pointerdown', hide, true);
}
// バーの引き（35 §5.3）。1時間の高さ＝始めの高さ＋引いた量×0.5（28〜88）。端を超えた分はゴム（超えた引きの 0.3 倍、最大 24。バーと時間軸が指に少しついてくる）。58 をまたぐたびに触覚 1 回
const dayBarTl = () => root.querySelector('.mpull.browse .mday .tl');
function dayBarApply(hh, rub = 0) {
  const md = root.querySelector('.mpull.browse .mday'), tl = md?.querySelector('.tl'); if (!tl) return;
  const was = DG.hh; DG.hh = hh;
  tl.style.setProperty('--hh', `${hh}px`);
  if (rub) md.style.setProperty('--dgrub', `${rub}px`); else md.style.removeProperty('--dgrub');
  const g = md.querySelector('.mdgrab'), n = hh >= DAYBAR.snap ? 2 : 1;
  if ((was >= DAYBAR.snap) !== (hh >= DAYBAR.snap)) {
    feel('selection');
    try { (window.__duoHapticLog = window.__duoHapticLog || []).push({ dayBar: n, t: performance.now() }); } catch { /* */ } // 品質の試験が見る口（58 をまたいだ先。1＝最低限、2＝詳細）
    if (g) { g.setAttribute('aria-valuenow', String(n)); g.setAttribute('aria-valuetext', n === 2 ? '詳細' : '最低限'); }
  }
}
function dayGripSnap(toMode) {
  cancelAnimationFrame(DG.raf); DG.raf = 0;
  const md = root.querySelector('.mpull.browse .mday'), tl = md?.querySelector('.tl'); if (!tl) { setDayMode(toMode); return; }
  const hh1 = toMode === 2 ? DAYBAR.max : DAYBAR.min, h0 = DG.hh, r0 = parseFloat(md.style.getPropertyValue('--dgrub')) || 0, t0m = performance.now();
  const fin = () => { DG.raf = 0; dayBarApply(hh1, 0); setDayMode(toMode, true, true); };
  if (reduced() || (Math.abs(hh1 - h0) < 0.01 && !r0)) { fin(); return; }
  const f = (now) => { const x = Math.min(1, (now - t0m) / 250); if (x >= 1) { fin(); return; } const e = DG_EASE(x); dayBarApply(h0 + (hh1 - h0) * e, r0 * (1 - e)); DG.raf = requestAnimationFrame(f); };
  DG.raf = requestAnimationFrame(f);
}
root.addEventListener('pointerdown', (ev) => {
  const g = ev.target.closest?.('.mdgrab'); if (!g || !ev.isPrimary || (ev.pointerType === 'mouse' && ev.button !== 0) || !dayMode()) return;
  cancelAnimationFrame(DG.raf); DG.raf = 0;
  DG.drag = { id: ev.pointerId, y0: ev.clientY, hh0: DG.hh, moved: false, dy: 0, pts: [] };
});
window.addEventListener('pointermove', (ev) => {
  const d = DG.drag; if (!d || ev.pointerId !== d.id) return;
  const dy = ev.clientY - d.y0; d.dy = dy;
  d.pts.push({ t: ev.timeStamp, y: ev.clientY }); if (d.pts.length > 24) d.pts.shift();
  if (!d.moved && Math.abs(dy) < 6) return;
  d.moved = true;
  const raw = d.hh0 + dy * DAYBAR.rate, hh = Math.min(DAYBAR.max, Math.max(DAYBAR.min, raw));
  const over = (raw - hh) / DAYBAR.rate; // 端を超えた引き（指の量）
  dayBarApply(hh, Math.sign(over) * Math.min(DAYBAR.rubberMax, Math.abs(over) * DAYBAR.rubber));
});
const dayGripEnd = (ev) => {
  const d = DG.drag; if (!d || ev.pointerId !== d.id) return;
  DG.drag = null;
  if (!dayMode()) return;
  if (!d.moved) { if (ev.type === 'pointerup') dayGripSnap(DG.hh >= DAYBAR.snap ? 1 : 2); return; } // たたくと 28 ⇄ 88（0.25 秒）
  MP.swallow = performance.now() + 400;
  const w = d.pts.filter((p) => ev.timeStamp - p.t <= STG_VWIN); // 離す前 80ms の速さ（つまみ（上）と同じ測り方）
  const v = w.length >= 2 && w[w.length - 1].t > w[0].t ? ((w[w.length - 1].y - w[0].y) / (w[w.length - 1].t - w[0].t)) * 1000 : 0;
  dayGripSnap(Math.abs(v) > DAYBAR.flick ? (v > 0 ? 2 : 1) : DG.hh >= DAYBAR.snap ? 2 : 1); // 58 未満なら最低限、58 以上なら詳細。速く払ったら払った向きへ
};
window.addEventListener('pointerup', dayGripEnd);
window.addEventListener('pointercancel', (ev) => { if (DG.drag && ev.pointerId === DG.drag.id) { DG.drag = null; if (dayMode()) dayGripSnap(dayMode()); } });
root.addEventListener('keydown', (ev) => {
  const g = ev.target.closest?.('.mdgrab'); if (!g || (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp')) return;
  ev.preventDefault();
  const m = dayMode(), to = ev.key === 'ArrowDown' ? 2 : 1;
  if (m && to !== m) { cancelAnimationFrame(DG.raf); DG.raf = 0; setDayMode(to, true, true); root.querySelector('.mpull.browse .mdgrab')?.focus({ preventScroll: true }); }
});
// チップは入らなくなる前に消す（§4-3）: k 段目の下端 36+16k、行の高さとのあきが 2 以上で 1、0 以下で 0。消えた分は +N に足す（不透明度 0.5 を切ったら数える）。
const stgOp = (rh, k) => Math.min(1, Math.max(0, (rh - (36 + 16 * k)) / 2));
function stageFit(g) {
  const rh = parseFloat(g.style.getPropertyValue('--rh')); let vis = 0;
  const capL = g.dataset.cap ? Number(g.dataset.cap) : 0; // 閉じた横: 1マスの件数は §14.3 の式で決めた数（引かないので、途中の不透明度はない）
  for (let k = 0; k < 4; k++) { const o = capL ? (k < capL ? 1 : 0) : stgOp(rh, k); g.style.setProperty(`--o${k}`, String(Math.round(o * 1000) / 1000)); if (o >= 0.5) vis++; }
  if (g.dataset.vis === String(vis)) return;
  g.dataset.vis = String(vis);
  for (const w of g.children) {
    const hid = Array(7).fill(0);
    for (const c of w.querySelectorAll('[data-lane][data-lead]')) if (Number(c.dataset.lane) >= vis) for (let i = Number(c.dataset.sc); i <= Number(c.dataset.ec); i++) hid[i]++;
    for (const p of w.querySelectorAll('.plus.dyn')) { const n = Number(p.dataset.hid) + hid[Number(p.dataset.col)]; p.textContent = n ? `+${n}` : ''; p.hidden = !n; }
  }
}
function stageAfterRender() { for (const g of root.querySelectorAll('.mpull.browse .mgrid')) stageFit(g); dayAfterRender(); paintRange(); stageTodaySync(); hintMaybe(); paintMpScroll(root.querySelector('.mpull.browse[data-stage]')); }
// 「今日へ」は今日が格子に出ていないときだけ（design/34 §2.1）。格子を入れ替えたあとにも合わせる
function stageTodaySync() {
  const b = root.querySelector('.mpull.browse .mph .mptoday'); if (!b) return;
  b.hidden = !!root.querySelector(`.mpull.browse .mgrid:not([data-leaving]) .day[data-date="${todayKey()}"]`);
}
// 今日へ（§12 Q-11）: 段は変えない。今日を選び、格子を今日の月（2週・1週はその週）へ 0.30 秒で送り、日の欄を一番上へ。1週は並びを今日から始め直す
function stageToday() {
  const t = todayKey(), from = state.selected;
  const off = !root.querySelector(`.mpull.browse .mgrid:not([data-leaving]) .day[data-date="${t}"]`);
  MP.anchor = ''; MP.a1 = '';
  set({ selected: t });
  const md = root.querySelector('.mpull.browse .mday'); if (md) { md.scrollTop = 0; MP.scroll = 0; }
  { const sec = root.querySelector('.mpull.browse[data-stage]'); if (sec) { sec.scrollTop = 0; stageScrolled(sec); } } // 第19.3版: 1本のスクロールも一番上へ（今日のマスが見える）
  if (off) {
    const dir = t < from ? -1 : 1, g = root.querySelector('.mpull.browse .mgrid'), wd = ST.kind === 'w1' ? root.querySelector('.mpull.browse .weekdays') : null;
    const kf = reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translateX(${dir * 32}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }];
    for (const el of [g, wd]) el?.animate(kf, { duration: reduced() ? 150 : 300, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
  }
  say(`今日、${dayLabel(t)}を選びました。`);
}
// ---- 初めて開いたときのヒント（design/34 §9.5）。まっさらな端末で、閉じたカレンダーに入った1回目だけ。つまみを上へ 8 動かして戻す×2（各 0.6 秒）＋札。触れるか 6 秒で 0.15 秒で消す ----
const HINT_KEY = `duo.hint.pull${suffix}`;
const HINT = { el: null, timer: 0, t0: 0, done: LS_EVIDENCE || (() => { try { return localStorage.getItem(HINT_KEY) !== null; } catch { return true; } })() };
function hintNudge(sec) { // つまみ（上）を上へ 8 動かして戻す×2（各 0.6 秒、標準の緩急）。「視差効果を減らす」では動かさない
  const line = sec.querySelector('.mgrab i'), el = performance.now() - (HINT.t0 || 0);
  if (!line || reduced() || el >= 1200) return;
  const a = line.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }, { transform: 'translateY(0)' }], { duration: 600, iterations: 2, easing: 'ease' });
  a.currentTime = el;
}
// 札の幅 270（x56〜326）に1文が入らない書体のときは、字間を詰めて左右の内側 8 に収める（1文字あたり最大 1。それでも入らなければ横に縮める）
function hintFit(el) {
  const avail = el.clientWidth - 16;
  for (const sp of el.children) {
    const n = sp.textContent.length, w = () => { const g = document.createRange(); g.selectNodeContents(sp); return g.getBoundingClientRect().width; };
    const w0 = w(); if (w0 <= avail || !n) continue;
    sp.style.letterSpacing = `${Math.max(-1, (avail - w0) / n).toFixed(2)}px`;
    const w1 = w(); if (w1 > avail) { sp.style.transform = `scaleX(${(avail / w1).toFixed(3)})`; sp.style.transformOrigin = '50% 50%'; sp.style.width = `${Math.ceil(w1)}px`; sp.style.marginLeft = `${(el.clientWidth - Math.ceil(w1)) / 2}px`; }
  }
}
function hintMaybe() {
  const sec = root.querySelector('.mpull.browse');
  if (closedLand()) { HINT.hide?.(true); return; } // 閉じた横では出さない（つまみがない。§14.3）。初めて縦で開いたときに出す
  if (HINT.el) { if (sec && !sec.contains(HINT.el)) { sec.append(HINT.el); hintNudge(sec); } return; } // 描き直しても同じ札を戻し、つまみの動きも続きから
  if (HINT.done || !sec || PS.on || anyPanel()) return;
  HINT.done = true; try { localStorage.setItem(HINT_KEY, '1'); } catch { /* 覚えられなくても1回は出す */ }
  const el = document.createElement('div'); el.className = 'mhint'; el.setAttribute('role', 'note');
  el.innerHTML = '<span>上下に引くと、月・2週・1週が切り替わります。</span><span>左右に送ると、前後の月へ動きます。</span>'; // 企画の2文を1文ずつ2行（S11e 指示8）
  sec.append(el); HINT.el = el; HINT.t0 = performance.now();
  hintFit(el);
  hintNudge(sec);
  const hide = (now) => {
    if (!HINT.el) return;
    clearTimeout(HINT.timer); document.removeEventListener('pointerdown', hide, true);
    const e = HINT.el; HINT.el = null; HINT.hide = null;
    if (now === true) e.remove(); else { e.classList.add('out'); setTimeout(() => e.remove(), 170); }
  };
  HINT.hide = hide;
  HINT.timer = setTimeout(hide, 6000);
  document.addEventListener('pointerdown', hide, true);
}
const stgFade = (el, from, to, ms) => {
  el.getAnimations().forEach((a) => a.cancel());
  el.style.opacity = String(to);
  const a = el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  return a.finished.catch(() => {});
};
// 行数が変わる境: 出ていく格子（data-leaving）を 0.08 秒で消し切ってから、次の格子を 0.12 秒で出す。2つの格子の文字が同時に見えることはない。
// 途中で逆向きに戻したときは、いまの格子をそのまま消して次を出す（0.20 秒を待たない）。
function stageSwap(kind, sec) {
  const tok = ++ST.tok, wrap = sec.querySelector('.mgwrap'), wd = sec.querySelector('.weekdays');
  if (kind === 'w2') MP.anchor = '';
  if (kind === 'w1') MP.a1 = '';
  const ws = stageWeeks(kind), wdNew = stageWdInner(kind, ws[0]), olds = [...wrap.querySelectorAll('.mgrid')], wdChange = !!wd && wd.innerHTML !== wdNew;
  const build = () => {
    if (tok !== ST.tok) return;
    const tmp = document.createElement('div'); tmp.innerHTML = stageGridHtml(kind, ST.H, ws);
    const g = tmp.firstElementChild; wrap.append(g); g.style.setProperty('--rh', `${ST.H / STG_ROWS[kind]}px`); stageFit(g);
    if (wdChange) wd.innerHTML = wdNew;
    stageTodaySync();
    if (!reduced()) { stgFade(g, 0, 1, 120); if (wdChange) stgFade(wd, 0, 1, 120); }
    applyPasteInert(); paintRange();
    setTimeout(() => { for (const o of olds) o.remove(); }, 40);
  };
  if (reduced()) { for (const o of olds) o.remove(); build(); return; }
  const outs = olds.map((g) => { const cur = Number(getComputedStyle(g).opacity); g.dataset.leaving = ''; return stgFade(g, cur, 0, Math.max(16, 80 * cur)); });
  if (wdChange) { const cur = Number(getComputedStyle(wd).opacity); outs.push(stgFade(wd, cur, 0, Math.max(16, 80 * cur))); }
  Promise.all(outs).then(build);
}
function stageEnter(n, sec) {
  ST.n = n; sec.dataset.stage = String(n); sec.dataset.form = STG_FORM[n]; state.stage = n; state.monthForm = STG_FORM[n]; MP.shrunk = false;
  const g = sec.querySelector('.mgrab');
  if (g) { g.setAttribute('aria-valuenow', String(n)); g.setAttribute('aria-valuetext', STG_NAME[n]); }
  feel('light'); // 境をまたぐたびに軽い触覚を1回（§3）
  try { (window.__duoHapticLog = window.__duoHapticLog || []).push({ stage: n, t: performance.now() }); } catch { /* */ } // またいだ先の段を1件だけ（タップ・同じ段・段7のゴムでは積まない）
  const kind = stgKindOf(n);
  if (kind !== ST.kind) { ST.kind = kind; stageSwap(kind, sec); }
}
function stageApply(H) {
  const sec = root.querySelector('.mpull.browse'); if (!sec) return;
  ST.H = H; sec.style.setProperty('--H', `${H}px`);
  for (const g of sec.querySelectorAll('.mgrid')) { g.style.setProperty('--rh', `${H / Number(g.dataset.rows)}px`); stageFit(g); }
  if (!ST.snapping) { // 寄せの間は行き先の段のまま（段は離した（キーを押した）ときに決まる）
    const n = stgOfH(H);
    if (n !== ST.n) stageEnter(n, sec);
  }
  paintMpScroll(sec);
}
function stageSnap(t) {
  cancelAnimationFrame(ST.raf);
  const sec = root.querySelector('.mpull.browse'); if (!sec) return;
  const H0 = ST.H, H1 = STG[t].H, over = H0 > STG[1].H + 0.01 || H0 < STG[7].H - 0.01, n0 = ST.n;
  const dur = over ? 0.22 : Math.abs(H1 - H0) > 200 ? 0.30 : 0.25;
  if (t !== ST.n) stageEnter(t, sec);
  ST.snapping = true;
  const fin = () => { ST.snapping = false; stageApply(H1); saveUi(); if (n0 !== t) say(`月の大きさを${STG_NAME[t]}にしました。`); };
  if (reduced() || Math.abs(H1 - H0) < 0.01) { fin(); return; }
  const t0 = performance.now(), ease = over ? (x) => 1 - (1 - x) ** 3 : stgSnapEase; // 戻りは out の3乗 0.22 秒（§3）。寄せは (0.16,1,0.3,1)。時間は指を離した時から数える（S11f: 設計の決定で元に戻した。離した次のコマにはもう動いている。§3・Q-14）
  const f = (now) => {
    const x = Math.min(1, (now - t0) / (dur * 1000));
    if (x >= 1) { ST.raf = 0; fin(); return; }
    stageApply(H0 + (H1 - H0) * ease(x)); ST.raf = requestAnimationFrame(f);
  };
  ST.raf = requestAnimationFrame(f);
}
function stageDown(ev) {
  cancelAnimationFrame(ST.raf); ST.raf = 0; ST.snapping = false;
  ST.drag = { id: ev.pointerId, y0: ev.clientY, yRef: ev.clientY, moved: false, H0: ST.H, n0: ST.n, pts: [] };
}
function stageMove(ev) {
  const d = ST.drag; if (!d || ev.pointerId !== d.id) return;
  const y = ev.clientY;
  d.pts.push({ t: ev.timeStamp, y }); if (d.pts.length > 24) d.pts.shift();
  if (!d.moved) { if (Math.abs(y - d.y0) < 6) { if (!d.seen) { d.seen = true; d.yRef = y; } return; } d.moved = true; } // 動き 6 未満はたたき。最初の1点（触れた直後のぶれ）だけを 1:1 の基準にし、あとは触れた位置から 1:1
  let H = d.H0 + (y - d.yRef);
  const hi = STG[1].H, lo = STG[7].H; // 端のゴム: 超えた分の 0.3 倍、最大 24
  if (H > hi) H = hi + Math.min(24, (H - hi) * 0.3); else if (H < lo) H = lo - Math.min(24, (lo - H) * 0.3);
  stageApply(H);
}
function stageUp(ev) {
  const d = ST.drag; if (!d || ev.pointerId !== d.id) return;
  ST.drag = null;
  if (!d.moved) return; // たたきは何もしない
  MP.swallow = performance.now() + 400;
  const w = d.pts.filter((p) => ev.timeStamp - p.t <= STG_VWIN); // 離す前 80ms の最初と最後の点（2つないときは v＝0）
  const v = w.length >= 2 && w[w.length - 1].t > w[0].t ? ((w[w.length - 1].y - w[0].y) / (w[w.length - 1].t - w[0].t)) * 1000 : 0;
  const npos = stgOfH(ST.H), Hp = ST.H + v * 0.15;
  const t = Math.min(Math.max(stgOfH(Hp, v < 0), Math.min(npos, d.n0 - 2)), Math.max(npos, d.n0 + 2)); // 1回のはらいで飛ぶのは最大2段（引いて着いた所まではそのまま）
  stageSnap(Math.min(7, Math.max(1, t)));
}
root.addEventListener('mousedown', (ev) => { if (ev.target.closest?.('.mgrab, .mpull.browse[data-stage] .mdgrab')) ev.preventDefault(); }, true); // 第19.3版: 閉じた縦のつまみ（下）も（画面の下の端の外まで引くと、WebKit が画面の1本を勝手に送る） // S11i: マウスで引いている間、WebKit の「選びながら自動で送る」が日の欄（時間軸）を勝手に送らないように
root.addEventListener('dragstart', (ev) => { if (ev.target.closest?.('.mgrab')) ev.preventDefault(); }, true); // つまみを引いている途中で、選択中の文字の「ドラッグ」が始まって指の動きが切れないように
function stageCancel() { const d = ST.drag; ST.drag = null; if (d?.moved) stageSnap(stgOfH(ST.H)); }
// 第19.3版（征希さんの要望）: 段を変えられるのは つまみ（上）.mgrab だけ。M9（格子のどこでも縦に引く／日の欄を一番上から下へ引くと段が変わる。34 §3・§6.3）はやめた。
// 格子・日の欄の縦の動きは画面（.mpull.browse[data-stage]）の1本のスクロール（touch-action:pan-y。iOS の慣性・端のはね返りもそのまま）。横の払い（月送り）・マスのタップ・チップの長押し移動（R-49）は今までどおり
function stageKey(dir) { if (ST.land) return; const t = Math.min(7, Math.max(1, ST.n + dir)); if (t !== ST.n) stageSnap(t); }
// 閉じた画面は画面全体を1本でスクロールする（design/33 §2）。月は縮めない。月が見出しの下へ流れ切ったら、見出しの右に今見ている日を出す（0.15秒）。
// 開いた縦は日の部分だけがスクロールする（月は上の面に置いたまま）。
function paintMpScroll(sec) {
  const mph = sec?.querySelector('.mph'), fix = sec?.querySelector('.mpfix'), g = sec?.querySelector('.mgwrap, .mgrid'); if (!mph || !fix || !g) return;
  mph.classList.toggle('scrd', g.getBoundingClientRect().bottom <= fix.getBoundingClientRect().bottom + 0.5);
}
// 第19.3版 閉じた縦の1本のスクロール: 送るたびに、見出しの右の日（格子が流れ切ったら出す）を合わせる（その2: つまみ（下）の貼り付きはやめたので、ほかにすることはない）
function stageScrolled(sec) { paintMpScroll(sec); }
root.addEventListener('scroll', (ev) => {
  const el = ev.target;
  if (!(el instanceof Element)) return;
  if (el.classList.contains('allb')) { allSync(el); return; }
  if (el.classList.contains('mday')) { MP.scroll = el.scrollTop; const c0 = PULL_CFG.browse[state.monthForm]; if (el.scrollTop > 0) MP.cs = c0.rows * c0.h + 24 + el.scrollTop; }
  else if (el.matches('.mpull.browse[data-stage]')) stageScrolled(el); // 閉じた縦: 位置は覚えない（開いた縦の MP.scroll にも触らない）
  else if (el.classList.contains('mpull') && pullKind() === 'browse') { const c0 = PULL_CFG.browse[state.monthForm]; MP.cs = el.scrollTop; MP.scroll = Math.max(0, el.scrollTop - (c0.rows * c0.h + 24)); paintMpScroll(el); }
}, true);

// ホーム（今日のカード）。第16版 PR14・design/14 案A。選択日と独立して今日固定。
// mode: 'cards'＝閉じた画面・縦の一覧（縦に重ねる）、'axis'＝開いた横（今日の予定は9〜19時の小さな時間軸）、'cols'＝開いた縦の下段（3列）。
const homeTaskList = () => (!RM.data ? null : RM.data.reminders.filter((x) => !delCtl.has(x.itemId)));
const homeGo = (to, label, cls = '') => `<button type="button" class="hgo${cls}" data-act="homego" data-to="${to}" aria-label="${esc(label)}">${esc(label.replace(/を開く$/, ''))} ›</button>`;
function homeEventRow(e) {
  return `<button type="button" class="hrow event-row ${catCls(e)}"${catSty(e)} data-event="${esc(e.id)}"${repLabel(e, `${timeLabel(e)} ${e.title}`)}><span class="ht">${e.all ? '終日' : t0(e.start.slice(11))}${bell(e)}</span><i class="hbar" aria-hidden="true"></i><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
}
function homeAxis(list, now, k) {
  const A = axisBars(list, now, k), hrs = Array.from({ length: 11 }, (_, i) => 9 + i);
  const bars = A.bars.map((b) => { const e = list.find((x) => x.id === b.id); return `<span class="hbarev ${catCls(e)}${b.past ? ' past' : ''}" style="${catVar(e)}top:${b.top}px;height:${b.height}px;${b.n === 2 ? `left:calc(${b.col} * 50% + 1px);right:auto;width:calc(50% - 2px)` : ''}" data-hm="${esc(b.start.slice(11))}" aria-hidden="true"><span>${esc(e.title)}</span></span>`; }).join('');
  // 時間軸の絵は 1 つの押す的（高さ 140）。枠は 14 の高さで隣と重なるので、枠ごとのボタンにしない（S5 M-11）。押した位置の枠（なければその時刻）のところへタイムラインが開く。
  return `<button type="button" class="haxis" data-act="homego" data-to="time" aria-label="${esc(`今日の予定 ${A.bars.length}件をタイムラインで開く`)}" style="height:${A.height}px">${hrs.map((h) => `<span class="hh" style="top:${(h - 9) * 14}px">${h}</span>`).join('')}<span class="hbars">${bars}${A.nowTop === null ? '' : `<i class="hnow" style="top:${A.nowTop}px" aria-hidden="true"></i>`}</span></button>`;
}
function homeTasksCard() {
  const all = homeTaskList(), today = todayKey();
  if (!all) return `<section class="hcard htasks" aria-label="タスク"><div class="hh3"><h3>タスク</h3>${homeGo('task', 'すべて')}</div><p class="small hempty">タスクはタスクのページで見られます。</p></section>`;
  const T = homeTasks(all, today, doneCtl.pending());
  const rows = T.items.map((r) => {
    const done = doneCtl.pending().get(r.itemId) === true, du = dueText(r.due, today), od = r.due.date < today;
    return `<div class="htask${done ? ' done' : ''}"><button type="button" class="rmckb" data-act="remck" data-id="${esc(r.itemId)}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}、${esc(r.title || '')}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button><span class="htt">${esc(r.title || '')}</span>${du ? `<small class="hdue${od ? ' od' : ''}">${esc(du)}</small>` : ''}</div>`;
  }).join('');
  // 閉じたホーム: 「＋ タスクを追加」はカードの見出しのすぐ下（1行目、設計 2026-11-20 4:05 ★1-10。最初の画面でタブの下に隠れない）。ほかの姿勢は従来どおり下
  const first = Math.min(L.w, L.h) < 600; // 閉じた画面
  const add = `<button type="button" class="hadd${first ? ' first' : ''}" data-act="homego" data-to="taskadd" aria-label="＋ タスクを追加"><span class="hadd-p" aria-hidden="true">＋</span><span class="hadd-t">タスクを追加</span></button>`;
  return `<section class="hcard htasks" aria-label="タスク"><div class="hh3"><h3>タスク ${T.total}件</h3>${homeGo('task', 'すべて')}</div>${first ? add : ''}${rows || (first ? '' : '<p class="small hempty">今日のタスクはありません</p>')}${first ? '' : add}</section>`; // 閉じたホームで 0 件なら追加の行だけ（カードの下端 y522）
}
function listHtml(mode = 'cards') {
  const now = nowStamp(), k = todayKey(), d = parseKey(k), tm = addDays(k, 1);
  const list = eventsOnDay(occIn(k, k), k).filter((e) => e.end > now);
  // 今日にもう予定がなければ、未来の回も含めて日付順に次の予定を探す。
  const future = list.length ? null : occIn(addDays(k, 1), addDays(k, 400)).sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)))[0];
  const { next, shown, more, count } = splitEvents(list, future);
  const nextDay = next && dayOf(next.start) !== k ? `<small class="nd">${dayLabel(dayOf(next.start))}</small> ` : '';
  const nextHtml = next
    ? `<button type="button" class="next ${catCls(next)}"${catSty(next)} data-event="${esc(next.id)}"${repLabel(next, `次の予定 ${next.title}`)}><small>次の予定 · ${esc(tagText(next))}</small><strong>${xi(next)}${rep(next)}${esc(next.title)}</strong><span class="when"><span class="time">${nextDay}${next.all ? '終日' : t0(next.start.slice(11))}</span>${next.all || dayOf(next.start) !== dayOf(next.end) ? '' : ` — ${t0(next.end.slice(11))}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}${nextBell(next)}</span></button>`
    : `<div class="next none"><small>次の予定</small><strong>${extActive() ? '読み込み済みの期間に次の予定はありません。' : state.events.length ? 'この後の予定はありません' : '予定はまだありません'}</strong>${sampleBtn()}</div>`;
  const hero = `<section class="hero"><div class="date-block"><div class="eyebrow">今日 / ${d.getFullYear()}年${d.getMonth() + 1}月</div><div class="date">${d.getDate()}<span>${DOW[d.getDay()]}曜日</span></div></div>${nextHtml}</section>`;
  const body = mode === 'axis' ? homeAxis(list, now, k) : shown.map(homeEventRow).join('');
  const evCard = `<section class="hcard hevents" aria-label="今日の予定"><div class="hh3"><h3>今日の予定 ${count}件</h3>${homeGo('time', 'タイムライン')}</div>${body || '<p class="small hempty">この後の予定はありません</p>'}${mode !== 'axis' && more ? `<button type="button" class="hmore" data-act="homego" data-to="time">ほか${more}件</button>` : ''}</section>`;
  const tl = tomorrowSummary(eventsOnDay(occIn(tm, tm), tm)), td = parseKey(tm);
  const tmCard = `<button type="button" class="hcard htmr" data-act="homego" data-to="tomorrow" aria-label="明日の予定を開く"><b>明日 ${td.getMonth() + 1}/${td.getDate()}（${DOW[td.getDay()]}）</b> <small>${tl.count}件</small>${tl.first ? `<span>${tl.first.all ? '終日' : t0(tl.first.start.slice(11))} ${esc(tl.first.title)}${tl.more ? `　ほか${tl.more}件` : ''}</span>` : '<span class="hempty">予定はありません</span>'}</button>`;
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
  return `<button type="button" class="next pvnext ${catCls(next)}"${catSty(next)} data-event="${esc(next.id)}"${repLabel(next, `次の予定 ${next.title}`)}><small>次の予定 · ${esc(pvUntil(next, now))}</small><strong>${xi(next)}${rep(next)}${esc(next.title)}</strong><span class="when"><span class="time">${nd}${next.all ? '終日' : t0(next.start.slice(11))}</span>${next.all || dayOf(next.start) !== dayOf(next.end) ? '' : ` — ${t0(next.end.slice(11))}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}${nextBell(next)}</span></button>`;
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
    return `<div class="htask${done ? ' done' : ''}"><button type="button" class="rmckb" data-act="remck" data-id="${esc(r.itemId)}" role="checkbox" aria-checked="${done}" aria-label="${done ? '未完了に戻す' : '完了にする'}、${esc(r.title || '')}"${r.readOnly ? ' disabled' : ''}><span class="rmck" aria-hidden="true"></span></button><span class="htt">${esc(r.title || '')}</span>${du ? `<small class="hdue${od ? ' od' : ''}">${esc(du)}</small>` : ''}</div>`;
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
  // 第19.2版 S11c（design/34 §9.1-9・§9.2）: 下のタブはない。カレンダー（月）以外のページは見出しの左の「‹ カレンダー」で戻る
  const cal = kind === 'browse' && !state.strip && viewNow() === 'month';
  const back = cal ? '' : '<button type="button" class="cback" data-act="calback" aria-label="カレンダーへ戻る"><span aria-hidden="true">‹ カレンダー</span></button>';
  return `<div class="shell closed ${kind}${tv}${kind === 'browse' && pullOn() ? ' pull' : ''}${POS.band ? ' band' : ' fb'}${state.strip ? ' strp' : ''}${cal ? ' cal' : ' sub'}${noteEditing ? ' noteedit' : ''}${closedLand() ? ' land' : ''}"><div class="mpane">${body}</div>${back}${ctl()}${moreHtml()}</div>`;
}
// ---- 閉じた画面の「…」（design/34 §9.2・§12 Q-10）。幅 224・行 44・上下のあき 8・行の間の線 0.5。上から ホーム・週の時間軸・検索・月の表現・設定 ----
const MORE_ITEMS = [['home', () => 'ホーム（今日・次の予定）'], ['week', () => '週の時間軸'], ['search', () => '検索'], ['mode', () => `月の表現（${{ simple: '手帳', named: '予定名', all: '全部' }[monthMode('browse')]}）`], ['settings', () => '設定']];
function moreHtml() {
  if (!MORE.open || !POS.more) return '';
  const S = safe(), W = L.w, H = L.h, w = Math.min(224, W - S.left - S.right - 16), h = 16 + 44 * MORE_ITEMS.length;
  // 帯あり: 縦は x152〜376・y232〜468（帯の左 6、「…」の丸の上端から）。横は x362〜586・y189〜425（帯の 8 手前、下端はホームバーの帯の 8 上。§14.3）
  // 帯なし: 右端を「…」の右端にそろえ、見出しの下 4 から（縦 x190〜414・y48〜284。§15-③）
  const land = W > H, hb = Math.max(S.bottom, land ? closedLandVals().home : 33);
  const right = POS.band ? S.right + (land ? 8 : 6) : W - (POS.more.x + POS.more.s);
  const top = POS.band ? Math.min(POS.more.y + (POS.more.s - POS.more.v) / 2, H - hb - 8 - h) : POS.more.y + POS.more.s + 4;
  const rows = MORE_ITEMS.map(([k, t], i) => `${i ? `<i class="sep" role="separator" aria-hidden="true" style="top:${8 + 44 * i}px"></i>` : ''}<button type="button" role="menuitem" data-more="${k}" tabindex="${i ? -1 : 0}">${t()}</button>`).join('');
  return `<div class="moremenu" role="menu" aria-label="その他" style="right:${r2(right)}px;top:${r2(top)}px;width:${w}px">${rows}</div>`;
}
function openMore() {
  if (MORE.open || !root.querySelector('.shell.closed')) return;
  MORE.open = true; TLM.open = null; MM.open = null;
  const sh = root.querySelector('.shell.closed'), b = sh.querySelector('.cmore');
  sh.insertAdjacentHTML('beforeend', moreHtml());
  if (b) { b.setAttribute('aria-expanded', 'true'); b.classList.add('on'); }
  sh.querySelector('.moremenu [role=menuitem]')?.focus({ preventScroll: true });
}
function closeMore(focus = true) {
  if (!MORE.open) return;
  MORE.open = false;
  root.querySelector('.moremenu')?.remove();
  const b = root.querySelector('.cmore');
  if (b) { b.setAttribute('aria-expanded', 'false'); b.classList.remove('on'); if (focus) b.focus({ preventScroll: true }); }
}
function moreGo(k) {
  closeMore(false);
  const b = root.querySelector('.cmore');
  if (k === 'home') { set({ home: true, strip: null }); say('ホームを開きました。'); root.querySelector('.cback')?.focus({ preventScroll: true }); }
  else if (k === 'week') { set({ view: 'week', home: false, strip: null }); say('週の時間軸を開きました。'); root.querySelector('.cback')?.focus({ preventScroll: true }); }
  else if (k === 'search') openSearch(b, fmode());
  else if (k === 'settings') openMenu(root.querySelector('.cmore'));
  else if (k === 'mode') { // 月の表現（手帳｜予定名｜全部）: 設定の「表示」の同じ入口を開いた状態で出す
    if (!monthAll() || state.strip) set({ home: false, view: 'month', strip: null });
    openMenu(root.querySelector('.cmore')); showMenuScreen('display');
    const mb = $('#m-mode'); if (mb && !mb.hidden && $('#m-variant').hidden) mb.click();
  }
}
// 「‹ カレンダー」: ホーム・週の時間軸・タスク・ノートの一覧からカレンダー（覚えている段）へ戻る
function calBack() {
  if (layoutKind() !== 'home' && layoutKind() !== 'browse') return;
  set({ home: false, view: 'month', strip: null });
  say('カレンダーに戻りました。');
  root.querySelector('.cmore')?.focus({ preventScroll: true });
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
  if (ttOn()) return `<div class="shell open portrait tt"><div class="pcol ttp">${dayPage('left', state.selected, true)}${dayPage('right', addDays(state.selected, 1), true)}</div><div class="hline" aria-hidden="true"></div><div class="tabfade" aria-hidden="true"></div>${ctl()}${tabs()}</div>`;
  const tv = !listShown() && viewNow() !== 'month' ? ` tv-${viewNow()}` : ''; // いま 日・週 を見ている印（見た目には使わない。CSS の .tv-day・.tv-week は .closed 付きだけ。品質の S11e(b) が開いた側の画面をこの印で見る）
  return `<div class="shell open portrait${pullOn() ? ' pull' : ''}${foldOn() ? ' fd' : ''}${tv}"><div class="pcol">${listShown() ? `<div class="home listview hm-pv" aria-label="ホーム">${listHtml('pv')}</div>` : foldOn() ? foldHtml() : calendar('portrait')}</div><div class="hline" aria-hidden="true"></div>${panelOn() ? bottomPanel() : panelAvail() ? '<div class="pgrab" data-grab="1" aria-hidden="true"></div>' : ''}<div class="tabfade" aria-hidden="true"></div>${ctl()}${tabs()}</div>`;
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
// minMin: 重なりの計算に使う最小の長さ（分）。開いた縦の時間軸は見た目の最小 22px＝30分（V-06。1時間 44px）。
function dayBlocks(k, minMin = 20) {
  const items = eventsOnDay(occIn(k, k), k).filter((e) => !e.all).map((e) => {
    const s = dayOf(e.start) < k ? 0 : minOf(e.start);
    let en = dayOf(e.end) > k ? 1440 : minOf(e.end);
    if (en <= s) en = Math.min(1440, s + 20);
    return { e, s, en, ee: Math.max(en, s + minMin) }; // ee: 重なり判定用（最小ブロック高に合わせた長さ）
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
  const t = e.title, sub = t0(hhmm(s));
  return `<button type="button" class="tlev ${catCls(e)}" data-event="${esc(e.id)}" data-sday="${k}" style="${catVar(e)}--m:${s};--d:${en - s};left:calc(${col} * 100% / ${n} + 1px);width:calc(100% / ${n} - 2px)" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${t}${e.recurring ? ' 繰り返し' : ''}${isX(e) ? '' : `、${tagText(e)}`}${e.nativeLink?.state === 'linked' ? '、iPhoneにも追加済み' : ''}${alLabel(e)}`)}">${cw ? `<span class="tn">${esc(t)}</span>` : `<span class="tt">${sub}${bell(e)}</span><span class="tn">${esc(t)}</span>`}</button>`; // 閉じた週（cw）は枠に時刻を出さず題名だけ（H-07）
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
    if (h < 24) lines += `<span class="hlab${pane === 'mday' ? ' hour' : ''}" style="--m:${h * 60}">${h}:00</span><i class="hl half" style="--m:${h * 60 + 30}"></i>`;
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
  const t = e.all || dayOf(e.start) !== k ? '終日' : t0(e.start.slice(11));
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
  root.querySelectorAll('.dpage .tl').forEach((t) => hideNearNow(t.parentNode));
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
const NB = { marks: new Map(), first: new Map(), cards: new Map(), cardSig: '[]', firstId: new Map(), bodies: new Map(), day: null, dp: null, cur: null, rows: null, q: { left: '', right: '', bottom: '', closed: '' }, seq: 0, failed: false, blocked: false, ed: null, opening: null, focusNew: false, said: false, folders: null, sel: 'all', menu: null, swallow: 0, sheet: null };
const noteHead = (side) => `<div class="rhead dh"><h2 class="rdate">ノート</h2>${side === 'right' ? rctl() : ''}<div class="sctl">${side === 'left' ? gearBtn() : ''}</div></div>`;
// 右の列の「元に戻す」「やり直す」の使える・使えないを、ノートの履歴に合わせる（34 §15-②）
function paintNoteHist() {
  const h = noteHist();
  // aria-disabled は使わない（押した瞬間も何も起きないことを確かめられるよう、ボタンは押せるまま。色と data-off で示す）
  root.querySelector('.cb.cundo')?.setAttribute('data-off', h.undo ? '0' : '1');
  root.querySelector('.cb.credo')?.setAttribute('data-off', h.redo ? '0' : '1');
}
function noteEditor() {
  if (!NB.ed) NB.ed = mountNoteEditor(document.createElement('div'), {
    store: noteStore,
    onOpen: (id) => { db.setLastNote(id).catch(() => {}); noteTaskOpen(id); },
    onTrashChange: (id) => { if (id === NB.cur) { NB.cur = null; db.setLastNote(null).catch(() => {}); } invalidateNoteList(); render(); },
    onDone: () => { if (NB.sheet) closeNoteSheet(); else noteBack(); },
    onHistory: () => paintNoteHist(),
    onFormatSheet: (open, hadKb) => { if (NB.sheet) { NB.sheet.fs = !open ? null : hadKb ? (kbTopNow() ?? L.h - 250) : L.h - 250; placeNoteSheet(); } },
    loadInk: (id) => db.getNote(id).then((n) => n?.ink ?? null), // 古い手書きを表示だけする（読むだけ）
    kbHeight: () => Math.max(0, window.innerHeight - (kbTopNow() ?? window.innerHeight)), // v19.3 その2 D: キーボードの高さ（visualViewport と、プラグインが知らせた高さの大きい方）
  });
  return NB.ed;
}
function noteBody(where) {
  if (NB.blocked) return '<div class="memopage padb"><p class="smsg" role="alert">ノートを準備できませんでした。アプリを閉じて、もう一度開いてください。（予定と元のメモは変わっていません）</p></div>';
  if (NB.cur) return noteOthers(where) + `<div class="ntools mtools"><button type="button" class="mback" data-act="noteback" aria-label="ノートの一覧に戻る">一覧</button><button type="button" class="mback" data-act="notenew" aria-label="新しいノート">＋ 新規</button></div><div class="memopage notepage padb" data-note-wrap="${where}"><div class="nmeta" data-nmeta="${where}"></div><div class="nhost" data-nhost="${where}"></div></div><div data-nmenu="${where}"></div>`;
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
    const title = titleOf(n.body), second = n.body.split('\n').slice(1).map(displayLine).find(Boolean) || ''; // 一覧の2行目にも記号は出さない（S3）
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
  return rows.map((n) => { const t = titleOf(n.body); return `<button type="button" class="nupb" data-nrow="${esc(n.id)}" aria-label="${esc(t)}を開く">${esc(t)}</button>`; }).join('');
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
  else if (m.k === 'row' && row) h = `<h3>${esc(titleOf(row.body))}</h3><div class="nmrow">${nfBtn('rowpin', row.id, row.pinned ? 'ピン留めを外す' : 'ピン留めする', 'nmbtn')}</div><div class="nmrow">${nfBtn('rowmv', row.id, 'フォルダへ移動', 'nmbtn')}</div><div class="nmrow">${nfBtn('rowdel', row.id, '削除（30日は戻せます）', 'nmbtn danger')}${close}</div>`;
  else if (m.k === 'mv' && row) h = `<h3>移動先のフォルダ</h3><div class="nmlist">${[{ id: '', name: 'フォルダなし' }, ...f].map((x) => nfBtn('rowmvto', row.id, `${esc(x.name)}${(row.folderId || '') === x.id ? ' ✓' : ''}`, 'nmbtn', ` data-to="${esc(x.id)}"`)).join('')}</div>${err}<div class="nmrow">${close}</div>`;
  else if (m.k === 'curmv') { const cf = NB.curFolder || ''; h = `<h3>フォルダ</h3><div class="nmlist">${[{ id: '', name: 'フォルダなし' }, ...f].map((x) => nfBtn('curmvto', NB.cur, `${esc(x.name)}${cf === x.id ? ' ✓' : ''}`, 'nmbtn', ` data-to="${esc(x.id)}"`)).join('')}</div>${err}<div class="nmrow">${close}</div>`; }
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
// 第19.3版 その3（design/35 §1.2・§1.3）: 日ごとのノートの「カード」（id・題名・副題）も一緒に作る（NB.cards）。並びは作った順（動かしたカードは、その日の作った順の位置に入る）。
// カードの題名と副題の決まりは notes-model.js の cardTextOf（1行目が日付の見出しのノートは、その行を飛ばす）。
const noteCardOf = (n) => ({ id: n.id, ...cardTextOf(n.body), c: n.createdAt || 0, u: n.updatedAt || 0 });
const noteCardCmp = (a, b) => a.c - b.c || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
let marksSeq = 0;
async function refreshNoteMarks() {
  const seq = ++marksSeq;
  try {
    const m = new Map(), fb = new Map(), best = new Map(), cards = new Map(), bodies = new Map();
    for (const n of await db.listNotes()) {
      if (n.deletedAt != null) continue;
      const k = noteDateOf(n); if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
      const b = best.get(k); if (!b || n.updatedAt > b.updatedAt) { best.set(k, n); fb.set(k, String(n.body ?? '').slice(0, 800)); } // 1日ページのノート欄に出す「1件目」（いちばん新しいもの）
      if (!cards.has(k)) cards.set(k, []);
      cards.get(k).push(noteCardOf(n)); bodies.set(n.id, String(n.body ?? '').slice(0, 800));
    }
    if (seq !== marksSeq) return;
    for (const l of cards.values()) l.sort(noteCardCmp);
    const sig = JSON.stringify([...cards].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    const same = m.size === NB.marks.size && [...m].every(([k, v]) => NB.marks.get(k) === v) && fb.size === NB.first.size && [...fb].every(([k, v]) => NB.first.get(k) === v) && sig === NB.cardSig;
    NB.marks = m; NB.first = fb; NB.cards = cards; NB.cardSig = sig; NB.bodies = bodies; NB.firstId = new Map([...best].map(([k, n]) => [k, n.id]));
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
async function createDayNote(day, plain = false) { // plain＝日の欄の「＋ ノート」（その3）: 1行目に日付の見出しを足さない（1行目が題名。日付はシートの上の日付の行に出す）
  let fid = null;
  try { const r = ensureDailyFolder(await db.listFolders()); if (r.created) await db.putFolder(r.folder); fid = r.folder.id; invalidateNoteList(); NB.folders = null; } catch { /* フォルダなしで作る */ }
  const id = noteStore.newNote();
  await noteStore.setMeta(id, { date: day, ...(fid ? { folderId: fid } : {}) });
  if (!plain) noteStore.setText(id, `${dailyHeading(day)}\n`);
  return id;
}
async function openDayNote(day) {
  if (!day || NB.blocked || dayNoteBusy) return;
  if (NB.sheet) { if (await closeNoteSheet() === false) return; }
  dayNoteBusy = true;
  try {
    let all; try { all = await db.listNotes(); } catch { say('ノートを読み込めませんでした。'); return; }
    const occ = dateOccupants(all, day, null);
    if (occ.length === 1) { NB.day = null; NB.focusNew = true; await noteOpen(occ[0].id); return; } // その日のノートが1件なら、開いてそのまま書ける（design/32・21 §1.2）
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
    const fname = cur ? (f || []).find((x) => x.id === cur)?.name || 'なし' : 'なし';
    // V-20（S7）: 高さ 28・角丸 14・13pt の札を3つ（フォルダ・日付・ピン留め、間 8）。フォルダは押すと小さなメニュー（iOS の選ぶ欄は使わない）。
    h.innerHTML = `<button type="button" class="nfpill" data-nf="curmv" aria-haspopup="dialog" aria-label="フォルダ: ${esc(fname)}"><span class="nfp"><span>フォルダ：${esc(fname)}</span><i aria-hidden="true">▾</i></span></button><button type="button" class="ndate${date ? ' on' : ''}" data-act="ndate" aria-haspopup="dialog" aria-expanded="${!!NB.dp}" aria-label="日付${date ? `: ${esc(dayLabel(date))}` : 'を付ける'}"><span class="nfp">${date ? `${esc(dayLabel(date))} ›` : '日付 ›'}</span></button><button type="button" class="nmpin${m?.pinned ? ' on' : ''}" data-nf="pin" aria-pressed="${!!m?.pinned}"><span class="nfp">${m?.pinned ? '📌 ピン留め' : 'ピン留め'}</span></button>${noteDatePopHtml(date)}`;
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
      await setNoteDate(id, d.ndday); NB.dp = null; say(`${dayLabel(d.ndday)}を付けました。`); return refresh();
    }
    const c = NB.dp?.confirm; if (!c) return;
    if (d.act === 'ndswap') {
      for (const oid of c.ids) await noteStore.setMeta(oid, { date: null }); // 相手の本体は消さない。日付だけ外す
      await setNoteDate(id, c.date); NB.dp = null; say(`${dayLabel(c.date)}を付け替えました。`); return refresh();
    }
    if (d.act === 'ndopen') {
      NB.dp = null;
      if (c.ids.length === 1) return noteOpen(c.ids[0]);
      await noteBack(); NB.day = c.date; paintNoteLists(); render();
    }
  } catch { say('日付を付けられませんでした。'); }
}
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
  else if (a === 'curmv') { NB.curFolder = (await noteStore.getMeta(NB.cur))?.folderId || ''; openNoteMenu({ k: 'curmv' }); }
  else if (a === 'curmvto') { NB.menu = null; paintNoteMenu(); await noteStore.setMeta(NB.cur, { folderId: d.to || null }); await paintNoteMeta(); invalidateNoteList(); }
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
// ---------- v19.3（征希さんの要望）: iOS リマインダーとの同期をやめた。同期のコード（同期の部品のファイル・native の橋・設定の同期の段）は外した ----------
// 保存されている同期の設定値（duo-rem-sync…）は消さない。書かない。「やめた知らせを出すか」の判定に読むだけ。
const SYNC_KEY = `duo-rem-sync${suffix}`;
const REM_END_KEY = `duo-rem-ended${suffix}`; // 'due'＝つながり／墓標があった（知らせを出す）、'shown'＝知らせを出した（もう出さない）。バックアップには入れない
const taskStore0 = createTaskStore(db);
// ---------- v19.3 その2 F（征希さん「ノートにチェックボックスでタスクリストに追加する（ノートの日付けが期限）」）: ノートのチェック行 ⇄ タスク ----------
// つながりはタスクの任意の項目 source（js/note-tasks.js。IndexedDB・バックアップは版 6 のまま。ノートの本文には何も足さない）。
// ノート → タスク: ノートが保存されるたびに突き合わせる（noteTaskSync）。新しく作るのは、編集の画面で開いてから足した・直したチェック行だけ（NTK.base＝開いたときのチェック行の控え。
//   起動時に全ノートを走査しない。保存済みの行（IME のごみの行を含む）はタスクにしない）。日付のないノートでは作らない。行を消す・普通の行に戻すと、タスクは消さずつながりだけ外す。
// タスク → ノート: つながったタスクの完了が変わったら、ノートの行の「- [ ] 」「- [x] 」を入れ替える（noteLineFollow）。
const NTK = { base: new Map(), flashed: new Set(), chain: Promise.resolve() };
const taskStore = { ...taskStore0, async setDone(id, done, now) { const t = await taskStore0.setDone(id, done, now); noteLineFollow(t); return t; } };
function noteTaskOpen(id) { // 編集の画面でノートを開いた: いまのチェック行を控える（ここから足した・直した行だけがタスクになる）
  NTK.flashed.delete(id);
  Promise.resolve(noteStore.loadNote(id)).then(() => { NTK.base.set(id, baselineOf(noteStore.get(id)?.text ?? '')); }).catch(() => {});
}
function noteTaskSync(id) {
  NTK.chain = NTK.chain.then(async () => {
    const e = noteStore.get(id); if (!e || !e.loaded || noteStore.dirty(id) || e.failed) return;
    const base = NTK.base.get(id) ?? null;
    const links = (await db.listTasks()).filter((t) => !isTaskTombstone(t) && isNoteTask(t, id));
    if (!links.length && !base) return; // つながりも編集もないノート: 何もしない
    const n = await db.getNote(id), meta = n && n.deletedAt == null ? await noteStore.getMeta(id) : null;
    const plan = planNoteSync({ noteId: id, body: e.text, date: meta?.date ?? null, links, baseline: base });
    let made = 0, changed = false; const now = Date.now();
    for (const c of plan.create) {
      const t = await db.addTask({ title: c.title.slice(0, TASK_TITLE_MAX), due: c.due, source: c.source }, now);
      if (c.done) await taskStore0.setDone(t.id, true, now);
      made++; changed = true;
    }
    for (const u of plan.update) {
      const cur = await db.getTask(u.id); if (!cur || isTaskTombstone(cur)) continue;
      if (u.patch.title != null || u.patch.source) await db.putTask({ ...cur, ...(u.patch.title != null ? { title: u.patch.title.slice(0, TASK_TITLE_MAX), updatedAt: now } : {}), ...(u.patch.source ? { source: u.patch.source } : {}) });
      if ('done' in u.patch) await taskStore0.setDone(u.id, u.patch.done, now);
      if (u.patch.title != null || 'done' in u.patch) changed = true;
    }
    for (const tid of plan.unlink) { const cur = await db.getTask(tid); if (!cur) continue; const { source: _s, ...rest } = cur; await db.putTask(rest); changed = true; } // タスクは消さない。つながりだけ外す
    if (base) NTK.base.set(id, plan.baseline);
    if (changed) { RM.mut++; RM.sig = ''; loadTasks(); scheduleTasks(); }
    if (made && !NTK.flashed.has(id) && NB.ed?.id === id && meta?.date) { // design/35 §8: 1 回のシートで最初の 1 件だけ
      NTK.flashed.add(id); const d = parseKey(meta.date), m = `タスクに足しました（期限 ${d.getMonth() + 1}月${d.getDate()}日）`;
      NB.ed.flash(m); say(m);
    }
  }).catch(() => {});
  return NTK.chain;
}
function noteLineFollow(t) {
  if (!isNoteTask(t)) return;
  NTK.chain = NTK.chain.then(async () => {
    const id = t.source.noteId;
    if (NB.ed?.id === id) NB.ed.sync?.();
    await noteStore.flushNote(id); // 未保存の編集を先に書く
    const n = await db.getNote(id); if (!n || n.deletedAt != null) return;
    await noteStore.loadNote(id);
    const body = noteStore.get(id)?.text ?? n.body ?? '';
    const l = lineOfSource(body, t.source); if (!l || l.checked === !!t.done) return;
    const r = toggleCheck(body, l.index); if (!r) return;
    if (NB.ed?.id === id) NB.ed.replaceBody(r.text); else noteStore.setText(id, r.text); // 開いているノートは編集の画面ごと直す（戻すにも乗る）
    await noteStore.flushNote(id); // 保存のあとの noteTaskSync が、行が動いた分のつながり（順）を直す
  }).catch(() => {});
}
noteStore.subscribe((id) => { const e = noteStore.get(id); if (e && e.loaded && !noteStore.dirty(id) && !e.failed) noteTaskSync(id); });
// ノートの日付を変える（付ける・付け替える）。design/35 §8・決定 7: 期限がまだノートの元の日付と同じ、つながったタスクだけ一緒に動かす（時刻はそのまま）。戻り値 { ok, moved:[{ id, due, prev }] }（その3 の「元に戻す」で使う）
async function setNoteDate(id, date) {
  const from = (await noteStore.getMeta(id))?.date ?? null;
  const ok = await noteStore.setMeta(id, { date });
  const moved = [];
  if (ok && date && from && from !== date) {
    const now = Date.now();
    for (const m of tasksFollowingNote((await db.listTasks()).filter((t) => !isTaskTombstone(t)), id, from, date)) { const cur = await db.getTask(m.id); if (!cur) continue; await db.putTask({ ...cur, due: m.due, updatedAt: now }); moved.push(m); }
    if (moved.length) { RM.mut++; RM.sig = ''; loadTasks(); scheduleTasks(); }
  }
  return { ok, moved };
}
const localCall = createLocalCall(taskStore); // 完了・削除・編集の controller の口（Duo 内保存へ）
const addCtl = createLocalAddController(taskStore);
// 完了の丸: 押すと表示だけ即変え、1.5秒後に最後の状態を1回保存して完了段へ移す。6秒は「元に戻す」。失敗は表示を戻して理由を出す。
const doneCtl = createTaskDoneController(taskStore, {
  onPending: () => render(),
  onSettle: (id, { result, failed, err, done }) => {
    RM.mut++;
    if (result && RM.data) RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === id ? rowOf(result) : x)) };
    RM.sig = '';
    { const fl = dayFlipCapture(); render(); dayFlipPlay(fl); } // 35 §3: 完了したタスクは、1.5 秒後に区画の一番下へ 0.25 秒（寄せ）で移る
    scheduleTasks();
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
  return focusTasksHtml(viewData(), { view: state.taskView, sel: FT.sel, olderOpen: FT.older, selected: state.selected, pending: doneCtl.pending(), add: RM.data ? { draft: RM.add } : null, loading: !RM.err, error: RM.err, });
}
function taskBody(where) {
  return tasksHtml(viewData(), { selected: state.selected, doneOpen: RM.doneOpen, histDays: RM.histDays, loading: !RM.err, error: RM.err, busyMore: RM.more, pending: doneCtl.pending(), add: RM.data ? { draft: RM.add } : null, });
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
// 表示用のデータ（削除待ちを除く）
function viewData() {
  if (!RM.data) return RM.data;
  const ids = delCtl.ids();
  return { ...RM.data, reminders: ids.size ? RM.data.reminders.filter((x) => !ids.has(x.itemId)) : RM.data.reminders };
}
// ---------- v19.3: リマインダーとの同期をやめた後始末と、1 回だけの知らせ（設計 35 §8.1・連携 第20弾 §2.2・§3 (e)） ----------
// 版を上げた最初の起動で、生きているタスクのつながり（rem*・syncState）だけを外し、墓標を片づける（題名・期限・完了・メモ・notify・並び・updatedAt は変えない）。
// iOS のリマインダー側は消さない・触らない。権限の API は呼ばない。何度通しても同じ（外すものが無ければ何も書かない）。
const remEndDlg = $('#remend');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
// 出す条件: まだ出していなくて、同期の設定の enabled か everEnabled が true、または つながり／墓標があった端末だけ。
function remEndDue() {
  const m = lsGet(REM_END_KEY);
  if (m === 'shown') return false;
  const st = parseLS(SYNC_KEY);
  return m === 'due' || (!!st && typeof st === 'object' && (st.enabled === true || st.everEnabled === true));
}
let remEndReady = false; // つながりの後始末が済んでから出す
function maybeShowRemEnd() {
  if (!remEndReady || document.hidden || remEndDlg.open || anyPanel() || !remEndDue()) return;
  remEndDlg.classList.remove('out');
  remEndDlg.showModal(); // モーダル（後ろは押せない・読まない）
  $('#remend-h').focus({ preventScroll: true });
}
function closeRemEnd() {
  if (!remEndDlg.open || remEndDlg._out) return;
  lsSet(REM_END_KEY, 'shown'); // OK・後ろをたたく・下へ払う・Esc のどれでも「出した」印を残す
  remEndDlg._out = true;
  remEndDlg.classList.add('out');
  setTimeout(() => { remEndDlg._out = false; remEndDlg.classList.remove('out'); remEndDlg.style.transform = ''; if (remEndDlg.open) remEndDlg.close(); }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 150 : 200);
}
remEndDlg.addEventListener('cancel', (ev) => { ev.preventDefault(); closeRemEnd(); });
remEndDlg.addEventListener('click', (ev) => {
  if (ev.target.closest('#remend-ok')) { closeRemEnd(); return; }
  if (ev.target !== remEndDlg) return;
  const r = remEndDlg.getBoundingClientRect(); // dialog そのものに当たったクリックのうち、箱の外＝後ろの暗い所
  if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) closeRemEnd();
});
{ // 下へ払う（48pt 以上）で閉じる。足りなければ元の位置へ戻す
  let sw = null;
  remEndDlg.addEventListener('pointerdown', (ev) => { if (ev.target.closest('button') || remEndDlg._out) return; const r = remEndDlg.getBoundingClientRect(); if (ev.clientY < r.top) return; sw = { id: ev.pointerId, y: ev.clientY, dy: 0 }; });
  remEndDlg.addEventListener('pointermove', (ev) => { if (!sw || ev.pointerId !== sw.id) return; sw.dy = Math.max(0, ev.clientY - sw.y); remEndDlg.style.transition = 'none'; remEndDlg.style.transform = sw.dy ? `translateY(${sw.dy}px)` : ''; });
  const end = (ev) => {
    if (!sw || ev.pointerId !== sw.id) return;
    const g = sw; sw = null;
    remEndDlg.style.transition = '';
    if (ev.type === 'pointerup' && g.dy >= 48) closeRemEnd(); else remEndDlg.style.transform = '';
  };
  remEndDlg.addEventListener('pointerup', end);
  remEndDlg.addEventListener('pointercancel', end);
}
(async () => {
  try {
    const r = await dropOldLinks(db);
    if (r.unlinked + r.tombstones > 0) {
      if (lsGet(REM_END_KEY) !== 'shown') lsSet(REM_END_KEY, 'due');
      RM.mut++; RM.sig = ''; scheduleTasks(); // 外した件へアプリの通知を付け直す
    }
  } catch { /* 読めなければ次の起動でもう一度 */ }
  remEndReady = true;
  maybeShowRemEnd(); // 起動して最初に前面になったとき（裏で起動したら visibilitychange で）
})();
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
  if (ttOn()) return ''; // 「今日＋明日」の間は左右のタブを出さない（M-04）。型の切り替えは右の帯の見開きのボタン
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
    const t = e.all || dayOf(e.start) !== k ? '終日' : t0(e.start.slice(11));
    return `<button type="button" class="agrow dlrow ${catCls(e)}"${catSty(e)} role="listitem" data-event="${esc(e.id)}" data-sday="${k}" aria-label="${esc(`${xname(e)}${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}${alLabel(e)}`)}"><span class="agt">${t}</span><i class="agbar" aria-hidden="true"></i><strong>${xi(e)}${rep(e)}${esc(e.title)}</strong></button>`;
  }).join('');
  return `<div class="dlist" data-scroll="dlist" data-pane="${k}" role="list" aria-label="${esc(dayLabel(k))}の予定">${rows || '<p class="dnone">予定はありません</p>'}</div>`;
}
// 1日ページ。縦の寸法（見出し82・予定欄・つまみ24・ノート）は左右で同じ。ノート欄の行の y は CSS の整数 px。
// 見るだけのノートの行（記号は出さない）。書式は notes-ui の本文と同じ data-k の描き方。
function richHtml(vs, tag = 'span') { return vs.map((v) => { const lv = v.kind === 'check' || v.kind === 'bullet' ? levelOfPre(v.pre) : 0; /* 第19.3版 C: 字下げの段 */ return `<${tag} class="nl" data-k="${v.kind}"${v.kind === 'check' ? ` data-c="${v.checked ? 1 : 0}"` : ''}${lv ? ` data-lv="${lv}" style="--lv:${lv}"` : ''}>${esc(v.text)}</${tag}>`; }).join(''); }
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
  return `<div class="shell spread${POS.band ? ' band' : ' fb'}">${renderPage('left', PG().left)}${renderPage('right', PG().right)}<div class="tabfade tfl" aria-hidden="true"></div><div class="tabfade tfr" aria-hidden="true"></div>${ctl()}${pageSwitch('left')}${pageSwitch('right')}</div>`;
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
    el.querySelector('.nowt').textContent = t0(hhmm(nowMin()));
  });
  hideNearNow(scope);
}
// 今の時刻の札から上下 12 以内の時刻ラベルは出さない（H-08）。札の半分の高さ＋12。
function hideNearNow(scope = root) {
  scope.querySelectorAll('.tlin').forEach((inner) => {
    const nl = inner.querySelector('.nowl'), tl = inner.closest('.tl');
    const labs = inner.querySelectorAll('.hlab');
    if (!nl || !tl) return;
    const hh = parseFloat(tl.style.getPropertyValue('--hh')) || parseFloat(getComputedStyle(tl).getPropertyValue('--hh')) || 44;
    const nm = Number(nl.style.getPropertyValue('--m')), half = (inner.querySelector('.nowt')?.offsetHeight || 22) / 2;
    const dp = !!tl.closest('.dpage'), edge = tl.scrollTop + tl.clientHeight - 12; // 今日＋明日: 窓の下 12 にかかるラベルは出さない（M-05）
    labs.forEach((h) => {
      const m = Number(h.style.getPropertyValue('--m'));
      const nearNow = !nl.hidden && Math.abs(m - nm) * hh / 60 < half + 12;
      const cut = dp && tl.clientHeight > 0 && 12 + m * hh / 60 + 9 > edge;
      h.style.visibility = nearNow || cut ? 'hidden' : '';
    });
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
  hideNearNow(tl.parentNode);
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
const hhOf = (pane) => (pane === 'fold' ? FOLD_HH : pane === 'mday' ? DG.hh : ttOn() ? 60 : TLP[pane]?.hh ?? 60); // v19.3 その2: 閉じた日の欄の時間（mday）は、バーで決めた今の1時間の高さ（28〜88）
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
let lastLand = null; // 前の描画が閉じた横だったか（null＝閉じた画面でなかった）
let lastClosed = null; // 前の描画が閉じた画面だったか（null＝まだ描いていない）
let renderRev = 0; // 描き直し番号（iOS のめくり B が、撮った絵を使い回してよいかを見る）
// 第19.2版 S11e（指示14）: 第19版 PR5 の「選んでいるタブを閉じた画面と開いた縦で共通に覚える」（syncTabAcrossPosture）はやめた。画面の記憶は別々（render の頭）。
function render() {
  if (noteComposing) { renderPending = true; return; } // IME 変換中は入力欄を作り直さない
  renderRev++;
  ensurePasteMonth();
  const fam = (k) => (k === 'home' || k === 'browse' ? 'closed' : k);
  { // S11e（指示14）: 閉じた⇔開いたの変わり目。閉じるときは開いた画面の分を取っておき、開くときは前に開いていた画面（表示・ホーム）へ戻す。選んだ日はそのまま引き継ぐ
    const cl = closedSize();
    if (lastClosed !== null && lastClosed !== cl) {
      if (cl) { OPENUI.view = state.view; OPENUI.home = state.home; state.view = CLOSEDUI.view; state.home = CLOSEDUI.home; } // 閉じたら、閉じた画面で見ていた面（この起動の間だけ覚える。初めはカレンダー）
      else { CLOSEDUI.view = state.view; CLOSEDUI.home = state.home; state.view = OPENUI.view; state.home = OPENUI.home; }
    }
    const turned = lastClosed !== null && lastClosed !== cl;
    lastClosed = cl;
    if (turned) saveUi(); // 引き継いだ日を、いまの側の分に書いておく
    // 閉じた画面に 28 §1 の日の時間軸の画面はない（34 §15-④）。日の欄がない「全部」の月のときだけ残す
    if (cl && state.view === 'day' && !state.monthExpand) state.view = 'month';
  }
  const kind = layoutKind(), prevKind = lastKind;
  if (GR.on && GR.geo !== grabGeo()) directCtl?.cancel('layout'); // つかんだまま閉じる・開く・回す: やめたと同じ（35 §6.5）
  if (state.strip && (!['closed', 'spread'].includes(fam(kind)) || (lastKind && fam(lastKind) !== fam(kind)))) state.strip = null; // 開閉・回転で姿勢が変わったら元の表示へ
  if (MORE.open && fam(kind) !== 'closed') MORE.open = false;
  if (noteEditing && (fam(kind) !== 'closed' || !safeBandNow())) noteEditing = false;
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
      else if (pk === 'browse') { const md = root.querySelector('.mday'); if (md) md.scrollTop = MP.scroll; }
    }
    if (pk === 'browse') stageAfterRender();
    { // 閉じた縦⇔横（34 §14.2）: 0.20 秒のフェード（前を消す 0.08 秒の間は出さず、0.12 秒で出す。重ねない）
      const ld = closedSize() ? closedLand() : null;
      if (ld !== null && lastLand !== null && ld !== lastLand && !reduced()) root.querySelector('.shell.closed .mpane')?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
      lastLand = ld;
    }
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
  landPaint(); // 別の日へ落とした直後の着地（マスの色・新しいチップ）を、描き直しをまたいで続ける
}

// ---------- 操作 ----------
function move(n, pane) {
  const k = state.selected;
  if (ttOn()) { set({ selected: addDays(k, n * 2) }); return; } // 今日＋明日は2日ずつ
  if (pane && layoutKind() === 'spread' && PG()[pane] !== 'month') { set({ selected: addDays(k, n * (PG()[pane] === 'time' ? tlStep(pane) : 1)) }); return; }
  if (pullOn() && !pane) { // 送る幅: 閉じた画面は今の段から（段1〜3＝1か月、段4〜6＝1週、段7＝7日。横は月。34 §10・§12 Q-14。品質 B-1: 保存がないと monthForm='two' のまま段1 なので monthForm は見ない）。開いた縦は月の型から
    const byMonth = pullKind() === 'browse' ? stgKindNow() === 'm' : state.monthForm === 'month';
    MP.anchor = ''; set({ selected: byMonth ? addMonths(k, n) : addDays(k, 7 * n) }); return;
  }
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
  const kbT = kbTopNow();
  let bottom = NB.sheet?.fs != null ? NB.sheet.fs : (de.dataset.kb && kbT !== null ? kbT : H);
  bottom = Math.min(bottom, H);
  const g = { x: 0, y: 152, w: W, pl: 12, pr: 12, bml: 12, bmr: Math.max(0, W - 20 - 342 - 8), kind };
  if ((kind === 'home' || kind === 'browse') && POS.band) { const R = safe().right; g.w = W - R; g.bmr = Math.max(0, g.bmr - R); g.rail = true; }
  if ((kind === 'home' || kind === 'browse') && W > H) { g.y = 8; g.bmr = 12; } // 閉じた横（34 §14.3）: x0〜594（帯なしは画面の幅）・y8〜466、上の帯 y16〜60、本文 x20〜574 // 第19.2版 S11c（design/34 §9.3）: 右の列（元に戻す）を隠さないよう、帯の手前まで。本文の幅 x20〜362 は同じ
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
  st.setProperty('--ns-pb', de.dataset.kb && kbTopNow() !== null ? '8px' : '0px'); // キーボードが出ているとき本文の窓の下端は kbTop の 8 上（20 §3）
  SHEET_EL.dataset.kind = g.kind; SHEET_EL.dataset.side = NB.sheet.side;
  if ((g.kind === 'home' || g.kind === 'browse') && L.w <= L.h) SHEET_EL.dataset.cp = '1'; else delete SHEET_EL.dataset.cp; // 閉じた縦: 日付の行のすぐ下が上の帯（35 §4.3）
  if (g.rail) SHEET_EL.dataset.rail = '1'; else delete SHEET_EL.dataset.rail; // 帯があるとき（閉じた画面）: 戻す群は右の列だけ（34 §15-②）
  const fs = NB.ed?.fsheetEl; if (fs) { fs.style.setProperty('--ns-x', `${g.x}px`); fs.style.setProperty('--ns-w', `${g.w}px`); }
}
async function openNoteSheet(id, day, side, { plain = false } = {}) {
  sheetBusy = true;
  try {
    if (NB.ed && NB.cur) { const ok = await NB.ed.leave(); if (ok === false) return; NB.cur = null; NB.dp = null; }
    const fresh = id == null;
    if (fresh) id = await createDayNote(day, plain);
    const ed = noteEditor();
    NB.sheet = { id, day, side, fs: null, date: day || null };
    sheetDateRow();
    SHEET_EL.hidden = false; SHEET_EL.classList.remove('closing'); SHEET_EL.append(ed.el);
    ed.titleEl.placeholder = plain && fresh ? '題名' : EMPTY_TITLE; // 35 §4.3: 新しいメモは、空のあいだ1行目に「題名」を薄く出す
    placeNoteSheet();
    render(); // 週の帯・ノート欄の描き直し（シートの外はそのまま見える）
    await ed.open(id);
    noteStore.getMeta(id).then((m) => { if (NB.sheet?.id === id) { NB.sheet.date = m?.date ?? null; SHEET_DATE.ui?.render(); } }).catch(() => {});
    if (fresh && plain) ed.titleEl.focus({ preventScroll: true });
    else if (fresh) { ed.bodyEl.focus({ preventScroll: true }); const n = ed.bodyEl.value.length; ed.bodyEl.setSelectionRange(n, n); }
    say('ノートを開きました。');
  } finally { sheetBusy = false; }
}
// ---- 第19.3版 その3（design/35 §4.3・決定 4・R2）: ノートのシートの一番上に「日付の行」44。カプセル「11月12日（木）」（今年でない日だけ年つき。六曜は出さない）をたたくと小さな月（予定・タスクの日付と同じ部品）。
// 日をたたくと、その日へ移す（長押しで落としたときと同じ扱い＝同じ札・同じ読み上げ・元に戻す。ノートがある日でも確かめない）。「日付を外す」は小さな月の下
const SHEET_DATE = { row: null, cap: null, ui: null };
function sheetDateRow() {
  if (!SHEET_DATE.row) {
    const row = document.createElement('div'); row.className = 'nsdate';
    const cap = document.createElement('button'); cap.type = 'button'; cap.className = 'dcap nsdcap'; cap.setAttribute('aria-haspopup', 'true'); cap.setAttribute('aria-expanded', 'false');
    row.append(cap); SHEET_DATE.row = row; SHEET_DATE.cap = cap;
    SHEET_EL.prepend(row);
    SHEET_DATE.ui = createDateField(cap, {
      after: row, scope: SHEET_EL, label: 'ノートの日付', empty: '日付なし', holiday: holidayMemo, buzz: () => { haptic('light').catch(() => {}); },
      get: () => NB.sheet?.date || '',
      set: (k) => sheetSetDate(k),
      clear: { label: '日付を外す', on: () => sheetSetDate(null) },
    });
  }
  if (SHEET_EL.firstElementChild !== SHEET_DATE.row) SHEET_EL.prepend(SHEET_DATE.row);
  SHEET_DATE.ui.close(); SHEET_DATE.ui.render();
}
function sheetDateSync(id, date) { if (NB.sheet?.id === id) { NB.sheet.date = date; SHEET_DATE.ui?.render(); } }
async function sheetSetDate(k) {
  const sh = NB.sheet; if (!sh) return;
  const id = sh.id, from = sh.date;
  if (k === from) return;
  NB.ed?.sync?.(); await noteStore.flushNote(id).catch(() => {}); // 打っている途中の文字を先に書く
  await refreshNoteMarks();
  if (k && from && noteCardById(id)) { sh.date = k; SHEET_DATE.ui.render(); mvLog('drop', { day: k }); await moveNoteCard(id, k); if (noteCardById(id)?.day !== k) { sh.date = from; SHEET_DATE.ui.render(); } return; }
  try { const r = await setNoteDate(id, k); if (!r.ok) throw new Error('note'); } catch { SHEET_DATE.ui.render(); moveFail(k ? '移せませんでした。' : '日付を外せませんでした。'); return; }
  sh.date = k; SHEET_DATE.ui.render(); await refreshNoteMarks(); if (NB.rows) invalidateNoteList();
  if (k) { notice(`${DOW_P(k)}を付けました`, null, 3000); say(`${dayLabel(k)}を付けました。`); }
  else { // 日付を外す: その日の日の欄からカードが消える（date: null。sourceDate には戻さない）。6 秒は元に戻せる
    const rec = { kind: 'note', id, from, to: null, tasks: [] };
    mvDropUndo(); MV.rec = rec; MV.timer = setTimeout(() => { if (MV.rec === rec) MV.rec = null; }, UNDO_MS);
    notice('日付を外しました', { label: '元に戻す', fn: undoMove }, UNDO_MS); say('日付を外しました。');
  }
}
// 日の欄のノートのカードをたたく・「＋ ノート」: ノートのシートを下から出す（27 §2）
async function openCardNote(id, day, btn) {
  if (!day || NB.blocked || dayNoteBusy || NB.sheet || sheetBusy || curlBusyNow()) return;
  await openNoteSheet(id || null, day, 'right', { plain: true });
}
async function closeNoteSheet() {
  const sh = NB.sheet; if (!sh) return true;
  const ed = NB.ed;
  if (ed) { ed.closeFs?.(false); const ok = await ed.leave(); if (ok === false) return false; }
  NB.sheet = null;
  SHEET_EL.classList.add('closing');
  SHEET_DATE.ui?.close(); if (ed) ed.titleEl.placeholder = EMPTY_TITLE;
  const fin = () => { if (NB.sheet) return; SHEET_EL.hidden = true; SHEET_EL.classList.remove('closing'); if (ed && SHEET_EL.contains(ed.el)) ed.el.remove(); sheetHeadSync(); };
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
  feel('light'); // 選んだ型が変わったときに触覚を1回（品質レビュー・V-01。haptic('light') は selectionHaptic）
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
// V-27: 右の帯でタスク・ノートを開く／戻すとき、入れ替わった中身を 0.15 秒のフェードで出す（25 §1 小）
function fadeStripContent(kind) {
  const el = root.querySelector(kind === 'spread' ? '.page.rp' : '.mpane'); if (!el) return;
  el.classList.remove('s7fade'); void el.offsetWidth; el.classList.add('s7fade');
  el.addEventListener('animationend', () => el.classList.remove('s7fade'), { once: true });
}
function toggleStrip(id) {
  const kind = layoutKind();
  if (PS.on || (kind !== 'spread' && kind !== 'home' && kind !== 'browse')) return;
  TLM.open = null; MM.open = null;
  const name = PAGE_NAMES[id];
  if (state.strip === id) { // もう一度: 元へ戻す
    set({ strip: null }); fadeStripContent(kind);
    say(kind === 'spread' ? `${name}を閉じました。右ページは${PAGE_LABELS[state.pages.right]}です。` : `${name}を閉じました。`);
    return;
  }
  if (kind === 'spread') {
    const p = state.pages;
    if (p.left === id || (p.right === id && !state.strip)) { const side = p.left === id ? 'left' : 'right'; flashPage(side); say(`${side === 'left' ? '左' : '右'}ページがすでに${name}です。`); return; }
  }
  set({ strip: id, ...(kind === 'spread' ? { lastSide: 'right' } : {}) }); fadeStripContent(kind);
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
  let b = ev.target.closest('button');
  if (ev.target.closest?.('.mpull.browse .chip')) b = stgDayAt(ev.clientX, ev.clientY) || b; // 閉じた7段: 帯の上でも、指の下のマスの日を選ぶ（R-75）
  if (TLM.open && !ev.target.closest('.tlmenu, [data-act="tlmenu"]')) { TLM.open = null; render(); return; } // 選択肢の外をたたくと閉じる（たたいた先の操作はしない）
  if (RM.add.pop && !ev.target.closest('.rmdp, [data-act="remdue2"]')) { RM.add.pop = null; render(); }
  if (MM.open && !ev.target.closest('.mmenu, [data-act="mini"]')) { closeMini(false); return; } // 小さな月の外をたたくと閉じる（たたいた先の操作はしない）
  if (MORE.open && !ev.target.closest('.moremenu, [data-act="more"]')) { closeMore(false); return; } // 「…」の外をたたくと閉じる（たたいた先の操作はしない）
  if (!b && ev.target.closest?.('.mpull.browse .mph:not(.pasting)')) { stageToday(); return; } // 見出しの全体をたたくと今日へ（design/34 §2.1・§12 Q-11）
  if (!b || !root.contains(b)) return;
  const d = b.dataset;
  if (b.matches('.week .day[data-date]') && ev.detail > 0 && !b.closest('.mpull.browse')) { // 閉じた7段は、チップの上でもその日を選ぶ（R-75）。 // 月のチップ・帯は押す的でない（pointer-events:none）。押した位置にあれば、その予定を開く（第19版と同じ）。なければその日を選ぶ
    const chip = chipAtPoint(b, ev);
    if (chip && !PS.on) { openEditor(chip.dataset.event, b); return; } // 貼る日の選択中は、チップの上でもその日を選ぶ
  }
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
  else if (d.act === 'remdone') { RM.doneOpen = !RM.doneOpen; render(); root.querySelector('[data-act="remdone"]')?.focus({ preventScroll: true }); }
  else if (d.act === 'remmore') { RM.histDays += HIST_DAYS; RM.more = true; render(); root.querySelector('[data-act="remmore"]')?.focus({ preventScroll: true }); loadTasks(); }
  else if (d.date && b.closest('.pvwk')) { set({ selected: d.date, view: 'day', home: false }); say(`${dayLabel(d.date)}を日表示で開きました。`); } // 今週の帯のマス → 日タブのその日
  else if (d.jump && b.closest('.pvwk')) { set({ selected: d.jump, view: 'day', home: false }); }
  else if (d.date) {
    const md0 = b.closest('.mpull.browse') && d.date !== state.selected && !reduced() ? root.querySelector('.mpull.browse .mday') : null, st0 = md0 ? md0.scrollTop : 0; // M5: 日の欄を 0.15 秒で入れ替える
    const compact = !pullOn() && (['home', 'browse'].includes(layoutKind()) || (isPortrait() && !panelOn()));
    // 閉じた画面・開いた縦では選択日サイド（一覧）が無いので、日付選択でその日の日表示へ進む。
    set(compact && state.view === 'month' ? { selected: d.date, view: 'day' } : { selected: d.date });
    if (md0) daySwap(md0, st0);
    if (!compact && layoutKind() === 'spread' && PG().left === 'month' && PG().right === 'memo') filterNotesByDay(d.date); // 左の月の日で右のノート一覧を絞る
  } else if (d.jump) { if (pullOn()) set({ selected: d.jump }); else if (closedSize()) closedDayGo(d.jump); else set({ selected: d.jump, view: 'day' }); }
  else if (d.act === 'mptoday') { if (b.closest('.mpull.browse')) stageToday(); else { MP.anchor = ''; set({ selected: todayKey() }); } }
  else if (d.act === 'more') { if (MORE.open) closeMore(); else openMore(); }
  else if (d.more) moreGo(d.more);
  else if (d.act === 'calback') calBack();
  else if (d.act === 'noteundo') { if (noteHist().undo) NB.ed?.undo(); }
  else if (d.act === 'noteredo') { if (noteHist().redo) NB.ed?.redo(); }
  else if (d.act === 'notelist') showNotePage();
  else if (d.act === 'tasklist') toggleStrip('task');
  else if (d.act === 'cardnote') openCardNote(d.note, d.sday, b);
  else if (d.act === 'addnote') openCardNote(null, d.day, b);
  else if (d.act === 'addtask') openNewTask(d.day, b);
  else if (d.act === 'cardmv') { if (d.how === 'pick') openCardDate(d.kind, d.id, d.day, b); else cardMoveById(d.kind, d.id, d.day, addDays(d.day, d.how === 'prev' ? -1 : 1)); }
  else if (d.act === 'dayunfold') dayUnfold();
  else if (d.dg === 'card' || d.dg === 'time') dayTab(d.dg);
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
document.addEventListener('pointerdown', (ev) => {
  const ax = ev.target.closest?.('.haxis'); if (!ax) return;
  const r = ax.getBoundingClientRect(), y = ev.clientY - r.top;
  let best = null;
  for (const bar of ax.querySelectorAll('.hbarev')) { const t = parseFloat(bar.style.top), h = parseFloat(bar.style.height); if (y >= t - 2 && y < t + h + 2) { best = bar.dataset.hm; break; } }
  ax.dataset.hm = best || `${String(9 + Math.max(0, Math.min(9, Math.floor(y / 14)))).padStart(2, '0')}:00`;
}, true);
// 34 §15-④: 閉じた画面では日の時間軸の画面（28 §1）を開かない。カレンダーでその日を選び、日の欄を時間軸 B（1時間 44）にして、最初の予定の1時間前を見出しの下へ。
// 段は覚えている段のまま。段1〜3 は時間軸が4時間ほどしか見えないので段7 にする（横は段を使わないので変えない）。日の欄がない「全部」の月のときだけ、今までの日の画面を開く
function closedDayGo(day) {
  if (state.monthExpand) { set({ selected: day, home: false, view: 'day', strip: null }); return; }
  if (!closedLand() && state.stage <= 3) { state.stage = 7; state.monthForm = STG_FORM[7]; MP.a1 = ''; }
  DG.mode = 1; DG.hh = DAYBAR.min; DG.last = 1; state.dayGrip = 1; DG.tlKey = '';
  set({ selected: day, home: false, view: 'month', strip: null });
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
  } else if (page === 'time') closedDayGo(day);
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
function cancelSlide(d) { if (d._slide) { d._slide = null; d.classList.remove('sheet-out', 'fading'); d._reopen?.(); } } // 閉じる最中に開き直したら、閉じ方の持ち越し（_reopen）を捨てる
let fading = false;
const SLIDE_SHEETS = new Set([dlg, xdDlg, taskDlg, menuDlg, searchDlg, catsDlg, notifyDlg, backupDlg]);
// 小さな確認シート（削除の確認・範囲・破棄・再試行・リマインダー）も同じ寄せ（出る 0.25 秒・閉じるは同じ秒数で逆・reduced motion は 0.15 秒のフェード）。出るのは CSS、閉じるは close() を差し替えて動かしてから閉じる。閉じる最中に show() されたら閉じずに開き直す
for (const d of [confirmDlg, scopeDlg, discardDlg, xrDlg]) {
  const realClose = d.close.bind(d), realShow = d.show.bind(d);
  d.close = (rv) => { if (!d.open || d._slide) { if (!d.open) realClose(rv); return; } slideOut(d, () => { if (d.open) realClose(rv); syncInert(); }); syncInert(); };
  d.show = () => { cancelSlide(d); realShow(); };
}
function openPanel(d, from) {
  origins.set(d, from || document.activeElement);
  cancelSlide(d);
  d.show();
  syncInert();
  if (d === xdDlg || d === taskDlg) syncScrim();
}
function closePanel(d, restore = true, instant = false) {
  d._restore = restore;
  if (d.open && restore && SLIDE_SHEETS.has(d) && !fading) { // 設定の「選んで閉じる」（instant）も同じ寄せで閉じる（S6）
    // restore=false は別のパネルへ受け渡す閉じ方なので動かさずに閉じる
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
let colorSel = null; // 編集中の予定の色（design/37）。null＝カテゴリの色、文字列＝colorId。繰り返しは「この予定のみ」で保存しても系列の本体（全部の回）に付く
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
    alarms, colorId: colorSel,
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
  colorSel = extEd ? xColorIdOf(extEd.before) : validColorId(values.colorId) ? values.colorId : null;
  closeColorPop(false);
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
  $('#ed-tag').innerHTML = `<i class="cdot" style="background:${lineOf(b.color)}" aria-hidden="true"></i>${esc(subLabel(b))}${b.recurring ? ' <span aria-hidden="true">↻</span>' : ''}`;
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
  const gs = locked ? [] : [{ head: 'Duo（この端末だけ）', items: byVis(state.categories.map((c) => ({ type: 'duo', id: c.id, name: c.name, color: lineOf(c.color), hidden: !!c.hidden }))) }];
  if (extActive()) {
    for (const g of groupBySource(writable(X.calendars))) {
      gs.push({ head: `iPhone ・ ${g.heading}`, items: byVis(g.items.map((c) => ({ type: 'iphone', id: c.id, name: c.title, color: lineOf(c.color), hidden: !link.calendarIds.includes(c.id) }))) });
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
// ---- 予定ごとの色（design/37 §3）: 「カレンダー」の下の「色」の行と、色を選ぶ画面（カテゴリの色＋フリックの 7 色）
const swVars = (colorId, base) => setVars(eventSet(colorId, base, MODE));
// 「カテゴリの色（プライベート）」／ iPhone のカレンダーなら「カレンダーの色（個人）」
const baseColorLabel = (d, info) => `${d.type === 'iphone' ? 'カレンダー' : 'カテゴリ'}の色（${info.name}）`;
const edBase4Color = () => { if (extEd) return { d: { type: 'iphone' }, info: { name: extEd.before.calName || 'iPhone', color: extEd.before.color } }; const d = destEff(); return { d, info: destInfo(d) }; };
function colorRowsHtml(cur, d, info, isIphone) {
  const row = (id, name, sub) => { const on = (isFlickId(cur) ? cur : '') === id; return `<button type="button" class="dopt copt" role="option" aria-selected="${on}" aria-label="色 ${esc(name)}${sub ? ` ${esc(sub)}` : ''}" data-dtype="color" data-did="${id}"><i class="csw lg" style="${swVars(id || null, info.color)}" aria-hidden="true"></i><span class="dn">${esc(name)}${sub ? `<small class="dsub">${esc(sub)}</small>` : ''}</span><span class="dck" aria-hidden="true">${on ? '✓' : ''}</span></button>`; };
  return `<h4>${d.type === 'iphone' ? 'カレンダー' : 'カテゴリ'}</h4>${row('', `${d.type === 'iphone' ? 'カレンダー' : 'カテゴリ'}の色`, info.name)}<h4>くすみ色（Duo フリックと同じ 7 色）</h4>${FLICK.map((f) => row(f.id, f.name, '')).join('')}${isIphone ? '<p class="dnote cnote">iPhone のカレンダーの予定に付けた色は、この端末の Duo の中だけに残ります（iPhone のカレンダーには書けません）。</p>' : ''}`;
}
const colorPage = createDestPage($('#color-pop'), {
  title: '色',
  settings: false,
  bodyHtml() { const { d, info } = edBase4Color(); return colorRowsHtml(colorSel, d, info, !!extEd); },
  onOpen() { form.inert = true; $('#f-color').setAttribute('aria-expanded', 'true'); },
  onClose(focus) { form.inert = false; $('#f-color').setAttribute('aria-expanded', 'false'); if (focus) $('#f-color').focus({ preventScroll: true }); },
  onPick(d) { colorSel = isFlickId(d.id) ? d.id : null; updateColorUi(); saveDraft(); },
});
function closeColorPop(focus = true) { return colorPage.close(focus); }
$('#f-color').addEventListener('click', () => { if (!colorPage.isOpen()) { closeDestPop(false); colorPage.open(); } });
function updateColorUi() {
  const { d, info } = edBase4Color(), on = isFlickId(colorSel);
  $('#color-sw').setAttribute('style', swVars(on ? colorSel : null, info.color));
  const nm = $('#color-name'); nm.textContent = on ? flickName(colorSel) : baseColorLabel(d, info); nm.classList.toggle('on', on);
  $('#f-color').setAttribute('aria-label', `色 ${nm.textContent}`);
  if (colorPage.isOpen()) colorPage.render();
}
// 保存の計画に色を入れる: 系列の本体（と、この保存で分かれた新しい系列）にだけ書く。overrides には書かない
const withColor = (plan) => ({ ...plan, puts: plan.puts.map((e) => { const n = { ...e }; if (validColorId(colorSel)) n.colorId = colorSel; else delete n.colorId; return n; }) });
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
dlg.addEventListener('close', () => { closeDestPop(false); closeColorPop(false); });
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
  $('#dest-dot').style.background = lineOf(d.color);
  if (destPage.isOpen()) renderDestPop();
  updateColorUi();
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
    rcount: String(r?.count ?? 10), runtil: r?.until ? r.until.replaceAll('-', '/') : '', ropen: false, autoDays: false, alarms: o.alarms, colorId: cur.p.colorId ?? null,
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
// シートが出る動き（transform）の途中でも、止まったときの位置で決める。getBoundingClientRect は動きの途中の位置を返すので、
// 動きの影響を受けない offsetTop を積んで「いまの送りを含む、スクロール 0 のときの y」を出す（V-08。動きを止めたテストでは見えなかった）。
const layoutY = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop + (e === el ? 0 : e.clientTop); return y; };
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
  let shift = 0;
  for (const r of rows) {
    if (!r.offsetParent) continue;
    const top = layoutY(r) + shift, bottom = top + r.offsetHeight;
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
  // 行は、帯（avoid-y0〜y1）にかかるなら、溝の下の面の始まり（cut-y1＝y500）へ送る（V-08）。上の面の行は avoid-y0（y459）までで止める。
  const to = Number.isFinite(parseFloat(de.style.getPropertyValue('--groove-cut-y1'))) ? parseFloat(de.style.getPropertyValue('--groove-cut-y1')) : y1;
  const vis = all.filter((r) => r.offsetParent), base = vis.map(layoutY);
  let shift = 0;
  vis.forEach((r, i) => {
    const top = base[i] + shift, bottom = top + r.offsetHeight;
    if (r.offsetHeight > 1 && bottom > y0 + 0.25 && top < y1) {
      let m = Math.ceil(to - top);
      r.style.marginTop = `${m}px`; r.dataset.gpush = '1';
      const real = layoutY(r); // 前の行の下の余白と重なる（マージンの相殺）ぶん足りないことがあるので、実測で合わせる
      if (real < to - 0.25) { m += Math.ceil(to - real); r.style.marginTop = `${m}px`; }
      shift = layoutY(r) - base[i];
    }
  });
}
let grooveRaf = 0;
// 「色」の行の置き場所（design/37 §3.1 は「カレンダー」のすぐ下）。キーボードが出てシートが低いとき（開いた横で 352 など）は、
// 題名を打つ間に カレンダー・開始・終了・長さ・終日 が全部見える決まり（edit-sheet）を守るため、「終日」の下へ下げる
function placeColorRow() {
  if (!dlg.open) return;
  const row = $('#color-l'), tight = dlg.clientHeight < 420, after = tight ? form.querySelector('label.check') : $('#dest-l');
  if (after && after.nextElementSibling !== row) after.after(row);
}
const grooveSchedule = () => { cancelAnimationFrame(grooveRaf); grooveRaf = requestAnimationFrame(() => { placeColorRow(); editorGroove(); menuGroove(); }); };
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
  $('#tk-del').hidden = lock || gone || !!TK.fresh;
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
  $('#tk-body').innerHTML = taskEditorHtml(TK.ed);
  tkFields();
  tkSourceRow(r);
  tkUi();
  openPanel(taskDlg, from);
  const t = $('#tk-title'); (t.disabled ? $('#tk-close') : t).focus({ preventScroll: true });
}
// 第19.3版 その3（design/35 §3）: 日の欄の「＋ タスク」。その日を期限にした新しいタスクを、同じシートで題名から書く（保存を押すまで何も作らない）
function openNewTask(day, from) {
  if (!RM.data || anyPanel()) { if (!RM.data) say('タスクを読み込んでいます。'); return; }
  const r = { itemId: '', listId: LOCAL_LIST.id, title: '', notes: '', due: day ? { date: day } : null, done: false, alarms: [], readOnly: false, recurring: false };
  TK = { ed: openTaskEditor(r, RM.data.lists), busy: false, gone: false, notify: undefined, fresh: true }; tkKey = '';
  $('#tk-body').innerHTML = taskEditorHtml(TK.ed);
  tkFields(); tkUi();
  openPanel(taskDlg, from);
  $('#tk-title').focus({ preventScroll: true });
}
// タスクのシートの「ノート「買い物」 ›」（35 §8）: ノートのチェック行からできたタスクは、期限の下の行からそのノートを開ける
function tkSourceRow(r) {
  const c = r?.source ? noteCardById(r.source.noteId) : null; if (!c) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tksrc'; b.textContent = `ノート「${c.title || EMPTY_TITLE}」 ›`; b.setAttribute('aria-label', `ノート「${c.title || EMPTY_TITLE}」を開く`);
  b.addEventListener('click', () => { if (taskIsDirty()) { openDiscard(taskDlg); return; } const day = c.day; fadeClose(taskDlg, closeTask); setTimeout(() => { if (!NB.sheet) openNoteSheet(c.id, day, 'right'); }, 260); });
  $('#tk-timerow')?.after(b);
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
  if (t.fresh) { // 新しいタスク（日の欄の「＋ タスク」）
    const f = tkForm(), a = await addCtl.submit({ title: f.title, due: f.date || null, time: f.date ? f.time || '' : '', notify: f.notify === true });
    if (TK !== t) return;
    t.busy = false;
    if (!a.ok) { t.ed.err = a.empty ? '題名を入力してください。' : a.busy ? '' : taskErrText(a.code, 'もう一度お試しください。'); tkUi(); if (t.ed.err) say(t.ed.err); return; }
    let row = a.reminder;
    if (f.notes) { try { row = rowOf(await taskStore.update(row.itemId, { note: f.notes })); } catch { /* メモだけ保存できなかった: タスクは残す */ } }
    RM.mut++;
    const list = RM.data?.reminders || [];
    RM.data = { lists: [LOCAL_LIST], reminders: [...list.filter((x) => x.itemId !== row.itemId), row] }; RM.sig = ''; render(); scheduleTasks();
    if (row.alarms?.length) askNotifyPerm();
    fadeClose(taskDlg, closeTask); say('タスクを追加しました。');
    return;
  }
  const r = await saveTask(localCall, orig, tkForm());
  if (TK !== t) return;
  t.busy = false;
  if (r.ok) {
    if (!r.noop && RM.data) { RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === orig.itemId ? r.reminder : x)) }; RM.sig = ''; render(); scheduleTasks(); if (r.reminder.alarms?.length) askNotifyPerm(); }
    fadeClose(taskDlg, closeTask);
    const d0 = orig.due?.date, d1 = r.reminder?.due?.date;
    if (!r.noop && d0 && d1 && d0 !== d1) { landStart(d1, cardSel('task', orig.itemId)); landPaint(); moveDone(d1, null, { kind: 'task', id: orig.itemId, prev: orig.due, to: r.reminder.due, from: d0, stamp: r.reminder.modifiedAt }, { title: r.reminder.title || '題名なし' }); } // 35 §4.1: 開いて期限の日を変えたら、動かしたのと同じ扱い（札「14日（土）へ移しました｜元に戻す」。戻すのは期限だけ）
    else if (!r.noop) say('タスクを保存しました。');
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
  xcMirror(plan.puts);
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
  if (extEd) { // iPhone の予定: 色は Duo の中の表に書く（EventKit には書けない）。本文の保存とは別に先に入れる
    const k = xcKeyOf(extEd.before);
    if (k && (xColorIdOf(extEd.before) ?? null) !== (colorSel ?? null)) { try { await xcPut(xcSet(XC.map, k, colorSel, { calId: extEd.before.calId, title: extEd.before.title, lastStart: extEd.before.start })); } catch { $('#error').textContent = SAVE_FAIL; return; } render(); }
    submitExt(r.event); return;
  }
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
    await commit(withColor(splan), { ops });
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
  $('#sc-target').textContent = `対象：${dayLabel(dayOf(occ.start))} ${occ.all ? '終日' : t0(occ.start.slice(11))} ${occ.title}`;
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
    await commit(withColor(plan), { ops }); // 色は「この予定のみ」でも全部の回（系列の本体）に付く（design/37 決定 2）
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
const XICON = '<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l12 12M17 5L5 17"/></svg>';
function showMenuScreen(name, focus = true, opener = null) {
  menuScreen = name;
  if (name !== 'calendar') { calEdit = false; calDel = null; }
  menuDlg.querySelectorAll('[data-screen]').forEach((el) => { el.hidden = el.dataset.screen !== name; });
  $('#m-title').textContent = MENU_TITLES[name];
  const back = $('#m-back');
  back.innerHTML = name === 'root' ? XICON : '‹ 設定'; // 下の画面は左上に「‹ 設定」、右上は×（H-19）
  back.setAttribute('aria-label', name === 'root' ? '設定を閉じる' : '設定に戻る');
  back.classList.toggle('mbackl', name !== 'root');
  $('#m-close').hidden = name === 'root';
  menuDlg.querySelector('.mhead').dataset.s = name === 'root' ? 'root' : 'sub';
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
function syncWeekMenu() {
  $('#m-week').setAttribute('aria-label', `週の始まり: ${state.weekStart === 1 ? '月曜（日曜にする）' : '日曜（月曜にする）'}`);
  $('#m-week-v').textContent = state.weekStart === 1 ? '月曜' : '日曜';
}
function openMenu(from) {
  calEdit = false; calDel = null; calUndo = null; clearTimeout(calUndoTimer);
  if (menuDlg._slide) cancelSlide(menuDlg); // 閉じる動きの最中にもう一度押したら、閉じずに開き直す
  else if (menuDlg.open) { closePanel(menuDlg); return; } // 帯の設定ボタン（×）でも閉じる
  $('#m-desk').hidden = L.w < 600 || L.h < 600;
  $('#m-notify').hidden = !NATIVE;
  $('#m-reminders').hidden = false;
  $('#m-gset').hidden = !NATIVE; $('#m-gmsg').hidden = true;
  $('#m-desk').setAttribute('aria-label', state.desk ? '卓上表示をやめる' : '卓上表示');
  $('#m-desk-v').textContent = state.desk ? 'オン' : 'オフ';
  syncWeekMenu();
  $('#m-sample').hidden = !(state.loaded && state.events.length === 0);
  syncMonthMenu();
  syncModeMenu();
  syncRokuyoMenu();
  syncTaskMenu();
  syncCurlMenu();
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
  const topMin = Math.max(vy, S.top) + (kind === 'open' ? 90 : 24); // V-25: 閉じた・開いた横の上の端は予定の編集と同じ y24
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
  z.setAttribute('aria-label', `月の文字: ${state.monthTextSize === 'large' ? '大（標準にする）' : '標準（大にする）'}`);
  $('#m-msize-v').textContent = state.monthTextSize === 'large' ? '大' : '標準';
}
// タスクの設定（Web でも出す）。月の件数のスイッチと、固定の完了表示期間だけ。リスト・同期・許可の設定はない。
function syncTaskMenu() {
  $('#m-tk').hidden = false;
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
  $('#m-mode-v').textContent = { simple: '手帳', named: '予定名', all: '全部' }[monthMode(isPortrait() ? 'portrait' : layoutKind())] || '';
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
  if (ev.target.closest('#lk-settings')) { openSettings(); return; }
  if (ev.target.closest('#lk-reload')) { X.failKey = ''; loadExt(true); renderCalScreen(); return; }
  if (ev.target.closest('#m-dest')) { if (!setDestPage.isOpen()) setDestPage.open(); return; }
  const go = ev.target.closest('[data-go]');
  if (go) { showMenuScreen(go.dataset.go, true); return; }
  if (ev.target.closest('#m-close')) { closePanel(menuDlg); return; }
  if (ev.target.closest('#m-back')) { menuBack(); return; }
  if (ev.target.closest('#m-gset')) { openGoogleSettings(); return; }
  const mb = ev.target.closest('[data-mode]');
  if (mb) { closePanel(menuDlg, true, true); const m = mb.dataset.mode; set(m === 'all' ? { monthExpand: true } : { style: m, monthExpand: false }); return; }
  const b = ev.target.closest('[data-m]');
  if (!b) return;
  const m = b.dataset.m, from = origins.get(menuDlg);
  if (b.id === 'touch-check-open') { closePanel(menuDlg, true, true); openTouchCheck(); return; }
  else if (m === 'notify') { closePanel(menuDlg, false); openNotify(from); }
  else if (m === 'backup') { closePanel(menuDlg, false); openBackup(from); }
  else if (m === 'desk') { closePanel(menuDlg, true, true); set({ desk: !state.desk }); }
  else if (m === 'week') { closePanel(menuDlg, true, true); set({ weekStart: state.weekStart === 1 ? 0 : 1 }); syncWeekMenu(); say(`週の始まりを${state.weekStart === 1 ? '月曜' : '日曜'}にしました。`); }
  else if (m === 'sample') { closePanel(menuDlg, true, true); loadSample(); }
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
  if (menuDlg.open && !ev.composedPath().includes(menuDlg) && !ev.target.closest('[data-act="menu"], [data-more]')) closePanel(menuDlg); // 中身を描き直してもメニュー内のクリックとして扱う
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
  const pal = PALETTE.map((p) => `<button type="button" class="swatch" data-color="${p.light}" style="background:${colorSet(p.light, MODE).fill};border-color:${lineOf(p.light)}" aria-label="${p.name}" aria-pressed="${p.light === cs.color.toLowerCase()}"></button>`).join('');
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
  const time = e.all ? '終日' : multi ? `${e.start.slice(5, 10).replace('-', '/')} ${t0(e.start.slice(11))} 〜 ${e.end.slice(5, 10).replace('-', '/')} ${t0(e.end.slice(11))}` : `${t0(e.start.slice(11))}–${t0(e.end.slice(11))}`;
  const hl = (s) => highlight(s, ts, esc);
  const inTP = ts.every((t) => highlight(`${e.title}\n${e.place}`, [t], esc).includes('<mark>'));
  const ex = !inTP && e.notes ? excerpt(e.notes, ts) : '';
  return `<button type="button" class="hit ${catCls(e)}"${catSty(e)} data-hit="${esc(e.id)}"${repLabel(e, `${dayLabel(dayOf(e.start))} ${time} ${e.title}`)}><span class="hmeta">${esc(time)} · ${esc(tagText(e))}</span><strong>${xi(e)}${rep(e)}${hl(e.title)}</strong>${e.place ? `<span class="hplace">${hl(e.place)}</span>` : ''}${ex ? `<span class="hnote">${hl(ex)}</span>` : ''}</button>`;
}
function memoHitHtml(m, ts) {
  m = { id: m.id, date: noteDateOf(m) || localDay(m.updatedAt), body: m.body };
  const yr = Number(srToday.slice(0, 4)), lab = Number(m.date.slice(0, 4)) === yr ? dayLabel(m.date) : `${m.date.slice(0, 4)}年${dayLabel(m.date)}`;
  const shown = displayText(m.body ?? m.text); // 記号（# ・- ・- [ ]）を外した文字から抜き出す。強調の位置も同じ文字で合わせる（S7 R-27）
  const ex = excerpt(shown, ts) || shown.replace(/\s*\n\s*/g, ' ').slice(0, 80);
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
  SR.range.hidden = true; // 「検索範囲：…最大200件」は出さない（H-17/M-13）。0件のときだけ本文に「この3年に見つかりませんでした」
  SR.range.textContent = `検索範囲：${ymd(res.range.from)}–${ymd(res.range.to)}・最大${LIMIT}件`;
  SR.xrange.hidden = !srSnap;
  if (srSnap) SR.xrange.textContent = srSnap.range ? `iPhoneの検索範囲：${ymdSlash(srSnap.range.from)}–${ymdSlash(lastDay(srSnap.range.to))}（読み込み済み）` : 'iPhoneの予定はまだ読み込まれていません。';
  srItems = res.items;
  const yr = Number(srToday.slice(0, 4));
  if (!res.ts.length) { SR.body.innerHTML = '<p class="smsg">探したい予定の言葉を入力してください。予定名・メモ・場所から探せます。</p>'; if (!initial) say2('検索語を消しました。'); return; }
  if (!res.total && !mres.total && !tres.total) { const nn = srOnly ? FOCUS_NOUN[srOnly] : '予定'; SR.body.innerHTML = srOnly ? `<p class="smsg">該当する${nn}はありません。検索語を確認してください。</p>` : `<p class="smsg">見つかりませんでした。検索語を確認してください。</p><p class="srnone">この3年に見つかりませんでした</p>`; say2(`該当する${nn}はありません。`); return; }
  const groups = groupByDay(res.items).map((g) => {
    const label = Number(g.key.slice(0, 4)) === yr ? dayLabel(g.key) : `${g.key.slice(0, 4)}年${dayLabel(g.key)}`;
    return `<section class="hgroup"><h3>${label}</h3>${g.items.map((e) => hitHtml(e, res.ts)).join('')}</section>`;
  }).join('');
  const evHtml = res.total ? `<p class="small hcount">${res.total}件の予定</p>${res.capped ? `<p class="small">${LIMIT}件を表示しています。検索語を追加して絞り込んでください</p>` : ''}${groups}` : (srOnly ? '' : '<p class="srnone">予定：この3年に見つかりませんでした</p>'); // STEER 23:00: ノート・タスクが当たったときは予定の欄に1行だけ
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
  if (closedSize()) closedDayGo(k); else set({ selected: k, view: 'day', home: false });
  const hitEl = (sc) => [...root.querySelectorAll(sc)].find((el) => el.dataset.event === String(e.id));
  (closedSize() && hitEl('.mpull.browse .mday [data-event]') || hitEl('[data-event]'))?.focus({ preventScroll: true }); // 閉じた画面は日の欄の時間軸の枠へ（格子のチップは押す的ではない）
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
    BK.body.innerHTML = `<section class="card"><h3>書き出し</h3><p>予定${st.total}件・うち繰り返し${st.recurring}件／設定も含めて保存（ノートとタスク、予定に付けた色も入ります）</p><button type="button" class="solid" id="bk-export"${dis}>JSONを書き出す</button><p class="small">iPhoneでは共有シートの『ファイルに保存』で残せます。</p>${bk.msg ? `<p class="bmsg">${esc(bk.msg)}</p>` : ''}</section>
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
    const text = JSON.stringify(buildBackup(state.events, { ...state, view: closedSize() ? OPENUI.view : state.view, notify: loadNotify(), tasks: remSet }, new Date(), state.categories, [], await db.listTasks(), await db.listNotes({ includeDeleted: true }), await db.listFolders(), xcExport(XC.map)), null, 2);
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
  let data = bk.data, dupLinks = 0, tp = null, lp = null, np = null, xcNext = null;
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
    // iPhone の予定の色の表（design/37 §4.2）: ファイルに項目があるときだけ。置き換えは表も置き換え、追加はファイルの側を足す（同じキーは今の端末を残す）
    xcNext = data.eventColors ? xcImport(XC.map, data.eventColors, kind === 'replace' ? 'replace' : 'add') : null;
    const xcPlan = xcNext ? { eventColors: xcItems(xcNext) } : {};
    // カテゴリと予定を1トランザクションで。参照先のカテゴリが無い予定は未分類に付け替える。
    const now = Date.now(), cin = data.categories.map((c) => ({ ...c, createdAt: c.createdAt || now, updatedAt: c.updatedAt || now }));
    if (kind === 'add') {
      const fx = fixEventCategories(plan.add, mergeCategories(state.categories, cin, 'add').categories, now);
      const fin = ensureOneVisible(fx.categories, now).list; // 書く結果が全部 hidden なら先頭だけ表示に戻す
      const cur = new Map(state.categories.map((c) => [c.id, c]));
      const same = (c) => cur.get(c.id)?.name === c.name && cur.get(c.id)?.color === c.color && !!cur.get(c.id)?.hidden === !!c.hidden;
      await db.applyImport({ catPuts: fin.filter((c) => !cur.has(c.id) || !same(c)), eventPuts: fx.events, taskPuts: tp.puts, ...legacyPuts, ...xcPlan });
    } else {
      let cats = data.hasCategories ? mergeCategories([], cin, 'replace').categories : mergeCategories(state.categories, cin, 'add').categories;
      if (!cats.length) cats = state.categories;
      if (data.hasCategories) cats = supplementForReplace(cats, data.events, now).list; // 不足する家族/外出/その他（と参照される仕事/私用）を補う
      const fx = fixEventCategories(data.events, cats, now);
      OBX.items = await db.applyImport({ catPuts: ensureOneVisible(fx.categories, now).list, eventPuts: fx.events, replace: true, outbox: (cur) => keepAfterReplace(cur, fx.events), ...(data.tasks ? { taskReplace: true, taskPuts: data.tasks } : {}), ...legacyPuts, ...xcPlan });
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
  if (xcNext) XC.map = xcNext;
  bumpRevision();
  try { setCategories(await db.listCategories()); } catch { /* 直前の一覧で続ける */ }
  let msg;
  if (kind === 'add') msg = `${plan.add.length}件を追加しました（重複${plan.skipped}件を除外）。${np?.added ? `ノートは追加${np.added}件（同じ${np.same}件）。` : ''}${lp ? `古いメモからノートを追加${lp.added}件・別ノート${lp.differ}件（同じ${lp.same}件）。` : ''}${data.tasks?.length ? `タスクは追加${tp.added}件。` : ''}`;
  else {
    msg = `${data.events.length}件の予定${data.settings ? 'と設定' : ''}に置き換えました。${np?.added ? `ノート${np.added}件。` : ''}${lp ? `古いメモからノートを追加${lp.added}件・別ノート${lp.differ}件（同じ${lp.same}件）。` : ''}${data.tasks?.length ? `タスク${data.tasks.length}件。` : ''}${dupLinks ? `同じiPhone連携の印を持つ予定があったため、${dupLinks}件の結びつきを外しました。` : ''}`;
    if (data.settings) { const { notify, tasks: tset, ...ui } = data.settings; const cv = { view: state.view, home: state.home }; Object.assign(state, ui);
      if (closedSize()) { if ('view' in ui) OPENUI.view = state.view; if ('home' in ui) OPENUI.home = state.home; Object.assign(state, cv); } // S11f: 置き換えた設定の 表示・ホーム は開いた画面の分（S11e 指示14）。閉じた画面はいまの面のまま
      saveUi(); if (tset) setRemSettings(tset); setFirstDay(state.weekStart); if (notify) saveNotify(notify); }
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
      xcAfterLoad(); // 色の表: 読み込みが成功したあとだけ「消えたかどうか」を見る（design/37 §4.2）
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (NATIVE) postureCtl?.refresh(); resumeExt(); requestNotifySync('resume'); maybeShowRemEnd(); } });

// ---------- 設定 › カレンダー（Duo／iPhone のアカウント別／リマインダー。✓で表示を切り替える） ----------
// ✓を変えても iPhone 側の予定・カレンダーは書き換えない（Duo の画面に出すかどうかだけ）。
const calScreenOpen = () => menuDlg.open && menuScreen === 'calendar';
const calDot = (c) => `<i class="cdot" style="background:${lineOf(safeColor(c))}" aria-hidden="true"></i>`; // 丸は変換後の線の色（36 §8.1）。元の色は変えない
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
  const t = (k) => `${ymdSlash(dayOf(k))} ${t0(k.slice(11))}`;
  const when = e.all
    ? `<dt>開始</dt><dd>${ymdSlash(dayOf(e.start))}（終日）</dd><dt>終了</dt><dd>${ymdSlash(dayOf(e.end))}（含む最終日）</dd>`
    : `<dt>開始</dt><dd>${esc(t(e.start))}</dd><dt>終了</dt><dd>${esc(t(e.rawEnd && e.rawEnd >= e.start ? e.rawEnd : e.end))}</dd>`;
  $('#xd-body').innerHTML = `<h3 class="xdt">${esc(e.title)}</h3><p class="xdcal caltag"><i class="cdot" style="background:${catSet(e).line}" aria-hidden="true"></i>${esc(subLabel(e))}${e.recurring ? ' <span class="rep" aria-hidden="true">↻</span>' : ''}</p>
    <dl class="facts">${when}<dt>場所</dt><dd>${e.place ? esc(e.place) : '場所なし'}</dd><dt>メモ</dt><dd class="notes">${e.notes ? esc(e.notes) : 'メモなし'}</dd></dl>${xcKeyOf(e) ? (() => { const cid = xColorIdOf(e), on = isFlickId(cid), nm = on ? flickName(cid) : `カレンダーの色（${e.calName || 'iPhone'}）`; return `<button type="button" id="xd-color" class="destbtn colorbtn" aria-haspopup="true" aria-label="色 ${esc(nm)}"><span class="dlbl">色</span><span class="dval"><i class="csw" style="${swVars(on ? cid : null, e.color)}" aria-hidden="true"></i><span class="cnm${on ? ' on' : ''}">${esc(nm)}</span><span aria-hidden="true">›</span></span></button>`; })() : ''}`;
}
$('#xd-body').addEventListener('click', (ev) => { const b = ev.target.closest('#xd-color'); if (!b || !xdCur) return; const cur = xdState?.before || xdCur; openColorStrip(xdCur.id, b, () => { if (xdDlg.open) xdBody(xdState?.before || cur); }); });
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
  $('#sc-target').textContent = `対象：${dayLabel(dayOf(b.start))} ${b.all ? '終日' : t0(b.start.slice(11))} ${b.title}`;
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
  if (r.events.length) xcMirror(state.events); // 保存で externalId が決まった: 色の表にも同じ色を入れる（design/37 §4.1）
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
xrDlg._reopen = () => { xrKeep = false; }; // 「再試行」で閉じ始めた直後に再失敗で開き直した場合、close イベントが来ないので keep を捨てる
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
    set({ selected: day, home: false, view: 'month' }); // 閉じた画面: タスクの面を開く（下はカレンダー。日の時間軸の画面はない。34 §15-④）
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
  const paneB = closedSize() && !state.monthExpand; // 閉じた画面（34 §15-④）: 日の時間軸の画面は開かず、カレンダーでその日を選んで日の欄の時間軸 B
  if (paneB) closedDayGo(day);
  else set({ selected: day, home: false, view: spreadKind ? 'month' : 'day', ...(needTime ? { pages: selectPage(state.pages, 'right', 'time') } : {}) });
  if (!target) { say(`${dayLabel(day)}を開きました。`); return; }
  const sel = paneB ? '.mpull.browse .mday .tlev, .mpull.browse .mday .adpill' : spreadKind ? '.page[data-page="time"] .tlev, .page[data-page="time"] .adpill' : '.daylist .event, .tlx .tlev, .tlx .adpill, .fold .tlev, .fold .adpill';
  const els = [...root.querySelectorAll(sel)].filter((b) => b.dataset.event === target.id && (!b.dataset.sday || b.dataset.sday === day));
  const el = els[0];
  if (el && el.closest('.fold')) { // 開いた縦の日・週: 紙をその予定の少し前まで動かす（上下の窓の同じ予定にしるしを付ける）
    if (el.dataset.s) foldScrollTo(Math.max(0, (Number(el.dataset.s) * FOLD_HH) / 60 - FOLD_HH));
    els.forEach((b) => { b.classList.add('nhl'); setTimeout(() => b.classList.remove('nhl'), 1600); });
  } else if (el && paneB) { // 日の欄（.mday）が1本で送られる。貼り付いた見出し 44 の下に、その予定の少し上から見せる
    const md = el.closest('.mday'), sec = md?.closest('.mpull.browse[data-stage]');
    if (sec && el.matches('.tlev')) { // 第19.3版 閉じた縦: 畳んだ所（最初の予定の1時間前より上）にあれば開き、画面に入っていなければ1本のスクロールで見出しの少し下へ
      const tl = el.closest('.tl'); if (tl && Number(el.style.getPropertyValue('--m')) < (Number(tl.style.getPropertyValue('--foldm')) || 0)) dayUnfold();
      const fb = sec.querySelector('.mpfix').getBoundingClientRect().bottom, r = el.getBoundingClientRect();
      if (r.top < fb || r.bottom > sec.getBoundingClientRect().bottom - 85) sec.scrollTop = Math.max(0, sec.scrollTop + r.top - fb - 40);
    } else if (md && el.matches('.tlev')) md.scrollTop = Math.max(0, md.scrollTop + el.getBoundingClientRect().top - md.getBoundingClientRect().top - 44 - 40);
    el.classList.add('nhl');
    setTimeout(() => el.classList.remove('nhl'), 1500);
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
  if (MORE.open && !anyPanel()) { closeMore(); return; }
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
  else if (layoutKind() === 'browse' && state.strip === 'memo' && !NB.cur && !NB.sheet && !PS.on) toggleStrip('memo'); // 日の欄の「ノート ›」で開いた一覧は Esc でカレンダーへ戻る（タブがなくなるため）
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
let swipeX0 = 0;
document.addEventListener('pointerdown', (ev) => { swipeX0 = ev.clientX; }, true);
async function swipeTo(dir) {
  if (swiping) return;
  // 第19.2版 S11c（design/34 §9.2）: ホーム・週の時間軸などは、左端 24 以内から右へ払うとカレンダーへ戻る
  if (dir < 0 && root.querySelector('.shell.closed.sub') && swipeX0 <= safe().left + 24) { calBack(); return; }
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
  // 第19.3版 その3（design/35 §7.1・R7）: 開いた画面のタスクとノートも、今ある行から持ち上げて月のマスへ落とせる（見た目は変えず、長押しを足すだけ）。
  //   開いた縦＝日の欄のタスクの行と、ノートの欄の題名の行（1行目）。開いた横＝ノートのページで開いているノートの題名の行（書いている最中＝題名にキャレットがある間は文字の選択のまま）。
  //   ノートの本文・タスクのページ・ノートの一覧・マスの件数と緑の線からは持ち上げない。
  const tr = t.closest('.mpull:not(.browse) .mday .mdtask');
  if (tr) { const id = tr.querySelector('[data-id]')?.dataset.id; return id ? { kind: 'grab', ck: 'task', id, el: tr, from: state.selected, tl: null, sc: tr.closest('.mday') } : null; }
  const nl = t.closest('.mpull:not(.browse) .mday .mdnotes .dnote .nl');
  if (nl) { if (nl.previousElementSibling) return null; const day = nl.closest('[data-day]')?.dataset.day, id = NB.firstId.get(day); return id ? { kind: 'grab', ck: 'note', id, el: nl, from: day, tl: null, sc: nl.closest('.mday') } : null; }
  const nt = t.closest('.page[data-page="memo"] .ned-title');
  if (nt) { const c = layoutKind() === 'spread' && nt !== document.activeElement && NB.cur ? noteCardById(NB.cur) : null; return c ? { kind: 'grab', ck: 'note', id: c.id, el: nt, from: c.day, tl: null, sc: null } : null; }
  const el = t.closest(GRAB_SEL); if (!el?.dataset.event) return null;
  const from = el.dataset.sday || el.closest('[data-day]')?.dataset.day || null;
  const md = el.closest('.mday'); // 開いた縦の月タブの下の面: 日の部分（.mday）が1本でスクロールする。時刻は動かさず（日だけ移す）、端のスクロールは .mday を動かす（R-49）
  const tl = !md && el.matches('.tlev') ? el.closest('.tl') : null;
  return { kind: 'grab', ck: 'event', id: el.dataset.event, el, from, tl, sc: md || tl };
}
// 閉じた画面の日の欄: 予定・タスク・ノートのカード（と終日の帯、「時間」のときの枠）を長押しで持ち上げて、月のマスへ落とす（35 §6）
function cardOrigin(t) {
  const md = t.closest('.mpull.browse .mday'); if (!md || PS.on) return null;
  const el = t.closest('.mdcard, .mdallday, .tlev:not(.fev), .adpill'); if (!el) return null;
  const sc = closedLand() ? md : md.closest('.mpull.browse'), from = el.dataset.sday || el.closest('[data-day]')?.dataset.day || state.selected;
  if (el.dataset.task) return { kind: 'grab', ck: 'task', id: el.dataset.task, el, from, tl: null, sc };
  if (el.dataset.note) return { kind: 'grab', ck: 'note', id: el.dataset.note, el, from, tl: null, sc };
  return el.dataset.event ? { kind: 'grab', ck: 'event', id: el.dataset.event, el, from, tl: null, sc } : null;
}
const dayDiffKeys = (a, b) => Math.round((parseKey(a) - parseKey(b)) / 864e5);
const hmOfIso = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
const isoPlusMin = (iso, m) => { const t = hmOfIso(iso) + m; return `${iso.slice(0, 10)}T${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const grabGeo = () => `${layoutKind()}|${window.innerWidth}x${window.innerHeight}`;
const GR = { on: false, o: null, chip: null, drop: '', off: 0, y0: 0, s0: 0, ext: null, gen: 0, asChip: false, hole: null, cw: 0, ckey: '', cells: null, acc: 0 };
// 速さの記録（追記7。品質の試験が見る口）: 持ち上げ・札・落とす・表示・元に戻す の時刻（performance.now）と触覚
const mvLog = (ev, extra) => { try { const l = (window.__duoMoveLog = window.__duoMoveLog || []); l.push({ ev, t: performance.now(), ...extra }); if (l.length > 400) l.splice(0, 200); } catch { /* */ } };
const mvFeel = (kind) => { feel(kind); mvLog('haptic', { kind }); };
// 閉じた画面: つかんでいる間は、マスの矩形を1回だけ測って使い回す（指が動くたびに 42 マスを測り直さない。画面を送った・描き直したら測り直す）
function grabCells() {
  const sec = root.querySelector('.mpull.browse'); if (!sec) return null;
  const st = sec.scrollTop, c = GR.cells;
  if (c && c.rev === renderRev && c.st === st && c.sec === sec) return c;
  const fix = sec.matches('[data-stage]') ? sec.querySelector('.mpfix')?.getBoundingClientRect().bottom ?? 0 : 0; // 閉じた縦: 貼り付いた年月・曜日の下に流れ込んだマスには落とせない
  const list = [...sec.querySelectorAll('.mgrid:not([data-leaving]) .day[data-date]')].map((d) => { const r = d.getBoundingClientRect(); return { k: d.dataset.date, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  return (GR.cells = { rev: renderRev, st, sec, fix, list });
}
function moveDayAt(x, y) {
  if (GR.on && closedSize()) { const c = grabCells(); if (c) { if (y < c.fix) return null; for (const d of c.list) if (x >= d.l && x < d.r && y >= d.t && y < d.b) return d.k; return null; } }
  const sd = stgDayAt(x, y); if (sd) return sd.dataset.date; // 閉じた7段（帯は左端のマスの子なので位置で決める）
  for (const n of document.elementsFromPoint(x, y)) { const d = n.closest?.('.week .day[data-date]'); if (d) return d.dataset.date; }
  return null;
}
function grabPaintDrop(k) {
  if (k === GR.drop) return;
  root.querySelectorAll('.day.mdrop').forEach((n) => n.classList.remove('mdrop'));
  GR.drop = k || '';
  if (k) root.querySelectorAll(`.week .day[data-date="${k}"]`).forEach((n) => n.classList.add('mdrop'));
}
// つかんだカードの情報（予定＝Duo は回を解いた形・iPhone は表示用、タスク、ノート）。時刻を動かせるのは Duo の時刻つき・1日内の予定の時間軸の枠だけ。rec＝繰り返しの回（「この回だけ」。35 §6.9）
function grabInfoOf(ck, id, tl = null) {
  if (ck === 'task') { const r = RM.data?.reminders.find((x) => x.itemId === id); return r?.due?.date ? { task: r, title: r.title || '（題名なし）', shift: false, day: r.due.date } : null; }
  if (ck === 'note') { const c = noteCardById(id); return c ? { note: c, title: c.title || EMPTY_TITLE, shift: false, day: c.day } : null; }
  const ext = visExt().find((x) => x.id === id);
  if (ext) return { ext, title: ext.title, shift: false, rec: !!ext.recurring };
  const cur = resolve(id); if (!cur) return null;
  const occ = cur.occ, one = !occ.all && dayOf(occ.start) === dayOf(occ.end);
  return { cur, title: occ.title, shift: !!tl && one, sMin: one ? hmOfIso(occ.start) : 0, eMin: one ? hmOfIso(occ.end) : 0, rec: !!cur.occKey };
}
const grabInfo = () => grabInfoOf(GR.o.ck || 'event', GR.o.id, GR.o.tl);
const DOW_P = (k) => `${parseKey(k).getDate()}日（${DOW[parseKey(k).getDay()]}）`;
// 札（35 §6.2）: 高さ 32・角丸 8・白・影 段2。左に種類の印（予定＝色の線 3×16、タスク＝四角 14、ノート＝紙 12×14）＋題名＋（繰り返しの回は「この回だけ」）＋行き先「→ 14日（土）」。
// 中身は変わったときだけ作り直す（指が動くたびには作らない。動かすのは transform だけ）
function grabChipPaint(g) {
  const key = `${g?.title}|${GR.off}|${GR.drop}`; if (key === GR.ckey || !GR.chip) return; GR.ckey = key;
  if (!g) { GR.chip.textContent = ''; GR.cw = GR.chip.offsetWidth; return; }
  const ck = GR.o.ck || 'event';
  const mark = ck === 'task' ? `<i class="gcb${g.task.done ? ' on' : ''}"></i>` : ck === 'note' ? PAPER_SVG.replace('class="mdpaper"', 'class="gcp"').replace('width="16" height="20"', 'width="12" height="14"') : '<i class="gcl"></i>';
  GR.chip.innerHTML = `${mark}<span class="gct${g.rec ? ' rec' : ''}">${g.rec ? '↻ ' : ''}${esc(g.title)}${g.shift ? ` ${hmText(g.sMin + GR.off)}〜${hmText(g.eMin + GR.off)}` : ''}</span>${g.rec ? '<span class="gcr">この回だけ</span>' : ''}${GR.drop ? `<span class="gcd">→ ${DOW_P(GR.drop)}</span>` : ''}`;
  GR.cw = GR.chip.offsetWidth;
}
// 札の位置: 指の真上（下の端＝指の y−24、横の中心＝指の x。画面の端から 8 内）
const grabChipPos = () => { const w = GR.cw || 0, x = Math.round(Math.min(Math.max(8, window.innerWidth - 8 - w), Math.max(8, EG.x - w / 2))), y = Math.round(Math.max(4, EG.y - 56)); return `translate(${x}px, ${y}px)`; };
// 持ち上げたカードを札に縮める（指から 24 動いたか、指が月の格子に入ったとき。0.15 秒）。元の場所には破線の枠が残る
function grabToChip() {
  if (GR.asChip || !GR.chip) return;
  GR.asChip = true;
  const el = GR.o.el; el.classList.remove('lifted'); el.classList.add('grabbed');
  GR.hole?.remove(); GR.hole = null;
  GR.chip.classList.add('on');
  GR.chip.animate(reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1 }], { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  mvLog('chip');
}
function grabRecalc() {
  if (!GR.on) return;
  if (!GR.o.el.isConnected) { // 描き直されたら、同じカードの要素へ破線の枠を付け直す
    const o = GR.o, ck = o.ck || 'event', q = ck === 'task' ? `[data-task="${CSS.escape(o.id)}"]` : ck === 'note' ? `[data-note="${CSS.escape(o.id)}"]` : `[data-event="${CSS.escape(o.id)}"]${o.from && o.el.dataset.sday ? `[data-sday="${o.from}"]` : ''}`;
    const n = root.querySelector(q);
    if (n) { o.el = n; n.classList.add(GR.asChip ? 'grabbed' : 'lifted'); }
  }
  const tl = GR.o.tl, g = grabInfo();
  if (tl?.isConnected && g?.shift) {
    const rc = tl.getBoundingClientRect(), er = GR.o.el.getBoundingClientRect(); // 時刻は、つかんだ枠の列の中で引いている間だけ動く（月へ向かう横の動きでは変わらない）
    if (Math.abs(EG.x - GR.x0) <= 24 && EG.x >= er.left && EG.x < er.right && EG.y >= rc.top && EG.y < rc.bottom) {
      const hh = hhOf(paneOf(tl)), dm = ((EG.y - GR.y0) + (tl.scrollTop - GR.s0)) / hh * 60;
      const off = Math.min(1440 - g.eMin, Math.max(-g.sMin, Math.round(dm / 15) * 15));
      if (off !== GR.off) { GR.off = off; mvFeel('light'); }
    }
  }
  const d0 = moveDayAt(EG.x, EG.y), from = g ? (GR.o.from || g.day || dayOf(g.ext ? g.ext.start : g.cur.occ.start)) : null;
  if (!GR.asChip && (d0 || Math.hypot(EG.x - GR.x0, EG.y - GR.y0) >= 24)) grabToChip();
  const d = d0 && !GR.off && g && d0 === from ? null : d0; // 元の日は落とす先として光らせない（落とせば取り消し。34 §16-4）
  if (d !== (GR.drop || null)) { grabPaintDrop(d); if (d) mvFeel('light'); }
  grabChipPaint(g);
  GR.chip.style.transform = grabChipPos();
}
function grabClear() {
  grabPaintDrop('');
  GR.chip?.remove(); GR.chip = null; GR.hole?.remove(); GR.hole = null;
  if (GR.inert) { GR.inert.inert = false; GR.inert = null; }
  root.querySelectorAll('.grabbed, .lifted, .liftrel').forEach((n) => n.classList.remove('grabbed', 'lifted', 'liftrel'));
  document.documentElement.removeAttribute('data-grab');
  GR.on = false; GR.o = null; GR.ext = null; GR.off = 0; GR.gen++; GR.asChip = false; GR.cells = null; GR.ckey = ''; GR.acc = 0;
}
// やめた（落とせない所で離す・元の日で離す・指がキャンセルされた。35 §6.5）: 札をカードの大きさに戻しながら、元の場所へ 0.22 秒（out の3乗）。知らせ・触覚・保存は出さない。視差効果を減らすときは 0.15 秒のフェードだけ
const BACK_MS = 220, BACK_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
function grabBack() {
  const chip = GR.chip, el = GR.o?.el, was = GR.asChip; GR.chip = null; grabClear();
  mvLog('back');
  if (!chip) return;
  if (!was || !el?.isConnected) { chip.remove(); return; } // 持ち上げただけ（札になる前）: カードは CSS の 0.15 秒で元の大きさへ戻る
  const r = el.getBoundingClientRect(), c = chip.getBoundingClientRect(); el.classList.add('grabbed');
  const done = () => { chip.remove(); if (!GR.on || GR.o?.el !== el) el.classList.remove('grabbed'); };
  if (reduced()) { chip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'linear', fill: 'forwards' }).finished.then(done, done); return; }
  chip.style.transformOrigin = '0 0';
  chip.animate([{ transform: chip.style.transform, opacity: 1 }, { transform: `translate(${r.left}px, ${r.top}px) scale(${r.width / Math.max(1, c.width)}, ${r.height / Math.max(1, c.height)})`, opacity: 0.25 }], { duration: BACK_MS, easing: BACK_EASE, fill: 'forwards' }).finished.then(done, done);
}
function grabRefuse(msg) { // つかめない予定: 軽く震えて戻す
  feel('warning'); directCtl?.cancel('refuse');
  if (msg) notice(msg, null, 3000);
}
// 運ぶ間は文字を選ばせない（品質 Q-1）。入力中の欄のキャレットは外さない
function grabNoSelect() { try { const a = document.activeElement; if (!(a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)))) getSelection()?.removeAllRanges(); } catch { /* */ } }
document.addEventListener('selectstart', (ev) => { if (GR.on && ev.cancelable) ev.preventDefault(); }, true);
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
  Object.assign(GR, { on: true, drop: '', off: 0, x0: x, y0: y, s0: o.tl?.scrollTop ?? 0, asChip: false, cells: null, ckey: '', cw: 0, acc: 0, geo: grabGeo() });
  if (o.el === document.activeElement) o.el.blur(); // 開いた横のノートの題名の行: つかんだら文字の入力には入らない
  if (o.el.matches('.ned-title')) { GR.inert = o.el.closest('.ned') || o.el; GR.inert.inert = true; } // 運ぶ間はノートの編集の欄（題名・本文）をフォーカス・選択の外に置く（WebKit はマウスで押したまま動かすと、題名の欄へフォーカスを戻し、本文をなぞって選んでしまう。品質 Q-1）。grabClear で戻す
  if (PRS.cell) { PRS.cell.classList.add('grabd'); PRS.cell.classList.remove('prs'); } // D1（34 §16-2）: つかんだ瞬間に、元のマスの地を 0.10 秒で戻す（元の場所は破線の枠で分かる）
  document.documentElement.dataset.grab = '1';
  grabNoSelect(); // 品質 Q-1: つかんだら、残っている文字の選択を外す（運ぶ間は selectstart も止める）
  const chip = document.createElement('div'); chip.className = 'gchip'; chip.setAttribute('aria-hidden', 'true');
  chip.style.setProperty('--cat-mark', getComputedStyle(o.el).getPropertyValue('--cat-mark') || '#294E42');
  document.body.append(chip); GR.chip = chip;
  if (o.el.matches('.week .chip, .week .strip, .week .bar')) { o.el.classList.add('grabbed'); GR.asChip = true; chip.classList.add('on'); mvLog('chip'); } // 月のマスのチップは持ち上げず、すぐ札になる（35 §6.1）
  else { // 持ち上げる（35 §6.1）: カードを 1.03 倍・影 段2（0 4 12 / 10%）、0.15 秒。元の場所に同じ大きさの破線の枠（1.5 #A8ABA4）
    const hole = document.createElement('div'); // 破線の枠はカードと同じ親の中（カードのすぐ前。カードの下に描かれ、画面を送っても一緒に流れる）
    hole.className = 'ghole'; hole.setAttribute('aria-hidden', 'true');
    hole.style.cssText = `left:${o.el.offsetLeft}px;top:${o.el.offsetTop}px;width:${o.el.offsetWidth}px;height:${o.el.offsetHeight}px;border-radius:${getComputedStyle(o.el).borderTopLeftRadius}`;
    o.el.before(hole); GR.hole = hole;
    if (getComputedStyle(o.el).position === 'static') o.el.classList.add('liftrel');
    o.el.classList.add('lifted');
  }
  mvLog('lift', { kind: o.ck || 'event' });
  mvFeel('medium');
  if (o.sc) edgeLoop.start();
  grabRecalc();
  say(`${g.title}をつかみました。${g.rec ? 'この回だけ移します。' : ''}月の日へ落とします。`);
}
// ---- 落とす（35 §6.5・§6.6）。予定・タスク・ノートで同じ流れ: 表示を先に変える → 保存（失敗したら「移せませんでした。」で元へ）→ 札「14日（土）へ移しました｜元に戻す」6 秒
const MV = { rec: null, timer: 0 };
const LANDING = { day: '', t0: 0, sel: '', until: 0 };
const mvDropUndo = () => { clearTimeout(MV.timer); MV.rec = null; };
const dayText = (k) => `${parseKey(k).getMonth() + 1}月${parseKey(k).getDate()}日`;
const dayLong = (k) => `${dayText(k)}${DOW_LONG[parseKey(k).getDay()]}曜日`;
function moveDone(toDay, note, rec, { title = '', only = false, tasks = 0 } = {}) {
  mvDropUndo();
  MV.rec = rec; MV.timer = setTimeout(() => { if (MV.rec === rec) MV.rec = null; }, UNDO_MS);
  const tail = note ? `。${note}` : '';
  notice(`${tasks ? `ノートとタスク ${tasks} 件を移しました` : `${DOW_P(toDay)}へ移しました${only ? '（この回だけ）' : ''}`}${tail}`, { label: '元に戻す', fn: undoMove }, UNDO_MS);
  if (only && !tail) { const t = document.querySelector('#native-toast'), sp = t?.querySelector('span'); if (sp) { t.classList.add('mvonly'); if (sp.scrollWidth > sp.clientWidth + 0.5) sp.textContent = `${parseKey(toDay).getDate()}日へ移しました（この回だけ）`; } } // 1 行に収める（13pt・詰め）。それでも入らないときは「（この回だけ）」を残し、曜日を省く（35 §6.9）
  say(`${tasks ? `${title}と、つながったタスク${tasks}件を` : `${title}${only ? 'のこの回だけ' : ''}を`}${dayLong(toDay)}へ移しました${tail}`);
}
// 移せなかった（計画が作れない・保存が断られた。35 §6.6・§6.7）: 「移せませんでした。」3 秒、触覚 warning。カードは元の場所へ 0.22 秒で戻す
function moveFail(msg = '移せませんでした。', back = null) {
  mvFeel('warning'); mvLog('fail');
  notice(msg, null, 3000); say(msg);
  if (back) cardReturn(back);
}
// 着地（35 §6.5）: 先の日のマスの #E5EEE9 を 0.25 秒残して 0.15 秒で消す。新しいチップは 0.15 秒で出す。描き直しをまたいで続ける（landPaint は render の終わりにも呼ぶ）
function landStart(day, sel) { Object.assign(LANDING, { day, sel, t0: performance.now(), until: performance.now() + 400, fresh: true }); }
function landPaint() {
  if (!LANDING.day) return;
  const el = performance.now() - LANDING.t0;
  if (el >= 400) { LANDING.day = ''; return; }
  for (const c of root.querySelectorAll(`.week .day[data-date="${LANDING.day}"]`)) {
    c.classList.add('mland'); c.style.animationDelay = `${-Math.round(el)}ms`;
    const chip = LANDING.sel && el < 150 ? c.querySelector(LANDING.sel) : null;
    if (chip) chip.animate([{ opacity: 0 }, { opacity: getComputedStyle(chip).opacity }], { duration: 150 - el, easing: 'linear' });
  }
  clearTimeout(LANDING.timer); LANDING.timer = setTimeout(() => { root.querySelectorAll('.day.mland').forEach((c) => { c.classList.remove('mland'); c.style.removeProperty('animation-delay'); }); LANDING.day = ''; }, 400 - el + 20);
}
const cardSel = (ck, id) => (ck === 'task' ? `[data-task="${CSS.escape(id)}"]` : ck === 'note' ? `[data-note="${CSS.escape(id)}"]` : `[data-event^="${CSS.escape(id)}"]`); // 予定は繰り返しの回（親の id で始まる）も拾う
// 日の欄の並びが変わるときの動き（落とした後に元の破線の枠が閉じて下のカードが上がる・完了したタスクが区画の下へ移る。0.25 秒・寄せ）
const DAYFLIP_SEL = '.mdcard, .mdallday, .mdsh, .mdadd, .mdnone2';
const flipKey = (n) => n.dataset.task || n.dataset.note || n.dataset.event || n.className;
function dayFlipCapture() {
  const md = root.querySelector('.mpull.browse .mday'); if (!md || reduced()) return null;
  return new Map([...md.querySelectorAll(DAYFLIP_SEL)].map((n) => [flipKey(n), n.getBoundingClientRect().top]));
}
function dayFlipPlay(m) {
  if (!m) return;
  for (const n of root.querySelectorAll(`.mpull.browse .mday :is(${DAYFLIP_SEL})`)) {
    const y0 = m.get(flipKey(n)); if (y0 == null) continue;
    const dy = y0 - n.getBoundingClientRect().top;
    if (Math.abs(dy) >= 1 && Math.abs(dy) < 600) n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  }
}
// 表示を先に変える（落としてから先の日に出るまでを短く。追記7）。fn＝メモリの中身を変える。描き直して、着地の動きを始める
function moveShow(toDay, ck, id, fn) {
  const fl = dayFlipCapture();
  fn(); landStart(toDay, cardSel(ck, id)); render(); dayFlipPlay(fl);
  mvLog('shown', { day: toDay }); requestAnimationFrame(() => mvLog('painted', { day: toDay }));
}
// 保存に失敗して元へ戻したカードを、落とした日のマスの所から元の場所へ 0.22 秒で戻す
function cardReturn({ ck, id, day }) {
  const el = root.querySelector(`.mday ${cardSel(ck, id)}`) || root.querySelector(`.week ${cardSel(ck, id)}`), cell = root.querySelector(`.week .day[data-date="${day}"]`);
  if (!el || !cell || reduced()) return;
  const a = el.getBoundingClientRect(), b = cell.getBoundingClientRect();
  el.animate([{ transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.5)`, opacity: 0.25 }, { transform: 'none', opacity: 1 }], { duration: BACK_MS, easing: BACK_EASE });
  mvLog('return', { ms: BACK_MS });
}
// 予定の保存: 表示（state.events）を先に変えて描き直し、そのあと IndexedDB と送信待ちへ書く（今までの commit と同じ経路）。失敗したら表示を元へ戻して投げる
async function commitFast(plan, { ops = [] } = {}, show = (fn) => { fn(); render(); }) {
  const gone = new Set([...plan.dels, ...plan.puts.map((e) => e.id)]), before = state.events.filter((e) => gone.has(e.id));
  show(() => { state.events = [...state.events.filter((e) => !gone.has(e.id)), ...plan.puts]; bumpRevision(); });
  try {
    if (window.__duoMoveFail === 'save') throw new Error('test'); // 試験用（保存の失敗を起こす口。品質 M-24・M-32）
    if (ops.length) OBX.items = await db.applyChangesWithOutbox({ ...plan, outbox: (cur) => mergeOps(cur, ops, OBX.inflight) });
    else await db.applyChanges(plan);
  } catch (err) {
    state.events = [...state.events.filter((e) => !gone.has(e.id)), ...before]; bumpRevision(); render();
    throw err;
  }
  requestNotifySync('edit');
  if (ops.some((o) => o.kind !== 'drop')) requestFlush();
  if (plan.puts.some(hasDuoAlarms)) askNotifyPerm();
}
async function moveGrabbed(g, fromDay, toDay, off, st) {
  if (g.task) return moveTaskCard(g.task.itemId, toDay);
  if (g.note) return moveNoteCard(g.note.id, toDay);
  if (g.ext) return moveExt(g, fromDay, toDay, st);
  const { p, occKey, occ } = g.cur;
  const eff = addDays(dayOf(occ.start), dayDiffKeys(toDay, fromDay || dayOf(occ.start)));
  if (eff === dayOf(occ.start) && !off) return; // 34 §16-4: 同じ日・同じ時刻なら何もしない（保存・知らせ・触覚なし。繰り返しの回に overrides を作らない）
  const occ2 = off ? { ...occ, start: isoPlusMin(occ.start, off), end: isoPlusMin(occ.end, off) } : occ;
  const m = window.__duoMoveFail === 'plan' ? null : planMoveDuo(p, occ2, occKey, eff, newId, !!off); // __duoMoveFail＝試験用（計画が作れない場合を起こす口。35 §9 M-32）
  if (!m) { moveFail(); return; } // 計画が作れない: 黙って終わらせない（連携 第20弾 §1.3）
  const scope = occKey ? 'only' : 'all';
  const form = { title: occ.title, categoryId: occ.categoryId, all: !!occ.all, place: occ.place || '', notes: occ.notes || '', ...(occ.alarms !== undefined ? { alarms: occ.alarms } : {}), recurrence: p.recurrence || null, start: m.after.start, end: m.after.end };
  const { ops, plan } = planOps(p, { puts: m.puts, dels: m.dels }, scope, occKey, form);
  const to = dayOf(m.after.start), sameDay = to === dayOf(occ.start); // 同じ日の中で時刻だけ動かした（開いた画面の時間軸）ときは、着地の動きは出さない
  try { await commitFast(plan, { ops }, sameDay ? undefined : (fn) => moveShow(to, 'event', p.id, fn)); } catch { moveFail('移せませんでした。', { ck: 'event', id: p.id, day: to }); return; }
  mvFeel('light');
  const moved = plan.puts.find((e) => e.id === p.id);
  moveDone(to, m.note, { kind: 'duo', id: p.id, occKey, scope, start: occ.start, end: occ.end, stamp: moved.updatedAt }, { title: occ.title, only: !!occKey });
}
// iPhone の予定: 表示（読み込んである一覧の中のその回）を先に先の日へ変え、updateExternalEvent（span:'this'）で書く。断られたら読み直して元へ
function extShow(e, start, end, toDay, show = true) {
  const c = X.cache; if (!c) return null;
  const patch = () => { X.cache = { ...c, events: c.events.map((x) => (x.id === e.id ? { ...x, start, end } : x)) }; };
  if (show) moveShow(toDay, 'event', e.id, patch); else { patch(); render(); }
  return c;
}
const extUnshow = (c) => { if (c && X.cache && X.cache.loadedAt === c.loadedAt) { X.cache = c; render(); } };
async function moveExt(g, fromDay, toDay, st) {
  const e = g.ext;
  if (toDay === (fromDay || dayOf(e.start))) return; // 34 §16-4: 同じ日なら何もしない（getEvent も呼ばない。iPhone へ書かない）
  const n = dayDiffKeys(toDay, fromDay || dayOf(e.start)), sh = (iso) => `${addDays(dayOf(iso), n)}${iso.slice(10)}`;
  const prevC = extShow(e, sh(e.start), sh(e.end), addDays(dayOf(e.start), n)), back = { ck: 'event', id: e.id, day: toDay };
  if (!st || st.status === 'loading') {
    try { const d = await call('getEvent', extTarget(e)); const cal = X.calendars.find((c) => c.id === e.calId); st = { detail: d, cal, ed: extEditable(e, cal, d), before: { ...toDisplay(d, cal), id: e.id } }; } catch { extUnshow(prevC); moveFail('この予定は取得できませんでした。', back); return; }
  }
  if (st.status === 'no' || !st.ed?.editable) { extUnshow(prevC); moveFail(REASON_TEXT[st.ed?.reason] || XD_NOTE, back); return; }
  const eff = addDays(dayOf(st.before.start), dayDiffKeys(toDay, fromDay || dayOf(st.before.start)));
  const mv = window.__duoMoveFail === 'plan' ? null : buildMoveExtArgs(st.before, eff, st.detail);
  if (!mv) { extUnshow(prevC); moveFail('移せませんでした。', back); return; }
  let r;
  try { r = await call('updateExternalEvent', mv.args); } catch (err) {
    const code = errCode(err);
    extUnshow(prevC);
    moveFail(code === 'NOT_FOUND' ? 'この予定は iPhone のカレンダーで削除されています。' : code === 'NOT_EDITABLE' || code === 'READ_ONLY' ? (REASON_TEXT[errReason(err)] || errText(err, '移せませんでした。')) : '移せませんでした。', back);
    loadExt(true); return;
  }
  loadExt(true);
  mvFeel('light');
  moveDone(dayOf(mv.after.start), mv.note, { kind: 'ext', before: st.before, moved: mv, reply: r, detail: st.detail }, { title: e.title, only: !!e.recurring });
}
// タスク: due.date だけ変える（時刻・通知の設定・ノートとのつながりはそのまま。EventKit には書かない）。通知はアプリの予約を入れ直す（先の日の同じ時刻。日付だけは 8:00）
const taskRowPatch = (id, row) => { if (RM.data) RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (x.itemId === id ? row : x)) }; RM.mut++; RM.sig = ''; };
const taskSaveDue = async (id, due) => { if (window.__duoMoveFail === 'save') throw new Error('test'); return taskStore.update(id, { due }); };
async function moveTaskCard(id, toDay) {
  const r = RM.data?.reminders.find((x) => x.itemId === id); if (!r?.due?.date || r.due.date === toDay) return; // 同じ日なら何もしない
  const due = r.due.time ? { date: toDay, time: r.due.time } : { date: toDay }, from = r.due.date;
  moveShow(toDay, 'task', id, () => taskRowPatch(id, { ...r, due }));
  let t;
  try { t = await taskSaveDue(id, due); } catch { taskRowPatch(id, r); render(); loadTasks(); moveFail('移せませんでした。', { ck: 'task', id, day: toDay }); return; }
  taskRowPatch(id, rowOf(t)); scheduleTasks();
  mvFeel('light');
  moveDone(toDay, null, { kind: 'task', id, prev: r.due, to: due, from, stamp: t.updatedAt }, { title: r.title || '題名なし' });
}
// ノート: date だけ変える（id・sourceDate・本文・updatedAt はそのまま。旧メモ由来も同じ）。期限がまだノートの元の日と同じ、つながったタスクだけ一緒に動かす（35 §8・決定 7）
const noteCardsSig = () => JSON.stringify([...NB.cards].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
function noteCardShift(id, toDay) { // メモリの中のカードを先に動かす（保存のあと refreshNoteMarks が正を読み直す）
  const c = noteCardById(id); if (!c) return;
  const from = c.day, l0 = (NB.cards.get(from) || []).filter((x) => x.id !== id);
  if (l0.length) NB.cards.set(from, l0); else NB.cards.delete(from);
  if (toDay) { const { day: _d, ...card } = c; NB.cards.set(toDay, [...(NB.cards.get(toDay) || []), card].sort(noteCardCmp)); }
  for (const k of [from, toDay]) { // その日の件数と「1件目」（いちばん新しいノート）を、動かしたあとの並びから作り直す（refreshNoteMarks と同じ決まり）
    if (!k) continue;
    const l = NB.cards.get(k) || [];
    if (!l.length) { NB.marks.delete(k); NB.first.delete(k); NB.firstId.delete(k); continue; }
    const best = l.reduce((a, b) => (b.u > a.u ? b : a));
    NB.marks.set(k, l.length); NB.first.set(k, NB.bodies.get(best.id) ?? ''); NB.firstId.set(k, best.id);
  }
  NB.cardSig = noteCardsSig();
}
const noteSaveDate = async (id, date) => { if (window.__duoMoveFail === 'save') throw new Error('test'); const r = await setNoteDate(id, date); if (!r.ok) throw new Error('note'); return r; };
async function moveNoteCard(id, toDay) {
  const c = noteCardById(id); if (!c || c.day === toDay) return; // 同じ日なら何もしない
  const from = c.day, rows0 = RM.data?.reminders || [], follow = rows0.filter((x) => x.source?.noteId === id && x.due?.date === from);
  moveShow(toDay, 'note', id, () => {
    noteCardShift(id, toDay);
    if (follow.length && RM.data) { const ids = new Set(follow.map((x) => x.itemId)); RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (ids.has(x.itemId) ? { ...x, due: x.due.time ? { date: toDay, time: x.due.time } : { date: toDay } } : x)) }; RM.mut++; RM.sig = ''; }
  });
  let res;
  try { res = await noteSaveDate(id, toDay); } catch { await refreshNoteMarks(); RM.mut++; RM.sig = ''; await loadTasks(); render(); moveFail('移せませんでした。', { ck: 'note', id, day: toDay }); return; }
  sheetDateSync(id, toDay);
  refreshNoteMarks(); if (NB.rows) invalidateNoteList();
  mvFeel('light');
  moveDone(toDay, null, { kind: 'note', id, from, to: toDay, tasks: res.moved }, { title: c.title || EMPTY_TITLE, tasks: res.moved.length });
}
// 読み上げの操作・開いた画面の日付の欄から（35 §4・§6.8）。長押しで落としたときと同じ扱い（同じ札・同じ読み上げ・元に戻す）
async function cardMoveById(ck, id, fromDay, toDay) {
  const g = grabInfoOf(ck, id); if (!g || !toDay) return;
  if (g.ext) { const cal = X.calendars.find((c) => c.id === g.ext.calId), pre = preReason(cal); if (pre) { grabRefuse(REASON_TEXT[pre]); return; } }
  mvLog('drop', { day: toDay });
  await moveGrabbed(g, fromDay || g.day || null, toDay, 0, null);
}
// 読み上げの操作「日付を移す」（35 §6.8）: 小さな月（予定・タスクの日付と同じ部品）のシート。見出し「〈題名〉の日付」。日を選ぶと、落としたときと同じに移す
let cardDateEl = null;
function closeCardDate(focus = null) { if (!cardDateEl) return; const el = cardDateEl; cardDateEl = null; el.remove(); document.removeEventListener('keydown', cardDateKey, true); focus?.focus?.({ preventScroll: true }); }
function cardDateKey(ev) { if (ev.key === 'Escape' && cardDateEl) { ev.preventDefault(); ev.stopPropagation(); closeCardDate(cardDateEl._from); } }
function openCardDate(ck, id, day, from) {
  closeCardDate();
  const g = grabInfoOf(ck, id); if (!g) return;
  const el = document.createElement('div'); el.className = 'cmv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `${g.title}の日付`); el._from = from;
  el.innerHTML = `<div class="cmvin"><h3 tabindex="-1">${esc(g.title)}の日付</h3><div class="cmvrow"><button type="button" class="dcap" aria-haspopup="true" aria-expanded="false"></button></div><button type="button" class="cmvx">閉じる</button></div>`;
  document.body.append(el); cardDateEl = el;
  const cap = el.querySelector('.dcap');
  const ui = createDateField(cap, { after: el.querySelector('.cmvrow'), scope: el, label: g.rec ? 'この回の日付' : '日付', holiday: holidayMemo, get: () => day, set: (k) => { closeCardDate(); cardMoveById(ck, id, day, k); } });
  ui.render(); cap.focus({ preventScroll: true }); cap.click(); // 小さな月を開いた形で出す（焦点は日付のカプセル。見出しはシートの名前として読まれる）
  el.querySelector('.cmvx').addEventListener('click', () => closeCardDate(from));
  el.addEventListener('pointerdown', (ev) => { if (ev.target === el) closeCardDate(from); });
  document.addEventListener('keydown', cardDateKey, true);
}
async function undoMove() {
  const rec = MV.rec; if (!rec) return;
  mvDropUndo(); document.querySelector('#native-toast')?.remove();
  mvLog('undo');
  if (rec.kind === 'task') { // 表示を先に戻してから保存
    const r = RM.data?.reminders.find((x) => x.itemId === rec.id);
    if (!r || r.modifiedAt !== rec.stamp) { notice('変更されていたため、そのままにしました。'); return; }
    moveShow(rec.from, 'task', rec.id, () => taskRowPatch(rec.id, { ...r, due: rec.prev }));
    try { const t = await taskSaveDue(rec.id, rec.prev); taskRowPatch(rec.id, rowOf(t)); scheduleTasks(); } catch { taskRowPatch(rec.id, r); render(); loadTasks(); mvFeel('error'); notice('元に戻せませんでした。もう一度お試しください。'); return; }
    notice('元に戻しました。'); say('元に戻しました。'); return;
  }
  if (rec.kind === 'note') { // ノートと、一緒に動いたタスクをまとめて元へ（35 §8）。単独で動かしたタスクは対象外
    const c = noteCardById(rec.id), ids = new Map(rec.tasks.map((m) => [m.id, m.prev]));
    if (c && c.day !== rec.to) { notice('変更されていたため、そのままにしました。'); return; }
    moveShow(rec.from, 'note', rec.id, () => {
      if (c) noteCardShift(rec.id, rec.from);
      if (ids.size && RM.data) { RM.data = { ...RM.data, reminders: RM.data.reminders.map((x) => (ids.has(x.itemId) && x.due?.date === rec.to ? { ...x, due: ids.get(x.itemId) } : x)) }; RM.mut++; RM.sig = ''; }
    });
    try {
      if (window.__duoMoveFail === 'save') throw new Error('test');
      const ok = await noteStore.setMeta(rec.id, { date: rec.from }); if (!ok) throw new Error('note');
      const now = Date.now();
      for (const m of rec.tasks) { const cur = await db.getTask(m.id); if (cur && !isTaskTombstone(cur) && cur.due?.date === rec.to) await db.putTask({ ...cur, due: m.prev, updatedAt: now }); }
    } catch { await refreshNoteMarks(); RM.mut++; RM.sig = ''; await loadTasks(); render(); mvFeel('error'); notice('元に戻せませんでした。もう一度お試しください。'); return; }
    sheetDateSync(rec.id, rec.from);
    refreshNoteMarks(); if (NB.rows) invalidateNoteList(); RM.mut++; RM.sig = ''; loadTasks(); scheduleTasks();
    notice('元に戻しました。'); say('元に戻しました。'); return;
  }
  if (rec.kind === 'ext') {
    const cur0 = visExt().find((x) => x.start === rec.moved.after.start && (x.id === rec.before.id || x.title === rec.before.title));
    const prevC = cur0 ? extShow(cur0, rec.before.start, rec.before.end, dayOf(rec.before.start)) : null;
    try {
      const cur = await call('getEvent', extTarget({ ...rec.before, start: rec.moved.after.start, occurrenceDate: rec.before.occurrenceDate || rec.before.start }));
      if (!extUndoAllowed(rec.reply?.modifiedAt, cur?.modifiedAt)) { extUnshow(prevC); notice(UNDO_CONFLICT_TEXT); loadExt(true); return; }
      const args = buildUndoExtArgs(rec.before, rec.moved, rec.reply, rec.detail);
      if (args) await call('updateExternalEvent', args);
    } catch { extUnshow(prevC); feel('error'); notice(UNDO_CONFLICT_TEXT); loadExt(true); return; }
    loadExt(true); notice('元に戻しました。'); return;
  }
  const p2 = state.events.find((e) => e.id === rec.id);
  if (!p2 || p2.updatedAt !== rec.stamp) { notice('変更されていたため、そのままにしました。'); return; }
  const occ2 = rec.occKey ? occurrenceAt(p2, rec.occKey) : p2;
  const u = planMoveDuoUndo(p2, occ2, { occKey: rec.occKey, start: rec.start, end: rec.end }, newId);
  const form = { title: occ2.title, categoryId: occ2.categoryId, all: !!occ2.all, place: occ2.place || '', notes: occ2.notes || '', ...(occ2.alarms !== undefined ? { alarms: occ2.alarms } : {}), recurrence: p2.recurrence || null, start: rec.start, end: rec.end };
  const { ops, plan } = planOps(p2, { puts: u.puts, dels: u.dels }, rec.scope, rec.occKey, form);
  try { await commitFast(plan, { ops }, (fn) => moveShow(dayOf(rec.start), 'event', rec.id, fn)); } catch { feel('error'); notice('元に戻せませんでした。もう一度お試しください。'); MV.rec = rec; MV.timer = setTimeout(() => { if (MV.rec === rec) MV.rec = null; }, UNDO_MS); return; }
  notice('元に戻しました。');
}
document.addEventListener('visibilitychange', () => { if (document.hidden) mvDropUndo(); });

const DIRECT_ZONE_EXCLUDE = '.ev, .strip, .tlev, .dbox, button, input, select, textarea, .ned-body, label, dialog, .tlheads, .tlmenu, .mmenu, .tabs';
// 月のマスの中のチップ・帯は pointer-events:none。押した位置（x,y）にあるチップを、同じ週の中から探す（S5）。
const stgDayAt = (x, y) => { // 閉じた7段のマス（入れ替えで消える方は除く）。帯は左端のマスの子なので、指の下のマスは位置で決める
  for (const d of root.querySelectorAll('.mpull.browse .mgrid:not([data-leaving]) .day[data-date]')) { const r = d.getBoundingClientRect(); if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return d; }
  return null;
};
function chipAtPoint(t, ev) {
  const wk = t.closest?.('.week'); if (!wk || !ev || ev.clientX == null) return null;
  const vis = Number(wk.closest('.mgrid')?.dataset.vis ?? 99); // 閉じた7段: +N に入って見えていない段のチップは、押す的にしない（35 §6.1）
  for (const c of wk.querySelectorAll('.strip[data-event], .bar[data-event], .bar[data-cont], .strip[data-task], .strip[data-note]')) {
    if (c.dataset.lane != null && Number(c.dataset.lane) >= vis) continue;
    const r = c.getBoundingClientRect();
    if (ev.clientX >= r.left && ev.clientX < r.right && ev.clientY >= r.top && ev.clientY < r.bottom) return c;
  }
  return null;
}
const PRS = { cell: null }; // 閉じた7段で、いま押した地（#E2DDD2）を出しているマス。つかんだ瞬間に地を戻す（34 §16-2 D1）
// 押した位置のチップ・帯に、押した反応（黒 12% の被せ）を 0.1秒（離したあと）出す。チップは pointer-events:none で :active が効かないため、#app の外の被せで見せる（描き直しにも消えず、DOM の比較にも入らない）
root.addEventListener('pointerdown', (ev) => {
  const d = ev.target instanceof Element ? ev.target.closest('.week .day[data-date]') : null;
  if (d?.closest('.mpull.browse')) { // 閉じた7段: チップの上でも、指の下のマスの地に #E2DDD2（R-75）。チップの被せは出さない
    const cell = stgDayAt(ev.clientX, ev.clientY) || d;
    if (cell !== d) { d.style.setProperty('--rest', getComputedStyle(d).backgroundColor); d.classList.add('nopress'); }
    { // 押していないときの地（D1: つかんだらこの色へ戻す）。押した色・マウスが乗った色の途中の値を拾わないよう、同じ class の写し（見えない・押されていない）で読む
      const pr = cell.cloneNode(false); pr.classList.remove('prs', 'grabd', 'nopress'); pr.removeAttribute('style'); pr.style.display = 'none'; pr.setAttribute('aria-hidden', 'true'); pr.removeAttribute('data-date');
      cell.after(pr); cell.style.setProperty('--rest', getComputedStyle(pr).backgroundColor); pr.remove();
    }
    cell.classList.add('prs'); PRS.cell = cell;
    const off2 = () => { document.removeEventListener('pointerup', off2, true); document.removeEventListener('pointercancel', off2, true); setTimeout(() => { cell.classList.remove('prs', 'grabd'); cell.style.removeProperty('--rest'); d.classList.remove('nopress'); d.style.removeProperty('--rest'); if (PRS.cell === cell) PRS.cell = null; }, 100); };
    document.addEventListener('pointerup', off2, true); document.addEventListener('pointercancel', off2, true);
    return;
  }
  const c = d ? chipAtPoint(d, ev) : null; if (!c) return;
  const r = c.getBoundingClientRect(), v = document.createElement('div');
  v.className = 'chip-press'; v.setAttribute('aria-hidden', 'true');
  v.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(c).borderRadius}`;
  document.body.append(v);
  // V-23: チップの上で押したときはマスの地を変えない。マスの :active の色を、押す前の色に据える（#app の DOM は触らず、html に置く）
  de.style.setProperty('--day-rest', getComputedStyle(d).backgroundColor); de.dataset.chipdown = '';
  const off = () => { document.removeEventListener('pointerup', off, true); document.removeEventListener('pointercancel', off, true); setTimeout(() => { v.remove(); delete de.dataset.chipdown; de.style.removeProperty('--day-rest'); }, 100); };
  document.addEventListener('pointerup', off, true); document.addEventListener('pointercancel', off, true);
});
function directOrigin(t, ev) {
  if (anyPanel() || !(t instanceof Element)) return null;
  if (t.closest('.pvwk')) return null; // 開いた縦ホームの今週の帯: 長押しで期間選択・メニューは出さない（たたくと日タブ）
  { const co = cardOrigin(t); if (co) return co; } // 閉じた画面の日の欄のカード（予定・タスク・ノート）: 長押しで持ち上げて月のマスへ（35 §6）
  if (!PS.on && t.closest('.mpull.browse .week')) { // 閉じた7段: チップの長押しは別の日へ落とす（R-49 の処理をそのまま。34 §12 Q-13）
    const c = chipAtPoint(t, ev), dd = ev?.clientX != null ? stgDayAt(ev.clientX, ev.clientY) : t.closest('.day[data-date]');
    const sc = closedLand() ? null : t.closest('.mpull.browse'); // 閉じた縦: 札を上の端へ運ぶと画面が送られて月が出る（35 §6.4）
    if (c) return { kind: 'grab', ck: c.dataset.task ? 'task' : c.dataset.note ? 'note' : 'event', id: c.dataset.task || c.dataset.note || c.dataset.event || c.dataset.cont, el: c, from: dd?.dataset.date || c.dataset.sday || null, tl: null, sc };
    return null; // チップのない所の長押しは何もしない（34 §9.4・設計レビュー M4）。期間を選ぶのは読み上げ用の隠れたボタンだけ
  }
  const chip = !PS.on && PASTE_ENTRY ? chipAtPoint(t, ev) : null; // 月のチップ（長押しでコピー・編集・削除のメニュー）。チップは押す的ではないので、押した位置から探す
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
const EDGE_BAND = 40;
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
    const mdy = tl.classList.contains('mday'), one = tl.matches('.mpull.browse[data-stage]') ? tl : mdy ? tl.closest('.mpull.browse[data-stage]') : null; // 第19.3版 閉じた縦: 日の欄は中でスクロールしない。動かすのは画面の1本
    if (one) { // その3（35 §6.4）: 札を上の端（曜日の行の下 y64 から 40 の帯）へ運ぶと、画面を上へ送って月を出す。速さは帯に入った深さに比例して毎秒 120〜480、最初の 0.2 秒は 0 から加速。スクロール位置 0 で止まる。下の端 40 は毎秒 120 で下へ
      const fixB = one.querySelector('.mpfix').getBoundingClientRect().bottom, botB = one.getBoundingClientRect().bottom;
      let v1 = 0;
      if (EG.y < fixB + EDGE_BAND && one.scrollTop > 0) v1 = -(120 + 360 * Math.min(1, Math.max(0, (fixB + EDGE_BAND - EG.y) / EDGE_BAND)));
      else if (EG.y > botB - EDGE_BAND && one.scrollTop < one.scrollHeight - one.clientHeight - 0.5) v1 = 120;
      if (!v1) { EG.carry = 0; GR.acc = 0; return; }
      GR.acc = Math.min(1, GR.acc + dt / 0.2);
      const d1 = v1 * GR.acc * dt + EG.carry, w1 = Math.trunc(d1); EG.carry = d1 - w1; if (!w1) return;
      const b1 = one.scrollTop; one.scrollTop = b1 + w1; if (one.scrollTop !== b1) grabRecalc();
      return;
    }
    const top = rc.top, bot = mdy ? Math.min(rc.bottom, cssPx('--tabs-y', rc.bottom)) : rc.bottom;
    if (mdy && EG.y < top) { EG.carry = 0; return; }
    const v = edgeVelocity(EG.y, top, bot); if (!v) { EG.carry = 0; return; }
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
  classify: (t, ev) => directOrigin(t, ev),
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
      EG.x = x; EG.y = y;
      const day = moveDayAt(x, y), g = grabInfo(), off = GR.off, st = GR.ext;
      const from = g ? (o.from || g.day || dayOf(g.ext ? g.ext.start : g.cur.occ.start)) : null;
      if (!g || !day || (!off && day === from)) { grabBack(); return; } // やめた（月の日以外・溝の上・元の日で離した。34 §16-4・35 §6.5）: 0.22 秒で元へ戻すだけ（知らせ・触覚・保存なし）
      mvLog('drop', { day });
      { // 落とした（35 §6.5）: 札を行き先のマスの中心へ 0.15 秒で吸い込む（0.5 倍・透明へ）。視差効果を減らすときはフェードだけ
        const chip = GR.chip, cell = day ? root.querySelector(`.week .day[data-date="${day}"]`) : null; GR.chip = null;
        if (chip && cell && !reduced()) { const r = cell.getBoundingClientRect(), c = chip.getBoundingClientRect(); chip.animate([{ transform: chip.style.transform, opacity: 1 }, { transform: `translate(${r.left + r.width / 2 - c.width / 2}px, ${r.top + r.height / 2 - c.height / 2}px) scale(0.5)`, opacity: 0 }], { duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }).finished.then(() => chip.remove(), () => chip.remove()); }
        else if (chip) chip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'linear', fill: 'forwards' }).finished.then(() => chip.remove(), () => chip.remove());
      }
      grabClear();
      moveGrabbed(g, o.from || from, day, off, st);
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
  onCancel: ({ reason } = {}) => { stopEdge(); if (GR.on) { if (['rotate', 'layout', 'pagehide', 'refuse', 'gone'].includes(reason)) grabClear(); else grabBack(); } if (DF.mode === 'drag') clearDraftBox(); if (MR.mode === 'drag') clearRange(); }, // つかんだまま閉じる・開く・回す: やめたと同じ（何も保存しない。新しい画面に札も破線も残さない。35 §6.5）
});
// 回転・ページ破棄では入力中の枠を取り消す（指の下の座標系が変わるため）。
window.addEventListener('orientationchange', () => directCtl?.cancel('rotate'));
window.addEventListener('resize', () => { if (GR.on && GR.geo !== grabGeo()) directCtl?.cancel('layout'); }); // つかんだまま閉じる・開く・回す（画面の寸法が変わった）: やめたと同じ（35 §6.5）
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
  const plan = planPaste(src, days, { srcColorId: isX(src) ? xColorIdOf(src) : undefined, cals: X.calendars, enabled: extActive(), destCalendarId: destCalId(), destCatId: (() => { const d = destNow(); return d.type === 'duo' ? d.id : ''; })(), catVisible: (id) => state.categories.some((c) => c.id === id && !c.hidden), defaultCatId, newId, pastedAt: Date.now(), srcLink });
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
  if (r.p.colorId != null) src.colorId = r.p.colorId; // コピーで作った予定も色を引き継ぐ（系列の本体の色）
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
  m.innerHTML = `<button type="button" role="menuitem" data-cm="copy">コピー</button><button type="button" role="menuitem" data-cm="color">色</button><button type="button" role="menuitem" data-cm="edit"${editable ? '' : ' disabled'}>編集</button><button type="button" role="menuitem" data-cm="del" class="danger"${editable ? '' : ' disabled'}>削除</button>`;
  const r = chipEl.getBoundingClientRect(), W = 160, H = 176;
  m.style.left = `${Math.round(Math.min(Math.max(4, r.left), window.innerWidth - W - 4))}px`;
  m.style.top = `${Math.round(r.bottom + 4 + H > window.innerHeight - 4 ? Math.max(4, r.top - H - 4) : r.bottom + 4)}px`;
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cm]');
    if (!b || b.disabled) return;
    closeChipMenu();
    if (b.dataset.cm === 'copy') copyFrom(id);
    else if (b.dataset.cm === 'color') openColorStrip(id, chipEl);
    else { openEditor(id, chipEl); if (b.dataset.cm === 'del' && !ext) $('#delete').click(); }
  });
  document.body.append(m); chipMenu = m;
  document.addEventListener('pointerdown', chipMenuOutside, true);
  m.querySelector('[data-cm="copy"]').focus({ preventScroll: true });
}
// ---- 予定ごとの色の近道（design/37 §3.3）: メニューの「色」→ 色の帯（幅 336・高さ 78・角丸 14）。左端「分類」＝カテゴリの色に戻す、続いてフリックの 7 色。
// たたくとすぐ変わって帯は閉じ、「色を変えました　元に戻す」（6 秒）。繰り返しは全部の回に付く。iPhone の予定は Duo の中の表に付く
const COLOR_UNDO_MS = 6000;
const evById = (id) => (isXId(id) ? visExt().find((v) => v.id === id) || (xdCur?.id === id ? xdCur : null) : resolve(id)?.p) || null;
// 予定（描画 id）の色を変える。戻り値は前の colorId（null＝カテゴリの色）。変えられなければ undefined
async function setEventColor(id, colorId) {
  const want = validColorId(colorId) ? colorId : null;
  if (isXId(id)) {
    const x = evById(id), key = x ? xcKeyOf(x) : '';
    if (!key) return undefined;
    const prev = xColorIdOf(x);
    await xcPut(xcSet(XC.map, key, want, { calId: x.calId, title: x.title, lastStart: x.start }));
    render();
    return prev;
  }
  const cur = resolve(id);
  if (!cur) return undefined;
  const prev = cur.p.colorId ?? null, item = { ...cur.p, updatedAt: Date.now() };
  if (want) item.colorId = want; else delete item.colorId;
  await commit({ puts: [item], dels: [] });
  render();
  return prev;
}
async function pickEventColor(id, colorId, after) {
  let prev;
  try { prev = await setEventColor(id, colorId); } catch { prev = undefined; }
  if (prev === undefined) { notice('色を変えられませんでした。'); return; }
  after?.();
  if ((prev ?? null) === (validColorId(colorId) ? colorId : null)) return;
  say('色を変えました。');
  notice('色を変えました', { label: '元に戻す', fn: async () => { document.querySelector('#native-toast')?.remove(); try { await setEventColor(id, prev); after?.(); say('色を元に戻しました。'); } catch { notice('元に戻せませんでした。'); } } }, COLOR_UNDO_MS);
}
function openColorStrip(id, anchor, after) {
  closeChipMenu();
  const e = evById(id);
  if (!e) return;
  const cur = isFlickId(colorIdOf(e)) ? colorIdOf(e) : '', base = baseColorOf(e), iph = isX(e) || !!calOfLink(e);
  const m = document.createElement('div');
  m.className = 'cmenu colorstrip'; m.setAttribute('role', 'group'); m.setAttribute('aria-label', '色'); m.dataset.colorstrip = id;
  const sw = (cid, name, txt) => `<button type="button" class="cso" data-cs="${cid}" aria-pressed="${cur === cid}" aria-label="${esc(name)}${cur === cid ? '、選択中' : ''}"><i class="csw lg" style="${swVars(cid || null, base)}" aria-hidden="true">${txt}</i></button>`;
  m.innerHTML = `<p class="csn" aria-live="polite">${esc(cur ? flickName(cur) : `${iph ? 'カレンダー' : 'カテゴリ'}の色`)}</p><div class="csr">${sw('', `${iph ? 'カレンダー' : 'カテゴリ'}の色に戻す`, '<b>分類</b>')}${FLICK.map((f) => sw(f.id, f.name, '')).join('')}</div>`;
  const r = anchor.getBoundingClientRect(), W = Math.min(336, window.innerWidth - 16), H = 78;
  m.style.width = `${W}px`;
  m.style.left = `${Math.round(Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8))}px`;
  m.style.top = `${Math.round(r.bottom + 4 + H > window.innerHeight - 8 ? Math.max(8, r.top - H - 4) : r.bottom + 4)}px`;
  m.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cs]');
    if (!b) return;
    closeChipMenu();
    pickEventColor(id, b.dataset.cs || null, after);
  });
  m.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); closeChipMenu(); anchor.focus?.({ preventScroll: true }); return; }
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const o = [...m.querySelectorAll('.cso')], i = o.indexOf(document.activeElement); if (i < 0) return;
    ev.preventDefault(); o[(i + (ev.key === 'ArrowRight' ? 1 : o.length - 1)) % o.length].focus({ preventScroll: true });
  });
  // 開いているシート（dialog）の中から出すときは、その dialog の中に置く（外に置くと、シートが出ている間は押せない）。置いたあと、実際の位置のずれ（dialog が位置の基準になる場合）を直す
  (anchor.closest('dialog[open]') || document.body).append(m); chipMenu = m;
  { const want = { x: parseFloat(m.style.left), y: parseFloat(m.style.top) }, got = m.getBoundingClientRect(); if (Math.abs(got.left - want.x) > 0.5 || Math.abs(got.top - want.y) > 0.5) { m.style.left = `${Math.round(want.x - (got.left - want.x))}px`; m.style.top = `${Math.round(want.y - (got.top - want.y))}px`; } }
  document.addEventListener('pointerdown', chipMenuOutside, true);
  (m.querySelector('.cso[aria-pressed="true"]') || m.querySelector('.cso')).focus({ preventScroll: true });
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
  try { setCategories(await db.listCategories()); let bf = null; try { bf = await db.backfillNotifyOnce(new Date()); } catch { bf = null; /* ロールバック済み。次の起動で再実行 */ } state.events = await db.listEvents(); try { OBX.items = await db.getOutbox(); } catch { OBX.items = []; } try { XC.map = xcLoad(await db.getEventColors()); } catch { XC.map = new Map(); } xcMirror(state.events); bumpRevision(); N.ready = true; requestNotifySync(bf?.ran ? 'backfill' : 'launch'); } catch { say('保存領域を開けませんでした。'); }
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

// ---------- 第19.2版 S11c（design/34 §9.2・§9.3）: 「…」のキー操作と、ノートを書いている間の右の列 ----------
root.addEventListener('keydown', (ev) => {
  const it = ev.target.closest?.('.moremenu [role=menuitem]'); if (!it) return;
  const all = [...root.querySelectorAll('.moremenu [role=menuitem]')], i = all.indexOf(it);
  const to = ev.key === 'ArrowDown' ? all[(i + 1) % all.length] : ev.key === 'ArrowUp' ? all[(i - 1 + all.length) % all.length] : ev.key === 'Home' ? all[0] : ev.key === 'End' ? all[all.length - 1] : null;
  if (to) { ev.preventDefault(); to.focus({ preventScroll: true }); }
  else if (ev.key === 'Tab') closeMore(false);
});
{
  // 書いている間＝ノートの題名・本文にフォーカスがある間（キーボードが出ている間）。閉じたら 0.15 秒で戻す（CSS の transition）。
  const inNote = (t) => !!t?.closest?.('.ned') && !!t.closest('.ned-body, .ned-title, [contenteditable="true"], input, textarea');
  const apply = (on) => {
    on = on && closedSize() && POS.band; // 帯がないときは入れ替えない（シートの戻す群を使う。34 §15-②・③）
    if (on === noteEditing) return;
    noteEditing = on;
    root.querySelector('.shell.closed')?.classList.toggle('noteedit', on);
    for (const b of root.querySelectorAll('.cb.cundo, .cb.credo')) { if (on) { b.removeAttribute('aria-hidden'); b.removeAttribute('tabindex'); } else { b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; } }
    for (const b of root.querySelectorAll('.cb.ctask, .cb.cmore, .cb.cadd')) { if (on) { b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; } else { b.removeAttribute('aria-hidden'); b.removeAttribute('tabindex'); } }
    if (on) { closeMore(false); paintNoteHist(); }
  };
  document.addEventListener('focusin', (ev) => { if (inNote(ev.target)) apply(true); else if (noteEditing && !ev.target.closest?.('.cundo, .credo, .ned')) apply(false); });
  document.addEventListener('focusout', () => { setTimeout(() => { if (noteEditing && !inNote(document.activeElement)) apply(false); }, 0); });
  root.addEventListener('pointerdown', (ev) => { if (ev.target.closest?.('.cundo, .credo')) ev.preventDefault(); }); // 押してもキーボードと選択を失わない
}
