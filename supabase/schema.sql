-- =====================================================================
--  Sistema Garçom — banco de dados (PostgreSQL / Supabase)
--
--  Como usar: copie este arquivo inteiro, cole no "SQL Editor" do
--  Supabase e clique em "Run".
--
--  ATENÇÃO: rodar de novo APAGA E RECRIA todas as tabelas (perde os dados).
--
--  Segurança:
--   * Todas as tabelas têm RLS ligado e nenhuma política → o site NÃO
--     consegue ler nem gravar nelas diretamente.
--   * O site só conversa com o banco pelas funções (RPC) no fim do arquivo.
--     Cada função confere a sessão (token) e a função do funcionário.
--   * PINs são guardados com bcrypt (pgcrypto), nunca em texto puro.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

drop table if exists comanda_itens, comandas, vendas, fechamentos_caixa,
  rascunho_itens, mesas, produtos, categorias, sessoes, funcionarios cascade;

-- ---------------------------------------------------------------------
--  TABELAS
-- ---------------------------------------------------------------------

create table funcionarios (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) between 1 and 40),
  funcao        text not null check (funcao in ('admin', 'garcom', 'cozinha', 'caixa')),
  pin_hash      text not null,
  pin_padrao    boolean not null default false,
  ativo         boolean not null default true,
  falhas_login  int not null default 0,
  bloqueado_ate timestamptz,
  criado_em     timestamptz not null default now()
);
create unique index funcionarios_nome_unico on funcionarios (lower(trim(nome)));

create table sessoes (
  token          uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios (id) on delete cascade,
  criada_em      timestamptz not null default now(),
  expira_em      timestamptz not null default now() + interval '12 hours'
);

create table categorias (
  id    text primary key,
  nome  text not null,
  ordem int not null default 0
);

create table produtos (
  id           serial primary key,
  categoria_id text not null references categorias (id),
  nome         text not null,
  preco        numeric(10, 2) not null check (preco >= 0),
  ativo        boolean not null default true
);

create table mesas (
  numero       int primary key,
  aberta_em    timestamptz,
  atendente_id uuid references funcionarios (id) on delete set null,
  observacao   text not null default ''
);

-- Itens que o garçom está lançando e ainda não enviou à cozinha.
create table rascunho_itens (
  mesa_numero   int not null references mesas (numero) on delete cascade,
  produto_id    int not null references produtos (id),
  qtd           int not null check (qtd > 0),
  adicionado_em timestamptz not null default clock_timestamp(),
  primary key (mesa_numero, produto_id)
);

create table fechamentos_caixa (
  id            uuid primary key default gen_random_uuid(),
  fechado_em    timestamptz not null default now(),
  operador_id   uuid references funcionarios (id) on delete set null,
  operador_nome text,
  quantidade    int not null,
  total         numeric(10, 2) not null
);

create table vendas (
  id              uuid primary key default gen_random_uuid(),
  mesa_numero     int not null references mesas (numero),
  subtotal        numeric(10, 2) not null,
  taxa            numeric(10, 2) not null default 0,
  total           numeric(10, 2) not null,
  forma_pagamento text not null check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito')),
  pessoas         int not null default 1 check (pessoas >= 1),
  recebido        numeric(10, 2),
  troco           numeric(10, 2),
  aberta_em       timestamptz,
  fechada_em      timestamptz not null default now(),
  atendente_id    uuid references funcionarios (id) on delete set null,
  atendente_nome  text,
  operador_id     uuid references funcionarios (id) on delete set null,
  operador_nome   text,
  fechamento_id   uuid references fechamentos_caixa (id) -- null = ainda no caixa do dia
);

-- Cada envio para a cozinha vira uma comanda.
create table comandas (
  id             uuid primary key default gen_random_uuid(),
  mesa_numero    int not null references mesas (numero),
  numero         int not null,
  observacao     text not null default '',
  status         text not null default 'preparo' check (status in ('preparo', 'pronto', 'entregue')),
  enviada_em     timestamptz not null default now(),
  pronta_em      timestamptz,
  entregue_em    timestamptz,
  atendente_id   uuid references funcionarios (id) on delete set null,
  atendente_nome text,
  venda_id       uuid references vendas (id) -- null = conta da mesa ainda aberta
);
create index comandas_abertas on comandas (mesa_numero) where venda_id is null;

