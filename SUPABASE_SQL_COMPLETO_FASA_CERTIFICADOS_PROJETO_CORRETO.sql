-- Fasa Informatica - Sistema de Gestao de Certificados Digitais PFX
-- Execute este arquivo no SQL Editor do Supabase.
-- Idempotente para projeto novo e para atualizar a versao anterior deste sistema.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

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
  token_hash text not null,
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
  constraint links_download_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint links_download_senha_hash_check check (length(senha_hash) >= 20),
  constraint links_download_tentativas_check check (tentativas_invalidas >= 0),
  constraint links_download_estado_check check (
    not usado or usado_em is not null
  )
);

alter table public.links_download drop constraint if exists links_download_token_length_check;
alter table public.links_download add column if not exists token_hash text;
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
  senha_hash = coalesce(senha_hash, 'invalidated-legacy-download-link'),
  token_hash = coalesce(token_hash, encode(digest('invalidated-legacy-download-link:' || id::text, 'sha256'), 'hex'))
where senha_hash is null or token_hash is null;

drop index if exists links_download_token_publico_key;
alter table public.links_download drop column if exists token_publico;
alter table public.links_download drop constraint if exists links_download_token_hash_check;
alter table public.links_download add constraint links_download_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$');
alter table public.links_download alter column token_hash set not null;
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

create table if not exists public.storage_reconciliation_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  certificado_id uuid references public.certificados(id) on delete set null,
  storage_path text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint storage_reconciliation_operation_check check (operation_type in ('upload','delete','restore','verify')),
  constraint storage_reconciliation_status_check check (status in ('pending','processing','completed','failed')),
  constraint storage_reconciliation_attempts_check check (attempts >= 0 and max_attempts between 1 and 20),
  constraint storage_reconciliation_path_check check (length(storage_path) between 5 and 1024)
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
create index if not exists clientes_nome_razao_social_trgm_idx
  on public.clientes using gin (nome_razao_social gin_trgm_ops);
create index if not exists clientes_cnpj_trgm_idx
  on public.clientes using gin (cnpj gin_trgm_ops);
create index if not exists certificados_cnpj_idx on public.certificados (cnpj);
create index if not exists certificados_cnpj_trgm_idx
  on public.certificados using gin (cnpj gin_trgm_ops);
create index if not exists certificados_nome_titular_trgm_idx
  on public.certificados using gin (nome_titular gin_trgm_ops);
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
create unique index if not exists links_download_token_hash_key on public.links_download (token_hash);
create index if not exists links_download_certificado_id_idx on public.links_download (certificado_id);
create unique index if not exists links_download_um_ativo_por_certificado_idx
  on public.links_download (certificado_id)
  where ativo = true and usado = false;
create index if not exists links_download_bloqueado_ate_idx on public.links_download (bloqueado_ate);
create index if not exists audit_logs_certificado_id_idx on public.audit_logs (certificado_id);
create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists storage_reconciliation_jobs_status_idx on public.storage_reconciliation_jobs (status, created_at desc);
create index if not exists storage_reconciliation_jobs_certificado_id_idx on public.storage_reconciliation_jobs (certificado_id);
create index if not exists storage_reconciliation_jobs_storage_path_idx on public.storage_reconciliation_jobs (storage_path);

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

drop trigger if exists set_storage_reconciliation_jobs_updated_at on public.storage_reconciliation_jobs;
create trigger set_storage_reconciliation_jobs_updated_at
before update on public.storage_reconciliation_jobs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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

drop function if exists public.registrar_upload_certificado(
  text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet
);

create or replace function public.registrar_upload_certificado(
  p_cnpj text,
  p_nome_razao_social text,
  p_email text,
  p_telefone text,
  p_whatsapp text,
  p_responsavel text,
  p_observacoes text,
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

  insert into public.clientes (
    cnpj,
    nome_razao_social,
    email,
    telefone,
    whatsapp,
    responsavel,
    observacoes
  )
  values (
    p_cnpj,
    nullif(trim(p_nome_razao_social), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_responsavel, '')), ''),
    nullif(trim(coalesce(p_observacoes, '')), '')
  )
  on conflict (cnpj) do update
    set
      nome_razao_social = coalesce(nullif(trim(excluded.nome_razao_social), ''), public.clientes.nome_razao_social),
      email = excluded.email,
      telefone = excluded.telefone,
      whatsapp = excluded.whatsapp,
      responsavel = excluded.responsavel,
      observacoes = excluded.observacoes,
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
  text, text, text, text, text, text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet
) from public, anon, authenticated;
grant execute on function public.registrar_upload_certificado(
  text, text, text, text, text, text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet
) to service_role;

revoke all on function public.excluir_certificado_com_cliente(uuid, uuid, inet, jsonb) from public, anon, authenticated;
grant execute on function public.excluir_certificado_com_cliente(uuid, uuid, inet, jsonb) to service_role;

alter table public.user_profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.certificados enable row level security;
alter table public.configuracoes_sistema enable row level security;
alter table public.links_download enable row level security;
alter table public.audit_logs enable row level security;
alter table public.storage_reconciliation_jobs enable row level security;

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

