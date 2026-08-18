-- SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql
-- Projeto: certificadosfasa
-- Objetivo: auditar campos historicos de log/metadados que possam conter tokens,
-- JWTs, paths de Storage, telefone completo ou erro tecnico bruto.
--
-- Seguro para executar no SQL Editor:
-- - nao altera tabelas persistentes;
-- - cria apenas objetos temporarios da sessao;
-- - mostra exemplos ja mascarados e truncados.

create or replace function pg_temp.security_redact_text(value text)
returns text
language sql
stable
as $$
  select nullif(
    left(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      coalesce(value, ''),
                      'Bearer[[:space:]]+[A-Za-z0-9._~+/=-]+',
                      'Bearer [redacted]',
                      'gi'
                    ),
                    'Basic[[:space:]]+[A-Za-z0-9+/=-]+',
                    'Basic [redacted]',
                    'gi'
                  ),
                  'eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+',
                  '[jwt]',
                  'g'
                ),
                'sb_secret_[A-Za-z0-9_-]+',
                '[supabase_secret]',
                'gi'
              ),
              '(service_role|cert_encryption_key|cron_secret|euatendo_api_token|windows_notifier_token)',
              '[secret_name]',
              'gi'
            ),
            '(authorization|apikey|api_key|token|password|senha)[[:space:]]*[:=][[:space:]]*[^,[:space:]}]+',
            '\1=[redacted]',
            'gi'
          ),
          'certificados/[0-9]{14}/[^[:space:]]+[.]pfx',
          '[storage_path]',
          'gi'
        ),
        '(^|[^0-9])((55)?[1-9][0-9]9?[0-9]{8})([^0-9]|$)',
        '\1[phone]\4',
        'g'
      ),
      700
    ),
    ''
  );
$$;

create temp table if not exists security_log_patterns (
  pattern_name text primary key,
  pattern_regex text not null
) on commit drop;

truncate table security_log_patterns;

insert into security_log_patterns (pattern_name, pattern_regex)
values
  ('bearer_token', 'Bearer[[:space:]]+[A-Za-z0-9._~+/=-]+'),
  ('basic_token', 'Basic[[:space:]]+[A-Za-z0-9+/=-]+'),
  ('jwt', 'eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+'),
  ('supabase_secret', 'sb_secret_[A-Za-z0-9_-]+'),
  ('secret_name', '(service_role|cert_encryption_key|cron_secret|euatendo_api_token|windows_notifier_token)'),
  ('credential_pair', '(authorization|apikey|api_key|token|password|senha)[[:space:]]*[:=][[:space:]]*[^,[:space:]}]+'),
  ('storage_path', 'certificados/[0-9]{14}/[^[:space:]]+[.]pfx'),
  ('phone', '(^|[^0-9])((55)?[1-9][0-9]9?[0-9]{8})([^0-9]|$)'),
  ('sql_rpc_error', '(FOR UPDATE|outer join|PGRST|PostgREST|SQLSTATE|relation .* does not exist|column .* does not exist|violates .* constraint|deadlock)');

create temp table if not exists security_log_exposure_findings (
  source_table text not null,
  source_column text not null,
  pattern_name text not null,
  match_count bigint not null,
  latest_at timestamptz
) on commit drop;

create temp table if not exists security_log_exposure_samples (
  source_table text not null,
  source_column text not null,
  pattern_name text not null,
  record_id text,
  created_at timestamptz,
  redacted_sample text
) on commit drop;

