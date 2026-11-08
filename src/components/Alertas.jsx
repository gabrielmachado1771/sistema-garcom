import { useEffect, useRef } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { comandasNaCozinha } from "../store/regras";
import { notificar, vibrar } from "../utils/notificacoes";

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
        aviso(`🔔 Novo pedido — ${c.rotulo}`, { tipo: "alerta", som: true, duracao: 5000 });
        if (document.visibilityState !== "visible") {
          notificar(`🔔 Novo pedido — ${c.rotulo}`, c.itens.map((i) => `${i.qtd}x ${i.nome}`).join(", "), `novo-${c.id}`);
        }
      }
    }
    if (area === "garcom") {
      for (const c of novos(prontos)) {
        // Garçom recebe aviso forte só dos próprios pedidos; o admin recebe de todos.
        const minha = c.atendente?.id === usuario?.id;
        const forte = minha || usuario?.funcao !== "garcom";
        const itens = c.itens.map((i) => `${i.qtd}x ${i.nome}`).join(", ");
        aviso(`✅ ${c.rotulo} pronto para servir${minha ? " (sua mesa)" : ""}`, {
          tipo: forte ? "sucesso" : "info",
          som: forte,
          duracao: forte ? 8000 : 4000,
        });
        if (forte) {
          vibrar();
          if (document.visibilityState !== "visible") {
            notificar(`🍽️ ${c.rotulo} pronto!`, itens, `pronto-${c.id}`);
          }
        }
      }
    }
    // `chave` resume preparo/prontos; evita disparar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, area]);

  return null;
}
