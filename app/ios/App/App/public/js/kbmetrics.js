// キーボード計測（設定 › 詳細だけに表示する一時計測。保存・送信しない。レイアウトや高さは変更しない）。
// 審査版では KB_METRICS_ENABLED を false にすると表示も購読も無効になる。
export const KB_METRICS_ENABLED = false;

const r = (n) => Math.round(n * 100) / 100;
const fin = (n) => (Number.isFinite(n) ? n : null);

// vv: window.visualViewport 相当（なければ null）。H: window.innerHeight。
// kbTop = visualViewport の下端（offsetTop + height）。viewport がなければ null。
// 推定キーボード分 = max(0, innerHeight − kbTop)。
export function kbMetrics({ innerHeight, vv, posture, segments } = {}) {
  const H = fin(innerHeight);
  const has = !!vv && fin(vv.height) !== null;
  const height = has ? vv.height : null;
  const offsetTop = has ? (fin(vv.offsetTop) ?? 0) : null;
  const scale = has ? (fin(vv.scale) ?? 1) : null;
  const kbTop = has ? offsetTop + height : null;
  const est = has && H !== null ? Math.max(0, H - kbTop) : null;
  return { innerHeight: H, vvHeight: height, offsetTop, scale, kbTop, kbEstimate: est, devicePosture: !!posture, segments: !!segments };
}

export function kbText(m) {
  if (!m) return '';
  const v = (n) => (n === null || n === undefined ? '—' : String(r(n)));
  return [
    `innerHeight ${v(m.innerHeight)}`,
    m.vvHeight === null ? 'visualViewport なし' : `vv 高さ ${v(m.vvHeight)} · offsetTop ${v(m.offsetTop)} · scale ${v(m.scale)}`,
    `kbTop ${v(m.kbTop)}`,
    `推定キーボード ${v(m.kbEstimate)}`,
    `devicePosture ${m.devicePosture ? 'あり' : 'なし'} · segments ${m.segments ? 'あり' : 'なし'}`,
    'division/frame/angle/status 未取得',
  ].join(' · ');
}

// 画面寸法の診断（設定 › 詳細。コピー用に2行の文字列へ整形する）。
const dn = (n) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '—');
export function screenText({ innerWidth, innerHeight, dpr, screenW, screenH, safe } = {}) {
  const S = safe || {};
  return `画面 ${dn(innerWidth)}×${dn(innerHeight)} CSS px ・ DPR ${dn(dpr)} ・ screen ${dn(screenW)}×${dn(screenH)}\nsafe-area 上${dn(S.top)} 右${dn(S.right)} 下${dn(S.bottom)} 左${dn(S.left)}`;
}
