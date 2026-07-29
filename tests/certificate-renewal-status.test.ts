import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_RENEWAL_STATUS_LABEL,
  isCertificateRenewalPlannable,
  parseCertificateRenewalFilter,
  PLANNABLE_CERTIFICATE_RENEWAL_STATUSES,
} from "@/lib/certificados/renewal-status";

describe("situacao de renovacao do certificado", () => {
  it("usa acompanhamento como filtro padrao", () => {
    expect(parseCertificateRenewalFilter(null)).toBe("acompanhamento");
    expect(parseCertificateRenewalFilter("valor_invalido")).toBe("acompanhamento");
    expect(parseCertificateRenewalFilter("renovou_externo")).toBe("renovou_externo");
  });

  it("define quais situacoes ainda podem gerar avisos", () => {
    expect(PLANNABLE_CERTIFICATE_RENEWAL_STATUSES).toEqual(["em_acompanhamento", "renovou_fasa"]);
    expect(isCertificateRenewalPlannable("em_acompanhamento")).toBe(true);
    expect(isCertificateRenewalPlannable("renovou_fasa")).toBe(true);
    expect(isCertificateRenewalPlannable("renovou_externo")).toBe(false);
    expect(isCertificateRenewalPlannable("cliente_inativo")).toBe(false);
  });

  it("mantem labels operacionais claros", () => {
    expect(CERTIFICATE_RENEWAL_STATUS_LABEL.renovou_externo).toBe("Renovou em outro lugar");
    expect(CERTIFICATE_RENEWAL_STATUS_LABEL.nao_renovar).toBe("Não vai renovar agora");
  });
});
