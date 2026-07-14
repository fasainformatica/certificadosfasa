-- Fasa Certificados - correcao de renovacao sem duplicar certificados
-- Execute no Supabase SQL Editor antes de testar novas renovacoes.
-- Objetivo:
-- 1. Manter apenas um certificado por cliente.
-- 2. Converter/remover o status operacional antigo "substituido".
-- 3. Atualizar a RPC de upload para renovar o registro existente.
-- 4. Preservar links publicos apontando para o certificado mantido.

create extension if not exists "pgcrypto";

drop function if exists public.registrar_upload_certificado(
  text, text, text, text, text, text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet
);
drop function if exists public.registrar_upload_certificado(
  text, text, text, text, text, text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet, uuid
);
drop function if exists public.refresh_certificado_statuses(int[], date);
drop function if exists public.get_dashboard_metrics();

drop index if exists public.certificados_um_ativo_por_cliente_idx;
drop index if exists public.certificados_um_atual_por_cliente_idx;
drop index if exists public.certificados_um_por_cliente_idx;

do $$
declare
  current_labels text[];
begin
  select array_agg(e.enumlabel order by e.enumsortorder)
  into current_labels
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and t.typname = 'certificado_status';

  if current_labels is null then
    create type public.certificado_status as enum ('ativo', 'vencendo', 'vencido', 'invalido');
  elsif current_labels is distinct from array['ativo','vencendo','vencido','invalido'] then
    execute 'alter table public.certificados alter column status drop default';
    execute 'drop type if exists public.certificado_status_new';
    execute 'create type public.certificado_status_new as enum (''ativo'', ''vencendo'', ''vencido'', ''invalido'')';
    execute $sql$
      alter table public.certificados
      alter column status type public.certificado_status_new
      using (
        case status::text
          when 'vencendo' then 'vencendo'
          when 'vencido' then 'vencido'
          when 'invalido' then 'invalido'
          else 'ativo'
        end
      )::public.certificado_status_new
    $sql$;
    execute 'drop type public.certificado_status';
    execute 'alter type public.certificado_status_new rename to certificado_status';
    execute 'alter table public.certificados alter column status set default ''ativo''::public.certificado_status';
  end if;
end $$;

create temp table tmp_certificados_duplicados on commit drop as
with ranked as (
  select
    id,
    cliente_id,
    storage_path,
    row_number() over (
      partition by cliente_id
      order by data_vencimento desc, ultimo_upload_em desc, updated_at desc, created_at desc, id desc
    ) as rn,
    first_value(id) over (
      partition by cliente_id
      order by data_vencimento desc, ultimo_upload_em desc, updated_at desc, created_at desc, id desc
    ) as manter_id,
    first_value(storage_path) over (
      partition by cliente_id
      order by data_vencimento desc, ultimo_upload_em desc, updated_at desc, created_at desc, id desc
    ) as manter_storage_path
  from public.certificados
)
select
  id as remover_id,
  cliente_id,
  storage_path as remover_storage_path,
  manter_id,
  manter_storage_path
from ranked
where rn > 1;

insert into public.storage_reconciliation_jobs (
  operation_type,
  certificado_id,
  storage_path,
  status,
  metadata
)
select
  'delete',
  d.manter_id,
  d.remover_storage_path,
  'pending',
  jsonb_build_object(
    'motivo', 'certificado_duplicado_consolidado',
    'certificado_removido_id', d.remover_id,
    'certificado_mantido_id', d.manter_id
  )
from tmp_certificados_duplicados d
where d.remover_storage_path is not null
  and d.remover_storage_path <> d.manter_storage_path
  and to_regclass('public.storage_reconciliation_jobs') is not null;

