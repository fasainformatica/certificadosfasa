import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type DeviceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, { params }: DeviceRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("whatsapp_devices")
    .update({
      status: "revoked",
      is_primary_sender: false,
      revoked_at: now,
    })
    .eq("id", id)
    .select("id, name, status, is_primary_sender, revoked_at")
    .maybeSingle();

  if (error || !data) {
    return jsonError("Falha ao revogar dispositivo.", 500, "device_revoke");
  }

  await admin.from("notification_events").update({
    status: "retry",
    next_retry_at: now,
    device_id: null,
    reservation_id: null,
    reservation_token_hash: null,
    reserved_at: null,
    reservation_expires_at: null,
    processing_started_at: null,
  }).eq("device_id", id).in("status", ["reserved", "processing"]);

  await admin.from("whatsapp_device_logs").insert({
    device_id: id,
    event_type: "device_revoked",
    message: "Dispositivo revogado pelo administrador.",
    metadata: { user_id: auth.user.id },
  });

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "revogar_dispositivo_whatsapp",
    certificado_id: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    metadata: { device_id: id },
  });

  return NextResponse.json({ device: data });
}
