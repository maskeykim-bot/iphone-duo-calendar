// 開いた縦の日・週タブ：1枚の紙・2つの窓（第19版 PR7、design/29 案A）。DOM に依存しない計算だけ。
// 紙は 0:00〜24:00（1時間 FOLD_HH）＋下の余白。上の窓は紙の s から、下の窓は s＋上の窓の高さ から始まる（折り目で時刻を飛ばさない）。
export const FOLD_HH = 44;
export const FOLD_DAY_MIN = 24 * 60;
export const FOLD_EDGE = 40; // 自動スクロールの帯（外側の端だけ）
export const FOLD_RATE = (FOLD_HH / 60) * 120; // 1秒に2時間分（pt/秒）
export const LABEL_PAD = 8; // 窓の端から 8 以内のラベルは内側 8 へ寄せる

// 終日の段の高さ。日は 32（2段 56・3段 80）、週は 24（2段 42・3段 60）。
export const alldayHeight = (week, rows) => (week ? 24 + 18 * (Math.max(1, rows) - 1) : 32 + 24 * (Math.max(1, rows) - 1));

// g: { head, week, rows, cut0, cut1, tabsTop, winBot }。head＝見出しの上（y82）。
export function foldGeometry({ head, week, rows, cut0, cut1, tabsTop, winBot }) {
  const hdr = 44, dates = week ? 44 : 0, allH = alldayHeight(week, rows);
  const winTop = head + hdr + dates + allH;
  const edge = tabsTop - 8; // 24:00 の線の下限・下の端の自動スクロール帯の下
  const topH = Math.max(0, cut0 - winTop), botH = Math.max(0, winBot - cut1);
  const margin = Math.max(0, winBot - edge);
  const paperH = FOLD_HH * 24 + margin;
  const smax = Math.max(0, paperH - botH - topH);
  return { head, week, rows, hdr, dates, allH, winTop, cut0, cut1, winBot, edge, topH, botH, margin, paperH, smax, allTop: head + hdr + dates };
}

// 紙の位置 s（上の窓の上の端の紙 px）→ 窓ごとの時刻（分）の範囲。下の窓の上の端の時刻＝上の窓の下の端の時刻（tc）。
export function windowMinutes(g, s) {
  const k = 60 / FOLD_HH, tc = (s + g.topH) * k;
  return { top: [s * k, tc], bot: [tc, tc + g.botH * k], tc };
}

// 指の高さ y → 紙の時刻（分・生の値）。折り目の間（cut0〜cut1）は境の時刻で止まる。タブ（edge より下）は edge として扱う。
export function rawMinutesAt(g, s, y) {
  const k = 60 / FOLD_HH, yy = Math.min(y, g.edge);
  if (yy <= g.cut0) return (yy - g.winTop + s) * k;
  if (yy < g.cut1) return (g.topH + s) * k;
  return (yy - g.cut1 + s + g.topH) * k;
}

// 自動スクロールの向き（-1 上／0／+1 下）。外側の端だけ（上の窓の上 40、タブの上 40〜）。折り目の側ではしない。
export function foldEdgeZone(g, y) {
  if (y < g.winTop + Math.min(FOLD_EDGE, g.topH / 2)) return -1;
  if (y > g.edge - FOLD_EDGE) return 1;
  return 0;
}

// 窓の中のラベルの位置。m＝時刻（分）、t0〜t1＝窓の範囲（分）、h＝窓の高さ。窓の外なら null。
// last＝下の窓か（上の窓は境ちょうどを含めない。境と同じ時刻は下の窓だけに出す）。
export function labelY(m, t0, t1, h, bottom) {
  const y = ((m - t0) * FOLD_HH) / 60;
  if (y < -1e-6 || y > h + 1e-6) return null;
  if (!bottom && m >= t1 - 1e-6) return null; // 上の窓は境を出さない
  return Math.min(Math.max(y, LABEL_PAD), Math.max(LABEL_PAD, h - LABEL_PAD));
}

// またぐ予定の題名・時刻の出し方。hA＝上の部分の見えている高さ、hB＝下の部分。day＝日タブか。
// 返り値: { a: {title,time,small}, b: {...} }
export function partTitles(hA, hB, day) {
  const r = { a: { title: false, time: false, small: false }, b: { title: false, time: false, small: false } };
  if (hA < 18 && hB < 18) {
    const big = hA >= hB ? 'a' : 'b';
    r[big].title = true; r[big].small = true;
    return r;
  }
  const first = hA >= 18 ? 'a' : 'b';
  r[first].title = true;
  if (day && (first === 'a' ? hA : hB) >= 34) r[first].time = true;
  if (hB >= 30) r.b.title = true; // 下の部分が 30 以上なら題名をもう一度（時刻は出さない）
  return r;
}

// 予定（分 s〜en）が境 tc をまたぐか。
export const straddles = (s, en, tc) => s < tc && en > tc;

// 開いたときの上の窓の上の端（分）。今日は「今−1時間」（15分に切り下げ）、ほかは最初の予定−1時間、なければ 8:00。
export function openingMinute({ today, nowMin, firstStart }) {
  const snap = (m) => Math.floor(m / 15) * 15;
  if (today) return Math.max(0, snap(nowMin - 60));
  if (firstStart != null) return Math.max(0, snap(firstStart - 60));
  return 8 * 60;
}

export const clampS = (g, s) => Math.min(g.smax, Math.max(0, s));
