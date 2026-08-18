-- Fase 1 do hardening do segundo feedback.
-- Bloqueia o efeito operacional de signup publico aberto:
-- qualquer usuario criado fora da gestao administrativa nasce inativo.
-- A tela /configuracoes continua podendo ativar usuarios via API admin.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.user_profiles (id, role, active)
  values (new.id, 'financeiro', false)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria perfil interno inativo para novos usuarios do Supabase Auth. Administradores ativam acesso explicitamente em /configuracoes.';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_internal_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_read_internal() from public, anon;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_internal_user() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_read_internal() to authenticated, service_role;

comment on function public.current_user_role() is
  'Helper RLS SECURITY DEFINER sem parametros; retorna apenas o role ativo vinculado a auth.uid().';
comment on function public.is_internal_user() is
  'Helper RLS SECURITY DEFINER sem parametros; valida apenas se auth.uid() possui perfil ativo.';
comment on function public.is_admin() is
  'Helper RLS SECURITY DEFINER sem parametros; usado por policies administrativas.';
comment on function public.can_read_internal() is
  'Helper RLS SECURITY DEFINER sem parametros; usado por policies de leitura interna.';

commit;
