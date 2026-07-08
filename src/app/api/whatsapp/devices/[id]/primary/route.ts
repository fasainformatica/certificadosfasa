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

export async function PATCH(request: NextRequest, { params }: DeviceRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: device } = await admin.from("whatsapp_devices").select("id, status").eq("id", id).maybeSingle();

  if (!device || device.status === "revoked") {
    return jsonError("Dispositivo nao encontrado ou revogado.", 404, "device_nao_encontrado");
  }

  await admin.from("whatsapp_devices").update({ is_primary_sender: false }).neq("id", id);

  const { data, error } = await admin
    .from("whatsapp_devices")
    .update({ is_primary_sender: true })
    .eq("id", id)
    .select("id, name, status, is_primary_sender, last_seen_at, updated_at")
    .single();

  if (error || !data) {
    return jsonError("Falha ao definir emissor principal.", 500, "device_primary");
  }

  await admin.from("whatsapp_device_logs").insert({
    device_id: id,
    event_type: "primary_sender_changed",
    message: "Dispositivo definido como emissor principal.",
    metadata: { user_id: auth.user.id },
  });

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "definir_whatsapp_primary",
    certificado_id: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    metadata: { device_id: id },
  });

  return NextResponse.json({ device: data });
}
