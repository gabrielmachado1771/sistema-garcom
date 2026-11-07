import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { RestauranteContext, useAviso } from "./contexto";
import { estadoInicial, migrar, reducer, verificarPin } from "./regras";
import { acaoParaRpc, ehErroDeRede, MODO, rpc, supabase, traduzirErro } from "./supabase";
import { normalizarCodigo } from "../utils/codigo";

const CHAVE_DADOS = "sistema-garcom:dados";
const CHAVES_ANTIGAS = ["sistema-garcom:v2"];
const CHAVE_SESSAO_LOCAL = "sistema-garcom:sessao";
const CHAVE_SESSAO_NUVEM = "sistema-garcom:token";
const CHAVE_RESTAURANTE = "sistema-garcom:restaurante"; // código do último restaurante usado neste aparelho
const INTERVALO_ATUALIZACAO = 10000;


// ---------- utilitários ----------

function lerSessao(chave) {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarSessao(chave, valor) {
  try {
    if (valor) sessionStorage.setItem(chave, valor);
    else sessionStorage.removeItem(chave);
  } catch {
    // storage bloqueado
  }
}

function lerLocal(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave, valor) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch {
    // storage bloqueado
  }
}

/** Ações disponíveis para as telas — iguais nos dois modos. */
function criarAcoes(executar, assinatura) {
  return {
    adicionarItem: (mesaId, produto, obs = "") =>
      executar({ type: "ADICIONAR_ITEM", mesaId, produto, obs, atendente: assinatura }),
    removerItem: (mesaId, produtoId, obs = "") => executar({ type: "REMOVER_ITEM", mesaId, produtoId, obs }),
    observacaoItem: (mesaId, produtoId, obsAntiga, obs, qtd) =>
      executar({ type: "OBSERVACAO_ITEM", mesaId, produtoId, obsAntiga, obs, qtd }),
    transferirMesa: (origemId, destinoId) => executar({ type: "TRANSFERIR_MESA", origemId, destinoId }),
    definirMesas: (quantidade) => executar({ type: "DEFINIR_MESAS", quantidade }),
    configurarEmpresa: (dados) => executar({ type: "CONFIGURAR_EMPRESA", ...dados }),
    salvarCategoria: (dados) => executar({ type: "SALVAR_CATEGORIA", ...dados }),
    removerCategoria: (id) => executar({ type: "REMOVER_CATEGORIA", id }),
    moverCategoria: (id, direcao) => executar({ type: "MOVER_CATEGORIA", id, direcao }),
    salvarProduto: (dados) => executar({ type: "SALVAR_PRODUTO", ...dados }),
    removerProduto: (id) => executar({ type: "REMOVER_PRODUTO", id }),
    limparRascunho: (mesaId) => executar({ type: "LIMPAR_RASCUNHO", mesaId }),
    definirObservacao: (mesaId, observacao) =>
      executar({ type: "DEFINIR_OBSERVACAO", mesaId, observacao }),
    enviarCozinha: (mesaId) => executar({ type: "ENVIAR_COZINHA", mesaId, atendente: assinatura }),
    marcarPronto: (mesaId, comandaId) => executar({ type: "MARCAR_PRONTO", mesaId, comandaId }),
    voltarPreparo: (mesaId, comandaId) => executar({ type: "VOLTAR_PREPARO", mesaId, comandaId }),
    marcarEntregue: (mesaId, comandaId) => executar({ type: "MARCAR_ENTREGUE", mesaId, comandaId }),
    cancelarComanda: (mesaId, comandaId) => executar({ type: "CANCELAR_COMANDA", mesaId, comandaId }),
    finalizarConta: (mesaId, pagamento) =>
      executar({ type: "FINALIZAR_CONTA", mesaId, ...pagamento, operador: assinatura?.nome }),
    fecharCaixa: () => executar({ type: "FECHAR_CAIXA", operador: assinatura?.nome }),
    criarFuncionario: (dados) => executar({ type: "CRIAR_FUNCIONARIO", ...dados }),
    editarFuncionario: (id, dados) => executar({ type: "EDITAR_FUNCIONARIO", id, dados }),
    removerFuncionario: (id) => executar({ type: "REMOVER_FUNCIONARIO", id }),
  };
}

function useAssinatura(usuario) {
  const uid = usuario?.id;
  const unome = usuario?.nome;
  return useMemo(() => (uid ? { id: uid, nome: unome } : null), [uid, unome]);
}

