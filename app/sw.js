// 静的アセットのみをキャッシュ。同一オリジン以外には一切アクセスしない。
const CACHE = 'duo-static-v190';
const ASSETS = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/elastic.js', './js/event-ref.js', './js/db.js', './js/util.js', './js/sample.js', './js/swipe.js', './js/recur.js', './js/search.js', './js/backup.js', './js/native.js', './js/iphone.js', './js/categories.js', './js/colors.js', './js/event-colors.js', './js/theme-preview.js', './js/occcache.js', './js/alarms.js', './js/notify.js', './js/rokuyo.js', './js/rokuyo-table.js', './js/pages.js', './js/home.js', './js/memos.js', './js/notes-model.js', './js/notes.js', './js/notes-ui.js', './js/note-lines.js', './js/note-tasks.js', './js/reminders.js', './js/direct-input.js', './js/paste.js', './js/datetime.js', './js/datetime-ui.js', './js/destination-ui.js', './js/kbmetrics.js', './js/keyboard-layout.js', './js/posture.js', './js/holidays.js', './js/holidays-table.js', './js/tasks.js', './js/curl/params.js', './js/curl/geom.js', './js/curl/shaders.js', './js/curl/mesh.js', './js/curl/renderer.js', './js/curl/index.js', './js/curl/painter.js', './js/curl/gesture.js', './js/curl/landing.js', './js/curl/perf.js', './js/curl/native-curl.js', './js/fold.js', './js/move-day.js', './js/note-ink.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // ネットワーク優先、失敗時（オフライン）はキャッシュ。
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
