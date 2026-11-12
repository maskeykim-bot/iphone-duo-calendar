import { test, expect } from '@playwright/test';
import { openApp, tab, setStyle, pickDay, addRepeat, openOccurrence, chip, dbEvents, fillEditor, fillRepeat, ev, seed } from './helpers.js';

// recur.js を実ブラウザで import して展開結果を検証する。
async function expandKeys(page, event, rs, re) {
  return page.evaluate(async ([e, rs, re]) => {
    const { expand } = await import('/js/recur.js');
    return expand([e], rs, re).map((o) => o.start.slice(0, 16)).sort();
  }, [event, rs, re]);
}
const rule = (freq, extra = {}) => ({ freq, interval: 1, byDay: null, count: null, until: null, ...extra });

test.describe('繰り返しの展開（純粋関数）', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/index.html?nosw'); await page.waitForSelector('html[data-ready]'); });

  test('毎日', async ({ page }) => {
    const e = ev('a', 'd', '2026-11-12T10:00', '2026-11-12T11:00', { recurrence: rule('daily') });
    expect(await expandKeys(page, e, '2026-11-10', '2026-11-15')).toEqual(['2026-11-12T10:00', '2026-11-13T10:00', '2026-11-14T10:00', '2026-11-15T10:00']);
  });
  test('毎週・複数曜日（開始日前は作らない）', async ({ page }) => {
    const e = ev('a', 'w', '2026-11-12T10:00', '2026-11-12T11:00', { recurrence: rule('weekly', { byDay: [1, 4] }) });
    expect(await expandKeys(page, e, '2026-11-01', '2026-11-24')).toEqual(['2026-11-12T10:00', '2026-11-16T10:00', '2026-11-19T10:00', '2026-11-23T10:00']);
  });
  test('毎月31日は30日の月・2月をスキップ（丸めない）', async ({ page }) => {
    const e = ev('a', 'm', '2026-01-31T09:00', '2026-01-31T10:00', { recurrence: rule('monthly') });
    expect(await expandKeys(page, e, '2026-01-01', '2026-07-31')).toEqual(['2026-01-31T09:00', '2026-03-31T09:00', '2026-05-31T09:00', '2026-07-31T09:00']);
  });
  test('毎年2/29は閏年のみ', async ({ page }) => {
    const e = ev('a', 'y', '2024-02-29T09:00', '2024-02-29T10:00', { recurrence: rule('yearly') });
    expect(await expandKeys(page, e, '2024-01-01', '2033-12-31')).toEqual(['2024-02-29T09:00', '2028-02-29T09:00', '2032-02-29T09:00']);
  });
  test('回数終了（削除例外も消費）', async ({ page }) => {
    const e = ev('a', 'c', '2026-11-12T10:00', '2026-11-12T11:00', { recurrence: rule('daily', { count: 3 }) });
    expect(await expandKeys(page, e, '2026-11-01', '2027-01-01')).toHaveLength(3);
    const e2 = { ...e, exdates: ['2026-11-13T10:00'] };
    expect(await expandKeys(page, e2, '2026-11-01', '2027-01-01')).toEqual(['2026-11-12T10:00', '2026-11-14T10:00']);
  });
  test('終了日終了（当日分を含む）', async ({ page }) => {
    const e = ev('a', 'u', '2026-11-12T10:00', '2026-11-12T11:00', { recurrence: rule('daily', { until: '2026-11-14' }) });
    expect(await expandKeys(page, e, '2026-11-01', '2027-01-01')).toEqual(['2026-11-12T10:00', '2026-11-13T10:00', '2026-11-14T10:00']);
  });
  test('複数日予定の繰り返し（開始前の重なりも拾う）', async ({ page }) => {
    const e = ev('a', 'x', '2026-11-12T10:00', '2026-11-14T12:00', { recurrence: rule('weekly', { byDay: [4] }) });
    expect(await expandKeys(page, e, '2026-11-13', '2026-11-13')).toEqual(['2026-11-12T10:00']);
    expect(await expandKeys(page, e, '2026-11-20', '2026-11-20')).toEqual(['2026-11-19T10:00']);
    expect(await expandKeys(page, e, '2026-11-16', '2026-11-18')).toEqual([]);
  });
  test('移動した例外は元の範囲外でも移動先で拾い、元の回と二重にならない', async ({ page }) => {
    const e = ev('a', 'o', '2026-11-12T10:00', '2026-11-12T11:00', {
      recurrence: rule('weekly', { byDay: [4] }),
      overrides: { '2026-11-19T10:00': { title: 'moved', cat: 'work', all: false, start: '2026-11-17T08:00', end: '2026-11-17T09:00', place: '', notes: '' } },
    });
    expect(await expandKeys(page, e, '2026-11-17', '2026-11-17')).toEqual(['2026-11-17T08:00']);
    expect(await expandKeys(page, e, '2026-11-19', '2026-11-19')).toEqual([]);
  });
});

