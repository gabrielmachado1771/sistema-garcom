import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { Botao, Cartao } from "./ui";

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Marcar produtos como esgotados (somem do lançamento até voltarem). */
export default function PainelEsgotados() {
  const { cardapio, marcarEsgotado } = useRestaurante();
  const aviso = useAviso();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const produtos = cardapio.flatMap((c) => c.produtos.map((p) => ({ ...p, categoria: c.nome })));
  const esgotados = produtos.filter((p) => p.disponivel === false);
  const termo = normalizar(busca.trim());
  const visiveis = produtos.filter((p) => !termo || normalizar(p.nome).includes(termo));

  function alternar(p) {
    const esgotar = p.disponivel !== false;
    marcarEsgotado(p.id, esgotar);
    aviso(esgotar ? `${p.nome} marcado como esgotado.` : `${p.nome} disponível de novo.`, { tipo: esgotar ? "info" : "sucesso" });
  }

  return (
    <Cartao className={esgotados.length ? "border-red-500/30" : ""}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">🚫 Esgotados</p>
          <p className="text-xs text-zinc-400 truncate">
            {esgotados.length ? esgotados.map((p) => p.nome).join(", ") : "Nenhum produto esgotado."}
          </p>
        </div>
        <Botao className="px-3 py-2 text-sm shrink-0" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
          {aberto ? "Fechar" : "Gerenciar"}
        </Botao>
      </div>
      {aberto && (
        <div className="mt-3 space-y-2">
          <input
            type="search"
            placeholder="🔍 Buscar produto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
          />
          <ul className="max-h-80 overflow-y-auto divide-y divide-zinc-800">
            {visiveis.map((p) => {
              const esgotado = p.disponivel === false;
              return (
                <li key={p.id} className="py-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm min-w-0">
                    <span className={esgotado ? "line-through text-zinc-500" : ""}>{p.nome}</span>
                    <span className="text-xs text-zinc-500"> · {p.categoria}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={esgotado}
                    aria-label={`${p.nome} esgotado`}
                    onClick={() => alternar(p)}
                    className={`shrink-0 min-h-11 px-3 rounded-xl text-xs font-semibold ${
                      esgotado ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {esgotado ? "Esgotado" : "Disponível"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Cartao>
  );
}