// =====================================================================
//  MODO LOCAL — dados no localStorage do navegador
// =====================================================================

function carregarLocal() {
  for (const chave of [CHAVE_DADOS, ...CHAVES_ANTIGAS]) {
    try {
      const dados = migrar(JSON.parse(localStorage.getItem(chave)));
      if (dados) return dados;
    } catch {
      // dados corrompidos ou storage indisponível
    }
  }
  return estadoInicial();
}

function ProviderLocal({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, carregarLocal);
  const [usuarioId, setUsuarioId] = useState(() => lerSessao(CHAVE_SESSAO_LOCAL));

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify(state));
    } catch {
      // storage cheio/bloqueado
    }
  }, [state]);

  useEffect(() => gravarSessao(CHAVE_SESSAO_LOCAL, usuarioId), [usuarioId]);

  // Sincroniza entre abas do mesmo navegador.
  useEffect(() => {
    function aoMudar(e) {
      if (e.key !== CHAVE_DADOS || !e.newValue) return;
      try {
        const dados = migrar(JSON.parse(e.newValue));
        if (dados) dispatch({ type: "SINCRONIZAR", state: dados });
      } catch {
        // ignora
      }
    }
    window.addEventListener("storage", aoMudar);
    return () => window.removeEventListener("storage", aoMudar);
  }, []);

  const usuario = state.funcionarios.find((f) => f.id === usuarioId && f.ativo) ?? null;
  const assinatura = useAssinatura(usuario);

  const entrar = useCallback(
    async (id, pin) => {
      const f = state.funcionarios.find((x) => x.id === id);
      if (!verificarPin(f, pin)) return { ok: false, erro: "PIN_INCORRETO" };
      setUsuarioId(id);
      return { ok: true };
    },
    [state.funcionarios]
  );
  const sair = useCallback(() => setUsuarioId(null), []);

  const acoes = useMemo(() => criarAcoes(dispatch, assinatura), [assinatura]);
  const funcionariosLogin = useMemo(() => state.funcionarios.filter((f) => f.ativo), [state.funcionarios]);

  const buscarRelatorio = useCallback(
    async (de, ate) => {
      const entre = (t) => t >= de && t <= ate;
      return {
        vendas: [...state.historico, ...(state.arquivo ?? [])].filter((v) => entre(v.data)),
        fechamentos: (state.fechamentos ?? []).filter((f) => entre(f.data)),
      };
    },
    [state.historico, state.arquivo, state.fechamentos]
  );

  const valor = useMemo(
    () => ({
      ...state,
      ...acoes,
      modo: "local",
      conexao: "online",
      carregando: false,
      restaurante: null,
      definirRestaurante: async () => ({ ok: true }),
      esquecerRestaurante: () => {},
      usuario,
      funcionariosLogin,
      buscarRelatorio,
      entrar,
      sair,
    }),
    [state, acoes, usuario, funcionariosLogin, buscarRelatorio, entrar, sair]
  );

  return <RestauranteContext.Provider value={valor}>{children}</RestauranteContext.Provider>;
}

// =====================================================================
//  MODO NUVEM — banco de dados no Supabase
// =====================================================================

