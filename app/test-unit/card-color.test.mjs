// v19.6（征希さん「タスクとノートも色を選べるようにする」・2026-11-25 承認）: タスク・ノートの任意の項目 colorId。版は 6 のまま
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTask, validateTaskPatch, rowOf } from '../js/tasks.js';
import { buildBackup, validateBackup as parseBackup, VERSION } from '../js/backup.js';
import { FLICK } from '../js/colors.js';

const C = FLICK[0].id, now = 1790000000000;
const T = (x = {}) => ({ id: 't1', title: 'タスク', due: null, done: false, doneAt: null, createdAt: now, updatedAt: now, order: 1, note: '', notify: false, ...x });
const N = (x = {}) => ({ id: 'n1', body: 'メモ', folderId: null, pinned: false, pinnedAt: null, createdAt: now, updatedAt: now, deletedAt: null, date: null, ...x });

test('タスク: 色なしは今までの形のまま（colorId の項目が増えない）。フリックの色の id だけ持つ', () => {
  assert.equal('colorId' in validateTask(T()).task, false);
  assert.equal(validateTask(T({ colorId: C })).task.colorId, C);
  for (const bad of ['', 'no-such-color', 3, null, {}]) assert.equal('colorId' in validateTask(T({ colorId: bad })).task, false, String(bad));
  assert.equal(rowOf(validateTask(T({ colorId: C })).task).colorId, C);
  assert.equal('colorId' in rowOf(validateTask(T()).task), false);
});

test('タスクの変更: colorId は フリックの色の id か null（外す）だけ受ける', () => {
  assert.equal(validateTaskPatch({ colorId: C }).ok, true);
  assert.equal(validateTaskPatch({ colorId: null }).ok, true);
  assert.equal(validateTaskPatch({ colorId: 'x' }).ok, false);
});

test('バックアップ: 版は 6 のまま。色を付けたタスク・ノートだけ colorId を書き、読み戻すと色が戻る。色なしは今までと同じ形', () => {
  const out = buildBackup([], {}, new Date(now), [], [], [T({ colorId: C }), T({ id: 't2', order: 2 })], [N({ colorId: C }), N({ id: 'n2' })], []);
  assert.equal(out.version, VERSION); assert.equal(VERSION, 6);
  assert.deepEqual(out.tasks.map((t) => t.colorId), [C, undefined]);
  assert.deepEqual(out.notes.map((n) => n.colorId), [C, undefined]);
  assert.equal(JSON.stringify(out.tasks[1]).includes('colorId'), false); assert.equal(JSON.stringify(out.notes[1]).includes('colorId'), false);
  const back = parseBackup(JSON.stringify(out));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data.tasks.map((t) => t.colorId), [C, undefined]);
  assert.deepEqual(back.data.notes.map((n) => n.colorId), [C, undefined]);
});

test('バックアップ: フリックの色でない colorId は読み戻さない（中身は読める）', () => {
  const out = buildBackup([], {}, new Date(now), [], [], [T()], [N()], []);
  out.tasks[0].colorId = 'bogus'; out.notes[0].colorId = 42;
  const back = parseBackup(JSON.stringify(out));
  assert.equal(back.ok, true);
  assert.equal('colorId' in back.data.tasks[0], false); assert.equal('colorId' in back.data.notes[0], false);
});
