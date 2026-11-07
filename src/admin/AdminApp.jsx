import { useCallback, useEffect, useState } from "react";
import { clienteAdmin, rpcAdmin } from "../store/supabaseAdmin";
import { AdminCadastro2fa, AdminCodigo2fa, AdminLogin, AdminSemBanco, AdminSemPermissao } from "./AdminAcesso";
import AdminRestaurantes from "./AdminRestaurantes";
import AdminNovo from "./AdminNovo";
import AdminEmpresa from "./AdminEmpresa";
import AdminRelatorios from "./AdminRelatorios";
import AdminAuditoria from "./AdminAuditoria";

const ABAS = [
  { id: undefined, label: "Restaurantes", icone: "🏪" },
  { id: "relatorios", label: "Relatórios", icone: "📈" },
  { id: "auditoria", label: "Auditoria", icone: "📋" },
];

function Carregando() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <span className="w-10 h-10 border-4 border-zinc-700 border-t-purple-500 rounded-full animate-spin" aria-label="Carregando" />
    </div>
  );
}

/**
 * Portal do dono do sistema (#/admin).
 * Fluxo: e-mail e senha → 2FA (cadastra na primeira vez) → painel.
 */
export default function AdminApp({ rota, navegar }) {
  const sb = clienteAdmin();
  const [fase, setFase] = useState("carregando"); // carregando | login | cadastro2fa | codigo2fa | sem-permissao | pronto
  const [eu, setEu] = useState(null);

  const avaliar = useCallback(async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) return setFase("login");
    try {
      setEu(await rpcAdmin("admin_eu"));
    } catch (e) {
      if (e?.message?.includes("SEM_PERMISSAO")) return setFase("sem-permissao");
      await sb.auth.signOut();
      return setFase("login");
    }
    const { data: nivel } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.currentLevel === "aal2") return setFase("pronto");
    setFase(nivel?.nextLevel === "aal2" ? "codigo2fa" : "cadastro2fa");
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    let ativo = true;
    (async () => {
      await Promise.resolve();
      if (ativo) avaliar();
    })();
    return () => {
      ativo = false;
    };
  }, [sb, avaliar]);

  const sair = useCallback(async () => {
    await sb.auth.signOut();
    setEu(null);
    setFase("login");
  }, [sb]);

  if (!sb) return <AdminSemBanco />;
  if (fase === "carregando") return <Carregando />;
  if (fase === "login") return <AdminLogin onEntrou={avaliar} />;
  if (fase === "sem-permissao") return <AdminSemPermissao onSair={sair} />;
  if (fase === "cadastro2fa") return <AdminCadastro2fa onOk={avaliar} onSair={sair} />;
  if (fase === "codigo2fa") return <AdminCodigo2fa onOk={avaliar} onSair={sair} />;

  const [, secao, id] = rota;
  const abaAtiva = secao === "relatorios" || secao === "auditoria" ? secao : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white">
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-purple-900/50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center shrink-0" aria-hidden>
            🛡️
          </span>
          <nav className="flex-1 min-w-0 flex gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Portal">
            {ABAS.map((a) => {
              const ativa = a.id === abaAtiva;
              return (
                <button
                  type="button"
                  key={a.label}
                  onClick={() => navegar("admin", a.id)}
                  aria-current={ativa ? "page" : undefined}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
                    ativa ? "bg-zinc-800 text-purple-300" : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  <span aria-hidden>{a.icone}</span>
                  <span className="hidden sm:inline">{a.label}</span>
                </button>
              );
            })}
          </nav>
          <span className="hidden md:block text-sm text-zinc-400 truncate max-w-40">{eu?.nome}</span>
          <button type="button" onClick={sair} className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800">
            Sair
          </button>
        </div>
      </header>

      {secao === "novo" ? (
        <AdminNovo navegar={navegar} />
      ) : secao === "empresa" && id ? (
        <AdminEmpresa key={id} id={id} navegar={navegar} />
      ) : secao === "relatorios" ? (
        <AdminRelatorios />
      ) : secao === "auditoria" ? (
        <AdminAuditoria key={id ?? "todas"} empresaInicial={id} />
      ) : (
        <AdminRestaurantes navegar={navegar} />
      )}
    </div>
  );
}
