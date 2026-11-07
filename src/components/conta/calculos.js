// Cálculos da tela de pagamento (sem React).
import { FORMAS_PAGAMENTO, centavos, resumoPagamento } from "../../store/regras";
import { parseValor } from "../../utils/format";

/**
 * Situação do pagamento de uma pessoa.
 * `pagamento` = null | { forma, recebido } | { forma: "misto", valores: { pix: "10", dinheiro: "10", ... } }
 */
export function situacao(valor, pagamento) {
  if (!pagamento) return { pago: false, coberto: 0, troco: 0, falta: valor };
  if (pagamento.forma === "misto") {
    const r = resumoPagamento(pagamentosDosValores(pagamento.valores ?? {}), valor);
    return {
      pago: r.valido,
      coberto: centavos(Math.min(Math.max(0, r.pago - r.troco), valor)),
      troco: r.valido ? r.troco : 0,
      falta: r.falta,
    };
  }
  if (pagamento.forma !== "dinheiro") return { pago: true, coberto: valor, troco: 0, falta: 0 };
  const recebido = pagamento.recebido ?? valor;
  return {
    pago: recebido >= valor - 0.004,
    coberto: Math.min(recebido, valor),
    troco: centavos(Math.max(0, recebido - valor)),
    falta: centavos(Math.max(0, valor - recebido)),
    recebido,
  };
}

export function pagamentosDosValores(valores) {
  return FORMAS_PAGAMENTO.map((f) => ({ forma: f.id, valor: centavos(parseValor(valores[f.id] ?? "")) })).filter(
    (p) => p.valor > 0
  );
}

/** O que entra no caixa pelo pagamento de uma pessoa, forma por forma. */
export function partesDoPagamento(valor, pagamento) {
  if (!pagamento) return [];
  if (pagamento.forma === "misto") return pagamentosDosValores(pagamento.valores ?? {});
  if (pagamento.forma === "dinheiro") return [{ forma: "dinheiro", valor: pagamento.recebido ?? valor }];
  return [{ forma: pagamento.forma, valor }];
}
