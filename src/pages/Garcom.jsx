import { useState } from "react";
import { useRestaurante } from "../store/contexto";
import { comandasNaCozinha, mesaOcupada, statusMesa, totalMesa } from "../store/regras";
import { moeda, plural } from "../utils/format";
import { Botao, Cabecalho, Cartao, Etiqueta, Pagina } from "../components/ui";

const estilos = {
  livre: { card: "bg-zinc-900/80 border-zinc-800 hover:border-zinc-600", etiqueta: null },
  ocupada: {
    card: "bg-orange-500/10 border-orange-500/30 hover:border-orange-500/60",
    etiqueta: <Etiqueta cor="laranja">Ocupada</Etiqueta>,
  },
  preparo: {
    card: "bg-orange-500/10 border-yellow-500/40 hover:border-yellow-500/70",
    etiqueta: <Etiqueta cor="amarelo">⏳ Preparo</Etiqueta>,
  },
  pronto: {
    card: "bg-green-500/10 border-green-500/50 hover:border-green-500/80 ring-2 ring-green-500/30",
    etiqueta: <Etiqueta cor="verde" className="animate-pulse">✓ Pronto</Etiqueta>,
  },
};

export default function Garcom({ navegar }) {
  const { mesas, marcarEntregue, usuario } = useRestaurante();
  const [filtro, setFiltro] = useState("todas");
  const ocupadas = mesas.filter(mesaOcupada).length;
  const prontos = comandasNaCozinha(mesas, "pronto");
  const ehMinha = (m) => m.atendente?.id === usuario.id;
  const minhas = mesas.filter(ehMinha).length;
  const filtros = [
    { id: "todas", label: `Todas (${mesas.length})`, ok: () => true },
    { id: "livres", label: `Livres (${mesas.length - ocupadas})`, ok: (m) => !mesaOcupada(m) },
    { id: "minhas", label: `Minhas (${minhas})`, ok: ehMinha },
  ];
  const visiveis = mesas.filter(filtros.find((f) => f.id === filtro).ok);

  return (
    <Pagina largura="max-w-3xl">
      <Cabecalho
        titulo="Mesas"
        subtitulo={`${ocupadas} ocupada${ocupadas !== 1 ? "s" : ""} de ${mesas.length}`}
      />

      {prontos.length > 0 && (
        <Cartao className="border-green-500/40 bg-green-500/5 space-y-2">
          <h2 className="font-bold text-green-400 text-sm">🔔 Prontos para servir</h2>
          {prontos.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3">
              <p className="text-sm min-w-0 truncate">
                <span className="font-bold">Mesa {c.mesaNumero}</span>
                <span className="text-zinc-400">
                  {" "}· {c.itens.map((i) => `${i.qtd}x ${i.nome}`).join(", ")}
                </span>
              </p>
              <Botao
                variante="sucesso"
                className="px-3 py-1.5 text-xs shrink-0"
                onClick={() => marcarEntregue(c.mesaId, c.id)}
                title={c.atendente ? `Pedido de ${c.atendente.nome}` : undefined}
              >
                Servido
              </Botao>
            </div>
          ))}
        </Cartao>
      )}

      <div className="flex gap-2">
        {filtros.map((f) => (
          <button
            type="button"
            key={f.id}
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
              filtro === f.id ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visiveis.length === 0 && (
        <p className="text-sm text-zinc-500">
          {filtro === "minhas" ? "Você ainda não abriu nenhuma mesa." : "Nenhuma mesa livre no momento."}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {visiveis.map((m) => {
          const status = statusMesa(m);
          const { card, etiqueta } = estilos[status];
          const itensRascunho = m.rascunho.reduce((a, i) => a + i.qtd, 0);
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => navegar("garcom", m.id)}
              className={`p-4 rounded-2xl text-left transition-all active:scale-[0.97] shadow border min-h-28 flex flex-col focus-visible:outline-2 focus-visible:outline-orange-500 ${card}`}
            >
              <span className="font-bold text-lg flex items-center justify-between gap-1">
                Mesa {m.numero}
                {m.atendente && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate max-w-20 ${
                      ehMinha(m) ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-400"
                    }`}
                    title={`Atendida por ${m.atendente.nome}`}
                  >
                    {ehMinha(m) ? "Sua" : m.atendente.nome.split(" ")[0]}
                  </span>
                )}
              </span>
              <span className="text-xs text-zinc-400">
                {status === "livre" ? "Livre" : etiqueta}
              </span>
              {status !== "livre" && (
                <span className="mt-auto pt-2 text-sm">
                  <span className="text-orange-500 font-bold">{moeda(totalMesa(m))}</span>
                  {itensRascunho > 0 && (
                    <span className="block text-[11px] text-zinc-400">
                      {plural(itensRascunho, "item", "itens")} não enviado{itensRascunho > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Pagina>
  );
}
