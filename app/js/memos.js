// 日付メモの編集と自動保存。日付ごとに最新本文・世代・保存の直列化を持つ。
// 下書きは localStorage（namespace 付き、日付ごと）。保存が済んだ世代の下書きだけを消す。
import * as realDb from './db.js';

export const DRAFT_PREFIX = 'duo.memo.draft.v1:';
export const DEBOUNCE_MS = 1000;
export const SAVE_FAILED = 'メモを保存できませんでした。';

export function createMemoStore({ db = realDb, storage = globalThis.localStorage, now = () => Date.now(), onChange = () => {}, delay = DEBOUNCE_MS } = {}) {
  const E = new Map(); // date -> { text, gen, saved, loaded, timer, chain, failed }
  const ent = (date) => {
    let e = E.get(date);
    if (!e) { e = { text: '', gen: 0, saved: 0, loaded: false, loadFailed: false, timer: 0, chain: Promise.resolve(), failed: false, loading: null }; E.set(date, e); }
    return e;
  };
  const dkey = (date) => DRAFT_PREFIX + date;
  const writeDraft = (date, text) => { try { storage.setItem(dkey(date), JSON.stringify({ date, text, at: now() })); } catch { /* 下書きが書けなくても保存は続ける */ } };
  const dropDraft = (date) => { try { storage.removeItem(dkey(date)); } catch { /* 無視 */ } };
  const dirty = (e) => e.gen !== e.saved;

  function flushMemo(date) {
    const e = E.get(date);
    if (!e) return Promise.resolve(true);
    clearTimeout(e.timer); e.timer = 0;
    if (!dirty(e)) return e.chain.then(() => !e.failed);
    // 日付別に直列化。保存時点の本文・世代を取り、古い ack が新しい下書きを消さないよう世代を比べる。
    e.chain = e.chain.then(async () => {
      if (!dirty(e)) return;
      const g = e.gen, t = e.text;
      try {
        await db.putMemo(date, t, now());
        e.saved = Math.max(e.saved, g); e.failed = false;
        if (e.gen === g) dropDraft(date);
      } catch { e.failed = true; }
      onChange(date);
    });
    return e.chain.then(() => !e.failed);
  }
  const flushAll = () => Promise.all([...E.keys()].filter((d) => dirty(E.get(d))).map(flushMemo));
  function setText(date, text) {
    const e = ent(date);
    e.text = text; e.gen++; e.loaded = true;
    writeDraft(date, text);
    clearTimeout(e.timer);
    e.timer = setTimeout(() => { flushMemo(date); }, delay);
    onChange(date);
  }
  // 表示用の本文を DB から読む（未編集のときだけ反映）。失敗は loadFailed。
  function loadMemo(date) {
    const e = ent(date);
    if (e.loaded) return Promise.resolve(e);
    if (e.loading) return e.loading;
    e.loading = db.getMemo(date).then((m) => { if (!e.loaded) { e.text = m?.text ?? ''; e.loaded = true; } e.loadFailed = false; }, () => { e.loadFailed = true; })
      .then(() => { e.loading = null; onChange(date); return e; });
    return e.loading;
  }
  // 起動時: 残った下書きが DB より新しければ入れて保存し直す。失敗した下書きは残して表示にも使う。
  async function recoverMemoDraft() {
    let keys = [];
    try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k); } } catch { keys = []; }
    const done = [];
    for (const k of keys) {
      let d = null;
      try { d = JSON.parse(storage.getItem(k)); } catch { d = null; }
      const date = k.slice(DRAFT_PREFIX.length);
      if (!d || typeof d.text !== 'string' || d.date !== date) { try { storage.removeItem(k); } catch { /* 無視 */ } continue; }
      const e = ent(date);
      if (dirty(e)) continue; // 起動後に既に打っている
      let m = null, readOk = true;
      try { m = await db.getMemo(date); } catch { readOk = false; }
      if (readOk && m && m.updatedAt >= (d.at || 0)) { dropDraft(date); continue; }
      e.text = d.text; e.gen++; e.loaded = true; e.loadFailed = false;
      done.push(date);
      await flushMemo(date);
    }
    return done;
  }
  return { flushMemo, flushAll, setText, loadMemo, recoverMemoDraft, get: (d) => E.get(d) || null, dirty: (d) => !!E.get(d) && dirty(E.get(d)), anyDirty: () => [...E.values()].some(dirty), reset: () => { E.forEach((e) => clearTimeout(e.timer)); E.clear(); } };
}

// 本番用の単一ストア。onChange は app.js が設定する。
let hook = () => {};
export const setMemoHook = (f) => { hook = f; };
export const memoStore = createMemoStore({ onChange: (d) => hook(d) });
export const flushMemo = (d) => memoStore.flushMemo(d);
export const recoverMemoDraft = () => memoStore.recoverMemoDraft();
