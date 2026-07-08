import { NextResponse } from "next/server";

import {
  SETTINGS_ID,
  clampNotificationDelaySettings,
  clampNotificationPollingInterval,
} from "@/lib/notifications/engine";
import { botAuthValidateSchema } from "@/lib/notifications/validation";
import { hashDeviceToken, hashSigningSecret, safeEqual } from "@/lib/qwep/crypto";
import { checkRateLimit, getClientIp } from "@/lib/qwep/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = botAuthValidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const tokenHash = hashDeviceToken(parsed.data.token);
  const rateLimit = checkRateLimit({
    key: `qwep-auth:${getClientIp(request)}:${tokenHash}`,
    limit: 10,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: rateLimit.retryAfterSeconds },
      { status: 429 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("whatsapp_devices").select("*").eq("token_hash", tokenHash).maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Credenciais invalidas." }, { status: 401 });
  }

  if (["revoked", "expired", "error"].includes(data.status)) {
    await admin.from("whatsapp_device_logs").insert({
      device_id: data.id,
      event_type: "auth_failed",
      message: "Validacao negada por status do dispositivo.",
      metadata: { status: data.status },
    });

    return NextResponse.json({ error: "Dispositivo bloqueado." }, { status: 403 });
  }

  if (!safeEqual(hashSigningSecret(parsed.data.signing_secret), data.signing_secret_hash)) {
    await admin.from("whatsapp_device_logs").insert({
      device_id: data.id,
      event_type: "auth_failed",
      message: "Signing secret invalido.",
      metadata: {},
    });

    return NextResponse.json({ error: "Credenciais invalidas." }, { status: 401 });
  }

  const nextStatus = data.status === "pending_activation" || data.status === "created" ? "active" : data.status;
  const now = new Date().toISOString();
  const { data: updatedDevice, error: updateError } = await admin
    .from("whatsapp_devices")
    .update({
      status: nextStatus,
      app_version: parsed.data.app_version ?? data.app_version,
      browser_name: parsed.data.browser_name ?? data.browser_name,
      user_agent: parsed.data.user_agent ?? data.user_agent,
      last_seen_at: now,
    })
    .eq("id", data.id)
    .select("*")
    .single();

  if (updateError || !updatedDevice) {
    return NextResponse.json({ error: "Falha ao atualizar dispositivo." }, { status: 500 });
  }

  if (data.status === "pending_activation" || data.status === "created") {
    await admin.from("whatsapp_device_logs").insert({
      device_id: data.id,
      event_type: "device_activated",
      message: "Dispositivo ativado pelo bot.",
      metadata: {
        app_version: parsed.data.app_version ?? null,
        browser_name: parsed.data.browser_name ?? null,
      },
    });
  }

  const { data: settings } = await admin.from("notification_settings").select("*").eq("id", SETTINGS_ID).maybeSingle();
  const delaySettings = clampNotificationDelaySettings(settings);
  const pollingInterval = clampNotificationPollingInterval(settings?.polling_interval_seconds);

  return NextResponse.json({
    device_id: updatedDevice.id,
    company_name: "Fasa Informatica",
    status: updatedDevice.status,
    is_primary_sender: updatedDevice.is_primary_sender,
    hmac_required: true,
    polling_interval_seconds: pollingInterval,
    heartbeat_interval_seconds: settings?.heartbeat_interval_seconds ?? 30,
    max_batch_size: 5,
    delay_minimo_segundos: delaySettings.delay_minimo_segundos,
    delay_maximo_segundos: delaySettings.delay_maximo_segundos,
    delay_min_seconds: delaySettings.delay_min_seconds,
    delay_max_seconds: delaySettings.delay_max_seconds,
    send_window_start: settings?.send_window_start ?? "08:00",
    send_window_end: settings?.send_window_end ?? "18:00",
    server_time: now,
  });
}
