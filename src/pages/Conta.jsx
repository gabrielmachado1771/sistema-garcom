import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import {
  TAXA_SERVICO,
  centavos,
  descreverPagamento,
  dividirPorItens,
  itensConsumidos,
  juntarPagamentos,
  resumoPagamento,
  totalMesa,
  unidadesDaConta,
} from "../store/regras";
import { moeda, plural } from "../utils/format";
import { Botao, BotaoVoltar, Cabecalho, Cartao, ListaItens, Pagina, TituloSecao, Vazio } from "../components/ui";
import PagamentoPessoa from "../components/conta/PagamentoPessoa";
import { partesDoPagamento, situacao } from "../components/conta/calculos";
import QuemConsumiu from "../components/conta/QuemConsumiu";

const MAX_PESSOAS = 20;

const MODOS = [
  { id: "uma", emoji: "👤", titulo: "Uma pessoa paga tudo", descricao: "Conta inteira de uma vez" },
  { id: "igual", emoji: "👥", titulo: "Dividir em partes iguais", descricao: "Cada um paga o mesmo valor" },
  { id: "itens", emoji: "🧾", titulo: "Cada um paga o que consumiu", descricao: "Marque os itens de cada pessoa" },
];

export default function Conta({ mesaId, navegar }) {
  const { mesas, finalizarConta } = useRestaurante();
  const aviso = useAviso();
  const [comTaxa, setComTaxa] = useState(true);
  const [modo, setModo] = useState("uma");
  const [pessoas, setPessoas] = useState(2);
  const [atribuicao, setAtribuicao] = useState({}); // unidade -> pessoa
  const [pessoaAtiva, setPessoaAtiva] = useState(0);
  const [pagos, setPagos] = useState({}); // pessoa -> { forma, recebido, texto }
  const [aberto, setAberto] = useState(null); // pessoa com o cartão aberto (null = a próxima que falta)
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
  const unidades = unidadesDaConta(mesa);
  const varias = modo !== "uma";
  const partes = varias
    ? dividirPorItens(unidades, modo === "itens" ? atribuicao : {}, pessoas, comTaxa)
    : [{ pessoa: 0, total, proprio: 0, compartilhado: 0, taxa: 0 }];
  const nomes = Array.from({ length: Math.max(pessoas, 1) }, (_, i) => `Pessoa ${i + 1}`);

  // ---- situação do pagamento ----
  const situacoes = partes.map((p) => situacao(p.total, pagos[p.pessoa]));
  // Junta o que cada pessoa pagou (cada uma pode ter usado uma ou várias formas).
  const pagamentos = juntarPagamentos(
    partes.filter((_, i) => situacoes[i].pago).flatMap((p) => partesDoPagamento(p.total, pagos[p.pessoa]))
  );
  const resumo = resumoPagamento(pagamentos, total);
  const quantosPagaram = situacoes.filter((s) => s.pago).length;
  const todosPagaram = quantosPagaram === partes.length;
  const recebido = centavos(situacoes.reduce((a, s) => a + s.coberto, 0));
  const podeFinalizar = todosPagaram && resumo.valido;
  const proximaQueFalta = partes.findIndex((_, i) => !situacoes[i].pago);
  const abertoAgora = aberto ?? (proximaQueFalta >= 0 ? partes[proximaQueFalta].pessoa : null);

  const naoEnviados = mesa.rascunho.length > 0;
  const emAndamento = mesa.comandas.some((c) => c.status !== "entregue");

  // Quando os valores mudam, quem já tinha pago precisa pagar o valor novo.
  function valoresMudaram() {
    if (Object.keys(pagos).length > 0) {
      aviso("Os valores mudaram, então os pagamentos marcados foram desfeitos.", { tipo: "info", duracao: 4000 });
    }
    setPagos({});
    setAberto(null);
    setConfirmando(false);
  }

  function escolherModo(id) {
    if (id === modo) return;
    valoresMudaram();
    setModo(id);
  }

  function mudarPessoas(n) {
    if (n < 2 || n > MAX_PESSOAS) return;
    valoresMudaram();
    setPessoas(n);
    setPessoaAtiva((p) => Math.min(p, n - 1));
    setAtribuicao((a) => Object.fromEntries(Object.entries(a).filter(([, p]) => p < n)));
  }

  function alternarUnidade(chave) {
    valoresMudaram();
    setAtribuicao((a) => {
      const novo = { ...a };
      if (novo[chave] === pessoaAtiva) delete novo[chave];
      else novo[chave] = pessoaAtiva;
      return novo;
    });
  }

  function pagar(pessoa, pagamento, manterAberto) {
    setPagos((p) => ({ ...p, [pessoa]: pagamento }));
    setAberto(manterAberto ? pessoa : null);
    setConfirmando(false);
  }

  function desfazer(pessoa) {
    setPagos((p) => Object.fromEntries(Object.entries(p).filter(([k]) => Number(k) !== pessoa)));
    setAberto(pessoa);
    setConfirmando(false);
  }

  function finalizar() {
    if (!podeFinalizar) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    finalizarConta(mesa.id, { comTaxa, pessoas: varias ? pessoas : 1, pagamentos });
    const formas = descreverPagamento({ pagamentos });
    aviso(
      resumo.troco > 0
        ? `Mesa ${mesa.numero} fechada (${formas}). Troco: ${moeda(resumo.troco)}`
        : `Mesa ${mesa.numero} fechada — ${moeda(total)} em ${formas}.`
    );
    voltar();
  }

  const progresso = total > 0 ? Math.min(100, (recebido / total) * 100) : 100;

  return (
    <Pagina className="pb-44">
      <Cabecalho titulo={`Conta — Mesa ${mesa.numero}`} subtitulo="Conferência e pagamento">
        <BotaoVoltar onClick={voltar} />
      </Cabecalho>

      {(naoEnviados || emAndamento) && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl p-3 text-sm space-y-1">
          {emAndamento && <p>⚠️ Há pedidos desta mesa que ainda não foram servidos.</p>}
          {naoEnviados && <p>⚠️ Há itens lançados pelo garçom que não foram enviados e não entram na conta.</p>}
        </div>
      )}

      {/* Conferência */}
      <Cartao>
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer select-none list-none">
            <span className="text-sm text-zinc-400">
              {plural(itens.reduce((a, i) => a + i.qtd, 0), "item", "itens")}{" "}
              <span className="text-orange-400 group-open:hidden">· ver itens</span>
              <span className="text-orange-400 hidden group-open:inline">· esconder</span>
            </span>
            <span className="text-sm text-zinc-400">{moeda(subtotal)}</span>
          </summary>
          <div className="mt-2">
            <ListaItens
              itens={itens}
              render={(item) => (
                <>
                  <span className="text-sm">
                    {item.qtd}x {item.nome}
                    <span className="text-xs text-zinc-500"> ({moeda(item.preco)})</span>
                  </span>
                  <span className="text-sm text-zinc-300 whitespace-nowrap">{moeda(item.preco * item.qtd)}</span>
                </>
              )}
            />
          </div>
        </details>
        <label className="mt-2 flex justify-between items-center text-sm text-zinc-400 cursor-pointer select-none">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={comTaxa}
              onChange={(e) => {
                valoresMudaram();
                setComTaxa(e.target.checked);
              }}
              className="accent-orange-500 w-4 h-4"
            />
            Taxa de serviço ({TAXA_SERVICO * 100}%)
          </span>
          <span>{moeda(taxa)}</span>
        </label>
        <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-zinc-700">
          <span className="text-lg font-bold">Total</span>
          <span className="text-3xl font-bold text-orange-500 tabular-nums">{moeda(total)}</span>
        </div>
      </Cartao>

      {/* Passo 1: como vão pagar */}
      <Cartao>
        <TituloSecao>Como vão pagar?</TituloSecao>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Como vão pagar">
          {MODOS.map((m) => {
            const ativo = modo === m.id;
            return (
              <button
                type="button"
                key={m.id}
                role="radio"
                aria-checked={ativo}
                onClick={() => escolherModo(m.id)}
                className={`rounded-xl p-3 text-left flex sm:flex-col items-center sm:items-start gap-3 sm:gap-1 border-2 transition active:scale-[0.98] ${
                  ativo ? "border-orange-500 bg-orange-500/10" : "border-zinc-800 bg-zinc-800/50 hover:border-zinc-600"
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {m.emoji}
                </span>
                <span>
                  <span className={`block font-semibold text-sm ${ativo ? "text-orange-300" : ""}`}>{m.titulo}</span>
                  <span className="block text-xs text-zinc-500">{m.descricao}</span>
                </span>
              </button>
            );
          })}
        </div>

        {varias && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-zinc-800/60 p-3">
            <span className="text-sm font-semibold">Quantas pessoas?</span>
            <div className="flex items-center gap-2">
              <Botao className="w-10 h-10 text-lg" aria-label="Menos uma pessoa" disabled={pessoas <= 2} onClick={() => mudarPessoas(pessoas - 1)}>
                −
              </Botao>
              <span className="w-8 text-center text-xl font-bold tabular-nums">{pessoas}</span>
              <Botao
                className="w-10 h-10 text-lg"
                aria-label="Mais uma pessoa"
                disabled={pessoas >= MAX_PESSOAS}
                onClick={() => mudarPessoas(pessoas + 1)}
              >
                +
              </Botao>
            </div>
          </div>
        )}
        {modo === "igual" && (
          <p className="mt-2 text-sm text-zinc-400 text-center">
            {partes.every((p) => p.total === partes[0].total)
              ? `${moeda(partes[0].total)} para cada um`
              : `${moeda(partes[0].total)} ou ${moeda(partes.at(-1).total)} (os centavos não dividem exato)`}
          </p>
        )}
      </Cartao>

      {/* Passo 2: quem consumiu o quê */}
      {modo === "itens" && (
        <Cartao>
          <TituloSecao>Quem consumiu o quê?</TituloSecao>
          <QuemConsumiu
            unidades={unidades}
            atribuicao={atribuicao}
            partes={partes}
            pessoaAtiva={pessoaAtiva}
            setPessoaAtiva={setPessoaAtiva}
            onAlternar={alternarUnidade}
            onLimpar={() => {
              valoresMudaram();
              setAtribuicao({});
            }}
            nomes={nomes}
          />
        </Cartao>
      )}

      {/* Passo final: receber */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="font-bold text-xs text-zinc-400 uppercase tracking-wider">
            {varias ? `Receber de cada pessoa (${quantosPagaram}/${partes.length})` : "Receber"}
          </h2>
        </div>

        {partes.map((p) => (
            <PagamentoPessoa
              key={p.pessoa}
              id={p.pessoa}
              titulo={varias ? nomes[p.pessoa] : "Conta inteira"}
              valor={p.total}
              detalhe={
                modo === "itens"
                  ? [
                      p.proprio > 0 && `${moeda(p.proprio)} em itens próprios`,
                      p.compartilhado > 0 && `${moeda(p.compartilhado)} da parte de todos`,
                      p.taxa > 0 && `${moeda(p.taxa)} de taxa`,
                    ]
                      .filter(Boolean)
                      .join(" + ")
                  : null
              }
              pagamento={pagos[p.pessoa]}
              aberto={abertoAgora === p.pessoa}
              onAbrir={() => setAberto(p.pessoa)}
              onFechar={() => setAberto(null)}
              onPagar={(pg, manterAberto) => pagar(p.pessoa, pg, manterAberto)}
              onDesfazer={() => desfazer(p.pessoa)}
            />
          ))}
      </section>

      {/* Barra fixa: quanto já entrou + finalizar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 p-4">
        <div className="max-w-lg mx-auto space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-zinc-400">
                Recebido <strong className="text-white tabular-nums">{moeda(recebido)}</strong> de {moeda(total)}
              </span>
              <span className={`font-semibold tabular-nums ${todosPagaram ? "text-green-400" : "text-zinc-400"}`}>
                {todosPagaram
                  ? resumo.troco > 0
                    ? `Troco ${moeda(resumo.troco)}`
                    : "✓ Tudo pago"
                  : `Faltam ${moeda(centavos(total - recebido))}`}
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-zinc-800 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progresso)}
              aria-label="Quanto da conta já foi recebido"
            >
              <div
                className={`h-full rounded-full transition-all ${todosPagaram ? "bg-green-500" : "bg-orange-500"}`}
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            {confirmando && (
              <Botao variante="fantasma" className="px-4 py-3 text-sm" onClick={() => setConfirmando(false)}>
                Cancelar
              </Botao>
            )}
            <Botao
              variante={confirmando ? "primario" : "sucesso"}
              disabled={!podeFinalizar}
              onClick={finalizar}
              className="flex-1 py-3.5 rounded-2xl text-base shadow-lg"
            >
              {confirmando
                ? `Confirmar e fechar a mesa ${mesa.numero}`
                : podeFinalizar
                  ? "Finalizar conta"
                  : varias
                    ? `Falta${partes.length - quantosPagaram > 1 ? "m" : ""} ${plural(partes.length - quantosPagaram, "pessoa")} pagar`
                    : "Escolha como vai pagar"}
            </Botao>
          </div>
        </div>
      </div>
    </Pagina>
  );
}
