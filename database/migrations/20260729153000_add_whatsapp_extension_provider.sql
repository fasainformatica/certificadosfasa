-- Fasa Certificados - provider alternativo por extensao Chrome para WhatsApp.
-- Mantem euAtendo como provider oficial e adiciona uma fila separada para a extensao.

alter table public.notification_events drop constraint if exists notification_events_provider_check;
alter table public.notification_events add constraint notification_events_provider_check
  check (provider in ('euatendo','whatsapp_extension'));

alter table public.whatsapp_dispatcher_state drop constraint if exists whatsapp_dispatcher_state_provider_check;
alter table public.whatsapp_dispatcher_state add constraint whatsapp_dispatcher_state_provider_check
  check (provider in ('euatendo','whatsapp_extension'));

alter table public.whatsapp_provider_logs drop constraint if exists whatsapp_provider_logs_provider_check;
alter table public.whatsapp_provider_logs add constraint whatsapp_provider_logs_provider_check
  check (provider in ('euatendo','whatsapp_extension'));

create index if not exists notification_events_whatsapp_extension_pending_idx
  on public.notification_events (status, send_date, next_retry_at, created_at)
  where provider = 'whatsapp_extension' and status in ('pending','retry');

insert into public.whatsapp_dispatcher_state (provider)
values ('whatsapp_extension')
on conflict (provider) do nothing;

create or replace function public.reserve_whatsapp_extension_notification_event(
  p_lock_ttl_seconds integer default 120,
  p_ignore_next_allowed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.notification_settings;
  v_today date;
  v_state public.whatsapp_dispatcher_state;
  v_event public.notification_events;
  v_lock_id uuid := gen_random_uuid();
  v_lock_ttl integer := greatest(60, least(coalesce(p_lock_ttl_seconds, 120), 600));
begin
  select * into v_settings
  from public.notification_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
  limit 1;

  if v_settings.id is null or v_settings.enabled is not true then
    return jsonb_build_object('status', 'skipped', 'reason', 'notifications_disabled');
  end if;

  v_today := (now() at time zone coalesce(v_settings.timezone, 'America/Sao_Paulo'))::date;

  insert into public.whatsapp_dispatcher_state (provider)
  values ('whatsapp_extension')
  on conflict (provider) do nothing;

  select * into v_state
  from public.whatsapp_dispatcher_state
  where provider = 'whatsapp_extension'
  for update;

  if v_state.locked_until is not null and v_state.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_state.locked_until);
  end if;

  if p_ignore_next_allowed is not true and v_state.next_allowed_send_at > now() then
    return jsonb_build_object('status', 'waiting', 'next_allowed_send_at', v_state.next_allowed_send_at);
  end if;

  update public.notification_events
  set
    status = case when attempt_count >= max_attempts then 'failed'::public.notification_event_status else 'retry'::public.notification_event_status end,
    next_retry_at = case when attempt_count >= max_attempts then null else now() + interval '1 minute' end,
    failed_at = case when attempt_count >= max_attempts then now() else failed_at end,
    error_message = coalesce(error_message, 'Reserva da extensao do WhatsApp expirada antes do envio.'),
    reservation_id = null,
    reserved_at = null,
    reservation_expires_at = null,
    processing_started_at = null,
    updated_at = now()
  where provider = 'whatsapp_extension'
    and status = 'reserved'
    and dispatched_at is null
    and reservation_expires_at is not null
    and reservation_expires_at < now();

  update public.notification_events
  set
    status = 'failed',
    failed_at = now(),
    error_message = 'Processamento pela extensao interrompido apos inicio do disparo. Revise manualmente para evitar duplicidade.',
    reservation_id = null,
    reserved_at = null,
    reservation_expires_at = null,
    processing_started_at = null,
    updated_at = now()
  where provider = 'whatsapp_extension'
    and status = 'processing'
    and dispatched_at is not null
    and reservation_expires_at is not null
    and reservation_expires_at < now();

  select ne.*
  into v_event
  from public.notification_events ne
  where ne.provider = 'whatsapp_extension'
    and ne.status in ('pending','retry')
    and ne.send_date <= v_today
    and (ne.next_retry_at is null or ne.next_retry_at <= now())
    and (
      ne.type = 'manual_test'
      or
      (
        (
          ne.audience = 'internal'
          and ne.recipient_id is not null
          and exists (
            select 1
            from public.notification_recipients nr
            where nr.id = ne.recipient_id
              and nr.ativo is true
          )
        )
        or
        (
          ne.audience = 'client'
          and ne.cliente_id is not null
          and exists (
            select 1
            from public.clientes cl
            where cl.id = ne.cliente_id
              and cl.whatsapp_notifications_enabled is true
          )
        )
      )
    )
    and (
      ne.type = 'certificate_expired'
      or ne.type = 'manual_test'
      or (
        ne.type = 'certificate_expiring'
        and exists (
          select 1
          from public.certificados c
          where c.id = ne.certificado_id
            and c.status <> 'invalido'::public.certificado_status
            and coalesce(c.renovacao_status, 'em_acompanhamento') in ('em_acompanhamento','renovou_fasa')
            and c.data_vencimento >= v_today
        )
      )
    )
  order by ne.send_date asc, ne.created_at asc
  for update skip locked
  limit 1;

  if v_event.id is null then
    return jsonb_build_object('status', 'empty');
  end if;

  update public.whatsapp_dispatcher_state
  set
    lock_id = v_lock_id,
    locked_until = now() + make_interval(secs => v_lock_ttl),
    updated_at = now()
  where provider = 'whatsapp_extension';

  update public.notification_events
  set
    status = 'reserved',
    reservation_id = v_lock_id,
    reserved_at = now(),
    reservation_expires_at = now() + make_interval(secs => v_lock_ttl),
    processing_started_at = null,
    attempt_count = attempt_count + 1,
    error_message = null,
    updated_at = now()
  where id = v_event.id
  returning * into v_event;

  return jsonb_build_object(
    'status', 'reserved',
    'lock_id', v_lock_id,
    'event', jsonb_build_object(
      'id', v_event.id,
      'audience', v_event.audience,
      'type', v_event.type,
      'telefone_destino', v_event.telefone_destino,
      'mensagem_renderizada', v_event.mensagem_renderizada,
      'attempt_count', v_event.attempt_count,
      'max_attempts', v_event.max_attempts,
      'idempotency_key', v_event.idempotency_key,
      'reservation_id', v_event.reservation_id
    )
  );
end;
$$;

revoke all on function public.reserve_whatsapp_extension_notification_event(integer, boolean) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_extension_notification_event(integer, boolean) to service_role;

comment on function public.reserve_whatsapp_extension_notification_event(integer, boolean) is
  'Reserva transacional de uma mensagem WhatsApp para a extensao Chrome, respeitando lock e cadencia por provider.';
