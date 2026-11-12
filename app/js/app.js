import * as db from './db.js';
import { SAMPLE } from './sample.js';
import { initSwipe } from './swipe.js';
import {
  CATS, DOW, addDays, addMonths, assignLanes, assignSharedLanes, dayLabel, dayOf, dkey, eventsOnDay, isKey, isMulti,
  monthWeeks, newId, nowStamp, parseKey, timeLabel, toInput, todayKey, validateDraft, weekStart,
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
const brand = '<div class="brand"><span class="logo">Duo.</span><span class="small">私の手帳</span></div>';
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
  return `<button type="button" class="event ${e.cat}" data-event="${esc(e.id)}"><span class="clock">${timeLabel(e)}</span><span class="tag">${CATS[e.cat]}</span><strong>${esc(e.title)}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
}
const sampleBtn = () => (state.loaded && state.events.length === 0 ? '<button type="button" class="ghost" data-act="sample">サンプルを入れる</button>' : '');
function dayList(k) {
  const list = eventsOnDay(state.events, k);
  if (list.length) return list.map(card).join('');
  return `<div class="empty"><p>予定のない、余白の一日。</p><button type="button" class="ghost" data-new="${k}">＋ この日に追加</button> ${sampleBtn()}</div>`;
}
function agenda(k) {
  const n = eventsOnDay(state.events, k).length;
  return `<section class="agenda" aria-label="選択日の予定"><div class="eyebrow">選択日の予定</div><h3>${dayLabel(k)}</h3><div class="count small">${n}件の予定</div><div class="list" data-scroll="agenda">${dayList(k)}</div></section>`;
}

// 月グリッド
const ROW_H = 88, BAR_H = 16, BAR_GAP = 2, CHIP_H = 13;
function monthGrid(kind) {
  if (kind === 'portrait') return monthGridPortrait();
  const sel = state.selected, today = todayKey(), cur = parseKey(sel).getMonth(), named = state.style === 'named';
  let html = `<div class="weekdays">${DOW.map((x, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${x}</span>`).join('')}</div>`;
  for (const days of monthWeeks(sel)) {
    const lane = named ? assignLanes(state.events, days) : { bars: [], hidden: Array(7).fill(0), used: 0 };
    const reserve = lane.used ? lane.used * (BAR_H + BAR_GAP) + 2 : 0;
    html += `<div class="week ${named ? 'named' : 'simple'}" style="--reserve:${reserve}px">`;
    days.forEach((k, col) => {
      const es = eventsOnDay(state.events, k);
      const d = parseKey(k);
      let body = '';
      if (named) {
        const singles = es.filter((e) => !isMulti(e));
        const cap = Math.max(1, Math.floor((ROW_H - 2 - 22 - reserve) / CHIP_H));
        const shown = singles.length <= cap ? singles : singles.slice(0, Math.max(0, cap - 1));
        body = `<span class="chips">${shown.map((e) => `<span class="chip ${e.cat}">${esc(e.title)}</span>`).join('')}${singles.length > shown.length ? `<span class="more">ほか${singles.length - shown.length}件</span>` : ''}</span>`;
      } else {
        body = `<span class="dots">${es.slice(0, 4).map((e) => `<i class="dot ${e.cat}"></i>`).join('')}</span>`;
      }
      const plus = lane.hidden[col] ? `<span class="plus" aria-hidden="true">+${lane.hidden[col]}</span>` : '';
      html += `<button type="button" class="day${d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}" data-date="${k}" aria-label="${dayLabel(k)}、予定${es.length}件" aria-pressed="${k === sel}"><span class="dhead"><span class="num">${d.getDate()}</span>${plus}</span>${body}</button>`;
    });
    for (const b of lane.bars) {
      html += `<button type="button" class="bar ${b.e.cat}" data-event="${esc(b.e.id)}" style="left:calc(${b.sc} * 100% / 7 + 2px);width:calc(${b.ec - b.sc + 1} * 100% / 7 - 4px);top:${24 + b.lane * (BAR_H + BAR_GAP)}px" aria-label="${esc(b.e.title)} ${dayOf(b.e.start)}から${dayOf(b.e.end)}">${b.fromPrev ? '← ' : ''}${esc(b.e.title)}${b.toNext ? ' →' : ''}</button>`;
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
    const { items, hidden } = assignSharedLanes(state.events, days);
    html += '<div class="week named pm">';
    days.forEach((k, col) => {
      const n = eventsOnDay(state.events, k).length, d = parseKey(k);
      const plus = hidden[col] ? `<span class="plus" aria-hidden="true">+${hidden[col]}</span>` : '';
      html += `<button type="button" class="day${d.getMonth() !== cur ? ' out' : ''}${k === sel ? ' selected' : ''}${k === today ? ' today' : ''}" data-date="${k}" aria-label="${dayLabel(k)}、予定${n}件" aria-pressed="${k === sel}"><span class="dhead"><span class="num">${d.getDate()}</span></span>${plus}</button>`;
    });
    for (const b of items) {
      const pos = `left:calc(${b.sc} * 100% / 7 + 2px);width:calc(${b.ec - b.sc + 1} * 100% / 7 - 4px);top:${LANE_TOP + b.lane * LANE_H}px`;
      if (b.multi) {
        html += `<button type="button" class="bar ${b.e.cat}" data-event="${esc(b.e.id)}" style="${pos}" aria-label="${esc(b.e.title)} ${dayOf(b.e.start)}から${dayOf(b.e.end)}">${b.fromPrev ? '← ' : ''}${esc(b.e.title)}${b.toNext ? ' →' : ''}</button>`;
      } else {
        html += `<button type="button" class="strip ${b.e.cat}" data-event="${esc(b.e.id)}" style="${pos}" aria-label="${esc(`${dayLabel(days[b.sc])} ${timeLabel(b.e)} ${b.e.title}`)}">${esc(b.e.title)}</button>`;
      }
    }
    html += '</div>';
  }
  return html;
}

// 週・日
const weekKeys = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart(state.selected), i));
function weekEvent(e, k, vlist = false) {
  return `<button type="button" class="event week-event ${e.cat}" data-event="${esc(e.id)}" aria-label="${esc(`${dayLabel(k)} ${timeLabel(e)} ${e.title}`)}"><span class="clock">${e.all || (vlist && isMulti(e)) ? '終日' : e.start.slice(11)}</span><strong>${esc(e.title)}</strong></button>`;
}
function weekRow(k, short, vlist = false) {
  const list = eventsOnDay(state.events, k), d = parseKey(k);
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
  const list = eventsOnDay(state.events, k).filter((e) => e.end > now);
  const next = list.find((e) => !e.all) || list[0];
  const rest = list.filter((e) => e !== next);
  const nextHtml = next
    ? `<button type="button" class="next ${next.cat}" data-event="${esc(next.id)}"><small>次の予定 · ${CATS[next.cat]}</small><strong>${esc(next.title)}</strong><span class="when"><span class="time">${next.all ? '終日' : next.start.slice(11)}</span>${next.all ? '' : ` — ${next.end.slice(11)}`}${next.place ? ` <small>${esc(next.place)}</small>` : ''}</span></button>`
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
    const n = eventsOnDay(state.events, state.selected).length;
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
});

async function loadSample() {
  try {
    await db.putMany(SAMPLE);
    state.events = await db.listEvents();
    render();
    say('サンプルの予定を入れました。');
  } catch { say('サンプルを保存できませんでした。'); }
}

// ---------- 編集シート（ドラフトは sessionStorage に保持） ----------
const dlg = $('#editor'), confirmDlg = $('#confirm'), form = $('#form');
let editing = null, origin = null;
const F = { title: $('#f-title'), cat: $('#f-cat'), all: $('#f-all'), start: $('#f-start'), end: $('#f-end'), place: $('#f-place') };

function readForm() { return { title: F.title.value, cat: F.cat.value, all: F.all.checked, start: F.start.value, end: F.end.value, place: F.place.value }; }
function saveDraft() {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, ...readForm() })); } catch { /* 無視 */ }
}
function clearDraft() { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* 無視 */ } }
function applyAllDayUi() {
  const all = F.all.checked;
  F.start.placeholder = all ? '2026/11/12' : '2026/11/12 10:00';
  F.end.placeholder = all ? '2026/11/12' : '2026/11/12 11:00';
}
function showEditor(values, id, focus = true) {
  editing = id;
  $('#edtitle').textContent = id ? '予定を編集' : '予定を追加';
  F.title.value = values.title; F.cat.value = values.cat; F.all.checked = values.all;
  F.start.value = values.start; F.end.value = values.end; F.place.value = values.place;
  $('#delete').hidden = !id;
  $('#error').textContent = '';
  applyAllDayUi();
  dlg.show();
  root.inert = true;
  if (focus) F.title.focus();
}
function openEditor(id, from, day = state.selected) {
  origin = from || document.activeElement;
  const e = id ? state.events.find((x) => x.id === id) : null;
  const values = e
    ? { title: e.title, cat: e.cat, all: !!e.all, start: toInput(e.start, e.all), end: toInput(e.end, e.all), place: e.place || '' }
    : { title: '', cat: 'work', all: false, start: `${day.replaceAll('-', '/')} 10:00`, end: `${day.replaceAll('-', '/')} 11:00`, place: '' };
  showEditor(values, e ? e.id : null);
  saveDraft();
}
function closeEditor() {
  clearDraft();
  if (confirmDlg.open) confirmDlg.close();
  dlg.close();
}
dlg.addEventListener('close', () => {
  root.inert = false;
  const target = origin?.isConnected ? origin : root.querySelector('[data-act="add"]');
  target?.focus({ preventScroll: true });
});
form.addEventListener('input', saveDraft);
form.addEventListener('change', saveDraft);
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
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const r = validateDraft(readForm());
  if (r.error) { $('#error').textContent = r.error; return; }
  const prev = editing ? state.events.find((x) => x.id === editing) : null;
  const item = { ...prev, ...r.event, id: prev ? prev.id : newId(), updatedAt: Date.now() };
  try {
    await db.putEvent(item);
  } catch {
    $('#error').textContent = '保存できませんでした。端末の空き容量やブラウザの設定を確認してください。';
    return;
  }
  state.events = [...state.events.filter((x) => x.id !== item.id), item];
  clearDraft();
  dlg.close();
  set({ selected: dayOf(item.start) });
  say('予定を保存しました。');
});
$('#delete').addEventListener('click', () => {
  $('#deletetitle').textContent = state.events.find((x) => x.id === editing)?.title || '';
  confirmDlg.show();
  dlg.inert = true;
  $('#canceldelete').focus();
});
confirmDlg.addEventListener('close', () => { dlg.inert = false; if (dlg.open) $('#delete').focus(); });
$('#canceldelete').addEventListener('click', () => confirmDlg.close());
$('#dodelete').addEventListener('click', async () => {
  try { await db.deleteEvent(editing); } catch { confirmDlg.close(); $('#error').textContent = '削除できませんでした。'; return; }
  state.events = state.events.filter((x) => x.id !== editing);
  confirmDlg.close();
  closeEditor();
  render();
  say('予定を削除しました。');
});
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (confirmDlg.open) confirmDlg.close();
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
  canStart: (t) => !dlg.open && !confirmDlg.open && !swiping && t instanceof Element && !!t.closest(SWIPE_ZONE) && !t.closest(SWIPE_EXCLUDE),
  onSwipe: swipeTo,
});

// ---------- 起動 ----------
let rt = 0;
const rerender = () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(render); };
window.addEventListener('resize', rerender);
window.addEventListener('orientationchange', rerender);
setInterval(() => { if (!dlg.open && layoutKind() === 'home') render(); }, 60000);

async function boot() {
  render();
  try { state.events = await db.listEvents(); } catch { say('保存領域を開けませんでした。'); }
  state.loaded = true;
  render();
  let draft = null;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { draft = null; }
  if (draft && typeof draft === 'object') {
    const id = draft.editing && state.events.some((e) => e.id === draft.editing) ? draft.editing : null;
    showEditor({ title: draft.title || '', cat: Object.hasOwn(CATS, draft.cat) ? draft.cat : 'work', all: !!draft.all, start: draft.start || '', end: draft.end || '', place: draft.place || '' }, id, false);
  }
  document.documentElement.dataset.ready = '1';
}
boot();
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
