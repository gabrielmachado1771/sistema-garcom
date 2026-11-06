// Regras de negócio puras (sem React): estado inicial, reducer e seletores.

import { hashPin, PIN_PADRAO_ADMIN } from "../utils/pin.js";
import { produtos as produtosLocais, categoriaLabels } from "../data/cardapio.js";

export const NUM_MESAS = 10;
export const TAXA_SERVICO = 0.1;
export const MINUTOS_ATRASO = 20;

export const FORMAS_PAGAMENTO = [
  { id: "dinheiro", label: "Dinheiro", emoji: "💵" },
  { id: "pix", label: "Pix", emoji: "📱" },
  { id: "credito", label: "Crédito", emoji: "💳" },
  { id: "debito", label: "Débito", emoji: "🏧" },
];

export const FUNCOES = {
  admin: { label: "Administrador", emoji: "🛡️", descricao: "Acesso total: todas as áreas, equipe e relatórios", cor: "bg-purple-500 text-white", areas: ["painel", "garcom", "cozinha", "caixa", "equipe"] },
  garcom: { label: "Garçom", emoji: "📝", descricao: "Mesas, pedidos e envio à cozinha", cor: "bg-orange-500 text-black", areas: ["garcom"] },
  cozinha: { label: "Cozinha", emoji: "👨‍🍳", descricao: "Fila de pedidos para preparar", cor: "bg-yellow-400 text-black", areas: ["cozinha"] },
  caixa: { label: "Caixa", emoji: "💰", descricao: "Contas, pagamentos e histórico de vendas", cor: "bg-green-500 text-black", areas: ["caixa"] },
};

export function podeAcessar(funcionario, area) {
  return !!funcionario && FUNCOES[funcionario.funcao]?.areas.includes(area);
}

export function areaInicial(funcionario) {
  return FUNCOES[funcionario.funcao]?.areas[0] ?? "painel";
}

export function iniciais(nome) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)[0] : "")).toUpperCase();
}

export function labelPagamento(id) {
  return FORMAS_PAGAMENTO.find((f) => f.id === id)?.label ?? id;
}

function novaMesa(numero) {
  return {
    id: numero,
    numero,
    abertaEm: null,
    rascunho: [], // itens ainda não enviados à cozinha
    observacao: "",
    comandas: [], // pedidos já enviados: { id, numero, itens, observacao, enviadaEm, prontaEm, entregueEm, status, atendente }
    atendente: null, // { id, nome } do garçom que abriu a mesa
  };
}

export function adminPadrao() {
  return {
    id: "admin",
    nome: "Administrador",
    funcao: "admin",
    pinHash: hashPin(PIN_PADRAO_ADMIN, "admin"),
    pinPadrao: true,
    ativo: true,
    criadoEm: Date.now(),
  };
}

export function estadoInicial() {
  return {
    versao: 3,
    mesas: Array.from({ length: NUM_MESAS }, (_, i) => novaMesa(i + 1)),
    historico: [],
    funcionarios: [adminPadrao()],
  };
}

/** Converte dados salvos por versões antigas para o formato atual. */
export function migrar(salvo) {
  if (!salvo || !Array.isArray(salvo.mesas)) return null;
  if (salvo.versao === 3) return salvo;
  if (salvo.versao === 2) {
    return {
      ...salvo,
      versao: 3,
      mesas: salvo.mesas.map((m) => ({ atendente: null, ...m })),
      funcionarios: [adminPadrao()],
    };
  }
  return null;
}

export function verificarPin(funcionario, pin) {
  return !!funcionario && funcionario.ativo && funcionario.pinHash === hashPin(pin, funcionario.id);
}

export function totalAdminsAtivos(funcionarios) {
  return funcionarios.filter((f) => f.funcao === "admin" && f.ativo).length;
}

/** Cardápio no mesmo formato que o banco devolve: [{ id, nome, produtos: [...] }] */
export const CARDAPIO_LOCAL = Object.entries(produtosLocais).map(([id, produtos]) => ({
  id,
  nome: categoriaLabels[id],
  produtos,
}));

