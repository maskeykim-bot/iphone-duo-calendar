import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { buildBackup, validateBackup, planAppend, planNotes } from '../js/backup.js';
import { noteFromMemo, memoTextOf, ensureDailyFolder, DAILY_ID } from '../js/notes-model.js';
import { makeLegacyMemos, digestOf, FINGERPRINT_3008 } from './fixtures/notes/legacy-memos.mjs';
import { validateBackupV4 } from './fixtures/notes/v4-legacy.mjs';

const NOW = new Date(2026, 10, 17, 12, 0);
const sig = (notes) => digestOf(notes.map((x) => [x.sourceDate, memoTextOf(x)]));
let n = 0;
async function fresh() {
  globalThis.indexedDB = new IDBFactory();
  const m = await import(`../js/db.js?nb${n++}`);
  m.configure(`nb${n}`);
  await m.listEvents();
  return m;
}
const home = { id: 'folder-home', name: '家', order: 1, createdAt: 5, updatedAt: 6 };
function corpus() {
  const notes = makeLegacyMemos().map((x) => noteFromMemo(x));
  const { folder } = ensureDailyFolder([], 7);
  notes[0] = { ...notes[0], pinned: true, pinnedAt: 100 };
  notes[1] = { ...notes[1], pinned: true, pinnedAt: 200, folderId: 'folder-home' };
  notes[2] = { ...notes[2], deletedAt: 999 };
  notes[3] = { ...notes[3], ink: { strokes: [[1, 2], [3, 4]] } };
  notes.push({ id: 'free-1', body: '自由ノート\n本文', title: '', folderId: 'folder-home', pinned: false, pinnedAt: null, createdAt: 1, updatedAt: 2, deletedAt: null });
  return { notes, folders: [folder, home] };
}
const file = (extra) => JSON.stringify({ app: 'duo-calendar', version: 5, exportedAt: '2026-11-17T12:00:00+09:00', events: [], ...extra });
const ev = (id) => ({ id, title: 't', all: false, start: '2026-11-20T10:00', end: '2026-11-20T11:00', categoryId: 'c-work', place: '', notes: '', recurrence: null, exdates: [], overrides: {}, updatedAt: 1 });

test('NT-1②：3008+件を本物の build/validate/applyImport で往復（全項目・フォルダ・ピン・削除・ink）', async () => {
  const { notes, folders } = corpus();
  const text = JSON.stringify(buildBackup([], {}, NOW, [], [], [], notes, folders));
  const o = JSON.parse(text);
  assert.equal(o.memos, undefined); assert.ok(o.notes.length === 3009); assert.equal(o.notes[0].title, undefined);
  const v = validateBackup(text);
  assert.equal(v.ok, true);
  const plan = planNotes([], v.data.notes, [], v.data.folders, true);
  const m = await fresh();
  await m.applyImport({ replace: true, notePuts: plan.notePuts, noteReplace: plan.noteReplace, folderPuts: plan.folderPuts, folderReplace: plan.folderReplace });
  const got = await m.listNotes({ includeDeleted: true });
  assert.equal(got.length, 3009);
  const legacy = got.filter((x) => x.id.startsWith('memo-'));
  assert.equal(sig(legacy), FINGERPRINT_3008);
  const by = Object.fromEntries(got.map((x) => [x.id, x]));
  for (const src of notes) {
    const g = by[src.id];
    for (const k of ['body', 'folderId', 'pinned', 'pinnedAt', 'createdAt', 'updatedAt', 'deletedAt', 'sourceDate', 'sourceHeading', 'sourceOriginalFirstLine', 'ink']) assert.deepEqual(g[k] ?? (k === 'sourceHeading' ? false : undefined), src[k] ?? (k === 'sourceHeading' ? false : undefined), `${src.id}.${k}`);
  }
  assert.equal(got.filter((x) => x.pinned).length, 2);
  assert.deepEqual((await m.listFolders()).map((f) => f.name), ['日ごとのメモ', '家']);
  assert.equal(by['free-1'].title, '自由ノート');
});

test('100000字の旧メモ（移行見出し付き）が拒否されず往復する', () => {
  const big = noteFromMemo({ date: '2026-11-17', text: 'x'.repeat(100000), createdAt: 1, updatedAt: 2, ink: null });
  assert.equal(big.sourceHeading, true);
  const v = validateBackup(JSON.stringify(buildBackup([], {}, NOW, [], [], [], [big], [])));
  assert.equal(v.ok, true); assert.equal(memoTextOf(v.data.notes[0]), 'x'.repeat(100000));
  const tooBig = { ...big, sourceHeading: false, body: 'y'.repeat(100001) };
  assert.equal(validateBackup(file({ notes: [tooBig] })).ok, false);
});

