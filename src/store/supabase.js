// Conexão com o banco de dados (Supabase).
// Se as variáveis de ambiente não estiverem definidas, o sistema roda em
// "modo local" (dados só no navegador), como antes.
import { createClient } from "@supabase/supabase-js";

const env = import.meta.env ?? {};
const url = env.VITE_SUPABASE_URL;
const chave = env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;

export const MODO = supabase ? "nuvem" : "local";

export async function rpc(funcao, args = {}) {
  const { data, error } = await supabase.rpc(funcao, args);
  if (error) throw error;
  return data;
}

const MENSAGENS = {
  SESSAO_INVALIDA: "Sua sessão expirou. Entre novamente.",
  SEM_PERMISSAO: "Você não tem permissão para fazer isso.",
  NOME_REPETIDO: "Já existe um funcionário com esse nome.",
  NOME_INVALIDO: "Informe um nome válido.",
  PIN_INVALIDO: "O PIN precisa ter 4 números.",
  FUNCAO_INVALIDA: "Função inválida.",
  ULTIMO_ADMIN: "O sistema precisa de pelo menos um administrador ativo.",
  NAO_PODE_SI_MESMO: "Você não pode alterar a sua própria função nem se desativar.",
  FUNCIONARIO_INVALIDO: "Funcionário não encontrado.",
  MESA_INVALIDA: "Mesa não encontrada.",
  MESA_SEM_CONTA: "Esta mesa não tem conta aberta.",
  PRODUTO_INVALIDO: "Produto indisponível.",
  COMANDA_INVALIDA: "Esse pedido não existe mais.",
  STATUS_INVALIDO: "Status inválido.",
  PAGAMENTO_INVALIDO: "Forma de pagamento inválida.",
  VALOR_INSUFICIENTE: "O valor recebido é menor que o total.",
  EMPRESA_INVALIDA: "Restaurante não encontrado. Confira o código.",
  EMPRESA_SUSPENSA: "Este restaurante está suspenso. Fale com o suporte.",
  TAXA_INVALIDA: "A taxa de serviço precisa ficar entre 0% e 30%.",
  PRODUTO_ESGOTADO: "Esse produto está esgotado.",
  OPCOES_INVALIDAS: "Confira as opções escolhidas (alguma obrigatória ficou de fora ou passou do limite).",
  PIN_ADMIN_INCORRETO: "PIN de administrador incorreto.",
  AUTORIZACAO_BLOQUEADA: "Muitos PINs errados. Aguarde 5 minutos para tentar de novo.",
  MOTIVO_OBRIGATORIO: "Informe o motivo.",
  DESCONTO_INVALIDO: "O desconto não pode ser maior que a conta.",
  ITEM_INVALIDO: "Esse item não existe mais.",
  BALCAO_COM_PEDIDOS: "Esse pedido já foi para a cozinha. Cancele os itens antes.",
  TIPO_INVALIDO: "Tipo de pedido inválido.",
  MESA_OCUPADA: "Não dá para tirar mesas que estão ocupadas. Feche a conta delas antes.",
  MESA_VAZIA: "Essa mesa não tem nada para transferir.",
  MESAS_INVALIDAS: "Quantidade de mesas inválida.",
  PRECO_INVALIDO: "Informe um preço válido.",
  CATEGORIA_INVALIDA: "Categoria não encontrada.",
  CATEGORIA_COM_PRODUTOS: "Remova ou mova os produtos dessa categoria antes de apagá-la.",
  PAGAMENTO_EXCEDENTE: "Pix e cartão não podem passar do total. Troco só sai do dinheiro.",
};

export function ehErroDeRede(erro) {
  return /fetch|network|Load failed|timeout/i.test(erro?.message ?? "");
}

export function traduzirErro(erro) {
  if (ehErroDeRede(erro)) return "Sem conexão com o servidor. Tentando novamente…";
  const codigo = Object.keys(MENSAGENS).find((c) => erro?.message?.includes(c));
  return codigo ? MENSAGENS[codigo] : "Não foi possível salvar. Tente de novo.";
}

