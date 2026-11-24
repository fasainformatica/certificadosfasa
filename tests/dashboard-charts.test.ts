import { describe, expect, it } from "vitest";

import { getCertificateStatusHref } from "@/components/ui/charts";

describe("dashboard charts", () => {
  it("gera links corretos para os status exibidos na legenda", () => {
    expect(getCertificateStatusHref("Em dia")).toBe("/certificados?situacao=em_dia&renovacao=em_acompanhamento");
    expect(getCertificateStatusHref("Válidos")).toBe("/certificados?situacao=em_dia&renovacao=em_acompanhamento");
    expect(getCertificateStatusHref("Vence em breve")).toBe("/certificados?situacao=vence_em_breve&renovacao=em_acompanhamento");
    expect(getCertificateStatusHref("Vencem em breve")).toBe("/certificados?situacao=vence_em_breve&renovacao=em_acompanhamento");
    expect(getCertificateStatusHref("Próximos")).toBe("/certificados?situacao=vence_em_breve&renovacao=em_acompanhamento");
    expect(getCertificateStatusHref("Vencidos")).toBe("/certificados?situacao=vencido&renovacao=em_acompanhamento");
  });

  it("não inventa filtros para categorias sem destino", () => {
    expect(getCertificateStatusHref("Sem certificados")).toBeNull();
    expect(getCertificateStatusHref("0–7 dias")).toBeNull();
  });
});
