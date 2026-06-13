/* San Vito '26 — service worker
   Strategia: network-first per le pagine (fresco quando c'è rete),
   fallback alla cache quando si è offline (es. in aereo).            */
const CACHE = 'svito26-v2';
const ASSETS = [
  './', './index.html', './dintorni.html', './lei.html',
  './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png', './og.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // add individuale: un 404 non deve far fallire tutto l'install
    await Promise.allSettled(ASSETS.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Pagine (navigazioni): rete prima, cache come rete di sicurezza
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || await caches.match('./index.html') || Response.error();
      }
    })());
    return;
  }

  // Altri GET (icone, og, font): cache se c'è, intanto aggiorna in background
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(res => {
      if (res && res.status === 200) {
        caches.open(CACHE).then(c => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
