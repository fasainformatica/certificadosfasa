import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CertificateFileRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || null;
}

function getUserAgent(request: NextRequest) {
  return request.headers.get("user-agent")?.slice(0, 512) ?? null;
}

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

export async function GET(request: NextRequest, { params }: CertificateFileRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  const admin = createSupabaseAdminClient();
  const { data: certificado, error } = await admin
    .from("certificados")
    .select("id, storage_path, nome_arquivo_original")
    .eq("id", id)
    .maybeSingle();

  if (error || !certificado) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  const fileName = sanitizeDownloadFileName(certificado.nome_arquivo_original);
  const { data: signedUrl, error: signedUrlError } = await admin.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUrl(certificado.storage_path, 60, {
      download: fileName,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    return jsonError("Nao foi possivel preparar o download do certificado.", 502, "certificate_file_signed_url_failed");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "download_certificado_interno",
    certificado_id: id,
    ip: getClientIp(request),
    metadata: {
      expires_in_seconds: 60,
      user_agent: getUserAgent(request),
    },
  });

  return NextResponse.redirect(signedUrl.signedUrl, 303);
}
