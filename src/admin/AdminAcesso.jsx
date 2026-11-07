import { useState } from "react";
import { clienteAdmin, traduzirErroAdmin } from "../store/supabaseAdmin";
import { Botao } from "../components/ui";
import { classeInput } from "../utils/estilos";

function Moldura({ titulo, subtitulo, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white flex items-center justify-center px-4 py-8">
      <main className="bg-zinc-900/80 p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-sm border border-zinc-800 animate-entrada space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3" aria-hidden>
            <span className="text-2xl">🛡️</span>
          </div>
          <h1 className="text-xl font-bold">{titulo}</h1>
          {subtitulo && <p className="text-sm text-zinc-400 mt-1">{subtitulo}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

function Erro({ children }) {
  if (!children) return null;
  return (
    <p className="text-sm text-red-400" role="alert">
      {children}
    </p>
  );
}

/** Passo 1: e-mail e senha. */
export function AdminLogin({ onEntrou }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const { error } = await clienteAdmin().auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) return setErro(traduzirErroAdmin(error));
    onEntrou();
  }

  return (
    <Moldura titulo="Portal do Sistema" subtitulo="Acesso do administrador geral">
      <form onSubmit={entrar} className="space-y-3">
        <label className="block">
          <span className="text-xs font-semibold text-zinc-400">E-mail</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${classeInput} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-zinc-400">Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={`${classeInput} mt-1`}
          />
        </label>
        <Erro>{erro}</Erro>
        <Botao type="submit" variante="primario" className="w-full py-3" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Botao>
      </form>
      <a href="#/" className="block text-center text-xs text-zinc-500 hover:text-white">
        ← Voltar para o login dos restaurantes
      </a>
    </Moldura>
  );
}

function CampoCodigo({ codigo, setCodigo }) {
  return (
    <input
      autoFocus
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="000000"
      value={codigo}
      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
      aria-label="Código de 6 dígitos"
      className={`${classeInput} text-center text-2xl tracking-[0.4em] tabular-nums`}
    />
  );
}

/** Passo 2 (já tem 2FA): digitar o código do aplicativo autenticador. */
export function AdminCodigo2fa({ onOk, onSair }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const sb = clienteAdmin();
    const { data: fatores, error: erroLista } = await sb.auth.mfa.listFactors();
    const fator = fatores?.totp?.[0];
    if (erroLista || !fator) {
      setEnviando(false);
      return setErro("Não encontramos o seu 2FA. Saia e entre de novo.");
    }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    setEnviando(false);
    if (error) {
      setCodigo("");
      return setErro(traduzirErroAdmin(error));
    }
    onOk();
  }

  return (
    <Moldura titulo="Verificação em 2 etapas" subtitulo="Digite o código de 6 dígitos do seu aplicativo autenticador.">
      <form onSubmit={confirmar} className="space-y-3">
        <CampoCodigo codigo={codigo} setCodigo={setCodigo} />
        <Erro>{erro}</Erro>
        <Botao type="submit" variante="primario" className="w-full py-3" disabled={enviando || codigo.length !== 6}>
          {enviando ? "Conferindo…" : "Confirmar"}
        </Botao>
      </form>
      <button type="button" onClick={onSair} className="block mx-auto text-xs text-zinc-500 hover:text-white">
        Sair
      </button>
    </Moldura>
  );
}

/** Passo 2 (primeira vez): cadastrar o 2FA lendo o QR Code no aplicativo. */
export function AdminCadastro2fa({ onOk, onSair }) {
  const [fator, setFator] = useState(null); // { id, qr, segredo }
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function comecar() {
    setEnviando(true);
    setErro("");
    const sb = clienteAdmin();
    // Limpa tentativas anteriores que não foram confirmadas.
    const { data: lista } = await sb.auth.mfa.listFactors();
    for (const f of lista?.all ?? []) {
      if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Sistema Garçom ${Date.now()}` });
    setEnviando(false);
    if (error) return setErro(traduzirErroAdmin(error));
    setFator({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
  }

  async function confirmar(e) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const { error } = await clienteAdmin().auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    setEnviando(false);
    if (error) {
      setCodigo("");
      return setErro(traduzirErroAdmin(error));
    }
    onOk();
  }

  return (
    <Moldura titulo="Ative a verificação em 2 etapas" subtitulo="Obrigatória para entrar no portal.">
      {!fator ? (
        <div className="space-y-3 text-sm text-zinc-300">
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Instale no celular um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou Authy).
            </li>
            <li>Toque em “Gerar QR Code” e leia o código com o aplicativo.</li>
            <li>Digite o número de 6 dígitos que aparecer.</li>
          </ol>
          <Erro>{erro}</Erro>
          <Botao variante="primario" className="w-full py-3" onClick={comecar} disabled={enviando}>
            {enviando ? "Gerando…" : "Gerar QR Code"}
          </Botao>
        </div>
      ) : (
        <form onSubmit={confirmar} className="space-y-3">
          <div className="bg-white rounded-2xl p-3 w-48 h-48 mx-auto">
            <img src={fator.qr} alt="QR Code para o aplicativo autenticador" className="w-full h-full" />
          </div>
          <details className="text-xs text-zinc-400">
            <summary className="cursor-pointer">Não consegue ler o QR Code?</summary>
            <p className="mt-1">Digite esta chave no aplicativo:</p>
            <code className="block mt-1 break-all bg-zinc-800 rounded-lg p-2 text-zinc-200">{fator.segredo}</code>
          </details>
          <CampoCodigo codigo={codigo} setCodigo={setCodigo} />
          <Erro>{erro}</Erro>
          <Botao type="submit" variante="primario" className="w-full py-3" disabled={enviando || codigo.length !== 6}>
            {enviando ? "Conferindo…" : "Ativar e entrar"}
          </Botao>
        </form>
      )}
      <button type="button" onClick={onSair} className="block mx-auto text-xs text-zinc-500 hover:text-white">
        Sair
      </button>
    </Moldura>
  );
}

export function AdminSemPermissao({ onSair }) {
  return (
    <Moldura titulo="Acesso negado" subtitulo="Esta conta não é de administrador do sistema.">
      <Botao className="w-full py-3" onClick={onSair}>
        Sair
      </Botao>
    </Moldura>
  );
}

export function AdminSemBanco() {
  return (
    <Moldura titulo="Portal indisponível" subtitulo="O portal precisa do banco de dados (Supabase) configurado.">
      <a href="#/" className="block text-center text-sm text-orange-400 underline">
        Voltar
      </a>
    </Moldura>
  );
}
