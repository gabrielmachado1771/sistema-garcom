import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import { moeda, parseValor } from "../utils/format";
import { classeInput } from "../utils/estilos";
import { Botao, Cabecalho, Campo, Cartao, Modal, Pagina, Vazio } from "../components/ui";
import ModalOpcoesProduto from "../components/ModalOpcoesProduto";

function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function ModalProduto({ produto, categoriaId, cardapio, onSalvar, onFechar }) {
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [preco, setPreco] = useState(produto ? produto.preco.toFixed(2).replace(".", ",") : "");
  const [categoria, setCategoria] = useState(categoriaId);
  const [tentou, setTentou] = useState(false);

  const valor = parseValor(preco);
  const erroNome = !nome.trim() ? "Informe o nome do produto." : null;
  const erroPreco = !preco.trim() || !(valor >= 0) || valor > 99999 ? "Informe um preço válido (ex.: 12,50)." : null;

  function salvar(e) {
    e.preventDefault();
    setTentou(true);
    if (erroNome || erroPreco) return;
    onSalvar({ id: produto?.id, nome: nome.trim(), preco: Math.round(valor * 100) / 100, categoriaId: categoria });
  }

  return (
    <Modal aberto titulo={produto ? "Editar produto" : "Novo produto"} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Campo rotulo="Nome" erro={tentou && erroNome}>
          <input autoFocus maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} className={classeInput} />
        </Campo>
        <Campo rotulo="Preço (R$)" erro={tentou && erroPreco}>
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            className={classeInput}
          />
        </Campo>
        <Campo rotulo="Categoria">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={classeInput}>
            {cardapio.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        {produto && (
          <p className="text-xs text-zinc-500">
            Mudar o preço vale para os próximos pedidos. Pedidos já enviados mantêm o preço antigo.
          </p>
        )}
        <Botao type="submit" variante="primario" className="w-full py-3">
          {produto ? "Salvar alterações" : "Adicionar ao cardápio"}
        </Botao>
      </form>
    </Modal>
  );
}

