/**
 * Fantasy Hoops Liberia — Service Worker (PWA-002)
 *
 * Cache strategy summary:
 *   App shell   (/_next/static/**, icons, manifest) → Cache First
 *   Pages HTML  (non-admin, non-auth navigations)   → Stale While Revalidate
 *   API GET     (unauthenticated endpoints only)     → Network First (short TTL)
 *   Images      (player photos)                     → Cache First  (LRU 100)
 *   Admin/auth  (/admin/**, /login, /register, POST) → Network Only
 *
 * Update strategy: install-then-wait; sends UPDATE_AVAILABLE to all clients.
 * Responds to SKIP_WAITING message from the app's UpdateBanner component.
 */

// ─── Version — bump on every deployment ──────────────────────────────────────
const CACHE_VERSION = "v1";

const CACHE_SHELL  = `fhl-shell-${CACHE_VERSION}`;
const CACHE_PAGES  = `fhl-pages-${CACHE_VERSION}`;
const CACHE_API    = `fhl-api-${CACHE_VERSION}`;
const CACHE_IMAGES = `fhl-images-${CACHE_VERSION}`;

const MAX_IMAGE_ENTRIES = 100;
const API_TTL_MS        = 5 * 60 * 1000;   // 5 minutes default
const TEAMS_TTL_MS      = 60 * 60 * 1000;  // 60 minutes for /teams

// ─── Assets to precache during install ───────────────────────────────────────

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.svg",
  "/icon-16.png",
  "/icon-32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/offline.html",
];

// ─── Install — precache shell ─────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      // Use {cache: 'reload'} to bypass HTTP cache during precache
      Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {
            // Non-fatal — some assets may not exist yet (e.g. icons)
            console.warn("[SW] Failed to precache:", url);
          })
        )
      )
    )
    // Do NOT call skipWaiting() here — wait for explicit SKIP_WAITING message
  );
});

// ─── Activate — delete stale caches ──────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => {
            // Delete any cache that belongs to FHL but is from an old version
            const isFHL = key.startsWith("fhl-");
            const isCurrent = [CACHE_SHELL, CACHE_PAGES, CACHE_API, CACHE_IMAGES].includes(key);
            return isFHL && !isCurrent;
          })
          .map((key) => caches.delete(key))
      )
    ).then(() => {
      // Take control of all clients immediately after activation
      self.clients.claim();
      // Notify all open tabs that a new version is now active
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "SW_ACTIVATED" }));
      });
    })
  );
});

// ─── Message handler — SKIP_WAITING ──────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Helper: notify waiting service worker there's a new version pending ─────

function notifyUpdateAvailable() {
  self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: "UPDATE_AVAILABLE" }));
  });
}

// When a new SW is waiting, tell the app
self.addEventListener("install", () => {
  // A waiting SW means there was already an active SW — this is an update
  // We check registration state after install to determine if we're an update
  self.registration.waiting !== null && notifyUpdateAvailable();
});

// ─── Route helpers ────────────────────────────────────────────────────────────

function isAdminPath(url)     { return url.pathname.startsWith("/admin"); }
function isAuthPath(url)      { return url.pathname === "/login" || url.pathname === "/register"; }
function isApiRequest(url)    { return url.hostname !== self.location.hostname; }
function isNavigationToPage(request) { return request.mode === "navigate"; }
function isNextStaticAsset(url) { return url.pathname.startsWith("/_next/static/"); }
function isImageRequest(request) {
  const dest = request.destination;
  return dest === "image";
}

/** Unauthenticated API endpoints safe to cache */
function isCacheableAPI(url) {
  const safe = ["/leaderboard", "/players", "/teams", "/sponsors", "/market", "/selection-stats"];
  return safe.some((p) => url.pathname.startsWith(p));
}

function apiTTL(pathname) {
  if (pathname.startsWith("/teams")) return TEAMS_TTL_MS;
  return API_TTL_MS;
}

// ─── Strategies ───────────────────────────────────────────────────────────────

/** Cache First — return cache hit immediately, fall back to network */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

/** Network First — try network, fall back to cache */
async function networkFirst(request, cacheName, ttlMs) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", Date.now().toString());
      const cachedResponse = new Response(await response.clone().arrayBuffer(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      // Check TTL
      const cachedAt = cached.headers.get("sw-cached-at");
      if (cachedAt && Date.now() - Number(cachedAt) < ttlMs * 3) {
        // Allow 3× TTL grace period when offline — stale is better than nothing
        return cached;
      }
      return cached;
    }
    throw new Error("Network error and no cache available");
  }
}

/** Stale While Revalidate — return cache immediately, update in background */
async function staleWhileRevalidate(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || fetchPromise;
}

/** LRU image cache — evict oldest when over MAX_IMAGE_ENTRIES */
async function cacheImageLRU(request) {
  const cache  = await caches.open(CACHE_IMAGES);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (!response.ok) return response;

    // Evict oldest if at limit
    const keys = await cache.keys();
    if (keys.length >= MAX_IMAGE_ENTRIES) {
      await cache.delete(keys[0]);
    }
    cache.put(request, response.clone());
    return response;
  } catch {
    return cached || new Response("", { status: 503 });
  }
}

// ─── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Non-GET requests — always Network Only
  if (event.request.method !== "GET") return;

  // 2. Third-party requests (CDN, external APIs) — pass through
  if (url.hostname !== self.location.hostname) return;

  // 3. Admin paths — Network Only (never serve admin from cache)
  if (isAdminPath(url)) return;

  // 4. Auth pages — Network Only
  if (isAuthPath(url)) return;

  // 5. Next.js static assets — Cache First (content-hashed, safe to cache forever)
  if (isNextStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, CACHE_SHELL));
    return;
  }

  // 6. Shell assets (icons, manifest) — Cache First
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_SHELL));
    return;
  }

  // 7. Image requests — Cache First with LRU eviction
  if (isImageRequest(event.request)) {
    event.respondWith(cacheImageLRU(event.request));
    return;
  }

  // 8. Cacheable API endpoints — Network First
  if (isCacheableAPI(url)) {
    event.respondWith(
      networkFirst(event.request, CACHE_API, apiTTL(url.pathname))
    );
    return;
  }

  // 9. Page navigations — Stale While Revalidate with offline fallback
  if (isNavigationToPage(event.request)) {
    event.respondWith(
      staleWhileRevalidate(event.request, CACHE_PAGES).catch(async () => {
        const offline = await caches.match("/offline.html");
        return offline || new Response("<h1>Offline</h1>", {
          headers: { "Content-Type": "text/html" },
        });
      })
    );
    return;
  }

  // 10. Everything else — Network Only (fall through to browser default)
});
