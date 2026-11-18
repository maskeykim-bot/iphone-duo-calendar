import { defineConfig } from '@playwright/test';

const exe = process.env.CHROME_PATH || '/usr/bin/google-chrome';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  webServer: { command: 'node server.mjs 4173', url: 'http://127.0.0.1:4173/', reuseExistingServer: true },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    launchOptions: { executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
  },
  projects: [
    // 全 spec（今の設定そのまま）
    { name: 'chromium' },
    // めくりの spec だけ WebKit でも回す（第18版。iOS の WebKit に近い描画の確認）
    { name: 'webkit', testMatch: /curl-.*\.spec\.js/, use: { browserName: 'webkit', launchOptions: {} } },
  ],
});