with active_old_links as (
  select
    l.id,
    d.manter_id,
    row_number() over (partition by d.manter_id order by l.criado_em desc, l.id desc) as rn,
    exists (
      select 1
      from public.links_download active_link
      where active_link.certificado_id = d.manter_id
        and active_link.ativo = true
        and active_link.usado = false
    ) as canonical_has_active_link
  from public.links_download l
  join tmp_certificados_duplicados d on d.remover_id = l.certificado_id
  where l.ativo = true
    and l.usado = false
)
update public.links_download l
set
  ativo = false,
  invalidado_em = coalesce(l.invalidado_em, now()),
  atualizado_em = now()
from active_old_links a
where l.id = a.id
  and (a.canonical_has_active_link or a.rn > 1);

update public.links_download l
set
  certificado_id = d.manter_id,
  atualizado_em = now()
from tmp_certificados_duplicados d
where l.certificado_id = d.remover_id;

update public.notification_events ne
set
  certificado_id = d.manter_id,
  cliente_id = d.cliente_id,
  updated_at = now()
from tmp_certificados_duplicados d
where ne.certificado_id = d.remover_id;

update public.audit_logs a
set certificado_id = d.manter_id
from tmp_certificados_duplicados d
where a.certificado_id = d.remover_id;

update public.storage_reconciliation_jobs sj
set certificado_id = d.manter_id
from tmp_certificados_duplicados d
where sj.certificado_id = d.remover_id;

delete from public.certificados c
using tmp_certificados_duplicados d
where c.id = d.remover_id;

with settings as (
  select coalesce(max(day_value), 30) as warning_days
  from public.notification_settings ns,
  unnest(coalesce(ns.dias_aviso_vencimento, array[30,15,7])) as day_value
  where ns.id = '00000000-0000-0000-0000-000000000001'::uuid
    and day_value > 0
)
update public.certificados c
set
  status = case
    when c.data_vencimento < current_date then 'vencido'::public.certificado_status
    when c.data_vencimento <= current_date + coalesce((select warning_days from settings), 30) then 'vencendo'::public.certificado_status
    else 'ativo'::public.certificado_status
  end,
  updated_at = now()
where c.status <> 'invalido'::public.certificado_status;

create unique index if not exists certificados_um_por_cliente_idx
  on public.certificados (cliente_id);

