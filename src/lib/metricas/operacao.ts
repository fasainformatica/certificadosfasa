import "server-only";

import { PLANNABLE_CERTIFICATE_RENEWAL_STATUSES } from "@/lib/certificados/renewal-status";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProviderLabel, WHATSAPP_EXTENSION_PROVIDER, type WhatsAppProviderName } from "@/lib/whatsapp/providers";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
const TIMEZONE = "America/Sao_Paulo";

function unavailable(): never {
  // Never expose database error messages, row contents or credentials to the UI.
  throw new Error("Metricas indisponiveis");
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const result = await query;
  if (result.error || typeof result.count !== "number" || !Number.isInteger(result.count) || result.count < 0) unavailable();
  return result.count;
}

export function getMetricDateContext(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  // Sao Paulo has UTC-03 boundaries for the operational dates supported here.
  return {
    today,
    dayStart: `${today}T00:00:00-03:00`,
    dayEnd: `${tomorrow.toISOString().slice(0, 10)}T00:00:00-03:00`,
    monthStart: `${today.slice(0, 7)}-01T00:00:00-03:00`,
    now: now.toISOString(),
  };
}

type DateContext = ReturnType<typeof getMetricDateContext>;

/** X01: current failed events, all providers/audiences/types, all dates (including future); excludes canceled. Not an attempt-log count. */
export function lerFalhasPendentes(admin: AdminClient) {
  return count(admin.from("notification_events").select("id", { count: "exact", head: true }).eq("status", "failed"));
}

/** X02: Central definition: pending + retry with send_date <= today (Sao Paulo), all providers/audiences/types. Excludes future, canceled, reserved and processing. No age cutoff or next_retry_at eligibility claim. */
export async function lerMensagensNaFila(admin: AdminClient, today: string) {
  const [pending, retry] = await Promise.all((["pending", "retry"] as const).map((status) =>
    count(admin.from("notification_events").select("id", { count: "exact", head: true })
      .eq("status", status).lte("send_date", today)),
  ));
  return { pending, retry, total: pending + retry };
}

/** Future pending + retry events, all providers/audiences/types; excludes canceled and in-flight events. No historical cutoff. */
export function lerMensagensFuturas(admin: AdminClient, today: string) {
  return count(admin.from("notification_events").select("id", { count: "exact", head: true })
    .in("status", ["pending", "retry"]).gt("send_date", today));
}

/** Current reserved + processing events, all providers/audiences/types and dates, including future. Excludes canceled; not a lock-health check. */
export function lerMensagensEmProcessamento(admin: AdminClient) {
  return count(admin.from("notification_events").select("id", { count: "exact", head: true })
    .in("status", ["reserved", "processing"]));
}

/** X03: latest non-null sent_at of current sent events, all providers/audiences/types; no date window (future timestamps are not repaired). Excludes canceled. */
export async function lerUltimoEnvio(admin: AdminClient) {
  const { data, error } = await admin.from("notification_events").select("sent_at")
    .eq("status", "sent").not("sent_at", "is", null)
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (error) unavailable();
  return data?.sent_at ?? null;
}

/** X04: dispatch/cadence state of the explicitly selected provider, no status/date filter (not log activity, queue polling or confirmed delivery). Includes stored future timestamps unchanged; canceled is not applicable. */
export async function lerUltimaExecucao(admin: AdminClient, provider: WhatsAppProviderName) {
  const { data, error } = await admin.from("whatsapp_dispatcher_state")
    .select("provider, last_dispatch_at, next_allowed_send_at, locked_until, updated_at")
    .eq("provider", provider).maybeSingle();
  if (error) unavailable();
  return data ?? null;
}

/** Current sent events in [local day start, next day start), all providers/audiences/types; excludes canceled and other days, including future days. */
export function lerEnviadasHoje(admin: AdminClient, dates: DateContext) {
  return count(admin.from("notification_events").select("id", { count: "exact", head: true })
    .eq("status", "sent").gte("sent_at", dates.dayStart).lt("sent_at", dates.dayEnd));
}