create table comanda_itens (
  id         serial primary key,
  comanda_id uuid not null references comandas (id) on delete cascade,
  produto_id int not null references produtos (id),
  nome       text not null,           -- cópia do nome/preço no momento do pedido
  preco      numeric(10, 2) not null,
  qtd        int not null check (qtd > 0)
);

-- ---------------------------------------------------------------------
--  SEGURANÇA: ninguém acessa as tabelas direto, só pelas funções.
-- ---------------------------------------------------------------------

alter table funcionarios      enable row level security;
alter table sessoes           enable row level security;
alter table categorias        enable row level security;
alter table produtos          enable row level security;
alter table mesas             enable row level security;
alter table rascunho_itens    enable row level security;
alter table fechamentos_caixa enable row level security;
alter table vendas            enable row level security;
alter table comandas          enable row level security;
alter table comanda_itens     enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
--  DADOS INICIAIS
-- ---------------------------------------------------------------------

insert into funcionarios (nome, funcao, pin_hash, pin_padrao)
values ('Administrador', 'admin', extensions.crypt('1234', extensions.gen_salt('bf', 8)), true);

insert into mesas (numero) select generate_series(1, 10);

insert into categorias (id, nome, ordem) values
  ('ALAMINUTAS', 'Alaminutas', 1),
  ('MASSAS', 'Massas', 2),
  ('PORCOES', 'Porções', 3),
  ('BEBIDAS', 'Bebidas', 4),
  ('SOBREMESAS', 'Sobremesas', 5);

insert into produtos (id, categoria_id, nome, preco) values
  (1, 'ALAMINUTAS', 'Alaminuta Carne', 29),
  (2, 'ALAMINUTAS', 'Alaminuta Frango', 28),
  (3, 'ALAMINUTAS', 'Chuleta', 37),
  (4, 'ALAMINUTAS', 'Alcatra', 38),
  (5, 'ALAMINUTAS', 'Picanha', 45),
  (6, 'ALAMINUTAS', 'Filé Mignon', 42),
  (20, 'MASSAS', 'Lasanha Bolonhesa', 32),
  (21, 'MASSAS', 'Lasanha Frango', 30),
  (22, 'MASSAS', 'Espaguete Carbonara', 28),
  (23, 'MASSAS', 'Nhoque ao Sugo', 26),
  (30, 'PORCOES', 'Batata Frita', 18),
  (31, 'PORCOES', 'Polenta Frita', 15),
  (32, 'PORCOES', 'Mandioca Frita', 16),
  (33, 'PORCOES', 'Fritas com Cheddar', 22),
  (34, 'PORCOES', 'Torresmo', 20),
  (40, 'BEBIDAS', 'Refrigerante 1L', 10),
  (41, 'BEBIDAS', 'Refrigerante Lata', 6),
  (42, 'BEBIDAS', 'KS', 5),
  (43, 'BEBIDAS', 'Água', 4),
  (44, 'BEBIDAS', '600ml', 8),
  (45, 'BEBIDAS', 'Suco Natural', 9),
  (46, 'BEBIDAS', 'Cerveja Long Neck', 10),
  (47, 'BEBIDAS', 'Limonada', 8),
  (50, 'SOBREMESAS', 'Pudim', 12),
  (51, 'SOBREMESAS', 'Petit Gateau', 18),
  (52, 'SOBREMESAS', 'Sorvete 2 Bolas', 14),
  (53, 'SOBREMESAS', 'Mousse Maracujá', 13);
select setval('produtos_id_seq', (select max(id) from produtos));

-- ---------------------------------------------------------------------
--  FUNÇÕES INTERNAS (não ficam acessíveis pelo site)
-- ---------------------------------------------------------------------

create or replace function _ms(t timestamptz) returns bigint
language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

