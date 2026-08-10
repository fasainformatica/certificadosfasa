-- Fasa Certificados - base para notificacoes internas do painel e futuro app Windows.
-- Esta migration nao dispara mensagens, nao altera WhatsApp e nao cria rotas publicas.

create table if not exists public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  severity text not null default 'info',
  title text not null,
  body text,
  href text,
  entity_type text,
  entity_id uuid,
  certificado_id uuid references public.certificados(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  target_role public.user_role,
  target_user_id uuid references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint internal_notifications_type_check check (
    type in (
      'certificate_created',
      'certificate_updated',
      'certificate_status_changed',
      'certificate_renewal_status_changed',
      'client_updated',
      'notification_failed',
      'whatsapp_status_changed',
      'system_notice'
    )
  ),
  constraint internal_notifications_severity_check check (
    severity in ('info','success','warning','error')
  ),
  constraint internal_notifications_title_check check (length(btrim(title)) between 3 and 120),
  constraint internal_notifications_body_check check (body is null or length(body) <= 500),
  constraint internal_notifications_href_check check (
    href is null
    or (left(href, 1) = '/' and left(href, 2) <> '//' and length(href) between 1 and 300)
  ),
  constraint internal_notifications_entity_type_check check (
    entity_type is null
    or entity_type in ('certificado','cliente','notification_event','whatsapp','sistema')
  ),
  constraint internal_notifications_dedupe_key_check check (
    dedupe_key is null or length(dedupe_key) between 8 and 160
  ),
  constraint internal_notifications_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint internal_notifications_expiration_check check (expires_at is null or expires_at > created_at)
);

create table if not exists public.internal_notification_reads (
  notification_id uuid not null references public.internal_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (notification_id, user_id),
  constraint internal_notification_reads_dismissed_check check (
    dismissed_at is null or dismissed_at >= read_at
  )
);

create index if not exists internal_notifications_created_at_idx
  on public.internal_notifications (created_at desc);
create index if not exists internal_notifications_target_idx
  on public.internal_notifications (target_user_id, target_role, created_at desc);
create index if not exists internal_notifications_entity_idx
  on public.internal_notifications (entity_type, entity_id)
  where entity_type is not null and entity_id is not null;
create index if not exists internal_notifications_certificado_idx
  on public.internal_notifications (certificado_id, created_at desc)
  where certificado_id is not null;
create index if not exists internal_notifications_cliente_idx
  on public.internal_notifications (cliente_id, created_at desc)
  where cliente_id is not null;
create index if not exists internal_notifications_expires_at_idx
  on public.internal_notifications (expires_at);
create unique index if not exists internal_notifications_dedupe_key_unique_idx
  on public.internal_notifications (dedupe_key)
  where dedupe_key is not null;
create index if not exists internal_notification_reads_user_idx
  on public.internal_notification_reads (user_id, read_at desc);

alter table public.internal_notifications enable row level security;
alter table public.internal_notification_reads enable row level security;

drop policy if exists "Internal users can read internal notifications" on public.internal_notifications;
create policy "Internal users can read internal notifications"
on public.internal_notifications
for select
to authenticated
using (
  public.can_read_internal()
  and (expires_at is null or expires_at > now())
  and (target_user_id is null or target_user_id = auth.uid())
  and (target_role is null or target_role = public.current_user_role())
);

drop policy if exists "Only admins can manage internal notifications" on public.internal_notifications;
create policy "Only admins can manage internal notifications"
on public.internal_notifications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Internal users can read own notification state" on public.internal_notification_reads;
create policy "Internal users can read own notification state"
on public.internal_notification_reads
for select
to authenticated
using (public.can_read_internal() and user_id = auth.uid());

drop policy if exists "Internal users can mark own notifications read" on public.internal_notification_reads;
create policy "Internal users can mark own notifications read"
on public.internal_notification_reads
for insert
to authenticated
with check (
  public.can_read_internal()
  and user_id = auth.uid()
  and exists (
    select 1
    from public.internal_notifications n
    where n.id = notification_id
      and (n.expires_at is null or n.expires_at > now())
      and (n.target_user_id is null or n.target_user_id = auth.uid())
      and (n.target_role is null or n.target_role = public.current_user_role())
  )
);

drop policy if exists "Internal users can update own notification state" on public.internal_notification_reads;
create policy "Internal users can update own notification state"
on public.internal_notification_reads
for update
to authenticated
using (public.can_read_internal() and user_id = auth.uid())
with check (public.can_read_internal() and user_id = auth.uid());

revoke all on public.internal_notifications from anon, authenticated;
grant select (
  id,
  type,
  severity,
  title,
  body,
  href,
  entity_type,
  entity_id,
  certificado_id,
  cliente_id,
  target_role,
  target_user_id,
  actor_user_id,
  metadata,
  created_at,
  expires_at
) on public.internal_notifications to authenticated;

revoke all on public.internal_notification_reads from anon, authenticated;
grant select, insert on public.internal_notification_reads to authenticated;
grant update (read_at, dismissed_at) on public.internal_notification_reads to authenticated;

comment on table public.internal_notifications is
  'Fila interna para avisos do painel e futuro app Windows. Nao substitui notification_events e nao dispara WhatsApp.';
comment on column public.internal_notifications.type is
  'Tipo de apresentacao da notificacao interna. Nao reutiliza status persistidos do dispatcher WhatsApp.';
comment on column public.internal_notifications.severity is
  'Tom visual esperado: info, success, warning ou error.';
comment on column public.internal_notifications.href is
  'Caminho interno opcional iniciado por barra. Nao armazena URL externa, token publico ou storage_path.';
comment on column public.internal_notifications.metadata is
  'Metadados sem senhas, tokens, service role, storage_path ou payload bruto de provider.';
comment on table public.internal_notification_reads is
  'Estado individual de leitura/dispensa de notificacoes internas por usuario autenticado.';
