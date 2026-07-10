import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";

import {
  SETTINGS_ID,
  calculateReservationTtlSeconds,
  clampNotificationDelaySettings,
  clampNotificationPollingInterval,
  getTodayDateString,
} from "@/lib/notifications/engine";
import { authenticateQwepRequest } from "@/lib/qwep/auth";
import { hashReservationToken } from "@/lib/qwep/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ReservedMessage = {
  id: string;
  type: string;
  telefone_destino: string;
  mensagem_renderizada: string;
  idempotency_key: string | null;
  reservation_id: string;
  reservation_token: string;
  attempt_count: number;
  max_attempts: number;
};

type CandidateEvent = {
  id: string;
  type: string;
  telefone_destino: string;
  mensagem_renderizada: string;
  idempotency_key: string | null;
  recipient_id: string | null;
  certificado_id: string | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  reservation_expires_at: string | null;
};

function isRetryDue(event: CandidateEvent, now: Date) {
  return event.status !== "retry" || !event.next_retry_at || new Date(event.next_retry_at).getTime() <= now.getTime();
}

function isReservationAvailable(event: CandidateEvent, now: Date) {
  return !event.reservation_expires_at || new Date(event.reservation_expires_at).getTime() < now.getTime();
}

async function reservePendingMessagesFallback({
  admin,
  deviceId,
  batchLimit,
  today,
  reservationTtlSeconds,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  deviceId: string;
  batchLimit: number;
  today: string;
  reservationTtlSeconds: number;
}) {
  const now = new Date();
  const safeLimit = Math.min(Math.max(batchLimit, 1), 5);
  const { data: candidates, error: candidatesError } = await admin
    .from("notification_events")
    .select(
      "id, type, telefone_destino, mensagem_renderizada, idempotency_key, recipient_id, certificado_id, status, attempt_count, max_attempts, next_retry_at, reservation_expires_at",
    )
    .eq("provider", "whatsapp_desktop")
    .in("status", ["pending", "retry"])
    .lte("send_date", today)
    .order("send_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(safeLimit * 5, 10));

  if (candidatesError) {
    throw new Error(candidatesError.message);
  }

  const rows = (candidates ?? []) as CandidateEvent[];
  const recipientIds = Array.from(new Set(rows.map((event) => event.recipient_id).filter(Boolean))) as string[];
  const certificadoIds = Array.from(new Set(rows.map((event) => event.certificado_id).filter(Boolean))) as string[];
  const recipients = new Set<string>();
  const activeCertificados = new Set<string>();

  if (recipientIds.length > 0) {
    const { data, error } = await admin
      .from("notification_recipients")
      .select("id")
      .in("id", recipientIds)
      .eq("ativo", true);

    if (error) {
      throw new Error(error.message);
    }

    for (const recipient of data ?? []) {
      recipients.add(recipient.id);
    }
  }

  if (certificadoIds.length > 0) {
    const { data, error } = await admin
      .from("certificados")
      .select("id")
      .in("id", certificadoIds)
      .in("status", ["ativo", "vencendo"]);

    if (error) {
      throw new Error(error.message);
    }

    for (const certificado of data ?? []) {
      activeCertificados.add(certificado.id);
    }
  }

  const eligible = rows
    .filter((event) => event.recipient_id && recipients.has(event.recipient_id))
    .filter((event) => event.attempt_count < event.max_attempts)
    .filter((event) => isRetryDue(event, now))
    .filter((event) => isReservationAvailable(event, now))
    .filter((event) => {
      if (event.type === "certificate_expiring") {
        return Boolean(event.certificado_id && activeCertificados.has(event.certificado_id));
      }

      if (event.type === "certificate_expired") {
        return event.certificado_id === null;
      }

      return true;
    })
    .slice(0, safeLimit);

  const reserved: ReservedMessage[] = [];

  for (const event of eligible) {
    const reservationId = randomUUID();
    const reservationToken = randomBytes(32).toString("base64url");
    const reservationTokenHash = hashReservationToken(reservationToken);
    const { data: updated, error } = await admin
      .from("notification_events")
      .update({
        status: "reserved",
        device_id: deviceId,
        reservation_id: reservationId,
        reservation_token_hash: reservationTokenHash,
        reserved_at: now.toISOString(),
        reservation_expires_at: new Date(now.getTime() + reservationTtlSeconds * 1000).toISOString(),
        processing_started_at: null,
        attempt_count: event.attempt_count + 1,
        error_message: null,
      })
      .eq("id", event.id)
      .in("status", ["pending", "retry"])
      .select("id, type, telefone_destino, mensagem_renderizada, idempotency_key, reservation_id, attempt_count, max_attempts")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!updated?.reservation_id) {
      continue;
    }

    reserved.push({
      id: updated.id,
      type: updated.type,
      telefone_destino: updated.telefone_destino,
      mensagem_renderizada: updated.mensagem_renderizada,
      idempotency_key: updated.idempotency_key,
      reservation_id: updated.reservation_id,
      reservation_token: reservationToken,
      attempt_count: updated.attempt_count,
      max_attempts: updated.max_attempts,
    });
  }

  return reserved;
}