-- Confere o token e a função. Admin pode tudo.
create or replace function _sessao(p_token uuid, p_funcoes text[] default null)
returns funcionarios
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_expira timestamptz;
begin
  select s.expira_em into v_expira from sessoes s where s.token = p_token and s.expira_em > now();
  select f.* into u from sessoes s join funcionarios f on f.id = s.funcionario_id
  where s.token = p_token and s.expira_em > now() and f.ativo;

  if u.id is null then
    raise exception 'SESSAO_INVALIDA';
  end if;
  if p_funcoes is not null and u.funcao <> 'admin' and not (u.funcao = any (p_funcoes)) then
    raise exception 'SEM_PERMISSAO';
  end if;
  -- Renova a sessão enquanto a pessoa está usando.
  if v_expira < now() + interval '11 hours' then
    update sessoes set expira_em = now() + interval '12 hours' where token = p_token;
  end if;
  return u;
end $$;

create or replace function _checar_mesa(p_mesa int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from mesas where numero = p_mesa) then
    raise exception 'MESA_INVALIDA';
  end if;
end $$;

-- Mesa sem rascunho e sem comandas abertas volta a ficar livre.
create or replace function _liberar_se_vazia(p_mesa int) returns void
language sql security definer set search_path = public as $$
  update mesas set aberta_em = null, atendente_id = null, observacao = ''
  where numero = p_mesa
    and not exists (select 1 from rascunho_itens where mesa_numero = p_mesa)
    and not exists (select 1 from comandas where mesa_numero = p_mesa and venda_id is null);
$$;

create or replace function _json_mesas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.numero,
    'numero', m.numero,
    'abertaEm', _ms(m.aberta_em),
    'observacao', m.observacao,
    'atendente', case when f.id is null then null else jsonb_build_object('id', f.id, 'nome', f.nome) end,
    'rascunho', coalesce((
      select jsonb_agg(jsonb_build_object('produtoId', p.id, 'nome', p.nome, 'preco', p.preco, 'qtd', r.qtd)
                       order by r.adicionado_em, p.id)
      from rascunho_itens r join produtos p on p.id = r.produto_id
      where r.mesa_numero = m.numero), '[]'::jsonb),
    'comandas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'numero', c.numero,
        'observacao', c.observacao,
        'status', c.status,
        'enviadaEm', _ms(c.enviada_em),
        'prontaEm', _ms(c.pronta_em),
        'entregueEm', _ms(c.entregue_em),
        'atendente', case when c.atendente_nome is null then null
                     else jsonb_build_object('id', c.atendente_id, 'nome', c.atendente_nome) end,
        'itens', coalesce((
          select jsonb_agg(jsonb_build_object('produtoId', ci.produto_id, 'nome', ci.nome, 'preco', ci.preco, 'qtd', ci.qtd)
                           order by ci.id)
          from comanda_itens ci where ci.comanda_id = c.id), '[]'::jsonb)
      ) order by c.numero)
      from comandas c where c.mesa_numero = m.numero and c.venda_id is null), '[]'::jsonb)
  ) order by m.numero), '[]'::jsonb)
  from mesas m left join funcionarios f on f.id = m.atendente_id;
$$;

create or replace function _json_historico() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'mesa', v.mesa_numero,
    'subtotal', v.subtotal,
    'taxa', v.taxa,
    'total', v.total,
    'formaPagamento', v.forma_pagamento,
    'pessoas', v.pessoas,
    'recebido', v.recebido,
    'troco', v.troco,
    'abertaEm', _ms(v.aberta_em),
    'data', _ms(v.fechada_em),
    'atendente', v.atendente_nome,
    'operador', v.operador_nome,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('produtoId', x.produto_id, 'nome', x.nome, 'preco', x.preco, 'qtd', x.qtd))
      from (
        select ci.produto_id, ci.nome, ci.preco, sum(ci.qtd)::int as qtd
        from comandas c join comanda_itens ci on ci.comanda_id = c.id
        where c.venda_id = v.id
        group by ci.produto_id, ci.nome, ci.preco
      ) x), '[]'::jsonb)
  ) order by v.fechada_em desc), '[]'::jsonb)
  from vendas v
  where v.fechamento_id is null;
$$;

create or replace function _json_funcionarios(p_somente uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'nome', nome, 'funcao', funcao, 'pinPadrao', pin_padrao,
    'ativo', ativo, 'criadoEm', _ms(criado_em)
  ) order by nome), '[]'::jsonb)
  from funcionarios
  where p_somente is null or id = p_somente;
$$;

create or replace function _json_cardapio() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'preco', p.preco) order by p.id)
      from produtos p where p.categoria_id = c.id and p.ativo), '[]'::jsonb)
  ) order by c.ordem), '[]'::jsonb)
  from categorias c;
