// iOS 本来のめくり（B）の1段目（試作。第18弾 連携案の「1段目」の列だけ）。
// 指はずっと Web が持ち、18.2 と同じ判定（どこからでも始まる）でめくるかを決める。離したら DuoNative の turnPage で、
// UIPageViewController（transitionStyle .pageCurl）が setViewControllers(animated:) で自動でめくる。紙は指に付かない。時間・緩急・影は iOS のまま。
// 正本：duo-calendar-team/data/連携_第18弾_ネイティブめくりの呼び出し.md、design/31-native-curl-B.md、qa/verify-curl-native-compare.md
// 切り替え：設定 › 詳細「めくりの方式（試作）」。localStorage `duo-curl-engine`（'web'｜'native'、既定 'web'）。IndexedDB・バックアップには入れない。
import { call, listen, nativeAvailable } from '../native.js';

export const ENGINE_KEY = 'duo-curl-engine';
export const NEXT_KEY = 'duo-curl-next'; // 次のページ：'clear'（既定。透明にして下の本物の DOM を見せる）｜'snap'（もう1回撮る）
export const NEED_VERSION = 2; // 2：18.3 に合わせた DuoNative（動かない側の覆い・backReady）
export const SHADE = Object.freeze({ max: 24, per: 0.25, a: 0.08, armed: 0.12, armMs: 100, fadeMs: 150 });

const nsKey = (k) => { try { const ns = new URLSearchParams(location.search).get('ns'); return ns ? `${k}.${ns}` : k; } catch { return k; } };
const read = (k) => { try { return localStorage.getItem(nsKey(k)); } catch { return null; } };
export const getEngine = () => (read(ENGINE_KEY) === 'native' ? 'native' : 'web');
export function setEngine(v) { try { localStorage.setItem(nsKey(ENGINE_KEY), v === 'native' ? 'native' : 'web'); } catch { /* 保存できなくても続ける */ } }
export const getNextMode = () => (read(NEXT_KEY) === 'snap' ? 'snap' : 'clear');

// 撮る範囲（design/31 の 18.3 の決定・連携 第18弾 1.2）。m＝めくりの寸法 { lx0, lx1, spine, edge, py0, py1 }。表も裏もページ全体。
//  fwd：右ページ spine〜edge（x485.5〜851）。進むときの紙の表、戻るときの動かない側（覆い）と着地先（裏）。
//  back：左ページ lx0〜lx1（x8〜465.5）。戻るときの紙の表、進むときの動かない側（覆い）と着地先（裏）。左の帯を別に入れ替えることはしない。
export function curlRects(m) {
  const h = m.py1 - m.py0;
  return { fwd: { x: m.spine, y: m.py0, w: m.edge - m.spine, h }, back: { x: m.lx0, y: m.py0, w: m.lx1 - m.lx0, h } };
}
// 向きごとの矩形：paper＝めくる紙（表）、cover＝動かない側＝着地先（覆いを置き、その下で着地先を出して裏を撮る）
export function turnRects(dir, m) { const R = curlRects(m); return dir === 'forward' ? { paper: R.fwd, cover: R.back, spine: 'min', animDir: 'forward' } : { paper: R.back, cover: R.fwd, spine: 'max', animDir: 'reverse' }; }
// 陰の帯（design/31「1段目の見え方」）。dx＝押した所からの横の動き。幅は 1/4（最大 24pt）、濃さは幅に合わせて 0→8%、境目を越えたら 12%
export function shadeOf(dx, armed) { const w = Math.min(SHADE.max, Math.abs(dx) * SHADE.per); return { w, a: armed ? SHADE.armed : SHADE.a * (w / SHADE.max) }; }
const r2 = (v) => Math.round(v * 100) / 100;
export const rectKey = (r) => [r.x, r.y, r.w, r.h].map(r2).join(',');

