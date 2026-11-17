import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteFromMemo, memoTextOf, titleOf, dailyHeading, headingKind, ensureDailyFolder, noteCharLimit, DAILY_ID, DAILY_NAME, MAX_NOTE_CHARS } from '../js/notes-model.js';
import { makeLegacyMemos, digestOf, FINGERPRINT_3008, sha256 } from './fixtures/notes/legacy-memos.mjs';
import { createV4Db, readAll, validateBackupV4 } from './fixtures/notes/v4-legacy.mjs';

const fx = (f) => new URL(`./fixtures/notes/${f}`, import.meta.url);
const memo = (date, text, extra = {}) => ({ id: date, date, text, createdAt: 10, updatedAt: 20, ink: null, ...extra });

test('3008件：変換して元本文に戻すとsha256が試作と一致（東京/NYで同じ）', () => {
  const memos = makeLegacyMemos();
  assert.equal(memos.length, 3008);
  const notes = memos.map((m) => noteFromMemo(m));
  assert.equal(new Set(notes.map((n) => n.id)).size, 3008);
  assert.equal(digestOf(notes.map((n) => [n.sourceDate, memoTextOf(n)])), FINGERPRINT_3008);
  assert.ok(notes.every((n) => n.folderId === DAILY_ID && n.pinned === false && n.pinnedAt === null && n.deletedAt === null));
  // 決定的
  assert.deepEqual(notes, memos.map((m) => noteFromMemo(m)));
});

test('試作の出力(out-tokyo/out-ny)：指紋・件数・題名。年なしの旧期待だけ年付きへ', () => {
  const tk = JSON.parse(readFileSync(fx('out-tokyo.json'), 'utf8')), ny = JSON.parse(readFileSync(fx('out-ny.json'), 'utf8'));
  for (const o of [tk, ny]) {
    assert.equal(o.path1.sha256Before, FINGERPRINT_3008);
    assert.equal(o.path1.sha256After, FINGERPRINT_3008);
    assert.equal(o.path1.notes, 3008);
  }
  assert.deepEqual(tk.path1.samples, ny.path1.samples); // 時間帯に依存しない
  const memos = makeLegacyMemos();
  for (const s of tk.path1.samples) {
    const n = noteFromMemo(memos.find((m) => `memo-${m.date}` === s.id));
    if (s.id === 'memo-2026-11-15') { // 旧試作は「11月15日（日）」のまま
      assert.equal(s.title, '11月15日（日）');
      assert.equal(n.title, '2026年11月15日（日）');
      assert.equal(n.sourceHeading, false);
    } else {
      assert.equal(n.title, s.title);
      assert.equal(n.sourceHeading, s.headingAdded);
    }
  }
});

test('日付見出し4形式：年付き・ISO・スラッシュは足さない、年なしは年付きに直して元の第一行を残す', () => {
  const d = '2026-11-14';
  for (const first of ['2026年11月14日（土）', '2026-11-14', '2026/11/14', '2026/11/14 '.trim(), '2026年11月14日']) {
    const n = noteFromMemo(memo(d, `${first}\n本文`));
    assert.equal(n.body, `${first}\n本文`, first); assert.equal(n.sourceHeading, false); assert.equal('sourceOriginalFirstLine' in n, false);
    assert.equal(memoTextOf(n), `${first}\n本文`);
  }
  for (const [first, eol] of [['11月14日（土）', '\n'], ['11月14日(土)', '\r\n'], ['11月14日', '\n'], ['11月14日（土）', '']]) {
    const t = eol ? `${first}${eol}残り\r\n😀 末尾` : first;
    const n = noteFromMemo(memo(d, t));
    assert.equal(n.body.split(/\r?\n/)[0], '2026年11月14日（土）');
    assert.equal(n.sourceOriginalFirstLine, first + eol);
    assert.equal(n.sourceHeading, false);
    assert.equal(memoTextOf(n), t);
    assert.equal(n.title, '2026年11月14日（土）');
  }
  assert.equal((noteFromMemo(memo(d, '11月14日（土）\n本文')).body.match(/11月14日/g) || []).length, 1); // 二重にならない
  // 別の行・別の日付は見出しを足す
  for (const first of ['会議', '11月15日（日）', '2025年11月14日']) {
    const n = noteFromMemo(memo(d, `${first}\n本文`));
    assert.equal(n.body, `2026年11月14日（土）\n${first}\n本文`); assert.equal(n.sourceHeading, true); assert.equal(memoTextOf(n), `${first}\n本文`);
  }
  assert.equal(headingKind('  11月14日（土） ', d), 'noYear');
  assert.equal(dailyHeading('2024-02-29'), '2024年2月29日（木）');
});

