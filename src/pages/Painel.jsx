import { useRestaurante } from "../store/contexto";
import {
  comandasNaCozinha,
  FUNCOES,
  descreverPagamento,
  mesaOcupada,
  statusMesa,
  totalMesa,
} from "../store/regras";
import { hora, moeda } from "../utils/format";
import { Cabecalho, Cartao, Pagina, TituloSecao } from "../components/ui";

function Indicador({ rotulo, valor, detalhe, cor = "text-white", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-zinc-900/80 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-4 text-left transition active:scale-[0.98]"
    >
      <p className="text-xs text-zinc-400">{rotulo}</p>
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500 mt-0.5">{detalhe}</p>}
    </button>
  );
}

const corMesa = {
  livre: "bg-zinc-800 text-zinc-500",
  ocupada: "bg-orange-500/20 text-orange-300 border border-orange-500/40",
  preparo: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  pronto: "bg-green-500/25 text-green-300 border border-green-500/50",
};

export default function Painel({ navegar }) {
  const { mesas, historico, funcionarios, usuario } = useRestaurante();

  const ocupadas = mesas.filter(mesaOcupada).length;
  const preparo = comandasNaCozinha(mesas, "preparo").length;
  const prontos = comandasNaCozinha(mesas, "pronto").length;
  const emAberto = mesas.reduce((acc, m) => acc + totalMesa(m), 0);
  const vendido = historico.reduce((acc, v) => acc + v.total, 0);
  const ticket = historico.length ? vendido / historico.length : 0;
  const ativos = funcionarios.filter((f) => f.ativo);

  const saudacao = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  })();

  return (
    <Pagina largura="max-w-5xl">
      <Cabecalho titulo={`${saudacao}, ${usuario.nome.split(" ")[0]}!`} subtitulo="Visão geral do restaurante agora" />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Indicador
          rotulo="Mesas ocupadas"
          valor={`${ocupadas}/${mesas.length}`}
          cor="text-orange-400"
          onClick={() => navegar("garcom")}
        />
        <Indicador
          rotulo="Na cozinha"
          valor={preparo}
          detalhe={prontos ? `${prontos} pronto(s) aguardando garçom` : "nenhum aguardando garçom"}
          cor="text-yellow-300"
          onClick={() => navegar("cozinha")}
        />
        <Indicador rotulo="Em aberto nas mesas" valor={moeda(emAberto)} onClick={() => navegar("caixa")} />
        <Indicador
          rotulo="Vendido hoje"
          valor={moeda(vendido)}
          detalhe={`${historico.length} conta(s) fechada(s)`}
          cor="text-green-400"
          onClick={() => navegar("caixa", "historico")}
        />
        <Indicador rotulo="Ticket médio" valor={moeda(ticket)} onClick={() => navegar("caixa", "historico")} />
        <Indicador
          rotulo="Equipe ativa"
          valor={ativos.length}
          detalhe={Object.entries(FUNCOES)
            .map(([id, f]) => `${ativos.filter((a) => a.funcao === id).length} ${f.label.toLowerCase()}`)
            .join(" · ")}
          onClick={() => navegar("equipe")}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Cartao>
          <TituloSecao>Mapa de mesas</TituloSecao>
          <div className="grid grid-cols-5 gap-2">
            {mesas.map((m) => {
              const st = statusMesa(m);
              return (
                <button
                  type="button"
                  key={m.id}
                  title={`Mesa ${m.numero} — ${st}`}
                  onClick={() => navegar("garcom", m.id)}
                  className={`aspect-square rounded-xl font-bold text-sm flex items-center justify-center transition hover:scale-105 ${corMesa[st]}`}
                >
                  {m.numero}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-zinc-400">
            <span>⬜ Livre</span>
            <span className="text-orange-300">■ Ocupada</span>
            <span className="text-yellow-300">■ Em preparo</span>
            <span className="text-green-300">■ Pronto</span>
          </div>
        </Cartao>

        <Cartao>
          <TituloSecao
            acao={
              historico.length > 0 && (
                <button type="button" className="text-xs text-orange-400 hover:underline" onClick={() => navegar("caixa", "historico")}>
                  Ver tudo →
                </button>
              )
            }
          >
            Últimas vendas
          </TituloSecao>
          {historico.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma conta fechada ainda.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {historico.slice(0, 5).map((v) => (
                <li key={v.id} className="py-2 flex justify-between text-sm gap-2">
                  <span>
                    Mesa {v.mesa}
                    <span className="text-zinc-500">
                      {" "}· {hora(v.data)} · {descreverPagamento(v)}
                    </span>
                  </span>
                  <span className="font-semibold text-green-400">{moeda(v.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </Pagina>
  );
}
