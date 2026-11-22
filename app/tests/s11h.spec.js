// 品質の写し（S11i 用）: 8960267 の tests/s11h.spec.js を design/34 §18-5 に合わせた。リポジトリの s11h.spec.js は触っていない。
// §18-5: この日（時刻つき 7 件・終日 1 行・カード）は T＝221（帯あり）／233（帯なし）。貼るのは H≧T、外すのは H＜T−4。段2（170）は貼らない、段3（266）は貼る。
// 第19.2版 S11h: 8cd8a6c のレビューの直し（実装担当）。
// 値の根拠: design/34 §18（18-1 貼り付きは日の欄の高さで決める・18-2 帯なしのつまみの箱は 56・18-3 シートの上に残る見出しのボタンを inert）、design/review/review-v19-2-8cd8a6c-closed-final2.md。
import { test, expect } from '@playwright/test';
import { openApp, seed, ev, SIZES } from './helpers.js';

const DAY = '2026-11-12';
const SEED = [...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t, i) => ev(`t${i}`, `予定${t}`, `${DAY}T${String(9 + i).padStart(2, '0')}:00`, `${DAY}T${String(9 + i).padStart(2, '0')}:30`)), ev('ad', '終日の予定', DAY, DAY, { all: true })];
const stageOf = (page) => page.locator('.mpull').getAttribute('data-stage').then(Number);
async function boot(page, { sar = 84, land = false } = {}) {
  await page.addInitScript((sar) => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--sar', `${sar}px`)), sar);
  await page.clock.setFixedTime(new Date(`${DAY}T09:41:00+09:00`));
  await openApp(page, SIZES.closedPortrait);
  await seed(page, SEED);
  if (land) { await page.setViewportSize({ width: 678, height: 466 }); await page.waitForTimeout(600); }
}
async function toStage(page, n) {
  await page.locator('.mgrab').focus();
  for (let i = 0; i < 8 && (await stageOf(page)) !== n; i++) { await page.keyboard.press((await stageOf(page)) < n ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(450); }
  await page.evaluate(() => document.activeElement?.blur());
}
// 1コマ分の測り: 日の欄・見出し・つまみ（下）。ft＝面の上端（::before が上へ出ていればその上端。S11h からは帯なしもつまみの箱の上端と同じ）。ov＝面（見えているとき）と見出しの重なりの高さ
const SNAP = () => {
  const el = document.querySelector('.mpull.browse .mday'), g = el.querySelector('.mdgrab'), hd = el.querySelector('.mdh');
  const p = el.getBoundingClientRect(), b = g.getBoundingClientRect(), h = hd.getBoundingClientRect(), i = g.querySelector('i').getBoundingClientRect();
  const bf = getComputedStyle(g, '::before'), ft = b.top + (bf.content !== 'none' ? Math.min(0, parseFloat(bf.top) || 0) : 0);
  const op = Number(getComputedStyle(g).opacity), shown = op > 0.001 && ft < p.bottom && b.bottom > p.top;
  const cards = [...el.querySelectorAll('.mdcard')], cb = cards.length ? cards[cards.length - 1].getBoundingClientRect().bottom : 0;
  return { top: p.top, h: p.height, gs: el.classList.contains('gs'), sticky: getComputedStyle(g).position === 'sticky', stuck: g.classList.contains('stuck'), op, gt: b.top, ft, cb, gb: b.bottom, gl: b.left, gr: b.right, line: [i.top, i.bottom], hb: h.bottom, ov: shown ? Math.max(0, Math.min(b.bottom, h.bottom) - Math.max(ft, h.top)) : 0, stage: Number(document.querySelector('.mpull').dataset.stage || 0), anims: g.getAnimations().length };
};
const snap = (page) => page.evaluate(SNAP);
// コマごとに ms の間、測りを集める
const frames = (page, ms) => page.evaluate(([src, ms]) => new Promise((res) => { const f = new Function(`return (${src})()`), out = [], t0 = performance.now(); const tick = (now) => { out.push({ t: now - t0, ...f() }); if (now - t0 < ms) requestAnimationFrame(tick); else res(out); }; requestAnimationFrame(tick); }), [SNAP.toString(), ms]);

for (const sar of [84, 0]) {
  const nm = sar ? '帯あり' : '帯なし', faceTop = sar ? 593 : 581, T = sar ? 221 : 233; // §18-5
  test.describe(`S11h §18-1 縦・${nm}: 貼り付きは日の欄の高さで決める`, () => {
    test('つまみ（上）を 2pt ずつ引く（段1→3→1）: どの位置でもつまみ（下）と見出しが重ならない。高さ T 以上で貼り、T−4 未満で外す（§18-5）', async ({ page }) => {
      await boot(page, { sar });
      expect(await stageOf(page)).toBe(1);
      const s0 = await snap(page); expect(s0.h).toBeCloseTo(74, 0); expect(s0.gs).toBe(false); expect(s0.sticky).toBe(false);
      const gb = await page.locator('.mgrab').boundingBox(), x = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2;
      await page.mouse.move(x, y0); await page.mouse.down(); await page.mouse.move(x, y0 - 8, { steps: 4 });
      const seen = { on: 0, off: 0 }; let prev = false;
      const check = async (s, tag) => {
        expect(s.ov, `${tag} 上端 ${s.top} 高さ ${s.h}: つまみ ${s.gt}〜${s.gb} と見出し 〜${s.hb} の重なり`).toBeLessThanOrEqual(0.5);
        if (s.h >= T) { expect(s.gs, `${tag} 高さ ${s.h} は貼る`).toBe(true); seen.on++; }
        if (s.h < T - 4 && !prev) expect(s.gs, `${tag} 高さ ${s.h} は貼らない`).toBe(false);
        if (s.gs && s.h >= T) { expect(s.stuck).toBe(true); expect(s.ft, `${tag} 面の上端`).toBeCloseTo(faceTop, 0); expect(s.gt).toBeCloseTo(faceTop, 0); expect(s.gb).toBeCloseTo(637, 0); }
      };
      for (let d = 10; d <= 200; d += 2) { await page.mouse.move(x, y0 - d); const s = await snap(page); await check(s, `上へ ${d}`); prev = s.gs; }
      await page.waitForTimeout(250);
      const up = await snap(page); expect(up.gs).toBe(true); expect(up.op).toBe(1); expect(up.anims).toBe(0);
      for (let d = 198; d >= 0; d -= 2) {
        await page.mouse.move(x, y0 - d); const s = await snap(page); await check(s, `下へ ${d}`);
        if (s.h < T && s.h >= T - 4) expect(s.gs, `下へ ${d} 高さ ${s.h}: 遊び 4 の間は貼ったまま`).toBe(true); // ヒステリシス
        prev = s.gs;
      }
      await page.waitForTimeout(250);
      const dn = await snap(page); expect(dn.gs).toBe(false); expect(dn.sticky).toBe(false); expect(dn.anims).toBe(0); expect(dn.ov).toBe(0);
      await page.mouse.up(); await page.waitForTimeout(400);
      expect(seen.on).toBeGreaterThan(5);
    });
    test('上端 554（今まで段2になって重なった所）で止めても貼らない。カードは見出しの下に見えたまま。上端 678−T（§18-5）まで引くと 0.15 秒で出る', async ({ page }) => {
      await boot(page, { sar });
      const gb = await page.locator('.mgrab').boundingBox(), x = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2;
      const top0 = (await snap(page)).top;
      await page.mouse.move(x, y0); await page.mouse.down(); await page.mouse.move(x, y0 - 8, { steps: 4 });
      await page.mouse.move(x, y0 - (top0 - 552), { steps: 6 });
      const off = (await snap(page)).top - 552; // 引きの基準は触れた直後の1点（数 pt ずれる）ので、測って合わせる
      await page.mouse.move(x, y0 - (top0 - 552) - off); await page.waitForTimeout(250);
      const s = await snap(page);
      expect(s.top).toBeCloseTo(552, 0); expect(s.stage).toBe(2); // 段の番号は 2 になっている
      expect(s.gs).toBe(false); expect(s.sticky).toBe(false); expect(s.ov).toBe(0);
      const under = await page.evaluate(() => { const e = document.elementFromPoint(100, 602); return !!e?.closest('.mdallday, .mdcard, .mdad, .mdcards, .mdbody'); });
      expect(under, '見出しのすぐ下に中身が見える').toBe(true);
      // 上端 678−T（高さ T）へ: 貼って、不透明度 0→1 を 0.15 秒・直線。段2（上端 508）ではまだ貼らない（§18-5）
      await page.mouse.move(x, y0 - (top0 - 508) - off); await page.waitForTimeout(250); expect((await snap(page)).gs, '§18-5 高さ 170 では貼らない').toBe(false);
      const rec = frames(page, 320);
      await page.mouse.move(x, y0 - (top0 - (678 - T - 1)) - off);
      const fr = await rec;
      const on = fr.filter((f) => f.gs);
      expect(on.length).toBeGreaterThan(3);
      expect(on.some((f) => f.op > 0.02 && f.op < 0.98), '途中の不透明度のコマがある').toBe(true);
      for (let i = 1; i < on.length; i++) expect(on[i].op, `出る間、不透明度は戻らない（コマ ${i}: ${on[i - 1].op} → ${on[i].op}）`).toBeGreaterThanOrEqual(on[i - 1].op - 0.001); // WebKit: fill なしの終わりの1コマの消えを見張る
      const tOn = on[0].t, full = on.find((f) => f.op >= 0.999).t;
      expect(full - tOn).toBeGreaterThan(90); expect(full - tOn).toBeLessThan(230);
      { const mid = on.filter((f) => f.op > 0.05 && f.op < 0.95); if (mid.length >= 2) { const a = mid[0], b = mid[mid.length - 1]; expect(Math.abs((b.op - a.op) - (b.t - a.t) / 150)).toBeLessThan(0.12); } } // 直線
      for (const f of fr) expect(f.ov).toBeLessThanOrEqual(0.5);
      const e = fr[fr.length - 1]; expect(e.op).toBe(1); expect(e.ft).toBeCloseTo(faceTop, 0);
      await page.mouse.up(); await page.waitForTimeout(400);
    });
    test('§18-5 キーで段を送る（2→3・3→2・2→4→2→3）: どのコマでも重ならず、出るとき・消えるときは 0.15 秒のフェード。3→2 の最初のコマでカードが出ない', async ({ page }) => {
      await boot(page, { sar }); await toStage(page, 2); expect((await snap(page)).gs, '§18-5 段2 は貼らない').toBe(false);
      await page.locator('.mgrab').focus();
      // 2→3
      let rec = frames(page, 900); await page.keyboard.press('ArrowUp'); let fr = await rec;
      for (const f of fr) expect(f.ov, `1→2 t${f.t | 0} 上端 ${f.top}`).toBeLessThanOrEqual(0.5);
      for (const f of fr) if (f.gs && f.op > 0.001) expect(f.h, `2→3: 貼って見えるのは高さ T に届いてから`).toBeGreaterThanOrEqual(T - 4.1);
      let end = fr[fr.length - 1]; expect(end.stage).toBe(3); expect(end.gs).toBe(true); expect(end.stuck).toBe(true); expect(end.op).toBe(1); expect(end.ft).toBeCloseTo(faceTop, 0); expect(end.hb).toBeCloseTo(456, 0);
      expect(fr.some((f) => f.gs && f.op > 0.02 && f.op < 0.98), '1→2: フェードの途中のコマ').toBe(true);
      { const on = fr.filter((f) => f.gs); for (let i = 1; i < on.length; i++) expect(on[i].op, `1→2: 出る間、不透明度は戻らない（コマ ${i}）`).toBeGreaterThanOrEqual(on[i - 1].op - 0.001); }
      await page.waitForTimeout(200);
      // 3→2
      rec = frames(page, 900); await page.keyboard.press('ArrowDown'); fr = await rec;
      for (const f of fr) expect(f.ov, `2→1 t${f.t | 0} 上端 ${f.top}`).toBeLessThanOrEqual(0.5);
      const i0 = fr.findIndex((f) => f.h < T - 4.1);
      expect(i0).toBeGreaterThanOrEqual(0);
      expect(fr[i0].gs, '2→1: 外れ始めのコマは、まだ面がある（カードが 1 コマで出ない）').toBe(true);
      expect(fr[i0].op).toBeGreaterThan(0.5);
      const gone = fr.find((f, i) => i >= i0 && !f.gs);
      expect(gone.t - fr[i0].t).toBeGreaterThan(80); expect(gone.t - fr[i0].t).toBeLessThan(260);
      expect(fr.some((f, i) => i >= i0 && f.gs && f.op > 0.02 && f.op < 0.98), '2→1: フェードの途中のコマ').toBe(true);
      { const out = fr.filter((f, i) => i >= i0 && f.gs); for (let i = 1; i < out.length; i++) expect(out[i].op, `2→1: 消える間、不透明度は戻らない（コマ ${i}）`).toBeLessThanOrEqual(out[i - 1].op + 0.001); }
      end = fr[fr.length - 1]; expect(end.stage).toBe(2); expect(end.gs).toBe(false); expect(end.sticky).toBe(false); expect(end.h).toBeCloseTo(170, 0);
      // 続けて送る・戻す（寄せの途中で向きを変える）
      rec = frames(page, 1500);
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(90); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(40); await page.keyboard.press('ArrowUp');
      fr = await rec;
      for (const f of fr) expect(f.ov, `行き来 t${f.t | 0} 上端 ${f.top}`).toBeLessThanOrEqual(0.5);
      await page.waitForTimeout(400); end = await snap(page); // 記録の終わりが最後のフェードの終わりのコマに重なることがあるので、落ち着いてから見る
      expect(end.stage).toBe(3); expect(end.gs).toBe(true); expect(end.stuck).toBe(true); expect(end.op).toBe(1); expect(end.anims).toBe(0);
    });
    test('§18-5 段2 は貼らない。段3〜7 の止まった位置は今までどおり貼る（線 y611〜615）。日の欄を送って外れる・戻るのは一瞬（フェードなし）', async ({ page }) => {
      await boot(page, { sar });
      await toStage(page, 2); await page.waitForTimeout(250); { const s2 = await snap(page); expect(s2.gs, '§18-5 段2 は貼らない').toBe(false); expect(s2.sticky).toBe(false); }
      for (const n of [3, 5, 7]) {
        await toStage(page, n); await page.waitForTimeout(250);
        const s = await snap(page);
        expect(s.gs).toBe(true); expect(s.stuck).toBe(true); expect(s.op).toBe(1); expect(s.anims).toBe(0); expect(s.ov).toBe(0);
        expect(s.ft).toBeCloseTo(faceTop, 0); expect(s.gt).toBeCloseTo(faceTop, 0); expect(s.gb).toBeCloseTo(637, 0); expect(s.line[0]).toBeCloseTo(611, 0); expect(s.line[1]).toBeCloseTo(615, 0);
      }
      await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(60);
      let s = await snap(page); expect(s.stuck).toBe(false); expect(s.gs).toBe(true); expect(s.op).toBe(1); expect(s.anims).toBe(0);
      await page.evaluate(() => { document.querySelector('.mday').scrollTop = 0; }); await page.waitForTimeout(60);
      s = await snap(page); expect(s.stuck).toBe(true); expect(s.op).toBe(1); expect(s.anims).toBe(0);
    });
    test('動きを減らす設定: フェードなしで切り替わる。重ならない', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await boot(page, { sar }); await toStage(page, 2); // §18-5: 貼り付きが変わるのは 2→3
      await page.locator('.mgrab').focus();
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
      let s = await snap(page); expect(s.gs).toBe(true); expect(s.op).toBe(1); expect(s.anims).toBe(0); expect(s.ov).toBe(0); expect(s.ft).toBeCloseTo(faceTop, 0);
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
      s = await snap(page); expect(s.gs).toBe(false); expect(s.ov).toBe(0);
    });
  });
}

test.describe('S11h §18-1 閉じた横: 段を使わないので、いつも貼る（高さ 466）', () => {
  for (const sar of [84, 0]) {
    test(`横・${sar ? '帯あり' : '帯なし'}: 貼り付いていて、見出し（y0〜44）と重ならない`, async ({ page }) => {
      await boot(page, { sar, land: true });
      const s = await snap(page);
      expect(s.h).toBeCloseTo(466, 0); expect(s.gs).toBe(true); expect(s.stuck).toBe(true); expect(s.ov).toBe(0); expect(s.op).toBe(1);
      expect(s.ft).toBeCloseTo(sar ? 381 : 369, 0); expect(s.gt).toBeCloseTo(sar ? 381 : 369, 0); expect(s.gb).toBeCloseTo(425, 0); expect(s.line[0]).toBeCloseTo(399, 0); expect(s.line[1]).toBeCloseTo(403, 0);
      // 縦に戻しても、段1 は貼らない
      await page.setViewportSize({ width: 466, height: 678 }); await page.waitForTimeout(600);
      const p = await snap(page); expect(p.stage).toBe(1); expect(p.gs).toBe(false); expect(p.ov).toBe(0);
    });
  }
});

test.describe('S11h §18-2 帯なし: つまみ（下）の箱はいつも 56', () => {
  // 1pt ずつ送る。cut＝カードが切れて見える高さ（貼り付いている間は面の上端、外れたら最後のカードの下端）。送り 1pt で 1pt より大きく動かなければ、跳びはない
  const scan = async (page) => {
    const max = await page.evaluate(() => { const m = document.querySelector('.mday'); return m.scrollHeight - m.clientHeight; });
    const out = [];
    for (let t = 0; t <= max; t++) out.push(await page.evaluate(([t, src]) => { const m = document.querySelector('.mday'); m.scrollTop = t; m.dispatchEvent(new Event('scroll')); return new Function(`return (${src})()`)(); }, [t, SNAP.toString()]));
    return out;
  };
  for (const land of [false, true]) {
    test(`${land ? '横' : '縦'}: 箱 y${land ? 369 : 581}〜${land ? 425 : 637}（線の上の余白 30）。送って外れる境で、カードの 12 が跳んで出ない。送り切りは カード → 56 → ノート ›。上の 12 から引いても時間軸に切り替わる`, async ({ page }) => {
      await boot(page, { sar: 0, land }); if (!land) { await toStage(page, 4); await page.waitForTimeout(250); }
      const top = land ? 369 : 581, s = await snap(page);
      expect(s.stuck).toBe(true); expect(s.ft).toBeCloseTo(top, 0); expect(s.gt).toBeCloseTo(top, 0); expect(s.gb).toBeCloseTo(top + 56, 0); expect(s.line[0] - s.ft).toBeCloseTo(30, 0); expect(s.line[1] - s.line[0]).toBeCloseTo(4, 1);
      expect(s.gl).toBeCloseTo(land ? 382 : 8, 0); expect(s.gr).toBeCloseTo(land ? 614 : 402, 0);
      const fr = await scan(page);
      let flips = 0;
      for (let i = 1; i < fr.length; i++) {
        const a = fr[i - 1], b = fr[i], cut = (f) => (f.stuck ? Math.min(f.ft, f.cb) : f.cb);
        expect(Math.abs(cut(b) - cut(a)), `送り ${i}: カードの切れ目 ${cut(a)} → ${cut(b)}`).toBeLessThanOrEqual(1.01);
        if (a.stuck !== b.stuck) { flips++; expect(b.cb, `外れたコマ: 最後のカードの下端は面の上端 ${top} より上`).toBeLessThanOrEqual(top + 0.5); expect(Math.abs(b.gt - a.gt), '外れたコマ: 箱の上端は跳ばない').toBeLessThanOrEqual(1.01); }
        expect(b.gb - b.gt, `送り ${i}: 箱の高さ`).toBeCloseTo(56, 1); expect(b.line[0] - b.gt).toBeCloseTo(30, 1);
      }
      expect(flips).toBe(1);
      const e = fr[fr.length - 1]; expect(e.stuck).toBe(false);
      const seq = await page.evaluate(() => { const m = document.querySelector('.mday'), g = m.querySelector('.mdgrab').getBoundingClientRect(), n = m.querySelector('.mdnl').getBoundingClientRect(); return { h: g.height, gap: n.top - g.bottom }; });
      expect(seq.h).toBeCloseTo(56, 1); expect(e.gt - e.cb).toBeCloseTo(0, 1); // カード → つまみ 56 → ノート ›
      expect(Math.abs(seq.gap)).toBeLessThanOrEqual(0.5);
      // 押せる所も 56: 上の 12（面の上端のすぐ下）から下へ引くと時間軸
      await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = 0; m.dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(100);
      const gx = land ? 488 : 200;
      await page.mouse.move(gx, top + 5); await page.mouse.down(); await page.mouse.move(gx, top + 45, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(600);
      await expect(page.locator('.mday')).toHaveAttribute('data-dg', 'B');
    });
  }
  test('帯あり: 今までどおり 44（縦 y593〜637、横 y381〜425）。最後のカードとつまみの間は 0 のまま', async ({ page }) => {
    await boot(page, { sar: 84 }); await toStage(page, 4); await page.waitForTimeout(250);
    let s = await snap(page); expect(s.ft).toBeCloseTo(593, 0); expect(s.gb).toBeCloseTo(637, 0); expect(s.line).toEqual([611, 615]);
    await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(100);
    s = await snap(page); expect(s.stuck).toBe(false); expect(s.gt - s.cb).toBeCloseTo(0, 1);
    await page.evaluate(() => { document.querySelector('.mday').scrollTop = 0; });
    await page.setViewportSize({ width: 678, height: 466 }); await page.waitForTimeout(600);
    s = await snap(page); expect(s.ft).toBeCloseTo(381, 0); expect(s.gb).toBeCloseTo(425, 0);
  });
});

test.describe('S11h §18-3 シートを開いている間、上に残る見出しのボタンを押せなくする', () => {
  const openSheet = async (page) => {
    await page.evaluate(() => { const m = document.querySelector('.mday'); m.scrollTop = m.scrollHeight; }); await page.waitForTimeout(150);
    await page.locator('.mday [data-act="daynote"]').click(); await page.waitForTimeout(600);
    await expect(page.locator('.nsheet')).toBeVisible();
  };
  // §18-6: 見出しの帯ごと inert にしてよいので、ボタン自身の inert でなく 祖先を含めて見る
  const inert = (page) => page.evaluate(() => [...document.querySelectorAll('.shell.closed .cb.ctask, .shell.closed .cb.cmore')].map((b) => !!b.closest('[inert]')));
  const head = (page) => page.evaluate(() => (document.querySelector('.mph h2, .mph h1, #ctitle, .stitle')?.textContent || '').trim());
  test('§18-6 横・帯なし: シートを開いて (656,4)・(620,4)・(350,4) 今日へ・(10,2)/(14,2) 月送り をたたいても shell の class も月も変わらない（タスクの画面に切り替わらない・メニューも出ない）。閉じると押せる', async ({ page }) => {
    await boot(page, { sar: 0, land: true });
    expect(await inert(page)).toEqual([false, false]);
    await openSheet(page);
    const sh = await page.locator('.nsheet').boundingBox(); expect(sh.y).toBeCloseTo(8, 0);
    expect(await inert(page)).toEqual([true, true]);
    const cls = await page.locator('.shell').getAttribute('class');
    const tb = await page.locator('.cb.ctask').boundingBox(); expect(tb.y).toBeLessThan(8); // 上の 8 に端が残っている
    const h0 = await head(page); const changed = [];
    for (const [x, y] of [[656, 4], [tb.x + tb.width / 2, 4], [620, 4], [600, 3], [350, 4], [10, 2], [14, 2]]) { await page.mouse.click(x, y); await page.waitForTimeout(250); const h = await head(page); if (h !== h0) changed.push([x, y, h]); }
    expect(await page.locator('.shell').getAttribute('class')).toBe(cls);
    expect.soft(changed, '§18-6 見出しの帯（今日へ・月送り）も働かない').toEqual([]);
    await expect(page.locator('.nsheet')).toBeVisible();
    expect(await page.locator('.cb.cmore').getAttribute('aria-expanded')).toBe('false');
    expect(await page.evaluate(() => { const e = document.elementFromPoint(656, 4); return !!e?.closest('.cb'); }), 'inert のボタンは当たらない').toBe(false);
    // 見た目は変えない
    expect(await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.cb.ctask')); return [c.opacity, c.visibility]; })).toEqual(['1', 'visible']);
    await page.getByRole('button', { name: '完了' }).click();
    await expect(page.locator('.nsheet')).toBeHidden();
    expect(await inert(page)).toEqual([false, false]);
    await page.mouse.click(656, 4); await page.waitForTimeout(400);
    expect(await page.locator('.shell').getAttribute('class')).not.toBe(cls); // 閉じたあとは今までどおりタスクへ
  });
  test('横・帯あり／縦・帯なし: シートを開いても inert にしない（§17-5 と同じ条件のときだけ）', async ({ page }) => {
    await boot(page, { sar: 0 }); await toStage(page, 4);
    await openSheet(page);
    expect(await inert(page)).toEqual([false, false]);
  });
});
