import type { UserRole } from "@/lib/supabase/database.types";

export type InternalNotificationVisibilityFilters = {
  expiresAt: string;
  targetUser: string;
  targetRole: string;
};

export function buildInternalNotificationVisibilityFilters(params: {
  userId: string;
  role: UserRole;
  nowIso: string;
}): InternalNotificationVisibilityFilters {
  return {
    expiresAt: `expires_at.is.null,expires_at.gt.${params.nowIso}`,
    targetUser: `target_user_id.is.null,target_user_id.eq.${params.userId}`,
    targetRole: `target_role.is.null,target_role.eq.${params.role}`,
  };
}

export function formatPostgrestInFilter(values: readonly string[]) {
  return `(${values.join(",")})`;
}
