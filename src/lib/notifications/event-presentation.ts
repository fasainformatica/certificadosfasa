import { daysUntilDate } from "@/lib/certificados/status";
import type { NotificationEventStatus } from "@/lib/supabase/database.types";
import { formatDate, formatDateTimeShort, formatRelativeExpiration } from "@/lib/utils/format";

export type NotificationTone = "blue" | "green" | "amber" | "red" | "slate";

export const NOTIFICATION_EVENT_STATUSES = [
  "pending",
  "reserved",
  "processing",
  "retry",
  "sent",
  "failed",
  "cancelled",
  "skipped",
] as const satisfies readonly NotificationEventStatus[];

export const NOTIFICATION_EVENT_STATUS_META: Record<NotificationEventStatus, { label: string; tone: NotificationTone }> = {
  pending: { label: "Na fila", tone: "blue" },
  reserved: { label: "Reservado", tone: "blue" },
  processing: { label: "Em processamento", tone: "blue" },
  retry: { label: "Nova tentativa agendada", tone: "amber" },
  sent: { label: "Enviado", tone: "green" },
  failed: { label: "Falha no envio", tone: "red" },
  cancelled: { label: "Cancelado", tone: "slate" },
  skipped: { label: "Ignorado", tone: "slate" },
};

export const NOTIFICATION_EVENT_TYPES = ["certificate_expiring", "certificate_expired"] as const;

export const NOTIFICATION_EVENT_TYPE_LABELS: Record<(typeof NOTIFICATION_EVENT_TYPES)[number], string> = {
  certificate_expiring: "Aviso de vencimento",
  certificate_expired: "Resumo de vencidos",
};

type NotificationPresentationEvent = {
  status: string;
  type: string;
  dias_restantes: number | null;
  send_date: string;
  sent_at?: string | null;
  failed_at?: string | null;
  next_retry_at?: string | null;
  created_at?: string | null;
  error_message?: string | null;
  certificados?: {
    data_vencimento: string | null;
  } | null;
};

export function isRetryableNotificationStatus(status: string) {
  return status === "failed" || status === "cancelled" || status === "skipped";
}

export function getNotificationNoticeText(event: Pick<NotificationPresentationEvent, "type" | "dias_restantes" | "certificados">) {
  if (event.type === "certificate_expired") {
    return "Resumo diário de certificados vencidos";
  }

  if (typeof event.dias_restantes === "number") {
    return formatRelativeExpiration(event.dias_restantes);
  }

  if (event.certificados?.data_vencimento) {
    return formatRelativeExpiration(daysUntilDate(event.certificados.data_vencimento));
  }

  return "Aviso planejado";
}

export function getNotificationLastAttemptAt(
  event: Pick<NotificationPresentationEvent, "failed_at" | "sent_at" | "next_retry_at" | "created_at">,
) {
  return event.failed_at ?? event.sent_at ?? event.next_retry_at ?? event.created_at ?? null;
}

export function getSafeNotificationErrorMessage(errorMessage: string | null | undefined) {
  const raw = errorMessage?.trim();

  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();

  if (normalized.includes("for update") || normalized.includes("outer join") || normalized.includes("reserve")) {
    return "Não foi possível reservar a próxima mensagem.";
  }

  if (normalized.includes("provider_disabled") || normalized.includes("feature flag") || normalized.includes("disabled")) {
    return "O envio automático está pausado pela configuração.";
  }

  if (normalized.includes("rate") || normalized.includes("429") || normalized.includes("too many")) {
    return "O canal recusou o volume atual. Aguarde a próxima tentativa automática.";
  }

  if (normalized.includes("timeout") || normalized.includes("econnreset") || normalized.includes("network") || normalized.includes("fetch failed")) {
    return "A integração demorou para responder. Tente novamente em alguns instantes.";
  }

  if (normalized.includes("unauthorized") || normalized.includes("forbidden") || normalized.includes("401") || normalized.includes("403")) {
    return "Não foi possível autenticar a integração. Revise as configurações do WhatsApp.";
  }

  if (normalized.includes("numero") || normalized.includes("número") || normalized.includes("telefone") || normalized.includes("whatsapp")) {
    return "O telefone do destinatário precisa ser revisado antes de um novo envio.";
  }

  return "Não foi possível concluir o envio. Verifique a integração e tente novamente.";
}

export function getNotificationRecommendedAction(event: NotificationPresentationEvent, options: { today?: string } = {}) {
  if (event.status === "failed") {
    return "Verificar o motivo e tentar novamente";
  }

  if (event.status === "retry" && event.next_retry_at) {
    return `Nova tentativa em ${formatDateTimeShort(event.next_retry_at)}`;
  }

  if (event.status === "pending") {
    return options.today && event.send_date <= options.today
      ? "Aguardando o próximo disparo"
      : `Programado para ${formatDate(event.send_date)}`;
  }

  if (event.status === "reserved" || event.status === "processing") {
    return "Acompanhar processamento";
  }

  if (event.status === "sent") {
    return "Envio concluído";
  }

  if (event.status === "cancelled") {
    return "Reenfileirar se o aviso ainda for necessário";
  }

  if (event.status === "skipped") {
    return "Revisar regra do aviso";
  }

  return event.type === "certificate_expired" ? "Revisar certificados vencidos" : "Acompanhar renovação";
}
