// 第19.3版 その2 F（征希さん「ノートにチェックボックスでタスクリストに追加する（ノートの日付けが期限）」）: ノートのチェック行とタスクのつながり（純粋関数。DOM・DB には触れない）。
// 持ち方（連携 第20弾 §3 (c)・§4 の 4）: IndexedDB・バックアップの版は 6 のまま。ノートの本文には何も足さない（"- [ ] " の後ろに id を書かない）。
// タスクの任意の項目 source = { type:'note-check', noteId, text, nth, pos } だけで持つ（無いタスクは今までの形のまま）。
//   text＝つないだ行の文字（行頭の記号と字下げを除く）、nth＝同じ文字のチェック行のうち上から何番目か（0〜）、pos＝チェック行だけを数えて上から何番目か（0〜）。
// 行の識別: ① 同じ文字なら出てくる順（text・nth）でつなぐ。② 文字が変わった行は、チェック行の数が前と同じとき（＝行の足し引きがないとき）だけ、直前の位置（pos）でつなぐ。③ それでも残ったのが 1 対 1 ならつなぐ。
//   同じ文字の行どうしを入れ替えたときは見分けられない（どちらも同じ題名のタスクなので、入れ替わっても見た目は同じ）。文字を変えるのと行の足し引きを 1 回の保存で同時にすると、
//   つながりが切れることがある（タスクは消さず、つながりだけ外れる）。
import { checkLines } from './note-lines.js';

export const SOURCE_TYPE = 'note-check';
const int = (n) => Number.isInteger(n) && n >= 0;
// 検証して既知の項目だけの新しいオブジェクトにする。不正なら null（＝つながりなし）
export function validSource(s) {
  if (!s || typeof s !== 'object' || s.type !== SOURCE_TYPE) return null;
  if (typeof s.noteId !== 'string' || !s.noteId || typeof s.text !== 'string' || !int(s.nth) || !int(s.pos)) return null;
  return { type: SOURCE_TYPE, noteId: s.noteId, text: s.text, nth: s.nth, pos: s.pos };
}
export const isNoteTask = (t, noteId = null) => !!t && !!validSource(t.source) && (noteId == null || t.source.noteId === noteId);

// 本文のチェック行に、識別（text・nth・pos）を付けて返す。index は本文の行番号
export function checkKeys(body) {
  const seen = new Map();
  return checkLines(String(body ?? '')).map((l, pos) => { const text = l.text.trim(), nth = seen.get(text) || 0; seen.set(text, nth + 1); return { index: l.index, checked: l.checked, text, nth, pos }; });
}
export const baselineOf = (body) => checkKeys(body).map((l) => l.text);

// つながり（links＝そのノートを指すタスク [{ id, title, done, source }]）と、いまのチェック行（lines＝checkKeys）を突き合わせる。返り値は { pairs:[{ link, line }], lostLinks, freeLines }
export function matchLines(links, lines, byPos = true) {
  const pairs = [], usedL = new Set(), usedK = new Set();
  const pair = (k, l) => { pairs.push({ link: k, line: l }); usedK.add(k); usedL.add(l); };
  // ① 同じ文字は、つながりの nth の順と、行の出てくる順で 1 つずつ
  const byText = new Map();
  for (const l of lines) { if (!byText.has(l.text)) byText.set(l.text, []); byText.get(l.text).push(l); }
  const ks = links.slice().sort((a, b) => a.source.nth - b.source.nth || a.source.pos - b.source.pos);
  for (const k of ks) { const q = byText.get(k.source.text); if (q && q.length) pair(k, q.shift()); }
  // ② 文字が変わった行は、直前の位置で（行の足し引きがないときだけ。ずれた位置の行につないで別のタスクの題名を書き換えないため）
  if (byPos) for (const k of ks) { if (usedK.has(k)) continue; const l = lines.find((x) => !usedL.has(x) && x.pos === k.source.pos); if (l) pair(k, l); }
  // ③ 残りが 1 対 1 ならつなぐ
  let restK = ks.filter((k) => !usedK.has(k)), restL = lines.filter((l) => !usedL.has(l));
  if (restK.length === 1 && restL.length === 1) { pair(restK[0], restL[0]); restK = []; restL = []; }
  return { pairs, lostLinks: restK, freeLines: restL };
}

