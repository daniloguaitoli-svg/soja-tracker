// sw.js — PWA com atualização automática.
//
// Estratégia:
//   - HTML / navegação  -> NETWORK-FIRST: sempre busca o index.html novo (que
//     aponta para o JavaScript mais recente); cai no cache só quando offline.
//   - Assets com hash (/assets/*.js|css, imagens) -> CACHE-FIRST: são imutáveis
//     e o nome muda a cada build, então versões novas entram automaticamente.
//   - /api/*            -> sempre rede (dados nunca são cacheados).
// O par skipWaiting + clients.claim faz a versão nova assumir na hora; o
// registro em main.jsx recarrega a página uma vez quando detecta a atualização.
const CACHE = "soja-tracker-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function ehNavegacao(req) {
  return (
    req.mode === "navigate" ||
    (req.method === "GET" && (req.headers.get("accept") || "").includes("text/html"))
  );
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin !== location.origin) return; // terceiros (fontes) passam direto
  if (url.pathname.startsWith("/api/")) return; // dados sempre da rede

  // HTML / navegação -> network-first (garante index.html novo -> JS novo).
  if (ehNavegacao(request)) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copia));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/index.html")))
    );
    return;
  }

  // Demais assets -> cache-first, alimentando o cache no primeiro acesso.
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copia));
          }
          return res;
        })
    )
  );
});
