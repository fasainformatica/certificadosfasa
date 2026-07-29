import "server-only";

import { randomUUID } from "crypto";

import {
  calculateReservationTtlSeconds,
  clampNotificationDelaySettings,
  SETTINGS_ID,
} from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Database,
  Json,
  NotificationAudience,
  NotificationEventStatus,
} from "@/lib/supabase/database.types";
import { getActiveNotificationProvider } from "@/lib/whatsapp/euatendo/config";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";
import { maskPhone } from "@/lib/utils/phone";

import type { WhatsAppExtensionAuthContext } from "./config";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type NotificationEventUpdate = Database["public"]["Tables"]["notification_events"]["Update"];

type ExtensionNotificationSettings = {
  enabled: boolean;
  delay_minimo_segundos: number | null;
  delay_maximo_segundos: number | null;
};

type ReservedExtensionEvent = {
  id: string;
  audience: NotificationAudience;
  type: string;
  telefone_destino: string;
  mensagem_renderizada: string;
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string | null;
  reservation_id: string;
};

type ExtensionEventRow = ReservedExtensionEvent & {
  status: NotificationEventStatus;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  processing_started_at: string | null;
  dispatched_at: string | null;
};

type ReserveRpcResult =
  | {
      status: "reserved";
      lock_id: string;
      event: ReservedExtensionEvent;
    }
  | {
      status: "empty" | "locked" | "waiting" | "skipped";
      reason?: string;
      locked_until?: string;
      next_allowed_send_at?: string;
    };

type ParsedAck = {
  uuid: string;
  situacao: number;
};

type ProviderLogStatus = Database["public"]["Tables"]["whatsapp_provider_logs"]["Insert"]["status"];

const EXTENSION_MIN_DELAY_SECONDS = 180;
const EXTENSION_MAX_DELAY_SECONDS = 3600;
const ACK_RETRY_BACKOFF_SECONDS = [300, 900, 1800, 3600];

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function computeDispatchDelaySeconds(settings: ExtensionNotificationSettings | null) {
  const delays = clampNotificationDelaySettings(settings);
  const min = Math.max(delays.delay_minimo_segundos, EXTENSION_MIN_DELAY_SECONDS);
  const max = Math.min(Math.max(delays.delay_maximo_segundos, min), EXTENSION_MAX_DELAY_SECONDS);

  if (max === min) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeAckRetrySeconds(attemptCount: number) {
  return ACK_RETRY_BACKOFF_SECONDS[
    Math.min(Math.max(attemptCount - 1, 0), ACK_RETRY_BACKOFF_SECONDS.length - 1)
  ] ?? 3600;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseReserveResult(value: Json | null): ReserveRpcResult {
  const row = asRecord(value);

  if (!row) {
    return { status: "skipped", reason: "invalid_rpc_response" };
  }

  if (row.status === "reserved") {
    const event = asRecord(row.event);

    if (!event) {
      return { status: "skipped", reason: "invalid_rpc_event" };
    }

    return {
      status: "reserved",
      lock_id: String(row.lock_id ?? ""),
      event: {
        id: String(event.id ?? ""),
        audience: event.audience === "client" ? "client" : "internal",
        type: String(event.type ?? ""),
        telefone_destino: String(event.telefone_destino ?? ""),
        mensagem_renderizada: String(event.mensagem_renderizada ?? ""),
        attempt_count: typeof event.attempt_count === "number" ? event.attempt_count : 1,
        max_attempts: typeof event.max_attempts === "number" ? event.max_attempts : 3,
        idempotency_key: typeof event.idempotency_key === "string" ? event.idempotency_key : null,
        reservation_id: String(event.reservation_id ?? row.lock_id ?? ""),
      },
    };
  }

  if (row.status === "empty" || row.status === "locked" || row.status === "waiting" || row.status === "skipped") {
    return {
      status: row.status,
      reason: typeof row.reason === "string" ? row.reason : undefined,
      locked_until: typeof row.locked_until === "string" ? row.locked_until : undefined,
      next_allowed_send_at: typeof row.next_allowed_send_at === "string" ? row.next_allowed_send_at : undefined,
    };
  }

  return { status: "skipped", reason: "invalid_rpc_status" };
}

function parseAcks(value: unknown): ParsedAck[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: ParsedAck[] = [];

  for (const item of value) {
    const row = asRecord(item);
    const uuid = typeof row?.uuid === "string" ? row.uuid.trim() : "";
    const situacao = Number(row?.situacao);

    if (uuid && Number.isInteger(situacao)) {
      parsed.push({ uuid, situacao });
    }
  }

  return parsed;
}

function summarizeExtensionStatus(status: unknown, auth: WhatsAppExtensionAuthContext) {
  const row = asRecord(status);
  const stream = asRecord(row?.stream);
  const conn = asRecord(row?.conn);
  const wid = asRecord(conn?.wid);
  const connectedNumber = typeof wid?.user === "string" && wid.user ? wid.user : auth.connectedNumber;

  return {
    stream_info: typeof stream?.info === "string" ? stream.info : null,
    stream_mode: typeof stream?.mode === "string" ? stream.mode : null,
    queue: Number.isFinite(Number(row?.queue)) ? Number(row?.queue) : null,
    connected_number: maskPhone(connectedNumber),
    extension_version: auth.extensionVersion,
  } satisfies Json;
}

function toExtensionMessage(event: ReservedExtensionEvent, sendIntervalSeconds: number) {
  const digits = event.telefone_destino.replace(/\D/g, "");

  return {
    uuid: event.id,
    destino: `+${digits}`,
    texto: event.mensagem_renderizada,
    send_interval_seconds: sendIntervalSeconds,
  };
}

async function loadNotificationSettings(admin: AdminClient) {
  const { data, error } = await admin
    .from("notification_settings")
    .select("enabled, delay_minimo_segundos, delay_maximo_segundos")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error("Nao foi possivel carregar as configuracoes de envio.");
  }

  return data as ExtensionNotificationSettings | null;
}

async function completeReservationCadence({
  admin,
  lockId,
  nextAllowedSendAt,
}: {
  admin: AdminClient;
  lockId: string;
  nextAllowedSendAt: string;
}) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("whatsapp_dispatcher_state")
    .update({
      last_dispatch_at: now,
      next_allowed_send_at: nextAllowedSendAt,
      locked_until: null,
      lock_id: null,
      updated_at: now,
    })
    .eq("provider", WHATSAPP_EXTENSION_PROVIDER)
    .eq("lock_id", lockId);

  if (error) {
    throw new Error("Nao foi possivel liberar a cadencia da extensao do WhatsApp.");
  }
}