truncate table security_log_exposure_findings;
truncate table security_log_exposure_samples;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'audit_logs', 'metadata', p.pattern_name, count(*), max(t.created_at)
      from public.audit_logs t
      join pg_temp.security_log_patterns p
        on coalesce(t.metadata::text, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'audit_logs',
        'metadata',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.metadata::text)
      from public.audit_logs t
      join pg_temp.security_log_patterns p
        on coalesce(t.metadata::text, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;
  end if;

  if to_regclass('public.storage_reconciliation_jobs') is not null then
    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'storage_reconciliation_jobs', 'last_error', p.pattern_name, count(*), max(t.created_at)
      from public.storage_reconciliation_jobs t
      join pg_temp.security_log_patterns p
        on coalesce(t.last_error, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'storage_reconciliation_jobs', 'metadata', p.pattern_name, count(*), max(t.created_at)
      from public.storage_reconciliation_jobs t
      join pg_temp.security_log_patterns p
        on coalesce(t.metadata::text, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'storage_reconciliation_jobs',
        'last_error',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.last_error)
      from public.storage_reconciliation_jobs t
      join pg_temp.security_log_patterns p
        on coalesce(t.last_error, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'storage_reconciliation_jobs',
        'metadata',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.metadata::text)
      from public.storage_reconciliation_jobs t
      join pg_temp.security_log_patterns p
        on coalesce(t.metadata::text, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;
  end if;

  if to_regclass('public.notification_events') is not null then
    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'notification_events', 'error_message', p.pattern_name, count(*), max(t.created_at)
      from public.notification_events t
      join pg_temp.security_log_patterns p
        on coalesce(t.error_message, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'notification_events', 'provider_response', p.pattern_name, count(*), max(t.created_at)
      from public.notification_events t
      join pg_temp.security_log_patterns p
        on coalesce(t.provider_response::text, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'notification_events', 'payload', p.pattern_name, count(*), max(t.created_at)
      from public.notification_events t
      join pg_temp.security_log_patterns p
        on coalesce(t.payload::text, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'notification_events',
        'error_message',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.error_message)
      from public.notification_events t
      join pg_temp.security_log_patterns p
        on coalesce(t.error_message, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'notification_events',
        'provider_response',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.provider_response::text)
      from public.notification_events t
      join pg_temp.security_log_patterns p
        on coalesce(t.provider_response::text, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'notification_events',
        'payload',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.payload::text)
      from public.notification_events t
      join pg_temp.security_log_patterns p
        on coalesce(t.payload::text, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;
  end if;

  if to_regclass('public.whatsapp_provider_logs') is not null then
    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'whatsapp_provider_logs', 'error_message', p.pattern_name, count(*), max(t.created_at)
      from public.whatsapp_provider_logs t
      join pg_temp.security_log_patterns p
        on coalesce(t.error_message, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_findings
        (source_table, source_column, pattern_name, match_count, latest_at)
      select 'whatsapp_provider_logs', 'metadata', p.pattern_name, count(*), max(t.created_at)
      from public.whatsapp_provider_logs t
      join pg_temp.security_log_patterns p
        on coalesce(t.metadata::text, '') ~* p.pattern_regex
      group by p.pattern_name
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'whatsapp_provider_logs',
        'error_message',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.error_message)
      from public.whatsapp_provider_logs t
      join pg_temp.security_log_patterns p
        on coalesce(t.error_message, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;

    execute $sql$
      insert into pg_temp.security_log_exposure_samples
        (source_table, source_column, pattern_name, record_id, created_at, redacted_sample)
      select
        'whatsapp_provider_logs',
        'metadata',
        p.pattern_name,
        t.id::text,
        t.created_at,
        pg_temp.security_redact_text(t.metadata::text)
      from public.whatsapp_provider_logs t
      join pg_temp.security_log_patterns p
        on coalesce(t.metadata::text, '') ~* p.pattern_regex
      order by t.created_at desc
      limit 30
    $sql$;
  end if;
end $$;

select
  source_table,
  source_column,
  pattern_name,
  match_count,
  latest_at
from security_log_exposure_findings
order by match_count desc, source_table, source_column, pattern_name;

select
  source_table,
  source_column,
  pattern_name,
  record_id,
  created_at,
  redacted_sample
from security_log_exposure_samples
order by created_at desc nulls last, source_table, source_column, pattern_name
limit 100;
