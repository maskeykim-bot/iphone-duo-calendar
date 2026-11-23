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
    // めくりの spec と R-70 の日本語変換テスト（S10）、S11d の設計レビュー M1〜M9（M1 の 0.5 の線は WebKit で 0.5 のまま出る）を WebKit でも回す（iOS の WebKit に近い描画・IME の確認）。第19.3版: v193-closed-scroll（段はつまみだけ・1本のスクロール）も。その2: s11i・s11j・s11i-design-18-5（つまみ（下）の貼り付き §18-5〜§18-7）は、征希さん「カード・時間で分けるだけ」（design/35 §5.4 で捨てた決まり）でファイルごと外した
    { name: 'webkit', testMatch: /(curl-.*|note-ime-r70|s11b-design-m|s11d-design-14-15|s11g|s11h|v193-closed-scroll|v193-day-cardtime|v193-design35-s9|v193-keyboard|v193-note-tasks|v193-note-marks|v193-tasks-local)\.spec\.js/, use: { browserName: 'webkit', launchOptions: {} } },
  ],
});
