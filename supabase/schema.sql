-- =====================================================================
--  Sistema Garçom — banco de dados (PostgreSQL / Supabase) — MULTIEMPRESA
--
--  Como usar (instalação do ZERO): copie este arquivo inteiro, cole no
--  "SQL Editor" do Supabase e clique em "Run".
--
--  ATENÇÃO: rodar de novo APAGA E RECRIA todas as tabelas (perde os dados).
--  Quem já tem o banco funcionando deve rodar só as migrações novas
--  (supabase/migracao-*.sql), nunca este arquivo.
--
--  Segurança:
--   * Todas as tabelas têm RLS ligado e nenhuma política → o site NÃO
--     consegue ler nem gravar nelas diretamente.
--   * O site só conversa com o banco pelas funções (RPC) deste arquivo.
--     Cada função confere a sessão (token), a função do funcionário e
--     descobre a EMPRESA pela sessão — o site nunca informa a empresa.
--   * PINs são guardados com bcrypt (pgcrypto), nunca em texto puro.
--   * As chaves estrangeiras incluem a empresa: o próprio banco impede
--     que um item, mesa ou venda aponte para dados de outro restaurante.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

drop table if exists comanda_itens, comandas, venda_pagamentos, vendas, fechamentos_caixa,
  rascunho_itens, mesas, produtos, categorias, sessoes, funcionarios, empresas cascade;

-- ---------------------------------------------------------------------
--  TABELAS
-- ---------------------------------------------------------------------

-- Cada restaurante que usa o sistema.
create table empresas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) between 1 and 60),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  cnpj          text,
  status        text not null default 'ativa' check (status in ('ativa', 'suspensa')),
  plano         text not null default 'gratis',
  taxa_servico  numeric(4, 3) not null default 0.10 check (taxa_servico between 0 and 0.3),
  canal         uuid not null default gen_random_uuid(), -- nome secreto do canal de tempo real
  criada_em     timestamptz not null default now(),
  ultimo_acesso timestamptz
);

create table funcionarios (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas (id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 1 and 40),
  funcao        text not null check (funcao in ('admin', 'garcom', 'cozinha', 'caixa')),
  pin_hash      text not null,
  pin_padrao    boolean not null default false,
  ativo         boolean not null default true,
  falhas_login  int not null default 0,
  bloqueado_ate timestamptz,
  criado_em     timestamptz not null default now()
);
-- O mesmo nome pode existir em restaurantes diferentes.
create unique index funcionarios_nome_unico on funcionarios (empresa_id, lower(trim(nome)));

create table sessoes (
  token          uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references funcionarios (id) on delete cascade,
  criada_em      timestamptz not null default now(),
  expira_em      timestamptz not null default now() + interval '12 hours'
);

create table categorias (
  empresa_id uuid not null references empresas (id) on delete cascade,
  id         text not null,
  nome       text not null,
  ordem      int not null default 0,
  ativa      boolean not null default true, -- false = apagada (some do cardápio, mas fica no histórico)
  primary key (empresa_id, id)
);

create table produtos (
  id           serial primary key,
  empresa_id   uuid not null references empresas (id) on delete cascade,
  categoria_id text not null,
  nome         text not null,
  preco        numeric(10, 2) not null check (preco >= 0),
  ativo        boolean not null default true,
  unique (empresa_id, id),
  foreign key (empresa_id, categoria_id) references categorias (empresa_id, id)
);

create table mesas (
  empresa_id   uuid not null references empresas (id) on delete cascade,
  numero       int not null,
  aberta_em    timestamptz,
  atendente_id uuid references funcionarios (id) on delete set null,
  observacao   text not null default '',
  ativa        boolean not null default true, -- false = mesa desativada pelo admin
  primary key (empresa_id, numero)
);

-- Itens que o garçom está lançando e ainda não enviou à cozinha.
create table rascunho_itens (
  empresa_id    uuid not null,
  mesa_numero   int not null,
  produto_id    int not null,
  obs           text not null default '', -- observação do item (ex.: "sem cebola")
  qtd           int not null check (qtd > 0),
  adicionado_em timestamptz not null default clock_timestamp(),
  primary key (empresa_id, mesa_numero, produto_id, obs),
  foreign key (empresa_id, mesa_numero) references mesas (empresa_id, numero) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id)
);

create table fechamentos_caixa (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas (id) on delete cascade,
  fechado_em    timestamptz not null default now(),
  operador_id   uuid references funcionarios (id) on delete set null,
  operador_nome text,
  quantidade    int not null,
  total         numeric(10, 2) not null
);

create table vendas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null,
  mesa_numero     int not null,
  subtotal        numeric(10, 2) not null,
  taxa            numeric(10, 2) not null default 0,
  total           numeric(10, 2) not null,
  forma_pagamento text not null check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'misto')),
  pessoas         int not null default 1 check (pessoas >= 1),
  recebido        numeric(10, 2),
  troco           numeric(10, 2),
  aberta_em       timestamptz,
  fechada_em      timestamptz not null default now(),
  atendente_id    uuid references funcionarios (id) on delete set null,
  atendente_nome  text,
  operador_id     uuid references funcionarios (id) on delete set null,
  operador_nome   text,
  fechamento_id   uuid references fechamentos_caixa (id), -- null = ainda no caixa do dia
  unique (empresa_id, id),
  foreign key (empresa_id, mesa_numero) references mesas (empresa_id, numero)
);
create index vendas_empresa_data on vendas (empresa_id, fechada_em);

