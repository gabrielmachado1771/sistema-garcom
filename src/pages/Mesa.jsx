import { useMemo, useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { contarItens, itensConsumidos, mesaOcupada, somaItens, totalMesa } from "../store/regras";
import { hora, moeda, plural, tempoDecorrido } from "../utils/format";
import useAgora from "../hooks/useAgora";
import {
  Botao,
  BotaoVoltar,
  Cabecalho,
  Cartao,
  Etiqueta,
  ListaItens,
  Modal,
  Pagina,
  TituloSecao,
} from "../components/ui";
import { classeInput } from "../utils/estilos";

const TODAS = "TODAS";

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const SUGESTOES_OBS = ["Sem cebola", "Sem gelo", "Bem passada", "Ao ponto", "Mal passada", "Sem salada", "Para viagem"];

/** Janela para escrever a observação de um item (ex.: 1 dos 3 hambúrgueres "sem cebola"). */
function ModalObservacao({ item, onSalvar, onFechar }) {
  const [texto, setTexto] = useState(item.obs ?? "");
  const [qtd, setQtd] = useState(item.obs ? item.qtd : 1);
  const salvar = (e) => {
    e.preventDefault();
    onSalvar(texto, qtd);
  };
  return (
    <Modal aberto titulo={`Observação — ${item.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        <input
          autoFocus
          maxLength={100}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: sem cebola, bem passada…"
          className={classeInput}
        />
        <div className="flex flex-wrap gap-2">
          {SUGESTOES_OBS.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setTexto((t) => (t.trim() ? `${t.trim()}, ${s.toLowerCase()}` : s))}
              className="px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs"
            >
              + {s}
            </button>
          ))}
        </div>
        {item.qtd > 1 && (
          <div className="flex items-center justify-between gap-3 bg-zinc-800/60 rounded-xl p-3">
            <span className="text-sm text-zinc-300">Vale para quantos?</span>
            <div className="flex items-center gap-2">
              <Botao className="w-9 h-9" aria-label="Menos um" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)}>
                −
              </Botao>
              <span className="w-14 text-center text-sm font-semibold tabular-nums">
                {qtd} de {item.qtd}
              </span>
              <Botao className="w-9 h-9" aria-label="Mais um" disabled={qtd >= item.qtd} onClick={() => setQtd(qtd + 1)}>
                +
              </Botao>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {item.obs && (
            <Botao variante="fantasma" className="px-4 py-3 text-sm" onClick={() => onSalvar("", qtd)}>
              Tirar observação
            </Botao>
          )}
          <Botao type="submit" variante="primario" className="flex-1 py-3">
            Salvar
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

/** Escolher para qual mesa levar a conta. Mesa livre = mover; mesa ocupada = juntar. */
function ModalTransferir({ mesa, mesas, onEscolher, onFechar }) {
  const outras = mesas.filter((m) => m.id !== mesa.id);
  return (
    <Modal aberto titulo={`Trocar a mesa ${mesa.numero} de lugar`} onFechar={onFechar}>
      <p className="text-sm text-zinc-400 mb-4">
        Escolha uma mesa <strong className="text-zinc-200">livre</strong> para mudar o cliente de lugar, ou uma mesa{" "}
        <strong className="text-orange-400">ocupada</strong> para juntar as duas contas.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {outras.map((m) => {
          const ocupada = mesaOcupada(m);
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => onEscolher(m)}
              className={`rounded-xl py-3 px-2 text-sm font-semibold border transition active:scale-95 ${
                ocupada
                  ? "bg-orange-500/10 border-orange-500/40 hover:border-orange-500 text-orange-300"
                  : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              Mesa {m.numero}
              <span className="block text-[11px] font-normal text-zinc-400">
                {ocupada ? `juntar · ${moeda(totalMesa(m))}` : "livre"}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

const statusComanda = {
  preparo: <Etiqueta cor="amarelo">⏳ Em preparo</Etiqueta>,
  pronto: <Etiqueta cor="verde">✓ Pronto</Etiqueta>,
  entregue: <Etiqueta>Servido</Etiqueta>,
};

export default function Mesa({ mesaId, navegar }) {
  const {
    mesas,
    cardapio,
    adicionarItem,
    removerItem,
    limparRascunho,
    definirObservacao,
    enviarCozinha,
    marcarEntregue,
    cancelarComanda,
    observacaoItem,
    transferirMesa,
  } = useRestaurante();
  const agora = useAgora();
  const aviso = useAviso();
  const [categoria, setCategoria] = useState(TODAS);
  const [busca, setBusca] = useState("");
  const [itemObs, setItemObs] = useState(null); // linha do pedido com a janela de observação aberta
  const [transferindo, setTransferindo] = useState(false);

  const mesa = mesas.find((m) => m.id === mesaId);

  const cardapioFiltrado = useMemo(() => {
    const termo = normalizar(busca.trim());
    return cardapio
      .filter((cat) => termo || categoria === TODAS || cat.id === categoria)
      .map((cat) => ({ ...cat, produtos: cat.produtos.filter((p) => !termo || normalizar(p.nome).includes(termo)) }))
      .filter((cat) => cat.produtos.length > 0);
  }, [busca, categoria, cardapio]);

  if (!mesa) {
    return (
      <Pagina>
        <Cabecalho titulo="Mesa não encontrada">
          <BotaoVoltar onClick={() => navegar("garcom")} />
        </Cabecalho>
      </Pagina>
    );
  }

  const consumidos = itensConsumidos(mesa);
  const qtdNoRascunho = {};
  for (const i of mesa.rascunho) qtdNoRascunho[i.produtoId] = (qtdNoRascunho[i.produtoId] ?? 0) + i.qtd;

  function transferirPara(destino) {
    const juntar = mesaOcupada(destino);
    const pergunta = juntar
      ? `Juntar a conta da mesa ${mesa.numero} com a da mesa ${destino.numero}? Tudo vai ficar na mesa ${destino.numero}.`
      : `Mudar o cliente da mesa ${mesa.numero} para a mesa ${destino.numero}?`;
    if (!window.confirm(pergunta)) return;
    transferirMesa(mesa.id, destino.id);
    setTransferindo(false);
    aviso(juntar ? `Mesas ${mesa.numero} e ${destino.numero} juntadas.` : `Conta levada para a mesa ${destino.numero}.`);
    navegar("garcom", destino.id);
  }
  const totalRascunho = somaItens(mesa.rascunho);
  const temRascunho = mesa.rascunho.length > 0;

  return (
    <Pagina className={temRascunho ? "pb-28" : ""}>
      <Cabecalho
        titulo={`Mesa ${mesa.numero}`}
        subtitulo={
          mesa.abertaEm
            ? `Aberta às ${hora(mesa.abertaEm)} · ${tempoDecorrido(mesa.abertaEm, agora)}${
                mesa.atendente ? ` · ${mesa.atendente.nome}` : ""
              }`
            : "Livre — adicione itens para abrir"
        }
      >
        {mesaOcupada(mesa) && (
          <Botao className="px-3 py-2 text-sm" onClick={() => setTransferindo(true)} title="Mudar de mesa ou juntar com outra">
            ⇄ Trocar
          </Botao>
        )}
        <BotaoVoltar onClick={() => navegar("garcom")} />
      </Cabecalho>

      {transferindo && (
        <ModalTransferir mesa={mesa} mesas={mesas} onEscolher={transferirPara} onFechar={() => setTransferindo(false)} />
      )}
      {itemObs && (
        <ModalObservacao
          key={`${itemObs.produtoId}|${itemObs.obs}`}
          item={itemObs}
          onFechar={() => setItemObs(null)}
          onSalvar={(texto, qtd) => {
            observacaoItem(mesa.id, itemObs.produtoId, itemObs.obs ?? "", texto, qtd);
            setItemObs(null);
          }}
        />
      )}

      {/* Conta até agora */}
      <Cartao>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-400">Total da conta</p>
            <p className="text-3xl font-bold text-orange-500">{moeda(totalMesa(mesa))}</p>
          </div>
          {temRascunho && (
            <p className="text-right text-xs text-zinc-400">
              + {moeda(totalRascunho)}
              <br />
              não enviado
            </p>
          )}
        </div>
        {consumidos.length > 0 && (
          <details className="mt-3 text-sm group">
            <summary className="cursor-pointer text-zinc-400 hover:text-white select-none">
              Ver {plural(contarItens(consumidos), "item consumido", "itens consumidos")}
            </summary>
            <div className="mt-2">
              <ListaItens
                itens={consumidos}
                render={(i) => (
                  <>
                    <span>
                      {i.qtd}x {i.nome}
                    </span>
                    <span className="text-zinc-400">{moeda(i.preco * i.qtd)}</span>
                  </>
                )}
              />
            </div>
          </details>
        )}
      </Cartao>

      {/* Comandas já enviadas */}
      {mesa.comandas.length > 0 && (
        <Cartao>
          <TituloSecao>Pedidos enviados</TituloSecao>
          <ul className="space-y-3">
            {[...mesa.comandas].reverse().map((c) => (
              <li
                key={c.id}
                className={`rounded-xl border p-3 ${
                  c.status === "pronto"
                    ? "border-green-500/40 bg-green-500/5"
                    : c.status === "preparo"
                      ? "border-yellow-500/20"
                      : "border-zinc-800 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold">
                    #{c.numero} · {hora(c.enviadaEm)}
                  </span>
                  {statusComanda[c.status]}
                </div>
                <p className="text-sm text-zinc-300">
                  {c.itens.map((i) => `${i.qtd}x ${i.nome}${i.obs ? ` (${i.obs})` : ""}`).join(", ")}
                </p>
                {c.observacao && <p className="text-xs text-yellow-300 mt-1">Obs: {c.observacao}</p>}
                {c.status === "pronto" && (
                  <Botao
                    variante="sucesso"
                    className="w-full mt-2 py-2 text-sm"
                    onClick={() => marcarEntregue(mesa.id, c.id)}
                  >
                    Marcar como servido
                  </Botao>
                )}
                {c.status === "preparo" && (
                  <Botao
                    variante="fantasma"
                    className="mt-1 px-2 py-1 text-xs"
                    onClick={() => {
                      if (window.confirm(`Cancelar o pedido #${c.numero} da mesa ${mesa.numero}?`)) {
                        cancelarComanda(mesa.id, c.id);
                        aviso(`Pedido #${c.numero} cancelado.`, { tipo: "info" });
                      }
                    }}
                  >
                    Cancelar pedido
                  </Botao>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {/* Novo pedido (rascunho) */}
      <Cartao>
        <TituloSecao
          acao={
            temRascunho && (
              <Botao variante="fantasma" className="px-2 py-1 text-xs" onClick={() => limparRascunho(mesa.id)}>
                Limpar
              </Botao>
            )
          }
        >
          Novo pedido
        </TituloSecao>

        {!temRascunho ? (
          <p className="text-zinc-500 text-sm">Toque nos itens do cardápio abaixo para adicionar.</p>
        ) : (
          <ListaItens
            itens={mesa.rascunho}
            render={(item) => (
              <>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.nome}</p>
                  {item.obs && <p className="text-xs text-yellow-300 truncate">📝 {item.obs}</p>}
                  <p className="text-sm text-orange-400">{moeda(item.preco * item.qtd)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Botao
                    variante="fantasma"
                    className={`w-9 h-9 ${item.obs ? "text-yellow-300" : ""}`}
                    aria-label={`Observação de ${item.nome}`}
                    title="Observação deste item"
                    onClick={() => setItemObs(item)}
                  >
                    📝
                  </Botao>
                  <Botao
                    variante="perigo"
                    className="w-9 h-9 text-lg"
                    aria-label={`Remover um ${item.nome}`}
                    onClick={() => removerItem(mesa.id, item.produtoId, item.obs ?? "")}
                  >
                    −
                  </Botao>
                  <span className="w-6 text-center font-bold tabular-nums">{item.qtd}</span>
                  <Botao
                    variante="sucesso"
                    className="w-9 h-9 text-lg"
                    aria-label={`Adicionar um ${item.nome}`}
                    onClick={() =>
                      adicionarItem(mesa.id, { id: item.produtoId, nome: item.nome, preco: item.preco }, item.obs ?? "")
                    }
                  >
                    +
                  </Botao>
                </div>
              </>
            )}
          />
        )}

        <label className="block mt-4">
          <span className="text-xs text-zinc-400">Observação geral do pedido (para um item só, use o 📝)</span>
          <input
            type="text"
            placeholder="Ex.: sem cebola, carne bem passada…"
            value={mesa.observacao}
            onChange={(e) => definirObservacao(mesa.id, e.target.value)}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition placeholder:text-zinc-600"
          />
        </label>
      </Cartao>

      {/* Cardápio */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg text-zinc-300">Cardápio</h2>
        <input
          type="search"
          placeholder="🔍 Buscar item…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition placeholder:text-zinc-500"
        />
        {!busca && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 [scrollbar-width:none]">
            {[{ id: TODAS, nome: "Todos" }, ...cardapio].map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setCategoria(cat.id)}
                aria-pressed={categoria === cat.id}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                  categoria === cat.id
                    ? "bg-orange-500 text-black"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {cat.nome}
              </button>
            ))}
          </div>
        )}

        {cardapioFiltrado.length === 0 && (
          <p className="text-zinc-500 text-sm">Nenhum item encontrado para “{busca}”.</p>
        )}

        {cardapioFiltrado.map((cat) => (
          <div key={cat.id}>
            <h3 className="text-orange-500 font-bold text-sm mb-2">{cat.nome}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cat.produtos.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => adicionarItem(mesa.id, p)}
                  className="relative bg-zinc-900 border border-zinc-800 hover:border-orange-500/60 active:scale-[0.98] transition-all py-3 px-4 rounded-xl flex justify-between items-center gap-2 text-sm text-left"
                >
                  <span className="font-medium">{p.nome}</span>
                  <span className="text-orange-400 font-semibold whitespace-nowrap">{moeda(p.preco)}</span>
                  {qtdNoRascunho[p.id] > 0 && (
                    <span className="absolute -top-2 -left-2 bg-orange-500 text-black text-xs font-bold rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center shadow">
                      {qtdNoRascunho[p.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Barra fixa para enviar */}
      {temRascunho && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-zinc-950/90 backdrop-blur border-t border-zinc-800">
          <div className="max-w-lg mx-auto">
            <Botao
              variante="primario"
              className="w-full py-4 text-base flex items-center justify-between px-5 shadow-lg shadow-orange-500/20"
              onClick={() => {
                enviarCozinha(mesa.id);
                aviso(`Pedido da mesa ${mesa.numero} enviado à cozinha 👨‍🍳`);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <span>Enviar à cozinha</span>
              <span>
                {plural(contarItens(mesa.rascunho), "item", "itens")} · {moeda(totalRascunho)}
              </span>
            </Botao>
          </div>
        </div>
      )}
    </Pagina>
  );
}
