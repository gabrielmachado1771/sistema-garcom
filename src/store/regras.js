// Regras de negócio puras (sem React): estado inicial, reducer e seletores.

import { hashPin, PIN_PADRAO_ADMIN } from "../utils/pin.js";
import { produtos as produtosLocais, categoriaLabels } from "../data/cardapio.js";

export const NUM_MESAS = 10;
export const TAXA_SERVICO = 0.1; // padrão; cada restaurante pode configurar a sua
export const MINUTOS_ATRASO = 20;

export const centavos = (v) => Math.round(v * 100) / 100;

export const FORMAS_PAGAMENTO = [
  { id: "dinheiro", label: "Dinheiro", emoji: "💵" },
  { id: "pix", label: "Pix", emoji: "📱" },
  { id: "credito", label: "Crédito", emoji: "💳" },
  { id: "debito", label: "Débito", emoji: "🏧" },
];

export const MAX_MESAS = 60;

export const FUNCOES = {
  admin: { label: "Administrador", emoji: "🛡️", descricao: "Acesso total: todas as áreas, equipe e relatórios", cor: "bg-purple-500 text-white", areas: ["painel", "garcom", "cozinha", "caixa", "relatorios", "cardapio", "equipe"] },
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
  if (id === "misto") return "Misto";
  return FORMAS_PAGAMENTO.find((f) => f.id === id)?.label ?? id;
}

/** Partes do pagamento de uma venda (vendas antigas tinham uma forma só). */
export function pagamentosDaVenda(venda) {
  if (venda.pagamentos?.length) return venda.pagamentos;
  return [{ forma: venda.formaPagamento, valor: venda.recebido ?? venda.total }];
}

/** Ex.: "Dinheiro + Débito + Crédito". */
export function descreverPagamento(venda) {
  return pagamentosDaVenda(venda)
    .map((p) => labelPagamento(p.forma))
    .join(" + ");
}

/** Quanto entrou de fato em cada forma (o troco sai do dinheiro). */
export function totaisPorForma(historico) {
  const totais = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.id, 0]));
  for (const venda of historico) {
    for (const p of pagamentosDaVenda(venda)) {
      if (!(p.forma in totais)) continue;
      const liquido = p.forma === "dinheiro" ? p.valor - (venda.troco ?? 0) : p.valor;
      totais[p.forma] = centavos(totais[p.forma] + liquido);
    }
  }
  return totais;
}

/**
 * Confere um pagamento dividido em várias formas.
 * Regras: o total pago precisa cobrir a conta, e o troco só pode sair
 * do dinheiro (Pix e cartão não podem passar do valor da conta).
 */
export function resumoPagamento(pagamentos, total) {
  const pago = centavos(pagamentos.reduce((acc, p) => acc + p.valor, 0));
  const dinheiro = centavos(pagamentos.filter((p) => p.forma === "dinheiro").reduce((acc, p) => acc + p.valor, 0));
  const outros = centavos(pago - dinheiro);
  const falta = centavos(Math.max(0, total - pago));
  const troco = centavos(Math.max(0, pago - total));
  const excedente = centavos(Math.max(0, outros - total));
  const formasValidas = pagamentos.every((p) => FORMAS_PAGAMENTO.some((f) => f.id === p.forma) && p.valor > 0);
  return {
    pago,
    dinheiro,
    outros,
    falta,
    troco,
    excedente,
    valido: pagamentos.length > 0 && formasValidas && falta === 0 && excedente === 0,
  };
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
    versao: 4,
    mesas: Array.from({ length: NUM_MESAS }, (_, i) => novaMesa(i + 1)),
    historico: [], // vendas do caixa aberto
    arquivo: [], // vendas de caixas já fechados (para os relatórios)
    fechamentos: [],
    funcionarios: [adminPadrao()],
    cardapio: CARDAPIO_LOCAL,
    empresa: { nome: "Meu Restaurante", slug: null, taxaServico: TAXA_SERVICO },
  };
}

