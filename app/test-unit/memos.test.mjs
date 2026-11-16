import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoStore, DRAFT_PREFIX } from '../js/memos.js';

const mem = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const fakeDb = () => { const rows = new Map(); const o = { rows, fail: false, gate: null, puts: [],
  getMemo: async (d) => rows.get(d) ?? null,
  putMemo: async (d, t, now) => { o.puts.push([d, t]); if (o.gate) await o.gate; if (o.fail) throw new Error('x'); if (/^\s*$/.test(t)) { rows.delete(d); return null; } const m = { id: d, date: d, text: t, createdAt: now, updatedAt: now }; rows.set(d, m); return m; } }; return o; };

test('1秒の debounce で保存し下書きを消す。入力ごとに下書きが書かれる', async () => {
  const st = mem(), db = fakeDb(), s = createMemoStore({ db, storage: st, delay: 20 });
  s.setText('2026-01-01', 'a'); s.setText('2026-01-01', 'ab');
  assert.equal(JSON.parse(st.getItem(DRAFT_PREFIX + '2026-01-01')).text, 'ab');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(db.puts, [['2026-01-01', 'ab']]);
  assert.equal(st.getItem(DRAFT_PREFIX + '2026-01-01'), null);
});
test('古い ack が新しい下書きを消さない', async () => {
  const st = mem(), db = fakeDb(), s = createMemoStore({ db, storage: st, delay: 1000 });
  let open; db.gate = new Promise((r) => { open = r; });
  s.setText('2026-01-01', 'a');
  const p = s.flushMemo('2026-01-01');
  await new Promise((r) => setTimeout(r, 5)); // 保存が始まり gate で待つ
  s.setText('2026-01-01', 'ab'); // 保存中に新しく打つ
  db.gate = null; open(); await p;
  assert.ok(st.getItem(DRAFT_PREFIX + '2026-01-01'), '新しい下書きが残る');
  assert.equal(s.dirty('2026-01-01'), true);
  await s.flushMemo('2026-01-01');
  assert.equal(db.rows.get('2026-01-01').text, 'ab');
  assert.equal(st.getItem(DRAFT_PREFIX + '2026-01-01'), null);
});
test('失敗は下書きを残し再試行できる。空への変更は削除', async () => {
  const st = mem(), db = fakeDb(), s = createMemoStore({ db, storage: st });
  db.fail = true; s.setText('2026-01-02', 'x');
  assert.equal(await s.flushMemo('2026-01-02'), false);
  assert.ok(st.getItem(DRAFT_PREFIX + '2026-01-02'));
  db.fail = false;
  assert.equal(await s.flushMemo('2026-01-02'), true);
  assert.equal(db.rows.get('2026-01-02').text, 'x');
  s.setText('2026-01-02', '  ');
  await s.flushMemo('2026-01-02');
  assert.equal(db.rows.has('2026-01-02'), false);
});
test('日付別: 高速に日付を切り替えても各日の本文が保存される', async () => {
  const db = fakeDb(), s = createMemoStore({ db, storage: mem() });
  s.setText('2026-01-01', 'A'); s.setText('2026-01-02', 'B'); await s.flushAll();
  assert.equal(db.rows.get('2026-01-01').text, 'A'); assert.equal(db.rows.get('2026-01-02').text, 'B');
});
test('起動時の復元: DB より新しい下書きだけ入れ、古いものは捨てる', async () => {
  const st = mem(), db = fakeDb();
  db.rows.set('2026-02-01', { id: '2026-02-01', date: '2026-02-01', text: 'db', createdAt: 1, updatedAt: 500 });
  st.setItem(DRAFT_PREFIX + '2026-02-01', JSON.stringify({ date: '2026-02-01', text: 'old', at: 100 }));
  st.setItem(DRAFT_PREFIX + '2026-02-02', JSON.stringify({ date: '2026-02-02', text: 'new', at: 100 }));
  const s = createMemoStore({ db, storage: st });
  assert.deepEqual(await s.recoverMemoDraft(), ['2026-02-02']);
  assert.equal(db.rows.get('2026-02-01').text, 'db');
  assert.equal(db.rows.get('2026-02-02').text, 'new');
  assert.equal(st.length, 0);
});
test('復元時の保存失敗は下書きを残して表示に使える', async () => {
  const st = mem(), db = fakeDb(); db.fail = true;
  st.setItem(DRAFT_PREFIX + '2026-03-01', JSON.stringify({ date: '2026-03-01', text: 'keep', at: 1 }));
  const s = createMemoStore({ db, storage: st });
  await s.recoverMemoDraft();
  assert.equal(s.get('2026-03-01').text, 'keep'); assert.equal(s.get('2026-03-01').failed, true);
  assert.ok(st.getItem(DRAFT_PREFIX + '2026-03-01'));
});
