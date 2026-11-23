import { describe, expect, it } from "vitest";

import { getCertificateStatusHref } from "@/components/ui/charts";

describe("dashboard charts", () => {
  it("gera links corretos para os status exibidos na legenda", () => {
    expect(getCertificateStatusHref("Em dia")).toBe("/certificados?situacao=em_dia");
    expect(getCertificateStatusHref("Válidos")).toBe("/certificados?situacao=em_dia");
    expect(getCertificateStatusHref("Vence em breve")).toBe("/certificados?situacao=vence_em_breve");
    expect(getCertificateStatusHref("Vencem em breve")).toBe("/certificados?situacao=vence_em_breve");
    expect(getCertificateStatusHref("Próximos")).toBe("/certificados?situacao=vence_em_breve");
    expect(getCertificateStatusHref("Vencidos")).toBe("/certificados?situacao=vencido");
  });

  it("não inventa filtros para categorias sem destino", () => {
    expect(getCertificateStatusHref("Sem certificados")).toBeNull();
    expect(getCertificateStatusHref("0–7 dias")).toBeNull();
  });
});
