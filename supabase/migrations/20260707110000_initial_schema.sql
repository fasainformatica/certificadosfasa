-- Fasa Informatica - Sistema de Gestao de Certificados Digitais PFX
-- Execute este arquivo no SQL Editor do Supabase.
-- Idempotente para projeto novo e para atualizar a versao anterior deste sistema.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'financeiro');
  end if;

  if not exists (select 1 from pg_type where typname = 'certificado_status') then
    create type public.certificado_status as enum ('ativo', 'vencendo', 'vencido', 'substituido');
  end if;
end $$;

drop table if exists public.alertas_enviados cascade;
drop table if exists public.download_rate_limits cascade;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'financeiro',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome_razao_social text not null,
  cnpj text not null,
  email text,
  telefone text,
  whatsapp text,
  responsavel text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_cnpj_digits_check check (cnpj ~ '^[0-9]{14}$')
);

create table if not exists public.certificados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  cnpj text not null,
  nome_titular text not null,
  senha_ciphertext text not null,
  senha_iv text not null,
  senha_auth_tag text not null,
  data_emissao date,
  data_vencimento date not null,
  status public.certificado_status not null default 'ativo',
  storage_path text not null,
  nome_arquivo_original text not null,
  hash_arquivo text not null,
  ultimo_upload_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificados_cnpj_digits_check check (cnpj ~ '^[0-9]{14}$'),
  constraint certificados_hash_sha256_check check (hash_arquivo ~ '^[a-f0-9]{64}$'),
  constraint certificados_senha_crypto_check check (
    length(senha_ciphertext) > 0 and length(senha_iv) > 0 and length(senha_auth_tag) > 0
  )
);

create table if not exists public.configuracoes_sistema (
  id uuid primary key default gen_random_uuid(),
  dias_aviso_vencimento int[] not null default array[30,15,7],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuracoes_sistema_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid),
  constraint configuracoes_sistema_dias_check check (
    array_length(dias_aviso_vencimento, 1) is not null
    and cardinality(dias_aviso_vencimento) between 1 and 10
  )
);

alter table public.configuracoes_sistema drop column if exists email_destino_alertas;
alter table public.configuracoes_sistema drop column if exists smtp_host;
alter table public.configuracoes_sistema drop column if exists smtp_port;
alter table public.configuracoes_sistema drop column if exists smtp_user;
alter table public.configuracoes_sistema drop column if exists smtp_pass_ciphertext;
alter table public.configuracoes_sistema drop column if exists smtp_pass_iv;
alter table public.configuracoes_sistema drop column if exists smtp_pass_auth_tag;
alter table public.configuracoes_sistema drop column if exists brevo_api_key_ciphertext;
alter table public.configuracoes_sistema drop column if exists brevo_api_key_iv;
alter table public.configuracoes_sistema drop column if exists brevo_api_key_auth_tag;

create table if not exists public.links_download (
  id uuid primary key default gen_random_uuid(),
  certificado_id uuid not null references public.certificados(id) on delete cascade,
  token_publico text not null,
  senha_hash text not null,
  ativo boolean not null default true,
  usado boolean not null default false,
  usado_em timestamptz,
  invalidado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ip_uso inet,
  user_agent_uso text,
  tentativas_invalidas integer not null default 0,
  bloqueado_ate timestamptz,
  constraint links_download_token_length_check check (length(token_publico) >= 43),
  constraint links_download_senha_hash_check check (length(senha_hash) >= 20),
  constraint links_download_tentativas_check check (tentativas_invalidas >= 0),
  constraint links_download_estado_check check (
    not usado or usado_em is not null
  )
);

alter table public.links_download add column if not exists senha_hash text;
alter table public.links_download add column if not exists usado boolean not null default false;
alter table public.links_download add column if not exists usado_em timestamptz;
alter table public.links_download add column if not exists invalidado_em timestamptz;
alter table public.links_download add column if not exists criado_em timestamptz not null default now();
alter table public.links_download add column if not exists atualizado_em timestamptz not null default now();
alter table public.links_download add column if not exists ip_uso inet;
alter table public.links_download add column if not exists user_agent_uso text;
alter table public.links_download add column if not exists tentativas_invalidas integer not null default 0;
alter table public.links_download add column if not exists bloqueado_ate timestamptz;

update public.links_download
set
  ativo = false,
  invalidado_em = coalesce(invalidado_em, now()),
  senha_hash = coalesce(senha_hash, 'invalidated-legacy-download-link')
where senha_hash is null;

alter table public.links_download alter column senha_hash set not null;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  certificado_id uuid references public.certificados(id) on delete set null,
  ip inet,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_acao_check check (length(acao) between 3 and 80)
);

