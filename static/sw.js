// No-op service worker for now
// Just passthrough - no caching
self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request));
});
