import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { OPERATIONAL_ROLES } from "@/lib/auth/permissions";
import { buildNotificationEventSearchFilter } from "@/lib/notifications/event-search";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationEventStatus, NotificationProvider } from "@/lib/supabase/database.types";
import { isWhatsAppProviderName } from "@/lib/whatsapp/providers";

export const runtime = "nodejs";

const STATUS_FILTERS = new Set<NotificationEventStatus>([
  "pending",
  "reserved",
  "processing",
  "retry",
  "sent",
  "failed",
  "cancelled",
  "skipped",
]);
const TYPE_FILTERS = new Set(["certificate_expiring", "certificate_expired", "manual_test"]);
const AUDIENCE_FILTERS = new Set(["internal", "client"]);

type EventApiRow = {
  id: string;
  cliente_id: string | null;
  certificado_id: string | null;
  type: string;
  audience?: string | null;
  dias_restantes: number | null;
  send_date: string;
  status: string;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  telefone_destino?: string | null;
  notification_recipients?: unknown;
  clientes?: unknown;
  certificados?: unknown;
  provider_response?: unknown;
  [key: string]: unknown;
};

function cleanSearch(value: string | null) {
  return value?.trim().replace(/[%,()]/g, "") ?? "";
}

function toAdminEventDto(event: EventApiRow) {
  const safeEvent = { ...event };
  delete safeEvent.provider_response;
  return safeEvent;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(OPERATIONAL_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const provider = url.searchParams.get("provider");
  const audience = url.searchParams.get("audience");
  const sendDate = url.searchParams.get("send_date");
  const recipientId = url.searchParams.get("recipient_id");
  const search = cleanSearch(url.searchParams.get("q"));
  const pagination = parsePagination(url.searchParams);
  const admin = createSupabaseAdminClient();
  const searchFilter = search ? await buildNotificationEventSearchFilter(admin, search) : null;
  let query = admin
    .from("notification_events")
    .select(
      "id, cliente_id, certificado_id, recipient_id, telefone_destino, type, audience, dias_restantes, send_date, status, provider, channel, provider_message_id, provider_status, dispatched_at, delivered_at, read_at, reserved_at, reservation_expires_at, processing_started_at, sent_at, failed_at, attempt_count, max_attempts, next_retry_at, idempotency_key, error_message, created_at, updated_at, clientes(nome_razao_social, cnpj), certificados(nome_titular, data_vencimento), notification_recipients(nome, telefone_normalizado, ativo)",
      { count: "exact" },
    )
    .order("send_date", { ascending: true })
    .order("created_at", { ascending: false })
    .range(pagination.from, pagination.to);

  if (status && STATUS_FILTERS.has(status as NotificationEventStatus)) {
    query = query.eq("status", status as NotificationEventStatus);
  }

  if (type && TYPE_FILTERS.has(type)) {
    query = query.eq("type", type);
  }

  if (isWhatsAppProviderName(provider)) {
    query = query.eq("provider", provider as NotificationProvider);
  }

  if (audience && AUDIENCE_FILTERS.has(audience)) {
    query = query.eq("audience", audience as "internal" | "client");
  }

  if (sendDate && /^\d{4}-\d{2}-\d{2}$/.test(sendDate)) {
    query = query.eq("send_date", sendDate);
  }

  if (recipientId) {
    query = query.eq("recipient_id", recipientId);
  }

  if (search) {
    if (searchFilter) {
      query = query.or(searchFilter);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return jsonError("Falha ao listar eventos.", 500, "eventos_erro");
  }

  const events = (data ?? []).map((event) => toAdminEventDto(event as EventApiRow));

  return NextResponse.json({
    events,
    pagination: createPaginationMeta(count, pagination.page, pagination.pageSize),
  });
}

