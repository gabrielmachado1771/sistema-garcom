import { useState } from "react";
import { pedirPermissaoNotificacao, permissaoNotificacao, suportaNotificacao } from "../utils/notificacoes";
import { Botao, Cartao } from "./ui";

/** Convite para ligar as notificações do celular (só aparece enquanto a pessoa não respondeu). */
export default function AtivarAvisos({ texto }) {
  const [permissao, setPermissao] = useState(permissaoNotificacao);
  const [dispensado, setDispensado] = useState(false);
  if (!suportaNotificacao() || permissao !== "default" || dispensado) return null;

  return (
    <Cartao className="flex items-center gap-3 border-orange-500/30 bg-orange-500/5">
      <span className="text-2xl" aria-hidden>
        🔔
      </span>
      <p className="flex-1 text-sm text-zinc-300">{texto}</p>
      <div className="flex flex-col sm:flex-row gap-1 shrink-0">
        <Botao variante="primario" className="px-3 py-2 text-sm" onClick={async () => setPermissao(await pedirPermissaoNotificacao())}>
          Ativar
        </Botao>
        <Botao variante="fantasma" className="px-3 py-1 text-xs" onClick={() => setDispensado(true)}>
          Agora não
        </Botao>
      </div>
    </Cartao>
  );
}