drop policy if exists "Only admins can read storage reconciliation jobs" on public.storage_reconciliation_jobs;
create policy "Only admins can read storage reconciliation jobs"
on public.storage_reconciliation_jobs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Only admins can manage storage reconciliation jobs" on public.storage_reconciliation_jobs;
create policy "Only admins can manage storage reconciliation jobs"
on public.storage_reconciliation_jobs
for all
to authenticated
using (public.is_admin())
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

revoke select on public.storage_reconciliation_jobs from anon, authenticated;
grant select (
  id,
  operation_type,
  certificado_id,
  storage_path,
  status,
  attempts,
  max_attempts,
  last_error,
  metadata,
  created_at,
  updated_at,
  processed_at
) on public.storage_reconciliation_jobs to authenticated;

comment on table public.user_profiles is 'Perfis internos vinculados ao Supabase Auth; RBAC real e checado por RLS.';
comment on table public.clientes is 'Clientes identificados por CNPJ normalizado, criados ou atualizados no upload do PFX.';
comment on table public.certificados is 'Historico de certificados PFX, com senha criptografada por AES-256-GCM no backend.';
comment on table public.configuracoes_sistema is 'Configuracoes operacionais globais sem e-mail; usada para limiares internos de vencimento.';
comment on table public.links_download is 'Links publicos de alta entropia. Token puro nao e armazenado; somente token_hash, senha_hash e metadados de uso unico.';
comment on table public.audit_logs is 'Trilha de auditoria sem segredos: registra acoes sensiveis e metadados minimos.';
comment on table public.storage_reconciliation_jobs is 'Fila administrativa de reconciliacao entre Postgres e Storage privado para uploads, exclusoes e verificacoes.';

-- Modulo WhatsApp Bot para avisos automaticos de vencimento.
-- Single-tenant: este sistema interno nao usa company_id. O bot nunca acessa Supabase diretamente.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_event_status') then
    create type public.notification_event_status as enum (
      'pending',
      'reserved',
      'processing',
      'retry',
      'sent',
      'failed',
      'cancelled',
      'skipped'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'whatsapp_device_status') then
    create type public.whatsapp_device_status as enum (
      'created',
      'pending_activation',
      'active',
      'disconnected',
      'error',
      'revoked',
      'expired'
    );
  end if;
end $$;

alter table public.clientes add column if not exists whatsapp text;
alter table public.clientes drop constraint if exists clientes_whatsapp_digits_check;
alter table public.clientes add constraint clientes_whatsapp_digits_check
  check (whatsapp is null or whatsapp ~ '^55[0-9]{10,11}$');

create table if not exists public.notification_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  enabled boolean not null default false,
  expired_notifications_enabled boolean not null default true,
  dias_aviso_vencimento integer[] not null default array[30,15,1],
  delay_minimo_segundos integer not null default 30,
  delay_maximo_segundos integer not null default 60,
  max_attempts integer not null default 3,
  polling_interval_seconds integer not null default 5,
  heartbeat_interval_seconds integer not null default 30,
  send_window_start text not null default '08:00',
  send_window_end text not null default '18:00',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid),
  constraint notification_settings_days_check check (
    cardinality(dias_aviso_vencimento) between 1 and 10
    and 0 < all(dias_aviso_vencimento)
  ),
  constraint notification_settings_delay_check check (
    delay_minimo_segundos >= 30
    and delay_maximo_segundos >= delay_minimo_segundos
  ),
  constraint notification_settings_attempts_check check (max_attempts between 1 and 10),
  constraint notification_settings_polling_check check (polling_interval_seconds between 5 and 25),
  constraint notification_settings_heartbeat_check check (heartbeat_interval_seconds between 15 and 300),
  constraint notification_settings_window_start_check check (send_window_start ~ '^[0-9]{2}:[0-9]{2}$'),
  constraint notification_settings_window_end_check check (send_window_end ~ '^[0-9]{2}:[0-9]{2}$')
);

alter table public.notification_settings
  add column if not exists expired_notifications_enabled boolean not null default true,
  add column if not exists delay_minimo_segundos integer,
  add column if not exists delay_maximo_segundos integer;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_settings'
      and column_name = 'delay_min_seconds'
  ) then
    execute $sql$
      update public.notification_settings
      set
        delay_minimo_segundos = greatest(30, coalesce(delay_minimo_segundos, delay_min_seconds, 30)),
        delay_maximo_segundos = greatest(greatest(30, coalesce(delay_minimo_segundos, delay_min_seconds, 30)), coalesce(delay_maximo_segundos, delay_max_seconds, 60))
      where delay_minimo_segundos is null
         or delay_maximo_segundos is null
         or delay_minimo_segundos < 30
         or delay_maximo_segundos < delay_minimo_segundos
    $sql$;
  else
    update public.notification_settings
    set
      delay_minimo_segundos = greatest(30, coalesce(delay_minimo_segundos, 30)),
      delay_maximo_segundos = greatest(greatest(30, coalesce(delay_minimo_segundos, 30)), coalesce(delay_maximo_segundos, 60))
    where delay_minimo_segundos is null
       or delay_maximo_segundos is null
       or delay_minimo_segundos < 30
       or delay_maximo_segundos < delay_minimo_segundos;
  end if;