/** Converte dados salvos por versões antigas para o formato atual. */
export function migrar(salvo) {
  if (!salvo || !Array.isArray(salvo.mesas)) return null;
  let dados = salvo;
  if (dados.versao === 2) {
    dados = {
      ...dados,
      versao: 3,
      mesas: dados.mesas.map((m) => ({ atendente: null, ...m })),
      funcionarios: [adminPadrao()],
    };
  }
  if (dados.versao === 3) {
    dados = { ...dados, versao: 4, arquivo: [], fechamentos: [], cardapio: CARDAPIO_LOCAL };
  }
  if (dados.versao === 4 && !dados.empresa) {
    dados = { ...dados, empresa: { nome: "Meu Restaurante", slug: null, taxaServico: TAXA_SERVICO } };
  }
  return dados.versao === 4 ? dados : null;
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

/** Soma valores repetidos da mesma forma e mantém a ordem de FORMAS_PAGAMENTO. */
export function juntarPagamentos(pagamentos) {
  return FORMAS_PAGAMENTO.map((f) => ({
    forma: f.id,
    valor: centavos(pagamentos.filter((p) => p.forma === f.id).reduce((acc, p) => acc + centavos(p.valor), 0)),
  })).filter((p) => p.valor > 0);
}

/** Chave de uma linha do pedido: o mesmo produto com observações diferentes vira linhas separadas. */
export function chaveItem(item) {
  return `${item.produtoId}|${item.obs ?? ""}`;
}

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

// ---------- divisão da conta por itens ----------

/** Cada unidade consumida vira uma linha (2x Coca = 2 unidades), para poder atribuir a pessoas diferentes. */
export function unidadesDaConta(mesa) {
  return itensConsumidos(mesa).flatMap((item) =>
    Array.from({ length: item.qtd }, (_, i) => ({
      chave: `${item.produtoId}#${i}`,
      produtoId: item.produtoId,
      nome: item.nome,
      preco: item.preco,
    }))
  );
}

/** Reparte `total` (em centavos) proporcionalmente aos `pesos`, sem sobrar nem faltar centavo. */
function repartir(total, pesos) {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma === 0) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (total * p) / soma);
  const partes = brutos.map(Math.floor);
  let sobra = total - partes.reduce((a, b) => a + b, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) {
    if (sobra <= 0) break;
    partes[i]++;
    sobra--;
  }
  return partes;
}

/**
 * Quanto cada pessoa paga quando a conta é dividida por itens.
 * `atribuicao` liga a chave de cada unidade ao número da pessoa (0, 1, 2…).
 * Itens sem dono (ex.: porção para a mesa) são divididos igualmente entre todos.
 * A taxa de serviço é repartida na proporção do consumo de cada um.
 * A soma das partes é sempre exatamente o total da conta.
 */
export function dividirPorItens(unidades, atribuicao, pessoas, comTaxa, taxaServico = TAXA_SERVICO) {
  const emCentavos = (v) => Math.round(v * 100);
  const proprios = Array(pessoas).fill(0);
  let compartilhado = 0;
  for (const u of unidades) {
    const dono = atribuicao[u.chave];
    if (dono != null && dono < pessoas) proprios[dono] += emCentavos(u.preco);
    else compartilhado += emCentavos(u.preco);
  }
  const partesCompartilhadas = repartir(compartilhado, Array(pessoas).fill(1));
  const subtotais = proprios.map((v, i) => v + partesCompartilhadas[i]);
  const subtotalGeral = subtotais.reduce((a, b) => a + b, 0);
  const taxaGeral = comTaxa ? Math.round(subtotalGeral * taxaServico) : 0;
  const taxas = repartir(taxaGeral, subtotais);
  return subtotais.map((sub, i) => ({
    pessoa: i,
    proprio: proprios[i] / 100,
    compartilhado: partesCompartilhadas[i] / 100,
    subtotal: sub / 100,
    taxa: taxas[i] / 100,
    total: (sub + taxas[i]) / 100,
  }));
}

// ---------- relatórios ----------

function diaLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Junta uma lista de vendas em números para a tela de relatórios. */
export function gerarRelatorio(vendas, de, ate) {
  const total = centavos(vendas.reduce((a, v) => a + v.total, 0));
  const taxas = centavos(vendas.reduce((a, v) => a + v.taxa, 0));

  const dias = new Map();
  for (let t = new Date(de).setHours(0, 0, 0, 0); t <= ate; t = new Date(t).setDate(new Date(t).getDate() + 1)) {
    dias.set(diaLocal(t), { dia: diaLocal(t), total: 0, quantidade: 0 });
  }
  const produtos = new Map();
  const garcons = new Map();
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0, quantidade: 0 }));

  for (const v of vendas) {
    const d = dias.get(diaLocal(v.data)) ?? { dia: diaLocal(v.data), total: 0, quantidade: 0 };
    d.total = centavos(d.total + v.total);
    d.quantidade++;
    dias.set(d.dia, d);

    const h = horas[new Date(v.data).getHours()];
    h.total = centavos(h.total + v.total);
    h.quantidade++;

    for (const i of v.itens ?? []) {
      const p = produtos.get(i.produtoId) ?? { produtoId: i.produtoId, nome: i.nome, quantidade: 0, total: 0 };
      p.quantidade += i.qtd;
      p.total = centavos(p.total + i.preco * i.qtd);
      produtos.set(i.produtoId, p);
    }

    const nome = v.atendente ?? "Sem garçom";
    const g = garcons.get(nome) ?? { nome, quantidade: 0, total: 0, taxa: 0 };
    g.quantidade++;
    g.total = centavos(g.total + v.total);
    g.taxa = centavos(g.taxa + v.taxa);
    garcons.set(nome, g);
  }

  return {
    total,
    taxas,
    quantidade: vendas.length,
    ticketMedio: vendas.length ? centavos(total / vendas.length) : 0,
    porDia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    porHora: horas.filter((h) => h.quantidade > 0),
    porForma: totaisPorForma(vendas),
    produtos: [...produtos.values()].sort((a, b) => b.quantidade - a.quantidade || b.total - a.total),
    garcons: [...garcons.values()].sort((a, b) => b.total - a.total),
  };
}

