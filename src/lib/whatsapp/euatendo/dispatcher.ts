import "server-only";

import { randomUUID } from "crypto";

import { clampNotificationDelaySettings, calculateReservationTtlSeconds, SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json, NotificationAudience } from "@/lib/supabase/database.types";
import { getOptionalEnv } from "@/lib/supabase/env";
import { maskPhone } from "@/lib/utils/phone";

import { getEuAtendoConfigStatus } from "./config";
import { EuAtendoWhatsAppProvider } from "./provider";
import type { EuAtendoErrorCode, WhatsAppSendResult } from "./types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ReservedEvent = {
  id: string;
  audience: NotificationAudience;
  type: string;
  telefone_destino: string;
  mensagem_renderizada: string;
  template_id: string | null;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string | null;
  reservation_id: string;
};

type ReserveRpcResult =
  | {
      status: "reserved";
      lock_id: string;
      event: ReservedEvent;
    }
  | {
      status: "empty" | "locked" | "waiting" | "skipped";
      reason?: string;
      locked_until?: string;
      next_allowed_send_at?: string;
    };

export type EuAtendoDispatchResult = {
  status: "sent" | "retry" | "failed" | "empty" | "locked" | "waiting" | "skipped" | "disabled" | "error";
  event_id: string | null;
  attempt_count: number | null;
  next_retry_at?: string | null;
  next_allowed_send_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type EuAtendoDispatchBatchResult = {
  status: "completed" | "empty" | "disabled" | "locked" | "waiting" | "skipped" | "partial_error";
  max_events: number;
  processed: number;
  sent: number;
  retry: number;
  failed: number;
  errors: number;
  stopped_reason: string | null;
  results: EuAtendoDispatchResult[];
};

const RETRY_BACKOFF_SECONDS = [60, 300, 900, 1800];
const ABSOLUTE_MIN_DISPATCH_DELAY_SECONDS = 180;
const DEFAULT_MAX_DISPATCH_DELAY_SECONDS = 300;
const DEFAULT_MAX_EVENTS_PER_RUN = 1;
const HARD_MAX_EVENTS_PER_RUN = 1;

function parseReserveResult(value: Json | null): ReserveRpcResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "error" as never, reason: "invalid_rpc_response" };
  }

  const row = value as Record<string, Json | undefined>;
  const status = row.status;

  if (status === "reserved" && row.event && typeof row.event === "object" && !Array.isArray(row.event)) {
    const event = row.event as Record<string, Json | undefined>;

    return {
      status: "reserved",
      lock_id: String(row.lock_id ?? ""),
      event: {
        id: String(event.id ?? ""),
        audience: event.audience === "client" ? "client" : "internal",
        type: String(event.type ?? ""),
        telefone_destino: String(event.telefone_destino ?? ""),
        mensagem_renderizada: String(event.mensagem_renderizada ?? ""),
        template_id: typeof event.template_id === "string" ? event.template_id : null,
        attempt_count: typeof event.attempt_count === "number" ? event.attempt_count : 1,
        max_attempts: typeof event.max_attempts === "number" ? event.max_attempts : 3,
        idempotency_key: typeof event.idempotency_key === "string" ? event.idempotency_key : null,
        reservation_id: String(event.reservation_id ?? row.lock_id ?? ""),
      },
    };
  }

  if (status === "empty" || status === "locked" || status === "waiting" || status === "skipped") {
    return {
      status,
      reason: typeof row.reason === "string" ? row.reason : undefined,
      locked_until: typeof row.locked_until === "string" ? row.locked_until : undefined,
      next_allowed_send_at: typeof row.next_allowed_send_at === "string" ? row.next_allowed_send_at : undefined,
    };
  }

  return { status: "skipped", reason: "invalid_rpc_status" };
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function computeBackoffSeconds(attemptCount: number, retryAfterSeconds: number | null) {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(Math.ceil(retryAfterSeconds), 3600);
  }

  return RETRY_BACKOFF_SECONDS[Math.min(Math.max(attemptCount - 1, 0), RETRY_BACKOFF_SECONDS.length - 1)] ?? 1800;
}

