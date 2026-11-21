const CACHE_NAME = 'roleta-perks-v1';
const ASSETS = [
  './',
  './index.html',
  './overlay.html',
  './manifest.json',
  './css/randomizer.css',
  './css/classes.css',
  './css/builds.css',
  './css/theme.css',
  './js/app/randomizer.js',
  './js/app/class-roulette.js',
  './json/survivor-perks.json',
  './json/killer-perks.json',
  './json/itens-surv.json',
  './json/itens-kill.json',
  './json/builds-destaque.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
