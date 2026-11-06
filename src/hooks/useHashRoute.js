import { useCallback, useEffect, useState } from "react";

function lerHash() {
  const partes = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return partes;
}

/**
 * Rota simples baseada no hash da URL (ex.: #/garcom/3).
 * Mantém a tela ao recarregar e faz o botão "voltar" do navegador funcionar.
 */
export default function useHashRoute() {
  const [rota, setRota] = useState(lerHash);

  useEffect(() => {
    const aoMudar = () => setRota(lerHash());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const navegar = useCallback((...partes) => {
    window.location.hash = "/" + partes.filter((p) => p != null).join("/");
  }, []);

  return [rota, navegar];
}
