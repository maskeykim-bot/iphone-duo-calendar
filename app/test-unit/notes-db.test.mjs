import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';

let n = 0;
async function fresh() { globalThis.indexedDB = new IDBFactory(); const m = await import(`../js/db.js?nd${n++}`); m.configure(`nd${n}`); return m; }
const DAY = 86400000;

test('note の保存・取得・題名の再生成・一覧は更新の新しい順', async () => {
  const m = await fresh();
  await m.putNote({ id: 'a', body: '# 一\n本文', createdAt: 1, updatedAt: 10 });
  await m.putNote({ id: 'b', body: '二', createdAt: 1, updatedAt: 20, title: '偽' });
  assert.equal((await m.getNote('a')).title, '一');
  assert.equal((await m.getNote('b')).title, '二');
  assert.deepEqual((await m.listNotes()).map((x) => x.id), ['b', 'a']);
  await assert.rejects(m.putNote({ id: 'c', body: 'x'.repeat(100001) }));
  assert.equal(await m.getNote('c'), null);
  // 移行で足した見出し分は別枠
  await m.putNote({ id: 'd', body: `2026年1月1日（木）\n${'x'.repeat(100000)}`, sourceHeading: true, sourceDate: '2026-01-01' });
});

test('削除は deletedAt のみ。30日以内は回復、過ぎたら整理で消える（他は消えない）', async () => {
  const m = await fresh();
  await m.putNote({ id: 'a', body: 'A', updatedAt: 5 }); await m.putNote({ id: 'b', body: 'B', updatedAt: 6 });
  const t0 = 1000 * DAY;
  await m.trashNote('a', t0);
  assert.deepEqual((await m.listNotes()).map((x) => x.id), ['b']);
  assert.equal((await m.listNotes({ includeDeleted: true })).length, 2);
  assert.deepEqual((await m.listTrashedNotes(t0 + DAY)).map((x) => x.id), ['a']);
  assert.equal((await m.getNote('a')).updatedAt, 5);
  assert.equal((await m.restoreNote('a', t0 + 30 * DAY)).deletedAt, null);
  await m.trashNote('a', t0);
  assert.equal(await m.restoreNote('a', t0 + 30 * DAY + 1), null);
  assert.equal(await m.purgeTrashedNotes(t0 + 30 * DAY), 0);
  assert.equal(await m.purgeTrashedNotes(t0 + 30 * DAY + 1), 1);
  assert.equal(await m.getNote('a'), null); assert.ok(await m.getNote('b'));
});

test('folder：名前30字・100件まで・同名可。削除で中のノートは folderId=null（updatedAt保持）', async () => {
  const m = await fresh();
  await m.putFolder({ id: 'f1', name: '家', order: 1 }); await m.putFolder({ id: 'f2', name: '家', order: 2 });
  assert.deepEqual((await m.listFolders()).map((f) => f.id), ['f1', 'f2']);
  await assert.rejects(m.putFolder({ id: 'x', name: 'あ'.repeat(31) }));
  await m.putFolder({ id: 'x', name: 'あ'.repeat(30) });
  await m.putNote({ id: 'n1', body: '1', folderId: 'f1', updatedAt: 111 }); await m.putNote({ id: 'n2', body: '2', folderId: 'f2', updatedAt: 222 });
  assert.equal(await m.deleteFolder('f1'), 1);
  const n1 = await m.getNote('n1');
  assert.equal(n1.folderId, null); assert.equal(n1.updatedAt, 111); assert.equal(n1.body, '1');
  assert.equal((await m.getNote('n2')).folderId, 'f2');
  assert.deepEqual((await m.listFolders()).map((f) => f.id), ['x', 'f2']);
  // 100件目まで
  for (let i = 0; i < 98; i++) await m.putFolder({ id: `g${i}`, name: `g${i}`, order: 10 + i });
  assert.equal((await m.listFolders()).length, 100);
  await assert.rejects(m.putFolder({ id: 'over', name: 'over' }));
  await m.putFolder({ id: 'g0', name: '改名' }); // 既存の改名は可
  assert.equal((await m.listFolders()).length, 100);
});