test.describe('繰り返しの UI', () => {
  test('毎週の予定を作ると週・月・翌週に出る', async ({ page }) => {
    await openApp(page);
    await addRepeat(page, { title: '週例', rfreq: 'weekly' });
    await tab(page, '週').click();
    await expect(page.locator('.week-event', { hasText: '週例' })).toHaveCount(1);
    await expect(page.locator('.week-event .rep')).toHaveCount(1);
    await page.getByRole('button', { name: '次の週' }).click();
    await expect(page.locator('.week-event', { hasText: '週例' })).toHaveCount(1);
    await tab(page, '月').click();
    await setStyle(page, '予定名');
    for (const k of ['2026-11-12', '2026-11-19', '2026-11-26']) await expect(chip(page, k)).toContainText('週例');
    await expect(chip(page, '2026-11-05')).toHaveCount(0);
    await expect(chip(page, '2026-11-13')).toHaveCount(0);
  });

  test('検証: 曜日0件・回数・終了日', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-act="add"]').click();
    await fillEditor(page, { title: 'x' });
    await fillRepeat(page, { rfreq: 'weekly', days: [] });
    const save = () => page.locator('#editor').getByRole('button', { name: '保存' }).click();
    await save();
    await expect(page.locator('#rerror')).toContainText('曜日を1つ以上');
    await fillRepeat(page, { days: [4], rend: 'count', rcount: '0' });
    await save();
    await expect(page.locator('#rerror')).toContainText('1〜9999');
    await fillRepeat(page, { rend: 'until', runtil: '2026/11/01' });
    await save();
    await expect(page.locator('#rerror')).toContainText('開始日以降の日付');
    expect(await dbEvents(page)).toHaveLength(0);
  });

  test('編集中の繰り返し設定は再読込後もドラフトで残る', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-act="add"]').click();
    await fillEditor(page, { title: '下書き', place: '場所X' });
    await page.locator('#f-notes').fill('メモ\n二行目');
    await fillRepeat(page, { rfreq: 'weekly', days: [1, 3], rend: 'count', rcount: '5' });
    await page.reload();
    await page.waitForSelector('html[data-ready]');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#f-rfreq')).toHaveValue('weekly');
    await expect(page.locator('.dow[data-dow="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.dow[data-dow="4"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#f-rcount')).toHaveValue('5');
    await expect(page.locator('#f-notes')).toHaveValue('メモ\n二行目');
    await expect(page.locator('#rsum')).toHaveText('毎週 月・水／5回');
  });

  test.describe('範囲シート', () => {
    test.beforeEach(async ({ page }) => {
      await openApp(page);
      await addRepeat(page, { title: '週例', rfreq: 'weekly' });
    });

    test('この予定のみ編集', async ({ page }) => {
      await openOccurrence(page, '2026-11-19');
      await fillEditor(page, { title: '特別回' });
      await page.locator('#editor').getByRole('button', { name: '保存' }).click();
      await expect(page.locator('#scope')).toBeVisible();
      await expect(page.locator('#sc-title')).toHaveText('変更する範囲');
      await page.getByRole('button', { name: 'この予定のみ', exact: true }).click();
      await expect(page.locator('#editor')).toBeHidden();
      for (const reload of [false, true]) {
        if (reload) { await page.reload(); await page.waitForSelector('html[data-ready]'); }
        await tab(page, '月').click();
        await setStyle(page, '予定名');
        await expect(chip(page, '2026-11-12')).toContainText('週例');
        await expect(chip(page, '2026-11-19')).toContainText('特別回');
        await expect(chip(page, '2026-11-26')).toContainText('週例');
      }
      expect(await dbEvents(page)).toHaveLength(1);
    });

    test('これ以降すべて編集（元系列は前日で打ち切り）', async ({ page }) => {
      await openOccurrence(page, '2026-11-19');
      await fillEditor(page, { title: '新週例' });
      await page.locator('#editor').getByRole('button', { name: '保存' }).click();
      await page.getByRole('button', { name: 'これ以降すべて' }).click();
      for (const reload of [false, true]) {
        if (reload) { await page.reload(); await page.waitForSelector('html[data-ready]'); }
        await tab(page, '月').click();
        await setStyle(page, '予定名');
        await expect(chip(page, '2026-11-12')).toContainText(/^↻?週例$/);
        await expect(chip(page, '2026-11-19')).toContainText('新週例');
        await expect(chip(page, '2026-11-26')).toContainText('新週例');
        await page.getByRole('button', { name: '次の月' }).click();
        await expect(chip(page, '2026-12-03')).toContainText('新週例');
        await page.getByRole('button', { name: '前の月' }).click();
      }
      const list = await dbEvents(page);
      expect(list).toHaveLength(2);
      expect(list.find((e) => e.title === '週例').recurrence.until).toBe('2026-11-18');
    });

    test('すべて編集は全回に反映', async ({ page }) => {
      await openOccurrence(page, '2026-11-26');
      await fillEditor(page, { title: '全部変更' });
      await page.locator('#editor').getByRole('button', { name: '保存' }).click();
      await page.getByRole('button', { name: 'すべて', exact: true }).click();
      await tab(page, '月').click();
      await setStyle(page, '予定名');
      for (const k of ['2026-11-12', '2026-11-19', '2026-11-26']) await expect(chip(page, k)).toContainText('全部変更');
      expect(await dbEvents(page)).toHaveLength(1);
    });

    test('繰り返し規則を変えると「この予定のみ」は無効', async ({ page }) => {
      await openOccurrence(page, '2026-11-19');
      await fillRepeat(page, { rfreq: 'daily' });
      await page.locator('#editor').getByRole('button', { name: '保存' }).click();
      await expect(page.locator('[data-scope="only"]')).toBeDisabled();
      await expect(page.locator('#sc-note')).toContainText('繰り返しの変更は、これ以降またはすべてを選択');
    });

    test('この予定のみ削除', async ({ page }) => {
      await openOccurrence(page, '2026-11-19');
      await page.getByRole('button', { name: '予定を削除' }).click();
      await expect(page.locator('#sc-title')).toHaveText('削除する範囲');
      await page.getByRole('button', { name: 'この予定のみ', exact: true }).click();
      await expect(page.locator('#confirmtitle')).toHaveText('この予定を削除しますか？');
      await page.getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('#editor')).toBeHidden();
      await page.reload(); await page.waitForSelector('html[data-ready]');
      await tab(page, '月').click();
      await setStyle(page, '予定名');
      await expect(chip(page, '2026-11-19')).toHaveCount(0);
      await expect(chip(page, '2026-11-12')).toHaveCount(1);
      await expect(chip(page, '2026-11-26')).toHaveCount(1);
    });

    test('これ以降すべて削除（確認でキャンセルすると範囲へ戻る）', async ({ page }) => {
      await openOccurrence(page, '2026-11-26');
      await page.getByRole('button', { name: '予定を削除' }).click();
      await page.getByRole('button', { name: 'これ以降すべて' }).click();
      await expect(page.locator('#confirmtitle')).toHaveText('11月26日以降の予定をすべて削除しますか？');
      await page.getByRole('button', { name: 'キャンセル' }).first().click();
      await expect(page.locator('#sc-title')).toHaveText('削除する範囲');
      await page.getByRole('button', { name: 'これ以降すべて' }).click();
      await page.getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('#editor')).toBeHidden();
      await page.reload(); await page.waitForSelector('html[data-ready]');
      await tab(page, '月').click();
      await setStyle(page, '予定名');
      await expect(chip(page, '2026-11-19')).toHaveCount(1);
      await expect(chip(page, '2026-11-26')).toHaveCount(0);
      await page.getByRole('button', { name: '次の月' }).click();
      await expect(chip(page, '2026-12-03')).toHaveCount(0);
    });

    test('すべて削除は再読込後も消えている', async ({ page }) => {
      await openOccurrence(page, '2026-11-19');
      await page.getByRole('button', { name: '予定を削除' }).click();
      await page.getByRole('button', { name: 'すべて', exact: true }).click();
      await expect(page.locator('#confirmtitle')).toHaveText('繰り返し予定をすべて削除しますか？');
      await page.getByRole('button', { name: '削除する' }).click();
      await expect(page.locator('#editor')).toBeHidden();
      await page.reload(); await page.waitForSelector('html[data-ready]');
      expect(await dbEvents(page)).toHaveLength(0);
    });
  });
});

