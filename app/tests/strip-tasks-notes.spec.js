// 第16版 PR12: 右の帯にタスクとメモの入口（DP-3）。閉じた画面・開いた横の帯に6項目。縦の上帯には置かない。
import { test, expect } from '@playwright/test';
import { openApp, tab, SIZES, expectShown, setStyle } from './helpers.js';
import { spy, seedTasks, T } from './task-helpers.js';

// 期限切れ＋今日の未完了を over 件、他に完了・先の予定を Duo 内保存へ seed（band が起動後に入れる）。native は偽装のみ。
const PEND = new WeakMap();
async function mock(page, over = 3) {
  await spy(page);
  const day = (off) => { const d = new Date(2026, 10, 12 + off); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const L = [];
  const T1 = (id, title, due, o = {}) => L.push(T(id, { title, due, order: L.length + 1, createdAt: L.length + 1, updatedAt: L.length + 1, ...o }));
  for (let i = 0; i < over; i++) T1(`o${i}`, `対象${i}`, { date: day(i % 2 ? 0 : -1 - (i % 5)) });
  T1('soon', '先', { date: day(3) }); T1('nd', 'なし', null); T1('dn', '済', { date: day(0) }, { done: true, doneAt: `${day(0)}T08:00` });
  PEND.set(page, L);
}
const setSafe = (page, r) => page.evaluate((r) => { const s = document.documentElement.style; s.setProperty('--sar', `${r}px`); }, r);
const band = async (page, size, r = 84) => { await openApp(page, size); if (PEND.get(page)?.length) await seedTasks(page, PEND.get(page)); await setSafe(page, r); await page.waitForTimeout(80); };
const sb = (page, id) => page.locator(`.ctl [data-strip="${id}"]`);
const near = (a, b, tol = 0.8) => expect(Math.abs(a - b), `${a} ≈ ${b}`).toBeLessThanOrEqual(tol);
const names = (page) => page.locator('.ctl button').evaluateAll((e) => e.map((b) => b.dataset.act + (b.dataset.strip ? `:${b.dataset.strip}` : '')));

test.describe('閉じた画面の帯', () => {
  test('右の列は ホーム・タスク・ノート・月の固定・今日・検索・…・＋ の8項目。設定・全は帯にない', async ({ page }) => {
    // 旧: 設定・検索・タスク・ノート・今日・＋ の6項目（タスク y418・ノート y478）。34 §9.1-12: タスクは y172〜220 へ上げ、ノートは日の欄の「ノート ›」へ
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    // v19.5（征希さん「直感的に操作できるよう変更したい」。右の列＝ホーム・タスク・ノート／月の固定／今日・検索・…／＋）で仕様変更
    expect(await names(page)).toEqual(['railhome', 'strip:task', 'strip:memo', 'pin', 'today', 'search', 'more', 'noteundo', 'noteredo', 'add']); // S11e（34 §15-②）: 書いている間は タスク→「元に戻す」、…→「やり直す」に替わる（同じ位置に重ねて持つ。ふだんは隠れていて押せない・読み上げない。下の toHaveCount(3) が見えるボタンの数）
    await expect(page.locator('.ctl').getByRole('button')).toHaveCount(8);
    const r = await sb(page, 'task').boundingBox();
    near(r.width, 50); near(r.height, 50); near(r.y, 210); near(r.x + 25, 466 - 42);
    const v = await sb(page, 'task').locator('.bi').boundingBox();
    near(v.width, 44); near(v.height, 40);
    await expect(sb(page, 'memo')).toHaveCount(1);
    await expect(page.locator('.ctl [data-act="allmonth"]')).toHaveCount(0);
    // 全は「…」→「月の表現」へ（§9.1-2）。選ぶと全部表示、状態を保つ
    await expect(page.locator('.mph [data-act="allmonth"]')).toHaveCount(0);
    await setStyle(page, '全部');
    await expect(page.locator('.scroll.all')).toBeVisible();
    await tab(page, '週').click(); await tab(page, '月').click();
    await expect(page.locator('.scroll.all')).toBeVisible();
  });

  test('たたくと全面にタスク、タブは未選択、再押下とタブで戻る。日付・表示は上書きしない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await tab(page, '週').click();
    const before = await page.evaluate(() => localStorage.getItem('duo.ui.v1'));
    expect(before).toBeTruthy();
    await sb(page, 'task').click();
    await expect(page.locator('.stripp[data-page="task"]')).toBeVisible();
    await expect(sb(page, 'task')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.tabs [aria-pressed="true"]').count()).toBe(0);
    await expect(page.locator('.stripp [data-key="rm:o0"]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('duo.ui.v1'))).toBe(before);
    await sb(page, 'task').click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expectShown(page, '週');
    await sb(page, 'task').click();
    await tab(page, '月').click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expectShown(page, '月');
  });

  test('ノートの入口は日の欄の「ノート ›」（design/34 §9.1-7 で置き換え）: タスクから「‹ カレンダー」で戻って開ける。日付は動かさず、「‹ カレンダー」で戻る', async ({ page }) => {
    // 旧: 帯の「ノート」。タスクからノートへ直接移り、再押下で戻る
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await tab(page, '月').click();
    await page.locator('.mgrid [data-date="2026-11-14"]').click({ position: { x: 12, y: 10 } });
    await sb(page, 'task').click();
    await expect(page.locator('.stripp[data-page="task"]')).toBeVisible();
    await page.getByRole('button', { name: 'カレンダーへ戻る' }).click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await page.locator('.mday .mdnl').click();
    await expect(page.locator('.stripp[data-page="memo"] [data-act="notenew"]')).toBeVisible();
    await expect(page.locator('.stripp h2')).toHaveText('ノート');
    await expect(sb(page, 'task')).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'カレンダーへ戻る' }).click();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expect(page.locator('.mgrid [data-date="2026-11-14"]')).toHaveAttribute('aria-selected', 'true'); // ノートは日付を動かさない
  });

  test('帯に「ノート」のボタンがある（v19.5 で仕様変更。前: 帯にノートの丸はない）。「今日のメモあり」の印はない。日の欄の入口の名前は「ノートの一覧」（「ノート ›」）', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await page.evaluate(async () => { const d = await import('/js/db.js'); await d.putMemo('2026-11-12', '買い物'); await d.migrateNotesOnce(); });
    await tab(page, '月').click();
    await expect(sb(page, 'memo')).toHaveCount(1);
    await expect(page.locator('.ctl .has')).toHaveCount(0);
    const nl = page.locator('.mday .mdnl');
    await expect(nl).toHaveAttribute('aria-label', 'ノートの一覧');
    await expect(nl).toHaveText('ノート ›');
    await nl.click();
    await expect(page.locator('.stripp .mrow')).toHaveCount(1);
  });

  test('開いている丸は緑の地・白いアイコン（第19.1版 M-16: design/review M-16「地を緑、アイコンを白」）', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    await sb(page, 'task').click();
    const s = await sb(page, 'task').locator('.bi').evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.color]; });
    expect(s[0]).toBe('rgb(41, 78, 66)');
    expect(s[1]).toBe('rgb(255, 255, 255)');
    // 四角い地は出ない: ボタン自体は透明
    expect(await sb(page, 'task').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  });

  test('長押し0.8秒で名前の吹き出し（タスク）。離したあとの click で開かない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.closedPortrait);
    const r = await sb(page, 'task').boundingBox();
    await page.mouse.move(r.x + 28, r.y + 28);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await expect(page.locator('.stip')).toHaveCount(0);
    await page.waitForTimeout(700);
    await expect(page.locator('.stip')).toHaveText('タスク');
    await page.mouse.up();
    await expect(page.locator('.stripp')).toHaveCount(0);
    await expect(page.locator('.stip')).toHaveCount(0, { timeout: 3000 });
    await sb(page, 'task').click();
    await expect(page.locator('.stripp')).toBeVisible();
  });

  test('帯がない（safe=0）画面では、タスクの入口は見出しの右（押せる 44）。ノートの丸はない', async ({ page }) => {
    // 旧: 帯がない画面には入口を足さない。34 で下のタブがなくなり、タスクの入口は右の列だけになったので、帯がない画面でも見出しの右に置く（ブラウザ用）
    await mock(page);
    await openApp(page, SIZES.closedPortrait);
    await expect(page.locator('[data-strip]')).toHaveCount(1);
    await expect(sb(page, 'memo')).toHaveCount(0);
    const r = await sb(page, 'task').boundingBox();
    near(r.width, 44); near(r.height, 44); near(r.y, 0); near(r.x + r.width, 466 - 8); // S11e（34 §15-③）: タスク x414〜458（右端は 8 あける）
    await sb(page, 'task').click();
    await expect(page.locator('.stripp[data-page="task"]')).toBeVisible();
  });
});

