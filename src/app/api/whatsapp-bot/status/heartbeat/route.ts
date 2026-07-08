import { NextResponse } from "next/server";

import {
  SETTINGS_ID,
  clampNotificationDelaySettings,
  clampNotificationPollingInterval,
} from "@/lib/notifications/engine";
import { botHeartbeatSchema } from "@/lib/notifications/validation";
import { authenticateQwepRequest } from "@/lib/qwep/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function toDeviceStatus(whatsappStatus: string) {
  if (["connected", "sending", "syncing"].includes(whatsappStatus)) {
    return "active" as const;
  }

  if (whatsappStatus === "error") {
    return "error" as const;
  }

  return "disconnected" as const;
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const auth = await authenticateQwepRequest(request, {
    bodyText,
    rateLimitKey: "qwep-heartbeat",
  });

  if (!auth.ok) {
    return auth.response;
  }

  let jsonBody: unknown;

  try {
    jsonBody = JSON.parse(bodyText || "{}");
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const parsed = botHeartbeatSchema.safeParse(jsonBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const nextStatus = toDeviceStatus(parsed.data.whatsapp_status);
  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("whatsapp_devices")
    .update({
      status: nextStatus,
      connected_phone: parsed.data.connected_phone || null,
      app_version: parsed.data.app_version ?? auth.device.app_version,
      browser_name: parsed.data.browser_name ?? auth.device.browser_name,
      user_agent: parsed.data.user_agent ?? auth.device.user_agent,
      last_seen_at: now,
      last_connected_at: nextStatus === "active" ? now : auth.device.last_connected_at,
      last_disconnected_at: nextStatus === "disconnected" ? now : auth.device.last_disconnected_at,
    })
    .eq("id", auth.device.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Falha ao atualizar heartbeat." }, { status: 500 });
  }

  const shouldLog = auth.device.status !== nextStatus || parsed.data.last_error || nextStatus === "error";

  if (shouldLog) {
    await admin.from("whatsapp_device_logs").insert({
      device_id: auth.device.id,
      event_type: nextStatus === "error" ? "device_error" : "heartbeat_received",
      message: parsed.data.last_error || "Heartbeat recebido.",
      metadata: {
        whatsapp_status: parsed.data.whatsapp_status,
        local_queue_size: parsed.data.local_queue_size ?? 0,
      },
    });
  }

  const { data: settings } = await admin.from("notification_settings").select("*").eq("id", SETTINGS_ID).maybeSingle();
  const delaySettings = clampNotificationDelaySettings(settings);
  const pollingInterval = clampNotificationPollingInterval(settings?.polling_interval_seconds);

  return NextResponse.json({
    ok: true,
    device_status: updated.status,
    is_primary_sender: updated.is_primary_sender,
    server_time: now,
    config: {
      polling_interval_seconds: pollingInterval,
      heartbeat_interval_seconds: settings?.heartbeat_interval_seconds ?? 30,
      max_batch_size: 5,
      delay_minimo_segundos: delaySettings.delay_minimo_segundos,
      delay_maximo_segundos: delaySettings.delay_maximo_segundos,
      delay_min_seconds: delaySettings.delay_min_seconds,
      delay_max_seconds: delaySettings.delay_max_seconds,
      send_window_start: settings?.send_window_start ?? "08:00",
      send_window_end: settings?.send_window_end ?? "18:00",
    },
  });
}
