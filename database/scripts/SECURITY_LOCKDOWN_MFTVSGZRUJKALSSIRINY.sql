-- Lockdown imediato para o projeto Supabase mftvsgzrujkalssiriny.
-- Execute apenas no SQL Editor desse projeto, nao no projeto certificadosfasa.
-- Objetivo: ativar RLS nas tabelas informadas e remover SELECT anonimo direto.
-- Este script nao cria policies de leitura para authenticated; aplica default deny
-- ate que cada tabela tenha uma policy de negocio revisada.

begin;

do $$
declare
  table_name text;
  table_names text[] := array[
    'modulos',
    'user_roles',
    'usuario_tipos',
    'clientes',
    'fornecedores',
    'produtos',
    'metas',
    'banco_lancamentos',
    'tipos_servico',
    'fiscal_logs',
    'indicacoes',
    'funcionario_ferias',
    'suporte_tickets'
  ];
begin
  foreach table_name in array table_names
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all privileges on table public.%I from anon', table_name);
      execute format('revoke all privileges on table public.%I from public', table_name);
    end if;
  end loop;
end;
$$;

revoke usage on schema public from public, anon;
revoke all privileges on all tables in schema public from public, anon;
revoke all privileges on all sequences in schema public from public, anon;
revoke all privileges on all functions in schema public from public, anon;

-- Evidencia: tabelas ainda com privilegio para anon/public depois do lockdown.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('PUBLIC', 'anon')
order by table_name, grantee, privilege_type;

commit;
