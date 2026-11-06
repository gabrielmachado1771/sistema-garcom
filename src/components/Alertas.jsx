import { useEffect, useRef } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { comandasNaCozinha } from "../store/regras";

/**
 * Observa mudanças (inclusive vindas de outras abas) e avisa com som:
 * - na Cozinha, quando chega pedido novo;
 * - no Garçom, quando um pedido fica pronto.
 */
export default function Alertas({ area }) {
  const { mesas, usuario } = useRestaurante();
  const aviso = useAviso();
  const vistos = useRef(null);

  const preparo = comandasNaCozinha(mesas, "preparo");
  const prontos = comandasNaCozinha(mesas, "pronto");
  const chave = [...preparo, ...prontos].map((c) => c.id + c.status).join("|");

  useEffect(() => {
    const atuais = new Set([...preparo, ...prontos].map((c) => c.id + c.status));
    const anteriores = vistos.current;
    vistos.current = atuais;
    if (!anteriores) return; // primeira renderização: não avisa o que já existia

    const novos = (lista) => lista.filter((c) => !anteriores.has(c.id + c.status));

    if (area === "cozinha") {
      for (const c of novos(preparo)) {
        aviso(`🔔 Novo pedido — Mesa ${c.mesaNumero}`, { tipo: "alerta", som: true, duracao: 5000 });
      }
    }
    if (area === "garcom") {
      for (const c of novos(prontos)) {
        const minha = c.atendente?.id === usuario?.id;
        aviso(`✅ Mesa ${c.mesaNumero} pronta para servir${minha ? " (sua mesa)" : ""}`, {
          tipo: "sucesso",
          som: true,
          duracao: 6000,
        });
      }
    }
    // `chave` resume preparo/prontos; evita disparar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, area]);

  return null;
}
