// 第19.3版 その3: カード（ノート）の題名・副題の決まりと、旧メモ由来のノートを別の日へ動かしたとき（date だけ変える）の決まり。純粋関数だけ（東京/NY で同じ）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardTextOf, titleOf, noteFromMemo, memoTextOf, noteDateOf, dateOccupants, dailyHeading } from '../js/notes-model.js';
import { tasksFollowingNote } from '../js/note-tasks.js';
import { shiftTimes, moveTimes, planMoveDuo } from '../js/move-day.js';

test('カードの題名は本文の1行目（titleOf と同じ）。副題は次の空でない行で、行頭の記号は外す', () => {
  assert.deepEqual(cardTextOf('買い物\n- [ ] 牛乳\n- [ ] 卵'), { title: '買い物', sub: '牛乳' });
  assert.deepEqual(cardTextOf('# 見出し\n\n\n本文です'), { title: '見出し', sub: '本文です' });
  assert.deepEqual(cardTextOf('題名だけ'), { title: '題名だけ', sub: '' });
  assert.equal(cardTextOf('買い物\n牛乳').title, titleOf('買い物\n牛乳'));
});
test('空のノート・1行目が空のノートは題名なし（画面は「新規ノート」を薄く出す）', () => {
  assert.deepEqual(cardTextOf(''), { title: '', sub: '' });
  assert.deepEqual(cardTextOf(null), { title: '', sub: '' });
  assert.deepEqual(cardTextOf('\n2行目'), { title: '', sub: '2行目' });
  assert.equal(titleOf(''), '新規ノート');
});
test('1行目が日付の見出しのノートは、その行を飛ばして次の空でない行が題名（カードの面に日付を出さない）', () => {
  assert.deepEqual(cardTextOf('2026年11月12日（木）\n旧メモの本文\n2行目'), { title: '旧メモの本文', sub: '2行目' });
  assert.deepEqual(cardTextOf(`${dailyHeading('2026-11-12')}\n\n\nあとの行`), { title: 'あとの行', sub: '' });
  assert.deepEqual(cardTextOf('2026年11月12日（木）\n'), { title: '', sub: '' }); // 見出しだけ: 題名なし
  assert.deepEqual(cardTextOf('2026年11月12日(木)\nかっこが半角'), { title: 'かっこが半角', sub: '' });
  // 日付の見出しでない1行目はそのまま題名（年のない日付・文の中の日付）
  assert.equal(cardTextOf('11月12日の買い物\n牛乳').title, '11月12日の買い物');
  assert.equal(cardTextOf('2026年11月12日（木）の会議\n議題').title, '2026年11月12日（木）の会議');
  // 動かしたあと（date が見出しの日と違っても）見出しは飛ばす＝本文は変えない
  const n = { ...noteFromMemo({ id: '2026-11-12', date: '2026-11-12', text: '旧メモ\nつづき', createdAt: 1, updatedAt: 2, ink: null }), date: '2026-11-14' };
  assert.deepEqual(cardTextOf(n.body), { title: '旧メモ', sub: 'つづき' });
});
test('長い題名は 100 字（絵文字を割らない）。副題は 200 字まで', () => {
  const t = cardTextOf(`${'あ'.repeat(98)}😀😀😀\n${'い'.repeat(300)}`);
  assert.equal(Array.from(t.title).length, 100); assert.ok(t.title.endsWith('😀😀')); assert.equal(t.sub.length, 200);
});
test('旧メモ由来のノートを動かす＝date だけを変える: id・sourceDate・本文はそのまま。日の判定は date、旧形式への書き戻し（memoTextOf）は元の本文のまま', () => {
  const m = { id: '2026-11-12', date: '2026-11-12', text: 'ｎ　IME のごみ\r\n本文', createdAt: 1, updatedAt: 2, ink: null };
  const n0 = noteFromMemo(m), n1 = { ...n0, date: '2026-11-14' };
  assert.equal(n1.id, 'memo-2026-11-12'); assert.equal(n1.sourceDate, '2026-11-12'); assert.equal(n1.body, n0.body);
  assert.equal(noteDateOf(n1), '2026-11-14'); assert.equal(memoTextOf(n1), m.text);
  assert.deepEqual(dateOccupants([n1], '2026-11-12', null), []); assert.deepEqual(dateOccupants([n1], '2026-11-14', null), [n1]);
  // 日付を外す: date: null（sourceDate には戻さない）
  assert.equal(noteDateOf({ ...n0, date: null }), null);
});
test('ノートを動かしたとき一緒に動くタスク: 期限がまだノートの元の日と同じ、つながったタスクだけ（時刻はそのまま）。単独で動かしたタスク・ほかのノートのタスクは動かない', () => {
  const src = (noteId, text) => ({ type: 'note-check', noteId, text, nth: 0, pos: 0 });
  const ts = [
    { id: 'a', due: { date: '2026-11-12' }, source: src('n1', '卵') },
    { id: 'b', due: { date: '2026-11-14' }, source: src('n1', '牛乳') }, // 単独で 14 日へ動かしてある
    { id: 'c', due: { date: '2026-11-12', time: '18:00' }, source: src('n1', 'パン') },
    { id: 'd', due: { date: '2026-11-12' }, source: src('n2', '別のノート') },
    { id: 'e', due: { date: '2026-11-12' } },
  ];
  assert.deepEqual(tasksFollowingNote(ts, 'n1', '2026-11-12', '2026-11-16'), [
    { id: 'a', due: { date: '2026-11-16' }, prev: { date: '2026-11-12' } },
    { id: 'c', due: { date: '2026-11-16', time: '18:00' }, prev: { date: '2026-11-12', time: '18:00' } },
  ]);
  assert.deepEqual(tasksFollowingNote(ts, 'n1', '2026-11-12', '2026-11-12'), []); // 同じ日: 何もしない
  assert.deepEqual(tasksFollowingNote(ts, 'n1', '2026-11-12', null), []); // 日付を外す: タスクは動かさない
});
test('予定の移動は日付の部分だけ（時刻の文字列は保つ・複数日は長さを保つ・同じ日は計画を作らない）', () => {
  assert.deepEqual(shiftTimes({ start: '2026-11-12T09:00', end: '2026-11-12T10:00' }, '2026-11-12', '2026-11-14'), { start: '2026-11-14T09:00', end: '2026-11-14T10:00' });
  assert.deepEqual(shiftTimes({ start: '2026-11-11T00:00', end: '2026-11-13T23:59' }, '2026-11-12', '2026-11-14'), { start: '2026-11-13T00:00', end: '2026-11-15T23:59' }); // 中日からつかんでも差を開始へ足す
  assert.equal(moveTimes({ start: '2026-11-12T00:00', end: '2026-11-12T23:59', all: true }, '2026-11-14').note, null);
  const p = { id: 'e1', title: '会議', categoryId: 'work', all: false, start: '2026-11-12T09:00', end: '2026-11-12T10:00', place: '', notes: '', recurrence: null };
  assert.equal(planMoveDuo(p, p, null, '2026-11-12', () => 'x'), null);
  assert.deepEqual(planMoveDuo(p, p, null, '2026-11-14', () => 'x').after, { start: '2026-11-14T09:00', end: '2026-11-14T10:00' });
});
