import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RetryRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: RetryRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_events")
    .update({
      status: "retry",
      next_retry_at: new Date().toISOString(),
      failed_at: null,
      error_message: null,
      device_id: null,
      reservation_id: null,
      reservation_token_hash: null,
      reserved_at: null,
      reservation_expires_at: null,
      processing_started_at: null,
    })
    .eq("id", id)
    .in("status", ["failed", "cancelled", "skipped"])
    .select("id, status, next_retry_at")
    .maybeSingle();

  if (error || !data) {
    return jsonError("Evento nao encontrado ou nao pode ser reenfileirado.", 404, "evento_retry");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "reenfileirar_notificacao",
    certificado_id: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    metadata: { notification_event_id: id },
  });

  return NextResponse.json({ event: data });
}
