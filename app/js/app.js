import * as db from './db.js';
import { SAMPLE } from './sample.js';
import { initSwipe } from './swipe.js';
import { expand, occurrenceAt, parseOccId, planDelete, planEdit, editInfo } from './recur.js';
import { LIMIT, groupByDay, highlight, excerpt, searchEvents } from './search.js';
import { backupName, buildBackup, countStats, localIso, planAppend, validateBackup, MAX_BYTES } from './backup.js';
import {
  CATS, DOW, addDays, addMonths, assignLanes, assignSharedLanes, dayLabel, dayOf, dkey, eventsOnDay, isKey, isMulti,
  monthWeeks, newId, nowStamp, parseInput, parseKey, ruleSummary, timeLabel, toInput, todayKey, validateDraft, weekStart,
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
    home: s.home !== false,
  };
}
const state = { ...loadUi(), events: [], loaded: false };
if (params.has('desk')) state.desk = params.get('desk') === '1';
function saveUi() {
  const { selected, view, style, desk, home } = state;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ selected, view, style, desk, home })); } catch { /* 保存不可でも動作は続ける */ }
}
function set(patch) { Object.assign(state, patch); saveUi(); render(); }

// ---------- レイアウト判定（幅・高さ・卓上トグル） ----------
function layoutKind() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 600 || h < 600) return state.home ? 'home' : 'browse';
  if (state.desk) return 'desk';
  if (w >= 800 && h < 700) return 'spread';
  return 'open';
}
// 開いた縦（幅600–799・高さ800以上の通常の開いた状態）。月は全幅＋下部アジェンダ、週は日別の縦リスト。
const isPortrait = () => layoutKind() === 'open' && window.innerWidth < 800 && window.innerHeight >= 800;

// ---------- テンプレート ----------
const TABS = [['day', '日'], ['week', '週'], ['month', '月']];
const segment = (active) => `<div class="segment" role="group" aria-label="表示期間">${TABS.map(([v, l]) => `<button type="button" data-view="${v}" aria-pressed="${v === active}">${l}</button>`).join('')}</div>`;
const todayBtn = '<button type="button" class="today" data-act="today">今日に戻る</button>';
const deskBtn = () => `<button type="button" class="deskbtn" data-act="desk" aria-pressed="${state.desk}">卓上</button>`;
const hdr = '<button type="button" class="iconbtn" data-act="search" aria-label="予定を検索"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button type="button" class="iconbtn" data-act="menu" aria-label="その他" aria-haspopup="dialog">…</button>';
const brand = `<div class="brand"><span class="logo">Duo.</span><span class="small">私の手帳</span></div>${hdr}`;
const occIn = (a, b) => expand(state.events, a, b);
const rep = (e) => (e.recurring ? '<span class="rep" aria-hidden="true">↻</span>' : '');
const repLabel = (e, t) => (e.recurring ? ` aria-label="${esc(`${t} 繰り返し`)}"` : '');
const addBtn = '<footer class="foot"><button type="button" class="add" data-act="add">＋ 予定を追加</button></footer>';
const legend = `<div class="legend" aria-label="カテゴリ凡例">${Object.entries(CATS).map(([k, l]) => `<span class="${k}">${l}</span>`).join('')}</div>`;

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
const arrows = () => `<div class="arrows"><button type="button" data-act="prev" aria-label="前の${unit()}">‹</button><button type="button" data-act="next" aria-label="次の${unit()}">›</button></div>`;
const variant = () => `<div class="variant" role="group" aria-label="月の表現">${[['simple', '手帳'], ['named', '予定名']].map(([v, l]) => `<button type="button" data-style="${v}" aria-pressed="${state.style === v}">${l}</button>`).join('')}</div>`;
const chead = (withTitle = true, kind = '') => `<div class="chead">${withTitle ? `<h2 id="ctitle">${periodTitle()}</h2>${arrows()}` : ''}${state.view === 'month' && kind !== 'portrait' ? variant() : ''}</div>`;

