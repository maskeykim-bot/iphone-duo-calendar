// iOS ネイティブ（Capacitor の DuoNative プラグイン）への呼び出しを集約する。@capacitor/core は読み込まない。
// プラグインは capacitorDidLoad で登録されるため Capacitor.Plugins / isPluginAvailable には頼らない。
export function nativeAvailable() {
  try {
    const c = window.Capacitor;
    return !!(c?.isNativePlatform?.() && c.getPlatform?.() === 'ios' && typeof c.nativePromise === 'function');
  } catch { return false; }
}

// 入力補助バー（∧∨✓）を消す（第19.1版 S3、design/20 §2）。ネイティブのときだけ。Web では何もしない。失敗しても例外を外へ出さない。
// @capacitor/keyboard は bundler なしの静的 PWA なので window.Capacitor.Plugins.Keyboard（なければ nativePromise）で呼ぶ。
export function hideKeyboardAccessoryBar() {
  try {
    const c = window.Capacitor;
    if (!c?.isNativePlatform?.()) return false;
    const kb = c.Plugins?.Keyboard;
    const p = typeof kb?.setAccessoryBarVisible === 'function' ? kb.setAccessoryBarVisible({ isVisible: false })
      : typeof c.nativePromise === 'function' ? c.nativePromise('Keyboard', 'setAccessoryBarVisible', { isVisible: false }) : null;
    p?.catch?.(() => {});
    return !!p;
  } catch { return false; }
}

export const call = (method, options = {}) => new Promise((resolve, reject) => {
  try { window.Capacitor.nativePromise('DuoNative', method, options).then(resolve, reject); } catch (e) { reject(e); }
});

// 戻り値: callbackId（失敗時は null。失敗しても動作は続ける）。
export function listen(eventName, cb) {
  try {
    const c = window.Capacitor;
    if (typeof c?.nativeCallback !== 'function') return null;
    return c.nativeCallback('DuoNative', 'addListener', { eventName }, cb) ?? null;
  } catch { return null; }
}

export const errCode = (e) => (e && typeof e === 'object' && typeof e.code === 'string' ? e.code : '');

// NOT_EDITABLE / READ_ONLY の理由（Capacitor は data に載せる。reason の直下にも対応）。
export const errReason = (e) => (e && typeof e === 'object' ? (e.reason ?? e.data?.reason ?? null) : null);

// 表示用日本語（message は直接出さない）。
export function errText(e, fallback) {
  switch (errCode(e)) {
    case 'PERMISSION_DENIED': return 'カレンダーへのアクセスが許可されていません。';
    case 'WRITE_ONLY': return 'カレンダーのフルアクセスの許可が必要です。';
    case 'RESTRICTED': return 'この端末ではカレンダーへのアクセスが制限されています。';
    case 'CALENDAR_NOT_FOUND': return '追加先のカレンダーが見つかりません。';
    case 'READ_ONLY': return 'このカレンダーには追加できません。';
    case 'NOT_FOUND': return 'iPhone のカレンダーに元の予定が見つかりません。';
    case 'NOT_EDITABLE': return 'この予定は iPhone のカレンダー側でしか変更できません。';
    case 'CONFLICT': return 'iPhone のカレンダー側でも変更されています。';
    default: return fallback;
  }
}

// タスク（リマインダー）専用の表示用日本語。予定側の errText の文言は変えない。
export function reminderErrText(e, fallback) {
  switch (errCode(e)) {
    case 'PERMISSION_DENIED': return 'リマインダーへのアクセスが許可されていません。';
    case 'RESTRICTED': return 'この端末ではリマインダーへのアクセスが制限されています。';
    case 'CANCELLED': return 'リマインダーの取得を取り消しました。';
    case 'READ_ONLY': return 'このリストには追加できません。';
    case 'NOT_FOUND': return 'このリマインダーは削除されています。';
    case 'NOT_EDITABLE': return 'この繰り返しのリマインダーは完了のみ変更できます。';
    case 'LIST_NOT_FOUND': return '追加先のリストが見つかりません。';
    default: return fallback;
  }
}

// リマインダーの許可と一覧（第19版 D5）。同期をオンにした経路だけが呼ぶ（既定の同期オフでは0回）。
// native が無い・古くて関数が無いときは reject せず「使えない」を返す（呼び出し側は許可なし扱いにする）。
const unsupported = (e) => !nativeAvailable() || errCode(e) === 'UNIMPLEMENTED' || errCode(e) === 'UNAVAILABLE';
export const reminderPermission = () => (nativeAvailable() ? call('reminderPermission').then((r) => ({ status: r?.status || 'denied' }), (e) => (unsupported(e) ? { status: 'unavailable' } : Promise.reject(e))) : Promise.resolve({ status: 'unavailable' }));
export const requestReminderPermission = () => (nativeAvailable() ? call('requestReminderPermission').then((r) => ({ status: r?.status || 'denied' }), (e) => (unsupported(e) ? { status: 'unavailable' } : Promise.reject(e))) : Promise.resolve({ status: 'unavailable' }));
export const listReminderLists = () => (nativeAvailable() ? call('listReminderLists').then((r) => ({ lists: Array.isArray(r?.lists) ? r.lists : [] }), (e) => (unsupported(e) ? { lists: [], unavailable: true } : Promise.reject(e))) : Promise.resolve({ lists: [], unavailable: true }));

// リマインダーの同期（第19版 D7）。native が無い・古いときは UNAVAILABLE で reject する（同期側が「今回は何もしない」に倒す）。
const remCall = (method, o) => (nativeAvailable() ? call(method, o) : Promise.reject({ code: 'UNAVAILABLE', message: 'native is not available' }));
export const remNative = {
  permission: reminderPermission,
  lists: listReminderLists,
  listReminders: (o) => remCall('listReminders', o),
  createReminder: (o) => remCall('createReminder', o),
  updateReminder: (o) => remCall('updateReminder', o),
  setReminderDone: (o) => remCall('setReminderDone', o),
  deleteReminder: (o) => remCall('deleteReminder', o),
  checkReminderList: (o) => remCall('checkReminderList', o),
  createReminderList: (o) => remCall('createReminderList', o),
};

// 触覚（PR27）。kind: 'light'（刻みの変化）| 'warning'。非ネイティブ・失敗は無操作。不正な kind は INVALID_ARGUMENT で拒否。
export function haptic(kind = 'light') {
  if (kind !== 'light' && kind !== 'warning') return Promise.reject({ code: 'INVALID_ARGUMENT', message: 'kind' });
  if (!nativeAvailable()) return Promise.resolve({ performed: false });
  return call('selectionHaptic', { kind }).then((r) => ({ performed: !!r?.performed }), () => ({ performed: false }));
}
