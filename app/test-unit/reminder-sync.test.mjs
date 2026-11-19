// 第19版 D7: リマインダー同期（EventKit の偽物）。東京と NY の両方で走る（日付だけ／時刻付きの due）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createTaskStore } from '../js/tasks.js';
import { createReminderSync, normSyncSettings, mergeFields, CONFLICT_NOTICE, ECHO_MS } from '../js/reminder-sync.js';

let n = 0;
async function fresh() { globalThis.indexedDB = new IDBFactory(); const m = await import(`../js/db.js?s${n++}`); m.configure(`s${n}`); return m; }

// EventKit の偽物。clock は 1 回の操作ごとに進む（lastModifiedDate）。
function fakeKit({ lists } = {}) {
  const K = { calls: [], lists: lists || [{ id: 'L1', title: 'Duo', sourceId: 'S1', allowsModify: true }, { id: 'L2', title: '仕事', sourceId: 'S1', allowsModify: true }], rems: [], clock: Date.parse('2026-11-19T01:00:00Z'), perm: 'granted', seq: 0, created: {}, checkStatus: ['missing', 'missing'], listCount: 0 };
  const tick = () => (K.clock += 5000);
  const rec = (m, o) => K.calls.push({ m, o: JSON.parse(JSON.stringify(o ?? {})) });
  const view = (r) => ({ ...r, alarms: r.notify ? [{ at: 'x' }] : [] });
  const find = (o) => K.rems.find((r) => r.itemId === o.itemId) || K.rems.filter((r) => r.externalId === o.externalId && o.externalId).slice(0, 1)[0];
  K.native = {
    permission: async () => ({ status: K.perm }),
    lists: async () => ({ lists: K.lists }),
    listReminders: async (o) => { rec('listReminders', o); return { reminders: K.rems.filter((r) => o.listIds.includes(r.listId)).map(view) }; },
    createReminder: async (o) => {
      rec('createReminder', o);
      if (K.created[o.requestId]) return { reminder: view(K.created[o.requestId]) };
      const r = { itemId: `I${++K.seq}`, externalId: `X${K.seq}`, listId: o.listId, title: o.title, notes: o.notes || '', due: o.due, done: false, doneAt: null, notify: !!o.notify, recurring: false, readOnly: false, createdAt: tick(), modifiedAt: tick() };
      K.rems.push(r); K.created[o.requestId] = r; return { reminder: view(r) };
    },
    updateReminder: async (o) => {
      rec('updateReminder', o);
      const r = find(o); if (!r) throw { code: 'NOT_FOUND' };
      const p = o.patch;
      if ('title' in p) r.title = p.title; if ('notes' in p) r.notes = p.notes; if ('due' in p) r.due = p.due; if ('notify' in p) r.notify = p.notify; if ('listId' in p) r.listId = p.listId;
      r.modifiedAt = tick(); return { reminder: view(r), conflicted: false };
    },
    setReminderDone: async (o) => { rec('setReminderDone', o); const r = find(o); if (!r) throw { code: 'NOT_FOUND' }; r.done = o.done; r.doneAt = o.done ? '2026-11-19T10:00' : null; r.modifiedAt = tick(); return { reminder: view(r) }; },
    deleteReminder: async (o) => { rec('deleteReminder', o); const r = find(o); if (!r) return { deleted: true, missing: true }; K.rems = K.rems.filter((x) => x !== r); return { deleted: true }; },
    checkReminderList: async (o) => { rec('checkReminderList', o); return { status: K.checkStatus.shift() ?? 'missing', newId: null }; },
    createReminderList: async (o) => { rec('createReminderList', o); const l = { id: `NL${++K.listCount}`, title: o.title, sourceId: o.sourceId || 'S1', allowsModify: true }; K.lists.push(l); return { list: l }; },
  };
  K.count = (m) => K.calls.filter((c) => c.m === m).length;
  // リマインダーアプリでの変更（lastModifiedDate が進む）
  K.edit = (itemId, patch) => { const r = K.rems.find((x) => x.itemId === itemId); Object.assign(r, patch, { modifiedAt: tick() }); return r; };
  return K;
}

