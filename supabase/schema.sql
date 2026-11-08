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

drop table if exists opcoes, grupos_opcoes, log_auditoria, super_admins, comanda_itens, comandas, venda_pagamentos, vendas, fechamentos_caixa,
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
  expira_em      timestamptz not null default now() + interval '12 hours',
  suporte_nome   text, -- preenchido quando é o dono do sistema acessando para dar suporte
  -- Autorização por PIN de admin (desconto/cancelamento): 5 erros bloqueiam por 5 minutos.
  falhas_autorizacao        int not null default 0,
  autorizacao_bloqueada_ate timestamptz
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
  disponivel   boolean not null default true, -- false = esgotado (continua no cardápio, mas não pode ser pedido)
  unique (empresa_id, id),
  foreign key (empresa_id, categoria_id) references categorias (empresa_id, id)
);

-- Variações e adicionais de um produto. Ex.: "Ponto da carne" (obrigatório, escolhe 1),
-- "Adicionais" (opcional, até 5). Cada opção pode ter preço extra.
create table grupos_opcoes (
  id          serial primary key,
  empresa_id  uuid not null,
  produto_id  int not null,
  nome        text not null check (length(trim(nome)) between 1 and 40),
  obrigatorio boolean not null default false,
  maximo      int not null default 1 check (maximo between 1 and 20),
  ordem       int not null default 0,
  unique (empresa_id, id),
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id) on delete cascade
);

create table opcoes (
  id         serial primary key,
  empresa_id uuid not null,
  grupo_id   int not null,
  nome       text not null check (length(trim(nome)) between 1 and 40),
  preco      numeric(10, 2) not null default 0 check (preco >= 0),
  ordem      int not null default 0,
  foreign key (empresa_id, grupo_id) references grupos_opcoes (empresa_id, id) on delete cascade
);

create table mesas (
  empresa_id   uuid not null references empresas (id) on delete cascade,
  numero       int not null,
  aberta_em    timestamptz,
  atendente_id uuid references funcionarios (id) on delete set null,
  observacao   text not null default '',
  ativa        boolean not null default true, -- false = mesa desativada pelo admin (ou pedido de balcão encerrado)
  tipo         text not null default 'mesa' check (tipo in ('mesa', 'balcao', 'retirada')),
  cliente      text,          -- balcão/retirada: nome de quem pediu
  senha        int,           -- balcão/retirada: número chamado no balcão (reinicia todo dia)
  criada_em    timestamptz not null default now(),
  primary key (empresa_id, numero)
);

-- Itens que o garçom está lançando e ainda não enviou à cozinha.
create table rascunho_itens (
  empresa_id    uuid not null,
  mesa_numero   int not null,
  produto_id    int not null,
  obs           text not null default '', -- observação do item (ex.: "sem cebola")
  opcoes        jsonb not null default '[]'::jsonb, -- variações/adicionais escolhidos: [{id, grupo, nome, preco}]
  opcoes_chave  text not null default '',            -- ids das opções em ordem ("3,7"): separa linhas diferentes
  qtd           int not null check (qtd > 0),
  adicionado_em timestamptz not null default clock_timestamp(),
  primary key (empresa_id, mesa_numero, produto_id, obs, opcoes_chave),
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
  rotulo          text,                                   -- "Mesa 3", "Balcão #12 · João"…
  desconto        numeric(10, 2) not null default 0,
  desconto_motivo text,
  desconto_por    text,                                   -- admin que autorizou
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
  opcoes     jsonb not null default '[]'::jsonb,
  foreign key (empresa_id, comanda_id) references comandas (empresa_id, id) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos (empresa_id, id)
);

-- Donos do sistema (portal /admin). Ligado ao login por e-mail do Supabase Auth.
create table super_admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now()
);

-- Quem fez o quê e quando.
create table log_auditoria (
  id         bigint generated always as identity primary key,
  empresa_id uuid references empresas (id) on delete cascade,
  quando     timestamptz not null default now(),
  ator_tipo  text not null check (ator_tipo in ('funcionario', 'super_admin', 'suporte')),
  ator_id    uuid,
  ator_nome  text,
  acao       text not null,
  detalhes   jsonb not null default '{}'::jsonb
);
create index log_auditoria_empresa on log_auditoria (empresa_id, quando desc);
create index log_auditoria_quando on log_auditoria (quando desc);

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
alter table super_admins      enable row level security;
alter table grupos_opcoes     enable row level security;
alter table opcoes            enable row level security;
alter table log_auditoria     enable row level security;

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
        'salvar_produto', 'remover_produto', 'relatorio', '_log', '_log_admin', '_super_admin', '_hoje',
        'admin_eu', 'admin_painel', 'admin_criar_empresa', 'admin_editar_empresa', 'admin_status_empresa',
        'admin_funcionarios', 'admin_resetar_pin', 'admin_acessar_como', 'admin_relatorio', 'admin_auditoria',
        '_opcoes_validas', '_autorizar_admin', 'cancelar_item', 'conferir_pin_admin', 'abrir_balcao', 'cancelar_balcao',
        'marcar_esgotado', 'salvar_opcoes_produto'])
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
    'tipo', m.tipo,
    'cliente', m.cliente,
    'senha', m.senha,
    'abertaEm', _ms(m.aberta_em),
    'observacao', m.observacao,
    'atendente', case when f.id is null then null else jsonb_build_object('id', f.id, 'nome', f.nome) end,
    'rascunho', coalesce((
      select jsonb_agg(jsonb_build_object(
        'produtoId', p.id, 'nome', p.nome, 'qtd', r.qtd, 'obs', r.obs,
        'opcoes', r.opcoes, 'opcoesChave', r.opcoes_chave,
        'preco', p.preco + coalesce((select sum((o ->> 'preco')::numeric) from jsonb_array_elements(r.opcoes) o), 0))
        order by r.adicionado_em, p.id, r.obs, r.opcoes_chave)
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
          select jsonb_agg(jsonb_build_object('id', ci.id, 'produtoId', ci.produto_id, 'nome', ci.nome, 'preco', ci.preco,
                                              'qtd', ci.qtd, 'obs', ci.obs, 'opcoes', ci.opcoes)
                           order by ci.id)
          from comanda_itens ci where ci.empresa_id = p_empresa and ci.comanda_id = c.id), '[]'::jsonb)
      ) order by c.numero)
      from comandas c
      where c.empresa_id = p_empresa and c.mesa_numero = m.numero and c.venda_id is null), '[]'::jsonb)
  ) order by m.tipo <> 'mesa', m.numero), '[]'::jsonb)
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
    'rotulo', coalesce(v.rotulo, 'Mesa ' || v.mesa_numero),
    'desconto', v.desconto,
    'descontoMotivo', v.desconto_motivo,
    'descontoPor', v.desconto_por,
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
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'preco', p.preco, 'disponivel', p.disponivel,
        'grupos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', g.id, 'nome', g.nome, 'obrigatorio', g.obrigatorio, 'maximo', g.maximo,
            'opcoes', coalesce((
              select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'preco', o.preco) order by o.ordem, o.id)
              from opcoes o where o.empresa_id = p_empresa and o.grupo_id = g.id), '[]'::jsonb)
          ) order by g.ordem, g.id)
          from grupos_opcoes g where g.empresa_id = p_empresa and g.produto_id = p.id), '[]'::jsonb)
      ) order by p.id)
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

