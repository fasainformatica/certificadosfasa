import { NextRequest, NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto/secrets";
import { accessResultSchema, downloadError, hashDownloadSession, privateDownloadHeaders, unavailableDownload } from "@/lib/download/access";
import { verifyDownloadPassword } from "@/lib/download/password";
import { createPublicDownloadToken, hashPublicDownloadToken } from "@/lib/download/token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicDownloadPasswordSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = publicDownloadPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return downloadError("Senha incorreta ou link indisponivel.", 400, "senha_invalida");
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return unavailableDownload();
  try {
    const admin = createSupabaseAdminClient();
    const tokenHash = hashPublicDownloadToken(token);
    const { data: link, error } = await admin.from("links_download")
      .select("id, ativo, usado, senha_hash, tentativas_invalidas, bloqueado_ate")
      .eq("token_hash", tokenHash).maybeSingle();
    if (error) return downloadError("Nao foi possivel validar o acesso. Tente novamente.", 503);
    if (!link?.ativo || link.usado) return unavailableDownload();
    if (link.bloqueado_ate && Date.parse(link.bloqueado_ate) > Date.now()) {
      return downloadError("Muitas tentativas. Aguarde 15 minutos e tente novamente.", 429, "rate_limit");
    }
    const matches = await verifyDownloadPassword(parsed.data.senha_liberacao, link.senha_hash);
    const session = createPublicDownloadToken();
    const { data, error: claimError } = await admin.rpc("access_certificate_download", {
      p_token_hash: tokenHash, p_action: matches ? "authorize" : "failed_password",
      p_session_hash: hashDownloadSession(session), p_expected_password_hash: link.senha_hash,
    });
    if (claimError) return downloadError("Nao foi possivel liberar o acesso. Tente novamente.", 503);
    const result = accessResultSchema.parse(data);
    if (result.status === "rate_limited") return downloadError("Muitas tentativas. Aguarde 15 minutos.", 429, "rate_limit");
    if (result.status === "wrong_password") return downloadError("Senha incorreta ou link indisponivel.", 400, "senha_incorreta");
    if (result.status !== "authorized" || !result.ciphertext || !result.iv || !result.authTag) return unavailableDownload();
    const password = decryptSecret({ ciphertext: result.ciphertext, iv: result.iv, authTag: result.authTag });
    await admin.from("audit_logs").insert({ user_id: null, acao: "liberar_download_publico",
      certificado_id: result.certificate_id, metadata: { link_id: result.id } });
    return NextResponse.json({ session, senha_certificado: password, filename: result.filename }, { headers: privateDownloadHeaders });
  } catch {
    return downloadError("Nao foi possivel liberar o certificado. Solicite um novo link a equipe.", 503);
  }
}
