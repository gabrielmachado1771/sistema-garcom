import { useEffect, useState } from "react";

/** Retorna Date.now() atualizado a cada `intervalo` ms (para tempos "há X min"). */
export default function useAgora(intervalo = 30000) {
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervalo);
    return () => clearInterval(id);
  }, [intervalo]);
  return agora;
}
