-- =====================================================================
--  Migração 01 — pagamento dividido em várias formas
--
--  Para quem JÁ rodou o schema.sql antes desta mudança.
--  NÃO apaga dados: só adiciona a tabela venda_pagamentos e atualiza
--  as funções. Pode rodar mais de uma vez sem problema.
--
--  Como usar: SQL Editor do Supabase → cole este arquivo → Run.
-- =====================================================================

begin;

-- 1) Vendas pagas com mais de uma forma ficam marcadas como 'misto'.
alter table vendas drop constraint if exists vendas_forma_pagamento_check;
alter table vendas add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('dinheiro', 'pix', 'credito', 'debito', 'misto'));

-- 2) Tabela com as partes de cada pagamento.
-- Uma venda pode ser paga em várias formas (ex.: R$ 20 dinheiro + R$ 5 débito + R$ 5 crédito).
-- "valor" é quanto foi entregue naquela forma; o troco (vendas.troco) sai sempre do dinheiro.
create table if not exists venda_pagamentos (
  id       uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas (id) on delete cascade,
  forma    text not null check (forma in ('dinheiro', 'pix', 'credito', 'debito')),
  valor    numeric(10, 2) not null check (valor > 0),
  unique (venda_id, forma)
);

alter table venda_pagamentos enable row level security;
revoke all on venda_pagamentos from anon, authenticated;

-- 3) Vendas antigas ganham uma parte única com a forma que já tinham.
insert into venda_pagamentos (venda_id, forma, valor)
select v.id, v.forma_pagamento, coalesce(v.recebido, v.total)
from vendas v
where v.forma_pagamento <> 'misto'
  and v.total > 0
  and not exists (select 1 from venda_pagamentos vp where vp.venda_id = v.id);

-- 4) Histórico passa a trazer a lista de pagamentos.
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
  ) order by v.fechada_em desc), '[]'::jsonb)
  from vendas v
  where v.fechamento_id is null;
$$;

-- 5) Nova função de fechar a conta.
-- Versão antiga (uma forma só); removida para não haver duas funções com o mesmo nome.
drop function if exists finalizar_conta(uuid, int, text, boolean, int, numeric);

-- p_pagamentos: [{"forma": "dinheiro", "valor": 20}, {"forma": "debito", "valor": 5}, ...]
create or replace function finalizar_conta(
  p_token uuid, p_mesa int, p_com_taxa boolean, p_pessoas int, p_pagamentos jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  u funcionarios;
  m mesas;
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
  select * into m from mesas where numero = p_mesa for update;
  if not found then
    raise exception 'MESA_INVALIDA';
  end if;
  if not exists (select 1 from comandas where mesa_numero = p_mesa and venda_id is null) then
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
  from comandas c join comanda_itens ci on ci.comanda_id = c.id
  where c.mesa_numero = p_mesa and c.venda_id is null;

  v_taxa := case when p_com_taxa then round(v_subtotal * 0.10, 2) else 0 end;
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
    mesa_numero, subtotal, taxa, total, forma_pagamento, pessoas, recebido, troco,
    aberta_em, atendente_id, atendente_nome, operador_id, operador_nome
  ) values (
    p_mesa, v_subtotal, v_taxa, v_total,
    case when v_formas = 1 then v_forma_unica else 'misto' end,
    greatest(coalesce(p_pessoas, 1), 1),
    v_pago, v_pago - v_total,
    m.aberta_em, m.atendente_id, (select nome from funcionarios where id = m.atendente_id),
    u.id, u.nome
  ) returning id into v_venda;

  insert into venda_pagamentos (venda_id, forma, valor)
  select v_venda, p->>'forma', sum(round((p->>'valor')::numeric, 2))
  from jsonb_array_elements(p_pagamentos) p
  group by p->>'forma';

  update comandas set venda_id = v_venda where mesa_numero = p_mesa and venda_id is null;
  delete from rascunho_itens where mesa_numero = p_mesa;
  update mesas set aberta_em = null, atendente_id = null, observacao = '' where numero = p_mesa;
  return estado(p_token);
end $$;

-- 6) Permissões (as funções internas continuam fechadas).
revoke execute on function _json_historico() from public, anon, authenticated;
revoke execute on function finalizar_conta(uuid, int, boolean, int, jsonb) from public;
grant execute on function finalizar_conta(uuid, int, boolean, int, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
