import "server-only";

import type { User } from "@supabase/supabase-js";

import { jsonError } from "@/lib/api/errors";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

export type ApiUser = {
  id: string;
  email: string | null;
  role: UserRole;
};

export async function requireApiUser(allowedRoles: UserRole[]) {
  const supabase = await createServerSupabaseClient();
  let user: User | null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      return { response: jsonError("Sessao expirada. Entre novamente.", 401, "sessao_expirada") };
    }

    throw error;
  }

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
