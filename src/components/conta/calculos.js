// Cálculos da tela de pagamento (sem React).
import { FORMAS_PAGAMENTO, centavos } from "../../store/regras";
import { parseValor } from "../../utils/format";

/** Situação do pagamento de uma pessoa. `pagamento` = { forma, recebido } ou null. */
export function situacao(valor, pagamento) {
  if (!pagamento) return { pago: false, coberto: 0, troco: 0, falta: valor };
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