async function setup(opts = {}) {
  const db = await fresh();
  const K = fakeKit(opts.kit);
  let set = normSyncSettings({ enabled: opts.enabled !== false, lists: opts.lists || [] });
  const notices = [], events = [];
  let bs = {};
  let sync;
  const store = createTaskStore(db, { syncOn: () => set.enabled, onWrite: () => {} });
  sync = createReminderSync({ db, native: K.native, getSettings: () => set, setSettings: (s) => { set = normSyncSettings(s); }, base: { get: () => bs, set: (b) => { bs = JSON.parse(JSON.stringify(b)); } }, onNotice: (m) => notices.push(m), onEvent: (e) => events.push(e), now: () => new Date(K.clock) });
  return { db, K, store, sync, notices, events, setSet: (p) => { set = normSyncSettings({ ...set, ...p }); }, get set() { return set; } };
}
const byId = async (db, id) => db.getTask(id);

test('同期オフ・許可なしでは native を一度も呼ばない', async () => {
  const t = await setup({ enabled: false });
  await t.store.add({ id: 'a', title: 'x' });
  assert.deepEqual(await t.sync.sync(), { skipped: 'off' });
  const u = await setup(); u.K.perm = 'denied';
  await u.store.add({ id: 'a', title: 'x' });
  await u.sync.sync();
  assert.equal(u.K.calls.length, 0);
  assert.equal((await byId(u.db, 'a')).syncState, 'pending'); // 許可が戻ったら送る
});

test('同期オンで追加すると createReminder が 1 回。再試行では増えない。期限なしは due:null', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: '期限なし' });
  await t.sync.sync(); await t.sync.sync();
  assert.equal(t.K.count('createReminder'), 1);
  assert.equal(t.K.calls.find((c) => c.m === 'createReminder').o.due, null);
  assert.equal(t.set.duoListId, 'L1');
  const a = await byId(t.db, 'a');
  assert.equal(a.syncState, 'linked'); assert.equal(a.remListId, 'L1'); assert.ok(a.remItemId && a.remExternalId && a.remModifiedAt);
  // 同じ id の作成の再送（リンクを書く前に落ちた想定）でも 1 件のまま
  await t.db.putTask({ ...a, remItemId: undefined, remExternalId: undefined, remListId: undefined, remModifiedAt: undefined, syncState: 'pending' });
  await t.sync.sync();
  assert.equal(t.K.rems.length, 1);
});

test('日付だけ／時刻付きの due と通知は、そのまま渡る（東京・NY）', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a', due: { date: '2026-11-20' }, notify: true });
  await t.store.add({ id: 'b', title: 'b', due: { date: '2026-11-20', time: '09:30' }, notify: false });
  await t.sync.sync();
  const cs = t.K.calls.filter((c) => c.m === 'createReminder').map((c) => c.o);
  assert.deepEqual(cs.map((o) => o.due), [{ date: '2026-11-20' }, { date: '2026-11-20', time: '09:30' }]);
  assert.deepEqual(cs.map((o) => o.notify), [true, false]);
});

test('Duo の題名変更・完了は同じ件を更新する（作り直さない）。繰り越しの表示だけでは updateReminder 0', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a', due: { date: '2026-11-20' } });
  await t.sync.sync();
  await t.sync.sync();
  assert.equal(t.K.count('updateReminder'), 0);
  await t.store.update('a', { title: 'a2' });
  await t.store.setDone('a', true);
  await t.sync.sync();
  assert.equal(t.K.count('createReminder'), 1);
  assert.equal(t.K.count('updateReminder'), 1);
  assert.equal(t.K.count('setReminderDone'), 1);
  assert.equal(t.K.rems[0].title, 'a2'); assert.equal(t.K.rems[0].done, true);
  await t.store.setDone('a', false);
  await t.sync.sync();
  assert.equal(t.K.rems[0].done, false);
  // 期日を変えたときだけ due が動く（両方）
  await t.store.update('a', { due: { date: '2026-11-19' } });
  await t.sync.sync();
  assert.deepEqual(t.K.rems[0].due, { date: '2026-11-19' });
});

