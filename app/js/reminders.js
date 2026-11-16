// タスク（iPhone のリマインダー）: 許可の確認と案内。状態確認だけでは許可を求めない。
export const REM_STATES = ['notDetermined', 'granted', 'denied', 'restricted'];
const norm = (s) => (REM_STATES.includes(s) ? s : 'denied');

// 状態だけ確認する（request はしない）。bridge 不在・失敗は 'unavailable'。
export async function checkReminderAccess(call) {
  try { const r = await call('reminderPermission', {}); return norm(r?.status); } catch { return 'unavailable'; }
}
// ボタンからだけ呼ぶ。許可ダイアログを出し、結果の状態を返す。
export async function requestReminderAccess(call) {
  try { const r = await call('requestReminderPermission', {}); return norm(r?.status); } catch { return 'unavailable'; }
}

// 一覧取得（第14版 PR14）。listIds は全 id を渡す（空は空結果）。completedSince は Stamp。
// 失敗は呼び出し側へ投げる（CANCELLED は後続の取得に置き換わった印）。タスク本文は保存しない。
export async function listReminders(call, listIds, completedSince) {
  const r = await call('listReminders', { listIds: [...listIds], completedSince });
  return Array.isArray(r?.reminders) ? r.reminders : [];
}

export const REM_TEXT = {
  intro: 'iPhone のリマインダーと同じタスクを、ここで見たり追加したりできます。',
  allow: 'リマインダーへのアクセスを許可',
  denied: '設定アプリでリマインダーへのアクセスを許可すると使えます。',
  settings: '設定を開く',
  restricted: 'この端末ではリマインダーへのアクセスが制限されています。',
  web: 'タスクは iPhone のアプリで使えます。',
};

// state: null（確認中）| 'unavailable' | 'notDetermined' | 'denied' | 'restricted'。granted は呼び出し側が通常のページを出す。
export function taskAccessHtml(state, where, native) {
  const w = String(where).replace(/[^a-z]/g, '');
  let body;
  if (!native || state === 'unavailable') body = `<p class="remtx">${REM_TEXT.web}</p>`;
  else if (state === 'denied') body = `<p class="remtx">${REM_TEXT.denied}</p><button type="button" class="rembtn" data-act="remsettings" data-where="${w}">${REM_TEXT.settings}</button>`;
  else if (state === 'restricted') body = `<p class="remtx">${REM_TEXT.restricted}</p>`;
  else if (state === 'notDetermined') body = `<p class="remtx">${REM_TEXT.intro}</p><button type="button" class="rembtn" data-act="remreq" data-where="${w}">${REM_TEXT.allow}</button>`;
  else body = `<p class="remtx">${REM_TEXT.intro}</p>`; // 確認中
  return `<div class="pagewait padb remgate" data-wait="task" data-remstate="${native ? state || 'checking' : 'web'}" data-where="${w}">${body}</div>`;
}
