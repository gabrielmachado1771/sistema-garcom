import { useEffect } from "react";
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
    default:
      return <Painel navegar={navegar} />;
  }
}

function Rotas() {
  const { usuario } = useRestaurante();
  const [[tela, param], navegar] = useHashRoute();
  const area = tela || "painel";
  const permitido = podeAcessar(usuario, area);

  // Funcionário só enxerga a própria área: qualquer outra rota volta para ela.
  useEffect(() => {
    if (usuario && !permitido) {
      const inicial = areaInicial(usuario);
      navegar(inicial === "painel" ? undefined : inicial);
    }
  }, [usuario, permitido, navegar]);

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