create or replace function public.registrar_upload_certificado(
  p_cnpj text,
  p_nome_razao_social text,
  p_email text,
  p_telefone text,
  p_whatsapp text,
  p_responsavel text,
  p_observacoes text,
  p_nome_titular text,
  p_senha_ciphertext text,
  p_senha_iv text,
  p_senha_auth_tag text,
  p_data_emissao date,
  p_data_vencimento date,
  p_status public.certificado_status,
  p_storage_path text,
  p_nome_arquivo_original text,
  p_hash_arquivo text,
  p_criado_por uuid,
  p_ip inet,
  p_certificado_id_existente uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_certificado_id uuid;
  v_old_data_vencimento date;
  v_old_hash_arquivo text;
  v_old_storage_path text;
  v_is_update boolean := false;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9]{14}$' then
    raise exception 'cnpj_invalido';
  end if;

  if p_certificado_id_existente is not null then
    select id, cliente_id, data_vencimento, hash_arquivo, storage_path
    into v_certificado_id, v_cliente_id, v_old_data_vencimento, v_old_hash_arquivo, v_old_storage_path
    from public.certificados
    where id = p_certificado_id_existente
    for update;

    if v_certificado_id is null then
      raise exception 'certificado_nao_encontrado';
    end if;

    if exists (
      select 1
      from public.clientes
      where cnpj = p_cnpj
        and id <> v_cliente_id
    ) then
      raise exception 'cnpj_ja_vinculado';
    end if;

    update public.clientes
    set
      cnpj = p_cnpj,
      nome_razao_social = coalesce(nullif(trim(p_nome_razao_social), ''), public.clientes.nome_razao_social),
      email = nullif(trim(coalesce(p_email, '')), ''),
      telefone = nullif(trim(coalesce(p_telefone, '')), ''),
      whatsapp = nullif(trim(coalesce(p_whatsapp, '')), ''),
      responsavel = nullif(trim(coalesce(p_responsavel, '')), ''),
      observacoes = nullif(trim(coalesce(p_observacoes, '')), ''),
      updated_at = now()
    where id = v_cliente_id;
  else
    insert into public.clientes (
      cnpj,
      nome_razao_social,
      email,
      telefone,
      whatsapp,
      responsavel,
      observacoes
    )
    values (
      p_cnpj,
      nullif(trim(p_nome_razao_social), ''),
      nullif(trim(coalesce(p_email, '')), ''),
      nullif(trim(coalesce(p_telefone, '')), ''),
      nullif(trim(coalesce(p_whatsapp, '')), ''),
      nullif(trim(coalesce(p_responsavel, '')), ''),
      nullif(trim(coalesce(p_observacoes, '')), '')
    )
    on conflict (cnpj) do update
      set
        nome_razao_social = coalesce(nullif(trim(excluded.nome_razao_social), ''), public.clientes.nome_razao_social),
        email = excluded.email,
        telefone = excluded.telefone,
        whatsapp = excluded.whatsapp,
        responsavel = excluded.responsavel,
        observacoes = excluded.observacoes,
        updated_at = now()
    returning id into v_cliente_id;

    select id, data_vencimento, hash_arquivo, storage_path
    into v_certificado_id, v_old_data_vencimento, v_old_hash_arquivo, v_old_storage_path
    from public.certificados
    where cliente_id = v_cliente_id
    order by updated_at desc
    limit 1
    for update;
  end if;

  if v_certificado_id is not null then
    v_is_update := true;

    update public.certificados
    set
      cnpj = p_cnpj,
      nome_titular = p_nome_titular,
      senha_ciphertext = p_senha_ciphertext,
      senha_iv = p_senha_iv,
      senha_auth_tag = p_senha_auth_tag,
      data_emissao = p_data_emissao,
      data_vencimento = p_data_vencimento,
      status = p_status,
      storage_path = p_storage_path,
      nome_arquivo_original = p_nome_arquivo_original,
      hash_arquivo = p_hash_arquivo,
      ultimo_upload_em = now(),
      updated_at = now()
    where id = v_certificado_id;
  else
    insert into public.certificados (
      cliente_id,
      cnpj,
      nome_titular,
      senha_ciphertext,
      senha_iv,
      senha_auth_tag,
      data_emissao,
      data_vencimento,
      status,
      storage_path,
      nome_arquivo_original,
      hash_arquivo,
      criado_por
    )
    values (
      v_cliente_id,
      p_cnpj,
      p_nome_titular,
      p_senha_ciphertext,
      p_senha_iv,
      p_senha_auth_tag,
      p_data_emissao,
      p_data_vencimento,
      p_status,
      p_storage_path,
      p_nome_arquivo_original,
      p_hash_arquivo,
      p_criado_por
    )
    returning id into v_certificado_id;
  end if;

  insert into public.audit_logs (user_id, acao, certificado_id, ip, metadata)
  values (
    p_criado_por,
    case when v_is_update then 'renovacao_certificado' else 'upload_certificado' end,
    v_certificado_id,
    p_ip,
    jsonb_build_object(
      'cnpj', p_cnpj,
      'hash_arquivo', p_hash_arquivo,
      'renovado', v_is_update,
      'validade_anterior', v_old_data_vencimento,
      'nova_validade', p_data_vencimento,
      'hash_anterior', v_old_hash_arquivo,
      'storage_path_anterior', v_old_storage_path
    )
  );

  return v_certificado_id;
end;
$$;

revoke all on function public.registrar_upload_certificado(
  text, text, text, text, text, text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet, uuid
) from public, anon, authenticated;
grant execute on function public.registrar_upload_certificado(
  text, text, text, text, text, text, text, text, text, text, text, date, date, public.certificado_status, text, text, text, uuid, inet, uuid
) to service_role;

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
  where c.status <> 'invalido'::public.certificado_status
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
