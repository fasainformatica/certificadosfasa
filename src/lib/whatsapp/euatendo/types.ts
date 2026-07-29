import type { Json } from "@/lib/supabase/database.types";
import { EUATENDO_PROVIDER } from "@/lib/whatsapp/providers";

export { EUATENDO_PROVIDER, WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";
export type { WhatsAppProviderName } from "@/lib/whatsapp/providers";

export type EuAtendoErrorCode =
  | "CONFIGURATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "INSTANCE_NOT_FOUND"
  | "INSTANCE_DISCONNECTED"
  | "INVALID_NUMBER"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_RESPONSE"
  | "PERMANENT_PROVIDER_ERROR"
  | "TEMPORARY_PROVIDER_ERROR";

export type EuAtendoConfigStatus = {
  enabled: boolean;
  apiUrlConfigured: boolean;
  tokenConfigured: boolean;
  instanceConfigured: boolean;
};

export type EuAtendoInstanceStatus = {
  success: boolean;
  connected: boolean;
  status: string | null;
  profileName: string | null;
  phoneNumber: string | null;
  serverType: string | null;
  cached: boolean | null;
};

export type EuAtendoListedInstance = {
  id: string;
  name: string | null;
  phoneNumber: string | null;
  profileName: string | null;
  status: string | null;
  serverType: string | null;
  createdAt: string | null;
};

export type EuAtendoNumberCheck = {
  number: string;
  exists: boolean | null;
  jid: string | null;
};

export type WhatsAppTextInput = {
  eventId?: string;
  idempotencyKey?: string | null;
  destinationNumber: string;
  renderedMessage: string;
};

export type WhatsAppSendResult = {
  accepted: boolean;
  provider: typeof EUATENDO_PROVIDER;
  providerMessageId: string | null;
  providerStatus: string | null;
  chatId: string | null;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  sanitizedResponse: Json;
  errorCode: EuAtendoErrorCode | null;
  errorMessage: string | null;
};

export type WhatsAppHealthResult = {
  provider: typeof EUATENDO_PROVIDER;
  configured: EuAtendoConfigStatus;
  latencyMs: number | null;
  ok: boolean;
  instance: EuAtendoInstanceStatus | null;
  listedInstance: EuAtendoListedInstance | null;
  errorCode: EuAtendoErrorCode | null;
  errorMessage: string | null;
};

export interface WhatsAppProvider {
  sendText(input: WhatsAppTextInput): Promise<WhatsAppSendResult>;
  checkHealth(): Promise<WhatsAppHealthResult>;
  checkInstanceStatus(): Promise<EuAtendoInstanceStatus>;
  checkNumbers(numbers: string[]): Promise<EuAtendoNumberCheck[]>;
  getMessageStatus?(messageId: string): Promise<Json>;
}