function ProviderNuvem({ children }) {
  const aviso = useAviso();
  const [state, dispatch] = useReducer(reducer, null);
  const [token, setToken] = useState(() => lerSessao(CHAVE_SESSAO_NUVEM));
  const [restaurante, setRestaurante] = useState(() => lerLocal(CHAVE_RESTAURANTE));
  const [empresaLogin, setEmpresaLogin] = useState(null); // { nome, slug, ativa } na tela de login
  const [funcionariosLogin, setFuncionariosLogin] = useState(null);
  const [conexao, setConexao] = useState("online");
  const pendentes = useRef(0); // envios ainda não confirmados pelo banco
  const timersObs = useRef({});
  const canal = useRef(null);
  const tokenRef = useRef(token);

  useEffect(() => {
    tokenRef.current = token;
    gravarSessao(CHAVE_SESSAO_NUVEM, token);
  }, [token]);

  // Só aplica a resposta do banco quando não há outro envio no caminho,
  // para não "voltar no tempo" a tela enquanto a pessoa ainda está clicando.
  const aplicar = useCallback((dados) => {
    if (!dados) return;
    // Lembra o restaurante desta sessão (ex.: sessões abertas antes do multiempresa).
    const slug = dados.empresa?.slug;
    if (slug) {
      gravarLocal(CHAVE_RESTAURANTE, slug);
      setRestaurante((atual) => (atual === slug ? atual : slug));
    }
    if (pendentes.current === 0) dispatch({ type: "SINCRONIZAR", state: { versao: 4, ...dados } });
  }, []);

  const tratarErro = useCallback(
    (erro, { silencioso = false } = {}) => {
      if (ehErroDeRede(erro)) {
        setConexao("offline");
        return;
      }
      if (erro?.message?.includes("SESSAO_INVALIDA")) {
        setToken(null);
        dispatch({ type: "SINCRONIZAR", state: null });
        aviso?.(traduzirErro(erro), { tipo: "info" });
        return;
      }
      // id temporário de algo recém-criado: só ressincroniza
      if (erro?.code === "22P02") return;
      if (!silencioso) aviso?.(traduzirErro(erro), { tipo: "erro", duracao: 4500 });
    },
    [aviso]
  );

  const recarregar = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const dados = await rpc("estado", { p_token: t });
      setConexao("online");
      if (t === tokenRef.current) aplicar(dados);
    } catch (e) {
      tratarErro(e, { silencioso: true });
    }
  }, [aplicar, tratarErro]);

  const avisarOutros = useCallback(() => {
    canal.current?.send({ type: "broadcast", event: "mudou", payload: {} }).catch(() => {});
  }, []);

  // Carrega os dados ao entrar e mantém atualizado:
  // aviso em tempo real (Realtime) + conferência periódica + ao voltar para a aba.
  useEffect(() => {
    if (!token) return;
    recarregar();

    let atraso;
    const recarregarEmBreve = () => {
      clearTimeout(atraso);
      atraso = setTimeout(recarregar, 250);
    };

    const intervalo = setInterval(recarregar, INTERVALO_ATUALIZACAO);
    const aoVoltar = () => document.visibilityState === "visible" && recarregar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", recarregar);

    window.addEventListener("restaurante:mudou", recarregarEmBreve);

    return () => {
      clearTimeout(atraso);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", recarregar);
      window.removeEventListener("restaurante:mudou", recarregarEmBreve);
    };
  }, [token, recarregar]);

  // Tempo real: um canal por restaurante, com nome secreto que só chega a quem fez login.
  // A mensagem não leva dados — só avisa "algo mudou"; os dados vêm pelas funções com token.
  const nomeCanal = token && state?.empresa?.canal ? `restaurante-${state.empresa.canal}` : null;
  useEffect(() => {
    if (!nomeCanal) return;
    canal.current = supabase
      .channel(nomeCanal, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "mudou" }, () => window.dispatchEvent(new Event("restaurante:mudou")))
      .subscribe();
    return () => {
      supabase.removeChannel(canal.current);
      canal.current = null;
    };
  }, [nomeCanal]);

  // Lista de nomes da tela de login.
  const carregarLogin = useCallback(async () => {
    if (!restaurante) {
      setEmpresaLogin(null);
      setFuncionariosLogin([]);
      return;
    }
    try {
      const [empresa, lista] = await Promise.all([
        rpc("empresa_publica", { p_empresa: restaurante }),
        rpc("listar_funcionarios_login", { p_empresa: restaurante }),
      ]);
      setEmpresaLogin(empresa);
      setFuncionariosLogin(lista);
      setConexao("online");
    } catch (e) {
      tratarErro(e, { silencioso: true });
      setFuncionariosLogin((atual) => atual ?? []);
    }
  }, [tratarErro, restaurante]);

  /** Escolhe o restaurante pelo código/link. Confere no banco antes. */
  const definirRestaurante = useCallback(async (codigo) => {
    const slug = normalizarCodigo(codigo);
    if (!slug) return { ok: false, erro: "EMPRESA_INVALIDA" };
    try {
      const empresa = await rpc("empresa_publica", { p_empresa: slug });
      if (!empresa) return { ok: false, erro: "EMPRESA_INVALIDA" };
      if (!empresa.ativa) return { ok: false, erro: "EMPRESA_SUSPENSA" };
      gravarLocal(CHAVE_RESTAURANTE, slug);
      setEmpresaLogin(empresa);
      setFuncionariosLogin(null);
      setRestaurante(slug);
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: ehErroDeRede(e) ? "SEM_CONEXAO" : "ERRO" };
    }
  }, []);

  const esquecerRestaurante = useCallback(() => {
    gravarLocal(CHAVE_RESTAURANTE, null);
    setRestaurante(null);
    setEmpresaLogin(null);
  }, []);

  useEffect(() => {
    if (token) return;
    const id = setTimeout(carregarLogin, 0);
    return () => clearTimeout(id);
  }, [token, carregarLogin]);

  const enviar = useCallback(
    async (acao) => {
      const [funcao, args] = acaoParaRpc(acao);
      try {
        const dados = await rpc(funcao, { p_token: tokenRef.current, ...args });
        pendentes.current--;
        setConexao("online");
        aplicar(dados);
        avisarOutros();
      } catch (e) {
        pendentes.current--;
        tratarErro(e);
        recarregar();
      }
    },
    [aplicar, avisarOutros, recarregar, tratarErro]
  );

  const executar = useCallback(
    (acao) => {
      dispatch(acao); // mostra na hora (otimista)
      if (!acaoParaRpc(acao)) return;

      // Observação: espera a pessoa parar de digitar antes de salvar.
      if (acao.type === "DEFINIR_OBSERVACAO") {
        const timers = timersObs.current;
        if (!timers[acao.mesaId]) pendentes.current++;
        clearTimeout(timers[acao.mesaId]);
        timers[acao.mesaId] = setTimeout(() => {
          delete timers[acao.mesaId];
          enviar(acao);
        }, 600);
        return;
      }
      pendentes.current++;
      enviar(acao);
    },
    [enviar]
  );

  const entrar = useCallback(async (id, pin) => {
    try {
      const r = await rpc("entrar", { p_empresa: restaurante, p_id: id, p_pin: pin });
      if (r.ok) setToken(r.token);
      return r;
    } catch (e) {
      return { ok: false, erro: ehErroDeRede(e) ? "SEM_CONEXAO" : "ERRO" };
    }
  }, [restaurante]);

  const sair = useCallback(() => {
    const t = tokenRef.current;
    if (t) rpc("sair", { p_token: t }).catch(() => {});
    setToken(null);
    dispatch({ type: "SINCRONIZAR", state: null });
  }, []);

  // Relatórios buscam direto no banco (incluem caixas já fechados).
  const buscarRelatorio = useCallback(
    async (de, ate) => {
      try {
        return await rpc("relatorio", {
          p_token: tokenRef.current,
          p_de: new Date(de).toISOString(),
          p_ate: new Date(ate).toISOString(),
        });
      } catch (e) {
        tratarErro(e);
        throw e;
      }
    },
    [tratarErro]
  );

  const usuario = state?.funcionarios.find((f) => f.id === state.usuarioId) ?? null;
  const assinatura = useAssinatura(usuario);
  // criarAcoes só monta funções (handlers); nenhum ref é lido durante a renderização.
  // eslint-disable-next-line react-hooks/refs
  const acoes = useMemo(() => criarAcoes(executar, assinatura), [executar, assinatura]);

  const valor = useMemo(
    () => ({
      mesas: [],
      historico: [],
      funcionarios: [],
      cardapio: [],
      ...state,
      ...acoes,
      modo: "nuvem",
      conexao,
      empresa: state?.empresa ?? empresaLogin,
      suporte: state?.suporte ?? null, // nome do dono do sistema, quando é um acesso de suporte
      carregando: (!!token && !state) || (!token && !!restaurante && funcionariosLogin === null),
      usuario,
      funcionariosLogin: funcionariosLogin ?? [],
      recarregarLogin: carregarLogin,
      restaurante,
      definirRestaurante,
      esquecerRestaurante,
      buscarRelatorio,
      entrar,
      sair,
    }),
    [
      state,
      acoes,
      conexao,
      token,
      usuario,
      empresaLogin,
      funcionariosLogin,
      carregarLogin,
      restaurante,
      definirRestaurante,
      esquecerRestaurante,
      buscarRelatorio,
      entrar,
      sair,
    ]
  );

  return <RestauranteContext.Provider value={valor}>{children}</RestauranteContext.Provider>;
}

export default function RestauranteProvider({ children }) {
  return MODO === "nuvem" ? <ProviderNuvem>{children}</ProviderNuvem> : <ProviderLocal>{children}</ProviderLocal>;
}
