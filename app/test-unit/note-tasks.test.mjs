// 第19.3版 その2 F: ノートのチェック行とタスクのつながり（行の識別・段取り）の純粋関数
import test from 'node:test';
import assert from 'node:assert/strict';
import { validSource, checkKeys, matchLines, planNoteSync, lineOfSource, tasksFollowingNote, baselineOf, isNoteTask, SOURCE_TYPE } from '../js/note-tasks.js';

const N = 'note-1', D = '2026-11-12';
const src = (text, nth, pos, noteId = N) => ({ type: SOURCE_TYPE, noteId, text, nth, pos });
const task = (id, title, s, done = false, due = { date: D }) => ({ id, title, done, due, source: s });

test('validSource: 形が合うものだけ通し、既知の項目だけにする', () => {
  assert.deepEqual(validSource({ ...src('牛乳', 0, 1), extra: 1 }), src('牛乳', 0, 1));
  for (const bad of [null, {}, { type: 'x', noteId: N, text: 'a', nth: 0, pos: 0 }, src('a', -1, 0), src('a', 0, 1.5), { ...src('a', 0, 0), noteId: '' }, { ...src('a', 0, 0), text: 3 }]) assert.equal(validSource(bad), null);
  assert.equal(isNoteTask({ source: src('a', 0, 0) }, N), true);
  assert.equal(isNoteTask({ source: src('a', 0, 0) }, 'other'), false);
  assert.equal(isNoteTask({}), false);
});

test('checkKeys: チェック行だけ。字下げと記号を除いた文字・同じ文字の順（nth）・チェック行の順（pos）', () => {
  const body = '買い物\n- [ ] 牛乳\n- 箇条書き\n  - [x] 卵\n- [ ] 牛乳\n本文\n- [ ] ';
  assert.deepEqual(checkKeys(body), [
    { index: 1, checked: false, text: '牛乳', nth: 0, pos: 0 },
    { index: 3, checked: true, text: '卵', nth: 0, pos: 1 },
    { index: 4, checked: false, text: '牛乳', nth: 1, pos: 2 },
    { index: 6, checked: false, text: '', nth: 0, pos: 3 },
  ]);
  assert.deepEqual(baselineOf(body), ['牛乳', '卵', '牛乳', '']);
});

test('新しい行: 日付のあるノートで、控え（baseline）に無い行だけタスクにする。期限はノートの日付（時刻なし）', () => {
  const p = planNoteSync({ noteId: N, body: '買い物\n- [ ] 牛乳\n- [x] 卵', date: D, links: [], baseline: [] });
  assert.deepEqual(p.create, [
    { title: '牛乳', done: false, due: { date: D }, source: src('牛乳', 0, 0) },
    { title: '卵', done: true, due: { date: D }, source: src('卵', 0, 1) },
  ]);
  assert.deepEqual(p.update, []); assert.deepEqual(p.unlink, []); assert.deepEqual(p.baseline, ['牛乳', '卵']);
});

test('日付のないノート・控えのない突き合わせ（起動・保存済みの行）・空の行からは作らない', () => {
  const body = '- [ ] 牛乳\n- [ ] \n- [ ] ｇｙ';
  assert.deepEqual(planNoteSync({ noteId: N, body, date: null, links: [], baseline: [] }).create, []);
  assert.deepEqual(planNoteSync({ noteId: N, body, date: D, links: [], baseline: null }).create, []);
  assert.deepEqual(planNoteSync({ noteId: N, body, date: D, links: [], baseline: [] }).create.map((c) => c.title), ['牛乳', 'ｇｙ']);
  // 前からあった行（保存済みのごみの行を含む）は控えにあるので作らない。足した行だけ作る
  const p = planNoteSync({ noteId: N, body: `${body}\n- [ ] パン`, date: D, links: [], baseline: baselineOf(body) });
  assert.deepEqual(p.create.map((c) => c.title), ['パン']);
});

