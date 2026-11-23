import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CertificateList, certificateDetails, type CertificateListRow } from "@/app/(internal)/certificados/certificate-list";
import { applyCertificateRenewal, applyCertificateSituation, certificateFilterFields, certificateListHref, parseCertificateListParams } from "@/lib/certificados/list-presentation";

const row: CertificateListRow = { id: "synthetic", cnpj: "11222333000181", nome_titular: "Empresa Sintetica", data_emissao: "2025-12-02",
  data_vencimento: "2026-12-02", status: "vencendo", renovacao_status: "em_acompanhamento", renovacao_observacao: null,
  renovacao_atualizado_em: null, nome_arquivo_original: "synthetic.pfx", ultimo_upload_em: "2026-01-02T12:00:00Z",
  created_at: "2026-01-02T12:00:00Z", updated_at: "2026-01-02T12:00:00Z",
  clientes: { nome_razao_social: "Cliente Sintetico", cnpj: "11222333000181" }, renovado: false, dias_restantes: 9 };
function render(rows: CertificateListRow[], params = {}, extra = {}) {
  return renderToStaticMarkup(<CertificateList rows={rows} filters={parseCertificateListParams(params)} canManage page={1} pageSize={25} total={rows.length} {...extra} />);
}
function recorder() {
  const calls: unknown[][] = [];
  const query: object = new Proxy({}, { get: (_, method) => (...args: unknown[]) => { calls.push([method, ...args]); return query; } });
  return { calls, query: query as Parameters<typeof applyCertificateSituation>[0] };
}

describe("Certificados stage 4", () => {
  it("renders section 8 columns and accessible actions", () => {
    const html = render([row]);
    for (const text of ["Titular", "Vencimento", "Situação", "Renovação", "Ver detalhes", "Enviar aviso para Empresa Sintetica", "Vence em 9 dias", "02/12/2026", "Vence em breve", "Titular, cliente ou CNPJ", "Mostrando 1–1 de 1 certificados"]) expect(html).toContain(text);
    expect(html).toContain('aria-sort="ascending"');
  });
  it("keeps the notice permission and renewal rule", () => {
    expect(render([row], {}, { canManage: false })).not.toContain("Enviar aviso");
    expect(render([{ ...row, renovacao_status: "cliente_inativo" }])).not.toContain("Enviar aviso");
  });
  it("keeps removed columns in the expansion", () => {
    expect(certificateDetails(row).map((item) => item.label)).toEqual(["Cliente vinculado", "CNPJ do cliente", "Orientação de renovação", "Impacto no planejamento", "Última atualização do cadastro", "Renovação"]);
    expect(certificateDetails({ ...row, renovacao_observacao: "nota", renovado: true })).toHaveLength(8);
  });
  it("separates empty filter from error", () => {
    const empty = render([], { situacao: "vencido" });
    expect(empty).toContain("Nenhum certificado encontrado com esses filtros.");
    expect(empty).toContain("Limpar filtros");
    expect(render([], {}, { error: true })).toContain("Indisponível");
  });
  it("defaults to all and accepts spec and legacy parameters", () => {
    expect(parseCertificateListParams({})).toMatchObject({ situation: "", renewal: "", direction: "asc", hasFilters: false });
    expect(parseCertificateListParams({ situacao: "em_dia" }).situation).toBe("em_dia");
    expect(parseCertificateListParams({ status: "vencendo", renovacao: "acompanhamento" })).toMatchObject({ situation: "vence_em_breve", renewal: "em_acompanhamento" });
    expect(certificateFilterFields("", "").map((field) => field.options[0].label)).toEqual(["Todas", "Todas"]);
    expect(certificateListHref("situacao=vencido&page=3", { ordem: "desc", page: null })).toBe("/certificados?situacao=vencido&ordem=desc");
  });
  it("builds queries matching the selected filters", () => {
    const expired = recorder();
    applyCertificateSituation(expired.query, "vencido", "2026-11-23", "2026-12-23");
    expect(expired.calls).toEqual([["neq", "status", "invalido"], ["lt", "data_vencimento", "2026-11-23"]]);
    const paused = recorder();
    applyCertificateRenewal(paused.query, "pausado_inativo");
    expect(paused.calls).toEqual([["in", "renovacao_status", ["nao_renovar", "cliente_inativo"]]]);
    const outside = recorder();
    applyCertificateRenewal(outside.query, "renovado_fora");
    expect(outside.calls).toEqual([["eq", "renovacao_status", "renovou_externo"]]);
  });
  it("sends nothing on render and keeps callbacks in the client component", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render([row]);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
    expect(readFileSync("src/app/(internal)/certificados/certificate-list.tsx", "utf8").startsWith('"use client"')).toBe(true);
    expect(readFileSync("src/app/(internal)/certificados/page.tsx", "utf8")).not.toContain("DataTable");
  });
});
