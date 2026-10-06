import "server-only";

import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { createOneTimeDownloadPassword, hashDownloadPassword } from "@/lib/download/password";
import { createPublicDownloadToken, hashPublicDownloadToken } from "@/lib/download/token";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
const issuanceSchema = z.object({ status: z.string(), id: z.string().optional(), credentials: z.unknown().optional() });
const encryptedSchema = z.object({ ciphertext: z.string(), iv: z.string(), authTag: z.string() });
const credentialsSchema = z.object({ token: z.string().min(32), password: z.string().min(8) });

export function publicDownloadUrl(token: string) {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (site.username || site.password || (site.protocol !== "https:" &&
    !(site.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname)))) {
    throw new Error("Configure um endereco HTTPS valido para o sistema.");
  }
  return `${site.origin}/download/${token}`;
}

export async function issueDownloadLink(admin: Admin, certificateId: string, event?: { id: string; reservation_id: string }) {
  const token = createPublicDownloadToken();
  const password = createOneTimeDownloadPassword();
  // Check the configured origin before creating a usable credential.
  publicDownloadUrl(token);
  const { data, error } = await admin.rpc("issue_certificate_download", {
    p_certificate_id: certificateId,
    p_token_hash: hashPublicDownloadToken(token),
    p_password_hash: await hashDownloadPassword(password),
    ...(event ? { p_event_id: event.id, p_reservation_id: event.reservation_id,
      p_credentials: encryptSecret(JSON.stringify({ token, password })) } : {}),
  });
  if (error) throw new Error("Nao foi possivel preparar o link de download.");
  const result = issuanceSchema.parse(data);
  if (result.status === "text_only") return null;
  if (result.status !== "ready" || !result.id) throw new Error("O certificado ou o acesso nao esta mais disponivel.");
  const credentials = event
    ? credentialsSchema.parse(JSON.parse(decryptSecret(encryptedSchema.parse(result.credentials))))
    : { token, password };
  return { id: result.id, password: credentials.password, url: publicDownloadUrl(credentials.token) };
}

export async function prepareCertificateDownloadMessage(admin: Admin, event: {
  id: string; type: string; reservation_id: string; mensagem_renderizada: string;
}) {
  if (event.type !== "certificate_updated") return event.mensagem_renderizada;
  const { data, error } = await admin.from("notification_events").select("certificado_id")
    .eq("id", event.id).eq("reservation_id", event.reservation_id).maybeSingle();
  if (error || !data?.certificado_id) throw new Error("Nao foi possivel preparar o aviso do certificado.");
  const link = await issueDownloadLink(admin, data.certificado_id, event);
  if (!link) return event.mensagem_renderizada;
  return `${event.mensagem_renderizada}\n\nDownload: ${link.url}\nSenha de acesso: ${link.password}\n\n` +
    "Acesso individual de uso unico, valido por 7 dias. Nao compartilhe. " +
    "Ao informar a senha de acesso, voce vera a senha do certificado e o botao para baixar. " +
    "Apos baixar, o link sera bloqueado. Guarde a senha do certificado antes de fechar a pagina.";
}
