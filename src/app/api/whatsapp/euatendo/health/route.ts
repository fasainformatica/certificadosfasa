import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { getSafeOperationalErrorMessage } from "@/lib/security/sensitive-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEuAtendoConfigStatus, EuAtendoWhatsAppProvider } from "@/lib/whatsapp/euatendo";
import { getActiveNotificationProvider } from "@/lib/whatsapp/euatendo/config";
import { hasRecentExtensionContact } from "@/lib/whatsapp/extension/heartbeat";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";
import { maskPhone } from "@/lib/utils/phone";

export const runtime = "nodejs";

function maskInstancePhone(value: string | null | undefined) {
  return value ? maskPhone(value) : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit({ key: `euatendo-health:${auth.user.id}:${ip}`, limit: 12, windowMs: 60_000 });

  if (!rateLimit.allowed) {
    return jsonError(`Aguarde ${rateLimit.retryAfterSeconds}s para testar novamente.`, 429, "rate_limit");
  }

  const configured = getEuAtendoConfigStatus();
  const admin = createSupabaseAdminClient();

  if (getActiveNotificationProvider() === WHATSAPP_EXTENSION_PROVIDER) {
    const { data, error } = await admin.from("whatsapp_dispatcher_state").select("updated_at")
      .eq("provider", WHATSAPP_EXTENSION_PROVIDER).maybeSingle();

    if (error) {
      return jsonError("Não foi possível consultar o último contato da extensão.", 503, "extensao_contato");
    }

    return NextResponse.json({
      health: {
        provider: WHATSAPP_EXTENSION_PROVIDER,
        ok: hasRecentExtensionContact(data?.updated_at),
        lastContactAt: data?.updated_at ?? null,
        latencyMs: null,
        instance: null,
        listedInstance: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  try {
    const provider = new EuAtendoWhatsAppProvider();
    const health = await provider.checkHealth();
    const safeHealth = {
      ...health,
      instance: health.instance
        ? {
            ...health.instance,
            phoneNumber: maskInstancePhone(health.instance.phoneNumber),
          }
        : null,
      listedInstance: health.listedInstance
        ? {
            ...health.listedInstance,
            phoneNumber: maskInstancePhone(health.listedInstance.phoneNumber),
          }
        : null,
    };

    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      acao: "euatendo_health_check",
      metadata: {
        ok: safeHealth.ok,
        error_code: safeHealth.errorCode,
        latency_ms: safeHealth.latencyMs,
      },
    });

    return NextResponse.json({ health: safeHealth });
  } catch (error) {
    const safeMessage = getSafeOperationalErrorMessage(error, "Nao foi possivel testar a API euAtendo.");

    await admin.from("audit_logs").insert({
      user_id: auth.user.id,
      acao: "euatendo_health_check",
      metadata: {
        ok: false,
        error: safeMessage,
      },
    });

    return NextResponse.json({
      health: {
        provider: "euatendo",
        configured,
        latencyMs: null,
        ok: false,
        instance: null,
        listedInstance: null,
        errorCode: "CONFIGURATION_ERROR",
        errorMessage: safeMessage,
      },
    });
  }
}
