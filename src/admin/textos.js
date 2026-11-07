// Nomes das ações do log de auditoria, para mostrar na tela.
export const ACOES = {
  login: "🔑 Entrou no sistema",
  login_bloqueado: "⛔ Login bloqueado (PIN errado 5x)",
  pedido_cancelado: "🗑️ Cancelou pedido",
  caixa_fechado: "💰 Fechou o caixa",
  funcionario_criado: "👤 Cadastrou funcionário",
  funcionario_editado: "✏️ Editou funcionário",
  funcionario_removido: "🗑️ Removeu funcionário",
  restaurante_configurado: "⚙️ Mudou dados do restaurante",
  mesas_definidas: "🪑 Mudou a quantidade de mesas",
  categoria_criada: "📂 Criou categoria",
  categoria_renomeada: "📂 Renomeou categoria",
  categoria_removida: "📂 Apagou categoria",
  produto_criado: "🍽️ Criou produto",
  produto_editado: "🍽️ Editou produto",
  produto_removido: "🍽️ Tirou produto do cardápio",
  preco_alterado: "💲 Mudou preço",
  restaurante_criado: "🏪 Criou o restaurante",
  restaurante_editado: "🏪 Editou o restaurante",
  restaurante_suspenso: "⏸️ Suspendeu o restaurante",
  restaurante_ativado: "▶️ Reativou o restaurante",
  pin_resetado: "🔐 Resetou PIN",
  suporte_iniciado: "🛟 Acessou como suporte",
};

export const TIPOS_ATOR = {
  funcionario: { label: "Funcionário", cor: "cinza" },
  suporte: { label: "Suporte", cor: "amarelo" },
  super_admin: { label: "Dono do sistema", cor: "laranja" },
};

export const PLANOS = [
  { id: "gratis", label: "Grátis" },
  { id: "basico", label: "Básico" },
  { id: "pro", label: "Pro" },
];

const NOMES_DETALHES = {
  nome: "nome",
  funcao: "função",
  ativo: "ativo",
  pin_trocado: "trocou PIN",
  funcionario: "funcionário",
  produto: "produto",
  de: "de",
  para: "para",
  preco: "preço",
  taxa: "taxa",
  quantidade: "quantidade",
  vendas: "vendas",
  total: "total",
  mesa: "mesa",
  motivo: "motivo",
  codigo: "código",
  admin: "admin",
  modelo: "cardápio copiado de",
  cnpj: "CNPJ",
  plano: "plano",
};

/** Detalhes do log em texto curto: "produto: Pudim · de: 12 · para: 14". */
export function descreverDetalhes(detalhes) {
  return Object.entries(detalhes ?? {})
    .filter(([k, v]) => v != null && v !== "" && k !== "comanda")
    .map(([k, v]) => {
      const valor = k === "taxa" && typeof v === "number" ? `${Math.round(v * 1000) / 10}%` : v === true ? "sim" : v === false ? "não" : v;
      return `${NOMES_DETALHES[k] ?? k}: ${valor}`;
    })
    .join(" · ");
}

/** PIN provisório aleatório de 4 dígitos (evita sequências óbvias). */
export function gerarPin() {
  const ruins = new Set(["0000", "1111", "1234", "4321", "2222", "9999", "1212"]);
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
    const pin = String(n).padStart(4, "0");
    if (!ruins.has(pin)) return pin;
  }
}
