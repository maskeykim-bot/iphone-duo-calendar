// 静的アセットのみをキャッシュ。同一オリジン以外には一切アクセスしない。
const CACHE = 'duo-static-v8';
const ASSETS = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/db.js', './js/util.js', './js/sample.js', './js/swipe.js', './js/recur.js', './js/search.js', './js/backup.js', './js/native.js', './js/iphone.js', './js/categories.js',
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
