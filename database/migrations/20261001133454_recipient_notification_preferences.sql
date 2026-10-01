begin;

-- Existing recipients retain scheduled notices; update notices require explicit opt-in.
alter table public.notification_recipients
  add column if not exists notify_general boolean not null default true,
  add column if not exists notify_certificate_updates boolean not null default false;

alter table public.notification_events
  add column if not exists internal_notification_id uuid
    references public.internal_notifications(id) on delete set null;

alter table public.notification_events drop constraint if exists notification_events_type_check;
alter table public.notification_events add constraint notification_events_type_check
  check (type in ('certificate_expiring','certificate_expired','manual_test','certificate_updated','internal_notice'));

create index if not exists notification_events_internal_notification_idx
  on public.notification_events(internal_notification_id) where internal_notification_id is not null;

-- Shared by queue insertion, retries and both reservation functions. No client preference changes.
create or replace function public.notification_event_recipient_allowed(p_event public.notification_events)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_event.type = 'manual_test' then true
    when p_event.type in ('certificate_updated','internal_notice') then
      p_event.audience = 'internal'
      and exists (
        select 1 from public.notification_recipients r
        where r.id = p_event.recipient_id and r.ativo and r.notify_certificate_updates
      )
      and exists (
        select 1 from public.internal_notifications n
        where n.id = p_event.internal_notification_id
          and n.target_user_id is null and n.target_role is null
          and (n.expires_at is null or n.expires_at > now())
          and (
            (p_event.type = 'certificate_updated' and n.type = 'certificate_updated')
            or (p_event.type = 'internal_notice' and n.type = 'system_notice'
                and n.metadata->>'source' = 'manual_internal_broadcast')
          )
      )
    when p_event.audience = 'internal' then exists (
      select 1 from public.notification_recipients r
      where r.id = p_event.recipient_id and r.ativo and r.notify_general
    )
    else true
  end;
$$;

create or replace function public.guard_notification_recipient_preferences()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('pending','retry') and not public.notification_event_recipient_allowed(new) then
    new.status := 'cancelled';
    new.error_message := 'Aviso cancelado: destinatario desativado, categoria desmarcada ou comunicado indisponivel.';
    new.next_retry_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_events_recipient_preferences on public.notification_events;
create trigger notification_events_recipient_preferences
  before insert or update of status, recipient_id, type, internal_notification_id on public.notification_events
  for each row execute function public.guard_notification_recipient_preferences();

create or replace function public.sync_notification_recipient_preferences()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Never change a message already reserved/processing or sent. Re-enabling does not replay cancelled notices.
  update public.notification_events e
  set status = case when public.notification_event_recipient_allowed(e) then e.status
                    else 'cancelled'::public.notification_event_status end,
      error_message = case when public.notification_event_recipient_allowed(e) then e.error_message
                           else 'Aviso cancelado: destinatario desativado ou categoria desmarcada.' end,
      next_retry_at = case when public.notification_event_recipient_allowed(e) then e.next_retry_at else null end,
      telefone_destino = new.telefone_normalizado,
      updated_at = now()
  where e.recipient_id = new.id and e.audience = 'internal' and e.status in ('pending','retry');
  return new;
end;
$$;

drop trigger if exists notification_recipients_sync_preferences on public.notification_recipients;
create trigger notification_recipients_sync_preferences
  after update of ativo, notify_general, notify_certificate_updates, telefone_normalizado
  on public.notification_recipients
  for each row execute function public.sync_notification_recipient_preferences();

create or replace function public.queue_internal_notification_whatsapp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_provider text := new.metadata->>'whatsapp_provider';
  v_settings public.notification_settings;
begin
  if new.target_role is not null or new.target_user_id is not null
    or (new.expires_at is not null and new.expires_at <= now()) then
    return new;
  end if;
  if new.type <> 'certificate_updated'
    and not (new.type = 'system_notice' and coalesce(new.metadata->>'source', '') = 'manual_internal_broadcast') then
    return new;
  end if;
  -- Older deployments do not supply a provider. Do not guess a channel or backfill old notices.
  if v_provider is null or v_provider not in ('euatendo','whatsapp_extension') then
    return new;
  end if;
  select * into v_settings from public.notification_settings
    where id = '00000000-0000-0000-0000-000000000001'::uuid;

  insert into public.notification_events (
    internal_notification_id, certificado_id, cliente_id, recipient_id,
    telefone_destino, type, dias_restantes, send_date, mensagem_renderizada,
    status, provider, audience, channel, max_attempts, idempotency_key, payload
  )
  select new.id, new.certificado_id, new.cliente_id, r.id,
    r.telefone_normalizado,
    case when new.type = 'certificate_updated' then 'certificate_updated' else 'internal_notice' end,
    0, (now() at time zone coalesce(v_settings.timezone, 'America/Sao_Paulo'))::date,
    new.title || E'\n\n' || coalesce(new.body, ''),
    'pending', v_provider, 'internal', 'whatsapp', coalesce(v_settings.max_attempts, 3),
    'internal_notification:' || new.id::text || ':recipient:' || r.id::text,
    jsonb_build_object('source', 'internal_notification', 'internal_notification_id', new.id)
  from public.notification_recipients r
  where r.ativo and r.notify_certificate_updates
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists internal_notifications_queue_whatsapp on public.internal_notifications;
create trigger internal_notifications_queue_whatsapp after insert on public.internal_notifications
  for each row execute function public.queue_internal_notification_whatsapp();

