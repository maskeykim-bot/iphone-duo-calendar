import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { makeLegacyMemos, digestOf, FINGERPRINT_3008 } from './fixtures/notes/legacy-memos.mjs';
import { createV4Db, readAll } from './fixtures/notes/v4-legacy.mjs';
import { memoTextOf, DAILY_ID } from '../js/notes-model.js';

let n = 0;
const NOW = Date.UTC(2026, 10, 17, 3, 0);
async function fresh(memos, { v5 = true } = {}) {
  globalThis.indexedDB = new IDBFactory();
  const name = `duo-calendar-nm${n++}`;
  if (memos) (await createV4Db(name, memos)).close();
  const m = await import(`../js/db.js?nm${n}`);
  m.configure(`nm${n - 1}`);
  if (v5) await m.listEvents();
  return { m, name };
}
const dumpAll = async (name, store) => { const d = await new Promise((r) => { const q = indexedDB.open(name); q.onsuccess = () => r(q.result); }); const out = await readAll(d, store); d.close(); return out; };
const sig = (notes) => digestOf(notes.map((x) => [x.sourceDate, memoTextOf(x)]));

test('3008件：コピー・控え不変・2回目は0件・フォルダ1つ', async () => {
  const memos = makeLegacyMemos();
  const { m, name } = await fresh(memos.map((x) => ({ ...x })));
  const before = JSON.stringify(await dumpAll(name, 'memos'));
  const r1 = await m.migrateNotesOnce(NOW);
  assert.deepEqual({ ...r1, at: 0 }, { seen: 3008, copied: 3008, existed: 0, blank: 0, folderCreated: true, at: 0 });
  const notes = await dumpAll(name, 'notes');
  assert.equal(notes.length, 3008);
  assert.equal(sig(notes), FINGERPRINT_3008);
  assert.equal(JSON.stringify(await dumpAll(name, 'memos')), before); // memos へ書かない
  const r2 = await m.migrateNotesOnce(NOW + 1);
  assert.equal(r2.copied, 0); assert.equal(r2.existed, 3008); assert.equal(r2.folderCreated, false);
  assert.equal((await dumpAll(name, 'folders')).length, 1);
  assert.equal((await dumpAll(name, 'notes')).length, 3008);
  assert.equal(JSON.stringify(await dumpAll(name, 'memos')), before);
  assert.deepEqual(await m.readNotesMigration(), r2);
});

test('0件・新規：フォルダを作らず印だけ', async () => {
  const { m, name } = await fresh();
  const r = await m.migrateNotesOnce(NOW);
  assert.deepEqual({ ...r, at: 0 }, { seen: 0, copied: 0, existed: 0, blank: 0, folderCreated: false, at: 0 });
  assert.equal((await dumpAll(name, 'folders')).length, 0);
});

test('空白だけのメモはblank。コピーも旧フォルダも作らない', async () => {
  const { m, name } = await fresh([{ id: '2026-01-01', date: '2026-01-01', text: ' \n　', createdAt: 1, updatedAt: 1, ink: null }]);
  const r = await m.migrateNotesOnce(NOW);
  assert.equal(r.blank, 1); assert.equal(r.copied, 0); assert.equal(r.folderCreated, false);
  assert.equal((await dumpAll(name, 'notes')).length, 0); assert.equal((await dumpAll(name, 'folders')).length, 0);
});

test('同ID既存のノートは上書きしない', async () => {
  const memos = makeLegacyMemos(5);
  const { m, name } = await fresh(memos.map((x) => ({ ...x })));
  const id = `memo-${memos[0].date}`;
  await m.putNote({ id, body: '編集済み', folderId: null, createdAt: 1, updatedAt: 2, sourceDate: memos[0].date });
  const r = await m.migrateNotesOnce(NOW);
  assert.equal(r.existed, 1); assert.equal(r.copied, memos.length - 1);
  assert.equal((await m.getNote(id)).body, '編集済み');
  assert.equal((await m.getNote(id)).folderId, null);
});

