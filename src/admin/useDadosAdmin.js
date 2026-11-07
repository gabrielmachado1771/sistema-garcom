import { useEffect, useState } from "react";
import { rpcAdmin, traduzirErroAdmin } from "../store/supabaseAdmin";

/** Busca dados de uma função do portal e refaz quando os argumentos/dependências mudam. */
export default function useDadosAdmin(funcao, args, dependencias = []) {
  const [estado, setEstado] = useState({ dados: null, erro: null, chave: null });
  const chave = JSON.stringify([funcao, args, ...dependencias]);
  useEffect(() => {
    let ativo = true;
    rpcAdmin(funcao, args)
      .then((dados) => ativo && setEstado({ dados, erro: null, chave }))
      .catch((e) => ativo && setEstado((s) => ({ ...s, erro: traduzirErroAdmin(e), chave })));
    return () => {
      ativo = false;
    };
    // `chave` resume função, argumentos e dependências
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return { ...estado, carregando: estado.chave !== chave };
}
