import { useEffect, useMemo, useState } from "react";
import { useRestaurante } from "../store/contexto";
import { FORMAS_PAGAMENTO, descreverPagamento, gerarRelatorio } from "../store/regras";
import { dataHora, moeda, plural } from "../utils/format";
import { Botao, Cabecalho, Cartao, Pagina, TituloSecao, Vazio } from "../components/ui";
import { BarraLinha, Colunas } from "../components/graficos";
import { PERIODOS, intervalo } from "../utils/periodo";

const nomeDia = (dia) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const nomeDiaSemana = (dia) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

function Numero({ rotulo, valor, detalhe }) {
  return (
    <Cartao className="p-3">
      <p className="text-xs text-zinc-400">{rotulo}</p>
      <p className="text-xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500">{detalhe}</p>}
    </Cartao>
  );
}

function baixarCsv(vendas, periodo) {
  const linhas = [
    ["Data", "Mesa", "Garçom", "Caixa", "Subtotal", "Taxa", "Total", "Pagamento", "Itens"],
    ...vendas.map((v) => [
      new Date(v.data).toLocaleString("pt-BR"),
      v.mesa,
      v.atendente ?? "",
      v.operador ?? "",
      v.subtotal.toFixed(2).replace(".", ","),
      v.taxa.toFixed(2).replace(".", ","),
      v.total.toFixed(2).replace(".", ","),
      descreverPagamento(v),
      (v.itens ?? []).map((i) => `${i.qtd}x ${i.nome}`).join(" | "),
    ]),
  ];
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendas-${periodo}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Relatorios() {
  const { buscarRelatorio } = useRestaurante();
  const [periodo, setPeriodo] = useState("7d");
  const [atualizacao, setAtualizacao] = useState(0);
  const [resultado, setResultado] = useState({ chave: null, dados: null, erro: false });
  const chave = `${periodo}:${atualizacao}`;
  const [de, ate] = useMemo(() => intervalo(periodo), [periodo]);

  useEffect(() => {
    let ativo = true;
    buscarRelatorio(de, ate)
      .then((dados) => ativo && setResultado({ chave, dados, erro: false }))
      .catch(() => ativo && setResultado({ chave, dados: null, erro: true }));
    return () => {
      ativo = false;
    };
  }, [buscarRelatorio, de, ate, chave]);

  const carregando = resultado.chave !== chave;
  const vendas = useMemo(() => resultado.dados?.vendas ?? [], [resultado.dados]);
  const fechamentos = resultado.dados?.fechamentos ?? [];
  const r = useMemo(() => gerarRelatorio(vendas, de, ate), [vendas, de, ate]);

  const maxProduto = r.produtos[0]?.quantidade ?? 0;
  const maxGarcom = r.garcons[0]?.total ?? 0;
  const formas = FORMAS_PAGAMENTO.map((f) => ({ ...f, valor: r.porForma[f.id] })).filter((f) => f.valor > 0);
  const maxForma = Math.max(0, ...formas.map((f) => f.valor));
  const umDia = periodo === "hoje";

  return (
    <Pagina largura="max-w-5xl">
      <Cabecalho titulo="Relatórios" subtitulo="Vendas fechadas, inclusive de caixas já encerrados">
        <Botao className="px-3 py-2 text-sm" onClick={() => setAtualizacao((n) => n + 1)} disabled={carregando}>
          ↻ Atualizar
        </Botao>
      </Cabecalho>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            aria-pressed={periodo === p.id}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition ${
              periodo === p.id ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {p.label}
          </button>
        ))}
        {vendas.length > 0 && (
          <Botao variante="fantasma" className="ml-auto px-3 py-1.5 text-sm" onClick={() => baixarCsv(vendas, periodo)}>
            ⬇ Baixar planilha (CSV)
          </Botao>
        )}
      </div>

      {resultado.erro && !carregando ? (
        <Vazio icone="⚠️">Não foi possível carregar o relatório. Confira a conexão e toque em Atualizar.</Vazio>
      ) : carregando && !resultado.dados ? (
        <div className="flex justify-center py-16">
          <span className="w-8 h-8 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${carregando ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Numero rotulo="Faturamento" valor={moeda(r.total)} />
            <Numero rotulo="Contas fechadas" valor={r.quantidade} />
            <Numero rotulo="Ticket médio" valor={moeda(r.ticketMedio)} detalhe="por conta" />
            <Numero rotulo="Taxa de serviço" valor={moeda(r.taxas)} />
          </div>

          {r.quantidade === 0 ? (
            <Vazio icone="📊">Nenhuma venda neste período.</Vazio>
          ) : (
            <>
              <Cartao>
                <TituloSecao>{umDia ? "Faturamento por hora" : "Faturamento por dia"}</TituloSecao>
                {umDia ? (
                  <Colunas
                    titulo="Faturamento por hora"
                    dados={Array.from({ length: 24 }, (_, h) => {
                      const x = r.porHora.find((p) => p.hora === h);
                      return { chave: h, eixo: `${h}h`, valor: x?.total ?? 0, quantidade: x?.quantidade ?? 0 };
                    }).slice(
                      Math.max(0, Math.min(...r.porHora.map((h) => h.hora)) - 1),
                      Math.min(24, Math.max(...r.porHora.map((h) => h.hora)) + 2)
                    )}
                    rotulo={(d) => `${d.chave}h às ${d.chave + 1}h`}
                    dica={(d) => `${moeda(d.valor)} · ${plural(d.quantidade, "conta")}`}
                  />
                ) : (
                  <Colunas
                    titulo="Faturamento por dia"
                    dados={r.porDia.map((d) => ({ chave: d.dia, eixo: nomeDia(d.dia), valor: d.total, quantidade: d.quantidade }))}
                    rotulo={(d) => nomeDiaSemana(d.chave)}
                    dica={(d) => `${moeda(d.valor)} · ${plural(d.quantidade, "conta")}`}
                  />
                )}
                {!umDia && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-zinc-400 hover:text-white select-none">Ver em tabela</summary>
                    <table className="w-full mt-2 text-sm">
                      <thead>
                        <tr className="text-left text-xs text-zinc-500">
                          <th className="font-semibold py-1">Dia</th>
                          <th className="font-semibold py-1 text-right">Contas</th>
                          <th className="font-semibold py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {r.porDia
                          .filter((d) => d.quantidade > 0)
                          .map((d) => (
                            <tr key={d.dia}>
                              <td className="py-1.5">{nomeDiaSemana(d.dia)}</td>
                              <td className="py-1.5 text-right tabular-nums">{d.quantidade}</td>
                              <td className="py-1.5 text-right tabular-nums">{moeda(d.total)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </Cartao>

              <div className="grid gap-4 md:grid-cols-2">
                <Cartao>
                  <TituloSecao>Formas de pagamento</TituloSecao>
                  <div className="space-y-3">
                    {formas.map((f) => (
                      <BarraLinha
                        key={f.id}
                        rotulo={`${f.emoji} ${f.label}`}
                        valor={f.valor}
                        max={maxForma}
                        texto={`${moeda(f.valor)} · ${Math.round((f.valor / r.total) * 100)}%`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-3">Dinheiro já sem o troco devolvido.</p>
                </Cartao>

                <Cartao>
                  <TituloSecao>Vendas por garçom</TituloSecao>
                  <div className="space-y-3">
                    {r.garcons.map((g) => (
                      <BarraLinha
                        key={g.nome}
                        rotulo={g.nome}
                        valor={g.total}
                        max={maxGarcom}
                        texto={`${moeda(g.total)} · ${plural(g.quantidade, "conta")}`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-3">
                    Garçom que abriu a mesa. Taxa de serviço gerada:{" "}
                    {r.garcons.map((g) => `${g.nome.split(" ")[0]} ${moeda(g.taxa)}`).join(" · ")}
                  </p>
                </Cartao>
              </div>

              <Cartao>
                <TituloSecao>Produtos mais vendidos</TituloSecao>
                <div className="space-y-3">
                  {r.produtos.slice(0, 10).map((p, i) => (
                    <BarraLinha
                      key={p.produtoId}
                      rotulo={`${i + 1}. ${p.nome}`}
                      valor={p.quantidade}
                      max={maxProduto}
                      texto={`${p.quantidade} un · ${moeda(p.total)}`}
                    />
                  ))}
                </div>
                {r.produtos.length > 10 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-zinc-400 hover:text-white select-none">
                      Ver todos os {r.produtos.length} produtos
                    </summary>
                    <ul className="mt-2 divide-y divide-zinc-800/60">
                      {r.produtos.slice(10).map((p, i) => (
                        <li key={p.produtoId} className="py-1.5 flex justify-between gap-3">
                          <span>
                            {i + 11}. {p.nome}
                          </span>
                          <span className="tabular-nums text-zinc-400">
                            {p.quantidade} un · {moeda(p.total)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Cartao>
            </>
          )}

          {fechamentos.length > 0 && (
            <Cartao>
              <TituloSecao>Caixas fechados no período</TituloSecao>
              <ul className="divide-y divide-zinc-800/60 text-sm">
                {fechamentos.map((f) => (
                  <li key={f.id} className="py-2 flex justify-between gap-3">
                    <span>
                      {dataHora(f.data)}
                      {f.operador && <span className="text-zinc-500"> · {f.operador}</span>}
                    </span>
                    <span className="tabular-nums">
                      {plural(f.quantidade, "venda")} · <strong>{moeda(f.total)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      )}
    </Pagina>
  );
}