test('欠落・明示[]・folders 欠落の扱い（置換）', () => {
  const { notes, folders } = corpus();
  const cn = notes.slice(0, 3), cf = folders;
  assert.deepEqual(planNotes(cn, null, cf, null, true), planNotes(cn, null, cf, null, false)); // 何もしない
  const none = planNotes(cn, null, cf, null, true);
  assert.equal(none.noteReplace, false); assert.equal(none.folderReplace, false);
  const empty = planNotes(cn, [], cf, [], true);
  assert.equal(empty.noteReplace, true); assert.equal(empty.folderReplace, true); assert.equal(empty.notePuts.length, 0);
  const incoming = validateBackup(file({ notes: [{ ...notes[1] }, { ...notes[2], folderId: 'gone' }] })).data.notes;
  const keep = planNotes(cn, incoming, cf, null, true); // folders 欠落 → 既存folderを保持して解決
  assert.equal(keep.folderReplace, false);
  assert.equal(keep.notePuts[0].folderId, 'folder-home'); assert.equal(keep.notePuts[1].folderId, null); assert.equal(keep.orphaned, 1);
  const repl = planNotes(cn, incoming, cf, [], true); // folders [] → 置換後は存在しない → null
  assert.equal(repl.notePuts[0].folderId, null);
});

test('追加：同ID同内容は無操作、異内容は既存保持＋決定的な別ID、再取込で増えない、folderは現在名を保持', () => {
  const { notes, folders } = corpus();
  const cur = [notes[4], notes[5]];
  const edited = { ...notes[4], body: '編集後', updatedAt: 9 };
  const fresh1 = { ...notes[6] };
  const p1 = planNotes(cur, [notes[4], edited, fresh1], [{ ...folders[0], name: '改名済' }], folders, false);
  assert.equal(p1.same, 1); assert.equal(p1.added, 2); assert.equal(p1.renamed, 1);
  assert.equal(p1.folderPuts.length, 1); assert.equal(p1.folderPuts[0].id, 'folder-home'); assert.equal(p1.foldersSame, 1);
  const renamedId = p1.notePuts.find((x) => x.body === '編集後').id;
  assert.match(renamedId, /^memo-.*-i/);
  const after = [...cur, ...p1.notePuts];
  const p2 = planNotes(after, [notes[4], edited, fresh1], folders, folders, false);
  assert.equal(p2.added, 0); assert.equal(p2.same, 3);
  assert.equal(planNotes(cur, [edited], folders, null, false).notePuts[0].id, renamedId); // 決定的
  assert.deepEqual(planAppend([ev('a')], [ev('a')], [], [], [], [], cur, [notes[4]], folders, null).note.same, 1);
});

test('不正1件で全体拒否・件数に上限なし', () => {
  const good = { id: 'a', body: 'x', createdAt: 1, updatedAt: 2 };
  for (const bad of [{ ...good, id: '' }, { ...good, body: 5 }, { ...good, createdAt: -1 }, { ...good, pinned: 'y' }, { ...good, sourceDate: '2026-13-40' }, { ...good, folderId: 5 }, 7]) {
    assert.equal(validateBackup(file({ notes: [good, bad] })).ok, false);
  }
  assert.equal(validateBackup(file({ notes: [good, good] })).ok, false);
  assert.equal(validateBackup(file({ folders: [{ ...home, name: '' }] })).ok, false);
  assert.equal(validateBackup(file({ folders: [{ ...home, name: 'あ'.repeat(31) }] })).ok, false);
  assert.equal(validateBackup(file({ folders: [home, home] })).ok, false);
  assert.equal(validateBackup(file({ folders: Array.from({ length: 101 }, (_, i) => ({ ...home, id: `f${i}` })) })).ok, false);
  const many = Array.from({ length: 41000 }, (_, i) => ({ id: `n${i}`, body: `b${i}`, createdAt: 1, updatedAt: 2 }));
  assert.equal(validateBackup(file({ notes: many })).data.notes.length, 41000);
  assert.equal(validateBackup(file({ version: 4, notes: [{ bad: 1 }] }).replace('"version":5', '"version":4')).ok, true); // 旧版の notes 項目は読まない
});