function card(e) {
  const sub = [e.place ? esc(e.place) : '', isMulti(e) ? `${e.start.slice(5, 10).replace('-', '/')} 〜 ${e.end.slice(5, 10).replace('-', '/')}` : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="event ${e.cat}" data-event="${esc(e.id)}"${repLabel(e, `${timeLabel(e)} ${e.title}`)}><span class="clock">${timeLabel(e)}</span><span class="tag">${CATS[e.cat]}</span><strong>${rep(e)}${esc(e.title)}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
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

// 月グリッド
const ROW_H = 88, BAR_H = 16, BAR_GAP = 2, CHIP_H = 13;
function monthGrid(kind) {
  if (kind === 'portrait') return monthGridPortrait();
  const sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth(), named = state.style === 'named';
  let html = `<div class="weekdays">${DOW.map((x, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${x}</span>`).join('')}</div>`;
  for (const days of monthWeeks(sel)) {
    const wev = occIn(days[0], days[6]);
    const lane = named ? assignLanes(wev, days) : { bars: [], hidden: Array(7).fill(0), used: 0 };
    const reserve = lane.used ? lane.used * (BAR_H + BAR_GAP) + 2 : 0;
    html += `<div class="week ${named ? 'named' : 'simple'}" style="--reserve:${reserve}px">`;
    days.forEach((k, col) => {
      const es = eventsOnDay(wev, k);
      const d = parseKey(k);
      let body = '';
      if (named) {
        const singles = es.filter((e) => !isMulti(e));
        const cap = Math.max(1, Math.floor((ROW_H - 2 - 22 - reserve) / CHIP_H));
        const shown = singles.length <= cap ? singles : singles.slice(0, Math.max(0, cap - 1));
        body = `<span class="chips">${shown.map((e) => `<span class="chip ${e.cat}">${rep(e)}${esc(e.title)}</span>`).join('')}${singles.length > shown.length ? `<span class="more">ほか${singles.length - shown.length}件</span>` : ''}</span>`;
      } else {
        body = `<span class="dots">${es.slice(0, 4).map((e) => `<i class="dot ${e.cat}"></i>`).join('')}</span>`;
      }
      const plus = lane.hidden[col] ? `<span class="plus" aria-hidden="true">+${lane.hidden[col]}</span>` : '';
      html += `<button type="button" class="day${d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}" data-date="${k}" aria-label="${dayLabel(k)}、予定${es.length}件" aria-pressed="${k === sel}"><span class="dhead"><span class="num">${d.getDate()}</span>${plus}</span>${body}</button>`;
    });
    for (const b of lane.bars) {
      html += `<button type="button" class="bar ${b.e.cat}" data-event="${esc(b.e.id)}" style="left:calc(${b.sc} * 100% / 7 + 2px);width:calc(${b.ec - b.sc + 1} * 100% / 7 - 4px);top:${24 + b.lane * (BAR_H + BAR_GAP)}px" aria-label="${esc(b.e.title)} ${dayOf(b.e.start)}から${dayOf(b.e.end)}${b.e.recurring ? ' 繰り返し' : ''}">${b.fromPrev ? '← ' : ''}${rep(b.e)}${esc(b.e.title)}${b.toNext ? ' →' : ''}</button>`;
    }
    html += '</div>';
  }
  return html;
}

// 開いた縦の月: 常に予定名表示。週行64px = 日付20 + 2レーン×18 + 残件8。帯と短冊は共通の2レーン。
const LANE_TOP = 20, LANE_H = 18;
function monthGridPortrait() {
  const sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth();
  let html = `<div class="weekdays">${DOW.map((x, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${x}</span>`).join('')}</div>`;
  for (const days of monthWeeks(sel)) {
    const wev = occIn(days[0], days[6]);
    const { items, hidden } = assignSharedLanes(wev, days);
    html += '<div class="week named pm">';
    days.forEach((k, col) => {
      const n = eventsOnDay(wev, k).length, d = parseKey(k);
      const plus = hidden[col] ? `<span class="plus" aria-hidden="true">+${hidden[col]}</span>` : '';
      html += `<button type="button" class="day${d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}" data-date="${k}" aria-label="${dayLabel(k)}、予定${n}件" aria-pressed="${k === sel}"><span class="dhead"><span class="num">${d.getDate()}</span></span>${plus}</button>`;
    });
    for (const b of items) {
      const pos = `left:calc(${b.sc} * 100% / 7 + 2px);width:calc(${b.ec - b.sc + 1} * 100% / 7 - 4px);top:${LANE_TOP + b.lane * LANE_H}px`;
      if (b.multi) {
        html += `<button type="button" class="bar ${b.e.cat}" data-event="${esc(b.e.id)}" style="${pos}" aria-label="${esc(b.e.title)} ${dayOf(b.e.start)}から${dayOf(b.e.end)}${b.e.recurring ? ' 繰り返し' : ''}">${b.fromPrev ? '← ' : ''}${rep(b.e)}${esc(b.e.title)}${b.toNext ? ' →' : ''}</button>`;
      } else {
        html += `<button type="button" class="strip ${b.e.cat}" data-event="${esc(b.e.id)}" style="${pos}" aria-label="${esc(`${dayLabel(days[b.sc])} ${timeLabel(b.e)} ${b.e.title}${b.e.recurring ? ' 繰り返し' : ''}`)}">${rep(b.e)}${esc(b.e.title)}</button>`;
      }
    }
    html += '</div>';
  }
  return html;
}

// 週・日
const weekKeys = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart(state.selected), i));
function weekEvent(e, k, vlist = false) {
  return `<button type="button" class="event week-event ${e.cat}" data-event="${esc(e.id)}" aria-label="${esc(`${dayLabel(k)} ${timeLabel(e)} ${e.title}${e.recurring ? ' 繰り返し' : ''}`)}"><span class="clock">${e.all || (vlist && isMulti(e)) ? '終日' : e.start.slice(11)}</span><strong>${rep(e)}${esc(e.title)}</strong></button>`;
}
function weekRow(k, short, vlist = false) {
  const list = eventsOnDay(occIn(k, k), k), d = parseKey(k);
  const head = short ? `${d.getDate()}（${DOW[d.getDay()]}）` : dayLabel(k);
  const body = list.map((e) => weekEvent(e, k, vlist)).join('') || '<div class="empty-row">予定なし</div>';
  return `<section class="weekrow${k === todayKey() ? ' today' : ''}${k === state.selected ? ' selected' : ''}"><button type="button" class="wd" data-jump="${k}" aria-label="${dayLabel(k)}を日表示で開く">${head}</button>${vlist ? `<div class="wevents">${body}</div>` : body}</section>`;
}
const weekNotes = '<div class="weeknotes"><div class="eyebrow">今週の余白</div>日付から一日の詳細へ。予定を選ぶと全文を確認できます。</div>';

function calendarBody(kind) {
  if (state.view === 'month') return `<div class="scroll" data-scroll="cal">${monthGrid(kind)}</div>${legend}`;
  if (state.view === 'week') {
    const cols = kind === 'open' || kind === 'desk';
    const vlist = kind === 'portrait';
    return `<div class="scroll" data-scroll="cal"><div class="weekview${cols ? ' cols' : ''}${vlist ? ' vlist' : ''}">${weekKeys().map((k) => weekRow(k, cols || vlist, vlist)).join('')}</div></div>`;
  }
  return `<div class="scroll" data-scroll="cal"><div class="daylist">${dayList(state.selected)}</div></div>`;
}
const calendar = (kind) => `<section class="calendar" aria-label="カレンダー">${chead(true, kind)}${calendarBody(kind)}</section>`;

function home() {
  const now = nowStamp(), k = todayKey(), d = parseKey(k);
  const list = eventsOnDay(occIn(k, k), k).filter((e) => e.end > now);
  let next = list.find((e) => !e.all) || list[0];
  const rest = list.filter((e) => e !== next);
  // 今日にもう予定がなければ、未来の回も含めて日付順に次の予定を探す。
  if (!next) next = occIn(addDays(k, 1), addDays(k, 400)).sort((a, b) => a.start.localeCompare(b.start) || String(a.id).localeCompare(String(b.id)))[0];
  const nextDay = next && dayOf(next.start) !== k ? `<small class="nd">${dayLabel(dayOf(next.start))}</small> ` : '';
  const nextHtml = next
    ? `<button type="button" class="next ${next.cat}" data-event="${esc(next.id)}"${repLabel(next, `次の予定 ${next.title}`)}><small>次の予定 · ${CATS[next.cat]}</small><strong>${rep(next)}${esc(next.title)}</strong><span class="when"><span class="time">${nextDay}${next.all ? '終日' : next.start.slice(11)}</span>${next.all || dayOf(next.start) !== dayOf(next.end) ? '' : ` — ${next.end.slice(11)}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}</span></button>`
    : `<div class="next none"><small>次の予定</small><strong>${state.events.length ? 'この後の予定はありません' : '予定はまだありません'}</strong>${sampleBtn()}</div>`;
  return `<div class="shell home">
    <header class="top">${brand}<div class="toolbar">${segment('month')}</div></header>
    <section class="hero"><div class="date-block"><div class="eyebrow">今日 / ${d.getFullYear()}年${d.getMonth() + 1}月</div><div class="date">${d.getDate()}<span>${DOW[d.getDay()]}曜日</span></div></div>${nextHtml}</section>
    <section class="remaining" aria-label="今日の残り予定"><h3>今日の残り予定</h3><div class="list" data-scroll="rest">${rest.map(card).join('') || '<p class="small pad">この後の予定はありません。</p>'}</div></section>
    ${addBtn}</div>`;
}
function browse() {
  return `<div class="shell browse"><header class="top">${brand}<div class="toolbar">${segment(state.view)}${todayBtn}</div></header>${calendar('browse')}${addBtn}</div>`;
}
function open() {
  const single = state.view !== 'month';
  const portrait = isPortrait();
  return `<div class="shell open${portrait ? ' portrait' : ''}"><header class="top">${brand}<div class="toolbar">${segment(state.view)}${deskBtn()}${todayBtn}</div></header>
    <div class="layout${single ? ' single' : ''}">${calendar(portrait ? 'portrait' : 'open')}${single ? '' : agenda(state.selected)}</div>${addBtn}</div>`;
}
function desk() {
  return `<div class="shell desk"><div class="desktop"><header class="top">${brand}<div class="toolbar">${segment(state.view)}${deskBtn()}${todayBtn}</div></header>${calendar('desk')}</div>
    <div class="foldband" role="separator" aria-label="折り目の保護領域">折り目の保護領域</div>
    <div class="deskbottom">${agenda(state.selected)}${addBtn}</div></div>`;
}
function spread() {
  const left = { month: `<section class="page calendar" aria-label="カレンダー">${chead(false)}${calendarBody('spread')}</section>`, week: '', day: '' };
  let pages;
  if (state.view === 'month') {
    pages = [left.month, `<section class="page">${agenda(state.selected)}</section>`];
  } else if (state.view === 'week') {
    const ks = weekKeys();
    pages = [
      `<section class="page"><div class="scroll weekpage" data-scroll="pl">${ks.slice(0, 4).map((k) => weekRow(k, false)).join('')}</div></section>`,
      `<section class="page"><div class="scroll weekpage" data-scroll="pr">${ks.slice(4).map((k) => weekRow(k, false)).join('')}${weekNotes}</div></section>`,
    ];
  } else {
    const n = eventsOnDay(occIn(state.selected, state.selected), state.selected).length;
    pages = [
      `<section class="page"><div class="scroll" data-scroll="pl"><div class="daylist">${dayList(state.selected)}</div></div></section>`,
      `<section class="page margin"><div class="eyebrow">一日の余白</div><h3>${dayLabel(state.selected)}</h3><p>予定は左ページに時刻順で表示。</p><p class="small">${n}件の予定 · 右上の＋から追加</p></section>`,
    ];
  }
  return `<div class="shell spread"><header class="spreadhead">
      <div class="half">${brand}${segment(state.view)}${deskBtn()}</div><div class="gutter"></div>
      <div class="half"><h2 class="stitle">${periodTitle()}</h2>${arrows()}${todayBtn}<button type="button" class="add mini" data-act="add" aria-label="予定を追加">＋</button></div></header>
    <div class="pages">${pages[0]}<div class="gutter"></div>${pages[1]}</div></div>`;
}

// ---------- 描画（スクロール位置とフォーカスを保つ） ----------
let lastKind = '';
function render() {
  const kind = layoutKind();
  const scrolls = {};
  root.querySelectorAll('[data-scroll]').forEach((el) => { scrolls[`${lastKind}:${el.dataset.scroll}`] = el.scrollTop; });
  const f = document.activeElement;
  const focusKey = f && root.contains(f) ? f.dataset.act ? `act:${f.dataset.act}` : f.dataset.view ? `view:${f.dataset.view}` : f.dataset.style ? `style:${f.dataset.style}` : f.dataset.date ? `date:${f.dataset.date}` : '' : '';
  document.body.dataset.layout = kind;
  document.body.dataset.posture = kind === 'open' && isPortrait() ? 'portrait' : '';
  root.innerHTML = { home, browse, open, desk, spread }[kind]();
  lastKind = kind;
  root.querySelectorAll('[data-scroll]').forEach((el) => { el.scrollTop = scrolls[`${kind}:${el.dataset.scroll}`] || 0; });
  if (focusKey) {
    const [t, v] = focusKey.split(/:(.*)/);
    const sel = { act: `[data-act="${v}"]`, view: `[data-view="${v}"]`, style: `[data-style="${v}"]`, date: `[data-date="${v}"]` }[t];
    root.querySelector(sel)?.focus({ preventScroll: true });
  }
}

// ---------- 操作 ----------
function move(n) {
  const k = state.selected;
  set({ selected: state.view === 'month' ? addMonths(k, n) : addDays(k, n * (state.view === 'week' ? 7 : 1)) });
}
function say(msg) { $('#status').textContent = ''; requestAnimationFrame(() => { $('#status').textContent = msg; }); }

root.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || !root.contains(b)) return;
  const d = b.dataset;
  if (d.view) set({ view: d.view, home: false });
  else if (d.style) set({ style: d.style });
  else if (d.date) {
    const compact = ['home', 'browse'].includes(layoutKind());
    // 閉じた状態では選択日サイドが無いので、日付選択でその日の日表示へ進む。
    set(compact && state.view === 'month' ? { selected: d.date, view: 'day' } : { selected: d.date });
  } else if (d.jump) set({ selected: d.jump, view: 'day' });
  else if (d.event) openEditor(d.event, b);
  else if (d.new) openEditor(null, b, d.new);
  else if (d.act === 'add') openEditor(null, b);
  else if (d.act === 'today') set({ selected: todayKey(), view: 'month', home: true });
  else if (d.act === 'prev') move(-1);
  else if (d.act === 'next') move(1);
  else if (d.act === 'desk') set({ desk: !state.desk });
  else if (d.act === 'sample') loadSample();
  else if (d.act === 'search') openSearch(b);
  else if (d.act === 'menu') openMenu(b);
});

async function loadSample() {
  try {
    await db.putMany(SAMPLE);
    state.events = await db.listEvents();
    render();
    say('サンプルの予定を入れました。');
  } catch { say('サンプルを保存できませんでした。'); }
}

// ---------- パネル共通（編集・範囲・確認・メニュー・検索・バックアップ） ----------
const dlg = $('#editor'), confirmDlg = $('#confirm'), scopeDlg = $('#scope'), menuDlg = $('#menu'), searchDlg = $('#search'), backupDlg = $('#backup'), form = $('#form');
const panels = [dlg, confirmDlg, scopeDlg, menuDlg, searchDlg, backupDlg];
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
for (const d of [dlg, menuDlg, searchDlg, backupDlg]) {
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
  rfreq: $('#f-rfreq'), rend: $('#f-rend'), rcount: $('#f-rcount'), runtil: $('#f-runtil'),
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

function readForm() {
  return {
    title: F.title.value, cat: F.cat.value, all: F.all.checked, start: F.start.value, end: F.end.value, place: F.place.value, notes: F.notes.value,
    rfreq: F.rfreq.value, rbyday: [...rsel], rend: F.rend.value, rcount: F.rcount.value, runtil: F.runtil.value, ropen: !R.panel.hidden, autoDays,
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
}
function showEditor(values, id, focus = true) {
  editing = id;
  $('#edtitle').textContent = id ? '予定を編集' : '予定を追加';
  F.title.value = values.title; F.cat.value = values.cat; F.all.checked = values.all;
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
  updateRepeatUi();
  dlg.show();
  syncInert();
  if (focus) F.title.focus();
}
function valuesFrom(cur) {
  const o = cur.occ, r = cur.p.recurrence;
  return {
    title: o.title, cat: o.cat, all: !!o.all, start: toInput(o.start, o.all), end: toInput(o.end, o.all), place: o.place || '', notes: o.notes || '',
    rfreq: r ? r.freq : 'none', rbyday: r?.byDay || [], rend: r ? (r.count != null ? 'count' : r.until ? 'until' : 'none') : 'none',
    rcount: String(r?.count ?? 10), runtil: r?.until ? r.until.replaceAll('-', '/') : '', ropen: false, autoDays: false,
  };
}
function openEditor(id, from, day = state.selected) {
  origins.set(dlg, from || document.activeElement);
  const cur = id ? resolve(id) : null;
  const values = cur
    ? valuesFrom(cur)
    : { title: '', cat: 'work', all: false, start: `${day.replaceAll('-', '/')} 10:00`, end: `${day.replaceAll('-', '/')} 11:00`, place: '', notes: '', rfreq: 'none', rbyday: [], rend: 'none', rcount: '10', runtil: '', ropen: false };
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
}
const SAVE_FAIL = '保存できませんでした。もう一度お試しください。';

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const r = validateDraft(readForm());
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
  try {
    await commit({ puts: [item], dels: [] });
  } catch {
    $('#error').textContent = SAVE_FAIL;
    return;
  }
  clearDraft();
  closePanel(dlg);
  set({ selected: dayOf(item.start) });
  say('予定を保存しました。');
});

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
  (scopeDlg.querySelector('[data-scope]:not(:disabled)'))?.focus();
}
scopeDlg.addEventListener('close', () => {
  if (!confirmDlg.open && !scopeDlg.open) { dlg.inert = false; if (dlg.open) (scopeCtx?.kind === 'delete' ? $('#delete') : form.querySelector('[type=submit]')).focus(); }
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
  $('#canceldelete').focus();
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
  $('#canceldelete').focus();
});
confirmDlg.addEventListener('close', () => {
  if (!scopeDlg.open) { dlg.inert = false; if (dlg.open) $('#delete').focus(); }
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
    else await db.deleteEvent(editing);
  } catch { confirmDlg.close(); $('#error').textContent = '削除できませんでした。'; return; }
  if (!pendingDelete) state.events = state.events.filter((x) => x.id !== editing);
  void cur;
  pendingDelete = null;
  confirmDlg.close();
  closeEditor();
  render();
  say('予定を削除しました。');
});

// ---------- その他メニュー ----------
function openMenu(from) {
  $('#m-desk').hidden = window.innerWidth < 600 || window.innerHeight < 600;
  $('#m-desk').textContent = state.desk ? '卓上表示をやめる' : '卓上表示';
  $('#m-sample').hidden = !(state.loaded && state.events.length === 0);
  openPanel(menuDlg, from);
  menuDlg.querySelector('button:not([hidden])').focus();
}
menuDlg.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-m]');
  if (!b) return;
  const m = b.dataset.m, from = origins.get(menuDlg);
  if (m === 'backup') { closePanel(menuDlg, false); openBackup(from); }
  else if (m === 'desk') { closePanel(menuDlg); set({ desk: !state.desk }); }
  else if (m === 'sample') { closePanel(menuDlg); loadSample(); }
  else closePanel(menuDlg);
});
document.addEventListener('click', (ev) => {
  if (menuDlg.open && !menuDlg.contains(ev.target) && !ev.target.closest('[data-act="menu"]')) closePanel(menuDlg);
});

// ---------- 検索 ----------
const SR = { q: $('#sr-q'), clear: $('#sr-clear'), range: $('#sr-range'), body: $('#sr-body') };
let srSeq = 0, srTimer = 0, srToday = todayKey(), srItems = [];
const ymd = (k) => k.replaceAll('-', '/');
function openSearch(from) {
  srToday = todayKey();
  SR.q.value = '';
  renderSearch(true);
  openPanel(searchDlg, from);
  SR.q.focus();
}
function hitHtml(e, ts) {
  const multi = isMulti(e);
  const time = e.all ? '終日' : multi ? `${e.start.slice(5, 10).replace('-', '/')} ${e.start.slice(11)} 〜 ${e.end.slice(5, 10).replace('-', '/')} ${e.end.slice(11)}` : `${e.start.slice(11)}–${e.end.slice(11)}`;
  const hl = (s) => highlight(s, ts, esc);
  const inTP = ts.every((t) => highlight(`${e.title}\n${e.place}`, [t], esc).includes('<mark>'));
  const ex = !inTP && e.notes ? excerpt(e.notes, ts) : '';
  return `<button type="button" class="hit ${e.cat}" data-hit="${esc(e.id)}"${repLabel(e, `${dayLabel(dayOf(e.start))} ${time} ${e.title}`)}><span class="hmeta">${esc(time)} · ${CATS[e.cat]}</span><strong>${rep(e)}${hl(e.title)}</strong>${e.place ? `<span class="hplace">${hl(e.place)}</span>` : ''}${ex ? `<span class="hnote">${hl(ex)}</span>` : ''}</button>`;
}
function renderSearch(initial = false) {
  const res = searchEvents(state.events, SR.q.value, srToday);
  SR.clear.hidden = !SR.q.value;
  SR.range.textContent = `検索範囲：${ymd(res.range.from)}–${ymd(res.range.to)}・最大${LIMIT}件`;
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
SR.clear.addEventListener('click', () => { clearTimeout(srTimer); srSeq++; SR.q.value = ''; renderSearch(); SR.q.focus(); });
$('#sr-close').addEventListener('click', () => closePanel(searchDlg));
SR.body.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-hit]');
  if (!b) return;
  const e = srItems.find((x) => String(x.id) === b.dataset.hit);
  if (!e) return;
  const k = dayOf(e.start);
  closePanel(searchDlg, false);
  set({ selected: k, view: 'day', home: false });
  [...root.querySelectorAll('[data-event]')].find((el) => el.dataset.event === String(e.id))?.focus({ preventScroll: false });
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
  BK.body.querySelector('button')?.focus();
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
      ${p.conflict ? `<p class="small">競合${p.conflict}件は現在の予定を残します</p>` : ''}</section>
      <button type="button" class="row" id="bk-add"${dis}>追加（同じ予定は重複させない）<small>今の予定と設定を残します</small></button>
      <button type="button" class="row" id="bk-replace"${dis}>置き換え<small>今の予定はすべて消えて、このファイルの内容になります。設定も置き換わります</small></button>
      <button type="button" class="row cancel" id="bk-cancel"${dis}>キャンセル</button>${bk.err ? `<p class="berr" role="alert">${esc(bk.err)}</p>` : ''}`;
  } else {
    BK.body.innerHTML = `<section class="card"><h3>今の予定${st.total}件を削除して、${bk.data.events.length}件に置き換えますか？</h3><p>元に戻せません。必要なら先に書き出してください。</p>
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
async function doExport() {
  bk.err = ''; bk.msg = '';
  try {
    const text = JSON.stringify(buildBackup(state.events, state), null, 2);
    const file = new File([text], backupName(), { type: 'application/json' });
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
    else res = validateBackup(await file.text());
  } catch { res = { ok: false, reason: 'ファイルを読み取れません' }; }
  if (!res.ok) bk = { stage: 'invalid', busy: false, name: file.name, reason: res.reason };
  else bk = { stage: 'confirm', busy: false, name: file.name, data: res.data, plan: planAppend(state.events, res.data.events), err: '' };
  renderBackup();
  BK.body.querySelector('button')?.focus();
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
    if (kind === 'add') await db.putMany(plan.add);
    else await db.replaceAll(data.events);
  } catch {
    try { state.events = await db.listEvents(); } catch { /* 無視 */ }
    bk = { stage: kind === 'add' ? 'confirm' : 'replace', busy: false, name, data, plan, err: '読み込みに失敗しました。現在の予定は変更していません。' };
    renderBackup();
    return;
  }
  state.events = await db.listEvents();
  let msg;
  if (kind === 'add') msg = `${plan.add.length}件を追加しました（重複${plan.skipped}件を除外）。`;
  else {
    msg = `${data.events.length}件の予定${data.settings ? 'と設定' : ''}に置き換えました。`;
    if (data.settings) Object.assign(state, data.settings);
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
  else if (b.id === 'bk-replace') { bk = { ...bk, stage: 'replace', err: '' }; renderBackup(); BK.body.querySelector('#bk-rcancel')?.focus(); }
  else if (b.id === 'bk-rdo') finishImport('replace');
  else if (b.id === 'bk-rcancel' || b.id === 'bk-cancel' || b.id === 'bk-back') backBackup();
});
$('#bk-close').addEventListener('click', () => { if (!bk.busy) closePanel(backupDlg); });

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (scopeDlg.open) cancelScope();
  else if (confirmDlg.open) cancelConfirm();
  else if (menuDlg.open) closePanel(menuDlg);
  else if (backupDlg.open) backBackup();
  else if (searchDlg.open) closePanel(searchDlg);
  else if (dlg.open) closeEditor();
});

// ---------- スワイプ（左＝次、右＝前） ----------
const SWIPE_ZONE = '.scroll, .agenda, .remaining, .hero, .page, .list';
const SWIPE_EXCLUDE = '.top, .spreadhead, .chead, .foot, .add, .foldband, .gutter, input, select, textarea, label, dialog';
let swiping = false;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const paneContent = () => [...root.querySelectorAll('.scroll > *, .agenda > *, .hero > *, .remaining > *, .margin > *')];

function swipeMove(dir) {
  if (layoutKind() === 'home') set({ home: false, view: 'month', selected: addMonths(state.selected, dir) });
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
let rt = 0;
const rerender = () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(render); };
window.addEventListener('resize', rerender);
window.addEventListener('orientationchange', rerender);
setInterval(() => { if (!anyPanel() && layoutKind() === 'home') render(); }, 60000);

async function boot() {
  render();
  try { state.events = await db.listEvents(); } catch { say('保存領域を開けませんでした。'); }
  state.loaded = true;
  render();
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }
  if (draft && typeof draft === 'object') {
    const id = draft.editing && resolve(draft.editing) ? draft.editing : null;
    origins.set(dlg, root.querySelector('[data-act="add"]'));
    showEditor({
      title: draft.title || '', cat: Object.hasOwn(CATS, draft.cat) ? draft.cat : 'work', all: !!draft.all, start: draft.start || '', end: draft.end || '', place: draft.place || '', notes: draft.notes || '',
      rfreq: draft.rfreq, rbyday: Array.isArray(draft.rbyday) ? draft.rbyday : [], rend: draft.rend, rcount: draft.rcount, runtil: draft.runtil, ropen: !!draft.ropen, autoDays: draft.autoDays,
    }, id, false);
  }
  document.documentElement.dataset.ready = '1';
}
boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
