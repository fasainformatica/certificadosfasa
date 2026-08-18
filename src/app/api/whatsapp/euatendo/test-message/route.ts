import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { getSafeOperationalErrorMessage } from "@/lib/security/sensitive-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeBrazilianPhone, maskPhone } from "@/lib/utils/phone";
import { euAtendoTestMessageSchema } from "@/lib/whatsapp/euatendo/schemas";
import { EuAtendoWhatsAppProvider } from "@/lib/whatsapp/euatendo";
import {
  completeEuAtendoSendCadenceSlot,
  formatEuAtendoCadenceWaitMessage,
  reserveEuAtendoSendCadenceSlot,
} from "@/lib/whatsapp/euatendo/dispatcher";
import type { WhatsAppSendResult } from "@/lib/whatsapp/euatendo/types";

export const runtime = "nodejs";

const blockedTerms = ["senha do certificado", "senha pfx", "storage_path", "cert_encryption_key", "service_role", ".pfx"];

function containsSensitiveText(message: string) {
  const lower = message.toLowerCase();
  return blockedTerms.some((term) => lower.includes(term));
}

function statusFromErrorCode(errorCode: string | null) {
  if (errorCode === "RATE_LIMITED") {
    return 429;
  }

  if (
    errorCode === "AUTHENTICATION_ERROR" ||
    errorCode === "INSTANCE_NOT_FOUND" ||
    errorCode === "INSTANCE_DISCONNECTED" ||
    errorCode === "INVALID_NUMBER" ||
    errorCode === "PERMANENT_PROVIDER_ERROR"
  ) {
    return 400;
  }

  return 502;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({ key: `euatendo-test-message:${auth.user.id}:${ip}`, limit: 5, windowMs: 60_000 });

  if (!rateLimit.allowed) {
    return jsonError(`Aguarde ${rateLimit.retryAfterSeconds}s para enviar outro teste.`, 429, "rate_limit");
  }

  const body = await request.json().catch(() => null);
  const parsed = euAtendoTestMessageSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "validacao");
  }

  if (containsSensitiveText(parsed.data.message)) {
    return jsonError("A mensagem de teste não pode conter senha, PFX, caminho de armazenamento ou segredos.", 400, "mensagem_sensivel");
  }

  let normalizedNumber: string;

  try {
    normalizedNumber = normalizeBrazilianPhone(parsed.data.number);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Número inválido.", 400, "numero_invalido");
  }

  const admin = createSupabaseAdminClient();
  const provider = new EuAtendoWhatsAppProvider();

  try {
    if (parsed.data.check_number) {
      const checked = await provider.checkNumbers([normalizedNumber]);
      const result = checked.find((item) => item.number.replace(/\D/g, "") === normalizedNumber) ?? checked[0] ?? null;

      if (result?.exists === false) {
        await admin.from("audit_logs").insert({
          user_id: auth.user.id,
          acao: "euatendo_test_message",
          metadata: {
            telefone: maskPhone(normalizedNumber),
            sent: false,
            reason: "invalid_number",
          },
        });

        return jsonError("Número não confirmado como WhatsApp válido pela euAtendo.", 400, "numero_sem_whatsapp");
      }
    }

    const cadenceSlot = await reserveEuAtendoSendCadenceSlot(admin);

    if (!cadenceSlot.allowed) {
      return jsonError(formatEuAtendoCadenceWaitMessage(cadenceSlot), 429, "cadencia_whatsapp");
    }

    let result: WhatsAppSendResult | null = null;
    let cadenceReleaseError: string | null = null;

    try {
      result = await provider.sendText({
        eventId: "manual_test",
        idempotencyKey: null,
        destinationNumber: normalizedNumber,
        renderedMessage: parsed.data.message,
      });
    } finally {
      try {
        await completeEuAtendoSendCadenceSlot({
          admin,
          slot: cadenceSlot,
          retryAfterSeconds: result?.retryAfterSeconds ?? null,
        });
      } catch (error) {
        cadenceReleaseError = getSafeOperationalErrorMessage(error, "Falha ao liberar cadencia do WhatsApp.");
      }
    }

    if (!result) {
      return jsonError("Nao foi possivel enviar a mensagem de teste pela euAtendo.", 502, "euatendo_test_message");
    }

    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      acao: "euatendo_test_message",
      metadata: {
        telefone: maskPhone(normalizedNumber),
        sent: result.accepted,
        provider_message_id: result.providerMessageId ? "[provider_message_id]" : null,
        provider_status: result.providerStatus,
        http_status: result.httpStatus,
        error_code: result.errorCode,
        cadence_release_error: cadenceReleaseError,
      },
    });

    if (!result.accepted) {
      return jsonError(result.errorMessage ?? "Falha ao enviar mensagem de teste pela euAtendo.", statusFromErrorCode(result.errorCode), result.errorCode ?? "euatendo_send");
    }

    return NextResponse.json({
      result: {
        accepted: true,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        provider_status: result.providerStatus,
        chat_id: result.chatId ? maskPhone(result.chatId) : null,
        http_status: result.httpStatus,
        response: result.sanitizedResponse,
      },
    });
  } catch (error) {
    const safeMessage = getSafeOperationalErrorMessage(error, "Nao foi possivel enviar a mensagem de teste pela euAtendo.");

    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      acao: "euatendo_test_message",
      metadata: {
        telefone: maskPhone(normalizedNumber),
        sent: false,
        error: safeMessage,
      },
    });

    return jsonError(safeMessage, 502, "euatendo_test_message");
  }
}
