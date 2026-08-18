-- Auditoria de seguranca para o projeto certificadosfasa.
-- Execute no Supabase SQL Editor apos rotacionar as chaves e aplicar migrations.
-- Este script nao altera dados.

select
  now() as audit_started_at,
  current_database() as database_name,
  current_user as executed_by;

-- 1. RLS nas tabelas operacionais do schema public.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- 2. Grants diretos para anon/authenticated em tabelas publicas.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 3. Politicas RLS existentes.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4. Funcoes SECURITY DEFINER e search_path.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(
    array_to_string(p.proconfig, ', '),
    ''
  ) as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef is true
order by p.proname, arguments;

-- 5. Permissoes EXECUTE em funcoes publicas para roles sensiveis.
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by routine_name, grantee, privilege_type;

-- 6. Definicao dos helpers usados por RLS.
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_user_role','is_admin','is_internal_user','can_read_internal','handle_new_user')
order by p.proname;

-- 7. Buckets e exposicao publica de Storage.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by id;

-- 8. Grants diretos em storage para anon/authenticated.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'storage'
  and table_name in ('buckets', 'objects')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 9. Colunas com nomes sensiveis no schema public.
select
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    column_name ilike '%senha%'
    or column_name ilike '%password%'
    or column_name ilike '%secret%'
    or column_name ilike '%token%'
    or column_name ilike '%cipher%'
    or column_name ilike '%auth_tag%'
  )
order by table_name, column_name;

-- 10. Indicadores agregados de Auth sem listar e-mails ou dados pessoais.
select
  count(*) as total_users,
  count(*) filter (where email_confirmed_at is not null) as email_confirmed_users,
  count(*) filter (where last_sign_in_at >= now() - interval '7 days') as signed_in_last_7_days,
  min(created_at) as first_user_created_at,
  max(created_at) as last_user_created_at,
  max(last_sign_in_at) as latest_sign_in_at
from auth.users;

-- 11. Perfis internos agregados para detectar signup aberto com ativacao indevida.
select
  role,
  active,
  count(*) as total
from public.user_profiles
group by role, active
order by role, active;

-- 12. Ultimos eventos de auditoria do sistema sem expor metadata detalhada.
select
  acao,
  count(*) as total,
  max(created_at) as latest_at
from public.audit_logs
where created_at >= now() - interval '30 days'
group by acao
order by latest_at desc;

-- 13. Download publico: links ativos e usados, sem expor tokens.
select
  count(*) filter (where ativo is true and usado is false) as active_unused_links,
  count(*) filter (where usado is true) as used_links,
  count(*) filter (where bloqueado_ate is not null and bloqueado_ate > now()) as blocked_links,
  max(criado_em) as latest_created_at,
  max(usado_em) as latest_used_at
from public.links_download;

-- 14. Objetos no bucket privado de certificados.
select
  bucket_id,
  count(*) as object_count,
  max(created_at) as latest_object_created_at
from storage.objects
where bucket_id = 'certificados-pfx'
group by bucket_id;
