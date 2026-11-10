import { useState } from "react";
import { useAviso, useRestaurante } from "../store/contexto";
import {
  comandasNaCozinha,
  FUNCOES,
  MAX_MESAS,
  mesasDoSalao,
  descreverPagamento,
  mesaOcupada,
  statusMesa,
  totalMesa,
} from "../store/regras";
import { hora, moeda } from "../utils/format";
import { Botao, Cabecalho, Cartao, Pagina, TituloSecao } from "../components/ui";
import { linkDoRestaurante } from "../utils/codigo";

/** Nome, taxa de serviço e link do restaurante. */
function ConfigRestaurante() {
  const { empresa, configurarEmpresa, modo } = useRestaurante();
  const aviso = useAviso();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState("");
  const [taxa, setTaxa] = useState("");
  if (!empresa) return null;
  const link = empresa.slug ? linkDoRestaurante(empresa.slug) : null;
  const pct = Math.round((empresa.taxaServico ?? 0.1) * 1000) / 10;

  function abrir() {
    setNome(empresa.nome);
    setTaxa(String(pct).replace(".", ","));
    setEditando(true);
  }

  function salvar(e) {
    e.preventDefault();
    const valor = Number(taxa.replace(",", "."));
    if (!nome.trim()) return aviso("Informe o nome do restaurante.", { tipo: "erro" });
    if (!(valor >= 0 && valor <= 30)) return aviso("A taxa precisa ficar entre 0% e 30%.", { tipo: "erro" });
    configurarEmpresa({ nome: nome.trim(), taxa: valor / 100 });
    aviso("Dados do restaurante salvos.");
    setEditando(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      aviso("Link copiado! Mande para a sua equipe.");
    } catch {
      window.prompt("Copie o link do restaurante:", link);
    }
  }

  return (
    <Cartao>
      <TituloSecao
        acao={
          !editando && (
            <button type="button" className="text-xs text-orange-400 hover:underline" onClick={abrir}>
              Editar
            </button>
          )
        }
      >
        Restaurante
      </TituloSecao>
      {editando ? (
        <form onSubmit={salvar} className="space-y-3">
          <label className="block">
            <span className="text-xs text-zinc-400">Nome</span>
            <input
              value={nome}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400">Taxa de serviço (%)</span>
            <input
              inputMode="decimal"
              value={taxa}
              onChange={(e) => setTaxa(e.target.value)}
              className="mt-1 w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
          </label>
          <div className="flex gap-2">
            <Botao variante="fantasma" className="flex-1 py-2 text-sm" onClick={() => setEditando(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" variante="primario" className="flex-1 py-2 text-sm">
              Salvar
            </Botao>
          </div>
        </form>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="flex justify-between gap-3">
            <span className="text-zinc-400">Nome</span>
            <span className="font-semibold text-right">{empresa.nome}</span>
          </p>
          <p className="flex justify-between gap-3">
            <span className="text-zinc-400">Taxa de serviço</span>
            <span className="font-semibold">{String(pct).replace(".", ",")}%</span>
          </p>
          {modo === "nuvem" && link && (
            <div className="pt-2 border-t border-zinc-800">
              <p className="text-zinc-400 text-xs mb-1">
                Link da equipe (código <b className="text-zinc-200">{empresa.slug}</b>)
              </p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 truncate bg-zinc-800 rounded-lg px-2 py-1.5 text-xs">{link}</code>
                <Botao className="px-3 py-1.5 text-xs shrink-0" onClick={copiar}>
                  Copiar
                </Botao>
              </div>
            </div>
          )}
        </div>
      )}
    </Cartao>
  );
}

/** Admin escolhe quantas mesas o restaurante tem. */
function QuantidadeMesas({ mesas, onFechar }) {
  const { definirMesas } = useRestaurante();
  const aviso = useAviso();
  const [qtd, setQtd] = useState(mesas.length);
  const ocupadasForaDoLimite = mesas.filter((m) => m.numero > qtd && mesaOcupada(m));

  function salvar() {
    if (ocupadasForaDoLimite.length > 0) return;
    definirMesas(qtd);
    aviso(`O restaurante agora tem ${qtd} mesas.`);
    onFechar();
  }

  return (
    <div className="mb-3 rounded-xl bg-zinc-800/60 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-300">Quantidade de mesas</span>
        <div className="flex items-center gap-2">
          <Botao className="w-9 h-9" aria-label="Menos uma mesa" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)}>
            −
          </Botao>
          <input
            type="number"
            min={1}
            max={MAX_MESAS}
            value={qtd}
            onChange={(e) => setQtd(Math.min(MAX_MESAS, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
            className="w-14 bg-zinc-900 border border-zinc-700 rounded-lg py-1.5 text-center font-bold tabular-nums focus:outline-none focus:border-orange-500"
            aria-label="Quantidade de mesas"
          />
          <Botao className="w-9 h-9" aria-label="Mais uma mesa" disabled={qtd >= MAX_MESAS} onClick={() => setQtd(qtd + 1)}>
            +
          </Botao>
        </div>
      </div>
      {ocupadasForaDoLimite.length > 0 && (
        <p className="text-xs text-red-400">
          {ocupadasForaDoLimite.length === 1 ? "A mesa" : "As mesas"}{" "}
          {ocupadasForaDoLimite.map((m) => m.numero).join(", ")} {ocupadasForaDoLimite.length === 1 ? "está ocupada" : "estão ocupadas"}.
          Feche a conta ou transfira antes de diminuir.
        </p>
      )}
      <div className="flex gap-2">
        <Botao variante="fantasma" className="flex-1 py-2 text-sm" onClick={onFechar}>
          Cancelar
        </Botao>
        <Botao
          variante="primario"
          className="flex-1 py-2 text-sm"
          disabled={qtd === mesas.length || ocupadasForaDoLimite.length > 0}
          onClick={salvar}
        >
          Salvar
        </Botao>
      </div>
    </div>
  );
}

function Indicador({ rotulo, valor, detalhe, cor = "text-tinta", onClick }) {
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
  const { mesas: todas, historico, funcionarios, usuario, empresa } = useRestaurante();
  const mesas = mesasDoSalao(todas);

  const ocupadas = mesas.filter(mesaOcupada).length;
  const preparo = comandasNaCozinha(todas, "preparo").length;
  const prontos = comandasNaCozinha(todas, "pronto").length;
  const emAberto = todas.reduce((acc, m) => acc + totalMesa(m), 0);
  const vendido = historico.reduce((acc, v) => acc + v.total, 0);
  const ticket = historico.length ? vendido / historico.length : 0;
  const ativos = funcionarios.filter((f) => f.ativo);
  const [editandoMesas, setEditandoMesas] = useState(false);

  const saudacao = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  })();

  return (
    <Pagina largura="max-w-5xl">
      <Cabecalho titulo={`${saudacao}, ${usuario.nome.split(" ")[0]}!`} subtitulo={`Visão geral do ${empresa?.nome ?? "restaurante"} agora`} />

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
          rotulo="Vendido no caixa aberto"
          valor={moeda(vendido)}
          detalhe={`${historico.length} conta(s) fechada(s) · ver relatórios`}
          cor="text-green-400"
          onClick={() => navegar("relatorios")}
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
          <TituloSecao
            acao={
              !editandoMesas && (
                <button type="button" className="text-xs text-orange-400 hover:underline" onClick={() => setEditandoMesas(true)}>
                  Mudar quantidade
                </button>
              )
            }
          >
            Mapa de mesas
          </TituloSecao>
          {editandoMesas && <QuantidadeMesas mesas={mesas} onFechar={() => setEditandoMesas(false)} />}
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
                    {v.rotulo ?? `Mesa ${v.mesa}`}
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

      <div className="grid md:grid-cols-2 gap-4">
        <ConfigRestaurante />
      </div>
    </Pagina>
  );
}
