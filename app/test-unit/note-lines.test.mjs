import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, applyFormat, onEnter, toggleCheck, checkLines, splitLines } from '../js/note-lines.js';

test('parseLine: 形式の判定', () => {
  assert.deepEqual(parseLine('- [ ] 牛乳'), { kind: 'check', indent: '', checked: false, text: '牛乳' });
  assert.equal(parseLine('- [x] 卵').checked, true);
  assert.equal(parseLine('- [X] 卵').checked, true);
  assert.equal(parseLine('# 見出し').kind, 'heading');
  assert.equal(parseLine('- 項目').kind, 'bullet');
  assert.equal(parseLine('#タグ').kind, 'plain');
  assert.equal(parseLine('-[ ] x').kind, 'plain');
});

test('Return: チェック行は次の未チェック行を続ける。末尾・途中の分割', () => {
  let r = onEnter('- [ ] 牛乳', 8, 8);
  assert.equal(r.text, '- [ ] 牛乳\n- [ ] '); assert.equal(r.selStart, r.text.length);
  r = onEnter('- [x] 牛乳', 8, 8); assert.equal(r.text, '- [x] 牛乳\n- [ ] ');
  r = onEnter('- [ ] ab', 8, 8); assert.equal(r.text, '- [ ] ab\n- [ ] ');
  r = onEnter('- [ ] abcd\nz', 8, 8); assert.equal(r.text, '- [ ] ab\n- [ ] cd\nz'); assert.equal(r.selStart, 8 + 1 + 6);
  r = onEnter('- あ', 3, 3); assert.equal(r.text, '- あ\n- ');
});
test('Return: 空項目は通常行へ。通常行・見出し・選択ありは null', () => {
  let r = onEnter('a\n- [ ] ', 8, 8); assert.equal(r.text, 'a\n'); assert.equal(r.selStart, 2);
  r = onEnter('- ', 2, 2); assert.equal(r.text, '');
  assert.equal(onEnter('普通', 2, 2), null);
  assert.equal(onEnter('# 見出し', 5, 5), null);
  assert.equal(onEnter('- [ ] abc', 6, 8), null);
  assert.equal(onEnter('- [ ] abc', 2, 2), null); // 接頭辞の中
});
test('Return: CRLF を保つ', () => {
  const r = onEnter('- [ ] a\r\nb', 7, 7);
  assert.equal(r.text, '- [ ] a\r\n- [ ] \r\nb');
});

test('toggleCheck: チェックでブロック末尾へ、外すと未了の後ろへ', () => {
  const t = '- [ ] a\n- [ ] b\n- [ ] c';
  let r = toggleCheck(t, 0); assert.equal(r.text, '- [ ] b\n- [ ] c\n- [x] a'); assert.equal(r.index, 2);
  r = toggleCheck(r.text, 0); assert.equal(r.text, '- [ ] c\n- [x] a\n- [x] b'.replace('- [ ] c\n- [x] a\n- [x] b', '- [ ] c\n- [x] a\n- [x] b'));
  const u = toggleCheck('- [ ] c\n- [x] a\n- [x] b', 2); // b を外す → c の次、a の前
  assert.equal(u.text, '- [ ] c\n- [ ] b\n- [x] a'); assert.equal(u.index, 1);
});
test('toggleCheck: 別ブロックと周辺行は動かない・CRLF・非チェック行は null', () => {
  const t = 'タイトル\r\n- [ ] a\r\n- [ ] b\r\n\r\n- [ ] x\r\n- [ ] y\r\nおわり';
  const r = toggleCheck(t, 1);
  assert.equal(r.text, 'タイトル\r\n- [ ] b\r\n- [x] a\r\n\r\n- [ ] x\r\n- [ ] y\r\nおわり');
  assert.equal(toggleCheck(t, 0), null);
  assert.equal(toggleCheck(t, 99), null);
});
test('toggleCheck: 選択・キャレットが動いた行に追従する', () => {
  const t = '- [ ] a\n- [ ] b';
  const r = toggleCheck(t, 0, 7, 7); // a の行末
  assert.equal(r.text, '- [ ] b\n- [x] a');
  assert.equal(r.selStart, r.text.length);
});

