import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import {
  authenticateWindowsNotifier,
  buildWindowsNotifierVisibilityFilters,
} from "@/lib/internal-notifications/windows-notifier";
import { toInternalNotificationDto, type InternalNotificationApiRow } from "@/lib/internal-notifications/presentation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const NOTIFICATION_SELECT =
  "id, type, severity, title, body, href, entity_type, entity_id, certificado_id, cliente_id, target_role, target_user_id, actor_user_id, metadata, created_at, expires_at";

export async function GET(request: Request) {
  const auth = authenticateWindowsNotifier(request);

  if (!auth.ok) {
    return jsonError(auth.message, auth.status, auth.code);
  }

  const nowIso = new Date().toISOString();
  const visibility = buildWindowsNotifierVisibilityFilters({
    role: auth.context.role,
    nowIso,
  });
  const admin = createSupabaseAdminClient();
  const activeQuery = admin
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .or(visibility.expiresAt)
    .is("target_user_id", null)
    .or(visibility.targetRole);
  const latestQuery = admin
    .from("internal_notifications")
    .select(NOTIFICATION_SELECT)
    .or(visibility.expiresAt)
    .is("target_user_id", null)
    .or(visibility.targetRole)
    .order("created_at", { ascending: false })
    .limit(1);

  const [{ count: activeCount, error: activeError }, { data: latestData, error: latestError }] = await Promise.all([
    activeQuery,
    latestQuery,
  ]);

  if (activeError || latestError) {
    return jsonError(
      "Nao foi possivel carregar as notificacoes internas. Tente novamente em alguns instantes.",
      500,
      "windows_notifier_summary_failed",
    );
  }

  const latest = ((latestData ?? []) as InternalNotificationApiRow[])[0] ?? null;

  return NextResponse.json({
    active_count: activeCount ?? 0,
    latest_notification: latest ? toInternalNotificationDto(latest) : null,
    server_time: nowIso,
  });
}
