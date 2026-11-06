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
      return ["adicionar_item", { p_mesa: acao.mesaId, p_produto: acao.produto.id, p_obs: acao.obs ?? "" }];
    case "REMOVER_ITEM":
      return ["remover_item", { p_mesa: acao.mesaId, p_produto: acao.produtoId, p_obs: acao.obs ?? "" }];
    case "OBSERVACAO_ITEM":
      return [
        "observacao_item",
        {
          p_mesa: acao.mesaId,
          p_produto: acao.produtoId,
          p_obs_antiga: acao.obsAntiga,
          p_obs_nova: acao.obs,
          p_qtd: acao.qtd,
        },
      ];
    case "TRANSFERIR_MESA":
      return ["transferir_mesa", { p_origem: acao.origemId, p_destino: acao.destinoId }];
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
      return ["cancelar_comanda", { p_comanda: acao.comandaId }];
    case "FINALIZAR_CONTA":
      return [
        "finalizar_conta",
        {
          p_mesa: acao.mesaId,
          p_com_taxa: acao.comTaxa,
          p_pessoas: acao.pessoas,
          p_pagamentos: acao.pagamentos,
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