/** Current sent events from local month start through now, all providers/audiences/types; excludes canceled and future timestamps. */
export function lerEnviadasNoMes(admin: AdminClient, dates: DateContext) {
  return count(admin.from("notification_events").select("id", { count: "exact", head: true })
    .eq("status", "sent").gte("sent_at", dates.monthStart).lte("sent_at", dates.now));
}

/** X05: event totals by type, all statuses (including canceled), providers, audiences and dates (including future). Never a certificate count. */
export async function lerTotaisPorTipo(admin: AdminClient) {
  const [expired, expiring] = await Promise.all((["certificate_expired", "certificate_expiring"] as const).map((type) =>
    count(admin.from("notification_events").select("id", { count: "exact", head: true }).eq("type", type)),
  ));
  return { expired, expiring };
}

/** Shared read-only snapshot. Failures are scoped to each metric (null + unavailable key), never coerced to zero; no RPC, mutation, delivery or persistent cache. */
export async function lerMetricasOperacao(admin: AdminClient, provider: WhatsAppProviderName, now = new Date()) {
  const dates = getMetricDateContext(now);
  const unavailable: string[] = [];
  async function read<T>(key: string, query: Promise<T>): Promise<T | null> {
    try {
      return await query;
    } catch {
      unavailable.push(key);
      return null;
    }
  }
  const [queue, failed, future, processing, sentToday, sentMonth, lastSentAt, state, types] = await Promise.all([
    read("queue", lerMensagensNaFila(admin, dates.today)), read("failed", lerFalhasPendentes(admin)),
    read("future", lerMensagensFuturas(admin, dates.today)), read("processing", lerMensagensEmProcessamento(admin)),
    read("sentToday", lerEnviadasHoje(admin, dates)), read("sentMonth", lerEnviadasNoMes(admin, dates)),
    read("lastSentAt", lerUltimoEnvio(admin)), read("state", lerUltimaExecucao(admin, provider)),
    read("types", lerTotaisPorTipo(admin)),
  ]);
  return { ...dates, queue, failed, future, processing, sentToday, sentMonth, lastSentAt, state,
    expired: types?.expired ?? null, expiring: types?.expiring ?? null, unavailable: unavailable.sort() };
}

/** X06: non-invalid certificates in em_acompanhamento or renovou_fasa, including expired and future validity; excludes cliente_inativo and all non-plannable renewal states. Cancellation is not a certificate status. Reads every page, not a capped sample. */
export async function lerCertificadosEmOperacao(admin: AdminClient) {
  const { data: settings, error } = await admin.from("notification_settings")
    .select("dias_aviso_vencimento").eq("id", SETTINGS_ID).maybeSingle();
  if (error) unavailable();
  const readPage = (from: number) => admin.from("certificados")
    .select("id, cnpj, nome_titular, data_vencimento, status, renovacao_status, clientes(nome_razao_social)")
    .neq("status", "invalido").in("renovacao_status", [...PLANNABLE_CERTIFICATE_RENEWAL_STATUSES])
    .order("data_vencimento", { ascending: true }).order("id", { ascending: true }).range(from, from + 499);
  const first = await readPage(0);
  if (first.error || !first.data) unavailable();
  const certificates = [...first.data];
  for (let from = 500; certificates.length === from; from += 500) {
    const page = await readPage(from);
    if (page.error || !page.data) unavailable();
    certificates.push(...page.data);
  }
  return { certificates, warningDays: settings?.dias_aviso_vencimento ?? [30, 15, 7], timezone: TIMEZONE };
}

/** X09: display-only label override; provider identifiers and backend mappings stay unchanged. */
export function getOperationProviderLabel(provider: string | null | undefined) {
  return provider === WHATSAPP_EXTENSION_PROVIDER ? "Extens\u00e3o do Chrome" : getWhatsAppProviderLabel(provider);
}