test('リマインダー側の題名変更が Duo に入る。Duo だけが変えた欄は残る', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a', note: 'n' });
  await t.sync.sync();
  const r = t.K.rems[0];
  await t.store.update('a', { note: 'Duo のメモ' }); // Duo: メモだけ
  t.K.edit(r.itemId, { title: 'リマインダーの題名' }); // リマインダー: 題名だけ
  await t.sync.sync();
  const a = await byId(t.db, 'a');
  assert.equal(a.title, 'リマインダーの題名'); assert.equal(a.note, 'Duo のメモ');
  assert.equal(t.K.rems[0].notes, 'Duo のメモ'); assert.equal(t.K.rems[0].title, 'リマインダーの題名');
  assert.deepEqual(t.notices, []); // 違う欄は知らせない
  assert.equal(a.syncState, 'linked');
});

test('同じ欄が両方で変わったら新しい方を採り、一行知らせる。完了の丸だけは知らせない', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a' });
  await t.sync.sync();
  const r = t.K.rems[0];
  await t.store.update('a', { title: 'Duo' }, t.K.clock + 1000);
  t.K.edit(r.itemId, { title: 'Rem' }); // リマインダーが後（1 秒以上新しい）
  await t.sync.sync();
  assert.equal((await byId(t.db, 'a')).title, 'Rem');
  assert.deepEqual(t.notices, [CONFLICT_NOTICE]);
  // Duo が新しい
  await t.store.update('a', { title: 'Duo2' }, t.K.clock + 100000);
  t.K.edit(r.itemId, { title: 'Rem2' }); t.K.rems[0].modifiedAt = t.K.clock - 50000;
  await t.sync.sync();
  assert.equal(t.K.rems[0].title, 'Duo2');
  assert.equal(t.notices.length, 2);
  // 完了の丸だけ
  await t.store.setDone('a', true, t.K.clock + 200000);
  t.K.edit(r.itemId, { done: false }); t.K.rems[0].modifiedAt = t.K.clock - 99999;
  await t.sync.sync();
  assert.equal(t.notices.length, 2);
});

test('mergeFields: 差が 1 秒未満ならリマインダー側を新しいと見ない', () => {
  const d = { title: 'D', note: '', due: null, done: false, notify: false }, r = { ...d, title: 'R' };
  const a = mergeFields({ duo: d, rem: r, base: { ...d, title: 'B' }, pending: true, duoAt: 1000, remAt: 1000 + ECHO_MS - 1, canGive: true });
  assert.deepEqual(a.give, { title: 'D' });
  const b = mergeFields({ duo: d, rem: r, base: { ...d, title: 'B' }, pending: true, duoAt: 1000, remAt: 1000 + ECHO_MS, canGive: true });
  assert.deepEqual(b.take, { title: 'R' });
  const c = mergeFields({ duo: d, rem: r, base: { ...d, title: 'B' }, pending: true, duoAt: 1000, remAt: 9999, canGive: false });
  assert.deepEqual(c.take, { title: 'R' }); // 読み取り専用は Duo から書けない
});

test('外部 id が 2 件当たったら書かない（RS-34）', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a' });
  await t.sync.sync();
  const r = t.K.rems[0];
  t.K.rems.push({ ...r, itemId: 'DUP' });
  await t.db.putTask({ ...(await byId(t.db, 'a')), remItemId: 'GONE', syncState: 'pending', title: 'a2', updatedAt: 99 });
  const before = t.K.calls.length;
  await t.sync.sync();
  assert.equal(t.K.calls.slice(before).filter((c) => ['createReminder', 'updateReminder', 'setReminderDone', 'deleteReminder'].includes(c.m)).length, 0);
  assert.equal((await byId(t.db, 'a')).title, 'a2');
  assert.ok(t.events.some((e) => e.type === 'ambiguous'));
});

