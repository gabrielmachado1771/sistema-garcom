import { createContext, useContext } from "react";

export const RestauranteContext = createContext(null);
export const AvisoContext = createContext(null);

export function useRestaurante() {
  const ctx = useContext(RestauranteContext);
  if (!ctx) throw new Error("useRestaurante precisa estar dentro de <RestauranteProvider>");
  return ctx;
}

/** Mostra uma notificação rápida: aviso("Texto", { tipo: "sucesso" | "erro" | "info", som: true }) */
export function useAviso() {
  return useContext(AvisoContext);
}
