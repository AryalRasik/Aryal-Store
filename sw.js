const CACHE_VERSION = 'aryal-store-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const PAGES_CACHE = CACHE_VERSION + '-pages';
const API_CACHE = CACHE_VERSION + '-api';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/theme.css',
  '/theme.js',
  '/style.css',
  '/auth.html',
  '/auth.css',
  '/auth.js',
  '/auth-session.js',
  '/checkout.html',
  '/checkout.css',
  '/checkout.js',
  '/track.html',
  '/track.js',
  '/nepal-locations.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png'
];

const CACHEABLE_API = /^\/api\/(products|categories|settings|hero|about|contact|testimonials)(?:\/|$)/;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('aryal-store-') && !key.startsWith(CACHE_VERSION))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin.')) return;

  if (url.pathname.startsWith('/api/')) {
    if (!CACHEABLE_API.test(url.pathname)) return;
    if (request.headers.get('authorization')) return;
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES_CACHE, true));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, cacheName, navigation) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (navigation) {
      const fallback = await caches.match('/offline.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || await network || Response.error();
}
