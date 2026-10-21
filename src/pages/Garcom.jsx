import { useState } from "react";
import { produtos, categoriaLabels } from "../data/cardapio";

function moeda(valor) {
  return "R$ " + valor.toFixed(2);
}

export default function Garcom({
  mesas,
  mesaSelecionada,
  setMesaSelecionada,
  abrirMesa,
  adicionarItem,
  removerItem,
  enviarParaCozinha,
  setObservacao,
  voltarHome,
}) {
  const [categoriaAberta, setCategoriaAberta] = useState(null);
  const [obsTemp, setObsTemp] = useState("");
  const mesaAtual = mesas.find((m) => m.id === mesaSelecionada);

  if (mesaAtual) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white p-4 pb-24">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-orange-500">
                Mesa {mesaAtual.numero}
              </h1>
              <p className="text-zinc-400 text-sm flex items-center gap-2">
                {mesaAtual.status === "ocupada" && (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )}
                {mesaAtual.status}
                {mesaAtual.horaPedido && (
                  <span className="text-zinc-500">· Pedido {mesaAtual.horaPedido}</span>
                )}
              </p>
            </div>
            <button
              onClick={() => setMesaSelecionada(null)}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
            >
              ← Voltar
            </button>
          </div>

          {/* Status da cozinha */}
          {mesaAtual.enviadoCozinha && (
            <div
              className={`p-3 rounded-xl text-center text-sm font-semibold ${
                mesaAtual.concluidoCozinha
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
              }`}
            >
              {mesaAtual.concluidoCozinha
                ? "✅ Pedido pronto! Pode servir."
                : "⏳ Pedido em preparo na cozinha..."}
            </div>
          )}

          {/* Total */}
          <div className="bg-zinc-900/80 backdrop-blur p-4 rounded-2xl shadow border border-zinc-800">
            <p className="text-sm text-zinc-400">Total atual</p>
            <p className="text-3xl font-bold text-orange-500">
              {moeda(mesaAtual.total)}
            </p>
          </div>

          {/* Pedidos da mesa */}
          <div className="bg-zinc-900/80 backdrop-blur p-4 rounded-2xl shadow border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-lg">Pedidos</h3>
              {mesaAtual.pedidos.length > 0 && !mesaAtual.enviadoCozinha && (
                <button
                  onClick={enviarParaCozinha}
                  className="bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-black font-semibold px-4 py-2 rounded-xl text-sm"
                >
                  Enviar à cozinha
                </button>
              )}
            </div>

            {mesaAtual.pedidos.length === 0 ? (
              <p className="text-zinc-500 text-sm">Nenhum item adicionado.</p>
            ) : (
              <div className="space-y-1">
                {mesaAtual.pedidos.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center border-b border-zinc-800/50 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {item.qtd}x {item.nome}
                      </p>
                      <p className="text-sm text-orange-400">
                        {moeda(item.preco * item.qtd)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 ml-3">
                      <button
                        onClick={() => removerItem(item.nome)}
                        className="bg-red-600/80 hover:bg-red-600 active:scale-90 transition-all w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center"
                      >
                        −
                      </button>
                      <button
                        onClick={() => adicionarItem(item)}
                        className="bg-green-600/80 hover:bg-green-600 active:scale-90 transition-all w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observação */}
          <div className="bg-zinc-900/80 backdrop-blur p-4 rounded-2xl shadow border border-zinc-800">
            <h3 className="font-semibold text-sm text-zinc-400 mb-2">
              Observação do pedido
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: Sem cebola, bem passado..."
                value={mesaAtual.observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition placeholder:text-zinc-600"
              />
            </div>
          </div>

          {/* Cardápio */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg text-zinc-300">Cardápio</h3>
            {Object.entries(produtos).map(([cat, items]) => (
              <div
                key={cat}
                className="bg-zinc-900/80 backdrop-blur rounded-2xl shadow border border-zinc-800 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setCategoriaAberta(categoriaAberta === cat ? null : cat)
                  }
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition"
                >
                  <span className="text-orange-500 font-bold">
                    {categoriaLabels[cat]}
                  </span>
                  <span
                    className={`text-zinc-500 transition-transform ${
                      categoriaAberta === cat ? "rotate-180" : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {categoriaAberta === cat && (
                  <div className="px-4 pb-4 space-y-2">
                    {items.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => adicionarItem(p)}
                        className="w-full bg-orange-500/90 hover:bg-orange-500 active:scale-[0.98] transition-all text-black font-semibold py-3 rounded-xl flex justify-between px-4 text-sm"
                      >
                        <span>{p.nome}</span>
                        <span>{moeda(p.preco)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Lista de mesas
  const mesasOcupadas = mesas.filter((m) => m.status === "ocupada").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-orange-500">Mesas</h1>
            <p className="text-sm text-zinc-400">
              {mesasOcupadas} ocupada{mesasOcupadas !== 1 ? "s" : ""} de{" "}
              {mesas.length}
            </p>
          </div>
          <button
            onClick={voltarHome}
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
          >
            ← Início
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {mesas.map((m) => {
            const pronta = m.concluidoCozinha && m.pedidos.length > 0;
            return (
              <button
                key={m.id}
                onClick={() => abrirMesa(m.id)}
                className={`relative p-4 rounded-2xl text-left transition-all active:scale-[0.97] shadow border ${
                  m.status === "ocupada"
                    ? "bg-orange-500/10 border-orange-500/30 hover:border-orange-500/60"
                    : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {pronta && (
                  <span className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
                {m.enviadoCozinha && !m.concluidoCozinha && m.pedidos.length > 0 && (
                  <span className="absolute top-2 right-2 w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                )}
                <p className="font-bold text-lg">Mesa {m.numero}</p>
                <p className="text-xs text-zinc-400 capitalize">{m.status}</p>
                {m.status === "ocupada" && (
                  <p className="text-orange-500 font-bold text-sm mt-1">
                    {moeda(m.total)}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
