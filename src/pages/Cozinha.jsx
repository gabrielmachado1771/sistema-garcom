import { useRestaurante } from "../store/contexto";
import AtivarAvisos from "../components/AtivarAvisos";
import { chaveItem, comandasNaCozinha, descreverItem, descreverOpcoes, MINUTOS_ATRASO } from "../store/regras";
import PainelEsgotados from "../components/PainelEsgotados";
import { hora, minutosDesde, plural, tempoDecorrido } from "../utils/format";
import useAgora from "../hooks/useAgora";
import { Botao, Cabecalho, Etiqueta, Pagina, Vazio } from "../components/ui";

export default function Cozinha() {
  const { mesas, marcarPronto, voltarPreparo } = useRestaurante();
  const agora = useAgora(15000);

  const pendentes = comandasNaCozinha(mesas, "preparo");
  const prontos = comandasNaCozinha(mesas, "pronto");

  return (
    <Pagina largura="max-w-5xl">
      <Cabecalho
        titulo="Cozinha"
        subtitulo={`${plural(pendentes.length, "pedido")} em preparo · ${prontos.length} aguardando garçom`}
      />

      <AtivarAvisos texto="Receba um aviso quando chegar pedido novo, mesmo com esta tela em segundo plano." />
      <PainelEsgotados />

      {pendentes.length === 0 && (
        <Vazio icone="👨‍🍳">Nenhum pedido para preparar no momento.</Vazio>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
        {pendentes.map((c, idx) => {
          const minutos = minutosDesde(c.enviadaEm, agora);
          const atrasado = minutos >= MINUTOS_ATRASO;
          return (
            <article
              key={c.id}
              className={`bg-zinc-900/80 border rounded-2xl p-4 shadow-lg space-y-3 ${
                atrasado ? "border-red-500/60" : "border-yellow-500/25"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-orange-500">
                    {c.rotulo}
                    {c.numero > 1 && <span className="text-sm text-zinc-400 font-normal"> · pedido #{c.numero}</span>}
                  </h2>
                  <p className={`text-sm ${atrasado ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
                    {hora(c.enviadaEm)} · {tempoDecorrido(c.enviadaEm, agora)}
                  </p>
                  {c.atendente && <p className="text-xs text-zinc-500">Garçom: {c.atendente.nome}</p>}
                </div>
                {idx === 0 ? (
                  <Etiqueta cor="laranja">Próximo</Etiqueta>
                ) : atrasado ? (
                  <Etiqueta cor="vermelho">Atrasado</Etiqueta>
                ) : null}
              </div>

              <ul className="divide-y divide-zinc-800/60">
                {c.itens.map((item) => (
                  <li key={chaveItem(item)} className="py-2 flex gap-3 text-lg">
                    <span className="font-bold text-orange-400 tabular-nums w-8 shrink-0">{item.qtd}x</span>
                    <span className="min-w-0">
                      <span className="font-medium">{item.nome}</span>
                      {item.opcoes?.length > 0 && (
                        <span className="block text-sm font-semibold text-orange-300">{descreverOpcoes(item.opcoes)}</span>
                      )}
                      {item.obs && (
                        <span className="block text-sm font-semibold text-yellow-300">⚠️ {item.obs}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {c.observacao && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm">
                  <span className="text-zinc-400 font-semibold">Obs: </span>
                  <span className="text-yellow-300">{c.observacao}</span>
                </div>
              )}

              <Botao
                variante="sucesso"
                className="w-full py-3"
                onClick={() => marcarPronto(c.mesaId, c.id)}
              >
                ✓ Pedido pronto
              </Botao>
            </article>
          );
        })}
      </div>

      {prontos.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
            Prontos — aguardando o garçom
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {prontos.map((c) => (
              <div
                key={c.id}
                className="bg-zinc-900/50 border border-green-500/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-green-400">{c.rotulo}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    pronto {tempoDecorrido(c.prontaEm, agora)} · {c.itens.map((i) => `${i.qtd}x ${descreverItem(i)}`).join(", ")}
                  </p>
                </div>
                <Botao
                  variante="fantasma"
                  className="px-2 py-1 text-xs shrink-0"
                  onClick={() => voltarPreparo(c.mesaId, c.id)}
                >
                  Desfazer
                </Botao>
              </div>
            ))}
          </div>
        </section>
      )}
    </Pagina>
  );
}
