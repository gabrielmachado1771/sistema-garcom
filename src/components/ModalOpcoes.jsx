import { useState } from "react";
import { centavos, validarOpcoes } from "../store/regras";
import { moeda } from "../utils/format";
import { Botao, Modal } from "./ui";

/** Escolher variações/adicionais de um produto antes de lançar (ex.: ponto da carne, bacon). */
export default function ModalOpcoes({ produto, onAdicionar, onFechar }) {
  const [escolhidas, setEscolhidas] = useState([]); // [{ id, grupo, nome, preco }]
  const [erro, setErro] = useState("");
  const total = centavos(produto.preco + escolhidas.reduce((a, o) => a + Number(o.preco), 0));

  function alternar(grupo, opcao) {
    setErro("");
    setEscolhidas((atual) => {
      const marcada = atual.some((o) => o.id === opcao.id);
      const doGrupo = atual.filter((o) => grupo.opcoes.some((x) => x.id === o.id));
      if (marcada) return atual.filter((o) => o.id !== opcao.id);
      const nova = { id: opcao.id, grupo: grupo.nome, nome: opcao.nome, preco: Number(opcao.preco) };
      // Grupo de escolha única: troca a opção. Grupo múltiplo: respeita o máximo.
      if (grupo.maximo === 1) return [...atual.filter((o) => !doGrupo.includes(o)), nova];
      if (doGrupo.length >= grupo.maximo) return atual;
      return [...atual, nova];
    });
  }

  function adicionar() {
    const problema = validarOpcoes(produto, escolhidas);
    if (problema) return setErro(problema);
    onAdicionar(escolhidas);
  }

  return (
    <Modal aberto titulo={produto.nome} onFechar={onFechar}>
      <div className="space-y-5">
        {produto.grupos.map((g) => {
          const n = escolhidas.filter((o) => g.opcoes.some((x) => x.id === o.id)).length;
          return (
            <fieldset key={g.id} className="space-y-2">
              <legend className="flex items-baseline justify-between w-full gap-2">
                <span className="font-semibold">{g.nome}</span>
                <span className={`text-xs ${g.obrigatorio && n === 0 ? "text-orange-400" : "text-zinc-500"}`}>
                  {g.obrigatorio ? "obrigatório · " : ""}
                  {g.maximo === 1 ? "escolha 1" : `até ${g.maximo} (${n}/${g.maximo})`}
                </span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {g.opcoes.map((o) => {
                  const marcada = escolhidas.some((x) => x.id === o.id);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      aria-pressed={marcada}
                      onClick={() => alternar(g, o)}
                      className={`min-h-12 rounded-xl px-3 py-2 text-sm text-left transition active:scale-95 border ${
                        marcada ? "bg-orange-500 text-black border-orange-500 font-semibold" : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      {o.nome}
                      {Number(o.preco) > 0 && <span className={`block text-xs ${marcada ? "text-black/70" : "text-zinc-400"}`}>+ {moeda(o.preco)}</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        {erro && (
          <p className="text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
        <Botao variante="primario" className="w-full py-3 flex justify-between px-5" onClick={adicionar}>
          <span>Adicionar</span>
          <span className="tabular-nums">{moeda(total)}</span>
        </Botao>
      </div>
    </Modal>
  );
}
