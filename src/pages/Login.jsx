import { useCallback, useEffect, useState } from "react";
import { useRestaurante } from "../store/contexto";
import { FUNCOES } from "../store/regras";
import { PIN_PADRAO_ADMIN, PIN_TAMANHO } from "../utils/pin";
import { Avatar } from "../components/ui";

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

  const tentar = useCallback(
    (valor) => {
      if (onEntrar(valor)) return;
      const n = tentativas + 1;
      setTentativas(n);
      setTremendo((t) => t + 1);
      setPin("");
      if (n >= MAX_TENTATIVAS) {
        setBloqueadoAte(Date.now() + BLOQUEIO_SEG * 1000);
        setAgora(Date.now());
        setTentativas(0);
        setErro(`Muitas tentativas. Aguarde ${BLOQUEIO_SEG}s.`);
      } else {
        setErro(`PIN incorreto (${MAX_TENTATIVAS - n} tentativa${MAX_TENTATIVAS - n > 1 ? "s" : ""} restante${MAX_TENTATIVAS - n > 1 ? "s" : ""})`);
      }
    },
    [onEntrar, tentativas]
  );

  const tecla = useCallback(
    (t) => {
      if (bloqueado) return;
      if (t === "apagar") return setPin((p) => p.slice(0, -1));
      if (t === "limpar") return setPin("");
      setErro("");
      setPin((p) => (p.length >= PIN_TAMANHO ? p : p + t));
    },
    [bloqueado]
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
        {bloqueado ? `Bloqueado. Tente em ${segundosRestantes}s.` : erro}
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
  const { funcionarios, entrar } = useRestaurante();
  const [selecionadoId, setSelecionadoId] = useState(null);
  const ativos = funcionarios.filter((f) => f.ativo);
  const selecionado = ativos.find((f) => f.id === selecionadoId);
  const adminComPinPadrao = ativos.find((f) => f.funcao === "admin" && f.pinPadrao);

  const voltar = useCallback(() => setSelecionadoId(null), []);
  const tentarEntrar = useCallback((pin) => entrar(selecionadoId, pin), [entrar, selecionadoId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 to-zinc-900 text-white flex items-center justify-center px-4 py-8">
      <main className="bg-zinc-900/80 backdrop-blur p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-md border border-zinc-800 animate-entrada">
        {selecionado ? (
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
              <h1 className="text-2xl font-bold text-orange-500">Sistema Restaurante</h1>
              <p className="text-zinc-400 text-sm">Quem está entrando?</p>
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

            {adminComPinPadrao && (
              <p className="mt-6 text-xs text-zinc-400 bg-zinc-800/60 rounded-xl p-3 text-center">
                Primeiro acesso: entre como <b className="text-white">{adminComPinPadrao.nome}</b> com o PIN{" "}
                <b className="text-orange-400">{PIN_PADRAO_ADMIN}</b> e cadastre sua equipe em <b>Equipe</b>.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
