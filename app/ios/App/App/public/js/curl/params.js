// ページめくり（curl-v1）の値。曲がり方・影・時間・緩急は curl-v1 のまま変えない（design/21 §6.12、第18版の決まり）。
// 値は Object.freeze。試験で変えたいときは createRenderer の { k } で、その1つの描画器だけに上書きする。
export const K = Object.freeze({
  show: 0.16,        // 裏の透かし（表の内容を左右反転して混ぜる割合）
  backLine: 0.75,    // 裏の罫線の濃さ（表の罫線に対する割合）
  nextOnBack: 0,     // 裏には次の日を混ぜない。着地専用の紙だけ別途描く
  debug: 0,          // 1＝面の色分け（撮影の自動チェック用）
  hiF: 0.38, hiFdeg: 24, hiFw: 11,   // 巻きの表の光る筋
  ampR0: 8, ampR1: 28, // 半径 8pt 以下で巻きの明暗 0、28pt 以上で 100%
  dkFm: 0.0045,      // 暗い筋の 43° での傾き（1° あたり）
  hiMinW: 3,         // 光の筋の画面上の最小の幅（pt）
  hiDark: 0.25,      // ダークで光の筋を何倍にするか
  hiMask: 1,         // 光を紙色にだけ足す
  dkF0: 0.06, dkF1: 0.36, dkFa: 43, dkFb: 89, // 巻きの表の暗い筋（43°〜89° で 6%→36%）
  dkB: 0.30, hiB: 0.45, hiBdeg: 160, hiBw: 6, // 巻きの裏
  flatB: 0.0, flatBw: 60,            // 平らな裏の暗さ
  shOp0: 0.42, shOpK: 0.22, shBl0: 7, shBlK: 34, shOff0: 3, shOffK: 10, // 落ちる影
  rootA0: 0.12, rootAK: 0.0, rootIn: 10, rootOut0: 9, rootOutK: 1,     // 根元の影
  groove: 0.0,       // 溝の上で紙を暗くする量
  persp: 0,          // 遠近（0 で無し）
  grid: 2,           // 網目の細かさ（pt）
  darkShadow: 0.5,   // ダークの落ちる影の強さ（ライトの半分）
});
// 紙の曲がり方
export const TUNE = Object.freeze({ maxTilt: 35, r0: 14, rk: 0.18, rMax: 58, flatten: 90 });
// 時間（ミリ秒）と判定
export const TIME = Object.freeze({
  page: 300,       // めくり切る（out の3乗）
  back: 220,       // 戻る（out の3乗）
  fade: 150,       // 着地・視差効果を減らす入れ替え・前へ／戻りの左端（cubic-bezier(.2,.8,.2,1)）
  showFrom: 0.6,   // 透かし 16%→0 を始める位置（0.30 秒の後ろ 40%）
  lift: 100,       // 辺 24pt から触れたときに角を持ち上げる時間
});
export const JUDGE = Object.freeze({ flick: 500, liftPx: 12, edge: 24, dragStart: 12 }); // 500pt/秒以上の払い・持ち上げ量・辺の幅・動きの始め
export const easeOut3 = (u) => 1 - Math.pow(1 - u, 3);
// cubic-bezier(.2,.8,.2,1) を数値で解く
export const easeStd = (u) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2, x = 3 * (1 - m) * (1 - m) * m * 0.2 + 3 * (1 - m) * m * m * 0.2 + m * m * m; x < u ? lo = m : hi = m; }
  const m = (lo + hi) / 2;
  return 3 * (1 - m) * (1 - m) * m * 0.8 + 3 * (1 - m) * m * m + m * m * m;
};
// 色。ライトの紙は #FFFDFA（左右のページも紙の裏も）。試作の #F7F4ED は使わない（比べるときだけ引数で渡す）
export const LIGHT = Object.freeze({ paper: '#FFFDFA', back: '#FFFDFA', line: '#EEEAE1', edge: '#CFCAC0', bg: '#F0EDE5', groove: '#E9E5DB' });
// ダーク（design/26 §4）。ページのダーク配色ができるまで enabled は false のまま。
export const DARK = Object.freeze({ enabled: false, paper: '#262A27', back: '#262A27', line: '#343A36', edge: '#3A403B', bg: '#161917', groove: '#141614' });