/** Traduz uma ação do reducer para a função correspondente no banco. */
export function acaoParaRpc(acao) {
  const vazioParaNull = (v) => (v === undefined ? null : v);
  switch (acao.type) {
    case "ADICIONAR_ITEM":
      return [
        "adicionar_item",
        {
          p_mesa: acao.mesaId,
          p_produto: acao.produto.id,
          p_obs: acao.obs ?? "",
          p_opcoes: (acao.opcoes ?? []).map((o) => o.id),
        },
      ];
    case "REMOVER_ITEM":
      return [
        "remover_item",
        { p_mesa: acao.mesaId, p_produto: acao.produtoId, p_obs: acao.obs ?? "", p_opcoes_chave: acao.opcoesChave ?? "" },
      ];
    case "OBSERVACAO_ITEM":
      return [
        "observacao_item",
        {
          p_mesa: acao.mesaId,
          p_produto: acao.produtoId,
          p_obs_antiga: acao.obsAntiga,
          p_obs_nova: acao.obs,
          p_qtd: acao.qtd,
          p_opcoes_chave: acao.opcoesChave ?? "",
        },
      ];
    case "TRANSFERIR_MESA":
      return ["transferir_mesa", { p_origem: acao.origemId, p_destino: acao.destinoId }];
    case "CONFIGURAR_EMPRESA":
      return ["configurar_empresa", { p_nome: vazioParaNull(acao.nome), p_taxa: vazioParaNull(acao.taxa) }];
    case "DEFINIR_MESAS":
      return ["definir_mesas", { p_quantidade: acao.quantidade }];
    case "SALVAR_CATEGORIA":
      return ["salvar_categoria", { p_id: vazioParaNull(acao.id), p_nome: acao.nome }];
    case "REMOVER_CATEGORIA":
      return ["remover_categoria", { p_id: acao.id }];
    case "MOVER_CATEGORIA":
      return ["mover_categoria", { p_id: acao.id, p_direcao: acao.direcao }];
    case "SALVAR_PRODUTO":
      return [
        "salvar_produto",
        { p_id: vazioParaNull(acao.id), p_categoria: acao.categoriaId, p_nome: acao.nome, p_preco: acao.preco },
      ];
    case "REMOVER_PRODUTO":
      return ["remover_produto", { p_id: acao.id }];
    case "LIMPAR_RASCUNHO":
      return ["limpar_rascunho", { p_mesa: acao.mesaId }];
    case "DEFINIR_OBSERVACAO":
      return ["definir_observacao", { p_mesa: acao.mesaId, p_observacao: acao.observacao }];
    case "ENVIAR_COZINHA":
      return ["enviar_cozinha", { p_mesa: acao.mesaId }];
    case "MARCAR_PRONTO":
      return ["mudar_status_comanda", { p_comanda: acao.comandaId, p_status: "pronto" }];
    case "VOLTAR_PREPARO":
      return ["mudar_status_comanda", { p_comanda: acao.comandaId, p_status: "preparo" }];
    case "MARCAR_ENTREGUE":
      return ["mudar_status_comanda", { p_comanda: acao.comandaId, p_status: "entregue" }];
    case "CANCELAR_COMANDA":
      return ["cancelar_comanda", { p_comanda: acao.comandaId, p_motivo: acao.motivo, p_pin_admin: vazioParaNull(acao.pin) }];
    case "CANCELAR_ITEM":
      return [
        "cancelar_item",
        { p_item: acao.itemId, p_qtd: acao.qtd, p_motivo: acao.motivo, p_pin_admin: vazioParaNull(acao.pin) },
      ];
    case "CANCELAR_BALCAO":
      return ["cancelar_balcao", { p_mesa: acao.mesaId }];
    case "MARCAR_ESGOTADO":
      return ["marcar_esgotado", { p_produto: acao.produtoId, p_esgotado: acao.esgotado }];
    case "SALVAR_OPCOES_PRODUTO":
      return [
        "salvar_opcoes_produto",
        {
          p_produto: acao.produtoId,
          p_grupos: acao.grupos.map((g) => ({
            nome: g.nome,
            obrigatorio: g.obrigatorio,
            maximo: g.maximo,
            opcoes: g.opcoes.map((o) => ({ nome: o.nome, preco: Number(o.preco) || 0 })),
          })),
        },
      ];
    case "FINALIZAR_CONTA":
      return [
        "finalizar_conta",
        {
          p_mesa: acao.mesaId,
          p_com_taxa: acao.comTaxa,
          p_pessoas: acao.pessoas,
          p_pagamentos: acao.pagamentos,
          p_desconto: acao.desconto ?? 0,
          p_desconto_motivo: vazioParaNull(acao.descontoMotivo),
          p_pin_admin: vazioParaNull(acao.pin),
        },
      ];
    case "FECHAR_CAIXA":
      return ["fechar_caixa", {}];
    case "CRIAR_FUNCIONARIO":
      return ["criar_funcionario", { p_nome: acao.nome, p_funcao: acao.funcao, p_pin: acao.pin }];
    case "EDITAR_FUNCIONARIO":
      return [
        "editar_funcionario",
        {
          p_id: acao.id,
          p_nome: vazioParaNull(acao.dados.nome),
          p_funcao: vazioParaNull(acao.dados.funcao),
          p_ativo: vazioParaNull(acao.dados.ativo),
          p_pin: vazioParaNull(acao.dados.pin),
        },
      ];
    case "REMOVER_FUNCIONARIO":
      return ["remover_funcionario", { p_id: acao.id }];
    default:
      return null;
  }
}
