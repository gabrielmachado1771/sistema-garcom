import { useAviso, useRestaurante } from "../store/contexto";
import { FORMAS_PAGAMENTO, labelPagamento, pagamentosDaVenda, totaisPorForma } from "../store/regras";
import { dataHora, moeda, plural } from "../utils/format";
import { Botao, BotaoVoltar, Cabecalho, Cartao, Pagina, TituloSecao, Vazio } from "../components/ui";

export default function Historico({ navegar }) {
  const { historico, fecharCaixa } = useRestaurante();
  const aviso = useAviso();

  const total = historico.reduce((acc, v) => acc + v.total, 0);
  const taxas = historico.reduce((acc, v) => acc + v.taxa, 0);
  const ticketMedio = historico.length ? total / historico.length : 0;
  const totais = totaisPorForma(historico);
  const porForma = FORMAS_PAGAMENTO.map((f) => ({ ...f, valor: totais[f.id] })).filter((f) => f.valor > 0);

  function confirmarFechamento() {
    if (
      window.confirm(
        `Fechar o caixa com ${plural(historico.length, "venda")} (${moeda(total)})? ` +
          "A lista desta tela zera, mas as vendas continuam guardadas nos Relatórios."
      )
    ) {
      fecharCaixa();
      aviso("Caixa fechado. As vendas foram para os relatórios.", { tipo: "info" });
    }
  }

  return (
    <Pagina>
      <Cabecalho titulo="Histórico" subtitulo={plural(historico.length, "venda")}>
        <BotaoVoltar onClick={() => navegar("caixa")} />
      </Cabecalho>

      {historico.length === 0 ? (
        <Vazio icone="🧾">Nenhuma venda registrada.</Vazio>
      ) : (
        <>
          <Cartao className="bg-orange-500/10 border-orange-500/20 space-y-3">
            <div className="text-center">
              <p className="text-sm text-zinc-400">Total do dia</p>
              <p className="text-3xl font-bold text-orange-500">{moeda(total)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <div>
                <p className="text-zinc-400 text-xs">Ticket médio</p>
                <p className="font-semibold">{moeda(ticketMedio)}</p>
              </div>
              <div>
                <p className="text-zinc-400 text-xs">Taxa de serviço</p>
                <p className="font-semibold">{moeda(taxas)}</p>
              </div>
            </div>
            <div className="border-t border-orange-500/20 pt-3 space-y-1">
              {porForma.map((f) => (
                <div key={f.id} className="flex justify-between text-sm">
                  <span className="text-zinc-300">
                    {f.emoji} {f.label}
                  </span>
                  <span className="font-semibold">{moeda(f.valor)}</span>
                </div>
              ))}
            </div>
          </Cartao>

          <section>
            <TituloSecao>Vendas</TituloSecao>
            <div className="space-y-3">
              {historico.map((v) => (
                <Cartao key={v.id}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold">{v.rotulo ?? `Mesa ${v.mesa}`}</p>
                      <p className="text-xs text-zinc-500">{dataHora(v.data)}</p>
                      {(v.atendente || v.operador) && (
                        <p className="text-xs text-zinc-500">
                          {[v.atendente && `Garçom: ${v.atendente}`, v.operador && `Caixa: ${v.operador}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-orange-500 font-bold">{moeda(v.total)}</p>
                      {pagamentosDaVenda(v).length > 1 ? (
                        pagamentosDaVenda(v).map((p) => (
                          <p key={p.forma} className="text-xs text-zinc-400 tabular-nums">
                            {labelPagamento(p.forma)} {moeda(p.valor)}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-400">{labelPagamento(pagamentosDaVenda(v)[0].forma)}</p>
                      )}
                      {v.pessoas > 1 && <p className="text-xs text-zinc-400">{v.pessoas} pessoas</p>}
                      {v.troco > 0 && <p className="text-xs text-zinc-500">troco {moeda(v.troco)}</p>}
                      {v.desconto > 0 && (
                        <p className="text-xs text-yellow-300" title={v.descontoMotivo ?? ""}>
                          desconto {moeda(v.desconto)}
                          {v.descontoPor && ` · ${v.descontoPor}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400">
                    {v.itens.map((i) => `${i.qtd}x ${i.nome}`).join(" · ")}
                  </p>
                </Cartao>
              ))}
            </div>
          </section>

          <Botao variante="perigo" className="w-full py-3" onClick={confirmarFechamento}>
            Fechar caixa do dia
          </Botao>
        </>
      )}
    </Pagina>
  );
}
