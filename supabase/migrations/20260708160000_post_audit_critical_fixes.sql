-- Correcoes pos-auditoria: TTL seguro do bot, token hash de download,
-- reconciliacao Storage/Postgres e status dinamico de certificados.

create extension if not exists "pgcrypto";

alter table public.links_download drop constraint if exists links_download_token_length_check;
alter table public.links_download add column if not exists token_hash text;

update public.links_download
set
  ativo = false,
  invalidado_em = coalesce(invalidado_em, now()),
  senha_hash = coalesce(senha_hash, 'invalidated-legacy-download-link'),
  token_hash = coalesce(token_hash, encode(digest('invalidated-legacy-download-link:' || id::text, 'sha256'), 'hex'))
where senha_hash is null or token_hash is null;

drop index if exists public.links_download_token_publico_key;
alter table public.links_download drop column if exists token_publico;
alter table public.links_download drop constraint if exists links_download_token_hash_check;
alter table public.links_download add constraint links_download_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$');
alter table public.links_download alter column token_hash set not null;
create unique index if not exists links_download_token_hash_key on public.links_download (token_hash);

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

create index if not exists storage_reconciliation_jobs_status_idx on public.storage_reconciliation_jobs (status, created_at desc);
create index if not exists storage_reconciliation_jobs_certificado_id_idx on public.storage_reconciliation_jobs (certificado_id);
create index if not exists storage_reconciliation_jobs_storage_path_idx on public.storage_reconciliation_jobs (storage_path);

drop trigger if exists set_storage_reconciliation_jobs_updated_at on public.storage_reconciliation_jobs;
create trigger set_storage_reconciliation_jobs_updated_at
before update on public.storage_reconciliation_jobs
for each row execute function public.set_updated_at();

alter table public.storage_reconciliation_jobs enable row level security;

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
  select greatest(coalesce(max(day_value), 30), 30)
  into warning_days
  from unnest(coalesce(p_dias_aviso, array[30,15,7])) as day_value
  where day_value > 0;

  warning_days := coalesce(warning_days, 30);

  update public.certificados c
  set status = case
      when c.data_vencimento <= p_today then 'vencido'::public.certificado_status
      when c.data_vencimento <= p_today + warning_days then 'vencendo'::public.certificado_status
      else 'ativo'::public.certificado_status
    end
  where c.status <> 'substituido'
    and c.status is distinct from case
      when c.data_vencimento <= p_today then 'vencido'::public.certificado_status
      when c.data_vencimento <= p_today + warning_days then 'vencendo'::public.certificado_status
      else 'ativo'::public.certificado_status
    end;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

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

  reservation_ttl_seconds :=
    greatest(coalesce(current_settings.delay_maximo_segundos, 60), 30)
    + 45
    + 120;

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

revoke all on function public.reserve_pending_notification_events(uuid, integer) from public, anon, authenticated;
revoke all on function public.refresh_certificado_statuses(int[], date) from public, anon, authenticated;
grant execute on function public.reserve_pending_notification_events(uuid, integer) to service_role;
grant execute on function public.refresh_certificado_statuses(int[], date) to service_role;

comment on table public.storage_reconciliation_jobs is 'Fila administrativa de reconciliacao entre Postgres e Storage privado para uploads, exclusoes e verificacoes.';
comment on table public.links_download is 'Links publicos de alta entropia. O token puro nao e armazenado; apenas token_hash e senha_hash.';