end $$;

alter table public.notification_settings
  alter column delay_minimo_segundos set not null,
  alter column delay_maximo_segundos set not null,
  alter column delay_minimo_segundos set default 30,
  alter column delay_maximo_segundos set default 60,
  alter column polling_interval_seconds set default 5;

alter table public.notification_settings drop constraint if exists notification_settings_delay_check;
alter table public.notification_settings drop constraint if exists notification_settings_polling_check;

update public.notification_settings
set
  delay_minimo_segundos = 30,
  delay_maximo_segundos = 60,
  polling_interval_seconds = 5
where delay_minimo_segundos < 30
   or delay_maximo_segundos < delay_minimo_segundos
   or polling_interval_seconds < 5
   or polling_interval_seconds > 25;

alter table public.notification_settings add constraint notification_settings_delay_check check (
  delay_minimo_segundos >= 30
  and delay_maximo_segundos >= delay_minimo_segundos
);

alter table public.notification_settings add constraint notification_settings_polling_check check (
  polling_interval_seconds between 5 and 25
);

alter table public.notification_settings
  drop column if exists delay_min_seconds,
  drop column if exists delay_max_seconds;

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'certificate_expiring',
  title text not null,
  content text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_type_check check (type in ('certificate_expiring','certificate_expired','manual_test')),
  constraint notification_templates_content_not_blank_check check (length(btrim(content)) >= 30)
);

alter table public.notification_templates drop constraint if exists notification_templates_type_check;
alter table public.notification_templates add constraint notification_templates_type_check
  check (type in ('certificate_expiring','certificate_expired','manual_test'));

create table if not exists public.notification_recipients (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  telefone_normalizado text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_recipients_nome_check check (length(btrim(nome)) >= 2),
  constraint notification_recipients_phone_check check (telefone_normalizado ~ '^55[0-9]{10,11}$')
);

create table if not exists public.whatsapp_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  signing_secret_hash text not null,
  signing_secret_ciphertext text not null,
  signing_secret_iv text not null,
  signing_secret_auth_tag text not null,
  status public.whatsapp_device_status not null default 'pending_activation',
  is_primary_sender boolean not null default false,
  connected_phone text,
  browser_name text,
  user_agent text,
  app_version text,
  last_seen_at timestamptz,
  last_connected_at timestamptz,
  last_disconnected_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint whatsapp_devices_name_check check (length(btrim(name)) >= 2),
  constraint whatsapp_devices_connected_phone_check check (
    connected_phone is null or connected_phone ~ '^55[0-9]{10,11}$'
  )
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete cascade,
  certificado_id uuid references public.certificados(id) on delete cascade,
  recipient_id uuid references public.notification_recipients(id) on delete set null,
  telefone_destino text not null,
  template_id uuid references public.notification_templates(id) on delete set null,
  type text not null default 'certificate_expiring',
  dias_restantes integer not null,
  send_date date not null default current_date,
  mensagem_renderizada text not null,
  status public.notification_event_status not null default 'pending',
  provider text not null default 'whatsapp_desktop',
  channel text not null default 'whatsapp',
  device_id uuid references public.whatsapp_devices(id) on delete set null,
  reservation_id uuid,
  reservation_token_hash text,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_retry_at timestamptz,
  idempotency_key text,
  error_message text,
  provider_response jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_events_phone_check check (telefone_destino ~ '^55[0-9]{10,11}$'),
  constraint notification_events_type_check check (type in ('certificate_expiring','certificate_expired','manual_test')),
  constraint notification_events_provider_check check (provider in ('whatsapp_desktop')),
  constraint notification_events_channel_check check (channel in ('whatsapp')),
  constraint notification_events_send_date_check check (send_date >= date '2000-01-01'),
  constraint notification_events_attempt_count_check check (attempt_count >= 0),
  constraint notification_events_max_attempts_check check (max_attempts between 1 and 10)
);

alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check
  check (type in ('certificate_expiring','certificate_expired','manual_test'));

alter table public.notification_events add column if not exists recipient_id uuid references public.notification_recipients(id) on delete set null;
alter table public.notification_events add column if not exists send_date date;
update public.notification_events
set send_date = coalesce(send_date, created_at::date, current_date)
where send_date is null;
alter table public.notification_events
  alter column send_date set not null,
  alter column send_date set default current_date;
alter table public.notification_events drop constraint if exists notification_events_recipient_id_fkey;
alter table public.notification_events add constraint notification_events_recipient_id_fkey
  foreign key (recipient_id) references public.notification_recipients(id) on delete set null;
alter table public.notification_events drop constraint if exists notification_events_send_date_check;
alter table public.notification_events add constraint notification_events_send_date_check
  check (send_date >= date '2000-01-01');