-- Confere as opções escolhidas para um produto e devolve a "foto" delas (nome e preço de agora).
-- Regras: todas são do produto; cada grupo respeita o máximo; grupos obrigatórios têm escolha.
create or replace function _opcoes_validas(p_empresa uuid, p_produto int, p_ids int[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ids int[] := coalesce(p_ids, '{}');
  v_validas int;
begin
  select count(*) into v_validas
  from opcoes o join grupos_opcoes g on g.empresa_id = o.empresa_id and g.id = o.grupo_id
  where o.empresa_id = p_empresa and g.produto_id = p_produto and o.id = any (v_ids);
  if v_validas <> cardinality(array(select distinct unnest(v_ids))) or cardinality(v_ids) <> v_validas then
    raise exception 'OPCOES_INVALIDAS';
  end if;
  if exists (
    select 1 from grupos_opcoes g
    where g.empresa_id = p_empresa and g.produto_id = p_produto
      and ((select count(*) from opcoes o where o.grupo_id = g.id and o.id = any (v_ids)) > g.maximo
           or (g.obrigatorio and not exists (select 1 from opcoes o where o.grupo_id = g.id and o.id = any (v_ids))))
  ) then
    raise exception 'OPCOES_INVALIDAS';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', o.id, 'grupo', g.nome, 'nome', o.nome, 'preco', o.preco)
                     order by g.ordem, g.id, o.ordem, o.id)
    from opcoes o join grupos_opcoes g on g.empresa_id = o.empresa_id and g.id = o.grupo_id
    where o.empresa_id = p_empresa and o.id = any (v_ids)), '[]'::jsonb);
end $$;

-- Autorização de admin para desconto/cancelamento. Se quem está logado já é admin, vale ele mesmo.
-- Senão, confere o PIN contra os admins ativos do restaurante. 5 erros bloqueiam por 5 minutos.
create or replace function _autorizar_admin(p_token uuid, u funcionarios, p_pin text) returns funcionarios
language plpgsql security definer set search_path = public, extensions as $$
declare
  s sessoes;
  a funcionarios;
begin
  if u.funcao = 'admin' then
    return u;
  end if;
  select * into s from sessoes where token = p_token for update;
  if s.autorizacao_bloqueada_ate > now() then
    raise exception 'AUTORIZACAO_BLOQUEADA';
  end if;
  if p_pin is not null and p_pin ~ '^[0-9]{4}$' then
    select f.* into a from funcionarios f
    where f.empresa_id = u.empresa_id and f.funcao = 'admin' and f.ativo and f.pin_hash = crypt(p_pin, f.pin_hash)
    limit 1;
  end if;
  if a.id is null then
    update sessoes set
      falhas_autorizacao = case when falhas_autorizacao + 1 >= 5 then 0 else falhas_autorizacao + 1 end,
      autorizacao_bloqueada_ate = case when falhas_autorizacao + 1 >= 5 then now() + interval '5 minutes' else autorizacao_bloqueada_ate end
    where token = p_token;
    -- o erro precisa ir para o site, mas a contagem de falhas tem que ficar gravada
    perform _log(p_token, u, 'autorizacao_negada');
    return null;
  end if;
  update sessoes set falhas_autorizacao = 0 where token = p_token;
  return a;
end $$;

-- Registra uma ação no log de auditoria. Se a sessão for de suporte, o registro diz isso.
create or replace function _log(p_token uuid, u funcionarios, p_acao text, p_detalhes jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_suporte text;
begin
  select suporte_nome into v_suporte from sessoes where token = p_token;
  insert into log_auditoria (empresa_id, ator_tipo, ator_id, ator_nome, acao, detalhes)
  values (
    u.empresa_id,
    case when v_suporte is null then 'funcionario' else 'suporte' end,
    u.id,
    case when v_suporte is null then u.nome else v_suporte || ' (suporte)' end,
    p_acao,
    coalesce(p_detalhes, '{}'::jsonb)
  );
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
      insert into log_auditoria (empresa_id, ator_tipo, ator_id, ator_nome, acao)
      values (e.id, 'funcionario', f.id, f.nome, 'login_bloqueado');
      return jsonb_build_object('ok', false, 'erro', 'BLOQUEADO', 'segundos', 30);
    end if;
    update funcionarios set falhas_login = falhas_login + 1 where id = f.id;
    return jsonb_build_object('ok', false, 'erro', 'PIN_INCORRETO', 'restantes', 4 - f.falhas_login);
  end if;

  update funcionarios set falhas_login = 0, bloqueado_ate = null where id = f.id;
  update empresas set ultimo_acesso = now() where id = e.id;
  delete from sessoes where expira_em < now();
  insert into sessoes (funcionario_id) values (f.id) returning token into v_token;
  perform _log(v_token, f, 'login');
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
    'suporte', (select suporte_nome from sessoes where token = p_token),
    'empresa', _json_empresa(u.empresa_id),
    'mesas', _json_mesas(u.empresa_id),
    'cardapio', _json_cardapio(u.empresa_id),
    'historico', case when u.funcao in ('admin', 'caixa') then _json_historico(u.empresa_id) else '[]'::jsonb end,
    'funcionarios', _json_funcionarios(u.empresa_id, case when u.funcao = 'admin' then null else u.id end)
  );
