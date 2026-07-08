import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationEventStatus } from "@/lib/supabase/database.types";
import { maskPhone } from "@/lib/utils/phone";

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

type EmbeddedRecipient = {
  nome?: string | null;
  telefone_normalizado?: string | null;
  ativo?: boolean | null;
};

type EventApiRow = {
  id: string;
  cliente_id: string | null;
  certificado_id: string | null;
  type: string;
  dias_restantes: number | null;
  send_date: string;
  status: string;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
  telefone_destino?: string | null;
  notification_recipients?: EmbeddedRecipient | EmbeddedRecipient[] | null;
  clientes?: unknown;
  certificados?: unknown;
  reservation_token_hash?: string | null;
  provider_response?: unknown;
  [key: string]: unknown;
};

function cleanSearch(value: string | null) {
  return value?.trim().replace(/[%,()]/g, "") ?? "";
}

function toFinanceiroEventDto(event: EventApiRow) {
  const recipient = Array.isArray(event.notification_recipients)
    ? event.notification_recipients[0]
    : event.notification_recipients;

  return {
    id: event.id,
    cliente_id: event.cliente_id,
    certificado_id: event.certificado_id,
    type: event.type,
    dias_restantes: event.dias_restantes,
    send_date: event.send_date,
    status: event.status,
    sent_at: event.sent_at,
    failed_at: event.failed_at,
    created_at: event.created_at,
    updated_at: event.updated_at,
    cliente: event.clientes ?? null,
    certificado: event.certificados ?? null,
    destinatario: recipient
      ? {
          nome: recipient.nome,
          telefone_mascarado: maskPhone(recipient.telefone_normalizado ?? event.telefone_destino ?? ""),
          ativo: recipient.ativo,
        }
      : null,
    erro: event.status === "failed" ? "Falha no envio. Um administrador pode consultar os detalhes técnicos." : null,
  };
}

function toAdminEventDto(event: EventApiRow) {
  const safeEvent = { ...event };
  delete safeEvent.reservation_token_hash;
  delete safeEvent.provider_response;
  return safeEvent;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(["admin", "financeiro"]);

  if ("response" in auth) {
    return auth.response;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const sendDate = url.searchParams.get("send_date");
  const recipientId = url.searchParams.get("recipient_id");
  const search = cleanSearch(url.searchParams.get("q"));
  const pagination = parsePagination(url.searchParams);
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("notification_events")
    .select(
      "id, cliente_id, certificado_id, recipient_id, telefone_destino, type, dias_restantes, send_date, status, provider, channel, device_id, reserved_at, reservation_expires_at, processing_started_at, sent_at, failed_at, attempt_count, max_attempts, next_retry_at, idempotency_key, error_message, created_at, updated_at, clientes(nome_razao_social, cnpj), certificados(nome_titular, data_vencimento), notification_recipients(nome, telefone_normalizado, ativo), whatsapp_devices(name)",
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

  if (sendDate && /^\d{4}-\d{2}-\d{2}$/.test(sendDate)) {
    query = query.eq("send_date", sendDate);
  }

  if (recipientId) {
    query = query.eq("recipient_id", recipientId);
  }

  if (search) {
    query = query.or(`mensagem_renderizada.ilike.%${search}%,telefone_destino.ilike.%${search.replace(/\D/g, "") || search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return jsonError("Falha ao listar eventos.", 500, "eventos_erro");
  }

  const events = (data ?? []).map((event) =>
    auth.user.role === "financeiro" ? toFinanceiroEventDto(event as EventApiRow) : toAdminEventDto(event as EventApiRow),
  );

  return NextResponse.json({
    events,
    pagination: createPaginationMeta(count, pagination.page, pagination.pageSize),
  });
}
