import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { FORMAS_PAGAMENTO, TAXA_SERVICO, itensConsumidos, totalMesa } from "../store/regras";
import { moeda, parseValor } from "../utils/format";
import {
  Botao,
  BotaoVoltar,
  Cabecalho,
  Cartao,
  ListaItens,
  Pagina,
  TituloSecao,
  Vazio,
} from "../components/ui";

function Linha({ rotulo, valor, forte }) {
  return (
    <div className={`flex justify-between ${forte ? "text-xl font-bold pt-3 border-t border-zinc-700" : "text-sm text-zinc-400"}`}>
      <span>{rotulo}</span>
      <span className={forte ? "text-orange-500" : ""}>{valor}</span>
    </div>
  );
}

export default function Conta({ mesaId, navegar }) {
  const { mesas, finalizarConta } = useRestaurante();
  const aviso = useAviso();
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [comTaxa, setComTaxa] = useState(true);
  const [pessoas, setPessoas] = useState(1);
  const [recebidoTexto, setRecebidoTexto] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const mesa = mesas.find((m) => m.id === mesaId);
  const voltar = () => navegar("caixa");

  if (!mesa || mesa.comandas.length === 0) {
    return (
      <Pagina>
        <Cabecalho titulo="Caixa">
          <BotaoVoltar onClick={voltar} />
        </Cabecalho>
        <Vazio icone="🧾">Esta mesa não tem conta aberta.</Vazio>
      </Pagina>
    );
  }

  const itens = itensConsumidos(mesa);
  const subtotal = totalMesa(mesa);
  const taxa = comTaxa ? subtotal * TAXA_SERVICO : 0;
  const total = subtotal + taxa;
  const porPessoa = total / pessoas;
  const recebido = parseValor(recebidoTexto);
  const troco = recebido - total;
  const dinheiroInsuficiente = formaPagamento === "dinheiro" && recebido < total - 0.005;
  const podeFinalizar = formaPagamento && !dinheiroInsuficiente;

  const naoEnviados = mesa.rascunho.length > 0;
  const emAndamento = mesa.comandas.some((c) => c.status !== "entregue");

  function escolherForma(id) {
    setFormaPagamento(id);
    setConfirmando(false);
  }

  function finalizar() {
    if (!podeFinalizar) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    finalizarConta(mesa.id, {
      formaPagamento,
      comTaxa,
      pessoas,
      recebido: formaPagamento === "dinheiro" ? recebido : null,
    });
    aviso(
      formaPagamento === "dinheiro" && troco > 0.005
        ? `Mesa ${mesa.numero} fechada. Troco: ${moeda(troco)}`
        : `Mesa ${mesa.numero} fechada — ${moeda(total)} recebido.`
    );
    voltar();
  }

  const sugestoesDinheiro = [...new Set([Math.ceil(total), Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100])];

  return (
    <Pagina className="pb-10">
      <Cabecalho titulo={`Conta — Mesa ${mesa.numero}`} subtitulo="Conferência e pagamento">
        <BotaoVoltar onClick={voltar} />
      </Cabecalho>

      {(naoEnviados || emAndamento) && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl p-3 text-sm space-y-1">
          {emAndamento && <p>⚠️ Há pedidos desta mesa que ainda não foram servidos.</p>}
          {naoEnviados && <p>⚠️ Há itens lançados pelo garçom que não foram enviados e não entram na conta.</p>}
        </div>
      )}

      <Cartao>
        <TituloSecao>Itens consumidos</TituloSecao>
        <ListaItens
          itens={itens}
          render={(item) => (
            <>
              <span>
                {item.qtd}x {item.nome}
                <span className="text-xs text-zinc-500"> ({moeda(item.preco)})</span>
              </span>
              <span className="text-orange-400 font-semibold whitespace-nowrap">{moeda(item.preco * item.qtd)}</span>
            </>
          )}
        />
        <div className="mt-3 space-y-1">
          <Linha rotulo="Subtotal" valor={moeda(subtotal)} />
          <label className="flex justify-between items-center text-sm text-zinc-400 cursor-pointer select-none">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={comTaxa}
                onChange={(e) => {
                  setComTaxa(e.target.checked);
                  setConfirmando(false);
                }}
                className="accent-orange-500 w-4 h-4"
              />
              Taxa de serviço ({TAXA_SERVICO * 100}%)
            </span>
            <span>{moeda(taxa)}</span>
          </label>
          <Linha forte rotulo="Total" valor={moeda(total)} />
        </div>
      </Cartao>

      <Cartao className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-400">Dividir entre</p>
          {pessoas > 1 && <p className="text-orange-400 font-bold">{moeda(porPessoa)} por pessoa</p>}
        </div>
        <div className="flex items-center gap-2">
          <Botao className="w-9 h-9" aria-label="Menos uma pessoa" disabled={pessoas <= 1} onClick={() => setPessoas((p) => p - 1)}>
            −
          </Botao>
          <span className="w-16 text-center font-semibold tabular-nums">
            {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}
          </span>
          <Botao className="w-9 h-9" aria-label="Mais uma pessoa" onClick={() => setPessoas((p) => p + 1)}>
            +
          </Botao>
        </div>
      </Cartao>

      <Cartao>
        <TituloSecao>Forma de pagamento</TituloSecao>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {FORMAS_PAGAMENTO.map((f) => (
            <button
              type="button"
              key={f.id}
              role="radio"
              aria-checked={formaPagamento === f.id}
              onClick={() => escolherForma(f.id)}
              className={`py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                formaPagamento === f.id ? "bg-orange-500 text-black" : "bg-zinc-800 hover:bg-zinc-700 text-white"
              }`}
            >
              <span aria-hidden>{f.emoji}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        {formaPagamento === "dinheiro" && (
          <div className="mt-4 space-y-2">
            <label className="block">
              <span className="text-xs text-zinc-400">Valor recebido</span>
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={recebidoTexto}
                onChange={(e) => {
                  setRecebidoTexto(e.target.value);
                  setConfirmando(false);
                }}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-lg focus:outline-none focus:border-orange-500 transition"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {sugestoesDinheiro.map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => {
                    setRecebidoTexto(String(v));
                    setConfirmando(false);
                  }}
                  className="px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-sm"
                >
                  {moeda(v)}
                </button>
              ))}
            </div>
            {recebidoTexto && (
              <p className={`font-bold ${dinheiroInsuficiente ? "text-red-400" : "text-green-400"}`}>
                {dinheiroInsuficiente ? `Faltam ${moeda(-troco)}` : `Troco: ${moeda(troco)}`}
              </p>
            )}
          </div>
        )}
      </Cartao>

      <Botao
        variante={confirmando ? "primario" : "sucesso"}
        disabled={!podeFinalizar}
        onClick={finalizar}
        className="w-full py-4 rounded-2xl text-lg shadow-lg"
      >
        {confirmando ? `Confirmar recebimento de ${moeda(total)}?` : "Finalizar conta"}
      </Botao>
      {confirmando && (
        <Botao variante="fantasma" className="w-full py-2 text-sm" onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
      )}
    </Pagina>
  );
}
