// 第11版 PR4: 通知の画面用の純粋関数（符号化・選択肢・終日変換・重複・次の通知）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { alarmLabel, alarmOptions, alarmsAria, alarmsDup, convertAlarms, decAlarm, encAlarm, nextNotifyText, pastForNotify } from '../js/notify.js';

test('符号化は往復できる。不正は null', () => {
  for (const a of [{ before: 0 }, { before: 2880 }, { day: 7, at: '08:00' }, { day: 1, at: '09:30' }]) assert.deepEqual(decAlarm(encAlarm(a)), a);
  assert.equal(encAlarm(null), '');
  assert.equal(decAlarm(''), null);
  assert.equal(decAlarm('x1'), null);
});
test('選択肢: 時刻あり10・終日5（なしを含む）。標準外の現在値は足す', () => {
  assert.equal(alarmOptions(false).length, 10);
  assert.deepEqual(alarmOptions(true).map((o) => o.label), ['なし', '当日 8:00', '前日 8:00', '2日前 8:00', '1週間前 8:00']);
  assert.ok(alarmOptions(true, [{ day: 1, at: '09:00' }]).some((o) => o.label === '前日 9:00'));
});
test('終日の変換: 1日前以上は前日、他は当日。戻すと既定。[] と未定義は維持。同値はまとめる', () => {
  const s = { defaultTimed: { before: 15 } };
  assert.deepEqual(convertAlarms([{ before: 1440 }, { before: 5 }], true, s), [{ day: 1, at: '08:00' }, { day: 0, at: '08:00' }]);
  assert.deepEqual(convertAlarms([{ before: 5 }, { before: 10 }], true, s), [{ day: 0, at: '08:00' }]);
  assert.deepEqual(convertAlarms([{ day: 2, at: '08:00' }, { day: 0, at: '08:00' }], false, s), [{ before: 15 }]);
  assert.deepEqual(convertAlarms([], true, s), []);
  assert.equal(convertAlarms(undefined, true, s), undefined);
});
test('重複の検出・読み上げ', () => {
  assert.equal(alarmsDup([{ before: 5 }, { before: 5 }]), true);
  assert.equal(alarmsDup([{ before: 5 }, { before: 10 }]), false);
  assert.equal(alarmsAria([{ before: 30 }, { before: 1440 }]), '通知 30分前、1日前');
  assert.equal(alarmsAria([]), '');
  assert.equal(alarmLabel({ before: 0 }), '予定の時刻');
});
test('次の通知の表示と過去判定', () => {
  const now = new Date(2026, 10, 12, 9, 41);
  const occ = { all: false, start: '2026-11-12T10:00', end: '2026-11-12T11:00', alarms: [{ before: 30 }, { before: 5 }] };
  assert.equal(nextNotifyText(occ, now), '9:55');
  assert.equal(nextNotifyText({ ...occ, alarms: [{ before: 1440 }, { before: 5 }] }, now), '9:55');
  assert.equal(nextNotifyText({ ...occ, start: '2026-11-14T10:00', alarms: [{ before: 30 }] }, now), '11/14 9:30');
  assert.equal(nextNotifyText({ ...occ, alarms: [{ before: 30 }] }, now), '');
  assert.equal(pastForNotify({ all: false, start: '2026-11-01T10:00', end: '2026-11-01T11:00' }, [{ before: 5 }], now), true);
  assert.equal(pastForNotify({ all: true, start: '2026-11-12T00:00', end: '2026-11-12T23:59' }, [{ day: 0, at: '08:00' }], now), true);
  assert.equal(pastForNotify({ all: true, start: '2026-11-13T00:00', end: '2026-11-13T23:59' }, [{ day: 0, at: '08:00' }], now), false);
});