-- Uma venda pode ser paga em várias formas (ex.: R$ 20 dinheiro + R$ 5 débito + R$ 5 crédito).
-- "valor" é quanto foi entregue naquela forma; o troco (vendas.troco) sai sempre do dinheiro.
create table venda_pagamentos (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venda_id   uuid not null,
  forma      text not null check (forma in ('dinheiro', 'pix', 'credito', 'debito')),
  valor      numeric(10, 2) not null check (valor > 0),
  unique (venda_id, forma),
  foreign key (empresa_id, venda_id) references vendas (empresa_id, id) on delete cascade
);

-- Cada envio para a cozinha vira uma comanda.
create table comandas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null,
  mesa_numero    int not null,
  numero         int not null,
  observacao     text not null default '',
  status         text not null default 'preparo' check (status in ('preparo', 'pronto', 'entregue')),
  enviada_em     timestamptz not null default now(),
  pronta_em      timestamptz,
  entregue_em    timestamptz,
  atendente_id   uuid references funcionarios (id) on delete set null,
  atendente_nome text,
  venda_id       uuid, -- null = conta da mesa ainda aberta
  unique (empresa_id, id),
  foreign key (empresa_id, mesa_numero) references mesas (empresa_id, numero),
  foreign key (empresa_id, venda_id) references vendas (empresa_id, id)
);
create index comandas_abertas on comandas (empresa_id, mesa_numero) where venda_id is null;

create table comanda_itens (
  id         serial primary key,
  empresa_id uuid not null,
  comanda_id uuid not null,
  produto_id int not null,
  nome       text not null,           -- cópia do nome/preço no momento do pedido
  preco      numeric(10, 2) not null,
  qtd        int not null check (qtd > 0),
  obs        text not null default '',
  foreign key (empresa_id, comanda_id) references comandas (empresa_id, id) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id)
);

-- ---------------------------------------------------------------------
--  SEGURANÇA: ninguém acessa as tabelas direto, só pelas funções.
-- ---------------------------------------------------------------------

alter table empresas          enable row level security;
alter table funcionarios      enable row level security;
alter table sessoes           enable row level security;
alter table categorias        enable row level security;
alter table produtos          enable row level security;
alter table mesas             enable row level security;
alter table rascunho_itens    enable row level security;
alter table fechamentos_caixa enable row level security;
alter table vendas            enable row level security;
alter table venda_pagamentos  enable row level security;
alter table comandas          enable row level security;
alter table comanda_itens     enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
--  DADOS INICIAIS (um restaurante de exemplo)
-- ---------------------------------------------------------------------

insert into empresas (nome, slug) values ('Meu Restaurante', 'meu-restaurante');

insert into funcionarios (empresa_id, nome, funcao, pin_hash, pin_padrao)
select id, 'Administrador', 'admin', extensions.crypt('1234', extensions.gen_salt('bf', 8)), true
from empresas where slug = 'meu-restaurante';

insert into mesas (empresa_id, numero)
select id, generate_series(1, 10) from empresas where slug = 'meu-restaurante';

insert into categorias (empresa_id, id, nome, ordem)
select e.id, c.id, c.nome, c.ordem
from empresas e,
  (values ('ALAMINUTAS', 'Alaminutas', 1), ('MASSAS', 'Massas', 2), ('PORCOES', 'Porções', 3),
          ('BEBIDAS', 'Bebidas', 4), ('SOBREMESAS', 'Sobremesas', 5)) as c (id, nome, ordem)
where e.slug = 'meu-restaurante';

insert into produtos (id, empresa_id, categoria_id, nome, preco)
select p.id, e.id, p.cat, p.nome, p.preco
from empresas e,
  (values
    (1, 'ALAMINUTAS', 'Alaminuta Carne', 29), (2, 'ALAMINUTAS', 'Alaminuta Frango', 28),
    (3, 'ALAMINUTAS', 'Chuleta', 37), (4, 'ALAMINUTAS', 'Alcatra', 38),
    (5, 'ALAMINUTAS', 'Picanha', 45), (6, 'ALAMINUTAS', 'Filé Mignon', 42),
    (20, 'MASSAS', 'Lasanha Bolonhesa', 32), (21, 'MASSAS', 'Lasanha Frango', 30),
    (22, 'MASSAS', 'Espaguete Carbonara', 28), (23, 'MASSAS', 'Nhoque ao Sugo', 26),
    (30, 'PORCOES', 'Batata Frita', 18), (31, 'PORCOES', 'Polenta Frita', 15),
    (32, 'PORCOES', 'Mandioca Frita', 16), (33, 'PORCOES', 'Fritas com Cheddar', 22),
    (34, 'PORCOES', 'Torresmo', 20),
    (40, 'BEBIDAS', 'Refrigerante 1L', 10), (41, 'BEBIDAS', 'Refrigerante Lata', 6),
    (42, 'BEBIDAS', 'KS', 5), (43, 'BEBIDAS', 'Água', 4), (44, 'BEBIDAS', '600ml', 8),
    (45, 'BEBIDAS', 'Suco Natural', 9), (46, 'BEBIDAS', 'Cerveja Long Neck', 10),
    (47, 'BEBIDAS', 'Limonada', 8),
    (50, 'SOBREMESAS', 'Pudim', 12), (51, 'SOBREMESAS', 'Petit Gateau', 18),
    (52, 'SOBREMESAS', 'Sorvete 2 Bolas', 14), (53, 'SOBREMESAS', 'Mousse Maracujá', 13)
  ) as p (id, cat, nome, preco)
