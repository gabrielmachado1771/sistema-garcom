import { useEffect, useState } from "react";
import useDadosAdmin from "./useDadosAdmin";
import { moeda, plural, tempoDecorrido } from "../utils/format";
import { Botao, Cabecalho, Cartao, Etiqueta, Pagina, Vazio } from "../components/ui";
import { PLANOS } from "./textos";

function Numero({ rotulo, valor, detalhe }) {
  return (
    <Cartao className="p-3">
      <p className="text-xs text-zinc-400">{rotulo}</p>
      <p className="text-xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-[11px] text-zinc-500">{detalhe}</p>}
    </Cartao>
  );
}

export default function AdminRestaurantes({ navegar }) {
  const [atualizacao, setAtualizacao] = useState(0);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const { dados, erro, carregando } = useDadosAdmin("admin_painel", {}, [atualizacao]);

  // Atualiza sozinho a cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setAtualizacao((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const lista = dados ?? [];
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter(
    (e) =>
      (status === "todos" || e.status === status) &&
      (!termo || e.nome.toLowerCase().includes(termo) || e.slug.includes(termo))
  );
  const ativos = lista.filter((e) => e.status === "ativa");
  const soma = (campo) => lista.reduce((a, e) => a + Number(e[campo] || 0), 0);

  return (
    <Pagina largura="max-w-5xl">
      <Cabecalho titulo="Restaurantes" subtitulo={`${plural(lista.length, "restaurante")} · ${ativos.length} ativos`}>
        <Botao variante="primario" className="px-4 py-2 text-sm" onClick={() => navegar("admin", "novo")}>
          + Novo restaurante
        </Botao>
      </Cabecalho>

      {erro && <Vazio icone="⚠️">{erro}</Vazio>}

      {!dados && !erro ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ) : (
        dados && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Numero rotulo="Vendido hoje" valor={moeda(soma("vendasHoje"))} detalhe={plural(soma("contasHoje"), "conta")} />
              <Numero rotulo="Vendido no mês" valor={moeda(soma("vendasMes"))} detalhe={plural(soma("contasMes"), "conta")} />
              <Numero rotulo="Mesas abertas agora" valor={soma("mesasAbertas")} detalhe={`${moeda(soma("emAberto"))} em aberto`} />
              <Numero rotulo="Restaurantes ativos" valor={`${ativos.length}/${lista.length}`} />
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="search"
                placeholder="🔍 Buscar por nome ou código…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="flex-1 min-w-48 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
              {[
                ["todos", "Todos"],
                ["ativa", "Ativos"],
                ["suspensa", "Suspensos"],
              ].map(([id, rotulo]) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => setStatus(id)}
                  aria-pressed={status === id}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                    status === id ? "bg-orange-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
              {carregando && <span className="text-xs text-zinc-500">atualizando…</span>}
            </div>

            {visiveis.length === 0 ? (
              <Vazio icone="🏪">Nenhum restaurante encontrado.</Vazio>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {visiveis.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => navegar("admin", "empresa", e.id)}
                    className="text-left bg-zinc-900/80 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-4 transition active:scale-[0.99] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{e.nome}</p>
                        <p className="text-xs text-zinc-500">
                          {e.slug} · plano {PLANOS.find((p) => p.id === e.plano)?.label ?? e.plano}
                        </p>
                      </div>
                      {e.status === "ativa" ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta cor="vermelho">Suspenso</Etiqueta>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-zinc-800/60 rounded-xl py-2">
                        <p className="text-[11px] text-zinc-400">Hoje</p>
                        <p className="font-semibold text-sm tabular-nums">{moeda(e.vendasHoje)}</p>
                      </div>
                      <div className="bg-zinc-800/60 rounded-xl py-2">
                        <p className="text-[11px] text-zinc-400">Mês</p>
                        <p className="font-semibold text-sm tabular-nums">{moeda(e.vendasMes)}</p>
                      </div>
                      <div className="bg-zinc-800/60 rounded-xl py-2">
                        <p className="text-[11px] text-zinc-400">Mesas abertas</p>
                        <p className="font-semibold text-sm tabular-nums">
                          {e.mesasAbertas}/{e.mesas}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {plural(e.funcionarios, "funcionário")} · último acesso{" "}
                      {e.ultimoAcesso ? tempoDecorrido(e.ultimoAcesso) : "nunca"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )
      )}
    </Pagina>
  );
}
