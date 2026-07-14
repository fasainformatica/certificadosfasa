import "server-only";

import { createHash } from "crypto";

import {
  EXPIRED_TEMPLATE_VARIABLES,
  EXPIRING_TEMPLATE_VARIABLES,
  REQUIRED_TEMPLATE_VARIABLES,
} from "@/lib/notifications/validation";
import { refreshCertificateStatuses } from "@/lib/certificados/status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_DELAY_MIN_SECONDS = 30;
export const DEFAULT_DELAY_MAX_SECONDS = 60;
export const DEFAULT_POLLING_INTERVAL_SECONDS = 5;
export const MAX_POLLING_INTERVAL_SECONDS = 25;
export const WHATSAPP_SEND_TIMEOUT_SECONDS = 45;
export const RESERVATION_TTL_BUFFER_SECONDS = 120;

const LEGACY_CERTIFICATE_TEMPLATE_WITHOUT_PHONE = `Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Entre em contato com o cliente para realizar a renovacao.`;

export const DEFAULT_CERTIFICATE_TEMPLATE = `Atencao!

O certificado digital do cliente {cliente_nome}, CNPJ {cnpj}, vencera em {dias} dia(s).

Data de vencimento: {data_vencimento}

Telefone do cliente: {cliente_telefone}

Entre em contato com o cliente para realizar a renovacao.`;

export const DEFAULT_EXPIRED_CERTIFICATE_TEMPLATE = `Atencao!

Existem {total_vencidos} certificado(s) vencido(s) em {data_hoje}:

{lista_certificados_vencidos}

Favor entrar em contato com os clientes para regularizacao.`;

const TEMPLATE_VARIABLE_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;
const REBUILDABLE_STATUSES = ["pending", "retry", "cancelled", "skipped"] as const;
type NotificationTemplateType = "certificate_expiring" | "certificate_expired";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type NotificationSettingsRow = {
  id: string;
  enabled: boolean;
  expired_notifications_enabled: boolean;
  dias_aviso_vencimento: number[];
  delay_minimo_segundos: number;
  delay_maximo_segundos: number;
  max_attempts: number;
  polling_interval_seconds: number;
  heartbeat_interval_seconds: number;
  send_window_start: string;
  send_window_end: string;
  timezone: string;
};

type LegacyDelaySettings = {
  delay_min_seconds?: number | null;
  delay_max_seconds?: number | null;
};

type ClienteRow = {
  id: string;
  nome_razao_social: string;
  cnpj: string;
  telefone: string | null;
  whatsapp: string | null;
};

type CertificadoWithCliente = {
  id: string;
  cliente_id: string;
  cnpj: string;
  nome_titular: string;
  data_vencimento: string;
  status: string;
  clientes: ClienteRow | ClienteRow[] | null;
};

type NotificationTemplateRow = {
  id: string;
  type: string;
  content: string;
};

type NotificationRecipientRow = {
  id: string;
  nome: string;
  telefone_normalizado: string;
  ativo: boolean;
};

export type NotificationRebuildResult = {
  run_id: string | null;
  certificados_verificados: number;
  destinatarios_ativos: number;
  eventos_removidos: number;
  eventos_criados: number;
  eventos_ignorados_idempotencia: number;
  skipped: boolean;
  skipped_reason: string | null;
  errors: string[];
};