create table if not exists public.whatsapp_device_logs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.whatsapp_devices(id) on delete set null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint whatsapp_device_logs_event_type_check check (event_type in (
    'device_created',
    'device_activated',
    'device_revoked',
    'heartbeat_received',
    'message_batch_reserved',
    'message_processing_ack',
    'message_sent_ack',
    'message_failed_ack',
    'auth_failed',
    'device_error',
    'primary_sender_changed',
    'rate_limited'
  ))
);

create table if not exists public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  certificados_verificados integer not null default 0,
  eventos_criados integer not null default 0,
  eventos_ignorados_idempotencia integer not null default 0,
  erro text,
  triggered_by text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notification_runs_status_check check (status in ('running','completed','failed','partial')),
  constraint notification_runs_triggered_by_check check (triggered_by in ('cron','manual','system'))
);

create table if not exists public.qwep_seen_nonces (
  nonce_hash text primary key,
  device_id uuid not null references public.whatsapp_devices(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.qwep_rate_limit_buckets (
  key text primary key,
  count integer not null default 1,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.notification_templates (type, title, content, active)
values (
  'certificate_expiring',
  'Aviso de vencimento de certificado',
  'Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Telefone do cliente: {cliente_telefone}

Entre em contato com o cliente para realizar a renovacao.',
  true
)
on conflict do nothing;

insert into public.notification_templates (type, title, content, active)
values (
  'certificate_expired',
  'Certificados vencidos',
  'Atencao!

Existem {total_vencidos} certificado(s) vencido(s) em {data_hoje}:

{lista_certificados_vencidos}

Favor entrar em contato com os clientes para regularizacao.',
  true
)
on conflict do nothing;

update public.notification_templates
set content = 'Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Telefone do cliente: {cliente_telefone}

Entre em contato com o cliente para realizar a renovacao.'
where type = 'certificate_expiring'
  and active = true
  and (
    content like '%{empresa}%'
    or content = 'Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Entre em contato com o cliente para realizar a renovacao.'
  );

create unique index if not exists notification_templates_one_active_per_type_idx
  on public.notification_templates (type)
  where active = true;
create unique index if not exists notification_recipients_phone_unique_idx
  on public.notification_recipients (telefone_normalizado);
create index if not exists notification_recipients_active_idx
  on public.notification_recipients (ativo, nome);
create index if not exists notification_events_status_created_idx
  on public.notification_events (status, created_at desc);
create index if not exists notification_events_send_date_status_idx
  on public.notification_events (send_date, status, created_at);
create index if not exists notification_events_recipient_idx
  on public.notification_events (recipient_id, send_date);
create index if not exists notification_events_certificado_idx
  on public.notification_events (certificado_id, dias_restantes, created_at desc);
create index if not exists notification_events_cliente_idx
  on public.notification_events (cliente_id, created_at desc);
create unique index if not exists notification_events_idempotency_key_unique_idx
  on public.notification_events (idempotency_key)
  where idempotency_key is not null;
create index if not exists notification_events_pending_idx
  on public.notification_events (provider, status, send_date, next_retry_at, created_at)
  where provider = 'whatsapp_desktop' and status in ('pending','retry');
create index if not exists notification_events_reservation_idx
  on public.notification_events (device_id, reservation_id, reservation_expires_at)
  where status in ('reserved','processing');
create index if not exists notification_events_sent_at_idx
  on public.notification_events (sent_at desc)
  where status = 'sent';
create index if not exists notification_events_mensagem_renderizada_trgm_idx
  on public.notification_events using gin (mensagem_renderizada gin_trgm_ops);
create index if not exists notification_events_telefone_destino_trgm_idx
  on public.notification_events using gin (telefone_destino gin_trgm_ops);
create unique index if not exists whatsapp_devices_one_primary_idx
  on public.whatsapp_devices ((is_primary_sender))
  where is_primary_sender = true and status <> 'revoked';
create index if not exists whatsapp_devices_status_idx
  on public.whatsapp_devices (status, updated_at desc);
create index if not exists whatsapp_devices_token_hash_idx
  on public.whatsapp_devices (token_hash);
create index if not exists whatsapp_devices_primary_sender_status_idx
  on public.whatsapp_devices (updated_at desc)
  where is_primary_sender = true and status <> 'revoked';
create index if not exists whatsapp_device_logs_device_created_idx
  on public.whatsapp_device_logs (device_id, created_at desc);
create index if not exists notification_runs_created_idx
  on public.notification_runs (created_at desc);
create index if not exists qwep_seen_nonces_expires_idx
  on public.qwep_seen_nonces (expires_at);
create index if not exists qwep_rate_limit_buckets_reset_idx
  on public.qwep_rate_limit_buckets (reset_at);

create or replace function public.enforce_notification_recipients_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  select count(*) into total
  from public.notification_recipients
  where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if total >= 5 then
    raise exception 'notification_recipients_limit_exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_notification_recipients_limit on public.notification_recipients;
create trigger enforce_notification_recipients_limit
before insert on public.notification_recipients
for each row execute function public.enforce_notification_recipients_limit();

drop trigger if exists set_notification_settings_updated_at on public.notification_settings;
create trigger set_notification_settings_updated_at
before update on public.notification_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_templates_updated_at on public.notification_templates;
create trigger set_notification_templates_updated_at
before update on public.notification_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_recipients_updated_at on public.notification_recipients;
create trigger set_notification_recipients_updated_at
before update on public.notification_recipients
for each row execute function public.set_updated_at();

drop trigger if exists set_whatsapp_devices_updated_at on public.whatsapp_devices;
create trigger set_whatsapp_devices_updated_at
before update on public.whatsapp_devices
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_events_updated_at on public.notification_events;
create trigger set_notification_events_updated_at
before update on public.notification_events
for each row execute function public.set_updated_at();

create or replace function public.refresh_certificado_statuses(
  p_dias_aviso int[] default array[30,15,7],
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  warning_days integer;
  affected integer;
begin
  select coalesce(max(day_value), 30)
  into warning_days
  from unnest(coalesce(p_dias_aviso, array[30,15,7])) as day_value
  where day_value > 0;

  warning_days := coalesce(warning_days, 30);

  update public.certificados c
  set status = case
      when c.data_vencimento < p_today then 'vencido'::public.certificado_status
      when c.data_vencimento <= p_today + warning_days then 'vencendo'::public.certificado_status
      else 'ativo'::public.certificado_status
    end
  where c.status <> 'substituido'
    and c.status is distinct from case
      when c.data_vencimento < p_today then 'vencido'::public.certificado_status
      when c.data_vencimento <= p_today + warning_days then 'vencendo'::public.certificado_status
      else 'ativo'::public.certificado_status
    end;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.get_dashboard_metrics()
returns jsonb
language sql
security definer
set search_path = public
as $$
with settings as (
  select
    coalesce(dias_aviso_vencimento, array[30,15,7]) as dias_aviso_vencimento,
    coalesce(timezone, 'America/Sao_Paulo') as timezone
  from public.notification_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
),
effective_settings as (
  select
    coalesce((select dias_aviso_vencimento from settings), array[30,15,7]) as dias_aviso_vencimento,
    coalesce((select timezone from settings), 'America/Sao_Paulo') as timezone
),
today_value as (
  select (now() at time zone timezone)::date as today
  from effective_settings
),
warning_value as (
  select coalesce(max(day_value), 30) as warning_days
  from effective_settings, unnest(dias_aviso_vencimento) as day_value
  where day_value > 0
),
certs as (
  select
    c.id,
    c.cnpj,
    c.nome_titular,
    c.data_vencimento,
    cl.nome_razao_social as cliente_nome,
    (c.data_vencimento - tv.today)::integer as dias_restantes,
    case
      when c.data_vencimento < tv.today then 'vencido'
      when c.data_vencimento <= tv.today + (select warning_days from warning_value) then 'vencendo'
      else 'ativo'
    end as status_calculado
  from public.certificados c
  left join public.clientes cl on cl.id = c.cliente_id
  cross join today_value tv
  where c.status <> 'substituido'
),
cert_counts as (
  select
    count(*)::integer as total_certificados,
    count(*) filter (where status_calculado = 'ativo')::integer as certificados_validos,
    count(*) filter (where status_calculado = 'vencendo')::integer as certificados_vencendo,
    count(*) filter (where status_calculado = 'vencido')::integer as certificados_vencidos
  from certs
),
event_counts as (
  select
    count(*) filter (where status in ('pending','retry') and send_date > tv.today)::integer as avisos_planejados,
    count(*) filter (where status in ('pending','retry') and send_date <= tv.today)::integer as avisos_para_hoje,
    count(*) filter (where status in ('pending','reserved','processing','retry'))::integer as mensagens_aguardando,
    count(*) filter (where status = 'sent')::integer as mensagens_enviadas,
    count(*) filter (where status = 'sent' and (sent_at at time zone (select timezone from effective_settings))::date = tv.today)::integer as mensagens_enviadas_hoje,
    count(*) filter (where status = 'failed')::integer as falhas_envio,
    count(*) filter (where status = 'failed' and coalesce((failed_at at time zone (select timezone from effective_settings))::date, send_date) = tv.today)::integer as falhas_hoje,
    max(sent_at) filter (where status = 'sent') as ultimo_envio
  from public.notification_events ne
  cross join today_value tv
),
primary_device as (
  select
    jsonb_build_object(
      'name', name,
      'status', status,
      'last_seen_at', last_seen_at,
      'online', (status = 'active' and last_seen_at >= now() - interval '5 minutes')
    ) as device
  from public.whatsapp_devices
  where is_primary_sender = true
    and status <> 'revoked'
  order by updated_at desc
  limit 1
),
period_counts as (
  select jsonb_build_array(
    jsonb_build_object('name', 'Vencidos', 'value', count(*) filter (where dias_restantes < 0), 'color', '#DC2626'),
    jsonb_build_object('name', '7 dias', 'value', count(*) filter (where dias_restantes >= 0 and dias_restantes <= 7), 'color', '#F59E0B'),
    jsonb_build_object('name', '15 dias', 'value', count(*) filter (where dias_restantes > 7 and dias_restantes <= 15), 'color', '#2563EB'),
    jsonb_build_object('name', '30 dias', 'value', count(*) filter (where dias_restantes > 15 and dias_restantes <= 30), 'color', '#60A5FA')
  ) as data
  from certs
),
attention as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'cnpj', cnpj,
        'nome_titular', nome_titular,
        'data_vencimento', data_vencimento,
        'status', status_calculado,
        'dias_restantes', dias_restantes,
        'clientes', jsonb_build_object('nome_razao_social', cliente_nome)
      )
      order by data_vencimento asc, id asc
    ),
    '[]'::jsonb
  ) as data
  from (
    select *
    from certs
    where dias_restantes < 0
       or (dias_restantes >= 0 and dias_restantes <= (select warning_days from warning_value))
    order by data_vencimento asc, id asc
    limit 5
  ) selected
)
select jsonb_build_object(
  'today', (select today from today_value),
  'warning_days', (select warning_days from warning_value),
  'total_certificados', coalesce((select total_certificados from cert_counts), 0),
  'certificados_validos', coalesce((select certificados_validos from cert_counts), 0),
  'certificados_vencendo', coalesce((select certificados_vencendo from cert_counts), 0),
  'certificados_vencidos', coalesce((select certificados_vencidos from cert_counts), 0),
  'avisos_para_hoje', coalesce((select avisos_para_hoje from event_counts), 0),
  'mensagens_enviadas', coalesce((select mensagens_enviadas from event_counts), 0),
  'falhas_envio', coalesce((select falhas_envio from event_counts), 0),
  'falhas_hoje', coalesce((select falhas_hoje from event_counts), 0),
  'avisos_planejados', coalesce((select avisos_planejados from event_counts), 0),
  'fila_hoje', coalesce((select avisos_para_hoje from event_counts), 0),
  'ultimo_envio', (select ultimo_envio from event_counts),
  'primary_device', (select device from primary_device),
  'status_bot', coalesce((select (device->>'online')::boolean from primary_device), false),
  'ultimo_heartbeat', (select device->>'last_seen_at' from primary_device),
  'mensagens_aguardando', coalesce((select mensagens_aguardando from event_counts), 0),
  'enviadas_hoje', coalesce((select mensagens_enviadas_hoje from event_counts), 0),
  'falhas_bot', coalesce((select falhas_envio from event_counts), 0),
  'status_chart', jsonb_build_array(
    jsonb_build_object('name', 'Validos', 'value', coalesce((select certificados_validos from cert_counts), 0), 'color', '#16A34A'),
    jsonb_build_object('name', 'Vencendo', 'value', coalesce((select certificados_vencendo from cert_counts), 0), 'color', '#F59E0B'),
    jsonb_build_object('name', 'Vencidos', 'value', coalesce((select certificados_vencidos from cert_counts), 0), 'color', '#DC2626')
  ),
  'expiration_chart', coalesce((select data from period_counts), '[]'::jsonb),
  'attention_certificates', coalesce((select data from attention), '[]'::jsonb)
);
$$;

