import "server-only";

import type { Json } from "@/lib/supabase/database.types";

import { getEuAtendoConfig } from "./config";
import { EuAtendoProviderError, isEuAtendoProviderError } from "./errors";
import {
  checkNumberResponseSchema,
  instanceStatusResponseSchema,
  listInstancesResponseSchema,
  sendTextResponseSchema,
} from "./schemas";

type RequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  timeoutMs?: number;
};

const DEFAULT_STATUS_TIMEOUT_MS = 10_000;
const DEFAULT_SEND_TIMEOUT_MS = 20_000;

function parseRetryAfter(value: string | null) {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.ceil(numeric);
  }

  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  return null;
}

export function maskSensitiveProviderData(value: unknown): Json {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [secret]")
      .replace(/\b55\d{10,11}\b/g, "[telefone]")
      .slice(0, 2000);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => maskSensitiveProviderData(item));
  }

  if (typeof value === "object") {
    const result: Record<string, Json> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      const lower = key.toLowerCase();
      if (lower.includes("token") || lower.includes("authorization") || lower.includes("secret") || lower.includes("key")) {
        result[key] = "[secret]";
      } else {
        result[key] = maskSensitiveProviderData(entry);
      }
    }
    return result;
  }

  return String(value).slice(0, 500);
}

function codeFromStatus(status: number): {
  code:
    | "AUTHENTICATION_ERROR"
    | "INSTANCE_NOT_FOUND"
    | "RATE_LIMITED"
    | "PROVIDER_UNAVAILABLE"
    | "PERMANENT_PROVIDER_ERROR"
    | "TEMPORARY_PROVIDER_ERROR";
  retryable: boolean;
  message: string;
} {
  if (status === 401) {
    return { code: "AUTHENTICATION_ERROR", retryable: false, message: "Token da API euAtendo inválido ou expirado." };
  }

  if (status === 404) {
    return { code: "INSTANCE_NOT_FOUND", retryable: false, message: "Instancia euAtendo nao encontrada." };
  }

  if (status === 429) {
    return { code: "RATE_LIMITED", retryable: true, message: "Limite de requisicoes da API euAtendo atingido." };
  }

  if ([500, 502, 503, 504].includes(status)) {
    return { code: "PROVIDER_UNAVAILABLE", retryable: true, message: "API euAtendo temporariamente indisponível." };
  }

  if (status >= 400 && status < 500) {
    return { code: "PERMANENT_PROVIDER_ERROR", retryable: false, message: "Requisição rejeitada pela API euAtendo." };
  }

  return { code: "TEMPORARY_PROVIDER_ERROR", retryable: true, message: "Falha temporária na API euAtendo." };
}

export class EuAtendoClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly instanceId: string;

  constructor() {
    const config = getEuAtendoConfig({ requireCredentials: true });

    if (!config.apiToken || !config.instanceId) {
      throw new EuAtendoProviderError({
        code: "CONFIGURATION_ERROR",
        message: "Configuração euAtendo incompleta.",
        retryable: false,
      });
    }

    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiToken = config.apiToken;
    this.instanceId = config.instanceId;
  }

  get configuredInstanceId() {
    return this.instanceId;
  }

  async request(path: string, options: RequestOptions = {}) {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_STATUS_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new EuAtendoProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "Tempo limite excedido ao chamar a API euAtendo.",
          retryable: true,
        });
      }

      throw new EuAtendoProviderError({
        code: "PROVIDER_UNAVAILABLE",
        message: "Não foi possível conectar na API euAtendo.",
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 500) };
      }
    }

    if (!response.ok) {
      const mapped = codeFromStatus(response.status);
      throw new EuAtendoProviderError({
        code: mapped.code,
        message: mapped.message,
        httpStatus: response.status,
        retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
        retryable: mapped.retryable,
        sanitizedResponse: maskSensitiveProviderData(payload),
      });
    }

    return {
      payload,
      status: response.status,
      retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
      sanitizedResponse: maskSensitiveProviderData(payload),
    };
  }

  async listInstances() {
    const { payload } = await this.request("/list-instances", { method: "GET", timeoutMs: DEFAULT_STATUS_TIMEOUT_MS });
    const parsed = listInstancesResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new EuAtendoProviderError({
        code: "INVALID_PROVIDER_RESPONSE",
        message: "Resposta invalida ao listar instancias euAtendo.",
        retryable: false,
        sanitizedResponse: maskSensitiveProviderData(payload),
      });
    }

    return parsed.data;
  }

  async checkInstanceStatus() {
    const { payload } = await this.request("/check-instance-status", {
      method: "POST",
      timeoutMs: DEFAULT_STATUS_TIMEOUT_MS,
      body: { instanceId: this.instanceId },
    });
    const parsed = instanceStatusResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new EuAtendoProviderError({
        code: "INVALID_PROVIDER_RESPONSE",
        message: "Resposta invalida ao consultar status da instancia euAtendo.",
        retryable: false,
        sanitizedResponse: maskSensitiveProviderData(payload),
      });
    }

    return parsed.data;
  }

  async checkNumbers(numbers: string[]) {
    const { payload } = await this.request("/check-number-whatsapp", {
      method: "POST",
      timeoutMs: DEFAULT_STATUS_TIMEOUT_MS,
      body: { instanceId: this.instanceId, numbers },
    });
    const parsed = checkNumberResponseSchema.safeParse(payload);

    if (!parsed.success) {
      throw new EuAtendoProviderError({
        code: "INVALID_PROVIDER_RESPONSE",
        message: "Resposta invalida ao verificar numero no WhatsApp.",
        retryable: false,
        sanitizedResponse: maskSensitiveProviderData(payload),
      });
    }

    return parsed.data;
  }

  async sendText(number: string, text: string) {
    const result = await this.request("/send-text-message", {
      method: "POST",
      timeoutMs: DEFAULT_SEND_TIMEOUT_MS,
      body: { instanceId: this.instanceId, number, text },
    });
    const parsed = sendTextResponseSchema.safeParse(result.payload);

    if (!parsed.success) {
      throw new EuAtendoProviderError({
        code: "INVALID_PROVIDER_RESPONSE",
        message: "Resposta invalida ao enviar mensagem pela euAtendo.",
        retryable: false,
        httpStatus: result.status,
        sanitizedResponse: result.sanitizedResponse,
      });
    }

    if (!parsed.data.success) {
      throw new EuAtendoProviderError({
        code: "PERMANENT_PROVIDER_ERROR",
        message: parsed.data.message ?? "API euAtendo recusou o envio.",
        retryable: false,
        httpStatus: result.status,
        sanitizedResponse: result.sanitizedResponse,
      });
    }

    return {
      ...parsed.data,
      httpStatus: result.status,
      retryAfterSeconds: result.retryAfterSeconds,
      sanitizedResponse: result.sanitizedResponse,
    };
  }
}

export function normalizeEuAtendoError(error: unknown) {
  if (isEuAtendoProviderError(error)) {
    return error;
  }

  return new EuAtendoProviderError({
    code: "TEMPORARY_PROVIDER_ERROR",
    message: "Falha inesperada na API euAtendo.",
    retryable: true,
  });
}
