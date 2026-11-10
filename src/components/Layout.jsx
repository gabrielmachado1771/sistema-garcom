import { useRestaurante } from "../store/contexto";
import { comandasNaCozinha, FUNCOES, podeAcessar } from "../store/regras";
import { Avatar, BotaoTema } from "./ui";
import BotaoInstalar from "./BotaoInstalar";

const ABAS = [
  { area: "painel", label: "Painel", icone: "📊" },
  { area: "garcom", label: "Garçom", icone: "📝" },
  { area: "cozinha", label: "Cozinha", icone: "👨‍🍳" },
  { area: "caixa", label: "Caixa", icone: "💰" },
  { area: "relatorios", label: "Relatórios", icone: "📈" },
  { area: "cardapio", label: "Cardápio", icone: "🍽️" },
  { area: "equipe", label: "Equipe", icone: "👥" },
];

export default function Layout({ areaAtual, navegar, children }) {
  const { usuario, sair, mesas, modo, conexao, suporte, empresa } = useRestaurante();
  const abas = ABAS.filter((a) => podeAcessar(usuario, a.area));
  const contadores = {
    garcom: comandasNaCozinha(mesas, "pronto").length,
    cozinha: comandasNaCozinha(mesas, "preparo").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-tinta">
      {suporte && (
        <div
          role="status"
          className="sticky top-0 z-40 bg-yellow-400 text-black text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center"
        >
          <span>
            🛟 <b>Modo suporte</b> em {empresa?.nome} · aberto por {suporte} · tudo o que for feito fica registrado
          </span>
          <button
            type="button"
            onClick={() => {
              sair();
              window.location.hash = "#/admin";
            }}
            className="px-3 py-1 rounded-lg bg-black/80 text-yellow-300 font-semibold text-xs"
          >
            Encerrar suporte
          </button>
        </div>
      )}
      <header className={`sticky ${suporte ? "top-9" : "top-0"} z-30 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <span className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-orange-500/30" aria-hidden>
            🍽
          </span>
          {empresa?.nome && <span className="hidden lg:block font-bold tracking-tight max-w-40 truncate">{empresa.nome}</span>}

          {abas.length > 1 ? (
            <nav className="flex-1 min-w-0 flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Áreas">
              {abas.map((a) => {
                const ativa = a.area === areaAtual;
                const n = contadores[a.area];
                return (
                  <button
                    type="button"
                    key={a.area}
                    onClick={() => navegar(a.area === "painel" ? undefined : a.area)}
                    aria-current={ativa ? "page" : undefined}
                    className={`relative shrink-0 min-h-10 px-3 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 ${
                      ativa ? "bg-orange-500/15 text-orange-400" : "text-zinc-400 hover:text-tinta hover:bg-zinc-800"
                    }`}
                  >
                    <span aria-hidden>{a.icone}</span>
                    <span className="hidden sm:inline">{a.label}</span>
                    {n > 0 && (
                      <span className="min-w-5 h-5 px-1 rounded-full bg-orange-500 text-black text-[11px] font-bold flex items-center justify-center">
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          ) : (
            <p className="flex-1 font-bold text-orange-500 truncate">
              {FUNCOES[usuario.funcao].emoji} {FUNCOES[usuario.funcao].label}
            </p>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <BotaoInstalar compacto />
            <BotaoTema />
            {modo === "nuvem" && (
              <span
                title={conexao === "online" ? "Conectado ao banco de dados" : "Sem conexão — tentando novamente"}
                className={`w-2.5 h-2.5 rounded-full ${conexao === "online" ? "bg-green-500" : "bg-red-500 animate-pulse"}`}
              />
            )}
            <span className="hidden sm:flex">
              <Avatar funcionario={usuario} tamanho="p" />
            </span>
            <div className="hidden md:block leading-tight">
              <p className="text-sm font-semibold max-w-32 truncate">{usuario.nome}</p>
              <p className="text-[11px] text-zinc-500">{FUNCOES[usuario.funcao].label}</p>
            </div>
            <button
              type="button"
              onClick={sair}
              className="ml-1 min-h-10 px-3 rounded-xl text-sm font-semibold text-zinc-400 hover:text-tinta hover:bg-zinc-800 transition"
              title="Sair / trocar de usuário"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {modo === "nuvem" && conexao === "offline" && (
        <div className="bg-red-600 text-white text-sm text-center py-1.5 px-4">
          Sem conexão com o banco de dados. As alterações podem não ser salvas — tentando reconectar…
        </div>
      )}

      {children}
    </div>
  );
}
