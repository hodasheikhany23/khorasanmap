const CACHE_NAME = "khorasan-Yadman-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./adminarea.js",
  "./places_khorasan.js",
  "./points.js",
  "./road.js",
  "./manifest.json",
  "./service-worker.js",
  "./assets/css/style.css", 
  "./assets/css/bootstrap.rtl.min.css",
  "./assets/css/bootstrap.rtl.min.css.map", 
  "./assets/fonts/IRANSansX-RegularD4.woff2",
  "./assets/js/main.js",
  "./assets/js/bootstrap.bundle.min.js",
  "./assets/js/bootstrap.min",
  "./assets/leaflet/leaflet.js",
  "./assets/leaflet/leaflet.css"
];



self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});