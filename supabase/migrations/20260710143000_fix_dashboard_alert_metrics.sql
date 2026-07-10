-- Fix dashboard warning metrics to use configured notice days and timezone-based date rules.

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
    limit 6
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

revoke all on function public.get_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.get_dashboard_metrics() to service_role;
