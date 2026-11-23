import { describe, expect, it } from "vitest";

import {
  getMetricDateContext, getOperationProviderLabel, lerCertificadosEmOperacao, lerEnviadasHoje,
  lerFalhasPendentes, lerMensagensEmProcessamento, lerMensagensFuturas, lerMensagensNaFila,
  lerMetricasOperacao, lerTotaisPorTipo, lerUltimaExecucao, lerUltimoEnvio,
} from "@/lib/metricas/operacao";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

function database(tables: Record<string, Row[]> = {}, failStatus?: string, nullCount = false) {
  const calls: Array<{ table: string; ranges: number[] }> = [];
  const admin = {
    from(table: string) {
      const filters: Filter[] = [];
      const call = { table, ranges: [] as number[] };
      calls.push(call);
      let counted = false;
      let single = false;
      let from = 0;
      let to = Infinity;
      let order: { key: string; ascending: boolean } | null = null;
      let error = false;
      const query = {
        select(_columns: string, options?: { count?: string }) { counted = Boolean(options?.count); return query; },
        eq(key: string, value: unknown) {
          if (key === "status" && value === failStatus) error = true;
          filters.push((row) => row[key] === value); return query;
        },
        neq(key: string, value: unknown) { filters.push((row) => row[key] !== value); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        not(key: string, _operator: string, value: unknown) { filters.push((row) => row[key] !== value); return query; },
        lte(key: string, value: string) { filters.push((row) => compare(key, row[key], value) <= 0); return query; },
        lt(key: string, value: string) { filters.push((row) => compare(key, row[key], value) < 0); return query; },
        gte(key: string, value: string) { filters.push((row) => compare(key, row[key], value) >= 0); return query; },
        gt(key: string, value: string) { filters.push((row) => compare(key, row[key], value) > 0); return query; },
        order(key: string, options: { ascending: boolean }) { order ??= { key, ascending: options.ascending }; return query; },
        limit(limit: number) { to = limit - 1; return query; },
        range(start: number, end: number) { from = start; to = end; call.ranges = [start, end]; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
          const rows = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
          if (order) {
            const { key, ascending } = order;
            rows.sort((a, b) => compare(key, a[key], b[key]) * (ascending ? 1 : -1));
          }
          const page = rows.slice(from, to + 1);
          return Promise.resolve({
            data: single ? page[0] ?? null : page,
            count: counted && !nullCount ? rows.length : null,
            error: error ? { message: "fixture failure" } : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof lerFalhasPendentes>[0];
  return { admin, calls };
}

function compare(key: string, left: unknown, right: unknown) {
  if (key.endsWith("_at")) return Date.parse(String(left)) - Date.parse(String(right));
  return String(left).localeCompare(String(right));
}

const events: Row[] = [
  { status: "pending", send_date: "2026-07-01", provider: "whatsapp_extension" },
  { status: "pending", send_date: "2026-11-23", provider: "euatendo" },
  { status: "retry", send_date: "2026-11-23", provider: "legacy", next_retry_at: "2026-11-25T00:00:00Z" },
  { status: "pending", send_date: "2026-11-24", provider: "whatsapp_extension" },
  { status: "reserved", send_date: "2026-11-23" },
  { status: "processing", send_date: "2026-11-24" },
  { status: "canceled", send_date: "2026-11-23", type: "certificate_expired" },
  { status: "failed", send_date: "2026-07-01", provider: "euatendo", type: "certificate_expired" },
  { status: "failed", send_date: "2026-11-24", provider: "whatsapp_extension" },
  { status: "sent", sent_at: "2026-11-23T02:59:59Z", type: "certificate_expiring" },
  { status: "sent", sent_at: "2026-11-23T03:00:00Z", provider: "whatsapp_extension" },
  { status: "sent", sent_at: "2026-11-24T02:59:59Z", provider: "euatendo" },
  { status: "sent", sent_at: "2026-11-24T03:00:00Z", provider: "legacy" },
  { status: "sent", sent_at: null },
];

describe("shared read-only operational definitions", () => {
  it("separates due pending/retry, future and in-flight; never purges old events", async () => {
    const { admin } = database({ notification_events: events });
    expect(await lerMensagensNaFila(admin, "2026-11-23")).toEqual({ pending: 2, retry: 1, total: 3 });
    expect(await lerMensagensFuturas(admin, "2026-11-23")).toBe(1);
    expect(await lerMensagensEmProcessamento(admin)).toBe(2);
  });

  it("counts current failed across providers/dates, excluding canceled and retries", async () => {
    expect(await lerFalhasPendentes(database({ notification_events: events }).admin)).toBe(2);
  });

  it("does not confuse summary-event types with certificates; includes canceled type history", async () => {
    expect(await lerTotaisPorTipo(database({ notification_events: events }).admin)).toEqual({ expired: 2, expiring: 1 });
  });

  it("uses the latest non-null sent_at across every provider, not dispatcher activity", async () => {
    const { admin } = database({ notification_events: events, whatsapp_dispatcher_state: [
      { provider: "whatsapp_extension", last_dispatch_at: "2026-11-25T00:00:00Z" },
      { provider: "euatendo", last_dispatch_at: "2026-11-26T00:00:00Z" },
    ] });
    expect(await lerUltimoEnvio(admin)).toBe("2026-11-24T03:00:00Z");
    expect(await lerUltimaExecucao(admin, "whatsapp_extension")).toMatchObject({ last_dispatch_at: "2026-11-25T00:00:00Z" });
  });

  it("uses Sao Paulo day/month at UTC rollover and excludes the next local day", async () => {
    expect(getMetricDateContext(new Date("2026-12-01T02:59:59Z"))).toMatchObject({
      today: "2026-11-30", dayStart: "2026-11-30T00:00:00-03:00",
      dayEnd: "2026-12-01T00:00:00-03:00", monthStart: "2026-11-01T00:00:00-03:00",
    });
    const dates = getMetricDateContext(new Date("2026-11-23T12:00:00Z"));
    expect(await lerEnviadasHoje(database({ notification_events: events }).admin, dates)).toBe(2);
  });

  it("distinguishes confirmed zero/absence from query errors and missing counts", async () => {
    const { admin } = database();
    expect(await lerFalhasPendentes(admin)).toBe(0);
    expect(await lerUltimoEnvio(admin)).toBeNull();
    expect(await lerUltimaExecucao(admin, "whatsapp_extension")).toBeNull();
    await expect(lerFalhasPendentes(database({}, "failed").admin)).rejects.toThrow("Metricas indisponiveis");
    await expect(lerFalhasPendentes(database({}, undefined, true).admin)).rejects.toThrow("Metricas indisponiveis");
  });

  it("isolates failed reads without discarding available metrics or inventing zero", async () => {
    const result = await lerMetricasOperacao(database({ notification_events: events }, "failed").admin,
      "whatsapp_extension", new Date("2026-11-23T12:00:00Z"));
    expect(result.failed).toBeNull();
    expect(result.queue?.total).toBe(3);
    expect(result.processing).toBe(2);
    expect(result.unavailable).toEqual(["failed"]);
  });

  it("excludes inactive/non-plannable/invalid certificates and reads beyond 1000", async () => {
    const certificates = Array.from({ length: 1101 }, (_, index) => ({
      id: String(index).padStart(4, "0"), status: "ativo", renovacao_status: "em_acompanhamento", data_vencimento: "2027-01-01",
    }));
    const { admin, calls } = database({ certificados: [...certificates,
      { id: "inactive", status: "ativo", renovacao_status: "cliente_inativo" },
      { id: "paused", status: "ativo", renovacao_status: "nao_renovar" },
      { id: "invalid", status: "invalido", renovacao_status: "em_acompanhamento" },
      { id: "renewed", status: "vencido", renovacao_status: "renovou_fasa" },
    ] });
    expect((await lerCertificadosEmOperacao(admin)).certificates).toHaveLength(1102);
    expect(calls.filter((call) => call.table === "certificados").map((call) => call.ranges))
      .toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it("corrects only the display label, preserving provider identifiers", () => {
    expect(getOperationProviderLabel("whatsapp_extension")).toBe("Extens\u00e3o do Chrome");
    expect(getOperationProviderLabel("euatendo")).toBe("WhatsApp");
  });
});
