import { useState } from "react";

function moeda(valor) {
  return "R$ " + valor.toFixed(2);
}

export default function Cozinha({ mesas, concluirPedidoCozinha, voltarHome }) {
  const pedidosPendentes = mesas.filter(
    (m) => m.enviadoCozinha && !m.concluidoCozinha && m.pedidos.length > 0
  );

  const pedidosConcluidos = mesas.filter(
    (m) => m.enviadoCozinha && m.concluidoCozinha && m.pedidos.length > 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-orange-500">Cozinha</h1>
            <p className="text-sm text-zinc-400">
              {pedidosPendentes.length} pedido{pedidosPendentes.length !== 1 ? "s" : ""} aguardando
            </p>
          </div>
          <button
            onClick={voltarHome}
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
          >
            ← Início
          </button>
        </div>

        {pedidosPendentes.length === 0 && pedidosConcluidos.length === 0 && (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-4xl mb-3">👨‍🍳</p>
            <p className="text-zinc-400">Nenhum pedido no momento.</p>
          </div>
        )}

        {/* Pedidos pendentes */}
        {pedidosPendentes.map((mesa) => (
          <div
            key={mesa.id}
            className="bg-zinc-900/80 border border-yellow-500/20 rounded-2xl p-4 shadow-lg space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-orange-500">
                  Mesa {mesa.numero}
                </h2>
                <p className="text-sm text-zinc-400">
                  {mesa.pedidos.length} item(ns)
                  {mesa.horaPedido && (
                    <span className="text-zinc-500"> · {mesa.horaPedido}</span>
                  )}
                </p>
              </div>
              <span className="bg-yellow-500/15 text-yellow-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide animate-pulse">
                Preparando
              </span>
            </div>

            <div className="space-y-1">
              {mesa.pedidos.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-zinc-800/50 py-2 flex items-center justify-between"
                >
                  <p className="font-medium">
                    {item.qtd}x {item.nome}
                  </p>
                  <p className="text-orange-400 font-semibold text-sm">
                    {moeda(item.preco * item.qtd)}
                  </p>
                </div>
              ))}
            </div>

            {mesa.observacao && (
              <div className="bg-zinc-800 rounded-xl p-3 text-sm">
                <span className="text-zinc-400 font-semibold">Obs: </span>
                <span className="text-yellow-300">{mesa.observacao}</span>
              </div>
            )}

            <button
              onClick={() => concluirPedidoCozinha(mesa.id)}
              className="w-full bg-green-600 hover:bg-green-500 active:scale-[0.98] transition-all text-white font-bold py-3 rounded-xl"
            >
              ✓ Pedido pronto
            </button>
          </div>
        ))}

        {/* Concluídos */}
        {pedidosConcluidos.length > 0 && (
          <>
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide pt-2">
              Concluídos
            </h3>
            {pedidosConcluidos.map((mesa) => (
              <div
                key={mesa.id}
                className="bg-zinc-900/50 border border-green-500/10 rounded-2xl p-4 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-green-400">
                      Mesa {mesa.numero}
                    </h2>
                    <p className="text-sm text-zinc-500">
                      {mesa.pedidos.length} item(ns)
                    </p>
                  </div>
                  <span className="text-green-500 text-xl">✓</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
