import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { mesaOcupada, pedidosBalcao, rotuloMesa, statusMesa, totalMesa } from "../store/regras";
import { classeInput } from "../utils/estilos";
import { moeda, tempoDecorrido } from "../utils/format";
import { Botao, Campo, Cartao, Etiqueta, Modal, TituloSecao } from "./ui";

const TIPOS = [
  { id: "balcao", label: "Balcão", emoji: "🧍", descricao: "Consome no balcão" },
  { id: "retirada", label: "Retirada", emoji: "🛍️", descricao: "Leva para viagem" },
];

const etiquetas = {
  livre: <Etiqueta>Lançando</Etiqueta>,
  ocupada: <Etiqueta cor="laranja">Aberto</Etiqueta>,
  preparo: <Etiqueta cor="amarelo">⏳ Preparo</Etiqueta>,
  pronto: <Etiqueta cor="verde">✓ Pronto</Etiqueta>,
};

/** Pedidos sem mesa (balcão e retirada): lista + botão para abrir um novo. */
export default function PedidosBalcao({ onAbrir }) {
  const { mesas, abrirBalcao } = useRestaurante();
  const aviso = useAviso();
  const [novo, setNovo] = useState(false);
  const [tipo, setTipo] = useState("balcao");
  const [cliente, setCliente] = useState("");
  const [criando, setCriando] = useState(false);
  const pedidos = pedidosBalcao(mesas);

  async function criar(e) {
    e.preventDefault();
    setCriando(true);
    const numero = await abrirBalcao(tipo, cliente.trim());
    setCriando(false);
    if (!numero) return;
    setNovo(false);
    setCliente("");
    aviso(`Pedido de ${tipo === "balcao" ? "balcão" : "retirada"} aberto.`);
    onAbrir(numero);
  }

  return (
    <Cartao>
      <TituloSecao
        acao={
          <Botao variante="primario" className="px-3 py-2 text-sm" onClick={() => setNovo(true)}>
            + Novo pedido
          </Botao>
        }
      >
        Balcão e retirada
      </TituloSecao>
      {pedidos.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum pedido sem mesa agora.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {pedidos.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onAbrir(m.id)}
                className="w-full min-h-14 text-left rounded-xl border border-zinc-800 bg-zinc-800/40 hover:border-zinc-600 px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{rotuloMesa(m)}</span>
                  <span className="block text-xs text-zinc-500">
                    {m.abertaEm ? tempoDecorrido(m.abertaEm) : ""} {mesaOcupada(m) && `· ${moeda(totalMesa(m))}`}
                  </span>
                </span>
                {etiquetas[statusMesa(m)]}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal aberto={novo} titulo="Novo pedido sem mesa" onFechar={() => setNovo(false)}>
        <form onSubmit={criar} className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {TIPOS.map((t) => (
              <button
                type="button"
                key={t.id}
                role="radio"
                aria-checked={tipo === t.id}
                onClick={() => setTipo(t.id)}
                className={`rounded-xl border-2 p-3 text-left ${tipo === t.id ? "border-orange-500 bg-orange-500/10" : "border-zinc-800"}`}
              >
                <span className="text-2xl" aria-hidden>
                  {t.emoji}
                </span>
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-xs text-zinc-500">{t.descricao}</span>
              </button>
            ))}
          </div>
          <Campo rotulo="Nome do cliente (opcional)" dica="Ajuda a chamar na hora de entregar. Uma senha é gerada automaticamente.">
            <input autoFocus maxLength={40} value={cliente} onChange={(e) => setCliente(e.target.value)} className={classeInput} />
          </Campo>
          <Botao type="submit" variante="primario" className="w-full py-3" disabled={criando}>
            {criando ? "Abrindo…" : "Abrir pedido"}
          </Botao>
        </form>
      </Modal>
    </Cartao>
  );
}