async function logExtensionAttempt(
  admin: AdminClient,
  {
    auth,
    event,
    operation,
    status,
    durationMs = null,
    errorCode = null,
    errorMessage = null,
    responseId = null,
    metadata = {},
  }: {
    auth: WhatsAppExtensionAuthContext | null;
    event: Pick<ReservedExtensionEvent, "id" | "audience" | "type" | "telefone_destino" | "attempt_count"> | null;
    operation: string;
    status: ProviderLogStatus;
    durationMs?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    responseId?: string | null;
    metadata?: Json;
  },
) {
  const metadataRecord = asRecord(metadata) ?? {};

  await admin.from("whatsapp_provider_logs").insert({
    provider: WHATSAPP_EXTENSION_PROVIDER,
    event_id: event?.id ?? null,
    audience: event?.audience ?? null,
    operation,
    telefone_mascarado: event ? maskPhone(event.telefone_destino) : null,
    template_type: event?.type ?? null,
    duration_ms: durationMs,
    status,
    attempt_count: event?.attempt_count ?? null,
    error_code: errorCode,
    error_message: errorMessage ? errorMessage.slice(0, 500) : null,
    request_id: randomUUID(),
    response_id: responseId,
    metadata: {
      ...metadataRecord,
      extension_version: auth?.extensionVersion ?? null,
      connected_number: auth ? maskPhone(auth.connectedNumber) : null,
    } satisfies Json,
  });
}

async function getEventForAck(admin: AdminClient, id: string) {
  const { data, error } = await admin
    .from("notification_events")
    .select(
      "id, audience, type, telefone_destino, status, attempt_count, max_attempts, idempotency_key, reservation_id, sent_at, delivered_at, read_at, processing_started_at, dispatched_at, mensagem_renderizada",
    )
    .eq("id", id)
    .eq("provider", WHATSAPP_EXTENSION_PROVIDER)
    .maybeSingle();

  if (error) {
    throw new Error("Nao foi possivel consultar o aviso confirmado pela extensao.");
  }

  return data as ExtensionEventRow | null;
}