create or replace function public.get_whatsapp_bot_message_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
with settings as (
  select coalesce(timezone, 'America/Sao_Paulo') as timezone
  from public.notification_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
),
today_value as (
  select (now() at time zone coalesce((select timezone from settings), 'America/Sao_Paulo'))::date as today
),
stats as (
  select
    count(*) filter (where status = 'pending' and send_date <= tv.today)::integer as pending,
    count(*) filter (where status = 'reserved')::integer as reserved,
    count(*) filter (where status = 'processing')::integer as processing,
    count(*) filter (where status = 'retry' and send_date <= tv.today and (next_retry_at is null or next_retry_at <= now()))::integer as retry,
    count(*) filter (where status = 'sent')::integer as sent,
    count(*) filter (where status = 'failed')::integer as failed,
    count(*) filter (where status = 'cancelled')::integer as cancelled,
    count(*) filter (where status = 'skipped')::integer as skipped,
    count(*) filter (where status in ('pending','retry') and send_date <= tv.today)::integer as waiting_to_send
  from public.notification_events ne
  cross join today_value tv
)
select jsonb_build_object(
  'pending', coalesce(pending, 0),
  'reserved', coalesce(reserved, 0),
  'processing', coalesce(processing, 0),
  'retry', coalesce(retry, 0),
  'sent', coalesce(sent, 0),
  'failed', coalesce(failed, 0),
  'cancelled', coalesce(cancelled, 0),
  'skipped', coalesce(skipped, 0),
  'waiting_to_send', coalesce(waiting_to_send, 0)
)
from stats;
$$;

