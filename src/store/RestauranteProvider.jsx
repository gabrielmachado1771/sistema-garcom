import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { RestauranteContext } from "./contexto";
import { estadoInicial, migrar, reducer, verificarPin } from "./regras";

const CHAVE = "sistema-garcom:dados";
const CHAVES_ANTIGAS = ["sistema-garcom:v2"];
const CHAVE_SESSAO = "sistema-garcom:sessao";

function carregar() {
  for (const chave of [CHAVE, ...CHAVES_ANTIGAS]) {
    try {
      const dados = migrar(JSON.parse(localStorage.getItem(chave)));
      if (dados) return dados;
    } catch {
      // dados corrompidos ou storage indisponível
    }
  }
  return estadoInicial();
}

function lerSessao() {
  try {
    return sessionStorage.getItem(CHAVE_SESSAO);
  } catch {
    return null;
  }
}

export default function RestauranteProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, carregar);
  // A sessão fica no sessionStorage: cada aba/aparelho tem o seu usuário logado.
  const [usuarioId, setUsuarioId] = useState(lerSessao);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(state));
    } catch {
      // storage cheio/bloqueado: segue só em memória
    }
  }, [state]);

  useEffect(() => {
    try {
      if (usuarioId) sessionStorage.setItem(CHAVE_SESSAO, usuarioId);
      else sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      // ignora
    }
  }, [usuarioId]);

  // Sincroniza entre abas do mesmo navegador.
  useEffect(() => {
    function aoMudar(e) {
      if (e.key !== CHAVE || !e.newValue) return;
      try {
        const dados = migrar(JSON.parse(e.newValue));
        if (dados) dispatch({ type: "SINCRONIZAR", state: dados });
      } catch {
        // ignora valor inválido
      }
    }
    window.addEventListener("storage", aoMudar);
    return () => window.removeEventListener("storage", aoMudar);
  }, []);

  // Usuário desativado ou removido pelo admin perde o acesso na hora.
  const usuario = state.funcionarios.find((f) => f.id === usuarioId && f.ativo) ?? null;

  const entrar = useCallback(
    (id, pin) => {
      const f = state.funcionarios.find((x) => x.id === id);
      if (!verificarPin(f, pin)) return false;
      setUsuarioId(id);
      return true;
    },
    [state.funcionarios]
  );

  const sair = useCallback(() => setUsuarioId(null), []);

  const uid = usuario?.id;
  const unome = usuario?.nome;
  const assinatura = useMemo(() => (uid ? { id: uid, nome: unome } : null), [uid, unome]);

  const acoes = useMemo(
    () => ({
      adicionarItem: (mesaId, produto) =>
        dispatch({ type: "ADICIONAR_ITEM", mesaId, produto, atendente: assinatura }),
      removerItem: (mesaId, produtoId) => dispatch({ type: "REMOVER_ITEM", mesaId, produtoId }),
      limparRascunho: (mesaId) => dispatch({ type: "LIMPAR_RASCUNHO", mesaId }),
      definirObservacao: (mesaId, observacao) =>
        dispatch({ type: "DEFINIR_OBSERVACAO", mesaId, observacao }),
      enviarCozinha: (mesaId) => dispatch({ type: "ENVIAR_COZINHA", mesaId, atendente: assinatura }),
      marcarPronto: (mesaId, comandaId) => dispatch({ type: "MARCAR_PRONTO", mesaId, comandaId }),
      voltarPreparo: (mesaId, comandaId) => dispatch({ type: "VOLTAR_PREPARO", mesaId, comandaId }),
      marcarEntregue: (mesaId, comandaId) =>
        dispatch({ type: "MARCAR_ENTREGUE", mesaId, comandaId }),
      cancelarComanda: (mesaId, comandaId) =>
        dispatch({ type: "CANCELAR_COMANDA", mesaId, comandaId }),
      finalizarConta: (mesaId, pagamento) =>
        dispatch({ type: "FINALIZAR_CONTA", mesaId, ...pagamento, operador: assinatura?.nome }),
      fecharCaixa: () => dispatch({ type: "FECHAR_CAIXA" }),
      criarFuncionario: (dados) => dispatch({ type: "CRIAR_FUNCIONARIO", ...dados }),
      editarFuncionario: (id, dados) => dispatch({ type: "EDITAR_FUNCIONARIO", id, dados }),
      removerFuncionario: (id) => dispatch({ type: "REMOVER_FUNCIONARIO", id }),
    }),
    [assinatura]
  );

  const valor = useMemo(
    () => ({ ...state, ...acoes, usuario, entrar, sair }),
    [state, acoes, usuario, entrar, sair]
  );

  return <RestauranteContext.Provider value={valor}>{children}</RestauranteContext.Provider>;
}
