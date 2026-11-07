-- =====================================================================
--  Teste do portal do dono do sistema (super admin) e da auditoria
--
--  Cria um usuário de teste, simula o login por e-mail (com e sem 2FA)
--  e testa as funções admin_*. Tudo é desfeito no final (rollback).
--
--  Resultado esperado: termina sem erro. Se algo falhar, aparece um
--  erro começando com "FALHOU:".
-- =====================================================================

begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_intruso uuid := gen_random_uuid();
  r jsonb;
  v_empresa uuid;
  v_admin uuid;
  v_token uuid;
  v_suporte uuid;
  n int;
begin
  insert into auth.users (id, email) values (v_user, 'zz-teste-dono@exemplo.com'), (v_intruso, 'zz-intruso@exemplo.com');
  insert into super_admins (user_id, nome) values (v_user, 'Dono Teste');

  -- ---------- quem não é super admin ----------
  if has_function_privilege('anon', 'admin_painel()', 'EXECUTE') then
    raise exception 'FALHOU: visitante sem login pode chamar o portal';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_intruso, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin
    perform admin_painel();
    raise exception 'FALHOU: usuário comum entrou no portal';
  exception when others then
    if sqlerrm not like '%SEM_PERMISSAO%' then raise exception 'FALHOU: intruso (%)', sqlerrm; end if;
  end;
  raise notice 'ok: só super admin entra no portal';

  -- ---------- super admin sem 2FA ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  r := admin_eu();
  if r ->> 'nome' <> 'Dono Teste' or r ->> 'aal' <> 'aal1' then
    raise exception 'FALHOU: admin_eu (%)', r;
  end if;
  begin
    perform admin_painel();
    raise exception 'FALHOU: portal funcionou sem 2FA';
  exception when others then
    if sqlerrm not like '%MFA_NECESSARIO%' then raise exception 'FALHOU: sem 2FA (%)', sqlerrm; end if;
  end;
  raise notice 'ok: sem 2FA o portal não abre';

  -- ---------- com 2FA ----------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  r := admin_painel();
  if jsonb_array_length(r) < 1 then
    raise exception 'FALHOU: painel vazio';
  end if;

  -- criar restaurante copiando o cardápio de um modelo
  r := admin_criar_empresa('ZZ Teste Novo', 'zz-teste-novo', 'Gerente', '4321',
                           p_mesas => 6, p_taxa => 0.08, p_modelo => (select slug from empresas order by criada_em limit 1));
  v_empresa := (r ->> 'id')::uuid;
  select count(*) into n from mesas where empresa_id = v_empresa;
  if n <> 6 then raise exception 'FALHOU: mesas do restaurante novo (%)', n; end if;
  if (select count(*) from produtos where empresa_id = v_empresa)
     <> (select count(*) from produtos p join categorias c on c.empresa_id = p.empresa_id and c.id = p.categoria_id
         where p.empresa_id = (select id from empresas order by criada_em limit 1) and p.ativo and c.ativa) then
    raise exception 'FALHOU: cardápio não foi copiado inteiro';
  end if;
  begin
    perform admin_criar_empresa('Outro', 'zz-teste-novo', 'X', '1111');
    raise exception 'FALHOU: aceitou código repetido';
  exception when others then
    if sqlerrm not like '%CODIGO_EM_USO%' then raise exception 'FALHOU: código repetido (%)', sqlerrm; end if;
  end;
  begin
    perform admin_criar_empresa('Outro', 'Código Inválido!', 'X', '1111');
    raise exception 'FALHOU: aceitou código inválido';
  exception when others then
    if sqlerrm not like '%CODIGO_INVALIDO%' then raise exception 'FALHOU: código inválido (%)', sqlerrm; end if;
  end;
  raise notice 'ok: cria restaurante com admin, mesas e cardápio do modelo';

  -- o admin novo entra com o PIN provisório
  select id into v_admin from funcionarios where empresa_id = v_empresa;
  r := listar_funcionarios_login('zz-teste-novo');
  if not (r -> 0 ->> 'pinPadrao')::boolean then raise exception 'FALHOU: PIN provisório não marcado'; end if;
  r := entrar('zz-teste-novo', v_admin, '4321');
  v_token := (r ->> 'token')::uuid;
  if v_token is null then raise exception 'FALHOU: admin novo não entrou (%)', r; end if;

  -- resetar PIN derruba a sessão e o PIN novo funciona
  perform admin_resetar_pin(v_admin, '8765');
  if exists (select 1 from sessoes where token = v_token) then raise exception 'FALHOU: reset de PIN não derrubou a sessão'; end if;
  if entrar('zz-teste-novo', v_admin, '8765') ->> 'ok' <> 'true' then raise exception 'FALHOU: PIN resetado não funciona'; end if;
  raise notice 'ok: PIN provisório e reset de PIN';

  -- suspender derruba tudo; reativar volta
  perform admin_status_empresa(v_empresa, 'suspensa', 'teste');
  if exists (select 1 from sessoes s join funcionarios f on f.id = s.funcionario_id where f.empresa_id = v_empresa) then
    raise exception 'FALHOU: suspender não derrubou as sessões';
  end if;
  if entrar('zz-teste-novo', v_admin, '8765') ->> 'erro' <> 'EMPRESA_SUSPENSA' then raise exception 'FALHOU: suspenso deixou entrar'; end if;
  perform admin_status_empresa(v_empresa, 'ativa');
  if entrar('zz-teste-novo', v_admin, '8765') ->> 'ok' <> 'true' then raise exception 'FALHOU: reativar não funcionou'; end if;
  raise notice 'ok: suspender e reativar';

  -- editar
  perform admin_editar_empresa(v_empresa, p_nome => 'ZZ Teste Renomeado', p_slug => 'zz-teste-renomeado', p_cnpj => '00.000.000/0001-00');
  if (select slug from empresas where id = v_empresa) <> 'zz-teste-renomeado' then raise exception 'FALHOU: editar restaurante'; end if;

  -- acessar como (suporte)
  begin
    perform admin_acessar_como(v_empresa, '');
    raise exception 'FALHOU: suporte sem motivo';
  exception when others then
    if sqlerrm not like '%MOTIVO_OBRIGATORIO%' then raise exception 'FALHOU: motivo (%)', sqlerrm; end if;
  end;
  r := admin_acessar_como(v_empresa, 'Ajudar a configurar o cardápio');
  v_suporte := (r ->> 'token')::uuid;
  r := estado(v_suporte);
  if r ->> 'suporte' <> 'Dono Teste' then raise exception 'FALHOU: sessão de suporte não marcada (%)', r ->> 'suporte'; end if;
  perform salvar_produto(v_suporte, (select id from produtos where empresa_id = v_empresa order by id limit 1),
                         (select categoria_id from produtos where empresa_id = v_empresa order by id limit 1),
                         (select nome from produtos where empresa_id = v_empresa order by id limit 1), 99.9);
  if not exists (select 1 from log_auditoria where empresa_id = v_empresa and acao = 'preco_alterado' and ator_tipo = 'suporte') then
    raise exception 'FALHOU: mudança feita no suporte não ficou registrada como suporte';
  end if;
  raise notice 'ok: acessar como (suporte) com faixa e registro no log';

  -- auditoria e relatório
  r := admin_auditoria(v_empresa);
  if not (r::text like '%restaurante_criado%' and r::text like '%pin_resetado%' and r::text like '%restaurante_suspenso%'
          and r::text like '%suporte_iniciado%' and r::text like '%"login"%' and r::text like '%preco_alterado%') then
    raise exception 'FALHOU: faltam ações no log de auditoria (%)', r;
  end if;
  r := admin_relatorio(now() - interval '30 days', now() + interval '1 day');
  if jsonb_array_length(r -> 'empresas') < 2 then raise exception 'FALHOU: relatório consolidado'; end if;
  raise notice 'ok: auditoria e relatório consolidado';

  -- funcionário de restaurante não acessa o portal (o site usa a chave anônima)
  perform set_config('request.jwt.claims', '', true);
  begin
    perform admin_eu();
    raise exception 'FALHOU: sem login chamou o portal';
  exception when others then
    if sqlerrm not like '%SEM_PERMISSAO%' then raise exception 'FALHOU: sem login (%)', sqlerrm; end if;
  end;
  if has_table_privilege('anon', 'log_auditoria', 'SELECT') or has_table_privilege('authenticated', 'super_admins', 'SELECT') then
    raise exception 'FALHOU: tabelas do portal abertas';
  end if;
  raise notice 'ok: tabelas do portal fechadas';

  raise notice '=== TODOS OS TESTES DO PORTAL PASSARAM ===';
end $$;

rollback;
