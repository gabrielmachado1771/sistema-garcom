-- =====================================================================
--  Teste da operação do salão (migração 05)
--  Esgotado, variações/adicionais, balcão/retirada, desconto e
--  cancelamento com PIN de admin. Tudo é desfeito no final (rollback).
--
--  Resultado esperado: termina sem erro. Se algo falhar, aparece um
--  erro começando com "FALHOU:".
-- =====================================================================

begin;

do $$
declare
  e uuid;
  f_admin uuid; f_garcom uuid; f_caixa uuid; f_cozinha uuid;
  t_admin uuid; t_garcom uuid; t_caixa uuid; t_cozinha uuid; t_outra uuid;
  p_carne int; p_suco int;
  g_ponto int; o_mal int; o_ponto int; o_bem int; o_bacon int; o_queijo int; o_ovo int; o_suco int;
  r jsonb;
  n int;
  v_item int;
  v_balcao int;
  v_balcao2 int;
  v numeric;
begin
  -- ---------- preparação ----------
  insert into empresas (nome, slug) values ('ZZ Operação', 'zz-operacao') returning id into e;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (e, 'Chefe', 'admin', extensions.crypt('1357', extensions.gen_salt('bf', 4))) returning id into f_admin;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (e, 'Garçom Op', 'garcom', extensions.crypt('1111', extensions.gen_salt('bf', 4))) returning id into f_garcom;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (e, 'Caixa Op', 'caixa', extensions.crypt('2222', extensions.gen_salt('bf', 4))) returning id into f_caixa;
  insert into funcionarios (empresa_id, nome, funcao, pin_hash) values
    (e, 'Cozinha Op', 'cozinha', extensions.crypt('3333', extensions.gen_salt('bf', 4))) returning id into f_cozinha;
  insert into mesas (empresa_id, numero) select e, generate_series(1, 4);
  insert into categorias (empresa_id, id, nome) values (e, 'PRATOS', 'Pratos');
  insert into produtos (empresa_id, categoria_id, nome, preco) values (e, 'PRATOS', 'Picanha', 50) returning id into p_carne;
  insert into produtos (empresa_id, categoria_id, nome, preco) values (e, 'PRATOS', 'Suco', 8) returning id into p_suco;
  t_admin := (entrar('zz-operacao', f_admin, '1357') ->> 'token')::uuid;
  t_garcom := (entrar('zz-operacao', f_garcom, '1111') ->> 'token')::uuid;
  t_caixa := (entrar('zz-operacao', f_caixa, '2222') ->> 'token')::uuid;
  t_cozinha := (entrar('zz-operacao', f_cozinha, '3333') ->> 'token')::uuid;
  t_outra := (entrar('zz-operacao', f_caixa, '2222') ->> 'token')::uuid; -- outro aparelho do caixa

  -- ---------- esgotado ----------
  perform marcar_esgotado(t_cozinha, p_suco, true);
  begin
    perform adicionar_item(t_garcom, 1, p_suco);
    raise exception 'FALHOU: lançou produto esgotado';
  exception when others then
    if sqlerrm not like '%PRODUTO_ESGOTADO%' then raise exception 'FALHOU: esgotado (%)', sqlerrm; end if;
  end;
  begin
    perform marcar_esgotado(t_caixa, p_suco, false);
    raise exception 'FALHOU: caixa marcou esgotado';
  exception when others then
    if sqlerrm not like '%SEM_PERMISSAO%' then raise exception 'FALHOU: permissão esgotado (%)', sqlerrm; end if;
  end;
  r := estado(t_garcom);
  if (select (p ->> 'disponivel')::boolean from jsonb_array_elements(r -> 'cardapio' -> 0 -> 'produtos') p where (p ->> 'id')::int = p_suco) then
    raise exception 'FALHOU: cardápio não mostra o esgotado';
  end if;
  perform marcar_esgotado(t_garcom, p_suco, false);
  perform adicionar_item(t_garcom, 4, p_suco);
  perform limpar_rascunho(t_garcom, 4);
  raise notice 'ok: produto esgotado não pode ser lançado e volta quando liberado';

  -- ---------- variações e adicionais ----------
  begin
    perform salvar_opcoes_produto(t_garcom, p_carne, '[]');
    raise exception 'FALHOU: garçom mexeu nas opções';
  exception when others then
    if sqlerrm not like '%SEM_PERMISSAO%' then raise exception 'FALHOU: permissão opções (%)', sqlerrm; end if;
  end;
  perform salvar_opcoes_produto(t_admin, p_carne, '[
    {"nome": "Ponto da carne", "obrigatorio": true, "maximo": 1,
     "opcoes": [{"nome": "Mal passada", "preco": 0}, {"nome": "Ao ponto", "preco": 0}, {"nome": "Bem passada", "preco": 0}]},
    {"nome": "Adicionais", "obrigatorio": false, "maximo": 2,
     "opcoes": [{"nome": "Bacon", "preco": 5}, {"nome": "Queijo", "preco": 3.5}, {"nome": "Ovo", "preco": 2}]}
  ]');
  select o.id into o_mal from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_carne and o.nome = 'Mal passada';
  select o.id into o_ponto from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_carne and o.nome = 'Ao ponto';
  select o.id into o_bem from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_carne and o.nome = 'Bem passada';
  select o.id into o_bacon from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_carne and o.nome = 'Bacon';
  select o.id into o_queijo from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_carne and o.nome = 'Queijo';
  select o.id into o_ovo from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_carne and o.nome = 'Ovo';
  perform salvar_opcoes_produto(t_admin, p_suco, '[{"nome": "Sabor", "obrigatorio": true, "maximo": 1, "opcoes": [{"nome": "Laranja"}]}]');
  select o.id into o_suco from opcoes o join grupos_opcoes g on g.id = o.grupo_id where g.produto_id = p_suco;

  begin
    perform adicionar_item(t_garcom, 1, p_carne); -- sem o ponto (obrigatório)
    raise exception 'FALHOU: aceitou sem o obrigatório';
  exception when others then
    if sqlerrm not like '%OPCOES_INVALIDAS%' then raise exception 'FALHOU: obrigatório (%)', sqlerrm; end if;
  end;
  begin
    perform adicionar_item(t_garcom, 1, p_carne, '', array[o_mal, o_bem]); -- dois pontos
    raise exception 'FALHOU: aceitou dois pontos';
  exception when others then
    if sqlerrm not like '%OPCOES_INVALIDAS%' then raise exception 'FALHOU: máximo (%)', sqlerrm; end if;
  end;
  begin
    perform adicionar_item(t_garcom, 1, p_carne, '', array[o_ponto, o_bacon, o_queijo, o_ovo]); -- 3 adicionais (máx 2)
    raise exception 'FALHOU: aceitou adicionais demais';
  exception when others then
    if sqlerrm not like '%OPCOES_INVALIDAS%' then raise exception 'FALHOU: máximo adicionais (%)', sqlerrm; end if;
  end;
  begin
    perform adicionar_item(t_garcom, 1, p_carne, '', array[o_ponto, o_suco]); -- opção de outro produto
    raise exception 'FALHOU: aceitou opção de outro produto';
  exception when others then
    if sqlerrm not like '%OPCOES_INVALIDAS%' then raise exception 'FALHOU: opção alheia (%)', sqlerrm; end if;
  end;
  perform adicionar_item(t_garcom, 1, p_carne, '', array[o_bacon, o_ponto]);
  perform adicionar_item(t_garcom, 1, p_carne, '', array[o_ponto, o_bacon]); -- mesma escolha em outra ordem = mesma linha
  perform adicionar_item(t_garcom, 1, p_carne, '', array[o_mal]);
  select count(*) into n from rascunho_itens where empresa_id = e and mesa_numero = 1;
  if n <> 2 then raise exception 'FALHOU: linhas do rascunho com opções (%)', n; end if;
  r := (select m -> 'rascunho' from jsonb_array_elements(estado(t_garcom) -> 'mesas') m where (m ->> 'numero')::int = 1);
  if (select (x ->> 'preco')::numeric from jsonb_array_elements(r) x where (x ->> 'qtd')::int = 2) <> 55 then
    raise exception 'FALHOU: preço com adicional (%)', r;
  end if;
  perform enviar_cozinha(t_garcom, 1);
  select sum(preco * qtd) into v from comanda_itens where empresa_id = e;
  if v <> 160 then raise exception 'FALHOU: total enviado com adicionais (%)', v; end if;
  if not exists (select 1 from comanda_itens where empresa_id = e and opcoes::text like '%Bacon%') then
    raise exception 'FALHOU: cozinha não recebe as opções';
  end if;
  raise notice 'ok: variações e adicionais (obrigatório, máximo, preço extra, mesma linha)';

  -- ---------- cancelamento com PIN de admin ----------
  select id into v_item from comanda_itens where empresa_id = e and qtd = 2;
  begin
    perform cancelar_item(t_garcom, v_item, 1, '');
    raise exception 'FALHOU: cancelou sem motivo';
  exception when others then
    if sqlerrm not like '%MOTIVO_OBRIGATORIO%' then raise exception 'FALHOU: motivo (%)', sqlerrm; end if;
  end;
  r := cancelar_item(t_garcom, v_item, 1, 'Cliente desistiu', '9999');
  if r ->> 'erro' <> 'PIN_ADMIN_INCORRETO' or (select qtd from comanda_itens where id = v_item) <> 2 then
    raise exception 'FALHOU: cancelou com PIN errado';
  end if;
  r := cancelar_item(t_garcom, v_item, 1, 'Cliente desistiu', '1357');
  if (select qtd from comanda_itens where id = v_item) <> 1 then raise exception 'FALHOU: cancelar 1 unidade'; end if;
  if not exists (select 1 from log_auditoria where empresa_id = e and acao = 'item_cancelado'
                 and detalhes ->> 'autorizado_por' = 'Chefe' and detalhes ->> 'motivo' = 'Cliente desistiu') then
    raise exception 'FALHOU: cancelamento não foi para o log';
  end if;
  if (conferir_pin_admin(t_garcom, '1357') ->> 'admin') <> 'Chefe' or (conferir_pin_admin(t_garcom, '0000') ->> 'ok')::boolean then
    raise exception 'FALHOU: conferir_pin_admin';
  end if;
  raise notice 'ok: cancelar item enviado exige motivo e PIN de admin, e vai para o log';

  -- 5 PINs errados bloqueiam (e o bloqueio fica gravado mesmo com as chamadas separadas)
  for n in 1..5 loop
    begin
      perform cancelar_item(t_caixa, v_item, 1, 'tentativa', '0000');
    exception when others then null;
    end;
  end loop;
  begin
    perform cancelar_item(t_caixa, v_item, 1, 'tentativa', '1357');
    raise exception 'FALHOU: não bloqueou depois de 5 PINs errados';
  exception when others then
    if sqlerrm not like '%AUTORIZACAO_BLOQUEADA%' then raise exception 'FALHOU: bloqueio (%)', sqlerrm; end if;
  end;
  if (conferir_pin_admin(t_outra, '1357') ->> 'ok')::boolean is not true then
    raise exception 'FALHOU: bloqueio de um aparelho afetou outro';
  end if;
  raise notice 'ok: 5 PINs de admin errados bloqueiam aquele aparelho por 5 minutos';

  -- ---------- desconto ----------
  begin
    perform finalizar_conta(t_outra, 1, false, 1, '[{"forma":"pix","valor":100}]', 10, '');
    raise exception 'FALHOU: desconto sem motivo';
  exception when others then
    if sqlerrm not like '%MOTIVO_OBRIGATORIO%' then raise exception 'FALHOU: desconto motivo (%)', sqlerrm; end if;
  end;
  r := finalizar_conta(t_outra, 1, false, 1, '[{"forma":"pix","valor":100}]', 10, 'Cliente fiel', '0000');
  if r ->> 'erro' <> 'PIN_ADMIN_INCORRETO' or exists (select 1 from vendas where empresa_id = e) then
    raise exception 'FALHOU: desconto com PIN errado fechou a conta';
  end if;
  begin
    perform finalizar_conta(t_outra, 1, false, 1, '[{"forma":"pix","valor":100}]', 500, 'Exagero', '1357');
    raise exception 'FALHOU: desconto maior que a conta';
  exception when others then
    if sqlerrm not like '%DESCONTO_INVALIDO%' then raise exception 'FALHOU: desconto grande (%)', sqlerrm; end if;
  end;
  -- conta = 55 (1 picanha+bacon que sobrou) + 50 (mal passada) = 105; desconto 10 → 95
  perform finalizar_conta(t_outra, 1, false, 1, '[{"forma":"pix","valor":95}]', 10, 'Cliente fiel', '1357');
  select total into v from vendas where empresa_id = e;
  if v <> 95 or (select desconto_por from vendas where empresa_id = e) <> 'Chefe' then
    raise exception 'FALHOU: venda com desconto (%)', v;
  end if;
  if not exists (select 1 from log_auditoria where empresa_id = e and acao = 'desconto_aplicado') then
    raise exception 'FALHOU: desconto não foi para o log';
  end if;
  raise notice 'ok: desconto exige motivo e PIN de admin, fica na venda e no log';

  -- ---------- balcão e retirada ----------
  r := abrir_balcao(t_garcom, 'balcao', 'João');
  v_balcao := (r ->> 'criado')::int;
  r := abrir_balcao(t_caixa, 'retirada', 'Maria');
  v_balcao2 := (r ->> 'criado')::int;
  if v_balcao < 1001 or v_balcao2 <> v_balcao + 1
     or (select senha from mesas where empresa_id = e and numero = v_balcao2) <> 2 then
    raise exception 'FALHOU: numeração/senha do balcão';
  end if;
  perform definir_mesas(t_admin, 2);
  if not (select ativa from mesas where empresa_id = e and numero = v_balcao) then
    raise exception 'FALHOU: definir mesas mexeu no balcão';
  end if;
  perform adicionar_item(t_garcom, v_balcao, p_suco, '', array[o_suco]);
  perform enviar_cozinha(t_garcom, v_balcao);
  begin
    perform cancelar_balcao(t_garcom, v_balcao);
    raise exception 'FALHOU: cancelou balcão com pedido na cozinha';
  exception when others then
    if sqlerrm not like '%BALCAO_COM_PEDIDOS%' then raise exception 'FALHOU: cancelar balcão (%)', sqlerrm; end if;
  end;
  perform finalizar_conta(t_caixa, v_balcao, false, 1, '[{"forma":"dinheiro","valor":10}]');
  if (select rotulo from vendas where empresa_id = e and mesa_numero = v_balcao) <> 'Balcão #1 · João'
     or (select ativa from mesas where empresa_id = e and numero = v_balcao) then
    raise exception 'FALHOU: fechamento do balcão';
  end if;
  perform cancelar_balcao(t_caixa, v_balcao2);
  if (select ativa from mesas where empresa_id = e and numero = v_balcao2) then
    raise exception 'FALHOU: cancelar balcão vazio';
  end if;
  select count(*) into n from jsonb_array_elements(estado(t_garcom) -> 'mesas');
  if n <> 2 then raise exception 'FALHOU: balcões encerrados continuam na tela (%)', n; end if;
  raise notice 'ok: balcão e retirada com senha do dia, saem da tela ao pagar';

  raise notice '=== TODOS OS TESTES DA OPERAÇÃO PASSARAM ===';
end $$;

rollback;