test('Duo から消すと墓標が残り、リマインダーからも消え、取り込み直さない。つながりのない件は墓標なし', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a' });
  await t.sync.sync();
  const ext = (await byId(t.db, 'a')).remExternalId;
  await t.store.remove('a');
  assert.equal(t.K.count('deleteReminder'), 0); // 6 秒（確定）前は呼ばない: 確定が remove。同期のきっかけで呼ぶ
  assert.deepEqual((await t.store.list()).map((x) => x.id), []); // 一覧には出ない
  await t.sync.sync();
  assert.equal(t.K.count('deleteReminder'), 1);
  assert.equal(t.K.rems.length, 0);
  const tomb = await byId(t.db, 'a');
  assert.equal(tomb.syncState, 'tombstone'); assert.equal(tomb.remExternalId, ext); assert.ok(!tomb.remListId);
  await t.sync.sync(); await t.sync.sync();
  assert.equal(t.K.count('deleteReminder'), 1);
  assert.equal((await t.store.list()).length, 0);
  // リマインダー側に同じ外部 id が復活しても取り込まない
  t.K.rems.push({ itemId: 'I9', externalId: ext, listId: 'L1', title: '復活', notes: '', due: null, done: false, modifiedAt: 5, createdAt: 5 });
  await t.sync.sync();
  assert.equal((await t.store.list()).length, 0);
  await t.store.add({ id: 'b', title: 'b' }); // 未同期のうちに消す: 墓標なし
  await t.store.remove('b');
  assert.equal(await byId(t.db, 'b'), null);
});

test('30 日より前の完了が一覧に無いことを削除と見なさない。窓の中の消失は連携なし', async () => {
  const t = await setup();
  await t.store.add({ id: 'old', title: '古い完了' });
  await t.store.add({ id: 'new', title: '最近' });
  await t.sync.sync();
  const old = await byId(t.db, 'old'), neu = await byId(t.db, 'new');
  await t.db.putTask({ ...old, done: true, doneAt: '2026-01-01T10:00', syncState: 'linked' }); // 窓の外
  t.K.rems = []; // どちらも一覧に無い
  await t.sync.sync();
  assert.equal((await byId(t.db, 'old')).remExternalId, old.remExternalId); // つながりを外さない
  assert.equal((await byId(t.db, 'new')).syncState, 'local');
  assert.ok(neu.remExternalId);
});

test('決定 4: リマインダー側で消されたら Duo は消さず「連携なし」。次の同期で create 0 回', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: '題名', due: { date: '2026-11-20', time: '10:00' }, note: 'メモ', notify: true });
  await t.sync.sync();
  const before = await byId(t.db, 'a');
  t.K.rems = [];
  const created = t.K.count('createReminder');
  await t.sync.sync(); await t.sync.sync();
  const a = await byId(t.db, 'a');
  assert.equal((await t.db.listTasks()).length, 1);
  for (const k of ['remItemId', 'remExternalId', 'remListId', 'remModifiedAt']) assert.ok(!(k in a), k);
  assert.equal(a.syncState, 'local');
  for (const k of ['title', 'due', 'done', 'note', 'notify', 'updatedAt', 'createdAt', 'order', 'doneAt']) assert.deepEqual(a[k], before[k], k);
  assert.equal(t.K.count('createReminder'), created); // 書き出し直さない
  await t.store.update('a', { title: '後で変えた' });
  await t.sync.sync();
  assert.equal(t.K.count('createReminder'), created); // 連携なしのまま
  assert.equal((await t.store.list()).length, 1);
});

test('リマインダーだけにある件の取り込み（読むリストだけ）。長い題名は切らない', async () => {
  const t = await setup({ lists: ['L2'] });
  t.K.rems.push({ itemId: 'R1', externalId: 'XR1', listId: 'L2', title: 'あ'.repeat(500), notes: 'n', due: { date: '2026-11-21' }, done: false, createdAt: 11, modifiedAt: 22 });
  t.K.lists.push({ id: 'L3', title: '読まない', sourceId: 'S1', allowsModify: true });
  t.K.rems.push({ itemId: 'R2', externalId: 'XR2', listId: 'L3', title: '読まない', notes: '', due: null, done: false, createdAt: 1, modifiedAt: 2 });
  await t.sync.sync();
  const l = await t.store.list();
  assert.equal(l.length, 1);
  assert.equal(l[0].title.length, 500); assert.equal(l[0].remExternalId, 'XR1'); assert.equal(l[0].syncState, 'linked');
  await t.sync.sync();
  assert.equal((await t.store.list()).length, 1);
  assert.equal(t.K.count('createReminder'), 0);
});

