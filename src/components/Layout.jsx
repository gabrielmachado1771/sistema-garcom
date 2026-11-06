import { useRestaurante } from "../store/contexto";
import { comandasNaCozinha, FUNCOES, podeAcessar } from "../store/regras";
import { Avatar } from "./ui";

const ABAS = [
  { area: "painel", label: "Painel", icone: "📊" },
  { area: "garcom", label: "Garçom", icone: "📝" },
  { area: "cozinha", label: "Cozinha", icone: "👨‍🍳" },
  { area: "caixa", label: "Caixa", icone: "💰" },
  { area: "equipe", label: "Equipe", icone: "👥" },
];

export default function Layout({ areaAtual, navegar, children }) {
  const { usuario, sair, mesas, modo, conexao } = useRestaurante();
  const abas = ABAS.filter((a) => podeAcessar(usuario, a.area));
  const contadores = {
    garcom: comandasNaCozinha(mesas, "pronto").length,
    cozinha: comandasNaCozinha(mesas, "preparo").length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white">
      <header className="sticky top-0 z-30 bg-zinc-950/85 backdrop-blur border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0" aria-hidden>
            🍽
          </span>

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
                    className={`relative shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${
                      ativa ? "bg-zinc-800 text-orange-400" : "text-zinc-400 hover:text-white hover:bg-zinc-900"
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
            {modo === "nuvem" && (
              <span
                title={conexao === "online" ? "Conectado ao banco de dados" : "Sem conexão — tentando novamente"}
                className={`w-2.5 h-2.5 rounded-full ${conexao === "online" ? "bg-green-500" : "bg-red-500 animate-pulse"}`}
              />
            )}
            <Avatar funcionario={usuario} tamanho="p" />
            <div className="hidden md:block leading-tight">
              <p className="text-sm font-semibold max-w-32 truncate">{usuario.nome}</p>
              <p className="text-[11px] text-zinc-500">{FUNCOES[usuario.funcao].label}</p>
            </div>
            <button
              type="button"
              onClick={sair}
              className="ml-1 px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
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
