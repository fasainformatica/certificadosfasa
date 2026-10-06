import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accessResultSchema, downloadError, hashDownloadSession, privateDownloadHeaders, unavailableDownload } from "@/lib/download/access";
import { hashPublicDownloadToken } from "@/lib/download/token";
import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("download"), session: z.string().regex(/^[A-Za-z0-9_-]{40,128}$/) }),
  z.object({ action: z.literal("complete"), session: z.string().regex(/^[A-Za-z0-9_-]{40,128}$/), transfer_id: z.string().uuid() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) return unavailableDownload();
  try {
    const admin = createSupabaseAdminClient();
    const transferId = parsed.data.action === "complete" ? parsed.data.transfer_id : randomUUID();
    const authorization = {
      p_token_hash: hashPublicDownloadToken(token), p_session_hash: hashDownloadSession(parsed.data.session),
      p_transfer_id: transferId,
    };
    const { data, error } = await admin.rpc("access_certificate_download", { ...authorization, p_action: parsed.data.action });
    if (error) return downloadError("Nao foi possivel acessar o arquivo. Tente novamente.", 503);
    const result = accessResultSchema.parse(data);
    if (result.status === "complete") return NextResponse.json({ completed: true }, { headers: privateDownloadHeaders });
    if (result.status === "busy") return downloadError("Uma transferencia esta em andamento. Aguarde 30 segundos antes de tentar novamente.", 409, "download_em_andamento");
    if (result.status !== "ready" || !result.storage_path) return unavailableDownload();
    const file = await admin.storage.from(CERTIFICATES_BUCKET).download(result.storage_path);
    if (file.error || !file.data) {
      await admin.rpc("access_certificate_download", { ...authorization, p_action: "release" });
      return downloadError("Nao foi possivel obter o arquivo. Tente novamente nesta pagina em ate 2 minutos.", 502, "storage_indisponivel");
    }
    await admin.from("audit_logs").insert({ user_id: null, acao: "download_publico",
      certificado_id: result.certificate_id, metadata: { link_id: result.id, transfer_id: transferId } });
    const filename = (result.filename ?? "certificado.pfx").replace(/[\r\n"\\/\x00-\x1f]/g, "_");
    return new NextResponse(file.data.stream(), { headers: {
      ...privateDownloadHeaders, "Content-Type": "application/x-pkcs12",
      "Content-Disposition": `attachment; filename="certificado.pfx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Transfer-Id": transferId, "X-Download-Retry-Until": result.retry_until ?? "",
      "Content-Length": String(file.data.size),
    } });
  } catch {
    return downloadError("Nao foi possivel concluir o download. Tente novamente nesta pagina em ate 2 minutos.", 503);
  }
}
