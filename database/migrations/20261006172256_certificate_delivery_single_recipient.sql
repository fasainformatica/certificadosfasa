begin;

-- Keep the decision tied to the recipients selected when the update is recorded.
-- Existing, already sent notices are intentionally not queued again.
create or replace function public.snapshot_certificate_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'certificate_updated' and new.metadata ? 'certificate_hash' then
    new.metadata := new.metadata || jsonb_build_object('certificate_delivery_enabled',
      exists (
        select 1 from public.notification_recipients
        where ativo and notify_certificate_updates
      ));
  end if;
  return new;
end;
$$;

revoke all on function public.snapshot_certificate_delivery() from public, anon, authenticated;

commit;
