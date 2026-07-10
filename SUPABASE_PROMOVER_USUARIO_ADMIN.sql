-- Promove um usuario existente do Supabase Auth para administrador.
-- Como usar:
-- 1. Crie o usuario primeiro em Authentication > Users, se ele ainda nao existir.
-- 2. Troque o e-mail abaixo pelo e-mail real do usuario.
-- 3. Execute este SQL no projeto Supabase correto.

do $$
declare
  target_email text := 'fasa@fasainformatica.com.br';
  target_user_id uuid;
begin
  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'Usuario com e-mail % nao encontrado em auth.users. Crie o usuario no Supabase Auth primeiro.', target_email;
  end if;

  insert into public.user_profiles (id, role, active)
  values (target_user_id, 'admin'::public.user_role, true)
  on conflict (id) do update
  set
    role = 'admin'::public.user_role,
    active = true,
    updated_at = now();
end $$;

-- Conferencia: deve retornar o usuario com role = admin e active = true.
select
  u.id,
  u.email,
  p.role,
  p.active,
  p.updated_at
from auth.users u
join public.user_profiles p on p.id = u.id
where lower(u.email) = lower('TROQUE_PELO_EMAIL_DO_USUARIO@exemplo.com');
