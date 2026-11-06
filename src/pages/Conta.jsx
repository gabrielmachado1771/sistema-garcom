import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import {
  FORMAS_PAGAMENTO,
  TAXA_SERVICO,
  centavos,
  descreverPagamento,
  itensConsumidos,
  juntarPagamentos,
  resumoPagamento,
  totalMesa,
} from "../store/regras";
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
import DivisaoConta from "../components/DivisaoConta";

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
  const [valores, setValores] = useState({}); // forma -> texto digitado
  const [comTaxa, setComTaxa] = useState(true);
  const [pessoas, setPessoas] = useState(1);
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
  const taxa = centavos(comTaxa ? subtotal * TAXA_SERVICO : 0);
  const total = centavos(subtotal + taxa);

  const valorDe = (forma) => centavos(parseValor(valores[forma] ?? ""));
  const pagamentos = juntarPagamentos(FORMAS_PAGAMENTO.map((f) => ({ forma: f.id, valor: valorDe(f.id) })));
  const resumo = resumoPagamento(pagamentos, total);
  const podeFinalizar = resumo.valido;
  // Quanto falta, sem contar o que já foi digitado nesta forma.
  const restantePara = (forma) => centavos(Math.max(0, total - (resumo.pago - valorDe(forma))));
  // Quanto o dinheiro precisa cobrir depois de Pix/cartão (base das sugestões de nota).
  const faltaEmDinheiro = centavos(Math.max(0, total - resumo.outros));

  const naoEnviados = mesa.rascunho.length > 0;
  const emAndamento = mesa.comandas.some((c) => c.status !== "entregue");

  function definirValor(forma, texto) {
    setValores((v) => ({ ...v, [forma]: texto }));
    setConfirmando(false);
  }

  // Usado pela divisão da conta: soma (ou tira) a parte de uma pessoa numa forma de pagamento.
  function somarNaForma(forma, delta) {
    setValores((v) => {
      const novo = centavos(parseValor(v[forma] ?? "") + delta);
      return { ...v, [forma]: novo > 0.004 ? novo.toFixed(2).replace(".", ",") : "" };
    });
    setConfirmando(false);
  }

  function preencherRestante(forma) {
    definirValor(forma, restantePara(forma).toFixed(2).replace(".", ","));
  }

  function limparPagamentos() {
    setValores({});
    setConfirmando(false);
  }

  function finalizar() {
    if (!podeFinalizar) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    finalizarConta(mesa.id, { comTaxa, pessoas, pagamentos });
    const formas = descreverPagamento({ pagamentos });
    aviso(
      resumo.troco > 0
        ? `Mesa ${mesa.numero} fechada (${formas}). Troco: ${moeda(resumo.troco)}`
        : `Mesa ${mesa.numero} fechada — ${moeda(total)} em ${formas}.`
    );
    voltar();
  }

  const sugestoesDinheiro =
    faltaEmDinheiro > 0
      ? [
          ...new Set([
            faltaEmDinheiro,
            Math.ceil(faltaEmDinheiro / 10) * 10,
            Math.ceil(faltaEmDinheiro / 50) * 50,
            Math.ceil(faltaEmDinheiro / 100) * 100,
          ]),
        ]
      : [];
  const algumValor = pagamentos.length > 0;

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

      <DivisaoConta
        mesa={mesa}
        pessoas={pessoas}
        setPessoas={setPessoas}
        comTaxa={comTaxa}
        onLancar={somarNaForma}
      />

      <Cartao>
        <TituloSecao
          acao={
            algumValor && (
              <button type="button" onClick={limparPagamentos} className="text-xs text-zinc-400 hover:text-white">
                Limpar
              </button>
            )
          }
        >
          Pagamento
        </TituloSecao>
        <p className="text-xs text-zinc-500 mb-3">
          Toque em <strong className="text-zinc-300">Restante</strong> para pagar o que falta numa forma, ou digite um
          valor em cada forma para dividir (ex.: parte no dinheiro, parte no cartão).
        </p>

        <div className="space-y-2">
          {FORMAS_PAGAMENTO.map((f) => {
            const preenchido = valorDe(f.id) > 0;
            return (
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
                    onChange={(e) => definirValor(f.id, e.target.value)}
                    className={`w-full bg-zinc-800 border rounded-xl pl-9 pr-3 py-2 text-base tabular-nums focus:outline-none focus:border-orange-500 transition ${
                      preenchido ? "border-orange-500/60" : "border-zinc-700"
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => preencherRestante(f.id)}
                  disabled={restantePara(f.id) === 0 || restantePara(f.id) === valorDe(f.id)}
                  className="shrink-0 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Restante
                </button>
              </div>
            );
          })}
        </div>

        {sugestoesDinheiro.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">💵 Recebeu em dinheiro:</span>
            {sugestoesDinheiro.map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => definirValor("dinheiro", v.toFixed(2).replace(".", ","))}
                className="px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-sm tabular-nums"
              >
                {moeda(v)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-800/60 rounded-xl py-2">
            <p className="text-xs text-zinc-400">Total</p>
            <p className="font-bold tabular-nums">{moeda(total)}</p>
          </div>
          <div className="bg-zinc-800/60 rounded-xl py-2">
            <p className="text-xs text-zinc-400">Pago</p>
            <p className="font-bold tabular-nums">{moeda(resumo.pago)}</p>
          </div>
          <div className={`rounded-xl py-2 ${resumo.troco > 0 ? "bg-green-500/10" : resumo.falta > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}>
            <p className="text-xs text-zinc-400">{resumo.troco > 0 ? "Troco" : "Falta"}</p>
            <p className={`font-bold tabular-nums ${resumo.falta > 0 ? "text-red-400" : "text-green-400"}`}>
              {moeda(resumo.troco > 0 ? resumo.troco : resumo.falta)}
            </p>
          </div>
        </div>

        <p
          role="status"
          className={`mt-3 text-sm font-semibold ${
            resumo.excedente > 0 ? "text-red-400" : resumo.valido ? "text-green-400" : "text-zinc-400"
          }`}
        >
          {resumo.excedente > 0
            ? `Pix e cartão passaram do total em ${moeda(resumo.excedente)}. Troco só pode sair do dinheiro.`
            : resumo.valido
              ? resumo.troco > 0
                ? `✓ Pago. Devolva ${moeda(resumo.troco)} de troco em dinheiro.`
                : `✓ Pago${pagamentos.length > 1 ? ` em ${descreverPagamento({ pagamentos })}` : ""}.`
              : algumValor
                ? `Ainda faltam ${moeda(resumo.falta)}.`
                : "Informe quanto foi pago em cada forma."}
        </p>
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
