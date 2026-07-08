import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { verifyDownloadPassword } from "@/lib/download/password";
import { hashPublicDownloadToken } from "@/lib/download/token";
import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicDownloadPasswordSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;

type PublicDownloadRouteProps = {
  params: Promise<{
    token: string;
  }>;
};

type LinkedCertificate = {
  storage_path: string;
  nome_arquivo_original: string;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

function getUserAgent(request: NextRequest) {
  return request.headers.get("user-agent")?.slice(0, 512) ?? null;
}

function unavailable() {
  return jsonError("Este link ja foi utilizado ou esta invalido.", 404, "link_indisponivel");
}

export async function POST(request: NextRequest, { params }: PublicDownloadRouteProps) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = publicDownloadPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("Senha incorreta ou link indisponivel.", 400, "senha_invalida");
  }

  const admin = createSupabaseAdminClient();
  const tokenHash = hashPublicDownloadToken(token);
  const { data: link } = await admin
    .from("links_download")
    .select(
      "id, ativo, usado, senha_hash, certificado_id, tentativas_invalidas, bloqueado_ate, certificados(storage_path, nome_arquivo_original)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!link || !link.ativo || link.usado || !link.certificados) {
    return unavailable();
  }

  const now = Date.now();

  if (link.bloqueado_ate && new Date(link.bloqueado_ate).getTime() > now) {
    return jsonError("Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429, "rate_limit");
  }

  const passwordMatches = await verifyDownloadPassword(parsed.data.senha_liberacao, link.senha_hash);

  if (!passwordMatches) {
    const expiredBlock = link.bloqueado_ate && new Date(link.bloqueado_ate).getTime() <= now;
    const nextAttempts = (expiredBlock ? 0 : link.tentativas_invalidas) + 1;
    const blockedUntil =
      nextAttempts >= RATE_LIMIT_MAX_ATTEMPTS ? new Date(now + RATE_LIMIT_BLOCK_MS).toISOString() : null;

    await admin
      .from("links_download")
      .update({
        tentativas_invalidas: nextAttempts,
        bloqueado_ate: blockedUntil,
      })
      .eq("id", link.id)
      .eq("usado", false);

    return jsonError("Senha incorreta ou link indisponivel.", blockedUntil ? 429 : 400, "senha_incorreta");
  }

  const certificado = Array.isArray(link.certificados)
    ? (link.certificados[0] as LinkedCertificate | undefined)
    : (link.certificados as LinkedCertificate);

  if (!certificado) {
    return unavailable();
  }

  const { data: signedUrl, error: signedUrlError } = await admin.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUrl(certificado.storage_path, 60, {
      download: certificado.nome_arquivo_original,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    return jsonError("Falha ao gerar download temporario.", 502, "signed_url");
  }

  const usedAt = new Date(now).toISOString();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);
  const { data: claimedLink, error: claimError } = await admin
    .from("links_download")
    .update({
      ativo: false,
      usado: true,
      usado_em: usedAt,
      ip_uso: ip,
      user_agent_uso: userAgent,
      tentativas_invalidas: 0,
      bloqueado_ate: null,
    })
    .eq("id", link.id)
    .eq("ativo", true)
    .eq("usado", false)
    .select("id")
    .maybeSingle();

  if (claimError || !claimedLink) {
    return unavailable();
  }

  await admin.from("audit_logs").insert({
    user_id: null,
    acao: "download_publico",
    certificado_id: link.certificado_id,
    ip,
    metadata: {
      link_id: link.id,
      user_agent: userAgent,
      usado_em: usedAt,
    },
  });

  return NextResponse.json({
    download_url: signedUrl.signedUrl,
    expires_in: 60,
  });
}