test('二重に足さない: 同じ本文を何度突き合わせても、つながったあとは作らない', () => {
  const body = '- [ ] 牛乳\n- [ ] 卵';
  const p1 = planNoteSync({ noteId: N, body, date: D, links: [], baseline: [] });
  const links = p1.create.map((c, i) => task(`t${i}`, c.title, c.source, c.done));
  for (let i = 0; i < 3; i++) { const p = planNoteSync({ noteId: N, body, date: D, links, baseline: p1.baseline }); assert.deepEqual([p.create, p.update, p.unlink], [[], [], []]); }
});

test('似た題名・同じ題名の行が 2 本: タスクも 2 件。順でつなぎ、混線しない', () => {
  const body = '- [ ] 牛乳\n- [ ] 牛乳\n- [ ] 牛乳パック';
  const p = planNoteSync({ noteId: N, body, date: D, links: [], baseline: [] });
  assert.deepEqual(p.create.map((c) => [c.title, c.source.nth, c.source.pos]), [['牛乳', 0, 0], ['牛乳', 1, 1], ['牛乳パック', 0, 2]]);
  const links = p.create.map((c, i) => task(`t${i}`, c.title, c.source));
  // 2 本目の牛乳だけチェック → t1 だけ完了
  const q = planNoteSync({ noteId: N, body: '- [ ] 牛乳\n- [x] 牛乳\n- [ ] 牛乳パック', date: D, links, baseline: p.baseline });
  assert.deepEqual(q.update, [{ id: 't1', patch: { done: true } }]); assert.deepEqual(q.create, []);
});

test('行の文字を直す: 同じ位置でつなぎ直し、タスクの題名が直る。空にした行はつながったまま題名は前のまま', () => {
  const links = [task('a', '牛乳', src('牛乳', 0, 0)), task('b', '卵', src('卵', 0, 1))];
  const p = planNoteSync({ noteId: N, body: '- [ ] 牛乳 2本\n- [ ] 卵', date: D, links, baseline: ['牛乳', '卵'] });
  assert.deepEqual(p.update, [{ id: 'a', patch: { title: '牛乳 2本', source: src('牛乳 2本', 0, 0) } }]);
  assert.deepEqual([p.create, p.unlink], [[], []]);
  const e = planNoteSync({ noteId: N, body: '- [ ] \n- [ ] 卵', date: D, links, baseline: ['牛乳', '卵'] });
  assert.deepEqual([e.create, e.update, e.unlink], [[], [], []]);
});

test('行を足す・並べ替える・チェックで下へ移る: 文字でつなぐので題名もつながりも入れ替わらない（pos だけ直る）', () => {
  const links = [task('a', '牛乳', src('牛乳', 0, 0)), task('b', '卵', src('卵', 0, 1))];
  const p = planNoteSync({ noteId: N, body: '- [ ] パン\n- [ ] 卵\n- [x] 牛乳', date: D, links, baseline: ['牛乳', '卵'] });
  assert.deepEqual(p.create.map((c) => c.title), ['パン']);
  assert.deepEqual(p.update, [{ id: 'a', patch: { done: true, source: src('牛乳', 0, 2) } }]);
  assert.deepEqual(p.unlink, []);
});

test('行を消す・普通の行に戻す: タスクは消さず、つながりだけ外す', () => {
  const links = [task('a', '牛乳', src('牛乳', 0, 0)), task('b', '卵', src('卵', 0, 1)), task('c', 'パン', src('パン', 0, 2))];
  const p = planNoteSync({ noteId: N, body: '- [ ] 牛乳\n卵\n', date: D, links, baseline: ['牛乳', '卵', 'パン'] });
  assert.deepEqual(p.unlink.sort(), ['b', 'c']); assert.deepEqual(p.create, []); assert.deepEqual(p.update, []);
  // 外したあと、同じ文字の行をもう一度チェックにすると新しい行として作る（前のタスクには戻さない）
  const q = planNoteSync({ noteId: N, body: '- [ ] 牛乳\n- [ ] 卵', date: D, links: [links[0]], baseline: p.baseline });
  assert.deepEqual(q.create.map((c) => c.title), ['卵']);
});

