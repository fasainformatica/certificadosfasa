import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import {
  buildInternalNotificationIdFilter,
  createInternalNotificationReadStateMap,
  toInternalNotificationDto,
  type InternalNotificationApiRow,
  type InternalNotificationReadRow,
} from "@/lib/internal-notifications/presentation";
import { buildInternalNotificationVisibilityFilters, formatPostgrestInFilter } from "@/lib/internal-notifications/query";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NOTIFICATION_SELECT =
  "id, type, severity, title, body, href, entity_type, entity_id, certificado_id, cliente_id, target_role, target_user_id, actor_user_id, metadata, created_at, expires_at";

export async function GET() {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const nowIso = new Date().toISOString();
  const visibility = buildInternalNotificationVisibilityFilters({
    userId: auth.user.id,
    role: auth.user.role,
    nowIso,
  });
  const admin = createSupabaseAdminClient();
  const { data: rawReadStates, error: readStateError } = await admin
    .from("internal_notification_reads")
    .select("notification_id, user_id, read_at, dismissed_at")
    .eq("user_id", auth.user.id);

  if (readStateError) {
    return jsonError(
      "Nao foi possivel carregar o estado das notificacoes. Atualize a pagina e tente novamente.",
      500,
      "internal_notifications_state_load_failed",
    );
  }

  const readStates = (rawReadStates ?? []) as InternalNotificationReadRow[];
  const activeFilter = buildInternalNotificationIdFilter("active", readStates);
  const unreadFilter = buildInternalNotificationIdFilter("unread", readStates);

  const totalQuery = admin
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole);
  let activeQuery = admin
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole);
  let unreadQuery = admin
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole);
  let latestQuery = admin
    .from("internal_notifications")
    .select(NOTIFICATION_SELECT)
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole)
    .order("created_at", { ascending: false })
    .limit(1);

  if (activeFilter.excludeIds.length > 0) {
    activeQuery = activeQuery.not("id", "in", formatPostgrestInFilter(activeFilter.excludeIds));
    latestQuery = latestQuery.not("id", "in", formatPostgrestInFilter(activeFilter.excludeIds));
  }

  if (unreadFilter.excludeIds.length > 0) {
    unreadQuery = unreadQuery.not("id", "in", formatPostgrestInFilter(unreadFilter.excludeIds));
  }

  const [
    { count: totalCount, error: totalError },
    { count: activeCount, error: activeError },
    { count: unreadCount, error: unreadError },
    { data: latestData, error: latestError },
  ] = await Promise.all([totalQuery, activeQuery, unreadQuery, latestQuery]);

  if (totalError || activeError || unreadError || latestError) {
    return jsonError(
      "Nao foi possivel carregar o resumo das notificacoes internas. Atualize a pagina e tente novamente.",
      500,
      "internal_notifications_summary_failed",
    );
  }

  const latest = ((latestData ?? []) as InternalNotificationApiRow[])[0] ?? null;
  const readStateMap = createInternalNotificationReadStateMap(readStates);

  return NextResponse.json({
    total_count: totalCount ?? 0,
    active_count: activeCount ?? 0,
    unread_count: unreadCount ?? 0,
    latest_notification: latest ? toInternalNotificationDto(latest, readStateMap.get(latest.id)) : null,
  });
}
