import { useCallback, useMemo, useRef, useState } from "react";
import { AvisoContext } from "../store/contexto";

const estilos = {
  sucesso: "bg-green-600 text-white",
  erro: "bg-red-600 text-white",
  info: "bg-zinc-800 text-white border border-zinc-700",
  alerta: "bg-orange-500 text-black",
};

function tocarBip() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.18].forEach((inicio) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.frequency.value = 880;
      ganho.gain.setValueAtTime(0.15, ctx.currentTime + inicio);
      ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.15);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + 0.16);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    // sem áudio disponível
  }
}

export default function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const proximoId = useRef(0);

  const remover = useCallback((id) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const aviso = useCallback(
    (texto, { tipo = "sucesso", som = false, duracao = 3000 } = {}) => {
      const id = ++proximoId.current;
      setAvisos((a) => [...a.slice(-3), { id, texto, tipo }]);
      if (som) tocarBip();
      setTimeout(() => remover(id), duracao);
    },
    [remover]
  );

  const valor = useMemo(() => aviso, [aviso]);

  return (
    <AvisoContext.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-3 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
      >
        {avisos.map((a) => (
          <button
            type="button"
            key={a.id}
            onClick={() => remover(a.id)}
            className={`pointer-events-auto max-w-sm w-full rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl animate-aviso text-left ${estilos[a.tipo]}`}
          >
            {a.texto}
          </button>
        ))}
      </div>
    </AvisoContext.Provider>
  );
}
