import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import { createOneTimeDownloadPassword, hashDownloadPassword } from "@/lib/download/password";
import { issueDownloadLink } from "@/lib/download/delivery";
import { privateDownloadHeaders } from "@/lib/download/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { downloadLinkActionSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

const LINK_SELECT =
  "id, ativo, usado, usado_em, invalidado_em, criado_em, atualizado_em, ip_uso, user_agent_uso, tentativas_invalidas, bloqueado_ate, expires_at";

type LinkRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || null;
}

async function assertCertificateExists(certificadoId: string) {
  const admin = createSupabaseAdminClient();
  const { data: certificado, error } = await admin
    .from("certificados")
    .select("id")
    .eq("id", certificadoId)
    .maybeSingle();

  return !error && Boolean(certificado);
}

async function createLink(certificadoId: string, userId: string, ip: string | null) {
  const admin = createSupabaseAdminClient();
  const exists = await assertCertificateExists(certificadoId);

  if (!exists) {
    return { response: jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado") };
  }

  let issued;
  try {
    issued = await issueDownloadLink(admin, certificadoId);
  } catch {
    return { response: jsonError("Nao foi possivel criar o link. Verifique a configuracao do sistema.", 503, "link_erro") };
  }
  if (!issued) return { response: jsonError("Nao foi possivel criar o link.", 503, "link_erro") };
  const { data: link, error } = await admin
    .from("links_download")
    .select(LINK_SELECT)
    .eq("id", issued.id)
    .single();

  if (error || !link) {
    return { response: jsonError("Falha ao gerar link de download.", 500, "link_erro") };
  }

  await admin.from("audit_logs").insert({
    user_id: userId,
    acao: "gerar_link",
    certificado_id: certificadoId,
    ip,
    metadata: {},
  });

  return { link: { ...link, public_url: issued.url }, generatedPassword: issued.password };
}

async function updateLinkPassword(certificadoId: string, userId: string, ip: string | null) {
  const admin = createSupabaseAdminClient();
  const generatedPassword = createOneTimeDownloadPassword();
  const passwordHash = await hashDownloadPassword(generatedPassword);
  const { data: link, error } = await admin
    .from("links_download")
    .update({
      senha_hash: passwordHash,
      tentativas_invalidas: 0,
      bloqueado_ate: null,
    })
    .eq("certificado_id", certificadoId)
    .eq("source", "manual")
    .eq("ativo", true)
    .eq("usado", false)
    .select(LINK_SELECT)
    .maybeSingle();

  if (error || !link) {
    return { response: jsonError("Não existe link ativo para atualizar.", 404, "link_nao_encontrado") };
  }

  await admin.from("audit_logs").insert({
    user_id: userId,
    acao: "atualizar_senha_link",
    certificado_id: certificadoId,
    ip,
    metadata: {
      link_id: link.id,
    },
  });

  return { link, generatedPassword };
}

export async function POST(request: NextRequest, { params }: LinkRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const result = await createLink(id, auth.user.id, getClientIp(request));

  if ("response" in result) {
    return result.response;
  }

  return NextResponse.json(
    {
      link: result.link,
      senha_gerada: result.generatedPassword,
    },
    { status: 201, headers: privateDownloadHeaders },
  );
}

export async function PATCH(request: NextRequest, { params }: LinkRouteProps) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = downloadLinkActionSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("Acao invalida.", 400, "acao_invalida");
  }

  const { id } = await params;
  const ip = getClientIp(request);

  if (parsed.data.action === "update_password") {
    const result = await updateLinkPassword(id, auth.user.id, ip);

    if ("response" in result) {
      return result.response;
    }

    return NextResponse.json({
      link: result.link,
      senha_gerada: result.generatedPassword,
    }, { headers: privateDownloadHeaders });
  }

  const admin = createSupabaseAdminClient();
  const { data: latestLink, error: latestError } = await admin.from("links_download")
    .select("id").eq("certificado_id", id).eq("source", "manual")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (latestError || !latestLink) return jsonError("Link manual nao encontrado.", 404, "link_nao_encontrado");
  const { data: link, error } = await admin
    .from("links_download")
    .update({ ativo: false, invalidado_em: new Date().toISOString() })
    .eq("id", latestLink.id)
    .eq("certificado_id", id)
    .eq("source", "manual")
    .is("invalidado_em", null)
    .select(LINK_SELECT)
    .maybeSingle();

  if (error || !link) {
    return jsonError("Falha ao invalidar link.", 500, "link_invalidar");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "invalidar_link",
    certificado_id: id,
    ip,
    metadata: {
      link_id: link.id,
    },
  });

  return NextResponse.json({ link });
}
