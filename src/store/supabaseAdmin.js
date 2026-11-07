// Conexão do PORTAL DO DONO DO SISTEMA (/admin).
// Diferente da conexão dos restaurantes: usa login por e-mail + 2FA do Supabase Auth
// e guarda a sessão neste navegador. Só é criada quando alguém abre o portal.
import { createClient } from "@supabase/supabase-js";
import { traduzirErro } from "./supabase";

const env = import.meta.env ?? {};
let cliente = null;

export function clienteAdmin() {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
  cliente ??= createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "sistema-garcom-admin" },
  });
  return cliente;
}

export async function rpcAdmin(funcao, args = {}) {
  const { data, error } = await clienteAdmin().rpc(funcao, args);
  if (error) throw error;
  return data;
}

const MENSAGENS_ADMIN = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Este e-mail ainda não foi confirmado.",
  "Invalid TOTP code entered": "Código incorreto. Confira o aplicativo e tente de novo.",
  "Invalid MFA Challenge": "O código expirou. Tente de novo.",
  CODIGO_EM_USO: "Já existe um restaurante com esse código.",
  CODIGO_INVALIDO: "Código inválido: use letras minúsculas, números e hífen (ex.: pizzaria-centro).",
  MFA_NECESSARIO: "Confirme o código do 2FA para continuar.",
  MOTIVO_OBRIGATORIO: "Informe o motivo do acesso de suporte.",
  SEM_ADMIN: "Este restaurante não tem administrador ativo. Resete o PIN de alguém antes.",
};

export function traduzirErroAdmin(erro) {
  const msg = erro?.message ?? "";
  const chave = Object.keys(MENSAGENS_ADMIN).find((c) => msg.includes(c));
  return chave ? MENSAGENS_ADMIN[chave] : traduzirErro(erro);
}
