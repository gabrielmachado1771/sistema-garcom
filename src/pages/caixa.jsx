import { useState } from "react";

function moeda(valor) {
  return "R$ " + valor.toFixed(2);
}

export default function Caixa({ mesas, finalizarConta, historico, voltarHome }) {
  const [mesaCaixaSelecionada, setMesaCaixaSelecionada] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [verHistorico, setVerHistorico] = useState(false);

  const mesasComConta = mesas.filter(
    (m) => m.status === "ocupada" && m.pedidos.length > 0
  );

  const mesaCaixaAtual = mesas.find((m) => m.id === mesaCaixaSelecionada);

  const formasPagamento = [
    { id: "dinheiro", label: "Dinheiro", emoji: "💵" },
    { id: "pix", label: "Pix", emoji: "📱" },
    { id: "credito", label: "Crédito", emoji: "💳" },
    { id: "debito", label: "Débito", emoji: "💳" },
  ];

  function handleFinalizar() {
    if (!formaPagamento) return;
    finalizarConta(mesaCaixaAtual.id, formaPagamento);
    setMesaCaixaSelecionada(null);
    setFormaPagamento(null);
  }

  // Histórico
  if (verHistorico) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-orange-500">Histórico</h1>
              <p className="text-sm text-zinc-400">{historico.length} venda(s)</p>
            </div>
            <button
              onClick={() => setVerHistorico(false)}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
            >
              ← Voltar
            </button>
          </div>

          {historico.length === 0 ? (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
              <p className="text-zinc-400">Nenhuma venda registrada.</p>
            </div>
          ) : (
            historico.map((h) => (
              <div
                key={h.id}
                className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold">Mesa {h.mesa}</p>
                    <p className="text-xs text-zinc-500">{h.data}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-orange-500 font-bold">{moeda(h.total)}</p>
                    <p className="text-xs text-zinc-400 capitalize">{h.formaPagamento}</p>
                  </div>
                </div>
                <div className="text-sm text-zinc-400">
                  {h.pedidos.map((p) => (
                    <span key={p.id} className="mr-2">
                      {p.qtd}x {p.nome}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}

          {historico.length > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
              <p className="text-sm text-zinc-400">Total do dia</p>
              <p className="text-2xl font-bold text-orange-500">
                {moeda(historico.reduce((acc, h) => acc + h.total, 0))}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Conta da mesa
  if (mesaCaixaAtual) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-orange-500">
                Caixa — Mesa {mesaCaixaAtual.numero}
              </h1>
              <p className="text-zinc-400 text-sm">Conferência da conta</p>
            </div>
            <button
              onClick={() => {
                setMesaCaixaSelecionada(null);
                setFormaPagamento(null);
              }}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
            >
              ← Voltar
            </button>
          </div>

          <div className="bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800">
            <h3 className="font-bold text-sm text-zinc-400 mb-3 uppercase tracking-wide">
              Itens consumidos
            </h3>

            <div className="space-y-1">
              {mesaCaixaAtual.pedidos.map((item) => (
                <div
                  key={item.id}
                  className="border-b border-zinc-800/50 py-2 flex justify-between"
                >
                  <span>
                    {item.qtd}x {item.nome}
                  </span>
                  <span className="text-orange-400 font-semibold">
                    {moeda(item.preco * item.qtd)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between text-xl font-bold border-t border-zinc-700 mt-3">
              <span>Total</span>
              <span className="text-orange-500">
                {moeda(mesaCaixaAtual.total)}
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800">
            <h3 className="font-bold text-sm text-zinc-400 mb-3 uppercase tracking-wide">
              Forma de pagamento
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {formasPagamento.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormaPagamento(f.id)}
                  className={`py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    formaPagamento === f.id
                      ? "bg-orange-500 text-black"
                      : "bg-zinc-800 hover:bg-zinc-700 text-white"
                  }`}
                >
                  <span>{f.emoji}</span>
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleFinalizar}
            disabled={!formaPagamento}
            className={`w-full font-bold py-4 rounded-2xl transition-all active:scale-[0.98] text-lg ${
              formaPagamento
                ? "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/20"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            }`}
          >
            Finalizar conta
          </button>
        </div>
      </div>
    );
  }

  // Lista de mesas com conta
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-orange-500">Caixa</h1>
            <p className="text-zinc-400 text-sm">Mesas com conta aberta</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setVerHistorico(true)}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
            >
              Histórico
            </button>
            <button
              onClick={voltarHome}
              className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all px-4 py-2 rounded-xl text-sm"
            >
              ← Início
            </button>
          </div>
        </div>

        {mesasComConta.length === 0 ? (
          <div className="bg-zinc-900/80 rounded-2xl p-8 text-center border border-zinc-800">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-zinc-400">Nenhuma mesa com conta aberta.</p>
          </div>
        ) : (
          mesasComConta.map((mesa) => (
            <div
              key={mesa.id}
              className="bg-zinc-900/80 rounded-2xl p-4 border border-zinc-800 flex justify-between items-center hover:border-zinc-700 transition"
            >
              <div>
                <p className="font-bold text-lg">Mesa {mesa.numero}</p>
                <p className="text-sm text-zinc-400">
                  {mesa.pedidos.length} item(ns)
                </p>
                <p className="text-orange-500 font-bold">
                  {moeda(mesa.total)}
                </p>
              </div>
              <button
                onClick={() => setMesaCaixaSelecionada(mesa.id)}
                className="bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-black font-bold px-5 py-3 rounded-xl"
              >
                Ver conta
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
