import type { UserRole } from "@/lib/supabase/database.types";

export const ADMIN_ROLES = ["admin"] as const satisfies readonly UserRole[];
export const OPERATIONAL_ROLES = ["admin", "financeiro"] as const satisfies readonly UserRole[];

export function canAccessAdminOnlyArea(role: UserRole) {
  return role === "admin";
}

export function canManageOperationalData(role: UserRole) {
  return OPERATIONAL_ROLES.includes(role);
}
