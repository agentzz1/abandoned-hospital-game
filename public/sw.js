// Service worker for the web version (GitHub Pages, home-screen app): after one visit the game also
// starts offline, and every new deploy reaches players on their next start. Never used by the iOS
// app, which ships all files inside the app.
//
// - Pages and files without a content hash (textures, icons, manifest): network first, so updates
//   arrive whenever there is a connection; the cached copy is only used offline (or when the network
//   takes longer than 6 s to answer a page request).
// - Files under assets/ have a content hash in their name and never change: cache first.
// - The cache name carries the build id from the registration URL (sw.js?v=<build>), so each deploy
//   installs a new worker with a fresh cache, which takes over at once and deletes the old caches.

const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const PREFIX = 'krankenhaus-';
const CACHE = PREFIX + BUILD;
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('./', SCOPE).href;
const ASSETS = new URL('assets/', SCOPE).href;
const SHELL = ['manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const PAGE_TIMEOUT_MS = 6000;

const inScope = (url) => url.origin === SCOPE.origin && url.href.startsWith(SCOPE.href);
const isIndex = (url) => url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.html';
// Pages are stored without their query string (?sw=1); the game itself under the scope URL.
function keyFor(url, navigation) {
  if (isIndex(url)) return INDEX;
  if (navigation) return url.origin + url.pathname;
  return url.href;
}

// Only the newest worker writes. After an update the old one may still finish a request or two, and
// must not re-create the cache the new worker has just deleted.
function isNewestWorker() {
  const registration = self.registration;
  const newest = registration.installing || registration.waiting || registration.active;
  return !newest || newest.scriptURL === self.location.href;
}

async function put(cache, key, response) {
  if (response && response.ok && response.type === 'basic' && isNewestWorker()) await cache.put(key, response);
}

// The game page and everything it links: the hashed script, style sheet and fonts.
async function precacheShell(cache) {
  const page = await fetch(INDEX, { cache: 'no-cache' });
  if (!page.ok) return;
  const html = await page.clone().text();
  await put(cache, INDEX, page);
  const files = new Set(SHELL.map((path) => new URL(path, SCOPE).href));
  for (const match of html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)) files.add(new URL(match[1], SCOPE).href);
  for (const href of [...files]) {
    if (!href.endsWith('.css')) continue;
    try {
      const css = await (await fetch(href)).text();
      for (const match of css.matchAll(/url\(["']?([^"')]+\.woff2)["']?\)/g)) files.add(new URL(match[1], href).href);
    } catch { /* the style sheet comes from the network later */ }
  }
  await Promise.all([...files].map(async (href) => {
    try { await put(cache, href, await fetch(href)); } catch { /* cached on first use instead */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      await precacheShell(await caches.open(CACHE));
    } catch { /* offline during install: runtime caching fills the cache later */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Storing a copy never holds up the response; waitUntil keeps the worker alive until it is written.
function store(event, cache, key, response) {
  const writing = put(cache, key, response.clone()).catch(() => {});
  try { event.waitUntil(writing); } catch { /* the response was already answered from the cache */ }
  return response;
}

async function networkFirst(event, url, navigation) {
  const { request } = event;
  if (!isNewestWorker()) return fetch(request);
  const cache = await caches.open(CACHE);
  const key = keyFor(url, navigation);
  const network = fetch(request).then((response) => store(event, cache, key, response));
  if (!navigation) {
    try {
      return await network;
    } catch (error) {
      const cached = await cache.match(key);
      if (cached) return cached;
      throw error;
    }
  }
  // Pages: wait for the network, but not forever when a cached copy exists.
  const cached = await cache.match(key);
  if (!cached) return network;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(cached), PAGE_TIMEOUT_MS); });
  try {
    return await Promise.race([network.catch(() => cached), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(event, url) {
  if (!isNewestWorker()) return fetch(event.request);
  const cache = await caches.open(CACHE);
  const cached = await cache.match(url.href);
  if (cached) return cached;
  return store(event, cache, url.href, await fetch(event.request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!inScope(url) || url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate') event.respondWith(networkFirst(event, url, true));
  else if (url.href.startsWith(ASSETS)) event.respondWith(cacheFirst(event, url));
  else event.respondWith(networkFirst(event, url, false));
});

// The page lists what it loaded before this worker controlled it (the first visit): the textures for
// its device class, fonts, icons. They are stored so the next start also works offline.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'cache-urls' || !Array.isArray(data.urls) || !isNewestWorker()) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let stored = 0;
    for (const href of data.urls) {
      try {
        const url = new URL(href, SCOPE);
        if (!inScope(url) || url.pathname.endsWith('/sw.js')) continue;
        const key = keyFor(url, isIndex(url));
        if (!(await cache.match(key))) await put(cache, key, await fetch(isIndex(url) ? INDEX : url.href));
        stored++;
      } catch { /* skipped; cached on next use */ }
    }
    event.source?.postMessage({ type: 'cached', stored });
  })());
});