// ---------- cardápio ----------

function semAcento(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function novoIdCategoria(nome, existentes) {
  const base = semAcento(nome).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "CATEGORIA";
  let id = base;
  for (let n = 2; existentes.some((c) => c.id === id); n++) id = `${base}_${n}`;
  return id;
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
        const obs = action.obs ?? "";
        const mesmaLinha = (i) => i.produtoId === produto.id && (i.obs ?? "") === obs;
        const rascunho = m.rascunho.some(mesmaLinha)
          ? m.rascunho.map((i) => (mesmaLinha(i) ? { ...i, qtd: i.qtd + 1 } : i))
          : [
              ...m.rascunho,
              { produtoId: produto.id, nome: produto.nome, preco: produto.preco, qtd: 1, obs },
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
          .map((i) =>
            i.produtoId === action.produtoId && (i.obs ?? "") === (action.obs ?? "") ? { ...i, qtd: i.qtd - 1 } : i
          )
          .filter((i) => i.qtd > 0),
      }));

    case "OBSERVACAO_ITEM":
      // Move `qtd` unidades de uma linha para outra com a nova observação (ex.: 1 dos 3 hambúrgueres "sem cebola").
      return atualizarMesa(state, action.mesaId, (m) => {
        const obsNova = action.obs.trim().slice(0, 100);
        const origem = m.rascunho.find((i) => i.produtoId === action.produtoId && (i.obs ?? "") === action.obsAntiga);
        if (!origem || obsNova === action.obsAntiga) return m;
        const qtd = Math.min(Math.max(1, action.qtd), origem.qtd);
        let rascunho = m.rascunho
          .map((i) => (i === origem ? { ...i, qtd: i.qtd - qtd } : i))
          .filter((i) => i.qtd > 0);
        const destino = rascunho.find((i) => i.produtoId === action.produtoId && (i.obs ?? "") === obsNova);
        rascunho = destino
          ? rascunho.map((i) => (i === destino ? { ...i, qtd: i.qtd + qtd } : i))
          : [...rascunho, { ...origem, qtd, obs: obsNova }];
        return { ...m, rascunho };
      });

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
      const { comTaxa, pessoas } = action;
      const subtotal = totalMesa(mesa);
      const taxa = centavos(comTaxa ? subtotal * (state.empresa?.taxaServico ?? TAXA_SERVICO) : 0);
      const total = centavos(subtotal + taxa);
      const pagamentos = juntarPagamentos(action.pagamentos ?? []);
      const resumo = resumoPagamento(pagamentos, total);
      if (!resumo.valido) return state;
      const venda = {
        id: `${mesa.id}-${Date.now()}`,
        mesa: mesa.numero,
        itens: itensConsumidos(mesa),
        subtotal,
        taxa,
        total,
        formaPagamento: pagamentos.length === 1 ? pagamentos[0].forma : "misto",
        pagamentos,
        pessoas,
        recebido: resumo.pago,
        troco: resumo.troco,
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

    case "FECHAR_CAIXA": {
      if (state.historico.length === 0) return state;
      const fechamento = {
        id: `fc-${Date.now()}`,
        data: Date.now(),
        operador: action.operador ?? null,
        quantidade: state.historico.length,
        total: centavos(state.historico.reduce((a, v) => a + v.total, 0)),
      };
      return {
        ...state,
        historico: [],
        arquivo: [...state.historico, ...(state.arquivo ?? [])],
        fechamentos: [fechamento, ...(state.fechamentos ?? [])],
      };
    }

    case "TRANSFERIR_MESA": {
      // Leva tudo da mesa de origem para a de destino. Se o destino já tiver conta, as duas viram uma só.
      const origem = state.mesas.find((m) => m.id === action.origemId);
      const destino = state.mesas.find((m) => m.id === action.destinoId);
      if (!origem || !destino || origem === destino || !mesaOcupada(origem)) return state;
      const rascunho = [...destino.rascunho];
      for (const item of origem.rascunho) {
        const igual = rascunho.findIndex((i) => chaveItem(i) === chaveItem(item));
        if (igual >= 0) rascunho[igual] = { ...rascunho[igual], qtd: rascunho[igual].qtd + item.qtd };
        else rascunho.push(item);
      }
      const base = destino.comandas.reduce((max, c) => Math.max(max, c.numero), 0);
      const juntou = mesaOcupada(destino);
      const mesas = state.mesas.map((m) => {
        if (m.id === origem.id) return novaMesa(m.numero);
        if (m.id !== destino.id) return m;
        return {
          ...m,
          rascunho,
          comandas: [...m.comandas, ...origem.comandas.map((c) => ({ ...c, numero: base + c.numero }))],
          observacao: [m.observacao, origem.observacao].filter((o) => o.trim()).join(" · "),
          abertaEm: juntou ? Math.min(m.abertaEm ?? Infinity, origem.abertaEm ?? Infinity) : origem.abertaEm,
          atendente: m.atendente ?? origem.atendente,
        };
      });
      return { ...state, mesas };
    }

    case "CONFIGURAR_EMPRESA": {
      const empresa = { ...state.empresa };
      if (action.nome != null && action.nome.trim()) empresa.nome = action.nome.trim().slice(0, 60);
      if (action.taxa != null && action.taxa >= 0 && action.taxa <= 0.3) empresa.taxaServico = Math.round(action.taxa * 1000) / 1000;
      return { ...state, empresa };
    }

    case "DEFINIR_MESAS": {
      const qtd = Math.trunc(action.quantidade);
      if (!(qtd >= 1 && qtd <= MAX_MESAS)) return state;
      if (state.mesas.slice(qtd).some(mesaOcupada)) return state; // não some com mesa ocupada
      const mesas = Array.from({ length: qtd }, (_, i) => state.mesas[i] ?? novaMesa(i + 1));
      return { ...state, mesas };
    }

    case "SALVAR_CATEGORIA": {
      const nome = action.nome.trim();
      if (!nome) return state;
      const cardapio = action.id
        ? state.cardapio.map((c) => (c.id === action.id ? { ...c, nome } : c))
        : [...state.cardapio, { id: novoIdCategoria(nome, state.cardapio), nome, produtos: [] }];
      return { ...state, cardapio };
    }

    case "REMOVER_CATEGORIA": {
      const cat = state.cardapio.find((c) => c.id === action.id);
      if (!cat || cat.produtos.length > 0) return state;
      return { ...state, cardapio: state.cardapio.filter((c) => c !== cat) };
    }

    case "MOVER_CATEGORIA": {
      const i = state.cardapio.findIndex((c) => c.id === action.id);
      const j = i + action.direcao;
      if (i < 0 || j < 0 || j >= state.cardapio.length) return state;
      const cardapio = [...state.cardapio];
      [cardapio[i], cardapio[j]] = [cardapio[j], cardapio[i]];
      return { ...state, cardapio };
    }

    case "SALVAR_PRODUTO": {
      const nome = action.nome.trim();
      const preco = centavos(action.preco);
      if (!nome || !(preco >= 0) || !state.cardapio.some((c) => c.id === action.categoriaId)) return state;
      const id =
        action.id ?? Math.max(0, ...state.cardapio.flatMap((c) => c.produtos.map((p) => Number(p.id) || 0))) + 1;
      const produto = { id, nome, preco };
      const cardapio = state.cardapio.map((c) => {
        const semEle = c.produtos.filter((p) => p.id !== id);
        if (c.id !== action.categoriaId) return { ...c, produtos: semEle };
        const atual = c.produtos.findIndex((p) => p.id === id);
        const produtos = atual >= 0 ? c.produtos.map((p) => (p.id === id ? produto : p)) : [...semEle, produto];
        return { ...c, produtos };
      });
      return { ...state, cardapio };
    }

    case "REMOVER_PRODUTO":
      return {
        ...state,
        cardapio: state.cardapio.map((c) => ({ ...c, produtos: c.produtos.filter((p) => p.id !== action.id) })),
      };

    default:
      return state;
  }
}
