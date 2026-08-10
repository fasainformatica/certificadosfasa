import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import {
  buildInternalNotificationIdFilter,
  createInternalNotificationReadStateMap,
  isInternalNotificationSeverity,
  isInternalNotificationType,
  parseInternalNotificationState,
  toInternalNotificationDto,
  type InternalNotificationApiRow,
  type InternalNotificationReadRow,
} from "@/lib/internal-notifications/presentation";
import { buildInternalNotificationVisibilityFilters, formatPostgrestInFilter } from "@/lib/internal-notifications/query";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NOTIFICATION_SELECT =
  "id, type, severity, title, body, href, entity_type, entity_id, certificado_id, cliente_id, target_role, target_user_id, actor_user_id, metadata, created_at, expires_at";

function emptyResponse(page: number, pageSize: number, unreadCount: number) {
  return NextResponse.json({
    notifications: [],
    unread_count: unreadCount,
    pagination: createPaginationMeta(0, page, pageSize),
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const url = new URL(request.url);
  const pagination = parsePagination(url.searchParams);
  const state = parseInternalNotificationState(url.searchParams.get("state"));
  const type = url.searchParams.get("type");
  const severity = url.searchParams.get("severity");
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
  const stateFilter = buildInternalNotificationIdFilter(state, readStates);
  const unreadStateFilter = buildInternalNotificationIdFilter("unread", readStates);
  let unreadQuery = admin
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole);

  if (unreadStateFilter.excludeIds.length > 0) {
    unreadQuery = unreadQuery.not("id", "in", formatPostgrestInFilter(unreadStateFilter.excludeIds));
  }

  const { count: unreadCount, error: unreadCountError } = await unreadQuery;

  if (unreadCountError) {
    return jsonError(
      "Nao foi possivel contar as notificacoes nao lidas. Atualize a pagina e tente novamente.",
      500,
      "internal_notifications_unread_count_failed",
    );
  }

  if (stateFilter.shouldReturnEmpty) {
    return emptyResponse(pagination.page, pagination.pageSize, unreadCount ?? 0);
  }

  let query = admin
    .from("internal_notifications")
    .select(NOTIFICATION_SELECT, { count: "exact" })
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole)
    .order("created_at", { ascending: false })
    .range(pagination.from, pagination.to);

  if (isInternalNotificationType(type)) {
    query = query.eq("type", type);
  }

  if (isInternalNotificationSeverity(severity)) {
    query = query.eq("severity", severity);
  }

  if (stateFilter.includeIds.length > 0) {
    query = query.in("id", stateFilter.includeIds);
  }

  if (stateFilter.excludeIds.length > 0) {
    query = query.not("id", "in", formatPostgrestInFilter(stateFilter.excludeIds));
  }

  const { data, error, count } = await query;

  if (error) {
    return jsonError(
      "Nao foi possivel carregar as notificacoes internas. Atualize a pagina e tente novamente.",
      500,
      "internal_notifications_load_failed",
    );
  }

  const readStateMap = createInternalNotificationReadStateMap(readStates);
  const notifications = ((data ?? []) as InternalNotificationApiRow[]).map((notification) =>
    toInternalNotificationDto(notification, readStateMap.get(notification.id)),
  );

  return NextResponse.json({
    notifications,
    unread_count: unreadCount ?? 0,
    pagination: createPaginationMeta(count, pagination.page, pagination.pageSize),
  });
}
