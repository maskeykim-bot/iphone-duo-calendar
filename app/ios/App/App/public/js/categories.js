// カテゴリ（利用者が編集できる名前＋色）の定義と純粋関数。DOM・IndexedDB に依存しない。
// 予定は名前ではなく id で参照する（event.categoryId、overrides[k].categoryId）。

// 固定 id: 端末をまたいでも同じになるよう、既定・旧カテゴリの id は定数。
export const CAT_IDS = {
  work:    'd0c47a10-0000-4000-8000-000000000001',
  private: 'd0c47a10-0000-4000-8000-000000000002',
  golf:    'd0c47a10-0000-4000-8000-000000000003',
  economy: 'd0c47a10-0000-4000-8000-000000000004',
  family:  'd0c47a10-0000-4000-8000-000000000005',
  out:     'd0c47a10-0000-4000-8000-000000000006', // 外出
  other:   'd0c47a10-0000-4000-8000-000000000007', // その他
  none:    'd0c47a10-0000-4000-8000-000000000000', // 未分類（参照先が無いときの受け皿）
};

// 旧キー → カテゴリ（既存利用者の移行と v1/v2 バックアップの読み込みに使う。名前・色は現行のまま）。
export const LEGACY = {
  work:    { id: CAT_IDS.work,    name: '仕事',         color: '#375a7f' },
  private: { id: CAT_IDS.private, name: 'プライベート', color: '#885265' },
  golf:    { id: CAT_IDS.golf,    name: 'ゴルフ',       color: '#396b49' },
  economy: { id: CAT_IDS.economy, name: '経済指標',     color: '#825a23' },
};

// パレット12色（design/04-categories.md 確定）。1〜5 が既定カテゴリ。dark はダークモード用（現状は未使用）。
export const PALETTE = [
  { n: 1,  name: '青',     light: '#2f5f8a', dark: '#8fb4d6' },
  { n: 2,  name: '赤紫',   light: '#8a4b6b', dark: '#d4a0b5' },
  { n: 3,  name: '緑',     light: '#2e6b5a', dark: '#7ebfab' },
  { n: 4,  name: '琥珀',   light: '#87500f', dark: '#e0b56a' },
  { n: 5,  name: '灰',     light: '#5a5e62', dark: '#b0b4b6' },
  { n: 6,  name: '赤',     light: '#a13a3a', dark: '#e8a0a0' },
  { n: 7,  name: '紫',     light: '#5e4c8e', dark: '#b9ace3' },
  { n: 8,  name: '青緑',   light: '#1f6a73', dark: '#7cc3ca' },
  { n: 9,  name: '黄緑',   light: '#556a1c', dark: '#bacc7a' },
  { n: 10, name: '紺',     light: '#2c3f75', dark: '#a3b3e6' },
  { n: 11, name: '茶',     light: '#6e4e3a', dark: '#cda890' },
  { n: 12, name: '灰青',   light: '#476175', dark: '#a9bdcc' },
];
export const paletteName = (color) => PALETTE.find((p) => p.light === String(color).toLowerCase())?.name || '';

// 新規インストールの既定（訂正 13:09: 仕事・プライベート・家族・外出・その他）。
export const DEFAULTS_NEW = [
  { id: CAT_IDS.work,    name: '仕事',         color: PALETTE[0].light },
  { id: CAT_IDS.private, name: 'プライベート', color: PALETTE[1].light },
  { id: CAT_IDS.family,  name: '家族',         color: PALETTE[2].light },
  { id: CAT_IDS.out,     name: '外出',         color: PALETTE[3].light },
  { id: CAT_IDS.other,   name: 'その他',       color: PALETTE[4].light },
];
export const UNCATEGORIZED = { id: CAT_IDS.none, name: '未分類', color: '#68716a', order: 9999, hidden: false };

export const LIMITS = { name: 20, max: 20, maxImport: 50 };
const HEX = /^#[0-9a-fA-F]{6}$/;
const PAPER = '#f7f4ed';

// 淡い背景色は保存せず計算する（本色を紙色に 15% 混ぜる。design/04-categories.md）。
export function tint(hex, base = PAPER, ratio = 0.15) {
  if (!HEX.test(hex)) hex = UNCATEGORIZED.color;
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(base, i) * (1 - ratio) + ch(hex, i) * ratio).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

// 1件のカテゴリを検証・正規化する。{ ok:true, value } | { ok:false, error }。未知の項目は保持する。
export function validateCategory(c, now = Date.now()) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, error: 'カテゴリの形式が不正です' };
  if (typeof c.id !== 'string' || !c.id || c.id.length > 64) return { ok: false, error: 'カテゴリの id が不正です' };
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name) return { ok: false, error: 'カテゴリ名を入力してください。' };
  if (name.length > LIMITS.name) return { ok: false, error: `カテゴリ名は${LIMITS.name}文字以内にしてください。` };
  if (typeof c.color !== 'string' || !HEX.test(c.color)) return { ok: false, error: 'カテゴリの色が不正です' };
  if (c.order !== undefined && !Number.isInteger(c.order)) return { ok: false, error: 'カテゴリの並び順が不正です' };
  if (c.hidden !== undefined && typeof c.hidden !== 'boolean') return { ok: false, error: 'カテゴリの表示指定が不正です' };
  const t = (v) => (Number.isFinite(v) ? v : now);
  return { ok: true, value: { ...c, name, color: c.color.toLowerCase(), order: c.order ?? 0, hidden: c.hidden === true, createdAt: t(c.createdAt), updatedAt: t(c.updatedAt) } };
}

