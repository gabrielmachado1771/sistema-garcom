import { FORMAS_PAGAMENTO, centavos, descreverPagamento, resumoPagamento } from "../../store/regras";
import { pagamentosDosValores } from "./calculos";
import { moeda, parseValor } from "../../utils/format";

/** Uma pessoa pagando em várias formas (ex.: R$ 20 no dinheiro + R$ 10 no cartão). */
export default function PagamentoMisto({ total, valores, onMudar }) {
  const pagamentos = pagamentosDosValores(valores);
  const resumo = resumoPagamento(pagamentos, total);
  const valorDe = (forma) => centavos(parseValor(valores[forma] ?? ""));
  const restantePara = (forma) => centavos(Math.max(0, total - (resumo.pago - valorDe(forma))));
  const formatar = (v) => v.toFixed(2).replace(".", ",");

  return (
    <div className="rounded-2xl border-2 border-orange-500/60 bg-zinc-900 p-4 space-y-3">
      <p className="text-sm text-zinc-300">
        Digite quanto entrou em cada forma, ou toque em <strong>Restante</strong> para completar o que falta.
      </p>
      <div className="space-y-2">
        {FORMAS_PAGAMENTO.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            <label htmlFor={`pg-${f.id}`} className="w-24 sm:w-28 shrink-0 flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden>{f.emoji}</span>
              {f.label}
            </label>
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">R$</span>
              <input
                id={`pg-${f.id}`}
                inputMode="decimal"
                placeholder="0,00"
                autoComplete="off"
                value={valores[f.id] ?? ""}
                onChange={(e) => onMudar(f.id, e.target.value)}
                className={`w-full bg-zinc-800 border rounded-xl pl-9 pr-3 py-2 text-base tabular-nums focus:outline-none focus:border-orange-500 transition ${
                  valorDe(f.id) > 0 ? "border-orange-500/60" : "border-zinc-700"
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => onMudar(f.id, formatar(restantePara(f.id)))}
              disabled={restantePara(f.id) === 0 || restantePara(f.id) === valorDe(f.id)}
              className="shrink-0 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold transition disabled:opacity-30"
            >
              Restante
            </button>
          </div>
        ))}
      </div>
      <p
        role="status"
        className={`text-sm font-semibold ${resumo.excedente > 0 ? "text-red-400" : resumo.valido ? "text-green-400" : "text-zinc-400"}`}
      >
        {resumo.excedente > 0
          ? `Pix e cartão passaram do total em ${moeda(resumo.excedente)}. Troco só sai do dinheiro.`
          : resumo.valido
            ? resumo.troco > 0
              ? `✓ Pago. Devolva ${moeda(resumo.troco)} de troco.`
              : `✓ Pago em ${descreverPagamento({ pagamentos })}.`
            : pagamentos.length
              ? `Ainda faltam ${moeda(resumo.falta)}.`
              : "Ex.: R$ 20 no dinheiro + o restante no cartão."}
      </p>
    </div>
  );
}
