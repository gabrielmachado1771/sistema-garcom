// Avisos do sistema (notificação do celular/computador e vibração).
// Funcionam enquanto o site/app estiver aberto, mesmo em outra aba ou com a tela em segundo plano.

export function suportaNotificacao() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissaoNotificacao() {
  return suportaNotificacao() ? Notification.permission : "denied";
}

export async function pedirPermissaoNotificacao() {
  if (!suportaNotificacao()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function vibrar(padrao = [200, 100, 200]) {
  try {
    navigator.vibrate?.(padrao);
  } catch {
    // aparelho sem vibração
  }
}

/** Mostra uma notificação do sistema. No Android só funciona pelo service worker. */
export async function notificar(titulo, corpo, tag) {
  if (permissaoNotificacao() !== "granted") return;
  const opcoes = { body: corpo, tag, renotify: true, icon: "icone-192.png", badge: "icone-192.png" };
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    if (registro) {
      await registro.showNotification(titulo, opcoes);
      return;
    }
    new Notification(titulo, opcoes);
  } catch {
    // navegador bloqueou
  }
}
