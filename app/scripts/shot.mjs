// 開発用: node scripts/shot.mjs → /tmp/duo-shots/*.png
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('/tmp/duo-shots', { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const sizes = { cp: [466, 678], cl: [678, 466], op: [626, 890], ol: [890, 626] };
const shots = process.argv.slice(2);
for (const [name, [w, h]] of Object.entries(sizes)) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', name, e.message));
  p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', name, m.text()));
  await p.clock.setFixedTime(new Date('2026-11-12T09:41:00+09:00'));
  await p.goto('/'.replace('/', 'http://127.0.0.1:4173/'));
  await p.waitForSelector('html[data-ready]');
  await p.getByRole('button', { name: 'サンプルを入れる' }).click();
  await p.waitForTimeout(200);
  const snap = async (tag) => p.screenshot({ path: `/tmp/duo-shots/${name}-${tag}.png` });
  await snap('home');
  for (const [tag, fn] of [
    ['month', async () => p.getByRole('button', { name: '月', exact: true }).click()],
    ['named', async () => p.getByRole('button', { name: '予定名' }).click()],
    ['week', async () => p.getByRole('button', { name: '週', exact: true }).click()],
    ['day', async () => p.getByRole('button', { name: '日', exact: true }).click()],
  ]) { await fn(); await p.waitForTimeout(100); await snap(tag); }
  await p.getByRole('button', { name: '月', exact: true }).click();
  if (w >= 600 && h >= 600) {
    await p.getByRole('button', { name: '卓上' }).click();
    await snap('desk');
  }
  await ctx.close();
}
await b.close();
