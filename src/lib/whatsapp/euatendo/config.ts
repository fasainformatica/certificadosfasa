import "server-only";

import { z } from "zod";

import { getOptionalEnv } from "@/lib/supabase/env";

import { EuAtendoProviderError } from "./errors";
import {
  EUATENDO_PROVIDER,
  WHATSAPP_EXTENSION_PROVIDER,
  type EuAtendoConfigStatus,
  type WhatsAppProviderName,
} from "./types";

const configSchema = z.object({
  apiUrl: z.string().trim().url(),
  apiToken: z.string().trim().min(20).nullable(),
  instanceId: z.string().trim().min(8).nullable(),
  enabled: z.boolean(),
});

function readEnabledFlag() {
  const raw = getOptionalEnv("EUATENDO_PROVIDER_ENABLED") ?? "false";
  return ["1", "true", "yes", "sim"].includes(raw.trim().toLowerCase());
}

export function getEuAtendoConfigStatus(): EuAtendoConfigStatus {
  return {
    enabled: readEnabledFlag(),
    apiUrlConfigured: Boolean(getOptionalEnv("EUATENDO_API_URL") ?? "https://apicluster.euatendo.app"),
    tokenConfigured: Boolean(getOptionalEnv("EUATENDO_API_TOKEN")),
    instanceConfigured: Boolean(getOptionalEnv("EUATENDO_INSTANCE_ID")),
  };
}

export function getEuAtendoConfig({ requireCredentials = false }: { requireCredentials?: boolean } = {}) {
  const parsed = configSchema.safeParse({
    apiUrl: getOptionalEnv("EUATENDO_API_URL") ?? "https://apicluster.euatendo.app",
    apiToken: getOptionalEnv("EUATENDO_API_TOKEN"),
    instanceId: getOptionalEnv("EUATENDO_INSTANCE_ID"),
    enabled: readEnabledFlag(),
  });

  if (!parsed.success) {
    throw new EuAtendoProviderError({
      code: "CONFIGURATION_ERROR",
      message: "Configuração da API euAtendo inválida.",
      retryable: false,
    });
  }

  if ((requireCredentials || parsed.data.enabled) && !parsed.data.apiToken) {
    throw new EuAtendoProviderError({
      code: "CONFIGURATION_ERROR",
      message: "EUATENDO_API_TOKEN nao configurado no ambiente server-only.",
      retryable: false,
    });
  }

  if ((requireCredentials || parsed.data.enabled) && !parsed.data.instanceId) {
    throw new EuAtendoProviderError({
      code: "CONFIGURATION_ERROR",
      message: "EUATENDO_INSTANCE_ID nao configurado no ambiente server-only.",
      retryable: false,
    });
  }

  return parsed.data;
}

export function getActiveNotificationProvider(): WhatsAppProviderName {
  const rawProvider = getOptionalEnv("WHATSAPP_PROVIDER")?.trim().toLowerCase();

  if (rawProvider === WHATSAPP_EXTENSION_PROVIDER) {
    return WHATSAPP_EXTENSION_PROVIDER;
  }

  return EUATENDO_PROVIDER;
}
