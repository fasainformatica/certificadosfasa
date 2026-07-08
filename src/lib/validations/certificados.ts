import { z } from "zod";

import { normalizeBrazilianPhone } from "@/lib/utils/phone";

export const MAX_PFX_SIZE_BYTES = 10 * 1024 * 1024;

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .email("E-mail invalido.")
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const requiredWhatsapp = z
  .string()
  .trim()
  .min(1, "Informe o WhatsApp do cliente.")
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
  });

export const uploadCertificateFieldsSchema = z.object({
  senha: z.string().min(1, "Informe a senha do certificado.").max(512, "Senha muito longa."),
  cliente_id_manual: z
    .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (value ? value : null)),
  cnpj_manual: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => String(value ?? "").replace(/\D/g, ""))
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || value.length === 14, "CNPJ manual deve ter 14 digitos."),
  nome_razao_social: z.string().trim().min(2, "Informe a razao social do cliente."),
  email: optionalEmail,
  telefone: optionalText,
  whatsapp: requiredWhatsapp,
  responsavel: optionalText,
  observacoes: optionalText,
});

export const clienteInputSchema = z.object({
  nome_razao_social: z.string().trim().min(2, "Informe a razao social."),
  cnpj: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 14, "Informe um CNPJ com 14 digitos."),
  email: optionalEmail,
  telefone: optionalText,
  whatsapp: requiredWhatsapp,
  responsavel: optionalText,
  observacoes: optionalText,
});

export const downloadLinkActionSchema = z.object({
  action: z.enum(["invalidate", "update_password"]),
});

export const publicDownloadPasswordSchema = z.object({
  senha_liberacao: z.string().trim().min(8).max(128),
});

export const configuracoesSistemaInputSchema = z.object({
  dias_aviso_vencimento: z
    .array(z.number().int().min(0).max(365))
    .min(1, "Informe ao menos um limiar de aviso.")
    .max(10, "Informe no maximo 10 limiares."),
});
