import { moeda } from "../../utils/format";

/**
 * Passo "quem consumiu o quê": escolhe a pessoa e toca nos itens dela.
 * Itens sem dono ficam "da mesa" e são divididos entre todos.
 */
export default function QuemConsumiu({ unidades, atribuicao, partes, pessoaAtiva, setPessoaAtiva, onAlternar, onLimpar, nomes }) {
  const porProduto = [];
  for (const u of unidades) {
    const grupo = porProduto.find((g) => g.produtoId === u.produtoId);
    if (grupo) grupo.unidades.push(u);
    else porProduto.push({ produtoId: u.produtoId, nome: u.nome, preco: u.preco, unidades: [u] });
  }
  const semDono = unidades.filter((u) => atribuicao[u.chave] == null).length;
  const algumMarcado = unidades.length > semDono;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-zinc-300 mb-2">
          <strong className="text-orange-400">1.</strong> Toque na pessoa…
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {partes.map((p) => {
            const ativa = pessoaAtiva === p.pessoa;
            return (
              <button
                type="button"
                key={p.pessoa}
                onClick={() => setPessoaAtiva(p.pessoa)}
                aria-pressed={ativa}
                className={`rounded-xl px-3 py-2 text-left transition active:scale-95 border ${
                  ativa ? "bg-orange-500 text-black border-orange-500" : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
                }`}
              >
                <span className="block text-sm font-bold truncate">{nomes[p.pessoa]}</span>
                <span className={`block text-xs tabular-nums ${ativa ? "text-black/70" : "text-zinc-400"}`}>{moeda(p.total)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-sm text-zinc-300">
            <strong className="text-orange-400">2.</strong> …e depois no que <strong>{nomes[pessoaAtiva]}</strong> consumiu
          </p>
          {algumMarcado && (
            <button type="button" onClick={onLimpar} className="text-xs text-zinc-500 hover:text-tinta shrink-0">
              Limpar
            </button>
          )}
        </div>
        <ul className="divide-y divide-zinc-800/60">
          {porProduto.map((g) => (
            <li key={g.produtoId} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm min-w-0">
                {g.nome}
                <span className="block text-xs text-zinc-500">{moeda(g.preco)} cada</span>
              </span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {g.unidades.map((u) => {
                  const dono = atribuicao[u.chave];
                  const daAtiva = dono === pessoaAtiva;
                  return (
                    <button
                      type="button"
                      key={u.chave}
                      onClick={() => onAlternar(u.chave)}
                      aria-label={`${u.nome}: ${dono == null ? "dividido entre todos" : nomes[dono]}`}
                      className={`h-10 min-w-12 max-w-24 px-2 rounded-lg text-xs font-bold transition active:scale-95 truncate ${
                        daAtiva
                          ? "bg-orange-500 text-black"
                          : dono != null
                            ? "bg-zinc-700 text-zinc-300"
                            : "border-2 border-dashed border-zinc-600 text-zinc-500 hover:border-orange-500/60"
                      }`}
                    >
                      {dono == null ? "todos" : nomes[dono].replace("Pessoa ", "P")}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500 mt-2">
          {semDono > 0
            ? `💡 ${semDono === unidades.length ? "Nada marcado ainda: " : ""}itens marcados como “todos” são divididos igualmente (ex.: uma porção para a mesa).`
            : "✓ Todos os itens têm dono."}
        </p>
      </div>
    </div>
  );
}
