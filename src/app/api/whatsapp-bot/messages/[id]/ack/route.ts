import { NextResponse } from "next/server";

import { botAckSchema } from "@/lib/notifications/validation";
import { SETTINGS_ID, calculateReservationTtlSeconds } from "@/lib/notifications/engine";
import { authenticateQwepRequest } from "@/lib/qwep/auth";
import { hashReservationToken, safeEqual } from "@/lib/qwep/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type AckRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type NotificationEventRow = {
  id: string;
  status: string;
  device_id: string | null;
  reservation_id: string | null;
  reservation_token_hash: string | null;
  reserved_at: string | null;
  reservation_expires_at: string | null;
  processing_started_at: string | null;
  attempt_count: number;
  max_attempts: number;
};

function getRetryDate() {
  const delaySeconds = 60;

  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

export async function POST(request: Request, { params }: AckRouteProps) {
  const bodyText = await request.text();
  const auth = await authenticateQwepRequest(request, {
    bodyText,
    rateLimitKey: "qwep-ack",
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

  const parsed = botAckSchema.safeParse(jsonBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: event, error } = await admin.from("notification_events").select("*").eq("id", id).maybeSingle();

  if (error || !event) {
    return NextResponse.json({ error: "Mensagem nao encontrada." }, { status: 404 });
  }

  const notificationEvent = event as NotificationEventRow;

  if (notificationEvent.status === "sent" || notificationEvent.status === "failed") {
    return NextResponse.json({
      id: notificationEvent.id,
      status: notificationEvent.status,
      idempotent: true,
    });
  }

  if (
    notificationEvent.device_id !== auth.device.id ||
    notificationEvent.reservation_id !== parsed.data.reservation_id ||
    !notificationEvent.reservation_token_hash ||
    !safeEqual(hashReservationToken(parsed.data.reservation_token), notificationEvent.reservation_token_hash)
  ) {
    return NextResponse.json({ error: "Reserva invalida." }, { status: 409 });
  }

  const providerResponse = (parsed.data.provider_response ?? {}) as Json;

  if (parsed.data.status === "processing") {
    const { data: settings } = await admin
      .from("notification_settings")
      .select("delay_minimo_segundos, delay_maximo_segundos")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    const reservationExpiresAt = new Date(Date.now() + calculateReservationTtlSeconds(settings) * 1000).toISOString();
    const { data: updated, error: updateError } = await admin
      .from("notification_events")
      .update({
        status: "processing",
        processing_started_at: notificationEvent.processing_started_at ?? new Date().toISOString(),
        reservation_expires_at: reservationExpiresAt,
        provider_response: providerResponse,
      })
      .eq("id", notificationEvent.id)
      .eq("device_id", auth.device.id)
      .eq("reservation_id", parsed.data.reservation_id)
      .in("status", ["reserved", "processing"])
      .select("id,status")
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Falha ao marcar processamento." }, { status: 500 });
    }

    await admin.from("whatsapp_device_logs").insert({
      device_id: auth.device.id,
      event_type: "message_processing_ack",
      message: "ACK de processamento recebido.",
      metadata: { notification_event_id: notificationEvent.id },
    });

    return NextResponse.json(updated);
  }

  if (parsed.data.status === "sent") {
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("notification_events")
      .update({
        status: "sent",
        sent_at: now,
        failed_at: null,
        provider_response: providerResponse,
        error_message: null,
        processing_started_at: notificationEvent.processing_started_at ?? now,
      })
      .eq("id", notificationEvent.id)
      .eq("device_id", auth.device.id)
      .eq("reservation_id", parsed.data.reservation_id)
      .in("status", ["reserved", "processing"])
      .select("id,status")
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Falha ao confirmar envio." }, { status: 500 });
    }

    await admin.from("whatsapp_device_logs").insert({
      device_id: auth.device.id,
      event_type: "message_sent_ack",
      message: "ACK de envio recebido.",
      metadata: { notification_event_id: notificationEvent.id },
    });

    return NextResponse.json(updated);
  }

  const shouldRetry = parsed.data.retryable !== false && notificationEvent.attempt_count < notificationEvent.max_attempts;
  const nextStatus = shouldRetry ? "retry" : "failed";
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("notification_events")
    .update({
      status: nextStatus,
      failed_at: shouldRetry ? null : now,
      next_retry_at: shouldRetry ? getRetryDate() : null,
      provider_response: providerResponse,
      error_message: parsed.data.error_message ?? "Falha reportada pelo bot.",
      device_id: shouldRetry ? null : auth.device.id,
      reservation_id: shouldRetry ? null : notificationEvent.reservation_id,
      reservation_token_hash: shouldRetry ? null : notificationEvent.reservation_token_hash,
      reserved_at: shouldRetry ? null : notificationEvent.reserved_at,
      reservation_expires_at: shouldRetry ? null : notificationEvent.reservation_expires_at,
      processing_started_at: shouldRetry ? null : notificationEvent.processing_started_at,
    })
    .eq("id", notificationEvent.id)
    .eq("device_id", auth.device.id)
    .eq("reservation_id", parsed.data.reservation_id)
    .in("status", ["reserved", "processing"])
    .select("id,status,next_retry_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: "Falha ao confirmar falha." }, { status: 500 });
  }

  await admin.from("whatsapp_device_logs").insert({
    device_id: auth.device.id,
    event_type: "message_failed_ack",
    message: shouldRetry ? "ACK de falha recebido. Evento reagendado." : "ACK de falha definitiva recebido.",
    metadata: {
      notification_event_id: notificationEvent.id,
      retry: shouldRetry,
    },
  });

  return NextResponse.json(updated);
}
