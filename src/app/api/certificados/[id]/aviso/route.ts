import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import { CERTIFICATE_RENEWAL_STATUS_LABEL, isCertificateRenewalPlannable } from "@/lib/certificados/renewal-status";
import {
  SETTINGS_ID,
  calculateDaysUntilExpiration,
  ensureDefaultNotificationTemplates,
  renderCertificateTemplate,
  validateTemplateContent,
} from "@/lib/notifications/engine";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeBrazilianPhone, maskPhone } from "@/lib/utils/phone";
import { getEuAtendoConfigStatus } from "@/lib/whatsapp/euatendo/config";
import { EuAtendoWhatsAppProvider } from "@/lib/whatsapp/euatendo/provider";

export const runtime = "nodejs";

type AvisoRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type ClienteRow = {
  id: string;
  nome_razao_social: string;
  cnpj: string;
  telefone: string | null;
  whatsapp: string | null;
  whatsapp_notifications_enabled: boolean | null;
};

type CertificadoRow = {
  id: string;
  cliente_id: string;
  cnpj: string;
  nome_titular: string;
  data_vencimento: string;
  status: string;
  renovacao_status: string | null;
  clientes: ClienteRow | ClienteRow[] | null;
};

function getCliente(certificado: CertificadoRow) {
  if (Array.isArray(certificado.clientes)) {
    return certificado.clientes[0] ?? null;
  }

  return certificado.clientes;
}

function statusFromErrorCode(errorCode: string | null) {
  if (errorCode === "RATE_LIMITED") {
    return 429;
  }

  if (
    errorCode === "AUTHENTICATION_ERROR" ||
    errorCode === "INSTANCE_NOT_FOUND" ||
    errorCode === "INSTANCE_DISCONNECTED" ||
    errorCode === "INVALID_NUMBER" ||
    errorCode === "PERMANENT_PROVIDER_ERROR"
  ) {
    return 400;
  }

  return 502;
}

function getDestinationPhone(cliente: ClienteRow) {
  const rawPhone = cliente.whatsapp?.trim() || cliente.telefone?.trim();

  if (!rawPhone) {
    throw new Error("Este cliente nao possui telefone WhatsApp cadastrado.");
  }

  return normalizeBrazilianPhone(rawPhone);
}

async function logManualAttempt({
  admin,
  userId,
  certificado,
  telefone,
  status,
  durationMs,
  errorCode = null,
  errorMessage = null,
  responseId = null,
  metadata = {},
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  certificado: CertificadoRow;
  telefone: string;
  status: "sent" | "failed" | "error";
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  responseId?: string | null;
  metadata?: Json;
}) {
  await Promise.all([
    admin.from("whatsapp_provider_logs").insert({
      provider: "euatendo",
      event_id: null,
      audience: "client",
      operation: "manual_certificate_notice",
      telefone_mascarado: maskPhone(telefone),
      template_type: "client_certificate_expiring",
      duration_ms: durationMs ?? null,
      status,
      attempt_count: 1,
      error_code: errorCode,
      error_message: errorMessage ? errorMessage.slice(0, 500) : null,
      request_id: randomUUID(),
      response_id: responseId,
      metadata,
    }),
    admin.from("audit_logs").insert({
      user_id: userId,
      acao: "enviar_aviso_manual_certificado",
      certificado_id: certificado.id,
      metadata: {
        provider: "euatendo",
        telefone: maskPhone(telefone),
        status,
        error_code: errorCode,
      },
    }),
  ]);
}

