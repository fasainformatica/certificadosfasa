-- SECURITY_SANITIZE_LEGACY_LOGS.sql
-- Projeto: certificadosfasa
-- Objetivo: limpar logs historicos/metadados que possam conter tokens, JWTs,
-- paths de Storage, telefones completos ou erro tecnico bruto.
--
-- IMPORTANTE:
-- 1. Rode primeiro SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql.
-- 2. Este arquivo termina com ROLLBACK por seguranca.
-- 3. Para aplicar de verdade, revise o resumo e troque o ultimo ROLLBACK por COMMIT.
-- 4. Nao altera status, datas, mensagem_renderizada nem telefone_destino da fila.

begin;

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

create or replace function pg_temp.security_should_sanitize_log(value text)
returns boolean
language sql
stable
as $$
  select value is not null
    and (
      value ~* 'Bearer[[:space:]]+[A-Za-z0-9._~+/=-]+'
      or value ~* 'Basic[[:space:]]+[A-Za-z0-9+/=-]+'
      or value ~* 'eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+'
      or value ~* 'sb_secret_[A-Za-z0-9_-]+'
      or value ~* '(service_role|cert_encryption_key|cron_secret|euatendo_api_token|windows_notifier_token)'
      or value ~* '(authorization|apikey|api_key|token|password|senha)[[:space:]]*[:=][[:space:]]*[^,[:space:]}]+'
      or value ~* 'certificados/[0-9]{14}/[^[:space:]]+[.]pfx'
      or value ~* '(^|[^0-9])((55)?[1-9][0-9]9?[0-9]{8})([^0-9]|$)'
      or value ~* '(FOR UPDATE|outer join|PGRST|PostgREST|SQLSTATE|relation .* does not exist|column .* does not exist|violates .* constraint|deadlock)'
    );
$$;

create or replace function pg_temp.security_safe_operational_message(value text)
returns text
language sql
stable
as $$
  select case
    when value is null or btrim(value) = '' then null
    when value ~* '(FOR UPDATE|outer join|PGRST|PostgREST|SQLSTATE|relation .* does not exist|column .* does not exist|violates .* constraint|deadlock)' then
      'Nao foi possivel concluir a operacao no banco. Revise os logs protegidos antes de tentar novamente.'
    when value ~* '(timeout|timed out|ECONNRESET|ENOTFOUND|fetch failed|network)' then
      'Nao foi possivel comunicar com a integracao. Tente novamente em alguns instantes.'
    when value ~* '(rate limit|too many requests|429|restricted|bloque)' then
      'A integracao limitou os envios. Aguarde a janela de seguranca antes de tentar novamente.'
    when pg_temp.security_should_sanitize_log(value) then
      'Mensagem tecnica removida por seguranca. Consulte o log protegido da operacao.'
    else pg_temp.security_redact_text(value)
  end;
$$;

create or replace function pg_temp.security_sanitized_json_log(value jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'sanitized', true,
    'sanitized_at', now(),
    'reason', 'legacy_sensitive_log_cleanup',
    'redacted_sample', pg_temp.security_redact_text(value::text)
  );
$$;

create or replace function pg_temp.security_mask_payload_phone(value text)
returns text
language sql
stable
as $$
  select case
    when value is null or btrim(value) = '' then value
    when value = 'Telefone nao cadastrado' then value
    else '[phone]'
  end;
$$;

create or replace function pg_temp.security_redact_notification_payload(value jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb := coalesce(value, '{}'::jsonb);
  redacted_list jsonb;
begin
  if jsonb_typeof(result) <> 'object' then
    return result;
  end if;

  if result ? 'cliente_telefone' then
    result := jsonb_set(
      result,
      '{cliente_telefone}',
      to_jsonb(pg_temp.security_mask_payload_phone(result->>'cliente_telefone')),
      false
    );
  end if;

  if result ? 'telefone_cliente' then
    result := jsonb_set(
      result,
      '{telefone_cliente}',
      to_jsonb(pg_temp.security_mask_payload_phone(result->>'telefone_cliente')),
      false
    );
  end if;

  if jsonb_typeof(result->'lista_certificados_vencidos') = 'array' then
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(item) = 'object' and item ? 'cliente_telefone' then
            jsonb_set(
              item,
              '{cliente_telefone}',
              to_jsonb(pg_temp.security_mask_payload_phone(item->>'cliente_telefone')),
              false
            )
          else item
        end
      ),
      '[]'::jsonb
    )
    into redacted_list
    from jsonb_array_elements(result->'lista_certificados_vencidos') as items(item);

    result := jsonb_set(result, '{lista_certificados_vencidos}', redacted_list, false);
  end if;

  return result;
end;
$$;

create temp table if not exists security_sanitize_summary (
  target text not null,
  affected_rows bigint not null
) on commit drop;

truncate table security_sanitize_summary;

do $$
declare
  affected bigint;
begin
  if to_regclass('public.audit_logs') is not null then
    execute $sql$
      update public.audit_logs
      set metadata = pg_temp.security_sanitized_json_log(metadata)
      where pg_temp.security_should_sanitize_log(metadata::text)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('audit_logs.metadata', affected);
  end if;

  if to_regclass('public.storage_reconciliation_jobs') is not null then
    execute $sql$
      update public.storage_reconciliation_jobs
      set last_error = pg_temp.security_safe_operational_message(last_error)
      where pg_temp.security_should_sanitize_log(last_error)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('storage_reconciliation_jobs.last_error', affected);

    execute $sql$
      update public.storage_reconciliation_jobs
      set metadata = pg_temp.security_sanitized_json_log(metadata)
      where pg_temp.security_should_sanitize_log(metadata::text)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('storage_reconciliation_jobs.metadata', affected);
  end if;

  if to_regclass('public.notification_events') is not null then
    execute $sql$
      update public.notification_events
      set error_message = pg_temp.security_safe_operational_message(error_message)
      where pg_temp.security_should_sanitize_log(error_message)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('notification_events.error_message', affected);

    execute $sql$
      update public.notification_events
      set provider_response = pg_temp.security_sanitized_json_log(provider_response)
      where provider_response is not null
        and pg_temp.security_should_sanitize_log(provider_response::text)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('notification_events.provider_response', affected);

    execute $sql$
      update public.notification_events
      set payload = pg_temp.security_redact_notification_payload(payload)
      where payload ? 'cliente_telefone'
        or payload ? 'telefone_cliente'
        or jsonb_typeof(payload->'lista_certificados_vencidos') = 'array'
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('notification_events.payload.phone_keys', affected);

    execute $sql$
      update public.notification_events
      set payload = pg_temp.security_sanitized_json_log(payload)
      where pg_temp.security_should_sanitize_log(payload::text)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('notification_events.payload.other_sensitive_patterns', affected);
  end if;

  if to_regclass('public.whatsapp_provider_logs') is not null then
    execute $sql$
      update public.whatsapp_provider_logs
      set error_message = pg_temp.security_safe_operational_message(error_message)
      where pg_temp.security_should_sanitize_log(error_message)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('whatsapp_provider_logs.error_message', affected);

    execute $sql$
      update public.whatsapp_provider_logs
      set metadata = pg_temp.security_sanitized_json_log(metadata)
      where pg_temp.security_should_sanitize_log(metadata::text)
    $sql$;
    get diagnostics affected = row_count;
    insert into pg_temp.security_sanitize_summary values ('whatsapp_provider_logs.metadata', affected);
  end if;
end $$;

select target, affected_rows
from security_sanitize_summary
order by target;

-- Padrao seguro: nao grava nada.
-- Para aplicar depois da revisao, troque somente esta linha por: commit;
rollback;
