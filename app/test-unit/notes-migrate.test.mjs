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
  const m = await import(`../js/db.js?nm${n}`);
  m.configure(`nm${n - 1}`);
  if (memos) {
    (await createV4Db(name, memos)).close();
    // 途中版で既に v5（ストアだけ・変換なし・印なし）になっている端末。実 MIGRATIONS[5] は走らない。
    if (v5) await new Promise((res, rej) => { const q = indexedDB.open(name, 5); q.onupgradeneeded = () => m.createV5Stores(q.result, q.transaction); q.onsuccess = () => { q.result.close(); res(); }; q.onerror = () => rej(q.error); });
  } else if (v5) await m.listEvents();
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

// ---- 実 MIGRATIONS[5]（第16版 PR28）と起動時の共通移行 ----
test('実MIGRATIONS：v4→v5 の upgrade 内で3008件を変換。2回目の起動は増えない', async () => {
  const memos = makeLegacyMemos();
  const { m, name } = await fresh(memos.map((x) => ({ ...x })), { v5: false });
  const before = JSON.stringify(await dumpAll(name, 'memos'));
  await m.listEvents(); // ここで v4→v5
  const notes = await dumpAll(name, 'notes');
  assert.equal(notes.length, 3008); assert.equal(sig(notes), FINGERPRINT_3008);
  assert.equal(JSON.stringify(await dumpAll(name, 'memos')), before);
  const mk = await m.readNotesMigration();
  assert.equal(mk.copied, 3008); assert.equal(mk.folderCreated, true);
  assert.equal(await m.ensureNotesMigrated(), null); // 印あり → 何もしない
  assert.equal((await dumpAll(name, 'notes')).length, 3008); assert.equal((await dumpAll(name, 'folders')).length, 1);
});

test('実MIGRATIONS：旧メモ0件ならフォルダを作らない', async () => {
  const { m, name } = await fresh();
  assert.equal((await m.readNotesMigration()).seen, 0);
  assert.equal((await dumpAll(name, 'folders')).length, 0);
});

test('実MIGRATIONS：変換が失敗したら v4 のまま・元メモ不変。次の起動で成功する', async () => {
  const memos = makeLegacyMemos(30);
  const { m, name } = await fresh(memos.map((x) => ({ ...x })), { v5: false });
  const orig = IDBObjectStore.prototype.put; let k = 0;
  IDBObjectStore.prototype.put = function (v) { if (this.name === 'notes' && ++k === 10) throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, v); };
  try { await assert.rejects(m.listEvents()); } finally { IDBObjectStore.prototype.put = orig; }
  const info = await new Promise((r) => { const q = indexedDB.open(name); q.onsuccess = () => { const o = { v: q.result.version, s: [...q.result.objectStoreNames] }; q.result.close(); r(o); }; });
  assert.equal(info.v, 4); assert.ok(!info.s.includes('notes'));
  assert.equal((await dumpAll(name, 'memos')).length, memos.length);
  await m.listEvents();
  assert.equal((await dumpAll(name, 'notes')).length, memos.length);
});

test('起動時の共通移行：印の無い既存v5を1回だけ変換し、2回目は何もしない', async () => {
  const memos = makeLegacyMemos(12);
  const { m, name } = await fresh(memos.map((x) => ({ ...x })));
  assert.equal(await m.readNotesMigration(), null);
  const r = await m.ensureNotesMigrated(NOW);
  assert.equal(r.copied, memos.length);
  assert.equal(await m.ensureNotesMigrated(NOW), null);
  assert.equal((await dumpAll(name, 'notes')).length, memos.length);
});

// ---- 旧メモの下書きの取り込み ----
const D = (date, text, at) => ({ date, text, at });
test('旧下書き：DBより新しい分だけ。未編集の移行ノートは更新、編集済みは別保存（決定的）', async () => {
  const memos = makeLegacyMemos(6);
  const { m, name } = await fresh(memos.map((x) => ({ ...x })), { v5: false });
  await m.listEvents(); // 変換済み
  const [a, b, c] = memos;
  const newer = (x) => x.updatedAt + 1000;
  // a: 未編集 → 更新。b: ノートを編集済み → 別保存。c: 下書きがDBより古い → stale。
  await m.putNote({ ...(await m.getNote(`memo-${b.date}`)), body: '編集した本文', updatedAt: b.updatedAt + 500 });
  const r = await m.importMemoDrafts([D(a.date, '下書きA', newer(a)), D(b.date, '下書きB', newer(b)), D(c.date, '古い', c.updatedAt - 1)], NOW);
  assert.deepEqual(r.map((x) => x.result), ['updated', 'separate', 'stale']);
  const na = await m.getNote(`memo-${a.date}`);
  assert.ok(na.body.includes('下書きA')); assert.equal(na.updatedAt, newer(a));
  assert.equal((await m.getNote(`memo-${b.date}`)).body, '編集した本文');
  assert.ok((await m.getNote(`memo-${b.date}-draft`)).body.includes('下書きB'));
  assert.equal((await m.getNote(`memo-${c.date}`)).body.includes('古い'), false);
  // 再実行しても増えない／内容違いは別の決定的ID
  const again = await m.importMemoDrafts([D(b.date, '下書きB', newer(b))], NOW);
  assert.equal(again[0].result, 'same');
  const other = await m.importMemoDrafts([D(b.date, '下書きB2', newer(b) + 5)], NOW);
  assert.equal(other[0].result, 'separate');
  assert.equal((await dumpAll(name, 'notes')).filter((x) => x.id.startsWith(`memo-${b.date}-draft`)).length, 2);
  assert.equal(JSON.stringify(await dumpAll(name, 'memos')), JSON.stringify(memos.map((x) => x).sort((p, q) => (p.id < q.id ? -1 : 1))));
});

test('旧下書き：旧メモが無い日は新規ノート（固定フォルダ）。空白だけは取り込まない', async () => {
  const { m, name } = await fresh();
  const r = await m.importMemoDrafts([D('2026-11-10', '新しい日の下書き', 5), D('2026-11-11', ' \n ', 6)], NOW);
  assert.deepEqual(r.map((x) => x.result), ['created', 'blank']);
  const n = await m.getNote('memo-2026-11-10');
  assert.equal(n.folderId, DAILY_ID); assert.ok(n.body.includes('新しい日の下書き'));
  assert.equal((await dumpAll(name, 'folders')).length, 1);
});

test('新規端末：移行の印（notesMigrationV1）は「既存端末の証拠」に数えない', async () => {
  const { m } = await fresh();
  await m.setLastNote('x');
  assert.deepEqual(await m.readLegacyEvidence(), { events: 0, memos: 0, meta: 0, legacyCats: 0 });
});
