create or replace function public.reserve_pending_notification_events(
  target_device_id uuid,
  batch_limit integer default 5
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
set search_path = public, extensions
as $$
declare
  target_device public.whatsapp_devices;
  current_settings public.notification_settings;
  current_today date;
  candidate record;
  generated_reservation_id uuid;
  generated_reservation_token text;
  safe_limit integer;
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
      reservation_expires_at = now() + interval '60 seconds',
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

revoke all on function public.reserve_pending_notification_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_pending_notification_events(uuid, integer) to service_role;
