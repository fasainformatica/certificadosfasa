import type {
  Database,
  InternalNotificationSeverity,
  InternalNotificationType,
} from "@/lib/supabase/database.types";

export const INTERNAL_NOTIFICATION_TYPES = [
  "certificate_created",
  "certificate_updated",
  "certificate_status_changed",
  "certificate_renewal_status_changed",
  "client_updated",
  "notification_failed",
  "whatsapp_status_changed",
  "system_notice",
] as const satisfies readonly InternalNotificationType[];

export const INTERNAL_NOTIFICATION_SEVERITIES = [
  "info",
  "success",
  "warning",
  "error",
] as const satisfies readonly InternalNotificationSeverity[];

export const INTERNAL_NOTIFICATION_STATES = ["active", "all", "unread", "read", "dismissed"] as const;

export type InternalNotificationState = (typeof INTERNAL_NOTIFICATION_STATES)[number];

export type InternalNotificationApiRow = Pick<
  Database["public"]["Tables"]["internal_notifications"]["Row"],
  | "id"
  | "type"
  | "severity"
  | "title"
  | "body"
  | "href"
  | "entity_type"
  | "entity_id"
  | "certificado_id"
  | "cliente_id"
  | "target_role"
  | "target_user_id"
  | "actor_user_id"
  | "metadata"
  | "created_at"
  | "expires_at"
>;

export type InternalNotificationReadRow =
  Database["public"]["Tables"]["internal_notification_reads"]["Row"];

export type InternalNotificationReadStateDto = {
  notificationId: string;
  readAt: string;
  dismissedAt: string | null;
};

export type InternalNotificationDto = {
  id: string;
  type: InternalNotificationType;
  severity: InternalNotificationSeverity;
  title: string;
  body: string | null;
  href: string | null;
  downloadHref: string | null;
  windowsDownloadHref: string | null;
  downloadLabel: string | null;
  entityType: string | null;
  entityId: string | null;
  certificadoId: string | null;
  clienteId: string | null;
  targetRole: string | null;
  targetUserId: string | null;
  actorUserId: string | null;
  metadata: InternalNotificationApiRow["metadata"];
  createdAt: string;
  expiresAt: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  isRead: boolean;
  isDismissed: boolean;
};

export type InternalNotificationIdFilter = {
  includeIds: string[];
  excludeIds: string[];
  shouldReturnEmpty: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInternalNotificationType(value: string | null): value is InternalNotificationType {
  return INTERNAL_NOTIFICATION_TYPES.includes(value as InternalNotificationType);
}

export function isInternalNotificationSeverity(value: string | null): value is InternalNotificationSeverity {
  return INTERNAL_NOTIFICATION_SEVERITIES.includes(value as InternalNotificationSeverity);
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function parseInternalNotificationState(value: string | null): InternalNotificationState {
  return INTERNAL_NOTIFICATION_STATES.includes(value as InternalNotificationState)
    ? (value as InternalNotificationState)
    : "active";
}

export function createInternalNotificationReadStateMap(readStates: readonly InternalNotificationReadRow[]) {
  return new Map(readStates.map((state) => [state.notification_id, state]));
}

export function buildInternalNotificationIdFilter(
  state: InternalNotificationState,
  readStates: readonly InternalNotificationReadRow[],
): InternalNotificationIdFilter {
  const readIds = readStates.map((readState) => readState.notification_id);
  const dismissedIds = readStates
    .filter((readState) => Boolean(readState.dismissed_at))
    .map((readState) => readState.notification_id);
  const visibleReadIds = readStates
    .filter((readState) => !readState.dismissed_at)
    .map((readState) => readState.notification_id);

  if (state === "unread") {
    return { includeIds: [], excludeIds: readIds, shouldReturnEmpty: false };
  }

  if (state === "read") {
    return { includeIds: visibleReadIds, excludeIds: [], shouldReturnEmpty: visibleReadIds.length === 0 };
  }

  if (state === "dismissed") {
    return { includeIds: dismissedIds, excludeIds: [], shouldReturnEmpty: dismissedIds.length === 0 };
  }

  if (state === "active") {
    return { includeIds: [], excludeIds: dismissedIds, shouldReturnEmpty: false };
  }

  return { includeIds: [], excludeIds: [], shouldReturnEmpty: false };
}

export function toInternalNotificationReadStateDto(
  row: InternalNotificationReadRow,
): InternalNotificationReadStateDto {
  return {
    notificationId: row.notification_id,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
  };
}

export function getInternalNotificationCertificateDownloadHref(row: InternalNotificationApiRow) {
  if (
    !row.certificado_id ||
    (row.type !== "certificate_created" && row.type !== "certificate_updated")
  ) {
    return null;
  }

  return `/api/certificados/${row.certificado_id}/arquivo`;
}

export function getInternalNotificationWindowsCertificateDownloadHref(row: InternalNotificationApiRow) {
  if (
    !row.id ||
    !row.certificado_id ||
    (row.type !== "certificate_created" && row.type !== "certificate_updated")
  ) {
    return null;
  }

  return `/api/internal-notifications/windows/${row.id}/certificate-file`;
}

export function getInternalNotificationDtoDownloadHref(
  notification: Pick<InternalNotificationDto, "type" | "certificadoId" | "downloadHref">,
) {
  if (notification.downloadHref) {
    return notification.downloadHref;
  }

  if (
    !notification.certificadoId ||
    (notification.type !== "certificate_created" && notification.type !== "certificate_updated")
  ) {
    return null;
  }

  return `/api/certificados/${notification.certificadoId}/arquivo`;
}

export function toInternalNotificationDto(
  row: InternalNotificationApiRow,
  readState?: InternalNotificationReadRow,
): InternalNotificationDto {
  const downloadHref = getInternalNotificationCertificateDownloadHref(row);
  const windowsDownloadHref = getInternalNotificationWindowsCertificateDownloadHref(row);

  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    body: row.body,
    href: row.href,
    downloadHref,
    windowsDownloadHref,
    downloadLabel: downloadHref ? "Baixar certificado" : null,
    entityType: row.entity_type,
    entityId: row.entity_id,
    certificadoId: row.certificado_id,
    clienteId: row.cliente_id,
    targetRole: row.target_role,
    targetUserId: row.target_user_id,
    actorUserId: row.actor_user_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    readAt: readState?.read_at ?? null,
    dismissedAt: readState?.dismissed_at ?? null,
    isRead: Boolean(readState?.read_at),
    isDismissed: Boolean(readState?.dismissed_at),
  };
}
