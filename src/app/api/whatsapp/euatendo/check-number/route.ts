import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { getSafeOperationalErrorMessage } from "@/lib/security/sensitive-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeBrazilianPhone, maskPhone } from "@/lib/utils/phone";
import { euAtendoCheckNumberSchema } from "@/lib/whatsapp/euatendo/schemas";
import { EuAtendoWhatsAppProvider } from "@/lib/whatsapp/euatendo";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({ key: `euatendo-check-number:${auth.user.id}:${ip}`, limit: 20, windowMs: 60_000 });

  if (!rateLimit.allowed) {
    return jsonError(`Aguarde ${rateLimit.retryAfterSeconds}s para verificar outro número.`, 429, "rate_limit");
  }

  const body = await request.json().catch(() => null);
  const parsed = euAtendoCheckNumberSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "validacao");
  }

  let normalizedNumber: string;

  try {
    normalizedNumber = normalizeBrazilianPhone(parsed.data.number);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Número inválido.", 400, "numero_invalido");
  }

  const admin = createSupabaseAdminClient();

  try {
    const provider = new EuAtendoWhatsAppProvider();
    const results = await provider.checkNumbers([normalizedNumber]);
    const result = results.find((item) => item.number.replace(/\D/g, "") === normalizedNumber) ?? results[0] ?? null;

    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      acao: "euatendo_check_number",
      metadata: {
        telefone: maskPhone(normalizedNumber),
        exists: result?.exists ?? null,
      },
    });

    return NextResponse.json({
      result: {
        number: maskPhone(normalizedNumber),
        exists: result?.exists ?? null,
        jid_found: Boolean(result?.jid),
      },
    });
  } catch (error) {
    const safeMessage = getSafeOperationalErrorMessage(error, "Nao foi possivel verificar o numero na euAtendo.");

    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      acao: "euatendo_check_number",
      metadata: {
        telefone: maskPhone(normalizedNumber),
        error: safeMessage,
      },
    });

    return jsonError(safeMessage, 502, "euatendo_check_number");
  }
}