$$;

create or replace function _validar_pin(p_pin text) returns void
language plpgsql as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_INVALIDO';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  API (funções chamadas pelo site)
-- ---------------------------------------------------------------------

-- Lista de quem pode entrar (tela de login). Não expõe PIN.
create or replace function listar_funcionarios_login() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'nome', nome, 'funcao', funcao, 'ativo', true,
    'pinPadrao', funcao = 'admin' and pin_padrao
  ) order by nome), '[]'::jsonb)
  from funcionarios where ativo;
$$;

create or replace function entrar(p_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  f funcionarios;
  v_token uuid;
begin
  select * into f from funcionarios where id = p_id and ativo for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'USUARIO_INVALIDO');
  end if;

  if f.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro', 'BLOQUEADO',
      'segundos', ceil(extract(epoch from f.bloqueado_ate - now()))::int);
  end if;

  if p_pin is null or f.pin_hash is distinct from crypt(p_pin, f.pin_hash) then
    if f.falhas_login + 1 >= 5 then
      update funcionarios set falhas_login = 0, bloqueado_ate = now() + interval '30 seconds' where id = f.id;
      return jsonb_build_object('ok', false, 'erro', 'BLOQUEADO', 'segundos', 30);
    end if;
    update funcionarios set falhas_login = falhas_login + 1 where id = f.id;
    return jsonb_build_object('ok', false, 'erro', 'PIN_INCORRETO', 'restantes', 4 - f.falhas_login);
  end if;

  update funcionarios set falhas_login = 0, bloqueado_ate = null where id = f.id;
  delete from sessoes where expira_em < now();
  insert into sessoes (funcionario_id) values (f.id) returning token into v_token;
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

