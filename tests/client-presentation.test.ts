import { describe, expect, it } from "vitest";

import {
  buildClientPageSummary,
  getClientContactSummary,
  getClientNoticePresentation,
  hasClientPhone,
} from "@/lib/clientes/presentation";

describe("client presentation", () => {
  it("identifica telefone preferencial para aviso", () => {
    expect(hasClientPhone({ whatsapp: "11999999999", telefone: null })).toBe(true);
    expect(hasClientPhone({ whatsapp: null, telefone: "(11) 3333-4444" })).toBe(true);
    expect(hasClientPhone({ whatsapp: " ", telefone: null })).toBe(false);
  });

  it("descreve status de avisos sem depender somente de cor", () => {
    expect(getClientNoticePresentation({ whatsapp: "11999999999", telefone: null, whatsapp_notifications_enabled: true })).toMatchObject({
      label: "Avisos permitidos",
      tone: "green",
    });
    expect(getClientNoticePresentation({ whatsapp: null, telefone: null, whatsapp_notifications_enabled: true })).toMatchObject({
      label: "Sem WhatsApp",
      tone: "red",
    });
    expect(getClientNoticePresentation({ whatsapp: "11999999999", telefone: null, whatsapp_notifications_enabled: false })).toMatchObject({
      label: "Avisos pausados",
      tone: "amber",
    });
  });

  it("gera resumo da pagina atual de clientes", () => {
    const summary = buildClientPageSummary(
      [
        { email: "a@fasa.com", telefone: null, whatsapp: "11999999999", whatsapp_notifications_enabled: true, responsavel: "Ana" },
        { email: null, telefone: null, whatsapp: null, whatsapp_notifications_enabled: true, responsavel: null },
        { email: "b@fasa.com", telefone: "1133334444", whatsapp: null, whatsapp_notifications_enabled: false, responsavel: "" },
      ],
      12,
    );

    expect(summary).toMatchObject({
      totalClients: 12,
      currentPageClients: 3,
      withPhone: 2,
      withoutPhone: 1,
      pausedNotices: 1,
      withoutResponsible: 2,
    });
  });

  it("resume completude de contato", () => {
    expect(getClientContactSummary({ email: "a@fasa.com", whatsapp: "11999999999", telefone: null }).label).toBe("Contato completo");
    expect(getClientContactSummary({ email: null, whatsapp: "11999999999", telefone: null }).label).toBe("Telefone cadastrado");
    expect(getClientContactSummary({ email: "a@fasa.com", whatsapp: null, telefone: null }).label).toBe("Somente e-mail");
    expect(getClientContactSummary({ email: null, whatsapp: null, telefone: null }).label).toBe("Sem contato");
  });
});