end $$;

-- ---------- Garçom ----------

create or replace function adicionar_item(
  p_token uuid, p_mesa int, p_produto int, p_obs text default '', p_opcoes int[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  p produtos;
  v_snapshot jsonb;
  v_chave text;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  perform _checar_mesa(u.empresa_id, p_mesa);
  select * into p from produtos where empresa_id = u.empresa_id and id = p_produto and ativo;
  if p.id is null then
    raise exception 'PRODUTO_INVALIDO';
  end if;
  if not p.disponivel then
    raise exception 'PRODUTO_ESGOTADO';
  end if;
  v_snapshot := _opcoes_validas(u.empresa_id, p_produto, p_opcoes);
  v_chave := coalesce((select string_agg(x::text, ',' order by x) from unnest(p_opcoes) x), '');

  insert into rascunho_itens (empresa_id, mesa_numero, produto_id, obs, opcoes, opcoes_chave, qtd)
  values (u.empresa_id, p_mesa, p_produto, left(trim(coalesce(p_obs, '')), 100), v_snapshot, v_chave, 1)
  on conflict (empresa_id, mesa_numero, produto_id, obs, opcoes_chave) do update set qtd = rascunho_itens.qtd + 1;

  update mesas set aberta_em = coalesce(aberta_em, now()), atendente_id = coalesce(atendente_id, u.id)
  where empresa_id = u.empresa_id and numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function remover_item(
  p_token uuid, p_mesa int, p_produto int, p_obs text default '', p_opcoes_chave text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_obs text := coalesce(p_obs, '');
  v_chave text := coalesce(p_opcoes_chave, '');
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  delete from rascunho_itens
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto
    and obs = v_obs and opcoes_chave = v_chave and qtd <= 1;
  update rascunho_itens set qtd = qtd - 1
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto
    and obs = v_obs and opcoes_chave = v_chave;
  perform _liberar_se_vazia(u.empresa_id, p_mesa);
  return estado(p_token);
end $$;

-- Coloca observação em parte das unidades de um item (ex.: 1 dos 3 hambúrgueres "sem cebola").
-- Coloca observação em parte das unidades de um item (ex.: 1 dos 3 hambúrgueres "sem cebola").
create or replace function observacao_item(
  p_token uuid, p_mesa int, p_produto int, p_obs_antiga text, p_obs_nova text, p_qtd int, p_opcoes_chave text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  r rascunho_itens;
  v_antiga text := coalesce(p_obs_antiga, '');
  v_nova text := left(trim(coalesce(p_obs_nova, '')), 100);
  v_chave text := coalesce(p_opcoes_chave, '');
  v_qtd int;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  select * into r from rascunho_itens
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto
    and obs = v_antiga and opcoes_chave = v_chave
  for update;
  if r.qtd is null or v_nova = v_antiga then
    return estado(p_token);
  end if;

  v_qtd := least(greatest(coalesce(p_qtd, 1), 1), r.qtd);
  if v_qtd = r.qtd then
    delete from rascunho_itens
    where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto
      and obs = v_antiga and opcoes_chave = v_chave;
  else
    update rascunho_itens set qtd = qtd - v_qtd
    where empresa_id = u.empresa_id and mesa_numero = p_mesa and produto_id = p_produto
      and obs = v_antiga and opcoes_chave = v_chave;
  end if;

  insert into rascunho_itens (empresa_id, mesa_numero, produto_id, obs, opcoes, opcoes_chave, qtd)
  values (u.empresa_id, p_mesa, p_produto, v_nova, r.opcoes, v_chave, v_qtd)
  on conflict (empresa_id, mesa_numero, produto_id, obs, opcoes_chave) do update set qtd = rascunho_itens.qtd + excluded.qtd;
  return estado(p_token);
end $$;

create or replace function limpar_rascunho(p_token uuid, p_mesa int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
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
  u := _sessao(p_token, array['garcom', 'caixa']);
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
  u := _sessao(p_token, array['garcom', 'caixa']);
  select * into m from mesas where empresa_id = u.empresa_id and numero = p_mesa and ativa for update;
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

  -- Preço de cada unidade = produto + extras escolhidos (foto do momento do pedido).
  insert into comanda_itens (empresa_id, comanda_id, produto_id, nome, preco, qtd, obs, opcoes)
  select u.empresa_id, v_comanda, p.id, p.nome,
         p.preco + coalesce((select sum((o ->> 'preco')::numeric) from jsonb_array_elements(r.opcoes) o), 0),
         r.qtd, r.obs, r.opcoes
  from rascunho_itens r join produtos p on p.empresa_id = r.empresa_id and p.id = r.produto_id
  where r.empresa_id = u.empresa_id and r.mesa_numero = p_mesa
  order by r.adicionado_em, p.id, r.obs, r.opcoes_chave;

  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa;
  update mesas set observacao = '', aberta_em = coalesce(aberta_em, now()),
                   atendente_id = coalesce(atendente_id, u.id)
  where empresa_id = u.empresa_id and numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function cancelar_comanda(
  p_token uuid, p_comanda uuid, p_motivo text default null, p_pin_admin text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  a funcionarios;
  c comandas;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  select * into c from comandas where empresa_id = u.empresa_id and id = p_comanda and venda_id is null for update;
  if c.id is null then
    return estado(p_token);
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;
  a := _autorizar_admin(p_token, u, p_pin_admin);
  if a.id is null then
    -- Sem "raise": a contagem de tentativas erradas precisa ficar gravada.
    return estado(p_token) || '{"erro": "PIN_ADMIN_INCORRETO"}'::jsonb;
  end if;
  perform _log(p_token, u, 'pedido_cancelado', jsonb_build_object(
    'mesa', c.mesa_numero, 'pedido', c.numero, 'motivo', trim(p_motivo), 'autorizado_por', a.nome,
    'itens', (select string_agg(qtd || 'x ' || nome, ', ' order by id) from comanda_itens where comanda_id = c.id),
    'valor', (select sum(preco * qtd) from comanda_itens where comanda_id = c.id)));
  delete from comandas where id = c.id;
  perform _liberar_se_vazia(u.empresa_id, c.mesa_numero);
  return estado(p_token);
end $$;

-- Cancela parte de um item já enviado (ex.: 1 de 2 refrigerantes). Exige motivo e autorização de admin.
create or replace function cancelar_item(
  p_token uuid, p_item int, p_qtd int, p_motivo text, p_pin_admin text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  a funcionarios;
  i comanda_itens;
  c comandas;
  v_qtd int;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  select ci.* into i from comanda_itens ci
  join comandas co on co.empresa_id = ci.empresa_id and co.id = ci.comanda_id
  where ci.empresa_id = u.empresa_id and ci.id = p_item and co.venda_id is null
  for update of ci;
  if i.id is null then
    raise exception 'ITEM_INVALIDO';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;
  a := _autorizar_admin(p_token, u, p_pin_admin);
  if a.id is null then
    -- Sem "raise": a contagem de tentativas erradas precisa ficar gravada.
    return estado(p_token) || '{"erro": "PIN_ADMIN_INCORRETO"}'::jsonb;
  end if;
  v_qtd := least(greatest(coalesce(p_qtd, 1), 1), i.qtd);
  select * into c from comandas where id = i.comanda_id;
  perform _log(p_token, u, 'item_cancelado', jsonb_build_object(
    'mesa', c.mesa_numero, 'produto', i.nome, 'quantidade', v_qtd, 'valor', i.preco * v_qtd,
    'motivo', trim(p_motivo), 'autorizado_por', a.nome));
  if v_qtd = i.qtd then
    delete from comanda_itens where id = i.id;
  else
    update comanda_itens set qtd = qtd - v_qtd where id = i.id;
  end if;
  -- Pedido que ficou sem nenhum item some; mesa vazia é liberada.
  delete from comandas where id = c.id and not exists (select 1 from comanda_itens where comanda_id = c.id);
  perform _liberar_se_vazia(u.empresa_id, c.mesa_numero);
  return estado(p_token);
end $$;

-- Confere o PIN de um admin antes de abrir a tela de desconto/cancelamento (para avisar na hora).
create or replace function conferir_pin_admin(p_token uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  a funcionarios;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  a := _autorizar_admin(p_token, u, p_pin);
  if a.id is null then
    return jsonb_build_object('ok', false, 'erro', 'PIN_ADMIN_INCORRETO');
  end if;
  return jsonb_build_object('ok', true, 'admin', a.nome);
exception when others then
  if sqlerrm like '%AUTORIZACAO_BLOQUEADA%' then
    return jsonb_build_object('ok', false, 'erro', 'AUTORIZACAO_BLOQUEADA');
  end if;
  raise;
end $$;

-- Pedido de balcão ou retirada (sem mesa). Ganha um número interno (1001, 1002…) e uma senha do dia.
create or replace function abrir_balcao(p_token uuid, p_tipo text, p_cliente text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_numero int;
  v_senha int;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  if p_tipo not in ('balcao', 'retirada') then
    raise exception 'TIPO_INVALIDO';
  end if;
  perform 1 from empresas where id = u.empresa_id for update; -- um de cada vez, para a senha não repetir
  select greatest(1000, coalesce(max(numero), 0)) + 1 into v_numero from mesas where empresa_id = u.empresa_id;
  select count(*) + 1 into v_senha from mesas
  where empresa_id = u.empresa_id and tipo <> 'mesa' and criada_em >= _hoje();
  insert into mesas (empresa_id, numero, tipo, cliente, senha, aberta_em, atendente_id)
  values (u.empresa_id, v_numero, p_tipo, nullif(left(trim(coalesce(p_cliente, '')), 40), ''), v_senha, now(), u.id);
  return estado(p_token) || jsonb_build_object('criado', v_numero);
end $$;

-- Desiste de um pedido de balcão que ainda não foi para a cozinha.
create or replace function cancelar_balcao(p_token uuid, p_mesa int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom', 'caixa']);
  if exists (select 1 from comandas where empresa_id = u.empresa_id and mesa_numero = p_mesa and venda_id is null) then
    raise exception 'BALCAO_COM_PEDIDOS';
  end if;
  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa;
  update mesas set ativa = false, aberta_em = null, atendente_id = null
  where empresa_id = u.empresa_id and numero = p_mesa and tipo <> 'mesa';
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

  insert into rascunho_itens (empresa_id, mesa_numero, produto_id, obs, opcoes, opcoes_chave, qtd, adicionado_em)
  select empresa_id, p_destino, produto_id, obs, opcoes, opcoes_chave, qtd, adicionado_em
  from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_origem
  on conflict (empresa_id, mesa_numero, produto_id, obs, opcoes_chave) do update set qtd = rascunho_itens.qtd + excluded.qtd;
  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_origem;

  update mesas set
    aberta_em    = case when v_juntou then least(d.aberta_em, o.aberta_em) else o.aberta_em end,
    atendente_id = coalesce(d.atendente_id, o.atendente_id),
    observacao   = concat_ws(' · ', nullif(trim(d.observacao), ''), nullif(trim(o.observacao), ''))
  where empresa_id = u.empresa_id and numero = p_destino;
  update mesas set aberta_em = null, atendente_id = null, observacao = '',
                   ativa = case when tipo = 'mesa' then ativa else false end
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
-- p_pagamentos: [{"forma": "dinheiro", "valor": 20}, {"forma": "debito", "valor": 5}, ...]
-- Desconto (em R$): exige motivo e autorização de admin (PIN, ou o próprio usuário se for admin).
create or replace function finalizar_conta(
  p_token uuid, p_mesa int, p_com_taxa boolean, p_pessoas int, p_pagamentos jsonb,
  p_desconto numeric default 0, p_desconto_motivo text default null, p_pin_admin text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  a funcionarios;
  m mesas;
  v_taxa_pct numeric;
  v_subtotal numeric(10, 2);
  v_taxa numeric(10, 2);
  v_desconto numeric(10, 2) := round(coalesce(p_desconto, 0), 2);
  v_total numeric(10, 2);
  v_pago numeric(10, 2);
  v_dinheiro numeric(10, 2);
  v_formas int;
  v_forma_unica text;
  v_venda uuid;
  v_rotulo text;
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

  if v_desconto < 0 or v_desconto > v_subtotal + v_taxa then
    raise exception 'DESCONTO_INVALIDO';
  end if;
  if v_desconto > 0 then
    if length(trim(coalesce(p_desconto_motivo, ''))) < 3 then
      raise exception 'MOTIVO_OBRIGATORIO';
    end if;
    a := _autorizar_admin(p_token, u, p_pin_admin);
    if a.id is null then
      return estado(p_token) || '{"erro": "PIN_ADMIN_INCORRETO"}'::jsonb;
    end if;
  end if;
  v_total := v_subtotal + v_taxa - v_desconto;

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

  v_rotulo := case m.tipo
    when 'mesa' then 'Mesa ' || m.numero
    else (case m.tipo when 'balcao' then 'Balcão' else 'Retirada' end) || ' #' || m.senha
         || coalesce(' · ' || m.cliente, '')
  end;

  insert into vendas (
    empresa_id, mesa_numero, subtotal, taxa, total, forma_pagamento, pessoas, recebido, troco,
    aberta_em, atendente_id, atendente_nome, operador_id, operador_nome,
    rotulo, desconto, desconto_motivo, desconto_por
  ) values (
    u.empresa_id, p_mesa, v_subtotal, v_taxa, v_total,
    case when v_formas = 1 then v_forma_unica else 'misto' end,
    greatest(coalesce(p_pessoas, 1), 1),
    v_pago, v_pago - v_total,
    m.aberta_em, m.atendente_id, (select nome from funcionarios where id = m.atendente_id),
    u.id, u.nome,
    v_rotulo, v_desconto, nullif(trim(coalesce(p_desconto_motivo, '')), ''), a.nome
  ) returning id into v_venda;

  insert into venda_pagamentos (empresa_id, venda_id, forma, valor)
  select u.empresa_id, v_venda, p->>'forma', sum(round((p->>'valor')::numeric, 2))
  from jsonb_array_elements(p_pagamentos) p
  group by p->>'forma';

  if v_desconto > 0 then
    perform _log(p_token, u, 'desconto_aplicado', jsonb_build_object(
      'mesa', v_rotulo, 'valor', v_desconto, 'total', v_total, 'motivo', trim(p_desconto_motivo), 'autorizado_por', a.nome));
  end if;

  update comandas set venda_id = v_venda
  where empresa_id = u.empresa_id and mesa_numero = p_mesa and venda_id is null;
  delete from rascunho_itens where empresa_id = u.empresa_id and mesa_numero = p_mesa;
  -- Mesa volta a ficar livre; pedido de balcão/retirada sai da tela.
  update mesas set aberta_em = null, atendente_id = null, observacao = '',
                   ativa = case when tipo = 'mesa' then ativa else false end
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
  perform _log(p_token, u, 'caixa_fechado', (select jsonb_build_object('vendas', quantidade, 'total', total)
                                              from fechamentos_caixa where id = v_id));
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
  perform _log(p_token, u, 'funcionario_criado', jsonb_build_object('nome', trim(p_nome), 'funcao', p_funcao));
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
  perform _log(p_token, u, 'funcionario_editado', jsonb_strip_nulls(jsonb_build_object(
    'funcionario', (select nome from funcionarios where id = p_id),
    'nome', p_nome, 'funcao', p_funcao, 'ativo', p_ativo,
    'pin_trocado', case when p_pin is not null then true end)));
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
  perform _log(p_token, u, 'funcionario_removido',
               jsonb_build_object('nome', (select nome from funcionarios where id = p_id and empresa_id = u.empresa_id)));
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
  perform _log(p_token, u, 'restaurante_configurado', jsonb_strip_nulls(jsonb_build_object('nome', p_nome, 'taxa', p_taxa)));
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
  perform 1 from mesas where empresa_id = u.empresa_id and tipo = 'mesa' order by numero for update;
  if exists (
    select 1 from mesas m
    where m.empresa_id = u.empresa_id and m.tipo = 'mesa' and m.numero > p_quantidade and m.ativa
      and (exists (select 1 from rascunho_itens r where r.empresa_id = m.empresa_id and r.mesa_numero = m.numero)
           or exists (select 1 from comandas c where c.empresa_id = m.empresa_id and c.mesa_numero = m.numero and c.venda_id is null))
  ) then
    raise exception 'MESA_OCUPADA';
  end if;
  insert into mesas (empresa_id, numero)
  select u.empresa_id, generate_series(1, p_quantidade)
  on conflict (empresa_id, numero) do nothing;
  update mesas set ativa = (numero <= p_quantidade) where empresa_id = u.empresa_id and tipo = 'mesa';
  perform _log(p_token, u, 'mesas_definidas', jsonb_build_object('quantidade', p_quantidade));
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
  perform _log(p_token, u, case when p_id is null then 'categoria_criada' else 'categoria_renomeada' end,
               jsonb_build_object('nome', v_nome));
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
  if found then
    perform _log(p_token, u, 'categoria_removida',
                 jsonb_build_object('nome', (select nome from categorias where empresa_id = u.empresa_id and id = p_id)));
  end if;
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
  antes produtos;
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
    perform _log(p_token, u, 'produto_criado', jsonb_build_object('nome', v_nome, 'preco', round(p_preco, 2)));
  else
    select * into antes from produtos where empresa_id = u.empresa_id and id = p_id and ativo;
    if not found then
      raise exception 'PRODUTO_INVALIDO';
    end if;
    update produtos set categoria_id = p_categoria, nome = v_nome, preco = round(p_preco, 2)
    where empresa_id = u.empresa_id and id = p_id;
    if antes.preco <> round(p_preco, 2) then
      perform _log(p_token, u, 'preco_alterado',
                   jsonb_build_object('produto', v_nome, 'de', antes.preco, 'para', round(p_preco, 2)));
    end if;
    if antes.nome <> v_nome or antes.categoria_id <> p_categoria then
      perform _log(p_token, u, 'produto_editado', jsonb_build_object('de', antes.nome, 'para', v_nome));
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
  update produtos set ativo = false where empresa_id = u.empresa_id and id = p_id and ativo;
  if found then
    perform _log(p_token, u, 'produto_removido', jsonb_build_object('nome', (select nome from produtos where id = p_id)));
  end if;
  return estado(p_token);
end $$;

-- Marca o produto como esgotado (ou disponível de novo). Cozinha, garçom e admin podem.
create or replace function marcar_esgotado(p_token uuid, p_produto int, p_esgotado boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  v_nome text;
begin
  u := _sessao(p_token, array['cozinha', 'garcom']);
  update produtos set disponivel = not coalesce(p_esgotado, true)
  where empresa_id = u.empresa_id and id = p_produto and ativo and disponivel = coalesce(p_esgotado, true)
  returning nome into v_nome;
  if v_nome is not null then
    perform _log(p_token, u, case when p_esgotado then 'produto_esgotado' else 'produto_disponivel' end,
                 jsonb_build_object('produto', v_nome));
  end if;
  return estado(p_token);
end $$;

-- Troca as variações/adicionais de um produto.
-- p_grupos: [{"nome": "Ponto", "obrigatorio": true, "maximo": 1, "opcoes": [{"nome": "Mal passada", "preco": 0}, ...]}, ...]
create or replace function salvar_opcoes_produto(p_token uuid, p_produto int, p_grupos jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  g jsonb;
  o jsonb;
  v_grupo int;
  v_ordem int := 0;
  v_ordem_opcao int;
  v_nome text;
begin
  u := _sessao(p_token, array['admin']);
  select nome into v_nome from produtos where empresa_id = u.empresa_id and id = p_produto and ativo;
  if v_nome is null then
    raise exception 'PRODUTO_INVALIDO';
  end if;
  if p_grupos is null or jsonb_typeof(p_grupos) <> 'array' or jsonb_array_length(p_grupos) > 10 then
    raise exception 'OPCOES_INVALIDAS';
  end if;
  delete from grupos_opcoes where empresa_id = u.empresa_id and produto_id = p_produto;
  for g in select * from jsonb_array_elements(p_grupos) loop
    if length(trim(coalesce(g ->> 'nome', ''))) not between 1 and 40
       or jsonb_typeof(g -> 'opcoes') <> 'array' or jsonb_array_length(g -> 'opcoes') not between 1 and 30 then
      raise exception 'OPCOES_INVALIDAS';
    end if;
    v_ordem := v_ordem + 1;
    insert into grupos_opcoes (empresa_id, produto_id, nome, obrigatorio, maximo, ordem)
    values (u.empresa_id, p_produto, trim(g ->> 'nome'), coalesce((g ->> 'obrigatorio')::boolean, false),
            least(greatest(coalesce((g ->> 'maximo')::int, 1), 1), 20), v_ordem)
    returning id into v_grupo;
    v_ordem_opcao := 0;
    for o in select * from jsonb_array_elements(g -> 'opcoes') loop
      if length(trim(coalesce(o ->> 'nome', ''))) not between 1 and 40
         or coalesce((o ->> 'preco')::numeric, 0) < 0 or coalesce((o ->> 'preco')::numeric, 0) > 9999 then
        raise exception 'OPCOES_INVALIDAS';
      end if;
      v_ordem_opcao := v_ordem_opcao + 1;
      insert into opcoes (empresa_id, grupo_id, nome, preco, ordem)
      values (u.empresa_id, v_grupo, trim(o ->> 'nome'), round(coalesce((o ->> 'preco')::numeric, 0), 2), v_ordem_opcao);
    end loop;
  end loop;
  perform _log(p_token, u, 'opcoes_alteradas', jsonb_build_object('produto', v_nome, 'grupos', jsonb_array_length(p_grupos)));
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
--  PORTAL DO DONO DO SISTEMA (super admin) — login por e-mail + 2FA
--  (Supabase Auth). Só chamáveis por usuário logado ("authenticated").
-- ---------------------------------------------------------------------

-- Confere que quem chama é super admin. Por padrão exige o 2FA (nível "aal2").
create or replace function _super_admin(p_exigir_2fa boolean default true) returns super_admins
language plpgsql security definer set search_path = public as $$
declare
  a super_admins;
begin
  select * into a from super_admins where user_id = auth.uid();
  if a.user_id is null then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_exigir_2fa and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'MFA_NECESSARIO';
  end if;
  return a;
end $$;

-- Início do dia de hoje no horário de Brasília.
create or replace function _hoje() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

create or replace function _log_admin(a super_admins, p_empresa uuid, p_acao text, p_detalhes jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into log_auditoria (empresa_id, ator_tipo, ator_id, ator_nome, acao, detalhes)
  values (p_empresa, 'super_admin', a.user_id, a.nome, p_acao, coalesce(p_detalhes, '{}'::jsonb));
$$;

-- Quem sou eu (não exige 2FA: a tela usa para saber se precisa pedir o código).
create or replace function admin_eu() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a super_admins;
begin
  a := _super_admin(false);
  return jsonb_build_object('nome', a.nome, 'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'));
end $$;

-- Todos os restaurantes com os números de hoje e do mês.
create or replace function admin_painel() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje timestamptz := _hoje();
  v_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform _super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'slug', e.slug, 'cnpj', e.cnpj, 'status', e.status, 'plano', e.plano,
      'taxaServico', e.taxa_servico, 'criadaEm', _ms(e.criada_em), 'ultimoAcesso', _ms(e.ultimo_acesso),
      'mesas', (select count(*) from mesas m where m.empresa_id = e.id and m.ativa and m.tipo = 'mesa'),
      'mesasAbertas', (select count(*) from mesas m where m.empresa_id = e.id and m.ativa and m.aberta_em is not null),
      'emAberto', (select coalesce(sum(ci.preco * ci.qtd), 0) from comandas c
                   join comanda_itens ci on ci.empresa_id = c.empresa_id and ci.comanda_id = c.id
                   where c.empresa_id = e.id and c.venda_id is null),
      'funcionarios', (select count(*) from funcionarios f where f.empresa_id = e.id and f.ativo),
      'vendasHoje', (select coalesce(sum(total), 0) from vendas v where v.empresa_id = e.id and v.fechada_em >= v_hoje),
      'contasHoje', (select count(*) from vendas v where v.empresa_id = e.id and v.fechada_em >= v_hoje),
      'vendasMes', (select coalesce(sum(total), 0) from vendas v where v.empresa_id = e.id and v.fechada_em >= v_mes),
      'contasMes', (select count(*) from vendas v where v.empresa_id = e.id and v.fechada_em >= v_mes)
    ) order by e.nome)
    from empresas e), '[]'::jsonb);
end $$;

-- Cria um restaurante novo com o primeiro admin (PIN provisório) e, se pedido,
-- o cardápio copiado de outro restaurante (p_modelo = código do modelo).
create or replace function admin_criar_empresa(
  p_nome text, p_slug text, p_admin_nome text, p_admin_pin text,
  p_cnpj text default null, p_plano text default 'gratis', p_taxa numeric default 0.10,
  p_mesas int default 10, p_modelo text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a super_admins;
  v_empresa uuid;
  v_modelo uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  a := _super_admin();
  if length(trim(coalesce(p_nome, ''))) not between 1 and 60 then
    raise exception 'NOME_INVALIDO';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 2 and 40 or v_slug in ('admin', 'r', 'api') then
    raise exception 'CODIGO_INVALIDO';
  end if;
  if exists (select 1 from empresas where slug = v_slug) then
    raise exception 'CODIGO_EM_USO';
  end if;
  if length(trim(coalesce(p_admin_nome, ''))) not between 1 and 40 then
    raise exception 'NOME_INVALIDO';
  end if;
  perform _validar_pin(p_admin_pin);
  if p_taxa is null or p_taxa < 0 or p_taxa > 0.3 then
    raise exception 'TAXA_INVALIDA';
  end if;
  if p_mesas is null or p_mesas < 1 or p_mesas > 60 then
    raise exception 'MESAS_INVALIDAS';
  end if;
  if p_modelo is not null then
    select id into v_modelo from empresas where slug = lower(trim(p_modelo));
    if v_modelo is null then
      raise exception 'EMPRESA_INVALIDA';
    end if;
  end if;

  insert into empresas (nome, slug, cnpj, plano, taxa_servico)
  values (trim(p_nome), v_slug, nullif(trim(coalesce(p_cnpj, '')), ''), coalesce(nullif(trim(p_plano), ''), 'gratis'), round(p_taxa, 3))
  returning id into v_empresa;

  insert into funcionarios (empresa_id, nome, funcao, pin_hash, pin_padrao)
  values (v_empresa, trim(p_admin_nome), 'admin', crypt(p_admin_pin, gen_salt('bf', 8)), true);

  insert into mesas (empresa_id, numero) select v_empresa, generate_series(1, p_mesas);

  if v_modelo is not null then
    insert into categorias (empresa_id, id, nome, ordem)
    select v_empresa, id, nome, ordem from categorias where empresa_id = v_modelo and ativa;
    insert into produtos (empresa_id, categoria_id, nome, preco)
    select v_empresa, p.categoria_id, p.nome, p.preco
    from produtos p join categorias c on c.empresa_id = p.empresa_id and c.id = p.categoria_id
    where p.empresa_id = v_modelo and p.ativo and c.ativa
    order by p.id;
  end if;

  perform _log_admin(a, v_empresa, 'restaurante_criado',
    jsonb_build_object('nome', trim(p_nome), 'codigo', v_slug, 'admin', trim(p_admin_nome), 'modelo', p_modelo));
  return jsonb_build_object('id', v_empresa, 'slug', v_slug);
end $$;

create or replace function admin_editar_empresa(
  p_id uuid, p_nome text default null, p_slug text default null, p_cnpj text default null,
  p_plano text default null, p_taxa numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a super_admins;
  antes empresas;
  v_slug text := nullif(lower(trim(coalesce(p_slug, ''))), '');
begin
  a := _super_admin();
  select * into antes from empresas where id = p_id;
  if antes.id is null then
    raise exception 'EMPRESA_INVALIDA';
  end if;
  if p_nome is not null and length(trim(p_nome)) not between 1 and 60 then
    raise exception 'NOME_INVALIDO';
  end if;
  if v_slug is not null and (v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 2 and 40 or v_slug in ('admin', 'r', 'api')) then
    raise exception 'CODIGO_INVALIDO';
  end if;
  if v_slug is not null and exists (select 1 from empresas where slug = v_slug and id <> p_id) then
    raise exception 'CODIGO_EM_USO';
  end if;
  if p_taxa is not null and (p_taxa < 0 or p_taxa > 0.3) then
    raise exception 'TAXA_INVALIDA';
  end if;
  update empresas set
    nome = coalesce(trim(p_nome), nome),
    slug = coalesce(v_slug, slug),
    cnpj = case when p_cnpj is null then cnpj else nullif(trim(p_cnpj), '') end,
    plano = coalesce(nullif(trim(p_plano), ''), plano),
    taxa_servico = coalesce(round(p_taxa, 3), taxa_servico)
  where id = p_id;
  perform _log_admin(a, p_id, 'restaurante_editado', jsonb_strip_nulls(jsonb_build_object(
    'nome', p_nome, 'codigo', v_slug, 'cnpj', p_cnpj, 'plano', p_plano, 'taxa', p_taxa)));
  return jsonb_build_object('ok', true);
end $$;

-- Ativa ou suspende. Suspender derruba na hora todas as sessões do restaurante.
create or replace function admin_status_empresa(p_id uuid, p_status text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a super_admins;
begin
  a := _super_admin();
  if p_status not in ('ativa', 'suspensa') then
    raise exception 'STATUS_INVALIDO';
  end if;
  update empresas set status = p_status where id = p_id;
  if not found then
    raise exception 'EMPRESA_INVALIDA';
  end if;
  if p_status = 'suspensa' then
    delete from sessoes s using funcionarios f where f.id = s.funcionario_id and f.empresa_id = p_id;
  end if;
  perform _log_admin(a, p_id, case when p_status = 'ativa' then 'restaurante_ativado' else 'restaurante_suspenso' end,
                     jsonb_strip_nulls(jsonb_build_object('motivo', nullif(trim(coalesce(p_motivo, '')), ''))));
  return jsonb_build_object('ok', true);
end $$;

-- Equipe de um restaurante (sem PIN), para o suporte.
create or replace function admin_funcionarios(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome, 'funcao', funcao, 'ativo', ativo, 'pinPadrao', pin_padrao,
      'bloqueado', bloqueado_ate > now()) order by funcao <> 'admin', nome)
    from funcionarios where empresa_id = p_empresa), '[]'::jsonb);
end $$;

-- Define um PIN provisório para um funcionário (ex.: admin que esqueceu o PIN).
create or replace function admin_resetar_pin(p_funcionario uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a super_admins;
  f funcionarios;
begin
  a := _super_admin();
  perform _validar_pin(p_pin);
  select * into f from funcionarios where id = p_funcionario;
  if f.id is null then
    raise exception 'FUNCIONARIO_INVALIDO';
  end if;
  update funcionarios set pin_hash = crypt(p_pin, gen_salt('bf', 8)), pin_padrao = true,
                          falhas_login = 0, bloqueado_ate = null, ativo = true
  where id = p_funcionario;
  delete from sessoes where funcionario_id = p_funcionario;
  perform _log_admin(a, f.empresa_id, 'pin_resetado', jsonb_build_object('funcionario', f.nome));
  return jsonb_build_object('ok', true);
end $$;

-- "Acessar como": abre uma sessão de suporte (2 horas) como o admin do restaurante.
-- A tela mostra uma faixa de suporte e tudo que for feito fica no log como suporte.
create or replace function admin_acessar_como(p_empresa uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a super_admins;
  e empresas;
  f funcionarios;
  v_token uuid;
begin
  a := _super_admin();
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;
  select * into e from empresas where id = p_empresa;
  if e.id is null then
    raise exception 'EMPRESA_INVALIDA';
  end if;
  if e.status <> 'ativa' then
    raise exception 'EMPRESA_SUSPENSA';
  end if;
  select * into f from funcionarios
  where empresa_id = p_empresa and funcao = 'admin' and ativo order by criado_em limit 1;
  if f.id is null then
    raise exception 'SEM_ADMIN';
  end if;
  insert into sessoes (funcionario_id, expira_em, suporte_nome)
  values (f.id, now() + interval '2 hours', a.nome)
  returning token into v_token;
  perform _log_admin(a, p_empresa, 'suporte_iniciado', jsonb_build_object('motivo', trim(p_motivo)));
  return jsonb_build_object('token', v_token, 'slug', e.slug, 'nome', e.nome);
end $$;

-- Relatório de todos os restaurantes no período.
create or replace function admin_relatorio(p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _super_admin();
  return jsonb_build_object(
    'empresas', coalesce((
      select jsonb_agg(x order by (x ->> 'total')::numeric desc) from (
        select jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug, 'status', e.status,
          'quantidade', count(v.id), 'total', coalesce(sum(v.total), 0), 'taxas', coalesce(sum(v.taxa), 0)) as x
        from empresas e left join vendas v on v.empresa_id = e.id and v.fechada_em between p_de and p_ate
        group by e.id) t), '[]'::jsonb),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'total', total, 'quantidade', quantidade) order by dia) from (
        select to_char(v.fechada_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
               sum(v.total) as total, count(*) as quantidade
        from vendas v where v.fechada_em between p_de and p_ate group by 1) d), '[]'::jsonb),
    'porForma', coalesce((
      select jsonb_object_agg(forma, valor) from (
        select vp.forma,
               sum(vp.valor) - case when vp.forma = 'dinheiro'
                 then coalesce((select sum(troco) from vendas where fechada_em between p_de and p_ate), 0) else 0 end as valor
        from venda_pagamentos vp join vendas v on v.empresa_id = vp.empresa_id and v.id = vp.venda_id
        where v.fechada_em between p_de and p_ate
        group by vp.forma) f), '{}'::jsonb)
  );
end $$;

-- Log de auditoria (mais recentes primeiro). Filtros opcionais por restaurante e período.
create or replace function admin_auditoria(
  p_empresa uuid default null, p_de timestamptz default null, p_ate timestamptz default null, p_limite int default 300
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'quando', _ms(l.quando), 'empresa', e.nome, 'empresaId', l.empresa_id,
      'atorTipo', l.ator_tipo, 'ator', l.ator_nome, 'acao', l.acao, 'detalhes', l.detalhes) order by l.quando desc)
    from (
      select * from log_auditoria
      where (p_empresa is null or empresa_id = p_empresa)
        and (p_de is null or quando >= p_de)
        and (p_ate is null or quando <= p_ate)
      order by quando desc
      limit least(greatest(coalesce(p_limite, 300), 1), 1000)
    ) l left join empresas e on e.id = l.empresa_id), '[]'::jsonb);
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
  relatorio,
  cancelar_item, conferir_pin_admin, abrir_balcao, cancelar_balcao, marcar_esgotado, salvar_opcoes_produto
to anon, authenticated;

-- Portal do dono do sistema: só para quem fez login por e-mail (e cada função confere se é super admin).
grant execute on function
  admin_eu, admin_painel, admin_criar_empresa, admin_editar_empresa, admin_status_empresa,
  admin_funcionarios, admin_resetar_pin, admin_acessar_como, admin_relatorio, admin_auditoria
to authenticated;

-- =====================================================================
--  FUNÇÕES (fim do bloco que as migrações também aplicam)
-- =====================================================================

-- Avisa a API do Supabase para recarregar a lista de funções.
notify pgrst, 'reload schema';