// ノートを保存したときの段取り（ノート → タスク）。
//   noteId・body・date（ノートの日付。無ければ新しいタスクは作らない）、links（そのノートを指すタスク）、baseline（前に突き合わせたときのチェック行の文字。新しく作った・直した行だけをタスクにするための控え。
//   null なら「今の行は全部前からあった」として何も作らない＝起動時や保存済みのごみの行からはタスクを作らない）。
// 返り値: create [{ title, done, due, source }]、update [{ id, patch }]（patch は title・done・source のうち変わる物）、unlink [id]、baseline（次に渡す控え）
export function planNoteSync({ noteId, body, date = null, links = [], baseline = null }) {
  const lines = checkKeys(body), { pairs, lostLinks, freeLines } = matchLines(links.filter((k) => isNoteTask(k, noteId)), lines, !!baseline && baseline.length === lines.length);
  const out = { create: [], update: [], unlink: lostLinks.map((k) => k.id), baseline: lines.map((l) => l.text) };
  for (const { link, line } of pairs) {
    const patch = {}, src = link.source;
    if (line.text && line.text !== src.text && line.text !== link.title) patch.title = line.text; // 行の文字を直したらタスクの題名も直る（空にした行は前の題名のまま）
    if (line.checked !== !!link.done) patch.done = line.checked;
    const text = line.text || src.text;
    if (text !== src.text || line.nth !== src.nth || line.pos !== src.pos) patch.source = { type: SOURCE_TYPE, noteId, text, nth: line.nth, pos: line.pos };
    if (Object.keys(patch).length) out.update.push({ id: link.id, patch });
  }
  if (date && baseline) {
    // 前からあった行（つながっていない行）は控えから文字で 1 つずつ消し込み、残った行＝新しく作った・直した行だけを作る
    const old = new Map();
    for (const t of baseline) old.set(t, (old.get(t) || 0) + 1);
    for (const { link } of pairs) { const t = link.source.text; if (old.get(t)) old.set(t, old.get(t) - 1); }
    for (const k of lostLinks) { const t = k.source.text; if (old.get(t)) old.set(t, old.get(t) - 1); }
    for (const l of freeLines) {
      if (!l.text) continue; // 空の行からは作らない
      if (old.get(l.text)) { old.set(l.text, old.get(l.text) - 1); continue; }
      out.create.push({ title: l.text, done: l.checked, due: { date }, source: { type: SOURCE_TYPE, noteId, text: l.text, nth: l.nth, pos: l.pos } });
    }
  }
  return out;
}

// タスク → ノート: つながったタスクの完了が変わったとき、ノートのどの行を直すか。返り値は { index, checked }（本文の行番号と今のチェック）か null（行が見つからない）
export function lineOfSource(body, source) {
  const s = validSource(source); if (!s) return null;
  const lines = checkKeys(body);
  const l = lines.find((x) => x.text === s.text && x.nth === s.nth) || lines.find((x) => x.text === s.text) || null;
  return l ? { index: l.index, checked: l.checked } : null;
}

// ノートを別の日へ動かしたとき、一緒に期限を動かすタスク（design/35 §8・決定 7）: 期限がまだノートの元の日付と同じ、つながったタスクだけ（時刻はそのまま）
export function tasksFollowingNote(tasks, noteId, fromDate, toDate) {
  if (!fromDate || !toDate || fromDate === toDate) return [];
  return tasks.filter((t) => isNoteTask(t, noteId) && t.due && t.due.date === fromDate).map((t) => ({ id: t.id, due: t.due.time != null ? { date: toDate, time: t.due.time } : { date: toDate }, prev: t.due }));
}
