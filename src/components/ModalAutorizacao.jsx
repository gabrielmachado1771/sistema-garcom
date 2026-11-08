import { useState } from "react";
import { useRestaurante } from "../store/contexto";
import { traduzirErro } from "../store/supabase";
import { classeInput } from "../utils/estilos";
import { Botao, Campo, Modal } from "./ui";

/**
 * Pede motivo e, se quem está logado não for admin, o PIN de um administrador.
 * O PIN é conferido no banco antes de continuar (e de novo na ação, por segurança).
 * onConfirmar recebe { motivo, pin, qtd, autorizadoPor }.
 */
export default function ModalAutorizacao({
  titulo,
  descricao,
  sugestoes = [],
  maxQtd = 0,
  rotuloBotao = "Confirmar",
  variante = "perigo",
  extra = null, // campos a mais (ex.: valor do desconto)
  validar = () => "", // devolve a mensagem de erro dos campos extras, ou ""
  onConfirmar,
  onFechar,
}) {
  const { usuario, conferirPinAdmin } = useRestaurante();
  const ehAdmin = usuario?.funcao === "admin";
  const [motivo, setMotivo] = useState("");
  const [pin, setPin] = useState("");
  const [qtd, setQtd] = useState(1);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    const problema = validar();
    if (problema) return setErro(problema);
    if (motivo.trim().length < 3) return setErro("Informe o motivo.");
    let autorizadoPor = usuario?.nome;
    if (!ehAdmin) {
      if (!/^\d{4}$/.test(pin)) return setErro("Peça para um administrador digitar o PIN dele.");
      setEnviando(true);
      const r = await conferirPinAdmin(pin);
      setEnviando(false);
      if (!r.ok) {
        setPin("");
        return setErro(r.erro === "SEM_CONEXAO" ? "Sem conexão com o servidor." : traduzirErro({ message: r.erro }));
      }
      autorizadoPor = r.admin;
    }
    onConfirmar({ motivo: motivo.trim(), pin: ehAdmin ? null : pin, qtd, autorizadoPor });
  }

  return (
    <Modal aberto titulo={titulo} onFechar={onFechar}>
      <form onSubmit={confirmar} className="space-y-4">
        {descricao && <p className="text-sm text-zinc-300">{descricao}</p>}
        {extra}
        {maxQtd > 1 && (
          <div className="flex items-center justify-between gap-3 bg-zinc-800/60 rounded-xl p-3">
            <span className="text-sm text-zinc-300">Quantos cancelar?</span>
            <div className="flex items-center gap-2">
              <Botao className="w-10 h-10" aria-label="Menos um" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)}>
                −
              </Botao>
              <span className="w-14 text-center font-semibold tabular-nums">
                {qtd} de {maxQtd}
              </span>
              <Botao className="w-10 h-10" aria-label="Mais um" disabled={qtd >= maxQtd} onClick={() => setQtd(qtd + 1)}>
                +
              </Botao>
            </div>
          </div>
        )}
        <Campo rotulo="Motivo">
          <input autoFocus maxLength={120} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={classeInput} />
        </Campo>
        {sugestoes.length > 0 && (
          <div className="flex flex-wrap gap-2 -mt-2">
            {sugestoes.map((s) => (
              <button type="button" key={s} onClick={() => setMotivo(s)} className="px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs">
                {s}
              </button>
            ))}
          </div>
        )}
        {ehAdmin ? (
          <p className="text-xs text-zinc-400">Você é administrador: a autorização é sua. Fica registrado no histórico.</p>
        ) : (
          <Campo rotulo="PIN de um administrador" dica="Um administrador precisa digitar o PIN dele. Fica registrado quem autorizou.">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className={`${classeInput} text-center text-2xl tracking-[0.5em]`}
            />
          </Campo>
        )}
        {erro && (
          <p className="text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
        <Botao type="submit" variante={variante} className="w-full py-3" disabled={enviando}>
          {enviando ? "Conferindo…" : rotuloBotao}
        </Botao>
      </form>
    </Modal>
  );
}
