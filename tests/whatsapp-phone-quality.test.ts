import { describe, expect, it } from "vitest";

import { analyzeWhatsAppPhoneQuality, type WhatsAppPhoneQualityClient } from "@/lib/whatsapp/phone-quality";

function client(overrides: Partial<WhatsAppPhoneQualityClient>): WhatsAppPhoneQualityClient {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    nome_razao_social: overrides.nome_razao_social ?? "Cliente Teste",
    cnpj: overrides.cnpj ?? "11222333000181",
    telefone: overrides.telefone ?? null,
    whatsapp: overrides.whatsapp ?? null,
    whatsapp_notifications_enabled: overrides.whatsapp_notifications_enabled ?? true,
  };
}

describe("qualidade dos telefones do WhatsApp", () => {
  it("usa WhatsApp ou telefone como numero de envio valido", () => {
    const summary = analyzeWhatsAppPhoneQuality([
      client({ id: "1", whatsapp: "11999999999" }),
      client({ id: "2", telefone: "(15) 98888-7777" }),
    ]);

    expect(summary.readyToSendCount).toBe(2);
    expect(summary.missingPhoneCount).toBe(0);
    expect(summary.invalidPhoneCount).toBe(0);
  });

  it("separa cadastros sem telefone, invalidos e com avisos bloqueados", () => {
    const summary = analyzeWhatsAppPhoneQuality([
      client({ id: "1" }),
      client({ id: "2", whatsapp: "123" }),
      client({ id: "3", whatsapp: "11999999999", whatsapp_notifications_enabled: false }),
      client({ id: "4", whatsapp: "11988887777" }),
    ]);

    expect(summary.readyToSendCount).toBe(1);
    expect(summary.missingPhoneCount).toBe(1);
    expect(summary.invalidPhoneCount).toBe(1);
    expect(summary.notificationsDisabledCount).toBe(1);
    expect(summary.issueSamples.map((issue) => issue.type)).toEqual([
      "invalid_phone",
      "missing_phone",
      "notifications_disabled",
    ]);
  });

  it("agrupa telefones repetidos sem expor numero completo", () => {
    const summary = analyzeWhatsAppPhoneQuality([
      client({ id: "1", nome_razao_social: "Cliente A", cnpj: "11222333000181", whatsapp: "11999999999" }),
      client({ id: "2", nome_razao_social: "Cliente B", cnpj: "11222333000182", whatsapp: "+55 (11) 99999-9999" }),
      client({ id: "3", nome_razao_social: "Cliente C", cnpj: "11222333000183", whatsapp: "15988887777" }),
    ]);

    expect(summary.duplicateGroupCount).toBe(1);
    expect(summary.duplicateClientCount).toBe(2);
    expect(summary.duplicateGroups[0]).toMatchObject({
      phoneMasked: "5511*****99",
      count: 2,
    });
    expect(summary.duplicateGroups[0].phoneMasked).not.toContain("999999999");
  });

  it("informa quando a analise foi limitada pela consulta", () => {
    const summary = analyzeWhatsAppPhoneQuality([client({ id: "1", whatsapp: "11999999999" })], {
      totalCount: 3,
    });

    expect(summary.analyzedClients).toBe(1);
    expect(summary.totalClients).toBe(3);
    expect(summary.analysisLimited).toBe(true);
  });
});
