// design/34-closed-pull-stages.md の数字（2026-11-20 11:36 の改訂が今の値。§12 で確定）。テストはここだけを見る。仕様が変わったらここを直す。
// 上の節と違うところは §12 を優先する。264・352・384・410 は格子 504 のころの古い引いた量で、使わない。
export const SCREEN = { w: 466, h: 678, railX: 382, homeBarTop: 645 };
export const HEAD = { h: 44, titleFs: 17, titleCx: 191, weekdayTop: 44, weekdayH: 20, gridTop: 64 };
export const GRID = { x0: 8, x1: 374, cellW: 52.3 };
export const ROW = { 4: 86, 3: 70, 2: 54 };       // §2.2（下のあき 2）
export const DATE_ROW = 22;                         // 日付の行
export const CHIP = { top: (k) => 22 + 16 * k, h: 14 }; // k 段目のチップ
// 段 1〜7（§2.2 の表）。段8（日の欄だけ）は入れない。
export const STAGES = [
  null,
  { n: 1, name: '月・4件', rows: 6, cap: 4, H: 516, grabLine: [590, 594], dayTop: 604 },
  { n: 2, name: '月・3件', rows: 6, cap: 3, H: 420, grabLine: [494, 498], dayTop: 508 },
  { n: 3, name: '月・2件', rows: 6, cap: 2, H: 324, grabLine: [398, 402], dayTop: 412 },
  { n: 4, name: '2週・4件', rows: 2, cap: 4, H: 172, grabLine: [246, 250], dayTop: 260 },
  { n: 5, name: '2週・3件', rows: 2, cap: 3, H: 140, grabLine: [214, 218], dayTop: 228 },
  { n: 6, name: '2週・2件', rows: 2, cap: 2, H: 108, grabLine: [182, 186], dayTop: 196 },
  { n: 7, name: '1週・4件', rows: 1, cap: 4, H: 86, grabLine: [160, 164], dayTop: 174 },
];
// §3 段の境（H）と、段1から上へ引いた量
export const BOUNDS = [
  { between: [1, 2], H: 468, pull: 48 },
  { between: [2, 3], H: 372, pull: 144 },
  { between: [3, 4], H: 248, pull: 268, swap: '6行→2行' },
  { between: [4, 5], H: 156, pull: 360 },
  { between: [5, 6], H: 124, pull: 392 },
  { between: [6, 7], H: 97, pull: 419, swap: '2行→1行（曜日も）' },
];
export const GRAB = { zone: 24, line: { w: 36, h: 4, r: 2, from: 10 }, hit: { x0: 8, x1: 374, h: 44 }, color: '#B9B4A8', colorDark: '#68716A', pressed: '#68716A' };
export const RUBBER = { k: 0.3, max: 24, backSec: 0.22 };
// v は離す前 80ms の動き（最初と最後の点の差÷時間）。点が2つないときは v＝0。H′＝H＋v×0.15。H′ がちょうど中間なら、v が負（上へ）なら段の数字が大きい方、v≧0 なら小さい方へ寄せる（§12 Q-7）。
export const SNAP = { sec: 0.25, secLong: 0.30, longOver: 200, maxJump: 2, vK: 0.15, vWindowMs: 80, tapUnder: 6, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' };
export const SWAP = { outFrom: 0, outTo: 0.08, inFrom: 0.08, inTo: 0.20, ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)', headSec: 0.15 };
// 第19.4版（design/36 §15.3）: 左の線は 2.5×10・角丸 1.25、文字は左 7。終日・複数日はベタ塗りをやめ、ごく薄い地＋左の線＋墨の文字（文字の色は #293B35 だけ）
export const CHIPS = { timedLine: { w: 2.5, h: 10, r: 1.25, left: 2 }, timedTextLeft: 7, allDayRadius: 3, minContrast: 4.5, textColors: ['#FFFFFF', '#1C1F1D'], fadeGapFull: 2 };
export const DAYLIST = { x0: 12, x1: 370, head: 44, headFs: 17, allDayChipH: 28, allDayChipR: 14, cardH: 56, cardR: 14, cardGap: 8, bottomPad: 41, noteRow: 44, noteMin: 88, empty: 44, bg: '#EFECE4', bgDark: '#262A27' };
export const DAYGRIP = { toTimeline: 40, hourB: 44, hourC: 88, cAt: 128, snapBC: 66 };
// §12 Q-3: vis＝見える丸 48、hit＝上下左右に 4 広げた押せる範囲 56×56
// v19.5（征希さん「直感的に操作できるよう変更したい」。右の列＝ホーム・タスク・ノート／月の固定／今日・検索・…／＋）で仕様変更: タスクは上のまとまりの 2 つ目（押せる 50×50＝x399〜449・y210〜260、見える地 44×40）、「…」は下のまとまりの 3 つ目（y536〜586）。「元に戻す」は今までのタスクの位置（y172〜220）のまま
export const RAIL = {
  // まとまりの中のボタンに 48 の丸は無い（見える地は 44×40）。spec の visCircle は 48 の箱が無ければ押せる範囲の箱を返すので、vis も押せる範囲の値
  tasks: { vis: { x: [399, 449], y: [210, 260] }, hit: { x: [399, 449], y: [210, 260] } },
  more:  { vis: { x: [399, 449], y: [536, 586] }, hit: { x: [399, 449], y: [536, 586] } },
  undo:  { vis: { x: [400, 448], y: [172, 220] }, hit: { x: [396, 452], y: [168, 224] } },
  plus:  { vis: { x: [400, 448], y: [598, 646] }, hit: { x: [396, 452], y: [594, 650] } },
};
// §12 Q-10: 上下のあき 8（8＋44×5＋8＝236）。行の間の線 0.5 #E4E0D6、左右の内側 16。
export const MENU = { x: [152, 376], y: [401, 637], w: 224, row: 44, pad: 8, inset: 16, line: { h: 0.5, color: '#E4E0D6' }, r: 12, fs: 15, items: ['ホーム', '週の時間軸', '検索', '月の表現', '設定'] };
export const CELL = { pressBg: '#E2DDD2', pressSec: 0.10, longPressSec: 0.35, plusN: { fs: 11, right: 4, color: '#68716A' }, date: { fs: 14, w: 600, left: 4 }, today: { d: 20, cx: 13, cy: 11 } }; // 今日の数字は丸の中央 (x+13, y+11)。今日以外は左 4（§12 Q-2）
export const NOTE_EDIT = { restoreSec: 0.15 };
export const HINT = { box: { x: [56, 326], h: 52, r: 16 }, nudge: 8, times: 2, sec: 0.6, hideAfter: 6 };
// §12 Q-11: 「今日へ」の押せる範囲 64×44。たたいても段は変えない。格子の送りは 0.30 秒。
export const TODAY = { hit: { x: [318, 382], y: [0, 44] }, keepStage: true, moveSec: 0.30 };
// §12 Q-14: 指に 1:1 ＝毎フレーム、H の変化と指の縦の動きの差が 1pt 以内、遅れ 1 フレーム（16.7ms）以内。
export const FOLLOW = { maxDeltaPt: 1, maxLagMs: 16.7 };
// §12 Q-14: 見出しの見えないボタン「前の月」「次の月」。段1は1か月、2週は1週、1週は7日。
export const MONTH_NAV = { prev: '前の月', next: '次の月', byStage: { 1: 'month', 4: 'week', 7: 'week' } };
// §3・§12 Q-9: 境をまたぐたびに軽い触覚1回。window.__duoHapticLog に {stage, t} を足す（開発責任者が決定）。stage はまたいだ先の段。
export const HAPTIC = { log: '__duoHapticLog', perBoundary: 1, crossings1to7: 6, stagesUp: [2, 3, 4, 5, 6, 7], stagesDown: [6, 5, 4, 3, 2, 1] };
export const TOL = 0.5; // §11 の1「差 0.5 以内」
// 決まった扱い（11:29〜11:36、§12）
export const DECIDED = { startScreen: 'calendar', firstStage: 1, rokuyoInCells: false, oneWeekFromSelected: true, tapInOneWeekKeepsRow: true, dayOnlyStage: 'none' };
