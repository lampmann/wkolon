/* Hosted offline support adapted from pmcrwf. Each build caches the complete static app,
   themes, layouts, and bundled reviewed Saga rules. Updates wait for Reload.
   Only this site scope and the wkolon cache namespace are served or cleaned up. */
/* Stamped by .github/workflows/pages.yml with the commit being deployed. Left as the literal
   placeholder in the repo, which is correct for local use: a version that never changes is a
   service worker that never updates, and locally you want the server, not the cache - which is why
   src/offline.js doesn't register this at all on localhost. */
const SW_BUILD = "__BUILD__";
const CACHE = "wkolon-" + SW_BUILD;

const SHELL_HTML = "index.html";
// ES module dependencies and bundled reviewed Saga data are part of the same snapshot.
const EXTRA = ["./", "src/rules.js", "src/persistence.js", "src/math-fields.js", "src/dice.js", "src/ability-generation.js", "src/creation-steps.js", "src/rules-reference.js",
  "data/core.json", "data/rules.schema.json", "docs/rules-data.md", "css/themes/index.json"];

/* Pulls every src="…"/href="…" out of the page. Deliberately a regex and not DOMParser: a service
   worker has no DOM. The page is ours and its tags are plain, so this is a fair trade - and the
   test harness runs this exact function against the real file so a hand-written tag that breaks it
   fails a test rather than an offline load six months later. */
function shellUrlsFromHtml(html) {
  const out = [];
  const re = /(?:src|href)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1].trim();
    if (!u) continue;                              // <link id="theme-css" href=""> - filled in at runtime
    if (/^[a-z]+:/i.test(u) || u.startsWith("//")) continue;   // off-origin, data:, mailto:
    if (u.startsWith("#")) continue;
    out.push(u.replace(/^\.\//, ""));
  }
  return [...new Set(out)];
}

/* The theme files are chosen at runtime from a manifest, so no tag names them. Offline with only
   the theme you happened to be using would be a poor showing - they're a few KB each. */
async function themeUrls() {
  const res = await fetch("css/themes/index.json", { cache: "reload" });
  if (!res.ok) throw new Error("Theme manifest unavailable");
  return Object.values(await res.json()).filter(Boolean).map(f => "css/themes/" + f);
}

/* Layout presets are listed the same way, for the same reason. */
async function layoutUrls() {
  const res = await fetch("layouts/index.json", { cache: "reload" });
  if (!res.ok) throw new Error("Layout manifest unavailable");
  return ["layouts/index.json", ...Object.values(await res.json()).filter(Boolean).map(f => "layouts/" + f)];
}

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(SHELL_HTML, { cache: "reload" });
  if (!res.ok) throw new Error("could not read " + SHELL_HTML + " (" + res.status + ")");
  const html = await res.text();
  const urls = [...new Set([SHELL_HTML, ...shellUrlsFromHtml(html), ...(await themeUrls()), ...(await layoutUrls()), ...EXTRA])];
  await cache.put(SHELL_HTML, new Response(html, { headers: res.headers }));
  /* addAll is all-or-nothing, which is what "a version exists entirely or not at all" asks for.
     A single 404 here fails the install and leaves the previous version serving - the right
     outcome, and a visible one in DevTools rather than a silent hole in the cache. */
  await cache.addAll(urls.filter(u => u !== SHELL_HTML));
  return urls.length;
}

self.addEventListener("install", e => {
  // No skipWaiting: see the header. The page decides when to swap.
  e.waitUntil(precache());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith("wkolon-") && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* Sent by src/offline.js when the user takes the update. This is the only path to skipWaiting, so
   the swap can only ever happen because somebody clicked it. */
self.addEventListener("message", e => {
  if (e.data && e.data.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // nothing off-origin is ours to serve

  if (!url.href.startsWith(self.registration.scope)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(req); }
    catch (err) {
      /* Offline and not in the cache. For a navigation that means a deep link or a stale bookmark;
         hand back the shell, which is the whole app anyway. For anything else, be honest. */
      if (req.mode === "navigate") {
        const shell = await cache.match(SHELL_HTML);
        if (shell) return shell;
      }
      return new Response("offline and not cached: " + url.pathname, { status: 504, statusText: "Offline" });
    }
  })());
});
