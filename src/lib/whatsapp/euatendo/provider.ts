import "server-only";

import { getSafeOperationalErrorMessage } from "@/lib/security/sensitive-data";

import { EuAtendoClient, normalizeEuAtendoError } from "./client";
import { getEuAtendoConfigStatus } from "./config";
import { EUATENDO_PROVIDER, type WhatsAppProvider, type WhatsAppTextInput } from "./types";

export class EuAtendoWhatsAppProvider implements WhatsAppProvider {
  private readonly client: EuAtendoClient;

  constructor(client = new EuAtendoClient()) {
    this.client = client;
  }

  async checkInstanceStatus() {
    return this.client.checkInstanceStatus();
  }

  async checkNumbers(numbers: string[]) {
    return this.client.checkNumbers(numbers);
  }

  async checkHealth() {
    const startedAt = Date.now();
    const configured = getEuAtendoConfigStatus();

    try {
      const [instances, status] = await Promise.all([this.client.listInstances(), this.client.checkInstanceStatus()]);
      const listedInstance = instances.instances.find((instance) => instance.id === this.client.configuredInstanceId) ?? null;
      const connected = status.connected && status.status === "connected";

      return {
        provider: EUATENDO_PROVIDER,
        configured,
        latencyMs: Date.now() - startedAt,
        ok: Boolean(listedInstance && connected),
        instance: status,
        listedInstance,
        errorCode: connected && listedInstance ? null : listedInstance ? "INSTANCE_DISCONNECTED" : "INSTANCE_NOT_FOUND",
        errorMessage: connected && listedInstance ? null : listedInstance ? "Instancia euAtendo desconectada." : "Instancia euAtendo nao encontrada na conta.",
      } as const;
    } catch (error) {
      const normalized = normalizeEuAtendoError(error);

      return {
        provider: EUATENDO_PROVIDER,
        configured,
        latencyMs: Date.now() - startedAt,
        ok: false,
        instance: null,
        listedInstance: null,
        errorCode: normalized.code,
        errorMessage: getSafeOperationalErrorMessage(normalized, "Nao foi possivel validar a integracao euAtendo."),
      } as const;
    }
  }

  async sendText(input: WhatsAppTextInput) {
    try {
      const result = await this.client.sendText(input.destinationNumber, input.renderedMessage);

      return {
        accepted: true,
        provider: EUATENDO_PROVIDER,
        providerMessageId: result.messageId,
        providerStatus: result.status,
        chatId: result.chatId,
        httpStatus: result.httpStatus,
        retryAfterSeconds: result.retryAfterSeconds,
        sanitizedResponse: result.sanitizedResponse,
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      const normalized = normalizeEuAtendoError(error);

      return {
        accepted: false,
        provider: EUATENDO_PROVIDER,
        providerMessageId: null,
        providerStatus: null,
        chatId: null,
        httpStatus: normalized.httpStatus,
        retryAfterSeconds: normalized.retryAfterSeconds,
        sanitizedResponse: normalized.sanitizedResponse,
        errorCode: normalized.code,
        errorMessage: getSafeOperationalErrorMessage(normalized, "Nao foi possivel enviar pela euAtendo."),
      };
    }
  }
}
