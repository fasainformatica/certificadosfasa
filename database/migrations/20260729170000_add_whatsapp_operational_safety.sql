alter table public.notification_settings
  add column if not exists whatsapp_dispatch_paused boolean not null default false,
  add column if not exists whatsapp_dispatch_paused_at timestamptz,
  add column if not exists whatsapp_dispatch_pause_reason text,
  add column if not exists whatsapp_daily_limit integer not null default 25,
  add column if not exists whatsapp_hourly_limit integer not null default 10,
  add column if not exists whatsapp_auto_pause_enabled boolean not null default true,
  add column if not exists whatsapp_failure_pause_threshold integer not null default 3,
  add column if not exists whatsapp_failure_pause_window_minutes integer not null default 60;

update public.notification_settings
set
  whatsapp_daily_limit = greatest(1, least(coalesce(whatsapp_daily_limit, 25), 500)),
  whatsapp_hourly_limit = greatest(1, least(coalesce(whatsapp_hourly_limit, 10), 100)),
  whatsapp_failure_pause_threshold = greatest(1, least(coalesce(whatsapp_failure_pause_threshold, 3), 50)),
  whatsapp_failure_pause_window_minutes = greatest(5, least(coalesce(whatsapp_failure_pause_window_minutes, 60), 1440)),
  whatsapp_dispatch_pause_reason = nullif(left(coalesce(whatsapp_dispatch_pause_reason, ''), 200), '');

alter table public.notification_settings drop constraint if exists notification_settings_whatsapp_limits_check;
alter table public.notification_settings add constraint notification_settings_whatsapp_limits_check check (
  whatsapp_daily_limit between 1 and 500
  and whatsapp_hourly_limit between 1 and 100
  and whatsapp_hourly_limit <= whatsapp_daily_limit
  and whatsapp_failure_pause_threshold between 1 and 50
  and whatsapp_failure_pause_window_minutes between 5 and 1440
  and (whatsapp_dispatch_pause_reason is null or length(whatsapp_dispatch_pause_reason) <= 200)
);

comment on column public.notification_settings.whatsapp_dispatch_paused is
  'Pausa operacional do dispatcher WhatsApp sem apagar planejamento de avisos.';
comment on column public.notification_settings.whatsapp_daily_limit is
  'Limite maximo de mensagens WhatsApp aceitas por dia pelo provedor ativo.';
comment on column public.notification_settings.whatsapp_hourly_limit is
  'Limite maximo de mensagens WhatsApp aceitas na ultima hora pelo provedor ativo.';
comment on column public.notification_settings.whatsapp_auto_pause_enabled is
  'Quando ativo, pausa o dispatcher apos falhas recentes acima do limite configurado.';
