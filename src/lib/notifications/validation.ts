import { z } from "zod";

import { normalizeBrazilianPhone } from "@/lib/utils/phone";

export const EXPIRING_TEMPLATE_VARIABLES = [
  "cliente_nome",
  "cliente_telefone",
  "cnpj",
  "certificado_nome",
  "data_vencimento",
  "dias",
] as const;

export const EXPIRED_TEMPLATE_VARIABLES = [
  "data_hoje",
  "total_vencidos",
  "lista_certificados_vencidos",
  "cliente_telefone",
] as const;

export const REQUIRED_TEMPLATE_VARIABLES = EXPIRING_TEMPLATE_VARIABLES;

function parseNoticeDays(value: unknown, context: z.RefinementCtx) {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  const days = raw
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item));

  if (days.some((item) => !Number.isInteger(item) || item <= 0 || item > 365)) {
    context.addIssue({
      code: "custom",
      message: "Informe apenas numeros inteiros positivos entre 1 e 365.",
    });
    return z.NEVER;
  }

  return Array.from(new Set(days)).sort((left, right) => right - left);
}

export const notificationSettingsSchema = z
  .object({
    enabled: z.coerce.boolean().default(false),
    expired_notifications_enabled: z.coerce.boolean().default(true),
    dias_aviso_vencimento: z
      .unknown()
      .transform((value, context) => parseNoticeDays(value, context)),
    delay_minimo_segundos: z.coerce.number().int().min(30).max(3600),
    delay_maximo_segundos: z.coerce.number().int().min(30).max(3600),
    max_attempts: z.coerce.number().int().min(1).max(10),
    polling_interval_seconds: z.coerce.number().int().min(5).max(25),
    heartbeat_interval_seconds: z.coerce.number().int().min(15).max(300).default(30),
    send_window_start: z.string().trim().regex(/^\d{2}:\d{2}$/),
    send_window_end: z.string().trim().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().trim().min(3).max(80).default("America/Sao_Paulo"),
  })
  .superRefine((value, context) => {
    if (value.enabled && value.dias_aviso_vencimento.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["dias_aviso_vencimento"],
        message: "Informe ao menos um dia de aviso quando o envio automatico estiver ativo.",
      });
    }

    if (value.delay_minimo_segundos > value.delay_maximo_segundos) {
      context.addIssue({
        code: "custom",
        path: ["delay_maximo_segundos"],
        message: "O delay maximo deve ser maior ou igual ao minimo.",
      });
    }
  });

export const templateUpdateSchema = z.object({
  content: z.string().trim().min(30, "O template deve ter ao menos 30 caracteres.").max(1600),
});

export const whatsappDeviceSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome para o dispositivo.").max(80),
});

export const notificationRecipientSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do destinatario.").max(80),
  telefone: z
    .string()
    .trim()
    .min(1, "Informe o WhatsApp do destinatario.")
    .transform((value, context) => {
      try {
        return normalizeBrazilianPhone(value);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Informe um WhatsApp valido.",
        });
        return z.NEVER;
      }
    }),
  ativo: z.coerce.boolean().default(true),
});

export const notificationRecipientUpdateSchema = notificationRecipientSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Informe ao menos um campo para atualizar.",
);

export const botAuthValidateSchema = z.object({
  token: z.string().trim().min(20).max(256),
  signing_secret: z.string().trim().min(20).max(256),
  app_version: z.string().trim().max(40).optional(),
  browser_name: z.string().trim().max(80).optional(),
  user_agent: z.string().trim().max(512).optional(),
});

export const botHeartbeatSchema = z.object({
  whatsapp_status: z
    .enum(["connected", "disconnected", "loading", "qr_required", "error", "sending", "syncing"])
    .default("disconnected"),
  connected_phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value, context) => {
      if (!value) {
        return null;
      }

      try {
        return normalizeBrazilianPhone(value);
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : "Informe um WhatsApp valido.",
        });
        return z.NEVER;
      }
    }),
  app_version: z.string().trim().max(40).optional(),
  browser_name: z.string().trim().max(80).optional(),
  user_agent: z.string().trim().max(512).optional(),
  local_queue_size: z.coerce.number().int().min(0).max(1000).optional(),
  last_error: z.string().trim().max(500).optional().or(z.literal("")),
});

export const botAckSchema = z.object({
  status: z.enum(["processing", "sent", "failed"]),
  reservation_id: z.string().uuid(),
  reservation_token: z.string().trim().min(32).max(256),
  provider_response: z.record(z.string(), z.unknown()).optional(),
  error_message: z.string().trim().max(500).optional(),
  retryable: z.boolean().optional(),
});
