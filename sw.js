/* Daycation Bologna — service worker
   Strategia:
   - HTML e data.json: network-first (sempre freschi online, cache come fallback offline)
     => niente "versione vecchia bloccata" quando aggiorni index.html dall'app GitHub
   - icone / og / manifest: cache-first (cambiano di rado, caricano subito)
   Per forzare un refresh totale della cache, cambia il numero in CACHE. */
const CACHE = 'dcb-v6';
const ASSETS = [
  './',
  './index.html',
  './data.json',
  './weekend.html',
  './weekend-data.json',
  './weekend.webmanifest',
  './weekend-og.png',
  './weekend-icon-192.png',
  './weekend-icon-512.png',
  './weekend-apple-touch.png',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './og-image.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFresh = req.mode === 'navigate'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('index.html')
    || url.pathname.endsWith('weekend.html')
    || url.pathname.endsWith('data.json')
    || url.pathname.endsWith('weekend-data.json');

  if (isFresh) {
    // network-first: prova la rete, salva in cache, fallback alla cache offline
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // asset statici: cache-first
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(r2 => {
      const copy = r2.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return r2;
    }))
  );
});
