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

test('patchNote：分類だけ直し、本文・updatedAt は保つ。pin は pinnedAt を付け、外すと null', async () => {
  const m = await fresh();
  await m.putNote({ id: 'a', body: 'A', updatedAt: 50, folderId: null });
  const p = await m.patchNote('a', { pinned: true, pinnedAt: 777 });
  assert.equal(p.pinned, true); assert.equal(p.pinnedAt, 777); assert.equal(p.updatedAt, 50); assert.equal(p.body, 'A');
  const q = await m.patchNote('a', { folderId: 'f1' });
  assert.equal(q.folderId, 'f1'); assert.equal(q.pinned, true);
  const r = await m.patchNote('a', { pinned: false });
  assert.equal(r.pinnedAt, null); assert.equal(r.updatedAt, 50);
  assert.equal(await m.patchNote('zz', { pinned: true }), null);
});

test('reorderFolders：指定順に振り直す。ids に無いものは後ろ', async () => {
  const m = await fresh();
  await m.putFolder({ id: 'f1', name: 'A', order: 0 }); await m.putFolder({ id: 'f2', name: 'B', order: 1 }); await m.putFolder({ id: 'f3', name: 'C', order: 2 });
  await m.reorderFolders(['f3', 'f1']);
  assert.deepEqual((await m.listFolders()).map((f) => f.id), ['f3', 'f1', 'f2']);
});

test('folderOps：作成・改名・移動・削除（中のノートは folderId=null、本文・updatedAt 保持）。名前の検証と100件', async () => {
  const m = await fresh();
  const { createFolderOps, groupNotes, filterByFolder } = await import('../js/notes.js');
  let n = 0; const ops = createFolderOps({ db: m, uuid: () => `id${++n}`, now: () => 1000 + n });
  assert.ok((await ops.create('   ')).error); assert.ok((await ops.create('あ'.repeat(31))).error);
  const a = (await ops.create(' 家 ')).folder, b = (await ops.create('家')).folder; // 同名可
  assert.equal(a.name, '家'); assert.notEqual(a.id, b.id); assert.ok(b.order > a.order);
  assert.equal((await ops.rename(a.id, '仕事')).folder.name, '仕事');
  assert.ok((await ops.rename(a.id, '')).error);
  assert.equal((await ops.move(b.id, -1)).moved, true);
  assert.deepEqual((await m.listFolders()).map((f) => f.id), [b.id, a.id]);
  assert.equal((await ops.move(b.id, -1)).moved, false);
  await m.putNote({ id: 'n1', body: '1', folderId: a.id, updatedAt: 9 });
  assert.equal((await ops.remove(a.id)).moved, 1);
  const n1 = await m.getNote('n1'); assert.equal(n1.folderId, null); assert.equal(n1.updatedAt, 9); assert.equal(n1.body, '1');
  for (let i = 0; i < 99; i++) assert.ok((await ops.create(`f${i}`)).folder);
  assert.equal((await m.listFolders()).length, 100);
  assert.ok((await ops.create('101')).error);
  // 並べ: ピンは pinnedAt 降順 → updatedAt 降順
  const g = groupNotes([{ id: 'x', updatedAt: 1, pinned: true, pinnedAt: 5 }, { id: 'y', updatedAt: 9, pinned: true, pinnedAt: 5 }, { id: 'z', updatedAt: 3, pinned: true, pinnedAt: 8 }, { id: 'w', updatedAt: 2 }, { id: 'v', updatedAt: 4 }]);
  assert.deepEqual(g.pinned.map((x) => x.id), ['z', 'y', 'x']); assert.deepEqual(g.others.map((x) => x.id), ['v', 'w']);
  assert.deepEqual(filterByFolder([{ id: 'p', folderId: 'gone' }, { id: 'q', folderId: 'f' }, { id: 'r', folderId: null }], 'none', [{ id: 'f' }]).map((x) => x.id), ['p', 'r']);
});

test('PR1: date の正規化と patchNote（本文・updatedAt は不変、sourceDate は残る）', async () => {
  const m = await fresh();
  await m.putNote({ id: 'a', body: 'x', sourceDate: '2026-03-04', createdAt: 1, updatedAt: 10 });
  assert.equal((await m.getNote('a')).date, '2026-03-04');
  await m.putNote({ id: 'b', body: 'x', sourceDate: '2026-03-04', date: null, createdAt: 1, updatedAt: 10 });
  assert.equal((await m.getNote('b')).date, null);
  await m.putNote({ id: 'c', body: 'x', date: 'bad', createdAt: 1, updatedAt: 10 });
  assert.equal((await m.getNote('c')).date, null);
  const r = await m.patchNote('b', { date: '2026-05-06' });
  assert.equal(r.date, '2026-05-06'); assert.equal(r.updatedAt, 10); assert.equal(r.body, 'x'); assert.equal(r.sourceDate, '2026-03-04');
  assert.equal((await m.patchNote('b', { date: null })).date, null);
  assert.equal((await m.getNote('b')).sourceDate, '2026-03-04');
});