insert into public.configuracoes_sistema (id, dias_aviso_vencimento)
values ('00000000-0000-0000-0000-000000000001', array[30,15,7])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificados-pfx',
  'certificados-pfx',
  false,
  10485760,
  array[
    'application/x-pkcs12',
    'application/pkcs12',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create unique index if not exists clientes_cnpj_key on public.clientes (cnpj);
create index if not exists certificados_cnpj_idx on public.certificados (cnpj);
create index if not exists certificados_data_vencimento_idx on public.certificados (data_vencimento);
create index if not exists certificados_status_idx on public.certificados (status);
create index if not exists certificados_cliente_id_idx on public.certificados (cliente_id);
create index if not exists certificados_hash_arquivo_idx on public.certificados (hash_arquivo);
create index if not exists certificados_storage_path_idx on public.certificados (storage_path);
create unique index if not exists certificados_um_ativo_por_cliente_idx
  on public.certificados (cliente_id)
  where status = 'ativo';
create unique index if not exists certificados_um_atual_por_cliente_idx
  on public.certificados (cliente_id)
  where status in ('ativo', 'vencendo', 'vencido');
create unique index if not exists links_download_token_publico_key on public.links_download (token_publico);
create index if not exists links_download_certificado_id_idx on public.links_download (certificado_id);
create unique index if not exists links_download_um_ativo_por_certificado_idx
  on public.links_download (certificado_id)
  where ativo = true and usado = false;
create index if not exists links_download_bloqueado_ate_idx on public.links_download (bloqueado_ate);
create index if not exists audit_logs_certificado_id_idx on public.audit_logs (certificado_id);
create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_clientes_updated_at on public.clientes;
create trigger set_clientes_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

drop trigger if exists set_certificados_updated_at on public.certificados;
create trigger set_certificados_updated_at
before update on public.certificados
for each row execute function public.set_updated_at();

drop trigger if exists set_configuracoes_sistema_updated_at on public.configuracoes_sistema;
create trigger set_configuracoes_sistema_updated_at
before update on public.configuracoes_sistema
for each row execute function public.set_updated_at();

drop trigger if exists set_links_download_atualizado_em on public.links_download;
create trigger set_links_download_atualizado_em
before update on public.links_download
for each row execute function public.set_atualizado_em();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, role, active)
  values (new.id, 'financeiro', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select up.role
  from public.user_profiles up
  where up.id = auth.uid()
    and up.active = true
  limit 1;
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and up.active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin'::public.user_role;
$$;

create or replace function public.can_read_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin'::public.user_role, 'financeiro'::public.user_role);
$$;

create or replace function public.registrar_upload_certificado(
  p_cnpj text,
  p_nome_razao_social text,
  p_nome_titular text,
  p_senha_ciphertext text,
  p_senha_iv text,
  p_senha_auth_tag text,
  p_data_emissao date,
  p_data_vencimento date,
  p_status public.certificado_status,
  p_storage_path text,
  p_nome_arquivo_original text,
  p_hash_arquivo text,
  p_criado_por uuid,
  p_ip inet
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_certificado_id uuid;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' then
    raise exception 'cnpj_invalido';
  end if;

  insert into public.clientes (cnpj, nome_razao_social)
  values (p_cnpj, nullif(trim(p_nome_razao_social), ''))
  on conflict (cnpj) do update
    set
      nome_razao_social = coalesce(nullif(trim(excluded.nome_razao_social), ''), public.clientes.nome_razao_social),
      updated_at = now()
  returning id into v_cliente_id;

  update public.certificados
  set status = 'substituido', updated_at = now()
  where cliente_id = v_cliente_id
    and status in ('ativo', 'vencendo', 'vencido');

  insert into public.certificados (
    cliente_id,
    cnpj,
    nome_titular,
    senha_ciphertext,
    senha_iv,
    senha_auth_tag,
    data_emissao,
    data_vencimento,
    status,
    storage_path,
    nome_arquivo_original,
    hash_arquivo,
    criado_por
  )
  values (
    v_cliente_id,
    p_cnpj,
    p_nome_titular,
    p_senha_ciphertext,
    p_senha_iv,
    p_senha_auth_tag,
    p_data_emissao,
    p_data_vencimento,
    p_status,
    p_storage_path,
    p_nome_arquivo_original,
    p_hash_arquivo,
    p_criado_por
  )
  returning id into v_certificado_id;

  insert into public.audit_logs (user_id, acao, certificado_id, ip, metadata)
  values (
    p_criado_por,
    'upload_certificado',
    v_certificado_id,
    p_ip,
    jsonb_build_object('cnpj', p_cnpj, 'hash_arquivo', p_hash_arquivo)
  );

  return v_certificado_id;
end;
$$;

create or replace function public.excluir_certificado_com_cliente(
  p_certificado_id uuid,
  p_user_id uuid,
  p_ip inet,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_remaining integer;
  v_cliente_deleted boolean := false;
begin
  select cliente_id
  into v_cliente_id
  from public.certificados
  where id = p_certificado_id
  for update;

  if v_cliente_id is null then
    raise exception 'certificado_nao_encontrado';
  end if;

  delete from public.certificados
  where id = p_certificado_id;

  select count(*)
  into v_remaining
  from public.certificados
  where cliente_id = v_cliente_id;

  if v_remaining = 0 then
    delete from public.clientes
    where id = v_cliente_id;
    v_cliente_deleted := true;
  end if;

  insert into public.audit_logs (user_id, acao, certificado_id, ip, metadata)
  values (
    p_user_id,
    'exclusao_certificado',
    null,
    p_ip,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'certificado_id_excluido', p_certificado_id,
        'cliente_id', v_cliente_id,
        'cliente_excluido', v_cliente_deleted
      )
  );

  return jsonb_build_object('cliente_excluido', v_cliente_deleted);
end;
$$;

revoke all on function public.registrar_upload_certificado(
  text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet
) from public, anon, authenticated;
grant execute on function public.registrar_upload_certificado(
  text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet
) to service_role;

revoke all on function public.excluir_certificado_com_cliente(uuid, uuid, inet, jsonb) from public, anon, authenticated;
grant execute on function public.excluir_certificado_com_cliente(uuid, uuid, inet, jsonb) to service_role;

alter table public.user_profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.certificados enable row level security;
alter table public.configuracoes_sistema enable row level security;
alter table public.links_download enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "Profiles can read own profile" on public.user_profiles;
create policy "Profiles can read own profile"
on public.user_profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Only admins can manage profiles" on public.user_profiles;
create policy "Only admins can manage profiles"
on public.user_profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read clients" on public.clientes;
create policy "Internal users can read clients"
on public.clientes
for select
to authenticated
using (public.can_read_internal());

drop policy if exists "Admins can manage clients" on public.clientes;
create policy "Admins can manage clients"
on public.clientes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read certificate metadata" on public.certificados;
create policy "Internal users can read certificate metadata"
on public.certificados
for select
to authenticated
using (public.can_read_internal());

drop policy if exists "Admins can manage certificates" on public.certificados;
create policy "Admins can manage certificates"
on public.certificados
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Only admins can read settings" on public.configuracoes_sistema;
create policy "Only admins can read settings"
on public.configuracoes_sistema
for select
to authenticated
using (public.is_admin());

drop policy if exists "Only admins can manage settings" on public.configuracoes_sistema;
create policy "Only admins can manage settings"
on public.configuracoes_sistema
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read download link metadata" on public.links_download;
drop policy if exists "Only admins can read download link metadata" on public.links_download;
create policy "Only admins can read download link metadata"
on public.links_download
for select
to authenticated
using (public.is_admin());

drop policy if exists "Only admins can manage download links" on public.links_download;
create policy "Only admins can manage download links"
on public.links_download
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Only admins can read audit logs" on public.audit_logs;
create policy "Only admins can read audit logs"
on public.audit_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Only admins can insert audit logs" on public.audit_logs;
create policy "Only admins can insert audit logs"
on public.audit_logs
for insert
to authenticated
with check (public.is_admin());

revoke select on public.certificados from anon, authenticated;
grant select (
  id,
  cliente_id,
  cnpj,
  nome_titular,
  data_emissao,
  data_vencimento,
  status,
  nome_arquivo_original,
  hash_arquivo,
  ultimo_upload_em,
  criado_por,
  created_at,
  updated_at
) on public.certificados to authenticated;

revoke select on public.links_download from anon, authenticated;
grant select (
  id,
  certificado_id,
  token_publico,
  ativo,
  usado,
  usado_em,
  invalidado_em,
  criado_em,
  atualizado_em,
  ip_uso,
  user_agent_uso,
  tentativas_invalidas,
  bloqueado_ate
) on public.links_download to authenticated;

comment on table public.user_profiles is 'Perfis internos vinculados ao Supabase Auth; RBAC real e checado por RLS.';
comment on table public.clientes is 'Clientes identificados por CNPJ normalizado, criados ou atualizados no upload do PFX.';
comment on table public.certificados is 'Historico de certificados PFX, com senha criptografada por AES-256-GCM no backend.';
comment on table public.configuracoes_sistema is 'Configuracoes operacionais globais sem e-mail; usada para limiares internos de vencimento.';
comment on table public.links_download is 'Links publicos de alta entropia, senha aleatoria com hash seguro e uso unico.';
comment on table public.audit_logs is 'Trilha de auditoria sem segredos: registra acoes sensiveis e metadados minimos.';
