import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(ADMIN_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const paused = body?.paused === true;
  const reason = paused
    ? String(body?.reason || "Pausa manual acionada pelo administrador.").trim().slice(0, 200)
    : null;
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("notification_settings")
    .update({
      whatsapp_dispatch_paused: paused,
      whatsapp_dispatch_paused_at: paused ? now : null,
      whatsapp_dispatch_pause_reason: reason,
    })
    .eq("id", SETTINGS_ID)
    .select("*")
    .single();

  if (error || !data) {
    return jsonError("Não foi possível alterar a pausa operacional do WhatsApp.", 500, "whatsapp_pause_save");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: paused ? "pausar_whatsapp" : "retomar_whatsapp",
    certificado_id: null,
    ip: getClientIp(request),
    metadata: {
      paused,
      reason,
    },
  });

  return NextResponse.json({ settings: data });
}
