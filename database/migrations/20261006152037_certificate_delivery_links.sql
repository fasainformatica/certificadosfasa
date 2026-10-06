begin;

alter table public.links_download
  add column if not exists source text not null default 'manual' check (source in ('manual','certificate_update')),
  add column if not exists notification_event_id uuid references public.notification_events(id) on delete set null,
  add column if not exists certificate_hash text,
  add column if not exists delivery_credentials jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists session_hash text,
  add column if not exists session_expires_at timestamptz,
  add column if not exists retry_until timestamptz,
  add column if not exists transfer_id uuid,
  add column if not exists transfer_locked_until timestamptz,
  add column if not exists download_completed_at timestamptz;

update public.links_download l set certificate_hash = c.hash_arquivo
from public.certificados c where c.id = l.certificado_id and l.certificate_hash is null;

drop index if exists public.links_download_um_ativo_por_certificado_idx;
create unique index if not exists links_download_manual_ativo_idx
  on public.links_download(certificado_id) where source = 'manual' and ativo and not usado;
create unique index if not exists links_download_event_idx
  on public.links_download(notification_event_id) where notification_event_id is not null;

-- Snapshot the threshold at update time, not when a delayed dispatcher runs.
create or replace function public.snapshot_certificate_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'certificate_updated' and new.metadata ? 'certificate_hash' then
    new.metadata := new.metadata || jsonb_build_object('certificate_delivery_enabled',
      (select count(*) > 1 from public.notification_recipients where ativo and notify_certificate_updates));
  end if;
  return new;
end;
$$;
drop trigger if exists snapshot_certificate_delivery on public.internal_notifications;
create trigger snapshot_certificate_delivery before insert on public.internal_notifications
for each row execute function public.snapshot_certificate_delivery();

create or replace function public.invalidate_previous_certificate_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.hash_arquivo is distinct from old.hash_arquivo then
    update public.links_download set ativo = false, invalidado_em = now(), delivery_credentials = null
    where certificado_id = new.id and invalidado_em is null;
  end if;
  return new;
end;
$$;
drop trigger if exists invalidate_previous_certificate_links on public.certificados;
create trigger invalidate_previous_certificate_links after update of hash_arquivo on public.certificados
for each row execute function public.invalidate_previous_certificate_links();