// ---------- seletores ----------

const centavos = (v) => Math.round(v * 100) / 100;

export function somaItens(itens) {
  return itens.reduce((acc, i) => acc + i.preco * i.qtd, 0);
}

export function contarItens(itens) {
  return itens.reduce((acc, i) => acc + i.qtd, 0);
}

/** Agrupa os itens de todas as comandas enviadas (é o que entra na conta). */
export function itensConsumidos(mesa) {
  const mapa = new Map();
  for (const c of mesa.comandas) {
    for (const item of c.itens) {
      const atual = mapa.get(item.produtoId);
      mapa.set(
        item.produtoId,
        atual ? { ...atual, qtd: atual.qtd + item.qtd } : { ...item }
      );
    }
  }
  return [...mapa.values()];
}

export function totalMesa(mesa) {
  return somaItens(itensConsumidos(mesa));
}

export function mesaOcupada(mesa) {
  return mesa.rascunho.length > 0 || mesa.comandas.length > 0;
}

export function statusMesa(mesa) {
  if (!mesaOcupada(mesa)) return "livre";
  if (mesa.comandas.some((c) => c.status === "pronto")) return "pronto";
  if (mesa.comandas.some((c) => c.status === "preparo")) return "preparo";
  return "ocupada";
}

export function comandasNaCozinha(mesas, status) {
  return mesas
    .flatMap((m) =>
      m.comandas
        .filter((c) => c.status === status)
        .map((c) => ({ ...c, mesaId: m.id, mesaNumero: m.numero }))
    )
    .sort((a, b) => a.enviadaEm - b.enviadaEm);
}

// ---------- reducer ----------

function atualizarMesa(state, mesaId, fn) {
  return {
    ...state,
    mesas: state.mesas.map((m) => (m.id === mesaId ? fn(m) : m)),
  };
}