test('applyFormat: 行の書式を付ける・外す・切り替える', () => {
  let r = applyFormat('牛乳', 0, 0, 'check'); assert.equal(r.text, '- [ ] 牛乳'); assert.equal(r.selStart, 6);
  r = applyFormat(r.text, 6, 6, 'check'); assert.equal(r.text, '牛乳'); assert.equal(r.selStart, 0);
  r = applyFormat('- [x] 牛乳', 3, 3, 'bullet'); assert.equal(r.text, '- 牛乳');
  r = applyFormat('牛乳', 2, 2, 'heading'); assert.equal(r.text, '# 牛乳'); assert.equal(r.selStart, 4);
  r = applyFormat('# 牛乳', 0, 0, 'bullet'); assert.equal(r.text, '- 牛乳');
});
test('applyFormat: 複数行の選択・空行・次行の頭に触れるだけの選択・CRLF', () => {
  const t = 'a\r\nb\r\n\r\nc';
  let r = applyFormat(t, 0, 4, 'check'); // a, b のみ（b の後の空行は含まない）
  assert.equal(r.text, '- [ ] a\r\n- [ ] b\r\n\r\nc');
  r = applyFormat('a\nb\n\nc', 0, 6, 'bullet'); assert.equal(r.text, '- a\n- b\n\n- c');
  r = applyFormat('a\nb', 0, 2, 'check'); assert.equal(r.text, '- [ ] a\nb'); // 選択が次行の頭で終わる
  assert.equal(r.selEnd, 8);
});
test('applyFormat: 日本語・絵文字・HTML 文字は文字のまま', () => {
  const r = applyFormat('<b>"牛&乳"</b> 🥛', 0, 0, 'check');
  assert.equal(r.text, '- [ ] <b>"牛&乳"</b> 🥛');
  assert.deepEqual(checkLines(r.text), [{ index: 0, checked: false, text: '<b>"牛&乳"</b> 🥛' }]);
});
test('往復: 整形したあと戻すと元の文字列に完全一致', () => {
  for (const t of ['a', 'a\nb\n', 'a\r\nb', '  - x\n- [ ] y', '']) {
    const f = applyFormat(t, 0, t.length, 'check');
    const b = applyFormat(f.text, 0, f.text.length, 'check');
    if (!/^\s*- /.test(t) && t !== '') assert.equal(b.text, t);
  }
  assert.equal(splitLines('a\r\nb\n').texts.length, 3);
});

