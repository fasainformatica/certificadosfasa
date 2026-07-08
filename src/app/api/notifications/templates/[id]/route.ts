import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { templateUpdateSchema } from "@/lib/notifications/validation";
import { rebuildNotificationSchedule, validateTemplateContent } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type TemplateRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: NextRequest, { params }: TemplateRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = templateUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: currentTemplate, error: currentError } = await admin
    .from("notification_templates")
    .select("id, type")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !currentTemplate) {
    return jsonError("Template nao encontrado.", 404, "template_nao_encontrado");
  }

  try {
    validateTemplateContent(
      parsed.data.content,
      currentTemplate.type === "certificate_expired" ? "certificate_expired" : "certificate_expiring",
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Template invalido.", 400, "template_invalido");
  }

  const { data, error } = await admin
    .from("notification_templates")
    .update({ content: parsed.data.content })
    .eq("id", id)
    .select("id, type, title, content, active, created_at, updated_at")
    .maybeSingle();

  if (error || !data) {
    return jsonError("Falha ao salvar template.", 500, "template_salvar");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "alterar_template_whatsapp",
    certificado_id: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    metadata: { template_id: id },
  });

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ template: data, notificacao_rebuild: notificationRebuild });
}
