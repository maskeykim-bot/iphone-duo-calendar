// R-70（品質の案）単体の部分。DOM の要らない所だけ。app/test-unit/ に写して node --test で流す。
// 5bc8af6 でも通る「守り」のテスト（直しでデータの扱いが変わらないこと）。変換そのものは Playwright 側（note-ime-r70.spec.js）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const GARBAGE = [
  '2026年11月20日（金）\n今日のノート\nきょうののーと\nきょうののー\nきょうのの\nきょうの\nきょう\nきょ\nこれはき',
  '# 今週のメモ\nきょう\nきょう\n- きょうの\n- [ ] きょうのの\n',
  '題\r\nきょう\r\nきょうの\r\n',
];

test('R-70: 既にある途中の行（ゴミ行）は、題名と本文に分けて戻すと1文字も変わらない（自動で消さない）', async () => {
  globalThis.document = undefined;
  const { splitBody, joinBody, isCrlf } = await import('../js/notes-ui.js');
  for (const t of GARBAGE) {
    const s = splitBody(t); const crlf = isCrlf(t);
    const rest = crlf ? s.rest.replace(/\r\n/g, '\n') : s.rest;
    assert.equal(joinBody({ ...s, rest, crlf }), t);
  }
});

test('R-70: 同じ語の行が続いても、行の数と順番はそのまま（重複を詰めない）', async () => {
  globalThis.document = undefined;
  const { splitBody } = await import('../js/notes-ui.js');
  const s = splitBody('題\nきょう\nきょう\nきょう');
  assert.deepEqual(s.rest.split('\n'), ['きょう', 'きょう', 'きょう']);
});

// 直しで「変換中かどうか」を見る純粋な関数を切り出すなら、ここに足す（例）:
// test('変換中は作り直さない', () => { assert.equal(shouldRebuild({ composing: true, sane: false }), false); assert.equal(shouldRebuild({ composing: false, sane: false }), true); });
