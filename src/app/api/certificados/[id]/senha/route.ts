import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import { decryptSecret } from "@/lib/crypto/secrets";
import { verifyDownloadPassword } from "@/lib/download/password";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revealCertificatePasswordSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CertificatePasswordRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || null;
}

async function auditPasswordReveal({
  admin,
  userId,
  certificadoId,
  ip,
  resultado,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  certificadoId: string;
  ip: string | null;
  resultado: "sucesso" | "senha_admin_incorreta" | "certificado_nao_encontrado" | "falha_decriptografia";
}) {
  await admin.from("audit_logs").insert({
    user_id: userId,
    acao: "visualizar_senha_certificado",
    certificado_id: certificadoId,
    ip,
    metadata: { resultado },
  });
}

export async function POST(request: NextRequest, { params }: CertificatePasswordRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  const body = await request.json().catch(() => null);
  const parsed = revealCertificatePasswordSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Informe a senha administrativa.", 400, "validacao");
  }

  const admin = createSupabaseAdminClient();
  const ip = getClientIp(request);
  const { data: settings, error: settingsError } = await admin
    .from("configuracoes_sistema")
    .select("senha_admin_certificado_hash")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (settingsError || !settings?.senha_admin_certificado_hash) {
    return jsonError(
      "Senha administrativa nao configurada. Configure o hash no Supabase antes de usar esta acao.",
      409,
      "senha_admin_nao_configurada",
    );
  }

  let passwordMatches = false;

  try {
    passwordMatches = await verifyDownloadPassword(parsed.data.senha_admin, settings.senha_admin_certificado_hash);
  } catch {
    return jsonError(
      "Senha administrativa nao configurada corretamente. Atualize o hash no Supabase.",
      409,
      "senha_admin_hash_invalido",
    );
  }

  if (!passwordMatches) {
    await auditPasswordReveal({
      admin,
      userId: auth.user.id,
      certificadoId: id,
      ip,
      resultado: "senha_admin_incorreta",
    });
    return jsonError("Senha administrativa incorreta.", 403, "senha_admin_incorreta");
  }

  const { data: certificado, error: certificadoError } = await admin
    .from("certificados")
    .select("id, senha_ciphertext, senha_iv, senha_auth_tag")
    .eq("id", id)
    .maybeSingle();

  if (certificadoError || !certificado) {
    await auditPasswordReveal({
      admin,
      userId: auth.user.id,
      certificadoId: id,
      ip,
      resultado: "certificado_nao_encontrado",
    });
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  try {
    const senha = decryptSecret({
      ciphertext: certificado.senha_ciphertext,
      iv: certificado.senha_iv,
      authTag: certificado.senha_auth_tag,
    });

    await auditPasswordReveal({
      admin,
      userId: auth.user.id,
      certificadoId: id,
      ip,
      resultado: "sucesso",
    });

    return NextResponse.json({ senha });
  } catch {
    await auditPasswordReveal({
      admin,
      userId: auth.user.id,
      certificadoId: id,
      ip,
      resultado: "falha_decriptografia",
    });
    return jsonError("Nao foi possivel revelar a senha deste certificado.", 500, "senha_certificado_decriptar");
  }
}
