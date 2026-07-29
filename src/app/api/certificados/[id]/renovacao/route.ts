import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import {
  CERTIFICATE_RENEWAL_STATUS_LABEL,
  isCertificateRenewalPlannable,
  isCertificateRenewalStatus,
} from "@/lib/certificados/renewal-status";
import { rebuildClientNotificationSchedule } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CertificateRenewalStatus } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type RenewalRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

const renewalSchema = z.object({
  renovacao_status: z.string().refine(isCertificateRenewalStatus, "Selecione uma situação de renovação válida."),
  renovacao_observacao: z.string().trim().max(500, "Use no máximo 500 caracteres.").optional().nullable(),
});

const CANCELABLE_STATUSES = ["pending", "retry"] as const;

export async function PATCH(request: NextRequest, { params }: RenewalRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const payload = await request.json().catch(() => null);
  const parsed = renewalSchema.safeParse(payload);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "validacao");
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: certificado, error: fetchError } = await admin
    .from("certificados")
    .select("id, cliente_id, renovacao_status, renovacao_observacao")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return jsonError("Não foi possível buscar o certificado.", 500, "certificado_erro");
  }

  if (!certificado) {
    return jsonError("Certificado não encontrado.", 404, "certificado_nao_encontrado");
  }

  const newStatus = parsed.data.renovacao_status as CertificateRenewalStatus;
  const oldStatus = certificado.renovacao_status;
  const now = new Date().toISOString();
  const observacao = parsed.data.renovacao_observacao?.trim() || null;
  const { data: updated, error: updateError } = await admin
    .from("certificados")
    .update({
      renovacao_status: newStatus,
      renovacao_observacao: observacao,
      renovacao_atualizado_em: now,
      renovacao_atualizado_por: auth.user.id,
    })
    .eq("id", id)
    .select("id, renovacao_status, renovacao_observacao, renovacao_atualizado_em")
    .single();

  if (updateError) {
    return jsonError("Não foi possível salvar a situação de renovação.", 500, "renovacao_salvar");
  }

  let eventosCancelados = 0;
  let notificacaoRebuild: Awaited<ReturnType<typeof rebuildClientNotificationSchedule>> | null = null;

  if (!isCertificateRenewalPlannable(newStatus)) {
    const { data: cancelledEvents, error: cancelError } = await admin
      .from("notification_events")
      .update({
        status: "cancelled",
        error_message: "Aviso cancelado porque o certificado saiu do acompanhamento de renovação.",
        updated_at: now,
      })
      .eq("certificado_id", id)
      .eq("type", "certificate_expiring")
      .in("status", [...CANCELABLE_STATUSES])
      .select("id");

    if (cancelError) {
      return jsonError("Situação salva, mas não foi possível cancelar os avisos pendentes.", 500, "avisos_cancelar");
    }

    eventosCancelados = cancelledEvents?.length ?? 0;
  } else if (!isCertificateRenewalPlannable(oldStatus)) {
    notificacaoRebuild = await rebuildClientNotificationSchedule({
      clienteId: certificado.cliente_id,
      triggeredBy: "system",
      userId: auth.user.id,
    });
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "alterar_situacao_renovacao_certificado",
    certificado_id: id,
    metadata: {
      renovacao_status_anterior: oldStatus,
      renovacao_status_novo: newStatus,
      renovacao_status_label: CERTIFICATE_RENEWAL_STATUS_LABEL[newStatus],
      eventos_cancelados: eventosCancelados,
      observacao_informada: Boolean(observacao),
    },
  });

  return NextResponse.json({
    ok: true,
    certificado: updated,
    eventos_cancelados: eventosCancelados,
    notificacao_rebuild: notificacaoRebuild,
    mensagem: isCertificateRenewalPlannable(newStatus)
      ? "Situação de renovação salva. O certificado permanece em acompanhamento."
      : "Situação de renovação salva. Avisos pendentes deste certificado foram cancelados.",
  });
}
