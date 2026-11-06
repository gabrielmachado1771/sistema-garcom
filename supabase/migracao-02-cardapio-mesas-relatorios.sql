-- =====================================================================
--  Migração 02 — observação por item, transferir/juntar mesas,
--  quantidade de mesas, editar cardápio e relatórios
--
--  Para quem JÁ rodou o schema.sql (e a migração 01) antes.
--  NÃO apaga dados. Pode rodar mais de uma vez sem problema.
--
--  Como usar: SQL Editor do Supabase → cole este arquivo → Run.
-- =====================================================================

begin;

-- 1) Colunas novas
alter table categorias    add column if not exists ativa boolean not null default true;
alter table mesas         add column if not exists ativa boolean not null default true;
alter table comanda_itens add column if not exists obs text not null default '';
alter table rascunho_itens add column if not exists obs text not null default '';

-- O mesmo produto pode aparecer em linhas diferentes se a observação for diferente.
alter table rascunho_itens drop constraint if exists rascunho_itens_pkey;
alter table rascunho_itens add primary key (mesa_numero, produto_id, obs);

-- 2) Funções antigas que mudaram de parâmetros
drop function if exists adicionar_item(uuid, int, int);
drop function if exists remover_item(uuid, int, int);

-- 3) Funções novas e atualizadas
create or replace function _checar_mesa(p_mesa int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from mesas where numero = p_mesa and ativa) then
    raise exception 'MESA_INVALIDA';
  end if;
end $$;

create or replace function _json_mesas() returns jsonb
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
          select jsonb_agg(jsonb_build_object('produtoId', ci.produto_id, 'nome', ci.nome, 'preco', ci.preco,
                                              'qtd', ci.qtd, 'obs', ci.obs)
                           order by ci.id)
          from comanda_itens ci where ci.comanda_id = c.id), '[]'::jsonb)
      ) order by c.numero)
      from comandas c where c.mesa_numero = m.numero and c.venda_id is null), '[]'::jsonb)
  ) order by m.numero), '[]'::jsonb)
  from mesas m left join funcionarios f on f.id = m.atendente_id
  where m.ativa;
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
      from venda_pagamentos vp where vp.venda_id = v.id), '[]'::jsonb),
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
  );
$$;

-- Vendas do caixa aberto (ainda não fechado).
create or replace function _json_historico() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(_json_venda(v) order by v.fechada_em desc), '[]'::jsonb)
  from vendas v
  where v.fechamento_id is null;
$$;

create or replace function _json_cardapio() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nome', c.nome,
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'preco', p.preco) order by p.id)
      from produtos p where p.categoria_id = c.id and p.ativo), '[]'::jsonb)
  ) order by c.ordem, c.id), '[]'::jsonb)
  from categorias c
  where c.ativa;
$$;

