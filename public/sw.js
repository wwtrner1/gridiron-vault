/*
 * GridIronVault service worker: makes the installed app open quickly and
 * still open with a weak signal at the field.
 * - Pages: network first; with no signal, the last copy of the app shell.
 * - /assets/*, icons and brand images: cache first (asset file names change with every release).
 * - /api, sign-in and forms: never cached — they always go to the server.
 * Bump VERSION to clear old caches.
 */
const VERSION = "g1v-2";
const SHELL = "/index.html";
/*
 * Filled in by the build (`swRelease` in vite.config.ts): this release's id
 * and every /assets/ file it ships. The id makes each release a new worker,
 * so the browser installs it on the next visit; the list lets `activate`
 * drop the chunks of earlier releases, which warmPages had cached, instead
 * of keeping every release ever opened on the coach's device.
 */
const RELEASE = "__RELEASE__";
const SHIPPED = new Set(__ASSETS__);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

/** Cached /assets/ files that this release no longer ships (an earlier release's chunks). */
async function dropOldChunks() {
  if (RELEASE.startsWith("__")) return; // unbuilt copy: nothing to compare against
  const cache = await caches.open(VERSION);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .filter((req) => {
        const path = new URL(req.url).pathname;
        return path.startsWith("/assets/") && !SHIPPED.has(path);
      })
      .map((req) => cache.delete(req)),
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(dropOldChunks)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/") || url.pathname.startsWith("/__forms")) return;
  // The guide articles are their own static pages, never the app shell: don't let one replace the cached shell.
  if (url.pathname.startsWith("/guides")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(SHELL, res.clone()));
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  // Brand images are .webp (Griddy's badge, the logos) and tutorial posters .jpg; without them a no-signal page shows gaps.
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webp|jpg|webmanifest|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