-- Service-only issuance: manual links and recipient links never replace each other.
create or replace function public.issue_certificate_download(
  p_certificate_id uuid, p_token_hash text, p_password_hash text,
  p_credentials jsonb default null, p_event_id uuid default null, p_reservation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.certificados;
  e public.notification_events;
  n public.internal_notifications;
  l public.links_download;
begin
  select * into c from public.certificados where id = p_certificate_id for update;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  if p_event_id is not null then
    select * into e from public.notification_events where id = p_event_id for update;
    if not found or e.type <> 'certificate_updated' or e.certificado_id is distinct from c.id
      or e.status <> 'reserved' or e.reservation_expires_at <= now() or e.reservation_id is distinct from p_reservation_id
      or p_reservation_id is null or not public.notification_event_recipient_allowed(e) then
      return jsonb_build_object('status','unavailable');
    end if;
    select * into n from public.internal_notifications where id = e.internal_notification_id;
    if n.metadata->>'certificate_delivery_enabled' is distinct from 'true' then
      return jsonb_build_object('status','text_only');
    end if;
    if n.metadata->>'certificate_hash' is distinct from c.hash_arquivo then
      return jsonb_build_object('status','unavailable');
    end if;
    select * into l from public.links_download where notification_event_id = e.id;
    if found then
      if not l.ativo or l.usado or l.invalidado_em is not null or l.expires_at <= now() then
        return jsonb_build_object('status','unavailable');
      end if;
      return jsonb_build_object('status','ready','id',l.id,'credentials',l.delivery_credentials);
    end if;
    if p_credentials is null then return jsonb_build_object('status','unavailable'); end if;
  else
    update public.links_download set ativo = false, invalidado_em = now()
    where certificado_id = c.id and source = 'manual' and invalidado_em is null;
  end if;
  insert into public.links_download(certificado_id,token_hash,senha_hash,source,notification_event_id,
    certificate_hash,delivery_credentials,expires_at)
  values(c.id,p_token_hash,p_password_hash,case when p_event_id is null then 'manual' else 'certificate_update' end,
    p_event_id,c.hash_arquivo,case when p_event_id is not null then p_credentials end,now()+interval '7 days')
  returning * into l;
  return jsonb_build_object('status','ready','id',l.id,'credentials',l.delivery_credentials);
end;
$$;

-- A row lock serializes password claims and transfers. Retry never renews its deadline.
create or replace function public.access_certificate_download(
  p_token_hash text, p_action text, p_session_hash text default null,
  p_expected_password_hash text default null, p_transfer_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.certificados;
  l public.links_download;
  e public.notification_events;
  attempts integer;
begin
  select c0.* into c from public.certificados c0
    join public.links_download l0 on l0.certificado_id = c0.id
    where l0.token_hash = p_token_hash for share of c0;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  select * into l from public.links_download where token_hash = p_token_hash for update;
  if l.invalidado_em is not null or l.certificate_hash is distinct from c.hash_arquivo
    or l.expires_at <= now() then return jsonb_build_object('status','unavailable'); end if;
  if l.source = 'certificate_update' then
    select * into e from public.notification_events where id = l.notification_event_id;
    if not found or not public.notification_event_recipient_allowed(e) then
      return jsonb_build_object('status','unavailable');
    end if;
  end if;
  if p_action in ('failed_password','authorize') then
    if not l.ativo or l.usado or l.session_hash is not null then
      return jsonb_build_object('status','unavailable');
    end if;
    if l.bloqueado_ate > now() then return jsonb_build_object('status','rate_limited'); end if;
    if p_action = 'failed_password' then
      attempts := case when l.bloqueado_ate <= now() then 1 else l.tentativas_invalidas+1 end;
      update public.links_download set tentativas_invalidas = attempts,
        bloqueado_ate = case when attempts >= 5 then now()+interval '15 minutes' end where id = l.id;
      return jsonb_build_object('status',case when attempts >= 5 then 'rate_limited' else 'wrong_password' end);
    end if;
    if p_expected_password_hash is distinct from l.senha_hash or p_session_hash is null
      or p_session_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','unavailable'); end if;
    update public.links_download set ativo=false,session_hash=p_session_hash,
      session_expires_at=now()+interval '15 minutes',tentativas_invalidas=0,bloqueado_ate=null where id=l.id;
    return jsonb_build_object('status','authorized','id',l.id,'certificate_id',c.id,
      'filename',c.nome_arquivo_original,'ciphertext',c.senha_ciphertext,'iv',c.senha_iv,'authTag',c.senha_auth_tag);
  end if;
  if p_session_hash is null or l.session_hash is distinct from p_session_hash
    or l.session_expires_at <= now() or l.session_expires_at is null then
    return jsonb_build_object('status','unavailable');
  end if;
  if p_action = 'complete' then
    if p_transfer_id is null or l.transfer_id is distinct from p_transfer_id then
      return jsonb_build_object('status','unavailable');
    end if;
    update public.links_download set download_completed_at=coalesce(download_completed_at,now()),
      transfer_locked_until=null,delivery_credentials=null where id=l.id;
    return jsonb_build_object('status','complete');
  end if;
  if l.download_completed_at is not null or l.retry_until <= now() then
    return jsonb_build_object('status','unavailable');
  end if;
  if p_action = 'release' then
    update public.links_download set transfer_locked_until=null where id=l.id and transfer_id=p_transfer_id;
    return jsonb_build_object('status','released');
  end if;
  if p_action <> 'download' or p_transfer_id is null then return jsonb_build_object('status','unavailable'); end if;
  if l.transfer_locked_until > now() then return jsonb_build_object('status','busy'); end if;
  update public.links_download set usado=true,usado_em=coalesce(usado_em,now()),
    retry_until=coalesce(retry_until,now()+interval '2 minutes'),transfer_id=p_transfer_id,
    session_expires_at=greatest(session_expires_at,coalesce(retry_until,now()+interval '2 minutes')),
    transfer_locked_until=now()+interval '30 seconds' where id=l.id;
  return jsonb_build_object('status','ready','id',l.id,'certificate_id',c.id,
    'storage_path',c.storage_path,'filename',c.nome_arquivo_original,
    'retry_until',coalesce(l.retry_until,now()+interval '2 minutes'));
end;
$$;

alter table public.links_download enable row level security;
revoke all on public.links_download from anon, authenticated;
revoke all on function public.snapshot_certificate_delivery() from public,anon,authenticated;
revoke all on function public.invalidate_previous_certificate_links() from public,anon,authenticated;
revoke all on function public.issue_certificate_download(uuid,text,text,jsonb,uuid,uuid) from public,anon,authenticated;
revoke all on function public.access_certificate_download(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.issue_certificate_download(uuid,text,text,jsonb,uuid,uuid) to service_role;
grant execute on function public.access_certificate_download(text,text,text,text,uuid) to service_role;

commit;
