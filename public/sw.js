// Service worker do app instalável.
// - Páginas: tenta a internet primeiro (sempre a versão mais nova) e usa a cópia guardada se estiver sem rede.
// - Arquivos de /assets/ (têm o nome com hash, nunca mudam): usa a cópia guardada.
// - Banco de dados (Supabase) e outros sites: não passa por aqui.
const CACHE = "garcom-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    evento.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put("pagina", copia));
          return resp;
        })
        .catch(() => caches.match("pagina"))
    );
    return;
  }

  if (url.pathname.includes("/assets/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    evento.respondWith(
      caches.match(req).then(
        (guardado) =>
          guardado ||
          fetch(req).then((resp) => {
            if (resp.ok) {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, copia));
            }
            return resp;
          })
      )
    );
  }
});

// Tocar na notificação abre (ou traz para frente) o app.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((j) => j.url.startsWith(self.registration.scope));
      return aberta ? aberta.focus() : self.clients.openWindow(self.registration.scope);
    })
  );
});
