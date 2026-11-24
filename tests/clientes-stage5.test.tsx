import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildClientList, clientListHref, getClientDisplayName, getClientListNoticeStatus, parseClientListFilters, type ClientListRecord } from "@/lib/clientes/list-presentation";
import { analyzeWhatsAppPhoneQuality } from "@/lib/whatsapp/phone-quality";
import { readClientDetail, readClientList } from "@/lib/clientes/read";
import { ClientesView } from "@/app/(internal)/clientes/clientes-view";
import { clientDetailItems, ClientesTable } from "@/app/(internal)/clientes/clientes-table";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

function record(overrides: Partial<ClientListRecord> = {}): ClientListRecord {
  return { id: "synthetic-1", nome_razao_social: "Empresa Sintetica", cnpj: "11222333000181", email: null,
    telefone: null, whatsapp: null, whatsapp_notifications_enabled: true, responsavel: null,
    updated_at: "2026-11-23T12:00:00Z", certificateCount: 1, ...overrides };
}
const defaults = parseClientListFilters({});

describe("Clientes stage 5: global filtered presentation", () => {
  const records = Array.from({ length: 61 }, (_, i) => record({ id: String(i),
    nome_razao_social: `Empresa ${String(i).padStart(3, "0")}`, whatsapp: i % 2 ? "11999999999" : null,
    responsavel: i % 3 ? "Responsavel Sintetico" : " ", certificateCount: i === 60 ? 0 : 1 }));

  it("counts the complete filtered set before slicing 25 rows", () => {
    const first = buildClientList(records, defaults);
    const second = buildClientList(records, { ...defaults, page: 2 });
    expect(first).toMatchObject({ total: 61, withWhatsApp: 30, withoutContact: 31, withoutResponsible: 21, withoutCertificate: 1 });
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(25);
    expect({ ...first, rows: [], page: 1 }).toEqual({ ...second, rows: [], page: 1 });
    expect(buildClientList(records, { ...defaults, page: 900 }).page).toBe(3);
  });

  it("uses exactly the WhatsApp quality classification, including disabled and invalid", () => {
    const clients = [record(), record({ id: "2", telefone: "1133334444" }),
      record({ id: "3", whatsapp: "123", telefone: "11999999999" }),
      record({ id: "4", whatsapp: "11999999999", whatsapp_notifications_enabled: false }),
      record({ id: "5", whatsapp_notifications_enabled: false }),
      record({ id: "6", whatsapp: " ", telefone: "(15) 98888-7777" })];
    const quality = analyzeWhatsAppPhoneQuality(clients);
    const summary = buildClientList(clients, defaults);
    expect(summary.withWhatsApp).toBe(quality.readyToSendCount);
    expect(summary.withoutContact).toBe(quality.missingPhoneCount);
    expect(buildClientList(clients, { ...defaults, contato: "com_whatsapp" }).total).toBe(quality.readyToSendCount);
    expect(buildClientList(clients, { ...defaults, contato: "sem_contato" }).total).toBe(quality.missingPhoneCount);
    expect(clients.map(getClientListNoticeStatus)).toEqual(["sem_whatsapp", "avisos_permitidos", "sem_whatsapp", "avisos_desativados", "avisos_desativados", "avisos_permitidos"]);
  });

  it("combines search/contact/responsible and sorts the complete set A-Z or Z-A", () => {
    const filtered = buildClientList(records, { ...defaults, q: "Empresa", contato: "com_whatsapp", responsavel: "nao_informado" });
    expect(filtered).toMatchObject({ total: 10, withWhatsApp: 10, withoutContact: 0, withoutResponsible: 10 });
    expect(buildClientList(records, { ...defaults, ordem: "desc" }).rows[0].id).toBe("60");
    expect(buildClientList([record({ nome_razao_social: "Zeta" }), record({ id: "2", nome_razao_social: "Árvore" })], defaults).rows[0].nome_razao_social).toBe("Árvore");
    expect(buildClientList(records, { ...defaults, q: "11.222.333/0001-81" }).total).toBe(61);
    expect(buildClientList(records, { ...defaults, q: "nenhuma" }).total).toBe(0);
  });

  it("keeps filter/sort context and resets page on card/sort links", () => {
    const filters = parseClientListFilters({ q: "Teste & Cia", contato: "sem_contato", responsavel: "informado", ordem: "desc", page: "3" });
    expect(clientListHref(filters, { page: 1 })).toBe("/clientes?q=Teste+%26+Cia&contato=sem_contato&responsavel=informado&ordem=desc");
    expect(parseClientListFilters({ contato: "other", responsavel: "other", ordem: "other", page: "Infinity" })).toEqual(defaults);
  });
});

