// 第19.6版（征希さん 2026-11-26「予定ノート」）: ノートがどの予定のノートかの印（ノートの任意の項目 eventRef）。純関数だけ。
// 決まり: 1 予定に 1 ノート。繰り返しの予定は開催回ごとに別のノート。予定を動かしても印は変わらない（日付を k に入れない）。予定を消してもノートは残る。
// 保存の形: { k, title, day }。無ければ今までと同じ形（DB の版・バックアップの版は 6 のまま）。
//   k     … 予定を指す鍵。Duo の予定 'd:<id>'、その繰り返しの回 'd:<id>@<回の元の開始>'。iPhone の予定 'x:<externalId か itemId>'、その回 'x:<…>@<occurrenceDate>'
//   title … 予定の題名の控え（予定が見つからなくても、どの予定のノートか分かるように。開くたびに新しくする）
//   day   … 予定の日の控え（同上）
import { isKey } from './util.js';

export const EVENT_REF_K_MAX = 400, EVENT_REF_TITLE_MAX = 200;

// 正しい形なら { k, title, day }、そうでなければ null
export function normEventRef(v) {
  if (!v || typeof v !== 'object') return null;
  const k = typeof v.k === 'string' ? v.k : '';
  if (!/^[dx]:./.test(k) || k.length > EVENT_REF_K_MAX) return null;
  const title = typeof v.title === 'string' ? v.title.slice(0, EVENT_REF_TITLE_MAX) : '';
  const day = isKey(v.day) ? v.day : '';
  return { k, title, day };
}

// Duo の予定（親の id と、繰り返しなら回の鍵）から鍵を作る
export const duoRefKey = (id, occKey = null) => (id ? `d:${id}${occKey ? `@${occKey}` : ''}` : '');
// iPhone の予定（externalId か itemId と、繰り返しなら occurrenceDate）から鍵を作る
export const extRefKey = (key, occ = null) => (key ? `x:${key}${occ ? `@${occ}` : ''}` : '');