test('旧v4 validator はノート付き v5 を丸ごと拒否する', () => {
  const { notes, folders } = corpus();
  const r = validateBackupV4(JSON.stringify(buildBackup([], {}, NOW, [], [], [], notes.slice(0, 3), folders)));
  assert.equal(r.ok, false);
});

test('既定（notes 未指定）は従来どおり memos+tasks を出し notes/folders を出さない', () => {
  const o = buildBackup([], {}, NOW, [], [{ date: '2026-11-17', text: 'a', createdAt: 1, updatedAt: 2 }], []);
  assert.ok(o.memos); assert.equal(o.notes, undefined); assert.equal(o.folders, undefined);
});

test('tx 失敗で予定・タスク・ノート・フォルダ・outbox 全体が rollback', async () => {
  const m = await fresh();
  await m.applyImport({ eventPuts: [ev('e0')], notePuts: [{ id: 'keep', body: '残る', createdAt: 1, updatedAt: 2 }], folderPuts: [home] });
  const { notes } = corpus();
  const orig = IDBObjectStore.prototype.put; let c = 0;
  IDBObjectStore.prototype.put = function (...a) { if (this.name === 'notes' && ++c === 5) throw new Error('quota'); return orig.apply(this, a); };
  try {
    await assert.rejects(m.applyImport({ replace: true, eventPuts: [ev('e1')], noteReplace: true, notePuts: notes.slice(0, 10), folderReplace: true, folderPuts: [] }));
  } finally { IDBObjectStore.prototype.put = orig; }
  assert.deepEqual((await m.listEvents()).map((e) => e.id), ['e0']);
  assert.deepEqual((await m.listNotes()).map((x) => x.id), ['keep']);
  assert.equal((await m.listFolders()).length, 1);
  // 不正なノート（本文なし）でも rollback
  await assert.rejects(m.applyImport({ noteReplace: true, notePuts: [{ id: 'x' }] }));
  assert.equal((await m.listNotes()).length, 1);
});

// ---- PR26: 古いメモの復元は追加専用 ----
import { legacyHashes, planLegacyNotes } from '../js/backup.js';
async function legacyPlan(cur, folders, memos, now = 1) { return planLegacyNotes(cur, folders, memos, await legacyHashes(memos), now); }

test('NT-1③：試作208件＋既存9件（編集1・自由ノート・ピン2）→ 追加200・別1・同じ7、2回目は追加0、現在は不変', async () => {
  const memos = makeLegacyMemos(200); // 8 + 200 = 208
  const { folder } = ensureDailyFolder([], 7);
  const cur = memos.slice(0, 8).map((x) => noteFromMemo(x));
  cur[0] = { ...cur[0], pinned: true, pinnedAt: 5 }; cur[1] = { ...cur[1], pinned: true, pinnedAt: 6 };
  cur[2] = { ...cur[2], body: cur[2].body + '\n編集した', updatedAt: 99 }; // 編集1件
  cur.push({ id: 'free-1', body: '自由', title: '自由', folderId: null, pinned: false, pinnedAt: null, createdAt: 1, updatedAt: 2, deletedAt: null });
  assert.equal(cur.length, 9);
  const p = await legacyPlan(cur, [folder], memos);
  assert.deepEqual([p.added, p.differ, p.same], [200, 1, 7]);
  assert.equal(p.folderCreated, false);
  const diff = p.notePuts.find((x) => /^memo-2026-11-16-[0-9a-f]{8}$/.test(x.id));
  assert.ok(diff);
  assert.ok(p.notePuts.every((x) => x.folderId === DAILY_ID));
  // 現在のノートは1件も変わらない（puts は新IDだけ）
  const curIds = new Set(cur.map((x) => x.id));
  assert.ok(p.notePuts.every((x) => !curIds.has(x.id)));
  // 2回目は追加0（別ノートも同じIDで同じ）
  const merged = [...cur, ...p.notePuts];
  const p2 = await legacyPlan(merged, [folder], memos);
  assert.deepEqual([p2.added, p2.differ, p2.same, p2.notePuts.length], [0, 0, 208, 0]);
  // 全指紋：元の日付＋元本文がすべて含まれる（編集前の元本文は別ノートに残る）
  const have = new Set(merged.filter((x) => x.sourceDate).map((x) => `${x.sourceDate}\u0000${memoTextOf(x)}`));
  assert.ok(memos.every((m) => have.has(`${m.date}\u0000${m.text}`)));
});