test('繰り返しは完了だけ書く（題名・期限を Duo から上書きしない）', async () => {
  const t = await setup();
  t.K.rems.push({ itemId: 'R1', externalId: 'XR1', listId: 'L1', title: '毎週', notes: '', due: { date: '2026-11-20' }, done: false, recurring: true, createdAt: 1, modifiedAt: 10 });
  await t.sync.sync();
  const id = (await t.db.listTasks())[0].id;
  await t.store.update(id, { title: 'Duo で変えた', due: { date: '2026-11-25' } });
  await t.store.setDone(id, true);
  await t.sync.sync();
  assert.equal(t.K.count('updateReminder'), 0);
  assert.equal(t.K.count('setReminderDone'), 1);
  assert.equal(t.K.rems[0].title, '毎週');
});

test('「Duo」リストが消えた: 1 回目だけ・ソースなしでは外さない。2 回続けて消えたら listMissing、タスクは 1 件も消えない', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a' }); await t.store.add({ id: 'b', title: 'b' });
  await t.sync.sync();
  t.K.lists = t.K.lists.filter((l) => l.id !== 'L1'); t.K.rems = [];
  t.K.checkStatus = ['unknown'];
  await t.sync.sync();
  assert.equal((await byId(t.db, 'a')).remListId, 'L1'); assert.equal(t.set.duoListId, 'L1');
  t.K.checkStatus = ['missing'];
  const r = await t.sync.sync();
  assert.equal(r.listMissing, true);
  assert.equal((await t.db.listTasks()).length, 2);
  const a = await byId(t.db, 'a');
  assert.equal(a.syncState, 'listMissing'); assert.ok(!a.remExternalId && !a.remListId);
  assert.equal(t.set.listMissing, true); assert.equal(t.set.duoListId ?? '', ''); assert.equal(t.set.enabled, true);
  assert.deepEqual(t.events.map((e) => e.type), ['listMissing']);
  const c0 = t.K.count('createReminder'), l0 = t.K.count('createReminderList');
  await t.sync.sync(); await t.sync.sync(); // 聞くまでは作らない・重ねて問わない
  assert.equal(t.K.count('createReminder'), c0); assert.equal(t.K.count('createReminderList'), l0);
  assert.equal(t.events.length, 1);
});

test('listMissing: 「今はしない」は 0 回。「作り直す」はリスト 1 つと各件 1 回', async () => {
  const mk = async () => {
    const t = await setup();
    await t.store.add({ id: 'a', title: 'a' }); await t.store.add({ id: 'b', title: 'b' });
    await t.sync.sync();
    t.K.lists = t.K.lists.filter((l) => l.id !== 'L1'); t.K.rems = []; t.K.created = {}; // リストごと消えたので、前の要求 id の記録も無い
    await t.sync.sync();
    return t;
  };
  const no = await mk();
  const c0 = no.K.count('createReminder'), l0 = no.K.count('createReminderList');
  no.sync.declineRecreate();
  await no.sync.sync();
  assert.equal(no.K.count('createReminder'), c0); assert.equal(no.K.count('createReminderList'), l0);
  assert.equal(no.set.listAsked, true); assert.equal(no.set.listMissing, true);
  const yes = await mk();
  const c1 = yes.K.count('createReminder'), l1 = yes.K.count('createReminderList');
  await yes.sync.recreateList(); await yes.sync.sync();
  assert.equal(yes.K.count('createReminderList') - l1, 1);
  assert.equal(yes.K.count('createReminder') - c1, 2);
  assert.equal(yes.set.listMissing, false); assert.ok(yes.set.duoListId);
  assert.deepEqual((await yes.db.listTasks()).map((x) => x.syncState), ['linked', 'linked']);
});