test('限界の記録: 文字を変えるのと行を足すのを 1 回の保存で同時にすると、つながりが切れる（タスクは消さず、別のタスクの題名も書き換えない）', () => {
  const links = [task('a', '牛乳', src('牛乳', 0, 0)), task('b', '卵', src('卵', 0, 1))];
  // 先頭に 2 行足し、同時に「卵」を「たまご」に変えた: 牛乳は文字でつながる。卵は行の数が変わったので位置ではつながず、つながりを外す（タスク「卵」は残る）。たまご・新1・新2 は新しいタスク
  const p = planNoteSync({ noteId: N, body: '- [ ] 新1\n- [ ] 新2\n- [ ] 牛乳\n- [ ] たまご', date: D, links, baseline: ['牛乳', '卵'] });
  assert.deepEqual(p.unlink, ['b']);
  assert.deepEqual(p.update, [{ id: 'a', patch: { source: src('牛乳', 0, 2) } }]);
  assert.deepEqual(p.create.map((c) => c.title), ['新1', '新2', 'たまご']);
  // 1 行だけ足して同時に 1 行だけ直したときは、残りが 1 対 1 でないので同じく外す。行を足さずに直しただけなら位置でつながる（上の試験）
  // 同じ文字の行どうしの入れ替えは見分けられない（どちらも同じ題名なので結果は同じ）
  const same = [task('x', '牛乳', src('牛乳', 0, 0)), task('y', '牛乳', src('牛乳', 1, 1))];
  const q = planNoteSync({ noteId: N, body: '- [ ] 牛乳\n- [ ] 牛乳', date: D, links: same, baseline: ['牛乳', '牛乳'] });
  assert.deepEqual([q.create, q.update, q.unlink], [[], [], []]);
});

test('ほかのノートを指すタスク・つながりのないタスクは見ない', () => {
  const links = [task('o', '牛乳', src('牛乳', 0, 0, 'other')), { id: 'p', title: '牛乳', done: false, due: { date: D } }];
  const p = planNoteSync({ noteId: N, body: '- [ ] 牛乳', date: D, links, baseline: ['牛乳'] });
  assert.deepEqual([p.create, p.update, p.unlink], [[], [], []]);
});

test('タスク → ノート: つながった行の番号と今のチェック。行が無ければ null', () => {
  const body = '買い物\n- [ ] 牛乳\n- [x] 牛乳\n- [ ] 卵';
  assert.deepEqual(lineOfSource(body, src('牛乳', 1, 1)), { index: 2, checked: true });
  assert.deepEqual(lineOfSource(body, src('卵', 0, 9)), { index: 3, checked: false });
  assert.deepEqual(lineOfSource(body, src('牛乳', 5, 0)), { index: 1, checked: false }); // nth が合わなければ同じ文字の最初の行
  assert.equal(lineOfSource(body, src('パン', 0, 0)), null);
  assert.equal(lineOfSource(body, null), null);
});

test('ノートを動かしたとき: 期限がまだノートの元の日付と同じ、つながったタスクだけ動かす（時刻はそのまま）', () => {
  const ts = [task('a', '牛乳', src('牛乳', 0, 0)), task('b', '卵', src('卵', 0, 1), false, { date: '2026-11-14' }), task('c', 'パン', src('パン', 0, 2), false, { date: D, time: '18:00' }), task('d', '別', src('別', 0, 0, 'other')), { id: 'e', title: 'ふつう', due: { date: D } }, task('f', '期限なし', src('期限なし', 0, 3), false, null)];
  assert.deepEqual(tasksFollowingNote(ts, N, D, '2026-11-16'), [
    { id: 'a', due: { date: '2026-11-16' }, prev: { date: D } },
    { id: 'c', due: { date: '2026-11-16', time: '18:00' }, prev: { date: D, time: '18:00' } },
  ]);
  assert.deepEqual(tasksFollowingNote(ts, N, D, D), []);
  assert.deepEqual(tasksFollowingNote(ts, N, null, D), []);
});
