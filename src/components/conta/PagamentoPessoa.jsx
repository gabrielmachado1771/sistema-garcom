import { FORMAS_PAGAMENTO, centavos } from "../../store/regras";
import { moeda, parseValor } from "../../utils/format";
import { situacao } from "./calculos";

/** Notas que o cliente provavelmente vai entregar para pagar `valor`. */
function sugestoesNotas(valor) {
  const opcoes = [valor, Math.ceil(valor / 5) * 5, Math.ceil(valor / 10) * 10, Math.ceil(valor / 50) * 50, Math.ceil(valor / 100) * 100];
  return [...new Set(opcoes.map(centavos))].filter((v) => v >= valor).slice(0, 4);
}

/**
 * Cartão de pagamento de uma pessoa (ou da conta inteira).
 * Fechado: mostra só nome, valor e se já pagou. Aberto: botões das formas e, no dinheiro, o troco.
 */
export default function PagamentoPessoa({ titulo, valor, detalhe, pagamento, aberto, onAbrir, onFechar, onPagar, onDesfazer }) {
  const s = situacao(valor, pagamento);
  const forma = FORMAS_PAGAMENTO.find((f) => f.id === pagamento?.forma);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className={`w-full rounded-2xl border px-4 py-3 flex items-center gap-3 text-left transition active:scale-[0.99] ${
          s.pago ? "border-green-500/40 bg-green-500/10" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
        }`}
      >
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            s.pago ? "bg-green-500 text-black" : "bg-zinc-800 text-zinc-500"
          }`}
          aria-hidden
        >
          {s.pago ? "✓" : "…"}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">{titulo}</span>
          <span className={`block text-xs ${s.pago ? "text-green-300" : "text-zinc-500"}`}>
            {s.pago
              ? `Pagou no ${forma.label.toLowerCase()}${s.troco > 0 ? ` · troco ${moeda(s.troco)}` : ""}`
              : "Ainda não pagou — toque para receber"}
          </span>
        </span>
        <span className="font-bold tabular-nums">{moeda(valor)}</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-orange-500/60 bg-zinc-900 p-4 space-y-3 animate-entrada">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{titulo}</p>
          {detalhe && <p className="text-xs text-zinc-500">{detalhe}</p>}
        </div>
        <p className="text-2xl font-bold text-orange-400 tabular-nums">{moeda(valor)}</p>
      </div>

      <div>
        <p className="text-xs text-zinc-400 mb-2">Como vai pagar?</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {FORMAS_PAGAMENTO.map((f) => {
            const ativo = pagamento?.forma === f.id;
            return (
              <button
                type="button"
                key={f.id}
                aria-pressed={ativo}
                onClick={() => onPagar({ forma: f.id, recebido: null }, f.id === "dinheiro")}
                className={`py-3 rounded-xl font-semibold text-sm transition active:scale-95 flex items-center justify-center gap-2 ${
                  ativo ? "bg-orange-500 text-black" : "bg-zinc-800 hover:bg-zinc-700"
                }`}
              >
                <span aria-hidden className="text-lg">
                  {f.emoji}
                </span>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {pagamento?.forma === "dinheiro" && (
        <div className="rounded-xl bg-zinc-800/60 p-3 space-y-2">
          <label className="block">
            <span className="text-xs text-zinc-400">Quanto o cliente entregou?</span>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">R$</span>
              <input
                inputMode="decimal"
                autoFocus
                placeholder={valor.toFixed(2).replace(".", ",")}
                value={pagamento.texto ?? ""}
                onChange={(e) => {
                  const texto = e.target.value;
                  onPagar({ forma: "dinheiro", texto, recebido: texto.trim() ? centavos(parseValor(texto)) : null }, true);
                }}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-10 pr-3 py-2.5 text-lg tabular-nums focus:outline-none focus:border-orange-500"
              />
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            {sugestoesNotas(valor).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => onPagar({ forma: "dinheiro", texto: v.toFixed(2).replace(".", ","), recebido: v }, true)}
                className="px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-700 text-sm tabular-nums"
              >
                {v === valor ? "Valor exato" : moeda(v)}
              </button>
            ))}
          </div>
          <p className={`text-lg font-bold ${s.falta > 0 ? "text-red-400" : "text-green-400"}`} role="status">
            {s.falta > 0 ? `Faltam ${moeda(s.falta)}` : s.troco > 0 ? `Troco: ${moeda(s.troco)}` : "Sem troco"}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {pagamento && (
          <button type="button" onClick={onDesfazer} className="px-3 py-2 text-sm text-zinc-400 hover:text-white">
            Desfazer
          </button>
        )}
        {pagamento?.forma === "dinheiro" && (
          <button
            type="button"
            disabled={!s.pago}
            onClick={onFechar}
            className="ml-auto px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-40"
          >
            Confirmar dinheiro
          </button>
        )}
      </div>
    </div>
  );
}