test('リスト移動: 同じソースは付け替え 1 回（作成・削除 0）。ソースをまたぐと作成成功のあとに元を消す', async () => {
  const t = await setup();
  t.K.lists.push({ id: 'L9', title: '別ソース', sourceId: 'S2', allowsModify: true }, { id: 'L8', title: '読み取り専用', sourceId: 'S1', allowsModify: false });
  await t.store.add({ id: 'a', title: 'a' });
  await t.sync.sync();
  const c0 = t.K.count('createReminder');
  assert.deepEqual(await t.sync.moveToList('a', 'L8'), { ok: false, code: 'READ_ONLY' });
  assert.deepEqual(await t.sync.moveToList('a', 'L2'), { ok: true });
  assert.equal(t.K.count('createReminder'), c0); assert.equal(t.K.count('deleteReminder'), 0);
  const a = await byId(t.db, 'a');
  assert.equal(a.remListId, 'L2'); assert.equal(t.K.rems.length, 1);
  assert.deepEqual(await t.sync.moveToList('a', 'L9'), { ok: true });
  assert.equal(t.K.rems.length, 1); assert.equal(t.K.rems[0].listId, 'L9');
  assert.equal((await byId(t.db, 'a')).remListId, 'L9');
  assert.equal((await t.db.listTasks()).length, 1);
});

test('ソースをまたぐ移動: 作成に失敗したら元のまま。削除に失敗したら先を消してつながりは元のまま', async () => {
  const t = await setup();
  t.K.lists.push({ id: 'L9', title: '別ソース', sourceId: 'S2', allowsModify: true });
  await t.store.add({ id: 'a', title: 'a' });
  await t.sync.sync();
  const orig = await byId(t.db, 'a');
  const cr = t.K.native.createReminder;
  t.K.native.createReminder = async () => { throw { code: 'UNAVAILABLE' }; };
  assert.equal((await t.sync.moveToList('a', 'L9')).ok, false);
  assert.equal(t.K.count('deleteReminder'), 0);
  assert.equal((await byId(t.db, 'a')).remItemId, orig.remItemId);
  t.K.native.createReminder = cr;
  const del = t.K.native.deleteReminder;
  let first = true;
  t.K.native.deleteReminder = async (o) => { if (first) { first = false; throw { code: 'UNAVAILABLE' }; } return del(o); };
  assert.equal((await t.sync.moveToList('a', 'L9')).ok, false);
  assert.equal((await byId(t.db, 'a')).remItemId, orig.remItemId);
  assert.equal(t.K.rems.filter((r) => r.listId === 'L9').length, 0); // 先に作った件は消した
  assert.equal(t.K.rems.length, 1);
});

test('native が無い（UNAVAILABLE）・取得失敗でも例外にならず、Duo のタスクはそのまま', async () => {
  const t = await setup();
  await t.store.add({ id: 'a', title: 'a' });
  t.K.native.lists = async () => { throw { code: 'UNAVAILABLE' }; };
  assert.equal((await t.sync.sync()).skipped, 'error');
  assert.equal((await byId(t.db, 'a')).syncState, 'pending');
});

