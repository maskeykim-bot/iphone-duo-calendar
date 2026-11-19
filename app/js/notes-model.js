// ノートのデータ規則（旧「日ごとのメモ」からの変換、題名、固定フォルダ）。純粋関数だけ。DB・画面には触れない。
// 日付は文字列のまま扱い、曜日は Date.UTC で求める（端末の時間帯に左右されない）。

export const DAILY_ID = 'folder-daily-memos';
export const DAILY_NAME = '日ごとのメモ';
export const MAX_NOTE_CHARS = 100000; // 利用者が書く本文の上限（移行で足す日付見出しは別枠）
export const TITLE_MAX = 100;
export const EMPTY_TITLE = '新規ノート';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const dayParts = (date) => date.split('-').map(Number);

// 年付きの見出し「2026年11月14日（土）」。
export function dailyHeading(date) {
  const [y, m, d] = dayParts(date);
  return `${y}年${m}月${d}日（${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
}

// 1行目が同じ日の日付か。'full' = 年付き／ISO／スラッシュ（足さない）、'noYear' = 年なし（年付きに直す）、null = 別の行。
export function headingKind(line, date) {
  const [y, m, d] = dayParts(date);
  const t = line.trim().replace(/[()]/g, (c) => (c === '(' ? '（' : '）'));
  const pad = (n) => String(n).padStart(2, '0');
  if (t === date || t === `${y}/${m}/${d}` || t === `${y}/${pad(m)}/${pad(d)}`) return 'full';
  const w = '(（[日月火水木金土]）)?';
  if (new RegExp(`^${y}年0?${m}月0?${d}日${w}$`).test(t)) return 'full';
  if (new RegExp(`^0?${m}月0?${d}日${w}$`).test(t)) return 'noYear';
  return null;
}

// 行頭の記号（見出し「# 」〜「###### 」、チェック「- [ ] 」「- [x] 」、箇条書き「- 」「・」「•」）。保存の文字には残し、画面には出さない（S7 R-27・V-21）。
const MARK = /^\s*(#{1,6}\s+|- \[[ xX]\]\s*|[-・•]\s+)/;
const noCr = (line) => String(line ?? '').replace(/\r$/, '');
// 1行の「記号の部分」（字下げ込み）。記号がなければ ''。line === markOf(line) + 残り。
export const markOf = (line) => { const m = MARK.exec(String(line ?? '')); return m ? m[0] : ''; };
// 画面に出す1行: 先頭の記号を外した文字（前後の空白も落とす）。ノートの文字を画面に出す所は必ずこれを通す。
export const displayLine = (line) => { const l = noCr(line); return l.slice(markOf(l).length).trim(); };
// 本文まるごと: 各行の記号を外す（検索の抜き出し用。行の数は変えない）。
export const displayText = (body) => String(body ?? '').split('\n').map(displayLine).join('\n');
// 題名は本文の1行目だけから作る（空行のあとの行は採らない）。表示は100字（絵文字を割らない）。空なら「新規ノート」。
export function titleOf(body) {
  const first = displayLine(String(body ?? '').split('\n', 1)[0]);
  if (!first) return EMPTY_TITLE;
  const cps = Array.from(first);
  return cps.length > TITLE_MAX ? cps.slice(0, TITLE_MAX).join('') : first;
}

// 最初の行（改行の形式つき）と残り。
const splitFirst = (text) => {
  const i = text.indexOf('\n');
  return i < 0 ? { head: text, rest: '' } : { head: text.slice(0, i + 1), rest: text.slice(i + 1) };
};

// 旧メモ1件 → ノート1件。決定的（何度作っても同じ）。メモの text / ink / 作成・更新時刻は失わない。
// idSuffix は追加専用の復元で別IDを作るときに使う。
export function noteFromMemo(m, idSuffix = '') {
  const kind = headingKind(m.text.split('\n', 1)[0], m.date);
  const heading = dailyHeading(m.date);
  const note = { id: `memo-${m.date}${idSuffix}`, body: m.text, title: '', folderId: DAILY_ID, pinned: false, pinnedAt: null,
    createdAt: m.createdAt, updatedAt: m.updatedAt, sourceDate: m.date, date: m.date, sourceHeading: false, ink: m.ink ?? null, deletedAt: null };
  if (kind === null) {
    note.body = `${heading}\n${m.text}`;
    note.sourceHeading = true;
  } else if (kind === 'noYear') {
    // 年なしの同日見出しは年付きに直す。元の第一行（改行形式も）を残して完全に戻せるようにする。
    const { head, rest } = splitFirst(m.text);
    const eol = head.endsWith('\r\n') ? '\r\n' : head.endsWith('\n') ? '\n' : '';
    note.body = heading + eol + rest;
    note.sourceOriginalFirstLine = head;
  }
  note.title = titleOf(note.body);
  return note;
}

// ノートの日付（'YYYY-MM-DD' | null）。date の項目があればそれ（不正は null）、無ければ sourceDate。
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const normDay = (v) => {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : null;
};
export function noteDateOf(n) {
  if (!n) return null;
  return 'date' in n ? normDay(n.date) : normDay(n.sourceDate);
}
// その日を持つ（削除されていない）自分以外のノート。
export function dateOccupants(rows, date, exceptId) {
  return (rows || []).filter((n) => n && n.deletedAt == null && n.id !== exceptId && noteDateOf(n) === date && date != null);
}

// ノート → 元のメモ本文（確かめ・旧形式への書き戻し用）。sourceDate の無いノートは本文そのもの。
export function memoTextOf(n) {
  if (n.sourceHeading) return n.body.slice(n.body.indexOf('\n') + 1);
  if (typeof n.sourceOriginalFirstLine === 'string') return n.sourceOriginalFirstLine + splitFirst(n.body).rest;
  return n.body;
}

// 本文の上限。移行で足した見出し分（1行ぶん）は別枠で加える。
export function noteCharLimit(n) {
  return MAX_NOTE_CHARS + (n?.sourceHeading ? n.body.indexOf('\n') + 1 : 0);
}

// 固定フォルダの確認。あればそのまま（改名されていても使う）。無ければ新規の下書きを返す（名前が重なれば（2）以降）。
// 戻り値: { folder, created }。呼ぶ側は created のときだけ保存する。
export function ensureDailyFolder(folders = [], now = Date.now()) {
  const cur = folders.find((f) => f.id === DAILY_ID);
  if (cur) return { folder: cur, created: false };
  const names = new Set(folders.map((f) => f.name));
  let name = DAILY_NAME, k = 2;
  while (names.has(name)) name = `${DAILY_NAME}（${k++}）`;
  const order = folders.reduce((mx, f) => Math.max(mx, (Number.isFinite(f.order) ? f.order : 0) + 1), 0);
  return { folder: { id: DAILY_ID, name, order, createdAt: now, updatedAt: now }, created: true };
}
