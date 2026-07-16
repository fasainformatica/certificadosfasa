import { describe, expect, it } from "vitest";

import {
  calculateReservationTtlSeconds,
  calculateSendDate,
  clampNotificationDelaySettings,
  formatDatePtBr,
  renderCertificateTemplate,
  validateTemplateContent,
} from "@/lib/notifications/engine";

const cliente = {
  id: "cliente-1",
  nome_razao_social: "ACME Certificados",
  cnpj: "11222333000144",
  telefone: "11999999999",
  whatsapp: null,
};

const certificado = {
  id: "cert-1",
  cliente_id: "cliente-1",
  cnpj: "11222333000144",
  nome_titular: "ACME LTDA",
  data_vencimento: "2026-08-15",
  status: "ativo",
  clientes: cliente,
};

describe("notification engine", () => {
  it("calcula data de envio por vencimento e dias restantes", () => {
    expect(calculateSendDate("2026-08-15", 30)).toBe("2026-07-16");
    expect(calculateSendDate("data-invalida", 30)).toBeNull();
    expect(formatDatePtBr("2026-08-15")).toBe("15/08/2026");
  });

  it("renderiza template permitido com dados do cliente e certificado", () => {
    const rendered = renderCertificateTemplate({
      content: "Cliente {cliente_nome}, CNPJ {cnpj}, vence em {data_vencimento}, faltam {dias}.",
      cliente,
      certificado,
      dias: 30,
    });

    expect(rendered).toContain("ACME Certificados");
    expect(rendered).toContain("11222333000144");
    expect(rendered).toContain("15/08/2026");
    expect(rendered).toContain("30");
  });

  it("bloqueia template que tenta expor segredo ou download", () => {
    expect(() => validateTemplateContent("Use a senha {cnpj}")).toThrow(/template nao pode conter/i);
    expect(() => validateTemplateContent("Baixe no link publico")).toThrow(/template nao pode conter/i);
  });

  it("normaliza delays e TTL de reserva para evitar duplicidade", () => {
    const delays = clampNotificationDelaySettings({
      delay_minimo_segundos: 1,
      delay_maximo_segundos: 2,
    });

    expect(delays.delay_minimo_segundos).toBe(180);
    expect(delays.delay_maximo_segundos).toBe(300);
    expect(calculateReservationTtlSeconds(delays)).toBeGreaterThan(300);
  });
});
