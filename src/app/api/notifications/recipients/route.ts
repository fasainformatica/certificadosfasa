import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { rebuildNotificationSchedule } from "@/lib/notifications/engine";
import { notificationRecipientSchema } from "@/lib/notifications/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser(["admin", "financeiro"]);

  if ("response" in auth) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_recipients")
    .select("id, nome, telefone, telefone_normalizado, ativo, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError("Falha ao listar destinatarios.", 500, "destinatarios_erro");
  }

  return NextResponse.json({ recipients: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = notificationRecipientSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const admin = createSupabaseAdminClient();
  const { count } = await admin.from("notification_recipients").select("id", { count: "exact", head: true });

  if ((count ?? 0) >= 5) {
    return jsonError("Cadastre no maximo 5 destinatarios de aviso.", 409, "limite_destinatarios");
  }

  const { data, error } = await admin
    .from("notification_recipients")
    .insert({
      nome: parsed.data.nome,
      telefone: parsed.data.telefone,
      telefone_normalizado: parsed.data.telefone,
      ativo: parsed.data.ativo,
    })
    .select("id, nome, telefone, telefone_normalizado, ativo, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("Ja existe um destinatario com este WhatsApp.", 409, "telefone_duplicado");
    }

    return jsonError("Falha ao salvar destinatario.", 500, "destinatario_salvar");
  }

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ recipient: data, notificacao_rebuild: notificationRebuild }, { status: 201 });
}
