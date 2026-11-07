import { useCallback, useEffect, useState } from "react";
import { useRestaurante } from "../store/contexto";
import { FUNCOES } from "../store/regras";
import { PIN_PADRAO_ADMIN, PIN_TAMANHO } from "../utils/pin";
import { Avatar } from "../components/ui";
import BotaoInstalar from "../components/BotaoInstalar";
import { classeInput } from "../utils/estilos";

const ERROS_RESTAURANTE = {
  EMPRESA_INVALIDA: "Não encontramos esse restaurante. Confira o código.",
  EMPRESA_SUSPENSA: "Este restaurante está suspenso. Fale com o suporte.",
  SEM_CONEXAO: "Sem conexão com o servidor. Tente de novo.",
  ERRO: "Não foi possível verificar agora. Tente de novo.",
};

/** Primeiro passo no aparelho: informar de qual restaurante é. */
function CodigoRestaurante() {
  const { definirRestaurante } = useRestaurante();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [verificando, setVerificando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!codigo.trim()) return;
    setVerificando(true);
    setErro("");
    const r = await definirRestaurante(codigo);
    setVerificando(false);
    if (!r.ok) setErro(ERROS_RESTAURANTE[r.erro] ?? ERROS_RESTAURANTE.ERRO);
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="text-center">
        <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20">
          <span className="text-2xl" aria-hidden>
            🍽
          </span>
        </div>
        <h1 className="text-2xl font-bold text-orange-500">Sistema Restaurante</h1>
        <p className="text-zinc-400 text-sm">De qual restaurante você é?</p>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-zinc-400">Código do restaurante</span>
        <input
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ex.: sobradinho"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          className={`${classeInput} mt-1 text-base`}
        />
      </label>
      {erro && (
        <p className="text-sm text-red-400" role="alert">
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={verificando || !codigo.trim()}
        className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-semibold transition disabled:opacity-40"
      >
        {verificando ? "Verificando…" : "Continuar"}
      </button>
      <p className="text-xs text-zinc-500 text-center">
        Peça o código ou o link ao administrador do restaurante. Este aparelho vai lembrar.
      </p>
    </form>
  );
}

const MAX_TENTATIVAS = 5;
const BLOQUEIO_SEG = 30;

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "limpar", "0", "apagar"];