where e.slug = 'meu-restaurante';
select setval('produtos_id_seq', (select max(id) from produtos));

-- =====================================================================
--  FUNÇÕES (início do bloco que as migrações também aplicam)
-- =====================================================================

-- Apaga as versões anteriores das funções do sistema (várias mudaram de parâmetros).
-- Só mexe nas funções com estes nomes; nada de extensões ou de outros sistemas.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        '_ms', '_sessao', '_empresa_por_slug', '_checar_mesa', '_liberar_se_vazia', '_json_empresa', '_json_mesas',
        '_json_venda', '_json_historico', '_json_funcionarios', '_json_cardapio', '_validar_pin',
        'empresa_publica', 'listar_funcionarios_login', 'entrar', 'sair', 'estado',
        'adicionar_item', 'remover_item', 'observacao_item', 'limpar_rascunho', 'definir_observacao',
        'enviar_cozinha', 'cancelar_comanda', 'transferir_mesa', 'mudar_status_comanda',
        'finalizar_conta', 'fechar_caixa', 'criar_funcionario', 'editar_funcionario', 'remover_funcionario',
        'configurar_empresa', 'definir_mesas', 'salvar_categoria', 'remover_categoria', 'mover_categoria',
        'salvar_produto', 'remover_produto', 'relatorio'])
  loop
    execute 'drop function ' || r.assinatura;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  FUNÇÕES INTERNAS (não ficam acessíveis pelo site)
-- ---------------------------------------------------------------------

create or replace function _ms(t timestamptz) returns bigint
language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

-- Confere o token e a função. Admin do restaurante pode tudo NO SEU restaurante.
-- O funcionário devolvido traz o empresa_id: é por ele que todas as funções filtram.
create or replace function _sessao(p_token uuid, p_funcoes text[] default null)
returns funcionarios
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_expira timestamptz;
begin
  select s.expira_em into v_expira from sessoes s where s.token = p_token and s.expira_em > now();
  select f.* into u
  from sessoes s
  join funcionarios f on f.id = s.funcionario_id
  join empresas e on e.id = f.empresa_id
  where s.token = p_token and s.expira_em > now() and f.ativo and e.status = 'ativa';

  if u.id is null then
    raise exception 'SESSAO_INVALIDA';
  end if;
  if p_funcoes is not null and u.funcao <> 'admin' and not (u.funcao = any (p_funcoes)) then
    raise exception 'SEM_PERMISSAO';
  end if;
  -- Renova a sessão enquanto a pessoa está usando (e marca o último acesso do restaurante).
  if v_expira < now() + interval '11 hours' then
    update sessoes set expira_em = now() + interval '12 hours' where token = p_token;
    update empresas set ultimo_acesso = now() where id = u.empresa_id;
  end if;
  return u;
end $$;

create or replace function _empresa_por_slug(p_slug text) returns empresas
language sql stable security definer set search_path = public as $$
  select * from empresas where slug = lower(trim(coalesce(p_slug, '')));
$$;

create or replace function _checar_mesa(p_empresa uuid, p_mesa int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from mesas where empresa_id = p_empresa and numero = p_mesa and ativa) then
    raise exception 'MESA_INVALIDA';
  end if;
end $$;

-- Mesa sem rascunho e sem comandas abertas volta a ficar livre.
create or replace function _liberar_se_vazia(p_empresa uuid, p_mesa int) returns void
language sql security definer set search_path = public as $$
  update mesas set aberta_em = null, atendente_id = null, observacao = ''
  where empresa_id = p_empresa and numero = p_mesa
    and not exists (select 1 from rascunho_itens where empresa_id = p_empresa and mesa_numero = p_mesa)
    and not exists (select 1 from comandas where empresa_id = p_empresa and mesa_numero = p_mesa and venda_id is null);
$$;

create or replace function _json_empresa(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome', nome, 'slug', slug, 'taxaServico', taxa_servico, 'canal', canal)
  from empresas where id = p_empresa;
$$;

create or replace function _json_mesas(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.numero,
    'numero', m.numero,
    'abertaEm', _ms(m.aberta_em),
    'observacao', m.observacao,
    'atendente', case when f.id is null then null else jsonb_build_object('id', f.id, 'nome', f.nome) end,
    'rascunho', coalesce((
      select jsonb_agg(jsonb_build_object('produtoId', p.id, 'nome', p.nome, 'preco', p.preco, 'qtd', r.qtd, 'obs', r.obs)
                       order by r.adicionado_em, p.id, r.obs)
      from rascunho_itens r join produtos p on p.empresa_id = r.empresa_id and p.id = r.produto_id
      where r.empresa_id = p_empresa and r.mesa_numero = m.numero), '[]'::jsonb),
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
          select jsonb_agg(jsonb_build_object('produtoId', ci.produto_id, 'nome', ci.nome, 'preco', ci.preco,
                                              'qtd', ci.qtd, 'obs', ci.obs)
                           order by ci.id)
          from comanda_itens ci where ci.empresa_id = p_empresa and ci.comanda_id = c.id), '[]'::jsonb)
      ) order by c.numero)
      from comandas c
      where c.empresa_id = p_empresa and c.mesa_numero = m.numero and c.venda_id is null), '[]'::jsonb)
  ) order by m.numero), '[]'::jsonb)
  from mesas m left join funcionarios f on f.id = m.atendente_id
  where m.empresa_id = p_empresa and m.ativa;