export default function Cardapio() {
  const {
    cardapio,
    salvarProduto,
    removerProduto,
    salvarCategoria,
    removerCategoria,
    moverCategoria,
    marcarEsgotado,
    salvarOpcoesProduto,
  } = useRestaurante();
  const [opcoesDe, setOpcoesDe] = useState(null); // produto com o editor de opções aberto
  const aviso = useAviso();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState(null); // { produto?, categoriaId }

  const termo = normalizar(busca.trim());
  const visiveis = cardapio
    .map((c) => ({ ...c, produtos: c.produtos.filter((p) => !termo || normalizar(p.nome).includes(termo)) }))
    .filter((c) => !termo || c.produtos.length > 0);
  const totalProdutos = cardapio.reduce((a, c) => a + c.produtos.length, 0);

  function novaCategoria() {
    const nome = window.prompt("Nome da nova categoria (ex.: Drinks, Lanches):")?.trim();
    if (!nome) return;
    if (cardapio.some((c) => normalizar(c.nome) === normalizar(nome))) {
      aviso("Já existe uma categoria com esse nome.", { tipo: "erro" });
      return;
    }
    salvarCategoria({ nome: nome.slice(0, 40) });
    aviso(`Categoria “${nome}” criada.`);
  }

  function renomear(cat) {
    const nome = window.prompt("Novo nome da categoria:", cat.nome)?.trim();
    if (!nome || nome === cat.nome) return;
    salvarCategoria({ id: cat.id, nome: nome.slice(0, 40) });
  }

  function apagarCategoria(cat) {
    if (cat.produtos.length > 0) {
      aviso("Remova ou mova os produtos dessa categoria antes de apagá-la.", { tipo: "erro", duracao: 4000 });
      return;
    }
    if (window.confirm(`Apagar a categoria “${cat.nome}”?`)) removerCategoria(cat.id);
  }

  function apagarProduto(p) {
    if (!window.confirm(`Tirar “${p.nome}” do cardápio? As vendas antigas continuam no histórico.`)) return;
    removerProduto(p.id);
    aviso(`“${p.nome}” saiu do cardápio.`, { tipo: "info" });
  }

  return (
    <Pagina largura="max-w-3xl">
      <Cabecalho titulo="Cardápio" subtitulo={`${totalProdutos} produtos em ${cardapio.length} categorias`}>
        <Botao className="px-3 py-2 text-sm" onClick={novaCategoria}>
          + Categoria
        </Botao>
      </Cabecalho>

      {opcoesDe && (
        <ModalOpcoesProduto
          produto={opcoesDe}
          onFechar={() => setOpcoesDe(null)}
          onSalvar={(grupos) => {
            salvarOpcoesProduto(opcoesDe.id, grupos);
            aviso(grupos.length ? `Opções de “${opcoesDe.nome}” salvas.` : `“${opcoesDe.nome}” ficou sem opções.`);
            setOpcoesDe(null);
          }}
        />
      )}
      {editando && (
        <ModalProduto
          produto={editando.produto}
          categoriaId={editando.categoriaId}
          cardapio={cardapio}
          onFechar={() => setEditando(null)}
          onSalvar={(dados) => {
            salvarProduto(dados);
            setEditando(null);
            aviso(dados.id ? `“${dados.nome}” atualizado.` : `“${dados.nome}” adicionado ao cardápio.`);
          }}
        />
      )}

      <input
        type="search"
        placeholder="🔍 Buscar produto…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition placeholder:text-zinc-500"
      />

      {cardapio.length === 0 && <Vazio icone="🍽️">O cardápio está vazio. Comece criando uma categoria.</Vazio>}
      {cardapio.length > 0 && visiveis.length === 0 && (
        <p className="text-sm text-zinc-500">Nenhum produto encontrado para “{busca}”.</p>
      )}

      {visiveis.map((cat) => {
        const pos = cardapio.findIndex((c) => c.id === cat.id);
        return (
          <Cartao key={cat.id}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="flex-1 min-w-0 font-bold text-orange-500 truncate">
                {cat.nome} <span className="text-xs font-normal text-zinc-500">({cat.produtos.length})</span>
              </h2>
              {!termo && (
                <>
                  <Botao
                    variante="fantasma"
                    className="w-8 h-8 text-sm"
                    aria-label={`Subir ${cat.nome}`}
                    disabled={pos === 0}
                    onClick={() => moverCategoria(cat.id, -1)}
                  >
                    ↑
                  </Botao>
                  <Botao
                    variante="fantasma"
                    className="w-8 h-8 text-sm"
                    aria-label={`Descer ${cat.nome}`}
                    disabled={pos === cardapio.length - 1}
                    onClick={() => moverCategoria(cat.id, 1)}
                  >
                    ↓
                  </Botao>
                  <Botao variante="fantasma" className="px-2 py-1 text-xs" onClick={() => renomear(cat)}>
                    Renomear
                  </Botao>
                  <Botao variante="fantasma" className="px-2 py-1 text-xs hover:text-red-400" onClick={() => apagarCategoria(cat)}>
                    Apagar
                  </Botao>
                </>
              )}
            </div>

            {cat.produtos.length === 0 ? (
              <p className="text-sm text-zinc-500 py-1">Nenhum produto nesta categoria.</p>
            ) : (
              <ul className="divide-y divide-zinc-800/60">
                {cat.produtos.map((p) => (
                  <li key={p.id} className="py-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditando({ produto: p, categoriaId: cat.id })}
                      className="flex-1 min-w-0 flex justify-between gap-3 text-left text-sm hover:text-orange-300 transition"
                    >
                      <span className="min-w-0">
                        <span className={`block truncate ${p.disponivel === false ? "line-through text-zinc-500" : ""}`}>{p.nome}</span>
                        {p.grupos?.length > 0 && (
                          <span className="block text-[11px] text-zinc-500 truncate">{p.grupos.map((g) => g.nome).join(" · ")}</span>
                        )}
                      </span>
                      <span className="text-orange-400 font-semibold tabular-nums whitespace-nowrap">{moeda(p.preco)}</span>
                    </button>
                    <Botao variante="fantasma" className="px-2 h-8 text-xs shrink-0" onClick={() => setOpcoesDe(p)}>
                      Opções{p.grupos?.length ? ` (${p.grupos.length})` : ""}
                    </Botao>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.disponivel === false}
                      aria-label={`${p.nome} esgotado`}
                      onClick={() => {
                        marcarEsgotado(p.id, p.disponivel !== false);
                        aviso(p.disponivel !== false ? `${p.nome} esgotado.` : `${p.nome} disponível.`, { tipo: "info" });
                      }}
                      className={`shrink-0 h-8 px-2 rounded-lg text-[11px] font-semibold ${
                        p.disponivel === false ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {p.disponivel === false ? "Esgotado" : "Disponível"}
                    </button>
                    <Botao
                      variante="fantasma"
                      className="w-8 h-8 text-sm hover:text-red-400"
                      aria-label={`Tirar ${p.nome} do cardápio`}
                      onClick={() => apagarProduto(p)}
                    >
                      ✕
                    </Botao>
                  </li>
                ))}
              </ul>
            )}

            <Botao
              variante="fantasma"
              className="mt-2 w-full py-2 text-sm border border-dashed border-zinc-700"
              onClick={() => setEditando({ categoriaId: cat.id })}
            >
              + Adicionar produto em {cat.nome}
            </Botao>
          </Cartao>
        );
      })}
    </Pagina>
  );
}