async function applyAck(admin: AdminClient, auth: WhatsAppExtensionAuthContext, ack: ParsedAck) {
  const event = await getEventForAck(admin, ack.uuid);

  if (!event) {
    return false;
  }

  const now = new Date().toISOString();
  let update: NotificationEventUpdate;
  let logStatus: ProviderLogStatus = "started";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  if (ack.situacao === 2) {
    update = {
      status: "processing",
      processing_started_at: event.processing_started_at ?? now,
      dispatched_at: event.dispatched_at ?? now,
      provider_status: "sending",
      provider_response: { ack: ack.situacao, provider: WHATSAPP_EXTENSION_PROVIDER },
      error_message: null,
    };
  } else if (ack.situacao === 3 || ack.situacao === 4 || ack.situacao === 5) {
    const providerStatus = ack.situacao === 3 ? "sent" : ack.situacao === 4 ? "delivered" : "read";
    update = {
      status: "sent",
      sent_at: event.sent_at ?? now,
      delivered_at: ack.situacao >= 4 ? event.delivered_at ?? now : event.delivered_at,
      read_at: ack.situacao >= 5 ? event.read_at ?? now : event.read_at,
      failed_at: null,
      next_retry_at: null,
      provider_status: providerStatus,
      provider_response: { ack: ack.situacao, provider: WHATSAPP_EXTENSION_PROVIDER },
      error_message: null,
      reservation_id: null,
      reserved_at: null,
      reservation_expires_at: null,
    };
    logStatus = "sent";
  } else if (ack.situacao === -4) {
    errorCode = "number_not_found";
    errorMessage = "O numero informado nao esta disponivel no WhatsApp.";
    update = {
      status: "failed",
      failed_at: now,
      next_retry_at: null,
      provider_status: "number_not_found",
      provider_response: { ack: ack.situacao, provider: WHATSAPP_EXTENSION_PROVIDER },
      error_message: errorMessage,
      reservation_id: null,
      reserved_at: null,
      reservation_expires_at: null,
    };
    logStatus = "failed";
  } else {
    const shouldRetry = event.attempt_count < event.max_attempts;
    errorCode = "extension_send_failed";
    errorMessage = shouldRetry
      ? "Nao foi possivel enviar pela extensao do WhatsApp. Uma nova tentativa sera feita automaticamente."
      : "Nao foi possivel enviar pela extensao do WhatsApp.";
    update = {
      status: shouldRetry ? "retry" : "failed",
      failed_at: shouldRetry ? null : now,
      next_retry_at: shouldRetry ? addSeconds(computeAckRetrySeconds(event.attempt_count)) : null,
      provider_status: "send_failed",
      provider_response: { ack: ack.situacao, provider: WHATSAPP_EXTENSION_PROVIDER },
      error_message: errorMessage,
      reservation_id: null,
      reserved_at: null,
      reservation_expires_at: null,
    };
    logStatus = shouldRetry ? "retry" : "failed";
  }

  const { error } = await admin
    .from("notification_events")
    .update(update)
    .eq("id", event.id)
    .eq("provider", WHATSAPP_EXTENSION_PROVIDER);

  if (error) {
    throw new Error("Nao foi possivel atualizar o status do aviso confirmado pela extensao.");
  }

  await logExtensionAttempt(admin, {
    auth,
    event,
    operation: "extension_ack",
    status: logStatus,
    errorCode,
    errorMessage,
    responseId: String(ack.situacao),
    metadata: { ack: ack.situacao } satisfies Json,
  });

  return true;
}

export async function processWhatsAppExtensionAcks({
  admin,
  auth,
  body,
}: {
  admin: AdminClient;
  auth: WhatsAppExtensionAuthContext;
  body: unknown;
}) {
  const acks = parseAcks(asRecord(body)?.acks);
  let processed = 0;

  for (const ack of acks) {
    if (await applyAck(admin, auth, ack)) {
      processed += 1;
    }
  }

  return {
    received: acks.length,
    processed,
  };
}

export async function reserveNextWhatsAppExtensionMessage({
  admin,
  auth,
  body,
}: {
  admin: AdminClient;
  auth: WhatsAppExtensionAuthContext;
  body: unknown;
}) {
  const startedAt = Date.now();
  const settings = await loadNotificationSettings(admin);

  if (getActiveNotificationProvider() !== WHATSAPP_EXTENSION_PROVIDER || !settings?.enabled) {
    return {
      messages: [],
      reservation: {
        status: "skipped",
        reason: settings?.enabled ? "provider_inactive" : "notifications_disabled",
      },
    };
  }

  const { data, error } = await admin.rpc("reserve_whatsapp_extension_notification_event", {
    p_lock_ttl_seconds: calculateReservationTtlSeconds(settings),
    p_ignore_next_allowed: false,
  });

  if (error) {
    await logExtensionAttempt(admin, {
      auth,
      event: null,
      operation: "extension_reserve",
      status: "error",
      errorCode: "reserve_failed",
      errorMessage: error.message,
      metadata: summarizeExtensionStatus(asRecord(body)?.status, auth),
    });

    throw new Error("Nao foi possivel reservar a proxima mensagem para a extensao.");
  }

  const reserved = parseReserveResult(data);

  if (reserved.status !== "reserved") {
    return { messages: [], reservation: reserved };
  }

  const delaySeconds = computeDispatchDelaySeconds(settings);
  const nextAllowedSendAt = addSeconds(delaySeconds);
  await completeReservationCadence({
    admin,
    lockId: reserved.lock_id,
    nextAllowedSendAt,
  });
  await logExtensionAttempt(admin, {
    auth,
    event: reserved.event,
    operation: "extension_reserve",
    status: "started",
    durationMs: Date.now() - startedAt,
    metadata: {
      next_allowed_send_at: nextAllowedSendAt,
      delay_seconds: delaySeconds,
      status: summarizeExtensionStatus(asRecord(body)?.status, auth),
    } satisfies Json,
  });

  return {
    messages: [toExtensionMessage(reserved.event, delaySeconds)],
    reservation: {
      status: "reserved",
      next_allowed_send_at: nextAllowedSendAt,
    },
  };
}
