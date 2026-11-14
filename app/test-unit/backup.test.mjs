import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, validateBackup } from '../js/backup.js';
import { ev } from './fixtures.mjs';

const linked = ev('L', '2026-11-20T10:00', '2026-11-20T11:00', null, { nativeLink: { state: 'linked', requestId: 'r1', eventId: 'E1', calendarId: 'C' } });
const settings = { view: 'month', style: 'simple', desk: false };

test('バックアップの往復（基本項目）', () => {
  const bk = buildBackup([ev('x', '2026-11-20T10:00', '2026-11-20T11:00', null)], settings);
  const v = validateBackup(JSON.stringify(bk));
  assert.equal(v.ok, true);
  assert.equal(v.data.events[0].title, 'tx');
});

test('未知の項目 nativeLink を書き出し・復元で保持する', { todo: '現状の不具合: clean() が nativeLink を落とす（probe_recur の backupKeepsNativeLink / restoredHasLink）。V9 の連携・通知で保持が必要' }, () => {
  const bk = buildBackup([linked], settings);
  assert.ok('nativeLink' in bk.events[0]);
  const v = validateBackup(JSON.stringify(bk));
  assert.ok('nativeLink' in v.data.events[0]);
});

test('現状の挙動の記録: nativeLink は落ちる（保持を実装したらこのテストと todo を差し替える）', () => {
  const bk = buildBackup([linked], settings);
  assert.equal('nativeLink' in bk.events[0], false);
  const v = validateBackup(JSON.stringify(bk));
  assert.equal(v.ok, true);
  assert.equal('nativeLink' in v.data.events[0], false);
});