export async function GET(request: Request) {
  const auth = await authenticateQwepRequest(request, {
    bodyText: "",
    requirePrimarySender: true,
    rateLimitKey: "qwep-pending",
  });

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "5");
  const batchLimit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5, 1), 10);
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin.from("notification_settings").select("*").eq("id", SETTINGS_ID).maybeSingle();
  const delaySettings = clampNotificationDelaySettings(settings);
  const reservationTtlSeconds = calculateReservationTtlSeconds(settings);
  const pollingInterval = clampNotificationPollingInterval(settings?.polling_interval_seconds);
  const { data, error } = await admin.rpc("reserve_pending_notification_events", {
    target_device_id: auth.device.id,
    batch_limit: batchLimit,
    reservation_ttl_seconds_input: reservationTtlSeconds,
  });
  let messages = (data ?? []) as ReservedMessage[];

  if (error) {
    await admin.from("whatsapp_device_logs").insert({
      device_id: auth.device.id,
      event_type: "message_batch_reserved",
      message: "RPC de reserva falhou; usando fallback backend.",
      metadata: {
        error_code: error.code ?? null,
        error_message: String(error.message ?? "erro").slice(0, 200),
      },
    });

    try {
      messages = await reservePendingMessagesFallback({
        admin,
        deviceId: auth.device.id,
        batchLimit,
        today: getTodayDateString(settings?.timezone ?? "America/Sao_Paulo"),
        reservationTtlSeconds,
      });
    } catch {
      return NextResponse.json({ error: "Falha ao reservar mensagens." }, { status: 500 });
    }
  }

  if (messages.length > 0) {
    await admin.from("whatsapp_device_logs").insert({
      device_id: auth.device.id,
      event_type: "message_batch_reserved",
      message: "Lote de avisos reservado.",
      metadata: { count: messages.length },
    });
  }

  return NextResponse.json({
    messages: messages.map((event) => ({
      id: event.id,
      type: event.type,
      to: event.telefone_destino,
      text: event.mensagem_renderizada,
      reservation_id: event.reservation_id,
      reservation_token: event.reservation_token,
      idempotency_key: event.idempotency_key,
      attempt_count: event.attempt_count,
      max_attempts: event.max_attempts,
    })),
    server_time: new Date().toISOString(),
    config: {
      polling_interval_seconds: pollingInterval,
      heartbeat_interval_seconds: settings?.heartbeat_interval_seconds ?? 30,
      delay_minimo_segundos: delaySettings.delay_minimo_segundos,
      delay_maximo_segundos: delaySettings.delay_maximo_segundos,
      delay_min_seconds: delaySettings.delay_min_seconds,
      delay_max_seconds: delaySettings.delay_max_seconds,
      reservation_ttl_seconds: reservationTtlSeconds,
      send_window_start: settings?.send_window_start ?? "08:00",
      send_window_end: settings?.send_window_end ?? "18:00",
    },
  });
}