test.describe('バッジ', () => {
  for (const [over, text] of [[0, null], [1, '1'], [99, '99'], [100, '99+']]) {
    test(`期限切れ＋今日の未完了 ${over} 件 → ${text ?? '出さない'}`, async ({ page }) => {
      await mock(page, over);
      await band(page, SIZES.closedPortrait);
      const b = sb(page, 'task');
      if (text === null) {
        await expect(b.locator('.bdg')).toHaveCount(0);
        await expect(b).toHaveAttribute('aria-label', 'タスク');
      } else {
        await expect(b.locator('.bdg')).toHaveText(text);
        await expect(b).toHaveAttribute('aria-label', `タスク、期限切れと今日 ${over}件`);
        const s = await b.locator('.bdg').evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.color, c.fontSize, e.getBoundingClientRect().height]; });
        expect(s).toEqual(['rgb(180, 60, 60)', 'rgb(255, 255, 255)', '10px', 18]);
      }
    });
  }
  test('先の期限・期限なし・完了済みは数えない', async ({ page }) => {
    await mock(page, 2);
    await band(page, SIZES.closedPortrait);
    await expect(sb(page, 'task').locator('.bdg')).toHaveText('2');
  });
});

test.describe('開いた横の帯', () => {
  for (const size of [SIZES.openLandscape, SIZES.openLandscape951]) {
    test(`${size.width}×${size.height}: 6項目（第18版: 見開きの型のボタンが検索とタスクの間に加わる）、右ページを切替・再押下で戻る`, async ({ page }) => {
      await mock(page);
      await band(page, size);
      expect(await names(page)).toEqual(['menu', 'search', 'spreadtype', 'strip:task', 'strip:memo', 'today', 'add']);
      const q = size.height / 669;
      near((await sb(page, 'task').boundingBox()).y, (size.height - 249 * q) - 4);
      near((await sb(page, 'memo').boundingBox()).y, (size.height - 189 * q) - 4);
      const savedPages = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('duo.ui.v1') || '{"pages":null}').pages));
      const pages0 = JSON.stringify({ left: 'month', right: 'time', portraitBottom: 'time', portraitShown: false }); // 保存済みの選択（既定）。入口で書き換えない
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
      await sb(page, 'task').click();
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'task');
      await expect(page.locator('.page.lp')).toHaveAttribute('data-page', 'month');
      await expect(page.locator('.pgname.pgr span')).toHaveText('タスク'); // v19.6（設計「見開き」・征希さん「各ページの上（設計どおり）」）で仕様変更: いまのページはページ名に出る
      expect(await savedPages()).toBe(pages0);
      await sb(page, 'memo').click();
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'memo');
      await sb(page, 'memo').click();
      await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
    });
  }

  test('右ページの切替を押すと一時表示をやめ、その選択になる', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.openLandscape);
    await sb(page, 'task').click();
    await page.locator('.pgname.pgr').click(); await page.locator('.pgsw.pgr').getByRole('button', { name: '時間', exact: true }).click(); // v19.6（設計「見開き」・征希さん「各ページの上（設計どおり）」）で仕様変更: ページ名を押してから選ぶ
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
    await sb(page, 'memo').click();
    await expect(sb(page, 'memo')).toHaveAttribute('aria-pressed', 'true');
    await page.reload(); await page.waitForSelector('html[data-ready]'); await setSafe(page, 84);
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time'); // 保存されない
  });

  test('左ページがすでにタスクなら強調（0.2秒）だけで右は変わらない', async ({ page }) => {
    await mock(page);
    await band(page, SIZES.openLandscape);
    await page.locator('.pgname.pgl').click(); await page.locator('.pgsw.pgl').getByRole('button', { name: 'タスク', exact: true }).click(); // v19.6（設計「見開き」・征希さん「各ページの上（設計どおり）」）で仕様変更: ページ名を押してから選ぶ
    await expect(page.locator('.page.lp')).toHaveAttribute('data-page', 'task');
    await sb(page, 'task').click();
    await expect(page.locator('.page.lp')).toHaveClass(/flash/);
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
    await expect(sb(page, 'task')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.page.lp')).not.toHaveClass(/flash/);
    await sb(page, 'task').click();
    await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
  });
});

