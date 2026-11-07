import { useEffect, useState } from "react";
import useHashRoute from "./hooks/useHashRoute";
import RestauranteProvider from "./store/RestauranteProvider";
import AvisosProvider from "./components/Avisos";
import Layout from "./components/Layout";
import Alertas from "./components/Alertas";
import { useRestaurante } from "./store/contexto";
import { areaInicial, podeAcessar } from "./store/regras";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import Garcom from "./pages/Garcom";
import Mesa from "./pages/Mesa";
import Cozinha from "./pages/Cozinha";
import Caixa from "./pages/Caixa";
import Conta from "./pages/Conta";
import Historico from "./pages/Historico";
import Equipe from "./pages/Equipe";
import Relatorios from "./pages/Relatorios";
import Cardapio from "./pages/Cardapio";

function Pagina({ area, param, navegar }) {
  const mesaId = Number(param) || null;
  switch (area) {
    case "garcom":
      return mesaId ? <Mesa key={mesaId} mesaId={mesaId} navegar={navegar} /> : <Garcom navegar={navegar} />;
    case "cozinha":
      return <Cozinha navegar={navegar} />;
    case "caixa":
      if (param === "historico") return <Historico navegar={navegar} />;
      return mesaId ? <Conta key={mesaId} mesaId={mesaId} navegar={navegar} /> : <Caixa navegar={navegar} />;
    case "equipe":
      return <Equipe navegar={navegar} />;
    case "relatorios":
      return <Relatorios />;
    case "cardapio":
      return <Cardapio />;
    default:
      return <Painel navegar={navegar} />;
  }
}

/** Link do restaurante (#/r/<codigo>): escolhe o restaurante e vai para o login dele. */
function EntradaPorLink({ codigo, navegar }) {
  const { definirRestaurante, restaurante, usuario, empresa, sair, modo } = useRestaurante();
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (modo === "local") return navegar();
      // Já logado em outro restaurante neste aparelho: sai antes de trocar.
      if (usuario && empresa?.slug && empresa.slug !== codigo) sair();
      if (restaurante === codigo && (!usuario || empresa?.slug === codigo)) return navegar();
      const r = await definirRestaurante(codigo);
      if (!ativo) return;
      if (r.ok) navegar();
      else setErro(r.erro);
    })();
    return () => {
      ativo = false;
    };
    // roda só quando o link muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  if (!erro) return <Carregando texto="Abrindo o restaurante…" />;
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-4xl" aria-hidden>
        🍽
      </p>
      <p className="text-lg font-semibold">
        {erro === "EMPRESA_SUSPENSA"
          ? "Este restaurante está suspenso."
          : erro === "EMPRESA_INVALIDA"
            ? "Restaurante não encontrado."
            : "Sem conexão com o servidor."}
      </p>
      <p className="text-sm text-zinc-400">
        {erro === "EMPRESA_INVALIDA" || erro === "EMPRESA_SUSPENSA"
          ? "Confira o link com o administrador do restaurante."
          : "Confira a internet e tente de novo."}
      </p>
      <div className="flex gap-2">
        {erro !== "EMPRESA_INVALIDA" && erro !== "EMPRESA_SUSPENSA" && (
          <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-orange-500 text-black font-semibold">
            Tentar de novo
          </button>
        )}
        <button type="button" onClick={() => navegar()} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700">
          Digitar o código
        </button>
      </div>
    </div>
  );
}

function Carregando({ texto }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3 text-zinc-400">
      <span className="w-10 h-10 border-4 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

function Rotas() {
  const { usuario, carregando, empresa } = useRestaurante();
  const [[tela, param], navegar] = useHashRoute();
  const area = tela || "painel";
  const permitido = podeAcessar(usuario, area);

  // Nome do restaurante na aba do navegador.
  useEffect(() => {
    document.title = empresa?.nome ? `${empresa.nome} · Sistema Restaurante` : "Sistema Restaurante";
  }, [empresa?.nome]);

  // Funcionário só enxerga a própria área: qualquer outra rota volta para ela.
  useEffect(() => {
    if (tela === "r") return;
    if (usuario && !permitido) {
      const inicial = areaInicial(usuario);
      navegar(inicial === "painel" ? undefined : inicial);
    }
  }, [usuario, permitido, navegar, tela]);

  if (tela === "r" && param) return <EntradaPorLink codigo={param} navegar={navegar} />;
  if (carregando) return <Carregando texto="Conectando ao banco de dados…" />;
  if (!usuario) return <Login />;
  if (!permitido) return null;

  return (
    <Layout areaAtual={area} navegar={navegar}>
      <Alertas area={area} />
      <Pagina key={area} area={area} param={param} navegar={navegar} />
    </Layout>
  );
}

export default function App() {
  return (
    <AvisosProvider>
      <RestauranteProvider>
        <Rotas />
      </RestauranteProvider>
    </AvisosProvider>
  );
}