// ---- 第19版 PR10: 初めてオンにするときの確認の一覧 ----
import { previewFirst, applyFirst } from '../js/reminder-sync.js';
const task = (id, title, due = null, extra = {}) => ({ id, title, due, done: false, doneAt: null, createdAt: 1, updatedAt: 1, order: 1, note: '', notify: false, ...extra });
const rem = (itemId, title, due = null, extra = {}) => ({ itemId, externalId: `X${itemId}`, listId: 'L1', title, due, done: false, modifiedAt: 5, ...extra });
test('previewFirst: 題名と期限が 1 対 1 で同じものだけ「同じかも」。題名だけ・2 件以上は出さない。つながり済み・墓標は入れない', () => {
  const tasks = [task('a', '牛乳', { date: '2026-11-20' }), task('b', 'パン', { date: '2026-11-20' }), task('c', 'ごみ'), task('d', '重複', { date: '2026-11-20' }), task('e', '重複', { date: '2026-11-20' }),
    task('f', 'つながり済み', null, { remItemId: 'R9', syncState: 'linked' }), task('g', '墓標', null, { syncState: 'tombstone' }), task('h', '同名だけ', { date: '2026-11-21' })];
  const rems = [rem('R1', '牛乳', { date: '2026-11-20' }), rem('R2', 'パン', { date: '2026-11-21' }), rem('R3', '重複', { date: '2026-11-20' }), rem('R4', '同名だけ', null)];
  const pv = previewFirst(tasks, rems);
  assert.deepEqual(pv.maybe.map((m) => [m.task.id, m.rem.itemId, m.choice]), [['a', 'R1', 'link']]);
  assert.deepEqual(pv.toAdd.map((t) => t.id).sort(), ['b', 'c', 'd', 'e', 'h']);
});
test('applyFirst: 結びつける＝リンクだけ（書き込みなし）、両方残す＝pending、入れない＝状態なし、入れる件＝pending', async () => {
  const db = await fresh();
  for (const t of [task('a', '牛乳', { date: '2026-11-20' }), task('b', 'パン', { date: '2026-11-20' }), task('c', 'ごみ', null, { syncState: 'pending' }), task('d', '新規')]) await db.putTask({ ...t, order: 1 });
  const base = {};
  await applyFirst({ db, base, toAdd: [await db.getTask('d')], maybe: [{ task: await db.getTask('a'), rem: rem('R1', '牛乳', { date: '2026-11-20' }), choice: 'link' }, { task: await db.getTask('b'), rem: rem('R2', 'パン', { date: '2026-11-20' }), choice: 'keep' }, { task: await db.getTask('c'), rem: rem('R3', 'ごみ'), choice: 'skip' }] });
  const a = await db.getTask('a'), b = await db.getTask('b'), c = await db.getTask('c'), d = await db.getTask('d');
  assert.equal(a.remItemId, 'R1'); assert.equal(a.syncState, 'linked'); assert.equal(base.a.title, '牛乳');
  assert.equal(b.syncState, 'pending'); assert.equal(b.remItemId, undefined);
  assert.equal('syncState' in c, false);
  assert.equal(d.syncState, 'pending');
});