export function reducer(state, action) {
  if (!state && action.type !== "SINCRONIZAR") return state;
  switch (action.type) {
    case "SINCRONIZAR":
      return action.state;

    case "ADICIONAR_ITEM":
      return atualizarMesa(state, action.mesaId, (m) => {
        const { produto } = action;
        const existe = m.rascunho.some((i) => i.produtoId === produto.id);
        const rascunho = existe
          ? m.rascunho.map((i) =>
              i.produtoId === produto.id ? { ...i, qtd: i.qtd + 1 } : i
            )
          : [
              ...m.rascunho,
              { produtoId: produto.id, nome: produto.nome, preco: produto.preco, qtd: 1 },
            ];
        return {
          ...m,
          rascunho,
          abertaEm: m.abertaEm ?? Date.now(),
          atendente: m.atendente ?? action.atendente ?? null,
        };
      });

    case "REMOVER_ITEM":
      return atualizarMesa(state, action.mesaId, (m) => ({
        ...m,
        rascunho: m.rascunho
          .map((i) => (i.produtoId === action.produtoId ? { ...i, qtd: i.qtd - 1 } : i))
          .filter((i) => i.qtd > 0),
      }));

    case "LIMPAR_RASCUNHO":
      return atualizarMesa(state, action.mesaId, (m) => ({
        ...m,
        rascunho: [],
        observacao: "",
        abertaEm: m.comandas.length ? m.abertaEm : null,
        atendente: m.comandas.length ? m.atendente : null,
      }));

    case "DEFINIR_OBSERVACAO":
      return atualizarMesa(state, action.mesaId, (m) => ({
        ...m,
        observacao: action.observacao,
      }));

    case "ENVIAR_COZINHA":
      return atualizarMesa(state, action.mesaId, (m) => {
        if (m.rascunho.length === 0) return m;
        const comanda = {
          id: `${m.id}-${Date.now()}`,
          numero: m.comandas.length + 1,
          itens: m.rascunho,
          observacao: m.observacao.trim(),
          enviadaEm: Date.now(),
          prontaEm: null,
          entregueEm: null,
          status: "preparo",
          atendente: action.atendente ?? null,
        };
        return { ...m, rascunho: [], observacao: "", comandas: [...m.comandas, comanda] };
      });

    case "MARCAR_PRONTO":
    case "MARCAR_ENTREGUE":
    case "VOLTAR_PREPARO": {
      const mudancas = {
        MARCAR_PRONTO: { status: "pronto", prontaEm: Date.now() },
        MARCAR_ENTREGUE: { status: "entregue", entregueEm: Date.now() },
        VOLTAR_PREPARO: { status: "preparo", prontaEm: null },
      }[action.type];
      return atualizarMesa(state, action.mesaId, (m) => ({
        ...m,
        comandas: m.comandas.map((c) =>
          c.id === action.comandaId ? { ...c, ...mudancas } : c
        ),
      }));
    }

    case "CANCELAR_COMANDA":
      // Só é possível cancelar enquanto ainda está em preparo.
      return atualizarMesa(state, action.mesaId, (m) => {
        const comandas = m.comandas.filter(
          (c) => !(c.id === action.comandaId && c.status === "preparo")
        );
        return {
          ...m,
          comandas,
          abertaEm: comandas.length || m.rascunho.length ? m.abertaEm : null,
          atendente: comandas.length || m.rascunho.length ? m.atendente : null,
        };
      });

    case "FINALIZAR_CONTA": {
      const mesa = state.mesas.find((m) => m.id === action.mesaId);
      if (!mesa || mesa.comandas.length === 0) return state;
      const { formaPagamento, comTaxa, pessoas, recebido } = action;
      const subtotal = totalMesa(mesa);
      const taxa = centavos(comTaxa ? subtotal * TAXA_SERVICO : 0);
      const total = centavos(subtotal + taxa);
      const venda = {
        id: `${mesa.id}-${Date.now()}`,
        mesa: mesa.numero,
        itens: itensConsumidos(mesa),
        subtotal,
        taxa,
        total,
        formaPagamento,
        pessoas,
        recebido: formaPagamento === "dinheiro" ? recebido : null,
        troco: formaPagamento === "dinheiro" ? centavos(Math.max(0, recebido - total)) : null,
        abertaEm: mesa.abertaEm,
        atendente: mesa.atendente?.nome ?? null,
        operador: action.operador ?? null,
        data: Date.now(),
      };
      return {
        ...atualizarMesa(state, mesa.id, (m) => novaMesa(m.numero)),
        historico: [venda, ...state.historico],
      };
    }

    case "CRIAR_FUNCIONARIO": {
      const id = `f${Date.now().toString(36)}`;
      const novo = {
        id,
        nome: action.nome.trim(),
        funcao: action.funcao,
        pinHash: hashPin(action.pin, id),
        pinPadrao: false,
        ativo: true,
        criadoEm: Date.now(),
      };
      return { ...state, funcionarios: [...state.funcionarios, novo] };
    }

    case "EDITAR_FUNCIONARIO": {
      const funcionarios = state.funcionarios.map((f) => {
        if (f.id !== action.id) return f;
        const { pin, ...dados } = action.dados;
        const editado = { ...f, ...dados };
        if (pin) Object.assign(editado, { pinHash: hashPin(pin, f.id), pinPadrao: false });
        return editado;
      });
      // Nunca deixa o sistema sem um administrador ativo.
      if (totalAdminsAtivos(funcionarios) === 0) return state;
      return { ...state, funcionarios };
    }

    case "REMOVER_FUNCIONARIO": {
      const funcionarios = state.funcionarios.filter((f) => f.id !== action.id);
      if (totalAdminsAtivos(funcionarios) === 0) return state;
      return { ...state, funcionarios };
    }

    case "FECHAR_CAIXA":
      return { ...state, historico: [] };

    default:
      return state;
  }
}
