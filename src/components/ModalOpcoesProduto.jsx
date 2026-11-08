import { useState } from "react";
import { Botao, Modal } from "./ui";

const MODELOS = [
  {
    rotulo: "Ponto da carne",
    grupo: { nome: "Ponto da carne", obrigatorio: true, maximo: 1, opcoes: ["Mal passada", "Ao ponto", "Bem passada"].map((nome) => ({ nome, preco: "0" })) },
  },
  {
    rotulo: "Tamanho",
    grupo: { nome: "Tamanho", obrigatorio: true, maximo: 1, opcoes: [{ nome: "Pequeno", preco: "0" }, { nome: "Médio", preco: "5" }, { nome: "Grande", preco: "10" }] },
  },
  {
    rotulo: "Adicionais",
    grupo: { nome: "Adicionais", obrigatorio: false, maximo: 3, opcoes: [{ nome: "Bacon", preco: "5" }, { nome: "Queijo", preco: "4" }, { nome: "Ovo", preco: "3" }] },
  },
  {
    rotulo: "Borda",
    grupo: { nome: "Borda", obrigatorio: false, maximo: 1, opcoes: [{ nome: "Catupiry", preco: "8" }, { nome: "Cheddar", preco: "8" }] },
  },
];

const entrada =
  "bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500 min-w-0";

/** Editor das variações e adicionais de um produto (admin). */
export default function ModalOpcoesProduto({ produto, onSalvar, onFechar }) {
  const [grupos, setGrupos] = useState(() =>
    (produto.grupos ?? []).map((g) => ({
      ...g,
      opcoes: g.opcoes.map((o) => ({ nome: o.nome, preco: String(o.preco).replace(".", ",") })),
    }))
  );
  const [erro, setErro] = useState("");

  const mudarGrupo = (i, dados) => setGrupos((gs) => gs.map((g, j) => (j === i ? { ...g, ...dados } : g)));
  const mudarOpcao = (i, k, dados) =>
    mudarGrupo(i, { opcoes: grupos[i].opcoes.map((o, j) => (j === k ? { ...o, ...dados } : o)) });

  function salvar() {
    for (const g of grupos) {
      if (!g.nome.trim()) return setErro("Dê um nome para cada grupo.");
      const validas = g.opcoes.filter((o) => o.nome.trim());
      if (!validas.length) return setErro(`O grupo “${g.nome}” precisa de pelo menos uma opção.`);
      if (validas.some((o) => !(Number(String(o.preco).replace(",", ".")) >= 0))) return setErro(`Preço inválido em “${g.nome}”.`);
    }
    onSalvar(
      grupos.map((g) => ({
        nome: g.nome.trim(),
        obrigatorio: g.obrigatorio,
        maximo: Math.min(20, Math.max(1, Math.trunc(Number(g.maximo)) || 1)),
        opcoes: g.opcoes
          .filter((o) => o.nome.trim())
          .map((o) => ({ nome: o.nome.trim(), preco: Number(String(o.preco || "0").replace(",", ".")) })),
      }))
    );
  }

  return (
    <Modal aberto titulo={`Opções — ${produto.nome}`} onFechar={onFechar}>
      <div className="space-y-4">
        <p className="text-xs text-zinc-400">
          Ex.: “Ponto da carne” (obrigatório, escolhe 1) ou “Adicionais” (opcional, até 3, com preço). O garçom escolhe ao lançar.
        </p>
        {grupos.length === 0 && <p className="text-sm text-zinc-500">Este produto não tem opções.</p>}
        {grupos.map((g, i) => (
          <fieldset key={i} className="rounded-xl border border-zinc-800 p-3 space-y-2">
            <div className="flex gap-2">
              <input
                aria-label="Nome do grupo"
                placeholder="Nome do grupo"
                value={g.nome}
                maxLength={40}
                onChange={(e) => mudarGrupo(i, { nome: e.target.value })}
                className={`${entrada} flex-1 font-semibold`}
              />
              <Botao variante="fantasma" className="px-2 text-xs hover:text-red-400" onClick={() => setGrupos((gs) => gs.filter((_, j) => j !== i))}>
                Remover
              </Botao>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={g.obrigatorio} onChange={(e) => mudarGrupo(i, { obrigatorio: e.target.checked })} className="accent-orange-500 w-4 h-4" />
                Obrigatório
              </label>
              <label className="flex items-center gap-2">
                Escolhe até
                <input
                  inputMode="numeric"
                  value={g.maximo}
                  onChange={(e) => mudarGrupo(i, { maximo: e.target.value.replace(/\D/g, "") })}
                  className={`${entrada} w-12 text-center`}
                  aria-label="Máximo de escolhas"
                />
              </label>
            </div>
            <ul className="space-y-1.5">
              {g.opcoes.map((o, k) => (
                <li key={k} className="flex gap-2 items-center">
                  <input
                    aria-label="Nome da opção"
                    placeholder="Opção"
                    value={o.nome}
                    maxLength={40}
                    onChange={(e) => mudarOpcao(i, k, { nome: e.target.value })}
                    className={`${entrada} flex-1`}
                  />
                  <span className="text-xs text-zinc-500">+R$</span>
                  <input
                    aria-label="Preço extra"
                    inputMode="decimal"
                    value={o.preco}
                    onChange={(e) => mudarOpcao(i, k, { preco: e.target.value })}
                    className={`${entrada} w-16 text-right`}
                  />
                  <button
                    type="button"
                    aria-label="Remover opção"
                    onClick={() => mudarGrupo(i, { opcoes: g.opcoes.filter((_, j) => j !== k) })}
                    className="w-8 h-8 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => mudarGrupo(i, { opcoes: [...g.opcoes, { nome: "", preco: "0" }] })}
              className="text-xs text-orange-400 hover:underline"
            >
              + opção
            </button>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 w-full">Adicionar grupo:</span>
          {MODELOS.map((m) => (
            <button
              type="button"
              key={m.rotulo}
              onClick={() => setGrupos((gs) => [...gs, structuredClone(m.grupo)])}
              className="px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs"
            >
              + {m.rotulo}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setGrupos((gs) => [...gs, { nome: "", obrigatorio: false, maximo: 1, opcoes: [{ nome: "", preco: "0" }] }])}
            className="px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs"
          >
            + Em branco
          </button>
        </div>
        {erro && (
          <p className="text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
        <Botao variante="primario" className="w-full py-3" onClick={salvar}>
          Salvar opções
        </Botao>
      </div>
    </Modal>
  );
}