// ---- 第19版 D9: すでにあるタスクの移し方（RS-26・27・28・36・49・50） ----
import { prevListCandidates } from '../js/reminder-sync.js';
test('prevListCandidates: 題名がちょうど「Duo」（前後の空白は除く）で書けるものだけ。既定と同じソースは上に置くだけ', () => {
  const ls = [{ id: 'A', title: 'Duo', sourceId: 'S2', allowsModify: true }, { id: 'B', title: ' Duo ', sourceId: 'S1', allowsModify: true }, { id: 'C', title: 'Duo', sourceId: 'S1', allowsModify: false },
    { id: 'D', title: 'Duo2', sourceId: 'S1', allowsModify: true }, { id: 'E', title: 'inbox', sourceId: 'S1', allowsModify: true, isDefault: true }];
  assert.deepEqual(prevListCandidates(ls).map((l) => l.id), ['B', 'A']);
  assert.deepEqual(prevListCandidates([]).map((l) => l.id), []);
});
test('previewFirst: リマインダーにだけある件は pick（初期オフ）。つながり済み・取り込まないと決めた件は出さない', () => {
  const tasks = [task('a', '牛乳', { date: '2026-11-20' }), task('k', 'つながり', null, { remItemId: 'R7', syncState: 'linked' }), task('l', '連携なし', null, { syncState: 'local' })];
  const rems = [rem('R1', '牛乳', { date: '2026-11-20' }), rem('R7', 'つながり'), rem('R8', '残り1'), rem('R9', '残り2'), rem('R10', '見送り')];
  const pv = previewFirst(tasks, rems, { declined: ['R10'] });
  assert.deepEqual(pv.pick.map((p) => [p.rem.itemId, p.on]), [['R8', false], ['R9', false]]);
  assert.deepEqual(pv.maybe.map((m) => m.rem.itemId), ['R1']);
  assert.deepEqual(pv.toAdd.map((t) => t.id), []); // 連携なし（リマインダーで消された）は書き出し直さない
});
test('applyFirst: 選んだ件だけ Duo に入ってつながる。選ばなかった件・「入れない」は declined に返る', async () => {
  const db = await fresh();
  await db.putTask({ ...task('b', 'パン', { date: '2026-11-20' }), order: 3 });
  const base = {};
  const pick = [{ rem: rem('R8', '残り1'), on: true }, { rem: rem('R9', '残り2'), on: false }];
  const r = await applyFirst({ db, base, toAdd: [], maybe: [{ task: await db.getTask('b'), rem: rem('R2', 'パン', { date: '2026-11-20' }), choice: 'skip' }], pick });
  const all = await db.listTasks();
  assert.equal(all.length, 2);
  const got = all.find((t) => t.remItemId === 'R8');
  assert.equal(got.title, '残り1'); assert.equal(got.syncState, 'linked'); assert.equal(got.order, 4); assert.equal(got.remListId, 'L1');
  assert.deepEqual(r.declined.sort(), ['XR2', 'XR9', 'R2', 'R9'].sort()); assert.equal(r.imported, 1);
});
test('RS-49・50: 取り込まないと決めた件は、同期でも取り込まれない。選んでいない件だけが declined', async () => {
  const t = await setup({ lists: [] });
  t.K.rems.push({ itemId: 'R8', externalId: 'XR8', listId: 'L1', title: '残す', notes: '', due: null, done: false, modifiedAt: 1 }, { itemId: 'R9', externalId: 'XR9', listId: 'L1', title: '見送り', notes: '', due: null, done: false, modifiedAt: 1 });
  t.setSet({ declined: ['XR9'] });
  const r = await t.sync.sync();
  const all = await t.db.listTasks();
  assert.deepEqual(all.map((x) => x.title), ['残す']);
  assert.equal(t.K.count('createReminder'), 0);
  assert.equal(r.imported, 1);
});
test('RS-36: バックアップから戻した件は externalId で結び直す。見つからない件は pending のまま作り直さず、「書き出し直す」を選んだときだけ作る', async () => {
  const t = await setup({ lists: [] });
  t.K.rems.push({ itemId: 'NEW1', externalId: 'XE1', listId: 'L1', title: '牛乳', notes: '', due: null, done: false, modifiedAt: 7 });
  await t.db.putTask({ ...task('a', '牛乳'), remItemId: 'OLD1', remExternalId: 'XE1', remListId: 'OLDLIST', syncState: 'linked' });
  await t.db.putTask({ ...task('b', 'なくなった'), remItemId: 'OLD2', remExternalId: 'XE2', remListId: 'OLDLIST', syncState: 'linked' });
  const r = await t.sync.sync();
  const a = await t.db.getTask('a'), b = await t.db.getTask('b');
  assert.equal(a.remItemId, 'NEW1'); assert.equal(a.remListId, 'L1'); assert.equal((await t.db.listTasks()).length, 2);
  assert.equal(b.syncState, 'pending'); assert.equal(b.remExternalId, 'XE2'); assert.equal(r.lost, 1);
  assert.equal(t.K.count('createReminder'), 0); // 自動では作らない
  assert.ok(t.events.some((e) => e.type === 'lost'));
  await t.sync.sync(); assert.equal(t.K.count('createReminder'), 0);
  const x = await t.sync.reexportLost();
  assert.equal(x.n, 1); assert.equal(t.K.count('createReminder'), 1);
  const b2 = await t.db.getTask('b');
  assert.equal(b2.syncState, 'linked'); assert.equal(b2.remListId, 'L1'); assert.notEqual(b2.remItemId, 'OLD2');
  await t.sync.reexportLost(); assert.equal(t.K.count('createReminder'), 1); // 二重にならない
});