test('固定folder：改名済は使う／削除済は新規コピーがある時だけ再作成／同名別IDは（2）', async () => {
  const memos = makeLegacyMemos(0).slice(0, 2);
  const renamed = { id: DAILY_ID, name: '改名', order: 3, createdAt: 1, updatedAt: 2 };
  let p = await legacyPlan([], [renamed], memos);
  assert.equal(p.folderCreated, false); assert.deepEqual(p.folderPuts, []);
  assert.ok(p.notePuts.every((x) => x.folderId === DAILY_ID));
  p = await legacyPlan([], [], memos, 50);
  assert.equal(p.folderCreated, true); assert.equal(p.folderPuts[0].id, DAILY_ID); assert.equal(p.folderPuts[0].name, '日ごとのメモ');
  // 全部同じなら folder を作らない
  const cur = memos.map((x) => noteFromMemo(x));
  p = await legacyPlan(cur, [], memos);
  assert.deepEqual([p.notePuts.length, p.folderPuts.length, p.same], [0, 0, 2]);
  p = await legacyPlan([], [{ id: 'other', name: '日ごとのメモ', order: 0, createdAt: 1, updatedAt: 1 }], memos);
  assert.equal(p.folderPuts[0].name, '日ごとのメモ（2）');
});

test('削除済の取込ノートは復活させない／衝突時は桁を伸ばす／決定的', async () => {
  const memos = makeLegacyMemos(0).slice(0, 1);
  const gone = { ...noteFromMemo(memos[0]), deletedAt: 5, folderId: null };
  let p = await legacyPlan([gone], [], memos);
  assert.deepEqual([p.same, p.notePuts.length], [1, 0]);
  const edited = { ...noteFromMemo(memos[0]), body: '別の内容' };
  const [hex] = await legacyHashes(memos);
  const blocker = { id: `memo-${memos[0].date}-${hex.slice(0, 8)}`, body: 'ぜんぜん違う', sourceDate: memos[0].date };
  p = await legacyPlan([edited, blocker], [], memos);
  assert.equal(p.notePuts[0].id, `memo-${memos[0].date}-${hex.slice(0, 9)}`);
  const q = await legacyPlan([edited], [], memos);
  assert.equal(q.notePuts[0].id, `memo-${memos[0].date}-${hex.slice(0, 8)}`);
  assert.deepEqual(q, await legacyPlan([edited], [], memos));
});

test('planAppend：新形式 notes があれば memos は二重に取り込まない／v4 は legacy を計画', async () => {
  const memos = makeLegacyMemos(0).slice(0, 3);
  const hex = await legacyHashes(memos);
  const a = planAppend([], [], [], memos, [], [], [], null, [], null, hex);
  assert.equal(a.legacy.added, 3);
  const b = planAppend([], [], [], memos, [], [], [], [], [], null, hex);
  assert.equal(b.legacy, null);
});

test('復元：replace でも applyImport は現ノート・folder・ピンを消さず追加だけ。2回目は0', async () => {
  const m = await fresh();
  const memos = makeLegacyMemos(5);
  const mine = { id: 'mine', body: '自分', title: '自分', folderId: 'folder-home', pinned: true, pinnedAt: 9, createdAt: 1, updatedAt: 2, deletedAt: null };
  await m.applyImport({ notePuts: [mine], folderPuts: [home] });
  const run = async () => {
    const p = planLegacyNotes(await m.listNotes({ includeDeleted: true }), await m.listFolders(), memos, await legacyHashes(memos), 77);
    await m.applyImport({ replace: true, notePuts: p.notePuts, folderPuts: p.folderPuts });
    return p;
  };
  const p1 = await run();
  assert.equal(p1.added, 13);
  let all = await m.listNotes({ includeDeleted: true });
  assert.equal(all.length, 14);
  assert.equal(all.find((x) => x.id === 'mine').pinned, true);
  assert.deepEqual((await m.listFolders()).map((f) => f.id).sort(), [DAILY_ID, 'folder-home']);
  const p2 = await run();
  assert.deepEqual([p2.added, p2.notePuts.length, p2.folderPuts.length], [0, 0, 0]);
  assert.equal((await m.listNotes({ includeDeleted: true })).length, 14);
});