test.describe('schema v1 → v2 移行', () => {
  test('v1 の予定が一切失われず、repeat なしとして表示される', async ({ page }) => {
    await page.goto('/manifest.json');
    const v1 = [
      { id: 'old-1', title: '旧予定A', cat: 'work', start: '2026-11-12T10:00', end: '2026-11-12T11:00', place: '会議室', all: false },
      { id: 'old-2', title: '旧予定B', cat: 'private', start: '2026-11-12T12:00', end: '2026-11-12T13:00', place: '', all: false },
      { id: 'old-3', title: '旧・複数日', cat: 'golf', start: '2026-11-13T00:00', end: '2026-11-15T23:59', place: '軽井沢', all: true },
    ];
    await page.evaluate((list) => new Promise((resolve, reject) => {
      const r = indexedDB.open('duo-calendar-mig1', 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore('events', { keyPath: 'id' });
        s.createIndex('start', 'start');
        r.result.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => {
        const tx = r.result.transaction('events', 'readwrite');
        list.forEach((e) => tx.objectStore('events').put(e));
        tx.oncomplete = () => { r.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    }), v1);
    await openApp(page, undefined, '?ns=mig1&nosw');
    await expect(page.locator('.next')).toContainText('旧予定A');
    await expect(page.locator('.remaining .event')).toHaveCount(1);
    await expect(page.locator('.rep')).toHaveCount(0);
    const raw = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('duo-calendar-mig1');
      r.onsuccess = () => {
        const g = r.result.transaction('events').objectStore('events').getAll();
        g.onsuccess = () => res({ version: r.result.version, rows: g.result });
      };
    }));
    expect(raw.version).toBe(2);
    expect(raw.rows).toHaveLength(3);
    for (const row of raw.rows) {
      expect(row.notes).toBe('');
      expect(row.recurrence).toBeNull();
      expect(row.exdates).toEqual([]);
      expect(row.overrides).toEqual({});
    }
    expect(raw.rows.find((r) => r.id === 'old-3').title).toBe('旧・複数日');
    // 本番 DB には触れていない
    await tab(page, '月').click();
    await pickDay(page, '2026-11-14');
    await expect(page.locator('.daylist .event')).toHaveCount(1);
  });
});
