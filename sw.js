// UL Treino — service worker
// Estratégia:
//   navegação/HTML  -> network-first (senão o usuário fica preso numa versão antiga)
//   demais assets   -> cache-first (ícones e manifest praticamente não mudam)
// Trocar CACHE a cada release limpa o cache anterior no activate.
const CACHE = "treino-youtube-links-v4-5";
const PRECACHE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// URLs de mídia liberadas pelo app (licença resolvida + offlineEligible).
// Preenchida por postMessage; vazia por padrão, que é o lado seguro.
const MEDIA_CACHE_ALLOWED = new Set();
self.addEventListener("message", (e) => {
  if (e.data?.type === "media-cache-allow" && Array.isArray(e.data.urls)) {
    MEDIA_CACHE_ALLOWED.clear();
    e.data.urls.forEach((u) => MEDIA_CACHE_ALLOWED.add(u));
  }
});

function isExerciseMedia(req) {
  return /\.(mp4|webm|mov|gif|glb|gltf)(\?|$)/i.test(new URL(req.url).pathname);
}

function isNavigation(req) {
  return req.mode === "navigate" ||
    (req.method === "GET" && (req.headers.get("accept") || "").includes("text/html"));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (isNavigation(req)) {
    e.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
          }
          return resp;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Mídia de exercício só é guardada offline quando o app autoriza. A decisão
  // depende da licença (ver licenseAudit/mediaCacheAllowed) e é comunicada pelo
  // app via postMessage. Sem autorização explícita, o service worker apenas
  // repassa a requisição, sem armazenar — guardar mídia de terceiro em cache
  // é uma forma de distribuição, e distribuição sem direito é o risco que
  // queremos evitar.
  if (isExerciseMedia(req)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((resp) => {
        if (resp && resp.ok && MEDIA_CACHE_ALLOWED.has(new URL(req.url).href)) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      }))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      })
    )
  );
});
