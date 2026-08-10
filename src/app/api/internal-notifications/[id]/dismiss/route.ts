import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import { isUuid, toInternalNotificationReadStateDto } from "@/lib/internal-notifications/presentation";
import { buildInternalNotificationVisibilityFilters } from "@/lib/internal-notifications/query";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type InternalNotificationDismissRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: NextRequest, { params }: InternalNotificationDismissRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;

  if (!isUuid(id)) {
    return jsonError("Notificacao invalida.", 400, "internal_notification_invalid_id");
  }

  const nowIso = new Date().toISOString();
  const visibility = buildInternalNotificationVisibilityFilters({
    userId: auth.user.id,
    role: auth.user.role,
    nowIso,
  });
  const admin = createSupabaseAdminClient();
  const { data: notification, error: notificationError } = await admin
    .from("internal_notifications")
    .select("id")
    .eq("id", id)
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole)
    .maybeSingle();

  if (notificationError) {
    return jsonError(
      "Nao foi possivel buscar a notificacao interna. Atualize a pagina e tente novamente.",
      500,
      "internal_notification_lookup_failed",
    );
  }

  if (!notification) {
    return jsonError("Notificacao nao encontrada.", 404, "internal_notification_not_found");
  }

  const { data: existingState, error: existingStateError } = await admin
    .from("internal_notification_reads")
    .select("notification_id, user_id, read_at, dismissed_at")
    .eq("notification_id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existingStateError) {
    return jsonError(
      "Nao foi possivel carregar o estado da notificacao. Tente novamente.",
      500,
      "internal_notification_state_lookup_failed",
    );
  }

  if (existingState) {
    const { data: updatedState, error: updateError } = await admin
      .from("internal_notification_reads")
      .update({
        dismissed_at: existingState.dismissed_at ?? nowIso,
      })
      .eq("notification_id", id)
      .eq("user_id", auth.user.id)
      .select("notification_id, user_id, read_at, dismissed_at")
      .single();

    if (updateError) {
      return jsonError(
        "Nao foi possivel dispensar a notificacao. Tente novamente.",
        500,
        "internal_notification_dismiss_failed",
      );
    }

    return NextResponse.json({ state: toInternalNotificationReadStateDto(updatedState) });
  }

  const { data: insertedState, error: insertError } = await admin
    .from("internal_notification_reads")
    .insert({
      notification_id: id,
      user_id: auth.user.id,
      read_at: nowIso,
      dismissed_at: nowIso,
    })
    .select("notification_id, user_id, read_at, dismissed_at")
    .single();

  if (insertError) {
    return jsonError(
      "Nao foi possivel dispensar a notificacao. Tente novamente.",
      500,
      "internal_notification_dismiss_failed",
    );
  }

  return NextResponse.json({ state: toInternalNotificationReadStateDto(insertedState) });
}
