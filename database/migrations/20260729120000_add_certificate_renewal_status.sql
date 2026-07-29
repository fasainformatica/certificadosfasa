-- Fasa Certificados - situacao operacional de renovacao
-- Execute no Supabase SQL Editor antes de usar os novos filtros.
-- Objetivo:
-- 1. Registrar quando um certificado saiu do acompanhamento de renovacao.
-- 2. Manter historico sem apagar certificado, cliente, eventos ou arquivos PFX.
-- 3. Impedir que certificados renovados fora/inativos gerem novos avisos automaticos.

alter table public.certificados
  add column if not exists renovacao_status text not null default 'em_acompanhamento',
  add column if not exists renovacao_observacao text,
  add column if not exists renovacao_atualizado_em timestamptz,
  add column if not exists renovacao_atualizado_por uuid;

update public.certificados
set renovacao_status = 'em_acompanhamento'
where renovacao_status is null
   or renovacao_status not in ('em_acompanhamento','renovou_fasa','renovou_externo','nao_renovar','cliente_inativo');

alter table public.certificados drop constraint if exists certificados_renovacao_status_check;
alter table public.certificados add constraint certificados_renovacao_status_check
  check (renovacao_status in ('em_acompanhamento','renovou_fasa','renovou_externo','nao_renovar','cliente_inativo'));

alter table public.certificados drop constraint if exists certificados_renovacao_observacao_check;
alter table public.certificados add constraint certificados_renovacao_observacao_check
  check (renovacao_observacao is null or length(renovacao_observacao) <= 500);

alter table public.certificados drop constraint if exists certificados_renovacao_atualizado_por_fkey;
alter table public.certificados add constraint certificados_renovacao_atualizado_por_fkey
  foreign key (renovacao_atualizado_por) references auth.users(id) on delete set null;

create index if not exists certificados_renovacao_status_idx
  on public.certificados (renovacao_status, data_vencimento);

grant select (
  renovacao_status,
  renovacao_observacao,
  renovacao_atualizado_em,
  renovacao_atualizado_por
) on public.certificados to authenticated;

comment on column public.certificados.renovacao_status is 'Situacao operacional da renovacao. Valores fora do acompanhamento nao entram no planejamento automatico de avisos.';
comment on column public.certificados.renovacao_observacao is 'Observacao curta sobre a decisao de renovacao, sem senhas, tokens ou dados sensiveis.';
comment on column public.certificados.renovacao_atualizado_em is 'Data/hora da ultima alteracao da situacao de renovacao.';
comment on column public.certificados.renovacao_atualizado_por is 'Usuario interno que alterou a situacao de renovacao.';

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
  where c.status <> 'invalido'::public.certificado_status
    and coalesce(c.renovacao_status, 'em_acompanhamento') in ('em_acompanhamento','renovou_fasa')
    and c.status is distinct from case
      when c.data_vencimento < p_today then 'vencido'::public.certificado_status
      when c.data_vencimento <= p_today + warning_days then 'vencendo'::public.certificado_status
      else 'ativo'::public.certificado_status
    end;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_certificado_statuses(int[], date) from public, anon, authenticated;
grant execute on function public.refresh_certificado_statuses(int[], date) to service_role;

create or replace function public.get_dashboard_metrics()
returns jsonb
language sql
security definer
set search_path = public
as $$
with effective_settings as (
  select
    coalesce(timezone, 'America/Sao_Paulo') as timezone,
    coalesce(dias_aviso_vencimento, array[30,15,1]) as dias_aviso_vencimento
  from public.notification_settings
  where id = '00000000-0000-0000-0000-000000000001'::uuid
),
today_value as (
  select (now() at time zone coalesce((select timezone from effective_settings), 'America/Sao_Paulo'))::date as today
),
warning_value as (
  select coalesce(max(day_value), 30)::integer as warning_days
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
  where c.status <> 'invalido'::public.certificado_status
    and coalesce(c.renovacao_status, 'em_acompanhamento') in ('em_acompanhamento','renovou_fasa')
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
  where ne.provider = 'euatendo'
),
channel_state as (
  select jsonb_build_object(
    'provider', provider,
    'last_dispatch_at', last_dispatch_at,
    'next_allowed_send_at', next_allowed_send_at,
    'locked_until', locked_until,
    'available', (locked_until is null or locked_until < now())
  ) as state
  from public.whatsapp_dispatcher_state
  where provider = 'euatendo'
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
  'canal_whatsapp', (select state from channel_state),
  'status_canal_whatsapp', coalesce((select (state->>'available')::boolean from channel_state), true),
  'mensagens_aguardando', coalesce((select mensagens_aguardando from event_counts), 0),
  'enviadas_hoje', coalesce((select mensagens_enviadas_hoje from event_counts), 0),
  'status_chart', jsonb_build_array(
    jsonb_build_object('name', 'Validos', 'value', coalesce((select certificados_validos from cert_counts), 0), 'color', '#16A34A'),
    jsonb_build_object('name', 'Vencendo', 'value', coalesce((select certificados_vencendo from cert_counts), 0), 'color', '#F59E0B'),
    jsonb_build_object('name', 'Vencidos', 'value', coalesce((select certificados_vencidos from cert_counts), 0), 'color', '#DC2626')
  ),
  'expiration_chart', coalesce((select data from period_counts), '[]'::jsonb),
  'attention_certificates', coalesce((select data from attention), '[]'::jsonb)
);
$$;

revoke all on function public.get_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.get_dashboard_metrics() to service_role;

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

  select ne.*
  into v_event
  from public.notification_events ne
  where ne.provider = 'euatendo'
    and ne.status in ('pending','retry')
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

revoke all on function public.reserve_euatendo_notification_event(integer, boolean) from public, anon, authenticated;
grant execute on function public.reserve_euatendo_notification_event(integer, boolean) to service_role;
