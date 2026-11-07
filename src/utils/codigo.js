// Código (slug) do restaurante usado no link: /r/<codigo>

/** Normaliza o código digitado: "Sobradinho " -> "sobradinho". */
export function normalizarCodigo(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Link do restaurante para mandar à equipe. Na Vercel fica /r/codigo; no GitHub Pages, #/r/codigo. */
export function linkDoRestaurante(slug) {
  const base = import.meta.env.BASE_URL;
  return base === "/" ? `${window.location.origin}/r/${slug}` : `${window.location.origin}${base}#/r/${slug}`;
}
