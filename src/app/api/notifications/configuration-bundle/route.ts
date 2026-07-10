import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { SETTINGS_ID, rebuildNotificationSchedule, validateTemplateContent } from "@/lib/notifications/engine";
import { notificationSettingsSchema, templateUpdateSchema } from "@/lib/notifications/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const configurationBundleSchema = z.object({
  settings: notificationSettingsSchema,
  expiring_template: z
    .object({
      id: z.string().uuid(),
      content: templateUpdateSchema.shape.content,
    })
    .optional(),
  expired_template: z
    .object({
      id: z.string().uuid(),
      content: templateUpdateSchema.shape.content,
    })
    .optional(),
});

function getRequestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = configurationBundleSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  try {
    if (parsed.data.expiring_template) {
      validateTemplateContent(parsed.data.expiring_template.content, "certificate_expiring");
    }

    if (parsed.data.expired_template) {
      validateTemplateContent(parsed.data.expired_template.content, "certificate_expired");
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Template invalido.", 400, "template_invalido");
  }

  const admin = createSupabaseAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("notification_settings")
    .upsert({ id: SETTINGS_ID, ...parsed.data.settings }, { onConflict: "id" })
    .select("*")
    .single();

  if (settingsError || !settings) {
    return jsonError("Falha ao salvar configuracoes de notificacao.", 500, "notification_settings_save");
  }

  const updatedTemplates = [];

  if (parsed.data.expiring_template) {
    const { data, error } = await admin
      .from("notification_templates")
      .update({ content: parsed.data.expiring_template.content })
      .eq("id", parsed.data.expiring_template.id)
      .eq("type", "certificate_expiring")
      .select("id, type, title, content, active, created_at, updated_at")
      .maybeSingle();

    if (error || !data) {
      return jsonError("Falha ao salvar o template de certificados a vencer.", 500, "template_salvar");
    }

    updatedTemplates.push(data);
  }

  if (parsed.data.expired_template) {
    const { data, error } = await admin
      .from("notification_templates")
      .update({ content: parsed.data.expired_template.content })
      .eq("id", parsed.data.expired_template.id)
      .eq("type", "certificate_expired")
      .select("id, type, title, content, active, created_at, updated_at")
      .maybeSingle();

    if (error || !data) {
      return jsonError("Falha ao salvar o template de certificados vencidos.", 500, "template_salvar");
    }

    updatedTemplates.push(data);
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "alterar_configuracoes_notificacoes",
    certificado_id: null,
    ip: getRequestIp(request),
    metadata: {
      campos: Object.keys(parsed.data.settings),
      templates: updatedTemplates.map((template) => template.id),
    },
  });

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({
    settings,
    templates: updatedTemplates,
    notificacao_rebuild: notificationRebuild,
  });
}
