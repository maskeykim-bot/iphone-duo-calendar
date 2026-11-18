import { test, expect } from '@playwright/test';
import { openApp, loadSample, seed, ev, tab, SIZES, findTextOverlaps } from './helpers.js';

// 第14版 PR7: 開いた縦の下パネル（月の下に 時間｜タスク｜メモ）
const PORTRAITS = [SIZES.openPortrait, SIZES.openPortrait669];
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const box = (loc) => loc.boundingBox();
const noOverlap = (a, b) => a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5 || a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5;
const ui = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'));
const setSafe = (page, { t = 0, r = 0, b = 0, l = 0 }) => page.evaluate(([t, r, b, l]) => {
  const s = document.documentElement.style;
  s.setProperty('--sat', `${t}px`); s.setProperty('--sar', `${r}px`); s.setProperty('--sab', `${b}px`); s.setProperty('--sal', `${l}px`);
  window.dispatchEvent(new Event('resize'));
}, [t, r, b, l]);
const show = async (page) => { await page.getByRole('button', { name: '下の段を表示' }).click(); await expect(page.locator('.pnl')).toBeVisible(); await page.waitForTimeout(320); };

for (const size of PORTRAITS) {
  const tag = `${size.width}×${size.height}`;
  const p = size.height / 951, W = size.width, H = size.height, ux = W / 669;
  test.describe(`下パネル ${tag}`, () => {
    test('既定は閉。表示ボタン（48丸・今日の右・間12）で出る。閉状態は従来の月（106〜H-96p）', async ({ page }) => {
      await openApp(page, size);
      await expect(page.locator('.pnl')).toHaveCount(0);
      const sc = await box(page.locator('.calendar .scroll'));
      expect(near(sc.y, 106) && near(sc.y + sc.height, H - 96 * p)).toBe(true);
      const btn = page.getByRole('button', { name: '下の段を表示' });
      const b = await box(btn), today = await box(page.getByRole('button', { name: '今日に戻る' })), tabs = await box(page.locator('.tabs')), add = await box(page.getByRole('button', { name: '予定を追加' }));
      expect(near(b.width, 48) && near(b.height, 48) && near(b.x, today.x + today.width + 12)).toBe(true);
      expect(near(b.y, today.y)).toBe(true);
      for (const o of [today, tabs, add]) expect(noOverlap(b, o)).toBe(true);
    });

    test('表示: マス106〜520（高さ比）・パネル上端線・つまみ・見出し・×・切替が基準位置', async ({ page }) => {
      await openApp(page, size);
      await show(page);
      const sc = await box(page.locator('.calendar .scroll')), pn = await box(page.locator('.pnl'));
      const G = (H - 71 * p - 106) * 414 / 774;
      expect(near(sc.y + sc.height, 106 + G)).toBe(true);
      expect(near(pn.y, 106 + G)).toBe(true);
      const row = Math.min(H - 88 * p, H - 48);
      expect(near(pn.y + pn.height, row - 8 * p)).toBe(true);
      if (size.height === 951) expect(near(pn.y, 520) && near(pn.y + pn.height, 855)).toBe(true); // 第19版 PR5: パネルの下端はタブ（y863）の上 8 = 855
      const grip = await box(page.locator('.pgrip i')), close = await box(page.locator('.pclose')), sw = await box(page.locator('.pswitch'));
      expect(near(grip.width, 36) && near(grip.height, 5) && near(grip.x + 18, W / 2) && near(grip.y, pn.y + 6)).toBe(true);
      expect(near(close.width, 44) && near(close.height, 44) && near(close.x + 44, W - 20 * ux) && near(close.y, pn.y + 12)).toBe(true);
      expect(near(sw.width, 184) && near(sw.x + sw.width, close.x - 12)).toBe(true);
      expect(near(sw.y + 22, pn.y + 34)).toBe(true);
      const date = await box(page.locator('.pdate'));
      expect(near(date.x, 20 * ux)).toBe(true);
      for (const [a, c] of [[date, sw], [sw, close], [grip, sw]]) expect(noOverlap(a, c)).toBe(true);
      const body = await box(page.locator('.pbody2'));
      expect(near(body.y, pn.y + 60)).toBe(true);
      // 操作段・タブと重ならない
      for (const n of ['今日に戻る', '下の段を隠す', '予定を追加']) { const b = await box(page.getByRole('button', { name: n }).last()); if (n !== '下の段を隠す') expect(pn.y + pn.height).toBeLessThanOrEqual(b.y + 0.5); }
      expect(pn.y + pn.height).toBeLessThanOrEqual((await box(page.locator('.tabs'))).y + 0.5);
      expect(await findTextOverlaps(page)).toEqual([]);
    });

    test('週数ごとの上限 6/5/4週＝3/3/5件（収まらなければ減らす）、+N と全セル44以上', async ({ page }) => {
      await openApp(page, size);
      const evs = [];
      for (const d of ['2026-11-09', '2026-12-09', '2027-02-09']) for (let i = 0; i < 7; i++) evs.push(ev(`${d}-${i}`, `予定${i}`, `${d}T${String(8 + i).padStart(2, '0')}:00`, `${d}T${String(8 + i).padStart(2, '0')}:30`));
      await seed(page, evs);
      await show(page);
      const want = { '2026-11': [6, 3], '2026-12': [5, 3], '2027-02': [4, 5] };
      for (const [ym, [weeks, cap]] of Object.entries(want)) {
        await page.evaluate((k) => localStorage.setItem('duo.ui.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('duo.ui.v1') || '{}'), selected: k })), `${ym}-15`);
        await page.reload(); await page.waitForSelector('html[data-ready]');
        await expect(page.locator('.week')).toHaveCount(weeks);
        const wh = (await box(page.locator('.week').first())).height;
        const nominal = Math.min(cap, Math.floor((wh - 19 - 14) / 16) + 1);
        const day = `${ym}-09`;
        const lanes = await page.locator(`.week:has([data-date="${day}"]) .strip[data-sday="${day}"]`).count();
        expect(lanes).toBe(nominal);
        if (size.height === 951) expect(nominal).toBe(cap);
        await expect(page.locator(`.plus[data-jump="${day}"]`)).toHaveText(`+${7 - nominal}`);
        // セルは全部44以上
        const cells = await page.locator('.day').evaluateAll((l) => l.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
        for (const [w, h] of cells) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
      }
    });

    test('全表示でも最終週まで届く。閉状態で最終週が下段に隠れない', async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      await show(page);
      await page.getByRole('button', { name: '全部の予定を表示' }).click();
      const sc = page.locator('.scroll.all');
      await sc.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(100);
      const scb = await box(sc), last = await box(page.locator('.week.all').last()), pn = await box(page.locator('.pnl'));
      expect(last.y + last.height).toBeLessThanOrEqual(scb.y + scb.height + 1);
      expect(scb.y + scb.height).toBeLessThanOrEqual(pn.y + 1);
    });

    test('パネル内の時間は既存の時間軸。最後（24:00）まで届く。タスクは準備中・メモは入力欄', async ({ page }) => {
      await openApp(page, size);
      await loadSample(page);
      await show(page);
      const tl = page.locator('.pnl .tl[data-pane="bottom"]');
      await expect(tl).toBeVisible();
      await tl.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      const tb = await box(tl), end = await box(page.locator('.pnl .hl').last());
      expect(end.y).toBeLessThanOrEqual(tb.y + tb.height + 0.5);
      await expect(page.locator('.pnl .allday')).toBeVisible();
      await page.locator('.pswitch').getByRole('button', { name: 'タスク', exact: true }).click();
      await expect(page.locator('.pnl [data-wait="task"]')).toBeVisible();
      await page.locator('.pswitch').getByRole('button', { name: 'ノート', exact: true }).click();
      await expect(page.locator('.pnl [data-act="notenew"]')).toBeVisible();
      expect((await ui(page)).pages.portraitBottom).toBe('memo');
      const last = await box(page.locator('.pnl .memopage')), pn = await box(page.locator('.pnl'));
      expect(last.y + last.height).toBeLessThanOrEqual(pn.y + pn.height + 0.5);
    });
  });
}

test.describe('下パネルの操作と保存', () => {
  const size = SIZES.openPortrait669;
  test('×・ボタン・つまみ（クリック/下へ引く）で隠れ、下端から上へ引くと出る。保存される', async ({ page }) => {
    await openApp(page, size);
    await show(page);
    expect((await ui(page)).pages.portraitShown).toBe(true);
    await page.getByRole('button', { name: '下の段を隠す' }).first().click(); // 見出しの × か つまみ
    await expect(page.locator('.pnl')).toHaveCount(0);
    expect((await ui(page)).pages.portraitShown).toBe(false);
    await show(page);
    await page.locator('.pclose').click();
    await expect(page.locator('.pnl')).toHaveCount(0);
    await show(page);
    await page.locator('.pgrip').click();
    await expect(page.locator('.pnl')).toHaveCount(0);
    // つまみを下へ引く
    await show(page);
    const g = await box(page.locator('.pgrip i'));
    await page.mouse.move(g.x + 18, g.y + 2); await page.mouse.down(); await page.mouse.move(g.x + 18, g.y + 40, { steps: 4 }); await page.mouse.move(g.x + 18, g.y + 80, { steps: 4 }); await page.mouse.up();
    await expect(page.locator('.pnl')).toHaveCount(0);
    // 下端から上へ引く
    const sc = await box(page.locator('.calendar .scroll')), y = sc.y + sc.height - 4;
    await page.mouse.move(300, y); await page.mouse.down(); await page.mouse.move(300, y - 40, { steps: 4 }); await page.mouse.move(300, y - 90, { steps: 4 }); await page.mouse.up();
    await expect(page.locator('.pnl')).toBeVisible();
    await page.reload(); await page.waitForSelector('html[data-ready]');
    await expect(page.locator('.pnl')).toBeVisible(); // 保存されている
  });

  test('0.25秒の動き: 表示直後は途中、0.3秒後に確定', async ({ page }) => {
    await openApp(page, size);
    await page.getByRole('button', { name: '下の段を表示' }).click();
    await expect(page.locator('html')).toHaveClass(/pnl-anim/);
    await page.waitForTimeout(350);
    await expect(page.locator('html')).not.toHaveClass(/pnl-anim/);
  });

  test('下端をたたくだけなら下のマスが選ばれる（引き口は通す）', async ({ page }) => {
    await openApp(page, size);
    const sc = await box(page.locator('.calendar .scroll'));
    const cell = page.locator('.week').last().locator('.day').nth(2);
    const cb = await box(cell), key = await cell.getAttribute('data-date');
    await page.mouse.click(cb.x + cb.width / 2, sc.y + sc.height - 3);
    await expect(page.locator('.pnl')).toHaveCount(0);
    expect((await ui(page)).selected).toBe(key); // 閉状態の従来動作（日表示へ）。引き口が通した
  });

  test('日をたたくと月のまま選択日が変わり、パネルの日付も変わる（日表示へ移らない）', async ({ page }) => {
    await openApp(page, size);
    await show(page);
    await page.locator('[data-date="2026-11-20"]').click({ position: { x: 12, y: 10 } });
    await expect(page.locator('.pnl .pdate')).toContainText('11月20日');
    await expect(page.locator('.calendar .week').first()).toBeVisible();
    expect((await ui(page)).view).toBe('month');
  });

  test('月タブのときだけ使える。他タブでは消え、設定は残る。月へ戻ると出る', async ({ page }) => {
    await openApp(page, size);
    await show(page);
    await page.locator('.pswitch').getByRole('button', { name: 'ノート', exact: true }).click();
    await tab(page, '週').click();
    await expect(page.locator('.pnl')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /下の段を(表示|隠す)/ })).toHaveCount(0);
    expect((await ui(page)).pages).toMatchObject({ portraitShown: true, portraitBottom: 'memo' });
    await tab(page, '月').click();
    await expect(page.locator('.pnl')).toBeVisible();
    await expect(page.locator('.pnl')).toHaveAttribute('data-panel', 'memo');
    await page.locator('.tabs').getByRole('button', { name: 'ホーム', exact: true }).click();
    await expect(page.locator('.pnl')).toHaveCount(0);
  });

  test('＋は下パネルが有効ならその種類へ。時間は予定の追加、タスクは入力欄', async ({ page }) => {
    await openApp(page, size);
    await show(page);
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#close').click();
    await page.locator('.pswitch').getByRole('button', { name: 'タスク', exact: true }).click();
    await page.getByRole('button', { name: '予定を追加' }).click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('タスクを入力できます。');
  });

  test('回転: 横では出ず、縦へ戻ると表示のまま。表示中に回転しても保存は消えない', async ({ page }) => {
    await openApp(page, size);
    await show(page);
    await page.setViewportSize(SIZES.openLandscape951);
    await expect(page.locator('.pnl')).toHaveCount(0);
    await expect(page.locator('.page.lp')).toBeVisible();
    await page.setViewportSize(size);
    await expect(page.locator('.pnl')).toBeVisible();
  });

  test('メモ入力中の拡大口: 入力欄にフォーカスで上端がマスの上端（グリッド上端）まで広がり、戻る', async ({ page }) => {
    await openApp(page, size);
    await show(page);
    const gt = (await box(page.locator('.calendar .scroll'))).y;
    await page.evaluate(() => { const t = document.createElement('textarea'); t.id = 'tmpmemo'; document.querySelector('.pbody2').append(t); t.focus(); });
    await expect(page.locator('.pnl')).toHaveClass(/up/);
    const up = await box(page.locator('.pnl'));
    expect(near(up.y, gt - 0, 1) || near(up.y, 106, 1)).toBe(true);
    await page.evaluate(() => document.querySelector('#tmpmemo').blur());
    await expect(page.locator('.pnl')).not.toHaveClass(/up/);
  });

  for (const t of [0, 82]) test(`safe 上${t}: 位置が破綻せず ×・切替・ボタンが重ならない`, async ({ page }) => {
    {
      await openApp(page, size);
      await setSafe(page, { t });
      await show(page);
      const pn = await box(page.locator('.pnl')), sc = await box(page.locator('.calendar .scroll'));
      expect(near(pn.y, sc.y + sc.height)).toBe(true);
      expect(pn.height).toBeGreaterThan(200);
      const bs = await Promise.all(['.pclose', '.pswitch', '.pdate', '.pgrip'].map((s) => box(page.locator(s))));
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(noOverlap(bs[i], bs[j])).toBe(true);
      const btn = await box(page.getByRole('button', { name: '下の段を隠す' }).last()), tabs = await box(page.locator('.tabs'));
      expect(noOverlap(btn, tabs)).toBe(true);
    }
  });
});
