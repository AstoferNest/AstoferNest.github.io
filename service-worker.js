const CACHE_NAME = 'dbd-perkroulette-v1';

// Arquivos essenciais para funcionar offline
const urlsToCache = [
  '/DBD/perkroulette/',
  '/DBD/perkroulette/index.html',
  '/DBD/perkroulette/css/app.css',
  '/DBD/perkroulette/js/app/app.js',
  '/DBD/perkroulette/json/survivor-perks.json',
  '/DBD/perkroulette/json/killer-perks.json',
  '/DBD/perkroulette/css/img/favicon.png',
  '/DBD/perkroulette/css/img/random.png',
  '/DBD/perkroulette/css/img/perk_purple.png'
];

// Instalação: salva os arquivos no cache
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

// Ativação: remove caches antigos
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
});

// Intercepta requisições: usa cache se disponível, senão busca na rede
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) {
        return response; // Retorna do cache
      }
      return fetch(event.request); // Busca na rede
    })
  );
});
