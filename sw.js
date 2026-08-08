// Crownhold service worker: the whole game is one self-contained page —
// cache it so the hold loads instantly and works offline.
//
// CACHE is rewritten per build by scripts/release.js, so every deploy gets its own cache and the
// activate handler below deletes the previous one.
const CACHE = 'crownhold-4dce722';

self.addEventListener('install', e => {
  /* cache:'reload' matters here. GitHub Pages serves the page with `cache-control: max-age=600`,
     and a plain addAll goes through the browser's HTTP cache — so a worker installing for a NEW
     build could cache the PREVIOUS build's HTML and then serve it faithfully for as long as it
     lived. Reported from a real browser: the site stuck on an old version while another browser
     showed the current one, and refreshing could not fix it because the refresh was being answered
     from a cache below the one doing the refreshing. */
  e.waitUntil(
    caches.open(CACHE).then(c => c.add(new Request('./', { cache: 'reload' })))
      .catch(() => caches.open(CACHE).then(c => c.addAll(['./'])))   // older browsers
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

/* Network-first, and for the PAGE itself network-first that actually reaches the network. A
   navigation answered out of the HTTP cache is how a player ends up pinned to a build they cannot
   refresh away from, which for a live game is about the worst failure available — every fix and
   balance change silently fails to arrive. Assets keep the plain fetch: they are content-hashed,
   so a stale one cannot be wrong. */
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const isPage = e.request.mode === 'navigate'
    || (e.request.destination === 'document');
  const go = isPage
    ? fetch(new Request(e.request.url, { cache: 'reload', credentials: 'same-origin' }))
    : fetch(e.request);
  e.respondWith(
    go.then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});