create or replace function public.release_expired_notification_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.notification_events
  set
    status = case
      when attempt_count >= max_attempts then 'failed'::public.notification_event_status
      else 'retry'::public.notification_event_status
    end,
    failed_at = case
      when attempt_count >= max_attempts then now()
      else failed_at
    end,
    next_retry_at = case
      when attempt_count >= max_attempts then null
      else now()
    end,
    device_id = null,
    reservation_id = null,
    reservation_token_hash = null,
    reserved_at = null,
    reservation_expires_at = null,
    processing_started_at = null,
    error_message = coalesce(error_message, 'Reserva expirada.')
  where status in ('reserved','processing')
    and reservation_expires_at is not null
    and reservation_expires_at < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.cleanup_qwep_operational_tables()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nonces_removed integer := 0;
  buckets_removed integer := 0;
begin
  delete from public.qwep_seen_nonces
  where expires_at < now();
  get diagnostics nonces_removed = row_count;

  delete from public.qwep_rate_limit_buckets
  where reset_at < now();
  get diagnostics buckets_removed = row_count;

  return jsonb_build_object(
    'nonces_removed', nonces_removed,
    'rate_limit_buckets_removed', buckets_removed
  );
end;
$$;

drop function if exists public.reserve_pending_notification_events(uuid, integer);
create or replace function public.reserve_pending_notification_events(
  target_device_id uuid,
  batch_limit integer default 5,
  reservation_ttl_seconds_input integer default null
)
returns table (
  id uuid,
  type text,
  telefone_destino text,
  mensagem_renderizada text,
  idempotency_key text,
  reservation_id uuid,
  reservation_token text,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_device public.whatsapp_devices;
  current_settings public.notification_settings;
  current_today date;
  candidate record;
  generated_reservation_id uuid;
  generated_reservation_token text;
  safe_limit integer;
  reservation_ttl_seconds integer;
begin
  perform public.release_expired_notification_reservations();

  safe_limit := least(greatest(coalesce(batch_limit, 5), 1), 5);

  select *
  into target_device
  from public.whatsapp_devices
  where whatsapp_devices.id = target_device_id
  limit 1;

  if target_device.id is null then
    return;
  end if;

  if target_device.status not in ('active','disconnected') or target_device.is_primary_sender is not true then
    return;
  end if;

  select *
  into current_settings
  from public.notification_settings
  where notification_settings.id = '00000000-0000-0000-0000-000000000001'::uuid
  limit 1;

  if current_settings.id is null or current_settings.enabled is not true then
    return;
  end if;

  reservation_ttl_seconds := greatest(
    coalesce(
      reservation_ttl_seconds_input,
      greatest(coalesce(current_settings.delay_maximo_segundos, 60), 30) + 45 + 120
    ),
    195
  );

  current_today := (now() at time zone coalesce(current_settings.timezone, 'America/Sao_Paulo'))::date;

  for candidate in
    select ne.*
    from public.notification_events ne
    join public.notification_recipients nr
      on nr.id = ne.recipient_id
     and nr.ativo is true
    left join public.certificados c
      on c.id = ne.certificado_id
    where ne.provider = 'whatsapp_desktop'
      and (
        (
          ne.type = 'certificate_expiring'
          and c.id is not null
          and c.status in ('ativo','vencendo')
        )
        or (
          ne.type = 'certificate_expired'
          and ne.certificado_id is null
        )
      )
      and (
        ne.status = 'pending'
        or (
          ne.status = 'retry'
          and (ne.next_retry_at is null or ne.next_retry_at <= now())
        )
      )
      and ne.send_date <= current_today
      and ne.attempt_count < ne.max_attempts
      and (
        ne.reservation_expires_at is null
        or ne.reservation_expires_at < now()
      )
    order by ne.send_date asc, ne.created_at asc, ne.id asc
    limit safe_limit
    for update of ne skip locked
  loop
    generated_reservation_id := gen_random_uuid();
    generated_reservation_token :=
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');

    update public.notification_events ne
    set
      status = 'reserved',
      device_id = target_device.id,
      reservation_id = generated_reservation_id,
      reservation_token_hash = encode(
        digest('qwep-reservation-token:' || generated_reservation_token, 'sha256'),
        'hex'
      ),
      reserved_at = now(),
      reservation_expires_at = now() + make_interval(secs => reservation_ttl_seconds),
      processing_started_at = null,
      attempt_count = ne.attempt_count + 1,
      error_message = null
    where ne.id = candidate.id
    returning
      ne.id,
      ne.type,
      ne.telefone_destino,
      ne.mensagem_renderizada,
      ne.idempotency_key,
      ne.reservation_id,
      generated_reservation_token,
      ne.attempt_count,
      ne.max_attempts
    into
      id,
      type,
      telefone_destino,
      mensagem_renderizada,
      idempotency_key,
      reservation_id,
      reservation_token,
      attempt_count,
      max_attempts;

    return next;
  end loop;
end;
$$;

revoke all on function public.reserve_pending_notification_events(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.release_expired_notification_reservations() from public, anon, authenticated;
revoke all on function public.refresh_certificado_statuses(int[], date) from public, anon, authenticated;
revoke all on function public.cleanup_qwep_operational_tables() from public, anon, authenticated;
revoke all on function public.get_dashboard_metrics() from public, anon, authenticated;
revoke all on function public.get_whatsapp_bot_message_stats() from public, anon, authenticated;
grant execute on function public.reserve_pending_notification_events(uuid, integer, integer) to service_role;
grant execute on function public.release_expired_notification_reservations() to service_role;
grant execute on function public.refresh_certificado_statuses(int[], date) to service_role;
grant execute on function public.cleanup_qwep_operational_tables() to service_role;
grant execute on function public.get_dashboard_metrics() to service_role;
grant execute on function public.get_whatsapp_bot_message_stats() to service_role;

alter table public.notification_settings enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_events enable row level security;
alter table public.whatsapp_devices enable row level security;
alter table public.whatsapp_device_logs enable row level security;
alter table public.notification_runs enable row level security;
alter table public.qwep_seen_nonces enable row level security;
alter table public.qwep_rate_limit_buckets enable row level security;

drop policy if exists "Only admins can read notification settings" on public.notification_settings;
drop policy if exists "Internal users can read notification settings" on public.notification_settings;
create policy "Internal users can read notification settings"
on public.notification_settings
for select
to authenticated
using (public.can_read_internal());

drop policy if exists "Only admins can manage notification settings" on public.notification_settings;
create policy "Only admins can manage notification settings"
on public.notification_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read notification templates" on public.notification_templates;
create policy "Internal users can read notification templates"
on public.notification_templates
for select
to authenticated
using (public.can_read_internal());

drop policy if exists "Only admins can manage notification templates" on public.notification_templates;
create policy "Only admins can manage notification templates"
on public.notification_templates
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read notification recipients" on public.notification_recipients;
create policy "Internal users can read notification recipients"
on public.notification_recipients
for select
to authenticated
using (public.can_read_internal());

drop policy if exists "Only admins can manage notification recipients" on public.notification_recipients;
create policy "Only admins can manage notification recipients"
on public.notification_recipients
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read notification events" on public.notification_events;
create policy "Internal users can read notification events"
on public.notification_events
for select
to authenticated
using (public.can_read_internal());

drop policy if exists "Only admins can manage notification events" on public.notification_events;
create policy "Only admins can manage notification events"
on public.notification_events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Only admins can read whatsapp devices" on public.whatsapp_devices;
create policy "Only admins can read whatsapp devices"
on public.whatsapp_devices
for select
to authenticated
using (public.is_admin());

drop policy if exists "Only admins can manage whatsapp devices" on public.whatsapp_devices;
create policy "Only admins can manage whatsapp devices"
on public.whatsapp_devices
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Only admins can read whatsapp logs" on public.whatsapp_device_logs;
create policy "Only admins can read whatsapp logs"
on public.whatsapp_device_logs
for select
to authenticated
using (public.is_admin());

drop policy if exists "Only admins can read notification runs" on public.notification_runs;
create policy "Only admins can read notification runs"
on public.notification_runs
for select
to authenticated
using (public.is_admin());

revoke select on public.whatsapp_devices from anon, authenticated;
grant select (
  id,
  name,
  status,
  is_primary_sender,
  connected_phone,
  browser_name,
  user_agent,
  app_version,
  last_seen_at,
  last_connected_at,
  last_disconnected_at,
  created_by,
  created_at,
  updated_at,
  revoked_at
) on public.whatsapp_devices to authenticated;

revoke select on public.notification_recipients from anon, authenticated;
grant select (
  id,
  nome,
  telefone,
  telefone_normalizado,
  ativo,
  created_at,
  updated_at
) on public.notification_recipients to authenticated;

revoke select on public.notification_events from anon, authenticated;
grant select (
  id,
  cliente_id,
  certificado_id,
  recipient_id,
  type,
  dias_restantes,
  send_date,
  status,
  sent_at,
  failed_at,
  attempt_count,
  max_attempts,
  next_retry_at,
  created_at,
  updated_at
) on public.notification_events to authenticated;

comment on column public.clientes.whatsapp is 'Telefone WhatsApp normalizado do cliente. E exibido no corpo dos avisos internos, mas nao e usado como destinatario automatico.';
comment on table public.notification_settings is 'Configuracoes globais do bot WhatsApp de avisos de vencimento, incluindo resumo diario de certificados vencidos.';
comment on table public.notification_recipients is 'Destinatarios internos da Fasa que recebem avisos automaticos de vencimento. Maximo de 5.';
comment on table public.notification_templates is 'Templates de mensagens com variaveis permitidas e sem segredos para certificate_expiring e certificate_expired.';
comment on table public.notification_events is 'Outbox idempotente de avisos planejados por send_date. certificate_expired e consolidado por dia/destinatario.';
comment on column public.notification_events.send_date is 'Data planejada de envio calculada pelo Notification Rebuild Service.';
comment on column public.notification_events.mensagem_renderizada is 'Texto final entregue ao bot. Nunca deve conter senha, link publico ou storage_path.';
comment on table public.whatsapp_devices is 'Dispositivos Desktop Bot. Tokens e signing secrets ficam armazenados apenas como hash/criptografia.';
comment on table public.whatsapp_device_logs is 'Logs sanitizados do bot e da comunicacao QWEP.';
comment on table public.qwep_seen_nonces is 'Nonces QWEP usados para protecao contra replay.';
comment on table public.qwep_rate_limit_buckets is 'Buckets persistentes de rate limit para endpoints QWEP.';