test('CRLF・空白・絵文字・100000字・時刻・手書きinkを保つ', () => {
  const cases = ['うるう 😀\r\nCRLF', '  先頭空白\n\n\n末尾\n\n', 'x'.repeat(MAX_NOTE_CHARS), '- [ ] a\r\n- [x] b', '\n\n先頭が空行'];
  for (const t of cases) { const n = noteFromMemo(memo('2024-02-29', t)); assert.equal(memoTextOf(n), t); assert.equal(n.createdAt, 10); assert.equal(n.updatedAt, 20); }
  const ink = { strokes: [[1, 2, 3]], v: 1 };
  const n = noteFromMemo(memo('2026-11-14', '手書き', { ink }));
  assert.deepEqual(n.ink, ink); assert.equal(n.sourceDate, '2026-11-14');
  const big = noteFromMemo(memo('2026-11-17', 'x'.repeat(MAX_NOTE_CHARS)));
  assert.ok(big.body.length > MAX_NOTE_CHARS); assert.ok(big.body.length <= noteCharLimit(big)); // 見出し分は別枠
  assert.equal(noteCharLimit({ body: 'a', sourceHeading: false }), MAX_NOTE_CHARS);
});

test('題名：本文1行目由来・100字・空なら新規ノート・後続行は採らない', () => {
  assert.equal(titleOf('# 見出し\n本文'), '見出し');
  assert.equal(titleOf('- [x] 済み'), '済み');
  assert.equal(titleOf('a\r\nb'), 'a');
  assert.equal(titleOf(''), '新規ノート');
  assert.equal(titleOf('\n本文あり'), '新規ノート');
  assert.equal(titleOf('   \n\n二行目'), '新規ノート');
  assert.equal(titleOf('- [ ] \n次の行'), '新規ノート');
  assert.equal(titleOf('あ'.repeat(150)).length, 100);
  assert.equal(Array.from(titleOf('😀'.repeat(150))).length, 100);
  assert.equal(titleOf('😀'.repeat(150)), '😀'.repeat(100));
});

test('固定フォルダ：あれば使う（改名済でも）、無ければ作る、同名は（2）以降', () => {
  assert.deepEqual(ensureDailyFolder([], 5).folder, { id: DAILY_ID, name: DAILY_NAME, order: 0, createdAt: 5, updatedAt: 5 });
  const renamed = { id: DAILY_ID, name: '昔のメモ', order: 3, createdAt: 1, updatedAt: 1 };
  assert.deepEqual(ensureDailyFolder([renamed], 9), { folder: renamed, created: false });
  const other = [{ id: 'f1', name: DAILY_NAME, order: 1, createdAt: 1, updatedAt: 1 }, { id: 'f2', name: `${DAILY_NAME}（2）`, order: 4, createdAt: 1, updatedAt: 1 }];
  const r = ensureDailyFolder(other, 9);
  assert.equal(r.created, true); assert.equal(r.folder.id, DAILY_ID); assert.equal(r.folder.name, `${DAILY_NAME}（3）`); assert.equal(r.folder.order, 5);
});

test('旧v4 DB fixture：memosを読んで変換すると指紋が一致し、memosは変わらない', async () => {
  const memos = makeLegacyMemos();
  const db = await createV4Db('nm-v4', memos);
  assert.equal(db.version, 4); assert.deepEqual([...db.objectStoreNames].sort(), ['categories', 'events', 'memos', 'meta']);
  const rows = await readAll(db, 'memos');
  const notes = rows.map((m) => noteFromMemo(m));
  assert.equal(digestOf(notes.map((n) => [n.sourceDate, memoTextOf(n)])), FINGERPRINT_3008);
  assert.equal(sha256(JSON.stringify(await readAll(db, 'memos'))), sha256(JSON.stringify(rows)));
  db.close();
});

test('旧v4 validator fixture：v4ファイルを読み、v5は丸ごと拒否する。v4バックアップのmemosも同規則で変換', () => {
  const text = readFileSync(fx('v4-backup-min.json'), 'utf8');
  const v = validateBackupV4(text);
  assert.equal(v.ok, true);
  const notes = v.memos.map((m) => noteFromMemo(m));
  assert.deepEqual(notes.map((n) => memoTextOf(n)), v.memos.map((m) => m.text));
  assert.equal(notes[1].sourceOriginalFirstLine, '11月15日（日）\r\n');
  assert.equal(notes[1].body, '2026年11月15日（日）\r\n既に日付が1行目');
  const r = validateBackupV4(JSON.stringify({ app: 'duo-calendar', version: 5, events: [] }));
  assert.equal(r.ok, false); assert.match(r.reason, /未対応のバージョン/);
});

test('PR1: noteFromMemo は date = sourceDate。noteDateOf / dateOccupants', async () => {
  const { noteDateOf, dateOccupants } = await import('../js/notes-model.js');
  const n = noteFromMemo(memo('2026-11-18', '本文'));
  assert.equal(n.date, '2026-11-18');
  assert.equal(n.sourceDate, '2026-11-18');
  assert.equal(noteDateOf({ sourceDate: '2026-01-02' }), '2026-01-02');
  assert.equal(noteDateOf({ sourceDate: '2026-01-02', date: null }), null);
  assert.equal(noteDateOf({ date: '2026-02-30' }), null);
  assert.equal(noteDateOf({}), null);
  const rows = [{ id: 'a', date: '2026-01-01' }, { id: 'b', sourceDate: '2026-01-01' }, { id: 'c', date: '2026-01-01', deletedAt: 5 }, { id: 'd', date: null, sourceDate: '2026-01-01' }];
  assert.deepEqual(dateOccupants(rows, '2026-01-01').map((x) => x.id), ['a', 'b']);
  assert.deepEqual(dateOccupants(rows, '2026-01-01', 'a').map((x) => x.id), ['b']);
});
