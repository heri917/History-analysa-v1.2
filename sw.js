const CACHE='arn-store-v11-static-5';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./app-icon.png','./interface-logo.png','./loading-logo-source.png','./arn-solution.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => key === CACHE ? null : caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // NEVER cache Supabase/API/network data. Always request fresh data.
  if (url.origin !== self.location.origin || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Only cache this PWA's own static files.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
