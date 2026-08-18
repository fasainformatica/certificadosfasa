import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import {
  authenticateWindowsNotifier,
  buildWindowsNotifierVisibilityFilters,
} from "@/lib/internal-notifications/windows-notifier";
import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WindowsCertificateFileRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function sanitizeDownloadFileName(value: string | null) {
  const fallback = "certificado-fasa.pfx";
  const normalized = value
    ?.replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.toLowerCase().endsWith(".pfx") ? normalized : `${normalized}.pfx`;
}

export async function GET(request: Request, { params }: WindowsCertificateFileRouteProps) {
  const auth = authenticateWindowsNotifier(request);

  if (!auth.ok) {
    return jsonError(auth.message, auth.status, auth.code);
  }

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return jsonError("Notificacao nao encontrada.", 404, "notification_not_found");
  }

  const nowIso = new Date().toISOString();
  const visibility = buildWindowsNotifierVisibilityFilters({
    role: auth.context.role,
    nowIso,
  });
  const admin = createSupabaseAdminClient();
  const { data: notification, error: notificationError } = await admin
    .from("internal_notifications")
    .select("id, type, certificado_id")
    .eq("id", id)
    .or(visibility.expiresAt)
    .is("target_user_id", null)
    .or(visibility.targetRole)
    .maybeSingle();

  if (
    notificationError ||
    !notification ||
    !notification.certificado_id ||
    (notification.type !== "certificate_created" && notification.type !== "certificate_updated")
  ) {
    return jsonError("Notificacao de certificado nao encontrada.", 404, "certificate_notification_not_found");
  }

  const { data: certificado, error: certificadoError } = await admin
    .from("certificados")
    .select("id, storage_path, nome_arquivo_original")
    .eq("id", notification.certificado_id)
    .maybeSingle();

  if (certificadoError || !certificado) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  const fileName = sanitizeDownloadFileName(certificado.nome_arquivo_original);
  const { data: signedUrl, error: signedUrlError } = await admin.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUrl(certificado.storage_path, 60, {
      download: fileName,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    return jsonError("Nao foi possivel preparar o download do certificado.", 502, "windows_certificate_signed_url_failed");
  }

  await admin.from("audit_logs").insert({
    user_id: null,
    acao: "download_certificado_windows_notifier",
    certificado_id: certificado.id,
    ip: null,
    metadata: {
      notification_id: notification.id,
      windows_notifier_role: auth.context.role,
    },
  });

  return NextResponse.redirect(signedUrl.signedUrl, 303);
}