test('20件目でabort：notes・folder・印なし、memos不変、再試行で完走', async () => {
  const memos = makeLegacyMemos(40);
  const { m, name } = await fresh(memos.map((x) => ({ ...x })));
  await assert.rejects(m.migrateNotesOnce(NOW, { beforeCopy: (k) => { if (k === 20) throw new Error('boom'); } }));
  assert.equal((await dumpAll(name, 'notes')).length, 0);
  assert.equal((await dumpAll(name, 'folders')).length, 0);
  assert.equal(await m.readNotesMigration(), null);
  assert.equal((await dumpAll(name, 'memos')).length, memos.length);
  const r = await m.migrateNotesOnce(NOW);
  assert.equal(r.copied, memos.length); assert.equal((await dumpAll(name, 'notes')).length, memos.length);
});

test('容量失敗（putが例外）でも全体が巻き戻る', async () => {
  const { m, name } = await fresh(makeLegacyMemos(30));
  const orig = IDBObjectStore.prototype.put; let k = 0;
  IDBObjectStore.prototype.put = function (v) { if (this.name === 'notes' && ++k === 10) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, v); };
  try { await assert.rejects(m.migrateNotesOnce(NOW)); } finally { IDBObjectStore.prototype.put = orig; }
  assert.equal((await dumpAll(name, 'notes')).length, 0); assert.equal((await dumpAll(name, 'folders')).length, 0);
  assert.equal(await m.readNotesMigration(), null);
});

test('固定フォルダ：改名済みはそのまま使う／同名の別フォルダがあれば（2）で作る', async () => {
  const memos = makeLegacyMemos(3);
  let { m, name } = await fresh(memos.map((x) => ({ ...x })));
  await m.putFolder({ id: DAILY_ID, name: '仕事', order: 0 });
  let r = await m.migrateNotesOnce(NOW);
  assert.equal(r.folderCreated, false);
  assert.deepEqual((await dumpAll(name, 'folders')).map((f) => f.name), ['仕事']);
  ({ m, name } = await fresh(memos.map((x) => ({ ...x }))));
  await m.putFolder({ id: 'other', name: '日ごとのメモ', order: 0 });
  r = await m.migrateNotesOnce(NOW);
  assert.equal(r.folderCreated, true);
  const fs = await dumpAll(name, 'folders');
  assert.deepEqual(fs.map((f) => f.name).sort(), ['日ごとのメモ', '日ごとのメモ（2）'].sort());
  assert.ok(fs.some((f) => f.id === DAILY_ID));
});

test('試験版 v4→v5 upgrade 内で実行：成功で v5＋3008件、失敗は v4 のまま', async () => {
  globalThis.indexedDB = new IDBFactory();
  const memos = makeLegacyMemos();
  (await createV4Db('up', memos)).close();
  const m = await import('../js/db.js?up');
  const upgrade = (opts) => new Promise((res, rej) => {
    const q = indexedDB.open('up', 5);
    q.onupgradeneeded = () => {
      const d = q.result, tx = q.transaction;
      m.createV5Stores(d, tx);
      m.migrateNotesInTx({ memos: tx.objectStore('memos'), notes: tx.objectStore('notes'), folders: tx.objectStore('folders'), meta: tx.objectStore('meta') }, NOW, () => {}, opts);
    };
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
  await assert.rejects(upgrade({ beforeCopy: (k) => { if (k === 20) throw new Error('x'); } }));
  const v4 = await new Promise((r) => { const q = indexedDB.open('up'); q.onsuccess = () => { const v = q.result.version; const s = [...q.result.objectStoreNames]; q.result.close(); r({ v, s }); }; });
  assert.equal(v4.v, 4); assert.ok(!v4.s.includes('notes'));
  const d = await upgrade();
  assert.equal(d.version, 5);
  const notes = await readAll(d, 'notes');
  assert.equal(notes.length, 3008); assert.equal(sig(notes), FINGERPRINT_3008);
  assert.equal((await readAll(d, 'memos')).length, 3008);
  d.close();
});

test('既存v5（印なし）にもreadwriteで走る。deletedAt付きノートもコピー済み扱い', async () => {
  const memos = makeLegacyMemos(10);
  const { m, name } = await fresh(memos.map((x) => ({ ...x })));
  await m.putNote({ id: `memo-${memos[1].date}`, body: 'x', createdAt: 1, updatedAt: 1, deletedAt: 5, sourceDate: memos[1].date });
  const r = await m.migrateNotesOnce(NOW);
  assert.equal(r.existed, 1); // 削除済みを勝手に復活させない
  assert.notEqual((await m.getNote(`memo-${memos[1].date}`)).deletedAt, null);
});
