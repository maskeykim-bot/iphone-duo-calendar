// 旧「日ごとのメモ」の固定fixture。第11弾試作の seedV4 と同じ中身（決定的）。製品コードには依存しない。
import { createHash } from 'node:crypto';
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const T0 = Date.UTC(2025, 0, 1);
export const CASES = [
  ['2026-11-14', '会議メモ\n・A社 10時\n・資料'], ['2026-11-15', '11月15日（日）\n既に日付が1行目'], ['2026-11-16', '2026年11月16日（月）\n年付きの見出し'],
  ['2024-02-29', 'うるう日 😀 絵文字\r\nCRLF行'], ['2025-12-31', '- [ ] 牛乳\n- [x] 卵'], ['2026-01-01', '  先頭空白\n\n\n末尾改行\n\n'],
  ['2026-11-17', 'x'.repeat(100000)], ['2026-03-01', '<script>alert(1)</script> & "quote"'],
];
// 3008件（8 + 3000）。空白だけのメモは旧ストアに存在しないので含めない。
export function makeLegacyMemos(extra = 3000) {
  const out = CASES.map(([date, text]) => ({ id: date, date, text, createdAt: T0 + 1000, updatedAt: T0 + 1000, ink: null }));
  const used = new Set(CASES.map((c) => c[0]));
  for (let i = 0; i < extra; i++) {
    const date = new Date(Date.UTC(2015, 0, 1) + i * 864e5).toISOString().slice(0, 10);
    if (used.has(date)) continue;
    out.push({ id: date, date, text: `メモ ${i}\n${'本文'.repeat(i % 300)}`, createdAt: T0 + i, updatedAt: T0 + i, ink: null });
  }
  return out;
}
// 元本文の指紋（日付＋NUL＋本文のsha256を並べ替えて連結）。試作と同じ値になる。
export const memoDigest = (date, text) => sha256(`${date}\u0000${text}`);
export const digestOf = (pairs) => sha256(pairs.map(([d, t]) => memoDigest(d, t)).sort().join());
export const FINGERPRINT_3008 = '6a4d19cecd001490ea2554638351ef6b5193722de7661905d5b9251d7b4fffd7';
