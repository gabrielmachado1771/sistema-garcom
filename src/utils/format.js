const formatadorMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function moeda(valor) {
  return formatadorMoeda.format(valor || 0);
}

export function hora(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dataHora(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function minutosDesde(timestamp, agora = Date.now()) {
  return Math.max(0, Math.floor((agora - timestamp) / 60000));
}

export function tempoDecorrido(timestamp, agora = Date.now()) {
  const min = minutosDesde(timestamp, agora);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${String(min % 60).padStart(2, "0")}`;
}

export function plural(n, singular, pluralForm = singular + "s") {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Converte "12,50" ou "12.50" em número. */
export function parseValor(texto) {
  let s = String(texto).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
