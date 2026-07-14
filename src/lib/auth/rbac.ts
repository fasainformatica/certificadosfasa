import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { UserRole } from "@/lib/supabase/database.types";
import { InvalidAuthSessionError, isInvalidRefreshTokenError, sessionCleanupRedirectPath } from "@/lib/supabase/auth-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  role: UserRole;
};

export function canManageSensitiveData(role: UserRole) {
  return role === "admin";
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerSupabaseClient();
  let user: User | null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      throw new InvalidAuthSessionError();
    }

    throw error;
  }

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.active) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role,
  };
});

export async function requireInternalUser() {
  let currentUser: CurrentUser | null;

  try {
    currentUser = await getCurrentUser();
  } catch (error) {
    if (error instanceof InvalidAuthSessionError) {
      redirect(sessionCleanupRedirectPath());
    }

    throw error;
  }

  if (!currentUser) {
    redirect("/login");
  }

  return currentUser;
}

export async function requireAdmin() {
  const currentUser = await requireInternalUser();

  if (currentUser.role !== "admin") {
    redirect("/dashboard?erro=sem-permissao");
  }

  return currentUser;
}