// view(): 撮った絵が古くなったかを見る材料（描き直し番号 rev のほか、時間軸のスクロール位置と分）。rev が同じでも、スクロールすると見た目が変わるため
export function createNativeCurl({ rev = () => 0, view = () => '' } = {}) {
  let caps = null, capsP = null, failed = false, lastKey = '', held = false, shade = null, shadeDir = null;
  const perfOn = (() => { try { return new URLSearchParams(location.search).get('curlperf') === '1'; } catch { return false; } })();
  const N = globalThis.__duoCurlNative = { calls: [], last: null, perf: [], caps: null, error: null };
  const log = (m, o) => { N.calls.push({ m, t: Math.round(performance.now()), o }); if (N.calls.length > 60) N.calls.shift(); };
  const probe = () => (capsP ||= (nativeAvailable()
    ? call('curlCaps').then((c) => { caps = c && Number(c.version) >= NEED_VERSION ? c : null; N.caps = caps; if (caps && perfOn) call('curlPerf', { on: true }).catch(() => {}); return caps; }, () => { caps = null; return null; })
    : Promise.resolve(null)));
  if (getEngine() === 'native') probe();
  if (nativeAvailable()) listen('curlError', (d) => { N.error = d?.code ?? 'error'; });
  const keyOf = (m) => { const R = curlRects(m); return `${rev()}|${view()}|${rectKey(R.fwd)}|${rectKey(R.back)}`; };
  const ctl = {
    // B で動かすか（設定が iOS のめくり・DuoNative が新しい・この起動で失敗していない）。視差効果を減らすは呼ぶ側で A に回す
    on: () => getEngine() === 'native' && !failed && !!caps,
    probe, caps: () => caps, failed: () => failed,
    fail(e) { failed = true; N.error = e?.code || e?.message || String(e ?? 'error'); lastKey = ''; },
    // 触れた瞬間（canStart が通った pointerdown）：進む用・戻る用の2ページを撮る。key が同じならネイティブ側でも使い回す
    prepare(m) {
      const key = keyOf(m), R = curlRects(m);
      if (key === lastKey) return; lastKey = key; held = true;
      log('prepareCurl', { key });
      call('prepareCurl', { rev: key, fwd: R.fwd, back: R.back }).catch((e) => { lastKey = ''; log('prepareCurl!', e?.code); });
    },
    // 離して、めくると決めたとき：撮った紙を同じ位置に重ねる（まだ動かさない）。重ねたら解決（curlShown）
    // 紙（めくるページ全体）と、動かない側の覆い（もう片方のページ全体）を同じ位置に重ねる。重なったら解決（curlShown）
    show(dir, m) {
      const T = turnRects(dir, m), key = keyOf(m);
      if (key !== lastKey) { lastKey = ''; } // 押してから描き直した：ネイティブは撮り直す
      log('turnPage', { dir });
      // 背：進む＝左端（.min）、戻る＝右端（.max）。戻りは .reverse で今の紙が左の端から背へ巻き上がる（シミュレータで確認。.forward だと動かない）
      return call('turnPage', { dir, rev: key, rect: T.paper, cover: T.cover, spine: T.spine, animDir: T.animDir, next: getNextMode() });
    },
    // 覆いの下に着地先のページ（保存しない仮の表示）を出して rAF 2回待った：その矩形を撮って紙の裏にする（backShot）
    async back(dir, m) {
      const r = turnRects(dir, m).cover; log('backReady', { dir });
      const res = await call('backReady', { rev: lastKey, rect: r }); N.back = res ?? null; return res;
    },
    // 下の DOM を着地後にして rAF 2回待った：ネイティブは1コマ待ってめくり、終わったら 0.15 秒で薄くして外す。めくり終わりで解決
    async go(dir) {
      log('webReady', { dir });
      const r = await call('webReady', { rev: lastKey, dir });
      N.last = r ?? null; if (r?.perf) { N.perf.push(r.perf); if (N.perf.length > 50) N.perf.shift(); if (perfOn) console.log('[curlperf-native]', JSON.stringify(r.perf)); }
      return r;
    },
    cancel(reason) { log('cancelCurl', { reason }); return call('cancelCurl', { reason }).catch(() => {}); },
    release() { lastKey = ''; held = false; log('releaseCurl'); return call('releaseCurl').catch(() => {}); },
    held: () => held,
    // 陰の帯（Web 側で描く）。めくる紙の外の端（進む＝右ページの右端、戻る＝左ページの左端 land）の内側
    shadeAt(dir, m, dx, armed) {
      if (!shade) { shade = document.createElement('div'); shade.className = 'curlshade'; shade.setAttribute('aria-hidden', 'true'); document.body.appendChild(shade); }
      const { w, a } = shadeOf(dx, armed), fwd = dir === 'forward';
      const x = fwd ? m.edge - w : m.lx0; // 戻りの外の端は左ページの左端 x8（18.3：ページ全体をめくる）
      const flip = shade.dataset.armed !== (armed ? '1' : '0'); shadeDir = dir;
      Object.assign(shade.style, { left: `${x}px`, top: `${m.py0}px`, width: `${w}px`, height: `${m.py1 - m.py0}px`, opacity: String(a),
        transition: flip ? `opacity ${SHADE.armMs}ms` : 'none', background: `linear-gradient(${fwd ? 'to left' : 'to right'}, #000, rgba(0,0,0,0))` });
      shade.dataset.armed = armed ? '1' : '0';
    },
    shadeOff(animated) {
      const s = shade; if (!s) return; shade = null; shadeDir = null;
      if (!animated) { s.remove(); return; }
      s.style.transition = `opacity ${SHADE.fadeMs}ms`; s.style.opacity = '0'; setTimeout(() => s.remove(), SHADE.fadeMs + 30);
    },
    shadeState: () => (shade ? { dir: shadeDir, x: parseFloat(shade.style.left), w: parseFloat(shade.style.width), a: parseFloat(shade.style.opacity), armed: shade.dataset.armed === '1' } : null),
  };
  N.ctl = ctl;
  return ctl;
}