$$;

-- Uma venda no formato que o site usa.
create or replace function _json_venda(v vendas) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', v.id,
    'mesa', v.mesa_numero,
    'subtotal', v.subtotal,
    'taxa', v.taxa,
    'total', v.total,
    'formaPagamento', v.forma_pagamento,
    'pessoas', v.pessoas,
    'recebido', v.recebido,
    'troco', v.troco,
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object('forma', vp.forma, 'valor', vp.valor)
        order by array_position(array['dinheiro', 'pix', 'credito', 'debito'], vp.forma))
      from venda_pagamentos vp where vp.empresa_id = v.empresa_id and vp.venda_id = v.id), '[]'::jsonb),
    'abertaEm', _ms(v.aberta_em),
    'data', _ms(v.fechada_em),
    'atendente', v.atendente_nome,
    'operador', v.operador_nome,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('produtoId', x.produto_id, 'nome', x.nome, 'preco', x.preco, 'qtd', x.qtd))
      from (
        select ci.produto_id, ci.nome, ci.preco, sum(ci.qtd)::int as qtd
        from comandas c join comanda_itens ci on ci.empresa_id = c.empresa_id and ci.comanda_id = c.id
        where c.empresa_id = v.empresa_id and c.venda_id = v.id
        group by ci.produto_id, ci.nome, ci.preco
      ) x), '[]'::jsonb)
  );
$$;

-- Vendas do caixa aberto (ainda não fechado).
create or replace function _json_historico(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_json_venda(v) order by v.fechada_em desc), '[]'::jsonb)
  from vendas v
  where v.empresa_id = p_empresa and v.fechamento_id is null;
$$;

create or replace function _json_funcionarios(p_empresa uuid, p_somente uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'nome', nome, 'funcao', funcao, 'pinPadrao', pin_padrao,
    'ativo', ativo, 'criadoEm', _ms(criado_em)
  ) order by nome), '[]'::jsonb)
  from funcionarios
  where empresa_id = p_empresa and (p_somente is null or id = p_somente);
$$;

create or replace function _json_cardapio(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'preco', p.preco) order by p.id)
      from produtos p where p.empresa_id = p_empresa and p.categoria_id = c.id and p.ativo), '[]'::jsonb)
  ) order by c.ordem, c.id), '[]'::jsonb)
  from categorias c
  where c.empresa_id = p_empresa and c.ativa;
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

-- Dados públicos de um restaurante pelo código do link (para a tela de login).
create or replace function empresa_publica(p_empresa text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nome', nome, 'slug', slug, 'ativa', status = 'ativa')
  from empresas where slug = lower(trim(coalesce(p_empresa, '')));
$$;

-- Quem pode entrar naquele restaurante (tela de login). Não expõe PIN.
create or replace function listar_funcionarios_login(p_empresa text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'nome', f.nome, 'funcao', f.funcao, 'ativo', true,
    'pinPadrao', f.funcao = 'admin' and f.pin_padrao
  ) order by f.nome), '[]'::jsonb)
  from funcionarios f join empresas e on e.id = f.empresa_id
  where e.slug = lower(trim(coalesce(p_empresa, ''))) and e.status = 'ativa' and f.ativo;
$$;

