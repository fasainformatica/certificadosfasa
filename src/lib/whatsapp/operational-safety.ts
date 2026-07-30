import "server-only";

import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationProvider } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type WhatsAppOperationalSettings = {
  enabled?: boolean | null;
  timezone?: string | null;
  whatsapp_dispatch_paused?: boolean | null;
  whatsapp_dispatch_pause_reason?: string | null;
  whatsapp_daily_limit?: number | null;
  whatsapp_hourly_limit?: number | null;
  whatsapp_auto_pause_enabled?: boolean | null;
  whatsapp_failure_pause_threshold?: number | null;
  whatsapp_failure_pause_window_minutes?: number | null;
};

export type WhatsAppSafetyCounts = {
  sentToday: number;
  sentLastHour: number;
  failuresInWindow: number;
};

export type NormalizedWhatsAppSafetySettings = {
  enabled: boolean;
  timezone: string;
  dispatchPaused: boolean;
  pauseReason: string | null;
  dailyLimit: number;
  hourlyLimit: number;
  autoPauseEnabled: boolean;
  failurePauseThreshold: number;
  failurePauseWindowMinutes: number;
};

export type WhatsAppOperationalSafetySnapshot = NormalizedWhatsAppSafetySettings & WhatsAppSafetyCounts & {
  provider: NotificationProvider;
  allowed: boolean;
  blockedReason: string | null;
  blockedMessage: string | null;
  autoPauseRecommended: boolean;
};

const DEFAULT_DAILY_LIMIT = 25;
const DEFAULT_HOURLY_LIMIT = 10;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_FAILURE_WINDOW_MINUTES = 60;

function clampInteger(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.trunc(Number(value)), max));
}

export function normalizeWhatsAppSafetySettings(
  settings: WhatsAppOperationalSettings | null,
): NormalizedWhatsAppSafetySettings {
  const dailyLimit = clampInteger(settings?.whatsapp_daily_limit, DEFAULT_DAILY_LIMIT, 1, 500);
  const hourlyLimit = Math.min(
    dailyLimit,
    clampInteger(settings?.whatsapp_hourly_limit, DEFAULT_HOURLY_LIMIT, 1, 100),
  );

  return {
    enabled: settings?.enabled === true,
    timezone: settings?.timezone || "America/Sao_Paulo",
    dispatchPaused: settings?.whatsapp_dispatch_paused === true,
    pauseReason: settings?.whatsapp_dispatch_pause_reason?.trim() || null,
    dailyLimit,
    hourlyLimit,
    autoPauseEnabled: settings?.whatsapp_auto_pause_enabled !== false,
    failurePauseThreshold: clampInteger(
      settings?.whatsapp_failure_pause_threshold,
      DEFAULT_FAILURE_THRESHOLD,
      1,
      50,
    ),
    failurePauseWindowMinutes: clampInteger(
      settings?.whatsapp_failure_pause_window_minutes,
      DEFAULT_FAILURE_WINDOW_MINUTES,
      5,
      1440,
    ),
  };
}

export function buildWhatsAppOperationalSafetySnapshot({
  provider,
  settings,
  counts,
}: {
  provider: NotificationProvider;
  settings: WhatsAppOperationalSettings | null;
  counts: WhatsAppSafetyCounts;
}): WhatsAppOperationalSafetySnapshot {
  const normalized = normalizeWhatsAppSafetySettings(settings);
  let blockedReason: string | null = null;
  let blockedMessage: string | null = null;
  let autoPauseRecommended = false;

  if (!normalized.enabled) {
    blockedReason = "notifications_disabled";
    blockedMessage = "O envio automático está pausado nas configurações.";
  } else if (normalized.dispatchPaused) {
    blockedReason = "dispatch_paused";
    blockedMessage = normalized.pauseReason || "O envio do WhatsApp está pausado operacionalmente.";
  } else if (counts.sentToday >= normalized.dailyLimit) {
    blockedReason = "daily_limit_reached";
    blockedMessage = "O limite diário de mensagens do WhatsApp foi atingido.";
  } else if (counts.sentLastHour >= normalized.hourlyLimit) {
    blockedReason = "hourly_limit_reached";
    blockedMessage = "O limite por hora de mensagens do WhatsApp foi atingido.";
  } else if (
    normalized.autoPauseEnabled
    && counts.failuresInWindow >= normalized.failurePauseThreshold
  ) {
    blockedReason = "failure_auto_pause";
    blockedMessage = "O envio do WhatsApp foi pausado após falhas recentes.";
    autoPauseRecommended = true;
  }

  return {
    ...normalized,
    ...counts,
    provider,
    allowed: blockedReason === null,
    blockedReason,
    blockedMessage,
    autoPauseRecommended,
  };
}

function getTodayDateString(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

async function countSentEvents(admin: AdminClient, provider: NotificationProvider, sinceIso: string) {
  const { count, error } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .eq("provider", provider)
    .eq("status", "sent")
    .gte("sent_at", sinceIso);

  if (error) {
    throw new Error("Não foi possível calcular os limites de envio do WhatsApp.");
  }

  return count ?? 0;
}

async function countRecentFailures(admin: AdminClient, provider: NotificationProvider, sinceIso: string) {
  const { count, error } = await admin
    .from("whatsapp_provider_logs")
    .select("id", { count: "exact", head: true })
    .eq("provider", provider)
    .in("status", ["failed", "error"])
    .gte("created_at", sinceIso);

  if (error) {
    throw new Error("Não foi possível calcular falhas recentes do WhatsApp.");
  }

  return count ?? 0;
}

export async function getWhatsAppOperationalSafetySnapshot({
  admin,
  provider,
  settings,
  autoPause = false,
}: {
  admin: AdminClient;
  provider: NotificationProvider;
  settings: WhatsAppOperationalSettings | null;
  autoPause?: boolean;
}) {
  const normalized = normalizeWhatsAppSafetySettings(settings);
  const today = getTodayDateString(normalized.timezone);
  const dayStartIso = `${today}T00:00:00.000Z`;
  const hourStartIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const failureWindowStartIso = new Date(
    Date.now() - normalized.failurePauseWindowMinutes * 60 * 1000,
  ).toISOString();
  const counts: WhatsAppSafetyCounts = {
    sentToday: await countSentEvents(admin, provider, dayStartIso),
    sentLastHour: await countSentEvents(admin, provider, hourStartIso),
    failuresInWindow: await countRecentFailures(admin, provider, failureWindowStartIso),
  };
  const snapshot = buildWhatsAppOperationalSafetySnapshot({ provider, settings, counts });

  if (autoPause && snapshot.autoPauseRecommended) {
    const now = new Date().toISOString();
    const reason = snapshot.blockedMessage ?? "O envio do WhatsApp foi pausado por segurança.";

    await admin
      .from("notification_settings")
      .update({
        whatsapp_dispatch_paused: true,
        whatsapp_dispatch_pause_reason: reason,
        whatsapp_dispatch_paused_at: now,
      })
      .eq("id", SETTINGS_ID);

    return {
      ...snapshot,
      dispatchPaused: true,
      pauseReason: reason,
      blockedReason: "failure_auto_pause",
      blockedMessage: reason,
      allowed: false,
    };
  }

  return snapshot;
}