function isRetryable(errorCode: EuAtendoErrorCode | null) {
  return errorCode === "RATE_LIMITED"
    || errorCode === "PROVIDER_TIMEOUT"
    || errorCode === "PROVIDER_UNAVAILABLE"
    || errorCode === "TEMPORARY_PROVIDER_ERROR";
}

function computeDispatchDelaySeconds(settings: {
  delay_minimo_segundos?: number | null;
  delay_maximo_segundos?: number | null;
} | null) {
  const delays = clampNotificationDelaySettings(settings);
  const min = Math.max(delays.delay_minimo_segundos, ABSOLUTE_MIN_DISPATCH_DELAY_SECONDS);
  const max = Math.max(delays.delay_maximo_segundos, min, DEFAULT_MAX_DISPATCH_DELAY_SECONDS);

  if (max === min) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function readDispatchMaxEventsPerRun() {
  const raw = Number(getOptionalEnv("EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN") ?? DEFAULT_MAX_EVENTS_PER_RUN);

  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_EVENTS_PER_RUN;
  }

  return Math.max(1, Math.min(Math.trunc(raw), HARD_MAX_EVENTS_PER_RUN));
}

async function loadNotificationSettings(admin: AdminClient) {
  const { data } = await admin
    .from("notification_settings")
    .select("enabled, delay_minimo_segundos, delay_maximo_segundos")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  return data;
}

async function logProviderAttempt(
  admin: AdminClient,
  {
    event,
    operation,
    status,
    durationMs,
    errorCode = null,
    errorMessage = null,
    responseId = null,
    metadata = {},
  }: {
    event: ReservedEvent | null;
    operation: string;
    status: "started" | "sent" | "retry" | "failed" | "skipped" | "locked" | "waiting" | "error";
    durationMs?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    responseId?: string | null;
    metadata?: Json;
  },
) {
  await admin.from("whatsapp_provider_logs").insert({
    provider: "euatendo",
    event_id: event?.id ?? null,
    audience: event?.audience ?? null,
    operation,
    telefone_mascarado: event ? maskPhone(event.telefone_destino) : null,
    template_type: event?.type ?? null,
    duration_ms: durationMs ?? null,
    status,
    attempt_count: event?.attempt_count ?? null,
    error_code: errorCode,
    error_message: errorMessage ? errorMessage.slice(0, 500) : null,
    request_id: randomUUID(),
    response_id: responseId,
    metadata,
  });
}

async function clearDispatcherLock(admin: AdminClient, nextAllowedSendAt: string | null) {
  await admin
    .from("whatsapp_dispatcher_state")
    .update({
      last_dispatch_at: new Date().toISOString(),
      next_allowed_send_at: nextAllowedSendAt ?? new Date().toISOString(),
      locked_until: null,
      lock_id: null,
    })
    .eq("provider", "euatendo");
}

async function markProcessing(admin: AdminClient, event: ReservedEvent) {
  const { error } = await admin
    .from("notification_events")
    .update({
      status: "processing",
      processing_started_at: new Date().toISOString(),
      dispatched_at: new Date().toISOString(),
    })
    .eq("id", event.id)
    .eq("provider", "euatendo")
    .eq("status", "reserved")
    .eq("reservation_id", event.reservation_id);

  if (error) {
    throw new Error("Não foi possível marcar o evento como em processamento.");
  }
}

async function markSent(admin: AdminClient, event: ReservedEvent, result: WhatsAppSendResult) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("notification_events")
    .update({
      status: "sent",
      sent_at: now,
      failed_at: null,
      next_retry_at: null,
      provider_message_id: result.providerMessageId,
      provider_status: result.providerStatus ?? "accepted",
      provider_response: result.sanitizedResponse,
      error_message: null,
      reservation_id: null,
      reserved_at: null,
      reservation_expires_at: null,
    })
    .eq("id", event.id)
    .eq("provider", "euatendo")
    .eq("reservation_id", event.reservation_id);

  if (error) {
    throw new Error("Não foi possível registrar o envio euAtendo.");
  }
}