create or replace function entrar(p_empresa text, p_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  e empresas;
  f funcionarios;
  v_token uuid;
begin
  e := _empresa_por_slug(p_empresa);
  if e.id is null then
    return jsonb_build_object('ok', false, 'erro', 'EMPRESA_INVALIDA');
  end if;
  if e.status <> 'ativa' then
    return jsonb_build_object('ok', false, 'erro', 'EMPRESA_SUSPENSA');
  end if;

  -- O funcionário precisa ser DESTE restaurante.
  select * into f from funcionarios where id = p_id and empresa_id = e.id and ativo for update;
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
  update empresas set ultimo_acesso = now() where id = e.id;
  delete from sessoes where expira_em < now();
  insert into sessoes (funcionario_id) values (f.id) returning token into v_token;
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

create or replace function sair(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessoes where token = p_token;
$$;

-- Tudo que a tela precisa, já filtrado pelo restaurante e pela função de quem pediu.
create or replace function estado(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token);
  return jsonb_build_object(
    'usuarioId', u.id,
    'empresa', _json_empresa(u.empresa_id),
    'mesas', _json_mesas(u.empresa_id),
    'cardapio', _json_cardapio(u.empresa_id),
    'historico', case when u.funcao in ('admin', 'caixa') then _json_historico(u.empresa_id) else '[]'::jsonb end,
    'funcionarios', _json_funcionarios(u.empresa_id, case when u.funcao = 'admin' then null else u.id end)
  );
end $$;

-- ---------- Garçom ----------

create or replace function adicionar_item(p_token uuid, p_mesa int, p_produto int, p_obs text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom']);
  perform _checar_mesa(u.empresa_id, p_mesa);
  if not exists (select 1 from produtos where empresa_id = u.empresa_id and id = p_produto and ativo) then
    raise exception 'PRODUTO_INVALIDO';
  end if;

  insert into rascunho_itens (empresa_id, mesa_numero, produto_id, obs, qtd)
  values (u.empresa_id, p_mesa, p_produto, left(trim(coalesce(p_obs, '')), 100), 1)
  on conflict (empresa_id, mesa_numero, produto_id, obs) do update set qtd = rascunho_itens.qtd + 1;

  update mesas set aberta_em = coalesce(aberta_em, now()), atendente_id = coalesce(atendente_id, u.id)
  where empresa_id = u.empresa_id and numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function remover_item(p_token uuid, p_mesa int, p_produto int, p_obs text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_obs text := coalesce(p_obs, '');
begin
  u := _sessao(p_token, array['garcom']);
  delete from rascunho_itens
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto and obs = v_obs and qtd <= 1;
  update rascunho_itens set qtd = qtd - 1
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto and obs = v_obs;
  perform _liberar_se_vazia(u.empresa_id, p_mesa);
  return estado(p_token);
end $$;

-- Coloca observação em parte das unidades de um item (ex.: 1 dos 3 hambúrgueres "sem cebola").
create or replace function observacao_item(
  p_token uuid, p_mesa int, p_produto int, p_obs_antiga text, p_obs_nova text, p_qtd int
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_antiga text := coalesce(p_obs_antiga, '');
  v_nova text := left(trim(coalesce(p_obs_nova, '')), 100);
  v_atual int;
  v_qtd int;
begin
  u := _sessao(p_token, array['garcom']);
  select qtd into v_atual from rascunho_itens
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto and obs = v_antiga
  for update;
  if v_atual is null or v_nova = v_antiga then
    return estado(p_token);
  end if;

  v_qtd := least(greatest(coalesce(p_qtd, 1), 1), v_atual);
  if v_qtd = v_atual then
    delete from rascunho_itens
    where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto and obs = v_antiga;
  else
    update rascunho_itens set qtd = qtd - v_qtd
    where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto and obs = v_antiga;
  end if;

  insert into rascunho_itens (empresa_id, mesa_numero, produto_id, obs, qtd)
  values (u.empresa_id, p_mesa, p_produto, v_nova, v_qtd)
  on conflict (empresa_id, mesa_numero, produto_id, obs) do update set qtd = rascunho_itens.qtd + excluded.qtd;
  return estado(p_token);
end $$;

create or replace function limpar_rascunho(p_token uuid, p_mesa int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom']);
  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa;
  update mesas set observacao = '' where empresa_id = u.empresa_id and numero = p_mesa;
  perform _liberar_se_vazia(u.empresa_id, p_mesa);
  return estado(p_token);
end $$;

create or replace function definir_observacao(p_token uuid, p_mesa int, p_observacao text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom']);
  update mesas set observacao = left(coalesce(p_observacao, ''), 200)
  where empresa_id = u.empresa_id and numero = p_mesa;
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
  select * into m from mesas where empresa_id = u.empresa_id and numero = p_mesa for update;
  if not found then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa) then
    return estado(p_token);
  end if;

  insert into comandas (empresa_id, mesa_numero, numero, observacao, atendente_id, atendente_nome)
  values (
    u.empresa_id,
    p_mesa,
    coalesce((select max(numero) from comandas
              where empresa_id = u.empresa_id and mesa_numero = p_mesa and venda_id is null), 0) + 1,
    trim(m.observacao),
    u.id,
    u.nome
  )
  returning id into v_comanda;

  insert into comanda_itens (empresa_id, comanda_id, produto_id, nome, preco, qtd, obs)
  select u.empresa_id, v_comanda, p.id, p.nome, p.preco, r.qtd, r.obs
  from rascunho_itens r join produtos p on p.empresa_id = r.empresa_id and p.id = r.produto_id
  where r.empresa_id = u.empresa_id and r.mesa_numero = p_mesa
  order by r.adicionado_em, p.id, r.obs;

  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa;
  update mesas set observacao = '', aberta_em = coalesce(aberta_em, now()),
                   atendente_id = coalesce(atendente_id, u.id)
  where empresa_id = u.empresa_id and numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function cancelar_comanda(p_token uuid, p_comanda uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_mesa int;
begin
  u := _sessao(p_token, array['garcom']);
  delete from comandas
  where empresa_id = u.empresa_id and id = p_comanda and status = 'preparo' and venda_id is null
  returning mesa_numero into v_mesa;
  if v_mesa is not null then
    perform _liberar_se_vazia(u.empresa_id, v_mesa);
  end if;
  return estado(p_token);
end $$;

-- Leva a conta de uma mesa para outra. Se a outra já tiver conta, as duas viram uma só.
create or replace function transferir_mesa(p_token uuid, p_origem int, p_destino int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  o mesas;
  d mesas;
  v_base int;
  v_juntou boolean;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  if p_origem is null or p_destino is null or p_origem = p_destino then
    raise exception 'MESA_INVALIDA';
  end if;
  -- Trava as duas mesas sempre na mesma ordem (evita duas transferências se travarem).
  perform 1 from mesas where empresa_id = u.empresa_id and numero in (p_origem, p_destino) order by numero for update;
  select * into o from mesas where empresa_id = u.empresa_id and numero = p_origem and ativa;
  select * into d from mesas where empresa_id = u.empresa_id and numero = p_destino and ativa;
  if o.numero is null or d.numero is null then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_origem)
     and not exists (select 1 from comandas where empresa_id = u.empresa_id and mesa_numero = p_origem and venda_id is null) then
    raise exception 'MESA_VAZIA';
  end if;

  v_juntou := exists (select 1 from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_destino)
           or exists (select 1 from comandas where empresa_id = u.empresa_id and mesa_numero = p_destino and venda_id is null);
  select coalesce(max(numero), 0) into v_base
  from comandas where empresa_id = u.empresa_id and mesa_numero = p_destino and venda_id is null;

  update comandas set mesa_numero = p_destino, numero = numero + v_base
  where empresa_id = u.empresa_id and mesa_numero = p_origem and venda_id is null;

  insert into rascunho_itens (empresa_id, mesa_numero, produto_id, obs, qtd, adicionado_em)
  select empresa_id, p_destino, produto_id, obs, qtd, adicionado_em
  from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_origem
  on conflict (empresa_id, mesa_numero, produto_id, obs) do update set qtd = rascunho_itens.qtd + excluded.qtd;
  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_origem;

  update mesas set
    aberta_em    = case when v_juntou then least(d.aberta_em, o.aberta_em) else o.aberta_em end,
    atendente_id = coalesce(d.atendente_id, o.atendente_id),
    observacao   = concat_ws(' · ', nullif(trim(d.observacao), ''), nullif(trim(o.observacao), ''))
  where empresa_id = u.empresa_id and numero = p_destino;
  update mesas set aberta_em = null, atendente_id = null, observacao = ''
  where empresa_id = u.empresa_id and numero = p_origem;
  return estado(p_token);
end $$;

-- ---------- Cozinha / Garçom: andamento da comanda ----------

create or replace function mudar_status_comanda(p_token uuid, p_comanda uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  c comandas;
begin
  if p_status = 'entregue' then
    u := _sessao(p_token, array['garcom']);
  elsif p_status in ('pronto', 'preparo') then
    u := _sessao(p_token, array['cozinha']);
  else
    raise exception 'STATUS_INVALIDO';
  end if;

  select * into c from comandas
  where empresa_id = u.empresa_id and id = p_comanda and venda_id is null for update;
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
    where empresa_id = u.empresa_id and id = p_comanda;
  end if;
  return estado(p_token);
end $$;

-- ---------- Caixa ----------

-- p_pagamentos: [{"forma": "dinheiro", "valor": 20}, {"forma": "debito", "valor": 5}, ...]
create or replace function finalizar_conta(
  p_token uuid, p_mesa int, p_com_taxa boolean, p_pessoas int, p_pagamentos jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  m mesas;
  v_taxa_pct numeric;
  v_subtotal numeric(10, 2);
  v_taxa numeric(10, 2);
  v_total numeric(10, 2);
  v_pago numeric(10, 2);
  v_dinheiro numeric(10, 2);
  v_formas int;
  v_forma_unica text;
  v_venda uuid;
begin
  u := _sessao(p_token, array['caixa']);
  select * into m from mesas where empresa_id = u.empresa_id and numero = p_mesa for update;
  if not found then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from comandas where empresa_id = u.empresa_id and mesa_numero = p_mesa and venda_id is null) then
    raise exception 'MESA_SEM_CONTA';
  end if;

  -- Cada parte precisa ter uma forma válida e um valor numérico maior que zero.
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'PAGAMENTO_INVALIDO';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pagamentos) p
    where coalesce(p->>'forma', '') not in ('dinheiro', 'pix', 'credito', 'debito')
       or case when jsonb_typeof(p->'valor') = 'number' then round((p->>'valor')::numeric, 2) <= 0 else true end
  ) then
    raise exception 'PAGAMENTO_INVALIDO';
  end if;

  select coalesce(sum(ci.preco * ci.qtd), 0) into v_subtotal
  from comandas c join comanda_itens ci on ci.empresa_id = c.empresa_id and ci.comanda_id = c.id
  where c.empresa_id = u.empresa_id and c.mesa_numero = p_mesa and c.venda_id is null;

  select taxa_servico into v_taxa_pct from empresas where id = u.empresa_id;
  v_taxa := case when p_com_taxa then round(v_subtotal * v_taxa_pct, 2) else 0 end;
  v_total := v_subtotal + v_taxa;

  select sum(round((p->>'valor')::numeric, 2)),
         coalesce(sum(round((p->>'valor')::numeric, 2)) filter (where p->>'forma' = 'dinheiro'), 0),
         count(distinct p->>'forma'),
         min(p->>'forma')
    into v_pago, v_dinheiro, v_formas, v_forma_unica
  from jsonb_array_elements(p_pagamentos) p;

  if v_pago < v_total then
    raise exception 'VALOR_INSUFICIENTE';
  end if;
  -- Troco só sai do dinheiro: Pix e cartão juntos não podem passar do total.
  if v_pago - v_dinheiro > v_total then
    raise exception 'PAGAMENTO_EXCEDENTE';
  end if;

  insert into vendas (
    empresa_id, mesa_numero, subtotal, taxa, total, forma_pagamento, pessoas, recebido, troco,
    aberta_em, atendente_id, atendente_nome, operador_id, operador_nome
  ) values (
    u.empresa_id, p_mesa, v_subtotal, v_taxa, v_total,
    case when v_formas = 1 then v_forma_unica else 'misto' end,
    greatest(coalesce(p_pessoas, 1), 1),
    v_pago, v_pago - v_total,
    m.aberta_em, m.atendente_id, (select nome from funcionarios where id = m.atendente_id),
    u.id, u.nome
  ) returning id into v_venda;

  insert into venda_pagamentos (empresa_id, venda_id, forma, valor)
  select u.empresa_id, v_venda, p->>'forma', sum(round((p->>'valor')::numeric, 2))
  from jsonb_array_elements(p_pagamentos) p
  group by p->>'forma';

  update comandas set venda_id = v_venda
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and venda_id is null;
  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa;
  update mesas set aberta_em = null, atendente_id = null, observacao = ''
  where empresa_id = u.empresa_id and numero = p_mesa;
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
  if not exists (select 1 from vendas where empresa_id = u.empresa_id and fechamento_id is null) then
    return estado(p_token);
  end if;
  insert into fechamentos_caixa (empresa_id, operador_id, operador_nome, quantidade, total)
  select u.empresa_id, u.id, u.nome, count(*), coalesce(sum(total), 0)
  from vendas where empresa_id = u.empresa_id and fechamento_id is null
  returning id into v_id;
  update vendas set fechamento_id = v_id where empresa_id = u.empresa_id and fechamento_id is null;
  return estado(p_token);
end $$;

-- ---------- Administração da equipe ----------

create or replace function criar_funcionario(p_token uuid, p_nome text, p_funcao text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  perform _validar_pin(p_pin);
  if p_funcao is null or p_funcao not in ('admin', 'garcom', 'cozinha', 'caixa') then
    raise exception 'FUNCAO_INVALIDA';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 then
    raise exception 'NOME_INVALIDO';
  end if;
  begin
    insert into funcionarios (empresa_id, nome, funcao, pin_hash)
    values (u.empresa_id, trim(p_nome), p_funcao, crypt(p_pin, gen_salt('bf', 8)));
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
  if not exists (select 1 from funcionarios where id = p_id and empresa_id = u.empresa_id) then
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
    where id = p_id and empresa_id = u.empresa_id;
  exception when unique_violation then
    raise exception 'NOME_REPETIDO';
  end;

  -- Nunca deixa o restaurante sem administrador (desfaz tudo se acontecer).
  if not exists (select 1 from funcionarios where empresa_id = u.empresa_id and funcao = 'admin' and ativo) then
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
  delete from funcionarios where id = p_id and empresa_id = u.empresa_id;
  if not exists (select 1 from funcionarios where empresa_id = u.empresa_id and funcao = 'admin' and ativo) then
    raise exception 'ULTIMO_ADMIN';
  end if;
  return estado(p_token);
end $$;

-- ---------- Administração: restaurante, mesas e cardápio ----------

-- Nome do restaurante e % da taxa de serviço (0 a 30%).
create or replace function configurar_empresa(p_token uuid, p_nome text default null, p_taxa numeric default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  if p_nome is not null and length(trim(p_nome)) not between 1 and 60 then
    raise exception 'NOME_INVALIDO';
  end if;
  if p_taxa is not null and (p_taxa < 0 or p_taxa > 0.3) then
    raise exception 'TAXA_INVALIDA';
  end if;
  update empresas set
    nome = coalesce(trim(p_nome), nome),
    taxa_servico = coalesce(round(p_taxa, 3), taxa_servico)
  where id = u.empresa_id;
  return estado(p_token);
end $$;

-- Define quantas mesas o restaurante tem. Mesas a mais ficam desativadas (o histórico continua).
create or replace function definir_mesas(p_token uuid, p_quantidade int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 60 then
    raise exception 'MESAS_INVALIDAS';
  end if;
  perform 1 from mesas where empresa_id = u.empresa_id order by numero for update;
  if exists (
    select 1 from mesas m
    where m.empresa_id = u.empresa_id and m.numero > p_quantidade and m.ativa
      and (exists (select 1 from rascunho_itens r where r.empresa_id = m.empresa_id and r.mesa_numero = m.numero)
           or exists (select 1 from comandas c where c.empresa_id = m.empresa_id and c.mesa_numero = m.numero and c.venda_id is null))
  ) then
    raise exception 'MESA_OCUPADA';
  end if;
  insert into mesas (empresa_id, numero)
  select u.empresa_id, generate_series(1, p_quantidade)
  on conflict (empresa_id, numero) do nothing;
  update mesas set ativa = (numero <= p_quantidade) where empresa_id = u.empresa_id;
  return estado(p_token);
end $$;

create or replace function salvar_categoria(p_token uuid, p_id text, p_nome text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_nome text := trim(coalesce(p_nome, ''));
begin
  u := _sessao(p_token, array['admin']);
  if length(v_nome) not between 1 and 40 then
    raise exception 'NOME_INVALIDO';
  end if;
  if p_id is null then
    insert into categorias (empresa_id, id, nome, ordem)
    values (u.empresa_id, 'C' || substr(md5(random()::text || clock_timestamp()::text), 1, 8), v_nome,
            coalesce((select max(ordem) from categorias where empresa_id = u.empresa_id), 0) + 1);
  else
    update categorias set nome = v_nome where empresa_id = u.empresa_id and id = p_id and ativa;
    if not found then
      raise exception 'CATEGORIA_INVALIDA';
    end if;
  end if;
  return estado(p_token);
end $$;

create or replace function remover_categoria(p_token uuid, p_id text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  if exists (select 1 from produtos where empresa_id = u.empresa_id and categoria_id = p_id and ativo) then
    raise exception 'CATEGORIA_COM_PRODUTOS';
  end if;
  update categorias set ativa = false where empresa_id = u.empresa_id and id = p_id;
  return estado(p_token);
end $$;

-- Sobe (p_direcao = -1) ou desce (+1) a categoria na ordem do cardápio.
create or replace function mover_categoria(p_token uuid, p_id text, p_direcao int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  a categorias;
  b categorias;
begin
  u := _sessao(p_token, array['admin']);
  perform 1 from categorias where empresa_id = u.empresa_id order by id for update;
  -- Renumera 1, 2, 3… para não haver empate.
  update categorias c set ordem = x.n
  from (select id, row_number() over (order by ordem, id) as n from categorias where empresa_id = u.empresa_id) x
  where c.empresa_id = u.empresa_id and c.id = x.id;

  select * into a from categorias where empresa_id = u.empresa_id and id = p_id and ativa;
  if not found then
    raise exception 'CATEGORIA_INVALIDA';
  end if;
  if p_direcao < 0 then
    select * into b from categorias where empresa_id = u.empresa_id and ativa and ordem < a.ordem order by ordem desc limit 1;
  else
    select * into b from categorias where empresa_id = u.empresa_id and ativa and ordem > a.ordem order by ordem limit 1;
  end if;
  if b.id is not null then
    update categorias set ordem = case when id = a.id then b.ordem else a.ordem end
    where empresa_id = u.empresa_id and id in (a.id, b.id);
  end if;
  return estado(p_token);
end $$;

-- Cria (p_id nulo) ou edita um produto.
create or replace function salvar_produto(p_token uuid, p_id int, p_categoria text, p_nome text, p_preco numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_nome text := trim(coalesce(p_nome, ''));
begin
  u := _sessao(p_token, array['admin']);
  if length(v_nome) not between 1 and 60 then
    raise exception 'NOME_INVALIDO';
  end if;
  if p_preco is null or p_preco < 0 or p_preco > 99999 then
    raise exception 'PRECO_INVALIDO';
  end if;
  if not exists (select 1 from categorias where empresa_id = u.empresa_id and id = p_categoria and ativa) then
    raise exception 'CATEGORIA_INVALIDA';
  end if;
  if p_id is null then
    insert into produtos (empresa_id, categoria_id, nome, preco)
    values (u.empresa_id, p_categoria, v_nome, round(p_preco, 2));
  else
    update produtos set categoria_id = p_categoria, nome = v_nome, preco = round(p_preco, 2)
    where empresa_id = u.empresa_id and id = p_id and ativo;
    if not found then
      raise exception 'PRODUTO_INVALIDO';
    end if;
  end if;
  return estado(p_token);
end $$;

-- Tira o produto do cardápio. Pedidos e vendas antigos continuam com o nome e o preço da época.
create or replace function remover_produto(p_token uuid, p_id int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  update produtos set ativo = false where empresa_id = u.empresa_id and id = p_id;
  return estado(p_token);
end $$;

-- ---------- Relatórios ----------

-- Todas as vendas do período (inclusive de caixas já fechados) e os fechamentos de caixa.
create or replace function relatorio(p_token uuid, p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['admin']);
  return jsonb_build_object(
    'vendas', coalesce((
      select jsonb_agg(_json_venda(v) order by v.fechada_em desc)
      from vendas v where v.empresa_id = u.empresa_id and v.fechada_em between p_de and p_ate), '[]'::jsonb),
    'fechamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'data', _ms(f.fechado_em), 'operador', f.operador_nome,
        'quantidade', f.quantidade, 'total', f.total) order by f.fechado_em desc)
      from fechamentos_caixa f where f.empresa_id = u.empresa_id and f.fechado_em between p_de and p_ate), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
--  PERMISSÕES DAS FUNÇÕES
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  empresa_publica, listar_funcionarios_login, entrar, sair, estado,
  adicionar_item, remover_item, observacao_item, limpar_rascunho, definir_observacao, enviar_cozinha,
  cancelar_comanda, transferir_mesa,
  mudar_status_comanda, finalizar_conta, fechar_caixa,
  criar_funcionario, editar_funcionario, remover_funcionario,
  configurar_empresa, definir_mesas, salvar_categoria, remover_categoria, mover_categoria, salvar_produto, remover_produto,
  relatorio
to anon, authenticated;

-- =====================================================================
--  FUNÇÕES (fim do bloco que as migrações também aplicam)
-- =====================================================================

-- Avisa a API do Supabase para recarregar a lista de funções.
notify pgrst, 'reload schema';
