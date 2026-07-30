import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_RENEWAL_STATUS_LABEL,
  getCertificateRenewalPresentation,
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
    expect(isCertificateRenewalPlannable("sem_retorno")).toBe(false);
    expect(isCertificateRenewalPlannable("cliente_inativo")).toBe(false);
  });

  it("mantem labels operacionais claros", () => {
    expect(CERTIFICATE_RENEWAL_STATUS_LABEL.renovou_externo).toBe("Renovou em outro lugar");
    expect(CERTIFICATE_RENEWAL_STATUS_LABEL.nao_renovar).toBe("Não vai renovar agora");
    expect(CERTIFICATE_RENEWAL_STATUS_LABEL.sem_retorno).toBe("Sem retorno");
  });

  it("descreve impacto operacional sem alterar o status persistido", () => {
    expect(getCertificateRenewalPresentation("renovou_externo")).toMatchObject({
      status: "renovou_externo",
      label: "Renovou em outro lugar",
      tone: "slate",
      plannable: false,
      planningImpact: "Não entra na dashboard operacional nem no planejamento automático.",
    });
    expect(getCertificateRenewalPresentation("renovou_fasa")).toMatchObject({
      status: "renovou_fasa",
      plannable: true,
      planningImpact: "Entra na dashboard operacional e no planejamento de avisos.",
    });
    expect(getCertificateRenewalPresentation("sem_retorno")).toMatchObject({
      status: "sem_retorno",
      label: "Sem retorno",
      tone: "amber",
      plannable: false,
      planningImpact: "Não entra na dashboard operacional nem no planejamento automático.",
    });
    expect(getCertificateRenewalPresentation("valor_invalido")).toMatchObject({
      status: "em_acompanhamento",
      plannable: true,
    });
  });
});
