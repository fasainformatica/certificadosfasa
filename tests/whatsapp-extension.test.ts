import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateWhatsAppExtension } from "@/lib/whatsapp/extension/config";
import {
  processWhatsAppExtensionAcks,
  reserveNextWhatsAppExtensionMessage,
} from "@/lib/whatsapp/extension/dispatcher";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

type QueryResult = {
  data: unknown;
  error: null | { message: string };
};

function basicAuth(connectedNumber: string, token: string, version = "4.1.16") {
  return `Basic ${Buffer.from(`${connectedNumber}:${token}:${version}`).toString("base64")}`;
}

function createThenableQuery(result: QueryResult, hooks?: { onUpdate?: (payload: unknown) => void }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    update: vi.fn((payload: unknown) => {
      hooks?.onUpdate?.(payload);
      return chain;
    }),
    insert: vi.fn(async (payload?: unknown) => {
      void payload;
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: QueryResult) => void) => Promise.resolve(result).then(resolve),
  };

  return chain;
}

describe("WhatsApp extension provider", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_EXTENSION_ENABLED;
    delete process.env.WHATSAPP_EXTENSION_TOKEN;
    delete process.env.WHATSAPP_EXTENSION_API_TOKEN;
    delete process.env.WHATSAPP_PROVIDER;
    vi.restoreAllMocks();
  });

  it("valida Basic Auth da extensao com token server-only", () => {
    process.env.WHATSAPP_EXTENSION_ENABLED = "true";
    process.env.WHATSAPP_EXTENSION_TOKEN = "secret-token";
    process.env.WHATSAPP_PROVIDER = WHATSAPP_EXTENSION_PROVIDER;

    const request = new Request("http://localhost/sistema/api/whatsapp/validate", {
      headers: {
        authorization: basicAuth("5511999999999", "secret-token"),
      },
    });

    const result = authenticateWhatsAppExtension(request);

    expect(result.ok).toBe(true);
    expect(result.ok && result.context.connectedNumber).toBe("5511999999999");
  });

  it("reserva no maximo uma mensagem e retorna destino internacional para a extensao", async () => {
    process.env.WHATSAPP_PROVIDER = WHATSAPP_EXTENSION_PROVIDER;
    const reservedEvent = {
      status: "reserved",
      lock_id: "11111111-1111-1111-1111-111111111111",
      event: {
        id: "event-1",
        audience: "client",
        type: "certificate_expiring",
        telefone_destino: "5511999999999",
        mensagem_renderizada: "Mensagem de aviso",
        attempt_count: 1,
        max_attempts: 3,
        idempotency_key: "key-1",
        reservation_id: "11111111-1111-1111-1111-111111111111",
      },
    };
    const rpc = vi.fn(async () => ({ data: reservedEvent, error: null }));
    const inserts: unknown[] = [];
    const admin = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "notification_settings") {
          return createThenableQuery({
            data: {
              enabled: true,
              delay_minimo_segundos: 180,
              delay_maximo_segundos: 180,
            },
            error: null,
          });
        }

        const query = createThenableQuery({ data: null, error: null });
        query.insert = vi.fn(async (payload: unknown) => {
          inserts.push(payload);
          return { data: null, error: null };
        });
        return query;
      }),
    } as unknown as Parameters<typeof reserveNextWhatsAppExtensionMessage>[0]["admin"];

    const result = await reserveNextWhatsAppExtensionMessage({
      admin,
      auth: { connectedNumber: "5511999999999", extensionVersion: "4.1.16" },
      body: { status: { stream: { info: "NORMAL", mode: "MAIN" }, queue: 0 } },
    });

    expect(rpc).toHaveBeenCalledWith("reserve_whatsapp_extension_notification_event", {
      p_lock_ttl_seconds: 345,
      p_ignore_next_allowed: false,
    });
    expect(result.messages).toEqual([
      {
        uuid: "event-1",
        destino: "+5511999999999",
        texto: "Mensagem de aviso",
        send_interval_seconds: 180,
      },
    ]);
    expect(inserts).toHaveLength(1);
  });

  it("transforma ack de envio confirmado em status sent", async () => {
    const updates: unknown[] = [];
    const event = {
      id: "event-1",
      audience: "client",
      type: "certificate_expiring",
      telefone_destino: "5511999999999",
      status: "processing",
      attempt_count: 1,
      max_attempts: 3,
      idempotency_key: "key-1",
      reservation_id: "reservation-1",
      sent_at: null,
      delivered_at: null,
      read_at: null,
      processing_started_at: "2026-07-29T10:20:00.000Z",
      dispatched_at: "2026-07-29T10:20:00.000Z",
      mensagem_renderizada: "Mensagem",
    };
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "notification_events") {
          return createThenableQuery({ data: event, error: null }, { onUpdate: (payload) => updates.push(payload) });
        }

        return createThenableQuery({ data: null, error: null });
      }),
    } as unknown as Parameters<typeof processWhatsAppExtensionAcks>[0]["admin"];

    const result = await processWhatsAppExtensionAcks({
      admin,
      auth: { connectedNumber: "5511999999999", extensionVersion: "4.1.16" },
      body: { acks: [{ uuid: "event-1", situacao: 3 }] },
    });

    expect(result).toEqual({ received: 1, processed: 1 });
    expect(updates[0]).toMatchObject({
      status: "sent",
      failed_at: null,
      next_retry_at: null,
      provider_status: "sent",
      reservation_id: null,
    });
  });
});
