import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import type { ManagedInternalUser } from "@/lib/admin/user-types";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = SupabaseClient<Database>;
type UserProfileRow = Database["public"]["Tables"]["user_profiles"]["Row"];

export const internalUserRoleSchema = z.enum(["admin", "financeiro"]);

export const createInternalUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail valido.").max(254),
  password: z.string().min(8, "A senha temporaria deve ter pelo menos 8 caracteres.").max(128),
  role: internalUserRoleSchema.default("financeiro"),
  active: z.coerce.boolean().default(true),
});

export const updateInternalUserSchema = z
  .object({
    role: internalUserRoleSchema.optional(),
    active: z.coerce.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.active !== undefined, {
    message: "Informe ao menos uma alteracao.",
  });

function profileFallback(id: string): UserProfileRow {
  const now = new Date().toISOString();

  return {
    id,
    role: "financeiro",
    active: false,
    created_at: now,
    updated_at: now,
  };
}

export function toManagedInternalUser(user: User, profile?: UserProfileRow | null): ManagedInternalUser {
  const safeProfile = profile ?? profileFallback(user.id);

  return {
    id: user.id,
    email: user.email ?? "sem-email",
    role: safeProfile.role,
    active: safeProfile.active,
    createdAt: safeProfile.created_at ?? user.created_at ?? null,
    updatedAt: safeProfile.updated_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };
}

export async function listManagedInternalUsers(admin: AdminClient) {
  const users: User[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error("Nao foi possivel listar os usuarios internos.");
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  if (users.length === 0) {
    return [];
  }

  const ids = users.map((user) => user.id);
  const { data: profiles, error: profilesError } = await admin
    .from("user_profiles")
    .select("id, role, active, created_at, updated_at")
    .in("id", ids);

  if (profilesError) {
    throw new Error("Nao foi possivel carregar as permissoes dos usuarios.");
  }

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return users
    .map((user) => toManagedInternalUser(user, profileById.get(user.id)))
    .sort((left, right) => left.email.localeCompare(right.email, "pt-BR"));
}

export async function getManagedInternalUser(admin: AdminClient, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("id, role, active, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error("Nao foi possivel carregar a permissao do usuario.");
  }

  return toManagedInternalUser(data.user, profile);
}

export async function hasAnotherActiveAdmin(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("user_profiles")
    .select("id")
    .eq("role", "admin")
    .eq("active", true)
    .neq("id", userId)
    .limit(1);

  if (error) {
    throw new Error("Nao foi possivel validar administradores ativos.");
  }

  return (data ?? []).length > 0;
}
