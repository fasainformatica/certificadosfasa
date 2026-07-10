import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { UserRole } from "@/lib/supabase/database.types";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const currentUser = await getCurrentUser();

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
