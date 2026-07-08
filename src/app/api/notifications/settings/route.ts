import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { SETTINGS_ID, rebuildNotificationSchedule } from "@/lib/notifications/engine";
import { notificationSettingsSchema } from "@/lib/notifications/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser(["admin", "financeiro"]);

  if ("response" in auth) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("notification_settings").select("*").eq("id", SETTINGS_ID).single();

  if (error || !data) {
    return jsonError("Falha ao carregar configuracoes de notificacao.", 500, "notification_settings");
  }

  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = notificationSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_settings")
    .upsert({ id: SETTINGS_ID, ...parsed.data }, { onConflict: "id" })
    .select("*")
    .single();

  if (error || !data) {
    return jsonError("Falha ao salvar configuracoes de notificacao.", 500, "notification_settings_save");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "alterar_notificacoes",
    certificado_id: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    metadata: { campos: Object.keys(parsed.data) },
  });

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ settings: data, notificacao_rebuild: notificationRebuild });
}
