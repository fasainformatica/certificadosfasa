-- Hardening pos-incidente de secrets.
-- Objetivo: garantir RLS nas tabelas publicas, remover acesso anonimo direto
-- e manter somente leituras minimas usadas por Server Components autenticados.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificados-pfx',
  'certificados-pfx',
  false,
  10485760,
  array[
    'application/x-pkcs12',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.user_profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.certificados enable row level security;
alter table public.configuracoes_sistema enable row level security;
alter table public.links_download enable row level security;
alter table public.audit_logs enable row level security;
alter table public.internal_notifications enable row level security;
alter table public.internal_notification_reads enable row level security;
alter table public.storage_reconciliation_jobs enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_runs enable row level security;
alter table public.whatsapp_dispatcher_state enable row level security;
alter table public.whatsapp_provider_logs enable row level security;

revoke usage on schema public from public, anon;
grant usage on schema public to authenticated, service_role;

revoke all privileges on all tables in schema public from public, anon;
revoke all privileges on all sequences in schema public from public, anon;
revoke all privileges on all functions in schema public from public, anon;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_internal_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_read_internal() to authenticated;

revoke all privileges on table public.user_profiles from authenticated;
grant select (id, role, active, created_at, updated_at)
on public.user_profiles to authenticated;

revoke all privileges on table public.clientes from authenticated;
grant select (
  id,
  nome_razao_social,
  cnpj,
  email,
  telefone,
  whatsapp,
  whatsapp_notifications_enabled,
  responsavel,
  observacoes,
  created_at,
  updated_at
) on public.clientes to authenticated;

revoke all privileges on table public.certificados from authenticated;
grant select (
  id,
  cliente_id,
  cnpj,
  nome_titular,
  data_emissao,
  data_vencimento,
  status,
  renovacao_status,
  renovacao_observacao,
  renovacao_atualizado_em,
  renovacao_atualizado_por,
  nome_arquivo_original,
  hash_arquivo,
  ultimo_upload_em,
  criado_por,
  created_at,
  updated_at
) on public.certificados to authenticated;

revoke all privileges on table public.notification_settings from authenticated;
grant select (
  id,
  enabled,
  expired_notifications_enabled,
  dias_aviso_vencimento,
  delay_minimo_segundos,
  delay_maximo_segundos,
  max_attempts,
  polling_interval_seconds,
  send_window_start,
  send_window_end,
  timezone,
  whatsapp_dispatch_paused,
  whatsapp_dispatch_paused_at,
  whatsapp_dispatch_pause_reason,
  whatsapp_daily_limit,
  whatsapp_hourly_limit,
  whatsapp_auto_pause_enabled,
  whatsapp_failure_pause_threshold,
  whatsapp_failure_pause_window_minutes,
  created_at,
  updated_at
) on public.notification_settings to authenticated;

revoke all privileges on table public.links_download from authenticated;
revoke all privileges on table public.audit_logs from authenticated;
revoke all privileges on table public.configuracoes_sistema from authenticated;
revoke all privileges on table public.storage_reconciliation_jobs from authenticated;
revoke all privileges on table public.notification_templates from authenticated;
revoke all privileges on table public.notification_recipients from authenticated;
revoke all privileges on table public.notification_runs from authenticated;

revoke all privileges on table public.internal_notifications from authenticated;
grant select (
  id,
  type,
  severity,
  title,
  body,
  href,
  entity_type,
  entity_id,
  certificado_id,
  cliente_id,
  target_role,
  target_user_id,
  actor_user_id,
  metadata,
  created_at,
  expires_at
) on public.internal_notifications to authenticated;

revoke all privileges on table public.internal_notification_reads from authenticated;
grant select, insert on public.internal_notification_reads to authenticated;
grant update (read_at, dismissed_at) on public.internal_notification_reads to authenticated;

revoke all privileges on table public.notification_events from authenticated;
grant select (
  id,
  cliente_id,
  certificado_id,
  recipient_id,
  type,
  audience,
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

revoke all privileges on table public.whatsapp_dispatcher_state from authenticated;
grant select (
  provider,
  last_dispatch_at,
  next_allowed_send_at,
  locked_until,
  updated_at
) on public.whatsapp_dispatcher_state to authenticated;

revoke all privileges on table public.whatsapp_provider_logs from authenticated;
grant select (
  id,
  provider,
  event_id,
  audience,
  operation,
  telefone_mascarado,
  template_type,
  duration_ms,
  status,
  attempt_count,
  error_code,
  error_message,
  request_id,
  response_id,
  created_at
) on public.whatsapp_provider_logs to authenticated;

revoke all privileges on storage.buckets from public, anon, authenticated;
revoke all privileges on storage.objects from public, anon, authenticated;
grant all privileges on storage.buckets to service_role;
grant all privileges on storage.objects to service_role;

alter default privileges in schema public revoke all on tables from public, anon;
alter default privileges in schema public revoke all on sequences from public, anon;
alter default privileges in schema public revoke all on functions from public, anon;

comment on schema public is 'Schema operacional do painel Fasa: acesso anonimo direto revogado; acesso interno depende de Supabase Auth, RLS e APIs server-side.';

commit;
