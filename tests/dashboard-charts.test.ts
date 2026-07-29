import { describe, expect, it } from "vitest";

import { getCertificateStatusHref } from "@/components/ui/charts";

describe("dashboard charts", () => {
  it("gera links corretos para os status exibidos na legenda", () => {
    expect(getCertificateStatusHref("Válidos")).toBe("/certificados?status=ativo&renovacao=acompanhamento");
    expect(getCertificateStatusHref("Vencem em breve")).toBe("/certificados?status=vencendo&renovacao=acompanhamento");
    expect(getCertificateStatusHref("Próximos")).toBe("/certificados?status=vencendo&renovacao=acompanhamento");
    expect(getCertificateStatusHref("Vencidos")).toBe("/certificados?status=vencido&renovacao=acompanhamento");
  });
});
