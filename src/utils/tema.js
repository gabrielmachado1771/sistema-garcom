// Tema claro/escuro. A escolha fica no aparelho; sem escolha, segue o sistema.
import { useEffect, useState } from "react";

const CHAVE = "garcom:tema";
const COR_BARRA = { escuro: "#0c0a09", claro: "#f7f4f0" };

function lerSalvo() {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

function temaDoSistema() {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
}

export function aplicarTema(tema = lerSalvo() || temaDoSistema()) {
  document.documentElement.dataset.theme = tema === "claro" ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[tema] ?? COR_BARRA.escuro);
  return tema;
}

export function useTema() {
  const [tema, setTema] = useState(() => lerSalvo() || temaDoSistema());
  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);
  const alternar = () => {
    const novo = tema === "claro" ? "escuro" : "claro";
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      /* navegador sem armazenamento: vale só nesta aba */
    }
    setTema(novo);
  };
  return [tema, alternar];
}
