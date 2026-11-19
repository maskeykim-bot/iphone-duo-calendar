// 第19.1版 S7a（品質 高-1・高-2、企画 R-27、設計 V-21）: 記号を外す関数は1つ（notes-model の displayLine / markOf / displayText）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayLine, markOf, displayText, titleOf } from '../js/notes-model.js';
import { excerpt, highlight } from '../js/search.js';

const CASES = [['# 来期の予定', '# ', '来期の予定'], ['## 小見出し', '## ', '小見出し'], ['### 三', '### ', '三'], ['- 牛乳', '- ', '牛乳'], ['- [ ] 買い物', '- [ ] ', '買い物'], ['- [x] 済み', '- [x] ', '済み'], ['- [X] 済み', '- [X] ', '済み'], ['  - 字下げ', '  - ', '字下げ'], ['・ 点', '・ ', '点'], ['・点', '', '・点'], ['ふつうの行', '', 'ふつうの行'], ['#タグ', '', '#タグ'], ['-', '', '-']];
test('displayLine / markOf: 記号を外す。mark + 残り = 元の行', () => {
  for (const [line, mark, shown] of CASES) {
    assert.equal(markOf(line), mark, line);
    assert.equal(displayLine(line), shown, line);
    assert.equal(mark + line.slice(mark.length), line);
  }
  assert.equal(displayLine('# 来期\r'), '来期'); // CRLF
});
test('titleOf は displayLine を通す（1行目だけ）', () => {
  assert.equal(titleOf('# 来期の予定\n- 本文'), '来期の予定');
  assert.equal(titleOf('- [ ] 買い物\n牛乳'), '買い物');
  assert.equal(titleOf('# \n本文'), '新規ノート');
});
test('displayText: 全行の記号を外す。行の数は変えない', () => {
  const t = displayText('# 今週\n本文\n- 一つ\n- [ ] 予約\n- [x] 済み');
  assert.equal(t, '今週\n本文\n一つ\n予約\n済み');
});
test('検索の抜き出し・強調は記号を外した文字から作る', () => {
  const shown = displayText('# 今週のメモ\n本文の一行。\n- [ ] 買い物');
  const ex = excerpt(shown, ['買い物']);
  assert.ok(!/[#\[\]]|- /.test(ex), ex);
  assert.equal(highlight(excerpt(shown, ['今週']), ['今週'], (s) => s), '<mark>今週</mark>のメモ 本文の一行。 買い物');
});
