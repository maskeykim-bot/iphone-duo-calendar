import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createNoteStore, DRAFT_PREFIX } from '../js/notes.js';

const mem = () => { const m = new Map(); return { quota: false, get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.has(k) ? m.get(k) : null, setItem(k, v) { if (this.quota) throw new Error('QuotaExceeded'); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) }; };
const fakeDb = () => { const rows = new Map(); const o = { rows, fail: false, gate: null, puts: [],
  getNote: async (id) => rows.get(id) ?? null,
  putNote: async (n) => { o.puts.push(n.body); if (o.gate) await o.gate; if (o.fail) throw new Error('x'); rows.set(id(n), { ...n }); return n; },
  trashNote: async (id2, t) => { const n = rows.get(id2); if (!n) return null; n.deletedAt = t; return n; },
  restoreNote: async (id2) => { const n = rows.get(id2); if (!n || n.deletedAt == null) return null; n.deletedAt = null; return n; },
  listTrashedNotes: async () => [...rows.values()].filter((n) => n.deletedAt != null) }; return o; };
const id = (n) => n.id;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('入力ごとに下書き、debounce 後に保存して下書きを消す。新規はUUID', async () => {
  const st = mem(), db = fakeDb(), s = createNoteStore({ db, storage: st, delay: 20 });
  const n = s.newNote();
  assert.match(n, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(db.rows.size, 0); // 空のうちは DB に書かない
  s.setText(n, 'a'); s.setText(n, 'ab');
  assert.equal(JSON.parse(st.getItem(DRAFT_PREFIX + n)).text, 'ab');
  await wait(60);
  assert.deepEqual(db.puts, ['ab']);
  assert.equal(db.rows.get(n).body, 'ab');
  assert.equal(st.getItem(DRAFT_PREFIX + n), null);
});
test('古い（遅い）save の ack が新しい下書きを消さない', async () => {
  const st = mem(), db = fakeDb(), s = createNoteStore({ db, storage: st, delay: 1000 });
  const n = s.newNote(); let open; db.gate = new Promise((r) => { open = r; });
  s.setText(n, 'a');
  const p = s.flushNote(n); await wait(5);
  s.setText(n, 'ab');
  db.gate = null; open(); await p;
  assert.ok(st.getItem(DRAFT_PREFIX + n)); assert.equal(s.dirty(n), true);
  await s.flushNote(n);
  assert.equal(db.rows.get(n).body, 'ab'); assert.equal(st.getItem(DRAFT_PREFIX + n), null);
});
test('DB 失敗は下書きを残して再試行できる。既存ノートのフォルダ・固定・作成日は保つ', async () => {
  const st = mem(), db = fakeDb(), s = createNoteStore({ db, storage: st });
  db.rows.set('x', { id: 'x', body: '古', folderId: 'f1', pinned: true, pinnedAt: 5, createdAt: 1, updatedAt: 2, deletedAt: null });
  await s.loadNote('x'); db.fail = true; s.setText('x', '新');
  assert.equal(await s.flushNote('x'), false);
  assert.ok(st.getItem(DRAFT_PREFIX + 'x')); assert.deepEqual(s.failedIds(), ['x']);
  db.fail = false; assert.equal(await s.flushNote('x'), true);
  const r = db.rows.get('x'); assert.equal(r.body, '新'); assert.equal(r.folderId, 'f1'); assert.equal(r.pinned, true); assert.equal(r.createdAt, 1);
  assert.equal(st.getItem(DRAFT_PREFIX + 'x'), null);
});
test('LS 容量不足: 保存は続き draftFailed が立つ（待たずに DB へ）', async () => {
  const st = mem(), db = fakeDb(), s = createNoteStore({ db, storage: st, delay: 5000 });
  const n = s.newNote(); st.quota = true; s.setText(n, 'zz');
  assert.equal(s.get(n).draftFailed, true);
  await wait(30);
  assert.equal(db.rows.get(n).body, 'zz');
});
test('空の作成途中は破棄、既存ノートは破棄しない。空白だけの新規は保存しない', async () => {
  const st = mem(), db = fakeDb(), s = createNoteStore({ db, storage: st });
  const n = s.newNote(); assert.equal(s.discardIfEmpty(n), true); assert.equal(s.get(n), null);
  const m = s.newNote(); s.setText(m, '  \n'); assert.equal(await s.flushNote(m), true);
  assert.equal(db.rows.size, 0); assert.equal(st.getItem(DRAFT_PREFIX + m), null);
  db.rows.set('k', { id: 'k', body: '本文', createdAt: 1, updatedAt: 2 });
  await s.loadNote('k'); assert.equal(s.discardIfEmpty('k'), false); assert.equal(db.rows.get('k').body, '本文');
  const f = s.newNote(); s.setText(f, 'x'); assert.equal(s.discardIfEmpty(f), false);
});
test('起動時の回復: DB より新しい下書きだけ入れ、古い・空の新規は捨て、失敗は残す', async () => {
  const st = mem(), db = fakeDb();
  db.rows.set('a', { id: 'a', body: 'db', createdAt: 1, updatedAt: 500 });
  st.setItem(DRAFT_PREFIX + 'a', JSON.stringify({ id: 'a', text: 'old', at: 100 }));
  st.setItem(DRAFT_PREFIX + 'b', JSON.stringify({ id: 'b', text: 'new', at: 100, createdAt: 77 }));
  st.setItem(DRAFT_PREFIX + 'c', JSON.stringify({ id: 'c', text: '', at: 100 }));
  st.setItem(DRAFT_PREFIX + 'd', 'not json');
  const s = createNoteStore({ db, storage: st });
  assert.deepEqual(await s.recoverNoteDrafts(), ['b']);
  assert.equal(db.rows.get('a').body, 'db'); assert.equal(db.rows.get('b').body, 'new'); assert.equal(db.rows.get('b').createdAt, 77);
  assert.equal(st.getItem(DRAFT_PREFIX + 'c'), null);
  assert.equal(st.getItem(DRAFT_PREFIX + 'd'), 'not json'); // 読めないものは触らない
  db.fail = true; st.setItem(DRAFT_PREFIX + 'e', JSON.stringify({ id: 'e', text: 'keep', at: 9 }));
  const s2 = createNoteStore({ db, storage: st });
  assert.deepEqual(await s2.recoverNoteDrafts(), ['e']);
  assert.ok(st.getItem(DRAFT_PREFIX + 'e')); assert.equal(s2.get('e').text, 'keep');
});
test('ノート別に直列化: 切り替えても各ノートの最後の文字が保存される', async () => {
  const db = fakeDb(), s = createNoteStore({ db, storage: mem() });
  const a = s.newNote(), b = s.newNote(); s.setText(a, 'A'); s.setText(b, 'B'); s.setText(a, 'A2');
  await s.flushAll();
  assert.equal(db.rows.get(a).body, 'A2'); assert.equal(db.rows.get(b).body, 'B');
});
test('削除は保存してから deletedAt、回復できる。保存失敗なら消さない', async () => {
  const db = fakeDb(), st = mem(), s = createNoteStore({ db, storage: st });
  const a = s.newNote(); s.setText(a, 'T');
  assert.ok((await s.trash(a)).deletedAt != null);
  assert.equal(db.rows.get(a).body, 'T');
  assert.equal((await s.listTrash()).length, 1);
  assert.equal((await s.restore(a)).deletedAt, null);
  s.setText(a, 'T2'); db.fail = true;
  assert.equal(await s.trash(a), false); assert.equal(db.rows.get(a).deletedAt, null);
});
test('実 db.js: 保存・題名・削除済みの印と本文を保つ', async () => {
  globalThis.indexedDB = new IDBFactory();
  const db = await import('../js/db.js?ns1'); db.configure('ns1');
  const s = createNoteStore({ db, storage: mem() });
  const n = s.newNote(); s.setText(n, '# 題名\n本文');
  await s.flushNote(n);
  assert.equal((await db.getNote(n)).title, '題名');
  const t = await s.trash(n); assert.ok(t.deletedAt);
  s.setText(n, '編集'); await s.flushNote(n);
  assert.ok((await db.getNote(n)).deletedAt != null, '削除印は保たれる');
});

test('splitBody/joinBody は元の文字列に戻る（CRLF・末尾改行・題名のみ）', async () => {
  globalThis.document = undefined;
  const { splitBody, joinBody, isCrlf } = await import('../js/notes-ui.js');
  for (const t of ['', '題', '題\n', '題\n本文\n行', '題\r\n本文\r\n', '\n先頭空行']) {
    const s = splitBody(t); const crlf = isCrlf(t);
    const rest = crlf ? s.rest.replace(/\r\n/g, '\n') : s.rest; // textarea は CR を落とす
    assert.equal(joinBody({ ...s, rest, crlf }), t);
  }
});
