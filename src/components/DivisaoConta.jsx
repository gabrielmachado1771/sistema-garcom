import { useState } from "react";
import { FORMAS_PAGAMENTO, dividirPorItens, unidadesDaConta } from "../store/regras";
import { moeda } from "../utils/format";
import { Botao, Cartao, TituloSecao } from "./ui";

const MAX_PESSOAS = 20;

/**
 * Divisão da conta entre pessoas:
 * - "Igual": cada um paga a mesma parte;
 * - "Por itens": marca o que cada um consumiu; o que ficar sem dono é dividido entre todos.
 * Em cada pessoa dá para tocar na forma de pagamento para lançar a parte dela no pagamento.
 */
export default function DivisaoConta({ mesa, pessoas, setPessoas, comTaxa, onLancar }) {
  const [modo, setModo] = useState("igual");
  const [atribuicao, setAtribuicao] = useState({}); // chave da unidade -> número da pessoa
  const [pessoaAtiva, setPessoaAtiva] = useState(0);
  const [pagos, setPagos] = useState({}); // número da pessoa -> { forma, valor }

  const unidades = unidadesDaConta(mesa);
  const partes = dividirPorItens(unidades, modo === "itens" ? atribuicao : {}, pessoas, comTaxa);
  const semDono = modo === "itens" ? unidades.filter((u) => atribuicao[u.chave] == null).length : 0;

  function mudarPessoas(n) {
    if (n < 1 || n > MAX_PESSOAS) return;
    setPessoas(n);
    setPessoaAtiva((p) => Math.min(p, n - 1));
    // Itens de quem saiu voltam a ser "da mesa".
    setAtribuicao((a) => Object.fromEntries(Object.entries(a).filter(([, p]) => p < n)));
  }

  function alternarUnidade(chave) {
    setAtribuicao((a) => {
      const novo = { ...a };
      if (novo[chave] === pessoaAtiva) delete novo[chave];
      else novo[chave] = pessoaAtiva;
      return novo;
    });
  }

  function lancar(pessoa, forma, valor) {
    const atual = pagos[pessoa];
    if (atual) onLancar(atual.forma, -atual.valor); // desfaz o lançamento anterior desta pessoa
    // Tocar de novo na mesma forma (com o mesmo valor) desmarca.
    if (atual?.forma === forma && Math.abs(atual.valor - valor) < 0.005) {
      setPagos((p) => Object.fromEntries(Object.entries(p).filter(([k]) => Number(k) !== pessoa)));
      return;
    }
    onLancar(forma, valor);
    setPagos((p) => ({ ...p, [pessoa]: { forma, valor } }));
  }

  // Agrupa as unidades por produto para mostrar "2x Coca: [1] [2]".
  const porProduto = [];
  for (const u of unidades) {
    const grupo = porProduto.find((g) => g.produtoId === u.produtoId);
    if (grupo) grupo.unidades.push(u);
    else porProduto.push({ produtoId: u.produtoId, nome: u.nome, preco: u.preco, unidades: [u] });
  }

  return (
    <Cartao className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <TituloSecao>Dividir a conta</TituloSecao>
        <div className="flex items-center gap-2 -mt-3">
          <Botao className="w-9 h-9" aria-label="Menos uma pessoa" disabled={pessoas <= 1} onClick={() => mudarPessoas(pessoas - 1)}>
            −
          </Botao>
          <span className="w-20 text-center font-semibold tabular-nums text-sm">
            {pessoas} {pessoas === 1 ? "pessoa" : "pessoas"}
          </span>
          <Botao
            className="w-9 h-9"
            aria-label="Mais uma pessoa"
            disabled={pessoas >= MAX_PESSOAS}
            onClick={() => mudarPessoas(pessoas + 1)}
          >
            +
          </Botao>
        </div>
      </div>

      {pessoas > 1 && (
        <>
          <div className="grid grid-cols-2 gap-1 bg-zinc-800/60 p-1 rounded-xl" role="tablist">
            {[
              ["igual", "Partes iguais"],
              ["itens", "Cada um paga o seu"],
            ].map(([id, rotulo]) => (
              <button
                type="button"
                key={id}
                role="tab"
                aria-selected={modo === id}
                onClick={() => setModo(id)}
                className={`py-2 rounded-lg text-sm font-semibold transition ${
                  modo === id ? "bg-orange-500 text-black" : "text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {modo === "itens" && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-zinc-400 mb-2">1. Escolha a pessoa</p>
                <div className="flex flex-wrap gap-2">
                  {partes.map((p) => (
                    <button
                      type="button"
                      key={p.pessoa}
                      onClick={() => setPessoaAtiva(p.pessoa)}
                      aria-pressed={pessoaAtiva === p.pessoa}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
                        pessoaAtiva === p.pessoa ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      Pessoa {p.pessoa + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-2">
                  2. Toque no que a <strong className="text-orange-400">Pessoa {pessoaAtiva + 1}</strong> consumiu
                </p>
                <ul className="divide-y divide-zinc-800/60">
                  {porProduto.map((g) => (
                    <li key={g.produtoId} className="py-2 flex items-center justify-between gap-3">
                      <span className="text-sm min-w-0">
                        {g.nome}
                        <span className="text-xs text-zinc-500"> ({moeda(g.preco)})</span>
                      </span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {g.unidades.map((u) => {
                          const dono = atribuicao[u.chave];
                          const daAtiva = dono === pessoaAtiva;
                          return (
                            <button
                              type="button"
                              key={u.chave}
                              onClick={() => alternarUnidade(u.chave)}
                              aria-label={`${u.nome}: ${dono == null ? "da mesa" : `Pessoa ${dono + 1}`}`}
                              className={`min-w-9 h-9 px-2 rounded-lg text-xs font-bold transition active:scale-95 ${
                                daAtiva
                                  ? "bg-orange-500 text-black"
                                  : dono != null
                                    ? "bg-zinc-700 text-zinc-200"
                                    : "border border-dashed border-zinc-600 text-zinc-500 hover:border-zinc-400"
                              }`}
                            >
                              {dono == null ? "mesa" : `P${dono + 1}`}
                            </button>
                          );
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
                {semDono > 0 && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Itens marcados como “mesa” ({semDono}) são divididos igualmente entre todos.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-zinc-400">
              {modo === "itens" ? "3. " : ""}Quanto cada um paga — toque na forma para lançar no pagamento
            </p>
            {partes.map((p) => {
              const pago = pagos[p.pessoa];
              const mudou = pago && Math.abs(pago.valor - p.total) > 0.004;
              return (
                <div
                  key={p.pessoa}
                  className={`rounded-xl p-3 border ${pago ? "border-green-500/40 bg-green-500/5" : "border-zinc-800 bg-zinc-800/40"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-sm">
                      Pessoa {p.pessoa + 1}
                      {pago && <span className="text-green-400"> ✓ pago</span>}
                    </span>
                    <span className="font-bold tabular-nums">{moeda(p.total)}</span>
                  </div>
                  {modo === "itens" && (
                    <p className="text-[11px] text-zinc-500">
                      {moeda(p.proprio)} em itens próprios
                      {p.compartilhado > 0 && ` + ${moeda(p.compartilhado)} da mesa`}
                      {p.taxa > 0 && ` + ${moeda(p.taxa)} de taxa`}
                    </p>
                  )}
                  {mudou && (
                    <p className="text-[11px] text-yellow-300">
                      Lançado {moeda(pago.valor)}, mas o valor mudou. Toque na forma de novo para atualizar.
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    {FORMAS_PAGAMENTO.map((f) => (
                      <button
                        type="button"
                        key={f.id}
                        disabled={p.total <= 0}
                        onClick={() => lancar(p.pessoa, f.id, p.total)}
                        aria-pressed={pago?.forma === f.id}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition disabled:opacity-30 ${
                          pago?.forma === f.id ? "bg-green-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        <span aria-hidden>{f.emoji}</span> {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Cartao>
  );
}
