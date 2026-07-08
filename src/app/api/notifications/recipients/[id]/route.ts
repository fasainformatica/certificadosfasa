import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { rebuildNotificationSchedule } from "@/lib/notifications/engine";
import { notificationRecipientUpdateSchema } from "@/lib/notifications/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RecipientRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, { params }: RecipientRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = notificationRecipientUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const { id } = await params;
  const patch: {
    nome?: string;
    telefone?: string;
    telefone_normalizado?: string;
    ativo?: boolean;
  } = {};

  if (parsed.data.nome !== undefined) {
    patch.nome = parsed.data.nome;
  }

  if (parsed.data.telefone !== undefined) {
    patch.telefone = parsed.data.telefone;
    patch.telefone_normalizado = parsed.data.telefone;
  }

  if (parsed.data.ativo !== undefined) {
    patch.ativo = parsed.data.ativo;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_recipients")
    .update(patch)
    .eq("id", id)
    .select("id, nome, telefone, telefone_normalizado, ativo, created_at, updated_at")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return jsonError("Ja existe um destinatario com este WhatsApp.", 409, "telefone_duplicado");
    }

    return jsonError("Falha ao atualizar destinatario.", 500, "destinatario_atualizar");
  }

  if (!data) {
    return jsonError("Destinatario nao encontrado.", 404, "destinatario_nao_encontrado");
  }

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ recipient: data, notificacao_rebuild: notificationRebuild });
}

export async function DELETE(_request: NextRequest, { params }: RecipientRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("notification_recipients").delete().eq("id", id);

  if (error) {
    return jsonError("Falha ao remover destinatario.", 500, "destinatario_remover");
  }

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ ok: true, notificacao_rebuild: notificationRebuild });
}