export async function POST(request: NextRequest, { params }: AvisoRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const providerConfig = getEuAtendoConfigStatus();

  if (!providerConfig.enabled) {
    return jsonError("A integração euAtendo não está ativa no ambiente.", 400, "euatendo_desativado");
  }

  if (!providerConfig.tokenConfigured || !providerConfig.instanceConfigured) {
    return jsonError("A integração euAtendo está incompleta. Configure token e instância no ambiente.", 400, "euatendo_config");
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({ key: `manual-certificate-notice:${auth.user.id}:${ip}`, limit: 6, windowMs: 60_000 });

  if (!rateLimit.allowed) {
    return jsonError(`Aguarde ${rateLimit.retryAfterSeconds}s para enviar outro aviso.`, 429, "rate_limit");
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: certificado, error: certificadoError } = await admin
    .from("certificados")
    .select("id, cliente_id, cnpj, nome_titular, data_vencimento, status, renovacao_status, clientes(id,nome_razao_social,cnpj,telefone,whatsapp,whatsapp_notifications_enabled)")
    .eq("id", id)
    .maybeSingle();

  if (certificadoError) {
    return jsonError("Falha ao buscar certificado.", 500, "certificado_erro");
  }

  if (!certificado) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  const typedCertificado = certificado as CertificadoRow;
  const cliente = getCliente(typedCertificado);

  if (!isCertificateRenewalPlannable(typedCertificado.renovacao_status)) {
    const label =
      typedCertificado.renovacao_status && typedCertificado.renovacao_status in CERTIFICATE_RENEWAL_STATUS_LABEL
        ? CERTIFICATE_RENEWAL_STATUS_LABEL[typedCertificado.renovacao_status as keyof typeof CERTIFICATE_RENEWAL_STATUS_LABEL]
        : "Fora do acompanhamento";

    return jsonError(`Não foi possível enviar o aviso. Este certificado está marcado como ${label}.`, 400, "renovacao_bloqueada");
  }

  if (!cliente) {
    return jsonError("Certificado sem cliente vinculado.", 400, "cliente_nao_vinculado");
  }

  if (cliente.whatsapp_notifications_enabled === false) {
    return jsonError("Os avisos WhatsApp para este cliente estao bloqueados.", 400, "cliente_bloqueado");
  }

  let telefoneDestino: string;

  try {
    telefoneDestino = getDestinationPhone(cliente);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Telefone WhatsApp inválido.", 400, "telefone_invalido");
  }

  const { data: settings } = await admin
    .from("notification_settings")
    .select("timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const timezone = settings?.timezone ?? "America/Sao_Paulo";
  const dias = calculateDaysUntilExpiration(typedCertificado.data_vencimento, timezone) ?? 0;
  const { clientExpiring } = await ensureDefaultNotificationTemplates();

  if (!clientExpiring?.content?.trim()) {
    return jsonError("Template de aviso ao cliente nao configurado.", 400, "template_vazio");
  }

  try {
    validateTemplateContent(clientExpiring.content, "client_certificate_expiring");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Template de aviso ao cliente inválido.", 400, "template_invalido");
  }

  const mensagemRenderizada = renderCertificateTemplate({
    content: clientExpiring.content,
    cliente,
    certificado: typedCertificado,
    dias,
    templateType: "client_certificate_expiring",
  });

  const provider = new EuAtendoWhatsAppProvider();
  const startedAt = Date.now();

  try {
    const health = await provider.checkHealth();

    if (!health.ok) {
      await logManualAttempt({
        admin,
        userId: auth.user.id,
        certificado: typedCertificado,
        telefone: telefoneDestino,
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: health.errorCode,
        errorMessage: health.errorMessage,
        metadata: { stage: "health_check" },
      });

      return jsonError(health.errorMessage ?? "A API euAtendo nao esta disponivel.", 503, health.errorCode ?? "euatendo_indisponivel");
    }

    const checkedNumbers = await provider.checkNumbers([telefoneDestino]);
    const checked = checkedNumbers.find((item) => item.number.replace(/\D/g, "") === telefoneDestino) ?? checkedNumbers[0] ?? null;

    if (checked?.exists === false) {
      await logManualAttempt({
        admin,
        userId: auth.user.id,
        certificado: typedCertificado,
        telefone: telefoneDestino,
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCode: "INVALID_NUMBER",
        errorMessage: "Número não confirmado como WhatsApp pela euAtendo.",
        metadata: { stage: "check_number" },
      });

      return jsonError("Número não confirmado como WhatsApp válido pela euAtendo.", 400, "numero_sem_whatsapp");
    }

    const result = await provider.sendText({
      eventId: typedCertificado.id,
      idempotencyKey: `manual:${typedCertificado.id}:${Date.now()}`,
      destinationNumber: telefoneDestino,
      renderedMessage: mensagemRenderizada,
    });
    const durationMs = Date.now() - startedAt;

    await logManualAttempt({
      admin,
      userId: auth.user.id,
      certificado: typedCertificado,
      telefone: telefoneDestino,
      status: result.accepted ? "sent" : "failed",
      durationMs,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      responseId: result.providerMessageId,
      metadata: {
        dias,
        http_status: result.httpStatus,
        provider_status: result.providerStatus,
        accepted: result.accepted,
      },
    });

    if (!result.accepted) {
      return jsonError(
        result.errorMessage ?? "Falha ao enviar aviso pela euAtendo.",
        statusFromErrorCode(result.errorCode),
        result.errorCode ?? "euatendo_send",
      );
    }

    return NextResponse.json({
      ok: true,
      mensagem: "Aviso enviado com sucesso.",
      result: {
        accepted: true,
        provider: result.provider,
        provider_status: result.providerStatus,
        provider_message_id: result.providerMessageId ? "[provider_message_id]" : null,
        dias,
        telefone: maskPhone(telefoneDestino),
      },
    });
  } catch (error) {
    await logManualAttempt({
      admin,
      userId: auth.user.id,
      certificado: typedCertificado,
      telefone: telefoneDestino,
      status: "error",
      durationMs: Date.now() - startedAt,
      errorCode: "manual_notice_error",
      errorMessage: error instanceof Error ? error.message : "Erro inesperado no envio manual.",
      metadata: { stage: "manual_notice" },
    });

    return jsonError("Não foi possível enviar o aviso manual pela euAtendo.", 502, "aviso_manual");
  }
}