export type DueNotificationJobResult = {
  run_id: string | null;
  eventos_elegiveis: number;
  eventos_vencidos_criados: number;
  eventos_vencidos_ignorados_idempotencia: number;
  certificados_vencidos: number;
  reservas_expiradas_liberadas: number;
  skipped: boolean;
  skipped_reason: string | null;
  errors: string[];
};

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function dateOnlyToUtc(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function utcToDateString(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

export function getTodayDateString(timeZone: string) {
  const today = getDatePartsInTimeZone(new Date(), timeZone);
  return utcToDateString(Date.UTC(today.year, today.month - 1, today.day));
}

export function calculateDaysUntilExpiration(value: string, timeZone: string) {
  const target = dateOnlyToUtc(value);

  if (target === null) {
    return null;
  }

  const today = dateOnlyToUtc(getTodayDateString(timeZone));

  if (today === null) {
    return null;
  }

  return Math.round((target - today) / 86_400_000);
}

export function calculateSendDate(dataVencimento: string, dias: number) {
  const target = dateOnlyToUtc(dataVencimento);

  if (target === null) {
    return null;
  }

  return utcToDateString(target - dias * 86_400_000);
}

export function formatDatePtBr(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function getAllowedVariablesForTemplate(type: NotificationTemplateType) {
  return type === "certificate_expired" ? EXPIRED_TEMPLATE_VARIABLES : EXPIRING_TEMPLATE_VARIABLES;
}

export function validateTemplateContent(content: string, type: NotificationTemplateType = "certificate_expiring") {
  const variables = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = TEMPLATE_VARIABLE_PATTERN.exec(content)) !== null) {
    variables.add(match[1] ?? "");
  }

  const allowed = new Set(getAllowedVariablesForTemplate(type));
  const unknown = Array.from(variables).filter((item) => !allowed.has(item as never));

  if (unknown.length > 0) {
    throw new Error(`Variaveis nao permitidas: ${unknown.join(", ")}.`);
  }

  const lower = content.toLowerCase();
  const blockedTerms = ["senha", "storage_path", "link publico", "download", "cert_encryption_key", "storage path"];

  if (blockedTerms.some((term) => lower.includes(term))) {
    throw new Error("O template nao pode conter senha, link publico, download ou storage path.");
  }
}

export function clampNotificationDelaySettings(
  settings:
    | ({
        delay_minimo_segundos?: number | null;
        delay_maximo_segundos?: number | null;
      } & LegacyDelaySettings)
    | null
    | undefined,
) {
  const legacyAwareMin = settings?.delay_minimo_segundos ?? settings?.delay_min_seconds;
  const legacyAwareMax = settings?.delay_maximo_segundos ?? settings?.delay_max_seconds;
  const rawMin = Number(legacyAwareMin);
  const rawMax = Number(legacyAwareMax);
  const delayMin =
    Number.isFinite(rawMin) && rawMin >= DEFAULT_DELAY_MIN_SECONDS ? rawMin : DEFAULT_DELAY_MIN_SECONDS;
  const delayMax =
    Number.isFinite(rawMax) && rawMax >= delayMin ? rawMax : Math.max(DEFAULT_DELAY_MAX_SECONDS, delayMin);

  return {
    delay_minimo_segundos: delayMin,
    delay_maximo_segundos: delayMax,
    delay_min_seconds: delayMin,
    delay_max_seconds: delayMax,
  };
}

export function clampNotificationPollingInterval(value: number | null | undefined) {
  const rawValue = Number(value);

  if (
    !Number.isFinite(rawValue) ||
    rawValue < DEFAULT_POLLING_INTERVAL_SECONDS ||
    rawValue > MAX_POLLING_INTERVAL_SECONDS
  ) {
    return DEFAULT_POLLING_INTERVAL_SECONDS;
  }

  return rawValue;
}

export function calculateReservationTtlSeconds(
  settings:
    | ({
        delay_minimo_segundos?: number | null;
        delay_maximo_segundos?: number | null;
      } & LegacyDelaySettings)
    | null
    | undefined,
) {
  const delays = clampNotificationDelaySettings(settings);
  return delays.delay_maximo_segundos + WHATSAPP_SEND_TIMEOUT_SECONDS + RESERVATION_TTL_BUFFER_SECONDS;
}

function getCliente(certificado: CertificadoWithCliente) {
  if (Array.isArray(certificado.clientes)) {
    return certificado.clientes[0] ?? null;
  }

  return certificado.clientes;
}

function getClienteTelefone(cliente: Pick<ClienteRow, "telefone" | "whatsapp"> | null | undefined) {
  const telefone = cliente?.whatsapp?.trim() || cliente?.telefone?.trim();

  return telefone || "Telefone nao cadastrado";
}

export function renderCertificateTemplate({
  content,
  cliente,
  certificado,
  dias,
}: {
  content: string;
  cliente: ClienteRow;
  certificado: CertificadoWithCliente;
  dias: number;
}) {
  validateTemplateContent(content, "certificate_expiring");

  const replacements: Record<(typeof REQUIRED_TEMPLATE_VARIABLES)[number], string> = {
    cliente_nome: cliente.nome_razao_social,
    cliente_telefone: getClienteTelefone(cliente),
    cnpj: certificado.cnpj,
    certificado_nome: certificado.nome_titular,
    data_vencimento: formatDatePtBr(certificado.data_vencimento),
    dias: String(dias),
  };

  return content.replace(TEMPLATE_VARIABLE_PATTERN, (_full, key: string) => {
    return replacements[key as keyof typeof replacements] ?? "";
  });
}

function formatCnpjForMessage(cnpj: string) {
  const digits = cnpj.replace(/\D/g, "");

  if (digits.length !== 14) {
    return cnpj;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function maskCnpjForPayload(cnpj: string) {
  const digits = cnpj.replace(/\D/g, "");

  if (digits.length !== 14) {
    return "[cnpj]";
  }

  return `${digits.slice(0, 2)}.***.***/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function calculateOverdueDays(dataVencimento: string, today: string) {
  const expirationDate = dateOnlyToUtc(dataVencimento);
  const currentDate = dateOnlyToUtc(today);

  if (expirationDate === null || currentDate === null) {
    return 0;
  }

  return Math.max(0, Math.round((currentDate - expirationDate) / 86_400_000));
}

function renderExpiredCertificatesTemplate({
  content,
  certificados,
  today,
}: {
  content: string;
  certificados: CertificadoWithCliente[];
  today: string;
}) {
  validateTemplateContent(content, "certificate_expired");

  const list = certificados
    .map((certificado) => {
      const cliente = getCliente(certificado);
      const clienteNome = cliente?.nome_razao_social ?? certificado.nome_titular;
      const clienteTelefone = getClienteTelefone(cliente);
      const diasVencidos = calculateOverdueDays(certificado.data_vencimento, today);

      return `- ${clienteNome} | CNPJ ${formatCnpjForMessage(certificado.cnpj)} | Telefone: ${clienteTelefone} | Venceu em ${formatDatePtBr(certificado.data_vencimento)} | ha ${diasVencidos} dia(s)`;
    })
    .join("\n");
  const telefones = Array.from(new Set(certificados.map((certificado) => getClienteTelefone(getCliente(certificado)))))
    .filter(Boolean)
    .join(", ");

  const replacements: Record<(typeof EXPIRED_TEMPLATE_VARIABLES)[number], string> = {
    data_hoje: formatDatePtBr(today),
    total_vencidos: String(certificados.length),
    lista_certificados_vencidos: list,
    cliente_telefone: telefones || "Telefone nao cadastrado",
  };

  return content.replace(TEMPLATE_VARIABLE_PATTERN, (_full, key: string) => {
    return replacements[key as keyof typeof replacements] ?? "";
  });
}

async function ensureTemplate({
  admin,
  type,
  title,
  content,
}: {
  admin: AdminClient;
  type: NotificationTemplateType;
  title: string;
  content: string;
}) {
  validateTemplateContent(content, type);

  const { data: existing, error } = await admin
    .from("notification_templates")
    .select("*")
    .eq("type", type)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (
    existing &&
    type === "certificate_expiring" &&
    typeof existing.content === "string" &&
    (existing.content.includes("{empresa}") || existing.content.trim() === LEGACY_CERTIFICATE_TEMPLATE_WITHOUT_PHONE.trim())
  ) {
    const { data, error: updateError } = await admin
      .from("notification_templates")
      .update({ content })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return data as NotificationTemplateRow;
  }

  if (existing) {
    return existing as NotificationTemplateRow;
  }

  const { data, error: insertError } = await admin
    .from("notification_templates")
    .insert({
      type,
      title,
      content,
      active: true,
    })
    .select("*")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return data as NotificationTemplateRow;
}

export async function ensureDefaultNotificationTemplates() {
  const admin = createSupabaseAdminClient();
  const expiring = await ensureTemplate({
    admin,
    type: "certificate_expiring",
    title: "Aviso de vencimento de certificado",
    content: DEFAULT_CERTIFICATE_TEMPLATE,
  });
  const expired = await ensureTemplate({
    admin,
    type: "certificate_expired",
    title: "Certificados vencidos",
    content: DEFAULT_EXPIRED_CERTIFICATE_TEMPLATE,
  });

  return { expiring, expired };
}

export async function ensureDefaultNotificationTemplate() {
  const templates = await ensureDefaultNotificationTemplates();
  return templates.expiring;
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/qwep_(live|sig)_[A-Za-z0-9_-]+/g, "[secret]")
    .replace(/pfx_(live|sig)_[A-Za-z0-9_-]+/g, "[secret]")
    .replace(/\b55\d{10,11}\b/g, "[telefone]")
    .slice(0, 500);
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeNoticeDays(settings: Pick<NotificationSettingsRow, "dias_aviso_vencimento"> | null) {
  const days = Array.isArray(settings?.dias_aviso_vencimento)
    ? settings.dias_aviso_vencimento.filter((day) => Number.isInteger(day) && day > 0)
    : [];

  return Array.from(new Set(days)).sort((left, right) => right - left);
}

async function loadNotificationSettings(admin: AdminClient) {
  const { data: settings, error: settingsError } = await admin
    .from("notification_settings")
    .select("*")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  return settings as NotificationSettingsRow | null;
}

async function loadActiveRecipients(admin: AdminClient) {
  const { data, error } = await admin
    .from("notification_recipients")
    .select("id, nome, telefone_normalizado, ativo")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as NotificationRecipientRow[];
}

async function removeFutureUnsentEvents({
  admin,
  today,
}: {
  admin: AdminClient;
  today: string;
}) {
  const { data, error } = await admin
    .from("notification_events")
    .delete()
    .eq("type", "certificate_expiring")
    .gte("send_date", today)
    .in("status", [...REBUILDABLE_STATUSES])
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

async function createPlannedExpirationEvent({
  admin,
  certificado,
  recipient,
  settings,
  template,
  dias,
  sendDate,
}: {
  admin: AdminClient;
  certificado: CertificadoWithCliente;
  recipient: NotificationRecipientRow;
  settings: NotificationSettingsRow;
  template: NotificationTemplateRow;
  dias: number;
  sendDate: string;
}) {
  const cliente = getCliente(certificado);

  if (!cliente) {
    return "skipped_no_client" as const;
  }

  const idempotencyKey = `certificado:${certificado.id}:dias:${dias}:recipient:${recipient.id}:send:${sendDate}`;
  const renderedMessage = renderCertificateTemplate({
    content: template.content,
    cliente,
    certificado,
    dias,
  });
  const payload = {
    cliente_nome: cliente.nome_razao_social,
    cliente_telefone: getClienteTelefone(cliente),
    cnpj_hash: createHash("sha256").update(certificado.cnpj).digest("hex"),
    certificado_nome: certificado.nome_titular,
    data_vencimento: certificado.data_vencimento,
    dias,
    send_date: sendDate,
    recipient_id: recipient.id,
    source: "notification_rebuild_service",
    payload_hash: payloadHash({
      certificado_id: certificado.id,
      cliente_id: certificado.cliente_id,
      recipient_id: recipient.id,
      dias,
      send_date: sendDate,
    }),
  } satisfies Json;

  const { error: insertError } = await admin.from("notification_events").insert({
    cliente_id: certificado.cliente_id,
    certificado_id: certificado.id,
    recipient_id: recipient.id,
    telefone_destino: recipient.telefone_normalizado,
    template_id: template.id,
    type: "certificate_expiring",
    dias_restantes: dias,
    send_date: sendDate,
    mensagem_renderizada: renderedMessage,
    status: "pending",
    provider: "whatsapp_desktop",
    channel: "whatsapp",
    attempt_count: 0,
    max_attempts: settings.max_attempts,
    idempotency_key: idempotencyKey,
    payload,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return "duplicate" as const;
    }

    throw new Error(insertError.message);
  }

  return "created" as const;
}

async function insertPlannedExpirationRowsInChunks({
  admin,
  rows,
  fallback,
}: {
  admin: AdminClient;
  rows: DatabaseNotificationEventInsert[];
  fallback: () => Promise<{ created: number; duplicate: number }>;
}) {
  const chunkSize = 500;
  let created = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error } = await admin.from("notification_events").insert(chunk).select("id");

    if (error) {
      if (error.code === "23505") {
        const fallbackResult = await fallback();
        return {
          created: created + fallbackResult.created,
          duplicate: fallbackResult.duplicate,
        };
      }

      throw new Error(error.message);
    }

    created += data?.length ?? 0;
  }

  return { created, duplicate: 0 };
}

type DatabaseNotificationEventInsert = {
  cliente_id: string;
  certificado_id: string;
  recipient_id: string;
  telefone_destino: string;
  template_id: string;
  type: "certificate_expiring";
  dias_restantes: number;
  send_date: string;
  mensagem_renderizada: string;
  status: "pending";
  provider: "whatsapp_desktop";
  channel: "whatsapp";
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string;
  payload: Json;
};

async function createPlannedExpirationEventsBatch({
  admin,
  certificados,
  recipients,
  settings,
  template,
  noticeDays,
  today,
}: {
  admin: AdminClient;
  certificados: CertificadoWithCliente[];
  recipients: NotificationRecipientRow[];
  settings: NotificationSettingsRow;
  template: NotificationTemplateRow;
  noticeDays: number[];
  today: string;
}) {
  const rows: DatabaseNotificationEventInsert[] = [];
  let certificadosVerificados = 0;

  for (const certificado of certificados) {
    certificadosVerificados += 1;
    const cliente = getCliente(certificado);

    if (!cliente) {
      continue;
    }

    for (const dias of noticeDays) {
      const sendDate = calculateSendDate(certificado.data_vencimento, dias);

      if (!sendDate || sendDate < today) {
        continue;
      }

      for (const recipient of recipients) {
        const idempotencyKey = `certificado:${certificado.id}:dias:${dias}:recipient:${recipient.id}:send:${sendDate}`;
        const payload = {
          cliente_nome: cliente.nome_razao_social,
          cliente_telefone: getClienteTelefone(cliente),
          cnpj_hash: createHash("sha256").update(certificado.cnpj).digest("hex"),
          certificado_nome: certificado.nome_titular,
          data_vencimento: certificado.data_vencimento,
          dias,
          send_date: sendDate,
          recipient_id: recipient.id,
          source: "notification_rebuild_service",
          payload_hash: payloadHash({
            certificado_id: certificado.id,
            cliente_id: certificado.cliente_id,
            recipient_id: recipient.id,
            dias,
            send_date: sendDate,
          }),
        } satisfies Json;

        rows.push({
          cliente_id: certificado.cliente_id,
          certificado_id: certificado.id,
          recipient_id: recipient.id,
          telefone_destino: recipient.telefone_normalizado,
          template_id: template.id,
          type: "certificate_expiring",
          dias_restantes: dias,
          send_date: sendDate,
          mensagem_renderizada: renderCertificateTemplate({
            content: template.content,
            cliente,
            certificado,
            dias,
          }),
          status: "pending",
          provider: "whatsapp_desktop",
          channel: "whatsapp",
          attempt_count: 0,
          max_attempts: settings.max_attempts,
          idempotency_key: idempotencyKey,
          payload,
        });
      }
    }
  }

  const fallback = async () => {
    let created = 0;
    let duplicate = 0;

    for (const certificado of certificados) {
      for (const dias of noticeDays) {
        const sendDate = calculateSendDate(certificado.data_vencimento, dias);

        if (!sendDate || sendDate < today) {
          continue;
        }

        for (const recipient of recipients) {
          const createResult = await createPlannedExpirationEvent({
            admin,
            certificado,
            recipient,
            dias,
            sendDate,
            settings,
            template,
          });

          if (createResult === "duplicate") {
            duplicate += 1;
          }

          if (createResult === "created") {
            created += 1;
          }
        }
      }
    }

    return { created, duplicate };
  };

  const inserted = rows.length > 0 ? await insertPlannedExpirationRowsInChunks({ admin, rows, fallback }) : { created: 0, duplicate: 0 };

  return {
    certificados_verificados: certificadosVerificados,
    eventos_criados: inserted.created,
    eventos_ignorados_idempotencia: inserted.duplicate,
  };
}

async function loadActiveOrExpiredCertificates(admin: AdminClient, today: string) {
  const { data, error } = await admin
    .from("certificados")
    .select("id, cliente_id, cnpj, nome_titular, data_vencimento, status, clientes(id,nome_razao_social,cnpj,telefone,whatsapp)")
    .neq("status", "invalido")
    .lt("data_vencimento", today)
    .order("data_vencimento", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CertificadoWithCliente[];
}

async function createDailyExpiredEvents({
  admin,
  settings,
  recipients,
  template,
  today,
}: {
  admin: AdminClient;
  settings: NotificationSettingsRow;
  recipients: NotificationRecipientRow[];
  template: NotificationTemplateRow;
  today: string;
}) {
  const expiredCertificates = await loadActiveOrExpiredCertificates(admin, today);
  const result = {
    certificados_vencidos: expiredCertificates.length,
    eventos_criados: 0,
    eventos_ignorados_idempotencia: 0,
  };

  if (expiredCertificates.length === 0 || recipients.length === 0) {
    return result;
  }

  const renderedMessage = renderExpiredCertificatesTemplate({
    content: template.content,
    certificados: expiredCertificates,
    today,
  });
  const sanitizedList = expiredCertificates.map((certificado) => {
    const cliente = getCliente(certificado);

    return {
      certificado_id: certificado.id,
      cliente_id: certificado.cliente_id,
      cliente_nome: cliente?.nome_razao_social ?? certificado.nome_titular,
      cliente_telefone: getClienteTelefone(cliente),
      cnpj_mascarado: maskCnpjForPayload(certificado.cnpj),
      cnpj_hash: createHash("sha256").update(certificado.cnpj).digest("hex"),
      certificado_nome: certificado.nome_titular,
      data_vencimento: certificado.data_vencimento,
      dias_vencidos: calculateOverdueDays(certificado.data_vencimento, today),
    };
  });

  for (const recipient of recipients) {
    const idempotencyKey = `expired:date:${today}:recipient:${recipient.id}`;
    const payload = {
      data_hoje: today,
      total_vencidos: expiredCertificates.length,
      lista_certificados_vencidos: sanitizedList,
      recipient_id: recipient.id,
      source: "daily_expired_certificate_job",
      payload_hash: payloadHash({
        today,
        recipient_id: recipient.id,
        certificados: sanitizedList.map((item) => ({
          certificado_id: item.certificado_id,
          data_vencimento: item.data_vencimento,
        })),
      }),
    } satisfies Json;

    const { error } = await admin.from("notification_events").insert({
      cliente_id: null,
      certificado_id: null,
      recipient_id: recipient.id,
      telefone_destino: recipient.telefone_normalizado,
      template_id: template.id,
      type: "certificate_expired",
      dias_restantes: 0,
      send_date: today,
      mensagem_renderizada: renderedMessage,
      status: "pending",
      provider: "whatsapp_desktop",
      channel: "whatsapp",
      attempt_count: 0,
      max_attempts: settings.max_attempts,
      idempotency_key: idempotencyKey,
      payload,
    });

    if (error) {
      if (error.code === "23505") {
        const { error: updateError } = await admin
          .from("notification_events")
          .update({
            telefone_destino: recipient.telefone_normalizado,
            template_id: template.id,
            mensagem_renderizada: renderedMessage,
            max_attempts: settings.max_attempts,
            payload,
          })
          .eq("idempotency_key", idempotencyKey)
          .in("status", ["pending", "retry"]);

        if (updateError) {
          throw new Error(updateError.message);
        }

        result.eventos_ignorados_idempotencia += 1;
        continue;
      }

      throw new Error(error.message);
    }

    result.eventos_criados += 1;
  }

  return result;
}

export async function rebuildNotificationSchedule({
  triggeredBy,
  userId = null,
}: {
  triggeredBy: "cron" | "manual" | "system";
  userId?: string | null;
}): Promise<NotificationRebuildResult> {
  const admin = createSupabaseAdminClient();
  let runId: string | null = null;
  const result: NotificationRebuildResult = {
    run_id: null,
    certificados_verificados: 0,
    destinatarios_ativos: 0,
    eventos_removidos: 0,
    eventos_criados: 0,
    eventos_ignorados_idempotencia: 0,
    skipped: false,
    skipped_reason: null,
    errors: [],
  };

  try {
    const { data: run } = await admin
      .from("notification_runs")
      .insert({
        status: "running",
        triggered_by: triggeredBy,
        created_by: userId,
      })
      .select("id")
      .single();

    runId = run?.id ?? null;
    result.run_id = runId;

    const settings = await loadNotificationSettings(admin);
    const effectiveTimezone = settings?.timezone || "America/Sao_Paulo";
    const today = getTodayDateString(effectiveTimezone);
    await refreshCertificateStatuses(settings?.dias_aviso_vencimento ?? [30, 15, 7], today);
    result.eventos_removidos = await removeFutureUnsentEvents({ admin, today });

    if (!settings?.enabled) {
      result.skipped = true;
      result.skipped_reason = "notifications_disabled";
      await finishRun(admin, runId, result, "completed");
      return result;
    }

    const noticeDays = normalizeNoticeDays(settings);

    if (noticeDays.length === 0) {
      result.skipped = true;
      result.skipped_reason = "notice_days_empty";
      await finishRun(admin, runId, result, "completed");
      return result;
    }

    const recipients = await loadActiveRecipients(admin);
    result.destinatarios_ativos = recipients.length;

    if (recipients.length === 0) {
      result.skipped = true;
      result.skipped_reason = "no_active_recipients";
      await finishRun(admin, runId, result, "completed");
      return result;
    }

    const template = (await ensureDefaultNotificationTemplate()) as NotificationTemplateRow;
    validateTemplateContent(template.content);

    const { data: certificados, error: certificadosError } = await admin
      .from("certificados")
      .select("id, cliente_id, cnpj, nome_titular, data_vencimento, status, clientes(id,nome_razao_social,cnpj,telefone,whatsapp)")
      .neq("status", "invalido");

    if (certificadosError) {
      throw new Error(certificadosError.message);
    }

    const batchResult = await createPlannedExpirationEventsBatch({
      admin,
      certificados: (certificados ?? []) as CertificadoWithCliente[],
      recipients,
      settings,
      template,
      noticeDays,
      today,
    });

    result.certificados_verificados = batchResult.certificados_verificados;
    result.eventos_criados = batchResult.eventos_criados;
    result.eventos_ignorados_idempotencia = batchResult.eventos_ignorados_idempotencia;

    await finishRun(admin, runId, result, "completed");
    return result;
  } catch (error) {
    const message = sanitizeError(error);
    result.errors.push(message);

    if (runId) {
      await admin
        .from("notification_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          erro: message,
        })
        .eq("id", runId);
    }

    return result;
  }
}

async function finishRun(
  admin: AdminClient,
  runId: string | null,
  result: Pick<
    NotificationRebuildResult,
    "certificados_verificados" | "eventos_criados" | "eventos_ignorados_idempotencia"
  >,
  status: "completed" | "partial",
) {
  if (!runId) {
    return;
  }

  await admin
    .from("notification_runs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      certificados_verificados: result.certificados_verificados,
      eventos_criados: result.eventos_criados,
      eventos_ignorados_idempotencia: result.eventos_ignorados_idempotencia,
    })
    .eq("id", runId);
}

export async function runDueNotificationJob({
  triggeredBy,
  userId = null,
}: {
  triggeredBy: "cron" | "manual" | "system";
  userId?: string | null;
}): Promise<DueNotificationJobResult> {
  const admin = createSupabaseAdminClient();
  let runId: string | null = null;
  const result: DueNotificationJobResult = {
    run_id: null,
    eventos_elegiveis: 0,
    eventos_vencidos_criados: 0,
    eventos_vencidos_ignorados_idempotencia: 0,
    certificados_vencidos: 0,
    reservas_expiradas_liberadas: 0,
    skipped: false,
    skipped_reason: null,
    errors: [],
  };

  try {
    const { data: run } = await admin
      .from("notification_runs")
      .insert({
        status: "running",
        triggered_by: triggeredBy,
        created_by: userId,
      })
      .select("id")
      .single();

    runId = run?.id ?? null;
    result.run_id = runId;

    const settings = await loadNotificationSettings(admin);

    if (!settings?.enabled) {
      result.skipped = true;
      result.skipped_reason = "notifications_disabled";
    } else {
      const today = getTodayDateString(settings.timezone || "America/Sao_Paulo");
      await refreshCertificateStatuses(settings.dias_aviso_vencimento ?? [30, 15, 7], today);
      const { data: released } = await admin.rpc("release_expired_notification_reservations");
      result.reservas_expiradas_liberadas = Number(released ?? 0);
      await admin.rpc("cleanup_qwep_operational_tables");

      const recipients = await loadActiveRecipients(admin);

      if ((settings.expired_notifications_enabled ?? true) && recipients.length > 0) {
        const { expired } = await ensureDefaultNotificationTemplates();
        validateTemplateContent(expired.content, "certificate_expired");
        const expiredResult = await createDailyExpiredEvents({
          admin,
          settings,
          recipients,
          template: expired,
          today,
        });
        result.certificados_vencidos = expiredResult.certificados_vencidos;
        result.eventos_vencidos_criados = expiredResult.eventos_criados;
        result.eventos_vencidos_ignorados_idempotencia = expiredResult.eventos_ignorados_idempotencia;
      }

      const { count, error } = await admin
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "retry"])
        .lte("send_date", today);

      if (error) {
        throw new Error(error.message);
      }

      result.eventos_elegiveis = count ?? 0;
    }

    if (runId) {
      await admin
        .from("notification_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "completed",
          certificados_verificados: result.certificados_vencidos,
          eventos_criados: result.eventos_vencidos_criados,
          eventos_ignorados_idempotencia: result.eventos_vencidos_ignorados_idempotencia,
        })
        .eq("id", runId);
    }

    return result;
  } catch (error) {
    const message = sanitizeError(error);
    result.errors.push(message);

    if (runId) {
      await admin
        .from("notification_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "failed",
          erro: message,
        })
        .eq("id", runId);
    }

    return result;
  }
}