async function markFailure(admin: AdminClient, event: ReservedEvent, result: WhatsAppSendResult) {
  const shouldRetry = isRetryable(result.errorCode) && event.attempt_count < event.max_attempts;
  const status: "retry" | "failed" = shouldRetry ? "retry" : "failed";
  const nextRetryAt = shouldRetry ? addSeconds(computeBackoffSeconds(event.attempt_count, result.retryAfterSeconds)) : null;
  const now = new Date().toISOString();

  const { error } = await admin
    .from("notification_events")
    .update({
      status,
      failed_at: shouldRetry ? null : now,
      next_retry_at: nextRetryAt,
      provider_message_id: result.providerMessageId,
      provider_status: result.providerStatus,
      provider_response: result.sanitizedResponse,
      error_message: result.errorMessage ?? "Falha ao enviar pela euAtendo.",
      reservation_id: null,
      reserved_at: null,
      reservation_expires_at: null,
    })
    .eq("id", event.id)
    .eq("provider", "euatendo")
    .eq("reservation_id", event.reservation_id);

  if (error) {
    throw new Error("Não foi possível registrar a falha euAtendo.");
  }

  return { status, nextRetryAt };
}

export async function dispatchNextEuAtendoNotification(): Promise<EuAtendoDispatchResult> {
  const configured = getEuAtendoConfigStatus();
  const admin = createSupabaseAdminClient();

  if (!configured.enabled) {
    await logProviderAttempt(admin, {
      event: null,
      operation: "dispatch",
      status: "skipped",
      errorCode: "provider_disabled",
      errorMessage: "Provider euAtendo desativado por feature flag.",
    });
    return { status: "disabled", event_id: null, attempt_count: null, error_code: "provider_disabled" };
  }

  const settings = await loadNotificationSettings(admin);

  if (!settings?.enabled) {
    await logProviderAttempt(admin, {
      event: null,
      operation: "dispatch",
      status: "skipped",
      errorCode: "notifications_disabled",
      errorMessage: "Avisos automáticos desativados nas configurações.",
    });
    return { status: "disabled", event_id: null, attempt_count: null, error_code: "notifications_disabled" };
  }

  const reservationTtlSeconds = calculateReservationTtlSeconds(settings);
  const { data, error } = await admin.rpc("reserve_euatendo_notification_event", {
    p_lock_ttl_seconds: reservationTtlSeconds,
    p_ignore_next_allowed: false,
  });

  if (error) {
    await logProviderAttempt(admin, {
      event: null,
      operation: "reserve",
      status: "error",
      errorCode: "reserve_failed",
      errorMessage: error.message,
    });
    return { status: "error", event_id: null, attempt_count: null, error_code: "reserve_failed", error_message: error.message };
  }

  const reserved = parseReserveResult(data);

  if (reserved.status !== "reserved") {
    await logProviderAttempt(admin, {
      event: null,
      operation: "reserve",
      status: reserved.status === "locked" ? "locked" : reserved.status === "waiting" ? "waiting" : "skipped",
      errorCode: reserved.reason ?? null,
      errorMessage: reserved.reason ?? null,
      metadata: reserved as unknown as Json,
    });
    return {
      status: reserved.status,
      event_id: null,
      attempt_count: null,
      next_allowed_send_at: reserved.next_allowed_send_at,
      error_code: reserved.reason ?? null,
    };
  }

  const event = reserved.event;
  const startedAt = Date.now();

  try {
    await markProcessing(admin, event);
    await logProviderAttempt(admin, { event, operation: "send_text", status: "started" });

    const provider = new EuAtendoWhatsAppProvider();
    const result = await provider.sendText({
      eventId: event.id,
      idempotencyKey: event.idempotency_key,
      destinationNumber: event.telefone_destino,
      renderedMessage: event.mensagem_renderizada,
    });
    const durationMs = Date.now() - startedAt;
    const delaySeconds = computeDispatchDelaySeconds(settings);
    const nextAllowedSendAt = addSeconds(delaySeconds);

    if (result.accepted) {
      await markSent(admin, event, result);
      await clearDispatcherLock(admin, nextAllowedSendAt);
      await logProviderAttempt(admin, {
        event,
        operation: "send_text",
        status: "sent",
        durationMs,
        responseId: result.providerMessageId,
        metadata: {
          http_status: result.httpStatus,
          provider_status: result.providerStatus,
          next_allowed_send_at: nextAllowedSendAt,
        },
      });

      return {
        status: "sent",
        event_id: event.id,
        attempt_count: event.attempt_count,
        next_allowed_send_at: nextAllowedSendAt,
      };
    }

    const failure = await markFailure(admin, event, result);
    await clearDispatcherLock(admin, nextAllowedSendAt);
    await logProviderAttempt(admin, {
      event,
      operation: "send_text",
      status: failure.status,
      durationMs,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      responseId: result.providerMessageId,
      metadata: {
        http_status: result.httpStatus,
        retry_after_seconds: result.retryAfterSeconds,
        next_retry_at: failure.nextRetryAt,
        next_allowed_send_at: nextAllowedSendAt,
      },
    });

    return {
      status: failure.status,
      event_id: event.id,
      attempt_count: event.attempt_count,
      next_retry_at: failure.nextRetryAt,
      next_allowed_send_at: nextAllowedSendAt,
      error_code: result.errorCode,
      error_message: result.errorMessage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada no dispatcher euAtendo.";
    await clearDispatcherLock(admin, new Date().toISOString());
    await logProviderAttempt(admin, {
      event,
      operation: "dispatch",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorCode: "dispatcher_error",
      errorMessage: message,
    });

    return {
      status: "error",
      event_id: event.id,
      attempt_count: event.attempt_count,
      error_code: "dispatcher_error",
      error_message: message,
    };
  }
}

function summarizeBatch(results: EuAtendoDispatchResult[], maxEvents: number): EuAtendoDispatchBatchResult {
  const processed = results.filter((result) => result.event_id).length;
  const sent = results.filter((result) => result.status === "sent").length;
  const retry = results.filter((result) => result.status === "retry").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const errors = results.filter((result) => result.status === "error").length;
  const last = results[results.length - 1] ?? null;
  const terminalStatus = last?.status;
  const status =
    errors > 0
      ? "partial_error"
      : processed === 0 && terminalStatus === "empty"
        ? "empty"
        : terminalStatus === "disabled" ||
            terminalStatus === "locked" ||
            terminalStatus === "waiting" ||
            terminalStatus === "skipped"
          ? terminalStatus
          : "completed";

  return {
    status,
    max_events: maxEvents,
    processed,
    sent,
    retry,
    failed,
    errors,
    stopped_reason:
      processed >= maxEvents
          ? "max_events"
          : last && last.status !== "sent"
            ? last.error_code ?? last.status
          : null,
    results,
  };
}

export async function dispatchEuAtendoNotificationBatch(maxEvents = readDispatchMaxEventsPerRun()) {
  const boundedMaxEvents = Math.max(1, Math.min(Math.trunc(maxEvents), HARD_MAX_EVENTS_PER_RUN));
  const results: EuAtendoDispatchResult[] = [];

  for (let index = 0; index < boundedMaxEvents; index += 1) {
    const result = await dispatchNextEuAtendoNotification();

    results.push(result);

    if (result.status !== "sent") {
      break;
    }
  }

  return summarizeBatch(results, boundedMaxEvents);
}