create or replace function sair(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessoes where token = p_token;
$$;

-- Tudo que a tela precisa, já filtrado pela função de quem pediu.
create or replace function estado(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token);
  return jsonb_build_object(
    'usuarioId', u.id,
    'mesas', _json_mesas(),
    'cardapio', _json_cardapio(),
    'historico', case when u.funcao in ('admin', 'caixa') then _json_historico() else '[]'::jsonb end,
    'funcionarios', _json_funcionarios(case when u.funcao = 'admin' then null else u.id end)
  );
end $$;

-- ---------- Garçom ----------

create or replace function adicionar_item(p_token uuid, p_mesa int, p_produto int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom']);
  perform _checar_mesa(p_mesa);
  if not exists (select 1 from produtos where id = p_produto and ativo) then
    raise exception 'PRODUTO_INVALIDO';
  end if;

  insert into rascunho_itens (mesa_numero, produto_id, qtd) values (p_mesa, p_produto, 1)
  on conflict (mesa_numero, produto_id) do update set qtd = rascunho_itens.qtd + 1;

  update mesas set aberta_em = coalesce(aberta_em, now()), atendente_id = coalesce(atendente_id, u.id)
  where numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function remover_item(p_token uuid, p_mesa int, p_produto int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['garcom']);
  delete from rascunho_itens where mesa_numero = p_mesa and produto_id = p_produto and qtd <= 1;
  update rascunho_itens set qtd = qtd - 1 where mesa_numero = p_mesa and produto_id = p_produto;
  perform _liberar_se_vazia(p_mesa);
  return estado(p_token);
end $$;

create or replace function limpar_rascunho(p_token uuid, p_mesa int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['garcom']);
  delete from rascunho_itens where mesa_numero = p_mesa;
  update mesas set observacao = '' where numero = p_mesa;
  perform _liberar_se_vazia(p_mesa);
  return estado(p_token);
end $$;

create or replace function definir_observacao(p_token uuid, p_mesa int, p_observacao text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['garcom']);
  update mesas set observacao = left(coalesce(p_observacao, ''), 200) where numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function enviar_cozinha(p_token uuid, p_mesa int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  m mesas;
  v_comanda uuid;
begin
  u := _sessao(p_token, array['garcom']);
  select * into m from mesas where numero = p_mesa for update;
  if not found then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from rascunho_itens where mesa_numero = p_mesa) then
    return estado(p_token);
  end if;

  insert into comandas (mesa_numero, numero, observacao, atendente_id, atendente_nome)
  values (
    p_mesa,
    coalesce((select max(numero) from comandas where mesa_numero = p_mesa and venda_id is null), 0) + 1,
    trim(m.observacao),
    u.id,
    u.nome
  )
  returning id into v_comanda;

  insert into comanda_itens (comanda_id, produto_id, nome, preco, qtd)
  select v_comanda, p.id, p.nome, p.preco, r.qtd
  from rascunho_itens r join produtos p on p.id = r.produto_id
  where r.mesa_numero = p_mesa
  order by r.adicionado_em, p.id;

  delete from rascunho_itens where mesa_numero = p_mesa;
  update mesas set observacao = '', aberta_em = coalesce(aberta_em, now()),
                   atendente_id = coalesce(atendente_id, u.id)
  where numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function cancelar_comanda(p_token uuid, p_comanda uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_mesa int;
begin
  perform _sessao(p_token, array['garcom']);
  delete from comandas
  where id = p_comanda and status = 'preparo' and venda_id is null
  returning mesa_numero into v_mesa;
  if v_mesa is not null then
    perform _liberar_se_vazia(v_mesa);
  end if;
  return estado(p_token);
end $$;

-- ---------- Cozinha / Garçom: andamento da comanda ----------

create or replace function mudar_status_comanda(p_token uuid, p_comanda uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c comandas;
begin
  if p_status = 'entregue' then
    perform _sessao(p_token, array['garcom']);
  elsif p_status in ('pronto', 'preparo') then
    perform _sessao(p_token, array['cozinha']);
  else
    raise exception 'STATUS_INVALIDO';
  end if;

  select * into c from comandas where id = p_comanda and venda_id is null for update;
  if not found then
    raise exception 'COMANDA_INVALIDA';
  end if;

  -- Transições permitidas: preparo → pronto → entregue (e pronto → preparo para desfazer).
  if (p_status = 'pronto' and c.status = 'preparo')
     or (p_status in ('preparo', 'entregue') and c.status = 'pronto') then
    update comandas set
      status = p_status,
      pronta_em = case p_status when 'pronto' then now() when 'preparo' then null else pronta_em end,
      entregue_em = case when p_status = 'entregue' then now() else entregue_em end
    where id = p_comanda;
  end if;
  return estado(p_token);
end $$;

-- ---------- Caixa ----------

create or replace function finalizar_conta(
  p_token uuid, p_mesa int, p_forma text, p_com_taxa boolean, p_pessoas int, p_recebido numeric default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  m mesas;
  v_subtotal numeric(10, 2);
  v_taxa numeric(10, 2);
  v_total numeric(10, 2);
  v_venda uuid;
begin
  u := _sessao(p_token, array['caixa']);
  select * into m from mesas where numero = p_mesa for update;
  if not found then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from comandas where mesa_numero = p_mesa and venda_id is null) then
    raise exception 'MESA_SEM_CONTA';
  end if;
  if p_forma is null or p_forma not in ('dinheiro', 'pix', 'credito', 'debito') then
    raise exception 'PAGAMENTO_INVALIDO';
  end if;

  select coalesce(sum(ci.preco * ci.qtd), 0) into v_subtotal
  from comandas c join comanda_itens ci on ci.comanda_id = c.id
  where c.mesa_numero = p_mesa and c.venda_id is null;

  v_taxa := case when p_com_taxa then round(v_subtotal * 0.10, 2) else 0 end;
  v_total := v_subtotal + v_taxa;

  if p_forma = 'dinheiro' and coalesce(p_recebido, 0) < v_total then
    raise exception 'VALOR_INSUFICIENTE';
  end if;

  insert into vendas (
    mesa_numero, subtotal, taxa, total, forma_pagamento, pessoas, recebido, troco,
    aberta_em, atendente_id, atendente_nome, operador_id, operador_nome
  ) values (
    p_mesa, v_subtotal, v_taxa, v_total, p_forma, greatest(coalesce(p_pessoas, 1), 1),
    case when p_forma = 'dinheiro' then p_recebido end,
    case when p_forma = 'dinheiro' then p_recebido - v_total end,
    m.aberta_em, m.atendente_id, (select nome from funcionarios where id = m.atendente_id),
    u.id, u.nome
  ) returning id into v_venda;

  update comandas set venda_id = v_venda where mesa_numero = p_mesa and venda_id is null;
  delete from rascunho_itens where mesa_numero = p_mesa;
  update mesas set aberta_em = null, atendente_id = null, observacao = '' where numero = p_mesa;
  return estado(p_token);
end $$;

-- Fecha o caixa do dia: as vendas saem do histórico da tela, mas ficam no banco.
create or replace function fechar_caixa(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_id uuid;
begin
  u := _sessao(p_token, array['caixa']);
  if not exists (select 1 from vendas where fechamento_id is null) then
    return estado(p_token);
  end if;
  insert into fechamentos_caixa (operador_id, operador_nome, quantidade, total)
  select u.id, u.nome, count(*), coalesce(sum(total), 0) from vendas where fechamento_id is null
  returning id into v_id;
  update vendas set fechamento_id = v_id where fechamento_id is null;
  return estado(p_token);
end $$;

-- ---------- Administração da equipe ----------

create or replace function criar_funcionario(p_token uuid, p_nome text, p_funcao text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['admin']);
  perform _validar_pin(p_pin);
  if p_funcao is null or p_funcao not in ('admin', 'garcom', 'cozinha', 'caixa') then
    raise exception 'FUNCAO_INVALIDA';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'NOME_INVALIDO';
  end if;
  begin
    insert into funcionarios (nome, funcao, pin_hash)
    values (trim(p_nome), p_funcao, crypt(p_pin, gen_salt('bf', 8)));
  exception when unique_violation then
    raise exception 'NOME_REPETIDO';
  end;
  return estado(p_token);
end $$;

create or replace function editar_funcionario(
  p_token uuid, p_id uuid,
  p_nome text default null, p_funcao text default null, p_ativo boolean default null, p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  if not exists (select 1 from funcionarios where id = p_id) then
    raise exception 'FUNCIONARIO_INVALIDO';
  end if;
  if p_id = u.id and ((p_funcao is not null and p_funcao <> u.funcao) or p_ativo = false) then
    raise exception 'NAO_PODE_SI_MESMO';
  end if;
  if p_pin is not null then
    perform _validar_pin(p_pin);
  end if;
  if p_funcao is not null and p_funcao not in ('admin', 'garcom', 'cozinha', 'caixa') then
    raise exception 'FUNCAO_INVALIDA';
  end if;
  if p_nome is not null and length(trim(p_nome)) = 0 then
    raise exception 'NOME_INVALIDO';
  end if;

  begin
    update funcionarios set
      nome = coalesce(trim(p_nome), nome),
      funcao = coalesce(p_funcao, funcao),
      ativo = coalesce(p_ativo, ativo),
      pin_hash = case when p_pin is not null then crypt(p_pin, gen_salt('bf', 8)) else pin_hash end,
      pin_padrao = case when p_pin is not null then false else pin_padrao end,
      falhas_login = case when p_pin is not null then 0 else falhas_login end,
      bloqueado_ate = case when p_pin is not null then null else bloqueado_ate end
    where id = p_id;
  exception when unique_violation then
    raise exception 'NOME_REPETIDO';
  end;

  -- Nunca deixa o sistema sem administrador (desfaz tudo se acontecer).
  if not exists (select 1 from funcionarios where funcao = 'admin' and ativo) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  -- Quem foi desativado é desconectado na hora.
  if p_ativo = false then
    delete from sessoes where funcionario_id = p_id;
  end if;
  return estado(p_token);
end $$;

create or replace function remover_funcionario(p_token uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  if p_id = u.id then
    raise exception 'NAO_PODE_SI_MESMO';
  end if;
  delete from funcionarios where id = p_id;
  if not exists (select 1 from funcionarios where funcao = 'admin' and ativo) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  return estado(p_token);
end $$;

-- ---------------------------------------------------------------------
--  PERMISSÕES DAS FUNÇÕES
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  listar_funcionarios_login, entrar, sair, estado,
  adicionar_item, remover_item, limpar_rascunho, definir_observacao, enviar_cozinha, cancelar_comanda,
  mudar_status_comanda, finalizar_conta, fechar_caixa,
  criar_funcionario, editar_funcionario, remover_funcionario
to anon, authenticated;

-- Avisa a API do Supabase para recarregar a lista de funções.
notify pgrst, 'reload schema';
