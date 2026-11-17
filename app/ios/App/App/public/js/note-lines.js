// ノート本文の行操作（純関数）。本文の `- [ ] ` / `- [x] ` / `# ` / `- ` が正本で、別の保存形式は持たない。
// 改行は \n と \r\n の両方を扱い、触らない行・各行の改行の形は変えない。チェック項目に task・期限・通知は作らない。
// 位置（selStart/selEnd）は text の文字オフセット。

const RE_CHECK = /^(\s*)- \[([ xX])\] ?(.*)$/;
const RE_BULLET = /^(\s*)- (.*)$/;
const RE_HEAD = /^(#{1,6}) (.*)$/;

export function parseLine(line) {
  let m = RE_CHECK.exec(line);
  if (m) return { kind: 'check', indent: m[1], checked: m[2] !== ' ', text: m[3] };
  m = RE_HEAD.exec(line);
  if (m) return { kind: 'heading', level: m[1].length, text: m[2] };
  m = RE_BULLET.exec(line);
  if (m) return { kind: 'bullet', indent: m[1], text: m[2] };
  return { kind: 'plain', text: line };
}

// 行ごとに分ける。texts[i] の後ろの改行が eols[i]（最後の行は ''）。
export function splitLines(text) {
  const texts = [], eols = [], starts = [];
  let pos = 0;
  const re = /\r?\n/g; let m;
  while ((m = re.exec(text))) { texts.push(text.slice(pos, m.index)); eols.push(m[0]); starts.push(pos); pos = m.index + m[0].length; }
  texts.push(text.slice(pos)); eols.push(''); starts.push(pos);
  return { texts, eols, starts };
}
const joinLines = (texts, eols) => texts.reduce((a, t, i) => a + t + eols[i], '');
// オフセットを含む行番号
export function lineAt(text, pos) {
  const { starts } = splitLines(text);
  let i = 0;
  for (let k = 0; k < starts.length; k++) if (starts[k] <= pos) i = k;
  return i;
}

const prefixOf = (kind, p) => (kind === 'check' ? `${p?.indent || ''}- [${p?.checked ? 'x' : ' '}] ` : kind === 'bullet' ? `${p?.indent || ''}- ` : kind === 'heading' ? '# ' : '');
const bodyOf = (p) => p.text;
const lineOf = (kind, p) => prefixOf(kind, p) + bodyOf(p);

// 選択範囲にかかる行の書式を切り替える。すべての対象行が既にその書式なら通常行へ戻す（トグル）。
// kind: 'check' | 'bullet' | 'heading' | 'plain'。戻り値: { text, selStart, selEnd }
export function applyFormat(text, selStart, selEnd, kind) {
  const { texts, eols, starts } = splitLines(text);
  const a = lineAt(text, selStart);
  // 選択が次行の頭に触れただけのときは次行を含めない
  let b = lineAt(text, selEnd);
  if (selEnd > selStart && b > a && starts[b] === selEnd) b -= 1;
  const parsed = texts.map(parseLine);
  const skip = (i) => texts[i] === '' && a !== b; // 複数行の選択では空行を飾らない
  const idx = []; for (let i = a; i <= b; i++) if (!skip(i)) idx.push(i);
  const all = idx.length > 0 && idx.every((i) => parsed[i].kind === kind);
  const to = all || kind === 'plain' ? 'plain' : kind;
  const out = texts.slice(), delta = texts.map(() => 0);
  for (const i of idx) { out[i] = lineOf(to, parsed[i]); delta[i] = out[i].length - texts[i].length; }
  const t = joinLines(out, eols);
  const { starts: ns } = splitLines(t);
  const map = (pos) => {
    const li = lineAt(text, pos);
    const col = Math.max(0, pos - starts[li] + delta[li]);
    return ns[li] + Math.min(col, out[li].length);
  };
  return { text: t, selStart: map(selStart), selEnd: map(selEnd) };
}

// Return。キャレット（選択なし）の行が チェック／箇条書き なら次行へ同じ形を続ける。
// 項目が空なら、その行を通常の空行にして続けない。該当しなければ null（通常の改行に任せる）。
export function onEnter(text, selStart, selEnd) {
  if (selStart !== selEnd) return null;
  const { texts, eols, starts } = splitLines(text);
  const i = lineAt(text, selStart);
  const p = parseLine(texts[i]);
  if (p.kind !== 'check' && p.kind !== 'bullet') return null;
  const pre = prefixOf(p.kind, { indent: p.indent, checked: false });
  const col = selStart - starts[i];
  const own = texts[i].length - p.text.length; // 接頭辞の長さ
  if (p.text === '') { // 空項目: 通常行へ（接頭辞を消す。インデントも外す）
    const out = texts.slice(); out[i] = '';
    return { text: joinLines(out, eols), selStart: starts[i], selEnd: starts[i] };
  }
  if (col < own) return null; // 接頭辞の中では分割しない
  const eol = eols[i] || (/\r\n/.test(text) ? '\r\n' : '\n');
  const head = texts[i].slice(0, col), tail = texts[i].slice(col);
  const out = texts.slice(), oe = eols.slice();
  out.splice(i, 1, head, pre + tail); oe.splice(i, 1, eol, eols[i]);
  const pos = starts[i] + head.length + eol.length + pre.length;
  return { text: joinLines(out, oe), selStart: pos, selEnd: pos };
}

// 連続するチェック行（同じ連続ブロック）の範囲 [s, e]
function blockOf(parsed, i) {
  let s = i, e = i;
  while (s > 0 && parsed[s - 1].kind === 'check') s--;
  while (e < parsed.length - 1 && parsed[e + 1].kind === 'check') e++;
  return [s, e];
}

// チェック欄の切替。チェック→同じ連続ブロックの末尾へ。外す→済みの先頭の手前（未了の最後の次）へ。
// 戻り値: { text, selStart, selEnd, index }（index = 動いた先の行）。対象がチェック行でなければ null。
export function toggleCheck(text, lineIndex, selStart = 0, selEnd = selStart) {
  const { texts, eols, starts } = splitLines(text);
  const p = texts[lineIndex] != null ? parseLine(texts[lineIndex]) : null;
  if (!p || p.kind !== 'check') return null;
  const parsed = texts.map(parseLine);
  const [s, e] = blockOf(parsed, lineIndex);
  const flipped = lineOf('check', { ...p, checked: !p.checked });
  const rest = []; // ブロックから対象を除いた行
  for (let k = s; k <= e; k++) if (k !== lineIndex) rest.push(k);
  let at; // rest 内での挿入位置
  if (!p.checked) at = rest.length;
  else { at = rest.findIndex((k) => parsed[k].checked); if (at < 0) at = rest.length; }
  const order = rest.slice(); order.splice(at, 0, lineIndex);
  const out = texts.slice();
  order.forEach((src, k) => { out[s + k] = src === lineIndex ? flipped : texts[src]; });
  const t = joinLines(out, eols);
  const dest = s + at;
  // キャレットは元の行にあれば移った行へ追従、他の行なら（その行の位置が変わるので）追従させる
  const mapPos = (pos) => {
    const li = lineAt(text, pos);
    if (li < s || li > e) return pos;
    const col = pos - starts[li];
    const newIdx = s + order.indexOf(li);
    const { starts: ns } = splitLines(t);
    const shift = li === lineIndex ? flipped.length - texts[li].length : 0;
    return Math.min(t.length, ns[newIdx] + Math.max(0, Math.min(col + shift, out[newIdx].length)));
  };
  return { text: t, selStart: mapPos(selStart), selEnd: mapPos(selEnd), index: dest };
}

// チェック行の一覧 [{ index, checked, text }]（補助列の描画用）
export function checkLines(text) {
  const out = [];
  splitLines(text).texts.forEach((l, index) => { const p = parseLine(l); if (p.kind === 'check') out.push({ index, checked: p.checked, text: p.text }); });
  return out;
}