test('開いた縦の上帯には追加せず、下パネルからタスク・メモへ行ける', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('duo.ui.v1')) localStorage.setItem('duo.ui.v1', JSON.stringify({ monthExpand: true })); }); // 第19版 PR6: 下パネルは「全部」の月だけ
  await mock(page);
  await band(page, SIZES.openPortrait, 0);
  await expect(page.locator('[data-strip]')).toHaveCount(0);
  await page.locator('[data-act="pnltoggle"]').click();
  await page.locator('[data-pnl="task"]').click();
  await expect(page.locator('.pnl [data-key="rm:o0"]')).toBeVisible();
  await page.locator('[data-pnl="memo"]').click();
  await expect(page.locator('.pnl [data-act="notenew"]')).toBeVisible();
});

test('帯の姿勢が変わると（開いた横→縦）一時表示は解除される', async ({ page }) => {
  await mock(page);
  await band(page, SIZES.openLandscape);
  await sb(page, 'task').click();
  await page.setViewportSize(SIZES.openPortrait);
  await page.waitForTimeout(150);
  await page.setViewportSize(SIZES.openLandscape);
  await page.waitForTimeout(150);
  await setSafe(page, 84);
  await expect(page.locator('.page.rp')).toHaveAttribute('data-page', 'time');
});
