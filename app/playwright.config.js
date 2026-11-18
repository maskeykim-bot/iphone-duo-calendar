import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PW_PORT || 4173);
const exe = process.env.CHROME_PATH || '/usr/bin/google-chrome';
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  webServer: { command: `node server.mjs ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: true },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
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
