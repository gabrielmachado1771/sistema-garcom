import { useMemo, useState } from "react";
import { FORMAS_PAGAMENTO } from "../store/regras";
import { moeda, plural } from "../utils/format";
import { PERIODOS, intervalo } from "../utils/periodo";
import { BarraLinha, Colunas } from "../components/graficos";
import { Botao, Cabecalho, Cartao, Pagina, TituloSecao, Vazio } from "../components/ui";
import useDadosAdmin from "./useDadosAdmin";

const nomeDia = (dia) => {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
};

function baixarCsv(empresas, periodo) {
  const linhas = [
    ["Restaurante", "Código", "Status", "Contas", "Total", "Taxa de serviço"],
    ...empresas.map((e) => [e.nome, e.slug, e.status, e.quantidade, String(e.total).replace(".", ","), String(e.taxas).replace(".", ",")]),
  ];
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `restaurantes-${periodo}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminRelatorios() {
  const [periodo, setPeriodo] = useState("30d");
  const [de, ate] = useMemo(() => intervalo(periodo), [periodo]);
  const { dados, erro, carregando } = useDadosAdmin("admin_relatorio", {
    p_de: new Date(de).toISOString(),
    p_ate: new Date(ate).toISOString(),
  });

  const empresas = dados?.empresas ?? [];
  const total = empresas.reduce((a, e) => a + Number(e.total), 0);
  const contas = empresas.reduce((a, e) => a + Number(e.quantidade), 0);
  const comVenda = empresas.filter((e) => e.quantidade > 0).length;
  const maxEmpresa = Math.max(0, ...empresas.map((e) => Number(e.total)));
  const formas = FORMAS_PAGAMENTO.map((f) => ({ ...f, valor: Number(dados?.porForma?.[f.id] ?? 0) })).filter((f) => f.valor > 0);
  const maxForma = Math.max(0, ...formas.map((f) => f.valor));

  return (
    <Pagina largura="max-w-5xl">
      <Cabecalho titulo="Relatórios" subtitulo="Todos os restaurantes juntos" />
      <div className="flex flex-wrap gap-2 items-center">
        {PERIODOS.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            aria-pressed={periodo === p.id}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              periodo === p.id ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {p.label}
          </button>
        ))}
        {empresas.length > 0 && (
          <Botao variante="fantasma" className="ml-auto px-3 py-1.5 text-sm" onClick={() => baixarCsv(empresas, periodo)}>
            ⬇ Baixar planilha (CSV)
          </Botao>
        )}
      </div>

      {erro ? (
        <Vazio icone="⚠️">{erro}</Vazio>
      ) : !dados ? (
        <div className="h-48 rounded-2xl bg-zinc-900 animate-pulse" aria-busy="true" />
      ) : (
        <div className={`space-y-4 ${carregando ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["Faturamento", moeda(total)],
              ["Contas fechadas", contas],
              ["Ticket médio", moeda(contas ? total / contas : 0)],
              ["Restaurantes com venda", `${comVenda}/${empresas.length}`],
            ].map(([r, v]) => (
              <Cartao key={r} className="p-3">
                <p className="text-xs text-zinc-400">{r}</p>
                <p className="text-xl font-bold tabular-nums">{v}</p>
              </Cartao>
            ))}
          </div>

          {contas === 0 ? (
            <Vazio icone="📊">Nenhuma venda neste período.</Vazio>
          ) : (
            <>
              <Cartao>
                <TituloSecao>Faturamento por dia (todos)</TituloSecao>
                <Colunas
                  titulo="Faturamento por dia"
                  dados={dados.porDia.map((d) => ({ chave: d.dia, eixo: nomeDia(d.dia), valor: Number(d.total), quantidade: d.quantidade }))}
                  rotulo={(d) => nomeDia(d.chave)}
                  dica={(d) => `${moeda(d.valor)} · ${plural(d.quantidade, "conta")}`}
                />
              </Cartao>
              <div className="grid gap-4 md:grid-cols-2">
                <Cartao>
                  <TituloSecao>Por restaurante</TituloSecao>
                  <div className="space-y-3">
                    {empresas.map((e) => (
                      <BarraLinha
                        key={e.id}
                        rotulo={e.nome}
                        valor={Number(e.total)}
                        max={maxEmpresa}
                        texto={`${moeda(e.total)} · ${plural(e.quantidade, "conta")}`}
                      />
                    ))}
                  </div>
                </Cartao>
                <Cartao>
                  <TituloSecao>Formas de pagamento</TituloSecao>
                  <div className="space-y-3">
                    {formas.map((f) => (
                      <BarraLinha
                        key={f.id}
                        rotulo={`${f.emoji} ${f.label}`}
                        valor={f.valor}
                        max={maxForma}
                        texto={`${moeda(f.valor)} · ${Math.round((f.valor / total) * 100)}%`}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-3">Dinheiro já sem o troco devolvido.</p>
                </Cartao>
              </div>
            </>
          )}
        </div>
      )}
    </Pagina>
  );
}
