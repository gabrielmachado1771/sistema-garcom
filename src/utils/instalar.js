// Guarda o convite de instalação do navegador (Chrome/Edge/Android), que chega uma vez só, logo no início.
let convite = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    convite = e;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    convite = null;
    avisar();
  });
}

export function ouvirInstalacao(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export const podeInstalarDireto = () => !!convite;

export function jaInstalado() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function ehIphone() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function instalar() {
  if (!convite) return false;
  convite.prompt();
  const { outcome } = await convite.userChoice;
  convite = null;
  avisar();
  return outcome === "accepted";
}

export function registrarServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