describe("Clientes stage 5: strictly scoped name cleanup", () => {
  it.each([
    ["Empresa 11222333000181", "Empresa"], ["Empresa11222333000181", "Empresa"],
    ["Empresa 11222333000182", "Empresa 11222333000182"],
    ["Empresa 11.222.333/0001-81", "Empresa 11.222.333/0001-81"],
    ["11222333000181 Empresa", "11222333000181 Empresa"],
    ["Empresa 11222333000181 extra", "Empresa 11222333000181 extra"],
    ["Empresa 911222333000181", "Empresa 911222333000181"],
    ["eCNPJ A1 - Empresa V.09.12.2026", "eCNPJ A1 - Empresa V.09.12.2026"],
  ])("only removes the matching unformatted trailing CNPJ", (input, expected) => {
    expect(getClientDisplayName(input, "11.222.333/0001-81")).toBe(expected);
  });
  it("keeps original name only in details when cleaned and never mutates the record", () => {
    const row = record({ nome_razao_social: "Empresa11222333000181" });
    expect(clientDetailItems(row)).toContainEqual({ label: "Nome original do cadastro", value: row.nome_razao_social });
    expect(clientDetailItems(record()).some((item) => item.label === "Nome original do cadastro")).toBe(false);
    const html = renderToStaticMarkup(<ClientesTable rows={[row]} filters={defaults} total={1} />);
    expect(html).toContain('title="Empresa"');
    expect(html).not.toContain(`title="${row.nome_razao_social}"`);
    expect(row.nome_razao_social).toBe("Empresa11222333000181");
  });
});

describe("Clientes stage 5: render states and boundaries", () => {
  it("renders section 9 cards, labels, sorting, details and existing certificate flow", () => {
    const html = renderToStaticMarkup(<ClientesView filters={defaults} result={buildClientList([record()], defaults)} />);
    for (const text of ["Contato e responsável de cada cliente para os avisos de vencimento.", "Total cadastrado", "Com WhatsApp", "Sem contato", "Sem responsável", "Razão social ou CNPJ", "Abrir cadastro", "Ajuda: Avisos", "E-mail", "Última atualização"]) expect(html).toContain(text);
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('href="/certificados/novo"');
    expect(html).not.toContain("Telefone cadastrado");
    expect(html).not.toContain("nesta página");
    expect(html).not.toContain(">-<");
  });
  it("separates empty, zero, absent, loading and query failure", () => {
    const empty = renderToStaticMarkup(<ClientesView filters={{ ...defaults, q: "nenhum" }} result={buildClientList([], defaults)} />);
    expect(empty).toContain(">0</div>");
    expect(empty).toContain("Nenhum cliente encontrado com esses filtros.");
    expect(empty).toContain("Limpar filtros");
    const error = renderToStaticMarkup(<ClientesView filters={defaults} result={null} />);
    expect(error).toContain("Indisponível");
    expect(error).toContain("Tentar de novo");
    expect(error).not.toContain(">0</div>");
    expect(error).not.toContain("Nenhum cliente encontrado");
    const loading = renderToStaticMarkup(<ClientesTable rows={[]} filters={defaults} total={0} state="loading" />);
    expect(loading).toContain('aria-busy="true"');
  });
  it("passes only serializable data across the server/client table boundary", () => {
    const page = readFileSync("src/app/(internal)/clientes/page.tsx", "utf8");
    const view = readFileSync("src/app/(internal)/clientes/clientes-view.tsx", "utf8");
    const table = readFileSync("src/app/(internal)/clientes/clientes-table.tsx", "utf8");
    expect(table.startsWith('"use client"')).toBe(true);
    expect(page).not.toContain("DataTable");
    expect(view).not.toContain("onSort=");
    expect(view).not.toContain("getRowKey=");
    expect(table).toContain("<DataTable");
  });
});

function mockClient(responses: Array<{ data: unknown; count?: number | null; error: unknown }>) {
  let index = 0;
  const builder = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    range: vi.fn(async () => responses[index++]), maybeSingle: vi.fn(async () => responses[index++]) };
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient<Database>, from, builder };
}

describe("Clientes stage 5: session-scoped read-only queries", () => {
  it("reads every server batch instead of silently imposing a result cap", async () => {
    const data = Array.from({ length: 500 }, (_, i) => ({ ...record({ id: String(i) }), certificados: [{ id: "a" }] }));
    const mock = mockClient([{ data, count: 501, error: null }, { data: [{ ...record({ id: "500" }), certificados: [{ id: "a" }, { id: "b" }] }], count: 501, error: null }]);
    const result = await readClientList(mock.client);
    expect(result).toHaveLength(501);
    expect(result?.[500].certificateCount).toBe(2);
    expect(mock.builder.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(mock.from).toHaveBeenCalledWith("clientes");
    expect(mock.builder.select).toHaveBeenCalledWith(expect.stringContaining("certificados(id)"), { count: "exact" });
  });
  it("never substitutes partial data or zero for read failures", async () => {
    expect(await readClientList(mockClient([{ data: [], count: 1, error: null }]).client)).toBeNull();
    expect(await readClientList(mockClient([{ data: null, count: null, error: { message: "synthetic error" } }]).client)).toBeNull();
    expect(await readClientList(mockClient([{ data: [], count: 0, error: null }]).client)).toEqual([]);
  });
  it("distinguishes missing details and errors without writing", async () => {
    expect((await readClientDetail(mockClient([{ data: null, error: null }]).client, "synthetic-id")).state).toBe("missing");
    expect((await readClientDetail(mockClient([{ data: null, error: {} }]).client, "synthetic-id")).state).toBe("error");
    const result = await readClientDetail(mockClient([{ data: { ...record(), certificados: [] }, error: null }]).client, "synthetic-id");
    expect(result).toMatchObject({ state: "ok", client: { certificateCount: 0 } });
  });
});