export const sortCategories = (list) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'ja') || String(a.id).localeCompare(String(b.id)));

// 参照先が無いときは「未分類」。
export const resolveCategory = (id, list) => list.find((c) => c.id === id) || UNCATEGORIZED;

// 旧キー（'work' 等）→ 固定 id。無ければ null。
export const legacyToId = (cat) => (typeof cat === 'string' && Object.hasOwn(LEGACY, cat) ? LEGACY[cat].id : null);

// 名前が他のカテゴリと同じか（前後空白を除いて比較）。
export const nameTaken = (list, name, exceptId) => list.some((c) => c.id !== exceptId && c.name.trim() === String(name).trim());

// 新規カテゴリ（order は末尾、色はまだ使っていないパレット色を優先）。
export function newCategory(list, { id, name, color }, now = Date.now()) {
  const used = new Set(list.map((c) => c.color.toLowerCase()));
  const pal = color || (PALETTE.find((p) => !used.has(p.light)) || PALETTE[list.length % PALETTE.length]).light;
  return { id, name, color: pal, order: list.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1, hidden: false, createdAt: now, updatedAt: now };
}

// 並べ替え: id を dir（-1 上へ／+1 下へ）に動かす。0..n-1 に振り直し、変わったものだけ返す。
export function moveCategory(list, id, dir, now = Date.now()) {
  const sorted = sortCategories(list), i = sorted.findIndex((c) => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return { list: sorted, changed: [] };
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  const changed = [];
  const out = sorted.map((c, k) => {
    if (c.order === k) return c;
    const n = { ...c, order: k, updatedAt: now };
    changed.push(n);
    return n;
  });
  return { list: out, changed };
}

// 予定（親と overrides）が参照している categoryId を付け替えた複製。参照がなければ null。
function retarget(e, from, to, now) {
  let hit = e.categoryId === from;
  const ov = {};
  for (const [k, o] of Object.entries(e.overrides || {})) {
    if (o && o.categoryId === from) { hit = true; ov[k] = { ...o, categoryId: to }; } else ov[k] = o;
  }
  if (!hit) return null;
  return { ...e, categoryId: e.categoryId === from ? to : e.categoryId, ...(e.overrides ? { overrides: ov } : {}), updatedAt: now };
}
export const countByCategory = (events) => {
  const m = new Map();
  for (const e of events) m.set(e.categoryId, (m.get(e.categoryId) || 0) + 1);
  return m;
};

// カテゴリ削除の計画。予定は消さず targetId へ付け替える。最後の1件は削除できない。
// → { ok:true, catDels:[id], eventPuts:[...] } | { ok:false, error }
export function planDeleteCategory(categories, events, id, targetId, now = Date.now()) {
  if (!categories.some((c) => c.id === id)) return { ok: false, error: 'カテゴリが見つかりません。' };
  if (categories.length <= 1) return { ok: false, error: 'カテゴリは1つ以上必要です。' };
  const eventPuts = events.map((e) => retarget(e, id, targetId, now)).filter(Boolean);
  if (eventPuts.length) {
    if (targetId === id || !categories.some((c) => c.id === targetId)) return { ok: false, error: '予定の移し先を選んでください。' };
  }
  return { ok: true, catDels: [id], eventPuts };
}

// バックアップのカテゴリを現在のものに合わせる。
// add: id が同じなら現在の名前・色を残す（conflicts に数える）。新しい id は末尾に追加。
// replace: 取り込むカテゴリで全置換。ただし予定が参照する id が無ければ呼び出し側で fixEventCategories を使う。
export function mergeCategories(current, incoming, mode = 'add') {
  if (mode === 'replace') return { categories: sortCategories(incoming), added: incoming.length, conflicts: 0 };
  const byId = new Map(current.map((c) => [c.id, c]));
  let next = current.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1, conflicts = 0;
  const added = [];
  for (const c of sortCategories(incoming)) {
    const cur = byId.get(c.id);
    if (cur) { if (cur.name !== c.name || cur.color !== c.color) conflicts++; continue; }
    const n = { ...c, order: next++ };
    byId.set(n.id, n);
    added.push(n);
  }
  return { categories: sortCategories([...current, ...added]), added: added.length, addedList: added, conflicts };
}

// 参照先のカテゴリが無い予定を未分類に付け替える（親と overrides）。必要なら未分類カテゴリを足す。
export function fixEventCategories(events, categories, now = Date.now()) {
  const ids = new Set(categories.map((c) => c.id));
  let fallback = 0;
  const fix = (id) => (ids.has(id) ? id : (fallback++, CAT_IDS.none));
  const out = events.map((e) => {
    const ov = e.overrides ? Object.fromEntries(Object.entries(e.overrides).map(([k, o]) => [k, o && o.categoryId !== undefined ? { ...o, categoryId: fix(o.categoryId) } : o])) : e.overrides;
    return { ...e, categoryId: fix(e.categoryId), ...(ov ? { overrides: ov } : {}) };
  });
  let cats = categories;
  if (fallback && !ids.has(CAT_IDS.none)) {
    cats = [...categories, { ...UNCATEGORIZED, order: categories.reduce((m, c) => Math.max(m, c.order ?? 0), -1) + 1, createdAt: now, updatedAt: now }];
  }
  return { events: out, categories: cats, fallbackCount: fallback };
}