function TecladoPin({ funcionario, onVoltar, onEntrar }) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [tremendo, setTremendo] = useState(0);
  const [tentativas, setTentativas] = useState(0);
  const [bloqueadoAte, setBloqueadoAte] = useState(0);
  const [agora, setAgora] = useState(Date.now);

  const bloqueado = bloqueadoAte > agora;
  const segundosRestantes = Math.ceil((bloqueadoAte - agora) / 1000);

  useEffect(() => {
    if (!bloqueadoAte) return;
    const id = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(id);
  }, [bloqueadoAte]);

  const [verificando, setVerificando] = useState(false);

  const bloquear = useCallback((segundos) => {
    setBloqueadoAte(Date.now() + segundos * 1000);
    setAgora(Date.now());
    setTentativas(0);
    setErro(`Muitas tentativas. Aguarde ${segundos}s.`);
  }, []);

  const tentar = useCallback(
    async (valor) => {
      setVerificando(true);
      const r = await onEntrar(valor);
      if (r.ok) return; // a tela troca sozinha
      setVerificando(false);
      setPin("");
      setTremendo((t) => t + 1);

      if (r.erro === "BLOQUEADO") return bloquear(r.segundos ?? BLOQUEIO_SEG);
      if (r.erro === "SEM_CONEXAO") return setErro("Sem conexão com o servidor.");
      if (r.erro !== "PIN_INCORRETO") return setErro("Não foi possível entrar. Tente de novo.");

      // O servidor informa quantas tentativas restam; no modo local contamos aqui.
      const n = tentativas + 1;
      const restantes = r.restantes ?? MAX_TENTATIVAS - n;
      setTentativas(n);
      if (restantes <= 0) return bloquear(BLOQUEIO_SEG);
      setErro(`PIN incorreto (${restantes} tentativa${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""})`);
    },
    [onEntrar, tentativas, bloquear]
  );

  const tecla = useCallback(
    (t) => {
      if (bloqueado || verificando) return;
      if (t === "apagar") return setPin((p) => p.slice(0, -1));
      if (t === "limpar") return setPin("");
      setErro("");
      setPin((p) => (p.length >= PIN_TAMANHO ? p : p + t));
    },
    [bloqueado, verificando]
  );

  // Ao completar os dígitos, tenta entrar automaticamente.
  useEffect(() => {
    if (pin.length !== PIN_TAMANHO) return;
    const id = setTimeout(() => tentar(pin), 120);
    return () => clearTimeout(id);
  }, [pin, tentar]);

  // Teclado físico também funciona.
  useEffect(() => {
    function aoTeclar(e) {
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") tecla("apagar");
      else if (e.key === "Escape") onVoltar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [tecla, onVoltar]);

  return (
    <div className="text-center">
      <button type="button" onClick={onVoltar} className="text-sm text-zinc-400 hover:text-white mb-4">
        ← Trocar usuário
      </button>
      <div className="flex flex-col items-center gap-2 mb-6">
        <Avatar funcionario={funcionario} tamanho="g" />
        <p className="font-bold text-lg">{funcionario.nome}</p>
        <p className="text-xs text-zinc-400">Digite seu PIN de {PIN_TAMANHO} dígitos</p>
      </div>

      <div key={tremendo} className={`flex justify-center gap-3 mb-3 ${tremendo ? "animate-tremer" : ""}`}>
        {Array.from({ length: PIN_TAMANHO }, (_, i) => (
          <span
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition ${
              i < pin.length ? "bg-orange-500 border-orange-500" : "border-zinc-600"
            }`}
          />
        ))}
      </div>
      <p className="h-5 text-sm text-red-400 mb-3" role="alert">
        {bloqueado ? `Bloqueado. Tente em ${segundosRestantes}s.` : verificando ? "Verificando…" : erro}
      </p>

      <div className="grid grid-cols-3 gap-3 max-w-64 mx-auto">
        {TECLAS.map((t) => (
          <button
            type="button"
            key={t}
            disabled={bloqueado}
            onClick={() => tecla(t)}
            aria-label={t === "apagar" ? "Apagar" : t === "limpar" ? "Limpar" : t}
            className={`h-16 rounded-2xl font-bold transition active:scale-95 disabled:opacity-30 ${
              /\d/.test(t)
                ? "bg-zinc-800 hover:bg-zinc-700 text-2xl"
                : "bg-transparent hover:bg-zinc-800 text-zinc-400 text-sm"
            }`}
          >
            {t === "apagar" ? "⌫" : t === "limpar" ? "Limpar" : t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Login() {
  const { funcionariosLogin, entrar, modo, conexao, recarregarLogin, restaurante, empresa, esquecerRestaurante } =
    useRestaurante();
  const [selecionadoId, setSelecionadoId] = useState(null);
  const ativos = funcionariosLogin;
  const selecionado = ativos.find((f) => f.id === selecionadoId);
  const adminComPinPadrao = ativos.find((f) => f.funcao === "admin" && f.pinPadrao);

  const voltar = useCallback(() => setSelecionadoId(null), []);
  const tentarEntrar = useCallback((pin) => entrar(selecionadoId, pin), [entrar, selecionadoId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white flex items-center justify-center px-4 py-8">
      <main className="bg-zinc-900/80 backdrop-blur p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md border border-zinc-800 animate-entrada">
        {modo === "nuvem" && !restaurante ? (
          <CodigoRestaurante />
        ) : selecionado ? (
          <TecladoPin
            key={selecionado.id}
            funcionario={selecionado}
            onVoltar={voltar}
            onEntrar={tentarEntrar}
          />
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/20">
                <span className="text-2xl" aria-hidden>🍽</span>
              </div>
              <h1 className="text-2xl font-bold text-orange-500">{empresa?.nome ?? "Sistema Restaurante"}</h1>
              <p className="text-zinc-400 text-sm">Quem está entrando?</p>
              {modo === "nuvem" && (
                <button type="button" onClick={esquecerRestaurante} className="text-xs text-zinc-500 hover:text-white underline mt-1">
                  Não é este restaurante? Trocar
                </button>
              )}
              <p className="text-[11px] text-zinc-600 mt-1">
                {modo === "nuvem" ? "☁️ Conectado ao banco de dados" : "💾 Modo local (dados só neste navegador)"}
              </p>
              <div className="mt-3 flex justify-center">
                <BotaoInstalar />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ativos.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => setSelecionadoId(f.id)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 border border-transparent hover:border-orange-500/40 transition active:scale-95"
                >
                  <Avatar funcionario={f} />
                  <span className="font-semibold text-sm text-center leading-tight line-clamp-2">{f.nome}</span>
                  <span className="text-[11px] text-zinc-400">
                    {FUNCOES[f.funcao].emoji} {FUNCOES[f.funcao].label}
                  </span>
                </button>
              ))}
            </div>

            {ativos.length === 0 && (
              <div className="text-center text-sm text-zinc-400 space-y-3">
                <p>
                  {conexao === "offline"
                    ? "Não foi possível conectar ao banco de dados."
                    : "Nenhum funcionário encontrado."}
                </p>
                {recarregarLogin && (
                  <button type="button" onClick={recarregarLogin} className="text-orange-400 underline">
                    Tentar de novo
                  </button>
                )}
              </div>
            )}

            {adminComPinPadrao && (
              <p className="mt-6 text-xs text-zinc-400 bg-zinc-800/60 rounded-xl p-3 text-center">
                Primeiro acesso: entre como <b className="text-white">{adminComPinPadrao.nome}</b> com o PIN{" "}
                {modo === "local" ? <b className="text-orange-400">{PIN_PADRAO_ADMIN}</b> : "provisório que você recebeu"}, troque-o
                e cadastre sua equipe em <b>Equipe</b>.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
