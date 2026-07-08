import "server-only";

import { jsonError } from "@/lib/api/errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

export type ApiUser = {
  id: string;
  email: string | null;
  role: UserRole;
};

export async function requireApiUser(allowedRoles: UserRole[]) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { response: jsonError("Sessao obrigatoria.", 401, "nao_autenticado") };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.active) {
    return { response: jsonError("Usuario sem perfil interno ativo.", 403, "sem_perfil") };
  }

  if (!allowedRoles.includes(profile.role)) {
    return { response: jsonError("Permissao insuficiente.", 403, "sem_permissao") };
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      role: profile.role,
    } satisfies ApiUser,
  };
}
