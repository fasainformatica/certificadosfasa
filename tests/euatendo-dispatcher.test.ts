import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: unknown[] = [];
const rpcQueue: Array<{ data: unknown; error: null }> = [];
const sentMessages: unknown[] = [];
const providerResults: Array<{
  accepted: boolean;
  providerMessageId: string | null;
  providerStatus: string | null;
  sanitizedResponse: Record<string, never>;
  httpStatus: number;
  retryAfterSeconds: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}> = [];

function thenableQuery(result = { data: null, error: null }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({
      data: {
        enabled: true,
        delay_minimo_segundos: 30,
        delay_maximo_segundos: 60,
      },
      error: null,
    })),
    then: (resolve: (value: typeof result) => void) => Promise.resolve(result).then(resolve),
  };

  return chain;
}

const admin = {
  rpc: vi.fn(async (_name: string, args: unknown) => {
    rpcCalls.push(args);
    return rpcQueue.shift() ?? { data: { status: "empty" }, error: null };
  }),
  from: vi.fn((table: string) => {
    if (table === "notification_settings") {
      return thenableQuery();
    }

    return thenableQuery();
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => admin,
}));

vi.mock("@/lib/supabase/env", () => ({
  getOptionalEnv: (name: string) => (name === "EUATENDO_DISPATCH_MAX_EVENTS_PER_RUN" ? "3" : null),
}));

vi.mock("@/lib/whatsapp/euatendo/config", () => ({
  getEuAtendoConfigStatus: () => ({
    enabled: true,
    apiUrlConfigured: true,
    tokenConfigured: true,
    instanceConfigured: true,
  }),
}));

vi.mock("@/lib/whatsapp/euatendo/provider", () => ({
  EuAtendoWhatsAppProvider: class {
    async sendText(input: unknown) {
      sentMessages.push(input);

      return providerResults.shift() ?? {
        accepted: true,
        providerMessageId: "provider-message-id",
        providerStatus: "accepted",
        sanitizedResponse: {},
        httpStatus: 200,
        retryAfterSeconds: null,
        errorCode: null,
        errorMessage: null,
      };
    }
  },
}));

function reservedEvent(id: string) {
  return {
    status: "reserved",
    lock_id: `lock-${id}`,
    event: {
      id,
      audience: "client",
      type: "client_certificate_expiring",
      telefone_destino: "5511999999999",
      mensagem_renderizada: `Mensagem ${id}`,
      template_id: null,
      attempt_count: 1,
      max_attempts: 3,
      idempotency_key: `key-${id}`,
      reservation_id: `lock-${id}`,
    },
  };
}

describe("dispatcher euAtendo", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcQueue.length = 0;
    sentMessages.length = 0;
    providerResults.length = 0;
    vi.clearAllMocks();
  });

  it("processa lote e ignora a janela de cadencia apenas apos o primeiro envio", async () => {
    rpcQueue.push(
      { data: reservedEvent("event-1"), error: null },
      { data: reservedEvent("event-2"), error: null },
      { data: { status: "empty" }, error: null },
    );

    const { dispatchEuAtendoNotificationBatch } = await import("@/lib/whatsapp/euatendo/dispatcher");
    const result = await dispatchEuAtendoNotificationBatch(3);

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.status).toBe("completed");
    expect(sentMessages).toHaveLength(2);
    expect(rpcCalls).toMatchObject([
      { p_ignore_next_allowed: false },
      { p_ignore_next_allowed: true },
      { p_ignore_next_allowed: true },
    ]);
  });

  it("para o lote quando a reserva informa espera", async () => {
    rpcQueue.push({ data: { status: "waiting", next_allowed_send_at: "2026-07-15T12:00:00.000Z" }, error: null });

    const { dispatchEuAtendoNotificationBatch } = await import("@/lib/whatsapp/euatendo/dispatcher");
    const result = await dispatchEuAtendoNotificationBatch(3);

    expect(result.processed).toBe(0);
    expect(result.status).toBe("waiting");
    expect(sentMessages).toHaveLength(0);
  });

  it("continua o lote apos falha definitiva de uma mensagem", async () => {
    rpcQueue.push(
      { data: reservedEvent("event-1"), error: null },
      { data: reservedEvent("event-2"), error: null },
      { data: reservedEvent("event-3"), error: null },
      { data: { status: "empty" }, error: null },
    );
    providerResults.push(
      {
        accepted: true,
        providerMessageId: "provider-message-1",
        providerStatus: "accepted",
        sanitizedResponse: {},
        httpStatus: 200,
        retryAfterSeconds: null,
        errorCode: null,
        errorMessage: null,
      },
      {
        accepted: false,
        providerMessageId: null,
        providerStatus: "rejected",
        sanitizedResponse: {},
        httpStatus: 400,
        retryAfterSeconds: null,
        errorCode: "INVALID_DESTINATION",
        errorMessage: "Numero invalido.",
      },
      {
        accepted: true,
        providerMessageId: "provider-message-3",
        providerStatus: "accepted",
        sanitizedResponse: {},
        httpStatus: 200,
        retryAfterSeconds: null,
        errorCode: null,
        errorMessage: null,
      },
    );

    const { dispatchEuAtendoNotificationBatch } = await import("@/lib/whatsapp/euatendo/dispatcher");
    const result = await dispatchEuAtendoNotificationBatch(5);

    expect(result.status).toBe("completed");
    expect(result.processed).toBe(3);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(sentMessages).toHaveLength(3);
  });

  it("limita lotes grandes ao limite operacional interno", async () => {
    for (let index = 1; index <= 101; index += 1) {
      rpcQueue.push({ data: reservedEvent(`event-${index}`), error: null });
    }

    const { dispatchEuAtendoNotificationBatch } = await import("@/lib/whatsapp/euatendo/dispatcher");
    const result = await dispatchEuAtendoNotificationBatch(150);

    expect(result.max_events).toBe(100);
    expect(result.processed).toBe(100);
    expect(result.sent).toBe(100);
    expect(sentMessages).toHaveLength(100);
  });
});
