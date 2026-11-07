-- =====================================================================
--  Teste de isolamento entre restaurantes (multiempresa)
--
--  Cria dois restaurantes de teste (A e B) e tenta, por todas as funções
--  que o site usa, fazer A enxergar ou alterar dados de B.
--
--  É SEGURO rodar em qualquer banco: tudo acontece dentro de uma
--  transação que é desfeita no final (rollback). Nada fica gravado.
--
--  Resultado esperado: termina sem erro. Se algum teste falhar, aparece
--  um erro começando com "FALHOU:" dizendo qual.
-- =====================================================================

begin;

do $$
declare
  ea uuid; eb uuid;
  admin_a uuid; garcom_a uuid; admin_b uuid; caixa_b uuid;
  pa int; pb int;
  ta uuid; tb uuid;
  r jsonb;
  cb uuid;
  n int;
  t text;
begin
  -- ---------- preparação ----------
  insert into empresas (nome, slug) values ('Teste A', 'zz-teste-a') returning id into ea;
  insert into empresas (nome, slug) values ('Teste B', 'zz-teste-b') returning id into eb;

  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (ea, 'Admin A', 'admin', extensions.crypt('1111', extensions.gen_salt('bf', 4))) returning id into admin_a;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (ea, 'Garçom A', 'garcom', extensions.crypt('1112', extensions.gen_salt('bf', 4))) returning id into garcom_a;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (eb, 'Admin B', 'admin', extensions.crypt('2222', extensions.gen_salt('bf', 4))) returning id into admin_b;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (eb, 'Caixa B', 'caixa', extensions.crypt('2223', extensions.gen_salt('bf', 4))) returning id into caixa_b;
  -- Mesmo nome em restaurantes diferentes é permitido.
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (eb, 'Garçom A', 'garcom', extensions.crypt('2224', extensions.gen_salt('bf', 4)));

  insert into mesas (empresa_id, numero) select ea, generate_series(1, 3);
  insert into mesas (empresa_id, numero) select eb, generate_series(1, 3);
  insert into categorias (empresa_id, id, nome) values (ea, 'COMUM', 'Comum A'), (eb, 'COMUM', 'Comum B'), (eb, 'SO_B', 'Só B');
  insert into produtos (empresa_id, categoria_id, nome, preco) values (ea, 'COMUM', 'Prato A', 10) returning id into pa;
  insert into produtos (empresa_id, categoria_id, nome, preco) values (eb, 'COMUM', 'Prato B', 20) returning id into pb;

  -- ---------- login ----------
  r := entrar('zz-teste-a', admin_b, '2222');
  if r->>'erro' is distinct from 'USUARIO_INVALIDO' then
    raise exception 'FALHOU: funcionário de B entrou pelo link de A (%)', r;
  end if;
  r := entrar('zz-teste-a', admin_a, '1111'); ta := (r->>'token')::uuid;
  r := entrar('zz-teste-b', admin_b, '2222'); tb := (r->>'token')::uuid;
  if ta is null or tb is null then
    raise exception 'FALHOU: login normal não funcionou';
  end if;

  r := listar_funcionarios_login('zz-teste-a');
  if r::text like '%Admin B%' or r::text like '%Caixa B%' or jsonb_array_length(r) <> 2 then
    raise exception 'FALHOU: lista de login de A mostra gente de B (%)', r;
  end if;
  raise notice 'ok: login só aceita funcionários do próprio restaurante';

  -- ---------- leitura ----------
  r := estado(ta);
  if r::text like '%Prato B%' or r::text like '%Admin B%' or r::text like '%Só B%'
     or jsonb_array_length(r->'mesas') <> 3 or r->'empresa'->>'slug' <> 'zz-teste-a' then
    raise exception 'FALHOU: estado de A contém dados de B';
  end if;
  raise notice 'ok: estado de A não contém nada de B';

  -- ---------- B abre conta na mesa 1 ----------
  perform adicionar_item(tb, 1, pb);
  perform enviar_cozinha(tb, 1);
  select id into cb from comandas where empresa_id = eb and mesa_numero = 1;

  -- ---------- tentativas de A sobre dados de B ----------
  begin
    perform adicionar_item(ta, 1, pb);
    raise exception 'FALHOU: A lançou produto de B';
  exception when others then
    if sqlerrm not like '%PRODUTO_INVALIDO%' then raise exception 'FALHOU: adicionar_item (%)', sqlerrm; end if;
  end;

  begin
    perform mudar_status_comanda(ta, cb, 'pronto');
    raise exception 'FALHOU: A mudou comanda de B';
  exception when others then
    if sqlerrm not like '%COMANDA_INVALIDA%' then raise exception 'FALHOU: mudar_status_comanda (%)', sqlerrm; end if;
  end;

  perform cancelar_comanda(ta, cb);
  if not exists (select 1 from comandas where id = cb) then
    raise exception 'FALHOU: A cancelou comanda de B';
  end if;

  begin
    perform finalizar_conta(ta, 1, false, 1, '[{"forma":"pix","valor":20}]');
    raise exception 'FALHOU: A fechou a conta da mesa 1 de B';
  exception when others then
    if sqlerrm not like '%MESA_SEM_CONTA%' then raise exception 'FALHOU: finalizar_conta (%)', sqlerrm; end if;
  end;

  begin
    perform transferir_mesa(ta, 1, 2);
    raise exception 'FALHOU: A transferiu a mesa de B';
  exception when others then
    if sqlerrm not like '%MESA_VAZIA%' then raise exception 'FALHOU: transferir_mesa (%)', sqlerrm; end if;
  end;

  perform limpar_rascunho(ta, 1);
  perform definir_observacao(ta, 1, 'invadido');
  if exists (select 1 from mesas where empresa_id = eb and observacao = 'invadido') then
    raise exception 'FALHOU: A escreveu observação na mesa de B';
  end if;
  raise notice 'ok: A não mexe em mesas, pedidos nem contas de B';

  -- ---------- equipe ----------
  begin
    perform editar_funcionario(ta, admin_b, null, null, null, '0000');
    raise exception 'FALHOU: A trocou o PIN do admin de B';
  exception when others then
    if sqlerrm not like '%FUNCIONARIO_INVALIDO%' then raise exception 'FALHOU: editar_funcionario (%)', sqlerrm; end if;
  end;
  perform remover_funcionario(ta, caixa_b);
  if not exists (select 1 from funcionarios where id = caixa_b) then
    raise exception 'FALHOU: A apagou funcionário de B';
  end if;
  raise notice 'ok: A não mexe na equipe de B';

  -- ---------- cardápio ----------
  begin
    perform salvar_produto(ta, pb, 'COMUM', 'Hackeado', 0);
    raise exception 'FALHOU: A editou produto de B';
  exception when others then
    if sqlerrm not like '%PRODUTO_INVALIDO%' then raise exception 'FALHOU: salvar_produto (%)', sqlerrm; end if;
  end;
  begin
    perform salvar_produto(ta, null, 'SO_B', 'Novo', 1);
    raise exception 'FALHOU: A criou produto em categoria de B';
  exception when others then
    if sqlerrm not like '%CATEGORIA_INVALIDA%' then raise exception 'FALHOU: salvar_produto categoria (%)', sqlerrm; end if;
  end;
  begin
    perform salvar_categoria(ta, 'SO_B', 'Renomeada');
    raise exception 'FALHOU: A renomeou categoria de B';
  exception when others then
    if sqlerrm not like '%CATEGORIA_INVALIDA%' then raise exception 'FALHOU: salvar_categoria (%)', sqlerrm; end if;
  end;
  perform remover_produto(ta, pb);
  perform remover_categoria(ta, 'SO_B');
  perform mover_categoria(ta, 'COMUM', 1);
  if not (select ativo from produtos where id = pb) or not (select ativa from categorias where empresa_id = eb and id = 'SO_B') then
    raise exception 'FALHOU: A apagou produto/categoria de B';
  end if;
  raise notice 'ok: A não mexe no cardápio de B';

  -- ---------- mesas e configuração ----------
  perform definir_mesas(ta, 1);
  select count(*) into n from mesas where empresa_id = eb and ativa;
  if n <> 3 then
    raise exception 'FALHOU: definir_mesas de A mudou as mesas de B';
  end if;
  perform configurar_empresa(ta, 'A renomeado', 0.05);
  if (select nome from empresas where id = eb) <> 'Teste B' or (select taxa_servico from empresas where id = eb) <> 0.10 then
    raise exception 'FALHOU: configurar_empresa de A mudou B';
  end if;
  raise notice 'ok: configurações de A não afetam B';

  -- ---------- vendas, caixa e relatório ----------
  perform finalizar_conta(tb, 1, true, 1, '[{"forma":"pix","valor":22}]');
  r := relatorio(ta, now() - interval '1 day', now() + interval '1 day');
  if jsonb_array_length(r->'vendas') <> 0 then
    raise exception 'FALHOU: relatório de A mostra venda de B';
  end if;
  if jsonb_array_length(estado(ta)->'historico') <> 0 then
    raise exception 'FALHOU: histórico de A mostra venda de B';
  end if;
  perform fechar_caixa(ta);
  if exists (select 1 from vendas where empresa_id = eb and fechamento_id is not null) then
    raise exception 'FALHOU: A fechou o caixa de B';
  end if;
  if (select total from vendas where empresa_id = eb) <> 22 then
    raise exception 'FALHOU: taxa de serviço de B foi afetada pela de A';
  end if;
  raise notice 'ok: vendas, caixa e relatórios separados';

  -- ---------- restaurante suspenso ----------
  update empresas set status = 'suspensa' where id = eb;
  begin
    perform estado(tb);
    raise exception 'FALHOU: sessão de restaurante suspenso continuou funcionando';
  exception when others then
    if sqlerrm not like '%SESSAO_INVALIDA%' then raise exception 'FALHOU: suspensão (%)', sqlerrm; end if;
  end;
  r := entrar('zz-teste-b', admin_b, '2222');
  if r->>'erro' is distinct from 'EMPRESA_SUSPENSA' then
    raise exception 'FALHOU: restaurante suspenso deixou entrar (%)', r;
  end if;
  if jsonb_array_length(listar_funcionarios_login('zz-teste-b')) <> 0 then
    raise exception 'FALHOU: restaurante suspenso mostra a equipe no login';
  end if;
  perform estado(ta); -- A continua funcionando
  raise notice 'ok: restaurante suspenso fica bloqueado e os outros continuam';

  -- ---------- o site não acessa tabelas nem funções internas ----------
  foreach t in array array['empresas', 'funcionarios', 'sessoes', 'categorias', 'produtos', 'mesas', 'rascunho_itens',
                           'fechamentos_caixa', 'vendas', 'venda_pagamentos', 'comandas', 'comanda_itens']
  loop
    if has_table_privilege('anon', 'public.' || t, 'SELECT') or has_table_privilege('anon', 'public.' || t, 'UPDATE') then
      raise exception 'FALHOU: o site consegue ler/alterar a tabela % diretamente', t;
    end if;
  end loop;
  if has_function_privilege('anon', '_sessao(uuid, text[])', 'EXECUTE')
     or has_function_privilege('anon', '_json_mesas(uuid)', 'EXECUTE') then
    raise exception 'FALHOU: o site consegue chamar funções internas';
  end if;
  raise notice 'ok: tabelas e funções internas fechadas para o site';

  raise notice '=== TODOS OS TESTES DE ISOLAMENTO PASSARAM ===';
end $$;

rollback;
