-- Performance optimizations for dashboard, bot polling, QWEP cleanup and search.
-- Safe to run more than once.

create extension if not exists "pg_trgm";

create index if not exists clientes_nome_razao_social_trgm_idx
  on public.clientes using gin (nome_razao_social gin_trgm_ops);
create index if not exists clientes_cnpj_trgm_idx
  on public.clientes using gin (cnpj gin_trgm_ops);
create index if not exists certificados_cnpj_trgm_idx
  on public.certificados using gin (cnpj gin_trgm_ops);
create index if not exists certificados_nome_titular_trgm_idx
  on public.certificados using gin (nome_titular gin_trgm_ops);
create index if not exists notification_events_sent_at_idx
  on public.notification_events (sent_at desc)
  where status = 'sent';
create index if not exists notification_events_mensagem_renderizada_trgm_idx
  on public.notification_events using gin (mensagem_renderizada gin_trgm_ops);
create index if not exists notification_events_telefone_destino_trgm_idx
  on public.notification_events using gin (telefone_destino gin_trgm_ops);
create index if not exists whatsapp_devices_primary_sender_status_idx
  on public.whatsapp_devices (updated_at desc)
  where is_primary_sender = true and status <> 'revoked';

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
  select greatest(coalesce(max(day_value), 30), 30) as warning_days
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
      when c.data_vencimento <= tv.today then 'vencido'
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
    count(*) filter (where status = 'sent' and send_date = tv.today)::integer as mensagens_enviadas_hoje,
    count(*) filter (where status = 'failed')::integer as falhas_envio,
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
    jsonb_build_object('name', 'Vencidos', 'value', count(*) filter (where dias_restantes <= 0), 'color', '#DC2626'),
    jsonb_build_object('name', '7 dias', 'value', count(*) filter (where dias_restantes > 0 and dias_restantes <= 7), 'color', '#F59E0B'),
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
    where dias_restantes <= (select warning_days from warning_value)
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

revoke all on function public.get_dashboard_metrics() from public, anon, authenticated;
revoke all on function public.get_whatsapp_bot_message_stats() from public, anon, authenticated;
revoke all on function public.cleanup_qwep_operational_tables() from public, anon, authenticated;
revoke all on function public.reserve_pending_notification_events(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.get_dashboard_metrics() to service_role;
grant execute on function public.get_whatsapp_bot_message_stats() to service_role;
grant execute on function public.cleanup_qwep_operational_tables() to service_role;
grant execute on function public.reserve_pending_notification_events(uuid, integer, integer) to service_role;
