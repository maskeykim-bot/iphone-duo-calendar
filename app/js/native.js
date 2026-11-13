// iOS ネイティブ（Capacitor の DuoNative プラグイン）への呼び出しを集約する。@capacitor/core は読み込まない。
// プラグインは capacitorDidLoad で登録されるため Capacitor.Plugins / isPluginAvailable には頼らない。
export function nativeAvailable() {
  try {
    const c = window.Capacitor;
    return !!(c?.isNativePlatform?.() && c.getPlatform?.() === 'ios' && typeof c.nativePromise === 'function');
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

// 表示用日本語（message は直接出さない）。
export function errText(e, fallback) {
  switch (errCode(e)) {
    case 'PERMISSION_DENIED': return 'カレンダーへのアクセスが許可されていません。';
    case 'RESTRICTED': return 'この端末ではカレンダーへのアクセスが制限されています。';
    case 'CALENDAR_NOT_FOUND': return '追加先のカレンダーが見つかりません。';
    case 'READ_ONLY': return 'このカレンダーには追加できません。';
    default: return fallback;
  }
}