create or replace function adicionar_item(p_token uuid, p_mesa int, p_produto int, p_obs text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
begin
  u := _sessao(p_token, array['garcom']);
  perform _checar_mesa(p_mesa);
  if not exists (select 1 from produtos where id = p_produto and ativo) then
    raise exception 'PRODUTO_INVALIDO';
  end if;

  insert into rascunho_itens (mesa_numero, produto_id, obs, qtd)
  values (p_mesa, p_produto, left(trim(coalesce(p_obs, '')), 100), 1)
  on conflict (mesa_numero, produto_id, obs) do update set qtd = rascunho_itens.qtd + 1;

  update mesas set aberta_em = coalesce(aberta_em, now()), atendente_id = coalesce(atendente_id, u.id)
  where numero = p_mesa;
  return estado(p_token);
end $$;

create or replace function remover_item(p_token uuid, p_mesa int, p_produto int, p_obs text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_obs text := coalesce(p_obs, '');
begin
  perform _sessao(p_token, array['garcom']);
  delete from rascunho_itens
  where mesa_numero = p_mesa and produto_id = p_produto and obs = v_obs and qtd <= 1;
  update rascunho_itens set qtd = qtd - 1
  where mesa_numero = p_mesa and produto_id = p_produto and obs = v_obs;
  perform _liberar_se_vazia(p_mesa);
  return estado(p_token);
end $$;

-- Coloca observação em parte das unidades de um item (ex.: 1 dos 3 hambúrgueres "sem cebola").
create or replace function observacao_item(
  p_token uuid, p_mesa int, p_produto int, p_obs_antiga text, p_obs_nova text, p_qtd int
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_antiga text := coalesce(p_obs_antiga, '');
  v_nova text := left(trim(coalesce(p_obs_nova, '')), 100);
  v_atual int;
  v_qtd int;
begin
  perform _sessao(p_token, array['garcom']);
  select qtd into v_atual from rascunho_itens
  where mesa_numero = p_mesa and produto_id = p_produto and obs = v_antiga
  for update;
  if v_atual is null or v_nova = v_antiga then
    return estado(p_token);
  end if;

  v_qtd := least(greatest(coalesce(p_qtd, 1), 1), v_atual);
  if v_qtd = v_atual then
    delete from rascunho_itens where mesa_numero = p_mesa and produto_id = p_produto and obs = v_antiga;
  else
    update rascunho_itens set qtd = qtd - v_qtd
    where mesa_numero = p_mesa and produto_id = p_produto and obs = v_antiga;
  end if;

  insert into rascunho_itens (mesa_numero, produto_id, obs, qtd)
  values (p_mesa, p_produto, v_nova, v_qtd)
  on conflict (mesa_numero, produto_id, obs) do update set qtd = rascunho_itens.qtd + excluded.qtd;
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

  insert into comanda_itens (comanda_id, produto_id, nome, preco, qtd, obs)
  select v_comanda, p.id, p.nome, p.preco, r.qtd, r.obs
  from rascunho_itens r join produtos p on p.id = r.produto_id
  where r.mesa_numero = p_mesa
  order by r.adicionado_em, p.id, r.obs;

  delete from rascunho_itens where mesa_numero = p_mesa;
  update mesas set observacao = '', aberta_em = coalesce(aberta_em, now()),
                   atendente_id = coalesce(atendente_id, u.id)
  where numero = p_mesa;
  return estado(p_token);
end $$;

-- Leva a conta de uma mesa para outra. Se a outra já tiver conta, as duas viram uma só.
create or replace function transferir_mesa(p_token uuid, p_origem int, p_destino int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  o mesas;
  d mesas;
  v_base int;
  v_juntou boolean;
begin
  perform _sessao(p_token, array['garcom', 'caixa']);
  if p_origem is null or p_destino is null or p_origem = p_destino then
    raise exception 'MESA_INVALIDA';
  end if;
  -- Trava as duas mesas sempre na mesma ordem (evita duas transferências se travarem).
  perform 1 from mesas where numero in (p_origem, p_destino) order by numero for update;
  select * into o from mesas where numero = p_origem and ativa;
  select * into d from mesas where numero = p_destino and ativa;
  if o.numero is null or d.numero is null then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from rascunho_itens where mesa_numero = p_origem)
     and not exists (select 1 from comandas where mesa_numero = p_origem and venda_id is null) then
    raise exception 'MESA_VAZIA';
  end if;

  v_juntou := exists (select 1 from rascunho_itens where mesa_numero = p_destino)
           or exists (select 1 from comandas where mesa_numero = p_destino and venda_id is null);
  select coalesce(max(numero), 0) into v_base from comandas where mesa_numero = p_destino and venda_id is null;

  update comandas set mesa_numero = p_destino, numero = numero + v_base
  where mesa_numero = p_origem and venda_id is null;

  insert into rascunho_itens (mesa_numero, produto_id, obs, qtd, adicionado_em)
  select p_destino, produto_id, obs, qtd, adicionado_em from rascunho_itens where mesa_numero = p_origem
  on conflict (mesa_numero, produto_id, obs) do update set qtd = rascunho_itens.qtd + excluded.qtd;
  delete from rascunho_itens where mesa_numero = p_origem;

  update mesas set
    aberta_em    = case when v_juntou then least(d.aberta_em, o.aberta_em) else o.aberta_em end,
    atendente_id = coalesce(d.atendente_id, o.atendente_id),
    observacao   = concat_ws(' · ', nullif(trim(d.observacao), ''), nullif(trim(o.observacao), ''))
  where numero = p_destino;
  update mesas set aberta_em = null, atendente_id = null, observacao = '' where numero = p_origem;
  return estado(p_token);
end $$;

-- Define quantas mesas o restaurante tem. Mesas a mais ficam desativadas (o histórico continua).
create or replace function definir_mesas(p_token uuid, p_quantidade int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['admin']);
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 60 then
    raise exception 'MESAS_INVALIDAS';
  end if;
  perform 1 from mesas order by numero for update;
  if exists (
    select 1 from mesas m
    where m.numero > p_quantidade and m.ativa
      and (exists (select 1 from rascunho_itens r where r.mesa_numero = m.numero)
           or exists (select 1 from comandas c where c.mesa_numero = m.numero and c.venda_id is null))
  ) then
    raise exception 'MESA_OCUPADA';
  end if;
  insert into mesas (numero) select generate_series(1, p_quantidade) on conflict (numero) do nothing;
  update mesas set ativa = (numero <= p_quantidade) where numero > 0;
  return estado(p_token);
end $$;

create or replace function salvar_categoria(p_token uuid, p_id text, p_nome text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
begin
  perform _sessao(p_token, array['admin']);
  if length(v_nome) not between 1 and 40 then
    raise exception 'NOME_INVALIDO';
  end if;
  if p_id is null then
    insert into categorias (id, nome, ordem)
    values ('C' || substr(md5(random()::text || clock_timestamp()::text), 1, 8), v_nome,
            coalesce((select max(ordem) from categorias), 0) + 1);
  else
    update categorias set nome = v_nome where id = p_id and ativa;
    if not found then
      raise exception 'CATEGORIA_INVALIDA';
    end if;
  end if;
  return estado(p_token);
end $$;

create or replace function remover_categoria(p_token uuid, p_id text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['admin']);
  if exists (select 1 from produtos where categoria_id = p_id and ativo) then
    raise exception 'CATEGORIA_COM_PRODUTOS';
  end if;
  update categorias set ativa = false where id = p_id;
  return estado(p_token);
end $$;

-- Sobe (p_direcao = -1) ou desce (+1) a categoria na ordem do cardápio.
create or replace function mover_categoria(p_token uuid, p_id text, p_direcao int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a categorias;
  b categorias;
begin
  perform _sessao(p_token, array['admin']);
  perform 1 from categorias order by id for update;
  -- Renumera 1, 2, 3… para não haver empate.
  update categorias c set ordem = x.n
  from (select id, row_number() over (order by ordem, id) as n from categorias) x
  where c.id = x.id;

  select * into a from categorias where id = p_id and ativa;
  if not found then
    raise exception 'CATEGORIA_INVALIDA';
  end if;
  if p_direcao < 0 then
    select * into b from categorias where ativa and ordem < a.ordem order by ordem desc limit 1;
  else
    select * into b from categorias where ativa and ordem > a.ordem order by ordem limit 1;
  end if;
  if b.id is not null then
    update categorias set ordem = case when id = a.id then b.ordem else a.ordem end
    where id in (a.id, b.id);
  end if;
  return estado(p_token);
end $$;

-- Cria (p_id nulo) ou edita um produto.
create or replace function salvar_produto(p_token uuid, p_id int, p_categoria text, p_nome text, p_preco numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
begin
  perform _sessao(p_token, array['admin']);
  if length(v_nome) not between 1 and 60 then
    raise exception 'NOME_INVALIDO';
  end if;
  if p_preco is null or p_preco < 0 or p_preco > 99999 then
    raise exception 'PRECO_INVALIDO';
  end if;
  if not exists (select 1 from categorias where id = p_categoria and ativa) then
    raise exception 'CATEGORIA_INVALIDA';
  end if;
  if p_id is null then
    insert into produtos (categoria_id, nome, preco) values (p_categoria, v_nome, round(p_preco, 2));
  else
    update produtos set categoria_id = p_categoria, nome = v_nome, preco = round(p_preco, 2)
    where id = p_id and ativo;
    if not found then
      raise exception 'PRODUTO_INVALIDO';
    end if;
  end if;
  return estado(p_token);
end $$;

-- Tira o produto do cardápio. Pedidos e vendas antigos continuam com o nome e o preço da época.
create or replace function remover_produto(p_token uuid, p_id int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['admin']);
  update produtos set ativo = false where id = p_id;
  return estado(p_token);
end $$;

-- Todas as vendas do período (inclusive de caixas já fechados) e os fechamentos de caixa.
create or replace function relatorio(p_token uuid, p_de timestamptz, p_ate timestamptz) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _sessao(p_token, array['admin']);
  return jsonb_build_object(
    'vendas', coalesce((
      select jsonb_agg(_json_venda(v) order by v.fechada_em desc)
      from vendas v where v.fechada_em between p_de and p_ate), '[]'::jsonb),
    'fechamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'data', _ms(f.fechado_em), 'operador', f.operador_nome,
        'quantidade', f.quantidade, 'total', f.total) order by f.fechado_em desc)
      from fechamentos_caixa f where f.fechado_em between p_de and p_ate), '[]'::jsonb)
  );
end $$;

-- 4) Permissões: o site só pode chamar as funções da API.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  listar_funcionarios_login, entrar, sair, estado,
  adicionar_item, remover_item, observacao_item, limpar_rascunho, definir_observacao, enviar_cozinha,
  cancelar_comanda, transferir_mesa,
  mudar_status_comanda, finalizar_conta, fechar_caixa,
  criar_funcionario, editar_funcionario, remover_funcionario,
  definir_mesas, salvar_categoria, remover_categoria, mover_categoria, salvar_produto, remover_produto,
  relatorio
to anon, authenticated;

commit;

notify pgrst, 'reload schema';