revoke all on function public.notification_event_recipient_allowed(public.notification_events) from public, anon, authenticated;
revoke all on function public.guard_notification_recipient_preferences() from public, anon, authenticated;
revoke all on function public.sync_notification_recipient_preferences() from public, anon, authenticated;
revoke all on function public.queue_internal_notification_whatsapp() from public, anon, authenticated;
grant execute on function public.notification_event_recipient_allowed(public.notification_events) to service_role;

-- Reservation functions are replaced below without changing their locks or cadence.

create or replace function public.reserve_euatendo_notification_event(
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
  values ('euatendo')
  on conflict (provider) do nothing;

  select * into v_state
  from public.whatsapp_dispatcher_state
  where provider = 'euatendo'
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
    next_retry_at = case when attempt_count >= max_attempts then next_retry_at else now() + interval '1 minute' end,
    failed_at = case when attempt_count >= max_attempts then now() else failed_at end,
    error_message = coalesce(error_message, 'Reserva euAtendo expirada antes do envio.'),
    reservation_id = null,
    reserved_at = null,
    reservation_expires_at = null,
    processing_started_at = null
  where provider = 'euatendo'
    and status in ('reserved','processing')
    and dispatched_at is null
    and reservation_expires_at is not null
    and reservation_expires_at < now();

  update public.notification_events
  set
    status = 'failed',
    failed_at = now(),
    error_message = 'Processamento euAtendo interrompido apos inicio do disparo. Revisao manual necessaria para evitar duplicidade.',
    reservation_id = null,
    reserved_at = null,
    reservation_expires_at = null,
    processing_started_at = null
  where provider = 'euatendo'
    and status = 'processing'
    and dispatched_at is not null
    and reservation_expires_at is not null
    and reservation_expires_at < now();

  -- Expired or withdrawn internal notices must not stay in the actionable queue.
  update public.notification_events ne
  set status = 'cancelled', next_retry_at = null,
      error_message = 'Aviso cancelado: destinatario ou comunicado indisponivel.',
      updated_at = now()
  where ne.provider = 'euatendo'
    and ne.status in ('pending','retry')
    and ne.send_date <= v_today
    and not public.notification_event_recipient_allowed(ne);

  select ne.*
  into v_event
  from public.notification_events ne
  where ne.provider = 'euatendo'
    and ne.status in ('pending','retry')
    and public.notification_event_recipient_allowed(ne)
    and ne.send_date <= v_today
    and (ne.next_retry_at is null or ne.next_retry_at <= now())
    and (
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
    and (
      ne.type in ('certificate_expired','certificate_updated','internal_notice')
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
  where provider = 'euatendo';

  update public.notification_events
  set
    status = 'reserved',
    reservation_id = v_lock_id,
    reserved_at = now(),
    reservation_expires_at = now() + make_interval(secs => v_lock_ttl),
    processing_started_at = null,
    attempt_count = attempt_count + 1,
    error_message = null
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
      'template_id', v_event.template_id,
      'attempt_count', v_event.attempt_count,
      'max_attempts', v_event.max_attempts,
      'idempotency_key', v_event.idempotency_key,
      'reservation_id', v_event.reservation_id
    )
  );
end;
$$;

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

  -- Expired or withdrawn internal notices must not stay in the actionable queue.
  update public.notification_events ne
  set status = 'cancelled', next_retry_at = null,
      error_message = 'Aviso cancelado: destinatario ou comunicado indisponivel.',
      updated_at = now()
  where ne.provider = 'whatsapp_extension'
    and ne.status in ('pending','retry')
    and ne.send_date <= v_today
    and not public.notification_event_recipient_allowed(ne);

  select ne.*
  into v_event
  from public.notification_events ne
  where ne.provider = 'whatsapp_extension'
    and ne.status in ('pending','retry')
    and public.notification_event_recipient_allowed(ne)
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
      ne.type in ('certificate_expired','certificate_updated','internal_notice')
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

revoke all on function public.reserve_euatendo_notification_event(integer, boolean) from public, anon, authenticated;
grant execute on function public.reserve_euatendo_notification_event(integer, boolean) to service_role;
revoke all on function public.reserve_whatsapp_extension_notification_event(integer, boolean) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_extension_notification_event(integer, boolean) to service_role;

commit;
