// 第19.5版: 閉じた画面の日の欄「時間」の、伸び縮みする時間軸（純関数）。
// 1時間の高さは基本 hh。予定のカードが minCard より低くなる時間だけ、その時間（15分の区切り）を広げる（予定のない時間は詰まったまま）。
// 予定どうしは時刻の順のまま並び、時刻が重ならない予定はカードも重ならない。

// blocks: [{ s, en }]（分。0〜1440、en > s）→ 96 個の「15分の高さ」（基本は hh / 4）
export const STEP = 15, SLOTS = 1440 / STEP;
export function elasticHours(blocks, hh, minCard) {
  const H = Array(SLOTS).fill(hh * STEP / 60);
  const span = (b) => { let y = 0; for (let i = Math.floor(b.s / STEP); i < SLOTS && i * STEP < b.en; i++) y += (Math.min(b.en, i * STEP + STEP) - Math.max(b.s, i * STEP)) / STEP * H[i]; return y; };
  for (const b of [...blocks].sort((a, c) => a.s - c.s || a.en - c.en)) {
    const dur = b.en - b.s; if (!(dur > 0)) continue;
    const lack = minCard - span(b); if (lack <= 0) continue;
    const add = lack * STEP / dur; // かかっている区切りすべてに同じだけ足すと、カードはちょうど lack 伸びる
    for (let i = Math.floor(b.s / STEP); i < SLOTS && i * STEP < b.en; i++) H[i] += add;
  }
  return H;
}

// H（96 個の高さ）→ 分⇄位置（0:00 を 0 とした px）
export function elasticMap(H) {
  const top = [0]; for (let i = 0; i < SLOTS; i++) top.push(top[i] + H[i]);
  const y = (m) => { const mm = Math.min(1440, Math.max(0, m)), i = Math.min(SLOTS - 1, Math.floor(mm / STEP)); return top[i] + (mm - i * STEP) / STEP * H[i]; };
  const min = (py) => {
    if (py <= 0) return py / H[0] * STEP; // 上へはみ出した分も、端の速さで続ける（指の動きを切らない）
    if (py >= top[SLOTS]) return 1440 + (py - top[SLOTS]) / H[SLOTS - 1] * STEP;
    let lo = 0, hi = SLOTS - 1; while (lo < hi) { const c = (lo + hi + 1) >> 1; if (top[c] <= py) lo = c; else hi = c - 1; }
    return lo * STEP + (py - top[lo]) / H[lo] * STEP;
  };
  return { y, min, total: top[SLOTS] };
}

// 見えている範囲（from〜to 分）の高さが target になる hh を、lo〜hi の間で探す（高さは hh について単調）
export function solveHh(blocks, minCard, from, to, target, lo, hi) {
  const mc = (hh) => (typeof minCard === 'function' ? minCard(hh) : minCard); // minCard は数か、1時間の高さから決める関数
  const hOf = (hh) => { const m = elasticMap(elasticHours(blocks, hh, mc(hh))); return m.y(to) - m.y(from); };
  if (target <= hOf(lo)) return lo;
  if (target >= hOf(hi)) return hi;
  let a = lo, b = hi;
  for (let i = 0; i < 24; i++) { const c = (a + b) / 2; if (hOf(c) < target) a = c; else b = c; }
  return (a + b) / 2;
}