// 第19.1版 S3: 画面の見え方（viewOf）。保存の文字は変えない＝ pre + text が必ず元の行に戻る。
import { viewOf, richLines } from '../js/note-lines.js';
test('viewOf: 記号を pre に分け、line === pre + text。種類は plain/h1/h2/bullet/check', () => {
  const cases = [
    ['', 'plain', ''], ['本文', 'plain', ''], ['# 見出し', 'h1', '# '], ['## 小見出し', 'h2', '## '], ['###### 6', 'h2', '###### '],
    ['- 項目', 'bullet', '- '], ['  - 字下げ', 'bullet', '  - '], ['- [ ] 予定', 'check', '- [ ] '], ['- [x] 済み', 'check', '- [x] '], ['- [X] 大文字', 'check', '- [X] '],
    ['- [ ]', 'check', '- [ ]'], ['- [ ] ', 'check', '- [ ] '], ['#見出しでない', 'plain', ''], ['-項目でない', 'plain', ''], ['- ', 'bullet', '- '], ['# ', 'h1', '# '],
    ['\t- [x]\u3000全角', 'check', '\t- [x]'],
  ];
  for (const [line, kind, pre] of cases) {
    const v = viewOf(line);
    assert.equal(v.pre + v.text, line, `往復 ${JSON.stringify(line)}`);
    assert.equal(v.kind, kind, `種類 ${JSON.stringify(line)}`);
    if (kind !== 'plain' || line === '') assert.equal(v.pre, pre, `pre ${JSON.stringify(line)}`);
  }
  assert.equal(viewOf('- [x] a').checked, true); assert.equal(viewOf('- [ ] a').checked, false);
  assert.equal(viewOf('- [x] a').text, 'a');
});
test('viewOf: 本文全体を行ごとに描いて戻しても、保存の文字（LF・CRLF・空行・末尾の改行）が変わらない', () => {
  const texts = ['題\n# 見出し\n- a\n- [ ] b\n- [x] c\n\n本文\n', '題\r\n- [ ] 牛乳\r\n卵\r\n\r\n- 既存', '', '\n\n', '- [x]', '## 小\n  - [X] 字下げ\n###### 六'];
  for (const t of texts) {
    const { texts: ls, eols } = splitLines(t);
    const back = ls.map((l, i) => { const v = viewOf(l); return v.pre + v.text + eols[i]; }).join('');
    assert.equal(back, t, JSON.stringify(t));
  }
});
test('書式の操作のあとも、画面の見え方から戻した文字は applyFormat の結果と同じ（見出し・箇条書き・チェックの往復）', () => {
  let t = '題\n本文の行\n二行目';
  for (const kind of ['heading', 'bullet', 'check', 'check', 'plain']) {
    const r = applyFormat(t, 2, 2, kind);
    const back = splitLines(r.text).texts.map((l) => { const v = viewOf(l); return v.pre + v.text; }).join('\n');
    assert.equal(back, r.text); t = r.text;
  }
  assert.equal(t, '題\n本文の行\n二行目');
});
test('richLines: 先頭から n 行・空行を飛ばす・記号は text に出ない', () => {
  const t = '# 題\n\n- a\n- [x] b\n本文';
  assert.deepEqual(richLines(t, 3, true).map((v) => [v.kind, v.text]), [['h1', '題'], ['bullet', 'a'], ['check', 'b']]);
  assert.equal(richLines(t).length, 5);
  assert.equal(richLines(null).length, 1);
  for (const v of richLines(t)) assert.ok(!/^(#+ |- )/.test(v.text));
});

// ---- 第19.3版 C: 箇条書き・チェックの行の字下げ（保存の形は行頭の空白 2 つで1段。最大 4 段） ----
test('indentLevel / levelOfPre: 空白 2 つで1段、タブは空白 2 つ、半端は切り捨て、上限 4', async () => {
  const { indentLevel, levelOfPre, INDENT_MAX, INDENT_UNIT } = await import('../js/note-lines.js');
  assert.equal(INDENT_UNIT, '  '); assert.equal(INDENT_MAX, 4);
  assert.deepEqual(['', ' ', '  ', '   ', '    ', '\t', '\t\t ', '            '].map(indentLevel), [0, 0, 1, 1, 2, 1, 2, 4]);
  assert.deepEqual(['- ', '  - ', '    - [ ] ', '  - [x] ', '# ', ''].map(levelOfPre), [0, 1, 2, 1, 0, 0]);
});
test('indentLines: 記号の行だけ動く。触るのは行頭の空白だけ（記号・チェック・文字・CRLF・ほかの行はそのまま）', async () => {
  const { indentLines, parseLine } = await import('../js/note-lines.js');
  const T = '題\r\n- 一\r\n本文\r\n  - [x] 二\r\n# 見出し\r\n- [ ] 三';
  const r = indentLines(T, 0, T.length, 1);
  assert.equal(r.text, '題\r\n  - 一\r\n本文\r\n    - [x] 二\r\n# 見出し\r\n  - [ ] 三');
  assert.deepEqual([r.selStart, r.selEnd], [0, r.text.length]);
  const back = indentLines(r.text, 0, r.text.length, -1);
  assert.equal(back.text, T);
  // 読み取りは今の形（^\s*- ）のまま
  assert.deepEqual(r.text.split('\r\n').map((l) => parseLine(l).kind), ['plain', 'bullet', 'plain', 'check', 'heading', 'check']);
  assert.equal(parseLine('    - [x] 二').checked, true);
});
test('indentLines: キャレットは文字の位置のまま。記号の行が無ければ null（Tab の元の動き）。端では文字が変わらない', async () => {
  const { indentLines } = await import('../js/note-lines.js');
  assert.deepEqual(indentLines('- abc', 4, 4, 1), { text: '  - abc', selStart: 6, selEnd: 6 });
  assert.deepEqual(indentLines('  - abc', 6, 6, -1), { text: '- abc', selStart: 4, selEnd: 4 });
  assert.deepEqual(indentLines('  - abc', 1, 1, -1), { text: '- abc', selStart: 0, selEnd: 0 }); // 行頭の空白の中にいたら行の頭へ
  assert.equal(indentLines('本文\n# 見出し', 0, 8, 1), null);
  assert.equal(indentLines('', 0, 0, 1), null);
  assert.equal(indentLines('- a', 3, 3, -1).text, '- a');
  let t = '- a'; for (let i = 0; i < 7; i++) t = indentLines(t, t.length, t.length, 1).text;
  assert.equal(t, '        - a'); // 最大 4 段 = 空白 8 つ
  for (let i = 0; i < 7; i++) t = indentLines(t, t.length, t.length, -1).text;
  assert.equal(t, '- a');
});
test('indentLines: only（払った行）だけ動かす。選択が次の行の頭に触れただけなら次の行は含めない。半端な字下げは段にそろう', async () => {
  const { indentLines } = await import('../js/note-lines.js');
  const T = '- a\n- b\n- c';
  assert.deepEqual(indentLines(T, 0, 0, 1, 2), { text: '- a\n- b\n  - c', selStart: 0, selEnd: 0 });
  assert.deepEqual(indentLines(T, 9, 9, 1, 0), { text: '  - a\n- b\n- c', selStart: 11, selEnd: 11 });
  assert.equal(indentLines(T, 0, 0, 1, 9), null);
  assert.equal(indentLines('本文\n- b', 0, 0, 1, 0), null);
  assert.equal(indentLines(T, 0, 4, 1).text, '  - a\n- b\n- c');
  assert.equal(indentLines('   - a', 0, 0, 1).text, '    - a'); // 空白 3 つ（1段）→ 2段
  assert.equal(indentLines('\t- a', 0, 0, -1).text, '- a');
});
test('字下げしても checkLines（チェック行の一覧: 行番号・状態・文字・順）はそのまま取れる', async () => {
  const { indentLines, checkLines } = await import('../js/note-lines.js');
  const T = '- [ ] 牛乳\n- [x] たまご\nメモ\n- [ ] パン';
  const before = checkLines(T);
  const r = indentLines(T, 0, T.length, 1);
  assert.deepEqual(checkLines(r.text), before);
  assert.deepEqual(before, [{ index: 0, checked: false, text: '牛乳' }, { index: 1, checked: true, text: 'たまご' }, { index: 3, checked: false, text: 'パン' }]);
});
test('applyFormat: 文字の入った行の記号を付ける・替える・外す（文字と字下げはそのまま、キャレットは文字の位置）', async () => {
  const { applyFormat } = await import('../js/note-lines.js');
  assert.deepEqual(applyFormat('買い物', 2, 2, 'bullet'), { text: '- 買い物', selStart: 4, selEnd: 4 });
  assert.deepEqual(applyFormat('- 買い物', 4, 4, 'check'), { text: '- [ ] 買い物', selStart: 8, selEnd: 8 });
  assert.deepEqual(applyFormat('- [x] 買い物', 8, 8, 'bullet'), { text: '- 買い物', selStart: 4, selEnd: 4 });
  assert.deepEqual(applyFormat('- [ ] 買い物', 8, 8, 'plain'), { text: '買い物', selStart: 2, selEnd: 2 });
  assert.equal(applyFormat('  - 子', 5, 5, 'check').text, '  - [ ] 子');
  assert.equal(applyFormat('a\nb\nc', 0, 5, 'check').text, '- [ ] a\n- [ ] b\n- [ ] c');
  assert.equal(applyFormat('- [ ] a\n- [ ] b\n- [ ] c', 0, 23, 'bullet').text, '- a\n- b\n- c');
  assert.equal(applyFormat('- a\n- b\n- c', 0, 11, 'plain').text, 'a\nb\nc');
});
