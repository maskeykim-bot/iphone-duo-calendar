// v19.6（征希さん 2026-11-26「予定ノート」）: ノートの任意の項目 eventRef。版は 6 のまま、無ければ今までと同じ形
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normEventRef, duoRefKey, extRefKey } from '../js/event-ref.js';
import { buildBackup, validateBackup, VERSION } from '../js/backup.js';

const now = 1790000000000;
const N = (x = {}) => ({ id: 'n1', body: '段取り\n- [ ] 価格表', folderId: null, pinned: false, pinnedAt: null, createdAt: now, updatedAt: now, deletedAt: null, date: null, ...x });
const R = { k: 'd:ev1', title: 'IMAの卸商談', day: '2026-11-25' };

test('鍵: Duo の予定は d:、繰り返しの回は @回。iPhone の予定は x:。日付は鍵に入らない（動かしても同じ鍵）', () => {
  assert.equal(duoRefKey('ev1'), 'd:ev1');
  assert.equal(duoRefKey('ev1', '2026-11-25T10:00'), 'd:ev1@2026-11-25T10:00');
  assert.equal(extRefKey('ABC'), 'x:ABC');
  assert.equal(extRefKey('ABC', '2026-11-25T10:00'), 'x:ABC@2026-11-25T10:00');
  assert.equal(duoRefKey(''), ''); assert.equal(extRefKey(''), '');
});

test('形: 正しい物だけ通す。題名は 200 字で切る。日は正しい日付だけ', () => {
  assert.deepEqual(normEventRef(R), R);
  assert.deepEqual(normEventRef({ k: 'x:A', title: 'a'.repeat(300), day: 'x' }), { k: 'x:A', title: 'a'.repeat(200), day: '' });
  for (const bad of [null, 'd:x', {}, { k: 'e:1' }, { k: 'd:' }, { k: 3 }, { k: 'd:' + 'a'.repeat(500) }]) assert.equal(normEventRef(bad), null, JSON.stringify(bad));
});

test('バックアップ: 版は 6 のまま。予定ノートだけ eventRef を書き、読み戻すと戻る。ふつうのノートは今までと同じ形。壊れた印は落として中身は読む', () => {
  const out = buildBackup([], {}, new Date(now), [], [], [], [N({ eventRef: R }), N({ id: 'n2' })], []);
  assert.equal(out.version, VERSION); assert.equal(VERSION, 6);
  assert.deepEqual(out.notes.map((n) => n.eventRef), [R, undefined]);
  assert.equal(JSON.stringify(out.notes[1]).includes('eventRef'), false);
  const back = validateBackup(JSON.stringify(out));
  assert.equal(back.ok, true); assert.deepEqual(back.data.notes.map((n) => n.eventRef), [R, undefined]);
  out.notes[1].eventRef = { k: 'bogus' };
  const b2 = validateBackup(JSON.stringify(out));
  assert.equal(b2.ok, true); assert.equal('eventRef' in b2.data.notes[1], false);
});
