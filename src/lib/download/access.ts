import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

export const privateDownloadHeaders = {
  "Cache-Control": "no-store, private, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export const accessResultSchema = z.object({
  status: z.string(), id: z.string().optional(), certificate_id: z.string().optional(),
  filename: z.string().optional(), storage_path: z.string().optional(), retry_until: z.string().optional(),
  ciphertext: z.string().optional(), iv: z.string().optional(), authTag: z.string().optional(),
});
export function hashDownloadSession(session: string) {
  return createHash("sha256").update(`fasa-download-session:${session}`).digest("hex");
}
export function downloadError(message: string, status = 404, code = "link_indisponivel") {
  return NextResponse.json({ error: { message, code } }, { status, headers: privateDownloadHeaders });
}
export function unavailableDownload() {
  return downloadError("Este acesso ja foi utilizado, expirou ou foi invalidado. Solicite um novo link.");
}
